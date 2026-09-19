/**
 * Recent & trusted devices — the client-side memory that turns ShareTexts
 * from a disposable webpage into a personal device bridge.
 *
 * Two cooperating stores, both localStorage, both privacy-minimal:
 *
 *  · RECENTS — every device you've actually paired with: name + when.
 *    Powers the "Recent devices" section (name, "last connected 2 min ago")
 *    and re-inviting someone you've used before. Entries are keyed by the
 *    presence TOKEN the server handed out, so a re-invite targets exactly
 *    the device you paired with.
 *
 *  · TRUST — a paired device is "trusted": an incoming invitation from a
 *    token you've paired with before is accepted automatically, no sheet.
 *    Tokens rotate when the signaling worker redeploys, so trust quietly
 *    downgrades to the normal confirmation sheet after an infrastructure
 *    update — secure by default, convenient in the common case.
 *
 * No identifiers beyond the names the user already sees; clear with site
 * data and the memory is gone.
 */

const RECENTS_KEY = 'sharetext.recentDevices.v1';
const MAX_RECENTS = 8;
const RECENT_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days of memory

export interface RecentDevice {
  /** Presence token at pairing time (rotates with the worker). */
  token: string;
  name: string;
  lastConnectedAt: number;
  pairedAt: number;
}

function readAll(): RecentDevice[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const now = Date.now();
    return arr
      .filter((d): d is RecentDevice =>
        d && typeof d === 'object' &&
        typeof d.token === 'string' && d.token.length > 0 &&
        typeof d.name === 'string' && d.name.length > 0 &&
        typeof d.pairedAt === 'number' && typeof d.lastConnectedAt === 'number')
      .filter(d => now - d.lastConnectedAt < RECENT_TTL_MS)
      .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
  } catch {
    return [];
  }
}

function writeAll(list: RecentDevice[]): void {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
    // Same-tab listeners (the nearby UI) refresh on this; storage events
    // cover other tabs of the same origin for free.
    try { window.dispatchEvent(new CustomEvent('sharetext:recents')); } catch { /* non-DOM */ }
  } catch { /* private mode — memory simply doesn't persist */ }
}

/** Record a successful pairing (or re-connect) with a nearby device. */
export function recordRecentDevice(token: string, name: string): void {
  if (!token || !name) return;
  const list = readAll();
  const now = Date.now();
  const existing = list.find(d => d.token === token || d.name === name);
  if (existing) {
    existing.lastConnectedAt = now;
    // A token match refreshes the token (the name key survives rotation);
    // a name match during a fresh token adopts the new token so trust and
    // re-invites keep working after a worker redeploy.
    existing.token = token;
    existing.name = name;
  } else {
    list.unshift({ token, name, lastConnectedAt: now, pairedAt: now });
  }
  writeAll(list.sort((a, b) => b.lastConnectedAt - a.lastConnectedAt));
}

/** All remembered devices, newest connection first. */
export function getRecentDevices(): RecentDevice[] {
  return readAll();
}

/** Forget one device (row-level ✕). */
export function forgetRecentDevice(token: string): void {
  writeAll(readAll().filter(d => d.token !== token));
}

/** Has this device been PAIRED (not merely seen) with the given token? */
export function isTrustedToken(token: string): boolean {
  if (!token) return false;
  return readAll().some(d => d.token === token);
}

/**
 * Resolve the CURRENT presence token for a remembered device by name.
 * Presence tokens rotate with the worker, so re-inviting from the recents
 * list must match against the live list: the remembered name finds the
 * device's fresh token. Returns null when the device isn't present right now.
 */
export function resolveLiveToken(name: string, liveDevices: Array<{ id: string; name: string }>): string | null {
  const hit = liveDevices.find(d => d.name === name);
  return hit ? hit.id : null;
}

/** Relative "last connected" label value: minutes or hours or a day count. */
export function lastSeenParts(ts: number): { unit: 'now' | 'min' | 'hour' | 'day'; n: number } {
  const delta = Date.now() - ts;
  if (delta < 90_000) return { unit: 'now', n: 0 };
  const min = Math.round(delta / 60_000);
  if (min < 60) return { unit: 'min', n: min };
  const hours = Math.round(min / 60);
  if (hours < 24) return { unit: 'hour', n: hours };
  const days = Math.max(1, Math.round(hours / 24));
  return { unit: 'day', n: days };
}
