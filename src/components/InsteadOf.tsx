import React from 'react';
import { motion } from 'motion/react';
import { MessageSquare, Mail, Cable, Airplay, Bluetooth } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * "The usual ways" — contrast psychology, honestly told. Every row names a
 * familiar alternative and its one real catch, so the comparison lands as
 * recognition ("oh right, that thing I do") rather than a marketing grid.
 * ShareText's answer is one quiet line at the end — the reader already knows
 * the steps by this point in the page.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

const ROWS: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; name: string; catch: string }[] = [
  {
    icon: MessageSquare,
    name: 'Text it to yourself',
    catch: 'The photo gets smaller, and it lives in your chat forever.',
  },
  {
    icon: Mail,
    name: 'Email it to yourself',
    catch: 'Your inbox, your password, and a file small enough to attach.',
  },
  {
    icon: Cable,
    name: 'Find a cable',
    catch: 'If you can still find one that fits.',
  },
  {
    icon: Airplay,
    name: 'AirDrop',
    catch: 'Brilliant — until the other device isn\u2019t an Apple.',
  },
  {
    icon: Bluetooth,
    name: 'Bluetooth',
    catch: 'Pairing menus you\u2019ll relearn the next time you need them.',
  },
];

export function InsteadOf() {
  return (
    <section className="px-6 py-24 sm:py-32 bg-apple-canvas dark:bg-night-900">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className="max-w-xl"
        >
          <p className="font-mono text-[12px] text-apple-ink-muted dark:text-white/60 uppercase tracking-[0.14em] mb-3">
            The usual ways
          </p>
          <h2 className="text-[30px] sm:text-[40px] font-semibold text-apple-ink dark:text-white tracking-[-0.03em] leading-[1.08]">
            Every other way comes with a catch.
          </h2>
          <p className="mt-4 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed">
            You\u2019ve probably done all of these. They work. They\u2019re just slow.
          </p>
        </motion.div>

        <ul className="mt-12 divide-y divide-apple-divider dark:divide-white/[0.07]">
          {ROWS.map((row, i) => (
            <motion.li
              key={row.name}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.05, ease: EASE }}
              className="flex items-center gap-4 py-5 sm:gap-5"
            >
              <span className="w-10 h-10 sm:w-11 sm:h-11 rounded-[10px] bg-apple-parchment dark:bg-apple-tile-2 flex items-center justify-center shrink-0">
                <row.icon className="w-[18px] h-[18px] text-apple-ink-muted dark:text-white/60" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] sm:text-[16px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">
                  {row.name}
                </span>
                <span className="block mt-0.5 text-[13px] sm:text-[14px] text-apple-ink-muted dark:text-white/55 font-medium leading-snug">
                  {row.catch}
                </span>
              </span>
            </motion.li>
          ))}
        </ul>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.7, ease: EASE }}
          className={cn('mt-12 text-[15px] sm:text-[16px] text-apple-ink-muted dark:text-white/60 font-medium leading-relaxed')}
        >
          ShareText is the same page on both screens. Open it twice, match the code, send —{' '}
          <span className="text-apple-ink dark:text-white font-semibold">nothing kept, nothing compressed.</span>
        </motion.p>
      </div>
    </section>
  );
}
