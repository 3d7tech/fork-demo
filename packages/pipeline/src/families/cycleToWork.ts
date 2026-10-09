import type { FamilyDef } from './types';
import { floorFor, num, profileFrom } from './shared';

export const cycleToWork: FamilyDef<'benefits.cycle_to_work'> = {
  id: 'benefits.cycle_to_work',
  audience: 'employee',
  title: 'A bike through the cycle to work scheme',
  description: 'Whether to get a bike through the company cycle to work scheme (salary sacrifice) or buy it outright, and what it saves',
  module: 'benefits.cycle_to_work',
  profile: true,
  rulePack: 'uk-2026-27',
  questionSetsLevers: true,
  template: {
    specVersion: '1.0',
    decisionType: 'comparison',
    family: 'benefits.cycle_to_work',
    audience: 'employee',
    question: '',
    options: [
      { id: 'buy', label: 'Buy the bike outright' },
      { id: 'scheme', label: 'Get it through the cycle to work scheme' },
    ],
    constraints: [{ id: 'min_wage', kind: 'hard', source: 'rules', autoCheck: true }],
    levers: [{ id: 'bike_price', label: 'Bike and kit', min: 100, max: 10000, step: 50, default: 1000, unit: 'GBP' }],
    facts: [],
    calculation: { module: 'benefits.cycle_to_work', rulePack: 'uk-2026-27' },
    visual: 'cost_bars',
    action: { type: 'payroll.request', to: 'accountant', label: 'Ask to join the cycle to work scheme' },
    watch: ['salary', 'cycle_to_work_limit', 'rulePack'],
  },
  facts: [
    { id: 'salary', label: 'Your pay a year', unit: 'GBP' },
    { id: 'hours_per_week', label: 'Contracted hours a week', unit: 'hours' },
    { id: 'cycle_to_work_limit', label: 'The most the company’s scheme allows', unit: 'GBP' },
  ],
  answers: {},
  levers: ['bike_price'],
  buildInput(f, _a, l) {
    return {
      ...profileFrom(f),
      salary: num(f.salary),
      hoursPerWeek: num(f.hours_per_week),
      bikePrice: l.bike_price ?? 1000,
      schemeLimit: num(f.cycle_to_work_limit),
      termMonths: 12,
    };
  },
  defaultLayout: {
    visual: 'cost_bars',
    leverOrder: ['bike_price'],
    outcomeTiles: ['saving', 'scheme_cost', 'monthly_cost'],
    constraintOrder: ['min_wage'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const o = calc.outputs;
    return {
      type: 'bars',
      title: 'What the bike costs you',
      rows: [
        { label: 'Buying outright', total: { value: o.bike_price!.value, display: display('bike_price') }, segments: [{ value: o.bike_price!.value, tone: 'a', label: 'Buying outright' }] },
        { label: 'Through the scheme', total: { value: o.scheme_cost!.value, display: display('scheme_cost') }, segments: [{ value: o.scheme_cost!.value, tone: 'b', label: 'Through the scheme' }] },
      ],
      keys: [
        { tone: 'a', label: 'Buying outright' },
        { tone: 'b', label: 'Through the scheme' },
      ],
      floor: o.bike_price!.value > 2000 ? floorFor(o.bike_price!.value, o.scheme_cost!.value) : null,
    };
  },
  request(r) {
    const price = r.levers.bike_price ?? 0;
    return {
      summary: `${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} would like to join the cycle to work scheme for a bike and kit costing about £${price.toLocaleString('en-GB')}, by salary sacrifice over 12 months. Please send them the scheme’s application and set up the sacrifice once it’s approved.`,
    };
  },
  sweep: { lever: 'bike_price', series: [{ key: 'saving', label: 'Saving against buying outright' }] },
  steps: { facts: 'Read your pay and the scheme’s terms', checks: 'Checked the scheme limit and the minimum wage' },
};
