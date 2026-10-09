# Fork: project memory

Read this first in every session. Last updated 2026-10-09 (late evening).

Fork (3d7 Technologies) helps employees of small UK companies (20 to 100 people) decide about pay, pensions and benefits, and saves the employer National Insurance through salary sacrifice. The full brief is [`BUILD_PROMPT.md`](BUILD_PROMPT.md); its principles are non-negotiable. Product owner: Richard Awe (richard.awe@3d7tech.com).

## Where things stand

Work is on branch **`phase1/milestone-a`** (pushed; no pull request yet). Phase 1 is built; see [`docs/phase-1-report.md`](docs/phase-1-report.md) for what's done, the acceptance criteria and what's deferred. The brief's Phase 1 build order:

| Step | What | Status |
|---|---|---|
| 1 | Rule pack and calculation modules, golden tests | Done |
| 2 | Decision spec schema | Done |
| 3 | Model registry, role interfaces, prompts, logging | Done |
| 4 | Pipeline end to end for "switch to salary sacrifice" | Done |
| 5 | Component library and screen grammar, web app | Done |
| 6 | Company setup: payroll upload and column mapping, documents, invites, email sign-in | Done |
| 7 | Remaining owner and employee decisions, lookups, "not yet" | Done: 7 families (3 owner, 4 employee; cycle to work added in step 10), lookups from confirmed documents, "not yet" with what Fork can do |
| 8 | Saved decisions, accountant requests, owner dashboard, monthly email | Done (ADR 0008) |
| 9 | Privacy enforcement tests, evaluation suites, red-team tests | Done (ADR 0009) |
| 10 | "How to add a decision family" guide, tested by adding one | Done: `docs/adding-a-decision-family.md`, tested by adding cycle to work |

## After Phase 1: what's in progress (start here)

Three plans, agreed with Richard on 2026-10-09. Read them before changing the engine, screens or owner decisions:

| Plan | What | Status |
|---|---|---|
| [ADR 0010](docs/adr/0010-tax-profile.md) | **Tax profile**: Scottish tax, student loans, Child Benefit charge, annual allowance, other income and variable pay, minimum wage by age | Steps 1 to 5 built (step 5: `pnpm rules`, checklist in `docs/rule-pack-review.md`; 0 of 60 values signed so far, Richard to check). **Next: bonus per person from payroll**, then ADR 0011 steps 1 and 2 |
| [ADR 0011](docs/adr/0011-take-up.md) | **Take-up**: switching looks like a pay cut; real take-up from payroll instead of the assumed 70%; opt-out introduction and notional salary; each employee's own figure by email; objections answered; an "opt out of the pension" decision | Proposed, not started. Steps 1 and 2 matter most: they decide whether the sales promise holds |
| [ADR 0012](docs/adr/0012-visuals-that-feel-real.md) | **Visuals that feel real**: payslip before and after, where each £1 goes, pension pot over time, the tax cliff as terrain (three.js, with static fallbacks) | Step 1 built for salary sacrifice: a month's payslip today and after, to the penny, with motion. Next: payslips for pension amount and cycle to work, then step 2 (where each £1 goes) |

Also done on 2026-10-09:

- Blocked screens: a salary in the question that differs from payroll is noted in code ("Your payroll shows £95,000…"); assumption sources come from the real fact; blocked answers keep the verifier's findings in the run record.
- "What is my salary?" is answered from the person's own payroll; "what can you do?" gets a fixed reply listing their decisions (router prompt v2); "couldn't find that" lists what Fork can help with.
- A new employee decision, the Child Benefit charge (8 families now: 3 owner, 5 employee).
- Tax profile facts: payroll (tax code with an `S` prefix, student loan column) or the person's own answers in `tax_profile`, readable only by them (migration 0007). Fork asks region and student loan before the first screen; the rest are on "Your tax details" (`/me/tax`).
- Profile assumptions are code-written and shown as written (`asWritten`); the explainer never rewrites them.
- Top bar: "Fork" and a Home link go back home (a full page load, so an answer clears); a colour switch cycles Auto, Light, Dark, kept in the browser.
- Rule pack review tool (ADR 0010 step 5). The pack file is now one line per value, so each sign-off is a one-line diff.

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
| `packages/db` | PostgreSQL schema, migrations (RLS in `migrations/0001_rls.sql`), sign-in, sessions, invites |
| `packages/setup` | Payroll reading, column matching, import, company and scheme settings, `DbFactStore` |
| `packages/ui` | React screen components and `fork.css` |
| `apps/web` | Next.js 15 app; `/preview` shows every screen state |
| `packages/jobs` | Monthly emails and saved-decision re-checks |
| `packages/evals` | Evaluation suites and labelled datasets per model role |
| `docs/adr/` | Decision records 0001 to 0012: read before changing architecture |
| `docs/open-questions.md` | Answers given and questions still open |

## Commands

```sh
pnpm install
pnpm test            # unit, golden and database tests (288)
pnpm typecheck
pnpm e2e             # builds the web app, Playwright + axe at 360px, light and dark (12)
pnpm --filter web dev
pnpm db up            # local PostgreSQL in .data/ (port 5433), migrated
pnpm fork seed-demo   # Larkfield with owner maya@larkfield.test
pnpm --filter web e2e:db   # setup flow end to end with the database
pnpm fork monthly     # pay explained, owner reports, saved-decision re-checks (FORK_DEV_OUTBOX=1)
pnpm smoke:models    # live pipeline on four questions, needs a working Anthropic key
pnpm smoke:documents # live document interpreter on the fixtures, including a hidden-instruction test
pnpm rules status    # rule pack review: next, check, correct, publish, sheet (scripts/rules.ts)
pnpm eval [suite]    # evaluation suites per role against live models (~$1.30 for all); report in .data/evals/
```

Playwright uses the preinstalled Chromium at `/opt/pw-browsers/chromium-1194` (`@playwright/test` pinned to 1.56.1). Don't run `playwright install`. That browser exists only in the cloud environment: on Richard's Mac `pnpm e2e` builds the app but can't launch the browser.

Locally (Richard's Mac) the web app's settings and the key are in `apps/web/.env.local` (database URLs, `FORK_DEV_OUTBOX`, `FORK_ANTHROPIC_API_KEY`). For live scripts, read the key from there without printing it. Local accounts: owner `maya@larkfield.test`; employees include `ella.brooks@` (£32,000), `callum.fraser@` (£95,000), `asha.gill@` (£80,000) at `larkfield.test`. Sign in at `/signin`, then open the link at `/dev/outbox`.

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

## Decisions made with Richard (2026-10-09)

- Fix what makes numbers wrong for real people before adding breadth: the tax profile (ADR 0010).
- New 2026-27 values (Scottish bands, student loans, minimum wage age bands, Child Benefit and its charge, annual allowance) are read from GOV.UK and marked for a person's check, like the rest of the pack.
- Region and student loan are asked before the first screen, never assumed; other profile facts default and are shown as estimates.
- Take-up is the business risk: show it from payroll, not a guess (ADR 0011).
- Visuals should feel real (payslips, monthly amounts, a pot that grows), using three.js where it helps, always with a static fallback (ADR 0012).

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

- Without `FORK_DATABASE_APP_URL` and `FORK_DATABASE_AUTH_URL` the web app runs as the Larkfield demo (Ella). With them, people sign in; set `FORK_DEV_OUTBOX=1` to see emails at `/dev/outbox` (no real email sending yet).
- New companies are created by the operator: `pnpm fork create-company "<name>" <owner email>`.
- Email goes to the development outbox only; SMTP through the cPanel mail server is still to do.
- `pnpm fork monthly` and `pnpm fork recheck` need a scheduler in production (cron).
