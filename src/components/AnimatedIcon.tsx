import React from 'react';
import { motion, type Variants } from 'motion/react';
import { cn } from '../lib/utils';
import {
  Send, Inbox, Check, Copy, Download, ChevronDown,
  Share2, Lock, QrCode, Moon, Loader2, X, Pencil, Link2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// AnimatedIcon — consistent micro-interactions for lucide icons
// ---------------------------------------------------------------------------
// Each icon type has a specific animation that communicates its action.
// Animations are triggered via the `animate` prop or parent state.
//
// Usage:
//   <AnimatedIcon animate="send"><Send size={16} /></AnimatedIcon>
//   <AnimatedIcon animate="check" active><Check size={16} /></AnimatedIcon>
// ---------------------------------------------------------------------------

type AnimationType =
  | 'none'        // No animation
  | 'send'        // Flies forward (Send icon)
  | 'receive'     // Settles down (Inbox icon)
  | 'check'       // Scales up with spring (Check icon)
  | 'copy'        // Duplicates slide (Copy icon)
  | 'download'    // Drops down (Download icon)
  | 'chevron'     // Rotates 180° (ChevronDown)
  | 'share'       // Spreads outward (Share2)
  | 'lock'        // Subtle rotate + scale (Lock)
  | 'qr'          // Gentle pulse (QrCode)
  | 'toggle'      // Rotate 360° (Moon/Sun)
  | 'refresh'     // Spins once (Loader2/RefreshCw)
  | 'close'       // Scales down + rotates (X)
  | 'edit'        // Subtle bounce (Pencil)
  | 'link';       // Copies toward clipboard (Link2);

interface AnimatedIconProps {
  children: React.ReactNode;
  animate?: AnimationType;
  active?: boolean;       // Triggers the animation
  looping?: boolean;      // For loading/refresh animations
  className?: string;
  size?: number;
}

// Animation variants per type
const VARIANTS: Record<AnimationType, Variants> = {
  none: {},

  send: {
    idle: { x: 0, y: 0, opacity: 1 },
    active: {
      x: [0, 3, -1, 0],
      y: [0, -2, 1, 0],
      opacity: [1, 1, 0.7, 1],
      transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
    },
  },

  receive: {
    idle: { y: 0, opacity: 1 },
    active: {
      y: [0, -3, 0],
      opacity: [1, 0.8, 1],
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  },

  check: {
    idle: { scale: 1, opacity: 1 },
    active: {
      scale: [0.5, 1.2, 1],
      opacity: [0, 1, 1],
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  },

  copy: {
    idle: { x: 0, opacity: 1 },
    active: {
      x: [0, 2, 0],
      opacity: [1, 0.6, 1],
      transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    },
  },

  download: {
    idle: { y: 0, opacity: 1 },
    active: {
      y: [0, 3, 0],
      opacity: [1, 0.7, 1],
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  },

  chevron: {
    idle: { rotate: 0 },
    active: { rotate: 180, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
  },

  share: {
    idle: { scale: 1, opacity: 1 },
    active: {
      scale: [1, 1.15, 1],
      opacity: [1, 0.8, 1],
      transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    },
  },

  lock: {
    idle: { rotate: 0, scale: 1 },
    active: {
      rotate: [0, -8, 0],
      scale: [1, 1.1, 1],
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
    },
  },

  qr: {
    idle: { scale: 1 },
    active: {
      scale: [1, 1.05, 1],
      transition: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
    },
  },

  toggle: {
    idle: { rotate: 0 },
    active: { rotate: 360, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  },

  refresh: {
    idle: { rotate: 0 },
    active: { rotate: 360, transition: { duration: 0.6, repeat: Infinity, ease: 'linear' } },
  },

  close: {
    idle: { scale: 1, rotate: 0 },
    active: {
      scale: [1, 0.8, 1],
      rotate: [0, 90, 0],
      transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
    },
  },

  edit: {
    idle: { rotate: 0 },
    active: {
      rotate: [0, -5, 5, 0],
      transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    },
  },

  link: {
    idle: { x: 0, rotate: 0 },
    active: {
      x: [0, 2, 0],
      rotate: [0, -10, 0],
      transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    },
  },
};

export function AnimatedIcon({
  children,
  animate = 'none',
  active = false,
  looping = false,
  className,
}: AnimatedIconProps) {
  const variants = VARIANTS[animate];

  // Determine which animation state to use
  const animateState = looping ? 'active' : active ? 'active' : 'idle';

  return (
    <motion.span
      className={cn('inline-flex items-center justify-center', className)}
      variants={variants}
      animate={animateState}
      style={{ willChange: animate !== 'none' ? 'transform' : undefined }}
    >
      {children}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Convenience wrappers — use actual lucide-react icons, not hand-rolled SVGs
// ---------------------------------------------------------------------------

export function SendIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="send" active={active} className={className}>
      <Send size={size} />
    </AnimatedIcon>
  );
}

export function CheckIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="check" active={active} className={className}>
      <Check size={size} strokeWidth={2.5} />
    </AnimatedIcon>
  );
}

export function CopyIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="copy" active={active} className={className}>
      <Copy size={size} />
    </AnimatedIcon>
  );
}

export function DownloadIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="download" active={active} className={className}>
      <Download size={size} />
    </AnimatedIcon>
  );
}

export function ChevronIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="chevron" active={active} className={className}>
      <ChevronDown size={size} />
    </AnimatedIcon>
  );
}

export function InboxIcon({ active, size = 16, className }: { active?: boolean; size?: number; className?: string }) {
  return (
    <AnimatedIcon animate="receive" active={active} className={className}>
      <Inbox size={size} />
    </AnimatedIcon>
  );
}
