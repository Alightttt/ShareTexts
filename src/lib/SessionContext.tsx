import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SessionState, ChatMessage, ConnectionType } from '../types';
import { getSocket, devLog, resolveShortCode, refreshCode as refreshCodeRPC } from './socket';
import { emitRoomConnected, resetRoomsBumpLatch } from './useLiveStats';
import { PeerManager, clearAllTransferState, getPartialInfo } from './webrtc';
import { humanizeError, ConnectError, describeConnectFailure } from './errors';
import { diag, roomCreateDiagStart, roomCreateDiagEnd } from './diag';
import { connMachine, mapToConnState } from './connectionState';
import { startNetStats, stopNetStats } from './netStats';
import { nearbyPresence } from './nearby';
import { productEvent } from './telemetry';
import { recordConnection, recordPartnerSeen } from './pairing';
// Round 03 decomposition: focused session modules (behavior moved verbatim).
import { loadStoredSession, saveStoredSession, loadLastStayRoom, saveLastStayRoom, saveLastStayCredentials, sanitizeStoredMessages, type StoredSession } from './session/persistence';
import { DEVICE_NAME_KEY, platformDefaultName, guessDeviceName, ensureDeviceNameSeeded } from './session/deviceIdentity';
import { sha256Hex } from './session/fileIntegrity';
import { ensureSocketConnected, humanJoinError, friendlyJoinCopy } from './session/socketReady';
import { useCryptoKeyCache } from './session/cryptoCache';
import { useSeenReceipts } from './session/seenReceipts';
import { useMessageEngine } from './session/messageEngine';
import { useTransferWakeLock } from './session/wakeLock';

interface SessionContextValue {
  session: SessionState;
  /** Creates a room; resolves with the fresh credentials once the server
   *  acknowledges (callers that don't need them may ignore the value). */
  createSession: () => Promise<{ roomId: string; secret: string }>;
  joinWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  joinWithLink: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  joinWithShortCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (text: string, attachment?: import('../types').Attachment, file?: File) => void;
  updateMessageAttachment: (messageId: string, updates: Partial<ChatMessage['attachment']>) => void;
  retryTransfer: (messageId: string) => Promise<void>;
  retryText: (messageId: string) => Promise<void>;
  cancelTransfer: (messageId: string) => void;
  /** Pause one of OUR in-flight uploads (receiver is told; resume lifts it). */
  pauseTransfer: (messageId: string) => void;
  /** Resume a paused upload. */
  resumeTransferById: (messageId: string) => void;
  setDeviceName: (name: string) => void;
  /** Live rolling-window speed + ETA for an in-flight transfer id, or null
   *  when nothing is moving yet. Read by MessageCard for the live readout. */
  transferSpeedFor: (transferId: string) => { bytesPerSec: number; etaSec: number | null } | null;
  requestReconnect: () => Promise<void>;
  refreshCode: () => Promise<void>;
  closeSession: () => void;
  leaveView: () => void;
  abandonSession: () => void;
  /** Flip this room's Stay Connected promise (server echoes the state to
   *  both devices). No-op when not seated in a room. */
  setStayConnected: (enabled: boolean) => void;
  /** Room viewer registration: ChatView calls this on mount/unmount and
   *  whenever the tab's visibility flips. Seen receipts are ONLY claimed
   *  while a viewer is registered and the page is visible. */
  registerRoomViewer: (mounted: boolean) => void;
  /** Mark every currently-rendered partner text message as seen — call only
   *  from the room viewer while mounted + visible. */
  claimSeen: () => void;
  /** Re-enter the last Stay Connected room from the landing page. Resolves
   *  false when no promise is remembered or the room is truly gone. */
  rejoinStayRoom: () => Promise<boolean>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
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
      partnerName: stored?.partnerName ?? null,
      stayConnected: stored?.stayConnected ?? false,
      lastStayRoom: loadLastStayRoom()
    };
  });

  // One-time identity bootstrap (in session/deviceIdentity.ts).
  useEffect(() => {
    const migrated = ensureDeviceNameSeeded();
    if (migrated) setSession(s => ({ ...s, deviceName: migrated }));
  }, []);

  const peerManagerRef = useRef<PeerManager | null>(null);
  /** Generation token for PeerManager creation. `peer_joined` can fire twice
   *  (churn / duplicate delivery); both firings start an async
   *  createPeerManager, and destroying "the current" PM before the first
   *  promise resolves leaves that first PM's socket listeners permanently
   *  attached (duplicate handlers → duplicate transfers). Only the newest
   *  generation may install itself. */
  const pmGenerationRef = useRef(0);
  /** Why the last connection dropped (error taxonomy, src/lib/errors.ts).
   *  Read by diagnostics; cleared when a channel opens again. */
  const lastFailureCodeRef = useRef<string | null>(null);
  /** Capability negotiation result from the peer's hello (protocol version
   *  + shared feature mask). Transfer code consults it to degrade cleanly. */
  const peerCapsRef = useRef<{ name: string; protocolVersion: number; features: string[]; featureMask: string[] } | null>(null);
  /** Client-side disconnect grace timer — keeps the UI calm for the same 60s
   *  the server holds the peer's seat. Cleared by recovery or a confirmed leave. */
  const disconnectCalmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { getCryptoKey, createPeerManager } = useCryptoKeyCache();
  // True while the user deliberately leaves the pairing screen: the room
  // close we emit comes back as room_closed, which must NOT show the
  // "Session ended" screen — it was an intentional exit to the landing page.
  const abandonedRef = useRef(false);
  // Live mirror of session.messages so socket callbacks (registered once per
  // room) dedupe against the CURRENT list, not the one from the first render.
  const messagesRef = useRef(session.messages);
  messagesRef.current = session.messages;
  // Live mirror of sessionRef (below) so the engine's UI actions read the
  // CURRENT render's messages exactly as the original closures did.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { chatMountedRef, registerRoomViewer, claimSeen, catchUpSeenOnOpen, sendSeenWhenVisible } =
    useSeenReceipts(
      useCallback(() => messagesRef.current, []),
      useCallback(() => peerManagerRef.current, []),
    );
  // Message/transfer engine (session/messageEngine.ts): ingestion, dedupe,
  // progress/completion, checksums, push reassembly, send/retry/cancel.
  // Deps are fresh closures per render — the same closure semantics the
  // original render-scoped functions had.
  const messageEngine = useMessageEngine({
    setSession,
    getMessages: () => messagesRef.current,
    getRenderMessages: () => sessionRef.current.messages,
    getPeer: () => peerManagerRef.current,
    sendSeenWhenVisible,
  });
  const { updateMessageAttachment, sendMessage, retryText, retryTransfer, cancelTransfer, pauseTransfer, resumeTransferById, transferSpeedFor, wirePeerHandlers, handleChannelOpen, handlePushMessage, clearRuntimeState } = messageEngine;

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
        stayConnected: session.stayConnected,
        messages: sanitizeStoredMessages(session.messages.slice(-100))
      };
      // The last-room credential is remembered for EVERY seated room, not
      // only Stay Connected ones — the landing page's rejoin card must be
      // there for any session that ended without an explicit close (refresh,
      // tab close, crash), or mobile users never see it. Rooms closed with
      // the button or ended via room_closed drop the record instead.
      {
        saveLastStayCredentials(session.roomId, session.secret);
        const stay = loadLastStayRoom();
        if (stay) saveLastStayRoom({
          ...stay,
          messages: payload.messages,
          partnerName: session.partnerName,
          messageCount: session.messages.length,
          lastActiveAt: Date.now(),
        });
      }
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
  }, [session.roomId, session.secret, session.isCreator, session.deviceName, session.partnerName, session.messages, session.stayConnected]);

  // ---- Connection state machine mirror: feed the coarse lifecycle truth
  // from the fine-grained session state at every render. Explicit hops
  // (PAIRING on create/join, SIGNALING on peer_joined, CONNECTED on channel
  // open, RECONNECTING on drop) happen at their event sites; this effect
  // covers the remaining derivations (DISCOVERING ↔ IDLE, TRANSFERRING
  // while any attachment is in flight) so the machine is always truthful.
  useEffect(() => {
    const transferActive = session.messages.some(m => {
      const st = m.attachment?.status;
      return st === 'sending' || st === 'receiving' || st === 'resuming' || st === 'waiting';
    });
    const next = mapToConnState({
      hasRoom: !!session.roomId,
      partnerConnecting: session.partnerConnecting,
      partnerConnected: session.partnerConnected,
      connectionType: session.connectionType,
      presenceActive: nearbyPresence.isActive(),
      transferActive,
    });
    connMachine.to(next);
  }, [session.roomId, session.partnerConnecting, session.partnerConnected, session.connectionType, session.messages]);

  useEffect(() => {
    const socket = getSocket();

    socket.on('peer_joined', ({ peerId }) => {
      // A peer is now in the room — kick off the WebRTC handshake. Don't claim
      // the partner is "connected" yet: ChatView appears only once the data
      // channel actually opens (onOpen) or the relay fallback confirms a
      // working path, so the UI never shows a green badge on a dead link.
      diag('peer.peer_joined', true, (peerId || '').slice(0, 8));
      // Only descend the pairing ladder when we're actually below it. The
      // seat keepalive reseat makes the server re-announce the join to a
      // room whose pair is ALREADY CONNECTED — demanding SIGNALING then
      // is an illegal CONNECTED → SIGNALING transition (and would drag the
      // state machine backwards on every keepalive beat).
      const cm = connMachine.current();
      if (cm === 'PAIRING' || cm === 'DISCOVERING' || cm === 'IDLE') connMachine.to('SIGNALING');
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
        startSeatKeepalive();
        const gen = ++pmGenerationRef.current;
        void createPeerManager(session.roomId, session.secret, true).then(pm => {
          if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
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
        startSeatKeepalive();
        const gen = ++pmGenerationRef.current;
        void createPeerManager(session.roomId, session.secret, true).then(pm => {
          if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
          peerManagerRef.current = pm;
          setupPeerManager(pm);
          pm.initiateConnection(peerId);
        });
      }
    });

    socket.on('peer_disconnected', () => {
      // The server CONFIRMED the peer really left (its 60s seat grace
      // elapsed or it left cleanly). Skip the client-side calm window and
      // show the true disconnected state immediately.
      diag('peer.confirmed_gone', true);
      peerManagerRef.current?.onDisconnectImmediate?.();
    });

    socket.on('room_closed', ({ reason }) => {
      // The server CONFIRMED this room is destroyed. A stored re-entry
      // credential for it is now dead weight — the landing card would offer
      // a rejoin that can only fail. Keep the record ONLY for Stay Connected
      // rooms, whose rooms survive empty by design (the promise).
      if (!sessionRef.current.stayConnected) saveLastStayRoom(null);
      if (abandonedRef.current) {
        abandonedRef.current = false;
        resetSession();
      } else {
        resetSession(reason || 'closed');
      }
    });

    // Stay Connected: the server echoes the room-wide state so both badges
    // always agree, no matter which device flipped the switch.
    socket.on('stay_connected_state', ({ enabled }: { enabled?: boolean }) => {
      diag('stay.state', !!enabled);
      setSession(s => {
        if (enabled && s.roomId && s.secret) {
          // Remember the room the moment Stay Connected is on, so the
          // landing page can offer re-entry even after a later disconnect.
          saveLastStayCredentials(s.roomId, s.secret);
        }
        return { ...s, stayConnected: !!enabled };
      });
    });

    // Agent push API ingestion (text + chunked file reassembly) now lives in
    // the message engine (session/messageEngine.ts).
    socket.on('push_message', handlePushMessage);

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

  // Wake lock while a transfer is in flight (session/wakeLock.ts).
  useTransferWakeLock(session.messages);

  const setupPeerManager = (pm: PeerManager) => {
    pm.onConnectionTypeChange = (type) => {
      setSession(s => ({ ...s, connectionType: type }));
    };
    // Live WebRTC statistics feed (route/RTT/bytes) — lazy, ~1 Hz.
    pm.onTransportReady = () => { startNetStats(pm.getPeerConnection()); };

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
      lastFailureCodeRef.current = null; // healthy again — clear the taxonomy code
      // Peer recovered inside the disconnect-grace window — cancel the calm
      // timer so it can never fire a false "disconnected" after recovery.
      if (disconnectCalmTimerRef.current) { clearTimeout(disconnectCalmTimerRef.current); disconnectCalmTimerRef.current = null; }
      setSession(s => ({ ...s, partnerConnected: true, partnerConnecting: false }));
      // The one true "two devices connected" moment — the tracker listens
      // here so it counts real connections, not room creations.
      emitRoomConnected();
      // This device's own lifetime stats: one entry per real channel open.
      // The partner's name isn't known yet — the hello handshake lands a
      // beat later and feeds recordPartnerSeen.
      recordConnection();
      connMachine.to('CONNECTED');
      handleChannelOpen(pm);
      // Catch-up SEEN for messages from a previous visit that are already
      // scrolled up in an OPEN, VISIBLE room: the reader has had them on
      // screen — they were here before this session began. Unseen messages
      // that arrive LIVE are confirmed by the viewer effect instead.
      catchUpSeenOnOpen(pm.sendSeen.bind(pm));
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
      // The real display name just landed — this is when the distinct-
      // partner count can honestly grow.
      recordPartnerSeen(name || null);
      // Same-platform default collision: two unrenamed devices on the same
      // platform are indistinguishable ("Guest iPhone" on both sides). Only
      // the JOINER auto-disambiguates — the creator's name is the anchor, so
      // the outcome is deterministic even though both sides exchange hellos
      // and neither side can outrace the other. Renames only fire while BOTH
      // names are still unedited defaults; a deliberate rename is respected.
      if (!name || session.isCreator) return;
      const mine = (typeof localStorage !== 'undefined' && localStorage.getItem(DEVICE_NAME_KEY)) || session.deviceName;
      if (mine !== name || mine !== platformDefaultName()) return;
      const suggested = `${mine} 2`;
      diag('name.auto_disambiguate', true, `${mine} → ${suggested}`);
      setDeviceName(suggested);
      setSession(s => ({ ...s, nameAutoAdjusted: true }));
    };

    // Capability negotiation (protocol v2 hello): store the intersection of
    // our features and the peer's. A legacy peer reports v1/[] — every
    // optional feature simply degrades to the legacy path. Kept in a ref so
    // transfer code can consult it without re-rendering the whole tree.
    pm.onPeerCapabilities = (info) => {
      peerCapsRef.current = info;
      diag('peer.capabilities', true, `v${info.protocolVersion} shared=[${info.featureMask.join(',')}]`);
      if (info.protocolVersion > 2) {
        // Peer is NEWER than us — it decides compatibility, but surface it.
        diag('peer.version_newer', true, `peer v${info.protocolVersion} > ours v2`);
      }
    };

    // Message/transfer callbacks (ingestion, progress, completion,
// checksums, queue flips) — owned by session/messageEngine.ts.
    wirePeerHandlers(pm);

    // Client-side disconnect grace — MUST match the server's 60s hold. When
    // the peer's tab closes, its DTLS association dies instantly and the data
    // channel closes here, but the server is still holding the peer's seat:
    // a refresh or a network blip brings it back within the window. Showing
    // "disconnected" the instant the channel closes turns a refresh into a
    // scare. Mark the link 'reconnecting' (calm, no banner) and only flip to
    // the real 'disconnected' state if the server confirms the leave
    // (peer_disconnected) or the grace elapses without recovery.
    const DISCONNECT_CALM_MS = 60_000;
    pm.onDisconnect = () => {
      // Relay-transport drops ARE the connection — no WebRTC channel to
      // lose, so treat them as immediately disconnected.
      if (session.connectionType === 'relay') {
        pm.onDisconnectImmediate?.();
        return;
      }
      connMachine.to('RECONNECTING');
      stopNetStats();
      // Error taxonomy: record WHY the link dropped so the UI (⌘K panel,
      // reconnect banner) can say what actually happened instead of a
      // generic "disconnected". Cleared on the next successful open.
      lastFailureCodeRef.current = pm.lastFailureCode;
      setSession(s => ({
        ...s,
        connectionType: 'connecting',
        messages: s.messages.map(m => {
          const st = m.attachment?.status;
          if (m.attachment && (st === 'sending' || st === 'receiving')) {
            // Mid-flight transfer: keep it 'sending'/'receiving' during the
            // calm window — interrupted is reserved for a CONFIRMED leave,
            // and resuming from the acked prefix is always safe anyway.
            return m;
          }
          return m;
        })
      }));
      if (disconnectCalmTimerRef.current) clearTimeout(disconnectCalmTimerRef.current);
      disconnectCalmTimerRef.current = setTimeout(() => {
        // The peer never came back within the grace window — now it's real.
        diag('peer.grace_expired', true);
        setSession(s => ({
          ...s,
          connectionType: 'disconnected',
          // The peer is really gone: clear the pairing flag so ChatView's
          // offline banner + state mirror tell the truth. Without this the
          // mirror kept reporting CONNECTED for a dead room.
          partnerConnected: false,
          messages: s.messages.map(m => {
            const st = m.attachment?.status;
            if (m.attachment && (st === 'sending' || st === 'receiving')) {
              diag('transfer.interrupted', true, m.attachment.name);
              return { ...m, attachment: { ...m.attachment, status: 'interrupted' } };
            }
            return m;
          })
        }));
      }, DISCONNECT_CALM_MS);
    };

    // The server CONFIRMED the other device really left (grace elapsed or a
    // clean leave) — skip the calm window and show the true state now.
    pm.onDisconnectImmediate = () => {
      if (disconnectCalmTimerRef.current) { clearTimeout(disconnectCalmTimerRef.current); disconnectCalmTimerRef.current = null; }
      connMachine.to('RECONNECTING');
      stopNetStats();
      lastFailureCodeRef.current = pm.lastFailureCode;
      setSession(s => ({
        ...s,
        connectionType: 'disconnected',
        // Server-confirmed leave: same honesty as the grace-expiry path —
        // the offline banner and empty state must be reachable.
        partnerConnected: false,
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

  // Restore an in-progress session after a refresh. Requires the secret, so
  // only a device that already held the room can resume it. Cancellable so
  // React StrictMode's double-mount doesn't leave a zombie PeerManager.
  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored) return;

    let cancelled = false;
    const socket = getSocket();
    let resumeAttempts = 0;
    const tryResume = async (attempt = 0): Promise<void> => {
      try {
        await ensureSocketConnected();
      } catch {
        // The socket didn't come up (offline, dead network). That is NOT a
        // verdict on the room — wiping the stored session here destroyed a
        // perfectly good room just because the user refreshed on a train.
        // Keep the credential and retry with backoff; only a REAL server
        // rejection (expired, full) below clears it.
        if (cancelled) return;
        resumeAttempts++;
        if (resumeAttempts <= 3) {
          diag('room.resume_wait', true, `socket down, retry ${resumeAttempts}/3`);
          setTimeout(() => { if (!cancelled) void tryResume(0); }, 4000 * resumeAttempts);
        } else {
          // Still nothing after 4s+8s+12s: go idle but KEEP the stored
          // session — the next reload (or the visibility re-seat) tries
          // again, and the room may still be alive on the server.
          diag('room.resume_offline', true, 'giving up for now, credential kept');
          setSession(s => ({ ...s, roomId: null, secret: null, isCreator: false }));
        }
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
          connectionType: 'connecting',
          // Server is the source of truth for the Stay Connected badge.
          stayConnected: !!(res as { stayConnected?: boolean }).stayConnected
        }));
        startSeatKeepalive();
        if (peerManagerRef.current) peerManagerRef.current.destroy();
        const gen = ++pmGenerationRef.current;
        void createPeerManager(stored.roomId, stored.secret, false).then(pm => {
          if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
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
    // Start the resume on the NEXT tick, not "whenever the browser is idle"
    // (requestIdleCallback could legally wait its full 2s timeout on a busy
    // main thread — two dead seconds staring at the connecting screen after
    // every refresh). tryResume is fully async — awaiting the socket and the
    // resume ack — so nothing here blocks first paint; the shell renders
    // this tick regardless. One macro-task of deferral just lets React
    // commit the initial state first.
    setTimeout(() => { if (!cancelled) void tryResume(); }, 0);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One create_room round-trip with a bounded ack window.
   *
   * The socket.io path previously had NO ack timeout: when the connection
   * dropped between "connected" and the emit, the callback never fired and
   * the Send button hung on "Creating room…" forever. Every transport now
   * resolves within ACK_TIMEOUT, and a transient-looking failure (timeout,
   * unreachable) is retried ONCE silently before surfacing — flaky networks
   * usually connect on the second attempt and the user never sees an error.
   */
  const createRoomOnce = (attempt: number): Promise<{ roomId: string; secret: string }> => {
    const ACK_TIMEOUT = 9000;
    return new Promise<{ roomId: string; secret: string }>((resolve, reject) => {
      const socket = getSocket();
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        diag('room.create_ack_timeout', true, `attempt ${attempt}`);
        // A dropped connection may recover on its own — force the transport
        // to restart now instead of waiting for its backoff.
        try { (socket as any).connect?.(); } catch { /* best effort */ }
        reject(new ConnectError('TIMEOUT'));
      }, ACK_TIMEOUT);

      try {
        socket.emit('create_room', (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          diag('room.create', !!res.success, res.success ? res.roomId : (res.error || 'unknown'));
          if (res.success && res.roomId && res.secret) {
            saveStoredSession({ roomId: res.roomId, secret: res.secret, isCreator: true, createdAt: res.createdAt });
            connMachine.to('PAIRING');
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
              partnerName: null,
              stayConnected: false,
              lastStayRoom: session.lastStayRoom
            });
            resolve({ roomId: res.roomId, secret: res.secret });
          } else {
            const code = res.code || res.error || '';
            roomCreateDiagEnd(createDiagRequestRef.current, 'failure', 'ROOM_CREATE_REJECTED', code);
            if (/too many attempts|rate/i.test(code)) reject(new ConnectError('RATE_LIMITED'));
            else reject(new ConnectError('REJECTED', humanizeError(res.code, res.error || "Couldn't start a session.")));
          }
        });
      } catch (e) {
        settled = true;
        clearTimeout(timer);
        reject(new ConnectError('UNKNOWN', String(e)));
      }
    });
  };

  // RequestId for the diag timeline, set by createSession before attempts.
  const createDiagRequestRef = { current: '' } as { current: string };

  const createSession = async (): Promise<{ roomId: string; secret: string }> => {
    abandonedRef.current = false;
    const requestId = crypto.randomUUID();
    createDiagRequestRef.current = requestId;
    devLog('Create Session clicked — connecting to socket…');
    roomCreateDiagStart(requestId, 'socket');
    try {
      await ensureSocketConnected();
    } catch (e) {
      roomCreateDiagEnd(requestId, 'failure', 'CLIENT_INIT_FAILURE', String(e));
      throw e;
    }
    devLog('Socket connected — sending create request');

    const MAX_ATTEMPTS = 2;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const created = await createRoomOnce(attempt);
        roomCreateDiagEnd(requestId, 'success');
        devLog('Room created — navigating');
        return created;
      } catch (e) {
        lastError = e;
        const code = describeConnectFailure(e);
        // One silent retry for transient shapes (timeout / unreachable).
        // Deterministic rejections (room rejected, rate limit, config) fail
        // immediately — retrying them just burns the user's time.
        const transient = code === 'TIMEOUT' || code === 'UNREACHABLE' || code === 'UNKNOWN';
        if (!transient || attempt === MAX_ATTEMPTS) break;
        diag('room.create_retry', true, `attempt ${attempt + 1} after ${code}`);
        try { await ensureSocketConnected(4000); } catch { break; }
      }
    }
    roomCreateDiagEnd(requestId, 'failure', 'CLIENT_INIT_FAILURE', String(lastError));
    throw lastError instanceof Error ? lastError : new ConnectError('UNKNOWN');
  };
  const joinWithCode = async (code: string) => {
    productEvent('product.first_interaction');
    productEvent('product.method_code');
    const requestId = crypto.randomUUID();
    roomCreateDiagStart(requestId, 'join');
    await ensureSocketConnected();
    const joinOnce = async (): Promise<{ success: boolean; error?: string }> => {
    await ensureSocketConnected();
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        roomCreateDiagEnd(requestId, 'failure', 'SIGNALING_TIMEOUT', 'join timed out');
        // Kick the transport like createRoomOnce does — the next attempt
        // then starts from a fresh connection, not a stale backoff.
        try { (getSocket() as any).connect?.(); } catch { /* best effort */ }
        resolve({ success: false, error: "Couldn't reach ShareTexts." });
      }, 12000);
      getSocket().emit('join_with_code', { code }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
        clearTimeout(timeout);
        diag('room.join', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          roomCreateDiagEnd(requestId, 'success');
          setupJoiner(res.roomId!, res.secret!, res.createdAt);
        } else {
          roomCreateDiagEnd(requestId, 'failure', 'ROOM_CREATE_REJECTED', res.code);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareTexts. Check your connection and try again.")) });
      });
    });
  };
  // Same resilience as Send: one silent retry when the failure looks like a
  // transport problem (slow handshake, dead socket) — a correct code should
  // NEVER die to a flaky first connection.
  const MAX_JOIN_ATTEMPTS = 2;
  let lastJoin: { success: boolean; error?: string } = { success: false };
  for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS; attempt++) {
    try {
      lastJoin = await joinOnce();
    } catch (e) {
      const reason = describeConnectFailure(e);
      if ((reason === 'TIMEOUT' || reason === 'UNREACHABLE' || reason === 'UNKNOWN') && attempt < MAX_JOIN_ATTEMPTS) {
        diag('room.join_retry', true, `attempt ${attempt + 1} after ${reason}`);
        try { await ensureSocketConnected(6000); continue; } catch { lastJoin = { success: false, error: friendlyJoinCopy(e) }; break; }
      }
      lastJoin = { success: false, error: friendlyJoinCopy(e) };
      break;
    }
    if (lastJoin.success || !/Couldn't reach ShareTexts/.test(lastJoin.error || '')) break;
    if (attempt < MAX_JOIN_ATTEMPTS) {
      diag('room.join_retry', true, `attempt ${attempt + 1} after emit timeout`);
      try { await ensureSocketConnected(6000); } catch { break; }
    }
  }
  return lastJoin;
};

  const joinWithLink = async (roomId: string) => {
    productEvent('product.first_interaction');
    productEvent('product.method_link');
    const linkOnce = () => new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        // Kick the transport so a retry starts from a fresh connection.
        try { (getSocket() as any).connect?.(); } catch { /* best effort */ }
        resolve({ success: false, error: "Couldn't reach ShareTexts." });
      }, 12000);
      getSocket().emit('join_with_link', { roomId }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string }) => {
        clearTimeout(timeout);
        diag('room.join_link', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          setupJoiner(res.roomId!, res.secret!, res.createdAt);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareTexts. Check your connection and try again.")) });
      });
    });
    // One silent retry for transport-shaped failures, same as code joins:
    // an /s/ link tap should never die to one slow handshake.
    let res = await linkOnce();
    if (!res.success && /Couldn't reach ShareTexts/.test(res.error || '')) {
      diag('room.join_link_retry', true, 'retrying after emit timeout');
      try { await ensureSocketConnected(6000); res = await linkOnce(); } catch { /* keep first result */ }
    }
    return res;
  };

  /**
   * Join via a stable /s/<code> share link. The code is resolved to a roomId
   * on the active transport, then the normal link-join path seats this device
   * and tells the other peer to connect — same flow as any other join.
   */
  const joinWithShortCode = async (code: string) => {
    productEvent('product.method_link'); // /s/<code> short links resolve here
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
    // Rejoining the SAME room (device dropped, re-entered the code): keep
    // this device's own history. Stored messages are reloaded below, and
    // partner files we no longer hold are re-requested on channel open.
    const isRejoin = session.roomId === roomId && session.messages.length > 0;
    const keptMessages = isRejoin ? session.messages : [];
    saveStoredSession({ roomId, secret, isCreator: false, createdAt, messages: keptMessages.length ? keptMessages : sanitizeStoredMessages(loadStoredSession()?.messages) });
    connMachine.to('PAIRING');
    setSession({
      roomId,
      secret,
      createdAt,
      isCreator: false,
      partnerConnected: false,
      partnerConnecting: false,
      connectionType: 'waiting',
      messages: keptMessages,
      closedReason: null,
      deviceName: session.deviceName,
      partnerName: null,
      stayConnected: false,
      lastStayRoom: session.lastStayRoom
    });
    startSeatKeepalive();
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    const gen = ++pmGenerationRef.current;
    void createPeerManager(roomId, secret, false).then(pm => {
      if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
      peerManagerRef.current = pm;
      setupPeerManager(pm);
    });
  };

  const setDeviceName = (name: string) => {
    try {
      localStorage.setItem(DEVICE_NAME_KEY, name);
    } catch { /* ignore */ }
    setSession(s => ({ ...s, deviceName: name }));
    // Re-announce the new name so the peer's label ("who am I talking to")
    // updates live. sendHello reads localStorage, so the rename lands in the
    // same packet. Best-effort: if we're disconnected the relay drops it and
    // the next connect announces anyway.
    void peerManagerRef.current?.sendHello().catch(() => { /* best-effort */ });
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
    const gen = ++pmGenerationRef.current;
    void createPeerManager(roomId, secret, false).then(pm => {
      if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
      peerManagerRef.current = pm;
      setupPeerManager(pm);
    });
    setSession(s => ({ ...s, connectionType: 'connecting' }));
  };
  requestReconnectRef.current = requestReconnect;

  // ---- Seat keepalive -------------------------------------------------------
  // "Persistent while the tab is open" needs an active heartbeat, not hope.
  // Browsers silently suspend background tabs: timers clamp past a minute,
  // socket.io's ping timeout (65s of silence) can quietly reap the seat, and
  // the WebRTC channel dies with the DTLS association — all while the tab
  // still LOOKS open to the user. On return, nothing re-seats until the user
  // acts. This is the root cause of "sometimes it just stops working".
  //
  // Two mechanisms, both cheap and idempotent:
  //   · a 90s visible-only cadence that quietly re- seats via resume_room
  //     (the server no-ops when we still hold the seat, so the cost when
  //     everything is healthy is one tiny ack), and
  //   · a visibility guard that runs the same re-seat the instant the tab
  //     becomes visible again — rebuilding the peer ONLY when the WebRTC
  //     channel is actually dead, so a healthy room is never churned.
  const SEAT_KEEPALIVE_MS = 90_000;
  const seatKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopSeatKeepalive = useCallback(() => {
    if (seatKeepaliveRef.current) { clearInterval(seatKeepaliveRef.current); seatKeepaliveRef.current = null; }
  }, []);
  /** Channel truth: is the WebRTC link (or its relay stand-in) actually up? */
  const channelHealthy = (): boolean => {
    const pc = peerManagerRef.current?.getPeerConnection?.() ?? null;
    if (!pc) return peerManagerRef.current != null && sessionRef.current.connectionType === 'relay';
    const st = (pc as RTCPeerConnection).connectionState;
    return st === 'connected' || st === 'connecting';
  };
  const reseatQuietly = useCallback(async (why: string): Promise<void> => {
    const s = sessionRef.current;
    if (!s.roomId || !s.secret) return;
    try {
      await ensureSocketConnected(8000);
    } catch { return; }
    const res = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const sock = getSocket();
      const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), 10_000);
      sock.emit('resume_room', { roomId: s.roomId, secret: s.secret }, (r: { success: boolean; error?: string }) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    if (!res.success) return;
    diag('seat.reseat', true, why);
    if (channelHealthy()) return; // everything fine — the ack was the whole point
    // Dead channel. Rebuild the peer so the partner's peer_joined trigger
    // and our fresh ICE restart the link — UNLESS the peer is CONFIRMED
    // gone (its grace elapsed / server confirmed the leave). Rebuilding
    // then would flip the honest 'disconnected' state to 'connecting' and
    // the header back to "Connected" for a dead room; the peer_joined
    // handler rebuilds anyway when the partner actually returns.
    if (sessionRef.current.connectionType !== 'disconnected') {
      if (peerManagerRef.current) peerManagerRef.current.destroy();
      const gen = ++pmGenerationRef.current;
      void createPeerManager(s.roomId, s.secret, false).then(pm => {
        if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
        peerManagerRef.current = pm;
        setupPeerManager(pm);
      });
      setSession(prev => ({
        ...prev,
        connectionType: prev.connectionType === 'direct' || prev.connectionType === 'relay' || prev.connectionType === 'local' ? 'connecting' : prev.connectionType,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const startSeatKeepalive = useCallback(() => {
    stopSeatKeepalive();
    seatKeepaliveRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void reseatQuietly('keepalive');
    }, SEAT_KEEPALIVE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-seat on tab return — the complement of the cadence (covers the
  // suspend-kill that happens BETWEEN beats).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!sessionRef.current.roomId) return;
      if (channelHealthy()) return;
      void reseatQuietly('visibility');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => stopSeatKeepalive, [stopSeatKeepalive]);

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
    // An explicit close ends even a Stay Connected room for both devices.
    // The re-entry credential is dropped too — the user chose to end it.
    if (session.stayConnected) saveLastStayRoom(null);
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
    resetRoomsBumpLatch(); // a fresh pairing may count again on this page
    if (session.roomId) {
      getSocket().emit('close_room', { roomId: session.roomId });
    }
    resetSession();
  };

  const resetSession = (reason?: string) => {
    // 1. Mark abandoned (must happen before room_closed echo can fire)
    if (reason) abandonedRef.current = false;
    resetRoomsBumpLatch(); // room gone — a new pairing may bump again
    // 2. Destroy WebRTC connection
    if (peerManagerRef.current) {
      try { peerManagerRef.current.destroy(); } catch { /* noop — idempotent */ }
      peerManagerRef.current = null;
    }
    // 3. Clear in-flight state (owned by the message engine)
    clearRuntimeState();
    // 4. Clear transfer state and revoke object URLs
    clearAllTransferState();
    for (const m of messagesRef.current) {
      if (m.attachment?.url) {
        try { URL.revokeObjectURL(m.attachment.url); } catch { /* noop */ }
      }
    }
    // 5. Clear localStorage FIRST — this prevents auto-resume on next load.
    // lastStayRoom is deliberately KEPT: a Stay Connected promise outlives a
    // casual disconnect so the landing page can offer re-entry. It is only
    // cleared by closeSession (explicit close) or the re-entry itself.
    saveStoredSession(null);
    stopSeatKeepalive();
    // 6. Clear the URL bar (remove /s/<code> or ?join= params)
    try {
      if (window.location.pathname !== '/' && window.location.pathname !== '/docs') {
        window.history.replaceState({}, document.title, '/');
      }
    } catch { /* noop */ }
    // 7. Update React state — landing renders immediately. Re-read the
    // last-stay credential from localStorage: the persist effect wrote it
    // WHILE seated, but React state only learns at page mount — keeping the
    // stale value here hid the rejoin card until a reload ("rejoin works
    // sometimes").
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
      partnerName: null,
      stayConnected: false,
      lastStayRoom: loadLastStayRoom()
    }));
  };

  /**
   * Re-enter the last Stay Connected room from the landing page button.
   * Resumes with the stored secret (server validates), keeps this device's
   * local history, and re-establishes WebRTC exactly like requestReconnect.
   */
  const rejoinStayRoom = async (): Promise<boolean> => {
    const stay = session.lastStayRoom || loadLastStayRoom();
    if (!stay) return false;
    try {
      await ensureSocketConnected();
    } catch {
      return false;
    }
    const res = await new Promise<{ success: boolean; error?: string; createdAt?: number; stayConnected?: boolean }>((resolve) => {
      const socket = getSocket();
      const timer = setTimeout(() => resolve({ success: false, error: 'timeout' }), 12000);
      socket.emit('resume_room', { roomId: stay.roomId, secret: stay.secret }, (r: { success: boolean; error?: string; createdAt?: number; stayConnected?: boolean }) => {
        clearTimeout(timer);
        resolve(r);
      });
    });
    diag('stay.rejoin', !!res.success, res.success ? 'ok' : (res.error || 'fail'));
    if (!res.success) {
      // Only a definitive "room gone / bad secret" clears the re-entry card;
      // a timeout or unreachable network is transient — the card must survive
      // so the user can retry from a better connection.
      if (/not.?found|expired|invalid|denied|secret|gone|closed/i.test(res.error || '')) {
        saveLastStayRoom(null);
        setSession(s => ({ ...s, lastStayRoom: null }));
      }
      return false;
    }
    // History snapshot: the last-stay record keeps its own sanitized copy of
    // the room's messages (mirrored live by the persist effect), because the
    // main stored session was cleared when the device disconnected.
    const history = sanitizeStoredMessages(loadLastStayRoom()?.messages || []);
    saveStoredSession({
      roomId: stay.roomId,
      secret: stay.secret,
      isCreator: false,
      createdAt: res.createdAt,
      stayConnected: true,
      messages: history
    });
    if (peerManagerRef.current) peerManagerRef.current.destroy();
    startSeatKeepalive();
    const gen = ++pmGenerationRef.current;
    void createPeerManager(stay.roomId, stay.secret, false).then(pm => {
      if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
      peerManagerRef.current = pm;
      setupPeerManager(pm);
    });
    setSession(s => ({
      ...s,
      roomId: stay.roomId,
      secret: stay.secret,
      createdAt: res.createdAt,
      partnerConnected: false,
      partnerConnecting: false,
      connectionType: 'connecting',
      closedReason: null,
      messages: history,
      stayConnected: true
    }));
    return true;
  };

  /** Toggle the room-wide Stay Connected promise. The server validates
   *  membership, flips its source-of-truth flag, and echoes the new state to
   *  BOTH devices — so the client only optimistically paints, then trusts
   *  the echo (stay_connected_state) as the real badge. */
  const setStayConnected = (enabled: boolean) => {
    if (!session.roomId) return;
    setSession(s => ({ ...s, stayConnected: enabled }));
    getSocket().emit(enabled ? 'stay_connected_enable' : 'stay_connected_disable', { roomId: session.roomId });
  };

  return (
    <SessionContext.Provider value={{ session, createSession, joinWithCode, joinWithLink, joinWithShortCode, sendMessage, updateMessageAttachment, retryTransfer, retryText, cancelTransfer, pauseTransfer, resumeTransferById, setDeviceName, transferSpeedFor, requestReconnect, refreshCode, closeSession, leaveView, abandonSession, setStayConnected, registerRoomViewer, claimSeen, rejoinStayRoom }}>
      {children}
    </SessionContext.Provider>
  );
}
