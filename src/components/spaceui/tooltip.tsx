import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/**
 * Tooltip — the name of an icon-only control, revealed where the pointer
 * already is.
 *
 * Scope is deliberately narrow: this exists for glyph buttons whose function
 * a first-time sender cannot guess and whose keyboard shortcuts are
 * otherwise invisible. It is not a floating layer: no portal, no arrow, no
 * collision system — one position (above), one delay (~350ms, so a scan
 * across a row doesn't strobe), one rise. Where this takes over, the native
 * `title` comes off the button: two labels on one control reads as lag.
 *
 * Touch: hover doesn't exist there and glyph buttons act on tap, so the
 * bubble is hover/focus-only by construction — no long-press machinery for
 * controls that are already named by aria. Keyboard users get it too,
 * because focus lands on the button and focus events bubble here.
 */
type TooltipProps = {
  label: string;
  /** Shortcut hint, rendered as key chips in press order. */
  keys?: string[];
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
  /** Supplied by JSX at call sites; declared so the key passes prop checks. */
  key?: React.Key;
};

export function Tooltip({ label, keys, children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const id = React.useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 350);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, open ? { 'aria-describedby': id } : {})}
      {open && (
        <span
          role="tooltip"
          id={id}
          className="st-tooltip pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-40 whitespace-nowrap rounded-[8px] bg-apple-ink px-2.5 py-1.5 text-[12px] font-medium text-white shadow-lg dark:bg-[#2e2e33] dark:text-white/90"
        >
          {label}
          {keys && keys.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="rounded-[5px] bg-white/15 px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-white/80"
                >
                  {k}
                </kbd>
              ))}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
