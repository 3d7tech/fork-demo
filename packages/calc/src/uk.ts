import { D, Decimal, max, min, ZERO, type Num, type Rules } from './core';

export type TaxRegion = 'rest_of_uk' | 'scotland';
export type StudentLoanPlan = 'plan_1' | 'plan_2' | 'plan_4' | 'plan_5' | 'postgraduate';

/**
 * What about a person changes their sums beyond pay (ADR 0010). Every field has a safe default,
 * and each default a screen relies on is listed there as an assumption.
 */
export interface TaxProfile {
  region: TaxRegion;
  studentLoans: StudentLoanPlan[];
  /** Overtime, commission or bonus through this payroll, a year. Taxed and NI'd with salary. */
  variablePay: number;
  /** Taxable income outside this job a year (second job, rental, self-employed profit). Not savings or dividends. */
  otherIncome: number;
  /** Children Child Benefit is claimed for in the household. */
  childBenefitChildren: number;
  /** Whether this person is the higher earner in the household, so the Child Benefit charge falls on them. */
  higherEarner: boolean;
  /** Paid into other pensions a year, gross (personal pensions, a previous employer's scheme). */
  otherPensionSavings: number;
  /** Has taken money flexibly from a pension, so the money purchase annual allowance applies. */
  flexiblyAccessed: boolean;
  /** Age on the first day of the tax year, if known. */
  age: number | null;
}

export const DEFAULT_PROFILE: TaxProfile = {
  region: 'rest_of_uk',
  studentLoans: [],
  variablePay: 0,
  otherIncome: 0,
  childBenefitChildren: 0,
  higherEarner: true,
  otherPensionSavings: 0,
  flexiblyAccessed: false,
  age: null,
};

/** Personal allowance after the taper, which follows adjusted net income. */
export function personalAllowance(r: Rules, ani: Num): Decimal {
  const pa0 = r.num('income_tax.personal_allowance');
  const taperFrom = r.num('income_tax.allowance_taper_threshold');
  const a = D(ani);
  return a.gt(taperFrom) ? max(0, pa0.minus(a.minus(taperFrom).times(r.num('income_tax.allowance_taper_rate')))) : pa0;
}

/**
 * Yearly income tax on taxable income, with the personal allowance taper. The taper follows
 * adjusted net income, which is lower than income when relief-at-source contributions are paid.
 * Annual approximation: payroll works per pay period and rounds differently, which can move results by pennies.
 */
export function incomeTax(r: Rules, income: Num, region: TaxRegion = 'rest_of_uk', ani: Num = income): Decimal {
  const t = max(0, D(income).minus(personalAllowance(r, ani)));
  if (region === 'scotland') {
    const s = (k: string) => r.num(`income_tax.scotland.${k}`);
    const bands: Array<[Decimal | null, Decimal]> = [
      [s('starter_limit'), s('starter_rate')],
      [s('basic_limit'), s('basic_rate')],
      [s('intermediate_limit'), s('intermediate_rate')],
      [s('higher_limit'), s('higher_rate')],
      [s('advanced_limit'), s('advanced_rate')],
      [null, s('top_rate')],
    ];
    let tax = ZERO;
    let from = ZERO;
    for (const [to, rate] of bands) {
      const top = to === null ? t : min(t, to);
      if (top.gt(from)) tax = tax.plus(top.minus(from).times(rate));
      if (to !== null) from = to;
    }
    return tax;
  }
  const band = r.num('income_tax.basic_band');
  const addl = r.num('income_tax.additional_threshold');
  return min(t, band)
    .times(r.num('income_tax.basic_rate'))
    .plus(max(0, min(t, addl).minus(band)).times(r.num('income_tax.higher_rate')))
    .plus(max(0, t.minus(addl)).times(r.num('income_tax.additional_rate')));
}

/**
 * Yearly student loan repayments on earnings from this job. With more than one undergraduate plan,
 * 9% is taken above the lowest of their thresholds; a postgraduate loan adds 6% above its own.
 */
export function studentLoan(r: Rules, earnings: Num, plans: StudentLoanPlan[]): Decimal {
  const e = D(earnings);
  const undergrad = plans.filter((p) => p !== 'postgraduate').map((p) => r.num(`student_loan.${p}_threshold`));
  let total = ZERO;
  if (undergrad.length) total = total.plus(max(0, e.minus(Decimal.min(...undergrad))).times(r.num('student_loan.rate')));
  if (plans.includes('postgraduate')) total = total.plus(max(0, e.minus(r.num('student_loan.postgraduate_threshold'))).times(r.num('student_loan.postgraduate_rate')));
  return total;
}

/** Child Benefit a year for a number of children. */
export function childBenefit(r: Rules, children: number): Decimal {
  if (children <= 0) return ZERO;
  return r.num('child_benefit.eldest_weekly').plus(r.num('child_benefit.additional_weekly').times(children - 1)).times(52);
}

/**
 * High Income Child Benefit Charge: 1% of the Child Benefit for every whole £200 of adjusted net
 * income over the threshold, so all of it by £80,000. Falls on the higher earner only.
 */
export function childBenefitCharge(r: Rules, ani: Num, profile: Pick<TaxProfile, 'childBenefitChildren' | 'higherEarner'>): Decimal {
  if (!profile.higherEarner || profile.childBenefitChildren <= 0) return ZERO;
  const over = D(ani).minus(r.num('child_benefit_charge.threshold'));
  if (over.lte(0)) return ZERO;
  const pct = Decimal.min(100, over.div(r.num('child_benefit_charge.income_per_percent')).floor());
  return childBenefit(r, profile.childBenefitChildren).times(pct).div(100);
}

/**
 * The pension annual allowance for someone saving into money purchase pensions (every workplace
 * scheme Fork supports): tapered above the adjusted income limit, and the money purchase
 * allowance once a pension has been accessed flexibly. Carry forward is not included.
 */
export function annualAllowance(r: Rules, i: { thresholdIncome: Num; adjustedIncome: Num; flexiblyAccessed: boolean }): Decimal {
  let aa = r.num('pension.annual_allowance');
  if (D(i.thresholdIncome).gt(r.num('pension.annual_allowance_taper_threshold_income'))) {
    const over = max(0, D(i.adjustedIncome).minus(r.num('pension.annual_allowance_taper_adjusted_income')));
    aa = max(r.num('pension.annual_allowance_minimum'), aa.minus(over.times(r.num('pension.annual_allowance_taper_rate'))));
  }
  return i.flexiblyAccessed ? min(aa, r.num('pension.money_purchase_annual_allowance')) : aa;
}

/** The minimum wage an hour for an age. Unknown age uses the 21-and-over rate. */
export function minimumWage(r: Rules, age: number | null): Decimal {
  if (age === null || age >= 21) return r.num('min_wage.nlw_21_plus');
  if (age >= 18) return r.num('min_wage.rate_18_20');
  return r.num('min_wage.rate_under_18');
}

/** Yearly employee Class 1 National Insurance on NI-able pay. */
export function employeeNI(r: Rules, pay: Num): Decimal {
  const p = D(pay);
  const pt = r.num('ee_ni.primary_threshold');
  const uel = r.num('ee_ni.upper_earnings_limit');
  return max(0, min(p, uel).minus(pt))
    .times(r.num('ee_ni.main_rate'))
    .plus(max(0, p.minus(uel)).times(r.num('ee_ni.upper_rate')));
}

/** Yearly employer Class 1 National Insurance on NI-able pay, before any Employment Allowance. */
export function employerNI(r: Rules, pay: Num): Decimal {
  return max(0, D(pay).minus(r.num('er_ni.secondary_threshold'))).times(r.num('er_ni.rate'));
}

/**
 * Pay that National Insurance is charged on after a pension salary sacrifice.
 * From 6 April 2029 sacrifice above the yearly cap is NI-able again.
 */
export function niablePay(r: Rules, salary: Num, sacrifice: Num): Decimal {
  const cap = r.limit('salary_sacrifice.pension_ni_cap');
  const sac = D(sacrifice);
  const relieved = cap === null ? sac : min(sac, cap);
  return D(salary).minus(relieved);
}

/** Take-home pay a year for someone on a given salary who sacrifices `sacrifice` into a pension. */
export function takeHome(r: Rules, salary: Num, sacrifice: Num = 0): Decimal {
  const taxable = D(salary).minus(sacrifice);
  return taxable.minus(incomeTax(r, taxable)).minus(employeeNI(r, niablePay(r, salary, sacrifice)));
}

/** Employer NI saved by an employee sacrificing `sacrifice`, respecting the future cap. */
export function employerNISaving(r: Rules, salary: Num, sacrifice: Num): Decimal {
  return employerNI(r, salary).minus(employerNI(r, niablePay(r, salary, sacrifice)));
}

export interface JobPayInput {
  /** Basic salary from this job a year, before any sacrifice. Variable pay comes from the profile. */
  salary: Num;
  /** Pension paid by salary sacrifice a year. */
  sacrifice?: Num;
  /** Pension paid by a net pay arrangement a year: before income tax, not before NI. */
  netPay?: Num;
  /** Pension paid by relief at source a year, gross: the person pays it less basic-rate relief, from take-home pay. */
  reliefAtSource?: Num;
  /** A non-pension salary sacrifice a year (a bike, a car): free of tax, NI and student loan, with no 2029 cap. */
  otherSacrifice?: Num;
  /** A taxable benefit in kind a year, such as a company car: income tax, but no employee NI. */
  benefitInKind?: Num;
  profile: TaxProfile;
}

export interface JobPay {
  /** Pay from this job after sacrifice, including variable pay. */
  pay: Decimal;
  incomeTax: Decimal;
  employeeNI: Decimal;
  studentLoan: Decimal;
  /** What relief-at-source contributions cost from take-home pay. */
  pensionFromPay: Decimal;
  /** What lands in the bank from this job a year. */
  takeHome: Decimal;
  /** Adjusted net income, for the allowance taper, the Child Benefit charge and Tax-Free Childcare. */
  adjustedNetIncome: Decimal;
  childBenefitCharge: Decimal;
}

/**
 * One person's yearly position from this job, with their whole profile. Income tax is worked out
 * on all their taxable income and the share caused by this job is charged to it, so other income
 * moves the rates this job pays without being counted as take-home. Student loan and NI are on this
 * job's NI-able earnings only, as payroll takes them.
 */
export function jobPay(r: Rules, i: JobPayInput): JobPay {
  const p = i.profile;
  const sacrifice = D(i.sacrifice ?? 0);
  const netPay = D(i.netPay ?? 0);
  const ras = D(i.reliefAtSource ?? 0);
  const otherSacrifice = D(i.otherSacrifice ?? 0);
  const gross = D(i.salary).plus(p.variablePay).minus(otherSacrifice);
  const pay = gross.minus(sacrifice);
  const niable = niablePay(r, gross, sacrifice);
  const other = D(p.otherIncome);
  const taxable = pay.minus(netPay).plus(other).plus(i.benefitInKind ?? 0);
  const ani = taxable.minus(ras);
  const tax = incomeTax(r, taxable, p.region, ani).minus(other.gt(0) ? incomeTax(r, other, p.region, other) : ZERO);
  const ni = employeeNI(r, niable);
  const sl = studentLoan(r, niable, p.studentLoans);
  const pensionFromPay = ras.times(D(1).minus(r.num('pension.relief_at_source_rate')));
  return {
    pay,
    incomeTax: tax,
    employeeNI: ni,
    studentLoan: sl,
    pensionFromPay,
    takeHome: pay.minus(netPay).minus(tax).minus(ni).minus(sl).minus(pensionFromPay),
    adjustedNetIncome: ani,
    childBenefitCharge: childBenefitCharge(r, ani, p),
  };
}

/** Yearly hours from weekly contracted hours. */
export function yearlyHours(hoursPerWeek: Num): Decimal {
  return D(hoursPerWeek).times(52);
}

/** True if pay after sacrifice still meets the National Living Wage (workers aged 21 and over). */
export function meetsNLW(r: Rules, payAfterSacrifice: Num, hoursPerWeek: Num): boolean {
  return D(payAfterSacrifice).div(yearlyHours(hoursPerWeek)).gte(r.num('min_wage.nlw_21_plus'));
}

export { ZERO };
