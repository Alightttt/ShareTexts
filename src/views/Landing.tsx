import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { Send, Inbox, Zap, Shield, Globe, Clock, Smartphone, Monitor, ArrowRight } from 'lucide-react';
import { LiveUsers } from '../components/LiveUsers';
import { ThemeToggle } from '../components/ThemeToggle';
import { InstallPrompt } from '../components/InstallPrompt';

// Below-the-fold sections load as separate chunks — the hero paints with only
// the critical JS, and each story section streams in when it nears the viewport.
const PrivacyPromise = lazy(() => import('../components/PrivacyPromise').then(m => ({ default: m.PrivacyPromise })));
const Faq = lazy(() => import('../components/Faq').then(m => ({ default: m.Faq })));

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Minimal ambient backdrop — a soft azure glow behind the hero.
 * No canvas, no pointer tracking, no heavy animation.
 */
function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[500px] overflow-hidden z-0">
      {/* Primary blue glow — soft, wide, centered */}
      <div className="absolute -top-[15%] left-1/2 -translate-x-1/2 w-[140%] h-full bg-[radial-gradient(50%_55%_at_50%_0%,rgba(10,102,240,0.035),transparent_70%)]" />
      {/* Secondary warm accent — barely visible, adds depth */}
      <div className="absolute -top-[10%] left-[30%] w-[60%] h-[60%] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.02),transparent_60%)]" />
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
    // Bounded timeout: if creation doesn't complete in 12s, show a clear
    // error with retry. Prevents the dreaded "Creating…" forever state.
    const timeout = setTimeout(() => {
      setIsCreating(false);
      setCreateError("Taking too long. Check your connection and try again.");
    }, 12000);
    try {
      await createSession();
      clearTimeout(timeout);
    } catch (e: any) {
      clearTimeout(timeout);
      setIsCreating(false);
      const msg = e.message || "Couldn't start the connection.";
      if (msg.includes('trouble connecting') || msg.includes('reach ShareText') || msg.includes('signaling') || msg.includes('configured') || msg.includes('connection service')) {
        setCreateError("Couldn't start the connection.\n\nShareText couldn't reach the connection service. Check your internet and try again.");
      } else {
        setCreateError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen relative bg-apple-canvas dark:bg-night-900 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip dot-grid-bg animate-[fadeIn_0.4s_ease-out]">
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
            <a href="#how-it-works" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-all duration-200 hover:translate-y-[-1px]">How it works</a>
            <a href="#private" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-all duration-200 hover:translate-y-[-1px]">Privacy</a>
            <a href="#faq" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-all duration-200 hover:translate-y-[-1px]">Questions</a>
            <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/55 dark:hover:text-white transition-all duration-200 hover:translate-y-[-1px]">Docs</a>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4 ml-auto shrink-0">
            <LiveUsers className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ============ HERO — vertically centered on desktop, compact on mobile.
          The product is the hero: copy on the left, live demo on the right.
          On mobile, copy stacks above the demo so the first viewport shows
          headline + CTA + a peek of both devices. ============ */}
      <section
        id="main-content"
        className="px-6 min-h-[calc(100dvh-48px)] sm:min-h-0 flex items-center py-12 sm:py-16 lg:py-20 relative z-10"
        aria-labelledby="hero-title"
      >
        <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-10 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center lg:text-left flex flex-col items-center lg:items-start"
          >
            {/* Hero headline — premium, editorial, device-first */}
            <h1
              id="hero-title"
              className="text-[36px] sm:text-[44px] lg:text-[52px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.06] max-w-[14ch]"
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
                onClick={isCreating ? () => { setIsCreating(false); setCreateError(null); } : handleCreate}
                whileTap={{ scale: 0.97 }}
                className={`group px-7 py-3.5 btn-premium text-white rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 shadow-card hover:shadow-float ${
                  isCreating
                    ? 'bg-apple-ink-muted hover:bg-apple-ink-muted/80'
                    : 'bg-azure-600 hover:bg-azure-500'
                } ${!isCreating && createError ? '' : ''}`}
              >
                {isCreating ? (
                  <><span className="relative z-[2]">Cancel</span></>
                ) : createError ? (
                  <><Send className="w-4 h-4 relative z-[2]" /> <span className="relative z-[2]">Try Again</span></>
                ) : (
                  <><Send className="w-4 h-4 relative z-[2]" /> <span className="relative z-[2]">Send something</span></>
                )}
              </motion.button>
              <motion.button
                data-testid="hero-receive"
                onClick={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 btn-premium bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 shadow-card hover:shadow-float"
              >
                <Inbox className="w-4 h-4 relative z-[2]" /> <span className="relative z-[2]">Receive something</span>
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
              <div role="alert" data-testid="error-message" className="mt-5 space-y-2">
                <p className="text-[14px] font-medium text-status-danger whitespace-pre-line leading-relaxed">
                  {createError}
                </p>
                <button
                  onClick={() => { setCreateError(null); handleCreate(); }}
                  className="px-5 py-2.5 rounded-[10px] text-[13px] font-semibold bg-azure-600 hover:bg-azure-500 text-white transition-colors active:scale-[0.97]"
                >
                  Try again
                </button>
                <button
                  onClick={() => setCreateError(null)}
                  className="block text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-colors"
                >
                  Dismiss
                </button>
              </div>
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

      {/* ============ USE CASES — visual cards showing what you can move ============ */}
      <section className="px-6 py-16 sm:py-20 relative z-10">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center mb-10"
          >
            <h2 className="text-[26px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em]">
              What people move with ShareText
            </h2>
            <p className="mt-3 text-[15px] text-apple-ink-muted dark:text-white/60 max-w-md mx-auto">
              From quick links to original photos — anything that belongs on the other screen.
            </p>
          </motion.div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[
              { icon: <Smartphone className="w-5 h-5" />, title: 'Phone to laptop', desc: 'A link, photo, or note from your phone to your computer.', color: 'bg-azure-600/10 text-azure-600 dark:text-azure-400' },
              { icon: <Monitor className="w-5 h-5" />, title: 'iPhone to Windows', desc: 'No AirDrop needed. Works across any two devices with a browser.', color: 'bg-[#B26A00]/10 text-[#B26A00] dark:text-[#F3B44C]' },
              { icon: <Zap className="w-5 h-5" />, title: 'Error logs & code', desc: 'Move a stack trace or snippet without emailing it to yourself.', color: 'bg-[#1C9A61]/10 text-[#1C9A61] dark:text-[#55D18C]' },
              { icon: <Shield className="w-5 h-5" />, title: 'Private content', desc: 'Text, links, or files you want to hand off without a permanent copy.', color: 'bg-[#8B5CF6]/10 text-[#8B5CF6] dark:text-[#A78BFA]' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className="p-5 sm:p-6 rounded-[16px] bg-white dark:bg-surface-dark border border-apple-divider/50 dark:border-apple-tile-3 text-left hover:shadow-card hover:translate-y-[-2px] transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-[12px] ${item.color} flex items-center justify-center mb-3`}>
                  {item.icon}
                </div>
                <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white mb-1">{item.title}</h3>
                <p className="text-[13px] text-apple-ink-muted dark:text-white/60 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS — simple three-step visual ============ */}
      <section className="px-6 py-16 sm:py-20 bg-apple-parchment/50 dark:bg-night-950/50 relative z-10">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center mb-12"
          >
            <h2 className="text-[26px] sm:text-[32px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em]">
              Three steps. That is it.
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              { step: '1', title: 'Open', desc: 'Open ShareText on both devices.', icon: <Globe className="w-5 h-5" /> },
              { step: '2', title: 'Pair', desc: 'Match the code or scan the QR.', icon: <ArrowRight className="w-5 h-5" /> },
              { step: '3', title: 'Send', desc: 'Move anything. It arrives. Done.', icon: <Send className="w-5 h-5" /> },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.5, delay: i * 0.1, ease: EASE }}
                className="text-center"
              >
                <div className="w-12 h-12 rounded-full bg-azure-600/10 dark:bg-azure-400/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-[18px] font-bold text-azure-600 dark:text-azure-400">{item.step}</span>
                </div>
                <h3 className="text-[17px] font-semibold text-apple-ink dark:text-white mb-1.5">{item.title}</h3>
                <p className="text-[14px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-[260px] mx-auto">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Below-the-fold sections are lazy chunks. Each loads only when near
          the viewport. Kept minimal: Privacy, FAQ. */}
      <Suspense fallback={<div className="h-40" aria-hidden />}>
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
          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">              <motion.button
              data-testid="create-session"
              onClick={handleCreate}
              disabled={isCreating}
              whileTap={{ scale: 0.97 }}
              className="group px-8 py-3.5 btn-premium bg-azure-600 hover:bg-azure-500 text-white rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 shadow-card hover:shadow-float min-h-[48px]"
            >
              {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                <><Send className="w-4 h-4" /> Send something</>
              )}
            </motion.button>
            <motion.button
              data-testid="join-session"
              onClick={onJoinClick}
              whileTap={{ scale: 0.97 }}
              className="px-7 py-3.5 btn-premium bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[12px] text-[15px] font-semibold flex items-center justify-center gap-2 shadow-card hover:shadow-float min-h-[48px]"
            >
              <Inbox className="w-4 h-4" /> Receive something
            </motion.button>
          </div>
          {createError && (
            <p role="alert" className="mt-4 text-[14px] font-medium text-status-danger whitespace-pre-line leading-relaxed">
              {createError}
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
              <a href="/guides/about.html" className="hover:text-apple-ink dark:hover:text-white transition-colors">About</a>
              <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
              <a href="/guides/how-to-transfer-files-between-devices.html" className="hover:text-apple-ink dark:hover:text-white transition-colors">Transfer Guide</a>
              <a href="/guides/supported-devices.html" className="hover:text-apple-ink dark:hover:text-white transition-colors">Devices</a>
              <a href="/guides/troubleshooting.html" className="hover:text-apple-ink dark:hover:text-white transition-colors">Help</a>
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
