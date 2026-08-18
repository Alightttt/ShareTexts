import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, EyeOff, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * The trust wedge. "What happens to your text?" is the question every
 * first-time visitor is quietly asking; the answer — "nothing, that's the
 * point" — is the product's whole reason to exist, and the reason people
 * share it. Three specifics, each true and each verifiable in the app,
 * then the 2-6-0-0-0 strip: tiny setup, zero cost. The zeros are the point.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Encrypted end to end',
    body: 'The connection is encrypted in your browser. Nobody in the middle can read it.',
  },
  {
    icon: EyeOff,
    title: 'Nothing is stored',
    body: 'No account, no history, no cloud copy. When the session ends, the text is gone.',
  },
  {
    icon: RotateCcw,
    title: 'Transfer integrity',
    body: 'Every file is verified with SHA-256. What you send is exactly what arrives.',
  },
];

const STATS = [
  { n: '2', label: 'devices' },
  { n: '6', label: 'digits to pair' },
  { n: '0', label: 'accounts' },
  { n: '0', label: 'apps to install' },
  { n: '0', label: 'bytes of yours kept' },
];

export function PrivacyPromise() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-parchment dark:bg-night-950">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-center max-w-xl mx-auto"
        >
          <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 uppercase tracking-[0.14em] mb-3">
            Private by design
          </p>
          <h2 className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            What happens to your text?
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
            Nothing. It goes from one device to the other, and stops there.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PROMISES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
              className="bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-white/[0.06] rounded-[16px] p-5 sm:p-6"
            >
              <span className="w-10 h-10 rounded-[10px] bg-azure-50 dark:bg-azure-500/12 flex items-center justify-center">
                <p.icon className="w-[18px] h-[18px] text-azure-600 dark:text-azure-400" strokeWidth={1.8} />
              </span>
              <h3 className="mt-4 text-[15px] sm:text-[16px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-1.5 text-[13px] sm:text-[14px] text-apple-ink-muted dark:text-white/55 font-medium leading-relaxed">
                {p.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* The strip — tiny setup, zero cost. The zeros are the story.
            One contained card, equal cells, hairline dividers on desktop; a
            clean two-column wrap on mobile. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mt-14 bg-white dark:bg-apple-tile-1 border border-apple-divider dark:border-white/[0.06] rounded-[20px] shadow-card overflow-hidden"
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-apple-divider dark:divide-white/[0.06]">
            {STATS.map((s) => (
              <div key={s.label} className="px-4 py-7 sm:py-8 text-center">
                <p className={cn(
                  'text-[40px] sm:text-[52px] font-semibold tracking-[-0.05em] leading-none tabular-nums',
                  s.n === '0'
                    ? 'bg-[linear-gradient(180deg,#34c759,#1f9d44)] bg-clip-text text-transparent'
                    : 'text-apple-ink dark:text-white'
                )}>
                  {s.n}
                </p>
                <p className="mt-2.5 text-[12px] sm:text-[13px] text-apple-ink-muted dark:text-white/55 font-medium">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
