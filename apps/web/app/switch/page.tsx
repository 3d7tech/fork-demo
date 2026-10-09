import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACTING_COOKIE, requireViewer } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

async function choose(form: FormData) {
  'use server';
  (await cookies()).set(ACTING_COOKIE, String(form.get('as') ?? ''), { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/');
}

/** For people who belong to more than one company, or are both owner and employee. */
export default async function Switch() {
  const viewer = await requireViewer();
  if (viewer.mode !== 'db') redirect('/');
  return (
    <section className="card" aria-labelledby="sw-title">
      <h1 id="sw-title">Use Fork as</h1>
      <div className="form">
        {viewer.who.accountantFor.length > 0 && (
          <form action={choose}>
            <input type="hidden" name="as" value="accountant" />
            <button type="submit" className="fk-btn fk-secondary">
              Accountant for {viewer.who.accountantFor.map((c) => c.companyName).join(', ')}
            </button>
          </form>
        )}
        {viewer.who.memberships.map((m) => (
          <form key={`${m.companyId}.${m.role}`} action={choose}>
            <input type="hidden" name="as" value={`${m.companyId}.${m.role}`} />
            <button type="submit" className="fk-btn fk-secondary">
              {m.companyName}: {m.role === 'owner' ? 'owner' : 'employee'}
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}
