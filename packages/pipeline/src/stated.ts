import type { CalcResult, Fact } from '@fork/spec';
import { formatGBP } from './format';

/**
 * Pay the person states in their question ("I'm on 32k", "earning £45,000"), or null. Only
 * phrases that clearly describe their pay count, so a "£1,000 bike" or a "£1,500 bonus" never does.
 */
export function statedPay(question: string): number | null {
  const m = question.match(
    /\b(?:i'?m on|i am on|on|earn(?:s|ing)?|salary(?: is| of)?|paid|making|make)\s+(?:about |around |roughly |nearly |just over |just under )?£?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k\b)?/i,
  );
  if (!m) return null;
  const value = Number(m[1]!.replace(/,/g, '')) * (m[2] ? 1000 : 1);
  return value >= 5000 && value <= 1_000_000 ? value : null;
}

/** How far a stated figure can be from payroll before Fork points it out (people round). */
const TOLERANCE = 0.05;

/**
 * When the question states pay that differs from the payroll figure, say so in code-written
 * words, quoting only the payroll figure. The models then never need to repeat the person's own
 * figure, which the number check would rightly block.
 */
export function withStatedPay(calc: CalcResult, question: string, facts: Fact[]): CalcResult {
  const salary = facts.find((f) => f.id === 'salary');
  const stated = statedPay(question);
  if (typeof salary?.value !== 'number' || stated === null) return calc;
  if (Math.abs(stated - salary.value) <= salary.value * TOLERANCE) return calc;
  const note = {
    text: `Your payroll shows pay of ${formatGBP(salary.value)} a year, which is different from the figure in your question. These figures use your payroll; if it’s wrong, ask your employer to check it`,
    source: salary.source,
    estimate: false,
    fact: 'salary',
  } satisfies CalcResult['assumptions'][number];
  const at = calc.assumptions.findIndex((a) => a.fact === 'salary');
  const assumptions = at < 0 ? [note, ...calc.assumptions] : calc.assumptions.map((a, i) => (i === at ? note : a));
  return { ...calc, assumptions };
}
