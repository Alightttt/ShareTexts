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
  text:   { kind: 'text',   text: 'Hey, check this out 👇' },
  photo:  { kind: 'photo',  name: 'sunset-beach.jpg',  size: '4.2 MB' },
  video:  { kind: 'video',  name: 'holiday-clip.mp4',   size: '18.3 MB', duration: '00:18' },
  file:   { kind: 'file',   name: 'presentation.pdf',   size: '2.8 MB' },
};

const KIND_META: { kind: Kind; label: string; Icon: typeof ImageIcon }[] = [
  { kind: 'text',  label: 'Text',  Icon: Send },
  { kind: 'photo', label: 'Photo', Icon: ImageIcon },
  { kind: 'video', label: 'Video', Icon: Video },
  { kind: 'file',  label: 'File',  Icon: FileArchive },
];

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
// Timing
// ---------------------------------------------------------------------------
const T = {
  IDLE_HOLD:       400,
  PAIRING_HOLD:    500,
  CONNECTING_HOLD: 400,
  CONNECTED_HOLD:  900,
  PREPARING_HOLD:  250,
  FLIGHT_MS:       700,
  RECEIVED_HOLD:   1600,
  COMPLETE_HOLD:   500,
};

// ---------------------------------------------------------------------------
// Product-surface components — match real ChatView exactly
// ---------------------------------------------------------------------------

/** Connected status pill — no animation when idle, pulse only during active transfer */
function ConnectedPill() {
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-status-success/15 text-status-success">
      <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
      Connected
    </span>
  );
}

/** Status label — pulse only during active transfer, not when idle */
function StatusPill({ state }: { state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  if (state === 'connected') return <ConnectedPill />;
  const isActive = state === 'sending' || state === 'receiving';
  const map: Record<string, { dot: string; text: string; cls: string }> = {
    sending:   { dot: 'bg-apple-blue',  text: 'Sending…',   cls: 'text-apple-blue' },
    sent:      { dot: 'bg-status-success', text: 'Sent ✓',     cls: 'text-status-success' },
    receiving: { dot: 'bg-apple-blue',  text: 'Receiving…', cls: 'text-apple-blue' },
    received:  { dot: 'bg-status-success', text: 'Received ✓',  cls: 'text-status-success' },
  };
  const s = map[state];
  return (
    <span className={`flex items-center gap-1 text-[10px] sm:text-[11px] font-medium ${s.cls}`}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        s.dot,
        isActive && 'animate-pulse',
      )} />
      {s.text}
    </span>
  );
}

/** ShareText browser window — the product surface with quiet material depth */
function ProductWindow({
  title,
  status,
  children,
  className,
}: {
  title: string;
  status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'rounded-[14px] sm:rounded-[18px] overflow-hidden relative',
      'bg-white dark:bg-[#1a1a1e]',
      'border border-black/[0.08] dark:border-white/[0.1]',
      // Multi-layer shadow: tight contact shadow + soft ambient
      'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.05),0_12px_40px_rgba(0,0,0,0.03)]',
      'dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.25),0_12px_40px_rgba(0,0,0,0.15)]',
      className,
    )}>
      {/* Browser chrome — minimal, authentic */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-black/[0.06] dark:border-white/[0.08] bg-apple-parchment/50 dark:bg-white/[0.03]">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
        </div>
        {/* URL bar */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-[10px] sm:text-[11px] font-medium text-apple-ink-muted dark:text-white/50">
            <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            sharetexts.online
          </div>
        </div>
        <div className="w-12" /> {/* spacer to balance traffic lights */}
      </div>

      {/* ShareText app header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center gap-1.5">
          <ShareTextLogo size={14} className="text-apple-ink dark:text-white" />
          <span className="text-[11px] sm:text-[12px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
          <span className="flex items-center gap-0.5 ml-0.5">
            <Lock className="w-2.5 h-2.5 text-status-success" />
            <span className="text-[8px] sm:text-[9px] font-medium text-status-success">E2E</span>
          </span>
        </div>
        <StatusPill state={status} />
      </div>

      {/* Content */}
      <div className="relative">
        {children}
      </div>

      {/* Subtle screen reflection — one coherent light source from top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit]"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.015) 100%)',
        }}
      />
    </div>
  );
}

/** Text message bubble — matches real ChatView */
function TextBubble({ obj, sent }: { obj: TransferItem; sent?: boolean }) {
  return (
    <div className={cn(
      'rounded-[12px] px-3 py-2 shadow-sm max-w-[85%]',
      'text-[11px] sm:text-[12px] leading-snug whitespace-pre-wrap break-words',
      sent
        ? 'bg-azure-600 text-white rounded-tr-[3px] ml-auto'
        : 'bg-apple-parchment dark:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.08] text-apple-ink dark:text-white',
    )}>
      {obj.text}
    </div>
  );
}

/** Photo card */
function PhotoCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[12px] overflow-hidden',
      received && 'ring-2 ring-status-success/30',
    )}>
      <DemoPhoto className="w-full aspect-[16/10]" />
      <div className="px-2.5 py-2 flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[9px] sm:text-[10px] text-apple-ink-muted font-medium shrink-0">{obj.size}</span>
      </div>
    </div>
  );
}

/** Video card */
function VideoCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[12px] overflow-hidden',
      received && 'ring-2 ring-status-success/30',
    )}>
      <div className="relative w-full aspect-[16/10] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <DemoPhoto className="w-full h-full opacity-50" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/90 dark:bg-black/60 flex items-center justify-center shadow-lg">
            <div className="w-0 h-0 ml-0.5 border-l-[8px] border-l-apple-ink dark:border-l-white border-y-[5.5px] border-y-transparent" />
          </div>
        </div>
        <span className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-black/70 text-white">
          {obj.duration}
        </span>
      </div>
      <div className="px-2.5 py-2 flex items-center justify-between">
        <span className="text-[10px] sm:text-[11px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[9px] sm:text-[10px] text-apple-ink-muted font-medium shrink-0">{obj.size}</span>
      </div>
    </div>
  );
}

/** File card */
function FileCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-apple-parchment dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] rounded-[12px] px-3 py-2.5 flex items-center gap-2.5',
      received && 'ring-2 ring-status-success/30',
    )}>
      <span className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-[8px] bg-white dark:bg-white/[0.08] flex items-center justify-center border border-black/[0.04] dark:border-white/[0.06]">
        <FileTypeIcon name={obj.name || 'file.pdf'} size={18} />
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="text-[11px] sm:text-[12px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[9px] sm:text-[10px] text-apple-ink-muted font-medium">{obj.size}</span>
      </span>
    </div>
  );
}

/** Render the right card type */
function TransferCard({ obj, received }: { obj: TransferItem; received?: boolean }) {
  switch (obj.kind) {
    case 'text':  return <TextBubble obj={obj} sent={!received} />;
    case 'photo': return <PhotoCard obj={obj} received={received} />;
    case 'video': return <VideoCard obj={obj} received={received} />;
    case 'file':  return <FileCard obj={obj} received={received} />;
  }
}

/** Progress bar */
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full flex flex-col gap-1.5">
      <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.1] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-apple-blue origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress / 100 }}
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      </div>
      <span className="text-[10px] sm:text-[11px] font-medium text-apple-ink-muted text-center">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

/** Composer — simplified version of real composer */
function MiniComposer({
  selected,
  onSelect,
  onSend,
  disabled,
}: {
  selected: Kind;
  onSelect: (k: Kind) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div className="bg-apple-parchment/80 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-[12px] p-2 sm:p-2.5">
      {/* Selected preview */}
      <div className="rounded-[8px] bg-white dark:bg-white/[0.06] p-1.5 flex items-center gap-2 mb-2">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[6px] bg-azure-600/8 dark:bg-azure-400/10 flex items-center justify-center shrink-0">
          <span className="text-[9px] sm:text-[10px] font-semibold text-azure-600 dark:text-azure-400">
            {selected === 'text' && 'Hey…'}
            {selected === 'photo' && '📷'}
            {selected === 'video' && '🎬'}
            {selected === 'file' && '📄'}
          </span>
        </div>
        <span className="text-[10px] sm:text-[11px] font-medium text-apple-ink-muted dark:text-white/50 truncate">
          {selected === 'text' ? 'Text message' : TRANSFER_ITEMS[selected].name}
        </span>
      </div>
      {/* Type pills + send */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {KIND_META.map(({ kind, label, Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(kind)}
              className={cn(
                'flex items-center gap-0.5 px-2 py-1 rounded-full text-[9px] sm:text-[10px] font-medium transition-colors duration-150',
                selected === kind
                  ? 'bg-azure-600/10 text-azure-600 dark:bg-azure-400/15 dark:text-azure-400'
                  : 'text-apple-ink-muted/60 dark:text-white/40 hover:text-apple-ink dark:hover:text-white',
              )}
            >
              <Icon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className={cn(
            'w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-150 active:scale-90',
            !disabled
              ? 'bg-azure-600 text-white shadow-[0_2px_8px_rgba(10,102,240,0.3)]'
              : 'bg-black/[0.06] dark:bg-white/[0.1] text-apple-ink-muted/40',
          )}
        >
          <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HeroDemo
// ---------------------------------------------------------------------------
export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const [simState, setSimState] = useState<SimState>('idle');
  const [selectedKind, setSelectedKind] = useState<Kind>('text');
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

  // ---- State machine ----
  const runMachine = useCallback((startKind: Kind) => {
    clearTimers();
    setProgress(0);
    sceneRef.current = startKind;
    setTransferKind(startKind);

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
          setSimState('received');
          setProgress(100);
          schedule(() => {
            setSimState('complete');
            schedule(() => {
              setSimState('idle');
              setProgress(0);
              const next = nextKind(sceneRef.current);
              sceneRef.current = next;
              setSelectedKind(next);
              runMachine(next);
            }, T.COMPLETE_HOLD);
          }, T.RECEIVED_HOLD);
        }, T.FLIGHT_MS);
      }, T.PREPARING_HOLD);
    }, T.IDLE_HOLD + T.PAIRING_HOLD + T.CONNECTING_HOLD + T.CONNECTED_HOLD);
  }, [clearTimers, schedule]);

  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(sceneRef.current);

  // Auto-play
  useEffect(() => {
    const t = setTimeout(() => runMachine('text'), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause when off-screen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        clearTimers();
      } else if (simStateRef.current === 'idle' && !hoverRef.current) {
        runMachineRef.current();
      }
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [clearTimers]);

  // Hover-to-pause
  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;
    hoverTimerRef.current = setTimeout(() => {
      if (hoverRef.current) clearTimers();
    }, 300);
  }, [clearTimers]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = false;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (simStateRef.current === 'idle') runMachineRef.current();
  }, []);

  // User interaction
  const handleSelectKind = useCallback((k: Kind) => {
    setSelectedKind(k);
    if (simState === 'idle' || simState === 'complete') {
      clearTimers();
      setSimState('idle');
      setProgress(0);
      schedule(() => runMachine(k), 200);
    }
  }, [simState, clearTimers, schedule, runMachine]);

  const handleSend = useCallback(() => {
    if (simState !== 'connected' && simState !== 'idle' && simState !== 'complete') return;
    clearTimers();
    setTransferKind(selectedKind);
    setProgress(0);
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
        setSimState('received');
        setProgress(100);
        schedule(() => {
          setSimState('complete');
          schedule(() => {
            setSimState('idle');
            setProgress(0);
            const next = nextKind(selectedKind);
            sceneRef.current = next;
            setSelectedKind(next);
            schedule(() => runMachine(next), 300);
          }, T.COMPLETE_HOLD);
        }, T.RECEIVED_HOLD);
      }, T.FLIGHT_MS);
    }, T.PREPARING_HOLD);
  }, [simState, selectedKind, clearTimers, schedule, runMachine]);

  // Derived states
  const isSending = simState === 'preparing' || simState === 'transferring';
  const isReceiving = simState === 'transferring' || simState === 'received';
  const isDone = simState === 'received' || simState === 'complete';
  const showComposer = simState === 'connected' || simState === 'idle' || simState === 'complete';
  const canUserSend = simState === 'connected' || simState === 'idle' || simState === 'complete';

  const senderStatus: 'connected' | 'sending' | 'sent' = isSending ? 'sending' : isDone ? 'sent' : 'connected';
  const receiverStatus: 'connected' | 'receiving' | 'received' = isReceiving ? (isDone ? 'received' : 'receiving') : 'connected';

  const item = TRANSFER_ITEMS[transferKind];

  // ---- Reduced motion ----
  if (reduced) {
    return (
      <div
        ref={containerRef}
        data-testid="hero-demo"
        role="img"
        aria-label="ShareText preview: transfer text, photos, videos and files between two devices"
        className="relative w-full max-w-[800px] mx-auto select-none"
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          <ProductWindow title="Sender" status="sent" className="flex-1">
            <div className="px-3 sm:px-4 py-3 sm:py-4 min-h-[180px] sm:min-h-[220px] flex flex-col justify-end">
              <div className="flex flex-col gap-2">
                <TransferCard obj={item} />
              </div>
            </div>
          </ProductWindow>
          <ProductWindow title="Receiver" status="received" className="flex-1">
            <div className="px-3 sm:px-4 py-3 sm:py-4 min-h-[180px] sm:min-h-[220px] flex flex-col items-center justify-center">
              <TransferCard obj={item} received />
            </div>
          </ProductWindow>
        </div>
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => runMachine(sceneRef.current)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-azure-600/10 text-azure-600 text-[12px] font-medium hover:bg-azure-600/15 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            Play preview
          </button>
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
      aria-label={`Interactive preview: ShareText transfers content between devices. Click Send to try.`}
      className="relative w-full max-w-[800px] mx-auto select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
        {/* ============ SENDER — slightly elevated (source) ============ */}
        <ProductWindow title="Sender" status={senderStatus} className="flex-1 min-w-0 sm:translate-y-0">
          <div className="px-3 sm:px-4 py-3 sm:py-4 min-h-[200px] sm:min-h-[260px] flex flex-col">
            {/* Chat area */}
            <div className="flex-1 flex flex-col justify-end gap-2 mb-3">
              <AnimatePresence initial={false}>
                {isDone && (
                  <motion.div
                    key="sent-msg"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                  >
                    <TransferCard obj={item} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Composer or status */}
            <AnimatePresence mode="wait">
              {showComposer ? (
                <motion.div
                  key="composer"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <MiniComposer
                    selected={selectedKind}
                    onSelect={handleSelectKind}
                    onSend={handleSend}
                    disabled={!canUserSend}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="sending-status"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="bg-apple-parchment/80 dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-[12px] px-3 py-2.5 flex items-center justify-between"
                >
                  <span className="text-[10px] sm:text-[11px] text-apple-ink-muted/70 dark:text-white/40 font-medium">
                    {simState === 'preparing' ? 'Preparing…' :
                     simState === 'transferring' ? 'Sending…' :
                     simState === 'received' ? 'Sent ✓' : 'Connecting…'}
                  </span>
                  <Send className="w-3 h-3 text-azure-600/40" strokeWidth={2.5} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ProductWindow>

        {/* ============ RECEIVER — slightly recessed (destination) ============ */}
        <ProductWindow title="Receiver" status={receiverStatus} className="flex-1 min-w-0 sm:translate-y-1">
          <div className="px-3 sm:px-4 py-3 sm:py-4 min-h-[200px] sm:min-h-[260px] flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              {/* Pairing code */}
              {simState === 'pairing' && (
                <motion.div
                  key="pairing"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="flex flex-col items-center gap-3"
                >
                  <span className="text-[11px] sm:text-[12px] font-medium text-apple-ink dark:text-white">Enter pairing code</span>
                  <div className="flex gap-1.5">
                    {['8', '4', '7', '2', '9', '1'].map((d, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="w-7 h-9 sm:w-8 sm:h-10 rounded-[5px] bg-apple-parchment dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-[14px] sm:text-[16px] font-mono font-bold text-apple-ink dark:text-white"
                      >
                        {d}
                      </motion.span>
                    ))}
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-apple-ink-muted/50 font-medium">Code expires in 5:00</span>
                </motion.div>
              )}

              {/* Transferring — progress */}
              {simState === 'transferring' && !isDone && (
                <motion.div
                  key="progress"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-[200px] flex flex-col items-center gap-2"
                >
                  <ProgressBar progress={progress} />
                  <span className="text-[10px] sm:text-[11px] font-medium text-apple-ink-muted flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-apple-blue animate-pulse" />
                    Receiving…
                  </span>
                </motion.div>
              )}

              {/* Received */}
              {isDone && (
                <motion.div
                  key={`received-${transferKind}`}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="w-full flex flex-col items-center gap-2"
                >
                  <TransferCard obj={item} received />

                  {/* Received badge + action */}
                  <div className="flex items-center gap-2">
                    <StatusPill state="received" />
                    <span className="text-[9px] sm:text-[10px] text-apple-ink-muted/60 font-medium">
                      {transferKind === 'text' ? 'Text message' : `${item.name} · ${item.size}`}
                    </span>
                  </div>

                  <AnimatePresence>
                    {simState === 'received' && transferKind !== 'text' && (
                      <motion.div
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 0.25, duration: 0.2 }}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-azure-600/10 text-azure-600 text-[10px] sm:text-[11px] font-medium"
                        >
                          <Download className="w-3 h-3" />
                          Download
                        </button>
                      </motion.div>
                    )}
                    {simState === 'received' && transferKind === 'text' && (
                      <motion.div
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: 0.25, duration: 0.2 }}
                      >
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-azure-600/10 text-azure-600 text-[10px] sm:text-[11px] font-medium"
                        >
                          <Copy className="w-3 h-3" />
                          Copy
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Waiting */}
              {!isSending && !isReceiving && !isDone && simState !== 'pairing' && (
                <motion.div
                  key="waiting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center gap-1.5 text-apple-ink-muted/50 dark:text-white/30"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 opacity-40" />
                  <span className="text-[11px] sm:text-[12px] font-medium">Waiting for something…</span>
                  <span className="text-[9px] sm:text-[10px]">It will appear here</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </ProductWindow>
      </div>
    </div>
  );
}
