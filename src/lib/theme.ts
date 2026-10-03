import { useEffect, useState, useCallback } from 'react';
import { runThemeTransition } from './themeTransition';

/**
 * Manual light/dark theme control.
 *
 * Defaults to the system preference; once the user picks a side it persists
 * (localStorage) and wins over the system until they change it again. The
 * resolved theme is applied as a `.dark` class on <html>, which the Tailwind
 * v4 `dark:` variant matches (see index.css `@custom-variant`).
 *
 * The initial class is applied by the inline script in index.html BEFORE the
 * React bundle runs, so there is no flash of the wrong theme on load.
 */

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'sharetext.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function getStoredTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* storage unavailable */ }
  return 'system';
}

export function storeTheme(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch { /* storage unavailable */ }
}

export function systemDark(): boolean {
  try {
    return darkQuery().matches;
  } catch {
    return false;
  }
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'light') return 'light';
  if (choice === 'dark') return 'dark';
  return systemDark() ? 'dark' : 'light';
}

export function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  const isDark = resolved === 'dark';
  // Already there? Then this is a no-op. That guard matters during a theme
  // cross-fade: the transition callback flips the class so the snapshot sees
  // the new theme, and the effect that follows (React state → applyTheme)
  // must not flip anything a second time.
  if (root.classList.contains('dark') === isDark) {
    const metaAlready = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (metaAlready) metaAlready.content = isDark ? '#131315' : '#f7f4ee';
    return;
  }
  // INSTANT, single-paint flip: kill every per-element color transition for
  // one frame, swap the class, then drop the kill-switch. Hundreds of
  // elements each tweening at once was the old "laggy" feel; a scheduled
  // two-frame veil flip read as input lag on low-end devices (contract:
  // theme responds within ~40ms). One synchronous repaint is both the
  // fastest and the smoothest path — no ghost states, no delayed class.
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}';
  document.head.appendChild(style);
  root.classList.toggle('dark', isDark);
  // Keep the browser chrome (address bar / status bar) in sync.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = isDark ? '#131315' : '#f7f4ee';
  requestAnimationFrame(() => style.remove());
}

/**
 * The live theme hook. `choice` starts from storage (system by default) and
 * `resolved` is what's actually shown. `setChoice('light' | 'dark')` from a
 * toggle; pass 'system' to go back to following the OS.
 */
export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>(getStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  useEffect(() => {
    applyTheme(choice);
    setResolved(resolveTheme(choice));

    if (choice !== 'system') return; // manual choice: no listener needed
    const mq = darkQuery();
    const onChange = () => {
      applyTheme('system');
      setResolved(resolveTheme('system'));
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    const before = resolveTheme(getStoredTheme());
    storeTheme(c);
    // Only the transitions that actually change what is on screen get the
    // cross-fade; picking "system" while the system already agrees is a
    // settings change, not a theme change.
    if (resolveTheme(c) === before) {
      setChoiceState(c);
      return;
    }
    runThemeTransition(() => setChoiceState(c));
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolveTheme(getStoredTheme()) === 'dark' ? 'light' : 'dark');
  }, [setChoice]);

  return { choice, resolved, setChoice, toggle };
}
