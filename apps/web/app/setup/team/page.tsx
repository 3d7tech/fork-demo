import { listPeople } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';
import { inviteEmployeesAction, inviteOwnerAction } from '../actions';

export const dynamic = 'force-dynamic';

const STATUS = { joined: ['Joined', 'good'], invited: ['Invited', ''], not_invited: ['Not invited', 'warn'] } as const;

export default async function Team({ searchParams }: { searchParams: Promise<{ imported?: string; added?: string; invited?: string; error?: string }> }) {
  const { ctx, companyName } = await requireOwner();
  const q = await searchParams;
  const people = await listPeople(database(), ctx);
  const ready = people.filter((p) => p.email && p.status === 'not_invited').length;
  const noEmail = people.filter((p) => !p.email).length;
  return (
    <>
      <section className="card" aria-labelledby="team-title">
        <a href="/setup" className="back">
          ‹ Setup
        </a>
        <h1 id="team-title">Invite your team</h1>
        {q.imported && (
          <p className="notice" role="status">
            Imported {q.imported} people{q.added && q.added !== q.imported ? ` (${q.added} new)` : ''}.
          </p>
        )}
        {q.invited && (
          <p className="notice" role="status">
            {q.invited === '1' ? 'Invite sent.' : `${q.invited} invites sent.`}
          </p>
        )}
        {q.error && (
          <p className="notice warn" role="alert">
            {q.error}
          </p>
        )}
        <p className="lead">Each person gets an email with a link to join. What they ask Fork stays private to them: {companyName} sees take-up numbers only.</p>
        {ready > 0 && (
          <form action={inviteEmployeesAction}>
            <button type="submit" className="fk-btn fk-primary">
              Invite {ready} {ready === 1 ? 'person' : 'people'}
            </button>
          </form>
        )}
        {noEmail > 0 && <p className="small">{noEmail} people have no email in the payroll export. Add a work email column and upload again to invite them.</p>}
        <ul className="people" aria-label="People">
          {people.map((p) => {
            const [text, tone] = STATUS[p.status];
            return (
              <li key={p.id}>
                <span className="who-cell">
                  <strong>{p.name}</strong>
                  <span>{p.email ?? 'No email'}</span>
                </span>
                {p.status === 'not_invited' && p.email ? (
                  <form action={inviteEmployeesAction}>
                    <input type="hidden" name="employeeId" value={p.id} />
                    <button type="submit" className="linkish" aria-label={`Invite ${p.name}`}>
                      Invite
                    </button>
                  </form>
                ) : (
                  <span className={`badge ${tone}`}>{text}</span>
                )}
              </li>
            );
          })}
        </ul>
        {people.length === 0 && (
          <p>
            No one yet. <a href="/setup/payroll">Upload your payroll export</a> first.
          </p>
        )}
      </section>
      <section className="card" aria-labelledby="owner-title">
        <h2 id="owner-title">Add another owner</h2>
        <p className="small">Owners can change settings, upload payroll and invite people. They can’t see anyone’s questions or decisions either.</p>
        <form action={inviteOwnerAction} className="form">
          <div className="field">
            <label htmlFor="owner-email">Email</label>
            <input id="owner-email" name="email" type="email" required />
          </div>
          <button type="submit" className="fk-btn fk-secondary">
            Send owner invite
          </button>
        </form>
      </section>
    </>
  );
}
