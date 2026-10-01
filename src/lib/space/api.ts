/**
 * Space API client (F14) — thin fetch wrapper over the Temporary Space REST
 * contract, plus the device's local credential store.
 *
 * Credential model: the access token is the share secret. Each device keeps
 * { token, manageKey? } in localStorage; requests present it via Bearer auth.
 * A stable deviceKey (random, per device, NOT a secret) scopes the server's
 * participant id so two devices sharing one link are two members.
 */

import { SPACE_CREDS_KEY, SPACE_DEVICE_KEY, spaceShareLink, parseSpaceShare } from './constants';
import { signalingHttpBase } from '../socket';
import type { CreateResult, FileInitResult, SpaceItem, SpaceSnapshot, UploadStatus } from './types';

export { spaceShareLink, parseSpaceShare };

// ── device identity ───────────────────────────────────────────────────────

/** Stable per-device seed used only to scope the participant id. */
export function spaceDeviceKey(): string {
  try {
    let k = localStorage.getItem(SPACE_DEVICE_KEY);
    if (!k) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      k = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(SPACE_DEVICE_KEY, k);
    }
    return k;
  } catch {
    return 'anon';
  }
}

/** Display name sent with membership writes (reuses live-room device names). */
export function deviceName(): string {
  try {
    const raw = localStorage.getItem('sharetext.deviceName');
    if (raw) return raw.slice(0, 40);
  } catch { /* noop */ }
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android Phone';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'MacBook';
    if (/Linux/i.test(ua)) return 'Linux PC';
  }
  return 'Device';
}

// ── local credential store ────────────────────────────────────────────────

interface CredMap { [spaceId: string]: { token: string; manageKey?: string; name: string; expiresAt: number; lastOpen: number } }

function readCreds(): CredMap {
  try {
    const raw = localStorage.getItem(SPACE_CREDS_KEY);
    return raw ? (JSON.parse(raw) as CredMap) : {};
  } catch {
    return {};
  }
}

function writeCreds(map: CredMap): void {
  try { localStorage.setItem(SPACE_CREDS_KEY, JSON.stringify(map)); } catch { /* private mode */ }
}

/** Credentials the device holds for a space, if any. */
export function localCreds(spaceId: string): { token: string; manageKey?: string; name: string; expiresAt: number } | null {
  const rec = readCreds()[spaceId];
  if (!rec) return null;
  if (Date.now() >= rec.expiresAt) return null; // expired locally too
  return rec;
}

/** Remember credentials after create/join. Prunes expired entries on write. */
function saveCreds(spaceId: string, rec: { token: string; manageKey?: string; name: string; expiresAt: number }): void {
  const map = readCreds();
  // Prune: drop everything that expired more than a day ago.
  for (const [id, r] of Object.entries(map)) {
    if (Date.now() - r.expiresAt > 24 * 3600_000) delete map[id];
  }
  map[spaceId] = { ...rec, lastOpen: Date.now() };
  writeCreds(map);
}

/** Recently opened spaces (newest first), for the landing-page re-entry. */
export function recentSpaces(): Array<{ spaceId: string; name: string; expiresAt: number; isCreator: boolean }> {
  const map = readCreds();
  return Object.entries(map)
    .filter(([, r]) => Date.now() < r.expiresAt)
    .sort((a, b) => b[1].lastOpen - a[1].lastOpen)
    .slice(0, 3)
    .map(([spaceId, r]) => ({ spaceId, name: r.name, expiresAt: r.expiresAt, isCreator: !!r.manageKey }));
}

export function forgetSpace(spaceId: string): void {
  const map = readCreds();
  delete map[spaceId];
  writeCreds(map);
}

// ── request plumbing ──────────────────────────────────────────────────────

/** Auth + identity headers for raw fetches (uploads, downloads). */
export function headers(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'x-device-key': spaceDeviceKey(), 'x-device-name': deviceName() };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

export class SpaceApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly closed: boolean = false) {
    super(code);
  }
}

async function readError(res: Response): Promise<never> {
  let msg = 'Request failed';
  try {
    const body = (await res.json()) as { error?: string; closed?: boolean };
    if (body?.error) msg = body.error;
    throw new SpaceApiError(res.status, msg, !!(body as { closed?: boolean })?.closed);
  } catch (e) {
    if (e instanceof SpaceApiError) throw e;
    throw new SpaceApiError(res.status, msg);
  }
}

async function jsonFetch<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...headers(token ?? null), ...(rest.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) await readError(res);
  return res.json() as Promise<T>;
}

/** Base URL for space REST calls: same origin in dev/self-hosted; the active
 *  worker base on the Cloudflare transport (shares the endpoint probe). */
export function spaceApiBase(): string {
  try {
    return signalingHttpBase() ?? '';
  } catch {
    return '';
  }
}

// ── create / join ─────────────────────────────────────────────────────────

/** Client-side id for create — an opaque UUID the server binds at creation. */
export function newSpaceId(): string {
  return crypto.randomUUID();
}

export async function createSpace(opts: { name?: string; durationMs: number; manage?: boolean }): Promise<CreateResult> {
  const spaceId = newSpaceId();
  const base = spaceApiBase();
  const res = await fetch(`${base}/space/${spaceId}/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers(null) },
    body: JSON.stringify({ name: opts.name || undefined, durationMs: opts.durationMs }),
  });
  if (!res.ok) await readError(res);
  const out = (await res.json()) as CreateResult;
  saveCreds(out.spaceId, { token: out.token, manageKey: out.manageKey, name: out.name, expiresAt: out.expiresAt });
  return out;
}

export async function joinSpace(spaceId: string, token: string): Promise<SpaceSnapshot> {
  const base = spaceApiBase();
  const res = await fetch(`${base}/space/${spaceId}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers(token) },
    body: JSON.stringify({}),
  });
  if (!res.ok) await readError(res);
  const out = (await res.json()) as SpaceSnapshot;
  saveCreds(spaceId, { token, name: out.name, expiresAt: out.expiresAt });
  return out;
}

/** Join from a share link / QR / pasted code. */
export async function joinFromShare(raw: string): Promise<SpaceSnapshot> {
  const parsed = parseSpaceShare(raw);
  if (!parsed) throw new SpaceApiError(400, 'That link doesn\'t look like a space link.');
  return joinSpace(parsed.spaceId, parsed.token);
}

// ── items ─────────────────────────────────────────────────────────────────

export async function listItems(spaceId: string, since = 0): Promise<{ seq: number; items: SpaceItem[] }> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  return jsonFetch(`${base}/space/${spaceId}/items?since=${since}`, { token: creds.token });
}

export async function addText(spaceId: string, text: string, kind: 'text' | 'link' = 'text'): Promise<SpaceItem> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  const out = await jsonFetch<{ item: SpaceItem }>(`${base}/space/${spaceId}/items/text`, {
    method: 'POST',
    token: creds.token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, kind }),
  });
  return out.item;
}

export async function initFile(spaceId: string, meta: { name: string; mime: string; size: number; sha256?: string }): Promise<FileInitResult> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  return jsonFetch(`${base}/space/${spaceId}/items/file/init`, {
    method: 'POST',
    token: creds.token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(meta),
  });
}

export async function uploadStatus(spaceId: string, itemId: string): Promise<UploadStatus | null> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  try {
    return await jsonFetch(`${base}/space/${spaceId}/items/file/status?itemId=${encodeURIComponent(itemId)}`, { token: creds.token });
  } catch (e) {
    if (e instanceof SpaceApiError && e.status === 404) return null; // upload gone — start fresh
    throw e;
  }
}

export async function deleteItem(spaceId: string, itemId: string): Promise<void> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  await jsonFetch(`${base}/space/${spaceId}/items/${itemId}`, { method: 'DELETE', token: creds.token });
}

export async function closeSpace(spaceId: string): Promise<void> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds?.manageKey) throw new SpaceApiError(403, 'Only the creator can close it');
  await jsonFetch(`${base}/space/${spaceId}/close`, { method: 'POST', token: creds.manageKey, headers: { 'content-type': 'application/json' }, body: '{}' });
}

/** Authorized download URL for a READY file item. Uses the manage key when
 *  the device is the creator so creator downloads work too. */
export function downloadUrl(spaceId: string, itemId: string): string {
  return `${spaceApiBase()}/space/${spaceId}/items/${itemId}/download`;
}

/** Download with per-request Bearer auth: fetch → blob → object URL → click.
 *  The auth header can't ride on a plain <a href>, so this is the way. */
export async function downloadItem(spaceId: string, item: SpaceItem): Promise<void> {
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  const res = await fetch(downloadUrl(spaceId, item.id), { headers: headers(creds.token) });
  if (!res.ok) await readError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Give the browser a beat to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// ── reminders ─────────────────────────────────────────────────────────────

export async function subscribeReminder(spaceId: string, sub: PushSubscriptionJSON): Promise<void> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) throw new SpaceApiError(401, 'No access');
  await jsonFetch(`${base}/space/${spaceId}/subscribe`, {
    method: 'POST',
    token: creds.token,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
  });
}

export async function unsubscribeReminder(spaceId: string): Promise<void> {
  const base = spaceApiBase();
  const creds = localCreds(spaceId);
  if (!creds) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await jsonFetch(`${base}/space/${spaceId}/unsubscribe`, {
      method: 'POST',
      token: creds.token,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch { /* best-effort */ }
}
