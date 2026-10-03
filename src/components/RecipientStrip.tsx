import React, { useState } from 'react';
import { Check, X, RotateCw, ChevronDown, CircleSlash } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import type { ChatMessage, RecipientTransfer } from '../types';

/**
 * RecipientStrip — the sender's per-recipient delivery summary.
 *
 * ONE logical share renders ONCE; this strip carries the fan-out truth:
 * per-device states with real progress, per-recipient retry, per-recipient
 * cancel. Partial success is a first-class display state ("2 of 3 sent"),
 * never flattened into one global pass/fail. Progressive disclosure: the
 * compact row shows the summary; expanding reveals per-device detail.
 */

function StateIcon({ state }: { state: RecipientTransfer['state'] }) {
  switch (state) {
    case 'sent':
      return <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" strokeWidth={3} aria-hidden="true" />;
    case 'sending':
    case 'waiting':
      return <SpinLoader size={14} className="text-[--ember]" aria-hidden="true" />;
    case 'failed':
      return <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" strokeWidth={3} aria-hidden="true" />;
    case 'cancelled':
      return <CircleSlash className="h-3.5 w-3.5 text-neutral-400" aria-hidden="true" />;
    default:
      return <span className="h-3.5 w-3.5 rounded-full border border-neutral-300 dark:border-neutral-600" aria-hidden="true" />;
  }
}

export function RecipientStrip({
  message,
  recipients,
  nameOf,
  onRetry,
  onCancel,
}: {
  message: ChatMessage;
  recipients: RecipientTransfer[];
  nameOf: (id: string) => string;
  onRetry: (messageId: string, recipientId: string) => void;
  onCancel: (messageId: string, recipientId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const sent = recipients.filter(r => r.state === 'sent').length;
  const failed = recipients.filter(r => r.state === 'failed' || r.state === 'cancelled').length;
  const active = recipients.filter(r => r.state === 'sending' || r.state === 'waiting').length;
  const allSent = sent === recipients.length;
  const noneSent = sent === 0 && active === 0;

  const summary = allSent
    ? t('xfer.sentAll', { count: String(recipients.length) })
    : noneSent && failed > 0
      ? t('xfer.sentNone', { failed: String(failed), total: String(recipients.length) })
      : sent > 0
        ? t('xfer.sentSome', { sent: String(sent), total: String(recipients.length) })
        : t('xfer.sendingTo', { count: String(recipients.length) });

  return (
    <div className="mt-2 rounded-xl border border-black/6 bg-black/2 dark:border-white/8 dark:bg-white/3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium',
          noneSent && failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-300'
        )}>
          {allSent ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : active > 0 ? <SpinLoader size={14} className="text-[--ember]" aria-hidden="true" /> : <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-hidden="true" />}
          {summary}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-neutral-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <ul className="space-y-0.5 border-t border-black/6 px-2 pb-2 pt-1 dark:border-white/8" role="list">
          {recipients.map((r) => (
            <li key={r.recipientId} className="relative flex items-center gap-2 rounded-lg px-2 py-1.5" role="listitem">
              <StateIcon state={r.state} />
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-700 dark:text-neutral-200">
                {nameOf(r.recipientId)}
              </span>
              {/* Progress as a hairline under the row: real bytes moving, legible
                  at a glance — the % number stays for precision. */}
              {r.state === 'sending' && typeof r.progress === 'number' && (
                <span aria-hidden className="absolute inset-x-2 -bottom-px h-[2px] rounded-full overflow-hidden bg-black/8 dark:bg-white/10">
                  <span
                    className="block h-full rounded-full bg-[--ember] transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.max(2, Math.round(r.progress * 100))}%` }}
                  />
                </span>
              )}
              {r.state === 'sending' && typeof r.progress === 'number' && (
                <span className="text-[11px] tabular-nums text-neutral-400">
                  {Math.round(r.progress * 100)}%
                </span>
              )}
              {r.state === 'failed' && r.retryable && (
                <button
                  type="button"
                  onClick={() => onRetry(message.id, r.recipientId)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-[--ember] hover:bg-[--ember]/10"
                >
                  <RotateCw className="h-3 w-3" aria-hidden="true" />
                  {t('xfer.retryFor', { name: nameOf(r.recipientId) })}
                </button>
              )}
              {(r.state === 'sending' || r.state === 'waiting') && (
                <button
                  type="button"
                  onClick={() => onCancel(message.id, r.recipientId)}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-neutral-500 hover:bg-black/6 dark:text-neutral-400 dark:hover:bg-white/10"
                >
                  {t('xfer.cancelFor', { name: nameOf(r.recipientId) })}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
