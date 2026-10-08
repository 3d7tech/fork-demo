# 1. Stack and repository layout

Date: 2026-10-08 · Status: accepted

## Decision

- TypeScript monorepo with pnpm workspaces, in this repository. The demo moves to `demo/`; a root `index.html` redirects so https://3d7tech.github.io/fork-demo/ keeps working.
- Zod for every schema shared between models and code; JSON Schema is generated from it for model structured output.
- `decimal.js` for all money arithmetic. Results keep full precision; rounding to whole pounds (half up) happens only for display and golden tests.
- Vitest for unit and golden tests.
- Later steps (not built yet): Next.js web app, PostgreSQL with Drizzle and row-level security, pg-boss jobs, AWS London region.

## Options considered

- A separate product repo (`3d7tech/fork`): rejected by the product owner. The product lives here.
- Plain JavaScript numbers: rejected; floating-point drift would break "to the pound" golden tests at the edges.
