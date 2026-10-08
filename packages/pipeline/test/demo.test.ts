import { loadRegistry, MemoryLogger } from '@fork/models';
import { describe, expect, it } from 'vitest';
import { askFork, DEMO_FACTS, DEMO_SUBJECT, DemoModels, recalculate, reexplain, type DecisionScreen } from '../src';

const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new DemoModels() }, log: new MemoryLogger() }, facts: DEMO_FACTS };
const ALL = ['salary', 'contribution_pct', 'relief_method', 'employer_share_pct', 'employer_contribution_pct', 'hours_per_week'];

describe('demo mode', () => {
  it('builds the golden screen and its templated copy passes the real number checks', async () => {
    const s = (await askFork(deps, { question: 'is salary sacrifice worth it?', subject: DEMO_SUBJECT })) as DecisionScreen;
    expect(s.kind).toBe('decision');
    expect(s.copy.verdict).toBe('Switch. You take home £128 more a year, and Larkfield adds £120 to your pension.');
    expect(s.visual.type).toBe('bars');
  });

  it('caution answers re-explain and still pass the checks', async () => {
    const s = (await askFork(deps, { question: 'salary sacrifice?', subject: DEMO_SUBJECT })) as DecisionScreen;
    const gathered = await DEMO_FACTS.get(DEMO_SUBJECT, ALL);
    const r = (await reexplain(deps, s, recalculate(s, gathered, { answers: { mortgage_12m: 'yes', parental_leave_12m: 'yes' } }))) as DecisionScreen;
    expect(r.kind).toBe('decision');
    expect(r.copy.verdict).toBe('Probably switch, but check one thing first.');
    expect(r.copy.why).toContain('about £166');
  });

  it.each([
    ['where is my p60', 'lookup'],
    ['which fund should I pick', 'human'],
    ['can’t afford rent this month', 'distress'],
    ['should I buy extra holiday', 'not_supported'],
  ])('“%s” → %s', async (question, reason) => {
    expect(await askFork(deps, { question, subject: DEMO_SUBJECT })).toMatchObject({ kind: 'message', reason });
  });
});
