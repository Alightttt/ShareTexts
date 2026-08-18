import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/utils';

/**
 * Manual light/dark switch — a quiet circular icon button for the top-right
 * of every screen. Shows the sun when in dark mode (tap to go light) and the
 * moon in light mode (tap to go dark), with a small rotate/fade swap.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  const handleToggle = () => {
    // Add transition class for smooth theme switch
    document.documentElement.classList.add('theme-transitioning');
    
    // Create flash overlay
    const flash = document.createElement('div');
    flash.className = 'theme-flash';
    flash.style.backgroundColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    document.body.appendChild(flash);
    
    // Toggle theme
    toggle();
    
    // Clean up transition class after animation completes
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
      flash.remove();
    }, 350);
  };

  return (
    <button
      type="button"
      onPointerDown={handleToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'relative flex items-center justify-center w-10 h-10 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/60 dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-white/10 transition-colors active:scale-95 shrink-0',
        className
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="flex"
        >
          {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
