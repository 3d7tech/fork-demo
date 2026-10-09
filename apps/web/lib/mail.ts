import 'server-only';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email. For now a development outbox: messages are kept in memory and shown on /dev/outbox.
 * Sending through 3d7's cPanel mail server over SMTP comes before the pilot (ADR 0007).
 */
export const OUTBOX_ENABLED = process.env.FORK_DEV_OUTBOX === '1';

const g = globalThis as unknown as { forkOutbox?: Array<Mail & { at: string }> };
export const outbox = () => (g.forkOutbox ??= []);

export async function sendMail(mail: Mail): Promise<void> {
  if (!OUTBOX_ENABLED) throw new Error('Email isn’t set up yet. Set FORK_DEV_OUTBOX=1 for development.');
  outbox().unshift({ ...mail, at: new Date().toISOString() });
  outbox().splice(50);
  console.log(`[outbox] to ${mail.to}: ${mail.subject}`);
}
