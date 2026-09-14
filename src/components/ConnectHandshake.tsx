/**
 * ConnectHandshake — the pairing moment. Simplified to one calm scene:
 *
 *   searching   — two devices apart, a quiet dotted line between them
 *   connecting  — the devices glide closer, a single ember dot crosses the
 *                 gap once per pass (one direction, then the other) —
 *                 no bounce, no pulsing chip, no gradient sweep
 *   connected   — the link draws in solid green and a check fades in at
 *                 its center; the scene then holds perfectly still
 *
 * Everything eases on the app's Apple-like curve (cubic-bezier(0.23,1,0.32,1))
 * and settles — nothing loops except the single traveling dot while
 * connecting. Reduced-motion flattens it via MotionConfig.
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Smartphone, Monitor } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

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

  // Freeze the convergence once connected so the tiles don't spring back —
  // state transitions are one-way in the real flow (connecting → connected).
  const [converged, setConverged] = useState(false);
  useEffect(() => {
    if (connected) setConverged(true);
  }, [connected]);

  // One hue telling the truth: ember while linking, system green when live.
  const accent = connected ? '#34c759' : 'var(--ht-accent, #f06413)';
  const gap = converged ? 44 : connecting ? 76 : 112;

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

        {/* The middle: width animates between phases (the devices glide) */}
        <motion.div
          className="relative flex items-center justify-center"
          initial={false}
          animate={{ width: gap }}
          transition={{ duration: 0.55, ease: EASE }}
          style={{ height: TILE }}
        >
          {/* Idle dotted guide so the gap never reads as dead space */}
          {!connecting && !connected && (
            <div aria-hidden="true" className="absolute inset-x-1 top-1/2 -translate-y-1/2 border-t border-dashed border-apple-divider dark:border-white/15" />
          )}

          {/* Traveling dot — the only loop. One dot, one direction at a
              time, slow enough to read as data in flight, not energy. */}
          {connecting && (
            <motion.span
              aria-hidden="true"
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
              style={{ background: accent }}
              initial={{ left: '0%', opacity: 0 }}
              animate={{ left: ['0%', '92%', '0%'], opacity: [0, 1, 1, 0], transition: { duration: 2.2, times: [0, 0.45, 0.55, 1], repeat: Infinity, ease: 'easeInOut' } }}
            />
          )}

          {/* Locked link — a solid line drawn outward once, then still */}
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
        </motion.div>

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
