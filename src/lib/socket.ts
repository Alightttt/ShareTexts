import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

// The signaling server. Defaults to same-origin (works for `npm run dev` and
// self-hosted servers that serve the frontend). Static frontends deployed to
// CDNs (Vercel/Netlify) must point this at a running ShareText server, e.g.
// VITE_SOCKET_URL=https://your-server.onrender.com
const SERVER_URL = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.replace(/\/$/, '') || undefined;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SERVER_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      // Cover multi-minute network blips so the recovery window can actually
      // be used.
      reconnectionAttempts: 60,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 8000,
    });
  }
  return socketInstance;
}
