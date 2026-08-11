/** Dev-only structured logging — never logs message contents or secrets. */
export function devLog(...parts: unknown[]) {
  if (import.meta.env.DEV) console.log('[ShareText]', ...parts);
}
