/**
 * ConnectHandshake — the pairing moment. One still, calm scene:
 *
 *   searching   — two devices, a quiet dotted line between them
 *   connecting  — the same scene; a single ember dot crosses the straight
 *                 gap (one direction, then the other). The devices never
 *                 move — no glide, no slide, no "slope" feel.
 *   connected   — the dotted line becomes solid green and a check fades in
 *                 at its center; the scene then holds perfectly still
 *
 * Everything eases on the app's Apple-like curve and settles. Reduced-motion
 * flattens it via MotionConfig.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Smartphone, Monitor } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export type HandshakePhase = 'searching' | 'connecting' | 'connected';

interface ConnectHandshakeProps {
  phase: HandshakePhase;
  /** Icon for the local device tile. */
  localIcon?: 'phone' | 'monitor';
  /** Name shown under the partner tile once known. */
  partnerName?: string | null;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const TILE = 64;

function DeviceTile({ kindIcon, accent, lifted }: { kindIcon: 'phone' | 'monitor'; accent: string; lifted: boolean }) {
  const Icon = kindIcon === 'phone' ? Smartphone : Monitor;
  return (
    <div
      className="relative flex items-center justify-center rounded-[20px] shrink-0 bg-white dark:bg-[#1a1a1e] border transition-shadow duration-300"
      style={{
        width: TILE,
        height: TILE,
        borderColor: accent,
        boxShadow: lifted ? `0 10px 28px -14px ${accent}66` : '0 1px 2px rgba(0,0,0,0.05)',
      }}
    >
      <Icon className="w-7 h-7" style={{ color: accent }} aria-hidden="true" />
    </div>
  );
}

export function ConnectHandshake({ phase, localIcon = 'phone', partnerName }: ConnectHandshakeProps) {
  const { t } = useI18n();
  const connecting = phase === 'connecting';
  const connected = phase === 'connected';
  const isPhone = localIcon === 'phone';

  // One hue telling the truth: ember while linking, system green when live.
  const accent = connected ? '#34c759' : 'var(--ht-accent, #f06413)';
  // Fixed gap — the devices never move, so the scene is always level and
  // still (the animated width read as a diagonal "slide").
  const gap = 72;

  const status = connected ? t('connect.linked') : connecting ? t('connect.establishing') : t('connect.searching');

  return (
    <div className="flex flex-col items-center w-full select-none" data-testid="connect-handshake" data-phase={phase}>
      {/* The scene: local tile — link — partner tile */}
      <div className="relative flex items-center" style={{ minHeight: TILE + 40 }}>
        {/* Local tile */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-2"
          animate={{ marginRight: 0 }}
        >
          <DeviceTile kindIcon={localIcon} accent={accent} lifted={connecting || connected} />
          <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">{t('connect.thisDevice')}</span>
        </motion.div>

        {/* The middle: fixed width — a level bridge between the tiles */}
        <div
          className="relative flex items-center justify-center"
          style={{ width: gap, height: TILE }}
        >
          {/* Dotted guide — present while searching AND connecting so the
              gap always reads as "a line is forming here", never dead space. */}
          {!connected && (
            <div aria-hidden="true" className="absolute inset-x-1 top-1/2 -translate-y-1/2 border-t border-dashed border-apple-divider dark:border-white/15" />
          )}

          {/* Traveling dot — the only loop, and the simplest honest one: a
              dot glides level left → right, then back, along the straight
              dotted line. No bounce, no tilt, no scale. */}
          {connecting && (
            <motion.span
              aria-hidden="true"
              className="absolute top-1/2 w-1.5 h-1.5 rounded-full"
              style={{ background: accent, left: '50%', marginTop: -3 }}
              initial={{ x: -gap / 2 + 4, opacity: 0 }}
              animate={{
                x: [-gap / 2 + 4, gap / 2 - 4, gap / 2 - 4, -gap / 2 + 4],
                opacity: [0, 1, 1, 0],
                transition: { duration: 1.6, times: [0, 0.42, 0.58, 1], repeat: Infinity, ease: 'easeInOut' },
              }}
            />
          )}
          <AnimatePresence>
            {connected && (
              <motion.div
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 rounded-full"
                style={{ background: accent, height: 2.5 }}
                initial={{ width: 0, opacity: 1 }}
                animate={{ width: '100%', opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              />
            )}
          </AnimatePresence>

          {/* Check — fades up at the center of the drawn link. No scale pop. */}
          <AnimatePresence>
            {connected && (
              <motion.span
                className="relative z-20 flex items-center justify-center w-8 h-8 rounded-full bg-status-success shadow-[0_4px_14px_-6px_rgba(52,199,89,0.55)]"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: 0.15 }}
              >
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Partner tile */}
        <motion.div className="relative z-10 flex flex-col items-center gap-2">
          <DeviceTile kindIcon={isPhone ? 'monitor' : 'phone'} accent={connected ? 'rgba(52,199,89,0.45)' : accent} lifted={connecting} />
          <motion.span
            key={partnerName || 'pair'}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="max-w-[110px] truncate text-[11px] font-medium text-apple-ink-muted dark:text-white/45"
          >
            {connected ? (partnerName || t('pair.paired')) : t('connect.otherDevice')}
          </motion.span>
        </motion.div>
      </div>

      {/* Status line — crossfades, never bounces */}
      <AnimatePresence mode="wait">
        <motion.p
          key={status}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="mt-2 text-[13.5px] font-semibold text-apple-ink dark:text-white/85"
          aria-live="polite"
        >
          {status}
        </motion.p>
      </AnimatePresence>
      {!connected && (
        <p className="mt-1 text-[12px] text-apple-ink-muted/70 dark:text-white/35">{t('connect.sub')}</p>
      )}
    </div>
  );
}
