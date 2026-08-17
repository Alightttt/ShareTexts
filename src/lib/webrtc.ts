import { getSocket } from './socket';
import { encryptText, decryptText, generateKey, encryptBinaryChunk, decryptBinaryChunk } from './crypto';
import { uuidToBytes, bytesToUuid } from './binaryUtils';
import { diag } from './diag';
import type { ChunkEnvelope } from './protocol';

type SignalData = { type: 'offer' | 'answer'; sdp: string } | { type: 'candidate'; candidate: RTCIceCandidateInit };

/** The on-the-wire chunk envelope (see protocol.ts). Text transfers use this
 *  JSON form; file transfers use the compact binary variant. */
export type TransferPayload = ChunkEnvelope;

const CHUNK_SIZE = 64 * 1024; // 64 KB
// 4 GB ceiling. Files stream in 64KB slices (never whole-file arrayBuffers),
// so the sender's memory stays flat. The receiver assembles chunks in RAM for
// files under OPFS_THRESHOLD; anything larger streams straight to the Origin
// Private File System (disk-backed) chunk by chunk, so a multi-GB movie lands
// on a phone without ever filling its memory. Where OPFS isn't available the
// in-memory path still works up to ~2 GB on a desktop.
const MAX_TRANSFER_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB max total
const MAX_CHUNKS = Math.ceil(MAX_TRANSFER_SIZE / CHUNK_SIZE);
const OFFER_RETRY_DELAY = 4000;
const OFFER_RETRY_MAX = 3;

/**
 * Receive path threshold: files at or above this size stream to disk via OPFS
 * instead of accumulating 64KB buffers in RAM. Chosen low enough that even a
 * 1 GB phone can receive a full-length movie without pressure.
 */
const OPFS_THRESHOLD = 64 * 1024 * 1024;

interface OpfsSink {
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
  bitmap: Uint8Array; // 1 = chunk sequence already written
}

/**
 * Whether this browser can stream large receives to disk. The File System
 * Access API (OPFS) is available in every evergreen browser (Chrome 86+,
 * Edge, Firefox 111+, Safari 15.2+); anything else falls back to memory.
 */
function canStreamToOpfs(): boolean {
  try {
    return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
  } catch {
    return false;
  }
}

async function openOpfsSink(transferId: string, totalChunks: number): Promise<OpfsSink> {
  const dir = await navigator.storage.getDirectory();
  const handle = await dir.getFileHandle(`sharetext-${transferId}.bin`, { create: true });
  const writable = await handle.createWritable();
  return { handle, writable, bitmap: new Uint8Array(totalChunks) };
}

/** Clean up a completed/cancelled OPFS sink — close the stream, delete the file. */
async function closeOpfsSink(sink: OpfsSink | null | undefined) {
  if (!sink) return;
  try { await sink.writable.close(); } catch { /* already closed */ }
  try { await (sink.handle as any).remove({ recursive: false }); } catch { /* already gone */ }
}

/**
 * Completed OPFS files stay on disk until their blob URL is done being used;
 * a one-shot timer sweeps them a few minutes later so the browser's OPFS
 * quota never fills with finished transfers. Tracked per sink so a sweep
 * only touches its own file.
 */
function scheduleOpfsSweep(sink: OpfsSink) {
  setTimeout(() => { void closeOpfsSink(sink); }, 5 * 60 * 1000);
}

/**
 * The contiguous received prefix (first missing index). `received` is a
 * COUNT — with out-of-order arrival (dc + relay interleave) it is NOT a safe
 * resume position. Only everything below the first hole is guaranteed present,
 * so acks must report the prefix, never the raw count.
 */
function firstMissing(chunks: ArrayBuffer[]): number {
  let i = 0;
  while (i < chunks.length && chunks[i]) i++;
  return i;
}

/** Same prefix computation for the OPFS disk-backed bitmap. */
function firstMissingBitmap(bitmap: Uint8Array): number {
  let i = 0;
  while (i < bitmap.length && bitmap[i]) i++;
  return i;
}

/**
 * Transfer state lives OUTSIDE PeerManager instances. WebRTC teardown on a
 * reconnect (peer re-offer) destroys the old PeerManager — if the partially
 * received chunks lived on the instance they would be lost and a reconnect
 * could never resume, only restart from zero.
 */
interface PartialReceive {
  chunks: ArrayBuffer[] | null;
  /** When set, chunks stream to OPFS (disk) instead of RAM; `chunks` stays null. */
  opfs: OpfsSink | null;
  /** Resolves once the receive sink (OPFS or memory) is ready for writes. */
  ready: Promise<void>;
  received: number;
  total: number;
  updatedAt: number;
}
const partialReceives = new Map<string, PartialReceive>();
const MAX_PARTIALS = 4;

interface SendProgress {
  sentUpTo: number;   // chunks the local loop has pushed this connection
  total: number;
  acked: number;      // last position the peer confirmed (via ack packets)
  updatedAt: number;
}
const sendProgress = new Map<string, SendProgress>();
const ackWaiters = new Map<string, (received: number) => void>();

/** Whether a binary transfer is mid-flight on the sending side. */
export function hasSendProgress(transferId: string): boolean {
  const p = sendProgress.get(transferId);
  return !!p && p.sentUpTo > 0;
}

/** The last position the peer confirmed, for retry/resume decisions. */
export function getAckedPosition(transferId: string): number {
  return sendProgress.get(transferId)?.acked ?? 0;
}

/**
 * Drop a stale partial receive (room closed, peer gone). Called by the app
 * when a session resets so memory isn't held forever.
 */
export function clearTransferState(transferId: string) {
  const p = partialReceives.get(transferId);
  // Only clean up disk sinks that never completed — a finished OPFS file's
  // blob URL may still be live for the user to download.
  if (p?.opfs && p.received < p.total) void closeOpfsSink(p.opfs);
  partialReceives.delete(transferId);
  sendProgress.delete(transferId);
  ackWaiters.delete(transferId);
}

/** Forget all transfer state — used on full session reset. */
export function clearAllTransferState() {
  diag('transfer.state_cleared', true, `${partialReceives.size} partials, ${sendProgress.size} sends`);
  for (const p of partialReceives.values()) {
    if (p.opfs && p.received < p.total) void closeOpfsSink(p.opfs);
  }
  partialReceives.clear();
  sendProgress.clear();
  ackWaiters.clear();
}

/** Dev/diagnostic view of a partial receive — which sequences are missing. */
export function getPartialInfo(transferId: string): { received: number; total: number; missing: number[] } | null {
  const p = partialReceives.get(transferId);
  if (!p) return null;
  const missing: number[] = [];
  for (let i = 0; i < p.total; i++) {
    if (p.opfs ? !p.opfs.bitmap[i] : !p.chunks![i]) missing.push(i);
  }
  return { received: p.received, total: p.total, missing: missing.slice(0, 20) };
}

/** Thrown by a send loop that was cancelled (distinct from a network failure). */
export class TransferCancelledError extends Error {
  constructor() {
    super('Transfer cancelled');
    this.name = 'TransferCancelledError';
  }
}

export class PeerManager {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private roomId: string;
  private peerId: string | null = null;
  private secret: string;
  private cryptoKey: CryptoKey | null = null;
  private cryptoPromise: Promise<CryptoKey>;
  private destroyed = false;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private relayFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  public onMessage: ((data: string) => void) | null = null;
  public onFileProgress: ((transferId: string, progress: number, total: number) => void) | null = null;
  public onFileComplete: ((transferId: string, blob: Blob) => void) | null = null;
  public onCancel: ((transferId: string) => void) | null = null;
  public onConnectionTypeChange: ((type: 'local' | 'direct' | 'relay') => void) | null = null;
  public onDisconnect: (() => void) | null = null;
  public onHello: ((name: string) => void) | null = null;
  public onOpen: (() => void) | null = null;
  /** A chat message we sent was confirmed received by the peer (true ack). */
  public onReceipt: ((messageId: string) => void) | null = null;
  /** A chat message we sent was SEEN by the peer — their room is open with
   *  it on screen (true read receipt, distinct from mere arrival). */
  public onSeen: ((messageId: string) => void) | null = null;

  private isRelayFallback = false;
  private iceCandidatesQueue: RTCIceCandidateInit[] = [];

  private incomingTextTransfers: Map<string, { chunks: string[]; received: number; total: number }> = new Map();
  /** Abort handles for in-flight file sends, keyed by transfer id. */
  private transferControllers = new Map<string, AbortController>();

  constructor(roomId: string, secret: string, isInitiator: boolean) {
    this.roomId = roomId;
    this.secret = secret;
    // Register signaling listeners SYNCHRONOUSLY. The peer's offer can arrive
    // while crypto is still being derived; if we waited, we would miss it and
    // the two devices would hang on "Connecting..." forever.
    this.setupSocketListeners();
    this.cryptoPromise = this.initCrypto();
    void isInitiator;
  }

  private async initCrypto(): Promise<CryptoKey> {
    const key = await generateKey(this.secret);
    this.cryptoKey = key;
    return key;
  }

  private async waitForCrypto(): Promise<CryptoKey> {
    return this.cryptoPromise;
  }

  public initiateConnection(peerId: string) {
    if (this.destroyed) return;
    this.peerId = peerId;
    diag('webrtc.initiate', true, `to ${(peerId || '').slice(0, 8)}`);
    this.createPeerConnection();
    this.dc = this.pc!.createDataChannel('chat', { negotiated: false });
    this.setupDataChannel(this.dc);

    this.sendOffer();

    // If the peer never answers (lost signal, transient drop), tear down and
    // re-offer. Only the initiating side retries, so no SDP glare is created.
    let attempts = 0;
    this.retryTimer = setInterval(() => {
      if (this.destroyed || !this.peerId) {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      if (this.dc && this.dc.readyState === 'open') {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      attempts++;
      if (attempts >= OFFER_RETRY_MAX) {
        if (this.retryTimer) clearInterval(this.retryTimer);
        return;
      }
      this.teardownPeerConnection();
      this.createPeerConnection();
      this.dc = this.pc!.createDataChannel('chat', { negotiated: false });
      this.setupDataChannel(this.dc);
      this.sendOffer();
    }, OFFER_RETRY_DELAY);
  }

  private teardownPeerConnection() {
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.ondatachannel = null;
      try { this.pc.close(); } catch { /* noop */ }
    }
    this.pc = null;
    this.dc = null;
  }

  private sendOffer() {
    if (!this.pc || !this.peerId) return;
    this.pc.createOffer()
      .then(offer => this.pc!.setLocalDescription(offer))
      .then(() => {
        if (this.destroyed || !this.pc?.localDescription) return;
        getSocket().emit('signal', {
          roomId: this.roomId,
          to: this.peerId,
          signal: { type: 'offer', sdp: this.pc.localDescription.sdp }
        });
        diag('webrtc.offer_sent', true, `to ${(this.peerId || '').slice(0, 8)}`);
      })
      .catch(() => { /* connection may have been torn down */ });
  }

  private createPeerConnection() {
    if (this.destroyed) return;
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.peerId) {
        getSocket().emit('signal', {
          roomId: this.roomId,
          to: this.peerId,
          signal: { type: 'candidate', candidate: event.candidate.toJSON() }
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === 'connected') {
        this.determineConnectionType();
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        if (this.pc.connectionState === 'failed') diag('webrtc.ice_failed', false);
        if (this.onDisconnect && this.pc.connectionState !== 'closed') this.onDisconnect();
      }
    };

    this.pc.ondatachannel = (event) => {
      this.dc = event.channel;
      this.setupDataChannel(this.dc);
    };
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this.isRelayFallback = false;
      diag('webrtc.channel_open', true);
      this.determineConnectionType();
      void this.sendHello();
      if (this.onOpen) this.onOpen();
    };
    channel.onmessage = (event) => {
      void this.handleIncomingData(event.data);
    };
    channel.onclose = () => {
      diag('webrtc.channel_closed', true);
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  private setupSocketListeners() {
    const socket = getSocket();

    socket.on('signal', async ({ from, signal }) => {
      if (this.destroyed) return;
      if (!this.peerId) this.peerId = from;

      if (!this.pc) {
        this.createPeerConnection();
      } else if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
        // A stale connection from a previous attempt — rebuild so we can
        // accept a fresh offer (e.g. after the peer recovered).
        this.teardownPeerConnection();
        this.createPeerConnection();
      }

      try {
        if (signal.type === 'offer') {
          diag('webrtc.offer_received', true, `from ${(from || '').slice(0, 8)}`);
          // Handle SDP glare defensively (both sides offered) by rolling back
          // our local offer before accepting theirs.
          if (this.pc!.signalingState !== 'stable') {
            try {
              await this.pc!.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
            } catch { /* already stable */ }
          }
          await this.pc!.setRemoteDescription(new RTCSessionDescription(signal as RTCSessionDescriptionInit));

          for (const candidate of this.iceCandidatesQueue) {
            try { await this.pc!.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* stale */ }
          }
          this.iceCandidatesQueue = [];

          const answer = await this.pc!.createAnswer();
          await this.pc!.setLocalDescription(answer);
          socket.emit('signal', {
            roomId: this.roomId,
            to: from,
            signal: { type: 'answer', sdp: this.pc!.localDescription!.sdp }
          });
          diag('webrtc.answer_sent', true, `to ${(from || '').slice(0, 8)}`);
        } else if (signal.type === 'answer') {
          diag('webrtc.answer_received', true, `from ${(from || '').slice(0, 8)}`);
          await this.pc!.setRemoteDescription(new RTCSessionDescription(signal as RTCSessionDescriptionInit));
        } else if (signal.type === 'candidate') {
          if (this.pc!.remoteDescription) {
            try { await this.pc!.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch { /* stale */ }
          } else {
            this.iceCandidatesQueue.push(signal.candidate);
          }
        }
      } catch (e) {
        // Signaling is best-effort; the initiator retry loop recovers.
      }
    });

    socket.on('relay_message', ({ data }) => {
      if (this.destroyed) return;
      void this.handleIncomingData(data);
    });

    // Fallback: if WebRTC never opens, switch the connection badge to relay.
    // Only surface the partner as reachable if a peer has actually joined
    // (peerId set) — a creator waiting alone must stay on the pairing screen.
    this.relayFallbackTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (!this.dc || this.dc.readyState !== 'open') {
        this.isRelayFallback = true;
        diag('webrtc.relay_fallback', true);
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
        if (this.peerId && this.onOpen) this.onOpen();
      }
    }, 10000);
  }

  public expectBinaryTransfer(transferId: string, totalChunks: number) {
    const existing = partialReceives.get(transferId);
    const totalBytes = totalChunks * CHUNK_SIZE;
    // Stream to disk for large files when the browser supports it; small files
    // stay in RAM (faster, no OPFS cleanup needed). This is what lets a phone
    // receive a multi-GB movie: the file never accumulates in memory.
    const useOpfs = totalBytes >= OPFS_THRESHOLD && canStreamToOpfs();
    if (!existing || existing.total !== totalChunks || !!existing.opfs !== useOpfs) {
      let resolveReady!: () => void;
      const ready = new Promise<void>(r => { resolveReady = r; });
      const rec: PartialReceive = useOpfs
        ? { chunks: null, opfs: null, ready, received: 0, total: totalChunks, updatedAt: Date.now() }
        : { chunks: new Array(totalChunks), opfs: null, ready, received: 0, total: totalChunks, updatedAt: Date.now() };
      if (useOpfs) {
        // Fire the sink open asynchronously; the first chunk handler awaits
        // `ready` before writing, so nothing is lost to the race.
        openOpfsSink(transferId, totalChunks).then(sink => {
          rec.opfs = sink;
          resolveReady();
        }).catch(() => {
          // OPFS failed (quota?) — fall back to memory.
          rec.opfs = null;
          rec.chunks = new Array(totalChunks);
          resolveReady();
        });
      } else {
        resolveReady();
      }
      partialReceives.set(transferId, rec);
    } else {
      existing.updatedAt = Date.now();
    }
    // Bound memory: keep only the newest few partials (LRU by touch time).
    // A completed OPFS entry is left in place (its blob URL may be live) —
    // only incomplete disk sinks are closed + removed on eviction.
    if (partialReceives.size > MAX_PARTIALS) {
      const oldest = [...partialReceives.entries()]
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (oldest) {
        const [id, rec] = oldest;
        if (rec.opfs && rec.received < rec.total) void closeOpfsSink(rec.opfs);
        partialReceives.delete(id);
      }
    }
  }

  private async handleIncomingData(data: string | ArrayBuffer) {
    if (!this.cryptoKey) {
      await this.waitForCrypto();
    }

    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data) as TransferPayload;
        if (parsed.type === 'chunk') {
          if (parsed.version !== 1) return;
          if (parsed.total > MAX_CHUNKS || parsed.total <= 0) return;
          if (!Number.isInteger(parsed.sequence) || parsed.sequence < 0 || parsed.sequence >= parsed.total) return;
          if (typeof parsed.payload !== 'string') return;

          let transfer = this.incomingTextTransfers.get(parsed.transferId);
          if (!transfer) {
            transfer = { chunks: new Array(parsed.total), received: 0, total: parsed.total };
            this.incomingTextTransfers.set(parsed.transferId, transfer);
          }

          if (!transfer.chunks[parsed.sequence]) {
            transfer.chunks[parsed.sequence] = parsed.payload;
            transfer.received++;

            if (transfer.received === transfer.total) {
              const fullEncryptedText = transfer.chunks.join('');
              this.incomingTextTransfers.delete(parsed.transferId);
              try {
                const decrypted = await decryptText(fullEncryptedText, this.cryptoKey);
                const inner = JSON.parse(decrypted);
                if (inner && inner.type === 'hello') {
                  if (this.onHello && typeof inner.name === 'string') this.onHello(inner.name);
                  return;
                }
                if (inner && inner.type === 'cancel' && typeof inner.transferId === 'string') {
                  // The peer stopped a transfer. Drop our partial receive, stop
                  // our own send loop if it's mid-flight, and tell the UI.
                  diag('transfer.cancelled', true, inner.transferId.slice(0, 8));
                  partialReceives.delete(inner.transferId);
                  sendProgress.delete(inner.transferId);
                  this.transferControllers.get(inner.transferId)?.abort();
                  if (this.onCancel) this.onCancel(inner.transferId);
                  return;
                }
                if (inner && inner.type === 'ack' && typeof inner.transferId === 'string' && typeof inner.received === 'number') {
                  // The peer confirmed receiving up to `received` chunks — the
                  // resume floor. Also wakes a waiting resumeTransfer.
                  const p = sendProgress.get(inner.transferId);
                  if (p) p.acked = Math.max(p.acked, inner.received);
                  const waiter = ackWaiters.get(inner.transferId);
                  if (waiter) {
                    ackWaiters.delete(inner.transferId);
                    waiter(inner.received);
                  }
                  return;
                }
                if (inner && inner.type === 'resume_query' && typeof inner.transferId === 'string') {
                  // The peer is re-sending a transfer after a reconnect and
                  // wants to know where to start. Answer with our contiguous
                  // prefix — the first missing index is the safe resume point
                  // (works for both the RAM and OPFS disk-backed paths).
                  const partial = partialReceives.get(inner.transferId);
                  const prefix = partial
                    ? partial.opfs
                      ? firstMissingBitmap(partial.opfs.bitmap)
                      : partial.chunks ? firstMissing(partial.chunks) : 0
                    : 0;
                  void this.sendControl({
                    type: 'ack',
                    transferId: inner.transferId,
                    received: prefix
                  });
                  return;
                }
                if (inner && inner.type === 'receipt' && typeof inner.messageId === 'string') {
                  // A peer confirmed it received one of our chat messages.
                  if (this.onReceipt) this.onReceipt(inner.messageId);
                  return;
                }
                if (inner && inner.type === 'seen' && typeof inner.messageId === 'string') {
                  // A peer confirmed one of our messages is on their screen.
                  if (this.onSeen) this.onSeen(inner.messageId);
                  return;
                }
                if (this.onMessage) this.onMessage(decrypted);
              } catch (e) {
                console.error("Failed to decrypt text");
              }
            }
          }
          return;
        }
        // Plain (unstructured) text message — handled below.
        if (this.onMessage) this.onMessage(data);
      } catch (e) {
        if (this.onMessage) this.onMessage(data);
      }
    } else if (data instanceof ArrayBuffer) {
      // Binary chunk
      if (data.byteLength < 20) return;
      const view = new DataView(data);
      const transferIdBytes = new Uint8Array(data, 0, 16);
      const transferId = bytesToUuid(transferIdBytes);
      const sequence = view.getUint32(16, true);
      const payload = data.slice(20);

      let transfer = partialReceives.get(transferId);
      if (!transfer) {
        // Expected to be pre-registered via metadata message
        return;
      }
      if (sequence < 0 || sequence >= transfer.total) return;
      await transfer.ready;

      // Disk-backed path: mark the bitmap and stream the decrypted chunk to
      // the OPFS file at its byte offset. Out-of-order arrival is fine —
      // position-based writes land wherever they belong.
      if (transfer.opfs) {
        const opfs = transfer.opfs;
        if (opfs.bitmap[sequence]) return; // duplicate
        try {
          const decrypted = await decryptBinaryChunk(payload, this.cryptoKey);
          await opfs.writable.write({ type: 'write', position: sequence * CHUNK_SIZE, data: decrypted });
          opfs.bitmap[sequence] = 1;
          transfer.received++;
          transfer.updatedAt = Date.now();

          if (this.onFileProgress) {
            this.onFileProgress(transferId, transfer.received, transfer.total);
          }
          if (transfer.received % 32 === 0) {
            void this.sendControl({ type: 'ack', transferId, received: firstMissingBitmap(opfs.bitmap) });
          }
          if (transfer.received % 64 === 0) diag('transfer.received', true, `${transfer.received}/${transfer.total}`);

          if (transfer.received === transfer.total) {
            diag('transfer.received_complete', true, transferId.slice(0, 8));
            try {
              await opfs.writable.close();
              // Grab the finished file from disk — the File is disk-backed, so
              // a multi-GB blob costs no extra RAM on this device. The blob URL
              // keeps the File alive for download; the sweep removes the OPFS
              // backing after a grace period so the browser's storage quota
              // isn't eaten by finished transfers.
              const file = await opfs.handle.getFile();
              transfer.updatedAt = Date.now();
              scheduleOpfsSweep(opfs);
              if (this.onFileComplete) this.onFileComplete(transferId, file);
            } catch (e) {
              console.error("Failed to finalize OPFS receive", e);
            }
          }
        } catch (e) {
          console.error("Failed to decrypt binary chunk", e);
        }
        return;
      }

      if (transfer.chunks && !transfer.chunks[sequence]) {
        try {
          const decrypted = await decryptBinaryChunk(payload, this.cryptoKey);
          transfer.chunks[sequence] = decrypted;
          transfer.received++;
          transfer.updatedAt = Date.now();

          if (this.onFileProgress) {
            this.onFileProgress(transferId, transfer.received, transfer.total);
          }

          // Confirm progress to the sender every 32 chunks (~2 MB) so a
          // reconnect resumes from where the peer actually has data. The ack
          // is the contiguous prefix (first missing index) — a count can
          // overstate the safe resume position when chunks arrived out of
          // order, leaving a permanent hole.
          if (transfer.received % 32 === 0) {
            void this.sendControl({ type: 'ack', transferId, received: firstMissing(transfer.chunks) });
          }

          if (transfer.received % 64 === 0) diag('transfer.received', true, `${transfer.received}/${transfer.total}`);

          if (transfer.received === transfer.total) {
            diag('transfer.received_complete', true, transferId.slice(0, 8));
            const blob = new Blob(transfer.chunks);
            partialReceives.delete(transferId);
            if (this.onFileComplete) {
              this.onFileComplete(transferId, blob);
            }
          }
        } catch (e) {
          console.error("Failed to decrypt binary chunk", e);
        }
      }
    }
  }

  private determineConnectionType() {
    if (!this.pc || this.pc.connectionState !== 'connected') return;

    this.pc.getStats().then(stats => {
      let activeCandidatePair: any = null;
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          activeCandidatePair = report;
        }
      });

      if (activeCandidatePair) {
        const localCandidate = stats.get(activeCandidatePair.localCandidateId);
        if (localCandidate && localCandidate.candidateType === 'host') {
          if (this.onConnectionTypeChange) this.onConnectionTypeChange('local');
        } else {
          if (this.onConnectionTypeChange) this.onConnectionTypeChange('direct');
        }
      } else {
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('direct');
      }
    });
  }

  private async sendHello() {
    try {
      const name = typeof window !== 'undefined'
        ? (window.localStorage.getItem('sharetext.deviceName') || undefined)
        : undefined;
      const key = await this.waitForCrypto();
      if (!this.peerId) return;
      const hello = JSON.stringify({ type: 'hello', name: name || 'Guest Device' });
      const encrypted = await encryptText(hello, key);
      const transferId = crypto.randomUUID();
      const packet: TransferPayload = {
        version: 1,
        type: 'chunk',
        transferId,
        sequence: 0,
        total: 1,
        payload: encrypted
      };
      const serialized = JSON.stringify(packet);
      if (this.dc && this.dc.readyState === 'open') {
        this.dc.send(serialized);
      } else {
        getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
      }
    } catch { /* hello is best-effort */ }
  }

  public async send(text: string) {
    const key = await this.waitForCrypto();
    if (!key) return;

    const encrypted = await encryptText(text, key);
    const transferId = crypto.randomUUID();

    const numChunks = Math.ceil(encrypted.length / CHUNK_SIZE);

    for (let i = 0; i < numChunks; i++) {
      const payload = encrypted.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const packet: TransferPayload = {
        version: 1,
        type: 'chunk',
        transferId,
        sequence: i,
        total: numChunks,
        payload
      };

      const serialized = JSON.stringify(packet);

      if (this.dc && this.dc.readyState === 'open') {
        if (this.dc.bufferedAmount > 1024 * 1024) {
          const drained = await this.waitForDrain(1024 * 1024, 512 * 1024, 6000);
          if (!drained) this.isRelayFallback = true;
        }
        if (this.dc.readyState === 'open') {
          this.dc.send(serialized);
        } else {
          getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
        }
      } else {
        this.isRelayFallback = true;
        if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
        getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
      }
    }
  }

  /**
   * Stop an in-flight transfer (local loop + peer side). Safe to call from
   * either side: aborts the local send loop, drops a partial receive, and
   * tells the peer via an encrypted control packet.
   */
  public cancelTransfer(transferId: string) {
    this.transferControllers.get(transferId)?.abort();
    partialReceives.delete(transferId);
    sendProgress.delete(transferId);
    this.incomingTextTransfers.delete(transferId);
    void this.sendControl({ type: 'cancel', transferId });
  }

  /** Send a tiny encrypted control packet (hello/cancel) via channel or relay. */
  private async sendControl(payload: { type: string; [k: string]: unknown }) {
    try {
      const key = await this.waitForCrypto();
      const encrypted = await encryptText(JSON.stringify(payload), key);
      const packet: TransferPayload = {
        version: 1,
        type: 'chunk',
        transferId: crypto.randomUUID(),
        sequence: 0,
        total: 1,
        payload: encrypted
      };
      const serialized = JSON.stringify(packet);
      if (this.dc && this.dc.readyState === 'open') {
        this.dc.send(serialized);
      } else {
        getSocket().emit('relay_message', { roomId: this.roomId, data: serialized });
      }
    } catch { /* cancel is best-effort */ }
  }

  /**
   * Tell the peer that one of their chat messages arrived on this device.
   * Encrypted end-to-end like every other packet, over the channel or relay.
   */
  public sendReceipt(messageId: string) {
    void this.sendControl({ type: 'receipt', messageId });
  }

  /**
   * Tell the peer that one of their messages is ON SCREEN on this device
   * (the room is open and the message is rendered). A true read receipt —
   * sent only when the ChatView is actually mounted, never pre-emptively.
   */
  public sendSeen(messageId: string) {
    void this.sendControl({ type: 'seen', messageId });
  }

  /**
   * Send a file, optionally resuming from a chunk index. The receiver stores
   * chunks by sequence and dedupes, so re-sending from a confirmed position
   * (rather than zero) is safe even if the peer already holds earlier chunks.
   */
  public async sendFile(file: File, transferId: string, startIndex = 0) {
    const key = await this.waitForCrypto();
    if (!key) return;
    const numChunks = Math.ceil(file.size / CHUNK_SIZE);
    const start = Math.max(0, Math.min(startIndex, numChunks - 1));
    const transferIdBytes = uuidToBytes(transferId);
    const controller = new AbortController();
    this.transferControllers.set(transferId, controller);
    const signal = controller.signal;
    const prog: SendProgress = sendProgress.get(transferId) ?? { sentUpTo: 0, total: numChunks, acked: 0, updatedAt: Date.now() };
    prog.total = numChunks;
    prog.updatedAt = Date.now();
    sendProgress.set(transferId, prog);
    diag('transfer.start', true, `${file.name} (${file.size}b) from chunk ${start}/${numChunks}`);
    // If the channel's flow control wedges (bufferedAmount stuck), fall back
    // to the relay for the rest of this transfer instead of hanging forever.
    let wedged = false;

    try {
      for (let i = start; i < numChunks; i++) {
        if (signal.aborted) throw new TransferCancelledError();
        const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const arrayBuffer = await chunk.arrayBuffer();
        const encrypted = await encryptBinaryChunk(arrayBuffer, key);

        const packet = new Uint8Array(20 + encrypted.byteLength);
        packet.set(transferIdBytes, 0);
        const view = new DataView(packet.buffer);
        view.setUint32(16, i, true);
        packet.set(new Uint8Array(encrypted), 20);

        if (!wedged && this.dc && this.dc.readyState === 'open') {
          if (this.dc.bufferedAmount > 2 * 1024 * 1024) {
            // Bounded wait: a channel that dropped (or whose flow control
            // wedged) mid-wait must not hang the loop forever. Give it a few
            // seconds, then finish this transfer over the relay.
            const drained = await this.waitForDrain(2 * 1024 * 1024, 1 * 1024 * 1024, 6000);
            if (!drained) {
              wedged = true;
              diag('transfer.dc_wedged', true, `chunk ${i} — finishing via relay`);
            }
          }
        }
        if (!wedged && this.dc && this.dc.readyState === 'open') {
          this.dc.send(packet.buffer);
        } else {
          this.isRelayFallback = true;
          if (this.onConnectionTypeChange) this.onConnectionTypeChange('relay');
          getSocket().emit('relay_message', { roomId: this.roomId, data: packet.buffer });
        }

        prog.sentUpTo = i + 1;
        prog.updatedAt = Date.now();
        if (i % 64 === 0) diag('transfer.sent', true, `${i}/${numChunks}`);
        if (this.onFileProgress) {
          this.onFileProgress(transferId, i + 1, numChunks);
        }
      }
      diag('transfer.complete', true, file.name);
    } finally {
      this.transferControllers.delete(transferId);
      if (!signal.aborted) sendProgress.delete(transferId);
    }
  }

  /**
   * Wait for the data channel's send buffer to drain below `min` bytes.
   * Resolves false after `maxMs` or when the channel is no longer open, so
   * the caller can fall back to the relay instead of hanging.
   */
  private waitForDrain(above: number, min: number, maxMs: number): Promise<boolean> {
    return new Promise(resolve => {
      const started = Date.now();
      const check = () => {
        if (this.destroyed || !this.dc || this.dc.readyState !== 'open') { resolve(false); return; }
        if (this.dc.bufferedAmount <= min) { resolve(true); return; }
        if (Date.now() - started > maxMs) { resolve(false); return; }
        setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * Resume an interrupted binary transfer after a reconnect: re-send the
   * metadata packet (so the peer re-registers the expectation, preserving
   * whatever it already received), ask the peer where it is, then send from
   * that confirmed position.
   */
  public async resumeTransfer(metadataJson: string, file: File, transferId: string) {
    await this.send(metadataJson);
    const known = sendProgress.get(transferId)?.acked ?? 0;
    const start = await new Promise<number>((resolve) => {
      let settled = false;
      const finish = (n: number) => { if (!settled) { settled = true; ackWaiters.delete(transferId); resolve(n); } };
      const timer = setTimeout(() => finish(known), 2500);
      ackWaiters.set(transferId, (n) => { clearTimeout(timer); finish(n); });
      void this.sendControl({ type: 'resume_query', transferId });
    });
    diag('transfer.resuming', true, `from chunk ${start}`);
    await this.sendFile(file, transferId, start);
  }

  /** Test/debug hook — the underlying RTCPeerConnection (never the secret). */
  public getPc(): RTCPeerConnection | null {
    return this.pc;
  }

  /** Test/debug hook — the live data channel, for simulating a drop. */
  public getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  public destroy() {
    this.destroyed = true;
    this.transferControllers.forEach(c => c.abort());
    this.transferControllers.clear();
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.relayFallbackTimer) clearTimeout(this.relayFallbackTimer);
    if (this.dc) {
      try { this.dc.close(); } catch { /* noop */ }
    }
    if (this.pc) {
      try { this.pc.close(); } catch { /* noop */ }
    }

    const socket = getSocket();
    socket.off('signal');
    socket.off('relay_message');
  }
}
