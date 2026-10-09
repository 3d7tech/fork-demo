# 0011: Take-up: making salary sacrifice land with real people

Date: 2026-10-09 · Status: proposed (agreed with Richard as the plan; not started)

## Problem

Fork's business case is the employer NI saving, and that saving only exists for people who switch.
Two things stand in the way:

1. **Switching looks like a pay cut.** The contract variation says "salary reduced from £32,000 to
   £30,400". For someone already paying into the pension, take-home actually goes *up* (£128 a year for
   Ella), but people see the paperwork, not Fork's screen.
2. **Putting more in really does cut take-home.** Contribution increases, the Child Benefit and
   £100,000 decisions, and staying in the pension at all all cost take-home now, for a gain decades away.

And the owner screen assumes **70% take-up** with no evidence. Fork's fee is per employee, but the
saving is per switcher, so "Fork pays for itself" rests on that guess.

Some people genuinely lose by switching, and Fork must say so plainly:

- Low earners on relief at source (below about £12,570): they get 20% added free today and save no
  tax by sacrificing. The engine already gets this right (verdict `stay`); the screen doesn't explain why.
- Anyone near the minimum wage (already excluded), and mortgage or parental leave soon (already cautions).
- Pay-linked extras worked out on the lower salary: life cover multiples, pay rises, overtime rates.
  Most employers avoid this with a **notional salary** for those purposes; Fork never mentions it.

## Plan

| Step | What | Result |
|---|---|---|
| 1 | **Take-up from payroll, not a guess.** The owner screen counts, per person from payroll and profiles where known: who gains, who would lose (low earners on relief at source), who is excluded (minimum wage). The saving and "Fork pays for itself" shown at low, middle and high take-up, with the break-even take-up. | The pitch is honest and testable |
| 2 | **How to introduce it.** The owner screen explains opt-out introduction (everyone switches unless they say no, after notice) and a notional salary for life cover, pay rises and overtime, and routes the owner to their accountant or an employment adviser for the contract change. Fixed, human-written wording; no legal steps from a model. | Most objections gone before they start |
| 3 | **Each employee's own figure, privately.** The monthly "your pay, explained" email adds "switching would add £X a year to your take-home", from the engine, to that person only. Owners see counts of who switched, never who was told what. | People hear the gain, not just the paperwork |
| 4 | **Objections answered on the employee screen.** Fixed wording for: "my salary goes down on paper", mortgages (lenders and the notional salary), life cover and pay rises, statutory parental pay (already a caution), and why a low earner on relief at source should stay. | Fewer people say no out of worry |
| 5 | **"Should I opt out of the pension?"** A decision family: what leaving costs, including the employer's contribution and tax relief given up, against the take-home gained. Guidance, not advice; distress wording if money is tight. The router currently sends this to the contribution decision, which is wrong. | The commonest real question answered |
| 6 | **Make the cost of putting more in concrete.** Every "put more in" screen shows the monthly cost next to what it adds, the employer's part, and "each £1 costs you" (already an output). Ties into ADR 0012's visuals. | Less abstract trade-off |

## Rules that still hold

Every figure from the engine; owners never see individuals (counts only, five or more); wording that
could read as advice (opt-out, objections) is fixed and reviewed by Richard; contract and employment
law steps go to a person.

## Open questions for Richard

- Is opt-out introduction something Fork should recommend, or only explain? It is common practice, but
  it is a contractual change.
- Should the take-up range on the owner screen be fixed (for example 30%, 60%, 90%) or come from pilot data later?
- Any source for typical take-up to quote? None is used until there is one.
