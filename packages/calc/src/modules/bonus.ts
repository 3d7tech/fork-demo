import type { CalcResult } from '@fork/spec';
import { D, q, type Rules } from '../core';
import { takeHome } from '../uk';

export interface BonusInput {
  amountPerPerson: number;
  people: number;
  /** Share of the bonus pot paid into pensions (1 = all, 0.5 = half choose pension). */
  pensionShare: number;
  /** A typical salary used to show what £1 of cash bonus reaches the employee as. */
  typicalSalary: number;
}

export function bonusCashOrPension(r: Rules, i: BonusInput): CalcResult {
  const pot = D(i.amountPerPerson).times(i.people);
  // Assumes every recipient already earns above the secondary threshold, so each £1 of cash bonus carries employer NI.
  const rate = r.num('er_ni.rate');
  const cash = pot.times(D(1).plus(rate));
  const toPension = pot.times(i.pensionShare);
  const mix = toPension.plus(pot.minus(toPension).times(D(1).plus(rate)));
  const save = cash.minus(mix);
  const typical = D(i.typicalSalary);
  const reachesPerPound = takeHome(r, typical.plus(i.amountPerPerson)).minus(takeHome(r, typical)).div(i.amountPerPerson);

  return {
    module: 'employer.bonus_cash_or_pension',
    rulePack: r.packInfo(),
    verdict: i.pensionShare >= 1 ? 'pension' : 'offer_choice',
    outputs: {
      all_cash_cost: q(cash, 'GBP', 'All as cash, including employer NI'),
      chosen_cost: q(mix, 'GBP', 'What the company pays with this split'),
      company_saves: q(save, 'GBP', 'Company saves'),
      extra_bonuses_funded: q(save.div(i.amountPerPerson).floor(), 'count', 'More bonuses the saving could fund'),
      cash_reaches_employee: q(reachesPerPound.times(i.amountPerPerson), 'GBP', 'A cash bonus reaches a typical employee as'),
      cash_reaches_per_pound: q(reachesPerPound, 'GBP', 'Each £1 of cash bonus reaches them as'),
      cash_cost_per_pound: q(D(1).plus(rate), 'GBP', 'Each £1 of cash bonus costs the company'),
      // An employer pension contribution carries no employer NI and no tax or NI for the employee.
      pension_cost_per_pound: q(D(1), 'GBP', 'Each £1 paid into pensions costs the company'),
      pension_reaches_per_pound: q(D(1), 'GBP', 'Each £1 paid into pensions reaches their pension as'),
    },
    leverRanges: [],
    constraints: [{ id: 'sacrifice_timing', outcome: 'caution', detail: 'A bonus sacrifice has to be agreed before the bonus is paid' }],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: 'Every recipient earns above the employer NI threshold', source: 'payroll_export', estimate: false },
      { text: `A typical employee earns £${i.typicalSalary.toLocaleString('en-GB')}`, source: 'payroll_export', estimate: true },
    ],
  };
}
