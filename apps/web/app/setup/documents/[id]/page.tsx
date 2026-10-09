import { displayValue, DOCUMENT_KINDS, policyKey, readDocument } from '@fork/setup';
import { notFound } from 'next/navigation';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { factAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function DocumentFacts({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { ctx } = await requireOwner();
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await readDocument(database(), ctx, id);
  if (!data) notFound();
  const { doc, facts } = data;
  const unconfirmed = facts.filter((f) => f.confidence !== 'confirmed').length;
  return (
    <section className="card" aria-labelledby="df-title">
      <a href="/setup/documents" className="back">
        ‹ Documents
      </a>
      <h1 id="df-title">{doc.fileName}</h1>
      <p className="small">{DOCUMENT_KINDS.find((k) => k.kind === doc.kind)?.label}</p>
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
      {doc.instructionsFound && (
        <p className="notice warn" role="alert">
          This file contains text that tries to tell an AI what to do. Fork ignored it, but check where the file came from before you confirm anything.
        </p>
      )}
      {doc.status === 'failed' && <p className="notice warn">Fork couldn’t read this file just now. You can enter the details yourself in setup.</p>}
      {facts.length === 0 && doc.status !== 'failed' && <p>Fork didn’t find any of the details it uses in this document. You can enter them yourself in setup.</p>}
      {facts.length > 0 && (
        <p className="lead">
          {unconfirmed ? `Check each one against the document. Staff and decisions use a fact only once you confirm it.` : 'Every fact here is confirmed.'}
        </p>
      )}
      {facts.map((f) => {
        const key = policyKey(f.key);
        const confirmed = f.confidence === 'confirmed';
        return (
          <article key={f.id} className="fact" aria-labelledby={`fact-${f.id}`}>
            <h2 id={`fact-${f.id}`}>
              {key?.label ?? f.key} {confirmed && <span className="badge good">Confirmed</span>}
            </h2>
            <p className="fact-value">{displayValue(f.key, f.value)}</p>
            {f.quote && (
              <blockquote>
                “{f.quote}”{f.page ? <span className="small"> Page {f.page}</span> : null}
              </blockquote>
            )}
            {!confirmed && (
              <div className="fact-actions">
                <form action={factAction} className="fact-actions">
                  <input type="hidden" name="documentId" value={doc.id} />
                  <input type="hidden" name="factId" value={f.id} />
                  <input type="hidden" name="op" value="confirm" />
                  <details>
                    <summary>Correct it</summary>
                    <div className="field">
                      <label htmlFor={`v-${f.id}`}>Correct value</label>
                      <input id={`v-${f.id}`} name="value" type="text" defaultValue={String(f.value)} />
                      <input type="hidden" name="changed" value="1" />
                    </div>
                  </details>
                  <button type="submit" className="fk-btn fk-primary">
                    Confirm
                  </button>
                </form>
                <form action={factAction}>
                  <input type="hidden" name="documentId" value={doc.id} />
                  <input type="hidden" name="factId" value={f.id} />
                  <input type="hidden" name="op" value="remove" />
                  <button type="submit" className="fk-btn fk-secondary">
                    Remove
                  </button>
                </form>
              </div>
            )}
          </article>
        );
      })}
      {unconfirmed > 1 && (
        <form action={factAction}>
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="op" value="confirm_all" />
          <button type="submit" className="fk-btn fk-secondary">
            Confirm all {unconfirmed} as shown
          </button>
        </form>
      )}
    </section>
  );
}
