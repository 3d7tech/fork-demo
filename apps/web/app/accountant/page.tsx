import { accountantInbox, updateRequestStatus } from '@fork/setup';
import { revalidatePath } from 'next/cache';
import { database } from '@/lib/db';
import { sendMail } from '@/lib/mail';
import { baseUrl, requireAccountant } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = { sent: 'New', acknowledged: 'In progress', done: 'Done', declined: 'Not done' };

async function update(form: FormData) {
  'use server';
  const { ctx } = await requireAccountant();
  const status = form.get('status');
  if (status !== 'acknowledged' && status !== 'done' && status !== 'declined') return;
  const note = String(form.get('note') ?? '').trim() || null;
  const email = await updateRequestStatus(database(), ctx, String(form.get('id')), status, note);
  if (email && status !== 'acknowledged') {
    await sendMail({
      to: email,
      subject: status === 'done' ? 'Your request has been done' : 'An update on your request',
      text: `${status === 'done' ? 'Your accountant has made the change you asked for.' : 'Your accountant couldn’t make the change you asked for.'}${note ? `\n\nTheir note: ${note}` : ''}\n\nSee it in Fork:\n${await baseUrl()}/decisions`,
    });
  }
  revalidatePath('/accountant');
}

export default async function Accountant() {
  const { ctx, who } = await requireAccountant();
  const inbox = await accountantInbox(database(), ctx);
  const open = inbox.filter((r) => r.status === 'sent' || r.status === 'acknowledged');
  return (
    <section className="card" aria-labelledby="acc-title">
      <h1 id="acc-title">Requests</h1>
      <p className="lead">
        From {who.accountantFor.map((c) => c.companyName).join(', ')}. Fork never changes payroll; you do. {open.length ? `${open.length} open.` : 'Nothing open.'}
      </p>
      {inbox.map((r) => (
        <article key={r.id} className="fact" aria-labelledby={`req-${r.id}`}>
          <h2 id={`req-${r.id}`}>
            {r.companyName} <span className={`badge ${r.status === 'done' ? 'good' : r.status === 'sent' ? 'warn' : ''}`}>{LABEL[r.status] ?? r.status}</span>
          </h2>
          <p>{r.summary}</p>
          {r.note && <p className="small">Your note: {r.note}</p>}
          {(r.status === 'sent' || r.status === 'acknowledged') && (
            <form action={update} className="fact-actions">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor={`note-${r.id}`}>Note for them (optional)</label>
                <input id={`note-${r.id}`} name="note" type="text" />
              </div>
              <fieldset className="field">
                <legend>Status</legend>
                {r.status === 'sent' && (
                  <label className="choice">
                    <input type="radio" name="status" value="acknowledged" defaultChecked />
                    <span>On it</span>
                  </label>
                )}
                <label className="choice">
                  <input type="radio" name="status" value="done" defaultChecked={r.status === 'acknowledged'} />
                  <span>Done</span>
                </label>
                <label className="choice">
                  <input type="radio" name="status" value="declined" />
                  <span>Can’t do this</span>
                </label>
              </fieldset>
              <button type="submit" className="fk-btn fk-primary">
                Update
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
