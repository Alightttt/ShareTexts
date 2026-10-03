import React from 'react';
import { ArrowLeft } from '@gravity-ui/icons';
import { BrandLockup } from './BrandLockup';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '../lib/utils';

/**
 * PageHeader — the ONE header every screen outside the room uses: the
 * back-to-home arrow, the brand lockup, then page-specific links and the
 * theme switch.
 *
 * Why one component: Docs, Legal and the 404 each grew their own header by
 * hand and drifted — different heights, different gaps, one of them showing
 * a link to the page you are already on. A screen that is not the room
 * should feel like the same product, not like a different website, and the
 * cheapest honest way to guarantee that is to have exactly one of them.
 *
 * Sizing matches the app header (h-14 band, 40px slots, 13px links) so
 * crossing from the landing into Docs does not change the scale of the room.
 *
 * `links` should never include a link to the current page — the caller
 * filters that out, because a link to where you already are is dead weight
 * dressed as navigation.
 */
export function PageHeader({
  links = [],
  /** Marks the current page in the nav (e.g. "Docs"), rendered as quiet text. */
  currentLabel,
  className,
  children,
}: {
  links?: { href: string; label: string }[];
  currentLabel?: string;
  className?: string;
  /** Extra controls rendered after the links, before the theme toggle. */
  children?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-xl border-b border-apple-divider dark:border-white/[0.06]',
        className,
      )}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-3">
        {/* Back arrow and lockup are siblings — BrandLockup is an anchor
            itself, and an anchor inside an anchor is invalid HTML. */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/"
            className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            aria-label="ShareTexts, back to home"
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
          <BrandLockup compact />
        </div>
        <div className="flex items-center gap-4 sm:gap-5 ml-auto">
          {children}
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 hover:text-apple-ink dark:hover:text-white transition-colors"
            >
              {l.label}
            </a>
          ))}
          {/* The current page reads as quiet text, not a link: it is where you
              already are. */}
          {currentLabel && (
            <span aria-current="page" className="text-[13px] font-medium text-apple-ink/70 dark:text-white/70">
              {currentLabel}
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
