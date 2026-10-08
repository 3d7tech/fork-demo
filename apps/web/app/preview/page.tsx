import { askFork, DEMO_FACTS, DEMO_SUBJECT, DemoModels, FAMILIES, recalculate, reexplain, type DecisionScreen } from '@fork/pipeline';
import { loadRegistry, MemoryLogger } from '@fork/models';
import { BuildingSteps, DecisionScreenView, MessageCard } from '@fork/ui';

export const dynamic = 'force-dynamic';

/** Every state of the screen grammar, built by the real pipeline in demo mode. For review and accessibility tests. */
export default async function Preview() {
  const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new DemoModels() }, log: new MemoryLogger() }, facts: DEMO_FACTS };
  const ask = (question: string) => askFork(deps, { question, subject: DEMO_SUBJECT });

  const base = (await ask('is salary sacrifice worth it or is there a catch')) as DecisionScreen;
  const family = FAMILIES[base.family]!;
  const facts = await DEMO_FACTS.get(DEMO_SUBJECT, family.facts.map((f) => f.id));
  const caution = await reexplain(deps, base, recalculate(base, facts, { answers: { mortgage_12m: 'yes' } }));
  const messages = await Promise.all(['where is my p60', 'which fund should I pick', 'can’t afford rent this month', 'should I buy extra holiday'].map(ask));

  return (
    <>
      <h1 className="fk-sr-only">Screen previews</h1>
      <p className="preview-label">Decision</p>
      <DecisionScreenView screen={base} />
      <p className="preview-label">Decision, after answering a question that changes the advice</p>
      {caution.kind === 'decision' ? <DecisionScreenView screen={caution} actionDone="Request ready for your accountant." /> : <MessageCard message={caution} />}
      <p className="preview-label">Building steps</p>
      <BuildingSteps steps={[{ id: 'understood', label: 'Understood the question', detail: family.description }, { id: 'facts', label: family.steps.facts }]} done={false} />
      {messages.map((m, i) =>
        m.kind === 'message' ? (
          <div key={i}>
            <p className="preview-label">Message: {m.reason}</p>
            <MessageCard message={m} />
          </div>
        ) : null,
      )}
    </>
  );
}
