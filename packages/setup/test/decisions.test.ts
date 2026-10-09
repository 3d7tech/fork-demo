import { acceptInvite, accountantContext, asAdmin, createInvite, readSession, schema as s, type RequestContext } from '@fork/db';
import { freshDatabase, type TestDatabase } from '@fork/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountantInbox, createRequest, listSaved, loadRun, myRequests, myRuns, ownerDashboard, recordRun, saveDecision, updateRequestStatus, updateRun } from '../src';

let t: TestDatabase;
let maya: RequestContext;
const staff: RequestContext[] = [];
let accountant: RequestContext;
let otherOwner: RequestContext;

const screen = (family: string, runId = crypto.randomUUID()) => ({ kind: 'decision' as const, runId, family, calc: { rulePack: { id: 'uk-2026-27' } }, copy: { verdict: 'secret verdict' } });

beforeAll(async () => {
  t = await freshDatabase();
  await asAdmin(t.adminUrl, async (db) => {
    const [c, other] = await db.insert(s.company).values([{ name: 'Larkfield' }, { name: 'Other Ltd' }]).returning();
    const users = await db
      .insert(s.appUser)
      .values([{ email: 'maya@l.test' }, { email: 'boss@o.test' }, ...Array.from({ length: 6 }, (_, i) => ({ email: `e${i}@l.test` }))])
      .returning();
    const emps = await db
      .insert(s.employee)
      .values(Array.from({ length: 6 }, (_, i) => ({ companyId: c!.id, payrollRef: `E${i}`, name: `Person ${i}`, hoursPerWeek: '37.5' })))
      .returning();
    await db.insert(s.membership).values([
      { userId: users[0]!.id, companyId: c!.id, role: 'owner' },
      { userId: users[1]!.id, companyId: other!.id, role: 'owner' },
      ...emps.map((e, i) => ({ userId: users[i + 2]!.id, companyId: c!.id, role: 'employee' as const, employeeId: e.id })),
    ]);
    maya = { userId: users[0]!.id, companyId: c!.id, role: 'owner' };
    otherOwner = { userId: users[1]!.id, companyId: other!.id, role: 'owner' };
    emps.forEach((_, i) => staff.push({ userId: users[i + 2]!.id, companyId: c!.id, role: 'employee' }));
  });
});
afterAll(async () => t?.drop());

describe('an employee’s questions and answers are theirs alone', () => {
  it('only the person who asked can read a run; owners can’t, even by its id', async () => {
    const a = screen('pension.salary_sacrifice_switch');
    await recordRun(t.db, staff[0]!, { question: 'is salary sacrifice worth it for me?', answer: a });
    expect(await loadRun(t.db, staff[0]!, a.runId)).toMatchObject({ family: 'pension.salary_sacrifice_switch' });
    expect(await loadRun(t.db, staff[1]!, a.runId)).toBeNull();
    expect(await loadRun(t.db, maya, a.runId)).toBeNull();
    expect(await myRuns(t.db, maya)).toEqual([]);
    // Not even a raw select as the owner returns it.
    const rows = await t.db.asMember(maya, (db) => db.select().from(s.decisionRun));
    expect(rows).toEqual([]);
  });

  it('someone can’t record a run in another person’s name or role', async () => {
    const asOwnerRole = { ...staff[0]!, role: 'owner' as const };
    await expect(recordRun(t.db, asOwnerRole, { question: 'x', answer: screen('a.b') })).rejects.toThrow();
  });

  it('updates and saved decisions stay personal', async () => {
    const a = screen('pension.how_much_to_contribute');
    await recordRun(t.db, staff[1]!, { question: 'how much should I pay in?', answer: a });
    await updateRun(t.db, staff[2]!, a.runId, { ...a, family: 'tampered' });
    expect(await loadRun(t.db, staff[1]!, a.runId)).toMatchObject({ family: 'pension.how_much_to_contribute' });
    await saveDecision(t.db, staff[1]!, a.runId, 'How much to pay in', { facts: { salary: 32000 }, rulePack: 'uk-2026-27', verdict: 'more', headline: {} });
    expect(await listSaved(t.db, staff[1]!)).toHaveLength(1);
    expect(await listSaved(t.db, staff[2]!)).toEqual([]);
    expect(await listSaved(t.db, maya)).toEqual([]);
  });

  it('owner decisions are shared with the company’s owners only', async () => {
    const a = screen('employer.true_cost_of_hire');
    await recordRun(t.db, maya, { question: 'cost of a hire', answer: a });
    expect(await loadRun(t.db, maya, a.runId)).not.toBeNull();
    expect(await loadRun(t.db, staff[0]!, a.runId)).toBeNull();
    expect(await loadRun(t.db, otherOwner, a.runId)).toBeNull();
  });
});

describe('requests to the accountant', () => {
  let requestId: string;

  it('waits as a draft until the company has an accountant', async () => {
    const r = await createRequest(t.db, staff[0]!, { runId: (await myRuns(t.db, staff[0]!))[0]!.id, kind: 'payroll.request', family: 'pension.salary_sacrifice_switch', summary: 'Please switch Person 0 (payroll E0) to salary sacrifice.', figures: { employer_ni_saving: 240 } });
    expect(r.accountants).toEqual([]);
    requestId = r.id;
    expect((await myRequests(t.db, staff[0]!))[0]).toMatchObject({ status: 'draft' });
  });

  it('an accountant joins by invite; waiting requests go to them; they see what to change', async () => {
    const token = await createInvite(t.db, maya, { email: 'books@bureau.test', role: 'accountant' });
    const session = await acceptInvite(t.db, token);
    const who = (await readSession(t.db, session!))!;
    expect(who.memberships).toEqual([]);
    expect(who.accountantFor).toEqual([{ companyId: maya.companyId, companyName: 'Larkfield' }]);
    accountant = accountantContext(who)!;
    const inbox = await accountantInbox(t.db, accountant);
    expect(inbox).toEqual([expect.objectContaining({ id: requestId, companyName: 'Larkfield', status: 'sent', summary: 'Please switch Person 0 (payroll E0) to salary sacrifice.' })]);
  });

  it('the accountant updates status and Fork knows only whom to tell', async () => {
    const email = await updateRequestStatus(t.db, accountant, requestId, 'done', 'Changed from October payroll.');
    expect(email).toBe('e0@l.test');
    expect((await myRequests(t.db, staff[0]!))[0]).toMatchObject({ status: 'done', note: 'Changed from October payroll.' });
  });

  it('the accountant can’t read anyone’s questions, pay or employee records', async () => {
    expect(await t.db.asMember(accountant, (db) => db.select().from(s.decisionRun))).toEqual([]);
    expect(await t.db.asMember(accountant, (db) => db.select().from(s.employee))).toEqual([]);
    expect(await t.db.asMember(accountant, (db) => db.select().from(s.payRecord))).toEqual([]);
  });

  it('owners and other staff can’t see an employee’s request; an employee can’t update status', async () => {
    expect(await t.db.asMember(maya, (db) => db.select().from(s.actionRequest))).toEqual([]);
    expect(await myRequests(t.db, staff[1]!)).toEqual([]);
    await expect(updateRequestStatus(t.db, staff[0]!, requestId, 'declined', null)).rejects.toThrow();
  });
});

describe('the owner’s dashboard follows the group-size rule', () => {
  it('a topic appears only once five different people have asked', async () => {
    const ask = (i: number) => recordRun(t.db, staff[i]!, { question: 'should I get an electric car?', answer: screen('benefits.ev_scheme_or_own_car') });
    for (const i of [0, 1, 2, 3]) await ask(i);
    await ask(0); // The same person asking again doesn't count twice.
    expect((await ownerDashboard(t.db, maya)).topics.find((x) => x.family === 'benefits.ev_scheme_or_own_car')).toBeUndefined();
    await ask(4);
    expect((await ownerDashboard(t.db, maya)).topics).toContainEqual({ family: 'benefits.ev_scheme_or_own_car', people: 5 });
    // Employees can't call the counts.
    const rows = await t.db.asMember(staff[0]!, (db) => db.execute(`select * from fork_topic_counts(90)` as never));
    expect((rows as unknown as { rows: unknown[] }).rows).toEqual([]);
  });

  it('take-up and saving show only from five people switched', async () => {
    const switchFor = async (i: number) => {
      const a = screen('pension.salary_sacrifice_switch');
      await recordRun(t.db, staff[i]!, { question: 'switch?', answer: a });
      const r = await createRequest(t.db, staff[i]!, { runId: a.runId, kind: 'payroll.request', family: 'pension.salary_sacrifice_switch', summary: `Switch person ${i}`, figures: { employer_ni_saving: 200 } });
      await updateRequestStatus(t.db, accountant, r.id, 'done', null);
    };
    for (const i of [1, 2, 3]) await switchFor(i);
    expect((await ownerDashboard(t.db, maya)).switched).toBeNull(); // Person 0 plus three more: four.
    await switchFor(4);
    const d = await ownerDashboard(t.db, maya);
    expect(d.switched).toMatchObject({ people: 5, savingPerYear: 1040 });
    expect(d.joined).toBe(6);
  });

  it('employees and other companies get no dashboard', async () => {
    await expect(ownerDashboard(t.db, staff[0]!)).rejects.toThrow();
    const other = await ownerDashboard(t.db, otherOwner);
    expect(other.topics).toEqual([]);
    expect(other.switched).toBeNull();
  });
});
