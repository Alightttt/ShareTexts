import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
// Gravity UI icons aliased onto the names this file already uses (the
// slashed wifi glyph is the one Gravity has no equivalent for).
import { ArrowRight, Thunderbolt as Zap, Eye, EyeSlash as EyeOff, ArrowRotateRight as RefreshCw, Magnifier as Search, Check, Xmark as X, QrCode, Link as Link2 } from '@gravity-ui/icons';
import { Wifi } from 'lucide-react';
import { SpinLoader } from './SpinLoader';
import { getSocket } from '../lib/socket';
import { nearbyPresence, isPresenceHidden, setPresenceHidden, type NearbyDevice, type IncomingInvitation } from '../lib/nearby';
import { getRecentDevices, recordRecentDevice, isTrustedToken, forgetRecentDevice, resolveLiveToken, lastSeenParts } from '../lib/pairing';
import { useI18n } from '../lib/i18n';
import { useSession } from '../lib/SessionContext';
import { NearbyDetectOverlay } from './NearbyDetectOverlay';
import { DeviceArt } from './DeviceArt';
import { StandardSwitch } from './StandardSwitch';
import { productEvent } from '../lib/telemetry';
import { cn } from '../lib/utils';
import { DeviceLinkIllustration } from './DeviceLinkIllustration';

/* ONE ghost-pill recipe (usability audit #2): Code / QR / Link fallbacks and
   the failure card's QR escape all share this exact style — hover, active,
   focus ring included — so secondary actions read as one family. */
const pillGhost = cn(
  'flex items-center gap-1.5 px-3.5 py-2 rounded-full',
  'bg-white dark:bg-white/[0.06] border border-apple-divider/60 dark:border-white/10',
  'hover:bg-apple-parchment dark:hover:bg-white/[0.08] text-apple-ink dark:text-white',
  'text-[13px] font-semibold active:scale-[0.97] transition-all',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-azure-500'
);
/**
 * NearbyDevices — the landing-page discovery section.
 *
 * The section EXPLAINS ITSELF instead of leaving people wondering why a
 * device is missing (local-network discovery is genuinely unreliable —
 * guest networks, AP isolation, VPNs — so the honest states are):
 *
 *   SEARCHING  "Looking for nearby devices…" + the one fix that matters:
 *              "both devices have ShareTexts open".
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
 * Auto-connect — the MUTUAL CONFIRMED flow. A device with autoConnect on
 * doesn't connect silently: when another device appears nearby, BOTH landing
 * pages pop the detection overlay (NearbyDetectOverlay) — glyph, name,
 * browser, "a nearby device detected" — and the connect only happens after
 * the two-step in-button confirmation ("Connect with this device?" → "Yes").
 * Incoming invitations from TRUSTED (previously paired) devices still skip
 * the overlay on the receiving side — the sender confirmed twice already —
 * and auto-connect ON auto-accepts incoming invites on the receiving side
 * for the same reason. OFF by default, remembered per device.
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

/** Local overlay target: the NearbyDevice plus the truth it announced. */
type OverlayTarget = NearbyDevice;

/** Remembered devices store a name, not a kind — the same honest heuristic
 *  the old glyph used picks phone vs desktop for the recents art. */
function kindFromName(name: string): 'phone' | 'tablet' | 'desktop' {
  return /iphone|ipad|android|phone|mobile/i.test(name) ? 'phone' : 'desktop';
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
      className="flex items-center gap-2.5 py-2 min-h-[44px]"
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
        <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{title}</span>
        <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/45">{hint}</span>
      </span>
      {/* THE standard switch of this app — ThemeToggle's exact geometry
          (56×26 track, 34×22 thumb), one silhouette everywhere. */}
      <StandardSwitch
        checked={active}
        onChange={onClick}
        ariaLabel={ariaLabel}
        testId={testId}
      />
    </div>
  );
}

export function NearbyDevices({ onStatus }: { onStatus?: (s: string | null) => void }) {
  const { t } = useI18n();
  const { session, createSession, joinWithLink } = useSession();
  const idle = !session.roomId;

  const [devices, setDevices] = useState<NearbyDevice[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [autoOn, setAutoOn] = useState<boolean>(() => isAutoConnectEnabled());
  /* --- the mutual-confirm detection overlay -------------------------------
     target: the device BOTH overlays are about (detected mode on the leader
     side, incoming mode on the receiving side). busy: the handshake is in
     flight — the overlay shows a spinner and swallows double taps. */
  const [overlayTarget, setOverlayTarget] = useState<NearbyDevice | null>(null);
  const [overlayMode, setOverlayMode] = useState<'detected' | 'incoming'>('detected');
  const [overlayBusy, setOverlayBusy] = useState(false);
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
  // waited — and the timer resets whenever the first devices arrive. The
  // detection overlay PAUSES the grace (the user is looking at a popup,
  // not at the search row) so "Can't see your device?" never fights it.
  useEffect(() => {
    if (overlayTarget) return;
    const timer = setTimeout(() => setSearchExpired(true), SEARCH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [overlayTarget]);
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

  /* --- the MUTUAL CONFIRMED overlay ---------------------------------------
     Auto-connect ON: when a nearby device appears, BOTH landing pages pop
     the SAME detection overlay ("a nearby device detected" + glyph + name +
     browser), each with the two-step confirm — "Connect with this device?"
     arms, "Yes" commits. Whichever side commits first invites; the other
     side's popup flips to its incoming form ("{name} wants to connect" + a
     single Yes). Nothing connects silently, ever — the confirmations ARE
     the flow. If both sides confirm into the crossing, the pending invite
     wins and the crossed one times out harmlessly. */
  // Per-device cooldown so a cancelled/failed target isn't instantly
  // re-popped (45s — long enough to breathe, short enough to retry).
  const autoCooldownRef = useRef<Map<string, number>>(new Map());
  const AUTO_COOLDOWN_MS = 45_000;
  useEffect(() => {
    // Trigger: auto-connect ON — or this device still holds a Stay Connected
    // room (a stay pair opening ShareTexts on both devices gets the SAME
    // confirmed overlay, with the ∞ badge riding next to the name).
    if ((!autoOn && !session.lastStayRoom) || phase.kind !== 'idle' || overlayTarget || devices.length === 0) return;
    // TRUSTED devices connect with ZERO taps when auto-connect is ON — that
    // is the entire product promise of the switch ("connect automatically").
    // The receiver's side already auto-accepts an invitation from a trusted
    // token (see the onInvitation trust ladder), so the sender popping a
    // modal anyway forced a tap on BOTH devices and made "auto" connect feel
    // permanently broken. A trusted pair is a device the user paired with
    // before; the first pair still gets the full confirmed overlay.
    if (autoOn) {
      const now = Date.now();
      const trustedTarget = devices.find(d => isTrustedToken(d.id) && (autoCooldownRef.current.get(d.id) ?? 0) < now);
      if (trustedTarget) {
        const self = nearbyPresence.getSelfToken();
        // Only the SMALLER presence token auto-invites. Two trusted devices
        // with auto-connect ON would otherwise BOTH invite at the same
        // instant, both auto-accept, and each join the other's room — two
        // rooms, each with one lonely occupant staring at "waiting". The
        // tiebreak makes exactly one side the inviter; the other side's
        // trust ladder accepts the incoming invite. Same rule as the
        // crossing resolver in onInvitation below.
        if (!self || self < trustedTarget.id) {
          setPhase({ kind: 'inviting', device: trustedTarget });
          productEvent('product.method_nearby');
          void nearbyPresence.invite(trustedTarget.id).then(delivered => {
            if (delivered) return true; // receiver auto-accepts; the invite result finishes the join
            setPhase({ kind: 'error', text: t('nearby.failTitle', { name: trustedTarget.name }) });
            setFailedDevice(trustedTarget);
            return false;
          });
          return;
        }
        // This side holds the larger token: fall through to the detected
        // overlay. The trusted peer (smaller token, auto ON) invites us and
        // the trust ladder accepts — and if it never does (its auto is OFF),
        // the user still gets the manual confirm here.
      }
    }
    const now = Date.now();
    const target = devices.find(d => (autoCooldownRef.current.get(d.id) ?? 0) < now);
    if (!target) return;
    setOverlayMode('detected');
    setOverlayTarget(target);
    productEvent('product.method_nearby');
  }, [autoOn, session.lastStayRoom, phase.kind, overlayTarget, devices]);

  // The device the overlay is about went away (tab closed, withdrew): the
  // overlay follows reality instead of pointing at a ghost.
  useEffect(() => {
    if (!overlayTarget) return;
    if (devices.some(d => d.id === overlayTarget.id)) return;
    setOverlayTarget(null);
    setOverlayBusy(false);
  }, [devices, overlayTarget]);

  // The invitation currently on the table (if any) — the overlay's Yes
  // accepts it instead of sending a crossing invite of our own.
  const pendingInviteRef = useRef<IncomingInvitation | null>(null);

  /* --- incoming invitation ------------------------------------------------ */
  useEffect(() => nearbyPresence.onInvitation((inv: IncomingInvitation) => {
    // A live session outranks everything: an invite that arrives after this
    // device already connected (the race when BOTH sides tap Yes at once, or
    // a redelivered invite from a churned socket) must NOT pop an overlay on
    // top of an active room — and must not be accepted.
    if (session.roomId) {
      nearbyPresence.answerInvite(inv.from, false);
      return;
    }
    // Any auto-accept below decides the pairing — an overlay about THIS
    // device is now stale either way, so it never outlives the decision.
    const clearOverlayFor = () => {
      if (overlayTarget?.id !== inv.from) return;
      if (pendingInviteRef.current?.from === inv.from) pendingInviteRef.current = null;
      setOverlayTarget(null);
      setOverlayBusy(false);
    };
    // Trust ladder: (1) a previously PAIRED device always skips the popup —
    // auto-connect ON or OFF: the sender already confirmed twice.
    // (2) Otherwise the overlay answers it — 'incoming' mode if the popup
    // is already up, opened fresh if not. Never a silent accept.
    // (Presence tokens rotate with the worker; after a rotation trust
    // downgrades to the confirmed popup — the conservative outcome.)
    if (isTrustedToken(inv.from)) {
      clearOverlayFor();
      const timer = setTimeout(() => { void answerInviteRef.current(true, inv); }, 0);
      return () => clearTimeout(timer);
    }
    // Mutual confirm: OUR invite to this same device is in flight — both
    // sides said "Yes" within the crossing window. That IS mutual consent:
    // accepting creates the room here and seats the inviter via the result.
    // BUT both sides can accept-and-invite simultaneously (both taps land in
    // the same second), and then each joins the OTHER's room — two rooms,
    // each with one lonely device. The tiebreak: the SMALLER presence token
    // is the designated inviter and declines the crossed invite; the larger
    // token yields and accepts. Exactly one room results, deterministically.
    if (phase.kind === 'inviting' && phase.device.id === inv.from) {
      const self = nearbyPresence.getSelfToken();
      if (self && self < inv.from) {
        nearbyPresence.answerInvite(inv.from, false); // my invite wins; its result completes the join
        return () => {};
      }
      clearOverlayFor();
      const timer = setTimeout(() => { void answerInviteRef.current(true, inv); }, 0);
      return () => clearTimeout(timer);
    }
    pendingInviteRef.current = inv;
    if (phase.kind !== 'idle') return; // busy elsewhere — result will decline it
    if (overlayTarget && overlayTarget.id === inv.from) {
      setOverlayMode('incoming'); // same device — flip the popup in place
      return;
    }
    if (overlayTarget) return; // a different popup is up — leave it
    setOverlayMode('incoming');
    setOverlayTarget({ id: inv.from, name: inv.name, kind: inv.kind, browser: inv.browser, model: inv.model, gpu: inv.gpu });
    productEvent('product.method_nearby');
  }), [phase.kind, overlayTarget, session.roomId]);

  /* --- overlay actions ----------------------------------------------------- */
  /** "Yes" — the commit step. With a real invitation pending (the other
   *  side confirmed first) it accepts and creates the room; otherwise it
   *  sends OUR invite, and the other side's popup flips to incoming. */
  const handleOverlayConnect = useCallback(async (device: NearbyDevice) => {
    setOverlayBusy(true);
    const pending = pendingInviteRef.current;
    if (pending && pending.from === device.id) {
      pendingInviteRef.current = null;
      await answerInviteRef.current(true, { from: pending.from, name: pending.name, kind: pending.kind, browser: pending.browser, model: pending.model, gpu: pending.gpu });
      setOverlayBusy(false);
      setOverlayTarget(null);
      return;
    }
    setPhase({ kind: 'inviting', device });
    setFailedDevice(null);
    const delivered = await nearbyPresence.invite(device.id);
    if (!delivered) {
      setOverlayBusy(false);
      setOverlayTarget(null);
      setFailedDevice(device);
      setPhase({ kind: 'error', text: t('nearby.failTitle', { name: device.name }) });
      return;
    }
    // Delivered: the receiver's popup flips to its incoming form and its
    // single "Yes" completes the pairing. The overlay closes when the
    // invite result / connection takes over (or the user cancels).
    setOverlayBusy(false);
  }, [t]);

  /** Cancel / ✕ / backdrop: close without deciding. A cooldown keeps the
   *  dismissed target from instantly re-popping the popup. */
  const closeOverlay = useCallback(() => {
    if (overlayTarget) {
      if (pendingInviteRef.current?.from === overlayTarget.id) pendingInviteRef.current = null;
      autoCooldownRef.current.set(overlayTarget.id, Date.now() + AUTO_COOLDOWN_MS);
    }
    setOverlayTarget(null);
    setOverlayBusy(false);
  }, [overlayTarget]);

  /* --- outgoing invite (rows / recents) ----------------------------------- */
  const handleInvite = useCallback(async (device: NearbyDevice): Promise<boolean> => {
    productEvent('product.method_nearby');
    // A direct row tap supersedes whatever the popup was showing.
    setOverlayTarget(null);
    setOverlayBusy(false);
    setPhase({ kind: 'inviting', device });
    setFailedDevice(null);
    const delivered = await nearbyPresence.invite(device.id);
    if (!delivered) {
      // Named failure + the two honest ways out (retry / QR).
      setFailedDevice(device);
      setPhase({ kind: 'error', text: t('nearby.failTitle', { name: device.name }) });
      return false;
    }
    // Delivery ≠ acceptance. If the other device declines/expires, the
    // presence_invite_result listener below resolves the phase to an error.
    return true;
  }, [t]);

  /* --- the invitee side: accept creates the room ------------------------- */
  const answerInvite = useCallback(async (
    accepted: boolean,
    override?: { from: string; name: string; kind?: 'phone' | 'tablet' | 'desktop'; browser?: string },
  ) => {
    const inv = override;
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
  }, [createSession, t]);
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
      // Declined or gone — the popup (if still open) says so, then closes.
      setOverlayBusy(false);
      setOverlayTarget(null);
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
  // The Stay Connected promise rides with the device: when this device still
  // holds a stay room, the detection overlay says so with the ∞ badge.
  const stayBadgeForOverlay = !!session.lastStayRoom;

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
            <p className="text-[12px] font-semibold uppercase tracking-wide text-apple-ink-muted/70 dark:text-white/35 mb-2">
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
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.34, delay: i * 0.04 }}
                    onClick={() => handleInvite(d)}
                    disabled={phase.kind !== 'idle'}
                    aria-label={t('nearby.connectAria', { name: d.name })}
                    className={cn(
                      'group flex items-center gap-3 px-3.5 py-3 min-h-[56px] rounded-[14px] text-left',
                      'bg-white dark:bg-apple-tile-1 border border-apple-divider/50 dark:border-apple-tile-3 shadow-xs',
                      'hover:border-[#f06413]/40 dark:hover:border-[#fb9243]/45 hover:shadow-card',
                      'active:scale-[0.985] transition-all',
                      'disabled:opacity-50 disabled:pointer-events-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/60'
                    )}
                  >
                    <span className={cn(
                      'relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#f06413] dark:text-[#fb9243]',
                      busy
                        ? 'bg-[#f06413] dark:bg-[#fb9243] text-white dark:text-[#1a1208]'
                        : 'bg-[#f06413]/10 dark:bg-[#fb9243]/15'
                    )}>
                      {busy && <span aria-hidden className="absolute -inset-1 rounded-full border border-[#f06413]/40 dark:border-[#fb9243]/40 st-halo-ring" />}
                      <DeviceArt kind={d.kind} model={d.model} gpu={d.gpu} size={36} />
                    </span>
                    <span className="flex-1 flex flex-col min-w-0 leading-tight">
                      <span className="text-[13.5px] font-semibold text-apple-ink dark:text-white truncate">{d.name}</span>
                      <span className={cn(
                        'text-[12.5px] font-medium flex items-center gap-1',
                        busy
                          ? 'text-[#f06413] dark:text-[#fb9243] font-semibold'
                        : 'text-apple-ink-muted dark:text-white/45'
                      )}>
                        {busy ? t('nearby.waiting') : trusted ? (
                          <><Check className="w-3 h-3 text-status-success" strokeWidth={2.5} /> {t('nearby.trusted')}</>
                        ) : t('nearby.nearby')}
                      </span>
                    </span>
                    {busy ? (
                      <SpinLoader size={16} className="text-[#f06413] dark:text-[#fb9243]" aria-hidden />
                    ) : trusted ? (
                      <span
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[12px] font-semibold text-[#f06413] dark:text-[#fb9243] group-hover:bg-[#f06413] group-hover:text-white dark:group-hover:bg-[#fb9243] dark:group-hover:text-[#1a1208] transition-colors"
                        aria-hidden
                      >
                        <ArrowRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                      </span>
                    ) : (
                      <ArrowRight
                        className="shrink-0 w-4 h-4 text-apple-ink-muted/40 dark:text-white/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#f06413] dark:group-hover:text-[#fb9243] motion-reduce:transition-none"
                        aria-hidden
                      />
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
            <p className="text-[12px] font-semibold uppercase tracking-wide text-apple-ink-muted/70 dark:text-white/35 mb-2">
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
                  transition={{ type: 'spring', bounce: 0, duration: 0.32 }}
                  className="group flex items-center gap-3 px-3.5 py-3 min-h-[52px] rounded-[14px] text-left border bg-apple-parchment/50 dark:bg-white/[0.02] border-apple-divider/30 dark:border-white/[0.04] transition-all"
                >
                  <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40">
                    <DeviceArt kind={kindFromName(r.name)} size={36} className="opacity-80" />
                  </span>
                  <span className="flex-1 flex flex-col min-w-0 leading-tight">
                    <span className="text-[13px] font-semibold text-apple-ink dark:text-white truncate">{r.name}</span>
                    <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/45">
                      {t('nearby.offline', { when: lastSeenLabel(r.lastConnectedAt) })}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { forgetRecentDevice(r.token); setRecents(getRecentDevices()); }}
                    aria-label={t('nearby.forget')}
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-apple-ink-muted/50 dark:text-white/30 hover:text-status-danger hover:bg-status-danger/10 active:scale-90 transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
            className="mt-2.5 flex items-center gap-2.5 px-1 py-1"
          >
            <span className="relative shrink-0 w-7 h-7 flex items-center justify-center" aria-hidden>
              <span className="absolute inset-0 rounded-full border border-[#f06413]/25 dark:border-[#fb9243]/25 st-halo-ring" />
              <Search className="relative w-3.5 h-3.5 text-[#f06413]/70 dark:text-[#fb9243]/70" strokeWidth={2.4} />
            </span>
            <span className="flex-1 flex flex-col min-w-0 leading-tight">
              {/* The standing instruction, promoted to the searching state's
                  title: "Open ShareTexts in another device" IS what waiting
                  means here. Deliberately NOT a card — the surrounding rows
                  are buttons, and an identical container reads as clickable
                  when it isn't (usability audit #8/#9): status is typography,
                  actions are surfaces. */}
              <span className="text-[13px] font-semibold text-apple-ink dark:text-white">{t('nearby.hint')}</span>
              <span className="text-[13px] font-medium text-apple-ink-muted dark:text-white/45 flex items-center gap-1">
                {searchExpired
                  ? <><Wifi className="w-3 h-3" aria-hidden /> {t('nearby.searchingHint')}</>
                  : t('nearby.waitingOther')}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTROLS — visibility and auto-connect live here, always findable
          while nothing is connected yet: the two switches that shape
          discovery sit exactly where a user wondering "why can't I see my
          device" will look. Rows, not cards — settings, not actions. */}
      <AnimatePresence>
        {waiting && (
          <motion.div
            key="nearby-controls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-2 w-full px-1"
          >
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
              onClick={() => { setPresenceHiddenState(h => { setPresenceHidden(!h); return !h; }); }}
            />
            <ToggleRow
              testId="auto-connect-toggle"
              rowTestId="auto-connect-row"
              icon={<Zap className="w-3.5 h-3.5" strokeWidth={2.2} />}
              active={autoOn}
              title={t('nearby.autoTitle')}
              hint={t('nearby.autoHint')}
              ariaLabel={t('nearby.autoTitle')}
              onClick={() => { setAutoOn(v => { setAutoConnectEnabled(!v); return !v; }); }}
            />
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
            /* Visual haptic: the card answers a failed invite with the same
               horizontal head-shake the code input uses for a wrong code —
               one denial language across the app. Stripped under
               reduced-motion by the global MotionConfig. */
            animate={{ opacity: 1, y: 0, x: [0, -7, 7, -5, 5, 0] }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.3, x: { duration: 0.45, ease: 'easeInOut' } }}
            role="alert"
            data-testid="nearby-failure-card"
            className="mt-2.5 w-full px-3.5 py-3 rounded-[14px] bg-status-danger/[0.06] dark:bg-status-danger/[0.08] border border-status-danger/25"
          >
            {/* The two-device composition in its error state: the link is
                cut, ember-tinted, partner dimmed. It explains "the two of
                you didn't connect" faster than any adjective — and the
                small scale keeps it subordinate to the copy and actions. */}
            <div className="flex items-center gap-3">
              <div className="shrink-0 hidden sm:block -my-1" aria-hidden>
                <DeviceLinkIllustration state="error" width={120} className="text-apple-ink-muted dark:text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-status-danger">{phase.text}</p>
                {failedDevice && (
                  <>
                    <p className="mt-1 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug">
                      {t('nearby.failBody')}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid="nearby-fail-retry"
                        onClick={() => { void handleInvite(failedDevice); }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-apple-ink dark:bg-white text-white dark:text-night-900 text-[13px] font-semibold active:scale-[0.97] transition-all min-h-[36px]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> {t('nearby.failRetry')}
                      </button>
                      <button
                        type="button"
                        data-testid="nearby-fail-qr"
                        onClick={() => { (window as Window & { __stOpenSendQr?: () => void }).__stOpenSendQr?.(); }}
                        className={pillGhost}
                      >
                        <QrCode className="w-3.5 h-3.5" /> {t('nearby.failUseQr')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
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
            onClick={() => { setWhyOpen(o => !o); }}
            className="flex items-center gap-1.5 px-1.5 -mx-1.5 my-1 min-h-[40px] text-[13px] font-semibold text-apple-ink-muted dark:text-white/50 hover:text-apple-ink dark:hover:text-white transition-colors"
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
                    <li key={k} className="flex items-start gap-2.5 py-1 text-[13px] font-medium text-apple-ink-muted dark:text-white/50 leading-snug">
                      <span className="shrink-0 w-4 h-4 mt-px rounded-full bg-apple-divider/50 dark:bg-white/[0.08] flex items-center justify-center text-[10px] font-bold text-apple-ink-muted dark:text-white/50 tnum" aria-hidden>{i + 1}</span>
                      {t(`nearby.${k}`)}
                    </li>
                  ))}
                  {/* The two controls that shape discovery live exactly where
                      someone debugging "why can't we see each other" will
                      look for them — inside the helper, not floating above
                      it as permanent clutter. */}
                  {/* Controls live in the main section now (see nearby-controls);
                      the helper stays pure help. */}
                </div>
              </motion.ol>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* THE mutual-confirm detection overlay — auto-connect ON pops it on
          both devices; incoming invites flip it to their incoming form. */}
      <NearbyDetectOverlay
        mode={overlayMode}
        device={overlayTarget ? { name: overlayTarget.name, kind: overlayTarget.kind, browser: overlayTarget.browser, model: overlayTarget.model, gpu: overlayTarget.gpu } : null}
        busy={overlayBusy || phase.kind === 'inviting'}
        stayBadge={stayBadgeForOverlay}
        onConnect={() => { if (overlayTarget) void handleOverlayConnect(overlayTarget); }}
        onCancel={closeOverlay}
        onFindMore={closeOverlay}
      />
    </div>
  );
}
