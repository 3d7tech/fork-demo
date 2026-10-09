// The payroll columns Fork needs. Contracted hours are required (open question 2).

export const FIELD_IDS = ['payroll_ref', 'name', 'first_name', 'last_name', 'email', 'date_of_birth', 'annual_salary', 'hours_per_week', 'pension_pct', 'start_date', 'tax_code', 'student_loan'] as const;
export type FieldId = (typeof FIELD_IDS)[number];

export interface FieldDef {
  id: FieldId;
  label: string;
  /** What the column holds, for the person and for the column matcher. */
  description: string;
  required: boolean;
  /** Header words that usually mean this field, lower case. */
  synonyms: string[];
}

export const FIELDS: FieldDef[] = [
  { id: 'payroll_ref', label: 'Employee number', description: 'The payroll or works number that identifies each person', required: true, synonyms: ['employee number', 'employee no', 'emp no', 'employee id', 'payroll id', 'payroll number', 'works number', 'works no', 'staff number', 'staff no', 'ref', 'employee ref'] },
  { id: 'name', label: 'Full name', description: 'Full name in one column. Not needed if first and last names are separate', required: false, synonyms: ['name', 'full name', 'employee name', 'employee'] },
  { id: 'first_name', label: 'First name', description: 'First or given name', required: false, synonyms: ['first name', 'forename', 'forenames', 'given name', 'first'] },
  { id: 'last_name', label: 'Last name', description: 'Last name or surname', required: false, synonyms: ['last name', 'surname', 'family name', 'last'] },
  { id: 'email', label: 'Work email', description: 'Email address, used to invite people', required: false, synonyms: ['email', 'email address', 'work email', 'e-mail'] },
  { id: 'date_of_birth', label: 'Date of birth', description: 'Date of birth, for minimum wage age bands', required: false, synonyms: ['date of birth', 'dob', 'birth date', 'birthday'] },
  { id: 'annual_salary', label: 'Annual salary', description: 'Contracted pay for a full year before deductions', required: true, synonyms: ['annual salary', 'salary', 'annual pay', 'basic salary', 'yearly salary', 'salary pa', 'annual gross'] },
  { id: 'hours_per_week', label: 'Contracted hours a week', description: 'Contracted hours in a normal week', required: true, synonyms: ['hours', 'contracted hours', 'weekly hours', 'hours per week', 'contract hours', 'normal hours'] },
  { id: 'pension_pct', label: 'Employee pension contribution %', description: 'The employee’s own pension contribution as a percentage of pay', required: false, synonyms: ['pension %', 'employee pension %', 'ee pension %', 'pension contribution %', 'ee contribution %', 'employee contribution %', 'pension rate'] },
  { id: 'tax_code', label: 'Tax code', description: 'The person’s tax code, such as 1257L or S1257L. An S at the start means Scottish income tax', required: false, synonyms: ['tax code', 'taxcode', 'tax cd', 'paye code'] },
  { id: 'student_loan', label: 'Student loan plan', description: 'Student or postgraduate loan plan deducted through payroll, such as Plan 2 or PGL', required: false, synonyms: ['student loan', 'student loan plan', 'sl plan', 'student loan type', 'sl', 'pgl', 'postgraduate loan'] },
  { id: 'start_date', label: 'Start date', description: 'Date the person started working for the company', required: false, synonyms: ['start date', 'date started', 'employment start', 'start', 'date joined', 'joined'] },
];

/** A confirmed mapping: Fork field → column header, or null when the file doesn't have it. */
export type Mapping = Partial<Record<FieldId, string | null>>;

/** Problems with a mapping before any row is read. */
export function mappingProblems(mapping: Mapping, headers: string[]): string[] {
  const p: string[] = [];
  const used = new Map<string, FieldId>();
  for (const [field, header] of Object.entries(mapping) as Array<[FieldId, string | null]>) {
    if (!header) continue;
    if (!headers.includes(header)) p.push(`${label(field)}: there’s no column called “${header}”`);
    const other = used.get(header);
    if (other) p.push(`“${header}” is used for both ${label(other)} and ${label(field)}`);
    used.set(header, field);
  }
  for (const f of FIELDS) if (f.required && !mapping[f.id]) p.push(`Choose the column for ${f.label.toLowerCase()}`);
  if (!mapping.name && !(mapping.first_name && mapping.last_name)) p.push('Choose a full name column, or first and last name columns');
  return p;
}

export const label = (id: FieldId) => FIELDS.find((f) => f.id === id)!.label;
