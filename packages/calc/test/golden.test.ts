import { CalcResult } from '@fork/spec';
import { describe, expect, it } from 'vitest';
import { roundPounds, runModule } from '../src';
import { LARKFIELD } from './fixtures/larkfield';

// Golden cases from the brief (Quality and evaluation), using rule pack uk-2026-27. They must match to the pound.
const PACK = 'uk-2026-27';
const pounds = (r: CalcResult, k: string) => {
  const o = r.outputs[k];
  if (!o) throw new Error(`No output ${k}`);
  return roundPounds(o.value);
};

describe('golden: employee switches to salary sacrifice', () => {
  const r = runModule('pension.ss_switch', PACK, {
    salary: 32000,
    contributionPct: 5,
    reliefMethod: 'relief_at_source',
    employerSharePct: 50,
    employerContributionPct: 3,
    hoursPerWeek: 37.5,
  });
  it('take-home +£128, employer NI saved £240, +£120 into the pension', () => {
    expect(pounds(r, 'take_home_gain')).toBe(128);
    expect(pounds(r, 'employer_ni_saving')).toBe(240);
    expect(pounds(r, 'employer_share')).toBe(120);
    expect(r.verdict).toBe('switch');
  });
  it('validates as a CalcResult', () => expect(() => CalcResult.parse(r)).not.toThrow());
});

describe('golden: company introduces salary sacrifice (Larkfield)', () => {
  const r = runModule('employer.ss_introduce', PACK, {
    employees: LARKFIELD,
    contributionPct: 5,
    takeUpPct: 70,
    sharePct: 50,
    feePerEmployeePerMonth: 4,
    employmentAllowanceEligible: false,
  });
  it('2 excluded by minimum wage, 32 eligible', () => {
    expect(r.outputs.excluded_min_wage?.value).toBe(2);
    expect(r.outputs.eligible?.value).toBe(32);
  });
  it('fee £1,632', () => expect(pounds(r, 'fork_fee')).toBe(1632));
  it('employer NI saved £7,946 now and £6,250 from April 2029', () => {
    expect(pounds(r, 'employer_ni_saved')).toBe(7946);
    expect(pounds(r, 'employer_ni_saved_2029')).toBe(6250);
  });
  it('Larkfield keeps £2,341 now and £1,493 from 2029', () => {
    expect(pounds(r, 'company_keeps')).toBe(2341);
    expect(pounds(r, 'company_keeps_2029')).toBe(1493);
  });
  it('Fork pays for itself at 10 of 32 eligible staff', () => expect(r.outputs.payback_switchers?.value).toBe(10));
  it('Employment Allowance makes no difference to a £209k NI bill', () => {
    const ea = runModule('employer.ss_introduce', PACK, {
      employees: LARKFIELD, contributionPct: 5, takeUpPct: 70, sharePct: 50, feePerEmployeePerMonth: 4, employmentAllowanceEligible: true,
    });
    expect(pounds(ea, 'employer_ni_saved')).toBe(7946);
    expect(pounds(ea, 'employer_ni_bill')).toBe(209205);
  });
  it('validates as a CalcResult', () => expect(() => CalcResult.parse(r)).not.toThrow());
});

describe('golden: £100,000 threshold', () => {
  const r = runModule('pay.threshold_100k', PACK, {
    salary: 108000, sacrificePct: 5, extraSacrifice: 0, childrenUsingTaxFreeChildcare: 2, employerContributionPct: 3,
  });
  it('adjusted net income £102,600', () => expect(pounds(r, 'adjusted_net_income')).toBe(102600));
  it('extra £2,600 sacrifice costs £988 of take-home and keeps £4,000 of childcare', () => {
    expect(pounds(r, 'extra_to_threshold')).toBe(2600);
    expect(pounds(r, 'take_home_cost_to_threshold')).toBe(988);
    expect(pounds(r, 'childcare_kept_at_threshold')).toBe(4000);
  });
  it('the "about 62%" comes from the engine', () => expect(Math.round(r.outputs.marginal_rate_pct!.value)).toBe(62));
  it('the verdict flips at £2,600 of extra sacrifice', () => {
    expect(r.leverRanges[0]).toMatchObject({ verdict: 'over_threshold', from: 0, to: 2500 });
    expect(r.leverRanges[1]).toMatchObject({ verdict: 'under_threshold', from: 2600 });
  });
});

describe('golden: true cost of a hire', () => {
  const r = runModule('employer.hire_cost', PACK, {
    salary: 40000, employerPensionPct: 3, pensionBasis: 'full_salary', employeeSacrificePct: 5, extrasPerYear: 2000,
  });
  it('£48,150 a year: employer NI £4,950, pension £1,200', () => {
    expect(pounds(r, 'total')).toBe(48150);
    expect(pounds(r, 'employer_ni')).toBe(4950);
    expect(pounds(r, 'employer_pension')).toBe(1200);
  });
});

describe('golden: bonus as cash or pension', () => {
  const r = runModule('employer.bonus_cash_or_pension', PACK, { amountPerPerson: 1000, people: 34, pensionShare: 0.5, typicalSalary: 30000 });
  it('all cash costs £39,100; Larkfield saves £2,550', () => {
    expect(pounds(r, 'all_cash_cost')).toBe(39100);
    expect(pounds(r, 'company_saves')).toBe(2550);
  });
  it('the "72p" comes from the engine', () => expect(r.outputs.cash_reaches_per_pound?.value).toBeCloseTo(0.72, 10));
});

describe('golden: electric car scheme', () => {
  const r = runModule('benefits.ev_scheme', PACK, {
    salary: 58000,
    milesPerYear: 9000,
    homeCharging: true,
    scheme: { monthlyGross: 600, listPrice: 42000, termYears: 3, startDate: '2026-04-06' },
    ownCar: { leaseMonthly: 430, insuranceServicing: 1200, mpg: 45, fuelPerLitre: 1.4 },
    charging: { homePerKwh: 0.1, publicPerKwh: 0.7, milesPerKwh: 3.5 },
  });
  it('scheme about £5,329 a year against £7,633 for own petrol car', () => {
    expect(pounds(r, 'scheme_cost')).toBe(5329);
    expect(pounds(r, 'own_car_cost')).toBe(7633);
    expect(r.verdict).toBe('scheme');
  });
  it('averages the published 4%, 5% and 7% rates', () => expect(r.outputs.bik_rate_avg_pct?.value).toBeCloseTo(16 / 3, 10));
  it('labels own-car and charging figures as estimates', () => {
    expect(r.outputs.own_car_cost?.estimate).toBe(true);
    expect(r.outputs.scheme_charging?.estimate).toBe(true);
  });
});

describe('golden: how much to contribute (worked by hand)', () => {
  const base = { salary: 32000, hoursPerWeek: 37.5, currentPct: 5, chosenPct: 8, employerContributionPct: 3, reliefMethod: 'relief_at_source' as const, bySacrifice: false };
  it('relief at source: 8% puts £3,520 a year in for £2,048 of take-home; £960 more in for £768 more', () => {
    const r = runModule('pension.contribution_level', PACK, base);
    expect(pounds(r, 'your_contribution')).toBe(2560);
    expect(pounds(r, 'pension_total')).toBe(3520);
    expect(pounds(r, 'take_home_cost')).toBe(2048);
    expect(pounds(r, 'extra_into_pension')).toBe(960);
    expect(pounds(r, 'extra_take_home_cost')).toBe(768);
    expect(r.outputs.cost_per_pound?.value).toBeCloseTo(0.8, 10);
    expect(r.verdict).toBe('more');
  });
  it('by salary sacrifice the same 8% costs £1,843 (20% tax and 8% NI saved)', () => {
    const r = runModule('pension.contribution_level', PACK, { ...base, bySacrifice: true });
    expect(pounds(r, 'take_home_cost')).toBe(1843);
    expect(r.outputs.cost_per_pound?.value).toBeCloseTo(0.72, 10);
  });
  it('net pay: 8% costs £2,048 (20% tax relief, NI still due)', () => {
    const r = runModule('pension.contribution_level', PACK, { ...base, reliefMethod: 'net_pay' });
    expect(pounds(r, 'take_home_cost')).toBe(2048);
  });
  it('validates as a CalcResult', () => expect(() => CalcResult.parse(runModule('pension.contribution_level', PACK, base))).not.toThrow());
});
