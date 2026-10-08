import { describe, expect, it } from 'vitest';
import { askFork, recalculate, reexplain, type BuildStep, type DecisionScreen } from '../src';
import { deps, ELLA, facts, good, QUESTION } from './helpers';

const display = (s: DecisionScreen, key: string) => s.numbers.find((n) => n.key === key)?.display;
const asScreen = (a: unknown) => {
  expect(a).toMatchObject({ kind: 'decision' });
  return a as DecisionScreen;
};

describe('golden end to end: employee switches to salary sacrifice', () => {
  it('turns the question into a checked screen with the golden numbers', async () => {
    const steps: BuildStep[] = [];
    const { deps: d, models } = deps(good);
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA, onStep: (x) => steps.push(x) }));

    expect(display(s, 'take_home_gain')).toBe('£128');
    expect(display(s, 'employer_ni_saving')).toBe('£240');
    expect(display(s, 'employer_share')).toBe('£120');
    expect(s.calc.verdict).toBe('switch');
    expect(s.copy.verdict).toContain('£128');
    expect(s.checks.code).toEqual([]);
    expect(steps.map((x) => x.id)).toEqual(['understood', 'facts', 'spec', 'calc', 'screen', 'checked']);
    expect(models.rolesCalled().sort()).toEqual(['explainer', 'router', 'screen_composer', 'spec_writer', 'verifier']);
    expect(s.provenance.rulePack.id).toBe('uk-2026-27');
    expect(s.provenance.roles.map((r) => r.promptVersion)).toEqual(['v1', 'v1', 'v1', 'v1', 'v1']);
  });

  it('the router never sees pay; the explainer sees only formatted numbers', async () => {
    const { deps: d, models } = deps(good);
    await askFork(d, { question: QUESTION, subject: ELLA });
    const routerInput = JSON.stringify(models.calls.find((c) => c.role === 'router')!.input);
    expect(routerInput).not.toContain('32000');
    const explainerInput = models.calls.find((c) => c.role === 'explainer')!.input;
    expect(Object.keys(explainerInput)).not.toContain('facts');
  });

  it('code owns the facts: a spec writer that changes pay is overruled', async () => {
    const { deps: d } = deps({ ...good, spec_writer: (i) => ({ ...i.template, facts: [{ id: 'salary', value: 50000, source: 'user_answer' }] }) });
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(s.spec.facts.find((f) => f.id === 'salary')).toMatchObject({ value: 32000, source: 'payroll_export' });
    expect(display(s, 'take_home_gain')).toBe('£128');
  });
});

describe('numbers the engine did not produce are blocked', () => {
  const invented = () => ({ ...good.explainer(), verdict: 'Switch. You take home £150 more a year.' });

  it('an invented number is sent back to the explainer and fixed', async () => {
    const { deps: d, models } = deps({ ...good, explainer: (_i, call) => (call === 0 ? invented() : good.explainer()) });
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(s.copy.verdict).toContain('£128');
    expect(s.checks.revised.join(' ')).toContain('£150');
    const retry = models.calls.filter((c) => c.role === 'explainer')[1]!.input;
    expect(retry.feedback.join(' ')).toContain('£150');
    // The spec is not rewritten when only the wording was wrong.
    expect(models.calls.filter((c) => c.role === 'spec_writer')).toHaveLength(1);
  });

  it('a screen that keeps quoting an invented number is never shown', async () => {
    const { deps: d } = deps({ ...good, explainer: invented });
    expect(await askFork(d, { question: QUESTION, subject: ELLA })).toMatchObject({ kind: 'message', reason: 'blocked' });
  });
});

describe('the model verifier', () => {
  it('sends wording problems back to the explainer', async () => {
    const { deps: d, models } = deps({
      ...good,
      verifier: (_i, call) => (call === 0 ? { pass: false, issues: [{ kind: 'tone', detail: 'Too pushy', sendBackTo: 'explainer' }] } : { pass: true, issues: [] }),
    });
    asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(models.calls.filter((c) => c.role === 'explainer')[1]!.input.feedback).toEqual(['tone: Too pushy']);
  });

  it('sends a missing constraint back to the spec writer and rebuilds', async () => {
    const { deps: d, models } = deps({
      ...good,
      verifier: (_i, call) => (call === 0 ? { pass: false, issues: [{ kind: 'constraint', detail: 'Ask about parental leave', sendBackTo: 'spec_writer' }] } : { pass: true, issues: [] }),
    });
    asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(models.calls.filter((c) => c.role === 'spec_writer')[1]!.input.feedback).toEqual(['constraint: Ask about parental leave']);
    expect(models.calls.filter((c) => c.role === 'explainer')).toHaveLength(2);
  });

  it('blocks when it says only a person can fix the screen', async () => {
    const { deps: d } = deps({ ...good, verifier: () => ({ pass: false, issues: [{ kind: 'advice', detail: 'Needs an adviser', sendBackTo: 'human' }] }) });
    expect(await askFork(d, { question: QUESTION, subject: ELLA })).toMatchObject({ reason: 'blocked' });
  });
});

describe('spec and layout safeguards', () => {
  it('a spec with a lever the engine can’t use is retried with feedback', async () => {
    const bad = (i: any) => ({ ...i.template, levers: [{ id: 'bonus_amount', label: 'Bonus', min: 0, max: 1, step: 1, default: 0 }] });
    const { deps: d, models } = deps({ ...good, spec_writer: (i, call) => (call === 0 ? bad(i) : i.template) });
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(models.calls.filter((c) => c.role === 'spec_writer')[1]!.input.feedback.join(' ')).toContain('bonus_amount');
    expect(s.checks.fallbacks).toEqual([]);
  });

  it('falls back to the reviewed template when the spec writer keeps failing', async () => {
    const { deps: d } = deps({ ...good, spec_writer: (i) => ({ ...i.template, calculation: { module: 'pay.threshold_100k', rulePack: 'uk-2026-27' } }) });
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(s.spec.calculation?.module).toBe('pension.ss_switch');
    expect(s.checks.fallbacks[0]).toMatch(/^spec: used the pension.salary_sacrifice_switch template/);
  });

  it('a layout naming an output that doesn’t exist falls back to the family default', async () => {
    const { deps: d } = deps({ ...good, screen_composer: () => ({ ...good.screen_composer(), outcomeTiles: ['take_home_gain', 'made_up', 'pension_total'] }) });
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    expect(s.layout.outcomeTiles).toEqual(['take_home_gain', 'employer_share', 'pension_total']);
    expect(s.checks.fallbacks[0]).toContain('made_up');
  });
});

describe('knowing when not to build a screen', () => {
  const route = (r: object) => () => ({ route: 'decision', family: null, confidence: 'high', distress: false, reason: 'x', ...r });

  it('distress gets a supportive reply and no decision screen, even mid-decision', async () => {
    const { deps: d, models } = deps({ ...good, router: route({ family: 'pension.salary_sacrifice_switch', distress: true }) });
    const a = await askFork(d, { question: 'can’t pay rent, should i stop my pension', subject: ELLA });
    expect(a).toMatchObject({ kind: 'message', reason: 'distress', routeTo: 'support' });
    expect(models.rolesCalled()).toEqual(['router']);
  });

  it('a lookup is answered from documents, with no screen', async () => {
    const lookup = async () => ({ kind: 'message' as const, reason: 'lookup' as const, title: 'Your P60', body: 'It’s in your documents from 31 May 2026.', routeTo: 'documents' as const });
    const { deps: d } = deps({ router: route({ route: 'lookup' }) }, { lookup });
    expect(await askFork(d, { question: 'where is my p60 lol', subject: ELLA })).toMatchObject({ title: 'Your P60' });
  });

  it('an unsupported decision gets an honest "not yet"', async () => {
    const { deps: d } = deps({ router: route({ route: 'not_supported' }) });
    expect(await askFork(d, { question: 'should I buy holiday days?', subject: ELLA })).toMatchObject({ reason: 'not_supported' });
  });

  it('a family the router made up is treated as not supported', async () => {
    const { deps: d } = deps({ router: route({ family: 'crypto.portfolio' }) });
    expect(await askFork(d, { question: 'x', subject: ELLA })).toMatchObject({ reason: 'not_supported' });
  });

  it('investment picks go to a person', async () => {
    const { deps: d } = deps({ router: route({ route: 'human' }) });
    expect(await askFork(d, { question: 'which fund?', subject: ELLA })).toMatchObject({ reason: 'human' });
  });

  it('a low-confidence route asks the person to clarify', async () => {
    const { deps: d } = deps({ router: route({ family: 'pension.salary_sacrifice_switch', confidence: 'low' }) });
    expect(await askFork(d, { question: 'pension thing?', subject: ELLA })).toMatchObject({ reason: 'clarify' });
  });

  it('missing facts become a request for information, not a guess', async () => {
    const { deps: d, models } = deps(good);
    const a = await askFork(d, { question: QUESTION, subject: { ...ELLA, employeeId: 'sam' } });
    expect(a).toMatchObject({ reason: 'needs_facts' });
    expect((a as { body: string }).body).toContain('Your pension contribution');
    expect(models.rolesCalled()).toEqual(['router']);
  });

  it('when every model fails, the person gets the safe message', async () => {
    const { deps: d } = deps({});
    expect(await askFork(d, { question: QUESTION, subject: ELLA })).toMatchObject({ reason: 'failed' });
  });
});

describe('levers and constraint answers', () => {
  it('re-runs the numbers instantly with no model calls', async () => {
    const { deps: d, models } = deps(good);
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    const before = models.calls.length;
    const gathered = await facts.get(ELLA, ['salary', 'contribution_pct', 'relief_method', 'employer_share_pct', 'employer_contribution_pct', 'hours_per_week']);

    const mortgage = recalculate(s, gathered, { answers: { mortgage_12m: 'yes' } });
    expect(mortgage.calc.verdict).toBe('switch_with_caution');

    const eight = recalculate(s, gathered, { levers: { contribution_pct: 8 } });
    expect(eight.numbers.find((n) => n.key === 'contribution')?.display).toBe('£2,560');
    expect(models.calls.length).toBe(before);

    expect(() => recalculate(s, gathered, { levers: { contribution_pct: 40 } })).toThrow(/out of range/);
  });

  it('re-explains after a change and highlights the constraint that changed the answer', async () => {
    const { deps: d } = deps(good);
    const s = asScreen(await askFork(d, { question: QUESTION, subject: ELLA }));
    const gathered = await facts.get(ELLA, ['salary', 'contribution_pct', 'relief_method', 'employer_share_pct', 'employer_contribution_pct', 'hours_per_week']);
    const r = asScreen(await reexplain(d, s, recalculate(s, gathered, { answers: { mortgage_12m: 'yes' } })));
    expect(r.layout.highlightConstraint).toBe('mortgage_12m');
    expect(r.answers.mortgage_12m).toBe('yes');
  });
});
