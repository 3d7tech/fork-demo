import { loadRulePack } from '@fork/rules';
import { describe, expect, it } from 'vitest';
import { roundPounds, Rules, runModule, uk } from '../src';

const r = new Rules(loadRulePack('uk-2026-27'));
const r29 = r.at('2029-04-06');
const n = (d: { toNumber(): number }) => d.toNumber();

describe('income tax 2026-27, known answers', () => {
  it.each([
    [12570, 0],
    [30000, 3486],
    [60000, 11432],
    [100000, 27432],
    [110000, 33432], // allowance down to £7,570
    [125140, 42516], // allowance gone
    [150000, 53703],
  ])('£%i → £%i', (pay, tax) => expect(n(uk.incomeTax(r, pay))).toBeCloseTo(tax, 6));
});

describe('National Insurance 2026-27, known answers', () => {
  it('employee', () => {
    expect(n(uk.employeeNI(r, 12570))).toBe(0);
    expect(n(uk.employeeNI(r, 30000))).toBeCloseTo(1394.4, 6);
    expect(n(uk.employeeNI(r, 60000))).toBeCloseTo(3210.6, 6);
  });
  it('employer', () => {
    expect(n(uk.employerNI(r, 5000))).toBe(0);
    expect(n(uk.employerNI(r, 40000))).toBe(5250);
  });
});

describe('salary sacrifice cap from 6 April 2029', () => {
  it('sacrifice above £2,000 is NI-able again, for employee and employer', () => {
    expect(n(uk.niablePay(r, 60000, 6000))).toBe(54000);
    expect(n(uk.niablePay(r29, 60000, 6000))).toBe(58000);
    expect(n(uk.employerNISaving(r29, 60000, 6000))).toBe(300);
  });
  it('the employee switch case shows the post-2029 position from the same pack', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', {
      salary: 60000, contributionPct: 10, reliefMethod: 'net_pay', employerSharePct: 0, employerContributionPct: 3, hoursPerWeek: 37.5,
    });
    expect(roundPounds(res.outputs.take_home_gain!.value)).toBe(120); // 2% NI on £6,000
    expect(roundPounds(res.outputs.take_home_gain_2029!.value)).toBe(40); // 2% NI on the first £2,000 only
    expect(res.tippingPoint).toMatchObject({ at: 2000, from: '2029-04-06' });
  });
});

describe('employee switch: relief method matters', () => {
  const base = { contributionPct: 5, employerSharePct: 0, employerContributionPct: 3, hoursPerWeek: 37.5 } as const;
  it('net pay arrangement gains only the employee NI', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...base, salary: 32000, reliefMethod: 'net_pay' });
    expect(roundPounds(res.outputs.take_home_gain!.value)).toBe(128);
  });
  it('higher-rate taxpayer on relief at source also gains the higher-rate relief', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...base, salary: 60000, reliefMethod: 'relief_at_source' });
    expect(roundPounds(res.outputs.take_home_gain!.value)).toBe(660);
  });
  it('mortgage or parental leave turns the verdict into a caution', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...base, salary: 32000, reliefMethod: 'relief_at_source', mortgageIn12Months: true });
    expect(res.verdict).toBe('switch_with_caution');
  });
  it('never takes someone below the National Living Wage', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...base, salary: 25200, reliefMethod: 'relief_at_source' });
    expect(res.verdict).toBe('not_eligible');
    expect(res.constraints[0]).toMatchObject({ id: 'min_wage', outcome: 'excluded' });
  });
});

describe('Employment Allowance', () => {
  const run = (salaries: number[], ea: boolean) =>
    runModule('employer.ss_introduce', 'uk-2026-27', {
      employees: salaries.map((salary) => ({ salary, hoursPerWeek: 37.5 })),
      contributionPct: 5, takeUpPct: 100, sharePct: 0, feePerEmployeePerMonth: 4, employmentAllowanceEligible: ea,
    });
  it('a bill under the allowance means nothing is saved', () => {
    expect(run([30000, 30000], true).outputs.employer_ni_saved!.value).toBe(0);
    expect(run([30000, 30000], false).outputs.employer_ni_saved!.value).toBe(450);
  });
  it('a bill just above the allowance saves only the part above it', () => {
    // Bill £10,800 is £300 above the £10,500 allowance; a £615 saving can only remove that £300.
    expect(run([41000, 41000], true).outputs.employer_ni_saved!.value).toBe(300);
    expect(run([41000, 41000], false).outputs.employer_ni_saved!.value).toBe(615);
  });
});

describe('hire cost: pension basis is a scheme setting', () => {
  it('qualifying earnings basis', () => {
    const res = runModule('employer.hire_cost', 'uk-2026-27', {
      salary: 40000, employerPensionPct: 3, pensionBasis: 'qualifying_earnings', employeeSacrificePct: 0, extrasPerYear: 0,
    });
    expect(res.outputs.employer_pension!.value).toBeCloseTo(1012.8, 6);
  });
});

describe('modules are pure', () => {
  it('same input and pack give the same result', () => {
    const input = { salary: 108000, sacrificePct: 5, extraSacrifice: 1200, childrenUsingTaxFreeChildcare: 1, employerContributionPct: 3 };
    expect(runModule('pay.threshold_100k', 'uk-2026-27', input)).toEqual(runModule('pay.threshold_100k', 'uk-2026-27', input));
  });
  it('every run records the rules it used', () => {
    const res = runModule('pay.threshold_100k', 'uk-2026-27', {
      salary: 108000, sacrificePct: 5, extraSacrifice: 0, childrenUsingTaxFreeChildcare: 2, employerContributionPct: 3,
    });
    const ids = res.rulesUsed.map((u) => u.id);
    expect(ids).toContain('tax_free_childcare.income_limit');
    expect(ids).toContain('income_tax.allowance_taper_rate');
  });
});
