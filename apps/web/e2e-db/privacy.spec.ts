import { createHash, randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { asAdmin, schema as s } from '../../../packages/db/src';
import { localUrl } from '../../../packages/db/src/local';

// Acceptance criterion: "an owner account cannot read any individual employee's questions or
// decisions through the interface or the API". Each route is tried with the owner's own session.

const SECRET_QUESTION = 'brightwater secret: should i switch my pension to salary sacrifice before my divorce settles';
let ownerCookie = '';
let staffCookie = '';
let companyId = '';

async function sessionFor(db: Parameters<Parameters<typeof asAdmin>[1]>[0], userId: string) {
  const token = randomBytes(32).toString('base64url');
  await db.insert(s.session).values({ idHash: createHash('sha256').update(token).digest('hex'), userId, expiresAt: new Date(Date.now() + 3600_000) });
  return `fork_session=${token}`;
}

test.beforeAll(async () => {
  await asAdmin(localUrl('fork_e2e'), async (db) => {
    const [c] = await db.insert(s.company).values({ name: 'Brightwater', employerNiSharePct: '50' }).returning();
    const [olu, sam] = await db.insert(s.appUser).values([{ email: 'olu@brightwater.test' }, { email: 'sam@brightwater.test' }]).returning();
    const [emp] = await db.insert(s.employee).values({ companyId: c!.id, payrollRef: 'B1', name: 'Sam Reed', hoursPerWeek: '37.5' }).returning();
    const [up] = await db.insert(s.payrollUpload).values({ companyId: c!.id, fileName: 'p.csv', fileKey: 'k', sha256: 'h', sizeBytes: 1, headers: ['a'], status: 'imported' }).returning();
    await db.insert(s.payRecord).values({ companyId: c!.id, employeeId: emp!.id, uploadId: up!.id, periodEnd: '2026-09-30', annualSalary: '32000', hoursPerWeek: '37.5', pensionPct: '5' });
    await db.insert(s.pensionScheme).values({ companyId: c!.id, name: 'Brightwater pension', reliefMethod: 'relief_at_source', basis: 'full_salary', employerPct: '3', employeeDefaultPct: '5' });
    await db.insert(s.membership).values([
      { userId: olu!.id, companyId: c!.id, role: 'owner' },
      { userId: sam!.id, companyId: c!.id, role: 'employee', employeeId: emp!.id },
    ]);
    ownerCookie = await sessionFor(db, olu!.id);
    staffCookie = await sessionFor(db, sam!.id);
    companyId = c!.id;
  });
});

async function ask(request: APIRequestContext, cookie: string, question: string): Promise<string> {
  const res = await request.post('/api/ask', { headers: { cookie }, data: { question } });
  expect(res.ok()).toBe(true);
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  return lines.find((l) => l.type === 'answer').answer.runId;
}

test('an owner cannot read an employee’s question or answer through any route', async ({ request }) => {
  const runId = await ask(request, staffCookie, SECRET_QUESTION);
  expect(runId).toMatch(/^[0-9a-f-]{36}$/);

  // The employee can use their own answer.
  expect((await request.post('/api/recalculate', { headers: { cookie: staffCookie }, data: { runId, levers: { contribution_pct: 6 } } })).status()).toBe(200);

  // The owner, with the run's id in hand, gets nothing from any API.
  for (const path of ['/api/recalculate', '/api/reexplain', '/api/action']) {
    const res = await request.post(path, { headers: { cookie: ownerCookie }, data: { runId, levers: { contribution_pct: 6 } } });
    expect(res.status(), path).toBe(404);
    expect(await res.text()).not.toContain('divorce');
  }

  // Nor from any page or download.
  for (const path of ['/', '/decisions', '/dashboard', '/me', '/me/download', '/setup', '/setup/team']) {
    const res = await request.get(path, { headers: { cookie: ownerCookie } });
    expect(await res.text(), path).not.toContain('divorce');
  }

  // Claiming the employee role in the company doesn't help: the owner has no such membership.
  const asEmployee = `${ownerCookie}; fork_as=${companyId}.employee`;
  expect((await request.post('/api/recalculate', { headers: { cookie: asEmployee }, data: { runId } })).status()).toBe(404);
  expect(await (await request.get('/me/download', { headers: { cookie: asEmployee } })).text()).not.toContain('divorce');

  // The employee's own download has it.
  expect(await (await request.get('/me/download', { headers: { cookie: staffCookie } })).text()).toContain('divorce');
});

test('signed-out requests get nothing', async ({ request }) => {
  for (const path of ['/api/ask', '/api/recalculate', '/api/reexplain', '/api/action']) {
    expect((await request.post(path, { data: { question: 'x', runId: '00000000-0000-0000-0000-000000000000' } })).status(), path).toBe(401);
  }
  expect((await request.get('/me/download')).status()).toBe(401);
  const page = await request.get('/dashboard', { maxRedirects: 0 });
  expect([303, 307, 308]).toContain(page.status());
});

test('an employee cannot reach owner pages or another company', async ({ request }) => {
  for (const path of ['/setup', '/setup/team', '/setup/payroll', '/dashboard', '/accountant']) {
    const res = await request.get(path, { headers: { cookie: staffCookie }, maxRedirects: 0 });
    expect([303, 307, 308], path).toContain(res.status());
  }
  const other = `${staffCookie}; fork_as=00000000-0000-0000-0000-000000000000.owner`;
  const res = await request.get('/setup/team', { headers: { cookie: other }, maxRedirects: 0 });
  expect([303, 307, 308]).toContain(res.status());
});
