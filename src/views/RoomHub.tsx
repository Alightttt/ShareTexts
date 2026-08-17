import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, QrCode, Check, Share2, ChevronDown, ChevronLeft, Pencil, Check as CheckIcon, Link2, RefreshCw, Terminal, ShieldAlert, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, shortCodeOf, formatBytes } from '../lib/utils';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { ConnectingVisual } from '../components/ConnectingVisual';
import { generateTOTP, getTOTPRemainingSeconds } from '../lib/totp';
import { pushEndpoint } from '../lib/socket';

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export function RoomHub() {
  const { session, setDeviceName, requestReconnect, abandonSession, refreshCode } = useSession();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const [showPush, setShowPush] = useState(false);
  const [copiedTextCmd, setCopiedTextCmd] = useState(false);
  const [copiedFileCmd, setCopiedFileCmd] = useState(false);
  // QR re-renders on every pairing-code boundary so the scannable code is
  // always the CURRENT one (the short link inside stays stable — the code
  // query param just rotates with the 40s window).
  const [, setQrTick] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(session.deviceName);

  // Fresh-code rule: the timer always starts when the creator arrives at this
  // screen. A fresh create already anchors at ~40s; a refresh mid-window or a
  // resume of a stale room re-anchors now, so the countdown restarts at ~40s
  // with a newly-made code instead of rotating seconds later. Safe: the
  // previous code stays valid for one more window (±1 TOTP validation), so a
  // joiner who already typed it still connects. Runs once per arrival.
  useEffect(() => {
    if (session.isCreator && session.roomId && session.secret) {
      void refreshCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // QR auto-refresh on the pairing-code boundary. Declared BEFORE the early
  // return below — RoomHub can re-render with a cleared session during the
  // exit transition, and a hook after a conditional return would change the
  // hook count and crash React ("Rendered fewer hooks than expected").
  const shareUrl = session.roomId ? `${window.location.origin}/s/${shortCodeOf(session.roomId)}` : '';
  const qrCode = session.secret ? generateTOTP(session.secret, session.createdAt) : '';
  const qrValue = shareUrl ? `${shareUrl}?c=${qrCode}` : '';
  useEffect(() => {
    if (!showQR || !session.roomId || !session.secret) return;
    const waitMs = Math.max(300, getTOTPRemainingSeconds(session.createdAt) * 1000 + 60);
    const t = setTimeout(() => setQrTick(x => x + 1), waitMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showQR, qrCode, session.createdAt]);

  if (!session.roomId || !session.secret) return null;

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
    const code = generateTOTP(session.secret!, session.createdAt);
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

  // "Peer was connected and dropped" — NOT the fresh-connect flow. During the
  // initial handshake the transport can briefly read 'disconnected' while the
  // WebRTC/relay path is still coming up; showing the orange rejoin banner then
  // is noise. Hide it whenever the joiner is actively connecting.
  const waitingForReconnect = session.connectionType === 'disconnected' && !session.partnerConnecting;

  return (
    <div className="min-h-screen flex flex-col bg-apple-canvas dark:bg-black relative overflow-hidden">
      {/* Brand warmth — a soft azure glow behind the pairing card */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_90%_at_50%_-10%,rgba(46,139,255,0.10),transparent_65%)] pointer-events-none" aria-hidden />

      {/* Header in normal flow — never overlaps the centered content, even on
          short screens (the old absolute header collided with the heading on
          small phones). */}
      <header className="relative z-10 flex items-center gap-2 px-4 sm:px-6 pt-4 sm:pt-6">
        <button
          onPointerDown={abandonSession}
          aria-label="Back to home"
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-parchment dark:hover:bg-apple-tile-1 active:scale-95 transition-motion"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <ShareTextLogo size={24} className="text-apple-ink dark:text-white" />
          <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
        </div>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 sm:py-10 w-full">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-lg text-center flex flex-col items-center">

        {waitingForReconnect && (
          <div className="w-full mb-6 px-4 py-3 rounded-[14px] bg-status-warning/10 border border-status-warning/20 text-[14px] font-medium text-status-warning-ink dark:text-status-warning-ink-dark flex flex-col items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-status-warning animate-pulse shrink-0" />
              Your other device disconnected. This page is still open — share the code again to connect it.
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
          <h1 className="text-[24px] sm:text-[26px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em] mb-1.5">
            Connect your other device.
          </h1>
          <p className="text-[14px] text-apple-ink-muted dark:text-white/55 font-medium mb-1">
            Open ShareText on the other device and enter this code.
          </p>
          <p className="text-[12.5px] text-apple-ink-muted/80 dark:text-white/40 font-medium mb-6">
            No app to install. No account. Any two devices with a browser.
          </p>
          <LiveCodeDisplay secret={session.secret} createdAt={session.createdAt} />

          {/* The joiner arrived — the same connecting animation the joiner's
              own screen shows, so both devices tell the same story while the
              handshake runs. */}
          <AnimatePresence>
            {session.partnerConnecting && !session.partnerConnected && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden flex flex-col items-center"
              >
                <ConnectingVisual className="mt-5" />
                <p role="status" className="mt-3 text-[14px] font-medium text-apple-ink-muted dark:text-white/60">
                  {session.connectionType === 'establishing' ? 'Establishing secure connection…' : 'Connecting to your other device…'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onPointerDown={copyCode}
          className="mt-2 w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[14px] text-[15px] font-semibold transition-motion active:scale-[0.97] min-h-[48px] shadow-card hover:shadow-float"
        >
          {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedCode ? 'Code copied' : 'Copy Code'}
        </button>

        <div className="w-full space-y-3 mt-3">
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
                <div className="flex flex-col items-center justify-center p-5 sm:p-6 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[16px] shadow-sm">
                  <div className="bg-white p-4 rounded-[14px] mb-3 shadow-sm">
                    <QRCodeSVG value={qrValue} size={216} />
                  </div>
                  <p className="text-[12px] text-apple-ink-muted mb-1">
                    The code refreshes every 40 seconds — scan it while it's current.
                  </p>
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
                aria-expanded={showQR}
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
              {copiedLink ? 'Link copied' : (navigator.share ? 'Share link' : 'Copy link')}
            </div>
          </button>
        </div>

        {/* Device name — a quiet detail below the actions, not a competing
            control. Lets the other device recognize this one at a glance. */}
        <div className="flex items-center gap-2 mt-6">
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
              className="flex items-center gap-1.5 text-[13px] font-medium text-apple-ink-muted/90 hover:text-apple-ink dark:hover:text-white transition-colors active:scale-95 px-2 py-2 -my-1 -mx-2 min-h-[44px]"
              title="Edit device name"
            >
              <span className="w-6 h-6 rounded-full bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center">
                <Pencil className="w-3 h-3" />
              </span>
              {session.deviceName}
            </button>
          )}
        </div>

        <p className="text-[13px] text-apple-ink-muted mt-2">
          This connection stays open for hours — the other device can connect anytime.
        </p>

        {/* Agent push — "send from your computer" without a second browser.
            The curl command carries the room secret as a bearer credential;
            a script or AI agent can push text (or a small file) straight into
            this room, even before the other device joins. Deliberately a quiet
            utility (a feature, not a button for humans) — collapsed and muted. */}
        <div className="w-full mt-4 flex flex-col items-center">
          <button
            onPointerDown={() => setShowPush(!showPush)}
            aria-expanded={showPush}
            className="flex items-center gap-1.5 text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors active:scale-95 px-3 py-2 min-h-[44px]"
          >
            <Terminal className="w-3.5 h-3.5" />
            Send from your computer
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showPush && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showPush && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-3 p-4 bg-apple-parchment dark:bg-apple-tile-1 rounded-[14px] text-left">
                  <p className="text-[13px] text-apple-ink-muted leading-relaxed mb-3">
                    Paste this in any terminal — or hand it to an AI agent. It pushes text straight
                    into this room, even before the other device joins.
                  </p>
                  <pre className="text-[11.5px] sm:text-[12px] font-mono text-apple-ink dark:text-white bg-white/70 dark:bg-black/30 border border-apple-divider dark:border-apple-tile-3 rounded-[10px] p-3 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed mb-2">
{`curl -X POST ${pushEndpoint() ?? ''} \
  -H "Authorization: Bearer ${session.secret}" \
  -H "Content-Type: application/json" \
  -d '{"roomId":"${session.roomId}","text":"Hello from my computer"}'`}
                  </pre>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <button
                      onPointerDown={async () => {
                        const cmd = `curl -X POST ${pushEndpoint() ?? ''} \\n  -H "Authorization: Bearer ${session.secret}" \\n  -H "Content-Type: application/json" \\n  -d '{"roomId":"${session.roomId}","text":"Hello from my computer"}'`;
                        try { await navigator.clipboard.writeText(cmd); } catch { /* ignore */ }
                        setCopiedTextCmd(true);
                        setTimeout(() => setCopiedTextCmd(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[12.5px] font-semibold transition-motion active:scale-95 min-h-[40px]"
                    >
                      {copiedTextCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedTextCmd ? 'Copied' : 'Copy text command'}
                    </button>
                    <button
                      onPointerDown={async () => {
                        const cmd = `# File (any type, up to 8 MB):\ncurl -X POST ${pushEndpoint() ?? ''}?roomId=${session.roomId} \\n  -H "Authorization: Bearer ${session.secret}" \\n  -H "Content-Type: application/octet-stream" \\n  -H "X-File-Name: notes.txt" \\n  --data-binary @notes.txt`;
                        try { await navigator.clipboard.writeText(cmd); } catch { /* ignore */ }
                        setCopiedFileCmd(true);
                        setTimeout(() => setCopiedFileCmd(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-apple-divider dark:border-apple-tile-3 text-apple-ink dark:text-white text-[12.5px] font-semibold transition-motion active:scale-95 min-h-[40px]"
                    >
                      {copiedFileCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedFileCmd ? 'Copied' : 'Copy file command'}
                    </button>
                  </div>
                  <p className="flex items-start gap-1.5 text-[12px] text-apple-ink-muted leading-relaxed">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    This command is your room\u2019s private key — anyone with it can push to this room. Only
                    share it with devices or agents you trust.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Push inbox — messages an agent pushed while this device sat on the
            connect screen. They live in the room, so they carry over into the
            chat once a partner pairs. */}
        {session.messages.filter(m => m.source === 'push').length > 0 && (
          <div className="w-full mt-4 p-4 bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 rounded-[14px] shadow-sm">
            <div className="flex items-center gap-2 mb-2.5">
              <Inbox className="w-4 h-4 text-apple-blue" />
              <span className="text-[14px] font-semibold text-apple-ink dark:text-white">Sent from your computer</span>
            </div>
            <div className="space-y-2">
              {session.messages.filter(m => m.source === 'push').slice(-3).map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-left">
                  <div className="min-w-0">
                    <p className="text-[13px] text-apple-ink dark:text-white truncate">
                      {m.attachment ? `${m.attachment.name} · ${formatBytes(m.attachment.size)}` : m.text}
                    </p>
                    <p className="text-[11.5px] text-apple-ink-muted">{timeAgo(m.timestamp)}</p>
                  </div>
                  <button
                    onPointerDown={async () => {
                      try { await navigator.clipboard.writeText(m.attachment ? m.attachment.name : m.text); } catch { /* ignore */ }
                    }}
                    aria-label="Copy"
                    className="flex items-center justify-center w-8 h-8 rounded-full text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3 transition-motion active:scale-90 shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[12px] text-apple-ink-muted leading-relaxed">
              These are waiting here — connect the other device to see them.
            </p>
          </div>
        )}

        <button
          onPointerDown={() => setShowHow(!showHow)}
          aria-expanded={showHow}
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
                <p>This connection disappears automatically after a while. When it ends, the code stops working and it can't be reopened.</p>
                <p>Text is encrypted between devices. When a direct connection isn't possible, an encrypted relay forwards your data — the relay never stores or logs your content.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </main>
    </div>
  );
}
