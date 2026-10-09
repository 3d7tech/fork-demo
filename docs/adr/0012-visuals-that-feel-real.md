# 0012: Visuals that feel real

Date: 2026-10-09 · Status: proposed (agreed with Richard as the plan; not started)

## Problem

Today's visuals (before-and-after bars, the threshold ladder, the lever chart) are correct but
abstract: "£25,280 vs £25,408 a year" doesn't feel like anything. People decide with money they can
picture: a payslip, a monthly amount, a pot that grows. We already ship three.js (the ForkField
building animation, `packages/ui/src/ForkField.tsx`), loaded only when shown.

## Principles (unchanged by any visual)

1. **Every number and every proportion comes from the engine.** Visual data is built by code from
   `CalcResult` (the family's `visual()`), never by a model, and validated by the `VisualData` schema.
2. **The numbers stay as text.** A visual is never the only place a figure appears; each has a text
   or table equivalent for screen readers.
3. **Phone first:** 360px wide, light and dark themes, quick on a cheap Android phone.
4. **Motion is optional:** with reduced motion or no WebGL, a static SVG shows the same thing.
5. **No made-up comparisons.** "That's two weeks of groceries" needs a sourced figure; none until there is one.

## Plan

| Step | What | Engine work | Visual |
|---|---|---|---|
| 1 | **Your payslip, before and after.** Two payslips side by side, a month each: gross, tax, NI, student loan, pension, take-home. The lines that change move and highlight; the take-home difference is the hero ("£10.67 more a month"). | `jobPay` already splits tax, NI, student loan and pension; expose them as monthly outputs for both options. New `payslip` visual type. | SVG/HTML first (crisp text, accessible); motion on change. |
| 2 | **Where each £1 goes.** A pound of pay splits into streams (tax, NI, student loan, pension, take-home) before and after, so "sacrifice saves 28p of every £1" is seen, not read. | Marginal split per £1 from the engine (difference of two `jobPay` runs). New `flow` data (the type exists, unused). | three.js particles: coins flowing into pots, sized by the engine's shares. Static Sankey fallback. |
| 3 | **Your pension pot over time.** What this year's choice adds by retirement, as a pot that fills. | A new projection module with **sourced, labelled-estimate** growth and inflation assumptions (for example the FCA's projection rates); goes in the rule pack with sources, and in open questions until reviewed. | three.js pot or stacked coins growing year by year as the person drags the lever. Static area chart fallback. |
| 4 | **The tax cliff as a landscape.** £60,000 (Child Benefit), £100,000 (allowance and childcare): the effective rate on each extra £1 as terrain, with the person standing on it and the lever moving them. | Marginal rate across income, already computable from `jobPay` (sweep). | three.js height field; ladder fallback. |
| 5 | **The company view for owners.** Each switcher as a figure; the saving pooling into the company and pensions as take-up changes (ADR 0011 step 1). Counts only, no individuals. | Owner outputs at the take-up range. | three.js crowd of anonymous dots; bars fallback. |

Order: 1 (biggest gain, no 3D needed), then 2 and 4 (three.js, reuse ForkField's loading pattern),
then 3 (needs a reviewed projection source), then 5 with ADR 0011.

## How it fits the code

- New `VisualData` variants in `packages/spec` (`payslip`, `flow`, `pot`, `terrain`), each built by a
  family's `visual()` from engine outputs and listed in `numbers` where shown.
- Components in `packages/ui`, each with a static fallback and a hidden table; three.js imported
  lazily per visual, as ForkField does.
- `/preview` shows every visual in light and dark; e2e checks 360px fit and axe (run in the cloud
  environment, where the Playwright browser lives).
- A frame budget: no visual may drop below 50 frames a second on a mid-range phone, or it falls back.

## Open questions for Richard

- Projection growth rates for step 3: use the FCA's standard projection rates, or none until reviewed?
- Should the payslip view be the default visual for salary sacrifice, replacing the bars?
