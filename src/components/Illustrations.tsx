import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Design system for illustrations
// ---------------------------------------------------------------------------
// Style: premium, polished, gradient-rich, Apple-inspired
// All accept `className` for sizing via Tailwind (default: w-24 h-24)
// ---------------------------------------------------------------------------

const BLUE = '#0A66F0';
const BLUE_LIGHT = '#E8F0FE';
const BLUE_DARK = '#0B55C9';
const INK = '#1D1D1F';
const INK_LIGHT = '#6E6E73';
const SUCCESS = '#1C9A61';
const SUCCESS_LIGHT = '#E6F7EF';
const ORANGE = '#B26A00';
const PURPLE = '#8B5CF6';
const PURPLE_LIGHT = '#EDE9FE';
const RED = '#E53E3E';

// Gradient definitions used across illustrations
function SharedDefs() {
  return (
    <defs>
      <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={BLUE} />
        <stop offset="100%" stopColor={BLUE_DARK} />
      </linearGradient>
      <linearGradient id="blueGradLight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#EBF3FF" />
        <stop offset="100%" stopColor="#D6E8FF" />
      </linearGradient>
      <linearGradient id="successGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2DD47B" />
        <stop offset="100%" stopColor={SUCCESS} />
      </linearGradient>
      <linearGradient id="phoneShell" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#E8E8EC" />
        <stop offset="50%" stopColor="#D1D1D6" />
        <stop offset="100%" stopColor="#C7C7CC" />
      </linearGradient>
      <linearGradient id="phoneShellDark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#3A3A3E" />
        <stop offset="50%" stopColor="#2C2C2E" />
        <stop offset="100%" stopColor="#1C1C1E" />
      </linearGradient>
      <linearGradient id="laptopShell" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#D5D5DA" />
        <stop offset="50%" stopColor="#B8B8BD" />
        <stop offset="100%" stopColor="#A8A8AD" />
      </linearGradient>
      <linearGradient id="screenContent" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#0C1220" />
        <stop offset="100%" stopColor="#060A12" />
      </linearGradient>
      <filter id="softShadow">
        <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.08" />
      </filter>
      <filter id="glowBlue">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feFlood floodColor={BLUE} floodOpacity="0.25" result="color" />
        <feComposite in="color" in2="blur" operator="in" result="glow" />
        <feMerge>
          <feMergeNode in="glow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// Shared phone shape — realistic proportions
function PhoneShell({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const r = w * 0.18;
  return (
    <g filter="url(#softShadow)">
      {/* Outer shell */}
      <rect x={x} y={y} width={w} height={h} rx={r} fill="url(#phoneShell)" stroke="#B0B0B5" strokeWidth={0.5} />
      {/* Screen bezel */}
      <rect x={x + w * 0.06} y={y + h * 0.04} width={w * 0.88} height={h * 0.88} rx={r * 0.65} fill="url(#screenContent)" />
      {/* Dynamic island */}
      <rect x={x + w * 0.3} y={y + h * 0.06} width={w * 0.4} height={h * 0.025} rx={h * 0.012} fill="#000" />
    </g>
  );
}

// Shared laptop shape — realistic proportions  
function LaptopShell({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const screenR = w * 0.04;
  const deckR = w * 0.03;
  const screenH = h * 0.72;
  const deckH = h - screenH;
  return (
    <g filter="url(#softShadow)">
      {/* Screen frame */}
      <rect x={x} y={y} width={w} height={screenH} rx={screenR} fill="url(#laptopShell)" stroke="#A0A0A5" strokeWidth={0.5} />
      {/* Screen */}
      <rect x={x + w * 0.04} y={y + h * 0.06} width={w * 0.92} height={screenH - h * 0.1} rx={screenR * 0.5} fill="url(#screenContent)" />
      {/* Camera dot */}
      <circle cx={x + w * 0.5} cy={y + h * 0.03} r={w * 0.012} fill="#1a1a1e" stroke="#fff" strokeWidth={0.3} opacity={0.5} />
      {/* Keyboard deck */}
      <path d={`M${x - w * 0.05} ${y + screenH} L${x} ${y + screenH} L${x + w * 0.04} ${y + screenH + deckH * 0.3} L${x + w * 0.96} ${y + screenH + deckH * 0.3} L${x + w} ${y + screenH} L${x + w + w * 0.05} ${y + screenH} L${x + w + w * 0.05} ${y + h} L${x - w * 0.05} ${y + h} Z`}
        fill="url(#laptopShell)" stroke="#A0A0A5" strokeWidth={0.5} strokeLinejoin="round" />
      {/* Keyboard area hint */}
      <rect x={x + w * 0.08} y={y + screenH + deckH * 0.15} width={w * 0.84} height={deckH * 0.5} rx={2} fill="#000" opacity={0.08} />
      {/* Trackpad */}
      <rect x={x + w * 0.35} y={y + screenH + deckH * 0.65} width={w * 0.3} height={deckH * 0.28} rx={2} fill="#000" opacity={0.05} stroke="#000" strokeWidth={0.3} strokeOpacity={0.08} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// How It Works — 3 steps (premium quality)
// ---------------------------------------------------------------------------

/** Step 1: Open — two devices side by side, both showing the app */
export function IllustOpen({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Open ShareText on both devices">
      <SharedDefs />
      {/* Phone */}
      <PhoneShell x={18} y={14} w={40} h={82} />
      {/* Phone screen content — app header + ShareText logo hint */}
      <rect x={22} y={22} width={32} height={6} rx={3} fill={BLUE} opacity={0.12} />
      <circle cx={38} cy={25} r={3} fill={BLUE} opacity={0.3} />
      {/* Phone body lines */}
      <rect x={24} y={34} width={28} height={3} rx={1.5} fill="#fff" opacity={0.15} />
      <rect x={24} y={41} width={20} height={3} rx={1.5} fill="#fff" opacity={0.1} />
      <rect x={24} y={48} width={24} height={3} rx={1.5} fill="#fff" opacity={0.08} />

      {/* Laptop */}
      <LaptopShell x={72} y={12} w={68} h={64} />
      {/* Laptop screen content */}
      <rect x={76} y={18} width={60} height={5} rx={2.5} fill={BLUE} opacity={0.12} />
      <circle cx={106} cy={20.5} r={3} fill={BLUE} opacity={0.3} />
      <rect x={78} y={27} width={56} height={3} rx={1.5} fill="#fff" opacity={0.12} />
      <rect x={78} y={34} width={40} height={3} rx={1.5} fill="#fff" opacity={0.08} />

      {/* Notification badges — both devices are "active" */}
      <circle cx={38} cy={56} r={6} fill={BLUE} opacity={0.15} />
      <circle cx={38} cy={56} r={3} fill={BLUE} opacity={0.4} />
      <circle cx={106} cy={42} r={6} fill={BLUE} opacity={0.15} />
      <circle cx={106} cy={42} r={3} fill={BLUE} opacity={0.4} />

      {/* Subtle text label */}
      <text x={80} y={108} textAnchor="middle" fill={INK} fontSize="7" fontWeight="600" opacity={0.25} fontFamily="-apple-system, sans-serif">Both devices open</text>
    </svg>
  );
}

/** Step 2: Pair — devices connected by a pairing beam */
export function IllustPair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Pair with a code or QR">
      <SharedDefs />
      {/* Phone */}
      <PhoneShell x={18} y={14} w={40} h={82} />
      {/* Phone screen — pairing code UI */}
      <rect x={24} y={30} width={28} height={6} rx={3} fill={BLUE} opacity={0.1} />
      {/* Code digits */}
      {[0, 1, 2].map(i => (
        <React.Fragment key={i}>
          <rect x={26 + i * 8} y={42} width={6} height={8} rx={2} fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={0.5} />
          <circle cx={29 + i * 8} cy={46} r={1} fill={BLUE} opacity={0.5} />
        </React.Fragment>
      ))}

      {/* Connection beam — glowing line between devices */}
      <line x1="58" y1="56" x2="72" y2="42" stroke={BLUE} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.4} />
      <circle cx="65" cy="49" r={4} fill={BLUE} opacity={0.12} filter="url(#glowBlue)" />
      <circle cx="65" cy="49" r={1.5} fill={BLUE} opacity={0.6} />

      {/* Laptop */}
      <LaptopShell x={72} y={12} w={68} h={64} />
      {/* Laptop screen — QR code hint */}
      <rect x={90} y={22} width={20} height={20} rx={3} fill="white" opacity={0.12} stroke={BLUE} strokeWidth={0.5} strokeOpacity={0.3} />
      {/* QR corners */}
      <rect x={93} y={25} width={5} height={5} rx={1} fill={BLUE} opacity={0.2} />
      <rect x={102} y={25} width={5} height={5} rx={1} fill={BLUE} opacity={0.2} />
      <rect x={93} y={34} width={5} height={5} rx={1} fill={BLUE} opacity={0.2} />
      {/* QR center dot */}
      <rect x={98} y={31} width={4} height={4} rx={1} fill={BLUE} opacity={0.35} />

      <text x={80} y={108} textAnchor="middle" fill={INK} fontSize="7" fontWeight="600" opacity={0.25} fontFamily="-apple-system, sans-serif">Scan or type code</text>
    </svg>
  );
}

/** Step 3: Send — content flowing from phone to laptop */
export function IllustSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Send content between devices">
      <SharedDefs />
      {/* Phone */}
      <PhoneShell x={18} y={14} w={40} h={82} />
      {/* Phone screen — sent message bubble */}
      <rect x={28} y={52} width={24} height={10} rx={5} fill="url(#blueGrad)" />
      <text x={40} y={59} textAnchor="middle" fill="white" fontSize="4" fontWeight="600" fontFamily="-apple-system, sans-serif">Sent ✓</text>

      {/* Flying content card — mid-transfer */}
      <rect x={60} y={36} width={20} height={14} rx={4} fill="white" opacity={0.95} stroke={BLUE} strokeWidth={0.6} />
      <rect x={63} y={39} width={10} height={4} rx={2} fill={BLUE} opacity={0.2} />
      <text x={70} y={47} textAnchor="middle" fill={BLUE} fontSize="3.5" fontWeight="600" fontFamily="-apple-system, sans-serif">data</text>

      {/* Direction arrows — animated feel */}
      <path d="M80 43 L86 43" stroke={BLUE} strokeWidth={1} strokeLinecap="round" opacity={0.35} />
      <path d="M84 41 L86.5 43 L84 45" stroke={BLUE} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
      {/* Second arrow */}
      <path d="M88 43 L92 43" stroke={BLUE} strokeWidth={0.8} strokeLinecap="round" opacity={0.2} />

      {/* Laptop */}
      <LaptopShell x={72} y={12} w={68} h={64} />
      {/* Laptop screen — received content with checkmark */}
      <rect x={82} y={24} width={44} height={18} rx={4} fill="url(#successGrad)" opacity={0.15} stroke={SUCCESS} strokeWidth={0.5} strokeOpacity={0.3} />
      <path d="M96 32 L100 36 L108 28" stroke={SUCCESS} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <text x={104} y={42} textAnchor="middle" fill={SUCCESS} fontSize="3.5" fontWeight="600" fontFamily="-apple-system, sans-serif">Received ✓</text>

      {/* Progress bar hint on phone */}
      <rect x={24} y={72} width={28} height={2} rx={1} fill="white" opacity={0.1} />
      <rect x={24} y={72} width={18} height={2} rx={1} fill={BLUE} opacity={0.4} />

      <text x={80} y={108} textAnchor="middle" fill={INK} fontSize="7" fontWeight="600" opacity={0.25} fontFamily="-apple-system, sans-serif">Instant, encrypted transfer</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Privacy / Security illustrations (premium quality)
// ---------------------------------------------------------------------------

/** End-to-end encryption — two devices with a shield between them */
export function IllustEncrypted({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="End-to-end encrypted transfer">
      <SharedDefs />
      {/* Left device */}
      <PhoneShell x={8} y={24} w={30} h={60} />
      <rect x={12} y={32} width={22} height={3} rx={1.5} fill={BLUE} opacity={0.15} />
      <rect x={12} y={39} width={16} height={3} rx={1.5} fill="#fff" opacity={0.1} />

      {/* Shield in center */}
      <path d="M50 32 L60 28 L70 32 L70 46 C70 54 64 60 60 62 C56 60 50 54 50 46 Z" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1.2} />
      <rect x={55} y={42} width={10} height={9} rx={2} fill="url(#blueGrad)" opacity={0.85} />
      <circle cx={60} cy={46} r={1.5} fill="white" />
      <line x1={60} y1={47} x2={60} y2={50} stroke="white" strokeWidth={1.2} strokeLinecap="round" />

      {/* Right device */}
      <PhoneShell x={82} y={24} w={30} h={60} />
      <rect x={86} y={32} width={22} height={3} rx={1.5} fill={BLUE} opacity={0.15} />
      <rect x={86} y={39} width={16} height={3} rx={1.5} fill="#fff" opacity={0.1} />

      {/* Data flow indicators */}
      <circle cx={32} cy={54} r={3} fill={BLUE} opacity={0.15} />
      <circle cx={88} cy={54} r={3} fill={BLUE} opacity={0.15} />
      <path d="M35 54 L50 48" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.3} />
      <path d="M70 48 L85 54" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.3} />
    </svg>
  );
}

/** Temporary — document dissolving into particles */
export function IllustTemporary({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Data is temporary — nothing stored">
      <SharedDefs />
      {/* Document */}
      <rect x={36} y={16} width={32} height={42} rx={4} fill="white" stroke="#E0E0E0" strokeWidth={1} />
      <line x1={42} y1={26} x2={62} y2={26} stroke={INK} strokeWidth={0.8} opacity={0.15} />
      <line x1={42} y1={32} x2={56} y2={32} stroke={INK} strokeWidth={0.8} opacity={0.12} />
      <line x1={42} y1={38} x2={52} y2={38} stroke={INK} strokeWidth={0.8} opacity={0.1} />
      <line x1={42} y1={44} x2={58} y2={44} stroke={INK} strokeWidth={0.8} opacity={0.08} />

      {/* Dissolving strips — falling from document */}
      {[0, 1, 2, 3, 4].map(i => (
        <React.Fragment key={i}>
          <rect
            x={42 + i * 5}
            y={62 + i * 4}
            width={3}
            height={7 - i * 1.2}
            rx={1}
            fill={BLUE}
            opacity={0.35 - i * 0.06}
          />
        </React.Fragment>
      ))}

      {/* Confirmed gone — checkmark circle */}
      <circle cx={60} cy={92} r={12} fill="url(#successGrad)" opacity={0.15} stroke={SUCCESS} strokeWidth={1} />
      <path d="M54 92 L58 96 L67 87" stroke={SUCCESS} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />

      {/* Ghost outline */}
      <rect x={36} y={16} width={32} height={42} rx={4} stroke={INK} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.08} fill="none" />
    </svg>
  );
}

/** Zero storage — empty cloud with X */
export function IllustNoStorage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="No cloud storage — nothing kept">
      <SharedDefs />
      {/* Cloud outline */}
      <path d="M34 68 C24 68 20 60 26 54 C22 46 30 38 40 38 C44 30 54 26 64 28 C74 24 84 30 86 40 C96 40 100 50 94 58 C100 64 96 74 86 74 L34 68Z" fill="white" stroke="#E0E0E0" strokeWidth={1} opacity={0.6} />

      {/* X mark */}
      <line x1="48" y1="46" x2="72" y2="68" stroke={RED} strokeWidth={2.2} strokeLinecap="round" />
      <line x1="72" y1="46" x2="48" y2="68" stroke={RED} strokeWidth={2.2} strokeLinecap="round" />

      {/* Small devices at bottom */}
      <PhoneShell x={28} y={82} w={18} h={28} />
      <LaptopShell x={66} y={84} w={26} h={22} />
      <line x1="46" y1="96" x2="66" y2="94" stroke={SUCCESS} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Empty states / Error states
// ---------------------------------------------------------------------------

/** No files yet — empty room waiting */
export function IllustWaiting({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Waiting for connection">
      <SharedDefs />
      <PhoneShell x={12} y={16} w={28} h={52} />
      <LaptopShell x={66} y={18} w={38} h={34} />

      {/* Dotted connection line */}
      <line x1="40" y1="42" x2="66" y2="38" stroke={INK} strokeWidth={0.8} strokeDasharray="4 4" opacity={0.12} />
      <circle cx="53" cy="40" r={2} fill={BLUE} opacity={0.2} />
      <circle cx="53" cy="40" r={5} fill={BLUE} opacity={0.06} />
    </svg>
  );
}

/** Transfer complete — success state */
export function IllustComplete({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Transfer complete">
      <SharedDefs />
      <circle cx="60" cy="44" r="26" fill="url(#successGrad)" opacity={0.12} stroke={SUCCESS} strokeWidth={1.2} />
      <path d="M48 44 L56 52 L74 36" stroke={SUCCESS} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Radiating lines */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 60 + Math.cos(rad) * 28;
        const y1 = 44 + Math.sin(rad) * 28;
        const x2 = 60 + Math.cos(rad) * 32;
        const y2 = 44 + Math.sin(rad) * 32;
        return <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />;
      })}
    </svg>
  );
}

/** Error / broken connection */
export function IllustError({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Connection error">
      <SharedDefs />
      <PhoneShell x={12} y={20} w={28} h={48} />
      <LaptopShell x={66} y={22} w={38} h={34} />
      {/* Broken connection */}
      <line x1="40" y1="44" x2="54" y2="42" stroke={RED} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.4} />
      <line x1="66" y1="42" x2="66" y2="40" stroke={RED} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.4} />
      {/* Exclamation */}
      <circle cx="53" cy="42" r="8" fill="#FEE2E2" stroke={RED} strokeWidth={0.8} />
      <line x1="53" y1="38" x2="53" y2="43" stroke={RED} strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="53" cy="45.5" r={0.8} fill={RED} />
    </svg>
  );
}

/** 404 — lost page */
export function Illust404({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={cn('w-32 h-24', className)} role="img" aria-label="Page not found">
      <SharedDefs />
      {/* Magnifying glass */}
      <circle cx="72" cy="46" r="24" fill="white" stroke="#E0E0E0" strokeWidth={1} />
      <circle cx="72" cy="46" r="18" fill="url(#blueGradLight)" opacity={0.5} />
      <line x1="90" y1="64" x2="108" y2="82" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.3} />
      <text x="72" y="53" textAnchor="middle" fill={BLUE} fontSize="22" fontWeight="700" opacity={0.6}>?</text>
      <text x="80" y="108" textAnchor="middle" fill={INK} fontSize="11" fontWeight="700" opacity={0.12}>404</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Landing page feature illustrations
// ---------------------------------------------------------------------------

/** Cross-platform — phone + laptop connected */
export function IllustCrossPlatform({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Works across any two devices">
      <SharedDefs />
      {/* Phone */}
      <rect x="10" y="16" width="18" height="36" rx="4" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1} />
      <rect x="13" y="22" width="12" height="22" rx="1.5" fill="white" opacity={0.7} />
      {/* Laptop */}
      <rect x="44" y="14" width="26" height="18" rx="3" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1} />
      <rect x="47" y="18" width="20" height="10" rx="1.5" fill="white" opacity={0.7} />
      <path d="M40 32 L44 32 L47 34 L67 34 L70 32 L74 32" stroke={BLUE} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} fill="none" />
      {/* Connection */}
      <path d="M28 34 L44 34" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.35} />
      <path d="M42 32.5 L44 34 L42 35.5" stroke={BLUE} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />
    </svg>
  );
}

/** No app needed — browser window */
export function IllustNoApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="No app required — works in browser">
      <SharedDefs />
      {/* Browser window */}
      <rect x="8" y="12" width="64" height="52" rx="6" fill="white" stroke="#E0E0E0" strokeWidth={1} />
      {/* Title bar */}
      <line x1="8" y1="24" x2="72" y2="24" stroke="#E0E0E0" strokeWidth={0.6} />
      {/* Traffic lights */}
      <circle cx="16" cy="18" r="2" fill="#FF5F57" opacity={0.7} />
      <circle cx="23" cy="18" r="2" fill="#FFBD2E" opacity={0.7} />
      <circle cx="30" cy="18" r="2" fill="#28C840" opacity={0.7} />
      {/* URL bar */}
      <rect x="36" y="15" width="28" height="6" rx="3" fill="url(#blueGradLight)" />
      <text x="50" y="19.5" textAnchor="middle" fill={BLUE} fontSize="3.5" fontWeight="600" opacity={0.6}>sharetexts</text>
      {/* Content */}
      <rect x="16" y="30" width="48" height="4" rx="2" fill={BLUE} opacity={0.12} />
      <rect x="16" y="38" width="32" height="4" rx="2" fill={INK} opacity={0.06} />
      <circle cx="56" cy="52" r="6" fill={BLUE} opacity={0.15} />
      <path d="M54 52 L56 50 L58 52" stroke={BLUE} strokeWidth={1} strokeLinecap="round" opacity={0.4} />
    </svg>
  );
}

/** Fast transfer — speed indicator */
export function IllustFast({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Fast transfers">
      <SharedDefs />
      {/* Speed circle */}
      <circle cx="40" cy="40" r="28" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1} opacity={0.6} />
      {/* Speed lines */}
      <path d="M24 36 L30 36 L28 44 L34 44" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      <path d="M40 28 L40 20" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" opacity={0.3} />
      <path d="M56 36 L50 36 L52 44 L46 44" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
      {/* Lightning bolt */}
      <path d="M42 26 L36 42 L42 42 L38 56" stroke={ORANGE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Privacy — shield with check */
export function IllustPrivacy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Private by design">
      <SharedDefs />
      {/* Shield */}
      <path d="M40 12 L56 20 L56 40 C56 52 48 60 40 64 C32 60 24 52 24 40 L24 20 Z" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1.2} />
      {/* Checkmark */}
      <path d="M33 40 L38 46 L50 32" stroke={SUCCESS} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** File types — file icon with extensions */
export function IllustFileTypes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Supports all file types">
      <SharedDefs />
      {/* Stacked files */}
      <rect x="18" y="14" width="30" height="40" rx="4" fill="white" stroke="#E0E0E0" strokeWidth={1} transform="rotate(-6 33 34)" />
      <rect x="22" y="18" width="30" height="40" rx="4" fill="white" stroke="#E0E0E0" strokeWidth={1} transform="rotate(3 37 38)" />
      <rect x="26" y="22" width="30" height="40" rx="4" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1} />
      {/* File lines */}
      <rect x="30" y="30" width="20" height="3" rx={1.5} fill={BLUE} opacity={0.2} />
      <rect x="30" y="37" width="14" height={3} rx={1.5} fill={INK} opacity={0.1} />
      <rect x="30" y="44" width="18" height={3} rx={1.5} fill={INK} opacity={0.08} />
      {/* Extension tags */}
      <rect x="48" y="48" width="16" height="10" rx={3} fill="url(#blueGrad)" opacity={0.9} />
      <text x="56" y="55.5" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="-apple-system, sans-serif">PDF</text>
    </svg>
  );
}

/** Troubleshoot — wrench + gear */
export function IllustTroubleshoot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Troubleshooting help">
      <SharedDefs />
      {/* Gear */}
      <circle cx="36" cy="40" r="16" fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={1} opacity={0.6} />
      <circle cx="36" cy="40" r="8" fill="white" stroke={BLUE} strokeWidth={0.8} />
      {/* Gear teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
        const rad = (angle * Math.PI) / 180;
        const x = 36 + Math.cos(rad) * 16;
        const y = 40 + Math.sin(rad) * 16;
        return <circle key={angle} cx={x} cy={y} r={2.5} fill="url(#blueGradLight)" stroke={BLUE} strokeWidth={0.5} />;
      })}
      <circle cx="36" cy="40" r="3" fill={BLUE} opacity={0.3} />
      {/* Wrench */}
      <path d="M52 28 L62 18" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={0.4} />
      <circle cx="62" cy="18" r="4" fill="none" stroke={INK} strokeWidth={1.5} opacity={0.3} />
    </svg>
  );
}
