import { askFork, DemoModels, GALLERY, GALLERY_FACTS } from '@fork/pipeline';
import { loadRegistry, MemoryLogger } from '@fork/models';
import { DecisionScreenView, MessageCard } from '@fork/ui';

export const dynamic = 'force-dynamic';

/** Every decision with its own visual, built by the real pipeline in demo mode (ADR 0012). */
export default async function VisualsPreview() {
  const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new DemoModels() }, log: new MemoryLogger() }, facts: GALLERY_FACTS };
  const screens = await Promise.all(GALLERY.map((g) => askFork(deps, { question: g.question, subject: g.subject })));
  return (
    <>
      <h1 className="fk-sr-only">Every decision, with its visual</h1>
      {screens.map((s, i) => (
        <div key={i} id={GALLERY[i]!.visual}>
          <p className="preview-label">
            {GALLERY[i]!.subject.audience === 'owner' ? 'Owner' : 'Employee'}: {GALLERY[i]!.visual}
          </p>
          {s.kind === 'decision' ? <DecisionScreenView screen={s} /> : <MessageCard message={s} />}
        </div>
      ))}
    </>
  );
}
