# ShareTexts — F22 Product Experience Map

*The pre-redesign audit. Method: full source reading (App.tsx, SingleScreenApp.tsx
1962 ln, SpaceView.tsx 1051 ln, Docs.tsx, session/space state machines, 46
components, index.css 946 ln), the six prior audits in `docs/audits/` (F14–F19
era), and the live app. Baseline: all 12 verification suites green on `cf735ba`
(§14). This document plans; it changes no product code.*

---

## 0. What exists today (the honest inventory)

The product is **two products on one landing page**:

1. **Room** — a live, synchronous 1–3-device pipe. 6-digit TOTP code / QR /
   link / Nearby. States end completely when you close them. Built, audited
   twice (product-experience, cognitive-load), refined by F16–F19.
2. **Space** — an asynchronous shared shelf, 1 device → many, lifetime
   6h–7d, 8-char code joining (F21). Built about a year of rounds later;
   its UX never got the F16-level treatment.

The single-screen landing (`SingleScreenApp`, 1962 lines) is always the app:
hero → Send/Receive → Temporary Space entry → Nearby dock → demo. Five
PanelModes drive the whole room experience inside it. No router for in-app
navigation; 9 real routes exist (/, /s/:code, /space/:uuid, /space/create,
/space/join, /docs, /privacy, /terms, /about; SPA-404 for the rest).

---

## 1. Journey map (36 flows)

Legend: **→** single primary action. ✅ = verified by an existing suite.
Fail column = what the user sees when it goes wrong.

### Room flows — Room domain (Verified)

| # | Flow | Where | Primary action | Happening now | Next | Back | Preserved | Failure |
|---|---|---|---|---|---|---|---|---|
| A | First-time sender | Landing | **Send** → room opens | Code displays immediately | Share code/QR/link; await peer | Slide-to-confirm Disconnect | Device name; nothing else | Server unreachable → distinct copy + diagnostic (pairing.md ✅) |
| B | First-time receiver | Landing | **Receive** → code field | 6-cell input; auto-submit at 6 | Type/scan code | ✓ | Nothing | Wrong code shakes + clears; never conflated with network down ✅ |
| C | Returning user | Landing | **Reconnect** chip (Stay Connected) | Recent room restored → panel resumes | Continue transfer | Disconnect sheet | Full session (roomId, key, drafts) — resume.mjs ✅ | Room gone → chip hides honestly |
| D | Nearby | Landing/Nearby dock | **Tap device row** | It displayName +ask | Accept on peer | ✓ | Presence only while open 🟡 | Peer declines → back, no dead-end |
| E | Manual code | Landing | **Type 6 digits** | Auto advance/auto-submit | — | ✓ | — | Shake + message ✅ |
| F | QR connect | Landing | **Scan QR** | Camera view lazily loads | Point camera | "type code" link ✓ | — | Camera denied → code fallback ✅ |
| G | Share-link | Link opens | **Join this room?** | Confirm before entering | Confirm | ✓ Fragment token (never logged) ✅ | Nothing pre-confirm | Unknown/expired link → honest copy |
| H | Connected room | Panel `connected` | **Composer** | Roster + live channel | Send/attach; invite 3rd | Disconnect (slide) ✅ | Input draft; messages ✅ | See R |
| I | Send text | Composer | **Enter** | Appears instantly, ✓ Sent + time | Copy / delete | ✓ | Composer kept ✅ | Red try-again; message stays |
| J | Send link | Composer/attach | **Paste link** | Preview card fetch (SSRF-guarded) | Send | ✓ | — | Card unavailable → raw link, honest |
| K | Send image | Attach | **Pick file** | Sending… % + bytes + 1px bar | Cancel | ✓ original bytes (@span) | Queue persists ✅ | See O |
| L | Send file | Attach | **Pick file** | Same, chunked 64KB, SHA-256 	"| Cancel | ✓ Resume mid-file ✅ (resume.mjs) | See O |
| M | Multi-file | Attach ×N | **Attach batch** | Queue; cap notice at N ✅ | Send lot first | ✓ | Draft queue in session store | Per-item retry |
| N | Multi-device | Invite 3rd | **3 devices join** | Roster 3-toned ✅ (worker 103 	👍)") | Send; anyone receives | ✓ | Per-device seat | Seat reclaim on refresh ✅ |
| O | Retry | Failed card | **Retry** | Resends metadata+bytes ✅ (transfer.md) | — | ✓ | Position restored | Persistent fail → still failed, link to troubleshoot |
| P | Cancel | Sending card | **Cancel** | → cancelled (receiver told) ✅ | Retry | ✓ | — | — |
| Q | Failed connection | Connecting panel | **Try again** after 15s hint | Retry or code/QR respec | Start over | ✓ | — | Distinct connectivity copy ✅ |
| R | Interruption | Banner | **Auto; banner states it** | Grace 60s, Reconnect after ✅ | Wait / Reconnect | — | Session + transfers | → DISCONNECTED banner ✅ |
| S | Refresh in-room | Same panel restores | Nothing (auto) | Resume via stored session ✅ | — | — | Room, messages, drafts ✅ | Stale session → landing |
| T | Reopen browser | Landing | **Reconnect chip** | Restored session ✅ (stay-conn) | Continue | Disconnect | Everything above ✅ | Room dead → gone chip |

### Space flows — Space domain (F14/F21, partially audited)

| # | Flow | Where | Primary action | Happening now | Next | Back | Preserved | Failure |
|---|---|---|---|---|---|---|---|---|
| U | Space creation | Landing → sheet | **Create space** | Code-field FIRST ✅ Generate/collision | Verify space live; copy chip | ✓ closes sheet ✅ | Nothing to lose pre-create ⚠️#15 | 409 + suggestion inline ✅ |
| V | Join by code | /space/join sheet | **Type 8 chars** | Auto-submit at 8 ✅ | Land in space | ✓ | Token auto-kept ✅ | No-oracle 404 → copy ✅ (space-code 27/27) |
| W | Returning | Landing Recent row | **Tap row** | `sharetext.space.creds.v1` creds; view opens | Add/download | ✓ | Device key, name, sent drafts ✓ | Expired → "row says closes in…" honest ✓ |
| X | Nearing expiry | Space header | Nothing (system speaks) | ⚠ divergent, see A3 | Extend/close | — | Items | Countdown reaches zero → Y |
| Y | Expiration | — | — | beginExpiry → CLOSED 	ophobia| Alert if open ✅ | ✓ | Deleted server-side ✅ | Late joiner → no-oracle 404 ✅ |
| Z | Closed/invalid space | /space/:uuid or join | **Go back / re-enter** | Stateless closed panel ✅ | Rejoin via new code | — | — | Unknown id → not-found honest ✅ |

### Static content flows

| # | Flow | Primary action | Failure |
|---|---|---|---|
| AA Docs | `/docs` SPA w/ 10 sections; deeplinks (#faq etc.) ✅ | Unknown hash → section picker |
| AB Guides | Static; 17 guides; tap-target + theme.js ✅ | — |
| AC Legal | `/privacy`, `/terms` shells | — |
| AD About | Static guide (no JSON-LD) ✅ (seo 114) | — |
| AE 404 | noindex, links out ✅ | — |

### Platform crosses

| # | Flow | Notes |
|---|---|---|
| AF PWA install/reopen | `InstallNudge` at installable moment; offline → service worker cache; icon opens as app. |
| AG Theme change | `theme.js` pre-paint + transition module; verify-theme 	✅ both branches |
| AH RTL | `dir` on `<html>` via lang=ar; lucide icons LTR-safe 🟡 (arrows not mirrored in all places) |
| AI Mobile | Spaces paste panel, keyboard, safe-areas present; SpaceView had mobile passes 🟡 |
| AJ Desktop | Landing generous spacing; Space is single-column max-w — feels mobile-ish stretched 🟡 |
| AK Slow network | Skeletons not shimmer; code-first flows tolerate; QR lazy-load ✅ |
| AL Unsupported browser | WebRTC missing → blocked screen (verify) 🟡 coverage |

🟡 = found issue, sourced below.

---

## 2. Current vs target IA

**Current (flat):**
```
Landing (SingleScreenApp)
├─ Hero (Send / Receive)          ← room only
├─ Temporary Space section        ← create/join sheets + recent rows
├─ Nearby dock                    ← second connect mechanism
├─ Demo · stats · footer links
└─ Global overlays: QRScan, QRDisplay, Settings, SpaceCreate/Join,
   ConfirmDisconnect, CommandBar, ShareMenu, InstallNudge
Routes outside landing: /docs /privacy /terms /about /s/:code
   /space/:uuid (SpaceView) /space/create /space/join
```

**Target (same shapes, named concepts, two verbs):**
```
ShareTexts
├─ Live transfer (Room)     — "this device ↔ that device, now"
│    entry: Send · Receive · Nearby · Code · QR · Link  (all converge)
└─ Shared shelf (Space)     — "this place holds things for days"
     entry: Create space · Join space · Recent spaces
Docs /privacy /terms /about unchanged. 404 unchanged.
```
The transformation mostly means: **same landing, honest section naming,
spaces gain the room's state discipline**, and duplicated paths collapse.

---

## 3. The ShareTexts mental model (§3 of brief)

> **WHAT DO I WANT TO SEND?** → the composer is universal.
> **WHERE DO I WANT TO SEND IT?** → the connect surface is the same 3 verbs
> (nearby / code / link) regardless of Room vs Space.
> → **DONE.**

- **Primary object:** the thing shared (text/link/photo/file).
- **Primary action:** send / receive (room) — create / join (space).
- **Secondary actions:** QR, share menu, settings, diagnostics (all hidden)
- **Connection concept:** room = a call; **space = a shelf**.
- **Transfer concept:** one object, moves byte-perfect, verified hash.
- **Persistent state:** two lists people care about — recent rooms (1),
  recent spaces (N) — both restore.
- The landing already states this ("Keep files for up to 7 days" vs hero).
  The gap is **Space's interior** not yet speaking it (A3).

---

## 4. Consolidated state model

Four REAL, existing state domains — no fake states, no new enums:

```
ROOM:      does not change. enforceConnectionState() already forbids
           invalid transitions (crew.rs, connectionState.ts 41–69)
TRANSFER:  draft→waiting→preparing→sending/sending-receiving(with
           paused/interrupted) →complete|cancelled|failed  (messageEngine)
SPACE:     creating (client) → ACTIVE(live|offline) → CLOSED(expired|
           closed-early)  (useSpaceClient.ConnState + server states)
NAV:       landing → panel modes → routes; sheets/docks are TRANSIENT
           overlays, not states.
```

Duplications that the product's own model does NOT treat as duplication:

| Duplicated concept | Where both exist | Verdict |
|---|---|---|
| "Connected"-class | Room `CONNECTED` vs Space `conn='live'` | KEEP — different products |
| Waiting-for-peer | Room PAIRING vs Space `connecting` | KEEP |
| Recent entry | Room `Stay Connected` chip + Space recent row | KEEP (different lifetimes) |
| Settings | one overlay total | KEEP |

No giant enum is warranted — the brief's own rule (§4) says UI states must
reflect real state, and forcing Room and Space into one machine would
fabricate states neither domain has. What IS warranted: **audit PanelMode
transitions against enforceConnectionState()** (SingleScreenApp has its own
sync-effect logic; if drift crept in post-F19, it shows as UI claiming
connecting when the machine is in PAIRING, etc.). This is a code-reading
task, not a redesign, and belongs in Phase 1.

---

## 5. Navigation model + sheet classification

Rules (from the brief, made concrete):
1. A route is a place; a sheet is a focused task on a place.
2. Sheets may not span more than one task; pick CLOSE over BACK.
3. Every destructive moment is a ConfirmSheet; every recoverable mistake is
   an icon + label, not a dialog.
4. Never trap state inside a sheet (SpaceCreate pre-create U ⚠️ #15).

Sheet census (all verified names from source):

| Sheet/overlay | Task | Class | Rationale |
|---|---|---|---|
| SpaceCreateSheet | create a space (code-first) | **KEEP** | one task, focused |
| SpaceJoinSheet | join by code/link fallback | **KEEP** | one task |
| ShareSheet (Space) | copy code/link + QR | **KEEP** | one task |
| QRScan overlay | scan a room code | **KEEP** | camera is modal by nature |
| QRDisplay overlay | show room code + copy/share | **KEEP** | |
| SettingsOverlay | theme/lang/stay/reconnect | **KEEP** | global, global place |
| ConfirmDisconnect | room teardown | **KEEP** (Slide-to-confirm on desktop) | destructive |
| OfflineConfirm (InlineConfirm) | network loss retry | **KEEP** (inline > sheet) | |
| SpaceConfirm close | close space early | **KEEP** | destructive |
| CommandBar (⌘K) | keyboard eject | **KEEP** | chrome |
| InstallNudge | PWA offer | **KEEP** | contextual |
| ShareMenu popovers | OS share | **KEEP** | native interop |
| `Buttons that open Sheets from the landing ONLY BEFORE 'connected'` | nav-to-panel | **MERGE →** the panel itself (Notification: send/receive ARE panels) | — |
| `Home `Send text/Receive text` copy under hero` | duplicates hero CTAs | **REMOVE** (redundant labels) | words ≠ mechanism |

No sheet here deserves conversion to a page — the census is remarkably
clean because F16–F19 already did this work once. SpaceJoinSheet
auto-code path (`/space/join?code=` lands on landing → sheet opens)
stays a sheet.

---

## 6. AI-slop inventory (ruthless, with dispositions)

Screens read, again, with F19's bar. Prior audit `design.md` cleaned three
(MEDIUM sent-bubble gradient, attach-menu hues, header copy) — those are
shipped. Current state:

| # | Pattern | Where | Disposition | Why |
|---|---|---|---|---|
| 1 | Two-stop gradients as identity | ONLY in TactileButton (1 file, tokens-driven) and `--gradient-ember` for brand marks | **KEEP** | This IS the brand system (Apple-style tactile button); not slop |
| 2 | Glass/blur | 21 uses, all at floating/sheet elevations, all "over live content" | **KEEP** | Depth grammar is disciplined (3 elevation levels, doc'd) |
| 3 | Glow | none found | — | — |
| 4 | Particles / blobs | none (dot-field is geometry, not particles) | — | — |
| 5 | Meaningless 3D | `isometric/IsometricIllustrations` (Space empty-state + create sheet) | **REWORK** → simple line art or none | Cloys, unrelated to 2D flat system; reads tech-bro-decor |
| 6 | Unnecessary cards | Landing recent-space rows are bordered cards for *one-line info* | **REWORK** → plain rows | "Row not card" already the rule elsewhere |
| 7 | Excessive pills | Segmented create/join pill + code chip + toggle sits near each other on landing | **REWORK** → unify surface (same 4 radii rule) | Keep verbs; unify the shape language so it's one "control band" |
| 8 | Fake dashboards/metrics | The live counter (`960 connections`) is REAL (`/stats` poll) ✅ | **KEEP** | Backed by `/stats` |
| 9 | Fake device activity | HeroDeviceDemo devices are labeled explicitly "demo"/illustration | **KEEP** (honest) | |
| 10 | Fake progress | Transfer % and bytes are real chunk counters ✅ | — | |
| 11 | Generic marketing sections | Landing is a narrative (7-step demo), not stacked sections ✅ | **KEEP** | intentional; do not "section-ify" |
| 12 | Stock illustrations | none (DeviceArt, mockups frames are custom) | — | — |
| 13 | Inconsistent radii | `--st-radius-*` tokens; some raw `rounded-[14px]`/`[24px]` outside tokens | **REWORK** → tokenize | 14/24px are NOT on the 12/16/20 ladder |
| 14 | Inconsistent shadows | elevation ladder + `shadow-float` legacy | **REWORK** → collapse to the 3-step ladder | audit found 1 stray |
| 15 | Typography off-scale | Display font locally only for headline sizes; body uses sans stack correctly | **KEEP** | |
| 16 | Off-brand colors | Azure→ember migration complete in tokens; `apple-*` aliases are the bridge — some raw hex remains in SpaceView ✅ | **REWORK** → replace raw hex with tokens | e.g. `dark:text-[#fb9243]` |
| 17 | Copied-from-unrelated | spaceui components all adapted and verified in use: RateCard renders on the landing; OtpInput is the base of LiveCodeInput (room join); Tooltip + SegmentedToggle serve Space surfaces. Attribution headers present per licensing round. | **KEEP** | none |
| 18 | Animation w/o purpose | Motion tokens module governs; demo slider is functional; celebration room-enter particle *nudge* (celebrateConnected) | **REWORK** → restraint: keep handshake, drop confetti-style accents if any remain | |
| 19 | Noise competing with primary actions | Landing is dense; sections are visually equal in weight | **REWORK** → space-entry quiet pass (one weight, three sizes) | The F22 landing-class pass |

The rare case where a rework-eslint phrase is warranted leaves for
Phase 2's slop file (§9 seq). Nothing here is REMOVE-without-replacement.

---

## 7. Component inventory (46 total, notable)

| Group | Components | State |
|---|---|---|
| **Brand** | ShareTextsLogo, BrandLockup, DeviceArt, mockup frames | solid |
| **Controls** | TactileButton, IconButton3D, SlideToConfirm, StandardSwitch, SegmentedToggle, InlineConfirm, ConfirmSheet, SystemAlert, AnnotatedHint | tokenized ● |
| **Code surfaces** | LiveCodeDisplay (room 40px TOTP), LiveCodeInput (6-cell), spaceui/OtpInput (used by Space join?) 🟡 | — unify behind one `code surface` API in Phase 2 |
| **Presence** | PresenceDock, NearbyDetectOverlay, NearbyDevices | room-scoped |
| **Transfer** | MessageCard, AttachmentPanel, TransferFlight, FileTypeIcon, speedEngine, transferScheduler (lanes), transferStore (resume) | engine is the deepest, most-tested layer |
| **Sheets** | OverlaySheet, ConfirmSheet, SettingsOverlay, ShareMenu, InstallNudge, CommandBar, skeleton states | solid |
| **Isometric** | IsometricIllustrations (space empty states) | 🟡 flagged (#5) |
| **Marketing** | FaqSection, DataFlow, PlatformStrip, SiteFooter (Docs page) | Docs-only |

Non-component libs worth naming: `motion.ts` (easing/duration tokens), 
`haptics.ts` (impact patterns), `themeTransition.ts` (paint-lock), 
`diag.ts` (window.__sharetextDiag), `roomBadge.ts` (tab identity),
`speedEngine`, `transferScheduler` (bulk/control lanes with backpressure).

---

## 8. Design-system inventory (what tokens exist)

index.css (946 ln): 29 alias families (`--color-apple-*` bridge → ember),
semantics (FBDC/azure/ember eras — all now aliases), control tokens
(`--st-control-sm 36/md 44/lg 52`), radius ladder (`12/16/20`), elevation
(3-step ladder + hairline rules per theme), two brand gradients (one
direction), dot-grid background, skeleton shimmer, typing/backdrop rules,
focus-visible ring, `motion-reduce` variants throughout.

**Gaps:** radii used raw ([14px], [24px], [10px]) bypass the ladder; a few
Space header hexes bypass the color aliases. Both fall under Phase 1
token-linting, no visual change intended.

---

## 9. Problems to fix next (duplication inventory, consolidated)

1. **🟠 A. Space has no state model of its own.** Space flows X/Y (nearing
   expiry, expired) have real server states but the client renders
   countdown only. The brief's rule (UI reflects real state) is met
   partially: the banner exists but has no **action**. P1 — Space header
   must gain an explicit expiry action (extend or close) once the server
   supports it, or an honest "rooms close at <time> — content deletes"
   always-visible line. Server work may be required (new route).
2. **🟠 B. Recent-spaces rows stay forever** (`api.ts` keeps creds until
   space close expires them — verified eager). If the row is dead (expired),
   landing still shows "reopen" which then fails. Client should prune or
   grey rows older than expiresAt. P0/P1 — cheap, honest.
3. **✅ C. Time-left formatting is already unified.** Both surfaces use the
   same helpers (`space/time.ts`): landing rows call `remainingShortOf`,
   SpaceView countdown calls `remainingShort` + `closingTime` + real
   `urgencyTier`. No work needed; verified during F22 recon. (Was listed as
   a suspected P2 — cleared on inspection.)
4. **🟡 D. Two code-input components** (LiveCodeInput 6-digit vs
   space code input field). Unify behind one component with size/length
   props in Phase 2 only if the DOM allows; visual harmonization first.
   P2.
5. **🟡 E. Hero copy reference density.** "Keep files and text for up to
   7 days" is a Space sentence on a page whose primary fold is Room. Gate
   it behind the space entry line (drop from hero). P1 copy only.
6. **✅ F. `spaceui/rating` RateCard** — verified in use: rendered on the
   landing (`<RateCard autoShow …>` at order-45, the feedback card).
   Not orphaned — keep. Open question is only placement (below the
   space-entry band) after the F22 landing pass. P2, layout-only.
7. **🟡 G. PanelMode sync effect** vs `enforceConnectionState()` — recheck
   after F19 (shine: enforceConnectionState enforced in SessionContext;
   SingleScreenApp maintains its own `panelMode` transitions. Verify
   match. P1 (read-only).
8. **🟡 H. InstallNudge surfacing** — confirm the "installable moment" still
   exists post-PWA-changes (pwaInstall.ts exists; nudge component imported
   in App+main). P2.
9. **🟡 I. RTL arrow mirroring** — `ArrowLeft/Right` in SpaceView and
   chevrons probably need `[dir=rtl]` flips; lucide provides none
   automatically. P2 sweep.
10. **🟠 J. Space share** — code chip in header + share sheet exist, but
    both rely on correct `localCode()`; verify — spaceCode.ts is the
    source of truth. ✅ via space-code suite.

---

## 10. Verified technical basis

For the record, this audit ran:

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 |
| verify-room-flow (:3012) | ✅ 11/11 |
| verify-space-code.mjs | ✅ 27/27 |
| verify-space.mjs | ✅ 42/42 |
| verify-space-ui.mjs | ✅ 10/10 |
| verify-seen / verify-resume | ✅ / ✅ |
| verify-landing-onescreen | ✅ 7/7 |
| verify-brand-assets | ✅ 13 |
| verify-guide-taps | ✅ 40/40 |
| verify-theme | ✅ |
| verify-worker.mjs | ✅ 103/103 |

No functional bugs found that block redesign understanding. Two
honesty-severity notes carried to §9 (B and A) are product issues, not
regressions.

---

## 11. Highest-leverage sequence (order of the actual transformation)

**Phase 1 — honesty/consistency (each item verifiable by existing suites)**
1. Recent-space pruning/grey-out (mod: api.ts + landing rows) — fixes B.
2. Space expiry **action** + always-visible close-time line (SpaceView
   header) — fixes A partially without server work.
3. Token sweep: radii/shadows/raw-hex → `st-` ladder + aliases (index.css +
   touched components only). No visual change intended, lint-enforced.
4. PanelMode ↔ enforceConnectionState() reconciliation read + one test.
5. ~~RateCard audit~~ — verified in use (landing feedback card); skip.
6. Copy pass: hero Space-sentence gating; small labels unify (`remainingShortOf`).

**Phase 2 — the Space interior (the real transformation)**
7. Space header/first-boot redesign to the Room's grade: composer, keyboard,
   safe-area, panel-mode parity; drive with `useSpaceClient` real states
   (no decorative states).
8. Unify code-entry surfaces (one API); translate SpaceJoin auto-submit UX
   into the room's LiveCodeInput grammar.
9. Space share: one "share the shelf" moment (QR + code + link in one sheet,
   matching the Room's QRDisplay pattern).
10. landing Space-entry band unification.

**Phase 3 — polish/platform**
11. RTL arrow/chevron sweep.
12. InstallNudge audit; offline PWA state.
13. Isometric illustration rework/replacement.
14. Perf for search: defer non-critical space bundle if budget allows
    (all three: verify-space-ui, verify-seo, verify-worker must stay green
    after every phase; commit per phase).

---

## 12. Files/components affected per phase

- **P1:** `src/lib/space/api.ts` (prune), `src/views/SingleScreenApp.tsx`
  (recent rows, hero copy gating), `src/views/SpaceView.tsx` (expiry line,
  token sweep), `src/index.css` (tokens), `scripts/verify-guide-taps.mjs`
  (copy tests may reference strings), `docs/audits/*` (no).
- **P2:** `SpaceView.tsx` (major), `components/LiveCodeInput.tsx` ↔
  `spaceCode` input unify, new `components/space/*` as needed,
  `SingleScreenApp.tsx` (entry band).
- **P3:** RTL utility classes in `index.css` or `motion.ts`, InstallNudge,
  `IsometricIllustrations`.

Every change stays inside the existing architecture: no router, no state
library, no component library install. Verification scripts keep passing
(they are the definition of done here).

---

## 13. Risks to existing functionality

| Risk | Mitigation |
|---|---|
| Recent-space pruning deleting live creds (bug B) | Prune by expiresAt only, never by "not opened lately"; retain creds of fearures? = test both paths |
| Space expiry action needing server support | Ship client-only first (visible close-time); extend API later |
| Code-input unification breaking auto-submit semantics (room TOTP rotation vs space static code) | Only the *visual* layer unifies; behaviors stay domain-owned |
| Token sweep touching >N files without visual change | Changes are mechanical; run full battery + one screenshot diff after |
| SpaceView rewrite breaking F21's verified flows | verify-space-ui + verify-space-code + space 42 stay the gate, run before/after every hunk |
| Command bar celebrate / celebration overlay | Keep; only restraint adjustments |
| i18n: every copy change ×9 locales | Use existing key renames only; en-is-fallback rule documented |

---

## 14. Test results (baseline run for this audit, exact)

```
tsc --noEmit                       → exit 0
verify-room-flow.mjs (:3012)       → 11/11 passed (exit 0)
verify-space-code.mjs              → 27 passed, 0 failed (exit 0)
verify-space.mjs                   → 42 passed, 0 failed (exit 0)
verify-space-ui.mjs (:3012)        → 10 passed, 0 failed (exit 0)
verify-seen.mjs (:3012)            → passed (exit 0)
verify-resume.mjs (:3012)          → passed (exit 0)
verify-landing-onescreen.mjs       → 7/7 one-screen, 0 failing sizes (exit 0)
verify-brand-assets.mjs            → ALL BRAND CHECKS GREEN (13)
verify-guide-taps.mjs              → checks failing: 0 of 40 (exit 0)
verify-theme.mjs (:3012)           → passed (exit 0)
verify-worker.mjs                  → 103 passed, 0 failed (exit 0)
```
Dev server: tsx on :3012 via the workspace launcher (pid 21560), ALLOWED_ORIGINS set.

*(All suites re-runnable from root: `URL=http://localhost:3012 node scripts/verify-*.mjs`.)*

---

## 15. Bottom line

The room product is at its audited, disciplined best. The Space is the
product's real redesign surface — and the highest-leverage move is **not
the landing, not the room: it is giving SpaceView the same state-discipline
treatment the room already has**, while Phase 1 buys honesty fixes (recent
rows, expiry actions, token hygiene) that are cheap, zero-risk, and
compound into Phase 2.
