import { useEffect, useState } from 'react';
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
 */
export function useLiveStats(pollMs = 10_000): { devices: number | null; roomsCreated: number | null } {
  const [devices, setDevices] = useState<number | null>(null);
  const [roomsCreated, setRoomsCreated] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = signalingHttpBase();
    if (!base) return;
    const load = async () => {
      try {
        const res = await fetch(base + '/stats', { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (typeof data?.users === 'number') setDevices(data.users);
        if (typeof data?.roomsCreated === 'number') setRoomsCreated(data.roomsCreated);
      } catch { /* offline — keep last known values quietly */ }
    };
    void load();
    const timer = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [pollMs]);

  return { devices, roomsCreated };
}
