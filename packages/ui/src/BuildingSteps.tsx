'use client';

import type { BuildStep } from '@fork/pipeline';
import { ForkField } from './ForkField';

/** Steps in a typical answer, so the animation knows how far along it is. */
const TYPICAL_STEPS = 6;

/** Shown while a screen is built, so waiting feels like work being done. */
export function BuildingSteps({ steps, done }: { steps: BuildStep[]; done: boolean }) {
  return (
    <section className="fk-building" aria-label="Building your answer">
      <ForkField progress={done ? 1 : Math.min(0.95, (steps.length + 0.5) / TYPICAL_STEPS)} />
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
