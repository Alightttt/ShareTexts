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

function AppContent() {
  const { session } = useSession();
  const [view, setView] = useState<'landing' | 'join'>('landing');

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
        <div className="flex items-center gap-3 py-2 px-4 bg-apple-parchment dark:bg-apple-tile-1 rounded-full mb-8">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-apple-blue opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-apple-blue"></span>
          </span>
          <span className="text-[14px] text-apple-ink dark:text-white font-medium tracking-tight">
            {session.connectionType === 'connecting' ? 'Negotiating connection...' : 'Searching for session...'}
          </span>
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

