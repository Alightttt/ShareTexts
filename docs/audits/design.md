# ShareText — Anti-AI-Slop Design Audit

Method: full source reading (views, components, `index.css` tokens) + computed-style
metrics captured from the real running app at every screen (`scripts/design-metrics.mjs`)
+ full-page screenshots in `.audit-shots/`. Severity: HIGH / MEDIUM / LOW.

## Verdict

ShareText is **not** generic-AI-slop. The design system is unusually restrained: one
accent (azure), one easing set, quiet hairline borders, no particles/glass/3D, and the
landing page is a continuous story rather than stacked marketing sections. The hero
(phone → beam → laptop with a packet flying between them) is a recognizable identity:
the **transfer-as-object** metaphor. If the logo disappeared, the story layout + the
device-to-device beam still read as "this is a thing that moves data between devices."

That said, four elements carry generic-AI-app fingerprints.

## Findings

### 1. Sent-message bubble uses a two-stop gradient — MEDIUM
- **WHAT** — Every "me" message bubble is `bg-linear-to-br from-azure-500 to-azure-700`
  (a 135° gradient measured as `linear-gradient(to right bottom in oklab, #2e8bff → #0b55c9)`).
- **WHY** — A gradient inside a chat bubble is the single most common "AI-built chat app"
  tell. It adds noise to every message and fights the otherwise flat, Apple-calibrated
  surfaces (`#1c1c1e`, `#2c2c2e`).
- **RECOMMENDED** — Flatten to a solid `azure-600` (`#0a66f0`), keep white text. Done.

### 2. Attachment menu uses four saturated icon hues — MEDIUM-LOW
- **WHAT** — Photo=blue, Video=purple, Audio=pink, File=orange (lucide defaults).
- **WHY** — Four loud hues in one 220px menu is visual noise; it's a "let's color-code
  things" shortcut that usually appears in templates.
- **RECOMMENDED** — One muted ink color for all four rows; let the label carry meaning.

### 3. Header status reads "Connected with ShareText" — LOW
- **WHAT** — Chat header badge under the partner name.
- **WHY** — Awkward copy ("with ShareText" implies ShareText is a person) and it repeats
  a concept the user already knows. The cognitive-load pass wants the smallest truthful
  signal.
- **RECOMMENDED** — "Connected" + colored dot. The relay/direct detail already lives
  behind the click-through popover in user-friendly words.

### 4. Room Hub action order buries the primary action — LOW
- **WHAT** — On the waiting screen, "Show QR Code" and "Share Nearby" are two identical
  large cards; "Copy Code" (the real primary pairing action) is a smaller pill below.
- **WHY** — The screen's job is "get this code to the other device." Copy Code should
  be the first action a thumb reaches.
- **RECOMMENDED** — Move Copy Code above the two cards, keep it as the white (primary) pill.

## Audited clean (no change)

- **Type ramp** — 44/16/13 on the hero; 26/14 on the hub; 17/12/13 in chat. Consistent
  -0.02…-0.035em tracking, SF/Segoe system stack. No faux-bold or giant display type.
- **Radius scale** — tokens only: 8/12/16/20/28/36. Bubbles 24px with an 8px inner
  corner (iMessage-style, not random). Not over-rounded.
- **Shadows** — two elevation tokens (`shadow-card`, `shadow-float`); hairline borders
  carry the structure. Not glassy.
- **Motion** — three house curves, 160ms micro-interactions, spring entrances with
  bounce: 0, `prefers-reduced-motion` fully respected (including a static hero demo).
  The code card ticks 1×/s with a CSS-driven ring instead of an rAF loop.
- **Empty/error/loading states** — "Your private clipboard" (product-first), shake on
  wrong code, disabled-state styling, one-time "That's it." moment. No confetti.
- **Gradients used elsewhere** — laptop base + soft azure radial glow behind the pairing
  card (0.10 alpha). Both are fine; the glow is a quiet brand warmth, not a sky.

## Identity test

"If the ShareText logo disappeared, would this still feel like a generic AI SaaS?"
**No.** The story-landing + flying-transfer hero + code-card choreography are specific.
The fixes above tighten the two spots that did feel template-like (bubble gradient,
rainbow attach menu).
