import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { LiveCodeDisplay } from '../components/LiveCodeDisplay';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Share, QrCode, Check, Edit2, Info } from 'lucide-react';

export function RoomHub() {
  const { session } = useSession();
  const [copiedLink, setCopiedLink] = useState(false);
  const [deviceName, setDeviceName] = useState('Guest Device');
  const [isEditingName, setIsEditingName] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    setDeviceName('Guest ' + getDeviceType());
  }, []);

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
    <div className="flex flex-col items-center min-h-screen bg-apple-canvas dark:bg-black px-6 py-12">
      <div className="w-full max-w-lg mt-8">
        
        {/* Waiting Indicator */}
        <div className="flex flex-col items-center mb-12">
          <div className="inline-flex items-center gap-3 py-2 px-4 bg-apple-parchment dark:bg-apple-tile-1 rounded-full mb-6">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-apple-blue opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-apple-blue"></span>
            </span>
            <span className="text-[14px] text-apple-ink dark:text-white font-medium tracking-tight">Waiting for your other device</span>
          </div>
          
          <div className="flex items-center gap-2 group">
            {isEditingName ? (
              <input 
                autoFocus
                type="text" 
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={e => e.key === 'Enter' && setIsEditingName(false)}
                className="bg-apple-parchment dark:bg-apple-tile-1 text-[17px] text-center rounded-[8px] px-3 py-1 outline-none focus:ring-2 ring-apple-blue text-apple-ink dark:text-white"
              />
            ) : (
              <button onClick={() => setIsEditingName(true)} className="flex items-center gap-2 text-[17px] font-medium text-apple-ink-muted hover:text-apple-ink dark:hover:text-white transition-colors">
                {deviceName} <Edit2 className="w-4 h-4 opacity-50 group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>

        {/* Primary: Live Code */}
        <div className="mb-12">
          <LiveCodeDisplay secret={session.secret} />
        </div>

        {/* Secondary Actions */}
        <div className="space-y-3 w-full">
          {showQR ? (
            <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px]">
              <div className="bg-white p-4 rounded-[11px] mb-4">
                <QRCodeSVG value={shareUrl} size={160} />
              </div>
              <button onClick={() => setShowQR(false)} className="text-[14px] text-apple-blue active:scale-95 transition-transform">Hide QR Code</button>
            </div>
          ) : (
            <button 
              onClick={() => setShowQR(true)}
              className="w-full flex items-center justify-between p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors active:scale-95"
            >
              <div className="flex items-center gap-4 text-[17px] font-medium text-apple-ink dark:text-white">
                <div className="w-10 h-10 rounded-full bg-white dark:bg-apple-tile-3 flex items-center justify-center shadow-sm">
                  <QrCode className="w-5 h-5 text-apple-ink dark:text-white" />
                </div>
                Show QR Code
              </div>
            </button>
          )}

          <div className="flex gap-3">
            <button 
              onClick={copyLink}
              className="flex-1 flex items-center justify-center gap-2 p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors text-[17px] font-medium text-apple-ink dark:text-white active:scale-95"
            >
              {copiedLink ? <Check className="w-5 h-5 text-[#34c759]" /> : <Copy className="w-5 h-5" />}
              {copiedLink ? 'Copied' : 'Copy Link'}
            </button>
            
            {navigator.share && (
              <button 
                onClick={shareNearby}
                className="flex-1 flex items-center justify-center gap-2 p-4 bg-apple-parchment dark:bg-apple-tile-1 hover:bg-apple-divider dark:hover:bg-apple-tile-2 rounded-[18px] transition-colors text-[17px] font-medium text-apple-ink dark:text-white active:scale-95"
              >
                <Share className="w-5 h-5" />
                Share
              </button>
            )}
          </div>
        </div>

        {/* Security line */}
        <div className="mt-12 flex justify-center">
          <div className="flex items-center gap-2 text-[12px] text-apple-ink-muted">
            <Info className="w-4 h-4" />
            <span>Your session is temporary. It expires when you leave.</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function getDeviceType() {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'iPhone';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Win/.test(ua)) return 'Windows';
  return 'Device';
}
