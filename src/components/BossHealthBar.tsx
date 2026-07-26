import { useEffect, useRef, useState } from 'react';

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

const BossHealthBar = ({ isTouch = false }: { isTouch?: boolean }) => {
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
    return () => { pushState = null; };
  }, []);

  if (!state) return null;

  const frac = Math.max(0, Math.min(1, state.health / Math.max(1, state.maxHealth)));
  const enraged = state.phase >= 2;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 -translate-x-1/2 z-[46] ${isTouch ? 'top-14' : 'top-6'}`}
      style={{ width: isTouch ? 'min(78vw, 380px)' : 'min(46vw, 560px)' }}
    >
      <div className="flex items-baseline justify-between px-0.5 pb-1">
        <span
          className={`text-[11px] font-black uppercase tracking-[0.28em] ${
            enraged ? 'text-red-300' : 'text-fuchsia-200'
          }`}
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
        >
          {state.name}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
            enraged ? 'text-red-400/90' : 'text-fuchsia-300/70'
          }`}
          style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
        >
          {enraged ? 'Enraged' : `Phase ${state.phase}`}
        </span>
      </div>

      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full border"
        style={{
          borderColor: enraged ? 'rgba(248,113,113,0.55)' : 'rgba(232,122,255,0.45)',
          background: 'rgba(8,6,14,0.82)',
          boxShadow: enraged
            ? '0 0 18px rgba(248,113,113,0.35)'
            : '0 0 16px rgba(232,90,255,0.25)',
          animation: `bossPhaseFlash 0.5s ease-out ${state.phaseToken}`,
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-out"
          style={{
            width: `${frac * 100}%`,
            background: enraged
              ? 'linear-gradient(90deg, #7f1d1d 0%, #ef4444 55%, #fca5a5 100%)'
              : 'linear-gradient(90deg, #6b21a8 0%, #c026d3 55%, #f0abfc 100%)',
          }}
        />
        {/* Half-way pip — where phase 2 triggers, so the spike is telegraphed. */}
        <div
          className="absolute top-0 h-full w-px"
          style={{ left: '50%', background: 'rgba(255,255,255,0.4)' }}
        />
      </div>

      <style>{`
        @keyframes bossPhaseFlash {
          0%   { filter: brightness(2.4); }
          100% { filter: brightness(1); }
        }
      `}</style>
    </div>
  );
};

export default BossHealthBar;
