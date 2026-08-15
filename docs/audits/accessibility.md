# ShareText — Accessibility Quality Audit

Built-in, not bolted on: semantic elements, real inputs/buttons, one visible focus
treatment, and reduced-motion support were already in place. This pass closes the
screen-reader and keyboard gaps.

## Keyboard (all primary flows, no mouse)

Send text → button ✓ · Receive text → button ✓ · enter code → real `<input>` with
6-cell mask, autofocus, numeric keyboard ✓ · send text → textarea + Send (⌘/Ctrl+Enter
also works) ✓ · copy → button ✓ · attachment menu → button with arrow keys over a
`flex flex-col` menu ✓ · select file → real file inputs ✓ · close room → button ✓.
Escape closes the attachment menu, connection popover, and close dialog ✓.

## Screen-reader live states (new)

- Chat adds an invisible `aria-live="polite"` region announcing, in plain words:
  "Connected", "Your other device disconnected", "Message received", "Photo / Video /
  Audio / File received", "Couldn't send the file.", "Transfer cancelled". No visual
  change — the announcement rides alongside the design.
- The disconnect banner is `role="status"`; the join "Verifying code…" state is
  `role="status"`; errors are `role="alert"` (landing create error, join code error,
  chat input error). A wrong code is now *announced*, not just shown.

## Labels & semantics (new)

- Pairing-code input: `aria-label="Six-digit pairing code"` + `aria-describedby` the
  error; the visual digit cells are `aria-hidden` (the input carries the value).
- Chat textarea: `aria-label="Message"` (placeholder was not a reliable name).
- Expansion toggles expose `aria-expanded`: connection details popover, attachment
  menu, QR card, "How this works".

## Contrast (fixed)

- Low-opacity body text (`white/45`, `white/50`) on the near-black surfaces was bumped
  to `white/60` across the landing footer, hero kicker, "That's it." moment, live-code
  captions, and the story/situation labels — small 12–13px text now clears AA (≈7:1).
  Disabled controls (`white/40`) are exempt and unchanged.

## Already solid

- **Focus**: one global `:focus-visible` outline (2px azure, offset), no focus ring
  on mouse-only clicks, visible on every interactive control.
- **Motion**: `prefers-reduced-motion` zeroes animation/transition durations; the hero
  shows a static transfer; the live-code ring keeps working (state preserved).
- **Touch targets**: the layout audit enforces ≥40px on every button across desktop +
  mobile in CI.
- **Semantic structure**: h1 on every screen, single h2 for the chat partner name,
  real buttons/inputs throughout, `role="dialog"` + `aria-modal` on the close confirm.

## Known follow-ups

- Full VoiceOver/TalkBack narration needs a real-device pass before launch.
- The connection popover could use an `aria-controls` id once the panel is always
  mounted (it isn't today).
