import type { Fact } from '@fork/spec';

export const num = (v: unknown, what = 'value'): number => {
  if (typeof v !== 'number') throw new Error(`Expected a number for ${what}, got ${typeof v}`);
  return v;
};

export const relief = (v: Fact['value'] | undefined): 'relief_at_source' | 'net_pay' => {
  if (v !== 'relief_at_source' && v !== 'net_pay') throw new Error(`Unknown relief method ${String(v)}`);
  return v;
};

/** A floor for bar charts so a small difference is visible: 97% of the smaller value, rounded down to £100. */
export const floorFor = (...values: number[]) => {
  const floor = Math.floor((Math.min(...values) * 0.97) / 100) * 100;
  return { value: floor, display: `£${floor.toLocaleString('en-GB')}` };
};

/** The tax year a scheme starting now would start in: 6 April this year, or last year before 6 April. */
export function taxYearStart(today = new Date()): string {
  const y = today.getUTCFullYear();
  const april6 = Date.UTC(y, 3, 6);
  return `${today.getTime() >= april6 ? y : y - 1}-04-06`;
}
