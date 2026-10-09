import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asAdmin, schema as s } from '@fork/db';
import { freshDatabase, type TestDatabase } from '@fork/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  columnShapes,
  DbFactStore,
  importPayroll,
  listPeople,
  LocalFileStore,
  mappingProblems,
  matchByHeader,
  parseRows,
  readTable,
  saveCompanySettings,
  saveScheme,
  suggestMapping,
  uploadPayroll,
  type Mapping,
  type SetupDeps,
} from '../src';

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../fixtures', name)));
const csv = (text: string) => new TextEncoder().encode(text);

describe('reading payroll exports', () => {
  it('reads the Larkfield CSV and matches every column by its header', async () => {
    const table = await readTable('pay.csv', fixture('larkfield-payroll.csv'));
    expect(table.rows).toHaveLength(34);
    expect(matchByHeader(table.headers)).toEqual({
      payroll_ref: 'Employee No',
      name: null,
      first_name: 'Forename',
      last_name: 'Surname',
      email: 'Email',
      date_of_birth: 'DOB',
      annual_salary: 'Basic Salary (£)',
      hours_per_week: 'Contracted Hours',
      pension_pct: 'EE Pension %',
      start_date: 'Start Date',
    });
  });

  it('reads Excel, skipping a title row, with dates and 5% stored as 0.05', async () => {
    const table = await readTable('pay.xlsx', fixture('larkfield-payroll.xlsx'));
    expect(table.headers).toEqual(['Works No.', 'Name', 'Date of birth', 'Salary p.a.', 'Std hrs', 'Pension EE', 'Joined']);
    const mapping: Mapping = {
      payroll_ref: 'Works No.',
      name: 'Name',
      date_of_birth: 'Date of birth',
      annual_salary: 'Salary p.a.',
      hours_per_week: 'Std hrs',
      pension_pct: 'Pension EE',
      start_date: 'Joined',
    };
    const { rows, problems } = parseRows(table, mapping);
    expect(problems).toEqual([]);
    expect(rows.find((r) => r.name === 'Ella Brooks')).toMatchObject({ annualSalary: '32000.00', hoursPerWeek: '37.50', pensionPct: '5.00', dateOfBirth: '2000-07-02' });
  });

  it('refuses other file types, empty files and duplicate headers', async () => {
    await expect(readTable('pay.pdf', csv('x'))).rejects.toThrow(/CSV or Excel/);
    await expect(readTable('pay.csv', csv('\n\n'))).rejects.toThrow(/empty/);
    await expect(readTable('pay.csv', csv('Name,Name\nA,B'))).rejects.toThrow(/both called “Name”/);
  });

  it('shapes describe columns without any value in them', async () => {
    const table = await readTable('pay.csv', fixture('larkfield-payroll.csv'));
    const shapes = columnShapes(table);
    expect(shapes.find((c) => c.header === 'Basic Salary (£)')?.shape).toBe('money');
    expect(shapes.find((c) => c.header === 'Email')?.shape).toBe('email');
    expect(JSON.stringify(shapes)).not.toMatch(/Brooks|32,000|larkfield\.test/);
  });
});

describe('checking rows', () => {
  const mapping: Mapping = { payroll_ref: 'Ref', name: 'Name', annual_salary: 'Salary', hours_per_week: 'Hours', date_of_birth: 'DOB', email: 'Email' };
  it('flags every problem by row and field, never by value', async () => {
    const table = await readTable(
      'pay.csv',
      csv('Ref,Name,Salary,Hours,DOB,Email\nA1,Ann,"£30,000",37.5,31/01/1990,ann@x.test\nA1,Bob,lots,90,1/2/90,not-an-email\n,,,,30/02/1990,\n'),
    );
    const { rows, problems } = parseRows(table, mapping);
    expect(rows.map((r) => r.name)).toEqual(['Ann']);
    expect(problems).toEqual([
      { row: 2, field: 'payroll_ref', code: 'duplicate' },
      { row: 2, field: 'email', code: 'not_an_email' },
      { row: 2, field: 'annual_salary', code: 'not_a_number' },
      { row: 2, field: 'hours_per_week', code: 'out_of_range' },
      { row: 2, field: 'date_of_birth', code: 'not_a_date' },
      { row: 3, field: 'payroll_ref', code: 'missing' },
      { row: 3, field: 'name', code: 'missing' },
      { row: 3, field: 'annual_salary', code: 'missing' },
      { row: 3, field: 'hours_per_week', code: 'missing' },
      { row: 3, field: 'date_of_birth', code: 'not_a_date' },
    ]);
  });

  it('a mapping must cover the required fields, including contracted hours', () => {
    expect(mappingProblems({ payroll_ref: 'Ref', name: 'Name', annual_salary: 'Salary' }, ['Ref', 'Name', 'Salary'])).toEqual(['Choose the column for contracted hours a week']);
    expect(mappingProblems({ payroll_ref: 'Ref', name: 'Ref', annual_salary: 'Salary', hours_per_week: 'Hrs' }, ['Ref', 'Salary'])).toEqual([
      '“Ref” is used for both Employee number and Full name',
      'Contracted hours a week: there’s no column called “Hrs”',
    ]);
  });
});

describe('the column matcher model', () => {
  it('fills a gap the headers can’t, sees only shapes, and anything invalid it says is ignored', async () => {
    const table = await readTable('pay.csv', csv('Ref,Name,Basic pay pa,Std hrs\nA1,Ann,30000,37.5\n'));
    let seen = '';
    const s = await suggestMapping(table, async (input) => {
      seen = JSON.stringify(input);
      return {
        mapping: [
          { field: 'annual_salary', header: 'Basic pay pa' },
          { field: 'hours_per_week', header: 'Std hrs' },
          { field: 'made_up', header: 'Ref' },
          { field: 'email', header: 'No such column' },
        ],
        unsure: ['hours_per_week'],
      };
    });
    expect(seen).not.toMatch(/"Ann"|30000/);
    expect(s.mapping).toMatchObject({ payroll_ref: 'Ref', name: 'Name', annual_salary: 'Basic pay pa', hours_per_week: 'Std hrs', email: null });
    expect(s.unsure).toEqual(['hours_per_week']);
  });

  it('when the model fails, header matching still works', async () => {
    const table = await readTable('pay.csv', fixture('larkfield-payroll.csv'));
    const s = await suggestMapping(table, async () => {
      throw new Error('down');
    });
    expect(s.by).toBe('headers');
    expect(s.mapping.annual_salary).toBe('Basic Salary (£)');
  });
});

describe('importing into the database', () => {
  let t: TestDatabase;
  let deps: SetupDeps;
  let ctx: { userId: string; companyId: string; role: 'owner' };
  let ellaUser: string;

  beforeAll(async () => {
    t = await freshDatabase();
    deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-files-'))) };
    await asAdmin(t.adminUrl, async (db) => {
      const [c] = await db.insert(s.company).values({ name: 'Larkfield' }).returning();
      const [maya, ella] = await db.insert(s.appUser).values([{ email: 'maya@larkfield.test' }, { email: 'ella.brooks@larkfield.test' }]).returning();
      await db.insert(s.membership).values({ userId: maya!.id, companyId: c!.id, role: 'owner' });
      ctx = { userId: maya!.id, companyId: c!.id, role: 'owner' };
      ellaUser = ella!.id;
    });
  });
  afterAll(async () => t?.drop());

  it('uploads, suggests a mapping, and imports 34 people with their pay', async () => {
    const up = await uploadPayroll(deps, ctx, { name: 'larkfield-payroll.csv', bytes: fixture('larkfield-payroll.csv') });
    expect(up.rowCount).toBe(34);
    const result = await importPayroll(deps, ctx, up.uploadId, up.mapping, '2026-09-30');
    expect(result).toEqual({ ok: true, people: 34, added: 34, updated: 0 });
    const people = await listPeople(t.db, ctx);
    expect(people).toHaveLength(34);
    expect(people.every((p) => p.status === 'not_invited')).toBe(true);
    await expect(importPayroll(deps, ctx, up.uploadId, up.mapping, '2026-09-30')).rejects.toThrow(/already been imported/);
  });

  it('a later export updates people rather than duplicating them', async () => {
    const up = await uploadPayroll(deps, ctx, { name: 'october.xlsx', bytes: fixture('larkfield-payroll.xlsx') });
    expect(up.mapping).toMatchObject({ payroll_ref: 'Works No.', name: 'Name', annual_salary: 'Salary p.a.' });
    const mapping = { ...up.mapping, hours_per_week: 'Std hrs', pension_pct: 'Pension EE' };
    expect(await importPayroll(deps, ctx, up.uploadId, mapping, '2026-10-31')).toEqual({ ok: true, people: 34, added: 0, updated: 34 });
  });

  it('a file with problems saves nothing and says which rows to fix', async () => {
    const up = await uploadPayroll(deps, ctx, { name: 'bad.csv', bytes: csv('Employee No,Name,Salary,Hours\nZ1,Zed,30000,\n') });
    const r = await importPayroll(deps, ctx, up.uploadId, up.mapping, '2026-10-31');
    expect(r).toEqual({ ok: false, mappingProblems: [], rowProblems: [{ row: 1, field: 'hours_per_week', code: 'missing' }] });
    expect((await listPeople(t.db, ctx)).some((p) => p.name === 'Zed')).toBe(false);
  });

  it('an employee can’t upload payroll', async () => {
    const ella = { userId: ellaUser, companyId: ctx.companyId, role: 'employee' as const };
    await expect(uploadPayroll(deps, ella, { name: 'x.csv', bytes: fixture('larkfield-payroll.csv') })).rejects.toThrow();
  });

  it('facts for a decision come from the database with their sources', async () => {
    await saveCompanySettings(t.db, ctx, { employerNiSharePct: 50, employmentAllowance: true, brandColour: null });
    await saveScheme(t.db, ctx, { name: 'Larkfield pension', provider: null, reliefMethod: 'relief_at_source', basis: 'full_salary', employerPct: 3, employeeDefaultPct: 5 });
    const ella = (await listPeople(t.db, ctx)).find((p) => p.name === 'Ella Brooks')!;
    await asAdmin(t.adminUrl, (db) => db.insert(s.membership).values({ userId: ellaUser, companyId: ctx.companyId, role: 'employee', employeeId: ella.id }));
    const asElla = new DbFactStore(t.db, { userId: ellaUser, companyId: ctx.companyId, role: 'employee' });
    const facts = await asElla.get({ companyId: ctx.companyId, employeeId: ella.id }, ['salary', 'contribution_pct', 'hours_per_week', 'employer_share_pct', 'employer_contribution_pct', 'relief_method']);
    expect(facts.map((f) => [f.id, f.value, f.source, f.asOf])).toEqual([
      ['salary', 32000, 'payroll_export', '2026-10-31'],
      ['contribution_pct', 5, 'payroll_export', '2026-10-31'],
      ['hours_per_week', 37.5, 'payroll_export', '2026-10-31'],
      ['employer_share_pct', 50, 'company_setting', expect.any(String)],
      ['employer_contribution_pct', 3, 'pension_scheme', expect.any(String)],
      ['relief_method', 'relief_at_source', 'pension_scheme', expect.any(String)],
    ]);
    // An owner gets company-wide counts, and the engine gets every salary; an employee gets neither.
    const asOwner = new DbFactStore(t.db, ctx);
    const ownerFacts = await asOwner.get({ companyId: ctx.companyId }, ['headcount', 'median_salary', 'fee_per_employee', 'employment_allowance', 'contribution_pct', 'pension_basis']);
    expect(Object.fromEntries(ownerFacts.map((f) => [f.id, f.value]))).toEqual({
      headcount: 34,
      median_salary: 40500,
      fee_per_employee: 4,
      employment_allowance: true,
      contribution_pct: 5,
      pension_basis: 'full_salary',
    });
    expect(await asOwner.payrollRows({ companyId: ctx.companyId })).toHaveLength(34);
    expect(await asElla.payrollRows({ companyId: ctx.companyId })).toEqual([]);
    expect(await asElla.get({ companyId: ctx.companyId, employeeId: ella.id }, ['headcount', 'median_salary'])).toEqual([]);

    // Ella asking about someone else's record gets nothing.
    const tom = (await listPeople(t.db, ctx)).find((p) => p.name === 'Tom Hale')!;
    expect(await asElla.get({ companyId: ctx.companyId, employeeId: tom.id }, ['salary'])).toEqual([]);
  });
});
