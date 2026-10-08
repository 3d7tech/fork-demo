// The data gatherer for Phase 1 (ADR 0004): facts from the database, each with its source and
// date. Reads as the signed-in person, so row-level security limits it to what they may see.
import { desc, eq } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { Fact } from '@fork/spec';

/** Matches the pipeline's FactStore interface, without depending on the pipeline package. */
export class DbFactStore {
  constructor(
    private readonly db: ForkDatabase,
    private readonly ctx: RequestContext,
  ) {}

  async get(subject: { companyId: string; employeeId?: string }, ids: string[]): Promise<Fact[]> {
    if (subject.companyId !== this.ctx.companyId) return [];
    const facts = await this.db.asMember(this.ctx, async (tx) => {
      const out: Fact[] = [];
      const add = (id: string, value: Fact['value'], source: Fact['source'], asOf: string) => out.push({ id, value, source, asOf, confidence: 'confirmed' });
      const day = (d: Date) => d.toISOString().slice(0, 10);

      const [company] = await tx.select().from(s.company).where(eq(s.company.id, subject.companyId));
      if (company) add('employer_share_pct', Number(company.employerNiSharePct), 'company_setting', day(company.createdAt));

      const [scheme] = await tx.select().from(s.pensionScheme).where(eq(s.pensionScheme.companyId, subject.companyId));
      if (scheme) {
        add('employer_contribution_pct', Number(scheme.employerPct), 'pension_scheme', day(scheme.updatedAt));
        add('relief_method', scheme.reliefMethod, 'pension_scheme', day(scheme.updatedAt));
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
}
