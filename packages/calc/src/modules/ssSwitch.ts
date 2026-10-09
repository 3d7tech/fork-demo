import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, q, type Rules } from '../core';
import { annualAllowanceCheck, profileAssumptions, profileOf, type Profiled } from '../profile';
import { employerNISaving, jobPay, minimumWage, payslipMonth, payslipOutputs, yearlyHours } from '../uk';

export interface SsSwitchInput extends Profiled {
  salary: number;
  contributionPct: number;
  /** How the pension takes contributions today, from the scheme facts. */
  reliefMethod: 'relief_at_source' | 'net_pay';
  /** Share of the employer's NI saving the company adds to the employee's pension. */
  employerSharePct: number;
  employerContributionPct: number;
  hoursPerWeek: number;
  mortgageIn12Months?: boolean;
  parentalLeaveIn12Months?: boolean;
}

/** Date the salary sacrifice NI cap starts. The value itself is read from the rule pack. */
export const SS_CAP_FROM = '2029-04-06';

function at(r: Rules, i: SsSwitchInput) {
  const profile = profileOf(i);
  const salary = D(i.salary);
  const con = salary.times(i.contributionPct).div(100);
  // Today: relief at source is paid from take-home pay with basic-rate relief added; a net pay
  // arrangement is taken before income tax but not before NI or student loan.
  const before = jobPay(r, { salary, profile, ...(i.reliefMethod === 'relief_at_source' ? { reliefAtSource: con } : { netPay: con }) });
  const after = jobPay(r, { salary, sacrifice: con, profile });
  const gain = after.takeHome.minus(before.takeHome);
  const erSaving = employerNISaving(r, salary.plus(profile.variablePay), con);
  const share = erSaving.times(i.employerSharePct).div(100);
  const chargeSaved = before.childBenefitCharge.minus(after.childBenefitCharge);
  const gross = salary.plus(profile.variablePay);
  const slips = {
    before: payslipMonth(before, gross, i.reliefMethod === 'relief_at_source' ? before.pensionFromPay : con),
    after: payslipMonth(after, gross, con),
  };
  return { salary, con, before, after, gain, erSaving, share, chargeSaved, slips, loanSaved: before.studentLoan.minus(after.studentLoan) };
}

/** Basic pay after sacrifice against the minimum wage for the person's age. Variable pay isn't counted on. */
const meetsMinimumWage = (r: Rules, i: SsSwitchInput, payAfter: Decimal) => payAfter.div(yearlyHours(i.hoursPerWeek)).gte(minimumWage(r, profileOf(i).age));

export function ssSwitch(r: Rules, i: SsSwitchInput): CalcResult {
  const now = at(r, i);
  const r29 = r.at(SS_CAP_FROM);
  const later = at(r29, i);
  const cap = r29.limit('salary_sacrifice.pension_ni_cap');
  const minWageOk = meetsMinimumWage(r, i, now.salary.minus(now.con));
  const employerPension = now.salary.times(i.employerContributionPct).div(100);
  const allowance = annualAllowanceCheck(r, { ...i, personal: now.con, employer: employerPension.plus(now.share) });

  const constraints: CalcResult['constraints'] = [{ id: 'min_wage', outcome: minWageOk ? 'pass' : 'excluded' }, allowance.constraint];
  if (i.mortgageIn12Months !== undefined) constraints.push({ id: 'mortgage_12m', outcome: i.mortgageIn12Months ? 'caution' : 'pass' });
  if (i.parentalLeaveIn12Months !== undefined) constraints.push({ id: 'parental_leave_12m', outcome: i.parentalLeaveIn12Months ? 'caution' : 'pass' });
  const caution = constraints.some((c) => c.outcome === 'caution');

  const verdictFor = (gain: Decimal, ok: boolean) => (!ok ? 'not_eligible' : gain.lte(0) ? 'stay' : caution ? 'switch_with_caution' : 'switch');

  // Statutory parental pay for the first six weeks is 90% of average weekly earnings, which sacrifice lowers.
  const parentalPayReduction = now.con.times(0.9).div(52).times(6);

  return {
    module: 'pension.ss_switch',
    rulePack: r.packInfo(),
    verdict: verdictFor(now.gain, minWageOk),
    outputs: {
      contribution: q(now.con, 'GBP', 'Your contribution a year'),
      take_home_before: q(now.before.takeHome, 'GBP', 'Take-home a year today'),
      take_home_after: q(now.after.takeHome, 'GBP', 'Take-home a year on salary sacrifice'),
      take_home_gain: q(now.gain, 'GBP', 'Extra take-home a year'),
      employer_ni_saving: q(now.erSaving, 'GBP', 'Employer NI saved a year'),
      employer_share: q(now.share, 'GBP', 'Extra into your pension from the employer’s saving'),
      pension_total: q(now.con.plus(employerPension).plus(now.share), 'GBP', 'Into your pension a year'),
      total_gain: q(now.gain.plus(now.share).plus(now.chargeSaved), 'GBP', 'Total gain a year'),
      ...(profileOf(i).studentLoans.length ? { student_loan_saving: q(now.loanSaved, 'GBP', 'Less student loan repaid a year') } : {}),
      ...(now.chargeSaved.gt(0) ? { child_benefit_charge_saving: q(now.chargeSaved, 'GBP', 'Less Child Benefit charge a year') } : {}),
      ...(allowance.constraint.outcome === 'caution' ? { annual_allowance: q(allowance.allowance, 'GBP', 'Your pension annual allowance') } : {}),
      ...payslipOutputs('slip_today', 'today', now.slips.before, profileOf(i).studentLoans.length > 0),
      ...payslipOutputs('slip_sacrifice', 'on salary sacrifice', now.slips.after, profileOf(i).studentLoans.length > 0),
      slip_gain: q(now.slips.after.takeHome.minus(now.slips.before.takeHome), 'GBP_pence', 'Extra take-home a month'),
      take_home_gain_2029: q(later.gain, 'GBP', 'Extra take-home a year from April 2029', true),
      employer_share_2029: q(later.share, 'GBP', 'Employer share from April 2029', true),
      parental_pay_reduction: q(parentalPayReduction, 'GBP', 'Less statutory parental pay over the first six weeks'),
      ...(cap ? { cap_pct_of_pay: q(cap.div(now.salary).times(100), 'pct', 'Contribution where the 2029 cap starts to bite') } : {}),
    },
    tippingPoint: cap
      ? { description: 'Sacrifice above the yearly cap loses the NI saving', measure: 'annual_sacrifice', at: cap.toNumber(), unit: 'GBP', from: SS_CAP_FROM }
      : undefined,
    leverRanges: leverRanges('contribution_pct', { min: 3, max: 10, step: 1 }, (pct) => {
      const x = at(r, { ...i, contributionPct: pct });
      return verdictFor(x.gain, meetsMinimumWage(r, i, x.salary.minus(x.con)));
    }),
    constraints,
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')} a year`, source: 'payroll_export', estimate: false, fact: 'salary' },
      { text: `Contributing ${i.contributionPct}% of pay today`, source: 'pension_scheme', estimate: false, fact: 'contribution_pct' },
      {
        text: i.reliefMethod === 'relief_at_source' ? 'Pension uses relief at source: the provider adds basic-rate relief' : 'Pension uses a net pay arrangement',
        source: 'pension_scheme',
        estimate: false,
        fact: 'relief_method',
      },
      { text: `Employer shares ${i.employerSharePct}% of its NI saving`, source: 'company_setting', estimate: false, fact: 'employer_share_pct' },
      { text: 'Figures from April 2029 use today’s tax bands with the salary sacrifice cap applied', source: 'rules', estimate: true },
      ...profileAssumptions(r, i, { adjustedNetIncome: now.after.adjustedNetIncome, minimumWage: true }),
    ],
  };
}
