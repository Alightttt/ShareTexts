import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { Send, Inbox } from 'lucide-react';
import { LiveUsers } from '../components/LiveUsers';
import { ThemeToggle } from '../components/ThemeToggle';
import { InstallPrompt } from '../components/InstallPrompt';

// Below-the-fold sections load as separate chunks — the hero paints with only
// the critical JS, and each story section streams in when it nears the viewport.
const HowItWorks = lazy(() => import('../components/HowItWorks').then(m => ({ default: m.HowItWorks })));
const PrivacyPromise = lazy(() => import('../components/PrivacyPromise').then(m => ({ default: m.PrivacyPromise })));
const Faq = lazy(() => import('../components/Faq').then(m => ({ default: m.Faq })));

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Minimal ambient backdrop — a soft azure glow behind the hero.
 * No canvas, no pointer tracking, no heavy animation.
 */
function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[400px] overflow-hidden z-0">
      <div className="absolute -top-[18%] left-1/2 -translate-x-1/2 w-[120%] h-full bg-[radial-gradient(50%_60%_at_50%_0%,rgba(46,139,255,0.04),transparent_70%)]" />
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

  // Focus management for hash navigation — after a user clicks a nav link,
  // move focus to the section heading so keyboard/AT users land in context.
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    // Handle initial hash on mount
    if (window.location.hash) setTimeout(onHashChange, 100);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await createSession();
    } catch (e: any) {
      setIsCreating(false);
      // Honest error: tell the user exactly what happened and what to do
      const msg = e.message || "Couldn't start the connection.";
      if (msg.includes('trouble connecting') || msg.includes('reach ShareText')) {
        setCreateError("The bridge couldn't connect. Check your connection and try again.");
      } else {
        setCreateError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen relative bg-apple-canvas dark:bg-night-900 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip dot-grid-bg">
      <AmbientGlow />

      {/* ============ HEADER — logo + desktop-only nav ============ */}
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 sm:h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText — share anything between two devices">
            <ShareTextLogo size={20} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[14px] sm:text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          {/* Desktop only — mobile nav lives in the footer */}
          <nav className="hidden md:flex items-center justify-center gap-5 flex-1" aria-label="Page sections">
            <a href="#how-it-works" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">How it works</a>
            <a href="#private" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#faq" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">Questions</a>
            <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-colors">Docs</a>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4 ml-auto shrink-0">
            <LiveUsers className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ============ HERO — a natural two-part frame. Copy leads on the left,
          and the live demo — the actual product in miniature — sits beside it.
          No centered stack: one quiet idea, then the working proof, side by
          side on desktop, stacked on mobile. ============ */}
      <section
        className="px-6 pt-10 sm:pt-16 pb-12 sm:pb-16 relative z-10"
        aria-labelledby="hero-title"
      >
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center lg:text-left flex flex-col items-center lg:items-start"
          >
            {/* Hero headline — premium, editorial, device-first */}
            <h1
              id="hero-title"
              className="text-[34px] sm:text-[42px] lg:text-[48px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.08] max-w-[14ch]"
            >
              Move anything between your devices.
            </h1>
            
            {/* Subtitle — the supporting promise */}
            <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[42ch]">
              One page, two screens. No app, no account, nothing kept in between.
            </p>
            {/* Primary actions */}
            <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <motion.button
                data-testid="hero-send"
                onClick={handleCreate}
                disabled={isCreating}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float"
              >
                {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                  <><Send className="w-4 h-4" /> Send something</>
                )}
              </motion.button>
              <motion.button
                data-testid="hero-receive"
                onClick={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion shadow-card hover:shadow-float"
              >
                <Inbox className="w-4 h-4" /> Receive something
              </motion.button>
            </div>

            {/* Trust row — the three proof pillars */}
            <div className="mt-4 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1.5 text-[11.5px] sm:text-[12.5px] font-medium text-apple-ink-muted/60 dark:text-white/40">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0A66F0] dark:bg-[#4B8DFF]" />
                Immediate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B26A00] dark:bg-[#F3B44C]" />
                Temporary by design
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1C9A61] dark:bg-[#55D18C]" />
                Between any two devices
              </span>
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
            className="mt-10 lg:mt-0 w-full flex justify-center"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* Below-the-fold sections are lazy chunks. Each loads only when near
          the viewport. Kept minimal: How it works, Privacy, FAQ. */}
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        {/* ============ HOW IT WORKS — three plain steps ============ */}
        <div id="how-it-works" tabIndex={-1}><HowItWorks /></div>

        {/* ============ PRIVATE BY DESIGN — the trust wedge ============ */}
        <div id="private" tabIndex={-1}><PrivacyPromise /></div>

        {/* ============ QUESTIONS PEOPLE ACTUALLY ASK ============ */}
        <div id="faq" tabIndex={-1}><Faq /></div>
      </Suspense>

      {/* ============ ENDING — one final CTA, the wrong-screen moment ============ */}
      <section className="px-6 pb-24 sm:pb-32 pt-20 sm:pt-24 bg-apple-parchment dark:bg-night-950 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center"
        >
          <h2 className="text-[28px] sm:text-[38px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.1]">
            When it is on the wrong screen.
          </h2>
          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <motion.button
              data-testid="create-session"
              onClick={handleCreate}
              disabled={isCreating}
              whileTap={{ scale: 0.97 }}
              className="group px-8 py-3.5 bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float min-h-[48px]"
            >
              {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                <><Send className="w-4 h-4" /> Send something</>
              )}
            </motion.button>
            <motion.button
              data-testid="join-session"
              onClick={onJoinClick}
              whileTap={{ scale: 0.97 }}
              className="px-7 py-3.5 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion shadow-card hover:shadow-float min-h-[48px]"
            >
              <Inbox className="w-4 h-4" /> Receive something
            </motion.button>
          </div>
          {createError && (
            <p role="alert" className="mt-4 text-[14px] font-medium text-status-danger inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" /> {createError}
            </p>
          )}
        </motion.div>
      </section>

      {/* PWA install — a quiet pill on capable browsers, once per device. */}
      <InstallPrompt />

      {/* ============ FOOTER — navigation + trust ============ */}
      <footer className="px-6 py-8 sm:py-10 border-t border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <ShareTextLogo size={16} className="text-apple-ink dark:text-white/70" />
              <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
                The temporary bridge between your devices.
              </span>
            </div>
            {/* Links — visible on mobile too */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/60">
              <a href="#how-it-works" className="hover:text-apple-ink dark:hover:text-white transition-colors">How it works</a>
              <a href="#private" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
              <a href="#faq" className="hover:text-apple-ink dark:hover:text-white transition-colors">Questions</a>
              <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-apple-divider/60 dark:border-white/[0.04] flex flex-wrap items-center gap-2 text-[12px] font-medium text-apple-ink-muted/70 dark:text-white/40">
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
