import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of a file in the repository. Works from source (tests, scripts) and from a
 * bundled server (the web app), where import.meta.url no longer points into the repo.
 */
export function repoPath(rel: string): string {
  const fromSource = fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
  if (existsSync(fromSource)) return fromSource;
  let dir = resolve(process.env.FORK_ROOT ?? process.cwd());
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, rel);
    const up = dirname(dir);
    if (up === dir) throw new Error(`Can't find the repository root to read ${rel}; set FORK_ROOT`);
    dir = up;
  }
}
