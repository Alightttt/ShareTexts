import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, QrCode, Check, ChevronLeft, Pencil, Link2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, shortCodeOf } from '../lib/utils';
import { AnimatedIcon } from '../components/AnimatedIcon';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';

export function RoomHub() {
  const { session, setDeviceName, abandonSession } = useSession();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.deviceName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [, setQrTick] = useState(0);

  // Compute QR values — safe to call even when session is incomplete;
  // generateTOTP returns '' for empty secret. These MUST be declared before
  // the early return to satisfy Rules of Hooks (all hooks run every render).
  const shareUrl = session.roomId ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}` : '';
  const qrCode = session.secret ? generateTOTP(session.secret, session.createdAt) : '';
  const qrValue = qrCode ? `${shareUrl}?c=${qrCode}` : '';

  // QR auto-refresh on the pairing-code boundary
  useEffect(() => {
    if (!showQR || !session.roomId || !session.secret) return;
    const waitMs = Math.max(300, getTOTPRemainingSeconds(session.createdAt) * 1000 + 60);
    const t = setTimeout(() => setQrTick(x => x + 1), waitMs);
    return () => clearTimeout(t);
  }, [showQR, qrCode, session.createdAt]);

  // Early return AFTER all hooks — Rules of Hooks require all hooks to run
  // every render. Returning before hooks causes React to crash.
  if (!session.roomId || !session.secret) return null;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedLink(true);
    setCopyStatus('Link copied');
    setTimeout(() => { setCopiedLink(false); setCopyStatus(null); }, 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'ShareText', url: shareUrl }); return; } catch { /* fall through */ }
    }
    await copyLink();
  };

  const copyCode = async () => {
    const code = generateTOTP(session.secret!, session.createdAt);
    try { await navigator.clipboard.writeText(code); } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    setCopyStatus('Code copied');
    setTimeout(() => { setCopiedCode(false); setCopyStatus(null); }, 2000);
  };

  const commitName = () => {
    const trimmed = nameDraft.trim().replace(/\s+/g, ' ');
    if (!trimmed) { setNameError('Enter a name'); return; }
    setNameError(null);
    setDeviceName(trimmed.slice(0, 32));
    setEditingName(false);
  };

  const waitingForReconnect = session.connectionType === 'disconnected' && !session.partnerConnecting;

  // Focus trap for QR dialog + Escape key
  const qrCloseRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showQR) {
      const raf = requestAnimationFrame(() => qrCloseRef.current?.focus());
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowQR(false); };
      window.addEventListener('keydown', onKey);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
    }
  }, [showQR]);

  return (
    <div data-testid="room-shell" data-app-state="sender-waiting" className="min-h-screen flex flex-col bg-apple-canvas dark:bg-night-950 relative overflow-hidden">
      {/* Header */}
      <header className="relative z-10 flex items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-5 bg-apple-canvas/80 dark:bg-night-950/80 backdrop-blur-xl backdrop-saturate-150">
        <button onPointerDown={abandonSession} aria-label="Back to home" className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-1 active:scale-95 transition-motion">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShareTextLogo size={22} className="text-apple-ink dark:text-white" />
          <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="ml-auto"><ThemeToggle /></div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-6 sm:py-10 w-full">
        <div className="w-full max-w-sm text-center flex flex-col items-center">

          {/* Reconnect banner */}
          <AnimatePresence>
            {waitingForReconnect && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="w-full mb-6 overflow-hidden">
                <div className="px-4 py-3 rounded-[14px] bg-status-warning/10 border border-status-warning/20 text-[13px] font-medium text-status-warning-ink dark:text-status-warning-ink-dark text-center">
                  Your other device disconnected. Share the code again to reconnect.
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── HEADING ── */}
          <h1 className="text-[20px] sm:text-[26px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] mb-1.5">
            Connect your other device.
          </h1>
          <p className="text-[13px] sm:text-[14px] text-apple-ink-muted dark:text-white/55 font-medium mb-5 sm:mb-6">
            Open ShareText on the other device and enter this code.
          </p>

          {/* ── PAIRING CODE — the hero element ── */}
          <div data-testid="pairing-code" className="mb-4">
            <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />
          </div>

          {/* Connecting animation */}
          <AnimatePresence>
            {session.partnerConnecting && !session.partnerConnected && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden mb-4">
                <p role="status" className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60 flex items-center justify-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-apple-blue animate-pulse" />
                  {session.connectionType === 'establishing' ? 'Establishing secure connection…' : 'Connecting…'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── PRIMARY ACTIONS ── */}
          <div className="w-full space-y-2.5 mt-1">
            {/* Show QR — dominant action */}
            <button data-testid="room-show-qr" onPointerDown={() => setShowQR(true)} style={{ touchAction: 'manipulation' }}
              className="w-full flex items-center justify-center gap-2 px-5 py-3 sm:py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[10px] text-[14px] sm:text-[15px] font-semibold min-h-[46px] sm:min-h-[48px] transition-all duration-150 hover:opacity-90">
              <QrCode className="w-4 h-4" /> Show QR
            </button>

            {/* Share link — secondary */}
            <button data-testid="room-share-link" onPointerDown={shareLink} style={{ touchAction: 'manipulation' }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 sm:py-3 bg-white dark:bg-surface-dark border border-apple-divider/60 dark:border-apple-tile-3 hover:bg-apple-parchment dark:hover:bg-surface-dark-2 rounded-[12px] text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.97] min-h-[44px]">
              {copiedLink ? <AnimatedIcon animate="check" active={copiedLink}><Check className="w-4 h-4 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="link"><Link2 className="w-4 h-4 text-apple-ink-muted" /></AnimatedIcon>}
              {copiedLink ? 'Copied' : 'Share link'}
            </button>

            {/* ── OR separator ── */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-apple-divider/60 dark:bg-white/[0.08]" />
              <span className="text-[12px] font-medium text-apple-ink-muted/50 dark:text-white/30 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-apple-divider/60 dark:bg-white/[0.08]" />
            </div>

            {/* Copy code — least important action */}
            <button data-testid="room-copy-code" onPointerDown={copyCode}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white/70 transition-colors active:scale-[0.98]">
              {copiedCode ? <AnimatedIcon animate="check" active={copiedCode}><Check className="w-3.5 h-3.5 text-status-success" /></AnimatedIcon> : <AnimatedIcon animate="copy"><Copy className="w-3.5 h-3.5" /></AnimatedIcon>}
              {copiedCode ? 'Code copied' : 'Copy code'}
            </button>
          </div>

          {/* ── DEVICE NAME — quiet, below actions ── */}
          <div className="mt-5">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={nameDraft} onChange={(e) => { setNameDraft(e.target.value); setNameError(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                  className={cn("px-3 py-1.5 text-[13px] font-medium text-apple-ink dark:text-white bg-white dark:bg-apple-tile-1 border rounded-[8px] outline-none focus:ring-2 w-[140px]",
                    nameError ? 'border-status-danger focus:ring-status-danger/40' : 'border-apple-divider dark:border-apple-tile-3 focus:ring-azure-600/40')}
                  maxLength={32} placeholder="My phone" />
                <button onPointerDown={commitName} className="text-[13px] font-medium text-azure-600 hover:text-azure-700 active:scale-95 px-2 py-1">Save</button>
                <button onPointerDown={() => setEditingName(false)} className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 px-2 py-1">Cancel</button>
              </div>
            ) : (
              <button onPointerDown={() => { setNameDraft(session.deviceName); setEditingName(true); }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-apple-ink-muted/70 hover:text-apple-ink dark:hover:text-white/60 transition-colors active:scale-95">
                <Pencil className="w-3 h-3" />
                {session.deviceName}
              </button>
            )}
          </div>

          {/* ── PRIVACY NOTE — quiet but accessible ── */}
          <p className="text-[12px] text-apple-ink-muted/60 dark:text-white/35 mt-4 max-w-[280px] leading-relaxed">
            Temporary by design. Encrypted between devices. Room closes when you leave.
          </p>

          {/* Screen reader live region */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">{copyStatus}</div>
        </div>
      </main>

      {/* ═══ QR DIALOG — bounded panel, not inline expansion ═══ */}
      <AnimatePresence>
        {showQR && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60 flex items-center justify-center p-6"
            onPointerDown={() => setShowQR(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] bg-white dark:bg-surface-dark rounded-[20px] p-6 shadow-2xl text-center relative">
              {/* Close */}
              <button ref={qrCloseRef} data-testid="qr-close" onPointerDown={() => setShowQR(false)} aria-label="Close QR code" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-apple-blue">
                <X className="w-4 h-4" />
              </button>
              {/* Clear step-by-step instruction */}
              <p className="text-[13px] text-apple-ink-muted dark:text-white/60 mb-4 leading-relaxed">
                Open ShareText on your other device,<br/>choose <strong className="text-apple-ink dark:text-white">Receive</strong>, then scan this code.
              </p>
              {/* QR code — bigger for easier scanning */}
              <div className="bg-white p-4 rounded-[18px] inline-flex items-center justify-center mb-4 shadow-sm border border-apple-divider/30">
                <QRCodeSVG value={qrValue} size={220} level="M" />
              </div>
              {/* Expiry + manual code fallback */}
              <p className="text-[11px] text-apple-ink-muted/60 dark:text-white/40 mb-3">
                Code refreshes automatically. If QR doesn't scan, use the 6-digit code on the previous screen.
              </p>
              <button onPointerDown={() => setShowQR(false)}
                className="w-full py-2.5 bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 rounded-[10px] text-[13px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]">
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Inline TOTP imports (same as before)
import { generateTOTP, getTOTPRemainingSeconds } from '../lib/totp';
