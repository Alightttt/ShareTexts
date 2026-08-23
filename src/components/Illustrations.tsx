import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// ShareText Illustration System
// ---------------------------------------------------------------------------
// Visual vocabulary: phone, laptop, clipboard, text, photo, link, transfer
// These explain real product behavior, not abstract "technology"
// ---------------------------------------------------------------------------

const BLUE = '#0A66F0';
const INK = '#1D1D1F';
const INK_M = '#6E6E73';
const SUCCESS = '#1C9A61';
const RED = '#E53E3E';

// Shared phone outline — clean, simple
function Phone({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const r = w * 0.18;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.25} />
      <rect x={x + w * 0.08} y={y + h * 0.06} width={w * 0.84} height={h * 0.84} rx={r * 0.6} fill="#0C1220" opacity={0.08} />
      <rect x={x + w * 0.32} y={y + h * 0.04} width={w * 0.36} height={h * 0.02} rx={h * 0.01} fill={INK} opacity={0.15} />
    </g>
  );
}

// Shared laptop outline — clean, simple
function Laptop({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const screenH = h * 0.72;
  const deckH = h - screenH;
  const r = w * 0.03;
  return (
    <g>
      <rect x={x} y={y} width={w} height={screenH} rx={r} fill="none" stroke={INK} strokeWidth={1.2} opacity={0.25} />
      <rect x={x + w * 0.04} y={y + h * 0.05} width={w * 0.92} height={screenH - h * 0.08} rx={r * 0.5} fill="#0C1220" opacity={0.08} />
      <path d={`M${x - w * 0.04} ${y + screenH} L${x} ${y + screenH} L${x + w * 0.04} ${y + screenH + deckH * 0.3} L${x + w * 0.96} ${y + screenH + deckH * 0.3} L${x + w} ${y + screenH} L${x + w + w * 0.04} ${y + screenH} L${x + w + w * 0.04} ${y + h} L${x - w * 0.04} ${y + h} Z`}
        fill="none" stroke={INK} strokeWidth={0.8} opacity={0.15} strokeLinejoin="round" />
    </g>
  );
}

// ---------------------------------------------------------------------------
// How It Works illustrations — real ShareText UI concepts
// ---------------------------------------------------------------------------

/** Step 1: Open — ShareText open on both devices */
export function IllustOpen({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Open ShareText on both devices">
      <Phone x={18} y={14} w={38} h={80} />
      {/* Phone screen — ShareText UI hint */}
      <rect x={22} y={28} width={30} height={5} rx={2.5} fill={BLUE} opacity={0.15} />
      <rect x={22} y={38} width={20} height={3} rx={1.5} fill={INK} opacity={0.08} />
      <rect x={22} y={44} width={25} height={3} rx={1.5} fill={INK} opacity={0.06} />
      <rect x={22} y={52} width={12} height={10} rx={3} fill={BLUE} opacity={0.1} />

      <Laptop x={72} y={12} w={66} h={64} />
      {/* Laptop screen — ShareText UI hint */}
      <rect x={76} y={20} width={58} height={5} rx={2.5} fill={BLUE} opacity={0.15} />
      <rect x={76} y={30} width={40} height={3} rx={1.5} fill={INK} opacity={0.08} />
      <rect x={76} y={36} width={30} height={3} rx={1.5} fill={INK} opacity={0.06} />
      <rect x={76} y={44} width={14} height={10} rx={3} fill={BLUE} opacity={0.1} />

      {/* Active indicator — both devices open */}
      <circle cx={37} cy={56} r={2} fill={BLUE} opacity={0.4} />
      <circle cx={105} cy={48} r={2} fill={BLUE} opacity={0.4} />
    </svg>
  );
}

/** Step 2: Connect — pairing code / QR interaction */
export function IllustPair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Connect with a code or QR">
      <Phone x={18} y={14} w={38} h={80} />
      {/* Phone screen — code input */}
      <rect x={22} y={28} width={30} height={5} rx={2.5} fill={BLUE} opacity={0.1} />
      {/* Code digits hint */}
      {[0, 1, 2].map(i => (
        <rect key={i} x={24 + i * 8} y={40} width={6} height={8} rx={2} fill="none" stroke={BLUE} strokeWidth={0.6} opacity={0.25} />
      ))}

      {/* Connection line — the pairing bridge */}
      <line x1="56" y1="52" x2="72" y2="40" stroke={BLUE} strokeWidth={1} strokeDasharray="3 2" opacity={0.3} />

      <Laptop x={72} y={12} w={66} h={64} />
      {/* Laptop screen — QR code hint */}
      <rect x={90} y={22} width={20} height={20} rx={3} fill="none" stroke={BLUE} strokeWidth={0.6} opacity={0.2} />
      <rect x={93} y={25} width={4} height={4} rx={1} fill={BLUE} opacity={0.15} />
      <rect x={101} y={25} width={4} height={4} rx={1} fill={BLUE} opacity={0.15} />
      <rect x={93} y={33} width={4} height={4} rx={1} fill={BLUE} opacity={0.15} />
      <rect x={97} y={29} width={4} height={4} rx={1} fill={BLUE} opacity={0.25} />
    </svg>
  );
}

/** Step 3: Move — content flowing between devices */
export function IllustSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 140" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Move content between devices">
      <Phone x={18} y={14} w={38} h={80} />
      {/* Phone screen — sent message */}
      <rect x={28} y={50} width={22} height={8} rx={4} fill={BLUE} opacity={0.2} />
      <text x={39} y={55.5} textAnchor="middle" fill={BLUE} fontSize="3.5" fontWeight="600" opacity={0.5}>Sent ✓</text>

      {/* Content moving — just an arrow, nothing decorative */}
      <path d="M56 50 L72 40" stroke={BLUE} strokeWidth={1} strokeLinecap="round" opacity={0.25} />
      <path d="M70 38 L72 40 L70 42" stroke={BLUE} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />

      <Laptop x={72} y={12} w={66} h={64} />
      {/* Laptop screen — received content */}
      <rect x={80} y={24} width={44} height={16} rx={3} fill={SUCCESS} opacity={0.1} stroke={SUCCESS} strokeWidth={0.5} />
      <path d="M94 32 L98 36 L106 28" stroke={SUCCESS} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Feature illustrations — recognizable situations
// ---------------------------------------------------------------------------

/** Cross-platform — phone + laptop */
export function IllustCrossPlatform({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="Works across any two devices">
      <Phone x={8} y={14} w={22} h={44} />
      <Laptop x={40} y={16} w={32} h={28} />
      <path d="M30 36 L40 32" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.25} />
      <path d="M38 31 L40 32 L38 33" stroke={BLUE} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
    </svg>
  );
}

/** Fast transfer — speed */
export function IllustFast({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="Fast transfers">
      {/* Lightning bolt — simple, not decorative */}
      <path d="M42 18 L34 42 L40 42 L36 62" stroke={INK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" opacity={0.25} />
    </svg>
  );
}

/** Privacy — shield with check */
export function IllustPrivacy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="Private by design">
      <path d="M40 14 L54 20 L54 36 C54 46 48 52 40 56 C32 52 26 46 26 36 L26 20 Z" fill="none" stroke={INK} strokeWidth={1.2} opacity={0.2} />
      <path d="M34 36 L38 40 L48 30" stroke={SUCCESS} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Encrypted — two devices with lock between */
export function IllustEncrypted({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="End-to-end encrypted">
      <Phone x={8} y={28} w={28} h={56} />
      {/* Lock */}
      <rect x={54} y={40} width={12} height={10} rx={2} fill={BLUE} opacity={0.2} />
      <path d="M56 40 L56 36 C56 32 60 30 60 30 C60 30 64 32 64 36 L64 40" fill="none" stroke={BLUE} strokeWidth={1.2} opacity={0.3} />
      <circle cx={60} cy={44} r={1.2} fill="white" opacity={0.5} />
      <Phone x={84} y={28} w={28} h={56} />
      {/* Connection lines */}
      <path d="M36 56 L54 48" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.2} />
      <path d="M66 48 L84 56" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.2} />
    </svg>
  );
}

/** Temporary — document dissolving */
export function IllustTemporary({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Temporary — nothing stored">
      <rect x={38} y={18} width={28} height={36} rx={3} fill="none" stroke={INK} strokeWidth={1} opacity={0.15} />
      <line x1={42} y1={28} x2={62} y2={28} stroke={INK} strokeWidth={0.6} opacity={0.1} />
      <line x1={42} y1={34} x2={56} y2={34} stroke={INK} strokeWidth={0.6} opacity={0.08} />
      <line x1={42} y1={40} x2={52} y2={40} stroke={INK} strokeWidth={0.6} opacity={0.06} />
      {/* Fading strips */}
      {[0, 1, 2].map(i => (
        <rect key={i} x={44 + i * 5} y={58 + i * 5} width={2.5} height={6 - i * 1.5} rx={1} fill={INK} opacity={0.08 - i * 0.02} />
      ))}
      {/* Gone check */}
      <circle cx={60} cy={88} r={8} fill="none" stroke={SUCCESS} strokeWidth={1} opacity={0.2} />
      <path d="M56 88 L59 91 L65 85" stroke={SUCCESS} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** No storage — empty cloud with X */
export function IllustNoStorage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="No cloud storage">
      <path d="M36 66 C26 66 22 58 28 52 C24 44 32 36 42 36 C46 28 56 24 66 26 C76 22 86 28 88 38 C98 38 102 48 96 56 C102 62 98 72 88 72 L36 66Z" fill="none" stroke={INK} strokeWidth={1} opacity={0.15} />
      <line x1="50" y1="44" x2="70" y2="64" stroke={RED} strokeWidth={1.8} strokeLinecap="round" />
      <line x1="70" y1="44" x2="50" y2="64" stroke={RED} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Empty / error / 404 states
// ---------------------------------------------------------------------------

export function IllustWaiting({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Waiting">
      <Phone x={14} y={18} w={26} h={50} />
      <Laptop x={68} y={20} w={36} h={32} />
      <line x1="40" y1="42" x2="68" y2="38" stroke={INK} strokeWidth={0.6} strokeDasharray="3 3" opacity={0.1} />
    </svg>
  );
}

export function IllustComplete({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Complete">
      <circle cx="60" cy="44" r="20" fill="none" stroke={SUCCESS} strokeWidth={1.2} opacity={0.2} />
      <path d="M50 44 L57 51 L72 37" stroke={SUCCESS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IllustError({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Error">
      <Phone x={14} y={22} w={26} h={48} />
      <Laptop x={68} y={24} w={36} h={32} />
      <line x1="40" y1="46" x2="68" y2="40" stroke={RED} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.3} />
      <circle cx="54" cy="42" r="6" fill="none" stroke={RED} strokeWidth={0.8} opacity={0.3} />
      <line x1="54" y1="39" x2="54" y2="43" stroke={RED} strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="54" cy="45" r={0.6} fill={RED} opacity={0.3} />
    </svg>
  );
}

export function Illust404({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={cn('w-32 h-24', className)} role="img" aria-label="Page not found">
      <circle cx="72" cy="48" r="22" fill="none" stroke={INK} strokeWidth={1} opacity={0.12} />
      <text x="72" y="55" textAnchor="middle" fill={INK} fontSize="20" fontWeight="600" opacity={0.12}>?</text>
      <text x="80" y="106" textAnchor="middle" fill={INK} fontSize="10" fontWeight="600" opacity={0.08}>404</text>
    </svg>
  );
}

/** No app needed — browser window */
export function IllustNoApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="Works in browser">
      <rect x="10" y="14" width="60" height="46" rx="4" fill="none" stroke={INK} strokeWidth={1} opacity={0.15} />
      <line x1="10" y1="24" x2="70" y2="24" stroke={INK} strokeWidth={0.5} opacity={0.1} />
      <circle cx="17" cy="19" r="1.5" fill={INK} opacity={0.1} />
      <circle cx="23" cy="19" r="1.5" fill={INK} opacity={0.1} />
      <circle cx="29" cy="19" r="1.5" fill={INK} opacity={0.1} />
    </svg>
  );
}

/** File types — document stack */
export function IllustFileTypes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="All file types">
      <rect x="20" y="14" width="26" height="34" rx="3" fill="none" stroke={INK} strokeWidth={0.8} opacity={0.12} transform="rotate(-4 33 31)" />
      <rect x="24" y="18" width="26" height="34" rx="3" fill="none" stroke={INK} strokeWidth={0.8} opacity={0.15} transform="rotate(2 37 35)" />
      <rect x="28" y="22" width="26" height="34" rx="3" fill="none" stroke={INK} strokeWidth={1} opacity={0.2} />
      <rect x={32} y={30} width={16} height={2.5} rx={1.25} fill={INK} opacity={0.08} />
      <rect x={32} y={36} width={12} height={2.5} rx={1.25} fill={INK} opacity={0.06} />
      <rect x={32} y={42} width={14} height={2.5} rx={1.25} fill={INK} opacity={0.05} />
    </svg>
  );
}

/** Troubleshoot — wrench */
export function IllustTroubleshoot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-12 h-12', className)} role="img" aria-label="Troubleshooting">
      <path d="M32 48 L24 56" stroke={INK} strokeWidth={1.8} strokeLinecap="round" opacity={0.2} />
      <circle cx="24" cy="56" r="5" fill="none" stroke={INK} strokeWidth={1.2} opacity={0.15} />
      <path d="M48 32 L56 24" stroke={INK} strokeWidth={1.8} strokeLinecap="round" opacity={0.2} />
      <circle cx="56" cy="24" r="5" fill="none" stroke={INK} strokeWidth={1.2} opacity={0.15} />
    </svg>
  );
}
