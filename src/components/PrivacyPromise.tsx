import React from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * The trust wedge. "What happens to your text?" is the question every
 * first-time visitor is quietly asking; the answer — "nothing, that's the
 * point" — is the product's whole reason to exist, and the reason people
 * share it. Three specifics, each true and each verifiable in the app,
 * then the 2-6-0-0-0 strip: tiny setup, zero cost. The zeros are the point.
 *
 * Design: editorial format — no cards, no decorative icons.
 * Bold labels with short descriptions, like a well-typeset article.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const PROMISES = [
  {
    title: 'Encrypted end to end',
    body: 'Content is encrypted between devices using the browser. Connection setup may use service infrastructure.',
  },
  {
    title: 'Temporary by design',
    body: 'No account, no permanent history, no cloud copy. When the session ends, the room closes automatically.',
  },
  {
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
    <section className="px-6 py-20 sm:py-28 bg-apple-parchment dark:bg-night-950">
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
          <h2 id="privacy-heading" className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            What happens to your text?
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
            Nothing. It goes from one device to the other, and stops there.
          </p>
        </motion.div>

        {/* Editorial list — no cards, no icon circles */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
          className="mt-12 max-w-lg mx-auto space-y-6"
        >
          {PROMISES.map((p) => (
            <div key={p.title}>
              <h3 className="text-[15px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                {p.title}
              </h3>
              <p className="mt-1 text-[14px] text-apple-ink-muted dark:text-white/55 font-medium leading-relaxed">
                {p.body}
              </p>
            </div>
          ))}
        </motion.div>

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
                  'text-apple-ink dark:text-white'
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
