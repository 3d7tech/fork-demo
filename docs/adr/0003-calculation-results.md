# 3. Calculation modules return every number the screen may show

Date: 2026-10-08 · Status: accepted

## Decision

- Modules are pure functions `(Rules, input) → CalcResult`, registered by id in `packages/calc/src/index.ts` (`MODULES`). A spec's `calculation.module` must name one.
- `CalcResult.outputs` is the complete list of numbers the explainer may quote, each with a unit, label and estimate flag. Figures the demo hard-coded in copy (the bonus "72p", the "about 62%" above £100,000, the electric car "about £800" employer saving) are now outputs.
- Each result carries its verdict code, tipping point, lever ranges where the verdict holds, constraint outcomes, assumptions with sources, and the rules used.

## Modelling choices to review

- Tax and NI are yearly approximations; payroll works per pay period. Differences are pennies for steady salaries, but irregular pay needs per-period modules later.
- Minimum wage check compares yearly pay after sacrifice with contracted hours × 52 at the 21-and-over rate. Age-band rates and pay-reference-period checks are open questions.
- The bonus module assumes every recipient earns above the employer NI threshold.
- Parental pay effect uses the 90% of average weekly earnings rule for the first six weeks only.
