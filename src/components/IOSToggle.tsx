import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * iOS-style toggle with sun (☀) and moon (☽) icons inside the white knob.
 * - Off (light mode): gray track, sun icon
 * - On (dark mode): lavender track, moon icon
 * The knob slides with a spring and icons cross-fade.
 */
export function IOSToggle({
  checked,
  onToggle,
  size = 'md',
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dims =
    size === 'sm' ? { w: 44, h: 26, knob: 22, travel: 18 } :
    size === 'lg' ? { w: 56, h: 34, knob: 28, travel: 22 } :
    { w: 48, h: 30, knob: 24, travel: 18 };

  const iconSize = size === 'sm' ? 11 : size === 'lg' ? 15 : 13;

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label="Toggle dark mode"
      onClick={onToggle}
      className={cn(
        'relative shrink-0 rounded-full transition-colors duration-300 ease-out',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b7cf0]',
        className
      )}
      style={{
        width: dims.w,
        height: dims.h,
        backgroundColor: checked ? '#8b7cf0' : '#d8d8dd',
        padding: 2,
      }}
    >
      {/* Knob */}
      <motion.div
        className="rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden relative"
        style={{
          width: dims.knob,
          height: dims.knob,
        }}
        animate={{ x: checked ? dims.travel : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      >
        {/* Sun icon (light mode) */}
        <AnimatePresence mode="wait">
          {!checked && (
            <motion.div
              key="sun"
              initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Moon icon (dark mode) */}
        <AnimatePresence mode="wait">
          {checked && (
            <motion.div
              key="moon"
              initial={{ opacity: 0, scale: 0.5, rotate: 90 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: -90 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#6d5de0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </button>
  );
}
