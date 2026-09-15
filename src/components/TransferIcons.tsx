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
 * DisconnectGlyph — the classic "exit through the door" mark: a door frame
 * with its door swung open and an arrow walking out through the doorway.
 * Drawn on a 24-grid so the stroke joins are crisp at 14–17px in both
 * themes. The door sits on the right (open on its left edge); the arrow
 * exits leftward through the opening — unambiguous "leave this room".
 */
export function DisconnectGlyph({ className = '', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* Door frame: outer wall opening to the left where the door swings */}
      <path
        d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The door itself — swung open toward the viewer, hinge on the right */}
      <path
        d="M14 4v16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arrow walking OUT through the doorway (leftward) */}
      <path
        d="M3 12h11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7.5 7.5 3 12l4.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
