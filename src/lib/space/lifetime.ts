/**
 * Space lifetime — the fraction of the promised window that has elapsed.
 *
 * 0 = just created, 1 = expired. This is the honest basis for the header's
 * lifetime hairline: urgency is shown ONLY when time has really been spent
 * (≥60%), never as decoration. Deterministic so tests can pin it.
 */
export function lifetimeFraction(createdAt: number, expiresAt: number, now: number): number {
  const span = expiresAt - createdAt;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - createdAt) / span));
}

/**
 * Whether the space is genuinely "running out": ≥80% of its lifetime spent
 * OR ≤2 hours left, whichever comes first. Below that, the countdown is
 * calm metadata — no color, no hairline, no fake urgency.
 */
export function isRunningOut(createdAt: number, expiresAt: number, now: number): boolean {
  if (now >= expiresAt) return true;
  return lifetimeFraction(createdAt, expiresAt, now) >= 0.8
    || expiresAt - now <= 2 * 3_600_000;
}
