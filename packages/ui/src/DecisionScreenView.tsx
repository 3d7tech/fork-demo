'use client';

import type { DecisionScreen } from '@fork/pipeline';
import type { DecisionSpec } from '@fork/spec';
import { useId } from 'react';
import { LeverChart } from './LeverChart';
import { useCountUp } from './motion';
import { SOURCE_LABEL, STATUS_LABEL } from './sources';
import { Visual } from './visuals';

export interface DecisionScreenViewProps {
  screen: DecisionScreen;
  /** The numbers changed and the words are being rewritten to match. */
  copyStale?: boolean;
  /** The person's action was sent; show what happens next. */
  actionDone?: string | null;
  onAnswer?: (constraintId: string, answer: string) => void;
  onLever?: (leverId: string, value: number) => void;
  onAction?: () => void;
}

type Lever = DecisionSpec['levers'][number];
type Ask = Extract<DecisionSpec['constraints'][number], { kind: 'ask' }>;

type HardOutcome = 'pass' | 'caution' | 'excluded';
const HARD_TEXT: Record<'employee' | 'owner', Record<string, Partial<Record<HardOutcome, string>>>> = {
  employee: {
    min_wage: {
      pass: 'Checked automatically: your pay stays above the minimum wage.',
      excluded: 'Salary sacrifice would take your pay below the minimum wage, so it isn’t available to you.',
    },
  },
  owner: {
    min_wage: {
      pass: 'Checked automatically: no one’s pay drops below the minimum wage.',
      caution: 'Checked automatically: staff whose pay would drop below the minimum wage are left out.',
    },
  },
};

function leverValue(screen: DecisionScreen, l: Lever): number {
  if (l.id in screen.levers) return screen.levers[l.id]!;
  if (typeof l.default === 'number') return l.default;
  const fact = screen.spec.facts.find((f) => f.id === (l.default as string).slice(5));
  return typeof fact?.value === 'number' ? fact.value : l.min;
}

function leverSource(screen: DecisionScreen, l: Lever): string | null {
  if (l.id in screen.levers) return 'Your choice';
  const ref = l.default;
  if (typeof ref !== 'string') return null;
  const fact = screen.spec.facts.find((f) => f.id === ref.slice(5));
  return fact ? SOURCE_LABEL[fact.source] : null;
}

const formatLever = (l: Lever, v: number) => (l.unit === 'pct' ? `${v}%` : l.unit === 'GBP' ? `£${v.toLocaleString('en-GB')}` : v.toLocaleString('en-GB'));

/** 1. Question header: the title, and the person's own words. */
function QuestionHeader({ screen }: { screen: DecisionScreen }) {
  return (
    <header className="fk-qhead">
      <h1>{screen.copy.title}</h1>
      <p className="fk-asked">
        <span className="fk-sr-only">You asked: </span>“{screen.question}”
      </p>
    </header>
  );
}

/** 2. Constraint panel: automatic checks, then up to two questions that change the advice. */
function ConstraintPanel({ screen, onAnswer }: Pick<DecisionScreenViewProps, 'screen' | 'onAnswer'>) {
  const base = useId();
  const order = screen.layout.constraintOrder;
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  const byOrder = (a: { id: string }, b: { id: string }) => rank(a.id) - rank(b.id);
  const hard = screen.spec.constraints.filter((c) => c.kind === 'hard').sort(byOrder);
  const asks = (screen.spec.constraints.filter((c) => c.kind === 'ask') as Ask[]).sort(byOrder).slice(0, 2);
  if (!hard.length && !asks.length) return null;
  return (
    <section className="fk-constraints" aria-label="Things that could change the answer">
      {hard.map((c) => {
        const outcome = screen.calc.constraints.find((x) => x.id === c.id)?.outcome ?? 'pass';
        const text = HARD_TEXT[screen.spec.audience][c.id]?.[outcome as HardOutcome] ?? HARD_TEXT[screen.spec.audience][c.id]?.pass;
        return text ? (
          <p key={c.id} className={`fk-hard fk-hard-${outcome}`}>
            {text}
          </p>
        ) : null;
      })}
      {asks.map((c) => {
        const selected = screen.answers[c.id] ?? c.default ?? c.answers[0]?.id;
        const flagged = screen.layout.highlightConstraint === c.id || screen.calc.constraints.some((x) => x.id === c.id && x.outcome === 'caution');
        return (
          <div key={c.id} className={`fk-ask${flagged ? ' fk-flag' : ''}`} role="group" aria-labelledby={`${base}-ask-${c.id}`}>
            <p id={`${base}-ask-${c.id}`}>
              {c.question}
              {flagged && <span className="fk-badge fk-badge-warn">Changes the answer</span>}
            </p>
            <div className="fk-pills">
              {c.answers.map((a) => (
                <button key={a.id} type="button" aria-pressed={selected === a.id} onClick={() => onAnswer?.(c.id, a.id)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** 3. Verdict: the answer with its number, why, and the tipping point. Announced when it changes. */
function Verdict({ screen, copyStale }: Pick<DecisionScreenViewProps, 'screen' | 'copyStale'>) {
  return (
    <section className={`fk-verdict${copyStale ? ' fk-stale' : ''}`} aria-live="polite" aria-busy={copyStale || undefined}>
      <h2>{screen.copy.verdict}</h2>
      <p>{screen.copy.why}</p>
      {screen.copy.tippingPoint && <p className="fk-tip">Tipping point: {screen.copy.tippingPoint}</p>}
      {copyStale && <p className="fk-updating">Updating the wording for your new numbers…</p>}
    </section>
  );
}

/** 4. Levers: two or three inputs, each with its value and where it came from. */
function Levers({ screen, onLever }: Pick<DecisionScreenViewProps, 'screen' | 'onLever'>) {
  const base = useId();
  const order = screen.layout.leverOrder;
  const levers = [...screen.spec.levers].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  if (!levers.length) return null;
  return (
    <section className="fk-levers" aria-label="Try different numbers">
      {levers.map((l) => {
        const v = leverValue(screen, l);
        const id = `${base}-${l.id}`;
        const src = leverSource(screen, l);
        const fill = `${(((v - l.min) / (l.max - l.min || 1)) * 100).toFixed(1)}%`;
        return (
          <div className="fk-lever" key={l.id}>
            <div className="fk-lever-top">
              <label htmlFor={id}>{l.label}</label>
              <output htmlFor={id} className="fk-num">
                {formatLever(l, v)}
              </output>
            </div>
            {screen.sweep?.lever === l.id && <LeverChart sweep={screen.sweep} value={v} label={l.label} />}
            <input
              id={id}
              type="range"
              min={l.min}
              max={l.max}
              step={l.step}
              value={v}
              style={{ ['--fk-fill' as string]: fill }}
              aria-valuetext={formatLever(l, v)}
              onChange={(e) => onLever?.(l.id, Number(e.target.value))}
            />
            {src && <span className="fk-note">{src}</span>}
          </div>
        );
      })}
    </section>
  );
}

/** One tile. The figure counts up to the engine's display; screen readers get the final figure only. */
function Tile({ label, display, estimate, hero }: { label: string; display: string; estimate: boolean; hero: boolean }) {
  const shown = useCountUp(display);
  return (
    <div className={`fk-tile${hero ? ' fk-hero' : ''}`}>
      <span>{label}</span>
      <strong className="fk-num">
        {estimate && <span className="fk-note">about </span>}
        <span aria-hidden="true">{shown}</span>
        <span className="fk-sr-only">{display}</span>
      </strong>
    </div>
  );
}

/** 5. Outcome tiles: three numbers, the first being the one that answers the question. */
function OutcomeTiles({ screen }: { screen: DecisionScreen }) {
  return (
    <section className="fk-tiles" aria-label="Key numbers">
      {screen.layout.outcomeTiles.map((key, i) => {
        const n = screen.numbers.find((x) => x.key === key);
        return n ? <Tile key={key} label={n.label} display={n.display} estimate={n.estimate} hero={i === 0} /> : null;
      })}
    </section>
  );
}

/** 7. How this was worked out: every assumption and rule with its source, collapsed by default. */
function Method({ screen }: { screen: DecisionScreen }) {
  const rules = screen.calc.rulesUsed.filter((r, i, all) => all.findIndex((x) => x.source.url === r.source.url && x.status === r.status) === i);
  return (
    <details className="fk-method">
      <summary>How this was worked out</summary>
      <ul>
        {screen.copy.assumptions.map((a, i) => (
          <li key={`a${i}`}>
            {a.text}. <span className="fk-note">Source: {a.source}</span>
          </li>
        ))}
        {screen.calc.assumptions
          .filter((a) => a.estimate)
          .map((a, i) => (
            <li key={`e${i}`}>
              {a.text}. <span className="fk-note">Estimate</span>
            </li>
          ))}
      </ul>
      <h3>Rules used</h3>
      <ul>
        {rules.map((r) => (
          <li key={`${r.id}@${r.on}`}>
            <a href={r.source.url} rel="noreferrer" target="_blank">
              {r.source.title}
            </a>{' '}
            {r.status !== 'in_force' && <span className="fk-badge">{STATUS_LABEL[r.status]}</span>}
          </li>
        ))}
      </ul>
      <p className="fk-note">
        Tax rules {screen.provenance.rulePack.id}
        {screen.provenance.rulePack.status === 'draft' ? ' (draft, awaiting review)' : ''}.
      </p>
    </details>
  );
}

/** 8. One primary action, and what happens next. */
function Action({ screen, actionDone, onAction, copyStale }: Pick<DecisionScreenViewProps, 'screen' | 'actionDone' | 'onAction' | 'copyStale'>) {
  const label = screen.copy.actionLabel;
  return (
    <section className="fk-action">
      {label && (
        <button type="button" className="fk-btn fk-primary" onClick={onAction} disabled={!!actionDone || copyStale}>
          {label}
        </button>
      )}
      <p role="status" className="fk-done">
        {actionDone ?? ''}
      </p>
    </section>
  );
}

/** The full decision screen, always in the same order so people learn to read any decision. */
export function DecisionScreenView(props: DecisionScreenViewProps) {
  const { screen } = props;
  return (
    <article className="fk-screen">
      <QuestionHeader screen={screen} />
      <ConstraintPanel screen={screen} onAnswer={props.onAnswer} />
      <Verdict screen={screen} copyStale={props.copyStale} />
      <Levers screen={screen} onLever={props.onLever} />
      <OutcomeTiles screen={screen} />
      <Visual v={screen.visual} />
      <Method screen={screen} />
      <Action screen={screen} actionDone={props.actionDone} onAction={props.onAction} copyStale={props.copyStale} />
      <p className="fk-guidance">Fork gives guidance, not regulated financial advice. It uses your own numbers to show what happens either way. For your own situation, talk to an adviser, mortgage broker or accountant.</p>
    </article>
  );
}
