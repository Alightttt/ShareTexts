import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Smartphone, ArrowRight, Zap, Eye, EyeOff, RefreshCw, Search, Check, X, Wifi } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { nearbyPresence, isPresenceHidden, setPresenceHidden, type NearbyDevice } from '../lib/nearby';
import { getRecentDevices, recordRecentDevice, isTrustedToken, forgetRecentDevice, resolveLiveToken, lastSeenParts } from '../lib/pairing';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/SessionContext';
import { ConfirmSheet } from './ConfirmSheet';
import { hapticTap } from '../lib/haptics';
import { cn } from '../lib/utils';
/**
 * NearbyDevices — the landing-page discovery section.
 *
 * The section EXPLAINS ITSELF instead of leaving people wondering why a
 * device is missing (local-network discovery is genuinely unreliable —
 * guest networks, AP isolation, VPNs — so the honest states are):
 *
 *   SEARCHING  "Looking for nearby devices…" + the one fix that matters:
 *              "both devices on the same Wi-Fi".
 *   FOUND      tappable rows for live devices; trusted ones show ✓ and a
 *              one-tap Send button (auto-accept is pairwise on both sides).
 *   FALLBACK   after the search grace, "Can't see your device?" + the
 *              "Use another way" group — code, QR, and link, the methods
 *              that never depend on the local network.
 *
 * A "Recent devices" memory lists everyone this device has paired with;
 * connecting again re-invites them when they're nearby, and marks the
 * row "last seen" honestly when they're not.
 *
 * Hierarchy: Nearby is the PRIMARY path; code/QR/link live in one quiet
 * secondary group — a new user never has to weigh four equal mechanisms.
 *
 * Device names render as React text nodes only — never dangerouslySetInnerHTML.
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

/** How long "Looking for nearby devices…" runs before the fallback shows.
 *  Short enough to never feel dead, long enough that a normal LAN answers. */
const SEARCH_GRACE_MS = 12_000;

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
  // Recents memory: re-read whenever a pairing lands or another tab changes it.
  const [recents, setRecents] = useState(() => getRecentDevices());
  // The fallback ("Can't see your device?") appears only after the search
  // grace — presence answers within a couple of seconds on a normal LAN.
  const [searchExpired, setSearchExpired] = useState(false);
  // True while OUR invite is awaiting an answer — suppresses auto-accept on
  // the inviter side so a mutual tap can't race into two rooms.
  const invitingRef = useRef(false);

  /* --- recents subscription -------------------------------------------- */
  useEffect(() => {
    const refresh = () => setRecents(getRecentDevices());
    window.addEventListener('sharetext:recents', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('sharetext:recents', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

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

  // The search grace: fallback copy appears only after we've genuinely
  // waited — and the timer resets whenever the first devices arrive.
  useEffect(() => {
    const timer = setTimeout(() => setSearchExpired(true), SEARCH_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (devices.length > 0) setSearchExpired(true);
  }, [devices.length]);

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
    // Trust: a token this device has PAIRED with before skips the sheet.
    // (Presence tokens rotate with the worker; after a rotation the sheet
    // returns — the conservative outcome, and the pairing re-learns it.)
    if (!invitingRef.current && isTrustedToken(inv.from)) {
      const timer = setTimeout(() => { void answerInviteRef.current(true, inv); }, 0);
      return () => clearTimeout(timer);
    }
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
      // Memory: remember who we just paired with (both sides learn the other
      // — the inviter learns on the invite-result below).
      recordRecentDevice(inv.from, inv.name);
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
        // Memory: the invitee accepted — record the pairing on this side too.
        recordRecentDevice(prev.device.id, prev.device.name);
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

  /* --- derived ------------------------------------------------------------ */
  // A remembered device is "nearby" when its remembered name matches a live
  // presence row (presence tokens rotate with the worker; names are what
  // people recognize). LIVE recents already render in the Nearby rows above
  // (trusted, with a one-tap Send) — the Recent section lists only the ones
  // NOT present right now, honestly marked "last seen …", never fake-live.
  const recentRows = useMemo(() => recents
    .map(r => ({ ...r, liveToken: resolveLiveToken(r.name, devices) }))
    .filter(r => r.liveToken === null)
    .slice(0, 4), [recents, devices]);
  const busyId = phase.kind === 'inviting' ? phase.device.id : null;
  const busyName = phase.kind === 'inviting' ? phase.device.name : null;
  const waiting = devices.length === 0;

  // The section hides while seated in a room; the connecting phase keeps it
  // mounted so the status line stays honest until the room takes over.
  if (!idle || phase.kind === 'connecting') return null;

  const lastSeenLabel = (ts: number) => {
    const { unit, n } = lastSeenParts(ts);
    if (unit === 'now') return t('nearby.seenNow');
    if (unit === 'min') return t('nearby.seen', { n });
    if (unit === 'hour') return t('nearby.seenHour', { n });
    return t('nearby.seenDay', { n });
  };

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
              {devices.map((d, i) => {
                const trusted = isTrustedToken(d.id);
                const busy = busyId === d.id || busyName === d.name;
                return (
                  <motion.button
                    key={d.id}
                    type="button"
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    transition={{ type: 'spring', bounce: 0.25, duration: 0.4, delay: i * 0.04 }}
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
                      <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45 flex items-center gap-1">
                        {busy ? t('nearby.waiting') : trusted ? (
                          <><Check className="w-3 h-3 text-status-success" strokeWidth={2.5} /> {t('nearby.trusted')}</>
                        ) : t('nearby.nearby')}
                      </span>
                    </span>
                    {trusted && !busy && (
                      <span className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[11.5px] font-semibold text-[#f06413] dark:text-[#fb9243] group-hover:bg-[#f06413] group-hover:text-white dark:group-hover:bg-[#fb9243] dark:group-hover:text-[#1a1208] transition-colors">
                        <ArrowRight className="w-3 h-3" /> {t('nearby.send')}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recent devices — the memory. Live ones already sit in the Nearby
          rows; this lists the ones NOT present right now, with an honest
          "last seen" instead of pretending they're around. */}
      <AnimatePresence>
        {recentRows.length > 0 && (
          <motion.div
            key="recent-devices"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="mt-4 w-full"
          >
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-apple-ink-muted/70 dark:text-white/35 mb-2">
              {t('nearby.recentTitle')}
            </p>
            <div className="flex flex-col gap-2">
              {recentRows.map((r) => (
                <motion.div
                  key={r.token + r.name}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  className="group flex items-center gap-3 px-3.5 py-2.5 rounded-[14px] text-left border bg-apple-parchment/50 dark:bg-white/[0.02] border-apple-divider/30 dark:border-white/[0.04] transition-all"
                >
                  <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40">
                    <DeviceGlyph name={r.name} />
                  </span>
                  <span className="flex-1 flex flex-col min-w-0 leading-tight">
                    <span className="text-[13px] font-semibold text-apple-ink dark:text-white truncate">{r.name}</span>
                    <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">
                      {t('nearby.offline', { when: lastSeenLabel(r.lastConnectedAt) })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { forgetRecentDevice(r.token); setRecents(getRecentDevices()); }}
                    aria-label={t('nearby.forget')}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-apple-ink-muted/50 dark:text-white/30 hover:text-status-danger hover:bg-status-danger/10 active:scale-90 transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SEARCHING — the self-explaining empty state. The radar ring breathes
          while the pool is empty; the hint names the one fix that matters. */}
      <AnimatePresence>
        {waiting && (
          <motion.div
            key="nearby-searching"
            data-testid="nearby-searching"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2.5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] bg-apple-parchment/60 dark:bg-white/[0.03] border border-apple-divider/40 dark:border-white/[0.06]"
          >
            <span className="relative shrink-0 w-7 h-7 flex items-center justify-center" aria-hidden>
              <span className="absolute inset-0 rounded-full border border-[#f06413]/25 dark:border-[#fb9243]/25 st-halo-ring" />
              <Search className="relative w-3.5 h-3.5 text-[#f06413]/70 dark:text-[#fb9243]/70" strokeWidth={2.2} />
            </span>
            <span className="flex-1 flex flex-col min-w-0 leading-tight">
              <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">{t('nearby.searching')}</span>
              <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45 flex items-center gap-1">
                <Wifi className="w-3 h-3" aria-hidden /> {t('nearby.searchingHint')}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FALLBACK — after the grace, name the reality and offer the paths
          that never depend on the local network. Never shown while devices
          are live. */}
      <AnimatePresence>
        {waiting && searchExpired && (
          <motion.div
            key="nearby-fallback"
            data-testid="nearby-fallback"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            className="mt-2.5 w-full"
          >
            <p className="text-[12.5px] font-semibold text-apple-ink dark:text-white mb-2">{t('nearby.nothingFound')}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { hapticTap(); (window as Window & { __stOpenReceive?: () => void }).__stOpenReceive?.(); }}
                data-testid="fallback-code"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] text-[12.5px] font-semibold text-apple-ink dark:text-white active:scale-[0.97] transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /> {t('nearby.fallbackCode')}
              </button>
              <span className="flex items-center text-[11px] font-medium text-apple-ink-muted/60 dark:text-white/30 px-1">
                {t('nearby.useAnotherWay')}
              </span>
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
