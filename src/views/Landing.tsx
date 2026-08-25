import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { Send, Inbox } from 'lucide-react';
import { SendIcon, InboxIcon, AnimatedIcon } from '../components/AnimatedIcon';

import { LiveUsers } from '../components/LiveUsers';
import { ThemeToggle } from '../components/ThemeToggle';
import { InstallPrompt } from '../components/InstallPrompt';
import { Smartphone, Laptop, ArrowRight, Wifi, FileText, Lock } from 'lucide-react';
import { TactileButton } from '../components/TactileButton';
import { signalingConfigIssue } from '../lib/socket';

const PrivacyPromise = lazy(() => import('../components/PrivacyPromise').then(m => ({ default: m.PrivacyPromise })));
const Faq = lazy(() => import('../components/Faq').then(m => ({ default: m.Faq })));

const EASE = [0.16, 1, 0.3, 1] as const;

export function Landing({ onJoinClick }: { onJoinClick: () => void }) {
  const { createSession } = useSession();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
    if (window.location.hash) setTimeout(onHashChange, 100);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleCreate = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setCreateError(null);
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
        const cfg = signalingConfigIssue();
        setCreateError(cfg || "Couldn't reach the connection service. Check your internet and try again.");
      } else {
        setCreateError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen relative bg-apple-canvas dark:bg-night-950 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip animate-[fadeIn_0.4s_ease-out] dot-bg">

      {/* Skip to content — keyboard accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-azure-600 focus:text-white focus:font-semibold focus:text-[14px] focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-apple-canvas/80 dark:bg-night-950/80 backdrop-blur-xl backdrop-saturate-150 border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 h-12 sm:h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText">
            <ShareTextLogo size={18} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[14px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          <nav className="hidden md:flex items-center justify-center gap-6 flex-1" aria-label="Page sections">
            <a href="#how-it-works" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-colors">How it works</a>
            <a href="#private" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-colors">Privacy</a>
            <a href="#faq" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-colors">Questions</a>
            <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-colors">Docs</a>
          </nav>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <LiveUsers className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section
        id="main-content"
        className="px-5 sm:px-6 min-h-[calc(100dvh-48px)] sm:min-h-0 flex items-center py-10 sm:py-16 lg:py-20 relative z-10 overflow-hidden"
        aria-labelledby="hero-title"
      >
        {/* Ambient gradient wash */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[80%] bg-azure-500/[0.04] dark:bg-azure-500/[0.06] rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[60%] bg-azure-400/[0.03] dark:bg-azure-400/[0.04] rounded-full blur-[80px]" />
        </div>
        <div className="max-w-5xl mx-auto w-full grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-10 lg:gap-12 items-center relative">
          <div className="hero-glow" aria-hidden />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center md:text-left flex flex-col items-center md:items-start overflow-hidden"
          >
            <h1
              id="hero-title"
              className="text-[38px] sm:text-[52px] lg:text-[64px] font-bold tracking-[-0.045em] leading-[1.04] max-w-[12ch] text-apple-ink dark:text-white"
            >
              Move anything between your devices.
            </h1>

            <p className="mt-5 text-[16px] sm:text-[18px] text-apple-ink-muted dark:text-white/50 font-medium leading-relaxed max-w-[36ch]">
              One page, two screens. No app, no account. Temporary by design.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto">
              <TactileButton
                data-testid="hero-send"
                onClick={isCreating ? () => { setIsCreating(false); setCreateError(null); } : handleCreate}
                variant="primary"
                size="lg"
                icon={isCreating ? undefined : <SendIcon size={20} active={!isCreating} />}
              >
                {isCreating ? 'Cancel' : createError ? 'Try Again' : 'Send something'}
              </TactileButton>
              <TactileButton
                data-testid="hero-receive"
                onClick={onJoinClick}
                variant="secondary"
                size="lg"
                icon={<InboxIcon size={20} />}
              >
                Receive something
              </TactileButton>
            </div>


            {createError && (
              <div role="alert" data-testid="error-message" className="mt-4 space-y-2">
                <p className="text-[14px] font-medium text-status-danger whitespace-pre-line leading-relaxed">{createError}</p>
                <button onClick={() => { setCreateError(null); handleCreate(); }} className="px-4 py-2 rounded-[8px] text-[13px] font-semibold bg-azure-600 hover:bg-azure-500 text-white transition-colors">
                  Try again
                </button>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, delay: 0.15, ease: EASE }}
            className="mt-8 md:mt-0 w-full min-w-0 overflow-hidden"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="px-5 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-12"
          >
            <h2 className="text-[30px] sm:text-[38px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.1]">
              Three steps.
            </h2>
          </motion.div>

                    <div className="grid sm:grid-cols-3 gap-8 sm:gap-6">
            {[
              { n: '01', title: 'Open', desc: 'ShareText on both devices. Same page, any browser.', icon: <AnimatedIcon animate="receive" looping><Smartphone className="w-5 h-5" /></AnimatedIcon> },
              { n: '02', title: 'Connect', desc: 'Type the code or scan the QR. That\'s the whole pairing.', icon: <AnimatedIcon animate="lock" looping><Wifi className="w-5 h-5" /></AnimatedIcon> },
              { n: '03', title: 'Move', desc: 'Text, photo, or file goes straight between devices. Done.', icon: <AnimatedIcon animate="send" looping><ArrowRight className="w-5 h-5" /></AnimatedIcon> },
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className="group"
              >
                <motion.div
                  whileHover={{ scale: 1.08, rotate: 2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="mb-4 w-11 h-11 rounded-[12px] bg-gradient-to-br from-azure-500/15 to-azure-600/5 dark:from-azure-400/15 dark:to-azure-500/5 border border-azure-500/10 dark:border-azure-400/10 flex items-center justify-center text-azure-600 dark:text-azure-400 shadow-[0_2px_8px_rgba(10,102,240,0.08)]"
                >
                  {step.icon}
                </motion.div>
                <span className="font-mono text-[12px] text-azure-600 dark:text-azure-400 tabular-nums">{step.n}</span>
                <h3 className="mt-2 text-[18px] font-semibold text-apple-ink dark:text-white tracking-[-0.015em]">{step.title}</h3>
                <p className="mt-2 text-[14.5px] text-apple-ink-muted dark:text-white/55 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>      </section>

      {/* ── USE CASES ── */}
      <section className="px-5 sm:px-6 py-16 sm:py-24 relative z-10">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-10"
          >
            <h2 className="text-[30px] sm:text-[38px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.1]">
              What people move.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
            {[
              { title: 'Phone → Laptop', desc: 'A photo from your pocket to your screen.' },
              { title: 'Laptop → Phone', desc: 'A link or text without emailing it to yourself.' },
              { title: 'Text handoff', desc: 'Move notes or code between your machines.' },
              { title: 'Quick handoff', desc: 'Send something without creating an account.' },
              { title: 'Private', desc: 'Transfer temporary content without a permanent cloud copy.' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
                className="text-left"
              >
                <h3 className="text-[15.5px] font-semibold text-apple-ink dark:text-white">{item.title}</h3>
                <p className="mt-1 text-[13.5px] text-apple-ink-muted dark:text-white/55 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRIVACY + FAQ ── */}
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <div id="private" tabIndex={-1}><PrivacyPromise /></div>
        <div id="faq" tabIndex={-1}><Faq /></div>
      </Suspense>

      {/* ── CTA ── */}
      <section className="px-5 sm:px-6 pb-20 sm:pb-28 pt-16 sm:pt-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center max-w-lg mx-auto"
        >
          <h2 className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.1]">
            When it's on the wrong screen.
          </h2>
          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5">
            <TactileButton
              data-testid="create-session"
              onClick={handleCreate}
              disabled={isCreating}
              variant="primary"
              size="lg"
              icon={isCreating ? undefined : <SendIcon size={18} active={!isCreating} />}
            >
              {isCreating ? 'Creating…' : createError ? 'Try Again' : 'Send something'}
            </TactileButton>
            <TactileButton
              data-testid="join-session"
              onClick={onJoinClick}
              variant="secondary"
              size="lg"
              icon={<InboxIcon size={18} />}
            >
              Receive something
            </TactileButton>
          </div>
        </motion.div>
      </section>

      <InstallPrompt />

      {/* ── FOOTER ── */}
      <footer className="px-5 sm:px-6 py-8 sm:py-10 border-t border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <ShareTextLogo size={14} className="text-apple-ink dark:text-white/60" />
              <span className="text-[13px] text-apple-ink-muted dark:text-white/50">
                Temporary bridge between devices.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-apple-ink-muted dark:text-white/50">
              <a href="#how-it-works" className="hover:text-apple-ink dark:hover:text-white transition-colors">How it works</a>
              <a href="#private" className="hover:text-apple-ink dark:hover:text-white transition-colors">Privacy</a>
              <a href="#faq" className="hover:text-apple-ink dark:hover:text-white transition-colors">Questions</a>
              <a href="/docs" className="hover:text-apple-ink dark:hover:text-white transition-colors">Docs</a>
            </div>
          </div>
          <div className="mt-5 pt-5 border-t border-apple-divider/50 dark:border-white/[0.04] flex flex-wrap items-center gap-2 text-[12px] text-apple-ink-muted/60 dark:text-white/30">
            <span>No app</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/15" />
            <span>No account</span>
            <span className="w-1 h-1 rounded-full bg-apple-hairline dark:bg-white/15" />
            <span>Temporary by design</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
