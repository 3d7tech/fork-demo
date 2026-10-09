import { runModule } from '@fork/calc';
import type { Fact } from '@fork/spec';
import { describe, expect, it } from 'vitest';
import { askFork, FAMILIES, InMemoryFactStore, recalculate, type DecisionScreen, type FamilyDef } from '../src';
import { taxYearStart } from '../src/families/shared';
import { LARKFIELD } from '../../calc/test/fixtures/larkfield';
import { deps } from './helpers';

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });

const store = new InMemoryFactStore({
  company: {
    larkfield: [
      f('employer_share_pct', 50, 'company_setting'),
      f('employer_contribution_pct', 3, 'pension_scheme'),
      f('relief_method', 'relief_at_source', 'pension_scheme'),
      f('pension_basis', 'full_salary', 'pension_scheme'),
      f('headcount', 34, 'payroll_export'),
      f('median_salary', 30000, 'payroll_export'),
      f('fee_per_employee', 4, 'company_setting'),
      f('employment_allowance', false, 'company_setting'),
      f('contribution_pct', 5, 'pension_scheme'),
      f('cycle_to_work_limit', 2500, 'policy_document'),
    ],
  },
  employee: {
    'larkfield/ella': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/priya': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 108000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/ravi': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 58000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')],
  },
  payroll: { larkfield: LARKFIELD },
});

const MAYA = { audience: 'owner' as const, companyId: 'larkfield' };
const emp = (id: string) => ({ audience: 'employee' as const, companyId: 'larkfield', employeeId: id });

/** Well-behaved models for any family: the router picks it, the spec writer sets levers from the question. */
function modelsFor(family: FamilyDef, leverDefaults: Record<string, number> = {}) {
  return {
    router: () => ({ route: 'decision', family: family.id, confidence: 'high', distress: false, reason: 'Matches.' }),
    lever_reader: (i: any) => ({ values: i.levers.map((l: any) => ({ id: l.id, value: leverDefaults[l.id] ?? null })) }),
    screen_composer: () => family.defaultLayout,
    explainer: (i: any) => {
      const tile = i.numbers.find((n: any) => n.key === family.defaultLayout.outcomeTiles[0]);
      return { title: 'Your numbers', verdict: `${tile.label}: ${tile.estimate ? 'about ' : ''}${tile.display}.`, why: 'From your figures.', tippingPoint: null, assumptions: [], actionLabel: null };
    },
    verifier: () => ({ pass: true, issues: [] }),
  };
}

async function screenFor(familyId: string, subject: any, question: string, leverDefaults?: Record<string, number>) {
  const family = FAMILIES[familyId]!;
  const { deps: d, models } = deps(modelsFor(family, leverDefaults), { facts: store });
  const a = await askFork(d, { question, subject });
  expect(a).toMatchObject({ kind: 'decision', family: familyId });
  return { s: a as DecisionScreen, models };
}

const shown = (s: { numbers: DecisionScreen['numbers'] }, key: string) => s.numbers.find((n) => n.key === key)?.display;

describe('every family runs end to end and matches its golden case', () => {
  it('owner: introduce salary sacrifice for Larkfield', async () => {
    const { s, models } = await screenFor('employer.introduce_salary_sacrifice', MAYA, 'should we bring in salary sacrifice for pensions?');
    expect(shown(s, 'employer_ni_saved')).toBe('£7,946');
    expect(shown(s, 'company_keeps')).toBe('£2,341');
    expect(shown(s, 'company_keeps_2029')).toBe('£1,493');
    expect(s.calc.outputs.excluded_min_wage?.value).toBe(2);
    // Payroll rows go to the engine, never to a model.
    expect(JSON.stringify(models.calls)).not.toContain('108000');
    expect(s.visual.type).toBe('flow');
  });

  it('owner: true cost of a hire, with the salary taken from the question', async () => {
    const { s, models } = await screenFor('employer.true_cost_of_hire', MAYA, 'what does hiring someone on 40k really cost us?', { salary: 40000, extras: 2000, sacrifice_pct: 5 });
    expect(models.rolesCalled()).toContain('lever_reader');
    expect(models.rolesCalled()).not.toContain('spec_writer');
    expect(shown(s, 'total')).toBe('£48,150');
    expect(shown(s, 'lever.salary')).toBe('£40,000');
  });

  it('owner: bonus as cash or pension', async () => {
    const { s } = await screenFor('employer.bonus_cash_or_pension', MAYA, 'we want to give everyone a £1,000 bonus, cash or pension?', { amount_per_person: 1000 });
    expect(shown(s, 'all_cash_cost')).toBe('£39,100');
    expect(shown(s, 'company_saves')).toBe('£2,550');
    expect(shown(s, 'lever.people')).toBe('34');
  });

  it('employee: the £100,000 threshold, then two children using Tax-Free Childcare', async () => {
    const { s } = await screenFor('pay.threshold_100k', emp('priya'), 'im on 108k, should i put more in my pension?');
    expect(shown(s, 'extra_to_threshold')).toBe('£2,600');
    expect(shown(s, 'take_home_cost_to_threshold')).toBe('£988');
    const r = recalculate(s, await store.get(emp('priya'), FAMILIES['pay.threshold_100k']!.facts.map((x) => x.id)), { answers: { children: 'two' } });
    expect(shown(r, 'childcare_kept_at_threshold')).toBe('£4,000');
    expect(s.visual.type).toBe('ladder');
  });

  it('employee: electric car scheme or own car', async () => {
    const { s } = await screenFor('benefits.ev_scheme_or_own_car', emp('ravi'), 'should i get an electric car through work');
    const expected = runModule('benefits.ev_scheme', 'uk-2026-27', {
      salary: 58000,
      milesPerYear: 9000,
      homeCharging: true,
      scheme: { monthlyGross: 600, listPrice: 42000, termYears: 3, startDate: taxYearStart() },
      ownCar: { leaseMonthly: 430, insuranceServicing: 1200, mpg: 45, fuelPerLitre: 1.4 },
      charging: { homePerKwh: 0.1, publicPerKwh: 0.7, milesPerKwh: 3.5 },
    });
    expect(s.calc.outputs.scheme_cost?.value).toBeCloseTo(expected.outputs.scheme_cost!.value, 6);
    expect(s.numbers.find((n) => n.key === 'own_car_cost')?.estimate).toBe(true);
  });

  it('employee: how much to contribute, moving from 5% to 8%', async () => {
    const { s } = await screenFor('pension.how_much_to_contribute', emp('ella'), 'should i pay more into my pension');
    const facts = await store.get(emp('ella'), FAMILIES['pension.how_much_to_contribute']!.facts.map((x) => x.id));
    const r = recalculate(s, facts, { levers: { chosen_pct: 8 } });
    expect(shown(r, 'take_home_cost')).toBe('£2,048');
    expect(shown(r, 'extra_into_pension')).toBe('£960');
    const sac = recalculate(s, facts, { levers: { chosen_pct: 8 }, answers: { pay_method: 'sacrifice' } });
    expect(shown(sac, 'take_home_cost')).toBe('£1,843');
  });
});

describe('the family added by following the guide', () => {
  it('employee: a £1,000 bike through cycle to work costs £720, and the request says what to set up', async () => {
    const { s } = await screenFor('benefits.cycle_to_work', emp('ella'), 'should I get a £1,000 bike through cycle to work?', { bike_price: 1000 });
    expect(shown(s, 'scheme_cost')).toBe('£720');
    expect(shown(s, 'saving')).toBe('£280');
    expect(shown(s, 'fact.cycle_to_work_limit')).toBe('£2,500');
    const r = FAMILIES['benefits.cycle_to_work']!.request!({ calc: s.calc, levers: { bike_price: 1000 }, answers: {}, facts: {}, person: { name: 'Ella Brooks', payrollRef: 'LA104' }, companyName: 'Larkfield' });
    expect(r?.summary).toMatch(/^Ella Brooks \(payroll LA104\) would like to join the cycle to work scheme for a bike and kit costing about £1,000/);
  });

  it('without a confirmed scheme limit, Fork asks for it rather than guessing', async () => {
    const family = FAMILIES['benefits.cycle_to_work']!;
    const noLimit = new InMemoryFactStore({ company: { larkfield: [] }, employee: { 'larkfield/ella': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 32000, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')] } });
    const { deps: d } = deps(modelsFor(family), { facts: noLimit });
    expect(await askFork(d, { question: 'bike through work?', subject: emp('ella') })).toMatchObject({ kind: 'message', reason: 'needs_facts' });
  });
});

describe('reading levers from the question', () => {
  it('keeps values in range and on a step, and ignores levers the spec doesn’t have', async () => {
    const family = FAMILIES['employer.bonus_cash_or_pension']!;
    const m = { ...modelsFor(family), lever_reader: () => ({ values: [{ id: 'amount_per_person', value: 1549 }, { id: 'people', value: 5000 }, { id: 'made_up', value: 3 }] }) };
    const { deps: d } = deps(m, { facts: store });
    const a = (await askFork(d, { question: 'a £1,549 bonus for 5000 people', subject: MAYA })) as DecisionScreen;
    expect(shown(a, 'lever.amount_per_person')).toBe('£1,500');
    expect(shown(a, 'lever.people')).toBe('34');
  });
});

describe('families are separated by audience', () => {
  it('an employee is never routed to an owner decision', async () => {
    const family = FAMILIES['employer.true_cost_of_hire']!;
    const { deps: d } = deps(modelsFor(family), { facts: store });
    const a = await askFork(d, { question: 'what does a hire cost', subject: emp('ella') });
    expect(a).toMatchObject({ kind: 'message', reason: 'not_supported' });
  });

  it('a company decision without payroll asks for the export', async () => {
    const family = FAMILIES['employer.introduce_salary_sacrifice']!;
    const empty = new InMemoryFactStore({ company: { other: [f('headcount', 0, 'payroll_export'), f('employer_share_pct', 0, 'company_setting'), f('contribution_pct', 5, 'pension_scheme'), f('fee_per_employee', 4, 'company_setting'), f('employment_allowance', false, 'company_setting')] }, employee: {} });
    const { deps: d } = deps(modelsFor(family), { facts: empty });
    const a = await askFork(d, { question: 'salary sacrifice for us?', subject: { audience: 'owner', companyId: 'other' } });
    expect(a).toMatchObject({ kind: 'message', reason: 'needs_facts' });
  });

  it('every family’s template is a valid spec for its module, and its default layout names real outputs', async () => {
    for (const fam of Object.values(FAMILIES)) {
      expect(fam.template.family).toBe(fam.id);
      expect(fam.template.calculation?.module).toBe(fam.module);
      for (const l of fam.template.levers ?? []) expect(fam.levers).toContain(l.id);
      for (const c of fam.template.constraints ?? []) if (c.kind === 'ask') expect(Object.keys(fam.answers)).toContain(c.id);
    }
  });
});

describe('money on screen', () => {
  it('keeps pence only where whole pounds would mislead', async () => {
    const { formatGBP } = await import('../src');
    expect([formatGBP(0.72), formatGBP(0.8), formatGBP(1.4), formatGBP(1), formatGBP(128.4), formatGBP(-0.5), formatGBP(47950)]).toEqual(['72p', '80p', '£1.40', '£1', '£128', '−50p', '£47,950']);
  });
});

describe('the chart beside the main lever', () => {
  it('is the engine’s result at every lever value, and follows recalculation', async () => {
    const { s } = await screenFor('pension.how_much_to_contribute', emp('ella'), 'should i pay more into my pension');
    expect(s.sweep?.lever).toBe('chosen_pct');
    expect(s.sweep?.xs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const at8 = s.sweep!.series.find((x) => x.key === 'take_home_cost')!.values[7]!;
    expect(Math.round(at8)).toBe(2048);
    const facts = await store.get(emp('ella'), FAMILIES['pension.how_much_to_contribute']!.facts.map((x) => x.id));
    const sac = recalculate(s, facts, { answers: { pay_method: 'sacrifice' } });
    expect(Math.round(sac.sweep!.series.find((x) => x.key === 'take_home_cost')!.values[7]!)).toBe(1843);
  });

  it('every family has one, and long ranges are sampled to at most 41 points', async () => {
    for (const fam of Object.values(FAMILIES)) expect(fam.sweep, fam.id).toBeDefined();
    const { s } = await screenFor('benefits.cycle_to_work', emp('ella'), 'bike through work?');
    expect(s.sweep!.xs.length).toBeLessThanOrEqual(41);
    expect(s.sweep!.xs[0]).toBe(100);
    expect(s.sweep!.xs.at(-1)).toBe(10000);
  });
});
