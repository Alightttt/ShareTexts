import React from 'react';
import { motion } from 'motion/react';

/**
 * The questions people actually ask — answered in plain language, all
 * visible (no accordion, no hidden content). Every answer is a true claim
 * about the app: cross-device browsers, nothing to install, E2E encryption,
 * resumable transfers, 40-second pairing codes. This is the section a
 * hesitant first-time user — or someone helping their parents — reads
 * before they press a button.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const QA = [
  {
    q: 'Does it work between iPhone and Windows?',
    a: 'Yes. Any device with a browser — phones, laptops, tablets, Mac, Windows, Chromebook. The two devices don\u2019t need to match.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. Both devices just open the same page. That\u2019s it.',
  },
  {
    q: 'Is it private?',
    a: 'Yes. The transfer is encrypted between the two devices, and nothing is stored anywhere. When the session ends, it\u2019s gone.',
  },
  {
    q: 'What if my internet drops mid-transfer?',
    a: 'If the connection is interrupted, ShareTexts will tell you whether this transfer can be retried. For large files, we recommend a stable connection.',
  },
  {
    q: 'How long does the pairing code last?',
    a: 'It\u2019s fresh for 40 seconds on screen. If it runs out, the app shows a new one.',
  },
  {
    q: 'Can a script or AI agent send text into my room?',
    a: 'Yes — the connect screen offers a temporary send permission for trusted tools. It expires automatically and can be revoked anytime.',
  },
];

export function Faq() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-canvas dark:bg-night-900">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 uppercase tracking-[0.14em] mb-3">
            Questions
          </p>
          <h2 className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            Questions people actually ask.
          </h2>
        </motion.div>

        <div className="mt-10 divide-y divide-apple-divider dark:divide-white/[0.07]">
          {QA.map((item, i) => (
            <motion.div
              key={item.q}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.04, ease: EASE }}
              className="py-6"
            >
              <h3 className="text-[16px] sm:text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                {item.q}
              </h3>
              <p className="mt-2 text-[14px] sm:text-[15px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
                {item.a}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
