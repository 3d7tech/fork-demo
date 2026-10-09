import { signInWithLink } from '../../signin/actions';

export const dynamic = 'force-dynamic';

/**
 * The emailed link lands here and the person presses a button to sign in. Signing in on a
 * plain visit would let email scanners, which open links, use up the single-use token.
 */
export default async function SignInLink({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <section className="card" aria-labelledby="link-title">
      <h1 id="link-title">Sign in to Fork</h1>
      <form action={signInWithLink} className="form">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="fk-btn fk-primary">
          Sign in
        </button>
      </form>
    </section>
  );
}
