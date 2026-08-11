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

## Future: AI agents

The same events (`create_room`, `join_with_code`, `signal`, `relay_message`,
typed objects) form a clean programmatic surface. An HTTP/MCP adapter could
later map "create a session", "send object", "receive object" onto them
without touching the UI or the WebRTC path.

That adapter is intentionally **not implemented yet**. When it is:

- Sessions stay secret-gated (server-issued room secret), never ambient.
- Automation inherits the same rate limits and CORS policy.
- Agents receive typed objects (json / structured-data) with checksums —
  which is why the metadata model already includes them.

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
