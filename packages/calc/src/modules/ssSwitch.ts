import type { CalcResult } from '@fork/spec';
import { D, Decimal, leverRanges, q, type Rules } from '../core';
import { employeeNI, employerNISaving, incomeTax, meetsNLW, takeHome } from '../uk';

export interface SsSwitchInput {
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

/** Take-home today, paying the contribution the way the scheme works now. */
function takeHomeToday(r: Rules, salary: Decimal, con: Decimal, method: SsSwitchInput['reliefMethod']): Decimal {
  if (method === 'relief_at_source') {
    // Paid from take-home pay; the provider adds basic-rate relief, so the employee pays the net amount.
    return takeHome(r, salary).minus(con.times(D(1).minus(r.num('pension.relief_at_source_rate'))));
  }
  // Net pay arrangement: income tax relief through payroll, but NI is charged on full salary.
  const taxable = salary.minus(con);
  return taxable.minus(incomeTax(r, taxable)).minus(employeeNI(r, salary));
}

function at(r: Rules, i: SsSwitchInput) {
  const salary = D(i.salary);
  const con = salary.times(i.contributionPct).div(100);
  const before = takeHomeToday(r, salary, con, i.reliefMethod);
  const after = takeHome(r, salary, con);
  const erSaving = employerNISaving(r, salary, con);
  const share = erSaving.times(i.employerSharePct).div(100);
  return { salary, con, before, after, gain: after.minus(before), erSaving, share };
}

export function ssSwitch(r: Rules, i: SsSwitchInput): CalcResult {
  const now = at(r, i);
  const r29 = r.at(SS_CAP_FROM);
  const later = at(r29, i);
  const cap = r29.limit('salary_sacrifice.pension_ni_cap');
  const minWageOk = meetsNLW(r, now.salary.minus(now.con), i.hoursPerWeek);

  const constraints: CalcResult['constraints'] = [{ id: 'min_wage', outcome: minWageOk ? 'pass' : 'excluded' }];
  if (i.mortgageIn12Months !== undefined) constraints.push({ id: 'mortgage_12m', outcome: i.mortgageIn12Months ? 'caution' : 'pass' });
  if (i.parentalLeaveIn12Months !== undefined) constraints.push({ id: 'parental_leave_12m', outcome: i.parentalLeaveIn12Months ? 'caution' : 'pass' });
  const caution = constraints.some((c) => c.outcome === 'caution');

  const verdictFor = (gain: Decimal, ok: boolean) => (!ok ? 'not_eligible' : gain.lte(0) ? 'stay' : caution ? 'switch_with_caution' : 'switch');

  // Statutory parental pay for the first six weeks is 90% of average weekly earnings, which sacrifice lowers.
  const parentalPayReduction = now.con.times(0.9).div(52).times(6);
  const employerPension = now.salary.times(i.employerContributionPct).div(100);

  return {
    module: 'pension.ss_switch',
    rulePack: r.packInfo(),
    verdict: verdictFor(now.gain, minWageOk),
    outputs: {
      contribution: q(now.con, 'GBP', 'Your contribution a year'),
      take_home_before: q(now.before, 'GBP', 'Take-home a year today'),
      take_home_after: q(now.after, 'GBP', 'Take-home a year on salary sacrifice'),
      take_home_gain: q(now.gain, 'GBP', 'Extra take-home a year'),
      employer_ni_saving: q(now.erSaving, 'GBP', 'Employer NI saved a year'),
      employer_share: q(now.share, 'GBP', 'Extra into your pension from the employer’s saving'),
      pension_total: q(now.con.plus(employerPension).plus(now.share), 'GBP', 'Into your pension a year'),
      total_gain: q(now.gain.plus(now.share), 'GBP', 'Total gain a year'),
      take_home_gain_2029: q(later.gain, 'GBP', 'Extra take-home a year from April 2029'),
      employer_share_2029: q(later.share, 'GBP', 'Employer share from April 2029'),
      parental_pay_reduction: q(parentalPayReduction, 'GBP', 'Less statutory parental pay over the first six weeks'),
      ...(cap ? { cap_pct_of_pay: q(cap.div(now.salary).times(100), 'pct', 'Contribution where the 2029 cap starts to bite') } : {}),
    },
    tippingPoint: cap
      ? { description: 'Sacrifice above the yearly cap loses the NI saving', measure: 'annual_sacrifice', at: cap.toNumber(), unit: 'GBP', from: SS_CAP_FROM }
      : undefined,
    leverRanges: leverRanges('contribution_pct', { min: 3, max: 10, step: 1 }, (pct) => {
      const x = at(r, { ...i, contributionPct: pct });
      return verdictFor(x.gain, meetsNLW(r, x.salary.minus(x.con), i.hoursPerWeek));
    }),
    constraints,
    rulesUsed: r.rulesUsed(),
    assumptions: [
      { text: `Pay £${i.salary.toLocaleString('en-GB')} a year, contributing ${i.contributionPct}% today`, source: 'payroll_export', estimate: false },
      {
        text: i.reliefMethod === 'relief_at_source' ? 'Pension uses relief at source: the provider adds basic-rate relief' : 'Pension uses a net pay arrangement',
        source: 'pension_scheme',
        estimate: false,
      },
      { text: `Employer shares ${i.employerSharePct}% of its NI saving`, source: 'company_setting', estimate: false },
      { text: 'Figures from April 2029 use today’s tax bands with the salary sacrifice cap applied', source: 'rules', estimate: true },
    ],
  };
}
