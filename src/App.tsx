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
import { ShareTextLogo } from './components/ShareTextLogo';

function AppContent() {
  const { session } = useSession();
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
        <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-full flex items-center justify-center mb-6">
          <span className="text-[24px]">⚠️</span>
        </div>
        <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Browser Unsupported</h2>
        <p className="text-[17px] text-apple-ink-muted max-w-sm">ShareText requires WebRTC to connect devices directly. Please update your browser or try a different one.</p>
      </div>
    );
  }

  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 text-center">
        <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-full flex items-center justify-center mb-6">
          <span className="text-[24px]">404</span>
        </div>
        <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white mb-2">Page Not Found</h2>
        <p className="text-[17px] text-apple-ink-muted max-w-sm mb-8">The page you're looking for doesn't exist.</p>
        <button 
          onClick={() => { window.location.href = '/'; }}
          className="px-6 py-3 bg-apple-blue hover:bg-apple-blue-focus text-white rounded-full text-[17px] font-normal transition-transform active:scale-95"
        >
          Go to Homepage
        </button>
      </div>
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
    // If joiner and waiting for partner...
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black px-6 text-center">
        <div className="flex flex-col items-center">
          <ShareTextLogo size={64} animated className="text-apple-ink dark:text-white mb-8" />
          <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">Connecting...</h2>
          <p className="text-[17px] text-apple-ink-muted">This usually takes a moment.</p>
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
          <Landing onJoinClick={() => setView('join')} closedReason={session.closedReason} />
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

