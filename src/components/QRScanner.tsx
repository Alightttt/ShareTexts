import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff } from 'lucide-react';

export function QRScanner({ onScan, onErrorFallback }: { onScan: (text: string) => void, onErrorFallback: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (isMounted) {
          onScan(decodedText);
          scanner.stop();
        }
      },
      (err) => {
        // Ignore normal scanning errors (no code found)
      }
    ).catch(err => {
      if (isMounted) {
        setError('Camera isn\u2019t available. Enter the code instead.');
      }
    });

    return () => {
      isMounted = false;
      if (scanner.isScanning) {
        scanner.stop().catch(console.error);
      }
    };
  }, [onScan]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px] text-center min-h-[300px]">
        <CameraOff className="w-10 h-10 text-apple-ink-muted mb-4" />
        <p className="text-[17px] font-medium text-apple-ink dark:text-white mb-2">{error}</p>
        <button onClick={onErrorFallback} className="text-apple-blue text-[17px]">
          Enter code instead
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div id="qr-reader" className="w-full max-w-[320px] rounded-[18px] overflow-hidden bg-black mb-6"></div>
      <button onClick={onErrorFallback} className="text-apple-blue text-[17px]">
        Having trouble scanning?
      </button>
    </div>
  );
}
