import type { ModuleId, ModuleInput } from '@fork/calc';
import type { DecisionSpec, Fact, ScreenLayout } from '@fork/spec';
import { z } from 'zod';

export interface FactDef {
  id: string;
  label: string;
  unit: 'GBP' | 'pct' | 'hours' | 'text';
}

/**
 * Everything Fork needs to answer one kind of decision. Adding a family means writing one of
 * these, a calculation module, golden tests and evaluation cases; the pipeline doesn't change.
 */
export interface FamilyDef<M extends ModuleId = ModuleId> {
  id: string;
  audience: 'employee' | 'owner';
  /** What the router sees when choosing a family. No personal data. */
  description: string;
  module: M;
  rulePack: string;
  /** Starting point for the spec writer. Facts are filled in by code. */
  template: z.input<typeof DecisionSpec>;
  facts: FactDef[];
  /** Constraint ids whose answers the module understands, with the answer used before the person picks. */
  answers: Record<string, string>;
  /** Lever ids the module understands. */
  levers: string[];
  /** Turn facts, answers and lever values into the module's input. */
  buildInput(facts: Record<string, Fact['value']>, answers: Record<string, string>, levers: Record<string, number>): ModuleInput<M>;
  /** Used when the composer's layout fails validation, so a bad layout never blocks a good answer. */
  defaultLayout: ScreenLayout;
  /** Plain-English label for each building step shown while the screen is made. */
  steps: { facts: string; checks: string };
}
