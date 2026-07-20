import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair, ChevronsUp, ChevronsRight, ChevronsDown, RotateCw, Swords, Pause,
  PackageSearch, Move, RotateCcw, Gamepad2, Maximize2, Eye, Hand, Wand2, Magnet,
  type LucideIcon,
} from 'lucide-react';
import {
  useTouchLayout, setControlPosition, setLayoutScale, setLayoutOpacity, setLayoutSnap,
  resetTouchLayout, applyPositions,
  CONTROL_BASE_SIZE, TOUCH_CONTROL_ORDER, SCALE_RANGE, OPACITY_RANGE,
  type TouchControlId,
} from '../utils/touchLayout';
import { haptic } from '../utils/haptics';
import HudForestScene3D from './HudForestScene3D';

// Per-control chip appearance — mirrors the real on-screen buttons so the
// preview reads as the actual HUD, not an abstract diagram.
type Accent = 'red' | 'emerald' | 'amber' | 'slate';
const CHIP_META: Record<TouchControlId, { label: string; icon: LucideIcon; accent: Accent; shape: 'round' | 'square' | 'pill' }> = {
  fire: { label: 'Fire', icon: Crosshair, accent: 'red', shape: 'round' },
  jump: { label: 'Jump', icon: ChevronsUp, accent: 'slate', shape: 'square' },
  ability: { label: 'Ability', icon: ChevronsRight, accent: 'emerald', shape: 'square' },
  melee: { label: 'Melee', icon: Swords, accent: 'slate', shape: 'square' },
  reload: { label: 'Reload', icon: RotateCw, accent: 'amber', shape: 'square' },
  crouch: { label: 'Crouch', icon: ChevronsDown, accent: 'slate', shape: 'square' },
  power: { label: 'Power', icon: PackageSearch, accent: 'slate', shape: 'square' },
  weapon: { label: 'Weapon', icon: Crosshair, accent: 'emerald', shape: 'pill' },
  pause: { label: 'Pause', icon: Pause, accent: 'slate', shape: 'square' },
};

const ACCENT_CLASS: Record<Accent, string> = {
  red: 'border-red-400/70 bg-red-500/35 text-red-50',
  emerald: 'border-emerald-400/60 bg-emerald-500/25 text-emerald-50',
  amber: 'border-amber-400/60 bg-amber-500/25 text-amber-50',
  slate: 'border-white/30 bg-black/70 text-gray-100',
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
// Keep a chip fully on-screen (its centre can't reach the very edge).
const MIN_X = 0.05, MAX_X = 0.95, MIN_Y = 0.07, MAX_Y = 0.93;
const GRID = 0.02;          // snap increment (fraction of the viewport)
const GAP_PX = 6;           // minimum breathing gap enforced between buttons
const snap = (v: number) => Math.round(v / GRID) * GRID;

type Positions = Record<TouchControlId, { x: number; y: number }>;

// ── Overlap separation (AABB, worked in device pixels then back to fractions).
// Guarantees no two buttons touch — "auto-align" that's automatically maintained.
function resolveOne(positions: Positions, id: TouchControlId, startX: number, startY: number, scale: number, aspect: number, deviceW: number): { x: number; y: number } {
  const deviceH = deviceW / aspect;
  let cx = startX * deviceW, cy = startY * deviceH;
  const bm = CONTROL_BASE_SIZE[id];
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    for (const other of TOUCH_CONTROL_ORDER) {
      if (other === id) continue;
      const bo = CONTROL_BASE_SIZE[other];
      const dx = cx - positions[other].x * deviceW;
      const dy = cy - positions[other].y * deviceH;
      const ox = (bm.w + bo.w) * scale / 2 + GAP_PX - Math.abs(dx);
      const oy = (bm.h + bo.h) * scale / 2 + GAP_PX - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox < oy) cx += (dx === 0 ? 1 : Math.sign(dx)) * ox;
        else cy += (dy === 0 ? 1 : Math.sign(dy)) * oy;
        moved = true;
      }
    }
    cx = clamp(cx, MIN_X * deviceW, MAX_X * deviceW);
    cy = clamp(cy, MIN_Y * deviceH, MAX_Y * deviceH);
    if (!moved) break;
  }
  return { x: cx / deviceW, y: cy / deviceH };
}

// Separate EVERY pair (used after auto-arrange or a size increase).
function resolveAll(positions: Positions, scale: number, aspect: number, deviceW: number): Positions {
  const deviceH = deviceW / aspect;
  const p: Record<string, { cx: number; cy: number }> = {};
  for (const id of TOUCH_CONTROL_ORDER) p[id] = { cx: positions[id].x * deviceW, cy: positions[id].y * deviceH };
  for (let iter = 0; iter < 24; iter++) {
    let moved = false;
    for (let i = 0; i < TOUCH_CONTROL_ORDER.length; i++) {
      for (let j = i + 1; j < TOUCH_CONTROL_ORDER.length; j++) {
        const A = TOUCH_CONTROL_ORDER[i], B = TOUCH_CONTROL_ORDER[j];
        const ba = CONTROL_BASE_SIZE[A], bb = CONTROL_BASE_SIZE[B];
        const dx = p[A].cx - p[B].cx, dy = p[A].cy - p[B].cy;
        const ox = (ba.w + bb.w) * scale / 2 + GAP_PX - Math.abs(dx);
        const oy = (ba.h + bb.h) * scale / 2 + GAP_PX - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) { const s = (dx === 0 ? 1 : Math.sign(dx)) * ox / 2; p[A].cx += s; p[B].cx -= s; }
          else { const s = (dy === 0 ? 1 : Math.sign(dy)) * oy / 2; p[A].cy += s; p[B].cy -= s; }
          moved = true;
        }
      }
    }
    for (const id of TOUCH_CONTROL_ORDER) {
      p[id].cx = clamp(p[id].cx, MIN_X * deviceW, MAX_X * deviceW);
      p[id].cy = clamp(p[id].cy, MIN_Y * deviceH, MAX_Y * deviceH);
    }
    if (!moved) break;
  }
  const out = {} as Positions;
  for (const id of TOUCH_CONTROL_ORDER) out[id] = { x: p[id].cx / deviceW, y: p[id].cy / deviceH };
  return out;
}

// Symmetric, equally-spaced arrangement: FIRE anchored bottom-right, the six
// action buttons fanned in an EVEN arc around its upper-left, weapon + pause
// paired top-right. Computed in device PIXELS (isotropic) so equal angular
// steps give equal on-screen spacing — the fraction-space version distorted
// with aspect and packed the buttons together.
function autoArrangeLayout(scale: number, aspect: number, deviceW: number): Positions {
  const deviceH = deviceW / aspect;
  const fireX = 0.9, fireY = 0.8;
  const out = {
    fire: { x: fireX, y: fireY },
    weapon: { x: 0.80, y: 0.10 },
    pause: { x: 0.935, y: 0.10 },
  } as Positions;
  const arc: TouchControlId[] = ['reload', 'ability', 'melee', 'crouch', 'jump', 'power'];
  const fx = fireX * deviceW, fy = fireY * deviceH;
  const stepDeg = 20;
  // Equal centre-to-centre spacing → the radius that makes the chord that wide.
  // Capped so the fan never grows taller than ~42% of the screen; the overlap
  // resolver then guarantees clearance on very short/wide viewports.
  const spacing = 52 * scale + 16;
  const R = Math.min(spacing / (2 * Math.sin((stepDeg / 2) * Math.PI / 180)), 0.42 * deviceH);
  for (let i = 0; i < arc.length; i++) {
    const phi = ((188 + i * stepDeg) * Math.PI) / 180; // sweep the upper-left of FIRE
    out[arc[i]] = {
      x: clamp((fx + R * Math.cos(phi)) / deviceW, MIN_X, MAX_X),
      y: clamp((fy + R * Math.sin(phi)) / deviceH, MIN_Y, MAX_Y),
    };
  }
  return out;
}

/**
 * Mobile/tablet on-screen control arranger — the "button relocation" surface
 * that replaces the desktop key-bindings list in Settings → Controls.
 *
 * Renders a live 3D forest backdrop (matching the real game) with every HUD
 * button drawn at its true relative size, then lets the player drag each one.
 * Auto-align snaps to a grid and separates overlaps automatically so buttons
 * stay evenly spaced and never collide; Auto-Arrange lays out a clean symmetric
 * layout in one tap. Everything is DEVICE-LOCAL (localStorage), never Convex.
 */
const TouchLayoutEditor = () => {
  const layout = useTouchLayout();
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: TouchControlId; pointerId: number; x: number; y: number } | null>(null);
  const [activeId, setActiveId] = useState<TouchControlId | null>(null);

  const [device, setDevice] = useState(() => ({
    w: typeof window === 'undefined' ? 1280 : window.innerWidth,
    aspect: typeof window === 'undefined' ? 16 / 9 : Math.max(1.2, Math.min(2.4, window.innerWidth / window.innerHeight)),
  }));
  useEffect(() => {
    const onResize = () => setDevice({
      w: window.innerWidth,
      aspect: Math.max(1.2, Math.min(2.4, window.innerWidth / window.innerHeight)),
    });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const onChipDown = useCallback((e: React.PointerEvent, id: TouchControlId) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = layout.positions[id];
    drag.current = { id, pointerId: e.pointerId, x: p.x, y: p.y };
    setActiveId(id);
    haptic('tap');
  }, [layout.positions]);

  const onChipMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    let x = clamp((e.clientX - rect.left) / rect.width, MIN_X, MAX_X);
    let y = clamp((e.clientY - rect.top) / rect.height, MIN_Y, MAX_Y);
    if (layout.snap) { x = clamp(snap(x), MIN_X, MAX_X); y = clamp(snap(y), MIN_Y, MAX_Y); }
    d.x = x; d.y = y;
    setControlPosition(d.id, x, y, false); // live, debounced persist
  }, [layout.snap]);

  const onChipUp = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    // Separate from any neighbours so the dropped button never overlaps.
    const resolved = resolveOne(layout.positions, d.id, d.x, d.y, layout.scale, device.aspect, device.w);
    setControlPosition(d.id, resolved.x, resolved.y, true);
    drag.current = null;
    setActiveId(null);
  }, [layout.positions, layout.scale, device.aspect, device.w]);

  const onAutoArrange = useCallback(() => {
    haptic('tap');
    const arranged = autoArrangeLayout(layout.scale, device.aspect, device.w);
    applyPositions(resolveAll(arranged, layout.scale, device.aspect, device.w));
  }, [layout.scale, device.aspect, device.w]);

  // After enlarging buttons, re-separate so a bigger size can't create overlaps.
  const onScaleCommit = useCallback(() => {
    applyPositions(resolveAll(layout.positions, layout.scale, device.aspect, device.w));
  }, [layout.positions, layout.scale, device.aspect, device.w]);

  return (
    <div className="space-y-3" style={{ animation: 'smFade 0.2s ease-out' }}>
      {/* Intro */}
      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] px-3.5 py-2.5">
        <Move className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" strokeWidth={2.2} />
        <p className="text-[11px] leading-snug text-gray-300">
          <span className="font-semibold text-white">Drag any button</span> onto the scene. With <span className="font-semibold text-emerald-300">Auto-align</span> on
          they snap to an even grid and never overlap. Saved to <span className="font-semibold text-emerald-300">this device only</span> — applies instantly in-game.
        </p>
      </div>

      {/* Device-accurate 3D preview */}
      <div className="mx-auto w-full" style={{ maxWidth: `calc(52dvh * ${device.aspect})` }}>
        <div
          ref={boxRef}
          className="relative w-full touch-none select-none overflow-hidden rounded-2xl border border-white/12 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
          style={{ aspectRatio: String(device.aspect) }}
          onPointerMove={onChipMove}
          onPointerUp={onChipUp}
          onPointerCancel={onChipUp}
        >
          {/* Live 3D forest (decorative — never intercepts drags) */}
          <div className="pointer-events-none absolute inset-0">
            <HudForestScene3D />
          </div>
          {/* Legibility veil so light buttons read on the bright grass */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/15" />

          {/* Movement joystick zone hint (left) — not draggable. */}
          <div className="pointer-events-none absolute bottom-0 left-0 flex h-[64%] w-[40%] items-center justify-center">
            <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-white/25 bg-black/25 px-3 py-2">
              <Gamepad2 className="h-4 w-4 text-white/70" strokeWidth={2} />
              <span className="text-[7px] font-bold uppercase tracking-[0.15em] text-white/70">Move zone</span>
            </div>
          </div>

          {/* Look-swipe hint (top-right, subtle) */}
          <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-0.5">
            <Hand className="h-2.5 w-2.5 text-white/60" strokeWidth={2.2} />
            <span className="text-[7px] font-bold uppercase tracking-wider text-white/60">Swipe to look</span>
          </div>

          {/* Draggable button chips */}
          {TOUCH_CONTROL_ORDER.map((id) => {
            const meta = CHIP_META[id];
            const base = CONTROL_BASE_SIZE[id];
            const pos = layout.positions[id];
            const widthPct = (base.w / device.w) * layout.scale * 100;
            const active = activeId === id;
            const isPill = meta.shape === 'pill';
            const Icon = meta.icon;
            return (
              <button
                key={id}
                type="button"
                aria-label={`Move ${meta.label} button`}
                onPointerDown={(e) => onChipDown(e, id)}
                onPointerMove={onChipMove}
                onPointerUp={onChipUp}
                onPointerCancel={onChipUp}
                className={`absolute flex touch-none flex-col items-center justify-center border text-center backdrop-blur-[1px] transition-shadow ${ACCENT_CLASS[meta.accent]} ${
                  meta.shape === 'round' ? 'rounded-full' : 'rounded-xl'
                } ${active ? 'z-20 shadow-[0_0_0_2px_rgba(255,255,255,0.9),0_10px_24px_rgba(0,0,0,0.6)]' : 'z-10 shadow-[0_4px_14px_rgba(0,0,0,0.45)]'}`}
                style={{
                  left: `${pos.x * 100}%`,
                  top: `${pos.y * 100}%`,
                  width: `${widthPct}%`,
                  minWidth: isPill ? 56 : 28,
                  aspectRatio: `${base.w} / ${base.h}`,
                  transform: `translate(-50%, -50%) ${active ? 'scale(1.08)' : 'scale(1)'}`,
                  opacity: Math.max(0.5, layout.opacity),
                  touchAction: 'none',
                }}
              >
                {isPill ? (
                  <span className="flex items-center gap-1 px-1">
                    <Icon className="h-3 w-3 flex-shrink-0" strokeWidth={2.3} />
                    <span className="truncate text-[7px] font-bold uppercase tracking-wide">{meta.label}</span>
                  </span>
                ) : (
                  <>
                    <Icon className="h-1/3 w-1/3 max-h-4 min-h-2.5 min-w-2.5 max-w-4" strokeWidth={2.3} />
                    <span className="mt-0.5 text-[6px] font-bold uppercase leading-none tracking-wide opacity-90">{meta.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-arrange + auto-align */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={onAutoArrange}
          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/[0.1] py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-500/20 active:scale-[0.99]"
        >
          <Wand2 className="h-4 w-4" strokeWidth={2.25} />
          Auto-Arrange
        </button>
        <button
          onClick={() => { haptic('tap'); setLayoutSnap(!layout.snap); }}
          aria-pressed={layout.snap}
          className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
            layout.snap ? 'border-emerald-400/35 bg-emerald-500/[0.08]' : 'border-white/10 bg-white/[0.02]'
          }`}
        >
          <span className="flex items-center gap-2">
            <Magnet className={`h-4 w-4 ${layout.snap ? 'text-emerald-300' : 'text-gray-500'}`} strokeWidth={2.25} />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-200">Auto-align</span>
          </span>
          <span className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${layout.snap ? 'bg-emerald-500' : 'bg-white/15'}`}>
            <span className={`absolute top-0.5 h-[16px] w-[16px] rounded-full bg-white transition-all ${layout.snap ? 'right-0.5' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      {/* Sizing + opacity */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <EditorSlider
          label="Button Size" icon={Maximize2}
          value={Math.round(layout.scale * 100)}
          min={Math.round(SCALE_RANGE.min * 100)} max={Math.round(SCALE_RANGE.max * 100)} step={5}
          onChange={(v) => setLayoutScale(v / 100)}
          onCommit={onScaleCommit}
        />
        <EditorSlider
          label="Opacity" icon={Eye}
          value={Math.round(layout.opacity * 100)}
          min={Math.round(OPACITY_RANGE.min * 100)} max={Math.round(OPACITY_RANGE.max * 100)} step={5}
          onChange={(v) => setLayoutOpacity(v / 100)}
        />
      </div>

      {/* Reset */}
      <button
        onClick={() => { haptic('tap'); resetTouchLayout(); }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-[0.99]"
      >
        <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
        Reset to default layout
      </button>

      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-gray-600">
        <Crosshair className="h-3 w-3 text-emerald-500/70" strokeWidth={2} />
        Firing auto-aims — there's no separate aim button to place.
      </p>
    </div>
  );
};

// ── Compact slider matching the Settings look ──────────────────────────────
const EditorSlider = ({ label, icon: Icon, value, onChange, onCommit, min, max, step }: {
  label: string; icon: LucideIcon; value: number; onChange: (v: number) => void; onCommit?: () => void;
  min: number; max: number; step: number;
}) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.25} />
          <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-300">{label}</span>
        </div>
        <span className="text-xs font-bold tabular-nums text-emerald-300">{value}%</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onTouchEnd={onCommit}
        className="sm-slider h-1.5 w-full cursor-pointer rounded-full"
        style={{ background: `linear-gradient(to right, #34d399 0%, #34d399 ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)` }}
      />
    </div>
  );
};

export default TouchLayoutEditor;
