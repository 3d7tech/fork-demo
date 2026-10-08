import { readFileSync } from 'node:fs';
import { CalcResult, DecisionSpec, DecisionSpecDraft, Fact, ScreenCopy, ScreenLayout } from '@fork/spec';
import { z } from 'zod';
import { repoPath } from './paths';
import type { RoleId } from './registry';

/**
 * Role inputs are strict objects: a field a role was not designed to receive is rejected,
 * so personal data cannot leak into a model call by accident. The router, for example, has
 * no field for pay.
 */

const Audience = z.enum(['employee', 'owner']);

// ---------- Router ----------

export const RouterInput = z.strictObject({
  question: z.string().min(1).max(2000),
  audience: Audience,
  families: z.array(z.strictObject({ family: z.string(), description: z.string() })).min(1),
});
export const RouterOutput = z.strictObject({
  route: z.enum(['decision', 'lookup', 'not_supported', 'human']),
  family: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  /** The person may be in distress: answer supportively and route to help, never a decision screen. */
  distress: z.boolean(),
  reason: z.string().max(300),
});

// ---------- Spec writer ----------

export const SpecWriterInput = z.strictObject({
  question: z.string().min(1).max(2000),
  audience: Audience,
  family: z.string(),
  /** The family's spec template: the shape and defaults the spec must follow. */
  template: z.record(z.string(), z.unknown()),
  /** Facts the data gatherer found, each with its source. Missing facts become questions. */
  facts: z.array(Fact),
  /** Problems with a previous attempt, from Fork's checks. Fix every one. */
  feedback: z.array(z.string()).optional(),
});
/** Facts are filled in by code afterwards, so cross-checks that need them run then, on the full DecisionSpec. */
export const SpecWriterOutput = DecisionSpecDraft;

// ---------- Screen composer ----------

export const ScreenComposerInput = z.strictObject({
  decisionType: z.string(),
  defaultVisual: z.string(),
  levers: z.array(z.strictObject({ id: z.string(), label: z.string() })),
  constraints: z.array(z.strictObject({ id: z.string(), outcome: z.string() })),
  outputs: z.array(z.strictObject({ key: z.string(), label: z.string() })),
  /** Problems with a previous attempt, from Fork's checks. Fix every one. */
  feedback: z.array(z.string()).optional(),
});
export const ScreenComposerOutput = ScreenLayout;

// ---------- Explainer ----------

export const ExplainerInput = z.strictObject({
  audience: Audience,
  question: z.string().min(1).max(2000),
  verdict: z.string(),
  /** Numbers already formatted for display. The only numbers the copy may contain. */
  numbers: z.array(z.strictObject({ key: z.string(), label: z.string(), display: z.string(), estimate: z.boolean() })),
  tippingPoint: z.string().nullable(),
  constraints: CalcResult.shape.constraints,
  assumptions: CalcResult.shape.assumptions,
  actionLabel: z.string().nullable(),
  /** Problems with a previous attempt, from Fork's checks. Fix every one. */
  feedback: z.array(z.string()).optional(),
});
export const ExplainerOutput = ScreenCopy;

// ---------- Verifier ----------

export const VerifierInput = z.strictObject({
  question: z.string().min(1).max(2000),
  audience: Audience,
  spec: DecisionSpec,
  numbers: ExplainerInput.shape.numbers,
  copy: ScreenCopy,
  /** Problems the deterministic checks already found, so the model can weigh them. */
  codeFindings: z.array(z.string()),
});
export const VerifierOutput = z.strictObject({
  pass: z.boolean(),
  issues: z.array(
    z.strictObject({
      kind: z.enum(['number', 'source', 'advice', 'constraint', 'not_worth_showing', 'tone']),
      detail: z.string().max(300),
      sendBackTo: z.enum(['spec_writer', 'screen_composer', 'explainer', 'human']),
    }),
  ),
});

// ---------- Column matcher (document interpreter, payroll exports) ----------

/** Headers and value shapes only: no names, pay or any other cell value reaches the model. */
export const ColumnMatcherInput = z.strictObject({
  columns: z
    .array(z.strictObject({ header: z.string().max(200), shape: z.string(), filled: z.number().min(0).max(1) }))
    .min(1)
    .max(200),
  fields: z.array(z.strictObject({ id: z.string(), label: z.string(), description: z.string(), required: z.boolean() })).min(1),
});
export const ColumnMatcherOutput = z.strictObject({
  mapping: z.array(z.strictObject({ field: z.string(), header: z.string().nullable() })),
  /** Field ids the owner should look at closely. */
  unsure: z.array(z.string()),
});

// ---------- Role table ----------

export interface RoleDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  id: RoleId;
  promptVersion: string;
  input: I;
  output: O;
}

const def = <I extends z.ZodType, O extends z.ZodType>(id: RoleId, promptVersion: string, input: I, output: O): RoleDef<I, O> => ({
  id,
  promptVersion,
  input,
  output,
});

export const ROLES = {
  router: def('router', 'v1', RouterInput, RouterOutput),
  spec_writer: def('spec_writer', 'v1', SpecWriterInput, SpecWriterOutput),
  screen_composer: def('screen_composer', 'v1', ScreenComposerInput, ScreenComposerOutput),
  explainer: def('explainer', 'v2', ExplainerInput, ExplainerOutput),
  verifier: def('verifier', 'v2', VerifierInput, VerifierOutput),
  column_matcher: def('column_matcher', 'v1', ColumnMatcherInput, ColumnMatcherOutput),
} satisfies Record<RoleId, RoleDef>;

export type Roles = typeof ROLES;
export type RoleInput<R extends RoleId> = z.input<Roles[R]['input']>;
export type RoleOutput<R extends RoleId> = z.output<Roles[R]['output']>;

const PROMPTS = repoPath('packages/models/prompts');

/** The versioned system prompt for a role. Shared rules come first so the prefix caches across roles. */
export function loadPrompt(role: RoleId, version: string): string {
  const shared = readFileSync(`${PROMPTS}/shared.md`, 'utf8');
  const own = readFileSync(`${PROMPTS}/${role}/${version}.md`, 'utf8');
  return `${shared.trim()}\n\n${own.trim()}\n`;
}

const UNSUPPORTED = new Set(['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'pattern', 'format', 'default']);

/**
 * JSON Schema for the provider's constrained output. Keeps the shape and drops keywords that
 * constrained decoding may not support; the full Zod schema validates the result afterwards.
 */
export function outputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      // Keys under `properties` are field names, not keywords: a field may be called "default" or "format".
      if (k === 'properties' && v && typeof v === 'object') {
        out[k] = Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, strip(sub)]));
        continue;
      }
      if (UNSUPPORTED.has(k)) continue;
      if (k === 'minItems' && typeof v === 'number' && v > 1) continue;
      // Constrained decoding rejects oneOf; anyOf keeps the same branches, and Zod still checks exclusivity.
      out[k === 'oneOf' ? 'anyOf' : k] = strip(v);
    }
    if (out.type === 'object' && out.additionalProperties === undefined) out.additionalProperties = false;
    return out;
  };
  return strip(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' })) as Record<string, unknown>;
}
