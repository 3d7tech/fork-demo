# 2. Rule packs are dated data, read through one recorder

Date: 2026-10-08 · Status: accepted

## Decision

- Each pack (`packages/rules/packs/<id>.json`) holds rules; each rule holds one or more dated values, each with a status (`in_force`, `legislated`, `announced`, `proposed`), an official source link and a `lastChecked` date.
- Future rules live in the current pack as future-dated values (the 2029 salary sacrifice cap, company car percentages to 2029-30), so a decision can show "now" and "from April 2029" from one pack version.
- A value of `null` means "no limit applies" (the cap before 6 April 2029).
- Calculation modules read rules only through `Rules` (`packages/calc/src/core.ts`), which records every rule and date used. That list goes into every `CalcResult` and later every `DecisionRun`.
- Asking for a rule or date the pack does not cover throws. Modules never fall back to a guess.
- A pack starts as `draft`. A person checks each value against its source, fills `lastChecked` and `checkedBy`, and sets `published`. A test enforces that a published pack has no unchecked values.

## Consequences

- `uk-2026-27` is a draft until reviewed. Golden tests run against it now.
- Figures "from April 2029" use 2026-27 bands with the cap applied. They are labelled as estimates until a 2029-30 pack exists.
