// Live check of the whole pipeline against the real API, on the demo's Larkfield data.
// Proves every role's schema is accepted, the prompts produce valid output, and shows timing.
// Needs FORK_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY). Costs a few pence. Run: pnpm smoke:models
import { AnthropicProvider, JsonLinesLogger, loadRegistry } from '@fork/models';
import { askFork, InMemoryFactStore, type Subject } from '@fork/pipeline';
import type { Fact } from '@fork/spec';

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });
const facts = new InMemoryFactStore({
  company: { larkfield: [f('employer_share_pct', 50, 'company_setting'), f('employer_contribution_pct', 3, 'pension_scheme'), f('relief_method', 'relief_at_source', 'pension_scheme')] },
  employee: { 'larkfield/ella': [f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')] },
});
const ella: Subject = { audience: 'employee', companyId: 'larkfield', employeeId: 'ella' };
const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new AnthropicProvider() }, log: new JsonLinesLogger((l) => process.stderr.write(l + '\n')) }, facts };

for (const question of [
  'maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch',
  'where is my p60 lol',
  'which index fund should i put my pension in',
  'cant afford rent this month, can i take money out of my pension',
]) {
  const started = performance.now();
  const answer = await askFork(deps, { question, subject: ella, onStep: (s) => console.log(`  … ${s.label}${s.detail ? `: ${s.detail}` : ''}`) });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n“${question}” (${seconds}s)`);
  if (answer.kind === 'decision') {
    console.log(JSON.stringify({ copy: answer.copy, layout: answer.layout, checks: answer.checks, roles: answer.provenance.roles }, null, 2));
  } else {
    console.log(`${answer.reason}: ${answer.title}. ${answer.body}`);
  }
}
