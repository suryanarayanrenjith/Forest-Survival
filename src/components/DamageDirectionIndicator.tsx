import { useEffect, useReducer, useRef } from 'react';

/**
 * Directional damage indicator — the red threat arc that sweeps in around the
 * crosshair pointing toward whatever just hit you (Call of Duty / Battlefield
 * staple). Turns "where did that come from?!" into instant spatial awareness,
 * which matters even more on touch where you can't whip the view around fast.
 *
 * Driven imperatively from the game loop via {@link triggerDamageDirection}
 * (same module-singleton pattern as ScreenEffects / HitMarkers). The angle is
 * camera-relative: 0 = dead ahead (arc at top), +90° = to the right, ±180° =
 * behind. A requestAnimationFrame loop runs ONLY while arcs are alive and
 * parks itself when they expire, so it costs nothing at rest.
 */
interface DamageArc {
  id: string;
  /** Camera-relative bearing of the threat, in radians. */
  angle: number;
  timestamp: number;
}

const TTL = 1100; // ms an arc stays on screen

let arcs: DamageArc[] = [];
let updateCallback: (() => void) | null = null;

/** Fire a threat arc at `angleRad` (camera-relative; 0 = ahead, +right). */
export const triggerDamageDirection = (angleRad: number) => {
  // Coalesce near-simultaneous hits from the same bearing so a burst of pellets
  // reads as one strong arc rather than a flickering stack.
  const now = Date.now();
  for (const a of arcs) {
    if (now - a.timestamp < 90 && Math.abs(a.angle - angleRad) < 0.35) {
      a.timestamp = now;
      updateCallback?.();
      return;
    }
  }
  arcs.push({ id: `${now}-${Math.random()}`, angle: angleRad, timestamp: now });
  updateCallback?.();
};

/** Clear all arcs (e.g. on respawn / leaving gameplay). */
export const clearDamageDirections = () => {
  arcs = [];
  updateCallback?.();
};

const DamageDirectionIndicator = ({ isVisible }: { isVisible: boolean }) => {
  const [, forceRender] = useReducer((c: number) => (c + 1) % 1_000_000, 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const before = arcs.length;
      arcs = arcs.filter((a) => now - a.timestamp < TTL);
      forceRender();
      if (arcs.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        if (before > 0) forceRender();
      }
    };
    updateCallback = () => {
      if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
      else forceRender();
    };
    return () => {
      updateCallback = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  if (!isVisible) return null;

  const now = Date.now();

  return (
    <div className="fixed inset-0 pointer-events-none z-30 flex items-center justify-center">
      {arcs.map((arc) => {
        const age = now - arc.timestamp;
        const p = Math.min(1, age / TTL);
        // Quick fade-in, long ease-out so the threat lingers but doesn't nag.
        const opacity = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.88);
        const deg = (arc.angle * 180) / Math.PI;
        // Slight outward drift as it fades — reads as a "shockwave" pushing off.
        const radius = 86 + p * 14;
        return (
          <div
            key={arc.id}
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              transform: `rotate(${deg}deg)`,
              opacity,
              willChange: 'opacity, transform',
            }}
          >
            <svg
              width="150"
              height="150"
              viewBox="0 0 150 150"
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translateY(-${radius - 75}px)`,
                overflow: 'visible',
                filter: 'drop-shadow(0 0 6px rgba(239,68,68,0.7))',
              }}
            >
              {/* Arc segment centred on 12 o'clock, sweeping ±34°. */}
              <path
                d="M 53.2 14.8 A 64 64 0 0 1 96.8 14.8"
                fill="none"
                stroke="url(#ddiGrad)"
                strokeWidth={p < 0.5 ? 7 : 6}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="ddiGrad" x1="0" y1="0" x2="150" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="rgba(248,113,113,0.05)" />
                  <stop offset="50%" stopColor="rgba(239,68,68,0.95)" />
                  <stop offset="100%" stopColor="rgba(248,113,113,0.05)" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        );
      })}
    </div>
  );
};

export default DamageDirectionIndicator;
