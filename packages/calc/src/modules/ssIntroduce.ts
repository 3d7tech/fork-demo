import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, max, q, ZERO, type Rules } from '../core';
import { employeeNI, employerNI, employerNISaving, meetsNLW, niablePay } from '../uk';
import { SS_CAP_FROM } from './ssSwitch';

export interface PayrollRow {
  salary: number;
  hoursPerWeek: number;
}

export interface SsIntroduceInput {
  employees: PayrollRow[];
  contributionPct: number;
  /** Share of eligible staff expected to switch. */
  takeUpPct: number;
  /** Share of the employer NI saving passed to staff pensions. */
  sharePct: number;
  /** Fork's fee: a company setting, per employee per month. */
  feePerEmployeePerMonth: number;
  /** Whether the company can claim the Employment Allowance. */
  employmentAllowanceEligible: boolean;
}

interface Totals {
  eligible: PayrollRow[];
  /** Employer NI saving if every eligible employee switched. */
  full: Decimal;
  /** Employee NI saving across every eligible employee. */
  eeNISaving: Decimal;
}

function totals(r: Rules, i: SsIntroduceInput): Totals {
  const c = D(i.contributionPct).div(100);
  const eligible = i.employees.filter((e) => meetsNLW(r, D(e.salary).times(D(1).minus(c)), e.hoursPerWeek));
  let full = ZERO;
  let eeNISaving = ZERO;
  for (const e of eligible) {
    const sac = D(e.salary).times(c);
    full = full.plus(employerNISaving(r, e.salary, sac));
    eeNISaving = eeNISaving.plus(employeeNI(r, e.salary).minus(employeeNI(r, niablePay(r, e.salary, sac))));
  }
  return { eligible, full, eeNISaving };
}

/**
 * A saving only counts where the company's NI bill is above the Employment Allowance:
 * NI that the allowance already covers was never going to be paid.
 */
function afterAllowance(r: Rules, i: SsIntroduceInput, saving: Decimal): Decimal {
  if (!i.employmentAllowanceEligible) return saving;
  const bill = i.employees.reduce((a, e) => a.plus(employerNI(r, e.salary)), ZERO);
  const ea = r.num('er_ni.employment_allowance');
  return max(0, bill.minus(ea)).minus(max(0, bill.minus(saving).minus(ea)));
}

function scenario(r: Rules, i: SsIntroduceInput, fee: Decimal) {
  const t = totals(r, i);
  const save = afterAllowance(r, i, t.full.times(i.takeUpPct).div(100));
  const pass = save.times(i.sharePct).div(100);
  return { ...t, save, pass, keep: save.minus(pass).minus(fee) };
}

export function ssIntroduce(r: Rules, i: SsIntroduceInput): CalcResult {
  const fee = D(i.feePerEmployeePerMonth).times(i.employees.length).times(12);
  const now = scenario(r, i, fee);
  const later = scenario(r.at(SS_CAP_FROM), i, fee);
  const n = now.eligible.length;
  const share = D(i.sharePct).div(100);

  // How many switchers the company needs before Fork pays for itself, using the average kept per switcher.
  const keptPerSwitcher = n ? now.full.div(n).times(D(1).minus(share)) : ZERO;
  const payback = keptPerSwitcher.gt(0) ? fee.div(keptPerSwitcher).ceil() : null;
  const employeeAvgGain = n ? now.eeNISaving.plus(now.full.times(share)).div(n) : ZERO;
  const bill = i.employees.reduce((a, e) => a.plus(employerNI(r, e.salary)), ZERO);

  return {
    module: 'employer.ss_introduce',
    rulePack: r.packInfo(),
    verdict: now.keep.gt(0) ? 'introduce' : 'saving_below_fee',
    outputs: {
      headcount: q(i.employees.length, 'count', 'Employees on payroll'),
      excluded_min_wage: q(i.employees.length - n, 'count', 'Left out to protect the minimum wage'),
      eligible: q(n, 'count', 'Eligible staff'),
      joiners: q(D(n).times(i.takeUpPct).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP), 'count', 'Expected to switch'),
      employer_ni_bill: q(bill, 'GBP', 'Employer NI bill a year today'),
      employer_ni_saved: q(now.save, 'GBP', 'Employer NI saved a year'),
      employer_ni_saved_2029: q(later.save, 'GBP', 'Employer NI saved a year from April 2029'),
      shared_with_staff: q(now.pass, 'GBP', 'Shared with staff pensions'),
      shared_with_staff_2029: q(later.pass, 'GBP', 'Shared with staff from April 2029'),
      fork_fee: q(fee, 'GBP', 'Fork fee a year'),
      company_keeps: q(now.keep, 'GBP', 'Company keeps a year'),
      company_keeps_2029: q(later.keep, 'GBP', 'Company keeps a year from April 2029'),
      employee_avg_gain: q(employeeAvgGain, 'GBP', 'Average gain for each employee who switches'),
      ...(payback ? { payback_switchers: q(payback, 'count', 'Switchers needed for Fork to pay for itself') } : {}),
    },
    tippingPoint: payback ? { description: 'Fork pays for itself once this many eligible staff switch', measure: 'switchers', at: payback.toNumber(), unit: 'count' } : undefined,
    leverRanges: leverRanges('take_up_pct', { min: 0, max: 100, step: 5 }, (v) =>
      scenario(r, { ...i, takeUpPct: v }, fee).keep.gt(0) ? 'introduce' : 'saving_below_fee',
    ),
    // Leaving people out is a caution, not a pass: the owner needs to know who can't join.
    constraints: [{ id: 'min_wage', outcome: i.employees.length - n > 0 ? 'caution' : 'pass', detail: `${i.employees.length - n} employees left out so sacrifice never takes anyone below the National Living Wage` }],
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `${i.employees.length} salaries and contracted hours from the payroll export`, source: 'payroll_export', estimate: false },
      { text: `Staff contribute ${i.contributionPct}% of pay`, source: 'pension_scheme', estimate: false },
      { text: `${i.takeUpPct}% of eligible staff switch`, source: 'user_answer', estimate: true },
      { text: `${i.sharePct}% of the saving goes into staff pensions`, source: 'company_setting', estimate: false },
      { text: `Fork costs £${i.feePerEmployeePerMonth} per employee per month`, source: 'company_setting', estimate: false },
      {
        text: i.employmentAllowanceEligible ? 'Employment Allowance claimed: only NI above the allowance counts as saved' : 'Employment Allowance not claimed',
        source: 'company_setting',
        estimate: false,
      },
    ],
  };
}
