# ShareText — Transfer Engine Experience Audit

A transfer is a first-class object moving between two devices, not "a message appeared."

## State model (shipped)

`draft → sending → receiving → complete / failed` plus the new **`cancelled`** state
(sender cancels, receiver is told). Mapped 1:1 in `Attachment.status`; every state has
an action:

| State | Visual | Action |
|---|---|---|
| sending | filename, size, "Sending… N%", bytes so far, 1px bar | Cancel |
| receiving | same, "Receiving… N%" | Cancel (stops the receive) |
| complete | image preview / video player / audio player / file card | Copy Image · Save |
| failed | "Couldn't send this file." | Retry (resends metadata + bytes) |
| cancelled | "Cancelled" | Retry (sender) |

## Visualization

- Progress is **quiet and informative**: a 1px bar + compact "Sending… 34%" + bytes
  (`1.2 MB / 3.6 MB`). No giant progress animation, no confetti. Completion swaps the
  placeholder for the real preview instantly.
- The one-time "That's it — it's on the other device." moment marks the first success,
  then the app gets out of the way.
- Image previews render `object-contain` from the original bytes (never re-encoded);
  a crop is never applied to the actual file.

## Integrity

- Every file transfer is chunked 64 KB, each chunk **AES-GCM encrypted with the room
  key** (authenticated — tampered chunks fail decryption and are rejected).
- The receiver assembles chunks by sequence into a Blob; progress reflects *verified*
  chunks, not raw bytes.

## Performance (200 MB must not freeze the UI)

- **Streaming/chunking** — files are sliced and encrypted chunk-by-chunk; the UI never
  holds a full copy.
- **Backpressure** — the sender waits when `bufferedAmount` exceeds 2 MB (1 MB drain
  threshold) instead of flooding the data channel.
- **Progress events** — per-chunk, so the UI stays live.
- **Cancellation** — added in this pass (see below): the send loop checks an abort
  signal each iteration; the receiver drops the partial transfer and marks it
  cancelled.
- **State independence** — transfers are keyed by transfer id; a failed later transfer
  never touches completed ones. Verified in the chaos pass (text, then offline-send
  failure, then text: all three states coexist correctly on both devices).

## What changed in this pass

1. **`cancelTransfer(messageId)`** in SessionContext → PeerManager aborts the send
   loop and emits a `cancel` control packet; the receiver cancels its incoming transfer
   and the bubble shows "Cancelled" on both sides. Cancel buttons appear while a
   transfer is `sending`/`receiving`.
2. Retry from a `cancelled` send re-sends normally (the in-memory file store already
   supports it).
