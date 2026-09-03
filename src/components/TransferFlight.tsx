/**
 * TransferFlight — the flagship moment: during a real send, a compact file
 * tile visibly travels across the room from this device's side to the other
 * device's side, its position driven by actual byte progress (not a decoy).
 *
 * Design language: restrained and physical — one small object, a soft shadow,
 * a gentle mid-flight scale swell, a faint progress line growing from the
 * sender's side. No beams, no particles.
 *
 * Motion rules (per the animate skill):
 *  - tool: Motion (already the app's animation system; MotionConfig
 *    reducedMotion="user" globally disables the transform travel for
 *    users who prefer reduced motion — opacity fades remain).
 *  - properties: transform (translate3d + scaleX) and opacity only — the
 *    overlay is position:fixed, so nothing in the feed reflows while it
 *    flies.
 *  - curve: strong ease-in-out for on-screen movement; each progress tick
 *    RETARGETS the transition from the current value, so fast or slow
 *    transfers both stay smooth and the flight never restarts.
 *  - exits: complete → the object settles into the receiver's card
 *    (shrink + fade); cancel/disconnect → it fades away mid-path.
 */
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileText } from 'lucide-react';

/** Strong ease-in-out for on-screen movement (animate skill table). */
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** Strong ease-out for the landing settle. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const CHIP_W = 148;
const CHIP_H = 40;
/** Band height above the feed bottom — where the newest card lands. */
const BAND_OFFSET = 92;

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

interface TransferFlightProps {
  /** The message feed container — its rect defines the travel track. */
  feedRef: RefObject<HTMLDivElement | null>;
  /** Real byte progress 0..1. */
  progress: number;
  /** true when we are the receiver — the tile travels partner → us. */
  reverse: boolean;
  name: string;
  size: number;
}

export function TransferFlight({ feedRef, progress, reverse, name, size }: TransferFlightProps) {
  const [track, setTrack] = useState<{ from: number; to: number; y: number } | null>(null);
  const chipRef = useRef<HTMLDivElement>(null);

  // Measure the feed once (and on resize): x0 = partner side (left), x1 =
  // this device's side (right). Fixed positioning means scrolling the feed
  // never shifts the flight — no layout work while bytes move.
  useEffect(() => {
    const measure = () => {
      const el = feedRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 40) return;
      setTrack({ from: r.left + 8, to: r.right - 8, y: r.bottom - BAND_OFFSET });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [feedRef]);

  if (!track) return null;

  // Travel endpoints: a send leaves from our side (right) toward the
  // partner (left); a receive comes from the partner (left) to us (right).
  const start = reverse ? track.from : track.to;
  const end = reverse ? track.to : track.from;
  const p = Math.min(1, Math.max(0, progress));
  const x = start + (end - start) * p;
  // Gentle mid-flight swell — the object approaches, then settles.
  const swell = 1 + 0.05 * Math.sin(Math.PI * p);
  const width = track.to - track.from;
  // The progress line grows FROM the sender's side toward the receiver.
  const lineBase = reverse ? track.from : track.to;
  const lineOrigin = reverse ? 'left' : 'right';

  return (
    <>
      {/* Faint connection line, filled by real progress (transform only). */}
      <motion.div
        data-testid="transfer-line"
        className="fixed left-0 top-0 z-20 pointer-events-none"
        style={{ transformOrigin: lineOrigin, willChange: 'transform' }}
        animate={{ transform: `translate3d(${lineBase}px, ${track.y + CHIP_H / 2 - 1}px, 0) scaleX(${p})` }}
        transition={{ duration: 0.25, ease: EASE_IN_OUT }}
      >
        <div className="h-px bg-[#8b7cf6]/25 dark:bg-[#a78bfa]/25" style={{ width }} />
      </motion.div>

      {/* The traveling object. */}
      <motion.div
        ref={chipRef}
        data-testid="transfer-flight"
        className="fixed left-0 top-0 z-30 pointer-events-none"
        style={{ willChange: 'transform' }}
        animate={{ transform: `translate3d(${x - CHIP_W / 2}px, ${track.y - CHIP_H / 2}px, 0)` }}
        transition={{ duration: 0.25, ease: EASE_IN_OUT }}
      >
        <motion.div
          variants={{
            fly: { opacity: 1, scale: 1 },
            settle: { opacity: 0, scale: 0.9 },
            fade: { opacity: 0, scale: 0.86 },
          }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: swell }}
          exit={(custom: unknown) => (custom === 'settle' ? 'settle' : 'fade')}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="flex items-center gap-2 pl-1.5 pr-3 rounded-[10px] bg-white dark:bg-[#151b2b] border border-apple-divider dark:border-white/10 shadow-[0_10px_28px_rgba(15,18,32,0.16)]"
        >
          <span className="w-7 h-7 rounded-[7px] bg-[#8b7cf6]/12 dark:bg-[#a78bfa]/14 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-[#7c6ce0] dark:text-[#a78bfa]" />
          </span>
          <span className="max-w-[96px] truncate text-[12px] font-semibold text-apple-ink dark:text-white" title={name}>{name}</span>
          <span className="text-[10px] font-medium text-apple-ink-muted/70 dark:text-white/40 whitespace-nowrap">{formatBytes(size)}</span>
        </motion.div>
      </motion.div>
    </>
  );
}