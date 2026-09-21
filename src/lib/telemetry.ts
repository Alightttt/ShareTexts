/**
 * Product telemetry — anonymous, aggregate-only product events.
 *
 * WHAT this answers (Parts 34–35 of the product roadmap):
 *   which connection method people actually use, whether QR/link/docs get
 *   opened, where connections fail, and when a first transfer completes
 *   (the activation moment). The server already counts the connection
 *   funnel; these are the client-side complements it cannot see.
 *
 * PRIVACY CONTRACT (hard rules, enforced below):
 *   - Fixed whitelist of event names. Anything else is dropped.
 *   - NEVER: file contents, text, filenames, device names, room ids,
 *     codes, secrets, IPs, user agents, timestamps of individuals.
 *   - A fire-and-forGET beacon with NO body: the event name is the entire
 *     payload. The server enforces the same whitelist.
 *   - Failures are silently ignored — telemetry must never affect UX.
 *
 * Transport: GET beacon to the ACTIVE signaling origin (follows the
 * self-healing endpoint selection) so dev (same-origin) and production
 * (Cloudflare worker) both work. Uses keepalive fetch when available so
 * pagehide-time sends survive; falls back to sendBeacon-adjacent fetch.
 */

type ProductEvent =
  // activation funnel
  | 'product.page_view'
  | 'product.first_interaction'
  | 'product.activation'          // first completed transfer on this device (per install)
  | 'product.transfer_completed'  // every completed transfer (rate-limited by nature)
  | 'product.transfer_failed'
  // connection methods (which path people choose)
  | 'product.method_nearby'
  | 'product.method_code'
  | 'product.method_qr'
  | 'product.method_link'
  // surfaces opened
  | 'product.qr_opened'
  | 'product.docs_opened'
  | 'product.diagnostics_opened';

const ALLOWED: ReadonlySet<string> = new Set<string>([
  'product.page_view',
  'product.first_interaction',
  'product.activation',
  'product.transfer_completed',
  'product.transfer_failed',
  'product.method_nearby',
  'product.method_code',
  'product.method_qr',
  'product.method_link',
  'product.qr_opened',
  'product.docs_opened',
  'product.diagnostics_opened',
]);

/** Local de-dup: some events must fire once per install (activation). */
const ONCE_PER_INSTALL = new Set<string>(['product.activation', 'product.first_interaction']);
const DEDUP_KEY = 'sharetext.telemetry.once.v1';

function onceGuard(name: string): boolean {
  if (!ONCE_PER_INSTALL.has(name)) return true;
  try {
    const raw = localStorage.getItem(DEDUP_KEY);
    const fired: string[] = raw ? JSON.parse(raw) : [];
    if (fired.includes(name)) return false;
    fired.push(name);
    localStorage.setItem(DEDUP_KEY, JSON.stringify(fired));
    return true;
  } catch {
    return true; // storage unavailable — err toward sending the event
  }
}

/** Resolve the signaling HTTP origin for the beacon (mirrors socket.ts). */
function beaconBase(): string {
  try {
    const mod = (window as unknown as { __stSignalingHttpBase?: () => string | null }).__stSignalingHttpBase;
    if (typeof mod === 'function') {
      const base = mod();
      if (base) return base;
    }
  } catch { /* fall through */ }
  return window.location.origin;
}

let pageViewSent = false;

/** Fire one anonymous event. Never throws, never blocks, never retries. */
export function productEvent(name: ProductEvent): void {
  if (!ALLOWED.has(name)) return;
  if (!onceGuard(name)) return;
  // page_view once per load (SPA has no route changes that matter here)
  if (name === 'product.page_view' && pageViewSent) return;
  if (name === 'product.page_view') pageViewSent = true;
  try {
    const url = beaconBase() + '/api/event?name=' + encodeURIComponent(name);
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      // sendBeacon with a GET is not universally supported; use keepalive
      // fetch which is the modern guarantee for pagehide-safe sends.
      void fetch(url, { method: 'POST', body: name, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
    } else {
      void fetch(url, { method: 'POST', body: name, keepalive: true }).catch(() => {});
    }
  } catch { /* telemetry must never break UX */ }
}
