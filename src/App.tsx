/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SessionProvider, useSession } from './lib/SessionContext';
import { Landing } from './views/Landing';
import { RoomHub } from './views/RoomHub';
import { JoinSession } from './views/JoinSession';
import { ChatView } from './views/ChatView';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff } from 'lucide-react';
import { ShareTextLogo } from './components/ShareTextLogo';

function SessionEndedScreen({ reason, onRestart }: { reason: string, onRestart: () => void }) {
  const copy = reason === 'expired'
    ? "This temporary room has expired and can no longer be reopened."
    : "Your temporary room has been closed.";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center"
    >
      <ShareTextLogo size={56} className="text-apple-ink dark:text-white mb-6 opacity-80" />
      <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Session ended.</h2>
      <p className="text-[17px] text-apple-ink-muted mb-10">{copy}</p>
      <button
        onPointerDown={onRestart}
        className="px-8 py-3.5 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[16px] font-semibold transition-motion active:scale-[0.97] shadow-card hover:shadow-float min-h-[48px]"
      >
        Start New Session
      </button>
    </motion.div>
  );
}

function AppContent() {
  const { session, leaveView, requestReconnect } = useSession();
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center">
        <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-[20px] flex items-center justify-center mb-6">
          <span className="text-[22px] font-semibold text-apple-ink-muted tracking-tight">404</span>
        </div>
        <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Page Not Found</h2>
        <p className="text-[17px] text-apple-ink-muted max-w-sm mb-8">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => { window.location.href = '/'; }}
          className="px-6 py-3 bg-apple-ink dark:bg-white text-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold transition-motion active:scale-[0.97] min-h-[44px]"
        >
          Go to Homepage
        </button>
      </div>
    );
  }

  // Session ended — show a calm closing state instead of dumping the user on
  // the landing page with no explanation.
  if (!session.roomId && session.closedReason) {
    return (
      <AnimatePresence mode="wait">
        <SessionEndedScreen reason={session.closedReason} onRestart={() => {
          leaveView();
          setView('landing');
        }} />
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
          <ShareTextLogo size={64} animated className="text-apple-ink dark:text-white mb-8" />
          <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">
            {waitingForReconnect ? "Your other device disconnected." : "Connecting…"}
          </h2>
          <p className="text-[17px] text-apple-ink-muted">
            {waitingForReconnect ? "Your room is still open — you can rejoin anytime." : "This usually takes a moment."}
          </p>
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
