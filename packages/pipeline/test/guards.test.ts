import { describe, expect, it } from 'vitest';
import { askFork, guard } from '../src';
import { deps, ELLA, good } from './helpers';

describe('safety nets before any model', () => {
  it.each([
    'cant afford rent this month, can i take money out of my pension',
    'I can’t pay my bills and the bailiffs are coming',
    'honestly I don’t want to be here anymore',
    'drowning in debt, should I stop my pension',
    'is a payday loan better than stopping my pension',
  ])('distress: %s', (q) => expect(guard(q)).toBe('distress'));

  it.each(['which fund should my pension be in', 'should I buy bitcoin with my bonus', 'best index fund for my pension?', 'any stock tips?'])('investment: %s', (q) =>
    expect(guard(q)).toBe('investment'),
  );

  it.each([
    'maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch',
    'should I pay more into my pension?',
    'what does it cost us to hire someone on 40k',
    'can I afford to pay 8% into my pension',
    'where is my p60',
    'I sold some shares last year, does that change anything',
  ])('ordinary question passes through: %s', (q) => expect(guard(q)).toBeNull());

  it('a distress question never reaches a model, even one that would route it to a decision', async () => {
    const { deps: d, models } = deps({ ...good, router: () => ({ route: 'decision', family: 'pension.salary_sacrifice_switch', confidence: 'high', distress: false, reason: 'wrong' }) });
    const a = await askFork(d, { question: 'can’t afford rent, should I switch to salary sacrifice to get more take-home?', subject: ELLA });
    expect(a).toMatchObject({ kind: 'message', reason: 'distress' });
    expect(models.calls).toEqual([]);
  });

  it('an investment pick goes to a person without asking a model', async () => {
    const { deps: d, models } = deps(good);
    expect(await askFork(d, { question: 'which fund should my pension be in?', subject: ELLA })).toMatchObject({ kind: 'message', reason: 'human' });
    expect(models.calls).toEqual([]);
  });
});
