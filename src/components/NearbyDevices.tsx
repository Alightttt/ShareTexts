import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Smartphone, ArrowRight } from 'lucide-react';
import { getSocket, signalingTransportMode } from '../lib/socket';
import { nearbyPresence, type NearbyDevice } from '../lib/nearby';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/SessionContext';
import { ConfirmSheet } from './ConfirmSheet';
import { hapticTap } from '../lib/haptics';
import { cn } from '../lib/utils';
/**
 * NearbyDevices — the landing-page discovery section.
 *
 * Layout contract (nothing here redesigns the hero):
 *   · a small secondary line under Send/Receive: "Open ShareTexts in another device"
 *   · when eligible devices appear, compact tappable rows appear ABOVE that line
 *   · tapping a device sends a server-relayed invite; the OTHER user must
 *     accept before the EXISTING create → link-join connection flow runs
 *   · a tracker-friendly status string is lifted to the parent via onStatus
 *
 * Device names render as React text nodes only — never dangerouslySetInnerHTML.
 * Only the socket.io transport supports presence; elsewhere this degrades to
 * the hint line alone.
 */

type Phase =
  | { kind: 'idle' }                                     // nothing in flight
  | { kind: 'inviting'; device: NearbyDevice }           // invite sent, awaiting answer
  | { kind: 'connecting'; device: NearbyDevice }         // accepted — existing flow running
  | { kind: 'error'; text: string };

/** Heuristic icon: phones pick the phone glyph, everything else the monitor. */
function DeviceGlyph({ name }: { name: string }) {
  return /iphone|ipad|android|phone|mobile/i.test(name)
    ? <Smartphone className="w-4 h-4" aria-hidden />
    : <Monitor className="w-4 h-4" aria-hidden />;
}

export function NearbyDevices({ onStatus }: { onStatus?: (s: string | null) => void }) {
  const { t } = useI18n();
  const { session, createSession, joinWithLink } = useSession();
  const idle = !session.roomId;

  const [devices, setDevices] = useState<NearbyDevice[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [invitation, setInvitation] = useState<{ from: string; name: string } | null>(null);

  /* --- presence lifecycle --------------------------------------------- */
  // Attach only while the landing page is truly idle (roomless). Any state
  // that seats us in a room (create/join/nearby flow itself) withdraws us.
  useEffect(() => {
    if (signalingTransportMode() === 'cloudflare') {
      nearbyPresence.markUnsupported();
      return; // graceful degradation: hint line only, no device list
    }
    const socket = getSocket();
    if (idle) {
      nearbyPresence.attach(socket, session.deviceName);
    } else {
      nearbyPresence.stop(socket);
    }
    return () => nearbyPresence.stop(socket);
  }, [idle, session.deviceName]);

  // Subscribe once; presence updates arrive over the existing socket.
  useEffect(() => nearbyPresence.subscribe((list, selfToken) => {
    setDevices(list.filter(d => d.id !== selfToken));
  }), []);

  /* --- tracker lift-up -------------------------------------------------- */
  // Only TRANSIENT connection states claim the activity line — the discovery
  // result itself is communicated by the device rows, and the hero's lifetime
  // counter must keep its place.
  useEffect(() => {
    if (!onStatus) return;
    if (phase.kind === 'inviting' || phase.kind === 'connecting') {
      onStatus(t('nearby.connectingTo', { name: phase.device.name }));
    } else {
      onStatus(null); // errors render inline below; not tracker noise
    }
  }, [phase, onStatus, t]);

  /* --- incoming invitation ---------------------------------------------- */
  useEffect(() => nearbyPresence.onInvitation(inv => {
    // Ignore while busy with another connection flow.
    setInvitation(prev => (prev ? prev : inv));
  }), []);

  /* --- outgoing invite --------------------------------------------------- */
  const handleInvite = useCallback(async (device: NearbyDevice) => {
    hapticTap();
    setPhase({ kind: 'inviting', device });
    const delivered = await nearbyPresence.invite(device.id);
    if (!delivered) {
      setPhase({ kind: 'error', text: t('nearby.gone') });
      return;
    }
    // Delivery ≠ acceptance. If the other device declines/expires, the
    // presence_invite_result listener below resolves the phase to an error.
  }, [t]);

  /* --- the invitee side: accept creates the room ------------------------- */
  const answerInvite = useCallback(async (accepted: boolean) => {
    const inv = invitation;
    setInvitation(null);
    if (!inv) return;
    if (!accepted) {
      nearbyPresence.answerInvite(inv.from, false);
      return;
    }
    try {
      // The invitee creates the room (it holds the secret), then hands the
      // inviter the credentials through the server relay. The inviter runs
      // the ordinary join_with_link — the standard, already-secure path.
      const { roomId, secret } = await createSession();
      nearbyPresence.answerInvite(inv.from, true, { roomId, secret });
      setPhase({ kind: 'connecting', device: { id: inv.from, name: inv.name } });
    } catch {
      nearbyPresence.answerInvite(inv.from, false);
      setPhase({ kind: 'error', text: t('err.connectFailed') });
    }
  }, [invitation, createSession, t]);

  /* --- the inviter side: accept carries fresh room credentials ------------ */
  useEffect(() => nearbyPresence.onInviteResult(result => {
    setPhase(prev => {
      if (prev.kind !== 'inviting') return prev;
      if (result.accepted && result.roomId && result.secret) {
        // Drop out of the lobby, then join via the EXISTING link path.
        nearbyPresence.stop(getSocket());
        void joinWithLink(result.roomId);
        return { kind: 'connecting', device: prev.device };
      }
      return { kind: 'error', text: t('nearby.declined') };
    });
  }), [joinWithLink, t]);

  // The existing flow takes over once peerConnecting/partnerConnected fire;
  // any error from joinWithLink leaves the banner to the standard handlers.
  useEffect(() => {
    if (phase.kind === 'connecting' && (session.partnerConnected || session.partnerConnecting)) {
      setPhase({ kind: 'idle' });
    }
  }, [phase.kind, session.partnerConnected, session.partnerConnecting]);

  /* --- auto-clear transient states ---------------------------------------- */
  useEffect(() => {
    if (phase.kind === 'error') {
      const timer = setTimeout(() => setPhase({ kind: 'idle' }), 5000);
      return () => clearTimeout(timer);
    }
  }, [phase.kind]);

  /* --- render -------------------------------------------------------------- */

  const hidden = !idle || phase.kind === 'connecting';
  if (hidden) return null;

  return (
    <div className="w-full">
      {/* Nearby device rows */}
      <AnimatePresence>
        {devices.length > 0 && (
          <motion.div
            key="nearby-devices"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="mt-4 w-full"
          >
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-apple-ink-muted/70 dark:text-white/35 mb-2">
              {t('nearby.sectionTitle')}
            </p>
            <div className="flex flex-col gap-2">
              {devices.map(d => {
                const busy = phase.kind === 'inviting' && phase.device.id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleInvite(d)}
                    disabled={phase.kind !== 'idle'}
                    aria-label={t('nearby.connectAria', { name: d.name })}
                    className={cn(
                      'group flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] text-left',
                      'bg-white dark:bg-apple-tile-1 border border-apple-divider/50 dark:border-apple-tile-3',
                      'hover:border-[#f06413]/40 dark:hover:border-[#fb9243]/45 active:scale-[0.985] transition-all',
                      'disabled:opacity-50 disabled:pointer-events-none'
                    )}
                  >
                    <span className="shrink-0 w-8 h-8 rounded-full bg-[#f06413]/10 dark:bg-[#fb9243]/15 flex items-center justify-center text-[#f06413] dark:text-[#fb9243]">
                      <DeviceGlyph name={d.name} />
                    </span>
                    <span className="flex-1 flex flex-col min-w-0 leading-tight">
                      <span className="text-[13px] font-semibold text-apple-ink dark:text-white truncate">{d.name}</span>
                      <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">
                        {busy ? t('nearby.waiting') : t('nearby.nearby')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline status / error (inviting, gone, declined) */}
      <AnimatePresence>
        {(phase.kind === 'inviting' || phase.kind === 'error') && (
          <motion.p
            key={phase.kind === 'error' ? `error:${phase.text}` : 'inviting'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role={phase.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'mt-3 text-[12.5px] font-medium',
              phase.kind === 'error' ? 'text-status-danger' : 'text-apple-ink-muted dark:text-white/50'
            )}
          >
            {phase.kind === 'inviting'
              ? t('nearby.connectingTo', { name: phase.device.name })
              : phase.text}
          </motion.p>
        )}
      </AnimatePresence>

      {/* The exact hero line, always present under the Send/Receive buttons. */}
      <p className="mt-3 flex items-center justify-center sm:justify-start gap-1.5 text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
        <Monitor className="w-3.5 h-3.5" aria-hidden />
        {t('nearby.hint')}
      </p>

      {/* Incoming invitation — Apple-style sheet, reused from the app. */}
      <ConfirmSheet
        open={!!invitation}
        title={t('nearby.inviteTitle', { name: invitation?.name ?? '' })}
        body={t('nearby.inviteBody')}
        confirmLabel={t('nearby.accept')}
        cancelLabel={t('nearby.decline')}
        destructive={false}
        onConfirm={() => void answerInvite(true)}
        onCancel={() => void answerInvite(false)}
      />
    </div>
  );
}
