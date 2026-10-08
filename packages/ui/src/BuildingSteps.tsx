import type { BuildStep } from '@fork/pipeline';

/** Shown while a screen is built, so waiting feels like work being done. */
export function BuildingSteps({ steps, done }: { steps: BuildStep[]; done: boolean }) {
  return (
    <section className="fk-building" aria-label="Building your answer">
      <ol aria-live="polite">
        {steps.map((s) => (
          <li key={s.id} className="fk-step-done">
            <span className="fk-dot" aria-hidden="true" />
            <span>
              <b>{s.label}</b>
              {s.detail ? `: ${s.detail}` : ''}
            </span>
          </li>
        ))}
        {!done && (
          <li className="fk-step-working">
            <span className="fk-dot" aria-hidden="true" />
            <span>Working…</span>
          </li>
        )}
      </ol>
    </section>
  );
}
