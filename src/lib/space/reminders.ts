/**
 * Reminder scheduling (F14) — one push per space per device.
 *
 * Policy: the server owns the schedule (reminderAt from creation; the Space
 * DO alarm fires it once). This module only: asks permission from a direct
 * user gesture (§8 — never on page load), registers the subscription with
 * the space, and reports honestly when push isn't available (§10).
 */

import { subscribeReminder, unsubscribeReminder } from './api';

export type ReminderSupport =
  | 'supported'          // can subscribe
  | 'denied'             // permission denied → in-app countdown only
  | 'unsupported'        // no push in this browser/context
  | 'insecure';          // not a secure context (push requires https/localhost)

export function reminderSupport(): ReminderSupport {
  try {
    if (typeof window === 'undefined') return 'unsupported';
    if (!window.isSecureContext) return 'insecure';
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return 'supported';
  } catch {
    return 'unsupported';
  }
}

/** Ask permission + subscribe this device to the space's one reminder.
 *  Must be called from a user gesture. Never throws. */
export async function enableReminder(spaceId: string): Promise<{ ok: boolean; reason?: ReminderSupport }> {
  const support = reminderSupport();
  if (support !== 'supported') return { ok: false, reason: support };
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(await vapidPublicKey()) }));
    if (!sub) return { ok: false, reason: 'unsupported' };
    await subscribeReminder(spaceId, sub.toJSON());
    return { ok: true };
  } catch {
    // Permission prompt dismissed, or subscribe failed — countdown still works.
    return { ok: false, reason: Notification.permission === 'denied' ? 'denied' : 'unsupported' };
  }
}

/** Best-effort unsubscribe when the user opts out or the space closes. */
export async function disableReminder(spaceId: string): Promise<void> {
  try {
    await unsubscribeReminder(spaceId);
  } catch { /* best-effort */ }
}

/** The Space reminder only needs SOME server key for subscribe() to work
 *  locally; real pushes in production use the worker's VAPID keys. The key
 *  is served by the backend at /space-vapid (same contract in dev/prod).
 *  Absent → reminders unsupported (honest fallback). */
async function vapidPublicKey(): Promise<string> {
  const { spaceApiBase } = await import('./api');
  const res = await fetch(`${spaceApiBase()}/space-vapid`, { cache: 'no-store' });
  if (!res.ok) throw new Error('no vapid');
  const data = (await res.json()) as { publicKey?: string };
  if (!data.publicKey) throw new Error('no vapid');
  return data.publicKey;
}

function urlB64ToUint8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
