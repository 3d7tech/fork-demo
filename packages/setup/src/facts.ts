// The data gatherer for Phase 1 (ADR 0004): facts from the database, each with its source and
// date. Reads as the signed-in person, so row-level security limits it to what they may see.
import { desc, eq } from 'drizzle-orm';
import { schema as s, type Db, type ForkDatabase, type RequestContext } from '@fork/db';
import type { Fact } from '@fork/spec';

/** Matches the pipeline's FactStore interface, without depending on the pipeline package. */
export class DbFactStore {
  constructor(
    private readonly db: ForkDatabase,
    private readonly ctx: RequestContext,
  ) {}

  async get(subject: { companyId: string; employeeId?: string }, ids: string[]): Promise<Fact[]> {
    if (subject.companyId !== this.ctx.companyId) return [];
    const owner = this.ctx.role === 'owner' && !subject.employeeId;
    const facts = await this.db.asMember(this.ctx, async (tx) => {
      const out: Fact[] = [];
      const add = (id: string, value: Fact['value'], source: Fact['source'], asOf: string) => out.push({ id, value, source, asOf, confidence: 'confirmed' });
      const day = (d: Date) => d.toISOString().slice(0, 10);

      const [company] = await tx.select().from(s.company).where(eq(s.company.id, subject.companyId));
      if (company) {
        add('employer_share_pct', Number(company.employerNiSharePct), 'company_setting', day(company.createdAt));
        if (owner) {
          add('fee_per_employee', company.feePencePerEmployee / 100, 'company_setting', day(company.createdAt));
          add('employment_allowance', company.employmentAllowance, 'company_setting', day(company.createdAt));
        }
      }

      const [scheme] = await tx.select().from(s.pensionScheme).where(eq(s.pensionScheme.companyId, subject.companyId));
      if (scheme) {
        add('employer_contribution_pct', Number(scheme.employerPct), 'pension_scheme', day(scheme.updatedAt));
        add('relief_method', scheme.reliefMethod, 'pension_scheme', day(scheme.updatedAt));
        add('pension_basis', scheme.basis, 'pension_scheme', day(scheme.updatedAt));
        if (owner) add('contribution_pct', Number(scheme.employeeDefaultPct), 'pension_scheme', day(scheme.updatedAt));
      }

      if (owner) {
        // Company-wide figures from the latest pay record of each employee. Counts and a median only.
        const rows = await latestPay(tx);
        if (rows.length) {
          const asOf = rows.map((r) => r.periodEnd).sort().at(-1)!;
          add('headcount', rows.length, 'payroll_export', asOf);
          const sorted = rows.map((r) => Number(r.annualSalary)).sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          add('median_salary', sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2, 'payroll_export', asOf);
        }
      }

      if (subject.employeeId) {
        const [pay] = await tx.select().from(s.payRecord).where(eq(s.payRecord.employeeId, subject.employeeId)).orderBy(desc(s.payRecord.periodEnd), desc(s.payRecord.createdAt)).limit(1);
        if (pay) {
          add('salary', Number(pay.annualSalary), 'payroll_export', pay.periodEnd);
          add('hours_per_week', Number(pay.hoursPerWeek), 'payroll_export', pay.periodEnd);
          if (pay.pensionPct !== null) add('contribution_pct', Number(pay.pensionPct), 'payroll_export', pay.periodEnd);
        }
        if (!out.some((f) => f.id === 'contribution_pct') && scheme) add('contribution_pct', Number(scheme.employeeDefaultPct), 'pension_scheme', day(scheme.updatedAt));
      }
      return out;
    });
    return ids.flatMap((id) => facts.filter((f) => f.id === id));
  }

  /** Every employee's latest salary and hours, for an owner's company-wide decisions. Goes to the engine only. */
  async payrollRows(subject: { companyId: string }) {
    if (subject.companyId !== this.ctx.companyId || this.ctx.role !== 'owner') return [];
    const rows = await this.db.asMember(this.ctx, latestPay);
    return rows.map((r) => ({ salary: Number(r.annualSalary), hoursPerWeek: Number(r.hoursPerWeek) }));
  }
}

/** The most recent pay record for each employee the reader can see. */
function latestPay(tx: Db) {
  return tx
    .selectDistinctOn([s.payRecord.employeeId], { annualSalary: s.payRecord.annualSalary, hoursPerWeek: s.payRecord.hoursPerWeek, periodEnd: s.payRecord.periodEnd })
    .from(s.payRecord)
    .orderBy(s.payRecord.employeeId, desc(s.payRecord.periodEnd), desc(s.payRecord.createdAt));
}
