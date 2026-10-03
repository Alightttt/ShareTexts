import React from 'react';
import { cn } from '../lib/utils';

/**
 * SpinLoader — THE loading spinner of the app (one spinner everywhere).
 *
 * A single arc segment riding a faint track ring, rotating on the compositor
 * (transform-only). It draws in `currentColor`, so any surface tints it —
 * ember by default — and `size` scales the box while the stroke stays
 * optically constant via viewBox-relative width.
 *
 * Replaces the lucide Loader2 spin glyph: a Loader2 glyph reads as an icon,
 * a masked arc reads as a MACHINE working. Used for button in-flight states,
 * inline "working" rows, and lazy fallbacks. Skeletons (structure preview)
 * remain the language for screen-shaped loads — a spinner is for point loads.
 * `prefers-reduced-motion` swaps rotation for a static half-arc (still an
 * honest "working" mark, no motion).
 */
export function SpinLoader({
  size = 18,
  className,
  label,
}: {
  size?: number;
  className?: string;
  /** Accessible name for standalone use; buttons announce their own label. */
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className="st-spin"
        style={{ display: 'block' }}
      >
        {/* Track: the full ring at a whisper, so the spinning arc has a
            channel to ride in instead of orbiting empty space. */}
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.6" opacity="0.16" />
        {/* The arc: 270° of sweep with rounded caps — reads as momentum. */}
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="42.4 14.1"
        />
      </svg>
    </span>
  );
}
