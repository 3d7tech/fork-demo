import type { ModuleId, ModuleInput } from '@fork/calc';
import type { CalcResult, DecisionSpec, Fact, ScreenLayout, VisualData } from '@fork/spec';
import { z } from 'zod';

/** Data a module needs beyond single facts. Goes to code only, never to a model. */
export interface FamilyData {
  /** Every employee's salary and contracted hours, for company-wide decisions. Owners only. */
  payrollRows?: Array<{ salary: number; hoursPerWeek: number }>;
}

export interface RequestInput {
  calc: CalcResult;
  levers: Record<string, number>;
  answers: Record<string, string>;
  facts: Record<string, Fact['value']>;
  /** The employee asking, for employee requests. */
  person: { name: string; payrollRef: string } | null;
  companyName: string;
}

export interface FactDef {
  id: string;
  label: string;
  unit: 'GBP' | 'pct' | 'hours' | 'count' | 'text' | 'yes_no';
}

/**
 * Everything Fork needs to answer one kind of decision. Adding a family means writing one of
 * these, a calculation module, golden tests and evaluation cases; the pipeline doesn't change.
 */
export interface FamilyDef<M extends ModuleId = ModuleId> {
  id: string;
  audience: 'employee' | 'owner';
  /** Short name shown to people, such as in the list of what Fork can help with. */
  title: string;
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
  /** Data beyond single facts that this family's module needs. */
  needs?: Array<keyof FamilyData>;
  /**
   * Levers only the person can set (a bonus amount, a car's price). When the question gives
   * numbers, the spec writer runs even on a confident route, so it can start the levers there.
   */
  questionSetsLevers?: boolean;
  /** Turn facts, answers and lever values into the module's input. */
  buildInput(facts: Record<string, Fact['value']>, answers: Record<string, string>, levers: Record<string, number>, data: FamilyData): ModuleInput<M>;
  /** Used when the composer's layout fails validation, so a bad layout never blocks a good answer. */
  defaultLayout: ScreenLayout;
  /** The data for the screen's visual. Code, so every bar and label comes from the results. */
  visual(calc: CalcResult, display: (key: string) => string): VisualData;
  /**
   * What the accountant is asked to do, written by code from the result. Employee requests name
   * the person (the accountant needs that to change payroll); owners never see them.
   * `figures` are company-level numbers for the dashboard, such as the employer NI saved a year.
   */
  request?(r: RequestInput): { summary: string; figures?: Record<string, number> } | null;
  /** Plain-English label for each building step shown while the screen is made. */
  steps: { facts: string; checks: string };
}
