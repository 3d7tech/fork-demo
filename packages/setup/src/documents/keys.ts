// The facts Fork can take from company documents (ADR 0007). The interpreter extracts only
// these, code checks each value's type, and an owner confirms each one before it is used.

export type KeyType = 'pct' | 'money' | 'number' | 'yes_no' | 'text' | { choice: readonly string[] };
export type DocumentKind = 'handbook' | 'pension_scheme' | 'benefit_terms' | 'other';

export interface PolicyKey {
  key: string;
  label: string;
  description: string;
  type: KeyType;
  kinds: DocumentKind[];
}

export const POLICY_KEYS: PolicyKey[] = [
  // Pension scheme
  { key: 'pension_provider', label: 'Pension provider', description: 'The company running the pension scheme', type: 'text', kinds: ['pension_scheme'] },
  { key: 'employer_pct', label: 'Employer contribution', description: 'Employer pension contribution as a % of pay', type: 'pct', kinds: ['pension_scheme', 'handbook'] },
  { key: 'employee_default_pct', label: 'Standard employee contribution', description: 'Standard employee pension contribution as a % of pay', type: 'pct', kinds: ['pension_scheme', 'handbook'] },
  { key: 'relief_method', label: 'How tax relief is given', description: 'Relief at source (provider claims basic-rate relief) or net pay (contributions taken before tax)', type: { choice: ['relief_at_source', 'net_pay'] }, kinds: ['pension_scheme'] },
  { key: 'contribution_basis', label: 'Contributions worked out on', description: 'Full salary, or qualifying earnings between the lower and upper limits', type: { choice: ['full_salary', 'qualifying_earnings'] }, kinds: ['pension_scheme'] },
  { key: 'salary_sacrifice_offered', label: 'Salary sacrifice offered', description: 'Whether staff can pay pension contributions by salary sacrifice', type: 'yes_no', kinds: ['pension_scheme', 'handbook'] },
  // Handbook
  { key: 'holiday_days', label: 'Holiday days a year', description: 'Paid holiday days a year for a full-time employee, including or excluding bank holidays as the document says', type: 'number', kinds: ['handbook'] },
  { key: 'company_sick_pay', label: 'Company sick pay', description: 'What the company pays when someone is off sick, beyond Statutory Sick Pay', type: 'text', kinds: ['handbook'] },
  { key: 'enhanced_maternity_pay', label: 'Maternity pay', description: 'Company maternity pay beyond the statutory minimum', type: 'text', kinds: ['handbook'] },
  { key: 'enhanced_paternity_pay', label: 'Paternity pay', description: 'Company paternity pay beyond the statutory minimum', type: 'text', kinds: ['handbook'] },
  { key: 'payslip_location', label: 'Where payslips and P60s are', description: 'Where employees find their payslips, P60s and P11Ds', type: 'text', kinds: ['handbook'] },
  { key: 'pay_day', label: 'Pay day', description: 'When staff are paid each month', type: 'text', kinds: ['handbook'] },
  // Benefits
  { key: 'ev_scheme_offered', label: 'Electric car scheme offered', description: 'Whether there is an electric car salary sacrifice scheme', type: 'yes_no', kinds: ['benefit_terms', 'handbook'] },
  { key: 'ev_scheme_provider', label: 'Electric car scheme provider', description: 'Who runs the electric car scheme', type: 'text', kinds: ['benefit_terms'] },
  { key: 'cycle_to_work_offered', label: 'Cycle to work offered', description: 'Whether there is a cycle to work scheme', type: 'yes_no', kinds: ['benefit_terms', 'handbook'] },
  { key: 'cycle_to_work_limit', label: 'Cycle to work limit', description: 'The most a bike package can cost under the scheme, in pounds', type: 'money', kinds: ['benefit_terms', 'handbook'] },
  { key: 'childcare_support', label: 'Childcare support', description: 'Any help with childcare costs the company offers', type: 'text', kinds: ['benefit_terms', 'handbook'] },
];

export const keysFor = (kind: DocumentKind) => (kind === 'other' ? POLICY_KEYS : POLICY_KEYS.filter((k) => k.kinds.includes(kind)));
export const policyKey = (key: string) => POLICY_KEYS.find((k) => k.key === key);
export const typeLabel = (t: KeyType) => (typeof t === 'string' ? t : `one of: ${t.choice.join(', ')}`);

/** Check a value against its key's type. Returns the cleaned value, or null if it doesn't fit. */
export function checkValue(key: string, value: unknown): string | number | boolean | null {
  const k = policyKey(key);
  if (!k) return null;
  const t = k.type;
  if (t === 'yes_no') return typeof value === 'boolean' ? value : null;
  if (t === 'pct') return typeof value === 'number' && value >= 0 && value <= 100 ? value : null;
  if (t === 'money') return typeof value === 'number' && value >= 0 && value < 1_000_000 ? value : null;
  if (t === 'number') return typeof value === 'number' && value >= 0 && value < 10_000 ? value : null;
  if (t === 'text') return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
  return typeof value === 'string' && t.choice.includes(value) ? value : null;
}

/** How a confirmed value reads to a person. */
export function displayValue(key: string, value: unknown): string {
  const t = policyKey(key)?.type;
  if (t === 'yes_no') return value ? 'Yes' : 'No';
  if (t === 'pct') return `${value}%`;
  if (t === 'money') return `£${Number(value).toLocaleString('en-GB')}`;
  if (typeof t === 'object') return ({ relief_at_source: 'Relief at source', net_pay: 'Net pay', full_salary: 'Full salary', qualifying_earnings: 'Qualifying earnings' } as Record<string, string>)[String(value)] ?? String(value);
  return String(value);
}
