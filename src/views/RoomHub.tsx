import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Share, QrCode, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

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

  const shareNearby = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join ShareText Session',
          url: shareUrl
        });
      } catch (err) {}
    } else {
      copyLink();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-apple-canvas dark:bg-black p-6">
      <div className="w-full max-w-md text-center flex flex-col items-center">
        
        <h2 className="text-[28px] font-semibold text-apple-ink dark:text-white tracking-tight mb-8">
          Connect your other device
        </h2>

        {/* Primary: Live Code */}
        <div className="w-full mb-6">
          <LiveCodeDisplay secret={session.secret} />
        </div>

        {/* Secondary Actions */}
        <div className="w-full space-y-3">
          <AnimatePresence mode="popLayout">
            {showQR ? (
              <motion.div
                key="qr"
                initial={{ opacity: 0, height: 0, scale: 0.95 }}
                animate={{ opacity: 1, height: 'auto', scale: 1 }}
                exit={{ opacity: 0, height: 0, scale: 0.95 }}
                className="overflow-hidden"
              >
                <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px]">
                  <div className="bg-white p-4 rounded-[11px] mb-4">
                    <QRCodeSVG value={shareUrl} size={160} />
                  </div>
                  <button 
                    onClick={() => setShowQR(false)} 
                    className="text-[15px] font-medium text-apple-blue hover:text-apple-blue-focus transition-colors"
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
                onClick={() => setShowQR(true)}
                className="w-full flex items-center justify-between p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors active:scale-95"
              >
                <div className="flex items-center gap-4 text-[17px] font-medium text-apple-ink dark:text-white">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-apple-tile-3 flex items-center justify-center shadow-sm">
                    <QrCode className="w-5 h-5 text-apple-ink dark:text-white" />
                  </div>
                  Scan QR
                </div>
              </motion.button>
            )}
          </AnimatePresence>

          <div className="flex gap-3">
            {navigator.share ? (
              <>
                <button 
                  onClick={copyLink}
                  className="flex-1 flex items-center justify-center gap-2 p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors text-[17px] font-medium text-apple-ink dark:text-white active:scale-95"
                >
                  {copiedLink ? <Check className="w-5 h-5 text-[#34c759]" /> : <Copy className="w-5 h-5" />}
                  {copiedLink ? 'Copied' : 'Copy Code'}
                </button>
                <button 
                  onClick={shareNearby}
                  className="flex-1 flex items-center justify-center gap-2 p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors text-[17px] font-medium text-apple-ink dark:text-white active:scale-95"
                >
                  <Share className="w-5 h-5" />
                  Share Link
                </button>
              </>
            ) : (
              <button 
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors text-[17px] font-medium text-apple-ink dark:text-white active:scale-95"
              >
                {copiedLink ? <Check className="w-5 h-5 text-[#34c759]" /> : <Copy className="w-5 h-5" />}
                {copiedLink ? 'Copied' : 'Copy Link'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
