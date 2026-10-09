// Deterministic safety nets that run before any model (step 9, red-team). The router is asked
// the same questions, but these replies must never depend on a model getting it right.
//
// Patterns are deliberately narrow: they catch plain statements of crisis or of a request for an
// investment pick. Anything subtler is still the router's job, measured by its evaluation suite.

const DISTRESS = [
  /\b(suicid\w*|kill (myself|me)|end (it all|my life)|self[- ]?harm|don['’]?t want to (live|be here))\b/i,
  /\bcan['’]?t (afford|pay) (the |my )?(rent|food|bills?|mortgage|to eat)\b/i,
  /\b(bailiffs?|eviction|evicted|food ?bank|payday loan|loan sharks?|debt collectors?)\b/i,
  /\b(drowning in|crippling|overwhelming) debt\b/i,
];

const INVESTMENT = [
  /\b(which|best|good|top) (index |tracker |pension |investment )?funds?\b/i,
  /\b(should i|best|good) (buy|invest in|put (it|my pension|money) in(to)?) .*\b(shares|stocks?|crypto|bitcoin|funds?|etfs?|gold)\b/i,
  /\b(bitcoin|crypto(currency)?|ethereum)\b/i,
  /\b(stock|share) tips?\b/i,
];

export type GuardResult = 'distress' | 'investment' | null;

export function guard(question: string): GuardResult {
  if (DISTRESS.some((re) => re.test(question))) return 'distress';
  if (INVESTMENT.some((re) => re.test(question))) return 'investment';
  return null;
}
