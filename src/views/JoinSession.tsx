import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { QRScanner } from '../components/QRScanner';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
    <div className="flex flex-col min-h-screen bg-apple-canvas dark:bg-black px-6 py-12">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        
        <div className="w-full flex justify-start mb-12">
          <button 
            onClick={onBack}
            className="flex items-center gap-1 text-apple-blue hover:text-apple-blue-focus transition-colors -ml-2 text-[17px] font-normal active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" /> <span className="-ml-1">Back</span>
          </button>
        </div>

        <div className="mb-12 text-center">
          <h2 className="text-[28px] leading-[1.1] font-semibold text-apple-ink dark:text-white tracking-tight">
            Connect to the other device
          </h2>
        </div>

        <div className="w-full mb-12 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full flex justify-center"
            >
              {activeTab === 'code' && (
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={error} />
              )}
              {activeTab === 'qr' && (
                <QRScanner onScan={handleQRScan} onErrorFallback={() => setActiveTab('code')} />
              )}
              {activeTab === 'linkConfirm' && (
                <div className="flex flex-col items-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px] w-full text-center border border-apple-hairline dark:border-transparent">
                  <h3 className="text-[21px] font-semibold text-apple-ink dark:text-white mb-6">Join this session?</h3>
                  <div className="mb-8">
                    <p className="text-[14px] text-apple-ink-muted uppercase tracking-wider font-semibold mb-1">Session</p>
                    <p className="text-[17px] text-apple-ink dark:text-white font-medium">Temporary</p>
                  </div>
                  
                  <button 
                    onClick={() => pendingLink && handleLinkJoin(pendingLink)}
                    disabled={isJoining}
                    className="w-full py-4 bg-apple-blue hover:bg-apple-blue-focus disabled:bg-apple-divider disabled:text-white/50 text-white rounded-[16px] text-[17px] font-medium transition-transform active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join'}
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {activeTab !== 'linkConfirm' && (
          <div className="mt-8 flex justify-center w-full">
            {activeTab === 'code' ? (
              <button 
                onClick={() => { setActiveTab('qr'); setError(null); }}
                className="text-[15px] font-medium text-apple-blue hover:text-apple-blue-focus active:scale-95 transition-transform"
              >
                Scan QR instead
              </button>
            ) : (
              <button 
                onClick={() => { setActiveTab('code'); setError(null); }}
                className="text-[15px] font-medium text-apple-blue hover:text-apple-blue-focus active:scale-95 transition-transform"
              >
                Enter code manually
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
