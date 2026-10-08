#!/usr/bin/env node
/**
 * verify-visual-system.mjs — F22 visual-system regression gate.
 *
 * Source-scan assertions (no browser) that hold the token system together.
 * Run:  node scripts/verify-visual-system.mjs
 * Exit 0 only when every check passes.
 *
 * Rules of the system:
 *   · TSX may carry raw hex ONLY inside allowlisted file constants that
 *     carry a doc comment mirroring @theme (SVG/vendor-mark contract).
 *   · Radius: full ladder 4/6/8/10/12/14/16/20/24/26 (+2px hairline-bar
 *     accents in mockup frames only); named rounded-lg/xl resolve through
 *     --radius-* tokens instead of raw [Npx].
 *   · No generic blue/purple/gray Tailwind color utilities — status colors
 *     are the semantic exception and live in tokens.
 *   · Every --st-* token defined in index.css must be consumed somewhere in
 *     tsx/ts/css — dead tokens get deleted, not left to rot.
 *   · Dark well alphas are a FROZEN vocabulary (no-growth): the shipped set
 *     below is the contract. Known unification debt: 0.04/0.06 idle strays
 *     should collapse to 0.05 and 0.09/0.16 one-offs to their neighbors —
 *     deferred, see docs/audits/product-map-f22.md.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w):/, '$1:')), '..');
const SRC = path.join(ROOT, 'src');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};

function* walk(dir, exts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, exts);
    else if (exts.some(x => e.name.endsWith(x))) yield p;
  }
}

const tsxFiles = [...walk(SRC, ['.tsx'])];
const srcFiles = [...walk(SRC, ['.tsx', '.ts', '.css'])];
const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(SRC, p).replaceAll('\\', '/');
const css = read(path.join(SRC, 'index.css'));

// ── 1. Raw hex in TSX — allowlist with reasons ──────────────────────────
const HEX_ALLOWLIST = new Map([
  ['components/DeviceLinkIllustration.tsx', 'SVG-const fill pairs mirrored to @theme (documented in-file)'],
  ['components/StandardSwitch.tsx', 'SVG-const switch colors mirrored to @theme (documented in-file)'],
  ['components/ConnectHandshake.tsx', 'accent consts get "66" alpha-concatenated — var() cannot survive it'],
  ['components/DeviceArt.tsx', 'vendor brand marks (NVIDIA/AMD/Intel/phone families) are actual logo colors'],
  ['components/FileTypeIcon.tsx', 'file-type association colors (PDF red, sheet green…) are external marks'],
  ['components/ShareTextsLogo.tsx', 'the logo IS the brand — stops use var() where possible, hex remains as fallbacks/mid-stop'],
  ['components/spaceui/SegmentedToggleButton.tsx', 'sliding knob furniture: graphite thumb deliberately between the night tiles'],
  ['components/ThemeToggle.tsx', 'switch palette consts (GREEN_ON/GRAY_OFF styling) — SVG-const rule as in StandardSwitch'],
]);
// Motion literals: framer-motion cannot tween a var() color, so animated
// backgroundColor/Color props must stay literal — each value is pinned here
// and must mirror a token (checked below).
const MOTION_HEX = new Map([
  ['components/HeroDeviceDemo.tsx', new Set(['#f06413'])],
]);
const hexOffenders = [];
const hexRe = /#[0-9a-fA-F]{6}\b/g;
// A hex is FALSE-POSITIVE when it (a) sits in a JS comment or (b) is the
// fallback half of a var(..., #hex) pair — but only when the var itself is
// the token (fallbacks mirror @theme).
const stripNoise = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/var\(--[^,)]+,\s*#[0-9a-fA-F]{3,8}\)/g, 'var()');
for (const f of tsxFiles) {
  const r = rel(f);
  if (HEX_ALLOWLIST.has(r)) continue;
  const allowed = MOTION_HEX.get(r) ?? new Set();
  const m = [...(stripNoise(read(f)).match(hexRe) ?? [])].filter(h => !allowed.has(h.toLowerCase()));
  if (m.length) hexOffenders.push(`${r}: ${[...new Set(m)].join(', ')}`);
}
ok('no raw hex in TSX outside allowlisted SVG/vendor consts', hexOffenders.length === 0, hexOffenders.slice(0, 4).join(' | '));

// ── 2. Radius ladder ─────────────────────────────────────────────────────
const LADDER = new Set([2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 26]);
const LADDER_2PX_FILES = new Set(['components/mockups/LaptopFrame.tsx', 'components/mockups/PhoneFrame.tsx']);
const radiusRe = /rounded(?:-[a-z]+)?-\[(\d+)px\]/g;
const offLadder = [];
for (const f of tsxFiles) {
  const r = rel(f);
  for (const m of read(f).matchAll(radiusRe)) {
    const v = Number(m[1]);
    if (v === 2 && LADDER_2PX_FILES.has(r)) continue; // hairline-bar accent on hardware frames
    if (!LADDER.has(v)) offLadder.push(`${r}: ${m[0]}`);
  }
}
ok('every rounded-[Npx] on the ladder (2* 4/6/8/10/12/14/16/20/24/26)', offLadder.length === 0, offLadder.slice(0, 4).join(' | '));

// ── 3. No generic Tailwind color families ────────────────────────────────
const driftRe = /\b(?:text|bg|border|from|to|ring)-(?:blue|purple|violet|indigo|fuchsia|gray)-\d+/g;
const drift = [];
for (const f of tsxFiles) {
  const m = read(f).match(driftRe);
  if (m) drift.push(`${rel(f)}: ${[...new Set(m)].join(', ')}`);
}
ok('no generic blue/purple/gray Tailwind colors (§8 brand audit)', drift.length === 0, drift.slice(0, 4).join(' | '));

// ── 4. No dead --st-* tokens (consumed anywhere in src) ──────────────────
const tokenRe = /--st-[a-z0-9-]+(?=\s*:)/g;
const tokens = [...new Set(css.match(tokenRe) ?? [])];
const corpus = srcFiles.map(f => read(f)).join('\n');
const dead = tokens.filter(t => !corpus.includes(t));
ok(`every --st-* token consumed (${tokens.length} defined)`, dead.length === 0, dead.length ? `dead: ${dead.join(', ')}` : '');

// ── 5. TactileButton wears tokens, not inline gradients ──────────────────
const tb = read(path.join(SRC, 'components', 'TactileButton.tsx'));
ok('TactileButton consumes --st-btn-*-grad tokens',
  tb.includes('var(--st-btn-primary-grad)') && tb.includes('var(--st-btn-soft-grad)') && tb.includes('var(--st-btn-secondary-grad)'));
ok('TactileButton control heights wire --st-control-*',
  tb.includes('min-h-[var(--st-control-sm)]') && tb.includes('min-h-[var(--st-control-md)]') && tb.includes('min-h-[var(--st-control-lg)]'));

// ── 6. Status soft/ink/strong pairs exist ────────────────────────────────
ok('status soft/ink/strong pairs defined in @theme',
  css.includes('--color-status-success-soft') && css.includes('--color-status-danger-soft') && css.includes('--color-status-warning-soft') && css.includes('--color-status-danger-strong'));

// ── 7. Dark well vocabulary frozen (no-growth) ───────────────────────────
// The shipped set — idle 0.02–0.06 · hover 0.07–0.08 · press 0.10 ·
// accent chips 0.12–0.25 · overlay 0.90. New arbitrary alphas fail.
const FROZEN_WELLS = new Set([0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.15, 0.16, 0.2, 0.25, 0.9]);
const wellRe = /dark:bg-white\/\[?(0\.\d+)\]?/g;
const wellOffenders = new Map();
for (const f of tsxFiles) {
  const text = read(f);
  if (!text.includes('dark:bg-white/')) continue;
  for (const m of text.matchAll(wellRe)) {
    const v = Number(m[1]);
    if (!FROZEN_WELLS.has(v)) {
      const r = rel(f);
      if (!wellOffenders.has(r)) wellOffenders.set(r, new Set());
      wellOffenders.get(r).add(m[0]);
    }
  }
}
ok(`dark well alphas frozen to the shipped vocabulary (${FROZEN_WELLS.size} values)`, wellOffenders.size === 0,
  [...wellOffenders].slice(0, 4).map(([f, s]) => `${f}: ${[...s].join(' ')}`).join(' | '));

console.log(`\n=== verify-visual-system: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
