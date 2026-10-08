import type { CalcResult } from '@fork/spec';
import { D, max, min, q, type Rules } from '../core';
import { employerNI, employerNISaving } from '../uk';

export interface HireCostInput {
  salary: number;
  employerPensionPct: number;
  /** What the scheme works employer contributions out on. A per-scheme setting. */
  pensionBasis: 'full_salary' | 'qualifying_earnings';
  /** Employee contribution by salary sacrifice; 0 if they pay from take-home pay. */
  employeeSacrificePct: number;
  extrasPerYear: number;
  /** Sacrifice rate used to show what salary sacrifice would save if they don't use it. */
  illustrativeSacrificePct?: number;
}

export function hireCost(r: Rules, i: HireCostInput): CalcResult {
  const salary = D(i.salary);
  const sac = salary.times(i.employeeSacrificePct).div(100);
  const ni = employerNI(r, salary.minus(sac));
  const pensionable =
    i.pensionBasis === 'full_salary'
      ? salary
      : max(0, min(salary, r.num('pension.qualifying_earnings_upper')).minus(r.num('pension.qualifying_earnings_lower')));
  const pension = pensionable.times(i.employerPensionPct).div(100);
  const total = salary.plus(ni).plus(pension).plus(i.extrasPerYear);
  const niIfSacrifice = employerNISaving(r, salary, salary.times(i.illustrativeSacrificePct ?? 5).div(100));

  return {
    module: 'employer.hire_cost',
    rulePack: r.packInfo(),
    verdict: 'cost',
    outputs: {
      salary: q(salary, 'GBP', 'Salary'),
      employer_ni: q(ni, 'GBP', 'Employer NI a year'),
      employer_pension: q(pension, 'GBP', 'Employer pension a year'),
      extras: q(i.extrasPerYear, 'GBP', 'Equipment and extras a year', true),
      total: q(total, 'GBP', 'Total cost a year'),
      monthly: q(total.div(12), 'GBP', 'Total cost a month'),
      above_salary_pct: q(total.div(salary).minus(1).times(100), 'pct', 'Cost above salary'),
      above_salary: q(total.minus(salary), 'GBP', 'Cost above salary a year'),
      ni_saved_by_sacrifice: q(employerNISaving(r, salary, sac), 'GBP', 'Employer NI saved by their salary sacrifice'),
      ni_saving_if_sacrifice_5pct: q(niIfSacrifice, 'GBP', `Employer NI saved if they sacrificed ${i.illustrativeSacrificePct ?? 5}%`),
      cost_per_1000_salary: q(salary.plus(ni).plus(pension).div(salary).times(1000), 'GBP', 'Cost of each £1,000 of pay before extras'),
    },
    leverRanges: [],
    constraints: [],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Employer pension ${i.employerPensionPct}% of ${i.pensionBasis === 'full_salary' ? 'full salary' : 'qualifying earnings'}`, source: 'pension_scheme', estimate: false },
      { text: 'NI bill already above the Employment Allowance, so the new hire’s NI is a real cost', source: 'payroll_export', estimate: false },
      { text: 'Not included: recruitment fees, training, bonus or car allowance', source: 'rules', estimate: false },
    ],
  };
}
