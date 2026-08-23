import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Download, Copy, Lock } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { DemoPhoto } from './DemoPhoto';
import { FileTypeIcon } from './FileTypeIcon';
import { cn } from '../lib/utils';

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

type SimState =
  | 'idle'
  | 'pressing'
  | 'sending'
  | 'transferring'
  | 'receiving'
  | 'received'
  | 'complete'
  | 'resetting';

const T = {
  IDLE_HOLD:      1800,
  PRESS_HOLD:     200,
  SENDING_HOLD:   500,
  TRANSFER_MS:    1400,
  RECEIVING_HOLD: 300,
  RECEIVED_HOLD:  1600,
  COMPLETE_HOLD:  1200,
  RESET_HOLD:     500,
};

// ── Device frames — quiet, precise, not decorative ──

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div className="relative rounded-[26px] sm:rounded-[30px] p-[3%] bg-gradient-to-b from-[#e0e0e4] to-[#c8c8cc] dark:from-[#2a2a2e] dark:to-[#1a1a1e] shadow-[0_2px_12px_rgba(0,0,0,0.12)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.4)]">
        <div className="relative rounded-[20px] sm:rounded-[24px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[9/19.5]">
          <div className="absolute top-[3%] left-1/2 -translate-x-1/2 w-[30%] h-[2.2%] min-h-[5px] bg-black rounded-full z-10" />
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
          <div className="relative w-full h-full z-[5]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function LaptopFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative shrink-0', className)}>
      <div className="relative rounded-[8px] sm:rounded-[10px] p-[1.5%] bg-gradient-to-b from-[#d0d0d5] to-[#b0b0b5] dark:from-[#333338] dark:to-[#252528] shadow-[0_2px_16px_rgba(0,0,0,0.1)] dark:shadow-[0_2px_16px_rgba(0,0,0,0.3)]">
        <div className="absolute top-[2.5%] left-1/2 -translate-x-1/2 w-[1.8%] aspect-square rounded-full bg-[#1a1a1e] ring-[0.5px] ring-white/15 z-10" />
        <div className="relative rounded-[4px] sm:rounded-[6px] bg-[#1a1a1e] p-[1.2%]">
          <div className="relative rounded-[2px] sm:rounded-[3px] bg-[#0a0f1a] dark:bg-[#0a0a0c] overflow-hidden aspect-[16/10]">
            {children}
          </div>
        </div>
      </div>
      <div className="relative -mt-[0.3%] -mx-[2%] w-[104%] rounded-b-[8px] sm:rounded-b-[10px] bg-gradient-to-b from-[#c8c8cd] to-[#b0b0b5] dark:from-[#2a2a2e] dark:to-[#1e1e20] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)]">
        <div className="mx-[30%] mt-[3%] h-[1px] rounded-full bg-black/[0.05] dark:bg-white/[0.05]" />
        <div className="mx-[8%] mt-[3%] rounded-[2px] bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="h-[45%] bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(0,0,0,0.01)_5px,rgba(0,0,0,0.01)_6px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_5px,rgba(255,255,255,0.015)_5px,rgba(255,255,255,0.015)_6px)]" />
        </div>
        <div className="flex justify-center pb-[7%] mt-[2%]">
          <div className="w-[26%] h-[8%] rounded-[2px] bg-black/[0.015] dark:bg-white/[0.015] border border-black/[0.02] dark:border-white/[0.03]" />
        </div>
      </div>
    </div>
  );
}

// ── Mini UI components — rendered inside device screens ──

function StatusPill({ state }: { state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  if (state === 'connected') {
    return (
      <span className="flex items-center gap-0.5 text-[7px] sm:text-[8px] font-semibold text-status-success">
        <span className="w-1 h-1 rounded-full bg-status-success" />
        Connected
      </span>
    );
  }
  const map: Record<string, { text: string; cls: string; pulse: boolean }> = {
    sending:   { text: 'Sending…', cls: 'text-azure-600', pulse: true },
    sent:      { text: 'Sent ✓', cls: 'text-status-success', pulse: false },
    receiving: { text: 'Receiving…', cls: 'text-azure-600', pulse: true },
    received:  { text: 'Received ✓', cls: 'text-status-success', pulse: false },
  };
  const s = map[state];
  return (
    <span className={cn('flex items-center gap-0.5 text-[7px] sm:text-[8px] font-medium', s.cls)}>
      <span className={cn('w-1 h-1 rounded-full', state === 'sending' || state === 'receiving' ? 'bg-azure-600 animate-pulse' : 'bg-status-success')} />
      {s.text}
    </span>
  );
}

function MiniHeader({ status }: { status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  return (
    <div className="flex items-center justify-between px-[6px] sm:px-2 pt-[14%] sm:pt-[10%] pb-[4px] sm:pb-1.5 border-b border-black/[0.06] dark:border-white/[0.08]">
      <div className="flex items-center gap-0.5">
        <ShareTextLogo size={7} className="text-white" />
        <span className="text-[6px] sm:text-[7px] font-semibold text-white/80">ShareText</span>
        <Lock className="w-[4px] h-[4px] text-status-success ml-0.5" />
      </div>
      <StatusPill state={status} />
    </div>
  );
}

function MiniText({ obj, sent }: { obj: TransferItem; sent?: boolean }) {
  return (
    <div className={cn(
      'rounded-[5px] sm:rounded-[6px] px-[5px] sm:px-1.5 py-[3px] sm:py-0.5 max-w-[80%] text-[5px] sm:text-[6px] leading-snug',
      sent
        ? 'bg-azure-600 text-white rounded-tr-[2px] ml-auto'
        : 'bg-white/[0.08] border border-white/[0.06] text-white/80',
    )}>
      {obj.text}
    </div>
  );
}

function MiniPhoto({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] overflow-hidden',
      received && 'ring-1 ring-status-success/30',
    )}>
      <DemoPhoto className="w-full aspect-[4/3]" />
      <div className="px-[4px] sm:px-1.5 py-[2px] sm:py-0.5 flex items-center justify-between">
        <span className="text-[4.5px] sm:text-[5px] font-semibold text-white/80 truncate">{obj.name}</span>
        <span className="text-[4px] sm:text-[4.5px] text-white/40">{obj.size}</span>
      </div>
    </div>
  );
}

function MiniVideo({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] overflow-hidden',
      received && 'ring-1 ring-status-success/30',
    )}>
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
}

function MiniFile({ obj, received }: { obj: TransferItem; received?: boolean }) {
  return (
    <div className={cn(
      'bg-white/[0.06] border border-white/[0.06] rounded-[5px] sm:rounded-[6px] px-[4px] sm:px-1.5 py-[3px] sm:py-1 flex items-center gap-1',
      received && 'ring-1 ring-status-success/30',
    )}>
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

// ── Main HeroDemo — product simulation ──

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const [simState, setSimState] = useState<SimState>('idle');
  const [transferKind, setTransferKind] = useState<Kind>('text');
  const [progress, setProgress] = useState(0);
  const sceneRef = useRef<Kind>('text');
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
    const afterIdle = T.IDLE_HOLD;

    schedule(() => setSimState('pressing'), afterIdle);
    schedule(() => setSimState('sending'), afterIdle + T.PRESS_HOLD);

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

      schedule(() => {
        setSimState('receiving');
        setProgress(100);
        schedule(() => {
          setSimState('received');
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
          }, T.RECEIVED_HOLD);
        }, T.RECEIVING_HOLD);
      }, afterIdle + T.PRESS_HOLD + T.SENDING_HOLD + T.TRANSFER_MS);
    }, afterIdle + T.PRESS_HOLD + T.SENDING_HOLD);
  }, [clearTimers, schedule]);

  simStateRef.current = simState;
  runMachineRef.current = () => runMachine(sceneRef.current);

  useEffect(() => {
    const t = setTimeout(() => runMachine('text'), 300);
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

  if (reduced) {
    return (
      <div ref={containerRef} data-testid="hero-demo" role="img"
        aria-label="ShareText preview: transfer files between phone and computer"
        className="relative w-full max-w-[680px] mx-auto select-none"
      >
        <div className="flex items-end justify-center gap-3 sm:gap-8">
          <PhoneFrame className="w-[110px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
              <MiniHeader status="sent" />
              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1">
                <MiniCard obj={item} />
              </div>
              <div className="border-t border-white/[0.06] px-[5px] sm:px-1.5 py-1">
                <span className="text-[5px] sm:text-[5px] text-status-success font-medium">Sent ✓</span>
              </div>
            </div>
          </PhoneFrame>
          <LaptopFrame className="w-[180px] sm:w-[280px] lg:w-[320px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
              <MiniHeader status="received" />
              <div className="flex-1 flex flex-col items-center justify-center px-2">
                <MiniCard obj={item} received />
                <span className="mt-1 text-[5px] sm:text-[5px] text-status-success font-medium">✓ Received</span>
              </div>
            </div>
          </LaptopFrame>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="hero-demo"
      data-sim-state={simState}
      data-transfer-kind={transferKind}
      role="img"
      aria-label="Interactive preview: ShareText transfers content from phone to computer."
      className="relative w-full max-w-[700px] mx-auto select-none"
    >
      <div className="flex items-end justify-center gap-2 sm:gap-8 lg:gap-10">

        {/* Phone */}
        <motion.div
          animate={{ opacity: isResetting ? 0.5 : 1 }}
          transition={{ duration: 0.3 }}
          className="relative z-10"
        >
          <PhoneFrame className="w-[110px] sm:w-[160px] lg:w-[180px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
              <MiniHeader status={senderStatus} />

              <div className="flex-1 flex flex-col justify-end gap-1 px-[5px] sm:px-1.5 pb-1 overflow-hidden">
                <AnimatePresence initial={false}>
                  {showSentStatus && (
                    <motion.div key="sent-msg" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}>
                      <MiniCard obj={item} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="border-t border-white/[0.06] px-[5px] sm:px-1.5 py-1">
                <AnimatePresence mode="wait">
                  {showComposer && (
                    <motion.div key="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center gap-1"
                    >
                      <div className="flex-1 rounded-[4px] bg-white/[0.04] border border-white/[0.06] px-[5px] sm:px-1.5 py-[2px] sm:py-0.5">
                        <span className="text-[4.5px] sm:text-[5px] text-white/30 font-medium">
                          {transferKind === 'text' ? 'Meeting tomorrow…' : TRANSFER_ITEMS[transferKind].name}
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        animate={isPressing ? { scale: 0.85 } : { scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                        className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-azure-600 flex items-center justify-center"
                      >
                        <Send className="w-1.5 h-1.5 sm:w-2 sm:h-2 text-white" strokeWidth={3} />
                      </motion.button>
                    </motion.div>
                  )}

                  {showSendingStatus && (
                    <motion.div key="sending-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="flex items-center justify-between px-[5px] sm:px-1.5 py-[2px]"
                    >
                      <span className="text-[4.5px] sm:text-[5px] text-white/30 font-medium">
                        Sending… {simState === 'transferring' ? `${Math.round(progress)}%` : ''}
                      </span>
                    </motion.div>
                  )}

                  {showSentStatus && (
                    <motion.div key="sent-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="flex items-center justify-between px-[5px] sm:px-1.5 py-[2px]"
                    >
                      <span className="text-[4.5px] sm:text-[5px] text-status-success font-medium">Sent ✓</span>
                    </motion.div>
                  )}

                  {simState === 'resetting' && (
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

        {/* Laptop */}
        <motion.div
          animate={{ opacity: isResetting ? 0.5 : 1 }}
          transition={{ duration: 0.3 }}
          className="relative z-0"
        >
          <LaptopFrame className="w-[180px] sm:w-[280px] lg:w-[320px]">
            <div className="w-full h-full flex flex-col bg-[#0a0f1a]">
              <MiniHeader status={receiverStatus} />

              <div className="flex-1 flex flex-col items-center justify-center px-2 overflow-hidden">
                <AnimatePresence mode="wait">

                  {(isIdle || isPressing) && (
                    <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="flex flex-col items-center gap-1 text-white/20"
                    >
                      <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-20" />
                      <span className="text-[5px] sm:text-[6px] font-medium">Waiting for something…</span>
                    </motion.div>
                  )}

                  {simState === 'sending' && (
                    <motion.div key="connecting" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -2 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-col items-center gap-1 text-white/30"
                    >
                      <span className="text-[5px] sm:text-[6px] font-medium">Receiving…</span>
                    </motion.div>
                  )}

                  {simState === 'transferring' && (
                    <motion.div key="progress" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -2 }}
                      transition={{ duration: 0.15 }}
                      className="w-full max-w-[140px] flex flex-col items-center gap-1"
                    >
                      <div className="w-full relative">
                        <div className="opacity-30"><MiniCard obj={item} /></div>
                        <div className="absolute bottom-0 left-0 right-0 px-1 pb-0.5"><MiniProgress progress={progress} /></div>
                      </div>
                      <span className="text-[4px] sm:text-[5px] font-medium text-white/30 flex items-center gap-0.5">
                        <span className="w-0.5 h-0.5 rounded-full bg-azure-500 animate-pulse" /> Receiving…
                      </span>
                    </motion.div>
                  )}

                  {simState === 'receiving' && (
                    <motion.div key="materialize" initial={{ opacity: 0, y: 4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.2 }}
                      className="w-full flex flex-col items-center gap-1"
                    >
                      <MiniCard obj={item} received />
                      <span className="text-[4px] sm:text-[5px] font-medium text-white/30">Processing…</span>
                    </motion.div>
                  )}

                  {(simState === 'received' || simState === 'complete') && (
                    <motion.div key={`received-${transferKind}`} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="w-full flex flex-col items-center gap-1"
                    >
                      <MiniCard obj={item} received />
                      <span className="text-[4px] sm:text-[5px] font-medium text-status-success">✓ Received</span>
                      <AnimatePresence>
                        {simState === 'received' && (
                          <motion.div initial={{ opacity: 0, y: 1 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ delay: 0.1, duration: 0.12 }}>
                            <button type="button" className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-azure-600/15 text-azure-400 text-[4px] sm:text-[5px] font-medium">
                              {transferKind === 'text' ? <><Copy className="w-1 h-1" /> Copy</> : <><Download className="w-1 h-1" /> Save</>}
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {simState === 'resetting' && (
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
  );
}
