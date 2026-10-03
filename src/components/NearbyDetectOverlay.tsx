import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, Infinity as InfinityIcon } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { useI18n } from '../lib/i18n';
import { useFocusTrap } from '../lib/useFocusTrap';
import { cn } from '../lib/utils';
import { DeviceArt } from './DeviceArt';

/**
 * NearbyDetectOverlay — the one popup BOTH nearby devices see.
 *
 * When ShareTexts opens on two devices near each other, each landing page
 * pops this overlay the moment the other appears:
 *
 *   · a small device glyph (phone / tablet / desktop) BEFORE the name,
 *   · the device name as the headline, the browser as a short sub-label,
 *   · the quiet eyebrow "A nearby device detected",
 *   · three honest options: "Connect with this device?" · "Find more
 *     devices nearby" · Cancel — plus a cancel ✕ at the top.
 *
 * The connect is a TWO-STEP confirm, in the button itself: the first tap
 * arms it ("Connect with this device?" → "Yes"), the second tap commits.
 * On the receiving side the same overlay switches to its incoming mode
 * ("{name} wants to connect") where a single "Yes" accepts — the sender
 * already confirmed twice, so the receiver confirms once.
 *
 * When this device still holds a Stay Connected room, a small ∞ badge
 * rides next to the name — the promise travels with the device.
 *
 * Presentation follows the app's ConfirmSheet grammar: bottom sheet on
 * mobile (thumb reach), centered card on ≥sm. Portaled to <body> so the
 * desktop room pane's stacking context can never trap it. Focus is
 * trapped while open; Escape and the backdrop cancel.
 */

export interface DetectOverlayDevice {
  name: string;
  kind: 'phone' | 'tablet' | 'desktop';
  browser: string;
  /** Exact model when the web platform knows it (Android builds). */
  model?: string;
  /** GPU vendor hint (desktops): NVIDIA / AMD / Intel / Apple. */
  gpu?: string;
}

export function NearbyDetectOverlay({
  mode,
  device,
  busy = false,
  stayBadge = false,
  onConnect,
  onCancel,
  onFindMore,
}: {
  mode: 'detected' | 'incoming';
  device: DetectOverlayDevice | null;
  busy?: boolean;
  stayBadge?: boolean;
  onConnect: () => void;
  onCancel: () => void;
  onFindMore?: () => void;
}) {
  const { t } = useI18n();
  const open = !!device;
  // Keep the last device through the exit animation so the card doesn't
  // snap to empty while fading out.
  const lastDeviceRef = useRef<DetectOverlayDevice | null>(null);
  if (device) lastDeviceRef.current = device;
  const shown = device ?? lastDeviceRef.current;

  const trapRef = useFocusTrap(open, onCancel);
  const [armed, setArmed] = useState(false);
  // A new target (or a switch to incoming) always starts unarmed — the
  // confirmation belongs to THIS device, not to the last one.
  useEffect(() => { setArmed(false); }, [device?.name, mode]);
  const connectRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => connectRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [open, armed]);

  return createPortal(
    <AnimatePresence>
      {open && shown && (
        <motion.div
          key="nearby-detect"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[90] bg-black/35 dark:bg-black/60 flex items-end sm:items-center justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'incoming' ? t('nearby.inviteTitle', { name: shown.name }) : t('nearby.overlay.title')}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
          <motion.div
            ref={trapRef}
            initial={{ y: '100%', scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: '100%', scale: 0.98, transition: { duration: 0.18, ease: 'easeIn' } }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="w-full sm:max-w-[380px]"
            data-testid="nearby-detect-overlay"
          >
            <div className="relative sm:rounded-[22px] sm:overflow-hidden rounded-t-[26px] bg-white/95 dark:bg-[#1c1c21]/95 backdrop-blur-2xl sm:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.4)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.3)] pb-[max(env(safe-area-inset-bottom),14px)] sm:pb-0">
              {/* Grabber (mobile) + top cancel ✕ — the sheet grammar. */}
              <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
                <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label={t('nearby.overlay.cancel')}
                className="absolute top-3 right-3 z-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-apple-ink-muted/70 dark:text-white/40 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="px-6 pt-5 sm:pt-6 pb-2 text-center">
                {/* Eyebrow — the state, in the app's quiet uppercase voice.
                    Detected: "A nearby device detected". Incoming: who's asking. */}
                <motion.p
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.25 }}
                  className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#f06413] dark:text-[#fb9243]"
                >
                  {mode === 'incoming'
                    ? t('nearby.inviteTitle', { name: shown.name })
                    : t('nearby.overlay.title')}
                </motion.p>
                {/* The device itself — authored platform art (brand-tinted
                    where the platform tells us its hue), not a stock glyph.
                    The tile mirrors the landing rows so the popup and the
                    list read as one system. */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.3, duration: 0.5, delay: 0.06 }}
                  className="mt-3.5 flex items-center justify-center"
                >
                  <DeviceArt
                    kind={shown.kind}
                    model={shown.model}
                    gpu={shown.gpu}
                    size={64}
                    pulse={mode === 'detected' && !busy}
                  />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12, duration: 0.25 }}
                  className="mt-3 flex flex-col items-center leading-tight"
                >
                  <span className="flex items-center gap-2 max-w-full">
                    <span className="text-[17px] font-semibold text-apple-ink dark:text-white truncate max-w-[200px]">
                      {shown.name}
                    </span>
                    {stayBadge && (
                      <span
                        role="status"
                        title={t('stay.badge')}
                        data-testid="nearby-detect-stay-badge"
                        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]"
                      >
                        <InfinityIcon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                      </span>
                    )}
                  </span>
                  {/* Truth ladder for the sub-line: exact model when the
                      device told us one (Android), otherwise the browser
                      label, otherwise the neutral nearby state. Never an
                      invented model. */}
                  <span className="mt-0.5 text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45 truncate max-w-[220px]">
                    {shown.model || shown.browser || t('nearby.nearby')}
                  </span>
                  {shown.model && shown.browser && (
                    <span className="text-[11.5px] font-medium text-apple-ink-muted/70 dark:text-white/35">
                      {shown.browser}
                    </span>
                  )}
                </motion.div>
                {mode === 'incoming' && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.18, duration: 0.25 }}
                    className="mt-2.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug"
                  >
                    {t('nearby.inviteBody')}
                  </motion.p>
                )}
              </div>

              <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-1 flex flex-col gap-2">
                {/* PRIMARY — the two-step confirm lives IN this button:
                    "Connect with this device?" arms, "Yes" commits. */}
                <button
                  ref={connectRef}
                  type="button"
                  data-testid="nearby-detect-primary"
                  disabled={busy}
                  onClick={() => {
                    if (busy) return;
                    if (mode === 'incoming' || armed) { onConnect(); return; }
                    setArmed(true);
                  }}
                  className={cn(
                    'w-full min-h-[48px] rounded-[14px] bg-ember hover:bg-brand-strong text-[15px] font-semibold text-white',
                    'transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none',
                    'flex items-center justify-center gap-2',
                    armed && 'ring-2 ring-[#f06413]/35 dark:ring-[#fb9243]/40 ring-offset-2 ring-offset-white dark:ring-offset-[#1c1c21]'
                  )}
                >
                  {busy ? (
                    <>
                      <SpinLoader size={16} aria-hidden />
                      {t('nearby.overlay.connecting')}
                    </>
                  ) : mode === 'incoming' || armed ? (
                    t('nearby.overlay.yes')
                  ) : (
                    t('nearby.overlay.connect')
                  )}
                </button>
                {/* SECONDARY — stay on the landing page and browse the
                    discovery list instead of committing to this one device. */}
                {mode === 'detected' && onFindMore && (
                  <button
                    type="button"
                    data-testid="nearby-detect-more"
                    disabled={busy}
                    onClick={onFindMore}
                    className="w-full min-h-[44px] rounded-[14px] bg-black/[0.045] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.11] text-[14px] font-semibold text-apple-ink dark:text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-1.5"
                  >
                    <Search className="w-4 h-4" aria-hidden />
                    {t('nearby.overlay.more')}
                  </button>
                )}
                {/* QUIET — Cancel closes without deciding anything. */}
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={busy}
                  className="w-full min-h-[40px] rounded-[14px] text-[14px] font-semibold text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors active:scale-[0.98]"
                >
                  {t('nearby.overlay.cancel')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null
  );
}
