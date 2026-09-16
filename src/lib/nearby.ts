import type { SignalingSocket } from './socket';
import { devLog } from './devlog';
import { diag } from './diag';

/**
 * Nearby device presence — the client half of landing-page discovery.
 *
 * A device that is merely OPEN on ShareTexts (not seated in a room) can
 * announce itself so other nearby devices can offer a one-tap connect.
 * Everything here is EPHEMERAL and PRIVACY-MINIMAL:
 *
 *   · the device id is a random UUID persisted in localStorage ONLY so the
 *     server can dedupe refreshes — it never leaves the device except inside
 *     the announce, and the server replies with a rotating opaque token that
 *     is what other devices actually see;
 *   · no polling, no extra sockets: one keepalive announce per 45s on the
 *     EXISTING signaling socket, immediate re-announce on reconnect;
 *   · discovery ≠ connection — this module never opens a room or WebRTC;
 *     selecting a device sends a server-relayed invitation which the other
 *     user must accept, and only then do the EXISTING create/join flows run.
 *
 * Only the socket.io transport implements presence. On the Cloudflare
 * transport unknown events fail cleanly — `attach` detects that once and the
 * app simply shows the hero hint line without a device list.
 */

/** Random, opaque, stable device id. Reused across visits ONLY as a presence
 *  dedupe key on the server; it is not a tracking identifier (no server-side
 *  persistence, rotating tokens on the wire, cleared with site data). */
const DEVICE_ID_KEY = 'sharetext.deviceId.v1';

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
      return existing;
    }
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID(); // private mode: a per-load id still works
  }
}

/** What the UI is allowed to know about a nearby device. `id` is the server's
 *  rotating token — opaque, untraceable, per-process. */
export interface NearbyDevice {
  id: string;
  name: string;
}

const TOKEN_RE = /^[0-9a-f]{32}$/;
const NAME_MAX = 32;
const MAX_DEVICES = 24;

/** Server → UI validation. Strips control characters, caps lengths, drops
 *  malformed entries. Device names render as React text (never HTML), so this
 *  is defense-in-depth against XSS-by-name, not the only line. */
export function parsePresenceList(payload: unknown): NearbyDevice[] {
  const raw = (payload as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NearbyDevice[] = [];
  for (const item of raw.slice(0, MAX_DEVICES)) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id !== 'string' || !TOKEN_RE.test(id) || seen.has(id)) continue;
    if (typeof name !== 'string') continue;
    const clean = name.replace(/[\x00-\x1F\x7F]/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    if (!clean) continue;
    seen.add(id);
    out.push({ id, name: clean });
  }
  return out;
}

const ANNOUNCE_INTERVAL_MS = 45_000; // comfortably inside the server's 90s TTL
const ACK_TIMEOUT_MS = 8000;

type ChangeListener = (devices: NearbyDevice[], selfToken: string | null) => void;
export interface IncomingInvitation { from: string; name: string }
export interface InviteResult { accepted: boolean; roomId?: string; secret?: string }
type InvitationListener = (inv: IncomingInvitation) => void;
type InviteResultListener = (r: InviteResult) => void;

export class NearbyPresence {
  private socket: SignalingSocket | null = null;
  private name = '';
  private selfToken: string | null = null;
  private devices: NearbyDevice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<ChangeListener>();
  private invitationListeners = new Set<InvitationListener>();
  private resultListeners = new Set<InviteResultListener>();
  private unsupported = false; // transport rejected presence events (Cloudflare)
  private announcedOnce = false;

  /** Register on the shared signaling socket. Only the LANDING state should
   *  call this — a seated device withdraws instead (see `stop`). */
  attach(socket: SignalingSocket, name: string): void {
    if (this.socket === socket && this.name === name) return;
    this.detach();
    this.socket = socket;
    this.name = name;
    socket.on('presence_list', this.onList);
    socket.on('presence_invitation', this.handleIncoming);
    socket.on('presence_invite_result', this.handleResult);
    socket.on('disconnect', this.onDown);
    socket.on('connect', this.onUp);
    if (socket.connected) void this.announce();
  }

  /** Leave the pool (state moved into a room / component unmounted). */
  stop(socket: SignalingSocket): void {
    this.clearTimer();
    try { socket.emit('presence_withdraw'); } catch { /* best effort */ }
    this.detach();
    this.devices = [];
    this.selfToken = null;
    this.emit();
  }

  subscribe(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    fn(this.devices, this.selfToken);
    return () => this.listeners.delete(fn);
  }

  /** Incoming invitation from another nearby device (validated). */
  onInvitation(fn: InvitationListener): () => void {
    this.invitationListeners.add(fn);
    return () => this.invitationListeners.delete(fn);
  }

  /** Delivery receipt for OUR invitation: accepted (with room credentials)
   *  or declined/gone. */
  onInviteResult(fn: InviteResultListener): () => void {
    this.resultListeners.add(fn);
    return () => this.resultListeners.delete(fn);
  }

  /** Server-relayed invitation to the selected device. */
  invite(deviceToken: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket || this.unsupported) return resolve(false);
      const timer = setTimeout(() => resolve(false), ACK_TIMEOUT_MS);
      try {
        socket.emit('presence_invite', { deviceId: deviceToken }, (res: { success?: boolean }) => {
          clearTimeout(timer);
          resolve(res?.success === true);
        });
      } catch {
        clearTimeout(timer);
        resolve(false);
      }
    });
  }

  /** The invitee's answer; on accept the invitee's client passes the fresh
   *  roomId+secret it just created, which the server relays to the inviter. */
  answerInvite(to: string, accepted: boolean, room?: { roomId: string; secret: string }): void {
    const socket = this.socket;
    if (!socket) return;
    try {
      socket.emit('presence_invite_result', { to, accepted, ...(accepted && room ? room : {}) });
    } catch { /* best effort */ }
  }

  private detach(): void {
    const socket = this.socket;
    this.clearTimer();
    if (!socket) return;
    socket.off('presence_list', this.onList);
    socket.off('presence_invitation', this.handleIncoming);
    socket.off('presence_invite_result', this.handleResult);
    socket.off('disconnect', this.onDown);
    socket.off('connect', this.onUp);
    this.socket = null;
    this.announcedOnce = false;
  }

  private handleIncoming = (payload: unknown): void => {
    const p = payload as { from?: unknown; name?: unknown } | null;
    if (!p || typeof p.from !== 'string' || !TOKEN_RE.test(p.from) || typeof p.name !== 'string') return;
    const name = p.name.replace(/[\x00-\x1F\x7F]/g, '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
    if (!name) return;
    for (const fn of this.invitationListeners) fn({ from: p.from, name });
  };

  private handleResult = (payload: unknown): void => {
    const p = payload as { accepted?: unknown; roomId?: unknown; secret?: unknown } | null;
    if (!p || typeof p.accepted !== 'boolean') return;
    const r: InviteResult = { accepted: p.accepted };
    if (p.accepted) {
      if (typeof p.roomId !== 'string' || typeof p.secret !== 'string') return;
      r.roomId = p.roomId;
      r.secret = p.secret;
    }
    for (const fn of this.resultListeners) fn(r);
  };

  private onList = (payload: unknown): void => {
    const devices = parsePresenceList(payload);
    // Prune our own token out of the visible list — a device never pairs with
    // itself, and the hint line stays honest while we're in the pool.
    this.devices = this.selfToken ? devices.filter(d => d.id !== this.selfToken) : devices;
    this.emit();
  };

  private onDown = (): void => {
    // The server withdraws us on disconnect; local list goes stale-fast.
    this.clearTimer();
    this.selfToken = null;
    this.devices = [];
    this.emit();
  };

  private onUp = (): void => {
    if (!this.unsupported) void this.announce();
  };

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private scheduleKeepalive(): void {
    this.clearTimer();
    this.timer = setInterval(() => { if (!this.unsupported) void this.announce(); }, ANNOUNCE_INTERVAL_MS);
  }

  private async announce(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ACK_TIMEOUT_MS);
      try {
        socket.emit('presence_announce', { deviceId: getOrCreateDeviceId(), name: this.name }, (res: { success?: boolean; ok?: boolean; token?: string; error?: string; code?: string }) => {
          clearTimeout(timer);
          // The Cloudflare transport answers unknown events with an ackErr
          // ({ ok:false, code:'INVALID_MESSAGE' }) — mark the feature
          // unsupported once and stop announcing entirely.
          if (res && res.ok === false && res.code === 'INVALID_MESSAGE') {
            this.markUnsupported();
            resolve();
            return;
          }
          if (res?.success && res.token) {
            if (!this.announcedOnce) {
              this.announcedOnce = true;
              diag('presence.announce', true);
              devLog('presence announced');
            }
            this.selfToken = res.token;
            this.scheduleKeepalive();
          } else if (!res?.success) {
            // e.g. "In a room" — drop out of the pool quietly.
            this.selfToken = null;
            this.clearTimer();
          }
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Transport doesn't speak presence (unknown event → error ack / timeout). */
  markUnsupported(): void {
    this.unsupported = true;
    this.clearTimer();
    this.selfToken = null;
    this.devices = [];
    this.emit();
  }

  isSupported(): boolean {
    return !this.unsupported;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.devices, this.selfToken);
  }
}

/** App-wide singleton: one presence lifecycle for the whole tab. */
export const nearbyPresence = new NearbyPresence();
