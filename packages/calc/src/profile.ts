import type { CalcResult } from '@fork/spec';
import { D, type Decimal, type Num, type Rules } from './core';
import { annualAllowance, DEFAULT_PROFILE, type StudentLoanPlan, type TaxProfile } from './uk';

type Assumption = CalcResult['assumptions'][number];
type Constraint = CalcResult['constraints'][number];

/** What a module needs to know about the person: their profile, and which parts of it are defaults. */
export interface Profiled {
  profile?: TaxProfile;
  /** Profile fields Fork doesn't know and has assumed (the default), so screens say so. */
  assumed?: Array<keyof TaxProfile>;
}

export const profileOf = (i: Profiled): TaxProfile => i.profile ?? DEFAULT_PROFILE;

const PLAN_NAMES: Record<StudentLoanPlan, string> = {
  plan_1: 'Plan 1',
  plan_2: 'Plan 2',
  plan_4: 'Plan 4',
  plan_5: 'Plan 5',
  postgraduate: 'a postgraduate loan',
};

const pounds = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;

/**
 * The assumptions a screen lists about the person's tax position. A known fact links to its fact,
 * so the pipeline shows where it came from; a default is an estimate and says what was assumed.
 */
export function profileAssumptions(r: Rules, i: Profiled, opts: { adjustedNetIncome?: Num; minimumWage?: boolean } = {}): Assumption[] {
  const p = profileOf(i);
  const assumed = new Set(i.profile ? (i.assumed ?? []) : (Object.keys(DEFAULT_PROFILE) as Array<keyof TaxProfile>));
  const known = (k: keyof TaxProfile, fact: string, text: string, estimate = false): Assumption =>
    assumed.has(k) ? { text, source: 'estimate', estimate: true, asWritten: true } : { text, source: 'user_answer', estimate, fact, asWritten: true };
  const out: Assumption[] = [
    known('region', 'tax_region', p.region === 'scotland' ? 'Scottish income tax rates' : 'Income tax rates for England, Wales and Northern Ireland'),
    known(
      'studentLoans',
      'student_loans',
      p.studentLoans.length ? `Repaying ${p.studentLoans.map((x) => PLAN_NAMES[x]).join(' and ')} through payroll` : 'No student loan to repay',
    ),
  ];
  if (p.variablePay > 0) out.push(known('variablePay', 'variable_pay', `About ${pounds(p.variablePay)} a year of overtime, commission or bonus`, true));
  if (p.otherIncome > 0) out.push(known('otherIncome', 'other_income', `About ${pounds(p.otherIncome)} a year of taxable income outside this job`, true));
  if (p.variablePay === 0 && p.otherIncome === 0 && (assumed.has('variablePay') || assumed.has('otherIncome'))) {
    out.push({ text: 'No overtime, commission or income outside this job', source: 'estimate', estimate: true, asWritten: true });
  }
  if (opts.adjustedNetIncome !== undefined && D(opts.adjustedNetIncome).gt(r.num('child_benefit_charge.threshold'))) {
    if (p.childBenefitChildren > 0) {
      out.push(
        known(
          'childBenefitChildren',
          'child_benefit_children',
          `Child Benefit for ${p.childBenefitChildren} ${p.childBenefitChildren === 1 ? 'child' : 'children'}, and you ${p.higherEarner ? 'are' : 'are not'} the higher earner at home`,
        ),
      );
    } else if (assumed.has('childBenefitChildren')) {
      out.push({ text: 'No Child Benefit claimed in your household', source: 'estimate', estimate: true, asWritten: true });
    }
  }
  if (opts.minimumWage && p.age === null) out.push({ text: 'Your age isn’t known, so the minimum wage check uses the adult rate', source: 'estimate', estimate: true, asWritten: true });
  return out;
}

/**
 * Whether a year's pension savings fit the annual allowance. Income measures are approximate
 * (they matter only above £200,000); carry forward isn't counted, so going over is a caution.
 */
export function annualAllowanceCheck(
  r: Rules,
  i: Profiled & { salary: Num; personal: Num; employer: Num },
): { constraint: Constraint; allowance: Decimal; savings: Decimal } {
  const p = profileOf(i);
  const thresholdIncome = D(i.salary).plus(p.variablePay).plus(p.otherIncome);
  const allowance = annualAllowance(r, { thresholdIncome, adjustedIncome: thresholdIncome.plus(i.employer), flexiblyAccessed: p.flexiblyAccessed });
  const savings = D(i.personal).plus(i.employer).plus(p.otherPensionSavings);
  return { constraint: { id: 'annual_allowance', outcome: savings.gt(allowance) ? 'caution' : 'pass' }, allowance, savings };
}
