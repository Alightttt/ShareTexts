import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { QRScanner } from '../components/QRScanner';
import { ChevronLeft, Loader2, QrCode, Keyboard } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import { ShareTextLogo } from '../components/ShareTextLogo';

export function JoinSession({ onBack }: { onBack: () => void }) {
  const { joinWithCode, joinWithLink } = useSession();
  const [activeTab, setActiveTab] = useState<'code' | 'qr' | 'linkConfirm'>('code');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const joinId = searchParams.get('join');
    if (joinId) {
      setPendingLink(joinId);
      setActiveTab('linkConfirm');
      
      // Clean up URL visually
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleCodeComplete = async (code: string) => {
    setIsJoining(true);
    setError(null);
    const res = await joinWithCode(code);
    if (!res.success) {
      setError(res.error || 'Invalid code');
      setIsJoining(false);
    }
  };

  const handleLinkJoin = async (idToJoin: string) => {
    setIsJoining(true);
    setError(null);
    let id = idToJoin;
    if (id.includes('?join=')) {
      id = id.split('?join=')[1];
    }
    const res = await joinWithLink(id);
    if (!res.success) {
      setError(res.error || 'Failed to join');
      setIsJoining(false);
      setActiveTab('code'); // fallback
    }
  };

  const handleQRScan = (text: string) => {
    handleLinkJoin(text);
  };

  return (
    <div className="flex flex-col min-h-screen bg-apple-canvas dark:bg-black p-6 relative selection:bg-apple-blue/20">
      <div className="absolute top-6 left-6 flex items-center">
        <button 
          onPointerDown={onBack}
          className="flex items-center gap-1 text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors text-[14px] font-medium active:scale-95"
        >
          <ChevronLeft className="w-5 h-5 -ml-1" /> Cancel
        </button>
      </div>

      <div className="absolute top-6 right-6 hidden sm:flex items-center gap-2">
        <ShareTextLogo size={24} className="text-apple-ink dark:text-white" />
        <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
      </div>

      <div className="w-full max-w-sm mx-auto flex flex-col items-center mt-20 sm:mt-32">
        
        <div className="w-full mb-12 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="w-full flex justify-center"
            >
              {activeTab === 'code' && (
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={error} />
              )}
              {activeTab === 'qr' && (
                <div className="w-full max-w-sm">
                  <QRScanner onScan={handleQRScan} onErrorFallback={() => setActiveTab('code')} />
                </div>
              )}
              {activeTab === 'linkConfirm' && (
                <div className="flex flex-col items-center p-8 bg-white dark:bg-[#1c1c1e] rounded-[24px] w-full text-center border border-apple-divider dark:border-apple-tile-3 shadow-sm">
                  <h3 className="text-[21px] font-semibold text-apple-ink dark:text-white mb-6 tracking-tight">Join Session?</h3>
                  <div className="mb-8">
                    <p className="text-[15px] text-apple-ink-muted">You are about to connect to a temporary room.</p>
                  </div>
                  
                  <button 
                    onPointerDown={() => pendingLink && handleLinkJoin(pendingLink)}
                    disabled={isJoining}
                    className="w-full py-3.5 bg-apple-ink dark:bg-white text-white dark:text-black rounded-[14px] text-[15px] font-semibold transition-transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join Now'}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {activeTab !== 'linkConfirm' && (
          <div className="mt-4 flex justify-center w-full">
            {activeTab === 'code' ? (
              <button 
                onPointerDown={() => { setActiveTab('qr'); setError(null); }}
                className="flex items-center gap-2 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-all bg-apple-parchment dark:bg-[#1c1c1e] px-4 py-2 rounded-full border border-apple-divider/50 dark:border-white/5"
              >
                <QrCode className="w-4 h-4" /> Scan QR instead
              </button>
            ) : (
              <button 
                onPointerDown={() => { setActiveTab('code'); setError(null); }}
                className="flex items-center gap-2 text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white active:scale-95 transition-all bg-apple-parchment dark:bg-[#1c1c1e] px-4 py-2 rounded-full border border-apple-divider/50 dark:border-white/5"
              >
                <Keyboard className="w-4 h-4" /> Enter code manually
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
