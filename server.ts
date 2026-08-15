import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
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
      styleSrc: ["'self'", "'unsafe-inline'"],
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
        "ws:",
        "wss:",
        "https:",
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

// Anonymous aggregate counters (in-memory, reset on restart). Only event
// categories are counted — never room ids, codes, contents, or IPs.
const metrics: Record<string, number> = {};
function count(name: string) {
  metrics[name] = (metrics[name] ?? 0) + 1;
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

// CORS allowlist. Production must NOT accept `*` — only the intended
// frontend origins. Defaults: localhost dev origins + the Vercel frontend.
// Add your own via ALLOWED_ORIGINS (comma-separated) — render.yaml sets this
// to the Render service URL so same-origin deployments work too.
const allowedOrigins = new Set<string>([
  'http://localhost:3000',
  'http://localhost:3311',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3311',
  'https://share-texts.vercel.app',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
]);

const PORT = process.env.PORT || 3000;

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
  createdAt: number;
  lastActive: number;
  activePeers: Set<string>;
}

const rooms = new Map<string, Room>();

// Track which rooms a just-disconnected socket belonged to so that when it
// reconnects via connectionStateRecovery we can notify the other peer.
const socketRooms = new Map<string, Set<string>>();

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
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

  socket.on('create_room', (cb) => {
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
      lastActive: Date.now(),
      activePeers: new Set([socket.id])
    });

    socket.join(roomId);
    log('room created', roomId.slice(0, 8), 'by', socket.id.slice(0, 8));
    count('rooms.created');
    cb({ success: true, roomId, secret });
  });

  socket.on('join_with_code', ({ code }, cb) => {
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

    let matchedRoom: Room | null = null;

    for (const room of rooms.values()) {
      const totp = new OTPAuth.TOTP({
        issuer: "ShareText",
        label: "Session",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: room.secret
      });

      const delta = totp.validate({ token: code, window: 1 });
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
      cb({ success: true, roomId: matchedRoom.id, secret: matchedRoom.secret });
    } else {
      count('joins.failed:invalid_code');
      cb({ success: false, error: 'Invalid or expired code' });
    }
  });

  socket.on('join_with_link', ({ roomId, secret }, cb) => {
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

    room.joinerId = socket.id;
    room.lastActive = Date.now();
    room.activePeers.add(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit('peer_joined', { peerId: socket.id });
    count('joins.succeeded');
    cb({ success: true, roomId, secret: room.secret });
  });

  // Rejoin after a page refresh. Requires the session secret, which only a
  // device that previously joined the room can hold.
  socket.on('resume_room', ({ roomId, secret }, cb) => {
    const room = rooms.get(roomId);
    if (!room || room.secret !== secret) {
      return cb({ success: false, error: 'Session expired' });
    }

    // Drop stale peers that are no longer connected so the returning device
    // can take its seat back.
    for (const pid of [room.creatorId, room.joinerId]) {
      if (pid && pid !== socket.id && !io.sockets.sockets.get(pid) && room.activePeers.has(pid)) {
        room.activePeers.delete(pid);
      }
    }

    if (room.activePeers.size >= 2 && !room.activePeers.has(socket.id)) {
      return cb({ success: false, error: 'This session already has two devices.' });
    }

    if (!room.activePeers.has(socket.id)) {
      room.activePeers.add(socket.id);
    }
    room.lastActive = Date.now();
    socket.join(roomId);

    // Tell the other (live) peer to re-establish the connection with us.
    socket.to(roomId).emit('peer_joined', { peerId: socket.id });
    cb({ success: true, roomId, secret: room.secret });
  });

  socket.on('signal', ({ roomId, to, signal }, cb) => {
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
  });    socket.on('relay_message', ({ roomId, data }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ success: false, error: 'Room not found' });
    if (!room.activePeers.has(socket.id)) return cb?.({ success: false, error: 'Not a member' });
    // Relay carries small signaling text AND encrypted 64KB file chunks when
    // the WebRTC data channel is unavailable. Bulk transfer always prefers
    // the channel, so generous per-message caps are safe.
    const isString = typeof data === 'string';
    const isChunk = data instanceof ArrayBuffer;
    if ((isString && data.length > 512 * 1024) || (isChunk && data.byteLength > 128 * 1024) || (!isString && !isChunk)) {
      return cb?.({ success: false, error: 'Message too large' });
    }
    room.lastActive = Date.now();

    count(isString ? 'relay.text_messages' : 'relay.binary_messages');
    socket.to(roomId).emit('relay_message', { from: socket.id, data });
    cb?.({ success: true });
  });    socket.on('close_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.activePeers.has(socket.id)) {
      rooms.delete(roomId);
      io.to(roomId).emit('room_closed', { reason: 'manual_close' });
      count('rooms.closed:manual_close');
    }
  });

  socket.on('disconnect', () => {
    // Remember membership so we can emit peer_recovered if this socket comes
    // back through connectionStateRecovery.
    const affected = new Set<string>();
    for (const [id, room] of rooms.entries()) {
      if (room.activePeers.has(socket.id)) {
        room.activePeers.delete(socket.id);
        room.lastActive = Date.now();
        affected.add(id);
        socket.to(id).emit('peer_disconnected', { peerId: socket.id, remaining: room.activePeers.size });
      }
    }
    if (affected.size > 0) {
      socketRooms.set(socket.id, affected);
    }
    log('socket disconnected', socket.id.slice(0, 8), 'rooms affected', affected.size);
  });
});

// Fired when a socket reconnects within the recovery window. Give the device
// its seat back and let the other peer know it's back so WebRTC can be
// re-established.
io.on('connection', (socket) => {
  if (socket.recovered) {
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
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
