"use client";

// ---------------------------------------------------------------------------
// OtpInput — Rare UI's otpinput, on join-code duty.
// ---------------------------------------------------------------------------
// Port of rareui.com/components/otpinput (the real `OtpInput` source, MIT +
// Commons Clause with attribution — credited in README). Shipped verbatim:
// the per-slot hidden inputs behind rolling digits, the sliding blinking
// caret, paste/SMS-autofill fill-forward, the contiguity guard (clicking
// past the first gap lands ON the gap), Backspace-then-step-back, the error
// shake, and the success ring that traces each box in turn.
//
// Adaptations: the join code is digits-only (numbers pattern), numeric
// labels come from the app's i18n, and boxes scale up on md+ to match the
// room's pairing tile (h-13 on phones, h-16 on small desktops).
// ---------------------------------------------------------------------------

import React, { useRef, useState, type ComponentProps } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

const PATTERNS = {
  numbers: /^[0-9]$/,
  letters: /^[a-zA-Z]$/,
  both: /^[a-zA-Z0-9]$/,
} as const;

// success draws its own ring in svg, so no css ring here
const RING = {
  idle: 'focus-visible:ring-2 focus-visible:ring-ember/50',
  success: '',
  error: 'ring-2 ring-status-danger/70 delay-150',
} as const;

// var()-with-fallback: this const feeds style/attr props where a token
// class cannot; mirrors --color-status-success in @theme.
const SUCCESS = 'var(--color-status-success, #34C759)';

const SIZES = {
  sm: {
    box: 'size-10 rounded-lg',
    text: 'text-base',
    caret: 'h-5',
    gap: 'gap-1.5',
    px: 40,
    radius: 8,
  },
  md: {
    box: 'h-[52px] w-full rounded-[12px] sm:h-14',
    text: 'text-2xl sm:text-3xl',
    caret: 'h-7 sm:h-9',
    gap: 'gap-1.5 sm:gap-2',
    px: 52,
    radius: 12,
  },
  lg: {
    box: 'size-14 rounded-2xl',
    text: 'text-xl',
    caret: 'h-7',
    gap: 'gap-2.5',
    px: 56,
    radius: 16,
  },
} as const;

const SLOT_CLASS =
  'bg-apple-parchment dark:bg-black text-center font-medium text-transparent caret-transparent outline-none transition-shadow duration-200 selection:bg-transparent disabled:cursor-not-allowed disabled:opacity-50 border border-apple-divider/60 dark:border-apple-tile-3';

const ROLL_SPRING = { type: 'spring', stiffness: 500, damping: 34 } as const;
const CARET_SPRING = { type: 'spring', stiffness: 500, damping: 40 } as const;
const BLINK = {
  duration: 1.1,
  times: [0, 0.5, 0.5, 1],
  repeat: Infinity,
  ease: 'linear' as const,
};

const ROLL = {
  initial: { y: '110%' },
  exit: (cleared: boolean) => ({ y: cleared ? '110%' : '-110%' }),
};

const SHAKE = [0, -8, 8, -8, 8, 0];

const toSlots = (code: string, length: number) =>
  Array.from({ length }, (_, i) => code[i] ?? '');

export type OtpStatus = 'idle' | 'success' | 'error';

export type OtpInputProps = Omit<
  ComponentProps<'div'>,
  'onChange' | 'value' | 'defaultValue'
> & {
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  type?: keyof typeof PATTERNS;
  size?: keyof typeof SIZES;
  status?: OtpStatus;
  mask?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  slotClassName?: string;
  /** Accessibility label for each slot (localized, e.g. "Digit 1 of 6"). */
  slotLabel?: (index: number, length: number) => string;
};

export function OtpInput({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  type = 'numbers',
  size = 'md',
  status = 'idle',
  mask = false,
  disabled,
  autoFocus,
  className,
  slotClassName,
  slotLabel,
  ...props
}: OtpInputProps) {
  const [uncontrolled, setUncontrolled] = useState(() =>
    toSlots(defaultValue, length),
  );
  const [cleared, setCleared] = useState(false);
  const [focused, setFocused] = useState<number | null>(null);
  const [caretX, setCaretX] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  // the slot the user deliberately moved to, so a full code only changes on purpose
  const editingAt = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  // padded, not joined: joining would close a gap left by a mid-code backspace
  const slots =
    value === undefined
      ? Array.from({ length }, (_, i) => uncontrolled[i] ?? '')
      : toSlots(value, length);
  const numeric = type === 'numbers';
  const scale = SIZES[size];
  const caretVisible = focused !== null && !slots[focused];

  const commit = (next: string[]) => {
    if (value === undefined) setUncontrolled(next);
    const code = next.join('');
    onChange?.(code);
    if (next.every(Boolean)) onComplete?.(code);
  };

  const setCharAt = (index: number, char: string) => {
    setCleared(!char);
    commit(slots.map((slot, i) => (i === index ? char : slot)));
  };

  const focusAt = (index: number) => {
    const input = inputs.current[Math.min(Math.max(index, 0), length - 1)];
    input?.focus();
    input?.select();
  };

  const fill = (index: number, chars: string[]) => {
    const room = Math.min(chars.length, length - index);
    const next = [...slots];
    chars.slice(0, room).forEach((char, i) => {
      next[index + i] = char;
    });
    setCleared(false);
    commit(next);
    editingAt.current = null;
    focusAt(index + room);
  };

  const handleChange = (index: number, raw: string) => {
    const chars = raw.split('').filter((char) => PATTERNS[type].test(char));
    if (!chars.length) return;

    // typing into a filled slot appends, so keep only the new character
    const typed =
      chars.length === 1
        ? chars[0]
        : chars.length === 2 && chars[0] === slots[index]
          ? chars[1]
          : null;

    if (typed === null) {
      // anything longer arrived at once: a paste or an SMS autofill
      fill(index, chars);
      return;
    }

    if (slots.every(Boolean) && editingAt.current !== index) return;

    setCharAt(index, typed);
    editingAt.current = null;
    focusAt(index + 1);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => {
        editingAt.current = Math.max(index - 1, 0);
        focusAt(index - 1);
      },
      ArrowRight: () => {
        editingAt.current = Math.min(index + 1, length - 1);
        focusAt(index + 1);
      },
      Backspace: () => {
        if (slots[index]) {
          setCharAt(index, '');
        } else if (index > 0) {
          setCharAt(index - 1, '');
          focusAt(index - 1);
        }
      },
    };

    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const handlePaste = (
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData('text')
      .split('')
      .filter((char) => PATTERNS[type].test(char));
    if (pasted.length) fill(index, pasted);
  };

  // clicking past the first gap lands on the gap, so a code stays contiguous
  const handlePointerDown = (
    index: number,
    event: React.PointerEvent<HTMLInputElement>,
  ) => {
    const firstEmpty = slots.findIndex((slot) => !slot);
    const target = firstEmpty === -1 ? index : Math.min(index, firstEmpty);
    editingAt.current = target;
    if (target === index) return;
    event.preventDefault();
    focusAt(target);
  };

  return (
    <div
      data-slot="otp-input"
      data-status={status}
      data-testid="join-code-input"
      className={cn('relative w-full', className)}
      {...props}
    >
      <motion.div
        onFocus={(event) => {
          const index = inputs.current.indexOf(
            event.target as HTMLInputElement,
          );
          const cell = cells.current[index];
          setFocused(index);
          if (cell) setCaretX(cell.offsetLeft + cell.offsetWidth / 2);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setFocused(null);
          }
        }}
        animate={{
          x: status === 'error' && !reduceMotion ? SHAKE : 0,
        }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        data-slot="otp-input-row"
        className={cn('relative flex w-full items-center', scale.gap)}
      >
        {slots.map((slot, index) => (
          <React.Fragment key={index}>
            <div
              ref={(el) => {
                cells.current[index] = el;
              }}
              data-slot="otp-input-cell"
              data-filled={Boolean(slot)}
              className={cn('relative min-w-0 flex-1', index === 2 && 'ml-2 sm:ml-3')}
            >
              <input
                ref={(el) => {
                  inputs.current[index] = el;
                }}
                data-slot="otp-input-slot"
                data-filled={Boolean(slot)}
                value={slot}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={(event) => handlePaste(index, event)}
                onPointerDown={(event) => handlePointerDown(index, event)}
                onFocus={(event) => event.target.select()}
                type={mask ? 'password' : 'text'}
                inputMode={numeric ? 'numeric' : 'text'}
                autoCapitalize={numeric ? undefined : 'characters'}
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                autoFocus={autoFocus && index === 0}
                disabled={disabled}
                aria-label={
                  slotLabel
                    ? slotLabel(index, length)
                    : `${numeric ? 'Digit' : 'Character'} ${index + 1} of ${length}`
                }
                className={cn(
                  SLOT_CLASS,
                  scale.box,
                  scale.text,
                  RING[status],
                  slotClassName,
                )}
              />

              <AnimatePresence>
                {status === 'success' && (
                  <motion.svg
                    aria-hidden
                    data-slot="otp-input-ring"
                    viewBox={`0 0 52 52`}
                    preserveAspectRatio="none"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="pointer-events-none absolute inset-0 size-full"
                  >
                    <motion.rect
                      x={1}
                      y={1}
                      width={50}
                      height={50}
                      rx={scale.radius - 1}
                      fill="none"
                      stroke={SUCCESS}
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      initial={reduceMotion ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.45,
                              ease: 'easeOut',
                              delay: 0.15 + index * 0.05,
                            }
                      }
                    />
                  </motion.svg>
                )}
              </AnimatePresence>

              <span className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
                <AnimatePresence initial={false} custom={cleared}>
                  {slot && (
                    <motion.span
                      key={slot}
                      custom={cleared}
                      variants={ROLL}
                      initial={reduceMotion ? false : 'initial'}
                      animate={{ y: 0 }}
                      exit={reduceMotion ? { opacity: 0 } : 'exit'}
                      transition={reduceMotion ? { duration: 0 } : ROLL_SPRING}
                      data-slot="otp-input-char"
                      className={cn(
                        'font-semibold text-apple-ink dark:text-white tracking-tighter font-mono leading-none select-none',
                        scale.text,
                      )}
                    >
                      {mask ? '•' : slot}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </div>
          </React.Fragment>
        ))}

        {caretVisible && (
          <motion.span
            aria-hidden
            data-slot="otp-input-caret"
            initial={false}
            animate={{ x: caretX - 1, y: '-50%', opacity: [1, 1, 0, 0] }}
            transition={{
              x: reduceMotion ? { duration: 0 } : CARET_SPRING,
              opacity: BLINK,
            }}
            className={cn(
              'pointer-events-none absolute left-0 top-1/2 w-[2px] rounded-full bg-ember dark:bg-azure-400',
              scale.caret,
            )}
          />
        )}
      </motion.div>
    </div>
  );
}

export default OtpInput;
