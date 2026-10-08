import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as drizzleMigrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { migrationsFolder } from './paths';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** Who is making a signed-in request. Row-level security checks it against membership. */
export interface RequestContext {
  userId: string;
  companyId: string;
  role: 'owner' | 'employee';
}

export interface ForkDatabase {
  /** Run as a signed-in member: one transaction, with the context set for row-level security. */
  asMember<T>(ctx: RequestContext, fn: (db: Db) => Promise<T>): Promise<T>;
  /** Sign-in, sessions and invites, before anyone is signed in. Only the auth tables are reachable. */
  asAuth<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function inTransaction<T>(pool: pg.Pool, setup: (c: pg.PoolClient) => Promise<void>, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setup(client);
    const result = await fn(drizzle(client, { schema }));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Connect as the two application roles. Neither owns a table, so every row-level security
 * policy applies. `appUrl` logs in as fork_app, `authUrl` as fork_auth.
 */
export function connect(urls: { appUrl: string; authUrl: string }): ForkDatabase {
  const app = new pg.Pool({ connectionString: urls.appUrl, max: 10 });
  const auth = new pg.Pool({ connectionString: urls.authUrl, max: 4 });
  return {
    asMember: (ctx, fn) =>
      inTransaction(
        app,
        async (c) => {
          // set_config(..., true) lasts for this transaction only, so a pooled connection can't leak it.
          await c.query("SELECT set_config('fork.user_id', $1, true), set_config('fork.company_id', $2, true), set_config('fork.role', $3, true)", [
            ctx.userId,
            ctx.companyId,
            ctx.role,
          ]);
        },
        fn,
      ),
    asAuth: (fn) => inTransaction(auth, async () => {}, fn),
    close: async () => {
      await Promise.all([app.end(), auth.end()]);
    },
  };
}

/** Apply migrations as the database owner. */
export async function migrate(adminUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await drizzleMigrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** Run admin work as the database owner, with row-level security not applying. For operator scripts and tests only. */
export async function asAdmin<T>(adminUrl: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    return await inTransaction(pool, async () => {}, fn);
  } finally {
    await pool.end();
  }
}
