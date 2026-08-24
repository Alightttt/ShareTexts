import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// ShareText Illustration System v3 — Clean Editorial
// ---------------------------------------------------------------------------
// Fewer elements. Cleaner geometry. One idea per illustration.
// Premium dimensional, but restrained — like an Apple product page diagram.
//
// Used in "How It Works" section only:
//   IllustTransfer — photo moves from phone to laptop
//   IllustConnect  — two devices pairing with a 6-digit code
//   IllustTextMove — text messages flowing between devices
// ---------------------------------------------------------------------------

// ── Palette ──
const B    = '#0A66F0';  // Brand blue
const K    = '#1D1D1F';  // Ink
const K_M  = '#6E6E73';  // Ink muted
const G    = '#34C759';  // Green success
const W    = '#FFFFFF';
const SCR  = '#080C18';  // Screen dark
const SCR2 = '#0F1628';  // Screen lighter

// ── Shared defs ──
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
    <radialGradient id="glow-b" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stopColor={B} stopOpacity="0.12" />
      <stop offset="100%" stopColor={B} stopOpacity="0" />
    </radialGradient>
  </defs>
);

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE PRIMITIVES — consistent across all illustrations
// ═══════════════════════════════════════════════════════════════════════════

function Phone({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const r = w * 0.18;
  const bezel = w * 0.06;
  return (
    <g filter="url(#sh-md)">
      <defs>
        <linearGradient id={`ph-s-${x}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F0F0F2" />
          <stop offset="100%" stopColor="#DCDCE0" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={`url(#ph-s-${x})`} stroke="#E5E5EA" strokeWidth={0.6} />
      <rect x={x + bezel} y={y + h * 0.035} width={w - bezel * 2} height={h * 0.93} rx={r * 0.6} fill={SCR} />
      <rect x={x + (w - w * 0.28) / 2} y={y + h * 0.02} width={w * 0.28} height={h * 0.016} rx={h * 0.008} fill="#000" opacity={0.6} />
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
      <defs>
        <linearGradient id={`lp-s-${x}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8E8EC" />
          <stop offset="100%" stopColor="#D0D0D4" />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={w} height={screenH} rx={r} fill={`url(#lp-s-${x})`} stroke="#E5E5EA" strokeWidth={0.6} />
      <rect x={x + bezel} y={y + screenH * 0.06} width={w - bezel * 2} height={screenH - screenH * 0.1} rx={r * 0.4} fill={SCR} />
      <rect x={x + bezel} y={y + screenH * 0.06} width={w - bezel * 2} height={screenH - screenH * 0.1} rx={r * 0.4} fill="url(#glow-b)" />
      <circle cx={x + w / 2} cy={y + screenH * 0.025} r={w * 0.006} fill={K} opacity={0.15} />
      <rect x={x + w * 0.15} y={y + screenH - 1} width={w * 0.7} height={1.2} rx={0.6} fill="#C0C0C4" opacity={0.5} />
      <rect x={x - w * 0.03} y={y + screenH + 1} width={w * 1.06} height={deckH - 1} rx={r * 0.6} fill="#D0D0D4" stroke="#E5E5EA" strokeWidth={0.4} />
      <rect x={x + w * 0.08} y={y + screenH + deckH * 0.25} width={w * 0.84} height={deckH * 0.35} rx={1.2} fill={K} opacity={0.025} />
      <rect x={x + w * 0.36} y={y + screenH + deckH * 0.65} width={w * 0.28} height={deckH * 0.25} rx={1.2} fill={K} opacity={0.015} stroke={K} strokeWidth={0.25} strokeOpacity={0.05} />
    </g>
  );
}

// ── UI elements ──

function STBar({ x, y, w, connected }: { x: number; y: number; w: number; connected?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={7} fill={SCR2} rx={0} />
      <rect x={x + 3} y={y + 2} width={2} height={2} rx={1} fill={B} opacity={0.6} />
      <text x={x + 6.5} y={y + 4.5} fill="#fff" fontSize={2.2} fontWeight={600} opacity={0.45} fontFamily="system-ui">ShareText</text>
      {connected && (
        <g>
          <circle cx={x + w - 5.5} cy={y + 3.5} r={1} fill={G} opacity={0.7} />
          <text x={x + w - 4} y={y + 4.5} fill={G} fontSize={1.8} fontWeight={600} opacity={0.45} fontFamily="system-ui">Connected</text>
        </g>
      )}
    </g>
  );
}

function PhotoThumb({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2.5} fill={SCR2} stroke="#fff" strokeOpacity={0.06} strokeWidth={0.3} />
      <rect x={x + 0.8} y={y + 0.8} width={w - 1.6} height={h - 6} rx={1.5} fill="#1a2840" />
      <rect x={x + 0.8} y={y + 0.8} width={w - 1.6} height={(h - 6) * 0.45} rx={1.5} fill="#1e3458" />
      <path d={`M${x+0.8} ${y+0.8+(h-6)*0.65} L${x+w*0.25} ${y+0.8+(h-6)*0.3} L${x+w*0.45} ${y+0.8+(h-6)*0.5} L${x+w*0.65} ${y+0.8+(h-6)*0.25} L${x+w-0.8} ${y+0.8+(h-6)*0.55} L${x+w-0.8} ${y+0.8+(h-6)*0.65} Z`} fill="#162035" opacity={0.5} />
      <circle cx={x + w * 0.7} cy={y + 0.8 + (h - 6) * 0.2} r={2} fill="#F0A030" opacity={0.35} />
      <rect x={x + 0.8} y={y + 0.8 + (h - 6) * 0.65} width={w - 1.6} height={(h - 6) * 0.35} fill="#1a2540" />
      <text x={x + 2} y={y + h - 1.5} fill="#fff" fontSize={2} fontWeight={600} opacity={0.45} fontFamily="system-ui">holiday.jpg</text>
      <text x={x + w - 2} y={y + h - 1.5} textAnchor="end" fill="#fff" fontSize={1.6} opacity={0.3} fontFamily="system-ui">4.2 MB</text>
    </g>
  );
}

function TextBubble({ x, y, w, h, sent }: { x: number; y: number; w: number; h: number; sent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2.5}
        fill={sent ? B : SCR2}
        opacity={sent ? 0.75 : 0.55}
        stroke={sent ? 'none' : '#fff'}
        strokeOpacity={sent ? 0 : 0.05}
        strokeWidth={0.3}
      />
      <rect x={x + 1.5} y={y + h * 0.3} width={w * 0.55} height={1.2} rx={0.6} fill="#fff" opacity={sent ? 0.3 : 0.12} />
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
  const my = (y1 + y2) / 2 - 12;
  return (
    <g>
      <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
        fill="none" stroke={B} strokeWidth={0.7} strokeDasharray="2.5 1.8" opacity={0.18} />
      <circle cx={x2} cy={y2} r={1.8} fill={B} opacity={0.22} />
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3 CORE ILLUSTRATIONS (only what the landing page uses)
// ═══════════════════════════════════════════════════════════════════════════

/** 1. TRANSFER — photo moving from phone to laptop */
export function IllustTransfer({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="A photo transfers from phone to laptop">
      <ShadowDefs />
      <Phone x={20} y={14} w={60} h={162} />
      <STBar x={26} y={26} w={48} connected />
      <PhotoThumb x={28} y={42} w={44} h={36} />
      {/* Mid-flight photo */}
      <g filter="url(#sh-sm)">
        <rect x={100} y={48} width={32} height={24} rx={3.5} fill={W} stroke="#E5E5EA" strokeWidth={0.4} />
        <rect x={101} y={49} width={30} height={14} rx={2} fill="#1a2840" />
        <rect x={101} y={49} width={30} height={6} rx={2} fill="#1e3458" />
        <circle cx={126} cy={53} r={1.8} fill="#F0A030" opacity={0.35} />
        <text x={103} y={69} fill={K} fontSize={1.8} fontWeight={600} opacity={0.45}>holiday.jpg</text>
      </g>
      <TransferArc x1={82} y1={60} x2={130} y2={65} />
      <Laptop x={148} y={20} w={168} h={150} />
      <STBar x={155} y={32} w={154} connected />
      <PhotoThumb x={158} y={48} w={148} h={50} />
      <CheckMark x={288} y={52} r={5} />
      <text x={226} y={118} textAnchor="middle" fill={G} fontSize={2.8} fontWeight={600} opacity={0.5} fontFamily="system-ui">✓ Received</text>
    </svg>
  );
}

/** 2. CONNECT — two devices pairing with a 6-digit code */
export function IllustConnect({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="Two devices pairing with a code">
      <ShadowDefs />
      <Phone x={20} y={14} w={60} h={162} />
      <STBar x={26} y={26} w={48} />
      <text x={50} y={46} textAnchor="middle" fill="#fff" fontSize={2.5} fontWeight={600} opacity={0.3} fontFamily="system-ui">Enter code</text>
      {['8','1','7','1','1','9'].map((d, i) => {
        const dx = 28 + i * 7.5 + (i >= 3 ? 3 : 0);
        return (
          <g key={i}>
            <rect x={dx} y={50} width={6} height={8.5} rx={1.8} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.3} />
            <text x={dx + 3} y={56} textAnchor="middle" fill="#fff" fontSize={4.5} fontWeight={700} fontFamily="monospace" opacity={0.55}>{d}</text>
          </g>
        );
      })}
      <circle cx={50} cy={72} r={2.5} fill={B} opacity={0.1} />
      <circle cx={50} cy={72} r={1.2} fill={B} opacity={0.3} />
      <TransferArc x1={82} y1={68} x2={130} y2={63} />
      <Laptop x={148} y={20} w={168} h={150} />
      <STBar x={155} y={32} w={154} />
      <text x={228} y={48} textAnchor="middle" fill="#fff" fontSize={2.8} fontWeight={600} opacity={0.3} fontFamily="system-ui">Share this code</text>
      {['8','1','7','1','1','9'].map((d, i) => {
        const dx = 162 + i * 15 + (i >= 3 ? 5 : 0);
        return (
          <g key={`l-${i}`}>
            <rect x={dx} y={54} width={11} height={15} rx={2.5} fill={SCR2} stroke="#fff" strokeOpacity={0.08} strokeWidth={0.3} />
            <text x={dx + 5.5} y={64} textAnchor="middle" fill="#fff" fontSize={8} fontWeight={700} fontFamily="monospace" opacity={0.55}>{d}</text>
          </g>
        );
      })}
      <text x={228} y={82} textAnchor="middle" fill="#fff" fontSize={2.2} fontWeight={500} opacity={0.2} fontFamily="system-ui">Code active · 58s</text>
    </svg>
  );
}

/** 3. TEXT MOVE — text flowing from phone to laptop */
export function IllustTextMove({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 190" fill="none" className={cn('w-full', className)}
      role="img" aria-label="Text moving from phone to laptop">
      <ShadowDefs />
      <Phone x={20} y={14} w={60} h={162} />
      <STBar x={26} y={26} w={48} connected />
      <TextBubble x={42} y={44} w={30} h={9} sent />
      <TextBubble x={30} y={57} w={40} h={9} sent />
      <TextBubble x={38} y={70} w={32} h={9} sent />
      <TransferArc x1={82} y1={62} x2={148} y2={62} />
      <Laptop x={148} y={20} w={168} h={150} />
      <STBar x={155} y={32} w={154} connected />
      <TextBubble x={160} y={48} w={50} h={9} />
      <TextBubble x={160} y={61} w={60} h={9} />
      <TextBubble x={160} y={74} w={45} h={9} />
      <CheckMark x={288} y={52} r={5} />
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
export const IllustReceiving = IllustTransfer;
export const IllustComplete = IllustTransfer;
export const IllustOpen = IllustTransfer;
export const IllustPair = IllustConnect;
export const IllustSend = IllustTextMove;
export const IllustCrossPlatform = IllustTransfer;
export const IllustFast = IllustTransfer;
export const IllustPrivacy = IllustTransfer;
export const IllustEncrypted = IllustTransfer;
export const IllustTemporary = IllustTransfer;
export const IllustNoStorage = IllustTransfer;
export const IllustNoApp = IllustTransfer;
export const IllustFileTypes = IllustTransfer;
export const IllustWaiting = IllustTransfer;
export const IllustTroubleshoot = IllustTransfer;
export const Illust404 = IllustTransfer;
export const IllustReceive = IllustTransfer;
