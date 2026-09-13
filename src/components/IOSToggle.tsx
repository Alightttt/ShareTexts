import React, { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'motion/react';
import { cn } from '../lib/utils';

/**
 * Wide iOS switch — the reference image, exactly.
 *
 *   Track   wide pill at native UISwitch proportions (51×31 at md),
 *           iOS system green when on, quiet neutral when off.
 *   Knob    white circle with the standard 1px inset, real UISwitch
 *           travel and a landing squish.
 *   Drag    press and slide — commits past the halfway point, exactly
 *           like UISwitch. A plain click also works.
 *
 * Reduced motion: the spring collapses to a 120ms fade-slide, no squish.
 */

// Native UISwitch geometry: 51×31 track, 27×27 knob, 2px inset (2x scale).
const TRACK_W = 51;
const TRACK_H = 31;
const KNOB = 27;
const PADDING = 2;

export function IOSToggle({
  checked,
  onToggle,
  size = 'md',
  className,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Accessible name announced by assistive tech. */
  label?: string;
}) {
  // sm/md/lg scale the native recipe proportionally.
  const dims =
    size === 'sm' ? { w: 43, h: 26, knob: 22, pad: 2 } :
    size === 'lg' ? { w: 59, h: 36, knob: 32, pad: 2 } :
    { w: TRACK_W, h: TRACK_H, knob: KNOB, pad: PADDING };
  const travel = dims.w - dims.knob - dims.pad * 2;

  const reduce = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  // Drag state: knob x follows the finger while pressed.
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragBase = useRef(0);
  // Set on pointerup so the browser-synthesized click after a press is
  // swallowed — pointer events alone decide the outcome. Reset on the next
  // pointerdown; keyboard activations (Enter/Space) never set it, so they
  // still toggle via click.
  const suppressClick = useRef(false);
  const x = useMotionValue(checked ? travel : 0);

  const spring = reduce
    ? { duration: 0.12, ease: 'easeOut' as const }
    : { type: 'spring' as const, stiffness: 500, damping: 30 };

  const commit = useCallback((next: boolean) => {
    animate(x, next ? travel : 0, spring);
    onToggle();
  }, [x, travel, onToggle, spring]);

  const handleClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    commit(!checked);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    setDragging(true);
    dragStartX.current = e.clientX;
    dragBase.current = x.get();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX.current;
    const next = Math.max(0, Math.min(travel, dragBase.current + dx));
    x.set(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    // This pointer interaction fully determines the outcome; eat the click.
    suppressClick.current = true;
    const dx = e.clientX - dragStartX.current;
    const next = Math.abs(dx) <= 3
      ? !checked // a tap, not a drag — plain toggle
      : x.get() > travel / 2; // a drag — commit by which half it landed in
    if (next !== checked) {
      commit(next);
    } else {
      animate(x, checked ? travel : 0, spring);
    }
  };

  // Track color: iOS system green when on; quiet neutral when off. A flat
  // fill is what iOS itself uses for the off state.
  const trackBg = checked
    ? 'linear-gradient(180deg, #35d458 0%, #30c94f 100%)'
    : 'rgba(120,120,128,0.32)';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Toggle theme'}
      onClick={handleClick}
      className={cn(
        'relative shrink-0 cursor-pointer select-none touch-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ember',
        'active:scale-[0.97] transition-transform duration-100',
        className
      )}
      style={{ width: dims.w, height: dims.h, background: 'transparent', border: 'none', padding: 0 }}
    >
      {/* Track — the switch's visual body, inset like a recessed groove */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full transition-[background] duration-200"
        style={{
          background: trackBg,
          boxShadow: checked
            ? 'inset 0 1px 3px rgba(0,0,0,0.12)'
            : 'inset 0 1px 3px rgba(0,0,0,0.08), inset 0 0 0 0.5px rgba(0,0,0,0.04)',
        }}
        // Pointer events live on the track too so a press anywhere toggles,
        // but the knob's drag handlers are the interactive layer.
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      {/* Knob — the plain white circle. The wrapper owns position; the inner
          div owns the landing squish so scaleX never skews the position. */}
      <motion.div
        aria-hidden
        className="absolute rounded-full"
        style={{
          top: dims.pad,
          left: dims.pad,
          width: dims.knob,
          height: dims.knob,
          x,
        }}
        animate={{ x: dragging ? x.get() : (checked ? travel : 0) }}
        transition={spring}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <motion.div
          className="w-full h-full rounded-full"
          style={{
            background: 'linear-gradient(180deg, #ffffff 0%, #f2f2f4 100%)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.18), 0 1px 1px rgba(0,0,0,0.12), inset 0 0.5px 0 rgba(255,255,255,0.9)',
            originX: 0.5,
          }}
          animate={dragging ? { scaleX: 1.15, scaleY: 0.92 } : { scaleX: 1, scaleY: 1 }}
          transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 500, damping: 26 }}
        />
      </motion.div>
    </button>
  );
}
