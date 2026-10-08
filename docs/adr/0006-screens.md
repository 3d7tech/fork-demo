# 6. Screens: component library and web app

Date: 2026-10-08 · Status: accepted

## Decision

- **`packages/ui`**: React components that render a `DecisionScreen` in the brief's fixed order: question header, constraint panel, verdict, levers, outcome tiles, visual, "How this was worked out", action, guidance note. Plus building steps and a message card. Components choose nothing: the composer's layout and the engine's results decide what shows.
- **Visuals** render `VisualData` that code builds from the results (each family's `visual()`), never a model: bars (before-and-after and side-by-side), threshold ladder, change checklist and saving flow. Every bar has its value written out and a key with text, so nothing depends on colour.
- **Styling**: one stylesheet (`fork.css`) with tokens on `:root`, the demo's palette and IBM Plex type, light and dark themes (`prefers-color-scheme`, overridable with `data-theme`), and `--fk-accent` for a company's brand colour. Mobile first; tested at 360px.
- **`apps/web`**: Next.js 15. `/api/ask` streams building steps then the answer; `/api/recalculate` re-runs numbers instantly in code; `/api/reexplain` rewrites the words 700 ms after the person settles; `/api/action` confirms the next step (sending to the accountant is step 8). `/preview` shows every screen state.
- **Demo mode**: with no `ANTHROPIC_API_KEY`, a stand-in replaces the models. The engine, the code checks and the pipeline are real; the wording is templated and the page says so.

## Accessibility

Playwright runs axe (WCAG 2.0, 2.1 and 2.2 A and AA) on every screen state in light and dark at 360px, checks there is no sideways scrolling, and drives the lever with the keyboard. Choices are buttons with `aria-pressed`; sliders have labels and spoken values; the verdict is a polite live region; the method section is a native disclosure; motion stops under `prefers-reduced-motion`.

## Not yet

- Sign-in: every request is the demo employee until step 6. `currentSubject()` is the one place to change.
- Screens are kept in server memory until the DecisionRun table exists (step 8).
- The screen reads the question back and quotes the person; screen-reader testing with real users is still needed.
