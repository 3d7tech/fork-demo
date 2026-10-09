import { bonus } from './bonus';
import { contributionLevel } from './contributionLevel';
import { cycleToWork } from './cycleToWork';
import { evScheme } from './evScheme';
import { hireCost } from './hireCost';
import { ssIntroduce } from './ssIntroduce';
import { ssSwitch } from './ssSwitch';
import { threshold100k } from './threshold100k';
import { PROFILE_FACTS } from './shared';
import type { FamilyDef } from './types';

export type { FamilyData, FamilyDef, FactDef, RequestInput } from './types';

const ALL = [ssSwitch, contributionLevel, threshold100k, evScheme, cycleToWork, ssIntroduce, hireCost, bonus];

export const FAMILIES: Record<string, FamilyDef> = Object.fromEntries(ALL.map((f) => [f.id, f as unknown as FamilyDef]));

export function familiesFor(audience: 'employee' | 'owner'): FamilyDef[] {
  return Object.values(FAMILIES).filter((f) => f.audience === audience);
}

/** Every fact a family reads: the ones it needs, and the profile facts it uses when known. */
export function factIds(family: FamilyDef): string[] {
  return [...family.facts.map((f) => f.id), ...(family.profile ? PROFILE_FACTS : [])];
}
