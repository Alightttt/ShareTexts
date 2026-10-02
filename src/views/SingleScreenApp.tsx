/**
 * SingleScreenApp — the app is one continuous screen: pair, then transfer.
 *
 * Desktop (≥1024px): two-pane composition. Balanced 50/50 at 1024–1279 px,
 * asymmetric ≈44/56 at ≥1280 px so the active room gets the wider half.
 *   Left  = brand · action · context · footer (content centered per block)
 *   Right = the transfer room (flex-1, fills the other half)
 *
 * Mobile (<1024px): a single column with ONE section at a time.
 *   Idle / pairing → header · hero (Send / Receive / code entry) · footer
 *   Connected      → the transfer room TAKES OVER the whole screen (full-bleed
 *                    ChatView with its own slim device bar). No stacked
 *                    summary above the chat — the chat IS the screen.
 *
 * The experience: DEVICE → CONNECT → TRANSFER → RECEIVED
 */
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { updateRoomBadge, setRoomBadgeActive } from '../lib/roomBadge';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { SendCircleIcon, ReceiveCircleIcon, DisconnectGlyph } from '../components/TransferIcons';
import { TactileButton } from '../components/TactileButton';
import { InlineConfirm } from '../components/InlineConfirm';
import { BookOpen } from '@gravity-ui/icons';
import { ConnectHandshake } from '../components/ConnectHandshake';
import { CommandBar, CommandBarChip } from '../components/CommandBar';
import { signalingConfigIssue, prewarmSignaling } from '../lib/socket';
import { loadStoredSession } from '../lib/session/persistence';
import { ConnectError, describeConnectFailure, errCodeToKey } from '../lib/errors';
import { HeroTransferScene } from '../components/HeroTransferScene';
import { useLiveStats } from '../lib/useLiveStats';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { SettingsOverlay } from '../components/SettingsOverlay';
import { StayConnectedToggle, StayBadge } from '../components/StayConnectedToggle';
import { NearbyDevices } from '../components/NearbyDevices';
import { SkeletonScreen } from '../components/SkeletonScreen';
import { productEvent } from '../lib/telemetry';
import { useI18n } from '../lib/i18n';
import { LanguageMenu } from '../components/LanguageMenu';
import { cn, shortCodeOf, sanitizeDeviceName, formatBytes } from '../lib/utils';
import {
  LogOut, QrCode, Link2, Copy, Check,
  Smartphone, Monitor, X, Wifi, ArrowRightLeft, ArrowLeft, Info, Pencil, WifiOff, ServerOff,
  Infinity as InfinityIcon, Upload, RotateCcw, Settings as SettingsIcon, Clock3
} from 'lucide-react';
import { SpaceCreateSheet, SpaceJoinSheet } from './SpaceView';
import { recentSpaces } from '../lib/space/api';
import { remainingShort as remainingShortOf } from '../lib/space/time';
import { generateTOTP } from '../lib/totp';
import { useFocusTrap } from '../lib/useFocusTrap';
const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));
const ChatView = lazy(() => import('./ChatView').then(m => ({ default: m.ChatView })));
type PanelMode = 'idle' | 'sending' | 'receiving' | 'connecting' | 'connected';
const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/*  Tiny hooks                                                        */
/* ------------------------------------------------------------------ */
function useIsMobileDevice() {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent) || (window.innerWidth < 1024 && 'ontouchstart' in window);
  });
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

/**
 * True when the two-pane desktop layout is active. Desktop and mobile layout
 * branches both reference the same leftPanel/roomPanel elements; only mounting
 * the branch that matches the current viewport keeps a SINGLE copy of every
 * component in the DOM (one ChatView, one composer, one pairing input)
 * instead of two — one visible and one hidden.
 */
function useIsDesktopLayout() {
  const [desktop, setDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}


/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function SingleScreenApp() {
  const { t } = useI18n();
  const { session, createSession, abandonSession, joinWithCode, joinWithShortCode, setDeviceName, rejoinStayRoom, requestReconnect, refreshCode } = useSession();
  const isDesktopLayout = useIsDesktopLayout();
  // "Is the link actually usable right now?" — during a stall the room
  // settles into 'connecting' while partnerConnected stays true; every green
  // "Connected" treatment must key off this, not the flag alone.
  const partnerLinkHealthy = session.partnerConnected && session.connectionType !== 'disconnected' && session.connectionType !== 'connecting';
  // Live activity tracker — real aggregate numbers from the signaling
  // service: devices seated right now + rooms ever created.
  const { roomsCreated } = useLiveStats();
  const [panelMode, setPanelMode] = useState<PanelMode>(() => {
    // REFRESH HONESTY: the stored session is the truth about where this
    // device was. Deriving the first panel from it (instead of always
    // starting on 'idle' and letting the sync effect cascade
    // idle → sending/connecting → connected a beat later) removes the
    // multi-screen flash a refresh used to paint. The creator resumes
    // onto their pairing screen (code intact from storage); the joiner
    // resumes onto the connecting screen, which the sync effect holds
    // until the channel reopens — no state argues with the initial one.
    const stored = loadStoredSession();
    if (!stored?.roomId) return 'idle';
    return stored.isCreator ? 'sending' : 'connecting';
  });
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // Settings — one overlay for theme / language / stay connected / reconnect.
  const [showSettings, setShowSettings] = useState(false);
  const [spaceSheet, setSpaceSheet] = useState<null | 'create' | 'join'>(null);
  const [recent, setRecent] = useState(() => { try { return recentSpaces(); } catch { return []; } });
  const [createError, setCreateError] = useState<{ text: string; icon: 'offline' | 'server' | 'time' | 'info' } | null>(null);
  const [showQROverlay, setShowQROverlay] = useState(false);
  const reduceMotion = useReducedMotion();
  const [showQRScan, setShowQRScan] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // Stay Connected re-entry: remembers failure so the button can honestly
  // say the room is gone (after a close or expiry) instead of blinking.
  const [stayGone, setStayGone] = useState(false);
  const [isRejoining, setIsRejoining] = useState(false);
  // Nearby discovery status, lifted into the existing activity tracker line.
  const [nearbyStatus, setNearbyStatus] = useState<string | null>(null);
  // Desktop drop-to-send: files released anywhere over the idle home screen
  // stage instantly and create the room in one motion — the fastest path
  // from "I have this file" to "it's moving". No state? No dialog first.
  const [homeDrop, setHomeDrop] = useState(false);
  const homeDropDepth = useRef(0);
  // If NearbyDevices unmounts (room created, route change) while a transient
  // status is showing, the counter line must come back — the child's own
  // effect can't run after it's gone, so the parent clears on unmount.
  const nearbyStatusRef = useRef(setNearbyStatus);
  useEffect(() => () => nearbyStatusRef.current(null), []);
  // Device-name editing in the connected pair visual (tap your name to
  // rename — the other device sees the change immediately).
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [dismissedNameNotice, setDismissedNameNotice] = useState(false);
  // ⌘K command bar — shared open state between the global hotkey (inside
  // CommandBar) and the header chip (here).
  const [cmdOpen, setCmdOpen] = useState(false);
  // The QR overlay closes itself once this room links — one dismissal per
  // room id, so a transient reconnect blip never re-opens it.
  const qrDismissedForRoomRef = useRef<string | null>(null);
  // The completed-handshake beat: when the channel first opens for the
  // CREATOR, the finished two-device scene (searching → connecting →
  // linked) holds for a moment BEFORE the room takes over — the payoff of
  // the pairing story is actually seen, not swapped away mid-breath. The
  // joiner already watched the handshake complete on their connecting
  // screen, so only the creator gets the beat.
  const [celebrateConnected, setCelebrateConnected] = useState(false);
  const celebratedRoomRef = useRef<string | null>(null);
  // Perceived speed: prewarm the lazily-loaded surfaces while the landing
  // page is idle, so tapping Receive (scanner), Show QR (renderer), or
  // completing a pairing (room) never waits on a network round-trip for
  // the chunk. Fire once, after first paint, completely off the hot path.
  useEffect(() => {
    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 3000 });
      else setTimeout(cb, 1200);
    };
    idle(() => {
      void import('./ChatView');
      void import('../components/QRScanner');
      void import('qrcode.react');
    });
  }, []);
  // /s/<code> share links: opening one should JOIN the room, not show the
  // landing page. The old multi-screen app handled this in JoinSession; the
  // single-screen consolidation dropped it. Restored: on mount, a /s/<code>
  // path auto-joins once the signaling socket is up. One attempt per code —
  // the effect re-runs only when the path changes, and a failed join shows
  // the normal idle screen where the user can enter a code manually.
  const joinedShortCodeRef = useRef<string | null>(null);
  // Prewarm the signaling socket the moment the landing mounts: by the time
  // a user taps Send, the WebSocket is already open — the code appears
  // instantly instead of waiting for a handshake.
  // A fresh Stay Connected promise (or a new credential) clears the
  // "room gone" state so the landing button comes back.
  useEffect(() => { if (session.lastStayRoom) setStayGone(false); }, [session.lastStayRoom]);
  useEffect(() => { prewarmSignaling(); }, []);
  useEffect(() => {
    const m = window.location.pathname.match(/^\/s\/([0-9a-f]{8})$/i);
    if (!m) return;
    const code = m[1].toLowerCase();
    if (joinedShortCodeRef.current === code) return;
    joinedShortCodeRef.current = code;
    setPanelMode('connecting');
    void joinWithShortCode(code).then((res) => {
      if (!res.success) {
        // Dead link — back to the landing screen; the user can pair manually.
        if (session.roomId === null) setPanelMode('idle');
      }
    }).catch(() => { if (session.roomId === null) setPanelMode('idle'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window.location.pathname]);
  // Set when the creator deliberately backs out of the connecting screen.
  // While set (until the link opens or the room changes) the auto-sync must
  // not bounce them straight back to 'connecting' — that would make the
  // escape hatch a lie. The sending panel still shows the live handshake in
  // place of the code, so nothing is hidden; it just stops taking over.
  const creatorLeftConnectingRef = useRef(false);

  /* --- device name editing --- */
  const startEditName = () => {
    setDraftName(session.deviceName);
    setEditingName(true);
  };
  const saveName = () => {
    const clean = sanitizeDeviceName(draftName);
    if (clean) setDeviceName(clean);
    setEditingName(false);
  };

  // "The channel has opened for this room." Once true, a later
  // partnerConnecting (peer_recovered after a drop) is a RECONNECT, not a
  // first connect: the room stays up — ChatView's reconnect banner is the
  // right surface — instead of bouncing back to the connecting screen.
  const everConnectedRoomRef = useRef<string | null>(null);
  const everConnectedRef = useRef(false);
  /* --- stuck-handshake honesty ------------------------------------------- */
  // A connecting screen that spins forever teaches users the app is broken.
  // Two thresholds, one message each: 15s "still trying, hang on" (with a
  // creator-side retry), 40s "the other device may have left" (the truth).
  const [stuckConnecting, setStuckConnecting] = useState(false);
  const [longStuckConnecting, setLongStuckConnecting] = useState(false);
  // Creator-side retry: re-seat the session and re-offer. The joiner side has
  // no such button — its only honest exit is cancel + fresh code, because
  // the joiner cannot re-offer (only the initiator can).
  const handleStuckRetry = useCallback(() => { void requestReconnect(); }, [requestReconnect]);
  useEffect(() => {
    if (panelMode !== 'connecting') {
      setStuckConnecting(false);
      setLongStuckConnecting(false);
      return;
    }
    const t1 = setTimeout(() => setStuckConnecting(true), 15_000);
    const t2 = setTimeout(() => setLongStuckConnecting(true), 40_000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [panelMode, session.roomId, session.partnerConnecting]);
  /* --- panel mode sync --- */
  useEffect(() => {
    if (session.roomId !== everConnectedRoomRef.current) {
      everConnectedRoomRef.current = session.roomId;
      everConnectedRef.current = false;
      creatorLeftConnectingRef.current = false;
    }
    if (session.partnerConnected) {
      everConnectedRef.current = true;
      creatorLeftConnectingRef.current = false;
    }
    if (session.partnerConnected) setPanelMode('connected');
    // Multi-device room (3+ members): this device is SEATED — the room is
    // real even before a personal WebRTC link opens (link-on-demand means a
    // member may hold NO link). Hiding behind "connecting" would strand
    // senders on a handshake screen inside their own room.
    else if ((session.peers?.length ?? 0) > 2 && session.roomId) setPanelMode('connected');
    // Once the channel has opened for this room, a later partnerConnecting is
    // a reconnect (handled above), never a first connect.
    else if (session.roomId && everConnectedRef.current) setPanelMode('connected');
    // A peer joined (either side) and the channel isn't open yet — the
    // connecting screen takes over until it is. The creator can opt out of
    // this takeover by backing out (creatorLeftConnectingRef); the handshake
    // still renders inline on their pairing screen.
    else if (session.partnerConnecting && session.roomId && !creatorLeftConnectingRef.current) setPanelMode('connecting');
    // Transient drop (peer lost the link, tab reloaded, network blip): stay
    // in the room so the reconnect banner + retry live where the transfer
    // was, instead of bouncing the creator back to the pairing screen and
    // hiding the in-flight messages.
    else if (session.roomId && session.connectionType === 'disconnected') setPanelMode('connected');
    else if (session.roomId && session.isCreator) setPanelMode('sending');
    else if (session.roomId && !session.isCreator) setPanelMode(p => (p === 'connecting' ? 'connecting' : 'receiving'));
    else if (!session.roomId) setPanelMode('idle');
  }, [session.roomId, session.isCreator, session.partnerConnected, session.partnerConnecting, session.connectionType]);

  /* --- tab status light (pill favicon + live title, room UI only) ---
     `connected` panel = the room UI is on screen. Landing, pairing and
     connecting screens keep the pristine tab identity. */
  const roomViewMounted = panelMode === 'connected';
  useEffect(() => {
    setRoomBadgeActive(roomViewMounted);
    return () => setRoomBadgeActive(false); // unmount → exact landing restore
  }, [roomViewMounted]);
  useEffect(() => {
    updateRoomBadge({
      inRoomView: roomViewMounted,
      connected: partnerLinkHealthy,
      // Amber covers both first handshake and stall/recovery — neither is
      // the user's fault, and neither is a red "problem".
      connecting: session.connectionType === 'connecting' || session.connectionType === 'establishing' || (session.roomId !== null && !partnerLinkHealthy && session.connectionType !== 'disconnected'),
      partnerName: session.partnerName,
      unread: 0, // future: unread count when the tab is hidden
    });
  }, [roomViewMounted, partnerLinkHealthy, session.connectionType, session.partnerName, session.roomId]);

  // The QR overlay is a pairing tool — the moment the partner is actually
  // connected it has done its job. Close it automatically so the user never
  // has to dismiss it themselves while the room is already taking over.
  useEffect(() => {
    if (session.partnerConnected && !qrDismissedForRoomRef.current) {
      qrDismissedForRoomRef.current = session.roomId;
      setShowQROverlay(false);
    }
  }, [session.partnerConnected, session.roomId]);
  // One celebration per room, at the true channel-open moment. Once it has
  // played, reconnects and drops never replay it — the room's own banner
  // owns those stories.
  useEffect(() => {
    if (!session.partnerConnected || !session.roomId) return;
    if (celebratedRoomRef.current === session.roomId) return;
    celebratedRoomRef.current = session.roomId;
    if (!session.isCreator) return;
    setCelebrateConnected(true);
    const timer = setTimeout(() => setCelebrateConnected(false), 1600);
    return () => clearTimeout(timer);
  }, [session.partnerConnected, session.roomId, session.isCreator]);

  // Keep panelMode honest when session flags move without a panel action:
  //  · creator: peer starts joining → handshake replaces the code screen
  //  · creator: peer gave up before the link opened → back to the code screen
  //  · joiner:  code accepted / link re-establishing (incl. post-refresh
  //             restore) → handshake until the channel actually opens
  // A settled 'connected' panel is never bounced by this effect — transient
  // drops keep the room visible with its reconnect banner.
  useEffect(() => {
    if (!session.roomId) return;
    if (session.isCreator) {
      if (session.partnerConnecting && !creatorLeftConnectingRef.current) setPanelMode(p => (p === 'connected' ? p : 'connecting'));
      else if (!session.partnerConnected) setPanelMode(p => (p === 'connecting' ? 'sending' : p));
    } else {
      const linking = session.partnerConnecting || session.connectionType === 'establishing' || session.connectionType === 'connecting';
      if (linking) setPanelMode(p => (p === 'connected' ? p : 'connecting'));
    }
  }, [session.roomId, session.isCreator, session.partnerConnected, session.partnerConnecting, session.connectionType]);

  // Focus traps for QR overlays
  const qrScanTrapRef = useFocusTrap(showQRScan, () => setShowQRScan(false));
  const qrDisplayTrapRef = useFocusTrap(showQROverlay, () => setShowQROverlay(false));

  /* --- handlers --- */
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;
  const createAbortRef = useRef(0);

  /**
   * Map a thrown connect failure to { translated copy, icon key }.
   * Replaces the old substring matching on raw English strings, which never
   * matched the actual copy and surfaced untranslated errors. Each branch
   * names the real cause: the device's network, our service, or timing.
   */
  const friendlyConnectError = useCallback((e: unknown): { text: string; icon: 'offline' | 'server' | 'time' | 'info' } => {
    const code = describeConnectFailure(e);
    if (code === 'OFFLINE') return { text: t('err.offline'), icon: 'offline' };
    if (code === 'UNREACHABLE') return { text: t('err.unreachable'), icon: 'server' };
    if (code === 'CONFIG') return { text: (e instanceof Error && e.message) || t('err.config'), icon: 'server' };
    if (code === 'RATE_LIMITED') return { text: t('err.ratelimited'), icon: 'time' };
    if (code === 'TIMEOUT') return { text: t('err.timeout2'), icon: 'time' };
    // REJECTED: the server named the real cause — translate it here by code
    // so every locale gets native copy (never raw English from the backend).
    if (e instanceof ConnectError && e.code === 'REJECTED') {
      const msgKey = errCodeToKey(e.serverCode);
      if (msgKey) return { text: t(msgKey), icon: 'info' };
    }
    if (e instanceof Error && e.message && !/^CONNECT|^[A-Z_]+$/.test(e.message) && signalingConfigIssue()) {
      return { text: e.message, icon: 'info' };
    }
    return { text: t('err.generic'), icon: 'info' };
  }, [t]);

  const handleSend = useCallback(async () => {
    if (isCreating) return;
    productEvent('product.first_interaction');
    productEvent('product.method_code'); // Send = create room → the code/QR/link path
    setPanelMode('sending');
    setIsCreating(true);
    setCreateError(null);
    // Latch for the fallback chips' short poll ("open the QR once the room
    // exists"): false while attempting, true only on success.
    (window as Window & { __stRoomReady?: boolean }).__stRoomReady = false;
    const thisAttempt = ++createAbortRef.current;
    try {
      await createSession();
      if (thisAttempt === createAbortRef.current) {
        setRetryCount(0);
        (window as Window & { __stRoomReady?: boolean }).__stRoomReady = true;
        // The tracker no longer bumps at room creation — it counts real
        // two-device connections (the data channel opening), matching the
        // honest server-side increment.
      }
    } catch (e: unknown) {
      if (thisAttempt !== createAbortRef.current) return;
      setCreateError(friendlyConnectError(e));
      setPanelMode('idle');
    } finally {
      if (thisAttempt === createAbortRef.current) setIsCreating(false);
    }
  }, [isCreating, createSession, t, friendlyConnectError]);

  const handleReceive = useCallback(() => { productEvent('product.first_interaction'); setPanelMode('receiving'); setCreateError(null); setJoinError(null); }, []);

  // Fallback-chip actions: "Show QR" / "Share link" create the room first
  // (if none exists), then surface the exact QR/link modal the normal send
  // flow uses. Reuses handleSend's error handling verbatim — one honest
  // failure path, not two.
  const waitForRoom = (onReady: () => void) => {
    const started = Date.now();
    const iv = setInterval(() => {
      if ((window as Window & { __stRoomReady?: boolean }).__stRoomReady) {
        clearInterval(iv);
        onReady();
      } else if (Date.now() - started > 8000) clearInterval(iv);
    }, 120);
  };
  const handleSendThenQr = useCallback(async () => {
    if (session.roomId) { setShowQROverlay(true); return; }
    await handleSend();
    // createSession may still be in flight; open the overlay once the room
    // exists. Short poll instead of wiring a new state channel.
    waitForRoom(() => setShowQROverlay(true));
  }, [session.roomId, handleSend]);
  const handleSendThenLink = useCallback(async () => {
    if (session.roomId) { void copyLink(); return; }
    await handleSend();
    waitForRoom(() => { void copyLink(); });
    // copyLink/shareUrl are declared later in the component — routing the
    // call through a ref keeps this callback dependency-clean.
  }, [session.roomId, handleSend]);

  // Drop-to-send handlers live after handleSend so the dep array can reference
  // it. The drop parks the FileList on window, then creates the room; the
  // parked bytes are picked up on mount by ChatView (see __stHomeDropFiles).
  const homeDropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHomeDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    homeDropDepth.current += 1;
    setHomeDrop(true);
  }, []);
  const onHomeDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);
  const onHomeDragLeave = useCallback(() => {
    homeDropDepth.current = Math.max(0, homeDropDepth.current - 1);
    if (homeDropDepth.current === 0) setHomeDrop(false);
  }, []);
  const onHomeDrop = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    homeDropDepth.current = 0;
    setHomeDrop(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    // Park the FileList: createSession() must finish before ChatView mounts,
    // and a synthetic event's FileList dies with it.
    const parked: File[] = Array.from(files);
    if (homeDropTimer.current) clearTimeout(homeDropTimer.current);
    homeDropTimer.current = setTimeout(() => {
      (window as Window & { __stHomeDropFiles?: File[] }).__stHomeDropFiles = parked;
      void handleSend();
    }, 0);
  }, [handleSend]);
  // The nearby section's fallback ("Can't see your device? → Use another
  // way") reaches straight into the hero's Receive flow — one window-level
  // hook, set here where the state lives, so the discovery area never needs
  // its own copy of the pairing UI.
  useEffect(() => {
    (window as Window & { __stOpenReceive?: () => void }).__stOpenReceive = handleReceive;
    return () => { delete (window as Window & { __stOpenReceive?: () => void }).__stOpenReceive; };
  }, [handleReceive]);
  // Fallback chips: "Show QR" / "Share link" — create the room when none is
  // live, then surface the QR overlay / copy the link. Idle-only by design:
  // once connected, the chat header and details sheet carry these actions.
  useEffect(() => {
    if (panelMode !== 'idle') return;
    const w = window as Window & { __stOpenSendQr?: () => void; __stOpenSendLink?: () => void };
    w.__stOpenSendQr = () => { productEvent('product.qr_opened'); void handleSendThenQr(); };
    w.__stOpenSendLink = () => { void handleSendThenLink(); };
    return () => { delete w.__stOpenSendQr; delete w.__stOpenSendLink; };
  }, [panelMode, handleSendThenQr, handleSendThenLink]);

  // Command bar wiring — REAL callbacks, not DOM scraping: the palette's
  // Send/Receive entries invoke the same handlers as the hero buttons, on
  // the same panel-mode state machine.
  useEffect(() => {
    const w = window as Window & { __stCommandSend?: () => void; __stCommandReceive?: () => void };
    w.__stCommandSend = () => { void handleSend(); };
    w.__stCommandReceive = () => handleReceive();
    return () => { delete w.__stCommandSend; delete w.__stCommandReceive; };
  }, [handleSend, handleReceive]);

  // One-tap re-entry into the last Stay Connected room. False = the room
  // is really gone (close/expiry) — say so instead of blinking the button.
  const handleStayRejoin = useCallback(async () => {
    if (isRejoining) return;
    setIsRejoining(true);
    const ok = await rejoinStayRoom();
    setIsRejoining(false);
    if (!ok) setStayGone(true);
  }, [isRejoining, rejoinStayRoom]);

  /* --- Esc on desktop opens the disconnect confirmation -------------------
     Only when a room is live and nothing else is open — otherwise Esc
     does its own job (closing menus, sheets, the image viewer). Mobile
     back is handled in ChatView (history guard) — this is the desktop half. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as Window & { __stImageViewerOpen?: boolean };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (panelMode !== 'connected') return; // rooms only
      if (w.__stImageViewerOpen) return;     // photo owns this Escape
      // Menus/sheets/overlays close themselves first (their own handlers);
      // the guard only ADDS the disconnect confirmation when nothing else
      // is open — any dialog mounting its own Esc handling must win.
      if (confirmDisconnect || showSettings) return;
      // Any open layer owns this Escape — including non-dialog popovers
      // (role=menu/listbox). Missing them here opened the destructive
      // disconnect sheet while a user was merely dismissing a menu.
      if (document.querySelector('[role="dialog"], [aria-modal="true"], [role="menu"], [role="listbox"]')) return;
      setConfirmDisconnect(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelMode, confirmDisconnect, showSettings]);

  // Synchronous double-submit guard: the 6th-digit auto-submit and a user
  // pressing Enter can both fire before the isJoining state re-render lands.
  // Two joins = the server sees a churn of leave/join events (the "connection
  // flickers" real-world symptom), so the ref closes that same-tick window.
  const joiningRef = useRef(false);
  const handleCodeComplete = useCallback(async (code: string) => {
    if (joiningRef.current) return;
    if (isJoining) return;
    joiningRef.current = true;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await joinWithCode(code);
      setIsJoining(false);
      if (!res.success) {
        setJoinError(res.error || t('err.codeInactive'));
      } else {
        // The code was accepted — leave the code-entry screen behind and
        // show the connecting overlay until the channel actually opens.
        setPanelMode('connecting');
      }
    } catch (e: unknown) {
      setIsJoining(false);
      // Same honest classification as the Send path: no more generic
      // "check your internet" for what might be a dead service.
      setJoinError(friendlyConnectError(e).text);
    } finally {
      joiningRef.current = false;
    }
  }, [isJoining, joinWithCode, t, friendlyConnectError]);

  const handleDisconnect = useCallback(() => { setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); }, [abandonSession]);
  const handleCancel = useCallback(() => {
    createAbortRef.current++;
    setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null);
  }, [abandonSession]);
  // Dismiss the connecting overlay. The creator goes back to their pairing
  // screen (the room stays open — the peer can still connect); the joiner
  // abandons and can enter a fresh code.
  const dismissConnecting = useCallback(() => {
    if (session.isCreator) { creatorLeftConnectingRef.current = true; setPanelMode('sending'); return; }
    createAbortRef.current++;
    setPanelMode('idle'); abandonSession(); setJoinError(null);
  }, [session.isCreator, abandonSession]);

  /* --- derived --- */
  const shareUrl = session.roomId ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}` : '';
  const qrCode = session.secret ? generateTOTP(session.secret, session.createdAt) : '';
  const qrValue = qrCode ? `${shareUrl}?c=${qrCode}` : '';
  // shareUrl changes when the room is created; copyLink may be invoked from
  // a callback that captured an earlier render (fallback chip after
  // createSession). The ref keeps every caller honest.
  const shareUrlRef = useRef('');
  shareUrlRef.current = shareUrl;
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrlRef.current); } catch {} setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
  // "Share link" fallback chip: reuse the live room if one exists, otherwise
  // create it, then copy — the link chip must never silently do nothing.

  const copyCode = async () => { const c = session.secret ? generateTOTP(session.secret, session.createdAt) : ''; try { await navigator.clipboard.writeText(c); } catch {} setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };
  const handleQRScan = useCallback((text: string) => {
    try {
      const url = new URL(text);
      const code = url.searchParams.get('c');
      if (code) { setShowQRScan(false); handleCodeComplete(code); }
      else if (/^\d{6}$/.test(text.trim())) { setShowQRScan(false); handleCodeComplete(text.trim()); }
    } catch {
      if (/^\d{6}$/.test(text.trim())) { setShowQRScan(false); handleCodeComplete(text.trim()); }
    }
  }, [handleCodeComplete]);
  const shareLink = async () => { if (navigator.share) { try { await navigator.share({ title: 'ShareTexts', url: shareUrl }); return; } catch {} } await copyLink(); };

  /* ---------------------------------------------------------------- */
  /*  LEFT / TOP PANEL                                                */
  /* ---------------------------------------------------------------- */
  const isMobileDevice = useIsMobileDevice();
  // Which device am I? The connected state shows two physical devices, so the
  // "this device" tile must match reality — a phone on phones, a screen on
  // desktops — instead of always drawing a phone.
  const ThisDeviceIcon = isMobileDevice ? Smartphone : Monitor;
  const PartnerDeviceIcon = isMobileDevice ? Monitor : Smartphone;
  // No ambient blobs: colored blur washes were template decor. The paper
  // canvas and the tile composition carry the screen now — quiet is the
  // luxury.
  const ambientGlow = null;
  const headerNode = (
    <header className="shrink-0 flex items-center justify-between px-6 lg:px-10 py-4">
        {/* Brand lockup — ONE svg (two responsive copies would put the shared
            gradient defs inside the display:none copy, which browsers refuse
            to paint — the desktop mark vanished). CSS overrides the intrinsic
            size for the responsive step. gap-[7px] reads optically even —
            the mark's right side carries more air than its left, so one px
            tighter than a plain 8 balances the pair; baseline-nudged name
            aligns the wordmark's x-height with the mark's optical center. */}
        <a href="/" className="group flex items-center gap-[7px] shrink-0 min-h-[40px] -my-2" aria-label="ShareTexts — home">
          {/* The mark gets a whisper of scale on hover (transform only, no
              layout shift) — the brand invites you in without shouting. */}
          <span className="transition-transform duration-200 ease-out group-hover:scale-105 group-active:scale-95 motion-reduce:transition-none flex">
            <ShareTextsLogo size={30} className="w-7 sm:w-[30px] h-auto" />
          </span>
          <span className="font-semibold tracking-tight text-[19px] sm:text-[21px] text-apple-ink dark:text-white translate-y-px">ShareTexts</span>
        </a>
        {/* One rhythm for every header control — desktop AND mobile. Each
            item is a 40px-tall slot on a tight gap grid; icons are uniform
            18px. Docs and language sit closest (one shared cluster), the
            theme toggle breathes a little after them. */}
        <div className="flex items-center gap-1">
          <CommandBarChip onClick={() => { productEvent('product.diagnostics_opened'); setCmdOpen(true); }} />
          <LanguageMenu />
          {/* Docs sits BETWEEN the language and theme toggles (user request) —
              same 40px slot, same quiet icon style as its neighbors; the
              footer link stays too. */}
          <a
            href="/docs"
            aria-label="Docs"
            title="Docs"
            className="flex items-center justify-center w-11 h-10 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-95 transition-all"
          >
            <BookOpen className="w-[18px] h-[18px]" aria-hidden />
          </a>
          <ThemeToggle />
        </div>
    </header>
  );

  const heroContent = (
    <AnimatePresence mode="sync">
          {/* ── IDLE ──────────────────────────────────────────────── */}
          {panelMode === 'idle' && (
            // Deterministic first paint: the hero renders visible immediately;
            // only the swap-out fades. Never gate first paint on animation.
            <motion.div key="idle" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="w-full max-w-md mx-auto flex flex-col">
              {/* Flex + order: H1 → subtitle → live tracker → actions. The
                  tracker is passive status, so it lives ABOVE the action
                  cluster — status never interrupts the Send/Receive flow
                  (usability audit #6). */}
              <h1 className="st-display order-1 text-[34px] sm:text-[42px] lg:text-[52px] text-apple-ink dark:text-white text-center sm:text-left">
                {(() => { const [a, b] = t('home.title').split('\n'); return (<>{a}{b ? <><br />{b}</> : null}</>); })()}
              </h1>
              {/* whitespace-pre-line honors the subtitle's deliberate line
                  break ("No app. No account. No cable." / "Just open …"). */}
              <p className="order-2 mt-3.5 text-[16.5px] sm:text-[18px] lg:text-[19px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[40ch] text-center sm:text-left whitespace-pre-line">
                {t('home.subtitle')}
              </p>
              {/* Live activity tracker — bare (NO pill): a breathing dot, the
                  lifetime count, and the label. Honest, local, floored at the
                  pre-telemetry era count. QUIET by rank: it is metadata, so
                  it whispers — the Send/Receive pair owns this screen. */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="order-2 mt-3 flex items-center justify-center lg:justify-start gap-2 whitespace-nowrap w-fit mx-auto lg:mx-0"
              >
                {/* Halo dot: two slow radar rings drift outward from a solid
                    glowing core — layered, staggered, so it reads as breath,
                    not alarm. Halts under prefers-reduced-motion. */}
                <span className="relative flex items-center justify-center w-3.5 h-3.5 shrink-0" aria-hidden>
                  <span className="st-halo-ring absolute inset-0 rounded-full bg-status-success/40" />
                  <span className="st-halo-ring st-halo-lag absolute inset-0 rounded-full bg-status-success/25" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-status-success shadow-[0_0_6px_rgba(52,199,89,0.7)]" />
                </span>
                {nearbyStatus
                  ? <span className="text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 leading-none">{nearbyStatus}</span>
                  : <>
                    <span className="text-[16px] font-bold text-apple-ink/90 dark:text-white/90 tnum leading-none">{Math.max(roomsCreated ?? 0, 113).toLocaleString()}</span>
                    <span className="text-[13.5px] font-medium text-apple-ink-muted/85 dark:text-white/50 leading-none">{t('home.roomsMade')}</span>
                  </>}
              </motion.div>
              {/* Equal-width grid: the two primary actions share ONE geometry
                  (audit #12 — Receive rendered wider than Send), and each
                  hint sits directly beneath its own button so the
                  label↔action mapping is unambiguous (audit #11). */}
              <div className="order-3 mt-6 grid grid-cols-2 gap-x-3 gap-y-1 max-w-[360px] mx-auto sm:mx-0">
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <TactileButton onClick={handleSend} variant="primary" size="lg" className="w-full lg:text-[16px] lg:min-h-[56px]" icon={<SendCircleIcon size={18} />} disabled={isCreating}>{t('home.send')}</TactileButton>
                  <span className="text-[12.5px] font-medium text-apple-ink-muted/70 dark:text-white/45">{t('home.sendHint')}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 min-w-0">
                  <TactileButton onClick={handleReceive} variant="soft" size="lg" className="w-full lg:text-[16px] lg:min-h-[56px]" icon={<ReceiveCircleIcon size={18} />}>{t('home.receive')}</TactileButton>
                  <span className="text-[12.5px] font-medium text-apple-ink-muted/70 dark:text-white/45">{t('home.receiveHint')}</span>
                </div>
              </div>
              {/* Stay Connected re-entry: the room this device promised to
                  keep alive is one tap away — history included. Only shown
                  when idle AND not currently seated elsewhere. */}
              <AnimatePresence>
                {(() => {
                  const stay = session.lastStayRoom;
                  if (!stay || stayGone) return null;
                  // The card earns trust by showing real, local facts: who
                  // this room was with, how much history it holds, and when
                  // it was last used. Nothing here is fabricated.
                  const facts: string[] = [];
                  if (stay.partnerName) facts.push(stay.partnerName);
                  if (typeof stay.messageCount === 'number' && stay.messageCount > 0) {
                    facts.push(t('stay.rejoinMsgs', { n: stay.messageCount.toLocaleString() }));
                  }
                  if (typeof stay.lastActiveAt === 'number') {
                    const d = new Date(stay.lastActiveAt);
                    const today = new Date();
                    const isToday = d.toDateString() === today.toDateString();
                    const isYesterday = new Date(today.getTime() - 86_400_000).toDateString() === d.toDateString();
                    facts.push(isToday ? t('time.today')
                      : isYesterday ? t('time.yesterday')
                      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                  }
                  return (
                    <motion.div
                      key="stay-rejoin"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
                      className="order-4 mt-5 w-full"
                    >
                      <button
                        type="button"
                        data-testid="stay-rejoin"
                        onClick={handleStayRejoin}
                        disabled={isRejoining}
                        className="group w-full flex items-center gap-3.5 pl-3.5 pr-3 py-3 rounded-[16px] bg-white dark:bg-[#232329] border border-apple-divider dark:border-[#2c2c33] shadow-sm hover:shadow-card hover:border-[#f06413]/35 dark:hover:border-[#fb9243]/40 active:scale-[0.985] transition-all duration-200 text-left disabled:opacity-60"
                      >
                        <span className="relative shrink-0 w-9 h-9 rounded-full bg-[#f06413]/10 dark:bg-[#fb9243]/15 flex items-center justify-center text-[#f06413] dark:text-[#fb9243]" aria-hidden>
                          {/* Live pulse: this room is still breathing upstream. */}
                          <span className="absolute inset-0 rounded-full bg-[#f06413]/20 dark:bg-[#fb9243]/20 st-halo-ring motion-reduce:animate-none" />
                          <InfinityIcon className="relative w-4 h-4" strokeWidth={2} />
                        </span>
                        <span className="flex-1 flex flex-col min-w-0 gap-0.5 leading-tight">
                          <span className="text-[13px] font-semibold text-apple-ink dark:text-white">
                            {isRejoining ? t('stay.rejoining') : t('stay.rejoinTitle')}
                          </span>
                          {facts.length > 0 ? (
                            <span className="flex items-center gap-1.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/45 min-w-0">
                              {facts.map((f, i) => (
                                <span key={i} className="flex items-center gap-1.5 min-w-0">
                                  {i > 0 && <span className="opacity-50" aria-hidden>·</span>}
                                  <span className="truncate">{f}</span>
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/45 truncate">
                              {t('stay.rejoinHint')}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 w-7 h-7 rounded-full bg-apple-ink/[0.05] dark:bg-white/[0.07] flex items-center justify-center transition-colors duration-200 group-hover:bg-[#f06413]/12 dark:group-hover:bg-[#fb9243]/18" aria-hidden>
                          <ArrowRightLeft className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50 group-hover:text-[#f06413] dark:group-hover:text-[#fb9243] transition-transform duration-200 group-hover:translate-x-px motion-reduce:transition-none" />
                        </span>
                      </button>
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
              {/* Temporary Space (F14) — SECONDARY utility, deliberately quiet:
                  one row after the rejoin card, never overpowering
                  Send/Receive or Nearby (§1). Reuses the rejoin card's
                  geometry so it reads as part of the same family. */}
              <div className="order-4 mt-2.5 w-full flex flex-col gap-2" data-testid="space-entry">
                {recent.length > 0 && recent.map(r => (
                  <button
                    key={r.spaceId}
                    type="button"
                    onClick={() => { window.location.href = `/space/${r.spaceId}`; }}
                    className="group w-full flex items-center gap-3 pl-3.5 pr-3 py-2.5 min-h-[44px] rounded-[14px] bg-white/[0.55] dark:bg-white/[0.04] border border-apple-divider/70 dark:border-white/[0.08] hover:border-apple-ink/25 dark:hover:border-white/25 transition-colors text-left"
                  >
                    <Clock3 className="shrink-0 w-4 h-4 text-apple-ink-muted dark:text-white/50" aria-hidden />
                    <span className="flex-1 min-w-0 flex items-center gap-2 text-[13px]">
                      <span className="font-medium text-apple-ink dark:text-white/85 truncate">{r.name}</span>
                      <span className="shrink-0 text-[12px] font-medium tabular-nums text-apple-ink-muted/80 dark:text-white/40">
                        {t('space.closesIn', { time: remainingShortOf(r.expiresAt - Date.now()) })}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold text-azure-600 dark:text-azure-400">{t('space.reopen')}</span>
                  </button>
                ))}
                <div className="flex items-center justify-center gap-5 sm:gap-6">
                  <button
                    type="button"
                    onClick={() => setSpaceSheet('create')}
                    className="inline-flex items-center gap-2 text-[13.5px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors min-h-[44px]"
                    data-testid="space-create-entry"
                  >
                    <Clock3 className="w-4 h-4" aria-hidden />
                    {t('space.entryTitle')}
                    <span className="hidden sm:inline text-apple-ink-muted/50 dark:text-white/30">· {t('space.entryHint')}</span>
                  </button>
                  <span className="w-px h-4 bg-apple-divider dark:bg-white/10" aria-hidden />
                  <button
                    type="button"
                    onClick={() => setSpaceSheet('join')}
                    className="inline-flex items-center gap-2 text-[13.5px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors min-h-[44px]"
                    data-testid="space-join-entry"
                  >
                    <Link2 className="w-4 h-4" aria-hidden />
                    {t('space.joinTitle')}
                  </button>
                </div>
              </div>
              {/* Three-glyph teaching strip — mobile only (desktop's right
                  pane already carries the numbered steps). Duolingo's
                  "you always know what's next" in three glyphs and the
                  app's own step copy, which all 9 locales already ship.
                  Pure typography + existing icons; no illustration, no
                  card — it teaches, it doesn't decorate. */}
              <div className="order-4 lg:hidden mt-5 mb-1 w-full max-w-[360px] mx-auto" aria-hidden>
                <div className="flex items-center justify-center gap-2">
                  {[ThisDeviceIcon, ArrowRightLeft, PartnerDeviceIcon].map((Glyph, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="w-4 h-px bg-apple-divider dark:bg-white/15" />}
                      <span className="flex items-center justify-center w-8 h-8 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/50">
                        <Glyph className="w-4 h-4" strokeWidth={2} />
                      </span>
                    </React.Fragment>
                  ))}
                  <span className="w-4 h-px bg-apple-divider dark:bg-white/15" />
                  <span className="text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45 whitespace-nowrap">
                    {t('home.journey')}
                  </span>
                </div>
              </div>
              {/* The product, as it actually looks — laptop + phone running
                  the real connected UI. Scales itself; breaks out of the
                  hero column to use the full half-pane width. Desktop shows
                  the same scene in the room pane, so hide it here. */}
              {/* Mobile: sized to sit INSIDE the column borders — slightly
                  narrower than the text above so nothing touches the edges.
                  order-5 keeps it last inside this ordered flex column. The
                  bottom margin (not the old negative one) keeps clear air
                  between the image and the "Open ShareTexts in another
                  device" row that follows. */}
              <div className="order-5 lg:hidden mt-4 sm:mt-8 mb-5 flex justify-center">
                <div className="w-full max-w-[340px] px-1">
                  <HeroTransferScene />
                </div>
              </div>
              {/* Nearby device discovery — an OPTIONAL extra path. The old
                  standalone hint line is gone: the nearby block's own
                  searching row says "Looking for nearby devices…" in the
                  same words, right where the action is. One instruction on
                  screen, never two. */}
              {/* On mobile the hero image already carries mb-5 before this
                  row — a second mt-10 stacked on top read as a dead gap.
                  mt-2 keeps one breath of air, nothing more. */}
              <div className="order-6 mt-8 w-full flex flex-col items-center lg:items-start">
                <div className="w-full max-w-md lg:max-w-none">
                  <NearbyDevices onStatus={setNearbyStatus} />
                </div>
              </div>
              {createError && (
                <motion.div
                  role="alert"
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  className="mt-4 p-3.5 rounded-[14px] bg-status-danger/[0.07] dark:bg-status-danger/10 border border-status-danger/20 flex items-start gap-3"
                >
                  <span className="shrink-0 w-8 h-8 rounded-full bg-status-danger/15 flex items-center justify-center">
                    {createError.icon === 'offline' ? <WifiOff className="w-4 h-4 text-status-danger" />
                      : createError.icon === 'server' ? <ServerOff className="w-4 h-4 text-status-danger" />
                      : createError.icon === 'time' ? <Info className="w-4 h-4 text-status-danger" />
                      : <Info className="w-4 h-4 text-status-danger" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-status-danger leading-relaxed">{createError.text}</p>
                    <button onClick={handleSend} className="mt-2 px-4 py-1.5 min-h-[36px] rounded-full text-[13px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors active:scale-95">{t('home.retry')}</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── SENDING: pair the other device ────────────────────── */}
          {panelMode === 'sending' && (
            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md w-full mx-auto overflow-hidden">
              {/* Back arrow leads the title — iOS navigation pattern. */}
              <div className="flex items-center gap-1 mb-4">
                <button onClick={handleCancel} aria-label={t('cancel')} className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('create.title')}</h2>
              </div>
              {isCreating && !session.secret ? (
                <div className="flex flex-col items-center py-8">
                  <ShareTextsLogo size={20} motion="connecting" />
                  <p className="text-[14px] font-medium text-apple-ink-muted dark:text-white/50">{t('create.creating')}</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('create.hint')}</p>
                  {/* The pairing screen keeps ONE two-device scene for its
                      whole life: the same tiles the user will see in the
                      room. Before a peer arrives it quietly searches; the
                      moment the peer joins it starts the handshake — no
                      component swap, no context switch — and when the
                      channel opens it draws the link and check. The code
                      stays below as the tool, never the story. */}
                  <AnimatePresence mode="wait" initial={false}>
                    {session.partnerConnecting && !session.partnerConnected ? (
                      <motion.div key="handshake" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: EASE }} className="py-3">
                        <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} partnerName={session.partnerName} />
                      </motion.div>
                    ) : (
                      <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {/* Searching state — the pair visual holds the screen
                            (spatial continuity with the room that follows);
                            the copy says the one true thing. */}
                        {!session.partnerConnecting && (
                          <div className="mb-4">
                            <ConnectHandshake phase="searching" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                          </div>
                        )}
                        {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} onRefresh={refreshCode} />}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {!session.partnerConnecting && (
                      <motion.div key="pairing-actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-5 space-y-2">
                    {/* The tactile system, propagated: Show QR is the screen's
                        primary (scanning is the fastest pairing path on any
                        phone), so it carries the keycap depth; the two copy
                        tools sit on the paper secondary tile. One anatomy
                        across home and pairing — the app feels like one app. */}
                    <TactileButton onClick={() => setShowQROverlay(true)} variant="primary" size="md" className="w-full" icon={<QrCode className="w-4 h-4" />} data-testid="show-qr">
                      {t('create.showQr')}
                    </TactileButton>
                    <TactileButton onClick={shareLink} variant="secondary" size="md" className="w-full" icon={copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}>
                      {copiedLink ? t('create.copied') : t('create.shareLink')}
                    </TactileButton>
                    <TactileButton onClick={copyCode} variant="secondary" size="md" className="w-full" icon={copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}>
                      {copiedCode ? t('create.codeCopied') : t('create.copyCode')}
                    </TactileButton>
                      </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          )}

          {/* ── RECEIVING: enter code ────────────────────────────── */}
          {panelMode === 'receiving' && (
            <motion.div key="receiving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto">
              <div className="flex items-center gap-1 mb-4">
                <button onClick={handleCancel} aria-label={t('cancel')} className="flex items-center justify-center min-w-[40px] min-h-[40px] -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:scale-95 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('receive.title')}</h2>
              </div>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('receive.hint')}</p>
              {/* While the code verifies, the entry UI steps aside for the
                  handshake — the same scene the creator sees, so both devices
                  tell one story. */}
              <AnimatePresence mode="wait" initial={false}>
                {isJoining ? (
                  <motion.div key="joining-handshake" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: EASE }} className="py-3">
                    <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                  </motion.div>
                ) : (
                  <motion.div key="code-entry" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                    <div className="p-6 bg-white dark:bg-[#1a1a1e] border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                      <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} />
                    </div>
                    <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">{t('receive.note')}</p>
                    {/* Scan QR — the alternative path, parked at the BOTTOM
                        of the code screen: type first, scan as fallback. */}
                    <button onClick={() => setShowQRScan(true)} className="mt-5 w-full flex items-center justify-center gap-2 px-5 py-3 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[14px] font-semibold text-apple-ink dark:text-white min-h-[48px] transition-colors active:scale-[0.97]">
                      <QrCode className="w-4 h-4 text-apple-ink-muted dark:text-white/60" /> {t('receive.scan')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── CONNECTING: code accepted, channel opening ────────── */}
          {panelMode === 'connecting' && (
            <motion.div key="connecting" data-testid="connecting-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto text-center">
              <div className="flex flex-col items-center py-6">
                {/* The handshake IS the connecting screen — and the first
                    beat of it is watched here on the joiner side, including
                    the moment the tiles settle into the room's own pair
                    visual (same tiles, same gap, same story). */}
                <ConnectHandshake
                  phase={session.partnerConnected ? 'connected' : 'connecting'}
                  localIcon={isMobileDevice ? 'phone' : 'monitor'}
                  partnerName={session.partnerName}
                />
                {/* Honest escalation, never an infinite spinner: at 15s the
                    link is slow (say so + offer retry); at 40s the other
                    device most likely left (say THAT, and hand back cleanly).
                    Psychology: uncertainty is the pain — naming the likely
                    cause with an action beats a spinner that outlives hope. */}
                {stuckConnecting ? (
                  <div className="mt-5 flex flex-col items-center gap-3">
                    <p className="text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 max-w-[280px] leading-relaxed">
                      {longStuckConnecting ? t('connect.stuckLong') : t('connect.stuck')}
                    </p>
                    {!longStuckConnecting && session.isCreator && (
                      <button
                        onClick={handleStuckRetry}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 rounded-full text-[13px] font-semibold text-apple-ink dark:text-white min-h-[40px] active:scale-[0.97] transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> {t('common.tryAgain')}
                      </button>
                    )}
                  </div>
                ) : null}
                {/* Escape hatch: the creator returns to their pairing screen
                    (the room stays open); the joiner abandons and can enter a
                    fresh code. Never a trap. */}
                <button onClick={dismissConnecting} className="mt-6 flex items-center gap-1 text-[13px] font-semibold text-status-danger hover:bg-status-danger/10 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors">
                  <X className="w-3.5 h-3.5" /> {t('cancel')}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── CONNECTED: device pair + ready to transfer ───────── */}
          {panelMode === 'connected' && !celebrateConnected && (
            <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }} className="max-w-md 2xl:max-w-lg mx-auto my-auto">
              {/* Desktop connected rail — decluttered. The room header already
                  carries identity (this ⇄ partner + live status) and the room
                  itself is the product; this rail keeps only what the header
                  can't say: your device's NAME (editable), the live session
                  stats, and the room controls. Everything else — the big tile
                  trio, the "ready to transfer" pitch, the lifetime strip, the
                  status pill — repeated the header or the stats card and
                  competed for attention. One column, one voice, room to
                  breathe. */}
              {/* Your device: name row (tap to rename) — the only identity
                  element here; the pair visual lives in the room header. */}
              <div className="flex items-center gap-2.5 mb-5">
                <span className="flex items-center justify-center w-9 h-9 rounded-[11px] bg-[#f06413]/10 dark:bg-[#fb9243]/10 border border-[#f06413]/15 dark:border-[#fb9243]/15 shrink-0" aria-hidden>
                  <ThisDeviceIcon className="w-4.5 h-4.5 text-[#f06413] dark:text-[#fb9243]" />
                </span>
                {editingName ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={e => setDraftName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      else if (e.key === 'Escape') { setDraftName(session.deviceName); setEditingName(false); }
                    }}
                    aria-label={t('pair.renameField')}
                    maxLength={32}
                    className="min-w-0 flex-1 text-[14px] font-semibold text-apple-ink dark:text-white bg-transparent border-b border-[#f06413]/50 dark:border-[#fb9243]/50 outline-none px-0.5 py-1"
                  />
                ) : (
                  <button
                    onClick={startEditName}
                    title={t('pair.renameTitle')}
                    aria-label={t('pair.renameAria', { name: session.deviceName })}
                    className="group min-w-0 flex-1 min-h-[44px] flex items-center gap-1.5 text-left text-[14px] font-semibold text-apple-ink dark:text-white hover:text-apple-ink dark:hover:text-white transition-colors"
                  >
                    <span className="truncate">{session.deviceName}</span>
                    <Pencil className="w-3 h-3 shrink-0 text-apple-ink-muted/50 dark:text-white/35 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>

              {/* One-time notice when the auto-disambiguation renamed us. */}
                {session.nameAutoAdjusted && !dismissedNameNotice && (
                  <div role="status" className="w-full sm:max-w-[340px] flex items-start gap-2 px-3 py-2 rounded-[12px] bg-[#f06413]/8 dark:bg-[#fb9243]/10 border border-[#f06413]/15 dark:border-[#fb9243]/15 text-[12px] text-apple-ink-muted dark:text-white/60 leading-snug">
                    <Info className="w-3.5 h-3.5 text-[#f06413] dark:text-[#fb9243] shrink-0 mt-px" />
                    <span className="flex-1">
                      {(() => { const parts = t('pair.autoRename', { name: '\u0000' }).split('\u0000'); return (<>{parts[0]}<span className="font-semibold text-apple-ink dark:text-white">{session.deviceName}</span>{parts[1]}</>); })()}
                    </span>
                    <button onClick={() => setDismissedNameNotice(true)} aria-label={t('pair.dismiss')} className="shrink-0 min-w-[40px] min-h-[40px] -m-[12px] flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

              {/* Live session stats — the left pane earns its place by
                  reporting the room it's hosting: real counts, not copy.
                  De-boxed: figures + hairlines, no border chrome — the
                  numbers are the object, not their container. */}
              {(() => {
                const msgs = session.messages;
                const fileCount = msgs.filter(m => m.attachment && m.attachment.status === 'complete').length;
                const bytes = msgs.reduce((n, m) => n + (m.attachment?.status === 'complete' ? (m.attachment.size ?? 0) : 0), 0);
                const stat = (label: string, value: string) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1 py-1">
                    <span className="text-[16px] font-bold text-apple-ink dark:text-white tnum leading-none">{value}</span>
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-apple-ink-muted/85 dark:text-white/40 leading-none">{label}</span>
                  </div>
                );
                return (
                  <div className="mb-4 px-1 flex items-stretch">
                    {stat(msgs.length === 1 ? t('conn.stats.message') : t('conn.stats.messages'), String(msgs.length))}
                    <span className="w-px bg-apple-divider/70 dark:bg-white/[0.09]" aria-hidden />
                    {stat(fileCount === 1 ? t('conn.stats.file') : t('conn.stats.files'), String(fileCount))}
                    <span className="w-px bg-apple-divider/70 dark:bg-white/[0.09]" aria-hidden />
                    {stat(t('conn.stats.data'), bytes > 0 ? formatBytes(bytes) : '0')}
                  </div>
                );
              })()}

              {/* Room controls — one grouped card, the rail's only action
                  surface. Stay Connected and Copy join link are equal-weight
                  room settings; Disconnect is the single destructive action,
                  separated at the bottom so it can't be tapped by accident.
                  The connection-type pill died in this pass: the room header
                  already shows live link state, and the rail doesn't need a
                  second voice saying it. */}
              <div className="rounded-[16px] border border-apple-divider/50 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.04] overflow-hidden">
                <StayConnectedToggle className="rounded-none" />
                <div className="h-px bg-apple-divider/50 dark:bg-white/[0.07]" aria-hidden />
                <button
                  type="button"
                  onClick={copyLink}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className="flex flex-col min-w-0">
                    <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{copiedLink ? t('conn.inviteCopied') : t('conn.invite')}</span>
                    <span className="text-[11.5px] text-apple-ink-muted dark:text-white/45 truncate">{t('conn.inviteHint')}</span>
                  </span>
                  <Link2 className="w-4 h-4 shrink-0 text-apple-ink-muted dark:text-white/50" />
                </button>
                <div className="h-px bg-apple-divider/50 dark:bg-white/[0.07]" aria-hidden />
                <button
                  type="button"
                  data-testid="end-session"
                  onClick={() => setConfirmDisconnect(true)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-status-danger/85 hover:text-status-danger hover:bg-status-danger/[0.06] active:scale-[0.99] transition-colors text-left"
                >
                  <DisconnectGlyph size={16} />
                  {t('common.disconnect')}
                </button>
              </div>
            </motion.div>
          )}
          {/* ── CONNECTED: the payoff beat — the handshake the user just
              watched completes, visibly, before the room takes over. Same
              scene, same tiles: the relationship finishes, THEN the
              workspace arrives. Reduced-motion users skip the wait (the
              beat is a reveal, not information). */}
          {panelMode === 'connected' && celebrateConnected && (
            <motion.div
              key="connected-celebrate"
              data-testid="connected-celebration"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="max-w-md mx-auto text-center"
            >
              <div className="flex flex-col items-center py-6">
                <ConnectHandshake
                  phase="connected"
                  localIcon={isMobileDevice ? 'phone' : 'monitor'}
                  partnerName={session.partnerName}
                />
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.3, ease: EASE }}
                  className="mt-3 text-[13px] font-medium text-apple-ink-muted dark:text-white/50"
                >
                  {t('conn.ready')}
                </motion.p>
              </div>
            </motion.div>
          )}
    </AnimatePresence>
  );

  const footerNode = (
    <footer className="shrink-0 px-6 lg:px-10 pt-3 pb-[max(env(safe-area-inset-bottom),8px)] sm:pb-3 border-t border-apple-divider/60 dark:border-white/[0.06]">
        {/* One line: links with real gaps, the X mark at the right. Links
            sit at muted weight (navigation, not shouting) and step up to
            full ink on hover — quieter than the old always-bold row, and
            the hover answer makes the affordance obvious. */}
        {/* Same measure as the hero column above — footer nav shares the
            content's left edge instead of drifting to the pane edge. */}
        <div className="max-w-md mx-auto flex items-center justify-between gap-x-5 gap-y-2 flex-wrap">
          <nav className="flex items-center gap-5 sm:gap-7 text-[13px] font-medium text-apple-ink-muted dark:text-white/50">
            {/* Each link gets a 40px hit box via symmetric padding + matching
                negative margin — the visible rhythm is unchanged but the
                touch target meets the app's 40px contract on phones. */}
            <a href="/docs" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.docs')}</a>
            <a href="/about" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.about')}</a>
            <a href="/privacy" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.privacy')}</a>
            <a href="/terms" className="inline-flex items-center justify-center min-h-[40px] min-w-[40px] -my-2.5 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.terms')}</a>
          </nav>
          {/* X (Twitter) — glyph + handle on ≥sm so an isolated ✕ at the
              pane's corner can't be misread as a dismiss control; the
              anchor chip framing (pill border) says "external link". */}
          <a
            href="https://x.com/0xalyt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('footer.followAria')}
            title="x.com/0xalyt"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[44px] -my-2.5 px-2.5 rounded-full border border-apple-divider/60 dark:border-white/[0.08] text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/25 transition-colors"
          >
            <svg className="w-[15px] h-[15px] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            <span className="hidden sm:inline text-[12.5px] font-semibold">x.com/0xalyt</span>
          </a>
        </div>
    </footer>
  );

  const leftPanel = (
    <div
      // Drop-to-send lives on the whole idle home pane: release anywhere.
      onDragEnter={panelMode === 'idle' ? onHomeDragEnter : undefined}
      onDragOver={panelMode === 'idle' ? onHomeDragOver : undefined}
      onDragLeave={panelMode === 'idle' ? onHomeDragLeave : undefined}
      onDrop={panelMode === 'idle' ? onHomeDrop : undefined}
      className="relative isolate flex flex-col h-full overflow-hidden bg-apple-canvas dark:bg-[#131315]"
    >
      {ambientGlow}
      {/* Soft top ambience — a wide, low-alpha ember/violet breath that keeps
          the canvas from reading as flat, in both themes. Decorative. */}
      <div aria-hidden className="st-ambient" />
      {/* Drop-to-send veil — the pane answers the drag immediately, so the
          user knows releasing HERE is the action. pointer-events-none keeps
          dragleave/drop flowing to the pane beneath. */}
      <AnimatePresence>
        {homeDrop && panelMode === 'idle' && (
          <motion.div
            key="home-drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-apple-canvas/85 dark:bg-[#131315]/85 backdrop-blur-[2px]"
          >
            <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-[28px] border-2 border-dashed border-[#f06413]/50 dark:border-[#fb9243]/50">
              <Upload className="w-8 h-8 text-[#f06413] dark:text-[#fb9243]" />
              <p className="text-[17px] font-semibold text-apple-ink dark:text-white">{t('drop.send')}</p>
              <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50">{t('drop.hint')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {headerNode}
      {/* Hero area — the H1 lives INSIDE the hero column (restored): one
          source of truth for the headline on desktop and mobile, sitting in
          the same max-w-md column as the subtitle and actions. */}
      <div className="flex-1 flex flex-col px-6 lg:px-10 pt-3 sm:pt-6 lg:pt-12 pb-6 min-h-0 overflow-y-auto overscroll-contain room-scroll">
        {/* Vertically center the connected rail in the pane's real height —
            the column is shorter than the viewport on desktop, and top-
            anchoring it left a dead zone below. Idle/pairing content is
            tall enough to top-anchor; only the room rail benefits. */}
        <div className={panelMode === 'connected' ? "my-auto w-full" : "w-full"}>
          {heroContent}
        </div>
      </div>
      {footerNode}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RIGHT PANEL — the room (desktop only; mobile mounts ChatView)    */
  /* ---------------------------------------------------------------- */
  const roomPanel = (
    <div
      className={cn(
        "relative flex flex-col h-full min-h-0 overflow-hidden bg-[#f4f2ec] dark:bg-[#0f0f11]",
        /* The animated dot field lives ONLY here: the desktop landing's
           right panel, before a connection exists. Not mobile, not in-room,
           not the pairing/connected states — one quiet stage for the hero. */
        panelMode === 'idle' && "st-dotfield"
      )}
      data-testid="room-panel"
    >
      {panelMode === 'idle' && <div aria-hidden className="st-ambient" />}
      {/* Room header — the pair IS the identity, so the header leads with
          the two real devices (this ⇄ partner + live-status dot) instead of
          a generic wordmark, and the brand stays present at the right
          weight. Disconnect gets a calm two-press confirm, never a modal. */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-[#f4f2ec]/80 dark:bg-[#0f0f11]/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          {panelMode === 'connected' ? (
            <>
              <span className="flex items-center justify-center w-7 h-7 rounded-[9px] bg-ember/10 border border-ember/20 text-ember shrink-0" aria-hidden>
                <ThisDeviceIcon className="w-4 h-4" />
              </span>
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white truncate max-w-[110px]">{session.deviceName}</span>
              <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-apple-ink-muted/50 dark:text-white/30" />
              <span className={cn(
                "relative flex items-center justify-center w-7 h-7 rounded-[9px] shrink-0 transition-colors",
                session.connectionType === 'disconnected'
                  ? "bg-black/[0.05] dark:bg-white/[0.06] border border-apple-divider/40 dark:border-white/[0.08] text-apple-ink-muted/50 dark:text-white/30"
                  : session.connectionType === 'connecting'
                    ? "bg-status-warning/10 border border-status-warning/25 text-status-warning"
                    : "bg-status-success/10 border border-status-success/20 text-status-success"
              )}>
                {session.connectionType === 'connecting' && <span aria-hidden className="absolute inset-0 rounded-[9px] bg-status-warning/20 st-halo-ring" />}
                {session.connectionType !== 'disconnected' && session.connectionType !== 'connecting' && <span aria-hidden className="absolute inset-0 rounded-[9px] bg-status-success/20 st-halo-ring" />}
                <PartnerDeviceIcon className="relative w-4 h-4" />
              </span>
              <span className="hidden md:flex flex-col leading-tight min-w-0">
                {/* Room-aware header (F13): a 3+ device room leads with the
                    device COUNT — never "Connected to Windows PC" for a whole
                    room. The two-device room keeps the partner's name. */}
                <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white truncate max-w-[130px]">
                  {(session.peers?.filter(p => !p.isSelf).length ?? 0) > 1
                    ? t('room.deviceCount', { count: String((session.peers?.length ?? 0)) })
                    : (session.partnerName || t('chat.pairedDevice'))}
                </span>
                {(session.peers?.filter(p => !p.isSelf).length ?? 0) > 1 ? (
                  <span data-testid="room-device-count" className="text-[10.5px] font-medium text-apple-ink-muted dark:text-white/45">
                    {(() => {
                      const list = session.peers?.filter(p => !p.isSelf) ?? [];
                      const parts: string[] = [];
                      const ready = list.filter(p => p.link === 'connected').length;
                      const connecting = list.filter(p => p.link === 'connecting' || p.link === 'reconnecting').length;
                      const offline = list.filter(p => p.link === 'offline').length;
                      if (ready) parts.push(t('room.readyCount', { count: String(ready) }));
                      if (connecting) parts.push(t('room.connectingCount', { count: String(connecting) }));
                      if (offline) parts.push(t('room.offlineCount', { count: String(offline) }));
                      // Members with no link yet are still IN the room — the
                      // honest baseline is the roster, never an empty string.
                      const idle = list.length - ready - connecting - offline;
                      if (idle > 0 && parts.length === 0) parts.push(t('room.deviceCount', { count: String(list.length) }));
                      return parts.join(' · ');
                    })()}
                  </span>
                ) : (
                <span className={cn("text-[10.5px] font-medium", session.connectionType === 'disconnected' ? "text-status-warning" : session.connectionType === 'connecting' ? "text-status-warning" : "text-status-success")}>
                  {session.connectionType === 'disconnected'
                    ? t('chat.offline')
                    : session.connectionType === 'connecting'
                      ? t('chat.reconnecting')
                      : session.connectionType === 'direct' || session.connectionType === 'local'
                        ? t('chat.directBadge')
                        : session.connectionType === 'relay'
                          ? t('conn.relay')
                          : t('common.connected')}
                </span>
                )}
              </span>
              <span className="md:hidden w-1.5 h-1.5 rounded-full shrink-0 ml-0.5" aria-hidden>
                <span className={cn("block w-1.5 h-1.5 rounded-full", session.connectionType === 'disconnected' || session.connectionType === 'connecting' ? "bg-status-warning" : "bg-status-success animate-pulse")} />
              </span>
              <StayBadge />
            </>
          ) : (
            <>
              <ShareTextsLogo size={16} />
              {/* Label follows the pane's actual job: the three-step guide
                  while idle, "Room" once a session exists (pairing, connect,
                  live). One header, no mixed messages. */}
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{panelMode === 'idle' ? t('room.idleTitle') : t('room.title')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Leave control only exists when there is a session to leave —
              a permanently-disabled hang-up on the idle pane is noise. */}
          {panelMode === 'connected' && (
            <>
              {/* Settings — same overlay as the mobile room header. The brand
                  glyph that used to sit here repeated the left header's
                  lockup one pane over; the disconnect that sat next to it
                  ALSO existed in the left rail. One screen, one authoritative
                  place for each: brand lives left, disconnect lives in the
                  rail's grouped card (with its confirm), settings here. */}
              <button
                type="button"
                data-testid="open-settings"
                onClick={() => setShowSettings(true)}
                aria-label={t('settings.title')}
                title={t('settings.title')}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full transition-all duration-150 active:scale-95 text-apple-ink-muted/70 dark:text-white/50 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
              >
                <SettingsIcon className="w-[18px] h-[18px]" aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {panelMode === 'connected' ? (
          <Suspense fallback={<SkeletonScreen variant="room" />}>
            {/* Definite-height flex wrapper: keeps ChatView's h-full resolved on
                the desktop two-pane layout (Suspense itself is not a flex item). */}
            <div className="flex-1 min-h-0 flex flex-col">
              <motion.div
                key="room-connected"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE }}
                className="h-full flex flex-col min-h-0"
              >
                <ChatView panelMode="embedded" />
              </motion.div>
            </div>
          </Suspense>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={panelMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="h-full flex flex-col items-center justify-center text-center px-8 flex-1"
            >
              {/* Connecting shows the same handshake scene as the left half —
                  one story on both panes. */}
              {panelMode === 'connecting' ? (
                <div className="mb-4">
                  <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                </div>
              ) : panelMode === 'idle' ? (
                /* Desktop idle: the three steps AND the product scene form
                   ONE centered group — center the combined block, never the
                   steps alone, so nothing ever clips at the fold. On short
                   viewports the scene steps aside and the steps keep center. */
                <div className="w-full max-w-[640px] mx-auto flex flex-col items-center justify-center gap-7 py-6">
                  {/* The three steps — numbered, quiet. Left-aligned text so
                      the rows read like a list, not a poem. */}
                  <div className="w-full max-w-[420px] space-y-3.5">
                    {[t('room.step.1'), t('room.step.2'), t('room.step.3')].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="shrink-0 w-7 h-7 rounded-full bg-ember/[0.1] dark:bg-ember/[0.16] text-ember dark:text-[#fb9243] text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="text-[14px] font-medium text-apple-ink/85 dark:text-white/65 leading-snug">{step}</span>
                      </div>
                    ))}
                  </div>
                  {/* The product itself, beneath the steps in the same
                      centered group. Hidden on short viewports so the group
                      never overflows. */}
                  <div className="w-full max-w-[520px] hidden [@media(min-height:700px)]:block">
                    <HeroTransferScene />
                  </div>
                </div>
              ) : (
                /* sending / receiving: the DESIGNED waiting state. Not a bare
                   sentence floating in a void — the same handshake scene the
                   connect moment uses (one visual story), a truthful status
                   line, and a preview of what lands here the moment the peer
                   arrives (anticipate the next need; empty states carry an
                   action, never dead space). */
                <div className="w-full max-w-[340px] flex flex-col items-center">
                  <div className="mb-5">
                    <ConnectHandshake
                      phase={panelMode === 'receiving' ? 'searching' : 'connecting'}
                      localIcon={isMobileDevice ? 'phone' : 'monitor'}
                      quiet
                    />
                  </div>
                  <p className="text-[15px] font-semibold text-apple-ink dark:text-white mb-1.5">
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('create.creating') : t('room.created'))}
                    {panelMode === 'receiving' && t('room.waiting')}
                  </p>
                  <p className="text-[13px] text-apple-ink-muted/70 dark:text-white/40 max-w-[260px] leading-relaxed mb-6">
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('room.setup') : t('room.sendHint'))}
                    {panelMode === 'receiving' && t('room.receiveHint')}
                  </p>
                  <div
                    aria-hidden
                    className="w-full rounded-[18px] border border-dashed border-black/[0.12] dark:border-white/[0.12] bg-white/[0.55] dark:bg-white/[0.03] p-4 flex flex-col gap-2.5"
                  >
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-apple-ink-muted/60 dark:text-white/30">
                      {t('room.previewTitle')}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[9px] bg-ember/[0.1] dark:bg-ember/[0.16] flex items-center justify-center text-ember shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <div className="st-skeleton bg-black/[0.09] dark:bg-white/10 h-[9px] w-3/4 rounded-full" />
                        <div className="st-skeleton bg-black/[0.09] dark:bg-white/10 h-[9px] w-1/3 rounded-full" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-[9px] bg-ember/[0.1] dark:bg-ember/[0.16] flex items-center justify-center text-ember shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 space-y-1.5">
                        <div className="st-skeleton bg-black/[0.09] dark:bg-white/10 h-[9px] w-1/2 rounded-full" />
                        <div className="st-skeleton bg-black/[0.09] dark:bg-white/10 h-[9px] w-1/4 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="h-dvh lg:h-dvh overflow-hidden bg-apple-canvas dark:bg-[#131315] dot-bg">
      <CommandBar open={cmdOpen} onOpenChange={setCmdOpen} />
      {/* Only the ACTIVE layout is mounted — the other branch stays unmounted
          so components (ChatView, composer, pairing input) exist exactly once
          in the DOM instead of twice with one hidden copy. */}
      {isDesktopLayout ? (
        /* Desktop: two panes. Balanced 50/50 at 1024–1279; from 1280 the
            room gets the wider share (≈44/56) so the active pane never feels
            like an afterthought next to an airy brand half. */
        <div className="flex h-full">
          <div className="w-1/2 xl:w-[44%] h-full overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.06]">{leftPanel}</div>
          <div className="flex-1 h-full min-w-0">{roomPanel}</div>
        </div>
      ) : (
        /* Mobile: exactly ONE section on screen at a time.
            · Idle / pairing: header + hero (centered) + footer.
            · Connected: the transfer room takes over the entire screen — a
              full-bleed ChatView with its own device bar and composer. No
              stacked summary card above the chat, no second scroll surface. */
        panelMode === 'connected' ? (
          <Suspense fallback={<SkeletonScreen variant="room" />}>
            <motion.div
              key="room-fullscreen"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="h-full"
            >
              <ChatView panelMode="standalone" />
            </motion.div>
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto overscroll-contain">
            <div className="flex flex-col min-h-full">
              <div className="relative isolate flex flex-1 flex-col bg-apple-canvas dark:bg-[#131315]">
                {ambientGlow}
                {headerNode}
                {/* TOP-ANCHORED like the desktop pane: justify-center with
                    overflowing content pushes the heading into dead space
                    above (and clips it) — start-anchoring keeps the title
                    right under the header on every phone height. */}
                <div className="flex-1 flex flex-col justify-start px-6 lg:px-10 pt-3 sm:pt-6 pb-6 min-h-0">
                  {heroContent}
                </div>
              </div>
              {footerNode}
            </div>
          </div>
        )
      )}
      {/* QR scan overlay (for receiving) */}
      <AnimatePresence>
        {showQRScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setShowQRScan(false)}>
            <motion.div ref={qrScanTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[360px] bg-white dark:bg-[#1a1a1e] rounded-[24px] p-6 shadow-2xl relative" role="dialog" aria-modal="true" aria-label={t('receive.scan')}>
              <button onClick={() => setShowQRScan(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors z-10" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <kbd aria-hidden="true" className="hidden sm:inline absolute top-5 right-16 px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-white/10 bg-white/60 dark:bg-white/5 text-[10px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
              <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white mb-2">{t('qr.scan.title')}</h3>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 mb-4">{t('qr.scan.body')}</p>
              {/* Skeleton, not a text spinner: the lazy camera chunk loads in
                  under a circle-slash frame on warm caches, but on cold ones
                  the shell holds the scanner's exact place — same height, same
                  radius, one quiet shimmer — instead of a sentence where the
                  viewfinder is about to appear. */}
              <Suspense
                fallback={
                  <div className="w-full h-[280px] rounded-[16px] bg-apple-parchment dark:bg-white/5 overflow-hidden relative" aria-hidden>
                    <span className="st-skeleton absolute inset-0 bg-apple-ink/[0.05] dark:bg-white/[0.05]" />
                  </div>
                }
              >
                <QRScanner onScan={handleQRScan} onErrorFallback={() => { setShowQRScan(false); }} />
              </Suspense>
              <button
                onClick={() => setShowQRScan(false)}
                className="mt-4 text-[13px] font-semibold text-apple-ink-muted hover:text-apple-ink dark:hover:text-white underline-offset-2 hover:underline transition-colors"
              >
                {t('qr.scan.typeCode')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* QR display overlay (for sending) */}
      <AnimatePresence>
        {showQROverlay && session.roomId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-6" onClick={() => setShowQROverlay(false)}>
            <motion.div ref={qrDisplayTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-apple-canvas dark:bg-[#1a1a1e] rounded-[24px] p-6 pt-14 shadow-2xl text-center relative border border-apple-divider/50 dark:border-white/[0.08]" role="dialog" aria-modal="true" aria-label={t('qr.display.title')}>
              {/* pt-14 reserves the top strip for the absolutely-positioned
                  close/Esc controls — instruction text can never run under
                  them again. */}
              <button onClick={() => setShowQROverlay(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <kbd aria-hidden="true" className="hidden sm:inline absolute top-5 right-16 px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-white/10 bg-white/60 dark:bg-white/5 text-[10px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
              <p className="text-[15px] font-semibold text-apple-ink dark:text-white mb-2">{t('qr.display.title')}</p>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">
                {(() => { const parts = t('qr.display.body', { receive: '\u0000' }).split('\u0000'); return (<>{parts[0]}<strong className="text-apple-ink dark:text-white">{t('qr.display.receive')}</strong>{parts[1]}</>); })()}
              </p>
              <div className="bg-white p-4 rounded-[18px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30 relative">
                <QROverlayInner value={qrValue} />
                {/* Scanner-frame corners in ember — the recognized visual
                    grammar for "aim your camera here", quieter than a
                    moving line and it never covers the code. */}
                {['top-1.5 left-1.5 border-t-2 border-l-2 rounded-tl-[8px]', 'top-1.5 right-1.5 border-t-2 border-r-2 rounded-tr-[8px]', 'bottom-1.5 left-1.5 border-b-2 border-l-2 rounded-bl-[8px]', 'bottom-1.5 right-1.5 border-b-2 border-r-2 rounded-br-[8px]'].map(pos => (
                  <span key={pos} aria-hidden className={`absolute w-5 h-5 border-ember ${pos}`} />
                ))}
              </div>
              <button onClick={() => setShowQROverlay(false)} className="w-full py-2.5 min-h-[44px] bg-apple-parchment dark:bg-white/5 hover:bg-apple-divider dark:hover:bg-white/10 rounded-full text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]">{t('qr.close')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Settings — theme, language, stay connected, reconnection. */}
      <SettingsOverlay open={showSettings} onClose={() => setShowSettings(false)} />
      <SpaceCreateSheet open={spaceSheet === 'create'} onClose={() => setSpaceSheet(null)} />
      <SpaceJoinSheet open={spaceSheet === 'join'} onClose={() => setSpaceSheet(null)} />
      {/* Apple-style bottom-sheet confirmation before really ending the session. */}
      <ConfirmSheet
        open={confirmDisconnect}
        title={t('common.disconnect')}
        body={t('end.body')}
        confirmLabel={t('common.disconnect')}
        cancelLabel={t('cancel')}
        onConfirm={() => { setConfirmDisconnect(false); handleDisconnect(); }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */
function QROverlayInner({ value }: { value: string }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => { import('qrcode.react').then(m => setComp(() => m.QRCodeSVG)); }, []);
  // Skeleton, not a sentence: the lazy chunk fills the QR's exact 220px
  // stage (one shimmer) — the same loading language as the scan overlay's
  // viewfinder shell, so both QR surfaces speak identically.
  if (!Comp) return (
    <div className="w-[220px] h-[220px] rounded-[10px] relative overflow-hidden" aria-hidden>
      <span className="st-skeleton absolute inset-0 bg-apple-ink/[0.05]" />
    </div>
  );
  return <Comp value={value} size={220} level="M" />;
}
