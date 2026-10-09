import { loadPrompt, ROLE_IDS, ROLES, type ModelProvider, type ProviderRequest, type ProviderResponse, type RoleId } from '@fork/models';
import type { Fact } from '@fork/spec';
import { FAMILIES } from './families';
import { InMemoryFactStore, type Subject } from './facts';
import type { ScreenNumber } from './format';

/**
 * Demo mode: runs the real pipeline, engine and code checks with a stand-in for the models,
 * so the app works without an API key. Wording is templated and the screen says so.
 * Never used when a real provider is configured.
 */

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });

/** Larkfield, the fictional company from the demo. */
export const DEMO_FACTS = new InMemoryFactStore({
  company: {
    larkfield: [f('employer_share_pct', 50, 'company_setting'), f('employer_contribution_pct', 3, 'pension_scheme'), f('relief_method', 'relief_at_source', 'pension_scheme')],
  },
  employee: {
    'larkfield/ella': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
  },
});

export const DEMO_SUBJECT: Subject = { audience: 'employee', companyId: 'larkfield', employeeId: 'ella' };

const person = (salary: number, more: Fact[] = []) => [
  f('tax_region', 'rest_of_uk', 'payroll_export'),
  f('student_loans', '', 'payroll_export'),
  f('salary', salary, 'payroll_export'),
  f('contribution_pct', 5, 'pension_scheme'),
  f('hours_per_week', 37.5, 'payroll_export'),
  ...more,
];
// Larkfield's 34 salaries, as in the calculation tests' fixture.
const LARKFIELD_PAY = [
  25200, 26000, 28500, 29000, 30000, 31000, 32000, 32000, 33500, 34000, 35000, 35000, 36000, 37500, 38000, 39000, 40000, 41000, 42000, 42000, 44000, 45000, 46000,
  48000, 50000, 52000, 55000, 58000, 60000, 65000, 72000, 80000, 95000, 108000,
].map((salary) => ({ salary, hoursPerWeek: 37.5 }));

/** Enough of Larkfield for every decision, owner and employee: for the visuals gallery and its tests. */
export const GALLERY_FACTS = new InMemoryFactStore({
  company: {
    larkfield: [
      f('employer_share_pct', 50, 'company_setting'),
      f('employer_contribution_pct', 3, 'pension_scheme'),
      f('relief_method', 'relief_at_source', 'pension_scheme'),
      f('pension_basis', 'full_salary', 'pension_scheme'),
      f('headcount', 34, 'payroll_export'),
      f('median_salary', 30000, 'payroll_export'),
      f('fee_per_employee', 4, 'company_setting'),
      f('employment_allowance', false, 'company_setting'),
      f('contribution_pct', 5, 'pension_scheme'),
      f('cycle_to_work_limit', 2500, 'policy_document'),
    ],
  },
  employee: {
    'larkfield/ella': person(32000),
    'larkfield/priya': person(108000),
    'larkfield/dan': person(70000, [f('child_benefit_children', 2, 'user_answer'), f('higher_earner', true, 'user_answer')]),
  },
  payroll: { larkfield: LARKFIELD_PAY },
});

const who = (id: string): Subject => (id === 'owner' ? { audience: 'owner', companyId: 'larkfield' } : { audience: 'employee', companyId: 'larkfield', employeeId: id });

/** One question per decision, who asks it, and the visual it gets (ADR 0012). */
export const GALLERY: Array<{ question: string; subject: Subject; visual: string }> = [
  { question: 'is salary sacrifice worth it?', subject: who('ella'), visual: 'payslip' },
  { question: 'should I pay more into my pension?', subject: who('ella'), visual: 'jar' },
  { question: 'do I have to pay back child benefit?', subject: who('dan'), visual: 'meter' },
  { question: 'what about the £100,000 allowance?', subject: who('priya'), visual: 'ladder' },
  { question: 'is the electric car scheme worth it?', subject: who('ella'), visual: 'towers' },
  { question: 'should I get a bike through cycle to work?', subject: who('ella'), visual: 'tag' },
  { question: 'should we introduce salary sacrifice for our staff?', subject: who('owner'), visual: 'flow' },
  { question: 'what does hiring someone on £40,000 cost?', subject: who('owner'), visual: 'receipt' },
  { question: 'should we pay the bonus as cash or pension?', subject: who('owner'), visual: 'coins' },
];

const n = (numbers: ScreenNumber[], key: string) => numbers.find((x) => x.key === key)?.display ?? '';

function route(question: string) {
  const q = question.toLowerCase();
  const base = { family: null, confidence: 'high', distress: false };
  if (/rent|debt|can'?t afford|cant afford|bereave|struggling/.test(q)) return { ...base, route: 'human', distress: true, reason: 'Sounds like money worries.' };
  if (/fund|invest|shares|crypto/.test(q)) return { ...base, route: 'human', reason: 'Investment choice.' };
  if (/p60|p45|payslip|where is/.test(q)) return { ...base, route: 'lookup', reason: 'A document lookup.' };
  if (/introduce|bring in|offer|for (our|the) (staff|team)/.test(q) && /sacrifice/.test(q)) return { ...base, route: 'decision', family: 'employer.introduce_salary_sacrifice', reason: 'Company-wide salary sacrifice.' };
  if (/sacrifice|salary exchange|switch/.test(q)) return { ...base, route: 'decision', family: 'pension.salary_sacrifice_switch', reason: 'Asks about salary sacrifice.' };
  if (/hire|hiring|recruit/.test(q)) return { ...base, route: 'decision', family: 'employer.true_cost_of_hire', reason: 'Cost of a hire.' };
  if (/bonus/.test(q)) return { ...base, route: 'decision', family: 'employer.bonus_cash_or_pension', reason: 'Bonus.' };
  if (/child ?benefit|hicbc|high income child/.test(q)) return { ...base, route: 'decision', family: 'pay.child_benefit_charge', reason: 'The Child Benefit charge.' };
  if (/100k|100,000|childcare|allowance/.test(q)) return { ...base, route: 'decision', family: 'pay.threshold_100k', reason: 'The £100,000 threshold.' };
  if (/\bbike|cycle ?(to|2) ?work|cyclescheme/.test(q)) return { ...base, route: 'decision', family: 'benefits.cycle_to_work', reason: 'Cycle to work.' };
  if (/electric|\bev\b|car/.test(q)) return { ...base, route: 'decision', family: 'benefits.ev_scheme_or_own_car', reason: 'Electric car scheme.' };
  if (/how much|contribut|pay more|put more/.test(q)) return { ...base, route: 'decision', family: 'pension.how_much_to_contribute', reason: 'Contribution level.' };
  if (/re-?enrol|pay ?day|days'? holiday|holiday allowance|sick pay|maternity pay|paternity pay/.test(q)) return { ...base, route: 'lookup', reason: 'A lookup.' };
  return { ...base, route: 'not_supported', reason: 'Not a demo decision.' };
}

function explainSsSwitch(input: { verdict: string; numbers: ScreenNumber[]; constraints: Array<{ id: string; outcome: string }>; actionLabel: string | null }) {
  const N = (k: string) => n(input.numbers, k);
  const caution = input.constraints.filter((c) => c.outcome === 'caution').map((c) => c.id);
  const checks: string[] = [];
  if (caution.includes('mortgage_12m')) checks.push('Some mortgage lenders look at your pay after sacrifice, so ask your lender or broker which figure they use before you switch.');
  if (caution.includes('parental_leave_12m')) checks.push(`Statutory parental pay is based on your earnings, so it would be about ${N('parental_pay_reduction')} lower over the first six weeks.`);
  const verdict =
    input.verdict === 'not_eligible'
      ? 'Salary sacrifice isn’t available to you, because it would take your pay below the minimum wage.'
      : checks.length
        ? 'Probably switch, but check one thing first.'
        : `Switch. You take home ${N('take_home_gain')} more a year, and Larkfield adds ${N('employer_share')} to your pension.`;
  return {
    title: 'Should you switch to salary sacrifice?',
    verdict,
    why: checks.length
      ? `${checks.join(' ')} Otherwise you gain ${N('total_gain')} a year.`
      : `Your pension gets the same ${N('contribution')} either way. On salary sacrifice you don’t pay National Insurance on it.`,
    tippingPoint: `From ${N('tipping_point_from')}, sacrifice above ${N('tipping_point')} a year loses the National Insurance saving.`,
    assumptions: [
      { text: `Your pay is ${N('fact.salary')} and you pay ${N('fact.contribution_pct')} into your pension`, source: 'Payroll and pension records' },
      { text: 'Your pension adds basic-rate tax relief to what you pay in today', source: 'Pension scheme' },
      { text: `Larkfield shares ${N('fact.employer_share_pct')} of its National Insurance saving`, source: 'Company setting' },
    ],
    actionLabel: input.verdict === 'not_eligible' ? null : input.actionLabel,
  };
}

/** Which family a role's input belongs to, from the outputs it carries. */
function familyOf(keys: string[]) {
  return Object.values(FAMILIES).find((f) => f.defaultLayout.outcomeTiles.every((k) => keys.includes(k)));
}

/** Templated wording for families without their own demo copy: the key numbers, plainly. */
function explainGeneric(input: { numbers: ScreenNumber[]; actionLabel: string | null }) {
  const family = familyOf(input.numbers.map((x) => x.key));
  const tiles = (family?.defaultLayout.outcomeTiles ?? []).map((k) => input.numbers.find((x) => x.key === k)!).filter(Boolean);
  const say = (x: ScreenNumber) => `${x.estimate ? 'about ' : ''}${x.display}`;
  return {
    title: family?.title ?? 'Your numbers',
    verdict: tiles[0] ? `${tiles[0].label}: ${say(tiles[0])}.` : 'Here are your numbers.',
    why: tiles.slice(1).map((x) => `${x.label}: ${say(x)}.`).join(' ') || 'Move the sliders to see how the numbers change.',
    tippingPoint: null,
    assumptions: [],
    actionLabel: input.actionLabel,
  };
}

const HANDLERS: Record<RoleId, (input: any) => unknown> = {
  router: (i) => route(i.question),
  spec_writer: (i) => i.template,
  screen_composer: (i) => ({
    ...(familyOf(i.outputs.map((o: { key: string }) => o.key)) ?? FAMILIES['pension.salary_sacrifice_switch']!).defaultLayout,
    highlightConstraint: i.constraints.find((c: { outcome: string }) => c.outcome !== 'pass')?.id ?? null,
  }),
  explainer: (i) => (i.numbers.some((x: ScreenNumber) => x.key === 'take_home_gain') ? explainSsSwitch(i) : explainGeneric(i)),
  verifier: () => ({ pass: true, issues: [] }),
  // Demo mode matches columns by header words alone (packages/setup), so the model adds nothing.
  column_matcher: () => ({ mapping: [], unsure: [] }),
  // Without a model, the owner types the scheme details in themselves.
  document_interpreter: () => ({ facts: [], instructionsFound: false }),
  lookup_matcher: () => ({ keys: [] }),
  lever_reader: () => ({ values: [] }),
};

export class DemoModels implements ModelProvider {
  readonly id = 'anthropic';
  private readonly bySystem = new Map(ROLE_IDS.map((r) => [loadPrompt(r, ROLES[r].promptVersion), r]));

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const role = this.bySystem.get(req.system)!;
    const input = JSON.parse(req.messages[0]!.content.split('<input>\n')[1]!.split('\n</input>')[0]!);
    return { outcome: 'ok', text: JSON.stringify(HANDLERS[role](input)), servedBy: 'demo', inputTokens: 0, outputTokens: 0 };
  }
}
