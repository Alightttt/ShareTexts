import React from 'react';
import { useTheme } from '../lib/theme';
import { IOSToggle } from './IOSToggle';

/**
 * iOS-style theme toggle using a spring-animated switch.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  const handleToggle = () => {
    document.documentElement.classList.add('theme-transitioning');
    const flash = document.createElement('div');
    flash.className = 'theme-flash';
    flash.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    document.body.appendChild(flash);
    toggle();
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      flash.remove();
    }, 350);
  };

  return <IOSToggle checked={isDark} onToggle={handleToggle} size="sm" className={className} />;
}
