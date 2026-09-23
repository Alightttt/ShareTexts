/**
 * Screen wake lock while transfers are in flight. Extracted verbatim from
 * SessionContext (Round 03); semantics unchanged.
 *
 * While a transfer is active, keep the screen awake so a phone doesn't lock
 * mid-transfer and browsers don't throttle the tab. The lock is released the
 * moment nothing is sending/receiving; re-acquired after a visibility change
 * (the OS may drop it when the app is backgrounded and Chrome re-requests it
 * on return).
 */

import { useEffect } from 'react';
import type { ChatMessage } from '../../types';

export function useTransferWakeLock(messages: ChatMessage[]) {
  useEffect(() => {
    const active = messages.some(m => {
      const st = m.attachment?.status;
      return st === 'sending' || st === 'receiving' || st === 'resuming' || st === 'waiting';
    });
    if (!active) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () => {
      try {
        if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
          (navigator as any).wakeLock.request('screen').then((l: any) => {
            if (cancelled) { try { l.release(); } catch { /* noop */ } return; }
            lock = l;
          }).catch(() => { /* denied or unavailable — transfer still runs */ });
        }
      } catch { /* unsupported */ }
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (lock) { try { lock.release(); } catch { /* noop */ } lock = null; }
    };
  }, [messages]);
}
