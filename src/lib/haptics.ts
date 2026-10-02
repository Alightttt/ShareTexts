/**
 * Haptics — reserved for the moments that matter.
 *
 * Restraint is the design: vibration is NOT a texture on every tap —
 * it is reserved for rare, meaningful events (a device connected —
 * the AirDrop "someone's here" moment; a transfer arriving intact).
 * Ordinary taps answer through the visual language instead: TactileButton's
 * press anatomy, state transitions, toasts, and the horizontal shake for
 * denials (LiveCodeInput's wrong-code shake, the nearby failure card) —
 * visual haptics, not vibration.
 *
 * navigator.vibrate is Android-only in practice (iOS Safari ignores it);
 * everything here is a guarded, no-throw progressive enhancement.
 */

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* never let feedback break an action */ }
}

/** Rising pulse — a device connected (the AirDrop moment). Once per room. */
export const hapticSuccess = () => vibrate([12, 40, 18]);

/** Quieter double-tick — a transfer arrived intact. Same family as the
 *  connect pulse, one step down: the room already exists, this confirms
 *  the payload landed. */
export const hapticArrive = () => vibrate([10, 34, 12]);
