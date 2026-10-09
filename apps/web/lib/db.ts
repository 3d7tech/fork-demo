import 'server-only';
import { connect, type ForkDatabase } from '@fork/db';
import { LocalFileStore, type FileStore } from '@fork/setup';
import { join } from 'node:path';

/**
 * With a database configured, people sign in and their own data is used. Without one the app
 * runs as the Larkfield demo (ADR 0006), which is what the end-to-end tests use.
 */
export const DB_MODE = Boolean(process.env.FORK_DATABASE_APP_URL && process.env.FORK_DATABASE_AUTH_URL);

const g = globalThis as unknown as { forkDb?: ForkDatabase; forkFiles?: FileStore };

export function database(): ForkDatabase {
  if (!DB_MODE) throw new Error('No database configured');
  g.forkDb ??= connect({ appUrl: process.env.FORK_DATABASE_APP_URL!, authUrl: process.env.FORK_DATABASE_AUTH_URL! });
  return g.forkDb;
}

/** Uploaded files, outside the web root. */
export function fileStore(): FileStore {
  g.forkFiles ??= new LocalFileStore(process.env.FORK_FILES_DIR ?? join(process.cwd(), '../../.data/files'));
  return g.forkFiles;
}
