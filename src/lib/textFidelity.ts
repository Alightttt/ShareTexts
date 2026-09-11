/**
 * Text fidelity — every pasted format (markdown, tables, code, RTL, emoji,
 * unicode spacing, CRLF) must arrive byte-for-byte unchanged and DISPLAY
 * correctly.
 *
 * The wire already guarantees byte fidelity: text is UTF-8 encoded, AES-GCM
 * encrypted, chunked, and reassembled — the server never touches payloads.
 * What can go wrong is at the edges:
 *
 *   1. Lone surrogates (e.g. from `String.fromCharCode(0xD800)` in a weird
 *      clipboard source) survive in JS strings but cannot round-trip through
 *      `TextEncoder` → UTF-8 → `TextDecoder`. Left alone, the two devices can
 *      end up with DIFFERENT strings. normalizePastedText() replaces them with
 *      U+FFFD once, deterministically, so both devices show the same thing.
 *      Valid text — emoji, ZWJ sequences, RTL, tabs, CRLF, NBSP, zero-width,
 *      all real unicode — passes through completely untouched (fast path:
 *      one encode+decode round-trip and back).
 *   2. Multi-line structured content (indented code, TSV/CSV tables) collapses
 *      visually in a proportional font. We never rewrite the text — we only
 *      DETECT the shape and let the bubble switch to a monospace layout with
 *      horizontal scroll so columns and indentation keep their alignment.
 *   3. RTL text renders right-aligned with correct bidi punctuation order
 *      via CSS `unicode-bidi: plaintext` — the string itself is untouched.
 *   4. Large-text previews slice at a grapheme boundary, so an emoji or a
 *      CJK surrogate pair is never split into garbage at the cut point.
 */

/** Fast, lossless normalization. Returns the SAME string for all valid UTF-16
 *  text; only lone surrogates become U+FFFD. Deterministic across devices. */
export function normalizePastedText(text: string): string {
  // Cheap no-op guard for the common case: no surrogate code units at all.
  // ~99.9% of pastes take this path with zero allocation.
  let suspicious = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) { suspicious = true; break; }
  }
  if (!suspicious) return text;

  // Round-trip through UTF-8. TextEncoder replaces lone surrogates with
  // U+FFFD (the WHATWG replacementCharacter policy), TextDecoder parses
  // strictly. Pair surrogates and all valid code points survive intact.
  try {
    return new TextDecoder('utf-8').decode(new TextEncoder().encode(text));
  } catch {
    // TextDecoder with fatal:false never throws; this is pure paranoia.
    return text;
  }
}

/**
 * Detect monospace-shaped content: indented code, aligned TSV/CSV columns,
 * ASCII tables. Heuristic is deliberately conservative — plain prose with an
 * occasional long line must stay in the proportional bubble. The text is
 * NEVER modified; only the display changes.
 *
 * Shape rules (any of):
 *   - ≥2 lines where ≥2 lines start with whitespace (indented block)
 *   - ≥3 lines where ≥80% of lines share the same column count (aligned grid)
 *   - ASCII table borders (|---|---| or +---+---+)
 */
export function looksLikeStructuredText(text: string): boolean {
  if (text.length < 2) return false;
  const lines = text.split('\n');
  if (lines.length < 2) return false;
  // Only consider the first 200 lines — display detection, not indexing.
  const sample = lines.slice(0, 200);

  // ASCII table borders: |---| or +---+ lines
  const border = /^[|+][\s\-=:|+]{3,}[|+]$/;
  let borderLines = 0;
  let columned = 0;
  let indented = 0;
  let widths: number[] | null = null;
  let widthMatches = 0;

  for (const raw of sample) {
    const line = raw.replace(/\r$/, '');
    if (border.test(line)) borderLines++;
    if (/^\s/.test(line)) indented++;
    // Count pipe-separated or tab-separated column shapes on non-empty lines
    if (line.trim()) {
      const pipes = (line.match(/\|/g) || []).length;
      const tabs = (line.match(/\t/g) || []).length;
      const cells = pipes >= 2 ? pipes - 1 : tabs >= 1 ? tabs + 1 : 0;
      if (cells >= 2) {
        if (widths === null) {
          widths = [cells];
          widthMatches = 1;
        } else if (widths[0] === cells) {
          widthMatches++;
        }
      }
    }
  }

  const nonEmpty = sample.filter(l => l.trim()).length;
  if (borderLines >= 1 && widthMatches >= 1) return true;
  if (nonEmpty >= 3 && widths !== null && widthMatches / nonEmpty >= 0.8) return true;
  if (sample.length >= 2 && indented >= 2) return true;
  return false;
}

/** Longest line length — decides whether horizontal scroll is needed. */
export function maxLineLength(text: string): number {
  let max = 0;
  for (const line of text.split('\n')) {
    // A tab counts as its single code unit for this estimate; the monospace
    // tab-size CSS handles the visual alignment either way.
    if (line.length > max) max = line.length;
    if (max > 200) return max; // early exit — definitely scrollable
  }
  return max;
}

/**
 * Slice a string to at most `max` characters WITHOUT splitting a grapheme.
 * Uses Intl.Segmenter where available (all evergreen browsers), with a
 * code-point-safe fallback (never cuts inside a surrogate pair).
 */
export function sliceAtGraphemeBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    try {
      const seg = new Seg('und', { granularity: 'grapheme' });
      let out = '';
      let count = 0;
      for (const part of seg.segment(text)) {
        if (count >= max) break;
        out += part.segment;
        count++;
      }
      return out;
    } catch { /* fall through to code-point slicing */ }
  }
  // Fallback: cut on a code-point boundary (back off one unit if we would
  // split a surrogate pair).
  let end = max;
  const c = text.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/** A string has right-to-left intent if its first strong directional
 *  character is RTL. Used only to pick a hint attribute; CSS bidi does the rest. */
export function hasStrongRtl(text: string): boolean {
  // LTR/RTL strong ranges; skip neutral characters (punctuation, digits, spaces)
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x0590 && cp <= 0x05ff) ||  // Hebrew
      (cp >= 0x0600 && cp <= 0x06ff) ||  // Arabic
      (cp >= 0x0700 && cp <= 0x074f) ||  // Syriac
      (cp >= 0x0750 && cp <= 0x077f) ||  // Arabic Supplement
      (cp >= 0x08a0 && cp <= 0x08ff) ||  // Arabic Extended-A
      (cp >= 0xfb1d && cp <= 0xfdff) ||  // Hebrew presentation
      (cp >= 0xfe70 && cp <= 0xfeff) ||  // Arabic presentation
      (cp >= 0x200f && cp <= 0x200f)     // RLM
    ) return true;
    if (
      (cp >= 0x0041 && cp <= 0x005a) ||
      (cp >= 0x0061 && cp <= 0x007a) ||
      (cp >= 0x00c0 && cp <= 0x024f) ||  // Latin extended
      (cp >= 0x0370 && cp <= 0x03ff) ||  // Greek
      (cp >= 0x0400 && cp <= 0x04ff) ||  // Cyrillic
      (cp >= 0x4e00 && cp <= 0x9fff) ||  // CJK
      (cp >= 0x3040 && cp <= 0x30ff) ||  // Kana
      (cp >= 0xac00 && cp <= 0xd7af)     // Hangul
    ) return false;
  }
  return false;
}
