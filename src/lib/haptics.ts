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
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    // Chrome refuses a vibrate() before the user has touched the page at all
    // (and logs a console error while refusing — the connect pulse can fire
    // on a room that was joined by URL). Ask the user-activation API first so
    // the call is never made, instead of being made and rejected.
    const activation = (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } }).userActivation;
    if (activation && activation.hasBeenActive === false) return;
    navigator.vibrate(pattern);
  } catch { /* never let feedback break an action */ }
}

/** Rising pulse — a device connected (the AirDrop moment). Once per room. */
export const hapticSuccess = () => vibrate([12, 40, 18]);

/** Quieter double-tick — a transfer arrived intact. Same family as the
 *  connect pulse, one step down: the room already exists, this confirms
 *  the payload landed. */
export const hapticArrive = () => vibrate([10, 34, 12]);

/** The shortest tick we can ask for — one 8ms beat, used at the two moments
 *  where a gesture changes SHARED state and the eyes may be elsewhere:
 *  dropping a reaction onto the other device's message, and arming a
 *  destructive slide. Still not a texture on ordinary taps — those answer
 *  through press anatomy and toasts alone. */
export const hapticTick = () => vibrate(8);
