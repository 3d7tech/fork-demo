# 7. Data model and PostgreSQL for company setup

Date: 2026-10-08 · Status: **proposed**, waiting for Richard's go-ahead

## Setup

- New package `packages/db`: Drizzle schema, committed SQL migrations, and a small typed query layer. Nothing else talks to the database directly.
- PostgreSQL 16. Locally and in tests: a throwaway cluster started by `pnpm db:up` in `.data/` (no Docker needed; Postgres 16 is in the cloud container). Each test file gets a fresh database cloned from a migrated template, so tests stay fast and independent.
- Production later: AWS RDS in London (eu-west-2), encrypted at rest, TLS only.
- Uploaded files live outside the database (local folder now, S3 London later). The database keeps the file key, size and SHA-256.
- Money is `numeric(12,2)`, read into `decimal.js`. Hours and percentages are `numeric`. Never floats.

## Privacy enforced in the database

- The app connects as `fork_app`, which owns nothing and has row-level security forced on every table.
- Each request runs in a transaction that sets `app.user_id`, `app.company_id` and `app.role` (`owner`, `employee`, `accountant`). Policies read only those.
- Two kinds of table:
  - **Company tables** (company, scheme, documents, payroll uploads): visible to that company's owners; employees see what they need (their own pay record, the scheme, documents).
  - **Employee-private tables** (questions and decision runs, built in step 8): the policy is "this user only". There is no owner policy at all, so no query an owner writes can read them.
- Owner topic counts come from one database function that returns a topic only when five or more distinct employees asked. Tests try to get round it through the API and directly in SQL.

## Tables for step 6

| Table | Holds |
|---|---|
| `company` | Name, brand colour, Fork fee per employee, Employment Allowance claimed, rule pack id |
| `app_user` | One per email address (a person can belong to more than one company) |
| `membership` | User ↔ company, role, and the linked `employee` for employees |
| `invite` | Company, email, role, employee, hashed token, expiry, accepted date |
| `login_token` / `session` | Email sign-in link (hashed, 15 minutes, single use) and session (hashed id, expiry) |
| `employee` | Company, payroll reference, name, work email, contracted hours, start date |
| `payroll_upload` | File, who uploaded it, pay period, suggested and confirmed column mapping, status |
| `pay_record` | Employee, upload, pay period, salary, hours, pension contribution: each value keeps its source upload |
| `pension_scheme` | Provider, relief method, basis (full salary or qualifying earnings), employer %, default employee %, share of NI saving passed on, source document |
| `policy_document` | Kind (handbook, scheme booklet, benefit terms), file, status |
| `policy_fact` | Extracted fact, value, page reference, confidence, confirmed by and when |
| `audit_event` | Who did what to which record, when. No question text or pay figures |

`InMemoryFactStore` is replaced by a `DbFactStore` that reads the same facts, each with its source and date, so the pipeline doesn't change.

Step 8 adds `decision_run`, `saved_decision` and `action`; step 7 adds `benefit`.

## Payroll upload flow

1. Owner uploads CSV or Excel. Code reads the header row and a few sample rows.
2. The document interpreter suggests a column mapping from the headers and samples only (no full file). Code checks required columns, including contracted hours.
3. Owner confirms or corrects the mapping. Code validates every row and shows problems before anything is saved.
4. Rows become `employee` and `pay_record`. Re-uploading a later period adds records and keeps history.

## Questions before building

1. Store employees' **date of birth** if the export has it? Needed later for minimum wage age bands; otherwise only name, work email, hours and pay.
2. **Email sending**: a development outbox now (links shown in the console and a `/dev/outbox` page), and a real provider (AWS SES London?) before the pilot?
3. **Accountant accounts** in step 6, or wait for step 8 when requests are sent to them?
