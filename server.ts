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
      connectSrc: ["'self'", "ws:", "wss:", "stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

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

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActive > 60 * 60 * 1000) { // 60 min TTL
      rooms.delete(id);
      io.to(id).emit('room_closed', { reason: 'idle_timeout' });
    }
    // Auto-close if empty for 60 seconds
    if (room.activePeers.size === 0 && now - room.lastActive > 60000) {
      rooms.delete(id);
    }
  }
}, 30000);

const codeAttempts = new Map<string, { count: number, resetAt: number }>();

io.on('connection', (socket) => {
  socket.on('create_room', (cb) => {
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
    const ip = socket.handshake.address;
    const now = Date.now();
    let attempt = codeAttempts.get(ip);
    if (attempt && now > attempt.resetAt) {
      attempt = { count: 0, resetAt: now + 60000 };
    }
    if (!attempt) {
      attempt = { count: 1, resetAt: now + 60000 };
    } else {
      attempt.count++;
    }
    codeAttempts.set(ip, attempt);

    if (attempt.count > 10) {
      return cb({ success: false, error: 'Too many attempts. Try again later.' });
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

  socket.on('join_with_link', ({ roomId }, cb) => {
    const room = rooms.get(roomId);
    if (room) {
      if (room.activePeers.size >= 2 && !room.activePeers.has(socket.id)) {
        return cb({ success: false, error: 'This session already has two devices.' });
      }
      room.joinerId = socket.id;
      room.lastActive = Date.now();
      room.activePeers.add(socket.id);
      socket.join(roomId);
      
      socket.to(roomId).emit('peer_joined', { peerId: socket.id });
      cb({ success: true, roomId, secret: room.secret });
    } else {
      cb({ success: false, error: 'Room not found' });
    }
  });

  socket.on('signal', ({ roomId, to, signal }) => {
    const room = rooms.get(roomId);
    if (room) room.lastActive = Date.now();
    if (to) {
      socket.to(to).emit('signal', { from: socket.id, signal });
    } else {
      socket.to(roomId).emit('signal', { from: socket.id, signal });
    }
  });
  
  socket.on('relay_message', ({ roomId, data }) => {
    socket.to(roomId).emit('relay_message', { from: socket.id, data });
  });

  socket.on('close_room', ({ roomId }) => {
    rooms.delete(roomId);
    io.to(roomId).emit('room_closed', { reason: 'manual_close' });
  });

  socket.on('disconnect', () => {
    for (const [id, room] of rooms.entries()) {
      if (room.activePeers.has(socket.id)) {
        room.activePeers.delete(socket.id);
        room.lastActive = Date.now();
        socket.to(id).emit('peer_disconnected', { peerId: socket.id, remaining: room.activePeers.size });
      }
    }
  });
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

  httpServer.listen(PORT, () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
