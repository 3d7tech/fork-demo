# Fork Build Prompt: Small Business Pensions and Benefits

Oct 8, 2026 · @Richard Awe

> **How to use this prompt.** Give this whole document to an AI coding agent (such as Claude Code) or a development team as the brief for building Fork. It can be exported as Markdown and saved in the repository as `BUILD_PROMPT.md`. Everything below is written to the builder. Phase 1 is the first thing to build; the roadmap explains where the architecture must be ready to go.

## Your role and mission

You are the lead engineer building **Fork**, a product of 3d7 Technologies. Fork helps employees of small UK companies make better decisions about their pay, pension and benefits, and helps the business save money as a result, mainly employer National Insurance through salary sacrifice.

Your first job is to build Phase 1: a working product for companies of 20 to 100 people, focused on pensions and benefits. Your second job, which matters as much, is to build it on an architecture that can grow to answer any decision a person faces, using several AI models that can be swapped between roles without rewriting the product.

A working demo already exists at https://3d7tech.github.io/fork-demo/. Treat it as the reference for the screen grammar, the tone and the worked examples, not as code to extend: it is a single HTML file with hard-coded logic.

## Product context

Fork turns a messy question into a screen built for that one decision. People ask in their own words ("maya says we can switch the pension to salary sacrifice?? is there a catch") and get a clear verdict, the levers that change it, the point where the answer flips, every assumption with its source, and one action.

**Who uses it**

- **The owner or managing director.** Runs a company of 20 to 100 people with no HR department. Answers every pay and pension question personally today. Buys Fork because it saves the company money and takes questions off their desk. Asks employer decisions: introduce salary sacrifice, the true cost of a hire, bonus as cash or pension.
- **Employees.** Ask about their own pay, pension and benefits, privately. Mostly on a phone. Many are not at a desk.
- **The accountant or payroll bureau.** Runs payroll for the company. Receives the plans and change requests Fork produces and makes the actual payroll and contract changes. Also a sales channel: one accountancy can bring many client companies.

**What makes Fork different from a calculator**

Screens are generated from the question rather than built in advance, so Fork can answer questions nobody designed a tool for. Decisions that cut across several rules at once (pension, tax, childcare, minimum wage) are handled together. Saved decisions re-check themselves when pay, rules or circumstances change.

**Business model, for context**

About £5 per employee per month with a monthly minimum, sold after a 60-day paid trial. The pitch is that the employer National Insurance saving is several times the fee. Fork does not set up payroll, give regulated advice, or reduce corporation tax.

## Non-negotiable principles

These hold in every phase. If a feature request conflicts with one, stop and raise it.

1. **Models never do arithmetic.** Language models classify, extract, plan and write words. Every number a user sees is produced by deterministic, tested code. A model may only quote numbers that the calculation engine returned.
2. **Every number has a source.** Each fact carries where it came from (payroll export, pension scheme document, tax rule pack, user answer, estimate) and when. Estimates are labelled as estimates on screen.
3. **Privacy is structural, not a setting.** The employer can never see an individual employee's questions, answers or decisions. Owners see topics only when five or more distinct employees have asked, and never who. Enforce this in the data layer and API, not only the interface, and test it.
4. **Guidance, not regulated advice.** Fork explains options and consequences with the user's own numbers. It does not tell people which investments to buy, and it flags when someone should speak to an adviser, mortgage broker or accountant. Wording is reviewed against this principle.
5. **Know when not to build a screen.** If a question is not a decision ("where is my P60?"), answer it plainly or link to the document. If Fork cannot answer reliably, say so and route the person to a human.
6. **Hard constraints come first.** Anything that rules an option out or changes the advice (minimum wage, a mortgage application, parental leave, the 2029 cap) is checked before the verdict.
7. **Rules are versioned.** Tax and benefit rules live in dated rule packs, never scattered through code. Every decision run records which rule pack version it used.
8. **Models are replaceable.** No product code calls a specific model or provider directly. Everything goes through role interfaces (see the model registry).
9. **Nothing changes payroll without a human.** Fork prepares plans and requests; the accountant or payroll provider makes the change. Every action is logged.

## Architecture: the decision pipeline

Every question, from either an owner or an employee, runs through the same pipeline. Each step is either a **model role** (swappable, behind an interface) or **deterministic code** (tested, versioned). The output of every step is a typed, validated object, never free text passed between models.

&#91;embedded content: decision pipeline · 9 steps, 2 in code\]

Model roles and what each one does:

| Role | Job | Input → output |
| --- | --- | --- |
| **Router** | Decides whether the question is a decision, which decision family it belongs to, and whether Fork can answer it. Routes non-decisions to a plain answer and unsafe or out-of-scope questions to a human. | Question + user context → `RouteResult` |
| **Data gatherer** | Uses tools to fetch the facts a decision needs: payroll records, scheme rules, benefits enrolment, current rule pack values, and later live data and news. Never invents a fact; missing facts become questions for the user. | Route + tool access → `FactSet` with sources |
| **Document interpreter** | Reads uploaded documents (staff handbook, pension scheme booklet, EV scheme terms, payslips, payroll exports) and extracts structured policy facts with page references. Runs at upload time, not per question. | Document → `PolicyFacts` |
| **Spec writer** | Writes the decision specification: options, hard constraints, levers, facts used, tipping-point definition, which calculation module to call, and the action. | Route + facts → `DecisionSpec` |
| **Calculation engine** (code) | Runs the named calculation module against the spec and the rule pack. Returns every number, the tipping point and lever ranges. | Spec + rules → `CalcResult` |
| **Screen composer** | Chooses components from the library and lays them out for this decision: which visual, which levers first, what the constraint panel asks. | Spec + results → `ScreenLayout` |
| **Explainer** | Writes the verdict, the reason, the tipping-point sentence and the assumptions in plain English, quoting only numbers from `CalcResult`. | Results + layout → `ScreenCopy` |
| **Verifier** | Checks that every number in the copy exists in the results, every fact has a source, constraints were asked, the guidance-not-advice rules hold, and the screen is worth showing. Can send back to an earlier step. | Everything → pass or fail with reasons |
| **Watcher** (code, with a model for news) | Keeps saved decisions alive: re-runs them when inputs change and decides whether the change is worth telling the person about. | Events → re-runs + notifications |

## Model registry: swappable models for every role

Any model from any provider must be able to fill any role, and the choice must be a configuration change, not a code change. Build this from day one, even if Phase 1 uses one provider throughout.

**How it works**

- Each role is an interface with a fixed input type, output schema, system prompt and tool list. Product code calls `roles.specWriter.run(input)`, never a provider SDK.
- A **registry file** maps each role to a primary model, a fallback, and limits. Models are referenced by provider and model ID.
- Every role returns **structured output validated against a JSON schema**. Invalid output is retried once with the validation error, then falls back to the next model, then fails safely with a message to the user.
- **Prompts are versioned files**, stored with the role, tested with the role, and recorded on every run.
- Every call logs role, model, prompt version, latency, token cost and validation result, without storing personal data in logs.

```yaml
# config/models.yaml (example shape)
roles:
  router:
    primary:  { provider: anthropic, model: <fast-small-model> }
    fallback: { provider: <other>,    model: <fast-model> }
    max_latency_ms: 1500
  data_gatherer:
    primary:  { provider: anthropic, model: <tool-use-model> }
    tools: [payroll.read, scheme.read, rules.lookup, benefits.read]
  document_interpreter:
    primary:  { provider: anthropic, model: <long-context-vision-model> }
  spec_writer:
    primary:  { provider: anthropic, model: <strongest-reasoning-model> }
  screen_composer:
    primary:  { provider: anthropic, model: <mid-tier-model> }
  explainer:
    primary:  { provider: anthropic, model: <mid-tier-model> }
  verifier:
    primary:  { provider: <different-provider-from-spec_writer>, model: <reasoning-model> }
  news_interpreter:
    primary:  { provider: anthropic, model: <mid-tier-model> }
```

**Rules for choosing and switching models**

- Match the model to the job: fast and cheap for routing; strongest reasoning for the spec writer; long-context and vision for documents; a good writer for the explainer.
- Use a **different model or provider for the verifier** than for the spec writer, so their mistakes are less likely to coincide.
- A model swap only ships if it passes that role's evaluation suite (see Quality) at least as well as the current model.
- Support routing by context: for example, a cheaper explainer for simple decisions and a stronger one for life events.
- Keep the option to run sensitive steps on models with UK or EU data processing, and record where each call was processed.
- Never send more personal data to a model than its role needs. The router does not need salaries; the calculation engine never goes to a model at all.

## The decision spec

The decision spec is the contract between the models and the code. Get it right and every future decision is mostly a new spec plus a new calculation module. Define it as a versioned JSON schema, validate every spec against it, and store the spec with every decision run.

```json
{
  "specVersion": "1.0",
  "decisionType": "comparison | threshold | life_event | allocation | employer_policy | lookup",
  "family": "pension.salary_sacrifice_switch",
  "audience": "employee | owner",
  "question": "is salary sacrifice worth it or is there a catch",
  "options": [
    { "id": "stay", "label": "Keep paying from take-home pay" },
    { "id": "switch", "label": "Switch to salary sacrifice" }
  ],
  "constraints": [
    { "id": "min_wage", "kind": "hard", "source": "rules", "autoCheck": true },
    { "id": "mortgage_12m", "kind": "ask", "question": "Applying for a mortgage in the next 12 months?", "effect": "caution" },
    { "id": "parental_leave_12m", "kind": "ask", "question": "Expecting parental leave in the next 12 months?", "effect": "caution" }
  ],
  "levers": [
    { "id": "contribution_pct", "label": "Your pension contribution", "min": 3, "max": 10, "step": 1, "default": "fact:contribution_pct" }
  ],
  "facts": [
    { "id": "salary", "value": 32000, "source": "payroll_export", "asOf": "2026-10-01" },
    { "id": "contribution_pct", "value": 5, "source": "pension_scheme", "asOf": "2026-10-01" },
    { "id": "employer_share_pct", "value": 50, "source": "company_setting" }
  ],
  "calculation": { "module": "pension.ss_switch", "rulePack": "uk-2026-27" },
  "tippingPoint": { "measure": "annual_sacrifice", "at": "rule:ss_ni_cap", "from": "2029-04-06" },
  "visual": "before_after",
  "action": { "type": "payroll.request", "to": "accountant", "label": "Switch me to salary sacrifice" },
  "watch": ["salary", "contribution_pct", "rulePack"]
}
```

**Decision types** are the backbone of the roadmap; each has a default layout and visual:

| Type | Example | Default visual |
| --- | --- | --- |
| Comparison | Electric car scheme or own car | Side-by-side cost bars |
| Threshold | Pay rise over £100,000 | Threshold ladder |
| Life event | Back four days a week after leave | Change checklist plus one decision |
| Allocation | How much of a bonus to put into a pension | Split bar |
| Employer policy | Introduce salary sacrifice for the company | Saving flow, now and after a rule change |
| Lookup | Where is my P60 | No screen: a plain answer or link |

## Rules engine: versioned UK rules

All tax, National Insurance, pension and benefit rules live in **rule packs**: dated, versioned data files with tests, separate from code. Calculation modules read values from the active pack; they never hard-code a rate.

**Phase 1 rule pack (`uk-2026-27`, rest of UK) must include:**

- Income tax: personal allowance £12,570, tapered by £1 for every £2 above £100,000; basic rate 20% to £50,270; higher rate 40%; additional rate 45% above £125,140.
- Employee National Insurance: 8% between £12,570 and £50,270, 2% above.
- Employer National Insurance: 15% above £5,000 a year; Employment Allowance £10,500.
- National Living Wage: £12.71 an hour from April 2026.
- Salary sacrifice for pensions: from 6 April 2029, only the first £2,000 a year per employee is free of National Insurance. Store as a future-dated rule.
- Tax-Free Childcare: government adds £2 for every £8, up to £2,000 a year per child; lost if adjusted net income exceeds £100,000.
- Pension tax relief: relief at source versus net pay arrangement, and how each interacts with salary sacrifice.
- Electric company car benefit-in-kind percentages by tax year, and Class 1A employer National Insurance.

**Requirements**

- Every value has an effective-from date, a source link (gov.uk or HMRC), and the date it was last checked.
- Rule packs are reviewed and published by a person, never changed automatically. The news interpreter may *propose* a change; a human approves it.
- Separate packs or overrides for Scotland's income tax bands (later phase) and for future tax years, so decisions can show "now" and "from April" side by side.
- Every rule has unit tests with known answers, and every pack change re-runs the golden test cases.
- Calculation modules are pure functions: same spec and pack in, same results out. Each module also returns the tipping point and the lever range where the verdict flips.

## Screen grammar and component library

Every decision screen follows one grammar, so people learn to read any decision in seconds. The composer chooses and orders components; it never writes HTML or CSS. Build these as tested, accessible components that render from the spec, results and copy.

**The grammar, in order**

1. **Question header**: the title and the person's own words, quoted.
2. **Constraint panel**: hard constraints handled automatically, plus up to two yes/no questions that change the advice. Highlighted when an answer changes the verdict.
3. **Verdict**: one sentence with the number that matters, one sentence of why, and the tipping point.
4. **Levers**: two or three sliders or choices, each showing its value and source.
5. **Outcome tiles**: three key numbers with the change against today.
6. **Visual**: one of the library visuals below.
7. **How this was worked out**: every assumption with its source and date, collapsed by default.
8. **Action**: one primary action, plus a confirmation of what happens next.
9. **Guidance note**: a short line that this is guidance, not advice.

**Visuals for Phase 1:** before and after bars, side-by-side cost bars, threshold ladder, change checklist, saving flow (now and after a future rule change).

**Design and accessibility requirements**

- Mobile first. Most employees will use a phone; test at 360 pixels wide.
- WCAG 2.2 AA: keyboard operable, visible focus, labelled controls, 4.5:1 text contrast, no information carried by colour alone, reduced-motion support.
- Numbers use tabular figures and British formatting (£1,234).
- Copy is plain British English, short sentences, no jargon without explanation.
- Light and dark themes; a company can add its logo and accent colour, while the grammar and Fork's trust signals stay fixed.
- Building steps are shown while the decision is generated, so waiting feels like work being done.

## Data, privacy, security and surfaces

**Core data model**

- `Company`, `Employee`, `PayRecord` (salary, hours, pay period), `PensionScheme` (contribution rules, relief method, provider), `Benefit` (EV, cycle, childcare and so on), `PolicyDocument` with extracted `PolicyFact`s.
- `Fact` (value, source, as-of date, confidence), `RulePack`, `DecisionSpec`, `DecisionRun` (spec, rule pack version, model and prompt versions, results, copy, timestamp), `SavedDecision` (with watched inputs), `Action` (what was requested, to whom, status), `AuditEvent`.

**Getting data in, Phase 1**

- Payroll export uploaded as CSV or Excel, with a column-mapping step the document interpreter suggests and the owner confirms.
- Staff handbook, pension scheme and benefit documents as PDF or Word.
- Employees may upload a payslip to fill gaps; extracted figures are shown back for confirmation.
- Later phases: direct connections to payroll software and HR systems (see roadmap).

**Privacy and security**

- Employee questions and decisions are visible only to that employee. Owner analytics are aggregated with a minimum group size of five, enforced in queries and covered by tests.
- Owners see company-level decisions and savings, and anonymous take-up figures only.
- Data stored in UK cloud regions, encrypted in transit and at rest, with per-company isolation.
- Personal data sent to models is minimised per role. Use provider settings that exclude customer data from training, and record them.
- Retention rules per data type; employees can download or delete their data.
- Write a data protection impact assessment before the first pilot, and plan for Cyber Essentials early and ISO 27001 later.
- A full audit trail of decisions shown, choices made and actions sent.

**Surfaces**

- **Employee web app**: phone-first, sign in by email link, can be added to the home screen. No app store in Phase 1.
- **Owner web app**: company decisions, savings to date, setup, anonymous topics, team invites.
- **Accountant view**: receives plans and change requests per client, marks them done.
- **Email**: invites, the monthly payday prompt ("your payslip, explained"), watched-decision alerts, the owner's monthly report.
- Later: Slack and Microsoft Teams, text messages, embedded widgets inside HR and payroll software.

## Phase 1: what to build first

The goal of Phase 1 is a product a 20 to 100 person company can run a 60-day paid trial on, focused on pensions and benefits.

**In scope**

- Company setup in under an hour: payroll upload with column mapping, documents upload, scheme details, team invites.
- The full pipeline, model registry and rule pack, even if each role starts on one model.
- **Owner decisions:** introduce salary sacrifice (saving now and after April 2029, minimum wage exclusions, share passed to staff, Fork's fee and payback point); true cost of a hire; bonus as cash or into pensions; plain answers for lookups such as the re-enrolment date.
- **Employee decisions:** switch to salary sacrifice (with mortgage and parental leave checks); how much to contribute; the £100,000 threshold; electric car scheme or own car; plain answers for lookups such as "where is my P60?".
- Free-text questions routed to the nearest supported decision; anything unsupported gets an honest "not yet" and a route to the owner or accountant.
- Saved decisions, re-run when payroll or the rule pack changes.
- Plans and change requests sent to the accountant by email, with status tracking.
- Owner dashboard: saving to date, take-up, anonymous topics with the group-size rule, monthly email report.

**Out of scope for Phase 1:** direct payroll integrations, news monitoring, Scottish tax bands, investment choices, anything that changes payroll automatically.

**Acceptance criteria**

- All golden test cases (see Quality) pass to the pound.
- A new company can go from sign-up to its own salary sacrifice saving in under 60 minutes, without help.
- A typical decision screen appears within 10 seconds, with building steps shown meanwhile.
- The verifier blocks any screen whose copy contains a number not in the results.
- Privacy tests prove an owner account cannot read any individual employee's questions or decisions through the interface or the API.
- Swapping the model for any role in the registry, then running the evaluation suite, needs no code change.

## Roadmap: from pensions to every decision

Fork grows by adding **decision families**, not by rebuilding. Each new family is the same package: a spec template, a calculation module, rule pack entries, a visual if none fits, golden test cases and evaluation cases for the model roles. Make adding a family a documented, repeatable process from Phase 1, and aim for a family to be addable without touching the pipeline.

| Phase | Theme | What it unlocks |
| --- | --- | --- |
| 1 | Pensions and benefits for small employers | Paid trials, the savings pitch |
| 2 | Full pensions and benefits catalogue, payday habit | Monthly use by every employee |
| 3 | Integrations and channels | Accountant partnerships at scale, no manual uploads |
| 4 | Watch and news engine | Decisions that stay true as the world changes |
| 5 | Owner decision suite | Weekly use by the owner |
| 6 | Regulated and partner layer | Ready-made suggestions through authorised partners |
| 7 | Larger employers and embedding | HR platforms and companies above 100 people |
| 8 | Personal decisions beyond work | Fork as a decision tool for life |
| 9 | Decision platform | Licensing the engine; experts authoring decisions |

### Phase 2: the full pensions and benefits catalogue

- **Payslip explainer** every payday, highlighting what changed and linking to any affected decision. This is the monthly habit.
- **Pension decisions:** contribution level and when to raise it, consolidating old pots from previous jobs, what opting out really costs, pension contributions on a pay rise, bonus sacrifice, beneficiary nomination reminders.
- **Benefits:** cycle to work, Tax-Free Childcare (including the three-monthly reconfirmation reminder), electric car scheme renewals, health cash plans and private medical cover as a taxable benefit, life cover, buying or selling holiday where offered.
- **Employee-owned companies:** the tax-free employee ownership bonus, taken as cash or partly into a pension.
- **Pay:** tax code checks, student loan repayments, overtime and second jobs, pay rises near thresholds.
- **Life events:** starting, parental leave and returning part-time, sabbaticals, long-term sickness, leaving and taking a pension pot along.
- **Rules:** Scottish income tax bands; next tax year's pack shown alongside the current one from January.

### Phase 3: integrations and channels

- Direct connections to common UK payroll software, starting with the systems your first accountant partners use, and unified HR and payroll APIs for wider coverage.
- An accountant portal: many client companies in one place, co-branded or white-labelled, with a referral fee or wholesale margin built in.
- Slack, Microsoft Teams and text-message entry points; pre-filled change requests that the accountant approves in their own system.
- Data quality checks that flag mismatches between payroll data and documents.

### Phase 4: watch and news engine

- Structured feeds first: tax and National Insurance changes, the National Living Wage, Bank of England base rate, inflation, benefit limits.
- A news interpreter role that reads announcements and classifies them as proposed, consulted on, legislated or in force. Only confirmed rules change calculations, and only after human approval of the rule pack. Proposed changes appear as "if this goes ahead" scenarios.
- A dependency map from each saved decision to the facts and rules it uses; affected decisions re-run automatically.
- Notification tiers: a push alert only when a verdict flips; a quieter note when the margin or tipping point moves; silent update otherwise.
- A "what changed" screen: verdict then and now, the changed input highlighted with old and new value and source, the ripple effect, and an "this doesn't apply to me" option.
- A timeline for each decision showing how and why its answer changed.

### Phase 5: the owner decision suite

- Pay review budgets: what a round of rises costs the company versus what staff take home.
- Hiring plans: the true cost of each role, cash flow by month, salary sacrifice effects.
- Salary versus dividends for owner-directors, and director pension contributions.
- Bonus and incentive design, including employee ownership bonuses.
- Auto-enrolment duties: re-enrolment dates, contribution levels, compliance reminders.
- Benefits design: the best package for a given budget, and what each benefit costs or saves.
- Pension provider and electric car scheme reviews: comparing fees and terms using the company's own data.
- Redundancy and restructuring costs, handled carefully and with a prompt to take advice.

### Phase 6: the regulated and partner layer

- Present ready-made suggestions from FCA-authorised partners, such as pension providers using the targeted support regime, inside the same screen grammar, clearly labelled as theirs.
- Hand-offs to regulated advisers, mortgage brokers and accountants with the decision context attached, with transparent and declared commercial terms and no paid steering of the verdict.
- Audit exports that partners can use as Consumer Duty evidence.

### Phase 7: larger employers and embedding

- An embeddable component for HR and payroll platforms, themed in the host's brand, with the same privacy rules.
- Connectors for larger HR systems and file-based feeds for bespoke ones.
- Single sign-on, enterprise security reviews, multiple legal entities, and decision families such as relocation offers and global mobility (for example, London versus New York).

### Phase 8: personal decisions beyond work

- Money: overpay the mortgage or pay into a pension, remortgaging, rent or buy, savings versus debt, using Open Banking connections with consent.
- Life: which city to move to, which job offer to take, repair or replace the car, which university course; decisions that mix facts with personal values, where the user weights what matters and Fork shows which value tips the answer.
- Offered as a workplace benefit first, then possibly directly to individuals.

### Phase 9: the decision platform

- A licensable API and engine for banks, insurers, pension providers and benefits platforms.
- An authoring tool for experts to create new decision families (spec templates, calculation modules, tests) with review and approval, so coverage grows beyond what the core team can build.
- Rule packs for other countries, starting with those closest to UK rules.

**Architecture readiness, so later phases do not need rewrites:** the decision spec is versioned and extensible; rule packs support jurisdictions and future dates; tools for the data gatherer are plug-ins; the watcher's dependency map is built from Phase 1 saved decisions; tenancy supports accountants with many clients and platforms with many employers; every role can run on a different model.

## Quality and evaluation

**Golden test cases.** These come from the demo and must pass exactly, using the `uk-2026-27` rule pack. Write each as an automated test of the calculation module, and as an end-to-end test from question to screen.

| Case | Inputs | Expected |
| --- | --- | --- |
| Employee switches to salary sacrifice | £32,000 salary, 5% contribution, relief at source today, employer shares 50% of its NI saving | Take-home +£128 a year; employer NI saved £240; +£120 into her pension |
| Company introduces salary sacrifice | Larkfield's 34 salaries (£25,200 to £108,000, listed in the demo), 5% contributions, 70% take-up, 50% shared, fee £1,632 | 2 staff excluded by minimum wage; employer NI saved £7,946 now and £6,250 from April 2029; Larkfield keeps £2,341 now and £1,493 from 2029; Fork pays for itself at 10 of 32 eligible staff |
| £100,000 threshold | £108,000 salary, 5% sacrificed, 2 children using Tax-Free Childcare | Adjusted net income £102,600; extra £2,600 sacrifice reduces take-home by £988 and keeps £4,000 of childcare support |
| True cost of a hire | £40,000 salary, 3% employer pension, 5% employee sacrifice, £2,000 extras | £48,150 a year: employer NI £4,950, pension £1,200 |
| Bonus: cash or pension | £1,000 each to 34 staff, half choose pension | All cash costs £39,100; Larkfield saves £2,550 |
| Electric car scheme | £58,000 salary, 9,000 miles, home charging, the demo's lease and cost assumptions | Scheme about £5,329 a year against £7,633 for own petrol car |

**Evaluation suites per model role.** Each role has a labelled test set, a pass threshold, and runs on every prompt or model change:

- **Router:** a few hundred real-style questions, including typos, slang and multi-part questions, labelled with the correct route. Measure accuracy, and especially false confidence on questions Fork should not answer.
- **Document interpreter:** sample handbooks, scheme booklets and payslips with known facts. Measure extraction accuracy and correct page references.
- **Spec writer:** valid-spec rate, correct calculation module, constraints included when relevant.
- **Composer and explainer:** correct components chosen; copy that quotes only result numbers, stays within guidance wording, and reads at a plain-English level.
- **Verifier:** seeded faulty screens (a wrong number, a missing source, advice wording, a skipped constraint). Measure how many it catches.
- **Cost and speed:** budgets per decision for latency and model cost, tracked per role.

**Red-team tests:** instructions hidden inside uploaded documents (treat every document as data, never as instructions); an owner trying to reach employee data through the API; employees asking for specific investment recommendations; questions in distress, which go to a supportive response and appropriate help rather than a decision screen.

## Working agreement

**Start with a plan, not code.** Before writing anything, reply with: your proposed technology stack and why, the repository structure, the build order, the open questions you need answered, and the risks you see. Wait for approval.

**Suggested defaults** (change them if you have good reason, and say why): a TypeScript monorepo; a web framework that renders well on phones; PostgreSQL; schema validation shared between models and code; a background job queue for document processing and the watcher; UK-region hosting.

**Build order for Phase 1**

1. Rule pack and calculation modules, with the golden test cases passing.
2. Decision spec schema and validation.
3. Model registry, role interfaces, prompt files and logging.
4. The pipeline end to end for one decision: employee switches to salary sacrifice.
5. Component library and screen grammar.
6. Company setup: payroll upload, mapping, documents, invites.
7. Remaining owner and employee decisions, then lookups and the "not yet" path.
8. Saved decisions, accountant requests, owner dashboard and monthly email.
9. Privacy enforcement tests, evaluation suites, red-team tests.
10. A guide called "How to add a decision family", tested by adding one more family yourself.

**How to work**

- Never invent a tax rule, rate or threshold. If a rule is missing or unclear, add it to an open questions list with the source you need.
- Keep an architecture decision log: each significant choice, the options considered and why.
- Small, reviewable changes, each with tests. Nothing merges with a failing golden test.
- Write copy in plain British English. Show the demo's tone: short, warm, specific.
- When a request conflicts with the principles, say so before building it.
- At the end of each phase, report what was built, what was deferred, and what you learned that changes the roadmap.

**Contact:** Richard Awe, 3d7 Technologies, richard.awe@3d7tech.com.
