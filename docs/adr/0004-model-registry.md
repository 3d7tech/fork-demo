# 4. Model registry and role runner

Date: 2026-10-08 · Status: accepted

## Decision

- `config/models.yaml` maps each role to a primary model, a fallback, an effort level, token and latency limits, and prices for cost logging. `FORK_MODELS_CONFIG` points at another file, so an evaluation can swap models with no code change.
- Product code calls `runRole(ctx, role, input)` (`packages/models`). Nothing else imports a provider SDK.
- Each role has a strict input schema, a Zod output schema and a versioned prompt (`packages/models/prompts/<role>/<version>.md`, after the shared rules in `shared.md`).
- **Strict inputs enforce data minimisation.** A field a role was not designed for is rejected before any model call; the router has no field for pay.
- **Output handling:** the provider constrains output to a JSON Schema derived from the Zod schema (keywords constrained decoding may not support are dropped), then Zod validates the full schema. Invalid output is retried once on the same model with the validation errors, then the fallback model runs, then the run fails with a safe message for the person. Refusals, truncation and API errors skip straight to the fallback.
- **Server-side refusal fallback** (`fallbacks: "default"`) is on for Opus 5.5 and Sonnet 5.5 entries; the log records which model actually answered.
- **Logging:** each call records role, prompt version, model requested and served, attempt, latency, tokens, cost and outcome. Never question text, inputs or outputs; validation failures log paths and codes only.
- **All Anthropic** (product decision). The verifier runs on a different model (Sonnet 5.5) from the spec writer (Opus 5.5), with a different prompt, so their mistakes are less likely to coincide.

## Roles not yet built

- **Data gatherer.** Proposed for Phase 1: deterministic code that loads the facts a family's spec template declares, from payroll, scheme and company settings, each with its source. A model with tools adds little while every fact comes from our own database, and code can't invent a fact. It becomes a model role when live data and news arrive (Phase 4).
- **Document interpreter.** Built with company setup (step 6), since it runs at upload time.
