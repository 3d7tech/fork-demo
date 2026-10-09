import { loadPrompt, loadRegistry, MemoryLogger, ROLE_IDS, ROLES, type ModelProvider, type ProviderRequest, type ProviderResponse, type RoleId } from '@fork/models';
import type { Fact } from '@fork/spec';
import { InMemoryFactStore, type PipelineDeps } from '../src';

type Handler = (input: any, call: number) => unknown;

/**
 * A model provider scripted per role. Each handler gets the role's parsed input and returns
 * the JSON the "model" replies with. Unscripted roles fail loudly.
 */
export class ScriptedModels implements ModelProvider {
  readonly id = 'anthropic';
  readonly calls: Array<{ role: RoleId; input: any; model: string }> = [];
  private readonly bySystem = new Map(ROLE_IDS.map((r) => [loadPrompt(r, ROLES[r].promptVersion), r]));

  constructor(private readonly handlers: Partial<Record<RoleId, Handler>>) {}

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const role = this.bySystem.get(req.system)!;
    const input = JSON.parse(req.messages[0]!.content.split('<input>\n')[1]!.split('\n</input>')[0]!);
    const call = this.calls.filter((c) => c.role === role).length;
    this.calls.push({ role, input, model: req.ref.model });
    const h = this.handlers[role];
    if (!h) return { outcome: 'error', errorKind: `unscripted_${role}`, text: '', servedBy: req.ref.model, inputTokens: 0, outputTokens: 0 };
    return { outcome: 'ok', text: JSON.stringify(h(input, call)), servedBy: req.ref.model, inputTokens: 500, outputTokens: 100 };
  }

  rolesCalled() {
    return this.calls.map((c) => c.role);
  }
}

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });

export const ELLA = { audience: 'employee' as const, companyId: 'larkfield', employeeId: 'ella' };

export const facts = new InMemoryFactStore({
  company: {
    larkfield: [f('employer_share_pct', 50, 'company_setting'), f('employer_contribution_pct', 3, 'pension_scheme'), f('relief_method', 'relief_at_source', 'pension_scheme')],
  },
  employee: {
    'larkfield/ella': [f('tax_region', 'rest_of_uk', 'payroll_export'), f('student_loans', '', 'payroll_export'), f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/sam': [f('salary', 30000, 'payroll_export')],
  },
});

export const QUESTION = 'maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch';

/** Replies a well-behaved model might give for the salary sacrifice case. */
export const good = {
  router: () => ({ route: 'decision', family: 'pension.salary_sacrifice_switch', confidence: 'high', distress: false, reason: 'Asks whether to switch to salary sacrifice.' }),
  spec_writer: (i: any) => i.template,
  screen_composer: () => ({
    visual: 'before_after',
    leverOrder: ['contribution_pct'],
    outcomeTiles: ['take_home_gain', 'employer_share', 'pension_total'],
    constraintOrder: ['min_wage', 'mortgage_12m', 'parental_leave_12m'],
    highlightConstraint: null,
  }),
  explainer: () => ({
    title: 'Should you switch to salary sacrifice?',
    verdict: 'Switch. You take home £128 more a year, and Larkfield adds £120 to your pension.',
    why: 'Your pension gets the same £1,600 either way. On salary sacrifice you don’t pay 8% National Insurance on it.',
    tippingPoint: 'From 6 April 2029, sacrifice above £2,000 a year loses the National Insurance saving.',
    assumptions: [{ text: 'Your pay is £32,000 and you pay 5% into your pension', source: 'Payroll' }],
    actionLabel: 'Switch me to salary sacrifice',
  }),
  verifier: () => ({ pass: true, issues: [] }),
  column_matcher: () => ({ mapping: [], unsure: [] }),
  // Without a model, the owner types the scheme details in themselves.
  document_interpreter: () => ({ facts: [], instructionsFound: false }),
  lookup_matcher: () => ({ keys: [] }),
  lever_reader: () => ({ values: [] }),
};

export function deps(handlers: Partial<Record<RoleId, Handler>>, extra: Partial<PipelineDeps> = {}) {
  const models = new ScriptedModels(handlers);
  const log = new MemoryLogger();
  const d: PipelineDeps = { roles: { registry: loadRegistry(), providers: { anthropic: models }, log }, facts, ...extra };
  return { deps: d, models, log };
}
