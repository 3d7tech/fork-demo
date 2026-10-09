'use client';

import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';

const KEY = 'fork-theme';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };

/** Runs before the page paints, so a chosen theme never flashes the other one. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

function apply(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // Storage can be blocked; the choice then lasts for this page only.
  }
}

/** Auto follows the phone's setting; a tap moves to light, then dark, then back to auto. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') setTheme(t);
  }, []);

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Colours: ${LABEL[theme]}. Change to ${LABEL[NEXT[theme]]}`}
      onClick={() => {
        const next = NEXT[theme];
        apply(next);
        setTheme(next);
      }}
    >
      <span className={`theme-icon theme-${theme}`} aria-hidden="true" />
      <span className="theme-label">{LABEL[theme]}</span>
    </button>
  );
}
