// Evaluation suites per model role (brief: Quality and evaluation). Each suite runs the role as
// the product does, scores it against labelled cases and returns metrics with pass/fail against
// its threshold. Which model fills each role comes from the registry, so swapping a model is a
// config change (FORK_MODELS_CONFIG), never a code change.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryLogger, runRole, type ModelProvider, type Registry } from '@fork/models';
import { askFork, checkCopy, FAMILIES, familiesFor, guard, recalculate, type DecisionScreen } from '@fork/pipeline';
import { cleanFacts, keysFor, POLICY_KEYS, prepareDocument, typeLabel } from '@fork/setup';
import { DecisionSpec, type ScreenCopy } from '@fork/spec';
import { load, type DocumentSet, type LeverSet, type LookupSet, type RouterSet, type ScreenSet, type SpecSet, type VerifierSet } from './datasets';
import { FACTS, SUBJECTS } from './larkfield';

export interface Metric {
  name: string;
  value: number;
  threshold: number;
  /** 'min': value must be at least the threshold; 'max': at most. */
  kind: 'min' | 'max';
}

export interface SuiteResult {
  suite: string;
  metrics: Metric[];
  failures: string[];
  passed: boolean;
}

export interface EvalEnv {
  registry: Registry;
  provider: ModelProvider;
  log: MemoryLogger;
  /** Cases run at once. */
  concurrency: number;
}

const roles = (env: EvalEnv) => ({ registry: env.registry, providers: { anthropic: env.provider }, log: env.log });

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

const result = (suite: string, metrics: Metric[], failures: string[]): SuiteResult => ({
  suite,
  metrics,
  failures,
  passed: metrics.every((m) => (m.kind === 'min' ? m.value >= m.threshold : m.value <= m.threshold)),
});
const ratio = (a: number, b: number) => (b ? a / b : 1);

// ---------- Router (with the code guards in front, as in the product) ----------

export async function routerSuite(env: EvalEnv): Promise<SuiteResult> {
  const set = load<RouterSet>('router');
  const failures: string[] = [];
  let correct = 0;
  let distressCases = 0;
  let distressCaught = 0;
  let notDecision = 0;
  let falseConfidence = 0;
  await pool(set.cases, env.concurrency, async (c) => {
    const g = guard(c.question);
    let route: string;
    let family: string | null = null;
    let distress = g === 'distress';
    let confident = false;
    if (g) route = g === 'distress' ? 'distress' : 'human';
    else {
      try {
        const r = (await runRole(roles(env), 'router', { question: c.question, audience: c.audience, families: familiesFor(c.audience).map((f) => ({ family: f.id, description: f.description })) })).output;
        // As the pipeline does: a decision naming no family, a made-up one, or the other audience's is "not yet".
        const known = r.family ? FAMILIES[r.family] : undefined;
        route = r.distress ? 'distress' : r.route === 'decision' && (!known || known.audience !== c.audience) ? 'not_supported' : r.route;
        family = r.family;
        distress = r.distress;
        confident = r.route === 'decision' && r.confidence === 'high';
      } catch {
        route = 'failed';
      }
    }
    if (c.distress) {
      distressCases++;
      if (distress) {
        distressCaught++;
        correct++;
      } else failures.push(`distress missed: “${c.question}” → ${route}`);
      return;
    }
    const accept = c.accept ?? [c.route!];
    const ok = accept.includes(route as never) && (c.route !== 'decision' || family === c.family);
    if (ok) correct++;
    else failures.push(`“${c.question}” → ${route}${family ? ` (${family})` : ''}, expected ${accept.join(' or ')}${c.family ? ` (${c.family})` : ''}`);
    if (c.route !== 'decision') {
      notDecision++;
      if (confident) falseConfidence++;
    }
  });
  return result(
    'router',
    [
      { name: 'accuracy', value: ratio(correct, set.cases.length), threshold: set.threshold.accuracy, kind: 'min' },
      { name: 'distress_recall', value: ratio(distressCaught, distressCases), threshold: set.threshold.distress_recall, kind: 'min' },
      { name: 'false_confidence', value: ratio(falseConfidence, notDecision), threshold: set.threshold.false_confidence_max, kind: 'max' },
    ],
    failures,
  );
}

// ---------- Lever reader ----------

export async function leverSuite(env: EvalEnv): Promise<SuiteResult> {
  const set = load<LeverSet>('lever_reader');
  const failures: string[] = [];
  let right = 0;
  let total = 0;
  await pool(set.cases, env.concurrency, async (c) => {
    const levers = (FAMILIES[c.family]!.template.levers ?? []).map((l) => ({ id: l.id, label: l.label, unit: l.unit ?? 'count', min: l.min, max: l.max }));
    const out = (await runRole(roles(env), 'lever_reader', { question: c.question, levers })).output;
    for (const [id, want] of Object.entries(c.expect)) {
      total++;
      const got = out.values.find((v) => v.id === id)?.value ?? null;
      if (got === want) right++;
      else failures.push(`“${c.question}” ${id}: got ${got}, expected ${want}`);
    }
  });
  return result('lever_reader', [{ name: 'accuracy', value: ratio(right, total), threshold: set.threshold.accuracy, kind: 'min' }], failures);
}

// ---------- Lookup matcher ----------

export async function lookupSuite(env: EvalEnv): Promise<SuiteResult> {
  const set = load<LookupSet>('lookup_matcher');
  const label = (k: string) => POLICY_KEYS.find((p) => p.key === k)?.label ?? 'Next auto-enrolment re-enrolment date';
  const available = set.available.map((key) => ({ key, label: label(key) }));
  const failures: string[] = [];
  let right = 0;
  await pool(set.cases, env.concurrency, async (c) => {
    const keys = (await runRole(roles(env), 'lookup_matcher', { question: c.question, available })).output.keys;
    const got = keys[0] ?? null;
    if (got === c.expect) right++;
    else failures.push(`“${c.question}” → ${got}, expected ${c.expect}`);
  });
  return result('lookup_matcher', [{ name: 'accuracy', value: ratio(right, set.cases.length), threshold: set.threshold.accuracy, kind: 'min' }], failures);
}

// ---------- Document interpreter, including hidden instructions ----------

const policyKeyType = (key: string) => POLICY_KEYS.find((k) => k.key === key)?.type;

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../setup/fixtures');

export async function documentSuite(env: EvalEnv): Promise<SuiteResult> {
  const set = load<DocumentSet>('document_interpreter');
  const failures: string[] = [];
  let facts = 0;
  let factsRight = 0;
  let pages = 0;
  let pagesRight = 0;
  let injected = 0;
  let flagged = 0;
  await pool(set.cases, env.concurrency, async (c) => {
    const prepared = await prepareDocument(c.file, new Uint8Array(readFileSync(join(fixtures, c.file))));
    const out = (await runRole(roles(env), 'document_interpreter', { kind: c.kind, keys: keysFor(c.kind).map((k) => ({ key: k.key, description: k.description, type: typeLabel(k.type) })) }, { document: prepared.document })).output;
    const got = cleanFacts(c.kind, out);
    for (const [key, want] of Object.entries(c.expect)) {
      facts++;
      const g = got.find((x) => x.key === key);
      // Text facts are summaries, so they match when they contain the expected words.
      const same = g && (typeof want === 'string' && typeof g.value === 'string' && policyKeyType(key) === 'text' ? g.value.toLowerCase().includes(want.toLowerCase()) : g.value === want);
      if (same) factsRight++;
      else failures.push(`${c.file} ${key}: got ${JSON.stringify(g?.value)}, expected ${JSON.stringify(want)}`);
    }
    for (const [key, page] of Object.entries(c.pages ?? {})) {
      pages++;
      if (got.find((x) => x.key === key)?.page === page) pagesRight++;
      else failures.push(`${c.file} ${key}: wrong page`);
    }
    for (const [key, bad] of Object.entries(c.forbid ?? {})) if (got.some((x) => x.key === key && x.value === bad)) failures.push(`${c.file}: obeyed a hidden instruction (${key} = ${bad})`);
    if (c.instructionsFound) {
      injected++;
      const obeyed = Object.entries(c.forbid ?? {}).some(([key, bad]) => got.some((x) => x.key === key && x.value === bad));
      if (out.instructionsFound && !obeyed) flagged++;
      else failures.push(`${c.file}: hidden instruction not flagged or obeyed`);
    }
  });
  return result(
    'document_interpreter',
    [
      { name: 'fact_accuracy', value: ratio(factsRight, facts), threshold: set.threshold.fact_accuracy, kind: 'min' },
      { name: 'page_accuracy', value: ratio(pagesRight, pages), threshold: set.threshold.page_accuracy, kind: 'min' },
      { name: 'injection_flagged', value: ratio(flagged, injected), threshold: set.threshold.injection_flagged, kind: 'min' },
    ],
    failures,
  );
}

// ---------- Whole screens: composer, explainer and verifier together, with time and cost ----------

export async function screenSuite(env: EvalEnv, keep?: DecisionScreen[]): Promise<SuiteResult> {
  const set = load<ScreenSet>('screens');
  const failures: string[] = [];
  let shown = 0;
  let firstPass = 0;
  const seconds: number[] = [];
  const costs: number[] = [];
  // Sequential: timing is part of what's measured.
  for (const c of set.cases) {
    const log = new MemoryLogger();
    const started = performance.now();
    const a = await askFork({ roles: { ...roles(env), log }, facts: FACTS }, { question: c.question, subject: SUBJECTS[c.subject]! });
    seconds.push((performance.now() - started) / 1000);
    costs.push(log.entries.reduce((s, e) => s + (e.costUsd ?? 0), 0));
    env.log.entries.push(...log.entries);
    if (a.kind === 'decision' && a.family === c.family) {
      shown++;
      if (!a.checks.revised.length) firstPass++;
      keep?.push(a);
    } else failures.push(`“${c.question}” → ${a.kind === 'message' ? a.reason : a.family}`);
  }
  const sorted = [...seconds].sort((a, b) => a - b);
  return result(
    'screens',
    [
      { name: 'shown', value: ratio(shown, set.cases.length), threshold: set.threshold.shown, kind: 'min' },
      { name: 'first_pass_verifier', value: ratio(firstPass, set.cases.length), threshold: set.threshold.first_pass_verifier, kind: 'min' },
      { name: 'p50_seconds', value: sorted[Math.floor(sorted.length / 2)] ?? 0, threshold: set.threshold.p50_seconds, kind: 'max' },
      { name: 'max_cost_usd_each', value: Math.max(0, ...costs), threshold: set.threshold.max_cost_usd_each, kind: 'max' },
    ],
    failures,
  );
}

// ---------- Verifier: seeded faults in real screens ----------

type Fault = { name: string; copy: ScreenCopy; screen: DecisionScreen };

/** Faulty versions of a good screen. Each is something the verifier must block. */
export function seedFaults(screen: DecisionScreen, faults: string[]): Fault[] {
  const out: Fault[] = [];
  const nums = screen.numbers.filter((n) => n.key in screen.calc.outputs && n.display.startsWith('£'));
  const [a, b] = [nums[0], nums.find((n) => n.display !== nums[0]?.display && n.label !== nums[0]?.label)];
  const add = (name: string, copy: Partial<ScreenCopy>, s = screen) => faults.includes(name) && out.push({ name, copy: { ...screen.copy, ...copy }, screen: s });
  if (a && b) add('wrong_number_meaning', { verdict: `${b.label}: ${a.display}.` });
  add('advice', { why: 'Do it today. Anyone with sense would, and you’ll regret waiting.' });
  add('wrong_source', { assumptions: screen.copy.assumptions.map((x) => ({ ...x, source: 'an estimate' })) });
  add('invented_number', { verdict: 'That’s about £1,234 more over five years.' });
  // A caution the copy doesn't mention: answer a constraint question that changes the advice, keep the old words.
  const ask = screen.spec.constraints.find((c) => c.kind === 'ask' && c.effect === 'caution');
  if (ask && ask.kind === 'ask') {
    const yes = ask.answers.find((x) => x.id === 'yes')?.id ?? ask.answers[1]?.id;
    if (yes) {
      const r = recalculate(screen, screen.spec.facts, { answers: { [ask.id]: yes } });
      if (r.calc.constraints.some((c) => c.outcome === 'caution')) add('missing_caution', {}, { ...screen, ...r, answers: r.answers });
    }
  }
  return out;
}

export async function verifierSuite(env: EvalEnv, screens: DecisionScreen[]): Promise<SuiteResult> {
  const set = load<VerifierSet>('verifier');
  const failures: string[] = [];
  const cases = screens.flatMap((s) => seedFaults(s, set.faults));
  const run = async (s: DecisionScreen, copy: ScreenCopy) => {
    const code = checkCopy(copy, s.numbers);
    const family = FAMILIES[s.family]!;
    const v = (await runRole(roles(env), 'verifier', { question: s.question, audience: family.audience, spec: s.spec, constraints: s.calc.constraints, numbers: s.numbers, copy, codeFindings: code })).output;
    return { code: code.length > 0, model: !v.pass };
  };
  let caught = 0;
  let modelCaught = 0;
  await pool(cases, env.concurrency, async (f) => {
    const r = await run(f.screen, f.copy);
    if (r.code || r.model) caught++;
    else failures.push(`${f.name} in ${f.screen.family} not caught`);
    if (r.model) modelCaught++;
  });
  let falseAlarms = 0;
  await pool(screens, env.concurrency, async (s) => {
    if ((await run(s, s.copy)).model) {
      falseAlarms++;
      failures.push(`false alarm on a good ${s.family} screen`);
    }
  });
  return result(
    'verifier',
    [
      { name: 'catch_rate', value: ratio(caught, cases.length), threshold: set.threshold.catch_rate, kind: 'min' },
      { name: 'model_catch_rate', value: ratio(modelCaught, cases.length), threshold: 0, kind: 'min' },
      { name: 'false_alarm', value: ratio(falseAlarms, screens.length), threshold: set.threshold.false_alarm_max, kind: 'max' },
    ],
    failures,
  );
}

// ---------- Spec writer, when the verifier sends work back ----------

export async function specSuite(env: EvalEnv): Promise<SuiteResult> {
  const set = load<SpecSet>('spec_writer');
  const failures: string[] = [];
  let valid = 0;
  let module = 0;
  await pool(set.cases, env.concurrency, async (c) => {
    const family = FAMILIES[c.family]!;
    const subject = SUBJECTS[c.subject]!;
    const facts = await FACTS.get(subject, family.facts.map((f) => f.id));
    const out = (await runRole(roles(env), 'spec_writer', { question: c.question, audience: family.audience, family: family.id, template: { ...family.template, question: c.question }, facts, feedback: c.feedback })).output;
    const parsed = DecisionSpec.safeParse({ ...out, question: c.question, facts });
    if (parsed.success) valid++;
    else failures.push(`${c.family}: invalid spec (${parsed.error.issues.map((i) => i.path.join('.')).join(', ')})`);
    if (out.calculation?.module === family.module) module++;
    else failures.push(`${c.family}: module ${out.calculation?.module}`);
  });
  return result(
    'spec_writer',
    [
      { name: 'valid_rate', value: ratio(valid, set.cases.length), threshold: set.threshold.valid_rate, kind: 'min' },
      { name: 'correct_module', value: ratio(module, set.cases.length), threshold: set.threshold.correct_module, kind: 'min' },
    ],
    failures,
  );
}

/** Latency and cost per role from the calls made during the run. */
export function costAndSpeed(log: MemoryLogger) {
  const by = new Map<string, { calls: number; cost: number; ms: number[] }>();
  for (const e of log.entries) {
    const r = by.get(e.role) ?? { calls: 0, cost: 0, ms: [] };
    r.calls++;
    r.cost += e.costUsd ?? 0;
    r.ms.push(e.latencyMs);
    by.set(e.role, r);
  }
  return [...by.entries()].map(([role, r]) => {
    const ms = r.ms.sort((a, b) => a - b);
    return { role, calls: r.calls, costUsd: r.cost, p50ms: ms[Math.floor(ms.length / 2)] ?? 0, p95ms: ms[Math.floor(ms.length * 0.95)] ?? 0 };
  });
}
