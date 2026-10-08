# Fork: project memory

Read this first in every session. Last updated 2026-10-08.

Fork (3d7 Technologies) helps employees of small UK companies (20 to 100 people) decide about pay, pensions and benefits, and saves the employer National Insurance through salary sacrifice. The full brief is [`BUILD_PROMPT.md`](BUILD_PROMPT.md); its principles are non-negotiable. Product owner: Richard Awe (richard.awe@3d7tech.com).

## Where things stand

Work is on branch **`phase1/milestone-a`** (pushed; no pull request yet). The brief's Phase 1 build order:

| Step | What | Status |
|---|---|---|
| 1 | Rule pack and calculation modules, golden tests | Done |
| 2 | Decision spec schema | Done |
| 3 | Model registry, role interfaces, prompts, logging | Done |
| 4 | Pipeline end to end for "switch to salary sacrifice" | Done |
| 5 | Component library and screen grammar, web app | Done |
| 6 | Company setup: payroll upload and column mapping, documents, invites, email sign-in | **In progress.** Data model agreed in ADR 0007 |
| 7 | Remaining owner and employee decisions, lookups, "not yet" | To do |
| 8 | Saved decisions, accountant requests, owner dashboard, monthly email | To do |
| 9 | Privacy enforcement tests, evaluation suites, red-team tests | To do |
| 10 | "How to add a decision family" guide, tested by adding one | To do |

**Model key:** `FORK_ANTHROPIC_API_KEY` in the Default environment (`ANTHROPIC_API_KEY` is reserved for Claude Code). The live check passed on 2026-10-08; `pnpm smoke:models` re-runs it. Never print, log or commit the key. Live screenshots are in `docs/screens/`.

## Layout

| Path | What |
|---|---|
| `demo/index.html` | Original single-file demo (GitHub Pages; root `index.html` redirects to it). Reference only. |
| `packages/rules` | Rule packs as dated, sourced data (`packs/uk-2026-27.json`, **draft**) |
| `packages/calc` | Pure calculation modules (`MODULES`), golden tests |
| `packages/spec` | Zod schemas: `DecisionSpec`/`DecisionSpecDraft`, `Fact`, `CalcResult`, `ScreenLayout`, `ScreenCopy`, `VisualData` |
| `packages/models` | `config/models.yaml` registry, `runRole`, prompts in `prompts/<role>/v1.md` |
| `packages/pipeline` | `askFork`, `recalculate`, `reexplain`, families, code checks, fixed messages, demo mode |
| `packages/ui` | React screen components and `fork.css` |
| `apps/web` | Next.js 15 app; `/preview` shows every screen state |
| `docs/adr/` | Decision records 0001 to 0006: read before changing architecture |
| `docs/open-questions.md` | Answers given and questions still open |

## Commands

```sh
pnpm install
pnpm test            # unit and golden tests (110)
pnpm typecheck
pnpm e2e             # builds the web app, Playwright + axe at 360px, light and dark (12)
pnpm --filter web dev
pnpm smoke:models    # live pipeline on four questions, needs a working Anthropic key
```

Playwright uses the preinstalled Chromium at `/opt/pw-browsers/chromium-1194` (`@playwright/test` pinned to 1.56.1). Don't run `playwright install`.

## Decisions made with Richard (2026-10-08)

- Fork's fee is a company setting; tests use £4 per employee per month.
- Payroll exports must include contracted hours.
- Employer pension basis is set per scheme (full salary or qualifying earnings).
- Employment Allowance is modelled; connected and sole-director companies come later.
- Numbers in wording always come from the engine (no fixed "72p" or "62%").
- The product lives in this repo; the demo moved to `demo/`.
- Anthropic models for every role. The verifier runs on a different model (Sonnet 5.5) from the spec writer (Opus 5.5).
- No real payroll samples or pilot company yet; use Larkfield from the demo.
- Wording is reviewed as we go.
- 2029 salary sacrifice cap: law passed (NICs (Employer Pensions Contributions) Act 2026), £2,000 set by regulations. It applies to employee and employer NI and is stored as `legislated`.
- Electric car benefit-in-kind: 4%, 5%, 7%, 9% for 2026-27 to 2029-30; the demo's 5.33% is the average of the first three.

## Rules for working here

- Models never do arithmetic. Every number on screen comes from `packages/calc` and is listed in the screen's `numbers`. `checkCopy` blocks any other number.
- Code owns facts: the spec writer returns a draft and code fills in the gathered facts.
- Never invent a tax rule, rate or threshold. Add it to `docs/open-questions.md` with the source needed. Rule packs change only with a person's review.
- Role inputs are strict, so a role never receives data it doesn't need. Logs hold no personal data.
- Distress, investment questions, lookups and unsupported questions get fixed, human-written replies (`packages/pipeline/src/messages.ts`), never a model's.
- Each significant choice gets a record in `docs/adr/`. Small reviewed changes, each with tests. Nothing merges with a failing golden test.
- Copy is plain British English: short, warm and specific, with £1,234 formatting.
- Don't put model names in commits, PRs or code comments.
- The person following this work is usually on a phone: keep updates short and plain.

## Known placeholders

- Every request is "Ella Brooks at Larkfield" (`currentSubject()` in `apps/web/lib/server.ts`) until sign-in exists.
- Screens are kept in server memory until the DecisionRun table exists (step 8).
- The action button confirms the next step but sends nothing (step 8).
- Only one decision family exists: `pension.salary_sacrifice_switch`. The calc modules for the other five golden cases exist but have no family yet (step 7).
