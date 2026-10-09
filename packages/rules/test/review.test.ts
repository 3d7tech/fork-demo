import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { correct, formatPack, formatRuleValue, loadRulePack, parseRuleValue, publish, ReviewError, reviewSheet, reviewSummary, signOff, type RulePackData } from '../src';

const base = loadRulePack('uk-2026-27').data;
const who = { by: 'Richard Awe', on: '2026-10-09' };
const START = '2026-04-06';

/** Signs off every value as it stands, for tests that need a fully checked pack. */
function signAll(data: RulePackData): RulePackData {
  return reviewSummary(data).items.reduce((d, i) => signOff(d, i.ruleId, i.from, i.value, who), data);
}

describe('rule pack review', () => {
  it('lists every value with its source, none checked in the draft', () => {
    const s = reviewSummary(base);
    expect(s.total).toBe(base.rules.reduce((n, r) => n + r.values.length, 0));
    expect(s.checked).toBe(0);
    expect(s.canPublish).toBe(false);
    for (const i of s.items) expect(i.source.url).toMatch(/^https:\/\//);
  });

  it('signs off a value when the person read the same figure at the source', () => {
    const d = signOff(base, 'income_tax.personal_allowance', START, parseRuleValue('GBP', '£12,570'), who);
    const i = reviewSummary(d).items.find((x) => x.ruleId === 'income_tax.personal_allowance')!;
    expect(i).toMatchObject({ checked: true, lastChecked: '2026-10-09', checkedBy: 'Richard Awe', value: 12570 });
    expect(d.version).toBe(base.version);
  });

  it('refuses a sign-off when the figure read differs, and changes nothing', () => {
    expect(() => signOff(base, 'income_tax.personal_allowance', START, 12500, who)).toThrow(/£12,570 in the pack, but you read £12,500/);
    expect(reviewSummary(base).checked).toBe(0);
  });

  it('needs a name and a real date', () => {
    expect(() => signOff(base, 'income_tax.personal_allowance', START, 12570, { by: ' ', on: '2026-10-09' })).toThrow(ReviewError);
    expect(() => signOff(base, 'income_tax.personal_allowance', START, 12570, { by: 'R', on: 'today' })).toThrow(ReviewError);
  });

  it('names the dates a rule has when the one given is wrong', () => {
    expect(() => signOff(base, 'salary_sacrifice.pension_ni_cap', '2029-01-01', 2000, who)).toThrow(/2026-04-06, 2029-04-06/);
    expect(() => signOff(base, 'no.such_rule', START, 1, who)).toThrow(/No rule/);
  });

  it('a correction keeps the old value in the note, bumps the version and needs a reason', () => {
    expect(() => correct(base, 'income_tax.personal_allowance', START, 12600, '', who)).toThrow(/reason/);
    expect(() => correct(base, 'income_tax.personal_allowance', START, 12570, 'same', who)).toThrow(/sign it off instead/);
    const d = correct(base, 'income_tax.personal_allowance', START, 12600, 'GOV.UK page says £12,600', who);
    const v = d.rules.find((r) => r.id === 'income_tax.personal_allowance')!.values[0]!;
    expect(v).toMatchObject({ value: 12600, checkedBy: 'Richard Awe', lastChecked: '2026-10-09' });
    expect(v.note).toContain('from £12,570: GOV.UK page says £12,600');
    expect(d.version).not.toBe(base.version);
    expect(base.rules.find((r) => r.id === 'income_tax.personal_allowance')!.values[0]!.value).toBe(12570);
  });

  it('publishes only when every value is checked, and a later correction returns it to draft', () => {
    expect(() => publish(base, who)).toThrow(/still need a person's check/);
    const p = publish(signAll(base), who);
    expect(p).toMatchObject({ status: 'published', review: { checkedBy: 'Richard Awe', publishedAt: '2026-10-09' } });
    const c = correct(p, 'income_tax.personal_allowance', START, 12600, 'source changed', who);
    expect(c.status).toBe('draft');
    expect(c.review.publishedAt).toBeNull();
  });

  it('reads values as the source writes them', () => {
    expect(parseRuleValue('rate', '20%')).toBe(0.2);
    expect(parseRuleValue('rate', '13.25%')).toBe(0.1325);
    expect(parseRuleValue('rate', '0.08')).toBe(0.08);
    expect(parseRuleValue('GBP_per_hour', '£12.71')).toBe(12.71);
    expect(parseRuleValue('GBP', 'none')).toBeNull();
    expect(() => parseRuleValue('GBP', 'twelve')).toThrow(ReviewError);
    expect(() => parseRuleValue('GBP', '20%')).toThrow(ReviewError);
    expect(formatRuleValue('rate', 0.1325)).toBe('13.25%');
    expect(formatRuleValue('GBP', 12570)).toBe('£12,570');
    expect(formatRuleValue('GBP_per_hour', 12.7)).toBe('£12.70 an hour');
  });

  it('the checklist shows each value, its link and what is left', () => {
    const sheet = reviewSheet(signOff(base, 'income_tax.personal_allowance', START, 12570, who));
    expect(sheet).toContain(`1 of ${reviewSummary(base).total} values checked`);
    expect(sheet).toContain('[x] checked 2026-10-09 by Richard Awe: **£12,570**');
    expect(sheet).toContain('(https://www.gov.uk/income-tax-rates)');
    expect(sheet).toContain('legislated');
  });

  it('the pack file is kept one line per value, so a sign-off is a one-line change', () => {
    const file = readFileSync(new URL('../packs/uk-2026-27.json', import.meta.url), 'utf8');
    expect(formatPack(JSON.parse(file))).toBe(file);
    const after = formatPack(signOff(base, 'income_tax.basic_rate', START, 0.2, who)).split('\n');
    expect(after.filter((line, k) => line !== file.split('\n')[k])).toHaveLength(1);
  });
});
