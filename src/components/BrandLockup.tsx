import React from 'react';
import { ShareTextsLogo } from './ShareTextsLogo';
import { cn } from '../lib/utils';

/**
 * BrandLockup — the one way the brand appears anywhere in the app:
 * mark + wordmark, tightly paired.
 *
 * Geometry contract (measured, not eyeballed — 2026-10-03):
 *  - The mark's drawn content spans y=36..220 of its 256 viewBox, i.e.
 *    72% of the box: at size 30 its painted height is 21.6px with 4.2px
 *    of transparent margin top and bottom.
 *  - "ShareTexts" in Geist 700 at 27px paints 21px tall (canvas
 *    actualBoundingBox), so the word and the mark are the same height
 *    within 0.6px — one object, not "icon next to caption". 23px (mobile)
 *    lands at 18px of ink, so the mark is stepped down to 25 there.
 *  - gap-0 + -ml-px: the mark's own 4.2px of internal padding IS the
 *    optical gap (~3px of air once the 1px overlap is applied). Anything
 *    that adds gap on top of that reads as a disconnect between the two
 *    halves of the brand.
 *  - The wordmark is `leading-none` and baseline-aligned against the mark's
 *    optical center (the diagonal composition leans low-left, so no manual
 *    translate is needed — the old 1px nudge fought the new, larger size).
 *
 * Used by: landing header, Docs, Legal, About, 404, error recovery — one
 * brand voice everywhere (the ad-hoc lockups this replaced drifted apart).
 */
export function BrandLockup({
  href = '/',
  className,
  markClassName,
  markSize = 30,
  mono = false,
  /** Sub-page header size: matches the h-14 Docs/Legal header band. */
  compact = false,
}: {
  href?: string;
  className?: string;
  markClassName?: string;
  markSize?: number;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <a
      href={href}
      aria-label="ShareTexts — home"
      className={cn('group flex items-center gap-0 shrink-0 min-h-[40px] -my-2 w-fit', className)}
    >
      {/* The box steps with the type so the two INK heights stay equal at
          every breakpoint: 25px box (18px of ink) against the 23px mobile
          wordmark (17.9px of ink), 30px box (21.6px) against 27px (21px).
          One mark in the DOM — CSS sizes it, not a second copy. */}
      <span className={cn(
        'transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none flex shrink-0',
        compact ? 'w-[18px] h-[18px]' : 'w-[25px] h-[25px] sm:w-[30px] sm:h-[30px]',
      )}>
        {/* 1px overlap: the mark's transparent margin is the real gap, so a
            negative margin tightens the pairing without touching the ink. */}
        <ShareTextsLogo size={compact ? 18 : markSize} mono={mono} className={cn('w-full h-full -mr-px', markClassName)} />
      </span>
      <span
        className={cn(
          'font-display font-bold tracking-[-0.035em] leading-none text-apple-ink dark:text-white select-none',
          compact ? 'text-[16px]' : 'text-[23px] sm:text-[27px]',
        )}
      >
        ShareTexts
      </span>
    </a>
  );
}
