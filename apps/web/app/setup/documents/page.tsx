import { DOCUMENT_KINDS, listDocuments } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { uploadDocumentAction } from '../actions';

export const dynamic = 'force-dynamic';

const KIND = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k.kind, k.label]));

export default async function Documents({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { ctx } = await requireOwner();
  const { error } = await searchParams;
  const docs = await listDocuments(database(), ctx);
  return (
    <>
      <section className="card" aria-labelledby="doc-title">
        <a href="/setup" className="back">
          ‹ Setup
        </a>
        <h1 id="doc-title">Company documents</h1>
        <p className="lead">Upload your staff handbook, pension scheme booklet and benefit terms. Fork reads them and shows you what it found. Nothing is used until you confirm it.</p>
        {error && (
          <p className="notice warn" role="alert">
            {error}
          </p>
        )}
        <form action={uploadDocumentAction} className="form">
          <div className="field">
            <label htmlFor="kind">What is it?</label>
            <select id="kind" name="kind" required defaultValue="">
              <option value="" disabled>
                Choose one
              </option>
              {DOCUMENT_KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="file">Document (PDF or Word)</label>
            <input id="file" name="file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
          </div>
          <button type="submit" className="fk-btn fk-primary">
            Upload and read
          </button>
          <p className="small">Reading a long document can take up to a minute.</p>
        </form>
      </section>
      {docs.length > 0 && (
        <section className="card" aria-labelledby="docs-list">
          <h2 id="docs-list">Uploaded</h2>
          <ul className="people">
            {docs.map((d) => (
              <li key={d.id}>
                <span className="who-cell">
                  <a href={`/setup/documents/${d.id}`}>
                    <strong>{d.fileName}</strong>
                  </a>
                  <span>
                    {KIND[d.kind]}
                    {d.status === 'failed' ? ': Fork couldn’t read it' : `: ${d.facts} ${d.facts === 1 ? 'fact' : 'facts'} found`}
                  </span>
                </span>
                {d.instructionsFound ? (
                  <span className="badge warn">Check this file</span>
                ) : d.unconfirmed > 0 ? (
                  <span className="badge warn">{d.unconfirmed} to check</span>
                ) : (
                  <span className="badge good">Checked</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
