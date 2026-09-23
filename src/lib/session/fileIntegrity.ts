/**
 * File integrity hashing. Extracted verbatim from SessionContext
 * (Round 03); semantics unchanged.
 */

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * SHA-256 hex of a Blob/File with bounded memory at any size.
 *
 * Fast path: browsers that accept a Blob directly stream it natively. Some
 * engines (older Chromium, some WebViews) reject Blob in digest() — the
 * fallback then hashes per-64KB slice and combines the per-chunk digests
 * into one final hash. Same corruption-detection power (any changed byte
 * changes a chunk hash), but memory stays at 32 bytes per chunk (~1 MB for
 * a 2 GB file) instead of the whole file.
 */
export async function sha256Hex(blob: Blob): Promise<string> {
  try {
    return toHex(await crypto.subtle.digest('SHA-256', blob as unknown as BufferSource));
  } catch {
    // Fallback — chunk-combined digest.
    const CH = 64 * 1024;
    const n = Math.ceil(blob.size / CH);
    const parts = new Uint8Array(n * 32);
    for (let i = 0; i < n; i++) {
      const slice = blob.slice(i * CH, Math.min(blob.size, (i + 1) * CH));
      const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await slice.arrayBuffer()));
      parts.set(d, i * 32);
    }
    return toHex(await crypto.subtle.digest('SHA-256', parts));
  }
}
