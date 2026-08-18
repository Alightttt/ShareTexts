import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { ChevronLeft, Loader2, QrCode, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';

// html5-qrcode is heavy — load it only when the user opens the scanner.
const QRScanner = lazy(() => import('../components/QRScanner').then(m => ({ default: m.QRScanner })));

export function JoinSession({ onBack }: { onBack: () => void }) {
  const { joinWithCode, joinWithLink, joinWithShortCode } = useSession();
  const [activeTab, setActiveTab] = useState<'code' | 'qr' | 'linkConfirm'>('code');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  // A stable /s/<code> share link (vs a full ?join= UUID).
  const [pendingShortCode, setPendingShortCode] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const joinId = searchParams.get('join');
    // /s/<code> — the short share-link form.
    const pathMatch = window.location.pathname.match(/^\/s\/([0-9a-f]{8})$/i);
    const shortCode = pathMatch ? pathMatch[1].toLowerCase() : null;
    if (joinId) {
      setPendingLink(joinId);
      setActiveTab('linkConfirm');
      // Clean up URL visually
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (shortCode) {
      setPendingShortCode(shortCode);
      setActiveTab('linkConfirm');
      window.history.replaceState({}, document.title, '/');
    }
  }, []);

  const handleCodeComplete = async (code: string) => {
    setIsJoining(true);
    setError(null);
    // Safety timeout: 8s bounded verification. The user must never be stuck
    // on "Verifying code…" — invalid, expired, or network-error all resolve
    // within this window.
    const safetyTimer = setTimeout(() => {
      setIsJoining(false);
      setError("This is taking longer than expected. Check your connection or try the latest code.");
    }, 8000);
    try {
      const res = await joinWithCode(code);
      clearTimeout(safetyTimer);
      if (!res.success) {
        const friendly =
          res.code === 'ROOM_FULL' || res.error === 'This room already has two devices.'
            ? 'This room already has two devices. Only two can connect at once.'
            : res.code === 'RATE_LIMITED' || res.error === 'Too many attempts. Try again later.'
              ? 'Too many attempts. Wait a moment and try again.'
              : res.error === "Couldn't reach ShareText."
                ? "Couldn't reach ShareText. Check your connection and try again."
                : "That code isn't active. Check the other device and enter its latest six-digit code.";
        setError(friendly);
        setIsJoining(false);
      }
    } catch {
      clearTimeout(safetyTimer);
      setError("Couldn't reach ShareText. Check your connection and try again.");
      setIsJoining(false);
    }
  };

  const handleLinkJoin = async (idToJoin: string) => {
    setIsJoining(true);
    setError(null);
    const safetyTimer = setTimeout(() => {
      setIsJoining(false);
      setError("This is taking longer than expected. Check your connection or try again.");
    }, 8000);
    let id = idToJoin;
    if (id.includes('?join=')) {
      id = id.split('?join=')[1];
    }
    try {
      const res = await joinWithLink(id);
      clearTimeout(safetyTimer);
      if (!res.success) {
        const friendly =
          res.code === 'ROOM_FULL' || res.error === 'This room already has two devices.'
            ? 'This room already has two devices.'
            : res.code === 'RATE_LIMITED' || res.error === 'Too many attempts. Try again later.'
              ? res.error
              : "This link isn't active anymore. Ask for a fresh code.";
        setError(friendly);
        setIsJoining(false);
        setActiveTab('code'); // fallback
      }
    } catch {
      clearTimeout(safetyTimer);
      setError("Couldn't reach ShareText. Check your connection and try again.");
      setIsJoining(false);
    }
  };

  // Join via a short /s/<code> link (from the path or a scanned QR).
  const handleShortJoin = async (code: string) => {
    setIsJoining(true);
    setError(null);
    const safetyTimer = setTimeout(() => {
      setIsJoining(false);
      setError("This is taking longer than expected. Check your connection or try again.");
    }, 8000);
    try {
      const res = await joinWithShortCode(code);
      clearTimeout(safetyTimer);
      if (!res.success) {
        setError(res.error || "This link isn't active anymore. Ask for a fresh code.");
        setIsJoining(false);
        setActiveTab('code'); // fallback
      }
    } catch {
      clearTimeout(safetyTimer);
      setError("Couldn't reach ShareText. Check your connection and try again.");
      setIsJoining(false);
    }
  };

  const handleQRScan = (text: string) => {
    // Accept any link form a QR might hold: a /s/<code> share link, a
    // ?join=<uuid> link, or a bare room id.
    const short = text.match(/\/s\/([0-9a-f]{8})/i);
    if (short) { void handleShortJoin(short[1]); return; }
    handleLinkJoin(text);
  };

  const handleConfirm = () => {
    if (pendingShortCode) { void handleShortJoin(pendingShortCode); }
    else if (pendingLink) { void handleLinkJoin(pendingLink); }
  };

  return (
    <div className="flex flex-col min-h-screen bg-apple-canvas dark:bg-night-950 p-6 relative selection:bg-apple-blue/20 sm:justify-center overflow-hidden">
      {/* Ambient azure warmth at the top — the same soft glow as the connect screen */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_90%_at_50%_-10%,rgba(46,139,255,0.10),transparent_65%)] pointer-events-none" aria-hidden />
      <div className="absolute top-6 left-6 flex items-center">
        <button 
          onPointerDown={onBack}
          className="flex items-center gap-1 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors text-[14px] font-medium active:scale-95 px-2 py-2 -m-2 min-h-[44px]"
        >
          <ChevronLeft className="w-5 h-5 -ml-1" /> Cancel
        </button>
      </div>

      <div className="absolute top-5 right-5 flex items-center gap-1">
        <div className="hidden sm:flex items-center gap-2 mr-1">
          <ShareTextLogo size={24} className="text-apple-ink dark:text-white" />
          <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col items-center mt-24 sm:mt-4">
        
        <div className="w-full mb-12 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="w-full flex justify-center"
            >
              {activeTab === 'code' && (
                <div className="w-full flex flex-col items-center">
                  {/* Task-first card with clear hierarchy */}
                  <div className="w-full p-6 sm:p-8 bg-white dark:bg-[#13161B] border border-[#E3E5E8] dark:border-[#272D36] rounded-[22px] shadow-[0_16px_48px_rgba(18,31,53,0.10)] dark:shadow-[0_20px_64px_rgba(0,0,0,0.28)]">
                    {/* Header */}
                    <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#17191D] dark:text-[#F4F6F8] tracking-[-0.025em] mb-2 text-center">
                      Join a ShareTexts room
                    </h1>
                    <p className="text-[14px] text-[#6E737B] dark:text-[#9BA3AE] font-medium mb-8 text-center">
                      Enter the six-digit code shown on the other device.
                    </p>
                    
                    {/* Code input */}
                    <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={error} />
                    
                    {/* Trust cues */}
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] font-medium text-[#6E737B] dark:text-[#9BA3AE]">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1C9A61] dark:bg-[#55D18C]" />
                        Encrypted connection
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#0A66F0] dark:bg-[#4B8DFF]" />
                        No account needed
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'qr' && (
                <div className="w-full max-w-sm">
                  <Suspense fallback={
                    <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px] text-center min-h-[300px]">
                      <ShareTextLogo size={30} motion="connecting" className="text-apple-blue mb-4" />
                      <p className="text-[15px] font-medium text-apple-ink-muted">Starting camera…</p>
                    </div>
                  }>
                    <QRScanner onScan={handleQRScan} onErrorFallback={() => setActiveTab('code')} />
                  </Suspense>
                </div>
              )}
              {activeTab === 'linkConfirm' && (
                <div className="flex flex-col items-center p-8 bg-white dark:bg-surface-dark rounded-[24px] w-full text-center border border-apple-divider dark:border-apple-tile-3 shadow-sm">
                  <h3 className="text-[21px] font-semibold text-apple-ink dark:text-white mb-2 tracking-tight">Connect to this device?</h3>
                  <div className="mb-8">
                    <p className="text-[15px] text-apple-ink-muted">You’re about to connect to another device. It’s temporary — nothing is stored anywhere.</p>
                  </div>
                  
                  <button 
                    onPointerDown={handleConfirm}
                    disabled={isJoining || (!pendingLink && !pendingShortCode)}
                    className="w-full py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.98] flex items-center justify-center gap-2 shadow-card hover:shadow-float disabled:opacity-60"
                  >
                    {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Connect'}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {activeTab !== 'linkConfirm' && (
          <div className="mt-4 flex justify-center w-full">
            {activeTab === 'code' ? (
              <button 
                onPointerDown={() => { setActiveTab('qr'); setError(null); }}
                className="flex items-center gap-2 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-motion bg-apple-parchment dark:bg-surface-dark px-4 py-2.5 rounded-[10px] border border-apple-divider/50 dark:border-white/5 min-h-[44px]"
              >
                <QrCode className="w-4 h-4" /> Scan QR instead
              </button>
            ) : (
              <button 
                onPointerDown={() => { setActiveTab('code'); setError(null); }}
                className="flex items-center gap-2 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-motion bg-apple-parchment dark:bg-surface-dark px-4 py-2.5 rounded-[10px] border border-apple-divider/50 dark:border-white/5 min-h-[44px]"
              >
                <Keyboard className="w-4 h-4" /> Enter code manually
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
