import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { SessionState, ChatMessage, ConnectionType, PeerDevice } from '../types';
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
// Multi-device room: roster mirror (membership vs. per-device links) and the
// per-peer connection manager. A participant's link state never mutates
// another participant's row; the roster store is the single source of truth.
import { roomRoster, participantIdFor, type RosterEntry } from './roomRoster';
import { PeerConnectionManager } from './peerConnections';
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
  /** Multi-device: retry / cancel ONE recipient's leg of a fan-out send. */
  retryRecipient: (messageId: string, recipientId: string) => Promise<void>;
  cancelRecipient: (messageId: string, recipientId: string) => void;
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
  /** Multi-device room roster (this device included; isSelf marks it). */
  peers: PeerDevice[];
  /** This device's stable participant id in the current room (or null). */
  selfParticipantId: string | null;
  /** Recipients for the NEXT send (participant ids). */
  recipients: string[];
  toggleRecipient: (participantId: string) => void;
  selectAllRecipients: () => void;
  clearRecipients: () => void;
  /** Open (or warm) the direct link to a participant on demand — used by
   *  the device picker and by the send path. NEVER builds a full mesh: only
   *  links the user's choices actually require. */
  ensureLink: (participantId: string) => Promise<boolean>;
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
      lastStayRoom: loadLastStayRoom(),
      peers: [],
      recipients: []
    };
  });

  // One-time identity bootstrap (in session/deviceIdentity.ts).
  useEffect(() => {
    const migrated = ensureDeviceNameSeeded();
    if (migrated) setSession(s => ({ ...s, deviceName: migrated }));
  }, []);

  const peerManagerRef = useRef<PeerManager | null>(null);
  /** Multi-device room manager: participantId → PeerManager. The classic
   *  single-peer flow mirrors its one link into peerManagerRef so every
   *  existing consumer (message engine, seen receipts, diagnostics) keeps
   *  working unchanged. */
  const pcmRef = useRef<PeerConnectionManager | null>(null);
  /** This device's stable participant id in the CURRENT room (null when not
   *  seated). Room-scoped: a refresh reclaims the same roster seat. */
  const selfPidRef = useRef<string | null>(null);
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
  /** Most recent NEW room member (multi-device): the initiator defers its
   *  WebRTC offer until a real send needs the link — no full mesh. */
  const lastJoinedPeerRef = useRef<string | null>(null);
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
    getRecipients: () => recipientsRef.current,
    // Routed through a ref: ensureLink is defined below (it closes over the
    // room manager refs), and useMessageEngine must not capture a TDZ binding.
    ensureLink: (pid: string) => ensureLinkRef.current(pid),
  });
  const { updateMessageAttachment, sendMessage, retryText, retryTransfer, cancelTransfer, pauseTransfer, resumeTransferById, transferSpeedFor, wirePeerHandlers, handleChannelOpen, handlePushMessage, clearRuntimeState, setPcm, retryRecipient, cancelRecipient } = messageEngine;

  // ---- Multi-device roster mirror -------------------------------------------
  // The authoritative roster lives in the framework-free RoomRoster store;
  // this subscription mirrors it into React state (peers[]) for the device
  // picker, room header and composer summary. One subscription per provider
  // — components never poll.
  const [peers, setPeers] = useState<PeerDevice[]>([]);
  useEffect(() => {
    const mirror = () => {
      setPeers(roomRoster.entries().map((e: RosterEntry) => ({ ...e })));
    };
    mirror();
    return roomRoster.subscribe(mirror);
  }, []);
  // Per-link truth → partnerConnected: any OPEN link means "someone can hear
  // me". Multi-device rooms have no single partner, so the honest aggregate
  // (≥1 connected link among LIVE participants) is what the composer, header
  // and state machine should believe. Keeps the classic 1-to-1 flow
  // byte-identical (no pcm → no pcm callback → no behavior change).
  useEffect(() => {
    const pcm = pcmRef.current;
    if (!pcm) return;
    pcm.onAnyLinkChange = () => {
      const liveIds = new Set(roomRoster.otherEntries().filter(e => e.link !== 'offline').map(e => e.id));
      const anyOpen = pcm.linked().some(id => liveIds.has(id));
      setSession(s => (s.partnerConnected === anyOpen ? s : { ...s, partnerConnected: anyOpen }));
    };
    return () => { if (pcmRef.current) pcmRef.current.onAnyLinkChange = null; };
  }, [session.roomId]);
  /** Recipients for the NEXT send (participant ids). Kept OUTSIDE React
   *  state? No — inside session state (below) so the composer renders it
   *  and the persistence effect can ignore it (ephemeral by design). */
  const [recipients, setRecipients] = useState<string[]>([]);
  const recipientsRef = useRef<string[]>([]);
  recipientsRef.current = recipients;

  /** Resolve a live link for a participant through the room manager,
   *  creating the PeerManager (and its hooks) on first need. */
  const ensureLinkFor = useCallback((participantId: string): Promise<PeerManager | null> => {
    const s = sessionRef.current;
    if (!s.roomId || !s.secret || !pcmRef.current) return Promise.resolve(null);
    const pcm = pcmRef.current;
    return pcm.ensure(
      participantId,
      {
        onOpen: () => {
          roomRoster.setLink(participantId, 'connected');
          lastFailureCodeRef.current = null;
          // Recovery inside the grace window — cancel the calm timer.
          if (disconnectCalmTimerRef.current) { clearTimeout(disconnectCalmTimerRef.current); disconnectCalmTimerRef.current = null; }
          // Same channel-open consequences every link gets: late DELIVERED
          // receipts, resend requests, interrupted-transfer resume.
          const pm = pcmRef.current?.get(participantId);
          if (pm) handleChannelOpen(pm);
          emitRoomConnected();
          recordConnection();
          connMachine.to('CONNECTED');
        },
        onDisconnect: () => {
          roomRoster.setLink(participantId, 'reconnecting');
        },
        onDisconnectImmediate: () => {
          roomRoster.setLink(participantId, 'offline');
        },
        onNegotiating: () => {
          roomRoster.setLink(participantId, 'connecting');
        },
      },
      async () => {
        const pm = await createPeerManager(s.roomId!, s.secret!, true);
        pm.attach(participantId);
        wirePeerHandlers(pm);
        return pm;
      },
    ).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        pcmLinks: () => pcmRef.current?.linked() ?? [],
        pcmLink: (pid: string) => {
          const pm = pcmRef.current?.get(pid);
          return pm ? { bound: pm.boundId, dc: pm.getDataChannel()?.readyState ?? null } : null;
        },
        recipients: () => recipientsRef.current,
        session: () => sessionRef.current,
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

    socket.on('peer_joined', (payload: { peerId?: string; participant?: { id: string; name: string; platform: string; joinedAt: number }; roster?: { participants?: never[]; seq?: number }; initiatorId?: string | null }) => {
      const peerId = payload?.peerId || '';
      // A peer is now in the room. In a MULTI-device room this is a roster
      // DELTA — the new member is added to the picker, but WebRTC connects
      // ONLY when a data relationship is needed (never a full mesh).
      diag('peer.peer_joined', true, peerId.slice(0, 8));
      const multi = roomRoster.size > 0;
      if (payload.roster && Array.isArray(payload.roster.participants)) {
        roomRoster.applySnapshot(payload.roster as never);
      } else if (payload.participant) {
        roomRoster.upsert(payload.participant, { link: 'none' });
      }
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
        connectionType: s.connectionType === 'disconnected' || s.connectionType === 'waiting' ? 'connecting' : s.connectionType
      }));
      // Link discipline (NO full mesh). A TWO-device room keeps the classic
      // behavior — connect immediately, exactly as before (the common case
      // must not regress). From the THIRD member on, only the deterministic
      // initiator (most senior member — the server's pick) may open a link,
      // and it defers until a real send needs it: joining a big room must
      // not spawn N-1 WebRTC connections.
      const s = sessionRef.current;
      const roomSize = roomRoster.size;
      const amInitiator = roomSize <= 2
        ? true // classic pair: either side may offer (refresh coverage)
        : !!payload.initiatorId && payload.initiatorId === selfPidRef.current;
      if (s.roomId && s.secret && peerId) {
        startSeatKeepalive();
        if (roomSize > 2) {
          // Multi-device: EVERYONE pre-warms an ANSWERING link to the new
          // member (bound, registered with the router — but NO offer: links
          // open on demand, never a mesh). A junior member can offer to the
          // senior at any time: the senior's parked link answers. Without it
          // the offer would find no handler and both devices would sit on
          // "Connecting…".
          roomRoster.setLink(peerId, 'connecting');
          void ensureLinkFor(peerId).then(pm => {
            if (!pm) roomRoster.setLink(peerId, 'none'); // honest per-link failure
          }).catch(() => {
            roomRoster.setLink(peerId, 'none');
          });
          if (amInitiator) {
            lastJoinedPeerRef.current = peerId;
            diag('peer.joined_no_mesh', true, `roster=${roomSize} initiator=${amInitiator}`);
          }
        } else {
          if (peerManagerRef.current) peerManagerRef.current.destroy();
          const gen = ++pmGenerationRef.current;
          void createPeerManager(s.roomId, s.secret, true).then(pm => {
            if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
            peerManagerRef.current = pm;
            setupPeerManager(pm);
            pm.initiateConnection(peerId);
          });
        }
      }
    });

    socket.on('peer_recovered', (payload: { peerId?: string; roster?: { participants?: never[]; seq?: number } }) => {
      const peerId = payload?.peerId || '';
      diag('peer.peer_recovered', true, peerId.slice(0, 8));
      if (payload.roster && Array.isArray(payload.roster.participants)) {
        roomRoster.applySnapshot(payload.roster as never);
      }
      setSession(s => ({
        ...s,
        partnerConnecting: true,
        connectionType: s.connectionType === 'disconnected' || s.connectionType === 'waiting' ? 'connecting' : s.connectionType
      }));
      // The peer's transport came back — same logical participant (stable
      // id). Every survivor re-offers WebRTC to it: 1-to-1 rebuilds the
      // single link; multi-device re-links only the pairs that had one (the
      // sender keeps its lane; unrelated members do nothing).
      const s = sessionRef.current;
      if (s.roomId && s.secret && peerId) {
        startSeatKeepalive();
        const multi = roomRoster.size > 2;
        if (multi) {
          // ALWAYS re-establish this pair's link — even when this side holds
          // no live link yet (the no-op that stranded a refreshed device with
          // zero links and a forever-disabled Send). A bounded retry loop
          // rides out the recovered peer's page hydration: the first offer
          // can legitimately land before its answering link is registered.
          roomRoster.setLink(peerId, 'connecting');
          void (async () => {
            for (let attempt = 0; attempt < 5; attempt++) {
              if (sessionRef.current.roomId !== s.roomId) return; // room changed
              if (roomRoster.entries().some(e => e.id === peerId && e.link === 'offline')) return; // confirmed gone
              const pm = await ensureLinkFor(peerId).catch(() => null);
              if (pm && await pm.ensureOpen(8000).catch(() => false)) return; // link is back
              await new Promise(r => setTimeout(r, 2500));
            }
            roomRoster.setLink(peerId, 'none');
          })();
        } else {
          if (peerManagerRef.current) peerManagerRef.current.destroy();
          const gen = ++pmGenerationRef.current;
          void createPeerManager(s.roomId, s.secret, true).then(pm => {
            if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
            peerManagerRef.current = pm;
            setupPeerManager(pm);
            pm.initiateConnection(peerId);
          });
        }
      }
    });

    socket.on('peer_disconnected', (payload: { peerId?: string } | undefined) => {
      const goneId = payload?.peerId || '';
      // The server CONFIRMED a device really left (its 60s seat grace
      // elapsed or it left cleanly). In a multi-device room this isolates
      // to THAT participant's row — the rest of the room is untouched. In
      // the classic 1-to-1 room the single link dies, as before.
      diag('peer.confirmed_gone', true, goneId.slice(0, 8));
      const multi = roomRoster.size > 0;
      if (multi) {
        if (goneId) roomRoster.markOffline(goneId);
        if (goneId) pcmRef.current?.destroyLink(goneId);
        // The classic 1-to-1 link may BE the departed participant's channel
        // (pre-room-growth link) — retire it too, or the composer would
        // believe a dead channel is still listening.
        if (goneId && peerManagerRef.current?.boundId === goneId) {
          try { peerManagerRef.current.onDisconnect = null; peerManagerRef.current.onDisconnectImmediate = null; peerManagerRef.current.destroy(); } catch { /* idempotent */ }
          peerManagerRef.current = null;
        }
        // partnerConnected tracks the CLASSIC link only in 1-to-1 rooms; in
        // a seated multi-device room other live links must keep it true (the
        // pcm onAnyLinkChange mirror below owns the truth).
        if (roomRoster.size <= 2) setSession(s => ({ ...s, partnerConnected: false, connectionType: 'disconnected' }));
      } else {
        peerManagerRef.current?.onDisconnectImmediate?.();
      }
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
      // Mirror a rostered classic link into the picker's per-device truth —
      // a link that predates the room's growth to 3+ is otherwise shown as
      // 'none' forever even while it carries live traffic.
      if (pm.boundId) roomRoster.setLink(pm.boundId, 'connected');
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
      const res = await new Promise<{ success: boolean; error?: string; createdAt?: number; myParticipantId?: string; roster?: { participants?: unknown[]; seq?: number } }>((resolve) => {
        socket.emit('resume_room', { roomId: stored.roomId, secret: stored.secret, pid: participantIdFor(stored.roomId) }, resolve);
      });
      if (cancelled) return;
      diag('room.resume', !!res.success, res.success ? 'ok' : (res.error || 'unknown'));
      if (res.success) {
        // Back in the room, but the WebRTC channel is new — the app shows
        // "Connecting…" until it opens, instead of a premature green badge.
        selfPidRef.current = res.myParticipantId || participantIdFor(stored.roomId);
        setRecipients([]); // resume re-reads the roster — the selection starts clean
        roomRoster.reset(selfPidRef.current);
        if (res.roster && Array.isArray(res.roster.participants)) {
          roomRoster.applySnapshot(res.roster as never);
        }
        pcmRef.current?.destroy();
        pcmRef.current = new PeerConnectionManager(stored.roomId, stored.secret);
        setPcm(pcmRef.current); // fan-out legs route through per-recipient links
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
        const liveOthers = roomRoster.otherEntries().filter(e => e.link !== 'offline');
        if (liveOthers.length > 1) {
          // Multi-device resume: NO classic peer — pre-warm an ANSWERING link
          // to every live member so their peer_recovered re-offers find a
          // registered handler the moment they arrive (the survivors offer;
          // this device answers). A bare classic PM here used to grab the
          // router's unbound slot and steal frames addressed to pcm links.
          // sessionRef is refreshed first — see the join-path note.
          sessionRef.current = { ...sessionRef.current, roomId: stored.roomId, secret: stored.secret };
          const gen = ++pmGenerationRef.current;
          void (async () => {
            for (const entry of liveOthers) {
              if (gen !== pmGenerationRef.current) return; // superseded
              roomRoster.setLink(entry.id, 'connecting');
              const pm = await ensureLinkFor(entry.id).catch(() => null);
              if (!pm) roomRoster.setLink(entry.id, 'none');
            }
          })();
        } else {
          const gen = ++pmGenerationRef.current;
          void createPeerManager(stored.roomId, stored.secret, false).then(pm => {
            if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
            peerManagerRef.current = pm;
            setupPeerManager(pm);
            // The resume ack carries the roster — mirror the partner's link
            // state so the device picker starts honest.
            for (const entry of roomRoster.otherEntries()) {
              roomRoster.setLink(entry.id, entry.link === 'offline' ? 'offline' : 'none');
            }
          });
        }
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
    // (Multi-device: tryResume below carries the stored room's participant
    // id so the server reclaims the SAME roster seat — never a duplicate.)
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

      // A random pre-pid works for create: the room-scoped stable id is
      // minted AFTER the server assigns the roomId (server echoes it in
      // myParticipantId, we persist it below).
      try {
        socket.emit('create_room', { pid: crypto.randomUUID() }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string; myParticipantId?: string; roster?: { participants?: unknown[]; seq?: number } }) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          diag('room.create', !!res.success, res.success ? res.roomId : (res.error || 'unknown'));
          if (res.success && res.roomId && res.secret) {
            // Persist THIS device's participant id for the new room so a
            // refresh reclaims the same roster seat.
            selfPidRef.current = res.myParticipantId || participantIdFor(res.roomId);
            try {
              localStorage.setItem('sharetext.deviceId', JSON.stringify({
                ...JSON.parse(localStorage.getItem('sharetext.deviceId') || '{}'),
                [res.roomId]: selfPidRef.current,
              }));
            } catch { /* private mode */ }
            roomRoster.reset(selfPidRef.current);
            if (res.roster && Array.isArray(res.roster.participants)) {
              roomRoster.applySnapshot(res.roster as never);
            }
            pcmRef.current?.destroy();
            pcmRef.current = new PeerConnectionManager(res.roomId, res.secret);
            setPcm(pcmRef.current); // fan-out legs route through per-recipient links
            setRecipients([]); // a new room starts unaddressed — never carry a stale selection
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
            else reject(new ConnectError('REJECTED', humanizeError(res.code, res.error || "Couldn't start a session."), res.code));
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
      // join_with_code has no roomId yet (the code IS the address) — mint a
      // provisional pid; the server echoes the authoritative one back and
      // setupJoiner persists it under the real room.
      getSocket().emit('join_with_code', { code, pid: crypto.randomUUID() }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string; myParticipantId?: string; roster?: { participants?: unknown[]; seq?: number } }) => {
        clearTimeout(timeout);
        diag('room.join', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          roomCreateDiagEnd(requestId, 'success');
          setupJoiner(res.roomId!, res.secret!, res.createdAt, res.myParticipantId, res.roster as never);
        } else {
          roomCreateDiagEnd(requestId, 'failure', 'ROOM_CREATE_REJECTED', res.code);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareTexts. Check your internet and try again.")) });
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
      getSocket().emit('join_with_link', { roomId, pid: participantIdFor(roomId) }, (res: { success: boolean; roomId?: string; secret?: string; createdAt?: number; error?: string; code?: string; myParticipantId?: string; roster?: { participants?: unknown[]; seq?: number } }) => {
        clearTimeout(timeout);
        diag('room.join_link', !!res.success, res.success ? 'ok' : (res.code || res.error || 'unknown'));
        if (res.success) {
          setupJoiner(res.roomId!, res.secret!, res.createdAt, res.myParticipantId, res.roster as never);
        }
        resolve({ ...res, error: humanJoinError(res.code, humanizeError(res.code, res.error || "Couldn't reach ShareTexts. Check your internet and try again.")) });
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

  const setupJoiner = (roomId: string, secret: string, createdAt?: number, myPid?: string, roster?: { participants?: unknown[]; seq?: number } | null) => {
    abandonedRef.current = false;
    // Rejoining the SAME room (device dropped, re-entered the code): keep
    // this device's own history. Stored messages are reloaded below, and
    // partner files we no longer hold are re-requested on channel open.
    const isRejoin = session.roomId === roomId && session.messages.length > 0;
    const keptMessages = isRejoin ? session.messages : [];
    // Stable participant id: prefer the server's echo (authoritative), fall
    // back to the locally minted room-scoped id. Either way a refresh will
    // reclaim the SAME roster seat.
    selfPidRef.current = myPid || participantIdFor(roomId);
    setRecipients([]); // a fresh seat starts unaddressed
    roomRoster.reset(selfPidRef.current);
    if (roster && Array.isArray(roster.participants)) {
      roomRoster.applySnapshot(roster as never);
    }
    pcmRef.current?.destroy();
    pcmRef.current = new PeerConnectionManager(roomId, secret);
    setPcm(pcmRef.current); // fan-out legs route through per-recipient links
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
    const liveOthers = roomRoster.otherEntries().filter(e => e.link !== 'offline');
    if (liveOthers.length > 1) {
      // Multi-device join: pre-warm an ANSWERING link to every live member —
      // no classic peer (it would squat the router's unbound slot and steal
      // frames addressed to per-participant links). sessionRef is refreshed
      // FIRST: ensureLinkFor reads it, and at this point React has not yet
      // re-rendered (the stale snapshot still says roomId: null, which made
      // every pre-warm silently no-op and left this device unable to answer
      // any offer).
      sessionRef.current = { ...sessionRef.current, roomId, secret };
      void (async () => {
        for (const entry of liveOthers) {
          roomRoster.setLink(entry.id, 'connecting');
          const pm = await ensureLinkFor(entry.id).catch(() => null);
          if (!pm) roomRoster.setLink(entry.id, 'none');
        }
      })();
    } else {
      const gen = ++pmGenerationRef.current;
      void createPeerManager(roomId, secret, false).then(pm => {
        if (gen !== pmGenerationRef.current) { pm.destroy(); return; } // superseded
        peerManagerRef.current = pm;
        setupPeerManager(pm);
      });
    }
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
  // Goodbye on real departure: pagehide fires for tab closes AND navigations
  // (unlike beforeunload) and does not block teardown. Backgrounding a tab is
  // NOT a goodbye — visibilitychange handles recovery for that case above.
  useEffect(() => {
    const onLeave = () => { peerManagerRef.current?.notifyLeaving(); };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
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
    // Say goodbye over the still-open channel: the peer sees the true
    // disconnected state immediately instead of a 60s "maybe they're coming
    // back" window. Must run BEFORE the channel is destroyed.
    peerManagerRef.current?.notifyLeaving();
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
    // 2. Destroy WebRTC connection. The lifecycle callbacks are detached
    // BEFORE destroy(): closing the channel/PC fires the manager's own
    // disconnect path, which would otherwise run the fresh session's
    // machine back into RECONNECTING on a room that no longer exists
    // (observed as an IDLE → RECONNECTING rejection in the diag log).
    if (peerManagerRef.current) {
      try {
        peerManagerRef.current.onDisconnect = null;
        peerManagerRef.current.onDisconnectImmediate = null;
        peerManagerRef.current.destroy();
      } catch { /* noop — idempotent */ }
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
    setRecipients([]); // session over — the recipient selection is ephemeral
    // A pending disconnect-calm timer is part of the DEAD session: if it
    // fired after the reset it would flip the fresh session's state (the
    // IDLE → RECONNECTING rejection in the logs). Cancel it here where
    // every teardown path converges.
    if (disconnectCalmTimerRef.current) { clearTimeout(disconnectCalmTimerRef.current); disconnectCalmTimerRef.current = null; }
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
    // The session lifecycle is over — the machine starts clean too. Without
    // this, a room that ended while RECONNECTING (peer gone → room closed)
    // left the machine wedged there: every later derivation to IDLE or
    // DISCOVERING was rejected as illegal, and the diagnostics panel kept
    // reporting a reconnect that could never happen.
    connMachine.reset();
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

  // ---- Multi-recipient selection + send ------------------------------------
  const toggleRecipient = useCallback((participantId: string) => {
    if (!participantId || participantId === selfPidRef.current) return;
    setRecipients(prev => prev.includes(participantId)
      ? prev.filter(id => id !== participantId)
      : [...prev, participantId]);
    // Selecting a device is intent to talk to it — warm the link (bounded,
    // no mesh: one link per selection, only for chosen devices).
    void ensureLinkFor(participantId).catch(() => { /* picker shows the honest link state */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectAllRecipients = useCallback(() => {
    const all = roomRoster.otherEntries().filter(e => e.link !== 'offline').map(e => e.id);
    setRecipients(all);
    for (const id of all) {
      void ensureLinkFor(id).catch(() => { /* per-link failure stays per-link */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearRecipients = useCallback(() => setRecipients([]), []);

  const ensureLinkRef = useRef<(participantId: string) => Promise<boolean>>(async () => false);
  const ensureLink = useCallback((participantId: string): Promise<boolean> => {
    return ensureLinkFor(participantId).then(pm => {
      if (!pm) return false;
      return pm.ensureOpen().catch(() => false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  ensureLinkRef.current = ensureLink;

  // Mirror roster + recipients into the session snapshot the UI reads.
  useEffect(() => {
    setSession(s => ({ ...s, peers, recipients }));
  }, [peers, recipients]);

  return (
    <SessionContext.Provider value={{ session: { ...session, peers, recipients }, createSession, joinWithCode, joinWithLink, joinWithShortCode, sendMessage, updateMessageAttachment, retryTransfer, retryText, cancelTransfer, pauseTransfer, resumeTransferById, setDeviceName, transferSpeedFor, requestReconnect, refreshCode, closeSession, leaveView, abandonSession, setStayConnected, registerRoomViewer, claimSeen, rejoinStayRoom, peers, selfParticipantId: selfPidRef.current, recipients, toggleRecipient, selectAllRecipients, clearRecipients, ensureLink, retryRecipient, cancelRecipient }}>
      {children}
    </SessionContext.Provider>
  );
}
