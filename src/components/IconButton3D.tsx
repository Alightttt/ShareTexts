import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// IconButton3D — the header's icon slots, as physical keys.
// ---------------------------------------------------------------------------
// Adapted from OpenSourceUI's 3d-icon-button: the icon sits on a keycap that
// carries a solid lip underneath and a light hairline on top, and pressing
// SINKS it into the lip rather than shrinking it. Same house tokens as
// TactileButton, so the two button families read as one material at two
// scales — the header stops looking like a row of flat glyphs floating above
// a page that otherwise has depth.
//
// Renders an <a> when given href, a <button> otherwise. 40px tall minimum —
// the same touch contract as everything else in the header.
// ---------------------------------------------------------------------------

export interface IconButton3DProps {
  /** Accessible name — always required (these are glyph-only controls). */
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  /** Ember-tinted lip: the control is currently the active one. */
  active?: boolean;
  className?: string;
  testId?: string;
}

export function IconButton3D({ label, children, onClick, href, active = false, className, testId }: IconButton3DProps) {
  const classes = cn(
    'group relative flex items-center justify-center w-11 h-10 rounded-full',
    'border border-black/[0.06] dark:border-white/[0.08]',
    'bg-white/70 dark:bg-white/[0.05] text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white',
    'shadow-[0_2px_0_0_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)]',
    'dark:shadow-[0_2px_0_0_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]',
    'hover:-translate-y-[1px] hover:shadow-[0_3px_0_0_rgba(0,0,0,0.07),inset_0_1px_0_rgba(255,255,255,0.95)]',
    'active:translate-y-[2px] active:shadow-[0_0_0_0_rgba(0,0,0,0),inset_0_2px_4px_rgba(0,0,0,0.10)]',
    'transition-[transform,box-shadow,color] duration-150 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0',
    active && 'text-ember dark:text-[#fb9243] shadow-[0_2px_0_0_rgba(240,100,19,0.35),inset_0_1px_0_rgba(255,255,255,0.9)]',
    className
  );
  if (href) {
    return (
      <a href={href} aria-label={label} title={label} data-testid={testId} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} data-testid={testId} className={classes}>
      {children}
    </button>
  );
}
