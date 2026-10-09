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
      <form action={choose} className="form">
        {viewer.who.memberships.map((m) => (
          <button key={`${m.companyId}.${m.role}`} type="submit" name="as" value={`${m.companyId}.${m.role}`} className="fk-btn fk-secondary">
            {m.companyName}: {m.role === 'owner' ? 'owner' : 'employee'}
          </button>
        ))}
      </form>
    </section>
  );
}
