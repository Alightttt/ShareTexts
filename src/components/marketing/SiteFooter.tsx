import React from 'react';
import { At as AtSign } from '@gravity-ui/icons';
import { cn } from '../../lib/utils';
import { BrandLockup } from '../BrandLockup';
import { useI18n } from '../../lib/i18n';
import type { MsgKey } from '../../lib/messages/types';

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
 * Fully localized (the hardcoded-English version shipped before the demo
 * round's 9-locale pass caught it). The bottom row states the deal one last
 * time in words that already exist in every locale.
 */
const COLUMNS: { title: MsgKey; links: { label: MsgKey; href: string; external?: boolean }[] }[] = [
  {
    title: 'footer.useIt',
    links: [
      { label: 'footer.open', href: '/' },
      { label: 'footer.withCode', href: '/#main-content' },
      { label: 'space.title', href: '/docs' },
    ],
  },
  {
    title: 'footer.read',
    links: [
      { label: 'nav.docs', href: '/docs' },
      { label: 'nav.about', href: '/about' },
      { label: 'footer.devs', href: '/llms.txt' },
    ],
  },
  {
    title: 'footer.terms',
    links: [
      { label: 'nav.privacy', href: '/privacy' },
      { label: 'nav.terms', href: '/terms' },
      { label: 'footer.report', href: 'https://x.com/0xalyt', external: true },
    ],
  },
];

export function SiteFooter({ className }: { className?: string }) {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className={cn('border-t border-apple-divider/70 dark:border-white/[0.06]', className)}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="min-w-0">
            <BrandLockup compact mono />
            <p className="mt-3.5 max-w-[320px] text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/50">
              {t('home.subtitle')}
            </p>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] font-medium text-apple-ink-muted/80 dark:text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" aria-hidden />
              iPhone · Android · Windows · macOS · Linux
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={t(col.title)} className="min-w-0">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/70 dark:text-white/35">
                {t(col.title)}
              </h2>
              <ul className="mt-3 space-y-0.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className="inline-flex min-h-[40px] items-center text-[13.5px] font-medium text-apple-ink/80 hover:text-ember dark:text-white/65 dark:hover:text-[#fb9243] transition-colors"
                    >
                      {t(link.label)}
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
            © {year} ShareTexts · {t('footer.noApp')} · {t('footer.noAccount')} · {t('footer.temporary')}
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
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
