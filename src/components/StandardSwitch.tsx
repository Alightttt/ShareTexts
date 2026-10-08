import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * StandardSwitch — THE switch of ShareTexts, extracted from the theme
 * toggle's exact visual contract so every on/off control in the app shares
 * one silhouette and one feel:
 *
 *   TRACK  56 × 26 · radius 13 · colored when on, gray when off
 *   THUMB  34 × 22 · radius 11 · 2px inset · 18px travel
 *
 * Interaction (identical to the theme toggle):
 *   tap anywhere on the control  → toggle
 *   drag the thumb horizontally  → follows the pointer, settles by midpoint
 *   keyboard (Enter/Space)       → toggle; role=switch + aria-checked
 *
 * The visible pill stays 56×26; an invisible padded wrapper keeps the
 * touch target comfortable (70×40) without changing the visual size.
 *
 * The theme toggle itself keeps its own component (its off-state uses a
 * darker light-mode track); everything else in the app uses THIS switch.
 */

/* ── Geometry (ThemeToggle parity, fixed at every breakpoint) ── */
const TRACK_W = 56;
const TRACK_H = 26;
const INSET = 2;
const THUMB_W = 34;
const THUMB_H = 22;
const X_ON = TRACK_W - THUMB_W - 2 * INSET; // 18
const RADIUS_TRACK = 13;
const RADIUS_THUMB = 11;
/* iOS settle: quick ease-out without overshoot. */
const SPRING = { type: 'spring', stiffness: 550, damping: 38 } as const;

/* ── Colors: ember when on (the app's action color), gray when off ──
   SVG fill literals: MUST mirror the @theme tokens — EMBER_ON =
   --color-ember, EMBER_ON_DARK = --color-azure-400, GRAY_* = iOS grays. */
const EMBER_ON = '#f06413';
const EMBER_ON_DARK = '#fb9243';
const GRAY_OFF = '#e9e9ea';
const GRAY_OFF_DARK = '#39393d';

export function StandardSwitch({
  checked,
  onChange,
  ariaLabel,
  testId,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
}) {
  const x = useMotionValue(checked ? X_ON : 0);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startPosRef = useRef(0);
  // Dark-mode detection for the on-color (CSS var driven, so a class check
  // on <html> is the truth — same source the theme toggle's colors follow).
  const [isDark, setIsDark] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setIsDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // State → thumb position. Skipped while dragging (the pointer owns x).
  useEffect(() => {
    if (draggingRef.current) return;
    const controls = animate(x, checked ? X_ON : 0, SPRING);
    return () => controls.stop();
  }, [checked, x]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
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
    const target = x.get() > X_ON / 2;
    if (target !== checked) onChange(target);
    else animate(x, checked ? X_ON : 0, SPRING);
  };

  const toggle = () => { if (!disabled) onChange(!checked); };

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      tabIndex={disabled ? -1 : 0}
      onClick={() => { if (!movedRef.current) toggle(); movedRef.current = false; }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={settle}
      onPointerCancel={settle}
      onLostPointerCapture={settle}
      className={cn('inline-flex items-center justify-center', disabled && 'opacity-50 pointer-events-none', className)}
      style={{
        // Invisible comfort padding around the fixed 56×26 pill — hit
        // target 70×40 (matching the header's uniform control slot). The
        // negative margin cancels the padding in flow.
        padding: 7,
        margin: -7,
        flex: '0 0 auto',
        cursor: disabled ? 'default' : 'pointer',
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
      onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
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
          backgroundColor: checked
            ? (isDark ? EMBER_ON_DARK : EMBER_ON)
            : (isDark ? GRAY_OFF_DARK : GRAY_OFF),
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
