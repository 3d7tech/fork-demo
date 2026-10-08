// Uploaded files live outside the database; the database keeps the key, size and hash (ADR 0007).
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface FileStore {
  put(companyId: string, bytes: Uint8Array): Promise<{ key: string; sha256: string; sizeBytes: number }>;
  get(key: string): Promise<Uint8Array>;
}

const UUID = /^[0-9a-f-]{36}$/;

/** Files on local disk, in a folder outside the web root. */
export class LocalFileStore implements FileStore {
  constructor(private readonly root: string) {}

  private path(key: string) {
    const [company, file, extra] = key.split('/');
    if (!company || !file || extra !== undefined || !UUID.test(company) || !UUID.test(file)) throw new Error('Bad file key');
    return resolve(join(this.root, company, file));
  }

  async put(companyId: string, bytes: Uint8Array) {
    const key = `${companyId}/${randomUUID()}`;
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, bytes, { mode: 0o600 });
    return { key, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.byteLength };
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.path(key)));
  }
}
