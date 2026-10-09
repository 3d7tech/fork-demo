import 'server-only';
import { join } from 'node:path';

// The outbox file is shared with the scheduled jobs; default to the repository's .data folder.
process.env.FORK_OUTBOX_FILE ??= join(process.cwd(), '../../.data/outbox.jsonl');

export { readOutbox, sendMail, type Mail } from '@fork/setup';
export const OUTBOX_ENABLED = process.env.FORK_DEV_OUTBOX === '1';
