// What the result would be at every value of one lever, holding everything else as it is.
// Drawn as a small chart beside the slider so people see where they sit and where things change.
// Every point is a run of the calculation engine; nothing is interpolated or estimated by a model.
import { runModule, type ModuleId } from '@fork/calc';
import type { DecisionSpec, Fact } from '@fork/spec';
import type { FamilyData, FamilyDef } from './families';
import { formatQuantity } from './format';

export interface LeverSweep {
  lever: string;
  unit: 'GBP' | 'pct' | 'count' | 'miles';
  /** Lever values, ascending. */
  xs: number[];
  series: Array<{ key: string; label: string; estimate: boolean; values: number[] }>;
  /** Formatted ends of each axis, for labels. */
  xLabels: [string, string];
  yMax: { value: number; display: string };
}

const MAX_POINTS = 41;

export function sweepLever(
  family: FamilyDef,
  spec: DecisionSpec,
  facts: Fact[],
  answers: Record<string, string>,
  levers: Record<string, number>,
  data: FamilyData,
): LeverSweep | null {
  const cfg = family.sweep;
  const lever = cfg && spec.levers.find((l) => l.id === cfg.lever);
  if (!cfg || !lever) return null;
  const steps = Math.round((lever.max - lever.min) / lever.step);
  const every = Math.max(1, Math.ceil(steps / (MAX_POINTS - 1)));
  const xs: number[] = [];
  for (let i = 0; i <= steps; i += every) xs.push(lever.min + i * lever.step);
  if (xs[xs.length - 1] !== lever.max) xs.push(lever.max);
  const factValues = Object.fromEntries(facts.map((f) => [f.id, f.value]));
  const runs = xs.map((x) => runModule(family.module as ModuleId, family.rulePack, family.buildInput(factValues, answers, { ...levers, [lever.id]: x }, data) as never));
  const series = cfg.series.flatMap((s) => {
    const first = runs[0]!.outputs[s.key];
    if (!first) return [];
    return [{ key: s.key, label: s.label ?? first.label, estimate: first.estimate, values: runs.map((r) => r.outputs[s.key]?.value ?? 0) }];
  });
  if (!series.length) return null;
  const unit = (lever.unit ?? 'count') as LeverSweep['unit'];
  const yUnit = runs[0]!.outputs[cfg.series[0]!.key]!.unit;
  const yMax = Math.max(...series.flatMap((s) => s.values), 0);
  return {
    lever: lever.id,
    unit,
    xs,
    series,
    xLabels: [formatQuantity({ value: lever.min, unit }), formatQuantity({ value: lever.max, unit })],
    yMax: { value: yMax, display: formatQuantity({ value: yMax, unit: yUnit }) },
  };
}
