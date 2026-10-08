import type { FactSource } from '@fork/spec';

/** How each kind of source is named on screen. */
export const SOURCE_LABEL: Record<FactSource, string> = {
  payroll_export: 'From payroll',
  pension_scheme: 'From your pension scheme',
  policy_document: 'From the staff handbook',
  company_setting: 'Set by your employer',
  rule_pack: 'HMRC rules',
  user_answer: 'Your answer',
  payslip: 'From your payslip',
  estimate: 'Estimate',
};

export const STATUS_LABEL = {
  in_force: 'In force',
  legislated: 'Law passed, not yet in force',
  announced: 'Announced, not yet law',
  proposed: 'Proposed',
} as const;
