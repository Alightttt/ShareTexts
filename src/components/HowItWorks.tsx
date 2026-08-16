import React from 'react';
import { motion } from 'motion/react';

/**
 * "How it works" — three plain steps, in the order a first-time user
 * actually experiences them. No jargon, no menu screenshots, no "step 3:
 * profit". The numerals are editorial (01/02/03) because the steps read as
 * a sequence, not a grid of features. Language is deliberately plain so the
 * section works for a teenager and for someone who has never done this before.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = [
  {
    n: '01',
    title: 'Open it twice',
    body: 'On the phone and the laptop. Same page, any browser — nothing to install, nothing to sign up for.',
  },
  {
    n: '02',
    title: 'Match the code',
    body: 'One device shows six digits. Type them on the other, or scan the QR. That\u2019s the whole pairing.',
  },
  {
    n: '03',
    title: 'Send it',
    body: 'Text, photo, or file goes straight between the two devices, encrypted. Nothing stops in between.',
  },
];

export function HowItWorks() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-canvas dark:bg-night-900">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-xl"
        >
          <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 uppercase tracking-[0.14em] mb-3">
            How it works
          </p>
          <h2 className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            Two screens. One page.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
            Nothing to download, nothing to configure. Just a page, open on both devices.
          </p>
        </motion.div>

        <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: EASE }}
              className="border-t border-apple-divider dark:border-white/[0.08] pt-6"
            >
              <span className="font-mono text-[13px] text-azure-600 dark:text-azure-400 tabular-nums">{step.n}</span>
              <h3 className="mt-3 text-[19px] sm:text-[20px] font-semibold text-apple-ink dark:text-white tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
