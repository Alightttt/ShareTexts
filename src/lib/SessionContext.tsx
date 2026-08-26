import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { SessionState, ChatMessage, ConnectionType } from '../types';
import { getSocket, devLog, signalingConfigIssue, resolveShortCode, refreshCode as refreshCodeRPC } from './socket';
import { PeerManager, TransferCancelledError, hasSendProgress, clearAllTransferState, clearTransferState, getPartialInfo } from './webrtc';
import { generateKey } from './crypto';
import { humanizeError } from './errors';
import { diag, roomCreateDiagStart, roomCreateDiagEnd } from './diag';
import { sanitizeFilename } from './utils';

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * SHA-256 hex of a Blob/File with bounded memory at any size.
 *
 * Fast path: browsers that accept a Blob directly stream it natively. Some
 * engines (older Chromium, some WebViews) reject Blob in digest() — the
 * fallback then hashes per-64KB slice and combines the per-chunk digests
 * into one final hash. Same corruption-detection power (any changed byte
 * changes a chunk hash), but memory stays at 32 bytes per chunk (~1 MB for
 * a 2 GB file) instead of the whole file.
 */
async function sha256Hex(blob: Blob): Promise<string> {
  try {
    return toHex(await crypto.subtle.digest('SHA-256', blob as unknown as BufferSource));
  } catch {
    // Fallback — chunk-combined digest.
    const CH = 64 * 1024;
    const n = Math.ceil(blob.size / CH);
    const parts = new Uint8Array(n * 32);
    for (let i = 0; i < n; i++) {
      const slice = blob.slice(i * CH, Math.min(blob.size, (i + 1) * CH));
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await slice.arrayBuffer()));
      parts.set(d, i * 32);
    }
    return toHex(await crypto.subtle.digest('SHA-256', parts));
  }
}

interface SessionContextValue {
  session: SessionState;
  createSession: () => Promise<void>;
  joinWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinWithLink: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  joinWithShortCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (text: string, attachment?: import('../types').Attachment, file?: File) => void;
  updateMessageAttachment: (messageId: string, updates: Partial<ChatMessage['attachment']>) => void;
  retryTransfer: (messageId: string) => Promise<void>;
  retryText: (messageId: string) => Promise<void>;
  cancelTransfer: (messageId: string) => void;
  setDeviceName: (name: string) => void;
  requestReconnect: () => Promise<void>;
  refreshCode: () => Promise<void>;
  closeSession: () => void;
  leaveView: () => void;
  abandonSession: () => void;
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
  /** Anchors the 40s pairing-code window across refreshes. */
  createdAt?: number;
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

/**
 * Blob object URLs die with the page — they are page-lifetime artifacts, so
 * they must NEVER be persisted. A restored session that keeps the old `blob:`
 * URL renders a broken preview (and logs REQFAIL) after every reload. Strip
 * the URL on the way out AND on the way in (for data stored before this fix),
 * and mark partner files we received but no longer hold as 'restoring' — the
 * peer is asked to re-send the bytes the moment the channel reopens.
 */
function sanitizeStoredMessages(msgs: ChatMessage[] | undefined): ChatMessage[] {
  if (!msgs) return [];
  return msgs.map(m => {
    if (!m.attachment) return m;
    const a = { ...m.attachment };
    delete a.url;
    if (m.sender === 'partner' && a.status === 'complete') {
      a.status = 'restoring';
      a.progress = 0;
    }
    return { ...m, attachment: a };
  });
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

/**
 * Wait until the shared socket is connected, or fail with a friendly error.
 *
 * The socket.io transport already retries with bounded exponential backoff
 * (reconnectionAttempts: 60, delay 2–8s), so a single transient connect_error
 * must NOT reject the request — the connection commonly comes up on the very
 * next attempt. Only the overall window is terminal. This was the root cause
 * of intermittent "Couldn't reach ShareText." on flaky networks: the first
 * failed WS attempt failed the whole create/join instantly.
 */
function ensureSocketConnected(timeoutMs = 5000): Promise<void> {
  const socket = getSocket();
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      diag('connect.timeout', false, `waited ${timeoutMs}ms`);
      reject(new Error(configIssueMessage() || "ShareText is having trouble connecting. Try again."));
    }, timeoutMs);
    const onConnect = () => { cleanup(); diag('connect.ok', true); resolve(); };
    const onError = () => { /* transient — keep waiting for the retry */ };
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

/**
 * Friendly, actionable error messages based on the failure code.
 * Users should always know WHAT went wrong and WHAT to try next.
 */
function humanJoinError(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INVALID_CODE':
      return "That code isn't active. Check the other device and enter its latest six-digit code.";
    case 'ROOM_FULL':
      return "This room already has two devices. Only two can connect at once.";
    case 'RATE_LIMITED':
      return "Too many attempts. Wait a moment and try again.";
    case 'SESSION_EXPIRED':
      return "This session expired. Ask the other device to create a new room.";
    default:
      return fallback;
  }
}


export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>(() => {
    const stored = loadStoredSession();
    return {
      roomId: stored?.roomId ?? null,
      secret: stored?.secret ?? null,
      createdAt: stored?.createdAt,
      isCreator: stored?.isCreator ?? false,
      partnerConnected: false,
      partnerConnecting: false,
      connectionType: stored?.roomId ? 'waiting' : 'disconnected',
      messages: sanitizeStoredMessages(stored?.messages),
      deviceName: stored?.deviceName || guessDeviceName(),
      partnerName: stored?.partnerName ?? null
    };
  });

  // One-time: persist the platform-guessed device name so every surface
  // agrees. The WebRTC hello reads the name from localStorage directly, and
  // the RoomHub name row reads it from session state — if we never write the
  // guess, the partner sees "Guest Device" while this device shows
  // "Guest Windows PC", and two devices on the same platform are
  // indistinguishable. Writing the guess once keeps them identical until
  // the user edits the name.
  useEffect(() => {
    try {
      if (!localStorage.getItem(DEVICE_NAME_KEY)) {
        localStorage.setItem(DEVICE_NAME_KEY, guessDeviceName());
      }
    } catch { /* private mode */ }
  }, []);

  const peerManagerRef = useRef<PeerManager | null>(null);
  // Pre-computed crypto key: derived once per session secret, shared across
  // PeerManager instances (saves ~100ms PBKDF2 on reconnect/refresh).
  const cryptoKeyRef = useRef<Map<string, CryptoKey>>(new Map());

  /** Get or derive the crypto key for a room secret. The key is cached so
   *  reconnects skip the expensive PBKDF2 derivation (~100ms). */
  const getCryptoKey = async (secret: string): Promise<CryptoKey> => {
    const cached = cryptoKeyRef.current.get(secret);
    if (cached) return cached;
    const key = await generateKey(secret);
    cryptoKeyRef.current.set(secret, key);
    // Keep the cache bounded (most users only have 1–2 sessions).
    if (cryptoKeyRef.current.size > 5) {
      const oldest = cryptoKeyRef.current.keys().next().value;
      if (oldest !== undefined) cryptoKeyRef.current.delete(oldest);
    }
    return key;
  };

  /** Create a PeerManager with a precomputed key for instant crypto. */
  const createPeerManager = async (roomId: string, secret: string, isInitiator: boolean): Promise<PeerManager> => {
    const key = await getCryptoKey(secret);
    return new PeerManager(roomId, secret, isInitiator, key);
  };
  // Last-published progress per transfer, for throttling onFileProgress.
  const progressRef = useRef<Map<string, number>>(new Map());
  // True while the user deliberately leaves the pairing screen: the room
  // close we emit comes back as room_closed, which must NOT show the
  // "Session ended" screen — it was an intentional exit to the landing page.
  const abandonedRef = useRef(false);
  // In-memory File references for failed transfers, so "Retry" can resend
  // the actual bytes. Files aren't serializable (JSON.stringify drops them),
  // so they can't live on the message; this map is keyed by message id and
  // cleared when the session resets.
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  // Live mirror of session.messages so socket callbacks (registered once per
  // room) dedupe against the CURRENT list, not the one from the first render.
  const messagesRef = useRef(session.messages);
  messagesRef.current = session.messages;
  // In-flight agent-push file chunks, keyed by push message id. The server
  // delivers files as ~45KB base64 chunks (to fit WS frame caps on both
  // transports); this buffer reassembles them before the bubble appears.
  const pushBuffersRef = useRef<Map<string, { name: string; mimeType: string; size: number; chunkCount: number; timestamp: number; chunks: string[]; filled: number }>>(new Map());

  // Dev/test hook: reach the live PeerManager without exposing the secret.
  // requestReconnect is re-created each render (it closes over `session`), so
  // route it through a ref to avoid a stale mount-time closure.
  const requestReconnectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__sharetextDebug = {
        peerManager: () => peerManagerRef.current,
        requestReconnect: () => requestReconnectRef.current(),
        getMessages: () => messagesRef.current,
        getPartialInfo,
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the room (credentials + recent messages) so it survives refreshes
  // and closed tabs, making the room feel genuinely persistent.
  useEffect(() => {
    if (!session.roomId || !session.secret) return;
    const timer = setTimeout(() => {
      const payload: StoredSession = {
        roomId: session.roomId,
        secret: session.secret,
        isCreator: session.isCreator,
        createdAt: session.createdAt,
        deviceName: session.deviceName,
        partnerName: session.partnerName,
        messages: sanitizeStoredMessages(session.messages.slice(-100))
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
      diag('peer.peer_joined', true, (peerId || '').slice(0, 8));
      setSession(s => ({
        ...s,
        partnerConnecting: true,
        // Transition from 'waiting' (room created, no peer) to 'connecting'
        // (peer joined, WebRTC handshake starting).
        connectionType: s.connectionType === 'disconnected' || s.connectionType === 'waiting' ? 'connecting' : s.connectionType
      }));
      // Whichever device is already in the room initiates the WebRTC
      // handshake. This also covers reconnects after a refresh: the refreshed
      // device rejoins and the remaining peer gets this event and re-offers.
      if (session.roomId && session.secret) {
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        void createPeerManager(session.roomId, session.secret, true).then(pm => {
          peerManagerRef.current = pm;
          setupPeerManager(pm);
          pm.initiateConnection(peerId);
        });
      }
    });

    socket.on('peer_recovered', ({ peerId }) => {
      diag('peer.peer_recovered', true, (peerId || '').slice(0, 8));
      setSession(s => ({
        ...s,
        partnerConnecting: true,
        connectionType: s.connectionType === 'disconnected' || s.connectionType === 'waiting' ? 'connecting' : s.connectionType
      }));
      // The peer's transport came back, but the WebRTC connection is gone.
      // Re-establish it from this side.
      if (session.roomId && session.secret && peerId) {
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        void createPeerManager(session.roomId, session.secret, true).then(pm => {
          peerManagerRef.current = pm;
          setupPeerManager(pm);
          pm.initiateConnection(peerId);
        });
      }
    });

    socket.on('peer_disconnected', () => {
      setSession(s => ({ ...s, partnerConnected: false, partnerConnecting: false, connectionType: 'disconnected' }));
    });

    socket.on('room_closed', ({ reason }) => {
      if (abandonedRef.current) {
        abandonedRef.current = false;
        resetSession();
      } else {
        resetSession(reason || 'closed');
      }
    });

    // Agent push API — a script/AI agent pushed text or a file into this
    // room (authenticated with the room secret). It lands as an incoming
    // message on every seated device, even before a joiner pairs.
    socket.on('push_message', (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const id = (payload as any).id;
      if (typeof id !== 'string' || !id) return;
      if (messagesRef.current.some(m => m.id === id)) return; // dedupe

      if ((payload as any).kind === 'text') {
        const msg: ChatMessage = {
          id,
          sender: 'partner',
          source: 'push',
          text: String((payload as any).text ?? ''),
          timestamp: typeof (payload as any).timestamp === 'number' ? (payload as any).timestamp : Date.now(),
        };
        setSession(s => ({ ...s, messages: [...s.messages, msg] }));
        return;
      }

      if ((payload as any).kind === 'file') {
        const chunkIndex = (payload as any).chunkIndex;
        const chunkCount = (payload as any).chunkCount;
        const dataBase64 = (payload as any).dataBase64;
        if (typeof chunkIndex !== 'number' || typeof chunkCount !== 'number' || typeof dataBase64 !== 'string') return;

        let buf = pushBuffersRef.current.get(id);
        if (!buf) {
          buf = {
            name: sanitizeFilename(String((payload as any).name ?? 'file')),
            mimeType: String((payload as any).mimeType ?? 'application/octet-stream'),
            size: typeof (payload as any).size === 'number' ? (payload as any).size : 0,
            chunkCount,
            timestamp: typeof (payload as any).timestamp === 'number' ? (payload as any).timestamp : Date.now(),
            chunks: new Array(chunkCount),
            filled: 0,
          };
          pushBuffersRef.current.set(id, buf);
        }
        if (!buf.chunks[chunkIndex]) {
          buf.chunks[chunkIndex] = dataBase64;
          buf.filled++;
        }
        if (buf.filled >= buf.chunkCount) {
          pushBuffersRef.current.delete(id);
          try {
            const binary = atob(buf.chunks.join(''));
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: buf.mimeType });
            const url = URL.createObjectURL(blob);
            const mime = buf.mimeType.toLowerCase();
            const type: import('../types').Attachment['type'] = mime.startsWith('image/')
              ? 'image'
              : mime.startsWith('video/')
                ? 'video'
                : mime.startsWith('audio/')
                  ? 'audio'
                  : 'file';
            const msg: ChatMessage = {
              id,
              sender: 'partner',
              source: 'push',
              text: '',
              timestamp: buf.timestamp,
              attachment: {
                id,
                type,
                name: buf.name,
                size: buf.size,
                mimeType: buf.mimeType,
                url,
                status: 'complete',
                progress: 1,
              },
            };
            setSession(s => ({ ...s, messages: [...s.messages, msg] }));
          } catch {
            // Undecodable chunk data — drop the push silently.
            pushBuffersRef.current.delete(id);
          }
        }
        return;
      }
    });

    socket.on('connect_error', () => {
      // Surface nothing here; individual actions report their own errors.
    });

    return () => {
      socket.off('peer_joined');
      socket.off('peer_recovered');
      socket.off('peer_disconnected');
      socket.off('room_closed');
      socket.off('push_message');
      socket.off('connect_error');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isCreator, session.roomId]);

  // ---- Wake Lock: while a transfer is in flight, keep the screen awake so a
  // phone doesn't lock mid-transfer and browsers don't throttle the tab. The
  // lock is released the moment nothing is sending/receiving; re-acquired
  // after a visibility change (the OS may drop it when the app is backgrounded
  // and Chrome re-requests it on return).
  useEffect(() => {
    const active = messagesRef.current.some(m => {
      const st = m.attachment?.status;
      return st === 'sending' || st === 'receiving' || st === 'resuming';
    });
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
          (navigator as any).wakeLock.request('screen').then((l: any) => {
            if (cancelled) { try { l.release(); } catch { /* noop */ } return; }
            lock = l;
          }).catch(() => { /* denied or unavailable — transfer still runs */ });
        }
      } catch { /* unsupported */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) { try { lock.release(); } catch { /* noop */ } lock = null; }
    };
  }, [session.messages]);

  const setupPeerManager = (pm: PeerManager) => {
    pm.onConnectionTypeChange = (type) => {
      setSession(s => ({ ...s, connectionType: type }));
    };

    // Negotiation really started (offer sent/received — ICE is running), so
    // the UI can truthfully move from "Connecting…" to "Establishing secure
    // connection…". Never downgrades an established type (direct/relay).
    pm.onNegotiating = () => {
      setSession(s => ({
        ...s,
        connectionType: s.connectionType === 'waiting' || s.connectionType === 'connecting' || s.connectionType === 'establishing' ? 'establishing' : s.connectionType,
      }));
    };

    pm.onOpen = () => {
      // The data channel opened — treat that as the peer being present,
      // including after a rejoin/recovery when no explicit event arrives.
      setSession(s => ({ ...s, partnerConnected: true, partnerConnecting: false }));
      // If a transfer was interrupted by the drop, resume it from the
      // position the peer actually received — never from zero.
      void resumeInterruptedTransfers();
      // Honest late receipts: after a reload/rejoin, the OTHER device may
      // still be open with messages it sent us that never got confirmed. We
      // genuinely hold them (restored from localStorage), so confirm now —
      // the sender flips those bubbles to Delivered truthfully, and a sender
      // that reopens later gets the same when THIS side re-confirms.
      for (const m of messagesRef.current) {
        if (m.sender === 'partner' && (m.attachment?.status === 'complete' || !m.attachment)) {
          pm.sendReceipt(m.id);
          // The room is open on this device right now, so every restored
          // message is genuinely ON SCREEN — confirm seen too.
          pm.sendSeen(m.id);
        }
        // Restored files we received but no longer hold bytes for: ask the
        // peer to re-send them now that the channel is open.
        if (m.sender === 'partner' && m.attachment?.status === 'restoring') {
          try { void pm.send(JSON.stringify({ kind: 'resend_request', id: m.id })); } catch { /* channel closed */ }
        }
      }
    };

    // The peer confirmed one of our messages is on their screen.
    pm.onSeen = (messageId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === messageId ? { ...m, seen: true } : m)
      }));
    };

    pm.onHello = (name) => {
      setSession(s => ({ ...s, partnerName: name || null }));
    };

    pm.onMessage = (dataStr) => {
      try {
        const parsed = JSON.parse(dataStr);
        // Control packets: a peer that reloaded asks us to re-send a file it
        // previously received (its bytes died with the page), or tells us it
        // no longer holds the bytes so we can fail honestly instead of waiting.
        if (parsed.kind === 'resend_request') { void handleResendRequest(parsed.id); return; }
        if (parsed.kind === 'resend_unavailable') { updateMessageAttachment(parsed.id, { status: 'failed', note: 'resend-unavailable' }); return; }
        if (parsed.id && parsed.sender) {
          // New structured format. Dedupe by message id so a retried transfer
          // (metadata re-sent after a failure) doesn't create a duplicate
          // bubble, while still (re)registering the binary expectation.
          const isDuplicate = messagesRef.current.some(m => m.id === parsed.id);
          if (!isDuplicate) {
            // A peer's 'sending' is our 'receiving'.
            // Sanitize the sender-provided filename to prevent path traversal,
            // control characters, and other injection vectors.
            const incoming = parsed.attachment && parsed.attachment.status === 'sending'
              ? { ...parsed, attachment: { ...parsed.attachment, status: 'receiving', name: sanitizeFilename(parsed.attachment.name || 'file') } }
              : parsed.attachment ? { ...parsed, attachment: { ...parsed.attachment, name: sanitizeFilename(parsed.attachment.name || 'file') } } : parsed;
            setSession(s => ({
              ...s,
              messages: [...s.messages, incoming]
            }));
          }
          if (parsed.attachment) {
            pm.expectBinaryTransfer(parsed.attachment.id, Math.ceil(parsed.attachment.size / (64 * 1024)));
          } else {
            // Text arrived — confirm receipt immediately so the sender can
            // show a true "Delivered" (not a guessed one).
            pm.sendReceipt(parsed.id);
            // The room is open on this device (that's how the message got
            // here), so once the bubble has rendered it's genuinely seen.
            // The short delay keeps the receipt honest: we only claim seen
            // after the message is actually on screen, not the instant it
            // lands in state. Also only claim seen if the page is actually
            // visible — don't fake it when the browser is minimized.
            const sendSeenIfVisible = () => {
              if (document.visibilityState === 'visible') {
                pm.sendSeen(parsed.id);
              } else {
                // Page not visible — wait for it to become visible, then send seen
                const onVis = () => {
                  if (document.visibilityState === 'visible') {
                    document.removeEventListener('visibilitychange', onVis);
                    pm.sendSeen(parsed.id);
                  }
                };
                document.addEventListener('visibilitychange', onVis);
              }
            };
            setTimeout(sendSeenIfVisible, 450);
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
      const pct = progress / total;
      // Throttle to ~1% steps: every chunk otherwise triggers a full React
      // re-render + scrollIntoView, which drags large transfers to a crawl.
      const last = progressRef.current.get(transferId) ?? -1;
      if (pct - last < 0.01 && pct < 1) return;
      progressRef.current.set(transferId, pct);
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
                progress: pct
              }
            };
          }
          return m;
        })
      }));
    };

    pm.onFileComplete = (transferId, blob) => {
      // The reassembled blob carries no MIME type — attach the one from the
      // metadata so previews, downloads and clipboard copy get the correct
      // type. Blob composition references the original bytes, so this stays
      // cheap even for large disk-backed (OPFS) files.
      const srcMsg = messagesRef.current.find(m => m.attachment?.id === transferId);
      const mime = srcMsg?.attachment?.mimeType;
      const checksum = srcMsg?.attachment?.checksum;
      const finalBlob = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
      const url = URL.createObjectURL(finalBlob);
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
      // Mark that this user has completed at least one transfer, so the
      // install prompt can appear after meaningful use.
      try { localStorage.setItem('sharetext.hasTransfer', '1'); } catch { /* ignore */ }
      // The whole file arrived — only now confirm receipt (metadata alone
      // would be a lie if the transfer later failed).
      const msg = messagesRef.current.find(m => m.attachment?.id === transferId);
      if (msg && msg.sender === 'partner') {
        pm.sendReceipt(msg.id);
        // The completed file card is on screen in the open room — confirm
        // seen too (same honesty rule as text: only after it's rendered).
        // Only claim seen if the page is actually visible.
        const sendSeenIfVisible = () => {
          if (document.visibilityState === 'visible') {
            pm.sendSeen(msg.id);
          } else {
            const onVis = () => {
              if (document.visibilityState === 'visible') {
                document.removeEventListener('visibilitychange', onVis);
                pm.sendSeen(msg.id);
              }
            };
            document.addEventListener('visibilitychange', onVis);
          }
        };
        setTimeout(sendSeenIfVisible, 450);
      }

      // Integrity: if the sender included a checksum, verify the bytes that
      // actually arrived. The card stays usable (download works) while the
      // background hash runs; a mismatch flips it to a clear failure with
      // Retry instead of silently keeping corrupted data.
      if (checksum && srcMsg) {
        // updateMessageAttachment keys on the MESSAGE id — the transferId is
        // the attachment id, so resolve the owning message first.
        const msgId = srcMsg.id;
        void sha256Hex(finalBlob)
          .then((got) => {
            const ok = got === checksum;
            diag('transfer.checksum', ok, ok ? 'verified' : `mismatch expected ${checksum.slice(0, 12)}… got ${got.slice(0, 12)}…`);
            updateMessageAttachment(msgId, ok
              ? { verified: true }
              : { status: 'failed', note: 'checksum-mismatch', progress: 1, verified: false });
          })
          .catch(() => { /* hashing failed (quota?) — leave complete, unverified */ });
      } else {
        diag('transfer.checksum_skipped', true, `${transferId.slice(0, 8)} no checksum`);
      }
    };

    // The peer confirmed one of our messages arrived.
    pm.onReceipt = (messageId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === messageId ? { ...m, delivered: true } : m)
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
      setSession(s => ({
        ...s,
        connectionType: 'disconnected',
        // A transfer that was mid-flight when the channel dropped is
        // interrupted — not failed. It resumes when the peer returns.
        messages: s.messages.map(m => {
          const st = m.attachment?.status;
          if (m.attachment && (st === 'sending' || st === 'receiving')) {
            diag('transfer.interrupted', true, m.attachment.name);
            return { ...m, attachment: { ...m.attachment, status: 'interrupted' } };
          }
          return m;
        })
      }));
    };
  };

  /**
   * After the data channel reopens (reconnect / recovery), walk the message
   * list and resume anything that was interrupted. Own sends re-send metadata
   * + the missing chunk range; inbound transfers just flip back to
   * "Receiving…" — the sender re-registers and resumes on its side.
   */
  const resumeInterruptedTransfers = async () => {
    const pm = peerManagerRef.current;
    if (!pm) return;
    for (const m of messagesRef.current) {
      const a = m.attachment;
      if (!a) continue;
      if (m.sender === 'me' && (a.status === 'interrupted' || a.status === 'resuming' || (a.status === 'sending' && hasSendProgress(a.id)))) {
        const file = pendingFilesRef.current.get(m.id);
        if (!file) continue; // no bytes in memory (e.g. after our own reload) — nothing safe to re-send
        updateMessageAttachment(m.id, { status: 'resuming', progress: a.progress });
        const partnerMsg: ChatMessage = {
          ...m,
          sender: 'partner',
          attachment: { ...a, status: 'sending', progress: a.progress }
        };
        try {
          await pm.resumeTransfer(JSON.stringify(partnerMsg), file, a.id);
          updateMessageAttachment(m.id, { status: 'complete', progress: 1 });
        } catch (e) {
          if (!(e instanceof TransferCancelledError)) {
            updateMessageAttachment(m.id, { status: 'failed' });
          }
        }
      } else if (m.sender === 'partner' && (a.status === 'interrupted' || a.status === 'receiving')) {
        // The peer is back and will re-send; surface it as plain receiving.
        updateMessageAttachment(m.id, { status: 'receiving' });
      }
    }
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
      const res = await new Promise<{ success: boolean; error?: string; createdAt?: number }>((resolve) => {
        socket.emit('resume_room', { roomId: stored.roomId, secret: stored.secret }, resolve);
      });
      if (cancelled) return;
      diag('room.resume', !!res.success, res.success ? 'ok' : (res.error || 'unknown'));
      if (res.success) {
        // Back in the room, but the WebRTC channel is new — the app shows
        // "Connecting…" until it opens, instead of a premature green badge.
        setSession(s => ({
          ...s,
          roomId: stored.roomId,
          secret: stored.secret,
          createdAt: typeof res.createdAt === 'number' ? res.createdAt : stored.createdAt,
          isCreator: stored.isCreator,
          partnerConnected: false,
          partnerConnecting: false,
          connectionType: 'connecting'
        }));
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        void createPeerManager(stored.roomId, stored.secret, false).then(pm => {
          peerManagerRef.current = pm;
          setupPeerManager(pm);
        });
      } else if (res.error?.includes('two devices') && attempt < 3) {
        // The previous socket may not have been cleaned up yet; retry shortly.
        setTimeout(() => { if (!cancelled) void tryResume(attempt + 1); }, 1500);
      } else {
        // Room is gone or we lost the credential — start clean.
        saveStoredSession(null);
        setSession(s => ({ ...s, roomId: null, secret: null, isCreator: false, closedReason: 'expired' }));
      }
    };
    // Defer session restore until after first paint — don't block UI on networking.
    // requestIdleCallback (with setTimeout fallback) ensures the shell renders first,
    // then we attempt to resume any stored session in the background.
    const scheduleRestore = typeof requestIdleCallback !== 'undefined'
      ? (cb: () => void) => requestIdleCallback(cb, { timeout: 2000 })
      : (cb: () => void) => setTimeout(cb, 0);
    scheduleRestore(() => { if (!cancelled) void tryResume(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createSession = async () => {
    abandonedRef.current = false;
    const requestId = crypto.randomUUID();
    devLog('Create Session clicked — connecting to socket…');
    roomCreateDiagStart(requestId, 'socket');
    try {
      await ensureSocketConnected();
    } catch (e) {
      roomCreateDiagEnd(requestId, 'failure', 'CLIENT_INIT_FAILURE', String(e));
      throw e;
    }
    devLog('Socket connected — sending create request');
    return new Promise<void>((resolve, reject) => {
      const socket = getSocket();

      // No redundant timeout here — CloudflareSocket's own WS_OPEN_TIMEOUT
      // (8s) + request timeout (4s) handles the total window. Adding a second
      // timeout here creates confusing dual-timeout behavior where the outer
      // timeout fires first and the inner one is orphaned.

      socket.emit('create_room', (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
        diag('room.create', !!res.success, res.success ? res.roomId : (res.error || 'unknown'));
        if (res.success && res.roomId && res.secret) {
          roomCreateDiagEnd(requestId, 'success');
          devLog('Room created — navigating');
          saveStoredSession({ roomId: res.roomId, secret: res.secret, isCreator: true, createdAt: res.createdAt });
          setSession({
            roomId: res.roomId,
            secret: res.secret,
            createdAt: res.createdAt,
            isCreator: true,
            partnerConnected: false,
            partnerConnecting: false,
            connectionType: 'waiting',
            messages: [],
            closedReason: null,
            deviceName: session.deviceName,
            partnerName: null
          });
          resolve();
        } else {
          roomCreateDiagEnd(requestId, 'failure', 'ROOM_CREATE_REJECTED', res.code || res.error);
          devLog('Create request failed:', res.code || res.error);
          reject(new Error(configIssueMessage() || humanizeError(res.code, res.error || "Couldn't start a session.")));
        }
      });
    });
  };

  const joinWithCode = async (code: string) => {
    const requestId = crypto.randomUUID();
    roomCreateDiagStart(requestId, 'join');
    await ensureSocketConnected();
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        roomCreateDiagEnd(requestId, 'failure', 'SIGNALING_TIMEOUT', 'join timed out');
        resolve({ success: false, error: "Couldn't reach ShareText." });
      }, 10000);
      getSocket().emit('join_with_code', { code }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
        clearTimeout(timeout);
        diag('room.join', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          roomCreateDiagEnd(requestId, 'success');
          setupJoiner(res.roomId!, res.secret!, res.createdAt);
        } else {
          roomCreateDiagEnd(requestId, 'failure', 'ROOM_CREATE_REJECTED', res.code);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareText. Check your connection and try again.")) });
      });
    });
  };

  const joinWithLink = async (roomId: string) => {
    await ensureSocketConnected();
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: "Couldn't reach ShareText." });
      }, 10000);
      getSocket().emit('join_with_link', { roomId }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
        clearTimeout(timeout);
        diag('room.join_link', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          setupJoiner(res.roomId!, res.secret!, res.createdAt);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareText. Check your connection and try again.")) });
      });
    });
  };

  /**
   * Join via a stable /s/<code> share link. The code is resolved to a roomId
   * on the active transport, then the normal link-join path seats this device
   * and tells the other peer to connect — same flow as any other join.
   */
  const joinWithShortCode = async (code: string) => {
    await ensureSocketConnected();
    const res = await resolveShortCode(code);
    diag('room.join_short', !!res.success, res.success ? 'ok' : 'not found');
    if (!res.success || !res.roomId) {
      return { success: false, error: "This link isn't active anymore. Ask for a fresh code." };
    }
    return joinWithLink(res.roomId);
  };

  const setupJoiner = (roomId: string, secret: string, createdAt?: number) => {
    abandonedRef.current = false;
    saveStoredSession({ roomId, secret, isCreator: false, createdAt });
    setSession({
      roomId,
      secret,
      createdAt,
      isCreator: false,
      partnerConnected: false,
      partnerConnecting: false,
      connectionType: 'waiting',
      messages: [],
      closedReason: null,
      deviceName: session.deviceName,
      partnerName: null
    });
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    void createPeerManager(roomId, secret, false).then(pm => {
      peerManagerRef.current = pm;
      setupPeerManager(pm);
    });
  };

  const sendMessage = async (text: string, attachment?: import('../types').Attachment, file?: File) => {
    if (!peerManagerRef.current) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'me',
      text,
      timestamp: Date.now(),
      // Files start in 'preparing' — the sender hashes the bytes first so the
      // receiver can verify integrity. The card shows Preparing… while that
      // runs (perceived speed: the bubble appears the instant you hit send).
      attachment: attachment ? { ...attachment, status: file ? 'preparing' : 'complete' } : undefined
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

    if (file && attachment) {
      const localUrl = URL.createObjectURL(file);
      updateMessageAttachment(msg.id, { url: localUrl });

      // SHA-256 of the original bytes — computed in the background so the
      // transfer starts immediately. The hash runs in parallel with the first
      // chunks; for small files it finishes before the transfer does.
      let checksum: string | undefined;
      const hashPromise = sha256Hex(file).then(c => {
        checksum = c;
        diag('transfer.hash_ok', true, c.slice(0, 12));
        // Send updated metadata with checksum if transfer is still in progress
        updateMessageAttachment(msg.id, { checksum: c });
        return c;
      }).catch(e => {
        diag('transfer.hash_failed', false, String(e));
        return undefined;
      });

      updateMessageAttachment(msg.id, { status: 'sending' });

      const partnerMsg = { ...msg, sender: 'partner', attachment: { ...msg.attachment!, status: 'sending' } };
      const payload = JSON.stringify(partnerMsg);
      try {
        await peerManagerRef.current.send(payload);
      } catch {
        updateMessageAttachment(msg.id, { status: 'failed' });
        return;
      }

      try {
        await peerManagerRef.current.sendFile(file, attachment.id);
        updateMessageAttachment(msg.id, { status: 'complete', progress: 1 });
      } catch (e) {
        // A user cancel stops the loop cleanly — don't overwrite 'cancelled'.
        if (!(e instanceof TransferCancelledError)) {
          updateMessageAttachment(msg.id, { status: 'failed' });
        }
      }
      return;
    }

    // Plain text: metadata (the text itself) goes immediately — no hash step.
    const partnerMsg = { ...msg, sender: 'partner' };
    const payload = JSON.stringify(partnerMsg);
    try {
      await peerManagerRef.current.send(payload);
    } catch {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === msg.id ? { ...m, delivery: 'failed' } : m)
      }));
    }
  };

  /**
   * Re-send a failed text message. The original bubble is replaced by a
   * fresh message with a new id — the receiver dedupes by message id, so
   * re-sending the same id would be silently swallowed.
   */
  const retryText = async (messageId: string) => {
    const pm = peerManagerRef.current;
    const msg = session.messages.find(m => m.id === messageId);
    if (!pm || !msg) return;
    const fresh: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'me',
      text: msg.text,
      timestamp: Date.now()
    };
    setSession(s => ({
      ...s,
      messages: [...s.messages.filter(m => m.id !== messageId), fresh]
    }));
    try {
      await pm.send(JSON.stringify({ ...fresh, sender: 'partner' }));
    } catch {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === fresh.id ? { ...m, delivery: 'failed' } : m)
      }));
    }
  };

  /**
   * Re-send a failed/interrupted file transfer. Re-sends the metadata packet
   * (so a partner that reloaded re-registers the binary expectation), then
   * resumes from the position the peer confirmed — the receiver dedupes by
   * chunk sequence, so anything already stored is skipped, never duplicated.
   */
  /**
   * A peer that reloaded lost the bytes of a file we sent them and is asking
   * us to re-send it. Works only while this tab still holds the File in
   * memory; otherwise we tell them honestly it's gone (resend_unavailable) so
   * their card fails cleanly instead of spinning forever.
   */
  const handleResendRequest = async (messageId: string) => {
    const pm = peerManagerRef.current;
    if (!pm) return;
    const msg = messagesRef.current.find(m => m.id === messageId);
    if (!msg?.attachment) return;
    const file = pendingFilesRef.current.get(messageId);
    if (!file) {
      try { await pm.send(JSON.stringify({ kind: 'resend_unavailable', id: messageId })); } catch { /* channel gone */ }
      return;
    }
    updateMessageAttachment(messageId, { status: 'resuming', progress: 0 });
    const partnerMsg: ChatMessage = {
      ...msg,
      sender: 'partner',
      attachment: { ...msg.attachment, status: 'sending', progress: 0 }
    };
    try {
      await pm.resumeTransfer(JSON.stringify(partnerMsg), file, msg.attachment.id);
      updateMessageAttachment(messageId, { status: 'complete', progress: 1 });
    } catch (e) {
      if (!(e instanceof TransferCancelledError)) {
        try { await pm.send(JSON.stringify({ kind: 'resend_unavailable', id: messageId })); } catch { /* noop */ }
      }
    }
  };

  const retryTransfer = async (messageId: string) => {
    const pm = peerManagerRef.current;
    if (!pm) return;
    const msg = session.messages.find(m => m.id === messageId);
    if (!msg?.attachment) return;
    // Receiver-side recovery: the peer said it no longer holds the bytes, or
    // we restored this file and never got it back — ask again now. For a
    // checksum mismatch the partial receive must be discarded so the resend
    // restarts from zero instead of the corrupted position.
    if (msg.sender === 'partner' && (msg.attachment.note === 'resend-unavailable' || msg.attachment.status === 'restoring' || msg.attachment.note === 'checksum-mismatch')) {
      if (msg.attachment.note === 'checksum-mismatch') {
        clearTransferState(msg.attachment.id);
        diag('transfer.restart', true, msg.attachment.name);
      }
      updateMessageAttachment(messageId, { status: 'restoring', note: undefined });
      try { await pm.send(JSON.stringify({ kind: 'resend_request', id: messageId })); } catch { /* channel gone */ }
      return;
    }
    const file = pendingFilesRef.current.get(messageId);
    if (!file) return;

    updateMessageAttachment(messageId, { status: 'resuming', progress: msg.attachment.progress || 0 });
    const partnerMsg: ChatMessage = {
      ...msg,
      sender: 'partner',
      attachment: { ...msg.attachment, status: 'sending', progress: msg.attachment.progress || 0 }
    };
    try {
      await pm.resumeTransfer(JSON.stringify(partnerMsg), file, msg.attachment.id);
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
    const st = msg.attachment.status;
    if (st !== 'sending' && st !== 'receiving' && st !== 'interrupted' && st !== 'resuming') return;
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
    void createPeerManager(roomId, secret, false).then(pm => {
      peerManagerRef.current = pm;
      setupPeerManager(pm);
    });
    setSession(s => ({ ...s, connectionType: 'connecting' }));
  };
  requestReconnectRef.current = requestReconnect;

  /**
   * Re-anchor the pairing-code window to now, so the countdown restarts at
   * 40s with a freshly-made code. Only meaningful for the creator on the
   * connect screen; the previous code stays valid for one more window, so a
   * joiner mid-typing still connects. Failures are silent (best-effort).
   */
  const refreshCode = async () => {
    const { roomId, secret } = session;
    if (!roomId || !secret) return;
    try {
      await ensureSocketConnected(8000);
    } catch {
      return;
    }
    const res = await refreshCodeRPC(roomId, secret);
    diag('room.code_refresh', !!res.success, res.success ? 'ok' : 'no-op');
    if (res.success && typeof res.createdAt === 'number') {
      setSession(s => ({ ...s, createdAt: res.createdAt }));
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

  /**
   * Leave the pairing screen for the landing page: close the room on the
   * server (so a waiting joiner isn't stranded) and drop the local session
   * WITHOUT the "Session ended" screen — a plain, silent exit.
   */
  const abandonSession = () => {
    // Set abandoned BEFORE close_room: the server echoes room_closed back
    // to this socket; suppress it so the user lands on the landing page.
    abandonedRef.current = true;
    if (session.roomId) {
      getSocket().emit('close_room', { roomId: session.roomId });
    }
    resetSession();
  };

  const resetSession = (reason?: string) => {
    // 1. Mark abandoned (must happen before room_closed echo can fire)
    if (reason) abandonedRef.current = false;
    // 2. Destroy WebRTC connection
    if (peerManagerRef.current) {
      try { peerManagerRef.current.destroy(); } catch { /* noop — idempotent */ }
      peerManagerRef.current = null;
    }
    // 3. Clear in-flight state
    pendingFilesRef.current.clear();
    progressRef.current.clear();
    pushBuffersRef.current.clear();
    // 4. Clear transfer state and revoke object URLs
    clearAllTransferState();
    for (const m of messagesRef.current) {
      if (m.attachment?.url) {
        try { URL.revokeObjectURL(m.attachment.url); } catch { /* noop */ }
      }
    }
    // 5. Clear localStorage FIRST — this prevents auto-resume on next load
    saveStoredSession(null);
    // 6. Clear the URL bar (remove /s/<code> or ?join= params)
    try {
      if (window.location.pathname !== '/' && window.location.pathname !== '/docs') {
        window.history.replaceState({}, document.title, '/');
      }
    } catch { /* noop */ }
    // 7. Update React state — landing renders immediately
    setSession(s => ({
      roomId: null,
      secret: null,
      createdAt: undefined,
      isCreator: false,
      partnerConnected: false,
      partnerConnecting: false,
      connectionType: 'disconnected',
      messages: [],
      closedReason: reason,
      deviceName: s.deviceName,
      partnerName: null
    }));
  };

  return (
    <SessionContext.Provider value={{ session, createSession, joinWithCode, joinWithLink, joinWithShortCode, sendMessage, updateMessageAttachment, retryTransfer, retryText, cancelTransfer, setDeviceName, requestReconnect, refreshCode, closeSession, leaveView, abandonSession }}>
      {children}
    </SessionContext.Provider>
  );
}
