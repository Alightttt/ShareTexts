import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { ChevronLeft, Loader2, QrCode, Keyboard, Check, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { cn } from '../lib/utils';

const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));

type JoinPhase = 'input' | 'connecting' | 'establishing' | 'connected' | 'error';

export function JoinSession({ onBack }: { onBack: () => void }) {
  const { joinWithCode, joinWithLink, joinWithShortCode, session } = useSession();
  const [activeTab, setActiveTab] = useState<'code' | 'qr' | 'linkConfirm'>('code');
  const [phase, setPhase] = useState<JoinPhase>('input');
  const [error, setError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const [pendingShortCode, setPendingShortCode] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const joinId = searchParams.get('join');
    const pathMatch = window.location.pathname.match(/^\/s\/([0-9a-f]{8})$/i);
    const shortCode = pathMatch ? pathMatch[1].toLowerCase() : null;
    if (joinId) {
      setPendingLink(joinId);
      setActiveTab('linkConfirm');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (shortCode) {
      setPendingShortCode(shortCode);
      setActiveTab('linkConfirm');
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  // Watch for successful connection → show success state
  useEffect(() => {
    if (session.partnerConnected && (phase === 'connecting' || phase === 'establishing')) {
      setPhase('connected');
      setProgressText(`Connected to ${session.partnerName || 'the other device'}`);
    }
  }, [session.partnerConnected, phase, session.partnerName]);

  // Progress stepper during connection — fast, no artificial delays
  const simulateProgress = () => {
    setPhase('connecting');
    setProgressText('Connecting…');
    setTimeout(() => {
      if (phase === 'connecting' || phase === 'input') {
        setPhase('establishing');
        setProgressText('Establishing secure connection…');
      }
    }, 1200);
  };

  const handleCodeComplete = async (code: string) => {
    setError(null);
    simulateProgress();
    const safetyTimer = setTimeout(() => {
      setPhase('error');
      setError("This is taking longer than expected. Check your connection or try the latest code.");
    }, 8000);
    try {
      const res = await joinWithCode(code);
      clearTimeout(safetyTimer);
      if (!res.success) {
        setPhase('error');
        const friendly =
          res.code === 'ROOM_FULL' ? 'This room already has two devices. Only two can connect at once.'
          : res.code === 'RATE_LIMITED' ? 'Too many attempts. Wait a moment and try again.'
          : "That code isn't active. Check the other device and enter the latest code.";
        setError(friendly);
      }
    } catch {
      clearTimeout(safetyTimer);
      setPhase('error');
      setError("Couldn't reach ShareText. Check your connection and try again.");
    }
  };

  const handleLinkJoin = async (idToJoin: string) => {
    setError(null);
    simulateProgress();
    const safetyTimer = setTimeout(() => {
      setPhase('error');
      setError("This is taking longer than expected. Try again.");
    }, 8000);
    let id = idToJoin;
    if (id.includes('?join=')) id = id.split('?join=')[1];
    try {
      const res = await joinWithLink(id);
      clearTimeout(safetyTimer);
      if (!res.success) {
        setPhase('error');
        setError(res.code === 'ROOM_FULL' ? 'This room already has two devices.' : "This link isn't active anymore. Ask for a fresh code.");
      }
    } catch {
      clearTimeout(safetyTimer);
      setPhase('error');
      setError("Couldn't reach ShareText. Check your connection and try again.");
    }
  };

  const handleShortJoin = async (code: string) => {
    setError(null);
    simulateProgress();
    const safetyTimer = setTimeout(() => {
      setPhase('error');
      setError("This is taking longer than expected. Try again.");
    }, 10000);
    try {
      const res = await joinWithShortCode(code);
      clearTimeout(safetyTimer);
      if (!res.success) {
        setPhase('error');
        setError(res.error || "This link isn't active anymore. Ask for a fresh code.");
      }
    } catch {
      clearTimeout(safetyTimer);
      setPhase('error');
      setError("Couldn't reach ShareText. Check your connection and try again.");
    }
  };

  const handleQRScan = (text: string) => {
    const short = text.match(/\/s\/([0-9a-f]{8})/i);
    if (short) { void handleShortJoin(short[1]); return; }
    handleLinkJoin(text);
  };

  const handleConfirm = () => {
    if (pendingShortCode) void handleShortJoin(pendingShortCode);
    else if (pendingLink) void handleLinkJoin(pendingLink);
  };

  const resetToInput = () => {
    setPhase('input');
    setError(null);
    setActiveTab('code');
  };

  return (
    <div data-app-state="receiver-entering-code" className="flex flex-col min-h-screen bg-apple-canvas dark:bg-night-950 p-6 relative selection:bg-azure-600/20 sm:justify-center overflow-hidden">


      {/* Back */}
      <div className="absolute top-5 left-5 z-10">
        <button onPointerDown={onBack} className="flex items-center gap-1 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors text-[14px] font-medium active:scale-95 px-2 py-2 -m-2 min-h-[44px]">
          <ChevronLeft className="w-5 h-5 -ml-1" /> Cancel
        </button>
      </div>

      {/* Theme */}
      <div className="absolute top-5 right-5 z-10">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col items-center mt-20 sm:mt-4">
        <AnimatePresence mode="wait">
          {/* ═══ INPUT PHASE — code entry or QR ═══ */}
          {phase === 'input' && activeTab === 'code' && (
            <motion.div key="code" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="w-full flex justify-center">
              <div className="w-full p-6 sm:p-8 bg-white dark:bg-[#13161B] border border-[#E3E5E8] dark:border-[#272D36] rounded-[22px] shadow-[0_16px_48px_rgba(18,31,53,0.10)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.28)]">
                <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#17191D] dark:text-[#F4F6F8] tracking-[-0.025em] mb-2 text-center">
                  Join a ShareText room
                </h1>
                <p className="text-[14px] text-[#6E737B] dark:text-[#9BA3AE] font-medium mb-8 text-center">
                  Enter the six-digit code shown on the other device.
                </p>
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={false} error={error} />
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] font-medium text-[#6E737B] dark:text-[#9BA3AE]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1C9A61] dark:bg-[#55D18C]" /> Encrypted
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-azure-600 dark:bg-azure-400" /> No account
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'input' && activeTab === 'qr' && (
            <motion.div key="qr" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }} className="w-full max-w-sm">
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px] text-center min-h-[300px]">
                  <ShareTextLogo size={30} motion="connecting" className="text-azure-600 mb-4" />
                  <p className="text-[15px] font-medium text-apple-ink-muted">Starting camera…</p>
                </div>
              }>
                <QRScanner onScan={handleQRScan} onErrorFallback={() => setActiveTab('code')} />
              </Suspense>
            </motion.div>
          )}

          {phase === 'input' && activeTab === 'linkConfirm' && (
            <motion.div key="link" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center p-8 bg-white dark:bg-surface-dark rounded-[22px] border border-apple-divider dark:border-apple-tile-3 shadow-sm text-center">
              <h3 className="text-[21px] font-semibold text-apple-ink dark:text-white mb-2 tracking-tight">Connect to this device?</h3>
              <p className="text-[14px] text-apple-ink-muted mb-8">The session is temporary — a handoff, not a history.</p>
              <button onPointerDown={handleConfirm} disabled={!pendingLink && !pendingShortCode}
                className="w-full py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[10px] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 min-h-[48px] transition-all duration-150">
                Connect
              </button>
            </motion.div>
          )}

          {/* ═══ CONNECTING PHASE — progress stepper ═══ */}
          {(phase === 'connecting' || phase === 'establishing') && (
            <motion.div key="progress" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="w-full flex flex-col items-center p-8 bg-white dark:bg-[#13161B] border border-[#E3E5E8] dark:border-[#272D36] rounded-[22px] shadow-[0_16px_48px_rgba(18,31,53,0.10)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.28)] text-center">
              {/* Animated logo */}
              <div className="mb-6">
                <ShareTextLogo size={48} motion="connecting" className="text-azure-600" />
              </div>
              {/* Progress steps */}
              <div className="space-y-3 w-full max-w-[240px]">
                <ProgressStep label="Connecting" active={phase === 'connecting'} done={phase === 'establishing' || phase === 'connected'} />
                <ProgressStep label="Establishing secure connection" active={phase === 'establishing'} done={phase === 'connected'} />
                <ProgressStep label="Connected" active={phase === 'connected'} done={false} />
              </div>
              <p className="mt-5 text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">{progressText}</p>
            </motion.div>
          )}

          {/* ═══ CONNECTED PHASE — success ═══ */}
          {phase === 'connected' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full flex flex-col items-center p-8 bg-white dark:bg-[#13161B] border border-[#E3E5E8] dark:border-[#272D36] rounded-[22px] shadow-[0_16px_48px_rgba(18,31,53,0.10)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.28)] text-center">
              <div className="w-14 h-14 rounded-full bg-status-success/15 flex items-center justify-center mb-4">
                <Check className="w-7 h-7 text-status-success" strokeWidth={2.5} />
              </div>
              <h2 className="text-[20px] font-semibold text-apple-ink dark:text-white mb-1">
                Connected to {session.partnerName || 'the other device'}
              </h2>
              <p className="text-[14px] text-apple-ink-muted dark:text-white/55">
                You can now send text, photos, links, and files.
              </p>
            </motion.div>
          )}

          {/* ═══ ERROR PHASE ═══ */}
          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="w-full flex flex-col items-center p-8 bg-white dark:bg-[#13161B] border border-[#E3E5E8] dark:border-[#272D36] rounded-[22px] shadow-[0_16px_48px_rgba(18,31,53,0.10)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.28)] text-center">
              <div className="w-14 h-14 rounded-full bg-status-danger/10 flex items-center justify-center mb-4">
                <Wifi className="w-7 h-7 text-status-danger" />
              </div>
              <h2 className="text-[20px] font-semibold text-apple-ink dark:text-white mb-2">Couldn't connect</h2>
              <p className="text-[14px] text-apple-ink-muted dark:text-white/55 mb-6 max-w-[280px]">{error}</p>
              <button onPointerDown={resetToInput}
                className="px-6 py-3 bg-azure-600 hover:bg-azure-500 text-white rounded-[10px] text-[14px] font-semibold min-h-[44px] transition-all duration-150">
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab switcher — only on input phase */}
        {phase === 'input' && activeTab !== 'linkConfirm' && (
          <div className="mt-4 flex justify-center w-full">
            {activeTab === 'code' ? (
              <button onPointerDown={() => { setActiveTab('qr'); setError(null); }}
                className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-motion bg-apple-parchment dark:bg-surface-dark px-4 py-2.5 rounded-[10px] border border-apple-divider/50 dark:border-white/5 min-h-[44px]">
                <QrCode className="w-4 h-4" /> Scan QR instead
              </button>
            ) : (
              <button onPointerDown={() => { setActiveTab('code'); setError(null); }}
                className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-motion bg-apple-parchment dark:bg-surface-dark px-4 py-2.5 rounded-[10px] border border-apple-divider/50 dark:border-white/5 min-h-[44px]">
                <Keyboard className="w-4 h-4" /> Enter code manually
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
        done ? "bg-status-success" : active ? "bg-azure-600" : "bg-apple-divider dark:bg-apple-tile-3"
      )}>
        {done ? <Check className="w-3 h-3 text-white" strokeWidth={3} /> : active && <Loader2 className="w-3 h-3 text-white animate-spin" />}
      </div>
      <span className={cn(
        "text-[13px] font-medium transition-colors",
        done ? "text-status-success" : active ? "text-apple-ink dark:text-white" : "text-apple-ink-muted/50 dark:text-white/30"
      )}>
        {label}
      </span>
    </div>
  );
}
