import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// ShareText Illustration System — Consistent Visual Language
// ---------------------------------------------------------------------------
// Design principles:
// - Every illustration answers "What is happening?" without text
// - Shows real ShareText UI, not abstract symbols
// - Same device proportions, stroke, shadow, color, density
// - Brand blue for actions, neutral for surfaces, green for success
// - High whitespace, restrained, premium feel
// ---------------------------------------------------------------------------

const B = '#0A66F0';      // Brand blue — actions, connections
const B_L = '#E8F0FE';    // Brand light — screen backgrounds
const K = '#1D1D1F';      // Ink — device outlines, text
const K_M = '#6E6E73';    // Ink muted — secondary elements
const G = '#1C9A61';      // Green — success, received
const W = '#FFFFFF';      // White — cards, screens
const BG = '#F5F5F7';     // Background — light surfaces
const BG_D = '#E5E5EA';   // Border — subtle dividers

// ── Device primitives ──
// Phone: 9:19.5 aspect, 18% corner radius
// Laptop: 16:10 screen, subtle deck

function Phone({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const r = w * 0.18;
  const bezel = w * 0.06;
  const notchW = w * 0.3;
  const notchH = h * 0.018;
  return (
    <g>
      {/* Shell */}
      <rect x={x} y={y} width={w} height={h} rx={r} fill={W} stroke={BG_D} strokeWidth={1} />
      {/* Screen */}
      <rect x={x + bezel} y={y + h * 0.04} width={w - bezel * 2} height={h * 0.92} rx={r * 0.65} fill={B_L} />
      {/* Notch */}
      <rect x={x + (w - notchW) / 2} y={y + h * 0.025} width={notchW} height={notchH} rx={notchH / 2} fill={K} opacity={0.15} />
    </g>
  );
}

function Laptop({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const screenH = h * 0.72;
  const deckH = h - screenH;
  const bezel = w * 0.035;
  const r = w * 0.025;
  return (
    <g>
      {/* Screen frame */}
      <rect x={x} y={y} width={w} height={screenH} rx={r} fill={W} stroke={BG_D} strokeWidth={1} />
      {/* Screen */}
      <rect x={x + bezel} y={y + h * 0.045} width={w - bezel * 2} height={screenH - h * 0.08} rx={r * 0.5} fill={B_L} />
      {/* Camera dot */}
      <circle cx={x + w / 2} cy={y + h * 0.02} r={w * 0.008} fill={K} opacity={0.12} />
      {/* Deck */}
      <path d={`M${x - w * 0.035} ${y + screenH} L${x} ${y + screenH} L${x + w * 0.04} ${y + screenH + deckH * 0.35} L${x + w * 0.96} ${y + screenH + deckH * 0.35} L${x + w} ${y + screenH} L${x + w + w * 0.035} ${y + screenH} L${x + w + w * 0.035} ${y + h} L${x - w * 0.035} ${y + h} Z`}
        fill={W} stroke={BG_D} strokeWidth={0.8} strokeLinejoin="round" />
      {/* Trackpad hint */}
      <rect x={x + w * 0.35} y={y + screenH + deckH * 0.5} width={w * 0.3} height={deckH * 0.35} rx={2} fill={BG} opacity={0.5} />
    </g>
  );
}

// ── ShareText UI primitives ──

/** ShareText header bar inside a device screen */
function STHeader({ x, y, w, connected }: { x: number; y: number; w: number; connected?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={10} fill={W} opacity={0.6} />
      <rect x={x + 3} y={y + 2.5} width={3} height={3} rx={1.5} fill={B} opacity={0.5} />
      <text x={x + 8} y={y + 5.5} fill={K} fontSize={3} fontWeight={600} opacity={0.4}>ShareText</text>
      {connected && (
        <>
          <circle cx={x + w - 5} cy={y + 5} r={1.5} fill={G} opacity={0.6} />
          <text x={x + w - 3} y={y + 6} fill={G} fontSize={2.2} fontWeight={600} opacity={0.5}>Connected</text>
        </>
      )}
    </g>
  );
}

/** Code digits — the pairing code display */
function CodeDigits({ x, y, w }: { x: number; y: number; w: number }) {
  const digits = ['8', '1', '7', '1', '1', '9'];
  const gap = 2;
  const digitW = (w - gap * 2) / 6 - gap;
  const digitH = digitW * 1.3;
  return (
    <g>
      {digits.map((d, i) => {
        const dx = x + i * (digitW + gap) + (i >= 3 ? gap * 2 : 0);
        return (
          <g key={i}>
            <rect x={dx} y={y} width={digitW} height={digitH} rx={3} fill={BG} stroke={BG_D} strokeWidth={0.5} />
            <text x={dx + digitW / 2} y={y + digitH * 0.68} textAnchor="middle" fill={K} fontSize={digitH * 0.55} fontWeight={700} fontFamily="monospace" opacity={0.7}>{d}</text>
          </g>
        );
      })}
      {/* Separator */}
      <rect x={x + 3 * (digitW + gap) + gap / 2} y={y + digitH * 0.4} width={gap} height={2} rx={1} fill={K} opacity={0.15} />
    </g>
  );
}

/** QR code pattern — simplified but recognizable */
function QRCode({ x, y, size }: { x: number; y: number; size: number }) {
  const cell = size / 11;
  // Simplified QR pattern — corner markers + data hints
  const pattern = [
    [1,1,1,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,1,0,0,1,0],
    [1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,1],
    [1,0,1,1,1,0,1,0,1,1,0],
    [1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1],
    [0,0,0,0,0,0,0,0,1,1,0],
    [1,0,1,0,1,1,1,0,0,1,1],
    [0,1,0,1,0,0,0,0,1,0,1],
    [1,1,1,0,1,0,1,0,1,1,1],
  ];
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={3} fill={W} />
      {pattern.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect key={`${r}-${c}`} x={x + c * cell} y={y + r * cell} width={cell} height={cell} fill={K} opacity={0.6} rx={0.3} />
          ) : null
        )
      )}
    </g>
  );
}

/** Message bubble — chat text */
function MessageBubble({ x, y, w, h, sent, text }: { x: number; y: number; w: number; h: number; sent?: boolean; text?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={sent ? B : W} opacity={sent ? 0.85 : 0.8} stroke={sent ? 'none' : BG_D} strokeWidth={0.3} />
      {text && <text x={x + 3} y={y + h * 0.65} fill={sent ? W : K} fontSize={2.8} fontWeight={500} opacity={0.7}>{text}</text>}
    </g>
  );
}

/** File card — shows a file being transferred */
function FileCard({ x, y, w, h, name, size }: { x: number; y: number; w: number; h: number; name: string; size: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={W} stroke={BG_D} strokeWidth={0.3} />
      {/* File icon */}
      <rect x={x + 3} y={y + 3} width={h - 6} height={h - 6} rx={2} fill={B_L} stroke={B} strokeWidth={0.4} opacity={0.6} />
      <text x={x + 3 + (h - 6) / 2} y={y + 3 + (h - 6) * 0.65} textAnchor="middle" fill={B} fontSize={2.5} fontWeight={700} opacity={0.5}>PDF</text>
      <text x={x + h + 1} y={y + h * 0.38} fill={K} fontSize={2.8} fontWeight={600} opacity={0.6}>{name}</text>
      <text x={x + h + 1} y={y + h * 0.72} fill={K_M} fontSize={2.2} opacity={0.4}>{size}</text>
    </g>
  );
}

/** Photo card — image thumbnail */
function PhotoCard({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={W} stroke={BG_D} strokeWidth={0.3} />
      {/* Photo placeholder — gradient */}
      <rect x={x + 2} y={y + 2} width={w - 4} height={h - 10} rx={3} fill={B_L} />
      <circle cx={x + w * 0.35} cy={y + (h - 10) * 0.4} r={3} fill={B} opacity={0.15} />
      <path d={`M${x + 2} ${y + h - 12} L${x + w * 0.3} ${y + h - 16} L${x + w * 0.55} ${y + h - 13} L${x + w - 2} ${y + h - 18} L${x + w - 2} ${y + h - 10} L${x + 2} ${y + h - 10} Z`} fill={G} opacity={0.12} />
      <text x={x + 3} y={y + h - 3} fill={K} fontSize={2.5} fontWeight={600} opacity={0.5}>holiday.jpg</text>
    </g>
  );
}

/** Success checkmark */
function Check({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={G} opacity={0.12} />
      <path d={`M${x - r * 0.4} ${y} L${x - r * 0.1} ${y + r * 0.35} L${x + r * 0.45} ${y - r * 0.3}`} stroke={G} strokeWidth={r * 0.15} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

/** Directional arrow between devices */
function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 3;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={B} strokeWidth={0.8} strokeDasharray="2 1.5" opacity={0.25} />
      <path d={`M${x2 - Math.cos(angle) * headLen} ${y2 - Math.sin(angle) * headLen} L${x2} ${y2} L${x2 - Math.cos(angle - 0.5) * headLen} ${y2 - Math.sin(angle - 0.5) * headLen}`} stroke={B} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.3} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// 8 CORE SCENES
// ---------------------------------------------------------------------------

/** 1. PHONE → LAPTOP: A photo moving from a phone to a laptop */
export function IllustPhoneToLaptop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="A photo moving from a phone to a laptop">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone screen — ShareText with photo ready to send */}
      <STHeader x={26} y={30} w={48} connected />
      <PhotoCard x={28} y={50} w={44} h={32} />
      {/* Send button */}
      <circle cx={66} cy={140} r={5} fill={B} opacity={0.7} />
      <text x={66} y={141.5} textAnchor="middle" fill={W} fontSize={3} fontWeight={700}>↑</text>

      {/* Arrow */}
      <Arrow x1={82} y1={80} x2={130} y2={80} />

      <Laptop x={135} y={25} w={160} h={130} />
      {/* Laptop screen — ShareText waiting, then receiving */}
      <STHeader x={142} y={35} w={146} connected />
      {/* Photo arriving on laptop */}
      <PhotoCard x={148} y={55} w={134} h={40} />
      {/* Success indicator */}
      <Check x={280} y={60} r={6} />
    </svg>
  );
}

/** 2. LAPTOP → PHONE: A link moving from a laptop to a phone */
export function IllustLaptopToPhone({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="A link moving from a laptop to a phone">
      <Laptop x={20} y={25} w={160} h={130} />
      {/* Laptop screen — link/text ready to send */}
      <STHeader x={27} y={35} w={146} connected />
      <MessageBubble x={32} y={55} w={130} h={14} sent text="https://example.com/important" />
      {/* Send button */}
      <circle cx={155} y={130} r={5} fill={B} opacity={0.7} />

      {/* Arrow */}
      <Arrow x1={185} y1={80} x2={220} y2={80} />

      <Phone x={230} y={20} w={60} h={140} />
      {/* Phone screen — receiving the link */}
      <STHeader x={236} y={30} w={48} connected />
      <MessageBubble x={238} y={52} w={44} h={12} text="https://example.com/important" />
      <Check x={272} y={58} r={5} />
    </svg>
  );
}

/** 3. TEXT HANDOFF: A block of text moving between two devices */
export function IllustTextHandoff({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="Text moving between two devices">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone — text message sent */}
      <STHeader x={26} y={30} w={48} connected />
      <MessageBubble x={42} y={55} w={34} h={18} sent text="Meeting notes" />
      <MessageBubble x={30} y={76} w={40} h={12} sent text="Tomorrow 4pm" />

      {/* Arrow */}
      <Arrow x1={82} y1={75} x2={130} y2={75} />

      <Laptop x={135} y={25} w={160} h={130} />
      {/* Laptop — received text messages */}
      <STHeader x={142} y={35} w={146} connected />
      <MessageBubble x={148} y={55} w={60} h={14} text="Meeting notes" />
      <MessageBubble x={148} y={72} w={50} h={12} text="Tomorrow 4pm" />
      <Check x={280} y={60} r={6} />
    </svg>
  );
}

/** 4. PAIRING: Two ShareText screens pairing with a short code */
export function IllustPairing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="Two devices pairing with a code">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone — entering the pairing code */}
      <STHeader x={26} y={30} w={48} />
      <text x={50} y={52} textAnchor="middle" fill={K} fontSize={3.5} fontWeight={600} opacity={0.4}>Enter code</text>
      <CodeDigits x={28} y={58} w={44} />
      {/* "Connecting" indicator */}
      <circle cx={50} cy={100} r={3} fill={B} opacity={0.15} />
      <circle cx={50} cy={100} r={1.5} fill={B} opacity={0.4} />

      {/* Dashed connection line between devices */}
      <line x1="82" y1="90" x2="135" y2="90" stroke={B} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.2} />

      <Laptop x={140} y={25} w={160} h={130} />
      {/* Laptop — showing the pairing code to enter */}
      <STHeader x={147} y={35} w={146} />
      <text x={220} y={55} textAnchor="middle" fill={K} fontSize={3.5} fontWeight={600} opacity={0.4}>Share this code</text>
      <CodeDigits x={160} y={62} w={120} />
      <text x={220} y={90} textAnchor="middle" fill={K_M} fontSize={2.5} opacity={0.3}>Code active · 58s</text>
    </svg>
  );
}

/** 5. QR: Phone scanning the ShareText pairing QR */
export function IllustQR({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="Phone scanning a QR code">
      <Laptop x={20} y={25} w={160} h={130} />
      {/* Laptop — showing QR code */}
      <STHeader x={27} y={35} w={146} />
      <text x={100} y={55} textAnchor="middle" fill={K} fontSize={3.5} fontWeight={600} opacity={0.4}>Scan with other device</text>
      <QRCode x={62} y={62} size={70} />

      {/* Arrow from laptop to phone */}
      <Arrow x1={185} y1={85} x2={215} y2={85} />

      <Phone x={220} y={20} w={60} h={140} />
      {/* Phone — camera scanning view */}
      <rect x={226} y={30} width={48} height={120} rx={10} fill={K} opacity={0.08} />
      {/* Viewfinder corners */}
      <path d="M234 50 L234 44 L240 44" stroke={B} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.5} />
      <path d="M266 50 L266 44 L260 44" stroke={B} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.5} />
      <path d="M234 110 L234 116 L240 116" stroke={B} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.5} />
      <path d="M266 110 L266 116 L260 116" stroke={B} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.5} />
      {/* Scan line */}
      <line x1={236} y1={80} x2={264} y2={80} stroke={B} strokeWidth={0.6} opacity={0.3} />
      <text x={250} y={125} textAnchor="middle" fill={W} fontSize={2.5} fontWeight={500} opacity={0.4}>Scanning…</text>
    </svg>
  );
}

/** 6. RECEIVING: A file arriving on the second device */
export function IllustReceiving({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="File arriving on the second device">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone — file sent */}
      <STHeader x={26} y={30} w={48} connected />
      <FileCard x={28} y={50} w={44} h={18} name="report.pdf" size="2.8 MB" />
      <text x={50} y={85} textAnchor="middle" fill={G} fontSize={2.8} fontWeight={600} opacity={0.5}>Sent ✓</text>

      {/* Arrow */}
      <Arrow x1={82} y1={70} x2={130} y2={70} />

      <Laptop x={135} y={25} w={160} h={130} />
      {/* Laptop — receiving with progress */}
      <STHeader x={142} y={35} w={146} connected />
      {/* Progress bar */}
      <rect x={155} y={60} width={120} height={3} rx={1.5} fill={BG} />
      <rect x={155} y={60} width={80} height={3} rx={1.5} fill={B} opacity={0.5} />
      <text x={220} y={72} textAnchor="middle" fill={K_M} fontSize={2.5} opacity={0.4}>Receiving… 67%</text>
      {/* File card appearing */}
      <FileCard x={155} y={80} w={120} h={22} name="report.pdf" size="2.8 MB" />
    </svg>
  );
}

/** 7. COMPLETE: The transferred item appearing in the destination */
export function IllustComplete({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="Transfer complete — item on destination">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone — sent, showing completion */}
      <STHeader x={26} y={30} w={48} connected />
      <PhotoCard x={28} y={50} w={44} h={32} />
      <text x={50} y={95} textAnchor="middle" fill={G} fontSize={2.8} fontWeight={600} opacity={0.5}>Sent ✓</text>

      <Laptop x={135} y={25} w={160} h={130} />
      {/* Laptop — received, photo fully loaded */}
      <STHeader x={142} y={35} w={146} connected />
      <PhotoCard x={148} y={55} w={134} h={45} />
      {/* Success state */}
      <Check x={280} y={60} r={7} />
      <text x={215} y={115} textAnchor="middle" fill={G} fontSize={3} fontWeight={600} opacity={0.5}>✓ Received</text>
      {/* Action buttons */}
      <rect x={170} y={120} width={30} height={10} rx={5} fill={B} opacity={0.15} />
      <text x={185} y={127} textAnchor="middle" fill={B} fontSize={2.5} fontWeight={600} opacity={0.5}>Save</text>
      <rect x={205} y={120} width={30} height={10} rx={5} fill={BG} stroke={BG_D} strokeWidth={0.3} />
      <text x={220} y={127} textAnchor="middle" fill={K_M} fontSize={2.5} fontWeight={600} opacity={0.4}>Share</text>
    </svg>
  );
}

/** 8. PRIVATE: Temporary transfer with no cloud storage */
export function IllustPrivate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" fill="none" className={cn('w-full', className)} role="img" aria-label="Private temporary transfer — no cloud storage">
      <Phone x={20} y={20} w={60} h={140} />
      {/* Phone — content sent */}
      <STHeader x={26} y={30} w={48} connected />
      <MessageBubble x={34} y={55} w={36} h={14} sent text="Secret note" />

      {/* Direct connection — no cloud */}
      <line x1={82} y1={90} x2={135} y2={90} stroke={B} strokeWidth={1} opacity={0.2} />
      {/* Lock icon on the connection */}
      <rect x={104} y={84} width={10} height={8} rx={2} fill={B} opacity={0.15} />
      <path d="M107 84 L107 81 C107 79 109 78 109 78 C109 78 111 79 111 81 L111 84" fill="none" stroke={B} strokeWidth={0.6} opacity={0.3} />

      <Laptop x={140} y={25} w={160} h={130} />
      {/* Laptop — received, encrypted */}
      <STHeader x={147} y={35} w={146} connected />
      <MessageBubble x={155} y={55} w={50} h={14} text="Secret note" />

      {/* "No cloud" indicator — crossed-out cloud */}
      <path d="M220 100 C214 100 212 96 215 93 C213 89 218 86 223 87 C226 84 232 85 233 89 C237 89 239 93 236 96 C239 99 237 103 233 103 L220 100Z" fill="none" stroke={K_M} strokeWidth={0.6} opacity={0.15} />
      <line x1={216} y1={90} x2={237} y2={102} stroke={K_M} strokeWidth={0.8} opacity={0.2} />

      <text x={226} y={115} textAnchor="middle" fill={K_M} fontSize={2.5} fontWeight={500} opacity={0.3}>No cloud. Direct.</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legacy exports — keeping for backward compatibility
// ---------------------------------------------------------------------------

export function IllustOpen({ className }: { className?: string }) {
  return <IllustPhoneToLaptop className={className} />;
}

export function IllustPair({ className }: { className?: string }) {
  return <IllustPairing className={className} />;
}

export function IllustSend({ className }: { className?: string }) {
  return <IllustTextHandoff className={className} />;
}

export function IllustCrossPlatform({ className }: { className?: string }) {
  return <IllustPhoneToLaptop className={className} />;
}

export function IllustFast({ className }: { className?: string }) {
  return <IllustReceiving className={className} />;
}

export function IllustPrivacy({ className }: { className?: string }) {
  return <IllustPrivate className={className} />;
}

export function IllustEncrypted({ className }: { className?: string }) {
  return <IllustPrivate className={className} />;
}

export function IllustTemporary({ className }: { className?: string }) {
  return <IllustPrivate className={className} />;
}

export function IllustNoStorage({ className }: { className?: string }) {
  return <IllustPrivate className={className} />;
}

export function IllustWaiting({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Waiting">
      <Phone x={10} y={10} w={36} h={80} />
      <Laptop x={56} y={14} w={54} h={44} />
      <line x1="46" y1="50" x2="56" y2="48" stroke={B} strokeWidth={0.6} strokeDasharray="2 2" opacity={0.15} />
    </svg>
  );
}

export function IllustError({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" fill="none" className={cn('w-20 h-16', className)} role="img" aria-label="Error">
      <Phone x={10} y={14} w={36} h={72} />
      <Laptop x={56} y={18} w={54} h={42} />
      <line x1="46" y1="50" x2="56" y2="46" stroke="#E53E3E" strokeWidth={0.6} strokeDasharray="2 2" opacity={0.2} />
      <circle cx={51} cy={48} r={4} fill="none" stroke="#E53E3E" strokeWidth={0.6} opacity={0.25} />
      <line x1={51} y1={46} x2={51} y2={49} stroke="#E53E3E" strokeWidth={0.8} strokeLinecap="round" />
      <circle cx={51} cy={50.5} r={0.5} fill="#E53E3E" opacity={0.25} />
    </svg>
  );
}

export function Illust404({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" fill="none" className={cn('w-32 h-24', className)} role="img" aria-label="Page not found">
      <text x="80" y="65" textAnchor="middle" fill={K} fontSize="40" fontWeight="600" opacity={0.08}>?</text>
      <text x="80" y="106" textAnchor="middle" fill={K} fontSize="12" fontWeight="600" opacity={0.06}>404</text>
    </svg>
  );
}

export function IllustNoApp({ className }: { className?: string }) {
  return <IllustPhoneToLaptop className={className} />;
}

export function IllustFileTypes({ className }: { className?: string }) {
  return <IllustReceiving className={className} />;
}

export function IllustTroubleshoot({ className }: { className?: string }) {
  return <IllustError className={className} />;
}
