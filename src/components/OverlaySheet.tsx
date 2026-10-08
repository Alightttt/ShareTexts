import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

/**
 * OverlaySheet — the app's ONE overlay container: bottom sheet on mobile
 * (grabber, safe-area, thumb-reach), centered compact dialog on desktop.
 *
 * Every product overlay should feel like the same family — this carries the
 * shared anatomy so screens compose it instead of re-rolling backdrops,
 * radii, close buttons, Escape handling and focus behavior. (ConfirmSheet
 * keeps its own focused-decision anatomy; this is the container for forms
 * and flows.)
 *
 * Owns: portal to <body> (never trapped beneath a stacking context),
 * backdrop click + Escape dismissal, focus trap, the 22px entrance,
 * consistent radius/shadow/width. Callers own content and width class.
 */
export function OverlaySheet({
  open,
  onClose,
  label,
  maxWidth = 440,
  children,
  testId,
}: {
  open: boolean;
  onClose(): void;
  /** Accessible name of the dialog. */
  label: string;
  /** Desktop max width in px (mobile is always full-bleed bottom sheet). */
  maxWidth?: number;
  children: React.ReactNode;
  testId?: string;
}) {
  const { t } = useI18n();
  const trapRef = useFocusTrap(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.4 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            style={{ maxWidth }}
            className="relative w-full rounded-t-[24px] sm:rounded-[20px] bg-apple-canvas dark:bg-surface-dark border border-apple-divider/60 dark:border-white/[0.08] shadow-sheet sm:shadow-2xl p-5 sm:p-6 pb-[max(env(safe-area-inset-bottom),20px)] sm:pb-6 max-h-[90dvh] overflow-y-auto"
            data-testid={testId}
          >
            {/* Grabber — the mobile sheet grammar; hidden on desktop where
                the dialog floats. */}
            <span className="sm:hidden absolute top-2.5 left-1/2 -translate-x-1/2 w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" aria-hidden />
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-90 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null,
  );
}
