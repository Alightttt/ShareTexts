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
import { WifiOff, Send, Home } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';
import { ConnectingVisual } from './components/ConnectingVisual';

function SessionEndedScreen({ reason, onNewSession, onHome }: { reason: string, onNewSession: () => void, onHome: () => void }) {
  // One honest line about what happened, then one clear action.
  const copy = reason === 'expired'
    ? "This room expired. Make a new one when you're ready."
    : reason === 'manual_close'
      ? "You ended this session."
      : "This room was closed.";
  const sub = reason === 'expired'
    ? "Nothing you sent is stored anywhere — it only lived on your devices."
    : "Everything you sent is already on your device. Nothing was stored.";

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
      <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Session ended.</h2>
      <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-1.5">{copy}</p>
      <p className="text-[13.5px] text-apple-ink-muted/80 dark:text-white/40 font-medium max-w-xs mb-9">{sub}</p>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm sm:max-w-none sm:w-auto">
        <button
          onPointerDown={onNewSession}
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-card hover:shadow-float min-h-[48px] flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> Start New Session
        </button>
        <button
          onPointerDown={onHome}
          className="px-6 py-3 rounded-[12px] text-[14px] font-medium text-apple-ink-muted dark:text-white/60 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion active:scale-[0.97] min-h-[48px] flex items-center justify-center gap-1.5"
        >
          <Home className="w-4 h-4" /> Back to Home
        </button>
      </div>
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
  const [view, setView] = useState<'landing' | 'join'>(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.has('join') ? 'join' : 'landing';
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

  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
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
            <Send className="w-4 h-4" /> Start a Session
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
  // the landing page with no explanation. Two exits: start a fresh session
  // (the useful next step) or return home.
  if (!session.roomId && session.closedReason) {
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

  // Routing logic based on session state
  if (session.roomId) {
    if (session.partnerConnected) {
      return <ChatView />;
    }
    if (session.isCreator) {
      return <RoomHub />;
    }
    // Joiner: either the fresh "connecting" state or "partner gone, waiting".
    const waitingForReconnect = session.connectionType === 'disconnected';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black px-6 text-center">
        <div className="flex flex-col items-center">
          {!waitingForReconnect && <ConnectingVisual />}
          <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">
            {waitingForReconnect ? "Your other device disconnected." : "Connecting…"}
          </h2>
          {waitingForReconnect ? (
            <p className="text-[17px] text-apple-ink-muted">Your room is still open — you can rejoin anytime.</p>
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
            Leave session
          </button>
        </div>
      </div>
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
          <JoinSession onBack={() => setView('landing')} />
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
