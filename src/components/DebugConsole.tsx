import * as THREE from 'three';
import { detectHardwareTier, type HardwareReport } from '../utils/hardwareDetect';

/**
 * ── DEBUG CONSOLE (F3-style system readout) ─────────────────────────────────
 * Compact in-game diagnostics: live renderer stats, world state, memory and
 * the machine's hardware profile. Enabled from Settings → Display → "Show
 * Console / Info" (synced to the account) and rendered in EVERY game mode.
 * Fed by the game loop at ~4Hz through a ref + tick — no per-frame React.
 *
 * POSITIONING (per mode, so it never overlaps the HUD):
 *   • Desktop (solo / tutorial / MP): anchored to the LOWER-LEFT, above the
 *     stamina pie — the vitals panel + wave-perk pills own the upper-left,
 *     and the score / MP roster / tactical map own the right side.
 *   • Touch: below the compact top-left HUD strip (the joystick owns the
 *     lower-left, fire cluster the lower-right).
 *
 * Everything shown is measured, not guessed: renderer counters come straight
 * from `renderer.info`, the heap from `performance.memory`, and the hardware
 * block reuses the SAME probe that drives graphics auto-detect
 * (`detectHardwareTier`), cached module-level so its throwaway WebGL context
 * is only ever created once.
 */

export interface DebugInfo {
  // Performance
  fps: number;
  frameMs: number;
  fpsCap: number;       // 0 = uncapped/V-Sync
  timeScale: number;    // combined slow-mo factor (1 = realtime)
  // Renderer
  webgl2: boolean;
  drawCalls: number;
  triangles: number;
  // World
  mode: string;
  map: string;
  wave: number;         // 0 = hidden (tutorial)
  enemiesAlive: number;
  x: number; y: number; z: number;
  facing: string;
  // Display
  preset: string;
  canvasW: number;
  canvasH: number;
  dpr: number;
  // Memory (Chrome-only; null when the browser hides it)
  heapUsedMB: number | null;
  heapLimitMB: number | null;
}

// The hardware probe spins up a throwaway WebGL context — do it once, lazily,
// the first time the console is actually shown, then reuse forever.
let _hw: HardwareReport | null = null;
const hw = (): HardwareReport => (_hw ??= detectHardwareTier());

const Row = ({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) => (
  <div className="flex justify-between gap-3 whitespace-nowrap">
    <span className="text-gray-500">{k}</span>
    <span className={`tabular-nums ${warn ? 'text-amber-300' : 'text-gray-200'}`}>{v}</span>
  </div>
);

const Rule = () => <div className="my-1 h-px bg-white/10" />;

interface DebugConsoleProps {
  info: DebugInfo | null;
  /** Bumped by the game loop's ~4Hz feed — its only job is to re-render. */
  tick: number;
  isTouch?: boolean;
}

const DebugConsole = ({ info, tick, isTouch = false }: DebugConsoleProps) => {
  void tick;
  if (!info) return null;
  const h = hw();
  const fpsWarn = info.fps > 0 && info.fps < 30;
  const heapWarn = info.heapUsedMB !== null && info.heapLimitMB !== null
    && info.heapUsedMB / Math.max(1, info.heapLimitMB) > 0.8;
  const gpuShort = h.gpuName.length > 21 ? `${h.gpuName.slice(0, 20)}…` : h.gpuName;

  return (
    <div
      className={`pointer-events-none select-none z-40 font-mono ${
        isTouch
          ? 'absolute left-2 top-[150px] max-h-[calc(100dvh-160px)] w-[176px] overflow-hidden text-[9px] leading-[13px]'
          : 'absolute left-4 bottom-[116px] w-[204px] text-[10px] leading-[15px]'
      }`}
    >
      <div className="rounded-xl border border-white/10 bg-black/75 px-3 py-2">
        {/* Header */}
        <div className="mb-1 flex items-baseline justify-between border-b border-emerald-400/25 pb-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">Console</span>
          <span className="text-[8px] text-gray-500">three r{THREE.REVISION}</span>
        </div>

        {/* Performance */}
        <Row k="FPS" v={`${info.fps}${info.fpsCap > 0 ? ` / ${info.fpsCap}` : ''}`} warn={fpsWarn} />
        <Row k="Frame" v={`${info.frameMs.toFixed(1)} ms`} />
        {info.timeScale < 0.999 && <Row k="Slow-mo" v={`×${info.timeScale.toFixed(2)}`} warn />}
        <Rule />

        {/* Renderer */}
        <Row k="API" v={info.webgl2 ? 'WebGL 2' : 'WebGL 1'} />
        <Row k="Draw calls" v={info.drawCalls.toLocaleString()} />
        <Row k="Triangles" v={info.triangles.toLocaleString()} />
        <Rule />

        {/* World */}
        <Row k="Mode" v={info.mode} />
        <Row k="Map" v={info.map} />
        {info.wave > 0 && <Row k="Wave" v={String(info.wave)} />}
        <Row k="Enemies" v={String(info.enemiesAlive)} />
        <Row k="XYZ" v={`${info.x.toFixed(0)} ${info.y.toFixed(0)} ${info.z.toFixed(0)}`} />
        <Row k="Facing" v={info.facing} />
        <Rule />

        {/* Display + memory */}
        <Row k="Preset" v={info.preset} />
        <Row k="Canvas" v={`${info.canvasW}×${info.canvasH} @${info.dpr.toFixed(2)}`} />
        <Row
          k="JS heap"
          v={info.heapUsedMB === null ? 'hidden' : `${info.heapUsedMB.toFixed(0)} / ${(info.heapLimitMB ?? 0).toFixed(0)} MB`}
          warn={heapWarn}
        />
        <Rule />

        {/* System (from the graphics auto-detect probe) */}
        <Row k="GPU" v={gpuShort} />
        <Row k="CPU · RAM" v={`${h.threads}T · ${h.memoryGB ? `${h.memoryGB} GB${h.memoryGB >= 8 ? '+' : ''}` : '—'}`} />
        <Row k="Auto tier" v={`${h.tier} (${h.score.toFixed(1)})`} />
      </div>
    </div>
  );
};

export default DebugConsole;
