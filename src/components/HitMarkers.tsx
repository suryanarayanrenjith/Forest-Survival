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

export const addHitMarker = (isHeadshot: boolean = false) => {
  const marker: HitMarker = {
    id: `${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    isHeadshot
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
    const tick = () => {
      const now = Date.now();
      const before = damageNumbers.length + hitMarkers.length;
      damageNumbers = damageNumbers.filter((d) => now - d.timestamp < DAMAGE_TTL);
      hitMarkers = hitMarkers.filter((m) => now - m.timestamp < MARKER_TTL);

      forceRender();

      if (damageNumbers.length || hitMarkers.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        // One final render to flush the now-empty lists out of the DOM.
        if (before > 0) forceRender();
      }
    };

    // Whenever a marker/number is added (or cleared), make sure the loop is
    // running so the new item animates immediately.
    updateCallback = () => {
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        forceRender();
      }
    };

    return () => {
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
        {hitMarkers.map((marker) => (
          <div
            key={marker.id}
            className={`absolute ${marker.isHeadshot ? 'text-red-500' : 'text-white'}`}
            style={{
              animation: marker.isHeadshot
                ? 'hitMarkerPop 0.3s cubic-bezier(0.22, 1, 0.36, 1)'
                : 'hitMarkerFade 0.3s ease-out',
              filter: marker.isHeadshot
                ? 'drop-shadow(0 0 4px rgba(239,68,68,0.9))'
                : 'drop-shadow(0 0 3px rgba(0,0,0,0.85))',
            }}
          >
            <div className="relative w-8 h-8">
              {/* Cross hair hit marker */}
              <div className={`absolute top-0 left-1/2 w-0.5 h-3 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-x-1/2`}></div>
              <div className={`absolute bottom-0 left-1/2 w-0.5 h-3 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-x-1/2`}></div>
              <div className={`absolute left-0 top-1/2 w-3 h-0.5 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-y-1/2`}></div>
              <div className={`absolute right-0 top-1/2 w-3 h-0.5 ${marker.isHeadshot ? 'bg-red-500' : 'bg-white'} -translate-y-1/2`}></div>

              {marker.isHeadshot && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Skull className="w-3 h-3 text-red-500" strokeWidth={2.5} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Damage Numbers */}
      <div className="fixed inset-0 pointer-events-none z-40">
        {damageNumbers.map((dmg) => {
          const age = now - dmg.timestamp;
          const progress = Math.min(1, age / DAMAGE_TTL);
          // Smooth eased rise (px), with a quick spawn pop then a gentle drift.
          const yOffset = easeOutCubic(progress) * 78;
          // Stay readable, then fade over the final 45% of life.
          const opacity = progress < 0.55 ? 1 : Math.max(0, 1 - (progress - 0.55) / 0.45);
          // Spawn pop: overshoot to 1.15 in the first 14% then settle to 1.
          const baseScale = dmg.isHeadshot ? 1.18 : dmg.isCritical ? 1.08 : 1;
          const popScale = progress < 0.14
            ? baseScale * (0.55 + easeOutCubic(progress / 0.14) * 0.75)
            : baseScale;
          const driftX = dmg.driftX * easeOutCubic(progress);

          return (
            <div
              key={dmg.id}
              className={`absolute font-extrabold tabular-nums ${
                dmg.isHeadshot
                  ? 'text-red-400 text-2xl'
                  : dmg.isCritical
                  ? 'text-yellow-300 text-xl'
                  : 'text-white text-lg'
              }`}
              style={{
                left: `${dmg.x + driftX}%`,
                top: `${dmg.y}%`,
                transform: `translate(-50%, -${yOffset}px) scale(${popScale})`,
                opacity,
                textShadow: dmg.isHeadshot
                  ? '0 0 12px rgba(239,68,68,0.85), 0 2px 4px rgba(0,0,0,0.9)'
                  : dmg.isCritical
                  ? '0 0 12px rgba(250,204,21,0.7), 0 2px 4px rgba(0,0,0,0.9)'
                  : '0 0 10px rgba(0,0,0,0.85), 0 2px 4px rgba(0,0,0,0.7)',
                pointerEvents: 'none',
                willChange: 'transform, opacity',
              }}
            >
              -{dmg.damage}
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
      `}</style>
    </>
  );
};

export default HitMarkers;
