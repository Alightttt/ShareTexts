import React from 'react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// PresenceDock — who is in this room, at a glance.
// ---------------------------------------------------------------------------
// Adapted from OpenSourceUI's presence-dock: the participants of a shared
// surface as a short row of overlapping device tiles, each carrying its own
// link state. The point is that "who else is here" stops being a sentence you
// have to read and becomes a shape you recognize — and when a third device
// joins a room, the dock simply grows a tile instead of the copy having to
// change.
//
// States are shown, never announced: a connected tile wears a solid ember
// dot, a connecting tile a soft hollow one, offline goes flat. No spinners
// in a dock — a dock that animates is a dock you can't stop looking at.
// ---------------------------------------------------------------------------

export interface PresenceEntry {
  id: string;
  /** Device name, already localized by the caller. */
  label: string;
  /** Device glyph (monitor / phone / …). */
  icon: React.ReactNode;
  state: 'connected' | 'connecting' | 'offline';
  /** Marks this device — tiles get a distinguishing ring. */
  isSelf?: boolean;
}

export interface PresenceDockProps {
  entries: PresenceEntry[];
  /** Bold line, e.g. "2 devices". */
  title: string;
  /** Quiet supporting line, e.g. "1 ready". */
  subtitle?: string;
  className?: string;
}

const STATE_DOT: Record<PresenceEntry['state'], string> = {
  connected: 'bg-ember',
  connecting: 'bg-ember/35 ring-2 ring-ember/25',
  offline: 'bg-apple-ink-muted/40 dark:bg-white/25',
};

export function PresenceDock({ entries, title, subtitle, className }: PresenceDockProps) {
  if (entries.length === 0) return null;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex items-center shrink-0" aria-hidden>
        {entries.map((entry, i) => (
          <span
            key={entry.id}
            title={entry.label}
            className={cn(
              'relative flex items-center justify-center w-9 h-9 rounded-[12px] border',
              'bg-white dark:bg-apple-tile-2 border-apple-divider dark:border-white/10',
              'text-apple-ink-muted dark:text-white/70',
              entry.isSelf && 'text-[#f06413] dark:text-[#fb9243] border-[#f06413]/25 dark:border-[#fb9243]/25',
              i > 0 && '-ml-2.5'
            )}
            style={{ zIndex: entries.length - i }}
          >
            {entry.icon}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-apple-canvas dark:border-[#141418]',
                STATE_DOT[entry.state]
              )}
            />
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-apple-ink dark:text-white truncate">{title}</p>
        {subtitle && <p className="text-[11.5px] font-medium text-apple-ink-muted dark:text-white/45 truncate">{subtitle}</p>}
      </div>
    </div>
  );
}
