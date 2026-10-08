import { z } from 'zod';

export const SPEC_VERSION = '1.0';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (yyyy-mm-dd)');
const slug = z.string().regex(/^[a-z0-9_]+$/, 'Expected snake_case');
const dotted = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)+$/, 'Expected a dotted id such as pension.ss_switch');

// ---------- Facts ----------

export const FactSource = z.enum([
  'payroll_export',
  'pension_scheme',
  'policy_document',
  'company_setting',
  'rule_pack',
  'user_answer',
  'payslip',
  'estimate',
]);
export type FactSource = z.infer<typeof FactSource>;

export const Fact = z.object({
  id: slug,
  value: z.union([z.number(), z.string(), z.boolean()]),
  source: FactSource,
  asOf: isoDate.optional(),
  /** Where in a document the fact came from, such as "Scheme booklet p.4". */
  reference: z.string().optional(),
  confidence: z.enum(['confirmed', 'extracted', 'estimate']).default('confirmed'),
});
export type Fact = z.infer<typeof Fact>;

// ---------- Decision spec ----------

export const DecisionType = z.enum(['comparison', 'threshold', 'life_event', 'allocation', 'employer_policy', 'lookup']);
export const Audience = z.enum(['employee', 'owner']);
export const Visual = z.enum(['before_after', 'cost_bars', 'threshold_ladder', 'change_checklist', 'saving_flow', 'split_bar', 'none']);

export const Option = z.object({ id: slug, label: z.string().min(1) });

export const Constraint = z.discriminatedUnion('kind', [
  z.object({ id: slug, kind: z.literal('hard'), source: z.enum(['rules', 'facts']), autoCheck: z.literal(true) }),
  z.object({
    id: slug,
    kind: z.literal('ask'),
    question: z.string().min(1),
    answers: z.array(z.object({ id: slug, label: z.string() })).min(2).default([
      { id: 'no', label: 'No' },
      { id: 'yes', label: 'Yes' },
    ]),
    default: slug.optional(),
    effect: z.enum(['caution', 'excludes', 'changes_numbers']),
  }),
]);

/** A lever default is a literal or a reference to a fact ("fact:contribution_pct"). */
const LeverDefault = z.union([z.number(), z.string().regex(/^fact:[a-z0-9_]+$/)]);

export const Lever = z
  .object({
    id: slug,
    label: z.string().min(1),
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    default: LeverDefault,
    unit: z.enum(['GBP', 'pct', 'count', 'miles']).optional(),
  })
  .refine((l) => l.min < l.max, { message: 'Lever min must be below max' });

/** The spec's shape without cross-checks: what the spec writer returns before code fills in the facts. */
export const DecisionSpecDraft = z.object({
  specVersion: z.literal(SPEC_VERSION),
  decisionType: DecisionType,
  family: dotted,
  audience: Audience,
  question: z.string().min(1),
  options: z.array(Option),
  constraints: z.array(Constraint).max(8).default([]),
  levers: z.array(Lever).max(3).default([]),
  facts: z.array(Fact).default([]),
  calculation: z.object({ module: dotted, rulePack: z.string().min(1) }).optional(),
  tippingPoint: z
    .object({ measure: slug, at: z.union([z.number(), z.string().regex(/^(rule|fact):[a-z0-9_.]+$/)]), from: isoDate.optional() })
    .optional(),
  visual: Visual,
  action: z
    .object({
      type: z.enum(['payroll.request', 'plan.send', 'save', 'link', 'none']),
      to: z.enum(['accountant', 'owner', 'payroll', 'self']).optional(),
      label: z.string().min(1),
    })
    .optional(),
  watch: z.array(z.string()).default([]),
});
export type DecisionSpecDraft = z.infer<typeof DecisionSpecDraft>;

export const DecisionSpec = DecisionSpecDraft.superRefine((s, ctx) => {
  const factIds = new Set(s.facts.map((f) => f.id));
  s.levers.forEach((l, i) => {
    if (typeof l.default === 'string' && !factIds.has(l.default.slice(5))) {
      ctx.addIssue({ code: 'custom', path: ['levers', i, 'default'], message: `Lever default refers to missing fact ${l.default}` });
    }
  });
  if (s.decisionType === 'lookup') {
    if (s.calculation) ctx.addIssue({ code: 'custom', path: ['calculation'], message: 'A lookup has no calculation' });
  } else {
    if (!s.calculation) ctx.addIssue({ code: 'custom', path: ['calculation'], message: 'A decision needs a calculation module' });
    if (s.options.length < 1) ctx.addIssue({ code: 'custom', path: ['options'], message: 'A decision needs at least one option' });
  }
  const ids = new Set<string>();
  for (const f of s.facts) {
    if (ids.has(f.id)) ctx.addIssue({ code: 'custom', path: ['facts'], message: `Duplicate fact ${f.id}` });
    ids.add(f.id);
  }
});
export type DecisionSpec = z.infer<typeof DecisionSpec>;

// ---------- Calculation result ----------

export const QuantityUnit = z.enum(['GBP', 'pct', 'rate', 'count', 'miles', 'GBP_per_hour']);

/** One number the engine produced. The explainer may only quote numbers that appear here. */
export const Quantity = z.object({
  value: z.number(),
  unit: QuantityUnit,
  label: z.string(),
  estimate: z.boolean().default(false),
});
export type Quantity = z.infer<typeof Quantity>;

export const RuleUse = z.object({
  id: z.string(),
  description: z.string(),
  unit: z.enum(['GBP', 'rate', 'GBP_per_hour', 'count']),
  on: isoDate,
  value: z.number().nullable(),
  status: z.enum(['in_force', 'legislated', 'announced', 'proposed']),
  source: z.object({ title: z.string(), url: z.string().url() }),
});

export const CalcResult = z.object({
  module: dotted,
  rulePack: z.object({ id: z.string(), version: z.string(), status: z.enum(['draft', 'published']) }),
  /** Short machine code for the verdict, such as "switch" or "switch_with_caution". */
  verdict: slug,
  outputs: z.record(z.string(), Quantity),
  tippingPoint: z
    .object({ description: z.string(), measure: z.string(), at: z.number(), unit: QuantityUnit, from: isoDate.optional() })
    .optional(),
  /** Lever ranges over which the verdict stays the same. */
  leverRanges: z.array(z.object({ lever: slug, verdict: slug, from: z.number(), to: z.number() })).default([]),
  constraints: z.array(z.object({ id: slug, outcome: z.enum(['pass', 'caution', 'excluded']), detail: z.string().optional() })).default([]),
  rulesUsed: z.array(RuleUse),
  assumptions: z.array(z.object({ text: z.string(), source: FactSource.or(z.literal('rules')), estimate: z.boolean().default(false) })).default([]),
});
export type CalcResult = z.infer<typeof CalcResult>;

// ---------- Screen layout and copy (model outputs, validated before use) ----------

export const ScreenLayout = z.object({
  visual: Visual,
  /** Lever ids from the spec, most useful first. */
  leverOrder: z.array(slug).max(3),
  /** Exactly three output keys from the CalcResult for the outcome tiles. */
  outcomeTiles: z.array(z.string()).length(3),
  /** Constraint ids to show in the panel, in order; at most two questions. */
  constraintOrder: z.array(slug).max(4),
  /** Constraint id to highlight because its answer changed the verdict. */
  highlightConstraint: slug.nullable(),
});
export type ScreenLayout = z.infer<typeof ScreenLayout>;

export const ScreenCopy = z.object({
  /** The screen's title, phrased as the decision ("Should you switch to salary sacrifice?"). */
  title: z.string().min(1).max(80),
  /** One sentence with the number that matters. */
  verdict: z.string().min(1).max(220),
  /** One sentence of why. */
  why: z.string().min(1).max(400),
  tippingPoint: z.string().max(260).nullable(),
  /** Plain-English assumptions, each tied to a source. */
  assumptions: z.array(z.object({ text: z.string().min(1), source: z.string().min(1) })).max(8),
  actionLabel: z.string().max(60).nullable(),
});
export type ScreenCopy = z.infer<typeof ScreenCopy>;

export function toJsonSchemas() {
  return {
    DecisionSpec: z.toJSONSchema(DecisionSpec, { io: 'input', unrepresentable: 'any' }),
    CalcResult: z.toJSONSchema(CalcResult, { io: 'input', unrepresentable: 'any' }),
    Fact: z.toJSONSchema(Fact, { io: 'input' }),
  };
}
