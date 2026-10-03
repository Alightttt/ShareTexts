import React, { useCallback, useRef, useState } from 'react';
import { motion, animate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { cn } from '../lib/utils';
import { hapticTick } from '../lib/haptics';

// ---------------------------------------------------------------------------
// SlideToConfirm — the destructive action you drag, never tap.
// ---------------------------------------------------------------------------
// Adapted from OpenSourceUI's slide-to-confirm button: a knob rides a track and
// the action only fires if the finger carries it past the arming line. The
// reasoning is the same reason airplane switches are levers — a tap can happen
// by accident, a deliberate drag cannot.
//
// House rules baked in:
//   · the track text never lies: it says what will happen ("Slide to
//     disconnect"), then what is about to happen ("Release to disconnect")
//   · the knob answers physically — it follows the finger 1:1 (no lag
//     smoothing, so the drag feels like the real object), then springs back
//     from wherever it was released
//   · one haptic tick at the arming line, the only "you crossed it" signal
//   · keyboard + switch users get Enter / Space / ArrowRight — a control that
//     requires a pointer is a control some people cannot use. The keyboard
//     path skips the drag and fires the action, which is what the drag only
//     exists to slow down.
// ---------------------------------------------------------------------------

const KNOB = 40;
const PAD = 3;
/** Fraction of the track that counts as armed. High enough to be deliberate,
 *  low enough that a thumb doesn't have to reach the far wall. */
const ARM_AT = 0.78;

export interface SlideToConfirmProps {
  /** Track text while the knob rests (the action, in the imperative). */
  label: string;
  /** Track text once armed — the release promise. */
  armedLabel: string;
  onConfirm: () => void;
  /** Rendered inside the knob (a glyph, usually). */
  icon?: React.ReactNode;
  tone?: 'danger' | 'brand';
  className?: string;
  testId?: string;
}

const TONES = {
  danger: {
    track: 'bg-status-danger/[0.07] border-status-danger/20 dark:bg-status-danger/[0.12] dark:border-status-danger/25',
    fill: 'bg-status-danger/15',
    knob: 'bg-status-danger text-white shadow-[0_2px_0_0_rgba(0,0,0,0.18),0_6px_14px_-6px_rgba(214,60,60,0.6)]',
    text: 'text-status-danger',
    armedText: 'text-status-danger',
  },
  brand: {
    track: 'bg-ember/[0.06] border-ember/20 dark:bg-ember/[0.10] dark:border-ember/25',
    fill: 'bg-ember/15',
    knob: 'bg-ember text-white shadow-[0_2px_0_0_var(--st-btn-primary-edge),0_6px_14px_-6px_rgba(240,100,19,0.5)]',
    text: 'text-apple-ink-muted dark:text-white/60',
    armedText: 'text-[#b8450a] dark:text-[#ffc79b]',
  },
} as const;

export function SlideToConfirm({ label, armedLabel, onConfirm, icon, tone = 'danger', className, testId }: SlideToConfirmProps) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  const firedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState(false);
  const x = useMotionValue(0);
  const fillWidth = useTransform(x, (v) => v + KNOB + PAD);
  const t = TONES[tone];

  const maxX = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    return Math.max(0, w - KNOB - PAD * 2);
  };

  const settle = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const limit = maxX();
    if (armed && !firedRef.current) {
      firedRef.current = true;
      animate(x, limit, reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 });
      onConfirm();
      return;
    }
    setArmed(false);
    animate(x, 0, reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 36 });
  }, [armed, onConfirm, reduced, x]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingRef.current) return;
    firedRef.current = false;
    draggingRef.current = true;
    setDragging(true);
    startXRef.current = e.clientX - x.get();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const limit = maxX();
    if (limit <= 0) return;
    const next = Math.max(0, Math.min(limit, e.clientX - startXRef.current));
    x.set(next);
    const nowArmed = next >= limit * ARM_AT;
    if (nowArmed !== armed) {
      setArmed(nowArmed);
      // One tick, exactly at the moment it becomes true — the same restraint
      // the rest of the app keeps around vibration.
      if (nowArmed) hapticTick();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (!firedRef.current) { firedRef.current = true; onConfirm(); }
    }
  };

  return (
    <div
      ref={trackRef}
      data-testid={testId}
      className={cn(
        'relative h-[46px] w-full rounded-full border overflow-hidden select-none',
        t.track,
        className
      )}
    >
      {/* Armed fill — grows exactly with the knob, so the track itself shows
          how much of the gesture is done. */}
      <motion.span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 rounded-full', t.fill)}
        style={{ width: fillWidth }}
      />
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 flex items-center justify-center text-[13px] font-semibold pl-10 pr-3 transition-colors',
          armed ? t.armedText : t.text
        )}
      >
        {armed ? armedLabel : label}
      </span>
      <motion.button
        type="button"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onLostPointerCapture={settle}
        onKeyDown={onKeyDown}
        animate={{ scale: dragging ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        style={{ x, width: KNOB, height: KNOB, top: PAD, left: PAD }}
        className={cn(
          'absolute flex items-center justify-center rounded-full cursor-grab active:cursor-grabbing',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500',
          t.knob
        )}
      >
        {icon}
      </motion.button>
    </div>
  );
}
