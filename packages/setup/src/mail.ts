// Email. For now a development outbox in a file, shared by the web app and the scheduled jobs,
// shown at /dev/outbox. Sending through 3d7's mail server over SMTP comes before the pilot (ADR 0007).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export const OUTBOX_ENABLED = () => process.env.FORK_DEV_OUTBOX === '1';
const outboxFile = () => process.env.FORK_OUTBOX_FILE ?? join(process.cwd(), '.data/outbox.jsonl');

export async function sendMail(mail: Mail): Promise<void> {
  if (!OUTBOX_ENABLED()) throw new Error('Email isn’t set up yet. Set FORK_DEV_OUTBOX=1 for development.');
  const file = outboxFile();
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ ...mail, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
  console.log(`[outbox] to ${mail.to}: ${mail.subject}`);
}

/** Newest first. */
export function readOutbox(limit = 50): Array<Mail & { at: string }> {
  const file = outboxFile();
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .reverse()
    .slice(0, limit);
}
