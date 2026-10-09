// An employee's tax profile (ADR 0010): what they've told Fork, readable by them alone (migration 0007).
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';

const PLANS = ['plan_1', 'plan_2', 'plan_4', 'plan_5', 'postgraduate'] as const;
const money = z.number().min(0).max(1_000_000);

/** Answers as the person gives them. Any field left out is unchanged; null clears it. */
export const TaxProfileAnswers = z.strictObject({
  taxRegion: z.enum(['rest_of_uk', 'scotland']).nullable().optional(),
  /** The plans they repay; an empty list means none. */
  studentLoans: z.array(z.enum(PLANS)).nullable().optional(),
  variablePay: money.nullable().optional(),
  otherIncome: money.nullable().optional(),
  childBenefitChildren: z.number().int().min(0).max(20).nullable().optional(),
  higherEarner: z.boolean().nullable().optional(),
  otherPensionSavings: money.nullable().optional(),
  flexiblyAccessed: z.boolean().nullable().optional(),
});
export type TaxProfileAnswers = z.infer<typeof TaxProfileAnswers>;

export interface TaxProfileRow {
  taxRegion: 'rest_of_uk' | 'scotland' | null;
  studentLoans: string[] | null;
  variablePay: number | null;
  otherIncome: number | null;
  childBenefitChildren: number | null;
  higherEarner: boolean | null;
  otherPensionSavings: number | null;
  flexiblyAccessed: boolean | null;
  updatedAt: Date | null;
}

const EMPTY: TaxProfileRow = {
  taxRegion: null,
  studentLoans: null,
  variablePay: null,
  otherIncome: null,
  childBenefitChildren: null,
  higherEarner: null,
  otherPensionSavings: null,
  flexiblyAccessed: null,
  updatedAt: null,
};

const n = (v: string | null) => (v === null ? null : Number(v));

/** The signed-in employee's own profile, or an empty one. Nobody else's can be read. */
export async function readTaxProfile(db: ForkDatabase, ctx: RequestContext, employeeId: string): Promise<TaxProfileRow> {
  const [row] = await db.asMember(ctx, (tx) => tx.select().from(s.taxProfile).where(eq(s.taxProfile.employeeId, employeeId)));
  if (!row) return EMPTY;
  return {
    taxRegion: row.taxRegion,
    studentLoans: row.studentLoans === null ? null : row.studentLoans.split(',').filter(Boolean),
    variablePay: n(row.variablePay),
    otherIncome: n(row.otherIncome),
    childBenefitChildren: row.childBenefitChildren,
    higherEarner: row.higherEarner,
    otherPensionSavings: n(row.otherPensionSavings),
    flexiblyAccessed: row.flexiblyAccessed,
    updatedAt: row.updatedAt,
  };
}

/** Save the employee's own answers. Only employees have a profile; the policy refuses anyone else's. */
export async function saveTaxProfile(db: ForkDatabase, ctx: RequestContext, employeeId: string, input: unknown): Promise<void> {
  if (ctx.role !== 'employee') throw new Error('Only employees have a tax profile.');
  const a = TaxProfileAnswers.parse(input);
  const str = (v: number | null | undefined) => (v === undefined ? undefined : v === null ? null : v.toFixed(2));
  const values = {
    taxRegion: a.taxRegion,
    studentLoans: a.studentLoans === undefined ? undefined : a.studentLoans === null ? null : [...new Set(a.studentLoans)].sort().join(','),
    variablePay: str(a.variablePay),
    otherIncome: str(a.otherIncome),
    childBenefitChildren: a.childBenefitChildren,
    higherEarner: a.higherEarner,
    otherPensionSavings: str(a.otherPensionSavings),
    flexiblyAccessed: a.flexiblyAccessed,
  };
  const set = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  await db.asMember(ctx, (tx) =>
    tx
      .insert(s.taxProfile)
      .values({ employeeId, companyId: ctx.companyId, ...set })
      .onConflictDoUpdate({ target: s.taxProfile.employeeId, set: { ...set, updatedAt: new Date() } }),
  );
}

/** Delete everything the employee told Fork about their tax. Payroll's own values stay with payroll. */
export async function deleteTaxProfile(db: ForkDatabase, ctx: RequestContext): Promise<void> {
  await db.asMember(ctx, async (tx) => {
    await tx.delete(s.taxProfile);
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'data.tax_details_deleted' });
  });
}
