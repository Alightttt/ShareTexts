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
import { motion, AnimatePresence } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { SendCircleIcon, ReceiveCircleIcon } from '../components/TransferIcons';
import { TactileButton } from '../components/TactileButton';
import { signalingConfigIssue } from '../lib/socket';
import { useI18n } from '../lib/i18n';
import { LanguageMenu } from '../components/LanguageMenu';
import { cn, shortCodeOf, sanitizeDeviceName } from '../lib/utils';
import {
  LogOut, QrCode, Link2, Copy, Check,
  Smartphone, Monitor, X, Wifi, ArrowRightLeft, Info, Pencil
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
  const { t } = useI18n();
  const { session, createSession, abandonSession, joinWithCode, setDeviceName } = useSession();
  const isDesktopLayout = useIsDesktopLayout();
  const [panelMode, setPanelMode] = useState<PanelMode>('idle');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showQROverlay, setShowQROverlay] = useState(false);
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

  // Focus traps for QR overlays
  const qrScanTrapRef = useFocusTrap(showQRScan, () => setShowQRScan(false));
  const qrDisplayTrapRef = useFocusTrap(showQROverlay, () => setShowQROverlay(false));

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
        ? t('err.connectFailed')
        : msg.includes("Taking too long")
        ? t('err.timeout')
        : msg;
      setCreateError(friendly);
      setPanelMode('idle');
    } finally {
      if (thisAttempt === createAbortRef.current) setIsCreating(false);
    }
  }, [isCreating, createSession, t]);

  const handleReceive = useCallback(() => { setPanelMode('receiving'); setCreateError(null); setJoinError(null); }, []);

  const handleCodeComplete = useCallback(async (code: string) => {
    if (isJoining) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await joinWithCode(code);
      setIsJoining(false);
      if (!res.success) setJoinError(res.error || t('err.codeInactive'));
    } catch {
      setIsJoining(false);
      setJoinError(signalingConfigIssue() || t('err.generic'));
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
  const ambientGlow = (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10 overflow-hidden motion-reduce:hidden">
      <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full bg-azure-200/60 dark:bg-azure-600/[0.12] blur-[100px]" />
      <div className="absolute -top-12 right-[-3rem] w-96 h-96 rounded-full bg-peach-200/50 dark:bg-peach-400/[0.07] blur-[110px]" />
    </div>
  );
  const headerNode = (
    <header className="shrink-0 flex items-center justify-between px-6 lg:px-10 py-4">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={20} className="text-azure-600 dark:text-azure-400" />
          <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="flex items-center gap-1">
          <LanguageMenu />
          <a href="/docs" className="min-w-[40px] min-h-[40px] flex items-center justify-center -mx-[5px] -my-[10px] text-[13px] font-medium text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.docs')}</a>
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
            <motion.div key="idle" exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto">
              <h1 className="text-[34px] sm:text-[42px] lg:text-[48px] font-bold tracking-[-0.03em] leading-[1.08] text-apple-ink dark:text-white text-center sm:text-left">
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
              {createError && (
                <div role="alert" className="mt-4">
                  <p className="text-[13px] font-medium text-status-danger leading-relaxed">{createError}</p>
                  <button onClick={handleSend} className="mt-2 px-4 py-2 min-h-[36px] rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors">{t('home.retry')}</button>
                </div>
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
                  <ShareTextLogo size={20} motion="connecting" className="text-azure-600 dark:text-azure-400 mb-4" />
                  <p className="text-[14px] font-medium text-apple-ink-muted dark:text-white/50">{t('create.creating')}</p>
                </div>
              ) : (
                <>
                  <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">{t('create.hint')}</p>
                  {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />}
                  <AnimatePresence>
                    {session.partnerConnecting && !session.partnerConnected && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4">
                        <motion.p
                          animate={{ opacity: [0.6, 1, 0.6] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                          className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8b7cf6] animate-pulse" />
                          {session.connectionType === 'establishing' ? t('create.establishing') : t('create.connecting')}
                        </motion.p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="mt-5 space-y-2">
                    <button onClick={() => setShowQROverlay(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#8b7cf6] hover:bg-[#7c6ce0] text-white rounded-full text-[14px] font-semibold min-h-[48px] transition-all duration-150 active:scale-[0.97] shadow-sm shadow-[#8b7cf6]/20">
                      <QrCode className="w-4 h-4" /> {t('create.showQr')}
                    </button>
                    <button onClick={shareLink} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] rounded-full text-[13px] font-semibold text-apple-ink dark:text-white/90 transition-colors active:scale-[0.97] min-h-[44px]">
                      {copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedLink ? t('create.copied') : t('create.shareLink')}
                    </button>
                    <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-white/[0.04] border border-apple-divider/40 dark:border-white/[0.06] hover:bg-apple-parchment dark:hover:bg-white/[0.06] rounded-full text-[13px] font-medium text-apple-ink dark:text-white/70 transition-colors active:scale-[0.98] min-h-[44px]">
                      {copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /></AnimatedIcon>}
                      {copiedCode ? t('create.codeCopied') : t('create.copyCode')}
                    </button>
                  </div>
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
              <button onClick={() => setShowQRScan(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 mb-3 bg-[#8b7cf6] hover:bg-[#7c6ce0] text-white rounded-full text-[14px] font-semibold min-h-[48px] transition-all duration-150 active:scale-[0.97] shadow-sm shadow-[#8b7cf6]/20">
                <QrCode className="w-4 h-4" /> {t('receive.scan')}
              </button>
              <div className="p-6 bg-white dark:bg-[#251b40] border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} />
              </div>
              <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">{t('receive.note')}</p>
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
                      "bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/10 border border-[#8b7cf6]/15 dark:border-[#a78bfa]/15"
                    )}>
                      <ThisDeviceIcon className="w-6 h-6 text-[#8b7cf6] dark:text-[#a78bfa]" />
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
                        className="w-[120px] text-center text-[11px] font-medium text-apple-ink dark:text-white bg-transparent border-b border-[#8b7cf6]/50 dark:border-[#a78bfa]/50 outline-none px-0.5"
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
                      <span className="w-1 h-1 rounded-full bg-[#8b7cf6]/40 dark:bg-[#a78bfa]/40" />
                      <ArrowRightLeft className="w-4 h-4 text-[#8b7cf6] dark:text-[#a78bfa]" />
                      <span className="w-1 h-1 rounded-full bg-[#8b7cf6]/40 dark:bg-[#a78bfa]/40" />
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
                  <div role="status" className="w-full sm:max-w-[340px] flex items-start gap-2 px-3 py-2 rounded-[12px] bg-[#8b7cf6]/8 dark:bg-[#a78bfa]/10 border border-[#8b7cf6]/15 dark:border-[#a78bfa]/15 text-[12px] text-apple-ink-muted dark:text-white/60 leading-snug">
                    <Info className="w-3.5 h-3.5 text-[#8b7cf6] dark:text-[#a78bfa] shrink-0 mt-px" />
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
                <button onClick={handleDisconnect} className="min-h-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold text-status-danger/80 hover:text-status-danger hover:bg-status-danger/8 transition-colors active:scale-95">
                  <LogOut className="w-3 h-3" /> {t('common.disconnect')}
                </button>
              </div>

              {/* Quiet guidance — what the right pane is for */}
              <div className="mt-6 grid grid-cols-1 gap-1.5 max-w-[340px]">
                {[
                  [t('conn.guidance.1t'), t('conn.guidance.1s')],
                  [t('conn.guidance.2t'), t('conn.guidance.2s')],
                  [t('conn.guidance.3t'), t('conn.guidance.3s')],
                ].map(([ti, si]) => (
                  <div key={ti} className="flex items-center gap-2.5 text-[12px]">
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#8b7cf6]/50 dark:bg-[#a78bfa]/50" />
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5 text-[12px] font-medium text-apple-ink-muted dark:text-white/40">
            <a href="/docs" className="min-w-[40px] min-h-[40px] flex items-center justify-center -mx-[5px] -my-[10px] hover:text-apple-ink dark:hover:text-white transition-colors">{t('nav.docs')}</a>
            <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer" className="min-h-[40px] flex items-center gap-1.5 -my-[10px] hover:text-apple-ink dark:hover:text-white transition-colors" aria-label={t('footer.followAria')}>@0xalyt<svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg></a>
          </div>
          <div className="hidden sm:flex items-center gap-2.5 text-[11px] text-apple-ink-muted/40 dark:text-white/20">
            <span>{t('footer.noApp')}</span>
            <span className="text-apple-ink-muted/20 dark:text-white/10">·</span>
            <span>{t('footer.noAccount')}</span>
            <span className="text-apple-ink-muted/20 dark:text-white/10">·</span>
            <span>{t('footer.temporary')}</span>
          </div>
        </div>
    </footer>
  );

  const leftPanel = (
    <div className="relative isolate flex flex-col h-full overflow-hidden bg-apple-canvas dark:bg-[#141024]">
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
      className="relative flex flex-col h-full min-h-0 overflow-hidden bg-[#f4ecdd] dark:bg-[#110c20]"
      data-testid="room-panel"
    >
      {/* Ambient brand glow — a quiet lavender wash in the corner. Background
          only: never competes with content, disappears on reduced motion. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-28 -right-24 w-[26rem] h-[26rem] rounded-full bg-[#8b7cf6]/[0.08] dark:bg-[#a78bfa]/[0.06] blur-[110px] motion-reduce:hidden" />
      {/* Room header */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-[#f4ecdd]/80 dark:bg-[#110c20]/80 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2.5">
          <ShareTextLogo size={16} className="text-azure-600 dark:text-azure-400" />
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
          <Suspense fallback={<div className="h-full flex items-center justify-center"><ShareTextLogo size={24} motion="connecting" className="text-azure-600 dark:text-azure-400" /></div>}>
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
              {/* Device pair illustration */}
              <div className="mb-5">
                <DevicePair
                  state={panelMode === 'sending' && session.partnerConnecting ? 'connecting' : panelMode === 'idle' ? 'idle' : 'connecting'}
                />
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
    <div className="h-dvh lg:h-dvh overflow-hidden bg-apple-canvas dark:bg-[#141024] dot-bg">
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
            <div className="h-full flex items-center justify-center bg-[#f4ecdd] dark:bg-[#110c20]">
              <ShareTextLogo size={26} motion="connecting" className="text-azure-600 dark:text-azure-400" />
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
              <div className="relative isolate flex flex-1 flex-col bg-apple-canvas dark:bg-[#141024]">
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
            <motion.div ref={qrScanTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[360px] bg-white dark:bg-[#251b40] rounded-[24px] p-6 shadow-2xl relative" role="dialog" aria-modal="true" aria-label={t('receive.scan')}>
              <button onClick={() => setShowQRScan(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors z-10" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
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
            <motion.div ref={qrDisplayTrapRef} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-white dark:bg-[#251b40] rounded-[24px] p-6 shadow-2xl text-center relative" role="dialog" aria-modal="true" aria-label={t('qr.display.title')}>
              <button onClick={() => setShowQROverlay(false)} className="absolute top-3 right-3 min-w-[44px] min-h-[44px] rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors" aria-label={t('common.close')}><X className="w-4 h-4" /></button>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">
                {(() => { const parts = t('qr.display.body', { receive: '\u0000' }).split('\u0000'); return (<>{parts[0]}<strong className="text-apple-ink dark:text-white">{t('qr.display.receive')}</strong>{parts[1]}</>); })()}
              </p>
              <div className="bg-white p-4 rounded-[18px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30"><QROverlayInner value={qrValue} /></div>
              <button onClick={() => setShowQROverlay(false)} className="w-full py-2.5 min-h-[44px] bg-apple-parchment dark:bg-white/5 hover:bg-apple-divider dark:hover:bg-white/10 rounded-[12px] text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]">{t('qr.close')}</button>
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
