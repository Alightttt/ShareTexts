import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Check } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * Language switcher — a quiet globe that opens the locale list. The choice
 * persists (localStorage) and flips <html lang/dir> immediately, so RTL
 * locales reflow without a reload. Text stays legible in any language because
 * entries render in their own script (English label secondarily).
 */
export function LanguageMenu({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.menu')}
        title={t('lang.menu')}
        className="flex items-center justify-center min-w-[40px] min-h-[40px] -my-[10px] rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-apple-divider/50 dark:hover:bg-white/[0.07] transition-colors"
      >
        <Languages className="w-[17px] h-[17px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.22 }}
            role="listbox"
            aria-label={t('lang.menu')}
            className={cn(
              "absolute top-[calc(100%+6px)] z-50 mt-1 w-44 rounded-[14px] bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 shadow-2xl p-1.5 max-h-[60vh] overflow-y-auto",
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {LANGS.map(l => {
              const active = l.code === lang;
              return (
                <li key={l.code} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => { setLang(l.code); setOpen(false); }}
                    lang={l.code}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] text-[13px] transition-colors",
                      active
                        ? "bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/15 text-apple-ink dark:text-white font-semibold"
                        : "text-apple-ink dark:text-white/85 hover:bg-apple-divider/40 dark:hover:bg-white/[0.06]"
                    )}
                  >
                    <span className="truncate">{l.native}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0 text-[#8b7cf6] dark:text-[#a78bfa]" />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
