import { acceptInvite, readInvite } from '@fork/db';
import { redirect } from 'next/navigation';
import { database } from '@/lib/db';
import { setSessionCookie } from '@/lib/viewer';

export const dynamic = 'force-dynamic';

async function accept(form: FormData) {
  'use server';
  const session = await acceptInvite(database(), String(form.get('token') ?? ''));
  if (!session) redirect('/signin?expired=1');
  await setSessionCookie(session);
  redirect('/');
}

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await readInvite(database(), token);
  if (!invite) {
    return (
      <section className="card" aria-labelledby="inv-title">
        <h1 id="inv-title">This invite has expired</h1>
        <p className="lead">Invites last 14 days and work once. Ask whoever invited you to send a new one.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="inv-title">
      <h1 id="inv-title">Join {invite.companyName} on Fork</h1>
      {invite.role === 'employee' ? (
        <>
          <p className="lead">Fork shows you what your pay, pension and benefit choices mean for you, with your own numbers.</p>
          <p className="notice">Private to you. {invite.companyName} never sees your questions, answers or decisions.</p>
        </>
      ) : (
        <p className="lead">You’ve been invited to help set up Fork for {invite.companyName}.</p>
      )}
      <p className="small">Joining as {invite.email}</p>
      <form action={accept} className="form">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="fk-btn fk-primary">
          Join {invite.companyName}
        </button>
      </form>
    </section>
  );
}
