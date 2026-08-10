import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, QrCode, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ShareTextLogo } from '../components/ShareTextLogo';

export function RoomHub() {
  const { session } = useSession();
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);

  if (!session.roomId || !session.secret) return null;

  const shareUrl = `${window.location.origin}?join=${session.roomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6 relative">
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <ShareTextLogo size={24} className="text-apple-ink dark:text-white" />
        <span className="text-[14px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
      </div>

      <div className="w-full max-w-sm text-center flex flex-col items-center">
        
        <div className="w-full mb-8">
          <LiveCodeDisplay secret={session.secret} />
        </div>

        <div className="w-full space-y-3">
          <AnimatePresence mode="popLayout">
            {showQR ? (
              <motion.div
                key="qr"
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col items-center justify-center p-6 bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[16px] shadow-sm">
                  <div className="bg-white p-3 rounded-[11px] mb-4">
                    <QRCodeSVG value={shareUrl} size={140} />
                  </div>
                  <button 
                    onPointerDown={() => setShowQR(false)} 
                    className="text-[14px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors"
                  >
                    Hide QR Code
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="show-qr"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onPointerDown={() => setShowQR(true)}
                className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 hover:bg-apple-parchment dark:hover:bg-[#2c2c2e] rounded-[14px] transition-colors active:scale-[0.98] shadow-sm"
              >
                <div className="flex items-center gap-3 text-[15px] font-medium text-apple-ink dark:text-white">
                  <QrCode className="w-5 h-5 text-apple-ink-muted" />
                  Show QR Code
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <button 
            onPointerDown={copyLink}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 hover:bg-apple-parchment dark:hover:bg-[#2c2c2e] rounded-[14px] transition-colors active:scale-[0.98] shadow-sm"
          >
            <div className="flex items-center gap-3 text-[15px] font-medium text-apple-ink dark:text-white">
              {copiedLink ? <Check className="w-5 h-5 text-[#34c759]" /> : <Copy className="w-5 h-5 text-apple-ink-muted" />}
              {copiedLink ? 'Copied Link' : 'Copy Link'}
            </div>
          </button>
        </div>

      </div>
    </div>
  );
}
