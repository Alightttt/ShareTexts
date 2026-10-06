import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import helmet from 'helmet';

const app = express();

// Production builds have zero inline scripts (Vite emits module scripts only),
// so the shipped CSP is strict — no unsafe-inline/unsafe-eval. The dev server
// (Vite middleware) needs them for HMR, so they're dev-only.
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The hash whitelists ONLY the index.html pre-paint script (sha256 of
      // its exact body — theme bootstrap + slow-boot escalation). It must run
      // before first paint or dark users get a white flash on every reload.
      // Hash-pinning keeps the CSP strict; 'unsafe-inline' would defeat the
      // whole policy. If index.html's inline script changes, re-pin this hash
      // (scripts/verify-seo.mjs catches a mismatch as a console error).
      scriptSrc: isProd
        ? ["'self'", "'sha256-dlnEh4mZw5JxaCkg9Kk//YTm0YKXquqYsUswRzAfToM='"]
        : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      // Received images/videos render from blob: object URLs.
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'"],
      // NOTE: `stun:` schemes are not valid connect-src sources; WebRTC is not
      // subject to connect-src anyway, so they were removed.
      // `https:` is required so the Cloudflare transport can POST to the
      // Worker's /lookup endpoint from a browser served by this server; the
      // dev-only localhost entries cover `wrangler dev` on a local port.
      connectSrc: [
        "'self'",
        "blob:",
        "ws:",
        "wss:",
        "https:",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        ...(isProd ? [] : ["http://localhost:*", "ws://localhost:*"]),
      ],
      frameAncestors: ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false
}));

// --- Health + origin policy -------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'sharetext-signaling' });
});

// Anonymous aggregate counters. `metrics` is in-memory and resets on
// restart; `roomsCreatedTotal` is persisted to a tiny JSON file next to the
// server so the landing page's "rooms made till now" tracker SURVIVES
// restarts (the number only ever grows — it is a lifetime total).
const metrics: Record<string, number> = {};
const ROOMS_TOTAL_FILE = path.join(process.cwd(), '.rooms-total.json');
let roomsCreatedTotal = 0;
try {
  roomsCreatedTotal = JSON.parse(readFileSync(ROOMS_TOTAL_FILE, 'utf8')).count || 0;
} catch { /* first run — starts at 0 and grows from here */ }
function count(name: string) {
  metrics[name] = (metrics[name] ?? 0) + 1;
  if (name === 'rooms.created') {
    roomsCreatedTotal++;
    try { writeFileSync(ROOMS_TOTAL_FILE, JSON.stringify({ count: roomsCreatedTotal })); } catch { /* read-only fs — counter stays in memory */ }
  }
}

app.get('/metrics', (_req, res) => {
  res.json({
    service: 'sharetext-signaling',
    generated_at: new Date().toISOString(),
    uptime_s: Math.round(process.uptime()),
    note: 'in-memory aggregate counters, reset on restart',
    totals: metrics,
  });
});

// Live seated-device count for the landing-page social-proof widget. Only a
// single aggregate number is exposed — never room ids, codes, or IPs.
// CORS: the landing page may be served from a different origin (e.g. Vercel)
// than this signaling server, so this read-only aggregate is open to browsers
// while every signaling route stays behind the socket.io origin allowlist.
app.get('/stats', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const seated = new Set<string>();
  for (const room of rooms.values()) {
    for (const pid of room.activePeers) seated.add(pid);
  }
  res.json({
    service: 'sharetext-signaling',
    generated_at: new Date().toISOString(),
    users: seated.size,
    // Lifetime total, persisted across restarts — never resets to 0. The
    // floor of 113 covers rooms created before lifetime tracking existed;
    // every NEW room still increments past the floor.
    roomsCreated: Math.max(roomsCreatedTotal, metrics['rooms.created'] ?? 0, 113),
    note: 'approximate live count of seated devices + total rooms ever created (lifetime, persisted)',
  });
});

// --- Agent push API --------------------------------------------------------
//
// Lets a script or AI agent push text (or a small file) straight into a room,
// addressed by the room's secret — the same credential the devices hold. This
// is how "tell the agent to send this text to my phone" works: the creator
// copies a curl command from the connect screen, runs it (or hands it to an
// agent), and the message lands in the room on every seated device.
//
//   JSON text:    POST /api/push   { roomId, text }
//   JSON file:    POST /api/push   { roomId, name, mimeType, dataBase64 }
//   Binary file:  POST /api/push?roomId=...  (Content-Type: application/octet-stream,
//                 X-File-Name / X-File-Mime headers, raw body)
//   Auth:         Authorization: Bearer <room secret>
//
// Files travel to the devices as base64 chunks (~45KB each) so they fit the
// 1MB WebSocket frame cap on both transports; the client reassembles.

const PUSH_TEXT_MAX = 256 * 1024;      // text cap
const PUSH_FILE_MAX = 8 * 1024 * 1024; // file cap (raw bytes)
const PUSH_CHUNK = 45 * 1024;          // raw bytes per base64 chunk

function secretMatches(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Parse a push request body (JSON text/file OR raw binary) into a uniform
// { roomId, kind, text?, file? } shape. Never trusts the client's size claim.
function parsePushBody(req: express.Request): { roomId?: string; kind?: 'text' | 'file'; text?: string; file?: { name: string; mimeType: string; data: Buffer } } | null {
  const auth = req.headers.authorization || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  const roomId =
    (typeof (req.body as any)?.roomId === 'string' && (req.body as any).roomId) ||
    (typeof req.query.roomId === 'string' && req.query.roomId) ||
    '';
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return null;

  const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

  if (ct === 'application/json') {
    const body = req.body as any;
    if (typeof body?.text === 'string' && body.text.trim().length > 0) {
      const text = body.text.slice(0, PUSH_TEXT_MAX);
      return { roomId, kind: 'text', text, file: undefined };
    }
    if (typeof body?.name === 'string' && typeof body?.dataBase64 === 'string') {
      const data = Buffer.from(body.dataBase64, 'base64');
      if (data.length === 0 || data.length > PUSH_FILE_MAX) return null;
      return {
        roomId,
        kind: 'file',
        file: {
          name: body.name.slice(0, 200),
          mimeType: typeof body.mimeType === 'string' ? body.mimeType.slice(0, 100) : 'application/octet-stream',
          data,
        },
      };
    }
    return null;
  }

  if (ct === 'application/octet-stream' && Buffer.isBuffer(req.body) && req.body.length > 0) {
    if (req.body.length > PUSH_FILE_MAX) return null;
    const name = (req.headers['x-file-name'] as string) || 'file';
    const mimeType = (req.headers['x-file-mime'] as string) || 'application/octet-stream';
    return {
      roomId,
      kind: 'file',
      file: { name: name.slice(0, 200), mimeType: mimeType.slice(0, 100), data: req.body },
    };
  }

  return null;
}

function pushRateLimited(ip: string): boolean {
  return limited(ip, pushAttempts, 40, 60 * 1000);
}

function handlePush(req: express.Request, res: express.Response) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (pushRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many pushes. Try again shortly.' });
  }

  const parsed = parsePushBody(req);
  const auth = req.headers.authorization || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!parsed || !parsed.roomId) {
    return res.status(400).json({
      error: 'Bad request. Send { roomId, text } (or { roomId, name, dataBase64 } / binary body) with an Authorization: Bearer <secret> header.',
    });
  }

  const room = rooms.get(parsed.roomId);
  if (!room) {
    count('push.failed:not_found');
    return res.status(404).json({ error: 'Room not found — it may have expired.' });
  }
  if (!secret || !secretMatches(secret, room.secret)) {
    count('push.failed:unauthorized');
    return res.status(401).json({ error: 'Invalid secret. Copy the command from the connect screen.' });
  }

  const messageId = crypto.randomUUID();
  const timestamp = Date.now();
  room.lastActive = Date.now();

  if (parsed.kind === 'text') {
    io.to(room.id).emit('push_message', {
      id: messageId,
      kind: 'text',
      text: parsed.text!,
      timestamp,
    });
    count('push.text');
  } else {
    // Files travel as base64 chunks (~45KB raw each) so every frame stays
    // well under the 1MB socket frame cap; the client reassembles them.
    const file = parsed.file!;
    const chunkCount = Math.ceil(file.data.length / PUSH_CHUNK);
    const base = {
      id: messageId,
      kind: 'file',
      name: file.name,
      mimeType: file.mimeType,
      size: file.data.length,
      chunkCount,
      timestamp,
    };
    for (let i = 0; i < chunkCount; i++) {
      const slice = file.data.subarray(i * PUSH_CHUNK, (i + 1) * PUSH_CHUNK);
      io.to(room.id).emit('push_message', {
        ...base,
        chunkIndex: i,
        dataBase64: slice.toString('base64'),
      });
    }
    count('push.file');
  }

  res.json({ ok: true, messageId });
}

// Both body parsers in ONE route: whichever matches the content-type populates
// req.body and the other skips it (body-parser calls next() on type mismatch).
// Two separate mounts would let the first handler see an empty body for the
// octet-stream case and reject it before the raw parser ever ran.
// ---------------------------------------------------------------------------
// Product telemetry — anonymous, aggregate-only product events from the
// client. Same contract as the rest of the metrics pipeline: a single event
// name from a fixed whitelist, no payload, no identifiers. Rate limited so
// a script can't inflate counters. Answers: which connection method people
// use, where they fail, when activation (first completed transfer) happens.
// ---------------------------------------------------------------------------
const CLIENT_EVENTS: ReadonlySet<string> = new Set([
  'product.page_view',
  'product.first_interaction',
  'product.activation',
  'product.transfer_completed',
  'product.transfer_failed',
  'product.method_nearby',
  'product.method_code',
  'product.method_qr',
  'product.method_link',
  'product.qr_opened',
  'product.docs_opened',
  'product.diagnostics_opened',
]);
app.post('/api/event', express.text({ type: () => true, limit: '256b' }), (req, res) => {
  const name = typeof req.body === 'string' ? req.body.trim() : '';
  if (!CLIENT_EVENTS.has(name)) return res.status(400).json({ error: 'Bad request' });
  count(name);
  res.status(204).end();
});

app.post('/api/push', express.json({ limit: '12mb', type: 'application/json' }), express.raw({ limit: '12mb', type: 'application/octet-stream' }), handlePush);

// CORS allowlist. Production must NOT accept `*` — only the intended
// frontend origins. Defaults: localhost dev origins + the Vercel frontend.
// Add your own via ALLOWED_ORIGINS (comma-separated) — render.yaml sets this
// to the Render service URL so same-origin deployments work too.
const allowedOrigins = new Set<string>([
  'http://localhost:3000',
  'http://localhost:3311',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3311',
  'https://sharetexts.online',
  'https://www.sharetexts.online',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
const PORT = process.env.PORT || 3000;
// Same-origin deployments: the frontend served by THIS server (any port,
// localhost or 127.0.0.1) is always a legitimate signaling client. Without
// this, running dev on a nonstandard port (e.g. 3001) made the app's own
// websocket/POST handshakes fail CORS — GETs work, the room never opens.
allowedOrigins.add(`http://localhost:${PORT}`);
allowedOrigins.add(`http://127.0.0.1:${PORT}`);

// Rooms are deliberately long-lived so a session can be rejoined for hours.
const ROOM_TTL = 12 * 60 * 60 * 1000;     // rooms idle-expire after 12 hours
const ROOM_EMPTY_TTL = 4 * 60 * 60 * 1000; // rooms stay rejoinable 4h after both peers leave
const RECONNECT_GRACE = 5 * 60 * 1000;    // must match connectionStateRecovery window

function log(...parts: unknown[]) {
  console.log('[ShareTexts]', ...parts);
}

const httpServer = createServer(app);
const io = new Server(httpServer, {

  // Only the configured frontend origins may open signaling sockets. No
  // cookies or credentials are used, but a misconfigured `*` would let any
  // website burn rate-limit buckets and probe codes.
  cors: {
    origin(origin, cb) {
      if (!origin) return cb(null, true); // non-browser clients (curl, agents)
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed'));
    }
  },
  // Cap inbound socket payloads (SDP offers and relayed messages are small).
  maxHttpBufferSize: 1e6,
  // Patient liveness probes: a phone locking its screen or a brief network
  // blip must not read as a dead socket. 25s ping / 40s timeout means the
  // server waits up to ~40s of silence before declaring a peer gone — and
  // the client-side reconnect usually lands well inside that window.
  pingInterval: 25000,
  pingTimeout: 40000,
  // Allow a briefly-disconnected device to come back to the same room
  // without losing membership (the reconnection grace period).
  connectionStateRecovery: {
    maxDisconnectionDuration: RECONNECT_GRACE
  }
});

// Behind a proxy (Render/Vercel) every socket's handshake.address is the
// proxy IP — without this, all visitors share one rate-limit bucket.
// Prefer the leftmost untrusted-hop x-forwarded-for value.
function clientIp(socket: import('socket.io').Socket): string {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  if (typeof fwd === 'string') {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address || 'unknown';
}

/** One member of a multi-device room. Identity is a room-scoped stable id
 *  minted client-side (survives refresh/rejoin) — never the display name, and
 *  never reused across rooms. `socketId` is the participant's CURRENT live
 *  socket; it changes on every reconnect while `id` stays fixed. */
interface ParticipantInfo {
  id: string;          // stable room-scoped participant id (client UUID)
  socketId: string;    // current live socket (mirror; participants is authoritative)
  name: string;        // sanitized display name (cosmetic only)
  platform: string;    // 'phone' | 'tablet' | 'desktop' (display hint)
  joinedAt: number;    // membership start — also the WebRTC initiator tiebreak
}

interface Room {
  id: string;
  secret: string;
  /** Room creation time — also the pairing-code anchor until refreshed. */
  createdAt: number;
  /** The TOTP anchor. Re-anchored on refresh_code so the creator always sees
   *  a fresh 40s code window on the connect screen; the previous code stays
   *  valid for one more window (±1 validation) so a typing joiner isn't cut off. */
  codeAnchor: number;
  lastActive: number;
  /** Socket-level seat mirror (socket ids). Derived from `participants` and
   *  kept in sync by seatParticipant/removeParticipant; legacy paths (signal
   *  membership, relay, presence seated-check, sweeps) read this. */
  activePeers: Set<string>;
  /** AUTHORITATIVE room membership: participant id → info. A room may hold
   *  any number of participants — there is deliberately NO product cap. */
  participants: Map<string, ParticipantInfo>;
  /** Monotonic roster version — bumped on every membership mutation so
   *  clients can reject stale/out-of-order roster deltas. */
  rosterSeq: number;
  /** Stay Connected: both devices asked to keep the room alive until one
   *  explicitly closes it. Exempts the room from every TTL sweep — it only
   *  dies when a seated device emits close_room. */
  stayConnected?: boolean;
  /** Set once the room has EVER held two live peers — the honest "rooms
   *  made" increment fires exactly then (see countConnectedIfFirst), never
   *  at room creation. Creator-alone rooms, refreshes, and abandoned
   *  pairings must not inflate the public tracker. */
  countedConnected?: boolean;
}

/** Internal abuse guard on room size — a resource policy, NOT a product cap:
 *  the UI never shows or enforces a limit. 64 seats is far beyond any real
 *  sharing room while bounding per-room fan-out for hostile clients. */
const MAX_PARTICIPANTS = 64;

/** Live (socket still connected) participants, in join order. */
function liveParticipants(room: Room): ParticipantInfo[] {
  const out: ParticipantInfo[] = [];
  for (const p of room.participants.values()) {
    if (io.sockets.sockets.has(p.socketId)) out.push(p);
  }
  return out;
}

/** The wire shape of a roster entry — nothing sensitive (no sockets, no ids
 *  beyond the room-scoped participant id). */
function rosterList(room: Room) {
  return [...room.participants.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(p => ({ id: p.id, name: p.name, platform: p.platform, joinedAt: p.joinedAt }));
}

function participantBySocket(room: Room, socketId: string): ParticipantInfo | null {
  for (const p of room.participants.values()) {
    if (p.socketId === socketId) return p;
  }
  return null;
}

/** Resolve a "to" field to a LIVE socket in this room. Accepts a participant
 *  id (the modern wire form) or a raw socket id (legacy clients that echoed
 *  the old peerId=socketId payloads) — both stay routable. */
function resolveRoomTarget(room: Room, to: unknown): string | null {
  if (typeof to !== 'string' || !to) return null;
  const p = room.participants.get(to);
  if (p && io.sockets.sockets.has(p.socketId)) return p.socketId;
  if (room.activePeers.has(to) && io.sockets.sockets.has(to)) return to;
  return null;
}

/** Seat (or re-seat) a participant. Returns 'reclaimed' when a KNOWN
 *  participant id takes its seat back (refresh/reconnect — the room must
 *  learn it is the same logical device), 'seated' for a genuinely new
 *  member, 'full' only at the internal abuse guard. */
function seatParticipant(
  room: Room,
  socketId: string,
  info: { id: string; name: string; platform: string }
): 'seated' | 'reclaimed' | 'full' {
  const existing = room.participants.get(info.id);
  if (existing) {
    if (existing.socketId !== socketId) room.activePeers.delete(existing.socketId);
    existing.socketId = socketId;
    existing.name = info.name;
    existing.platform = info.platform;
    room.activePeers.add(socketId);
    return 'reclaimed';
  }
  if (liveParticipants(room).length >= MAX_PARTICIPANTS) return 'full';
  room.participants.set(info.id, {
    id: info.id,
    socketId,
    name: info.name,
    platform: info.platform,
    joinedAt: Date.now(),
  });
  room.activePeers.add(socketId);
  return 'seated';
}

/** Remove a participant from the roster (its socketId may be stale). */
function removeParticipant(room: Room, participantId: string): boolean {
  const p = room.participants.get(participantId);
  if (!p) return false;
  room.participants.delete(participantId);
  // Only free the socket mirror if this participant still owns the socket —
  // a reclaimed seat may have moved the socket to a newer participant record.
  const owner = participantBySocket(room, p.socketId);
  if (!owner) room.activePeers.delete(p.socketId);
  room.rosterSeq++;
  return true;
}

/** Fire the lifetime "rooms made" increment exactly when THIS room first
 *  holds two LIVE participants — a real multi-device connection. A seat held
 *  only by disconnect grace (its socket is gone) doesn't count: the devices
 *  must actually be connected at the same moment. Idempotent per room via
 *  countedConnected; reseat/recovery paths that re-add a participant to an
 *  already-counted room never re-increment. */
function countConnectedIfFirst(room: Room) {
  if (room.countedConnected) return;
  const live = liveParticipants(room);
  if (live.length < 2) return;
  room.countedConnected = true;
  count('rooms.created');
  log('rooms-made incremented', room.id.slice(0, 8), `${live.length} live participants seated`);
}

const rooms = new Map<string, Room>();

// --- Stay Connected durability ---------------------------------------------
// A Stay Connected promise must survive a server restart/redeploy. The
// registry stores { roomId: sha256(secret) } — NEVER the secret itself. On
// resume, a device proves ownership by presenting the full secret, which is
// hashed and compared; the id alone reveals nothing usable.
const STAY_FILE = path.join(process.cwd(), '.stay-rooms.json');
const STAY_REGISTRY_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // promises die after 30 idle days
const stayRooms = new Map<string, string>(); // roomId -> sha256(secret)

function secretHash(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function loadStayRooms(): void {
  try {
    const raw = JSON.parse(readFileSync(STAY_FILE, 'utf8')) as { savedAt?: number; rooms?: Record<string, string> };
    if (!raw || typeof raw !== 'object' || !raw.rooms) return;
    // Prune the whole registry if it went untouched past the max age — a
    // month-old promise is noise, and this keeps the file from growing forever.
    if (typeof raw.savedAt === 'number' && Date.now() - raw.savedAt > STAY_REGISTRY_MAX_AGE) return;
    for (const [id, hash] of Object.entries(raw.rooms)) {
      if (typeof id === 'string' && id.length <= 64 && typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash)) {
        stayRooms.set(id, hash);
      }
    }
  } catch { /* no file yet or unreadable — start empty */ }
}

function persistStayRooms(): void {
  try {
    writeFileSync(STAY_FILE, JSON.stringify({ savedAt: Date.now(), rooms: Object.fromEntries(stayRooms) }));
  } catch { /* best-effort durability; the in-memory set still works */ }
}

function rememberStayRoom(roomId: string, secret: string): void {
  stayRooms.set(roomId, secretHash(secret));
  persistStayRooms();
}

function forgetStayRoom(roomId: string): void {
  if (stayRooms.delete(roomId)) persistStayRooms();
}

loadStayRooms();

// --- Nearby device discovery ------------------------------------------------
// An optional, ephemeral presence pool for the landing page: devices that are
// merely OPEN on ShareTexts (not seated in a room) can appear to each other so
// the user can tap a device and start the EXISTING create→link-join flow.
//
// Scope & privacy rules:
//   · Presence is EPHEMERAL — entries expire after PRESENCE_TTL without a
//     keepalive announce, and every withdrawal/expiry is broadcast.
//   · The frontend never receives IPs or permanent identifiers. Each announce
//     gets a rotating opaque token (sha256(deviceId + server secret)) — the
//     deviceId itself stays on the server, so a long-lived id can't be tracked
//     across sessions from the wire.
//   · Discovery ≠ connection: nothing here opens a WebRTC session. Selecting
//     a device sends an INVITE; the receiving user must ACCEPT; only then is
//     the inviter given a fresh roomId+secret through the normal join_with_link
//     path, reusing every existing room/security/transfer mechanism.
//   · Only roomless sockets may announce. A seated device is invisible here.
const PRESENCE_TTL = 90_000;          // an entry dies after 90s without keepalive
const PRESENCE_SWEEP_MS = 30_000;     // sweep cadence (also broadcasts removals)
const PRESENCE_BROADCAST_MIN_MS = 800;// coalesce list broadcasts (no per-announce spam)
const PRESENCE_MAX_DEVICES = 24;      // pool cap — this is a pairing lobby, not a directory
const PRESENCE_NAME_MAX = 32;

// Rotating-token salt: a random per-process value. Tokens are thus only
// meaningful within one server lifetime — another ephemeral layer.
const presenceSalt = crypto.randomBytes(16).toString('hex');
interface PresenceEntry { socketId: string; name: string; token: string; announcedAt: number; kind: string; browser: string; model: string; gpu: string; }
const presenceByDevice = new Map<string, PresenceEntry>();
const presenceBySocket = new Map<string, string>(); // socketId → deviceId

function presenceToken(deviceId: string): string {
  return crypto.createHash('sha256').update(deviceId + presenceSalt).digest('hex').slice(0, 32);
}

function sanitizePresenceName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const clean = s
    .replace(/[\x00-\x1F\x7F]/g, '') // control chars (incl. newlines — names render as text)
    .replace(/[<>]/g, '')            // angle brackets: names must never read as markup
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, PRESENCE_NAME_MAX);
  return clean || 'Unnamed device';
}

/** Display-hint validation: device kind + browser label ride the announce
 *  payload purely for the detection overlay. Everything else is stripped. */
const PRESENCE_KINDS = new Set(['phone', 'tablet', 'desktop']);
const PRESENCE_BROWSER_MAX = 20;
const PRESENCE_MODEL_MAX = 40;
const PRESENCE_GPU = new Set(['NVIDIA', 'AMD', 'Intel', 'Apple']);
function sanitizePresenceKind(raw: unknown): string {
  return typeof raw === 'string' && PRESENCE_KINDS.has(raw) ? raw : 'desktop';
}
function sanitizePresenceBrowser(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, PRESENCE_BROWSER_MAX);
}
/** Model string (Android build UA) — sanitized/capped display hint. */
function sanitizePresenceModel(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, PRESENCE_MODEL_MAX);
}
function sanitizePresenceGpu(raw: unknown): string {
  return typeof raw === 'string' && PRESENCE_GPU.has(raw) ? raw : '';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Push the current device list to every connected socket. Coalesced: at most
 *  one broadcast per PRESENCE_BROADCAST_MIN_MS, always the latest state. */
let presenceBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcastPresenceList(): void {
  if (presenceBroadcastTimer) return;
  presenceBroadcastTimer = setTimeout(() => {
    presenceBroadcastTimer = null;
    const devices = [...presenceByDevice.values()]
      .sort((a, b) => a.announcedAt - b.announcedAt)
      .map(e => ({ id: e.token, name: e.name, kind: e.kind, browser: e.browser, model: e.model, gpu: e.gpu }));
    io.emit('presence_list', { devices });
  }, PRESENCE_BROADCAST_MIN_MS);
}

function withdrawPresence(socketId: string): void {
  const deviceId = presenceBySocket.get(socketId);
  if (!deviceId) return;
  const entry = presenceByDevice.get(deviceId);
  presenceBySocket.delete(socketId);
  if (entry && entry.socketId === socketId) {
    presenceByDevice.delete(deviceId);
    broadcastPresenceList();
  }
}

// Nearby-discovery sweep: expire stale announcements (device closed the tab /
// network blip) and broadcast removals on the coalesced cadence.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [deviceId, entry] of presenceByDevice.entries()) {
    if (now - entry.announcedAt > PRESENCE_TTL || !io.sockets.sockets.has(entry.socketId)) {
      presenceByDevice.delete(deviceId);
      if (presenceBySocket.get(entry.socketId) === deviceId) presenceBySocket.delete(entry.socketId);
      changed = true;
    }
  }
  if (changed) broadcastPresenceList();
}, PRESENCE_SWEEP_MS);



// Track which rooms a just-disconnected socket belonged to so that when it
// reconnects via connectionStateRecovery we can notify the other peer.
const socketRooms = new Map<string, Set<string>>();

// Per-socket participant identity: socketId → (roomId → stable participant
// id). Join/resume handlers fill it; the connectionStateRecovery handler
// below reads it to give a returning socket its OLD participant seat back.
// Cleaned up when the recovery window closes (confirmed eviction or recovery).
const socketParticipants = new Map<string, Map<string, string>>();

// Disconnect grace: a device that briefly closes its tab (or blips off the
// network) must NOT tear the room down for the other device. We hold its
// seat and stay quiet for this window; only if it truly does not come back
// do we free the seat and tell the peer. Recovery/rejoin cancels the timer.
const DISCONNECT_GRACE_MS = 60_000;
const pendingGrace = new Map<string, ReturnType<typeof setTimeout>>();

function cancelGrace(socketId: string) {
  const t = pendingGrace.get(socketId);
  if (t) {
    clearTimeout(t);
    pendingGrace.delete(socketId);
  }
}

/**
 * Free any seat this socket still holds in rooms other than `keepRoomId`.
 * Covers the "reconnect with a code" flow: the returning device often comes
 * back on a FRESH socket (its old one was reaped), so `resume_room` alone
 * can't clean up. Without this sweep, the room's old seat blocks the rejoin
 * with "This session already has two devices" forever.
 */
function releaseStaleSeats(socketId: string, keepRoomId?: string) {
  for (const [rid, room] of rooms.entries()) {
    if (rid === keepRoomId) continue;
    if (!room.activePeers.has(socketId)) continue;
    room.activePeers.delete(socketId);
    // Free the roster seat too, and tell the survivors WHICH participant left
    // (participant id — stable across the room's life).
    const gone = participantBySocket(room, socketId);
    if (gone) removeParticipant(room, gone.id);
    io.to(rid).emit('peer_disconnected', { peerId: gone?.id || socketId, remaining: liveParticipants(room).length });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    // Stay Connected rooms are exempt from idle/empty expiry — they live
    // until a device explicitly disconnects. (TTLs guard against abandoned
    // rooms piling up; an explicit user promise overrides that guard.)
    if (room.stayConnected) continue;
    if (now - room.lastActive > ROOM_TTL) {
      rooms.delete(id);
      io.to(id).emit('room_closed', { reason: 'idle_timeout' });
    } else if (room.activePeers.size === 0 && now - room.lastActive > ROOM_EMPTY_TTL) {
      rooms.delete(id);
    }
  }
}, 60000);

// --- Abuse protection ------------------------------------------------------

const createAttempts = new Map<string, { count: number, resetAt: number }>();
const codeAttempts = new Map<string, { count: number, resetAt: number }>();
const pushAttempts = new Map<string, { count: number, resetAt: number }>();

function limited(ip: string, map: Map<string, { count: number, resetAt: number }>, max: number, windowMs: number): boolean {
  const now = Date.now();
  let entry = map.get(ip);
  if (entry && now > entry.resetAt) entry = undefined;
  if (!entry) {
    entry = { count: 1, resetAt: now + windowMs };
  } else {
    entry.count++;
  }
  map.set(ip, entry);
  return entry.count > max;
}

// --- Link previews (OG metadata for URLs shared in a room) ------------------
//
// The receiving browser cannot fetch a shared page's HTML itself: cross-origin
// reads are blocked by CORS, and most sites don't send permissive headers.
// This endpoint does the fetch server-side and returns ONLY the metadata a
// preview needs (og:title / og:image / og:description, with plain <title> as
// fallback) — never the page body.
//
// Safety model:
//   • http(s) only; hostnames resolve to public addresses (no localhost /
//     private ranges / link-local metadata endpoints — DNS-rebinding guard);
//   • response capped at 256 KB, content-type must be HTML, 6s timeout;
//   • no cookies/credentials forwarded; redirects re-validated;
//   • 30 requests/min per IP (shared limiter), plus a small URL cache.

const previewAttempts = new Map<string, { count: number, resetAt: number }>();
const previewCache = new Map<string, { data: PreviewData | null, expires: number }>();
const PREVIEW_CACHE_TTL = 10 * 60 * 1000;
// 1 MB read cap: some big sites (YouTube) put their og: tags ~700 KB deep,
// past the old 256 KB truncation. The parse still slices at </head> — the
// cap only bounds how much of a runaway page we'll download.
const PREVIEW_MAX_BYTES = 1024 * 1024;
const PREVIEW_TIMEOUT_MS = 6000;

interface PreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

function previewRateLimited(ip: string): boolean {
  return limited(ip, previewAttempts, 30, 60 * 1000);
}

/** True when a hostname/IP must never be fetched from the server. */
function isPrivateTarget(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    // Dotted quad: check the ranges directly.
    const o = host.split('.').map(Number);
    if (o[0] === 10 || o[0] === 127 || o[0] === 0) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 169 && o[1] === 254) return true; // link-local incl. cloud metadata
    if (o[0] >= 224) return true; // multicast + reserved
    return false;
  }
  if (host === '[' || host.includes('[')) {
    // IPv6 literal: block loopback, link-local (fe80::/10), unique-local (fc00::/7).
    const h = host.replace(/[[\]]/g, '');
    const low = h.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (/^f[cd]/.test(low)) return true;
    if (/^fe[89ab]/.test(low)) return true;
    return false;
  }
  return false;
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    // Property/name attribute, case-insensitive, both attribute orders.
    const re = new RegExp(
      `<meta[^>]*?(?:property|name)=["']${name}["'][^>]*?content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(
      `<meta[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']${name}["']`, 'i');
    const m = html.match(re) || html.match(re2);
    if (m && m[1].trim()) return decodeEntities(m[1].trim());
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } });
}

async function fetchPreview(target: string): Promise<PreviewData | null> {
  let url: URL;
  try { url = new URL(target); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isPrivateTarget(url)) return null;

  // Follow up to 3 redirects, re-validating every hop against the private-
  // target blocklist (a public shortener must not bounce us at 169.254.x.x).
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    if (isPrivateTarget(current)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    try {
      const res = await fetch(current.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ShareTextsBot/1.0; +https://sharetexts.online)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': '*'
        }
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        try { current = new URL(loc, current); } catch { return null; }
        continue; // next hop, re-validated
      }
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || '';
      if (!type.includes('text/html') && !type.includes('application/xhtml')) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      // Read at most PREVIEW_MAX_BYTES — a huge page is truncated, not downloaded.
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < PREVIEW_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value); total += value.byteLength;
      }
      try { await reader.cancel(); } catch { /* stream already closed */ }
      const html = new TextDecoder('utf-8', { fatal: false }).decode(
        concatChunks(chunks, total));
      const head = html.slice(0, html.indexOf('</head>') + 7 || html.length);
      const title = metaContent(head, ['og:title', 'twitter:title'])
        ?? (head.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1]?.trim() ?? null);
      const description = metaContent(head, ['og:description', 'twitter:description', 'description']);
      let image = metaContent(head, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
      if (image) { try { image = new URL(image, current).href; } catch { image = null; } }
      const siteName = metaContent(head, ['og:site_name']) ?? current.hostname.replace(/^www\./, '');
      const clean = (s: string | null) => (s ? s.replace(/\s+/g, ' ').slice(0, 300) : null);
      return { url: current.href, title: clean(title), description: clean(description), image, siteName: clean(siteName) };
    } catch {
      return null; // timeout, DNS failure, abort — no preview is honest
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}

app.get('/api/preview', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (previewRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many preview requests. Try again shortly.' });
  }
  const raw = req.query.url;
  if (typeof raw !== 'string' || raw.length > 2048) {
    return res.status(400).json({ error: 'Bad request. Pass ?url=https://…' });
  }
  let target: URL;
  try { target = new URL(raw); } catch {
    return res.status(400).json({ error: 'Invalid URL.' });
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http(s) URLs can be previewed.' });
  }

  const cacheKey = target.href;
  const cached = previewCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return res.json(cached.data ?? { url: cacheKey, unavailable: true });
  }

  const data = await fetchPreview(target.href);
  previewCache.set(cacheKey, { data, expires: Date.now() + PREVIEW_CACHE_TTL });
  if (previewCache.size > 300) {
    // Trim oldest entries — the cache is a courtesy, not a store.
    const oldest = [...previewCache.entries()].sort((a, b) => a[1].expires - b[1].expires)[0];
    if (oldest) previewCache.delete(oldest[0]);
  }
  if (!data) {
    // Honest empty: the client falls back to the plain link card.
    return res.json({ url: cacheKey, unavailable: true });
  }
  res.json(data);
});

// --- Temporary Spaces (F14) — dev backend ----------------------------------

import { SpaceDev } from './src/lib/space/devSpaceBackend';

// Dev stand-in for the Worker's VAPID public key exposure: without real
// keys the client's subscribe() still succeeds locally (the browser accepts
// any applicationServerKey for a local subscription; no push is delivered).
// Production uses the Worker's /space-vapid with the real VAPID public key.
app.get('/space-vapid', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || 'BDevSpacePlaceholderKey_NotARealVapidKey0000000000000000000000000000000000000000' });
});

const spaceDev = new SpaceDev(io);
spaceDev.attachSocketNamespace();
spaceDev.start();
(function mountSpaces() {
  const j = express.json({ limit: '1mb' });
  const jsonPaths = new Set([
    '/create', '/join', '/items/text', '/items/file/init',
    '/items/file/complete', '/items/file/abort',
    '/subscribe', '/unsubscribe', '/heartbeat', '/close',
  ]);
  const rawPaths = new Set(['/items/file/direct', '/items/file/part']);
  app.use('/space/:id', (req, res, next) => {
    // NOTE: inside a mounted middleware req.path is relative to the mount
    // ("/create" for "/space/<id>/create") — keep the leading slash here and
    // in the sets below; stripping it made every comparison fail silently.
    const tail = req.path;
    if (jsonPaths.has(tail)) return j(req, res, (err) => err ? next(err) : next());
    if (rawPaths.has(tail)) return next(); // body stays a stream for the backend
    next();
  });
  spaceDev.mount(app);
})();

// --- Socket handlers -------------------------------------------------------

io.on('connection', (socket) => {
  const ip = clientIp(socket);
  log('socket connected', socket.id.slice(0, 8), 'ip', ip, 'recovered', !!socket.recovered);

  // Per-connection participant bookkeeping: roomId → this device's stable
  // participant id in that room. Join handlers fill it; signal/relay read it
  // to attribute frames on the multi-device wire.
  const socketRoomsById = socketParticipants.get(socket.id) ?? new Map<string, string>();
  socketParticipants.set(socket.id, socketRoomsById);
  const platformLabel = ((): string => {
    try {
      const ua = String(socket.handshake.headers['user-agent'] || '');
      if (/iPhone|iPad|iPod|Android/i.test(ua)) return 'phone';
      return 'desktop';
    } catch { return 'desktop'; }
  })();

  // Malformed client emits (missing ack callback / wrong payload shape)
  // must NEVER crash the signaling process. safeOn wraps every handler:
  // the last argument is normalized to a callable ack when the handler
  // expects one, and any throw is logged instead of killing the process.
  const safeOn = (ev: string, fn: (...args: any[]) => void) => {
    socket.on(ev, (...args: any[]) => {
      try {
        // If the client emitted WITHOUT an ack callback, append a noop so
        // handlers can always call `cb(...)` — payloads are never touched.
        if (args.length === 0 || typeof args[args.length - 1] !== 'function') {
          args.push(() => {});
        }
        fn(...args);
      } catch (err) {
        log('handler error', (err as Error)?.message?.slice(0, 140));
      }
    });
  };

  safeOn('create_room', (payload: { pid?: unknown } | undefined, cb?: (...args: any[]) => void) => {
    const cbFn = typeof payload === 'function' ? payload : cb;
    if (typeof cbFn !== 'function') return;
    if (limited(ip, createAttempts, 20, 60 * 1000)) {
      return cbFn({ success: false, error: 'Too many sessions. Try again shortly.' });
    }

    const roomId = crypto.randomUUID();
    const secret = new OTPAuth.Secret({ size: 16 }).base32;

    const room: Room = {
      id: roomId,
      secret,
      createdAt: Date.now(),
      codeAnchor: Date.now(),
      lastActive: Date.now(),
      activePeers: new Set([socket.id]),
      participants: new Map(),
      rosterSeq: 1,
    };
    const pidRaw = (payload as { pid?: unknown })?.pid;
    const selfId = typeof pidRaw === 'string' && /^[0-9a-f-]{36}$/i.test(pidRaw)
      ? pidRaw
      : crypto.randomUUID();
    room.participants.set(selfId, { id: selfId, socketId: socket.id, name: 'Creator', platform: platformLabel, joinedAt: room.createdAt });
    socketRoomsById.set(roomId, selfId);
    rooms.set(roomId, room);

    socket.join(roomId);
    log('room created', roomId.slice(0, 8), 'by participant', selfId.slice(0, 8));
    // NOTE: rooms.created is NOT fired here. The tracker counts real
    // multi-device connections — countConnectedIfFirst fires it when a second
    // live participant lands.
    countConnectedIfFirst(room);
    // codeAnchor anchors the pairing-code window (90s from room creation,
    // re-anchored on refresh_code when the creator lands on the connect screen).
    cbFn({ success: true, roomId, secret, createdAt: room.codeAnchor, stayConnected: false, participantId: selfId, myParticipantId: selfId, roster: { participants: rosterList(room), seq: room.rosterSeq } });
  });

  safeOn('join_with_code', ({ code, pid: joinPid }, cb) => {
    if (limited(ip, codeAttempts, 10, 60 * 1000)) {
      count('joins.failed:rate_limited');
      return cb({ success: false, error: 'Too many attempts. Try again later.' });
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      // Keep the response shape identical to a miss so we don't leak whether
      // a code is close to being valid.
      count('joins.failed:invalid_code');
      return cb({ success: false, error: 'Invalid or expired code' });
    }

    // The joiner may still hold a stale seat elsewhere (reconnect flow, or
    // a room that closed without a clean leave). Free it before seating.
    releaseStaleSeats(socket.id);

    let matchedRoom: Room | null = null;

    for (const room of rooms.values()) {
      const totp = new OTPAuth.TOTP({
        issuer: "ShareTexts",
        label: "Session",
        algorithm: "SHA1",
        digits: 6,
        period: 90,
        secret: room.secret
      });

      // Room-anchored window: counter = (now - createdAt) / 40s, so the
      // first code is always a full 40s and both devices agree on it.
      const delta = totp.validate({ token: code, window: 3, timestamp: Date.now() - room.codeAnchor });
      if (delta !== null) {
        matchedRoom = room;
        break;
      }
    }

    if (matchedRoom) {
      // The client proves its stable identity with its room-scoped
      // participantId (payload, post-TOTP): a known id reclaims its seat so
      // a refresh rejoins AS THE SAME participant — never a duplicate row.
      const selfId = typeof joinPid === 'string' && /^[0-9a-f-]{36}$/i.test(joinPid) ? joinPid : crypto.randomUUID();
      const result = seatParticipant(matchedRoom, socket.id, { id: selfId, name: 'Device', platform: platformLabel });
      if (result === 'full') {
        count('joins.failed:room_full');
        return cb({ success: false, error: 'This room is at its internal capacity. Please start a new session.' });
      }
      matchedRoom.lastActive = Date.now();
      socket.join(matchedRoom.id);
      countConnectedIfFirst(matchedRoom);
      socketRoomsById.set(matchedRoom.id, selfId);

      log('peer joined room', matchedRoom.id.slice(0, 8));
      // Roster broadcast: the joiner needs the snapshot (join ack carries it),
      // existing members need the delta. Returning members (reclaimed) get a
      // snapshot-shaped delta so the initiator tiebreak (joinedAt) is
      // deterministic on every device.
      const rosterDelta = { type: 'event' as const, event: 'peer_joined', payload: { peerId: selfId, participant: { id: selfId, name: 'Device', platform: platformLabel, joinedAt: matchedRoom.participants.get(selfId)!.joinedAt }, roster: { participants: rosterList(matchedRoom), seq: matchedRoom.rosterSeq }, initiatorId: ([...matchedRoom.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1))[0] || null)?.id ?? null } };
      socket.to(matchedRoom.id).emit('peer_joined', rosterDelta.payload);
      count('joins.succeeded');
      cb({ success: true, roomId: matchedRoom.id, secret: matchedRoom.secret, createdAt: matchedRoom.codeAnchor, participantId: selfId, myParticipantId: selfId, roster: { participants: rosterList(matchedRoom), seq: matchedRoom.rosterSeq } });
    } else {
      count('joins.failed:invalid_code');
      cb({ success: false, error: 'Invalid or expired code' });
    }
  });

  safeOn('join_with_link', ({ roomId, secret, pid: linkPid }, cb) => {
    const room = rooms.get(roomId);
    if (!room) {
      count('joins.failed:session_expired');
      return cb({ success: false, error: 'Room not found' });
    }
    // If a secret is supplied it must match. A fresh link-join has no secret
    // yet (the server hands it out after a successful join).
    if (secret && room.secret !== secret) {
      count('joins.failed:invalid_session');
      return cb({ success: false, error: 'Invalid session' });
    }

    // Reconnect path: free this socket's stale seat in any OTHER room.
    releaseStaleSeats(socket.id, roomId);

    // The client proves its stable identity with its room-scoped
    // participantId (payload, post-secret): a known id reclaims its seat.
    const selfId = typeof linkPid === 'string' && /^[0-9a-f-]{36}$/i.test(linkPid) ? linkPid : crypto.randomUUID();
    const result = seatParticipant(room, socket.id, { id: selfId, name: 'Device', platform: platformLabel });
    if (result === 'full') {
      count('joins.failed:room_full');
      return cb({ success: false, error: 'This room is at its internal capacity. Please start a new session.' });
    }
    room.lastActive = Date.now();
    socket.join(roomId);
    countConnectedIfFirst(room);
    socketRoomsById.set(roomId, selfId);

    // Existing members learn the new/returning member via a delta that also
    // carries the current roster + initiator pick so every device computes
    // the same WebRTC initiator without extra chatter.
    const joinedAt = room.participants.get(selfId)!.joinedAt;
    const seniority = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
    socket.to(roomId).emit('peer_joined', {
      peerId: selfId,
      participant: { id: selfId, name: 'Device', platform: platformLabel, joinedAt },
      roster: { participants: rosterList(room), seq: room.rosterSeq },
      initiatorId: seniority[0]?.id ?? null,
    });
    count('joins.succeeded');
    cb({ success: true, roomId, secret: room.secret, createdAt: room.codeAnchor, stayConnected: !!room.stayConnected, participantId: selfId, myParticipantId: selfId, roster: { participants: rosterList(room), seq: room.rosterSeq } });
  });

  // Resolve a stable /s/<code> share link to the room it points at. The
  // short code is the room's UUID (dashes removed, first 8 chars) — stable
  // for the room's life, unlike the rotating 6-digit pairing code.
  safeOn('resolve_short_code', ({ code }, cb) => {
    if (typeof code !== 'string' || !/^[0-9a-f]{8}$/i.test(code)) {
      return cb({ success: false, error: 'Invalid link' });
    }
    const key = code.toLowerCase();
    for (const room of rooms.values()) {
      if (room.id.replace(/-/g, '').slice(0, 8) === key) {
        count('links.resolved');
        return cb({ success: true, roomId: room.id, secret: room.secret, createdAt: room.codeAnchor, stayConnected: !!room.stayConnected });
      }
    }
    cb({ success: false, error: 'Invalid link' });
  });

  // Rejoin after a page refresh — or after a RESTART, for Stay Connected
  // rooms. Requires the session secret, which only a device that previously
  // joined the room can hold.
  safeOn('resume_room', ({ roomId, secret, pid: resumePid }, cb) => {
    let room = rooms.get(roomId);
    if (!room || room.secret !== secret) {
      // Restart resurrection: if this room carries a live Stay Connected
      // promise and the caller presents the right secret, rebuild it with a
      // fresh code window. The room was memory-only before; the registry
      // (roomId → secret hash) is what made it durable.
      if (stayRooms.get(roomId) === secretHash(secret)) {
        room = {
          id: roomId,
          secret,
          createdAt: Date.now(),
          codeAnchor: Date.now(),
          lastActive: Date.now(),
          activePeers: new Set<string>(),
          participants: new Map(),
          rosterSeq: 1,
          stayConnected: true,
        };
        rooms.set(roomId, room);
        log('stay resurrect', roomId.slice(0, 8), 'peer', socket.id.slice(0, 8));
        count('stay.resurrected');
      } else {
        return cb({ success: false, error: 'Session expired' });
      }
    }

    // Drop stale participants whose sockets are gone AND whose disconnect
    // grace has NOT claimed them yet — a grace-held seat belongs to a device
    // that may return (refresh window); evicting it here would strand its
    // return. A participant whose socket is STILL live is a real device that
    // must never be silently evicted from a multi-device room.
    for (const p of [...room.participants.values()]) {
      if (p.id !== socket.id && !io.sockets.sockets.has(p.socketId) && !pendingGrace.has(p.socketId)) {
        removeParticipant(room, p.id);
      }
    }
    if (room.activePeers.size === 0) room.activePeers.clear();

    // Reconnect path: free this socket's stale seat in any OTHER room.
    releaseStaleSeats(socket.id, roomId);

    // Resume carries the stable participantId (post-secret proof): a known
    // id reclaims its seat (same logical device); an unknown id is a new
    // member of a room this device had not seated in before.
    const selfId = typeof resumePid === 'string' && /^[0-9a-f-]{36}$/i.test(resumePid) ? resumePid : crypto.randomUUID();
    const result = seatParticipant(room, socket.id, { id: selfId, name: 'Device', platform: platformLabel });
    if (result === 'full') {
      return cb({ success: false, error: 'This room is at its internal capacity. Please start a new session.' });
    }
    room.lastActive = Date.now();
    socket.join(roomId);
    countConnectedIfFirst(room);
    socketRoomsById.set(roomId, selfId);

    // Tell the other (live) members to re-establish WebRTC with us. A
    // RECLAIMED seat means the same logical device returned → survivors
    // re-offer to it (peer_recovered semantics). A genuinely NEW seat is a
    // roster join → the delta decides the initiator deterministically.
    if (result === 'reclaimed') {
      room.rosterSeq++;
      socket.to(roomId).emit('peer_recovered', { peerId: selfId, roster: { participants: rosterList(room), seq: room.rosterSeq } });
    } else {
      const seniority = [...room.participants.values()].sort((a, b) => a.joinedAt - b.joinedAt || (a.id < b.id ? -1 : 1));
      socket.to(roomId).emit('peer_joined', {
        peerId: selfId,
        participant: { id: selfId, name: 'Device', platform: platformLabel, joinedAt: room.participants.get(selfId)!.joinedAt },
        roster: { participants: rosterList(room), seq: room.rosterSeq },
        initiatorId: seniority[0]?.id ?? null,
      });
    }
    cb({ success: true, roomId, secret: room.secret, createdAt: room.codeAnchor, stayConnected: !!room.stayConnected, participantId: selfId, myParticipantId: selfId, roster: { participants: rosterList(room), seq: room.rosterSeq } });
  });

  // The creator reached the connect screen — re-anchor the code window so the
  // countdown always starts fresh at 90s. Safe: the ±1 validation window keeps
  // the previous code valid for one more period, so a joiner mid-typing still
  // connects. Only a seated peer holding the room secret can refresh.
  safeOn('refresh_code', ({ roomId, secret }, cb) => {
    // The secret is the room credential (128-bit random) — possession of it
    // means the device already joined this room. We deliberately do NOT check
    // activePeers here: right after a page reload this socket re-joins via
    // resume_room asynchronously, and the creator's code screen must be able
    // to re-anchor before that completes.
    const room = rooms.get(roomId);
    if (!room || room.secret !== secret) {
      return cb?.({ success: false, error: 'Invalid session' });
    }
    room.codeAnchor = Date.now();
    room.lastActive = Date.now();
    cb?.({ success: true, createdAt: room.codeAnchor });
  });

  safeOn('signal', ({ roomId, to, signal }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ success: false, error: 'Room not found' });
    if (!room.activePeers.has(socket.id)) return cb?.({ success: false, error: 'Not a member' });
    // SDP offers/answers are a few KB; anything larger is junk.
    if (signal && typeof signal === 'object' && JSON.stringify(signal).length > 64 * 1024) {
      return cb?.({ success: false, error: 'Signal too large' });
    }
    room.lastActive = Date.now();

    // Targeted delivery for point-to-point negotiation (multi-device: offers
    // go to ONE participant, never the whole room). `to` is a participant id
    // on the current wire; a raw socket id (legacy echo) still resolves.
    const fromId = participantBySocket(room, socket.id)?.id ?? socket.id;
    if (to) {
      const targetSocket = resolveRoomTarget(room, to);
      if (targetSocket) {
        socket.to(targetSocket).emit('signal', { from: fromId, signal });
      }
    } else {
      socket.to(roomId).emit('signal', { from: fromId, signal });
    }
    cb?.({ success: true });
  });
  safeOn('relay_message', ({ roomId, to, data }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ success: false, error: 'Room not found' });
    if (!room.activePeers.has(socket.id)) return cb?.({ success: false, error: 'Not a member' });
    // Relay carries small signaling text AND encrypted file chunks when
    // the WebRTC data channel is unavailable or wedged. Chunk packets are
    // CHUNK_SIZE (128 KB) payload + a 20-byte header + AES-GCM overhead,
    // so the binary cap must clear that comfortably. Bulk transfer always
    // prefers the channel, so generous per-message caps are safe.
    const isString = typeof data === 'string';
    // socket.io delivers binary attachments to Node as Buffer, not
    // ArrayBuffer — checking only for ArrayBuffer rejected EVERY binary relay
    // chunk ("Message too large"), silently killing the file-relay fallback.
    const isChunk = data instanceof ArrayBuffer || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data));
    if ((isString && data.length > 512 * 1024) || (isChunk && data.byteLength > 256 * 1024) || (!isString && !isChunk)) {
      return cb?.({ success: false, error: 'Message too large' });
    }
    room.lastActive = Date.now();

    count(isString ? 'relay.text_messages' : 'relay.binary_messages');
    // Multi-device relay: targeted when the sender addressed one participant,
    // broadcast to the other members otherwise (the 1-to-1 case is unchanged
    // — two participants, so "broadcast" still reaches exactly the peer).
    const fromId = participantBySocket(room, socket.id)?.id ?? socket.id;
    const toSocket = to != null ? resolveRoomTarget(room, to) : null;
    if (toSocket) {
      socket.to(toSocket).emit('relay_message', { from: fromId, data });
    } else {
      socket.to(roomId).emit('relay_message', { from: fromId, data });
    }
    cb?.({ success: true });
  });
  safeOn('close_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.activePeers.has(socket.id)) {
      rooms.delete(roomId);
      socketRoomsById.delete(roomId);
      // An explicit close ends even a Stay Connected promise — drop it from
      // the durability registry so nothing revives a room the user ended.
      forgetStayRoom(roomId);
      io.to(roomId).emit('room_closed', { reason: 'manual_close' });
      count('rooms.closed:manual_close');
    }
  });

  // --- Stay Connected -------------------------------------------------------
  // Either seated device can flip the switch (both sides render a toggle in
  // the room UI); the server is the source of truth and echoes the state to
  // the WHOLE room so both badges always agree.
  safeOn('stay_connected_enable', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room || !room.activePeers.has(socket.id)) {
      return cb?.({ success: false, error: 'Not a member' });
    }
    room.stayConnected = true;
    // Survive-restart durability: store the room id + a hash of its secret
    // (never the secret) so a redeploy can still honor the promise.
    rememberStayRoom(roomId, room.secret);
    io.to(roomId).emit('stay_connected_state', { enabled: true });
    count('stay.enabled');
    cb?.({ success: true, enabled: true });
  });

  safeOn('stay_connected_disable', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (!room || !room.activePeers.has(socket.id)) {
      return cb?.({ success: false, error: 'Not a member' });
    }
    room.stayConnected = false;
    forgetStayRoom(roomId);
    io.to(roomId).emit('stay_connected_state', { enabled: false });
    count('stay.disabled');
    cb?.({ success: true, enabled: false });
  });

safeOn('presence_announce', (payload: { deviceId?: unknown; name?: unknown; kind?: unknown; browser?: unknown; model?: unknown; gpu?: unknown }, cb) => {
  // Roomless devices only: a seated device already has a partner and must not
  // appear in the landing-page lobby.
  const seated = [...rooms.values()].some(r => r.activePeers.has(socket.id));
  if (seated) return cb?.({ success: false, error: 'In a room' });
  if (!payload || typeof payload.deviceId !== 'string' || !UUID_RE.test(payload.deviceId)) {
    return cb?.({ success: false, error: 'Invalid deviceId' });
  }
  const name = sanitizePresenceName(payload.name);
  const now = Date.now();
  const prev = presenceByDevice.get(payload.deviceId);
  if (prev && prev.socketId !== socket.id && presenceBySocket.get(prev.socketId) === payload.deviceId) {
    presenceBySocket.delete(prev.socketId); // same device re-announced from a fresh socket
  }
  presenceByDevice.set(payload.deviceId, {
    socketId: socket.id,
    name,
    token: presenceToken(payload.deviceId),
    announcedAt: now,
    kind: sanitizePresenceKind(payload.kind),
    browser: sanitizePresenceBrowser(payload.browser),
    model: sanitizePresenceModel(payload.model),
    gpu: sanitizePresenceGpu(payload.gpu),
  });
  presenceBySocket.set(socket.id, payload.deviceId);
  socket.join('presence'); // lobby room: invites target the pool without scanning every socket
  count('presence.announced');
  cb?.({ success: true, token: presenceToken(payload.deviceId) });
  broadcastPresenceList();
});

safeOn('presence_withdraw', () => {
  withdrawPresence(socket.id);
});

safeOn('presence_update', (payload: { name?: unknown }) => {
  const deviceId = presenceBySocket.get(socket.id);
  if (!deviceId) return;
  const entry = presenceByDevice.get(deviceId);
  if (!entry || entry.socketId !== socket.id) return;
  const name = sanitizePresenceName(payload?.name);
  if (name !== entry.name) {
    entry.name = name;
    broadcastPresenceList();
  }
});

// Selecting a nearby device. The inviter only says WHICH device; the server
// resolves its current socket and forwards the invitation. If the invitee
// accepts, THEIR client calls create_room and hands the inviter the fresh
// roomId+secret — the inviter joins via the normal link path, so the secret
// originates from the accepting device's own room creation.
safeOn('presence_invite', ({ deviceId }: { deviceId?: unknown }, cb) => {
  const fromDeviceId = presenceBySocket.get(socket.id);
  if (!fromDeviceId) return cb?.({ success: false, error: 'Not present' });
  if (typeof deviceId !== 'string' || deviceId.length !== 32 || !/^[0-9a-f]{32}$/.test(deviceId)) {
    return cb?.({ success: false, error: 'Invalid deviceId' });
  }
  const entry = presenceByDevice.get(fromDeviceId);
  if (!entry) return cb?.({ success: false, error: 'Not present' });
  const target = [...presenceByDevice.entries()].find(([, e]) => e.token === deviceId);
  if (!target) {
    count('presence.invite_failed:gone');
    return cb?.({ success: false, error: 'Device no longer available' });
  }
  const [targetDeviceId, targetEntry] = target;
  if (targetDeviceId === fromDeviceId) return cb?.({ success: false, error: 'Invalid deviceId' });
  const targetSocket = io.sockets.sockets.get(targetEntry.socketId);
  if (!targetSocket) {
    presenceByDevice.delete(targetDeviceId);
    broadcastPresenceList();
    return cb?.({ success: false, error: 'Device no longer available' });
  }
  targetSocket.emit('presence_invitation', { from: entry.token, name: entry.name, kind: entry.kind, browser: entry.browser, model: entry.model, gpu: entry.gpu });
  count('presence.invited');
  cb?.({ success: true });
});

// The invitee's answer. For accept, the invitee's client ALSO created a room
// and passes its fresh roomId+secret; the server relays those to the inviter
// only (never broadcast). The inviter then runs the ordinary join_with_link.
safeOn('presence_invite_result', (payload: { to?: unknown; accepted?: unknown; roomId?: unknown; secret?: unknown }, cb) => {
  const fromDeviceId = presenceBySocket.get(socket.id);
  if (!fromDeviceId) return cb?.({ success: false, error: 'Not present' });
  const entry = presenceByDevice.get(fromDeviceId);
  if (!entry) return cb?.({ success: false, error: 'Not present' });
  if (typeof payload?.to !== 'string' || payload.to.length !== 32) {
    return cb?.({ success: false, error: 'Invalid target' });
  }
  const accepted = payload.accepted === true;
  let fwd: { accepted: boolean; roomId?: string; secret?: string } = { accepted };
  if (accepted) {
    if (typeof payload.roomId !== 'string' || !UUID_RE.test(payload.roomId) ||
        typeof payload.secret !== 'string' || payload.secret.length < 16 || payload.secret.length > 64) {
      return cb?.({ success: false, error: 'Invalid room' });
    }
    fwd = { accepted: true, roomId: payload.roomId, secret: payload.secret };
  }
  const target = [...presenceByDevice.entries()].find(([, e]) => e.token === payload.to);
  if (!target) return cb?.({ success: false, error: 'Device no longer available' });
  const targetSocket = io.sockets.sockets.get(target[1].socketId);
  if (!targetSocket) return cb?.({ success: false, error: 'Device no longer available' });
  targetSocket.emit('presence_invite_result', fwd);
  count(accepted ? 'presence.accepted' : 'presence.declined');
  cb?.({ success: true });
});

  socket.on('disconnect', () => {
    // Leave the nearby-discovery lobby: the device must disappear for others
    // the moment its socket dies (before the TTL sweep would remove it).
    withdrawPresence(socket.id);
    // Remember membership so we can emit peer_recovered if this socket comes
    // back through connectionStateRecovery.
    const affected = new Set<string>();
    for (const [id, room] of rooms.entries()) {
      if (room.activePeers.has(socket.id)) {
        // Hold the seat through the grace window instead of evicting
        // immediately — the other devices keep their room without a scary
        // "disconnected" state for a tab refresh or a brief network blip.
        // The PARTICIPANT stays in the roster; the grace only freezes the
        // socket mirror. Recipients go stale for the room, transfers to it
        // are individually retryable — never a room-wide teardown.
        room.lastActive = Date.now();
        affected.add(id);
        cancelGrace(socket.id);
        const pid = socketRoomsById.get(id);
        const timer = setTimeout(() => {
          pendingGrace.delete(socket.id);
          const r = rooms.get(id);
          if (!r) return;
          // The socket came back within the window — keep the seat.
          if (io.sockets.sockets.has(socket.id)) return;
          if (r.activePeers.has(socket.id)) r.activePeers.delete(socket.id);
          socketParticipants.delete(socket.id); // recovery window is over
          log('peer disconnect confirmed', id.slice(0, 8), 'peer', (pid || socket.id).slice(0, 8));
          io.to(id).emit('peer_disconnected', { peerId: pid || socket.id, remaining: liveParticipants(r).length });
        }, DISCONNECT_GRACE_MS);
        pendingGrace.set(socket.id, timer);
      }
    }
    if (affected.size > 0) {
      socketRooms.set(socket.id, affected);
    }
    log('socket disconnected', socket.id.slice(0, 8), 'rooms affected', affected.size, 'grace', DISCONNECT_GRACE_MS);
  });
});

// Fired when a socket reconnects within the recovery window. Give the device
// its seat back and let the other peer know it's back so WebRTC can be
// re-established.
io.on('connection', (socket) => {
  if (socket.recovered) {
    // Same socket is back within the recovery window — cancel any pending
    // "really gone" eviction from its earlier disconnect.
    cancelGrace(socket.id);
    const roomsToNotify = socketRooms.get(socket.id);
    const byRoom = socketParticipants.get(socket.id);
    if (roomsToNotify) {
      socketRooms.delete(socket.id);
      for (const roomId of roomsToNotify) {
        const room = rooms.get(roomId);
        if (room) {
          // The recovered socket resumes its OLD participant seat when the
          // roster still knows it (same logical device — never a duplicate
          // "Device 2"); otherwise it re-seats as a fresh member.
          const pid = byRoom?.get(roomId);
          const seat = seatParticipant(room, socket.id, { id: pid || crypto.randomUUID(), name: 'Device', platform: 'desktop' });
          if (seat === 'full') continue;
          room.lastActive = Date.now();
          countConnectedIfFirst(room);
          room.rosterSeq++;
          io.to(roomId).emit('peer_recovered', { peerId: pid || socket.id, roster: { participants: rosterList(room), seq: room.rosterSeq } });
        }
      }
    }
  } else {
    // A fresh socket identity that will never recover: its participant map
    // is dead weight — release it once the disconnect grace has resolved.
    // (Live maps for recovered sockets were re-registered on connect.)
    if (!socketParticipants.has(socket.id)) socketParticipants.set(socket.id, new Map());
  }
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
    // Dev parity with production routing: the About page is a static SEO
    // guide served at its canonical URL (vercel.json rewrites it there, and
    // the prod branch maps it explicitly). Registered BEFORE Vite's SPA
    // fallback, which would otherwise serve the app shell and the client
    // would render its 404 view on a 200 status.
    app.get('/about', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'public', 'guides', 'about.html'));
    });
    // Dev parity note: /docs, /privacy and /terms fall through to Vite and
    // render the React views, exactly like production after hydration. The
    // prerendered shells (scripts/seo-routes.mjs → dist/seo/) matter only
    // for crawlers, and crawlers hit production; verify-seo.mjs runs the
    // full raw-HTML audit against a production build instead.
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Hashed build assets are immutable — cache them hard; everything else
    // (html, manifest, icons, guides, og images) revalidates cheaply.
    app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }));
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (/\.[a-z0-9]+$/i.test(filePath) && !filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    }));
    // SPA fallback: only serve index.html for the root path and known SPA
    // routes. All other paths that don't match a static file get a proper
    // 404 — this prevents search engines from indexing nonexistent pages
    // as HTTP 200.
    app.get('*', (req, res) => {
      // The About page is a static SEO guide served at its canonical URL.
      if (req.path === '/about') {
        return res.sendFile(path.join(distPath, 'guides', 'about.html'));
      }
      // Prerendered route shells (scripts/seo-routes.mjs): crawlers and
      // no-JS visitors get real content with per-route metadata; the same
      // files boot the React views on top of themselves.
      if (req.path === '/docs') {
        return res.sendFile(path.join(distPath, 'seo', 'docs.html'));
      }
      if (req.path === '/privacy') {
        return res.sendFile(path.join(distPath, 'seo', 'privacy.html'));
      }
      if (req.path === '/terms') {
        return res.sendFile(path.join(distPath, 'seo', 'terms.html'));
      }
      // Known SPA routes that should get the app shell
      if (req.path === '/' || /^\/s\/[0-9a-f]{8}$/i.test(req.path) || /^\/space\/[0-9a-f-]{36}$/i.test(req.path)) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      // Everything else is a real 404: designed noindex page, correct status.
      res.status(404).sendFile(path.join(distPath, 'seo', '404.html'));
    });
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
