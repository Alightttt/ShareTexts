import React from 'react';
import { motion } from 'motion/react';
// Gravity UI icons where they exist; the slashed wifi / slashed server marks
// (Gravity has no equivalent) stay on lucide.
import { CircleInfo as Info, TriangleExclamation as AlertTriangle, ShieldExclamation as ShieldAlert } from '@gravity-ui/icons';
import { WifiOff, ServerOff } from 'lucide-react';
import { cn } from '../lib/utils';

// ---------------------------------------------------------------------------
// SystemAlert — one alert anatomy for every non-happy path.
// ---------------------------------------------------------------------------
// Adapted from OpenSourceUI's system-alert: a tinted plate, a glyph in a round
// well, one bold sentence, one quiet line, one action. Before this, the app
// built each failure out of ad-hoc divs — same intent, three different
// paddings. The point of the component is that a server hiccup, a device
// failure and a validation note all arrive wearing the same clothes, so the
// user learns one shape and reads it instantly.
//
// Tones are semantic only (never decorative): danger = something failed,
// warning = something may fail, info = context.
// ---------------------------------------------------------------------------

export type AlertIcon = 'offline' | 'server' | 'time' | 'warning' | 'info';

export interface SystemAlertProps {
  tone?: 'danger' | 'warning' | 'info';
  icon?: AlertIcon;
  /** One bold line — what happened. */
  title?: string;
  /** The quiet supporting line — why, or what to do next. */
  children?: React.ReactNode;
  /** Optional single action (usually a retry). */
  action?: { label: string; onClick: () => void; testId?: string };
  className?: string;
  compact?: boolean;
}

const TONE_CLASSES = {
  danger: {
    plate: 'bg-status-danger/[0.06] dark:bg-status-danger/[0.10] border-status-danger/20',
    well: 'bg-status-danger/12 text-status-danger',
    title: 'text-status-danger',
  },
  warning: {
    plate: 'bg-status-warning/[0.07] dark:bg-status-warning/[0.12] border-status-warning/25',
    well: 'bg-status-warning/15 text-status-warning',
    title: 'text-status-warning',
  },
  info: {
    plate: 'bg-apple-parchment/70 dark:bg-white/[0.05] border-apple-divider/60 dark:border-white/10',
    well: 'bg-black/[0.05] dark:bg-white/10 text-apple-ink-muted dark:text-white/70',
    title: 'text-apple-ink dark:text-white',
  },
} as const;

const ICONS: Record<AlertIcon, React.ComponentType<{ className?: string }>> = {
  offline: WifiOff,
  server: ServerOff,
  time: Info,
  warning: AlertTriangle,
  info: Info,
};

export function SystemAlert({ tone = 'danger', icon = 'info', title, children, action, className, compact = false }: SystemAlertProps) {
  const toneClasses = TONE_CLASSES[tone];
  const Glyph = tone === 'danger' && icon === 'info' ? ShieldAlert : ICONS[icon];
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
      className={cn(
        'flex items-start gap-3 rounded-[14px] border',
        compact ? 'p-3' : 'p-3.5',
        toneClasses.plate,
        className
      )}
    >
      <span className={cn('shrink-0 rounded-full flex items-center justify-center', compact ? 'w-7 h-7' : 'w-8 h-8', toneClasses.well)}>
        <Glyph className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className={cn('text-[13px] font-semibold leading-snug', toneClasses.title)}>{title}</p>}
        {children && (
          <p className={cn('text-[13px] leading-relaxed', title ? 'mt-0.5' : '', toneClasses.title, title ? 'text-apple-ink-muted dark:text-white/60 font-medium' : 'font-medium')}>
            {children}
          </p>
        )}
        {action && (
          <button
            type="button"
            data-testid={action.testId}
            onClick={action.onClick}
            className={cn(
              'mt-2 min-h-[36px] px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors active:scale-95',
              tone === 'danger'
                ? 'bg-status-danger/10 text-status-danger hover:bg-status-danger/20'
                : 'bg-black/[0.05] text-apple-ink hover:bg-black/[0.09] dark:bg-white/10 dark:text-white dark:hover:bg-white/[0.16]'
            )}
          >
            {action.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}
