import React from 'react';
import { ShareTextsLogo } from './ShareTextsLogo';
import { cn } from '../lib/utils';

/**
 * BrandLockup — the one way the brand appears anywhere in the app:
 * mark + wordmark, tightly paired.
 *
 * Geometry contract (why it looks the way it does):
 *  - The mark's drawn content spans ~72% of its box, so its VISIBLE height
 *    at size 30 is ~22px. The wordmark is set at 27px Geist — its cap
 *    height lands at the same ~19-22px band, so the two read as one
 *    equal-height object instead of "icon next to caption".
 *  - gap-[3px]: the mark's own internal right padding (~4px at this size)
 *    supplies the rest of the optical gap — anything wider reads as a
 *    disconnect between the two halves of the brand.
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
      className={cn('group flex items-center gap-[3px] shrink-0 min-h-[40px] -my-2 w-fit', className)}
    >
      <span className="transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none flex">
        <ShareTextsLogo size={compact ? 21 : markSize} mono={mono} className={markClassName} />
      </span>
      <span
        className={cn(
          'font-display font-bold tracking-[-0.035em] leading-none text-apple-ink dark:text-white select-none',
          compact ? 'text-[15px]' : 'text-[23px] sm:text-[27px]',
        )}
      >
        ShareTexts
      </span>
    </a>
  );
}
