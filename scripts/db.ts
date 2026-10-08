// Local database for development: pnpm db up | stop | reset
import pg from 'pg';
import { migrate } from '../packages/db/src/client';
import { ensureLocalCluster, localUrl, stopLocalCluster } from '../packages/db/src/local';
import { enableLocalLogins } from '../packages/db/src/testing';

const command = process.argv[2] ?? 'up';
const DB = 'fork';

async function createIfMissing(drop = false) {
  const c = new pg.Client({ connectionString: localUrl('postgres') });
  await c.connect();
  if (drop) await c.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB]);
  if (!exists.rowCount) await c.query(`CREATE DATABASE ${DB}`);
  await c.end();
}

if (command === 'stop') {
  stopLocalCluster();
} else if (command === 'up' || command === 'reset') {
  ensureLocalCluster();
  await createIfMissing(command === 'reset');
  await migrate(localUrl(DB));
  await enableLocalLogins();
  console.log(`Database ready: ${localUrl(DB)}`);
} else {
  console.error('Usage: pnpm db up | stop | reset');
  process.exit(1);
}
