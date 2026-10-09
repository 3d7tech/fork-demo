'use client';

import { useEffect, useRef, useState } from 'react';

/** True when the person has asked their device for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * Count up to a number that the engine already formatted ("£1,600", "28%", "34"). Only the
 * digits animate; the last frame is always exactly the engine's display, so nothing on screen
 * is ever a number the engine didn't produce. Pence count too (£2,106.64); other shapes are shown as they are.
 */
export function useCountUp(display: string, ms = 700): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(display);
  const from = useRef<number | null>(null);
  useEffect(() => {
    const m = display.match(/^([−-]?)(£?)([\d,]+(?:\.\d+)?)(%?)$/);
    if (reduced || !m) {
      setShown(display);
      from.current = m ? Number(m[3]!.replace(/,/g, '')) : null;
      return;
    }
    const [, sign, pound, digits, pct] = m;
    const dp = digits!.split('.')[1]?.length ?? 0;
    const to = Number(digits!.replace(/,/g, ''));
    const start = from.current ?? 0;
    from.current = to;
    if (start === to) return setShown(display);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const v = start + (to - start) * eased;
      setShown(k < 1 ? `${sign}${pound}${v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${pct}` : display);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [display, ms, reduced]);
  return shown;
}
