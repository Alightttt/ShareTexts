import React from 'react';

/**
 * Custom send/receive icons — circle with arrow, like the Noun Project references.
 * Send = circle with upward arrow (sending data up/out)
 * Receive = circle with downward arrow (receiving data down/in)
 */

export function SendCircleIcon({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 16V8M12 8L8.5 11.5M12 8l3.5 3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReceiveCircleIcon({ className = '', size = 20 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2.5" />
      <path d="M12 8V16M12 16L8.5 12.5M12 16l3.5-3.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * DisconnectGlyph — a refined "gate out" mark: an open door frame with an
 * arrow leaving through it. Reads as "walk out of the room" at 16px in both
 * themes — the door is the room, the arrow is you leaving it.
 */
export function DisconnectGlyph({ className = '', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* Door frame — open on the right side */}
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow shaft leaving through the doorway */}
      <path
        d="M10 12h9"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {/* Arrow head */}
      <path
        d="M15.5 8.5L19 12l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Door edge — the frame's left jamb the arrow passes */}
      <path
        d="M13 4v3"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M13 17v3"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
