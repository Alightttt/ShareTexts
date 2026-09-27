/**
 * Motion tokens — one hand, one rhythm.
 *
 * The app's feel comes from consistent timing: taps answer instantly,
 * state changes explain themselves, entrances arrive without noise.
 * New motion code imports from here; existing components keep their
 * tuned springs (they already follow these curves in spirit).
 *
 *   fast   — 120ms, press/selection answers
 *   state  — 240ms, a state visibly changed (toggle, swap, banner)
 *   enter  — 400ms, something arrived (card, section, overlay)
 *
 * All curves are Apple-like ease-outs (fast start, gentle settle);
 * MotionConfig reducedMotion="user" flattens transforms globally.
 */
import type { Transition } from 'motion/react';

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const DUR_FAST = 0.12;
export const DUR_STATE = 0.24;
export const DUR_ENTER = 0.4;

/** Press/selection feedback. */
export const tapTransition: Transition = { duration: DUR_FAST, ease: EASE_OUT };

/** A state change the user caused (banner in/out, toggle, swap). */
export const stateTransition: Transition = { duration: DUR_STATE, ease: EASE_OUT };

/** Something arrived (card, section, overlay). */
export const enterTransition: Transition = { duration: DUR_ENTER, ease: EASE_OUT };
