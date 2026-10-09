# Phase 1 report

Date: 2026-10-09 · Branch: `phase1/milestone-a`

## What was built

All ten steps of the brief's Phase 1 build order.

| Step | What | Where |
|---|---|---|
| 1–5 | Rule pack, calculation modules, spec schema, model registry and roles, pipeline, screens | ADR 0001–0006 |
| 6 | Company setup: email sign-in, invites, company settings, pension scheme, payroll upload with column matching, documents read by the document interpreter and confirmed by an owner | ADR 0007 |
| 7 | Seven decisions: switch to salary sacrifice, how much to contribute, the £100,000 threshold, electric car scheme (employees); introduce salary sacrifice, true cost of a hire, bonus as cash or pension (owners). Lookups from confirmed documents. An honest "not yet" that lists what Fork can do | ADR 0005 |
| 8 | Stored answers, saved decisions re-checked when pay or rules change, requests to the accountant with status, accountant accounts, owner dashboard and monthly report (counts only, from five people), "your pay, explained" each month, download or delete your own data | ADR 0008 |
| 9 | Code guards for crisis and investment questions, privacy tests at database and API level, evaluation suites for every model role | ADR 0009 |
| 10 | "How to add a decision family", tested by adding cycle to work with no pipeline change | `docs/adding-a-decision-family.md` |

## Acceptance criteria

| Criterion | Status |
|---|---|
| All golden test cases pass to the pound | **Met.** The six from the brief, plus hand-worked cases for contribution level and cycle to work. |
| A new company goes from sign-up to its own salary sacrifice saving in under 60 minutes, without help | **Mostly.** The end-to-end test does it in under a minute with the Larkfield files. Not yet timed with a real owner, and companies are created by 3d7 (`pnpm fork create-company`); there is no self sign-up. |
| A typical decision screen appears within 10 seconds, with building steps shown | **Met for typical screens:** 9 to 10 seconds in the evaluation runs. A screen that needs a revision round takes 15 to 30 seconds. Building steps show throughout. |
| The verifier blocks any screen whose copy contains a number not in the results | **Met, in code** (`checkCopy`), and measured: 97% of all seeded faults caught. |
| An owner cannot read any individual employee's questions or decisions through the interface or the API | **Met.** Database policies, API tests with an owner holding the run's id, and the owner's report text are all tested. |
| Swapping the model for any role, then running the evaluation suite, needs no code change | **Met.** `FORK_MODELS_CONFIG=other.yaml pnpm eval`. |

## Running costs (measured)

- About 3 to 7p per decision screen; under 0.1p for lookups and safety replies.
- A full evaluation run costs about $1.30.

## Deferred

- **Email sending.** Everything goes to a development outbox. SMTP through 3d7's cPanel mail server is next.
- **Hosting.** Not AWS for now; whether the cPanel host offers PostgreSQL 16, Node.js and a UK data centre is open (open question 9).
- **A scheduler** for `pnpm fork monthly` and `pnpm fork recheck`, and a job queue for long documents.
- **Self sign-up** for new companies, and the brand colour setting on screen (it's saved but not yet applied).
- **Rule pack review.** `uk-2026-27` is still a draft; every value needs a person to check it against its source (open question 1). Minimum wage age bands need rates (dates of birth are now stored).
- **Real data.** Router questions, documents and payslips from a pilot, to grow the evaluation sets to a few hundred cases.
- **Before a pilot:** a data protection impact assessment, retention rules per data type, and a review of all wording, especially the distress reply.

## What we learned that changes the roadmap

- **The spec writer is rarely needed.** Reviewed templates plus a small lever reader give faster, cheaper and more reliable screens. The strongest model now runs only when the verifier asks for a missing option or constraint. New families should lean on good templates.
- **Evaluation suites pay for themselves.** Their first run found two real problems: the lookup matcher picked loosely related facts, and the verifier couldn't see constraint outcomes. Grow them with real questions before adding decisions.
- **Privacy belongs in the database.** Making employee data structurally unreadable by owners (no policy at all) was simpler to test than rules in code. Keep that pattern for every new table.
- **Documents are a strong source of facts**, once an owner confirms them: the interpreter read every fixture fact with the right page and ignored a planted instruction.
