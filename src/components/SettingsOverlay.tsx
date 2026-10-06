import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Moon, Sun, RefreshCw, WifiOff, Languages } from 'lucide-react';
import { SegmentedToggleButton } from './spaceui/SegmentedToggleButton';
import { LanguageMenu } from './LanguageMenu';
import { StayConnectedToggle } from './StayConnectedToggle';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { useSession } from '../lib/SessionContext';
import { useFocusTrap } from '../lib/useFocusTrap';
import { cn } from '../lib/utils';

/**
 * SettingsOverlay — ONE settings surface for desktop and mobile.
 *
 * Opens from the room header's gear (and the landing header's, when wired).
 * Sections:
 *
 *   · APPEARANCE  — the app's REAL theme toggle, untouched (its geometry,
 *     feel and look are the standard every other switch copies), with an
 *     explicit Dark/Light label that always states the CURRENT side.
 *   · LANGUAGE    — the existing language menu, embedded.
 *   · STAY CONNECTED — the room's keep-alive promise (room sessions only).
 *   · RECONNECTION   — the live link state and an explicit Reconnect now
 *     action for the moments the automatic recovery needs a hand.
 *
 * Same sheet grammar as ConfirmSheet: bottom sheet on mobile, centered
 * card on ≥sm, focus-trapped, Escape/backdrop/✕ to close.
 */
export function SettingsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { resolved, choice, setChoice } = useTheme();
  const isDark = resolved === 'dark';
  // Light — System — Dark: system sits BETWEEN the two poles, because
  // "follow the OS" is a real answer, not a position on the light/dark line.
  const THEME_ORDER = ['light', 'system', 'dark'] as const;
  const { session, requestReconnect } = useSession();
  const inRoom = !!session.roomId;
  const trapRef = useFocusTrap(open, onClose);
  const [reconnecting, setReconnecting] = React.useState(false);

  const linkState = session.connectionType;
  const unhealthy = linkState === 'connecting' || linkState === 'disconnected';

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
          aria-label={t('settings.title')}
          onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={trapRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="w-full sm:max-w-[400px]"
            data-testid="settings-overlay"
          >
            <div className="relative sm:rounded-[22px] sm:overflow-hidden rounded-t-[26px] bg-white/95 dark:bg-[#1c1c21]/95 backdrop-blur-2xl sm:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.4)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.3)] pb-[max(env(safe-area-inset-bottom),14px)] sm:pb-0">
              <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden>
                <span className="w-9 h-1 rounded-full bg-black/15 dark:bg-white/20" />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close')}
                className="absolute top-3 right-3 z-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center text-apple-ink-muted/70 dark:text-white/40 hover:text-apple-ink dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.07] active:scale-90 transition-all"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="px-6 pt-5 sm:pt-6 pb-1">
                <h3 className="text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                  {t('settings.title')}
                </h3>
              </div>

              <div className="px-4 sm:px-5 pt-2 pb-4 sm:pb-5 flex flex-col gap-1">
                {/* ── Appearance ─────────────────────────────────── */}
                <p className="st-eyebrow px-2 pt-1 pb-1">
                  {t('settings.theme')}
                </p>
                <div className="flex items-center gap-3 px-2 py-2 rounded-[14px]">
                  <span
                    className={cn(
                      'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                      isDark
                        ? 'bg-white/[0.07] text-white/70'
                        : 'bg-[#f59e0b]/10 text-[#d97706]'
                    )}
                    aria-hidden
                  >
                    {isDark ? <Moon className="w-4 h-4" strokeWidth={2} /> : <Sun className="w-4 h-4" strokeWidth={2} />}
                  </span>
                  {/* The real OpenSourceUI SegmentedToggleButton. A switch can
                      only say "the other side" — the theme has THREE honest
                      answers, and System is the one most people actually want.
                      The sliding thumb states which is live; nothing else on
                      the row needs to repeat it. */}
                  <SegmentedToggleButton
                    className="flex-1 min-w-0"
                    ariaLabel={t('settings.theme')}
                    options={[t('settings.light'), t('settings.system'), t('settings.dark')]}
                    value={Math.max(THEME_ORDER.indexOf(choice as typeof THEME_ORDER[number]), 0)}
                    onChange={(i) => setChoice(THEME_ORDER[i] ?? 'system')}
                    data-testid="settings-theme-segmented"
                  />
                </div>

                {/* ── Language ───────────────────────────────────── */}
                <p className="st-eyebrow px-2 pt-3 pb-1">
                  {t('settings.language')}
                </p>
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-[14px]">
                  <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/50" aria-hidden>
                    <Languages className="w-4 h-4" strokeWidth={2} />
                  </span>
                  <span className="flex-1 text-[13.5px] font-semibold text-apple-ink dark:text-white">
                    {t('settings.language')}
                  </span>
                  {/* The existing menu, opening leftward inside the card. */}
                  <LanguageMenu align="left" />
                </div>

                {/* ── Stay Connected (room sessions only) ────────── */}
                {inRoom && (
                  <>
                    <p className="st-eyebrow px-2 pt-3 pb-1">
                      {t('settings.room')}
                    </p>
                    <StayConnectedToggle />
                  </>
                )}

                {/* ── Reconnection (room sessions only) ──────────── */}
                {inRoom && (
                  <>
                    <p className="st-eyebrow px-2 pt-3 pb-1">
                      {t('settings.reconnect')}
                    </p>
                    <div className="flex items-center gap-3 px-2 py-2">
                      <span
                        className={cn(
                          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                          unhealthy
                            ? 'bg-status-warning/10 text-status-warning'
                            : 'bg-status-success/10 text-status-success'
                        )}
                        aria-hidden
                      >
                        {unhealthy ? <WifiOff className="w-4 h-4" strokeWidth={2} /> : <span className="w-2 h-2 rounded-full bg-status-success shadow-[0_0_6px_rgba(52,199,89,0.7)]" />}
                      </span>
                      <span className="flex-1 flex flex-col min-w-0 leading-tight">
                        <span className="text-[13.5px] font-semibold text-apple-ink dark:text-white">
                          {linkState === 'disconnected'
                            ? t('chat.disconnected')
                            : linkState === 'connecting'
                              ? t('chat.reconnecting')
                              : t('common.connected')}
                        </span>
                        <span className="text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45">
                          {t('settings.reconnectHint')}
                        </span>
                      </span>
                      <button
                        type="button"
                        data-testid="settings-reconnect"
                        disabled={reconnecting}
                        onClick={() => {
                          setReconnecting(true);
                          void requestReconnect().finally(() => setReconnecting(false));
                        }}
                        className={cn(
                          'shrink-0 flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full text-[13px] font-semibold active:scale-[0.97] transition-all',
                          unhealthy
                            ? 'bg-ember hover:bg-brand-strong text-white'
                            : 'bg-black/[0.045] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.11] text-apple-ink dark:text-white'
                        )}
                      >
                        <RefreshCw className={cn('w-3.5 h-3.5', reconnecting && 'animate-spin')} aria-hidden />
                        {t('settings.reconnectNow')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    typeof document !== 'undefined' ? document.body : null
  );
}
