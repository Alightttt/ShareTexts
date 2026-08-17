import { useEffect, useState, useCallback } from 'react';

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
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  // Keep the browser chrome (address bar / status bar) in sync.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = resolved === 'dark' ? '#060a13' : '#ffffff';
  }
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
    storeTheme(c);
    setChoiceState(c);
  }, []);

  const toggle = useCallback(() => {
    const next = resolveTheme(getStoredTheme()) === 'dark' ? 'light' : 'dark';
    setChoice(next);
  }, [setChoice]);

  return { choice, resolved, setChoice, toggle };
}
