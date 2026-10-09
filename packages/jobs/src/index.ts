// Scheduled work (step 8): re-check saved decisions, "your pay, explained" each month, and the
// owner's monthly report. Every email is written by code from stored figures; no model is used.
//
// The job lists who to act for with the owner connection (ids only), then reads and writes each
// person's data as that person, so row-level security still decides what it can see.
import { asAdmin, schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import { FAMILIES, formatGBP, formatPct, recalculate, type DecisionScreen, type Subject } from '@fork/pipeline';
import { DbFactStore, GROUP_SIZE, listSaved, loadRun, markChecked, ownerDashboard, sendMail, setupProgress } from '@fork/setup';
import { desc, eq, sql } from 'drizzle-orm';

export interface JobDeps {
  db: ForkDatabase;
  adminUrl: string;
  baseUrl: string;
}

interface Member {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: 'owner' | 'employee';
  employeeId: string | null;
}

async function members(adminUrl: string, companyId?: string): Promise<Member[]> {
  return asAdmin(adminUrl, async (db) => {
    const rows = await db
      .select({ userId: s.membership.userId, email: s.appUser.email, companyId: s.membership.companyId, companyName: s.company.name, role: s.membership.role, employeeId: s.membership.employeeId })
      .from(s.membership)
      .innerJoin(s.appUser, eq(s.appUser.id, s.membership.userId))
      .innerJoin(s.company, eq(s.company.id, s.membership.companyId))
      .where(companyId ? eq(s.membership.companyId, companyId) : sql`true`);
    return rows.filter((r): r is Member => r.role === 'owner' || r.role === 'employee');
  });
}

const ctxOf = (m: Member): RequestContext => ({ userId: m.userId, companyId: m.companyId, role: m.role });
const subjectOf = (m: Member): Subject => ({ audience: m.role, companyId: m.companyId, ...(m.employeeId ? { employeeId: m.employeeId } : {}) });

// ---------- Saved decisions ----------

/** What changed between the saved answer and today's, in plain words. Null if nothing that matters moved. */
export function describeChange(screen: DecisionScreen, saved: { facts: Record<string, unknown>; rulePack: string; verdict: string; headline: Record<string, number> }, now: { verdict: string; outputs: Record<string, { value: number; label: string; unit: string }>; facts: Record<string, unknown>; rulePack: string }): string | null {
  const family = FAMILIES[screen.family];
  const parts: string[] = [];
  for (const def of family?.facts ?? []) {
    const before = saved.facts[def.id];
    const after = now.facts[def.id];
    if (before !== undefined && after !== undefined && before !== after) {
      const show = (v: unknown) => (typeof v === 'number' ? (def.unit === 'GBP' ? formatGBP(v) : def.unit === 'pct' ? formatPct(v) : String(v)) : String(v));
      parts.push(`${def.label} changed from ${show(before)} to ${show(after)}.`);
    }
  }
  if (saved.rulePack !== now.rulePack) parts.push('The tax rules Fork uses have been updated.');
  const moved = Object.entries(saved.headline).filter(([k, v]) => now.outputs[k] && Math.round(now.outputs[k]!.value) !== Math.round(v));
  for (const [k, v] of moved.slice(0, 2)) {
    const o = now.outputs[k]!;
    const show = (x: number) => (o.unit === 'GBP' ? formatGBP(x) : o.unit === 'pct' ? formatPct(x) : String(Math.round(x)));
    parts.push(`${o.label}: now ${show(o.value)}, was ${show(v)}.`);
  }
  // Only tell people when their result moved; a changed input with the same result isn't news.
  if (!moved.length && now.verdict === saved.verdict) return null;
  if (now.verdict !== saved.verdict) parts.unshift('The answer has changed.');
  return parts.join(' ');
}

/** Re-run one person's saved decisions with today's facts and rules. Returns how many changed. */
export async function recheckSaved(deps: JobDeps, m: Member): Promise<number> {
  const ctx = ctxOf(m);
  const subject = subjectOf(m);
  const store = new DbFactStore(deps.db, ctx);
  let changed = 0;
  for (const saved of await listSaved(deps.db, ctx)) {
    const screen = await loadRun<DecisionScreen>(deps.db, ctx, saved.runId);
    const family = screen?.kind === 'decision' ? FAMILIES[screen.family] : undefined;
    if (!screen || !family) continue;
    const facts = await store.get(subject, family.facts.map((f) => f.id));
    if (facts.length < family.facts.length) {
      await markChecked(deps.db, ctx, saved.id, null);
      continue;
    }
    const data = family.needs?.includes('payrollRows') ? { payrollRows: await store.payrollRows(subject) } : {};
    const r = recalculate(screen, facts, {}, data);
    const note = describeChange(screen, saved.watched, {
      verdict: r.calc.verdict,
      outputs: r.calc.outputs,
      facts: Object.fromEntries(facts.map((f) => [f.id, f.value])),
      rulePack: `${r.calc.rulePack.id}@${r.calc.rulePack.version}`,
    });
    const isNew = note !== null && note !== saved.changeNote;
    await markChecked(deps.db, ctx, saved.id, isNew ? note : null);
    if (isNew) {
      changed++;
      await sendMail({ to: m.email, subject: `Something changed: ${saved.title}`, text: `${note}\n\nSee the new answer in Fork:\n${deps.baseUrl}/decisions` });
    }
  }
  return changed;
}

// ---------- Your pay, explained ----------

/** The monthly payday email for one employee, from their two latest pay records. Null if there's no pay record. */
export async function payslipEmail(deps: JobDeps, m: Member): Promise<{ subject: string; text: string } | null> {
  if (m.role !== 'employee' || !m.employeeId) return null;
  return deps.db.asMember(ctxOf(m), async (tx) => {
    const pay = await tx.select().from(s.payRecord).where(eq(s.payRecord.employeeId, m.employeeId!)).orderBy(desc(s.payRecord.periodEnd), desc(s.payRecord.createdAt)).limit(2);
    const [scheme] = await tx.select().from(s.pensionScheme).where(eq(s.pensionScheme.companyId, m.companyId));
    const [now, before] = pay;
    if (!now) return null;
    const month = new Date(`${now.periodEnd}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const salary = Number(now.annualSalary);
    const pension = now.pensionPct ?? scheme?.employeeDefaultPct ?? null;
    const lines = [
      `Here’s your pay for ${month}, from ${m.companyName}’s payroll.`,
      '',
      `Salary: ${formatGBP(salary)} a year, about ${formatGBP(salary / 12)} a month before tax and other deductions.`,
      `Contracted hours: ${Number(now.hoursPerWeek)} a week.`,
    ];
    if (pension !== null) lines.push(`Pension: you pay ${formatPct(Number(pension))} of your pay${scheme ? `, and ${m.companyName} adds ${formatPct(Number(scheme.employerPct))}` : ''}.`);
    const changes: string[] = [];
    if (before) {
      if (before.annualSalary !== now.annualSalary) changes.push(`your salary changed from ${formatGBP(Number(before.annualSalary))} to ${formatGBP(salary)} a year`);
      if (before.hoursPerWeek !== now.hoursPerWeek) changes.push(`your contracted hours changed from ${Number(before.hoursPerWeek)} to ${Number(now.hoursPerWeek)} a week`);
      if ((before.pensionPct ?? null) !== (now.pensionPct ?? null) && now.pensionPct !== null) changes.push(`your pension contribution is now ${formatPct(Number(now.pensionPct))}`);
    }
    lines.push('', before ? (changes.length ? `What changed since last time: ${changes.join('; ')}.` : 'Nothing changed since last time.') : '');
    lines.push('Wondering what it means for you? Ask Fork, in your own words. Only you see what you ask.', `${deps.baseUrl}/`);
    return { subject: `Your pay for ${month}, explained`, text: lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n') };
  });
}

// ---------- The owner's monthly report ----------

export async function ownerReport(deps: JobDeps, m: Member): Promise<{ subject: string; text: string } | null> {
  if (m.role !== 'owner') return null;
  const ctx = ctxOf(m);
  const [d, p] = await Promise.all([ownerDashboard(deps.db, ctx), setupProgress(deps.db, ctx)]);
  const lines = [`Fork at ${m.companyName} this month.`, '', `Staff on Fork: ${d.joined} of ${p.people}.`];
  lines.push(d.switched ? `Salary sacrifice: ${d.switched.people} people switched. Saving about ${formatGBP(d.switched.savingPerYear)} a year; ${formatGBP(d.switched.savingToDate)} so far.` : `Salary sacrifice: fewer than ${GROUP_SIZE} people have switched, so Fork doesn’t show figures yet.`);
  lines.push(d.topics.length ? `What staff asked about (${GROUP_SIZE} or more people each): ${d.topics.map((t) => `${FAMILIES[t.family]?.title ?? 'something else'} (${t.people})`).join(', ')}.` : `No topic reached ${GROUP_SIZE} people this month.`);
  const open = d.plans.filter((x) => x.status !== 'done' && x.status !== 'declined');
  if (open.length) lines.push(`Plans waiting on your accountant: ${open.length}.`);
  const todo = [!p.scheme && 'pension scheme', !p.payrollImports && 'payroll export', !p.invited && 'team invites'].filter(Boolean);
  if (todo.length) lines.push(`Still to set up: ${todo.join(', ')}.`);
  lines.push('', `Your dashboard: ${deps.baseUrl}/dashboard`);
  return { subject: `Fork at ${m.companyName}: your monthly report`, text: lines.join('\n') };
}

// ---------- Runs ----------

export async function runMonthly(deps: JobDeps, opts: { companyId?: string } = {}) {
  const out = { payslips: 0, reports: 0, changed: 0 };
  for (const m of await members(deps.adminUrl, opts.companyId)) {
    out.changed += await recheckSaved(deps, m);
    const mail = m.role === 'employee' ? await payslipEmail(deps, m) : await ownerReport(deps, m);
    if (mail) {
      await sendMail({ to: m.email, ...mail });
      if (m.role === 'employee') out.payslips++;
      else out.reports++;
    }
  }
  return out;
}

/** After a payroll import or a rule pack update: re-check everyone's saved decisions. */
export async function runRecheck(deps: JobDeps, opts: { companyId?: string } = {}) {
  let changed = 0;
  for (const m of await members(deps.adminUrl, opts.companyId)) changed += await recheckSaved(deps, m);
  return { changed };
}

