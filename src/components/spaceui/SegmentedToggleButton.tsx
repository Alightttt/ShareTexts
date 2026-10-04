"use client";

// ---------------------------------------------------------------------------
// SegmentedToggleButton — the real OpenSourceUI segmented toggle.
// ---------------------------------------------------------------------------
// Port of opensourceui.in/components/segmented-toggle-button (the actual
// `SegmentedToggleButton` source): the recessed track with its layered inset
// shadow, the sliding white thumb, the per-count width/offset math
// (`calc((100% − padding − gaps) / n)` and the +0.25rem-per-step translate),
// the 500ms cubic-bezier(0.22,1,0.36,1) easing on thumb and label, and the
// motion-reduce kill switch — all verbatim.
//
// Adaptations:
//   · controlled `value` prop (the theme must follow state that other
//     surfaces — header switch, command bar — can also change);
//   · app tokens for track/thumb/labels, plus a dark side (their source is
//     light-only): a lifted-graphite thumb so the selected label stays
//     legible instead of white-on-white;
//   · segments grow to ≥40px (the app's touch floor) and use ember focus;
//   · role=radiogroup/radio instead of tablist/tab — this is a SETTING, not
//     a set of tabs, and screen readers should say so.
// ---------------------------------------------------------------------------
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

export type SegmentedToggleButtonProps = Readonly<
  {
    options?: readonly string[];
    defaultIndex?: number;
    /** Controlled selection (index into options). */
    value?: number;
    onChange?: (index: number, value: string) => void;
    ariaLabel?: string;
  } & ComponentPropsWithoutRef<"div">
>;

const SEGMENT_MOTION =
  "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

const LABEL_MOTION =
  "transition-[color,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none";

function segmentGridClass(count: number): string {
  if (count <= 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-4";
  return "grid-cols-5";
}

function indicatorWidthClass(count: number): string {
  // Subtract horizontal padding (0.5rem) plus inter-segment gaps (gap-1 each).
  if (count <= 2) return "w-[calc((100%-0.75rem)/2)]";
  if (count === 3) return "w-[calc((100%-1rem)/3)]";
  if (count === 4) return "w-[calc((100%-1.25rem)/4)]";
  return "w-[calc((100%-1.5rem)/5)]";
}

function indicatorOffsetClass(count: number, active: number): string {
  if (active <= 0) return "translate-x-0";

  const offsets: Record<number, Record<number, string>> = {
    2: { 1: "translate-x-[calc(100%+0.25rem)]" },
    3: {
      1: "translate-x-[calc(100%+0.25rem)]",
      2: "translate-x-[calc(200%+0.5rem)]",
    },
    4: {
      1: "translate-x-[calc(100%+0.25rem)]",
      2: "translate-x-[calc(200%+0.5rem)]",
      3: "translate-x-[calc(300%+0.75rem)]",
    },
    5: {
      1: "translate-x-[calc(100%+0.25rem)]",
      2: "translate-x-[calc(200%+0.5rem)]",
      3: "translate-x-[calc(300%+0.75rem)]",
      4: "translate-x-[calc(400%+1rem)]",
    },
  };

  const capped = Math.min(count, 5);
  return offsets[capped]?.[active] ?? "translate-x-0";
}

// Segmented toggle — iOS-style sliding thumb with smooth eased motion.
export const SegmentedToggleButton = forwardRef<
  HTMLDivElement,
  SegmentedToggleButtonProps
>(
  (
    {
      className,
      options = ["Day", "Week", "Month"],
      defaultIndex = 0,
      value,
      onChange,
      ariaLabel,
      ...props
    },
    ref,
  ) => {
    const [uncontrolled, setUncontrolled] = useState(defaultIndex);
    const active = value ?? uncontrolled;
    const count = options.length;
    const safeActive = Math.min(Math.max(active, 0), Math.max(count - 1, 0));

    const select = (index: number) => {
      if (value === undefined) setUncontrolled(index);
      onChange?.(index, options[index] ?? "");
    };

    return (
      <div
        ref={ref}
        role="radiogroup"
        aria-label={ariaLabel}
        data-slot="segmented-toggle-button"
        className={cn(
          "relative inline-grid w-fit gap-1 rounded-xl bg-apple-divider/35 dark:bg-white/[0.06] p-1 font-sans text-sm font-medium select-none",
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(0,0,0,0.05),inset_0_-2px_3px_rgba(0,0,0,0.06),0_1px_0_rgba(255,255,255,0.9)]",
          segmentGridClass(count),
          className,
        )}
        {...props}
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1 bottom-1 left-1 rounded-lg bg-white dark:bg-[#54545b]",
            "shadow-[0_2px_4px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-2px_3px_rgba(0,0,0,0.06)]",
            SEGMENT_MOTION,
            indicatorWidthClass(count),
            indicatorOffsetClass(count, safeActive),
          )}
        />

        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={safeActive === index}
            tabIndex={safeActive === index ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => {
              // Arrow keys move the selection — a radiogroup keyboard contract
              // (the original leaned on tab order alone).
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next =
                event.key === "ArrowRight"
                  ? (safeActive + 1) % count
                  : (safeActive - 1 + count) % count;
              select(next);
              const group = (event.currentTarget as HTMLButtonElement).parentElement;
              const buttons = group?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
              buttons?.[next]?.focus();
            }}
            className={cn(
              "relative z-10 min-w-18 min-h-[40px] cursor-pointer rounded-lg px-3 py-2 text-[13px] font-semibold text-center whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ember",
              LABEL_MOTION,
              safeActive === index
                ? "text-apple-ink dark:text-white"
                : "text-apple-ink-muted hover:text-apple-ink dark:text-white/50 dark:hover:text-white/85",
            )}
          >
            {option}
          </button>
        ))}
      </div>
    );
  },
);

SegmentedToggleButton.displayName = "SegmentedToggleButton";

export default SegmentedToggleButton;
