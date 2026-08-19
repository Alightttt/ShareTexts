import * as OTPAuth from 'otpauth';

/**
 * Pairing code window: 90 seconds, anchored to the room's creation time.
 *
 * Codes are generated with `timestamp = now - createdAt`, so window N covers
 * [createdAt + N·90s, createdAt + (N+1)·90s). The creator lands on the
 * "Connect your other device" screen right after creating, so the first code
 * is always a full 90 seconds — it never "refreshes in a few seconds"
 * because you walked into the middle of a wall-clock window. The worker and
 * Node server validate with the same anchor (±2 window), so both devices
 * always agree on the current code.
 */
const PERIOD = 90; // seconds per code window (generous so the code doesn't refresh while being typed)

function totpFor(secret: string, createdAt?: number): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: "ShareText",
    label: "Session",
    algorithm: "SHA1",
    digits: 6,
    period: PERIOD,
    secret: secret
  });
}

export function generateTOTP(secret: string, createdAt?: number): string {
  const totp = totpFor(secret, createdAt);
  // Shift the epoch to the room's creation time. Without createdAt (legacy
  // sessions mid-rollout) this degrades to wall-clock — same formula.
  return totp.generate({ timestamp: createdAt ? Date.now() - createdAt : Date.now() });
}

/** Ring progress 0..1 within the current window. */
export function getTOTPProgress(createdAt?: number): number {
  const now = Date.now();
  const anchor = createdAt ?? 0;
  return (((now - anchor) / 1000) % PERIOD) / PERIOD;
}

/** Whole seconds left in the current window (ceil, so 40 → 1). */
export function getTOTPRemainingSeconds(createdAt?: number): number {
  const now = Date.now();
  const anchor = createdAt ?? 0;
  return PERIOD - (((now - anchor) / 1000) % PERIOD);
}

