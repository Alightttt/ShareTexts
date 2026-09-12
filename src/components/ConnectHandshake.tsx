/**
 * ConnectHandshake — the pairing moment, staged like AirDrop.
 *
 * Three states, one continuous scene:
 *
 *   searching   — two devices sit apart; radar waves sweep from each
 *                 (nothing has been verified yet)
 *   connecting  — the code was verified: the devices slide together, a
 *                 scan beam sweeps the gap between them, and a spark
 *                 travels the link. (Xender's "found each other" energy.)
 *   connected   — the beam locks solid, a quick ring settles, and a
 *                 check chip confirms the link. The scene holds here —
 *                 the takeover to the room happens above it.
 *
 * Layout: pure flex (device tiles flank a dynamic middle), so it survives
 * any container width down to 320px. All animation is motion/react driven,
 * so it flattens under reduced motion via the app's MotionConfig.
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

function DeviceTile({ kind, accent, glow, kindIcon }: { kind: 'local' | 'partner'; accent: string; glow: boolean; kindIcon: 'phone' | 'monitor' }) {
  const Icon = kindIcon === 'phone' ? Smartphone : Monitor;
  return (
    <div
      className={cn(
        'relative flex items-center justify-center rounded-[20px] shrink-0',
        'bg-white dark:bg-[#251b40] border shadow-sm'
      )}
      style={{
        width: TILE,
        height: TILE,
        borderColor: accent,
        boxShadow: glow ? `0 0 0 4px ${accent}1f, 0 8px 24px -12px ${accent}66` : undefined,
      }}
    >
      <Icon className="w-7 h-7" style={{ color: accent }} aria-hidden="true" />
    </div>
  );
}

/** Radar waves — concentric rings radiating from a tile. */
function RadarWaves({ active, accent }: { active: boolean; accent: string }) {
  if (!active) return null;
  return (
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="absolute rounded-full border"
          style={{ width: TILE + 16, height: TILE + 16, borderColor: accent }}
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: [1, 1.9], opacity: [0.55, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.66, ease: 'easeOut' }}
        />
      ))}
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

  const accent = 'var(--ht-accent, #8b7cf6)';
  const gap = converged ? 40 : connecting ? 84 : 120;

  const status = connected ? t('connect.linked') : connecting ? t('connect.establishing') : t('connect.searching');

  return (
    <div className="flex flex-col items-center w-full select-none" data-testid="connect-handshake" data-phase={phase}>
      {/* The scene: local tile — beam — partner tile */}
      <div className="relative flex items-center" style={{ minHeight: TILE + 48 }}>
        {/* Local tile */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-2"
          layout
        >
          <div className="relative">
            <RadarWaves active={!connecting && !connected} accent={accent} />
            <motion.div layout>
              <DeviceTile kind="local" kindIcon={localIcon} accent={accent} glow={connecting || connected} />
            </motion.div>
          </div>
          <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">{t('connect.thisDevice')}</span>
        </motion.div>

        {/* The middle: beam + spark + status dot */}
        <div className="relative flex items-center" style={{ width: gap }}>
          {/* Scan beam — sweeping highlight while connecting */}
          {connecting && (
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full overflow-visible"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
            >
              <motion.span
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
                style={{ background: accent, boxShadow: `0 0 12px 2px ${accent}aa` }}
                animate={{ left: ['-4%', '96%'] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
              />
            </motion.div>
          )}
          {/* Idle dotted guide so the gap never reads as dead space */}
          {!connecting && !connected && (
            <div aria-hidden="true" className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-dashed border-apple-divider dark:border-white/15" />
          )}
          {/* Locked beam — solid line once connected */}
          {connected && (
            <motion.div
              aria-hidden="true"
              className="absolute top-1/2 -translate-y-1/2 rounded-full"
              style={{ background: accent, height: 2.5 }}
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              transition={{ duration: 0.45, ease: EASE }}
            />
          )}
          {/* Center status chip */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <AnimatePresence mode="wait">
              {connecting && (
                <motion.div
                  key="connecting"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', bounce: 0.35, duration: 0.5 }}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, boxShadow: `0 4px 16px -4px ${accent}88` }}
                >
                  <motion.span
                    className="w-4 h-4 rounded-full border-2 border-white/90"
                    style={{ borderTopColor: 'transparent' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  />
                </motion.div>
              )}
              {connected && (
                <motion.div
                  key="connected"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', bounce: 0.45, duration: 0.55 }}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-status-success shadow-[0_4px_16px_-4px_rgba(52,199,89,0.5)]"
                >
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Partner tile */}
        <motion.div
          className="relative z-10 flex flex-col items-center gap-2"
          layout
        >
          <div className="relative">
            <RadarWaves active={!connecting && !connected} accent={accent} />
            <motion.div layout>
              <DeviceTile kind="partner" kindIcon={isPhone ? 'monitor' : 'phone'} accent={connected ? 'rgba(52,199,89,0.35)' : accent} glow={connecting} />
            </motion.div>
          </div>
          <motion.span
            key={partnerName || 'pair'}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[110px] truncate text-[11px] font-medium text-apple-ink-muted dark:text-white/45"
          >
            {connected ? (partnerName || t('pair.paired')) : t('connect.otherDevice')}
          </motion.span>
        </motion.div>
      </div>

      {/* Status line */}
      <AnimatePresence mode="wait">
        <motion.p
          key={status}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
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
