import { DurableObject } from 'cloudflare:workers';
import { validateTOTP, base32Encode } from './totp';
import { json, dayKey, type Env } from './types';

/**
 * Room — one Durable Object per temporary room. Coordinates exactly two peers:
 * pairing (create / code / link / resume), WebRTC signaling relay, an
 * encrypted-message relay fallback, presence, and expiry. Uses the WebSocket
 * Hibernation API (sockets tagged with their connection id) so idle rooms cost
 * nothing on the free plan. Payloads are capped; the relay path only ever
 * forwards client-side AES-GCM ciphertext.
 */

export const ROOM_TTL = 12 * 60 * 60 * 1000;       // idle rooms expire after 12h
export const ROOM_EMPTY_TTL = 4 * 60 * 60 * 1000;  // rejoinable 4h after both peers leave
const SIGNAL_MAX = 64 * 1024;                      // SDP offers/answers are a few KB
const RELAY_TEXT_MAX = 512 * 1024;
const RELAY_BIN_MAX = 128 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RoomState {
  roomId: string;
  secret: string;
  createdAt: number;
  lastActive: number;
  expiresAt: number;
  peerA: string | null; // connection ids (cid)
  peerB: string | null;
}

interface ConnMeta {
  roomId: string | null;
}

function log(...parts: unknown[]) {
  console.log('[ShareText-cf]', ...parts);
}

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  /** Lazily-loaded connection records (cid → meta); survives per-wake via storage. */
  private conns: Map<string, ConnMeta> | null = null;
  /** The room id from the connection URL — the DO is keyed by it. */
  private urlRoomId: string | null = null;

  // ---- connection lifecycle ----------------------------------------------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected websocket upgrade' }, 400);
    }
    const url = new URL(request.url);
    this.urlRoomId = url.searchParams.get('room');
    const cid = url.searchParams.get('cid') ?? crypto.randomUUID();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [cid]);
    await this.ctx.storage.put('conn:' + cid, { roomId: null } satisfies ConnMeta);
    await this.ensureConns();
    this.conns!.set(cid, { roomId: null });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async ensureConns(): Promise<Map<string, ConnMeta>> {
    if (!this.conns) {
      const list = await this.ctx.storage.list<ConnMeta>({ prefix: 'conn:' });
      this.conns = new Map([...list.entries()].map(([k, v]) => [k.slice(5), v]));
    }
    return this.conns;
  }

  private async loadRoom(): Promise<RoomState | null> {
    if (!this.room) this.room = (await this.ctx.storage.get<RoomState>('room')) ?? null;
    return this.room;
  }

  /** Map a live WebSocket back to its connection id via its acceptance tag. */
  private async cidOf(ws: WebSocket): Promise<string | null> {
    const conns = await this.ensureConns();
    for (const cid of conns.keys()) {
      if (this.ctx.getWebSockets(cid).includes(ws)) return cid;
    }
    return null;
  }

  private async dropConn(cid: string) {
    await this.ensureConns();
    this.conns!.delete(cid);
    await this.ctx.storage.delete('conn:' + cid);
  }

  // ---- helpers -----------------------------------------------------------

  private async livePeers(): Promise<string[]> {
    const r = await this.loadRoom();
    if (!r) return [];
    const live: string[] = [];
    for (const cid of [r.peerA, r.peerB]) {
      if (cid && this.ctx.getWebSockets(cid)[0]?.readyState === 1) live.push(cid);
    }
    return live;
  }

  private async memberOf(cid: string): Promise<boolean> {
    const r = await this.loadRoom();
    return !!r && (r.peerA === cid || r.peerB === cid);
  }

  private otherOf(cid: string): string | null {
    const r = this.room;
    if (!r) return null;
    if (r.peerA === cid) return r.peerB;
    if (r.peerB === cid) return r.peerA;
    return null;
  }

  private async sendTo(cid: string, msg: unknown) {
    const ws = this.ctx.getWebSockets(cid)[0];
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  private async notifyOthers(selfCid: string, event: string, payload: unknown) {
    const conns = await this.ensureConns();
    for (const cid of conns.keys()) {
      if (cid === selfCid) continue;
      const ws = this.ctx.getWebSockets(cid)[0];
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'event', event, payload }));
    }
  }

  /** Seat a connection into a free (or dead) slot; 'full' when both are live. */
  private async assignSlot(cid: string): Promise<'A' | 'B' | 'full'> {
    const r = this.room;
    if (!r) return 'full';
    const live = await this.livePeers();
    if (r.peerA === cid || r.peerB === cid) return r.peerA === cid ? 'A' : 'B';
    if (live.length >= 2) return 'full';
    if (!r.peerA || !live.includes(r.peerA)) {
      r.peerA = cid;
      return 'A';
    }
    r.peerB = cid;
    return 'B';
  }

  private async touch() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    r.lastActive = now;
    r.expiresAt = now + ROOM_TTL;
    await this.ctx.storage.put('room', r);
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm || alarm < r.expiresAt) await this.ctx.storage.setAlarm(r.expiresAt);
  }

  private async registerInRegistry(r: RoomState) {
    try {
      const stub = this.env.REGISTRY.get(this.env.REGISTRY.idFromName('registry-' + dayKey(r.createdAt)));
      await stub.fetch(
        new Request('https://internal/register', {
          method: 'POST',
          body: JSON.stringify({ roomId: r.roomId, secret: r.secret, expiresAt: r.expiresAt }),
        })
      );
    } catch (e) {
      log('registry register failed', r.roomId.slice(0, 8));
    }
  }

  private async destroyRoom(reason: string) {
    // room_closed goes to every live socket, then they all close.
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ type: 'event', event: 'room_closed', payload: { reason } })); } catch { /* noop */ }
      }
      try { ws.close(1000, 'room_closed'); } catch { /* noop */ }
    }
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  // ---- messages ----------------------------------------------------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const cid = await this.cidOf(ws);
    if (!cid) return;
    await this.loadRoom();

    // Binary frames are relay data from a member (already encrypted client-side).
    if (typeof message !== 'string') {
      if (message.byteLength > RELAY_BIN_MAX) return;
      if (!(await this.memberOf(cid))) return;
      await this.touch();
      const other = this.otherOf(cid);
      if (other) {
        const ws2 = this.ctx.getWebSockets(other)[0];
        if (ws2 && ws2.readyState === 1) ws2.send(message);
      }
      return;
    }

    let msg: { id?: string; event?: string; payload?: any };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }
    if (!msg || typeof msg.event !== 'string') return;
    const { id, event, payload } = msg;

    switch (event) {
      case 'create_room':
        return this.handleCreate(cid, id);
      case 'join_with_code':
        return this.handleJoinWithCode(cid, id, payload);
      case 'join_with_link':
        return this.handleJoinWithLink(cid, id, payload);
      case 'resume_room':
        return this.handleResume(cid, id, payload);
      case 'signal':
        return this.handleSignal(cid, id, payload);
      case 'relay_message':
        return this.handleRelayText(cid, id, payload);
      case 'close_room':
        return this.handleClose(cid);
      default:
        return;
    }
  }

  async webSocketClose(ws: WebSocket) {
    const cid = await this.cidOf(ws);
    await this.loadRoom();
    const r = this.room;
    if (!cid) return;
    if (!r) {
      await this.dropConn(cid);
      return;
    }
    if (r.peerA === cid) r.peerA = null;
    if (r.peerB === cid) r.peerB = null;
    r.lastActive = Date.now();
    await this.ctx.storage.put('room', r);
    await this.dropConn(cid);

    await this.notifyOthers(cid, 'peer_disconnected', {
      peerId: cid,
      remaining: (await this.livePeers()).length,
    });

    const live = await this.livePeers();
    if (live.length === 0) {
      const alarm = await this.ctx.storage.getAlarm();
      const emptyAt = Date.now() + ROOM_EMPTY_TTL;
      if (!alarm || alarm > emptyAt) await this.ctx.storage.setAlarm(emptyAt);
    }
    log('peer disconnected', cid.slice(0, 8), 'remaining', live.length);
  }

  async alarm() {
    const r = await this.loadRoom();
    if (!r) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const now = Date.now();
    const live = await this.livePeers();
    const idleExpired = now - r.lastActive > ROOM_TTL;
    if (live.length === 0 || idleExpired) {
      if (live.length > 0) await this.destroyRoom('idle_timeout');
      else await this.ctx.storage.deleteAll();
      this.room = null;
      log('room expired', r.roomId.slice(0, 8));
    } else {
      // Activity happened since the alarm was armed — extend.
      await this.ctx.storage.setAlarm(now + ROOM_TTL);
    }
  }

  // ---- handlers ----------------------------------------------------------

  private async handleCreate(cid: string, id?: string) {
    const r = await this.loadRoom();
    if (r) return this.ack(cid, id, false, 'Room already exists');
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(16)));
    const roomId = this.urlRoomId ?? crypto.randomUUID();
    const now = Date.now();
    this.room = {
      roomId,
      secret,
      createdAt: now,
      lastActive: now,
      expiresAt: now + ROOM_TTL,
      peerA: cid,
      peerB: null,
    };
    await this.ctx.storage.put('room', this.room);
    await this.ensureConns();
    this.conns!.set(cid, { roomId });
    await this.ctx.storage.put('conn:' + cid, { roomId });
    await this.ctx.storage.setAlarm(this.room.expiresAt);
    await this.registerInRegistry(this.room);
    log('room created', roomId.slice(0, 8));
    this.ack(cid, id, true, { roomId, secret });
  }

  private async handleJoinWithCode(cid: string, id?: string, payload?: { code?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.peerA === cid || r.peerB === cid) {
      return this.ack(cid, id, false, 'Invalid or expired code');
    }
    const code = payload?.code;
    if (typeof code !== 'string' || !(await validateTOTP(r.secret, code))) {
      return this.ack(cid, id, false, 'Invalid or expired code');
    }
    const slot = await this.assignSlot(cid);
    if (slot === 'full') return this.ack(cid, id, false, 'This session already has two devices.');
    await this.completeJoin(cid, id);
  }

  private async handleJoinWithLink(cid: string, id?: string, payload?: { secret?: unknown }) {
    const r = await this.loadRoom();
    if (!r) return this.ack(cid, id, false, 'Session expired');
    if (payload?.secret && payload.secret !== r.secret) {
      return this.ack(cid, id, false, 'Invalid session');
    }
    if (r.peerA === cid || r.peerB === cid) {
      return this.ack(cid, id, true, { roomId: r.roomId, secret: r.secret });
    }
    const slot = await this.assignSlot(cid);
    if (slot === 'full') return this.ack(cid, id, false, 'This session already has two devices.');
    await this.completeJoin(cid, id);
  }

  private async handleResume(cid: string, id?: string, payload?: { secret?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.secret !== payload?.secret) {
      return this.ack(cid, id, false, 'Session expired');
    }
    if (r.peerA === cid || r.peerB === cid) {
      return this.ack(cid, id, true, { roomId: r.roomId, secret: r.secret });
    }
    // Drop stale seats whose sockets are gone so the returning device can sit.
    const live = await this.livePeers();
    if (r.peerA && !live.includes(r.peerA)) r.peerA = null;
    if (r.peerB && !live.includes(r.peerB)) r.peerB = null;
    await this.ctx.storage.put('room', r);
    const slot = await this.assignSlot(cid);
    if (slot === 'full') return this.ack(cid, id, false, 'This session already has two devices.');
    await this.completeJoin(cid, id);
  }

  private async completeJoin(cid: string, id?: string) {
    const r = this.room!;
    await this.ensureConns();
    this.conns!.set(cid, { roomId: r.roomId });
    await this.ctx.storage.put('conn:' + cid, { roomId: r.roomId });
    await this.touch();
    await this.notifyOthers(cid, 'peer_joined', { peerId: cid });
    log('peer joined', r.roomId.slice(0, 8), cid.slice(0, 8));
    this.ack(cid, id, true, { roomId: r.roomId, secret: r.secret });
  }

  private async handleSignal(cid: string, _id: string | undefined, payload?: { to?: unknown; signal?: unknown }) {
    if (!(await this.memberOf(cid))) return;
    const signal = payload?.signal;
    if (!signal || typeof signal !== 'object') return;
    if (JSON.stringify(signal).length > SIGNAL_MAX) return;
    await this.touch();
    const to = payload?.to;
    const msg = { type: 'event' as const, event: 'signal', payload: { from: cid, signal } };
    if (typeof to === 'string' && to !== cid) {
      await this.sendTo(to, msg);
    } else {
      await this.notifyOthers(cid, 'signal', { from: cid, signal });
    }
  }

  private async handleRelayText(cid: string, _id: string | undefined, payload?: { data?: unknown }) {
    if (!(await this.memberOf(cid))) return;
    const data = payload?.data;
    if (typeof data !== 'string' || data.length > RELAY_TEXT_MAX) return;
    await this.touch();
    await this.notifyOthers(cid, 'relay_message', { data });
  }

  private async handleClose(cid: string) {
    if (!(await this.memberOf(cid))) return;
    log('room closed manually', this.room?.roomId.slice(0, 8));
    await this.destroyRoom('manual_close');
  }

  private ack(cid: string, id: string | undefined, ok: boolean, result?: Record<string, unknown> | string) {
    if (!id) return;
    const msg =
      typeof result === 'string'
        ? { type: 'ack', id, ok: false, error: result }
        : { type: 'ack', id, ok, ...(ok ? result : { error: result?.error ?? 'Something went wrong' }) };
    const ws = this.ctx.getWebSockets(cid)[0];
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
}

export { UUID_RE };
