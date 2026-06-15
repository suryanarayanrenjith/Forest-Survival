import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Radar, Maximize2, X } from 'lucide-react';

/**
 * Minimap (tactical radar)
 * ========================
 * A player-centred, north-up radar for multiplayer that shows the LIVE
 * position of every player (you + allies, each in their own colour) and the
 * surrounding enemies, with a small legend.
 *
 * It is driven IMPERATIVELY: each mounted <canvas> registers itself at module
 * scope and the game loop pushes a fresh frame every tick via
 * {@link renderMinimapFrame}, which paints into every registered canvas. This
 * keeps blip motion 60fps-smooth without a React re-render storm (positions
 * change every frame — props would be far too expensive).
 *
 * Sizes: a compact radar lives in the HUD; tapping/clicking "expand" opens a
 * large modal radar. Both can be mounted at once (the loop paints both). On
 * touch the compact radar is replaced by a single toggle button → modal, so it
 * never eats into the on-screen controls.
 */

export interface MinimapBlip {
  /** World position. */
  x: number;
  z: number;
  /** CSS colour string (allies use their player colour; enemies a fixed red/orange). */
  color: string;
  alive: boolean;
  kind: 'ally' | 'enemy' | 'boss';
}

export interface MinimapFrame {
  selfX: number;
  selfZ: number;
  /** Local player's world-forward direction (normalised, x/z components). */
  dirX: number;
  dirZ: number;
  selfColor: string;
  blips: MinimapBlip[];
}

const TWO_PI = Math.PI * 2;
/** World metres from the radar centre to its edge. */
const RANGE = 115;

const ENEMY_COLOR = 'rgba(248,82,82,0.95)';
const BOSS_COLOR = 'rgba(249,146,42,0.98)';

// ── Module-level live registry (one entry per mounted canvas) ────────────────
interface RadarReg { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size: number; }
const registry = new Set<RadarReg>();
let lastFrame: MinimapFrame | null = null;

/** True while at least one radar canvas is mounted (lets the game loop skip
 *  building a frame entirely when there's nothing to draw into). */
export function isMinimapActive(): boolean {
  return registry.size > 0;
}

// Lets the game loop's key handler pop the expanded map open/closed via a
// keybind (M) — clicking the HUD button is impractical while the pointer is
// locked. Registered by the mounted <Minimap>; a no-op when none is mounted.
let toggleExpandedFn: (() => void) | null = null;
export function toggleMinimapExpanded(): void {
  toggleExpandedFn?.();
}

/** Push one frame to every mounted radar. No-op when none are mounted. */
export function renderMinimapFrame(frame: MinimapFrame): void {
  lastFrame = frame;
  registry.forEach((r) => draw(r, frame));
}

function draw(r: RadarReg, f: MinimapFrame): void {
  const c = r.ctx;
  const s = r.size;
  const cx = s / 2;
  const cy = s / 2;
  const R = s / 2 - 1.5;
  const scale = R / RANGE;          // px per metre
  const k = Math.max(0.85, s / 175); // blip/arrow scale so big radars aren't tiny-dotted

  c.clearRect(0, 0, s, s);

  // ── Radar disc + clip ──
  c.save();
  c.beginPath();
  c.arc(cx, cy, R, 0, TWO_PI);
  c.closePath();
  const bg = c.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  bg.addColorStop(0, 'rgba(12,20,28,0.82)');
  bg.addColorStop(1, 'rgba(5,8,13,0.86)');
  c.fillStyle = bg;
  c.fill();
  c.clip();

  // Range rings + crosshair grid (subtle). Rings sit at FIXED world distances
  // so they read as real engagement ranges; the large (expanded) radar labels
  // them so the player can gauge how far blips are at a glance.
  const big = s > 220;
  const ringDists = [40, 80];
  c.strokeStyle = 'rgba(120,180,200,0.10)';
  c.lineWidth = 1;
  for (let i = 0; i < ringDists.length; i++) {
    const rr = ringDists[i] * scale;
    if (rr >= R) continue;
    c.beginPath();
    c.arc(cx, cy, rr, 0, TWO_PI);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(cx, cy - R); c.lineTo(cx, cy + R);
  c.moveTo(cx - R, cy); c.lineTo(cx + R, cy);
  c.stroke();
  if (big) {
    c.fillStyle = 'rgba(150,195,215,0.38)';
    c.font = `600 ${Math.round(8.5 * k)}px "Inter", system-ui, sans-serif`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let i = 0; i < ringDists.length; i++) {
      const rr = ringDists[i] * scale;
      if (rr >= R) continue;
      c.fillText(`${ringDists[i]}m`, cx + 3 * k, cy - rr);
    }
  }

  // ── Enemy blips (drawn first so allies/self sit on top) ──
  for (let i = 0; i < f.blips.length; i++) {
    const b = f.blips[i];
    if (b.kind === 'ally') continue;
    const rx = (b.x - f.selfX) * scale;
    const rz = (b.z - f.selfZ) * scale;
    if (rx * rx + rz * rz > R * R) continue; // off-radar — keep it uncluttered
    const px = cx + rx;
    const py = cy + rz;
    if (b.kind === 'boss') {
      c.beginPath();
      c.arc(px, py, 4.4 * k, 0, TWO_PI);
      c.fillStyle = BOSS_COLOR;
      c.shadowColor = BOSS_COLOR;
      c.shadowBlur = 7;
      c.fill();
      c.shadowBlur = 0;
      c.lineWidth = 1.2;
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.stroke();
    } else {
      c.beginPath();
      c.arc(px, py, 2.6 * k, 0, TWO_PI);
      c.fillStyle = ENEMY_COLOR;
      c.fill();
    }
  }

  // ── Ally blips (clamped to the rim so off-radar teammates still show a bearing) ──
  for (let i = 0; i < f.blips.length; i++) {
    const b = f.blips[i];
    if (b.kind !== 'ally') continue;
    let rx = (b.x - f.selfX) * scale;
    let rz = (b.z - f.selfZ) * scale;
    const dist = Math.hypot(rx, rz);
    const clamped = dist > R - 4;
    if (clamped) {
      const m = (R - 4) / (dist || 1);
      rx *= m;
      rz *= m;
    }
    const px = cx + rx;
    const py = cy + rz;
    c.beginPath();
    c.arc(px, py, (clamped ? 2.6 : 3.5) * k, 0, TWO_PI);
    c.fillStyle = b.color;
    c.globalAlpha = b.alive ? 1 : 0.4;
    if (b.alive && !clamped) {
      c.shadowColor = b.color;
      c.shadowBlur = 6;
    }
    c.fill();
    c.shadowBlur = 0;
    c.globalAlpha = 1;
    c.lineWidth = 1.2;
    c.strokeStyle = b.alive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
    c.stroke();
  }

  c.restore(); // drop the disc clip

  // ── Local player arrow (centre, points the way you're facing) ──
  const angle = Math.atan2(f.dirZ, f.dirX); // world +x → right, +z → down
  c.save();
  c.translate(cx, cy);
  c.rotate(angle);
  c.beginPath();
  c.moveTo(8.5 * k, 0);
  c.lineTo(-6 * k, 5.2 * k);
  c.lineTo(-3 * k, 0);
  c.lineTo(-6 * k, -5.2 * k);
  c.closePath();
  c.fillStyle = f.selfColor;
  c.shadowColor = f.selfColor;
  c.shadowBlur = 8;
  c.fill();
  c.shadowBlur = 0;
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  c.stroke();
  c.restore();

  // ── Rim + North marker ──
  c.beginPath();
  c.arc(cx, cy, R, 0, TWO_PI);
  c.lineWidth = 1.5;
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.stroke();

  c.fillStyle = 'rgba(160,200,220,0.7)';
  c.font = `700 ${Math.round(9 * k)}px "Inter", system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('N', cx, cy - R + 7 * k);
}

/** A single radar canvas that registers/sizes itself (DPR-aware). */
const RadarCanvas = ({ className, style }: { className?: string; style?: React.CSSProperties }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let reg: RadarReg | null = null;

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth || 150;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(w * dpr); // square
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
      if (reg) registry.delete(reg);
      reg = { el: cv, ctx, size: w };
      registry.add(reg);
      if (lastFrame) draw(reg, lastFrame); // paint immediately so it's never blank
    };

    setup();
    const ro = new ResizeObserver(setup);
    ro.observe(cv);
    window.addEventListener('resize', setup);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setup);
      if (reg) registry.delete(reg);
    };
  }, []);

  return <canvas ref={ref} className={className} style={style} />;
};

const Legend = ({ className = '', soloMode = false }: { className?: string; soloMode?: boolean }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`}>
    {[
      { label: 'You', color: '#ffffff' },
      // Allies only exist in multiplayer — hidden in solo / tutorial.
      ...(soloMode ? [] : [{ label: 'Allies', color: '#38bdf8' }]),
      { label: 'Enemies', color: '#f85252' },
    ].map((item) => (
      <span key={item.label} className="flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: item.color, boxShadow: `0 0 5px ${item.color}88` }}
        />
        <span className="text-[10px] font-medium text-gray-400">{item.label}</span>
      </span>
    ))}
  </div>
);

/** Expanded radar — a large centred panel that stays SHORT of a full-screen
 *  takeover. The overlay layer is pointer-events-none with no dark backdrop, so
 *  the game (and enemies) stay fully visible and playable around it. Press M (or
 *  the X) to close. Portaled to <body> so it always paints above the rest of the
 *  HUD. */
const ExpandedRadar = ({ onClose, soloMode = false }: { onClose: () => void; soloMode?: boolean }) => createPortal(
  <div className="pointer-events-none fixed inset-0 z-[140] flex items-center justify-center p-4">
    <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl border border-white/15 bg-[#0b0f15]/95 p-4 shadow-2xl backdrop-blur-sm">
      <div className="flex w-full items-center justify-between gap-6">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-[0.15em] text-gray-200 uppercase">
          <Radar className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
          Tactical Map
        </span>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2 h-8 text-gray-400 hover:bg-white/[0.06] hover:text-white"
          aria-label="Close map (press M)"
          title="Close map (M)"
        >
          <kbd className="rounded bg-white/10 px-1 font-mono text-[9px] not-italic">M</kbd>
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
      {/* Canvas fills a fixed-size wrapper (the div owns the min() sizing) so
          its on-screen size is unambiguous — a big, easy-to-read radar that
          still leaves the action visible around its edges. */}
      <div
        className="overflow-hidden rounded-xl ring-1 ring-emerald-400/10"
        style={{ width: 'min(420px, 84vw, 74dvh)', height: 'min(420px, 84vw, 74dvh)' }}
      >
        <RadarCanvas className="block h-full w-full" />
      </div>
      <div className="flex w-full items-center justify-between gap-4">
        <Legend soloMode={soloMode} />
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-500">
          Range <span className="text-gray-300">{RANGE} m</span>
        </span>
      </div>
    </div>
  </div>,
  document.body,
);

const Minimap = ({ isTouch = false, standalone = false, soloMode = false }: { isTouch?: boolean; standalone?: boolean; soloMode?: boolean }) => {
  const [expanded, setExpanded] = useState(false);

  // Expose an open/close toggle so the M keybind (game loop) can drive it.
  useEffect(() => {
    toggleExpandedFn = () => setExpanded((v) => !v);
    return () => { toggleExpandedFn = null; };
  }, []);

  // ── Touch: a single toggle button (right-edge stack) → modal radar ──
  // While the big map is open the toggle is hidden, so only ONE map shows.
  if (isTouch) {
    return (
      <>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            aria-label="Open tactical map"
            className="touch-control fixed right-2 top-[162px] z-[46] flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/75 active:scale-95"
            style={{ pointerEvents: 'auto' }}
          >
            <Radar className="h-5 w-5 text-emerald-300" strokeWidth={2.25} />
          </button>
        )}
        {expanded && <ExpandedRadar onClose={() => setExpanded(false)} soloMode={soloMode} />}
      </>
    );
  }

  // ── Desktop: compact inline radar + expand affordance ──
  const panel = (
    <div className="flex-shrink-0 rounded-xl border border-white/10 bg-black/80 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.07]">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.15em] text-gray-400 uppercase">
          <Radar className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.25} />
          Tactical Map
        </span>
        {/* Press M to expand — clicking is impractical while the pointer is
            locked, so the button doubles as a keybind hint. */}
        <button
          onClick={() => setExpanded(true)}
          className="pointer-events-auto flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-500 transition-colors hover:border-emerald-400/40 hover:text-emerald-300"
          aria-label="Expand map (press M)"
          title="Expand map (M)"
        >
          <Maximize2 className="w-3 h-3" strokeWidth={2.5} />
          <kbd className="rounded bg-white/10 px-1 font-mono text-[9px] not-italic">M</kbd>
        </button>
      </div>

      <div className="px-3 pt-3">
        <RadarCanvas className="mx-auto block aspect-square w-full max-w-[148px]" />
      </div>

      <Legend className="px-3 py-2" soloMode={soloMode} />
    </div>
  );

  // While the expanded map is open we HIDE the compact radar entirely so the
  // big map is the only one on screen (no redundant duplicate in the corner).
  return (
    <>
      {!expanded && (standalone
        // Solo / tutorial: self-position below the top-right stats panel.
        // The HUD.tsx Score panel (right-4 top-4 w-44) is taller than it looks —
        // label + 3xl score + kills/wave row + py-3 padding put its bottom edge
        // at ~129px, so the old top-[124px] actually OVERLAPPED it. Sit at
        // top-[152px] for a clean ~24px breathing gap, same w-44 width so the
        // two panels still read as one tidy vertical column.
        ? <div className="pointer-events-none absolute right-4 top-[152px] z-[12] w-44">{panel}</div>
        : panel)}
      {expanded && <ExpandedRadar onClose={() => setExpanded(false)} soloMode={soloMode} />}
    </>
  );
};

export default Minimap;
