import { describe, expect, it } from 'vitest';
import { loadRegistry, MemoryLogger } from '@fork/models';
import { VisualData } from '@fork/spec';
import { askFork, DemoModels, GALLERY, GALLERY_FACTS, type DecisionScreen } from '../src';

const deps = { roles: { registry: loadRegistry(), providers: { anthropic: new DemoModels() }, log: new MemoryLogger() }, facts: GALLERY_FACTS };

/** Every figure a visual shows, wherever it sits in the data. */
function displays(x: unknown): string[] {
  if (Array.isArray(x)) return x.flatMap(displays);
  if (x && typeof x === 'object') return Object.entries(x).flatMap(([k, v]) => (k === 'display' && typeof v === 'string' ? [v] : displays(v)));
  return [];
}

describe('one visual per decision (ADR 0012)', () => {
  it('no two decisions share a visual', () => {
    expect(new Set(GALLERY.map((g) => g.visual)).size).toBe(GALLERY.length);
  });

  it.each(GALLERY.map((g) => [g.question, g.visual, g] as const))('%s → %s', async (_q, type, g) => {
    const s = (await askFork(deps, { question: g.question, subject: g.subject })) as DecisionScreen;
    expect(s.kind, JSON.stringify(s).slice(0, 300)).toBe('decision');
    expect(s.visual.type).toBe(type);
    expect(() => VisualData.parse(s.visual)).not.toThrow();
    // Every figure on the picture is one the engine produced and the screen formatted (a sign may be dropped).
    const shown = new Set(s.numbers.map((n) => n.display));
    for (const d of displays(s.visual)) expect(shown.has(d) || shown.has(`−${d}`), `${d} is not an engine number`).toBe(true);
  });
});
