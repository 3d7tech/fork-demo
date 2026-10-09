import { clearChange, listSaved, myRequests, myRuns, removeSaved } from '@fork/setup';
import { revalidatePath } from 'next/cache';
import { database } from '@/lib/db';
import { requireMember } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = {
  draft: ['Waiting for an accountant', 'warn'],
  sent: ['Sent to your accountant', ''],
  acknowledged: ['Accountant is on it', ''],
  done: ['Done', 'good'],
  declined: ['Not done', 'warn'],
};

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function savedAction(form: FormData) {
  'use server';
  const { ctx } = await requireMember();
  const id = String(form.get('id'));
  if (form.get('op') === 'remove') await removeSaved(database(), ctx, id);
  else await clearChange(database(), ctx, id);
  revalidatePath('/decisions');
}

export default async function Decisions() {
  const { ctx, role, companyName } = await requireMember();
  const [saved, requests, runs] = await Promise.all([listSaved(database(), ctx), myRequests(database(), ctx), myRuns(database(), ctx, 10)]);
  return (
    <>
      <section className="card" aria-labelledby="saved-title">
        <h1 id="saved-title">My decisions</h1>
        <p className="lead">
          {role === 'employee' ? `Private to you. ${companyName} never sees these.` : 'Decisions you saved, and plans you sent to your accountant.'}
        </p>
        <h2>Saved</h2>
        {saved.length === 0 && <p className="small">Nothing saved yet. On any answer, choose “Save and tell me if this changes”.</p>}
        <ul className="people">
          {saved.map((d) => (
            <li key={d.id}>
              <span className="who-cell">
                <strong>{d.title}</strong>
                <span>{d.changeNote ?? `Saved ${day(d.createdAt)}${d.lastCheckedAt ? `, checked ${day(d.lastCheckedAt)}` : ''}`}</span>
              </span>
              <form action={savedAction}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="op" value={d.changeNote ? 'seen' : 'remove'} />
                {d.changeNote ? (
                  <button type="submit" className="linkish">
                    Got it
                  </button>
                ) : (
                  <button type="submit" className="linkish" aria-label={`Stop watching ${d.title}`}>
                    Remove
                  </button>
                )}
              </form>
            </li>
          ))}
        </ul>
      </section>
      <section className="card" aria-labelledby="req-title">
        <h2 id="req-title">Requests to your accountant</h2>
        {requests.length === 0 && <p className="small">None yet.</p>}
        <ul className="people">
          {requests.map((r) => {
            const [text, tone] = STATUS[r.status] ?? [r.status, ''];
            return (
              <li key={r.id}>
                <span className="who-cell">
                  <span>{r.summary}</span>
                  {r.note && <span>Accountant: {r.note}</span>}
                </span>
                <span className={`badge ${tone}`}>{text}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card" aria-labelledby="recent-title">
        <h2 id="recent-title">Recent questions</h2>
        {runs.length === 0 && <p className="small">None yet.</p>}
        <ul className="people">
          {runs.map((r) => (
            <li key={r.id}>
              <span className="who-cell">
                <span>“{r.question}”</span>
                <span>{day(r.createdAt)}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="small">
          <a href="/me">Download or delete your data</a>
        </p>
      </section>
    </>
  );
}
