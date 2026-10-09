import type { FamilyDef } from './types';
import { num, partOf } from './shared';

export const bonus: FamilyDef<'employer.bonus_cash_or_pension'> = {
  id: 'employer.bonus_cash_or_pension',
  audience: 'owner',
  title: 'A bonus as cash or into pensions',
  description: 'Whether to pay a staff bonus as cash or let staff take it into their pension, and what the company saves',
  module: 'employer.bonus_cash_or_pension',
  rulePack: 'uk-2026-27',
  questionSetsLevers: true,
  template: {
    specVersion: '1.0',
    decisionType: 'comparison',
    family: 'employer.bonus_cash_or_pension',
    audience: 'owner',
    question: '',
    options: [
      { id: 'cash', label: 'Pay it all as cash' },
      { id: 'choice', label: 'Let staff choose cash or pension' },
    ],
    constraints: [],
    levers: [
      { id: 'amount_per_person', label: 'Bonus per person', min: 100, max: 10000, step: 100, default: 1000, unit: 'GBP' },
      { id: 'people', label: 'People getting it', min: 1, max: 100, step: 1, default: 'fact:headcount', unit: 'count' },
      { id: 'pension_share_pct', label: 'Share taken into pensions', min: 0, max: 100, step: 10, default: 50, unit: 'pct' },
    ],
    facts: [],
    calculation: { module: 'employer.bonus_cash_or_pension', rulePack: 'uk-2026-27' },
    visual: 'cost_bars',
    action: { type: 'plan.send', to: 'accountant', label: 'Send the plan to our accountant' },
    watch: ['headcount', 'rulePack'],
  },
  facts: [
    { id: 'headcount', label: 'Employees on payroll', unit: 'count' },
    { id: 'median_salary', label: 'Typical salary (the middle of your payroll)', unit: 'GBP' },
  ],
  answers: {},
  levers: ['amount_per_person', 'people', 'pension_share_pct'],
  buildInput(f, _a, l) {
    return {
      amountPerPerson: l.amount_per_person ?? 1000,
      people: l.people ?? num(f.headcount),
      pensionShare: (l.pension_share_pct ?? 50) / 100,
      typicalSalary: num(f.median_salary),
    };
  },
  defaultLayout: {
    visual: 'cost_bars',
    leverOrder: ['amount_per_person', 'people', 'pension_share_pct'],
    outcomeTiles: ['company_saves', 'all_cash_cost', 'cash_reaches_employee'],
    constraintOrder: [],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const p = (k: string, label: string, tone: 'a' | 'b') => partOf(calc, display, k, label, tone);
    return {
      type: 'coins',
      title: 'What each £1 of bonus does',
      routes: [
        { label: 'As cash', pays: p('cash_cost_per_pound', 'Company pays', 'a'), gets: p('cash_reaches_per_pound', 'Reaches a typical employee', 'a') },
        { label: 'Into their pension', pays: p('pension_cost_per_pound', 'Company pays', 'b'), gets: p('pension_reaches_per_pound', 'Reaches their pension', 'b') },
      ],
    };
  },
  request(r) {
    return {
      summary: `${r.companyName} plans a bonus of £${(r.levers.amount_per_person ?? 0).toLocaleString('en-GB')} for ${r.levers.people} people, with staff able to take it into their pension by salary sacrifice. Please confirm the bonus sacrifice can be agreed before the bonus is paid, and how payroll will run it.`,
    };
  },
  sweep: { lever: 'pension_share_pct', series: [{ key: 'company_saves', label: 'Company saves' }] },
  steps: { facts: 'Read your payroll', checks: 'Checked employer NI on bonuses' },
};
