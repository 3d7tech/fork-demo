'use client';

import type { ForkMessage } from '@fork/pipeline';

const NEXT: Record<NonNullable<ForkMessage['routeTo']>, string> = {
  documents: 'Open your documents',
  owner: 'Ask your employer',
  accountant: 'Ask your accountant',
  support: 'Get free help',
};

/** For questions that are not decisions, or that Fork shouldn't answer with a screen. */
export function MessageCard({ message, onRoute }: { message: ForkMessage; onRoute?: (to: NonNullable<ForkMessage['routeTo']>) => void }) {
  return (
    <article className={`fk-message fk-message-${message.reason}`}>
      <h1>{message.title}</h1>
      <p>{message.body}</p>
      {message.routeTo && message.routeTo !== 'support' && (
        <button type="button" className="fk-btn fk-secondary" onClick={() => onRoute?.(message.routeTo!)}>
          {NEXT[message.routeTo]}
        </button>
      )}
    </article>
  );
}
