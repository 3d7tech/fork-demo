import type { FamilyDef } from './types';
import { num, relief } from './shared';

export const contributionLevel: FamilyDef<'pension.contribution_level'> = {
  id: 'pension.how_much_to_contribute',
  audience: 'employee',
  title: 'How much to pay into your pension',
  description: 'How much to pay into your own pension: what each level costs your take-home pay and what it builds. Not for pay near £100,000, which has its own decision',
  module: 'pension.contribution_level',
  rulePack: 'uk-2026-27',
  questionSetsLevers: true,
  template: {
    specVersion: '1.0',
    decisionType: 'allocation',
    family: 'pension.how_much_to_contribute',
    audience: 'employee',
    question: '',
    options: [
      { id: 'keep', label: 'Keep my contribution as it is' },
      { id: 'change', label: 'Change my contribution' },
    ],
    constraints: [
      {
        id: 'pay_method',
        kind: 'ask',
        question: 'How do you pay in?',
        answers: [
          { id: 'take_home', label: 'From my pay as now' },
          { id: 'sacrifice', label: 'Salary sacrifice' },
        ],
        default: 'take_home',
        effect: 'changes_numbers',
      },
    ],
    levers: [{ id: 'chosen_pct', label: 'Your contribution', min: 1, max: 20, step: 1, default: 'fact:contribution_pct', unit: 'pct' }],
    facts: [],
    calculation: { module: 'pension.contribution_level', rulePack: 'uk-2026-27' },
    visual: 'before_after',
    action: { type: 'payroll.request', to: 'accountant', label: 'Ask to change my contribution' },
    watch: ['salary', 'contribution_pct', 'employer_contribution_pct', 'rulePack'],
  },
  facts: [
    { id: 'salary', label: 'Your pay a year', unit: 'GBP' },
    { id: 'contribution_pct', label: 'Your pension contribution today', unit: 'pct' },
    { id: 'employer_contribution_pct', label: 'Employer pension contribution', unit: 'pct' },
    { id: 'relief_method', label: 'How your pension takes contributions', unit: 'text' },
    { id: 'hours_per_week', label: 'Contracted hours a week', unit: 'hours' },
  ],
  answers: { pay_method: 'take_home' },
  levers: ['chosen_pct'],
  buildInput(f, a, l) {
    return {
      salary: num(f.salary),
      hoursPerWeek: num(f.hours_per_week),
      currentPct: num(f.contribution_pct),
      chosenPct: l.chosen_pct ?? num(f.contribution_pct),
      employerContributionPct: num(f.employer_contribution_pct),
      reliefMethod: relief(f.relief_method),
      bySacrifice: a.pay_method === 'sacrifice',
    };
  },
  defaultLayout: {
    visual: 'before_after',
    leverOrder: ['chosen_pct'],
    outcomeTiles: ['pension_total', 'take_home_cost_monthly', 'cost_per_pound'],
    constraintOrder: ['pay_method'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const o = calc.outputs;
    const row = (label: string, totalKey: string, you: number) => ({
      label,
      total: { value: o[totalKey]!.value, display: display(totalKey) },
      segments: [
        { value: you, tone: 'b' as const, label: 'You' },
        { value: o.employer_contribution!.value, tone: 'a' as const, label: 'Your employer' },
      ],
    });
    return {
      type: 'bars',
      title: 'Into your pension a year',
      rows: [row('Today', 'pension_total_today', o.pension_total_today!.value - o.employer_contribution!.value), row('Your choice', 'pension_total', o.your_contribution!.value)],
      keys: [
        { tone: 'b', label: 'You' },
        { tone: 'a', label: 'Your employer' },
      ],
      floor: null,
    };
  },
  request(r) {
    const from = r.facts.contribution_pct;
    const to = r.levers.chosen_pct ?? from;
    if (to === from && r.answers.pay_method !== 'sacrifice') return null;
    const how = r.answers.pay_method === 'sacrifice' ? ', paid by salary sacrifice' : '';
    return { summary: `Please change the pension contribution for ${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} from ${from}% to ${to}% of pay${how}, from the next pay period you can.` };
  },
  sweep: { lever: 'chosen_pct', series: [{ key: 'pension_total', label: 'Into your pension' }, { key: 'take_home_cost', label: 'Cost to your take-home' }] },
  steps: { facts: 'Read your pay and pension', checks: 'Checked tax relief and the minimum wage' },
};
