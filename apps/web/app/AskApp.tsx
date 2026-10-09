'use client';

import type { BuildStep, DecisionScreen, ForkAnswer } from '@fork/pipeline';
import { BuildingSteps, DecisionScreenView, ForkField, MessageCard } from '@fork/ui';
import { useRef, useState } from 'react';

export const EMPLOYEE_SUGGESTIONS = [
  'maya says we can switch the pension to salary sacrifice?? I’m on 32k, is it worth it or is there a catch',
  'should I pay more into my pension?',
  'where is my p60 lol',
];

export const OWNER_SUGGESTIONS = ['Should we introduce salary sacrifice for pensions?', 'What does hiring someone on £40,000 really cost us?', 'Should we pay this year’s bonus as cash or into pensions?'];

/** How long to wait after the last change before rewriting the words. */
const SETTLE_MS = 700;

type Recalc = Pick<DecisionScreen, 'answers' | 'levers' | 'calc' | 'numbers' | 'visual'>;

/** A first name to greet by; an email address is never used as a name. */
function firstName(name?: string): string | null {
  if (!name || name.includes('@')) return null;
  return name.trim().split(/\s+/)[0] || null;
}

export function AskApp({ suggestions = EMPLOYEE_SUGGESTIONS, canSave = false, name }: { suggestions?: string[]; canSave?: boolean; name?: string }) {
  const [question, setQuestion] = useState('');
  const [steps, setSteps] = useState<BuildStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<ForkAnswer | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [saveDone, setSaveDone] = useState<string | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(text);
    setBusy(true);
    setSteps([]);
    setAnswer(null);
    setError(null);
    setActionDone(null);
    setSaveDone(null);
    setStale(false);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? 'Something went wrong.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
          if (msg.type === 'step') setSteps((s) => [...s, msg.step]);
          if (msg.type === 'answer') {
            setAnswer(msg.answer);
            setDemo(msg.demo);
          }
          if (msg.type === 'error') setError(msg.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  /** Numbers update at once (code only); the words are rewritten once the person settles. */
  async function change(screen: DecisionScreen, delta: { answers?: Record<string, string>; levers?: Record<string, number> }) {
    const mine = ++seq.current;
    const answers = { ...screen.answers, ...delta.answers };
    const levers = { ...screen.levers, ...delta.levers };
    setActionDone(null);
    setStale(true);
    const res = await fetch('/api/recalculate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: screen.runId, answers, levers }) });
    if (!res.ok) return setError((await res.json()).error);
    const r = (await res.json()) as Recalc;
    if (mine !== seq.current) return;
    setAnswer((a) => (a && a.kind === 'decision' ? { ...a, ...r } : a));

    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(async () => {
      const res2 = await fetch('/api/reexplain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: screen.runId, answers, levers }) });
      if (mine !== seq.current) return;
      if (!res2.ok) return setError((await res2.json()).error);
      setAnswer((await res2.json()).answer);
      setStale(false);
    }, SETTLE_MS);
  }

  async function act(screen: DecisionScreen, save = false) {
    const res = await fetch('/api/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: screen.runId, save }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    if (save) setSaveDone(body.message);
    else setActionDone(body.message);
  }

  return (
    <>
      {!answer && !busy && steps.length === 0 && (
        <section className="home" aria-labelledby="home-title">
          <div className="home-field">
            <ForkField progress={1} idle />
          </div>
          <h1 id="home-title" className="home-title">
            {firstName(name) ? `${firstName(name)}, what shall we work out?` : 'What shall we work out?'}
          </h1>
          <p className="home-lead">Pay, pension or benefits. Ask it how you’d say it and Fork builds you an answer you can try out.</p>
        </section>
      )}
      <form
        className={`ask${answer || busy ? ' ask-compact' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="q" className="sr-only">
          What do you want to work out?
        </label>
        <div className="composer">
          <textarea
            id="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask(question);
              }
            }}
            placeholder="Ask in your own words"
            maxLength={2000}
            rows={answer || busy ? 1 : 3}
          />
          <div className="composer-row">
            <span className="composer-hint">Numbers come from the rules, never guessed</span>
            <button type="submit" className="fk-btn fk-primary composer-send" disabled={busy || !question.trim()}>
              {busy ? 'Working it out…' : 'Ask Fork'}
            </button>
          </div>
        </div>
        {!answer && !busy && (
          <ul className="chips" aria-label="Examples">
            {suggestions.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => void ask(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {(busy || (steps.length > 0 && !answer)) && <BuildingSteps steps={steps} done={!busy} />}
      {demo && answer && <p className="demo-banner">Demo mode: the numbers and checks are real; the wording is templated because no AI model is connected.</p>}
      {answer?.kind === 'decision' && (
        <DecisionScreenView
          screen={answer}
          copyStale={stale}
          actionDone={actionDone}
          onAnswer={(id, v) => void change(answer, { answers: { [id]: v } })}
          onLever={(id, v) => void change(answer, { levers: { [id]: v } })}
          onAction={() => void act(answer)}
        />
      )}
      {canSave && answer?.kind === 'decision' && answer.spec.action?.type !== 'save' && (
        <div className="fk-action">
          <button type="button" className="fk-btn fk-secondary" onClick={() => void act(answer, true)} disabled={stale || !!saveDone}>
            Save and tell me if this changes
          </button>
          <p role="status" className="fk-done">
            {saveDone ?? ''}
          </p>
        </div>
      )}
      {answer?.kind === 'message' && <MessageCard message={answer} />}
    </>
  );
}
