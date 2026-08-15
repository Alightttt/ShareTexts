# ShareText — Full Product Experience Audit

Audit against the product goal: **"Move something from one device to another
with almost no thought."** Method: a real two-device walkthrough
(`scripts/audit-states.mjs`) captured what a first-time user actually sees in
every state; each state below answers *what the user knows, needs to know,
what's unnecessary, what's dominant, the next action, and what a first-time
user could confuse*. Issues are ranked P0 → P3; nothing P3 was touched while
P0/P1 existed.

## State-by-state

| State | What the user knows | What's dominant | Next action | First-time confusion | Verdict |
|---|---|---|---|---|---|
| LANDING | Two CTAs: Send text / Receive text | Hero + CTAs | Tap one | None — mental model stated in copy | ✅ |
| CREATE SESSION | One tap created a room | The live code | Send it to the other device | None | ✅ |
| WAITING FOR PEER | "Connect your other device", code refreshes every 40s | The code (digits scale to ~56px on desktop) | Open it on the other device | None | ✅ |
| JOIN SESSION / ENTER CODE | "Enter the code from your other device" | The 6-digit input (auto-focus, auto-advance, auto-submit) | Type the code | None — wrong codes shake + clear with a plain message | ✅ |
| QR SCANNING | Secondary option | Camera view | Point at the code | Camera denied → "Enter the code instead" fallback | ✅ |
| CONNECTING | "Connecting…", a 15s hint then "Try again" | Brand mark packet + status | Wait, or Try again | None — no bare spinner | ✅ |
| CONNECTED / EMPTY ROOM | "Your private clipboard" — paste anything, it appears on the other device | Composer + hint | Paste or type | None | ✅ |
| TEXT SENT / RECEIVED | "✓ Sent •" / "Received •" + time, Copy per message | The bubble | Copy | None | ✅ |
| IMAGE / VIDEO / FILE TRANSFER | "Sending…/Receiving… 42%" + bytes + progress bar + Cancel | The card | Wait or cancel | None — receiver sees what arrived, its size, and Save/Download when done | ✅ |
| TRANSFER COMPLETE | "Sent • 2 MB" / "Received • 2 MB" with Save/Download/Copy actions | The card | Save / Download / Copy | None | ✅ |
| TRANSFER FAILED | "Couldn't send this file." + Retry | Error + Retry | Retry | None | ✅ |
| RECONNECTING | "Your other device disconnected. Waiting for reconnect…" | Banner | Wait (auto) or Reconnect | None | ✅ |
| PEER DISCONNECTED | Same banner; the room stays open | Banner + Reconnect | Reconnect or re-share the code | None | ✅ |
| ROOM EXPIRED / CLOSED | "Session ended." + reason + "Start New Session" | The settled brand check | Start a new session | None | ✅ |
| SERVER UNAVAILABLE | Distinct copy per failure class ("Couldn't reach ShareText." vs "This session already has two devices.") | Error + retry path | Try again | None — wrong-code never masquerades as connectivity | ✅ |

## Issues found (ranked)

**P0 — broken / unreliable:** none in the happy path on either transport
(transfer, resume, reconnect, rejoin all verified green).

**P1 — serious usability:**
1. **Device identity is inconsistent and generic.** The WebRTC hello reads the
   device name from `localStorage`, which was only written when the user
   *edited* the name — so the RoomHub name row showed the platform guess
   ("Guest Windows PC") while the chat header and message labels showed
   "Guest Device". Two devices defaulted to the *same* name, so the receiver
   could not tell who sent what — a direct miss on "who/which device sent it".
   *Fix:* persist the platform guess on first load so every surface agrees
   (hello, header, name row, message labels). Done — `SessionContext` writes
   the guess once; the receiver now sees "Guest iPhone"/"Guest Windows PC" and
   the sender's edited name on reconnects.
   *Remaining tradeoff:* two same-platform devices still share a default until
   one is renamed — the edit affordance on the Connect screen covers it
   without forcing a name prompt on everyone.

**P2 — important polish:**
1. Generic spinners in the code-verification and camera-startup states were
   replaced with the brand mark's connecting motion (a packet traveling the
   beam) — a consistent identity while waiting, with the reduced-motion still
   frame. The tiny in-button spinner on the link-confirm "Connect" button was
   kept (conventional, expected at that size).
2. (Already shipped in earlier passes: direction-aware "That's it" copy,
   receiver-first card actions, Enter-to-send, honest offline empty state.)

**P3 — optional refinements (deferred, not blockers):**
- Per-transfer SHA-256 integrity check surfaced in the UI ("Transfer failed
  integrity check") — protocol fields are ready, verification is not wired.
- Read receipts ("seen" on the sender's side).
- Automatic name suggestions for same-platform pairs at first connect.

## Lens applied

Every proposed change was checked against six dimensions — comprehension,
usability, reliability, trust, speed, accessibility — and kept only if it
improved at least one. The one P1 fix improves comprehension (who sent what)
and trust (the name you set is the name they see). The spinner replacements
improve trust (consistent identity) and accessibility (reduced-motion frame)
while adding no new motion where text already communicates.
