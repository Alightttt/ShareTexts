import React from 'react';
import { useTheme } from '../lib/theme';
import { IOSToggle } from './IOSToggle';

/**
 * iOS-style theme toggle. The wide switch handles all physics (spring,
 * drag, squish); this wrapper only owns the theme crossfade.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  const handleToggle = () => {
    // One crossfade for the whole tree — quiet, 300ms, no flash layer.
    document.documentElement.classList.add('theme-transitioning');
    toggle();
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, 350);
  };

  return <IOSToggle checked={isDark} onToggle={handleToggle} size="md" className={className} label="Toggle dark mode" />;
}
