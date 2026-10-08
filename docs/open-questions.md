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
