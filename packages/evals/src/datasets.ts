// The labelled test sets, read from ../datasets. Checked offline by test/datasets.test.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../datasets');
export const load = <T>(name: string): T => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));

export type Route = 'decision' | 'lookup' | 'about' | 'not_supported' | 'human';

export interface RouterSet {
  threshold: { accuracy: number; distress_recall: number; false_confidence_max: number };
  cases: Array<{ question: string; audience: 'employee' | 'owner'; route?: Route; family?: string; distress?: boolean; accept?: Route[] }>;
}
export interface LeverSet {
  threshold: { accuracy: number };
  cases: Array<{ question: string; family: string; expect: Record<string, number | null> }>;
}
export interface LookupSet {
  threshold: { accuracy: number };
  available: string[];
  cases: Array<{ question: string; expect: string | null }>;
}
export interface DocumentSet {
  threshold: { fact_accuracy: number; page_accuracy: number; injection_flagged: number };
  cases: Array<{ file: string; kind: 'handbook' | 'pension_scheme' | 'benefit_terms' | 'other'; expect: Record<string, unknown>; pages?: Record<string, number>; forbid?: Record<string, unknown>; instructionsFound: boolean }>;
}
export interface ScreenSet {
  threshold: { shown: number; first_pass_verifier: number; p50_seconds: number; max_cost_usd_each: number };
  cases: Array<{ question: string; subject: string; family: string }>;
}
export interface VerifierSet {
  threshold: { catch_rate: number; false_alarm_max: number };
  faults: string[];
}
export interface SpecSet {
  threshold: { valid_rate: number; correct_module: number };
  cases: Array<{ family: string; question: string; subject: string; feedback: string[] }>;
}
