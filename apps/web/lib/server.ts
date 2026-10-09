import 'server-only';
import { AnthropicProvider, anthropicApiKey, JsonLinesLogger, loadRegistry } from '@fork/models';
import { DEMO_FACTS, DemoModels, FAMILIES, gatherData, type DecisionScreen, type FactStore, type PipelineDeps, type Subject } from '@fork/pipeline';
import { answerLookup, DbFactStore } from '@fork/setup';
import { runRole } from '@fork/models';
import { database } from './db';
import { getViewer } from './viewer';

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
export async function asker(): Promise<{ subject: Subject; deps: PipelineDeps } | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.mode === 'demo') return { subject: viewer.subject, deps: pipelineDeps() };
  const facts: FactStore = new DbFactStore(database(), viewer.ctx);
  const base = pipelineDeps();
  const matcher = DEMO ? undefined : async (input: Parameters<typeof runRole<'lookup_matcher'>>[2]) => (await runRole(base.roles, 'lookup_matcher', input)).output;
  const lookup = (question: string) => answerLookup(database(), viewer.ctx, matcher, question);
  return { subject: viewer.subject, deps: { ...base, facts, lookup } };
}

/**
 * Screens built in this server process, by run id, with the subject that asked. Stands in for
 * the DecisionRun table (step 8). A screen is only ever returned to the person who asked.
 */
const g = globalThis as unknown as { forkScreens?: Map<string, { subject: Subject; screen: DecisionScreen }> };
const screens = (g.forkScreens ??= new Map());

export function saveScreen(subject: Subject, screen: DecisionScreen) {
  screens.set(screen.runId, { subject, screen });
}

export function loadScreen(subject: Subject, runId: string): DecisionScreen | null {
  const hit = screens.get(runId);
  if (!hit) return null;
  const same = hit.subject.companyId === subject.companyId && hit.subject.employeeId === subject.employeeId && hit.subject.audience === subject.audience;
  return same ? hit.screen : null;
}

export async function factsFor(deps: PipelineDeps, subject: Subject, screen: DecisionScreen) {
  const family = FAMILIES[screen.family]!;
  return { facts: await deps.facts.get(subject, family.facts.map((f) => f.id)), data: await gatherData(deps, family, subject) };
}
