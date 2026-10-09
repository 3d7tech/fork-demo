import { redirect } from 'next/navigation';
import { DB_MODE } from '@/lib/db';
import { sendSignInLink } from './actions';

export const dynamic = 'force-dynamic';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ sent?: string; expired?: string }> }) {
  if (!DB_MODE) redirect('/');
  const { sent, expired } = await searchParams;
  return (
    <section className="card" aria-labelledby="signin-title">
      <h1 id="signin-title">Sign in to Fork</h1>
      {sent ? (
        <p className="notice" role="status">
          If that address has a Fork account, a sign-in link is on its way. It lasts 15 minutes.
        </p>
      ) : (
        <p className="lead">We’ll email you a link. No password needed.</p>
      )}
      {expired && (
        <p className="notice warn" role="alert">
          That link has expired or has already been used. Ask for a new one.
        </p>
      )}
      <form action={sendSignInLink} className="form">
        <div className="field">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <button type="submit" className="fk-btn fk-primary">
          Email me a link
        </button>
      </form>
      <p className="small">Your questions and decisions are private to you. Your employer never sees them.</p>
    </section>
  );
}
