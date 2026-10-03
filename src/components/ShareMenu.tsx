import React, { useState } from 'react';
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
// Adapted from OpenSourceUI's share-menu: the trigger stays a single quiet
// button, the menu names each destination. Before this, each surface picked
// one of them and hid the others (the space header copied, the composer
// shared natively, the QR overlay only displayed) — the user had to know
// which button did what. Here the same four rows are always present when
// they're possible, and rows that can't work simply aren't rendered.
//
//   Copy link   — always; clipboard, with a real "Copied" confirmation
//   Copy code   — only when a live code exists
//   Share…      — only where the platform has a native sheet
//   Show QR     — only where the caller has a QR surface to open
//
// Rows are 44px so this works with a thumb, and the whole menu closes on
// any outside pointer — a stuck-open popover is a bug the user can't fix.
// ---------------------------------------------------------------------------

export interface ShareMenuProps {
  url: string;
  /** Live pairing code — adds the "Copy code" row when present. */
  code?: string | null;
  /** Adds the "Show QR" row; the menu closes first. */
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

  const rowClass = 'w-full flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-[12px] text-left text-[13.5px] font-semibold text-apple-ink dark:text-white hover:bg-black/[0.035] dark:hover:bg-white/[0.06] transition-colors active:scale-[0.99]';
  const wellClass = 'shrink-0 w-8 h-8 rounded-[10px] flex items-center justify-center bg-apple-parchment dark:bg-white/[0.07] text-apple-ink-muted dark:text-white/70';

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        data-testid={testId}
        aria-haspopup="menu"
        aria-expanded={open}
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
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
            className={cn(
              'absolute z-50 mt-2 w-[248px] p-1.5 rounded-[18px] border border-apple-divider/70 dark:border-white/10',
              'bg-white dark:bg-[#232328] shadow-[0_18px_44px_-18px_rgba(0,0,0,0.45)]',
              align === 'end' ? 'right-0' : 'left-0'
            )}
          >
            <button type="button" role="menuitem" onClick={() => { void copy(url, 'link'); }} className={rowClass}>
              <span className={cn(wellClass, done === 'link' && 'bg-status-success/12 text-status-success')}>
                {done === 'link' ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
              </span>
              <span className="min-w-0 flex-1 truncate">{done === 'link' ? t('action.copied') : t('space.copyLink')}</span>
            </button>

            {code && (
              <button type="button" role="menuitem" onClick={() => { void copy(code, 'code'); }} className={rowClass}>
                <span className={cn(wellClass, done === 'code' && 'bg-status-success/12 text-status-success')}>
                  {done === 'code' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{done === 'code' ? t('action.copied') : t('create.copyCode')}</span>
              </button>
            )}

            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button type="button" role="menuitem" onClick={() => { void nativeShare(); }} className={rowClass}>
                <span className={wellClass}><Share className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1 truncate">{t('action.share')}…</span>
              </button>
            )}

            {onShowQR && (
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); onShowQR(); }}
                className={rowClass}
              >
                <span className={wellClass}><QrCode className="w-4 h-4" /></span>
                <span className="min-w-0 flex-1 truncate">{t('qr.display.title')}</span>
              </button>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
