/**
 * Motion tokens (F24) — one restrained system for every transition in the
 * app. CSS carries the same duration ladder as `--st-dur-*` in index.css
 * (CSS can't import TS); keep the numbers in sync — this file is the
 * source of truth.
 *
 * Motion exists only to communicate: CAUSE · STATE · RELATIONSHIP ·
 * HIERARCHY · FEEDBACK · ORIENTATION. If an animation communicates none
 * of those, it does not ship (see docs/audits/motion.md for the audit).
 *
 * ── Duration ladder ────────────────────────────────────────────────────
 * instant  60ms   press feedback that should read as immediate
 * micro   120ms   taps, toggles, copy confirmations, tooltips
 * short   180ms   backdrop fades, small state flips, hover transitions
 * medium  280ms   toasts, popovers, structural entrances
 * long    480ms   sheets settling, image fade-in — the longest UI beat
 *
 * Frequent interactions use short values: no animation may make the app
 * feel slower than the operation it describes. Long-running loops are
 * reserved for STATE (connecting, transferring) and are always frozen
 * under prefers-reduced-motion (MotionConfig reducedMotion="user" in
 * main.tsx zeroes the JS side; CSS guards the keyframe side).
 *
 * ── Springs vs easing ──────────────────────────────────────────────────
 * Springs (direct manipulation, sheets, cards, device selection) re-target
 * the moment state changes — motion/react interrupts and continues from
 * the current value, which is what keeps every animation interruptible.
 * Standard easing (--ease-out family) for opacity and informational fades.
 */

/** Duration ladder in ms — the numbers CSS mirrors as --st-dur-*. */
export const DUR = {
  instant: 60,
  micro: 120,
  short: 180,
  medium: 280,
  long: 480,
} as const;

/** Easing curves — mirror of index.css --ease-* tokens. */
export const EASE = {
  /** Default for entrances and ordinary transitions (index.css --ease-out). */
  out: [0.23, 1, 0.32, 1] as [number, number, number, number],
  /** Symmetric moves, longer sequences (index.css --ease-in-out). */
  inOut: [0.77, 0, 0.175, 1] as [number, number, number, number],
} as const;

/**
 * Named spring presets — physical, interruptible, bounded (no overshoot
 * circus). motion/react retargets these on state change, so a sheet that
 * is dismissed mid-open leaves instantly instead of finishing first.
 */
export const SPRING = {
  /** Sheets and structural surfaces: the existing OverlaySheet feel. */
  sheet: { stiffness: 380, damping: 36 },
  /** Command palette / popovers: duration-bounded spring, no drift. */
  panel: { type: 'spring', bounce: 0.12, duration: 0.38 } as const,
  /** Small direct-manipulation feedback (toggles, chips, thumbnails). */
  snap: { stiffness: 500, damping: 40 },
} as const;

/** Fades use the standard curve with the short ladder — never a spring. */
export const fade = (duration: number = DUR.short) => ({ duration, ease: EASE.out });
