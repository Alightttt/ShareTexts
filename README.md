# ShareTexts

AirDrop for any device — share text, links, photos and files between any two
devices, right in the browser. No app, no account, no wires. Peer-to-peer
(WebRTC) with end-to-end encryption; the signaling server only ever sees the
six-character room code.

## Development

```bash
npm install
npm run dev        # vite + signaling server
npm run build      # client bundle + server bundle
npm start          # run the production build
npm run lint       # typecheck
npm run worker:test
```

Verification scripts live in `scripts/` (`verify-*.mjs`) and run against a
local server on port 3010.

## Credits

Interface components were adapted from these projects — thank you:

- [Rare UI](https://www.rareui.com) — `OtpInput`, `EmojiReaction`
  (MIT + Commons Clause; attribution required and provided here and on the
  About page)
- [OpenSourceUI](https://opensourceui.in) — `ThreeDButton`, `ShareMenu`,
  `SlideToConfirm`, `SpinLoader`, `SegmentedToggleButton`, `PresenceDock`,
  `IconButton3D`, `SystemAlert`, `AnnotatedHint`, copy/download keycaps, and
  the pattern/background studies
- [Great UI](https://www.great-ui.com) — device mockup chassis geometry and
  the blur-fade theme transition
- [UI Arc](https://uiarc.dev) — FAQ, data-flow, footer, marquee, tooltip,
  announcement bar, and skeleton studies
