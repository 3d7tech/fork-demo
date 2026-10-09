import 'server-only';
import { contextFor, readSession, schema, type RequestContext, type SignedIn } from '@fork/db';
import { DEMO_SUBJECT, type Subject } from '@fork/pipeline';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { database, DB_MODE } from './db';

export const SESSION_COOKIE = 'fork_session';
export const ACTING_COOKIE = 'fork_as';

export type Viewer =
  | { mode: 'demo'; subject: Subject; companyName: string; personName: string; role: 'employee' }
  | {
      mode: 'db';
      who: SignedIn;
      ctx: RequestContext;
      subject: Subject;
      companyName: string;
      personName: string;
      role: 'owner' | 'employee';
      canSwitch: boolean;
    };

/** Who is looking, and which company and role they are acting in. Null when signed out. */
export async function getViewer(): Promise<Viewer | null> {
  if (!DB_MODE) return { mode: 'demo', subject: DEMO_SUBJECT, companyName: 'Larkfield', personName: 'Ella Brooks', role: 'employee' };
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const who = await readSession(database(), token);
  if (!who || !who.memberships.length) return null;
  const [cid, r] = (jar.get(ACTING_COOKIE)?.value ?? '').split('.');
  const pick =
    who.memberships.find((m) => m.companyId === cid && m.role === r) ?? who.memberships.find((m) => m.role === 'owner') ?? who.memberships[0]!;
  const ctx = contextFor(who, pick.companyId, pick.role)!;
  let personName = who.email;
  if (pick.employeeId) {
    const [emp] = await database().asMember(ctx, (db) => db.select({ name: schema.employee.name }).from(schema.employee).where(eq(schema.employee.id, pick.employeeId!)));
    if (emp) personName = emp.name;
  }
  return {
    mode: 'db',
    who,
    ctx,
    subject: { audience: pick.role, companyId: pick.companyId, ...(pick.employeeId ? { employeeId: pick.employeeId } : {}) },
    companyName: pick.companyName,
    personName,
    role: pick.role,
    canSwitch: who.memberships.length > 1,
  };
}

export async function requireViewer(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect('/signin');
  return v;
}

export async function requireOwner() {
  const v = await requireViewer();
  if (v.mode !== 'db' || v.role !== 'owner') redirect('/');
  return v;
}

/** The address people should use in emailed links. */
export async function baseUrl(): Promise<string> {
  if (process.env.FORK_BASE_URL) return process.env.FORK_BASE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !process.env.FORK_INSECURE_COOKIES,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
}
