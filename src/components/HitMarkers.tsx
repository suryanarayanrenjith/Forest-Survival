import { useEffect, useReducer, useRef } from 'react';
import { Skull } from 'lucide-react';

interface HitMarker {
  id: string;
  timestamp: number;
  isHeadshot: boolean;
  /** Killing blow — drawn bigger, with an expanding confirm ring. */
  isKill?: boolean;
}

// Marker lifetime (ms) — a quick flash.
const MARKER_TTL = 300;

let hitMarkers: HitMarker[] = [];
let updateCallback: (() => void) | null = null;

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
 * Clears all pending hit markers. Used by the shader pre-warm path: we call
 * addHitMarker once at game start to force React to mount the marker DOM nodes
 * (eliminating the first-shot reconciliation hitch), then immediately clear
 * them so the player never sees the fake marks.
 */
export const clearHitMarkers = () => {
  hitMarkers = [];
  if (updateCallback) {
    updateCallback();
  }
};

const HitMarkers = () => {
  // Opt OUT of the React Compiler. The markers live in a module-level array the
  // compiler treats as a constant, so it memoised the JSX on the first (empty)
  // render and every forceRender() re-used it — hit markers never appeared.
  'use no memo';
  // Module arrays are the source of truth; this just kicks React to re-read
  // them. A requestAnimationFrame loop drives the animation at a buttery 60fps
  // instead of the old 20fps setInterval(50ms) stepping. It stays armed for the
  // whole mounted lifetime and only re-renders while something is live — see
  // the effect below for why it deliberately does NOT park itself.
  const [, forceRender] = useReducer((c: number) => (c + 1) % 1_000_000, 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // ROBUST RENDER: a single rAF runs for the whole mounted lifetime instead of
    // parking/unparking itself. The previous park-on-empty scheme depended on a
    // module callback re-arming the loop at exactly the right moment; if that
    // arming was ever missed, freshly-added markers silently never rendered.
    // The always-on loop is dirt cheap and CANNOT miss an update. Expiry is an
    // in-place compaction rather than a `.filter()`: the loop runs every frame
    // for the whole mounted lifetime, and filter allocated a replacement array
    // on each one (even when empty, which is the usual case). Same order, same
    // survivors, no per-frame garbage — and the array identity now stays put.
    let mounted = true;
    let prevCount = 0;
    const tick = () => {
      if (!mounted) return;
      const now = Date.now();
      // Kill markers linger a touch longer so the confirm ring fully sweeps out.
      let w = 0;
      for (let i = 0; i < hitMarkers.length; i++) {
        const m = hitMarkers[i];
        if (now - m.timestamp < (m.isKill ? 460 : MARKER_TTL)) hitMarkers[w++] = m;
      }
      hitMarkers.length = w;
      const count = w;
      // Re-render while anything is live (to animate it) and for one extra frame
      // after the last item clears (to flush it out of the DOM).
      if (count > 0 || prevCount > 0) forceRender();
      prevCount = count;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Flush a new marker to the screen on the SAME tick it's added so it never
    // waits a frame (and never depends on the loop being re-armed).
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

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
        {hitMarkers.map((marker) => {
          // Diagonal ticks (the AAA hit-marker read, distinct from any
          // crosshair style): white = hit, gold = headshot, red + confirm
          // ring + skull = kill.
          const kill = !!marker.isKill;
          const head = marker.isHeadshot && !kill;
          const color = kill ? '#ff4b4f' : head ? '#ffc861' : '#ffffff';
          const size = kill ? 46 : head ? 36 : 30;
          const inner = kill ? 9 : 7;   // gap from centre (px)
          const outer = size / 2;       // tick end (px)
          const stroke = kill ? 3.2 : head ? 2.8 : 2.2;
          const c = size / 2;
          const d = (r: number) => r * 0.7071;
          return (
            <div
              key={marker.id}
              className="absolute"
              style={{
                animation: kill
                  ? 'hitMarkerKill 0.46s cubic-bezier(0.22, 1, 0.36, 1) forwards'
                  : 'hitMarkerPop 0.22s cubic-bezier(0.22, 1, 0.36, 1) forwards',
                filter: kill
                  ? 'drop-shadow(0 0 6px rgba(255,75,79,0.9)) drop-shadow(0 0 1px rgba(0,0,0,0.9))'
                  : head
                    ? 'drop-shadow(0 0 5px rgba(255,200,97,0.85)) drop-shadow(0 0 1px rgba(0,0,0,0.9))'
                    : 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95))',
              }}
            >
              <div className="relative" style={{ width: size, height: size }}>
                {kill && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ border: `2px solid ${color}`, animation: 'killRing 0.46s ease-out forwards' }}
                  />
                )}
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" aria-hidden="true">
                  {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => (
                    <line
                      key={`${sx}${sy}`}
                      x1={c + sx * d(inner)}
                      y1={c + sy * d(inner)}
                      x2={c + sx * d(outer)}
                      y2={c + sy * d(outer)}
                      stroke={color}
                      strokeWidth={stroke}
                      strokeLinecap="square"
                    />
                  ))}
                </svg>
                {kill && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skull className="w-3.5 h-3.5" style={{ color }} strokeWidth={2.5} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes hitMarkerPop {
          0% { opacity: 1; transform: scale(1.35); }
          55% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.92); }
        }
        @keyframes hitMarkerKill {
          0% { opacity: 1; transform: scale(1.6); }
          40% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95); }
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
