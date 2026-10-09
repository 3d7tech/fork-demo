import type { CalcResult } from '@fork/spec';
import { D, Decimal, q, type Rules } from '../core';
import { employeeNI, incomeTax, meetsNLW, takeHome } from '../uk';

export interface ContributionLevelInput {
  salary: number;
  hoursPerWeek: number;
  /** The person's contribution today, % of salary. */
  currentPct: number;
  /** The contribution they are considering (the lever), % of salary. */
  chosenPct: number;
  employerContributionPct: number;
  reliefMethod: 'relief_at_source' | 'net_pay';
  /** Whether they pay by salary sacrifice rather than the scheme's usual way. */
  bySacrifice: boolean;
}

/** Take-home given up to put `con` (gross) into the pension, for each way of paying. */
function takeHomeCost(r: Rules, i: ContributionLevelInput, con: Decimal): Decimal {
  const salary = D(i.salary);
  if (i.bySacrifice) return takeHome(r, salary).minus(takeHome(r, salary, con));
  if (i.reliefMethod === 'relief_at_source') {
    // Paid from take-home pay; the provider adds basic-rate relief on top of what the person pays.
    return con.times(D(1).minus(r.num('pension.relief_at_source_rate')));
  }
  // Net pay: taken before income tax, but National Insurance is still charged on full pay.
  const taxable = salary.minus(con);
  return takeHome(r, salary).minus(taxable.minus(incomeTax(r, taxable)).minus(employeeNI(r, salary)));
}

function at(r: Rules, i: ContributionLevelInput, pct: number) {
  const con = D(i.salary).times(pct).div(100);
  const employer = D(i.salary).times(i.employerContributionPct).div(100);
  const cost = takeHomeCost(r, i, con);
  return { con, employer, total: con.plus(employer), cost };
}

/** "How much should I put into my pension?": what each level costs and what it builds. No verdict: it's the person's choice. */
export function contributionLevel(r: Rules, i: ContributionLevelInput): CalcResult {
  const now = at(r, i, i.currentPct);
  const chosen = at(r, i, i.chosenPct);
  const extraIn = chosen.total.minus(now.total);
  const extraCost = chosen.cost.minus(now.cost);
  // What one more percentage point would do, so the screen answers "should I pay more?" even before the lever moves.
  const plusOne = at(r, i, i.chosenPct + 1);
  const minWageOk = !i.bySacrifice || meetsNLW(r, D(i.salary).minus(chosen.con), i.hoursPerWeek);

  return {
    module: 'pension.contribution_level',
    rulePack: r.packInfo(),
    verdict: !minWageOk ? 'not_eligible' : i.chosenPct > i.currentPct ? 'more' : i.chosenPct < i.currentPct ? 'less' : 'same',
    outputs: {
      your_contribution: q(chosen.con, 'GBP', 'You put in a year'),
      employer_contribution: q(chosen.employer, 'GBP', 'Your employer puts in a year'),
      pension_total: q(chosen.total, 'GBP', 'Into your pension a year'),
      take_home_cost: q(chosen.cost, 'GBP', 'Cost to your take-home a year'),
      take_home_cost_monthly: q(chosen.cost.div(12), 'GBP', 'Cost to your take-home a month'),
      cost_per_pound: q(chosen.con.gt(0) ? chosen.cost.div(chosen.con) : D(0), 'GBP', 'Each £1 you put in costs your take-home'),
      pension_total_today: q(now.total, 'GBP', 'Into your pension a year today'),
      extra_into_pension: q(extraIn, 'GBP', 'Change in what goes into your pension a year'),
      extra_take_home_cost: q(extraCost, 'GBP', 'Change in cost to your take-home a year'),
      extra_take_home_cost_monthly: q(extraCost.div(12), 'GBP', 'Change in cost to your take-home a month'),
      one_more_pct_into_pension: q(plusOne.total.minus(chosen.total), 'GBP', 'Each extra 1% adds to your pension a year'),
      one_more_pct_cost_monthly: q(plusOne.cost.minus(chosen.cost).div(12), 'GBP', 'Each extra 1% costs your take-home a month'),
    },
    leverRanges: [],
    constraints: i.bySacrifice ? [{ id: 'min_wage', outcome: minWageOk ? 'pass' : 'excluded' }] : [],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')} a year`, source: 'payroll_export', estimate: false, fact: 'salary' },
      { text: `Employer puts in ${i.employerContributionPct}% of pay whatever you choose`, source: 'pension_scheme', estimate: false, fact: 'employer_contribution_pct' },
      {
        text: i.bySacrifice ? 'Paid by salary sacrifice' : i.reliefMethod === 'relief_at_source' ? 'Relief at source: the provider adds basic-rate relief' : 'Net pay arrangement: paid before income tax',
        source: 'pension_scheme',
        estimate: false,
      },
      ...(i.reliefMethod === 'relief_at_source' && !i.bySacrifice
        ? [{ text: 'Higher-rate taxpayers can claim extra relief through Self Assessment; that is not included', source: 'rules' as const, estimate: false }]
        : []),
    ],
  };
}
