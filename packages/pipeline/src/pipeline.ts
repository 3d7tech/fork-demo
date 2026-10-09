import { runModule, type ModuleId } from '@fork/calc';
import { RoleFailedError, runRole, type RoleContext, type RoleId, type RoleOutput } from '@fork/models';
import { CalcResult, DecisionSpec, ScreenLayout, type Fact, type ScreenCopy, type VisualData } from '@fork/spec';
import { checkCopy } from './checks';
import { FAMILIES, familiesFor, type FamilyData, type FamilyDef } from './families';
import type { FactStore, Subject } from './facts';
import { extractNumbers, formatDate, formatGBP, formatPct, formatQuantity, type ScreenNumber } from './format';
import { BLOCKED, clarify, DISTRESS, failed, HUMAN, LOOKUP_UNKNOWN, needsFacts, notYet, type ForkMessage } from './messages';

export interface PipelineDeps {
  roles: RoleContext;
  facts: FactStore;
  /** Answers a lookup ("where is my P60?") from the person's documents, or null if not found. */
  lookup?: (question: string, subject: Subject) => Promise<ForkMessage | null>;
}

export interface BuildStep {
  id: 'understood' | 'facts' | 'spec' | 'calc' | 'screen' | 'checked';
  label: string;
  detail?: string;
}

export interface RoleUseRecord {
  role: RoleId;
  model: string;
  promptVersion: string;
  attempts: number;
}

/** Everything needed to render, re-run, audit and later re-check one decision. */
export interface DecisionScreen {
  kind: 'decision';
  runId: string;
  createdAt: string;
  question: string;
  family: string;
  spec: DecisionSpec;
  answers: Record<string, string>;
  levers: Record<string, number>;
  calc: CalcResult;
  numbers: ScreenNumber[];
  layout: ScreenLayout;
  copy: ScreenCopy;
  visual: VisualData;
  checks: {
    code: string[];
    verifier: RoleOutput<'verifier'>;
    /** Problems fixed by sending work back to an earlier step. */
    revised: string[];
    /** Places Fork fell back to the family's own spec or layout. */
    fallbacks: string[];
  };
  /** specFrom: the family's reviewed template, or a spec the spec writer wrote for this question. */
  provenance: { rulePack: CalcResult['rulePack']; roles: RoleUseRecord[]; specFrom: 'template' | 'spec_writer' };
}

export type ForkAnswer = DecisionScreen | ForkMessage;

export interface AskInput {
  question: string;
  subject: Subject;
  onStep?: (step: BuildStep) => void;
}

class Trace {
  readonly roles: RoleUseRecord[] = [];
  readonly fallbacks: string[] = [];
  readonly revised: string[] = [];

  constructor(readonly deps: PipelineDeps) {}

  async run<R extends RoleId>(role: R, input: Parameters<typeof runRole<R>>[2]): Promise<RoleOutput<R>> {
    const r = await runRole(this.deps.roles, role, input);
    this.roles.push({ role, model: r.model, promptVersion: r.promptVersion, attempts: r.attempts });
    return r.output;
  }
}

// ---------- Numbers the screen may show ----------

function factDisplay(family: FamilyDef, f: Fact): ScreenNumber | null {
  const def = family.facts.find((d) => d.id === f.id);
  if (!def || typeof f.value !== 'number') return null;
  const display = def.unit === 'GBP' ? formatGBP(f.value) : def.unit === 'pct' ? formatPct(f.value) : `${f.value}`;
  return { key: `fact.${f.id}`, label: def.label, display, estimate: f.confidence === 'estimate' };
}

/** The complete list of numbers the explainer may quote: engine outputs, the facts used, and the tipping point. */
export function screenNumbers(family: FamilyDef, calc: CalcResult, facts: Fact[], spec?: DecisionSpec, levers: Record<string, number> = {}): ScreenNumber[] {
  const out: ScreenNumber[] = Object.entries(calc.outputs).map(([key, o]) => ({ key, label: o.label, display: formatQuantity(o), estimate: o.estimate }));
  for (const f of facts) {
    const n = factDisplay(family, f);
    if (n) out.push(n);
  }
  // The values the levers are set to: the person's own choices, which the copy may repeat.
  if (spec) {
    const values = leverValues(spec, facts, levers);
    for (const l of spec.levers) {
      const v = values[l.id];
      if (v === undefined) continue;
      const unit = l.unit === 'GBP' ? 'GBP' : l.unit === 'pct' ? 'pct' : l.unit === 'miles' ? 'miles' : 'count';
      out.push({ key: `lever.${l.id}`, label: l.label, display: formatQuantity({ value: v, unit }), estimate: false });
    }
  }
  // Numbers written by code in the engine's own labels and assumptions ("Each extra 1%",
  // "£430 a month lease", "from April 2029") may be quoted as written. They are never model-made.
  const fromText = (text: string, label: string, estimate: boolean) => {
    for (const tok of extractNumbers(text)) {
      if (out.some((n) => n.display === tok.raw)) continue;
      out.push({ key: `text.${out.length}`, label: `As written in “${label}”`, display: tok.raw, estimate });
    }
  };
  for (const o of Object.values(calc.outputs)) fromText(o.label, o.label, false);
  for (const a of calc.assumptions) fromText(a.text, a.text, a.estimate);
  // Official rule values (rates, thresholds) may be quoted too: "you don't pay 8% National Insurance".
  const seen = new Set(out.map((n) => n.display));
  for (const r of calc.rulesUsed) {
    if (r.value === null) continue;
    const display = formatQuantity({ value: r.value, unit: r.unit === 'count' ? 'count' : r.unit });
    if (seen.has(display)) continue;
    seen.add(display);
    out.push({ key: `rule.${r.id}@${r.on}`, label: r.description, display, estimate: false });
  }
  const tp = calc.tippingPoint;
  if (tp) {
    out.push({ key: 'tipping_point', label: tp.description, display: formatQuantity({ value: tp.at, unit: tp.unit }), estimate: false });
    if (tp.from) out.push({ key: 'tipping_point_from', label: 'Date the tipping point applies from', display: formatDate(tp.from), estimate: false });
  }
  return out;
}

function visualFor(family: FamilyDef, calc: CalcResult, numbers: ScreenNumber[]): VisualData {
  return family.visual(calc, (key) => numbers.find((n) => n.key === key)?.display ?? '');
}

// ---------- Spec ----------

/** Code owns the facts: whatever the spec writer returned, the spec carries exactly the gathered facts. */
function withFacts(spec: unknown, question: string, facts: Fact[]) {
  return DecisionSpec.safeParse({ ...(spec as object), question, facts });
}

/**
 * Fix in code what code can fix safely, so the spec writer isn't asked again for it: keep the
 * family, module and rule pack; drop levers and questions the module can't use; restore hard
 * constraints from the reviewed template. Each change is recorded.
 */
function tidySpec(t: Trace, family: FamilyDef, spec: RoleOutput<'spec_writer'>): RoleOutput<'spec_writer'> {
  const levers = spec.levers.filter((l) => family.levers.includes(l.id));
  const constraints = spec.constraints.filter((c) => c.kind !== 'ask' || c.id in family.answers);
  for (const c of family.template.constraints ?? []) {
    if (c.kind === 'hard' && !constraints.some((x) => x.id === c.id)) constraints.unshift(c as (typeof constraints)[number]);
  }
  const dropped = [...spec.levers.filter((l) => !levers.includes(l)).map((l) => `lever ${l.id}`), ...spec.constraints.filter((c) => !constraints.includes(c)).map((c) => `question ${c.id}`)];
  if (dropped.length) t.fallbacks.push(`spec: dropped ${dropped.join(', ')} (not used by ${family.module})`);
  return {
    ...spec,
    family: family.id,
    calculation: { ...spec.calculation, module: family.module, rulePack: family.rulePack },
    levers: levers.length ? levers : (family.template.levers as typeof levers),
    constraints,
  };
}

function specProblems(family: FamilyDef, spec: DecisionSpec): string[] {
  const p: string[] = [];
  if (spec.family !== family.id) p.push(`family must be ${family.id}`);
  if (spec.calculation?.module !== family.module) p.push(`calculation.module must be ${family.module}`);
  if (spec.calculation?.rulePack !== family.rulePack) p.push(`calculation.rulePack must be ${family.rulePack}`);
  for (const l of spec.levers) if (!family.levers.includes(l.id)) p.push(`lever ${l.id} is not one this decision can calculate; use ${family.levers.join(', ')}`);
  for (const c of spec.constraints) {
    if (c.kind === 'ask' && !(c.id in family.answers)) p.push(`constraint ${c.id} is not one this decision can use; use ${Object.keys(family.answers).join(', ')}`);
  }
  if (!spec.constraints.some((c) => c.id === 'min_wage') && family.template.constraints?.some((c) => c.id === 'min_wage')) {
    p.push('the min_wage hard constraint must stay');
  }
  return p;
}

async function writeSpec(t: Trace, family: FamilyDef, question: string, facts: Fact[], feedback?: string[]): Promise<DecisionSpec> {
  const template = { ...family.template, question };
  let fb = feedback;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await t.run('spec_writer', { question, audience: family.audience, family: family.id, template, facts, ...(fb ? { feedback: fb } : {}) });
    const parsed = withFacts(tidySpec(t, family, out), question, facts);
    const problems = parsed.success ? specProblems(family, parsed.data) : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    if (!problems.length && parsed.success) return parsed.data;
    fb = problems;
  }
  // The family's own template is a reviewed, valid spec: a safe answer when the writer can't produce one.
  t.fallbacks.push(`spec: used the ${family.id} template after the spec writer failed checks`);
  return DecisionSpec.parse({ ...template, facts });
}

/**
 * Start levers from numbers in the question ("a £1,500 bonus", "someone on 40k"). A small model
 * reads them; code keeps only levers the spec has, within range and on a step.
 */
async function readLevers(t: Trace, spec: DecisionSpec, question: string): Promise<DecisionSpec> {
  const out = await t.run('lever_reader', { question, levers: spec.levers.map((l) => ({ id: l.id, label: l.label, unit: l.unit ?? 'count', min: l.min, max: l.max })) });
  const levers = spec.levers.map((l) => {
    const v = out.values.find((x) => x.id === l.id)?.value;
    if (v === undefined || v === null || !Number.isFinite(v) || v < l.min || v > l.max) return l;
    return { ...l, default: Math.round((v - l.min) / l.step) * l.step + l.min };
  });
  return DecisionSpec.parse({ ...spec, levers });
}

// ---------- Layout ----------

function layoutProblems(layout: ScreenLayout, spec: DecisionSpec, calc: CalcResult): string[] {
  const p: string[] = [];
  const levers = new Set(spec.levers.map((l) => l.id));
  const constraints = new Set(spec.constraints.map((c) => c.id));
  for (const k of layout.outcomeTiles) if (!(k in calc.outputs)) p.push(`outcome tile ${k} is not a calculated output`);
  for (const id of layout.leverOrder) if (!levers.has(id)) p.push(`lever ${id} is not in the spec`);
  for (const id of layout.constraintOrder) if (!constraints.has(id)) p.push(`constraint ${id} is not in the spec`);
  if (layout.highlightConstraint && !constraints.has(layout.highlightConstraint)) p.push(`highlighted constraint ${layout.highlightConstraint} is not in the spec`);
  return p;
}

async function compose(t: Trace, family: FamilyDef, spec: DecisionSpec, calc: CalcResult, feedback?: string[]): Promise<ScreenLayout> {
  const out = await t.run('screen_composer', {
    decisionType: spec.decisionType,
    defaultVisual: spec.visual,
    levers: spec.levers.map((l) => ({ id: l.id, label: l.label })),
    constraints: calc.constraints.map((c) => ({ id: c.id, outcome: c.outcome })),
    outputs: Object.entries(calc.outputs).map(([key, o]) => ({ key, label: o.label })),
    ...(feedback ? { feedback } : {}),
  });
  const problems = layoutProblems(out, spec, calc);
  if (!problems.length) return out;
  // A bad layout should never block a good answer: use the family's reviewed default.
  t.fallbacks.push(`layout: used the ${family.id} default (${problems.join('; ')})`);
  return family.defaultLayout;
}

// ---------- Copy ----------

function explain(t: Trace, family: FamilyDef, question: string, spec: DecisionSpec, calc: CalcResult, numbers: ScreenNumber[], feedback?: string[]) {
  return t.run('explainer', {
    audience: family.audience,
    question,
    verdict: calc.verdict,
    numbers,
    tippingPoint: calc.tippingPoint?.description ?? null,
    constraints: calc.constraints,
    assumptions: calc.assumptions,
    actionLabel: spec.action?.label ?? null,
    ...(feedback ? { feedback } : {}),
  });
}

async function verify(t: Trace, family: FamilyDef, question: string, spec: DecisionSpec, numbers: ScreenNumber[], copy: ScreenCopy) {
  const code = checkCopy(copy, numbers);
  const verifier = await t.run('verifier', { question, audience: family.audience, spec, numbers, copy, codeFindings: code });
  return { code, verifier, ok: code.length === 0 && verifier.pass };
}

// ---------- Calculation ----------

function factValues(facts: Fact[]): Record<string, Fact['value']> {
  return Object.fromEntries(facts.map((f) => [f.id, f.value]));
}

/** Lever values in use: what the person chose, else the spec's default (a number or a fact). */
export function leverValues(spec: DecisionSpec, facts: Fact[], chosen: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of spec.levers) {
    if (l.id in chosen) out[l.id] = chosen[l.id]!;
    else if (typeof l.default === 'number') out[l.id] = l.default;
    else {
      const f = facts.find((x) => x.id === l.default.toString().slice(5));
      if (typeof f?.value === 'number') out[l.id] = f.value;
    }
  }
  return out;
}

function calculate(family: FamilyDef, spec: DecisionSpec, facts: Fact[], answers: Record<string, string>, levers: Record<string, number>, data: FamilyData): CalcResult {
  return runModule(family.module as ModuleId, family.rulePack, family.buildInput(factValues(facts), answers, leverValues(spec, facts, levers), data) as never);
}

/** Data beyond single facts, for families that need it. Read by code; never sent to a model. */
export async function gatherData(deps: Pick<PipelineDeps, 'facts'>, family: FamilyDef, subject: Subject): Promise<FamilyData> {
  const data: FamilyData = {};
  if (family.needs?.includes('payrollRows') && deps.facts.payrollRows) data.payrollRows = await deps.facts.payrollRows(subject);
  return data;
}

/** The answers used before the person picks: the spec's own defaults where given, else the family's. */
function defaultAnswers(family: FamilyDef, spec: DecisionSpec): Record<string, string> {
  const out = { ...family.answers };
  for (const c of spec.constraints) if (c.kind === 'ask' && c.default && c.id in out) out[c.id] = c.default;
  return out;
}

// ---------- The pipeline ----------

/**
 * Turn a question into a checked decision screen, or into an honest message when a screen
 * would be wrong. Models classify, plan and write; every number comes from the calculation engine.
 */
export async function askFork(deps: PipelineDeps, input: AskInput): Promise<ForkAnswer> {
  const step = input.onStep ?? (() => {});
  const t = new Trace(deps);
  const question = input.question.trim();
  const audience = input.subject.audience;

  try {
    const families = familiesFor(audience);
    const route = await t.run('router', { question, audience, families: families.map((f) => ({ family: f.id, description: f.description })) });

    if (route.distress) return DISTRESS;
    if (route.route === 'human') return HUMAN;
    if (route.route === 'lookup') return (await deps.lookup?.(question, input.subject)) ?? LOOKUP_UNKNOWN;
    const family = route.family ? FAMILIES[route.family] : undefined;
    if (route.route === 'not_supported' || !family || family.audience !== audience) return notYet(families.map((f) => f.title));
    if (route.confidence === 'low') return clarify(family.description);
    step({ id: 'understood', label: 'Understood the question', detail: family.description });

    const facts = await deps.facts.get(input.subject, family.facts.map((f) => f.id));
    const missing = family.facts.filter((d) => !facts.some((f) => f.id === d.id));
    if (missing.length) return needsFacts(missing.map((m) => m.label));
    step({ id: 'facts', label: family.steps.facts });

    // The family's reviewed template is the spec. The spec writer, the strongest and slowest
    // model, runs only when the verifier asks for a missing option or constraint (ADR 0005).
    const data = await gatherData(deps, family, input.subject);
    if (family.needs?.includes('payrollRows') && !data.payrollRows?.length) return needsFacts(['Your payroll export']);
    let specFrom: 'template' | 'spec_writer' = 'template';
    let spec = DecisionSpec.parse({ ...family.template, question, facts });
    // Levers only the person can set (a bonus amount, a salary) start from the numbers in their question.
    if (family.questionSetsLevers && /\d/.test(question)) spec = await readLevers(t, spec, question);
    step({ id: 'spec', label: family.steps.checks });
    let answers = defaultAnswers(family, spec);
    let calc = calculate(family, spec, facts, answers, {}, data);
    step({ id: 'calc', label: 'Did the sums', detail: `using tax rules ${calc.rulePack.id}` });
    let numbers = screenNumbers(family, calc, facts, spec, {});
    let [layout, copy] = await Promise.all([compose(t, family, spec, calc), explain(t, family, question, spec, calc, numbers)]);
    step({ id: 'screen', label: 'Chose the screen' });

    // Check, then allow one revision round in which each problem goes back to the step that can fix it.
    for (let round = 0; round < 2; round++) {
      const v = await verify(t, family, question, spec, numbers, copy);
      if (v.ok) {
        step({ id: 'checked', label: 'Checked every number against the calculation' });
        return {
          kind: 'decision',
          runId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          question,
          family: family.id,
          spec,
          answers,
          levers: {},
          calc,
          numbers,
          layout,
          copy,
          visual: visualFor(family, calc, numbers),
          checks: { code: v.code, verifier: v.verifier, revised: t.revised, fallbacks: t.fallbacks },
          provenance: { rulePack: calc.rulePack, roles: t.roles, specFrom },
        };
      }
      if (round === 1 || v.verifier.issues.some((i) => i.sendBackTo === 'human')) break;

      const issues = (to: string) => v.verifier.issues.filter((i) => i.sendBackTo === to).map((i) => `${i.kind}: ${i.detail}`);
      const toSpec = issues('spec_writer');
      const toLayout = issues('screen_composer');
      const toCopy = [...v.code, ...issues('explainer')];
      t.revised.push(...toSpec, ...toLayout, ...toCopy);

      if (toSpec.length) {
        spec = await writeSpec(t, family, question, facts, toSpec);
        specFrom = 'spec_writer';
        answers = defaultAnswers(family, spec);
        calc = calculate(family, spec, facts, answers, {}, data);
        numbers = screenNumbers(family, calc, facts, spec, {});
      }
      [layout, copy] = await Promise.all([
        toSpec.length || toLayout.length ? compose(t, family, spec, calc, toLayout.length ? toLayout : undefined) : layout,
        toSpec.length || toCopy.length ? explain(t, family, question, spec, calc, numbers, toCopy.length ? toCopy : undefined) : copy,
      ]);
    }
    return BLOCKED;
  } catch (error) {
    if (error instanceof RoleFailedError) return failed(error.userMessage);
    throw error;
  }
}

/**
 * Re-run the numbers when the person moves a lever or answers a constraint question. Pure code,
 * no models, so it is instant. The verdict code and numbers update; the copy is marked stale
 * and re-explained by `reexplain` when the person settles.
 */
export function recalculate(screen: DecisionScreen, facts: Fact[], change: { answers?: Record<string, string>; levers?: Record<string, number> }, data: FamilyData = {}) {
  const family = FAMILIES[screen.family];
  if (!family) throw new Error(`Unknown family ${screen.family}`);
  const answers = { ...screen.answers, ...change.answers };
  const levers = { ...screen.levers, ...change.levers };
  for (const [id, v] of Object.entries(change.levers ?? {})) {
    const l = screen.spec.levers.find((x) => x.id === id);
    if (!l || v < l.min || v > l.max) throw new Error(`Lever ${id} out of range`);
  }
  const calc = calculate(family, screen.spec, facts, answers, levers, data);
  const numbers = screenNumbers(family, calc, facts, screen.spec, levers);
  return { answers, levers, calc, numbers, visual: visualFor(family, calc, numbers), copyStale: true as const };
}

/** Re-write and re-check the copy after a recalculation. */
export async function reexplain(deps: PipelineDeps, screen: DecisionScreen, recalc: ReturnType<typeof recalculate>): Promise<ForkAnswer> {
  const family = FAMILIES[screen.family]!;
  const t = new Trace(deps);
  try {
    let feedback: string[] | undefined;
    for (let round = 0; round < 2; round++) {
      const copy = await explain(t, family, screen.question, screen.spec, recalc.calc, recalc.numbers, feedback);
      const v = await verify(t, family, screen.question, screen.spec, recalc.numbers, copy);
      if (v.ok) {
        const highlight = recalc.calc.constraints.find((c) => c.outcome !== 'pass')?.id ?? null;
        return {
          ...screen,
          answers: recalc.answers,
          levers: recalc.levers,
          calc: recalc.calc,
          numbers: recalc.numbers,
          visual: recalc.visual,
          layout: { ...screen.layout, highlightConstraint: highlight },
          copy,
          checks: { ...screen.checks, code: v.code, verifier: v.verifier, revised: [...screen.checks.revised, ...t.revised] },
          provenance: { ...screen.provenance, roles: [...screen.provenance.roles, ...t.roles] },
        };
      }
      feedback = [...v.code, ...v.verifier.issues.map((i) => `${i.kind}: ${i.detail}`)];
      t.revised.push(...feedback);
    }
    return BLOCKED;
  } catch (error) {
    if (error instanceof RoleFailedError) return failed(error.userMessage);
    throw error;
  }
}
