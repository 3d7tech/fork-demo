import { FAMILIES, formatGBP } from '@fork/pipeline';
import { GROUP_SIZE, ownerDashboard, setupProgress } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { draft: 'Waiting for an accountant', sent: 'Sent', acknowledged: 'In progress', done: 'Done', declined: 'Not done' };

export default async function Dashboard() {
  const { ctx, companyName } = await requireOwner();
  const [d, p] = await Promise.all([ownerDashboard(database(), ctx), setupProgress(database(), ctx)]);
  return (
    <>
      <section className="card" aria-labelledby="dash-title">
        <h1 id="dash-title">{companyName} on Fork</h1>
        <div className="tiles">
          <div className="tile">
            <span>Saved so far by salary sacrifice</span>
            <strong>{d.switched ? formatGBP(d.switched.savingToDate) : '—'}</strong>
          </div>
          <div className="tile">
            <span>Saving a year at today’s take-up</span>
            <strong>{d.switched ? formatGBP(d.switched.savingPerYear) : '—'}</strong>
          </div>
          <div className="tile">
            <span>Staff who switched</span>
            <strong>{d.switched ? d.switched.people : `Fewer than ${GROUP_SIZE}`}</strong>
          </div>
          <div className="tile">
            <span>Staff on Fork</span>
            <strong>
              {d.joined} of {p.people}
            </strong>
          </div>
        </div>
        <p className="small">To protect privacy, Fork shows take-up and savings only once {GROUP_SIZE} or more people have switched, and never who.</p>
      </section>
      <section className="card" aria-labelledby="topics-title">
        <h2 id="topics-title">What staff are asking about</h2>
        <p className="small">Last 90 days. A topic appears once {GROUP_SIZE} or more different people have asked. You never see who, or what they asked.</p>
        {d.topics.length === 0 ? (
          <p>No topic has reached {GROUP_SIZE} people yet.</p>
        ) : (
          <ul className="people">
            {d.topics.map((t) => (
              <li key={t.family}>
                <span>{FAMILIES[t.family]?.title ?? 'Something else'}</span>
                <span className="badge">{t.people} people</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card" aria-labelledby="plans-title">
        <h2 id="plans-title">Plans sent to your accountant</h2>
        {d.plans.length === 0 && <p className="small">None yet. Ask Fork about a company decision and send the plan from the answer.</p>}
        <ul className="people">
          {d.plans.map((r) => (
            <li key={r.id}>
              <span className="who-cell">
                <span>{r.summary}</span>
                {r.note && <span>Accountant: {r.note}</span>}
              </span>
              <span className="badge">{STATUS[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
