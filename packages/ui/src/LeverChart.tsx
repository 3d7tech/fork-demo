'use client';

import type { LeverSweep } from '@fork/pipeline';

const W = 320;
const H = 132;
const PAD = { l: 4, r: 4, t: 14, b: 22 };

/**
 * The engine's result at every value of a lever, with the person's position marked. Drawn from
 * `screen.sweep`; each point is a calculation run. The numbers people read stay in the tiles and
 * the copy; this shows the shape: where it rises, flattens or changes.
 */
export function LeverChart({ sweep, value, label }: { sweep: LeverSweep; value: number; label: string }) {
  const { xs, series } = sweep;
  const x0 = xs[0]!;
  const x1 = xs[xs.length - 1]!;
  const values = series.flatMap((s) => s.values);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, lo + 1);
  const X = (x: number) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${X(xs[i]!).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const main = series[0]!;
  const area = `${path(main.values)} L${X(x1).toFixed(1)} ${Y(lo).toFixed(1)} L${X(x0).toFixed(1)} ${Y(lo).toFixed(1)} Z`;
  // Where the person sits: the nearest computed point (levers move in steps, so it is exact or adjacent).
  let i = 0;
  for (let k = 0; k < xs.length; k++) if (Math.abs(xs[k]! - value) < Math.abs(xs[i]! - value)) i = k;
  const cx = X(xs[i]!);
  const cy = Y(main.values[i]!);
  return (
    <figure className="fk-sweep" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`How ${main.label.toLowerCase()} changes as you move ${label.toLowerCase()}. Your choice is marked.`}>
        <line className="fk-axis" x1={PAD.l} x2={W - PAD.r} y1={Y(lo)} y2={Y(lo)} />
        <path className="fk-area" d={area} />
        {series.map((s, k) => (
          <path key={s.key} className={`fk-line fk-line-${k}`} d={path(s.values)} pathLength={k === 0 ? 1 : undefined} />
        ))}
        <line className="fk-guide" x1={cx} x2={cx} y1={cy} y2={Y(lo)} />
        <circle className="fk-marker-ring" cx={cx} cy={cy} r="9" />
        <circle className="fk-marker" cx={cx} cy={cy} r="6.5" />
        <text x={PAD.l} y={H - 4}>
          {sweep.xLabels[0]}
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end">
          {sweep.xLabels[1]}
        </text>
      </svg>
      {series.length > 1 && (
        <ul className="fk-sweep-key">
          {series.map((s) => (
            <li key={s.key}>
              <i aria-hidden="true" />
              {s.label}
              {s.estimate ? ' (estimate)' : ''}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
