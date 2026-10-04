import React, { useCallback, useRef, useState } from 'react';
import { cn } from '../lib/utils';
import { hapticTick } from '../lib/haptics';
import { ArrowRight, Check } from 'lucide-react';

// ---------------------------------------------------------------------------
// SlideToConfirm — OpenSourceUI's slide-to-confirm button, wearing the room's
// danger tone.
// ---------------------------------------------------------------------------
// Port of opensourceui.in/components/slide-to-confirm-button (the real
// `SlideToConfirmButton` source, retinted). What shipped verbatim:
//
//   · The drag model: pointer capture on the knob, 1:1 follow (no smoothing),
//     commit only past maxX − 4px, otherwise the knob springs home — the
//     original's exact handleDown/handleMove/handleUp logic.
//   · The knob material: keycap shadows ("tight, downward-only shadow so the
//     knob sits in the groove instead of floating in a soft halo"), the
//     transform-gpu + isolate track (the original's comment: "promote the
//     track to its own compositor layer so the knob's moving shadow can't
//     leave stale ghost pixels"), and will-change-transform on the knob.
//   · The transition switch: while dragging only background/shadow transition
//     (200ms); at rest the knob's transform gets the 300ms
//     cubic-bezier(0.32,0.72,0,1) spring home. Geometry follows the pointer
//     with zero transition — that is what makes it feel like the real object.
//   · Geometry: PAD 4 / KNOB 48 on a 14px-radius track — translated to the
//     app's 44px-tall rail row (KNOB 40), same ratios.
//   · The label fade: opacity 1 − progress × 1.4, so the promise text fades
//     as the knob covers it.
//
// What stays ShareTexts: the danger tone (armed fill = red wash, confirmed =
// red key), the i18n label pair ("Slide to disconnect" → "Release to
// disconnect"), haptic tick at the arming line, the 40px+ knob (touch
// contract), and the test contract (one [data-testid="end-session"] wrapper
// with exactly one knob <button> inside — verify-f18 drags it).
// ---------------------------------------------------------------------------

/** Knob diameter and track inset — the original's PAD 4, scaled to the rail. */
const PAD = 3;
const KNOB = 40;
/** Fraction of the travel that counts as armed. */
const ARM_RATIO = 0.82;

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
    track: 'bg-status-danger/[0.07] dark:bg-status-danger/[0.14] border border-status-danger/25',
    trackArmed: 'bg-status-danger',
    trackConfirmed: 'bg-status-danger',
    label: 'text-status-danger/80 dark:text-status-danger/90',
    labelArmed: 'text-white',
    knob: 'bg-white text-status-danger',
    knobIcon: 'text-status-danger',
  },
  brand: {
    track: 'bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08]',
    trackArmed: 'bg-ember',
    trackConfirmed: 'bg-status-success',
    label: 'text-apple-ink-muted dark:text-white/60',
    labelArmed: 'text-white',
    knob: 'bg-white text-apple-ink-muted',
    knobIcon: 'text-apple-ink-muted dark:text-white/70',
  },
};

export function SlideToConfirm({
  label,
  armedLabel,
  onConfirm,
  icon,
  tone = 'danger',
  className,
  testId,
}: SlideToConfirmProps) {
  const tones = TONES[tone];
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const armedRef = useRef(false);
  const [x, setX] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  const maxX = () => {
    const track = trackRef.current;
    if (!track) return 0;
    return track.offsetWidth - KNOB - PAD * 2;
  };

  // Original's handleDown: capture the pointer on the knob; the move handler
  // on the same element keeps receiving events past the track's bounds.
  const handleDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (confirmed) return;
    draggingRef.current = true;
    armedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current || confirmed) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const next = Math.min(
      Math.max(event.clientX - rect.left - PAD - KNOB / 2, 0),
      maxX(),
    );
    const wasArmed = armedRef.current;
    const nowArmed = next >= maxX() - 4;
    if (nowArmed && !wasArmed) hapticTick();
    armedRef.current = nowArmed;
    setX(next);
  };

  const handleUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (x >= maxX() - 4) {
      setX(maxX());
      setConfirmed(true);
      onConfirm?.();
    } else {
      setX(0);
      armedRef.current = false;
    }
  };

  const progress = maxX() > 0 ? x / maxX() : 0;
  const armed = progress >= ARM_RATIO;

  // Keyboard: the drag exists to slow a destructive action down; the keyboard
  // path takes the same deliberate route — first Enter arms, second fires.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (confirmed) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!armed) {
        armedRef.current = true;
        setX(maxX());
        hapticTick();
      } else {
        setConfirmed(true);
        onConfirm?.();
      }
    }
    if (event.key === 'Escape' && armed) {
      event.preventDefault();
      armedRef.current = false;
      setX(0);
    }
  };

  return (
    <div
      data-testid={testId}
      data-slot="slide-to-confirm"
      data-armed={armed || undefined}
      data-confirmed={confirmed || undefined}
      className={cn('w-full select-none', className)}
    >
      <div
        ref={trackRef}
        className={cn(
          // transform-gpu + isolate: the original's compositor-layer comments,
          // verbatim behavior — no stale ghost pixels from the knob's shadow.
          'relative isolate h-[52px] transform-gpu overflow-hidden rounded-full p-1 transition-[background-color,box-shadow,border-color] duration-300',
          'shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(0,0,0,0.05),inset_0_-2px_3px_rgba(0,0,0,0.06),0_1px_0_rgba(255,255,255,0.9)]',
          'dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(0,0,0,0.25),inset_0_-2px_3px_rgba(0,0,0,0.3),0_1px_0_rgba(255,255,255,0.06)]',
          confirmed
            ? cn(tones.trackConfirmed, 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.2),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.9)]')
            : armed
              ? cn(tones.trackArmed, 'shadow-[inset_0_1px_3px_rgba(0,0,0,0.2),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_0_rgba(255,255,255,0.9)]')
              : tones.track,
        )}
      >
        {/* The promise text — the original's opacity 1 − progress × 1.4 */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-0 flex items-center justify-center px-14 text-[13.5px] font-semibold transition-colors duration-200',
            confirmed
              ? 'text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.25)]'
              : armed
                ? cn(tones.labelArmed, '[text-shadow:0_1px_1px_rgba(0,0,0,0.25)]')
                : tones.label,
          )}
          style={{ opacity: confirmed ? 1 : Math.max(0, 1 - progress * 1.4) }}
        >
          {confirmed ? armedLabel : armed ? armedLabel : label}
        </span>

        {/* The knob — the original's keycap: follows 1:1, springs home */}
        <button
          type="button"
          aria-label={confirmed ? armedLabel : label}
          disabled={confirmed}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onKeyDown={handleKeyDown}
          className={cn(
            'absolute top-1 left-1 flex touch-none items-center justify-center rounded-full will-change-transform',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-danger',
            tones.knob,
            'shadow-[0_1px_1px_rgba(0,0,0,0.12),0_2px_3px_rgba(0,0,0,0.12),inset_0_1.5px_0_rgba(255,255,255,1),inset_0_-2px_3px_rgba(0,0,0,0.1)]',
            confirmed
              ? 'cursor-default'
              : 'cursor-grab active:cursor-grabbing active:shadow-[0_1px_1px_rgba(0,0,0,0.06),inset_0_1px_1px_rgba(0,0,0,0.06),inset_0_2px_3px_rgba(0,0,0,0.03),inset_0_-2px_3px_rgba(0,0,0,0.05)]',
            draggingRef.current
              ? 'transition-[box-shadow,background-color] duration-200 ease-out'
              : 'transition-[transform,box-shadow,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          )}
          style={{ width: KNOB, height: KNOB, transform: `translate3d(${x}px, 0, 0)` }}
        >
          {icon ?? (confirmed ? (
            <Check size={18} strokeWidth={2.5} aria-hidden className={cn('filter-[drop-shadow(0_1px_0_rgba(255,255,255,0.9))_drop-shadow(0_-1px_0.5px_rgba(0,0,0,0.12))]', tones.knobIcon)} />
          ) : (
            <ArrowRight size={18} strokeWidth={2.5} aria-hidden className={cn('filter-[drop-shadow(0_1px_0_rgba(255,255,255,0.9))_drop-shadow(0_-1px_0.5px_rgba(0,0,0,0.12))]', tones.knobIcon)} />
          ))}
        </button>
      </div>
    </div>
  );
}
