# 5. The decision pipeline

Date: 2026-10-08 · Status: accepted

## Decision

`askFork` (`packages/pipeline`) turns a question into either a checked `DecisionScreen` or a fixed, human-written message.

1. **Router** picks the route. Distress, "needs a person", lookups and unsupported decisions return fixed messages (`messages.ts`) and never reach a decision screen. A family the router names that doesn't exist, or belongs to the other audience, counts as unsupported. Low confidence asks the person to clarify.
2. **Facts** come from a `FactStore` (code, ADR 0004). A missing fact returns "Fork needs a little more information"; nothing is guessed.
3. **Spec writer** returns a draft spec. Code then replaces its facts with the gathered facts, validates the full `DecisionSpec`, and checks it against the family: family, module, rule pack, levers and constraint questions the module understands, and the minimum-wage constraint. Problems go back once as feedback. If it still fails, the family's reviewed template is used and the fallback is recorded.
4. **Calculation** runs the family's module. Every number the screen may show is listed in `numbers`: engine outputs, the facts used, the rule values used and the tipping point, each formatted once (`format.ts`).
5. **Screen composer and explainer run in parallel.** A layout naming anything not in the spec or results falls back to the family's default layout.
6. **Checks.** Code checks first (`checks.ts`): every number in the copy must match a number in `numbers` of the same kind (£, %, or a bare number such as a year); estimates must be introduced with "about"; a short list of advice phrases is blocked. Then the model verifier, which sees the code findings.
7. **One revision round.** Each problem goes back to the step that can fix it: code findings and wording to the explainer, layout to the composer, missing options or constraints to the spec writer (which re-runs the calculation and both later steps). Only the steps sent work re-run. A second failure, or an issue only a person can fix, returns "Fork couldn't check this answer" instead of a screen.

Moving a lever or answering a constraint question calls `recalculate` (code only, instant, range-checked), then `reexplain` re-writes and re-checks the copy when the person settles.

## Families

A family (`packages/pipeline/src/families`) declares its router description, spec template, calculation module, required facts, the constraint answers and levers its module understands, how to build the module input, a default layout and its building-step labels. `pension.salary_sacrifice_switch` is the first. Adding a family should need no pipeline change; step 10 tests that.

## Consequences

- The verifier sees the full spec, including the facts, so it can check sources. Every other role sees only what it needs.
- The copy can't contain a number the engine didn't produce, which is acceptance criterion "the verifier blocks any screen whose copy contains a number not in the results". It is enforced in code, not left to a model.
- Timing against the 10-second target can only be measured with a key: `pnpm smoke:models` prints it.
