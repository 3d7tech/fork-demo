import { describe, expect, it } from 'vitest';
import example from '../examples/pension.ss_switch.json';
import { DecisionSpec, toJsonSchemas } from '../src';

const clone = () => JSON.parse(JSON.stringify(example));

describe('DecisionSpec', () => {
  it('accepts the brief’s example spec', () => {
    const r = DecisionSpec.safeParse(example);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('fills defaults, such as yes/no answers on an ask constraint', () => {
    const s = DecisionSpec.parse(example);
    const ask = s.constraints.find((c) => c.kind === 'ask');
    expect(ask && 'answers' in ask && ask.answers.map((a) => a.id)).toEqual(['no', 'yes']);
  });

  it('rejects a lever default that points at a missing fact', () => {
    const s = clone();
    s.levers[0].default = 'fact:nope';
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('rejects a decision with no calculation module', () => {
    const s = clone();
    delete s.calculation;
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('rejects a lookup that tries to calculate', () => {
    const s = clone();
    s.decisionType = 'lookup';
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('rejects more than three levers', () => {
    const s = clone();
    s.levers = [1, 2, 3, 4].map((k) => ({ id: `l${k}`, label: 'x', min: 0, max: 1, step: 1, default: 0 }));
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('rejects an unknown fact source', () => {
    const s = clone();
    s.facts[0].source = 'gut_feeling';
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('rejects a wrong spec version', () => {
    const s = clone();
    s.specVersion = '2.0';
    expect(DecisionSpec.safeParse(s).success).toBe(false);
  });

  it('exports JSON Schema for model structured output', () => {
    const js = toJsonSchemas();
    expect(js.DecisionSpec).toHaveProperty('properties.family');
    expect(js.CalcResult).toHaveProperty('properties.outputs');
  });
});
