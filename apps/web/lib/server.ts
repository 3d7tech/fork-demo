import 'server-only';
import { AnthropicProvider, anthropicApiKey, JsonLinesLogger, loadRegistry } from '@fork/models';
import { DEMO_FACTS, DemoModels, FAMILIES, factIds, gatherData, type DecisionScreen, type FactStore, type ForkAnswer, type PipelineDeps, type Subject } from '@fork/pipeline';
import { answerLookup, DbFactStore, loadRun, recordRun, updateRun } from '@fork/setup';
import { runRole } from '@fork/models';
import { database } from './db';
import { getViewer, type Viewer } from './viewer';

/** Demo mode when no API key is set: real engine and checks, templated wording. */
export const DEMO = !anthropicApiKey();

let deps: PipelineDeps | undefined;
export function pipelineDeps(): PipelineDeps {
  deps ??= {
    roles: {
      registry: loadRegistry(),
      providers: { anthropic: DEMO ? new DemoModels() : new AnthropicProvider() },
      log: new JsonLinesLogger(),
    },
    facts: DEMO_FACTS,
  };
  return deps;
}

/**
 * Who is asking, and the pipeline set up to read their facts. In demo mode that is Ella at
 * Larkfield; with a database it is the signed-in person, reading through row-level security.
 */
export async function asker(): Promise<{ subject: Subject; deps: PipelineDeps; viewer: Viewer } | null> {
  const viewer = await getViewer();
  if (!viewer || viewer.role === 'accountant') return null;
  if (viewer.mode === 'demo') return { subject: viewer.subject, deps: pipelineDeps(), viewer };
  const facts: FactStore = new DbFactStore(database(), viewer.ctx);
  const base = pipelineDeps();
  const matcher = DEMO ? undefined : async (input: Parameters<typeof runRole<'lookup_matcher'>>[2]) => (await runRole(base.roles, 'lookup_matcher', input)).output;
  const lookup = (question: string) => answerLookup(database(), viewer.ctx, matcher, question, viewer.subject.employeeId);
  return { subject: viewer.subject, deps: { ...base, facts, lookup }, viewer };
}

type Asker = NonNullable<Awaited<ReturnType<typeof asker>>>;

/**
 * Demo mode keeps screens in this server's memory. With a database every answer is a
 * decision_run row, readable by the person who asked (and, for company decisions, by owners).
 */
const g = globalThis as unknown as { forkScreens?: Map<string, { subject: Subject; screen: DecisionScreen }> };
const screens = (g.forkScreens ??= new Map());

export async function saveAnswer(who: Asker, question: string, answer: ForkAnswer): Promise<void> {
  if (who.viewer.mode === 'demo') {
    if (answer.kind === 'decision') screens.set(answer.runId, { subject: who.subject, screen: answer });
    return;
  }
  await recordRun(database(), who.viewer.ctx, { question, answer, employeeId: who.subject.employeeId ?? null });
}

export async function updateScreen(who: Asker, screen: DecisionScreen): Promise<void> {
  if (who.viewer.mode === 'demo') return void screens.set(screen.runId, { subject: who.subject, screen });
  await updateRun(database(), who.viewer.ctx, screen.runId, screen);
}

export async function loadScreen(who: Asker, runId: string): Promise<DecisionScreen | null> {
  if (who.viewer.mode === 'db') {
    const a = await loadRun<ForkAnswer>(database(), who.viewer.ctx, runId);
    return a?.kind === 'decision' ? a : null;
  }
  const hit = screens.get(runId);
  if (!hit) return null;
  const same = hit.subject.companyId === who.subject.companyId && hit.subject.employeeId === who.subject.employeeId && hit.subject.audience === who.subject.audience;
  return same ? hit.screen : null;
}

export async function factsFor(deps: PipelineDeps, subject: Subject, screen: DecisionScreen) {
  const family = FAMILIES[screen.family]!;
  return { facts: await deps.facts.get(subject, factIds(family)), data: await gatherData(deps, family, subject) };
}
