import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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

const SCENE_ORDER: Kind[] = ['photo', 'text', 'file', 'video'];
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
  IDLE_HOLD:      2000,
  SELECT_HOLD:    500,
  SEND_HOLD:      350,
  TRANSFER_MS:    1200,
  RECEIVE_HOLD:   500,
  COMPLETE_HOLD:  2200,
  RESET_HOLD:     700,
};

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE FRAMES — realistic materials, restrained depth
// ═══════════════════════════════════════════════════════════════════════════

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Contact shadow — sits on the "surface" */}
      <div className="absolute -bottom-[4%] left-[8%] right-[8%] h-[6%] bg-black/[0.08] dark:bg-black/[0.2] rounded-[50%] blur-[6px]" />
      {/* Physical shell */}
      <div className="relative rounded-[26px] sm:rounded-[30px] p-[3%] bg-gradient-to-b from-[#e8e8ec] via-[#d8d8dc] to-[#c8c8cc] dark:from-[#2e2e32] dark:via-[#262629] dark:to-[#1e1e21] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_16px_rgba(0,0,0,0.12)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.4)]">
        {/* Subtle edge highlight — top edge catches light */}
        <div className="absolute inset-x-[12%] top-0 h-[1px] bg-white/60 dark:bg-white/10 rounded-full" />
        <div className="relative rounded-[20px] sm:rounded-[24px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[9/19.5]">
          {/* Screen glass — very subtle reflection */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] via-transparent to-transparent pointer-events-none z-20" />
          {/* Dynamic island */}
          <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[30%] h-[2.2%] min-h-[5px] bg-black rounded-full z-10" />
          {/* Status bar */}
          <div className="absolute inset-x-0 top-[1.5%] z-10 flex items-center justify-between px-[6%] text-[clamp(4px,1.1vw,7px)] text-white/70">
            <span className="font-semibold">9:41</span>
            <div className="flex items-center gap-[0.3em]">
              <span className="flex items-end gap-[0.06em]">
                {[0.4, 0.6, 0.8, 1].map((h, i) => (
                  <span key={i} className="w-[0.12em] rounded-[0.02em] bg-current" style={{ height: `${h * 0.45}em` }} />
                ))}
              </span>
              <span className="relative flex items-center w-[1em] h-[0.45em] rounded-[0.14em] border-[0.05em] border-current/50 px-[0.05em]">
                <span className="h-[65%] w-[75%] rounded-[0.08em] bg-current" />
                <span className="absolute -right-[0.18em] w-[0.1em] h-[0.2em] rounded-r-[0.04em] bg-current/40" />
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

function LaptopFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Contact shadow */}
      <div className="absolute -bottom-[2%] left-[4%] right-[4%] h-[4%] bg-black/[0.06] dark:bg-black/[0.15] rounded-[50%] blur-[8px]" />
      {/* Screen frame */}
      <div className="relative rounded-[8px] sm:rounded-[10px] p-[1.5%] bg-gradient-to-b from-[#d8d8dd] via-[#d0d0d5] to-[#b8b8bd] dark:from-[#363639] dark:via-[#333336] dark:to-[#2a2a2d] shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.15),0_4px_20px_rgba(0,0,0,0.3)]">
        {/* Top edge highlight */}
        <div className="absolute inset-x-[15%] top-0 h-[1px] bg-white/50 dark:bg-white/8 rounded-full" />
        <div className="absolute top-[2.5%] left-1/2 -translate-x-1/2 w-[1.8%] aspect-square rounded-full bg-[#1a1a1e] ring-[0.5px] ring-white/15 z-10" />
        <div className="relative rounded-[4px] sm:rounded-[6px] bg-[#1a1a1e] p-[1.2%]">
          <div className="relative rounded-[2px] sm:rounded-[3px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[16/10]">
            {/* Screen glass reflection */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none z-20" />
            {children}
          </div>
        </div>
      </div>
      {/* Keyboard deck */}
      <div className="relative -mt-[0.3%] -mx-[2%] w-[104%] rounded-b-[8px] sm:rounded-b-[10px] bg-gradient-to-b from-[#d0d0d5] via-[#c8c8cd] to-[#b8b8bd] dark:from-[#2e2e31] dark:via-[#2a2a2d] dark:to-[#222225] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.2)]">
        <div className="mx-[30%] mt-[3%] h-[1px] rounded-full bg-black/[0.04] dark:bg-white/[0.04]" />
        <div className="mx-[8%] mt-[3%] rounded-[2px] bg-black/[0.015] dark:bg-white/[0.015]">
          <div className="h-[45%] bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(0,0,0,0.008)_5px,rgba(0,0,0,0.008)_6px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(255,255,255,0.01)_5px,rgba(255,255,255,0.01)_6px)]" />
        </div>
        <div className="flex justify-center pb-[7%] mt-[2%]">
          <div className="w-[26%] h-[8%] rounded-[2px] bg-black/[0.01] dark:bg-white/[0.01] border border-black/[0.015] dark:border-white/[0.02]" />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MINI UI — real ShareText interface
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
    <div className="flex items-center justify-between px-[6px] sm:px-2 pt-[14%] sm:pt-[10%] pb-[4px] sm:pb-1.5 border-b border-black/[0.06] dark:border-white/[0.08]">
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
  const [style, setStyle] = useState<{ left: number; top: number; opacity: number; scale: number }>({ left: 0, top: 0, opacity: 0, scale: 1 });

  useEffect(() => {
    const phone = phoneRef.current;
    const laptop = laptopRef.current;
    const container = containerRef.current;
    if (!phone || !laptop || !container) return;

    const phoneRect = phone.getBoundingClientRect();
    const laptopRect = laptop.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Start from phone's right edge, 40% down
    const startX = phoneRect.right - containerRect.left;
    const startY = phoneRect.top + phoneRect.height * 0.4 - containerRect.top;

    // End at laptop's left edge, 40% down
    const endX = laptopRect.left - containerRect.left;
    const endY = laptopRect.top + laptopRect.height * 0.4 - containerRect.top;

    // Smooth ease-in-out for natural acceleration/deceleration
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    const x = startX + (endX - startX) * eased;
    const y = startY + (endY - startY) * eased;

    // Subtle arc — lifts up slightly in the middle
    const arc = -20 * Math.sin(progress * Math.PI);

    // Fade in/out at edges
    const opacity = progress < 0.08 ? progress / 0.08 : progress > 0.92 ? (1 - progress) / 0.08 : 1;

    // Slight scale pulse at peak
    const scale = 0.9 + 0.1 * Math.sin(progress * Math.PI);

    setStyle({ left: x, top: y + arc, opacity, scale });
  }, [progress, phoneRef, laptopRef, containerRef]);

  return (
    <motion.div
      className="absolute z-30 pointer-events-none"
      style={{
        left: style.left,
        top: style.top,
        opacity: style.opacity,
        scale: style.scale,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div className="w-[80px] sm:w-[100px] shadow-[0_2px_8px_rgba(0,0,0,0.2),0_8px_24px_rgba(0,0,0,0.15)] rounded-[8px] overflow-hidden border border-white/10">
        <ContentCard obj={obj} />
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HERO DEMO
// ═══════════════════════════════════════════════════════════════════════════

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const laptopRef = useRef<HTMLDivElement>(null);

  const [simState, setSimState] = useState<SimState>('idle');
  const [transferKind, setTransferKind] = useState<Kind>('photo');
  const [progress, setProgress] = useState(0);
  const sceneRef = useRef<Kind>('photo');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simStateRef = useRef<SimState>('idle');
  const runMachineRef = useRef<() => void>(() => {});

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
    sceneRef.current = startKind;
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
                  const next = nextKind(sceneRef.current);
                  sceneRef.current = next;
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
  runMachineRef.current = () => runMachine(sceneRef.current);

  useEffect(() => {
    const t = setTimeout(() => runMachine('photo'), 300);
    return () => clearTimeout(t);
  }, []);

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

  // ─── Reduced motion ───
  if (reduced) {
    return (
      <div ref={containerRef} data-testid="hero-demo" role="img"
        aria-label="ShareText preview: a photo transferred from phone to computer"
        className="relative w-full max-w-[680px] mx-auto select-none"
      >
        <div className="flex items-end justify-center gap-3 sm:gap-8">
          <PhoneFrame className="w-[110px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
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
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
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

  // ─── Animated version ───
  return (
    <div
      ref={containerRef}
      data-testid="hero-demo"
      data-sim-state={simState}
      data-transfer-kind={transferKind}
      role="img"
      aria-label="Interactive preview: ShareText transfers a photo from phone to computer."
      className="relative w-full max-w-[700px] mx-auto select-none"
    >
      <div className="flex items-end justify-center gap-2 sm:gap-8 lg:gap-10">

        {/* ─── PHONE ─── */}
        <motion.div
          ref={phoneRef}
          animate={{ opacity: isResetting ? 0.4 : 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10"
        >
          <PhoneFrame className="w-[110px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
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
                      <motion.div
                        animate={isSelecting ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                        className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-azure-600 flex items-center justify-center"
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
          animate={{ opacity: isResetting ? 0.4 : 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-0"
        >
          <LaptopFrame className="w-[180px] sm:w-[280px] lg:w-[320px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
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
                      {/* Micro-feedback: checkmark appears with subtle pop */}
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
                        <button type="button" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-azure-600/15 text-azure-400 text-[4px] sm:text-[5px] font-medium">
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
