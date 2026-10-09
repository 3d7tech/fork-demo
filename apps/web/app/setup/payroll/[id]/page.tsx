import { FIELDS, label, readUpload, type FieldId } from '@fork/setup';
import { notFound } from 'next/navigation';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { importPayrollAction } from '../../actions';

export const dynamic = 'force-dynamic';

const PROBLEM: Record<string, string> = {
  missing: 'is empty',
  not_a_number: 'isn’t a number',
  out_of_range: 'looks wrong',
  not_a_date: 'isn’t a date we can read (use 31/01/1990)',
  not_an_email: 'isn’t an email address',
  not_recognised: 'isn’t one Fork recognises',
  duplicate: 'is used twice',
};

function lastDayOfLastMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)).toISOString().slice(0, 10);
}

export default async function MapColumns({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; check?: string }> }) {
  const { ctx } = await requireOwner();
  const { id } = await params;
  const { error } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const upload = await readUpload(database(), ctx, id);
  if (!upload) notFound();
  const mapping = upload.mapping ?? upload.suggestedMapping ?? {};
  const problems = upload.problems ?? [];
  const optional = new Set<FieldId>(['name', 'first_name', 'last_name']);
  return (
    <section className="card" aria-labelledby="map-title">
      <a href="/setup/payroll" className="back">
        ‹ Upload a different file
      </a>
      <h1 id="map-title">Check the columns</h1>
      <p className="lead">
        {upload.fileName}: {upload.rowCount} people. Fork matched these columns. Change any that are wrong.
      </p>
      {error && (
        <p className="notice warn" role="alert">
          {error}
        </p>
      )}
      {problems.length > 0 && (
        <div className="notice warn" role="alert">
          <p>
            <strong>Nothing has been saved yet.</strong> Fix these in your file and upload it again, or choose a different column:
          </p>
          <ul className="problems">
            {problems.slice(0, 12).map((p, i) => (
              <li key={i}>
                Person {p.row}: {label(p.field as FieldId).toLowerCase()} {PROBLEM[p.code] ?? 'needs checking'}
              </li>
            ))}
          </ul>
          {problems.length > 12 && <p>And {problems.length - 12} more.</p>}
        </div>
      )}
      <form action={importPayrollAction} className="form">
        <input type="hidden" name="uploadId" value={upload.id} />
        {FIELDS.map((f) => {
          const current = mapping[f.id] ?? '';
          const needsLook = f.required && !current;
          return (
            <div key={f.id} className={`field${needsLook ? ' unsure' : ''}`}>
              <label htmlFor={`map_${f.id}`}>
                {f.label} {f.required ? '' : optional.has(f.id) ? '' : <span className="badge">optional</span>}
                {needsLook && <span className="badge warn">choose a column</span>}
              </label>
              <span className="hint" id={`hint_${f.id}`}>
                {f.description}
              </span>
              <select id={`map_${f.id}`} name={`map_${f.id}`} defaultValue={current} aria-describedby={`hint_${f.id}`}>
                <option value="">Not in this file</option>
                {upload.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="field">
          <label htmlFor="periodEnd">Pay period this export is for (last day)</label>
          <input id="periodEnd" name="periodEnd" type="date" defaultValue={upload.payPeriodEnd ?? lastDayOfLastMonth()} required />
        </div>
        <button type="submit" className="fk-btn fk-primary">
          Check and import {upload.rowCount} people
        </button>
      </form>
    </section>
  );
}
