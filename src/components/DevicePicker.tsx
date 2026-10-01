import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Smartphone, Monitor, Tablet, Search, Check, Users, CircleDashed,
  CircleSlash, RefreshCw, Loader2, X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';
import type { PeerDevice } from '../types';

/**
 * DevicePicker — multi-device recipient selection.
 *
 * Device-first, not chat-first: rows show the real device (name, platform,
 * presence, direct-link state, selection). Scales from 2 to 50+ members via
 * search + compact rows; there is deliberately NO participant cap and no
 * "max N devices" copy anywhere. Selection state never relies on color
 * alone (check icon + aria-pressed + text status).
 */

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === 'phone') return <Smartphone className={className} aria-hidden="true" />;
  if (platform === 'tablet') return <Tablet className={className} aria-hidden="true" />;
  return <Monitor className={className} aria-hidden="true" />;
}

/** One plain-language link badge per state — never ICE/SCTP jargon. */
function LinkBadge({ link }: { link: PeerDevice['link'] }) {
  const { t } = useI18n();
  switch (link) {
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {t('picker.ready')}
        </span>
      );
    case 'connecting':
    case 'reconnecting':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {t('picker.connecting')}
        </span>
      );
    case 'offline':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
          <CircleSlash className="h-3 w-3" aria-hidden="true" />
          {t('picker.offline')}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {t('picker.failed')}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
          <CircleDashed className="h-3 w-3" aria-hidden="true" />
          {t('picker.idle')}
        </span>
      );
  }
}

export function DevicePicker({
  peers,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onClose,
  embedded = false,
}: {
  peers: PeerDevice[];
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const others = useMemo(() => peers.filter(p => !p.isSelf), [peers]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return others;
    return others.filter(p => p.name.toLowerCase().includes(q));
  }, [others, query]);
  const selectable = others.filter(p => p.link !== 'offline');
  const showSearch = others.length > 6;
  const showSelectAll = selectable.length > 1;

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border border-black/8 bg-[--paper] shadow-lg shadow-black/5',
        'dark:border-white/10 dark:bg-[--paper-dark]',
        embedded ? 'max-h-[340px]' : 'max-h-[60vh]'
      )}
      role="group"
      aria-label={t('picker.title')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-black/6 px-4 py-3 dark:border-white/8">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
          <Users className="h-4 w-4 opacity-70" aria-hidden="true" />
          <span>
            {others.length === 1
              ? t('picker.oneDevice')
              : t('picker.deviceCount', { count: String(others.length) })}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/8"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {showSearch && (
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-black/8 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
            <Search className="h-4 w-4 text-neutral-400" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('picker.search')}
              className="w-full bg-transparent text-sm text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
              aria-label={t('picker.search')}
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label={t('picker.title')} aria-multiselectable="true">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-neutral-400">
            {others.length === 0 ? t('picker.empty') : t('picker.noMatch')}
          </p>
        ) : (
          filtered.map((p) => {
            const isSelected = selected.includes(p.id);
            const offline = p.link === 'offline';
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                data-participant-id={p.id}
                aria-selected={isSelected}
                disabled={offline}
                onClick={() => onToggle(p.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[--ember]',
                  isSelected
                    ? 'bg-[--ember]/10 dark:bg-[--ember]/15'
                    : 'hover:bg-black/4 dark:hover:bg-white/6',
                  offline && 'opacity-50'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                    isSelected
                      ? 'border-[--ember]/40 bg-[--ember]/15 text-[--ember]'
                      : 'border-black/8 bg-white/70 text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-300'
                  )}
                  aria-hidden="true"
                >
                  <PlatformIcon platform={p.platform} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
                      {p.name}
                    </span>
                    {p.isSelf && (
                      <span className="rounded-full bg-black/6 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                        {t('picker.thisDevice')}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block">
                    <LinkBadge link={offline ? 'offline' : p.link} />
                  </span>
                </span>
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                    isSelected
                      ? 'border-[--ember] bg-[--ember] text-white'
                      : 'border-black/15 bg-transparent dark:border-white/20'
                  )}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {showSelectAll && (
        <div className="flex items-center justify-between gap-2 border-t border-black/6 px-3 py-2.5 dark:border-white/8">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-[--ember] hover:bg-[--ember]/10"
          >
            {t('picker.selectAll', { count: String(selectable.length) })}
          </button>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/8"
            >
              {t('picker.clear')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact "To: …" chip row shown in the composer before sending. */
export function RecipientSummary({
  peers,
  selected,
  onOpen,
  onRemove,
}: {
  peers: PeerDevice[];
  selected: string[];
  onOpen: () => void;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  const nameOf = (id: string) => peers.find(p => p.id === id)?.name ?? t('picker.unknownDevice');
  const shown = selected.slice(0, 2);
  const rest = selected.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-white dark:border-white/12 dark:bg-white/8 dark:text-neutral-200 dark:hover:bg-white/12"
      >
        <Users className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
        {selected.length === 0
          ? t('composer.toDevices')
          : selected.length === 1
            ? t('composer.toOne', { name: nameOf(selected[0]) })
            : t('composer.toMany', { count: String(selected.length) })}
      </button>
      <AnimatePresence initial={false}>
        {shown.map((id) => (
          <motion.span
            key={id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="inline-flex items-center gap-1 rounded-full bg-[--ember]/12 px-2.5 py-1 text-xs font-medium text-[--ember] dark:bg-[--ember]/20"
          >
            {nameOf(id)}
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/15"
              aria-label={t('picker.remove', { name: nameOf(id) })}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      {rest > 0 && (
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-[--ember]/12 px-2.5 py-1 text-xs font-medium text-[--ember] dark:bg-[--ember]/20"
        >
          {t('composer.moreDevices', { count: String(rest) })}
        </button>
      )}
    </div>
  );
}
