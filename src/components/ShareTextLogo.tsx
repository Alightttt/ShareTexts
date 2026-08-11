import React from 'react';
import { motion } from 'motion/react';

// The filled page + transfer arrow as a single evenodd path. The arrow is a
// HOLE in the page, so it shows the background in any theme — no fixed-white
// stroke that would vanish on the white page in dark mode.
const MARK_PAGE =
  "M98 82h118v154H98z" +
  "M129 153h49a7 7 0 0 1 0 14h-49a7 7 0 0 1 0-14z" +
  "M151.05 142.95L160.95 133.05L182.95 155.05L173.05 164.95z" +
  "M151.05 177.05L160.95 186.95L182.95 164.95L173.05 155.05z";

export function ShareTextLogo({ className, size = 28, animated = false }: { className?: string, size?: number, animated?: boolean }) {
  if (animated) {
    return (
      <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <motion.rect
          initial={{ x: -10, opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          x="40" y="40" width="136" height="176" rx="22" stroke="currentColor" strokeWidth="18" strokeLinejoin="round"
        />
        <motion.path
          initial={{ x: 10, opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.2 }}
          d={MARK_PAGE}
          fill="currentColor"
          fillRule="evenodd"
        />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* The mark renders monochrome by default and takes on the accent color
          where it represents the brand moment (beam node, loading state).
          The outline page sits behind, the filled page in front — two layers,
          one transfer. The arrow is a hole in the filled page. */}
      <rect x="40" y="40" width="136" height="176" rx="22" stroke="currentColor" strokeWidth="18" strokeLinejoin="round"/>
      <path d={MARK_PAGE} fill="currentColor" fillRule="evenodd"/>
    </svg>
  );
}
