import React from 'react';
import { motion } from 'motion/react';

/**
 * The ShareText mark: two device screens on the diagonal, joined by a
 * connection beam — the whole transfer story in one silhouette. No arrow,
 * no generic share glyph: the two screens are the two devices, and the beam
 * between them is the transfer. One color (currentColor) throughout, so it
 * reads on light, dark, or accent backgrounds, and holds its shape down to
 * a 16px favicon.
 *
 *   Screen A (sending)    x=40  y=36  84×84 rx=24
 *   Screen B (receiving)  x=132 y=136 84×84 rx=24
 *   Beam                  M110 106 L146 142, stroke 28, round caps
 *
 * Motion states (optional):
 *   loading     — the mark breathes quietly (working)
 *   connecting  — a packet oscillates along the beam (waiting for the peer)
 *   transfer    — a packet travels one-way from A to B (data in motion)
 *   complete    — a check settles inside the receiving screen (arrived)
 * SMIL animations are skipped when prefers-reduced-motion is set — the mark
 * still shows a parked packet or a settled check, so state stays legible.
 *
 * Must match public/favicon.svg and scripts/render-brand.mjs.
 */

export type BrandMotion = 'loading' | 'connecting' | 'transfer' | 'complete';

// Read once at load; the reduced-motion preference rarely changes mid-session
// and MotionConfig already handles the JS-driven animations.
const reducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

export function ShareTextLogo({ className, size = 28, motion: motionState }: { className?: string, size?: number, motion?: BrandMotion }) {
  if (motionState === 'loading' && !reducedMotion) {
    return (
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        animate={{ scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <Mark motion="connecting" />
      </motion.svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <Mark motion={motionState} />
    </svg>
  );
}

function Mark({ motion }: { motion?: BrandMotion }) {
  const fill = 'currentColor';

  // A packet traveling along the beam — connecting oscillates (waiting),
  // transfer goes one way (data in motion). SMIL keeps it cheap and works
  // in every evergreen browser, including Safari.
  const packet = reducedMotion
    ? <circle cx={motion === 'transfer' ? 140 : 128} cy={motion === 'transfer' ? 136 : 124} r="7" fill={fill} />
    : (
      <circle r="7" fill={fill}>
        <animateMotion
          dur={motion === 'transfer' ? '1.1s' : '1.7s'}
          repeatCount="indefinite"
          keyPoints={motion === 'transfer' ? '0;1' : '0;1;0'}
          keyTimes={motion === 'transfer' ? '0;1' : '0;0.5;1'}
          calcMode="linear"
          path="M 110 106 L 146 142"
        />
      </circle>
    );

  return (
    <>
      {/* Sending screen */}
      <rect x="40" y="36" width="84" height="84" rx="24" fill={fill} />
      {/* Receiving screen */}
      <rect x="132" y="136" width="84" height="84" rx="24" fill={fill} />
      {/* Connection beam */}
      <path d="M110 106 L146 142" stroke={fill} strokeWidth="28" strokeLinecap="round" />

      {/* A settled check inside the receiving screen (complete state) */}
      {motion === 'complete' && (
        <path
          d="M159 178 l13 13 l25 -28"
          stroke={fill}
          strokeWidth="15"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0"
        >
          <animate attributeName="opacity" values="0;1;1" keyTimes="0;0.35;1" dur="1.4s" fill="freeze" />
        </path>
      )}

      {motion === 'connecting' || motion === 'transfer' ? packet : null}
    </>
  );
}
