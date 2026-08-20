import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, X } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'sharetext.installDismissed';

/**
 * The PWA install moment. Appears as a quiet pill on the landing page when
 * the browser offers installation (desktop + Android), once per device.
 * iOS has no beforeinstallprompt — the meta tags in index.html make Safari's
 * "Add to Home Screen" available instead.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // Only show the install prompt AFTER the user has successfully used the app
  // (i.e., completed at least one transfer). This prevents the prompt from
  // competing with the primary transfer journey.
  useEffect(() => {
    if (!deferred) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
      if (!localStorage.getItem('sharetext.hasTransfer')) return;
    } catch { /* private mode */ }
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, [deferred]);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    setInstalling(true);
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
    setInstalling(false);
  };

  return (
    <AnimatePresence>
      {visible && deferred && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 pl-3 pr-2 py-2 rounded-full bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 shadow-float"
        >
          <span className="w-9 h-9 rounded-full bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center shrink-0">
            <ShareTextLogo size={18} className="text-apple-ink dark:text-white" />
          </span>
          <span className="text-[14px] font-semibold text-apple-ink dark:text-white whitespace-nowrap">
            Install ShareText
          </span>
          <button
            onClick={install}
            disabled={installing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[13px] font-semibold transition-motion active:scale-95 disabled:opacity-60 min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5" />
            {installing ? 'Installing…' : 'Install'}
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
