import type { CalcResult } from '@fork/spec';
import { loadRulePack } from '@fork/rules';
import { Rules } from './core';
import { bonusCashOrPension } from './modules/bonus';
import { childBenefitCharge } from './modules/childBenefitCharge';
import { contributionLevel } from './modules/contributionLevel';
import { cycleToWork } from './modules/cycleToWork';
import { evScheme } from './modules/evScheme';
import { hireCost } from './modules/hireCost';
import { ssIntroduce } from './modules/ssIntroduce';
import { ssSwitch } from './modules/ssSwitch';
import { threshold100k } from './modules/threshold100k';

export { Rules, roundPounds, leverRanges } from './core';
export * as uk from './uk';
export { profileAssumptions, type Profiled } from './profile';
export { ssSwitch, ssIntroduce, threshold100k, hireCost, bonusCashOrPension, evScheme };

/** The modules a DecisionSpec can name in `calculation.module`. */
export const MODULES = {
  'pension.ss_switch': ssSwitch,
  'employer.ss_introduce': ssIntroduce,
  'pay.threshold_100k': threshold100k,
  'employer.hire_cost': hireCost,
  'employer.bonus_cash_or_pension': bonusCashOrPension,
  'benefits.ev_scheme': evScheme,
  'pension.contribution_level': contributionLevel,
  'benefits.cycle_to_work': cycleToWork,
  'pay.child_benefit_charge': childBenefitCharge,
} as const;

export type ModuleId = keyof typeof MODULES;
export type ModuleInput<M extends ModuleId> = Parameters<(typeof MODULES)[M]>[1];

/** Run a named module against a named rule pack. Pure: same input and pack give the same result. */
export function runModule<M extends ModuleId>(module: M, rulePack: string, input: ModuleInput<M>): CalcResult {
  const fn = MODULES[module] as (r: Rules, i: ModuleInput<M>) => CalcResult;
  return fn(new Rules(loadRulePack(rulePack)), input);
}
