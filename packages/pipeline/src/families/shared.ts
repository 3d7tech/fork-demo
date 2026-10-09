import { uk } from '@fork/calc';
import type { CalcResult, Fact, VisualData } from '@fork/spec';

export const num = (v: unknown, what = 'value'): number => {
  if (typeof v !== 'number') throw new Error(`Expected a number for ${what}, got ${typeof v}`);
  return v;
};

export const relief = (v: Fact['value'] | undefined): 'relief_at_source' | 'net_pay' => {
  if (v !== 'relief_at_source' && v !== 'net_pay') throw new Error(`Unknown relief method ${String(v)}`);
  return v;
};

/** A floor for bar charts so a small difference is visible: 97% of the smaller value, rounded down to £100. */
export const floorFor = (...values: number[]) => {
  const floor = Math.floor((Math.min(...values) * 0.97) / 100) * 100;
  return { value: floor, display: `£${floor.toLocaleString('en-GB')}` };
};

/** The tax year a scheme starting now would start in: 6 April this year, or last year before 6 April. */
export function taxYearStart(today = new Date()): string {
  const y = today.getUTCFullYear();
  const april6 = Date.UTC(y, 3, 6);
  return `${today.getTime() >= april6 ? y : y - 1}-04-06`;
}

/**
 * The person's tax profile facts (ADR 0010). Optional: any that are missing take the default,
 * and the module lists each default as an assumption on screen.
 */
export const PROFILE_FACTS = [
  'tax_region',
  'student_loans',
  'variable_pay',
  'other_income',
  'child_benefit_children',
  'higher_earner',
  'other_pension_savings',
  'flexibly_accessed',
  'age',
] as const;

const PLANS: uk.StudentLoanPlan[] = ['plan_1', 'plan_2', 'plan_4', 'plan_5', 'postgraduate'];

/** Build the module's profile from whatever profile facts are known. */
export function profileFrom(f: Record<string, Fact['value']>): { profile: uk.TaxProfile; assumed: Array<keyof uk.TaxProfile> } {
  const d = uk.DEFAULT_PROFILE;
  const assumed: Array<keyof uk.TaxProfile> = [];
  const pick = <K extends keyof uk.TaxProfile>(key: K, fact: string, read: (v: Fact['value']) => uk.TaxProfile[K] | undefined): uk.TaxProfile[K] => {
    const v = f[fact] === undefined ? undefined : read(f[fact]!);
    if (v === undefined) assumed.push(key);
    return v ?? d[key];
  };
  const number = (v: Fact['value']) => (typeof v === 'number' && v >= 0 ? v : undefined);
  const yes = (v: Fact['value']) => (typeof v === 'boolean' ? v : v === 'yes' ? true : v === 'no' ? false : undefined);
  const profile: uk.TaxProfile = {
    region: pick('region', 'tax_region', (v) => (v === 'scotland' || v === 'rest_of_uk' ? v : undefined)),
    studentLoans: pick('studentLoans', 'student_loans', (v) =>
      typeof v === 'string' ? (v.split(',').map((x) => x.trim()).filter((x) => PLANS.includes(x as uk.StudentLoanPlan)) as uk.StudentLoanPlan[]) : undefined,
    ),
    variablePay: pick('variablePay', 'variable_pay', number),
    otherIncome: pick('otherIncome', 'other_income', number),
    childBenefitChildren: pick('childBenefitChildren', 'child_benefit_children', number),
    higherEarner: pick('higherEarner', 'higher_earner', yes),
    otherPensionSavings: pick('otherPensionSavings', 'other_pension_savings', number),
    flexiblyAccessed: pick('flexiblyAccessed', 'flexibly_accessed', yes),
    age: pick('age', 'age', number),
  };
  return { profile, assumed };
}

type SlipKey = 'gross' | 'pension' | 'tax' | 'ni' | 'student_loan' | 'take_home';
const SLIP_LINES: Array<{ key: SlipKey; label: string; kind: 'pay' | 'deduction' | 'take_home' }> = [
  { key: 'gross', label: 'Pay', kind: 'pay' },
  { key: 'pension', label: 'Pension', kind: 'deduction' },
  { key: 'tax', label: 'Income tax', kind: 'deduction' },
  { key: 'ni', label: 'National Insurance', kind: 'deduction' },
  { key: 'student_loan', label: 'Student loan', kind: 'deduction' },
  { key: 'take_home', label: 'Take-home', kind: 'take_home' },
];

/**
 * Two payslips from the engine's `payslipOutputs` (prefixes `a` and `b`). Every figure is an
 * engine output with its screen display; lines the engine didn't produce (no student loan) are left out.
 */
export function payslipVisual(
  calc: CalcResult,
  display: (key: string) => string,
  o: { title: string; a: { prefix: string; label: string }; b: { prefix: string; label: string }; difference: string; note?: string },
): VisualData {
  const slip = (s: typeof o.a, tone: 'a' | 'b') => ({
    label: s.label,
    tone,
    lines: SLIP_LINES.filter((l) => calc.outputs[`${s.prefix}_${l.key}`]).map((l) => ({
      id: l.key,
      label: l.label,
      value: calc.outputs[`${s.prefix}_${l.key}`]!.value,
      display: display(`${s.prefix}_${l.key}`),
      kind: l.kind,
    })),
  });
  const gain = calc.outputs[o.difference]!;
  return {
    type: 'payslip',
    title: o.title,
    difference: { value: gain.value, display: display(o.difference), label: gain.value >= 0 ? 'more a month' : 'less a month' },
    slips: [slip(o.a, 'a'), slip(o.b, 'b')],
    ...(o.note ? { note: o.note } : {}),
  };
}

type Tone = 'a' | 'b' | 'c' | 'd' | 'muted';

/** One engine output as a visual part: its value, the screen's display of it, a label and a tone. */
export function partOf(calc: CalcResult, display: (key: string) => string, key: string, label?: string, tone: Tone = 'a') {
  const o = calc.outputs[key];
  if (!o) throw new Error(`No output ${key} for the visual`);
  return { value: o.value, display: display(key), label: label ?? o.label, tone };
}
