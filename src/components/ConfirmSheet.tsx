import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useI18n } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';

/**
 * ConfirmSheet — an Apple-style bottom action sheet for one decision.
 *
 * Slides up from the bottom edge on mobile (thumb-reach, iOS action-sheet
 * grammar); on ≥sm screens it becomes a centered compact dialog, which is
 * the desktop-appropriate form of the same decision. Backdrop click, Escape,
 * or Cancel dismiss; the destructive action confirms. Focus is trapped while
 * open and restored on close; the destructive button is armed by default.
 */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = true,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}) {
  const { t } = useI18n();
  // Trap Tab within the sheet but DON'T pass onCancel — the effect below owns
  // Escape. Passing it here would make the trap's own initial-focus effect
  // race the confirm-button focus and steal focus back to the first button.
  const trapRef = useFocusTrap(open);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); };
  }, [open, onCancel]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] bg-black/35 dark:bg-black/60 flex items-end sm:items-center justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          <motion.div
            ref={trapRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="w-full sm:max-w-[360px]"
          >
            {/* GRABBER + SHEET — full-bleed on mobile with safe-area padding;
                rounded card on desktop. One DOM, two presentations. */}
            <div className="sm:rounded-[20px] sm:overflow-hidden rounded-t-[24px] bg-white/95 dark:bg-[#1c1c21]/95 backdrop-blur-2xl sm:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.4)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.3)] pb-[env(safe-area-inset-bottom)] sm:pb-0">
              <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
                <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
              </div>
              <div className="px-6 pt-4 sm:pt-5 pb-2 text-center">
                <h3 className="text-[16.5px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{title}</h3>
                {body && (
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{body}</p>
                )}
              </div>
              <div className="px-4 sm:px-4 pb-4 sm:pb-4 pt-2 flex flex-col-reverse sm:flex-col gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="w-full min-h-[44px] rounded-[14px] bg-black/[0.045] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.11] text-[15px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98]"
                >
                  {cancelLabel}
                </button>
                <button
                  ref={confirmRef}
                  type="button"
                  onClick={onConfirm}
                  className={
                    destructive
                      ? 'w-full min-h-[44px] rounded-[14px] bg-status-danger hover:bg-[#e5352a] text-[15px] font-semibold text-white transition-colors active:scale-[0.98]'
                      : 'w-full min-h-[44px] rounded-[14px] bg-ember hover:bg-brand-strong text-[15px] font-semibold text-white transition-colors active:scale-[0.98]'
                  }
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    // Portal to <body>: fixed overlays must paint above EVERY pane. The
    // desktop room pane creates a stacking context (relative isolate) that
    // otherwise traps the sheet beneath it, making buttons unclickable.
    typeof document !== 'undefined' ? document.body : null
  );
}
