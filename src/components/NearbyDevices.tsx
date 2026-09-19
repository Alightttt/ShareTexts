import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Smartphone, ArrowRight, Zap, Eye, EyeOff } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { nearbyPresence, isPresenceHidden, setPresenceHidden, type NearbyDevice } from '../lib/nearby';
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

/**
 * Auto-connect — PairDrop-style one-tap pairing. A device with autoConnect on
 * accepts incoming invitations from nearby devices without the sheet, so two
 * people who both opted in can tap each other and land in the room. OFF by
 * default, remembered per device, and two-loop-safe: while an invite we sent
 * is still in flight we never also auto-accept, and each invitation carries a
 * nonce so an echo can't bounce back and forth forever.
 */
const AUTO_KEY = 'sharetext.autoConnect.v1';
export function isAutoConnectEnabled(): boolean {
  try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}
function setAutoConnectEnabled(v: boolean) {
  try { localStorage.setItem(AUTO_KEY, v ? '1' : '0'); } catch { /* private mode */ }
}

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
  const [autoOn, setAutoOn] = useState<boolean>(() => isAutoConnectEnabled());
  // Nearby visibility: who can find THIS device. Default is the simple,
  // privacy-friendly default — visible only while ShareTexts is open.
  const [presenceHidden, setPresenceHiddenState] = useState<boolean>(() => isPresenceHidden());
  // True while OUR invite is awaiting an answer — suppresses auto-accept on
  // the inviter side so a mutual tap can't race into two rooms.
  const invitingRef = useRef(false);

  /* --- presence lifecycle --------------------------------------------- */
  // Attach only while the landing page is truly idle (roomless). Any state
  // that seats us in a room (create/join/nearby flow itself) withdraws us.
  useEffect(() => {
    // Both transports speak presence now — the socket.io server has the
    // in-process pool and the Cloudflare worker has the Lobby DO.
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
    // AUTO-CONNECT: both devices opted in, we're idle, and we're not already
    // waiting on our own outgoing invite → accept without the sheet.
    if (autoOn && !invitation && !invitingRef.current) {
      // answerInvite reads `invitation` state; fire on the next tick with the
      // payload in hand so the sheet never flashes on screen.
      const timer = setTimeout(() => { void answerInviteRef.current(true, inv); }, 0);
      return () => clearTimeout(timer);
    }
  }), [autoOn, invitation]);

  /* --- outgoing invite --------------------------------------------------- */
  const handleInvite = useCallback(async (device: NearbyDevice) => {
    hapticTap();
    setPhase({ kind: 'inviting', device });
    invitingRef.current = true;
    const delivered = await nearbyPresence.invite(device.id);
    invitingRef.current = false;
    if (!delivered) {
      setPhase({ kind: 'error', text: t('nearby.gone') });
      return;
    }
    // Delivery ≠ acceptance. If the other device declines/expires, the
    // presence_invite_result listener below resolves the phase to an error.
  }, [t]);

  /* --- the invitee side: accept creates the room ------------------------- */
  const answerInvite = useCallback(async (accepted: boolean, override?: { from: string; name: string }) => {
    const inv = override ?? invitation;
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
  const answerInviteRef = useRef(answerInvite);
  answerInviteRef.current = answerInvite;

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

      {/* Nearby visibility — the user's own discoverability switch. Default
          ON: visible only while ShareTexts is open (closing the tab withdraws
          the announce and the server's TTL expires the entry). OFF: Hidden —
          this device never announces, so it can't be found, though it can
          still see and invite others. */}
      <div
        data-testid="nearby-visibility-row"
        className="mt-2.5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] bg-apple-parchment/60 dark:bg-white/[0.03] border border-apple-divider/40 dark:border-white/[0.06]"
      >
        <span
          className={cn(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
            presenceHidden
              ? 'bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40'
              : 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]'
          )}
          aria-hidden
        >
          {presenceHidden ? <EyeOff className="w-3.5 h-3.5" strokeWidth={2.2} /> : <Eye className="w-3.5 h-3.5" strokeWidth={2.2} />}
        </span>
        <span className="flex-1 flex flex-col min-w-0 leading-tight">
          <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">
            {presenceHidden ? t('nearby.hiddenTitle') : t('nearby.visibleWhileOpen')}
          </span>
          <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">
            {presenceHidden ? t('nearby.hiddenHint') : t('nearby.visibleWhileOpenHint')}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={!presenceHidden}
          data-testid="nearby-visibility-toggle"
          aria-label={t('nearby.visibleTitle')}
          onClick={() => { hapticTap(); setPresenceHiddenState(h => { setPresenceHidden(!h); return !h; }); }}
          className={cn(
            'relative shrink-0 w-[44px] h-[28px] rounded-full transition-colors duration-200 outline-none',
            'focus-visible:ring-2 focus-visible:ring-[#f06413]/40',
            !presenceHidden ? 'bg-[#f06413] dark:bg-[#fb9243]' : 'bg-apple-divider dark:bg-white/20'
          )}
        >
          <motion.span
            initial={false}
            animate={{ x: !presenceHidden ? 18 : 0 }}
            transition={{ type: 'spring', stiffness: 550, damping: 38 }}
            className="absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
          />
        </button>
      </div>

      {/* Auto-connect — one quiet row: what it does, plus the switch. */}
      <div
        data-testid="auto-connect-row"
        className="mt-2.5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] bg-apple-parchment/60 dark:bg-white/[0.03] border border-apple-divider/40 dark:border-white/[0.06]"
      >
        <span
          className={cn(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
            autoOn
              ? 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]'
              : 'bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40'
          )}
          aria-hidden
        >
          <Zap className="w-3.5 h-3.5" strokeWidth={2.2} />
        </span>
        <span className="flex-1 flex flex-col min-w-0 leading-tight">
          <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">{t('nearby.autoTitle')}</span>
          <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">{t('nearby.autoHint')}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={autoOn}
          data-testid="auto-connect-toggle"
          aria-label={t('nearby.autoTitle')}
          onClick={() => { hapticTap(); setAutoOn(v => { setAutoConnectEnabled(!v); return !v; }); }}
          className={cn(
            'relative shrink-0 w-[44px] h-[28px] rounded-full transition-colors duration-200 outline-none',
            'focus-visible:ring-2 focus-visible:ring-[#f06413]/40',
            autoOn ? 'bg-[#f06413] dark:bg-[#fb9243]' : 'bg-apple-divider dark:bg-white/20'
          )}
        >
          <motion.span
            initial={false}
            animate={{ x: autoOn ? 18 : 0 }}
            transition={{ type: 'spring', stiffness: 550, damping: 38 }}
            className="absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
          />
        </button>
      </div>

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
