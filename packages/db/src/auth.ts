// Email sign-in, sessions and invites (ADR 0007). Tokens are random, sent once, and stored
// only as SHA-256 hashes, so a database leak can't be used to sign in.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import type { ForkDatabase, RequestContext } from './client';
import * as s from './schema';

export const SIGN_IN_LINK_MINUTES = 15;
export const SESSION_DAYS = 30;
export const INVITE_DAYS = 14;

const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const normalise = (email: string) => email.trim().toLowerCase();
const minutesFrom = (now: Date, m: number) => new Date(now.getTime() + m * 60_000);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Membership {
  companyId: string;
  companyName: string;
  role: 'owner' | 'employee';
  employeeId: string | null;
}

export interface SignedIn {
  userId: string;
  email: string;
  memberships: Membership[];
  /** Companies this person handles requests for, as their accountant or payroll bureau. */
  accountantFor: Array<{ companyId: string; companyName: string }>;
}

/**
 * Start sign-in. Returns a link token only when the email belongs to someone with an account;
 * the caller shows the same message either way, so the page can't be used to test addresses.
 */
export async function requestSignIn(db: ForkDatabase, email: string, now = new Date()): Promise<string | null> {
  const address = normalise(email);
  if (!EMAIL.test(address)) return null;
  return db.asAuth(async (tx) => {
    const [user] = await tx.select({ id: s.appUser.id }).from(s.appUser).where(sql`lower(${s.appUser.email}) = ${address}`);
    if (!user) return null;
    const token = newToken();
    await tx.insert(s.loginToken).values({ email: address, tokenHash: hashToken(token), expiresAt: minutesFrom(now, SIGN_IN_LINK_MINUTES) });
    return token;
  });
}

async function startSession(tx: Parameters<Parameters<ForkDatabase['asAuth']>[0]>[0], userId: string, now: Date): Promise<string> {
  const sessionToken = newToken();
  await tx.insert(s.session).values({ idHash: hashToken(sessionToken), userId, expiresAt: minutesFrom(now, SESSION_DAYS * 24 * 60) });
  await tx.update(s.appUser).set({ lastSignInAt: now }).where(eq(s.appUser.id, userId));
  await tx.insert(s.auditEvent).values({ actorUserId: userId, action: 'auth.signed_in' });
  return sessionToken;
}

/** Use a sign-in link. Single use; returns a session token for the cookie, or null. */
export async function completeSignIn(db: ForkDatabase, token: string, now = new Date()): Promise<string | null> {
  return db.asAuth(async (tx) => {
    const [link] = await tx
      .update(s.loginToken)
      .set({ usedAt: now })
      .where(and(eq(s.loginToken.tokenHash, hashToken(token)), isNull(s.loginToken.usedAt), gt(s.loginToken.expiresAt, now)))
      .returning();
    if (!link) return null;
    const [user] = await tx.select({ id: s.appUser.id }).from(s.appUser).where(sql`lower(${s.appUser.email}) = ${link.email}`);
    return user ? startSession(tx, user.id, now) : null;
  });
}

/** Who a session cookie belongs to, and the companies they can act in. */
export async function readSession(db: ForkDatabase, sessionToken: string, now = new Date()): Promise<SignedIn | null> {
  return db.asAuth(async (tx) => {
    const [row] = await tx
      .select({ userId: s.session.userId, email: s.appUser.email })
      .from(s.session)
      .innerJoin(s.appUser, eq(s.appUser.id, s.session.userId))
      .where(and(eq(s.session.idHash, hashToken(sessionToken)), gt(s.session.expiresAt, now)));
    if (!row) return null;
    const memberships = await tx
      .select({ companyId: s.membership.companyId, companyName: s.company.name, role: s.membership.role, employeeId: s.membership.employeeId })
      .from(s.membership)
      .innerJoin(s.company, eq(s.company.id, s.membership.companyId))
      .where(eq(s.membership.userId, row.userId));
    const accountantFor = await tx
      .select({ companyId: s.accountantAccess.companyId, companyName: s.company.name })
      .from(s.accountantAccess)
      .innerJoin(s.company, eq(s.company.id, s.accountantAccess.companyId))
      .where(eq(s.accountantAccess.userId, row.userId));
    // Accountants are linked through accountant_access, never membership, so only these two roles appear here.
    const members = memberships.filter((m): m is Membership => m.role === 'owner' || m.role === 'employee');
    return { ...row, memberships: members, accountantFor };
  });
}

export async function signOut(db: ForkDatabase, sessionToken: string): Promise<void> {
  await db.asAuth((tx) => tx.delete(s.session).where(eq(s.session.idHash, hashToken(sessionToken))));
}

/** The request context for acting in one company, if the person belongs to it in that role. */
export function contextFor(who: SignedIn, companyId: string, role: 'owner' | 'employee'): RequestContext | null {
  const m = who.memberships.find((x) => x.companyId === companyId && x.role === role);
  return m ? { userId: who.userId, companyId, role } : null;
}

/** The request context for an accountant, across every company they look after. */
export function accountantContext(who: SignedIn): RequestContext | null {
  return who.accountantFor.length ? { userId: who.userId, companyId: '', role: 'accountant' } : null;
}

// ---------- Invites ----------

export interface NewInvite {
  email: string;
  role: 'owner' | 'employee' | 'accountant';
  employeeId?: string;
}

/** An owner invites someone. Row-level security makes sure they own the company. Returns the link token. */
export async function createInvite(db: ForkDatabase, ctx: RequestContext, invite: NewInvite, now = new Date()): Promise<string> {
  const email = normalise(invite.email);
  if (!EMAIL.test(email)) throw new Error('That doesn’t look like an email address.');
  if (invite.role === 'employee' && !invite.employeeId) throw new Error('An employee invite needs their payroll record.');
  const token = newToken();
  await db.asMember(ctx, async (tx) => {
    if (invite.employeeId) {
      // Row-level security hides other companies' employees, so this also stops cross-company links.
      const [emp] = await tx.select({ id: s.employee.id }).from(s.employee).where(eq(s.employee.id, invite.employeeId));
      if (!emp) throw new Error('That employee isn’t in this company.');
    }
    const [row] = await tx
      .insert(s.invite)
      .values({
        companyId: ctx.companyId,
        email,
        role: invite.role,
        employeeId: invite.employeeId ?? null,
        tokenHash: hashToken(token),
        invitedBy: ctx.userId,
        expiresAt: minutesFrom(now, INVITE_DAYS * 24 * 60),
      })
      .returning({ id: s.invite.id });
    await tx.insert(s.auditEvent).values({ companyId: ctx.companyId, actorUserId: ctx.userId, action: 'invite.created', targetType: 'invite', targetId: row!.id, detail: { role: invite.role } });
  });
  return token;
}

/** What an invite link is for, to show before the person accepts. */
export async function readInvite(db: ForkDatabase, token: string, now = new Date()) {
  return db.asAuth(async (tx) => {
    const [row] = await tx
      .select({ email: s.invite.email, role: s.invite.role, companyName: s.company.name })
      .from(s.invite)
      .innerJoin(s.company, eq(s.company.id, s.invite.companyId))
      .where(and(eq(s.invite.tokenHash, hashToken(token)), isNull(s.invite.acceptedAt), gt(s.invite.expiresAt, now)));
    return row ?? null;
  });
}

/** Accept an invite: create the account if needed, join the company, and sign in. Returns a session token. */
export async function acceptInvite(db: ForkDatabase, token: string, now = new Date()): Promise<string | null> {
  return db.asAuth(async (tx) => {
    const [inv] = await tx
      .update(s.invite)
      .set({ acceptedAt: now })
      .where(and(eq(s.invite.tokenHash, hashToken(token)), isNull(s.invite.acceptedAt), gt(s.invite.expiresAt, now)))
      .returning();
    if (!inv) return null;
    let [user] = await tx.select({ id: s.appUser.id }).from(s.appUser).where(sql`lower(${s.appUser.email}) = ${inv.email}`);
    user ??= (await tx.insert(s.appUser).values({ email: inv.email }).returning({ id: s.appUser.id }))[0]!;
    if (inv.role === 'accountant') {
      await tx.insert(s.accountantAccess).values({ userId: user.id, companyId: inv.companyId }).onConflictDoNothing();
      await tx
        .update(s.actionRequest)
        .set({ status: 'sent', statusChangedAt: now })
        .where(and(eq(s.actionRequest.companyId, inv.companyId), eq(s.actionRequest.status, 'draft')));
    } else {
      await tx
        .insert(s.membership)
        .values({ userId: user.id, companyId: inv.companyId, role: inv.role, employeeId: inv.employeeId })
        .onConflictDoNothing();
    }
    await tx.insert(s.auditEvent).values({ companyId: inv.companyId, actorUserId: user.id, action: 'invite.accepted', targetType: 'invite', targetId: inv.id });
    return startSession(tx, user.id, now);
  });
}
