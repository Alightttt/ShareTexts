import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon, FileArchive, Send, Video,
  Download, Copy, Lock,
} from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { DemoPhoto } from './DemoPhoto';
import { FileTypeIcon } from './FileTypeIcon';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// Reduced motion
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Transfer types
// ---------------------------------------------------------------------------
type Kind = 'text' | 'photo' | 'video' | 'file';

interface TransferItem {
  kind: Kind;
  text?: string;
  name?: string;
  size?: string;
  duration?: string;
}

const TRANSFER_ITEMS: Record<Kind, TransferItem> = {
  text:   { kind: 'text',   text: 'Meeting tomorrow at 4 PM' },
  photo:  { kind: 'photo',  name: 'holiday.jpg',  size: '4.2 MB' },
  video:  { kind: 'video',  name: 'holiday-clip.mp4',   size: '18.3 MB', duration: '00:18' },
  file:   { kind: 'file',   name: 'presentation.pdf',   size: '2.8 MB' },
};

const SCENE_ORDER: Kind[] = ['text', 'photo', 'video', 'file'];
const nextKind = (k: Kind) => SCENE_ORDER[(SCENE_ORDER.indexOf(k) + 1) % SCENE_ORDER.length];

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
type SimState =
  | 'idle'
  | 'pairing'
  | 'connecting'
  | 'connected'
  | 'preparing'
  | 'transferring'
  | 'received'
  | 'complete';

// ---------------------------------------------------------------------------
// Timing — 7-10s product story
// ---------------------------------------------------------------------------
const T = {
  IDLE_HOLD:       1500,
  PAIRING_HOLD:    500,
  CONNECTING_HOLD: 500,
  CONNECTED_HOLD:  1000,
  PREPARING_HOLD:  300,
  FLIGHT_MS:       2700,
  RECEIVED_HOLD:   1500,
  COMPLETE_HOLD:   1200,
};

// ---------------------------------------------------------------------------
// Realistic device frames — phone + laptop
// ---------------------------------------------------------------------------

/** Modern smartphone frame */
function PhoneDevice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Phone body */}
      <div className="relative rounded-[28px] sm:rounded-[32px] p-[3%] bg-gradient-to-b from-[#e8e8ec] via-[#d1d1d6] to-[#c7c7cc] dark:from-[#2c2c2e] dark:via-[#1c1c1e] dark:to-[#141416] shadow-[0_4px_20px_rgba(0,0,0,0.15),0_1px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_1px_4px_rgba(0,0,0,0.2)]">
        {/* Screen */}
        <div className="relative rounded-[22px] sm:rounded-[26px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[9/19.5]">
          {/* Dynamic island */}
          <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[32%] h-[2.5%] min-h-[6px] bg-black rounded-full z-10 flex items-center justify-end px-[8%]">
            <span className="w-[14%] h-[35%] rounded-full bg-[#1a1a2e]" />
          </div>
          {/* Status bar */}
          <div className="absolute inset-x-0 top-[1.5%] z-10 flex items-center justify-between px-[6%] text-[clamp(4px,1.2vw,8px)] text-white/80">
            <span className="font-semibold">9:41</span>
            <div className="flex items-center gap-[0.3em]">
              <span className="flex items-end gap-[0.06em]">
                {[0.4, 0.6, 0.8, 1].map((h, i) => (
                  <span key={i} className="w-[0.12em] rounded-[0.02em] bg-current" style={{ height: `${h * 0.45}em` }} />
                ))}
              </span>
              <span className="relative flex items-center w-[1em] h-[0.45em] rounded-[0.14em] border-[0.05em] border-current/60 px-[0.05em]">
                <span className="h-[65%] w-[75%] rounded-[0.08em] bg-current" />
                <span className="absolute -right-[0.18em] w-[0.1em] h-[0.2em] rounded-r-[0.04em] bg-current/50" />
              </span>
            </div>
          </div>
          {/* Screen content */}
          <div className="relative w-full h-full z-[5]">
            {children}
          </div>
        </div>
      </div>
      {/* Side buttons */}
      <div className="absolute -left-[1%] top-[14%] h-[3%] w-[1.8%] rounded-l-[1px] bg-gradient-to-b from-[#b0b0b5] to-[#9a9a9f] dark:from-[#3a3a3e] dark:to-[#2a2a2e]" />
      <div className="absolute -left-[1%] top-[20%] h-[5%] w-[1.8%] rounded-l-[1px] bg-gradient-to-b from-[#b0b0b5] to-[#9a9a9f] dark:from-[#3a3a3e] dark:to-[#2a2a2e]" />
      <div className="absolute -right-[1%] top-[17%] h-[6%] w-[1.8%] rounded-r-[1px] bg-gradient-to-b from-[#a5a5aa] to-[#8a8a8f] dark:from-[#353538] dark:to-[#252528]" />
    </div>
  );
}

/** Modern laptop frame */
function LaptopDevice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      {/* Lid */}
      <div className="relative rounded-[10px] sm:rounded-[12px] p-[1.5%] bg-gradient-to-b from-[#d5d5da] via-[#b8b8bd] to-[#a8a8ad] dark:from-[#3a3a3e] dark:via-[#2a2a2e] dark:to-[#222224] shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35),0_1px_4px_rgba(0,0,0,0.15)]">
        {/* Camera dot */}
        <div className="absolute top-[2.5%] left-1/2 -translate-x-1/2 w-[2%] aspect-square rounded-full bg-[#1a1a1e] ring-[0.5px] ring-white/20 z-10" />
        {/* Screen bezel */}
        <div className="relative rounded-[6px] sm:rounded-[8px] bg-[#1a1a1e] p-[1.5%]">
          {/* Screen */}
          <div className="relative rounded-[3px] sm:rounded-[4px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[16/10]">
            {children}
          </div>
        </div>
      </div>
      {/* Keyboard deck */}
      <div className="relative -mt-[0.5%] -mx-[5%] w-[110%] rounded-b-[10px] sm:rounded-b-[12px] bg-gradient-to-b from-[#c0c0c5] to-[#a5a5aa] dark:from-[#2a2a2e] dark:to-[#1e1e20] shadow-[0_12px_30px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_30px_-8px_rgba(0,0,0,0.3)]"
        style={{ clipPath: 'polygon(4% 0%, 96% 0%, 100% 100%, 0% 100%)' }}
      >
        <div className="absolute top-0 left-[4%] right-[4%] h-[0.5cqw] rounded-full bg-black/60 dark:bg-black/80" />
        <div className="flex flex-col gap-[0.6cqw] pt-[1.5cqw] px-[5cqw]">
          {Array.from({ length: 3 }).map((_, row) => (
            <div key={row} className="flex gap-[0.6cqw]">
              {Array.from({ length: row === 0 ? 12 : row === 1 ? 11 : 10 }).map((_, key) => (
                <span key={key} className="h-[1.2cqw] flex-1 rounded-[0.3cqw] bg-gradient-to-b from-white/10 to-black/5 dark:from-white/5 dark:to-black/10" />
              ))}
            </div>
          ))}
          <div className="flex gap-[0.6cqw]">
            <span className="h-[1.4cqw] w-[8cqw] rounded-[0.3cqw] bg-gradient-to-b from-white/10 to-black/5 dark:from-white/5 dark:to-black/10" />
            <span className="h-[1.4cqw] flex-1 rounded-[0.3cqw] bg-gradient-to-b from-white/10 to-black/5 dark:from-white/5 dark:to-black/10" />
            <span className="h-[1.4cqw] w-[8cqw] rounded-[0.3cqw] bg-gradient-to-b from-white/10 to-black/5 dark:from-white/5 dark:to-black/10" />
          </div>
        </div>
        {/* Trackpad */}
        <div className="flex justify-center py-[1cqw]">
          <div className="w-[22cqw] h-[2cqw] rounded-[0.8cqw] bg-gradient-to-b from-black/5 to-black/10 dark:from-white/5 dark:to-white/8" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShareText UI — rendered inside device screens
// ---------------------------------------------------------------------------

/** Status pill */
function StatusPill({ state }: { state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  if (state === 'connected') {
    return (
      <span className="flex items-center gap-0.5 text-[7px] sm:text-[8px] font-semibold text-status-success">
        <span className="w-1 h-1 rounded-full bg-status-success" />
        Connected
      </span>
    );
  }
  const map: Record<string, { dot: string; text: string; cls: string; pulse: boolean }> = {
    sending:   { dot: 'bg-apple-blue', text: 'Sending…', cls: 'text-apple-blue', pulse: true },
    sent:      { dot: 'bg-status-success', text: 'Sent ✓', cls: 'text-status-success', pulse: false },
    receiving: { dot: 'bg-apple-blue', text: 'Receiving…', cls: 'text-apple-blue', pulse: true },
    received:  { dot: 'bg-status-success', text: 'Received ✓', cls: 'text-status-success', pulse: false },
  };
  const s = map[state];
  return (
    <span className={cn('flex items-center gap-0.5 text-[7px] sm:text-[8px] font-medium', s.cls)}>
      <span className={cn('w-1 h-1 rounded-full', s.dot, s.pulse && 'animate-pulse')} />
      {s.text}
    </span>
  );
}

/** Mini ShareText header for inside devices */
function MiniHeader({ status }: { status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  return (
    <div className="flex items-center justify-between px-[6px] sm:px-2 pt-[14%] sm:pt-[10%] pb-[5px] sm:pb-1.5 border-b border-black/[0.08] dark:border-white/[0.1]">
      <div className="flex items-center gap-0.5">
        <ShareTextLogo size={8} className="text-apple-ink dark:text-white" />
        <span className="text-[7px] sm:text-[8px] font-semibold text-apple-ink dark:text-white">ShareText</span>
        <Lock className="w-[5px] h-[5px] text-status-success ml-0.5" />
      </div>
      <StatusPill state={status} />
    </div>
  );
}

/** Message bubbles */
function MiniText({ obj, sent }: { obj: TransferItem; sent?: boolean }) {
  return (
    <div className={cn(
      'rounded-[6px] sm:rounded-[8px] px-[6px] sm:px-2 py-[4px] sm:py-1 max-w-[80%] text-[6px] sm:text-[7px] leading-snug',
      sent
        ? 'bg-azure-600 text-white rounded-tr-[2px] ml-auto'
        : 'bg-apple-parchment dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.08] text-apple-ink dark:text-white',
    )}>
      {obj.text}
    </div>
  );
}

function MiniPhoto({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[6px] sm:rounded-[8px] overflow-hidden',
      received && 'ring-1 ring-status-success/30',
    )}>
      <DemoPhoto className="w-full aspect-[4/3]" />
      <div className="px-[5px] sm:px-1.5 py-[3px] sm:py-1 flex items-center justify-between">
        <span className="text-[5px] sm:text-[6px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[4.5px] sm:text-[5px] text-apple-ink-muted">{obj.size}</span>
      </div>
    </div>
  );
}

function MiniVideo({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[6px] sm:rounded-[8px] overflow-hidden',
      received && 'ring-1 ring-status-success/30',
    )}>
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <DemoPhoto className="w-full h-full opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/90 dark:bg-black/60 flex items-center justify-center shadow">
            <div className="w-0 h-0 ml-px border-l-[5px] border-l-apple-ink dark:border-l-white border-y-[3.5px] border-y-transparent" />
          </div>
        </div>
        <span className="absolute bottom-0.5 right-1 px-0.5 py-px rounded text-[4px] sm:text-[5px] font-bold bg-black/70 text-white">{obj.duration}</span>
      </div>
      <div className="px-[5px] sm:px-1.5 py-[3px] sm:py-1 flex items-center justify-between">
        <span className="text-[5px] sm:text-[6px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[4.5px] sm:text-[5px] text-apple-ink-muted">{obj.size}</span>
      </div>
    </div>
  );
}

function MiniFile({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[6px] sm:rounded-[8px] px-[5px] sm:px-2 py-[4px] sm:py-1.5 flex items-center gap-1.5',
      received && 'ring-1 ring-status-success/30',
    )}>
      <span className="shrink-0 w-4 h-4 sm:w-5 sm:h-5 rounded-[4px] bg-white dark:bg-white/[0.08] flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06]">
        <FileTypeIcon name={obj.name || 'file.pdf'} size={8} />
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="text-[5.5px] sm:text-[6.5px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[4.5px] sm:text-[5px] text-apple-ink-muted">{obj.size}</span>
      </span>
    </div>
  );
}

function MiniCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  switch (obj.kind) {
    case 'text':  return <MiniText obj={obj} sent={!received} />;
    case 'photo': return <MiniPhoto obj={obj} received={received} />;
    case 'video': return <MiniVideo obj={obj} received={received} />;
    case 'file':  return <MiniFile obj={obj} received={received} />;
  }
}

/** Mini progress bar */
function MiniProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full flex flex-col gap-0.5">
      <div className="w-full h-[3px] rounded-full bg-black/[0.08] dark:bg-white/[0.12] overflow-hidden">
        <motion.div className="h-full rounded-full bg-apple-blue origin-left" animate={{ scaleX: progress / 100 }} transition={{ duration: 0.08, ease: 'linear' }} />
      </div>
      <span className="text-[5px] sm:text-[6px] font-medium text-apple-ink-muted text-center">{Math.round(progress)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HeroDemo
// ---------------------------------------------------------------------------
export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [simState, setSimState] = useState<SimState>('idle');
  const [transferKind, setTransferKind] = useState<Kind>('text');
  const [progress, setProgress] = useState(0);
  const sceneRef = useRef<Kind>('text');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const simStateRef = useRef<SimState>('idle');
  const runMachineRef = useRef<() => void>(() => {});
  const hoverRef = useRef(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
    return t;
  }, []);

  // Pointer parallax — extremely subtle depth
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMousePos({ x: x * 3, y: y * 2 }); // very subtle: ±3px x, ±2px y
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: 0, y: 0 });
  }, []);

  // ---- State machine ----
  const runMachine = useCallback((startKind: Kind) => {
    clearTimers(); setProgress(0); sceneRef.current = startKind; setTransferKind(startKind);

    setSimState('idle');
    schedule(() => setSimState('pairing'), T.IDLE_HOLD);
    schedule(() => setSimState('connecting'), T.IDLE_HOLD + T.PAIRING_HOLD);
    schedule(() => setSimState('connected'), T.IDLE_HOLD + T.PAIRING_HOLD + T.CONNECTING_HOLD);

    schedule(() => {
      setSimState('preparing');
      schedule(() => {
        setSimState('transferring');
        const flightStart = Date.now();
        const tick = () => {
          const elapsed = Date.now() - flightStart;
          const p = Math.min(100, (elapsed / T.FLIGHT_MS) * 100);
          setProgress(p);
          if (p < 100) schedule(tick, 25);
        };
        schedule(tick, 25);
        schedule(() => {
          setSimState('received'); setProgress(100);
          schedule(() => {
            setSimState('complete');
            schedule(() => {
              setSimState('idle'); setProgress(0);
              const next = nextKind(sceneRef.current);
              sceneRef.current = next; setTransferKind(next);
              runMachine(next);
            }, T.COMPLETE_HOLD);
          }, T.RECEIVED_HOLD);
        }, T.FLIGHT_MS);
      }, T.PREPARING_HOLD);
    }, T.IDLE_HOLD + T.PAIRING_HOLD + T.CONNECTING_HOLD + T.CONNECTED_HOLD);
  }, [clearTimers, schedule]);

  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(sceneRef.current);

  useEffect(() => {
    const t = setTimeout(() => runMachine('text'), 300);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) clearTimers();
      else if (simStateRef.current === 'idle' && !hoverRef.current) runMachineRef.current();
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [clearTimers]);

  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;
    hoverTimerRef.current = setTimeout(() => { if (hoverRef.current) clearTimers(); }, 300);
  }, [clearTimers]);

  const handleContainerMouseLeave = useCallback(() => {
    hoverRef.current = false;
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (simStateRef.current === 'idle') runMachineRef.current();
    setMousePos({ x: 0, y: 0 });
  }, []);

  // Derived states
  const isSending = simState === 'preparing' || simState === 'transferring';
  const isReceiving = simState === 'transferring' || simState === 'received';
  const isDone = simState === 'received' || simState === 'complete';
  const senderStatus: 'connected' | 'sending' | 'sent' = isSending ? 'sending' : isDone ? 'sent' : 'connected';
  const receiverStatus: 'connected' | 'receiving' | 'received' = isReceiving ? (isDone ? 'received' : 'receiving') : 'connected';
  const item = TRANSFER_ITEMS[transferKind];

  // ---- Reduced motion ----
  if (reduced) {
    return (
      <div ref={containerRef} data-testid="hero-demo" role="img"
        aria-label="ShareText preview: transfer files between phone and computer"
        className="relative w-full max-w-[700px] mx-auto select-none"
      >
        <div className="flex items-end justify-center gap-4 sm:gap-8">
          <PhoneDevice className="w-[140px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status="sent" />
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1">
                <MiniCard obj={item} />
              </div>
            </div>
          </PhoneDevice>
          <LaptopDevice className="w-[240px] sm:w-[300px] lg:w-[340px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status="received" />
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <MiniCard obj={item} received />
                <span className="mt-1 text-[5px] sm:text-[6px] font-medium text-status-success">✓ Received</span>
              </div>
            </div>
          </LaptopDevice>
        </div>
      </div>
    );
  }

  // ---- Full interactive simulation ----
  return (
    <div
      ref={containerRef}
      data-testid="hero-demo"
      data-sim-state={simState}
      data-transfer-kind={transferKind}
      role="img"
      aria-label="Interactive preview: ShareText transfers content from phone to computer."
      className="relative w-full max-w-[750px] mx-auto select-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleContainerMouseLeave}
      onMouseEnter={handleMouseEnter}
    >
      <div className="flex items-end justify-center gap-4 sm:gap-8 lg:gap-12">
        {/* ============ PHONE — the sender ============ */}
        <motion.div
          animate={{ x: mousePos.x * -0.5, y: mousePos.y * -0.3 }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          className="relative z-10"
        >
          <PhoneDevice className="w-[140px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status={senderStatus} />
              {/* Chat area */}
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1 overflow-hidden">
                <AnimatePresence initial={false}>
                  {isDone && (
                    <motion.div key="sent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}>
                      <MiniCard obj={item} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {/* Composer or status */}
              <div className="border-t border-black/[0.08] dark:border-white/[0.1] px-[5px] sm:px-1.5 py-1">
                <AnimatePresence mode="wait">
                  {simState === 'connected' || simState === 'idle' || simState === 'complete' ? (
                    <motion.div key="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1"
                    >
                      <div className="flex-1 rounded-[6px] bg-apple-parchment/80 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] px-[5px] sm:px-1.5 py-[3px] sm:py-1">
                        <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/60 dark:text-white/40 font-medium">
                          {transferKind === 'text' ? 'Meeting tomorrow…' : TRANSFER_ITEMS[transferKind].name}
                        </span>
                      </div>
                      <button type="button" className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-azure-600 flex items-center justify-center shadow-[0_1px_4px_rgba(10,102,240,0.3)]">
                        <Send className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" strokeWidth={3} />
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div key="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center justify-between px-[5px] sm:px-1.5 py-[3px]"
                    >
                      <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/60 dark:text-white/40 font-medium">
                        {simState === 'preparing' ? 'Preparing…' : simState === 'transferring' ? `Sending… ${Math.round(progress)}%` : simState === 'received' ? 'Sent ✓' : 'Connecting…'}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneDevice>
          <p className="text-center mt-2 sm:mt-3 text-[10px] sm:text-[11px] font-medium text-apple-ink-muted dark:text-white/50">Your phone</p>
        </motion.div>

        {/* ============ LAPTOP — the receiver ============ */}
        <motion.div
          animate={{ x: mousePos.x * 0.3, y: mousePos.y * 0.2 }}
          transition={{ type: 'spring', stiffness: 150, damping: 20 }}
          className="relative z-0"
        >
          <LaptopDevice className="w-[240px] sm:w-[300px] lg:w-[340px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status={receiverStatus} />
              {/* Content area */}
              <div className="flex-1 flex flex-col items-center justify-center px-2 overflow-hidden">
                <AnimatePresence mode="wait">
                  {/* Pairing */}
                  {simState === 'pairing' && (
                    <motion.div key="pairing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span className="text-[6px] sm:text-[7px] font-medium text-apple-ink dark:text-white">Enter pairing code</span>
                      <div className="flex gap-0.5">
                        {['8','4','7','2','9','1'].map((d, i) => (
                          <motion.span key={i} initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.15 }}
                            className="w-4 h-5 sm:w-5 sm:h-6 rounded-[3px] bg-apple-parchment dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-[8px] sm:text-[10px] font-mono font-bold text-apple-ink dark:text-white"
                          >{d}</motion.span>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Transferring */}
                  {simState === 'transferring' && !isDone && (
                    <motion.div key="progress" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="w-full max-w-[160px] flex flex-col items-center gap-1.5"
                    >
                      <div className="w-full relative">
                        <div className="opacity-50"><MiniCard obj={item} /></div>
                        <div className="absolute bottom-0 left-0 right-0 px-1 pb-1"><MiniProgress progress={progress} /></div>
                      </div>
                      <span className="text-[5px] sm:text-[6px] font-medium text-apple-ink-muted flex items-center gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-apple-blue animate-pulse" /> Receiving…
                      </span>
                    </motion.div>
                  )}

                  {/* Received */}
                  {isDone && (
                    <motion.div key={`received-${transferKind}`} initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="w-full flex flex-col items-center gap-1"
                    >
                      <MiniCard obj={item} received />
                      <span className="text-[5px] sm:text-[6px] font-medium text-status-success">✓ Received</span>
                      <AnimatePresence>
                        {simState === 'received' && (
                          <motion.div initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ delay: 0.15, duration: 0.15 }}
                          >
                            <button type="button" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-azure-600/10 text-azure-600 text-[5px] sm:text-[6px] font-medium">
                              {transferKind === 'text' ? <><Copy className="w-1.5 h-1.5" /> Copy</> : <><Download className="w-1.5 h-1.5" /> Download</>}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Waiting */}
                  {!isSending && !isReceiving && !isDone && simState !== 'pairing' && (
                    <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/40 dark:text-white/25"
                    >
                      <Send className="w-3 h-3 sm:w-4 sm:h-4 opacity-30" />
                      <span className="text-[6px] sm:text-[7px] font-medium">Waiting for something…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopDevice>
          <p className="text-center mt-2 sm:mt-3 text-[10px] sm:text-[11px] font-medium text-apple-ink-muted dark:text-white/50">Your computer</p>
        </motion.div>
      </div>
    </div>
  );
}
