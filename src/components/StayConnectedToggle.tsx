import React from 'react';
import { Infinity as InfinityIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useSession } from '../lib/SessionContext';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

/**
 * StayConnectedToggle — flips the room-wide "keep this room alive" promise.
 *
 * Both seated devices render this control; the server is the source of truth
 * and echoes the new state to the WHOLE room (stay_connected_state), so the
 * two badges can never disagree. Optimistic paint keeps the switch instant.
 *
 * A Stay Connected room is exempt from every server expiry sweep — it lives
 * until one device explicitly disconnects. The switch lives in the connection
 * details sheet (ChatView) and the desktop summary pane (SingleScreenApp).
 */
export function StayConnectedToggle({ className }: { className?: string }) {
  const { session, setStayConnected } = useSession();
  const { t } = useI18n();
  const on = session.stayConnected;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2.5 rounded-[14px] bg-apple-parchment/70 dark:bg-white/[0.04] border border-apple-divider/50 dark:border-white/[0.08]',
        className
      )}
    >
      <span
        className={cn(
          'shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
          on
            ? 'bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]'
            : 'bg-apple-divider/40 dark:bg-white/[0.06] text-apple-ink-muted dark:text-white/40'
        )}
        aria-hidden
      >
        <InfinityIcon className="w-4 h-4" strokeWidth={2.2} />
      </span>
      <span className="flex-1 flex flex-col min-w-0 leading-tight">
        <span className="text-[12.5px] font-semibold text-apple-ink dark:text-white">{t('stay.title')}</span>
        <span className="text-[11px] font-medium text-apple-ink-muted dark:text-white/45">{t('stay.hint')}</span>
      </span>
      {/* iOS-style switch: 44×28 track, 24px thumb, 2px inset, 18px travel.
          role=switch + aria-checked; Enter/Space toggle natively via button. */}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        data-testid="stay-connected-toggle"
        aria-label={t('stay.title')}
        onClick={() => setStayConnected(!on)}
        className={cn(
          'relative shrink-0 w-[44px] h-[28px] rounded-full transition-colors duration-200 outline-none',
          'focus-visible:ring-2 focus-visible:ring-[#f06413]/40',
          on ? 'bg-[#f06413] dark:bg-[#fb9243]' : 'bg-apple-divider dark:bg-white/20'
        )}
      >
        <motion.span
          initial={false}
          animate={{ x: on ? 18 : 0 }}
          transition={{ type: 'spring', stiffness: 550, damping: 38 }}
          className="absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        />
      </button>
    </div>
  );
}

/**
 * StayBadge — quiet header chip shown while the room's Stay Connected promise
 * is live. Purely informational; the toggle in the details sheet manages it.
 */
export function StayBadge({ className }: { className?: string }) {
  const { session } = useSession();
  const { t } = useI18n();
  if (!session.stayConnected) return null;
  return (
    <span
      role="status"
      aria-label={t('stay.badge')}
      title={t('stay.badge')}
      data-testid="stay-badge"
      className={cn(
        'shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-[#f06413]/10 dark:bg-[#fb9243]/15 text-[#f06413] dark:text-[#fb9243]',
        className
      )}
    >
      <InfinityIcon className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden />
    </span>
  );
}
