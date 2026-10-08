import 'server-only';
import { AnthropicProvider, JsonLinesLogger, loadRegistry } from '@fork/models';
import { DEMO_FACTS, DEMO_SUBJECT, DemoModels, FAMILIES, type DecisionScreen, type PipelineDeps, type Subject } from '@fork/pipeline';

/** Demo mode when no API key is set: real engine and checks, templated wording. */
export const DEMO = !process.env.ANTHROPIC_API_KEY;

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
 * Who is asking. Until sign-in exists (step 6) every request is Ella at Larkfield, the
 * fictional demo employee. Never ship this past a pilot.
 */
export function currentSubject(): Subject {
  return DEMO_SUBJECT;
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

export async function factsFor(subject: Subject, screen: DecisionScreen) {
  const family = FAMILIES[screen.family]!;
  return pipelineDeps().facts.get(subject, family.facts.map((f) => f.id));
}
