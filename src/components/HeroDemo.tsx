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
  text:  { kind: 'text',  text: 'Meeting tomorrow at 4 PM' },
  photo: { kind: 'photo', name: 'holiday.jpg',  size: '4.2 MB' },
  video: { kind: 'video', name: 'holiday-clip.mp4',   size: '18.3 MB', duration: '00:18' },
  file:  { kind: 'file',  name: 'presentation.pdf',   size: '2.8 MB' },
};

const SCENE_ORDER: Kind[] = ['text', 'photo', 'video', 'file'];
const nextKind = (k: Kind) => SCENE_ORDER[(SCENE_ORDER.indexOf(k) + 1) % SCENE_ORDER.length];

// ---------------------------------------------------------------------------
// State machine — the single source of truth
// ---------------------------------------------------------------------------
// The story: idle → connected → button press → sending → transfer → receiving → received → complete → reset → idle
type SimState =
  | 'idle'          // both devices visible, phone has content, laptop waiting
  | 'pressing'      // send button is being pressed (0.25s)
  | 'sending'       // phone shows "Sending…", progress starts
  | 'transferring'  // both devices show progress
  | 'receiving'     // laptop receives the content
  | 'received'      // laptop shows ✓ Received + action button
  | 'complete'      // both devices show completion
  | 'resetting';    // brief fade before next scene

// ---------------------------------------------------------------------------
// Timing — breathing pace, each state is understandable
// ---------------------------------------------------------------------------
const T = {
  IDLE_HOLD:      2000,   // visitor sees phone has content, laptop waiting
  PRESS_HOLD:     250,    // button press animation
  SENDING_HOLD:   600,    // phone enters "Sending…"
  TRANSFER_MS:    1600,   // progress fills (both devices)
  RECEIVING_HOLD: 400,    // brief pause while laptop processes
  RECEIVED_HOLD:  1800,   // visitor reads "✓ Received"
  COMPLETE_HOLD:  1500,   // completion state breathes
  RESET_HOLD:     600,    // crossfade before next scene
};

// ---------------------------------------------------------------------------
// Realistic device frames
// ---------------------------------------------------------------------------

function PhoneDevice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div className="relative rounded-[28px] sm:rounded-[32px] p-[3%] bg-gradient-to-b from-[#e8e8ec] via-[#d1d1d6] to-[#c7c7cc] dark:from-[#2c2c2e] dark:via-[#1c1c1e] dark:to-[#141416] shadow-[0_4px_20px_rgba(0,0,0,0.15),0_1px_4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4),0_1px_4px_rgba(0,0,0,0.2)]">
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
          <div className="relative w-full h-full z-[5]">{children}</div>
        </div>
      </div>
      {/* Side buttons */}
      <div className="absolute -left-[1%] top-[14%] h-[3%] w-[1.8%] rounded-l-[1px] bg-gradient-to-b from-[#b0b0b5] to-[#9a9a9f] dark:from-[#3a3a3e] dark:to-[#2a2a2e]" />
      <div className="absolute -left-[1%] top-[20%] h-[5%] w-[1.8%] rounded-l-[1px] bg-gradient-to-b from-[#b0b0b5] to-[#9a9a9f] dark:from-[#3a3a3e] dark:to-[#2a2a2e]" />
      <div className="absolute -right-[1%] top-[17%] h-[6%] w-[1.8%] rounded-r-[1px] bg-gradient-to-b from-[#a5a5aa] to-[#8a8a8f] dark:from-[#353538] dark:to-[#252528]" />
    </div>
  );
}

function LaptopDevice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div className="relative rounded-[10px] sm:rounded-[12px] p-[1.5%] bg-gradient-to-b from-[#d5d5da] via-[#b8b8bd] to-[#a8a8ad] dark:from-[#3a3a3e] dark:via-[#2a2a2e] dark:to-[#222224] shadow-[0_4px_24px_rgba(0,0,0,0.12),0_1px_4px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.35),0_1px_4px_rgba(0,0,0,0.15)]">
        <div className="absolute top-[2.5%] left-1/2 -translate-x-1/2 w-[2%] aspect-square rounded-full bg-[#1a1a1e] ring-[0.5px] ring-white/20 z-10" />
        <div className="relative rounded-[6px] sm:rounded-[8px] bg-[#1a1a1e] p-[1.5%]">
          <div className="relative rounded-[3px] sm:rounded-[4px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[16/10]">
            {children}
          </div>
        </div>
      </div>
      {/* Keyboard deck — slim, elegant, barely visible */}
      <div className="relative -mt-[0.5%] -mx-[3%] w-[106%] rounded-b-[10px] sm:rounded-b-[12px] bg-gradient-to-b from-[#d0d0d5] via-[#b8b8bd] to-[#a8a8ad] dark:from-[#333338] dark:via-[#282830] dark:to-[#222228] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.3)]">
        <div className="absolute top-0 left-[6%] right-[6%] h-[1px] rounded-full bg-white/30 dark:bg-white/10" />
        {/* Hinge notch — the subtle curve where screen meets deck */}
        <div className="mx-[35%] mt-[3%] h-[2px] rounded-full bg-black/[0.06] dark:bg-white/[0.06]" />
        {/* Keyboard area — ultra minimal, just a hint of texture */}
        <div className="mx-[8%] mt-[4%] rounded-[3px] bg-gradient-to-b from-black/[0.02] to-black/[0.04] dark:from-white/[0.03] dark:to-white/[0.01]">
          <div className="h-[50%] bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,rgba(0,0,0,0.015)_4px,rgba(0,0,0,0.015)_5px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,rgba(255,255,255,0.02)_4px,rgba(255,255,255,0.02)_5px)]" />
        </div>
        {/* Trackpad — barely visible */}
        <div className="flex justify-center pb-[8%] mt-[2%]">
          <div className="w-[28%] h-[10%] rounded-[3px] bg-gradient-to-b from-black/[0.02] to-black/[0.04] dark:from-white/[0.02] dark:to-white/[0.01] border border-black/[0.03] dark:border-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShareText UI components — rendered inside device screens
// ---------------------------------------------------------------------------

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

// ---- Transfer cards ----

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

function MiniProgress({ progress }: { progress: number }) {
  return (
    <div className="w-full flex flex-col gap-0.5">
      <div className="w-full h-[3px] rounded-full bg-black/[0.08] dark:bg-white/[0.12] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-apple-blue origin-left"
          animate={{ scaleX: progress / 100 }}
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      </div>
      <span className="text-[5px] sm:text-[6px] font-medium text-apple-ink-muted text-center">{Math.round(progress)}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HeroDemo — product simulation
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
    setMousePos({ x: x * 3, y: y * 2 });
  }, []);

  // ---- State machine — the complete product story ----
  const runMachine = useCallback((startKind: Kind) => {
    clearTimers();
    setProgress(0);
    sceneRef.current = startKind;
    setTransferKind(startKind);

    // 1. IDLE — phone shows content, laptop shows "Waiting for something…"
    setSimState('idle');
    const afterIdle = T.IDLE_HOLD;

    // 2. PRESSING — send button depresses
    schedule(() => setSimState('pressing'), afterIdle);

    // 3. SENDING — phone enters "Sending…"
    schedule(() => setSimState('sending'), afterIdle + T.PRESS_HOLD);

    // 4. TRANSFERRING — progress fills on both devices
    schedule(() => {
      setSimState('transferring');
      const flightStart = Date.now();
      const tick = () => {
        const elapsed = Date.now() - flightStart;
        const p = Math.min(100, (elapsed / T.TRANSFER_MS) * 100);
        setProgress(p);
        if (p < 100) schedule(tick, 30);
      };
      schedule(tick, 30);

      // 5. RECEIVING — laptop shows content arriving
      schedule(() => {
        setSimState('receiving');
        setProgress(100);

        // 6. RECEIVED — laptop shows ✓ Received
        schedule(() => {
          setSimState('received');

          // 7. COMPLETE — both devices show completion
          schedule(() => {
            setSimState('complete');

            // 8. RESET — fade, then next scene
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
          }, T.RECEIVED_HOLD);
        }, T.RECEIVING_HOLD);
      }, T.TRANSFER_MS);
    }, afterIdle + T.PRESS_HOLD + T.SENDING_HOLD);
  }, [clearTimers, schedule]);

  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(sceneRef.current);

  useEffect(() => {
    const t = setTimeout(() => runMachine('text'), 300);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause on scroll out, resume on scroll in
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

  // Hover — pause after intent delay
  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;
    hoverTimerRef.current = setTimeout(() => { if (hoverRef.current) clearTimers(); }, 400);
  }, [clearTimers]);

  const handleContainerMouseLeave = useCallback(() => {
    hoverRef.current = false;
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (simStateRef.current === 'idle') runMachineRef.current();
    setMousePos({ x: 0, y: 0 });
  }, []);

  // ---- Derived states for UI ----
  const isIdle = simState === 'idle';
  const isPressing = simState === 'pressing';
  const isSending = simState === 'sending' || simState === 'transferring';
  const isReceiving = simState === 'transferring' || simState === 'receiving';
  const isReceived = simState === 'received' || simState === 'complete';
  const isResetting = simState === 'resetting';

  const senderStatus: 'connected' | 'sending' | 'sent' =
    isSending ? 'sending' : isReceived ? 'sent' : 'connected';
  const receiverStatus: 'connected' | 'receiving' | 'received' =
    isReceiving ? (isReceived ? 'received' : 'receiving') : 'connected';

  const item = TRANSFER_ITEMS[transferKind];
  const showComposer = isIdle || isPressing;
  const showSendingStatus = simState === 'sending' || simState === 'transferring' || simState === 'receiving';
  const showSentStatus = simState === 'received' || simState === 'complete';

  // ---- Reduced motion — static snapshot ----
  if (reduced) {
    return (
      <div ref={containerRef} data-testid="hero-demo" role="img"
        aria-label="ShareText preview: transfer files between phone and computer"
        className="relative w-full max-w-[700px] mx-auto select-none"
      >
        <div className="flex items-end justify-center gap-2 sm:gap-8">
          <PhoneDevice className="w-[105px] sm:w-[155px] lg:w-[175px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status="sent" />
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1">
                <MiniCard obj={item} />
              </div>
              <div className="border-t border-black/[0.08] dark:border-white/[0.1] px-[5px] sm:px-1.5 py-1 flex items-center justify-between">
                <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/60 font-medium">Sent ✓</span>
              </div>
            </div>
          </PhoneDevice>
          <LaptopDevice className="w-[170px] sm:w-[290px] lg:w-[330px]">
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
      <div className="flex items-end justify-center gap-1 sm:gap-6 lg:gap-10">

        {/* ============ PHONE — the sender ============ */}
        <motion.div
          animate={{ x: mousePos.x * -0.5, y: mousePos.y * -0.3, opacity: isResetting ? 0.6 : 1 }}
          transition={{ type: 'spring', stiffness: 150, damping: 20, opacity: { duration: 0.3 } }}
          className="relative z-10"
        >
          <PhoneDevice className="w-[105px] sm:w-[155px] lg:w-[175px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status={senderStatus} />

              {/* Chat area — sent message appears here after sending */}
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1 overflow-hidden">
                <AnimatePresence initial={false}>
                  {(showSentStatus || simState === 'received' || simState === 'complete') && (
                    <motion.div key="sent-msg" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}>
                      <MiniCard obj={item} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer — shows content ready to send, with send button */}
              <div className="border-t border-black/[0.08] dark:border-white/[0.1] px-[5px] sm:px-1.5 py-1">
                <AnimatePresence mode="wait">
                  {showComposer && (
                    <motion.div key="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1"
                    >
                      <div className="flex-1 rounded-[6px] bg-apple-parchment/80 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] px-[5px] sm:px-1.5 py-[3px] sm:py-1">
                        <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/60 dark:text-white/40 font-medium">
                          {transferKind === 'text' ? 'Meeting tomorrow…' : TRANSFER_ITEMS[transferKind].name}
                        </span>
                      </div>
                      {/* Send button — the visual affordance */}
                      <motion.button
                        type="button"
                        animate={isPressing ? { scale: 0.88 } : { scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-azure-600 flex items-center justify-center shadow-[0_1px_4px_rgba(10,102,240,0.3)]"
                      >
                        <Send className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" strokeWidth={3} />
                      </motion.button>
                    </motion.div>
                  )}

                  {showSendingStatus && (
                    <motion.div key="sending-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center justify-between px-[5px] sm:px-1.5 py-[3px]"
                    >
                      <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/60 dark:text-white/40 font-medium">
                        Sending… {simState === 'transferring' ? `${Math.round(progress)}%` : ''}
                      </span>
                    </motion.div>
                  )}

                  {showSentStatus && (
                    <motion.div key="sent-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center justify-between px-[5px] sm:px-1.5 py-[3px]"
                    >
                      <span className="text-[5px] sm:text-[6px] text-status-success font-medium">Sent ✓</span>
                    </motion.div>
                  )}

                  {simState === 'resetting' && (
                    <motion.div key="reset" initial={{ opacity: 0 }} animate={{ opacity: 0.3 }}
                      transition={{ duration: 0.2 }}
                      className="px-[5px] sm:px-1.5 py-[3px]"
                    >
                      <span className="text-[5px] sm:text-[6px] text-apple-ink-muted/40 font-medium">…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneDevice>
        </motion.div>

        {/* ============ LAPTOP — the receiver ============ */}
        <motion.div
          animate={{ x: mousePos.x * 0.3, y: mousePos.y * 0.2, opacity: isResetting ? 0.6 : 1 }}
          transition={{ type: 'spring', stiffness: 150, damping: 20, opacity: { duration: 0.3 } }}
          className="relative z-0"
        >
          <LaptopDevice className="w-[170px] sm:w-[290px] lg:w-[330px]">
            <div className="w-full h-full flex flex-col bg-white dark:bg-[#0a0a0c]">
              <MiniHeader status={receiverStatus} />

              {/* Content area — the main visual story */}
              <div className="flex-1 flex flex-col items-center justify-center px-2 overflow-hidden">
                <AnimatePresence mode="wait">

                  {/* IDLE / PRESSING — laptop waits */}
                  {(isIdle || isPressing) && (
                    <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/40 dark:text-white/25"
                    >
                      <Send className="w-3 h-3 sm:w-4 sm:h-4 opacity-30" />
                      <span className="text-[6px] sm:text-[7px] font-medium">Waiting for something…</span>
                    </motion.div>
                  )}

                  {/* SENDING — laptop starts to react */}
                  {simState === 'sending' && (
                    <motion.div key="connecting" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/50 dark:text-white/35"
                    >
                      <span className="text-[6px] sm:text-[7px] font-medium">Receiving…</span>
                    </motion.div>
                  )}

                  {/* TRANSFERRING — laptop shows content at partial opacity + progress */}
                  {simState === 'transferring' && (
                    <motion.div key="progress" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -3 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="w-full max-w-[160px] flex flex-col items-center gap-1.5"
                    >
                      <div className="w-full relative">
                        <div className="opacity-40"><MiniCard obj={item} /></div>
                        <div className="absolute bottom-0 left-0 right-0 px-1 pb-1"><MiniProgress progress={progress} /></div>
                      </div>
                      <span className="text-[5px] sm:text-[6px] font-medium text-apple-ink-muted flex items-center gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-apple-blue animate-pulse" /> Receiving…
                      </span>
                    </motion.div>
                  )}

                  {/* RECEIVING — content materializes */}
                  {simState === 'receiving' && (
                    <motion.div key="materialize" initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="w-full flex flex-col items-center gap-1"
                    >
                      <MiniCard obj={item} received />
                      <span className="text-[5px] sm:text-[6px] font-medium text-apple-ink-muted">Processing…</span>
                    </motion.div>
                  )}

                  {/* RECEIVED — content is confirmed + action button */}
                  {(simState === 'received' || simState === 'complete') && (
                    <motion.div key={`received-${transferKind}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="w-full flex flex-col items-center gap-1"
                    >
                      <MiniCard obj={item} received />
                      <span className="text-[5px] sm:text-[6px] font-medium text-status-success">✓ Received</span>
                      <AnimatePresence>
                        {simState === 'received' && (
                          <motion.div initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ delay: 0.15, duration: 0.15 }}>
                            <button type="button" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-azure-600/10 text-azure-600 text-[5px] sm:text-[6px] font-medium">
                              {transferKind === 'text' ? <><Copy className="w-1.5 h-1.5" /> Copy</> : <><Download className="w-1.5 h-1.5" /> Download</>}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* RESETTING — brief fade */}
                  {simState === 'resetting' && (
                    <motion.div key="reset-laptop" initial={{ opacity: 0.3 }} animate={{ opacity: 0 }}
                      transition={{ duration: 0.4 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/20 dark:text-white/15"
                    >
                      <span className="text-[6px] sm:text-[7px] font-medium">…</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopDevice>
        </motion.div>
      </div>
    </div>
  );
}
