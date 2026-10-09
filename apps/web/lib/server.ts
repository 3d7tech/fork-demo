import 'server-only';
import { AnthropicProvider, anthropicApiKey, JsonLinesLogger, loadRegistry } from '@fork/models';
import { DEMO_FACTS, DemoModels, FAMILIES, type DecisionScreen, type FactStore, type PipelineDeps, type Subject } from '@fork/pipeline';
import { DbFactStore } from '@fork/setup';
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
  return { subject: viewer.subject, deps: { ...pipelineDeps(), facts } };
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
  return deps.facts.get(subject, family.facts.map((f) => f.id));
}
