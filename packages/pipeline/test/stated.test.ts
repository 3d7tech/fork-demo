import type { Fact } from '@fork/spec';
import { describe, expect, it } from 'vitest';
import { askFork, InMemoryFactStore, recalculate, type DecisionScreen } from '../src';
import { statedPay } from '../src/stated';
import { deps, ELLA, facts, good, QUESTION } from './helpers';

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });

/** Callum asks the demo question, but his payroll says £95,000 and his contribution comes from payroll. */
const CALLUM = { audience: 'employee' as const, companyId: 'larkfield', employeeId: 'callum' };
const callumFacts = new InMemoryFactStore({
  company: { larkfield: [f('employer_share_pct', 50, 'company_setting'), f('employer_contribution_pct', 3, 'pension_scheme'), f('relief_method', 'relief_at_source', 'pension_scheme')] },
  employee: { 'larkfield/callum': [f('salary', 95000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')] },
});

const explainerInput = (models: { calls: Array<{ role: string; input: any }> }) => models.calls.find((c) => c.role === 'explainer')!.input;

describe('pay stated in the question', () => {
  it('reads pay only from phrases about the person’s pay', () => {
    expect(statedPay(QUESTION)).toBe(32000);
    expect(statedPay('im on 108k with two kids in nursery')).toBe(108000);
    expect(statedPay('I earn £45,000, should I pay more in?')).toBe(45000);
    expect(statedPay('my salary is 52.5k')).toBe(52500);
    expect(statedPay('should i get a £1,000 bike through cycle to work')).toBeNull();
    expect(statedPay('we want to give everyone a £1,500 christmas bonus, cash or pension?')).toBeNull();
    expect(statedPay('should i pay more into my pension? thinking 8%')).toBeNull();
  });

  it('a figure that matches payroll adds nothing', async () => {
    const { deps: d, models } = deps(good);
    await askFork(d, { question: QUESTION, subject: ELLA });
    expect(explainerInput(models).assumptions.map((a: any) => a.text).join(' ')).not.toContain('different from the figure in your question');
  });

  it('a figure that differs from payroll is pointed out in code-written words, quoting only payroll', async () => {
    const { deps: d, models } = deps(good, { facts: callumFacts });
    await askFork(d, { question: QUESTION, subject: CALLUM });
    const assumptions = explainerInput(models).assumptions;
    const note = assumptions.find((a: any) => a.fact === 'salary');
    expect(note).toMatchObject({ source: 'payroll_export' });
    expect(note.text).toContain('Your payroll shows pay of £95,000 a year, which is different from the figure in your question');
    expect(note.text).not.toMatch(/32/);
    // It replaces the plain "Pay £95,000 a year" rather than repeating it.
    expect(assumptions.filter((a: any) => a.fact === 'salary')).toHaveLength(1);
  });
});

describe('assumption sources come from the facts', () => {
  it('a contribution read from payroll is credited to payroll, not the pension scheme', async () => {
    const { deps: d, models } = deps(good, { facts: callumFacts });
    await askFork(d, { question: QUESTION, subject: CALLUM });
    expect(explainerInput(models).assumptions.find((a: any) => a.fact === 'contribution_pct')).toMatchObject({ source: 'payroll_export' });
  });

  it('a lever the person moved is their own answer', async () => {
    const { deps: d } = deps(good);
    const s = (await askFork(d, { question: QUESTION, subject: ELLA })) as DecisionScreen;
    expect(s.calc.assumptions.find((a) => a.fact === 'contribution_pct')).toMatchObject({ source: 'pension_scheme' });
    const r = recalculate(s, await facts.get(ELLA, ['salary', 'contribution_pct', 'relief_method', 'employer_share_pct', 'employer_contribution_pct', 'hours_per_week']), { levers: { contribution_pct: 8 } });
    expect(r.calc.assumptions.find((a) => a.fact === 'contribution_pct')).toMatchObject({ source: 'user_answer' });
  });
});

describe('the person’s tax profile reaches the sums (ADR 0010)', () => {
  const ellaScot = new InMemoryFactStore({
    company: { larkfield: [f('employer_share_pct', 50, 'company_setting'), f('employer_contribution_pct', 3, 'pension_scheme'), f('relief_method', 'relief_at_source', 'pension_scheme')] },
    employee: {
      'larkfield/ella': [
        f('salary', 32000, 'payroll_export'),
        f('contribution_pct', 5, 'pension_scheme'),
        f('hours_per_week', 37.5, 'payroll_export'),
        f('tax_region', 'scotland', 'payroll_export'),
        f('student_loans', 'plan_2', 'user_answer'),
      ],
    },
  });

  it('known profile facts change the numbers and are credited to their sources', async () => {
    const { deps: d } = deps({ ...good, explainer: () => ({ ...good.explainer(), verdict: 'Switch.', why: 'It saves you money.', tippingPoint: null }) }, { facts: ellaScot });
    const s = (await askFork(d, { question: QUESTION, subject: ELLA })) as DecisionScreen;
    expect(s.calc.outputs.take_home_gain!.value).toBeCloseTo(288, 6);
    const by = (fact: string) => s.calc.assumptions.find((a) => a.fact === fact);
    expect(by('tax_region')).toMatchObject({ text: 'Scottish income tax rates', source: 'payroll_export', estimate: false });
    expect(by('student_loans')).toMatchObject({ text: 'Repaying Plan 2 through payroll', source: 'user_answer' });
  });

  it('unknown profile facts are listed as estimates', async () => {
    const { deps: d } = deps(good);
    const s = (await askFork(d, { question: QUESTION, subject: ELLA })) as DecisionScreen;
    expect(s.calc.outputs.take_home_gain!.value).toBeCloseTo(128, 6);
    expect(s.calc.assumptions.filter((a) => a.source === 'estimate').map((a) => a.text)).toContain('No student loan to repay');
  });
});
