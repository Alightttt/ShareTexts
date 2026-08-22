import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon, FileArchive, Send, Video,
  Download, Copy, Lock, ArrowRight,
} from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { PhoneFrame, LaptopFrame, DeviceLabel } from './DeviceFrames';
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
  { kind: 'text',  label: 'Text',  Icon: ArrowRight },
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
  | 'idle'        // Devices visible, no connection
  | 'pairing'     // Pairing code appears
  | 'connecting'  // Beam draws
  | 'connected'   // Green pill, composer active
  | 'preparing'   // Item rising from composer
  | 'transferring' // Card flying A → B
  | 'received'    // Card on B, "Received" badge
  | 'complete';   // Brief hold → reset

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
const T = {
  IDLE_HOLD:       350,
  PAIRING_HOLD:    350,
  CONNECTING_HOLD: 350,
  CONNECTED_HOLD:  800,   // pause before auto-send
  PREPARING_HOLD:  200,
  FLIGHT_MS:       650,
  RECEIVED_HOLD:   1400,
  COMPLETE_HOLD:   450,
  RESET_DELAY:     200,
};

// ---------------------------------------------------------------------------
// Mini-components that match real ChatView visual language
// ---------------------------------------------------------------------------

/** Green connected pill — exact ChatView style */
function ConnectedPill() {
  return (
    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[5.5px] sm:text-[6.5px] font-semibold bg-status-success/15 text-status-success">
      <span className="w-1 h-1 rounded-full bg-status-success animate-pulse" />
      Connected
    </span>
  );
}

/** Status label for phone (sending / sent) and laptop (receiving / received) */
function DeviceStatus({ state }: { state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  if (state === 'connected') return <ConnectedPill />;
  const map: Record<string, { dot: string; text: string; cls: string }> = {
    sending:   { dot: 'bg-apple-blue animate-pulse',  text: 'Sending…',   cls: 'text-apple-blue' },
    sent:      { dot: 'bg-status-success',             text: 'Sent',        cls: 'text-status-success' },
    receiving: { dot: 'bg-apple-blue animate-pulse',  text: 'Receiving…', cls: 'text-apple-blue' },
    received:  { dot: 'bg-status-success',             text: 'Received',    cls: 'text-status-success' },
  };
  const s = map[state];
  return (
    <span className={`flex items-center gap-1 text-[5.5px] sm:text-[6.5px] font-medium ${s.cls}`}>
      <span className={`w-1 h-1 rounded-full ${s.dot}`} />
      {s.text}
    </span>
  );
}

/** Room header — transparent background so device screen shows through */
function RoomHeader({ status, label, showEncryption }: { status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received'; label: string; showEncryption?: boolean }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-[9px] sm:px-3 pt-[16%] sm:pt-[13%] pb-[7px] sm:pb-2 border-b border-black/[0.06] dark:border-white/[0.08]">
      <div className="flex items-center gap-1">
        <ShareTextLogo size={12} className="text-apple-ink dark:text-white" />
        <span className="text-[7px] sm:text-[8.5px] font-semibold tracking-tight text-apple-ink dark:text-white">{label}</span>
        {showEncryption && (
          <span className="flex items-center gap-0.5 ml-0.5">
            <Lock className="w-[6px] h-[6px] sm:w-[7px] sm:h-[7px] text-status-success" />
            <span className="text-[4.5px] sm:text-[5px] font-medium text-status-success">E2E</span>
          </span>
        )}
      </div>
      <DeviceStatus state={status} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubbles — match real ChatView styling
// ---------------------------------------------------------------------------

function TextBubble({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'rounded-[10px] px-2 py-1.5 shadow-sm',
      'text-[7px] sm:text-[8px] leading-snug whitespace-pre-wrap break-words line-clamp-4',
      received
        ? 'bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] text-apple-ink dark:text-white'
        : 'bg-azure-600 text-white rounded-tr-[3px]',
    )}>
      {obj.text}
    </div>
  );
}

function PhotoBubble({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[10px] overflow-hidden shadow-card',
      received && 'ring-2 ring-status-success/30',
    )}>
      <DemoPhoto className="w-full aspect-[4/3]" />
      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
        <span className="text-[6px] sm:text-[7px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted font-medium shrink-0">{obj.size}</span>
      </div>
    </div>
  );
}

function VideoBubble({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[10px] overflow-hidden shadow-card',
      received && 'ring-2 ring-status-success/30',
    )}>
      <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
        <DemoPhoto className="w-full h-full opacity-60" />
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/90 dark:bg-black/70 flex items-center justify-center shadow-lg">
            <div className="w-0 h-0 ml-0.5 border-l-[7px] border-l-apple-ink dark:border-l-white border-y-[5px] border-y-transparent" />
          </div>
        </div>
        {/* Duration badge */}
        <span className="absolute bottom-1 right-1.5 px-1 py-0.5 rounded text-[5px] sm:text-[5.5px] font-bold bg-black/70 text-white">
          {obj.duration}
        </span>
      </div>
      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
        <span className="text-[6px] sm:text-[7px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted font-medium shrink-0">{obj.size}</span>
      </div>
    </div>
  );
}

function FileBubble({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[10px] shadow-card px-2 py-1.5 flex items-center gap-1.5',
      received && 'ring-2 ring-status-success/30',
    )}>
      <span className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-[7px] flex items-center justify-center">
        <FileTypeIcon name={obj.name || 'file.pdf'} size={14} />
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="text-[6.5px] sm:text-[7.5px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted font-medium">{obj.size}</span>
      </span>
    </div>
  );
}

function TransferBubble({ obj, received }: { obj: TransferItem; received?: boolean }) {
  switch (obj.kind) {
    case 'text':  return <TextBubble obj={obj} received={received} />;
    case 'photo': return <PhotoBubble obj={obj} received={received} />;
    case 'video': return <VideoBubble obj={obj} received={received} />;
    case 'file':  return <FileBubble obj={obj} received={received} />;
  }
}

// ---------------------------------------------------------------------------
// Progress bar (matching real ChatView)
// ---------------------------------------------------------------------------
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full flex flex-col gap-1">
      <div className="w-full h-1 rounded-full bg-black/[0.08] dark:bg-white/[0.12] overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-apple-blue origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: progress / 100 }}
          transition={{ duration: 0.1, ease: 'linear' }}
        />
      </div>
      <span className="text-[5.5px] sm:text-[6.5px] font-medium text-apple-ink-muted text-center">
        {Math.round(progress)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroComposer — mini version of real composer
// ---------------------------------------------------------------------------
function HeroComposer({
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
    <div className="bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[12px] sm:rounded-[14px] shadow-card p-[6px] sm:p-2 flex flex-col gap-1.5">
      {/* Selected preview */}
      <div className="rounded-[9px] bg-apple-parchment dark:bg-white/[0.06] p-1 flex items-center gap-1.5">
        <div className="w-[52px] sm:w-[64px] h-[36px] sm:h-[44px] rounded-[7px] bg-apple-blue/8 dark:bg-apple-blue/12 flex items-center justify-center">
          <span className="text-[6px] sm:text-[7px] font-semibold text-apple-blue">
            {selected === 'text' && 'Hey, check…'}
            {selected === 'photo' && '📷 Sunset'}
            {selected === 'video' && '🎬 00:18'}
            {selected === 'file' && '📄 PDF'}
          </span>
        </div>
        <span className="text-[6px] sm:text-[7px] font-medium text-apple-ink-muted">
          {TRANSFER_ITEMS[selected].name || 'Text message'}
        </span>
      </div>
      {/* Type selector */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {KIND_META.map(({ kind, label, Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(kind)}
              className={cn(
                'flex items-center gap-0.5 px-1.5 py-[3px] rounded-full text-[6px] sm:text-[6.5px] font-medium transition-colors',
                selected === kind
                  ? 'bg-apple-blue/12 text-apple-blue'
                  : 'bg-apple-parchment dark:bg-white/[0.06] text-apple-ink-muted hover:text-apple-ink dark:hover:text-white',
              )}
            >
              <Icon className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={disabled}
          className={cn(
            'w-[24px] h-[24px] rounded-full flex items-center justify-center transition-motion active:scale-90',
            !disabled
              ? 'bg-apple-blue text-white shadow-[0_2px_6px_rgba(0,102,204,0.45)]'
              : 'bg-black/[0.08] dark:bg-white/[0.12] text-apple-ink-muted/60 cursor-default',
          )}
        >
          <Send className="w-[9px] h-[9px]" strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content type selector tabs (below the hero devices)
// ---------------------------------------------------------------------------
function ContentTypeSelector({
  selected,
  onSelect,
}: {
  selected: Kind;
  onSelect: (k: Kind) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-4">
      {KIND_META.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onSelect(kind)}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] sm:text-[12px] font-medium transition-motion',
            selected === kind
              ? 'bg-apple-blue/12 text-apple-blue ring-1 ring-apple-blue/25'
              : 'bg-apple-parchment dark:bg-white/[0.06] text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white',
          )}
        >
          <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main HeroDemo
// ---------------------------------------------------------------------------
export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const laptopTargetRef = useRef<HTMLDivElement>(null);

  const [isVisible, setIsVisible] = useState(true);

  // Bridge measurements
  const [bridge, setBridge] = useState({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    flyFrom: { x: 0, y: 0 },
    flyTo: { x: 0, y: 0 },
    beam: { left: 0, width: 0, top: 0, vertical: false, height: 0 },
    nodePos: { x: 0, y: 0 },
  });

  // State machine
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

  // ---- Measurement ----
  const lastMeasure = useRef('');
  const measure = useCallback(() => {
    const container = containerRef.current;
    const phone = phoneScreenRef.current;
    const laptop = laptopScreenRef.current;
    if (!container || !phone || !laptop) return;
    const c = container.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const l = laptop.getBoundingClientRect();
    const vertical = p.bottom <= l.top + 10;
    const fromX = p.left - c.left + p.width / 2;
    const fromY = p.top - c.top + p.height / 2;
    const toX = l.left - c.left + l.width / 2;
    const toY = l.top - c.top + l.height / 2;

    const comp = composerRef.current?.getBoundingClientRect();
    const target = laptopTargetRef.current?.getBoundingClientRect();
    const flyFrom = comp
      ? { x: comp.left - c.left + comp.width / 2, y: comp.top - c.top + comp.height / 2 }
      : { x: fromX, y: fromY };
    const flyTo = target
      ? { x: target.left - c.left + target.width / 2, y: target.top - c.top + target.height * 0.38 }
      : { x: toX, y: toY };

    let beam;
    let nodePos;
    if (vertical) {
      const top = p.bottom - c.top;
      const height = Math.max(0, l.top - c.top - top);
      beam = { left: fromX, width: 0, top, vertical: true, height };
      nodePos = { x: fromX, y: top + height / 2 };
    } else {
      const left = p.left - c.left + p.width - 8;
      const width = Math.max(0, l.left - c.left - left + 16);
      beam = { left, width, top: fromY, vertical: false, height: 0 };
      nodePos = { x: (p.left - c.left + p.width + l.left - c.left) / 2, y: fromY };
    }

    const sig = JSON.stringify({ from: { x: fromX, y: fromY }, to: { x: toX, y: toY }, flyFrom, flyTo, beam, nodePos });
    if (sig === lastMeasure.current) return;
    lastMeasure.current = sig;
    setBridge(JSON.parse(sig));
  }, []);

  useEffect(() => {
    measure();
    const timers = [80, 250, 600, 1200].map(ms => setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(() => measure());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      timers.forEach(clearTimeout);
      ro.disconnect();
    };
  }, [measure]);

  useEffect(() => { measure(); }, [selectedKind, measure]);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // ---- State machine runner ----
  const runMachine = useCallback((startKind: Kind) => {
    clearTimers();
    setProgress(0);
    sceneRef.current = startKind;
    setTransferKind(startKind);

    // IDLE → PAIRING
    setSimState('idle');
    schedule(() => setSimState('pairing'), T.IDLE_HOLD);

    // PAIRING → CONNECTING
    schedule(() => setSimState('connecting'), T.IDLE_HOLD + T.PAIRING_HOLD);

    // CONNECTING → CONNECTED
    schedule(() => setSimState('connected'), T.IDLE_HOLD + T.PAIRING_HOLD + T.CONNECTING_HOLD);

    // CONNECTED → PREPARING (auto-send)
    schedule(() => {
      setSimState('preparing');
      // PREPARING → TRANSFERRING
      schedule(() => {
        setSimState('transferring');
        // Progress bar simulation
        const flightStart = Date.now();
        const tick = () => {
          const elapsed = Date.now() - flightStart;
          const p = Math.min(100, (elapsed / T.FLIGHT_MS) * 100);
          setProgress(p);
          if (p < 100) schedule(tick, 30);
        };
        schedule(tick, 30);

        // TRANSFERRING → RECEIVED
        schedule(() => {
          setSimState('received');
          setProgress(100);
          // RECEIVED → COMPLETE
          schedule(() => {
            setSimState('complete');
            // COMPLETE → reset
            schedule(() => {
              setSimState('idle');
              setProgress(0);
              // Next scene
              const next = nextKind(sceneRef.current);
              sceneRef.current = next;
              setSelectedKind(next);
              // Restart cycle
              runMachine(next);
            }, T.COMPLETE_HOLD);
          }, T.RECEIVED_HOLD);
        }, T.FLIGHT_MS);
      }, T.PREPARING_HOLD);
    }, T.IDLE_HOLD + T.PAIRING_HOLD + T.CONNECTING_HOLD + T.CONNECTED_HOLD);
  }, [clearTimers, schedule]);

  // Sync refs so IntersectionObserver and user handlers can read latest values
  // without depending on them in effect/callback dependency arrays.
  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(sceneRef.current);

  // Start auto-play on mount
  useEffect(() => {
    const t = setTimeout(() => runMachine('text'), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause when off-screen — uses refs to avoid re-creating the observer on
  // every state transition (which would disconnect/reconnect and kill timers).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      const visible = entry.isIntersecting;
      setIsVisible(visible);
      if (!visible) {
        clearTimers();
      } else if (simStateRef.current === 'idle' && !hoverRef.current) {
        // Restart when visible again
        runMachineRef.current();
      }
    }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, [clearTimers]);

  // Hover-to-pause: pause auto-play 250ms after mouse enters, resume on leave.
  const handleMouseEnter = useCallback(() => {
    hoverRef.current = true;
    hoverTimerRef.current = setTimeout(() => {
      if (hoverRef.current) clearTimers();
    }, 250);
  }, [clearTimers]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = false;
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Resume from idle if we were paused
    if (simStateRef.current === 'idle') {
      runMachineRef.current();
    }
  }, []);

  // ---- User interaction: select content type ----
  const handleSelectKind = useCallback((k: Kind) => {
    setSelectedKind(k);
    if (simState === 'idle' || simState === 'complete') {
      clearTimers();
      setSimState('idle');
      setProgress(0);
      schedule(() => runMachine(k), 200);
    }
  }, [simState, clearTimers, schedule, runMachine]);

  // ---- User interaction: send ----
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
        if (p < 100) schedule(tick, 30);
      };
      schedule(tick, 30);
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

  // ---- Derived states ----
  const isFlying = simState === 'transferring';
  const isReceiving = simState === 'transferring' || simState === 'received';
  const isReceived = simState === 'received' || simState === 'complete';
  const showComposer = simState === 'connected' || simState === 'idle' || simState === 'complete';
  const showSendProgress = simState === 'transferring';
  const showReceived = isReceived;
  const canUserSend = simState === 'connected' || simState === 'idle' || simState === 'complete';

  const phoneStatus: 'connected' | 'sending' | 'sent' = isFlying || simState === 'preparing'
    ? 'sending' : isReceived ? 'sent' : 'connected';
  const laptopStatus: 'connected' | 'receiving' | 'received' = isReceiving
    ? (isReceived ? 'received' : 'receiving') : 'connected';

  const item = TRANSFER_ITEMS[transferKind];

  const phaseLabel =
    simState === 'idle' ? 'Demo starting' :
    simState === 'pairing' ? 'Pairing' :
    simState === 'connecting' ? 'Connecting' :
    simState === 'connected' ? 'Connected' :
    simState === 'preparing' ? 'Preparing' :
    simState === 'transferring' ? 'Transferring' :
    simState === 'received' ? 'Received' :
    'Complete';

  const dx = bridge.flyTo.x - bridge.flyFrom.x;
  const dy = bridge.flyTo.y - bridge.flyFrom.y;

  // ---- Reduced motion: static 3-panel ----
  if (reduced) {
    return (
      <div
        ref={containerRef}
        data-testid="hero-demo"
        role="img"
        aria-label="ShareText preview: transfer text, photos, videos and files between two devices"
        className="relative w-full max-w-[920px] mx-auto select-none min-h-[400px] sm:min-h-[480px] lg:min-h-[520px]"
      >
        <div className="flex flex-col sm:flex-row items-center sm:justify-center gap-4 sm:gap-12 px-4">
          {/* Phone — sent */}
          <div className="flex flex-col items-center">
            <PhoneFrame className="w-[160px] sm:w-[170px] lg:w-[190px]">
              <div className="w-full h-full flex flex-col">
                <RoomHeader status="sent" label="Your phone" />
                <div className="flex-1 flex flex-col justify-end gap-[5px] px-[7px] sm:px-2.5 pb-1.5">
                  <div className="self-end max-w-[88%]">
                    <TextBubble obj={TRANSFER_ITEMS.text} />
                  </div>
                </div>
              </div>
            </PhoneFrame>
            <DeviceLabel>Your phone</DeviceLabel>
          </div>

          {/* Center connection */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-white/90 dark:bg-white/[0.08] border border-apple-divider/60 dark:border-apple-tile-3/60 flex items-center justify-center shadow-xs">
              <ShareTextLogo size={20} className="text-apple-blue" />
            </div>
            <span className="text-[10px] font-medium text-apple-ink-muted dark:text-white/50">Connected</span>
          </div>

          {/* Laptop — received */}
          <div className="flex flex-col items-center">
            <LaptopFrame className="w-[280px] sm:w-[340px] lg:w-[380px]">
              <div className="w-full h-full flex flex-col">
                <RoomHeader status="received" label="Your laptop" />
                <div className="flex-1 flex flex-col items-center justify-center px-3">
                  <div className="w-full max-w-[180px] sm:max-w-[220px]">
                    <TransferBubble obj={TRANSFER_ITEMS.text} received />
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <DeviceStatus state="received" />
                    <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted/70 font-medium">Text message</span>
                  </div>
                </div>
              </div>
            </LaptopFrame>
            <DeviceLabel>Your laptop</DeviceLabel>
          </div>
        </div>

        {/* Manual play button for reduced-motion users */}
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => runMachine(sceneRef.current)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-apple-blue/10 text-apple-blue text-[12px] font-medium hover:bg-apple-blue/15 transition-motion"
          >
            <Send className="w-3.5 h-3.5" />
            Play preview
          </button>
        </div>

        <ContentTypeSelector selected={selectedKind} onSelect={handleSelectKind} />
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
      aria-label={`Interactive preview: ShareText transfers content between devices. ${phaseLabel}. Click Send to try.`}
      className="relative w-full max-w-[920px] mx-auto select-none min-h-[400px] sm:min-h-[480px] lg:min-h-[520px]"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Connection beam */}
      {(bridge.beam.height > 0 || bridge.beam.width > 0) && simState !== 'idle' && (
        <div
          className="absolute hidden sm:block z-0"
          style={bridge.beam.vertical
            ? { left: bridge.beam.left, top: bridge.beam.top, height: bridge.beam.height, width: 0, transform: 'translateX(-50%)' }
            : { left: bridge.beam.left, width: bridge.beam.width, top: bridge.beam.top, transform: 'translateY(-50%)' }
          }
        >
          <div className={bridge.beam.vertical
            ? "w-px h-full bg-black/[0.08] dark:bg-white/[0.12]"
            : "h-px w-full bg-black/[0.08] dark:bg-white/[0.12]"
          } />
          <AnimatePresence>
            {(simState === 'connecting' || simState === 'connected' || simState === 'preparing' || simState === 'transferring') && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className={cn(
                  "absolute left-0 rounded-full bg-apple-blue",
                  bridge.beam.vertical
                    ? "top-0 animate-beam-v w-[7px] h-[7px] shadow-[0_0_6px_rgba(10,102,240,0.5)]"
                    : "top-1/2 animate-beam h-[7px] w-[7px] shadow-[0_0_6px_rgba(10,102,240,0.5)]",
                )}
                style={{ ['--travel' as string]: `${bridge.beam.vertical ? bridge.beam.height : bridge.beam.width}px` }}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Center node */}
      <div
        className="absolute w-8 h-8 rounded-full shadow-xs flex items-center justify-center bg-white/90 dark:bg-white/[0.08] border border-apple-divider/60 dark:border-apple-tile-3/60 z-10 hidden sm:flex"
        style={{
          left: bridge.nodePos.x,
          top: bridge.nodePos.y,
          transform: 'translate(-50%, -50%)',
          opacity: bridge.nodePos.x || bridge.nodePos.y ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      >
        <ShareTextLogo size={18} className="text-apple-blue" />
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:justify-center gap-0 sm:gap-14 px-2 sm:px-6 relative z-10">
        {/* ================= PHONE — the sender ================= */}
        <div data-device="phone" className="flex flex-col items-center">
          <PhoneFrame className="w-[160px] sm:w-[170px] lg:w-[190px]">
            <div ref={phoneScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={phoneStatus} label="Your phone" showEncryption={simState !== 'idle' && simState !== 'pairing'} />

              {/* Chat messages area */}
              <div className="flex-1 flex flex-col justify-end gap-[5px] px-[7px] sm:px-2.5 pb-1.5 overflow-hidden">
                <AnimatePresence initial={false}>
                  {/* Sent messages appear here after receive cycle */}
                  {isReceived && (
                    <motion.div
                      key="sent-msg"
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="self-end max-w-[88%]"
                    >
                      <TransferBubble obj={item} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer area */}
              <div ref={composerRef} className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  {showComposer ? (
                    <motion.div
                      key="composer"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
                      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      <HeroComposer
                        selected={selectedKind}
                        onSelect={handleSelectKind}
                        onSend={handleSend}
                        disabled={!canUserSend}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="sending-state"
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[12px] sm:rounded-[14px] shadow-card px-2.5 py-2 flex items-center justify-between"
                    >
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted/70 font-medium">
                        {simState === 'preparing' ? 'Preparing…' :
                         simState === 'transferring' ? 'Sending…' :
                         simState === 'received' ? 'Sent ✓' : 'Connecting…'}
                      </span>
                      <Send className="w-[8px] h-[8px] text-apple-blue/50" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneFrame>
          <DeviceLabel>Your phone</DeviceLabel>
        </div>

        {/* Mobile bridge */}
        <div className="sm:hidden flex flex-col items-center -my-0.5 relative z-10">
          <div className="w-px h-6 bg-black/[0.08] dark:bg-white/[0.12]" />
          <div className="w-5 h-5 rounded-full bg-white/90 dark:bg-white/[0.08] border border-apple-divider/50 dark:border-apple-tile-3/50 flex items-center justify-center shadow-xs z-10">
            <ShareTextLogo size={10} className="text-apple-blue" />
          </div>
          <div className="w-px h-6 bg-black/[0.08] dark:bg-white/[0.12]" />
          {/* Traveling dot during flight */}
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[4px] h-[4px] rounded-full bg-apple-blue shadow-[0_0_4px_rgba(10,102,240,0.4)]"
            animate={isFlying ? { y: [0, 56], opacity: [0, 1, 1, 0] } : { y: 0, opacity: 0 }}
            transition={{ duration: T.FLIGHT_MS / 1000, ease: [0.42, 0, 0.2, 1] }}
          />
        </div>

        {/* ================= LAPTOP — the receiver ================= */}
        <div data-device="laptop" className="flex flex-col items-center">
          <LaptopFrame className="w-[280px] sm:w-[340px] lg:w-[380px]">
            <div ref={laptopScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={laptopStatus} label="Your laptop" showEncryption={simState !== 'idle' && simState !== 'pairing'} />

              {/* Content area */}
              <div ref={laptopTargetRef} className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                <AnimatePresence mode="wait">
                  {/* Transferring — progress bar */}
                  {showSendProgress && !showReceived && (
                    <motion.div
                      key="receiving-progress"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col items-center gap-2 w-full max-w-[160px]"
                    >
                      <ProgressBar progress={progress} />
                      <span className="text-[6.5px] sm:text-[8px] font-medium text-apple-ink-muted flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-apple-blue animate-pulse" />
                        Receiving…
                      </span>
                    </motion.div>
                  )}

                  {/* Received — show the transferred item */}
                  {showReceived && (
                    <motion.div
                      key={`received-${transferKind}`}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                      className="flex flex-col items-center gap-1.5 sm:gap-2 relative w-full"
                    >
                      {/* Completion ring pulse */}
                      <motion.span
                        initial={{ scale: 0.92, opacity: 0.35 }}
                        animate={{ scale: 1.08, opacity: 0 }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="absolute -inset-2 rounded-[18px] border-2 border-status-success/40 pointer-events-none"
                        aria-hidden
                      />

                      {transferKind === 'text' ? (
                        <div className="bg-white/90 dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] rounded-[12px] sm:rounded-[14px] shadow-card p-2.5 sm:p-3 w-full max-w-[200px] sm:max-w-[240px] ring-2 ring-status-success/30">
                          <p className="text-[8px] sm:text-[9px] leading-snug text-apple-ink dark:text-white whitespace-pre-wrap break-words line-clamp-5">
                            {item.text}
                          </p>
                        </div>
                      ) : (
                        <TransferBubble obj={item} received />
                      )}

                      {/* Received badge + action buttons */}
                      <div className="flex items-center gap-1.5 max-w-full">
                        <DeviceStatus state="received" />
                        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted/70 font-medium truncate">
                          {transferKind === 'text' ? 'Text message' : `${item.name || ''}${item.size ? ` · ${item.size}` : ''}`}
                        </span>
                      </div>

                      {/* Action buttons — appear after received */}
                      <AnimatePresence>
                        {simState === 'received' && transferKind !== 'text' && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.3, duration: 0.2 }}
                            className="flex items-center gap-1.5"
                          >
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2 py-1 rounded-full bg-apple-blue/10 text-apple-blue text-[6px] sm:text-[7px] font-medium"
                            >
                              <Download className="w-2.5 h-2.5" />
                              Download
                            </button>
                          </motion.div>
                        )}
                        {simState === 'received' && transferKind === 'text' && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ delay: 0.3, duration: 0.2 }}
                            className="flex items-center gap-1.5"
                          >
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2 py-1 rounded-full bg-apple-blue/10 text-apple-blue text-[6px] sm:text-[7px] font-medium"
                            >
                              <Copy className="w-2.5 h-2.5" />
                              Copy
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {/* Pairing — show code on laptop */}
                  {simState === 'pairing' && (
                    <motion.div
                      key="pairing"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <span className="text-[7px] sm:text-[8px] font-medium text-apple-ink dark:text-white">Enter pairing code</span>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5, 6].map((d, i) => (
                          <motion.span
                            key={d}
                            initial={{ opacity: 0, y: 3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.045, duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="w-5 h-6 sm:w-6 sm:h-7 rounded-[4px] bg-apple-parchment dark:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.1] flex items-center justify-center text-[10px] sm:text-[12px] font-mono font-bold text-apple-ink dark:text-white"
                          >
                            {"847291"[i]}
                          </motion.span>
                        ))}
                      </div>
                      <span className="text-[5.5px] sm:text-[6px] text-apple-ink-muted/60 font-medium">Code expires in 5:00</span>
                    </motion.div>
                  )}

                  {/* Waiting — idle + connecting states */}
                  {!showSendProgress && !showReceived && simState !== 'pairing' && (
                    <motion.div
                      key="waiting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/70"
                    >
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />
                      <span className="text-[7px] sm:text-[8px] font-medium">Waiting for something…</span>
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted/60">It will appear here</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopFrame>
          <DeviceLabel>Your laptop</DeviceLabel>
        </div>
      </div>

      {/* Flying payload — desktop only */}
      <AnimatePresence>
        {isFlying && (
          <motion.div
            key={`fly-${transferKind}`}
            className="absolute z-20 pointer-events-none will-change-transform hidden sm:block"
            style={{ left: bridge.flyFrom.x, top: bridge.flyFrom.y }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.92 }}
            animate={
              bridge.beam.vertical
                ? { x: [0, 8, 0], y: [0, dy * 0.5, dy], opacity: [0, 1, 1, 1], scale: [0.92, 1, 1, 1] }
                : { x: [0, dx * 0.5, dx], y: [0, -12, 0], opacity: [0, 1, 1, 1], scale: [0.92, 1, 1, 1] }
            }
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: T.FLIGHT_MS / 1000, times: [0, 0.15, 1], ease: [0.42, 0, 0.2, 1] }}
          >
            <div className="max-w-[140px] -translate-x-1/2 -translate-y-1/2">
              <TransferBubble obj={item} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}
