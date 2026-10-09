// The people the evaluation suites ask as: Larkfield from the demo, held in memory.
import { InMemoryFactStore, type Subject } from '@fork/pipeline';
import type { Fact } from '@fork/spec';

const f = (id: string, value: Fact['value'], source: Fact['source']): Fact => ({ id, value, source, asOf: '2026-10-01', confidence: 'confirmed' });

export const SALARIES = [
  25200, 26000, 28500, 29000, 30000, 31000, 32000, 32000, 33500, 34000, 35000, 35000, 36000, 37500, 38000, 39000, 40000, 41000, 42000, 42000, 44000, 45000, 46000, 48000, 50000, 52000, 55000,
  58000, 60000, 65000, 72000, 80000, 95000, 108000,
];

export const FACTS = new InMemoryFactStore({
  company: {
    larkfield: [
      f('employer_share_pct', 50, 'company_setting'),
      f('employer_contribution_pct', 3, 'pension_scheme'),
      f('relief_method', 'relief_at_source', 'pension_scheme'),
      f('pension_basis', 'full_salary', 'pension_scheme'),
      f('headcount', 34, 'payroll_export'),
      f('median_salary', 40500, 'payroll_export'),
      f('fee_per_employee', 4, 'company_setting'),
      f('employment_allowance', false, 'company_setting'),
      f('contribution_pct', 5, 'pension_scheme'),
    ],
  },
  employee: {
    'larkfield/ella': [f('salary', 32000, 'payroll_export'), f('contribution_pct', 5, 'pension_scheme'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/priya': [f('salary', 108000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')],
    'larkfield/ravi': [f('salary', 58000, 'payroll_export'), f('contribution_pct', 5, 'payroll_export'), f('hours_per_week', 37.5, 'payroll_export')],
  },
  payroll: { larkfield: SALARIES.map((salary) => ({ salary, hoursPerWeek: 37.5 })) },
});

export const SUBJECTS: Record<string, Subject> = {
  ella: { audience: 'employee', companyId: 'larkfield', employeeId: 'ella' },
  priya: { audience: 'employee', companyId: 'larkfield', employeeId: 'priya' },
  ravi: { audience: 'employee', companyId: 'larkfield', employeeId: 'ravi' },
  maya: { audience: 'owner', companyId: 'larkfield' },
};
