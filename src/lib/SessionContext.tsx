import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { SessionState, ChatMessage, ConnectionType } from '../types';
import { getSocket } from './socket';
import { PeerManager } from './webrtc';

interface SessionContextValue {
  session: SessionState;
  createSession: () => Promise<void>;
  joinWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinWithLink: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (text: string) => void;
  closeSession: () => void;
  leaveView: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    roomId: null,
    secret: null,
    isCreator: false,
    partnerConnected: false,
    connectionType: 'connecting',
    messages: []
  });

  const peerManagerRef = useRef<PeerManager | null>(null);

  useEffect(() => {
    const socket = getSocket();

    socket.on('peer_joined', ({ peerId }) => {
      setSession(s => ({ ...s, partnerConnected: true }));
      // If we are creator, initiate WebRTC connection now
      if (session.isCreator && session.roomId && session.secret) {
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        peerManagerRef.current = new PeerManager(session.roomId, session.secret, true);
        setupPeerManager(peerManagerRef.current);
        peerManagerRef.current.initiateConnection(peerId);
      }
    });

    socket.on('peer_disconnected', () => {
      setSession(s => ({ ...s, partnerConnected: false, connectionType: 'disconnected' }));
    });

    socket.on('room_closed', ({ reason }) => {
      resetSession(reason || 'closed');
    });

    return () => {
      socket.off('peer_joined');
      socket.off('peer_disconnected');
      socket.off('room_closed');
    };
  }, [session.isCreator, session.roomId]);

  const setupPeerManager = (pm: PeerManager) => {
    pm.onConnectionTypeChange = (type) => {
      setSession(s => ({ ...s, connectionType: type }));
    };
    pm.onMessage = (text) => {
      setSession(s => ({
        ...s,
        messages: [...s.messages, { id: crypto.randomUUID(), sender: 'partner', text, timestamp: Date.now() }]
      }));
    };
    pm.onDisconnect = () => {
      setSession(s => ({ ...s, connectionType: 'disconnected' }));
    };
  };

  const createSession = async () => {
    return new Promise<void>((resolve) => {
      getSocket().emit('create_room', (res: { success: boolean; roomId: string; secret: string }) => {
        if (res.success) {
          setSession({
            roomId: res.roomId,
            secret: res.secret,
            isCreator: true,
            partnerConnected: false,
            connectionType: 'connecting',
            messages: []
          });
          resolve();
        }
      });
    });
  };

  const joinWithCode = async (code: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      getSocket().emit('join_with_code', { code }, (res: any) => {
        if (res.success) {
          setupJoiner(res.roomId, res.secret);
        }
        resolve(res);
      });
    });
  };

  const joinWithLink = async (roomId: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      getSocket().emit('join_with_link', { roomId }, (res: any) => {
        if (res.success) {
          setupJoiner(res.roomId, res.secret);
        }
        resolve(res);
      });
    });
  };

  const setupJoiner = (roomId: string, secret: string) => {
    setSession({
      roomId,
      secret,
      isCreator: false,
      partnerConnected: true,
      connectionType: 'connecting',
      messages: []
    });
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    peerManagerRef.current = new PeerManager(roomId, secret, false);
    setupPeerManager(peerManagerRef.current);
  };

  const sendMessage = (text: string) => {
    if (peerManagerRef.current) {
      peerManagerRef.current.send(text);
      setSession(s => ({
        ...s,
        messages: [...s.messages, { id: crypto.randomUUID(), sender: 'me', text, timestamp: Date.now() }]
      }));
    }
  };

  const closeSession = () => {
    if (session.roomId) {
      getSocket().emit('close_room', { roomId: session.roomId });
    }
    resetSession('manual_close');
  };

  const leaveView = () => {
    resetSession();
  };

  const resetSession = (reason?: string) => {
    if (peerManagerRef.current) {
      peerManagerRef.current.destroy();
      peerManagerRef.current = null;
    }
    setSession({
      roomId: null,
      secret: null,
      isCreator: false,
      partnerConnected: false,
      connectionType: 'disconnected',
      messages: [],
      closedReason: reason
    });
  };

  return (
    <SessionContext.Provider value={{ session, createSession, joinWithCode, joinWithLink, sendMessage, closeSession, leaveView }}>
      {children}
    </SessionContext.Provider>
  );
}
