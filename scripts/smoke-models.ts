// Live check: every role runs once against the real API, chained on the salary sacrifice golden case.
// Proves the API accepts each role's output schema and the prompts produce valid output.
// Needs ANTHROPIC_API_KEY. Costs a few pence. Run: pnpm smoke:models
import { readFileSync } from 'node:fs';
import { roundPounds, runModule } from '@fork/calc';
import { AnthropicProvider, JsonLinesLogger, loadRegistry, runRole } from '@fork/models';

const ctx = { registry: loadRegistry(), providers: { anthropic: new AnthropicProvider() }, log: new JsonLinesLogger() };
const families = [
  { family: 'pension.salary_sacrifice_switch', description: 'Employee: switch pension contributions to salary sacrifice' },
  { family: 'pay.threshold_100k', description: 'Employee: pay near or over £100,000, pension to stay under it' },
  { family: 'benefits.ev_scheme', description: 'Employee: electric car salary sacrifice scheme or own car' },
];
const show = (label: string, v: unknown) => console.log(`\n== ${label}\n${JSON.stringify(v, null, 2)}`);

for (const question of ['where is my p60 lol', 'which index fund should i put my pension in', 'cant afford rent this month, can i take money out of my pension']) {
  show(`router: ${question}`, (await runRole(ctx, 'router', { question, audience: 'employee', families })).output);
}

const question = 'maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch';
const route = await runRole(ctx, 'router', { question, audience: 'employee', families });
show('router', route.output);

const template = JSON.parse(readFileSync(new URL('../packages/spec/examples/pension.ss_switch.json', import.meta.url), 'utf8'));
const spec = (await runRole(ctx, 'spec_writer', { question, audience: 'employee', family: 'pension.salary_sacrifice_switch', template, facts: template.facts })).output;
show('spec_writer', spec);

const calc = runModule('pension.ss_switch', 'uk-2026-27', {
  salary: 32000, contributionPct: 5, reliefMethod: 'relief_at_source', employerSharePct: 50, employerContributionPct: 3, hoursPerWeek: 37.5,
  mortgageIn12Months: false, parentalLeaveIn12Months: false,
});
const fmt = (v: number, unit: string) => (unit === 'GBP' ? `£${roundPounds(v).toLocaleString('en-GB')}` : unit === 'pct' ? `${Number(v.toFixed(2))}%` : `${v}`);
const numbers = Object.entries(calc.outputs).map(([key, o]) => ({ key, label: o.label, display: fmt(o.value, o.unit), estimate: o.estimate }));

const layout = (await runRole(ctx, 'screen_composer', {
  decisionType: spec.decisionType,
  defaultVisual: spec.visual,
  levers: spec.levers.map((l) => ({ id: l.id, label: l.label })),
  constraints: calc.constraints.map((c) => ({ id: c.id, outcome: c.outcome })),
  outputs: numbers.map(({ key, label }) => ({ key, label })),
})).output;
show('screen_composer', layout);

const copy = (await runRole(ctx, 'explainer', {
  audience: 'employee', question, verdict: calc.verdict, numbers,
  tippingPoint: calc.tippingPoint?.description ?? null, constraints: calc.constraints, assumptions: calc.assumptions, actionLabel: spec.action?.label ?? null,
})).output;
show('explainer', copy);

const verdict = (await runRole(ctx, 'verifier', { question, audience: 'employee', spec, numbers, copy, codeFindings: [] })).output;
show('verifier', verdict);
