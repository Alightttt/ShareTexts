# ShareText — Free-First Realtime Architecture (Cloudflare Workers + Durable Objects)

> Migration design + implementation notes. The goal: the signaling layer costs
> **$0/month** at early scale while keeping production-grade room semantics.

---

## 1. Current architecture

```
Browser A ── socket.io (wss) ──┐
                                ├── Node.js server (Express + socket.io)
Browser B ── socket.io (wss) ──┘     ├─ rooms in memory (Map)
                                     ├─ TOTP pairing codes (otpauth)
                                     ├─ WebRTC signaling relay
                                     ├─ encrypted message relay fallback
                                     └─ serves the built frontend in prod
```

- **Frontend:** Vercel (static). **Signaling:** one long-running Node process.
- **Protocol:** socket.io over a single shared WebSocket per browser.
- **Room state:** in-memory `Map<string, Room>` on the Node server, keyed by a
  server-generated UUID. `roomId` + a 128-bit base32 `secret` are handed to the
  creator; the joiner proves membership with a rotating 6-digit TOTP code or a
  join link (`?join=<roomId>`), then the secret.
- **Transfer:** WebRTC DataChannel (text + 64KB encrypted chunks, 200MB cap).
  When the channel is unavailable, an **encrypted relay fallback** forwards the
  already-AES-GCM-encrypted payloads through the signaling server (string ≤ 512KB,
  binary chunk ≤ 128KB).
- **Security:** every payload is AES-256-GCM encrypted client-side with a
  PBKDF2 key derived from the room secret — the secret never leaves the two
  devices, so **relayed content is not readable by the relay** (metadata only).
  CORS allowlist, per-IP rate limits, payload size caps.

### Socket event map (the contract to preserve)

| Event (client → server) | Payload | Ack |
|---|---|---|
| `create_room` | — | `{success, roomId, secret}` |
| `join_with_code` | `{code}` | `{success, roomId, secret}` |
| `join_with_link` | `{roomId, secret?}` | `{success, roomId, secret}` |
| `resume_room` | `{roomId, secret}` | `{success, roomId, secret}` |
| `signal` | `{roomId, to, signal}` | `{success}` |
| `relay_message` | `{roomId, data}` (string/ArrayBuffer) | `{success}` |
| `close_room` | `{roomId}` | — |

| Event (server → client) | Payload |
|---|---|
| `peer_joined` | `{peerId}` |
| `peer_recovered` | `{peerId}` |
| `peer_disconnected` | `{peerId, remaining}` |
| `room_closed` | `{reason}` |
| `signal` | `{from, signal}` |
| `relay_message` | `{from, data}` |

## 2. Target architecture

```
Browser A ── WebSocket ──┐
                         ├── Cloudflare Worker (entry) ── Durable Object "Room" (per room)
Browser B ── WebSocket ──┘            ├─ room state in DO storage
                                      ├─ WebSocket Hibernation API
                                      ├─ TOTP validation (Web Crypto)
                                      └─ signaling + encrypted relay forward
                    ┌──────────────────┴──────────────────┐
                    │  Durable Object "Registry" (per day) │  code → roomId lookup
                    └─────────────────────────────────────┘

Vercel (static frontend) ── VITE_SIGNALING_URL=https://…workers.dev ──┘
```

- **Same event surface** — the client keeps the exact socket.io-style events
  listed above; a thin `CloudflareSocket` transport shim maps them onto a
  minimal JSON WebSocket protocol (`{id, event, payload}` → `{type:"ack"|"event"}`).
- **Files:**
  - `worker/src/index.ts` — Worker entry: `GET /health`, `GET /ws` upgrade →
    Room DO, `POST /lookup` → Registry DO. Origin allowlist.
  - `worker/src/room.ts` — `Room` Durable Object: room state, pairing, join,
    resume, signaling relay, encrypted-message relay, expiry, presence.
  - `worker/src/registry.ts` — `Registry` Durable Object (one per UTC day):
    maps `roomId → {secret, expiresAt}` so a 6-digit code can locate a room
    without scanning every room DO.
  - `worker/src/totp.ts` — RFC 6238 TOTP (SHA-1, 6 digits, 30s, ±1 window)
    implemented on Web Crypto — no dependencies, matches `otpauth` exactly.
  - `src/lib/cloudflareSocket.ts` — browser transport shim.

## 3. Why the target is better for ShareText

| | Node (today) | Cloudflare Workers + DO |
|---|---|---|
| Cost | $7–25/mo paid tier (free tiers sleep after 15 min) | **$0** on the free plan for early usage |
| Scale | one process, one region | distributed, no cold-start sleep |
| Long-lived rooms | in-memory only | durable storage + alarms; survives eviction |
| Ops | keep a server alive, watch it | deploy a Worker, done |
| Payloads | relay can carry data (capped) | **same** — the relay path still only ever sees encrypted bytes, and files still flow over WebRTC |
| Frontend | Vercel + Render | **Vercel + Cloudflare only** — one fewer service |

Why NOT something else:
- **Vercel Functions / edge:** ephemeral, no durable per-room state, no
  reliable long-lived sockets for pairing. Wrong tool for stateful rooms.
- **Render/Railway:** correct (a Node server), but it costs money or sleeps.
- **Socket.io on Workers:** socket.io's protocol needs a persistent HTTP server;
  it does not run on Workers. Hence the minimal JSON WS protocol + shim.

## 4. How each flow works

### Room creation
1. Client generates a fresh `roomId` (UUID) and `cid` (connection UUID).
2. Opens a WebSocket to `/ws?room=<roomId>&cid=<cid>` — the Worker routes it to
   `ROOMS.idFromName(roomId)`. The DO accepts the socket (Hibernation API,
   tagged with `cid`) and records `conn:<cid>`.
3. Client sends `{"event":"create_room","id":…}`. The DO generates the 128-bit
   base32 `secret`, stores `{roomId, secret, peerA:cid, …}`, registers
   `{roomId, secret, expiresAt}` in today's Registry DO, arms the expiry alarm,
   and acks `{ok, roomId, secret}`.
4. The ack resolves the app's `createSession()` — the room only exists after
   server confirmation. No client-side assumptions.

### Joining (code)
1. Client `POST /lookup {code}` → Worker asks today's (and yesterday's)
   Registry DO → returns the matching `roomId` (or 404).
2. Client opens `/ws?room=<roomId>&cid=<new-cid>` and sends
   `join_with_code {code}`. The Room DO **re-validates the TOTP itself**
   (window ±1) — the lookup never grants membership on its own.
3. DO assigns the free slot, acks `{ok, roomId, secret}`, and emits
   `peer_joined {peerId}` to the existing device.
4. The existing device creates its WebRTC peer manager and initiates.

### Joining (link) / Resuming
- Link: client opens the room WS directly (roomId is in the URL), sends
  `join_with_link {roomId, secret?}` — secret optional exactly like today.
- Resume: client holds `roomId` + `secret` in localStorage; opens the room WS
  and sends `resume_room {roomId, secret}`. The DO drops dead slots, re-seats
  the device, acks, and emits `peer_joined` to the live peer so WebRTC rebuilds.

### WebRTC signaling
`signal {to, signal}` (offer / answer / ICE candidate) is size-capped (≤ 64KB),
authorized against the room, and forwarded **only** to the target peer's socket.
ICE candidates are small and frequent — no payloads of consequence ever touch
the Worker.

### File / large-text transfer
Identical to today: once the RTCDataChannel opens, all bytes (64KB AES-GCM
encrypted chunks, 200MB cap, backpressure via `bufferedAmount`) flow **peer to
peer**. The Worker/DO only ever sees the **encrypted relay fallback** when the
channel is down (string ≤ 512KB, binary chunk ≤ 128KB) — the same caps as the
Node server, and the payloads are ciphertext the DO cannot read (the key is
derived from the secret, which the DO stores for *pairing* but never uses for
content — it is never sent to the relay path).

### Room expiry
- Created → `expiresAt = lastActive + 12h` (idle TTL), enforced by a DO alarm.
- Both peers gone → an alarm is armed at `now + 4h` (rejoin window).
- Any activity re-arms the 12h idle alarm.
- Manual `close_room` (or `room_closed` from the creator) → both sockets get
  `room_closed`, both close, DO storage is deleted immediately.
- `alarm()` fires → emits `room_closed {reason:"idle_timeout"}` (if peers are
  live), closes sockets, `deleteAll()`.

### Security
- Room ids are client-generated UUIDs; the **secret** is 128-bit random and the
  actual credential — codes rotate every 30s (TOTP, window ±1), so a leaked
  screenshot of a code is useless within a minute.
- Never logged: message contents, keys, secrets. Log lines truncate ids.
- Origin allowlist on `/ws` and `/lookup` (dev origins + Vercel + `ALLOWED_ORIGINS`).
- Size caps on every inbound message; membership checks on every event.
- The relay cannot read content (client-side AES-256-GCM, key never leaves the
  devices) — same truth we state in the UI.

### Free-tier limits and how the design stays inside them
- **Requests:** each room is a handful of WS frames + 2–3 lookups per join.
  Free: 100k requests/day, 1M/day for Workers with DO bindings — far beyond a
  launch's needs.
- **Durable Objects:** free tier gives 1M DO requests/mo. Room DOs exist only
  while a room is alive (12h max) and are deleted on expiry/close; the Registry
  is 2 DOs (today + yesterday) with tiny entries, self-cleaning on lookup.
- **Hibernation:** sockets idle in the DO are free of wall-clock billing via the
  WebSocket Hibernation API — the DO only wakes on messages.
- **Storage:** room state is a few hundred bytes; Registry entries are deleted
  as they expire. No databases, no KV writes beyond room/registry records.
- **WebRTC:** the heavy bytes never enter the Worker — that's what keeps the
  platform cheap.

## 5. Configuration

| Env var | Where | Meaning |
|---|---|---|
| `VITE_SIGNALING_URL` | Vercel (frontend build) | `https://sharetext-signaling.workers.dev` (or with `/ws`) — selects the Cloudflare transport |
| `VITE_SOCKET_URL` | Vercel (frontend build) | Node socket.io endpoint — used only if `VITE_SIGNALING_URL` is unset |
| `ALLOWED_ORIGINS` | Worker (vars/secrets) | comma-separated extra frontend origins |

Transport selection in the client: `VITE_SIGNALING_URL` → Cloudflare shim;
else `VITE_SOCKET_URL` → socket.io; else same-origin socket.io (dev / self-host).
A production build pointing either env at `localhost` is refused with a loud
error — deployed builds never silently target localhost.

## 6. Local development & deploy

```bash
# Frontend + Node signaling (unchanged, default dev path)
npm run dev            # http://localhost:3311

# Cloudflare worker locally
npm run worker:dev     # wrangler dev — http://localhost:8787, /health /ws /lookup
npm run worker:test-live  # protocol smoke test against the running worker

# Checks
npm run lint           # app typecheck
npm run worker:typecheck
npm run worker:test    # OFFLINE protocol test: bundles the real Room/Registry
                       # classes with esbuild against a runtime shim and drives
                       # create/join/signal/relay/resume/close in plain Node.
                       # Use this when workerd can't run on the machine
                       # (the emulator needs no Cloudflare tooling).

# Deploy (needs a Cloudflare account, logged in once via `wrangler login`)
npm run worker:deploy  # gives https://sharetext-signaling.<subdomain>.workers.dev
```

Then set `VITE_SIGNALING_URL` in Vercel → Redeploy. The Node `render.yaml`
path remains a valid self-hosted fallback.
