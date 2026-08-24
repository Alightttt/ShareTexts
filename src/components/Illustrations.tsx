import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// ShareText Illustration System v2 — Premium Dimensional
// ---------------------------------------------------------------------------
// Visual language:
// - Consistent device proportions matching HeroDemo
// - Brand blue (#0A66F0) for actions, dark navy (#080C18) for screens
// - 2-3 depth layers per scene with subtle shadows
// - Each illustration tells ONE idea clearly
// - Editorial quality, not cartoon or decorative
// ---------------------------------------------------------------------------

// ── Palette ──
const B    = '#0A66F0';  // Brand blue
const B_S  = '#0B55C9';  // Brand strong
const B_L  = '#E8F0FE';  // Brand light (screen bg in light mode)
const K    = '#1D1D1F';  // Ink
const K_M  = '#6E6E73';  // Ink muted
const G    = '#34C759';  // Green success
const W    = '#FFFFFF';  // White
const SCR  = '#080C18';  // Screen dark
const SCR2 = '#0F1628';  // Screen lighter
const BG_D = '#E5E5EA';  // Light border
const GRAY = '#F5F5F7';  // Light bg

// ── Shared defs for shadows ──
const ShadowDefs = () => (
  <defs>
    <filter id="sh-sm" x="-10%" y="-5%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.08" />
    </filter>
    <filter id="sh-md" x="-10%" y="-5%" width="130%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.10" />
    </filter>
    <filter id="sh-lg" x="-15%" y="-5%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.12" />
    </filter>
    {/* Screen glow — blue radial */}
    <radialGradient id="glow-b" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stopColor={B} stopOpacity="0.12" />
      <stop offset="100%" stopColor={B} stopOpacity="0" />
    </radialGradient>
    {/* Gradient for transfer arc */}
    <linearGradient id="arc-g" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stopColor={B} stopOpacity="0.05" />
      <stop offset="50%" stopColor={B} stopOpacity="0.2" />
      <stop offset="100%" stopColor={B} stopOpacity="0.05" />
    </linearGradient>
  </defs>
);

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE PRIMITIVES — consistent across all illustrations
// ═══════════════════════════════════════════════════════════════════════════

function Phone({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const r = w * 0.18;
  const bezel = w * 0.06;
  const notchW = w * 0.28;
  const notchH = h * 0.016;
  return (
    <g filter="url(#sh-md)">
      {/* Shell — slight gradient for dimension */}
      <defs>
        <linearGradient id={`ph-shell-${x}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F0F0F2" />
          <stop offset="100%" stopColor="#DCDCE0" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#ph-shell-${x})`} stroke={BG_D} strokeWidth={0.8} />
      {/* Screen */}
      <rect x={x + bezel} y={y + h * 0.035} width={w - bezel * 2} height={h * 0.93} rx={r * 0.6} fill={SCR} />
      {/* Dynamic island */}
      <rect x={x + (w - notchW) / 2} y={y + h * 0.02} width={notchW} height={notchH} rx={notchH / 2} fill="#000" opacity={0.6} />
      {/* Screen glow */}
      <rect x={x + bezel} y={y + h * 0.035} width={w - bezel * 2} height={h * 0.93} rx={r * 0.6} fill="url(#glow-b)" />
    </g>
  );
}

function Laptop({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const screenH = h * 0.7;
  const deckH = h - screenH;
  const bezel = w * 0.035;
  const r = w * 0.022;
  return (
    <g filter="url(#sh-lg)">
      {/* Screen lid */}
      <defs>
        <linearGradient id={`lp-shell-${x}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8E8EC" />
          <stop offset="100%" stopColor="#D0D0D4" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={screenH} rx={r} fill={`url(#lp-shell-${x})`} stroke={BG_D} strokeWidth={0.8} />
      {/* Screen */}
      <rect x={x + bezel} y={y + screenH * 0.06} width={w - bezel * 2} height={screenH - screenH * 0.1} rx={r * 0.4} fill={SCR} />
      {/* Screen glow */}
      <rect x={x + bezel} y={y + screenH * 0.06} width={w - bezel * 2} height={screenH - screenH * 0.1} rx={r * 0.4} fill="url(#glow-b)" />
      {/* Camera */}
      <circle cx={x + w / 2} cy={y + screenH * 0.025} r={w * 0.006} fill={K} opacity={0.15} />
      {/* Hinge */}
      <rect x={x + w * 0.15} y={y + screenH - 1} width={w * 0.7} height={1.5} rx={0.75} fill="#C0C0C4" opacity={0.6} />
      {/* Deck */}
      <defs>
        <linearGradient id={`lp-deck-${x}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E0E0E4" />
          <stop offset="100%" stopColor="#D0D0D4" />
        </linearGradient>
      </defs>
      <rect x={x - w * 0.03} y={y + screenH + 1} width={w * 1.06} height={deckH - 1} rx={r * 0.6} fill={`url(#lp-deck-${x})`} stroke={BG_D} strokeWidth={0.5} />
      {/* Keyboard hint */}
      <rect x={x + w * 0.08} y={y + screenH + deckH * 0.25} width={w * 0.84} height={deckH * 0.35} rx={1.5} fill={K} opacity={0.03} />
      {/* Trackpad */}
      <rect x={x + w * 0.36} y={y + screenH + deckH * 0.65} width={w * 0.28} height={deckH * 0.25} rx={1.5} fill={K} opacity={0.02} stroke={K} strokeWidth={0.3} strokeOpacity={0.06} />
    </g>
  );
}

// ── UI elements inside screens ──

function STBar({ x, y, w, connected }: { x: number; y: number; w: number; connected?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={8} fill={SCR2} rx={0} />
      <rect x={x + 3} y={y + 2} width={2.5} height={2.5} rx={1.25} fill={B} opacity={0.6} />
      <text x={x + 7} y={y + 4.8} fill="#fff" fontSize={2.5} fontWeight={600} opacity={0.5} fontFamily="system-ui">ShareText</text>
      {connected && (
        <g>
          <circle cx={x + w - 6} cy={y + 4} r={1.2} fill={G} opacity={0.7} />
          <text x={x + w - 4} y={y + 5} fill={G} fontSize={2} fontWeight={600} opacity={0.5} fontFamily="system-ui">Connected</text>
        </g>
      )}
    </g>
  );
}

function PhotoThumb({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.4} />
      {/* Landscape scene */}
      <rect x={x + 1} y={y + 1} width={w - 2} height={h - 7} rx={2} fill="#1a2840" />
      {/* Sky gradient */}
      <rect x={x + 1} y={y + 1} width={w - 2} height={(h - 7) * 0.45} rx={2} fill="#1e3458" />
      {/* Mountains */}
      <path d={`M${x+1} ${y+1+(h-7)*0.65} L${x+w*0.25} ${y+1+(h-7)*0.3} L${x+w*0.45} ${y+1+(h-7)*0.5} L${x+w*0.65} ${y+1+(h-7)*0.25} L${x+w-1} ${y+1+(h-7)*0.55} L${x+w-1} ${y+1+(h-7)*0.65} Z`} fill="#162035" opacity={0.6} />
      {/* Sun */}
      <circle cx={x + w * 0.7} cy={y + 1 + (h - 7) * 0.2} r={2.5} fill="#F0A030" opacity={0.4} />
      {/* Ground */}
      <rect x={x + 1} y={y + 1 + (h - 7) * 0.65} width={w - 2} height={(h - 7) * 0.35} fill="#1a2540" rx={0} />
      {/* Label */}
      <text x={x + 2.5} y={y + h - 2} fill="#fff" fontSize={2.2} fontWeight={600} opacity={0.5} fontFamily="system-ui">holiday.jpg</text>
      <text x={x + w - 2.5} y={y + h - 2} textAnchor="end" fill="#fff" fontSize={1.8} opacity={0.3} fontFamily="system-ui">4.2 MB</text>
    </g>
  );
}

function TextBubble({ x, y, w, h, sent }: { x: number; y: number; w: number; h: number; sent?: boolean }) {
  return (
    <rect x={x} y={y} width={w} height={h} rx={3}
      fill={sent ? B : SCR2}
      opacity={sent ? 0.8 : 0.6}
      stroke={sent ? 'none' : '#fff'}
      strokeOpacity={sent ? 0 : 0.06}
      strokeWidth={0.3}
    />
  );
}

function FileIcon({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size * 1.2} rx={2} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.3} />
      <text x={x + size / 2} y={y + size * 0.75} textAnchor="middle" fill={B} fontSize={size * 0.35} fontWeight={700} opacity={0.5} fontFamily="system-ui">PDF</text>
    </g>
  );
}

function CheckMark({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={G} opacity={0.15} />
      <path d={`M${x - r * 0.35} ${y} L${x - r * 0.05} ${y + r * 0.3} L${x + r * 0.4} ${y - r * 0.25}`}
        stroke={G} strokeWidth={r * 0.14} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
}

function TransferArc({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 15;
  return (
    <g>
      <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
        fill="none" stroke={B} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.2} />
      {/* Arrow head */}
      <circle cx={x2} cy={y2} r={2} fill={B} opacity={0.25} />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 CORE ILLUSTRATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 1. TRANSFER — A photo moving from phone to laptop.
 *    THE core product story. Photo exists on phone, arrives on laptop.
 */
export function IllustTransfer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="A photo transfers from phone to laptop">
      <ShadowDefs />

      {/* Phone — left side, slightly forward (larger) */}
      <Phone x={16} y={14} w={66} h={162} />
      <STBar x={22} y={26} w={54} connected />
      {/* Photo on phone — ready to send */}
      <PhotoThumb x={24} y={42} w={50} h={40} />
      {/* Send button */}
      <circle cx={68} cy={152} r={5} fill={B} opacity={0.8} />
      <text x={68} y={153.5} textAnchor="middle" fill="#fff" fontSize={4} fontWeight={700}>↑</text>

      {/* Transfer arc — photo journey */}
      <TransferArc x1={84} y1={62} x2={140} y2={68} />

      {/* Mid-flight photo — the actual content traveling */}
      <g filter="url(#sh-sm)">
        <rect x={100} y={46} width={36} height={28} rx={4} fill={W} stroke={BG_D} strokeWidth={0.4} />
        <rect x={101} y={47} width={34} height={18} rx={2} fill="#1a2840" />
        <rect x={101} y={47} width={34} height={8} rx={2} fill="#1e3458" />
        <circle cx={128} cy={51} r={2} fill="#F0A030" opacity={0.4} />
        <text x={103} y={72} fill={K} fontSize={2} fontWeight={600} opacity={0.5}>holiday.jpg</text>
      </g>

      {/* Laptop — right side, slightly back */}
      <Laptop x={142} y={20} w={176} h={150} />
      <STBar x={150} y={32} w={160} connected />
      {/* Photo arriving on laptop */}
      <PhotoThumb x={155} y={48} w={150} h={55} />
      {/* Success */}
      <CheckMark x={294} y={52} r={6} />
      <text x={230} y={118} textAnchor="middle" fill={G} fontSize={3} fontWeight={600} opacity={0.5} fontFamily="system-ui">✓ Received</text>
    </svg>
  );
}

/**
 * 2. CONNECT — Two devices pairing with a 6-digit code.
 *    The moment of connection.
 */
export function IllustConnect({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="Two devices pairing with a code">
      <ShadowDefs />

      {/* Phone — entering the code */}
      <Phone x={16} y={14} w={66} h={162} />
      <STBar x={22} y={26} w={54} />
      {/* "Enter code" label */}
      <text x={49} y={46} textAnchor="middle" fill="#fff" fontSize={2.8} fontWeight={600} opacity={0.35} fontFamily="system-ui">Enter code</text>
      {/* Code digits */}
      {['8','1','7','1','1','9'].map((d, i) => {
        const dx = 24 + i * 8 + (i >= 3 ? 4 : 0);
        return (
          <g key={i}>
            <rect x={dx} y={50} width={6.5} height={9} rx={2} fill={SCR2} stroke="#fff" strokeOpacity={0.1} strokeWidth={0.4} />
            <text x={dx + 3.25} y={56.5} textAnchor="middle" fill="#fff" fontSize={5} fontWeight={700} fontFamily="monospace" opacity={0.6}>{d}</text>
          </g>
        );
      })}
      {/* Connecting indicator */}
      <circle cx={49} cy={74} r={3} fill={B} opacity={0.12} />
      <circle cx={49} cy={74} r={1.5} fill={B} opacity={0.35} />

      {/* Connection line — dashed arc */}
      <TransferArc x1={84} y1={70} x2={142} y2={65} />

      {/* Laptop — showing the code to share */}
      <Laptop x={142} y={20} w={176} h={150} />
      <STBar x={150} y={32} w={160} />
      <text x={230} y={50} textAnchor="middle" fill="#fff" fontSize={3} fontWeight={600} opacity={0.35} fontFamily="system-ui">Share this code</text>
      {/* Larger code display on laptop */}
      {['8','1','7','1','1','9'].map((d, i) => {
        const dx = 168 + i * 16 + (i >= 3 ? 6 : 0);
        return (
          <g key={`l-${i}`}>
            <rect x={dx} y={54} width={12} height={16} rx={3} fill={SCR2} stroke="#fff" strokeOpacity={0.1} strokeWidth={0.4} />
            <text x={dx + 6} y={65} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={700} fontFamily="monospace" opacity={0.6}>{d}</text>
          </g>
        );
      })}
      <text x={230} y={85} textAnchor="middle" fill="#fff" fontSize={2.5} fontWeight={500} opacity={0.25} fontFamily="system-ui">Code active · 58s</text>
    </svg>
  );
}

/**
 * 3. TEXT MOVE — Text flowing from phone to laptop.
 *    Quick handoff of messages/notes.
 */
export function IllustTextMove({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="Text moving from phone to laptop">
      <ShadowDefs />

      {/* Phone — sent messages */}
      <Phone x={16} y={14} w={66} h={162} />
      <STBar x={22} y={26} w={54} connected />
      {/* Sent text bubbles */}
      <TextBubble x={40} y={44} w={34} h={10} sent />
      <rect x={43} y={47} width={20} height={1.5} rx={0.75} fill="#fff" opacity={0.3} />
      <TextBubble x={28} y={58} w={44} h={10} sent />
      <rect x={31} y={61} width={28} height={1.5} rx={0.75} fill="#fff" opacity={0.3} />
      <TextBubble x={36} y={72} w={36} h={10} sent />
      <rect x={39} y={75} width={22} height={1.5} rx={0.75} fill="#fff" opacity={0.3} />

      {/* Transfer arc */}
      <TransferArc x1={84} y1={65} x2={142} y2={65} />

      {/* Laptop — received messages */}
      <Laptop x={142} y={20} w={176} h={150} />
      <STBar x={150} y={32} w={160} connected />
      {/* Received text bubbles — appearing */}
      <TextBubble x={158} y={48} w={55} h={10} />
      <rect x={161} y={51} width={35} height={1.5} rx={0.75} fill="#fff" opacity={0.15} />
      <TextBubble x={158} y={62} w={65} h={10} />
      <rect x={161} y={65} width={42} height={1.5} rx={0.75} fill="#fff" opacity={0.15} />
      <TextBubble x={158} y={76} w={50} h={10} />
      <rect x={161} y={79} width={30} height={1.5} rx={0.75} fill="#fff" opacity={0.15} />
      <CheckMark x={294} y={52} r={5} />
    </svg>
  );
}

/**
 * 4. RECEIVE — A file arriving with progress.
 *    The receiving experience — progress, then arrival.
 */
export function IllustReceive({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="File arriving on the second device">
      <ShadowDefs />

      {/* Phone — file sent */}
      <Phone x={16} y={14} w={66} h={162} />
      <STBar x={22} y={26} w={54} connected />
      {/* File card on phone */}
      <g>
        <rect x={24} y={42} w={50} h={20} rx={3} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.3} />
        <FileIcon x={27} y={45} size={6} />
        <text x={36} y={50} fill="#fff" fontSize={2.5} fontWeight={600} opacity={0.5} fontFamily="system-ui">report.pdf</text>
        <text x={36} y={55} fill="#fff" fontSize={2} opacity={0.3} fontFamily="system-ui">2.8 MB</text>
      </g>
      <text x={49} y={80} textAnchor="middle" fill={G} fontSize={2.8} fontWeight={600} opacity={0.5} fontFamily="system-ui">Sent ✓</text>

      {/* Transfer arc */}
      <TransferArc x1={84} y1={55} x2={142} y2={60} />

      {/* Laptop — receiving with progress */}
      <Laptop x={142} y={20} w={176} h={150} />
      <STBar x={150} y={32} w={160} connected />
      {/* Progress bar */}
      <rect x={158} y={48} width={146} height={3} rx={1.5} fill="#fff" opacity={0.06} />
      <rect x={158} y={48} width={98} height={3} rx={1.5} fill={B} opacity={0.5} />
      <text x={230} y={58} textAnchor="middle" fill="#fff" fontSize={2.5} fontWeight={500} opacity={0.35} fontFamily="system-ui">Receiving… 67%</text>
      {/* File card appearing */}
      <g>
        <rect x={158} y={66} width={146} height={22} rx={3} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.3} />
        <FileIcon x={162} y={70} size={8} />
        <text x={174} y={76} fill="#fff" fontSize={2.8} fontWeight={600} opacity={0.5} fontFamily="system-ui">report.pdf</text>
        <text x={174} y={82} fill="#fff" fontSize={2.2} opacity={0.3} fontFamily="system-ui">2.8 MB</text>
      </g>
    </svg>
  );
}

/**
 * 5. PRIVATE — Direct connection, no cloud.
 *    The trust story — direct device-to-device, nothing stored.
 */
export function IllustPrivate({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="Private direct transfer — no cloud storage">
      <ShadowDefs />

      {/* Phone — sending */}
      <Phone x={16} y={14} w={66} h={162} />
      <STBar x={22} y={26} w={54} connected />
      <TextBubble x={34} y={44} w={38} h={10} sent />
      <rect x={37} y={47} width={24} height={1.5} rx={0.75} fill="#fff" opacity={0.3} />

      {/* Direct connection line — solid, with lock */}
      <line x1={84} y1={65} x2={142} y2={65} stroke={B} strokeWidth={1} opacity={0.15} />
      {/* Lock icon on connection */}
      <rect x={107} y={58} width={8} height={7} rx={1.5} fill={B} opacity={0.12} />
      <path d="M109 58 L109 55.5 C109 53.5 113 53.5 113 55.5 L113 58" fill="none" stroke={B} strokeWidth={0.8} opacity={0.25} strokeLinecap="round" />

      {/* Laptop — received */}
      <Laptop x={142} y={20} w={176} h={150} />
      <STBar x={150} y={32} w={160} connected />
      <TextBubble x={158} y={48} w={55} h={10} />
      <rect x={161} y={51} width={35} height={1.5} rx={0.75} fill="#fff" opacity={0.15} />

      {/* "No cloud" — crossed-out cloud */}
      <g opacity={0.2}>
        <path d="M225 96 C220 96 218 92 221 89 C219 85 224 82 228 83 C231 80 237 81 238 85 C242 85 244 89 241 92 C244 95 242 99 238 99 L225 96Z"
          fill="none" stroke={K_M} strokeWidth={0.7} />
        <line x1={220} y1={86} x2={242} y2={98} stroke={K_M} strokeWidth={0.8} strokeLinecap="round" />
      </g>
      <text x={230} y={112} textAnchor="middle" fill={K_M} fontSize={2.5} fontWeight={500} opacity={0.3} fontFamily="system-ui">No cloud. Direct.</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legacy aliases — backward compatibility
// ---------------------------------------------------------------------------
export const IllustPhoneToLaptop = IllustTransfer;
export const IllustLaptopToPhone = IllustTransfer;
export const IllustPairing = IllustConnect;
export const IllustQR = IllustConnect;
export const IllustTextHandoff = IllustTextMove;
export const IllustReceiving = IllustReceive;
export const IllustComplete = IllustReceive;
export const IllustOpen = IllustTransfer;
export const IllustPair = IllustConnect;
export const IllustSend = IllustTextMove;
export const IllustCrossPlatform = IllustTransfer;
export const IllustFast = IllustReceive;
export const IllustPrivacy = IllustPrivate;
export const IllustEncrypted = IllustPrivate;
export const IllustTemporary = IllustPrivate;
export const IllustNoStorage = IllustPrivate;
export const IllustNoApp = IllustTransfer;
export const IllustFileTypes = IllustReceive;
export const IllustWaiting = IllustTransfer;
export const IllustTroubleshoot = IllustTransfer;
export const Illust404 = IllustTransfer;
