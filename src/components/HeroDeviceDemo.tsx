import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import type { MsgKey } from '../lib/messages/types';
import { LaptopFrame } from './mockups/LaptopFrame';
import { PhoneFrame, PhoneStatusBar } from './mockups/PhoneFrame';
import { ShareTextsLogo } from './ShareTextsLogo';
import { IconButton3D } from './IconButton3D';
import { SpinLoader } from './SpinLoader';
import {
  CheckDouble, Lock, Paperclip, PaperPlane, ArrowLeft, Gear, Code, Bars,
} from '@gravity-ui/icons';

/**
 * HeroDeviceDemo — the product explaining itself, in loop.
 *
 * One timeline drives two live device screens and the caption under them, so
 * the words can never drift from the picture: `step` is the single source of
 * truth, every visual state is DERIVED from it, and the caption is looked up
 * by the same index. The loop restarts from step 0 with no reset code —
 * because step 0 IS the resting state of every element.
 *
 * The story, in seven beats (~18s):
 *   0 laptop opens a room and shows its code
 *   1 the phone types that code in
 *   2 connected — the channel draws, "encrypted" appears
 *   3 a note is typed and a file is attached
 *   4 the packet crosses the channel, both ends showing progress
 *   5 it lands, ticks, and the phone answers
 *   6 the room closes — nothing kept — and the scene resets
 *
 * Why it is built this way:
 *   · The screens are REAL DOM at real sizes (no scaled screenshots), so the
 *     text stays sharp and the mini app is genuinely ours: ember bubbles,
 *     our radii, our tokens — not a reskinned WhatsApp mockup.
 *   · Only `step` is state; everything else is a declarative target, so a
 *     beat change is one spring per element instead of a remount. Nothing
 *     pops, nothing re-mounts the tree mid-story.
 *   · The packet animates in TRANSFORMS (x/y in px, measured once) — it
 *     never animates `left`/`top`, so the flight costs no layout.
 *   · Autoplay is paused by: reduced-motion preference, a manual pause, the
 *     demo leaving the viewport, or the tab going to the background. An
 *     infinitely looping animation has no business burning battery off
 *     screen — and the rail doubles as manual stepping, so a paused demo is
 *     still a usable explainer.
 */
const STEPS: { key: MsgKey; ms: number }[] = [
  { key: 'demo.c1', ms: 2400 },
  { key: 'demo.c2', ms: 3000 },
  { key: 'demo.c3', ms: 2600 },
  { key: 'demo.c4', ms: 3000 },
  { key: 'demo.c5', ms: 2800 },
  { key: 'demo.c6', ms: 2800 },
  { key: 'demo.c7', ms: 2600 },
];

const EASE = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.45, 0, 0.25, 1] as const;
/** The overlapping-window fallback if a browser has no IntersectionObserver. */
const ASSUME_VISIBLE = true;

export function HeroDeviceDemo({
  variant = 'full',
  className,
}: {
  /** `full` = laptop + phone (desktop hero). `phone` = phone only (mobile). */
  variant?: 'full' | 'phone';
  className?: string;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  // Reduced motion starts on the most informative frame instead of an empty
  // one: everything landed, ticks on, thread intact — the state a static
  // reader should be handed. The rail still steps it manually.
  const [step, setStep] = useState(() => (reduced ? 5 : 0));
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(ASSUME_VISIBLE);
  const [tabVisible, setTabVisible] = useState(true);

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const running = !reduced && !paused && onScreen && tabVisible && box.w > 0;

  /* ── The clock ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(
      () => setStep((s) => (s + 1) % STEPS.length),
      STEPS[step].ms,
    );
    return () => clearTimeout(timer);
  }, [running, step]);

  /* ── Pause when off screen or in a background tab ───────────────────── */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting),
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setTabVisible(!document.hidden);
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* ── One measurement, for the channel and the flight ────────────────── */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox((prev) =>
        Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
          ? prev
          : { w: r.width, h: r.height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Derived beats. Level IS the step index. ────────────────────────── */
  const linked = step >= 2;
  const composed = step >= 3 && step <= 3; // the composer is typing this beat
  const sent = step >= 4;
  const flying = step >= 4 && step <= 4;
  const arrived = step >= 5;
  const replied = step >= 5;
  const closed = step >= 6;

  const { w, h } = box;
  const px = (fx: number, fy: number) => ({ x: fx * w, y: fy * h });
  /* The channel between the devices, and the packet's three-point arc:
     out of the laptop's screen, over the gap, into the phone's screen. */
  const channel = useMemo(() => {
    if (!w || !h) return '';
    const a = px(0.68, 0.44);
    const b = px(0.75, 0.27);
    return `M ${a.x} ${a.y} C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
  }, [w, h]);
  const flight = useMemo(() => {
    if (!w || !h) return null;
    const start = px(0.4, 0.48);
    const over = px(0.715, 0.34);
    const land = px(0.795, 0.5);
    return { start, over, land };
  }, [w, h]);

  const caption = t(STEPS[step].key);

  /** Click-to-seek on the scrubber: the beat under the pointer, clamped. */
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientX - r.left) / Math.max(r.width, 1);
    setStep(Math.min(STEPS.length - 1, Math.max(0, Math.floor(f * STEPS.length))));
  };

  return (
    <div ref={hostRef} className={cn('w-full select-none', className)} data-testid="hero-demo">
      {/* ── The canvas ─────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className={cn(
          'relative w-full',
          variant === 'full' ? 'aspect-[16/9.8]' : 'aspect-[1/2.16] max-w-[178px] mx-auto',
        )}
      >
        {variant === 'full' && (
          <div className="absolute left-0 top-0 w-[68%]">
            <LaptopFrame label={t('demo.laptopAlt')}>
              <LaptopScreen step={step} composed={composed} sent={sent} arrived={arrived} replied={replied} closed={closed} linked={linked} />
            </LaptopFrame>
          </div>
        )}

        {/* The channel: drawn the moment the two ends are paired, then the
            live pulse rides it during the transfer beat. */}
        {variant === 'full' && channel !== '' && (
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`}
            fill="none"
          >
            <motion.path
              d={channel}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeDasharray="0.5 0"
              className="text-apple-ink/15 dark:text-white/20"
              initial={false}
              animate={{ pathLength: linked ? 1 : 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            />
            {linked && (
              <motion.path
                d={channel}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="7 93"
                className="text-ember"
                initial={{ strokeDashoffset: 100, opacity: 0 }}
                animate={
                  flying
                    ? { strokeDashoffset: [100, 0], opacity: [0, 1, 1, 0] }
                    : { strokeDashoffset: 100, opacity: 0 }
                }
                transition={{ duration: 1.5, ease: EASE_IN_OUT, times: [0, 0.12, 0.85, 1] }}
              />
            )}
          </svg>
        )}

        {/* The packet: a file card that leaves the laptop's screen and lands
            on the phone's. Transform-only, measured, and it dissolves into
            the bubble that receives it — the hand-off reads as one event. */}
        {flight && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0"
            initial={false}
            animate={
              flying
                ? { x: [flight.start.x, flight.over.x, flight.land.x], y: [flight.start.y, flight.over.y, flight.land.y], opacity: 1, scale: 1 }
                : arrived
                  ? { x: flight.land.x, y: flight.land.y, opacity: 0, scale: 0.9 }
                  : { x: flight.start.x, y: flight.start.y, opacity: 0, scale: 0.9 }
            }
            transition={
              flying
                ? { duration: 1.6, ease: EASE_IN_OUT, times: [0, 0.55, 1] }
                : { duration: 0.24, ease: EASE }
            }
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-[5px] rounded-[9px] border border-apple-divider/70 bg-white/95 py-[4px] pl-[4px] pr-[7px] shadow-[0_8px_20px_-8px_rgba(20,16,10,0.5)] backdrop-blur-[2px] dark:border-white/[0.09] dark:bg-night-800/95">
                <span className="flex h-[15px] w-[15px] items-center justify-center rounded-[5px] bg-ember text-[6.5px] font-bold text-white">PDF</span>
                <span className="text-[8.5px] font-semibold leading-none text-apple-ink dark:text-white">plan.pdf</span>
                <SpinLoader size={9} className="text-ember" />
              </div>
            </div>
          </motion.div>
        )}

        {variant === 'full' ? (
          <div className="absolute bottom-0 right-0 w-[25%]">
            <PhoneFrame label={t('demo.phoneAlt')}>
              <PhoneScreen step={step} composed={composed} sent={sent} arrived={arrived} replied={replied} closed={closed} flying={flying} />
            </PhoneFrame>
          </div>
        ) : (
          <div className="absolute inset-0">
            <PhoneFrame label={t('demo.phoneAlt')}>
              <PhoneScreen step={step} composed={composed} sent={sent} arrived={arrived} replied={replied} closed={closed} flying={flying} />
            </PhoneFrame>
          </div>
        )}
      </div>

      {/* ── The captions, wired to the same index ──────────────────────── */}
      <div className="mt-4 sm:mt-5">
        {/* aria-hidden: the visible line loops by design, so it is the wrong
            thing to read to assistive tech. The sr-only list below carries
            all seven beats once, in order, as real content. */}
        <div className="relative min-h-[2.9em]" aria-hidden>
          <AnimatePresence initial={false}>
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 4, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(3px)' }}
              transition={{ duration: reduced ? 0 : 0.32, ease: EASE }}
              className="absolute inset-x-0 top-0 text-[15px] font-medium leading-snug text-apple-ink dark:text-white sm:text-[16px]"
              data-testid="demo-caption"
            >
              {caption}
            </motion.p>
          </AnimatePresence>
        </div>

        <ol className="sr-only" data-testid="demo-caption-list">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i === step ? '' : undefined}>
              {t(s.key)}
            </li>
          ))}
        </ol>

        <div className="mt-3 flex items-center gap-3">
          {/* One scrubber, not seven dots. A 6px dot fails the touch contract
              this app ships on every other control, and a target you can
              actually hit is the difference between a loop you can steer and
              one you just watch. Click anywhere to jump; arrows step; the
              ticks show the seven beats and the ember fill shows how far the
              current one has run. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('demo.rail')}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-valuetext={caption}
            data-testid="demo-scrubber"
            onClick={seek}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setStep((s) => (s + 1) % STEPS.length);
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setStep((s) => (s - 1 + STEPS.length) % STEPS.length);
              } else if (e.key === 'Home') {
                e.preventDefault();
                setStep(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                setStep(STEPS.length - 1);
              }
            }}
            className="group relative flex h-[40px] min-w-0 flex-1 cursor-pointer items-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
          >
            <span className="relative block h-[4px] w-full rounded-full bg-apple-ink/[0.12] transition-colors group-hover:bg-apple-ink/[0.18] dark:bg-white/[0.16] dark:group-hover:bg-white/[0.22]">
              {STEPS.map((s, i) =>
                i === 0 ? null : (
                  <span
                    key={s.key}
                    aria-hidden
                    className="absolute top-[-2px] h-[8px] w-px bg-apple-canvas dark:bg-night-900"
                    style={{ left: `${(i / STEPS.length) * 100}%` }}
                  />
                ),
              )}
              <span
                aria-hidden
                className="absolute left-0 top-0 h-full rounded-full bg-ember/30"
                style={{ width: `${(step / STEPS.length) * 100}%` }}
              />
              <span
                aria-hidden
                className="absolute top-0 h-full overflow-hidden rounded-full"
                style={{ left: `${(step / STEPS.length) * 100}%`, width: `${100 / STEPS.length}%` }}
              >
                <span
                  key={`${step}-${running ? 'run' : 'hold'}`}
                  className="st-demo-fill block h-full w-full origin-left rounded-full bg-ember"
                  style={{
                    animationDuration: `${STEPS[step].ms}ms`,
                    animationPlayState: running ? 'running' : 'paused',
                  }}
                />
              </span>
            </span>
          </div>

          {/* A demo that loops forever must hand back the control. Small,
              quiet, and out of the caption's way — at the component's own
              44×40 minimum, not shrunk below the app's hit-target floor. */}
          {!reduced && (
            <IconButton3D
              label={paused ? t('demo.play') : t('demo.pause')}
              onClick={() => setPaused((p) => !p)}
              className="ml-auto border-black/[0.04] dark:border-white/[0.06]"
              testId="demo-play"
            >
              {paused ? (
                <PlayGlyph className="h-3 w-3" />
              ) : (
                <PauseGlyph className="h-3 w-3" />
              )}
            </IconButton3D>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   The two screens
   ──────────────────────────────────────────────────────────────────────── */

type ScreenProps = {
  step: number;
  composed: boolean;
  sent: boolean;
  arrived: boolean;
  replied: boolean;
  closed: boolean;
};

/** The room code, as the app shows it: six digits, one tile each. */
const CODE = ['4', '1', '8', '3', '0', '2'] as const;

function CodeTiles({
  filled,
  size = 'md',
  highlight = false,
  stagger = false,
}: {
  /** How many digits are there yet. */
  filled: number;
  size?: 'sm' | 'md';
  /** The sender's code is the beat's focal point: it gets an ember ring. */
  highlight?: boolean;
  /** Light the tiles one at a time — the joiner typing the code in. */
  stagger?: boolean;
}) {
  const big = size === 'md';
  return (
    <div className={cn('grid grid-cols-6', big ? 'gap-[3px]' : 'gap-[2px]')}>
      {CODE.map((d, i) => {
        const on = i < filled;
        const delay = stagger && on ? i * 0.15 : 0;
        return (
          <span
            key={i}
            style={{ transitionDelay: `${stagger && on ? i * 150 : 0}ms` }}
            className={cn(
              'flex items-center justify-center rounded-[4px] font-semibold tabular-nums transition-colors duration-200',
              big
                ? 'h-[19px] text-[11px] sm:h-[22px] sm:text-[12.5px]'
                : 'h-[13px] text-[8px]',
              on
                ? cn(
                    'bg-white dark:bg-white/[0.1]',
                    'ring-1',
                    highlight
                      ? 'ring-ember/35 dark:ring-ember/30'
                      : 'ring-apple-divider/80 dark:ring-white/[0.12]',
                  )
                : 'bg-black/[0.05] ring-1 ring-transparent dark:bg-white/[0.05]',
            )}
          >
            {on && (
              <motion.span
                initial={{ opacity: 0, y: -2, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay, type: 'spring', stiffness: 520, damping: 28 }}
              >
                {d}
              </motion.span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** The typing line — kept in its own component so the keystrokes re-render
 *  one line instead of the whole demo. */
function TypingLine({
  text,
  active,
  className,
  caretClassName,
}: {
  text: string;
  active: boolean;
  className?: string;
  caretClassName?: string;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    let tick: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      let i = 0;
      tick = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length && tick) clearInterval(tick);
      }, 38);
    }, 240);
    return () => {
      clearTimeout(start);
      if (tick) clearInterval(tick);
    };
  }, [active, text]);

  return (
    <span className={className}>
      {text.slice(0, n)}
      {active && n < text.length && (
        <span className={cn('ml-[1px] inline-block w-[1px] bg-current align-middle', caretClassName)} style={{ height: '1em' }} />
      )}
    </span>
  );
}

function LaptopScreen({
  step, composed, sent, arrived, replied, closed, linked,
}: ScreenProps & { linked: boolean }) {
  const { t } = useI18n();
  const note = t('demo.note');

  return (
    <div className="relative flex h-full w-full flex-col bg-white text-apple-ink dark:bg-night-900 dark:text-white">
      <div className="flex min-h-0 flex-1">
        {/* Rail: brand · the code · who's here. */}
        <div className="hidden w-[32%] shrink-0 flex-col gap-[8px] border-r border-apple-divider/70 bg-apple-parchment/60 p-[9px] dark:border-white/[0.06] dark:bg-white/[0.02] sm:flex">
          <div className="flex items-center gap-[4px]">
            <ShareTextsLogo size={11} />
            <span className="font-display text-[9.5px] font-bold tracking-[-0.02em]">ShareTexts</span>
          </div>

          <div className={cn(
            'rounded-[9px] border bg-white p-[7px] transition-colors duration-300 dark:bg-white/[0.04]',
            step <= 1 ? 'border-ember/30 dark:border-ember/25' : 'border-apple-divider/60 dark:border-white/[0.07]',
          )}>
            <span className="mb-[5px] block text-[7px] font-bold uppercase tracking-[0.09em] text-apple-ink-muted/80 dark:text-white/40">
              {t('demo.roomCode')}
            </span>
            <CodeTiles filled={6} highlight={step <= 1} />
          </div>

          <div className="flex flex-col gap-[5px]">
            {[
              { key: 'here', name: t('demo.thisDevice'), state: t('demo.ready'), ok: true },
              { key: 'there', name: t('demo.thatDevice'), state: linked ? t('demo.connected') : t('demo.waiting'), ok: linked },
            ].map((row) => (
              <div key={row.key} className="flex items-center gap-[5px]">
                <span
                  className={cn(
                    'h-[5px] w-[5px] shrink-0 rounded-full transition-colors duration-300',
                    row.ok ? 'bg-[#34c759]' : 'bg-apple-ink/20 dark:bg-white/25',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[8.5px] font-medium leading-none">{row.name}</span>
                <span className={cn(
                  'shrink-0 text-[7.5px] leading-none transition-colors',
                  row.ok ? 'text-[#2b9e49] dark:text-[#4fd071]' : 'text-apple-ink-muted/70 dark:text-white/35',
                )}>
                  {row.state}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 rounded-[8px] border border-apple-divider/50 px-[6px] py-[5px] dark:border-white/[0.06]">
            <span className="truncate text-[7.5px] font-medium text-apple-ink-muted dark:text-white/45">{t('demo.stay')}</span>
            <span className="relative h-[9px] w-[16px] shrink-0 rounded-full bg-[#34c759]">
              <span className="absolute right-[1px] top-[1px] h-[7px] w-[7px] rounded-full bg-white" />
            </span>
          </div>
        </div>

        {/* Thread. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-apple-divider/70 px-[10px] py-[7px] dark:border-white/[0.06]">
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-semibold leading-tight">{t('demo.room')}</span>
              <span className="block truncate text-[8px] leading-tight text-apple-ink-muted dark:text-white/40">
                {linked ? t('demo.twoDevices') : t('demo.oneDevice')}
              </span>
            </span>
            <AnimatePresence initial={false}>
              {linked && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.26, ease: EASE }}
                  className="flex shrink-0 items-center gap-[3px] rounded-full bg-ember/10 px-[6px] py-[3px] text-[7.5px] font-semibold text-ember dark:bg-ember/[0.16] dark:text-[#fb9243]"
                >
                  <Lock className="h-[8px] w-[8px]" />
                  {t('demo.encrypted')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-end gap-[6px] overflow-hidden p-[10px]">
            <AnimatePresence initial={false}>
              {/* Before anything is sent, the room offers what the real room
                  offers: the three one-tap starters, in the real words. It
                  fills the empty thread honestly and teaches the same thing
                  the live app teaches — no invented placeholder copy. */}
              {step <= 3 && (
                <motion.div
                  key="starters"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="flex flex-1 flex-col items-center justify-center gap-[5px]"
                >
                  <div className="flex flex-wrap items-center justify-center gap-[4px]">
                    {(['chat.suggest.hi', 'chat.suggest.photo', 'chat.suggest.link'] as MsgKey[]).map((k) => (
                      <span
                        key={k}
                        className="flex h-[16px] items-center rounded-full border border-apple-divider/80 bg-white/70 px-[6px] text-[7.5px] font-semibold text-apple-ink/70 dark:border-white/[0.12] dark:bg-white/[0.05] dark:text-white/60"
                      >
                        {t(k)}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
              {sent && (
                <motion.div
                  key="note"
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="flex flex-col items-end gap-[4px]"
                >
                  <span className="max-w-[80%] rounded-[11px] rounded-br-[4px] bg-ember px-[9px] py-[6px] text-[10px] leading-snug text-white shadow-[0_2px_6px_-2px_rgba(240,100,19,0.5)]">
                    {note}
                  </span>
                  <FileChip arrived={arrived} />
                </motion.div>
              )}
              {replied && (
                <motion.span
                  key="reply"
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="max-w-[80%] self-start rounded-[11px] rounded-bl-[4px] bg-apple-parchment px-[9px] py-[6px] text-[10px] leading-snug text-apple-ink dark:bg-white/[0.07] dark:text-white"
                >
                  {t('demo.reply')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Composer — with the formatting row, because formatting is real. */}
          <div className="shrink-0 border-t border-apple-divider/70 px-[9px] py-[7px] dark:border-white/[0.06]">
            <div className="mb-[6px] flex items-center gap-[3px] text-apple-ink-muted/70 dark:text-white/35">
              {[1, 2, 3, 4].map((k) => (
                <span key={k} className="flex h-[13px] w-[13px] items-center justify-center rounded-[4px] bg-black/[0.04] text-[7px] font-bold dark:bg-white/[0.06]">
                  {k === 1 ? 'B' : k === 2 ? 'I' : k === 3 ? <Code className="h-[7px] w-[7px]" /> : <Bars className="h-[7px] w-[7px]" />}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-[7px]">
              <span className="flex min-w-0 flex-1 items-center gap-[6px] rounded-full bg-black/[0.045] px-[8px] py-[5px] text-[9.5px] dark:bg-white/[0.06]">
                <Paperclip className="h-[9px] w-[9px] shrink-0 text-apple-ink-muted dark:text-white/40" />
                <span className="min-w-0 flex-1 truncate text-apple-ink dark:text-white">
                  {composed ? (
                    <TypingLine text={note} active className="text-apple-ink dark:text-white" />
                  ) : (
                    <span className="text-apple-ink-muted dark:text-white/35">{t('demo.placeholder')}</span>
                  )}
                </span>
                {composed && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                    className="flex shrink-0 items-center gap-[3px] rounded-full bg-ember/10 px-[5px] py-[2px] text-[7.5px] font-semibold text-ember dark:bg-ember/[0.16] dark:text-[#fb9243]"
                  >
                    plan.pdf
                  </motion.span>
                )}
              </span>
              <motion.span
                animate={composed || sent ? { scale: 1, backgroundColor: '#f06413' } : { scale: 0.94, backgroundColor: 'rgba(30,28,24,0.14)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full text-white"
              >
                <PaperPlane className="h-[10px] w-[10px]" />
              </motion.span>
            </div>
          </div>
        </div>
      </div>

      <RoomClosedVeil closed={closed} />
    </div>
  );
}

function PhoneScreen({
  step, arrived, replied, closed, flying,
}: ScreenProps & { flying: boolean }) {
  const { t } = useI18n();
  const joined = step >= 2;
  const typedCells = step >= 1 ? CODE.length : 0;
  const joinReady = typedCells === CODE.length;

  return (
    <div className="relative flex h-full w-full flex-col bg-apple-canvas dark:bg-night-900">
      <PhoneStatusBar />

      <AnimatePresence mode="popLayout" initial={false}>
        {!joined ? (
          <motion.div
            key="join"
            initial={false}
            exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
            transition={{ duration: 0.26, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col px-[7%] pb-[6%]"
          >
            <div className="flex items-center gap-[4px] pb-[8%]">
              <ArrowLeft className="h-[9px] w-[9px] text-apple-ink-muted dark:text-white/45" />
              <span className="font-display text-[8.5px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white">ShareTexts</span>
            </div>
            <span className="text-[10px] font-semibold leading-tight text-apple-ink dark:text-white">{t('demo.joinTitle')}</span>
            <span className="mt-[3px] text-[7.5px] leading-tight text-apple-ink-muted dark:text-white/45">{t('demo.joinHint')}</span>
            <div className="mt-[9%]">
              <CodeTiles filled={typedCells} size="sm" stagger />
            </div>
            <span
              className={cn(
                'mt-[10%] flex items-center justify-center rounded-full py-[6px] text-[8.5px] font-semibold transition-colors duration-300',
                joinReady
                  ? 'bg-ember text-white'
                  : 'bg-black/[0.06] text-apple-ink-muted dark:bg-white/[0.07] dark:text-white/40',
              )}
            >
              {t('demo.join')}
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="room"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-[6px] border-b border-apple-divider/70 px-[7%] py-[4%] dark:border-white/[0.06]">
              <ArrowLeft className="h-[9px] w-[9px] shrink-0 text-apple-ink-muted dark:text-white/45" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[8.5px] font-semibold leading-tight text-apple-ink dark:text-white">{t('demo.room')}</span>
                <span className="flex items-center gap-[3px] text-[7px] leading-tight text-[#2b9e49] dark:text-[#4fd071]">
                  <span className="h-[4px] w-[4px] rounded-full bg-[#34c759]" />
                  {t('demo.connected')}
                </span>
              </span>
              <Gear className="h-[9px] w-[9px] shrink-0 text-apple-ink-muted dark:text-white/40" />
            </div>

            {/* Thread */}
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-[5px] overflow-hidden px-[6%] py-[5%]">
              <AnimatePresence initial={false}>
                {/* Same three starters the phone's real empty room shows,
                    stacked the way they wrap on a narrow screen. Before the
                    first message the phone is not "blank" — it is waiting
                    with something to tap. */}
                {step <= 3 && (
                  <motion.div
                    key="starters"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex flex-1 flex-col items-center justify-center gap-[4px]"
                  >
                    {(['chat.suggest.hi', 'chat.suggest.photo', 'chat.suggest.link'] as MsgKey[]).map((k) => (
                      <span
                        key={k}
                        className="flex h-[15px] max-w-full items-center truncate rounded-full border border-apple-divider/80 bg-white/70 px-[6px] text-[7.5px] font-semibold text-apple-ink/70 dark:border-white/[0.12] dark:bg-white/[0.05] dark:text-white/60"
                      >
                        {t(k)}
                      </span>
                    ))}
                  </motion.div>
                )}
                {flying && (
                  <motion.span
                    key="receiving"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mb-[2px] flex items-center gap-[4px] self-center rounded-full bg-white px-[6px] py-[3px] text-[7px] font-medium text-apple-ink-muted shadow-[0_1px_3px_rgba(20,16,10,0.08)] dark:bg-white/[0.08] dark:text-white/60"
                  >
                    <SpinLoader size={8} className="text-ember" />
                    {t('demo.receiving')}
                  </motion.span>
                )}
                {arrived && (
                  <>
                    <motion.span
                      key="note-in"
                      initial={{ opacity: 0, y: 9, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className="max-w-[86%] self-start rounded-[10px] rounded-bl-[4px] bg-white px-[7px] py-[5px] text-[8.5px] leading-snug text-apple-ink shadow-[0_1px_3px_rgba(20,16,10,0.07)] dark:bg-white/[0.08] dark:text-white"
                    >
                      {t('demo.note')}
                    </motion.span>
                    <motion.div
                      key="file-in"
                      initial={{ opacity: 0, y: 9, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.06 }}
                      className="self-start"
                    >
                      <FileChip arrived side="in" compact />
                    </motion.div>
                  </>
                )}
                {replied && (
                  <motion.span
                    key="reply-out"
                    initial={{ opacity: 0, y: 9, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.2 }}
                    className="max-w-[86%] self-end rounded-[10px] rounded-br-[4px] bg-ember px-[7px] py-[5px] text-[8.5px] leading-snug text-white shadow-[0_2px_6px_-2px_rgba(240,100,19,0.5)]"
                  >
                    {t('demo.reply')}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Composer */}
            <div className="flex shrink-0 items-center gap-[5px] border-t border-apple-divider/70 px-[6%] py-[4%] dark:border-white/[0.06]">
              <span className="flex min-w-0 flex-1 items-center gap-[4px] rounded-full bg-black/[0.045] px-[6px] py-[4px] text-[7.5px] text-apple-ink-muted dark:bg-white/[0.06] dark:text-white/35">
                <Paperclip className="h-[8px] w-[8px] shrink-0" />
                <span className="truncate">{t('demo.placeholder')}</span>
              </span>
              <span className={cn(
                'flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                replied ? 'bg-ember text-white' : 'bg-black/[0.08] text-apple-ink-muted dark:bg-white/[0.09] dark:text-white/40',
              )}>
                <PaperPlane className="h-[8px] w-[8px]" />
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RoomClosedVeil closed={closed} />
    </div>
  );
}

/**
 * The file the story sends — one component, both sides of the transfer.
 *
 * `side="out"` carries the live states (a progress ring, then the tick) and
 * wears the sender's ember; `side="in"` is the same object after it landed,
 * quiet, white, tick-free — a receiver doesn't need to be told it worked
 * twice. Same geometry on both ends, so the hand-off reads as one object
 * that moved rather than two that resemble each other.
 */
function FileChip({
  arrived,
  side = 'out',
  compact = false,
}: {
  arrived: boolean;
  side?: 'out' | 'in';
  compact?: boolean;
}) {
  const out = side === 'out';
  return (
    <span
      className={cn(
        'flex items-center gap-[5px] shadow-[0_2px_6px_-2px_rgba(20,16,10,0.28)]',
        out ? 'bg-ember text-white' : 'bg-white text-apple-ink dark:bg-white/[0.08] dark:text-white',
        compact
          ? 'rounded-[10px] rounded-bl-[4px] px-[6px] py-[4px]'
          : 'rounded-[11px] rounded-br-[4px] px-[8px] py-[5px]',
      )}
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-[4px] font-bold leading-none',
          compact ? 'h-[13px] w-[13px] text-[5.5px]' : 'h-[14px] w-[14px] text-[6px]',
          out ? 'bg-white/25' : 'bg-ember/12 text-ember',
        )}
      >
        PDF
      </span>
      <span className={cn('font-semibold leading-none', compact ? 'text-[8px]' : 'text-[8.5px]')}>plan.pdf</span>
      <span
        className={cn(
          'leading-none',
          compact ? 'text-[7px]' : 'text-[7.5px]',
          out ? 'opacity-70' : 'text-apple-ink-muted dark:text-white/45',
        )}
      >
        2.4 MB
      </span>
      {out && (
        <AnimatePresence mode="wait" initial={false}>
          {arrived ? (
            <motion.span key="tick" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
              <CheckDouble className={compact ? 'h-[8px] w-[8px]' : 'h-[9px] w-[9px]'} />
            </motion.span>
          ) : (
            <motion.span key="ring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SpinLoader size={compact ? 8 : 9} />
            </motion.span>
          )}
        </AnimatePresence>
      )}
    </span>
  );
}

/** The close beat: the room empties and dims, then the loop starts over. */
function RoomClosedVeil({ closed }: { closed: boolean }) {
  const { t } = useI18n();
  return (
    <AnimatePresence>
      {closed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="absolute inset-0 flex items-center justify-center bg-apple-canvas/70 backdrop-blur-[1.5px] dark:bg-night-950/70"
        >
          {/* Dark side: a white stamp needs INK-dark text — but --color-apple-ink
              FLIPS to near-white inside .dark, so the token here is the canvas
              (which stays #131315 in dark scope). text-apple-ink here rendered
              white-on-white: a blank pill where "Room closed" should read. */}
          <span className="rounded-full bg-apple-ink/85 px-[8px] py-[4px] text-[8px] font-semibold text-white dark:bg-white/90 dark:text-apple-canvas">
            {t('demo.closed')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
const PlayGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);
const PauseGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <rect x="7" y="5.5" width="3.4" height="13" rx="1.2" />
    <rect x="13.6" y="5.5" width="3.4" height="13" rx="1.2" />
  </svg>
);

export default HeroDeviceDemo;
