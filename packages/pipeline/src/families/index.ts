import { ssSwitch } from './ssSwitch';
import type { FamilyDef } from './types';

export type { FamilyDef, FactDef } from './types';

export const FAMILIES: Record<string, FamilyDef> = Object.fromEntries([ssSwitch].map((f) => [f.id, f as unknown as FamilyDef]));

export function familiesFor(audience: 'employee' | 'owner'): FamilyDef[] {
  return Object.values(FAMILIES).filter((f) => f.audience === audience);
}
