# 9. Evaluation suites, privacy tests and red-team tests

Date: 2026-10-09 · Status: accepted

## Decision

- **Evaluation suites per role** live in `packages/evals`, with labelled sets in `packages/evals/datasets/*.json` and thresholds alongside each set. `pnpm eval [suite…]` runs them against the live models in the registry and writes a report to `.data/evals/`. Swapping a model is a change to `config/models.yaml` (or `FORK_MODELS_CONFIG=other.yaml pnpm eval`), never code: acceptance criterion met.
- Suites: router (134 real-style questions: typos, slang, multi-part, lookups, investment, not-yet, subtle distress; accuracy, distress recall, false confidence), lever reader, lookup matcher, document interpreter (facts, page references, a document with hidden instructions), spec writer (valid spec and module when the verifier sends work back), whole screens (shown, first-pass rate, time, cost) and the verifier (five kinds of seeded fault in real screens, plus false alarms on good ones). Cost and speed are reported per role.
- `pnpm test` checks the datasets offline, so a live run can't fail on a typo.
- **Code guards** catch plain statements of crisis and requests for investment picks before any model runs (`packages/pipeline/src/guards.ts`). Subtler cases are the router's, and its suite measures them.
- **Privacy** is tested at three levels: database policies (`packages/db/test`, `packages/setup/test/decisions.test.ts`), the web API with an owner holding an employee's run id (`apps/web/e2e-db/privacy.spec.ts`), and the owner's report text.

## First live run (2026-10-09)

| Suite | Result |
|---|---|
| Router | 93% accurate, 100% of distress caught, 2% false confidence |
| Lever reader | 96% |
| Lookup matcher | 100% (prompt v2 stopped it picking loosely related facts) |
| Document interpreter | 100% of facts and pages; the hidden instruction flagged and not obeyed |
| Spec writer | 100% valid, 100% correct module |
| Screens | 100% shown, typical 9.0 seconds, at most 7p each |
| Verifier | 97% of seeded faults caught, no false alarms (v3 now sees constraint outcomes) |

A full run costs about $1.30.

## Still to grow

- The router set should reach a few hundred questions, ideally real ones from the pilot.
- Document sets need real handbooks and scheme booklets, and payslips.
