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
function DeviceStatus({ state }: { state: 'connected' | 'sending' | 'sent' | 'receiving' | 'received' }) {
  const map = {
    connected: { dot: 'bg-[#34c759]', text: 'Connected', cls: 'text-apple-ink-muted' },
    sending: { dot: 'bg-apple-blue animate-pulse', text: 'Sending…', cls: 'text-apple-blue' },
    sent: { dot: 'bg-[#34c759]', text: 'Sent', cls: 'text-[#1d9c43] dark:text-[#34c759]' },
    receiving: { dot: 'bg-apple-blue animate-pulse', text: 'Receiving…', cls: 'text-apple-blue' },
    received: { dot: 'bg-[#34c759]', text: 'Received', cls: 'text-[#1d9c43] dark:text-[#34c759]' },
  }[state];
  return (
    <div className="flex items-center gap-1">
      <span className={`w-1 h-1 rounded-full ${map.dot}`} />
      <span className={`text-[6px] sm:text-[7px] font-medium ${map.cls}`}>{map.text}</span>
    </div>
  );
}

function RoomHeader({ status, label }: { status: 'connected' | 'sending' | 'sent' | 'receiving' | 'received'; label: string }) {
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
type Step = 'ready' | 'sending' | 'received' | 'composing';

// Motion language: one arc (0.3s lift, 1.0s travel), a spring landing, and a
// quiet compose-in. Everything is transform/opacity — nothing layout-based.
const FLIGHT_MS = 1300;
const PRE_LAUNCH_MS = 320;
const HOLD_MS = 3400;
const COMPOSE_MS = 950;

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);
  // The object launches from the composer card and lands on the laptop's
  // content area — cause→effect, not "appears near the phone".
  const composerRef = useRef<HTMLDivElement>(null);
  const laptopTargetRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);

  const [from, setFrom] = useState({ x: 0, y: 0 });
  const [to, setTo] = useState({ x: 0, y: 0 });
  const [flyFrom, setFlyFrom] = useState({ x: 0, y: 0 });
  const [flyTo, setFlyTo] = useState({ x: 0, y: 0 });
  const [beam, setBeam] = useState({ left: 0, width: 0, top: 0, vertical: false });

  const [scene, setScene] = useState<Scene>('photo');
  // What actually landed on the laptop. Separate from `scene` (what the phone
  // is about to send) so the received card keeps showing the object that
  // really arrived while the sender composes the next one — continuity.
  const [landed, setLanded] = useState<Scene | null>(reduced ? 'photo' : null);
  const [step, setStep] = useState<Step>('ready');
  const [flying, setFlying] = useState(false);

  const [nodePos, setNodePos] = useState({ x: 0, y: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const phone = phoneScreenRef.current;
    const laptop = laptopScreenRef.current;
    if (!container || !phone || !laptop) return;
    const c = container.getBoundingClientRect();
    const p = phone.getBoundingClientRect();
    const l = laptop.getBoundingClientRect();
    // Stacked = the phone's screen bottom is at or above the laptop's screen
    // top (flex-col on small screens). Side-by-side otherwise.
    const vertical = p.bottom <= l.top + 10;
    const fromX = p.left - c.left + p.width / 2;
    const fromY = p.top - c.top + p.height / 2;
    const toX = l.left - c.left + l.width / 2;
    const toY = l.top - c.top + l.height / 2;
    setFrom({ x: fromX, y: fromY });
    setTo({ x: toX, y: toY });

    // The flying object's true path: composer card center → laptop content
    // center. Falls back to screen centers before first paint.
    const comp = composerRef.current?.getBoundingClientRect();
    const target = laptopTargetRef.current?.getBoundingClientRect();
    setFlyFrom(comp
      ? { x: comp.left - c.left + comp.width / 2, y: comp.top - c.top + comp.height / 2 }
      : { x: fromX, y: fromY });
    setFlyTo(target
      ? { x: target.left - c.left + target.width / 2, y: target.top - c.top + target.height / 2 }
      : { x: toX, y: toY });

    if (vertical) {
      // Beam: phone bottom -> laptop top, along the shared centerline.
      const top = p.bottom - c.top;
      setBeam({ left: fromX, width: 0, top, vertical: true, height: Math.max(0, l.top - c.top - top) });
      // Node: centered in the open space between the two screens.
      setNodePos({ x: fromX, y: top + Math.max(0, l.top - c.top - top) / 2 });
    } else {
      const left = p.left - c.left + p.width - 8;
      const width = Math.max(0, l.left - c.left - left + 16);
      setBeam({ left, width, top: fromY, vertical: false, height: 0 });
      // Node: centered in the OPEN GAP between the two device edges, on the
      // beam line. Center-of-centers would overlap the wider laptop; the gap
      // center is the empty space the beam crosses — never overlapping either
      // device, in every layout.
      setNodePos({ x: (p.left - c.left + p.width + l.left - c.left) / 2, y: fromY });
    }
  }, []);

  useEffect(() => {
    measure();
    // The composer card mounts after the scene settles, so re-measure once
    // the ready state is on screen (first frame only).
    const t = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure]);

  // The auto-cycle's pending timers, so a manual tap interrupts it cleanly
  // (no stale timer can land an early "received" over a fresh transfer).
  const cycleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearCycle = () => { cycleTimers.current.forEach(clearTimeout); cycleTimers.current = []; };

  // The send action — shared by the auto-cycle and the interactive button.
  // A manual tap clears any in-flight auto timers and takes over: the loop
  // resumes afterwards via pausedUntil.
  const playTransfer = useCallback((nextScene: Scene) => {
    if (reduced) return;
    clearCycle();
    pausedUntil.current = Date.now() + 6000; // let the manual play finish
    setScene(nextScene);
    setStep('ready');
    setFlying(false);
    cycleTimers.current.push(setTimeout(() => {
      setStep('sending');
      setFlying(true);
      cycleTimers.current.push(setTimeout(() => {
        setFlying(false);
        setStep('received');
        setLanded(nextScene);
      }, FLIGHT_MS));
    }, PRE_LAUNCH_MS));
  }, [reduced]);

  // Auto-choreography — a seamless loop: photo → link → photo. Each transfer
  // ends with the phone composing the next object (no hard reset), so it
  // reads as one transfer naturally leading into another.
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    let sceneFlip: Scene = 'photo';

    const cycle = () => {
      if (cancelled) return;
      const wait = pausedUntil.current - Date.now();
      if (wait > 0) {
        cycleTimers.current.push(setTimeout(cycle, Math.max(wait, 200)));
        return;
      }
      // Ready is already on screen — send it.
      setStep('sending');
      setFlying(true);
      cycleTimers.current.push(setTimeout(() => {
        if (cancelled) return;
        setFlying(false);
        setStep('received');
        setLanded(sceneFlip);
        cycleTimers.current.push(setTimeout(() => {
          if (cancelled) return;
          // Compose the next object into the sender's composer.
          sceneFlip = sceneFlip === 'photo' ? 'link' : 'photo';
          setScene(sceneFlip);
          setStep('composing');
          cycleTimers.current.push(setTimeout(() => {
            if (cancelled) return;
            setStep('ready');
            cycleTimers.current.push(setTimeout(cycle, 1300));
          }, COMPOSE_MS));
        }, HOLD_MS));
      }, FLIGHT_MS));
    };
    cycleTimers.current.push(setTimeout(cycle, 700));
    return () => { cancelled = true; clearCycle(); };
  }, [reduced]);

  const dx = flyTo.x - flyFrom.x;
  const dy = flyTo.y - flyFrom.y;
  const isSending = step === 'sending';
  const landedVisible = reduced || step === 'received' || step === 'composing';
  const phoneStatus: 'connected' | 'sending' | 'sent' =
    isSending ? 'sending' : (step === 'received' || reduced) ? 'sent' : 'connected';
  const laptopStatus: 'connected' | 'receiving' | 'received' =
    isSending ? 'receiving' : (landedVisible && landed) ? 'received' : 'connected';
  const landedScene = landed ?? (reduced ? 'photo' : scene);

  return (
    <div
      ref={containerRef}
      data-step={step}
      data-scene={scene}
      data-landed={landed ?? ''}
      onClick={reduced ? undefined : () => playTransfer(scene)}
      className="relative w-full max-w-[960px] mx-auto select-none min-h-[560px] sm:min-h-[500px] lg:min-h-[540px] cursor-pointer"
      aria-hidden
    >
      {/* Connection beam — horizontal on desktop, vertical when stacked.
          Visible at every size: the line between the devices IS the story. */}
      <div
        className="absolute"
        style={beam.vertical ? { left: beam.left, top: beam.top, height: beam.height ?? 0, width: 0, transform: 'translateX(-50%)' } : { left: beam.left, width: beam.width, top: beam.top, transform: 'translateY(-50%)' }}
      >
        <div className={beam.vertical ? "w-px h-full bg-apple-ink/10 dark:bg-white/10" : "h-px w-full bg-apple-ink/10 dark:bg-white/10"} />
        {!reduced && (
          <div className={cn("absolute w-1.5 h-1.5 rounded-full animate-beam bg-apple-blue shadow-[0_0_8px_rgba(0,102,204,0.7)]", beam.vertical ? "top-0 left-1/2 -translate-x-1/2" : "top-1/2 -translate-y-1/2 left-0")} />
        )}
      </div>

      {/* Center node — anchored to the TRUE midpoint between the two device
          screens, which is (from + to) / 2 from the measured beam. */}
      <div
        className="absolute w-9 h-9 rounded-full shadow-card flex items-center justify-center bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 z-10"
        style={{
          left: nodePos.x,
          top: nodePos.y,
          transform: 'translate(-50%, -50%)',
          opacity: nodePos.x || nodePos.y ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        <ShareTextLogo size={18} className="text-apple-blue" />
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:items-center sm:justify-between gap-12 sm:gap-0 px-2 sm:px-6 relative">
        {/* Phone — the sender. Still, not floating: motion is reserved for the
            transfer, so the object's movement carries all the meaning. */}
        <div data-device="phone" className="flex flex-col items-center">
          <PhoneFrame className="w-[132px] sm:w-[176px] lg:w-[190px] xl:w-[200px]">
            <div ref={phoneScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={phoneStatus} label="Your phone" />
              {/* Messages */}
              <div className="flex-1 flex flex-col justify-end px-[7px] sm:px-2.5 pb-1.5">
                <AnimatePresence mode="wait">
                  {step === 'received' && landed ? (
                    <motion.div
                      key={`sent-${landed}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                      className="self-end bg-azure-600 rounded-[14px] rounded-tr-[4px] shadow-sm p-1.5 sm:p-2 flex flex-col gap-1 max-w-[85%]"
                    >
                      {landed === 'photo'
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

              {/* Composer — the object waits here, then LAUNCHES from here. */}
              <div className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  {(step === 'ready' || step === 'composing') ? (
                    <motion.div
                      ref={composerRef}
                      key={`composer-${scene}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.45 }}
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
                          onClick={(e) => { e.stopPropagation(); playTransfer(scene); }}
                          className={cn(
                            "w-[18px] h-[18px] sm:w-[20px] sm:h-[20px] rounded-full bg-apple-blue flex items-center justify-center shadow-[0_2px_6px_rgba(0,102,204,0.45)] transition-transform active:scale-90",
                            step === 'composing' && "opacity-40 cursor-default"
                          )}
                          aria-label="Replay transfer"
                          tabIndex={-1}
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
        </div>

        {/* Laptop — the receiver. Shows exactly what landed, keeps showing it
            while the sender composes the next thing, and only swaps when the
            next transfer completes. */}
        <div data-device="laptop" className="flex flex-col items-center">
          <LaptopFrame className="w-[260px] sm:w-[348px] lg:w-[380px] xl:w-[410px]">
            <div ref={laptopScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={laptopStatus} label="Your laptop" />
              {/* Received object / receiving / empty */}
              <div ref={laptopTargetRef} className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                <AnimatePresence mode="wait">
                  {isSending && !reduced ? (
                    <motion.div
                      key="receiving-progress"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col items-center gap-2 w-full max-w-[150px]"
                    >
                      <div className="w-full h-1 rounded-full bg-apple-ink/10 dark:bg-white/10 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-apple-blue"
                          initial={{ width: '0%' }}
                          animate={{ width: '94%' }}
                          transition={{ duration: (FLIGHT_MS) / 1000, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </div>
                      <span className="text-[6.5px] sm:text-[8px] font-medium text-apple-ink-muted flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-apple-blue animate-pulse" />
                        Receiving {scene === 'photo' ? 'photo…' : 'link…'}
                      </span>
                    </motion.div>
                  ) : (landedVisible && landed) ? (
                    <motion.div
                      key={`received-${landedScene}`}
                      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.55 }}
                      className="flex flex-col items-center gap-1.5 sm:gap-2 relative"
                    >
                      {/* Arrival ring — one quiet pulse when the object lands.
                          Mounted once per landing (step flips back to
                          composing before the next receive), so it never
                          loops or restarts mid-show. */}
                      {!reduced && step === 'received' && (
                        <motion.span
                          key={`ring-${landedScene}`}
                          initial={{ scale: 0.75, opacity: 0.45 }}
                          animate={{ scale: 1.18, opacity: 0 }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="absolute -inset-2 rounded-[18px] border-2 border-apple-blue/50 pointer-events-none"
                          aria-hidden
                        />
                      )}
                      <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card overflow-hidden w-[120px] sm:w-[176px]">
                        {landedScene === 'photo' ? (
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
        </div>
      </div>

      {/* The object in flight — it lifts OUT OF the composer, arcs, and
          settles into the laptop's content area with a slight rotation, like
          a card tossed across the gap. Direction-aware: desktop bows upward,
          mobile bows sideways. */}
      <AnimatePresence>
        {flying && !reduced && (
          <motion.div
            key={`fly-${scene}-${step}`}
            className="absolute z-20 pointer-events-none"
            style={{ left: flyFrom.x, top: flyFrom.y, transform: 'translate(-50%, -50%)' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.88, rotate: -3 }}
            animate={
              beam.vertical
                ? { x: [0, 14, 0], y: [0, dy * 0.42, dy], opacity: [0, 1, 1, 1], scale: [0.88, 1.05, 1, 1.03], rotate: [-3, 1.5, 0] }
                : { x: [0, dx * 0.34, dx * 0.72, dx], y: [0, -18, -10, 0], opacity: [0, 1, 1, 1], scale: [0.88, 1.05, 1, 1.03], rotate: [-3, 1.5, 0] }
            }
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: FLIGHT_MS / 1000, times: [0, 0.18, 0.72, 1], ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] overflow-hidden shadow-float w-[72px] sm:w-[108px]">
              {scene === 'photo' ? <DemoPhoto className="w-full aspect-[4/3]" /> : <MiniLink className="m-1.5" />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
