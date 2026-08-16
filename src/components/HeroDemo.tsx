import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Image as ImageIcon, Link2, Send } from 'lucide-react';
import { ShareTextLogo } from './ShareTextLogo';
import { PhoneFrame, LaptopFrame, DeviceLabel } from './DeviceFrames';
import { DemoPhoto } from './DemoPhoto';
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

/** The second transferable — a link, the app's other everyday object. */
function MiniLink({ className }: { className?: string }) {
  return (
    <div className={cn("bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[10px] shadow-card px-2 py-1.5 flex items-center gap-1.5", className)}>
      <Link2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-apple-blue shrink-0" />
      <span className="font-mono text-[7px] sm:text-[8px] text-apple-ink dark:text-white truncate">example.com/a/very-long-link</span>
    </div>
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

function RoomHeader({ status, label }: { status: 'connected' | 'sending' | 'received'; label: string }) {
  return (
    <div className="shrink-0 flex items-center justify-between px-[9px] sm:px-3 pt-[16%] sm:pt-[13%] pb-[7px] sm:pb-2 border-b border-apple-ink/[0.06] dark:border-white/[0.08]">
      <div className="flex items-center gap-1">
        <ShareTextLogo size={12} className="text-apple-ink dark:text-white" />
        <span className="text-[7px] sm:text-[8.5px] font-semibold tracking-tight text-apple-ink dark:text-white">{label}</span>
      </div>
      <DeviceStatus state={status} />
    </div>
  );
}

type Scene = 'photo' | 'link';
type Step = 'ready' | 'sending' | 'received';

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  const [from, setFrom] = useState({ x: 0, y: 0 });
  const [to, setTo] = useState({ x: 0, y: 0 });
  const [beam, setBeam] = useState({ left: 0, width: 0, top: 0, vertical: false });

  const [scene, setScene] = useState<Scene>('photo');
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
    const vertical = p.top > l.top + l.height * 0.4; // stacked on mobile
    setFrom({ x: p.left - c.left + p.width / 2, y: p.top - c.top + p.height / 2 });
    setTo({ x: l.left - c.left + l.width / 2, y: l.top - c.top + l.height / 2 });
    if (vertical) {
      setBeam({ left: p.left - c.left + p.width / 2, width: 0, top: p.bottom - c.top, vertical: true });
    } else {
      setBeam({ left: p.left - c.left + p.width - 8, width: Math.max(0, l.left - c.left - (p.left - c.left + p.width) + 16), top: p.top - c.top + p.height / 2, vertical: false });
    }
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // The send action — shared by the auto-cycle and the interactive button.
  const playTransfer = useCallback((nextScene: Scene) => {
    if (reduced) return;
    pausedUntil.current = Date.now() + 6000; // let the manual play finish
    setScene(nextScene);
    setStep('ready');
    setFlying(false);
    setTimeout(() => {
      setStep('sending');
      setFlying(true);
      setTimeout(() => {
        setFlying(false);
        setStep('received');
      }, 1500);
    }, 350);
  }, [reduced]);

  // Auto-choreography — alternates photo → link → photo, repeated gently.
  // A manual tap pauses the loop for a moment, then it resumes.
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let sceneFlip: Scene = 'photo';

    const cycle = () => {
      if (cancelled) return;
      const wait = pausedUntil.current - Date.now();
      if (wait > 0) {
        timers.push(setTimeout(cycle, Math.max(wait, 200)));
        return;
      }
      sceneFlip = sceneFlip === 'photo' ? 'link' : 'photo';
      setScene(sceneFlip);
      setStep('ready');
      setFlying(false);
      timers.push(setTimeout(() => {
        if (cancelled) return;
        setStep('sending');
        setFlying(true);
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setFlying(false);
          setStep('received');
          timers.push(setTimeout(cycle, 3600));
        }, 1500));
      }, 1000));
    };
    timers.push(setTimeout(cycle, 700));
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [reduced]);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const isReceiving = step === 'received' || reduced;
  const phoneStatus: 'connected' | 'sending' = step === 'sending' ? 'sending' : 'connected';
  const laptopStatus: 'connected' | 'received' = isReceiving ? 'received' : 'connected';

  const TransferObject = scene === 'photo' ? <DemoPhoto className="w-full aspect-[4/3]" /> : <MiniLink className="m-1.5" />;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-[900px] mx-auto select-none min-h-[680px] sm:min-h-[440px]"
      aria-hidden
    >
      {/* Connection beam — horizontal on desktop, vertical when stacked */}
      <div
        className="absolute hidden sm:block"
        style={beam.vertical ? { left: beam.left, top: beam.top, height: to.y - from.y, width: 0, transform: 'translateX(-50%)' } : { left: beam.left, width: beam.width, top: beam.top, transform: 'translateY(-50%)' }}
      >
        <div className={beam.vertical ? "w-px h-full bg-apple-ink/10 dark:bg-white/10" : "h-px w-full bg-apple-ink/10 dark:bg-white/10"} />
        {!reduced && (
          <div className={cn("absolute w-1.5 h-1.5 rounded-full animate-beam bg-apple-blue shadow-[0_0_8px_rgba(0,102,204,0.7)]", beam.vertical ? "top-0 left-1/2 -translate-x-1/2" : "top-1/2 -translate-y-1/2 left-0")} />
        )}
        <div className={cn("absolute w-8 h-8 rounded-full shadow-card flex items-center justify-center bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3", beam.vertical ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2")}>
          <ShareTextLogo size={16} className="text-apple-blue" />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-center sm:justify-between gap-20 sm:gap-0 px-2 sm:px-6 relative">
        {/* Phone — the sender. A slow idle float keeps the scene alive without
            competing with the transfer; reduced-motion users get a still device. */}
        <motion.div
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.5, 1] }}
          className="flex flex-col items-center will-change-transform"
        >
          <PhoneFrame className="w-[124px] sm:w-[148px]">
            <div ref={phoneScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={phoneStatus} label="Your phone" />
              {/* Messages */}
              <div className="flex-1 flex flex-col justify-end px-[7px] sm:px-2.5 pb-1.5">
                <AnimatePresence mode="wait">
                  {step === 'received' ? (
                    <motion.div
                      key={`sent-${scene}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                      className="self-end bg-azure-600 rounded-[14px] rounded-tr-[4px] shadow-sm p-1.5 sm:p-2 flex flex-col gap-1 max-w-[85%]"
                    >
                      {scene === 'photo'
                        ? <DemoPhoto className="w-[64px] sm:w-[86px] aspect-[4/3] rounded-[8px]" />
                        : <MiniLink className="max-w-[110px]" />}
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
                      {scene === 'photo' ? <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" /> : <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />}
                      <span className="text-[6px] sm:text-[7px] font-medium">Nothing here yet</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer — the send button is a real button: tap it to replay */}
              <div className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  {step === 'ready' ? (
                    <motion.div
                      key={`composer-${scene}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.25 }}
                      className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-[6px] sm:p-2 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="rounded-[7px] overflow-hidden shrink-0">
                          {scene === 'photo'
                            ? <DemoPhoto className="w-[40px] sm:w-[52px] aspect-[4/3] rounded-[6px]" />
                            : <div className="w-[40px] sm:w-[52px] aspect-[4/3] flex items-center justify-center"><MiniLink className="max-w-full mx-0.5" /></div>}
                        </div>
                        <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium truncate">
                          {scene === 'photo' ? 'photo-2026.jpg' : 'long-link.txt'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between px-0.5">
                        <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium">
                          {scene === 'photo' ? 'Photo ready' : 'Link ready'}
                        </span>
                        <button
                          type="button"
                          onClick={() => playTransfer(scene)}
                          className="w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full bg-apple-blue flex items-center justify-center shadow-[0_2px_6px_rgba(0,102,204,0.45)] transition-transform active:scale-90"
                          aria-label="Replay transfer"
                        >
                          <Send className="w-[8px] h-[8px] text-white" strokeWidth={3} />
                        </button>
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
          </PhoneFrame>
          <DeviceLabel>Your phone</DeviceLabel>
        </motion.div>

        {/* Laptop — the receiver, floating on a slightly different phase */}
        <motion.div
          animate={reduced ? undefined : { y: [0, 5, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', times: [0, 0.5, 1] }}
          className="flex flex-col items-center will-change-transform"
        >
          <LaptopFrame className="w-[248px] sm:w-[300px] xl:w-[330px]">
            <div ref={laptopScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={laptopStatus} label="Your laptop" />
              {/* Received object / empty */}
              <div className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                <AnimatePresence mode="wait">
                  {isReceiving ? (
                    <motion.div
                      key={`received-${scene}`}
                      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 10, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.55 }}
                      className="flex flex-col items-center gap-1.5 sm:gap-2"
                    >
                      <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card overflow-hidden w-[120px] sm:w-[176px]">
                        {scene === 'photo' ? (
                          <>
                            <DemoPhoto className="w-full aspect-[4/3]" />
                            <div className="px-2 py-1 flex items-center justify-between">
                              <span className="text-[6.5px] sm:text-[8px] font-semibold text-apple-ink dark:text-white truncate">photo-2026.jpg</span>
                              <span className="text-[6px] sm:text-[7px] text-apple-ink-muted font-medium">2.4 MB</span>
                            </div>
                          </>
                        ) : (
                          <div className="p-1.5">
                            <MiniLink className="max-w-full" />
                          </div>
                        )}
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
                      {scene === 'photo' ? <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" /> : <Link2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />}
                      <span className="text-[7px] sm:text-[8px] font-medium">Nothing received yet</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopFrame>
          <DeviceLabel>Your laptop</DeviceLabel>
        </motion.div>
      </div>

      {/* The object in flight — a natural arc, not a straight slide: it lifts,
          travels, and settles with a slight rotation, like a card tossed
          across the gap. Direction-aware: desktop bows upward, mobile bows
          sideways. */}
      <AnimatePresence>
        {flying && !reduced && (
          <motion.div
            key={`fly-${scene}-${step}`}
            className="absolute z-20 pointer-events-none"
            style={{ left: from.x, top: from.y, transform: 'translate(-50%, -50%)' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.85, rotate: -3 }}
            animate={
              beam.vertical
                ? { x: [0, 14, 0], y: [0, dy * 0.42, dy], opacity: [0, 1, 1, 1], scale: [0.85, 1.04, 1, 1.03], rotate: [-3, 1.5, 0] }
                : { x: [0, dx * 0.34, dx * 0.72, dx], y: [0, -18, -10, 0], opacity: [0, 1, 1, 1], scale: [0.85, 1.04, 1, 1.03], rotate: [-3, 1.5, 0] }
            }
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 1.6, times: [0, 0.18, 0.72, 1], ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] overflow-hidden shadow-float w-[72px] sm:w-[92px]">
              {TransferObject}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
