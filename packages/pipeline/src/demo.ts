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
    'larkfield/ella': [f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
  },
});

export const DEMO_SUBJECT: Subject = { audience: 'employee', companyId: 'larkfield', employeeId: 'ella' };

const n = (numbers: ScreenNumber[], key: string) => numbers.find((x) => x.key === key)?.display ?? '';

function route(question: string) {
  const q = question.toLowerCase();
  const base = { family: null, confidence: 'high', distress: false };
  if (/rent|debt|can'?t afford|cant afford|bereave|struggling/.test(q)) return { ...base, route: 'human', distress: true, reason: 'Sounds like money worries.' };
  if (/fund|invest|shares|crypto/.test(q)) return { ...base, route: 'human', reason: 'Investment choice.' };
  if (/p60|p45|payslip|where is/.test(q)) return { ...base, route: 'lookup', reason: 'A document lookup.' };
  if (/sacrifice|salary exchange|switch/.test(q)) return { ...base, route: 'decision', family: 'pension.salary_sacrifice_switch', reason: 'Asks about salary sacrifice.' };
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

const HANDLERS: Record<RoleId, (input: any) => unknown> = {
  router: (i) => route(i.question),
  spec_writer: (i) => i.template,
  screen_composer: (i) => ({
    ...FAMILIES['pension.salary_sacrifice_switch']!.defaultLayout,
    highlightConstraint: i.constraints.find((c: { outcome: string }) => c.outcome !== 'pass')?.id ?? null,
  }),
  explainer: (i) => explainSsSwitch(i),
  verifier: () => ({ pass: true, issues: [] }),
  // Demo mode matches columns by header words alone (packages/setup), so the model adds nothing.
  column_matcher: () => ({ mapping: [], unsure: [] }),
  // Without a model, the owner types the scheme details in themselves.
  document_interpreter: () => ({ facts: [], instructionsFound: false }),
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
