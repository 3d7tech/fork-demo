// Turn mapped rows into checked people and pay. Every row is checked before anything is saved.
import Decimal from 'decimal.js';
import type { Mapping } from './fields';
import type { Cell, Table } from './read';

export interface PayrollRow {
  payrollRef: string;
  name: string;
  email: string | null;
  dateOfBirth: string | null;
  /** Pounds, two decimal places, as a string for the database. */
  annualSalary: string;
  hoursPerWeek: string;
  pensionPct: string | null;
  startDate: string | null;
  /** Upper case with spaces removed, such as "S1257L". */
  taxCode: string | null;
  /** Comma-separated plans, '' for none, or null when the export doesn't say. */
  studentLoans: string | null;
}

export type ProblemCode = 'missing' | 'not_a_number' | 'out_of_range' | 'not_a_date' | 'not_an_email' | 'duplicate' | 'not_recognised';
/** A problem with one value. `row` counts people from 1. No values are kept, only where and what. */
export interface RowProblem {
  row: number;
  field: string;
  code: ProblemCode;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(c: Cell): string | null {
  if (c === null) return null;
  const s = (c instanceof Date ? c.toISOString().slice(0, 10) : String(c)).trim();
  return s === '' ? null : s;
}

function number(c: Cell): Decimal | null | 'bad' {
  if (c === null || c === '') return null;
  if (typeof c === 'number') return new Decimal(c);
  const s = String(c).replace(/[£,\s%]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return 'bad';
  return new Decimal(s);
}

/** UK dates: 31/01/1990, 31-01-1990, 1990-01-31, or an Excel date. Two-digit years are refused. */
export function parseDate(c: Cell): string | null | 'bad' {
  if (c === null || c === '') return null;
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? 'bad' : c.toISOString().slice(0, 10);
  const s = String(c).trim();
  let y: number, m: number, d: number;
  let hit = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (hit) [y, m, d] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else if ((hit = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(hit[1]), Number(hit[2]), Number(hit[3])];
  else return 'bad';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'bad';
  return date.toISOString().slice(0, 10);
}

/** A tax code: letters and numbers, with an optional emergency marker (W1, M1, X). */
const TAX_CODE = /^[SC]?(K?\d{1,6}[LMNT]?|BR|D[0-2]|0T|NT)(W1|M1|X)?$/;

/**
 * Student loan plans as payroll exports write them: "Plan 2", "2", "Plan 1 & PGL", "Postgraduate",
 * "None". Returns the plans in Fork's names, '' for none, or 'bad' for anything unrecognised.
 */
export function parseStudentLoans(c: Cell): string | null | 'bad' {
  const t = text(c);
  if (t === null) return null;
  const plans = new Set<string>();
  for (const raw of t.toLowerCase().split(/\s*(?:,|\/|&|\+|;|\band\b)\s*/)) {
    const part = raw.trim();
    if (!part) continue;
    if (/^(none|no|n|0|-|n\/a)$/.test(part)) continue;
    const plan = part.match(/^(?:plan|type|sl)?\s*([1245])$/);
    if (plan) plans.add(`plan_${plan[1]}`);
    else if (/^(pg|pgl|postgrad(uate)?( loan)?|pgl loan)$/.test(part)) plans.add('postgraduate');
    else return 'bad';
  }
  return [...plans].sort().join(',');
}

export function parseRows(table: Table, mapping: Mapping): { rows: PayrollRow[]; problems: RowProblem[] } {
  const col = (field: keyof Mapping) => {
    const h = mapping[field];
    return h ? table.headers.indexOf(h) : -1;
  };
  const get = (r: Cell[], field: keyof Mapping): Cell => {
    const i = col(field);
    return i >= 0 ? (r[i] ?? null) : null;
  };
  // Excel stores 5% as 0.05. If every value in the pension column is 1 or less, read them as fractions.
  const pctIdx = col('pension_pct');
  const pctValues = pctIdx >= 0 ? table.rows.map((r) => number(r[pctIdx] ?? null)).filter((v): v is Decimal => v instanceof Decimal) : [];
  const pctAsFraction = pctValues.length > 0 && pctValues.every((v) => v.lte(1)) && pctValues.some((v) => v.gt(0));

  const problems: RowProblem[] = [];
  const rows: PayrollRow[] = [];
  const seen = new Set<string>();

  table.rows.forEach((r, i) => {
    const row = i + 1;
    const flag = (field: string, code: ProblemCode) => problems.push({ row, field, code });
    const before = problems.length;

    const ref = text(get(r, 'payroll_ref'));
    if (!ref) flag('payroll_ref', 'missing');
    else if (seen.has(ref)) flag('payroll_ref', 'duplicate');
    else seen.add(ref);

    const full = text(get(r, 'name'));
    const joined = [text(get(r, 'first_name')), text(get(r, 'last_name'))].filter(Boolean).join(' ');
    const name = full ?? (joined || null);
    if (!name) flag('name', 'missing');

    const email = text(get(r, 'email'));
    if (email && !EMAIL.test(email)) flag('email', 'not_an_email');

    const salary = number(get(r, 'annual_salary'));
    if (salary === null) flag('annual_salary', 'missing');
    else if (salary === 'bad') flag('annual_salary', 'not_a_number');
    else if (salary.lte(0) || salary.gte(1_000_000)) flag('annual_salary', 'out_of_range');

    const hours = number(get(r, 'hours_per_week'));
    if (hours === null) flag('hours_per_week', 'missing');
    else if (hours === 'bad') flag('hours_per_week', 'not_a_number');
    else if (hours.lte(0) || hours.gt(80)) flag('hours_per_week', 'out_of_range');

    let pension = number(get(r, 'pension_pct'));
    if (pension === 'bad') flag('pension_pct', 'not_a_number');
    else if (pension instanceof Decimal) {
      if (pctAsFraction) pension = pension.times(100);
      if (pension.lt(0) || pension.gt(100)) flag('pension_pct', 'out_of_range');
    }

    const dob = parseDate(get(r, 'date_of_birth'));
    if (dob === 'bad') flag('date_of_birth', 'not_a_date');
    const start = parseDate(get(r, 'start_date'));
    if (start === 'bad') flag('start_date', 'not_a_date');

    const taxCode = text(get(r, 'tax_code'))?.toUpperCase().replace(/\s+/g, '') ?? null;
    if (taxCode && !TAX_CODE.test(taxCode)) flag('tax_code', 'not_recognised');
    const loans = parseStudentLoans(get(r, 'student_loan'));
    if (loans === 'bad') flag('student_loan', 'not_recognised');

    if (problems.length > before) return;
    rows.push({
      payrollRef: ref!,
      name: name!,
      email: email ? email.toLowerCase() : null,
      dateOfBirth: dob as string | null,
      annualSalary: (salary as Decimal).toFixed(2),
      hoursPerWeek: (hours as Decimal).toFixed(2),
      pensionPct: pension instanceof Decimal ? pension.toFixed(2) : null,
      startDate: start as string | null,
      taxCode,
      studentLoans: loans as string | null,
    });
  });
  return { rows, problems };
}
