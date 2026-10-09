import { notFound } from 'next/navigation';
import { OUTBOX_ENABLED, outbox } from '@/lib/mail';

export const dynamic = 'force-dynamic';

/** Development only: emails Fork would have sent. Missing unless FORK_DEV_OUTBOX=1. */
export default function Outbox() {
  if (!OUTBOX_ENABLED) notFound();
  const mails = outbox();
  return (
    <section className="card" aria-labelledby="ob-title">
      <h1 id="ob-title">Development outbox</h1>
      <p className="small">Emails Fork would have sent, newest first. Nothing here leaves this server.</p>
      {mails.length === 0 && <p>No emails yet.</p>}
      {mails.map((m, i) => (
        <article key={i} className="mail">
          <h2>{m.subject}</h2>
          <p className="small">
            To {m.to} at {m.at.slice(11, 16)}
          </p>
          <pre>
            {m.text.split(/(https?:\/\/\S+)/).map((part, j) =>
              /^https?:\/\//.test(part) ? (
                <a key={j} href={part}>
                  {part}
                </a>
              ) : (
                part
              ),
            )}
          </pre>
        </article>
      ))}
    </section>
  );
}
