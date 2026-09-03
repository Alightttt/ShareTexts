import { DurableObject } from 'cloudflare:workers';
import { validateTOTP, base32Encode } from './totp';
import { json, dayKey, type Env } from './types';

/**
 * Room — one Durable Object per temporary room. Coordinates exactly two peers:
 * pairing (create / code / link / resume), WebRTC signaling relay, an
 * encrypted-message relay fallback, presence, and expiry. Uses the WebSocket
 * Hibernation API (sockets tagged with their connection id) so idle rooms cost
 * nothing on the free plan.
 *
 * The room has an explicit lifecycle state (WAITING → CONNECTED → … → CLOSED),
 * a machine-readable error contract ({code, message} on every ack), protocol
 * versioning, and a per-room wrong-code brute-force limit. Payloads are capped;
 * the relay path only ever forwards client-side AES-GCM ciphertext — the
 * backend stores no message history, files, or transfer contents.
 */

export const ROOM_TTL = 5 * 60 * 60 * 1000;       // idle rooms expire after 5h (resets on any activity)
export const ROOM_EMPTY_TTL = 5 * 60 * 60 * 1000;  // rejoinable while within the 5h idle window
const SIGNAL_MAX = 64 * 1024;                      // SDP offers/answers are a few KB
const RELAY_TEXT_MAX = 512 * 1024;
const RELAY_BIN_MAX = 128 * 1024;
const PUSH_TEXT_MAX = 256 * 1024;                  // agent-push text cap
const PUSH_FILE_MAX = 8 * 1024 * 1024;             // agent-push file cap (raw bytes)
const PUSH_CHUNK = 45 * 1024;                      // raw bytes per base64 push chunk

/** Constant-time string comparison for bearer secrets. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Wire protocol version. Bump on breaking message-shape changes. */
export const PROTOCOL_VERSION = 1;

const CODE_FAIL_MAX = 10;
const CODE_FAIL_WINDOW = 60 * 1000;

/** Explicit room lifecycle. No scattered booleans. */
export type RoomPhase =
  | 'WAITING'      // created, one peer seated
  | 'CONNECTED'    // two peers paired
  | 'TRANSFERRING' // data is moving through this room (relay activity observed)
  | 'DISCONNECTED' // a peer left; rejoin window
  | 'CLOSING'      // manual close in progress
  | 'EXPIRED'      // idle-timeout fired
  | 'CLOSED';      // terminal; storage deleted

interface RoomState {
  roomId: string;
  secret: string;
  state: RoomPhase;
  createdAt: number;
  /** The TOTP anchor. Re-anchored on refresh_code so the creator always sees
   *  a fresh 90s code window on the connect screen; the previous code stays
   *  valid for one more window (±1 validation) so a typing joiner isn't cut off. */
  codeAnchor: number;
  lastActive: number;
  expiresAt: number;
  peerA: string | null; // connection ids (cid)
  peerB: string | null;
  codeFails: number;
  codeFailReset: number;
}

interface ConnMeta {
  roomId: string | null;
}

interface WireMsg {
  v?: unknown;
  id?: string;
  event?: string;
  payload?: any;
}

function log(...parts: unknown[]) {
  console.log('[ShareText-cf]', ...parts);
}

/**
 * Fire an anonymous aggregate metric (best-effort, no payload — see
 * metrics.ts). No-ops when the METRICS binding is absent so the emulator
 * harness and older deploys keep working unchanged.
 */
async function count(env: Env, name: string) {
  try {
    if (!env.METRICS) return;
    const stub = env.METRICS.get(env.METRICS.idFromName('metrics'));
    await stub.fetch(
      new Request('https://internal/event', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
    );
  } catch {
    /* metrics are best-effort */
  }
}

/**
 * Report this room's current seated-peer count to the Stats DO (best-effort,
 * absolute value keyed by room — self-healing, see stats.ts). No-ops when the
 * STATS binding is absent so the emulator harness keeps working unchanged.
 */
async function reportPresence(env: Env, roomId: string, count: number) {
  try {
    if (!env.STATS) return;
    const stub = env.STATS.get(env.STATS.idFromName('stats'));
    await stub.fetch(
      new Request('https://internal/event', {
        method: 'POST',
        body: JSON.stringify({ roomId, count }),
      })
    );
  } catch {
    /* live count is best-effort */
  }
}

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  /** Lazily-loaded connection records (cid → meta); survives per-wake via storage. */
  private conns: Map<string, ConnMeta> | null = null;
  /** The room id from the connection URL — the DO is keyed by it. */
  private urlRoomId: string | null = null;

  // ---- connection lifecycle ----------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Agent push API — an authenticated HTTP request injects a message into
    // this room, fanned out to every live seated device (see handlePush).
    if (url.pathname === '/push' && request.method === 'POST') {
      return this.handlePush(request);
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ error: 'expected websocket upgrade' }, 400);
    }
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

  /** Derive the lifecycle state from live peer count (2/1/0). */
  private async recomputeState() {
    const r = this.room;
    if (!r) return;
    const live = await this.livePeers();
    r.state = live.length >= 2 ? 'CONNECTED' : live.length === 1 ? 'WAITING' : 'DISCONNECTED';
    await this.ctx.storage.put('room', r);
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
          body: JSON.stringify({ roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor, expiresAt: r.expiresAt }),
        })
      );
    } catch {
      log('registry register failed', r.roomId.slice(0, 8));
    }
  }

  private async destroyRoom(reason: 'manual_close' | 'idle_timeout') {
    const r = this.room;
    if (r) {
      r.state = reason === 'idle_timeout' ? 'EXPIRED' : 'CLOSING';
      log('room terminal', r.roomId.slice(0, 8), r.state);
      await count(this.env, 'rooms.closed:' + reason);
      // The room is gone — zero its presence so the live counter can't hold
      // a stale positive for a destroyed room (webSocketClose may race this).
      await reportPresence(this.env, r.roomId, 0);
    }
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

  // ---- wire protocol -----------------------------------------------------

  // Invoked by the runtime on inbound frames (public by contract).
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const cid = await this.cidOf(ws);
    if (!cid) return;
    await this.loadRoom();

    // Binary frames are relay data from a member (already encrypted client-side).
    if (typeof message !== 'string') {
      if (message.byteLength > RELAY_BIN_MAX) return;
      if (!(await this.memberOf(cid))) return;
      await this.touch();
      await this.markTransferring();
      await count(this.env, 'relay.binary_messages');
      const other = this.otherOf(cid);
      if (other) {
        const ws2 = this.ctx.getWebSockets(other)[0];
        if (ws2 && ws2.readyState === 1) ws2.send(message);
      }
      return;
    }

    let msg: WireMsg;
    try {
      msg = JSON.parse(message);
    } catch {
      return this.pushError(ws, 'INVALID_MESSAGE', 'Malformed message.');
    }
    if (!msg || typeof msg !== 'object') {
      return this.pushError(ws, 'INVALID_MESSAGE', 'Malformed message.');
    }
    if (msg.v !== PROTOCOL_VERSION) {
      return this.ackErr(cid, msg.id, 'UNSUPPORTED_VERSION', 'This app is out of date. Refresh to continue.');
    }
    if (typeof msg.event !== 'string') {
      return this.ackErr(cid, msg.id, 'INVALID_MESSAGE', 'Unknown message type.');
    }

    switch (msg.event) {
      case 'create_room':
        return this.handleCreate(cid, msg.id);
      case 'join_with_code':
        return this.handleJoinWithCode(cid, msg.id, msg.payload);
      case 'join_with_link':
        return this.handleJoinWithLink(cid, msg.id, msg.payload);
      case 'resume_room':
        return this.handleResume(cid, msg.id, msg.payload);
      case 'refresh_code':
        return this.handleRefreshCode(cid, msg.id, msg.payload);
      case 'signal':
        return this.handleSignal(cid, msg.id, msg.payload);
      case 'relay_message':
        return this.handleRelayText(cid, msg.id, msg.payload);
      case 'close_room':
        return this.handleClose(cid);
      default:
        return this.ackErr(cid, msg.id, 'INVALID_MESSAGE', 'Unknown message type.');
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
    // Only a seated peer (creator/joiner) counts as a disconnect — a socket
    // that never joined (e.g. a failed code probe) must not disturb the room.
    const wasMember = r.peerA === cid || r.peerB === cid;
    if (r.peerA === cid) r.peerA = null;
    if (r.peerB === cid) r.peerB = null;
    r.lastActive = Date.now();
    await this.ctx.storage.put('room', r);
    await this.dropConn(cid);

    await this.recomputeState();
    if (wasMember) {
      await this.notifyOthers(cid, 'peer_disconnected', {
        peerId: cid,
        remaining: (await this.livePeers()).length,
      });
    }
    if (wasMember) {
      await reportPresence(this.env, r.roomId, (await this.livePeers()).length);
    }

    const live = await this.livePeers();
    if (live.length === 0) {
      const alarm = await this.ctx.storage.getAlarm();
      const emptyAt = Date.now() + ROOM_EMPTY_TTL;
      if (!alarm || alarm > emptyAt) await this.ctx.storage.setAlarm(emptyAt);
    }
    log('peer disconnected', cid.slice(0, 8), 'remaining', live.length, 'state', r.state);
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
    if (r) return this.ackErr(cid, id, 'ROOM_EXISTS', 'This room already exists.');
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(16)));
    const roomId = this.urlRoomId ?? crypto.randomUUID();
    const now = Date.now();
    this.room = {
      roomId,
      secret,
      state: 'WAITING',
      createdAt: now,
      codeAnchor: now,
      lastActive: now,
      expiresAt: now + ROOM_TTL,
      peerA: cid,
      peerB: null,
      codeFails: 0,
      codeFailReset: 0,
    };
    await this.ctx.storage.put('room', this.room);
    await this.ensureConns();
    this.conns!.set(cid, { roomId });
    await this.ctx.storage.put('conn:' + cid, { roomId });
    await this.ctx.storage.setAlarm(this.room.expiresAt);
    await this.registerInRegistry(this.room);
    log('room created', roomId.slice(0, 8), 'WAITING');
    await count(this.env, 'rooms.created');
    await reportPresence(this.env, roomId, (await this.livePeers()).length);
    // createdAt anchors the pairing-code window (90s from room creation).
    this.ackOk(cid, id, { roomId, secret, createdAt: now });
  }

  private async handleJoinWithCode(cid: string, id?: string, payload?: { code?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.peerA === cid || r.peerB === cid) {
      return this.ackErr(cid, id, 'INVALID_CODE', 'Invalid or expired code');
    }
    const code = payload?.code;
    if (typeof code !== 'string') {
      await count(this.env, 'joins.failed:invalid_code');
      return this.ackErr(cid, id, 'INVALID_CODE', 'Invalid or expired code');
    }
    // Per-room brute-force limit on the pairing code.
    const now = Date.now();
    if (r.codeFails >= CODE_FAIL_MAX && now < r.codeFailReset) {
      await count(this.env, 'joins.failed:rate_limited');
      return this.ackErr(cid, id, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.');
    }
    if (!(await validateTOTP(r.secret, code, r.codeAnchor))) {
      if (now >= r.codeFailReset) {
        r.codeFails = 0;
        r.codeFailReset = now + CODE_FAIL_WINDOW;
      }
      r.codeFails++;
      await this.ctx.storage.put('room', r);
      await count(this.env, 'joins.failed:invalid_code');
      return this.ackErr(cid, id, 'INVALID_CODE', 'Invalid or expired code');
    }
    r.codeFails = 0;
    const slot = await this.assignSlot(cid);
    if (slot === 'full') {
      await count(this.env, 'joins.failed:room_full');
      return this.ackErr(cid, id, 'ROOM_FULL', 'This ShareText room is already full.');
    }
    await this.completeJoin(cid, id);
  }

  private async handleJoinWithLink(cid: string, id?: string, payload?: { secret?: unknown }) {
    const r = await this.loadRoom();
    if (!r) {
      await count(this.env, 'joins.failed:session_expired');
      return this.ackErr(cid, id, 'SESSION_EXPIRED', 'This room has expired.');
    }
    if (payload?.secret && payload.secret !== r.secret) {
      await count(this.env, 'joins.failed:invalid_session');
      return this.ackErr(cid, id, 'INVALID_SESSION', 'This room link isn\u2019t valid anymore.');
    }
    if (r.peerA === cid || r.peerB === cid) {
      return this.ackOk(cid, id, { roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor });
    }
    const slot = await this.assignSlot(cid);
    if (slot === 'full') {
      await count(this.env, 'joins.failed:room_full');
      return this.ackErr(cid, id, 'ROOM_FULL', 'This ShareText room is already full.');
    }
    await this.completeJoin(cid, id);
  }

  private async handleResume(cid: string, id?: string, payload?: { secret?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.secret !== payload?.secret) {
      return this.ackErr(cid, id, 'SESSION_EXPIRED', 'This room has expired.');
    }
    if (r.peerA === cid || r.peerB === cid) {
      // The peer's transport came back but it still holds its seat (same
      // connection id). Tell the other device to re-offer WebRTC so the
      // channel — and any interrupted transfer — can resume. Without this
      // the recovering peer waits for an offer that never comes.
      await this.notifyOthers(cid, 'peer_recovered', { peerId: cid });
      return this.ackOk(cid, id, { roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor });
    }
    // Drop stale seats whose sockets are gone so the returning device can sit.
    const live = await this.livePeers();
    if (r.peerA && !live.includes(r.peerA)) r.peerA = null;
    if (r.peerB && !live.includes(r.peerB)) r.peerB = null;
    await this.ctx.storage.put('room', r);
    const slot = await this.assignSlot(cid);
    if (slot === 'full') return this.ackErr(cid, id, 'ROOM_FULL', 'This ShareText room is already full.');
    await this.completeJoin(cid, id);
  }

  private async completeJoin(cid: string, id?: string) {
    const r = this.room!;
    await this.ensureConns();
    this.conns!.set(cid, { roomId: r.roomId });
    await this.ctx.storage.put('conn:' + cid, { roomId: r.roomId });
    await this.touch();
    await this.recomputeState();
    await this.notifyOthers(cid, 'peer_joined', { peerId: cid });
    log('peer joined', r.roomId.slice(0, 8), cid.slice(0, 8), 'state', r.state);
    await count(this.env, 'joins.succeeded');
    await reportPresence(this.env, r.roomId, (await this.livePeers()).length);
    this.ackOk(cid, id, { roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor });
  }

  /**
   * Re-anchor the pairing-code window to now (creator landed on the connect
   * screen). The previous code stays valid for one more 90s window via the
   * ±1 validation window, so a joiner mid-typing still connects. Requires the
   * room secret — only a device that already joined the room can refresh.
   */
  private async handleRefreshCode(cid: string, id?: string, payload?: { secret?: unknown }) {
    const r = await this.loadRoom();
    // The secret is the room credential (128-bit random) — possession of it
    // means the device already joined this room. No seat check on purpose:
    // right after a reload this socket re-joins via resume_room
    // asynchronously, and the creator's code screen must re-anchor first.
    if (!r || r.secret !== payload?.secret) {
      return this.ackErr(cid, id, 'INVALID_SESSION', 'This room isn\u2019t valid anymore.');
    }
    r.codeAnchor = Date.now();
    await this.ctx.storage.put('room', r);
    await this.registerInRegistry(r); // keep the registry's lookup anchor in sync
    await count(this.env, 'rooms.code_refreshed');
    this.ackOk(cid, id, { createdAt: r.codeAnchor });
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
    await this.markTransferring();
    await count(this.env, 'relay.text_messages');
    await this.notifyOthers(cid, 'relay_message', { data });
  }

  private async markTransferring() {
    const r = this.room;
    if (r && r.state === 'CONNECTED') {
      r.state = 'TRANSFERRING';
      await this.ctx.storage.put('room', r);
    }
  }

  private async handleClose(cid: string) {
    if (!(await this.memberOf(cid))) return;
    log('room closed manually', this.room?.roomId.slice(0, 8));
    await this.destroyRoom('manual_close');
  }

  /**
   * Agent push: an authenticated POST (secret in the Authorization header)
   * delivers a text message or a file into this room. The message is sent as
   * one WS frame per base64 chunk (~45KB raw each) so nothing exceeds the 1MB
   * frame cap; the client reassembles. Only live seated peers receive it.
   */
  private async handlePush(request: Request): Promise<Response> {
    const r = await this.loadRoom();
    if (!r) {
      await count(this.env, 'push.failed:not_found');
      return json({ error: 'Room not found — it may have expired.' }, 404);
    }

    const auth = request.headers.get('authorization') || '';
    const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!secret || !timingSafeEqual(secret, r.secret)) {
      await count(this.env, 'push.failed:unauthorized');
      return json({ error: 'Invalid secret. Copy the command from the connect screen.' }, 401);
    }

    let body: { roomId?: unknown; text?: unknown; name?: unknown; mimeType?: unknown; dataBase64?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: 'Bad request' }, 400);
    }
    if (typeof body.roomId !== 'string' || body.roomId !== r.roomId) {
      return json({ error: 'Bad request' }, 400);
    }

    const messageId = crypto.randomUUID();
    const timestamp = Date.now();
    r.lastActive = timestamp;
    r.expiresAt = timestamp + ROOM_TTL;
    await this.ctx.storage.put('room', r);
    const live = await this.livePeers();

    if (typeof body.text === 'string' && body.text.trim().length > 0) {
      const text = body.text.slice(0, PUSH_TEXT_MAX);
      await count(this.env, 'push.text');
      for (const cid of live) {
        await this.sendTo(cid, { type: 'event', event: 'push_message', payload: { id: messageId, kind: 'text', text, timestamp } });
      }
      return json({ ok: true, messageId });
    }

    if (typeof body.dataBase64 !== 'string' || typeof body.name !== 'string') {
      return json({ error: 'Bad request. Send { text } or { name, dataBase64 }.' }, 400);
    }
    let raw: string;
    try {
      raw = atob(body.dataBase64);
    } catch {
      return json({ error: 'Bad request — invalid base64.' }, 400);
    }
    if (raw.length === 0 || raw.length > PUSH_FILE_MAX) {
      return json({ error: 'File must be between 1 byte and 8 MB.' }, 400);
    }
    const chunkCount = Math.ceil(raw.length / PUSH_CHUNK);
    const base = {
      id: messageId,
      kind: 'file',
      name: body.name.slice(0, 200),
      mimeType: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 100) : 'application/octet-stream',
      size: raw.length,
      chunkCount,
      timestamp,
    };
    await count(this.env, 'push.file');
    for (let i = 0; i < chunkCount; i++) {
      const chunk = raw.slice(i * PUSH_CHUNK, (i + 1) * PUSH_CHUNK);
      const payload = { ...base, chunkIndex: i, dataBase64: btoa(chunk) };
      for (const cid of live) {
        await this.sendTo(cid, { type: 'event', event: 'push_message', payload });
      }
    }
    return json({ ok: true, messageId });
  }

  // ---- acks / errors -----------------------------------------------------

  private ackOk(cid: string, id: string | undefined, data: Record<string, unknown>) {
    if (!id) return;
    this.sendTo(cid, { type: 'ack', id, ok: true, ...data });
  }

  private ackErr(cid: string, id: string | undefined, code: string, message: string) {
    if (!id) return;
    this.sendTo(cid, { type: 'ack', id, ok: false, code, message });
  }

  private pushError(ws: WebSocket, code: string, message: string) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', code, message }));
  }
}

export { UUID_RE };
