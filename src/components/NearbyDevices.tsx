import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Smartphone, ArrowRight, Zap, Eye, EyeOff, RefreshCw, Search, Check, X, Wifi, QrCode, Link2 } from 'lucide-react';
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

/** A settings row with a switch — the compact shape the visibility and
 *  auto-connect controls share inside the helper panel. */
function ToggleRow({ icon, active, title, hint, onClick, ariaLabel, testId, rowTestId }: {
  icon: React.ReactNode; active: boolean; title: string; hint: string;
  onClick: () => void; ariaLabel: string; testId: string; rowTestId: string;
}) {
  return (
    <div
      data-testid={rowTestId}
      className="flex items-center gap-2.5 py-2"
    >
      <span
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
          active
            ? 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]'
            : 'bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40'
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1 flex flex-col min-w-0 leading-tight">
        <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">{title}</span>
        <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        data-testid={testId}
        aria-label={ariaLabel}
        onClick={onClick}
        className={cn(
          'relative shrink-0 w-[44px] h-[28px] rounded-full transition-colors duration-200 outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#f06413]/40',
          active ? 'bg-[#f06413] dark:bg-[#fb9243]' : 'bg-apple-divider dark:bg-white/20'
        )}
      >
        <motion.span
          initial={false}
          animate={{ x: active ? 18 : 0 }}
          transition={{ type: 'spring', stiffness: 550, damping: 38 }}
          className="absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        />
      </button>
    </div>
  );
}

export function NearbyDevices({ onStatus, showFallback = true }: { onStatus?: (s: string | null) => void; showFallback?: boolean }) {
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
  // Which device a failed invite refers to — the failure card is about a
  // NAME ("Couldn't connect to iPhone"), never a bare "failed".
  const [failedDevice, setFailedDevice] = useState<NearbyDevice | null>(null);
  // The expandable "Why isn't my device showing?" helper.
  const [whyOpen, setWhyOpen] = useState(false);
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

  /* --- outgoing AUTO-INVITE ----------------------------------------------
     Auto-connect until now only auto-ACCEPTED incoming invites — two idle
     trusted devices would stare at each other forever, each waiting for the
     other to tap. With the toggle ON, the moment a remembered (previously
     paired) device appears live, THIS side invites it. Consent holds:
     strangers always get the sheet; trusted devices have already said yes
     once, and their side auto-accepts (or auto-invites first — the loser
     of that race just gets 'declined' and stops). */
  const autoInvitedRef = useRef<Set<string>>(new Set());
  // handleInvite is defined below this effect; the ref keeps the auto-invite
  // effect dependency-clean while always calling the freshest version.
  const handleInviteRef = useRef<(device: NearbyDevice) => Promise<void>>(async () => {});
  useEffect(() => {
    if (!autoOn || phase.kind !== 'idle' || invitation || devices.length === 0) return;
    const live = recents
      .map(r => ({ ...r, liveToken: resolveLiveToken(r.name, devices) }))
      .find(r => r.liveToken && !autoInvitedRef.current.has(r.name));
    if (!live) return;
    autoInvitedRef.current.add(live.name);
    const device = devices.find(d => d.id === live.liveToken);
    if (device) void handleInviteRef.current(device);
  }, [autoOn, phase.kind, invitation, devices, recents]);

  /* --- incoming invitation ---------------------------------------------- */
  useEffect(() => nearbyPresence.onInvitation(inv => {
    // Trust ladder: (1) a previously PAIRED device always skips the sheet —
    // auto-connect ON or OFF. (2) Auto-connect ON accepts ANY nearby device
    // without the sheet — that is precisely what the toggle promises
    // ("connect automatically when a nearby device taps you"), and it's
    // what makes two opted-in devices find each other with zero taps.
    // (3) Otherwise the consent sheet shows.
    // (Presence tokens rotate with the worker; after a rotation the sheet
    // returns for unpaired devices — the conservative outcome.)
    if (!invitingRef.current && (isTrustedToken(inv.from) || autoOn)) {
      const timer = setTimeout(() => { void answerInviteRef.current(true, inv); }, 0);
      return () => clearTimeout(timer);
    }
    // Ignore while busy with another connection flow.
    setInvitation(prev => (prev ? prev : inv));
  }), [autoOn, invitation]);

  /* --- outgoing invite --------------------------------------------------- */
  const handleInvite = useCallback(async (device: NearbyDevice) => {
    hapticTap();
    setPhase({ kind: 'inviting', device });
    setFailedDevice(null);
    invitingRef.current = true;
    const delivered = await nearbyPresence.invite(device.id);
    invitingRef.current = false;
    if (!delivered) {
      // Named failure + the two honest ways out (retry / QR).
      setFailedDevice(device);
      setPhase({ kind: 'error', text: t('nearby.failTitle', { name: device.name }) });
      return;
    }
    // Delivery ≠ acceptance. If the other device declines/expires, the
    // presence_invite_result listener below resolves the phase to an error.
  }, [t]);
  handleInviteRef.current = handleInvite;

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
      const timer = setTimeout(() => { setPhase({ kind: 'idle' }); setFailedDevice(null); }, 12000);
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
              {/* ALIVE: the title itself carries the state — one device found
                  reads differently from three, and the count moves as devices
                  come and go. No separate "device found" banner needed. */}
              {devices.length === 1 ? t('nearby.countOne') : t('nearby.countMany', { n: devices.length })}
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
              {/* The standing instruction, promoted to the searching state's
                  title: "Open ShareTexts in another device" IS what waiting
                  means here — not a decorative line floating elsewhere. */}
              <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">{t('nearby.hint')}</span>
              <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45 flex items-center gap-1">
                {searchExpired
                  ? <><Wifi className="w-3 h-3" aria-hidden /> {t('nearby.searchingHint')}</>
                  : t('nearby.waitingOther')}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FALLBACK — after the grace, name the reality and offer the paths
          that never depend on the local network. Never shown while devices
          are live. */}
      <AnimatePresence>
        {waiting && searchExpired && showFallback && (
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
              <button
                type="button"
                onClick={() => { hapticTap(); (window as Window & { __stOpenSendQr?: () => void }).__stOpenSendQr?.(); }}
                data-testid="fallback-qr"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] text-[12.5px] font-semibold text-apple-ink dark:text-white active:scale-[0.97] transition-all"
              >
                <QrCode className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /> {t('nearby.showQr')}
              </button>
              <button
                type="button"
                onClick={() => { hapticTap(); (window as Window & { __stOpenSendLink?: () => void }).__stOpenSendLink?.(); }}
                data-testid="fallback-link"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 hover:bg-apple-parchment dark:hover:bg-white/[0.08] text-[12.5px] font-semibold text-apple-ink dark:text-white active:scale-[0.97] transition-all"
              >
                <Link2 className="w-3.5 h-3.5 text-apple-ink-muted dark:text-white/50" /> {t('nearby.shareLink')}
              </button>
            </div>
            <p className="mt-2 text-[11px] font-medium text-apple-ink-muted/60 dark:text-white/30">{t('nearby.keepOpenHint')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAILURE — a name, the one fix that matters, and the two honest
          ways out. Never a bare "Connection failed." */}
      <AnimatePresence>
        {phase.kind === 'error' && (
          <motion.div
            key={`error:${phase.text}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            role="alert"
            data-testid="nearby-failure-card"
            className="mt-2.5 w-full px-3.5 py-3 rounded-[14px] bg-status-danger/[0.06] dark:bg-status-danger/[0.08] border border-status-danger/25"
          >
            <p className="text-[12.5px] font-semibold text-status-danger">{phase.text}</p>
            {failedDevice && (
              <>
                <p className="mt-1 text-[11.5px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug">
                  {t('nearby.failBody')}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-testid="nearby-fail-retry"
                    onClick={() => { hapticTap(); void handleInvite(failedDevice); }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[12px] font-semibold active:scale-[0.97] transition-all min-h-[36px]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t('nearby.failRetry')}
                  </button>
                  <button
                    type="button"
                    data-testid="nearby-fail-qr"
                    onClick={() => { hapticTap(); (window as Window & { __stOpenSendQr?: () => void }).__stOpenSendQr?.(); }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10 text-[12px] font-semibold text-apple-ink dark:text-white active:scale-[0.97] transition-all min-h-[36px]"
                  >
                    <QrCode className="w-3.5 h-3.5" /> {t('nearby.failUseQr')}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* WHY ISN'T MY DEVICE SHOWING? — the expandable truth about local
          networks. Collapsed it costs one line; expanded it answers the
          question support tickets are made of. */}
      {waiting && (
        <div className="mt-2">
          <button
            type="button"
            data-testid="nearby-why-toggle"
            aria-expanded={whyOpen}
            onClick={() => { hapticTap(); setWhyOpen(o => !o); }}
            className="flex items-center gap-1.5 px-1 py-1 text-[12px] font-semibold text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors"
          >
            {t('nearby.whyTitle')}
            <motion.span animate={{ rotate: whyOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex" aria-hidden>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
            </motion.span>
          </button>
          <AnimatePresence>
            {whyOpen && (
              <motion.ol
                key="why-open"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-1.5 px-3.5 py-3 rounded-[14px] bg-apple-parchment/60 dark:bg-white/[0.03] border border-apple-divider/40 dark:border-white/[0.06]">
                  {(['why1', 'why2', 'why3', 'why4', 'why5'] as const).map((k, i) => (
                    <li key={k} className="flex items-start gap-2.5 py-1 text-[12px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug">
                      <span className="shrink-0 w-4 h-4 mt-px rounded-full bg-apple-divider/50 dark:bg-white/[0.08] flex items-center justify-center text-[9.5px] font-bold text-apple-ink-muted dark:text-white/50 tnum" aria-hidden>{i + 1}</span>
                      {t(`nearby.${k}`)}
                    </li>
                  ))}
                  {/* The two controls that shape discovery live exactly where
                      someone debugging "why can't we see each other" will
                      look for them — inside the helper, not floating above
                      it as permanent clutter. */}
                  <div className="mt-2 pt-2 border-t border-apple-divider/40 dark:border-white/[0.06]">
                    <ToggleRow
                      testId="nearby-visibility-toggle"
                      rowTestId="nearby-visibility-row"
                      icon={presenceHidden
                        ? <EyeOff className="w-3.5 h-3.5" strokeWidth={2.2} />
                        : <Eye className="w-3.5 h-3.5" strokeWidth={2.2} />}
                      active={!presenceHidden}
                      title={presenceHidden ? t('nearby.hiddenTitle') : t('nearby.visibleWhileOpen')}
                      hint={presenceHidden ? t('nearby.hiddenHint') : t('nearby.visibleWhileOpenHint')}
                      ariaLabel={t('nearby.visibleTitle')}
                      onClick={() => { hapticTap(); setPresenceHiddenState(h => { setPresenceHidden(!h); return !h; }); }}
                    />
                    <ToggleRow
                      testId="auto-connect-toggle"
                      rowTestId="auto-connect-row"
                      icon={<Zap className="w-3.5 h-3.5" strokeWidth={2.2} />}
                      active={autoOn}
                      title={t('nearby.autoTitle')}
                      hint={t('nearby.autoHint')}
                      ariaLabel={t('nearby.autoTitle')}
                      onClick={() => { hapticTap(); setAutoOn(v => { setAutoConnectEnabled(!v); return !v; }); }}
                    />
                  </div>
                </div>
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}

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
