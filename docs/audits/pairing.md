# ShareText — Universal Pairing Audit

Pairing must work with no camera, no permission, on any screen, on a desktop without
one. The **six-digit code is the foundation**; QR and links are convenience.

## Verification

- **Code-first** — Create shows a large 6-digit code (LiveCodeDisplay, 40px mono
  digits, 30s TOTP rotation with a countdown ring). Join is a large 6-cell input.
  ✅ Code works with zero permissions, no camera, any screen size.
- **Auto-format / auto-submit** — the join input strips non-digits, caps at 6, and
  submits the instant the 6th digit lands. Paste is supported (input is a real text
  field with `inputMode="numeric"`). ✅
- **Auto-focus** — the input focuses on mount and after errors. ✅
- **QR is secondary** — "Scan QR instead" is a small secondary affordance on the join
  screen; `html5-qrcode` is lazy-loaded and its failure path (`onErrorFallback`)
  returns the user to the code tab. On the creator side, QR display is a collapsible
  card. ✅ Never the only mechanism.
- **Link** — Copy/Share Nearby on the creator; `?join=<roomId>` on the joiner shows a
  "Join this room?" confirm. ✅

## Error copy vs. the brief

| Situation | Brief suggested | Shipped |
|---|---|---|
| Wrong code | "That code doesn't match." | "That code isn't active. Check the other device and try the latest code." ✅ better |
| Expired | "This session has expired." | "This session has expired." ✅ |
| Full | "This session already has two devices." | "This session already has two devices." ✅ |
| Network | "Couldn't connect. Trying again…" | "Couldn't reach ShareText." + specific origin/config diagnostics ✅ |

The app never conflates "code is wrong" with "network is down" (the two have separate,
deliberately distinct messages).

## Link design note

Share links encode the internal `roomId` (a random 128-bit UUID). It is a capability
token, not a guessable sequence — room discovery by guessing is infeasible, and the
room caps at two seats so a leaked link admits at most one extra device. The brief's
`sharetext.app/join/ABC123` idea would require a short-code *mapping* server; the
tradeoff is that a code-based link dies when the TOTP rotates (every 40s, anchored to room creation), while the
UUID link survives the session. Kept as-is, documented in the security audit.

## Gaps / follow-ups

- QR scanning needs a secure context + camera permission; the fallback path is solid
  but untested on real devices — worth a device-lab pass before launch.
- The join confirm screen ("Join this room?") is a good safety decision; consider
  showing the code digits' first 2 chars in the confirm for link-vs-code confidence.
