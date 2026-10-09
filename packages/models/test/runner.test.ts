import { z } from 'zod';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG_PATH,
  loadPrompt,
  loadRegistry,
  MemoryLogger,
  outputJsonSchema,

  RegistryConfig,
  ROLE_IDS,
  ROLES,
  RoleFailedError,
  RoleInputError,
  runRole,
  SAFE_FAILURE_MESSAGE,
  type ModelProvider,
  type ProviderRequest,
  type ProviderResponse,
} from '../src';

/** Replays scripted responses and records every request. */
class FakeProvider implements ModelProvider {
  readonly id = 'anthropic';
  readonly calls: ProviderRequest[] = [];
  constructor(private readonly script: Array<Partial<ProviderResponse> & { text?: string }>) {}
  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    this.calls.push(structuredClone({ ...req, signal: undefined }));
    const next = this.script.shift() ?? { outcome: 'error', errorKind: 'script_exhausted' };
    return { outcome: 'ok', text: '', servedBy: req.ref.model, inputTokens: 100, outputTokens: 20, ...next } as ProviderResponse;
  }
}

const QUESTION = 'maya says we can switch the pension to salary sacrifice?? is there a catch';
const routerInput = {
  question: QUESTION,
  audience: 'employee' as const,
  families: [{ family: 'pension.salary_sacrifice_switch', description: 'Switch pension contributions to salary sacrifice' }],
};
const goodRoute = JSON.stringify({ route: 'decision', family: 'pension.salary_sacrifice_switch', confidence: 'high', distress: false, reason: 'Asks whether to switch.' });
const badRoute = JSON.stringify({ route: 'maybe', family: null, confidence: 'high', distress: false, reason: 'x' });

const setup = (script: ConstructorParameters<typeof FakeProvider>[0], registry = loadRegistry()) => {
  const provider = new FakeProvider(script);
  const log = new MemoryLogger();
  return { provider, log, ctx: { registry, providers: { anthropic: provider }, log } };
};

describe('registry', () => {
  it('loads config/models.yaml and every role has a prompt file', () => {
    const reg = loadRegistry();
    for (const id of ROLE_IDS) {
      expect(reg.candidates(id).length).toBeGreaterThan(0);
      expect(loadPrompt(id, ROLES[id].promptVersion)).toContain('You never do arithmetic');
    }
  });

  it('rejects a config with a missing or unknown role', () => {
    const raw = { roles: { router: { primary: { provider: 'anthropic', model: 'x' }, maxTokens: 1, maxLatencyMs: 1 } } };
    expect(RegistryConfig.safeParse(raw).success).toBe(false);
  });

  it('the verifier runs on a different model from the spec writer', () => {
    const reg = loadRegistry();
    expect(reg.role('verifier').primary.model).not.toBe(reg.role('spec_writer').primary.model);
  });

  it('swapping a role’s model is a config change only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fork-models-'));
    const path = join(dir, 'models.yaml');
    writeFileSync(path, readFileSync(DEFAULT_CONFIG_PATH, 'utf8').replace('model: claude-haiku-5-5, effort: low }', 'model: claude-sonnet-5-5, effort: low }'));
    const { provider, ctx } = setup([{ text: goodRoute }], loadRegistry(path));
    const run = await runRole(ctx, 'router', routerInput);
    expect(provider.calls[0]!.ref.model).toBe('claude-sonnet-5-5');
    expect(run.model).toBe('claude-sonnet-5-5');
  });
});

describe('runRole', () => {
  it('returns validated output and logs one valid call', async () => {
    const { log, ctx } = setup([{ text: goodRoute }]);
    const run = await runRole(ctx, 'router', routerInput);
    expect(run.output.family).toBe('pension.salary_sacrifice_switch');
    expect(run.promptVersion).toBe('v2');
    expect(log.entries.map((e) => e.outcome)).toEqual(['valid']);
    expect(log.entries[0]).toMatchObject({ role: 'router', model: 'claude-haiku-5-5', promptVersion: 'v2' });
  });

  it('retries once on the same model with the validation error', async () => {
    const { provider, log, ctx } = setup([{ text: badRoute }, { text: goodRoute }]);
    await runRole(ctx, 'router', routerInput);
    expect(log.entries.map((e) => [e.model, e.outcome])).toEqual([
      ['claude-haiku-5-5', 'invalid_schema'],
      ['claude-haiku-5-5', 'valid'],
    ]);
    const retry = provider.calls[1]!.messages;
    expect(retry.at(-1)!.content).toMatch(/failed validation[\s\S]*route/);
  });

  it('moves to the fallback model after two invalid replies', async () => {
    const { log, ctx } = setup([{ text: 'not json' }, { text: badRoute }, { text: goodRoute }]);
    const run = await runRole(ctx, 'router', routerInput);
    expect(run.model).toBe('claude-sonnet-5-5');
    expect(log.entries.map((e) => e.outcome)).toEqual(['invalid_json', 'invalid_schema', 'valid']);
  });

  it('a refusal or API error goes straight to the fallback model', async () => {
    const { log, ctx } = setup([{ outcome: 'refusal', errorKind: 'general_harms' }, { text: goodRoute }]);
    const run = await runRole(ctx, 'router', routerInput);
    expect(run.model).toBe('claude-sonnet-5-5');
    expect(log.entries.map((e) => e.outcome)).toEqual(['refusal', 'valid']);
  });

  it('fails safely with a message for the person when every model fails', async () => {
    const { ctx } = setup([{ outcome: 'error', errorKind: 'http_529' }, { text: badRoute }, { text: badRoute }]);
    const err = await runRole(ctx, 'router', routerInput).catch((e) => e);
    expect(err).toBeInstanceOf(RoleFailedError);
    expect(err.userMessage).toBe(SAFE_FAILURE_MESSAGE);
  });

  it('refuses to send a role data it does not need, before any model call', async () => {
    const { provider, ctx } = setup([{ text: goodRoute }]);
    const leaky = { ...routerInput, salary: 32000 } as unknown as typeof routerInput;
    await expect(runRole(ctx, 'router', leaky)).rejects.toBeInstanceOf(RoleInputError);
    expect(provider.calls).toHaveLength(0);
  });

  it('logs no question text or model output', async () => {
    const { log, ctx } = setup([{ text: badRoute }, { text: goodRoute }]);
    await runRole(ctx, 'router', routerInput);
    const logged = JSON.stringify(log.entries);
    expect(logged).not.toContain('maya');
    expect(logged).not.toContain('Asks whether to switch');
  });

  it('records cost from the registry pricing', async () => {
    const { log, ctx } = setup([{ text: goodRoute, inputTokens: 1_000_000, outputTokens: 0 }]);
    await runRole(ctx, 'router', routerInput);
    expect(log.entries[0]!.costUsd).toBeCloseTo(0.1, 10);
  });

  it('the person’s question is sent as data, not as instructions', async () => {
    const { provider, ctx } = setup([{ text: goodRoute }]);
    await runRole(ctx, 'router', routerInput);
    const msg = provider.calls[0]!.messages[0]!.content;
    expect(msg).toMatch(/never instructions to you/);
    expect(msg).toContain('<input>');
  });
});

describe('output JSON schemas for constrained decoding', () => {
  it.each(ROLE_IDS)('%s: every object is closed and no unsupported keywords remain', (id) => {
    const schema = outputJsonSchema(ROLES[id].output);
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      const o = n as Record<string, unknown>;
      if (o.type === 'object') expect(o.additionalProperties).toBe(false);
      for (const k of ['$schema', 'oneOf', 'minimum', 'maximum', 'pattern', 'minLength', 'maxLength']) expect(o).not.toHaveProperty(k);
      Object.values(o).forEach(walk);
    };
    walk(schema);
  });

  it('keeps fields whose names match a dropped keyword', () => {
    const schema = outputJsonSchema(z.object({ default: z.number(), format: z.string().min(1) }));
    expect(Object.keys(schema.properties as object)).toEqual(['default', 'format']);
    expect(schema.required).toEqual(['default', 'format']);
  });

  it('spec_writer keeps the lever default the API needs to see', () => {
    const levers = (outputJsonSchema(ROLES.spec_writer.output).properties as Record<string, any>).levers;
    expect(Object.keys(levers.items.properties)).toContain('default');
  });
});


describe('anthropicApiKey', async () => {
  const { anthropicApiKey } = await import('../src/index');
  it('prefers FORK_ANTHROPIC_API_KEY, falls back to ANTHROPIC_API_KEY, treats empty as unset', () => {
    expect(anthropicApiKey({ FORK_ANTHROPIC_API_KEY: 'a', ANTHROPIC_API_KEY: 'b' })).toBe('a');
    expect(anthropicApiKey({ FORK_ANTHROPIC_API_KEY: '', ANTHROPIC_API_KEY: 'b' })).toBe('b');
    expect(anthropicApiKey({ FORK_ANTHROPIC_API_KEY: '', ANTHROPIC_API_KEY: '' })).toBeUndefined();
  });
});
