import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { AnimatedIcon } from './AnimatedIcon';
import { cn } from '../lib/utils';

/**
 * The questions people actually ask — answered in plain language.
 * Uses semantic <details>/<summary> for keyboard and screen reader access.
 * Each question is independently expandable without hiding content from AT.
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
    a: 'Yes. The transfer is encrypted between the two devices. ShareText is designed for temporary handoffs — when the room closes automatically.',
  },
  {
    q: 'What if my internet drops mid-transfer?',
    a: 'If the connection is interrupted, ShareText will tell you whether this transfer can be retried. For large files, we recommend a stable connection.',
  },
  {
    q: 'How long does the pairing code last?',
    a: "It\u2019s fresh for 90 seconds on screen. If it runs out, the app shows a new one.",
  },
  {
    q: 'Can a script or AI agent send text into my room?',
    a: 'Yes — the connect screen offers a temporary send permission for trusted tools. It expires automatically and can be revoked anytime.',
  },
];

function FaqItem({ item, index }: { item: typeof QA[number]; index: number; key?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.04, ease: EASE }}
    >
      <details
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
        className="group py-5"
      >
        <summary
          data-testid="faq-toggle"
          className={cn(
            "flex items-center justify-between gap-3 cursor-pointer list-none",
            "text-[16px] sm:text-[17px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]",
            "min-h-[44px] py-1 rounded-lg",
            "focus-visible:outline-2 focus-visible:outline-apple-blue focus-visible:outline-offset-2",
            "[&::-webkit-details-marker]:hidden [&::marker]:hidden"
          )}
          aria-label={`${item.q} — ${open ? 'collapse' : 'expand'}`}
        >
          <span>{item.q}</span>
          <AnimatedIcon animate="chevron" active={open} className="shrink-0 text-apple-ink-muted dark:text-white/50">
            <ChevronDown className="w-4 h-4" aria-hidden />
          </AnimatedIcon>
        </summary>
        <div className="pb-1 pt-1">
          <p className="text-[14px] sm:text-[15px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
            {item.a}
          </p>
        </div>
      </details>
    </motion.div>
  );
}

export function Faq() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-canvas dark:bg-night-900" aria-labelledby="faq-heading">
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
          <h2 id="faq-heading" className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            Questions people actually ask.
          </h2>
        </motion.div>

        <div className="mt-10 divide-y divide-apple-divider dark:divide-white/[0.07]">
          {QA.map((item, i) => (
            <FaqItem key={item.q} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
