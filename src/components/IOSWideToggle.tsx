import React from 'react';
import { motion } from 'motion/react';
import { hapticTap } from '../lib/haptics';

/**
 * IOSWideToggle — a plain custom wide-capsule switch, built from raw divs.
 *
 * The geometry is the contract (it NEVER changes):
 *
 *   TRACK  58 × 34 · radius 17 · absolute-positioned container
 *   THUMB  28 × 28 · radius 14 · white circle, top/left inset 3px
 *
 *   OFF: thumb translateX(0)   → sits at left: 3px
 *   ON:  thumb translateX(24)  → sits at left: 27px  (58 − 28 − 3)
 *
 * Only two things animate: the thumb's translateX (fast iOS spring) and the
 * track's background-color. No glyphs, no drag, no resize, no layout shift.
 * The track is layout-locked (min/max width & height, flexShrink 0) so no
 * parent — flex header included — can compress or stretch it.
 *
 * The larger invisible tap target lives OUTSIDE this file's visual box
 * (the header gives the row ≥40px hit areas via padding); the visible
 * capsule itself stays exactly 58 × 34.
 */

const TRACK_W = 58;
const TRACK_H = 34;
const THUMB = 28;
const INSET = 3;
const X_ON = 24; // 27 − 3: from left 3px to left 27px

const TRACK_ON = '#5CCB67';
const TRACK_OFF = '#e9e9ea';

export function IOSWideToggle({
  checked: checkedProp,
  onChange,
  className,
  label,
}: {
  /** Controlled checked state. Omit for uncontrolled. */
  checked?: boolean;
  /** Fires with the next state on every toggle. */
  onChange?: (next: boolean) => void;
  className?: string;
  /** Accessible name for assistive tech. */
  label?: string;
}) {
  const [inner, setInner] = React.useState(false);
  const checked = checkedProp ?? inner;

  const toggle = () => {
    const next = !checked;
    if (checkedProp === undefined) setInner(next);
    hapticTap();
    onChange?.(next);
  };

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      }}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        width: TRACK_W,
        height: TRACK_H,
        minWidth: TRACK_W,
        maxWidth: TRACK_W,
        minHeight: TRACK_H,
        maxHeight: TRACK_H,
        borderRadius: TRACK_H / 2,
        backgroundColor: checked ? TRACK_ON : TRACK_OFF,
        flexShrink: 0,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'manipulation',
        userSelect: 'none',
        outline: 'none',
        // Keyboard-only focus ring (invisible for mouse/touch).
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.04)',
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
          left: INSET,
          width: THUMB,
          height: THUMB,
          minWidth: THUMB,
          maxWidth: THUMB,
          minHeight: THUMB,
          maxHeight: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: '#ffffff',
          boxShadow: '0 2px 5px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.15)',
        }}
        initial={false}
        animate={{ x: checked ? X_ON : 0 }}
        transition={{ type: 'spring', stiffness: 550, damping: 32 }}
      />
    </div>
  );
}
