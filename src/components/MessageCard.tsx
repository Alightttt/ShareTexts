/**
 * MessageCard — one transfer bubble in the chat stream: text, image, video,
 * file/audio cards plus the per-card status footer, progress readouts, and
 * the full-screen image viewer.
 *
 * The card owns nothing about the transport: it renders `ChatMessage` state
 * and calls back into SessionContext for retry/cancel/send actions.
 */
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { useSession } from '../lib/SessionContext';
import {
  X, Copy, Check, CheckCheck, Download, Image as ImageIcon, Play,
  RefreshCw, AlertCircle, ChevronDown, ChevronUp, Share2, ShieldCheck,
  Terminal, ZoomIn
} from 'lucide-react';
import { FileTypeIcon } from './FileTypeIcon';
import { cn, formatBytes, sanitizeFilename } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import type { I18nApi } from '../lib/i18n';
import { ChatMessage, Attachment } from '../types';

const LARGE_TEXT_THRESHOLD = 8000; // chars
const LARGE_TEXT_PREVIEW = 1400;

/**
 * Prepare an image blob for clipboard byte-copy. Chromium's ClipboardItem
 * accepts only 'image/png', so PNG passes through untouched and other raster
 * formats (JPEG/WebP/GIF) are re-encoded via canvas. Non-raster images
 * (e.g. SVG) return null — callers fall back to copying the filename.
 */
async function toPngClipboardBlob(blob: Blob): Promise<Blob | null> {
  const mime = (blob.type || '').toLowerCase();
  // Only images (an empty type means the WebRTC-received blob was created
  // without one — still decodable, so let the canvas path handle it).
  if (mime && !mime.startsWith('image/')) return null;
  if (mime === 'image/svg+xml') return null;
  if (mime === 'image/png') return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return null; }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
  } catch { return null; }
}

const timeOf = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Human short format from a MIME type, for the "Original · …" metadata chip. */
function shortFormat(mime?: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF',
    'image/heic': 'HEIC', 'image/heif': 'HEIF', 'image/avif': 'AVIF', 'image/svg+xml': 'SVG',
    'video/mp4': 'MP4', 'video/quicktime': 'MOV', 'video/webm': 'WebM',
    'audio/mpeg': 'MP3', 'audio/mp4': 'M4A', 'audio/wav': 'WAV', 'audio/ogg': 'OGG',
  };
  if (!mime) return '';
  const base = mime.split(';')[0].trim();
  if (map[base]) return map[base];
  const m = base.match(/^\w+\/(.+)$/);
  return m ? m[1].toUpperCase() : base.toUpperCase();
}

/** In-flight byte progress: "1.2 MB of 4.1 MB", falling back to a percent. */
function byteProgress(a: Attachment): string {
  return a.size && a.progress
    ? `${formatBytes(Math.floor(a.size * a.progress))} of ${formatBytes(a.size)}`
    : `${Math.round((a.progress || 0) * 100)}%`;
}

/**
 * The single status readout for a non-complete transfer — one owner for the
 * wording that previously lived twice (the card footer row and the media
 * placeholder), so the two surfaces can never disagree:
 *   failed → why it failed (resend/checksum/generic)
 *   preparing → "Preparing…"
 *   restoring → "Restoring file… NN%" (restores after a reload)
 *   cancelled → "Cancelled"
 *   interrupted → the peer dropped mid-transfer
 *   resuming / sending / receiving → "… 1.2 MB of 4.1 MB"
 */
function transferStatusText(a: Attachment, isMe: boolean, t: I18nApi['t']): string {
  switch (a.status) {
    case 'failed':
      return a.note === 'resend-unavailable'
        ? t('status.failed.resend')
        : a.note === 'checksum-mismatch'
          ? t('status.failed.checksum')
          : t('status.failed.generic');
    case 'preparing': return t('status.preparing');
    case 'restoring': return t('status.restoring', { pct: a.progress ? ` ${Math.round(a.progress * 100)}%` : '' });
    case 'cancelled': return t('status.cancelled');
    case 'interrupted': return t('status.interrupted');
    case 'resuming': return t('status.resuming', { progress: byteProgress(a) });
    case 'sending': return t('status.sending', { progress: byteProgress(a) });
    case 'receiving': return t('status.receiving', { progress: byteProgress(a) });
    default: return isMe ? t('status.sendingShort') : t('status.receivingShort');
  }
}

/** Visual tone per in-flight status, for the placeholder + footer surfaces. */
const STATUS_TONE: Record<string, string> = {
  failed: 'text-status-danger',
  cancelled: 'text-apple-ink-muted',
  interrupted: 'text-apple-ink-muted',
  preparing: 'text-apple-ink-muted animate-pulse',
  restoring: 'text-apple-ink-muted animate-pulse',
  resuming: 'text-apple-blue',
  sending: 'text-apple-ink-muted animate-pulse',
  receiving: 'text-apple-ink-muted animate-pulse',
};

/**
 * Delivery state for MY messages — a true receipt, never guessed:
 *   Sent      — the packet left this device
 *   Delivered — the OTHER device confirmed arrival (encrypted ack)
 *   Seen      — the OTHER device's room is open with it on screen (read ack)
 */
function DeliveryTick({ delivered, seen, onBlue }: { delivered?: boolean; seen?: boolean; onBlue: boolean }) {
  const { t } = useI18n();
  if (seen) {
    return (
      <span className="flex items-center gap-1 text-apple-blue">
        <motion.span
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.55, duration: 0.45 }}
          className="flex"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </motion.span>
        <span className="font-semibold">{t('msg.seen')}</span>
      </span>
    );
  }
  if (delivered) {
    return (
      <span className="flex items-center gap-1 text-status-success">
        {/* The check pops in when the peer's receipt arrives — a tiny
            confirmation that lands, not just a static icon. */}
        <motion.span
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', bounce: 0.55, duration: 0.45 }}
          className="flex"
        >
          <CheckCheck className="w-3.5 h-3.5" />
        </motion.span>
        <span className="font-semibold">{t('msg.delivered')}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-apple-ink-muted">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.5, duration: 0.4 }}
        className="flex"
      >
        <Check className="w-3.5 h-3.5" />
      </motion.span>
      <span className="font-semibold">{t('msg.sent')}</span>
    </span>
  );
}

export interface MessageCardProps {
  msg: ChatMessage;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
}

export const MessageCard: React.FC<MessageCardProps> = ({ msg, isGroupStart = true, isGroupEnd = true }) => {
  const { t } = useI18n();
  const { retryTransfer, retryText, cancelTransfer } = useSession();
  const isMe = msg.sender === 'me';
  const a = msg.attachment;
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Decoded dimensions of the ORIGINAL image bytes (proves nothing was
  // resized) and a decode-failure flag: a received "image" that the browser
  // can't decode (HEIC/HEIF on Chrome, damaged file, …) degrades to the file
  // row with Save promoted — the original is never stranded behind a dead
  // preview box.
  const [imgMeta, setImgMeta] = useState<{ w: number; h: number } | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const isLargeText = msg.text.length > LARGE_TEXT_THRESHOLD;
  const preview = isLargeText && !expanded ? msg.text.slice(0, LARGE_TEXT_PREVIEW) : msg.text;
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // Copy on a received image puts the actual image bytes on the clipboard so
  // pasting into a chat or document works. If byte-copy isn't supported, fall
  // back to the filename — never the raw blob: URL, which is dead outside this page.
  const copyAttachment = async (a: Attachment) => {
    try {
      const blob = await (await fetch(a.url!)).blob();
      // Chromium's ClipboardItem only accepts 'image/png' — hand it PNG
      // directly and convert other raster formats (JPEG/WebP/GIF) via canvas,
      // so Copy works for every received photo, not just PNGs.
      const png = await toPngClipboardBlob(blob);
      const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
      if (png && ClipboardItemCtor && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': png })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      }
    } catch {
      // Byte copy unavailable — fall through to the filename.
    }
    await handleCopy(a.name);
  };
  const handleDownload = (url: string, filename: string) => {
    const safeName = sanitizeFilename(filename);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    link.click();
    document.body.removeChild(link);
  };
  const [shared, setShared] = useState(false);
  // One-click Share: native sheet when the platform supports it (with the
  // actual file bytes attached), otherwise it degrades to a download — the
  // button is never a dead end.
  const handleShare = async () => {
    if (!a?.url) return;
    const name = a.name;
    const mime = a.mimeType || 'application/octet-stream';
    try {
      if (typeof navigator.share === 'function') {
        const blob = await (await fetch(a.url)).blob();
        const file = new File([blob], name, { type: mime || blob.type });
        const canSendFile = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
        if (canSendFile) {
          await navigator.share({ files: [file], title: name });
        } else {
          await navigator.share({ title: 'ShareText', text: name, url: a.url });
        }
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } else {
        handleDownload(a.url, name);
      }
    } catch (e) {
      // AbortError = the user closed the sheet; anything else = the bytes
      // were unavailable, so fall back to a plain download.
      if ((e as Error)?.name !== 'AbortError') handleDownload(a.url, name);
    }
  };
  // Text-only message — a clean bubble with an in-bubble footer.
  // Psychology: messages from me feel "sent" (blue, right-aligned, tight),
  // messages from partner feel "received" (white, left-aligned, warm).
  // Grouping reduces visual noise: consecutive same-sender messages cluster
  // with tighter spacing and softer corners, like a chat thread.
  if (!a) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
        className={cn(
          "flex w-full",
          isMe ? "justify-end" : "justify-start",
          isGroupStart ? "mt-3" : "mt-0.5",
        )}
      >
        <div className={cn(
          "max-w-[85%] sm:max-w-[65%] px-[14px] py-[10px] rounded-[18px]",
          isMe
            // Sent items carry a whisper of the brand so the eye instantly
            // separates what left this device from what arrived.
            ? "bg-[#ece9fa] dark:bg-[#252140] text-apple-ink dark:text-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            : "bg-white dark:bg-[#1a1a22] border border-apple-divider/40 dark:border-white/[0.06] text-apple-ink dark:text-white",
          isMe && isGroupEnd && "rounded-br-[4px]",
          !isMe && isGroupEnd && "rounded-bl-[4px]",
          isMe && !isGroupEnd && "rounded-br-[14px]",
          !isMe && !isGroupEnd && "rounded-bl-[14px]",
        )}>
          <div className="text-[15.5px] whitespace-pre-wrap leading-relaxed break-words">
            {preview}
            {isLargeText && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className={cn("mt-1.5 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
              >
                <ChevronDown className="w-4 h-4" /> {t('msg.showFull')}
              </button>
            )}
            {isLargeText && expanded && (
              <button
                onClick={() => setExpanded(false)}
                className={cn("mt-1.5 flex items-center gap-1 text-[14px] font-semibold active:opacity-70", isMe ? "text-white/90" : "text-apple-blue")}
              >
                <ChevronUp className="w-4 h-4" /> {t('msg.collapse')}
              </button>
            )}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {msg.delivery === 'failed' ? (
              <>
                <span className={cn("text-[12.5px] font-semibold flex items-center gap-1", isMe ? "text-white" : "text-status-danger")}>
                  <AlertCircle className="w-3.5 h-3.5" /> {t('msg.couldNotSend')}
                </span>
                <button
                  onPointerDown={(e) => { e.preventDefault(); void retryText(msg.id); }}
                  className={cn("flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold transition-motion active:scale-95", isMe ? "bg-white/20 text-white" : "bg-apple-parchment dark:bg-apple-tile-2 text-apple-ink dark:text-white")}
                >
                  <RefreshCw className="w-3 h-3" /> {t('action.retry')}
                </button>
              </>
            ) : (
              <>
                <span className="text-[11.5px] font-medium flex items-center gap-1 text-apple-ink-muted">
                  {isMe ? (
                    <DeliveryTick delivered={msg.delivered} seen={msg.seen} onBlue />
                  ) : msg.source === 'push' ? (
                    <span className="font-semibold flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> {t('msg.fromPush')}
                    </span>
                  ) : (
                    <span className="font-semibold">{t('msg.received')}</span>
                  )}
                  {' • '}{timeOf(msg.timestamp)}
                </span>
                <button
                  onPointerDown={() => handleCopy(msg.text)}
                  aria-label={t('msg.copyMessage')}
                  title={t('msg.copy')}
                  className={cn(
                    "flex items-center justify-center min-w-[40px] min-h-[40px] -m-[6px] rounded-full transition-motion active:scale-90",
                    copied
                      ? "text-status-success"
                      : "text-apple-ink-muted hover:text-apple-ink dark:hover:text-white hover:bg-apple-divider/60 dark:hover:bg-apple-tile-3"
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
  // Attachment message — image/video/file card.
  // Defense-in-depth: a received file claiming image/video/audio but carrying
  // an active-content MIME (HTML/SVG/XML/JS) is NEVER rendered inline — it
  // falls through to the file row (icon + name + size + Download). Media
  // elements with blob URLs are already script-safe, but the pass rule is:
  // prefer download over inline for anything that could be active content.
  const unsafePreview = !!a.mimeType && /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i.test(a.mimeType);
  // An image whose bytes failed to decode (HEIC on Chrome, truncated file…)
  // is NOT an inline image anymore: it flips to the file row below.
  const isImage = a.type === 'image' && !unsafePreview && !decodeFailed;
  const isVideo = a.type === 'video' && !unsafePreview;
  const complete = a.status === 'complete' && a.url;
  // "Original" proof chip for decoded images — exact pixels, exact format.
  const fmtShort = isImage || a.type === 'image' ? shortFormat(a.mimeType) : '';
  const dimsTxt = imgMeta && a.type === 'image' && !decodeFailed ? `${imgMeta.w} × ${imgMeta.h}` : '';
  // Restored after a reload with no bytes: own sends keep 'complete' (the
  // other device holds the file — "Sent" is truthful), partner files we
  // received become 'restoring' (re-requested from the peer on reconnect).
  const lost = a.status === 'complete' && !a.url;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
      className={cn(
        "flex w-full",
        isMe ? "justify-end" : "justify-start",
        isGroupStart ? "mt-3" : "mt-0.5",
      )}
    >
      <div className={cn(
        "flex flex-col gap-0 max-w-[85%] sm:max-w-[65%] w-full",
        isMe ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "flex flex-col w-full overflow-hidden rounded-[18px]",
          // Sent bubbles carry the brand tint; received stay neutral — the
          // color tells you whose message it is before you read a word.
          isMe
            ? "bg-[#ece6fb] dark:bg-[#2a2152] border border-azure-600/20 dark:border-azure-400/25 shadow-[0_1px_3px_rgba(139,124,246,0.12)]"
            : "bg-white dark:bg-[#1d1733] border border-apple-divider/40 dark:border-white/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.06)]",
          isMe && isGroupEnd && "rounded-br-[4px]",
          !isMe && isGroupEnd && "rounded-bl-[4px]",
          isMe && !isGroupEnd && "rounded-br-[14px]",
          !isMe && !isGroupEnd && "rounded-bl-[14px]",
        )}>
          {/* Text caption (if any) */}
          {msg.text && (
            <div className="px-4 py-3 text-[15.5px] whitespace-pre-wrap leading-relaxed break-words text-apple-ink dark:text-white">
              {msg.text}
            </div>
          )}
          {/* Image — tap to view full quality */}
          {isImage && !lost && (
            <div className={cn("relative w-full overflow-hidden bg-black/5 dark:bg-white/5", msg.text && "border-t border-white/10 dark:border-apple-tile-3/50")}>
              {complete ? (
                <button
                  type="button"
                  onClick={() => setViewerOpen(true)}
                  className="block w-full cursor-zoom-in group relative"
                  aria-label={`View ${a.name}`}
                >
                  {/* Soft reveal on arrival — the completed photo settles in
                      instead of popping. Rendered from the received original
                      bytes (object-contain, never cropped or stretched). */}
                  <motion.img
                    src={a.url}
                    alt={a.name}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="w-full h-auto object-contain max-h-[60vh] block"
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      if (el.naturalWidth > 0) setImgMeta({ w: el.naturalWidth, h: el.naturalHeight });
                    }}
                    onError={() => setDecodeFailed(true)}
                  />
                  <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/55 text-white text-[12px] font-semibold backdrop-blur opacity-90 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <ZoomIn className="w-3.5 h-3.5" /> View
                  </span>
                </button>
              ) : (
                <div className="w-full aspect-video flex flex-col items-center justify-center text-apple-ink-muted">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <ProgressState attachment={a} isMe={isMe} />
                </div>
              )}
            </div>
          )}
          {/* Video — plays inline */}
          {isVideo && !lost && (
            <div className="relative w-full aspect-video bg-black/90 flex items-center justify-center overflow-hidden">
              {complete ? (
                <motion.video
                  src={a.url}
                  controls
                  preload="metadata"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="text-white/70 flex flex-col items-center">
                  <Play className="w-10 h-10 mb-3 opacity-50" />
                  <ProgressState attachment={a} isMe={isMe} />
                </div>
              )}
            </div>
          )}
          {/* File / Audio — plus active-content MIME (HTML/SVG/XML/JS) and
              restored attachments whose bytes died with the page: all render
              as the file row, never a broken or inline preview. */}
          {(a.type === 'file' || a.type === 'audio' || unsafePreview || lost || (a.type === 'image' && !unsafePreview && decodeFailed)) && (
            <div className="p-4 flex items-center gap-3.5 bg-apple-parchment/50 dark:bg-black/20">
              <FileTypeIcon name={a.name} mimeType={a.mimeType} size={20} />
              <div className="flex flex-col flex-1 truncate min-w-0">
                <span className="text-[14.5px] font-semibold truncate text-apple-ink dark:text-white">{a.name}</span>
                <span className="text-[12.5px] font-medium text-apple-ink-muted">
                  {formatBytes(a.size)}
                  {a.type === 'image' && decodeFailed && (
                    <span className="hidden sm:inline"> · Original file kept — preview not supported by this browser</span>
                  )}
                </span>
              </div>
            </div>
          )}
          {/* Audio playback — plays once the transfer completes */}
          {a.type === 'audio' && complete && (
            <div className="px-4 pb-4 bg-apple-parchment/50 dark:bg-black/20">
              <audio src={a.url} controls className="w-full" preload="metadata" />
            </div>
          )}
          {/* Footer: status info on row 1, actions on row 2 */}
          <div className={cn(
            "px-3 py-2.5 border-t",
            "border-apple-divider/30 dark:border-white/[0.06] bg-apple-canvas/30 dark:bg-black/5"
          )}>
            {/* Row 1: status / time — full width, no competing for space */}
            <div className="min-w-0">
              {a.status === 'complete' ? (
                <span className="text-[11px] font-medium flex items-center gap-1 flex-wrap break-words text-apple-ink-muted">
                  {isMe ? <DeliveryTick delivered={msg.delivered} seen={msg.seen} onBlue /> : msg.source === 'push' ? (
                    <span className="font-semibold flex items-center gap-1"><Terminal className="w-3 h-3" /> Sent from your computer</span>
                  ) : <span className="font-semibold">Received</span>}
                  {a.verified && <span className="flex items-center gap-0.5" title={t('msg.verifiedTitle')}><ShieldCheck className="w-3 h-3" /> {t('msg.verified')}</span>}
                  {/* Original-quality proof: size · exact pixel dimensions ·
                      exact format — read from the bytes that arrived. */}
                  <span className="hidden sm:inline">
                    {' • '}{formatBytes(a.size)}
                    {dimsTxt ? <span title="Exact pixel size — never resized">{' • '}{dimsTxt}</span> : null}
                    {a.type === 'image' && fmtShort && !decodeFailed ? ` • ${fmtShort}` : ''}
                    {' • '}{timeOf(msg.timestamp)}
                  </span>
                  <span className="sm:hidden">
                    {' • '}{formatBytes(a.size)}
                    {dimsTxt ? ` • ${dimsTxt}` : ''}
                  </span>
                </span>
              ) : (
                <span className={cn("text-[12.5px] font-semibold", a.status === 'failed' ? "text-status-danger" : a.status === 'cancelled' || a.status === 'interrupted' ? "text-apple-ink-muted" : "text-apple-blue")}>
                  {transferStatusText(a, isMe, t)}
                </span>
              )}
            </div>
            {/* Row 2: action buttons — separate row, never fights with text */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {complete && (
                <>
                  {a.type === 'image' && (
                    <ActionButton icon={copied ? <Check /> : <Copy />} label={copied ? t('action.copied') : t('action.copy')} active={copied} onClick={() => { void copyAttachment(a); }} onBlue={isMe} testId="transfer-copy" />
                  )}
                  <ActionButton icon={<Share2 />} label={shared ? t('action.shared') : t('action.share')} active={shared} onClick={() => { void handleShare(); }} onBlue={isMe} testId="transfer-share" />
                  <ActionButton icon={saved ? <Check /> : <Download />} label={saved ? t('action.saved') : t('action.save')} active={saved} onClick={() => handleDownload(a.url!, a.name)} primary onBlue={isMe} testId="transfer-download" />
                </>
              )}
              {(a.status === 'preparing' || a.status === 'sending' || a.status === 'receiving' || a.status === 'interrupted' || a.status === 'resuming') && (
                <ActionButton icon={<X />} label={t('action.cancel')} onClick={() => { void cancelTransfer(msg.id); }} onBlue={isMe} testId="cancel-transfer" />
              )}
              {(a.status === 'failed' || (a.status === 'cancelled' && isMe) || (a.status === 'interrupted' && isMe)) && (
                <ActionButton icon={<RefreshCw />} label={t('action.retry')} onClick={() => { void retryTransfer(msg.id); }} onBlue={isMe} testId="retry" />
              )}
            </div>
          </div>
          {/* Progress bar */}
          {a.status !== 'complete' && a.status !== 'draft' && a.status !== 'failed' && a.status !== 'cancelled' && (
            <div className="w-full h-1 overflow-hidden bg-apple-divider dark:bg-apple-tile-3">
              <div className="h-full origin-left transition-transform duration-300 ease-out bg-apple-blue" style={{ transform: `scaleX(${a.progress || 0})` }} />
            </div>
          )}
        </div>
        {viewerOpen && complete && (
          <ImageViewer src={a.url!} name={a.name} onClose={() => setViewerOpen(false)} />
        )}
      </div>
    </motion.div>
  );
};

/** Placeholder status shown in the media area while an image/video arrives. */
function ProgressState({ attachment: a, isMe }: { attachment: Attachment; isMe: boolean }) {
  const { t } = useI18n();
  if (a.status === 'complete') return null;
  return (
    <span className={cn("font-medium", STATUS_TONE[a.status] || 'text-apple-ink-muted')}>
      {transferStatusText(a, isMe, t)}
    </span>
  );
}

function ActionButton({ icon, label, onClick, active, primary, onBlue, testId }: { icon: React.ReactNode, label: string, onClick: () => void, active?: boolean, primary?: boolean, onBlue?: boolean, testId?: string }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); onClick(); }}
      data-testid={testId}
      className={cn(
        "flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-semibold transition-motion active:scale-95 min-h-[40px]",
        active
          ? "bg-status-success/15 text-status-success"
          : primary
            ? "bg-apple-blue hover:bg-apple-blue-focus text-white"
            : "bg-apple-parchment dark:bg-apple-tile-2 hover:bg-apple-divider dark:hover:bg-apple-tile-3 text-apple-ink dark:text-white"
      )}
    >
      <motion.span
        key={active ? 'check' : 'icon'}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="[&>svg]:w-3.5 [&>svg]:h-3.5"
      >
        {active ? <Check /> : icon}
      </motion.span>
      {label}
    </button>
  );
}

/**
 * Full-screen image viewer — same original quality, zoomable.
 * Wheel / pinch to zoom, drag to pan, double-tap or double-click to toggle,
 * Esc or backdrop to close. Touch-friendly and keyboard-friendly.
 */
function ImageViewer({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);
  const lastTap = useRef(0);
  const clampScale = (s: number) => Math.min(6, Math.max(1, s));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'r' || e.key === 'R') { setScale(1); setPos({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    setScale(s => clampScale(s * factor));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap — toggle zoom
      setScale(s => (s > 1 ? 1 : 2.5));
      setPos({ x: 0, y: 0 });
      pointers.current.clear();
      pinchDist.current = null;
    }
    lastTap.current = now;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1 && scale > 1) {
      setPos(pp => ({ x: pp.x + dx, y: pp.y + dy }));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const prev = pinchDist.current ?? dist;
      pinchDist.current = dist;
      if (prev > 0) setScale(s => clampScale(s * (dist / prev)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchDist.current = null;
  };
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex items-center justify-center"
      onPointerDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${name}`}
    >
      <div
        className="max-w-full max-h-full overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e); }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => { e.stopPropagation(); onPointerUp(e); }}
        onPointerCancel={(e) => { e.stopPropagation(); onPointerUp(e); }}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={name}
          draggable={false}
          className="max-h-[92vh] max-w-[95vw] object-contain select-none"
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, transition: scale === 1 ? 'transform 0.25s ease' : 'none' }}
        />
      </div>
      <button
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close image"
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-black/55 border border-white/20 text-white flex items-center justify-center backdrop-blur hover:bg-black/75 transition-colors active:scale-95"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/55 border border-white/15 text-white/90 text-[13px] font-medium backdrop-blur max-w-[90vw]">
        <span className="truncate max-w-[220px]">{name}</span>
        <span className="w-px h-3.5 bg-white/25" />
        <span className="flex items-center gap-1 whitespace-nowrap">
          <ZoomIn className="w-3.5 h-3.5" /> {Math.round(scale * 100)}% · scroll or pinch to zoom
        </span>
      </div>
    </motion.div>
  );
}
