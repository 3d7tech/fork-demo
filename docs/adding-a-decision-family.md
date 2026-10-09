# How to add a decision family

Fork grows by adding decision families, not by changing the pipeline. A family is one kind of decision ("should I switch to salary sacrifice?", "what does a hire cost?"). Adding one means writing the pieces below. If you find yourself editing `packages/pipeline/src/pipeline.ts`, stop: something in this guide is missing, so fix the guide too.

Work through the steps in order. Each ends with a check you can run.

## 0. Before you start

- **Write the decision in one sentence**, from the person's side: "Should I get a bike through the cycle to work scheme or buy it outright?"
- **List the rules it needs.** Every rate, threshold and limit must already be in the rule pack (`packages/rules/packs/uk-2026-27.json`), with a source. If one is missing, don't guess it: add it to `docs/open-questions.md` with the source needed, and wait for a person to add it to the pack.
- **List the facts it needs** and where each comes from: payroll (salary, hours), the pension scheme, company settings, a confirmed document fact, or something only the person knows (a lever).
- **Work one example by hand**, with the rules written out. This becomes the golden test, and it must match the engine to the pound.

## 1. The calculation module (`packages/calc`)

1. Add `packages/calc/src/modules/<name>.ts`: a pure function `(rules, input) → CalcResult`.
   - Read every rule through `r.num(...)` or `r.limit(...)`, so it is recorded in `rulesUsed`.
   - Put **every number the screen might show** in `outputs`, with a plain label and a unit. The explainer may quote nothing else. Mark estimates with `q(..., true)`.
   - Give a short `verdict` code, `constraints` with outcomes (`pass`, `caution`, `excluded`), and `assumptions` with their sources.
   - Use `decimal.js` (`D(...)`) for money. Never floats.
2. Register it in `MODULES` in `packages/calc/src/index.ts`.
3. Add the hand-worked case to `packages/calc/test/golden.test.ts`.

**Check:** `pnpm test` passes, including your golden case.

## 2. The family (`packages/pipeline/src/families`)

Add `<name>.ts` exporting a `FamilyDef` (see `types.ts`), and add it to the `ALL` list in `families/index.ts`. A family declares:

| Field | What it is |
|---|---|
| `id`, `audience`, `title`, `description` | The router sees `description` (no personal data). `title` is shown to people in "Fork can help you with". |
| `module`, `rulePack` | The calculation module from step 1. |
| `template` | A reviewed `DecisionSpec`: options, constraints, levers, visual, action. It is the spec for every confident question, so it must stand on its own. |
| `facts` | The facts the module needs, with labels and units. A missing fact becomes "Fork needs a little more information", never a guess. |
| `answers`, `levers` | Constraint questions and levers the module understands, with defaults. |
| `questionSetsLevers` | `true` if the person usually says the numbers ("a £1,200 bike"), so the lever reader starts the levers there. |
| `needs` | Data beyond single facts, such as every salary on payroll (`payrollRows`, owners only). |
| `profile` | `true` for employee decisions that work out take-home pay. The person's tax profile facts (ADR 0010) are fetched too; spread `...profileFrom(f)` into the module input and use `jobPay` in the module. Fork asks for region and student loan before the first screen. |
| `answersFrom` | Optional: start a screen question from a fact the person already gave (such as their number of children). |
| `buildInput` | Facts, answers and levers → the module's input. |
| `defaultLayout`, `visual` | The layout used if the composer's is invalid, and the chart data, built by code from the results. |
| `request` | What the accountant is asked to do, written by code. Leave it out if the decision changes nothing in payroll. |
| `steps` | The two building-step labels shown while the screen is made. |

Where facts come from:

- Payroll, scheme and company settings: `DbFactStore` in `packages/setup/src/facts.ts` already serves `salary`, `hours_per_week`, `contribution_pct`, `employer_contribution_pct`, `relief_method`, `pension_basis`, `employer_share_pct` and, for owners, `headcount`, `median_salary`, `fee_per_employee` and `employment_allowance`.
- The person's tax profile (`profile: true`): `tax_region`, `student_loans`, `variable_pay`, `other_income`, `child_benefit_children`, `higher_earner`, `other_pension_savings`, `flexibly_accessed` and `age`, from payroll or their own answers. Any unknown takes a default that the module lists as an estimate (`profileAssumptions`).
- Company documents: any key in `POLICY_KEYS` (`packages/setup/src/documents/keys.ts`) that an owner has confirmed is served automatically as a `policy_document` fact with its page. To use a new one, add the key there so the document interpreter extracts it.

**Check:** `pnpm test`. `packages/pipeline/test/families.test.ts` checks every family's template against its module, levers and answers.

## 3. An end-to-end test

Add a case to `packages/pipeline/test/families.test.ts` that asks a real-style question and checks the golden numbers appear on the screen. If the family sends a request, check its wording.

**Check:** `pnpm test`.

## 4. Evaluation cases (`packages/evals/datasets`)

- `router.json`: at least eight real-style questions for the family (typos, slang, a multi-part one), and a couple that sound similar but belong elsewhere.
- `screens.json`: one whole-screen case.
- `lever_reader.json`: cases if `questionSetsLevers` is set.
- The facts for the eval people are in `packages/evals/src/larkfield.ts`; add any new ones.

**Check:** `pnpm test` (datasets are checked offline), then `pnpm eval router screens levers`. Every suite must still pass its threshold.

## 5. Demo mode (optional)

Add a pattern to `route()` in `packages/pipeline/src/demo.ts` so the app's demo mode can reach the family without a model.

## 6. Wording and review

- New copy (option labels, constraint questions, request wording, building steps) is plain British English, short and specific. List it in the pull request for review.
- New assumptions that aren't tax rules (for example a scheme's end-of-hire fee) go in `docs/open-questions.md`.

## Done means

- [ ] Golden case passes to the pound.
- [ ] Family registered; template checks pass.
- [ ] End-to-end test with the golden numbers.
- [ ] Router, screen and lever eval cases; `pnpm eval` passes.
- [ ] No change to `packages/pipeline/src/pipeline.ts`.
- [ ] Open questions recorded.

## Tested by adding cycle to work (2026-10-09)

Following this guide added `benefits.cycle_to_work`: a module with two hand-worked golden cases (a £1,000 bike costs a basic-rate taxpayer £720; a £1,500 bike costs a higher-rate taxpayer above the NI upper limit £870), a family, an end-to-end test, eight router questions, a screen case and three lever cases. `pipeline.ts` didn't change. Every evaluation suite still passed (router 95%, lever reader 97%, screens 100% shown, typical 9.9 seconds).

What it taught us, now folded into the guide:

- Facts from documents weren't reaching decisions. `DbFactStore` now serves any confirmed document fact, with its page.
- A non-pension salary sacrifice mustn't use the pension NI cap from 2029, so the module works out take-home itself rather than reusing `takeHome()`. Check the helpers you reuse apply to your decision.
- The offline dataset checks caught the missing evaluation cases before any live run.
