// Company documents: upload, extraction by the document interpreter, and owner confirmation.
// Extracted facts reach employees and decisions only after an owner confirms them.
import { and, desc, eq, sql } from 'drizzle-orm';
import { schema as s, type ForkDatabase, type RequestContext } from '@fork/db';
import type { ProviderDocument, RoleInput, RoleOutput } from '@fork/models';
import type { FileStore } from '../files';
import { UploadError } from '../payroll/read';
import { checkValue, keysFor, policyKey, typeLabel, type DocumentKind } from './keys';
import { prepareDocument } from './read';

export type DocumentInterpreter = (input: RoleInput<'document_interpreter'>, document: ProviderDocument) => Promise<RoleOutput<'document_interpreter'>>;

export interface DocumentDeps {
  db: ForkDatabase;
  files: FileStore;
  interpreter?: DocumentInterpreter;
}

export const DOCUMENT_KINDS: Array<{ kind: DocumentKind; label: string }> = [
  { kind: 'pension_scheme', label: 'Pension scheme booklet' },
  { kind: 'handbook', label: 'Staff handbook' },
  { kind: 'benefit_terms', label: 'Benefit scheme terms' },
  { kind: 'other', label: 'Something else' },
];

/** Keep only facts Fork asked for, of the right type, once each. */
export function cleanFacts(kind: DocumentKind, out: RoleOutput<'document_interpreter'>) {
  const allowed = new Set(keysFor(kind).map((k) => k.key));
  const seen = new Set<string>();
  return out.facts.flatMap((f) => {
    const value = checkValue(f.key, f.value);
    if (!allowed.has(f.key) || value === null || seen.has(f.key)) return [];
    seen.add(f.key);
    return [{ key: f.key, value, page: f.page !== null && f.page > 0 && f.page < 10_000 ? f.page : null, quote: f.quote.slice(0, 400) }];
  });
}

export async function uploadDocument(deps: DocumentDeps, ctx: RequestContext, file: { name: string; bytes: Uint8Array; kind: DocumentKind }) {
  const prepared = await prepareDocument(file.name, file.bytes);
  const stored = await deps.files.put(ctx.companyId, file.bytes);
  const documentId = await deps.db.asMember(ctx, async (tx) => {
    const [row] = await tx
      .insert(s.policyDocument)
      .values({ companyId: ctx.companyId, kind: file.kind, fileName: file.name.slice(0, 200), fileKey: stored.key, sha256: stored.sha256, sizeBytes: stored.sizeBytes, mimeType: prepared.mimeType, status: 'extracting', uploadedBy: ctx.userId })
      .returning({ id: s.policyDocument.id });
    return row!.id;
  });

  let facts: ReturnType<typeof cleanFacts> = [];
  let instructionsFound = false;
  let failed = false;
  if (deps.interpreter) {
    try {
      const out = await deps.interpreter({ kind: file.kind, keys: keysFor(file.kind).map((k) => ({ key: k.key, description: k.description, type: typeLabel(k.type) })) }, prepared.document);
      facts = cleanFacts(file.kind, out);
      instructionsFound = out.instructionsFound;
    } catch {
      failed = true;
    }
  }

  await deps.db.asMember(ctx, async (tx) => {
    if (facts.length) {
      await tx.insert(s.policyFact).values(facts.map((f) => ({ companyId: ctx.companyId, documentId, key: f.key, value: f.value, page: f.page, quote: f.quote, confidence: 'extracted' as const })));
    }
    await tx
      .update(s.policyDocument)
      .set({ status: failed ? 'failed' : 'extracted', instructionsFound })
      .where(eq(s.policyDocument.id, documentId));
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'document.uploaded', targetType: 'policy_document', targetId: documentId, detail: { kind: file.kind, facts: facts.length, instructionsFound, failed } });
  });
  return { documentId, facts: facts.length, instructionsFound, failed };
}

export async function listDocuments(db: ForkDatabase, ctx: RequestContext) {
  return db.asMember(ctx, (tx) =>
    tx
      .select({
        id: s.policyDocument.id,
        kind: s.policyDocument.kind,
        fileName: s.policyDocument.fileName,
        status: s.policyDocument.status,
        instructionsFound: s.policyDocument.instructionsFound,
        facts: sql<number>`(select count(*)::int from policy_fact f where f.document_id = policy_document.id)`,
        unconfirmed: sql<number>`(select count(*)::int from policy_fact f where f.document_id = policy_document.id and f.confidence <> 'confirmed')`,
      })
      .from(s.policyDocument)
      .orderBy(desc(s.policyDocument.createdAt)),
  );
}

export async function readDocument(db: ForkDatabase, ctx: RequestContext, documentId: string) {
  return db.asMember(ctx, async (tx) => {
    const [doc] = await tx.select().from(s.policyDocument).where(eq(s.policyDocument.id, documentId));
    if (!doc) return null;
    const facts = await tx.select().from(s.policyFact).where(eq(s.policyFact.documentId, documentId)).orderBy(s.policyFact.createdAt);
    return { doc, facts };
  });
}

/** Parse what an owner typed when correcting a value. */
export function parseTyped(key: string, raw: string): string | number | boolean | null {
  const t = policyKey(key)?.type;
  const text = raw.trim();
  if (t === 'yes_no') return checkValue(key, /^(yes|y|true)$/i.test(text) ? true : /^(no|n|false)$/i.test(text) ? false : null);
  if (t === 'pct' || t === 'money' || t === 'number') return text === '' ? null : checkValue(key, Number(text.replace(/[£,%\s]/g, '')));
  return checkValue(key, text);
}

/** An owner confirms a fact, optionally correcting its value first. */
export async function confirmFact(db: ForkDatabase, ctx: RequestContext, factId: string, corrected?: string) {
  await db.asMember(ctx, async (tx) => {
    const [fact] = await tx.select().from(s.policyFact).where(eq(s.policyFact.id, factId));
    if (!fact) throw new UploadError('That fact wasn’t found.');
    const value = corrected === undefined ? fact.value : parseTyped(fact.key, corrected);
    if (value === null) throw new UploadError('That value doesn’t look right for this fact.');
    await tx.update(s.policyFact).set({ value, confidence: 'confirmed', confirmedBy: ctx.userId, confirmedAt: new Date() }).where(eq(s.policyFact.id, factId));
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'policy_fact.confirmed', targetType: 'policy_fact', targetId: factId, detail: { key: fact.key, corrected: corrected !== undefined } });
  });
}

export async function confirmAllFacts(db: ForkDatabase, ctx: RequestContext, documentId: string) {
  await db.asMember(ctx, async (tx) => {
    const done = await tx
      .update(s.policyFact)
      .set({ confidence: 'confirmed', confirmedBy: ctx.userId, confirmedAt: new Date() })
      .where(and(eq(s.policyFact.documentId, documentId), sql`${s.policyFact.confidence} <> 'confirmed'`))
      .returning({ id: s.policyFact.id });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'policy_fact.confirmed_all', targetType: 'policy_document', targetId: documentId, detail: { facts: done.length } });
  });
}

export async function removeFact(db: ForkDatabase, ctx: RequestContext, factId: string) {
  await db.asMember(ctx, async (tx) => {
    await tx.delete(s.policyFact).where(eq(s.policyFact.id, factId));
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'policy_fact.removed', targetType: 'policy_fact', targetId: factId });
  });
}

export interface ConfirmedFact {
  key: string;
  value: string | number | boolean;
  documentId: string;
  fileName: string;
  page: number | null;
}

/** Confirmed facts for the current company, newest first per key. Employees see only these. */
export async function confirmedFacts(db: ForkDatabase, ctx: RequestContext): Promise<Map<string, ConfirmedFact>> {
  const rows = await db.asMember(ctx, (tx) =>
    tx
      .select({ key: s.policyFact.key, value: s.policyFact.value, documentId: s.policyFact.documentId, fileName: s.policyDocument.fileName, page: s.policyFact.page })
      .from(s.policyFact)
      .innerJoin(s.policyDocument, eq(s.policyDocument.id, s.policyFact.documentId))
      .where(eq(s.policyFact.confidence, 'confirmed'))
      .orderBy(desc(s.policyFact.confirmedAt)),
  );
  const out = new Map<string, ConfirmedFact>();
  for (const r of rows) if (!out.has(r.key)) out.set(r.key, r as ConfirmedFact);
  return out;
}
