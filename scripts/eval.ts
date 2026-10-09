// Evaluation suites per model role, against the live models in the registry.
//   pnpm eval                      every suite
//   pnpm eval router documents     some suites
//   FORK_MODELS_CONFIG=other.yaml pnpm eval   the same suites with different models (no code change)
// Writes a report to .data/evals/ and exits non-zero if any suite is below its threshold.
import { mkdirSync, writeFileSync } from 'node:fs';
import { AnthropicProvider, MemoryLogger, loadRegistry } from '@fork/models';
import type { DecisionScreen } from '@fork/pipeline';
import { costAndSpeed, documentSuite, leverSuite, lookupSuite, routerSuite, screenSuite, specSuite, verifierSuite, type EvalEnv, type SuiteResult } from '@fork/evals';

const want = new Set(process.argv.slice(2));
const on = (s: string) => !want.size || want.has(s);
const env: EvalEnv = { registry: loadRegistry(), provider: new AnthropicProvider(), log: new MemoryLogger(), concurrency: 6 };

const results: SuiteResult[] = [];
const started = Date.now();
if (on('router')) results.push(await routerSuite(env));
if (on('levers')) results.push(await leverSuite(env));
if (on('lookups')) results.push(await lookupSuite(env));
if (on('documents')) results.push(await documentSuite(env));
if (on('specs')) results.push(await specSuite(env));
const screens: DecisionScreen[] = [];
if (on('screens') || on('verifier')) results.push(await screenSuite(env, screens));
if (on('verifier')) results.push(await verifierSuite(env, screens));

const pct = (v: number, name: string) => (/seconds|usd/.test(name) ? v.toFixed(name.includes('usd') ? 3 : 1) : `${(v * 100).toFixed(0)}%`);
for (const r of results) {
  console.log(`\n${r.passed ? 'PASS' : 'FAIL'}  ${r.suite}`);
  for (const m of r.metrics) console.log(`      ${m.name.padEnd(22)} ${pct(m.value, m.name).padStart(7)}   (${m.kind === 'min' ? 'at least' : 'at most'} ${pct(m.threshold, m.name)})`);
  for (const f of r.failures.slice(0, 12)) console.log(`      - ${f}`);
  if (r.failures.length > 12) console.log(`      … and ${r.failures.length - 12} more`);
}
const perRole = costAndSpeed(env.log);
console.log('\nCost and speed by role');
for (const r of perRole) console.log(`      ${r.role.padEnd(22)} ${String(r.calls).padStart(4)} calls  $${r.costUsd.toFixed(3).padStart(6)}  p50 ${(r.p50ms / 1000).toFixed(1)}s  p95 ${(r.p95ms / 1000).toFixed(1)}s`);
console.log(`      total $${perRole.reduce((s, r) => s + r.costUsd, 0).toFixed(2)} in ${((Date.now() - started) / 1000).toFixed(0)}s`);

mkdirSync('.data/evals', { recursive: true });
const file = `.data/evals/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ config: process.env.FORK_MODELS_CONFIG ?? 'config/models.yaml', results, perRole }, null, 2));
console.log(`\nReport: ${file}`);
process.exit(results.every((r) => r.passed) ? 0 : 1);
