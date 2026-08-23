import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Design system for illustrations
// ---------------------------------------------------------------------------
// Stroke: 1.5px (consistent across all)
// Colors: azure-600 (primary), apple-ink-muted (secondary), status-success (accent)
// Style: minimal line art with subtle fills, rounded joins, Apple-inspired
// Size: all accept `className` for sizing via Tailwind (default: w-24 h-24)
// ---------------------------------------------------------------------------

const STROKE = 1.5;
const BLUE = '#0A66F0';
const BLUE_LIGHT = '#E8F0FE';
const INK = '#1D1D1F';
const INK_LIGHT = '#6E6E73';
const SUCCESS = '#1C9A61';
const SUCCESS_LIGHT = '#E6F7EF';
const ORANGE = '#B26A00';
const PURPLE = '#8B5CF6';
const PURPLE_LIGHT = '#EDE9FE';

// ---------------------------------------------------------------------------
// How It Works — 3 steps
// ---------------------------------------------------------------------------

/** Step 1: Open — two device screens side by side */
export function IllustOpen({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Open ShareText on both devices">
      {/* Phone */}
      <rect x="14" y="24" width="36" height="64" rx="6" stroke={INK} strokeWidth={STROKE} fill={BLUE_LIGHT} />
      <rect x="18" y="32" width="28" height="48" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      <circle cx="32" cy="28" r="1.5" fill={INK} opacity={0.3} />
      <text x="32" y="72" textAnchor="middle" fill={INK} fontSize="6" fontWeight="600" opacity={0.5}>ST</text>

      {/* Laptop */}
      <rect x="62" y="20" width="46" height="32" rx="4" stroke={INK} strokeWidth={STROKE} fill={BLUE_LIGHT} />
      <rect x="66" y="26" width="38" height="20" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      <circle cx="85" cy="23" r="1" fill={INK} opacity={0.3} />
      <path d="M56 52 L62 52 L66 56 L104 56 L108 52 L114 52" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {/* Small notification dots */}
      <circle cx="32" cy="42" r="4" fill={BLUE} opacity={0.15} />
      <circle cx="85" cy="36" r="4" fill={BLUE} opacity={0.15} />
    </svg>
  );
}

/** Step 2: Pair — two screens connected by a subtle line with pairing dots */
export function IllustPair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Pair with a code or QR">
      {/* Phone */}
      <rect x="14" y="24" width="36" height="64" rx="6" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="18" y="32" width="28" height="48" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      {/* Pairing code dots */}
      <g transform="translate(22, 52)">
        {[0, 1, 2].map(i => (
          <React.Fragment key={i}>
            <rect x={i * 9} y="0" width="7" height="9" rx="2" fill={BLUE_LIGHT} stroke={BLUE} strokeWidth={0.8} />
            <circle cx={i * 9 + 3.5} cy={4.5} r="1.2" fill={BLUE} opacity={0.6} />
          </React.Fragment>
        ))}
      </g>

      {/* Connection line */}
      <line x1="50" y1="56" x2="62" y2="56" stroke={BLUE} strokeWidth={STROKE} strokeDasharray="3 2" opacity={0.5} />

      {/* Laptop */}
      <rect x="62" y="20" width="46" height="32" rx="4" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="66" y="26" width="38" height="20" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      <path d="M56 52 L62 52 L66 56 L104 56 L108 52 L114 52" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* QR code hint */}
      <rect x="76" y="31" width="10" height="10" rx="1" stroke={BLUE} strokeWidth={0.8} fill={BLUE_LIGHT} opacity={0.7} />
      <rect x="78" y="33" width="2.5" height="2.5" rx="0.5" fill={BLUE} opacity={0.3} />
      <rect x="81.5" y="33" width="2.5" height="2.5" rx="0.5" fill={BLUE} opacity={0.3} />
      <rect x="78" y="36.5" width="2.5" height="2.5" rx="0.5" fill={BLUE} opacity={0.3} />
    </svg>
  );
}

/** Step 3: Send — content moving from one device to another */
export function IllustSend({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Send content between devices">
      {/* Phone — sender */}
      <rect x="14" y="24" width="36" height="64" rx="6" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="18" y="32" width="28" height="48" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      {/* Sent message bubble */}
      <rect x="28" y="62" width="20" height="8" rx="3" fill={BLUE} opacity={0.85} />
      <text x="38" y="67.5" textAnchor="middle" fill="white" fontSize="4" fontWeight="600">Sent ✓</text>

      {/* Flying content card */}
      <rect x="50" y="46" width="16" height="12" rx="3" fill={BLUE_LIGHT} stroke={BLUE} strokeWidth={0.8} />
      <rect x="52" y="48" width="8" height="4" rx="1" fill={BLUE} opacity={0.2} />
      <text x="58" y="55" textAnchor="middle" fill={BLUE} fontSize="3" fontWeight="600">data</text>

      {/* Direction arrows */}
      <path d="M66 52 L70 52" stroke={BLUE} strokeWidth={1} strokeLinecap="round" opacity={0.5} />
      <path d="M69 50 L71 52 L69 54" stroke={BLUE} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />

      {/* Laptop — receiver */}
      <rect x="72" y="20" width="38" height="28" rx="4" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="75" y="25" width="32" height="17" rx="2" fill="white" stroke={INK} strokeWidth={0.8} opacity={0.6} />
      <path d="M66 48 L72 48 L75 52 L105 52 L108 48 L114 48" stroke={INK} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Received content */}
      <rect x="78" y="29" width="18" height="9" rx="2" fill={SUCCESS_LIGHT} stroke={SUCCESS} strokeWidth={0.6} opacity={0.8} />
      <text x="87" y="35" textAnchor="middle" fill={SUCCESS} fontSize="3.5" fontWeight="600">✓</text>

      {/* Progress hint */}
      <rect x="78" y="55" width="24" height="1.5" rx="0.75" fill={INK} opacity={0.08} />
      <rect x="78" y="55" width="16" height="1.5" rx="0.75" fill={BLUE} opacity={0.4} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Privacy / Security illustrations
// ---------------------------------------------------------------------------

/** End-to-end encryption — two devices with a lock between them */
export function IllustEncrypted({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="End-to-end encrypted transfer">
      {/* Left device */}
      <rect x="10" y="30" width="32" height="48" rx="6" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="14" y="36" width="24" height="36" rx="2" fill="white" stroke={INK} strokeWidth={0.6} opacity={0.5} />

      {/* Shield / lock in center */}
      <path d="M52 40 L60 36 L68 40 L68 52 C68 58 64 62 60 64 C56 62 52 58 52 52 Z" fill={BLUE_LIGHT} stroke={BLUE} strokeWidth={STROKE} />
      <rect x="56" y="48" width="8" height="7" rx="1.5" fill={BLUE} opacity={0.8} />
      <circle cx="60" cy="51" r="1.2" fill="white" />
      <line x1="60" y1="52" x2="60" y2="54" stroke="white" strokeWidth={1} strokeLinecap="round" />

      {/* Right device */}
      <rect x="78" y="30" width="32" height="48" rx="6" stroke={INK} strokeWidth={STROKE} fill="white" />
      <rect x="82" y="36" width="24" height="36" rx="2" fill="white" stroke={INK} strokeWidth={0.6} opacity={0.5} />

      {/* Encrypted data flowing */}
      <circle cx="32" cy="54" r="3" fill={BLUE} opacity={0.15} />
      <circle cx="88" cy="54" r="3" fill={BLUE} opacity={0.15} />
      <path d="M35 54 L52 48" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.3} />
      <path d="M68 48 L85 54" stroke={BLUE} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.3} />
    </svg>
  );
}

/** Temporary — hourglass/shredder concept */
export function IllustTemporary({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="Data is temporary — nothing stored">
      {/* Paper document */}
      <rect x="36" y="20" width="32" height="40" rx="3" stroke={INK} strokeWidth={STROKE} fill="white" />
      <line x1="42" y1="30" x2="62" y2="30" stroke={INK} strokeWidth={0.8} opacity={0.2} />
      <line x1="42" y1="36" x2="58" y2="36" stroke={INK} strokeWidth={0.8} opacity={0.2} />
      <line x1="42" y1="42" x2="55" y2="42" stroke={INK} strokeWidth={0.8} opacity={0.2} />
      <line x1="42" y1="48" x2="60" y2="48" stroke={INK} strokeWidth={0.8} opacity={0.2} />

      {/* Dissolving effect — strips falling */}
      {[0, 1, 2, 3].map(i => (
        <React.Fragment key={i}>
          <rect
            x={44 + i * 5}
            y={64 + i * 3}
            width="3"
            height={6 - i}
            rx="0.5"
            fill={BLUE}
            opacity={0.3 - i * 0.06}
          />
        </React.Fragment>
      ))}

      {/* Checkmark — confirmed gone */}
      <circle cx="60" cy="92" r="10" fill={SUCCESS_LIGHT} stroke={SUCCESS} strokeWidth={1} />
      <path d="M55 92 L58.5 95.5 L66 88" stroke={SUCCESS} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Dotted outline of original doc */}
      <rect x="36" y="20" width="32" height="40" rx="3" stroke={INK} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.1} fill="none" />
    </svg>
  );
}

/** Zero storage — empty cloud with X */
export function IllustNoStorage({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={cn('w-24 h-24', className)} role="img" aria-label="No cloud storage — nothing kept">
      {/* Cloud outline */}
      <path d="M34 72 C24 72 20 64 26 58 C22 50 30 42 40 42 C44 34 54 30 64 32 C74 28 84 34 86 44 C96 44 100 54 94 62 C100 68 96 78 86 78 L34 72Z" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.5} />

      {/* X mark */}
      <line x1="50" y1="50" x2="70" y2="70" stroke="#E53E3E" strokeWidth={2} strokeLinecap="round" />
      <line x1="70" y1="50" x2="50" y2="70" stroke="#E53E3E" strokeWidth={2} strokeLinecap="round" />

      {/* Small devices at bottom */}
      <rect x="30" y="88" width="14" height="20" rx="3" stroke={INK} strokeWidth={0.8} fill="none" opacity={0.3} />
      <rect x="76" y="88" width="20" height="14" rx="2" stroke={INK} strokeWidth={0.8} fill="none" opacity={0.3} />
      <line x1="44" y1="98" x2="76" y2="95" stroke={SUCCESS} strokeWidth={0.8} strokeDasharray="2 2" opacity={0.4} />
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
      {/* Two device outlines */}
      <rect x="16" y="20" width="28" height="44" rx="5" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.4} />
      <rect x="76" y="24" width="30" height="22" rx="3" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.4} />
      <path d="M72 46 L76 46 L79 50 L103 50 L106 46 L110 46" stroke={INK} strokeWidth={0.8} opacity={0.2} fill="none" />

      {/* Dotted connection line */}
      <line x1="44" y1="42" x2="76" y2="38" stroke={INK} strokeWidth={0.8} strokeDasharray="4 4" opacity={0.15} />

      {/* Pulse dots */}
      <circle cx="60" cy="40" r="2" fill={BLUE} opacity={0.2} />
      <circle cx="60" cy="40" r="4" fill={BLUE} opacity={0.08} />
    </svg>
  );
}

/** Transfer complete — success state */
export function IllustComplete({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Transfer complete">
      {/* Check circle */}
      <circle cx="60" cy="44" r="24" fill={SUCCESS_LIGHT} stroke={SUCCESS} strokeWidth={STROKE} />
      <path d="M49 44 L56 51 L72 37" stroke={SUCCESS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Subtle radiating lines */}
      <line x1="60" y1="14" x2="60" y2="10" stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
      <line x1="86" y1="44" x2="90" y2="44" stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
      <line x1="34" y1="44" x2="30" y2="44" stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
      <line x1="78" y1="26" x2="82" y2="22" stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
      <line x1="42" y1="26" x2="38" y2="22" stroke={SUCCESS} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
    </svg>
  );
}

/** Error / broken connection */
export function IllustError({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Connection error">
      {/* Two devices */}
      <rect x="16" y="24" width="28" height="40" rx="5" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.4} />
      <rect x="76" y="28" width="30" height="22" rx="3" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.4} />

      {/* Broken connection */}
      <line x1="44" y1="44" x2="56" y2="42" stroke="#E53E3E" strokeWidth={STROKE} strokeDasharray="3 3" opacity={0.5} />
      <line x1="64" y1="42" x2="76" y2="40" stroke="#E53E3E" strokeWidth={STROKE} strokeDasharray="3 3" opacity={0.5} />

      {/* Exclamation */}
      <circle cx="60" cy="40" r="8" fill="#FEE2E2" stroke="#E53E3E" strokeWidth={0.8} />
      <line x1="60" y1="36" x2="60" y2="41" stroke="#E53E3E" strokeWidth={1.5} strokeLinecap="round" />
      <circle cx="60" cy="43.5" r="0.8" fill="#E53E3E" />
    </svg>
  );
}

/** 404 — lost page */
export function Illust404({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={cn('w-32 h-24', className)} role="img" aria-label="Page not found">
      {/* Magnifying glass */}
      <circle cx="72" cy="48" r="24" stroke={INK} strokeWidth={STROKE} fill="white" opacity={0.3} />
      <circle cx="72" cy="48" r="18" stroke={BLUE} strokeWidth={1} fill={BLUE_LIGHT} opacity={0.5} />
      <line x1="90" y1="66" x2="106" y2="82" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.4} />

      {/* Question mark inside */}
      <text x="72" y="55" textAnchor="middle" fill={BLUE} fontSize="22" fontWeight="700" opacity={0.7}>?</text>

      {/* Small floating elements */}
      <rect x="20" y="30" width="12" height="8" rx="2" stroke={INK} strokeWidth={0.6} opacity={0.15} />
      <rect x="120" y="60" width="16" height="10" rx="2" stroke={INK} strokeWidth={0.6} opacity={0.15} />
      <circle cx="130" cy="34" r="3" stroke={INK} strokeWidth={0.6} opacity={0.12} />

      {/* 404 text */}
      <text x="80" y="108" textAnchor="middle" fill={INK} fontSize="11" fontWeight="700" opacity={0.15}>404</text>
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
      {/* Phone */}
      <rect x="8" y="16" width="22" height="40" rx="4" stroke={BLUE} strokeWidth={1.2} fill={BLUE_LIGHT} opacity={0.7} />
      <rect x="11" y="22" width="16" height="28" rx="1.5" fill="white" opacity={0.8} />

      {/* Laptop */}
      <rect x="44" y="12" width="30" height="20" rx="3" stroke={BLUE} strokeWidth={1.2} fill={BLUE_LIGHT} opacity={0.7} />
      <rect x="47" y="16" width="24" height="12" rx="1.5" fill="white" opacity={0.8} />
      <path d="M40 32 L44 32 L47 35 L71 35 L74 32 L78 32" stroke={BLUE} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} fill="none" />

      {/* Connection arrow */}
      <path d="M30 36 L44 36" stroke={BLUE} strokeWidth={1} strokeDasharray="2 2" opacity={0.4} />
      <path d="M42 34 L44 36 L42 38" stroke={BLUE} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />
    </svg>
  );
}

/** No app needed — browser window */
export function IllustNoApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="No app required — works in browser">
      {/* Browser window */}
      <rect x="8" y="12" width="64" height="52" rx="6" stroke={INK} strokeWidth={1.2} fill="white" opacity={0.5} />
      {/* Title bar */}
      <line x1="8" y1="24" x2="72" y2="24" stroke={INK} strokeWidth={0.6} opacity={0.15} />
      {/* Traffic lights */}
      <circle cx="16" cy="18" r="2" fill="#FF5F57" opacity={0.6} />
      <circle cx="23" cy="18" r="2" fill="#FFBD2E" opacity={0.6} />
      <circle cx="30" cy="18" r="2" fill="#28C840" opacity={0.6} />
      {/* URL bar */}
      <rect x="36" y="15" width="28" height="6" rx="3" fill={BLUE_LIGHT} opacity={0.6} />
      <text x="50" y="19.5" textAnchor="middle" fill={BLUE} fontSize="3.5" fontWeight="600" opacity={0.6}>sharetexts</text>

      {/* Content area — simple UI */}
      <rect x="16" y="30" width="48" height="4" rx="2" fill={BLUE} opacity={0.12} />
      <rect x="16" y="38" width="32" height="4" rx="2" fill={INK} opacity={0.06} />
      <circle cx="56" cy="52" r="6" fill={BLUE} opacity={0.15} />
      <path d="M54 52 L56 50 L58 52" stroke={BLUE} strokeWidth={1} strokeLinecap="round" opacity={0.6} />
    </svg>
  );
}

/** Fast / instant — lightning bolt in a circle */
export function IllustFast({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Instant transfer">
      {/* Subtle circle */}
      <circle cx="40" cy="40" r="28" stroke={BLUE} strokeWidth={1} fill={BLUE_LIGHT} opacity={0.4} />
      {/* Lightning bolt */}
      <path d="M44 18 L32 40 L42 40 L36 62 L52 36 L42 36 Z" fill={BLUE} opacity={0.8} />
      {/* Speed lines */}
      <line x1="16" y1="32" x2="22" y2="32" stroke={BLUE} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
      <line x1="14" y1="40" x2="20" y2="40" stroke={BLUE} strokeWidth={0.8} opacity={0.15} strokeLinecap="round" />
      <line x1="16" y1="48" x2="22" y2="48" stroke={BLUE} strokeWidth={0.8} opacity={0.2} strokeLinecap="round" />
    </svg>
  );
}

/** Privacy — shield */
export function IllustPrivacy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Private by design">
      {/* Shield */}
      <path d="M40 10 L60 20 L60 38 C60 52 50 62 40 66 C30 62 20 52 20 38 L20 20 Z" stroke={SUCCESS} strokeWidth={1.5} fill={SUCCESS_LIGHT} opacity={0.7} />
      {/* Checkmark inside */}
      <path d="M32 40 L38 46 L50 34" stroke={SUCCESS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FAQ / Help illustrations
// ---------------------------------------------------------------------------

/** Connection issue */
export function IllustConnectionIssue({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 80" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Connection troubleshooting">
      {/* WiFi-like arcs */}
      <path d="M36 50 C40 42, 50 38, 50 38" stroke={INK} strokeWidth={1.2} opacity={0.2} fill="none" strokeLinecap="round" />
      <path d="M32 54 C38 44, 54 36, 54 36" stroke={INK} strokeWidth={1.2} opacity={0.15} fill="none" strokeLinecap="round" />
      <path d="M28 58 C36 46, 58 34, 58 34" stroke={INK} strokeWidth={1.2} opacity={0.1} fill="none" strokeLinecap="round" />

      {/* X through center */}
      <circle cx="50" cy="46" r="6" fill="#FEE2E2" stroke="#E53E3E" strokeWidth={0.8} />
      <line x1="47" y1="43" x2="53" y2="49" stroke="#E53E3E" strokeWidth={1.2} strokeLinecap="round" />
      <line x1="53" y1="43" x2="47" y2="49" stroke="#E53E3E" strokeWidth={1.2} strokeLinecap="round" />

      {/* Devices */}
      <rect x="10" y="56" width="14" height="20" rx="3" stroke={INK} strokeWidth={0.8} opacity={0.2} />
      <rect x="76" y="56" width="18" height="14" rx="2" stroke={INK} strokeWidth={0.8} opacity={0.2} />
    </svg>
  );
}

/** File types — stack of different file icons */
export function IllustFileTypes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Supports many file types">
      {/* Image file */}
      <rect x="12" y="14" width="24" height="28" rx="3" fill={BLUE_LIGHT} stroke={BLUE} strokeWidth={0.8} />
      <circle cx="20" cy="24" r="3" fill={BLUE} opacity={0.3} />
      <path d="M14 36 L22 30 L30 34 L34 28" stroke={BLUE} strokeWidth={0.8} opacity={0.3} fill="none" />
      <text x="24" y="48" textAnchor="middle" fill={INK} fontSize="4" fontWeight="600" opacity={0.4}>IMG</text>

      {/* Video file */}
      <rect x="28" y="24" width="24" height="28" rx="3" fill={PURPLE_LIGHT} stroke={PURPLE} strokeWidth={0.8} />
      <polygon points="38,34 38,44 46,39" fill={PURPLE} opacity={0.4} />
      <text x="40" y="58" textAnchor="middle" fill={INK} fontSize="4" fontWeight="600" opacity={0.4}>VID</text>

      {/* Doc file */}
      <rect x="44" y="18" width="24" height="28" rx="3" fill={SUCCESS_LIGHT} stroke={SUCCESS} strokeWidth={0.8} />
      <line x1="50" y1="26" x2="62" y2="26" stroke={SUCCESS} strokeWidth={0.6} opacity={0.3} />
      <line x1="50" y1="30" x2="60" y2="30" stroke={SUCCESS} strokeWidth={0.6} opacity={0.3} />
      <line x1="50" y1="34" x2="58" y2="34" stroke={SUCCESS} strokeWidth={0.6} opacity={0.3} />
      <text x="56" y="52" textAnchor="middle" fill={INK} fontSize="4" fontWeight="600" opacity={0.4}>DOC</text>
    </svg>
  );
}

/** Troubleshooting — wrench + gear */
export function IllustTroubleshoot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" className={cn('w-16 h-16', className)} role="img" aria-label="Troubleshooting help">
      {/* Gear */}
      <circle cx="46" cy="36" r="12" stroke={INK} strokeWidth={1} opacity={0.25} fill="none" />
      <circle cx="46" cy="36" r="6" stroke={INK} strokeWidth={0.8} opacity={0.2} fill="white" />
      {/* Gear teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 46 + Math.cos(rad) * 11;
        const y1 = 36 + Math.sin(rad) * 11;
        const x2 = 46 + Math.cos(rad) * 14;
        const y2 = 36 + Math.sin(rad) * 14;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={INK} strokeWidth={2} opacity={0.15} strokeLinecap="round" />;
      })}
      {/* Wrench */}
      <path d="M24 54 L36 42" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
      <circle cx="22" cy="56" r="5" stroke={BLUE} strokeWidth={1} opacity={0.4} fill={BLUE_LIGHT} />
      <circle cx="22" cy="56" r="2" fill={BLUE} opacity={0.15} />
    </svg>
  );
}
