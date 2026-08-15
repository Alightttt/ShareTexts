import React, { useId } from 'react';
import { motion } from 'motion/react';

/**
 * The ShareText mark: one bold shape — a rounded device screen with a
 * transfer arrow knocked straight through it. The arrow is cut out with an
 * SVG mask, so it shows whatever background it sits on (light, dark, or
 * accent). No fine detail: at 16px it still reads as "send to the other
 * device". Must match public/favicon.svg and scripts/render-brand.mjs.
 */

export function ShareTextLogo({ className, size = 28, animated = false }: { className?: string, size?: number, animated?: boolean }) {
  const maskId = useId();

  if (animated) {
    // The whole mark breathes slowly — a quiet "working" pulse, nothing busy.
    return (
      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 256 256"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Mark maskId={maskId} />
      </motion.svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <Mark maskId={maskId} />
    </svg>
  );
}

function Mark({ maskId }: { maskId: string }) {
  return (
    <>
      <defs>
        <mask id={maskId}>
          <rect x="0" y="0" width="256" height="256" fill="white" />
          <rect x="84" y="112" width="64" height="32" fill="black" />
          <path d="M148 94l48 34-48 34z" fill="black" />
        </mask>
      </defs>
      <rect x="36" y="36" width="184" height="184" rx="44" fill="currentColor" mask={`url(#${maskId})`} />
    </>
  );
}
