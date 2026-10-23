import { useEffect, useRef, useState } from 'react';
import { Crown, Flame } from 'lucide-react';

/**
 * Top-centre boss health bar.
 *
 * Bosses had two phases, a summon, a teleport and (now) an enrage with ZERO
 * HUD representation — the player could not tell whether they were making
 * progress, and the phase transition landed as an unexplained difficulty
 * spike. A named bar with a visible phase pip turns the fight into something
 * the player can read and pace themselves against.
 *
 * Driven IMPERATIVELY from the game loop via setBossHealth(), matching the
 * Minimap/HitMarkers pattern: the loop pushes at 60fps and this component
 * throttles itself, so tracking a boss never triggers a React re-render storm
 * in App (which re-renders the whole tree).
 *
 * Layout: it owns the slot directly under the FPS pill and PUBLISHES its
 * bottom edge (subscribeBossBar / getBossBarBottom) so the combo/streak stack
 * can drop beneath it — the two used to overlap in the top-centre lane.
 *
 * No backdrop-filter — the project bans it in-game for performance.
 */

interface BossState {
  name: string;
  health: number;
  maxHealth: number;
  phase: number;
  /** Bumped whenever a phase changes, to retrigger the flash animation. */
  phaseToken: number;
}

let pushState: ((s: BossState | null) => void) | null = null;
let lastPhase = 0;
let phaseToken = 0;

// ── Published layout (external store for the top-centre lane) ──────────────
let barBottom = 0;
const barListeners = new Set<() => void>();
const publishBarBottom = (px: number) => {
  if (px === barBottom) return;
  barBottom = px;
  barListeners.forEach((l) => l());
};
/** useSyncExternalStore subscribe: fires only when the bar appears/moves/hides. */
export const subscribeBossBar = (listener: () => void) => {
  barListeners.add(listener);
  return () => { barListeners.delete(listener); };
};
/** Bottom edge of the boss bar in px from the viewport top (0 = not shown). */
export const getBossBarBottom = () => barBottom;

/**
 * Report the currently-tracked boss, or `null` when none is alive.
 * Safe to call every frame; the component throttles.
 */
export const setBossHealth = (
  name: string | null,
  health = 0,
  maxHealth = 1,
  phase = 1,
): void => {
  if (!pushState) return;
  if (!name || health <= 0) {
    if (lastPhase !== 0) { lastPhase = 0; }
    pushState(null);
    return;
  }
  if (phase !== lastPhase) { lastPhase = phase; phaseToken++; }
  pushState({ name, health, maxHealth, phase, phaseToken });
};

// Label row + bar + breathing room; what the combo stack clears.
const BLOCK_H = 40;
const BAR_SHAPE = '7px 2px';
const BAR_SHAPE_INNER = '6px 1.5px';

const BossHealthBar = ({ isTouch = false, fpsVisible = false }: { isTouch?: boolean; fpsVisible?: boolean }) => {
  const [state, setState] = useState<BossState | null>(null);
  // Throttle the 60fps push down to ~15fps of actual React work — the bar is
  // a smooth CSS width transition, so it reads as continuous regardless.
  //
  // The live state is mirrored into a REF so this effect can depend on `[]`
  // and subscribe exactly once. Depending on `[state]` instead would tear down
  // and re-create the module-level `pushState` binding on every throttled
  // update — up to 15×/s of effect churn during a boss fight, and a window on
  // each swap where the game loop is writing through a stale closure.
  const stateRef = useRef<BossState | null>(null);
  const lastFlushRef = useRef(0);

  useEffect(() => {
    pushState = (s) => {
      const prev = stateRef.current;
      const now = performance.now();
      // Always flush an appear/disappear/phase-change immediately; throttle
      // plain health ticks, which are the overwhelming majority.
      const structural = (s === null) !== (prev === null) || s?.phase !== prev?.phase;
      if (structural || now - lastFlushRef.current >= 66) {
        lastFlushRef.current = now;
        stateRef.current = s;
        setState(s);
      }
    };
    return () => { pushState = null; publishBarBottom(0); };
  }, []);

  // Touch keeps its original slot (the top-centre is its only safe lane);
  // desktop sits right under the FPS pill when that is on.
  const top = isTouch ? 56 : fpsVisible ? 40 : 12;
  const shown = state !== null;
  useEffect(() => {
    publishBarBottom(shown ? top + BLOCK_H : 0);
  }, [shown, top]);

  if (!state) return null;

  const frac = Math.max(0, Math.min(1, state.health / Math.max(1, state.maxHealth)));
  const enraged = state.phase >= 2;
  const accent = enraged ? '#ff5a5f' : '#e07bff';
  const fill = enraged
    ? 'linear-gradient(90deg, #7a1418 0%, #e0343b 60%, #ff8a7a 100%)'
    : 'linear-gradient(90deg, #5a1a8c 0%, #b23be0 60%, #f0a8ff 100%)';
  const Icon = enraged ? Flame : Crown;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[46] -translate-x-1/2 select-none hud-ink"
      style={{ top, width: isTouch ? 'min(78vw, 380px)' : 'min(46vw, 560px)' }}
    >
      {/* Name + phase */}
      <div className="flex items-end justify-between px-0.5 pb-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accent, filter: `drop-shadow(0 0 5px ${accent})` }} strokeWidth={2.4} />
          <span
            className="font-display truncate text-[15px] font-semibold uppercase leading-none text-white"
            style={{ letterSpacing: '0.18em', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}
          >
            {state.name}
          </span>
        </div>
        <span className="hud-label flex-shrink-0" style={{ color: accent, textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.6)' }}>
          {enraged ? 'Enraged' : `Phase ${state.phase}`}
        </span>
      </div>

      {/* Bar: partial-rounded frame → lagging damage chip → live fill → ticks. The glow + phase flash live on the wrapper. */}
      <div
        key={state.phaseToken}
        className="relative h-[11px] w-full"
        style={{ animation: 'bossPhaseFlash 0.55s ease-out', filter: `drop-shadow(0 0 10px ${accent}55)` }}
      >
        <div className="absolute inset-0" style={{ borderRadius: BAR_SHAPE, background: `${accent}80` }} />
        <div className="absolute inset-[1px]" style={{ borderRadius: BAR_SHAPE_INNER, background: 'rgba(7,6,12,0.92)' }}>
          {/* Recent-damage chip: trails the live fill so every chunk reads. */}
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${frac * 100}%`,
              background: 'rgba(255,236,214,0.78)',
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.28s',
            }}
          />
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${frac * 100}%`, background: fill, transition: 'width 0.14s ease-out' }}
          />
          {/* Quarter ticks; the half-way tick is where phase 2 triggers. */}
          {[25, 50, 75].map((p) => (
            <div
              key={p}
              className="absolute inset-y-0 w-px"
              style={{ left: `${p}%`, background: p === 50 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)' }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes bossPhaseFlash {
          0%   { filter: brightness(2.4) drop-shadow(0 0 14px ${accent}); }
          100% { filter: brightness(1) drop-shadow(0 0 10px ${accent}55); }
        }
      `}</style>
    </div>
  );
};

export default BossHealthBar;
