import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * 3D iOS-style toggle with depth, shadows, and sun/moon icons.
 *
 * Structure:
 *   Track — has inner shadow (inset) for a "recessed" feel, plus outer shadow for lift
 *   Knob — raised white circle with top highlight + bottom shadow, slides with spring
 *   Icons — sun (☀) in light mode, moon (☽) in dark mode, cross-fade with rotation
 *
 * The 3D effect comes from:
 *   - Track: inset shadow top-left = light source from above-left
 *   - Knob: bright highlight on top edge, dark shadow on bottom = raised surface
 *   - Knob shadow grows when "off" (pressed into track) and lifts when "on"
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
    size === 'sm' ? { w: 46, h: 28, knob: 22, travel: 18 } :
    size === 'lg' ? { w: 60, h: 36, knob: 30, travel: 24 } :
    { w: 52, h: 32, knob: 26, travel: 20 };

  const iconSize = size === 'sm' ? 11 : size === 'lg' ? 15 : 13;

  // Track gradient — lighter when off (gray), colored when on (lavender)
  const trackBg = checked
    ? 'linear-gradient(135deg, #a78bfa 0%, #8b7cf6 50%, #7c6ce0 100%)'
    : 'linear-gradient(135deg, #e8e8ec 0%, #d5d5da 50%, #c8c8cd 100%)';

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label="Toggle dark mode"
      onClick={onToggle}
      className={cn(
        'relative shrink-0 rounded-full cursor-pointer',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b7cf6]',
        'active:scale-95 transition-transform duration-100',
        className
      )}
      style={{
        width: dims.w,
        height: dims.h,
        padding: 3,
        background: trackBg,
        // 3D recessed track — inset shadow creates depth
        boxShadow: checked
          ? 'inset 0 2px 4px rgba(0,0,0,0.2), inset 0 -1px 2px rgba(255,255,255,0.15), 0 1px 3px rgba(139,124,246,0.3)'
          : 'inset 0 2px 4px rgba(0,0,0,0.15), inset 0 -1px 2px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      {/* Knob — raised 3D circle */}
      <motion.div
        className="relative rounded-full overflow-hidden"
        style={{
          width: dims.knob,
          height: dims.knob,
          // 3D raised knob — gradient + shadows
          background: 'linear-gradient(180deg, #ffffff 0%, #f8f8fa 60%, #efefef 100%)',
          boxShadow: checked
            ? '0 2px 6px rgba(0,0,0,0.2), 0 4px 12px rgba(139,124,246,0.25), inset 0 1px 0 rgba(255,255,255,0.9)'
            : '0 2px 4px rgba(0,0,0,0.15), 0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
        animate={{ x: checked ? dims.travel : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      >
        {/* Top highlight — catches light */}
        <div
          className="absolute inset-x-0 top-0 h-[40%] rounded-t-full pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0) 100%)',
          }}
        />

        {/* Sun icon (light mode — knob is on left) */}
        <AnimatePresence mode="wait">
          {!checked && (
            <motion.div
              key="sun"
              initial={{ opacity: 0, scale: 0.3, rotate: -120 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.3, rotate: 120 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#e8a020" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Moon icon (dark mode — knob is on right) */}
        <AnimatePresence mode="wait">
          {checked && (
            <motion.div
              key="moon"
              initial={{ opacity: 0, scale: 0.3, rotate: 120 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.3, rotate: -120 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#7c6ce0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </button>
  );
}
