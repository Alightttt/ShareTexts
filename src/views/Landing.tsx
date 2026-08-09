import React from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw } from 'lucide-react';

interface LandingProps {
  onJoinClick: () => void;
  closedReason?: string;
}

export function Landing({ onJoinClick, closedReason }: LandingProps) {
  const { createSession } = useSession();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 relative selection:bg-apple-blue/20">
      <div className="w-full max-w-3xl mx-auto text-center flex flex-col items-center">
        {/* Logo/Brand */}
        <div className="mb-8 flex items-center justify-center">
          <span className="text-[21px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
        </div>

        <AnimatePresence mode="wait">
          {closedReason ? (
            <motion.div
              key="closed-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-apple-parchment dark:bg-apple-tile-1 rounded-full flex items-center justify-center mb-6">
                <RefreshCcw className="w-7 h-7 text-apple-ink-muted" />
              </div>
              <h2 className="text-[28px] leading-[1.14] font-semibold text-apple-ink dark:text-white tracking-[0.01em] mb-2">
                Session ended.
              </h2>
              <p className="text-[19px] text-apple-ink-muted mb-10 tracking-[-0.015em]">
                Your temporary room has been closed.
              </p>
              <button 
                onClick={() => window.location.reload()}
                className="px-8 py-3.5 bg-apple-blue hover:bg-apple-blue-focus text-white rounded-full text-[17px] font-medium transition-transform active:scale-95"
              >
                Start New Session
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="landing-content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center w-full"
            >
              <h1 className="text-[44px] sm:text-[56px] leading-[1.07] font-semibold text-apple-ink dark:text-white tracking-[-0.025em] mb-12">
                Share text instantly<br className="hidden sm:block" /> between two devices.
              </h1>
              
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-6">
                <button 
                  onClick={createSession}
                  className="flex-1 sm:flex-none flex items-center justify-center px-10 py-4 bg-apple-blue hover:bg-apple-blue-focus text-white rounded-full text-[17px] font-medium transition-transform active:scale-95"
                >
                  Create Session
                </button>
                
                <button 
                  onClick={onJoinClick}
                  className="flex-1 sm:flex-none flex items-center justify-center px-10 py-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 text-apple-ink dark:text-white rounded-full text-[17px] font-medium transition-transform active:scale-95"
                >
                  Join Session
                </button>
              </div>

              <p className="text-[15px] text-apple-ink-muted tracking-[-0.01em]">
                No account required.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
