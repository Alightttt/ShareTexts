import React, { useState } from 'react';
import { motion } from 'motion/react';

/**
 * IOSWideToggle — built from scratch, ONLY primitives:
 *
 *   one fixed-size rounded-rectangular TRACK  (the component itself)
 *   one white circular THUMB inside it        (absolutely positioned)
 *   one press handler on the track
 *   one transform animation on the thumb
 *
 * No native Switch. No UI-library Switch. No percentages, no flex sizing,
 * no aspect ratios, no content sizing. The track's explicit width/height
 * ARE the component's size; the thumb cannot influence it.
 *
 *   TRACK  58 × 34 · borderRadius 17 (= height/2) · green ON / gray OFF
 *   THUMB  28 × 28 · borderRadius 14 (= 50%) · white · inset 3px
 *
 * Thumb x is computed, never guessed:
 *   OFF x = INSET                     (3)
 *   ON  x = TRACK_W - THUMB - INSET   (27)
 *
 * Only two things animate: the thumb's translateX (spring) and the track's
 * background-color. Nothing resizes, nothing shifts layout, nothing rotates.
 */

const TRACK_W = 58;
const TRACK_H = 34;
const THUMB = 28;
const INSET = 3;
const X_OFF = INSET;                  // 3
const X_ON = TRACK_W - THUMB - INSET; // 27

export function IOSWideToggle({
  checked: checkedProp,
  onChange,
  className,
  label,
}: {
  /** Controlled checked state. Omit for uncontrolled. */
  checked?: boolean;
  /** Fires with the next state on every intentional toggle. */
  onChange?: (next: boolean) => void;
  className?: string;
  /** Accessible name for assistive tech. */
  label?: string;
}) {
  const [inner, setInner] = useState(false);
  const checked = checkedProp ?? inner;

  const toggle = () => {
    const next = !checked;
    if (checkedProp === undefined) setInner(next);
    onChange?.(next);
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
      // One press anywhere on the pill = one toggle. No click binding, so
      // the browser's synthesized click can never double-fire.
      onPointerDown={toggle}
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
        touchAction: 'manipulation',
        userSelect: 'none',
        // Invisible until keyboard focus (:focus-visible only) so mouse and
        // touch users never see a ring, but keyboard users always do.
        outline: 'none',
        transition: 'background-color 200ms ease, box-shadow 160ms ease',
      }}
      onFocus={(e) => {
        if (e.target.matches(':focus-visible')) {
          e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.04), 0 0 0 3px rgba(240,100,19,0.45)';
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,0.04)';
      }}
    >
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
          boxShadow: '0 2px 5px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.15)',
        }}
        initial={false}
        animate={{ x: checked ? X_ON : X_OFF }}
        transition={{ type: 'spring', stiffness: 550, damping: 32 }}
      />
    </div>
  );
}
