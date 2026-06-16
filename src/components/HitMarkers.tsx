import { useEffect, useReducer, useRef } from 'react';
import { Skull } from 'lucide-react';

interface DamageNumber {
  id: string;
  damage: number;
  x: number;
  y: number;
  isHeadshot: boolean;
  isCritical: boolean;
  timestamp: number;
  /** Small random horizontal drift so stacked hits fan out instead of overlapping. */
  driftX: number;
}

interface HitMarker {
  id: string;
  timestamp: number;
  isHeadshot: boolean;
  /** Killing blow — drawn bigger, with an expanding confirm ring. */
  isKill?: boolean;
}

// Lifetimes (ms). Damage numbers float for a beat; markers are a quick flash.
const DAMAGE_TTL = 1000;
const MARKER_TTL = 300;

let damageNumbers: DamageNumber[] = [];
let hitMarkers: HitMarker[] = [];
let updateCallback: (() => void) | null = null;

export const addDamageNumber = (damage: number, x: number, y: number, isHeadshot: boolean = false, isCritical: boolean = false) => {
  const damageNum: DamageNumber = {
    id: `${Date.now()}-${Math.random()}`,
    damage,
    x,
    y,
    isHeadshot,
    isCritical,
    timestamp: Date.now(),
    driftX: (Math.random() - 0.5) * 3.2, // ±1.6% screen-width drift
  };

  damageNumbers.push(damageNum);

  if (updateCallback) {
    updateCallback();
  }
};

export const addHitMarker = (isHeadshot: boolean = false, isKill: boolean = false) => {
  const marker: HitMarker = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    isHeadshot,
    isKill,
  };

  hitMarkers.push(marker);

  if (updateCallback) {
    updateCallback();
  }
};

/**
 * Clears all pending hit markers + damage numbers. Used by the shader
 * pre-warm path: we call addHitMarker / addDamageNumber once at game
 * start to force React to mount the marker DOM nodes (eliminating the
 * first-shot reconciliation hitch), then immediately clear them so the
 * player never sees the fake marks.
 */
export const clearHitMarkers = () => {
  damageNumbers = [];
  hitMarkers = [];
  if (updateCallback) {
    updateCallback();
  }
};

// Cubic ease-out — fast rise that settles, for the float-up motion.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const HitMarkers = () => {
  // Module arrays are the source of truth; this just kicks React to re-read
  // them. A requestAnimationFrame loop runs ONLY while there are live items
  // (it parks itself the moment everything has expired), so the float-up is a
  // buttery 60fps instead of the old 20fps setInterval(50ms) stepping.
  const [, forceRender] = useReducer((c: number) => (c + 1) % 1_000_000, 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // ROBUST RENDER: a single rAF runs for the whole mounted lifetime instead of
    // parking/unparking itself. The previous park-on-empty scheme depended on a
    // module callback re-arming the loop at exactly the right moment; if that
    // arming was ever missed, freshly-added numbers silently never rendered
    // (the "damage numbers don't show" bug). The always-on loop is dirt cheap
    // (two filters over usually-empty arrays) and CANNOT miss an update.
    let mounted = true;
    let prevCount = 0;
    const tick = () => {
      if (!mounted) return;
      const now = Date.now();
      damageNumbers = damageNumbers.filter((d) => now - d.timestamp < DAMAGE_TTL);
      // Kill markers linger a touch longer so the confirm ring fully sweeps out.
      hitMarkers = hitMarkers.filter((m) => now - m.timestamp < (m.isKill ? 460 : MARKER_TTL));
      const count = damageNumbers.length + hitMarkers.length;
      // Re-render while anything is live (to animate it) and for one extra frame
      // after the last item clears (to flush it out of the DOM).
      if (count > 0 || prevCount > 0) forceRender();
      prevCount = count;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Flush a new marker/number to the screen on the SAME tick it's added so it
    // never waits a frame (and never depends on the loop being re-armed).
    updateCallback = () => forceRender();

    return () => {
      mounted = false;
      updateCallback = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const now = Date.now();

  return (
    <>
      {/* Centered Hit Markers */}
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
        {hitMarkers.map((marker) => {
          // A kill confirm reads red + bigger with a sweeping ring; a headshot
          // is red with a skull; a plain hit is a quick white tick.
          const armColor = marker.isKill ? 'bg-red-500' : marker.isHeadshot ? 'bg-red-500' : 'bg-white';
          const size = marker.isKill ? 'w-12 h-12' : 'w-8 h-8';
          const armLong = marker.isKill ? 'h-4' : 'h-3';
          const armWide = marker.isKill ? 'w-4' : 'w-3';
          const armThick = marker.isKill ? 'w-[3px]' : 'w-0.5';
          const armThickH = marker.isKill ? 'h-[3px]' : 'h-0.5';
          return (
            <div
              key={marker.id}
              className={`absolute ${marker.isHeadshot || marker.isKill ? 'text-red-500' : 'text-white'}`}
              style={{
                animation: (marker.isHeadshot || marker.isKill)
                  ? 'hitMarkerPop 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
                  : 'hitMarkerFade 0.3s ease-out',
                filter: (marker.isHeadshot || marker.isKill)
                  ? 'drop-shadow(0 0 5px rgba(239,68,68,0.95))'
                  : 'drop-shadow(0 0 3px rgba(0,0,0,0.85))',
              }}
            >
              <div className={`relative ${size}`}>
                {/* Expanding confirm ring on a kill */}
                {marker.isKill && (
                  <div
                    className="absolute inset-0 rounded-full border-2 border-red-500"
                    style={{ animation: 'killRing 0.46s ease-out forwards' }}
                  />
                )}
                {/* Cross hair hit marker */}
                <div className={`absolute top-0 left-1/2 ${armThick} ${armLong} ${armColor} -translate-x-1/2`}></div>
                <div className={`absolute bottom-0 left-1/2 ${armThick} ${armLong} ${armColor} -translate-x-1/2`}></div>
                <div className={`absolute left-0 top-1/2 ${armWide} ${armThickH} ${armColor} -translate-y-1/2`}></div>
                <div className={`absolute right-0 top-1/2 ${armWide} ${armThickH} ${armColor} -translate-y-1/2`}></div>

                {marker.isHeadshot && !marker.isKill && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skull className="w-3 h-3 text-red-500" strokeWidth={2.5} />
                  </div>
                )}
                {marker.isKill && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skull className="w-4 h-4 text-red-500" strokeWidth={2.5} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Damage Numbers — z-[45] so the damage/kill/headshot screen
          flashes (z-40..42 in ScreenEffects) can never paint over the numbers. */}
      <div className="fixed inset-0 pointer-events-none z-[45]">
        {damageNumbers.map((dmg) => {
          const age = now - dmg.timestamp;
          const progress = Math.min(1, age / DAMAGE_TTL);
          // Smooth eased rise (px), with a quick spawn pop then a gentle drift.
          const yOffset = easeOutCubic(progress) * 86;
          // Stay readable, then fade over the final 40% of life.
          const opacity = progress < 0.6 ? 1 : Math.max(0, 1 - (progress - 0.6) / 0.4);
          // Bigger numbers for bigger hits — chunky tiers read as a real "thunk".
          const magBoost = dmg.damage >= 100 ? 1.32 : dmg.damage >= 50 ? 1.16 : dmg.damage >= 25 ? 1.04 : 0.94;
          const baseScale = (dmg.isHeadshot ? 1.32 : dmg.isCritical ? 1.16 : 1) * magBoost;
          // Spawn pop: punch in big, then settle.
          const popScale = progress < 0.16
            ? baseScale * (0.5 + easeOutCubic(progress / 0.16) * 0.85)
            : baseScale;
          // Clamp so a number near a screen edge never disappears off-screen.
          const left = Math.max(3, Math.min(97, dmg.x + dmg.driftX * easeOutCubic(progress)));
          const top = Math.max(7, Math.min(93, dmg.y));
          // Crisp, readable on ANY background: a dark stroke + a coloured glow.
          const stroke = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
          const glow = dmg.isHeadshot
            ? '0 0 16px rgba(248,113,113,0.95), 0 2px 5px rgba(0,0,0,0.95)'
            : dmg.isCritical
            ? '0 0 14px rgba(250,204,21,0.85), 0 2px 5px rgba(0,0,0,0.95)'
            : '0 0 10px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.85)';

          return (
            <div
              key={dmg.id}
              className={`absolute font-black tabular-nums leading-none ${
                dmg.isHeadshot
                  ? 'text-red-400 text-4xl'
                  : dmg.isCritical
                  ? 'text-yellow-300 text-3xl'
                  : 'text-white text-2xl'
              }`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                transform: `translate(-50%, -${yOffset}px) scale(${popScale})`,
                opacity,
                textShadow: `${stroke}, ${glow}`,
                letterSpacing: '-0.02em',
                pointerEvents: 'none',
                willChange: 'transform, opacity',
              }}
            >
              {dmg.isHeadshot && <span className="align-middle mr-0.5">☠</span>}
              {dmg.damage}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes hitMarkerFade {
          0% {
            opacity: 1;
            transform: scale(1.5);
          }
          100% {
            opacity: 0;
            transform: scale(0.8);
          }
        }
        @keyframes hitMarkerPop {
          0% {
            opacity: 1;
            transform: scale(1.9) rotate(0deg);
          }
          60% {
            opacity: 1;
            transform: scale(1.05) rotate(45deg);
          }
          100% {
            opacity: 0;
            transform: scale(0.85) rotate(45deg);
          }
        }
        @keyframes killRing {
          0% { opacity: 0.95; transform: scale(0.35); }
          70% { opacity: 0.5; }
          100% { opacity: 0; transform: scale(1.7); }
        }
      `}</style>
    </>
  );
};

export default HitMarkers;
