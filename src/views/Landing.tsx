import React, { useEffect, useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Zap, Lock, Smartphone, RefreshCw, EyeOff, Hash } from 'lucide-react';

export function Landing({ onJoinClick, closedReason }: { onJoinClick: () => void, closedReason?: string | null }) {
  const { createSession } = useSession();
  const [showClosedMsg, setShowClosedMsg] = useState(!!closedReason);

  // If user opens a link like ?join=xxx, they should auto-go to join view
  useEffect(() => {
    if (window.location.search.includes('join=')) {
      onJoinClick();
    }
  }, [onJoinClick]);

  useEffect(() => {
    if (showClosedMsg) {
      const timer = setTimeout(() => setShowClosedMsg(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showClosedMsg]);

  return (
    <div className="flex flex-col min-h-screen bg-apple-canvas dark:bg-black overflow-x-hidden">
      
      {/* Hero Section */}
      <div className="flex flex-col items-center justify-center min-h-[90vh] px-6 py-12 relative">
        <div className="max-w-2xl w-full flex flex-col items-center text-center z-10">
          
          <AnimatePresence mode="wait">
            {showClosedMsg ? (
              <motion.div
                key="closed-msg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center justify-center gap-2 mb-12 text-[#34c759] bg-[#34c759]/10 px-4 py-2 rounded-full"
              >
                <ShieldCheck className="w-5 h-5" />
                <span className="text-[14px] font-medium tracking-tight">Session ended securely</span>
              </motion.div>
            ) : (
              <motion.div
                key="landing-content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center w-full"
              >
                <h1 className="text-[44px] sm:text-[56px] leading-[1.07] font-semibold text-apple-ink dark:text-white tracking-[-0.025em] mb-4">
                  Share text instantly between two devices.
                </h1>
                <p className="text-[22px] sm:text-[28px] leading-[1.14] text-apple-ink-muted dark:text-apple-ink-muted mb-12 tracking-[0.01em] font-normal max-w-lg">
                  Your temporary clipboard for the web.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-4">
                  <button 
                    onClick={createSession}
                    className="flex-1 sm:flex-none flex items-center justify-center px-10 py-4 bg-apple-blue hover:bg-apple-blue-focus text-white rounded-full text-[17px] font-normal transition-transform active:scale-95"
                  >
                    Create Session
                  </button>
                  
                  <button 
                    onClick={onJoinClick}
                    className="flex-1 sm:flex-none flex items-center justify-center px-10 py-4 bg-transparent text-apple-blue hover:bg-apple-blue/5 border border-apple-blue rounded-full text-[17px] font-normal transition-transform active:scale-95"
                  >
                    Join Session
                  </button>
                </div>

                <div className="mt-16 flex items-center gap-2 text-[14px] text-apple-ink-muted">
                  <Lock className="w-4 h-4 opacity-70" />
                  <a href="#privacy" className="hover:text-apple-ink dark:hover:text-white transition-colors underline decoration-apple-ink-muted/30 underline-offset-4">Security & Privacy Info</a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Explanatory Sections */}
      <div className="bg-white dark:bg-apple-tile-1 border-t border-apple-divider dark:border-apple-tile-2 py-24 px-6">
        <div className="max-w-4xl mx-auto space-y-32">
          
          {/* How It Works */}
          <section>
            <h2 className="text-[32px] font-semibold text-apple-ink dark:text-white mb-12 text-center tracking-tight">How it works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-apple-canvas dark:bg-apple-tile-2 rounded-full flex items-center justify-center mb-6">
                  <span className="text-[24px] font-semibold text-apple-blue">1</span>
                </div>
                <h3 className="text-[19px] font-medium text-apple-ink dark:text-white mb-3">Create a temporary room</h3>
                <p className="text-[15px] text-apple-ink-muted leading-[1.4] max-w-[250px]">Start a new session on your first device to get a Live Code.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-apple-canvas dark:bg-apple-tile-2 rounded-full flex items-center justify-center mb-6">
                  <span className="text-[24px] font-semibold text-apple-blue">2</span>
                </div>
                <h3 className="text-[19px] font-medium text-apple-ink dark:text-white mb-3">Connect your other device</h3>
                <p className="text-[15px] text-apple-ink-muted leading-[1.4] max-w-[250px]">Enter the code or scan the QR code on your second device.</p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-apple-canvas dark:bg-apple-tile-2 rounded-full flex items-center justify-center mb-6">
                  <span className="text-[24px] font-semibold text-apple-blue">3</span>
                </div>
                <h3 className="text-[19px] font-medium text-apple-ink dark:text-white mb-3">Paste and copy</h3>
                <p className="text-[15px] text-apple-ink-muted leading-[1.4] max-w-[250px]">Paste your text, and it appears instantly on the other device.</p>
              </div>
            </div>
          </section>

          {/* Why ShareText */}
          <section>
            <h2 className="text-[32px] font-semibold text-apple-ink dark:text-white mb-12 text-center tracking-tight">Why ShareText</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-10 max-w-3xl mx-auto">
              <div className="flex gap-4">
                <div className="mt-1"><EyeOff className="w-6 h-6 text-apple-blue" /></div>
                <div>
                  <h3 className="text-[17px] font-medium text-apple-ink dark:text-white mb-1">No app, no account</h3>
                  <p className="text-[15px] text-apple-ink-muted">Works entirely in your browser. Nothing to install, no sign-ups required.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1"><RefreshCw className="w-6 h-6 text-apple-blue" /></div>
                <div>
                  <h3 className="text-[17px] font-medium text-apple-ink dark:text-white mb-1">Temporary rooms</h3>
                  <p className="text-[15px] text-apple-ink-muted">Sessions expire automatically when you leave. There is no permanent chat history.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1"><Lock className="w-6 h-6 text-apple-blue" /></div>
                <div>
                  <h3 className="text-[17px] font-medium text-apple-ink dark:text-white mb-1">Encrypted transfer</h3>
                  <p className="text-[15px] text-apple-ink-muted">Data sent between devices remains encrypted during transit.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="mt-1"><Smartphone className="w-6 h-6 text-apple-blue" /></div>
                <div>
                  <h3 className="text-[17px] font-medium text-apple-ink dark:text-white mb-1">Works across devices</h3>
                  <p className="text-[15px] text-apple-ink-muted">Easily move text between Mac, Windows, iOS, and Android seamlessly.</p>
                </div>
              </div>
            </div>
          </section>

          {/* Privacy Section */}
          <section id="privacy" className="scroll-mt-12">
            <div className="bg-apple-parchment dark:bg-apple-tile-2 rounded-[24px] p-8 sm:p-12 max-w-3xl mx-auto text-left border border-apple-hairline dark:border-transparent">
              <div className="flex items-center gap-3 mb-6">
                <ShieldCheck className="w-7 h-7 text-apple-blue" />
                <h2 className="text-[24px] font-semibold text-apple-ink dark:text-white tracking-tight">Privacy & Security</h2>
              </div>
              <div className="space-y-6 text-[16px] leading-[1.5] text-apple-ink-muted dark:text-apple-ink-muted">
                <p>
                  ShareText is designed as a temporary clipboard. Messages aren't stored as a permanent chat history anywhere on our servers.
                </p>
                <p>
                  We prioritize speed and privacy. Direct connections use WebRTC whenever possible, meaning your text travels directly from one device to the other without passing through a central server.
                </p>
                <p>
                  When a direct connection isn't possible (due to strict firewalls or separate networks), encrypted relay transport is used. Your text is encrypted in the browser before it leaves your device, and is not intended to be readable by the relay.
                </p>
              </div>
            </div>
          </section>

        </div>
      </div>
      
      {/* Footer */}
      <footer className="py-8 text-center text-[13px] text-apple-ink-muted dark:text-apple-ink-muted/60">
        <p>ShareText &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
