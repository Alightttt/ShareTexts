/**
 * SingleScreenApp — the entire app lives on one screen.
 *
 * Desktop (≥1024px): two-panel horizontal split.
 *   Left  = brand · action · context · footer
 *   Right = the transfer room (fills height)
 *
 * Mobile (<1024px): single scrollable column.
 *   Header → heading → buttons → collapsible info → room → footer
 *
 * The experience: DEVICE → CONNECT → TRANSFER → RECEIVED
 */
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { SendCircleIcon, ReceiveCircleIcon } from '../components/TransferIcons';
import { TactileButton } from '../components/TactileButton';
import { signalingConfigIssue } from '../lib/socket';
import { cn, shortCodeOf } from '../lib/utils';
import {
  ChevronDown, Maximize2, Minimize2, LogOut, QrCode, Link2, Copy, Check,
  Smartphone, Monitor, X, Wifi, ArrowRightLeft
} from 'lucide-react';
import { generateTOTP } from '../lib/totp';
import { useFocusTrap } from '../lib/useFocusTrap';
const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));
const ChatView = lazy(() => import('./ChatView').then(m => ({ default: m.ChatView })));
type PanelMode = 'idle' | 'sending' | 'receiving' | 'connected';
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
 * True when the two-panel desktop layout is active. The desktop and mobile
 * layout branches both reference the same leftPanel/roomPanel elements; only
 * mounting the branch that matches the current viewport keeps a SINGLE copy
 * of every component in the DOM (one ChatView, one composer, one pairing
 * input) instead of two — one visible and one hidden — which previously
 * duplicated ids, file inputs, event listeners, haptics and draft writes.
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
  const accent = isDark ? '#a78bfa' : '#8b7cf6';
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
  const { session, createSession, abandonSession, joinWithCode } = useSession();
  const isDesktopLayout = useIsDesktopLayout();
  const [panelMode, setPanelMode] = useState<PanelMode>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [mobileRoomFullscreen, setMobileRoomFullscreen] = useState(false);
  const [showQROverlay, setShowQROverlay] = useState(false);
  const [showQRScan, setShowQRScan] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState<Record<string, boolean>>({});
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);
  // On phones the transfer room lives below the connected summary; once the
  // pair connects, roll the room up so the composer is on screen instead of
  // leaving it below the fold.
  const mobileColumnRef = useRef<HTMLDivElement>(null);
  const roomSlotRef = useRef<HTMLDivElement>(null);

  /* --- panel mode sync --- */
  useEffect(() => {
    if (session.partnerConnected) setPanelMode('connected');
    // Transient drop (peer lost the link, tab reloaded, network blip): stay
    // in the room so the reconnect banner + retry live where the transfer
    // was, instead of bouncing the creator back to the pairing screen and
    // hiding the in-flight messages.
    else if (session.roomId && session.connectionType === 'disconnected') setPanelMode('connected');
    else if (session.roomId && session.isCreator) setPanelMode('sending');
    else if (session.roomId && !session.isCreator) setPanelMode('receiving');
    else if (!session.roomId) setPanelMode('idle');
  }, [session.roomId, session.isCreator, session.partnerConnected, session.connectionType]);

  useEffect(() => {
    if (panelMode === 'connected') {
      const t = setTimeout(() => messageInputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [panelMode]);

  // Focus traps for QR overlays
  const qrScanTrapRef = useFocusTrap(showQRScan, () => setShowQRScan(false));
  const qrDisplayTrapRef = useFocusTrap(showQROverlay, () => setShowQROverlay(false));

  // Mobile: when the room becomes the active surface (connected), scroll it
  // up so the composer is reachable without hunting below the fold.
  useEffect(() => {
    if (panelMode !== 'connected' || isDesktopLayout || mobileRoomFullscreen) return;
    const t = setTimeout(() => {
      const col = mobileColumnRef.current;
      const slot = roomSlotRef.current;
      if (!col || !slot) return;
      const target = Math.max(0, slot.offsetTop - Math.round(col.clientHeight * 0.18));
      col.scrollTo({ top: target, behavior: 'smooth' });
    }, 200);
    return () => clearTimeout(t);
  }, [panelMode, isDesktopLayout, mobileRoomFullscreen]);

  /* --- handlers --- */
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 2;
  const createAbortRef = useRef(0);

  const handleSend = useCallback(async () => {
    if (isCreating) return;
    setPanelMode('sending');
    setIsCreating(true);
    setCreateError(null);
    const thisAttempt = ++createAbortRef.current;
    try {
      await createSession();
      if (thisAttempt === createAbortRef.current) setRetryCount(0);
    } catch (e: any) {
      if (thisAttempt !== createAbortRef.current) return;
      const raw = e.message || "Could not start a session.";
      const msg = raw.includes("connection service")
        ? (signalingConfigIssue() || raw)
        : raw;
      const friendly = msg.includes("having trouble")
        ? "ShareText couldn't connect right now. Please check your internet and try again."
        : msg.includes("Taking too long")
        ? "Connection took too long. Please check your internet and try again."
        : msg;
      setCreateError(friendly);
      setPanelMode('idle');
    } finally {
      if (thisAttempt === createAbortRef.current) setIsCreating(false);
    }
  }, [isCreating, createSession]);

  const handleReceive = useCallback(() => { setPanelMode('receiving'); setCreateError(null); setJoinError(null); }, []);

  const handleCodeComplete = useCallback(async (code: string) => {
    if (isJoining) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await joinWithCode(code);
      setIsJoining(false);
      if (!res.success) setJoinError(res.error || "That code isn't active. Ask for a fresh one.");
    } catch {
      setIsJoining(false);
      setJoinError(signalingConfigIssue() || "ShareText couldn't connect. Please check your internet and try again.");
    }
  }, [isJoining, joinWithCode]);

  const handleDisconnect = useCallback(() => { setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); }, [abandonSession]);
  const handleCancel = useCallback(() => {
    createAbortRef.current++;
    setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null);
  }, [abandonSession]);

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
  const leftPanel = (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#0e1220]">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 lg:px-10 py-4">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={20} className="text-azure-600 dark:text-azure-400" />
          <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
          <ThemeToggle />
        </div>
      </header>

      {/* Hero area */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-10 py-4 sm:py-6 min-h-0 overflow-hidden">
        <AnimatePresence mode="sync">
          {/* ── IDLE ──────────────────────────────────────────────── */}
          {panelMode === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto sm:mx-0">
              <h1 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold tracking-[-0.03em] leading-[1.08] text-apple-ink dark:text-white text-center sm:text-left">
                Move anything<br />between your devices.
              </h1>
              <div className="mt-7 flex gap-3 justify-center sm:justify-start">
                <TactileButton onClick={handleSend} variant="primary" size="lg" icon={<SendCircleIcon size={18} />} disabled={isCreating}>Send</TactileButton>
                <TactileButton onClick={handleReceive} variant="secondary" size="lg" icon={<ReceiveCircleIcon size={18} />}>Receive</TactileButton>
              </div>
              {/* Mobile/tablet: a compact pair preview under the actions — the
                  big room panel only appears once the user picks Send or
                  Receive, so the first screen stays tight and action-first. */}
              <div className="lg:hidden mt-9 flex justify-center">
                <div className="flex items-center gap-2.5 rounded-2xl border border-apple-divider/50 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.04] px-4 py-2.5">
                  <span className="flex items-center gap-2 text-apple-ink-muted dark:text-white/45">
                    <ThisDeviceIcon className="w-4 h-4" />
                    <ArrowRightLeft className="w-3.5 h-3.5 text-azure-500 dark:text-azure-400" />
                    <PartnerDeviceIcon className="w-4 h-4" />
                  </span>
                  <span className="text-[12.5px] font-medium text-apple-ink-muted dark:text-white/60">
                    Any two devices — no app, no account
                  </span>
                </div>
              </div>
              {createError && (
                <div role="alert" className="mt-4">
                  <p className="text-[13px] font-medium text-status-danger leading-relaxed">{createError}</p>
                  <button onClick={handleSend} className="mt-2 px-4 py-2 min-h-[36px] rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors">Try again</button>
                </div>
              )}
            </motion.div>
          )}

          {/* ── SENDING: pair the other device ────────────────────── */}
          {panelMode === 'sending' && (
            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md w-full overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">Connect your other device.</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-semibold text-status-danger hover:bg-status-danger/15 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> Cancel</button>
              </div>
              {isCreating && !session.secret ? (
                <div className="flex flex-col items-center py-8">
                  <ShareTextLogo size={20} motion="connecting" className="text-azure-600 dark:text-azure-400 mb-4" />
                  <p className="text-[14px] font-medium text-apple-ink-muted dark:text-white/50">Creating room…</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">Open ShareText on the other device and enter this code.</p>
                  {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />}
                  <AnimatePresence>
                    {session.partnerConnecting && !session.partnerConnected && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4">
                        <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8b7cf6] animate-pulse" />
                          {session.connectionType === 'establishing' ? 'Establishing secure connection…' : 'Connecting…'}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="mt-5 space-y-2">
                    <button onClick={() => setShowQROverlay(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#8b7cf6] hover:bg-[#7c6ce0] text-white rounded-full text-[14px] font-semibold min-h-[48px] transition-all duration-150 active:scale-[0.97] shadow-sm shadow-[#8b7cf6]/20">
                      <QrCode className="w-4 h-4" /> Show QR
                    </button>
                    <button onClick={shareLink} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[13px] font-semibold text-apple-ink dark:text-white/90 transition-colors active:scale-[0.97] min-h-[44px]">
                      {copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedLink ? 'Copied' : 'Share link'}
                    </button>
                    <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.04] border border-apple-divider/40 dark:border-white/[0.06] hover:bg-apple-parchment dark:hover:bg-white/[0.06] rounded-full text-[13px] font-medium text-apple-ink dark:text-white/70 transition-colors active:scale-[0.98] min-h-[44px]">
                      {copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedCode ? 'Code copied' : 'Copy code'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ── RECEIVING: enter code ────────────────────────────── */}
          {panelMode === 'receiving' && (
            <motion.div key="receiving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">Join a room.</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-medium text-status-danger hover:bg-status-danger/10 px-3 py-2 min-h-[40px] rounded-full active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> Cancel</button>
              </div>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">Enter the code shown on the other device.</p>
              <button onClick={() => setShowQRScan(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 mb-3 bg-[#8b7cf6] hover:bg-[#7c6ce0] text-white rounded-full text-[14px] font-semibold min-h-[48px] transition-all duration-150 active:scale-[0.97] shadow-sm shadow-[#8b7cf6]/20">
                <QrCode className="w-4 h-4" /> Scan QR code
              </button>
              <div className="p-6 bg-white dark:bg-[#161e30] border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} />
              </div>
              <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">Encrypted between devices. Temporary by design.</p>
            </motion.div>
          )}

          {/* ── CONNECTED: device pair + ready to transfer ───────── */}
          {panelMode === 'connected' && (
            <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: EASE }} className="max-w-md mx-auto sm:mx-0">
              {/* Device pair visual */}
              <div className="flex flex-col items-center sm:items-start mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      "w-12 h-12 rounded-[14px] flex items-center justify-center",
                      "bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 border border-[#8b7cf6]/15 dark:border-[#a78bfa]/15"
                    )}>
                      <ThisDeviceIcon className="w-5 h-5 text-[#8b7cf6] dark:text-[#a78bfa]" />
                    </div>
                    <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/40">This device</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <motion.div
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className="flex items-center gap-1"
                    >
                      <span className="w-1 h-1 rounded-full bg-[#8b7cf6]/40 dark:bg-[#a78bfa]/40" />
                      <ArrowRightLeft className="w-4 h-4 text-[#8b7cf6] dark:text-[#a78bfa]" />
                      <span className="w-1 h-1 rounded-full bg-[#8b7cf6]/40 dark:bg-[#a78bfa]/40" />
                    </motion.div>
                    <span className={cn("text-[11px] font-medium mt-1", session.connectionType === 'disconnected' ? "text-status-warning" : "text-status-success")}>
                      {session.connectionType === 'disconnected' ? 'Reconnecting…' : 'Connected'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={cn(
                      "w-12 h-12 rounded-[14px] flex items-center justify-center",
                      "bg-status-success/8 dark:bg-status-success/10 border border-status-success/15 dark:border-status-success/15"
                    )}>
                      <PartnerDeviceIcon className="w-5 h-5 text-status-success" />
                    </div>
                    <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/40">Paired</span>
                  </div>
                </div>
              </div>

              {/* Ready message */}
              <div className="mb-5">
                <p className="text-[18px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] mb-1">Ready to transfer</p>
                <p className="text-[14px] text-apple-ink-muted dark:text-white/50 leading-relaxed">
                  Send text, photos, or files from either device.<br />
                  They arrive instantly.
                </p>
              </div>

              {/* Connection type + disconnect */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-apple-parchment dark:bg-white/[0.05] border border-apple-divider/50 dark:border-white/[0.08]">
                  <Wifi className="w-3 h-3 text-status-success" />
                  <span className="text-[12px] font-medium text-apple-ink-muted dark:text-white/50">
                    {session.connectionType === 'relay' ? 'Relay' : session.connectionType === 'local' ? 'Same network' : session.connectionType === 'direct' ? 'Direct' : 'Connected'}
                  </span>
                </div>
                <button onClick={handleDisconnect} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-status-danger/80 hover:text-status-danger hover:bg-status-danger/8 transition-colors active:scale-95">
                  <LogOut className="w-3 h-3" /> Disconnect
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info section — visible on idle, compact */}
      {panelMode === 'idle' && (
        <>
          {/* Desktop: always expanded */}
          <div className="hidden lg:block shrink-0 px-6 lg:px-10 pb-4 space-y-3">
            <InfoCard title="What is it?">
              Need to move something from your phone to your computer? ShareText lets you send text, photos, and files directly between two devices — no app, no account, no cable.
            </InfoCard>
            <InfoCard title="How to connect?">
              <ol className="list-none space-y-1.5">
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">1</span><span>Open ShareText on both devices.</span></li>
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">2</span><span>Tap Send on one, Receive on the other. Use the code or QR.</span></li>
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">3</span><span>Send anything. Paste, drop, or attach.</span></li>
              </ol>
            </InfoCard>
          </div>
          {/* Mobile: collapsible */}
          <div className="lg:hidden shrink-0 px-6 pb-3 space-y-1.5">
            <InfoSection title="What is it?" expanded={!!infoExpanded['what']} onToggle={() => setInfoExpanded(p => ({ ...p, what: !p.what }))}>
              Need to move something from your phone to your computer? ShareText lets you send text, photos, and files directly between two devices — no app, no account, no cable.
            </InfoSection>
            <InfoSection title="How to connect?" expanded={!!infoExpanded['how']} onToggle={() => setInfoExpanded(p => ({ ...p, how: !p.how }))}>
              <ol className="list-none space-y-1.5">
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">1</span><span>Open ShareText on both devices.</span></li>
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">2</span><span>Tap Send on one, Receive on the other. Use the code or QR.</span></li>
                <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 text-[#8b7cf6] dark:text-[#a78bfa] text-[11px] font-bold flex items-center justify-center mt-0.5">3</span><span>Send anything. Paste, drop, or attach.</span></li>
              </ol>
            </InfoSection>
          </div>
        </>
      )}

      {/* Connected state: show compact instructions below the hero */}
      {panelMode === 'connected' && (
        <div className="hidden lg:block shrink-0 px-6 lg:px-10 pb-4">
          <InfoCard title="How to use">
            <ol className="list-none space-y-1.5">
              <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-status-success/10 text-status-success text-[11px] font-bold flex items-center justify-center mt-0.5">1</span><span>Type, paste, or drop files in the transfer area.</span></li>
              <li className="flex items-start gap-2.5"><span className="shrink-0 w-5 h-5 rounded-full bg-status-success/10 text-status-success text-[11px] font-bold flex items-center justify-center mt-0.5">2</span><span>They arrive on the other device instantly.</span></li>
            </ol>
          </InfoCard>
        </div>
      )}

      {/* Footer */}
      <footer className="shrink-0 px-6 lg:px-10 py-4 border-t border-apple-divider/60 dark:border-white/[0.06] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5 text-[12px] font-medium text-apple-ink-muted dark:text-white/40">
            <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-apple-ink dark:hover:text-white transition-colors" aria-label="Follow on X">@0xalyt<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg></a>
          </div>
          <div className="hidden sm:flex items-center gap-2.5 text-[11px] text-apple-ink-muted/40 dark:text-white/20">
            <span>No app</span>
            <span className="text-apple-ink-muted/20 dark:text-white/10">·</span>
            <span>No account</span>
            <span className="text-apple-ink-muted/20 dark:text-white/10">·</span>
            <span>Temporary</span>
          </div>
        </div>
      </footer>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RIGHT / BOTTOM PANEL — the room                                 */
  /* ---------------------------------------------------------------- */
  const roomPanel = (
    <div className={cn(
      // lg:h-full is what makes the room fill the whole right side on desktop
      // — without it the panel collapses to its content height (~430px) and
      // the composer sits above a dead band instead of pinning to the bottom.
      "relative flex flex-col min-h-0 overflow-hidden lg:h-full bg-[#f2f0ed] dark:bg-[#080c16]",
      "max-lg:h-[60vh] max-lg:min-h-[360px] max-lg:max-h-[700px] max-lg:w-full max-lg:mx-auto max-lg:rounded-[20px] max-lg:border max-lg:border-apple-divider/50 max-lg:dark:border-white/[0.08] max-lg:shadow-card",
      mobileRoomFullscreen && "max-lg:!fixed max-lg:inset-0 max-lg:z-50 max-lg:rounded-none max-lg:border-none max-lg:aspect-auto max-lg:shadow-none"
    )}>
      {/* Ambient brand glow — a quiet lavender wash in the corner. Background
          only: never competes with content, disappears on reduced motion. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-28 -right-24 w-[26rem] h-[26rem] rounded-full bg-[#8b7cf6]/[0.08] dark:bg-[#a78bfa]/[0.06] blur-[110px] motion-reduce:hidden" />
      {/* Room header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-[#f2f0ed]/80 dark:bg-[#080c16]/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={16} className="text-azure-600 dark:text-azure-400" />
          <span className="text-[13px] font-semibold text-apple-ink dark:text-white">
            {panelMode === 'connected' ? 'Transfer' : 'Room'}
          </span>
          {panelMode === 'connected' && (
            <>
              <span className="w-px h-3 bg-apple-divider dark:bg-white/10" />
              {/* Two physical devices — the mental model in the header. The
                  dot turns amber when the link drops so the room header
                  matches the in-room reconnect banner. */}
              <span className="flex items-center gap-1.5 text-apple-ink-muted dark:text-white/50" title={session.connectionType === 'disconnected' ? 'Other device disconnected' : 'Devices connected'}>
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
        <div className="flex items-center gap-1">
          <button
            onClick={handleDisconnect}
            className={cn(
              "flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg transition-all duration-150",
              panelMode === 'connected'
                ? "text-apple-ink-muted dark:text-white/60 hover:text-status-danger hover:bg-status-danger/10"
                : "text-apple-ink-muted/40 dark:text-white/20"
            )}
            disabled={panelMode !== 'connected'}
            aria-label="Disconnect"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
          <button
            onClick={() => setMobileRoomFullscreen(!mobileRoomFullscreen)}
            className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/40 dark:hover:bg-white/[0.06] transition-colors"
            aria-label={mobileRoomFullscreen ? 'Minimize' : 'Fullscreen'}
          >
            {mobileRoomFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Room content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {panelMode === 'connected' ? (
          <Suspense fallback={<div className="h-full flex items-center justify-center"><ShareTextLogo size={24} motion="connecting" className="text-azure-600 dark:text-azure-400" /></div>}>
            <ChatView panelMode="embedded" />
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
              {/* Device pair illustration */}
              <div className="mb-5">
                <DevicePair
                  state={panelMode === 'sending' && session.partnerConnecting ? 'connecting' : panelMode === 'idle' ? 'idle' : 'connecting'}
                />
              </div>

              {/* State-specific messaging */}
              <p className="text-[15px] font-semibold text-apple-ink/70 dark:text-white/50 mb-1.5">
                {panelMode === 'idle' && 'Connect two devices'}
                {panelMode === 'sending' && (isCreating && !session.secret ? 'Creating room…' : 'Waiting for your other device')}
                {panelMode === 'receiving' && 'Waiting for connection'}
              </p>
              <p className="text-[12.5px] text-apple-ink-muted/50 dark:text-white/25 max-w-[240px] leading-relaxed">
                {panelMode === 'idle' && 'Then start sharing anything — text, photos, links, or files.'}
                {panelMode === 'sending' && (isCreating && !session.secret ? 'Setting up your transfer room.' : 'Enter the code shown on this device.')}
                {panelMode === 'receiving' && 'Enter the code from the other device.'}
              </p>
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
    <div className="h-dvh lg:h-dvh overflow-hidden bg-apple-canvas dark:bg-[#0a0e18] dot-bg">
      {/* Only the ACTIVE layout is mounted — the other branch stays unmounted
          so components (ChatView, composer, pairing input) exist exactly once
          in the DOM instead of twice with one hidden copy. */}
      {isDesktopLayout ? (
        /* Desktop: horizontal split */
        <div className="flex h-full">
          <div className="w-[42%] min-w-[380px] max-w-[480px] h-full overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.06]">{leftPanel}</div>
          <div className="flex-1 h-full min-w-0">{roomPanel}</div>
        </div>
      ) : (
        /* Mobile: scrollable column. The big room panel only mounts once the
            user picks Send or Receive — on idle the compact pair preview in
            the hero (above) tells the story without a 60vh empty card at the
            bottom of the first screen. */
        <div ref={mobileColumnRef} className="h-full overflow-y-auto overscroll-contain">
          <div className="flex flex-col min-h-full pb-4">
            <div className="shrink-0">{leftPanel}</div>
            {panelMode !== 'idle' && (
              <div ref={roomSlotRef} className="shrink-0 px-4 mt-4">{roomPanel}</div>
            )}
          </div>
        </div>
      )}
      {/* QR scan overlay (for receiving) */}
      <AnimatePresence>
        {showQRScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setShowQRScan(false)}>
            <motion.div ref={qrScanTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[360px] bg-white dark:bg-[#161e30] rounded-[24px] p-6 shadow-2xl relative" role="dialog" aria-modal="true" aria-label="Scan QR code">
              <button onClick={() => setShowQRScan(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors z-10" aria-label="Close QR scanner"><X className="w-4 h-4" /></button>
              <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white mb-2">Scan QR code</h3>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 mb-4">Point your camera at the QR code on the other device.</p>
              <Suspense fallback={<div className="w-full h-[280px] flex items-center justify-center rounded-[16px] bg-apple-parchment dark:bg-white/5 text-[13px] text-apple-ink-muted">Loading scanner...</div>}>
                <QRScanner onScan={handleQRScan} onErrorFallback={() => { setShowQRScan(false); }} />
              </Suspense>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* QR display overlay (for sending) */}
      <AnimatePresence>
        {showQROverlay && session.roomId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-6" onClick={() => setShowQROverlay(false)}>
            <motion.div ref={qrDisplayTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-white dark:bg-[#161e30] rounded-[24px] p-6 shadow-2xl text-center relative" role="dialog" aria-modal="true" aria-label="QR code">
              <button onClick={() => setShowQROverlay(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors" aria-label="Close QR code"><X className="w-4 h-4" /></button>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">Open ShareText on your other device, choose <strong className="text-apple-ink dark:text-white">Receive</strong>, then scan.</p>
              <div className="bg-white p-4 rounded-[18px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30"><QROverlayInner value={qrValue} /></div>
              <button onClick={() => setShowQROverlay(false)} className="w-full py-2.5 min-h-[44px] bg-apple-parchment dark:bg-white/5 hover:bg-apple-divider dark:hover:bg-white/10 rounded-[12px] text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]">Close</button>
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
function InfoSection({ title, expanded, onToggle, children }: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-apple-divider/40 dark:border-white/[0.06] rounded-[12px] overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium text-apple-ink dark:text-white/80 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      >
        {title}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="text-apple-ink-muted"
        ><ChevronDown className="w-3.5 h-3.5" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 text-[12.5px] text-apple-ink-muted dark:text-white/50 leading-[1.6] space-y-1.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-apple-ink-muted/60 dark:text-white/30 mb-1.5">{title}</h3>
      <div className="text-[13px] text-apple-ink/80 dark:text-white/60 leading-[1.6] space-y-1.5">{children}</div>
    </div>
  );
}

function QROverlayInner({ value }: { value: string }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => { import('qrcode.react').then(m => setComp(() => m.QRCodeSVG)); }, []);
  if (!Comp) return <div className="w-[220px] h-[220px] flex items-center justify-center text-[13px] text-apple-ink-muted">Loading...</div>;
  return <Comp value={value} size={220} level="M" />;
}
