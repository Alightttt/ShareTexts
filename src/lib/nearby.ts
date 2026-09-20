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

/** Nearby visibility — the user's own discoverability switch (default ON:
 *  "Visible while ShareTexts is open", which is privacy-friendly by design —
 *  close the tab and the announce loop dies with it, so the server's TTL
 *  silently expires the entry). Hidden means this device never announces:
 *  it can still SEE others and invite them, it just can't be found. */
const PRESENCE_HIDDEN_KEY = 'sharetext.presenceHidden.v1';

export function isPresenceHidden(): boolean {
  try { return localStorage.getItem(PRESENCE_HIDDEN_KEY) === '1'; } catch { return false; }
}

export function setPresenceHidden(v: boolean): void {
  try { localStorage.setItem(PRESENCE_HIDDEN_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

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
  /** List broadcast that arrived before our announce ack (server broadcasts
   *  the newcomer immediately — before the ack can set selfToken). Held here
   *  and re-filtered the moment the token lands, so our own row can never
   *  render. */
  private pendingList: NearbyDevice[] | null = null;
  private devices: NearbyDevice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<ChangeListener>();
  private invitationListeners = new Set<InvitationListener>();
  private resultListeners = new Set<InviteResultListener>();
  private unsupported = false; // transport rejected presence events (Cloudflare)
  private announcedOnce = false;

  /** True while this device is in the presence pool (landing, announcing). */
  isActive(): boolean {
    return this.socket !== null && !this.unsupported;
  }

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
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
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
    this.pendingList = null;
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
    if (!this.selfToken) {
      // Pre-ack broadcast: stash instead of showing (we can't yet tell which
      // row is us). announce() re-runs this the instant the token arrives.
      this.pendingList = devices;
      return;
    }
    this.pendingList = null;
    this.devices = devices.filter(d => d.id !== this.selfToken);
    this.emit();
  };

  private onDown = (): void => {
    // The server withdraws us on disconnect; local list goes stale-fast.
    this.clearTimer();
    this.selfToken = null;
    this.pendingList = null;
    this.devices = [];
    this.emit();
  };

  private onUp = (): void => {
    if (!this.unsupported) void this.announce();
  };

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private announceRetries = 0;
  /** Quick bounded retry after a failed announce (transport couldn't dial
   *  the lobby). 3s→6s→12s→15s cap; resets on success. This is what turns a
   *  stale-worker boot into a self-heal in seconds instead of waiting for
   *  the 45s keepalive. */
  private scheduleAnnounceRetry(): void {
    if (this.retryTimer) return;
    const delay = Math.min(3000 * 2 ** this.announceRetries, 15000);
    this.announceRetries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.socket && !isPresenceHidden()) void this.announce();
    }, delay);
  }

  private scheduleKeepalive(): void {
    this.clearTimer();
    this.timer = setInterval(() => { if (!this.unsupported) void this.announce(); }, ANNOUNCE_INTERVAL_MS);
  }

  private async announce(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    // The user asked to be Hidden: never announce. If a keepalive fires
    // after the flag flipped, withdraw so the server's TTL drops us fast.
    if (isPresenceHidden()) {
      this.selfToken = null;
      this.clearTimer();
      try { socket.emit('presence_withdraw'); } catch { /* best effort */ }
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ACK_TIMEOUT_MS);
      try {
        socket.emit('presence_announce', { deviceId: getOrCreateDeviceId(), name: this.name }, (res: { success?: boolean; ok?: boolean; token?: string; error?: string; code?: string }) => {
          clearTimeout(timer);
          if (res?.success && res.token) {
            if (!this.announcedOnce) {
              this.announcedOnce = true;
              diag('presence.announce', true);
              devLog('presence announced');
            }
            this.announceRetries = 0;
            this.selfToken = res.token;
            // A list broadcast may have raced ahead of this ack — filter it now.
            if (this.pendingList) {
              const pending = this.pendingList;
              this.pendingList = null;
              this.onList(pending);
            }
            this.scheduleKeepalive();
          } else if (!res?.success) {
            // Server answered: "In a room" etc. — drop out of the pool
            // quietly. UNREACHABLE is different: the LOBBY DIAL itself failed
            // (stale/down worker). Retry quickly with backoff — two dial
            // failures also trip the transport's health callback, which
            // re-probes the endpoints and retargets to a live worker.
            this.selfToken = null;
            if ((res as { code?: string })?.code === 'UNREACHABLE') this.scheduleAnnounceRetry();
            else this.clearTimer();
          }
          resolve();
        });
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Kept for API compatibility; presence now retries on every keepalive
   *  instead of latching off after one failure. */
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

  /** This device's presence token (null before the announce ack, or when
   *  hidden/withdrawn). The auto-connect tiebreak compares tokens to pick
   *  exactly one inviter out of a mutual-invite race. */
  getSelfToken(): string | null {
    return this.selfToken;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.devices, this.selfToken);
  }
}

/** App-wide singleton: one presence lifecycle for the whole tab. */
export const nearbyPresence = new NearbyPresence();
