import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Check } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * Language switcher — quiet, Apple-simple dropdown.
 *
 * A soft fade/scale open, one flat list, hover = a plain highlight that
 * never moves or tilts anything. The active language carries the check.
 * Keyboard: arrows + Enter, Escape closes. Reduced motion: MotionConfig
 * zeroes the springs globally.
 */
export function LanguageMenu({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Keyboard highlight index (-1 = none). Active while navigating.
  const [kbIdx, setKbIdx] = useState(-1);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setKbIdx(LANGS.findIndex(l => l.code === lang));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setKbIdx(i => (i + 1) % LANGS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setKbIdx(i => (i - 1 + LANGS.length) % LANGS.length);
    } else if (e.key === 'Enter' && kbIdx >= 0) {
      e.preventDefault();
      setLang(LANGS[kbIdx].code);
      setOpen(false);
      setKbIdx(-1);
      btnRef.current?.focus();
    }
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen(o => !o); setKbIdx(-1); }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.menu')}
        title={t('lang.menu')}
        className="flex items-center justify-center min-w-[30px] min-h-[40px] -my-[10px] rounded-full text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white hover:bg-apple-divider/50 dark:hover:bg-white/[0.07] transition-colors"
      >
        <Languages className="w-[17px] h-[17px]" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            role="listbox"
            aria-label={t('lang.menu')}
            className={cn(
              "absolute top-[calc(100%+6px)] z-50 mt-1 w-44 rounded-[14px] bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)] p-1.5 max-h-[60vh] overflow-y-auto",
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {LANGS.map((l, i) => {
              const active = l.code === lang;
              const hovered = kbIdx === i;
              return (
                <li key={l.code} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => { setLang(l.code); setOpen(false); }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setKbIdx(idx => (idx + 1) % LANGS.length); }
                      else if (e.key === 'ArrowUp') { e.preventDefault(); setKbIdx(idx => (idx - 1 + LANGS.length) % LANGS.length); }
                      else if (e.key === 'Enter') { e.preventDefault(); setLang(l.code); setOpen(false); btnRef.current?.focus(); }
                    }}
                    onMouseEnter={() => setKbIdx(i)}
                    lang={l.code}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] text-[13px] transition-colors",
                      active
                        ? "bg-ember/[0.08] dark:bg-ember/[0.13] text-apple-ink dark:text-white font-semibold"
                        : hovered
                          ? "bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink dark:text-white"
                          : "text-apple-ink dark:text-white/85"
                    )}
                  >
                    <span className="truncate">{l.native}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0 text-ember dark:text-ember" />}
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
