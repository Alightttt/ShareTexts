# ShareText Transfer Protocol

ShareText is a **temporary device bridge**: one device has something, the
other needs it, ShareText moves it there — then the room expires.

The protocol is transport-agnostic and intentionally **not tied to the React
UI**. It is designed so humans and, eventually, AI agents can use the same
session model. The current product is human-first; the agent path is an
architectural direction, not a shipped feature.

## Layer model

| Layer | Responsibility | Implementation |
| --- | --- | --- |
| **Transport** | Move bytes between peers | socket.io WebSocket signaling (`server.ts`, `src/lib/socket.ts`) + WebRTC data channel (`src/lib/webrtc.ts`); encrypted relay fallback when no direct route exists |
| **Session** | Create/join/expire rooms | Rooms keyed by UUID; paired with a 6-digit TOTP code; rooms idle-expire after 12h, stay rejoinable 4h after both peers leave; cleanup every 60s |
| **Identity** | Who is in the room | The room `secret` (issued by the server after a successful join) is the only credential; device names are cosmetic only |
| **Encryption** | Keep content private | E2E: both peers derive an AES-GCM key from the room secret via WebCrypto (`src/lib/crypto.ts`). The relay never sees plaintext |
| **Transfer** | Reliable chunked delivery | Chunked envelope ordered by `transferId`/`sequence`; files use a compact binary variant; relay mirrors chunks when the data channel is down |
| **Object type** | What is being moved | Typed objects with metadata (`src/lib/protocol.ts`) |

## Object model

Transfers are typed objects, each with metadata:

```
type: text | url | image | file | audio | video | json | code | structured-data
meta: { transferId, type, size, name?, encoding?, checksum? }
```

The app's current attachment kinds (`image | file | video | audio`) map onto
this taxonomy via `objectTypeOf()` in `src/lib/protocol.ts`. `encoding` and
`checksum` are optional today and become required for structured-data and
agent-to-agent exchanges.

## Wire envelope

Text chunks travel as JSON; files use the same envelope in a compact binary
form (transferId bytes + sequence + encrypted payload):

```
ChunkEnvelope {
  version: 1
  type: 'chunk'
  transferId: string
  sequence: number   // 0-based
  total: number
  payload: string    // encrypted bytes
}
```

Receivers reassemble by `transferId`, verify `sequence`/`total`, and surface
progress. A transfer is complete only when all chunks arrive.

## Session lifecycle

1. **Create** — client emits `create_room` → server creates a room, joins the
   socket, returns `{ roomId, secret }`. The client only navigates on success.
2. **Pair** — the second device emits `join_with_code` (TOTP-validated) or
   `join_with_link` (secret-validated) → server registers the peer and emits
   `peer_joined` to the room.
3. **Connect** — WebRTC offer/answer/candidates flow through `signal` events;
   on channel open the app enters the room. No "connection successful" gate.
4. **Transfer** — objects move over the data channel (or relay), encrypted.
5. **Expire / close** — manual close, idle timeout, or both peers gone;
   `room_closed` notifies the room and the room is deleted server-side.

Reconnection: `connectionStateRecovery` gives a 5-minute grace; a returning
socket is re-added to its room (`peer_recovered`) and the surviving peer
re-establishes WebRTC.

## Security posture

- CORS allowlist — production signaling accepts only configured frontend
  origins (`ALLOWED_ORIGINS`, default: localhost dev + the Vercel frontend).
  Never `*`.
- Per-IP rate limits on room creation and code attempts.
- Payload caps on signaling and relay messages; files always prefer the data
  channel.
- Logs never contain message contents, secrets, or tokens (server logs print
  truncated room/socket ids only).

## Agent push API (implemented)

A script or AI agent can push text (or a small file) straight into a room
without a second browser — this is how "tell the agent to send this text to my
phone" works. The creator copies a curl command from the connect screen; it
carries the room secret as a bearer credential.

```
POST /api/push                      (JSON text)
  Authorization: Bearer <room secret>
  { "roomId": "<uuid>", "text": "Hello" }

POST /api/push                      (JSON file, base64)
  { "roomId": "<uuid>", "name": "photo.jpg", "mimeType": "image/jpeg",
    "dataBase64": "..." }

POST /api/push?roomId=<uuid>        (binary file, curl --data-binary @file)
  Content-Type: application/octet-stream
  X-File-Name / X-File-Mime headers
```

- Implemented identically on **both** transports: the Node server (Express
  route) and the Cloudflare Worker (`/api/push` → the room's Durable Object).
- Text cap 256 KB; file cap 8 MB. Files travel to devices as ~45 KB base64
  chunks (fits the 1 MB WS frame cap on both transports); the client
  reassembles them into a normal attachment bubble.
- Authenticated by the room secret (constant-time compare), rate-limited per
  IP (Node) / inherent to the room (Worker), and never exposed to browsers
  that aren't allowlisted (same origin policy as /lookup).
- Security model: the curl command IS the room key. Anyone holding it can
  push to the room — same trust domain as the 6-digit pairing code.
- The message lands on every seated device as an incoming bubble tagged
  "From your push link"; the connect screen also shows a push inbox.

## Deployment topology (current)

```
Vercel (static frontend)  ──wss://──▶  Render (Node signaling server)
        │                                   │
        └── two browsers pair via the 6-digit code; content flows WebRTC ──┘
```

- Frontend: Vercel static build; `VITE_SOCKET_URL` (build-time) points at the
  signaling server. Production never targets localhost.
- Server: `render.yaml` blueprint — Express + socket.io on `process.env.PORT`,
  serving the built frontend too (same-origin deployments work), with a
  `/health` endpoint for uptime checks.

## Nearby device discovery (socket.io transport)

An OPTIONAL landing-page convenience layer: devices that are merely OPEN on
ShareTexts (roomless) can appear to each other, so a tap replaces typing a
code. It reuses the room protocol end-to-end — discovery never transfers data
and never bypasses the room/secret/WebRTC machinery.

Client → server (JSON payloads, existing socket):

| Event | Payload | Ack | Notes |
|---|---|---|---|
| `presence_announce` | `{ deviceId: UUIDv4, name }` | `{ success, token }` | Roomless sockets only. Name sanitized (control chars + `<>` stripped, ≤32 chars). Joins the `presence` lobby room. Acts as keepalive — entries expire after 90s without one. |
| `presence_withdraw` | — | — | Leave the pool (also implied by disconnect or seating into a room). |
| `presence_update` | `{ name }` | — | Rename while present. |
| `presence_invite` | `{ deviceId: token }` | `{ success }` | Server resolves the token to the target's CURRENT socket and relays `{ from: token, name }`. |
| `presence_invite_result` | `{ to, accepted, roomId?, secret? }` | `{ success }` | Accept MUST carry a fresh UUID room + its secret; validated server-side and relayed only to the inviter. |

Server → client:

| Event | Payload | Notes |
|---|---|---|
| `presence_list` | `{ devices: [{ id: token, name }] }` | Coalesced broadcast (≥800ms apart). Tokens are `sha256(deviceId + per-process salt)` truncated to 32 hex — deviceIds NEVER leave the server. |
| `presence_invitation` | `{ from: token, name }` | To the invited device. |
| `presence_invite_result` | `{ accepted, roomId?, secret? }` | To the inviter. |

Flow: select device → invite → invitee accepts → invitee's client runs the
NORMAL `create_room` → answers with credentials → inviter runs the NORMAL
`join_with_link`. From there it is the standard room: same secret, same
WebRTC, same transfer checks. Decline/gone → nothing is shared.

Privacy posture: no IPs, no persistent ids on the wire (rotating tokens),
presence is ephemeral (90s TTL, 30s sweep), pool capped at 24 devices, and a
seated device is invisible. Validation covers deviceId UUID shape, token
shape (32 hex), room UUID + secret length, and name sanitization; client-side
parsing re-validates every list entry before render.

Test suite: `npm run test:nearby` (protocol tests incl. existing-flow
regression, duplicates, withdrawal, seated-device removal, XSS-name handling).
