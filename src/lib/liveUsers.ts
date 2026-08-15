import { useEffect, useState } from 'react';

/**
 * Live user count — polls whichever signaling backend this build actually
 * uses (same resolution as socket.ts: VITE_SIGNALING_URL → Cloudflare
 * Worker, VITE_SOCKET_URL → Node server, else same-origin) for the
 * landing-page "N people using" widget.
 *
 * Honest by design: the number is approximate (a social-proof widget, not a
 * census), polling pauses while the tab is hidden, and a fetch failure hides
 * the widget rather than showing a stale count.
 */
function statsUrl(): string {
  const normalize = (v: string | undefined) => v?.replace(/\/+$/, '').trim();
  const cf = normalize(import.meta.env.VITE_SIGNALING_URL as string | undefined);
  const node = normalize(import.meta.env.VITE_SOCKET_URL as string | undefined);
  if (cf) return `${cf}/stats`;
  if (node) return `${node}/stats`;
  return '/stats'; // same-origin dev / self-hosted (Node server serves both)
}

const POLL_MS = 30_000;
const FETCH_TIMEOUT_MS = 6_000;

export function useLiveUsers(intervalMs: number = POLL_MS): number | null {
  const [users, setUsers] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const url = statsUrl();

    const poll = async () => {
      // Pause while hidden — resumes on visibilitychange.
      if (document.hidden) return;
      try {
        const ctrl = new AbortController();
        const timeout = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        window.clearTimeout(timeout);
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const data = (await res.json()) as { users?: unknown };
        if (!cancelled) setUsers(typeof data.users === 'number' ? data.users : null);
      } catch {
        // Unreachable or failed — hide the widget rather than guess.
        if (!cancelled) setUsers(null);
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), intervalMs);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return users;
}
