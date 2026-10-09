import uk202627 from '../packs/uk-2026-27.json';

export type RuleStatus = 'in_force' | 'legislated' | 'announced' | 'proposed';
export type RuleUnit = 'GBP' | 'rate' | 'GBP_per_hour' | 'count';

export interface RuleSource {
  title: string;
  url: string;
}

export interface RuleValue {
  /** null means "no limit" for caps that do not exist yet. */
  value: number | null;
  from: string;
  to?: string;
  status: RuleStatus;
  note?: string;
  source: RuleSource;
  lastChecked: string | null;
  /** The person who checked it against the source (see `review.ts`). */
  checkedBy?: string | null;
}

export interface Rule {
  id: string;
  description: string;
  unit: RuleUnit;
  values: RuleValue[];
}

export interface RulePackData {
  id: string;
  version: string;
  jurisdiction: string;
  taxYear: { start: string; end: string };
  status: 'draft' | 'published';
  review: { note?: string; checkedBy: string | null; publishedAt: string | null };
  rules: Rule[];
}

/** What a calculation used: recorded on every DecisionRun so results can be traced and re-run. */
export interface RuleUse {
  id: string;
  description: string;
  unit: RuleUnit;
  on: string;
  value: number | null;
  status: RuleStatus;
  source: RuleSource;
}

export class RuleNotFoundError extends Error {}

export class RulePack {
  readonly id: string;
  readonly version: string;
  readonly status: RulePackData['status'];
  private readonly byId: Map<string, Rule>;

  constructor(readonly data: RulePackData) {
    this.id = data.id;
    this.version = data.version;
    this.status = data.status;
    this.byId = new Map(data.rules.map((r) => [r.id, r]));
  }

  /** The start of the pack's tax year: the default date for "now". */
  get today(): string {
    return this.data.taxYear.start;
  }

  rule(id: string): Rule {
    const r = this.byId.get(id);
    if (!r) throw new RuleNotFoundError(`Rule ${id} is not in pack ${this.id}`);
    return r;
  }

  /** The value entry in force on a date (ISO yyyy-mm-dd). */
  entry(id: string, on: string = this.today): RuleValue {
    const r = this.rule(id);
    const hit = r.values.find((v) => v.from <= on && (v.to === undefined || on <= v.to));
    if (!hit) throw new RuleNotFoundError(`Rule ${id} has no value on ${on} in pack ${this.id}`);
    return hit;
  }

  /** A numeric value; throws if the rule has no limit on that date. */
  num(id: string, on?: string): number {
    const v = this.entry(id, on).value;
    if (v === null) throw new RuleNotFoundError(`Rule ${id} has no numeric value on ${on ?? this.today}`);
    return v;
  }

  /** A value that may be "no limit" (null). */
  limit(id: string, on?: string): number | null {
    return this.entry(id, on).value;
  }

  use(id: string, on: string = this.today): RuleUse {
    const e = this.entry(id, on);
    const r = this.rule(id);
    return { id, description: r.description, unit: r.unit, on, value: e.value, status: e.status, source: e.source };
  }
}

const PACKS: Record<string, RulePackData> = {
  'uk-2026-27': uk202627 as RulePackData,
};

export function loadRulePack(id: string): RulePack {
  const data = PACKS[id];
  if (!data) throw new RuleNotFoundError(`Unknown rule pack ${id}`);
  return new RulePack(data);
}

export function listRulePacks(): string[] {
  return Object.keys(PACKS);
}

export * from './review';
