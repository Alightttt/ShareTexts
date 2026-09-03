/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, lazy, Suspense } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { Send, Home, Share2, Check } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';

// Lazy-load the remaining views — the app shell paints with only the core
// JS; SingleScreenApp and Docs stream in only when needed.
const Docs = lazy(() => import('./views/Docs').then(m => ({ default: m.Docs })));
const SingleScreenApp = lazy(() => import('./views/SingleScreenApp').then(m => ({ default: m.SingleScreenApp })));

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
    <div
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
    </div>
  );
}

/**
 * Root error boundary — catches rendering errors and never leaves #root empty.
 * Shows a safe recovery screen so the user can get back to the home screen.
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
  const { session, leaveView, createSession, closeSession } = useSession();

  if (typeof window !== 'undefined' && window.location.pathname === '/docs') {
    return <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18] flex items-center justify-center"><ShareTextLogo size={32} motion="loading" className="text-azure-600 dark:text-azure-400 opacity-60" /></div>}><Docs /></Suspense>;
  }

  if (typeof window !== 'undefined' && window.location.pathname !== '/' && !window.location.pathname.startsWith('/s/')) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-[#0a0e18] p-6 text-center">
        <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">This page does not exist.</h2>
        <p className="text-[16px] text-apple-ink-muted dark:text-white/60 font-medium max-w-sm mb-9">Nothing was shared to this address.</p>
        <button onClick={() => { window.location.href = '/'; }}
          className="px-7 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold active:scale-[0.97] min-h-[48px]">Go Home</button>
      </div>
    );
  }

  if (session.closedReason) {
    return (
      <>
        <SessionEndedScreen
          reason={session.closedReason}
          onNewSession={() => { leaveView(); void createSession(); }}
          onHome={() => { leaveView(); window.location.href = '/'; }}
        />
      </>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-apple-canvas dark:bg-[#0a0e18] flex items-center justify-center"><ShareTextLogo size={32} motion="loading" className="text-azure-600 dark:text-azure-400 opacity-60" /></div>}>
      <SingleScreenApp />
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
