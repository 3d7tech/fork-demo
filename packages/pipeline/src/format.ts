import { roundPounds } from '@fork/calc';
import type { Quantity } from '@fork/spec';

/** One number the screen may show, already formatted. The explainer may quote only these. */
export interface ScreenNumber {
  key: string;
  label: string;
  display: string;
  estimate: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** British formatting: £1,234 with a true minus sign, whole pounds. */
/**
 * Money for display: whole pounds, except amounts under £10 that aren't whole, which keep their
 * pence ("72p", "£1.40") so "each £1 costs you 72p" doesn't read as "£1".
 */
export function formatGBP(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  const pence = Math.round(a * 100);
  if (a < 10 && pence % 100 !== 0) return pence < 100 ? `${sign}${pence}p` : `${sign}£${(pence / 100).toFixed(2)}`;
  const r = roundPounds(a);
  return `${sign}£${r.toLocaleString('en-GB')}`;
}

export function formatPct(v: number): string {
  return `${Number(v.toFixed(2)).toLocaleString('en-GB')}%`;
}

/** "2029-04-06" → "6 April 2029". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]} ${y}`;
}

export function formatQuantity(q: Pick<Quantity, 'value' | 'unit'>): string {
  switch (q.unit) {
    case 'GBP':
      return formatGBP(q.value);
    case 'pct':
      return formatPct(q.value);
    case 'rate':
      return formatPct(q.value * 100);
    case 'GBP_per_hour':
      return `£${q.value.toFixed(2)}`;
    case 'miles':
      return Math.round(q.value).toLocaleString('en-GB');
    case 'count':
      return Math.round(q.value).toLocaleString('en-GB');
  }
}

/** A number found in text, reduced to a value and a kind so formatting differences don't matter. */
export interface NumberToken {
  raw: string;
  value: number;
  kind: 'GBP' | 'pct' | 'plain';
  index: number;
}

const NUMBER = /([−-])?(£)?(\d[\d,]*(?:\.\d+)?)(k\b)?(%)?/g;

/** Every number in a piece of text: amounts, percentages and bare numbers such as years. */
export function extractNumbers(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const [raw, minus, pound, digits, k, pct] = m;
    let value = Number(digits!.replace(/,/g, ''));
    if (Number.isNaN(value)) continue;
    if (k) value *= 1000;
    if (minus && (pound || pct)) value = -value;
    out.push({ raw: raw!, value, kind: pound ? 'GBP' : pct ? 'pct' : 'plain', index: m.index! });
  }
  return out;
}
