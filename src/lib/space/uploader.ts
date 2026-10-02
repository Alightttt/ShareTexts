/**
 * SpaceUploader — resilient file uploads for Temporary Spaces (F14).
 *
 * Two paths, chosen by the server at init:
 *   · direct   (≤90 MB): one streaming PUT (the File body is streamed by the
 *     browser — never buffered whole in JS).
 *   · multipart (>90 MB): File.slice parts upload with BOUNDED concurrency
 *     (3), each part retryable independently, with pause / resume / cancel
 *     and server-side resume state (which parts already arrived).
 *
 * Integrity: a SHA-256 digest is computed with an incremental implementation
 * (WebCrypto has no streaming digest) while reading the file in chunks —
 * memory-safe for huge files. The server verifies the received bytes against
 * it before the item goes READY; a mismatch fails the upload honestly
 * instead of publishing broken content. Real progress only: bytes the
 * server acknowledged. No fake completion.
 */

import { initFile, uploadStatus, spaceApiBase, localCreds, headers } from './api';
import type { SpaceItem } from './types';

export type UploadPhase = 'preparing' | 'uploading' | 'verifying' | 'ready' | 'failed' | 'cancelled' | 'paused';

export interface UploadProgress {
  phase: UploadPhase;
  /** Bytes the server has acknowledged. */
  sent: number;
  size: number;
  /** Which path the server chose (known after init). */
  mode?: 'direct' | 'multipart';
  /** 0…1 while phase === 'preparing' (integrity digest being computed). */
  prepare?: number;
  error?: string;
}

export interface UploadHandle {
  readonly itemId: string;
  pause(): void;
  resume(): void;
  cancel(): void;
}

const PART_CONCURRENCY = 3;
const PART_RETRIES = 4;

// ── incremental SHA-256 (pure JS — WebCrypto can't stream) ───────────────

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

class Sha256 {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private lengthLo = 0; // total bytes, split into two 32-bit halves
  private lengthHi = 0;

  update(data: Uint8Array): this {
    let i = 0;
    this.lengthLo += data.length;
    if (this.lengthLo >= 0x100000000) { this.lengthHi += 1; this.lengthLo -= 0x100000000; }
    if (this.bufLen > 0) {
      const take = Math.min(64 - this.bufLen, data.length);
      this.buf.set(data.subarray(0, take), this.bufLen);
      this.bufLen += take;
      i = take;
      if (this.bufLen === 64) { this.block(this.buf); this.bufLen = 0; }
    }
    while (i + 64 <= data.length) {
      this.block(data.subarray(i, i + 64));
      i += 64;
    }
    if (i < data.length) {
      this.buf.set(data.subarray(i), 0);
      this.bufLen = data.length - i;
    }
    return this;
  }

  hex(): string {
    // Padding: 0x80, zeros, 8-byte big-endian bit length.
    const bitsHi = (this.lengthHi * 8 + ((this.lengthLo / 0x20000000) | 0)) >>> 0; // lengthHi*8 may carry low bits
    const bitsLo = (this.lengthLo << 3) >>> 0;
    const pad = new Uint8Array(((this.bufLen < 56 ? 56 : 120) - this.bufLen) + 8);
    pad[0] = 0x80;
    const dv = new DataView(pad.buffer);
    dv.setUint32(pad.length - 8, bitsHi);
    dv.setUint32(pad.length - 4, bitsLo);
    this.update(pad.subarray(0, pad.length)); // NB: update() counts bytes — padding must not change length
    // Undo the length accounting done by the padding update.
    this.lengthLo = bitsLo >>> 3; this.lengthHi = 0; void this.lengthHi;
    let out = '';
    for (const w of this.h) out += w.toString(16).padStart(8, '0');
    return out;
  }

  private block(p: Uint8Array) {
    const w = new Uint32Array(64);
    const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const hh = this.h;
    hh[0] = (hh[0] + a) >>> 0; hh[1] = (hh[1] + b) >>> 0; hh[2] = (hh[2] + c) >>> 0; hh[3] = (hh[3] + d) >>> 0;
    hh[4] = (hh[4] + e) >>> 0; hh[5] = (hh[5] + f) >>> 0; hh[6] = (hh[6] + g) >>> 0; hh[7] = (hh[7] + h) >>> 0;
  }
}

/** Streaming SHA-256 of a Blob/File, read in 8 MiB chunks. Reports how far
 *  it has read so big files can show honest "preparing" progress. */
async function sha256OfBlob(blob: Blob, onProgress?: (read: number, total: number) => void): Promise<string> {
  const hasher = new Sha256();
  const CHUNK = 8 * 1024 * 1024;
  for (let off = 0; off < blob.size; off += CHUNK) {
    const buf = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
    hasher.update(buf);
    onProgress?.(Math.min(off + CHUNK, blob.size), blob.size);
  }
  return hasher.hex();
}

class CancelledError extends Error {
  constructor() { super('cancelled'); }
}

export interface UploadedFileMeta { name: string; mime: string; size: number }

/** Run a file upload. `done` resolves with the READY item or throws. */
export function uploadFile(
  spaceId: string,
  file: File,
  onUpdate: (p: UploadProgress) => void,
): { handle: UploadHandle; done: Promise<SpaceItem> } {
  const state = {
    paused: false,
    cancelled: false,
    itemId: null as string | null,
    mode: undefined as 'direct' | 'multipart' | undefined,
    sent: 0,
    abort: new AbortController(),
  };

  const waitWhilePaused = async () => {
    while (state.paused && !state.cancelled) await new Promise(r => setTimeout(r, 250));
  };
  const prog = (phase: UploadPhase, extra?: { error?: string; prepare?: number }) =>
    onUpdate({ phase, sent: Math.min(state.sent, file.size), size: file.size, mode: state.mode, ...extra });

  const done = (async () => {
    try {
      prog('preparing', { prepare: 0 });

      // Digest first (streamed) so init can carry it; the server verifies
      // the received bytes against this before publishing the item.
      const hash = await sha256OfBlob(file, (read, total) => prog('preparing', { prepare: total ? read / total : 0 }));

      const init = await initFile(spaceId, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        sha256: hash,
      });
      state.itemId = init.itemId;
      state.mode = init.mode;
      const base = spaceApiBase();
      const creds = localCreds(spaceId)!;

      if (init.mode === 'direct') {
        await waitWhilePaused();
        if (state.cancelled) throw new CancelledError();
        prog('uploading');
        const res = await fetch(`${base}/space/${spaceId}/items/file/direct?itemId=${encodeURIComponent(init.itemId)}`, {
          method: 'PUT',
          headers: { ...headers(creds.token), 'content-type': 'application/octet-stream' },
          body: file,
          signal: state.abort.signal,
        });
        if (!res.ok) {
          const msg = await res.json().then(b => (b as { error?: string }).error || '').catch(() => '');
          throw new Error(msg || 'Upload failed');
        }
        state.sent = file.size;
        prog('verifying');
        const out = (await res.json()) as { item: SpaceItem };
        prog('ready');
        return out.item;
      }

      // ── multipart ────────────────────────────────────────────────────
      const partSize = init.partSize!;
      const partCount = init.partCount!;

      // Resume: which parts did the server already record?
      let have = new Set<number>();
      try {
        const st = await uploadStatus(spaceId, init.itemId);
        if (st?.uploadedParts) have = new Set(st.uploadedParts);
      } catch { /* fresh upload */ }
      state.sent = [...have].reduce((acc, n) => acc + (n === partCount ? file.size - (partCount - 1) * partSize : partSize), 0);
      prog('uploading');

      let nextPart = 1;
      let failure: Error | null = null;
      const uploadOne = async (n: number): Promise<void> => {
        const start = (n - 1) * partSize;
        const end = Math.min(n * partSize, file.size);
        let lastErr: unknown = null;
        for (let attempt = 0; attempt <= PART_RETRIES; attempt++) {
          if (state.cancelled) throw new CancelledError();
          await waitWhilePaused();
          if (failure) return;
          try {
            const res = await fetch(`${base}/space/${spaceId}/items/file/part?itemId=${encodeURIComponent(init.itemId)}&partNumber=${n}`, {
              method: 'PUT',
              headers: { ...headers(creds.token), 'content-type': 'application/octet-stream' },
              body: file.slice(start, end), // Blob slice — streamed, never buffered whole
              signal: state.abort.signal,
            });
            if (!res.ok) throw new Error(`part ${n}: HTTP ${res.status}`);
            if (!have.has(n)) {
              have.add(n);
              state.sent += end - start;
              prog('uploading');
            }
            return;
          } catch (e) {
            if (state.cancelled || (e instanceof DOMException && e.name === 'AbortError')) throw new CancelledError();
            lastErr = e;
            await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt))); // backoff
          }
        }
        failure = new Error(`Part ${n} didn't upload after ${PART_RETRIES + 1} tries.` + (lastErr instanceof Error ? ` (${lastErr.message})` : ''));
      };

      const workers = Array.from({ length: Math.min(PART_CONCURRENCY, partCount) }, async () => {
        while (!failure && !state.cancelled) {
          await waitWhilePaused();
          if (failure || state.cancelled) return;
          const n = nextPart++;
          if (n > partCount) return;
          if (have.has(n)) continue;
          await uploadOne(n);
        }
      });
      await Promise.all(workers);
      if (state.cancelled) throw new CancelledError();
      if (failure) throw failure;

      prog('verifying');
      const completeRes = await fetch(`${base}/space/${spaceId}/items/file/complete`, {
        method: 'POST',
        headers: { ...headers(creds.token), 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: init.itemId, parts: Array.from({ length: partCount }, (_, i) => ({ partNumber: i + 1 })) }),
        signal: state.abort.signal,
      });
      if (!completeRes.ok) {
        const msg = await completeRes.json().then(b => (b as { error?: string }).error || '').catch(() => '');
        throw new Error(msg || 'Upload failed');
      }
      const out = (await completeRes.json()) as { item: SpaceItem };
      state.sent = file.size;
      prog('ready');
      return out.item;
    } catch (e) {
      if (e instanceof CancelledError || state.cancelled) {
        prog('cancelled');
        void abortUpload(spaceId, state.itemId);
        throw new CancelledError();
      }
      prog('failed', { error: e instanceof Error ? e.message : 'Upload failed' });
      throw e;
    }
  })();

  const handle: UploadHandle = {
    get itemId() { return state.itemId ?? ''; },
    pause() { if (!state.paused) { state.paused = true; prog('paused'); } },
    resume() { if (state.paused) { state.paused = false; prog('uploading'); } },
    cancel() { state.cancelled = true; state.paused = false; state.abort.abort(); },
  };

  return { handle, done };
}

/** Best-effort abort: tells the server to drop the upload + clean parts. */
export async function abortUpload(spaceId: string, itemId: string | null): Promise<void> {
  if (!itemId) return;
  try {
    const base = spaceApiBase();
    const creds = localCreds(spaceId);
    if (!creds) return;
    await fetch(`${base}/space/${spaceId}/items/file/abort?itemId=${encodeURIComponent(itemId)}`, {
      method: 'POST',
      headers: { ...headers(creds.token), 'content-type': 'application/json' },
      body: '{}',
    });
  } catch { /* already gone */ }
}
