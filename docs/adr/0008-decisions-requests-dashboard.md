# 8. Saved decisions, accountant requests, the owner dashboard and monthly emails

Date: 2026-10-09 · Status: accepted

## Decision

- **Every answer is a `decision_run`**: the question, the screen or message, and the rule pack, models and prompt versions behind it. An employee's runs, saved decisions and requests have a policy for that employee only. There is no owner policy on them, so no query an owner writes can reach them. Owners share company decisions with other owners.
- **Requests go to the accountant.** Each family writes its request in code (`request()` in the family): what to change, for whom (payroll name and number, which the accountant needs). Requests wait as drafts until the company has an accountant, then move to them when one joins. Fork never changes payroll.
- **Accountants** join by invite, through `accountant_access`, not membership. They see the requests of the companies they look after, update status with a note, and Fork emails the requester. They can't read questions, pay or employee records.
- **Owner dashboard and report** use two database functions that return nothing until five different people are counted: topics asked about in the last 90 days, and salary sacrifice take-up with the employer NI saved (a company-level figure stored on each completed request). They never return who.
- **Saved decisions** keep a snapshot of the facts, rule pack version, verdict and headline numbers. `pnpm fork recheck` (after a payroll import or rule pack update) and `pnpm fork monthly` re-run them in code and email the person only if their result moved, in code-written words.
- **"Your pay, explained"** each month is built by code from the latest two pay records; no model is involved. The owner's monthly report carries counts only.
- **Jobs** list who to act for with the owner connection (ids only), then read and write as each person, so row-level security still applies.
- **Email** goes to a shared development outbox file (`.data/outbox.jsonl`, shown at `/dev/outbox`) until SMTP through 3d7's mail server is set up.
- **People's own data**: `/me` downloads everything that is theirs as JSON and deletes their questions and answers. Requests stay with the accountant.

## Consequences

- Take-up and saving show nothing below five switchers. An owner of a very small company may wait a while to see figures; that is the brief's privacy rule.
- Re-checks run on a schedule, not instantly after a payroll import, because they need the job's owner connection to list people.
