import type { ScreenCopy } from '@fork/spec';
import { extractNumbers, type NumberToken, type ScreenNumber } from './format';

/**
 * Deterministic checks on the screen copy. Each finding is a confirmed problem: the screen is
 * never shown with one outstanding. The model verifier runs after these and sees them.
 */

const ESTIMATE_WORDS = /\b(about|around|roughly|approximately|estimated?|an estimate of)\s*$/i;

/** Wording that crosses from guidance into advice. Kept short and specific; the verifier catches the rest. */
const ADVICE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(you|they) (must|have to|need to) (switch|invest|buy|opt out|pay in|move)\b/i, 'tells the person what they must do'],
  [/\b(invest|put (it|your money)) in (shares|stocks|bonds|an? (index|tracker) fund|crypto)\b/i, 'recommends an investment'],
  [/\bguarantee(d|s)?\b/i, 'promises a guaranteed outcome'],
  [/\b(risk[- ]free|no risk)\b/i, 'claims there is no risk'],
];

function copyFields(copy: ScreenCopy): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    ['title', copy.title],
    ['verdict', copy.verdict],
    ['why', copy.why],
  ];
  if (copy.tippingPoint) fields.push(['tippingPoint', copy.tippingPoint]);
  copy.assumptions.forEach((a, i) => fields.push([`assumptions.${i}`, a.text]));
  if (copy.actionLabel) fields.push(['actionLabel', copy.actionLabel]);
  return fields;
}

interface Allowed {
  token: NumberToken;
  number: ScreenNumber;
}

function matches(t: NumberToken, a: NumberToken): boolean {
  if (t.value !== a.value) return false;
  // £ and % must match their kind; a bare number (a year, a day) may match any allowed number.
  return t.kind === 'plain' || t.kind === a.kind;
}

export function checkCopy(copy: ScreenCopy, numbers: ScreenNumber[]): string[] {
  const allowed: Allowed[] = numbers.flatMap((n) => extractNumbers(n.display).map((token) => ({ token, number: n })));
  const findings: string[] = [];

  for (const [field, text] of copyFields(copy)) {
    for (const t of extractNumbers(text)) {
      const hits = allowed.filter((a) => matches(t, a.token));
      if (!hits.length) {
        findings.push(`number: ${field} quotes "${t.raw}", which is not a number Fork calculated or was given`);
        continue;
      }
      if (hits.every((h) => h.number.estimate) && !ESTIMATE_WORDS.test(text.slice(0, t.index))) {
        findings.push(`number: ${field} quotes "${t.raw}" as certain, but it is an estimate; say "about"`);
      }
    }
    for (const [re, why] of ADVICE_PATTERNS) {
      const m = text.match(re);
      if (m) findings.push(`advice: ${field} ${why} ("${m[0]}")`);
    }
  }
  return findings;
}
