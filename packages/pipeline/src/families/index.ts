import { bonus } from './bonus';
import { contributionLevel } from './contributionLevel';
import { evScheme } from './evScheme';
import { hireCost } from './hireCost';
import { ssIntroduce } from './ssIntroduce';
import { ssSwitch } from './ssSwitch';
import { threshold100k } from './threshold100k';
import type { FamilyDef } from './types';

export type { FamilyData, FamilyDef, FactDef } from './types';

const ALL = [ssSwitch, contributionLevel, threshold100k, evScheme, ssIntroduce, hireCost, bonus];

export const FAMILIES: Record<string, FamilyDef> = Object.fromEntries(ALL.map((f) => [f.id, f as unknown as FamilyDef]));

export function familiesFor(audience: 'employee' | 'owner'): FamilyDef[] {
  return Object.values(FAMILIES).filter((f) => f.audience === audience);
}
