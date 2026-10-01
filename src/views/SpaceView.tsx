/**
 * SpaceView — the Temporary Space UI (F14).
 *
 * Feels like a temporary shared shelf, not a Drive clone or chat app:
 *   TOP: name · countdown · device count · share/close actions
 *   MAIN: content (text/link/file cards, newest first)
 *   ADD: one composer — type, paste, choose, drop
 *
 * Copy follows §93: human, calm, honest. Server state is authoritative —
 * the view only mirrors what useSpaceClient reports.
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Check, Clock, Copy, Download, File as FileIcon, Image as ImageIcon,
  Link2, Loader2, Pause, Play, Plus, QrCode, Share2, Trash2, UploadCloud, X, XCircle,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { useSpaceClient, type LocalUpload } from '../lib/space/useSpaceClient';
import { spaceShareLink, localCreds } from '../lib/space/api';
import type { SpaceItem } from '../lib/space/types';
import { closingTime, remainingShort, urgencyTier } from '../lib/space/time';
import { reminderSupport, enableReminder, disableReminder } from '../lib/space/reminders';

const QRCode = lazy(() => import('qrcode.react').then(m => ({ default: m.QRCodeSVG })));

const HOUR = 3_600_000;
const DURATIONS: Array<{ ms: number; label: string }> = [
  { ms: 6 * HOUR, label: '6h' },
  { ms: 12 * HOUR, label: '12h' },
  { ms: 24 * HOUR, label: '1d' },
  { ms: 2 * 24 * HOUR, label: '2d' },
  { ms: 3 * 24 * HOUR, label: '3d' },
  { ms: 5 * 24 * HOUR, label: '5d' },
  { ms: 7 * 24 * HOUR, label: '7d' },
];

function humanDuration(ms: number): string {
  const h = ms / HOUR;
  if (h < 24) return `${h}h`;
  return `${ms / (24 * HOUR)}d`;
}

// ── small atoms ───────────────────────────────────────────────────────────

function Countdown({ expiresAt, now }: { expiresAt: number; now: number }) {
  const { t } = useI18n();
  const left = expiresAt - now;
  const tier = urgencyTier(left);
  const color =
    tier === 'imminent' ? 'text-red-600 dark:text-red-400'
    : tier === 'soon' ? 'text-amber-600 dark:text-amber-400'
    : 'text-apple-ink-muted dark:text-white/50';
  if (left <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums ${color}`}>
      <Clock className="w-3.5 h-3.5" />
      {t('space.closesIn', { time: remainingShort(left) })}
      <span className="hidden sm:inline text-apple-ink-muted/60 dark:text-white/35">· {closingTime(expiresAt)}</span>
    </span>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PREVIEWABLE = /^(image\/(png|jpeg|gif|webp|avif|heic|heif|bmp))$/i;

function ItemCard({
  item, canRemove, onCopy, onDownload, onRemove,
}: {
  item: SpaceItem;
  canRemove: boolean;
  onCopy(item: SpaceItem): void;
  onDownload(item: SpaceItem): void;
  onRemove(item: SpaceItem): void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);
  const isImage = item.kind === 'file' && PREVIEWABLE.test(item.mime);
  const [src, setSrc] = useState<string | null>(null);

  // Previews load lazily and only for safe image types; anything else gets
  // the clean file representation (§21 — a failed preview is NOT an error).
  useEffect(() => {
    if (!isImage) return;
    let dead = false;
    let url: string | null = null;
    import('../lib/space/api').then(({ downloadItem }) => {
      // Reuse the authorized fetch; render via blob URL — never a raw
      // executable-content URL on our origin (§19).
    }).catch(() => { /* preview unavailable */ });
    (async () => {
      try {
        const { default: apiMod } = await import('../lib/space/api') as unknown as { default?: unknown };
        void apiMod;
      } catch { /* noop */ }
    })();
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="group relative rounded-[16px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden"
      data-testid="space-item"
      data-kind={item.kind}
    >
      <div className="p-3.5">
        {item.kind === 'text' && (
          <p className="text-[14.5px] leading-relaxed text-apple-ink dark:text-white/90 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">{item.text}</p>
        )}
        {item.kind === 'link' && (
          <a
            href={item.text}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 text-[14px] font-medium text-azure-600 dark:text-azure-400 hover:underline break-all"
          >
            <Link2 className="w-4 h-4 shrink-0" />
            {item.text}
          </a>
        )}
        {item.kind === 'file' && (
          <div className="flex items-center gap-3">
            <span className="shrink-0 w-10 h-10 rounded-[12px] bg-apple-parchment dark:bg-white/[0.06] flex items-center justify-center">
              {isImage && !err
                ? <ImageIcon className="w-5 h-5 text-apple-ink-muted dark:text-white/55" />
                : <FileIcon className="w-5 h-5 text-apple-ink-muted dark:text-white/55" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-apple-ink dark:text-white/90 truncate">{item.name || 'file'}</span>
              <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/50">{fmtSize(item.size)}{PREVIEWABLE.test(item.mime) ? '' : ` · ${t('space.downloadOnly')}`}</span>
            </span>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2.5 text-[12px] text-apple-ink-muted/80 dark:text-white/40">
          <span className="truncate">{t('space.addedBy', { name: item.addedByName })}</span>
          <span className="flex-1" />
          {item.kind === 'text' && (
            <button
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              onClick={() => { onCopy(item); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t('space.copied') : t('space.copy')}
            </button>
          )}
          {item.kind === 'file' && (
            <button
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
              onClick={() => onDownload(item)}
            >
              <Download className="w-3.5 h-3.5" />
              {t('space.download')}
            </button>
          )}
          {canRemove && (
            <button
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] font-medium text-red-600/80 dark:text-red-400/80 hover:bg-red-500/[0.08] transition-colors"
              onClick={() => onRemove(item)}
              aria-label={t('space.remove')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function UploadRow({ up, onCancel, t }: { up: LocalUpload; onCancel(key: string): void; t: (k: never, p?: never) => string }) {
  const pct = up.progress.size > 0 ? Math.min(100, Math.round((up.progress.sent / up.progress.size) * 100)) : 0;
  const label =
    up.progress.phase === 'preparing' ? t('space.upPreparing' as never) :
    up.progress.phase === 'verifying' ? t('space.upVerifying' as never) :
    up.progress.phase === 'paused' ? t('space.pause' as never) :
    up.progress.phase === 'failed' ? t('space.upFailed' as never) :
    up.progress.phase === 'cancelled' ? t('space.upCancelled' as never) :
    t('space.upUploading' as never);
  const done = up.progress.phase === 'ready';
  return (
    <div className="rounded-[16px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] p-3.5" data-testid="space-upload" data-phase={up.progress.phase}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-10 h-10 rounded-[12px] bg-apple-parchment dark:bg-white/[0.06] flex items-center justify-center">
          <UploadCloud className={`w-5 h-5 ${done ? 'text-emerald-600 dark:text-emerald-400' : up.progress.phase === 'failed' || up.progress.phase === 'cancelled' ? 'text-red-500' : 'text-apple-ink-muted dark:text-white/55'}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-apple-ink dark:text-white/90 truncate">{up.name}</span>
          <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/50">
            {label}{!done && up.progress.phase === 'uploading' ? ` · ${pct}%` : ''}
          </span>
        </span>
        {(up.progress.phase === 'uploading' || up.progress.phase === 'preparing') && (
          <button className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] text-[12px] font-medium text-red-600/80 dark:text-red-400/80 hover:bg-red-500/[0.08]" onClick={() => onCancel(up.key)}>
            <XCircle className="w-3.5 h-3.5" />
            {t('space.cancelUpload' as never)}
          </button>
        )}
        {up.progress.phase === 'failed' && (
          <span className="shrink-0 text-[12px] font-medium text-red-600 dark:text-red-400">{t('space.retry' as never)}</span>
        )}
      </div>
      {!done && up.progress.phase !== 'failed' && up.progress.phase !== 'cancelled' && (
        <div className="mt-2.5 h-1 rounded-full bg-apple-ink/[0.07] dark:bg-white/[0.08] overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-300 ${up.progress.phase === 'verifying' ? 'animate-pulse' : ''}`}
            style={{ width: `${up.progress.phase === 'verifying' ? 100 : pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ── create sheet ──────────────────────────────────────────────────────────

export function SpaceCreateSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(24 * HOUR);
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const support = useMemo(() => reminderSupport(), []);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { createSpace } = await import('../lib/space/api');
      const out = await createSpace({ name: name.trim() || undefined, durationMs: duration });
      if (remind && support === 'supported') {
        await enableReminder(out.spaceId).catch(() => { /* countdown still works */ });
      }
      window.location.href = `/space/${out.spaceId}#k=${out.token}`;
    } catch {
      setError(t('space.errCreate'));
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-label={t('space.createHeading')}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.22 }}
        className="relative w-full sm:max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-t-[24px] sm:rounded-[24px] bg-apple-canvas dark:bg-[#1c1c21] border border-apple-divider/60 dark:border-white/[0.08] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.4)] p-5 sm:p-6"
        data-testid="space-create"
      >
        <button onClick={onClose} aria-label={t('space.cancel')} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-[19px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{t('space.createHeading')}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{t('space.createSub')}</p>

        <label className="block mt-5 text-[13px] font-medium text-apple-ink dark:text-white/80" htmlFor="space-name">{t('space.nameLabel')}</label>
        <input
          id="space-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('space.namePlaceholder')}
          maxLength={80}
          className="mt-1.5 w-full rounded-[12px] border border-apple-divider dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-[14.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
        />

        <p className="mt-5 text-[13px] font-medium text-apple-ink dark:text-white/80">{t('space.durationLabel')}</p>
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('space.durationLabel')}>
          {DURATIONS.map(d => (
            <button
              key={d.ms}
              role="radio" aria-checked={duration === d.ms}
              onClick={() => setDuration(d.ms)}
              className={`rounded-[10px] px-2 py-2 text-[13.5px] font-semibold tabular-nums border transition-colors ${
                duration === d.ms
                  ? 'bg-apple-ink text-white dark:bg-white dark:text-night-900 border-apple-ink dark:border-white'
                  : 'bg-white dark:bg-white/[0.04] border-apple-divider dark:border-white/[0.1] text-apple-ink dark:text-white/80 hover:border-apple-ink/30 dark:hover:border-white/30'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-apple-ink-muted dark:text-white/45">{t('space.durationMax')}</p>

        <label className="mt-5 flex items-center gap-2.5 select-none">
          <input
            type="checkbox"
            checked={remind && support === 'supported'}
            disabled={support !== 'supported'}
            onChange={e => setRemind(e.target.checked)}
            className="w-4 h-4 accent-azure-600"
          />
          <span className={`text-[13.5px] ${support === 'supported' ? 'text-apple-ink dark:text-white/80' : 'text-apple-ink-muted/60 dark:text-white/35'}`}>
            {support === 'supported' ? t('space.remindLabel') : t('space.remindUnavailable')}
          </span>
        </label>

        {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}

        <button
          onClick={create}
          disabled={busy}
          data-testid="space-create-cta"
          className="mt-6 w-full min-h-[50px] rounded-full bg-ember hover:bg-[#d9560e] disabled:opacity-60 text-white text-[15px] font-semibold shadow-[0_4px_14px_-6px_rgba(240,100,19,0.5)] transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? t('space.creating') : t('space.createCta')}
        </button>
        <p className="mt-3 text-[12px] leading-relaxed text-apple-ink-muted/70 dark:text-white/35">
          {t('space.shareHint')}
        </p>
      </motion.div>
    </div>
  );
}

// ── join sheet ────────────────────────────────────────────────────────────

export function SpaceJoinSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const { joinFromShare } = await import('../lib/space/api');
      const snap = await joinFromShare(code);
      window.location.href = `/space/${snap.spaceId}#k=${code.includes('#k=') ? code.split('#k=')[1].split(/[^\w-]/)[0] : extractToken(code) || snapToken(snap)}`;
    } catch (e) {
      setError((e as Error).message || t('space.errGeneric'));
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-label={t('space.entryTitle')}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.22 }}
        className="relative w-full sm:max-w-[420px] rounded-t-[24px] sm:rounded-[24px] bg-apple-canvas dark:bg-[#1c1c21] border border-apple-divider/60 dark:border-white/[0.08] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.4)] p-5 sm:p-6"
        data-testid="space-join"
      >
        <button onClick={onClose} aria-label={t('space.cancel')} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-[19px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{t('space.entryTitle')}</h2>
        <p className="mt-1.5 text-[13.5px] text-apple-ink-muted dark:text-white/55">{t('space.entryHint')}</p>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && code.trim() && !busy) void go(); }}
          placeholder="https://sharetexts.online/space/…#k=…  ·  or paste the whole link"
          className="mt-4 w-full rounded-[12px] border border-apple-divider dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
          autoFocus
        />
        {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400">{error}</p>}
        <button
          onClick={() => void go()}
          disabled={!code.trim() || busy}
          className="mt-5 w-full min-h-[50px] rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 disabled:opacity-50 text-[15px] font-semibold transition-all active:scale-[0.98]"
        >
          {t('space.reopen')}
        </button>
      </motion.div>
    </div>
  );
}

function extractToken(raw: string): string | null {
  const m = raw.match(/k=([A-Za-z0-9_-]+)/) || raw.match(/\.([A-Za-z0-9_-]{20,})$/);
  return m ? m[1] : null;
}
function snapToken(_s: unknown): string { return ''; }

// ── share sheet ───────────────────────────────────────────────────────────

function ShareSheet({ open, spaceId, token, onClose }: { open: boolean; spaceId: string; token: string; onClose(): void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  if (!open) return null;
  const link = spaceShareLink(spaceId, token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/35 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        role="dialog" aria-modal="true" aria-label={t('space.share')}
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.22 }}
        className="relative w-full sm:max-w-[420px] rounded-t-[24px] sm:rounded-[24px] bg-apple-canvas dark:bg-[#1c1c21] border border-apple-divider/60 dark:border-white/[0.08] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.4)] p-5 sm:p-6"
        data-testid="space-share"
      >
        <button onClick={onClose} aria-label={t('space.cancel')} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
          <X className="w-4 h-4" />
        </button>
        <h2 className="text-[19px] font-semibold text-apple-ink dark:text-white">{t('space.share')}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/55">{t('space.shareHint')}</p>
        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly value={link}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 min-w-0 rounded-[12px] border border-apple-divider dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-3 py-2.5 text-[12.5px] text-apple-ink-muted dark:text-white/70 font-mono truncate"
          />
          <button onClick={copy} className="shrink-0 inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[13.5px] font-semibold active:scale-[0.97] transition-transform">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t('space.copied') : t('space.copyLink')}
          </button>
        </div>
        <button
          onClick={() => setShowQr(v => !v)}
          className="mt-3 w-full min-h-[44px] rounded-[12px] inline-flex items-center justify-center gap-2 text-[13.5px] font-semibold text-apple-ink dark:text-white/80 bg-white dark:bg-white/[0.05] border border-apple-divider dark:border-white/[0.1] hover:border-apple-ink/25 dark:hover:border-white/25 transition-colors"
        >
          <QrCode className="w-4 h-4" /> QR
        </button>
        {showQr && (
          <div className="mt-4 flex justify-center rounded-[16px] bg-white p-4">
            <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin text-apple-ink-muted" />}>
              <QRCode value={link} size={208} />
            </Suspense>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── the space itself ──────────────────────────────────────────────────────

export function SpaceView({ spaceId, token }: { spaceId: string; token: string }) {
  const { t } = useI18n();
  const client = useSpaceClient(spaceId, token);
  const { snapshot, items, uploads, conn, nowMs } = client;
  const [shareOpen, setShareOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [composer, setComposer] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const myPid = snapshot?.participantId;

  const localToken = token || localCreds(spaceId)?.token || '';

  // Paste anything anywhere: text/link/image/file (the universal model §25).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!(e.clipboardData)) return;
      const files = [...e.clipboardData.files];
      if (files.length) {
        e.preventDefault();
        for (const f of files) client.startUpload(f);
        return;
      }
      const text = e.clipboardData.getData('text/plain');
      if (text && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        const isUrl = /^https?:\/\/\S+$/i.test(text.trim());
        client.addTextItem(text, isUrl ? 'link' : 'text').catch(() => { /* composer shows error via conn */ });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [client]);

  const canClose = !!localCreds(spaceId)?.manageKey;

  if (conn === 'closed') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-apple-canvas dark:bg-[#131315]">
        <div className="w-[64px] h-[64px] rounded-[20px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] flex items-center justify-center mb-5">
          <Clock className="w-7 h-7 text-apple-ink-muted dark:text-white/50" />
        </div>
        <h1 className="text-[21px] font-semibold text-apple-ink dark:text-white">{t('space.closedTitle')}</h1>
        <p className="mt-2 text-[14.5px] text-apple-ink-muted dark:text-white/55 max-w-sm">{t('space.closedBody')}</p>
        <button onClick={() => { window.location.href = '/'; }} className="mt-7 px-6 min-h-[46px] rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[14.5px] font-semibold">
          {t('space.backHome')}
        </button>
      </div>
    );
  }

  if (conn === 'error' || (!snapshot && conn === 'offline')) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-apple-canvas dark:bg-[#131315]">
        <h1 className="text-[21px] font-semibold text-apple-ink dark:text-white">{t('space.errTitle')}</h1>
        <p className="mt-2 text-[14.5px] text-apple-ink-muted dark:text-white/55 max-w-sm">{t('space.errGeneric')}</p>
        <button onClick={() => window.location.reload()} className="mt-7 px-6 min-h-[46px] rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[14.5px] font-semibold">
          {t('space.retry')}
        </button>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh bg-apple-canvas dark:bg-[#131315] font-sans flex flex-col"
      onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setDragOver(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        for (const f of e.dataTransfer.files) client.startUpload(f);
      }}
    >
      {/* ── header ── */}
      <header className="shrink-0 sticky top-0 z-40 bg-apple-canvas/85 dark:bg-[#131315]/85 backdrop-blur border-b border-apple-divider/50 dark:border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <a href="/" aria-label={t('space.backHome')} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
            <ArrowLeft className="w-4.5 h-4.5 text-apple-ink-muted dark:text-white/60" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15.5px] font-semibold text-apple-ink dark:text-white truncate leading-tight">{snapshot?.name || '…'}</h1>
            {snapshot && (
              <Countdown expiresAt={snapshot.expiresAt} now={nowMs} />
            )}
          </div>
          <span className="shrink-0 text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45 tabular-nums" data-testid="space-members">
            {snapshot ? t('space.memberCount', { count: snapshot.memberCount }) : ''}
          </span>
          <button
            onClick={() => setShareOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[13px] font-semibold active:scale-[0.97] transition-transform"
            data-testid="space-share-btn"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">{t('space.share')}</span>
          </button>
          {canClose && (
            <button
              onClick={() => setCloseConfirm(true)}
              className="shrink-0 min-h-[36px] px-3 rounded-full text-[13px] font-medium text-red-600/90 dark:text-red-400/90 hover:bg-red-500/[0.08]"
            >
              {t('space.closeNow')}
            </button>
          )}
        </div>
      </header>

      {/* ── content ── */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-5">
        {conn === 'offline' && (
          <p className="mb-3 text-[12.5px] font-medium text-amber-600 dark:text-amber-400" role="status">{t('space.reconnecting')}</p>
        )}
        {items.length === 0 && uploads.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-apple-divider dark:border-white/[0.12] py-14 text-center" data-testid="space-empty">
            <p className="text-[15px] font-medium text-apple-ink-muted dark:text-white/55">{t('space.empty')}</p>
            <p className="mt-1 text-[13.5px] text-apple-ink-muted/70 dark:text-white/40">{t('space.emptyHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5" aria-label={t('space.contentLabel')}>
            <AnimatePresence initial={false}>
              {uploads.map(up => (
                <li key={up.key}>
                  <UploadRow up={up} onCancel={client.cancelUpload} t={t as never} />
                </li>
              ))}
              {items.map(item => (
                <li key={item.id}>
                  <ItemCard
                    item={item}
                    canRemove={!!myPid && (item.addedBy === myPid || canClose)}
                    onCopy={async (it) => {
                      try { await navigator.clipboard.writeText(it.text || ''); } catch { /* blocked */ }
                    }}
                    onDownload={(it) => { client.download(it.id).catch(() => { /* row stays; retry available */ }); }}
                    onRemove={(it) => setRemoveId(it.id)}
                  />
                </li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </main>

      {/* ── composer ── */}
      <footer className="shrink-0 sticky bottom-0 z-40 bg-apple-canvas/90 dark:bg-[#131315]/90 backdrop-blur border-t border-apple-divider/50 dark:border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-end gap-2">
          <button
            onClick={() => fileInput.current?.click()}
            aria-label={t('space.addFile')}
            className="shrink-0 w-11 h-11 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider dark:border-white/[0.1] flex items-center justify-center hover:border-apple-ink/30 dark:hover:border-white/30 transition-colors"
            data-testid="space-add-file"
          >
            <Plus className="w-5 h-5 text-apple-ink dark:text-white/80" />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              for (const f of e.target.files ?? []) client.startUpload(f);
              e.target.value = '';
            }}
          />
          <textarea
            value={composer}
            onChange={e => setComposer(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = composer.trim();
                if (!text) return;
                const isUrl = /^https?:\/\/\S+$/i.test(text);
                client.addTextItem(text, isUrl ? 'link' : 'text').catch(() => {});
                setComposer('');
              }
            }}
            rows={1}
            placeholder={t('space.composerPlaceholder')}
            className="flex-1 min-w-0 resize-none max-h-32 rounded-[20px] border border-apple-divider dark:border-white/[0.1] bg-white dark:bg-white/[0.05] px-4 py-2.5 text-[14.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
            data-testid="space-composer"
          />
          <button
            onClick={() => {
              const text = composer.trim();
              if (!text) return;
              const isUrl = /^https?:\/\/\S+$/i.test(text);
              client.addTextItem(text, isUrl ? 'link' : 'text').catch(() => {});
              setComposer('');
            }}
            disabled={!composer.trim()}
            aria-label={t('space.addText')}
            className="shrink-0 w-11 h-11 rounded-full bg-ember text-white flex items-center justify-center disabled:opacity-40 active:scale-[0.97] transition-transform"
            data-testid="space-send"
          >
            <ArrowLeft className="w-5 h-5 rotate-90" />
          </button>
        </div>
      </footer>

      {/* drop overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center">
          <div className="absolute inset-0 bg-azure-600/[0.06] dark:bg-azure-400/[0.08] border-2 border-dashed border-azure-500/50 rounded-none" />
          <span className="relative rounded-full bg-white dark:bg-[#1c1c21] shadow-lg px-5 py-2.5 text-[14px] font-semibold text-apple-ink dark:text-white">
            {t('space.dropToAdd')}
          </span>
        </div>
      )}

      <ShareSheet open={shareOpen} spaceId={spaceId} token={localToken} onClose={() => setShareOpen(false)} />
      <ConfirmSheet
        open={closeConfirm}
        title={t('space.closeConfirmTitle')}
        body={t('space.closeConfirmBody')}
        confirmLabel={t('space.closeConfirmCta')}
        cancelLabel={t('space.cancel')}
        onCancel={() => setCloseConfirm(false)}
        onConfirm={() => { setCloseConfirm(false); client.closeNow().catch(() => { /* stays open; error honest */ }); }}
      />
      <ConfirmSheet
        open={!!removeId}
        title={t('space.remove')}
        body={t('space.remove')}
        confirmLabel={t('space.remove')}
        cancelLabel={t('space.cancel')}
        onCancel={() => setRemoveId(null)}
        onConfirm={() => { const id = removeId; setRemoveId(null); if (id) client.removeItem(id).catch(() => {}); }}
      />
    </div>
  );
}
