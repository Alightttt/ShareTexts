import React from 'react';
import { cn } from '../../lib/utils';

/**
 * PhoneFrame — a smartphone chassis with a real, live screen.
 *
 * Derived from great-ui's `mobile-mockup` (chassis geometry: rounded body,
 * side buttons, home indicator), rebuilt for ShareTexts:
 *
 *   · children render INSIDE the glass — never a screenshot;
 *   · the island is an overlay on the screen, not a gap in the status bar,
 *     so a live app inside can lay out edge-to-edge behind it;
 *   · the status bar is drawn by PhoneStatusBar (below) with the platform's
 *     real metrics — time left, signal/Wi-Fi/battery right, island centred;
 *   · colours are our graphite tokens, no neutral-900/emerald leftovers.
 *
 * The aspect ratio is 9:19.5 (the modern iPhone ratio). The corner radii are
 * FIXED steps, not percentages: `border-radius: 15%` resolves to an ELLIPSE
 * on a 9:19.5 box, which is exactly the slightly-wrong silhouette that reads
 * as "cheap mockup". Two breakpoint steps cover the 140–200px range the
 * demo uses, with no vw, no clamp, no container queries.
 */
export function PhoneFrame({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** Accessible name for the screen region, e.g. "ShareTexts on a phone". */
  label?: string;
}) {
  return (
    <div className={cn('relative select-none', className)}>
      {/* Body. */}
      <div
        className={cn(
          'relative rounded-[26px] p-[4.5%] sm:rounded-[30px]',
          'bg-[linear-gradient(170deg,#4a4a52_0%,#2c2c32_45%,#1d1d21_100%)]',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_18px_36px_-16px_rgba(20,16,10,0.5)]',
          'dark:bg-[linear-gradient(170deg,#38383f_0%,#212126_45%,#16161a_100%)]',
          'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_20px_40px_-16px_rgba(0,0,0,0.8)]',
        )}
      >
        {/* Buttons: volume pair high-left, action + power on the right.
            Drawn as 2px slivers that protrude — the detail that makes a
            frame read as hardware instead of a rounded rectangle. */}
        <span aria-hidden className="absolute -left-[1.5px] top-[17%] h-[6%] w-[3px] rounded-l-[2px] bg-[#5a5a63] dark:bg-[#3d3d44]" />
        <span aria-hidden className="absolute -left-[1.5px] top-[25%] h-[9%] w-[3px] rounded-l-[2px] bg-[#5a5a63] dark:bg-[#3d3d44]" />
        <span aria-hidden className="absolute -left-[1.5px] top-[36%] h-[9%] w-[3px] rounded-l-[2px] bg-[#5a5a63] dark:bg-[#3d3d44]" />
        <span aria-hidden className="absolute -right-[1.5px] top-[28%] h-[12%] w-[3px] rounded-r-[2px] bg-[#5a5a63] dark:bg-[#3d3d44]" />

        {/* Glass. */}
        <div
          role="img"
          aria-label={label}
          className={cn(
            'relative aspect-[9/19.5] w-full overflow-hidden rounded-[20px] sm:rounded-[23px]',
            'bg-apple-canvas ring-1 ring-black/20 dark:bg-night-900 dark:ring-white/[0.08]',
          )}
        >
          {children}
          {/* Dynamic island — an overlay, so live content can sit under it. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[2.4%] h-[3.1%] w-[31%] -translate-x-1/2 rounded-full bg-black"
          />
          {/* Home indicator. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-[1.4%] left-1/2 h-[1.1%] w-[34%] -translate-x-1/2 rounded-full bg-black/25 dark:bg-white/25"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * PhoneStatusBar — the platform status row, drawn at the frame's own scale.
 *
 * Kept separate from PhoneFrame so a screen can decide whether it wants the
 * status bar (an in-app full-screen view sometimes doesn't) and so the
 * glyphs stay at a size that reads at 140px wide. Signal, Wi-Fi and battery
 * are strokes and rects — no icon font, no emoji, nothing that reflows.
 */
export function PhoneStatusBar({ time = '9:41', className }: { time?: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-between px-[7%] pt-[3.4%] pb-[1.4%]',
        'text-apple-ink dark:text-white',
        className,
      )}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      <span className="text-[8px] font-semibold leading-none tracking-tight">{time}</span>
      <span className="flex items-center gap-[3px]">
        {/* Signal */}
        <svg viewBox="0 0 18 12" className="h-[5px] w-auto" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="4.6" y="6" width="3" height="6" rx="0.8" />
          <rect x="9.2" y="3.6" width="3" height="8.4" rx="0.8" />
          <rect x="13.8" y="1" width="3" height="11" rx="0.8" />
        </svg>
        {/* Wi-Fi */}
        <svg viewBox="0 0 16 12" className="h-[5px] w-auto" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1.2 4.2a10 10 0 0 1 13.6 0" />
          <path d="M3.8 7a6.4 6.4 0 0 1 8.4 0" />
          <circle cx="8" cy="10" r="0.9" fill="currentColor" stroke="none" />
        </svg>
        {/* Battery */}
        <svg viewBox="0 0 25 12" className="h-[6px] w-auto" fill="none" stroke="currentColor" strokeWidth="1.1">
          <rect x="0.6" y="0.6" width="20" height="10.8" rx="3" opacity="0.45" />
          <rect x="2.4" y="2.4" width="15" height="7.2" rx="1.8" fill="currentColor" stroke="none" />
          <path d="M23 4.2v3.6" strokeLinecap="round" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

export default PhoneFrame;
