import { useLiveUsers } from '../lib/liveUsers';

/**
 * Social-proof pill: a green dot (fading in/out) + "N people using".
 *
 * Shown only while at least 10 people are actively using ShareText — under
 * that, the widget hides itself entirely so the landing stays quiet. The dot
 * pulse is pure CSS opacity (no layout), disabled under prefers-reduced-motion.
 */
export function LiveUsers({ min = 10, className = '' }: { min?: number; className?: string }) {
  const users = useLiveUsers();
  if (!users || users < min) return null;
  return (
    // NOTE: base display is `flex`, NOT `inline-flex` — Tailwind orders
    // `inline-flex` after `hidden`, so a caller's `hidden` class would lose.
    // `flex` loses to `hidden`, and callers can switch display at breakpoints.
    <span
      role="status"
      className={`flex items-center gap-2 text-[13px] font-medium text-apple-ink-muted dark:text-white/60 ${className}`}
    >
      <span className="live-users-dot" aria-hidden="true" />
      {users} people using
    </span>
  );
}
