import { useEffect, useState, useCallback } from 'react';

/** Respect reduced motion: the veil cross-fade collapses to the instant
 *  flip (which was already the behavior) with no overlay at all. */
function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

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
  // BUTTERY FLIP, zero jank: before the class lands, paint a full-screen
  // veil in the DESTINATION background color (opacity 0 → 1 over ~140ms).
  // Then kill every per-element color transition for one frame and flip
  // the class — the veil hides the repaint in its own fade, so the swap
  // reads as one smooth cross-fade instead of hundreds of elements each
  // tweening at once (the old "laggy" feel) or a hard cut (the current
  // instant flip). Two rAFs later the veil fades out over the now-correct
  // page and removes itself.
  const isDark = resolved === 'dark';
  if (prefersReducedMotion()) {
    // Reduced motion: single-paint flip, no veil, no fades.
    root.classList.toggle('dark', isDark);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = isDark ? '#131315' : '#f7f4ee';
    return;
  }
  const veil = document.createElement('div');
  veil.setAttribute('aria-hidden', 'true');
  veil.style.cssText = `position:fixed;inset:0;z-index:2147483646;pointer-events:none;background:${isDark ? '#131315' : '#f7f4ee'};opacity:0;transition:opacity 140ms cubic-bezier(0.23,1,0.32,1)`;
  document.body.appendChild(veil);
  requestAnimationFrame(() => { veil.style.opacity = '1'; });
  const flip = () => {
    const style = document.createElement('style');
    style.id = 'st-theme-flip';
    style.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}';
    document.head.appendChild(style);
    root.classList.toggle('dark', isDark);
    // Keep the browser chrome (address bar / status bar) in sync.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) {
      meta.content = isDark ? '#131315' : '#f7f4ee';
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove();
        // The page is now fully repainted in the destination theme; the
        // veil fades out to reveal it (transform/opacity only).
        veil.style.opacity = '0';
        setTimeout(() => veil.remove(), 200);
      });
    });
  };
  // Let the veil's fade-in get one paint in before the flip.
  requestAnimationFrame(() => requestAnimationFrame(flip));
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
