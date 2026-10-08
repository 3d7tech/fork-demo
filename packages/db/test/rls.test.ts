import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, schema as s, type RequestContext } from '../src';
import { freshDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
const ids = {} as Record<'larkfield' | 'other' | 'owner' | 'ella' | 'tom' | 'otherOwner' | 'ellaEmp' | 'tomEmp' | 'otherEmp' | 'upload', string>;

beforeAll(async () => {
  t = await freshDatabase();
  await asAdmin(t.adminUrl, async (db) => {
    const [larkfield, other] = await db.insert(s.company).values([{ name: 'Larkfield' }, { name: 'Other Ltd' }]).returning();
    const [owner, ella, tom, otherOwner] = await db
      .insert(s.appUser)
      .values([{ email: 'maya@larkfield.test' }, { email: 'ella@larkfield.test' }, { email: 'tom@larkfield.test' }, { email: 'boss@other.test' }])
      .returning();
    const [ellaEmp, tomEmp, otherEmp] = await db
      .insert(s.employee)
      .values([
        { companyId: larkfield!.id, payrollRef: 'E1', name: 'Ella Brooks', hoursPerWeek: '37.5' },
        { companyId: larkfield!.id, payrollRef: 'E2', name: 'Tom Hale', hoursPerWeek: '40' },
        { companyId: other!.id, payrollRef: 'X1', name: 'Someone Else', hoursPerWeek: '35' },
      ])
      .returning();
    await db.insert(s.membership).values([
      { userId: owner!.id, companyId: larkfield!.id, role: 'owner' },
      { userId: ella!.id, companyId: larkfield!.id, role: 'employee', employeeId: ellaEmp!.id },
      { userId: tom!.id, companyId: larkfield!.id, role: 'employee', employeeId: tomEmp!.id },
      { userId: otherOwner!.id, companyId: other!.id, role: 'owner' },
    ]);
    const [upload] = await db
      .insert(s.payrollUpload)
      .values({ companyId: larkfield!.id, fileName: 'pay.csv', fileKey: 'k', sha256: 'h', sizeBytes: 1, headers: ['a'] })
      .returning();
    await db.insert(s.payRecord).values([
      { companyId: larkfield!.id, employeeId: ellaEmp!.id, uploadId: upload!.id, periodEnd: '2026-09-30', annualSalary: '32000', hoursPerWeek: '37.5' },
      { companyId: larkfield!.id, employeeId: tomEmp!.id, uploadId: upload!.id, periodEnd: '2026-09-30', annualSalary: '41000', hoursPerWeek: '40' },
    ]);
    const [doc] = await db
      .insert(s.policyDocument)
      .values({ companyId: larkfield!.id, kind: 'pension_scheme', fileName: 'scheme.pdf', fileKey: 'd', sha256: 'h', sizeBytes: 1, mimeType: 'application/pdf' })
      .returning();
    await db.insert(s.policyFact).values([
      { companyId: larkfield!.id, documentId: doc!.id, key: 'relief_method', value: 'relief_at_source', confidence: 'confirmed' },
      { companyId: larkfield!.id, documentId: doc!.id, key: 'employer_pct', value: 3, confidence: 'extracted' },
    ]);
    Object.assign(ids, {
      larkfield: larkfield!.id,
      other: other!.id,
      owner: owner!.id,
      ella: ella!.id,
      tom: tom!.id,
      otherOwner: otherOwner!.id,
      ellaEmp: ellaEmp!.id,
      tomEmp: tomEmp!.id,
      otherEmp: otherEmp!.id,
      upload: upload!.id,
    });
  });
});

afterAll(async () => {
  await t?.drop();
});

/** The database's own error message; Drizzle wraps it in "Failed query". */
async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as { cause?: { message?: string }; message: string };
    return err.cause?.message ?? err.message;
  }
  return 'no error';
}

const owner = (): RequestContext => ({ userId: ids.owner, companyId: ids.larkfield, role: 'owner' });
const ella = (): RequestContext => ({ userId: ids.ella, companyId: ids.larkfield, role: 'employee' });

describe('owners', () => {
  it('see their own company’s employees and pay, and nothing of another company', async () => {
    const rows = await t.db.asMember(owner(), (db) => db.select().from(s.employee));
    expect(rows.map((r) => r.name).sort()).toEqual(['Ella Brooks', 'Tom Hale']);
    const pay = await t.db.asMember(owner(), (db) => db.select().from(s.payRecord));
    expect(pay).toHaveLength(2);
  });

  it('can’t reach another company by naming it in the request', async () => {
    const ctx = { ...owner(), companyId: ids.other };
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.employee))).toEqual([]);
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.company))).toEqual([]);
  });

  it('can’t write a row into another company', async () => {
    expect(await dbError(t.db.asMember(owner(), (db) => db.insert(s.employee).values({ companyId: ids.other, payrollRef: 'Z', name: 'Planted', hoursPerWeek: '1' })))).toMatch(/row-level security/);
  });
});

describe('employees', () => {
  it('see only their own employee record and pay', async () => {
    const rows = await t.db.asMember(ella(), (db) => db.select().from(s.employee));
    expect(rows.map((r) => r.id)).toEqual([ids.ellaEmp]);
    const pay = await t.db.asMember(ella(), (db) => db.select().from(s.payRecord));
    expect(pay.map((p) => p.employeeId)).toEqual([ids.ellaEmp]);
  });

  it('can’t see payroll uploads, invites or the team list', async () => {
    expect(await t.db.asMember(ella(), (db) => db.select().from(s.payrollUpload))).toEqual([]);
    expect(await t.db.asMember(ella(), (db) => db.select().from(s.invite))).toEqual([]);
    const users = await t.db.asMember(ella(), (db) => db.select().from(s.appUser));
    expect(users.map((u) => u.id)).toEqual([ids.ella]);
  });

  it('claiming to be an owner gets them nothing more', async () => {
    const ctx = { ...ella(), role: 'owner' as const };
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.employee))).toEqual([]);
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.payRecord))).toEqual([]);
  });

  it('can’t change pay or add employees', async () => {
    const changed = await t.db.asMember(ella(), (db) => db.update(s.payRecord).set({ annualSalary: '99999' }).where(eq(s.payRecord.employeeId, ids.ellaEmp)).returning());
    expect(changed).toEqual([]);
    expect(await dbError(t.db.asMember(ella(), (db) => db.insert(s.employee).values({ companyId: ids.larkfield, payrollRef: 'Z', name: 'Planted', hoursPerWeek: '1' })))).toMatch(/row-level security/);
  });

  it('see confirmed document facts only', async () => {
    const facts = await t.db.asMember(ella(), (db) => db.select().from(s.policyFact));
    expect(facts.map((f) => f.key)).toEqual(['relief_method']);
  });
});

describe('requests without a valid context', () => {
  it('a made-up user sees nothing', async () => {
    const ctx = { userId: '00000000-0000-0000-0000-000000000000', companyId: ids.larkfield, role: 'owner' as const };
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.employee))).toEqual([]);
    expect(await t.db.asMember(ctx, (db) => db.select().from(s.company))).toEqual([]);
  });

  it('a person can’t write an audit event in someone else’s name', async () => {
    expect(await dbError(t.db.asMember(ella(), (db) => db.insert(s.auditEvent).values({ companyId: ids.larkfield, actorUserId: ids.owner, action: 'x' })))).toMatch(/row-level security/);
  });
});

describe('the two roles are kept apart', () => {
  it('signed-in requests can’t read sign-in links or sessions', async () => {
    expect(await dbError(t.db.asMember(owner(), (db) => db.select().from(s.loginToken)))).toMatch(/permission denied/);
    expect(await dbError(t.db.asMember(owner(), (db) => db.select().from(s.session)))).toMatch(/permission denied/);
  });

  it('the sign-in role can’t read pay, employees or documents', async () => {
    expect(await dbError(t.db.asAuth((db) => db.select().from(s.payRecord)))).toMatch(/permission denied/);
    expect(await dbError(t.db.asAuth((db) => db.select().from(s.employee)))).toMatch(/permission denied/);
    expect(await dbError(t.db.asAuth((db) => db.select().from(s.policyDocument)))).toMatch(/permission denied/);
  });
});
