import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asAdmin, schema as s } from '@fork/db';
import { freshDatabase, type TestDatabase } from '@fork/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanFacts, confirmAllFacts, confirmedFacts, confirmFact, documentType, listDocuments, LocalFileStore, parseTyped, prepareDocument, readDocument, removeFact, uploadDocument, type DocumentInterpreter } from '../src';

const fixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, '../fixtures', name)));

describe('reading documents', () => {
  it('accepts PDFs and Word files by their contents, not just their names', async () => {
    expect(documentType('scheme.pdf', fixture('larkfield-pension-scheme.pdf'))).toBe('pdf');
    expect(documentType('handbook.docx', fixture('larkfield-handbook.docx'))).toBe('docx');
    expect(() => documentType('fake.pdf', fixture('larkfield-payroll.csv'))).toThrow(/PDF or Word/);
    expect(() => documentType('virus.exe', fixture('larkfield-handbook.docx'))).toThrow(/PDF or Word/);
  });

  it('turns a Word file into text for the interpreter', async () => {
    const p = await prepareDocument('handbook.docx', fixture('larkfield-handbook.docx'));
    expect(p.document.mediaType).toBe('text/plain');
    expect(p.document.mediaType === 'text/plain' && p.document.text).toContain('25 days');
  });
});

describe('cleaning what the interpreter returns', () => {
  it('keeps only known keys for this kind of document, of the right type, once each', () => {
    const out = cleanFacts('pension_scheme', {
      facts: [
        { key: 'employer_pct', value: 3, page: 2, quote: 'Larkfield pays 3%' },
        { key: 'employer_pct', value: 4, page: 3, quote: 'again' },
        { key: 'employee_default_pct', value: '5%', page: 2, quote: 'wrong type' },
        { key: 'relief_method', value: 'relief at source', page: 2, quote: 'not an option' },
        { key: 'holiday_days', value: 25, page: 1, quote: 'not a pension fact' },
        { key: 'invest_in', value: 'Acme Fund', page: 1, quote: 'made up' },
        { key: 'contribution_basis', value: 'full_salary', page: -1, quote: 'full salary' },
      ],
      instructionsFound: false,
    });
    expect(out).toEqual([
      { key: 'employer_pct', value: 3, page: 2, quote: 'Larkfield pays 3%' },
      { key: 'contribution_basis', value: 'full_salary', page: null, quote: 'full salary' },
    ]);
  });

  it('reads what an owner types when they correct a value', () => {
    expect(parseTyped('employer_pct', '4%')).toBe(4);
    expect(parseTyped('employer_pct', '140')).toBeNull();
    expect(parseTyped('cycle_to_work_limit', '£2,500')).toBe(2500);
    expect(parseTyped('salary_sacrifice_offered', 'yes')).toBe(true);
    expect(parseTyped('relief_method', 'net_pay')).toBe('net_pay');
    expect(parseTyped('relief_method', 'maybe')).toBeNull();
  });
});

describe('documents in the database', () => {
  let t: TestDatabase;
  let owner: { userId: string; companyId: string; role: 'owner' };
  let employee: { userId: string; companyId: string; role: 'employee' };
  let calls = 0;
  let seen = '';
  const interpreter: DocumentInterpreter = async (input, document) => {
    calls++;
    seen = JSON.stringify(input) + (document.mediaType === 'text/plain' ? document.text : '[pdf]');
    if (input.kind === 'pension_scheme')
      return {
        facts: [
          { key: 'employer_pct', value: 3, page: 2, quote: 'Larkfield pays 3% of your full salary' },
          { key: 'employee_default_pct', value: 5, page: 2, quote: 'You pay 5% of your full salary as standard' },
          { key: 'relief_method', value: 'relief_at_source', page: 2, quote: 'The scheme uses relief at source' },
        ],
        instructionsFound: false,
      };
    return { facts: [{ key: 'payslip_location', value: 'On the payroll portal; P60s by 31 May', page: null, quote: 'Payslips are on the payroll portal' }], instructionsFound: true };
  };

  beforeAll(async () => {
    t = await freshDatabase();
    await asAdmin(t.adminUrl, async (db) => {
      const [c] = await db.insert(s.company).values({ name: 'Larkfield' }).returning();
      const [maya, ella] = await db.insert(s.appUser).values([{ email: 'maya@l.test' }, { email: 'ella@l.test' }]).returning();
      const [emp] = await db.insert(s.employee).values({ companyId: c!.id, payrollRef: 'E1', name: 'Ella', hoursPerWeek: '37.5' }).returning();
      await db.insert(s.membership).values([
        { userId: maya!.id, companyId: c!.id, role: 'owner' },
        { userId: ella!.id, companyId: c!.id, role: 'employee', employeeId: emp!.id },
      ]);
      owner = { userId: maya!.id, companyId: c!.id, role: 'owner' };
      employee = { userId: ella!.id, companyId: c!.id, role: 'employee' };
    });
  });
  afterAll(async () => t?.drop());

  it('extracts facts at upload; nothing reaches employees until an owner confirms', async () => {
    const deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-docs-'))), interpreter };
    const r = await uploadDocument(deps, owner, { name: 'scheme.pdf', bytes: fixture('larkfield-pension-scheme.pdf'), kind: 'pension_scheme' });
    expect(r).toMatchObject({ facts: 3, instructionsFound: false, failed: false });
    expect(seen).toContain('employer_pct');
    expect(seen).not.toContain('holiday_days');

    expect((await confirmedFacts(t.db, employee)).size).toBe(0);
    const doc = (await readDocument(t.db, owner, r.documentId))!;
    await confirmFact(t.db, owner, doc.facts.find((f) => f.key === 'employer_pct')!.id, '4');
    await removeFact(t.db, owner, doc.facts.find((f) => f.key === 'relief_method')!.id);
    const seenByEmployee = await confirmedFacts(t.db, employee);
    expect([...seenByEmployee.values()].map((f) => [f.key, f.value, f.page])).toEqual([['employer_pct', 4, 2]]);

    await confirmAllFacts(t.db, owner, r.documentId);
    expect([...(await confirmedFacts(t.db, employee)).keys()].sort()).toEqual(['employee_default_pct', 'employer_pct']);
  });

  it('a document that tries to instruct the AI is flagged to the owner', async () => {
    const deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-docs-'))), interpreter };
    const r = await uploadDocument(deps, owner, { name: 'handbook.docx', bytes: fixture('larkfield-handbook.docx'), kind: 'handbook' });
    expect(r.instructionsFound).toBe(true);
    expect((await listDocuments(t.db, owner)).find((d) => d.id === r.documentId)).toMatchObject({ instructionsFound: true, facts: 1, unconfirmed: 1 });
  });

  it('without a model, the upload is kept and the owner fills in the details', async () => {
    const deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-docs-'))) };
    const r = await uploadDocument(deps, owner, { name: 'scheme.pdf', bytes: fixture('larkfield-pension-scheme.pdf'), kind: 'pension_scheme' });
    expect(r).toMatchObject({ facts: 0, failed: false });
  });

  it('when the model fails, the document is marked failed and nothing is invented', async () => {
    const deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-docs-'))), interpreter: async () => Promise.reject(new Error('down')) };
    const r = await uploadDocument(deps, owner, { name: 'scheme.pdf', bytes: fixture('larkfield-pension-scheme.pdf'), kind: 'pension_scheme' });
    expect(r).toMatchObject({ facts: 0, failed: true });
  });

  it('employees can’t upload, confirm or see unconfirmed facts', async () => {
    const deps = { db: t.db, files: new LocalFileStore(mkdtempSync(join(tmpdir(), 'fork-docs-'))), interpreter };
    await expect(uploadDocument(deps, employee, { name: 'scheme.pdf', bytes: fixture('larkfield-pension-scheme.pdf'), kind: 'pension_scheme' })).rejects.toThrow();
    const ownerDocs = await listDocuments(t.db, owner);
    const handbook = ownerDocs.find((d) => d.kind === 'handbook')!;
    const unconfirmed = (await readDocument(t.db, owner, handbook.id))!.facts[0]!;
    await confirmFact(t.db, employee, unconfirmed.id).catch(() => {});
    expect((await confirmedFacts(t.db, employee)).has('payslip_location')).toBe(false);
  });
});
