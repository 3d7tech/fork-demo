'use client';

// One visual per kind of decision (ADR 0012), so each screen has a picture of its own.
// Every figure and every proportion is an engine output; shapes only size what they're given.
// Each has the same figures as text (a legend or hidden list), and its motion stops with reduced motion.
import type { VisualData } from '@fork/spec';
import { useId } from 'react';
import { useCountUp } from './motion';

type Of<T extends VisualData['type']> = Extract<VisualData, { type: T }>;
type Part = { value: number; display: string; label: string; tone: string };

const clamp = (k: number) => Math.max(0, Math.min(1, k));

function Rolling({ display, ms = 900 }: { display: string; ms?: number }) {
  const shown = useCountUp(display, ms);
  return (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="fk-sr-only">{display}</span>
    </>
  );
}

function Legend({ parts, className = '' }: { parts: Part[]; className?: string }) {
  return (
    <ul className={`fk-legend ${className}`}>
      {parts.map((p, i) => (
        <li key={p.label} style={{ ['--i' as string]: i }}>
          <i className={`fk-tone-${p.tone}`} aria-hidden="true" />
          <span>{p.label}</span>
          <strong className="fk-num">{p.display}</strong>
        </li>
      ))}
    </ul>
  );
}

/** A jar that fills layer by layer, bottom first. */
export function JarVisual({ v }: { v: Of<'jar'> }) {
  const id = useId().replace(/:/g, '');
  const total = v.layers.reduce((n, l) => n + Math.max(0, l.value), 0) || 1;
  // Inside of the jar, in viewBox units.
  const top = 34;
  const bottom = 190;
  let y = bottom;
  const rects = v.layers.map((l, i) => {
    const h = (Math.max(0, l.value) / total) * (bottom - top);
    y -= h;
    return { ...l, y, h, i };
  });
  return (
    <figure className="fk-vis fk-jar">
      <h3>{v.title}</h3>
      <div className="fk-jar-body">
        <svg viewBox="0 0 140 200" aria-hidden="true">
          <defs>
            <clipPath id={`jar-${id}`}>
              <path d="M30 24 h80 v10 q14 6 14 22 v118 q0 18 -18 18 h-72 q-18 0 -18 -18 v-118 q0 -16 14 -22z" />
            </clipPath>
          </defs>
          <g clipPath={`url(#jar-${id})`}>
            <rect x="0" y="0" width="140" height="200" className="fk-jar-glass" />
            {rects.map((r) => (
              <rect key={r.label} x="0" y={r.y} width="140" height={r.h + 0.5} className={`fk-fill-${r.tone} fk-jar-layer`} style={{ ['--i' as string]: r.i }} />
            ))}
            <path className="fk-jar-wave" d={`M0 ${rects.at(-1)?.y ?? top} q17.5 -5 35 0 t35 0 t35 0 t35 0 t35 0 v6 h-175z`} />
          </g>
          <path className="fk-jar-outline" d="M30 24 h80 v10 q14 6 14 22 v118 q0 18 -18 18 h-72 q-18 0 -18 -18 v-118 q0 -16 14 -22z" />
          <rect className="fk-jar-lid" x="26" y="14" width="88" height="12" rx="4" />
          <path className="fk-jar-shine" d="M26 70 v80" />
        </svg>
        <div>
          <p className="fk-jar-total">
            <span>{v.total.label}</span>
            <strong className="fk-num">
              <Rolling display={v.total.display} />
            </strong>
          </p>
          <Legend parts={[...v.layers].reverse()} />
        </div>
      </div>
    </figure>
  );
}

/** A dial from nothing to all of it, with one or two needles. */
export function MeterVisual({ v }: { v: Of<'meter'> }) {
  const R = 80;
  const at = (x: number) => clamp(x / (v.of.value || 1));
  const arc = `M${100 - R} 100 A${R} ${R} 0 0 1 ${100 + R} 100`;
  const main = v.needles.at(-1)!;
  return (
    <figure className="fk-vis fk-meter">
      <h3>{v.title}</h3>
      <svg viewBox="0 0 200 118" aria-hidden="true">
        <path d={arc} className="fk-meter-track" pathLength={1} />
        {v.needles.map((n, i) => (
          <path key={n.label} d={arc} pathLength={1} className={`fk-meter-fill fk-stroke-${n.tone}${i < v.needles.length - 1 ? ' fk-meter-ghost' : ''}`} style={{ ['--k' as string]: at(n.value) }} />
        ))}
        {v.needles.map((n) => (
          <g key={`n${n.label}`} className={`fk-meter-needle fk-stroke-${n.tone}`} style={{ ['--deg' as string]: `${at(n.value) * 180 - 90}deg` }}>
            <line x1="100" y1="100" x2="100" y2={100 - R + 14} />
          </g>
        ))}
        <circle cx="100" cy="100" r="6" className="fk-meter-hub" />
        <text x={100 - R} y="116" textAnchor="middle">
          £0
        </text>
        <text x={100 + R} y="116" textAnchor="middle">
          {v.of.display}
        </text>
      </svg>
      <p className="fk-meter-read">
        <strong className="fk-num">
          <Rolling display={main.display} />
        </strong>{' '}
        paid back{v.needles.length > 1 ? ' with your choice' : ''}, of your {v.of.display} {v.of.label}
      </p>
      <Legend parts={v.needles} />
    </figure>
  );
}

/** Two upright stacks, built from the ground up, with the difference between them. */
export function TowersVisual({ v }: { v: Of<'towers'> }) {
  const max = Math.max(...v.towers.map((t) => t.total.value)) || 1;
  return (
    <figure className="fk-vis fk-towers">
      <h3>{v.title}</h3>
      <div className="fk-towers-row">
        {v.towers.map((t, ti) => (
          <div key={t.label} className="fk-tower" aria-label={`${t.label}: ${t.total.display}`} role="group">
            <strong className="fk-num fk-tower-total">
              <Rolling display={t.total.display} />
            </strong>
            <div className="fk-tower-shaft" style={{ height: `${(t.total.value / max) * 100}%` }} aria-hidden="true">
              {t.parts.map((p, i) => (
                <span key={p.label} className={`fk-tone-${p.tone}`} style={{ flexGrow: Math.max(0, p.value), ['--i' as string]: i + ti * 3 }} />
              ))}
            </div>
            <span className="fk-tower-label">{t.label}</span>
          </div>
        ))}
        <p className="fk-towers-diff">
          <strong className="fk-num">
            <Rolling display={v.difference.display} />
          </strong>
          <span>{v.difference.label}</span>
        </p>
      </div>
      <div className="fk-towers-keys">
        {v.towers.map((t) => (
          <section key={t.label}>
            <h4>{t.label}</h4>
            <Legend parts={t.parts} />
          </section>
        ))}
      </div>
    </figure>
  );
}

/** A swing tag: the shop price struck through, the real price, the saving. */
export function TagVisual({ v }: { v: Of<'tag'> }) {
  return (
    <figure className="fk-vis fk-tagvis">
      <h3>{v.title}</h3>
      <div className="fk-tag-wrap">
        <div className="fk-tag">
          <span className="fk-tag-hole" aria-hidden="true" />
          <p className="fk-tag-was">
            <span>{v.was.label}</span>
            <s className="fk-num">{v.was.display}</s>
          </p>
          <p className="fk-tag-now">
            <span>{v.now.label}</span>
            <strong className="fk-num">
              <Rolling display={v.now.display} ms={1100} />
            </strong>
          </p>
          {v.extra && (
            <p className="fk-tag-extra">
              {v.extra.label}: <span className="fk-num">{v.extra.display}</span>
            </p>
          )}
        </div>
        <p className="fk-tag-ribbon">
          {v.saving.label} <strong className="fk-num">{v.saving.display}</strong>
        </p>
      </div>
    </figure>
  );
}

/** A till receipt that prints line by line, then the total, then a stamp. */
export function ReceiptVisual({ v }: { v: Of<'receipt'> }) {
  return (
    <figure className="fk-vis fk-receiptvis">
      <h3>{v.title}</h3>
      <div className="fk-receipt">
        <ul>
          {v.lines.map((l, i) => (
            <li key={l.label} style={{ ['--i' as string]: i }}>
              <span>{l.label}</span>
              <span className="fk-receipt-dots" aria-hidden="true" />
              <span className="fk-num">{l.display}</span>
            </li>
          ))}
        </ul>
        <p className="fk-receipt-total" style={{ ['--i' as string]: v.lines.length }}>
          <span>{v.total.label}</span>
          <strong className="fk-num">
            <Rolling display={v.total.display} ms={1200} />
          </strong>
        </p>
        {v.stamp && (
          <p className="fk-receipt-stamp" style={{ ['--n' as string]: v.lines.length }}>
            <strong className="fk-num">{v.stamp.display}</strong> {v.stamp.label}
          </p>
        )}
      </div>
    </figure>
  );
}

/** Coins sized by value: what the company pays and what arrives, for each route. */
export function CoinsVisual({ v }: { v: Of<'coins'> }) {
  const max = Math.max(...v.routes.flatMap((r) => [r.pays.value, r.gets.value])) || 1;
  // Area tracks value, so the diameter goes with the square root.
  const size = (x: number) => `${Math.round(Math.sqrt(clamp(x / max)) * 96)}px`;
  return (
    <figure className="fk-vis fk-coins">
      <h3>{v.title}</h3>
      {v.routes.map((r, ri) => (
        <div key={r.label} className="fk-coin-route" style={{ ['--i' as string]: ri }}>
          <h4>{r.label}</h4>
          <div className="fk-coin-row">
            {[r.pays, r.gets].map((c, ci) => (
              <div key={c.label} className="fk-coin-cell">
                <span className={`fk-coin fk-coin-${c.tone}`} style={{ width: size(c.value), height: size(c.value), ['--j' as string]: ci }} aria-hidden="true" />
                <strong className="fk-num">{c.display}</strong>
                <span className="fk-note">{c.label}</span>
              </div>
            ))}
            <span className="fk-coin-arrow" aria-hidden="true" />
          </div>
        </div>
      ))}
    </figure>
  );
}

/** A river: one total splitting into streams, each as wide as its share. */
export function RiverVisual({ v }: { v: Of<'flow'> }) {
  const W = 320;
  const H = 150;
  return (
    <figure className="fk-vis fk-river">
      <h3>{v.title}</h3>
      {v.columns.map((c, ci) => {
        const parts = c.parts.filter((p) => p.value > 0);
        const total = parts.reduce((n, p) => n + p.value, 0) || 1;
        const span = H - 20;
        const gap = 12;
        const rightSpan = span - gap * (parts.length - 1);
        let ly = 10;
        let ry = 10;
        const streams = parts.map((p) => {
          const lh = (p.value / total) * span;
          const rh = (p.value / total) * rightSpan;
          const s = { ...p, l0: ly, l1: ly + lh, r0: ry, r1: ry + rh };
          ly += lh;
          ry += rh + gap;
          return s;
        });
        const x0 = 18;
        const x1 = 150;
        const mid = (x0 + x1) / 2;
        return (
          <section key={c.label} className="fk-river-col" style={{ ['--i' as string]: ci }}>
            <h4>
              {c.label} <span className="fk-num">{c.total.display}</span>
            </h4>
            <div className="fk-river-body">
              <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="xMinYMid meet">
                <rect x="4" y="10" width="14" height={span} rx="4" className="fk-fill-d" />
                {streams.map((s, i) => (
                  <g key={s.label}>
                    <path
                      className={`fk-river-stream fk-fill-${s.tone}`}
                      style={{ ['--i' as string]: i }}
                      d={`M${x0} ${s.l0} C${mid} ${s.l0} ${mid} ${s.r0} ${x1} ${s.r0} L${x1} ${s.r1} C${mid} ${s.r1} ${mid} ${s.l1} ${x0} ${s.l1} Z`}
                    />
                    <path className="fk-river-flow" d={`M${x0} ${(s.l0 + s.l1) / 2} C${mid} ${(s.l0 + s.l1) / 2} ${mid} ${(s.r0 + s.r1) / 2} ${x1} ${(s.r0 + s.r1) / 2}`} />
                    <text x={x1 + 8} y={(s.r0 + s.r1) / 2 - 2} className="fk-river-label">
                      {s.label}
                    </text>
                    <text x={x1 + 8} y={(s.r0 + s.r1) / 2 + 14} className="fk-river-value">
                      {s.display}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
            <ul className="fk-sr-only">
              {c.parts.map((p) => (
                <li key={p.label}>
                  {p.label}: {p.display}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </figure>
  );
}
