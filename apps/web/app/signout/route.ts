import { signOut } from '@fork/db';
import { cookies } from 'next/headers';
import { database, DB_MODE } from '@/lib/db';
import { ACTING_COOKIE, SESSION_COOKIE } from '@/lib/viewer';

export async function POST(req: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (DB_MODE && token) await signOut(database(), token);
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTING_COOKIE);
  return Response.redirect(new URL('/signin', req.url), 303);
}
