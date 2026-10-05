import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Isometric illustrations — the second visual language.
 *
 * Where the product demo tells the story in motion, these explain SPATIAL
 * relationships in stillness: two devices and the wire between them; one
 * temporary shelf receiving whatever a device drops on it. Rules of the
 * system (apply to every illustration that joins these two):
 *
 *   · one projection: true 30° isometric — horizontal edges never tilt
 *     from ±30°, verticals stay vertical. Every box below is computed from
 *     the same `pt()` mapping, so nothing can drift out of register.
 *   · one light: from the upper left. Tops lightest, left faces mid, right
 *     faces darkest — a face's brightness encodes its orientation, once,
 *     everywhere.
 *   · one palette: graphite lines, parchment faces, ember for the one
 *     thing that matters (the object that moves). Colors come from CSS
 *     variables (`--iso-*` in index.css), so light and dark are the same
 *     artwork re-lit, not two drawings.
 *   · no characters, no floating decoration: every shape is either a
 *     device, a surface, an object that transfers, or the path between.
 *
 * Both illustrations are plain SVG — no motion, no JS at runtime, a few
 * hundred bytes, sharp at any DPR.
 */

const ISO_X = Math.cos(Math.PI / 6); // ≈ 0.866
const ISO_Y = Math.sin(Math.PI / 6); // 0.5

/** Isometric floor position (a along the right-down axis, b along the
 *  left-down axis, z up) → SVG screen coordinates. */
const pt = (a: number, b: number, z: number): [number, number] => [
  (a - b) * ISO_X,
  (a + b) * ISO_Y - z,
];

const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * One isometric box: top, left and right faces in the system's light.
 * `x`/`y` anchor the box's floor origin (a=0, b=0, z=0) in SVG space;
 * `w`/`d`/`h` are extents along the two floor axes and up.
 */
function IsoBox({
  x, y, w, d, h,
  base = 0,
  top = 'var(--iso-top)',
  left = 'var(--iso-left)',
  right = 'var(--iso-right)',
  className,
}: {
  x: number; y: number; w: number; d: number; h: number;
  /** Elevation of the box's bottom plane (e.g. standing on a raised slab). */
  base?: number;
  top?: string; left?: string; right?: string;
  className?: string;
}) {
  const common = {
    stroke: 'var(--iso-line)',
    strokeWidth: 1,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  const P = (a: number, b: number, z: number) => pt(x + a, y + b, z + base);
  return (
    <g className={className}>
      <polygon points={poly([P(w, 0, h), P(w, d, h), P(w, d, 0), P(w, 0, 0)])} fill={right} {...common} />
      <polygon points={poly([P(0, d, h), P(w, d, h), P(w, d, 0), P(0, d, 0)])} fill={left} {...common} />
      <polygon points={poly([P(0, 0, h), P(w, 0, h), P(w, d, h), P(0, d, h)])} fill={top} {...common} />
    </g>
  );
}

/** A soft contact shadow lying on a surface (an iso ellipse). */
function IsoShadow({ x, y, rx, ry }: { x: number; y: number; rx: number; ry: number }) {
  return <ellipse cx={x + rx / 2} cy={y} rx={rx} ry={ry} fill="var(--iso-shadow)" />;
}

/* ────────────────────────────────────────────────────────────────────────
   Flagship 1 — Docs, "How it works": laptop → phone, one object crossing.
   What it teaches, in geometry alone: two devices on one desk, a direct
   wire between them, and a file mid-flight — the ember packet is the ONLY
   colored object, because the transfer is the point.
   ──────────────────────────────────────────────────────────────────────── */
export function IsometricShareIllustration({ className, label }: { className?: string; label?: string }) {
  // Layout rule: an item standing on the desk's top surface (z = desk.h in
  // desk-floor coords) gets its anchor shifted by (−h, −h), so the item's
  // z=0 plane coincides with the desk top at the same floor point. Items
  // below are placed with that rule — nothing eyeballed, nothing clipped:
  // the whole scene's screen bbox is x 71..504, y 83..398 in a 560×400 box.
  const desk = { x: 262, y: 0, w: 320, d: 180, h: 12 };
  // Laptop: base on the desk's left half, screen rising from its back edge.
  const lapBase = { x: 280, y: 43, w: 120, d: 75, h: 8 };
  const lapScreen = { x: 280, y: 43, w: 120, d: 8, h: 70 };
  // Phone: standing on the desk's right-front, facing the same way.
  const phone = { x: 518, y: 118, w: 44, d: 8, h: 78 };
  // The packet: mid-flight in the gap between the two screens.
  const packet = { x: 361, y: -41, w: 30, d: 20, h: 16 };

  // Direct wire: laptop screen's top corner → phone's top corner, sagging
  // through the packet's position. Both endpoints touch a device.
  const wire = 'M 302 92 C 334 120, 390 140, 366 234';

  return (
    <svg
      viewBox="0 0 560 400"
      className={cn('block w-full h-auto', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}

      {/* Ground shadow under the desk's front mass. */}
      <IsoShadow x={120} y={384} rx={380} ry={14} />
      <IsoBox {...desk} />

      {/* A photo lying on the desk in front of the laptop: the kind of thing
          that travels here. Flat, quiet, parchment — the packet stays the
          only ember object. */}
      <IsoBox x={320} y={128} w={48} d={36} h={6} top="var(--iso-photo)" />

      {/* Laptop. */}
      <IsoBox {...lapBase} />
      <IsoBox {...lapScreen} />
      {/* Lit display: an inset parallelogram on the screen's front face. */}
      <polygon
        points={poly([
          pt(lapScreen.x + 8, lapScreen.y + lapScreen.d, lapScreen.h - 8),
          pt(lapScreen.x + lapScreen.w - 8, lapScreen.y + lapScreen.d, lapScreen.h - 8),
          pt(lapScreen.x + lapScreen.w - 8, lapScreen.y + lapScreen.d, 8),
          pt(lapScreen.x + 8, lapScreen.y + lapScreen.d, 8),
        ])}
        fill="var(--iso-screen)"
      />

      {/* Phone, display facing the same front as the laptop's. */}
      <IsoBox {...phone} />
      <polygon
        points={poly([
          pt(phone.x + 5, phone.y + phone.d, phone.h - 6),
          pt(phone.x + phone.w - 5, phone.y + phone.d, phone.h - 6),
          pt(phone.x + phone.w - 5, phone.y + phone.d, 6),
          pt(phone.x + 5, phone.y + phone.d, 6),
        ])}
        fill="var(--iso-screen)"
      />

      {/* The direct wire, device to device. */}
      <path
        d={wire}
        fill="none"
        stroke="var(--iso-dim)"
        strokeWidth={1.25}
        strokeDasharray="1 5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* The packet's shadow on the desk, then the packet — ember, the one
          colored object in the whole drawing. */}
      <IsoShadow x={314} y={262} rx={76} ry={12} />
      <IsoBox {...packet} top="var(--iso-accent)" left="var(--iso-accent-soft)" right="var(--iso-accent-deep)" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Flagship 2 — Temporary Space empty state: one temporary shelf.
   What it teaches: devices drop text, photos, files and links onto ONE
   shared, temporary surface — and the small dial says the surface itself
   is on a clock. Not cloud storage: a shelf, with legs, that goes away.
   ──────────────────────────────────────────────────────────────────────── */
export function IsometricSpaceIllustration({ className, label }: { className?: string; label?: string }) {
  // One ground frame: the shelf slab is RAISED on legs (base=40), everything
  // standing on its top uses base=50 (legs 40 + slab 10), the dropped packet
  // hovers at base=61. Floor coordinates chosen so the projected bbox stays
  // inside 0..360 × 0..280: min screen x = (116−112)·cos30 ≈ 3.5, max y at
  // the ground shadow ≈ 231. No clipping, no floating shadows.
  const SHELF = { x: 116, y: 12, w: 240, d: 100, slabH: 10, legH: 40 };
  // A device putting something onto the shelf — on the ground, front-left.
  const phone = { x: 164, y: 150, w: 34, d: 7, h: 58 };
  // The dropped packet: hovering over the dashed target.
  const drop = { x: 168, y: 37, w: 24, d: 16, h: 11 };
  const TOP = SHELF.legH + SHELF.slabH; // z of the shelf's top surface

  return (
    <svg
      viewBox="0 0 360 280"
      className={cn('block w-full h-auto', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {label ? <title>{label}</title> : null}

      {/* Legs + ground shadow: it is furniture, not a cloud. Both legs land
          on the ground plane (z=0) and meet the slab's bottom (z=40). */}
      <IsoShadow x={85} y={222} rx={150} ry={9} />
      <IsoBox x={124} y={92} w={8} d={8} h={SHELF.legH} />
      <IsoBox x={340} y={92} w={8} d={8} h={SHELF.legH} />
      <IsoBox {...SHELF} h={SHELF.slabH} base={SHELF.legH} />

      {/* The drop zone: a dashed target on the shelf top, under the packet. */}
      <polygon
        points={poly([
          pt(158, 30, TOP),
          pt(202, 30, TOP),
          pt(202, 60, TOP),
          pt(158, 60, TOP),
        ])}
        fill="none"
        stroke="var(--iso-dim)"
        strokeWidth={1}
        strokeDasharray="3 3"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {/* What a space holds: a note, a photo, a file, a link — four quiet
          objects, distinguished by proportion and one mark each. */}
      <IsoBox x={176} y={32} w={46} d={32} h={6} base={TOP} />
      <IsoBox x={230} y={38} w={38} d={38} h={6} base={TOP} top="var(--iso-photo)" />
      <IsoBox x={278} y={42} w={34} d={28} h={24} base={TOP} />
      <IsoBox x={124} y={64} w={42} d={28} h={6} base={TOP} />
      {/* The link's mark: one small oval on its top face. */}
      <ellipse
        cx={pt(124 + 21, 64 + 14, TOP + 6)[0]}
        cy={pt(124 + 21, 64 + 14, TOP + 6)[1]}
        rx={8}
        ry={4.5}
        fill="none"
        stroke="var(--iso-dim)"
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />

      {/* Subtle expiry: a dial lying on the shelf's right end. */}
      <g>
        <ellipse
          cx={pt(322, 40, TOP)[0]}
          cy={pt(322, 40, TOP)[1]}
          rx={17}
          ry={9.5}
          fill="var(--iso-top)"
          stroke="var(--iso-line)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={pt(322, 40, TOP)[0]}
          y1={pt(322, 40, TOP)[1]}
          x2={pt(322, 40, TOP)[0] + 9}
          y2={pt(322, 40, TOP)[1] - 3.5}
          stroke="var(--iso-accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>

      {/* The contributing device and its packet, mid-drop. */}
      <IsoBox {...phone} />
      <polygon
        points={poly([
          pt(phone.x + 4, phone.y + phone.d, phone.h - 5),
          pt(phone.x + phone.w - 4, phone.y + phone.d, phone.h - 5),
          pt(phone.x + phone.w - 4, phone.y + phone.d, 5),
          pt(phone.x + 4, phone.y + phone.d, 5),
        ])}
        fill="var(--iso-screen)"
      />
      <IsoShadow x={-3} y={177} rx={54} ry={7} />
      <IsoBox {...drop} base={TOP + 11} top="var(--iso-accent)" left="var(--iso-accent-soft)" right="var(--iso-accent-deep)" />
    </svg>
  );
}
