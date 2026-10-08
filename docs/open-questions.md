# Open questions

Answered on 2026-10-08 by Richard Awe:

| # | Question | Answer |
|---|---|---|
| 1 | Fork's fee | A company setting. Tests use £4 per employee per month. |
| 2 | Contracted hours | Required in the payroll export. |
| 5 | Employer pension basis | Set per scheme: full salary or qualifying earnings. |
| 6 | Employment Allowance | Modelled. Connected companies and sole-director companies get their own rule later. |
| 7 | Fixed percentages in copy | Come from the calculation engine. |
| 8 | Where the product lives | This repo; demo moved to `demo/`. |
| 9 | Model providers | Anthropic models for every role, including the verifier. |
| 10 | Real inputs | None yet. Use the demo's Larkfield data. |
| 11 | Wording review | Reviewed as we go. |

Still open:

1. **Rule pack review.** Every value in `uk-2026-27` needs a person to check it against its source and fill in `lastChecked`.
2. **Minimum wage age bands.** Rates for 18 to 20, 16 to 17 and apprentices from April 2026, with source. Until then, Fork checks only the 21-and-over rate.
3. **2029 salary sacrifice cap regulations.** The Act sets the framework; the £2,000 amount is set by regulations. Watch for them and update the value's status.
4. **Auto-enrolment thresholds source.** The pack links to The Pensions Regulator's home page; needs the exact 2026-27 thresholds page.
5. **Verifier independence.** With Anthropic models only, use a different model tier and prompt for the verifier than for the spec writer, and measure its catch rate on seeded faults.
6. **Speed against the 10-second target.** After the fixes on 2026-10-08 the salary sacrifice screen passes every check in 17 to 30 seconds, at about $0.06 to $0.07 a question. The steps run one after another (router, spec writer, explainer and layout, verifier), and the floor without the spec writer is about 10 seconds. Options: start the explainer from the family's template while the spec writer runs, or drop the spec writer for families whose template already fits. Needs a decision.
9. **Production hosting.** Not AWS for now. Does the cPanel host offer PostgreSQL 16, Node.js and a UK data centre?
7. **Data gatherer as code.** ADR 0004 proposes deterministic code for Phase 1 instead of a model role with tools. Needs agreement.
8. **Distress wording.** The fixed reply points to MoneyHelper and Samaritans (116 123). Needs your review, and ideally a charity's, before any pilot.
