import type { FamilyDef } from './types';

const num = (v: unknown) => {
  if (typeof v !== 'number') throw new Error(`Expected a number fact, got ${typeof v}`);
  return v;
};

export const ssSwitch: FamilyDef<'pension.ss_switch'> = {
  id: 'pension.salary_sacrifice_switch',
  audience: 'employee',
  title: 'Switching your pension to salary sacrifice',
  description: 'Whether to switch your own pension contributions to salary sacrifice, and what the catches are',
  module: 'pension.ss_switch',
  rulePack: 'uk-2026-27',
  template: {
    specVersion: '1.0',
    decisionType: 'comparison',
    family: 'pension.salary_sacrifice_switch',
    audience: 'employee',
    question: '',
    options: [
      { id: 'stay', label: 'Keep paying from take-home pay' },
      { id: 'switch', label: 'Switch to salary sacrifice' },
    ],
    constraints: [
      { id: 'min_wage', kind: 'hard', source: 'rules', autoCheck: true },
      { id: 'mortgage_12m', kind: 'ask', question: 'Applying for a mortgage in the next 12 months?', effect: 'caution', default: 'no' },
      { id: 'parental_leave_12m', kind: 'ask', question: 'Expecting parental leave in the next 12 months?', effect: 'caution', default: 'no' },
    ],
    levers: [{ id: 'contribution_pct', label: 'Your pension contribution', min: 3, max: 10, step: 1, default: 'fact:contribution_pct', unit: 'pct' }],
    facts: [],
    calculation: { module: 'pension.ss_switch', rulePack: 'uk-2026-27' },
    tippingPoint: { measure: 'annual_sacrifice', at: 'rule:salary_sacrifice.pension_ni_cap', from: '2029-04-06' },
    visual: 'before_after',
    action: { type: 'payroll.request', to: 'accountant', label: 'Switch me to salary sacrifice' },
    watch: ['salary', 'contribution_pct', 'employer_share_pct', 'rulePack'],
  },
  facts: [
    { id: 'salary', label: 'Your pay a year', unit: 'GBP' },
    { id: 'contribution_pct', label: 'Your pension contribution', unit: 'pct' },
    { id: 'relief_method', label: 'How your pension takes contributions', unit: 'text' },
    { id: 'employer_share_pct', label: 'Share of the employer’s NI saving added to your pension', unit: 'pct' },
    { id: 'employer_contribution_pct', label: 'Employer pension contribution', unit: 'pct' },
    { id: 'hours_per_week', label: 'Contracted hours a week', unit: 'hours' },
  ],
  answers: { mortgage_12m: 'no', parental_leave_12m: 'no' },
  levers: ['contribution_pct'],
  buildInput(f, a, l, _data) {
    const method = f.relief_method;
    if (method !== 'relief_at_source' && method !== 'net_pay') throw new Error(`Unknown relief method ${String(method)}`);
    return {
      salary: num(f.salary),
      contributionPct: l.contribution_pct ?? num(f.contribution_pct),
      reliefMethod: method,
      employerSharePct: num(f.employer_share_pct),
      employerContributionPct: num(f.employer_contribution_pct),
      hoursPerWeek: num(f.hours_per_week),
      mortgageIn12Months: a.mortgage_12m === 'yes',
      parentalLeaveIn12Months: a.parental_leave_12m === 'yes',
    };
  },
  defaultLayout: {
    visual: 'before_after',
    leverOrder: ['contribution_pct'],
    outcomeTiles: ['take_home_gain', 'employer_share', 'pension_total'],
    constraintOrder: ['min_wage', 'mortgage_12m', 'parental_leave_12m'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const before = calc.outputs.take_home_before!.value;
    const after = calc.outputs.take_home_after!.value;
    const floor = Math.floor((Math.min(before, after) * 0.97) / 100) * 100;
    return {
      type: 'bars',
      title: 'Your take-home pay a year',
      rows: [
        { label: 'Today', total: { value: before, display: display('take_home_before') }, segments: [{ value: before, tone: 'a', label: 'Take-home today' }] },
        { label: 'On salary sacrifice', total: { value: after, display: display('take_home_after') }, segments: [{ value: after, tone: 'b', label: 'Take-home on salary sacrifice' }] },
      ],
      keys: [
        { tone: 'a', label: 'Today' },
        { tone: 'b', label: 'On salary sacrifice' },
      ],
      floor: { value: floor, display: `£${floor.toLocaleString('en-GB')}` },
    };
  },
  request(r) {
    const pct = r.levers.contribution_pct ?? r.facts.contribution_pct;
    return {
      summary: `Please switch ${r.person ? `${r.person.name} (payroll ${r.person.payrollRef})` : 'An employee'} to paying their ${pct}% pension contribution by salary sacrifice, from the next pay period you can. Their contract needs a salary sacrifice variation; their pension contribution stays the same.`,
      figures: { employer_ni_saving: r.calc.outputs.employer_ni_saving?.value ?? 0 },
    };
  },
  sweep: { lever: 'contribution_pct', series: [{ key: 'take_home_gain', label: 'Now' }, { key: 'take_home_gain_2029', label: 'From April 2029' }] },
  steps: { facts: 'Read your pay and pension', checks: 'Checked the catches: mortgage applications, parental pay, minimum wage' },
};
