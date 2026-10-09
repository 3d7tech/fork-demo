// Plain answers to lookups ("where is my P60?") from confirmed company facts (ADR 0007).
// A model picks which fact answers the question, seeing names only; the reply is built here
// from the confirmed value and its source, so nothing in it is model-written.
import { eq } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { RoleInput, RoleOutput } from '@fork/models';
import { DOCUMENT_KINDS } from './documents/store';
import { displayValue, policyKey } from './documents/keys';
import { confirmedFacts } from './documents/store';
import { DbFactStore } from './facts';
import type { Fact } from '@fork/spec';

export type LookupMatcher = (input: RoleInput<'lookup_matcher'>) => Promise<RoleOutput<'lookup_matcher'>>;

export interface LookupAnswer {
  kind: 'message';
  reason: 'lookup';
  title: string;
  body: string;
  routeTo: 'documents' | 'owner' | null;
  source?: string;
}

interface Available {
  key: string;
  label: string;
  text: string;
  source: string;
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** An employee's own figures from payroll, for "what is my salary?". Labels go to the matcher; values never do. */
export const OWN_FIGURES: Array<{ id: string; key: string; label: string; text: (v: number) => string }> = [
  { id: 'salary', key: 'my_salary', label: 'Your pay a year (salary)', text: (v) => `£${Math.round(v).toLocaleString('en-GB')} a year` },
  { id: 'hours_per_week', key: 'my_hours', label: 'Your contracted hours a week', text: (v) => `${v} hours a week` },
  { id: 'contribution_pct', key: 'my_pension_pct', label: 'Your own pension contribution', text: (v) => `${v}% of your pay` },
];

const factSource = (f: Fact) =>
  f.source === 'payroll_export' ? (f.asOf ? `Your payroll, period ending ${longDate(f.asOf)}` : 'Your payroll') : f.source === 'pension_scheme' ? 'Your company’s pension scheme' : 'Company settings';

/**
 * Everything a lookup may answer from: confirmed document facts, a few company settings and,
 * for an employee, their own payroll figures (read through row-level security, so only theirs).
 */
export async function lookupSources(db: ForkDatabase, ctx: RequestContext, employeeId?: string): Promise<Available[]> {
  const out: Available[] = [];
  if (ctx.role === 'employee' && employeeId) {
    const own = await new DbFactStore(db, ctx).get({ companyId: ctx.companyId, employeeId }, OWN_FIGURES.map((o) => o.id));
    for (const o of OWN_FIGURES) {
      const f = own.find((x) => x.id === o.id);
      if (typeof f?.value === 'number') out.push({ key: o.key, label: o.label, text: o.text(f.value), source: factSource(f) });
    }
  }
  const docs = await confirmedFacts(db, ctx);
  const kinds = await db.asMember(ctx, (tx) => tx.select({ id: s.policyDocument.id, kind: s.policyDocument.kind }).from(s.policyDocument));
  for (const f of docs.values()) {
    const kind = kinds.find((k) => k.id === f.documentId)?.kind;
    const docName = DOCUMENT_KINDS.find((k) => k.kind === kind)?.label ?? 'Company document';
    out.push({ key: f.key, label: policyKey(f.key)?.label ?? f.key, text: displayValue(f.key, f.value), source: f.page ? `${docName}, page ${f.page}` : docName });
  }
  const [company] = await db.asMember(ctx, (tx) => tx.select({ reenrolmentDate: s.company.reenrolmentDate }).from(s.company).where(eq(s.company.id, ctx.companyId)));
  if (company?.reenrolmentDate) out.push({ key: 'reenrolment_date', label: 'Next auto-enrolment re-enrolment date', text: longDate(company.reenrolmentDate), source: 'Company settings' });
  return out;
}

/** Answer a lookup, or null when nothing confirmed answers it (the pipeline then says so honestly). */
export async function answerLookup(db: ForkDatabase, ctx: RequestContext, matcher: LookupMatcher | undefined, question: string, employeeId?: string): Promise<LookupAnswer | null> {
  const available = await lookupSources(db, ctx, employeeId);
  if (!available.length || !matcher) return null;
  let keys: string[];
  try {
    keys = (await matcher({ question, available: available.map(({ key, label }) => ({ key, label })) })).keys;
  } catch {
    return null;
  }
  const hits = keys.flatMap((k) => available.filter((a) => a.key === k)).slice(0, 2);
  if (!hits.length) return null;
  return {
    kind: 'message',
    reason: 'lookup',
    title: hits[0]!.label,
    body: hits.map((h) => (hits.length > 1 ? `${h.label}: ${h.text}` : h.text)).join('\n'),
    routeTo: null,
    source: [...new Set(hits.map((h) => h.source))].join('; '),
  };
}
