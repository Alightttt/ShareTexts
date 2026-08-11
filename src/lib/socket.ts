import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io({
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
