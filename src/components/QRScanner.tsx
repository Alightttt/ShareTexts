import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff } from 'lucide-react';
import { useI18n } from '../lib/i18n';

/**
 * Camera QR scanner. Crash-hardened: the `#qr-reader` element MUST stay in
 * the DOM for the lifetime of the component — html5-qrcode's constructor
 * throws when the element is missing, and previously the error state removed
 * it, so a parent re-render (new onScan identity → effect re-run) crashed the
 * whole app to the error boundary. Callbacks are read through refs so the
 * camera lifecycle runs exactly once per mount, and every camera call is
 * guarded: any failure degrades to the translated error state, never a crash.
 */
export function QRScanner({ onScan, onErrorFallback }: { onScan: (text: string) => void, onErrorFallback: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // Latest-callback refs: the scan stream must not be torn down and restarted
  // (nor its element re-queried) just because the parent re-created a handler.
  const onScanRef = useRef(onScan);
  const fallbackRef = useRef(onErrorFallback);
  onScanRef.current = onScan;
  fallbackRef.current = onErrorFallback;

  useEffect(() => {
    let isMounted = true;
    let scanner: Html5Qrcode | null = null;
    try {
      scanner = new Html5Qrcode('qr-reader');
    } catch {
      // Element missing or the library refuses to init — show the fallback
      // instead of crashing the tree.
      if (isMounted) setError(t('qr.cameraUnavailable'));
      return;
    }
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (isMounted) {
          onScanRef.current(decodedText);
          scanner?.stop().catch(() => { /* already stopped */ });
        }
      },
      () => {
        // Normal scanning noise (no code in frame) — ignore.
      }
    ).catch(() => {
      // Camera unavailable (permission denied, no device, secure-context) —
      // degrade to the manual-code path; the #qr-reader element stays mounted.
      if (isMounted) setError(t('qr.cameraUnavailable'));
    });

    return () => {
      isMounted = false;
      if (scanner?.isScanning) {
        scanner.stop().catch(() => { /* already stopped */ });
      }
      scannerRef.current = null;
    };
    // Run once per mount: callbacks arrive via refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errorBranch = error !== null;

  return (
    <div className="flex flex-col items-center w-full">
      {/* Never unmounted: html5-qrcode requires this element to exist for as
          long as any scanner instance can be constructed here. */}
      <div
        id="qr-reader"
        className={errorBranch ? 'hidden' : 'w-full max-w-[320px] rounded-[18px] overflow-hidden bg-black mb-6'}
      ></div>
      {errorBranch ? (
        <div className="flex flex-col items-center justify-center p-8 bg-apple-parchment dark:bg-apple-tile-1 rounded-[18px] text-center w-full max-w-[320px] mb-6">
          <CameraOff className="w-10 h-10 text-apple-ink-muted mb-4" />
          <p className="text-[17px] font-medium text-apple-ink dark:text-white mb-2">{error}</p>
          <button onClick={() => fallbackRef.current()} className="text-apple-blue text-[17px]">
            {t('qr.scan.typeCode')}
          </button>
        </div>
      ) : (
        <button onClick={() => fallbackRef.current()} className="text-apple-blue text-[17px]">
          {t('qr.scan.trouble')}
        </button>
      )}
    </div>
  );
}
