// Reviewing a rule pack: a person checks every value against its source and signs it off.
// Nothing here looks a value up or decides one is right. Code only records what a person said,
// and refuses a sign-off when the value they read at the source is not the value in the pack.
import type { Rule, RulePackData, RuleValue } from './index';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class ReviewError extends Error {}

export interface ReviewItem {
  ruleId: string;
  description: string;
  unit: Rule['unit'];
  from: string;
  to?: string;
  value: number | null;
  status: RuleValue['status'];
  note?: string;
  source: RuleValue['source'];
  lastChecked: string | null;
  checkedBy: string | null;
  checked: boolean;
}

export interface ReviewSummary {
  packId: string;
  version: string;
  status: RulePackData['status'];
  total: number;
  checked: number;
  items: ReviewItem[];
  /** Every value checked by a named person on a real date. */
  canPublish: boolean;
}

function isChecked(v: RuleValue): boolean {
  return !!v.lastChecked && DAY.test(v.lastChecked) && !!v.checkedBy?.trim();
}

export function reviewSummary(data: RulePackData): ReviewSummary {
  const items = data.rules.flatMap((r) =>
    r.values.map((v) => ({
      ruleId: r.id,
      description: r.description,
      unit: r.unit,
      from: v.from,
      to: v.to,
      value: v.value,
      status: v.status,
      note: v.note,
      source: v.source,
      lastChecked: v.lastChecked,
      checkedBy: v.checkedBy ?? null,
      checked: isChecked(v),
    })),
  );
  const checked = items.filter((i) => i.checked).length;
  return { packId: data.id, version: data.version, status: data.status, total: items.length, checked, items, canPublish: checked === items.length };
}

/** How a value is written at the source, so a reviewer compares like with like (20% not 0.2). */
export function formatRuleValue(unit: Rule['unit'], value: number | null): string {
  if (value === null) return 'no limit';
  if (unit === 'rate') return `${+(value * 100).toFixed(4)}%`;
  if (unit === 'GBP' || unit === 'GBP_per_hour') {
    const pounds = value.toLocaleString('en-GB', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 });
    return unit === 'GBP' ? `£${pounds}` : `£${pounds} an hour`;
  }
  return String(value);
}

/**
 * Reads a value as a reviewer types it from the source: "£12,570", "12570", "20%", "0.2", "none".
 * A rate may be given as a percentage or a fraction; anything else is refused rather than guessed.
 */
export function parseRuleValue(unit: Rule['unit'], text: string): number | null {
  const t = text.trim().toLowerCase();
  if (t === 'none' || t === 'no limit') return null;
  const pct = t.endsWith('%');
  const n = Number(t.replace(/[£,%\s]|an hour$/g, ''));
  if (!t || !Number.isFinite(n)) throw new ReviewError(`"${text}" is not a number`);
  if (unit === 'rate') return pct ? +(n / 100).toFixed(10) : n;
  if (pct) throw new ReviewError(`${unit} values are amounts, not percentages`);
  return n;
}

interface Who {
  by: string;
  on: string;
}

function checkWho({ by, on }: Who) {
  if (!by.trim()) throw new ReviewError('A sign-off needs the name of the person who checked it');
  if (!DAY.test(on)) throw new ReviewError(`"${on}" is not a date (yyyy-mm-dd)`);
}

function locate(data: RulePackData, ruleId: string, from: string): { rule: Rule; index: number } {
  const rule = data.rules.find((r) => r.id === ruleId);
  if (!rule) throw new ReviewError(`No rule ${ruleId} in ${data.id}`);
  const index = rule.values.findIndex((v) => v.from === from);
  if (index < 0) throw new ReviewError(`${ruleId} has no value from ${from} (it has ${rule.values.map((v) => v.from).join(', ')})`);
  return { rule, index };
}

function withValue(data: RulePackData, ruleId: string, index: number, next: RuleValue, version = data.version): RulePackData {
  return {
    ...data,
    version,
    rules: data.rules.map((r) => (r.id === ruleId ? { ...r, values: r.values.map((v, k) => (k === index ? next : v)) } : r)),
  };
}

/**
 * A person confirms a value. They give the value they read at the source; if it is not the value
 * in the pack, nothing is signed and they are told to record a correction instead.
 */
export function signOff(data: RulePackData, ruleId: string, from: string, seen: number | null, who: Who): RulePackData {
  checkWho(who);
  const { rule, index } = locate(data, ruleId, from);
  const v = rule.values[index]!;
  if (seen !== v.value) {
    throw new ReviewError(
      `${ruleId} is ${formatRuleValue(rule.unit, v.value)} in the pack, but you read ${formatRuleValue(rule.unit, seen)}. ` +
        'Nothing was signed. If the source is right, record a correction with a reason.',
    );
  }
  return withValue(data, ruleId, index, { ...v, lastChecked: who.on, checkedBy: who.by.trim() });
}

/** Bumps the last part of a version: a changed value means a new pack, so past runs stay traceable. */
function nextVersion(version: string): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some((p) => !Number.isInteger(p))) throw new ReviewError(`Version ${version} is not x.y.z`);
  return `${parts[0]}.${parts[1]}.${parts[2]! + 1}`;
}

/**
 * A person changes a value to what the source says. It needs a reason, keeps the old value in the
 * note, bumps the pack version and, if the pack was published, returns it to draft.
 */
export function correct(data: RulePackData, ruleId: string, from: string, value: number | null, reason: string, who: Who): RulePackData {
  checkWho(who);
  if (!reason.trim()) throw new ReviewError('A correction needs a reason (what the source says and where)');
  const { rule, index } = locate(data, ruleId, from);
  const v = rule.values[index]!;
  if (value === v.value) throw new ReviewError(`${ruleId} is already ${formatRuleValue(rule.unit, value)}; sign it off instead`);
  const was = `Corrected on ${who.on} by ${who.by.trim()} from ${formatRuleValue(rule.unit, v.value)}: ${reason.trim()}`;
  const next = withValue(data, ruleId, index, { ...v, value, note: v.note ? `${v.note} ${was}` : was, lastChecked: who.on, checkedBy: who.by.trim() }, nextVersion(data.version));
  return data.status === 'published' ? { ...next, status: 'draft', review: { ...next.review, publishedAt: null } } : next;
}

/** Publishes the pack once every value is signed off. */
export function publish(data: RulePackData, who: Who): RulePackData {
  checkWho(who);
  const s = reviewSummary(data);
  if (!s.canPublish) throw new ReviewError(`${s.total - s.checked} of ${s.total} values still need a person's check`);
  return { ...data, status: 'published', review: { ...data.review, checkedBy: who.by.trim(), publishedAt: who.on } };
}

/** A checklist a person can work through on a phone: each value, how the source writes it, and the link. */
export function reviewSheet(data: RulePackData): string {
  const s = reviewSummary(data);
  const lines = [
    `# Rule pack review: ${s.packId} (version ${s.version}, ${s.status})`,
    '',
    'Generated by `pnpm rules sheet`. Do not edit by hand.',
    '',
    `**${s.checked} of ${s.total} values checked.** ${s.canPublish ? 'Ready to publish.' : 'Not ready to publish.'}`,
    '',
    'For each value: open the source, find the figure, and sign it off with the value you read:',
    '',
    '```sh',
    'pnpm rules check <rule> <from> "<value you read>" --by "<your name>"',
    'pnpm rules correct <rule> <from> "<value>" --reason "<what the source says>" --by "<your name>"',
    '```',
    '',
  ];
  let group = '';
  for (const i of s.items) {
    const g = i.ruleId.split('.')[0]!;
    if (g !== group) lines.push(`## ${g.replace(/_/g, ' ')}`, '');
    group = g;
    const when = i.to ? `${i.from} to ${i.to}` : `from ${i.from}`;
    const tick = i.checked ? `[x] checked ${i.lastChecked} by ${i.checkedBy}` : '[ ] to check';
    lines.push(`- ${tick}: **${formatRuleValue(i.unit, i.value)}** ${i.description} (${when}${i.status === 'in_force' ? '' : `, ${i.status}`})`);
    lines.push(`  \`${i.ruleId}\` · [${i.source.title}](${i.source.url})${i.note ? ` · ${i.note}` : ''}`);
  }
  return lines.join('\n') + '\n';
}

/** Inline JSON with spaces inside braces, so a value entry reads as one line. */
function inline(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(inline).join(', ')}]`;
  if (x && typeof x === 'object') return `{ ${Object.entries(x).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }`;
  return JSON.stringify(x);
}

/** Writes a pack with one line per value entry, so a sign-off or correction is a one-line diff. */
export function formatPack(data: RulePackData): string {
  const { rules, ...head } = data;
  const top = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${k === 'review' ? JSON.stringify(v, null, 2).replace(/\n/g, '\n  ') : inline(v)}`);
  const rule = (r: Rule) =>
    [
      '    {',
      `      "id": ${JSON.stringify(r.id)},`,
      `      "description": ${JSON.stringify(r.description)},`,
      `      "unit": ${JSON.stringify(r.unit)},`,
      '      "values": [',
      r.values.map((v) => `        ${inline(v)}`).join(',\n'),
      '      ]',
      '    }',
    ].join('\n');
  return `{\n${top.join(',\n')},\n  "rules": [\n${rules.map(rule).join(',\n')}\n  ]\n}\n`;
}
