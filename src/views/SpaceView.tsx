/**
 * SpaceView — the Temporary Space UI (F14).
 *
 * Feels like a temporary shared shelf, not a Drive clone or chat app:
 *   TOP: name · countdown · device count · share/close actions
 *   MAIN: content (text/link/file cards, newest first)
 *   ADD: one composer — type, paste, choose, drop
 *
 * Copy follows §93: human, calm, honest. Server state is authoritative —
 * the view only mirrors what useSpaceClient reports. Every action that CAN
 * fail tells the user honestly (inline notice), never silently.
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, ArrowUp, Check, Clock, Copy, Download, File as FileIcon, Image as ImageIcon,
  Link2, Pause, Play, Plus, QrCode, Share2, Trash2, UploadCloud, X, XCircle,
} from 'lucide-react';
import { SpinLoader } from '../components/SpinLoader';
import { useI18n } from '../lib/i18n';
import { TactileButton } from '../components/TactileButton';
import type { MsgKey } from '../lib/messages/types';
import { OverlaySheet } from '../components/OverlaySheet';
import { ShareMenu } from '../components/ShareMenu';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { useSpaceClient, type LocalUpload } from '../lib/space/useSpaceClient';
import { spaceShareLink, localCreds, joinSpace, parseSpaceShare, SpaceApiError } from '../lib/space/api';
import type { SpaceItem } from '../lib/space/types';
import { closingTime, remainingShort, urgencyTier } from '../lib/space/time';
import { isRunningOut } from '../lib/space/lifetime';
import { reminderSupport, enableReminder } from '../lib/space/reminders';

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
void humanDuration;

function isUrlLike(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

// ── small atoms ───────────────────────────────────────────────────────────

function Countdown({ expiresAt, now, createdAt }: { expiresAt: number; now: number; createdAt?: number }) {
  const { t } = useI18n();
  const left = expiresAt - now;
  const tier = urgencyTier(left);
  // Honest urgency: real elapsed share of the promised lifetime (or the last
  // hour) — never a decorative alarm while the shelf is barely used.
  const runningOut = isRunningOut(createdAt ?? expiresAt - 24 * 3_600_000, expiresAt, now);
  const color =
    tier === 'imminent' ? 'text-red-600 dark:text-red-400'
    : tier === 'soon' && runningOut ? 'text-amber-600 dark:text-amber-400'
    : 'text-apple-ink-muted dark:text-white/50';
  if (left <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium tabular-nums ${color}`}>
        <Clock className="w-3.5 h-3.5" />
        {t('space.closesIn', { time: remainingShort(left) })}
        <span className="hidden sm:inline text-apple-ink-muted/60 dark:text-white/35">· {closingTime(expiresAt)}</span>
      </span>
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
  item, spaceId, mine, canRemove, onCopy, onDownload, onRemove,
}: {
  item: SpaceItem;
  spaceId: string;
  mine: boolean;
  canRemove: boolean;
  onCopy(item: SpaceItem): void;
  onDownload(item: SpaceItem): void;
  onRemove(item: SpaceItem): void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isImage = item.kind === 'file' && PREVIEWABLE.test(item.mime);
  // 'loading' → shimmer in the preview slot; 'failed' → no preview block at
  // all (§21 — a failed preview is NOT an error, the file row still works).
  const [preview, setPreview] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [src, setSrc] = useState<string | null>(null);

  // Previews load lazily and only for safe image types, via the same
  // authorized fetch downloads use — the blob URL never touches our origin
  // as an executable-content URL (§19).
  useEffect(() => {
    if (!isImage) return;
    let dead = false;
    let url: string | null = null;
    import('../lib/space/api')
      .then(({ fetchItemBlobUrl }) => fetchItemBlobUrl(spaceId, item))
      .then((blobUrl) => {
        if (dead) { URL.revokeObjectURL(blobUrl); return; }
        url = blobUrl;
        setSrc(blobUrl);
        setPreview('ready');
      })
      .catch(() => { if (!dead) setPreview('failed'); });
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
    // item.id/mime/size are stable per item; re-fetch only on those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImage, spaceId, item.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="group relative rounded-[16px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-card dark:shadow-none overflow-hidden"
      data-testid="space-item"
      data-kind={item.kind}
    >
      {isImage && preview !== 'failed' && (
        <button
          type="button"
          className="block w-full cursor-zoom-in bg-apple-parchment/60 dark:bg-white/[0.04]"
          onClick={() => { if (src) window.open(src, '_blank', 'noopener'); }}
          aria-label={item.name || t('space.download')}
          disabled={!src}
        >
          {preview === 'ready' && src ? (
            <img
              src={src}
              alt={item.name || ''}
              draggable={false}
              className="w-full max-h-72 object-cover"
              loading="lazy"
            />
          ) : (
            <span className="relative flex items-center justify-center h-44 overflow-hidden">
              <span className="st-skeleton w-full h-full absolute inset-0" aria-hidden />
              <ImageIcon className="w-6 h-6 text-apple-ink-muted/40 dark:text-white/25 relative" aria-hidden />
            </span>
          )}
        </button>
      )}
      <div className="p-3.5">
        {item.kind === 'text' && (
          <p className="st-body text-apple-ink dark:text-white/90 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">{item.text}</p>
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
              {isImage && preview !== 'failed'
                ? <ImageIcon className="w-5 h-5 text-apple-ink-muted dark:text-white/55" />
                : <FileIcon className="w-5 h-5 text-apple-ink-muted dark:text-white/55" />}
            </span>
            <span className="min-w-0">
              <span className="st-label block text-[14px] text-apple-ink dark:text-white/90 truncate">{item.name || 'file'}</span>
              <span className="st-meta block text-apple-ink-muted dark:text-white/50">{fmtSize(item.size)}{PREVIEWABLE.test(item.mime) ? '' : ` · ${t('space.downloadOnly')}`}</span>
            </span>
          </div>
        )}
        <div className="mt-2.5 flex items-center gap-2.5 text-[12px] text-apple-ink-muted/80 dark:text-white/40">
          <span className="truncate">{mine ? t('space.addedByYou') : t('space.addedBy', { name: item.addedByName })}</span>
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

type TFunc = (k: MsgKey, p?: Record<string, string | number>) => string;

function UploadRow({
  up, onCancel, onPause, onResume, onRetry, onDismiss, t,
}: {
  up: LocalUpload;
  onCancel(key: string): void;
  onPause(key: string): void;
  onResume(key: string): void;
  onRetry(key: string): void;
  onDismiss(key: string): void;
  t: TFunc;
}) {
  const pct = up.progress.size > 0 ? Math.min(100, Math.round((up.progress.sent / up.progress.size) * 100)) : 0;
  const phase = up.progress.phase;
  const label =
    phase === 'preparing' ? t('space.upPreparing') :
    phase === 'uploading' ? t('space.upUploading') :
    phase === 'verifying' ? t('space.upVerifying') :
    phase === 'paused' ? t('space.upPaused') :
    phase === 'failed' ? t('space.upFailed') :
    phase === 'cancelled' ? t('space.upCancelled') :
    t('space.upUploading');
  // Honest percent in every byte-counted phase; "preparing" shows digest
  // read progress when it's still reading the file.
  const pctText =
    phase === 'preparing'
      ? (up.progress.prepare ?? 0) < 1 ? ` · ${Math.round((up.progress.prepare ?? 0) * 100)}%` : ''
      : (phase === 'uploading' || phase === 'paused') ? ` · ${pct}%`
      : '';
  const done = phase === 'ready';
  const failed = phase === 'failed';
  const cancelled = phase === 'cancelled';
  const active = phase === 'uploading' || phase === 'preparing';

  return (
    <div className="rounded-[16px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] shadow-card dark:shadow-none p-3.5" data-testid="space-upload" data-phase={phase}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-10 h-10 rounded-[12px] bg-apple-parchment dark:bg-white/[0.06] flex items-center justify-center">
          <UploadCloud className={`w-5 h-5 ${done ? 'text-emerald-600 dark:text-emerald-400' : failed || cancelled ? 'text-red-500' : 'text-apple-ink-muted dark:text-white/55'}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-apple-ink dark:text-white/90 truncate">{up.name}</span>
          <span className="block text-[12.5px] text-apple-ink-muted dark:text-white/50" aria-live="polite">
            {label}{pctText}
          </span>
          {failed && up.progress.error && (
            <span className="block text-[11.5px] text-red-600/80 dark:text-red-400/80 truncate">{up.progress.error}</span>
          )}
        </span>
        {phase === 'paused' && (
          <button
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] text-[12px] font-medium text-apple-ink dark:text-white/80 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            onClick={() => onResume(up.key)}
            data-testid="space-upload-resume"
          >
            <Play className="w-3.5 h-3.5" />
            {t('space.resume')}
          </button>
        )}
        {active && (
          <button
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] text-[12px] font-medium text-apple-ink-muted dark:text-white/60 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            onClick={() => onPause(up.key)}
            data-testid="space-upload-pause"
          >
            <Pause className="w-3.5 h-3.5" />
            {t('space.pause')}
          </button>
        )}
        {(active || phase === 'paused') && (
          <button
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] text-[12px] font-medium text-red-600/80 dark:text-red-400/80 hover:bg-red-500/[0.08]"
            onClick={() => onCancel(up.key)}
          >
            <XCircle className="w-3.5 h-3.5" />
            {t('space.cancelUpload')}
          </button>
        )}
        {failed && (
          <>
            <button
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 min-h-[28px] text-[12px] font-semibold text-azure-600 dark:text-azure-400 hover:bg-azure-500/[0.08]"
              onClick={() => onRetry(up.key)}
              data-testid="space-upload-retry"
            >
              {t('space.retry')}
            </button>
            <button
              className="shrink-0 rounded-full p-1.5 min-h-[28px] text-apple-ink-muted/60 dark:text-white/40 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
              onClick={() => onDismiss(up.key)}
              aria-label={t('space.cancelUpload')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
        {cancelled && (
          <button
            className="shrink-0 rounded-full p-1.5 min-h-[28px] text-apple-ink-muted/60 dark:text-white/40 hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
            onClick={() => onDismiss(up.key)}
            aria-label={t('space.cancelUpload')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {!done && !failed && !cancelled && (
        <div className="mt-2.5 h-1 rounded-full bg-apple-ink/[0.07] dark:bg-white/[0.08] overflow-hidden">
          <div className={`h-full rounded-full transition-[width] duration-300 ${phase === 'verifying' ? 'animate-pulse' : ''}`}
            style={{ width: `${phase === 'verifying' ? 100 : phase === 'preparing' ? Math.round((up.progress.prepare ?? 0) * 100) : pct}%` }} />
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
    if (busy) return;
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

  return (
    <OverlaySheet open={open} onClose={onClose} label={t('space.createHeading')} maxWidth={460} testId="space-create">
      <h2 className="text-[16.5px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{t('space.createHeading')}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-apple-ink-muted dark:text-white/55">{t('space.createSub')}</p>

        <label className="block mt-5 text-[13px] font-medium text-apple-ink dark:text-white/80" htmlFor="space-name">{t('space.nameLabel')}</label>
        <input
          id="space-name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void create(); } }}
          placeholder={t('space.namePlaceholder')}
          maxLength={80}
          autoFocus
          className="mt-1.5 w-full rounded-[12px] border border-apple-divider dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-[14.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
        />

        <p className="mt-5 text-[13px] font-medium text-apple-ink dark:text-white/80">{t('space.durationLabel')}</p>
        <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('space.durationLabel')}>
          {DURATIONS.map(d => (
            <button
              key={d.ms}
              role="radio" aria-checked={duration === d.ms}
              onClick={() => setDuration(d.ms)}
              className={`rounded-[12px] px-1.5 py-2.5 min-h-[52px] flex flex-col items-center justify-center border transition-colors ${
                duration === d.ms
                  ? 'bg-apple-ink text-white dark:bg-white dark:text-night-900 border-apple-ink dark:border-white'
                  : 'bg-white dark:bg-white/[0.04] border-apple-divider dark:border-white/[0.1] text-apple-ink dark:text-white/80 hover:border-apple-ink/30 dark:hover:border-white/30'
              }`}
            >
              <span className="text-[13.5px] font-semibold tabular-nums leading-none">{d.label}</span>
              {/* "6 hours" is an amount; the CLOCK TIME is the decision. Each
                  option carries when it would actually end (time only inside a
                  day, weekday + time within three, date beyond) — no words to
                  translate, just the honest timestamp. */}
              <span className="mt-1 text-[10px] font-medium tabular-nums leading-none opacity-60 whitespace-nowrap">
                {(() => {
                  const end = new Date(Date.now() + d.ms);
                  if (d.ms <= 24 * HOUR) return end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                  if (d.ms <= 72 * HOUR) return end.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
                  return end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                })()}
              </span>
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

        {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400" role="alert">{error}</p>}

        <TactileButton
          onClick={() => void create()}
          loading={busy}
          variant="primary"
          size="lg"
          className="mt-6 w-full"
          data-testid="space-create-cta"
        >
          {busy ? t('space.creating') : t('space.createCta')}
        </TactileButton>
        <p className="mt-3 text-[12px] leading-relaxed text-apple-ink-muted/70 dark:text-white/35">
          {t('space.shareHint')}
        </p>
    </OverlaySheet>
  );
}

// ── join sheet ────────────────────────────────────────────────────────────

export function SpaceJoinSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One honest error per failure: unparsable link / wrong key / already
  // closed / anything else. No token surgery — parseSpaceShare owns the
  // grammar, and the redirect reuses exactly what was parsed.
  const go = async () => {
    const raw = code.trim();
    if (!raw || busy) return;
    setBusy(true);
    setError(null);
    const parsed = parseSpaceShare(raw);
    if (!parsed) {
      setError(t('space.joinBadLink'));
      setBusy(false);
      return;
    }
    try {
      await joinSpace(parsed.spaceId, parsed.token);
      window.location.href = `/space/${parsed.spaceId}#k=${parsed.token}`;
    } catch (e) {
      if (e instanceof SpaceApiError && e.closed) setError(t('space.joinClosed'));
      else if (e instanceof SpaceApiError && (e.status === 401 || e.status === 403)) setError(t('space.joinRejected'));
      else setError((e as Error)?.message || t('space.errGeneric'));
      setBusy(false);
    }
  };

  return (
    <OverlaySheet open={open} onClose={onClose} label={t('space.joinTitle')} maxWidth={420} testId="space-join">
      <h2 className="text-[16.5px] font-semibold text-apple-ink dark:text-white tracking-[-0.01em]">{t('space.joinTitle')}</h2>
        <p className="mt-1.5 text-[13.5px] text-apple-ink-muted dark:text-white/55">{t('space.entryHint')}</p>
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && code.trim() && !busy) void go(); }}
          placeholder={t('space.joinPlaceholder')}
          spellCheck={false}
          autoCapitalize="off"
          className="mt-4 w-full rounded-[12px] border border-apple-divider dark:border-white/[0.12] bg-white dark:bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
          autoFocus
        />
        {error && <p className="mt-3 text-[13px] text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <TactileButton
          onClick={() => void go()}
          disabled={!code.trim()}
          loading={busy}
          variant="primary"
          size="lg"
          className="mt-5 w-full"
          data-testid="space-join-cta"
        >
          {t('space.reopen')}
        </TactileButton>
    </OverlaySheet>
  );
}

// ── share sheet ───────────────────────────────────────────────────────────

function ShareSheet({ open, spaceId, token, onClose }: { open: boolean; spaceId: string; token: string; onClose(): void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const link = spaceShareLink(spaceId, token);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked */ }
  };
  return (
    <OverlaySheet open={open} onClose={onClose} label={t('space.share')} maxWidth={420} testId="space-share">
      <h2 className="text-[16.5px] font-semibold text-apple-ink dark:text-white">{t('space.share')}</h2>
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
            <Suspense fallback={<span className="w-[208px] h-[208px] flex items-center justify-center"><SpinLoader size={24} className="text-apple-ink-muted" /></span>}>
              <QRCode value={link} size={208} />
            </Suspense>
          </div>
        )}
    </OverlaySheet>
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
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myPid = snapshot?.participantId;

  const localToken = token || localCreds(spaceId)?.token || '';

  // One honest inline error channel: failures surface here instead of
  // disappearing into silent catches.
  const showNotice = (msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  };
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // Composer grows with its content (single line → a few), capped so the
  // header never scrolls away.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [composer]);

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
        client.addTextItem(text, isUrlLike(text) ? 'link' : 'text')
          .catch(() => showNotice(t('space.errAdd')));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [client, t]);

  const canClose = !!localCreds(spaceId)?.manageKey;

  const submitText = () => {
    const text = composer.trim();
    if (!text) return;
    setComposer('');
    client.addTextItem(text, isUrlLike(text) ? 'link' : 'text')
      .catch(() => { setComposer(text); showNotice(t('space.errAdd')); });
  };

  const shareSpace = async () => {
    const link = spaceShareLink(spaceId, localToken);
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try { await navigator.share({ text: link }); return; } catch { /* cancelled → try clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(link);
      showNotice(t('space.copied'));
    } catch {
      showNotice(t('composer.copyFailed'));
    }
  };

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

  const loadingFirst = !snapshot && conn === 'connecting';

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
        {/* Lifetime hairline — time actually spent of the promised window.
            Renders only once the shelf is genuinely running out (≥60% spent
            or the last hour); calm metadata before that, no fake urgency. */}
        {snapshot && isRunningOut(snapshot.createdAt ?? snapshot.expiresAt - 24 * 3_600_000, snapshot.expiresAt, nowMs) && (
          <div
            aria-hidden
            className="absolute bottom-0 left-0 h-[2px] bg-ember/70 transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.min(100, Math.round(((nowMs - (snapshot.createdAt ?? snapshot.expiresAt - 24 * 3_600_000)) / Math.max(1, snapshot.expiresAt - (snapshot.createdAt ?? snapshot.expiresAt - 24 * 3_600_000))) * 100))}%` }}
          />
        )}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <a href="/" aria-label={t('space.backHome')} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center hover:bg-black/[0.05] dark:hover:bg-white/[0.08]">
            <ArrowLeft className="w-[18px] h-[18px] text-apple-ink-muted dark:text-white/60" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15.5px] font-semibold text-apple-ink dark:text-white truncate leading-tight">{snapshot?.name || '…'}</h1>
            {snapshot && (
              <Countdown expiresAt={snapshot.expiresAt} now={nowMs} createdAt={snapshot.createdAt} />
            )}
          </div>
          {snapshot && (
            <span className="shrink-0 text-[12.5px] font-medium text-apple-ink-muted dark:text-white/45 tabular-nums" data-testid="space-members">
              {snapshot.memberCount === 1
                ? t('space.memberCountOne')
                : t('space.memberCount', { count: snapshot.memberCount })}
            </span>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3.5 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[13px] font-semibold active:scale-[0.97] transition-transform"
            data-testid="space-share-btn"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden min-[400px]:inline">{t('space.share')}</span>
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
        <AnimatePresence>
          {notice && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3 text-[13px] font-medium text-red-600 dark:text-red-400"
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
        {loadingFirst ? (
          /* One loading language: the same skeleton grammar the QR overlays
             use — shape first, words never. */
          <div className="space-y-2.5" aria-label={t('space.contentLabel')} data-testid="space-loading">
            {[64, 44, 52].map((h, i) => (
              <div key={i} className="rounded-[16px] bg-white dark:bg-[#1c1c21] border border-apple-divider/70 dark:border-white/[0.08] p-3.5">
                <span className="st-skeleton block rounded-[8px]" style={{ height: h / 2 + 8 }} />
                <span className="st-skeleton mt-2 block h-2.5 w-1/3 rounded-full" />
              </div>
            ))}
          </div>
        ) : items.length === 0 && uploads.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-apple-divider dark:border-white/[0.12] py-14 text-center" data-testid="space-empty">
            <p className="text-[15px] font-medium text-apple-ink-muted dark:text-white/55">{t('space.empty')}</p>
            <p className="mt-1 text-[13.5px] text-apple-ink-muted/70 dark:text-white/40">{t('space.emptyHint')}</p>
          </div>
        ) : (
          <ul className="space-y-2.5" aria-label={t('space.contentLabel')}>
            <AnimatePresence initial={false}>
              {uploads.map(up => (
                <li key={up.key}>
                  <UploadRow
                    up={up}
                    t={t}
                    onCancel={client.cancelUpload}
                    onDismiss={client.dismissUpload}
                    onPause={client.pauseUpload}
                    onResume={client.resumeUpload}
                    onRetry={client.retryUpload}
                  />
                </li>
              ))}
              {items.map(item => (
                <li key={item.id}>
                  <ItemCard
                    item={item}
                    spaceId={spaceId}
                    mine={!!myPid && item.addedBy === myPid}
                    canRemove={!!myPid && (item.addedBy === myPid || canClose)}
                    onCopy={async (it) => {
                      try { await navigator.clipboard.writeText(it.text || ''); } catch { showNotice(t('composer.copyFailed')); }
                    }}
                    onDownload={(it) => { client.download(it.id).catch(() => showNotice(t('space.errDownload'))); }}
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
            ref={composerRef}
            value={composer}
            onChange={e => setComposer(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submitText();
              }
            }}
            rows={1}
            placeholder={t('space.composerPlaceholder')}
            className="flex-1 min-w-0 min-h-[44px] resize-none max-h-32 rounded-[20px] border border-apple-divider dark:border-white/[0.1] bg-white dark:bg-white/[0.05] px-4 py-2.5 text-[14.5px] text-apple-ink dark:text-white placeholder:text-apple-ink-muted/50 dark:placeholder:text-white/30 outline-none focus:ring-2 focus:ring-azure-500/40"
            data-testid="space-composer"
          />
          {/* Composer share is a convenience duplicate of the header share —
              on narrow phones it yields so the textarea keeps its width.
              It opens the share menu rather than guessing: Copy link, the
              native sheet, or the full invite/QR sheet. */}
          <ShareMenu
            className="hidden min-[430px]:block shrink-0"
            url={spaceShareLink(spaceId, localToken)}
            onShowQR={() => setShareOpen(true)}
            testId="space-share-row"
            ariaLabel={t('space.share')}
          />
          <button
            onClick={submitText}
            disabled={!composer.trim()}
            aria-label={t('space.addText')}
            className="shrink-0 w-11 h-11 rounded-full bg-ember text-white flex items-center justify-center disabled:opacity-40 active:scale-[0.97] transition-transform"
            data-testid="space-send"
          >
            <ArrowUp className="w-5 h-5" strokeWidth={2.4} />
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
        onConfirm={() => { setCloseConfirm(false); client.closeNow().catch(() => showNotice(t('space.errClose'))); }}
      />
      <ConfirmSheet
        open={!!removeId}
        title={t('space.removeConfirmTitle')}
        body={t('space.removeConfirmBody')}
        confirmLabel={t('space.removeConfirmCta')}
        cancelLabel={t('space.cancel')}
        onCancel={() => setRemoveId(null)}
        onConfirm={() => {
          const id = removeId;
          setRemoveId(null);
          if (id) client.removeItem(id).catch(() => showNotice(t('space.errRemove')));
        }}
      />
    </div>
  );
}
