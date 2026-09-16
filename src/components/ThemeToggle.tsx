import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { useTheme } from '../lib/theme';

/**
 * The theme switch — a compact iOS-class control.
 *
 * Visual contract (fixed at every breakpoint — never scales with viewport):
 *
 *   TRACK  82 × 36 · radius 18 · green when on, gray when off
 *   THUMB  50 × 32  · radius 16 · 2px inset all around
 *
 * The thumb fills 88% of the track height — a large white pill inside a
 * slim colored margin. The silhouette never changes; the only animations
 * are the thumb sliding on x and the track's color.
 *
 * Interaction:
 *   tap (anywhere on the control)  → toggle
 *   drag the thumb horizontally    → follows the pointer, constrained to the
 *                                    track; release settles by midpoint
 *   keyboard (Enter/Space)         → toggle; role=switch + aria-checked
 *
 * The visible pill stays 64×30; the clickable/keyboard target is an
 * invisible padded wrapper so the hit area stays comfortable
 * without ever changing the visual size.
 */

/* ── Geometry ───────────────────────────────────────────────────────────
 * Compact header footprint: 64×30 track, 40×26 thumb, 2px inset, 20px
 * travel. Same wide-pill silhouette
 * at every breakpoint — all sizes FIXED: no vw, no clamp(), no responsive
 * prefixes, no aspect-ratio.
 */
const TRACK_W = 64;
const TRACK_H = 30;
const INSET = 2;                      // (30 − 26) / 2
const THUMB_W = 40;
const THUMB_H = 26;
const X_ON = TRACK_W - THUMB_W - 2 * INSET; // 20 — thumb's travel distance
const RADIUS_TRACK = 15;
const RADIUS_THUMB = 13;
/* iOS settle: quick ease-out without overshoot. */
const SPRING = { type: 'spring', stiffness: 550, damping: 38 } as const;

/* ── Colors ───────────────────────────────────────────────────────────── */
const GREEN_ON = '#5CCB67';
const GRAY_OFF = '#e9e9ea';
const GRAY_OFF_DARK = '#39393d';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const isDark = resolved === 'dark';

  const x = useMotionValue(isDark ? X_ON : 0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);

  // The flip itself is INSTANT — iOS-style. Perceived smoothness comes from
  // the thumb's spring (below), not from cross-fading the whole tree.
  // The old View Transition snapshot + the all-elements CSS transition
  // fallback forced a repaint of every node with 200ms+ transitions — that
  // was the reported "laggy" feel on mobile. A class flip is one style
  // recalculation; the compositor takes it from there.
  const applyTheme = () => {
    toggle();
  };

  // State → thumb position. Skipped while dragging (the pointer owns x).
  useEffect(() => {
    if (draggingRef.current) return;
    const controls = animate(x, isDark ? X_ON : 0, SPRING);
    return () => controls.stop();
  }, [isDark, x]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = e.clientX;
    startPosRef.current = x.get();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 3) movedRef.current = true;
    x.set(Math.max(0, Math.min(X_ON, startPosRef.current + dx)));
  };

  const settle = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const target: boolean = x.get() > X_ON / 2 ? true : false;
    if (target !== isDark) {
      // The isDark effect below animates the thumb the rest of the way.
      applyTheme();
    } else {
      animate(x, target ? X_ON : 0, SPRING);
    }
  };

  return (
    <div
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      tabIndex={0}
      onClick={() => { if (!movedRef.current) applyTheme(); movedRef.current = false; }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyTheme(); }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={settle}
      onPointerCancel={settle}
      onLostPointerCapture={settle}
      className={className}
      style={{
        // Invisible comfort padding around the fixed 60×34 pill — hit
        // target ~72×44. The matching negative margin cancels the padding
        // in flow, so layout spacing sees exactly the 60×34 pill while the
        // touch target still extends 5px beyond it on every side.
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 5,
        margin: -5,
        flex: '0 0 auto',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'pan-y',
        userSelect: 'none',
        outline: 'none',
        borderRadius: RADIUS_TRACK,
      }}
      onFocus={(e) => {
        if (e.currentTarget.matches(':focus-visible')) {
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(240,100,19,0.45)';
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <motion.div
        aria-hidden
        style={{
          position: 'relative',
          width: TRACK_W,
          height: TRACK_H,
          minWidth: TRACK_W,
          maxWidth: TRACK_W,
          minHeight: TRACK_H,
          maxHeight: TRACK_H,
          flex: '0 0 auto',
          borderRadius: RADIUS_TRACK,
          backgroundColor: isDark ? GREEN_ON : GRAY_OFF,
          transition: 'background-color 250ms cubic-bezier(0.23, 1, 0.32, 1)',
        }}
      >
        <motion.div
          style={{
            position: 'absolute',
            top: INSET,
            left: INSET,
          width: THUMB_W,
          height: THUMB_H,
          minWidth: THUMB_W,
          maxWidth: THUMB_W,
          minHeight: THUMB_H,
          maxHeight: THUMB_H,
          borderRadius: RADIUS_THUMB,
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
            x,
            willChange: 'transform',
          }}
          initial={false}
        />
      </motion.div>
    </div>
  );
}
