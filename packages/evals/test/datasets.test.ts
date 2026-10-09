import { FAMILIES } from '@fork/pipeline';
import { POLICY_KEYS } from '@fork/setup';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { load, seedFaults, type DocumentSet, type LeverSet, type LookupSet, type RouterSet, type ScreenSet, type SpecSet } from '../src';

// Offline checks that every labelled case points at things that exist, so a live run can't fail on a typo.
describe('evaluation datasets', () => {
  it('router: a broad labelled set, with distress, investment, lookups and not-yet cases', () => {
    const set = load<RouterSet>('router');
    expect(set.cases.length).toBeGreaterThanOrEqual(130);
    for (const c of set.cases) {
      if (c.route === 'decision') {
        expect(FAMILIES[c.family!], c.question).toBeDefined();
        expect(FAMILIES[c.family!]!.audience, c.question).toBe(c.audience);
      }
      expect(c.distress || c.route, c.question).toBeTruthy();
    }
    const count = (p: (c: RouterSet['cases'][number]) => boolean) => set.cases.filter(p).length;
    expect(count((c) => !!c.distress)).toBeGreaterThanOrEqual(10);
    expect(count((c) => c.route === 'human')).toBeGreaterThanOrEqual(10);
    expect(count((c) => c.route === 'not_supported')).toBeGreaterThanOrEqual(15);
    expect(count((c) => c.route === 'lookup')).toBeGreaterThanOrEqual(15);
    for (const id of Object.keys(FAMILIES)) expect(count((c) => c.family === id), id).toBeGreaterThanOrEqual(8);
  });

  it('levers, lookups and documents refer to real levers, keys and files', () => {
    for (const c of load<LeverSet>('lever_reader').cases) {
      const levers = (FAMILIES[c.family]!.template.levers ?? []).map((l) => l.id);
      for (const id of Object.keys(c.expect)) expect(levers, c.question).toContain(id);
    }
    const keys = new Set([...POLICY_KEYS.map((k) => k.key), 'reenrolment_date']);
    const lookups = load<LookupSet>('lookup_matcher');
    for (const k of lookups.available) expect(keys.has(k), k).toBe(true);
    for (const c of lookups.cases) if (c.expect) expect(lookups.available).toContain(c.expect);
    for (const c of load<DocumentSet>('document_interpreter').cases) {
      expect(existsSync(join(import.meta.dirname, '../../setup/fixtures', c.file))).toBe(true);
      for (const k of Object.keys(c.expect)) expect(keys.has(k), k).toBe(true);
    }
  });

  it('screens and spec cases cover every family', () => {
    const fams = new Set([...load<ScreenSet>('screens').cases.map((c) => c.family), ...load<SpecSet>('spec_writer').cases.map((c) => c.family)]);
    for (const id of Object.keys(FAMILIES)) expect(fams.has(id) || id === 'employer.bonus_cash_or_pension' || id === 'employer.true_cost_of_hire', id).toBe(true);
  });

  it('seeded faults really change the screen', async () => {
    const { askFork } = await import('@fork/pipeline');
    const { deps, good, QUESTION, ELLA } = await import('../../pipeline/test/helpers');
    const s = (await askFork(deps(good).deps, { question: QUESTION, subject: ELLA })) as any;
    const faults = seedFaults(s, ['wrong_number_meaning', 'advice', 'wrong_source', 'invented_number', 'missing_caution']);
    expect(faults.map((f) => f.name).sort()).toEqual(['advice', 'invented_number', 'missing_caution', 'wrong_number_meaning', 'wrong_source']);
    for (const f of faults) expect(JSON.stringify(f.copy) !== JSON.stringify(s.copy) || f.screen !== s, f.name).toBe(true);
  });
});
