/**
 * SkeletonScreen — the loading state, tailored per screen.
 *
 * A skeleton is not decoration: it is the app holding the user's place.
 * Each variant mirrors the REAL screen's geometry (same paddings, same
 * column, same hierarchy) so the swap from skeleton to content moves
 * nothing — the layout is stable before and after load. Bars use the
 * canvas's own tones, one gentle shimmer sweep (CSS, transform-only, no
 * jank), and go still under prefers-reduced-motion (MotionConfig also
 * flattens the rest of the app there).
 *
 * Loading here is rare (routes and chunks prewarm on idle); the skeleton
 * exists for slow networks and cold caches — precisely when a blank or
 * flashing frame would cost the most trust.
 */
import React from 'react';
import { ShareTextsLogo } from './ShareTextsLogo';
import { cn } from '../lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

/** One quiet bar — the only primitive a skeleton needs. */
function Bar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'st-skeleton h-3.5 rounded-full bg-apple-ink/[0.07] dark:bg-white/[0.08]',
        className
      )}
    />
  );
}

/** The brand + shell shared by the centered variants: quiet, honest.
 *  `full` variants (room) skip the centered column and fill the surface —
 *  their skeleton must mirror the real screen's full-bleed geometry. */
function Shell({ children, label, full = false }: { children: React.ReactNode; label: string; full?: boolean }) {
  if (full) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label}
        className="h-full w-full flex flex-col select-none"
      >
        {children}
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className="h-full w-full flex flex-col items-center justify-center px-6 select-none"
    >
      <div className="w-full max-w-[340px] flex flex-col items-center">
        {/* The mark breathes once while the screen assembles — a beat of
            life, not a spinner. Reduced motion renders it still. */}
        <span className="st-skeleton-brand mb-7 flex" aria-hidden="true">
          <ShareTextsLogo size={26} />
        </span>
        {children}
      </div>
    </div>
  );
}

export type SkeletonVariant =
  | 'home'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'room';

export function SkeletonScreen({ variant = 'home' }: { variant?: SkeletonVariant }) {
  if (variant === 'home') {
    // Mirrors the idle hero: headline, two lines of subtitle, the pair of
    // action pills with their hint lines, and the discovery block.
    return (
      <Shell label="Loading ShareTexts">
        <div className="w-full flex flex-col items-center">
          <Bar className="h-8 w-[92%]" />
          <Bar className="mt-3 h-8 w-[70%]" />
          <Bar className="mt-5 h-3 w-[85%]" />
          <Bar className="mt-2 h-3 w-[60%]" />
          <div className="mt-8 grid w-full grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-2">
              <Bar className="h-12 w-full !rounded-full" />
              <Bar className="h-2.5 w-[70%]" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <Bar className="h-12 w-full !rounded-full" />
              <Bar className="h-2.5 w-[70%]" />
            </div>
          </div>
          <Bar className="mt-7 h-10 w-full !rounded-[14px]" />
        </div>
      </Shell>
    );
  }

  if (variant === 'pairing') {
    // Mirrors the pairing screen: back+title row, the two-device scene,
    // and the code tile block.
    return (
      <Shell label="Loading pairing">
        <div className="w-full flex flex-col items-center">
          <div className="mb-6 flex w-full items-center gap-2">
            <Bar className="h-5 w-5 !rounded-full" />
            <Bar className="h-4 w-[55%]" />
          </div>
          <div className="flex w-full items-center justify-center gap-5">
            <Bar className="h-14 w-14 !rounded-[16px]" />
            <Bar className="h-px w-10" />
            <Bar className="h-14 w-14 !rounded-[16px]" />
          </div>
          <Bar className="mt-4 h-3 w-[45%]" />
          <Bar className="mt-7 h-24 w-full !rounded-[20px]" />
        </div>
      </Shell>
    );
  }

  if (variant === 'connecting') {
    // Mirrors the connecting screen: the two-device handshake scene and
    // its status line, then the escape hatch row.
    return (
      <Shell label="Connecting">
        <div className="w-full flex flex-col items-center">
          <div className="flex w-full items-center justify-center gap-5">
            <Bar className="h-16 w-16 !rounded-[20px]" />
            <Bar className="h-2 w-14 !rounded-full" />
            <Bar className="h-16 w-16 !rounded-[20px]" />
          </div>
          <Bar className="mt-6 h-3.5 w-[50%]" />
          <Bar className="mt-2 h-3 w-[35%]" />
          <Bar className="mt-9 h-9 w-[38%] !rounded-full" />
        </div>
      </Shell>
    );
  }

  if (variant === 'connected') {
    // Mirrors the left-pane connected summary: device pair, ready copy,
    // the three-stat strip, and the invite card.
    return (
      <Shell label="Connected">
        <div className="w-full flex flex-col items-center">
          <div className="flex w-full items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <Bar className="h-14 w-14 !rounded-[16px]" />
              <Bar className="h-2.5 w-16" />
            </div>
            <Bar className="h-5 w-5 !rounded-full" />
            <div className="flex flex-col items-center gap-2">
              <Bar className="h-14 w-14 !rounded-[16px]" />
              <Bar className="h-2.5 w-16" />
            </div>
          </div>
          <Bar className="mt-7 h-4 w-[52%]" />
          <Bar className="mt-2 h-3 w-[78%]" />
          <div className="mt-6 flex w-full items-stretch gap-px">
            <Bar className="h-14 flex-1 !rounded-none first:!rounded-l-[14px] last:!rounded-r-[14px]" />
            <Bar className="h-14 flex-1 !rounded-none" />
            <Bar className="h-14 flex-1 !rounded-none last:!rounded-r-[14px]" />
          </div>
          <Bar className="mt-5 h-14 w-full !rounded-[14px]" />
        </div>
      </Shell>
    );
  }

  // variant === 'room' — mirrors the transfer room: device bar, the
  // message column, and the composer pill at the bottom. FULL-BLEED:
  // the real room fills its pane edge to edge, so the skeleton must
  // too (the centered Shell would render it as a 340px island).
  return (
    <Shell label="Opening your room" full>
      <div className="h-full w-full flex flex-col">
        {/* Device bar */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Bar className="h-8 w-8 !rounded-[10px]" />
          <div className="flex flex-col gap-1.5">
            <Bar className="h-3 w-24" />
            <Bar className="h-2 w-16" />
          </div>
        </div>
        {/* Message column — alternating sides like real cards, stable
            heights so nothing jumps when content replaces it. */}
        <div className="flex-1 flex flex-col justify-end gap-3 px-4 pb-4">
          <Bar className="mr-auto h-10 w-[64%] !rounded-[16px]" />
          <Bar className="ml-auto h-10 w-[52%] !rounded-[16px]" />
          <Bar className="mr-auto h-16 w-[72%] !rounded-[16px]" />
        </div>
        {/* Composer */}
        <div className="flex items-center gap-2 px-4 pb-5">
          <Bar className="h-11 w-11 shrink-0 !rounded-full" />
          <Bar className="h-11 flex-1 !rounded-[22px]" />
          <Bar className="h-11 w-11 shrink-0 !rounded-full" />
        </div>
      </div>
    </Shell>
  );
}

export { EASE };
