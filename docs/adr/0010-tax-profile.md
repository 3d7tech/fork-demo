# 0010: A person's tax profile, so numbers fit real people

Date: 2026-10-09 · Status: accepted; steps 1 to 4 built, 5 and 6 to do

## Problem

The engine models one person with one job, a steady salary and no other income, on rest-of-UK
tax bands. Anyone outside that gets confident numbers that are wrong, and nothing on screen says so:

1. Scottish taxpayers are taxed on rest-of-UK bands.
2. Student loan repayments are ignored, so salary sacrifice's gain is understated.
3. The High Income Child Benefit Charge (£60,000 to £80,000) is not modelled.
4. The pension annual allowance is never checked.
5. Other income, second jobs and variable pay are ignored.
6. Minimum wage checks use the 21-and-over rate for everyone.
7. Every rule pack value is an unreviewed draft.

## Decision

Give every employee a **tax profile**: a few facts that change the sums, each with a source, and
pass it to every calculation through one shared `TaxProfile` type.

| Fact | Comes from | If unknown |
|---|---|---|
| `tax_region` (rest of UK or Scotland) | Payroll tax code (`S` prefix), else the person | Ask before any screen |
| `student_loans` (plans 1, 2, 4, 5, postgraduate) | Payroll student loan column, else the person | Ask before any screen |
| `variable_pay` (overtime, commission a year) | The person (estimate) | Assume none, say so |
| `other_income` (second job, rental, self-employed profit a year) | The person (estimate) | Assume none, say so |
| `child_benefit_children`, `higher_earner` | The person | Ask only when income is over £60,000 |
| `other_pension_savings`, `flexibly_accessed` | The person | Ask only when savings could pass the annual allowance |
| `date_of_birth` | Payroll (already stored) | Use the 21-and-over rate, say so |

Region and student loan change almost every result, so Fork asks for them **before** showing a
screen ("a few details first"), once, and keeps the answers. The others default to none and are
listed as assumptions, or asked only where they matter.

Profile answers are the employee's own data: stored in a table only the employee can read (no
owner policy at all, as for decisions in ADR 0008). Payroll-derived values keep their payroll source.

### Engine changes (all in `packages/calc/src/uk.ts`, with golden tests)

- `incomeTax(r, income, region)`: Scottish starter to top rates; personal allowance taper in both.
- `studentLoan(r, earnings, plans)`: 9% above the lowest undergraduate plan threshold, plus 6%
  postgraduate. Charged on pay after salary sacrifice; not reduced by relief-at-source or net pay contributions.
- `adjustedNetIncome`: total taxable income less grossed-up relief-at-source contributions (closes open question 11).
- `childBenefitCharge(r, ani, children)`: 1% of Child Benefit per £200 over £60,000, all of it by £80,000.
- `annualAllowance(r, …)`: £60,000, tapered above £260,000 adjusted income (minimum £10,000),
  £10,000 money purchase allowance once flexibly accessed. Carry forward is not modelled: going
  over is a `caution` that points to an adviser, not an `excluded`.
- `minimumWage(r, age)`: rate by age band. Apprentice rates need to know who is an apprentice;
  until then the age rate is used, which is the stricter check.

### Rules added to `uk-2026-27` (draft, each with its GOV.UK source)

Scottish bands and rates, student loan thresholds and rates, Child Benefit weekly rates, the charge
thresholds, annual allowance, taper limits, money purchase allowance, minimum wage age bands.

## Plan

| Step | What | Status |
|---|---|---|
| 1 | Rules and engine functions above, golden tests by hand | **Done** (`715d34d`) |
| 2 | `TaxProfile` through every employee module (`jobPay`); annual allowance check; minimum wage by age | **Done** (`412b8b9`) |
| 3 | Profile storage (RLS), payroll columns for tax code and student loan, "a few details first", "Your tax details" page | **Done** (`28c8217`) |
| 4 | Child Benefit charge decision (£60,000 to £80,000); owner minimum wage by each person's age | **Done** (`611ec93`, `f1ed1ce`). Bonus per person from payroll still to do |
| 5 | Rule pack review tool: every value with source, checked and signed off by a person | **Done**: `pnpm rules` (status, next, check, correct, publish, sheet) and the checklist in `docs/rule-pack-review.md`. A sign-off needs the value the person read at the source; a mismatch signs nothing. A correction needs a reason and bumps the pack version. Publishing needs every value signed. The values themselves still need Richard's check (0 of 60) |
| 6 | Evaluation cases and wording for the new assumptions and constraints | Mostly done with steps 2 to 4 (router, screen, spec cases; screens pass at 10.6s). Wording needs Richard's review |

Built along the way: profile assumptions are written by code and shown as written (the explainer never
rewrites them), which keeps screens at about 10 seconds.

## Not in scope

Savings and dividend income rules, Welsh rates (same as rest of UK today), carry forward,
apprenticeship status, Scottish relief-at-source top-ups beyond saying they can be claimed.
