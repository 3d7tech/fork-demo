import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, max, q, type Rules } from '../core';
import { annualAllowanceCheck, profileAssumptions, profileOf, type Profiled } from '../profile';
import { childBenefit, jobPay, minimumWage, yearlyHours } from '../uk';

export interface ChildBenefitChargeInput extends Profiled {
  salary: number;
  hoursPerWeek: number;
  /** The person's pension contribution today, % of salary, paid the scheme's way. */
  contributionPct: number;
  reliefMethod: 'relief_at_source' | 'net_pay';
  employerContributionPct: number;
  /** Extra into the pension a year by salary sacrifice (the lever). */
  extraSacrifice: number;
  /** Children Child Benefit is claimed for, from the screen's question. */
  children: number;
  /** Whether this person is the higher earner at home, from the screen's question. */
  higherEarner: boolean;
}

function at(r: Rules, i: ChildBenefitChargeInput, extra: Decimal | number) {
  const profile = { ...profileOf(i), childBenefitChildren: i.children, higherEarner: i.higherEarner };
  const con = D(i.salary).times(i.contributionPct).div(100);
  const job = jobPay(r, { salary: i.salary, sacrifice: extra, profile, ...(i.reliefMethod === 'relief_at_source' ? { reliefAtSource: con } : { netPay: con }) });
  return { job, ani: job.adjustedNetIncome, charge: job.childBenefitCharge, net: job.takeHome.minus(job.childBenefitCharge), extra: D(extra), con };
}

/**
 * "Should I put more into my pension to stop paying back Child Benefit?" Between £60,000 and
 * £80,000 of adjusted net income the higher earner pays back 1% of the family's Child Benefit for
 * every £200; extra pension by salary sacrifice brings that income down.
 */
export function childBenefitCharge(r: Rules, i: ChildBenefitChargeInput): CalcResult {
  const threshold = r.num('child_benefit_charge.threshold');
  const affected = i.higherEarner && i.children > 0;
  const base = at(r, i, 0);
  const choice = at(r, i, i.extraSacrifice);
  const needed = max(0, base.ani.minus(threshold));
  const atNeeded = at(r, i, needed);
  const takeHomeCost = base.job.takeHome.minus(atNeeded.job.takeHome);
  const netCost = base.net.minus(atNeeded.net);
  // What's lost from each £1 of pay in this band to tax, NI and the charge: why the band is expensive.
  const lostPct = needed.gt(0) ? D(1).minus(netCost.div(needed)).times(100) : D(0);
  const employer = D(i.salary).times(i.employerContributionPct).div(100);
  const allowance = annualAllowanceCheck(r, { ...i, personal: choice.con.plus(choice.extra), employer });
  const minWageOk = (extra: Decimal | number) => D(i.salary).minus(extra).div(yearlyHours(i.hoursPerWeek)).gte(minimumWage(r, profileOf(i).age));
  const verdictFor = (ani: Decimal, extra: Decimal | number) =>
    !affected ? 'not_affected' : !minWageOk(extra) ? 'not_eligible' : ani.lte(threshold) ? 'under_threshold' : 'over_threshold';

  return {
    module: 'pay.child_benefit_charge',
    rulePack: r.packInfo(),
    verdict: verdictFor(choice.ani, choice.extra),
    outputs: {
      adjusted_net_income: q(base.ani, 'GBP', 'Adjusted net income doing nothing'),
      adjusted_net_income_choice: q(choice.ani, 'GBP', 'Adjusted net income with your choice'),
      child_benefit: q(childBenefit(r, i.children), 'GBP', 'Child Benefit a year'),
      charge_now: q(base.charge, 'GBP', 'Child Benefit paid back a year doing nothing'),
      charge_choice: q(choice.charge, 'GBP', 'Child Benefit paid back a year with your choice'),
      extra_to_threshold: q(needed, 'GBP', 'Extra into your pension to get back to £60,000'),
      take_home_cost_to_threshold: q(takeHomeCost, 'GBP', 'Take-home given up by putting that in'),
      net_cost_to_threshold: q(netCost, 'GBP', 'Real cost once the Child Benefit kept is counted'),
      lost_pct: q(lostPct, 'pct', 'Tax, NI and Child Benefit charge on pay between £60,000 and your income'),
      take_home_change: q(choice.job.takeHome.minus(base.job.takeHome), 'GBP', 'Take-home change against doing nothing'),
      charge_change: q(base.charge.minus(choice.charge), 'GBP', 'Child Benefit kept against doing nothing'),
      pension_total: q(choice.con.plus(choice.extra).plus(employer), 'GBP', 'Into your pension a year'),
    },
    tippingPoint: { description: 'Above this the higher earner starts paying back Child Benefit', measure: 'adjusted_net_income', at: threshold.toNumber(), unit: 'GBP' },
    leverRanges: leverRanges('extra_sacrifice', { min: 0, max: 25000, step: 100 }, (x) => verdictFor(at(r, i, x).ani, x)),
    constraints: [{ id: 'min_wage', outcome: minWageOk(choice.extra) ? 'pass' : 'excluded' }, allowance.constraint],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')} a year`, source: 'payroll_export', estimate: false, fact: 'salary' },
      { text: `Contributing ${i.contributionPct}% of pay today`, source: 'pension_scheme', estimate: false, fact: 'contribution_pct' },
      { text: 'Extra pension paid by salary sacrifice', source: 'user_answer', estimate: false },
      { text: 'The charge is paid back through Self Assessment each year', source: 'rules', estimate: false },
      ...profileAssumptions(r, { ...i, assumed: (i.assumed ?? []).filter((k) => k !== 'childBenefitChildren' && k !== 'higherEarner') }),
    ],
  };
}
