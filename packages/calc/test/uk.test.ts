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

// ---------- A person's tax profile (ADR 0010). Every figure worked by hand from the 2026-27 sources. ----------

const P = (over: Partial<uk.TaxProfile> = {}): uk.TaxProfile => ({ ...uk.DEFAULT_PROFILE, ...over });

describe('Scottish income tax 2026-27, known answers', () => {
  it.each([
    [12570, 0],
    // taxable 17,430: 3,967 × 19% + 12,989 × 20% + 474 × 21%
    [30000, 3451.07],
    // taxable 47,430: 753.73 + 2,597.80 + 14,136 × 21% + 16,338 × 42%
    [60000, 13182.05],
    // taxable 87,430: … + 31,338 × 42% + 25,000 × 45%
    [100000, 30732.05],
    // no allowance: … + 62,710 × 45% + 24,860 × 48%
    [150000, 59634.35],
  ])('£%i → £%d', (pay, tax) => expect(n(uk.incomeTax(r, pay, 'scotland'))).toBeCloseTo(tax, 6));

  it('rest of UK is unchanged when no region is given', () => {
    expect(n(uk.incomeTax(r, 30000))).toBe(n(uk.incomeTax(r, 30000, 'rest_of_uk')));
  });
});

describe('the allowance taper follows adjusted net income', () => {
  it('£110,000 with £10,000 gross relief-at-source keeps the full allowance', () => {
    // taxable 97,430: 37,700 × 20% + 59,730 × 40%
    expect(n(uk.incomeTax(r, 110000, 'rest_of_uk', 100000))).toBeCloseTo(31432, 6);
    expect(n(uk.incomeTax(r, 110000))).toBeCloseTo(33432, 6);
  });
});

describe('student loans 2026-27, known answers', () => {
  it.each([
    [40000, ['plan_2'], 955.35], // 10,615 × 9%
    [30000, ['plan_1', 'plan_2'], 279], // lowest threshold 26,900: 3,100 × 9%
    [30000, ['postgraduate'], 540], // 9,000 × 6%
    [30000, ['plan_5', 'postgraduate'], 990], // 5,000 × 9% + 540
    [33000, ['plan_4'], 0],
    [30000, [], 0],
  ] as Array<[number, uk.StudentLoanPlan[], number]>)('£%i on %j → £%d', (pay, plans, due) => expect(n(uk.studentLoan(r, pay, plans))).toBeCloseTo(due, 6));
});

describe('Child Benefit and the High Income Child Benefit Charge', () => {
  const two = { childBenefitChildren: 2, higherEarner: true };
  it('two children get (£27.05 + £17.90) × 52 a year', () => expect(n(uk.childBenefit(r, 2))).toBeCloseTo(2337.4, 6));
  it.each([
    [60000, 0],
    [60199, 0], // under one whole £200
    [70000, 1168.7], // 50%
    [70150, 1168.7], // still 50%: part of £200 is ignored
    [80000, 2337.4], // all of it
    [95000, 2337.4],
  ])('adjusted net income £%i → charge £%d', (ani, charge) => expect(n(uk.childBenefitCharge(r, ani, two))).toBeCloseTo(charge, 6));
  it('falls only on the higher earner, and only with children', () => {
    expect(n(uk.childBenefitCharge(r, 75000, { childBenefitChildren: 2, higherEarner: false }))).toBe(0);
    expect(n(uk.childBenefitCharge(r, 75000, { childBenefitChildren: 0, higherEarner: true }))).toBe(0);
  });
});

describe('pension annual allowance', () => {
  it.each([
    [150000, 300000, false, 60000], // threshold income too low to taper
    [210000, 300000, false, 40000], // 40,000 over: lose 20,000
    [210000, 400000, false, 10000], // never below the minimum
    [50000, 50000, true, 10000], // money purchase allowance after flexible access
  ])('threshold £%i, adjusted £%i, accessed %s → £%i', (thresholdIncome, adjustedIncome, flexiblyAccessed, aa) =>
    expect(n(uk.annualAllowance(r, { thresholdIncome, adjustedIncome, flexiblyAccessed }))).toBe(aa),
  );
});

describe('minimum wage by age, from 1 April 2026', () => {
  it.each([
    [null, 12.71],
    [21, 12.71],
    [20, 10.85],
    [18, 10.85],
    [17, 8],
  ])('age %s → £%d an hour', (age, rate) => expect(n(uk.minimumWage(r, age))).toBe(rate));
});

describe('take-home from a job, with the whole profile', () => {
  it('the default profile matches the original take-home', () => {
    for (const [salary, sacrifice] of [[32000, 1600], [60000, 6000], [110000, 10000]] as const) {
      expect(n(uk.jobPay(r, { salary, sacrifice, profile: P() }).takeHome)).toBeCloseTo(n(uk.takeHome(r, salary, sacrifice)), 6);
    }
  });

  it('a Plan 2 loan is cut by salary sacrifice but not by relief at source', () => {
    // £40,000, 5% (£2,000). Sacrifice: loan on 38,000. Relief at source: loan on 40,000.
    const ss = uk.jobPay(r, { salary: 40000, sacrifice: 2000, profile: P({ studentLoans: ['plan_2'] }) });
    const ras = uk.jobPay(r, { salary: 40000, reliefAtSource: 2000, profile: P({ studentLoans: ['plan_2'] }) });
    expect(n(ss.studentLoan)).toBeCloseTo(775.35, 6);
    expect(n(ras.studentLoan)).toBeCloseTo(955.35, 6);
    expect(n(ras.pensionFromPay)).toBe(1600);
  });

  it('other income moves the rate this job pays, but is not counted as take-home', () => {
    // £45,000 job plus £10,000 rental. Each extra £1,000 of pay costs 20% alone, 40% with the rent.
    const extra = (profile: uk.TaxProfile) => n(uk.jobPay(r, { salary: 46000, profile }).incomeTax.minus(uk.jobPay(r, { salary: 45000, profile }).incomeTax));
    expect(extra(P())).toBeCloseTo(200, 6);
    expect(extra(P({ otherIncome: 10000 }))).toBeCloseTo(400, 6);
    // The job carries all tax beyond what the rent would pay on its own (nothing, inside the allowance):
    // 7,540 + 4,730 × 40% on £55,000. The difference between options is the same whichever way it's split.
    const withRent = uk.jobPay(r, { salary: 45000, profile: P({ otherIncome: 10000 }) });
    expect(n(withRent.incomeTax)).toBeCloseTo(9432, 6);
    expect(n(withRent.adjustedNetIncome)).toBe(55000);
  });

  it('variable pay is taxed and NI’d with salary', () => {
    expect(n(uk.jobPay(r, { salary: 30000, profile: P({ variablePay: 5000 }) }).takeHome)).toBeCloseTo(n(uk.takeHome(r, 35000)), 6);
  });

  it('the Child Benefit charge follows adjusted net income after the pension', () => {
    // £70,000, two children: ANI 70,000 → 50%. Sacrificing £10,000 → ANI 60,000 → nothing.
    const two = P({ childBenefitChildren: 2 });
    expect(n(uk.jobPay(r, { salary: 70000, profile: two }).childBenefitCharge)).toBeCloseTo(1168.7, 6);
    expect(n(uk.jobPay(r, { salary: 70000, sacrifice: 10000, profile: two }).childBenefitCharge)).toBe(0);
    // Relief at source also lowers ANI, grossed up.
    expect(n(uk.jobPay(r, { salary: 70000, reliefAtSource: 10000, profile: two }).childBenefitCharge)).toBe(0);
  });

  it('a Scottish taxpayer on £30,000 pays the Scottish figure', () => {
    expect(n(uk.jobPay(r, { salary: 30000, profile: P({ region: 'scotland' }) }).incomeTax)).toBeCloseTo(3451.07, 6);
  });
});

describe('switching to salary sacrifice with a tax profile', () => {
  const ella = { salary: 32000, contributionPct: 5, reliefMethod: 'relief_at_source' as const, employerSharePct: 50, employerContributionPct: 3, hoursPerWeek: 37.5 };

  it('a Scottish taxpayer repaying a Plan 2 loan gains £288, not £128', () => {
    // Today (relief at source): Scottish tax on 19,430 taxable = 3,871.07; NI 1,554.40; loan 2,615 × 9% = 235.35;
    // pays 1,280 net into the pension. Take-home 25,059.18.
    // Sacrifice: pay 30,400. Tax 3,535.07; NI 1,426.40; loan 1,015 × 9% = 91.35. Take-home 25,347.18.
    // Gain 288: 1,600 relieved at 21% not 20% (16), NI 128, loan 144.
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...ella, profile: P({ region: 'scotland', studentLoans: ['plan_2'] }), assumed: [] });
    expect(res.outputs.take_home_before!.value).toBeCloseTo(25059.18, 6);
    expect(res.outputs.take_home_after!.value).toBeCloseTo(25347.18, 6);
    expect(res.outputs.take_home_gain!.value).toBeCloseTo(288, 6);
    expect(res.outputs.student_loan_saving!.value).toBeCloseTo(144, 6);
    expect(res.assumptions.map((a) => a.text)).toEqual(expect.arrayContaining(['Scottish income tax rates', 'Repaying Plan 2 through payroll']));
    expect(res.assumptions.find((a) => a.text === 'Scottish income tax rates')).toMatchObject({ fact: 'tax_region', estimate: false });
  });

  it('without a profile, the defaults are listed as estimates', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', ella);
    expect(res.outputs.take_home_gain!.value).toBeCloseTo(128, 6);
    expect(res.assumptions.filter((a) => a.source === 'estimate').map((a) => a.text)).toEqual(
      expect.arrayContaining(['Income tax rates for England, Wales and Northern Ireland', 'No student loan to repay', 'No overtime, commission or income outside this job', 'Your age isn’t known, so the minimum wage check uses the adult rate']),
    );
  });

  it('savings over the annual allowance make the switch a caution', () => {
    const res = runModule('pension.ss_switch', 'uk-2026-27', { ...ella, salary: 150000, contributionPct: 10, profile: P({ otherPensionSavings: 40000 }), assumed: [] });
    expect(res.constraints).toContainEqual({ id: 'annual_allowance', outcome: 'caution' });
    expect(res.verdict).toBe('switch_with_caution');
    expect(res.outputs.annual_allowance!.value).toBe(60000);
  });

  it('a 19-year-old is checked against the 18 to 20 rate', () => {
    // £21,000 at 37.5 hours, 5% sacrificed: £19,950 / 1,950 hours = £10.23, under £10.85.
    const young = { ...ella, salary: 21000, profile: P({ age: 19 }), assumed: [] };
    expect(runModule('pension.ss_switch', 'uk-2026-27', young).constraints).toContainEqual({ id: 'min_wage', outcome: 'excluded' });
  });
});
