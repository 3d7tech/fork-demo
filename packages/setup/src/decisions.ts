// Decisions people have seen, saved and acted on (step 8). Everything runs as the signed-in person,
// so row-level security decides what they can read: an employee's runs, saved decisions and
// requests are theirs alone, and owners get counts only, with the group-size rule.
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { Fact } from '@fork/spec';

/** The parts of a pipeline answer this module stores. Kept loose so it doesn't depend on the pipeline package. */
export interface StoredAnswer {
  kind: 'decision' | 'message';
  runId?: string;
  family?: string;
  reason?: string;
  calc?: { rulePack: { id: string } };
}

export async function recordRun(db: ForkDatabase, ctx: RequestContext, run: { question: string; answer: StoredAnswer; employeeId?: string | null }): Promise<string> {
  if (ctx.role === 'accountant') throw new Error('Accountants don’t ask questions as a company member.');
  const id = run.answer.runId ?? crypto.randomUUID();
  await db.asMember(ctx, (tx) =>
    tx.insert(s.decisionRun).values({
      id,
      companyId: ctx.companyId,
      userId: ctx.userId,
      employeeId: run.employeeId ?? null,
      audience: ctx.role as 'employee' | 'owner',
      family: run.answer.family ?? null,
      kind: run.answer.kind === 'decision' ? 'decision' : (run.answer.reason ?? 'message'),
      question: run.question.slice(0, 2000),
      answer: run.answer,
      rulePack: run.answer.calc?.rulePack.id ?? null,
    }),
  );
  return id;
}

/** A stored answer, if the reader may see it (their own, or a company decision for owners). */
export async function loadRun<T = unknown>(db: ForkDatabase, ctx: RequestContext, runId: string): Promise<T | null> {
  if (!/^[0-9a-f-]{36}$/.test(runId)) return null;
  const [row] = await db.asMember(ctx, (tx) => tx.select({ answer: s.decisionRun.answer }).from(s.decisionRun).where(eq(s.decisionRun.id, runId)));
  return (row?.answer as T) ?? null;
}

/** Replace a stored screen after the person changed a lever and the words were rewritten. */
export async function updateRun(db: ForkDatabase, ctx: RequestContext, runId: string, answer: StoredAnswer): Promise<void> {
  await db.asMember(ctx, (tx) => tx.update(s.decisionRun).set({ answer }).where(eq(s.decisionRun.id, runId)));
}

/** The person's own recent questions. */
export async function myRuns(db: ForkDatabase, ctx: RequestContext, limit = 20) {
  return db.asMember(ctx, (tx) =>
    tx
      .select({ id: s.decisionRun.id, question: s.decisionRun.question, kind: s.decisionRun.kind, family: s.decisionRun.family, createdAt: s.decisionRun.createdAt })
      .from(s.decisionRun)
      .where(eq(s.decisionRun.userId, ctx.userId))
      .orderBy(desc(s.decisionRun.createdAt))
      .limit(limit),
  );
}

// ---------- Saved decisions ----------

export interface Watched {
  facts: Record<string, string | number | boolean>;
  rulePack: string;
  verdict: string;
  /** The headline outputs when saved, to tell the person what moved. */
  headline: Record<string, number>;
}

export async function saveDecision(db: ForkDatabase, ctx: RequestContext, runId: string, title: string, watched: Watched): Promise<void> {
  await db.asMember(ctx, async (tx) => {
    await tx
      .insert(s.savedDecision)
      .values({ companyId: ctx.companyId, userId: ctx.userId, runId, title: title.slice(0, 200), watched })
      .onConflictDoUpdate({ target: s.savedDecision.runId, set: { watched, title: title.slice(0, 200), changeNote: null } });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'decision.saved', targetType: 'decision_run', targetId: runId });
  });
}

export async function listSaved(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, (tx) => tx.select().from(s.savedDecision).where(eq(s.savedDecision.userId, ctx.userId)).orderBy(desc(s.savedDecision.createdAt)));
}

export async function markChecked(db: ForkDatabase, ctx: RequestContext, savedId: string, changeNote: string | null): Promise<void> {
  await db.asMember(ctx, (tx) => tx.update(s.savedDecision).set({ lastCheckedAt: new Date(), ...(changeNote !== null ? { changeNote } : {}) }).where(eq(s.savedDecision.id, savedId)));
}

export async function clearChange(db: ForkDatabase, ctx: RequestContext, savedId: string): Promise<void> {
  await db.asMember(ctx, (tx) => tx.update(s.savedDecision).set({ changeNote: null }).where(eq(s.savedDecision.id, savedId)));
}

export async function removeSaved(db: ForkDatabase, ctx: RequestContext, savedId: string): Promise<void> {
  await db.asMember(ctx, (tx) => tx.delete(s.savedDecision).where(eq(s.savedDecision.id, savedId)));
}

/** Facts as a plain record, for the saved snapshot. */
export const factRecord = (facts: Fact[]) => Object.fromEntries(facts.map((f) => [f.id, f.value]));

// ---------- Requests to the accountant ----------

export type RequestStatus = 'draft' | 'sent' | 'acknowledged' | 'done' | 'declined';

export async function createRequest(
  db: ForkDatabase,
  ctx: RequestContext,
  r: { runId: string; kind: 'payroll.request' | 'plan.send'; family: string; summary: string; figures?: Record<string, number> },
): Promise<{ id: string; accountants: string[] }> {
  return db.asMember(ctx, async (tx) => {
    const accountants = (await tx.execute<{ email: string }>(sql`select email from fork_company_accountants()`)).rows.map((x) => x.email);
    const [row] = await tx
      .insert(s.actionRequest)
      .values({
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        runId: r.runId,
        audience: ctx.role as 'employee' | 'owner',
        kind: r.kind,
        family: r.family,
        summary: r.summary,
        figures: r.figures ?? null,
        // Without an accountant on Fork yet, the request waits as a draft.
        status: accountants.length ? 'sent' : 'draft',
      })
      .returning({ id: s.actionRequest.id });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'request.created', targetType: 'action_request', targetId: row!.id, detail: { kind: r.kind, family: r.family, sent: accountants.length > 0 } });
    return { id: row!.id, accountants };
  });
}

export async function myRequests(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, (tx) =>
    tx
      .select({ id: s.actionRequest.id, summary: s.actionRequest.summary, status: s.actionRequest.status, note: s.actionRequest.accountantNote, family: s.actionRequest.family, createdAt: s.actionRequest.createdAt, statusChangedAt: s.actionRequest.statusChangedAt })
      .from(s.actionRequest)
      .where(eq(s.actionRequest.createdBy, ctx.userId))
      .orderBy(desc(s.actionRequest.createdAt)),
  );
}

// ---------- The accountant's inbox ----------

export async function accountantInbox(db: ForkDatabase, ctx: RequestContext) {
  if (ctx.role !== 'accountant') return [];
  return db.asMember(ctx, (tx) =>
    tx
      .select({
        id: s.actionRequest.id,
        companyName: s.company.name,
        summary: s.actionRequest.summary,
        kind: s.actionRequest.kind,
        status: s.actionRequest.status,
        note: s.actionRequest.accountantNote,
        createdAt: s.actionRequest.createdAt,
      })
      .from(s.actionRequest)
      .innerJoin(s.company, eq(s.company.id, s.actionRequest.companyId))
      .where(sql`${s.actionRequest.status} <> 'draft'`)
      .orderBy(desc(s.actionRequest.createdAt)),
  );
}

/** An accountant updates a request. Returns the requester's email so they can be told. */
export async function updateRequestStatus(db: ForkDatabase, ctx: RequestContext, requestId: string, status: Exclude<RequestStatus, 'draft' | 'sent'>, note: string | null): Promise<string | null> {
  if (ctx.role !== 'accountant') throw new Error('Only the accountant updates a request.');
  return db.asMember(ctx, async (tx) => {
    const done = await tx
      .update(s.actionRequest)
      .set({ status, accountantNote: note?.slice(0, 1000) ?? null, statusChangedAt: new Date() })
      .where(eq(s.actionRequest.id, requestId))
      .returning({ id: s.actionRequest.id });
    if (!done.length) throw new Error('That request wasn’t found.');
    const email = (await tx.execute<{ email: string | null }>(sql`select fork_requester_email(${requestId}::uuid) as email`)).rows[0]?.email ?? null;
    return email;
  });
}

// ---------- The owner's dashboard ----------

export const GROUP_SIZE = 5;

export async function ownerDashboard(db: ForkDatabase, ctx: RequestContext, ssFamily = 'pension.salary_sacrifice_switch') {
  if (ctx.role !== 'owner') throw new Error('The dashboard is for owners.');
  return db.asMember(ctx, async (tx) => {
    const topics = (await tx.execute<{ family: string; people: number }>(sql`select family, people from fork_topic_counts(90) order by people desc`)).rows;
    const takeup = (await tx.execute<{ people: number; saving_per_year: string; saving_to_date: string }>(sql`select * from fork_takeup(${ssFamily})`)).rows[0] ?? null;
    const plans = await tx
      .select({ id: s.actionRequest.id, summary: s.actionRequest.summary, status: s.actionRequest.status, note: s.actionRequest.accountantNote, createdAt: s.actionRequest.createdAt })
      .from(s.actionRequest)
      .where(and(eq(s.actionRequest.audience, 'owner'), eq(s.actionRequest.companyId, ctx.companyId)))
      .orderBy(desc(s.actionRequest.createdAt))
      .limit(10);
    const [{ joined } = { joined: 0 }] = await tx.select({ joined: sql<number>`count(*)::int` }).from(s.membership).where(and(eq(s.membership.companyId, ctx.companyId), eq(s.membership.role, 'employee')));
    return {
      joined,
      topics,
      switched: takeup ? { people: takeup.people, savingPerYear: Number(takeup.saving_per_year), savingToDate: Number(takeup.saving_to_date) } : null,
      plans,
    };
  });
}

// ---------- A person's own data ----------

/** Everything Fork holds that is this person's own: questions, answers, saved decisions, requests. */
export async function exportMyData(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, async (tx) => ({
    exportedAt: new Date().toISOString(),
    questionsAndAnswers: await tx.select().from(s.decisionRun).where(eq(s.decisionRun.userId, ctx.userId)),
    savedDecisions: await tx.select().from(s.savedDecision).where(eq(s.savedDecision.userId, ctx.userId)),
    requests: await tx.select().from(s.actionRequest).where(eq(s.actionRequest.createdBy, ctx.userId)),
  }));
}

/** Delete this person's questions and answers (and the saved decisions built on them). Requests stay with the accountant. */
export async function deleteMyQuestions(db: ForkDatabase, ctx: RequestContext): Promise<number> {
  return db.asMember(ctx, async (tx) => {
    const gone = await tx.delete(s.decisionRun).where(eq(s.decisionRun.userId, ctx.userId)).returning({ id: s.decisionRun.id });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'data.questions_deleted', detail: { count: gone.length } });
    return gone.length;
  });
}
