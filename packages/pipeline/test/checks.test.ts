import { describe, expect, it } from 'vitest';
import { checkCopy, extractNumbers, formatGBP, type ScreenNumber } from '../src';

const nums: ScreenNumber[] = [
  { key: 'gain', label: 'Gain', display: '£128', estimate: false },
  { key: 'salary', label: 'Pay', display: '£32,000', estimate: false },
  { key: 'rate', label: 'NI', display: '8%', estimate: false },
  { key: 'from', label: 'From', display: '6 April 2029', estimate: false },
  { key: 'fuel', label: 'Fuel a year', display: '£1,273', estimate: true },
];
const copy = (verdict: string, why = 'Because.') => ({ title: 'Should you switch?', verdict, why, tippingPoint: null, assumptions: [], actionLabel: null });

describe('extractNumbers', () => {
  it('reads amounts, percentages, k-suffixes, minus signs and years', () => {
    expect(extractNumbers('−£1,234 and 8% on 32k from 2029').map((t) => [t.kind, t.value])).toEqual([
      ['GBP', -1234],
      ['pct', 8],
      ['plain', 32000],
      ['plain', 2029],
    ]);
  });
});

describe('checkCopy', () => {
  it('passes copy that quotes only allowed numbers, in any formatting', () => {
    expect(checkCopy(copy('Switch. You take home £128 more on 32k pay.', 'You don’t pay 8% from 6 April 2029.'), nums)).toEqual([]);
  });
  it('flags a number Fork did not calculate', () => {
    expect(checkCopy(copy('You take home £150 more.'), nums)[0]).toMatch(/^number: verdict quotes "£150"/);
  });
  it('flags a right number with the wrong kind', () => {
    expect(checkCopy(copy('You get 128% more.'), nums)).toHaveLength(1);
  });
  it('flags rounding the engine did not do', () => {
    expect(checkCopy(copy('About £130 more a year.'), nums)).toHaveLength(1);
  });
  it('requires "about" before an estimate', () => {
    expect(checkCopy(copy('Fuel costs £1,273 a year.'), nums)[0]).toMatch(/estimate/);
    expect(checkCopy(copy('Fuel costs about £1,273 a year.'), nums)).toEqual([]);
  });
  it('flags advice wording', () => {
    expect(checkCopy(copy('You must switch now.'), nums)[0]).toMatch(/^advice/);
    expect(checkCopy(copy('Put your money in an index fund.'), nums)[0]).toMatch(/^advice/);
    expect(checkCopy(copy('A guaranteed saving.'), nums)[0]).toMatch(/^advice/);
  });
});

describe('formatting', () => {
  it('uses British formatting with a true minus sign', () => {
    expect(formatGBP(1234.5)).toBe('£1,235');
    expect(formatGBP(-988)).toBe('−£988');
  });
});
