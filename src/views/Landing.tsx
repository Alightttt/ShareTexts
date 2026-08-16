import React, { useState, useEffect } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { ScrollStory } from '../components/ScrollStory';
import { Situations } from '../components/Situations';
import { HowItWorks } from '../components/HowItWorks';
import { InsteadOf } from '../components/InsteadOf';
import { PrivacyPromise } from '../components/PrivacyPromise';
import { Faq } from '../components/Faq';
import { ArrowRight, Send, Inbox, ShieldCheck } from 'lucide-react';
import { LiveUsers } from '../components/LiveUsers';
import { InstallPrompt } from '../components/InstallPrompt';

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The page's ambient backdrop — quiet layers behind everything:
 *   - a soft azure glow breathing near the top (same warmth as the room screen),
 *   - a faint dot grid that reads as texture, not a pattern,
 *   - on hover-capable screens, a very subtle light that follows the pointer.
 * Every layer respects prefers-reduced-motion (no movement) and none of it
 * competes with the product — it's atmosphere, not decoration.
 */
function usePrefersReducedMotion() {
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

function PointerLight() {
  const reduced = usePrefersReducedMotion();
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { stiffness: 60, damping: 18, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 60, damping: 18, mass: 0.6 });

  // Listen on window so the light never blocks interaction — the layer below
  // is pointer-events-none, but we still want the glow to follow the cursor.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [x, y]);

  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 hidden lg:block">
      <motion.div
        className="absolute w-[560px] h-[560px] rounded-full"
        style={{
          left: sx,
          top: sy,
          x: '-50%',
          y: '-50%',
          background: 'radial-gradient(circle, rgba(46,139,255,0.05) 0%, transparent 62%)',
        }}
      />
    </div>
  );
}

function AmbientBackdrop() {
  const reduced = usePrefersReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Azure glow — breathes slowly; static under reduced motion */}
      <div className="absolute -top-[18%] left-1/2 -translate-x-1/2 w-[120%] h-[52%]">
        <motion.div
          className="w-full h-full bg-[radial-gradient(50%_60%_at_50%_0%,rgba(46,139,255,0.12),transparent_70%)]"
          animate={reduced ? undefined : { opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      {/* Second, cooler tone lower on the page for depth */}
      <div className="absolute top-[38%] right-[-10%] w-[55%] h-[45%] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(120,80,220,0.06),transparent_70%)]" />
      {/* Faint dot grid — barely-there texture */}
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(20,24,32,0.5) 1px, transparent 1px)',
          backgroundSize: '34px 34px',
          maskImage: 'radial-gradient(70% 50% at 50% 0%, black 0%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(70% 50% at 50% 0%, black 0%, transparent 75%)',
        }}
      />
    </div>
  );
}

/**
 * ShareText is a temporary bridge between two devices.
 * The page is one continuous story — source, second device, pairing,
 * transfer, done — rather than a stack of marketing sections.
 * The product itself is the hero.
 */

export function Landing({ onJoinClick }: { onJoinClick: () => void }) {
  const { createSession } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await createSession();
    } catch (e: any) {
      setIsCreating(false);
      setCreateError(e.message || "Couldn't create a session.");
    }
  };

  return (
    <div className="min-h-screen relative bg-apple-canvas dark:bg-night-900 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip">
      <AmbientBackdrop />
      <PointerLight />

      {/* ============ HEADER — logo only; nothing competes with the product ============ */}
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2" aria-label="ShareText — the temporary bridge between your devices">
            <ShareTextLogo size={21} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          {/* Live count in the header — desktop only; mobile gets it in the hero below. */}
          <LiveUsers className="ml-auto hidden lg:inline-flex" />
        </div>
      </header>

      {/* ============ HERO — copy and product demonstration share the frame ============ */}
      <section className="px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-16 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h1 className="text-[32px] sm:text-[40px] lg:text-[44px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.1] max-w-[20ch]">
              Move something between your devices.
            </h1>
            <p className="mt-5 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[46ch]">
              Text, photos, and videos — straight from one screen to the other. No app to install, no account to make, nothing kept in between.
            </p>
            {/* Live count near the top on smaller devices (header pill is desktop-only). */}
            <LiveUsers className="mt-5 lg:hidden" />
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <motion.button
                onPointerDown={handleCreate}
                disabled={isCreating}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[10px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float"
              >
                {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                  <><Send className="w-4 h-4" /> Send text <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" /></>
                )}
              </motion.button>
              <motion.button
                onPointerDown={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-[10px] text-[14px] font-medium text-apple-ink-muted dark:text-white/55 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion flex items-center justify-center gap-1.5"
              >
                <Inbox className="w-4 h-4" /> Receive text
              </motion.button>
            </div>
            {/* The trust strip — the three promises that make ShareText
                shareable. Each is true and each answers a first-objection. */}
            <div className="mt-6 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
              <span className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-status-success" /> End-to-end encrypted</span>
              <span className="w-1 h-1 rounded-full bg-apple-ink-muted/40" aria-hidden />
              <span>No account</span>
              <span className="w-1 h-1 rounded-full bg-apple-ink-muted/40" aria-hidden />
              <span>Nothing stored</span>
              <span className="w-1 h-1 rounded-full bg-apple-ink-muted/40" aria-hidden />
              <span>Open source</span>
            </div>
            {createError && (
              <p role="alert" className="mt-5 text-[14px] font-medium text-status-danger flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-status-danger" /> {createError}
              </p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.12, ease: EASE }}
            className="w-full flex justify-center"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* ============ THE STORY — the page becomes a demonstration ============ */}
      <ScrollStory />

      {/* ============ HOW IT WORKS — three plain steps, everyone understands ============ */}
      <HowItWorks />

      {/* ============ WHY SHARETEXT — told through situations, not features ============ */}
      <Situations />

      {/* ============ THE USUAL WAYS — contrast, honestly told ============ */}
      <InsteadOf />

      {/* ============ PRIVATE BY DESIGN — the trust wedge + the 2-6-0-0-0 strip ============ */}
      <PrivacyPromise />

      {/* ============ QUESTIONS PEOPLE ACTUALLY ASK ============ */}
      <Faq />

      {/* ============ ENDING ============ */}
      <section className="px-6 pb-28 sm:pb-36 pt-24 sm:pt-28 bg-apple-parchment dark:bg-night-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center"
        >
          <h2 className="text-[34px] sm:text-[46px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            Sometimes you just need to move something.
          </h2>
          <p className="mt-4 text-[16px] sm:text-[17px] text-apple-ink-muted dark:text-white/60 font-medium">
            One page, two screens. No app, no account, nothing kept in between.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <motion.button
              onPointerDown={handleCreate}
              disabled={isCreating}
              whileTap={{ scale: 0.97 }}
              className="group px-9 py-4 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[16px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float min-h-[52px]"
            >
              {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                <><Send className="w-4 h-4" /> Send text <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" /></>
              )}
            </motion.button>
            <motion.button
              onPointerDown={onJoinClick}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 rounded-[12px] text-[15px] font-medium text-apple-ink-muted dark:text-white/60 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion flex items-center justify-center gap-1.5 min-h-[52px]"
            >
              <Inbox className="w-4 h-4" /> Receive text
            </motion.button>
          </div>
          <p className="mt-6 text-[15px] text-apple-ink-muted dark:text-white/55 font-medium">
            Open it on the other device and connect.
          </p>
          {createError && (
            <p role="alert" className="mt-4 text-[14px] font-medium text-status-danger inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" /> {createError}
            </p>
          )}
        </motion.div>
      </section>

      {/* PWA install — a quiet pill on capable browsers, once per device. */}
      <InstallPrompt />

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-10 border-t border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShareTextLogo size={16} className="text-apple-ink dark:text-white/70" />
            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
              The temporary bridge between your devices.
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
            <span>No app</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/20" />
            <span>No account</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/20" />
            <span>No tracking</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
