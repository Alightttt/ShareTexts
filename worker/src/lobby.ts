import { DurableObject } from 'cloudflare:workers';
import { type Env } from './types';

/**
 * Lobby — the landing-page presence pool for the Cloudflare transport.
 *
 * Devices that are merely OPEN on ShareTexts (not seated in a room) connect
 * here on a second, tiny WebSocket and announce themselves so other nearby
 * devices can offer a one-tap connect. This mirrors the socket.io server's
 * presence pool (see server.ts) with the same privacy rules:
 *
 *   · entries are EPHEMERAL — they expire PRESENCE_TTL after the last
 *     keepalive announce, and expiry/withdrawal/close are broadcast;
 *   · browsers never see IPs or permanent identifiers: each device gets a
 *     rotating opaque token (sha256(deviceId + salt)); the deviceId itself
 *     never leaves the server;
 *   · discovery ≠ connection — selecting a device only relays an INVITATION
 *     which the other user must accept; acceptance carries the invitee's own
 *     fresh roomId+secret and is relayed point-to-point, so the actual
 *     connection always flows through the EXISTING create/join room path;
 *   · pool is capped — this is a pairing lobby, not a directory.
 *
 * One DO instance serves the whole deployment (idFromName('lobby')): presence
 * is a handful of tiny JSON frames every ~45s per device, far below any DO
 * limit for realistic landing-page concurrency.
 */

const PRESENCE_TTL = 90_000;        // dies after 90s without a keepalive announce
const PRESENCE_SWEEP_MS = 30_000;   // sweep cadence (also expires + broadcasts removals)
const PRESENCE_MAX_DEVICES = 24;    // pool cap
const PRESENCE_NAME_MAX = 32;
const SECRET_MAX = 64;
const SECRET_MIN = 16;
const BROADCAST_COALESCE_MS = 500;  // coalesce list broadcasts (no per-announce spam)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{32}$/;

interface LobbyEntry {
  cid: string;          // live lobby WebSocket tag
  name: string;
  token: string;        // what other devices see — never the deviceId
  announcedAt: number;
}

interface LobbyConnMeta {
  deviceId: string | null; // set once the socket announces
}

interface WireMsg {
  v?: unknown;
  id?: string;
  event?: string;
  payload?: any;
}

/** Strip control chars and angle brackets; collapse whitespace; cap length. */
function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, PRESENCE_NAME_MAX);
  return clean || 'Unnamed device';
}

export class Lobby extends DurableObject<Env> {
  /** Per-DO salt so tokens can't be precomputed; persisted so tokens stay
   *  stable across DO restarts within a pool lifetime (clients re-announce
   *  anyway, so rotation here is harmless). */
  private salt: string | null = null;
  private conns: Map<string, LobbyConnMeta> | null = null;
  private broadcastTimer: number | ReturnType<typeof setTimeout> | null = null;

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response(JSON.stringify({ error: 'expected websocket upgrade' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const url = new URL(request.url);
    const cid = url.searchParams.get('cid') ?? crypto.randomUUID();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [cid]);
    await this.ensureConns();
    this.conns!.set(cid, { deviceId: null });
    await this.ctx.storage.put('conn:' + cid, { deviceId: null } satisfies LobbyConnMeta);
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async ensureConns(): Promise<Map<string, LobbyConnMeta>> {
    if (!this.conns) {
      const list = await this.ctx.storage.list<LobbyConnMeta>({ prefix: 'conn:' });
      this.conns = new Map([...list.entries()].map(([k, v]) => [k.slice(5), v]));
    }
    return this.conns;
  }

  private async ensureSalt(): Promise<string> {
    if (this.salt) return this.salt;
    let salt = await this.ctx.storage.get<string>('salt');
    if (!salt) {
      salt = crypto.randomUUID() + crypto.randomUUID();
      await this.ctx.storage.put('salt', salt);
    }
    this.salt = salt;
    return salt;
  }

  private async tokenFor(deviceId: string): Promise<string> {
    const salt = await this.ensureSalt();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId + salt));
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < 16; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex; // 32 hex chars — same shape as the socket.io server's tokens
  }

  private async cidOf(ws: WebSocket): Promise<string | null> {
    const conns = await this.ensureConns();
    for (const cid of conns.keys()) {
      if (this.ctx.getWebSockets(cid).includes(ws)) return cid;
    }
    return null;
  }

  private sendTo(cid: string, msg: unknown) {
    const ws = this.ctx.getWebSockets(cid)[0];
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  private ackOk(cid: string, id: string | undefined, data: Record<string, unknown>) {
    if (!id) return;
    this.sendTo(cid, { type: 'ack', id, ok: true, ...data });
  }

  private ackErr(cid: string, id: string | undefined, code: string, message: string) {
    if (!id) return;
    this.sendTo(cid, { type: 'ack', id, ok: false, code, message });
  }

  /** Push the current device list to every live lobby socket. Coalesced. */
  private scheduleBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.broadcastNow();
    }, BROADCAST_COALESCE_MS);
  }

  private async broadcastNow() {
    const list = await this.deviceList();
    const frame = JSON.stringify({ type: 'event', event: 'presence_list', payload: { devices: list } });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) {
        try { ws.send(frame); } catch { /* noop */ }
      }
    }
  }

  private async deviceList(): Promise<Array<{ id: string; name: string }>> {
    const entries = await this.ctx.storage.list<LobbyEntry>({ prefix: 'dev:' });
    return [...entries.values()]
      .sort((a, b) => a.announcedAt - b.announcedAt)
      .slice(0, PRESENCE_MAX_DEVICES)
      .map(e => ({ id: e.token, name: e.name }));
  }

  private async ensureAlarm() {
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > Date.now() + PRESENCE_SWEEP_MS) {
      await this.ctx.storage.setAlarm(Date.now() + PRESENCE_SWEEP_MS);
    }
  }

  // ---- wire protocol ------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return; // lobby speaks JSON only
    const cid = await this.cidOf(ws);
    if (!cid) return;

    let msg: WireMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return this.pushError(ws, 'INVALID_MESSAGE', 'Malformed message.');
    }
    if (msg.v !== 1) {
      return this.ackErr(cid, msg.id, 'UNSUPPORTED_VERSION', 'This app is out of date. Refresh to continue.');
    }

    switch (msg.event) {
      case 'presence_announce':
        return this.handleAnnounce(cid, msg.id, msg.payload);
      case 'presence_withdraw':
        return this.handleWithdraw(cid, msg.id);
      case 'presence_update':
        return this.handleUpdate(cid, msg.id, msg.payload);
      case 'presence_invite':
        return this.handleInvite(cid, msg.id, msg.payload);
      case 'presence_invite_result':
        return this.handleInviteResult(cid, msg.id, msg.payload);
      default:
        return this.ackErr(cid, msg.id, 'INVALID_MESSAGE', 'Unknown message type.');
    }
  }

  private async handleAnnounce(cid: string, id: string | undefined, payload: any) {
    const deviceId = payload?.deviceId;
    if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId)) {
      return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Invalid deviceId');
    }
    const name = sanitizeName(payload?.name);
    const now = Date.now();

    const conns = await this.ensureConns();

    // Same device re-announcing from a fresh socket (refresh): retire the old
    // socket's claim so there is exactly one entry per device.
    const oldEntry = await this.ctx.storage.get<LobbyEntry>('dev:' + deviceId);
    if (oldEntry && oldEntry.cid !== cid) {
      conns.delete(oldEntry.cid);
      await this.ctx.storage.delete('conn:' + oldEntry.cid);
    }

    // Pool cap — a pairing lobby, not a directory.
    if (!oldEntry) {
      const entries = await this.ctx.storage.list<LobbyEntry>({ prefix: 'dev:' });
      if (entries.size >= PRESENCE_MAX_DEVICES) {
        return this.ackErr(cid, id, 'LOBBY_FULL', 'Too many devices nearby right now.');
      }
    }

    const token = await this.tokenFor(deviceId);
    await this.ctx.storage.put('dev:' + deviceId, { cid, name, token, announcedAt: now } satisfies LobbyEntry);
    conns.set(cid, { deviceId });
    await this.ctx.storage.put('conn:' + cid, { deviceId } satisfies LobbyConnMeta);
    await this.ensureAlarm();
    this.ackOk(cid, id, { success: true, token });
    this.scheduleBroadcast();
  }

  private async entryForCid(cid: string): Promise<{ deviceId: string; entry: LobbyEntry } | null> {
    const conns = await this.ensureConns();
    const deviceId = conns.get(cid)?.deviceId;
    if (!deviceId) return null;
    const entry = await this.ctx.storage.get<LobbyEntry>('dev:' + deviceId);
    if (!entry || entry.cid !== cid) return null;
    return { deviceId, entry };
  }

  private async removeDevice(deviceId: string) {
    const entry = await this.ctx.storage.get<LobbyEntry>('dev:' + deviceId);
    await this.ctx.storage.delete('dev:' + deviceId);
    if (entry) {
      const conns = await this.ensureConns();
      if (conns.get(entry.cid)?.deviceId === deviceId) {
        conns.delete(entry.cid);
        await this.ctx.storage.delete('conn:' + entry.cid);
      }
    }
  }

  private async handleWithdraw(cid: string, id: string | undefined) {
    const found = await this.entryForCid(cid);
    if (found) {
      await this.removeDevice(found.deviceId);
      this.scheduleBroadcast();
    }
    this.ackOk(cid, id, { success: true });
  }

  private async handleUpdate(cid: string, id: string | undefined, payload: any) {
    const found = await this.entryForCid(cid);
    if (!found) return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Not present');
    const name = sanitizeName(payload?.name);
    if (name !== found.entry.name) {
      found.entry.name = name;
      await this.ctx.storage.put('dev:' + found.deviceId, found.entry);
      this.scheduleBroadcast();
    }
    this.ackOk(cid, id, { success: true });
  }

  /** The inviter says WHICH token; we forward the invitation to that device. */
  private async handleInvite(cid: string, id: string | undefined, payload: any) {
    const from = await this.entryForCid(cid);
    if (!from) return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Not present');
    const targetToken = payload?.deviceId;
    if (typeof targetToken !== 'string' || !TOKEN_RE.test(targetToken)) {
      return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Invalid deviceId');
    }
    if (targetToken === from.entry.token) {
      return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Invalid deviceId');
    }
    const entries = await this.ctx.storage.list<LobbyEntry>({ prefix: 'dev:' });
    const target = [...entries.values()].find(e => e.token === targetToken);
    if (!target || this.ctx.getWebSockets(target.cid)[0]?.readyState !== 1) {
      return this.ackErr(cid, id, 'DEVICE_GONE', 'Device no longer available');
    }
    this.sendTo(target.cid, { type: 'event', event: 'presence_invitation', payload: { from: from.entry.token, name: from.entry.name } });
    this.ackOk(cid, id, { success: true });
  }

  /**
   * The invitee's answer. On accept the invitee's client has ALREADY created
   * a fresh room and passes its roomId+secret; we relay those to the inviter
   * only. The inviter then runs the ordinary join_with_link path — the room
   * credentials originate from the accepting device's own create_room.
   */
  private async handleInviteResult(cid: string, id: string | undefined, payload: any) {
    const from = await this.entryForCid(cid);
    if (!from) return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Not present');
    const to = payload?.to;
    if (typeof to !== 'string' || !TOKEN_RE.test(to)) {
      return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Invalid target');
    }
    const accepted = payload?.accepted === true;
    let fwd: { accepted: boolean; roomId?: string; secret?: string } = { accepted };
    if (accepted) {
      const roomId = payload?.roomId;
      const secret = payload?.secret;
      if (typeof roomId !== 'string' || !UUID_RE.test(roomId) ||
          typeof secret !== 'string' || secret.length < SECRET_MIN || secret.length > SECRET_MAX) {
        return this.ackErr(cid, id, 'INVALID_MESSAGE', 'Invalid room');
      }
      fwd = { accepted: true, roomId, secret };
    }
    const entries = await this.ctx.storage.list<LobbyEntry>({ prefix: 'dev:' });
    const target = [...entries.values()].find(e => e.token === to);
    if (!target || this.ctx.getWebSockets(target.cid)[0]?.readyState !== 1) {
      return this.ackErr(cid, id, 'DEVICE_GONE', 'Device no longer available');
    }
    this.sendTo(target.cid, { type: 'event', event: 'presence_invite_result', payload: fwd });
    this.ackOk(cid, id, { success: true });
  }

  private pushError(ws: WebSocket, code: string, message: string) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', code, message }));
  }

  // ---- lifecycle ----------------------------------------------------------

  async webSocketClose(ws: WebSocket) {
    const cid = await this.cidOf(ws);
    if (!cid) return;
    const conns = await this.ensureConns();
    const deviceId = conns.get(cid)?.deviceId;
    conns.delete(cid);
    await this.ctx.storage.delete('conn:' + cid);
    // Only remove the pool entry if this socket still owns it (a refresh may
    // have already handed it to a newer socket).
    if (deviceId) {
      const entry = await this.ctx.storage.get<LobbyEntry>('dev:' + deviceId);
      if (entry && entry.cid === cid) {
        await this.ctx.storage.delete('dev:' + deviceId);
        this.scheduleBroadcast();
      }
    }
  }

  /** Expire stale announcements (tab closed without a close frame, network
   *  blip) and broadcast removals on the sweep cadence. */
  async alarm() {
    const now = Date.now();
    let changed = false;
    const entries = await this.ctx.storage.list<LobbyEntry>({ prefix: 'dev:' });
    for (const [key, entry] of entries) {
      const stale = now - entry.announcedAt > PRESENCE_TTL;
      const socketGone = this.ctx.getWebSockets(entry.cid)[0]?.readyState !== 1;
      if (stale || socketGone) {
        await this.ctx.storage.delete(key);
        const conns = await this.ensureConns();
        if (conns.get(entry.cid)?.deviceId === key.slice(4)) {
          conns.delete(entry.cid);
          await this.ctx.storage.delete('conn:' + entry.cid);
        }
        changed = true;
      }
    }
    // Orphaned connection records (socket died before announcing).
    const conns = await this.ensureConns();
    for (const cid of [...conns.keys()]) {
      if (this.ctx.getWebSockets(cid)[0]?.readyState !== 1) {
        conns.delete(cid);
        await this.ctx.storage.delete('conn:' + cid);
      }
    }
    if (changed) await this.broadcastNow();
    await this.ctx.storage.setAlarm(now + PRESENCE_SWEEP_MS);
  }
}
