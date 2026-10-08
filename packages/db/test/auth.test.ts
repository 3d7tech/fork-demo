import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptInvite, asAdmin, completeSignIn, contextFor, createInvite, readInvite, readSession, requestSignIn, schema as s, signOut } from '../src';
import { freshDatabase, type TestDatabase } from '../src/testing';

let t: TestDatabase;
let larkfield: string;
let other: string;
let ownerId: string;
let ellaEmp: string;
let otherEmp: string;

beforeAll(async () => {
  t = await freshDatabase();
  await asAdmin(t.adminUrl, async (db) => {
    const [a, b] = await db.insert(s.company).values([{ name: 'Larkfield' }, { name: 'Other Ltd' }]).returning();
    const [owner] = await db.insert(s.appUser).values({ email: 'Maya@Larkfield.test' }).returning();
    await db.insert(s.membership).values({ userId: owner!.id, companyId: a!.id, role: 'owner' });
    const [e1, e2] = await db
      .insert(s.employee)
      .values([
        { companyId: a!.id, payrollRef: 'E1', name: 'Ella Brooks', hoursPerWeek: '37.5' },
        { companyId: b!.id, payrollRef: 'X1', name: 'Someone Else', hoursPerWeek: '35' },
      ])
      .returning();
    [larkfield, other, ownerId, ellaEmp, otherEmp] = [a!.id, b!.id, owner!.id, e1!.id, e2!.id];
  });
});
afterAll(async () => t?.drop());

const owner = () => ({ userId: ownerId, companyId: larkfield, role: 'owner' as const });

describe('email sign-in', () => {
  it('a link signs in once, and the session lists the person’s companies', async () => {
    const link = await requestSignIn(t.db, ' maya@larkfield.TEST ');
    expect(link).toBeTruthy();
    const session = await completeSignIn(t.db, link!);
    expect(session).toBeTruthy();
    expect(await completeSignIn(t.db, link!)).toBeNull();
    const who = await readSession(t.db, session!);
    expect(who?.memberships).toEqual([{ companyId: larkfield, companyName: 'Larkfield', role: 'owner', employeeId: null }]);
    expect(contextFor(who!, larkfield, 'owner')).toEqual(owner());
    expect(contextFor(who!, larkfield, 'employee')).toBeNull();
    expect(contextFor(who!, other, 'owner')).toBeNull();
  });

  it('an unknown address gets no link', async () => {
    expect(await requestSignIn(t.db, 'nobody@example.test')).toBeNull();
  });

  it('a link expires after 15 minutes', async () => {
    const at = new Date('2026-10-08T10:00:00Z');
    const link = await requestSignIn(t.db, 'maya@larkfield.test', at);
    expect(await completeSignIn(t.db, link!, new Date('2026-10-08T10:16:00Z'))).toBeNull();
  });

  it('signing out ends the session', async () => {
    const session = await completeSignIn(t.db, (await requestSignIn(t.db, 'maya@larkfield.test'))!);
    await signOut(t.db, session!);
    expect(await readSession(t.db, session!)).toBeNull();
  });

  it('only hashes are stored', async () => {
    const link = await requestSignIn(t.db, 'maya@larkfield.test');
    const rows = await asAdmin(t.adminUrl, (db) => db.select().from(s.loginToken));
    expect(JSON.stringify(rows)).not.toContain(link!);
  });
});

describe('invites', () => {
  it('an owner invites an employee, who joins linked to their payroll record', async () => {
    const token = await createInvite(t.db, owner(), { email: 'ella@larkfield.test', role: 'employee', employeeId: ellaEmp });
    expect(await readInvite(t.db, token)).toEqual({ email: 'ella@larkfield.test', role: 'employee', companyName: 'Larkfield' });
    const session = await acceptInvite(t.db, token);
    const who = await readSession(t.db, session!);
    expect(who?.memberships).toEqual([{ companyId: larkfield, companyName: 'Larkfield', role: 'employee', employeeId: ellaEmp }]);
    expect(await acceptInvite(t.db, token)).toBeNull();
  });

  it('an owner can’t link an invite to another company’s employee', async () => {
    await expect(createInvite(t.db, owner(), { email: 'x@x.test', role: 'employee', employeeId: otherEmp })).rejects.toThrow(/isn’t in this company/);
  });

  it('only an owner can invite', async () => {
    const fake = { ...owner(), companyId: other };
    await expect(createInvite(t.db, fake, { email: 'x@x.test', role: 'owner' })).rejects.toThrow();
  });
});
