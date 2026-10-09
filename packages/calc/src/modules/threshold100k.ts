import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, max, q, type Rules } from '../core';
import { annualAllowanceCheck, profileAssumptions, profileOf, type Profiled } from '../profile';
import { jobPay } from '../uk';

export interface Threshold100kInput extends Profiled {
  salary: number;
  /** Pension contribution already made by salary sacrifice, as a percentage of salary. */
  sacrificePct: number;
  /** Extra sacrifice a year the person is considering (the lever). */
  extraSacrifice: number;
  childrenUsingTaxFreeChildcare: number;
  employerContributionPct: number;
}

function at(r: Rules, i: Threshold100kInput, extra: Decimal | number) {
  const salary = D(i.salary);
  const sacrifice = salary.times(i.sacrificePct).div(100).plus(extra);
  // Adjusted net income includes variable pay and other income from the person's profile.
  const job = jobPay(r, { salary, sacrifice, profile: profileOf(i) });
  const ani = job.adjustedNetIncome;
  const limit = r.num('tax_free_childcare.income_limit');
  const childcare = ani.lte(limit) ? r.num('tax_free_childcare.max_per_child').times(i.childrenUsingTaxFreeChildcare) : D(0);
  return { ani, takeHome: job.takeHome, childcare, sacrifice };
}

export function threshold100k(r: Rules, i: Threshold100kInput): CalcResult {
  const limit = r.num('income_tax.allowance_taper_threshold');
  const base = at(r, i, 0);
  const choice = at(r, i, i.extraSacrifice);
  const needed = max(0, base.ani.minus(limit));
  const atNeeded = at(r, i, needed);
  const cost = base.takeHome.minus(atNeeded.takeHome);
  // Share of each £1 above the threshold lost to tax and NI: what "taxed at about 62%" means.
  const marginal = needed.gt(0) ? D(1).minus(cost.div(needed)).times(100) : D(0);
  const verdictFor = (ani: Decimal) => (ani.gt(limit) ? 'over_threshold' : 'under_threshold');

  return {
    module: 'pay.threshold_100k',
    rulePack: r.packInfo(),
    verdict: verdictFor(choice.ani),
    outputs: {
      adjusted_net_income: q(base.ani, 'GBP', 'Adjusted net income doing nothing'),
      adjusted_net_income_choice: q(choice.ani, 'GBP', 'Adjusted net income with your choice'),
      extra_to_threshold: q(needed, 'GBP', 'Extra sacrifice to get back to £100,000'),
      take_home_cost_to_threshold: q(cost, 'GBP', 'Take-home lost by sacrificing that amount'),
      marginal_rate_pct: q(marginal, 'pct', 'Tax and NI on pay between £100,000 and your income'),
      childcare_kept_at_threshold: q(atNeeded.childcare, 'GBP', 'Childcare support kept at £100,000'),
      take_home: q(choice.takeHome, 'GBP', 'Take-home a year with your choice'),
      take_home_change: q(choice.takeHome.minus(base.takeHome), 'GBP', 'Take-home change against doing nothing'),
      childcare: q(choice.childcare, 'GBP', 'Childcare support with your choice'),
      childcare_change: q(choice.childcare.minus(base.childcare), 'GBP', 'Childcare change against doing nothing'),
      pension_total: q(choice.sacrifice.plus(D(i.salary).times(i.employerContributionPct).div(100)), 'GBP', 'Into your pension a year'),
    },
    tippingPoint: { description: 'Above this the personal allowance tapers and Tax-Free Childcare stops', measure: 'adjusted_net_income', at: limit.toNumber(), unit: 'GBP' },
    leverRanges: leverRanges('extra_sacrifice', { min: 0, max: 15000, step: 100 }, (x) => verdictFor(at(r, i, x).ani)),
    constraints: [annualAllowanceCheck(r, { ...i, personal: choice.sacrifice, employer: D(i.salary).times(i.employerContributionPct).div(100) }).constraint],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')}, ${i.sacrificePct}% pension by salary sacrifice`, source: 'payroll_export', estimate: false },
      { text: 'No gift aid, and no pension contributions outside payroll', source: 'estimate', estimate: true },
      { text: `${i.childrenUsingTaxFreeChildcare} children using Tax-Free Childcare, each at the yearly maximum`, source: 'user_answer', estimate: false },
      ...profileAssumptions(r, i, { adjustedNetIncome: choice.ani }),
    ],
  };
}
