import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { hapticTick, hapticSuccess } from '../../lib/haptics';
import {
  castRating,
  hasUsedApp,
  initialRatingState,
  markAppUsed,
  silenceRating,
  type RatingState,
} from '../../lib/rating';

/**
 * Rating — five stars, and nothing else.
 *
 * The house rules for this control:
 *
 *   · It is a real radio group. Arrow keys walk it, each star carries its own
 *     accessible name ("Rate 4 out of 5"), and the filled count is announced
 *     through aria-checked rather than through colour alone.
 *   · Every star is a 40px tap target even though the glyph is 26px — the
 *     same contract every other control in the app keeps.
 *   · Tapping a star answers instantly (tick haptic, spring settle); the
 *     value is committed on tap, not on some later "submit".
 *   · Reduced motion: the stars still change, they just do not bounce.
 *
 * Controlled from the outside (`value` / `onRate`) so a future server
 * aggregate can render the same stars read-only.
 */
export function Rating({
  value,
  onRate,
  readOnly = false,
  size = 26,
  className,
  testId = 'rating',
}: {
  value: number;
  onRate?: (star: number) => void;
  readOnly?: boolean;
  size?: number;
  className?: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  const commit = (star: number) => {
    if (readOnly) return;
    hapticTick();
    onRate?.(star);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('rate.title')}
      aria-readonly={readOnly || undefined}
      data-testid={testId}
      className={cn('inline-flex items-center', className)}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const on = star <= shown;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={t('rate.star', { n: star })}
            disabled={readOnly}
            data-testid={`${testId}-${star}`}
            onMouseEnter={() => !readOnly && setHover(star)}
            onFocus={() => !readOnly && setHover(star)}
            onBlur={() => setHover(0)}
            onClick={() => commit(star)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                commit(Math.min(5, value + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                commit(Math.max(1, value - 1));
              } else if (e.key === 'Home') {
                e.preventDefault();
                commit(1);
              } else if (e.key === 'End') {
                e.preventDefault();
                commit(5);
              }
            }}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-[10px]',
              'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ember/40 outline-none',
              readOnly ? 'cursor-default' : 'cursor-pointer',
            )}
          >
            <motion.svg
              viewBox="0 0 24 24"
              width={size}
              height={size}
              aria-hidden
              animate={reduced ? undefined : { scale: on ? 1 : 0.94 }}
              transition={{ type: 'spring', stiffness: 520, damping: 24 }}
              className={on ? 'text-ember' : 'text-apple-ink/18 dark:text-white/20'}
            >
              <path
                fill="currentColor"
                d="M12 2.6l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.45 6.19 20.5l1.11-6.47L2.6 9.45l6.5-.95L12 2.6z"
              />
            </motion.svg>
          </button>
        );
      })}
    </div>
  );
}

/**
 * RateCard — the whole "how are we doing?" section, small and self-contained.
 *
 * One shape only: a quiet inline strip. It had a card variant for the About
 * page, but About is a static SEO guide — there is no in-app About to mount
 * it on, and an unused default was a feature nobody could reach.
 *
 * The rules that keep it from being annoying, all enforced here:
 *   · It is inline. Never a modal, never a full-screen interstitial, never
 *     something that steals focus or blocks a tap target.
 *   · It only speaks when it is worth speaking: with autoShow it renders
 *     only AFTER the app has actually been used (the landing's order),
 *     never to someone who hasn't sent a single byte.
 *   · "Not now" snoozes it for a month, "don't ask again" ends it forever.
 *     Both are one tap, both are remembered.
 *   · After rating it says one sentence and stops asking.
 *   · The numbers are never invented: with no votes it shows no average, and
 *     the tally is described as what it is (this device).
 */
export function RateCard({
  className,
  onDone,
  autoShow = false,
}: {
  className?: string;
  onDone?: () => void;
  /** When true the strip only renders for users who have used the app. */
  autoShow?: boolean;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<RatingState>(initialRatingState);
  const [thanks, setThanks] = useState(false);

  // Marking usage is a side effect of the app being used, not of this card:
  // the landing sets it when a room ends. This mirrors it for the case where
  // someone rates from About before ever transferring.
  useEffect(() => {
    if (state.rated) markAppUsed();
  }, [state.rated]);

  const rate = useCallback((star: number) => {
    setState((prev) => castRating(prev, star));
    hapticSuccess();
    setThanks(true);
    window.setTimeout(() => setThanks(false), 3200);
  }, []);

  const silence = useCallback((forever: boolean) => {
    setState((prev) => silenceRating(prev, forever));
    onDone?.();
  }, [onDone]);

  if (state.muted) return null;
  if (autoShow && !hasUsedApp() && !state.rated) return null;

  const averageText =
    state.average !== null
      ? state.count > 1
        ? `${t('rate.average', { avg: state.average.toFixed(1) })} · ${t('rate.votes', { count: state.count })}`
        : t('rate.average', { avg: state.average.toFixed(1) })
      : null;

  return (
    <section
      data-testid="rate-card"
      aria-labelledby="rate-title"
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}
    >
      <div>
        <h2 id="rate-title" className="text-[13.5px] font-semibold text-apple-ink dark:text-white">
          {t('rate.title')}
        </h2>
        <p className="text-[12px] text-apple-ink-muted dark:text-white/50">
          {t('rate.body')}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Rating value={state.mine} onRate={rate} />
        <span className={cn('text-[12px] tabular-nums', state.rated ? 'text-apple-ink dark:text-white' : 'text-apple-ink-muted/70 dark:text-white/35')} data-testid="rate-readout">
          {averageText ?? (state.rated ? `${state.mine} / 5` : '')}
        </span>
      </div>

      <AnimatePresence initial={false}>
        {thanks && (
          <motion.p
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            className="text-[12.5px] font-medium text-ember dark:text-[#fb9243]"
            data-testid="rate-thanks"
          >
            {t('rate.thanks')}
          </motion.p>
        )}
      </AnimatePresence>

      {!state.rated && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => silence(false)}
            className="px-2.5 min-h-[40px] rounded-full text-[12px] font-medium text-apple-ink-muted hover:text-apple-ink dark:text-white/45 dark:hover:text-white transition-colors"
          >
            {t('rate.dismiss')}
          </button>
          <button
            type="button"
            onClick={() => silence(true)}
            className="px-2.5 min-h-[40px] rounded-full text-[12px] font-medium text-apple-ink-muted/70 hover:text-apple-ink dark:text-white/30 dark:hover:text-white/70 transition-colors"
          >
            {t('install.never')}
          </button>
        </div>
      )}
    </section>
  );
}

export default Rating;
