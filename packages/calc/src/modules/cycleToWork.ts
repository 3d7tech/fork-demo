import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, q, type Rules } from '../core';
import { profileAssumptions, profileOf, type Profiled } from '../profile';
import { jobPay, minimumWage, yearlyHours } from '../uk';

export interface CycleToWorkInput extends Profiled {
  salary: number;
  hoursPerWeek: number;
  /** Price of the bike and safety kit (the lever). */
  bikePrice: number;
  /** The most the company's scheme allows, from its confirmed scheme terms. */
  schemeLimit: number;
  /** Months the sacrifice is spread over. */
  termMonths: number;
}

/**
 * What a year's bike sacrifice costs the person: the take-home it removes, less any Child Benefit
 * charge it saves. Unlike a pension sacrifice, the 2029 pension NI cap doesn't apply.
 */
function yearCost(r: Rules, i: CycleToWorkInput, perYear: Decimal): Decimal {
  const profile = profileOf(i);
  const without = jobPay(r, { salary: i.salary, profile });
  const withBike = jobPay(r, { salary: i.salary, otherSacrifice: perYear, profile });
  return without.takeHome.minus(without.childBenefitCharge).minus(withBike.takeHome.minus(withBike.childBenefitCharge));
}

function at(r: Rules, i: CycleToWorkInput, price: number) {
  const salary = D(i.salary);
  // A yearly figure: the sacrifice taken in the first year.
  const perYear = D(price).times(Math.min(12, i.termMonths)).div(i.termMonths);
  const cost = yearCost(r, i, perYear).times(D(i.termMonths).div(Math.min(12, i.termMonths)));
  const minWageOk = salary.minus(perYear).div(yearlyHours(i.hoursPerWeek)).gte(minimumWage(r, profileOf(i).age));
  return { perYear, cost, saving: D(price).minus(cost), minWageOk };
}

/** "Bike through the cycle to work scheme, or buy it outright?" */
export function cycleToWork(r: Rules, i: CycleToWorkInput): CalcResult {
  const now = at(r, i, i.bikePrice);
  const withinLimit = i.bikePrice <= i.schemeLimit;
  const verdictFor = (price: number) => {
    const x = price === i.bikePrice ? now : at(r, i, price);
    return !x.minWageOk ? 'not_eligible' : price > i.schemeLimit ? 'over_limit' : x.saving.gt(0) ? 'scheme' : 'buy_outright';
  };
  return {
    module: 'benefits.cycle_to_work',
    rulePack: r.packInfo(),
    verdict: verdictFor(i.bikePrice),
    outputs: {
      bike_price: q(i.bikePrice, 'GBP', 'Bike and kit'),
      scheme_cost: q(now.cost, 'GBP', 'What it costs your take-home through the scheme'),
      saving: q(now.saving, 'GBP', 'Saving against buying outright'),
      saving_pct: q(now.saving.div(i.bikePrice).times(100), 'pct', 'Saving as a share of the price'),
      monthly_sacrifice: q(D(i.bikePrice).div(i.termMonths), 'GBP', 'Taken from your pay each month before tax'),
      monthly_cost: q(now.cost.div(i.termMonths), 'GBP', 'Cost to your take-home each month'),
      scheme_limit: q(i.schemeLimit, 'GBP', 'The most your company’s scheme allows'),
    },
    leverRanges: leverRanges('bike_price', { min: 100, max: 10000, step: 50 }, verdictFor),
    constraints: [
      { id: 'min_wage', outcome: now.minWageOk ? 'pass' : 'excluded' },
      { id: 'scheme_limit', outcome: withinLimit ? 'pass' : 'excluded', detail: withinLimit ? undefined : 'The bike costs more than the scheme allows' },
    ],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')} a year`, source: 'payroll_export', estimate: false, fact: 'salary' },
      { text: `Paid over ${i.termMonths} months by salary sacrifice`, source: 'policy_document', estimate: false },
      { text: 'No fee to own the bike at the end of the hire; some schemes charge one', source: 'estimate', estimate: true },
      ...profileAssumptions(r, i, { adjustedNetIncome: jobPay(r, { salary: i.salary, profile: profileOf(i) }).adjustedNetIncome, minimumWage: true }),
    ],
  };
}
