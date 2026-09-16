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
      scriptSrc: isProd ? ["'self'"] : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
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
  console.log('[ShareText]', ...parts);
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

interface Room {
  id: string;
  secret: string;
  creatorId: string;
  joinerId?: string;
  /** Room creation time — also the pairing-code anchor until refreshed. */
  createdAt: number;
  /** The TOTP anchor. Re-anchored on refresh_code so the creator always sees
   *  a fresh 40s code window on the connect screen; the previous code stays
   *  valid for one more window (±1 validation) so a typing joiner isn't cut off. */
  codeAnchor: number;
  lastActive: number;
  activePeers: Set<string>;
  /** Stay Connected: both devices asked to keep the room alive until one
   *  explicitly closes it. Exempts the room from every TTL sweep — it only
   *  dies when a seated device emits close_room. */
  stayConnected?: boolean;
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

// Track which rooms a just-disconnected socket belonged to so that when it
// reconnects via connectionStateRecovery we can notify the other peer.
const socketRooms = new Map<string, Set<string>>();

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
    if (room.creatorId === socketId) room.creatorId = '';
    if (room.joinerId === socketId) room.joinerId = undefined;
    io.to(rid).emit('peer_disconnected', { peerId: socketId, remaining: room.activePeers.size });
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

// --- Socket handlers -------------------------------------------------------

io.on('connection', (socket) => {
  const ip = clientIp(socket);
  log('socket connected', socket.id.slice(0, 8), 'ip', ip, 'recovered', !!socket.recovered);

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

  safeOn('create_room', (cb) => {
    if (limited(ip, createAttempts, 20, 60 * 1000)) {
      return cb({ success: false, error: 'Too many sessions. Try again shortly.' });
    }

    const roomId = crypto.randomUUID();
    const secret = new OTPAuth.Secret({ size: 16 }).base32;

    rooms.set(roomId, {
      id: roomId,
      secret,
      creatorId: socket.id,
      createdAt: Date.now(),
      codeAnchor: Date.now(),
      lastActive: Date.now(),
      activePeers: new Set([socket.id])
    });

    socket.join(roomId);
    log('room created', roomId.slice(0, 8), 'by', socket.id.slice(0, 8));
    count('rooms.created');
    // codeAnchor anchors the pairing-code window (90s from room creation,
    // re-anchored on refresh_code when the creator lands on the connect screen).
    cb({ success: true, roomId, secret, createdAt: rooms.get(roomId)!.codeAnchor, stayConnected: false });
  });

  safeOn('join_with_code', ({ code }, cb) => {
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
        issuer: "ShareText",
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
      if (matchedRoom.activePeers.size >= 2 && !matchedRoom.activePeers.has(socket.id)) {
        return cb({ success: false, error: 'This session already has two devices.' });
      }

      matchedRoom.joinerId = socket.id;
      matchedRoom.lastActive = Date.now();
      matchedRoom.activePeers.add(socket.id);
      socket.join(matchedRoom.id);

      log('peer joined room', matchedRoom.id.slice(0, 8));
      socket.to(matchedRoom.id).emit('peer_joined', { peerId: socket.id });
      count('joins.succeeded');
      cb({ success: true, roomId: matchedRoom.id, secret: matchedRoom.secret, createdAt: matchedRoom.codeAnchor });
    } else {
      count('joins.failed:invalid_code');
      cb({ success: false, error: 'Invalid or expired code' });
    }
  });

  safeOn('join_with_link', ({ roomId, secret }, cb) => {
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

    if (room.activePeers.size >= 2 && !room.activePeers.has(socket.id)) {
      count('joins.failed:room_full');
      return cb({ success: false, error: 'This session already has two devices.' });
    }

    // Reconnect path: free this socket's stale seat in any OTHER room.
    releaseStaleSeats(socket.id, roomId);

    room.joinerId = socket.id;
    room.lastActive = Date.now();
    room.activePeers.add(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit('peer_joined', { peerId: socket.id });
    count('joins.succeeded');
    cb({ success: true, roomId, secret: room.secret, createdAt: room.codeAnchor, stayConnected: !!room.stayConnected });
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
  safeOn('resume_room', ({ roomId, secret }, cb) => {
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
          creatorId: socket.id,
          createdAt: Date.now(),
          codeAnchor: Date.now(),
          lastActive: Date.now(),
          activePeers: new Set<string>(),
          stayConnected: true,
        };
        rooms.set(roomId, room);
        log('stay resurrect', roomId.slice(0, 8), 'peer', socket.id.slice(0, 8));
        count('stay.resurrected');
      } else {
        return cb({ success: false, error: 'Session expired' });
      }
    }

    // Drop stale peers that are no longer connected so the returning device
    // can take its seat back. Cancel their grace timers — the device is
    // back under a new socket, so the "really gone" notice must never fire.
    for (const pid of [room.creatorId, room.joinerId]) {
      if (pid && pid !== socket.id && !io.sockets.sockets.get(pid) && room.activePeers.has(pid)) {
        room.activePeers.delete(pid);
        cancelGrace(pid);
      }
    }

    if (room.activePeers.size >= 2 && !room.activePeers.has(socket.id)) {
      return cb({ success: false, error: 'This session already has two devices.' });
    }

    // Reconnect path: free this socket's stale seat in any OTHER room.
    releaseStaleSeats(socket.id, roomId);

    if (!room.activePeers.has(socket.id)) {
      room.activePeers.add(socket.id);
    }
    room.lastActive = Date.now();
    socket.join(roomId);

    // Tell the other (live) peer to re-establish the connection with us.
    socket.to(roomId).emit('peer_joined', { peerId: socket.id });
    cb({ success: true, roomId, secret: room.secret, createdAt: room.codeAnchor, stayConnected: !!room.stayConnected });
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

    // Only forward to a peer that is actually in the room.
    if (to) {
      if (room.activePeers.has(to)) {
        socket.to(to).emit('signal', { from: socket.id, signal });
      }
    } else {
      socket.to(roomId).emit('signal', { from: socket.id, signal });
    }
    cb?.({ success: true });
  });
  safeOn('relay_message', ({ roomId, data }, cb) => {
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
    socket.to(roomId).emit('relay_message', { from: socket.id, data });
    cb?.({ success: true });
  });
  safeOn('close_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.activePeers.has(socket.id)) {
      rooms.delete(roomId);
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

  socket.on('disconnect', () => {
    // Remember membership so we can emit peer_recovered if this socket comes
    // back through connectionStateRecovery.
    const affected = new Set<string>();
    for (const [id, room] of rooms.entries()) {
      if (room.activePeers.has(socket.id)) {
        // Hold the seat through the grace window instead of evicting
        // immediately — the other device keeps its room without a scary
        // "disconnected" state for a tab refresh or a brief network blip.
        room.lastActive = Date.now();
        affected.add(id);
        cancelGrace(socket.id);
        const timer = setTimeout(() => {
          pendingGrace.delete(socket.id);
          const r = rooms.get(id);
          if (!r) return;
          // The socket came back within the window — keep the seat.
          if (io.sockets.sockets.has(socket.id)) return;
          if (r.activePeers.has(socket.id)) r.activePeers.delete(socket.id);
          log('peer disconnect confirmed', id.slice(0, 8), 'peer', socket.id.slice(0, 8));
          socket.to(id).emit('peer_disconnected', { peerId: socket.id, remaining: r.activePeers.size });
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
    if (roomsToNotify) {
      socketRooms.delete(socket.id);
      for (const roomId of roomsToNotify) {
        const room = rooms.get(roomId);
        if (room) {
          room.activePeers.add(socket.id);
          room.lastActive = Date.now();
          socket.to(roomId).emit('peer_recovered', { peerId: socket.id });
        }
      }
    }
  }
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: httpServer } },
      appType: "spa",
    });
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
      // Known SPA routes that should get the app shell
      if (req.path === '/' || req.path === '/docs' || req.path === '/privacy' || req.path === '/terms' || /^\/s\/[0-9a-f]{8}$/i.test(req.path)) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      // Everything else is a 404
      res.status(404).sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
