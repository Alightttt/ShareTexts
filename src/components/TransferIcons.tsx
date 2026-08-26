import React from 'react';

/**
 * Custom send/receive icons — circle with arrow, like the Noun Project references.
 * Send = circle with upward arrow (sending data up/out)
 * Receive = circle with downward arrow (receiving data down/in)
 */

export function SendCircleIcon({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 16V8M12 8L8.5 11.5M12 8l3.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReceiveCircleIcon({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 8V16M12 16L8.5 12.5M12 16l3.5-3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
