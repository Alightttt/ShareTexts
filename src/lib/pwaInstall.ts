/**
 * Install help — offered, never pushed.
 *
 * The app exists to help people move a file; installing it is a convenience
 * for them, not a metric for us. So the offer obeys three rules:
 *
 *   1. EARN IT. It only appears after the app has been used (a room that ran)
 *      or after a second visit — never on a first, unfinished visit, and
 *      never during the first task. The caller also delays the first paint of
 *      the card; this file only answers "would it be reasonable?".
 *   2. BE HONEST ABOUT WHAT IT DOES. On Chromium we can hand the real
 *      beforeinstallprompt event to a real button. Where that event does not
 *      exist (iOS Safari, Firefox), we say the manual path in plain words
 *      instead of showing a button that cannot work.
 *   3. TAKE NO FOR AN ANSWER. "Not now" snoozes it for two weeks; anything
 *      resembling a refusal silences it permanently. Already-installed and
 *      standalone windows never see it at all.
 */

const SEEN_KEY = 'sharetext.visits.v1';
const MUTE_KEY = 'sharetext.install.mute.v1';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type BipEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

let deferred: BipEvent | null = null;

export function initInstallCapture() {
  if (typeof window === 'undefined') return;
  if (!('onbeforeinstallprompt' in window)) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Chromium's own mini-infobar is the pushy version of this: suppress it
    // and keep the event for a button the user actually pressed.
    e.preventDefault();
    deferred = e as BipEvent;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try {
      localStorage.setItem(MUTE_KEY, 'never');
    } catch {
      /* not fatal */
    }
  });
}

function readNum(key: string): number {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Count this visit once per page load. */
export function noteVisit() {
  try {
    localStorage.setItem(SEEN_KEY, String(readNum(SEEN_KEY) + 1));
  } catch {
    /* not fatal */
  }
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  } catch {
    /* no matchMedia */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** A real install prompt we can call on the user's behalf. */
export function hasInstallPrompt(): boolean {
  return deferred !== null;
}

/** True on iOS/iPadOS — where the install path exists but is manual. */
export function isManualInstallPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; the touch point count gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isSnoozedOrMuted(): boolean {
  try {
    if (localStorage.getItem(MUTE_KEY) === 'never') return true;
    const at = Number(localStorage.getItem(MUTE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Should we offer at all? Used-ness is passed in by the caller (it owns the
 * room lifecycle); this adds the platform and visit side of the answer.
 */
export function shouldOfferInstall(used: boolean): boolean {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  if (isSnoozedOrMuted()) return false;
  if (!hasInstallPrompt() && !isManualInstallPlatform()) return false;
  return used || readNum(SEEN_KEY) >= 2;
}

export function silenceInstall(forever: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, forever ? 'never' : String(Date.now()));
  } catch {
    /* not fatal */
  }
}

/** Fire the browser's own prompt. Returns whether it was shown. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    // Whatever they chose, they have now answered: do not ask again.
    silenceInstall(true);
    return choice?.outcome === 'accepted' || true;
  } catch {
    return false;
  }
}
