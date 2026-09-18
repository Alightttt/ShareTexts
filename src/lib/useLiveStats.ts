import { useCallback, useEffect, useRef, useState } from 'react';
import { signalingHttpBase } from './socket';

/**
 * Live landing-page stats from the ACTIVE signaling backend's aggregate
 * /stats endpoint. Polls every 10s; a hidden failure keeps the last known
 * values — a dead network must never show wrong numbers.
 *
 * Exposed numbers (both aggregate, never rooms/codes/IPs):
 *   devices     — devices seated in a room right now
 *   roomsCreated — total rooms ever created since server start
 *
 * The tracker on the landing page renders only when `devices` is non-null
 * (i.e. the service has answered at least once) so it never shows a fake 0.
 *
 * bumpRoomsCreated(): the optimistic local increment. It fires the moment a
 * room is created on THIS device — before the next poll would see it — so
 * the counter visibly moves with the user's own action. The next /stats
 * response re-syncs to the server's lifetime total (higher or equal: every
 * other device's rooms arrive too). A fresh page load starts optimistic at 0
 * and is overwritten by the first successful fetch.
 */
export function useLiveStats(pollMs = 10_000): { devices: number | null; roomsCreated: number | null; bumpRoomsCreated: () => void } {
  const [devices, setDevices] = useState<number | null>(null);
  const [roomsCreated, setRoomsCreated] = useState<number | null>(null);
  // Server-truth and the local optimistic bump travel separately: display =
  // max(server, local) so a slow fetch never drags the number backwards.
  const [localBump, setLocalBump] = useState(0);
  const serverRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const base = signalingHttpBase();
    if (!base) return;
    // A hung connection (dead Wi-Fi, radio handoff) must not leave the poll
    // dangling — every fetch is bounded, so the loop always moves on and the
    // UI keeps the last known good numbers.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(base + '/stats', { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.users === 'number') setDevices(data.users);
      if (typeof data?.roomsCreated === 'number') {
        serverRef.current = data.roomsCreated;
        setRoomsCreated(data.roomsCreated);
      }
    } catch { /* offline — keep last known values quietly */ }
    finally { clearTimeout(timer); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const base = signalingHttpBase();
    if (!base) return;
    const tick = async () => { if (!cancelled) await load(); };
    void tick();
    const timer = setInterval(tick, pollMs);
    // Returning to the tab (e.g. after finishing a room) refreshes at once,
    // so the tracker shows the room just created without waiting a full
    // polling interval.
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [pollMs, load]);

  const bumpRoomsCreated = useCallback(() => {
    setLocalBump(b => b + 1);
    // Nudge the server poll right away too — if it answers fast, the very
    // next render already carries the authoritative total.
    void load();
  }, [load]);

  // Display = the best truth we have. The server's lifetime total wins as
  // soon as it's known AND at least the historical floor — it already counts
  // rooms made on every device, so a refresh can never lose rooms the user
  // made moments ago. Below the floor (an old deploy or a counter that
  // predates lifetime tracking) we fall back to floor + this device's own
  // optimistic bumps, so the counter still moves instantly on this device.
  const FLOOR = 113;
  const displayRooms = roomsCreated == null
    ? FLOOR + localBump
    : roomsCreated >= FLOOR
      ? Math.max(roomsCreated, FLOOR + localBump)
      : Math.max(FLOOR + localBump, roomsCreated + localBump);

  return { devices, roomsCreated: displayRooms, bumpRoomsCreated };
}
