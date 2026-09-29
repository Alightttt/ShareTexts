/**
 * DeviceArt — the app's device imagery.
 *
 * One system, three silhouettes (phone / tablet / desktop), drawn in the
 * app's own stroke language and tinted by the device's BRAND HUE where the
 * platform actually tells us one (Samsung's blue, Pixel's teal, a desktop's
 * GPU vendor). Each screen shows the miniature ShareTexts mark — two tiles
 * joined by a stroke — so every device reads "ready to ShareTexts" at a
 * glance, and the overlay's hero tile feels authored, not stock.
 *
 * HONESTY RULE (the web cannot know everything): a desktop's exact chassis
 * model is not exposed by any browser API — no invented "ASUS ROG" pictures.
 * Where the GPU renderer IS readable (Chrome/Edge), the tile carries a
 * vendor badge (NVIDIA / AMD / Intel); where nothing is known, the tile
 * stays clean. Empty always beats fake.
 */

const VENDOR_STYLE: Record<string, string> = {
  NVIDIA: 'bg-[#76b900]/15 text-[#5a8f00] dark:text-[#a3e635]',
  AMD: 'bg-[#ed1c24]/12 text-[#c81e24] dark:text-[#f87171]',
  Intel: 'bg-[#0071c5]/12 text-[#0068b5] dark:text-[#7cc4ff]',
  Apple: 'bg-apple-ink/[0.07] dark:bg-white/[0.12] text-apple-ink/70 dark:text-white/70',
};

/** Brand hue for a phone model string, when it maps to a known family. */
function brandAccentForModel(model: string): string {
  if (/^SM-|SAMSUNG|Galaxy/i.test(model)) return '#1428a0'; // Samsung blue
  if (/Pixel/i.test(model)) return '#0f9d76';               // Pixel teal
  if (/^(CPH|RMX|OPPO|OnePlus|KB2|LE2)/i.test(model)) return '#f46800'; // BBK/OnePlus
  if (/^(M210|V23|vivo|I2)/i.test(model)) return '#415fff'; // vivo blue
  if (/^(RMX)/i.test(model)) return '#fbc02d';
  return '';
}

interface DeviceArtProps {
  kind: 'phone' | 'tablet' | 'desktop';
  model?: string;
  gpu?: string;
  /** Tile edge in px (the SVG scales inside it). 36 rows · 56 overlay hero · 80 feature. */
  size?: number;
  /** Show the ShareTexts mark on the device screen (default true). */
  mark?: boolean;
  /** Breathing halo + status dot — for the "detected" moment in the overlay. */
  pulse?: boolean;
  className?: string;
}

/** The miniature mark: two tiles joined by a stroke — this app, on screen. */
function ScreenMark({ x, y, s, tone }: { x: number; y: number; s: number; tone: string }) {
  const u = s; // unit
  return (
    <g stroke={tone} strokeWidth={u * 0.55} strokeLinecap="round" fill="none">
      <rect x={x} y={y} width={u * 2.2} height={u * 2.2} rx={u * 0.6} />
      <rect x={x + u * 2.6} y={y + u * 2.6} width={u * 2.2} height={u * 2.2} rx={u * 0.6} />
      <path d={`M ${x + u * 2.1} ${y + u * 1.35} L ${x + u * 3.4} ${y + u * 2.75}`} />
    </g>
  );
}

export function DeviceArt({ kind, model, gpu, size = 56, mark = true, pulse = false, className }: DeviceArtProps) {
  const accent = kind === 'desktop'
    ? (gpu ? ({ NVIDIA: '#76b900', AMD: '#ed1c24', Intel: '#0071c5', Apple: '#8e8e93' } as Record<string, string>)[gpu] ?? '' : '')
    : brandAccentForModel(model ?? '');
  const accentSoft = accent ? `${accent}1f` : ''; // ~12% alpha tint
  const stroke = 'currentColor';
  const svg = Math.round(size * 0.56);

  return (
    <span
      className={`relative shrink-0 inline-flex items-center justify-center rounded-[26%] border ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: accentSoft || 'rgba(240,100,19,0.08)',
        borderColor: accent ? `${accent}40` : 'rgba(240,100,19,0.18)',
      }}
      aria-hidden
    >
      {pulse && (
        <span
          className="absolute -inset-1.5 rounded-[30%] st-halo-ring"
          style={{ borderColor: accent ? `${accent}66` : undefined }}
        />
      )}
      <svg width={svg} height={svg} viewBox="0 0 48 48" fill="none" className="text-apple-ink/75 dark:text-white/75">
        {kind === 'phone' && (
          <>
            <rect x="15" y="4" width="18" height="40" rx="5" stroke={stroke} strokeWidth="2.4" />
            <rect x="18" y="9" width="12" height="27" rx="1.5" fill={accentSoft || 'rgba(240,100,19,0.10)'} stroke={accent ? `${accent}55` : 'rgba(240,100,19,0.28)'} strokeWidth="1" />
            <path d="M21.5 6.2h5" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M21 40.5h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
            {mark && <ScreenMark x={20.5} y={17} s={1.5} tone={accent || '#f06413'} />}
          </>
        )}
        {kind === 'tablet' && (
          <>
            <rect x="8" y="6" width="32" height="36" rx="5" stroke={stroke} strokeWidth="2.4" />
            <rect x="12" y="10" width="24" height="26" rx="1.5" fill={accentSoft || 'rgba(240,100,19,0.10)'} stroke={accent ? `${accent}55` : 'rgba(240,100,19,0.28)'} strokeWidth="1" />
            <path d="M21 39h6" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
            {mark && <ScreenMark x={17.5} y={16.5} s={2.1} tone={accent || '#f06413'} />}
          </>
        )}
        {kind === 'desktop' && (
          <>
            <rect x="4" y="7" width="40" height="26" rx="4" stroke={stroke} strokeWidth="2.4" />
            <rect x="7.5" y="10.5" width="33" height="19" rx="1.8" fill={accentSoft || 'rgba(240,100,19,0.10)'} stroke={accent ? `${accent}55` : 'rgba(240,100,19,0.28)'} strokeWidth="1" />
            <path d="M24 33v5" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M15.5 41h17" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
            {mark && <ScreenMark x={17.5} y={15} s={2.3} tone={accent || '#f06413'} />}
          </>
        )}
      </svg>
      {/* GPU vendor badge — desktops only, only when the browser TOLD us. */}
      {kind === 'desktop' && gpu && size >= 48 && (
        <span
          className={`absolute -bottom-1.5 -right-1.5 px-1.5 h-[15px] min-w-[15px] rounded-[5px] flex items-center justify-center text-[8.5px] font-extrabold tracking-wide ${VENDOR_STYLE[gpu] ?? VENDOR_STYLE.Apple}`}
        >
          {gpu === 'Intel' ? 'i' : gpu.charAt(0)}
        </span>
      )}
      {kind !== 'desktop' && accent && size >= 48 && (
        <span
          className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-[#1c1c21]"
          style={{ background: accent }}
        />
      )}
      {pulse && (
        <span className="absolute bottom-0.5 left-0.5 w-2 h-2 rounded-full bg-[#f06413] dark:bg-[#fb9243] st-status-dot" />
      )}
    </span>
  );
}
