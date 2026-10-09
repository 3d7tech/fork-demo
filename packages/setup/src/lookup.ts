// Plain answers to lookups ("where is my P60?") from confirmed company facts (ADR 0007).
// A model picks which fact answers the question, seeing names only; the reply is built here
// from the confirmed value and its source, so nothing in it is model-written.
import { eq } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { RoleInput, RoleOutput } from '@fork/models';
import { DOCUMENT_KINDS } from './documents/store';
import { displayValue, policyKey } from './documents/keys';
import { confirmedFacts } from './documents/store';

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

/** Everything a lookup may answer from: confirmed document facts and a few company settings. */
export async function lookupSources(db: ForkDatabase, ctx: RequestContext): Promise<Available[]> {
  const out: Available[] = [];
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
export async function answerLookup(db: ForkDatabase, ctx: RequestContext, matcher: LookupMatcher | undefined, question: string): Promise<LookupAnswer | null> {
  const available = await lookupSources(db, ctx);
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
