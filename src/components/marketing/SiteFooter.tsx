import React from 'react';
import { At as AtSign, ArrowUpFromSquare } from '@gravity-ui/icons';
import { cn } from '../../lib/utils';
import { BrandLockup } from '../BrandLockup';

/**
 * SiteFooter — the long-form pages' footer.
 *
 * Tailored, not templated. The usual four-column sitemap is a lie on a site
 * with nine pages: it either repeats the top nav, or it invents links that
 * lead nowhere. So this footer carries what a person at the end of a long
 * page actually might want next — the product, the two legal pages, the one
 * guide, and a way to say something went wrong — in three short columns, each
 * with a heading that means something.
 *
 * It also does the job a footer has on a trust page: state the terms of the
 * deal one last time, in one line, without a badge or a seal. The bottom row
 * repeats the whole promise in three words and a year, which is the honest
 * amount of legal furniture this app needs.
 */
const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Use it',
    links: [
      { label: 'Open ShareTexts', href: '/' },
      { label: 'Share with a code', href: '/#main-content' },
      { label: 'Temporary Space', href: '/docs' },
    ],
  },
  {
    title: 'Read',
    links: [
      { label: 'Docs', href: '/docs' },
      { label: 'About', href: '/about' },
      { label: 'For developers', href: '/llms.txt' },
    ],
  },
  {
    title: 'Terms',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms of use', href: '/terms' },
      { label: 'Report a problem', href: 'https://x.com/0xalyt', external: true },
    ],
  },
];

export function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={cn('border-t border-apple-divider/70 dark:border-white/[0.06]', className)}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="min-w-0">
            <BrandLockup compact mono />
            <p className="mt-3.5 max-w-[320px] text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/50">
              Move text, photos and files between your own devices — phone to laptop, iPhone to
              Windows — in the browser you already have.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-apple-ink-muted/80 dark:text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" aria-hidden />
              iPhone · Android · Windows · macOS · Linux
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="min-w-0">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/70 dark:text-white/35">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-0.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="inline-flex min-h-[40px] items-center text-[13.5px] font-medium text-apple-ink/80 hover:text-ember dark:text-white/65 dark:hover:text-[#fb9243] transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* The bottom row: the deal, stated once, plus the one action a
            reader might want at the very end of a page. */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-apple-divider/60 pt-5 dark:border-white/[0.06]">
          <p className="text-[12.5px] font-medium text-apple-ink-muted/80 dark:text-white/40">
            © {year} ShareTexts · no account · nothing stored
          </p>
          <div className="flex items-center gap-4 text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45">
            <a
              href="https://x.com/0xalyt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[40px] items-center gap-1.5 hover:text-apple-ink dark:hover:text-white transition-colors"
            >
              <AtSign className="h-3.5 w-3.5" aria-hidden />
              0xalyt
            </a>
            <a
              href="#top"
              className="inline-flex min-h-[40px] items-center gap-1.5 hover:text-apple-ink dark:hover:text-white transition-colors"
            >
              <ArrowUpFromSquare className="h-3.5 w-3.5" aria-hidden />
              Top
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
