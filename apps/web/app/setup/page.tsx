import { setupProgress } from '@fork/setup';
import { database } from '@/lib/db';
import { requireOwner } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = { settings: 'Company settings saved.', scheme: 'Pension scheme saved.' };

export default async function Setup({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { ctx, companyName } = await requireOwner();
  const p = await setupProgress(database(), ctx);
  const { saved } = await searchParams;
  const steps = [
    { href: '/setup/company', done: p.settings, title: 'Company settings', detail: p.settings ? 'Saved' : 'NI saving shared with staff, Employment Allowance' },
    { href: '/setup/scheme', done: p.scheme, title: 'Pension scheme', detail: p.scheme ? 'Saved' : 'Contribution rates and how tax relief is given' },
    { href: '/setup/payroll', done: p.payrollImports > 0, title: 'Payroll export', detail: p.payrollImports ? `${p.people} people imported` : 'CSV or Excel from your payroll software' },
    {
      href: '/setup/documents',
      done: p.documents > 0 && p.factsToCheck === 0,
      title: 'Company documents',
      detail: p.documents ? (p.factsToCheck ? `${p.factsToCheck} facts to check` : `${p.documents} uploaded and checked`) : 'Staff handbook, pension booklet, benefit terms',
    },
    {
      href: '/setup/team',
      done: p.invited > 0,
      title: 'Invite your team',
      detail: p.invited ? `${p.invited} invited, ${p.joined} joined` : p.people ? `${p.people} people ready to invite` : 'After the payroll import',
    },
  ];
  const left = steps.filter((s) => !s.done).length;
  return (
    <>
      <section className="card" aria-labelledby="setup-title">
        <h1 id="setup-title">Set up Fork for {companyName}</h1>
        <p className="lead">{left === 0 ? 'Setup is done. Your team can start asking.' : `${left} of ${steps.length} steps to go. Most companies finish in under an hour.`}</p>
        {saved && SAVED[saved] && (
          <p className="notice" role="status">
            {SAVED[saved]}
          </p>
        )}
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.href} className={s.done ? 'done' : ''}>
              <a href={s.href}>
                <span className="tick" aria-hidden="true">
                  {s.done ? '✓' : i + 1}
                </span>
                <span className="text">
                  <strong>
                    {s.title}
                    <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
                  </strong>
                  <span>{s.detail}</span>
                </span>
                <span className="go" aria-hidden="true">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
