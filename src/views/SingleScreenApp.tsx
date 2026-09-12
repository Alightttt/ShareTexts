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
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { SendCircleIcon, ReceiveCircleIcon } from '../components/TransferIcons';
import { TactileButton } from '../components/TactileButton';
import { InlineConfirm } from '../components/InlineConfirm';
import { ConnectHandshake } from '../components/ConnectHandshake';
import { CommandBar, CommandBarChip } from '../components/CommandBar';
import { signalingConfigIssue } from '../lib/socket';
import { ConnectError, describeConnectFailure } from '../lib/errors';
import { HeroTransferScene } from '../components/HeroTransferScene';
import { useI18n } from '../lib/i18n';
import { LanguageMenu } from '../components/LanguageMenu';
import { cn, shortCodeOf, sanitizeDeviceName } from '../lib/utils';
import {
  LogOut, QrCode, Link2, Copy, Check,
  Smartphone, Monitor, X, Wifi, ArrowRightLeft, Info, Pencil, WifiOff, ServerOff
} from 'lucide-react';
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
/*  Device pair illustration — explains the product visually           */
/* ------------------------------------------------------------------ */
function DevicePair({ state }: { state: 'idle' | 'connecting' | 'connected' }) {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const muted = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const accent = isDark ? '#fb9243' : '#f06413';
  const beamColor = state === 'connected' ? accent : muted;
  const deviceColor = state === 'connected'
    ? (isDark ? 'rgba(167,139,250,0.15)' : 'rgba(139,124,246,0.10)')
    : muted;

  return (
    <svg width="120" height="80" viewBox="0 0 120 80" fill="none" className="select-none pointer-events-none">
      {/* Phone (left) */}
      <rect x="8" y="12" width="36" height="56" rx="8" fill={deviceColor} stroke={state === 'connected' ? accent : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')} strokeWidth="1.5" />
      <rect x="14" y="18" width="24" height="38" rx="3" fill={state === 'connected' ? (isDark ? 'rgba(167,139,250,0.08)' : 'rgba(139,124,246,0.06)') : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')} />
      {/* Computer (right) */}
      <rect x="76" y="8" width="36" height="48" rx="6" fill={deviceColor} stroke={state === 'connected' ? accent : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')} strokeWidth="1.5" />
      <rect x="81" y="13" width="26" height="33" rx="2" fill={state === 'connected' ? (isDark ? 'rgba(167,139,250,0.08)' : 'rgba(139,124,246,0.06)') : (isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)')} />
      <rect x="88" y="56" width="12" height="4" rx="1.5" fill={state === 'connected' ? accent : muted} />
      <rect x="82" y="60" width="24" height="2.5" rx="1.25" fill={state === 'connected' ? accent : muted} />
      {/* Connection beam */}
      <line x1="44" y1="40" x2="76" y2="32" stroke={beamColor} strokeWidth="2" strokeDasharray={state === 'connecting' ? '4 3' : 'none'}>
        {state === 'connecting' && (
          <animate attributeName="stroke-dashoffset" from="0" to="-14" dur="1s" repeatCount="indefinite" />
        )}
      </line>
      {/* Packet dot */}
      {state === 'connected' && (
        <circle r="3" fill={accent}>
          <animateMotion dur="1.6s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" path="M 44 40 L 76 32" />
        </circle>
      )}
      {state === 'connecting' && (
        <circle r="2.5" fill={accent} opacity="0.6">
          <animateMotion dur="1.2s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="linear" path="M 44 40 L 76 32" />
        </circle>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function SingleScreenApp() {
  const { t } = useI18n();
  const { session, createSession, abandonSession, joinWithCode, setDeviceName } = useSession();
  const isDesktopLayout = useIsDesktopLayout();
  const [panelMode, setPanelMode] = useState<PanelMode>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<{ text: string; icon: 'offline' | 'server' | 'time' | 'info' } | null>(null);
  const [showQROverlay, setShowQROverlay] = useState(false);
  const reduceMotion = useReducedMotion();
  const [showQRScan, setShowQRScan] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
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

  // The QR overlay is a pairing tool — the moment the partner is actually
  // connected it has done its job. Close it automatically so the user never
  // has to dismiss it themselves while the room is already taking over.
  useEffect(() => {
    if (session.partnerConnected && !qrDismissedForRoomRef.current) {
      qrDismissedForRoomRef.current = session.roomId;
      setShowQROverlay(false);
    }
  }, [session.partnerConnected, session.roomId]);

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
    // REJECTED carries server copy already localized by humanizeError.
    if (e instanceof ConnectError && e.code === 'REJECTED') return { text: e.message, icon: 'info' };
    if (e instanceof Error && e.message && !/^CONNECT|^[A-Z_]+$/.test(e.message) && signalingConfigIssue()) {
      return { text: e.message, icon: 'info' };
    }
    return { text: t('err.generic'), icon: 'info' };
  }, [t]);

  const handleSend = useCallback(async () => {
    if (isCreating) return;
    setPanelMode('sending');
    setIsCreating(true);
    setCreateError(null);
    const thisAttempt = ++createAbortRef.current;
    try {
      await createSession();
      if (thisAttempt === createAbortRef.current) setRetryCount(0);
    } catch (e: unknown) {
      if (thisAttempt !== createAbortRef.current) return;
      setCreateError(friendlyConnectError(e));
      setPanelMode('idle');
    } finally {
      if (thisAttempt === createAbortRef.current) setIsCreating(false);
    }
  }, [isCreating, createSession, t, friendlyConnectError]);

  const handleReceive = useCallback(() => { setPanelMode('receiving'); setCreateError(null); setJoinError(null); }, []);

  const handleCodeComplete = useCallback(async (code: string) => {
    if (isJoining) return;
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
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrl); } catch {} setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
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
  const shareLink = async () => { if (navigator.share) { try { await navigator.share({ title: 'ShareText', url: shareUrl }); return; } catch {} } await copyLink(); };

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
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={20} />
          <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
        </div>
        {/* Even, breathing room between nav items — no negative-margin
            cramming; the toggle gets clear separation from Docs. */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <CommandBarChip onClick={() => setCmdOpen(true)} />
          <LanguageMenu />
          <a href="/docs" className="px-2 py-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors rounded-lg">{t('nav.docs')}</a>
          <div className="ml-1"><ThemeToggle /></div>
        </div>
    </header>
  );

  const heroContent = (
    <AnimatePresence mode="sync">
          {/* ── IDLE ──────────────────────────────────────────────── */}
          {panelMode === 'idle' && (
            // Deterministic first paint: the hero renders visible immediately;
            // only the swap-out fades. Never gate first paint on animation.
            <motion.div key="idle" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto">
              <h1 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold tracking-[-0.035em] leading-[1.08] text-apple-ink dark:text-white text-center sm:text-left" style={{ fontFamily: 'var(--font-display)' }}>
                {(() => { const [a, b] = t('home.title').split('\n'); return (<>{a}{b ? <><br />{b}</> : null}</>); })()}
              </h1>
              <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[36ch] text-center sm:text-left">
                {t('home.subtitle')}
              </p>
              <div className="mt-7 flex gap-6 justify-center sm:justify-start">
                <div className="flex flex-col items-center gap-1.5">
                  <TactileButton onClick={handleSend} variant="primary" size="lg" icon={<SendCircleIcon size={18} />} disabled={isCreating}>{t('home.send')}</TactileButton>
                  <span className="text-[11.5px] font-medium text-apple-ink-muted/70 dark:text-white/40">{t('home.sendHint')}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <TactileButton onClick={handleReceive} variant="secondary" size="lg" icon={<ReceiveCircleIcon size={18} />}>{t('home.receive')}</TactileButton>
                  <span className="text-[11.5px] font-medium text-apple-ink-muted/70 dark:text-white/40">{t('home.receiveHint')}</span>
                </div>
              </div>
              {/* The product working, before any signup: text, photo, and
                  file fly phone → laptop on a loop (mobile/tablet only — on
                  desktop the same scene lives in the right room pane). */}
              {/* Scaled to fit below the CTAs without pushing the footer:
                  0.52 at ph, 0.62 from sm, and generous negative margin to
                  reclaim the unscaled box height. */}
              <div className="lg:hidden mt-8 flex justify-center origin-top scale-[0.52] sm:scale-[0.62] -mb-[150px] sm:-mb-[118px]">
                <HeroTransferScene />
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
                    <button onClick={handleSend} className="mt-2 px-4 py-1.5 min-h-[36px] rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors active:scale-95">{t('home.retry')}</button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ── SENDING: pair the other device ────────────────────── */}
          {panelMode === 'sending' && (
            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md w-full mx-auto overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('create.title')}</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-semibold text-status-danger hover:bg-status-danger/15 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> {t('cancel')}</button>
              </div>
              {isCreating && !session.secret ? (
                <div className="flex flex-col items-center py-8">
                  <ShareTextLogo size={20} motion="connecting" />
                  <p className="text-[14px] font-medium text-apple-ink-muted dark:text-white/50">{t('create.creating')}</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('create.hint')}</p>
                  {/* The pairing tools (live code + QR/link/copy) make way for
                      the handshake the moment the other device starts joining:
                      the story changes from "share this code" to "we're
                      linking up". They return if the peer drops away. */}
                  <AnimatePresence mode="wait" initial={false}>
                    {session.partnerConnecting && !session.partnerConnected ? (
                      <motion.div key="handshake" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.25, ease: EASE }} className="py-3">
                        <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                      </motion.div>
                    ) : (
                      <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {!session.partnerConnecting && (
                      <motion.div key="pairing-actions" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="mt-5 space-y-2">
                    {/* Equal-weight paper tiles: the code is the hero of this
                        screen, so the three sharing tools don't compete — no
                        one blue pill outranking the others arbitrarily. */}
                    {/* Show QR is the primary action on this screen — scanning
                        is the fastest pairing path on any phone. */}
                    <button onClick={() => setShowQROverlay(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 text-white rounded-full text-[14px] font-semibold min-h-[48px] transition-colors active:scale-[0.97] shadow-sm bg-ember hover:bg-[#d9560e]">
                      <QrCode className="w-4 h-4" /> {t('create.showQr')}
                    </button>
                    <button onClick={shareLink} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[13px] font-semibold text-apple-ink dark:text-white/90 transition-colors active:scale-[0.97] min-h-[44px]">
                      {copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedLink ? t('create.copied') : t('create.shareLink')}
                    </button>
                    <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[13px] font-medium text-apple-ink dark:text-white/70 transition-colors active:scale-[0.98] min-h-[44px]">
                      {copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedCode ? t('create.codeCopied') : t('create.copyCode')}
                    </button>
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">{t('receive.title')}</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-medium text-status-danger hover:bg-status-danger/10 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> {t('cancel')}</button>
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
                    <button onClick={() => setShowQRScan(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 mb-3 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[14px] font-semibold text-apple-ink dark:text-white min-h-[48px] transition-colors active:scale-[0.97]">
                      <QrCode className="w-4 h-4 text-apple-ink-muted dark:text-white/60" /> {t('receive.scan')}
                    </button>
                    <div className="p-6 bg-white dark:bg-[#1a1a1e] border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                      <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} />
                    </div>
                    <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">{t('receive.note')}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── CONNECTING: code accepted, channel opening ────────── */}
          {panelMode === 'connecting' && (
            <motion.div key="connecting" data-testid="connecting-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto text-center">
              <div className="flex flex-col items-center py-6">
                {/* The handshake IS the connecting screen: radar → convergence
                    → locked link, staged exactly like the transfer that
                    follows. Works identically on mobile and desktop. */}
                <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
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
          {panelMode === 'connected' && (
            <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }} className="max-w-md mx-auto">
              {/* Device pair visual */}
              <div className="flex flex-col items-center sm:items-start mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      "w-14 h-14 rounded-[16px] flex items-center justify-center",
                      "bg-[#f06413]/10 dark:bg-[#fb9243]/10 border border-[#f06413]/15 dark:border-[#fb9243]/15"
                    )}>
                      <ThisDeviceIcon className="w-6 h-6 text-[#f06413] dark:text-[#fb9243]" />
                    </div>
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
                        className="w-[120px] text-center text-[11px] font-medium text-apple-ink dark:text-white bg-transparent border-b border-[#f06413]/50 dark:border-[#fb9243]/50 outline-none px-0.5"
                      />
                    ) : (                        <button
                          onClick={startEditName}
                          title={t('pair.renameTitle')}
                          aria-label={t('pair.renameAria', { name: session.deviceName })}
                          className="group max-w-[120px] min-h-[40px] -my-[11.5px] flex items-center gap-1 text-[11px] font-medium text-apple-ink-muted dark:text-white/40 hover:text-apple-ink dark:hover:text-white transition-colors"
                        >
                        <span className="truncate">{session.deviceName}</span>
                        <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shrink-0" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex items-center gap-1"
                    >
                      <span className="w-1 h-1 rounded-full bg-[#f06413]/40 dark:bg-[#fb9243]/40" />
                      <ArrowRightLeft className="w-4 h-4 text-[#f06413] dark:text-[#fb9243]" />
                      <span className="w-1 h-1 rounded-full bg-[#f06413]/40 dark:bg-[#fb9243]/40" />
                    </motion.div>
                    <span className={cn("text-[11px] font-medium mt-1", session.connectionType === 'disconnected' ? "text-status-warning" : "text-status-success")}>
                      {session.connectionType === 'disconnected' ? t('pair.reconnecting') : t('common.connected')}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      "w-14 h-14 rounded-[16px] flex items-center justify-center",
                      "bg-status-success/8 dark:bg-status-success/10 border border-status-success/15 dark:border-status-success/15"
                    )}>
                      <PartnerDeviceIcon className="w-6 h-6 text-status-success" />
                    </div>
                    <span className="max-w-[120px] text-[11px] font-medium text-apple-ink-muted dark:text-white/40 truncate">
                      {session.partnerName || t('pair.paired')}
                    </span>
                  </div>
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
              </div>

              {/* Ready message */}
              <div className="mb-5">
                <p className="text-[18px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] mb-1">{t('conn.ready')}</p>
                <p className="text-[14px] text-apple-ink-muted dark:text-white/50 leading-relaxed">
                  {t('conn.readyBody')}
                </p>
              </div>

              {/* Connection type + disconnect */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-apple-parchment dark:bg-white/[0.05] border border-apple-divider/50 dark:border-white/[0.08]">
                  <Wifi className="w-3 h-3 text-status-success" />
                  <span className="text-[12px] font-medium text-apple-ink-muted dark:text-white/50">
                    {session.connectionType === 'relay' ? t('conn.relay') : session.connectionType === 'local' ? t('conn.local') : session.connectionType === 'direct' ? t('conn.direct') : t('common.connected')}
                  </span>
                </div>
                <InlineConfirm
                  testId="end-session"
                  label={t('common.disconnect')}
                  confirmLabel={t('end.tapAgain')}
                  onConfirm={handleDisconnect}
                  className="text-status-danger/80 hover:text-status-danger"
                  size="sm"
                />
              </div>

              {/* Quiet guidance — what the right pane is for */}
              <div className="mt-6 grid grid-cols-1 gap-1.5 max-w-[340px]">
                {[
                  [t('conn.guidance.1t'), t('conn.guidance.1s')],
                  [t('conn.guidance.2t'), t('conn.guidance.2s')],
                  [t('conn.guidance.3t'), t('conn.guidance.3s')],
                ].map(([ti, si]) => (
                  <div key={ti} className="flex items-center gap-2.5 text-[12px]">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#f06413]/50 dark:bg-[#fb9243]/50" />
                    <span className="font-semibold text-apple-ink dark:text-white/85">{ti}</span>
                    <span className="text-apple-ink-muted/70 dark:text-white/40">— {si}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
    </AnimatePresence>
  );

  const footerNode = (
    <footer className="shrink-0 px-6 lg:px-10 py-4 border-t border-apple-divider/60 dark:border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
        {/* One line: links with real gaps, the handle as a compact chip so
            the X glyph and name can never wrap or split. */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <nav className="flex items-center gap-6 text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45">
            <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.docs')}</a>
            <a href="/privacy" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-apple-ink dark:hover:text-white transition-colors">Terms</a>
          </nav>
          <a
            href="https://x.com/0xalyt"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('footer.followAria')}
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full border border-apple-divider/70 dark:border-white/10 text-[12px] font-semibold text-apple-ink-muted dark:text-white/50 hover:text-apple-ink hover:border-apple-ink/30 dark:hover:text-white dark:hover:border-white/25 transition-colors whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            @0xalyt
          </a>
        </div>
    </footer>
  );

  const leftPanel = (
    <div className="relative isolate flex flex-col h-full overflow-hidden bg-apple-canvas dark:bg-[#131315]">
      {ambientGlow}
      {headerNode}
      {/* Hero area — flex-1 centers each state's content in the half */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-10 py-4 sm:py-6 min-h-0 overflow-hidden">
        {heroContent}
      </div>
      {footerNode}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RIGHT PANEL — the room (desktop only; mobile mounts ChatView)    */
  /* ---------------------------------------------------------------- */
  const roomPanel = (
    <div
      className="relative flex flex-col h-full min-h-0 overflow-hidden bg-[#f4f2ec] dark:bg-[#0f0f11]"
      data-testid="room-panel"
    >
      {/* Room header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-[#f4f2ec]/80 dark:bg-[#0f0f11]/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={16} />
          <span className="text-[13px] font-semibold text-apple-ink dark:text-white">
            {panelMode === 'connected' ? t('room.transfer') : t('room.title')}
          </span>
          {panelMode === 'connected' && (
            <>
              <span className="w-px h-3 bg-apple-divider dark:bg-white/10" />
              {/* Two physical devices — the mental model in the header. The
                  dot turns amber when the link drops so the room header
                  matches the in-room reconnect banner. */}
              <span className="flex items-center gap-1.5 text-apple-ink-muted dark:text-white/50" title={session.connectionType === 'disconnected' ? t('chat.peerDisconnected') : t('toast.connected')}>
                <ThisDeviceIcon className="w-3.5 h-3.5" />
                <ArrowRightLeft className="w-3 h-3 opacity-50" />
                <PartnerDeviceIcon className="w-3.5 h-3.5" />
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full ml-0.5",
                  session.connectionType === 'disconnected' ? "bg-status-warning" : "bg-status-success animate-pulse"
                )} />
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleDisconnect}
          className={cn(
            "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150",
            panelMode === 'connected'
              ? "text-apple-ink-muted dark:text-white/60 hover:text-status-danger hover:bg-status-danger/10"
              : "text-apple-ink-muted/40 dark:text-white/20"
          )}
          disabled={panelMode !== 'connected'}
          aria-label={t('common.disconnectAria')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        </button>
      </div>

      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {panelMode === 'connected' ? (
          <Suspense fallback={<div className="h-full flex items-center justify-center"><ShareTextLogo size={24} motion="connecting" /></div>}>
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
                  one story on both panes. Idle keeps the hero transfer demo
                  running here too: the right pane teaches the product while
                  the left pane asks for action. */}
              {panelMode === 'connecting' ? (
                <div className="mb-4">
                  <ConnectHandshake phase="connecting" localIcon={isMobileDevice ? 'phone' : 'monitor'} />
                </div>
              ) : (
                <>
                  {/* Live transfer demo (was a static pair illustration) */}
                  <div className="mb-5">
                    <HeroTransferScene />
                  </div>

                  {/* State-specific messaging */}
                  <p className="text-[15px] font-semibold text-apple-ink/70 dark:text-white/50 mb-1.5">
                    {panelMode === 'idle' && t('room.ready')}
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('create.creating') : t('room.created'))}
                    {panelMode === 'receiving' && t('room.waiting')}
                  </p>
                  <p className="text-[12.5px] text-apple-ink-muted/50 dark:text-white/25 max-w-[260px] leading-relaxed">
                    {panelMode === 'idle' && t('room.idleHint')}
                    {panelMode === 'sending' && (isCreating && !session.secret ? t('room.setup') : t('room.sendHint'))}
                    {panelMode === 'receiving' && t('room.receiveHint')}
                  </p>
                </>
              )}
              {/* A compact three-step guide keeps the room panel informative
                  while disconnected, instead of a large empty surface. */}
              {panelMode === 'idle' && (
                <div className="mt-8 space-y-2.5 text-left">
                  {[t('room.step.1'), t('room.step.2'), t('room.step.3')].map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-azure-600/10 dark:bg-azure-600/20 text-azure-700 dark:text-azure-400 text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-[12.5px] font-medium text-apple-ink-muted/80 dark:text-white/45">{step}</span>
                    </div>
                  ))}
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
          <Suspense fallback={
            <div className="h-full flex items-center justify-center bg-[#f4f2ec] dark:bg-[#0f0f11]">
              <ShareTextLogo size={26} motion="connecting" />
            </div>
          }>
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
                <div className="flex-1 flex flex-col justify-center px-6 lg:px-10 py-4 sm:py-6 min-h-0">
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
              <Suspense fallback={<div className="w-full h-[280px] flex items-center justify-center rounded-[16px] bg-apple-parchment dark:bg-white/5 text-[13px] text-apple-ink-muted">{t('qr.scan.loading')}</div>}>
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
            <motion.div ref={qrDisplayTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-apple-canvas dark:bg-[#1a1a1e] rounded-[24px] p-6 shadow-2xl text-center relative border border-apple-divider/50 dark:border-white/[0.08]" role="dialog" aria-modal="true" aria-label={t('qr.display.title')}>
              <button onClick={() => setShowQROverlay(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <kbd aria-hidden="true" className="hidden sm:inline absolute top-5 right-16 px-1.5 py-0.5 rounded-[5px] border border-apple-divider dark:border-white/10 bg-white/60 dark:bg-white/5 text-[10px] font-medium text-apple-ink-muted/80 dark:text-white/40">Esc</kbd>
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */
/** Localized loading label for the lazily-imported QR renderer. */
function QrLoadingLabel() {
  const { t } = useI18n();
  return <>{t('common.loading')}</>;
}

function QROverlayInner({ value }: { value: string }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => { import('qrcode.react').then(m => setComp(() => m.QRCodeSVG)); }, []);
  if (!Comp) return <div className="w-[220px] h-[220px] flex items-center justify-center text-[13px] text-apple-ink-muted"><QrLoadingLabel /></div>;
  return <Comp value={value} size={220} level="M" />;
}
