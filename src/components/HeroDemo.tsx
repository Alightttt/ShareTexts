import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, FileText, Image as ImageIcon, Send } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';

type Phase = 0 | 1 | 2; // text | photo | file

const PHASE_LABELS = ['Text', 'Photo', 'File'];

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

/** A small transferred object — text note, photo, or file card. */
function TransferCard({ phase, size = 'md' }: { phase: Phase, size?: 'md' | 'sm' }) {
  const sm = size === 'sm';
  if (phase === 1) {
    return (
      <div className={`${sm ? 'w-[86px] h-[64px]' : 'w-[104px] h-[76px]'} rounded-[10px] overflow-hidden bg-apple-divider dark:bg-apple-tile-3 border border-apple-hairline/60 dark:border-white/[0.06] flex items-center justify-center`}>
        <ImageIcon className={`${sm ? 'w-5 h-5' : 'w-6 h-6'} text-apple-ink-muted/60`} strokeWidth={2} />
      </div>
    );
  }
  if (phase === 2) {
    return (
      <div className={`${sm ? 'w-[86px]' : 'w-[104px]'} flex flex-col gap-1 p-[7px] rounded-[10px] bg-white dark:bg-[#2c2c2e] border border-apple-divider/60 dark:border-apple-tile-3 shadow-card`}>
        <div className="w-5 h-5 rounded-[6px] bg-[#ff3b30]/10 flex items-center justify-center">
          <FileText className="w-2.5 h-2.5 text-[#ff3b30]" />
        </div>
        <span className={`${sm ? 'text-[7px]' : 'text-[8px]'} font-semibold text-apple-ink dark:text-white leading-tight truncate`}>Q3-report.pdf</span>
        <span className="text-[6.5px] text-apple-ink-muted font-medium">2.4 MB</span>
      </div>
    );
  }
  return (
    <div className={`${sm ? 'w-[86px]' : 'w-[104px]'} flex flex-col gap-1 p-[7px] rounded-[10px] bg-white dark:bg-[#2c2c2e] border border-apple-divider/60 dark:border-apple-tile-3 shadow-card`}>
      <span className="flex items-center gap-1 min-w-0">
        <span className="w-1 h-1 rounded-full bg-status-success shrink-0" />
        <span className={`${sm ? 'text-[6.5px]' : 'text-[7.5px]'} font-mono text-apple-ink dark:text-white leading-snug truncate`}>
          example.com/a/very-long-link
        </span>
      </span>
      <span className="text-[6.5px] text-apple-ink-muted font-medium">Text</span>
    </div>
  );
}

export function HeroDemo() {
  const reduced = useReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);

  const [from, setFrom] = useState({ x: 0, y: 0 });
  const [to, setTo] = useState({ x: 0, y: 0 });
  const [beam, setBeam] = useState({ left: 0, width: 0, top: 0 });

  const [phase, setPhase] = useState<Phase>(0);
  const [flying, setFlying] = useState(false);
  const [landed, setLanded] = useState(false);

  // Reduced motion: show a static transfer instead of animating it.
  const showLanded = reduced || landed;

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

  // Choreography: compose → fly → land → copy → next
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>, t3: ReturnType<typeof setTimeout>;

    const cycle = () => {
      if (cancelled) return;
      setPhase(p => ((p + 1) % 3) as Phase);
      setFlying(false);
      setLanded(false);
      // Let the new object settle into the composer
      t1 = setTimeout(() => {
        if (cancelled) return;
        setFlying(true);
        // Flight takes ~2s; then it lands on the laptop
        t2 = setTimeout(() => {
          if (cancelled) return;
          setFlying(false);
          setLanded(true);
          t3 = setTimeout(cycle, 2800);
        }, 2000);
      }, 900);
    };
    t1 = setTimeout(cycle, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
    };
  }, [reduced]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return (
    <div ref={containerRef} className="relative w-full max-w-[880px] mx-auto select-none min-h-[560px] sm:min-h-[340px]">
      {/* Connection beam */}
      <div
        className="absolute hidden sm:block"
        style={{ left: beam.left, width: beam.width, top: beam.top, transform: 'translateY(-50%)' }}
        aria-hidden
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
                  <ShareTextLogo size={10} className="text-apple-ink dark:text-white" />
                  <span className="text-[7px] sm:text-[8.5px] font-semibold tracking-tight text-apple-ink dark:text-white">ShareText</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#34c759]" />
                  <span className="text-[6px] sm:text-[7px] font-medium text-apple-ink-muted">Connected</span>
                </div>
              </div>

              {/* Middle: empty / transit */}
              <div className="flex-1" />

              {/* Composer */}
              <div className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`composer-${phase}`}
                    initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: 0.25 }}
                    className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-[6px] sm:p-2 flex flex-col gap-1.5"
                  >
                    <TransferCard phase={phase} size="sm" />
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium truncate">
                        {PHASE_LABELS[phase]} ready
                      </span>
                      <div className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full bg-apple-blue flex items-center justify-center">
                        <Send className="w-[8px] h-[8px] text-white" strokeWidth={3} />
                      </div>
                    </div>
                  </motion.div>
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
                <div className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-[#34c759]" />
                  <span className="text-[7px] sm:text-[8px] font-medium text-apple-ink-muted">Connected</span>
                </div>
              </div>

              {/* Received object */}
              <div className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                {showLanded ? (
                  <motion.div
                    initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                    className="flex flex-col items-center gap-1.5 sm:gap-2"
                  >
                    <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-1.5 sm:p-2">
                      <TransferCard phase={phase} />
                    </div>
                    <div className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-[#34c759]/12 text-[#1d9c43] dark:text-[#34c759]">
                      <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5" strokeWidth={3} />
                      <span className="text-[7px] sm:text-[8px] font-semibold">Copied</span>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-apple-ink-muted/70">
                    <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />
                    <span className="text-[7px] sm:text-[8px] font-medium">Waiting for text…</span>
                  </div>
                )}
              </div>
            </div>
            {/* Laptop base */}
            <div className="h-[8px] sm:h-[10px] -mb-[10px] sm:-mb-[13px] mx-[-8px] sm:mx-[-12px] mt-[5px] rounded-b-[10px] sm:rounded-b-[14px] bg-gradient-to-b from-[#3a3a3d] to-[#2a2a2c]" />
          </div>
          <p className="mt-3.5 sm:mt-4 text-center text-[10px] sm:text-[11px] font-medium text-apple-ink-muted">Your laptop</p>
        </div>
      </div>

      {/* The flying card */}
      <AnimatePresence>
        {flying && !reduced && (
          <motion.div
            key={`fly-${phase}`}
            className="absolute z-20 pointer-events-none"
            style={{ left: from.x, top: from.y, transform: 'translate(-50%, -50%)' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.9 }}
            animate={{ x: dx, y: dy, opacity: [0, 1, 1, 1], scale: [0.9, 1.06, 1.02, 1.04] }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 2, times: [0, 0.15, 0.7, 1], ease: 'easeInOut' }}
          >
            <div className="shadow-float">
              <TransferCard phase={phase} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
