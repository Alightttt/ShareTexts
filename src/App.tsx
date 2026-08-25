/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense, type ReactNode } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff, Send, Home, Share2, Check } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';
import { ConnectingVisual } from './components/ConnectingVisual';

// Lazy-load every view — the landing page paints with only the core JS;
// ChatView, RoomHub, JoinSession, and Docs stream in only when needed.
const Landing = lazy(() => import('./views/Landing').then(m => ({ default: m.Landing })));
const RoomHub = lazy(() => import('./views/RoomHub').then(m => ({ default: m.RoomHub })));
const JoinSession = lazy(() => import('./views/JoinSession').then(m => ({ default: m.JoinSession })));
const ChatView = lazy(() => import('./views/ChatView').then(m => ({ default: m.ChatView })));
const Docs = lazy(() => import('./views/Docs').then(m => ({ default: m.Docs })));

function SessionEndedScreen({ reason, onNewSession, onHome }: { reason: string, onNewSession: () => void, onHome: () => void }) {
  // One honest line about what happened, then one clear action.
  const heading = reason === 'expired'
    ? "Time's up."
    : reason === 'manual_close'
      ? "That’s it."
      : "Room closed.";
  const copy = reason === 'expired'
    ? "The connection expired. For privacy, the room cannot be reopened. Start a new connection to continue."
    : reason === 'manual_close'
      ? "You closed this room. Everything you sent is already on the other device."
      : "The other device closed this room. Nothing incomplete was saved.";
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
      className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] p-6 text-center"
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
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2"
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

/**
 * Root error boundary — catches rendering errors and never leaves #root empty.
 * Shows a safe recovery screen so the user can get back to the landing page.
 */
// Lightweight error boundary — function components cannot catch render errors.
// Uses an untyped class because React 19 ships no .d.ts and @types/react is absent.
function ErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] p-6 text-center">
      <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-[20px] flex items-center justify-center mb-6">
        <ShareTextLogo size={28} className="text-apple-ink-muted" />
      </div>
      <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Something went wrong</h2>
      <p className="text-[16px] text-apple-ink-muted dark:text-white/60 max-w-sm mb-6">
        ShareText couldn't load properly. Your data is safe.
      </p>
      <button
        onClick={onReset}
        className="px-7 py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[15px] font-semibold min-h-[48px]"
      >
        Return to ShareText
      </button>
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ErrorBoundary = class extends (React.Component as any) {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return <ErrorFallback onReset={() => { try { localStorage.removeItem('sharetext.session.v1'); } catch {} window.location.href = '/'; }} />;
    }
    return (this.props as any).children;
  }
};

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

  // Browser back button: when the user presses back from a room, return to
  // landing. Without this, the back button does nothing (no router pushes
  // history entries) and the user gets stuck.
  useEffect(() => {
    const onPopState = () => {
      // If we're in a room (roomId set) and the user pressed back, exit.
      if (session.roomId && !session.closedReason) {
        leaveView();
      }
      // Always return to landing on back — prevents stale 'join' view
      // when user arrived via /s/<code> share link.
      setView('landing');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [session.roomId, session.closedReason, view, leaveView]);

  if (typeof window !== 'undefined' && !window.RTCPeerConnection) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] p-6 text-center">
        <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-[20px] flex items-center justify-center mb-6">
          <WifiOff className="w-7 h-7 text-apple-ink-muted" strokeWidth={1.8} />
        </div>
        <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Browser Unsupported</h2>
        <p className="text-[17px] text-apple-ink-muted max-w-sm">ShareText requires WebRTC to connect devices directly. Please update your browser or try a different one.</p>
      </div>
    );
  }

  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18]" />}><Docs /></Suspense>;
  }

  if (typeof window !== 'undefined' && !/^(\/|\/s\/[0-9a-f]{8})$/i.test(window.location.pathname)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] p-6 text-center relative overflow-hidden"
      >

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
            className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] shadow-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2"
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

  // Auto-reconnect for joiner: when the peer disconnects, automatically try
  // to resume so the room stays alive. The creator already shows RoomHub
  // with the pairing code for manual reconnection.
  useEffect(() => {
    if (!session.roomId || session.isCreator || session.partnerConnected || session.connectionType !== 'disconnected') return;
    // Auto-reconnect after 2 seconds — gives the server time to settle
    const t = setTimeout(() => {
      void requestReconnect();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.partnerConnected, session.connectionType, session.roomId, session.isCreator]);

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
          {session.partnerConnected ? <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18]" />}><ChatView /></Suspense> : session.isCreator ? <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18]" />}><RoomHub /></Suspense> : (              <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] px-6 text-center">
              <div className="flex flex-col items-center">
                {waitingForReconnect ? (
                  <>
                    <div className="w-16 h-16 rounded-[20px] bg-apple-parchment dark:bg-apple-tile-1 flex items-center justify-center mb-6">
                      <ShareTextLogo size={28} className="text-apple-ink dark:text-white" />
                    </div>
                    <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Reconnecting…</h2>
                    <p className="text-[17px] text-apple-ink-muted max-w-[340px]">Your other device is still here. Trying to reconnect automatically.</p>
                    <div className="mt-6 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-apple-blue animate-pulse" />
                      <span className="text-[14px] text-apple-ink-muted">Waiting for connection…</span>
                    </div>
                  </>
                ) : (
                  <>
                    <ConnectingVisual />
                    <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">
                      {session.connectionType === 'establishing' ? "Establishing secure connection…" : "Connecting…"}
                    </h2>
                    <ConnectingWait key={waitKey} onRetry={() => { setWaitKey(k => k + 1); void requestReconnect(); }} />
                  </>
                )}
                <button
                  onPointerDown={leaveView}
                  className="mt-8 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors px-4 py-2 min-h-[44px]"
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
    <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18]" /> }>
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
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        {/* Skip link — keyboard users jump past the hero to main content */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-azure-600 focus:text-white focus:rounded-lg focus:text-[14px] focus:font-semibold">
          Skip to main content
        </a>
        <AppContent />
      </SessionProvider>
    </ErrorBoundary>
  );
}
