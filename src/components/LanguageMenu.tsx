import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Check } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * Language switcher — bencho "magnetic select" flavor.
 *
 * The open list tracks the pointer: the whole card tilts ≤3° toward the
 * cursor and each row leans ~1.5px with a spring, so the menu feels attached
 * to the hand instead of floating above it. Keyboard users get the plain
 * behavior (no tilt, arrow keys + Enter), Escape still closes, and the
 * active language still carries the check. No new dependencies — pointer
 * math plus motion springs. Reduced motion: MotionConfig zeroes the springs.
 */
export function LanguageMenu({ className, align = 'right' }: { className?: string; align?: 'left' | 'right' }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Pointer position relative to the list center, normalized to [-1, 1].
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Keyboard highlight index (-1 = none). Active while navigating.
  const [kbIdx, setKbIdx] = useState(-1);
  const btnRef = useRef<HTMLButtonElement>(null);

  const resetTilt = useCallback(() => setTilt({ x: 0, y: 0 }), []);

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

  // Magnetic field: only while a pointer hovers the list (keyboard
  // navigation never tilts anything).
  const onListPointerMove = (e: React.PointerEvent) => {
    const el = listRef.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;   // -1..1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    setTilt({ x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) });
  };

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

  // The tilt: card leans toward the pointer (≤3°), rows lean a touch more.
  const cardRotate = tilt.x * 1.6;
  const cardTiltY = tilt.y * -1.2;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setOpen(o => !o); setTilt({ x: 0, y: 0 }); setKbIdx(-1); }}
        onKeyDown={onKeyDown}
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
            ref={listRef}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              rotate: cardRotate,
              rotateY: cardTiltY,
              transformPerspective: 600,
            }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ type: 'spring', bounce: 0.18, duration: 0.34 }}
            onPointerMove={onListPointerMove}
            onPointerLeave={resetTilt}
            role="listbox"
            aria-label={t('lang.menu')}
            className={cn(
              "absolute top-[calc(100%+6px)] z-50 mt-1 w-44 rounded-[14px] bg-white dark:bg-surface-dark border border-apple-divider dark:border-apple-tile-3 shadow-2xl p-1.5 max-h-[60vh] overflow-y-auto",
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {LANGS.map((l, i) => {
              const active = l.code === lang;
              const hovered = hoverIdx === i || kbIdx === i;
              // Magnetic row: rows lean toward the cursor, the hovered row
              // most; a spring pulls everything back on leave.
              const rowShift = hovered ? tilt.x * 2.5 : tilt.x * 1;
              return (
                <motion.li
                  key={l.code}
                  role="option"
                  aria-selected={active}
                  animate={{ x: rowShift }}
                  transition={{ type: 'spring', bounce: 0.35, duration: 0.4 }}
                  onPointerEnter={() => { setHoverIdx(i); setKbIdx(-1); }}
                  onPointerLeave={() => setHoverIdx(h => (h === i ? null : h))}
                >
                  <button
                    type="button"
                    onClick={() => { setLang(l.code); setOpen(false); }}
                    lang={l.code}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[10px] text-[13px] transition-colors",
                      active
                        ? "bg-[#8b7cf6]/10 dark:bg-[#a78bfa]/15 text-apple-ink dark:text-white font-semibold"
                        : hovered
                          ? "bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink dark:text-white"
                          : "text-apple-ink dark:text-white/85"
                    )}
                  >
                    <span className="truncate">{l.native}</span>
                    {active && (
                      <motion.span
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', bounce: 0.55, duration: 0.4 }}
                      >
                        <Check className="w-3.5 h-3.5 shrink-0 text-[#8b7cf6] dark:text-[#a78bfa]" />
                      </motion.span>
                    )}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
