import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Xmark as X, ArrowUpFromSquare as Share2, ArrowDownToLine as Download } from '@gravity-ui/icons';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { hasUsedApp } from '../lib/rating';
import { ShareTextsLogo } from './ShareTextsLogo';
import {
  hasInstallPrompt,
  initInstallCapture,
  isManualInstallPlatform,
  noteVisit,
  promptInstall,
  shouldOfferInstall,
  silenceInstall,
} from '../lib/pwaInstall';

/**
 * InstallNudge — "keep it handy?", asked once, at a calm moment.
 *
 * What keeps it from being one of those banners people learn to hate:
 *
 *   · IT WAITS. Twelve seconds after load, so it never lands on top of the
 *     thing the visitor came to do; and it only appears after real use or a
 *     second visit (shouldOfferInstall).
 *   · IT IS SMALL AND IN THE CORNER. A card, not a modal, not an overlay,
 *     no backdrop, nothing to dismiss before using the app.
 *   · IT CANNOT LIE. On Chromium the button triggers the browser's own
 *     install prompt. On iOS the card says "Share → Add to Home Screen" in
 *     words, because that is the only thing that works there.
 *   · IT STOPS. "Not now" is remembered for two weeks; dismissing forever
 *     is one tap away; installed apps never see it again.
 */
export function InstallNudge() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    initInstallCapture();
    noteVisit();
    // The demo/QA escape hatch: ?install=1 shows the card on demand.
    const forced = typeof window !== 'undefined' && /[?&]install=1/.test(window.location.search);
    const timer = window.setTimeout(() => {
      if (forced || shouldOfferInstall(hasUsedApp())) {
        setManual(isManualInstallPlatform() && !hasInstallPrompt());
        setVisible(true);
      }
    }, forced ? 400 : 12000);
    return () => window.clearTimeout(timer);
  }, []);

  const close = (forever: boolean) => {
    silenceInstall(forever);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          data-testid="install-nudge"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'fixed z-[80] flex items-start gap-3 rounded-[16px] border border-black/[0.08] bg-white/95 p-3.5 pr-2.5',
            'shadow-[0_16px_44px_-16px_rgba(20,16,10,0.35)] backdrop-blur-md',
            'dark:border-white/[0.1] dark:bg-[#1e1e22]/95',
            'left-4 right-4 bottom-[max(env(safe-area-inset-bottom),16px)]',
            'sm:right-auto sm:bottom-16 sm:w-[330px]',
          )}
        >
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-apple-parchment dark:bg-white/[0.06]">
            <ShareTextsLogo size={20} />
            {!manual && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-ember text-white">
                <Download className="h-2.5 w-2.5" aria-hidden />
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold leading-snug text-apple-ink dark:text-white">
              {t('install.title')}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-apple-ink-muted dark:text-white/55">
              {manual ? t('install.iosBody') : t('install.body')}
            </span>

            <span className="mt-2.5 flex items-center gap-2">
              {/* iOS has no install API to call, so there is no button here —
                  the instruction in the body IS the action. A fake button
                  would be worse than none. */}
              {manual ? (
                <span className="inline-flex min-h-[36px] items-center gap-1.5 text-[12.5px] font-semibold text-ember dark:text-[#fb9243]">
                  <Share2 className="h-3.5 w-3.5" aria-hidden />
                  Share › Add to Home Screen
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="install-cta"
                  onClick={async () => {
                    const shown = await promptInstall();
                    if (!shown) silenceInstall(true);
                    setVisible(false);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ember px-3.5 text-[12.5px] font-semibold text-white transition-transform active:scale-[0.97]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {t('install.cta')}
                </button>
              )}
              <button
                type="button"
                data-testid="install-snooze"
                onClick={() => close(false)}
                className="inline-flex min-h-[36px] items-center px-2 text-[12.5px] font-medium text-apple-ink-muted transition-colors hover:text-apple-ink dark:text-white/45 dark:hover:text-white"
              >
                {t('install.later')}
              </button>
              <button
                type="button"
                data-testid="install-never"
                onClick={() => close(true)}
                className="inline-flex min-h-[36px] items-center px-1.5 text-[12.5px] font-medium text-apple-ink-muted/70 transition-colors hover:text-apple-ink dark:text-white/30 dark:hover:text-white/70"
              >
                {t('install.never')}
              </button>
            </span>
          </span>

          <button
            type="button"
            aria-label={t('install.later')}
            onClick={() => close(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-apple-ink-muted transition-colors hover:bg-black/[0.05] hover:text-apple-ink dark:text-white/40 dark:hover:bg-white/[0.08] dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default InstallNudge;
