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
 * DisconnectGlyph — "leave through the door": a door frame whose leaf has
 * been swung open, with an arrow walking out through the doorway. Redrawn
 * on a 24-grid with a true open leaf (hinge on the frame's left edge, the
 * panel swinging toward the viewer) so the metaphor reads instantly at
 * 14–19px in both themes.
 */
export function DisconnectGlyph({ className = '', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      {/* Door frame — right portion of the wall, opening on its left edge */}
      <path
        d="M13 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* The leaf, swung open toward the viewer: hinge on the frame's left
          edge (x=13), the free edge swung out to x=9.5 — the opening the
          arrow walks through. */}
      <path
        d="M13 3.5 9.5 5.2v13.6L13 20.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Arrow out through the doorway, to the left */}
      <path
        d="M2.5 12h8"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M6.5 7.5 2.5 12l4 4.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
