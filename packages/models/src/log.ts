import type { RoleId } from './registry';

/**
 * One model call. Holds no question text, inputs or outputs: only what is needed to
 * track quality, cost and speed per role without storing personal data.
 */
export interface CallLog {
  at: string;
  runId: string;
  role: RoleId;
  promptVersion: string;
  provider: string;
  model: string;
  servedBy: string;
  attempt: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  outcome: 'valid' | 'invalid_json' | 'invalid_schema' | 'refusal' | 'max_tokens' | 'error';
  /** Paths and codes of validation failures, never the values. */
  issues?: string[];
  errorKind?: string;
}

export interface CallLogger {
  record(entry: CallLog): void;
}

export class MemoryLogger implements CallLogger {
  readonly entries: CallLog[] = [];
  record(entry: CallLog) {
    this.entries.push(entry);
  }
}

export class JsonLinesLogger implements CallLogger {
  constructor(private readonly write: (line: string) => void = (l) => process.stdout.write(l + '\n')) {}
  record(entry: CallLog) {
    this.write(JSON.stringify({ type: 'model_call', ...entry }));
  }
}
