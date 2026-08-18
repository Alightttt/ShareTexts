import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { Send, Inbox } from 'lucide-react';
import { LiveUsers } from '../components/LiveUsers';
import { ThemeToggle } from '../components/ThemeToggle';
import { InstallPrompt } from '../components/InstallPrompt';

// Below-the-fold sections load as separate chunks — the hero paints with only
// the critical JS, and each story section streams in when it nears the viewport.
const ScrollStory = lazy(() => import('../components/ScrollStory').then(m => ({ default: m.ScrollStory })));
const HowItWorks = lazy(() => import('../components/HowItWorks').then(m => ({ default: m.HowItWorks })));
const Situations = lazy(() => import('../components/Situations').then(m => ({ default: m.Situations })));
const InsteadOf = lazy(() => import('../components/InsteadOf').then(m => ({ default: m.InsteadOf })));
const PrivacyPromise = lazy(() => import('../components/PrivacyPromise').then(m => ({ default: m.PrivacyPromise })));
const Faq = lazy(() => import('../components/Faq').then(m => ({ default: m.Faq })));

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
          background: 'radial-gradient(circle, rgba(46,139,255,0.04) 0%, transparent 55%)',
        }}
      />
    </div>
  );
}

/**
 * Interactive dot grid — a canvas that renders dots across the page and
 * makes nearby dots subtly larger when the cursor moves close. Purely
 * decorative, fully pointer-events-none, respects reduced-motion.
 */
function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const DOT_SPACING = 32;
    const BASE_RADIUS = 1;
    const MAX_RADIUS = 2.2;
    const INFLUENCE_RADIUS = 120;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY + window.scrollY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('touchmove', (e: TouchEvent) => {
      if (e.touches[0]) mouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY + window.scrollY };
    }, { passive: true });

    let lastFrame = 0;
    const draw = (timestamp: number) => {
      // Throttle to ~30fps for performance on mobile
      if (timestamp - lastFrame < 33) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrame = timestamp;

      const w = window.innerWidth;
      const h = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const isDark = document.documentElement.classList.contains('dark');
      const isMobile = w < 640;
      const baseRadius = isMobile ? 1.2 : 1;
      const maxRadius = isMobile ? 2.5 : 2.2;
      const baseColor = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(20,24,32,0.15)';
      const activeColor = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(20,24,32,0.35)';

      for (let x = DOT_SPACING / 2; x < w; x += DOT_SPACING) {
        for (let y = DOT_SPACING / 2; y < h; y += DOT_SPACING) {
          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const t = Math.max(0, 1 - dist / INFLUENCE_RADIUS);
          const r = baseRadius + (maxRadius - baseRadius) * t * t;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = t > 0.01 ? activeColor : baseColor;
          ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
    />
  );
}

function AmbientBackdrop() {
  const reduced = usePrefersReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Azure glow — breathes slowly; static under reduced motion */}
      <div className="absolute -top-[18%] left-1/2 -translate-x-1/2 w-[120%] h-[52%]">
        <motion.div
          className="w-full h-full bg-[radial-gradient(50%_60%_at_50%_0%,rgba(46,139,255,0.10),transparent_70%)]"
          animate={reduced ? undefined : { opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      {/* Second, cooler tone lower on the page for depth */}
      <div className="absolute top-[38%] right-[-10%] w-[55%] h-[45%] bg-[radial-gradient(60%_60%_at_50%_50%,rgba(120,80,220,0.05),transparent_70%)]" />
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
      <div className="absolute inset-0 z-0" aria-hidden>
        <DotGrid />
      </div>
      <AmbientBackdrop />
      <PointerLight />

      {/* ============ HEADER — logo only; nothing competes with the product ============ */}
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText — share anything between two devices">
            <ShareTextLogo size={21} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          {/* Centered navigation on desktop — the nav links sit in the visual
              center of the header, not left-aligned next to the logo. */}
          <nav className="hidden md:flex items-center justify-center gap-6 flex-1" aria-label="Page sections">
            <a href="#how-it-works" className="text-[13.5px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">How it works</a>
            <a href="#private" className="text-[13.5px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#faq" className="text-[13.5px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">Questions</a>
          </nav>
          <div className="flex items-center gap-4 ml-auto shrink-0">
            <LiveUsers className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ============ HERO — a natural two-part frame. Copy leads on the left,
          and the live demo — the actual product in miniature — sits beside it.
          No centered stack: one quiet idea, then the working proof, side by
          side on desktop, stacked on mobile. ============ */}
      <section className="px-6 pt-14 sm:pt-20 pb-16 sm:pb-20 relative z-10">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center lg:text-left flex flex-col items-center lg:items-start"
          >
            <h1 className="text-[36px] sm:text-[46px] lg:text-[52px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.06] max-w-[13ch]">
              Move anything between your devices.
            </h1>
            <p className="mt-5 text-[15.5px] sm:text-[17px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[46ch]">
              Open ShareTexts on both devices. No app. No account. Just pair and send.
            </p>
            {/* Live count near the top on smaller devices (header pill is desktop-only). */}
            <LiveUsers className="mt-5 lg:hidden" />
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <motion.button
                data-testid="create-session"
                onClick={handleCreate}
                disabled={isCreating}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float"
              >
                {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                  <><Send className="w-4 h-4" /> Send</>
                )}
              </motion.button>
              <motion.button
                data-testid="join-session"
                onClick={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion shadow-card hover:shadow-float"
              >
                <Inbox className="w-4 h-4" /> Receive
              </motion.button>
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
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
            className="mt-12 lg:mt-0 w-full flex justify-center"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* Below-the-fold sections are lazy chunks; a bare placeholder keeps
          layout stable while each loads (they're all well under the fold). */}
      <Suspense fallback={<div className="h-[60vh]" aria-hidden />}>
        {/* ============ THE STORY — the page becomes a demonstration ============ */}
        <ScrollStory />

        {/* ============ HOW IT WORKS — three plain steps, everyone understands ============ */}
        <section id="how-it-works" aria-label="How it works"><HowItWorks /></section>

        {/* ============ WHY SHARETEXT — told through situations, not features ============ */}
        <Situations />

        {/* ============ THE USUAL WAYS — contrast, honestly told ============ */}
        <InsteadOf />

        {/* ============ PRIVATE BY DESIGN — the trust wedge + the 2-6-0-0-0 strip ============ */}
        <section id="private" aria-label="Privacy"><PrivacyPromise /></section>

        {/* ============ QUESTIONS PEOPLE ACTUALLY ASK ============ */}
        <section id="faq" aria-label="Questions"><Faq /></section>
      </Suspense>

      {/* ============ ENDING ============ */}
      <section className="px-6 pb-28 sm:pb-36 pt-24 sm:pt-28 bg-apple-parchment dark:bg-night-950 relative z-10">
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
          <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">              <motion.button
                data-testid="create-session"
                onClick={handleCreate}
                disabled={isCreating}
                whileTap={{ scale: 0.97 }}
                className="group px-9 py-4 bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[16px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float min-h-[52px]"
              >
                {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                  <><Send className="w-4 h-4" /> Send</>
                )}
              </motion.button>
              <motion.button
                data-testid="join-session"
                onClick={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-4 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[16px] font-semibold flex items-center justify-center gap-2 transition-motion shadow-card hover:shadow-float min-h-[52px]"
              >
                <Inbox className="w-4 h-4" /> Receive
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
              Move anything between two devices.
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
            <span>No app</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/20" />
            <span>No account</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/20" />
            <span>Temporary by design</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
