/**
 * Device naming and identity. Extracted verbatim from SessionContext
 * (Round 03); semantics unchanged.
 */

export const DEVICE_NAME_KEY = 'sharetext.deviceName';

/** The platform-based default name, ignoring anything the user set. Used to
 *  tell "still an unedited default" apart from a deliberate (even identical)
 *  rename — auto-disambiguation must never touch a user's choice. */
export function platformDefaultName(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android Phone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'MacBook';
  if (/Linux/i.test(ua)) return 'Linux PC';
  return 'Device';
}

/** Names the FIRST-EVER defaults used before the product dropped the
 *  "Guest" prefix. A device that stored one of these keeps an outdated
 *  label forever unless it is migrated — every device that still shows
 *  one gets the modern, recognizable default instead. A user's custom
 *  name never matches these patterns, so renames are respected. */
const LEGACY_DEFAULT_NAMES = /^(Guest Device|Guest iPhone|Guest iPad|Guest Android|Guest Windows PC|Guest MacBook|Guest Linux|Unnamed device)$/;

export function guessDeviceName(): string {
  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored) return stored;
  return platformDefaultName();
}

/** One-time identity bootstrap: persist the platform-guessed name so every
 *  surface agrees, and migrate legacy "Guest …" defaults to the modern one.
 *  Returns the (possibly migrated) name to seed into session state. */
export function ensureDeviceNameSeeded(): string | null {
  try {
    if (!localStorage.getItem(DEVICE_NAME_KEY)) {
      const guess = guessDeviceName();
      localStorage.setItem(DEVICE_NAME_KEY, guess);
      return null; // state already carries the guess — nothing to sync
    }
    const current = localStorage.getItem(DEVICE_NAME_KEY);
    if (current && LEGACY_DEFAULT_NAMES.test(current)) {
      const modern = guessDeviceName();
      localStorage.setItem(DEVICE_NAME_KEY, modern);
      return modern; // caller syncs React state to the migration
    }
  } catch { /* private mode */ }
  return null;
}
