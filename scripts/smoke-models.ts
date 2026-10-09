// Live check of the whole pipeline against the real API, on the demo's Larkfield data.
// Proves every role's schema is accepted, the prompts produce valid output, and shows timing.
// Needs FORK_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY). Costs a few pence. Run: pnpm smoke:models
import { AnthropicProvider, JsonLinesLogger, loadRegistry } from '@fork/models';
import { askFork, InMemoryFactStore, type Subject } from '@fork/pipeline';
import type { Fact } from '@fork/spec';

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });
const SALARIES = [25200, 26000, 28500, 29000, 30000, 31000, 32000, 32000, 33500, 34000, 35000, 35000, 36000, 37500, 38000, 39000, 40000, 41000, 42000, 42000, 44000, 45000, 46000, 48000, 50000, 52000, 55000, 58000, 60000, 65000, 72000, 80000, 95000, 108000];
const facts = new InMemoryFactStore({
  company: {
    larkfield: [
      f('employer_share_pct', 50, 'company_setting'),
      f('employer_contribution_pct', 3, 'pension_scheme'),
      f('relief_method', 'relief_at_source', 'pension_scheme'),
      f('pension_basis', 'full_salary', 'pension_scheme'),
      f('headcount', 34, 'payroll_export'),
      f('median_salary', 40500, 'payroll_export'),
      f('fee_per_employee', 4, 'company_setting'),
      f('employment_allowance', false, 'company_setting'),
      f('contribution_pct', 5, 'pension_scheme'),
    ],
  },
  employee: {
    'larkfield/ella': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/priya': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 108000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')],
  },
  payroll: { larkfield: SALARIES.map((salary) => ({ salary, hoursPerWeek: 37.5 })) },
});
const ella: Subject = { audience: 'employee', companyId: 'larkfield', employeeId: 'ella' };
const priya: Subject = { audience: 'employee', companyId: 'larkfield', employeeId: 'priya' };
const maya: Subject = { audience: 'owner', companyId: 'larkfield' };
const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new AnthropicProvider() }, log: new JsonLinesLogger((l) => process.stderr.write(l + '\n')) }, facts };

const only = process.argv[2];
const QUESTIONS: Array<[string, Subject]> = [
  ['maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch', ella],
  ['where is my p60 lol', ella],
  ['which index fund should i put my pension in', ella],
  ['cant afford rent this month, can i take money out of my pension', ella],
  ['should i pay more into my pension? thinking 8%', ella],
  ['im on 108k with two kids in nursery, should i put more in my pension', priya],
  ['should i get an electric car through the work scheme or keep my petrol car', ella],
  ['should we bring in salary sacrifice for everyone?', maya],
  ['what does it actually cost us to hire someone on 40k', maya],
  ['we want to give everyone a £1,500 christmas bonus, cash or pension?', maya],
];
for (const [question, subject] of QUESTIONS.filter(([q]) => !only || q.includes(only))) {
  const started = performance.now();
  const answer = await askFork(deps, { question, subject, onStep: (s) => console.log(`  … ${s.label}${s.detail ? `: ${s.detail}` : ''}`) });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n“${question}” (${seconds}s)`);
  if (answer.kind === 'decision') {
    console.log(JSON.stringify({ copy: answer.copy, checks: answer.checks, specFrom: answer.provenance.specFrom, levers: answer.spec.levers.map((l) => [l.id, l.default]) }, null, 2));
  } else {
    console.log(`${answer.reason}: ${answer.title}. ${answer.body}`);
  }
}
