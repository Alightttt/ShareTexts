import React, { useState } from 'react';
import { useSession } from '../lib/SessionContext';
import { motion } from 'motion/react';
import { ShareTextLogo } from '../components/ShareTextLogo';
import { HeroDemo } from '../components/HeroDemo';
import {
  ArrowRight, Check, X, Image as ImageIcon, Monitor, Smartphone,
  Send, CheckCircle2, ShieldCheck
} from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

/** The honest comparison, grounded in how these tools actually work. */
const COMPARE_ROWS = [
  {
    label: 'How you pair',
    a: 'Auto-discovers devices nearby',
    b: 'Share a link, wait for it to save',
    s: 'Type a 6-digit code — works on any network',
  },
  {
    label: 'What it\u2019s for',
    a: 'Files first. Text is an afterthought.',
    b: 'Public pastes and snippets',
    s: 'Text, first. Photos and files too.',
  },
  {
    label: 'Where your data lives',
    a: 'Between nearby devices only',
    b: 'Their server, until it expires',
    s: 'Between your two devices, encrypted',
  },
  {
    label: 'What happens after',
    a: 'Devices appear every time you open it',
    b: 'The link lingers for days or years',
    s: 'The room expires. Nothing left behind.',
  },
  {
    label: 'Account',
    a: 'None needed',
    b: 'Often required',
    s: 'Never',
  },
] as const;

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
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-night-900 font-sans selection:bg-azure-500/20 flex flex-col overflow-x-clip">
      {/* ============ HERO ============ */}
      <section className="relative bg-linear-to-b from-[#3E93FF] via-azure-600 to-[#0645B4] dark:from-[#2E8BFF] dark:via-azure-700 dark:to-[#052F85] overflow-hidden">
        {/* Soft radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(90%_55%_at_50%_-8%,rgba(255,255,255,0.30),transparent_65%)] pointer-events-none" aria-hidden />
        <div className="absolute inset-0 bg-[radial-gradient(60%_40%_at_85%_100%,rgba(255,255,255,0.12),transparent_60%)] pointer-events-none" aria-hidden />

        {/* Navigation */}
        <nav className="relative w-full px-6 py-6 flex justify-between items-center max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-center gap-2"
          >
            <ShareTextLogo size={28} className="text-white" />
            <span className="font-semibold tracking-tight text-[18px] text-white">ShareText</span>
          </motion.div>
        </nav>

        {/* Hero content */}
        <div className="relative px-6 pt-10 sm:pt-16 pb-10 sm:pb-0 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: EASE }}
            className="px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-xl border border-white/25 text-white/90 text-[13px] font-medium tracking-wide"
          >
            No account required · Temporary by design
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, delay: 0.15, ease: EASE }}
            className="mt-7 text-[46px] sm:text-[64px] md:text-[80px] font-semibold text-white tracking-[-0.04em] leading-[1.03]"
          >
            Move text between<br />your devices.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
            className="mt-6 text-[20px] sm:text-[23px] text-white/75 max-w-2xl font-medium leading-relaxed tracking-tight"
          >
            Text, photos and files. No app. No account. Nothing stored.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.42, ease: EASE }}
            className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto"
          >
            <motion.button
              onPointerDown={handleCreate}
              disabled={isCreating}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-full sm:w-auto px-9 py-3.5 bg-white text-azure-700 rounded-full shadow-[0_12px_30px_rgba(0,40,110,0.35)] disabled:opacity-60 flex items-center justify-center gap-3"
            >
              <span className="flex flex-col items-start text-left leading-tight">
                <span className="text-[17px] font-semibold flex items-center gap-2">
                  {isCreating ? 'Starting…' : createError ? 'Try Again' : <>Send text <ArrowRight className="w-4 h-4" /></>}
                </span>
                <span className="text-[12px] font-medium text-azure-600/80">
                  {isCreating ? 'Creating your room…' : createError ? 'The server didn\u2019t respond' : 'Create a room — you\u2019ll get a code'}
                </span>
              </span>
            </motion.button>
            <motion.button
              onPointerDown={onJoinClick}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="w-full sm:w-auto px-9 py-3.5 bg-white/15 backdrop-blur-xl border border-white/30 text-white rounded-full hover:bg-white/25 transition-colors flex items-center justify-center gap-3"
            >
              <span className="flex flex-col items-start text-left leading-tight">
                <span className="text-[17px] font-semibold">Receive text</span>
                <span className="text-[12px] font-medium text-white/70">Enter the code to join a room</span>
              </span>
            </motion.button>
          </motion.div>
          {createError && (
            <span className="mt-4 text-[14px] text-white/90 font-medium bg-red-500/30 backdrop-blur px-3 py-1 rounded-full">{createError}</span>
          )}
        </div>

        {/* The product, demonstrated */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.55, ease: EASE }}
          className="relative px-4 sm:px-6 pt-14 sm:pt-16 pb-6"
        >
          <HeroDemo onGradient />
        </motion.div>

        {/* Soft fade into the next section */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-linear-to-t from-[#F5F7FA] dark:from-night-900 to-transparent pointer-events-none" aria-hidden />
      </section>

      {/* ============ WHY SHARETEXT: THE COMPARISON ============ */}
      <section className="py-24 sm:py-36 px-6">
        <div className="max-w-[1100px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-center max-w-2xl mx-auto"
          >
            <span className="text-[12px] font-semibold text-azure-600 dark:text-azure-400 tracking-[0.18em] uppercase">
              Why ShareText is different
            </span>
            <h2 className="mt-4 text-[32px] sm:text-[46px] font-semibold text-apple-ink dark:text-white leading-[1.08] tracking-tight">
              Two kinds of tools.<br />Neither was made for this.
            </h2>
            <p className="mt-5 text-[17px] sm:text-[19px] text-apple-ink-muted dark:text-white/60 leading-relaxed font-medium">
              AirDrop-style apps assume your devices are nearby. Paste sites assume your text can
              live on someone else\u2019s server. ShareText is built for the one case both skip —
              text, between devices you own, right now.
            </p>
          </motion.div>

          {/* Desktop ledger */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="hidden md:block mt-14 rounded-(--radius-lg) bg-white dark:bg-night-800 border border-azure-100 dark:border-white/[0.08] shadow-float overflow-hidden"
          >
            <div className="grid grid-cols-[150px_1fr_1fr_1.15fr]">
              <div className="px-5 py-4 text-[11px] font-semibold text-apple-ink-muted dark:text-white/40 tracking-[0.14em] uppercase self-center">
                Compare
              </div>
              <div className="px-5 py-4 border-l border-azure-100 dark:border-white/[0.07]">
                <p className="text-[15px] font-semibold text-apple-ink dark:text-white">Snapdrop-style apps</p>
                <p className="text-[12px] text-apple-ink-muted dark:text-white/45 font-medium">Snapdrop · PairDrop · LocalSend</p>
              </div>
              <div className="px-5 py-4 border-l border-azure-100 dark:border-white/[0.07]">
                <p className="text-[15px] font-semibold text-apple-ink dark:text-white">Paste sites</p>
                <p className="text-[12px] text-apple-ink-muted dark:text-white/45 font-medium">Pastebin · PrivateBin</p>
              </div>
              <div className="px-5 py-4 bg-linear-to-b from-azure-500 to-azure-700">
                <p className="text-[15px] font-semibold text-white flex items-center gap-2"><ShareTextLogo size={15} className="text-white" /> ShareText</p>
                <p className="text-[12px] text-white/70 font-medium">Built for text between your devices</p>
              </div>

              {COMPARE_ROWS.map((row) => (
                <React.Fragment key={row.label}>
                  <div className="px-5 py-4 border-t border-azure-100 dark:border-white/[0.07] text-[13px] font-semibold text-apple-ink-muted dark:text-white/50 flex items-center">
                    {row.label}
                  </div>
                  <div className="px-5 py-4 border-t border-l border-azure-100 dark:border-white/[0.07] text-[13px] text-apple-ink-muted dark:text-white/55 font-medium leading-snug flex items-center gap-2.5">
                    <X className="w-4 h-4 shrink-0 text-red-400/80 dark:text-red-400/60" strokeWidth={2.5} />
                    {row.a}
                  </div>
                  <div className="px-5 py-4 border-t border-l border-azure-100 dark:border-white/[0.07] text-[13px] text-apple-ink-muted dark:text-white/55 font-medium leading-snug flex items-center gap-2.5">
                    <X className="w-4 h-4 shrink-0 text-red-400/80 dark:text-red-400/60" strokeWidth={2.5} />
                    {row.b}
                  </div>
                  <div className="px-5 py-4 border-t border-l border-azure-100 dark:border-white/[0.07] bg-azure-50/70 dark:bg-azure-500/[0.07] text-[13px] text-azure-800 dark:text-azure-200 font-medium leading-snug flex items-center gap-2.5">
                    <span className="w-4 h-4 shrink-0 rounded-full bg-azure-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" strokeWidth={3} />
                    </span>
                    {row.s}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </motion.div>

          {/* Mobile ledger: attribute cards */}
          <div className="md:hidden mt-10 space-y-3">
            {COMPARE_ROWS.map((row, i) => (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: EASE }}
                className="rounded-(--radius-md) bg-white dark:bg-night-800 border border-azure-100 dark:border-white/[0.08] p-4"
              >
                <p className="text-[11px] font-semibold text-apple-ink-muted dark:text-white/45 tracking-[0.14em] uppercase">{row.label}</p>
                <div className="mt-2.5 space-y-2 text-[13px] font-medium leading-snug">
                  <p className="text-apple-ink-muted dark:text-white/55 flex gap-2">
                    <X className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400/80" strokeWidth={2.5} />
                    <span><span className="text-apple-ink dark:text-white/80 font-semibold">Snapdrop apps</span> — {row.a}</span>
                  </p>
                  <p className="text-apple-ink-muted dark:text-white/55 flex gap-2">
                    <X className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400/80" strokeWidth={2.5} />
                    <span><span className="text-apple-ink dark:text-white/80 font-semibold">Paste sites</span> — {row.b}</span>
                  </p>
                  <p className="text-azure-700 dark:text-azure-300 flex gap-2 font-semibold">
                    <span className="w-3.5 h-3.5 shrink-0 mt-0.5 rounded-full bg-azure-500 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </span>
                    <span><span className="font-bold">ShareText</span> — {row.s}</span>
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          <p className="mt-8 text-[14px] text-apple-ink-muted dark:text-white/45 font-medium text-center max-w-xl mx-auto leading-relaxed">
            Snapdrop, PairDrop and LocalSend are excellent at what they do — moving files between
            devices nearby. ShareText is built for a different job.
          </p>
        </div>
      </section>

      {/* ============ FEATURE: Original quality ============ */}
      <section className="py-24 sm:py-36 px-6 max-w-[1200px] mx-auto w-full flex flex-col md:flex-row items-center gap-14 md:gap-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex-1 w-full flex justify-center md:justify-start"
        >
          <FileInspectorCard />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
          className="flex-1 space-y-5 md:pl-6"
        >
          <span className="text-[12px] font-semibold text-azure-600 dark:text-azure-400 tracking-[0.18em] uppercase">
            Original quality
          </span>
          <h3 className="text-[34px] sm:text-[48px] font-semibold text-apple-ink dark:text-white leading-[1.08] tracking-tight">
            Nothing lost.<br />Nothing re-encoded.
          </h3>
          <p className="text-[18px] sm:text-[20px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-lg font-medium">
            ShareText transfers your files exactly as they are — no compression, no transcoding. Your 100&nbsp;MB RAW photo arrives as a 100&nbsp;MB RAW photo.
          </p>
        </motion.div>
      </section>

      {/* ============ FEATURE: Direct connection ============ */}
      <section className="py-24 sm:py-36 bg-white dark:bg-night-800/60 border-y border-azure-100 dark:border-white/[0.06] overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row-reverse items-center gap-14 md:gap-20">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="flex-1 w-full flex justify-center md:justify-end"
          >
            <DirectLinkVisual />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
            className="flex-1 space-y-5 md:pr-6"
          >
            <span className="text-[12px] font-semibold text-azure-600 dark:text-azure-400 tracking-[0.18em] uppercase">
              Direct connection
            </span>
            <h3 className="text-[34px] sm:text-[48px] font-semibold text-apple-ink dark:text-white leading-[1.08] tracking-tight">
              Device to device.<br />Zero intermediaries.
            </h3>
            <p className="text-[18px] sm:text-[20px] text-apple-ink-muted dark:text-white/60 leading-relaxed max-w-lg font-medium">
              Files travel straight from one device to another over WebRTC Data Channels. They never touch a server — and when a direct route isn't possible, an encrypted relay keeps them private.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ============ PRIVACY ============ */}
      <section className="py-24 sm:py-32 px-6 text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: EASE }}
          className="w-14 h-14 rounded-[20px] bg-linear-to-br from-azure-400 to-azure-700 shadow-card flex items-center justify-center mb-6"
        >
          <ShieldCheck className="w-6 h-6 text-white" strokeWidth={2} />
        </motion.div>
        <motion.h3
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
          className="text-[30px] sm:text-[38px] font-semibold text-apple-ink dark:text-white tracking-tight mb-4"
        >
          Temporary by design.
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.16, ease: EASE }}
          className="text-[17px] sm:text-[19px] text-apple-ink-muted dark:text-white/60 max-w-xl font-medium leading-relaxed"
        >
          Rooms expire. Messages aren\u2019t kept as permanent history. Your text is encrypted between
          devices and isn\u2019t readable by the relay.
        </motion.p>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="pb-24 sm:pb-32 px-6 max-w-4xl mx-auto w-full">
        <h3 className="text-[32px] sm:text-[42px] font-semibold text-apple-ink dark:text-white tracking-tight text-center mb-16">
          How it works
        </h3>
        <div className="flex flex-col md:flex-row gap-12 md:gap-10">
          {[
            { n: '01', icon: <Send className="w-5 h-5" />, title: 'Create', body: 'Open ShareText on both devices. Hit Send text on one, Receive text on the other.' },
            { n: '02', icon: <ArrowRight className="w-5 h-5" />, title: 'Pair', body: 'Enter the 6-digit code. Your devices connect instantly — on any network.' },
            { n: '03', icon: <CheckCircle2 className="w-5 h-5" />, title: 'Done', body: 'Paste text or add a file. Copy, open or save it on the other device, then move on.' }
          ].map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: EASE }}
              className="flex-1 flex flex-col items-center text-center group"
            >
              <motion.div
                whileHover={{ scale: 1.06, rotate: -3 }}
                transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                className="w-14 h-14 rounded-[18px] bg-linear-to-br from-azure-400 to-azure-700 text-white shadow-card flex items-center justify-center mb-5"
              >
                {step.icon}
              </motion.div>
              <span className="text-[12px] font-semibold text-azure-600 dark:text-azure-400 tracking-[0.2em] mb-2">{step.n}</span>
              <h4 className="text-[21px] font-semibold text-apple-ink dark:text-white tracking-tight mb-2">{step.title}</h4>
              <p className="text-[15px] text-apple-ink-muted dark:text-white/55 leading-relaxed max-w-xs">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="px-4 sm:px-6 pb-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, ease: EASE }}
          className="relative max-w-[1100px] mx-auto rounded-(--radius-frame) overflow-hidden bg-linear-to-br from-[#3E93FF] via-azure-600 to-[#0645B4] dark:from-[#2E8BFF] dark:via-azure-700 dark:to-[#052F85] text-center px-6 py-20 sm:py-28 shadow-device"
        >
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_-10%,rgba(255,255,255,0.25),transparent_60%)] pointer-events-none" aria-hidden />
          <div className="relative">
            <h2 className="text-[36px] sm:text-[52px] font-semibold text-white tracking-[-0.03em] mb-4 leading-[1.08]">
              Need text on your other device?
            </h2>
            <p className="text-[17px] sm:text-[19px] text-white/75 font-medium mb-10 max-w-md mx-auto">
              Open ShareText on two devices. That's the whole setup.
            </p>
            <motion.button
              onPointerDown={handleCreate}
              disabled={isCreating}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="px-11 py-4 bg-white text-azure-700 rounded-full text-[18px] font-semibold shadow-[0_14px_34px_rgba(0,30,90,0.4)] disabled:opacity-60 flex items-center justify-center gap-2 mx-auto"
            >
              {isCreating ? 'Starting…' : createError ? 'Try Again' : (
                <>Send text <ArrowRight className="w-4.5 h-4.5" /></>
              )}
            </motion.button>
            {createError && (
              <p className="text-[14px] text-white/90 font-medium bg-red-500/30 backdrop-blur px-3 py-1 rounded-full mt-4 inline-block">{createError}</p>
            )}
          </div>
        </motion.div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="w-full px-6 py-12 flex flex-col sm:flex-row justify-between items-center max-w-[1200px] mx-auto mt-auto text-apple-ink-muted dark:text-white/45 text-[14px] font-medium border-t border-azure-100 dark:border-white/[0.07]">
        <div className="flex items-center gap-2 mb-4 sm:mb-0">
          <ShareTextLogo size={16} className="text-azure-600 dark:text-white/60" />
          <span className="font-semibold tracking-tight text-apple-ink dark:text-white/80">ShareText</span>
        </div>
        <div className="flex items-center gap-6 text-[13px]">
          <span>No app</span>
          <span className="w-1 h-1 rounded-full bg-azure-200 dark:bg-white/20" />
          <span>No account</span>
          <span className="w-1 h-1 rounded-full bg-azure-200 dark:bg-white/20" />
          <span>No tracking</span>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Feature visuals (icons, no photos) ---------- */

/** A file-inspector card: "original quality" as a believable product artifact. */
function FileInspectorCard() {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      className="w-full max-w-[360px] rounded-(--radius-lg) bg-white dark:bg-night-800 border border-azure-100 dark:border-white/[0.08] shadow-float p-6"
    >
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-azure-100 dark:border-white/[0.08]">
        <div className="w-11 h-11 rounded-[14px] bg-linear-to-br from-azure-400 to-azure-700 text-white flex items-center justify-center shadow-card">
          <ImageIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-apple-ink dark:text-white truncate">photo_2026.jpg</p>
          <p className="text-[12px] text-apple-ink-muted dark:text-white/50 font-medium">12.4 MB · JPEG</p>
        </div>
      </div>
      <div className="space-y-3">
        {[
          ['Dimensions', '4000 × 3000'],
          ['Color depth', '8-bit RGB'],
          ['Quality', 'Original · 100%'],
          ['Transfer', 'Byte-for-byte']
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">{k}</span>
            <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-azure-100 dark:border-white/[0.08] flex items-center gap-2 text-[13px] font-semibold text-azure-600 dark:text-azure-400">
        <CheckCircle2 className="w-4 h-4" /> Received exactly as sent
      </div>
    </motion.div>
  );
}

/** Device-pair diagram: two devices linked by a live connection. */
function DirectLinkVisual() {
  return (
    <div className="w-full max-w-[380px] flex flex-col items-center gap-7">
      <div className="flex items-center justify-between w-full px-4">
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-20 h-20 rounded-[22px] bg-white dark:bg-night-800 border border-azure-100 dark:border-white/[0.08] shadow-card flex items-center justify-center">
            <Monitor className="w-9 h-9 text-azure-600 dark:text-azure-400" strokeWidth={1.8} />
          </div>
          <span className="text-[12px] font-medium text-apple-ink-muted dark:text-white/50">Your laptop</span>
        </motion.div>

        <div className="relative flex-1 mx-3 h-px bg-azure-200 dark:bg-white/15 overflow-visible">
          <div className="absolute top-1/2 -translate-y-1/2 left-0 w-2 h-2 rounded-full bg-azure-500 shadow-[0_0_10px_rgba(46,139,255,0.9)] animate-beam" />
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 left-1/2 px-2.5 py-1 rounded-full bg-azure-50 dark:bg-night-800 border border-azure-200 dark:border-white/15 text-[11px] font-semibold text-azure-700 dark:text-azure-300 whitespace-nowrap">
            Direct
          </div>
        </div>

        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-20 h-20 rounded-[22px] bg-white dark:bg-night-800 border border-azure-100 dark:border-white/[0.08] shadow-card flex items-center justify-center">
            <Smartphone className="w-9 h-9 text-azure-600 dark:text-azure-400" strokeWidth={1.8} />
          </div>
          <span className="text-[12px] font-medium text-apple-ink-muted dark:text-white/50">Your phone</span>
        </motion.div>
      </div>
      <div className="flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/55">
        <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
        Connected · encrypted
      </div>
    </div>
  );
}
