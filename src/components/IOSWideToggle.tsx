import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { animate as anim } from 'motion/react';
import { hapticTap } from '../lib/haptics';

/**
 * IOSWideToggle — a REAL iOS switch, not a styled checkbox.
 *
 * The whole interaction grammar of the UISwitch is here:
 *
 *   · TAP anywhere on the track → toggles with a spring.
 *   · DRAG the thumb → it follows the finger 1:1; release past the
 *     midpoint (or a small threshold) commits to that side, release
 *     early springs back. Exactly how the native switch behaves.
 *   · The thumb carries a SUN (light) / MOON (dark) glyph that
 *     crossfades and rotates as state changes — the switch tells you
 *     what you'll get, not just where it is.
 *   · A 10ms haptic tick on commit (Android; silent no-op elsewhere).
 *   · Full keyboard support (Space/Enter) with a focus-visible ring.
 *
 * Geometry — fixed, content never influences size:
 *   TRACK  64 × 36 · radius 18 · green ON / gray OFF
 *   THUMB  30 × 30 · white · inset 3px
 *   THUMB x: OFF = 3 · ON = 64 − 30 − 3 = 31
 */

const TRACK_W = 64;
const TRACK_H = 36;
const THUMB = 30;
const INSET = 3;
const X_OFF = INSET;                  // 3
const X_ON = TRACK_W - THUMB - INSET; // 31

const SPRING = { type: 'spring', stiffness: 550, damping: 34, mass: 0.9 } as const;

function SunGlyph({ active }: { active: boolean }) {
  return (
    <motion.svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      animate={{
        opacity: active ? 1 : 0,
        rotate: active ? 0 : 90,
        scale: active ? 1 : 0.5,
      }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <circle cx="12" cy="12" r="4.4" fill="#f98b41" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 12 + Math.cos(a) * 6.9, y1 = 12 + Math.sin(a) * 6.9;
        const x2 = 12 + Math.cos(a) * 9.3, y2 = 12 + Math.sin(a) * 9.3;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f98b41" strokeWidth="2" strokeLinecap="round" />;
      })}
    </motion.svg>
  );
}

function MoonGlyph({ active }: { active: boolean }) {
  return (
    <motion.svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      animate={{
        opacity: active ? 1 : 0,
        rotate: active ? 0 : -90,
        scale: active ? 1 : 0.5,
      }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <path
        d="M20.2 14.2a8.3 8.3 0 0 1-10.4-10.4 8.3 8.3 0 1 0 10.4 10.4Z"
        fill="#635f57"
      />
    </motion.svg>
  );
}

export function IOSWideToggle({
  checked: checkedProp,
  onChange,
  className,
  label,
}: {
  /** Controlled checked state. Omit for uncontrolled. */
  checked?: boolean;
  /** Fires with the next state on every committed change (tap or drag). */
  onChange?: (next: boolean) => void;
  className?: string;
  /** Accessible name for assistive tech. */
  label?: string;
}) {
  const [inner, setInner] = useState(false);
  const checked = checkedProp ?? inner;
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(checked ? X_ON : X_OFF);
  const dragRef = useRef<{ startX: number; moved: boolean; pointerId: number } | null>(null);

  // Keep the thumb in sync with controlled state changes from outside.
  useEffect(() => {
    if (!dragRef.current) {
      x.set(checked ? X_ON : X_OFF);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  const commit = (next: boolean) => {
    if (checkedProp === undefined) setInner(next);
    hapticTap();
    onChange?.(next);
  };

  const toggle = () => {
    const next = !checked;
    anim(x, next ? X_ON : X_OFF, reduceMotion ? { duration: 0 } : SPRING);
    commit(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, moved: false, pointerId: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    if (!d.moved) return;
    // Thumb follows the finger 1:1, clamped to the track.
    const base = checked ? X_ON : X_OFF;
    const next = Math.min(X_ON, Math.max(X_OFF, base + dx));
    x.set(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || e.pointerId !== d.pointerId) return;

    if (!d.moved) {
      // A tap — one press anywhere on the pill = one toggle.
      toggle();
      return;
    }
    // A drag — commit to whichever side the thumb crossed into. Going ON
    // means crossing the track's midpoint; going OFF means falling below it.
    const mid = (X_OFF + X_ON) / 2;
    const current = x.get();
    const next = current >= mid;
    anim(x, next ? X_ON : X_OFF, reduceMotion ? { duration: 0 } : SPRING);
    if (next !== checked) commit(next);
  };

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) {
          e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.04), 0 0 0 3px rgba(240,100,19,0.45)';
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.04)';
      }}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        backgroundColor: checked ? '#34c759' : '#e9e9ea',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'pan-y', // vertical scroll stays native; horizontal drag is ours
        userSelect: 'none',
        outline: 'none',
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
        transition: 'background-color 200ms ease, box-shadow 160ms ease',
      }}
    >
      {/* The traveling thumb — white, lifted, carrying its glyph */}
      <motion.div
        aria-hidden
        style={{
          position: 'absolute',
          top: INSET,
          left: 0,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: '#ffffff',
          boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.04)',
          x,
          touchAction: 'none',
        }}
      >
        <span style={{ position: 'absolute', inset: 0, display: 'block' }}>
          <SunGlyph active={!checked} />
          <MoonGlyph active={checked} />
        </span>
      </motion.div>
    </div>
  );
}
