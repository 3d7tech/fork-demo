import type { FamilyDef } from './types';
import { num, partOf } from './shared';

export const hireCost: FamilyDef<'employer.hire_cost'> = {
  id: 'employer.true_cost_of_hire',
  audience: 'owner',
  title: 'The true cost of a hire',
  description: 'The true yearly cost of hiring someone on a given salary: employer NI, pension and extras',
  module: 'employer.hire_cost',
  rulePack: 'uk-2026-27',
  questionSetsLevers: true,
  template: {
    specVersion: '1.0',
    decisionType: 'comparison',
    family: 'employer.true_cost_of_hire',
    audience: 'owner',
    question: '',
    options: [{ id: 'hire', label: 'Make the hire' }],
    constraints: [],
    levers: [
      { id: 'salary', label: 'Salary', min: 15000, max: 150000, step: 1000, default: 35000, unit: 'GBP' },
      { id: 'extras', label: 'Equipment and extras a year', min: 0, max: 10000, step: 250, default: 1500, unit: 'GBP' },
      { id: 'sacrifice_pct', label: 'Their pension by salary sacrifice', min: 0, max: 10, step: 1, default: 0, unit: 'pct' },
    ],
    facts: [],
    calculation: { module: 'employer.hire_cost', rulePack: 'uk-2026-27' },
    visual: 'cost_bars',
    action: { type: 'save', to: 'self', label: 'Save this' },
    watch: ['employer_contribution_pct', 'rulePack'],
  },
  facts: [
    { id: 'employer_contribution_pct', label: 'Employer pension contribution', unit: 'pct' },
    { id: 'pension_basis', label: 'What employer contributions are worked out on', unit: 'text' },
  ],
  answers: {},
  levers: ['salary', 'extras', 'sacrifice_pct'],
  buildInput(f, _a, l) {
    return {
      salary: l.salary ?? 35000,
      employerPensionPct: num(f.employer_contribution_pct),
      pensionBasis: f.pension_basis === 'qualifying_earnings' ? 'qualifying_earnings' : 'full_salary',
      employeeSacrificePct: l.sacrifice_pct ?? 0,
      extrasPerYear: l.extras ?? 1500,
    };
  },
  defaultLayout: {
    visual: 'cost_bars',
    leverOrder: ['salary', 'extras', 'sacrifice_pct'],
    outcomeTiles: ['total', 'monthly', 'above_salary'],
    constraintOrder: [],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const p = (k: string, label: string, tone: 'a' | 'b' | 'c' | 'd') => partOf(calc, display, k, label, tone);
    return {
      type: 'receipt',
      title: 'What the hire really costs a year',
      lines: [p('salary', 'Salary', 'a'), p('employer_ni', 'Employer NI', 'b'), p('employer_pension', 'Employer pension', 'c'), p('extras', 'Equipment and extras', 'd')].filter((x) => x.value > 0),
      total: { value: calc.outputs.total!.value, display: display('total'), label: 'Total a year' },
      stamp: { value: calc.outputs.above_salary_pct!.value, display: display('above_salary_pct'), label: 'on top of salary' },
    };
  },
  sweep: { lever: 'salary', series: [{ key: 'total', label: 'Total cost a year' }] },
  steps: { facts: 'Read your pension scheme', checks: 'Checked employer NI and pension rules' },
};
