import type { FamilyDef } from './types';
import { num } from './shared';

export const ssIntroduce: FamilyDef<'employer.ss_introduce'> = {
  id: 'employer.introduce_salary_sacrifice',
  audience: 'owner',
  title: 'Introducing salary sacrifice for pensions',
  description: 'Whether the company should introduce salary sacrifice for pensions, what it saves now and from April 2029, and when Fork pays for itself',
  module: 'employer.ss_introduce',
  rulePack: 'uk-2026-27',
  needs: ['payrollRows'],
  template: {
    specVersion: '1.0',
    decisionType: 'employer_policy',
    family: 'employer.introduce_salary_sacrifice',
    audience: 'owner',
    question: '',
    options: [
      { id: 'introduce', label: 'Offer salary sacrifice for pensions' },
      { id: 'not_now', label: 'Leave things as they are' },
    ],
    constraints: [{ id: 'min_wage', kind: 'hard', source: 'rules', autoCheck: true }],
    levers: [
      { id: 'take_up_pct', label: 'Staff who take it up', min: 0, max: 100, step: 5, default: 70, unit: 'pct' },
      { id: 'share_pct', label: 'Share of the saving passed to staff pensions', min: 0, max: 100, step: 5, default: 'fact:employer_share_pct', unit: 'pct' },
      { id: 'contribution_pct', label: 'Average staff contribution', min: 3, max: 10, step: 1, default: 'fact:contribution_pct', unit: 'pct' },
    ],
    facts: [],
    calculation: { module: 'employer.ss_introduce', rulePack: 'uk-2026-27' },
    visual: 'saving_flow',
    action: { type: 'plan.send', to: 'accountant', label: 'Send the plan to our accountant' },
    watch: ['headcount', 'employer_share_pct', 'rulePack'],
  },
  facts: [
    { id: 'headcount', label: 'Employees on payroll', unit: 'count' },
    { id: 'employer_share_pct', label: 'Share of the NI saving passed to staff pensions', unit: 'pct' },
    { id: 'contribution_pct', label: 'Standard staff pension contribution', unit: 'pct' },
    { id: 'fee_per_employee', label: 'Fork’s fee per employee a month', unit: 'GBP' },
    { id: 'employment_allowance', label: 'Employment Allowance claimed', unit: 'yes_no' },
  ],
  answers: {},
  levers: ['take_up_pct', 'share_pct', 'contribution_pct'],
  buildInput(f, _a, l, data) {
    return {
      employees: data.payrollRows ?? [],
      contributionPct: l.contribution_pct ?? num(f.contribution_pct),
      takeUpPct: l.take_up_pct ?? 70,
      sharePct: l.share_pct ?? num(f.employer_share_pct),
      feePerEmployeePerMonth: num(f.fee_per_employee),
      employmentAllowanceEligible: f.employment_allowance === true,
    };
  },
  defaultLayout: {
    visual: 'saving_flow',
    leverOrder: ['take_up_pct', 'share_pct', 'contribution_pct'],
    outcomeTiles: ['company_keeps', 'employer_ni_saved', 'employee_avg_gain'],
    constraintOrder: ['min_wage'],
    highlightConstraint: null,
  },
  visual(calc, display) {
    const o = calc.outputs;
    const col = (label: string, total: string, keep: string, shared: string) => ({
      label,
      total: { value: o[total]!.value, display: display(total) },
      parts: [
        { value: Math.max(0, o[keep]!.value), display: display(keep), label: 'Kept by the company', tone: 'b' as const },
        { value: o[shared]!.value, display: display(shared), label: 'Into staff pensions', tone: 'a' as const },
        { value: o.fork_fee!.value, display: display('fork_fee'), label: 'Fork’s fee', tone: 'c' as const },
      ],
    });
    return {
      type: 'flow',
      title: 'Where the employer NI saving goes each year',
      columns: [col('Now', 'employer_ni_saved', 'company_keeps', 'shared_with_staff'), col('From April 2029', 'employer_ni_saved_2029', 'company_keeps_2029', 'shared_with_staff_2029')],
    };
  },
  request(r) {
    const o = r.calc.outputs;
    return {
      summary: `${r.companyName} plans to offer salary sacrifice for pensions. Fork estimates ${o.eligible?.value} of ${o.headcount?.value} staff are eligible (${o.excluded_min_wage?.value} left out to protect the minimum wage), with ${r.levers.share_pct ?? 0}%% of the employer NI saving passed into staff pensions. Please confirm payroll can run it, and the contract variation and scheme steps needed.`,
    };
  },
  steps: { facts: 'Read your payroll, pension scheme and settings', checks: 'Checked who the minimum wage leaves out' },
};
