import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * InlineConfirm — a two-press destructive action, in place.
 *
 * First press ARMS the button: a danger color fills it left-to-right over the
 * confirm window (~2.5s) and the label swaps to the confirm text. A second
 * press inside the window commits; releasing focus, pressing Escape, or let-
 * ting the fill run out disarms quietly. One decision surface instead of a
 * modal + backdrop, and the fill *is* the timer — the user sees exactly how
 * long they have.
 *
 * Reduced motion: MotionConfig zeroes the fill animation; the armed state is
 * still unmistakable (solid danger background + swapped label), and the
 * timeout still disarms — state is never removed, only the animation.
 */
export interface InlineConfirmProps {
  /** Shown while idle. */
  label: string;
  /** Shown while armed (the commit step). */
  confirmLabel: string;
  onConfirm: () => void;
  /** ms the armed state stays open before disarming itself. */
  timeoutMs?: number;
  className?: string;
  testId?: string;
  /** Sizing hooks for the two contexts that use it (header chip / pill). */
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function InlineConfirm({
  label,
  confirmLabel,
  onConfirm,
  timeoutMs = 2500,
  className,
  testId,
  size = 'md',
  disabled,
}: InlineConfirmProps) {
  const [armed, setArmed] = useState(false);
  const disarmTimer = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const disarm = useCallback((refocus = false) => {
    if (disarmTimer.current !== null) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
    setArmed(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!armed) return;
    disarmTimer.current = window.setTimeout(() => disarm(), timeoutMs);
    return () => {
      if (disarmTimer.current !== null) {
        clearTimeout(disarmTimer.current);
        disarmTimer.current = null;
      }
    };
  }, [armed, timeoutMs, disarm]);

  // Escape always disarms while armed (and swallows the key so a global
  // Escape handler doesn't also fire for something else).
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        disarm(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [armed, disarm]);

  const activate = () => {
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    disarm();
    onConfirm();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid={testId}
      data-armed={armed ? 'true' : undefined}
      disabled={disabled}
      onClick={activate}
      onBlur={() => { if (armed) disarm(); }}
      aria-live="polite"
      aria-label={armed ? confirmLabel : label}
      className={cn(
        'relative overflow-hidden select-none rounded-full font-semibold transition-colors',
        'flex items-center justify-center gap-1.5 active:scale-[0.96] transition-transform',
        size === 'sm'
          ? 'min-h-[40px] px-3 text-[12.5px]'
          : 'min-h-[44px] px-3.5 text-[13px]',
        armed
          ? 'text-white'
          : 'text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/40 dark:hover:bg-white/[0.06]',
        disabled && 'opacity-40 pointer-events-none',
        className,
      )}
    >
      {/* The fill IS the countdown: danger sweeps across while armed. */}
      {armed && (
        <motion.span
          aria-hidden="true"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: timeoutMs / 1000, ease: 'linear' }}
          className="absolute inset-0 origin-left bg-status-danger"
        />
      )}
      <span className={cn('relative z-10 flex items-center gap-1.5', armed && 'text-white')}>
        {armed ? confirmLabel : label}
      </span>
    </button>
  );
}
