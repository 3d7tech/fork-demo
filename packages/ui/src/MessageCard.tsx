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
      {message.body.split('\n').map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      {message.source && <p className="fk-note">Source: {message.source}, confirmed by your company.</p>}
      {message.canHelpWith && message.canHelpWith.length > 0 && (
        <>
          <h2 className="fk-note">Fork can help you with</h2>
          <ul className="fk-can-help">
            {message.canHelpWith.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {message.routeTo && message.routeTo !== 'support' && (
        <button type="button" className="fk-btn fk-secondary" onClick={() => onRoute?.(message.routeTo!)}>
          {NEXT[message.routeTo]}
        </button>
      )}
    </article>
  );
}
