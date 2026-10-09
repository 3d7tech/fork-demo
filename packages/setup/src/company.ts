// Company settings and the pension scheme (one scheme per company in Phase 1).
import { eq } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import { z } from 'zod';

export const CompanySettings = z.object({
  employerNiSharePct: z.number().min(0).max(100),
  employmentAllowance: z.boolean(),
  brandColour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  reenrolmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

export const SchemeSettings = z.object({
  name: z.string().trim().min(1).max(200),
  provider: z.string().trim().max(200).nullable(),
  reliefMethod: z.enum(['relief_at_source', 'net_pay']),
  basis: z.enum(['full_salary', 'qualifying_earnings']),
  employerPct: z.number().min(0).max(100),
  employeeDefaultPct: z.number().min(0).max(100),
});

export async function readCompany(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, async (tx) => {
    const [company] = await tx.select().from(s.company).where(eq(s.company.id, ctx.companyId));
    const [scheme] = await tx.select().from(s.pensionScheme).where(eq(s.pensionScheme.companyId, ctx.companyId));
    return company ? { company, scheme: scheme ?? null } : null;
  });
}

export async function saveCompanySettings(db: ForkDatabase, ctx: RequestContext, input: z.input<typeof CompanySettings>) {
  const v = CompanySettings.parse(input);
  await db.asMember(ctx, async (tx) => {
    const done = await tx
      .update(s.company)
      .set({ employerNiSharePct: String(v.employerNiSharePct), employmentAllowance: v.employmentAllowance, brandColour: v.brandColour, reenrolmentDate: v.reenrolmentDate })
      .where(eq(s.company.id, ctx.companyId))
      .returning({ id: s.company.id });
    if (!done.length) throw new Error('Only an owner can change company settings.');
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'company.settings_saved' });
  });
}

export async function saveScheme(db: ForkDatabase, ctx: RequestContext, input: z.input<typeof SchemeSettings>) {
  const v = SchemeSettings.parse(input);
  const values = { ...v, employerPct: String(v.employerPct), employeeDefaultPct: String(v.employeeDefaultPct), updatedAt: new Date() };
  await db.asMember(ctx, async (tx) => {
    const [existing] = await tx.select({ id: s.pensionScheme.id }).from(s.pensionScheme).where(eq(s.pensionScheme.companyId, ctx.companyId));
    if (existing) await tx.update(s.pensionScheme).set(values).where(eq(s.pensionScheme.id, existing.id));
    else await tx.insert(s.pensionScheme).values({ ...values, companyId: ctx.companyId });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'pension_scheme.saved' });
  });
}
