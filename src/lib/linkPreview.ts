/**
 * linkPreview — OG metadata for URLs shared in a room.
 *
 * The receiving browser can't read a shared page's HTML (CORS), so the
 * signaling server fetches it (SSRF-guarded, rate-limited, cached — see
 * server.ts /api/preview). This module is the thin client: one request per
 * unique URL per page load, in-flight deduped, failures cached briefly so
 * a dead link doesn't get re-probed on every re-render.
 *
 * Endpoint discovery: try same-origin first (dev + self-hosted server carry
 * /api/preview; Vercel-fronted production does not). If same-origin misses,
 * fall back to the ACTIVE signaling HTTP base (the worker in cloudflare
 * transport mode). Results are module-cached for the tab's lifetime —
 * link metadata is effectively immutable at sharing timescales.
 */

import { signalingHttpBase } from './socket';

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  /** True when the fetch failed/unavailable — the card stays a plain link. */
  unavailable?: boolean;
}

const cache = new Map<string, LinkPreviewData>();
const inflight = new Map<string, Promise<LinkPreviewData | null>>();

/** Bases to try, in order. Computed lazily (window may not exist at import). */
function candidateBases(): string[] {
  const bases: string[] = [];
  if (typeof window !== 'undefined') bases.push(window.location.origin);
  const signal = signalingHttpBase();
  if (signal && !bases.includes(signal)) bases.push(signal);
  return bases;
}

async function tryFetch(base: string, url: string, signal: AbortSignal): Promise<LinkPreviewData | null> {
  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/preview?url=${encodeURIComponent(url)}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as LinkPreviewData;
    if (!data || typeof data.url !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch preview metadata for a URL. Returns null when every candidate
 * endpoint is unavailable (the UI keeps the plain link card — no fake data).
 * The result (including null) is remembered; pass `refresh` to re-probe.
 */
export function fetchLinkPreview(url: string, refresh = false): Promise<LinkPreviewData | null> {
  if (!refresh) {
    const hit = cache.get(url);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(url);
    if (pending) return pending;
  }
  const job = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      for (const base of candidateBases()) {
        const data = await tryFetch(base, url, controller.signal);
        if (data) {
          cache.set(url, data);
          return data;
        }
        // A same-origin 404 (static host without the endpoint) is fast;
        // keep trying the next base unless the caller aborted.
        if (controller.signal.aborted) break;
      }
      const miss: LinkPreviewData = { url, title: null, description: null, image: null, siteName: null, unavailable: true };
      cache.set(url, miss);
      return miss;
    } finally {
      clearTimeout(timer);
      inflight.delete(url);
    }
  })();
  inflight.set(url, job);
  return job;
}

/** Test hook: clear all memoized previews. */
export function resetLinkPreviews(): void {
  cache.clear();
  inflight.clear();
}
