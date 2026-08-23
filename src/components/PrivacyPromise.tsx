import React from 'react';
import { motion } from 'motion/react';

/**
 * The trust wedge. "What happens to your text?" is the question every
 * first-time visitor is quietly asking; the answer — "nothing, that's the
 * point" — is the product's whole reason to exist.
 *
 * Cards removed. Now an inline editorial list — same style as "Three steps."
 * The zeros are the point, rendered in neutral color (not green).
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
    <section className="px-5 sm:px-6 py-20 sm:py-28 bg-apple-parchment/40 dark:bg-night-950/40">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mb-12"
        >
          <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/50 uppercase tracking-[0.14em] mb-3">
            Private by design
          </p>
          <h2 id="privacy-heading" className="text-[28px] sm:text-[36px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.1]">
            What happens to your text?
          </h2>
          <p className="mt-3 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/55 font-medium leading-relaxed">
            Nothing. It goes from one device to the other, and stops there.
          </p>
        </motion.div>

        {/* Inline editorial list — no cards, no icon circles */}
        <div className="space-y-8">
          {PROMISES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: EASE }}
              className="flex gap-5 items-start"
            >
              <div className="mt-1">
                <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white">{p.title}</h3>
                <p className="mt-1 text-[14px] text-apple-ink-muted dark:text-white/55 leading-relaxed max-w-[48ch]">{p.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats strip — neutral color for all numbers, including zeros */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5, ease: EASE }}
          className="mt-14 border-t border-apple-divider/60 dark:border-white/[0.08] pt-10"
        >
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-6 sm:gap-0 sm:divide-x sm:divide-apple-divider dark:sm:divide-white/[0.08]">
            {STATS.map((s) => (
              <div key={s.label} className="text-center sm:px-4">
                <p className="text-[36px] sm:text-[44px] font-semibold tracking-[-0.04em] leading-none tabular-nums text-apple-ink dark:text-white">
                  {s.n}
                </p>
                <p className="mt-2 text-[12px] sm:text-[13px] text-apple-ink-muted dark:text-white/50 font-medium">
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
