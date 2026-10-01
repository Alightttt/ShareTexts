/**
 * Shared Temporary Space constants (F14).
 *
 * The Cloudflare Worker keeps its own copy (worker/src/space.ts — Workers
 * can't import from the app tree); values MUST stay in sync. This module is
 * the single source for the client and the Node dev backend.
 */

/** Hard maximum lifetime — "up to 7 days" is a product promise AND a cap. */
export const SPACE_TTL_CAP = 7 * 24 * 60 * 60 * 1000;

/** The create-flow options, in display order. 6h → 7d. */
export const SPACE_DURATIONS: number[] = [
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  1 * 24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  5 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
];

/** Text items live in metadata (DO state / memory) — bounded. */
export const TEXT_MAX = 512 * 1024;

/** One-request uploads must stay under the Worker's 100 MB body cap with
 *  headroom. Anything larger goes the multipart path. */
export const DIRECT_UPLOAD_MAX = 90 * 1024 * 1024;

export const PART_MIN = 8 * 1024 * 1024;   // 8 MiB → ≤10k parts ≈ 80 GiB
export const PART_CAP = 512 * 1024 * 1024;

/** Same sizing as the Worker: grow the part size for very large objects so
 *  the 10,000-part R2 limit is never hit. */
export function partSizeFor(size: number): number {
  let part = PART_MIN;
  while (part * 10_000 < size && part < PART_CAP) part *= 4;
  return Math.min(part, PART_CAP);
}

/** One reminder per space, sized to the lifetime. Centralized + tunable. */
export function reminderOffsetFor(durationMs: number): number {
  const h = durationMs / 3_600_000;
  if (h <= 6) return 1 * 3_600_000;
  if (h <= 12) return 3 * 3_600_000;
  if (h <= 24) return 6 * 3_600_000;
  if (h <= 48) return 12 * 3_600_000;
  if (h <= 72) return 18 * 3_600_000;
  return 24 * 3_600_000;
}

// ── local storage keys ────────────────────────────────────────────────────

/** Per-space credentials the device holds (access token, manage key). The
 *  token IS the share secret; keeping it locally is what makes "Recent
 *  spaces" work without an account. */
export const SPACE_CREDS_KEY = 'sharetext.space.creds.v1';

/** Stable per-device identity seed (not a secret — only scopes the
 *  participant id so two devices sharing one token are two members). */
export const SPACE_DEVICE_KEY = 'sharetext.space.deviceKey';

// ── share link codec ──────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 192-bit tokens, base64url — 32 chars. */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

/** Build the share link. The secret rides in the URL FRAGMENT so it never
 *  reaches server logs, proxies, or Referer headers. */
export function spaceShareLink(spaceId: string, token: string): string {
  if (typeof window === 'undefined') return `/space/${spaceId}#k=${token}`;
  return `${window.location.origin}/space/${spaceId}#k=${token}`;
}

/** Accept a full share link, a bare `/space/<id>#k=<token>` path, or the
 *  compact `<id>#k=<token>` / `<id>.<token>` forms (QR/typo-friendly). */
export function parseSpaceShare(raw: string): { spaceId: string; token: string } | null {
  const s = (raw || '').trim();
  if (!s) return null;
  // Hash fragment wins wherever it appears.
  const hashAt = s.indexOf('#');
  let token = '';
  let rest = s;
  if (hashAt >= 0) {
    const frag = s.slice(hashAt + 1);
    rest = s.slice(0, hashAt);
    const m = frag.match(/^k=([A-Za-z0-9_-]+)$/) || frag.match(/^([A-Za-z0-9_-]+)$/);
    if (m) token = m[1];
  }
  // Path form: …/space/<uuid> — or the dotted compact form <uuid>.<token>.
  const pathMatch = rest.match(/\/space\/([0-9a-f-]{36})/i) || rest.match(/^([0-9a-f-]{36})$/i);
  if (pathMatch) {
    const spaceId = pathMatch[1].toLowerCase();
    if (!token) {
      const dot = rest.includes('/space/') ? null : rest.match(/^[0-9a-f-]{36}\.([A-Za-z0-9_-]+)$/i);
      if (dot) token = dot[1];
    }
    if (token && TOKEN_RE.test(token)) return { spaceId, token };
  }
  // Compact dotted form without fragment: <uuid>.<token>
  const dotted = s.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]+)$/i);
  if (dotted && TOKEN_RE.test(dotted[2])) return { spaceId: dotted[1].toLowerCase(), token: dotted[2] };
  void UUID_RE;
  return null;
}
