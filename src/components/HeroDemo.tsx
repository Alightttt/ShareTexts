import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Image as ImageIcon, Link2, FileArchive, Send, X } from 'lucide-react';
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

/**
 * The transferable objects — text, a photo, a link, a file. The hero runs its
 * own transfer story on a loop (photo → link → file → photo), and the visitor
 * can jump in at any moment: type, paste, or tap a sample and send — the loop
 * yields to the visitor's transfer, then resumes from where it left off.
 */
type Kind = 'text' | 'photo' | 'link' | 'file';
interface TransferObject {
  kind: Kind;
  text?: string;
  name?: string;
  size?: string;
  /** Stable identity for stream-list keys (index keys shift on trim). */
  uid?: number;
}

const SAMPLES: { key: Exclude<Kind, 'text'>; label: string; Icon: typeof ImageIcon; object: TransferObject }[] = [
  { key: 'photo', label: 'Photo', Icon: ImageIcon, object: { kind: 'photo', name: 'photo-2026.jpg', size: '18.4 MB' } },
  { key: 'link', label: 'Link', Icon: Link2, object: { kind: 'link', text: 'example.com/a/very-long-link' } },
  { key: 'file', label: 'File', Icon: FileArchive, object: { kind: 'file', name: 'project.zip', size: '184 MB' } },
];
const SCENE_ORDER: Kind[] = ['photo', 'link', 'file'];
const nextScene = (k: Kind) => SCENE_ORDER[(SCENE_ORDER.indexOf(k) + 1) % SCENE_ORDER.length];
const sampleOf = (k: Kind) => SAMPLES.find(s => s.key === k)!.object;

type Step = 'ready' | 'sending' | 'received' | 'composing';

// One motion language: a short lift, a 1.15s travel, a spring landing, and a
// quiet compose-in. The visitor's transfers use the same arc as the auto-run.
const PRE_LAUNCH_MS = 260;
const FLIGHT_MS = 1150;
const HOLD_MS = 2900;    // how long the received object stays on the laptop
const COMPOSE_MS = 850;  // the next object composing into the phone
const READY_MS = 2600;   // how long the auto-run waits before sending
const TAKEOVER_MS = 6000; // if the visitor interacts but doesn't send, the demo resumes

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

/* ---------- The four object cards — the SAME object visibly travels. ---------- */

function TextCard({ obj, className }: { obj: TransferObject; className?: string }) {
  return (
    <div className={cn(
      'bg-azure-600 text-white rounded-[10px] rounded-tr-[3px] px-2 py-1.5 shadow-sm',
      'text-[7px] sm:text-[8px] leading-snug whitespace-pre-wrap break-words line-clamp-4',
      className,
    )}>
      {obj.text}
    </div>
  );
}

function PhotoCard({ obj, className }: { obj: TransferObject; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[10px] overflow-hidden shadow-card', className)}>
      <DemoPhoto className="w-full aspect-[4/3]" />
      <div className="px-1.5 py-1 flex items-center justify-between gap-1">
        <span className="text-[6px] sm:text-[7px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted font-medium shrink-0">{obj.size}</span>
      </div>
    </div>
  );
}

function LinkCard({ obj, className }: { obj: TransferObject; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[10px] shadow-card px-2 py-1.5 flex items-center gap-1.5', className)}>
      <Link2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-apple-blue shrink-0" />
      <span className="font-mono text-[7px] sm:text-[8px] text-apple-ink dark:text-white truncate">{obj.text}</span>
    </div>
  );
}

function FileCard({ obj, className }: { obj: TransferObject; className?: string }) {
  return (
    <div className={cn('bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[10px] shadow-card px-2 py-1.5 flex items-center gap-1.5', className)}>
      <span className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-[7px] bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
        <FileArchive className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400" />
      </span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="text-[6.5px] sm:text-[7.5px] font-semibold text-apple-ink dark:text-white truncate">{obj.name}</span>
        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted font-medium">{obj.size}</span>
      </span>
    </div>
  );
}

function ObjectCard({ obj, className }: { obj: TransferObject; className?: string }) {
  if (obj.kind === 'text') return <TextCard obj={obj} className={className} />;
  if (obj.kind === 'photo') return <PhotoCard obj={obj} className={className} />;
  if (obj.kind === 'link') return <LinkCard obj={obj} className={className} />;
  return <FileCard obj={obj} className={className} />;
}

export function HeroDemo() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const phoneScreenRef = useRef<HTMLDivElement>(null);
  const laptopScreenRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const laptopTargetRef = useRef<HTMLDivElement>(null);

  // All bridge geometry in ONE state object: measure() used to fire six
  // separate setStates per resize/scene-change, and every one of them
  // re-rendered the whole demo. One object + a skip-if-unchanged check keeps
  // re-renders to exactly one per actual geometry change.
  const [bridge, setBridge] = useState({
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    flyFrom: { x: 0, y: 0 },
    flyTo: { x: 0, y: 0 },
    beam: { left: 0, width: 0, top: 0, vertical: false, height: 0 },
    nodePos: { x: 0, y: 0 },
  });

  // Interactive state — a real composer. `attach` holds the object staged in
  // the composer (the auto-run sets it to each scene's sample; the visitor
  // can replace it with a sample or type text).
  const [draft, setDraft] = useState('');
  const [attach, setAttach] = useState<TransferObject | null>(SAMPLES[0].object);
  const [pending, setPending] = useState<TransferObject | null>(null);
  const [landed, setLanded] = useState<TransferObject | null>(null);
  const [stream, setStream] = useState<TransferObject[]>([]);
  const uidRef = useRef(1);
  const [step, setStep] = useState<Step>('ready');

  // The auto-run's timers + takeover bookkeeping. A visitor's send clears the
  // pending timers (interrupt), plays their transfer, then re-arms the loop
  // so it resumes from the scene that would have come next.
  const loopTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearLoop = useCallback(() => {
    loopTimers.current.forEach(clearTimeout);
    loopTimers.current = [];
  }, []);
  const sceneRef = useRef<Kind>('photo');
  const userTouched = useRef(false);
  const userTouchedAt = useRef(0);
  const [autoArmed, setAutoArmed] = useState(false);

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
      ? { x: target.left - c.left + target.width / 2, y: target.top - c.top + target.height / 2 }
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
    const t = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); clearTimeout(t); };
  }, [measure]);

  useEffect(() => { measure(); }, [attach, measure]);
  useEffect(() => () => clearLoop(), [clearLoop]);

  // playRef breaks the scheduleAuto <-> playObject cycle.
  const playRef = useRef<(obj: TransferObject, fromUser: boolean) => void>(() => {});
  const scheduleRef = useRef<() => void>(() => {});

  /** Play one transfer. fromUser interrupts the auto-run; on completion the
      auto-run resumes from the next scene. */
  const playObject = useCallback((obj: TransferObject, fromUser: boolean) => {
    clearLoop();
    setDraft('');
    setAttach(null);
    setPending(obj);
    setStep('sending');
    const finish = () => {
      setLanded(obj);
      // uid gives each stream entry a stable key — index-based keys shift
      // when the array trims, re-animating old items on every send.
      setStream(s => [...s.slice(-2), { ...obj, uid: uidRef.current++ }]);
      setStep('received');
      if (fromUser) {
        // Resume the auto-run from where it would have gone next.
        sceneRef.current = nextScene(sceneRef.current);
        loopTimers.current.push(setTimeout(() => {
          setStep('composing');
          loopTimers.current.push(setTimeout(() => scheduleRef.current(), COMPOSE_MS));
        }, HOLD_MS));
      }
    };
    if (reduced) { finish(); return; }
    measure();
    loopTimers.current.push(setTimeout(finish, FLIGHT_MS));
  }, [reduced, measure, clearLoop]);

  /** The auto-run: stage the current scene's sample, wait, send it (unless
      the visitor took over the composer), hold, compose the next, repeat. */
  const scheduleAuto = useCallback(() => {
    clearLoop();
    const scene = sceneRef.current;
    setAttach(sampleOf(scene));
    setDraft('');
    setStep('ready');
    userTouched.current = false;
    userTouchedAt.current = 0;
    setAutoArmed(true);

    loopTimers.current.push(setTimeout(() => {
      const trySend = () => {
        if (userTouched.current) {
          if (Date.now() - userTouchedAt.current > TAKEOVER_MS) {
            // The visitor started typing/selecting but didn't send — reset
            // this scene's ready phase and let the demo keep living.
            scheduleRef.current();
            return;
          }
          loopTimers.current.push(setTimeout(trySend, 400));
          return;
        }
        playRef.current(sampleOf(scene), false);
        sceneRef.current = nextScene(scene);
        loopTimers.current.push(setTimeout(() => {
          setStep('composing');
          loopTimers.current.push(setTimeout(() => scheduleRef.current(), COMPOSE_MS));
        }, HOLD_MS));
      };
      trySend();
    }, READY_MS));
  }, [clearLoop]);

  playRef.current = playObject;
  scheduleRef.current = scheduleAuto;

  useEffect(() => {
    if (reduced) {
      setAutoArmed(false);
      return;
    }
    const t = setTimeout(() => scheduleRef.current(), 900);
    return () => clearTimeout(t);
  }, [reduced]);

  const send = () => {
    if (step === 'sending') return;
    const obj: TransferObject = attach ?? { kind: 'text', text: draft.trim() };
    if (obj.kind === 'text' && !obj.text) return;
    userTouched.current = false;
    playRef.current(obj, true);
  };

  const touch = () => {
    if (!userTouched.current) userTouchedAt.current = Date.now();
    userTouched.current = true;
  };

  const canSend = (draft.trim().length > 0 || attach != null) && step !== 'sending';

  const dx = bridge.flyTo.x - bridge.flyFrom.x;
  const dy = bridge.flyTo.y - bridge.flyFrom.y;
  const isSending = step === 'sending';
  const phoneStatus: 'connected' | 'sending' | 'sent' =
    isSending ? 'sending' : (stream.length > 0 || reduced) ? 'sent' : 'connected';
  const laptopStatus: 'connected' | 'receiving' | 'received' =
    isSending ? 'receiving' : landed ? 'received' : 'connected';
  const composerVisible = step === 'ready' || step === 'composing';

  return (
    <div
      ref={containerRef}
      data-step={step}
      data-pending-kind={pending?.kind ?? ''}
      data-landed-kind={landed?.kind ?? ''}
      data-landed-text={landed?.text ?? ''}
      data-auto={autoArmed ? 'on' : 'off'}
      className="relative w-full max-w-[920px] mx-auto select-none min-h-[540px] sm:min-h-[480px] lg:min-h-[520px]"
      aria-hidden
    >
      {/* Connection beam — horizontal on desktop, vertical when stacked. The
          packet travels via transform only (--travel injected from the
          measured geometry) — never `left`/`top`, which would force layout
          every frame. */}
      <div
        className="absolute"
        style={bridge.beam.vertical ? { left: bridge.beam.left, top: bridge.beam.top, height: bridge.beam.height, width: 0, transform: 'translateX(-50%)' } : { left: bridge.beam.left, width: bridge.beam.width, top: bridge.beam.top, transform: 'translateY(-50%)' }}
      >
        <div className={bridge.beam.vertical ? "w-px h-full bg-apple-ink/10 dark:bg-white/10" : "h-px w-full bg-apple-ink/10 dark:bg-white/10"} />
        {!reduced && (
          <div
            className={cn("absolute left-0 w-1.5 h-1.5 rounded-full bg-apple-blue shadow-[0_0_8px_rgba(0,102,204,0.7)]", bridge.beam.vertical ? "top-0 animate-beam-v" : "top-1/2 animate-beam")}
            style={{ ['--travel' as string]: `${bridge.beam.vertical ? bridge.beam.height : bridge.beam.width}px` }}
          />
        )}
      </div>

      {/* Center node — the ShareText mark at the midpoint of the bridge. */}
      <div
        className="absolute w-9 h-9 rounded-full shadow-card flex items-center justify-center bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 z-10"
        style={{
          left: bridge.nodePos.x,
          top: bridge.nodePos.y,
          transform: 'translate(-50%, -50%)',
          opacity: bridge.nodePos.x || bridge.nodePos.y ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        <ShareTextLogo size={18} className="text-apple-blue" />
      </div>

      <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-10 sm:gap-0 px-2 sm:px-6 relative">
        {/* ================= PHONE — the sender. ================= */}
        <div data-device="phone" className="flex flex-col items-center">
          <PhoneFrame className="w-[136px] sm:w-[182px] lg:w-[196px]">
            <div ref={phoneScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={phoneStatus} label="Your phone" />
              {/* Sent stream */}
              <div className="flex-1 flex flex-col justify-end gap-[5px] px-[7px] sm:px-2.5 pb-1.5 overflow-hidden">
                <AnimatePresence initial={false}>
                  {stream.map((obj) => (
                    <motion.div
                      key={obj.uid}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
                      className="self-end max-w-[88%]"
                    >
                      {obj.kind === 'text'
                        ? <TextCard obj={obj} />
                        : <ObjectCard obj={obj} className="w-[64px] sm:w-[88px]" />}
                    </motion.div>
                  ))}
                  {stream.length === 0 && !isSending && (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/60 py-2"
                    >
                      <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-40" />
                      <span className="text-[6px] sm:text-[7px] font-medium">Sent things appear here</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Composer — visible in ready/composing; the object launches
                  from here, so the flight is always cause→effect. */}
              <div ref={composerRef} className="shrink-0 px-[7px] sm:px-2.5 pb-[10px] sm:pb-3 pt-1.5">
                <AnimatePresence mode="wait">
                  {composerVisible ? (
                    <motion.div
                      key={`composer-${step}`}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98, transition: { duration: 0.16 } }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                      className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-[6px] sm:p-2 flex flex-col gap-1.5"
                    >
                      {attach && (
                        <motion.div
                          key={`attach-${attach.kind}`}
                          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                          className="relative rounded-[9px] bg-apple-parchment dark:bg-white/[0.06] p-1 pr-6"
                        >
                          <ObjectCard obj={attach} className="w-[58px] sm:w-[78px]" />
                          <button
                            type="button"
                            onClick={() => setAttach(null)}
                            aria-label="Remove attachment"
                            tabIndex={-1}
                            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-apple-ink/80 dark:bg-white/80 text-white dark:text-night-900 flex items-center justify-center shadow-sm active:scale-90 transition-transform"
                          >
                            <X className="w-2.5 h-2.5" strokeWidth={3} />
                          </button>
                        </motion.div>
                      )}
                      <textarea
                        rows={1}
                        value={draft}
                        onChange={(e) => { setDraft(e.target.value); touch(); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                        }}
                        placeholder={attach ? 'Add a note…' : 'Type or paste anything…'}
                        aria-label="Demo message"
                        className="bg-transparent resize-none outline-none w-full text-[7px] sm:text-[8.5px] leading-snug text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 max-h-[34px]"
                      />
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1">
                          {SAMPLES.map(({ key, label, Icon, object }) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => { setAttach(object); touch(); }}
                              aria-pressed={attach?.kind === key}
                              tabIndex={-1}
                              className={cn(
                                'flex items-center gap-0.5 px-1.5 py-[3px] rounded-full text-[6px] sm:text-[6.5px] font-medium transition-colors',
                                attach?.kind === key
                                  ? 'bg-apple-blue/12 text-apple-blue'
                                  : 'bg-apple-parchment dark:bg-white/[0.06] text-apple-ink-muted hover:text-apple-ink dark:hover:text-white'
                              )}
                            >
                              <Icon className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                              {label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={send}
                          disabled={!canSend}
                          aria-label="Send demo"
                          className={cn(
                            'w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] rounded-full flex items-center justify-center transition-all active:scale-90',
                            canSend
                              ? 'bg-apple-blue text-white shadow-[0_2px_6px_rgba(0,102,204,0.45)]'
                              : 'bg-apple-ink/10 dark:bg-white/10 text-apple-ink-muted/60 cursor-default'
                          )}
                        >
                          <Send className="w-[9px] h-[9px]" strokeWidth={3} />
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
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted/70 font-medium">Sending…</span>
                      <Send className="w-[8px] h-[8px] text-apple-blue/50" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </PhoneFrame>
          <DeviceLabel>Your phone</DeviceLabel>
        </div>

        {/* ================= LAPTOP — the receiver. ================= */}
        <div data-device="laptop" className="flex flex-col items-center">
          <LaptopFrame className="w-[268px] sm:w-[360px] lg:w-[396px]">
            <div ref={laptopScreenRef} className="w-full h-full flex flex-col">
              <RoomHeader status={laptopStatus} label="Your laptop" />
              <div ref={laptopTargetRef} className="flex-1 flex flex-col items-center justify-center gap-[7px] sm:gap-2.5 px-3">
                <AnimatePresence mode="wait">
                  {isSending && !reduced ? (
                    <motion.div
                      key="receiving-progress"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col items-center gap-2 w-full max-w-[160px]"
                    >
                      <div className="w-full h-1 rounded-full bg-apple-ink/10 dark:bg-white/10 overflow-hidden">
                        {/* scaleX with origin-left — animating `width` would
                            force layout every frame; transform stays on the
                            compositor. */}
                        <motion.div
                          className="h-full rounded-full bg-apple-blue origin-left"
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: 0.94 }}
                          transition={{ duration: FLIGHT_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </div>
                      <span className="text-[6.5px] sm:text-[8px] font-medium text-apple-ink-muted flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-apple-blue animate-pulse" />
                        Receiving…
                      </span>
                    </motion.div>
                  ) : landed ? (
                    <motion.div
                      key={`landed-${landed.kind}-${stream.length}`}
                      initial={reduced ? { opacity: 1, y: 0 } : { opacity: 0, y: 12, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ type: 'spring', bounce: 0, duration: 0.55 }}
                      className="flex flex-col items-center gap-1.5 sm:gap-2 relative w-full"
                    >
                      {!reduced && step === 'received' && (
                        <motion.span
                          key={`ring-${landed.kind}-${stream.length}`}
                          initial={{ scale: 0.75, opacity: 0.45 }}
                          animate={{ scale: 1.18, opacity: 0 }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="absolute -inset-2 rounded-[18px] border-2 border-apple-blue/50 pointer-events-none"
                          aria-hidden
                        />
                      )}
                      {landed.kind === 'text' ? (
                        <div className="bg-white dark:bg-[#1c1c1e] border border-apple-divider dark:border-apple-tile-3 rounded-[12px] sm:rounded-[14px] shadow-card p-2.5 sm:p-3 w-full max-w-[200px] sm:max-w-[240px]">
                          <p className="text-[7.5px] sm:text-[9px] leading-snug text-apple-ink dark:text-white whitespace-pre-wrap break-words line-clamp-5">
                            {landed.text}
                          </p>
                        </div>
                      ) : (
                        <ObjectCard obj={landed} className="w-[124px] sm:w-[184px]" />
                      )}
                      <div className="flex items-center gap-1.5 max-w-full">
                        <DeviceStatus state="received" />
                        <span className="text-[5.5px] sm:text-[6.5px] text-apple-ink-muted/70 font-medium truncate">
                          {landed.kind === 'text' ? 'Text message' : `${landed.name || ''}${landed.size ? ` · ${landed.size}` : ''}`}
                        </span>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="waiting"
                      initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-1 text-apple-ink-muted/70"
                    >
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40" />
                      <span className="text-[7px] sm:text-[8px] font-medium">Nothing received yet</span>
                      <span className="text-[6px] sm:text-[7px] text-apple-ink-muted/60">Sent things land here</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </LaptopFrame>
          <DeviceLabel>Your laptop</DeviceLabel>
        </div>
      </div>

      {/* The object in flight — the SAME object the visitor created or the
          auto-run staged. */}
      <AnimatePresence>
        {isSending && !reduced && pending && (
          <motion.div
            key={`fly-${pending.kind}-${stream.length}`}
            className="absolute z-20 pointer-events-none will-change-transform"
            style={{ left: bridge.flyFrom.x, top: bridge.flyFrom.y, transform: 'translate(-50%, -50%)' }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.88, rotate: -2 }}
            animate={
              bridge.beam.vertical
                ? { x: [0, 14, 0], y: [0, dy * 0.42, dy], opacity: [0, 1, 1, 1], scale: [0.88, 1.04, 1, 1.02], rotate: [-2, 1, 0] }
                : { x: [0, dx * 0.34, dx * 0.72, dx], y: [0, -16, -9, 0], opacity: [0, 1, 1, 1], scale: [0.88, 1.04, 1, 1.02], rotate: [-2, 1, 0] }
            }
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: FLIGHT_MS / 1000, times: [0, 0.18, 0.72, 1], ease: [0.32, 0.72, 0, 1] }}
          >
            {pending.kind === 'text'
              ? <div className="max-w-[140px]"><TextCard obj={pending} /></div>
              : <ObjectCard obj={pending} className="w-[76px] sm:w-[112px] shadow-none" />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The invite line — the demo runs on its own, and you can jump in. */}
      <div className="mt-6 sm:mt-7 text-center">
        <p className="text-[12.5px] sm:text-[13.5px] font-medium text-apple-ink-muted dark:text-white/55">
          Live demo — it runs on its own. <span className="hidden sm:inline">Type, paste, or tap a sample to jump in anytime.</span>
        </p>
      </div>
    </div>
  );
}
