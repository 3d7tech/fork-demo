import type { FamilyDef } from './types';
import { num, profileFrom, relief } from './shared';

const CHILDREN: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
const ANSWER_FOR = ['', 'one', 'two', 'three', 'four'];

export const childBenefitCharge: FamilyDef<'pay.child_benefit_charge'> = {
  id: 'pay.child_benefit_charge',
  audience: 'employee',
  title: 'Paying back Child Benefit',
  description:
    'For anyone earning between about £60,000 and £80,000 who gets Child Benefit: whether to put more into the pension to stop paying it back through the High Income Child Benefit Charge. Use this whenever Child Benefit or the charge is mentioned, unless pay is near £100,000',
  module: 'pay.child_benefit_charge',
  profile: true,
  rulePack: 'uk-2026-27',
  template: {
    specVersion: '1.0',
    decisionType: 'threshold',
    family: 'pay.child_benefit_charge',
    audience: 'employee',
    question: '',
    options: [
      { id: 'do_nothing', label: 'Leave things as they are' },
      { id: 'sacrifice_more', label: 'Put more into my pension' },
    ],
    constraints: [
      { id: 'min_wage', kind: 'hard', source: 'rules', autoCheck: true },
      { id: 'annual_allowance', kind: 'hard', source: 'rules', autoCheck: true },
      {
        id: 'children',
        kind: 'ask',
        question: 'Children you or your partner get Child Benefit for?',
        answers: [
          { id: 'one', label: 'One' },
          { id: 'two', label: 'Two' },
          { id: 'three', label: 'Three' },
          { id: 'four', label: 'Four' },
        ],
        default: 'two',
        effect: 'changes_numbers',
      },
      {
        id: 'higher_earner',
        kind: 'ask',
        question: 'Do you earn more than your partner?',
        answers: [
          { id: 'yes', label: 'Yes, or no partner' },
          { id: 'no', label: 'No' },
        ],
        default: 'yes',
        effect: 'excludes',
      },
    ],
    levers: [{ id: 'extra_sacrifice', label: 'Extra into your pension a year', min: 0, max: 25000, step: 100, default: 0, unit: 'GBP' }],
    facts: [],
    calculation: { module: 'pay.child_benefit_charge', rulePack: 'uk-2026-27' },
    tippingPoint: { measure: 'adjusted_net_income', at: 'rule:child_benefit_charge.threshold' },
    visual: 'threshold_ladder',
    action: { type: 'payroll.request', to: 'accountant', label: 'Ask to put more into my pension' },
    watch: ['salary', 'contribution_pct', 'rulePack'],
  },
  facts: [
    { id: 'salary', label: 'Your pay a year', unit: 'GBP' },
    { id: 'contribution_pct', label: 'Your pension contribution', unit: 'pct' },
    { id: 'relief_method', label: 'How your pension takes contributions', unit: 'text' },
    { id: 'employer_contribution_pct', label: 'Employer pension contribution', unit: 'pct' },
    { id: 'hours_per_week', label: 'Contracted hours a week', unit: 'hours' },
  ],
  answers: { children: 'two', higher_earner: 'yes' },
  // What the person has told Fork starts the questions; they can still change them on the screen.
  answersFrom(f) {
    const out: Record<string, string> = {};
    const n = f.child_benefit_children;
    if (typeof n === 'number' && n >= 1) out.children = ANSWER_FOR[Math.min(4, n)]!;
    if (typeof f.higher_earner === 'boolean') out.higher_earner = f.higher_earner ? 'yes' : 'no';
    return out;
  },
  levers: ['extra_sacrifice'],
  buildInput(f, a, l) {
    return {
      ...profileFrom(f),
      salary: num(f.salary),
      hoursPerWeek: num(f.hours_per_week),
      contributionPct: num(f.contribution_pct),
      reliefMethod: relief(f.relief_method),
      employerContributionPct: num(f.employer_contribution_pct),
      extraSacrifice: l.extra_sacrifice ?? 0,
      children: CHILDREN[a.children ?? 'two'] ?? 2,
      higherEarner: (a.higher_earner ?? 'yes') === 'yes',
    };
  },
  defaultLayout: {
    visual: 'threshold_ladder',
    leverOrder: ['extra_sacrifice'],
    outcomeTiles: ['charge_now', 'extra_to_threshold', 'net_cost_to_threshold'],
    constraintOrder: ['children', 'higher_earner'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const o = calc.outputs;
    const limit = calc.tippingPoint!.at;
    const values = [o.adjusted_net_income!.value, o.adjusted_net_income_choice!.value, limit];
    const min = Math.floor((Math.min(...values) - 5000) / 5000) * 5000;
    const max = Math.ceil((Math.max(...values) + 5000) / 5000) * 5000;
    return {
      type: 'ladder',
      title: 'Your adjusted net income',
      min,
      max,
      band: { from: limit, to: max, label: 'above £60,000, where Child Benefit is paid back' },
      markers: [
        { value: o.adjusted_net_income!.value, display: display('adjusted_net_income'), label: 'Today', tone: 'a' },
        { value: o.adjusted_net_income_choice!.value, display: display('adjusted_net_income_choice'), label: 'With your choice', tone: 'b' },
      ],
      ticks: [{ value: limit, display: display('tipping_point') }],
    };
  },
  request(r) {
    const extra = r.levers.extra_sacrifice ?? 0;
    if (!extra) return null;
    return {
      summary: `Please increase the salary sacrifice pension contribution for ${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} by £${extra.toLocaleString('en-GB')} a year, spread across the remaining pay periods of this tax year.`,
    };
  },
  sweep: { lever: 'extra_sacrifice', series: [{ key: 'charge_change', label: 'Child Benefit kept' }, { key: 'take_home_change', label: 'Take-home change' }] },
  steps: { facts: 'Read your pay and pension', checks: 'Checked the Child Benefit charge and your pension allowance' },
};
