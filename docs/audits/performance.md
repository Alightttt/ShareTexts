# ShareText — Performance Engineering Audit

## Measured (local dev stack — `scripts/perf-probe.mjs`)

| Metric | Value | Note |
|---|---|---|
| Landing DCL / load | 654 / 656 ms | Vite dev transforms; production is prebuilt |
| Create → Live Code visible | ~1.6 s | dominated by dev module transform on cold load |
| Join (code entry → chat) | ~2.7 s | includes joiner page load + WebRTC handshake |
| **A send → B received** | **111 ms** | the core path is fast; production proxy |
| Main bundle | 563 KB raw / **173 KB gz** | React + motion + socket.io-client + otpauth + qrcode.react |
| QR scanner chunk | 336 KB raw / **101 KB gz** | **lazy-loaded** — only fetched when the camera opens |
| CSS | 62.6 KB raw / 11 KB gz | — |
| HTML | 3.6 KB | — |

`npm audit`: 0 vulnerabilities. `motion` is the only animation framework (no duplicates).

## Findings

### F1 — (INFO) Main bundle is 173 KB gz
- **WHAT** — one vendor-heavy main chunk (motion, socket.io-client, otpauth, qrcode.react, react).
- **WHY** — fine for a utility app; everything is tree-shaken and there are no duplicate
  frameworks. The two honest levers (drop otpauth for Web-Crypto TOTP, code-split motion)
  trade real risk for modest gains — not worth it pre-launch.
- **RECOMMENDED** — revisit after launch with field data; keep `motion` import surface
  small (import only what's used, as today).

### F2 — (INFO) QR scanner is a 101 KB gz lazy chunk
- **WHAT** — `html5-qrcode` pulls ~100 KB gz.
- **WHY** — it's already lazy: `import()` only when the user taps "Scan QR instead".
- **RECOMMENDED** — keep lazy; if camera adoption is low, this chunk never loads for most users.

### F3 — (INFO) og.png is ~100 KB
- **WHAT** — the 1200×630 social card.
- **WHY** — browsers don't load it (crawlers/previewers do); it's out of the critical path.
- **RECOMMENDED** — no change.

## Transfer performance (the 200 MB requirement)

Verified in the chaos suite, not just argued:
- **UI stays responsive mid-transfer** — during a 200 MB transfer the user can open the
  attachment menu and hit Cancel; the click is processed while chunks are flying.
- **No memory explosion** — files are sliced and encrypted 64 KB at a time; neither end
  ever holds a full copy.
- **Backpressure** — the sender waits when the data channel's `bufferedAmount` exceeds
  2 MB, so a slow receiver never buffers the world.
- **React re-renders are localized** — progress updates map *one* message's attachment
  (a single state update per chunk, not a tree-wide re-render).
- **Reduced motion** — one global media query zeroes animation/transition durations;
  the hero falls back to a static transfer, and the code ring still depletes (state is
  never removed when motion is disabled).

## Verdict

The app is small, lazy where it matters, and the transfer engine is chunked with
backpressure. No heavy decorative assets, no duplicated frameworks, no unoptimized
images in the critical path. Nothing blocks launch; revisit F1 with real field data.
