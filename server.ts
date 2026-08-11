import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import helmet from 'helmet';

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      // NOTE: `stun:` schemes are not valid connect-src sources; WebRTC is not
      // subject to connect-src anyway, so they were removed.
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

const PORT = process.env.PORT || 3000;

// Rooms are deliberately long-lived so a session can be rejoined for hours.
const ROOM_TTL = 12 * 60 * 60 * 1000;     // rooms idle-expire after 12 hours
const ROOM_EMPTY_TTL = 4 * 60 * 60 * 1000; // rooms stay rejoinable 4h after both peers leave
const RECONNECT_GRACE = 5 * 60 * 1000;    // must match connectionStateRecovery window

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  // Allow a briefly-disconnected device to come back to the same room
  // without losing membership (the reconnection grace period).
  connectionStateRecovery: {
    maxDisconnectionDuration: RECONNECT_GRACE
  }
});

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
  const ip = socket.handshake.address;

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
    cb({ success: true, roomId, secret });
  });

  socket.on('join_with_code', ({ code }, cb) => {
    if (limited(ip, codeAttempts, 10, 60 * 1000)) {
      return cb({ success: false, error: 'Too many attempts. Try again later.' });
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      // Keep the response shape identical to a miss so we don't leak whether
      // a code is close to being valid.
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

      socket.to(matchedRoom.id).emit('peer_joined', { peerId: socket.id });
      cb({ success: true, roomId: matchedRoom.id, secret: matchedRoom.secret });
    } else {
      cb({ success: false, error: 'Invalid or expired code' });
    }
  });

  socket.on('join_with_link', ({ roomId, secret }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb({ success: false, error: 'Room not found' });
    // If a secret is supplied it must match. A fresh link-join has no secret
    // yet (the server hands it out after a successful join).
    if (secret && room.secret !== secret) return cb({ success: false, error: 'Invalid session' });

    if (room.activePeers.size >= 2 && !room.activePeers.has(socket.id)) {
      return cb({ success: false, error: 'This session already has two devices.' });
    }

    room.joinerId = socket.id;
    room.lastActive = Date.now();
    room.activePeers.add(socket.id);
    socket.join(roomId);

    socket.to(roomId).emit('peer_joined', { peerId: socket.id });
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

  socket.on('relay_message', ({ roomId, data }, cb) => {
    const room = rooms.get(roomId);
    if (!room) return cb?.({ success: false, error: 'Room not found' });
    if (!room.activePeers.has(socket.id)) return cb?.({ success: false, error: 'Not a member' });
    room.lastActive = Date.now();

    socket.to(roomId).emit('relay_message', { from: socket.id, data });
    cb?.({ success: true });
  });

  socket.on('close_room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.activePeers.has(socket.id)) {
      rooms.delete(roomId);
      io.to(roomId).emit('room_closed', { reason: 'manual_close' });
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
