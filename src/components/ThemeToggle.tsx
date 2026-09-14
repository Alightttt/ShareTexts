import React from 'react';
import { useTheme } from '../lib/theme';
import { IOSWideToggle } from './IOSWideToggle';

/**
 * The app's theme switch — the custom wide iOS toggle (IOSWideToggle).
 * This wrapper owns only the crossfade around the state change:
 *
 *  · View Transitions API (Chromium/Safari): one composited crossfade of
 *    the whole tree — the fastest, smoothest path. The class flip happens
 *    inside the transition callback, so old and new states are captured
 *    atomically. No flash, no jank.
 *  · Fallback (Firefox/reduced-motion): the .theme-transitioning CSS class
 *    for a short color crossfade.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  const handleToggle = () => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    };
    if (typeof doc.startViewTransition === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doc.startViewTransition(() => toggle());
      return;
    }
    document.documentElement.classList.add('theme-transitioning');
    toggle();
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 260);
  };

  return (
    <IOSWideToggle
      checked={isDark}
      onChange={handleToggle}
      className={className}
      label="Toggle dark mode"
    />
  );
}
