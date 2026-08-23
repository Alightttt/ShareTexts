import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { Send, Inbox } from 'lucide-react';
import { LiveUsers } from '../components/LiveUsers';
import { ThemeToggle } from '../components/ThemeToggle';
import { InstallPrompt } from '../components/InstallPrompt';

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
        setCreateError("Couldn't reach the connection service. Check your internet and try again.");
      } else {
        setCreateError(msg);
      }
    }
  };

  return (
    <div className="min-h-screen relative bg-apple-canvas dark:bg-night-950 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip animate-[fadeIn_0.4s_ease-out]">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-40 bg-apple-canvas dark:bg-night-950 border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-5 h-12 sm:h-14 flex items-center">
          <a href="/" className="flex items-center gap-2 shrink-0" aria-label="ShareText">
            <ShareTextLogo size={18} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[14px] text-apple-ink dark:text-white">ShareText</span>
          </a>
          <nav className="hidden md:flex items-center justify-center gap-6 flex-1" aria-label="Page sections">
            <a href="#how-it-works" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-motion">How it works</a>
            <a href="#private" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-motion">Privacy</a>
            <a href="#faq" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-motion">Questions</a>
            <a href="/docs" className="text-[13px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white transition-motion">Docs</a>
          </nav>
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <LiveUsers className="hidden lg:inline-flex" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── HERO — the product story starts here ── */}
      <section
        id="main-content"
        className="px-5 sm:px-6 min-h-[calc(100dvh-48px)] sm:min-h-0 flex items-center py-10 sm:py-16 lg:py-20 relative z-10"
        aria-labelledby="hero-title"
      >
        <div className="max-w-5xl mx-auto w-full grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center lg:text-left flex flex-col items-center lg:items-start"
          >
            <h1
              id="hero-title"
              className="text-[34px] sm:text-[42px] lg:text-[50px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.08] max-w-[14ch]"
            >
              Move anything between your devices.
            </h1>

            <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/55 font-medium leading-relaxed max-w-[38ch]">
              One page, two screens. No app, no account. Temporary by design.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <motion.button
                data-testid="hero-send"
                onClick={isCreating ? () => { setIsCreating(false); setCreateError(null); } : handleCreate}
                whileTap={{ scale: 0.98 }}
                className={`group px-6 py-3 text-[15px] font-semibold rounded-[10px] flex items-center justify-center gap-2 transition-all duration-150 ${
                  isCreating
                    ? 'bg-apple-ink-muted hover:bg-apple-ink-muted/80 text-white'
                    : 'bg-azure-600 hover:bg-azure-500 text-white shadow-sm hover:shadow-md'
                }`}
              >
                {isCreating ? (
                  <span>Cancel</span>
                ) : createError ? (
                  <><Send size={16} /> <span>Try Again</span></>
                ) : (
                  <><Send size={16} /> <span>Send something</span></>
                )}
              </motion.button>
              <motion.button
                data-testid="hero-receive"
                onClick={onJoinClick}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 text-[15px] font-semibold rounded-[10px] flex items-center justify-center gap-2 bg-apple-ink text-white dark:bg-white dark:text-night-900 transition-all duration-150 hover:opacity-90"
              >
                <Inbox className="w-4 h-4" /> Receive something
              </motion.button>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="mt-8 lg:mt-0 w-full flex justify-center"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS — three steps, editorial style ── */}
      <section id="how-it-works" className="px-5 sm:px-6 py-20 sm:py-28 relative z-10">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-16"
          >
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em]">
              Three steps.
            </h2>
          </motion.div>

          <div className="space-y-12">
            {[
              { n: '01', title: 'Open', desc: 'ShareText on both devices. Same page, any browser.' },
              { n: '02', title: 'Connect', desc: 'Type the six-digit code or scan the QR. That\'s the whole pairing.' },
              { n: '03', title: 'Move', desc: 'Text, photo, or file goes straight between devices. Done.' },
            ].map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                className="flex gap-6 items-start"
              >
                <span className="font-mono text-[14px] text-azure-600 dark:text-azure-400 tabular-nums mt-0.5 shrink-0">{step.n}</span>
                <div>
                  <h3 className="text-[18px] font-semibold text-apple-ink dark:text-white">{step.title}</h3>
                  <p className="mt-1.5 text-[15px] text-apple-ink-muted dark:text-white/55 leading-relaxed max-w-[48ch]">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHAT YOU CAN MOVE — inline list, not cards ── */}
      <section className="px-5 sm:px-6 py-20 sm:py-28 bg-apple-parchment/40 dark:bg-night-950/40 relative z-10">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-10"
          >
            <h2 className="text-[28px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em]">
              What people move.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
            {[
              { label: 'Photos', example: 'holiday.jpg — 4.2 MB' },
              { label: 'Text & links', example: 'Meeting notes, URLs, code snippets' },
              { label: 'Videos', example: 'holiday-clip.mp4 — 18.3 MB' },
              { label: 'Files', example: 'presentation.pdf — 2.8 MB' },
              { label: 'Any file', example: 'ZIP, CSV, APK — anything under 4 GB' },
              { label: 'Between phones', example: 'iPhone to Android, or vice versa' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.4, delay: i * 0.04, ease: EASE }}
                className="flex flex-col"
              >
                <span className="text-[15px] font-semibold text-apple-ink dark:text-white">{item.label}</span>
                <span className="mt-0.5 text-[13px] text-apple-ink-muted dark:text-white/50">{item.example}</span>
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

      {/* ── CTA — the wrong-screen moment ── */}
      <section className="px-5 sm:px-6 pb-24 sm:pb-32 pt-20 sm:pt-28 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="text-center max-w-lg mx-auto"
        >
          <h2 className="text-[28px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.1]">
            When it's on the wrong screen.
          </h2>
          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <motion.button
              data-testid="create-session"
              onClick={handleCreate}
              disabled={isCreating}
              whileTap={{ scale: 0.98 }}
              className="px-7 py-3 bg-azure-600 hover:bg-azure-500 text-white rounded-[10px] text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all duration-150"
            >
              {isCreating ? 'Creating…' : createError ? 'Try Again' : (<><Send size={16} /> Send something</>)}
            </motion.button>
            <motion.button
              data-testid="join-session"
              onClick={onJoinClick}
              whileTap={{ scale: 0.98 }}
              className="px-7 py-3 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[10px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-all duration-150 hover:opacity-90"
            >
              <Inbox className="w-4 h-4" /> Receive something
            </motion.button>
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
