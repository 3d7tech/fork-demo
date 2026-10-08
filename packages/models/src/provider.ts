import Anthropic from '@anthropic-ai/sdk';
import type { ModelRef } from './registry';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProviderRequest {
  ref: ModelRef;
  system: string;
  messages: ProviderMessage[];
  /** JSON Schema the provider constrains its output to. Our own Zod schema still validates the result. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
}

export type ProviderOutcome = 'ok' | 'refusal' | 'max_tokens' | 'error';

export interface ProviderResponse {
  outcome: ProviderOutcome;
  text: string;
  /** The model that actually answered, which differs from ref.model after a server-side fallback. */
  servedBy: string;
  inputTokens: number;
  outputTokens: number;
  errorKind?: string;
}

/** A model provider. Product code never calls one directly; it goes through runRole. */
export interface ModelProvider {
  readonly id: string;
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

/**
 * The key Fork's own model calls use. FORK_ANTHROPIC_API_KEY comes first because cloud
 * environments reserve ANTHROPIC_API_KEY for the coding agent and don't pass it through.
 */
export function anthropicApiKey(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.FORK_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY || undefined;
}

export class AnthropicProvider implements ModelProvider {
  readonly id = 'anthropic';
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey: anthropicApiKey() });
  }

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const empty = { text: '', servedBy: req.ref.model, inputTokens: 0, outputTokens: 0 };
    try {
      const response = await this.client.beta.messages.create(
        {
          model: req.ref.model,
          max_tokens: req.maxTokens,
          // The system prompt is stable per role and prompt version, so it caches across calls.
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages: req.messages,
          output_config: {
            format: { type: 'json_schema', schema: req.jsonSchema },
            ...(req.ref.effort ? { effort: req.ref.effort } : {}),
          },
          ...(req.ref.serverFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        },
        { signal: req.signal },
      );
      const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      const base = {
        text,
        servedBy: response.model,
        inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
      };
      if (response.stop_reason === 'refusal') return { ...base, outcome: 'refusal', errorKind: response.stop_details?.category ?? 'refusal' };
      if (response.stop_reason === 'max_tokens') return { ...base, outcome: 'max_tokens' };
      return { ...base, outcome: 'ok' };
    } catch (error) {
      if (error instanceof Anthropic.APIError) return { ...empty, outcome: 'error', errorKind: `http_${error.status ?? 'unknown'}` };
      return { ...empty, outcome: 'error', errorKind: error instanceof Error ? error.name : 'unknown' };
    }
  }
}
