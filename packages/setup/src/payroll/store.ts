// Payroll upload, mapping and import, against the database as the signed-in owner.
// Row-level security makes sure only an owner of the company can do any of this.
import { asc, eq, sql } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { FileStore } from '../files';
import { mappingProblems, type FieldId, type Mapping } from './fields';
import { parseRows, type RowProblem } from './parse';
import { readTable, UploadError } from './read';
import { suggestMapping, type ColumnMatcher } from './suggest';

export interface SetupDeps {
  db: ForkDatabase;
  files: FileStore;
  matcher?: ColumnMatcher;
}

export interface UploadResult {
  uploadId: string;
  headers: string[];
  rowCount: number;
  mapping: Mapping;
  unsure: FieldId[];
}

export async function uploadPayroll(deps: SetupDeps, ctx: RequestContext, file: { name: string; bytes: Uint8Array }): Promise<UploadResult> {
  const table = await readTable(file.name, file.bytes);
  const suggestion = await suggestMapping(table, deps.matcher);
  const stored = await deps.files.put(ctx.companyId, file.bytes);
  const uploadId = await deps.db.asMember(ctx, async (tx) => {
    const [row] = await tx
      .insert(s.payrollUpload)
      .values({
        companyId: ctx.companyId,
        uploadedBy: ctx.userId,
        fileName: file.name.slice(0, 200),
        fileKey: stored.key,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        headers: table.headers,
        suggestedMapping: suggestion.mapping,
        rowCount: table.rows.length,
      })
      .returning({ id: s.payrollUpload.id });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'payroll.uploaded', targetType: 'payroll_upload', targetId: row!.id, detail: { rows: table.rows.length, matchedBy: suggestion.by } });
    return row!.id;
  });
  return { uploadId, headers: table.headers, rowCount: table.rows.length, mapping: suggestion.mapping, unsure: suggestion.unsure };
}

export type ImportResult =
  | { ok: true; people: number; added: number; updated: number }
  | { ok: false; mappingProblems: string[]; rowProblems: RowProblem[] };

/** Check every row with the owner's confirmed mapping and, if all is well, save people and pay. */
export async function importPayroll(deps: SetupDeps, ctx: RequestContext, uploadId: string, mapping: Mapping, periodEnd: string): Promise<ImportResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) throw new UploadError('Choose the pay period end date.');
  const upload = await deps.db.asMember(ctx, async (tx) => (await tx.select().from(s.payrollUpload).where(eq(s.payrollUpload.id, uploadId)))[0]);
  if (!upload) throw new UploadError('That upload wasn’t found.');
  if (upload.status === 'imported') throw new UploadError('That file has already been imported.');

  const mp = mappingProblems(mapping, upload.headers);
  if (mp.length) return { ok: false, mappingProblems: mp, rowProblems: [] };
  const table = await readTable(upload.fileName, await deps.files.get(upload.fileKey));
  const { rows, problems } = parseRows(table, mapping);

  return deps.db.asMember(ctx, async (tx) => {
    if (problems.length) {
      await tx.update(s.payrollUpload).set({ mapping, status: 'mapped', problems }).where(eq(s.payrollUpload.id, uploadId));
      return { ok: false as const, mappingProblems: [], rowProblems: problems };
    }
    const existing = new Set(
      (await tx.select({ ref: s.employee.payrollRef }).from(s.employee).where(eq(s.employee.companyId, ctx.companyId))).map((e) => e.ref),
    );
    const saved = await tx
      .insert(s.employee)
      .values(
        rows.map((r) => ({
          companyId: ctx.companyId,
          payrollRef: r.payrollRef,
          name: r.name,
          email: r.email,
          dateOfBirth: r.dateOfBirth,
          hoursPerWeek: r.hoursPerWeek,
          startDate: r.startDate,
        })),
      )
      .onConflictDoUpdate({
        target: [s.employee.companyId, s.employee.payrollRef],
        set: {
          name: sql`excluded.name`,
          email: sql`coalesce(excluded.email, ${s.employee.email})`,
          dateOfBirth: sql`coalesce(excluded.date_of_birth, ${s.employee.dateOfBirth})`,
          hoursPerWeek: sql`excluded.hours_per_week`,
          startDate: sql`coalesce(excluded.start_date, ${s.employee.startDate})`,
        },
      })
      .returning({ id: s.employee.id, ref: s.employee.payrollRef });
    const idByRef = new Map(saved.map((e) => [e.ref, e.id]));
    await tx.insert(s.payRecord).values(
      rows.map((r) => ({
        companyId: ctx.companyId,
        employeeId: idByRef.get(r.payrollRef)!,
        uploadId,
        periodEnd,
        annualSalary: r.annualSalary,
        hoursPerWeek: r.hoursPerWeek,
        pensionPct: r.pensionPct,
      })),
    );
    await tx
      .update(s.payrollUpload)
      .set({ mapping, status: 'imported', problems: [], payPeriodEnd: periodEnd, importedAt: new Date() })
      .where(eq(s.payrollUpload.id, uploadId));
    const added = rows.filter((r) => !existing.has(r.payrollRef)).length;
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'payroll.imported', targetType: 'payroll_upload', targetId: uploadId, detail: { people: rows.length, added } });
    return { ok: true as const, people: rows.length, added, updated: rows.length - added };
  });
}

/** The owner's list of people, with whether each has been invited or has joined. No pay. */
export async function listPeople(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, async (tx) => {
    const people = await tx
      .select({ id: s.employee.id, payrollRef: s.employee.payrollRef, name: s.employee.name, email: s.employee.email })
      .from(s.employee)
      .orderBy(asc(s.employee.name));
    const joined = new Set((await tx.select({ e: s.membership.employeeId }).from(s.membership).where(eq(s.membership.companyId, ctx.companyId))).map((m) => m.e));
    const invited = new Set((await tx.select({ e: s.invite.employeeId }).from(s.invite)).map((i) => i.e));
    return people.map((p) => ({ ...p, status: joined.has(p.id) ? ('joined' as const) : invited.has(p.id) ? ('invited' as const) : ('not_invited' as const) }));
  });
}

/** One upload, for the mapping screen. */
export async function readUpload(db: ForkDatabase, ctx: RequestContext, uploadId: string) {
  return db.asMember(ctx, async (tx) => {
    const [u] = await tx
      .select({
        id: s.payrollUpload.id,
        fileName: s.payrollUpload.fileName,
        headers: s.payrollUpload.headers,
        suggestedMapping: s.payrollUpload.suggestedMapping,
        mapping: s.payrollUpload.mapping,
        status: s.payrollUpload.status,
        rowCount: s.payrollUpload.rowCount,
        problems: s.payrollUpload.problems,
        payPeriodEnd: s.payrollUpload.payPeriodEnd,
      })
      .from(s.payrollUpload)
      .where(eq(s.payrollUpload.id, uploadId));
    return u ?? null;
  });
}

/** Where the owner is with setup, for the checklist. Counts only. */
export async function setupProgress(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, async (tx) => {
    const count = async (q: Promise<Array<{ n: number }>>) => (await q)[0]?.n ?? 0;
    const n = sql<number>`count(*)::int`;
    const [company] = await tx.select({ share: s.company.employerNiSharePct, settings: sql<boolean>`exists (select 1 from audit_event a where a.company_id = ${ctx.companyId}::uuid and a.action = 'company.settings_saved')` }).from(s.company).where(eq(s.company.id, ctx.companyId));
    return {
      settings: company?.settings ?? false,
      scheme: (await count(tx.select({ n }).from(s.pensionScheme))) > 0,
      payrollImports: await count(tx.select({ n }).from(s.payrollUpload).where(eq(s.payrollUpload.status, 'imported'))),
      people: await count(tx.select({ n }).from(s.employee)),
      invited: await count(tx.select({ n }).from(s.invite).where(sql`${s.invite.role} = 'employee'`)),
      joined: await count(tx.select({ n }).from(s.membership).where(sql`${s.membership.role} = 'employee'`)),
      documents: await count(tx.select({ n }).from(s.policyDocument)),
      factsToCheck: await count(tx.select({ n }).from(s.policyFact).where(sql`${s.policyFact.confidence} <> 'confirmed'`)),
    };
  });
}
