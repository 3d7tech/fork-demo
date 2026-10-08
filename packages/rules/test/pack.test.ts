import { describe, expect, it } from 'vitest';
import { listRulePacks, loadRulePack, RuleNotFoundError } from '../src';

const OFFICIAL = /^https:\/\/(www\.)?(gov\.uk|legislation\.gov\.uk|thepensionsregulator\.gov\.uk)\//;

describe.each(listRulePacks())('rule pack %s', (id) => {
  const pack = loadRulePack(id);

  it('every value cites an official source', () => {
    for (const r of pack.data.rules) for (const v of r.values) expect(v.source.url, r.id).toMatch(OFFICIAL);
  });

  it('every rule has a value on the first day of the tax year', () => {
    for (const r of pack.data.rules) expect(() => pack.entry(r.id), r.id).not.toThrow();
  });

  it('date windows never overlap and are in order', () => {
    for (const r of pack.data.rules) {
      for (let k = 1; k < r.values.length; k++) {
        const prev = r.values[k - 1]!;
        expect(prev.to, `${r.id} entry ${k - 1} needs an end date`).toBeDefined();
        expect(prev.to! < r.values[k]!.from, r.id).toBe(true);
      }
    }
  });

  it('a published pack has every value checked by a person', () => {
    if (pack.status !== 'published') return;
    expect(pack.data.review.checkedBy).toBeTruthy();
    for (const r of pack.data.rules) for (const v of r.values) expect(v.lastChecked, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('future-dated rules', () => {
  const pack = loadRulePack('uk-2026-27');
  it('no salary sacrifice cap before 6 April 2029', () => {
    expect(pack.limit('salary_sacrifice.pension_ni_cap', '2029-04-05')).toBeNull();
  });
  it('£2,000 cap from 6 April 2029, marked legislated not in force', () => {
    expect(pack.limit('salary_sacrifice.pension_ni_cap', '2029-04-06')).toBe(2000);
    expect(pack.entry('salary_sacrifice.pension_ni_cap', '2029-04-06').status).toBe('legislated');
  });
  it('company car percentages by tax year', () => {
    expect(['2026-04-06', '2027-04-06', '2028-04-06', '2029-04-06'].map((d) => pack.num('company_car.appropriate_pct_zero_emission', d))).toEqual([
      0.04, 0.05, 0.07, 0.09,
    ]);
  });
  it('asking past the pack fails loudly instead of guessing', () => {
    expect(() => pack.num('company_car.appropriate_pct_zero_emission', '2030-04-06')).toThrow(RuleNotFoundError);
    expect(() => pack.num('no.such_rule')).toThrow(RuleNotFoundError);
  });
});
