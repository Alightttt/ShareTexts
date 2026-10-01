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
/** Disconnect grace (must match server.ts): a device that briefly closes its
 *  tab or blips off the network holds its seat for this long before the other
 *  peer is told it is really gone. Makes a refresh invisible to the far side. */
const DISCONNECT_GRACE_MS = 60_000;
/** How long an empty Stay Connected room survives with both devices gone
 *  (matches the server-side stay-registry prune: 30 idle days). */
const STAY_EMPTY_MS = 30 * 24 * 60 * 60 * 1000;

/** Explicit room lifecycle. No scattered booleans. */
export type RoomPhase =
  | 'WAITING'      // created, one participant seated
  | 'CONNECTED'    // two or more participants seated
  | 'TRANSFERRING' // data is moving through this room (relay activity observed)
  | 'DISCONNECTED' // a peer left; rejoin window
  | 'CLOSING'      // manual close in progress
  | 'EXPIRED'      // idle-timeout fired
  | 'CLOSED';      // terminal; storage deleted

/** One member of a multi-device room. `pid` is the room-scoped stable
 *  participant id (client-provided AFTER the room credential check — never a
 *  display name); `cid` is its CURRENT socket. A returning device reclaims
 *  its pid, so refreshes never duplicate roster entries. */
interface Participant {
  pid: string;         // stable room-scoped participant id
  cid: string;         // current live connection (socket) id
  name: string;        // display hint only — never identity
  platform: string;    // 'phone' | 'tablet' | 'desktop'
  joinedAt: number;    // membership start; also the deterministic initiator tiebreak
}

/** Internal abuse guard on roster size — a resource policy, NOT a product
 *  cap: no user surface ever mentions a limit. Matches server.ts. */
const MAX_PARTICIPANTS = 64;

/** The wire shape of a roster entry — nothing sensitive. */
function rosterOf(participants: Participant[]) {
  return participants
    .slice()
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => ({ id: p.pid, name: p.name, platform: p.platform, joinedAt: p.joinedAt }));
}

/** Deterministic WebRTC initiator for a roster: the most senior member
 *  (earliest join), ties broken by id so every device computes the same
 *  answer without negotiation. The initiator offers to NEW members when a
 *  link is needed; every OTHER pair connects on demand (never a full mesh). */
function initiatorOf(participants: Participant[]): string | null {
  if (participants.length === 0) return null;
  const sorted = participants.slice().sort((a, b) => a.joinedAt - b.joinedAt || (a.pid < b.pid ? -1 : 1));
  return sorted[0].pid;
}

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
  /** AUTHORITATIVE multi-device membership. A room may hold any number of
   *  participants — there is deliberately NO product cap (the internal
   *  MAX_PARTICIPANTS guard is abuse control, not a limit we surface). */
  participants: Participant[];
  /** Monotonic roster version — bumped on every membership mutation so
   *  clients can reject stale/out-of-order roster deltas. */
  rosterSeq: number;
  /** pid → grace deadline (ms). Seats whose socket closed recently; cleared on
   *  return or when the alarm finalizes the eviction. */
  grace?: Record<string, number>;
  codeFails: number;
  codeFailReset: number;
  /** Set once the room has EVER held two live peers — the honest "rooms
   *  made" increment fired exactly then (see recomputeState). Persisted so
   *  hibernation/redeploy can never re-increment the same pairing. */
  countedConnected?: boolean;
  /** Stay Connected (server.ts parity): when either device opts in, the idle
   *  TTL no longer expires the room and the echo below keeps both badges
   *  honest. The promise is the USER's, so it survives their disconnect —
   *  even with BOTH seats empty, the room stays re-enterable (STAY_EMPTY_MS).
   *  Cleared only by an explicit close_room from a seated member. */
  stayConnected?: boolean;
  /** Who last held the Stay Connected promise (cid). Recorded on enable and
   *  kept through disconnections so handleClose can honor the promise's
   *  meaning: only a device that was PART of the room ends it for everyone. */
  stayOwner?: string | null;
  /** Remembered membership across empty-room phases: when a Stay Connected
   *  room has every seat empty, the member pids are kept here (persisted
   *  with the room) so a returning device is recognized as a member, and so
   *  a random third device cannot close the promise room. Snapshot on
   *  enable; survives hibernation because it lives on RoomState. */
  stayMembers?: string[];
}

interface ConnMeta {
  roomId: string | null;
}

/** In-memory per-connection frame-rate buckets (never persisted — a DO wake
 *  resets them, which bounds the state and matches the abuse horizon). */
interface FrameBucket {
  windowStart: number;
  textCount: number;
  binCount: number;
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
 * Per-connection frame-rate buckets (in-memory; see allowFrame).
 *   text: 60 control/relay frames per 10s — far above any legitimate client's
 *         cadence (signaling bursts are ~10 frames), far below flood rates.
 *   bin:  1200 chunks per 10s — a 128 KB chunk at that rate is ~15 MB/s,
 *         comfortably above the fastest realistic relay fallback throughput.
 */
const FRAME_RATE_TEXT = { limit: 60, windowMs: 10_000 };
const FRAME_RATE_BIN = { limit: 1200, windowMs: 10_000 };

/**
 * Validate and forward-shape a text relay payload BEFORE it reaches business
 * logic (the OWASP message-validation gate). The relay channel only ever
 * carries AES-GCM ciphertext produced by the client: opaque base64. Anything
 * else is rejected rather than fanned out — the signaling path must never
 * become a free JSON-broadcast service for malformed or hostile frames.
 */
/**
 * What a relayed TEXT frame may contain. The room socket carries two kinds of
 * text:
 *   · `enc:<base64>` / raw base64 — AES-GCM ciphertext blobs (pre-v2 clients);
 *   · v2 chunk envelopes ({"version":1,"type":"chunk",...}) — JSON wrapping
 *     `enc:`-ciphertext payloads. The app's TEXT messages, hello handshake,
 *     receipts and control packets ALL travel as these envelopes (the only
 *     alternative is WebRTC, and relay is the fallback when it is slow or
 *     unavailable), so both shapes MUST be accepted or transfers silently
 *     never arrive on the Cloudflare transport.
 * Everything else is rejected — the relay must not become a free JSON
 * broadcast service. Content is still opaque to the server: the ciphertext
 * inside is never readable here.
 */
function validateRelayData(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  if (data.length === 0 || data.length > RELAY_TEXT_MAX) return null;
  if (data.startsWith('enc:')) {
    return /^[A-Za-z0-9+/=]+$/.test(data.slice(4)) ? data : null;
  }
  // Raw base64 (legacy text relay) — no structure to check beyond charset.
  if (/^[A-Za-z0-9+/=]+$/.test(data)) return data;
  // v2 chunk envelope: JSON with a known shape. Fields beyond the shape
  // (transferId, sequence, total) are validated by the receiving client; the
  // payload must be `enc:`-ciphertext, exactly like the direct shape above.
  try {
    const parsed = JSON.parse(data) as { version?: unknown; type?: unknown; payload?: unknown };
    if (parsed?.version !== 1 || parsed?.type !== 'chunk' || typeof parsed?.payload !== 'string') return null;
    if (!parsed.payload.startsWith('enc:') || !/^[A-Za-z0-9+/=]+$/.test(parsed.payload.slice(4))) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Validate an SDP signal payload. Offers/answers/ICE candidates are small
 * JSON objects with a known `type` — anything else (huge blobs, nested
 * attack payloads, scripts) is dropped before forwarding.
 */
function validateSignal(signal: unknown): unknown | null {
  if (!signal || typeof signal !== 'object') return null;
  const t = (signal as { type?: unknown }).type;
  if (typeof t !== 'string') return null;
  if (!['offer', 'answer', 'candidate', 'endOfCandidates'].includes(t)) return null;
  return signal;
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
  /** Per-connection abuse buckets — in-memory only (see FrameBucket). */
  private frameBuckets = new Map<string, FrameBucket>();

  /** The `to` participant id carried on the most recent TEXT frame — binary
   *  relay chunks carry no envelope, so the addressing of the text frame that
   *  preceded them (same sender, same turn) decides whether the binary data
   *  is targeted or broadcast. In-memory, per-wake: worst case a wedged
   *  binary stream temporarily fans out to all members, the same behavior
   *  the pre-multi-device relay had. */
  private lastBinaryTo: string | null = null;

  /** Sliding-window-per-fixed-bucket frame gate. Returns false when the
   *  connection exceeded its text or binary frame allowance for the current
   *  window — the frame is silently dropped (the sender sees a stalled
   *  transfer/connection, the same observable behavior as network loss). */
  private allowFrame(cid: string, isText: boolean): boolean {
    const now = Date.now();
    let b = this.frameBuckets.get(cid);
    if (!b || now - b.windowStart >= FRAME_RATE_TEXT.windowMs) {
      b = { windowStart: now, textCount: 0, binCount: 0 };
      this.frameBuckets.set(cid, b);
      // Bound the map: drop buckets for connections that vanished.
      if (this.frameBuckets.size > 64) {
        for (const [k, vb] of this.frameBuckets) {
          if (now - vb.windowStart >= FRAME_RATE_TEXT.windowMs) this.frameBuckets.delete(k);
        }
      }
    }
    if (isText) {
      b.textCount++;
      return b.textCount <= FRAME_RATE_TEXT.limit;
    }
    b.binCount++;
    return b.binCount <= FRAME_RATE_BIN.limit;
  }

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

  /** Map a WebSocket back to its connection id via its acceptance tag.
   *  Resolution is exact by object reference (the socket was tagged with its
   *  cid at accept time), so it must NOT require an OPEN readyState — during
   *  webSocketClose the runtime hands us an already-closing socket. */
  private async cidOf(ws: WebSocket): Promise<string | null> {
    const conns = await this.ensureConns();
    for (const cid of conns.keys()) {
      if (this.ctx.getWebSockets(cid).some((s) => s === ws)) return cid;
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
    for (const p of r.participants) {
      if (p.cid && this.openSocket(p.cid)) live.push(p.pid);
    }
    return live;
  }

  /** First OPEN socket carrying this cid (a cid may map to several sockets
   *  across reconnects — stale ones must never be used to send). */
  private openSocket(cid: string): WebSocket | null {
    for (const ws of this.ctx.getWebSockets(cid)) {
      if (ws.readyState === 1) return ws;
    }
    return null;
  }

  private async memberOf(cid: string): Promise<boolean> {
    const r = await this.loadRoom();
    return !!r && r.participants.some((p) => p.cid === cid);
  }

  /** The participant record carrying this connection id. */
  private participantOf(cid: string): Participant | null {
    const r = this.room;
    if (!r) return null;
    return r.participants.find((p) => p.cid === cid) ?? null;
  }

  /** Resolve a signaling target: a pid (current wire), a cid (legacy echo),
   *  or null when the target is not a live member of this room. */
  private targetPid(room: RoomState, to: unknown): string | null {
    if (typeof to !== 'string' || !to) return null;
    if (to === 'all') return null;
    const byPid = room.participants.find((p) => p.pid === to);
    if (byPid && this.openSocket(byPid.cid)) return byPid.pid;
    const byCid = room.participants.find((p) => p.cid === to);
    if (byCid) return byCid.pid;
    return null;
  }

  /** Send a text frame to ONE member by pid. */
  private sendToPid(room: RoomState, pid: string, msg: unknown) {
    const p = room.participants.find((x) => x.pid === pid);
    const ws = p ? this.openSocket(p.cid) : null;
    if (ws) ws.send(JSON.stringify(msg));
  }

  /** Send a text frame to every member EXCEPT `selfPid` (legacy clients may
   *  still address by cid — memberOf/cidOf keep them routable). */
  private sendToOthers(selfCid: string, msg: unknown) {
    const r = this.room;
    if (!r) return;
    const self = r.participants.find((p) => p.cid === selfCid);
    for (const p of r.participants) {
      if (self && p.pid === self.pid) continue;
      const ws = this.openSocket(p.cid);
      if (ws) ws.send(JSON.stringify(msg));
    }
  }

  private async sendTo(cid: string, msg: unknown) {
    const ws = this.openSocket(cid);
    if (ws) ws.send(JSON.stringify(msg));
  }

  private async notifyOthers(selfCid: string, event: string, payload: unknown) {
    await this.ensureConns();
    for (const cid of this.conns!.keys()) {
      if (cid === selfCid) continue;
      const ws = this.openSocket(cid);
      if (ws) ws.send(JSON.stringify({ type: 'event', event, payload }));
    }
  }

  /** Roster payload builder (snapshot form, shared by acks and events). */
  private rosterSnapshot(r: RoomState) {
    return { participants: rosterOf(r.participants), seq: r.rosterSeq };
  }

  /** Seat a connection into the roster. Returns 'reclaimed' when a KNOWN
   *  participant id takes its seat back (refresh/reconnect — the room learns
   *  it is the same logical device), 'seated' for a genuinely new member,
   *  'full' ONLY at the internal abuse guard — a room's membership is
   *  otherwise unbounded (multi-device product requirement; the old
   *  two-seat cap is gone). A participant in disconnect grace still owns
   *  its roster entry, so a newcomer never steals a seat a departing device
   *  is entitled to reclaim. */
  private async assignSlot(cid: string, pid: string, name = 'Device', platform = 'desktop'): Promise<'seated' | 'reclaimed' | 'full'> {
    const r = this.room;
    if (!r) return 'full';
    const existing = r.participants.find((p) => p.pid === pid);
    if (existing) {
      existing.cid = cid;
      existing.name = name;
      existing.platform = platform;
      if (r.grace) delete r.grace[pid];
      return 'reclaimed';
    }
    if (r.participants.length >= MAX_PARTICIPANTS) return 'full';
    r.participants.push({ pid, cid, name, platform, joinedAt: Date.now() });
    r.rosterSeq++;
    return 'seated';
  }

  /** Drop grace entries for participants that no longer hold a seat. */
  private async pruneGrace() {
    const r = this.room;
    if (!r?.grace) return;
    for (const pid of Object.keys(r.grace)) {
      if (!r.participants.some((p) => p.pid === pid)) delete r.grace[pid];
    }
    if (Object.keys(r.grace).length === 0) delete r.grace;
    await this.ctx.storage.put('room', r);
  }

  /** Derive the lifecycle state from the live roster. ALSO owns the
   *  lifetime "rooms made" increment: the counter fires exactly when a room
   *  FIRST holds two live participants — a real multi-device connection, not
   *  a room that was merely created (creator alone, refreshes, and failed
   *  pairings must never inflate the public tracker). The once-per-room flag
   *  is persisted with the room, so a hibernation wake or storage reload can
   *  never double-count the same pairing. */
  private async recomputeState() {
    const r = this.room;
    if (!r) return;
    const live = await this.livePeers();
    const wasConnected = r.state === 'CONNECTED';
    // A room with a REMEMBERED roster but no live sockets keeps the
    // rejoinable WAITING phase (empty-room tombstone); DISCONNECTED is only
    // reached once the roster itself has been emptied (grace evictions ran).
    r.state = live.length >= 2 ? 'CONNECTED' : live.length === 1 ? 'WAITING' : (r.participants.length === 0 ? 'DISCONNECTED' : 'WAITING');
    await this.ctx.storage.put('room', r);
    if (r.state === 'CONNECTED' && !wasConnected && !r.countedConnected) {
      r.countedConnected = true;
      await this.ctx.storage.put('room', r);
      await count(this.env, 'rooms.created');
    }
  }

  /**
   * Finalize disconnect grace: evict seats whose grace window elapsed without
   * a return, notify the survivors, and re-arm the alarm for the next deadline
   * (or the idle TTL, whichever is sooner). Runs from the alarm handler.
   */
  private async finalizeGrace() {
    const r = this.room;
    if (!r || !r.grace) return;
    const now = Date.now();
    let changed = false;
    for (const [pid, deadline] of Object.entries(r.grace)) {
      if (now < deadline) continue;
      delete r.grace[pid];
      changed = true;
      // The socket may have quietly returned without a resume (hibernation
      // reuse with the same cid); keep the seat if it's live again.
      const p = r.participants.find((x) => x.pid === pid);
      if (p && this.openSocket(p.cid)) continue;
      if (p) {
        r.participants = r.participants.filter((x) => x.pid !== pid);
        r.rosterSeq++;
      }
      await this.notifyOthers(p?.cid ?? '', 'peer_disconnected', {
        peerId: pid,
        remaining: (await this.livePeers()).length,
        roster: this.rosterSnapshot(r),
      });
      await reportPresence(this.env, r.roomId, (await this.livePeers()).length);
      log('grace expired, participant evicted', pid.slice(0, 8));
    }
    if (!changed) return;
    if (Object.keys(r.grace).length === 0) delete r.grace;
    await this.ctx.storage.put('room', r);
    await this.recomputeState();
  }

  /** Last touch() write time — the idle TTL is 5h, so refreshing lastActive
   *  at most every 30s keeps expiry semantics (a relay-busy room is active)
   *  while turning O(frames) storage writes into O(minutes). */
  private lastTouchWrite = 0;

  private async touch() {
    const r = this.room;
    if (!r) return;
    const now = Date.now();
    if (now - this.lastTouchWrite < 30_000) return; // write coalesced
    this.lastTouchWrite = now;
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

    // Abuse control (per-connection, in-memory — resets when the DO sleeps,
    // which is exactly the right horizon for a WebSocket peer): a connected
    // client may not flood frames. Two buckets: text/control frames are
    // individually tiny but can arrive at absurd rates; binary relay frames
    // are bulk but a legit transfer can burst hard, so its cap is generous.
    if (!this.allowFrame(cid, typeof message === 'string')) {
      await count(this.env, 'abuse.frames_dropped');
      return;
    }

    // Binary frames are relay data from a member (already encrypted client-side).
    if (typeof message !== 'string') {
      if (message.byteLength > RELAY_BIN_MAX) return;
      if (!(await this.memberOf(cid))) return;
      await this.touch();
      await this.markTransferring();
      await count(this.env, 'relay.binary_messages');
      // Multi-device fan-out: targeted when the sender addressed one
      // participant, to every other member otherwise (the 1-to-1 case is
      // unchanged — two members, so "broadcast" reaches exactly the peer).
      const r = this.room!;
      const toPid = this.targetPid(r, this.lastBinaryTo);
      const targets = toPid
        ? r.participants.filter((p) => p.pid === toPid)
        : r.participants.filter((p) => p.cid !== cid);
      for (const t of targets) {
        const ws2 = this.openSocket(t.cid);
        if (ws2) ws2.send(message);
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
    // Remember the addressing of text frames so a following binary relay
    // chunk (envelope-less by design) inherits the same target.
    this.lastBinaryTo = typeof msg.payload?.to === 'string' ? msg.payload.to : null;

    switch (msg.event) {
      case 'create_room':
        return this.handleCreate(cid, msg.id, msg.payload);
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
      case 'stay_connected_enable':
        return this.handleStayConnected(cid, msg.id, true);
      case 'stay_connected_disable':
        return this.handleStayConnected(cid, msg.id, false);
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
    // Only a seated participant counts as a disconnect — a socket that never
    // joined (e.g. a failed code probe) must not disturb the room.
    const self = this.participantOf(cid);
    if (self) {
      // Grace: keep the seat and tell nobody yet. The other devices keep
      // their room without a scary "disconnected" banner for a tab refresh or
      // a brief network blip. If the device comes back (resume_room or a new
      // socket reclaiming its pid) the grace is cancelled; otherwise the
      // alarm confirms the eviction after DISCONNECT_GRACE_MS. The whole
      // rest of the roster stays untouched — one device leaving never tears
      // the room down.
      //
      // ORDER MATTERS: drop the connection record FIRST. The worker runtime
      // may deliver the hibernation close for an already-closing socket and
      // then exit the isolate without further I/O turns — any storage write
      // queued after a lost await never lands. The original code wrote the
      // grace state first and lost it on every abrupt close, leaving seats
      // looking occupied forever ("room full" for a two-device room).
      await this.dropConn(cid);
      r.grace = r.grace ?? {};
      r.grace[self.pid] = Date.now() + DISCONNECT_GRACE_MS;
      r.lastActive = Date.now();
      await this.ctx.storage.put('room', r);
      // Re-arm the room alarm to also cover the earliest grace deadline.
      const earliest = Math.min(...Object.values(r.grace));
      const alarm = await this.ctx.storage.getAlarm();
      if (!alarm || alarm > earliest) await this.ctx.storage.setAlarm(earliest);
      return;
    }
    await this.dropConn(cid);
    log('non-member socket closed', cid.slice(0, 8));
  }

  async alarm() {
    const r = await this.loadRoom();
    if (!r) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    const now = Date.now();
    await this.finalizeGrace();
    const live = await this.livePeers();
    // Stay Connected exempts the room from the IDLE timeout: the user
    // explicitly promised the device stays reachable, so silence must not
    // kill the room while a peer holds a seat. A room whose seats stay
    // empty for a full TTL still ends via the tombstone branch below.
    const idleExpired = !r.stayConnected && now - r.lastActive > ROOM_TTL;
    if (live.length === 0 && !idleExpired && r.participants.length === 0) {
      if (r.stayConnected) {
        // Stay Connected with both seats empty: the promise outlives a closed
        // tab (that is its entire point) — a device can re-enter the room
        // hours later from the landing card and it must still be there.
        // Re-arm long, not tombstone-short. The 30-day idle cap matches the
        // server's stay-registry pruning so an abandoned promise can't pile
        // up forever.
        const stayUntil = now + STAY_EMPTY_MS;
        const alarm = await this.ctx.storage.getAlarm();
        if (!alarm || alarm > stayUntil) await this.ctx.storage.setAlarm(stayUntil);
        return;
      }
      // Last seat just finalized → DISCONNECTED tombstone keeps the 5h rejoin
      // window (join_with_code / resume_room can still revive the room).
      const tombstoneUntil = now + ROOM_TTL;
      const alarm = await this.ctx.storage.getAlarm();
      if (!alarm || alarm > tombstoneUntil) await this.ctx.storage.setAlarm(tombstoneUntil);
    } else if (live.length === 0 || idleExpired) {
      if (live.length > 0) await this.destroyRoom('idle_timeout');
      else await this.ctx.storage.deleteAll();
      this.room = null;
      log('room expired', r.roomId.slice(0, 8));
    } else {
      // Activity happened since the alarm was armed — extend; also cover the
      // next grace deadline if one is pending.
      const next = [now + ROOM_TTL, ...Object.values(r.grace ?? {})]
        .filter((t) => t > now)
        .reduce((a, b) => Math.min(a, b), Infinity);
      if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
      else await this.ctx.storage.setAlarm(now + ROOM_TTL);
    }
  }

  // ---- handlers ----------------------------------------------------------

  private async handleCreate(cid: string, id?: string, payload?: { pid?: unknown }) {
    const r = await this.loadRoom();
    if (r) return this.ackErr(cid, id, 'ROOM_EXISTS', 'This room already exists.');
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(16)));
    const roomId = this.urlRoomId ?? crypto.randomUUID();
    const now = Date.now();
    // The creator's stable participant id rides the create payload (the
    // client proved nothing yet, but the room secret gates every later
    // action — a forged pid only mislabels the creator to itself).
    const pid = typeof payload?.pid === 'string' && payload.pid.length >= 8 && payload.pid.length <= 64
      ? payload.pid
      : crypto.randomUUID();
    this.room = {
      roomId,
      secret,
      state: 'WAITING',
      createdAt: now,
      codeAnchor: now,
      lastActive: now,
      expiresAt: now + ROOM_TTL,
      participants: [{ pid, cid, name: 'Creator', platform: 'desktop', joinedAt: now }],
      rosterSeq: 1,
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
    // NOTE: rooms.created is NOT fired here. The tracker counts real
    // multi-device connections — recomputeState fires it when the room first
    // holds two live participants.
    await reportPresence(this.env, roomId, (await this.livePeers()).length);
    // createdAt anchors the pairing-code window (90s from room creation).
    this.ackOk(cid, id, { roomId, secret, createdAt: now, participantId: pid, myParticipantId: pid, roster: this.rosterSnapshot(this.room) });
  }

  private async handleJoinWithCode(cid: string, id?: string, payload?: { code?: unknown; pid?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.participants.some((p) => p.cid === cid)) {
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
    const slot = await this.assignSlot(cid, this.pidFrom(payload));
    if (slot === 'full') {
      await count(this.env, 'joins.failed:room_full');
      return this.ackErr(cid, id, 'ROOM_FULL', 'This room cannot take more devices right now.');
    }
    await this.completeJoin(cid, id);
  }

  private async handleJoinWithLink(cid: string, id?: string, payload?: { secret?: unknown; pid?: unknown }) {
    const r = await this.loadRoom();
    if (!r) {
      await count(this.env, 'joins.failed:session_expired');
      return this.ackErr(cid, id, 'SESSION_EXPIRED', 'This room has expired.');
    }
    if (payload?.secret && payload.secret !== r.secret) {
      await count(this.env, 'joins.failed:invalid_session');
      return this.ackErr(cid, id, 'INVALID_SESSION', 'This room link isn\u2019t valid anymore.');
    }
    if (r.participants.some((p) => p.cid === cid)) {
      return this.ackOk(cid, id, { roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor, roster: this.rosterSnapshot(r) });
    }
    const slot = await this.assignSlot(cid, this.pidFrom(payload));
    if (slot === 'full') {
      await count(this.env, 'joins.failed:room_full');
      return this.ackErr(cid, id, 'ROOM_FULL', 'This room cannot take more devices right now.');
    }
    await this.completeJoin(cid, id);
  }

  private pidFrom(payload?: { pid?: unknown }): string {
    return typeof payload?.pid === 'string' && payload.pid.length >= 8 && payload.pid.length <= 64
      ? payload.pid
      : `legacy-${crypto.randomUUID()}`;
  }

  private async handleResume(cid: string, id?: string, payload?: { secret?: unknown; pid?: unknown }) {
    const r = await this.loadRoom();
    if (!r || r.secret !== payload?.secret) {
      return this.ackErr(cid, id, 'SESSION_EXPIRED', 'This room has expired.');
    }
    // PID-BASED RECLAIM: a resume carrying a participant id the roster knows
    // is the SAME LOGICAL DEVICE returning — whether on the same socket
    // (transport recovery) or a brand-new one (tab refresh). Rebind its cid,
    // cancel its grace, and tell the survivors it recovered so they re-offer
    // WebRTC. The room identity never rotates and no duplicate "Device 2"
    // roster entry is ever created.
    const pid = this.pidFrom(payload);
    const known = r.participants.find((p) => p.pid === pid) ??
      // Legacy compat: a pid-less resume on a socket that already sits in
      // the roster is the pre-multi-device recovery path.
      r.participants.find((p) => p.cid === cid && pid.startsWith('legacy-'));
    if (known) {
      if (r.grace) {
        delete r.grace[known.pid];
        if (Object.keys(r.grace).length === 0) delete r.grace;
      }
      known.cid = cid;
      await this.ctx.storage.put('room', r);
      await this.ensureConns();
      this.conns!.set(cid, { roomId: r.roomId });
      await this.ctx.storage.put('conn:' + cid, { roomId: r.roomId });
      await this.recomputeState();
      await this.notifyOthers(cid, 'peer_recovered', { peerId: known.pid, roster: this.rosterSnapshot(r) });
      return this.ackOk(cid, id, { roomId: r.roomId, secret: r.secret, createdAt: r.codeAnchor, stayConnected: !!r.stayConnected, participantId: known.pid, myParticipantId: known.pid, roster: this.rosterSnapshot(r) });
    }
    // Re-entry into a room with both seats empty: the caller already proved
    // possession of the 128-bit room secret (checked above) — the secret IS
    // the room's credential, so the return is accepted. (The old snapshot
    // gate here rejected a legitimate device whose connection id changed
    // across reconnects, making rejoin fail "sometimes".) The snapshot is
    // still honored for CLOSE: only remembered members may end an empty
    // promise room for everyone (handleClose).    // Drop stale seats whose sockets are gone so the returning device can
    // sit. A dropped seat is a real eviction: notify the survivors (the
    // returning device itself is excluded — its own old seat must not make
    // it flash "disconnected" on rejoin).

    const live = await this.livePeers();
    for (const p of [...r.participants]) {
      if (p.pid === (payload?.pid as string)) continue;
      if (!live.includes(p.pid)) {
        if (r.grace) delete r.grace[p.pid];
        r.participants = r.participants.filter((x) => x.pid !== p.pid);
        r.rosterSeq++;
        await this.notifyOthers(cid, 'peer_disconnected', {
          peerId: p.pid,
          remaining: (await this.livePeers()).length,
          roster: this.rosterSnapshot(r),
        });
        await reportPresence(this.env, r.roomId, (await this.livePeers()).length);
      }
    }
    await this.ctx.storage.put('room', r);
    const slot = await this.assignSlot(cid, this.pidFrom(payload));
    if (slot === 'full') return this.ackErr(cid, id, 'ROOM_FULL', 'This room cannot take more devices right now.');
    await this.pruneGrace();
    await this.completeJoin(cid, id);
  }

  private async completeJoin(cid: string, id?: string) {
    const r = this.room!;
    await this.ensureConns();
    this.conns!.set(cid, { roomId: r.roomId });
    await this.ctx.storage.put('conn:' + cid, { roomId: r.roomId });
    await this.touch();
    await this.recomputeState();
    const self = this.participantOf(cid);
    await this.notifyOthers(cid, 'peer_joined', {
      peerId: self?.pid ?? cid,
      participant: self ? { id: self.pid, name: self.name, platform: self.platform, joinedAt: self.joinedAt } : undefined,
      roster: this.rosterSnapshot(r),
      initiatorId: initiatorOf(r.participants),
    });
    log('peer joined', r.roomId.slice(0, 8), cid.slice(0, 8), 'state', r.state, 'members', r.participants.length);
    await count(this.env, 'joins.succeeded');
    await reportPresence(this.env, r.roomId, (await this.livePeers()).length);
    this.ackOk(cid, id, {
      roomId: r.roomId,
      secret: r.secret,
      createdAt: r.codeAnchor,
      stayConnected: !!r.stayConnected,
      participantId: self?.pid,
      myParticipantId: self?.pid,
      roster: this.rosterSnapshot(r),
    });
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
    const signal = validateSignal(payload?.signal);
    if (!signal) return;
    await this.touch();
    const self = this.participantOf(cid);
    const to = payload?.to;
    const r = this.room!;
    // Targeted point-to-point negotiation: offers go to ONE participant.
    const targetPid = this.targetPid(r, to);
    if (targetPid) {
      this.sendToPid(r, targetPid, { type: 'event', event: 'signal', payload: { from: self?.pid ?? cid, signal } });
    } else {
      await this.notifyOthers(cid, 'signal', { from: self?.pid ?? cid, signal });
    }
  }

  private async handleRelayText(cid: string, _id: string | undefined, payload?: { to?: unknown; data?: unknown }) {
    if (!(await this.memberOf(cid))) return;
    const data = validateRelayData(payload?.data);
    if (data === null) return;
    await this.touch();
    await this.markTransferring();
    await count(this.env, 'relay.text_messages');
    const self = this.participantOf(cid);
    const r = this.room!;
    const targetPid = this.targetPid(r, payload?.to);
    if (targetPid) {
      this.sendToPid(r, targetPid, { type: 'event', event: 'relay_message', payload: { from: self?.pid ?? cid, data } });
    } else {
      await this.notifyOthers(cid, 'relay_message', { from: self?.pid ?? cid, data });
    }
  }

  private async markTransferring() {
    const r = this.room;
    if (r && r.state === 'CONNECTED') {
      r.state = 'TRANSFERRING';
      await this.ctx.storage.put('room', r);
    }
  }

  private async handleClose(cid: string) {
    const r = this.room;
    if (!r) return;
    // Member check with memory: normally the live-seat check is enough, but a
    // Stay Connected room can be re-entered with BOTH seats empty (that is
    // the promise's point). In that phase the seats say nothing, so consult
    // the remembered membership — a random device that somehow reaches the
    // close event must never end someone else's promise room.
    const isLiveMember = (await this.memberOf(cid));
    const remembered = r.stayMembers?.includes(this.participantOf(cid)?.pid ?? '') ?? false;
    if (!isLiveMember && !(r.stayConnected && r.participants.length === 0 && remembered)) return;
    log('room closed manually', r.roomId.slice(0, 8));
    await this.destroyRoom('manual_close');
  }

  /**
   * Stay Connected (server.ts parity): flip the room-wide promise, echo it to
   * BOTH seated peers, and persist. While the promise is on, the room is
   * exempt from the idle TTL — the user explicitly asked for it, so silence
   * must not kill their room (the 5h hard life and manual close still end it).
   */
  private async handleStayConnected(cid: string, id: string | undefined, enabled: boolean) {
    const r = await this.loadRoom();
    if (!r) return this.ackErr(cid, id, 'ROOM_NOT_FOUND', 'Room not found.');
    if (!(await this.memberOf(cid))) return this.ackErr(cid, id, 'NOT_A_MEMBER', 'Not a member of this room.');
    r.stayConnected = enabled;
    r.lastActive = Date.now();
    if (enabled) {
      r.stayOwner = cid;
      // Snapshot the current membership: these are the devices the promise
      // belongs to. Kept across the empty-room phase so re-entry recognizes
      // members and only members can later close the room.
      r.stayMembers = r.participants.map((p) => p.pid);
    } else {
      r.stayOwner = null;
      r.stayMembers = undefined;
    }
    await this.ctx.storage.put('room', r);
    const event = { type: 'event' as const, event: 'stay_connected_state', payload: { enabled } };
    for (const peer of r.participants) {
      const ws = this.openSocket(peer.cid);
      if (ws && ws.readyState === 1) {
        try { ws.send(JSON.stringify(event)); } catch { /* best effort */ }
      }
    }
    await count(this.env, enabled ? 'stay.enabled' : 'stay.disabled');
    this.ackOk(cid, id, { success: true, enabled });
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
    // Push goes to EVERY seated device (multi-device rooms included); a
    // device whose socket is in disconnect grace is skipped — it is not
    // actually reading right now, and a late fan-out to a ghost seat would
    // surface the message twice after its resume.
    const live = (await this.livePeers())

    if (typeof body.text === 'string' && body.text.trim().length > 0) {
      const text = body.text.slice(0, PUSH_TEXT_MAX);
      await count(this.env, 'push.text');
      for (const pid of live) {
        await this.sendToPid(r, pid, { type: 'event', event: 'push_message', payload: { id: messageId, kind: 'text', text, timestamp } });
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
      for (const pid of live) {
        await this.sendToPid(r, pid, { type: 'event', event: 'push_message', payload });
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
