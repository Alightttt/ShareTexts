import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

/**
 * AnnouncementBar — the thin system-status strip, and the one announcement
 * a tool app is allowed to run: the truth about the connection it needs.
 *
 * The bar pattern usually decays into marketing (a dismissible ad for
 * whatever shipped last week). ShareTexts has nothing to sell and nothing
 * new to shout about, so the pattern is used for the one message that is
 * always true when it appears: this device has no network, and a
 * device-to-device transfer — whatever the marketing says — still needs
 * one. Until this existed, going offline was silent: the room just stopped
 * answering and every failure surfaced later, one action at a time.
 *
 * Shape: a compact dark pill, top-center, because the app is a fixed
 * h-dvh surface (no layout room to reserve a strip) and the landing's
 * header is empty at its center. It appears and disappears with the
 * browser's own online/offline events — no dismiss button, because the
 * way to make it leave is to come back online, which is also the fix.
 */
export function OfflineBanner({ className }: { className?: string }) {
  const { t } = useI18n();
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine === false
  );

  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          key="net"
          role="status"
          data-testid="offline-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'fixed left-0 right-0 top-3 z-[85] mx-auto flex w-max max-w-[92vw] items-center gap-2 rounded-full bg-apple-ink px-3.5 py-2 shadow-lg dark:bg-[#2e2e33]',
            className
          )}
        >
          <WifiOff className="h-3.5 w-3.5 shrink-0 text-white/70 dark:text-white/60" aria-hidden />
          <span className="truncate text-[12.5px] font-medium text-white dark:text-white/90">
            {t('net.offline')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default OfflineBanner;
