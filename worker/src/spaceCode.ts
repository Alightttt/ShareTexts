/**
 * Space codes — the human-friendly way to find a Temporary Space.
 *
 * Format: 8 characters from an unambiguous 27-char alphabet (no 0/O, 1/I/L,
 * 5/S, 8/B), grouped for reading: ABCD-72QK. 27^8 ≈ 2.8e11 combinations —
 * with per-IP rate limiting and a no-oracle lookup (unknown, wrong-shape and
 * expired codes all answer identically), guessing a live code is not
 * practical. The code only ever IDENTIFIES a space: joining still requires
 * the space's 192-bit access token (the code is discovery; the token is
 * authorization).
 *
 * This module is the single source of truth for the format. The Worker
 * (worker/src/spaceCode.ts) carries an identical copy — Workers can't import
 * from the app tree. Keep the two in sync.
 */

/** Unambiguous 27-char alphabet, derived from A–Z0–9 by excluding the
 *  confusable pairs 0/O, 1/I/L, 5/S, 8/B — every remaining character is safe
 *  to read aloud and to hand-type. NOTE: `B` is excluded as part of the 8/B
 *  pair, so example codes like ABCD-72QK are illustrative, not literally
 *  constructible; generated codes use only alphabet characters. */
export const CODE_ALPHABET = 'ACDEFGHJKMNPQRTUVWXYZ234679';

export const CODE_LENGTH = 8;

/** What a user may type: any case, hyphens/spaces/dots ignored. Validation
 *  is strict AFTER normalization — confusable characters (0, O, 1, I, L, 5,
 *  S, 8, B) simply never appear in real codes, so an input containing them
 *  is invalid rather than silently corrected (no guessing). */
export function normalizeSpaceCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[\s.\-_]/g, '');
}

/** Display form: ABCD-72QK (4+4). Codes never contain ambiguous chars, so
 *  the hyphen is pure formatting — stripped on every round-trip. The group
 *  appears as soon as the second half starts (length > 4), so the field is
 *  visibly 4+4 WHILE typing, not only once complete. Keep in sync with
 *  src/lib/space/spaceCode.ts. */
export function formatSpaceCode(code: string): string {
  const c = normalizeSpaceCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Strict validity check AFTER normalization. */
export function isValidSpaceCode(code: string): boolean {
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

/** Cryptographically random code from the alphabet. */
export function generateSpaceCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
