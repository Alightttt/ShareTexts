/**
 * Haptics — the physical "pop" iOS apps have and web apps forget.
 *
 * navigator.vibrate is Android-only in practice (iOS Safari ignores it),
 * so this is a progressive enhancement: a 10ms tick on commit-style taps
 * and a short rise on success moments. Guarded, never throws, no-ops on
 * unsupported devices — zero risk, real texture where it works.
 */

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* never let feedback break an action */ }
}

/** Light tick — taps that commit something (Send, Receive, copy). */
export const hapticTap = () => vibrate(10);

/** Short rising pulse — something landed (paired, file arrived). */
export const hapticSuccess = () => vibrate([12, 40, 18]);
