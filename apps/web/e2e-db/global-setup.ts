import pg from 'pg';
import { asAdmin, migrate, schema as s } from '../../../packages/db/src';
import { ensureLocalCluster, localUrl } from '../../../packages/db/src/local';
import { enableLocalLogins } from '../../../packages/db/src/testing';

/** A fresh fork_e2e database with Larkfield and its owner, Maya. */
export default async function setup() {
  ensureLocalCluster();
  const c = new pg.Client({ connectionString: localUrl('postgres') });
  await c.connect();
  await c.query('DROP DATABASE IF EXISTS fork_e2e WITH (FORCE)');
  await c.query('CREATE DATABASE fork_e2e');
  await c.end();
  await migrate(localUrl('fork_e2e'));
  await enableLocalLogins();
  await asAdmin(localUrl('fork_e2e'), async (db) => {
    const [company] = await db.insert(s.company).values({ name: 'Larkfield' }).returning();
    const [maya] = await db.insert(s.appUser).values({ email: 'maya.collins@larkfield.test' }).returning();
    await db.insert(s.membership).values({ userId: maya!.id, companyId: company!.id, role: 'owner' });
  });
}
