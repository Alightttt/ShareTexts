/**
 * roomBadge — the browser tab becomes a transfer-status light.
 *
 * While the room UI is on screen, the favicon gains a colored status pill
 * (drawn on canvas from the app's own 32px icon — no new assets) and the
 * document title carries the live state ("● Connected — MacBook").
 * On the landing page / pairing screens / docs, NOTHING changes: the
 * marketing favicon and title are byte-exact what index.html shipped.
 *
 * Pill colors follow the app's honest-state vocabulary:
 *   green  = connected (data channel healthy)
 *   amber  = connecting / reconnecting
 *   red    = disconnected / problem
 */

/** The exact favicon + title index.html ships with — restored on exit. */
const BASE_FAVICON = '/favicon-32.png?v=17';
let baseTitle: string | null = null;
/** Only touch the tab once the room UI is actually mounted. */
let active = false;

export type RoomBadgeState = 'connected' | 'connecting' | 'problem';

const PILL: Record<RoomBadgeState, string> = {
  connected: '#34c759', // status-success green
  connecting: '#f5a623', // amber — in-flight
  problem: '#ff3b30', // status-danger red
};

let drawPromise: Promise<void> | null = null;

/** Load the base icon once and pre-bake all three badge data URLs. */
function bakeBadges(): Promise<void> {
  if (!drawPromise) {
    drawPromise = new Promise<void>(resolve => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            for (const state of Object.keys(PILL) as RoomBadgeState[]) {
              const canvas = document.createElement('canvas');
              canvas.width = 64; // 2x for crisp hi-dpi tab bars
              canvas.height = 64;
              const ctx = canvas.getContext('2d');
              if (!ctx) break;
              ctx.drawImage(img, 0, 0, 64, 64);
              // Status pill — bottom-right, white ring so it reads on any tab bar.
              ctx.beginPath();
              ctx.arc(50, 50, 11, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.fill();
              ctx.beginPath();
              ctx.arc(50, 50, 8.5, 0, Math.PI * 2);
              ctx.fillStyle = PILL[state];
              ctx.fill();
              badgeCache.set(state, canvas.toDataURL('image/png'));
            }
          } catch { /* canvas unavailable — favicon stays untouched */ }
          resolve();
        };
        img.onerror = () => resolve(); // favicon stays untouched, title still updates
        img.src = BASE_FAVICON;
      } catch {
        resolve();
      }
    });
  }
  return drawPromise;
}

/** Active badge cache: one data URL per state, generated on first use. */
const badgeCache = new Map<RoomBadgeState, string>();

async function badgeFor(state: RoomBadgeState): Promise<string | null> {
  const hit = badgeCache.get(state);
  if (hit) return hit;
  await bakeBadges();
  return badgeCache.get(state) ?? null;
}

function setFaviconHref(href: string | null) {
  // One <link rel="icon"> per type already exists; swap the 32px PNG's href
  // (the SVG may be color-scheme aware and must stay untouched).
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/png"][sizes="32x32"]');
  if (!link) return;
  if (href) {
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  } else if (link.getAttribute('href') !== BASE_FAVICON) {
    link.setAttribute('href', BASE_FAVICON);
  }
}

export interface RoomBadgeInput {
  inRoomView: boolean;
  connected: boolean;
  /** Mid-handshake or mid-recovery — amber, never red (not the user's fault). */
  connecting: boolean;
  partnerName: string | null;
  /** Unread signal from the partner since the tab was last visible. */
  unread: number;
}

let lastApplied: string | null = null; // key of the last applied tab state

/**
 * Call on every relevant state change AND on mount of the room view.
 * Idempotent: recomputes the desired tab state and only touches the DOM
 * when it actually differs. `active` gates everything — pass inRoomView
 * false and the tab snaps back to the pristine landing identity.
 */
export function updateRoomBadge(input: RoomBadgeInput): void {
  if (typeof document === 'undefined') return;
  const title = document.title;
  if (baseTitle === null) baseTitle = title.startsWith('ShareTexts') && !title.startsWith('ShareTexts |')
    ? title
    : title; // first observation wins; Docs/Legal restore their own titles

  const want = desired(input);
  const key = want ? `${want.badge}|${want.title}` : null;
  if (key === lastApplied) return;
  lastApplied = key;

  if (!want) {
    // Room view gone: exact landing restore.
    setFaviconHref(null);
    if (baseTitle) document.title = baseTitle;
    return;
  }

  void badgeFor(want.badge).then(url => { if (url) setFaviconHref(url); });
  document.title = want.title;
}

interface Desired {
  badge: RoomBadgeState;
  title: string;
}

function desired(input: RoomBadgeInput): Desired | null {
  if (!active || !input.inRoomView) return null;
  const badge: RoomBadgeState = input.connected
    ? 'connected'
    : input.connecting
      ? 'connecting'
      : 'problem';
  const dot = badge === 'connected' ? '●' : badge === 'connecting' ? '◐' : '○';
  const who = input.partnerName ? ` — ${input.partnerName}` : '';
  const unread = input.unread > 0 ? ` (${input.unread})` : '';
  const stateWord = badge === 'connected'
    ? 'Connected'
    : badge === 'connecting'
      ? 'Connecting…'
      : 'Disconnected';
  return { badge, title: `${dot} ${stateWord}${unread}${who} · ShareTexts` };
}

/** Mount/unmount of the room UI. Badge work happens only while mounted. */
export function setRoomBadgeActive(on: boolean): void {
  active = on;
}

/** Test/diagnostic hook: force-clear cached bitmaps (e.g. HMR). */
export function resetRoomBadgeCache(): void {
  badgeCache.clear();
  drawPromise = null;
  lastApplied = null;
}
