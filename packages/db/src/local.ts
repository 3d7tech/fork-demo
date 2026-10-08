// A throwaway PostgreSQL cluster for development and tests, in .data/pg (ADR 0007).
// Production uses a managed database; nothing here runs there.
import { execFileSync } from 'node:child_process';
import { chmodSync, chownSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from './paths';

export const LOCAL_PORT = Number(process.env.FORK_PG_PORT ?? 5433);
const DATA = join(repoRoot, '.data/pg');
const SOCKET = join(repoRoot, '.data/sock');

/** Development passwords only. Production passwords come from the environment. */
export const DEV_PASSWORDS = { fork_app: 'fork_app_dev', fork_auth: 'fork_auth_dev' } as const;

export function localUrl(database: string, user = 'postgres', password?: string) {
  return `postgres://${user}${password ? `:${password}` : ''}@127.0.0.1:${LOCAL_PORT}/${database}`;
}

function pgBin(name: string): string {
  if (process.env.FORK_PG_BIN) return join(process.env.FORK_PG_BIN, name);
  for (const v of ['18', '17', '16']) {
    const p = `/usr/lib/postgresql/${v}/bin/${name}`;
    if (existsSync(p)) return p;
  }
  return name; // On PATH (macOS with Homebrew, for example).
}

/** PostgreSQL refuses to run as root, so in a root container run it as the postgres user. */
function run(bin: string, args: string[]) {
  const asRoot = userInfo().uid === 0;
  const [cmd, argv] = asRoot ? ['runuser', ['-u', 'postgres', '--', pgBin(bin), ...args]] : [pgBin(bin), args];
  return execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function isRunning(): boolean {
  try {
    run('pg_isready', ['-h', '127.0.0.1', '-p', String(LOCAL_PORT)]);
    return true;
  } catch {
    return false;
  }
}

/** Create the cluster if needed and start it. Safe to call repeatedly. */
export function ensureLocalCluster(): void {
  if (isRunning()) return;
  mkdirSync(SOCKET, { recursive: true });
  if (!existsSync(join(DATA, 'PG_VERSION'))) {
    mkdirSync(DATA, { recursive: true });
    if (userInfo().uid === 0) {
      const pg = Number(execFileSync('id', ['-u', 'postgres']).toString().trim());
      const gid = Number(execFileSync('id', ['-g', 'postgres']).toString().trim());
      for (const d of [DATA, SOCKET]) chownSync(d, pg, gid);
    }
    chmodSync(DATA, 0o700);
    run('initdb', ['-D', DATA, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C.UTF-8']);
    // Local only: listen on loopback, trust connections. Fine for a throwaway dev cluster.
    writeFileSync(join(DATA, 'postgresql.auto.conf'), `listen_addresses = '127.0.0.1'\nport = ${LOCAL_PORT}\nunix_socket_directories = '${SOCKET}'\nfsync = off\nsynchronous_commit = off\nfull_page_writes = off\n`);
    if (userInfo().uid === 0) {
      const pg = Number(execFileSync('id', ['-u', 'postgres']).toString().trim());
      const gid = Number(execFileSync('id', ['-g', 'postgres']).toString().trim());
      chownSync(join(DATA, 'postgresql.auto.conf'), pg, gid);
    }
  }
  run('pg_ctl', ['-D', DATA, '-l', join(DATA, 'server.log'), '-w', 'start']);
}

export function stopLocalCluster(): void {
  if (isRunning()) run('pg_ctl', ['-D', DATA, '-w', 'stop', '-m', 'fast']);
}
