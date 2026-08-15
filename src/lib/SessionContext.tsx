import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { SessionState, ChatMessage, ConnectionType } from '../types';
import { getSocket, devLog, signalingConfigIssue } from './socket';
import { PeerManager, TransferCancelledError } from './webrtc';
import { humanizeError } from './errors';

interface SessionContextValue {
  session: SessionState;
  createSession: () => Promise<void>;
  joinWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinWithLink: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (text: string, attachment?: import('../types').Attachment, file?: File) => void;
  updateMessageAttachment: (messageId: string, updates: Partial<ChatMessage['attachment']>) => void;
  retryTransfer: (messageId: string) => Promise<void>;
  cancelTransfer: (messageId: string) => void;
  setDeviceName: (name: string) => void;
  requestReconnect: () => Promise<void>;
  closeSession: () => void;
  leaveView: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const STORAGE_KEY = 'sharetext.session.v1';
const DEVICE_NAME_KEY = 'sharetext.deviceName';

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}

interface StoredSession {
  roomId: string;
  secret: string;
  isCreator: boolean;
  deviceName?: string;
  partnerName?: string | null;
  messages?: ChatMessage[];
}

// Rooms are persistent: credentials + recent messages live in localStorage so
// a session can be rejoined even after the tab is closed.
function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.roomId === 'string' && typeof parsed.secret === 'string') {
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

function saveStoredSession(s: StoredSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

export function guessDeviceName(): string {
  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored) return stored;
  if (typeof navigator === 'undefined') return 'Guest Device';
  const ua = navigator.userAgent;
  let name = 'Guest Device';
  if (/iPhone/i.test(ua)) name = 'Guest iPhone';
  else if (/iPad/i.test(ua)) name = 'Guest iPad';
  else if (/Android/i.test(ua)) name = 'Guest Android';
  else if (/Windows/i.test(ua)) name = 'Guest Windows PC';
  else if (/Macintosh|Mac OS X/i.test(ua)) name = 'Guest MacBook';
  else if (/Linux/i.test(ua)) name = 'Guest Linux';
  return name;
}

/** Wait until the shared socket is connected, or fail with a friendly error. */
function ensureSocketConnected(timeoutMs = 10000): Promise<void> {
  const socket = getSocket();
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(configIssueMessage() || "Couldn't reach ShareText."));
    }, timeoutMs);
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (err?: { message?: string }) => { cleanup(); reject(new Error(err?.message || configIssueMessage() || "Couldn't reach ShareText.")); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

/** In production with no signaling URL baked into the bundle, say so. */
function configIssueMessage(): string | null {
  return signalingConfigIssue();
}


export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>(() => {
    const stored = loadStoredSession();
    return {
      roomId: stored?.roomId ?? null,
      secret: stored?.secret ?? null,
      isCreator: stored?.isCreator ?? false,
      partnerConnected: false,
      connectionType: 'connecting',
      messages: stored?.messages ?? [],
      deviceName: stored?.deviceName || guessDeviceName(),
      partnerName: stored?.partnerName ?? null
    };
  });

  const peerManagerRef = useRef<PeerManager | null>(null);
  // In-memory File references for failed transfers, so "Retry" can resend
  // the actual bytes. Files aren't serializable (JSON.stringify drops them),
  // so they can't live on the message; this map is keyed by message id and
  // cleared when the session resets.
  const pendingFilesRef = useRef<Map<string, File>>(new Map());

  // Persist the room (credentials + recent messages) so it survives refreshes
  // and closed tabs, making the room feel genuinely persistent.
  useEffect(() => {
    if (!session.roomId || !session.secret) return;
    const timer = setTimeout(() => {
      const payload: StoredSession = {
        roomId: session.roomId,
        secret: session.secret,
        isCreator: session.isCreator,
        deviceName: session.deviceName,
        partnerName: session.partnerName,
        messages: session.messages.slice(-100)
      };
      try {
        const serialized = JSON.stringify(payload);
        // Guard against overflowing localStorage with huge messages.
        if (serialized.length > 3_500_000) {
          payload.messages = [];
        }
        saveStoredSession(payload);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timer);
  }, [session.roomId, session.secret, session.isCreator, session.deviceName, session.partnerName, session.messages]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('peer_joined', ({ peerId }) => {
      // A peer is now in the room — kick off the WebRTC handshake. Don't claim
      // the partner is "connected" yet: ChatView appears only once the data
      // channel actually opens (onOpen) or the relay fallback confirms a
      // working path, so the UI never shows a green badge on a dead link.
      setSession(s => ({ ...s, connectionType: s.connectionType === 'disconnected' ? 'connecting' : s.connectionType }));
      // Whichever device is already in the room initiates the WebRTC
      // handshake. This also covers reconnects after a refresh: the refreshed
      // device rejoins and the remaining peer gets this event and re-offers.
      if (session.roomId && session.secret) {
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        peerManagerRef.current = new PeerManager(session.roomId, session.secret, true);
        setupPeerManager(peerManagerRef.current);
        peerManagerRef.current.initiateConnection(peerId);
      }
    });

    socket.on('peer_recovered', ({ peerId }) => {
      setSession(s => ({ ...s, connectionType: s.connectionType === 'disconnected' ? 'connecting' : s.connectionType }));
      // The peer's transport came back, but the WebRTC connection is gone.
      // Re-establish it from this side.
      if (session.roomId && session.secret && peerId) {
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

    socket.on('connect_error', () => {
      // Surface nothing here; individual actions report their own errors.
    });

    return () => {
      socket.off('peer_joined');
      socket.off('peer_recovered');
      socket.off('peer_disconnected');
      socket.off('room_closed');
      socket.off('connect_error');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isCreator, session.roomId]);

  const setupPeerManager = (pm: PeerManager) => {
    pm.onConnectionTypeChange = (type) => {
      setSession(s => ({ ...s, connectionType: type }));
    };

    pm.onOpen = () => {
      // The data channel opened — treat that as the peer being present,
      // including after a rejoin/recovery when no explicit event arrives.
      setSession(s => ({ ...s, partnerConnected: true }));
    };

    pm.onHello = (name) => {
      setSession(s => ({ ...s, partnerName: name || null }));
    };

    pm.onMessage = (dataStr) => {
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.id && parsed.sender) {
          // New structured format. Dedupe by message id so a retried transfer
          // (metadata re-sent after a failure) doesn't create a duplicate
          // bubble, while still (re)registering the binary expectation.
          const isDuplicate = session.messages.some(m => m.id === parsed.id);
          if (!isDuplicate) {
            // A peer's 'sending' is our 'receiving'.
            const incoming = parsed.attachment && parsed.attachment.status === 'sending'
              ? { ...parsed, attachment: { ...parsed.attachment, status: 'receiving' } }
              : parsed;
            setSession(s => ({
              ...s,
              messages: [...s.messages, incoming]
            }));
          }
          if (parsed.attachment) {
            pm.expectBinaryTransfer(parsed.attachment.id, Math.ceil(parsed.attachment.size / (64 * 1024)));
          }
          return;
        }
      } catch (e) {
        // Fallback
      }
      setSession(s => ({
        ...s,
        messages: [...s.messages, { id: crypto.randomUUID(), sender: 'partner', text: dataStr, timestamp: Date.now() }]
      }));
    };

    pm.onFileProgress = (transferId, progress, total) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                // Progress never changes the state label: the sender stays
                // 'sending', the receiver 'receiving', and a cancelled/failed
                // transfer must not be resurrected by late progress events.
                progress: progress / total
              }
            };
          }
          return m;
        })
      }));
    };

    pm.onFileComplete = (transferId, blob) => {
      const url = URL.createObjectURL(blob);
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                status: 'complete',
                url,
                progress: 1
              }
            };
          }
          return m;
        })
      }));
    };

    // The peer cancelled a transfer (or cancelled ours mid-send). Mark the
    // matching bubble cancelled on this side too.
    pm.onCancel = (transferId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return { ...m, attachment: { ...m.attachment, status: 'cancelled' } };
          }
          return m;
        })
      }));
    };

    pm.onDisconnect = () => {
      setSession(s => ({ ...s, connectionType: 'disconnected' }));
    };
  };

  // Restore an in-progress session after a refresh. Requires the secret, so
  // only a device that already held the room can resume it. Cancellable so
  // React StrictMode's double-mount doesn't leave a zombie PeerManager.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;

    let cancelled = false;
    const socket = getSocket();
    const tryResume = async (attempt = 0): Promise<void> => {
      try {
        await ensureSocketConnected();
      } catch {
        if (cancelled) return;
        saveStoredSession(null);
        setSession(s => ({ ...s, roomId: null, secret: null, isCreator: false }));
        return;
      }
      if (cancelled) return;
      const res = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        socket.emit('resume_room', { roomId: stored.roomId, secret: stored.secret }, resolve);
      });
      if (cancelled) return;
      if (res.success) {
        // Back in the room, but the WebRTC channel is new — the app shows
        // "Connecting…" until it opens, instead of a premature green badge.
        setSession(s => ({
          ...s,
          roomId: stored.roomId,
          secret: stored.secret,
          isCreator: stored.isCreator,
          partnerConnected: false,
          connectionType: 'connecting'
        }));
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        peerManagerRef.current = new PeerManager(stored.roomId, stored.secret, false);
        setupPeerManager(peerManagerRef.current);
      } else if (res.error?.includes('two devices') && attempt < 3) {
        // The previous socket may not have been cleaned up yet; retry shortly.
        setTimeout(() => { if (!cancelled) void tryResume(attempt + 1); }, 1500);
      } else {
        // Room is gone or we lost the credential — start clean.
        saveStoredSession(null);
        setSession(s => ({ ...s, roomId: null, secret: null, isCreator: false, closedReason: 'expired' }));
      }
    };
    void tryResume();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createSession = async () => {
    devLog('Create Session clicked — connecting to socket…');
    await ensureSocketConnected();
    devLog('Socket connected — sending create request');
    return new Promise<void>((resolve, reject) => {
      const socket = getSocket();

      const timeout = setTimeout(() => {
        devLog('Create request timed out');
        reject(new Error("Couldn't reach ShareText."));
      }, 10000);

      socket.emit('create_room', (res: { success: boolean; roomId?: string; secret?: string; error?: string; code?: string }) => {
        clearTimeout(timeout);
        if (res.success && res.roomId && res.secret) {
          devLog('Room created — navigating');
          saveStoredSession({ roomId: res.roomId, secret: res.secret, isCreator: true });
          setSession({
            roomId: res.roomId,
            secret: res.secret,
            isCreator: true,
            partnerConnected: false,
            connectionType: 'connecting',
            messages: [],
            deviceName: session.deviceName,
            partnerName: null
          });
          resolve();
        } else {
          devLog('Create request failed:', res.code || res.error);
          reject(new Error(configIssueMessage() || humanizeError(res.code, res.error || "Couldn't start a session.")));
        }
      });
    });
  };

  const joinWithCode = async (code: string) => {
    await ensureSocketConnected();
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: "Couldn't reach ShareText." });
      }, 10000);
      getSocket().emit('join_with_code', { code }, (res: { success: boolean; roomId?: string; secret?: string; error?: string; code?: string }) => {
        clearTimeout(timeout);
        if (res.success) {
          setupJoiner(res.roomId!, res.secret!);
        }
        resolve({ ...res, error: humanizeError(res.code, res.error || "Couldn't reach ShareText.") });
      });
    });
  };

  const joinWithLink = async (roomId: string) => {
    await ensureSocketConnected();
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: "Couldn't reach ShareText." });
      }, 10000);
      getSocket().emit('join_with_link', { roomId }, (res: { success: boolean; roomId?: string; secret?: string; error?: string; code?: string }) => {
        clearTimeout(timeout);
        if (res.success) {
          setupJoiner(res.roomId!, res.secret!);
        }
        resolve({ ...res, error: humanizeError(res.code, res.error || "Couldn't reach ShareText.") });
      });
    });
  };

  const setupJoiner = (roomId: string, secret: string) => {
    saveStoredSession({ roomId, secret, isCreator: false });
    setSession({
      roomId,
      secret,
      isCreator: false,
      // Not connected yet — the app shows "Connecting…" until the data
      // channel opens (or the relay fallback confirms a working path).
      partnerConnected: false,
      connectionType: 'connecting',
      messages: [],
      deviceName: session.deviceName,
      partnerName: null
    });
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    peerManagerRef.current = new PeerManager(roomId, secret, false);
    setupPeerManager(peerManagerRef.current);
  };

  const sendMessage = async (text: string, attachment?: import('../types').Attachment, file?: File) => {
    if (peerManagerRef.current) {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'me',
        text,
        timestamp: Date.now(),
        attachment: attachment ? { ...attachment, status: file ? 'sending' : 'complete' } : undefined
      };

      if (file) {
        pendingFilesRef.current.set(msg.id, file);
        // Keep the map bounded — only recent transfers can be retried anyway.
        if (pendingFilesRef.current.size > 20) {
          const oldest = pendingFilesRef.current.keys().next().value;
          if (oldest !== undefined) pendingFilesRef.current.delete(oldest);
        }
      }

      setSession(s => ({
        ...s,
        messages: [...s.messages, msg]
      }));

      const partnerMsg = { ...msg, sender: 'partner' };
      const payload = JSON.stringify(partnerMsg);
      await peerManagerRef.current.send(payload);

      if (file && attachment) {
        const localUrl = URL.createObjectURL(file);
        updateMessageAttachment(msg.id, { url: localUrl });

        try {
          await peerManagerRef.current.sendFile(file, attachment.id);
          updateMessageAttachment(msg.id, { status: 'complete', progress: 1 });
        } catch (e) {
          // A user cancel stops the loop cleanly — don't overwrite 'cancelled'.
          if (!(e instanceof TransferCancelledError)) {
            updateMessageAttachment(msg.id, { status: 'failed' });
          }
        }
      }
    }
  };

  /**
   * Re-send a failed file transfer: the metadata packet (so a partner that
   * reloaded re-registers the binary expectation) followed by the file bytes.
   * The receiver dedupes by message id, so a partner that already has the
   * metadata just sees the chunks arrive.
   */
  const retryTransfer = async (messageId: string) => {
    const pm = peerManagerRef.current;
    const file = pendingFilesRef.current.get(messageId);
    if (!pm || !file) return;
    const msg = session.messages.find(m => m.id === messageId);
    if (!msg?.attachment) return;

    updateMessageAttachment(messageId, { status: 'sending', progress: 0 });
    try {
      const partnerMsg: ChatMessage = {
        ...msg,
        sender: 'partner',
        attachment: { ...msg.attachment, status: 'sending', progress: 0 }
      };
      await pm.send(JSON.stringify(partnerMsg));
      await pm.sendFile(file, msg.attachment.id);
      updateMessageAttachment(messageId, { status: 'complete', progress: 1 });
    } catch (e) {
      if (!(e instanceof TransferCancelledError)) {
        updateMessageAttachment(messageId, { status: 'failed' });
      }
    }
  };

  /**
   * Cancel an in-flight file transfer. Works from either side: the local
   * bubble flips to 'cancelled' immediately, the send loop (if ours) stops,
   * and the peer is told via an encrypted control packet.
   */
  const cancelTransfer = (messageId: string) => {
    const pm = peerManagerRef.current;
    const msg = session.messages.find(m => m.id === messageId);
    if (!pm || !msg?.attachment) return;
    if (msg.attachment.status !== 'sending' && msg.attachment.status !== 'receiving') return;
    updateMessageAttachment(messageId, { status: 'cancelled' });
    pm.cancelTransfer(msg.attachment.id);
  };

  const updateMessageAttachment = (messageId: string, updates: Partial<ChatMessage['attachment']>) => {
    setSession(s => {
      return {
        ...s,
        messages: s.messages.map(m => {
          if (m.id === messageId && m.attachment) {
            return {
              ...m,
              attachment: { ...m.attachment, ...updates }
            };
          }
          return m;
        })
      };
    });
  };

  const setDeviceName = (name: string) => {
    try {
      localStorage.setItem(DEVICE_NAME_KEY, name);
    } catch { /* ignore */ }
    setSession(s => ({ ...s, deviceName: name }));
  };

  // Ask the server to put us back in the room and make the other peer
  // re-offer a fresh WebRTC connection. Keeps messages and room state.
  const requestReconnect = async () => {
    const { roomId, secret } = session;
    if (!roomId || !secret) return;
    try {
      await ensureSocketConnected();
    } catch {
      return;
    }
    const res = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      getSocket().emit('resume_room', { roomId, secret }, resolve);
    });
    if (!res.success) return;
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    peerManagerRef.current = new PeerManager(roomId, secret, false);
    setupPeerManager(peerManagerRef.current);
    setSession(s => ({ ...s, connectionType: 'connecting' }));
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
    pendingFilesRef.current.clear();
    saveStoredSession(null);
    setSession(s => ({
      roomId: null,
      secret: null,
      isCreator: false,
      partnerConnected: false,
      connectionType: 'disconnected',
      messages: [],
      closedReason: reason,
      deviceName: s.deviceName,
      partnerName: null
    }));
  };

  return (
    <SessionContext.Provider value={{ session, createSession, joinWithCode, joinWithLink, sendMessage, updateMessageAttachment, retryTransfer, cancelTransfer, setDeviceName, requestReconnect, closeSession, leaveView }}>
      {children}
    </SessionContext.Provider>
  );
}
