import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, QrCode, Check, Share2, ChevronDown, Pencil, Check as CheckIcon, Link2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { generateTOTP } from '../lib/totp';

export function RoomHub() {
  const { session, setDeviceName, requestReconnect } = useSession();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.deviceName);

  if (!session.roomId || !session.secret) return null;

  const shareUrl = `${window.location.origin}?join=${session.roomId}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const shareLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'ShareText', text: 'Join my ShareText session', url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy.
      }
    }
    await copyLink();
  };

  const copyCode = async () => {
    const code = generateTOTP(session.secret!);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) setDeviceName(trimmed.slice(0, 40));
    setEditingName(false);
  };

  const waitingForReconnect = session.connectionType === 'disconnected';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 relative overflow-hidden">
      {/* Brand warmth — a soft azure glow behind the pairing card */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_90%_at_50%_-10%,rgba(46,139,255,0.10),transparent_65%)] pointer-events-none" aria-hidden />
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <ShareTextLogo size={24} className="text-apple-ink dark:text-white" />
        <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
      </div>

      <div className="w-full max-w-sm text-center flex flex-col items-center">

        {waitingForReconnect && (
          <div className="w-full mb-6 px-4 py-3 rounded-[14px] bg-status-warning/10 border border-status-warning/20 text-[14px] font-medium text-status-warning-ink dark:text-status-warning-ink-dark flex flex-col items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse shrink-0" />
              Your other device disconnected. The room is still open — share the code again to rejoin.
            </span>
            <button
              onPointerDown={() => { void requestReconnect(); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-status-warning/15 hover:bg-status-warning/25 text-status-warning-ink dark:text-status-warning-ink-dark font-semibold text-[13px] transition-colors active:scale-95 min-h-[40px]"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reconnect
            </button>
          </div>
        )}

        <div className="w-full mb-8">
          <LiveCodeDisplay secret={session.secret} />
        </div>

        {/* Device name */}
        <div className="flex items-center gap-2 mt-2 mb-8">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                className="px-3 py-1.5 text-[14px] font-medium text-apple-ink dark:text-white bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-apple-tile-3 rounded-[10px] outline-none focus:ring-2 focus:ring-apple-blue/40 w-[160px]"
                maxLength={40}
              />
              <button onPointerDown={commitName} className="p-2 text-apple-blue active:scale-90 transition-transform" aria-label="Save device name">
                <CheckIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onPointerDown={() => { setNameDraft(session.deviceName); setEditingName(true); }}
              className="flex items-center gap-1.5 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors active:scale-95 px-2 py-2 -my-1 -mx-2 min-h-[44px]"
              title="Edit device name"
            >
              <span className="w-6 h-6 rounded-full bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center">
                <Pencil className="w-3 h-3" />
              </span>
              {session.deviceName}
            </button>
          )}
        </div>

        <div className="w-full space-y-3">
          <AnimatePresence mode="popLayout">
            {showQR ? (
              <motion.div
                key="qr"
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[16px] shadow-sm">
                  <div className="bg-white p-3 rounded-[11px] mb-4">
                    <QRCodeSVG value={shareUrl} size={140} />
                  </div>
                  <button
                    onPointerDown={() => setShowQR(false)}
                    className="text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors px-4 py-2 min-h-[44px] flex items-center"
                  >
                    Hide QR Code
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="show-qr"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onPointerDown={() => setShowQR(true)}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 hover:bg-apple-parchment dark:hover:bg-surface-dark-2 rounded-[14px] transition-colors active:scale-[0.98] shadow-sm"
              >
                <div className="flex items-center gap-3 text-[15px] font-medium text-apple-ink dark:text-white">
                  <QrCode className="w-5 h-5 text-apple-ink-muted" />
                  Show QR Code
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <button
            onPointerDown={shareLink}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 hover:bg-apple-parchment dark:hover:bg-surface-dark-2 rounded-[14px] transition-colors active:scale-[0.98] shadow-sm"
          >
            <div className="flex items-center gap-3 text-[15px] font-medium text-apple-ink dark:text-white">
              {copiedLink ? <Check className="w-5 h-5 text-status-success" /> : (navigator.share ? <Share2 className="w-5 h-5 text-apple-ink-muted" /> : <Link2 className="w-5 h-5 text-apple-ink-muted" />)}
              {copiedLink ? 'Copied Link' : (navigator.share ? 'Share Nearby' : 'Copy Link')}
            </div>
          </button>
        </div>

        <button
          onPointerDown={copyCode}
          className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-linear-to-r from-azure-500 to-azure-700 text-white rounded-full text-[14px] font-semibold shadow-[0_8px_20px_rgba(46,139,255,0.35)] transition-transform active:scale-[0.97] min-h-[44px]"
        >
          {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedCode ? 'Code copied' : 'Copy Code'}
        </button>

        <p className="text-[13px] text-apple-ink-muted mt-6">
          This room stays open for hours — you can rejoin anytime.
        </p>

        <button
          onPointerDown={() => setShowHow(!showHow)}
          className="flex items-center gap-1 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors mt-2 active:scale-95 px-3 py-2 min-h-[44px]"
        >
          How this works
          <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showHow && "rotate-180")} />
        </button>
        <AnimatePresence>
          {showHow && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden w-full max-w-sm"
            >
              <div className="mt-3 p-4 bg-apple-parchment dark:bg-apple-tile-1 rounded-[14px] text-left text-[13px] text-apple-ink-muted leading-relaxed space-y-2">
                <p>This room disappears automatically after a period of inactivity. Once it ends, the code stops working and the room can't be reopened.</p>
                <p>Text is encrypted between devices. When a direct connection isn't possible, an encrypted relay is used — your text is not readable by the relay.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
