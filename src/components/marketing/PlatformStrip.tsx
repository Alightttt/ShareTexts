import React from 'react';
import { Smartphone, Display, Globe } from '@gravity-ui/icons';
import { cn } from '../../lib/utils';

/**
 * PlatformStrip — "it runs on what you already own", scrolling once.
 *
 * Why platforms and not other companies' logos: a marquee of brand marks we
 * have no relationship with would be a claim we cannot back, and readers who
 * know the game read it as filler. What is actually true, useful, and ours to
 * say is which devices and browsers ShareTexts runs on today — so the strip
 * names those, with the app's own glyph vocabulary (one phone, one screen,
 * one globe) instead of borrowed marks.
 *
 * Motion rules: one transform-only keyframe on a duplicated track (the
 * compositor does the work), paused on hover and on focus-within so a reader
 * can actually stop and read it, edges masked so items dissolve instead of
 * being clipped mid-glyph, and under prefers-reduced-motion the whole thing
 * holds still and wraps — the same information, no movement.
 */
const PLATFORMS: { name: string; kind: 'phone' | 'screen' | 'web' }[] = [
  { name: 'iPhone', kind: 'phone' },
  { name: 'Android', kind: 'phone' },
  { name: 'iPad', kind: 'phone' },
  { name: 'Windows', kind: 'screen' },
  { name: 'macOS', kind: 'screen' },
  { name: 'Linux', kind: 'screen' },
  { name: 'Chrome', kind: 'web' },
  { name: 'Safari', kind: 'web' },
  { name: 'Firefox', kind: 'web' },
  { name: 'Edge', kind: 'web' },
];

const Glyph = ({ kind, className }: { kind: 'phone' | 'screen' | 'web'; className?: string }) => {
  if (kind === 'phone') return <Smartphone className={className} aria-hidden />;
  if (kind === 'screen') return <Display className={className} aria-hidden />;
  return <Globe className={className} aria-hidden />;
};

export function PlatformStrip({ className }: { className?: string }) {
  const row = (copy: number) => (
    <ul
      className={cn(
        'flex shrink-0 items-center gap-3 pr-3 sm:gap-4 sm:pr-4',
        // Only the second copy is announced; the first is the visible one.
        copy === 2 && 'st-reduced-hidden',
      )}
      aria-hidden={copy === 2}
    >
      {PLATFORMS.map((p) => (
        <li
          key={`${copy}-${p.name}`}
          className="flex shrink-0 items-center gap-2 rounded-full border border-apple-divider/70 bg-white/60 px-3.5 py-2 dark:border-white/[0.08] dark:bg-white/[0.04]"
        >
          <Glyph kind={p.kind} className="h-3.5 w-3.5 text-apple-ink-muted dark:text-white/45" />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-apple-ink/80 dark:text-white/70">
            {p.name}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className={cn('w-full', className)} aria-labelledby="platforms-title">
      <div className="flex items-baseline gap-3 mb-3.5">
        <h2
          id="platforms-title"
          className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/75 dark:text-white/40"
        >
          Works everywhere
        </h2>
        <span className="h-px flex-1 bg-apple-divider/70 dark:bg-white/[0.07]" aria-hidden />
        <span className="text-[12px] font-medium text-apple-ink-muted/60 dark:text-white/30">
          nothing to install
        </span>
      </div>
      {/* The mask lives on the wrapper: items fade at both ends instead of
          being cut by the container edge. */}
      <div className="st-marquee-mask overflow-hidden">
        <div className="st-marquee flex w-max items-center">
          {row(1)}
          {row(2)}
        </div>
      </div>
    </section>
  );
}

export default PlatformStrip;
