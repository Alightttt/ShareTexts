import React from 'react';
import { motion } from 'motion/react';

/**
 * DeviceLinkIllustration — the ShareTexts illustration language, extracted.
 *
 * One composition: two devices joined by a link. The link's STATE is the
 * illustration — the same two tiles hold still while only the relationship
 * between them changes, so "the other device" never teleports between
 * states (spatial continuity, the SSGOI principle applied to a 200px
 * canvas):
 *
 *   linked      dotted line, ember→green terminal dots (the empty, ready room)
 *   broken      the line is severed — a gap with two frayed stubs; the
 *               partner side dims. Reads as "they were here, the thread cut".
 *   searching   the link breathes (opacity pulse) — a line is forming
 *   error       the line is severed with ember (not red) stubs — something
 *               went wrong, but calmly; recovery is possible
 *
 * Everything is aria-hidden; the surrounding text carries the meaning for
 * assistive tech. Reduced motion: the pulse halts via MotionConfig upstream
 * (motion/react honors it) — the static state remains fully legible.
 */

export type LinkState = 'linked' | 'broken' | 'searching' | 'error';

const EMBER = '#f06413';
const EMBER_DARK = '#fb9243';
const GREEN = '#34c759';

export function DeviceLinkIllustration({
  state = 'linked',
  width = 208,
  className,
}: {
  state?: LinkState;
  /** Rendered width; the viewBox is fixed so the composition scales as one. */
  width?: number;
  className?: string;
}) {
  const severed = state === 'broken' || state === 'error';
  const stubColor = state === 'error' ? EMBER : 'currentColor';
  const stubOpacity = state === 'error' ? 0.55 : 0.3;

  return (
    <svg
      width={width}
      height={(104 / 208) * width}
      viewBox="0 0 208 104"
      fill="none"
      className={`select-none pointer-events-none text-apple-ink-muted dark:text-white ${className ?? ''}`}
      aria-hidden="true"
    >
      {/* ══ Desktop computer (left) ══ — screen centered on y=44 */}
      <rect x="14" y="12" width="66" height="44" rx="6" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity={severed ? 0.12 : 0.18} strokeWidth="1.5" />
      <rect x="20" y="18" width="54" height="32" rx="3" fill="currentColor" fillOpacity="0.04" />
      <rect x="43" y="56" width="8" height="10" rx="2" fill="currentColor" fillOpacity="0.16" />
      <rect x="31" y="66" width="32" height="4" rx="2" fill="currentColor" fillOpacity="0.16" />

      {/* ══ Phone (right) ══ — mirrors the PC; dims when severed */}
      <g opacity={severed ? 0.55 : 1} style={{ transition: 'opacity 300ms var(--ease-out, ease)' }}>
        <rect x="156" y="12" width="38" height="64" rx="9" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity={severed ? 0.12 : 0.18} strokeWidth="1.5" />
        <rect x="162" y="20" width="26" height="48" rx="3" fill="currentColor" fillOpacity="0.04" />
        <rect x="170" y="15.5" width="10" height="2" rx="1" fill="currentColor" fillOpacity="0.18" />
      </g>

      {/* ══ The relationship ══ */}
      {state === 'linked' && (
        <>
          <line x1="82" y1="44" x2="154" y2="44" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" strokeDasharray="1.5 4" strokeLinecap="round" />
          <circle cx="82" cy="44" r="2.5" fill={EMBER} fillOpacity="0.85" />
          <circle cx="154" cy="44" r="2.5" fill={GREEN} fillOpacity="0.9" />
        </>
      )}

      {state === 'searching' && (
        <motion.g
          animate={{ opacity: [0.35, 0.9, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <line x1="82" y1="44" x2="154" y2="44" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="1.5 4" strokeLinecap="round" />
          <circle cx="82" cy="44" r="2.5" fill={EMBER} fillOpacity="0.85" />
        </motion.g>
      )}

      {severed && (
        <>
          {/* Left stub — still attached to this device, frayed at the end */}
          <line x1="82" y1="44" x2="106" y2="44" stroke={stubColor} strokeOpacity={stubOpacity} strokeWidth="1.5" strokeDasharray="1.5 4" strokeLinecap="round" />
          <circle cx="82" cy="44" r="2.5" fill={EMBER} fillOpacity="0.85" />
          {/* Right stub — detached from the (dimmed) partner */}
          <line x1="130" y1="44" x2="154" y2="44" stroke={stubColor} strokeOpacity={stubOpacity * 0.7} strokeWidth="1.5" strokeDasharray="1.5 4" strokeLinecap="round" />
          {state === 'error' && (
            <circle cx="118" cy="44" r="2" fill={EMBER} fillOpacity="0.5" />
          )}
        </>
      )}
    </svg>
  );
}

/**
 * PacketTrain — the traveling packet comets that ride the link. Separated
 * from the static SVG so it can be motion-driven and reduced-motion aware.
 * `direction` flips travel right→left for receive flows.
 */
export function PacketTrain({
  direction = 'right',
  width = 208,
}: {
  direction?: 'right' | 'left';
  width?: number;
}) {
  const h = (104 / 208) * width;
  const from = direction === 'right' ? -width * 0.106 : width * 0.24;
  const to = direction === 'right' ? width * 0.24 : -width * 0.106;
  const comets = [
    { size: 7, delay: 0, lead: true },
    { size: 5, delay: 0.22, lead: false },
    { size: 4, delay: 0.44, lead: false },
  ] as const;
  return (
    <div className="relative" style={{ width, height: h }}>
      {comets.map((c, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full bg-[#f06413] dark:bg-[#fb9243]"
          style={{
            width: c.size,
            height: c.size,
            top: h / 2 - c.size / 2,
            left: 0,
            boxShadow: c.lead
              ? '0 0 10px rgba(240,100,19,0.55), 0 0 22px rgba(240,100,19,0.2)'
              : 'none',
            opacity: c.lead ? 1 : 0.55 - i * 0.15,
          }}
          initial={{ x: from, opacity: 0 }}
          animate={{ x: [from, to, to, from], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 2.2,
            times: [0, 0.18, 0.82, 1],
            repeat: Infinity,
            ease: 'easeInOut',
            delay: c.delay,
          }}
        />
      ))}
      {/* Soft arrival glow where packets land */}
      <motion.span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          top: h / 2 - 7,
          left: direction === 'right' ? width * 0.24 - 7 : -width * 0.106 - 7,
          background: 'radial-gradient(circle, rgba(52,199,89,0.35), transparent 70%)',
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.6, 1.15, 0.9] }}
        transition={{ duration: 2.2, times: [0, 0.2, 0.5], repeat: Infinity, ease: 'easeOut', delay: 0.1 }}
      />
    </div>
  );
}
