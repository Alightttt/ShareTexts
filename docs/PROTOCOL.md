# ShareText Transfer Protocol v1

The application-layer protocol two ShareTexts peers speak over WebRTC (with a
signaling-relay fallback). Everything is end-to-end encrypted (AES-GCM, key
derived from the room secret — see `src/lib/crypto.ts`); the relay only ever
sees ciphertext.

## Channels

One `RTCPeerConnection`, two SCTP streams:

| Channel   | Label      | Carries                                             |
|-----------|------------|-----------------------------------------------------|
| Bulk      | `chat`     | chat text chunks, binary file chunks                |
| Control   | `control`  | cancel / ack / pause / resume / receipts / seen / file_hash / hello |

The control channel exists so a Cancel press or a Seen receipt is never
queued behind megabytes of bulk data — each channel has its own send buffer.
Control packets are `'C' + base64-ish encrypted JSON` strings on the wire.
**Compatibility:** a peer on an older build has no control channel; every
control semantic then rides the bulk channel wrapped in a one-chunk envelope
(the `routeControl` table serves both paths, so semantics are identical).
The initiating side opens the control channel; the answering side receives it
via `ondatachannel`.

## Transfer lifecycle

```
METADATA (chat message JSON, includes attachment {id, size, name, mimeType})
   ↓  receiver registers expectation: chunkCountForSize(size) chunks
CHUNK_0 … CHUNK_N          (binary frames)
   ↓  receive-complete
HASH_VERIFY (control: {type:'file_hash', transferId, sha256})
   ↓  receiver hashes what arrived; mismatch ⇒ failed card, retry from zero
TRANSFER_CONFIRMED (receiver → sender: {type:'receipt', messageId})
```

## Wire formats

**Text** (bulk, JSON string):
```json
{ "version": 1, "type": "chunk", "transferId": "<uuid>",
  "sequence": 142, "total": 435, "payload": "<encrypted>" }
```

**Binary file chunk** (bulk, ArrayBuffer) — fixed 20-byte header, no JSON:
```
bytes 0..15  transferId (UUID, big-endian bytes)
bytes 16..19 sequence   (uint32, little-endian)
bytes 20..   AES-GCM ciphertext of the plaintext chunk
```

**The chunk grid is invariant.** `CHUNK_SIZE = 128 KiB` never changes during
a transfer; byte `offset = sequence * CHUNK_SIZE`. The receiver writes
exactly there (OPFS `position` writes) and dedupes by sequence bitmap.
Because offsets can never move, the adaptive pacer below is free to change
*how fast* chunks go without any risk of *what* arrives being wrong.

## Flow control (backpressure)

The sender never dumps the file into the browser's send buffer. Per chunk:

1. `bufferedAmount > 8 MiB?` → await `bufferedamountlow` below 4 MiB
   (event-driven; a 100 ms poll is only a fallback for engines that
   under-fire the event; a 5 s timeout declares the channel *wedged* and
   the transfer finishes over the signaling relay instead of hanging).
2. `dc.send(packet)` — or relay if the channel is gone.

## Adaptive pacing (application-level congestion control)

Every 1 s the send loop measures throughput and adjusts **pipeline depth**
(how many read→encrypt→send stages are in flight), never the grid:

- start at depth 48
- avg throughput > 8 MiB/s → depth + 8 (cap 96)
- avg throughput < 2 MiB/s → depth − 4 (floor 16)

SCTP provides transport congestion control; this layer keeps the *browser's*
buffer bounded and the UI responsive.

## Pause / resume / cancel

- `pause` (control) → sender idles at the next chunk boundary (loop stays
  alive; card shows `Paused`; cancel still works).
- `resume` → the same loop continues.
- `cancel` → local loop aborts, partial receives drop, peer is told.
- After a reconnect, the sender sends `resume_query`; the receiver answers
  `ack {received: <first missing index>}` and sending resumes from that
  confirmed prefix — already-received chunks are never re-sent.

## Integrity

- Sender computes SHA-256 of the original file while chunks fly; delivers it
  via `file_hash` (control) **and** in the re-sent metadata.
- Receiver hashes the assembled bytes; match ⇒ `verified` shield on the card;
  mismatch ⇒ honest `failed` card with Retry. Files are never silently kept.

## Resumable across refreshes (IndexedDB)

The sender's original File is persisted in IndexedDB (`sharetext-transfers`
db, `sendables` store) when the send starts, and the receiver's contiguous
progress mirrors into a `states` store. After a refresh or crash, the send
resumes from the restored bytes — the UI continues at the same percentage,
never restarts from zero. Records are swept (24h for sendables, 7d for
states) and deleted the moment a transfer completes or is cancelled.

## Resume state machine (receiver)

Chunks may arrive out of order and duplicates are ignored:
- small files (< 64 MiB): RAM array indexed by sequence, joined to a Blob
- large files: OPFS stream — position writes + a 1-byte-per-chunk bitmap;
  final file is disk-backed, so a 4 GB movie never sits in RAM.

## Reliability / relay fallback

Direct path = WebRTC DataChannel. If it wedges or closes mid-transfer, the
remaining chunks go through the signaling relay (socket.io `relay_message` /
worker room socket) automatically — the transfer degrades in speed, never in
correctness.

## Measurability

Every transfer is recorded locally (`src/lib/transferMetrics.ts`): direction,
bytes, duration, average + peak throughput, transport (local/direct/relay),
max pipeline depth, outcome, verified. A 40-entry ring + lifetime totals live
in `localStorage`; ⌘K → *Transfer stats* renders them with a Clear button.
Nothing identifying is stored and nothing leaves the device.
