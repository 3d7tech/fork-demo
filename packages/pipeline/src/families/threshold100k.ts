import type { FamilyDef } from './types';
import { num } from './shared';

const CHILDREN: Record<string, number> = { none: 0, one: 1, two: 2, three: 3 };

export const threshold100k: FamilyDef<'pay.threshold_100k'> = {
  id: 'pay.threshold_100k',
  audience: 'employee',
  title: 'Earning around £100,000',
  description: 'For anyone earning around or over £100,000: whether to put more into the pension to keep the personal allowance and Tax-Free Childcare. Use this whenever pay near £100,000 is mentioned',
  module: 'pay.threshold_100k',
  rulePack: 'uk-2026-27',
  template: {
    specVersion: '1.0',
    decisionType: 'threshold',
    family: 'pay.threshold_100k',
    audience: 'employee',
    question: '',
    options: [
      { id: 'do_nothing', label: 'Leave things as they are' },
      { id: 'sacrifice_more', label: 'Put more into my pension' },
    ],
    constraints: [
      {
        id: 'children',
        kind: 'ask',
        question: 'Children using Tax-Free Childcare?',
        answers: [
          { id: 'none', label: 'None' },
          { id: 'one', label: 'One' },
          { id: 'two', label: 'Two' },
          { id: 'three', label: 'Three' },
        ],
        default: 'none',
        effect: 'changes_numbers',
      },
    ],
    levers: [{ id: 'extra_sacrifice', label: 'Extra into your pension a year', min: 0, max: 15000, step: 100, default: 0, unit: 'GBP' }],
    facts: [],
    calculation: { module: 'pay.threshold_100k', rulePack: 'uk-2026-27' },
    tippingPoint: { measure: 'adjusted_net_income', at: 'rule:income_tax.allowance_taper_threshold' },
    visual: 'threshold_ladder',
    action: { type: 'payroll.request', to: 'accountant', label: 'Ask to put more into my pension' },
    watch: ['salary', 'contribution_pct', 'rulePack'],
  },
  facts: [
    { id: 'salary', label: 'Your pay a year', unit: 'GBP' },
    { id: 'contribution_pct', label: 'Your pension contribution', unit: 'pct' },
    { id: 'employer_contribution_pct', label: 'Employer pension contribution', unit: 'pct' },
  ],
  answers: { children: 'none' },
  levers: ['extra_sacrifice'],
  buildInput(f, a, l) {
    return {
      salary: num(f.salary),
      sacrificePct: num(f.contribution_pct),
      extraSacrifice: l.extra_sacrifice ?? 0,
      childrenUsingTaxFreeChildcare: CHILDREN[a.children ?? 'none'] ?? 0,
      employerContributionPct: num(f.employer_contribution_pct),
    };
  },
  defaultLayout: {
    visual: 'threshold_ladder',
    leverOrder: ['extra_sacrifice'],
    outcomeTiles: ['extra_to_threshold', 'take_home_cost_to_threshold', 'childcare_kept_at_threshold'],
    constraintOrder: ['children'],
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
      band: { from: limit, to: max, label: 'above the threshold, where the allowance tapers and childcare support stops' },
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
    return { summary: `Please increase the salary sacrifice pension contribution for ${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} by £${extra.toLocaleString('en-GB')} a year, spread across the remaining pay periods of this tax year.` };
  },
  steps: { facts: 'Read your pay and pension', checks: 'Checked the personal allowance taper and childcare limit' },
};
