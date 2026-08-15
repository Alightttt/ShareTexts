import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Image as ImageIcon, Send } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';

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

/**
 * A real-looking photo, drawn in SVG so it stays crisp at any size and needs
 * no network request. A small landscape — sky, sun, hills — reads as "a photo"
 * at 40px and at 180px.
 */
function MiniPhoto({ className }: { className?: string }) {
  const id = React.useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8ec9f8" />
          <stop offset="1" stopColor="#eaf5ff" />
        </linearGradient>
      </defs>
      <rect width="200" height="150" fill={`url(#sky-${id})`} />
      <circle cx="152" cy="40" r="17" fill="#fff4bf" />
      <path d="M0 98 Q50 80 100 95 T200 90 V150 H0 Z" fill="#b9d8ab" />
      <path d="M0 118 Q60 100 130 114 T200 108 V150 H0 Z" fill="#83b47e" />
      <circle cx="42" cy="110" r="9" fill="#5d9160" />
      <rect x="40" y="110" width="4" height="14" rx="1.5" fill="#6d5039" />
      <circle cx="152" cy="102" r="7" fill="#5d9160" />
      <rect x="150" y="102" width="4" height="12" rx="1.5" fill="#6d5039" />
    </svg>
  );
}

/** Tiny per-device connection chip — the only status text in the demo. */
function DeviceStatus({ state }: { state: 'connected' | 'sending' | 'received' }) {
  const map = {
    connected: { dot: 'bg-[#34c759]', text: 'Connected', cls: 'text-apple-ink-muted' },
    sending: { dot: 'bg-apple-blue animate-pulse', text: 'Sending…', cls: 'text-apple-blue' },
    received: { dot: 'bg-[#34c759]', text: 'Received', cls: 'text-[#1d9c43] dark:text-[#34c759]' },
  }[state];
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1 h-1 rounded-full ${map.dot}`} />
      <span className={`text-[6px] sm:text-[7px] font-medium ${map.cls}`}>{map.text}</span>
    </div>
  );
}

type Step = 'ready' | 'sending' | 'received';

export function HeroDemo() {
  const reduced = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);

  const [from, setFrom] = useState({ x: 0, y: 0 });
  const [to, setTo] = useState({ x: 0, y: 0 });
  const [beam, setBeam] = useState({ left: 0, width: 0, top: 0 });

  const [step, setStep] = useState<Step>('ready');
  const [flying, setFlying] = useState(false);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const phone = phoneScreenRef.current;
    const laptop = laptopScreenRef.current;
    if (!container || !phone || !laptop) return;
    const c = container.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const l = laptop.getBoundingClientRect();
    setFrom({ x: p.left - c.left + p.width / 2, y: p.top - c.top + p.height / 2 });
    setTo({ x: l.left - c.left + l.width / 2, y: l.top - c.top + l.height / 2 });
    setBeam({
      left: p.left - c.left + p.width - 8,
      width: l.left - c.left - (p.left - c.left + p.width) + 16,
      top: p.top - c.top + p.height / 2
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Choreography — one photo transfer, repeated gently:
  // ready (photo staged) → sending (photo travels) → received (photo lands)
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>, t3: ReturnType<typeof setTimeout>;

    const cycle = () => {
      if (cancelled) return;
      setStep('ready');
      setFlying(false);
      // Let the staged photo settle, then press send.
      t1 = setTimeout(() => {
        if (cancelled) return;
        setStep('sending');
        setFlying(true);
        // The photo travels; then it lands on the laptop.
        t2 = setTimeout(() => {
          if (cancelled) return;
          setFlying(false);
          setStep('received');
          t3 = setTimeout(cycle, 3800);
        }, 1700);
      }, 1100);
    };
    t1 = setTimeout(cycle, 900);
    return () => {
      cancelled = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [reduced]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const phoneStatus: 'connected' | 'sending' = step === 'sending' ? 'sending' : 'connected';
  const laptopStatus: 'connected' | 'received' = step === 'received' ? 'received' : 'connected';

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-[880px] mx-auto select-none pointer-events-none min-h-[560px] sm:min-h-[340px]"
      aria-hidden
    >
      {/* Connection beam */}
      <div
        className="absolute hidden sm:block"
        style={{ left: beam.left, width: beam.width, top: beam.top, transform: 'translateY(-50%)' }}
      >
        <div className="h-px w-full bg-apple-ink/10 dark:bg-white/10" />
        {!reduced && (
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-1.5 rounded-full animate-beam bg-apple-blue shadow-[0_0_8px_rgba(0,102,204,0.7)]" />
        )}
        {/* Transit node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full shadow-card flex items-center justify-center bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3">
          <ShareTextLogo size={16} className="text-apple-blue" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-12 sm:gap-0 px-2 sm:px-16 relative min-h-[560px] sm:min-h-[340px]">
        {/* Phone — the sender */}
        <div className="w-[128px] sm:w-[168px] shrink-0">
          <div className="rounded-[26px] sm:rounded-[32px] bg-[#161617] p-[7px] sm:p-[9px] shadow-device border border-white/10 relative">
            {/* Dynamic island */}
            <div className="absolute top-[16px] sm:top-[20px] left-1/2 -translate-x-1/2 w-[44px] sm:w-[56px] h-[12px] sm:h-[15px] bg-black rounded-full z-10" />
            <div ref={phoneScreenRef} className="w-full aspect-[9/18.5] rounded-[20px] sm:rounded-[24px] bg-apple-parchment dark:bg-black overflow-hidden relative flex flex-col">
              {/* Mini room header */}
              <div className="shrink-0 flex items-center justify-between px-[9px] sm:px-3 pt-[26px] sm:pt-[34px] pb-[7px] sm:pb-2 border-b border-apple-ink/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-1">
                  <ShareTextLogo size={12} className="text-apple-ink dark:text-white" />
                  <span className="text-[7px] sm:text-[8.5px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
                </div>
                <DeviceStatus state={phoneStatus} />
              </div>

              {/* Messages */}
              <div className="flex-1 flex flex-col justify-end px-[7px] sm:px-2.5 pb-1.5">
                <AnimatePresence mode="wait">
                  {step === 'received' ? (
                    <motion.div
                      key="sent"
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                      className="self-end bg-azure-600 rounded-[14px] rounded-tr-[4px] shadow-sm p-1.5 sm:p-2 flex flex-col gap-1 max-w-[85%]"
                    >
                      <MiniPhoto className="w-[64px] sm:w-[86px] aspect-[4/3] rounded-[8px]" />
                      <span className="text-[6px] sm:text-[7px] text-white/85 px-0.5 flex items-center gap-1">
                        <Check className="w-2 h-2" strokeWidth={3} /> Sent • 09:41
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/60 py-2"
                    >
                      <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />
                      <span className="text-[6px] sm:text-[7px] font-medium">Nothing here yet</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer */}
              <div className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  {step === 'ready' ? (
                    <motion.div
                      key="composer-photo"
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.25 }}
                      className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-[6px] sm:p-2 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-[7px] overflow-hidden shrink-0">
                          <MiniPhoto className="w-[40px] sm:w-[52px] aspect-[4/3]" />
                        </div>
                        <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium truncate">photo-2026.jpg</span>
                      </div>
                      <div className="flex items-center justify-between px-0.5">
                        <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium">Photo ready</span>
                        <motion.div
                          animate={step === 'sending' ? { scale: 0.82 } : {}}
                          className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full bg-apple-blue flex items-center justify-center shadow-[0_2px_6px_rgba(0,102,204,0.45)]"
                        >
                          <Send className="w-[8px] h-[8px] text-white" strokeWidth={3} />
                        </motion.div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="composer-empty"
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card px-2.5 py-2 flex items-center justify-between"
                    >
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted/70 font-medium">Type a message…</span>
                      <Send className="w-[8px] h-[8px] text-apple-blue/50" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <p className="mt-2.5 text-center text-[10px] sm:text-[11px] font-medium text-apple-ink-muted">Your phone</p>
        </div>

        {/* Laptop — the receiver */}
        <div className="w-[252px] sm:w-[400px] shrink-0">
          <div className="rounded-[10px] sm:rounded-[14px] bg-[#232326] p-[6px] sm:p-[9px] shadow-device border border-white/10 relative">
            <div ref={laptopScreenRef} className="w-full aspect-[16/10] rounded-[6px] sm:rounded-[9px] bg-apple-parchment dark:bg-black overflow-hidden relative flex flex-col">
              {/* Mini room header */}
              <div className="shrink-0 flex items-center justify-between px-[10px] sm:px-4 pt-[9px] sm:pt-3 pb-[6px] sm:pb-2 border-b border-apple-ink/[0.06] dark:border-white/[0.08]">
                <div className="flex items-center gap-1.5">
                  <ShareTextLogo size={12} className="text-apple-ink dark:text-white" />
                  <span className="text-[8px] sm:text-[10px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
                </div>
                <DeviceStatus state={laptopStatus} />
              </div>

              {/* Received photo / empty */}
              <div className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                <AnimatePresence mode="wait">
                  {step === 'received' || reduced ? (
                    <motion.div
                      key="received"
                      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.55 }}
                      className="flex flex-col items-center gap-1.5 sm:gap-2"
                    >
                      <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card overflow-hidden w-[120px] sm:w-[176px]">
                        <MiniPhoto className="w-full aspect-[4/3]" />
                        <div className="px-2 py-1 flex items-center justify-between">
                          <span className="text-[6.5px] sm:text-[8px] font-semibold text-apple-ink dark:text-white truncate">photo-2026.jpg</span>
                          <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium">2.4 MB</span>
                        </div>
                      </div>
                      <DeviceStatus state="received" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="waiting"
                      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/70"
                    >
                      <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />
                      <span className="text-[7px] sm:text-[8px] font-medium">Nothing received yet</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {/* Laptop base */}
            <div className="h-[8px] sm:h-[10px] -mb-[10px] sm:-mb-[13px] mx-[-8px] sm:mx-[-12px] mt-[5px] rounded-b-[10px] sm:rounded-b-[14px] bg-gradient-to-b from-[#3a3a3d] to-[#2a2a2c]" />
          </div>
          <p className="mt-3.5 sm:mt-4 text-center text-[10px] sm:text-[11px] font-medium text-apple-ink-muted">Your laptop</p>
        </div>
      </div>

      {/* The photo in flight */}
      <AnimatePresence>
        {flying && !reduced && (
          <motion.div
            key={`fly-${step}`}
            className="absolute z-20 pointer-events-none"
            style={{ left: from.x, top: from.y, transform: 'translate(-50%, -50%)' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.9 }}
            animate={{ x: dx, y: dy, opacity: [0, 1, 1, 1], scale: [0.9, 1.05, 1.02, 1.04] }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 1.7, times: [0, 0.12, 0.75, 1], ease: 'easeInOut' }}
          >
            <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] overflow-hidden shadow-float w-[72px] sm:w-[92px]">
              <MiniPhoto className="w-full aspect-[4/3]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
