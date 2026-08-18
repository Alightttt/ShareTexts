/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { Landing } from './views/Landing';
import { RoomHub } from './views/RoomHub';
import { JoinSession } from './views/JoinSession';
import { ChatView } from './views/ChatView';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff, Send, Home, Share2, Check } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';
import { ConnectingVisual } from './components/ConnectingVisual';

function SessionEndedScreen({ reason, onNewSession, onHome }: { reason: string, onNewSession: () => void, onHome: () => void }) {
  // One honest line about what happened, then one clear action.
  const heading = reason === 'expired'
    ? "Time's up."
    : reason === 'manual_close'
      ? "That’s it."
      : "Room closed.";
  const copy = reason === 'expired'
    ? "This room expired. Start a new transfer when you're ready."
    : reason === 'manual_close'
      ? "You closed this room. Everything you sent is already on the other device."
      : "The other device closed this room.";
  const sub = "No account or transfer history. Payloads moved directly between your devices.";

  const [shared, setShared] = useState(false);
  const shareApp = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
    } catch {
      /* fall back to the buttons */
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center"
    >
      <ShareTextLogo
        size={56}
        motion={reason === 'expired' ? undefined : 'complete'}
        className="text-apple-ink dark:text-white mb-7 opacity-80"
      />
      <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">{heading}</h2>
      <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-1.5">{copy}</p>
      <p className="text-[13.5px] text-apple-ink-muted/80 dark:text-white/40 font-medium max-w-xs mb-9">{sub}</p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm sm:max-w-none sm:w-auto">
        <button
          onPointerDown={onNewSession}
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-card hover:shadow-float min-h-[48px] flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> Start a transfer
        </button>
        <button
          onPointerDown={onHome}
          className="px-6 py-3 rounded-[12px] text-[14px] font-medium text-apple-ink-muted dark:text-white/60 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion active:scale-[0.97] min-h-[48px] flex items-center justify-center gap-1.5"
        >
          <Home className="w-4 h-4" /> Back to Home
        </button>
      </div>

      {/* The quiet referral moment — ShareText is free, and every session
          needs a second device, so sharing IS the product loop. */}
      <button
        onPointerDown={shareApp}
        className="mt-8 flex items-center gap-2 px-4 py-2 rounded-full text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55 hover:text-apple-ink dark:hover:text-white border border-transparent hover:border-apple-divider dark:hover:border-white/15 transition-motion active:scale-95 min-h-[44px]"
      >
        {shared ? <Check className="w-4 h-4 text-status-success" /> : <Share2 className="w-4 h-4" />}
        {shared ? 'Link copied — share ShareText free' : 'Share ShareText — it\u2019s free, forever'}
      </button>
    </motion.div>
  );
}

/**
 * Joiner's "Connecting…" wait. WebRTC handshakes normally open in under a
 * second; if the other device's offer was lost (or its tab closed) the
 * joiner would otherwise wait forever. After a grace period, say what to do
 * and offer the recovery action — never a bare spinner.
 */
function ConnectingWait({ onRetry }: { onRetry: () => void; key?: React.Key }) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setElapsed(true), 15000);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <p className="text-[17px] text-apple-ink-muted">
        {elapsed
          ? "Still connecting. Make sure the other device is on its Connect screen with the code visible — we\u2019re trying a direct connection and a secure relay."
          : "This usually takes a moment."}
      </p>
      {elapsed && (
        <button
          onPointerDown={onRetry}
          className="mt-6 px-6 py-2.5 rounded-[10px] border border-apple-divider dark:border-white/15 text-[14px] font-semibold text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion active:scale-95 min-h-[44px]"
        >
          Try again
        </button>
      )}
    </>
  );
}

function AppContent() {
  const { session, leaveView, requestReconnect, createSession } = useSession();
  // Remounts ConnectingWait on "Try again" so its 15s hint timer restarts.
  const [waitKey, setWaitKey] = useState(0);
  // A /s/<code> path is a share link (same idea as ?join=, shorter) — it
  // routes to the join flow, which resolves the code and confirms the join.
  const shortCodeFromPath = () => {
    if (typeof window === 'undefined') return null;
    const m = window.location.pathname.match(/^\/s\/([0-9a-f]{8})$/i);
    return m ? m[1].toLowerCase() : null;
  };
  const [view, setView] = useState<'landing' | 'join'>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('join') || shortCodeFromPath()) return 'join';
    }
    return 'landing';
  });

  if (typeof window !== 'undefined' && !window.RTCPeerConnection) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center">
        <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-[20px] flex items-center justify-center mb-6">
          <WifiOff className="w-7 h-7 text-apple-ink-muted" strokeWidth={1.8} />
        </div>
        <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Browser Unsupported</h2>
        <p className="text-[17px] text-apple-ink-muted max-w-sm">ShareText requires WebRTC to connect devices directly. Please update your browser or try a different one.</p>
      </div>
    );
  }

  if (typeof window !== 'undefined' && !/^(\/|\/s\/[0-9a-f]{8})$/i.test(window.location.pathname)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center relative overflow-hidden"
      >
        {/* The same ambient warmth as the app's screens */}
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(70%_90%_at_50%_-10%,rgba(46,139,255,0.10),transparent_65%)] pointer-events-none" aria-hidden />
        <div className="w-20 h-20 bg-apple-parchment dark:bg-apple-tile-1 rounded-[24px] flex items-center justify-center mb-6 shadow-sm">
          <ShareTextLogo size={34} className="text-apple-blue" />
        </div>
        <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">This page doesn't exist.</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-9">
          Nothing was shared to this address. ShareText lives on the home page.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm sm:max-w-none sm:w-auto">
          <button
            onClick={() => { window.location.href = '/'; }}
            className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-card hover:shadow-float min-h-[48px] flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" /> Start a transfer
          </button>
          <button
            onClick={() => { window.location.href = '/'; }}
            className="px-6 py-3 rounded-[12px] text-[14px] font-medium text-apple-ink-muted dark:text-white/60 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion active:scale-[0.97] min-h-[48px] flex items-center justify-center gap-1.5"
          >
            <Home className="w-4 h-4" /> Back to Home
          </button>
        </div>
      </motion.div>
    );
  }

  // Session ended — show a calm closing state instead of dumping the user on
  // the landing page with no explanation. Checked BEFORE the room screens so
  // a closing session can never flash the code/connect screen for a frame
  // while the state settles. Two exits: start a fresh session (the useful
  // next step) or return home.
  if (session.closedReason) {
    return (
      <AnimatePresence mode="wait">
        <SessionEndedScreen
          reason={session.closedReason}
          onNewSession={() => { leaveView(); void createSession(); }}
          onHome={() => { leaveView(); setView('landing'); }}
        />
      </AnimatePresence>
    );
  }

  // Routing logic based on session state. The pairing screen is REPLACED by
  // the connected room (not layered) — once the peer is present the code and
  // QR are gone; the only remaining reference to the code lives inside
  // Connection details. The transition is a restrained cross-fade, never a
  // slide of one screen over the other.
  // Joiner: either the fresh "connecting" state or "partner gone, waiting".
  const waitingForReconnect = session.connectionType === 'disconnected';
  if (session.roomId) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={session.partnerConnected ? 'chat' : session.isCreator ? 'hub' : 'wait'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {session.partnerConnected ? <ChatView /> : session.isCreator ? <RoomHub /> : (
            <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black px-6 text-center">
              <div className="flex flex-col items-center">
                {!waitingForReconnect && <ConnectingVisual />}
                <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">
                  {waitingForReconnect ? "Your other device disconnected."
                    : session.connectionType === 'establishing' ? "Establishing secure connection…"
                    : "Connecting…"}
                </h2>
                {waitingForReconnect ? (
                  <p className="text-[17px] text-apple-ink-muted">This connection is still open — you can reconnect anytime.</p>
                ) : (
                  <ConnectingWait key={waitKey} onRetry={() => { setWaitKey(k => k + 1); void requestReconnect(); }} />
                )}
                {waitingForReconnect && (
                  <button
                    onPointerDown={() => { void requestReconnect(); }}
                    className="mt-8 px-8 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-card hover:shadow-float min-h-[48px]"
                  >
                    Reconnect
                  </button>
                )}
                <button
                  onPointerDown={leaveView}
                  className="mt-4 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors px-4 py-2 min-h-[44px]"
                >
                  Leave
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }


  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        {view === 'landing' ? (
          <Landing onJoinClick={() => setView('join')} />
        ) : (
          <JoinSession onBack={() => { window.history.replaceState({}, document.title, '/'); setView('landing'); }} />
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}
