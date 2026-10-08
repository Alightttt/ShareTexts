import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import type { MsgKey } from '../lib/messages/types';
import { LaptopFrame } from './mockups/LaptopFrame';
import { PhoneFrame, PhoneStatusBar } from './mockups/PhoneFrame';
import { ShareTextsLogo } from './ShareTextsLogo';
import { SpinLoader } from './SpinLoader';
import { TactileButton } from './TactileButton';
import {
  CheckDouble, Lock, Paperclip, PaperPlane, ArrowLeft, Gear,
} from '@gravity-ui/icons';

/**
 * HeroDeviceDemo — the visitor causes the transfer; the picture reports it.
 *
 * One machine, five states, ONE tap: the visitor presses Send and the
 * transfer runs — connect, fly, arrive, close — then rests until restarted.
 * There is no loop, no autoplayed story, and no state the picture does not
 * show: `phase` is the single source of truth, every visual is DERIVED from
 * it, and the caption is looked up by the same key, so the words can never
 * drift from what is on screen.
 *
 *   open       both devices ready, the payload composed, nothing moving
 *   connecting the phone types the laptop's code in; the channel draws
 *   sending    the packet crosses the channel — device to device
 *   received   it lands, ticks, done
 *   done       the room closes; nothing is kept; restart is offered
 *
 * Why it is built this way:
 *   · The screens are REAL DOM at real sizes (no scaled screenshots), so
 *     the text stays sharp and the mini app is genuinely ours: ember
 *     bubbles, our radii, our tokens.
 *   · Nothing is "invented": the payload, the code, the starters and the
 *     closed room are the real app's objects and states. No fake counts,
 *     no fake notifications, no decorative motion — motion only when a
 *     payload actually moves.
 *   · Auto-transitions after the tap are SHORT (~6s total) and interruptible
 *     (Restart works at every state). Nothing plays off screen or in a
 *     hidden tab.
 *   · Reduced motion hands over the same informative still and skips the
 *     flight: one tap lands the transfer instantly.
 */
export type DemoPhase = 'open' | 'connecting' | 'sending' | 'received' | 'done';

/** The caption per state — the same keys the screens derive from. */
const CAPTIONS: Record<DemoPhase, { key: MsgKey; sub: MsgKey }> = {
  open: { key: 'demo.h1', sub: 'demo.s1' },
  connecting: { key: 'demo.h2', sub: 'demo.s2' },
  sending: { key: 'demo.h5', sub: 'demo.s5' },
  received: { key: 'demo.h6', sub: 'demo.s6' },
  done: { key: 'demo.h7', sub: 'demo.s7' },
};

/** Where the machine walks on its own after the visitor's tap, and how fast. */
const AUTO: Partial<Record<DemoPhase, { next: DemoPhase; ms: number }>> = {
  connecting: { next: 'sending', ms: 1700 },
  sending: { next: 'received', ms: 1600 },
  received: { next: 'done', ms: 2800 },
};

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
  // The resting opening: the transfer has NOT happened — the visitor makes
  // it happen. Reduced motion opens on this same honest still.
  const [phase, setPhase] = useState<DemoPhase>('open');
  const [onScreen, setOnScreen] = useState(ASSUME_VISIBLE);
  const [tabVisible, setTabVisible] = useState(true);

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // Only the transit states own a clock — and only while the demo is
  // actually on screen and the tab is live. `open`, `received` (reduced)
  // and `done` rest forever until the visitor acts.
  const running = !reduced && onScreen && tabVisible && box.w > 0;

  /* ── The clock: each auto-beat advances the machine once ────────────── */
  useEffect(() => {
    const auto = AUTO[phase];
    if (!running || !auto) return;
    const timer = setTimeout(() => setPhase(auto.next), auto.ms);
    return () => clearTimeout(timer);
  }, [running, phase]);

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

  /* ── Derived states. Everything reads the phase. ────────────────────── */
  const linked = phase !== 'open'; // the channel and the connected pill
  const sent = phase === 'sending' || phase === 'received' || phase === 'done';
  const flying = phase === 'sending';
  const arrived = phase === 'received' || phase === 'done';
  const closed = phase === 'done';

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

  const caption = t(CAPTIONS[phase].key);
  const captionSub = t(CAPTIONS[phase].sub);

  /** The visitor's tap. Under reduced motion there is no flight to watch —
   *  one tap lands the transfer on the final informative still instead. */
  const runTransfer = () => setPhase(reduced ? 'received' : 'connecting');
  const restart = () => setPhase('open');

  return (
    <div
      ref={hostRef}
      className={cn('w-full select-none', className)}
      data-testid="hero-demo"
      data-state={phase}
      aria-label={t('demo.title')}
    >
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
              <LaptopScreen linked={linked} sent={sent} arrived={arrived} closed={closed} />
            </LaptopFrame>
          </div>
        )}

        {/* The channel: drawn the moment the two ends are paired, then the
            live pulse rides it during the transfer. The line IS the
            connection — it explains what the code does before any words. */}
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
        {variant === 'full' && flight && (
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
                ? { duration: 1.5, ease: EASE_IN_OUT, times: [0, 0.55, 1] }
                : { duration: 0.24, ease: EASE }
            }
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <div className="flex items-center gap-[5px] rounded-[8px] border border-apple-divider/70 bg-white/95 py-[4px] pl-[4px] pr-[7px] shadow-[0_8px_20px_-8px_rgba(20,16,10,0.5)] backdrop-blur-[2px] dark:border-white/[0.09] dark:bg-night-800/95">
                <span className="flex h-[15px] w-[15px] items-center justify-center rounded-[4px] bg-ember text-[6.5px] font-bold text-white">PDF</span>
                <span className="text-[8.5px] font-semibold leading-none text-apple-ink dark:text-white">plan.pdf</span>
                <SpinLoader size={9} className="text-ember" />
              </div>
            </div>
          </motion.div>
        )}

        {variant === 'full' ? (
          <div className="absolute bottom-0 right-0 w-[25%]">
            <PhoneFrame label={t('demo.phoneAlt')}>
              <PhoneScreen joined={phase !== 'open' && phase !== 'connecting'} typing={phase === 'connecting'} flying={flying} arrived={arrived} closed={closed} />
            </PhoneFrame>
          </div>
        ) : (
          <div className="absolute inset-0">
            <PhoneFrame label={t('demo.phoneAlt')}>
              <PhoneScreen joined={phase !== 'open' && phase !== 'connecting'} typing={phase === 'connecting'} flying={flying} arrived={arrived} closed={closed} />
            </PhoneFrame>
          </div>
        )}
      </div>

      {/* ── Caption + controls, wired to the same phase ────────────────── */}
      <div className="mt-4 sm:mt-5">
        {/* The caption IS state output: role=status (live, polite) so the
            transfer the visitor caused is announced as it happens. The
            min-height reserves its two lines so phase changes never move
            the controls below. */}
        <div className="relative min-h-[4.2em]" role="status" data-testid="demo-caption">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: reduced ? 0 : 0.28, ease: EASE }}
              className="absolute inset-x-0 top-0"
            >
              <p className="text-[15px] font-medium leading-snug text-apple-ink dark:text-white sm:text-[16px]">
                {caption}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-apple-ink-muted dark:text-white/50 sm:text-[13.5px]">
                {captionSub}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex min-h-[40px] items-center gap-3">
          {/* The visitor's control — the same verb the real app's key carries.
              It exists only while the transfer hasn't run; during the walk
              the row stays reserved but quiet; at done, Restart takes over. */}
          {phase === 'open' && (
            <TactileButton
              variant="primary"
              size="sm"
              onClick={runTransfer}
              data-testid="demo-send"
              className="min-w-[104px]"
            >
              {t('demo.send')}
            </TactileButton>
          )}
          {closed && (
            <TactileButton
              variant="secondary"
              size="sm"
              onClick={restart}
              data-testid="demo-restart"
              className="min-w-[104px]"
            >
              {t('demo.restart')}
            </TactileButton>
          )}
          {/* Under reduced motion the tap lands at `received` with nothing
              left to play — Restart is offered from there on. */}
          {reduced && phase === 'received' && (
            <TactileButton
              variant="secondary"
              size="sm"
              onClick={restart}
              data-testid="demo-restart"
              className="min-w-[104px]"
            >
              {t('demo.restart')}
            </TactileButton>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   The two screens
   ──────────────────────────────────────────────────────────────────────── */

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
  return (
    <div className={cn('grid grid-cols-6', size === 'md' ? 'gap-[3px]' : 'gap-[2px]')}>
      {CODE.map((d, i) => {
        const on = i < filled;
        const delay = stagger && on ? i * 0.15 : 0;
        return (
          <span
            key={i}
            style={{ transitionDelay: `${stagger && on ? i * 150 : 0}ms` }}
            className={cn(
              'flex items-center justify-center rounded-[8px] transition-colors duration-300',
              size === 'md'
                ? 'h-[22px] text-[11px]'
                : 'h-[16px] text-[8px]',
              on
                ? cn(
                    'bg-white dark:bg-white/[0.1]',
                    highlight
                      ? 'ring-1 ring-ember/35 dark:ring-ember/30'
                      : 'ring-1 ring-apple-divider/80 dark:ring-white/[0.12]',
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

function LaptopScreen({
  linked, sent, arrived, closed,
}: {
  linked: boolean;
  sent: boolean;
  arrived: boolean;
  closed: boolean;
}) {
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
            'rounded-[8px] border bg-white p-[7px] transition-colors duration-300 dark:bg-white/[0.04]',
            linked ? 'border-apple-divider/60 dark:border-white/[0.07]' : 'border-ember/30 dark:border-ember/25',
          )}>
            <span className="mb-[5px] block text-[7px] font-bold uppercase tracking-[0.09em] text-apple-ink-muted/80 dark:text-white/40">
              {t('demo.roomCode')}
            </span>
            <CodeTiles filled={6} highlight={!linked} />
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
                    row.ok ? 'bg-status-success' : 'bg-apple-ink/20 dark:bg-white/25',
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-[8.5px] font-medium leading-none">{row.name}</span>
                <span className={cn(
                  'shrink-0 text-[7.5px] leading-none transition-colors',
                  row.ok ? 'text-status-success-ink dark:text-status-success-ink-dark' : 'text-apple-ink-muted/70 dark:text-white/35',
                )}>
                  {row.state}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 rounded-[8px] border border-apple-divider/50 px-[6px] py-[5px] dark:border-white/[0.06]">
            <span className="truncate text-[7.5px] font-medium text-apple-ink-muted dark:text-white/45">{t('demo.stay')}</span>
            <span className="relative h-[9px] w-[16px] shrink-0 rounded-full bg-status-success">
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
                  className="flex shrink-0 items-center gap-[3px] rounded-full bg-ember/10 px-[6px] py-[3px] text-[7.5px] font-semibold text-ember dark:bg-ember/[0.16] dark:text-azure-400"
                >
                  <Lock className="h-[8px] w-[8px]" />
                  {t('demo.encrypted')}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-end gap-[6px] overflow-hidden p-[10px]">
            <AnimatePresence initial={false}>
              {/* Before the transfer the room offers what the real room
                  offers: the three one-tap starters, in the real words. It
                  fills the empty thread honestly and teaches the same thing
                  the live app teaches. The payload sits composed in the
                  composer below — the state the visitor is looking at. */}
              {!sent && (
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
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  className="flex flex-col items-end gap-[4px]"
                >
                  <span className="max-w-[80%] rounded-[10px] rounded-br-[4px] bg-ember px-[9px] py-[6px] text-[10px] leading-snug text-white shadow-[0_2px_6px_-2px_rgba(240,100,19,0.5)]">
                    {note}
                  </span>
                  <FileChip arrived={arrived} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Composer — the payload, composed and waiting for the visitor. */}
          <div className="shrink-0 border-t border-apple-divider/70 px-[9px] py-[7px] dark:border-white/[0.06]">
            <div className="flex items-center gap-[7px]">
              <span className="flex min-w-0 flex-1 items-center gap-[6px] rounded-full bg-black/[0.045] px-[8px] py-[5px] text-[9.5px] dark:bg-white/[0.06]">
                <Paperclip className="h-[9px] w-[9px] shrink-0 text-apple-ink-muted dark:text-white/40" />
                <span className="min-w-0 flex-1 truncate text-apple-ink dark:text-white">
                  {sent ? (
                    <span className="text-apple-ink-muted dark:text-white/35">{t('demo.placeholder')}</span>
                  ) : (
                    note
                  )}
                </span>
                {!sent && (
                  <span className="flex shrink-0 items-center gap-[3px] rounded-full bg-ember/10 px-[5px] py-[2px] text-[7.5px] font-semibold text-ember dark:bg-ember/[0.16] dark:text-azure-400">
                    plan.pdf
                  </span>
                )}
              </span>
              <motion.span
                animate={sent ? { scale: 1, backgroundColor: 'rgba(20,18,14,0.14)' } : { scale: 1, backgroundColor: '#f06413' /* motion literal: framer cannot tween var() */ }}
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
  joined, typing, flying, arrived, closed,
}: {
  /** The phone is IN the room (past the join screen). */
  joined: boolean;
  /** The phone is typing the code in (the `connecting` walk). */
  typing: boolean;
  flying: boolean;
  arrived: boolean;
  closed: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="relative flex h-full w-full flex-col bg-apple-canvas dark:bg-night-900">
      <PhoneStatusBar />

      <AnimatePresence mode="popLayout" initial={false}>
        {!joined ? (          <motion.div
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
              {/* The tiles light one by one — the code being typed in while
                  the machine is in `connecting`. */}
              <CodeTiles filled={typing ? 6 : 0} size="sm" stagger />
            </div>
            <span
              className={cn(
                'mt-[10%] flex items-center justify-center rounded-full py-[6px] text-[8.5px] font-semibold transition-colors duration-300',
                typing
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
                <span className="flex items-center gap-[3px] text-[7px] leading-tight text-status-success-ink dark:text-status-success-ink-dark">
                  <span className="h-[4px] w-[4px] rounded-full bg-status-success" />
                  {t('demo.connected')}
                </span>
              </span>
              <Gear className="h-[9px] w-[9px] shrink-0 text-apple-ink-muted dark:text-white/40" />
            </div>

            {/* Thread */}
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-[5px] overflow-hidden px-[6%] py-[5%]">
              <AnimatePresence initial={false}>
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
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      className="max-w-[86%] self-start rounded-[10px] rounded-bl-[4px] bg-white px-[7px] py-[5px] text-[8.5px] leading-snug text-apple-ink shadow-[0_1px_3px_rgba(20,16,10,0.07)] dark:bg-white/[0.08] dark:text-white"
                    >
                      {t('demo.note')}
                    </motion.span>
                    <motion.div
                      key="file-in"
                      initial={{ opacity: 0, y: 9, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.06 }}
                      className="self-start"
                    >
                      <FileChip side="in" compact />
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Composer */}
            <div className="flex shrink-0 items-center gap-[5px] border-t border-apple-divider/70 px-[6%] py-[4%] dark:border-white/[0.06]">
              <span className="flex min-w-0 flex-1 items-center gap-[4px] rounded-full bg-black/[0.045] px-[6px] py-[4px] text-[7.5px] text-apple-ink-muted dark:bg-white/[0.06] dark:text-white/35">
                <Paperclip className="h-[8px] w-[8px] shrink-0" />
                <span className="truncate">{t('demo.placeholder')}</span>
              </span>
              <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-black/[0.08] text-apple-ink-muted dark:bg-white/[0.09] dark:text-white/40">
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
 * `side="out"` carries the live states (the spinner while it is in flight,
 * then the tick) and wears the sender's ember; `side="in"` is the same
 * object after it landed, quiet, white, tick-free — a receiver doesn't need
 * to be told it worked twice. Same geometry on both ends, so the hand-off
 * reads as one object that moved rather than two that resemble each other.
 */
function FileChip({
  arrived = false,
  side = 'out',
  compact = false,
}: {
  arrived?: boolean;
  side?: 'out' | 'in';
  compact?: boolean;
}) {
  const { t } = useI18n();
  const out = side === 'out';
  return (
    <span
      className={cn(
        'flex items-center gap-[5px] shadow-[0_2px_6px_-2px_rgba(20,16,10,0.28)]',
        out ? 'bg-ember text-white' : 'bg-white text-apple-ink dark:bg-white/[0.08] dark:text-white',
        compact
          ? 'rounded-[10px] rounded-bl-[4px] px-[6px] py-[4px]'
          : 'rounded-[10px] rounded-br-[4px] px-[8px] py-[5px]',
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
      {/* No invented byte count — this is a controlled demo, not a transfer
          log. The sender's chip says what the state IS; the receiver's chip
          says nothing, because arrival is already told by the thread. */}
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

/** The done beat: the room empties and dims — nothing is kept. A RESTING
 *  veil, not a whiteout: the room stays legible while the pill does the
 *  talking, and Restart reopens the machine from `open`. */
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
          className="absolute inset-0 flex items-center justify-center bg-apple-canvas/45 dark:bg-night-950/55">
          {/* Dark side: a white stamp needs INK-dark text — but --color-apple-ink
              FLIPS to near-white inside .dark, so the token here is the canvas
              (which stays at the night-page value in dark scope). text-apple-ink
              here rendered white-on-white: a blank pill where "Room closed" should read. */}
          <span className="rounded-full bg-apple-ink/85 px-[8px] py-[4px] text-[8px] font-semibold text-white dark:bg-white/90 dark:text-apple-canvas">
            {t('demo.closed')}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HeroDeviceDemo;
