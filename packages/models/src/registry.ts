import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const ROLE_IDS = ['router', 'spec_writer', 'screen_composer', 'explainer', 'verifier'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export const ModelRef = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  /** Let the provider retry a declined request on another model server-side, where supported. */
  serverFallback: z.boolean().default(false),
});
export type ModelRef = z.infer<typeof ModelRef>;

const RoleConfig = z.strictObject({
  primary: ModelRef,
  fallback: ModelRef.optional(),
  maxTokens: z.number().int().positive(),
  maxLatencyMs: z.number().int().positive(),
});
export type RoleConfig = z.infer<typeof RoleConfig>;

export const RegistryConfig = z.strictObject({
  roles: z.strictObject(Object.fromEntries(ROLE_IDS.map((id) => [id, RoleConfig])) as Record<RoleId, typeof RoleConfig>),
  pricing: z.record(z.string(), z.strictObject({ input: z.number().nonnegative(), output: z.number().nonnegative() })).default({}),
});
export type RegistryConfig = z.infer<typeof RegistryConfig>;

export class Registry {
  constructor(readonly config: RegistryConfig) {}

  role(id: RoleId): RoleConfig {
    return this.config.roles[id];
  }

  /** Models to try for a role, in order. */
  candidates(id: RoleId): ModelRef[] {
    const r = this.role(id);
    return r.fallback ? [r.primary, r.fallback] : [r.primary];
  }

  /** Cost in US dollars, or null if the model has no price on file. */
  cost(model: string, inputTokens: number, outputTokens: number): number | null {
    const p = this.config.pricing[model];
    return p ? (inputTokens * p.input + outputTokens * p.output) / 1_000_000 : null;
  }
}

export const DEFAULT_CONFIG_PATH = new URL('../../../config/models.yaml', import.meta.url);

/** Load the registry from YAML. FORK_MODELS_CONFIG points at another file, so an eval can swap models with no code change. */
export function loadRegistry(path: string | URL = process.env.FORK_MODELS_CONFIG ?? DEFAULT_CONFIG_PATH): Registry {
  return new Registry(RegistryConfig.parse(parse(readFileSync(path, 'utf8'))));
}
