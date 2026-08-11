import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import { ScrollStory } from '../components/ScrollStory';
import { Situations } from '../components/Situations';
import { ArrowRight } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

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
    <div className="min-h-screen bg-apple-canvas dark:bg-night-900 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip">
      {/* ============ HEADER — logo only; nothing competes with the product ============ */}
      <header className="sticky top-0 z-40 bg-apple-canvas/85 dark:bg-night-900/85 backdrop-blur-md border-b border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center">
          <a href="/" className="flex items-center gap-2" aria-label="ShareText — the temporary bridge between your devices">
            <ShareTextLogo size={21} className="text-apple-ink dark:text-white" />
            <span className="font-semibold tracking-tight text-[15px] text-apple-ink dark:text-white">ShareText</span>
          </a>
        </div>
      </header>

      {/* ============ HERO — copy and product demonstration share the frame ============ */}
      <section className="px-6 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-16 lg:gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <h1 className="text-[32px] sm:text-[40px] lg:text-[44px] font-semibold text-apple-ink dark:text-white tracking-[-0.035em] leading-[1.1] max-w-[20ch]">
              Move something between your devices.
            </h1>
            <p className="mt-5 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed max-w-[46ch]">
              Text, photos and files. No app. No account.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <motion.button
                onPointerDown={handleCreate}
                disabled={isCreating}
                whileTap={{ scale: 0.97 }}
                className="group px-7 py-3.5 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[10px] text-[15px] font-semibold flex items-center justify-center gap-2 transition-motion disabled:opacity-60 shadow-card hover:shadow-float"
              >
                {isCreating ? 'Creating…' : createError ? 'Try Again' : (
                  <>Create Session <ArrowRight className="w-4 h-4 transition-transform duration-200 ease-out group-hover:translate-x-0.5" /></>
                )}
              </motion.button>
              <motion.button
                onPointerDown={onJoinClick}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 rounded-[10px] text-[14px] font-medium text-apple-ink-muted dark:text-white/55 border border-apple-divider dark:border-white/15 hover:text-apple-ink dark:hover:text-white hover:border-apple-ink/30 dark:hover:border-white/30 transition-motion flex items-center justify-center"
              >
                Join Session
              </motion.button>
            </div>
            <p className="mt-6 text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
              No account required · Temporary by default
            </p>
            {createError && (
              <p className="mt-5 text-[14px] font-medium text-status-danger flex items-center gap-2">
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

      {/* ============ WHY SHARETEXT — told through situations, not features ============ */}
      <Situations />

      {/* ============ ENDING ============ */}
      <section className="px-6 pb-28 sm:pb-36 pt-4">
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
          <motion.button
            onPointerDown={handleCreate}
            disabled={isCreating}
            whileTap={{ scale: 0.97 }}
            className="group mt-9 px-9 py-4 bg-apple-ink text-white dark:bg-white dark:text-night-900 rounded-[10px] text-[16px] font-semibold flex items-center gap-2 mx-auto transition-motion disabled:opacity-60 shadow-card hover:shadow-float"
          >
            {isCreating ? 'Creating…' : createError ? 'Try Again' : (
              <>Create Session <ArrowRight className="w-4.5 h-4.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" /></>
            )}
          </motion.button>
          <p className="mt-6 text-[15px] text-apple-ink-muted dark:text-white/55 font-medium">
            Open it on the other device and connect.
          </p>
          {createError && (
            <p className="mt-4 text-[14px] font-medium text-status-danger inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger" /> {createError}
            </p>
          )}
        </motion.div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="px-6 py-10 border-t border-apple-divider dark:border-white/[0.06]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShareTextLogo size={16} className="text-apple-ink dark:text-white/70" />
            <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50">
              The temporary bridge between your devices.
            </span>
          </div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
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
