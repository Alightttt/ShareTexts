/**
 * Message + transfer engine. Extracted from SessionContext (Round 03);
 * every function body is moved verbatim — semantics unchanged.
 *
 * Owns: message ingestion/dedupe, sender-receiver progress/completion,
 * checksums, push reassembly, send/retry/cancel/pause/resume actions, the
 * in-memory File map for retries, and progress throttling + speed readings.
 *
 * Wiring stays in SessionProvider (setupPeerManager assigns these callbacks
 * onto each PeerManager instance) so the peer-lifecycle code keeps its shape.
 *
 * Closure-semantics note (deliberate, matches the original): handlers
 * installed on a PeerManager read the LIVE mirror (getMessages → messagesRef)
 * so they never see a stale first-render list, while the UI-facing actions
 * read the CURRENT render's messages (getRenderMessages) exactly as the
 * original closures did.
 */

import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { SessionState, ChatMessage } from '../../types';
import { TransferCancelledError, hasSendProgress, chunkCountForSize, sendQueueDepth, clearTransferState } from '../webrtc';
import type { PeerManager } from '../webrtc';
import { diag } from '../diag';
import { connMachine } from '../connectionState';
import { speedTrackerFor, dropSpeedTracker } from '../speedEngine';
import { beginTransferRecord, finishTransferRecord } from '../transferMetrics';
import { productEvent } from '../telemetry';
import { saveSendable, getSendable, deleteSendable, saveTransferState, deleteTransferState } from '../transferStore';
import { sanitizeFilename } from '../utils';
import { recordTransferBytes } from '../pairing';
import { normalizePastedText } from '../textFidelity';
import { sha256Hex } from './fileIntegrity';
// Multi-device fan-out: one logical share → N independent per-recipient
// transfers, scheduled through a bounded bulk-lane scheduler so a big send
// never opens dozens of encryption pipelines at once (and text keeps its
// own fast lane).
import { TransferScheduler } from '../transferScheduler';
import { roomRoster } from '../roomRoster';
import type { RecipientTransfer } from '../../types';
/** Partial patch shape for one recipient's state row. */
type RecipientTransferPatch = RecipientTransfer;

export interface MessageEngineDeps {
  setSession: Dispatch<SetStateAction<SessionState>>;
  /** Live mirror of session.messages (fresh at all times). */
  getMessages: () => ChatMessage[];
  /** The current render's messages (closure-equivalent for UI actions). */
  getRenderMessages: () => ChatMessage[];
  getPeer: () => PeerManager | null;
  /** Seen confirmation gated on page visibility (session/seenReceipts.ts). */
  sendSeenWhenVisible: (send: () => void) => void;
  /** Multi-device: recipients for the next send (participant ids), and a
   *  per-participant link resolver. Absent/empty in the classic 1-to-1
   *  flow, which keeps its exact existing behavior. */
  getRecipients?: () => string[];
  ensureLink?: (participantId: string) => Promise<boolean>;
}

/** Apply one reaction delta to a message's tally. `mine` is our own state
 *  (toggled locally, never accepted from the wire); `delta` moves the count
 *  of OTHER devices — the two are independent so a room where both sides
 *  tapped the same emoji shows 1 + 1 rather than collapsing into one.
 *  A tally that reaches zero/off is deleted, so the row only exists while
 *  somebody means it. */
const applyReaction = (
  reactions: ChatMessage['reactions'],
  emoji: string,
  patch: { mine?: boolean; delta?: number }
): ChatMessage['reactions'] => {
  const next: NonNullable<ChatMessage['reactions']> = { ...(reactions ?? {}) };
  const entry = next[emoji] ?? { count: 0, mine: false };
  const count = Math.max(0, entry.count + (patch.delta ?? 0));
  const mine = patch.mine ?? entry.mine;
  if (count === 0 && !mine) delete next[emoji];
  else next[emoji] = { count, mine };
  return Object.keys(next).length ? next : undefined;
};

export interface MessageEngine {
  updateMessageAttachment(messageId: string, updates: Partial<NonNullable<ChatMessage['attachment']>>): void;
  /** Retry ONE failed recipient of a multi-recipient message (never resends
   *  to recipients that already succeeded). */
  retryRecipient(messageId: string, recipientId: string): Promise<void>;
  /** Cancel ONE recipient's leg (others keep moving). */
  cancelRecipient(messageId: string, recipientId: string): void;
  /** Toggle THIS device's reaction under one message — ours to send, theirs
   *  to receive — and tell every live link in the room. Tapping the same
   *  emoji again removes it. */
  reactToMessage(messageId: string, emoji: string): void;
  /** Assign the message/transfer callbacks onto a PeerManager. */
  wirePeerHandlers(pm: PeerManager): void;
  /** Channel-open consequences: resume interrupted transfers, then honest
   *  late DELIVERED receipts + resend requests for lost bytes. */
  handleChannelOpen(pm: PeerManager): void;
  /** Agent push API ingestion (text + chunked file reassembly). */
  handlePushMessage(payload: unknown): void;
  sendMessage(text: string, attachment?: ChatMessage['attachment'], file?: File, batchIndex?: number): Promise<void>;
  retryText(messageId: string): Promise<void>;
  retryTransfer(messageId: string): Promise<void>;
  cancelTransfer(messageId: string): void;
  pauseTransfer(messageId: string): void;
  resumeTransferById(messageId: string): void;
  transferSpeedFor(transferId: string): { bytesPerSec: number; etaSec: number | null } | null;
  /** Clear all per-session runtime maps (reset path). */
  clearRuntimeState(): void;
  /** Bind the room's PeerConnectionManager (multi-device fan-out routing).
   *  Pass null on room teardown to restore pure classic routing. */
  setPcm(pcm: { get(participantId: string): PeerManager | null } | null): void;
}
export function useMessageEngine(deps: MessageEngineDeps): MessageEngine {
  const { setSession, getMessages, getRenderMessages, getPeer, sendSeenWhenVisible } = deps;
  const getRecipients = deps.getRecipients ?? (() => []);
  const ensureLink = deps.ensureLink ?? (async () => false);
  /** Multi-device room manager accessor — resolved lazily so the engine can
   *  route per-recipient legs to their own PeerManager links. MUST be a ref,
   *  not a render-scoped `let`: a plain variable is re-created (null) on
   *  every render, silently discarding the provider's setPcm assignment and
   *  falling every fan-out leg back onto the classic single peer — recipient
   *  2+ then never receives anything while the sender's strip claims
   *  success. Null in the classic flow. */
  const getPcmRef = useRef<{ get(participantId: string): PeerManager | null } | null>(null);
  /** Assigns the room's manager (see the note above). Writes the REF — the
   *  assignment survives every render. */
  const setPcm = (pcm: { get(participantId: string): PeerManager | null } | null) => { getPcmRef.current = pcm; };
  /** The fan-out scheduler lives per engine instance; a lane budget of 3
   *  bulk jobs matches the page's global send-slot budget. CONTROL jobs
   *  (text) are unbounded by design. */
  const schedulerRef = useRef(new TransferScheduler(3));

  // Last-published progress per transfer, for throttling onFileProgress.
  const progressRef = useRef<Map<string, number>>(new Map());
  /** Rolling speed readings per transfer, consumed by MessageCard rows. */
  const lastSpeedReadings = useRef<Map<string, { bytesPerSec: number; etaSec: number | null }>>(new Map());
  /** Fixed chunk grid of the wire protocol (mirrors webrtc.ts CHUNK_SIZE). */
  const CHUNK_BYTES = 128 * 1024;
  // In-memory File references for failed transfers, so "Retry" can resend
  // the actual bytes. Files aren't serializable (JSON.stringify drops them),
  // so they can't live on the message; this map is keyed by message id and
  // cleared when the session resets.
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  // Synchronous received-id ledger. The mirror above only updates on RENDER,
  // so two deliveries of the same message inside one batch (the classic case:
  // the data channel opens mid-transfer and BOTH it and the relay fallback
  // deliver the same payload) both pass a `messagesRef`-based check and append
  // twice — duplicate bubbles and duplicate React keys. A Set updated in the
  // handler itself is immune to batching.
  const receivedIdsRef = useRef<Set<string>>(new Set());
  // In-flight agent-push file chunks, keyed by push message id. The server
  // delivers files as ~45KB base64 chunks (to fit WS frame caps on both
  // transports); this buffer reassembles them before the bubble appears.
  const pushBuffersRef = useRef<Map<string, { name: string; mimeType: string; size: number; chunkCount: number; timestamp: number; chunks: string[]; filled: number }>>(new Map());

  const updateMessageAttachment = (messageId: string, updates: Partial<NonNullable<ChatMessage['attachment']>>) => {
    setSession(s => {
      return {
        ...s,
        messages: s.messages.map(m => {
          if (m.id === messageId && m.attachment) {
            return {
              ...m,
              attachment: { ...m.attachment, ...updates }
            };
          }
          return m;
        })
      };
    });
  };

  const handlePushMessage = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const id = (payload as any).id;
    if (typeof id !== 'string' || !id) return;
    if (getMessages().some(m => m.id === id)) return; // dedupe

    if ((payload as any).kind === 'text') {
      const msg: ChatMessage = {
        id,
        sender: 'partner',
        source: 'push',
        text: String((payload as any).text ?? ''),
        timestamp: typeof (payload as any).timestamp === 'number' ? (payload as any).timestamp : Date.now(),
      };
      setSession(s => ({ ...s, messages: [...s.messages, msg] }));
      return;
    }

    if ((payload as any).kind === 'file') {
      const chunkIndex = (payload as any).chunkIndex;
      const chunkCount = (payload as any).chunkCount;
      const dataBase64 = (payload as any).dataBase64;
      if (typeof chunkIndex !== 'number' || typeof chunkCount !== 'number' || typeof dataBase64 !== 'string') return;

      let buf = pushBuffersRef.current.get(id);
      if (!buf) {
        buf = {
          name: sanitizeFilename(String((payload as any).name ?? 'file')),
          mimeType: String((payload as any).mimeType ?? 'application/octet-stream'),
          size: typeof (payload as any).size === 'number' ? (payload as any).size : 0,
          chunkCount,
          timestamp: typeof (payload as any).timestamp === 'number' ? (payload as any).timestamp : Date.now(),
          chunks: new Array(chunkCount),
          filled: 0,
        };
        pushBuffersRef.current.set(id, buf);
      }
      if (!buf.chunks[chunkIndex]) {
        buf.chunks[chunkIndex] = dataBase64;
        buf.filled++;
      }
      if (buf.filled >= buf.chunkCount) {
        pushBuffersRef.current.delete(id);
        try {
          const binary = atob(buf.chunks.join(''));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: buf.mimeType });
          const url = URL.createObjectURL(blob);
          const mime = buf.mimeType.toLowerCase();
          const type: NonNullable<ChatMessage['attachment']>['type'] = mime.startsWith('image/')
            ? 'image'
            : mime.startsWith('video/')
              ? 'video'
              : mime.startsWith('audio/')
                ? 'audio'
                : 'file';
          const msg: ChatMessage = {
            id,
            sender: 'partner',
            source: 'push',
            text: '',
            timestamp: buf.timestamp,
            attachment: {
              id,
              type,
              name: buf.name,
              size: buf.size,
              mimeType: buf.mimeType,
              url,
              status: 'complete',
              progress: 1,
            },
          };
          setSession(s => ({ ...s, messages: [...s.messages, msg] }));
        } catch {
          // Undecodable chunk data — drop the push silently.
          pushBuffersRef.current.delete(id);
        }
      }
      return;
    }
  };

  const wirePeerHandlers = (pm: PeerManager) => {
    pm.onMessage = (dataStr) => {
      try {
        const parsed = JSON.parse(dataStr);
        // Control packets: a peer that reloaded asks us to re-send a file it
        // previously received (its bytes died with the page), or tells us it
        // no longer holds the bytes so we can fail honestly instead of waiting.
        if (parsed.kind === 'resend_request') { void handleResendRequest(parsed.id); return; }
        if (parsed.kind === 'resend_unavailable') { updateMessageAttachment(parsed.id, { status: 'failed', note: 'resend-unavailable' }); return; }
        if (parsed.id && parsed.sender) {
          // New structured format. Dedupe by message id so a retried transfer
          // (metadata re-sent after a failure) doesn't create a duplicate
          // bubble, while still (re)registering the binary expectation.
          const isDuplicate = receivedIdsRef.current.has(parsed.id);
          receivedIdsRef.current.add(parsed.id);
          if (!isDuplicate) {
            // A peer's 'sending' is our 'receiving'.
            // Sanitize the sender-provided filename to prevent path traversal,
            // control characters, and other injection vectors.
            const incoming = parsed.attachment && parsed.attachment.status === 'sending'
              ? { ...parsed, attachment: { ...parsed.attachment, status: 'receiving', name: sanitizeFilename(parsed.attachment.name || 'file') } }
              : parsed.attachment ? { ...parsed, attachment: { ...parsed.attachment, name: sanitizeFilename(parsed.attachment.name || 'file') } } : parsed;
            setSession(s => ({
              ...s,
              messages: [...s.messages, incoming]
            }));
          } else if (parsed.attachment) {
            // A re-sent metadata for a message we already have (e.g. the
            // checksum arrives after the sender finished hashing). Merge the
            // new fields into the existing bubble — never duplicate it — and
            // keep our status ('receiving'/'interrupted'/'complete') intact.
            // The merge runs INSIDE the updater against current state so a
            // stale snapshot can never clobber a newer one (e.g. completion).
            setSession(s => {
              if (!s.messages.some(m => m.id === parsed.id && m.attachment)) return s;
              return {
                ...s,
                messages: s.messages.map(m => {
                  if (m.id !== parsed.id || !m.attachment) return m;
                  return {
                    ...m,
                    attachment: {
                      ...m.attachment,
                      ...parsed.attachment,
                      status: m.attachment.status,
                      name: sanitizeFilename(m.attachment.name || parsed.attachment.name || 'file')
                    }
                  };
                })
              };
            });
          }
          if (parsed.attachment) {
            // The chunk count comes from the SAME grid the sender uses
            // (chunkCountForSize) — a mismatch here would leave the receiver
            // waiting for chunks that never come or rejecting real ones.
            pm.expectBinaryTransfer(parsed.attachment.id, chunkCountForSize(parsed.attachment.size));
            // Metrics: a file transfer is now officially in flight on THIS
            // device. Duration/throughput are computed when it finishes.
            beginTransferRecord({
              transferId: parsed.attachment.id,
              kind: 'file',
              direction: 'received',
              name: parsed.attachment.name,
              bytes: parsed.attachment.size,
            });
          } else {
            // Text arrived — confirm receipt immediately so the sender can
            // show a true "Delivered" (not a guessed one).
            pm.sendReceipt(parsed.id);
            // SEEN is NOT claimed here: a message that just landed in state
            // may be below the fold, on another screen, or the tab may be in
            // the background. The room viewer (claimSeen / the ChatView
            // visibility effect) marks it seen only when it is actually
            // rendered on a visible screen.
          }
          return;
        }
      } catch (e) {
        // Fallback
      }
      setSession(s => ({
        ...s,
        messages: [...s.messages, { id: crypto.randomUUID(), sender: 'partner', text: dataStr, timestamp: Date.now() }]
      }));
    };

    pm.onFileProgress = (transferId, progress, total) => {
      const pct = progress / total;
      // Throttle to ~1% steps: every chunk otherwise triggers a full React
      // re-render + scrollIntoView, which drags large transfers to a crawl.
      const last = progressRef.current.get(transferId) ?? -1;
      if (pct - last < 0.01 && pct < 1) return;
      progressRef.current.set(transferId, pct);
      // Speed engine: rolling-window throughput + ETA. The peer reports
      // progress in CHUNKS (chunk grid is fixed), so bytes = chunks × chunk size.
      const totalBytes = total * CHUNK_BYTES;
      const reading = speedTrackerFor(transferId, totalBytes).update(progress * CHUNK_BYTES);
      lastSpeedReadings.current.set(transferId, reading);
      // Durable resume floor (receiver side): every ~1% we persist the
      // contiguous progress, so a crash/refresh can answer a sender's
      // resume_query honestly even across a browser restart.
      void saveTransferState({ transferId, status: 'receiving', ackedChunks: progress, totalChunks: total });
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                // Queued self-heal: queued_start (control channel) can race
                // ahead of the metadata (data channel), leaving a 'waiting'
                // bubble that never flips. The first chunk is proof the
                // transfer is live — promote it here.
                ...(m.attachment.status === 'waiting' ? { status: 'receiving' as const } : {}),
                // First byte moving: start the honest clock (used by the
                // "Received · size in time" summary). Kept from the first
                // attempt if this is a resume — the story stays true.
                ...(m.attachment.startedAt == null && (m.attachment.status === 'waiting' || m.attachment.status === 'receiving') ? { startedAt: Date.now() } : {}),
                // Progress never changes the state label: the sender stays
                // 'sending', the receiver 'receiving', and a cancelled/failed
                // transfer must not be resurrected by late progress events.
                progress: pct
              }
            };
          }
          return m;
        })
      }));
    };

    pm.onFileComplete = (transferId, blob) => {
      // The reassembled blob carries no MIME type — attach the one from the
      // metadata so previews, downloads and clipboard copy get the correct
      // type. Blob composition references the original bytes, so this stays
      // cheap even for large disk-backed (OPFS) files.
      const srcMsg = getMessages().find(m => m.attachment?.id === transferId);
      const mime = srcMsg?.attachment?.mimeType;
      const checksum = srcMsg?.attachment?.checksum;
      const finalBlob = mime && blob.type !== mime ? new Blob([blob], { type: mime }) : blob;
      const url = URL.createObjectURL(finalBlob);
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return {
              ...m,
              attachment: {
                ...m.attachment,
                status: 'complete',
                url,
                progress: 1,
                completedAt: m.attachment.completedAt ?? Date.now()
              }
            };
          }
          return m;
        })
      }));
      // Mark that this user has completed at least one transfer, so the
      // install prompt can appear after meaningful use.
      try { localStorage.setItem('sharetext.hasTransfer', '1'); } catch { /* ignore */ }
      // Lifetime device stats: only REAL completed bytes count — the same
      // truth bar as the rooms counter.
      recordTransferBytes(blob.size);
      // Metrics: bytes on disk, duration done. Outcome upgrades to
      // 'checksum-mismatch' later if verification fails.
      finishTransferRecord(transferId, 'received', blob.size, 'ok', { name: srcMsg?.attachment?.name, kind: 'file' });
      productEvent('product.transfer_completed');
      productEvent('product.activation');
      void deleteTransferState(transferId);
      dropSpeedTracker(transferId);
      lastSpeedReadings.current.delete(transferId);
      // The whole file arrived — only now confirm receipt (metadata alone
      // would be a lie if the transfer later failed).
      const msg = getMessages().find(m => m.attachment?.id === transferId);
      if (msg && msg.sender === 'partner') {
        pm.sendReceipt(msg.id);
        // The completed file card is on screen in the open room — confirm
        // seen too (same honesty rule as text: only after it's rendered).
        // Only claim seen if the page is actually visible.
        setTimeout(() => sendSeenWhenVisible(() => pm.sendSeen(msg.id)), 450);
      }

      // Integrity: if the sender included a checksum, verify the bytes that
      // actually arrived. The card stays usable (download works) while the
      // background hash runs; a mismatch flips it to a clear failure with
      // Retry instead of silently keeping corrupted data.
      if (checksum && srcMsg) {
        // updateMessageAttachment keys on the MESSAGE id — the transferId is
        // the attachment id, so resolve the owning message first.
        const msgId = srcMsg.id;
        void sha256Hex(finalBlob)
          .then((got) => {
            const ok = got === checksum;
            diag('transfer.checksum', ok, ok ? 'verified' : `mismatch expected ${checksum.slice(0, 12)}… got ${got.slice(0, 12)}…`);
            if (!ok) finishTransferRecord(transferId, 'received', 0, 'checksum-mismatch', { name: srcMsg?.attachment?.name, kind: 'file', verified: false });
            updateMessageAttachment(msgId, ok
              ? { verified: true }
              : { status: 'failed', note: 'checksum-mismatch', progress: 1, verified: false });
          })
          .catch(() => { /* hashing failed (quota?) — leave complete, unverified */ });
      } else {
        // The sender hashes in parallel with the transfer, so the checksum
        // metadata can trail the file. Wait briefly for it before declaring
        // the transfer unverifiable.
        const msgId = srcMsg?.id;
        setTimeout(() => {
          const now = msgId ? getMessages().find(m => m.id === msgId)?.attachment : undefined;
          if (now?.checksum) {
            void sha256Hex(finalBlob)
              .then((got) => {
              const ok = got === now.checksum;
              diag('transfer.checksum', ok, ok ? 'verified (late)' : `mismatch expected ${now.checksum.slice(0, 12)}… got ${got.slice(0, 12)}…`);
              if (!ok) finishTransferRecord(transferId, 'received', 0, 'checksum-mismatch', { name: srcMsg?.attachment?.name, kind: 'file', verified: false });
              updateMessageAttachment(msgId, ok
                ? { verified: true }
                : { status: 'failed', note: 'checksum-mismatch', progress: 1, verified: false });
              })
              .catch(() => { /* hashing failed — leave complete, unverified */ });
          } else {
            diag('transfer.checksum_skipped', true, `${transferId.slice(0, 8)} no checksum`);
          }
        }, 4000);
      }
    };

    // The peer confirmed one of our messages arrived.
    pm.onReceipt = (messageId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === messageId ? { ...m, delivered: true } : m)
      }));
    };

    // A device in the room added or removed a reaction under one message.
    // The tally counts OTHER devices only; `mine` is ours and is never
    // written from the wire, so both sides can hold the same emoji and each
    // sees its own chip lit.
    pm.onReaction = (messageId, emoji, on) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === messageId
          ? { ...m, reactions: applyReaction(m.reactions, emoji, { delta: on ? 1 : -1 }) }
          : m),
      }));
    };

    // The peer cancelled a transfer (or cancelled ours mid-send). Mark the
    // matching bubble cancelled on this side too.
    pm.onCancel = (transferId) => {
      finishTransferRecord(transferId, 'received', 0, 'cancelled', { kind: 'file' });
      void deleteTransferState(transferId);
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.attachment?.id === transferId) {
            return { ...m, attachment: { ...m.attachment, status: 'cancelled' } };
          }
          return m;
        })
      }));
    };

    // Protocol HASH_VERIFY arriving on its own (control channel): stash it on
    // the attachment like the metadata-borne checksum, and if the file already
    // finished unverified, verify immediately with the bytes we hold.
    pm.onFileHash = (transferId, sha256) => {
      const srcMsg = getMessages().find(m => m.attachment?.id === transferId);
      if (srcMsg) {
        updateMessageAttachment(srcMsg.id, { checksum: sha256 });
      }
    };

    // Transfer queue: the peer's queue freed a slot for this transfer —
    // flip our bubble from 'Waiting…' to a live percentage.
    pm.onQueuedSendStart = (transferId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.attachment?.id === transferId && m.attachment.status === 'waiting'
          ? { ...m, attachment: { ...m.attachment, status: 'receiving', startedAt: Date.now() } }
          : m),
      }));
    };

    // Transfer queue, sender side: THIS device's queue freed a slot — flip
    // our 'Waiting…' bubble to 'sending' (the send loop owns it from here:
    // hash ran in parallel at send time, chunks are already flowing). Sender
    // bubbles hold their label until completion — same as a non-queued send.
    pm.onLocalQueueStart = (transferId) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.attachment?.id === transferId && m.attachment.status === 'waiting'
          ? { ...m, attachment: { ...m.attachment, status: 'sending', startedAt: Date.now() } }
          : m),
      }));
    };
  };

  const handleChannelOpen = (pm: PeerManager) => {
    // If a transfer was interrupted by the drop, resume it from the
    // position the peer actually received — never from zero.
    void resumeInterruptedTransfers();
    // Honest late receipts: after a reload/rejoin, the OTHER device may
    // still be open with messages it sent us that never got confirmed. We
    // genuinely hold them (restored from localStorage), so confirm
    // DELIVERED now — but never SEEN here: nobody has looked at them yet.
    // Seen is claimed only by the room-viewer when the message is
    // actually rendered on a visible screen.
    for (const m of getMessages()) {
      if (m.sender === 'partner' && (m.attachment?.status === 'complete' || !m.attachment)) {
        pm.sendReceipt(m.id);
      }
      // Restored files we received but no longer hold bytes for: ask the
      // peer to re-send them now that the channel is open.
      if (m.sender === 'partner' && m.attachment?.status === 'restoring') {
        try { void pm.send(JSON.stringify({ kind: 'resend_request', id: m.id })); } catch { /* channel closed */ }
      }
    }
  };

  /**
   * After the data channel reopens (reconnect / recovery), walk the message
   * list and resume anything that was interrupted. Own sends re-send metadata
   * + the missing chunk range; inbound transfers just flip back to
   * "Receiving…" — the sender re-registers and resumes on its side.
   */
  const resumeInterruptedTransfers = async () => {
    const pm = getPeer();
    if (!pm) return;
    for (const m of getMessages()) {
      const a = m.attachment;
      if (!a) continue;
      // A 'sending' attachment WITHOUT active loop progress after a reload
      // is exactly the crashed-mid-send case: sendProgress (memory) died with
      // the page. The IDB sendable makes it resumable again.
      const crashedMidSend = a.status === 'sending' && !hasSendProgress(a.id) && !getPeer()?.isSendLoopActive(a.id);
      // A 'waiting' transfer with NO live send loop lost its page (refresh/
      // crash) while queued — restore it from the IndexedDB sendable and
      // re-queue. An ALIVE queued transfer has a controller registered in
      // its PeerManager, so isSendLoopActive keeps a mere reconnect from
      // resuming (and double-sending) it.
      const queuedButDead = a.status === 'waiting' && !getPeer()?.isSendLoopActive(a.id);
      if (m.sender === 'me' && (a.status === 'interrupted' || a.status === 'resuming' || (a.status === 'sending' && hasSendProgress(a.id)) || crashedMidSend || queuedButDead)) {
        let file = pendingFilesRef.current.get(m.id);
        if (!file) {
          // Memory lost (refresh/sleep) — the IndexedDB sendable is exactly
          // for this case: restore the bytes and RESUME instead of failing.
          file = (await getSendable(a.id)) ?? undefined;
          if (file) {
            pendingFilesRef.current.set(m.id, file);
            diag('transfer.sendable_restored', true, `${a.name} (${a.size}b)`);
          }
        }
        if (!file) continue; // no bytes anywhere — nothing safe to re-send
        updateMessageAttachment(m.id, { status: 'resuming', progress: a.progress });
        const partnerMsg: ChatMessage = {
          ...m,
          sender: 'partner',
          attachment: { ...a, status: 'sending', progress: a.progress }
        };
        try {
          await pm.resumeTransfer(JSON.stringify(partnerMsg), file, a.id);
          updateMessageAttachment(m.id, { status: 'complete', progress: 1, completedAt: Date.now() });
          void deleteSendable(a.id);
          void deleteTransferState(a.id);
        } catch (e) {
          if (!(e instanceof TransferCancelledError)) {
            updateMessageAttachment(m.id, { status: 'failed' });
          }
        }
      } else if (m.sender === 'partner' && (a.status === 'interrupted' || a.status === 'receiving')) {
        // The peer is back and will re-send; surface it as plain receiving.
        updateMessageAttachment(m.id, { status: 'receiving' });
      }
    }
  };

  /**
   * MULTI-RECIPIENT SEND. One user action = ONE logical share that fans out
   * to N recipients, each with its own real state (partial success is
   * first-class). The source work is shared: one File, one checksum, one
   * metadata template; only the wire transfer id and delivery state are per
   * recipient (fresh UUID per recipient so reassembly/cancel/retry stay
   * independently addressable). The scheduler's bounded bulk lane provides
   * the controlled fan-out — 30 recipients queue, they don't stampede.
   * Receivers are UNAWARE of the fan-out: each gets the ordinary 1-to-1
   * message shape.
   */
  const sendToRecipients = async (
    text: string,
    attachment: ChatMessage['attachment'],
    file: File | undefined,
    recipientIds: string[],
  ): Promise<void> => {
    const msgId = crypto.randomUUID();
    const baseAttachment = attachment
      ? { ...attachment, status: file ? ('preparing' as const) : ('complete' as const), url: undefined }
      : undefined;
    const perRecipient = new Map(recipientIds.map(id => [id, {
      recipientId: id,
      state: 'pending' as const,
      progress: 0,
    }]));
    const transferIds: Record<string, string> = {};
    for (const id of recipientIds) transferIds[id] = crypto.randomUUID();

    const msg: ChatMessage = {
      id: msgId,
      sender: 'me',
      text,
      timestamp: Date.now(),
      attachment: baseAttachment
        ? { ...baseAttachment, recipients: [...perRecipient.values()], transferIds }
        : undefined,
      textRecipients: baseAttachment ? undefined : [...perRecipient.values()],
    };

    if (file && attachment) {
      pendingFilesRef.current.set(msgId, file);
      if (pendingFilesRef.current.size > 20) {
        const oldest = pendingFilesRef.current.keys().next().value;
        if (oldest !== undefined) pendingFilesRef.current.delete(oldest);
      }
    }
    setSession(s => ({ ...s, messages: [...s.messages, msg] }));
    if (file && attachment) {
      updateMessageAttachment(msgId, { url: URL.createObjectURL(file) });
    }

    const setRecipientState = (rid: string, patch: Partial<RecipientTransferPatch>) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.id !== msgId) return m;
          const recs = m.attachment?.recipients ?? m.textRecipients;
          if (!recs) return m;
          const next = recs.map(r => r.recipientId === rid ? { ...r, ...patch } : r);
          return m.attachment
            ? { ...m, attachment: { ...m.attachment, recipients: next } }
            : { ...m, textRecipients: next };
        })
      }));
    };

    // One honest checksum, computed once for all recipients.
    let checksum: string | undefined;
    if (file && attachment) {
      void sha256Hex(file).then(c => {
        checksum = c;
        updateMessageAttachment(msgId, { checksum: c });
        for (const rid of recipientIds) {
          const pm = getPeerForRecipient(rid);
          void pm?.sendFileHash(transferIds[rid], c);
        }
      }).catch(() => { /* per-recipient transfer reports its own failure */ });
    }

    await Promise.all(recipientIds.map(async (rid) => {
      setRecipientState(rid, { state: file ? 'waiting' : 'sending', startedAt: Date.now() });
      const ok = await schedulerRef.current.enqueue({
        opId: msgId,
        recipientId: rid,
        // Text = control lane (fast, tiny); files = bulk lane (bounded).
        lane: file ? 'bulk' : 'control',
        run: async () => {
          const pm = await getOrCreateLink(rid);
          if (!pm) {
            setRecipientState(rid, { state: 'failed', error: 'unavailable', completedAt: Date.now(), retryable: true });
            return;
          }
          const wireId = transferIds[rid];
          const myAttachment = baseAttachment
            ? { ...baseAttachment, id: wireId, checksum, url: undefined }
            : undefined;
          const payloadMsg: ChatMessage = { ...msg, id: msgId, sender: 'partner', attachment: myAttachment, textRecipients: undefined };
          try {
            await pm.send(JSON.stringify(payloadMsg));
            if (file && attachment) {
              // The receiver registers by attachment.id — which is now the
              // recipient's fresh wire id.
              await pm.sendFile(file, wireId);
            }
            setRecipientState(rid, { state: 'sent', progress: 1, completedAt: Date.now() });
          } catch (e) {
            if (e instanceof TransferCancelledError) {
              setRecipientState(rid, { state: 'cancelled', completedAt: Date.now() });
            } else {
              setRecipientState(rid, { state: 'failed', error: (e as Error)?.message?.slice(0, 80), completedAt: Date.now(), retryable: true });
            }
          }
        },
      });
      if (!ok) setRecipientState(rid, { state: 'cancelled', completedAt: Date.now() });
    }));
    // Durable copies only matter for retry; keep them (pendingFilesRef) —
    // per-recipient retries below reuse the same File.
  };

  /** Resolve the link for one recipient through the multi-device manager.
   *  Returns the classic single peer in the 1-to-1 flow. When the classic
   *  peer is BOUND to this recipient (its `boundId` matches), it IS the
   *  direct channel — reuse it rather than building a duplicate parallel
   *  link to the same device. */
  const getPeerForRecipient = (rid: string): PeerManager | null => {
    const single = getPeer();
    if (single && !single.isDestroyed() && single.boundId === rid) return single;
    if (single && !getPcmRef.current) return single;
    return getPcmRef.current?.get(rid) ?? null;
  };

  /** Open (or reuse) the link to one recipient before a fan-out leg. */
  const getOrCreateLink = async (rid: string): Promise<PeerManager | null> => {
    const existing = getPeerForRecipient(rid);
    if (existing) {
      const ok = await existing.ensureOpen().catch(() => false);
      if (ok) return existing;
    }
    const ok = await ensureLink(rid);
    if (!ok) return null;
    return getPcmRef.current?.get(rid) ?? null;
  };

  const sendMessage = async (rawText: string, attachment?: ChatMessage['attachment'], file?: File, batchIndex = 0) => {
    const pm = getPeer();
    // Multi-recipient path: any targeted leg in a 3+ device room goes through
    // the fan-out scheduler (1 selected → targeted; none → every other live
    // device; 2+ → the chosen set). Only the classic TWO-device room keeps
    // the direct single-peer flow EXACTLY as it was (fast path, no scheduling
    // overhead — the common case must not regress). Defaulting here — not in
    // the UI — means a send in a seated multi-device room can never depend on
    // the picker having been opened, and can never silently no-op on a
    // deferred classic link.
    const rids = getRecipients().filter(id => id !== roomRoster.selfParticipantId);
    const multiRoom = roomRoster.size > 2;
    if (multiRoom && rids.length === 0) {
      for (const e of roomRoster.otherEntries()) {
        if (e.link !== 'offline') rids.push(e.id);
      }
    }
    if (multiRoom && rids.length >= 1) {
      await sendToRecipients(normalizePastedText(rawText), attachment, file, rids);
      return;
    }
    if (!pm) return;
    // Text fidelity: normalize ONCE on the sender so both devices hold the
    // exact same JS string. Valid text (emoji, RTL, tabs, CRLF, all unicode)
    // is untouched — only lone surrogates (which cannot survive the UTF-8
    // wire anyway) become a deterministic U+FFFD instead of differing
    // silently between devices.
    const text = normalizePastedText(rawText);
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'me',
      text,
      timestamp: Date.now(),
      // Multi-file queue: files beyond the 3 concurrent slots start as
      // 'Waiting…' until their slot frees (onLocalQueueStart flips locally,
      // the queued_start control packet flips the peer's bubble). Batch
      // position decides because the whole batch's sendMessage calls run
      // before any transfer acquires a slot — the live depth is 0 for all.
      attachment: attachment ? { ...attachment, status: file ? (batchIndex + sendQueueDepth() >= 3 ? 'waiting' : 'preparing') : 'complete' } : undefined
    };

    if (file) {
      pendingFilesRef.current.set(msg.id, file);
      // Keep the map bounded — only recent transfers can be retried anyway.
      if (pendingFilesRef.current.size > 20) {
        const oldest = pendingFilesRef.current.keys().next().value;
        if (oldest !== undefined) pendingFilesRef.current.delete(oldest);
      }
      // Durable resume: persist the bytes in IndexedDB so a refresh (or a
      // closed tab) can still RESUME instead of failing. Cleaned up when the
      // transfer completes or is cancelled below.
      void saveSendable(attachment!.id, file);
      void saveTransferState({ transferId: attachment!.id, status: 'sending', ackedChunks: 0, totalChunks: chunkCountForSize(file.size) });
    }

    setSession(s => ({
      ...s,
      messages: [...s.messages, msg]
    }));

    if (file && attachment) {
      const localUrl = URL.createObjectURL(file);
      updateMessageAttachment(msg.id, { url: localUrl });

      // SHA-256 of the original bytes — computed in the background so the
      // transfer starts immediately. The hash runs in parallel with the first
      // chunks; for small files it finishes before the transfer does.
      let checksum: string | undefined;
      const hashPromise = sha256Hex(file).then(c => {
        checksum = c;
        diag('transfer.hash_ok', true, c.slice(0, 12));
        updateMessageAttachment(msg.id, { checksum: c });
        // Protocol: the final HASH_VERIFY step. A tiny control packet (rides
        // the dedicated control channel when open) tells the receiver the
        // SHA-256 directly — verification no longer depends on the chunked
        // metadata update also landing.
        void getPeer()?.sendFileHash(attachment.id, c);
        // Re-send the metadata with the checksum so the peer can verify the
        // bytes that land on its side. The receiver dedupes by message id and
        // merges the checksum into the existing bubble.
        void getPeer()?.send(JSON.stringify({
          ...partnerMsg,
          attachment: { ...partnerMsg.attachment!, checksum: c }
        })).catch(() => { /* peer may be gone — the transfer itself will fail */ });
        return c;
      }).catch(e => {
        diag('transfer.hash_failed', false, String(e));
        return undefined;
      });

      // Queued files KEEP 'Waiting…' — their send loop is parked in the slot
      // queue, and onLocalQueueStart flips the bubble the moment a slot
      // frees. Only files that own a slot right now move to 'sending'.
      if (msg.attachment?.status !== 'waiting') {
        updateMessageAttachment(msg.id, { status: 'sending', startedAt: Date.now() });
      }

      // The peer's bubble must mirror ours: a queued file arrives as
      // 'waiting' (so their card renders Waiting… too), and the queued_start
      // control packet flips it to 'receiving' when the transfer actually
      // leaves the queue.
      const partnerMsg = { ...msg, sender: 'partner', attachment: { ...msg.attachment!, status: msg.attachment!.status === 'waiting' ? 'waiting' : 'sending' } };
      const payload = JSON.stringify(partnerMsg);
      try {
        await pm.send(payload);
      } catch {
        updateMessageAttachment(msg.id, { status: 'failed' });
        return;
      }

      try {
        await pm.sendFile(file, attachment.id);
        updateMessageAttachment(msg.id, { status: 'complete', progress: 1, completedAt: Date.now() });
        // Transfer done — the durable copies are no longer needed.
        void deleteSendable(attachment.id);
        void deleteTransferState(attachment.id);
        pendingFilesRef.current.delete(msg.id);
      } catch (e) {
        // A user cancel stops the loop cleanly — don't overwrite 'cancelled'.
        if (!(e instanceof TransferCancelledError)) {
          updateMessageAttachment(msg.id, { status: 'failed' });
          finishTransferRecord(attachment.id, 'sent', 0, 'failed', { name: file.name, kind: 'file' });
          productEvent('product.transfer_failed');
        } else {
          finishTransferRecord(attachment.id, 'sent', 0, 'cancelled', { name: file.name, kind: 'file' });
          // Cancelled is final — drop the durable copies too.
          void deleteSendable(attachment.id);
          void deleteTransferState(attachment.id);
          pendingFilesRef.current.delete(msg.id);
        }
      }
      return;
    }

    // Plain text: metadata (the text itself) goes immediately — no hash step.
    const partnerMsg = { ...msg, sender: 'partner' };
    const payload = JSON.stringify(partnerMsg);
    try {
      await pm.send(payload);
    } catch {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === msg.id ? { ...m, delivery: 'failed' } : m)
      }));
    }
  };

  /**
   * Re-send a failed text message. The original bubble is replaced by a
   * fresh message with a new id — the receiver dedupes by message id, so
   * re-sending the same id would be silently swallowed.
   */
  const retryText = async (messageId: string) => {
    const pm = getPeer();
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!pm || !msg) return;
    const fresh: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'me',
      text: normalizePastedText(msg.text),
      timestamp: Date.now()
    };
    setSession(s => ({
      ...s,
      messages: [...s.messages.filter(m => m.id !== messageId), fresh]
    }));
    try {
      await pm.send(JSON.stringify({ ...fresh, sender: 'partner' }));
    } catch {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => m.id === fresh.id ? { ...m, delivery: 'failed' } : m)
      }));
    }
  };

  /**
   * A peer that reloaded lost the bytes of a file we sent them and is asking
   * us to re-send it. Works only while this tab still holds the File in
   * memory; otherwise we tell them honestly it's gone (resend_unavailable) so
   * their card fails cleanly instead of spinning forever.
   */
  const handleResendRequest = async (messageId: string) => {
    const pm = getPeer();
    if (!pm) return;
    const msg = getMessages().find(m => m.id === messageId);
    if (!msg?.attachment) return;
    const file = pendingFilesRef.current.get(messageId);
    if (!file) {
      try { await pm.send(JSON.stringify({ kind: 'resend_unavailable', id: messageId })); } catch { /* channel gone */ }
      return;
    }
    updateMessageAttachment(messageId, { status: 'resuming', progress: 0 });
    const partnerMsg: ChatMessage = {
      ...msg,
      sender: 'partner',
      attachment: { ...msg.attachment, status: 'sending', progress: 0 }
    };
    try {
      await pm.resumeTransfer(JSON.stringify(partnerMsg), file, msg.attachment.id);
      updateMessageAttachment(messageId, { status: 'complete', progress: 1, completedAt: Date.now() });
    } catch (e) {
      if (!(e instanceof TransferCancelledError)) {
        try { await pm.send(JSON.stringify({ kind: 'resend_unavailable', id: messageId })); } catch { /* noop */ }
      }
    }
  };

  const retryTransfer = async (messageId: string) => {
    const pm = getPeer();
    if (!pm) return;
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!msg?.attachment) return;
    // Receiver-side recovery: the peer said it no longer holds the bytes, or
    // we restored this file and never got it back — ask again now. For a
    // checksum mismatch the partial receive must be discarded so the resend
    // restarts from zero instead of the corrupted position.
    if (msg.sender === 'partner' && (msg.attachment.note === 'resend-unavailable' || msg.attachment.status === 'restoring' || msg.attachment.note === 'checksum-mismatch')) {
      if (msg.attachment.note === 'checksum-mismatch') {
        clearTransferState(msg.attachment.id);
        diag('transfer.restart', true, msg.attachment.name);
      }
      updateMessageAttachment(messageId, { status: 'restoring', note: undefined });
      try { await pm.send(JSON.stringify({ kind: 'resend_request', id: messageId })); } catch { /* channel gone */ }
      return;
    }
    const file = pendingFilesRef.current.get(messageId);
    if (!file) return;

    updateMessageAttachment(messageId, { status: 'resuming', progress: msg.attachment.progress || 0 });
    const partnerMsg: ChatMessage = {
      ...msg,
      sender: 'partner',
      attachment: { ...msg.attachment, status: 'sending', progress: msg.attachment.progress || 0 }
    };
    try {
      await pm.resumeTransfer(JSON.stringify(partnerMsg), file, msg.attachment.id);
      updateMessageAttachment(messageId, { status: 'complete', progress: 1, completedAt: Date.now() });
    } catch (e) {
      if (!(e instanceof TransferCancelledError)) {
        updateMessageAttachment(messageId, { status: 'failed' });
      }
    }
  };

  /**
   * Cancel an in-flight file transfer. Works from either side: the local
   * bubble flips to 'cancelled' immediately, the send loop (if ours) stops,
   * and the peer is told via an encrypted control packet.
   */
  const cancelTransfer = (messageId: string) => {
    const pm = getPeer();
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!pm || !msg?.attachment) return;
    const st = msg.attachment.status;
    if (st !== 'sending' && st !== 'receiving' && st !== 'interrupted' && st !== 'resuming' && st !== 'waiting') return;
    finishTransferRecord(msg.attachment.id, 'sent', 0, 'cancelled', { name: msg.attachment.name, kind: 'file' });
    updateMessageAttachment(messageId, { status: 'cancelled' });
    pm.cancelTransfer(msg.attachment.id);
  };

  /** Pause one of our in-flight uploads at the next chunk boundary. */
  const pauseTransfer = (messageId: string) => {
    const pm = getPeer();
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!pm || !msg?.attachment) return;
    if (msg.attachment.status !== 'sending') return;
    updateMessageAttachment(messageId, { status: 'paused' });
    pm.pauseTransfer(msg.attachment.id);
  };

  /** Resume a paused upload — the same send loop continues. */
  const resumeTransferById = (messageId: string) => {
    const pm = getPeer();
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!pm || !msg?.attachment) return;
    if (msg.attachment.status !== 'paused') return;
    updateMessageAttachment(messageId, { status: 'sending' });
    pm.resumeTransferById(msg.attachment.id);
  };

  /** Live rolling-window speed for an in-flight transfer (MessageCard). */
  const transferSpeedFor = useCallback((transferId: string) => {
    return lastSpeedReadings.current.get(transferId) ?? null;
  }, []);

  const clearRuntimeState = useCallback(() => {
    pendingFilesRef.current.clear();
    receivedIdsRef.current.clear();
    progressRef.current.clear();
    pushBuffersRef.current.clear();
  }, []);

  /**
   * Retry ONE failed recipient of a multi-recipient message. The content is
   * resent ONLY to this recipient — a fresh wire transfer id is minted so
   * the receiver's reassembly is clean; recipients that already succeeded
   * are never touched (idempotent by recipient id on the logical message).
   */
  const retryRecipient = async (messageId: string, recipientId: string): Promise<void> => {
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!msg) return;
    const recs = msg.attachment?.recipients ?? msg.textRecipients;
    const rec = recs?.find(r => r.recipientId === recipientId);
    if (!rec || (rec.state !== 'failed' && rec.state !== 'cancelled')) return;
    const setRecipientState = (patch: Partial<RecipientTransferPatch>) => {
      setSession(s => ({
        ...s,
        messages: s.messages.map(m => {
          if (m.id !== messageId) return m;
          const rs = m.attachment?.recipients ?? m.textRecipients;
          if (!rs) return m;
          const next = rs.map(r => r.recipientId === recipientId ? { ...r, ...patch } : r);
          return m.attachment
            ? { ...m, attachment: { ...m.attachment, recipients: next } }
            : { ...m, textRecipients: next };
        })
      }));
    };
    setRecipientState({ state: 'waiting', progress: 0, error: undefined, startedAt: Date.now() });
    const file = msg.attachment ? pendingFilesRef.current.get(messageId) : undefined;
    const ok = await schedulerRef.current.enqueue({
      opId: messageId + ':' + recipientId,
      recipientId,
      lane: file ? 'bulk' : 'control',
      run: async () => {
        const pm = await getOrCreateLink(recipientId);
        if (!pm) {
          setRecipientState({ state: 'failed', error: 'unavailable', completedAt: Date.now(), retryable: true });
          return;
        }
        const wireId = crypto.randomUUID();
        setSession(s => ({
          ...s,
          messages: s.messages.map(m => {
            if (m.id !== messageId || !m.attachment?.transferIds) return m;
            return { ...m, attachment: { ...m.attachment, transferIds: { ...m.attachment.transferIds, [recipientId]: wireId } } };
          })
        }));
        const myAttachment = msg.attachment
          ? { ...msg.attachment, id: wireId, url: undefined, recipients: undefined, transferIds: undefined }
          : undefined;
        const payloadMsg: ChatMessage = { ...msg, sender: 'partner', attachment: myAttachment, textRecipients: undefined };
        try {
          await pm.send(JSON.stringify(payloadMsg));
          if (file && myAttachment) await pm.sendFile(file, wireId);
          setRecipientState({ state: 'sent', progress: 1, completedAt: Date.now() });
        } catch (e) {
          if (e instanceof TransferCancelledError) {
            setRecipientState({ state: 'cancelled', completedAt: Date.now() });
          } else {
            setRecipientState({ state: 'failed', error: (e as Error)?.message?.slice(0, 80), completedAt: Date.now(), retryable: true });
          }
        }
      },
    });
    if (!ok) setRecipientState({ state: 'cancelled', completedAt: Date.now() });
  };

  /** Toggle our reaction under one message. Reactions are room-wide and
   *  attach to the message id (shared on the wire), so they land on every
   *  device's copy of that bubble regardless of who sent it. Returns nothing
   *  — the local toggle is instant, the wire is best-effort. */
  const reactToMessage = (messageId: string, emoji: string): void => {
    if (!messageId || emoji.length < 1 || emoji.length > 8) return;
    const msg = getRenderMessages().find(m => m.id === messageId);
    if (!msg) return;
    const mine = msg.reactions?.[emoji]?.mine ?? false;
    const on = !mine;
    setSession(s => ({
      ...s,
      messages: s.messages.map(m => m.id === messageId
        ? { ...m, reactions: applyReaction(m.reactions, emoji, { mine: on }) }
        : m),
    }));
    // Fan the toggle out to every live link — the classic single peer, plus
    // each seated participant in a multi-device room. Deduplicated by bound
    // id so a recipient never hears the same reaction twice.
    const told = new Set<string>();
    const direct = getPeer();
    if (direct && !direct.isDestroyed()) {
      if (direct.boundId) told.add(direct.boundId);
      try { direct.sendReaction(messageId, emoji, on); } catch { /* best-effort */ }
    }
    for (const e of roomRoster.otherEntries()) {
      if (told.has(e.id)) continue;
      const pm = getPeerForRecipient(e.id);
      if (!pm) continue;
      try { pm.sendReaction(messageId, emoji, on); } catch { /* best-effort */ }
    }
  };

  /** Cancel ONE recipient's leg of a multi-recipient message. Other legs
   *  keep moving; a slow device never holds the others hostage. */
  const cancelRecipient = (messageId: string, recipientId: string): void => {
    schedulerRef.current.cancelOp(messageId + ':' + recipientId);
    schedulerRef.current.cancelOp(messageId);
    const pm = getPeerForRecipient(recipientId);
    const msg = getRenderMessages().find(m => m.id === messageId);
    const wireId = msg?.attachment?.transferIds?.[recipientId];
    if (pm && wireId) pm.cancelTransfer(wireId);
    setSession(s => ({
      ...s,
      messages: s.messages.map(m => {
        if (m.id !== messageId) return m;
        const rs = m.attachment?.recipients ?? m.textRecipients;
        if (!rs) return m;
        const next = rs.map(r => r.recipientId === recipientId && (r.state === 'pending' || r.state === 'waiting' || r.state === 'sending')
          ? { ...r, state: 'cancelled' as const, completedAt: Date.now() }
          : r);
        return m.attachment
          ? { ...m, attachment: { ...m.attachment, recipients: next } }
          : { ...m, textRecipients: next };
      })
    }));
  };

  return {
    updateMessageAttachment,
    wirePeerHandlers,
    handleChannelOpen,
    handlePushMessage,
    sendMessage,
    retryText,
    retryTransfer,
    cancelTransfer,
    pauseTransfer,
    resumeTransferById,
    transferSpeedFor,
    clearRuntimeState,
    setPcm,
    retryRecipient,
    cancelRecipient,
    reactToMessage,
  };
}
