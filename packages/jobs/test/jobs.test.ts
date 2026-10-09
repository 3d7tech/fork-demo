import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asAdmin, schema as s } from '@fork/db';
import { freshDatabase, type TestDatabase } from '@fork/db/testing';
import { askFork, type DecisionScreen } from '@fork/pipeline';
import { DbFactStore, factRecord, listSaved, readOutbox, recordRun, saveCompanySettings, saveDecision, saveScheme } from '@fork/setup';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deps as pipelineDeps, good, QUESTION } from '../../pipeline/test/helpers';
import { runMonthly, runRecheck } from '../src';

let t: TestDatabase;
const ids = {} as { company: string; maya: string; ella: string; ellaEmp: string; upload: string };

beforeAll(async () => {
  process.env.FORK_DEV_OUTBOX = '1';
  process.env.FORK_OUTBOX_FILE = join(mkdtempSync(join(tmpdir(), 'fork-outbox-')), 'outbox.jsonl');
  t = await freshDatabase();
  await asAdmin(t.adminUrl, async (db) => {
    const [c] = await db.insert(s.company).values({ name: 'Larkfield' }).returning();
    const [maya, ella] = await db.insert(s.appUser).values([{ email: 'maya@l.test' }, { email: 'ella@l.test' }]).returning();
    const [emp] = await db.insert(s.employee).values({ companyId: c!.id, payrollRef: 'LA104', name: 'Ella Brooks', hoursPerWeek: '37.5' }).returning();
    await db.insert(s.membership).values([
      { userId: maya!.id, companyId: c!.id, role: 'owner' },
      { userId: ella!.id, companyId: c!.id, role: 'employee', employeeId: emp!.id },
    ]);
    const [up] = await db.insert(s.payrollUpload).values({ companyId: c!.id, fileName: 'sep.csv', fileKey: 'k', sha256: 'h', sizeBytes: 1, headers: ['a'] }).returning();
    await db.insert(s.payRecord).values({ companyId: c!.id, employeeId: emp!.id, uploadId: up!.id, periodEnd: '2026-09-30', annualSalary: '32000', hoursPerWeek: '37.5', pensionPct: '5' });
    Object.assign(ids, { company: c!.id, maya: maya!.id, ella: ella!.id, ellaEmp: emp!.id, upload: up!.id });
  });
  const maya = { userId: ids.maya, companyId: ids.company, role: 'owner' as const };
  await saveCompanySettings(t.db, maya, { employerNiSharePct: 50, employmentAllowance: false, brandColour: null });
  await saveScheme(t.db, maya, { name: 'Larkfield pension', provider: null, reliefMethod: 'relief_at_source', basis: 'full_salary', employerPct: 3, employeeDefaultPct: 5 });
});
afterAll(async () => t?.drop());

const jobDeps = () => ({ db: t.db, adminUrl: t.adminUrl, baseUrl: 'https://fork.test' });

describe('saved decisions are re-checked when pay changes', () => {
  it('Ella saves her salary sacrifice answer; nothing changed, so no email', async () => {
    const ella = { userId: ids.ella, companyId: ids.company, role: 'employee' as const };
    const subject = { audience: 'employee' as const, companyId: ids.company, employeeId: ids.ellaEmp };
    const store = new DbFactStore(t.db, ella);
    const { deps } = pipelineDeps(good, { facts: store });
    const screen = (await askFork(deps, { question: QUESTION, subject })) as DecisionScreen;
    expect(screen.kind).toBe('decision');
    await recordRun(t.db, ella, { question: QUESTION, answer: screen });
    const facts = await store.get(subject, ['salary', 'contribution_pct', 'relief_method', 'employer_share_pct', 'employer_contribution_pct', 'hours_per_week']);
    await saveDecision(t.db, ella, screen.runId, 'Switch to salary sacrifice', {
      facts: factRecord(facts),
      rulePack: `${screen.calc.rulePack.id}@${screen.calc.rulePack.version}`,
      verdict: screen.calc.verdict,
      headline: { take_home_gain: screen.calc.outputs.take_home_gain!.value, employer_share: screen.calc.outputs.employer_share!.value },
    });
    expect(await runRecheck(jobDeps())).toEqual({ changed: 0 });
  });

  it('a pay rise moves the numbers: Ella is told what changed, in code-written words', async () => {
    await asAdmin(t.adminUrl, async (db) => {
      const [up] = await db.insert(s.payrollUpload).values({ companyId: ids.company, fileName: 'oct.csv', fileKey: 'k2', sha256: 'h2', sizeBytes: 1, headers: ['a'] }).returning();
      await db.insert(s.payRecord).values({ companyId: ids.company, employeeId: ids.ellaEmp, uploadId: up!.id, periodEnd: '2026-10-31', annualSalary: '36000', hoursPerWeek: '37.5', pensionPct: '5' });
    });
    expect(await runRecheck(jobDeps())).toEqual({ changed: 1 });
    const ella = { userId: ids.ella, companyId: ids.company, role: 'employee' as const };
    const [saved] = await listSaved(t.db, ella);
    expect(saved!.changeNote).toContain('Your pay a year changed from £32,000 to £36,000.');
    expect(saved!.changeNote).toMatch(/Extra take-home a year: now £\d+, was £128\./);
    expect(readOutbox()[0]).toMatchObject({ to: 'ella@l.test', subject: 'Something changed: Switch to salary sacrifice' });
    // Re-checking again doesn't repeat the email.
    expect(await runRecheck(jobDeps())).toEqual({ changed: 0 });
  });
});

describe('monthly emails', () => {
  it('Ella gets her pay explained; Maya gets a report with counts only', async () => {
    const r = await runMonthly(jobDeps());
    expect(r).toMatchObject({ payslips: 1, reports: 1 });
    const mails = readOutbox();
    const payslip = mails.find((m) => m.to === 'ella@l.test' && m.subject.startsWith('Your pay for'))!;
    expect(payslip.subject).toBe('Your pay for October 2026, explained');
    expect(payslip.text).toContain('Salary: £36,000 a year, about £3,000 a month');
    expect(payslip.text).toContain('your salary changed from £32,000 to £36,000 a year');
    expect(payslip.text).toContain('you pay 5% of your pay, and Larkfield adds 3%');
    const report = mails.find((m) => m.to === 'maya@l.test')!;
    expect(report.text).toContain('Staff on Fork: 1 of 1.');
    expect(report.text).toContain('fewer than 5 people have switched');
    // The owner's report never names anyone or shows anyone's pay.
    expect(report.text).not.toMatch(/Ella|36,000|32,000/);
  });
});
