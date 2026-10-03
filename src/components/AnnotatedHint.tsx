import React, { useId, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// AnnotatedHint — a term that explains itself without leaving the sentence.
// ---------------------------------------------------------------------------
// Adapted from OpenSourceUI's annotated-text: the word keeps its place in the
// line, wearing a dotted underline, and the explanation arrives on hover or
// focus instead of being written into the paragraph. The alternative — adding
// a footnote line under every such term — is how screens turn into walls of
// small print, which is the thing this round is undoing.
//
// House rules:
//   · the term is focusable (tabIndex 0) and the note is wired through
//     aria-describedby, so keyboard and screen-reader users get the same
//     explanation as a mouse hover
//   · the popover is role="tooltip" and never traps the pointer
//   · it is NOT a button: nothing happens on click except toggling the note
//     on touch, where hover does not exist
// ---------------------------------------------------------------------------

export interface AnnotatedHintProps {
  /** The term as it reads in the sentence. */
  children: React.ReactNode;
  /** The explanation, shown beside the term. */
  note: React.ReactNode;
  className?: string;
  noteClassName?: string;
}

export function AnnotatedHint({ children, note, className, noteClassName }: AnnotatedHintProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        className="inline-flex items-center underline decoration-dotted decoration-[1.5px] underline-offset-[3px] cursor-help outline-none focus-visible:ring-2 focus-visible:ring-azure-500/50 rounded-[4px]"
      >
        {children}
      </span>
      {open && (
        <motion.span
          id={id}
          role="tooltip"
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 480, damping: 30 }}
          className={cn(
            'pointer-events-none absolute bottom-full left-0 mb-2 z-40 w-[248px] px-3 py-2 rounded-[12px]',
            'bg-apple-ink text-white dark:bg-[#2c2c33] text-[12px] font-medium leading-snug text-left normal-case',
            'shadow-[0_14px_34px_-14px_rgba(0,0,0,0.5)]',
            noteClassName
          )}
        >
          {note}
        </motion.span>
      )}
    </span>
  );
}
