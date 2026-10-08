// Fork's tables (ADR 0007). Every company-owned row carries company_id; row-level security
// policies in migrations/*_rls.sql decide who may read or change it.
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const companyId = () =>
  uuid('company_id')
    .notNull()
    .references(() => company.id, { onDelete: 'cascade' });
/** Money in pounds and pence. Read into decimal.js, never a float. */
const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const pct = (name: string) => numeric(name, { precision: 5, scale: 2 });

export const role = pgEnum('member_role', ['owner', 'employee']);
export const reliefMethod = pgEnum('relief_method', ['relief_at_source', 'net_pay']);
export const pensionBasis = pgEnum('pension_basis', ['full_salary', 'qualifying_earnings']);
export const uploadStatus = pgEnum('upload_status', ['uploaded', 'mapped', 'imported', 'failed']);
export const documentKind = pgEnum('document_kind', ['handbook', 'pension_scheme', 'benefit_terms', 'other']);
export const documentStatus = pgEnum('document_status', ['uploaded', 'extracting', 'extracted', 'failed']);
export const factConfidence = pgEnum('fact_confidence', ['confirmed', 'extracted', 'estimate']);

// ---------- Companies and people ----------

export const company = pgTable('company', {
  id: id(),
  name: text('name').notNull(),
  brandColour: text('brand_colour'),
  /** Fork's fee, a company setting (open question 1). */
  feePencePerEmployee: integer('fee_pence_per_employee').notNull().default(400),
  employmentAllowance: boolean('employment_allowance').notNull().default(false),
  /** Share of the employer's NI saving passed into employees' pensions. */
  employerNiSharePct: pct('employer_ni_share_pct').notNull().default('0'),
  rulePack: text('rule_pack').notNull().default('uk-2026-27'),
  createdAt: createdAt(),
});

/** A person who can sign in. One per email address; they may belong to several companies. */
export const appUser = pgTable(
  'app_user',
  {
    id: id(),
    email: text('email').notNull(),
    createdAt: createdAt(),
    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('app_user_email_key').on(sql`lower(${t.email})`)],
);

export const employee = pgTable(
  'employee',
  {
    id: id(),
    companyId: companyId(),
    payrollRef: text('payroll_ref').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    /** Only when the payroll export has it; needed for minimum wage age bands. */
    dateOfBirth: date('date_of_birth'),
    hoursPerWeek: numeric('hours_per_week', { precision: 5, scale: 2 }).notNull(),
    startDate: date('start_date'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('employee_payroll_ref_key').on(t.companyId, t.payrollRef)],
);

export const membership = pgTable(
  'membership',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    companyId: companyId(),
    role: role('role').notNull(),
    /** Set for employees: the payroll record that is theirs. */
    employeeId: uuid('employee_id').references(() => employee.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('membership_user_company_role_key').on(t.userId, t.companyId, t.role)],
);

export const invite = pgTable(
  'invite',
  {
    id: id(),
    companyId: companyId(),
    email: text('email').notNull(),
    role: role('role').notNull(),
    employeeId: uuid('employee_id').references(() => employee.id, { onDelete: 'cascade' }),
    /** SHA-256 of the token in the link. The token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => appUser.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invite_token_hash_key').on(t.tokenHash), index('invite_company_idx').on(t.companyId)],
);

/** Email sign-in links: hashed, short-lived, single use. */
export const loginToken = pgTable(
  'login_token',
  {
    id: id(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('login_token_hash_key').on(t.tokenHash)],
);

export const session = pgTable('session', {
  /** SHA-256 of the cookie value. */
  idHash: text('id_hash').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => appUser.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------- Payroll ----------

export const payrollUpload = pgTable('payroll_upload', {
  id: id(),
  companyId: companyId(),
  uploadedBy: uuid('uploaded_by').references(() => appUser.id, { onDelete: 'set null' }),
  fileName: text('file_name').notNull(),
  fileKey: text('file_key').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  payPeriodEnd: date('pay_period_end'),
  headers: jsonb('headers').$type<string[]>().notNull(),
  suggestedMapping: jsonb('suggested_mapping').$type<Record<string, string | null>>(),
  mapping: jsonb('mapping').$type<Record<string, string | null>>(),
  status: uploadStatus('status').notNull().default('uploaded'),
  rowCount: integer('row_count'),
  /** Row problems found by validation: row number, field and code. No pay figures. */
  problems: jsonb('problems').$type<Array<{ row: number; field: string; code: string }>>(),
  createdAt: createdAt(),
  importedAt: timestamp('imported_at', { withTimezone: true }),
});

export const payRecord = pgTable(
  'pay_record',
  {
    id: id(),
    companyId: companyId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employee.id, { onDelete: 'cascade' }),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => payrollUpload.id, { onDelete: 'cascade' }),
    periodEnd: date('period_end').notNull(),
    annualSalary: money('annual_salary').notNull(),
    hoursPerWeek: numeric('hours_per_week', { precision: 5, scale: 2 }).notNull(),
    /** Employee pension contribution as a % of pay, when the export has it. */
    pensionPct: pct('pension_pct'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('pay_record_employee_upload_key').on(t.employeeId, t.uploadId), index('pay_record_employee_idx').on(t.employeeId, t.periodEnd)],
);

// ---------- Pension scheme and documents ----------

export const policyDocument = pgTable('policy_document', {
  id: id(),
  companyId: companyId(),
  kind: documentKind('kind').notNull(),
  fileName: text('file_name').notNull(),
  fileKey: text('file_key').notNull(),
  sha256: text('sha256').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  mimeType: text('mime_type').notNull(),
  status: documentStatus('status').notNull().default('uploaded'),
  uploadedBy: uuid('uploaded_by').references(() => appUser.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
});

export const pensionScheme = pgTable('pension_scheme', {
  id: id(),
  companyId: companyId(),
  name: text('name').notNull(),
  provider: text('provider'),
  reliefMethod: reliefMethod('relief_method').notNull(),
  basis: pensionBasis('basis').notNull(),
  employerPct: pct('employer_pct').notNull(),
  employeeDefaultPct: pct('employee_default_pct').notNull(),
  sourceDocumentId: uuid('source_document_id').references(() => policyDocument.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const policyFact = pgTable('policy_fact', {
  id: id(),
  companyId: companyId(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => policyDocument.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  page: integer('page'),
  confidence: factConfidence('confidence').notNull().default('extracted'),
  confirmedBy: uuid('confirmed_by').references(() => appUser.id, { onDelete: 'set null' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

// ---------- Audit ----------

/** Who did what to which record. Insert-only. Never question text or pay figures. */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    companyId: uuid('company_id').references(() => company.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => appUser.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    detail: jsonb('detail').$type<Record<string, string | number | boolean | null>>(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_event_company_idx').on(t.companyId, t.at)],
);
