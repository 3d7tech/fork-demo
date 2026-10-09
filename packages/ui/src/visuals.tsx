'use client';

import type { PayslipVisual as Payslip, VisualData } from '@fork/spec';
import { useId } from 'react';
import { useCountUp } from './motion';

type Bars = Extract<VisualData, { type: 'bars' }>;
type Ladder = Extract<VisualData, { type: 'ladder' }>;
type Checklist = Extract<VisualData, { type: 'checklist' }>;
type Flow = Extract<VisualData, { type: 'flow' }>;

const pct = (v: number) => `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;

/** Side-by-side or before-and-after bars. Totals are written out, so nothing relies on colour. */
function BarsVisual({ v }: { v: Bars }) {
  const titleId = useId();
  const floor = v.floor?.value ?? 0;
  const max = Math.max(...v.rows.map((r) => r.total.value));
  const span = max - floor || 1;
  return (
    <figure className="fk-vis" aria-labelledby={titleId}>
      <h3 id={titleId}>{v.title}</h3>
      <div role="list">
        {v.rows.map((r) => (
          <div className="fk-bar-row" role="listitem" key={r.label} aria-label={`${r.label}: ${r.total.display}`}>
            <span className="fk-bar-label">{r.label}</span>
            <span className="fk-stack" aria-hidden="true">
              {r.segments.map((s, i) => (
                <span key={i} className={`fk-tone-${s.tone}`} style={{ width: pct(((i === 0 ? s.value - floor : s.value) / span) * 100) }} title={s.label} />
              ))}
            </span>
            <span className="fk-bar-total fk-num">{r.total.display}</span>
          </div>
        ))}
      </div>
      {v.keys.length > 1 && (
        <ul className="fk-keys" aria-label="Key">
          {v.keys.map((k) => (
            <li key={k.label}>
              <i className={`fk-tone-${k.tone}`} aria-hidden="true" />
              {k.label}
            </li>
          ))}
        </ul>
      )}
      {v.floor && <figcaption className="fk-note">Bars start at {v.floor.display} so the difference is visible.</figcaption>}
    </figure>
  );
}

function LadderVisual({ v }: { v: Ladder }) {
  const titleId = useId();
  const at = (x: number) => pct(((x - v.min) / (v.max - v.min)) * 100);
  return (
    <figure className="fk-vis" aria-labelledby={titleId}>
      <h3 id={titleId}>{v.title}</h3>
      <div className="fk-ladder" aria-hidden="true">
        <div className="fk-ladder-track">
          <div className="fk-ladder-band" style={{ left: at(v.band.from), width: pct(((v.band.to - v.band.from) / (v.max - v.min)) * 100) }} />
        </div>
        {v.markers.map((m) => (
          <div key={m.label} className={`fk-ladder-mark fk-tone-text-${m.tone}`} style={{ left: at(m.value) }}>
            {m.label} {m.display}
          </div>
        ))}
      </div>
      <div className="fk-ladder-ticks fk-note" aria-hidden="true">
        {v.ticks.map((t) => (
          <span key={t.value}>{t.display}</span>
        ))}
      </div>
      <ul className="fk-sr-only">
        {v.markers.map((m) => (
          <li key={m.label}>
            {m.label}: {m.display}
          </li>
        ))}
      </ul>
      <figcaption className="fk-note">Shaded: {v.band.label}</figcaption>
    </figure>
  );
}

const CHECK_TEXT = { changes: 'Changes', same: 'Stays the same', check: 'Check this' } as const;

function ChecklistVisual({ v }: { v: Checklist }) {
  return (
    <figure className="fk-vis">
      <h3>{v.title}</h3>
      <ul className="fk-checklist">
        {v.items.map((it) => (
          <li key={it.label} className={`fk-check-${it.status}`}>
            <strong>{it.label}</strong> <span className="fk-badge">{CHECK_TEXT[it.status]}</span>
            <span className="fk-note">{it.detail}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function FlowVisual({ v }: { v: Flow }) {
  const max = Math.max(...v.columns.map((c) => c.total.value)) || 1;
  return (
    <figure className="fk-vis">
      <h3>{v.title}</h3>
      <div className="fk-flow">
        {v.columns.map((c) => (
          <section key={c.label} aria-label={`${c.label}: ${c.total.display}`}>
            <h4>
              {c.label} <span className="fk-num">{c.total.display}</span>
            </h4>
            <span className="fk-stack" aria-hidden="true">
              {c.parts.map((p) => (
                <span key={p.label} className={`fk-tone-${p.tone}`} style={{ width: pct((p.value / max) * 100) }} />
              ))}
            </span>
            <ul className="fk-flow-parts">
              {c.parts.map((p) => (
                <li key={p.label}>
                  <i className={`fk-tone-${p.tone}`} aria-hidden="true" />
                  {p.label} <span className="fk-num">{p.display}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </figure>
  );
}

/** An amount that rolls to the engine's figure; screen readers get the final figure only. */
function Rolling({ display }: { display: string }) {
  const shown = useCountUp(display, 900);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="fk-sr-only">{display}</span>
    </>
  );
}

/**
 * A month's payslip, today and after the change, in two columns so it fits a phone. Lines whose
 * amount differs are marked; the difference in take-home is the headline. Every figure is the engine's.
 */
function PayslipVisual({ v }: { v: Payslip }) {
  const titleId = useId();
  const a = v.slips[0]!;
  const b = v.slips[1]!;
  const has = (id: string) => a.lines.some((l) => l.id === id) || b.lines.some((l) => l.id === id);
  const sorted = ['gross', 'pension', 'tax', 'ni', 'student_loan', 'take_home'].filter(has);
  const gain = v.difference.value;
  const abs = v.difference.display.replace(/^[−-]/, '');
  return (
    <figure className="fk-vis fk-payslip" aria-labelledby={titleId}>
      <div className="fk-payslip-head">
        <h3 id={titleId}>{v.title}</h3>
        <p className={`fk-payslip-diff ${gain >= 0 ? 'fk-up' : 'fk-down'}`} aria-live="polite">
          <strong className="fk-num">
            <Rolling display={abs} />
          </strong>{' '}
          {v.difference.label}
        </p>
      </div>
      <div className="fk-paper">
        <table>
          <caption className="fk-sr-only">
            {v.title}: {a.label} and {b.label}
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="fk-sr-only">Line</span>
              </th>
              <th scope="col">{a.label}</th>
              <th scope="col" className="fk-col-new">
                {b.label}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((id, i) => {
              const la = a.lines.find((l) => l.id === id);
              const lb = b.lines.find((l) => l.id === id);
              const label = lb?.label ?? la?.label ?? id;
              const kind = lb?.kind ?? la?.kind;
              const changed = (la?.value ?? 0) !== (lb?.value ?? 0);
              const sign = kind === 'deduction' ? '−' : '';
              return (
                <tr key={id} className={`fk-slip-${kind}${changed ? ' fk-slip-changed' : ''}`} style={{ ['--i' as string]: i }}>
                  <th scope="row">
                    {label}
                    {changed && kind !== 'take_home' && <span className="fk-sr-only"> (changes)</span>}
                  </th>
                  <td className="fk-num">{la ? <>{sign}{la.display}</> : '—'}</td>
                  <td className="fk-num fk-col-new">
                    {lb ? (
                      <span className="fk-hl">
                        {sign}
                        <Rolling display={lb.display} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="fk-note">
        {v.note ? `${v.note} ` : ''}Highlighted lines change.
      </figcaption>
    </figure>
  );
}

export function Visual({ v }: { v: VisualData }) {
  switch (v.type) {
    case 'payslip':
      return <PayslipVisual v={v} />;
    case 'bars':
      return <BarsVisual v={v} />;
    case 'ladder':
      return <LadderVisual v={v} />;
    case 'checklist':
      return <ChecklistVisual v={v} />;
    case 'flow':
      return <FlowVisual v={v} />;
  }
}
