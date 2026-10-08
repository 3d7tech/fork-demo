import Decimal from 'decimal.js';
import type { RulePack, RuleUse } from '@fork/rules';
import type { CalcResult, Quantity } from '@fork/spec';

export { Decimal };
export type Num = Decimal | number;
export const D = (v: Num) => new Decimal(v);
export const ZERO = new Decimal(0);
export const max = (a: Num, b: Num) => Decimal.max(a, b);
export const min = (a: Num, b: Num) => Decimal.min(a, b);

/** Round to whole pounds, half away from zero: what the screen shows and what golden tests compare. */
export function roundPounds(v: Num): number {
  return D(v).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Every rule a module reads goes through here, so each run records exactly which values it used. */
export class Rules {
  private readonly used = new Map<string, RuleUse>();

  constructor(
    readonly pack: RulePack,
    readonly on: string = pack.today,
  ) {}

  /** Same pack, different date: for "now" against "from April 2029". */
  at(on: string): Rules {
    const r = new Rules(this.pack, on);
    (r as unknown as { used: Map<string, RuleUse> }).used = this.used;
    return r;
  }

  num(id: string): Decimal {
    this.record(id);
    return D(this.pack.num(id, this.on));
  }

  /** null means no limit applies on this date. */
  limit(id: string): Decimal | null {
    this.record(id);
    const v = this.pack.limit(id, this.on);
    return v === null ? null : D(v);
  }

  private record(id: string) {
    const key = `${id}@${this.on}`;
    if (!this.used.has(key)) this.used.set(key, this.pack.use(id, this.on));
  }

  rulesUsed(): RuleUse[] {
    return [...this.used.values()];
  }

  packInfo(): CalcResult['rulePack'] {
    return { id: this.pack.id, version: this.pack.version, status: this.pack.status };
  }
}

export function q(value: Num, unit: Quantity['unit'], label: string, estimate = false): Quantity {
  return { value: D(value).toNumber(), unit, label, estimate };
}

/**
 * Walk a lever across its range and report the stretches where the verdict holds.
 * Gives the screen "the answer flips at X" without the model doing any arithmetic.
 */
export function leverRanges(
  lever: string,
  range: { min: number; max: number; step: number },
  verdictAt: (v: number) => string,
): CalcResult['leverRanges'] {
  const out: CalcResult['leverRanges'] = [];
  const steps = Math.round((range.max - range.min) / range.step);
  for (let i = 0; i <= steps; i++) {
    const v = D(range.min).plus(D(range.step).times(i)).toNumber();
    const verdict = verdictAt(v);
    const last = out[out.length - 1];
    if (last && last.verdict === verdict) last.to = v;
    else out.push({ lever, verdict, from: v, to: v });
  }
  return out;
}
