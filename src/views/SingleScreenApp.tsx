/**
 * SingleScreenApp — the entire app lives on one screen.
 *
 * Desktop (≥1024px): 50/50 horizontal split.
 *   Left  = branding · hero · info · footer
 *   Right = room panel (fills height)
 *
 * Mobile (<1024px): single scrollable column.
 *   Header → heading → buttons → collapsible info → room (9:16) → footer
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
import { ChevronDown, Maximize2, Minimize2, LogOut, QrCode, Link2, Copy, Check, Smartphone, Monitor, X } from 'lucide-react';
import { generateTOTP } from '../lib/totp';
const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));
const ChatView = lazy(() => import('./ChatView').then(m => ({ default: m.ChatView })));
type PanelMode = 'idle' | 'sending' | 'receiving' | 'connected';
const EASE = [0.22, 1, 0.36, 1] as const;
const SPRING = { type: 'spring' as const, bounce: 0.15, duration: 0.35 };
const FAST_SPRING = { type: 'spring' as const, bounce: 0.2, duration: 0.25 };

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
function PartnerDeviceIcon() {
  const isMobile = useIsMobileDevice();
  return isMobile ? <Monitor className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */
export function SingleScreenApp() {
  const { session, createSession, abandonSession, joinWithCode } = useSession();
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

  /* --- panel mode sync --- */
  useEffect(() => {
    if (session.partnerConnected) setPanelMode('connected');
    else if (session.roomId && session.isCreator) setPanelMode('sending');
    else if (session.roomId && !session.isCreator) setPanelMode('receiving');
    else if (!session.roomId) setPanelMode('idle');
  }, [session.roomId, session.isCreator, session.partnerConnected]);

  useEffect(() => {
    if (panelMode === 'connected') {
      const t = setTimeout(() => messageInputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [panelMode]);

  /* --- handlers --- */
  const handleSend = useCallback(async () => {
    if (isCreating) return;
    // Optimistic: show sending UI immediately so the user sees instant feedback
    setIsCreating(true); setCreateError(null);
    const t = setTimeout(() => { setIsCreating(false); setCreateError('Taking too long. Check your connection.'); }, 12000);
    try { await createSession(); clearTimeout(t); }
    catch (e: any) { clearTimeout(t); setIsCreating(false); const raw = e.message || "Could not start a session."; const msg = raw.includes('connection service') ? (signalingConfigIssue() || raw) : raw; setCreateError(msg.includes("having trouble") ? "Could not reach ShareText. Check your internet and try again." : msg.includes("Taking too long") ? "Connection timed out. Check your internet and try again." : msg); }
  }, [isCreating, createSession]);

  const handleReceive = useCallback(() => { setPanelMode('receiving'); setCreateError(null); setJoinError(null); }, []);

  const handleCodeComplete = useCallback(async (code: string) => {
    if (isJoining) return; setIsJoining(true); setJoinError(null);
    const t = setTimeout(() => { setIsJoining(false); setJoinError('Connection is slow. Check your internet and try again.'); }, 10000);
    try { const res = await joinWithCode(code); clearTimeout(t); setIsJoining(false); if (!res.success) setJoinError(res.error || "That code isn't active. Ask for a fresh one."); }
    catch { clearTimeout(t); setIsJoining(false); setJoinError(signalingConfigIssue() || "Could not reach ShareText. Check your internet connection."); }
  }, [isJoining, joinWithCode]);

  const handleDisconnect = useCallback(() => { setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); }, [abandonSession]);
  const handleCancel = useCallback(() => { setPanelMode('idle'); abandonSession(); setCreateError(null); setIsCreating(false); setJoinError(null); }, [abandonSession]);

  /* --- derived --- */
  const shareUrl = session.roomId ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}` : '';
  const qrCode = session.secret ? generateTOTP(session.secret, session.createdAt) : '';
  const qrValue = qrCode ? `${shareUrl}?c=${qrCode}` : '';
  const copyLink = async () => { try { await navigator.clipboard.writeText(shareUrl); } catch {} setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };
  const copyCode = async () => { const c = session.secret ? generateTOTP(session.secret, session.createdAt) : ''; try { await navigator.clipboard.writeText(c); } catch {} setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };
  const handleQRScan = useCallback((text: string) => {
    // The QR value is a URL with ?c= param - extract the code
    try {
      const url = new URL(text);
      const code = url.searchParams.get('c');
      if (code) {
        setShowQRScan(false);
        handleCodeComplete(code);
      } else {
        // Maybe it's just the code directly
        if (/^\d{6}$/.test(text.trim())) {
          setShowQRScan(false);
          handleCodeComplete(text.trim());
        }
      }
    } catch {
      if (/^\d{6}$/.test(text.trim())) {
        setShowQRScan(false);
        handleCodeComplete(text.trim());
      }
    }
  }, [handleCodeComplete]);
  const shareLink = async () => { if (navigator.share) { try { await navigator.share({ title: 'ShareText', url: shareUrl }); return; } catch {} } await copyLink(); };

  /* ---------------------------------------------------------------- */
  /*  LEFT / TOP PANEL — hero actions                                 */
  /* ---------------------------------------------------------------- */
  const leftPanel = (
    <div className="flex flex-col h-full overflow-hidden">
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

      {/* Hero */}
      <div className="flex-1 flex flex-col justify-center px-6 lg:px-10 py-4 sm:py-6 min-h-0">
        <AnimatePresence mode="sync">
          {panelMode === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md mx-auto sm:mx-0">
              <h1 className="text-[36px] sm:text-[44px] lg:text-[56px] font-bold tracking-[-0.04em] leading-[1.05] text-apple-ink dark:text-white text-center sm:text-left">
                Move anything<br />between your devices.
              </h1>
              
              <div className="mt-8 flex gap-3 justify-center sm:justify-start">
                <TactileButton onClick={handleSend} variant="primary" size="lg" icon={<SendCircleIcon size={18} />}>Send</TactileButton>
                <TactileButton onClick={handleReceive} variant="secondary" size="lg" icon={<ReceiveCircleIcon size={18} />}>Receive</TactileButton>
              </div>
              {createError && (
                <div role="alert" className="mt-4">
                  <p className="text-[13px] font-medium text-status-danger leading-relaxed">{createError}</p>
                  <button onClick={handleSend} className="mt-2 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors">Try again</button>
                </div>
              )}
            </motion.div>
          )}
          {panelMode === 'sending' && (
            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">Connect your other device.</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white px-3 py-1.5 rounded-full hover:bg-apple-parchment dark:hover:bg-white/5 active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> Cancel</button>
              </div>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">Open ShareText on the other device and enter this code.</p>
              {session.secret && <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />}
              <AnimatePresence>
                {session.partnerConnecting && !session.partnerConnected && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4">
                    <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6b84f0] animate-pulse" />
                      {session.connectionType === 'establishing' ? 'Establishing secure connection...' : 'Connecting...'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="mt-5 space-y-2">
                <button onClick={() => setShowQROverlay(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#6b84f0] hover:bg-[#5a74e8] text-white rounded-full text-[14px] font-semibold min-h-[46px] transition-all duration-150 active:scale-[0.97]">
                  <QrCode className="w-4 h-4" /> Show QR
                </button>
                <button onClick={shareLink} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-[#161e30] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-[#1c2640] rounded-full text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.97] min-h-[44px]">
                  {copiedLink ? <AnimatedIcon animate="check" active><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted" /></AnimatedIcon>}
                  {copiedLink ? 'Copied' : 'Share link'}
                </button>
                <button onClick={copyCode} className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white/70 transition-colors active:scale-[0.98]">
                  {copiedCode ? <AnimatedIcon animate="check" active><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5" /></AnimatedIcon>}
                  {copiedCode ? 'Code copied' : 'Copy code'}
                </button>
              </div>
            </motion.div>
          )}
          {panelMode === 'receiving' && (
            <motion.div key="receiving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[22px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">Join a room.</h2>
                <button onClick={handleCancel} className="flex items-center gap-1 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white px-3 py-1.5 rounded-full hover:bg-apple-parchment dark:hover:bg-white/5 active:scale-95 transition-colors"><X className="w-3.5 h-3.5" /> Cancel</button>
              </div>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium mb-5">Enter the code shown on the other device.</p>
              <button onClick={() => setShowQRScan(true)} className="w-full flex items-center justify-center gap-2 px-5 py-3 mb-3 bg-[#6b84f0] hover:bg-[#5a74e8] text-white rounded-full text-[14px] font-semibold min-h-[46px] transition-all duration-150 active:scale-[0.97]">
                <QrCode className="w-4 h-4" /> Scan QR code
              </button>
              <div className="p-6 bg-white dark:bg-[#161e30] border border-apple-divider dark:border-white/10 rounded-[20px] shadow-card">
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={joinError} />
              </div>
              <p className="mt-4 text-[12px] text-apple-ink-muted/60 dark:text-white/35 text-center">Encrypted between devices. Temporary by design.</p>
            </motion.div>
          )}
          {panelMode === 'connected' && (
            <motion.div key="connected" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: EASE }} className="max-w-md mx-auto sm:mx-0">
              <h1 className="text-[36px] sm:text-[44px] lg:text-[56px] font-bold tracking-[-0.04em] leading-[1.05] text-apple-ink dark:text-white text-center sm:text-left">
                Move anything<br />between your devices.
              </h1>
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.25 }} className="mt-6 flex items-center gap-3 p-3.5 bg-status-success/8 border border-status-success/20 rounded-[14px]">
                <div className="w-9 h-9 rounded-full bg-status-success/15 flex items-center justify-center shrink-0">
                  <Check className="w-4.5 h-4.5 text-status-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-apple-ink dark:text-white">Connected</p>
                  <p className="text-[12px] text-apple-ink-muted dark:text-white/50">Share text, photos, and files between your devices.</p>
                </div>
                <button onClick={handleDisconnect} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-medium text-status-danger hover:bg-status-danger/10 transition-all active:scale-95">
                  <LogOut className="w-3.5 h-3.5" /> Disconnect
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Collapsible info — idle only */}
      {panelMode === 'idle' && (
        <div className="shrink-0 px-6 lg:px-10 pb-3 space-y-1.5">
          <InfoSection title="What is it?" expanded={!!infoExpanded['what']} onToggle={() => setInfoExpanded(p => ({ ...p, what: !p.what }))}>
            ShareText lets you move text, photos, and files between your devices. No app needed — just open in any browser. Temporary by design, nothing stored.
          </InfoSection>
          <InfoSection title="How to connect?" expanded={!!infoExpanded['how']} onToggle={() => setInfoExpanded(p => ({ ...p, how: !p.how }))}>
            One device creates a room and shows a 6-digit code. The other device enters that code. That is it — your devices are connected directly.
          </InfoSection>
        </div>
      )}

      {/* Footer */}
      <footer className="shrink-0 px-6 lg:px-10 py-3.5 border-t border-apple-divider/60 dark:border-white/[0.08]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-[12px] text-apple-ink-muted dark:text-white/40">
            <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer" className="hover:text-apple-ink dark:hover:text-white transition-colors" aria-label="Follow on X"><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg></a>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-apple-ink-muted/50 dark:text-white/25">
            <span>No app</span><span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/15" /><span>No account</span><span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/15" /><span>Temporary</span>
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
      "flex flex-col min-h-0 bg-[#fafafe] dark:bg-[#0a0e18]",
      // desktop: fills the right half with a border
      // border handled by parent split container
      // mobile: 9:16 aspect ratio container
      "max-lg:aspect-[9/16] max-lg:w-full max-lg:mx-auto max-lg:rounded-[20px] max-lg:border max-lg:border-apple-divider/50 max-lg:dark:border-white/[0.08] max-lg:overflow-hidden max-lg:shadow-card",
      // fullscreen override on mobile
      mobileRoomFullscreen && "max-lg:!fixed max-lg:inset-0 max-lg:z-50 max-lg:rounded-none max-lg:border-none max-lg:aspect-auto max-lg:shadow-none"
    )}>
      {/* Room header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.06] bg-[#fafafe]/90 dark:bg-[#0a0e18]/90 backdrop-blur-xl z-10">
        <div className="flex items-center gap-2">
          <ShareTextLogo size={14} className="text-azure-600 dark:text-azure-400" />
          <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white/80">Room</span>
          {panelMode === 'connected' && (
            <>
              <span className="w-px h-3 bg-apple-divider dark:bg-white/10" />
              <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-apple-ink-muted dark:text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />Connected
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {panelMode === 'connected' && (
            <div className="flex items-center gap-1.5 mr-1 text-[11px] text-apple-ink-muted dark:text-white/40">
              <PartnerDeviceIcon />
            </div>
          )}
          <button
            onClick={handleDisconnect}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150",
              panelMode === 'connected'
                ? "text-apple-ink-muted dark:text-white/50 hover:text-status-danger hover:bg-status-danger/10"
                : "text-apple-parchment dark:text-white/20 cursor-not-allowed"
            )}
            disabled={panelMode !== 'connected'}
            aria-label="Disconnect"
          >
            <LogOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileRoomFullscreen(!mobileRoomFullscreen)}
            className="lg:hidden flex items-center justify-center w-8 h-8 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/40 dark:hover:bg-white/[0.06] transition-colors"
            aria-label={mobileRoomFullscreen ? 'Minimize' : 'Fullscreen'}
          >
            {mobileRoomFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {/* Room content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {panelMode === 'connected' ? (
          <Suspense fallback={<div className="h-full flex items-center justify-center"><ShareTextLogo size={24} motion="connecting" className="text-azure-600 dark:text-azure-400" /></div>}>
            <ChatView panelMode="embedded" />
          </Suspense>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <motion.div animate={{ scale: [1, 1.05, 1], opacity: [0.25, 0.45, 0.25] }} transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }} className="mb-5 relative">
              <div className="absolute inset-0 rounded-full bg-[#6b84f0]/10 blur-2xl scale-[2.5]" />
              <ShareTextLogo size={48} className="text-[#6b84f0]/40 dark:text-[#8ca4f7]/35 relative z-10" />
            </motion.div>
            <p className="text-[15px] font-semibold text-apple-ink dark:text-white/80 mb-1">
              {panelMode === 'idle' ? 'Connect two devices' : panelMode === 'sending' ? 'Waiting for peer...' : 'Enter the code'}
            </p>
            <p className="text-[12.5px] text-apple-ink-muted/50 dark:text-white/25 max-w-[200px] leading-relaxed">
              {panelMode === 'idle' ? 'Send or receive to start sharing.' : panelMode === 'sending' ? 'The other device will connect once it enters the code.' : 'Once the code is verified, the chat will appear here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  RENDER                                                          */
  /* ---------------------------------------------------------------- */
  return (
    <div className="h-dvh lg:h-dvh overflow-hidden bg-apple-canvas dark:bg-[#0a0e18] dot-bg">
      {/* Desktop: horizontal split */}
      <div className="hidden lg:flex h-full">
        <div className="w-[45%] h-full overflow-y-auto border-r border-black/[0.06] dark:border-white/[0.06]">{leftPanel}</div>
        <div className="w-[55%] h-full">{roomPanel}</div>
      </div>
      {/* Mobile: scrollable column */}
      <div className="lg:hidden h-full overflow-y-auto overscroll-contain">
        <div className="flex flex-col min-h-full pb-4">
          <div className="shrink-0">{leftPanel}</div>
          <div className="shrink-0 px-4 mt-4">{roomPanel}</div>
        </div>
      </div>
      {/* QR scan overlay (for receiving) */}
      <AnimatePresence>
        {showQRScan && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-black/50 dark:bg-black/70 flex items-center justify-center p-4" onClick={() => setShowQRScan(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[360px] bg-white dark:bg-[#161e30] rounded-[24px] p-6 shadow-2xl relative">
              <button onClick={() => setShowQRScan(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors z-10"><X className="w-4 h-4" /></button>
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
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', bounce: 0, duration: 0.35 }} onClick={e => e.stopPropagation()} className="w-full max-w-[340px] bg-white dark:bg-[#161e30] rounded-[24px] p-6 shadow-2xl text-center relative">
              <button onClick={() => setShowQROverlay(false)} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-apple-parchment dark:bg-white/5 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">Open ShareText on your other device, choose <strong className="text-apple-ink dark:text-white">Receive</strong>, then scan.</p>
              <div className="bg-white p-4 rounded-[18px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30"><QROverlayInner value={qrValue} /></div>
              <button onClick={() => setShowQROverlay(false)} className="w-full py-2.5 bg-apple-parchment dark:bg-white/5 hover:bg-apple-divider dark:hover:bg-white/10 rounded-[12px] text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]">Close</button>
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
    <div className="border border-apple-divider/50 dark:border-white/[0.08] rounded-[14px] overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-[14px] font-medium text-apple-ink dark:text-white/80 hover:bg-apple-parchment/50 dark:hover:bg-white/[0.03] transition-colors">
        {title}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}><ChevronDown className="w-4 h-4 text-apple-ink-muted" /></motion.span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
            <p className="px-4 pb-3 text-[13px] text-apple-ink-muted dark:text-white/50 leading-relaxed">{children}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QROverlayInner({ value }: { value: string }) {
  const [Comp, setComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => { import('qrcode.react').then(m => setComp(() => m.QRCodeSVG)); }, []);
  if (!Comp) return <div className="w-[220px] h-[220px] flex items-center justify-center text-[13px] text-apple-ink-muted">Loading...</div>;
  return <Comp value={value} size={220} level="M" />;
}
