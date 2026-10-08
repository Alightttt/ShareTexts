import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight } from '@gravity-ui/icons';
import { cn } from '../../lib/utils';

/**
 * FaqSection — the Docs questions, in a shape you can actually scan.
 *
 * The answers are passed IN, not written here: the Docs page already owns
 * this content (and index.html publishes the same questions as FAQPage
 * structured data), so this component is the reading experience and nothing
 * else. One answer open at a time — a stack of open answers is a wall of
 * text again — with hairline dividers instead of a card per question, so the
 * list reads as one object.
 *
 * Accessibility is not an afterthought on a disclosure: every header is a
 * real <button> with aria-expanded and aria-controls pointing at its panel,
 * the panel is a real element with an id, and the chevron rotates rather
 * than being swapped for a different glyph (a swap is invisible to anyone
 * reading the button's text, a rotation is honest about state).
 */
export type QA = { q: string; a: string };

export function FaqSection({
  items,
  heading,
  className,
  defaultOpen = 0,
}: {
  items: QA[];
  /** Rendered as the section's own h2 when given (long-form pages have one). */
  heading?: string;
  className?: string;
  defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <section className={cn('w-full', className)} aria-labelledby="faq-title">
      {heading ? (
        <h2
          id="faq-title"
          className="mb-4 text-[28px] font-semibold tracking-tight text-apple-ink dark:text-white sm:text-[32px]"
        >
          {heading}
        </h2>
      ) : (
        <div className="mb-5 flex items-baseline gap-3">
          <h2
            id="faq-title"
            className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/75 dark:text-white/40"
          >
            Questions
          </h2>
          <span className="h-px flex-1 bg-apple-divider/70 dark:bg-white/[0.07]" aria-hidden />
        </div>
      )}

      <ul className="divide-y divide-apple-divider/70 border-y border-apple-divider/70 dark:divide-white/[0.06] dark:border-white/[0.06]">
        {items.map((item, i) => {
          const isOpen = open === i;
          const panelId = `faq-panel-${i}`;
          return (
            <li key={item.q}>
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-testid={`faq-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="group flex min-h-[56px] w-full items-center gap-3 py-4 text-left"
                >
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 text-apple-ink-muted transition-transform duration-200 dark:text-white/40',
                      isOpen && 'rotate-90 text-ember dark:text-azure-400',
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'flex-1 text-[15px] font-semibold transition-colors',
                      isOpen
                        ? 'text-apple-ink dark:text-white'
                        : 'text-apple-ink/80 group-hover:text-apple-ink dark:text-white/75 dark:group-hover:text-white',
                    )}
                  >
                    {item.q}
                  </span>
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 pl-7 pr-2 text-[14px] leading-relaxed text-apple-ink-muted dark:text-white/55">
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default FaqSection;
