import React, { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpFromSquare, Link as Link2, Check, Copy, QrCode } from '@gravity-ui/icons';

/** Gravity UI has one "share" glyph in two shapes — the square-with-arrow is
 *  the same mark the app's share actions already used, so both aliases point
 *  at it and every share affordance in the product stays one symbol. */
const Share2 = ArrowUpFromSquare;
const Share = ArrowUpFromSquare;
import { cn } from '../lib/utils';
import { useI18n } from '../lib/i18n';

// ---------------------------------------------------------------------------
// ShareMenu — one share action, four honest exits.
// ---------------------------------------------------------------------------
// The panel anatomy is OpenSourceUI's share-menu, ported: a tracked-out
// micro-caption, then a HORIZONTAL rail of icon-over-label cells for the
// destinations, then a bordered full-width Copy link button pinned at the
// bottom. Before this, each surface picked one exit and hid the others —
// the user had to know which button did what. Here the same exits are
// always present when they're possible, and cells that can't work simply
// aren't rendered.
//
//   rail    — Copy code (when a live code exists), Share… (where the
//             platform has a native sheet), QR code (where the caller has
//             a surface to open)
//   footer  — Copy link, always; clipboard with a real "Copied" flip, and
//             the menu STAYS OPEN for copy actions (like the original) so
//             the confirmation is visible. Choosing a destination closes.
//
// Cells are ≥40px tall for thumbs, Escape closes (the original does too),
// and any outside pointer closes — a stuck-open popover is a bug the user
// can't fix.
// ---------------------------------------------------------------------------

export interface ShareMenuProps {
  url: string;
  /** Live pairing code — adds the "Copy code" rail cell when present. */
  code?: string | null;
  /** Adds the "QR code" rail cell; the menu closes first. */
  onShowQR?: () => void;
  /** 'icon' = round icon button (composer rows). 'pill' = labelled pill
   *  (the QR overlay's Copy/Share pair). */
  variant?: 'icon' | 'pill';
  /** Pill label override (defaults to the share label). */
  triggerLabel?: string;
  /** Pill personality: quiet (paper) or brand (ember keycap edge). */
  pillTone?: 'quiet' | 'brand';
  /** Rendered instead of the default Share2 glyph. */
  triggerIcon?: React.ReactNode;
  /** 'end' anchors the menu to the trigger's right edge. */
  align?: 'start' | 'end';
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

export function ShareMenu({
  url,
  code,
  onShowQR,
  variant = 'icon',
  triggerLabel,
  pillTone = 'quiet',
  triggerIcon,
  align = 'end',
  className,
  testId,
  ariaLabel,
}: ShareMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'link' | 'code' | null>(null);
  const menuId = useId();

  // Escape closes from anywhere — the original's second close path, and the
  // one keyboard users reach for when a popover has swallowed focus.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const copy = async (text: string, which: 'link' | 'code') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard refused (insecure context / permission) — the old
      // textarea trick, so the row still tells the truth.
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setDone(which);
    setTimeout(() => setDone(null), 1800);
  };

  const nativeShare = async () => {
    setOpen(false);
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'ShareTexts', url }); } catch { /* user closed the sheet */ }
    } else {
      void copy(url, 'link');
    }
  };

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  // The rail: destination cells, only the ones that can actually work.
  type Cell = { id: 'code' | 'share' | 'qr'; label: string; icon: React.ReactNode; onClick: () => void };
  const cells: Cell[] = [
    ...(code
      ? [{
          id: 'code' as const,
          label: done === 'code' ? t('action.copied') : t('create.copyCode'),
          icon: done === 'code' ? <Check /> : <Copy />,
          onClick: () => { void copy(code, 'code'); },
        }]
      : []),
    ...(canNativeShare
      ? [{
          id: 'share' as const,
          label: t('action.share'),
          icon: <Share />,
          onClick: () => { void nativeShare(); },
        }]
      : []),
    ...(onShowQR
      ? [{
          id: 'qr' as const,
          label: t('qr.display.title'),
          icon: <QrCode />,
          onClick: () => { setOpen(false); onShowQR(); },
        }]
      : []),
  ];

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel ?? t('space.share')}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center justify-center transition-colors active:scale-[0.97]',
          variant === 'pill'
            ? cn(
                'gap-2 h-11 w-full px-5 rounded-full text-[13.5px] font-semibold',
                pillTone === 'brand'
                  ? 'bg-ember text-white shadow-[0_3px_0_0_var(--st-btn-primary-edge)] hover:brightness-[1.03] active:translate-y-[2px] active:shadow-[0_1px_0_0_var(--st-btn-primary-edge)]'
                  : 'bg-apple-parchment dark:bg-white/[0.08] text-apple-ink dark:text-white hover:bg-apple-divider/60 dark:hover:bg-white/[0.12]'
              )
            : 'w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider dark:border-white/[0.1] hover:border-apple-ink/30 dark:hover:border-white/30'
        )}
      >
        {triggerIcon ?? <Share2 className={cn(variant === 'pill' ? 'w-4 h-4' : 'w-[18px] h-[18px] text-apple-ink dark:text-white/80')} />}
        {variant === 'pill' && <span>{triggerLabel ?? t('action.share')}</span>}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} aria-hidden />
          <motion.div
            id={menuId}
            role="menu"
            aria-label={t('action.share')}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
            className={cn(
              'absolute z-50 mt-2 w-[248px] p-3 rounded-[18px] border border-apple-divider/70 dark:border-white/10',
              'bg-white dark:bg-[#232328] shadow-[0_18px_44px_-18px_rgba(0,0,0,0.45)]',
              align === 'end' ? 'right-0' : 'left-0'
            )}
          >
            {/* micro-caption — the original's tracked-out label above the rail */}
            <p
              aria-hidden
              className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted/70 dark:text-white/40"
            >
              {t('action.share')}
            </p>

            {/* horizontal rail — icon over a tiny label, one cell per destination */}
            {cells.length > 0 && (
              <div className="flex items-stretch justify-between gap-1">
                {cells.map(cell => (
                  <button
                    key={cell.id}
                    type="button"
                    role="menuitem"
                    onClick={cell.onClick}
                    className={cn(
                      'flex-1 min-w-0 min-h-[48px] flex flex-col items-center justify-center gap-1.5 px-1 py-2 rounded-[12px]',
                      'text-apple-ink dark:text-white/85 transition-colors active:scale-[0.97]',
                      cell.id === 'code' && done === 'code'
                        ? 'bg-status-success/10 text-status-success'
                        : 'hover:bg-apple-parchment dark:hover:bg-white/[0.07]'
                    )}
                  >
                    <span className="[&>svg]:w-4 [&>svg]:h-4">{cell.icon}</span>
                    <span className="w-full text-center text-[9.5px] font-semibold leading-tight truncate">
                      {cell.label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* bordered footer — Copy link, the original's bottom action */}
            <button
              type="button"
              role="menuitem"
              onClick={() => { void copy(url, 'link'); }}
              className={cn(
                'mt-2 w-full min-h-[40px] flex items-center justify-center gap-2 rounded-[12px] border px-3 py-2',
                'text-[12px] font-semibold transition-colors active:scale-[0.99]',
                done === 'link'
                  ? 'border-status-success/40 bg-status-success/10 text-status-success'
                  : 'border-apple-divider dark:border-white/10 text-apple-ink dark:text-white/85 hover:bg-apple-parchment dark:hover:bg-white/[0.07]'
              )}
            >
              {done === 'link' ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {done === 'link' ? t('action.copied') : t('space.copyLink')}
            </button>
          </motion.div>
        </>
      )}
    </div>
  );
}
