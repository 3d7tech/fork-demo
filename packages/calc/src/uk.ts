import { D, Decimal, max, min, ZERO, type Num, type Rules } from './core';

/**
 * Yearly UK (rest of UK) income tax on taxable pay, with the personal allowance taper.
 * Annual approximation: payroll works per pay period and rounds differently, which can move results by pennies.
 */
export function incomeTax(r: Rules, pay: Num): Decimal {
  const p = D(pay);
  const pa0 = r.num('income_tax.personal_allowance');
  const taperFrom = r.num('income_tax.allowance_taper_threshold');
  const taperRate = r.num('income_tax.allowance_taper_rate');
  const pa = p.gt(taperFrom) ? max(0, pa0.minus(p.minus(taperFrom).times(taperRate))) : pa0;
  const t = max(0, p.minus(pa));
  const band = r.num('income_tax.basic_band');
  const addl = r.num('income_tax.additional_threshold');
  return min(t, band)
    .times(r.num('income_tax.basic_rate'))
    .plus(max(0, min(t, addl).minus(band)).times(r.num('income_tax.higher_rate')))
    .plus(max(0, t.minus(addl)).times(r.num('income_tax.additional_rate')));
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

/** Yearly hours from weekly contracted hours. */
export function yearlyHours(hoursPerWeek: Num): Decimal {
  return D(hoursPerWeek).times(52);
}

/** True if pay after sacrifice still meets the National Living Wage (workers aged 21 and over). */
export function meetsNLW(r: Rules, payAfterSacrifice: Num, hoursPerWeek: Num): boolean {
  return D(payAfterSacrifice).div(yearlyHours(hoursPerWeek)).gte(r.num('min_wage.nlw_21_plus'));
}

export { ZERO };
