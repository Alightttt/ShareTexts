# ShareText — Cognitive Load Audit

Goal: minimize decisions, clicks, fields, and concepts. Measured per flow from the
shipped code. A first-time user should only need: **Connect · Send · Receive · Copy**.

## Per-flow accounting

| Flow | Decisions | Clicks | Fields | Concepts introduced | Verdict |
|---|---|---|---|---|---|
| Create session | 1 (click Create) | 1 | 0 | 0 (the code card appears) | ✅ minimal |
| Join by code | 1 (type 6 digits) | 1 | 1 | 0 | ✅ auto-submits at 6 digits |
| Join by QR | 1 (point camera) | 2 | 0 | 0 | ✅ secondary, not primary |
| Join by link | 1 (confirm) | 2 | 0 | 0 | ✅ safety confirm is worth it |
| Wait for peer | 0 | 0 | 0 | "LIVE CODE" only | ✅ |
| Send text | 1 (type) | 1 (Send / ⌘⏎) | 1 | 0 | ✅ |
| Send photo/file | 2 (pick type, pick file) | 3 | 0 | 0 | ✅ menu is 4 flat rows |
| Copy received | 1 | 1 | 0 | 0 | ✅ per-message Copy + Copy All |
| Transfer progress | 0 | 0 | 0 | "Sending… 34%" + bytes | ✅ |
| Disconnect | 0 (auto-reconnect) | 0 | 0 | "Your other device disconnected." | ✅ |
| Reconnect | 1 (Reconnect button) | 1 | 0 | 0 | ✅ shown only when recovery fails |
| Close room | 1 (confirm dialog) | 2 | 0 | 0 | ✅ confirm prevents accidents |
| Expired room | 0 | 1 ("Start New Session") | 0 | 0 | ✅ |

**Worst case to first transfer: 2 decisions, 2 clicks, 1 field.**

## Technical concepts the UI exposes (and why each is acceptable)

- **"room"** ("This room stays open for hours") — product-y word, matches "Join this
  room?" confirm. Keep.
- **"encrypted relay"** (How-this-works panel) — this is a *privacy disclosure*, not a
  feature explainer; it must be honest. Keep, with corrected wording (see security audit).
- **Connection popover (relay/direct/local)** — hidden behind a small text tap; uses
  plain-language sentences. This is developer detail, but it's *behind* a decision point
  and the plain-language framing ("a direct connection wasn't available") is fine.

## Things that were reduced

- Header badge: "Connected with ShareText" → **"Connected"** (one less weird concept).
- Sent-bubble gradient flattened → solid azure (less visual noise per message).
- Attachment menu: four loud hues → one muted ink (fewer competing signals).

## Confusion risks checked

- **Create-then-wait**: creator lands on the code card, never on an empty chat; the
  joiner lands on "Connecting…", never on a fake green badge. The optimistic-connect
  bug that previously caused both was fixed in the bug batch.
- **Wrong code vs. network failure**: distinct, friendly messages ("That code isn't
  active." vs. "Couldn't reach ShareText.") — a connectivity failure never reads as a
  wrong code.
- **Failed file**: card keeps filename/size, shows "Couldn't send this file." + Retry
  that actually resends. No dead UI.
- **Stale room**: "This session has expired." + Start New Session. No dead ends.

## Final test

"A person who has never seen ShareText should be able to transfer something without
reading documentation." — **Passes.** Type a code (or scan) → it appears on the other
device. No WebRTC/signaling/STUN/TURN/encryption concept is required to complete the
primary flows.
