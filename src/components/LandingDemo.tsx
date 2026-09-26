import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Type as TypeIcon, Link2, Image as ImageIcon, Files, Check, Loader2,
  Smartphone, Monitor, ShieldCheck,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * LandingDemo — the hero's interactive demonstration.
 *
 * Two device tiles (this ⇄ other), one obvious action: pick a kind of
 * object — it stages on THIS DEVICE immediately — then Send, and watch it
 * cross the same gap the real product crosses: find → connect → send →
 * received. The objects are the real ShareTexts shapes (text bubble,
 * LinkCard, photo card, file card) and the timing mirrors real handshakes.
 *
 * F8 spatial language: a connection line joins the two tiles. It is a
 * faint dashed trace before the devices find each other, turns solid
 * ember the moment they connect, and goes green when the object lands —
 * the relationship forms in front of the visitor.
 *
 * Honesty: it never implies a real transfer. A persistent "Demo" chip and
 * a one-line note beneath the stage say exactly what this is. The demo
 * re-runs forever (staged → arrived), so the object visibly lands and can
 * be re-sent — like the product, not like a looping GIF.
 *
 * Accessible: the four pickers are real radios (disabled while a transfer
 * is in flight — a mid-flight payload swap would lie about the state);
 * Send is a real button; status changes are announced via aria-live;
 * reduced motion renders the states as clean cross-fades with no travel.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

type Kind = 'text' | 'url' | 'image' | 'file';

const KINDS: { kind: Kind; icon: React.ReactNode }[] = [
  { kind: 'text', icon: <TypeIcon className="w-4 h-4" /> },
  { kind: 'url', icon: <Link2 className="w-4 h-4" /> },
  { kind: 'image', icon: <ImageIcon className="w-4 h-4" /> },
  { kind: 'file', icon: <Files className="w-4 h-4" /> },
];

/** Photo card preview — a tiny CSS landscape, no fake image asset. */
const PhotoPreview = () => (
  <div className="w-full h-full rounded-[9px] overflow-hidden bg-gradient-to-b from-[#8ec5e8] to-[#dfeef7] dark:from-[#3d5a75] dark:to-[#22384a] relative" aria-hidden>
    <div className="absolute bottom-0 left-0 right-0 h-[38%] bg-gradient-to-b from-[#7ea86e] to-[#5c8450] dark:from-[#3f5a38] dark:to-[#2c4028]" />
    <div className="absolute top-[18%] left-[14%] w-9 h-3.5 rounded-full bg-white/70 dark:bg-white/25" />
    <div className="absolute top-[30%] right-[12%] w-6 h-2.5 rounded-full bg-white/50 dark:bg-white/15" />
  </div>
);

type Phase = 'idle' | 'finding' | 'connected' | 'sending' | 'arrived';

const IN_FLIGHT: Phase[] = ['finding', 'connected', 'sending'];

/** Reactive phone-shaped check (matchMedia, not a one-shot read). */
function useIsPhoneLike(): boolean {
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export function LandingDemo({ className }: { className?: string }) {
  const { t } = useI18n();
  const isPhone = useIsPhoneLike();
  const [kind, setKind] = useState<Kind>('text');
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  const send = useCallback(() => {
    if (IN_FLIGHT.includes(phase)) return;
    clearTimers();
    setPhase('finding');
    // Real-feeling handshake timing: discovery ~0.9s, the room settles in
    // connected, the object crosses, it arrives — and the stage holds the
    // received state so people can look at it before re-sending.
    after(900, () => setPhase('connected'));
    after(1800, () => setPhase('sending'));
    after(3300, () => setPhase('arrived'));
  }, [phase, clearTimers, after]);

  const pick = useCallback((k: Kind) => {
    // Mid-flight payload swaps are locked out — the traveler must be the
    // object that left. After arrival (or while idle), picking restages.
    if (IN_FLIGHT.includes(phase)) return;
    setKind(k);
    setPhase('idle');
  }, [phase]);

  const statusLine = phase === 'idle' ? t('land.demo.pick')
    : phase === 'finding' ? t('land.demo.finding') + '…'
    : phase === 'connected' ? t('land.demo.connected')
    : phase === 'sending' ? t('land.demo.sending') + '…'
    : t('land.demo.arrived');

  const sample = kind === 'text' ? t('land.demo.sampleText')
    : kind === 'url' ? t('land.demo.sampleUrl')
    : kind === 'file' ? t('land.demo.sampleFile')
    : '';

  const kindMeta = KINDS.find((k) => k.kind === kind)!;

  return (
    <div className={cn('w-full select-none', className)}>
      {/* ── Stage ─────────────────────────────────────────────── */}
      <div
        className="relative rounded-[22px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_10px_40px_-12px_rgba(31,26,20,0.18)] dark:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] p-4 sm:p-5"
        role="group"
        aria-label={t('land.demo.try')}
      >
        {/* Demo chip — honesty is persistent, not a footnote */}
        <span className="absolute top-3.5 right-3.5 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-apple-ink-muted dark:text-white/45 bg-black/[0.05] dark:bg-white/[0.07]">
          <ShieldCheck className="w-3 h-3" aria-hidden />
          {t('land.demo.demo')}
        </span>

        {/* Two devices and the gap between them */}
        <div className="flex items-stretch gap-3 sm:gap-4">
          {/* Device A — this device. Stacked header (icon above the name):
              the tile is narrow, and a row header truncated the localized
              names into "This d…" — the name IS the teaching, never cut it. */}
          <div className="flex-1 min-w-0 flex flex-col rounded-[16px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/60 dark:border-white/[0.07] p-3">
            <div className="flex flex-col items-center gap-1.5 mb-2.5">
              <span className={cn(
                'flex items-center justify-center w-7 h-7 rounded-[9px] shrink-0 transition-colors duration-300',
                phase === 'idle' || phase === 'finding'
                  ? 'bg-black/[0.05] dark:bg-white/[0.07] text-apple-ink-muted dark:text-white/45'
                  : 'bg-ember/10 text-ember dark:text-[#fb9243]'
              )} aria-hidden>
                {isPhone ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              </span>
              <span className="text-[10.5px] font-semibold text-apple-ink dark:text-white/90 text-center leading-tight">{t('land.demo.a')}</span>
            </div>

            {/* The staged object — picking a kind stages it here at once;
                selection IS the first act of sending. */}
            <div className="flex-1 flex items-center justify-center min-h-[96px]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`a-${kind}`}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: phase === 'sending' ? 0.5 : 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="w-full"
                >
                  <ObjectCard kind={kind} sample={sample} ghost={phase === 'sending'} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* The gap — the connection forms here. The line bridges tile A's
              edge to tile B's edge: dashed while searching, solid ember when
              connected, green when the object lands. */}
          <div className="shrink-0 w-[68px] sm:w-[96px] flex flex-col items-center justify-center py-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={statusLine}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: EASE }}
                className={cn(
                  'text-[10px] sm:text-[11px] font-semibold text-center leading-tight mb-2',
                  phase === 'arrived' ? 'text-status-success' : 'text-apple-ink-muted dark:text-white/50'
                )}
              >
                {statusLine}
              </motion.span>
            </AnimatePresence>
            {/* The line + status dot, on one axis */}
            <div className="relative w-full flex items-center justify-center" style={{ height: 24 }}>
              {/* The path: exactly the span between the two tiles — dashed
                  trace while idle, solid while connected. */}
              {phase === 'idle' ? (
                <span
                  aria-hidden
                  className="absolute left-[-14px] right-[-14px] top-1/2 border-t border-dashed border-apple-divider dark:border-white/[0.12]"
                />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-[-14px] right-[-14px] top-1/2 -translate-y-1/2 h-[2px] rounded-full transition-colors duration-500',
                    phase === 'finding' && 'bg-apple-divider/70 dark:bg-white/[0.14]',
                    (phase === 'connected' || phase === 'sending') && 'bg-ember dark:bg-[#fb9243]',
                    phase === 'arrived' && 'bg-status-success'
                  )}
                />
              )}
              <StatusDot phase={phase} />
            </div>
            {/* The traveling object: the real object chip crosses the line */}
            <div className="relative w-full flex items-center justify-center mt-2" style={{ height: 36 }}>
              <AnimatePresence>
                {phase === 'sending' && (
                  <motion.span
                    key="travel"
                    initial={{ x: -30, opacity: 0, scale: 0.7 }}
                    animate={{ x: 30, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: 40, scale: 0.7 }}
                    transition={{ duration: 1.2, ease: EASE }}
                    className="absolute"
                    aria-hidden
                  >
                    <span className="flex items-center justify-center w-9 h-9 rounded-[11px] bg-white dark:bg-[#2a2a30] border border-apple-divider/70 dark:border-white/[0.1] text-ember dark:text-[#fb9243] shadow-[0_4px_14px_-4px_rgba(31,26,20,0.3)] dark:shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)]">
                      {kind === 'image' ? <ImageIcon className="w-4 h-4" /> : kindMeta.icon}
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Device B — the other device (same stacked header). */}
          <div className="flex-1 min-w-0 flex flex-col rounded-[16px] bg-apple-canvas dark:bg-[#232329] border border-apple-divider/60 dark:border-white/[0.07] p-3">
            <div className="flex flex-col items-center gap-1.5 mb-2.5">
              <span className={cn(
                'flex items-center justify-center w-7 h-7 rounded-[9px] shrink-0 transition-colors duration-300',
                phase === 'arrived'
                  ? 'bg-status-success/12 text-status-success'
                  : 'bg-black/[0.05] dark:bg-white/[0.07] text-apple-ink-muted dark:text-white/45'
              )} aria-hidden>
                {isPhone ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
              </span>
              <span className="text-[10.5px] font-semibold text-apple-ink dark:text-white/90 text-center leading-tight">{t('land.demo.b')}</span>
            </div>
            <div className="flex-1 flex items-center justify-center min-h-[96px]">
              <AnimatePresence mode="wait" initial={false}>
                {phase === 'arrived' ? (
                  <motion.div
                    key={`b-${kind}`}
                    initial={{ opacity: 0, scale: 0.94, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                    className="w-full"
                  >
                    <ObjectCard kind={kind} sample={sample} arrived />
                  </motion.div>
                ) : (
                  <motion.span
                    key="b-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-14 h-1.5 rounded-full bg-apple-divider/70 dark:bg-white/[0.08]"
                    aria-hidden
                  />
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* ── Controls: four kinds + Send ─────────────────────── */}
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('land.demo.pick')}>
            {KINDS.map(({ kind: k, icon }) => {
              const label = t(k === 'text' ? 'land.send.text' : k === 'url' ? 'land.send.url' : k === 'image' ? 'land.send.image' : 'land.send.file');
              const active = kind === k;
              const locked = IN_FLIGHT.includes(phase);
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={locked}
                  onClick={() => pick(k)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 rounded-[12px] py-2 text-[11px] font-semibold border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60',
                    !locked && 'active:scale-[0.95]',
                    active
                      ? 'bg-ember/[0.09] dark:bg-ember/[0.14] border-ember/35 text-ember dark:text-[#fb9243]'
                      : 'bg-black/[0.025] dark:bg-white/[0.04] border-transparent text-apple-ink-muted dark:text-white/50 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]',
                    locked && 'opacity-50 cursor-default'
                  )}
                >
                  {icon}
                  <span className="leading-none">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={send}
            disabled={phase === 'finding' || phase === 'sending'}
            className={cn(
              'w-full min-h-[46px] rounded-full text-[14px] font-semibold text-white transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60 focus-visible:ring-offset-2',
              phase === 'arrived'
                ? 'bg-status-success hover:bg-[#2ea04e]'
                : phase === 'connected' || phase === 'finding'
                  ? 'bg-[#3a3a40] dark:bg-white/15 cursor-default'
                  : 'bg-ember hover:bg-[#d9560e] hover:shadow-[0_4px_14px_-4px_rgba(240,100,19,0.5)] shadow-[0_1px_3px_rgba(240,100,19,0.35)]'
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              {phase === 'arrived' ? (
                <><Check className="w-4 h-4" aria-hidden /> {t('land.demo.again')}</>
              ) : IN_FLIGHT.includes(phase) ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                t('land.demo.send')
              )}
            </span>
          </button>
        </div>

        {/* Screen-reader status */}
        <p role="status" aria-live="polite" className="sr-only">{statusLine}</p>
      </div>

      {/* Honesty line — outside the stage, quiet */}
      <p className="mt-2.5 px-1 text-[11.5px] leading-snug text-apple-ink-muted/70 dark:text-white/35 text-center">
        {t('land.demo.hint')}
      </p>
    </div>
  );
}

/** The object itself, drawn in the app's real card language. Exported for
 *  the landing story sections — one visual language, everywhere. */
export function ObjectCard({ kind, sample, arrived = false, ghost = false }: { kind: Kind; sample: string; arrived?: boolean; ghost?: boolean }) {
  if (kind === 'image') {
    return (
      <div className={cn('w-full rounded-[12px] bg-white dark:bg-[#2a2a30] border border-apple-divider/60 dark:border-white/[0.08] p-1.5 transition-opacity', ghost && 'opacity-60')}>
        <div className="aspect-[4/3] w-full"><PhotoPreview /></div>
        <div className="flex items-center gap-1.5 px-1 pt-1.5 pb-0.5">
          <ImageIcon className="w-3 h-3 text-apple-ink-muted dark:text-white/45 shrink-0" aria-hidden />
          <span className="text-[10px] font-medium text-apple-ink-muted dark:text-white/50 truncate">IMG_2047.jpg</span>
          {arrived && <Check className="w-3 h-3 text-status-success ml-auto shrink-0" aria-hidden />}
        </div>
      </div>
    );
  }
  if (kind === 'url') {
    return (
      <div className={cn('w-full rounded-[12px] bg-white dark:bg-[#2a2a30] border border-apple-divider/60 dark:border-white/[0.08] px-2.5 py-2 transition-opacity', ghost && 'opacity-60')}>
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 flex items-center justify-center w-6 h-6 rounded-[7px] bg-ember/10 text-ember dark:text-[#fb9243]" aria-hidden>
            <Link2 className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-apple-ink dark:text-white/90 truncate">USB — Wikipedia</span>
            <span className="block text-[10px] text-apple-ink-muted dark:text-white/45 truncate">{sample}</span>
          </span>
          {arrived && <Check className="w-3 h-3 text-status-success ml-auto mt-0.5 shrink-0" aria-hidden />}
        </div>
      </div>
    );
  }
  if (kind === 'file') {
    return (
      <div className={cn('w-full rounded-[12px] bg-white dark:bg-[#2a2a30] border border-apple-divider/60 dark:border-white/[0.08] px-2.5 py-2.5 transition-opacity', ghost && 'opacity-60')}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 flex items-center justify-center w-8 h-8 rounded-[9px] bg-ember/10 text-ember dark:text-[#fb9243]" aria-hidden>
            <Files className="w-4 h-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-apple-ink dark:text-white/90 truncate">{sample.split(' · ')[0]}</span>
            <span className="block text-[10px] text-apple-ink-muted dark:text-white/45">{sample.split(' · ')[1]}</span>
          </span>
          {arrived && <Check className="w-3.5 h-3.5 text-status-success ml-auto shrink-0" aria-hidden />}
        </div>
      </div>
    );
  }
  // text — the app's sent-bubble shape
  return (
    <div className={cn('w-full flex', arrived ? 'justify-start' : 'justify-end')}>
      <div className={cn(
        'max-w-full rounded-[14px] px-3 py-2 text-[11.5px] leading-snug font-medium transition-opacity',
        arrived
          ? 'bg-white dark:bg-[#2a2a30] border border-apple-divider/60 dark:border-white/[0.08] text-apple-ink dark:text-white/90'
          : 'bg-ember text-white',
        ghost && 'opacity-60'
      )}>
        {sample}
      </div>
    </div>
  );
}

/** The gap's status dot: searching halo → solid link → green done. */
function StatusDot({ phase }: { phase: Phase }) {
  if (phase === 'idle' || phase === 'finding') {
    return (
      <span className="relative flex items-center justify-center w-6 h-6" aria-hidden>
        <span className="st-halo-ring absolute inset-0 rounded-full bg-status-success/30 motion-reduce:animate-none" />
        <span className={cn(
          'relative rounded-full transition-all duration-300',
          phase === 'idle' ? 'w-2.5 h-2.5 bg-status-success/50' : 'w-2.5 h-2.5 bg-status-success/80'
        )} />
      </span>
    );
  }
  if (phase === 'connected' || phase === 'sending') {
    return (
      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-ember/15 dark:bg-[#fb9243]/20 transition-colors duration-300" aria-hidden>
        <span className="w-2 h-2 rounded-full bg-ember dark:bg-[#fb9243]" />
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-status-success text-white" aria-hidden>
      <Check className="w-3.5 h-3.5" strokeWidth={3} />
    </span>
  );
}

export type LandingDemoKind = Kind;
