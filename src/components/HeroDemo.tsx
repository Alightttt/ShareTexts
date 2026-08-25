import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from 'motion/react';
import { Send, Download, Copy, Lock } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { DemoPhoto } from './DemoPhoto';
import { FileTypeIcon } from './FileTypeIcon';
import { cn } from '../lib/utils';

// ─── Reduced motion hook ───
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

// ─── Mouse tracking with damping (Apple Design §3 — interruptible springs) ───
function useMouseDamped() {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const smx = useSpring(mx, { stiffness: 40, damping: 20 });
  const smy = useSpring(my, { stiffness: 40, damping: 20 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      mx.set(nx);
      my.set(ny);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [mx, my]);

  return { mx: smx, my: smy };
}

// ─── Transfer item types ───
type Kind = 'text' | 'photo' | 'video' | 'file';

interface TransferItem {
  kind: Kind;
  text?: string;
  name?: string;
  size?: string;
  duration?: string;
}

const TRANSFER_ITEMS: Record<Kind, TransferItem> = {
  text:  { kind: 'text',  text: 'Meeting tomorrow at 4 PM' },
  photo: { kind: 'photo', name: 'holiday.jpg',  size: '4.2 MB' },
  video: { kind: 'video', name: 'holiday-clip.mp4',   size: '18.3 MB', duration: '00:18' },
  file:  { kind: 'file',  name: 'presentation.pdf',   size: '2.8 MB' },
};

const SCENE_ORDER: Kind[] = ['photo', 'text', 'file'];
const nextKind = (k: Kind) => SCENE_ORDER[(SCENE_ORDER.indexOf(k) + 1) % SCENE_ORDER.length];

// ─── State machine ───
type SimState =
  | 'idle'
  | 'selecting'
  | 'sending'
  | 'transferring'
  | 'receiving'
  | 'complete'
  | 'resetting';

// ─── Timing (ms) — deliberate pacing ───
const T = {
  IDLE_HOLD:      1500,
  SELECT_HOLD:    600,
  SEND_HOLD:      400,
  TRANSFER_MS:    1000,
  RECEIVE_HOLD:   500,
  COMPLETE_HOLD:  1800,
  RESET_HOLD:     700,
};

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE FRAMES — realistic physical devices with depth
// ═══════════════════════════════════════════════════════════════════════════

function PhoneFrame({ children, className, glow }: { children: React.ReactNode; className?: string; glow?: number }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Contact shadow — sits on the surface */}
      <div className="absolute -bottom-[3%] left-[10%] right-[10%] h-[5%] bg-black/[0.12] dark:bg-black/[0.3] rounded-[50%] blur-[8px]" />
      {/* Physical shell — modern flat-edge design (iPhone 15+) */}
      <div className="relative rounded-[22px] sm:rounded-[26px] bg-gradient-to-b from-[#ececf0] via-[#e0e0e5] to-[#d4d4d9] dark:from-[#2c2c31] dark:via-[#27272c] dark:to-[#212126] shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_1px_3px_rgba(0,0,0,0.25),0_8px_24px_rgba(0,0,0,0.45)]">
        {/* Top edge highlight — light catches the bezel */}
        <div className="absolute inset-x-[14%] top-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 dark:via-white/10 to-transparent" />
        {/* Side button hint */}
        <div className="absolute right-0 top-[28%] w-[2px] h-[12%] rounded-r-sm bg-gradient-to-b from-[#c0c0c4] to-[#b0b0b4] dark:from-[#3a3a3e] dark:to-[#333336]" />
        {/* Screen */}
        <div className="relative rounded-[18px] sm:rounded-[22px] bg-[#080c18] dark:bg-[#0a0a0c] overflow-hidden aspect-[9/19.5] mx-[2.5%] mt-[1.5%] mb-[1.5%]">
          {/* Screen glass reflection */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.025] via-transparent to-transparent pointer-events-none z-20" />
          {/* Screen glow — emitted light from display */}
          {(glow ?? 0) > 0 && (
            <div className="absolute -inset-[20%] pointer-events-none z-0 opacity-[0.03]"
              style={{ background: `radial-gradient(ellipse at 50% 40%, rgba(10,102,240,${glow}) 0%, transparent 70%)` }} />
          )}
          {/* Dynamic island */}
          <div className="absolute top-[2.8%] left-1/2 -translate-x-1/2 w-[28%] h-[2%] min-h-[5px] bg-[#000] rounded-full z-10 ring-[0.5px] ring-black/20" />
          {/* Status bar */}
          <div className="absolute inset-x-0 top-[1.2%] z-10 flex items-center justify-between px-[5.5%] text-[clamp(4px,1.1vw,7px)] text-white/65">
            <span className="font-semibold tracking-tight">9:41</span>
            <div className="flex items-center gap-[0.3em]">
              <span className="flex items-end gap-[0.06em]">
                {[0.4, 0.6, 0.8, 1].map((h, i) => (
                  <span key={i} className="w-[0.11em] rounded-[0.02em] bg-current" style={{ height: `${h * 0.42}em` }} />
                ))}
              </span>
              <span className="relative flex items-center w-[0.95em] h-[0.42em] rounded-[0.12em] border-[0.045em] border-current/45 px-[0.05em]">
                <span className="h-[65%] w-[78%] rounded-[0.06em] bg-current" />
                <span className="absolute -right-[0.16em] w-[0.08em] h-[0.18em] rounded-r-[0.03em] bg-current/35" />
              </span>
            </div>
          </div>
          {/* Screen content */}
          <div className="relative w-full h-full z-[5]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LaptopFrame({ children, className, glow }: { children: React.ReactNode; className?: string; glow?: number }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Contact shadow */}
      <div className="absolute -bottom-[2%] left-[5%] right-[5%] h-[6%] bg-black/[0.08] dark:bg-black/[0.22] rounded-[50%] blur-[10px]" />

      {/* === SCREEN LID === */}
      <div className="relative rounded-t-[8px] sm:rounded-t-[10px] bg-gradient-to-b from-[#e8e8ec] via-[#dedee3] to-[#d4d4d9] dark:from-[#36363b] dark:via-[#303035] dark:to-[#2a2a2f] shadow-[0_1px_0_rgba(255,255,255,0.5)_inset,0_1px_3px_rgba(0,0,0,0.06),0_6px_18px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_0_rgba(255,255,255,0.07)_inset,0_1px_3px_rgba(0,0,0,0.18),0_6px_18px_rgba(0,0,0,0.35)]">
        {/* Top edge highlight */}
        <div className="absolute inset-x-[12%] top-0 h-[1px] bg-gradient-to-r from-transparent via-white/45 dark:via-white/8 to-transparent" />
        {/* Webcam cluster — three dots (camera + flanking sensors) */}
        <div className="absolute top-[3%] left-1/2 -translate-x-1/2 flex items-center gap-[3%]">
          <div className="w-[1.2%] aspect-square rounded-full bg-[#0d0d10] ring-[0.5px] ring-white/10" />
          <div className="w-[1.5%] aspect-square rounded-full bg-[#0a0a0e] ring-[0.3px] ring-white/8 flex items-center justify-center">
            <div className="w-[40%] h-[40%] rounded-full bg-[#1a3a5c]/30" />
          </div>
          <div className="w-[1.2%] aspect-square rounded-full bg-[#0d0d10] ring-[0.5px] ring-white/10" />
        </div>
        {/* Screen bezel — thin dark frame */}
        <div className="mx-[2%] mt-[6%] rounded-[4px] sm:rounded-[6px] bg-[#111115] p-[1%]">
          {/* Actual screen */}
          <div className="relative rounded-[2px] sm:rounded-[3px] bg-[#080c18] dark:bg-[#080a0e] overflow-hidden aspect-[16/10]">
            {/* Screen glass reflection — very subtle */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.015] via-transparent to-transparent pointer-events-none z-20" />
            {/* Screen glow */}
            {(glow ?? 0) > 0 && (
              <div className="absolute -inset-[20%] pointer-events-none z-0 opacity-[0.025]"
                style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(10,102,240,${glow}) 0%, transparent 60%)` }} />
            )}
            {children}
          </div>
        </div>
      </div>

      {/* === HINGE — thin metallic strip separating screen from deck === */}
      <div className="relative mx-[3%] h-[3px] bg-gradient-to-b from-[#c0c0c4] to-[#c8c8cc] dark:from-[#252528] dark:to-[#2c2c30] shadow-[0_1px_1px_rgba(0,0,0,0.04)]">
        <div className="absolute inset-x-[15%] top-0 h-[0.5px] bg-white/25 dark:bg-white/5" />
      </div>

      {/* === KEYBOARD DECK — real physical feel === */}
      <div className="relative rounded-b-[8px] sm:rounded-b-[10px] bg-gradient-to-b from-[#dddde2] via-[#d5d5da] to-[#cdced2] dark:from-[#323237] dark:via-[#2d2d32] dark:to-[#28282d] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.12),0_3px_6px_rgba(0,0,0,0.05)] dark:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35),0_3px_6px_rgba(0,0,0,0.12)]">
        {/* Bottom edge — dark grounding line */}
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-black/[0.06] dark:bg-white/[0.03]" />

        {/* Keyboard area — 4 rows of faint key hints */}
        <div className="mx-[6%] pt-[4%] space-y-[2px]">
          {/* Row 1 — function keys (smaller) */}
          <div className="flex gap-[2px] justify-center">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={`r1-${i}`}
                className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.08] to-black/[0.05] dark:from-white/[0.06] dark:to-white/[0.03] flex-1"
              />
            ))}
          </div>
          {/* Row 2 — QWERTY */}
          <div className="flex gap-[2px] justify-center px-[1%]">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={`r2-${i}`}
                className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.07] to-black/[0.04] dark:from-white/[0.05] dark:to-white/[0.025] flex-1"
              />
            ))}
          </div>
          {/* Row 3 — ASDF */}
          <div className="flex gap-[2px] justify-center px-[2%]">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={`r3-${i}`}
                className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.06] to-black/[0.035] dark:from-white/[0.045] dark:to-white/[0.02] flex-1"
              />
            ))}
          </div>
          {/* Row 4 — ZXCV + spacebar */}
          <div className="flex gap-[2px] justify-center items-center">
            <div className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.05] to-black/[0.03] dark:from-white/[0.035] dark:to-white/[0.015] w-[12%]" />
            <div className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.05] to-black/[0.03] dark:from-white/[0.035] dark:to-white/[0.015] flex-1 max-w-[35%]" />
            <div className="h-[3px] sm:h-[4px] rounded-[0.5px] bg-gradient-to-b from-black/[0.05] to-black/[0.03] dark:from-white/[0.035] dark:to-white/[0.015] w-[12%]" />
          </div>
        </div>

        {/* Trackpad — centered, subtle recessed feel */}
        <div className="mx-auto mt-[3%] mb-[8%] w-[28%] aspect-[5/3] rounded-[2px] bg-black/[0.008] dark:bg-white/[0.005] border border-black/[0.015] dark:border-white/[0.015]" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI UI — real ShareText interface inside devices
// ═══════════════════════════════════════════════════════════════════════════

function MiniHeader({ status }: { status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  const statusMap = {
    connected: { text: 'Connected', cls: 'text-status-success', dot: 'bg-status-success' },
    sending:   { text: 'Sending…', cls: 'text-azure-600', dot: 'bg-azure-600 animate-pulse' },
    sent:      { text: 'Sent ✓', cls: 'text-status-success', dot: 'bg-status-success' },
    receiving: { text: 'Receiving…', cls: 'text-azure-600', dot: 'bg-azure-600 animate-pulse' },
    received:  { text: 'Received ✓', cls: 'text-status-success', dot: 'bg-status-success' },
  };
  const s = statusMap[status];
  return (
    <div className="flex items-center justify-between px-[6px] sm:px-2 pt-[14%] sm:pt-[10%] pb-[4px] sm:pb-1.5 border-b border-white/[0.06]">
      <div className="flex items-center gap-0.5">
        <ShareTextLogo size={7} className="text-white" />
        <span className="text-[6px] sm:text-[7px] font-semibold text-white/80">ShareText</span>
        <Lock className="w-[4px] h-[4px] text-status-success ml-0.5" />
      </div>
      <span className={cn('flex items-center gap-0.5 text-[7px] sm:text-[8px] font-medium', s.cls)}>
        <span className={cn('w-1 h-1 rounded-full', s.dot)} />
        {s.text}
      </span>
    </div>
  );
}

// ─── Content cards ───

function ContentCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  switch (obj.kind) {
    case 'text':
      return (
        <div className={cn(
          'rounded-[5px] sm:rounded-[6px] px-[5px] sm:px-1.5 py-[3px] sm:py-0.5 max-w-[80%] text-[5px] sm:text-[6px] leading-snug',
          received
            ? 'bg-white/[0.08] border border-white/[0.06] text-white/80'
            : 'bg-azure-600 text-white rounded-tr-[2px] ml-auto'
        )}>
          {obj.text}
        </div>
      );
    case 'photo':
      return (
        <div className={cn('bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] overflow-hidden', received && 'ring-1 ring-status-success/30')}>
          <DemoPhoto className="w-full aspect-[4/3]" />
          <div className="px-[4px] sm:px-1.5 py-[2px] sm:py-0.5 flex items-center justify-between">
            <span className="text-[4.5px] sm:text-[5px] font-semibold text-white/80 truncate">{obj.name}</span>
            <span className="text-[4px] sm:text-[4.5px] text-white/40">{obj.size}</span>
          </div>
        </div>
      );
    case 'video':
      return (
        <div className={cn('bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] overflow-hidden', received && 'ring-1 ring-status-success/30')}>
          <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <DemoPhoto className="w-full h-full opacity-40" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-white/80 flex items-center justify-center">
                <div className="w-0 h-0 ml-px border-l-[4px] border-l-apple-ink border-y-[3px] border-y-transparent" />
              </div>
            </div>
            <span className="absolute bottom-0.5 right-0.5 px-0.5 py-px rounded text-[3.5px] sm:text-[4px] font-bold bg-black/60 text-white">{obj.duration}</span>
          </div>
          <div className="px-[4px] sm:px-1.5 py-[2px] sm:py-0.5 flex items-center justify-between">
            <span className="text-[4.5px] sm:text-[5px] font-semibold text-white/80 truncate">{obj.name}</span>
            <span className="text-[4px] sm:text-[4.5px] text-white/40">{obj.size}</span>
          </div>
        </div>
      );
    case 'file':
      return (
        <div className={cn('bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] px-[4px] sm:px-1.5 py-[3px] sm:py-1 flex items-center gap-1', received && 'ring-1 ring-status-success/30')}>
          <span className="shrink-0 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[3px] bg-white/[0.08] flex items-center justify-center border border-white/[0.05]">
            <FileTypeIcon name={obj.name || 'file.pdf'} size={7} />
          </span>
          <span className="min-w-0 flex-1 flex flex-col">
            <span className="text-[4.5px] sm:text-[5.5px] font-semibold text-white/80 truncate">{obj.name}</span>
            <span className="text-[3.5px] sm:text-[4px] text-white/40">{obj.size}</span>
          </span>
        </div>
      );
  }
}

function MiniProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full flex flex-col gap-0.5">
      <div className="w-full h-[2px] rounded-full bg-white/[0.08] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-azure-500 origin-left"
          animate={{ scaleX: progress / 100 }}
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      </div>
      <span className="text-[4px] sm:text-[5px] font-medium text-white/40 text-center">{Math.round(progress)}%</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLYING CONTENT — the actual object traveling between devices
// ═══════════════════════════════════════════════════════════════════════════

function FlyingContent({
  obj,
  progress,
  phoneRef,
  laptopRef,
  containerRef,
}: {
  obj: TransferItem;
  progress: number;
  phoneRef: React.RefObject<HTMLDivElement | null>;
  laptopRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [style, setStyle] = useState<{ left: number; top: number; opacity: number; scale: number; rotate: number }>({ left: 0, top: 0, opacity: 0, scale: 1, rotate: 0 });

  useEffect(() => {
    const phone = phoneRef.current;
    const laptop = laptopRef.current;
    const container = containerRef.current;
    if (!phone || !laptop || !container) return;

    const phoneRect = phone.getBoundingClientRect();
    const laptopRect = laptop.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const startX = phoneRect.right - containerRect.left;
    const startY = phoneRect.top + phoneRect.height * 0.4 - containerRect.top;

    const endX = laptopRect.left - containerRect.left;
    const endY = laptopRect.top + laptopRect.height * 0.4 - containerRect.top;

    // Cubic ease-in-out
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    const x = startX + (endX - startX) * eased;
    const y = startY + (endY - startY) * eased;

    // Arc with depth — lifts higher in the middle, slight rotation
    const arc = -50 * Math.sin(progress * Math.PI);
    const rotate = Math.sin(progress * Math.PI * 2) * 4;

    // Fade in/out at edges
    const opacity = progress < 0.06 ? progress / 0.06 : progress > 0.94 ? (1 - progress) / 0.06 : 1;

    // Scale — small at start, full at peak, slightly smaller at end
    const scale = 0.85 + 0.15 * Math.sin(progress * Math.PI);

    setStyle({ left: x, top: y + arc, opacity, scale, rotate });
  }, [progress, phoneRef, laptopRef, containerRef]);

  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{
        left: style.left,
        top: style.top,
        opacity: style.opacity,
        scale: style.scale,
        rotate: style.rotate,
        transform: 'translate(-50%, -50%)',
        filter: `drop-shadow(0 0 12px rgba(10,102,240,${0.4 * style.opacity})) drop-shadow(0 8px 20px rgba(0,0,0,0.35)) drop-shadow(0 20px 40px rgba(0,0,0,0.2))`,
      }}
    >
      <div className="w-[90px] sm:w-[110px] rounded-[10px] overflow-hidden border border-white/15 bg-white/[0.08] backdrop-blur-sm">
        <ContentCard obj={obj} />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HERO DEMO — 3D perspective scene
// ═══════════════════════════════════════════════════════════════════════════

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const laptopRef = useRef<HTMLDivElement>(null);

  const [simState, setSimState] = useState<SimState>('idle');
  const [transferKind, setTransferKind] = useState<Kind>('photo');
  const [progress, setProgress] = useState(0);
  const kindRef = useRef<Kind>('photo');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simStateRef = useRef<SimState>('idle');
  const runMachineRef = useRef<() => void>(() => {});

  // Mouse-driven 3D (Apple Design §5 — subtle environmental response)
  const { mx, my } = useMouseDamped();

  // Device transforms based on mouse
  const phoneRotateY = useTransform(mx, [-1, 1], [0, 0]);
  const phoneRotateX = useTransform(my, [-1, 1], [0, 0]);
  const phoneTranslateZ = useTransform(my, [-1, 1], [3, -1]);
  const laptopRotateY = useTransform(mx, [-1, 1], [0, 0]);
  const laptopRotateX = useTransform(my, [-1, 1], [0, 0]);
  const laptopTranslateZ = useTransform(my, [-1, 1], [-1, 1]);

  // Screen glow intensity based on state
  const phoneGlow = simState === 'sending' || simState === 'transferring' ? 0.8 : simState === 'selecting' ? 0.4 : 0.15;
  const laptopGlow = simState === 'receiving' || simState === 'complete' ? 0.8 : simState === 'transferring' ? 0.3 : 0.1;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  const runMachine = useCallback((startKind: Kind) => {
    clearTimers();
    setProgress(0);
    kindRef.current = startKind;
    setTransferKind(startKind);

    setSimState('idle');

    schedule(() => {
      setSimState('selecting');

      schedule(() => {
        setSimState('sending');

        schedule(() => {
          setSimState('transferring');
          const flightStart = Date.now();
          const tick = () => {
            const elapsed = Date.now() - flightStart;
            const p = Math.min(1, elapsed / T.TRANSFER_MS);
            setProgress(p);
            if (p < 1) schedule(tick, 16);
          };
          schedule(tick, 16);

          schedule(() => {
            setSimState('receiving');
            setProgress(1);

            schedule(() => {
              setSimState('complete');

              schedule(() => {
                setSimState('resetting');
                setProgress(0);

                schedule(() => {
                  const next = nextKind(kindRef.current);
                  kindRef.current = next;
                  setTransferKind(next);
                  runMachine(next);
                }, T.RESET_HOLD);
              }, T.COMPLETE_HOLD);
            }, T.RECEIVE_HOLD);
          }, T.IDLE_HOLD + T.SELECT_HOLD + T.SEND_HOLD + T.TRANSFER_MS);
        }, T.IDLE_HOLD + T.SELECT_HOLD + T.SEND_HOLD);
      }, T.IDLE_HOLD + T.SELECT_HOLD);
    }, T.IDLE_HOLD);
  }, [clearTimers, schedule]);

  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(kindRef.current);

  useEffect(() => {
    const t = setTimeout(() => runMachine('photo'), 300);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) clearTimers();
      else if (simStateRef.current === 'idle') runMachineRef.current();
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [clearTimers]);

  // ─── Derived state ───
  const item = TRANSFER_ITEMS[transferKind];
  const isIdle = simState === 'idle';
  const isSelecting = simState === 'selecting';
  const isSending = simState === 'sending';
  const isTransferring = simState === 'transferring';
  const isReceiving = simState === 'receiving';
  const isComplete = simState === 'complete';
  const isResetting = simState === 'resetting';

  const showPhoneContent = isSelecting || isSending || isTransferring || isReceiving || isComplete;
  const showFlyingContent = isTransferring;

  const phoneStatus = isSending || isTransferring ? 'sending' : isComplete ? 'sent' : 'connected';
  const laptopStatus = isReceiving ? 'receiving' : isComplete ? 'received' : 'connected';

  // ─── Reduced motion — flat, no perspective ───
  if (reduced) {
    return (
      <div ref={containerRef} data-testid="hero-demo" role="img"
        aria-label="ShareText preview: a photo transferred from phone to computer"
        className="relative w-full max-w-[680px] mx-auto select-none"
      >
        <div className="flex items-center justify-center gap-3 sm:gap-8">
          <PhoneFrame className="w-[110px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-[#080c18]">
              <MiniHeader status="sent" />
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1">
                <ContentCard obj={item} />
              </div>
              <div className="border-t border-white/[0.06] px-[5px] sm:px-1.5 py-1">
                <span className="text-[5px] text-status-success font-medium">Sent ✓</span>
              </div>
            </div>
          </PhoneFrame>
          <LaptopFrame className="w-[180px] sm:w-[280px] lg:w-[320px]">
            <div className="w-full h-full flex flex-col bg-[#080c18]">
              <MiniHeader status="received" />
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <ContentCard obj={item} received />
                <span className="mt-1 text-[5px] text-status-success font-medium">✓ Received</span>
              </div>
            </div>
          </LaptopFrame>
        </div>
      </div>
    );
  }

  // ─── Animated version with 3D perspective ───
  return (
    <div
      ref={containerRef}
      data-testid="hero-demo"
      data-sim-state={simState}
      data-transfer-kind={transferKind}
      role="img"
      aria-label="Interactive preview: ShareText transfers a photo from phone to computer."
      className="relative w-full min-w-0 select-none"
    >
      {/* ─── 3D PERSPECTIVE SCENE ─── */}
      <div
        ref={sceneRef}
        className="relative"
        style={{ perspective: 'none' }}
      >
        <div className="flex items-center justify-center gap-2 sm:gap-8 lg:gap-10"
          style={{ transformStyle: 'flat' }}
        >

          {/* ─── PHONE ─── */}
          <motion.div
            ref={phoneRef}
            animate={{
              opacity: isResetting ? 0.4 : 1,
              rotateY: phoneRotateY,
              rotateX: phoneRotateX,
              z: phoneTranslateZ,
            }}
            transition={{ opacity: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
            className="relative z-10"
            style={{ transformStyle: 'flat' }}
          >
            <PhoneFrame className="w-[120px] sm:w-[170px] lg:w-[195px]" glow={phoneGlow}>
              <div className="w-full h-full flex flex-col bg-[#080c18]">
                <MiniHeader status={phoneStatus} />

                <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1 overflow-hidden">
                  <AnimatePresence initial={false}>
                    {showPhoneContent && (
                      <motion.div
                        key={`phone-content-${transferKind}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: isTransferring ? 0.3 : 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <ContentCard obj={item} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Bottom bar */}
                <div className="border-t border-white/[0.06] px-[5px] sm:px-1.5 py-1">
                  <AnimatePresence mode="wait">
                    {(isIdle || isSelecting) && (
                      <motion.div key="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1"
                      >
                        <div className="flex-1 rounded-[4px] bg-white/[0.04] border border-white/[0.06] px-[5px] sm:px-1.5 py-[2px]">
                          <span className="text-[4.5px] sm:text-[5px] text-white/30 font-medium">
                            {isSelecting ? (transferKind === 'text' ? item.text?.slice(0, 20) : item.name) : 'Paste or drop…'}
                          </span>
                        </div>
                        {/* ─── TACTILE SEND BUTTON ─── */}
                        <motion.div
                          animate={isSelecting
                            ? { scale: [1, 1.12, 0.95, 1], y: [0, -1, 1, 0], boxShadow: ['0 0 0 0 rgba(10,102,240,0)', '0 0 0 3px rgba(10,102,240,0.15)', '0 0 0 0 rgba(10,102,240,0)', '0 0 0 0 rgba(10,102,240,0)'] }
                            : { scale: 1, y: 0 }
                          }
                          whileHover={{ scale: 1.08, y: -0.5 }}
                          whileTap={{ scale: 0.92, y: 1 }}
                          transition={isSelecting
                            ? { duration: 0.4, ease: [0.16, 1, 0.3, 1] }
                            : { duration: 0.15 }
                          }
                          className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-azure-600 flex items-center justify-center cursor-pointer shadow-[0_2px_6px_rgba(10,102,240,0.3),inset_0_1px_0_rgba(255,255,255,0.2)]"
                        >
                          <Send className="w-1.5 h-1.5 sm:w-2 sm:h-2 text-white" strokeWidth={3} />
                        </motion.div>
                      </motion.div>
                    )}

                    {isSending && (
                      <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="px-[5px] sm:px-1.5 py-[2px]"
                      >
                        <span className="text-[4.5px] sm:text-[5px] text-azure-400 font-medium">Sending…</span>
                      </motion.div>
                    )}

                    {isTransferring && (
                      <motion.div key="transferring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="px-[5px] sm:px-1.5 py-[2px]"
                      >
                        <span className="text-[4.5px] sm:text-[5px] text-white/30 font-medium">Sending… {Math.round(progress * 100)}%</span>
                      </motion.div>
                    )}

                    {(isReceiving || isComplete) && (
                      <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="px-[5px] sm:px-1.5 py-[2px]"
                      >
                        <span className="text-[4.5px] sm:text-[5px] text-status-success font-medium">Sent ✓</span>
                      </motion.div>
                    )}

                    {isResetting && (
                      <motion.div key="reset" initial={{ opacity: 0.2 }} animate={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="px-[5px] sm:px-1.5 py-[2px]"
                      >
                        <span className="text-[4.5px] sm:text-[5px] text-white/20 font-medium">…</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </PhoneFrame>
          </motion.div>

          {/* ─── LAPTOP ─── */}
          <motion.div
            ref={laptopRef}
            animate={{
              opacity: isResetting ? 0.4 : 1,
              rotateY: laptopRotateY,
              rotateX: laptopRotateX,
              z: laptopTranslateZ,
            }}
            transition={{ opacity: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
            className="relative z-0"
            style={{ transformStyle: 'flat' }}
          >
            <LaptopFrame className="w-[190px] sm:w-[300px] lg:w-[340px]" glow={laptopGlow}>
              <div className="w-full h-full flex flex-col bg-[#080c18]">
                <MiniHeader status={laptopStatus} />

                <div className="flex-1 flex flex-col items-center justify-center px-2 overflow-hidden">
                  <AnimatePresence mode="wait">

                    {(isIdle || isSelecting || isSending) && (
                      <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex flex-col items-center gap-1 text-white/20"
                      >
                        <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-20" />
                        <span className="text-[5px] sm:text-[6px] font-medium">Waiting for something…</span>
                      </motion.div>
                    )}

                    {isTransferring && (
                      <motion.div key="progress" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -2 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full max-w-[140px] flex flex-col items-center gap-1"
                      >
                        <div className="w-full relative">
                          <div className="opacity-20"><ContentCard obj={item} /></div>
                          <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5">
                            <MiniProgress progress={progress * 100} />
                          </div>
                        </div>
                        <span className="text-[4px] sm:text-[5px] font-medium text-white/30 flex items-center gap-0.5">
                          <span className="w-0.5 h-0.5 rounded-full bg-azure-500 animate-pulse" /> Receiving…
                        </span>
                      </motion.div>
                    )}

                    {isReceiving && (
                      <motion.div key="materialize" initial={{ opacity: 0, y: 4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full flex flex-col items-center gap-1"
                      >
                        <ContentCard obj={item} received />
                        <span className="text-[4px] sm:text-[5px] font-medium text-white/30">Processing…</span>
                      </motion.div>
                    )}

                    {isComplete && (
                      <motion.div key="complete" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="w-full flex flex-col items-center gap-1"
                      >
                        <ContentCard obj={item} received />
                        <motion.span
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="text-[4px] sm:text-[5px] font-medium text-status-success"
                        >
                          ✓ Received
                        </motion.span>
                        <motion.div initial={{ opacity: 0, y: 1 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2, duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <button type="button" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-azure-600/15 text-azure-400 text-[4px] sm:text-[5px] font-medium hover:bg-azure-600/25 transition-colors">
                            {transferKind === 'text' ? <><Copy className="w-1 h-1" /> Copy</> : <><Download className="w-1 h-1" /> Save</>}
                          </button>
                        </motion.div>
                      </motion.div>
                    )}

                    {isResetting && (
                      <motion.div key="reset-laptop" initial={{ opacity: 0.2 }} animate={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center gap-1 text-white/10"
                      >
                        <span className="text-[5px] sm:text-[6px] font-medium">…</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </LaptopFrame>
          </motion.div>
        </div>
      </div>

      {/* ─── FLYING CONTENT ─── */}
      <AnimatePresence>
        {showFlyingContent && (
          <FlyingContent
            obj={item}
            progress={progress}
            phoneRef={phoneRef}
            laptopRef={laptopRef}
            containerRef={containerRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
