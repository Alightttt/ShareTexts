import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeInput } from '../components/LiveCodeInput';
import { QRScanner } from '../components/QRScanner';
import { ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function JoinSession({ onBack }: { onBack: () => void }) {
  const { joinWithCode, joinWithLink } = useSession();
  const [activeTab, setActiveTab] = useState<'code' | 'qr'>('code');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const joinId = searchParams.get('join');
    if (joinId) {
      handleLinkJoin(joinId);
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
    }
  };

  const handleQRScan = (text: string) => {
    handleLinkJoin(text);
  };

  return (
    <div className="flex flex-col min-h-screen bg-apple-canvas dark:bg-black px-6 py-12">
      <div className="w-full max-w-lg mx-auto flex flex-col items-center">
        
        <div className="w-full flex justify-start mb-12">
          <button 
            onClick={onBack}
            className="flex items-center gap-1 text-apple-blue hover:text-apple-blue-focus transition-colors -ml-2 text-[17px] font-normal active:scale-95"
          >
            <ChevronLeft className="w-6 h-6" /> <span className="-ml-1">Back</span>
          </button>
        </div>

        <div className="mb-12 text-center">
          <h2 className="text-[40px] leading-[1.1] font-semibold text-apple-ink dark:text-white mb-2 tracking-tight">
            Join a session
          </h2>
          <p className="text-[17px] leading-[1.47] text-apple-ink-muted dark:text-apple-ink-muted tracking-[-0.022em]">
            Use the code shown on the other device.
          </p>
        </div>

        <div className="w-full mb-12">
          <AnimatePresence mode="wait">
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {activeTab === 'code' ? (
                <LiveCodeInput onComplete={handleCodeComplete} isJoining={isJoining} error={error} />
              ) : (
                <QRScanner onScan={handleQRScan} onErrorFallback={() => setActiveTab('code')} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex gap-4">
          {activeTab === 'code' ? (
            <button 
              onClick={() => { setActiveTab('qr'); setError(null); }}
              className="text-[17px] text-apple-blue font-normal active:scale-95 transition-transform"
            >
              Scan QR instead
            </button>
          ) : (
            <button 
              onClick={() => { setActiveTab('code'); setError(null); }}
              className="text-[17px] text-apple-blue font-normal active:scale-95 transition-transform"
            >
              Enter code manually
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
