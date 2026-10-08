// Test databases: one migrated template per run, and a fresh copy for each test file.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { connect, migrate, type ForkDatabase } from './client';
import { DEV_PASSWORDS, ensureLocalCluster, localUrl } from './local';

const TEMPLATE = 'fork_template';

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: localUrl('postgres') });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Give the application roles a login on the local cluster. Roles are cluster-wide. */
export async function enableLocalLogins(): Promise<void> {
  await admin(async (c) => {
    for (const [roleName, password] of Object.entries(DEV_PASSWORDS)) {
      const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [roleName]);
      if (exists.rowCount) await c.query(`ALTER ROLE ${roleName} LOGIN PASSWORD '${password}'`);
    }
  });
}

/** Vitest global setup: start the cluster and build the migrated template. */
export async function buildTemplate(): Promise<void> {
  ensureLocalCluster();
  await admin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${TEMPLATE} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${TEMPLATE}`);
  });
  await migrate(localUrl(TEMPLATE));
  await enableLocalLogins();
}

export interface TestDatabase {
  db: ForkDatabase;
  adminUrl: string;
  drop(): Promise<void>;
}

/** A fresh, migrated database for one test file. */
export async function freshDatabase(): Promise<TestDatabase> {
  const name = `fork_test_${randomBytes(6).toString('hex')}`;
  await admin((c) => c.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE}`));
  const db = connect({ appUrl: localUrl(name, 'fork_app', DEV_PASSWORDS.fork_app), authUrl: localUrl(name, 'fork_auth', DEV_PASSWORDS.fork_auth) });
  return {
    db,
    adminUrl: localUrl(name),
    drop: async () => {
      await db.close();
      await admin((c) => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
    },
  };
}
