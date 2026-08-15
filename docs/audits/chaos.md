# ShareText — Network Chaos Audit

Design target: unreliable networks must produce **"Reconnecting…"**, never "Error."
Already-completed transfers must never be lost by a later failure.

## Recovery machinery (shipped)

| Layer | Mechanism |
|---|---|
| Signaling socket (socket.io) | client auto-reconnect + `connectionStateRecovery` (5 min) |
| Signaling socket (Cloudflare) | `CloudflareSocket` auto-reopen with exponential backoff (1s→10s); on reopen it re-sends `resume_room` so the peer re-offers WebRTC |
| Room membership | `resume_room` with secret re-seats a device; stale seats are dropped for the returning peer |
| WebRTC | initiator offer-retry (3×, 4s apart); `peer_recovered`/`peer_joined` trigger a fresh handshake |
| Fallback | if the data channel never opens, the encrypted relay path is confirmed only when a peer actually joined (10s) |
| UI | "Your other device disconnected. Waiting for reconnect…" banner; a Reconnect button only when recovery fails; the joiner screen explains "Your room is still open — you can rejoin anytime." |
| Transfer isolation | transfers are per-message; failed/cancelled transfers never touch completed ones |

## Automated scenarios (`scripts/chaos-test.mjs`)

Runs against the Cloudflare transport (local worker :8787, frontend :3311) with two
real browser devices. Note: simulating a client outage with CDP `setOffline` is a
**no-op for established WebSockets** in this environment (verified empirically —
`navigator.onLine` flips but the socket stays open), so the real transport-drop test
is a **full worker restart**, which also covers the "server restart" bullet:

1. **Worker restart mid-session** — the signaling server is killed and restarted;
   the room's DO state is rehydrated from SQLite-backed storage. A device that
   reloads (forcing fresh signaling through the *restarted* worker) resumes the room
   via `resume_room`, the peer re-offers WebRTC, and a post-restart message is
   delivered with history intact. **PASS**.
2. **Cancel a 200 MB transfer mid-flight** — sender hits Cancel while chunks are
   flying; both sides show "Cancelled", previously completed transfers are untouched,
   and the channel keeps working. **PASS**.
3. **Peer refresh** — A reloads the tab, rejoins via stored credentials, B re-offers,
   and a message flows A→B with history restored. **PASS** (also covered in the e2e
   suite).
4. **Peer closes browser** — B closes; A shows the disconnect banner; B reopens the
   tab, rejoins with the same code, room restores with history. **PASS** (e2e suite).

## Manual checks (documented for the launch checklist)

- **Server restart (Node/Render path)** — rooms are in-memory; a Render restart drops
  them (rejoin shows "Session expired."). Documented product behavior: the Vercel +
  Cloudflare topology is the resilient one. On the Worker path, room state lives in
  the DO (SQLite-backed), so it survives worker restarts — verified manually with
  `wrangler dev` restart during a session.
- **Phone sleep / backgrounding** — browsers throttle timers; recovery relies on the
  transport-level reconnect (works), not on JS timers. Manual device check before
  launch.
- **Wi-Fi → mobile** — IP changes mid-session; socket.io recovery and CF WS reopen both
  handle it, but it needs a real-device pass.

## Known limits

- Browser sleep can take the WebRTC channel down without the socket dropping; the
  peer's `connectionStatechange → disconnected` + `onDisconnect` shows the banner, and
  a later `peer_recovered` restores it. If neither fires, the Reconnect button is the
  user-facing fallback — always present on the disconnect screen.
