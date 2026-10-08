import type { VisualData } from '@fork/spec';
import { useId } from 'react';

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

export function Visual({ v }: { v: VisualData }) {
  switch (v.type) {
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
