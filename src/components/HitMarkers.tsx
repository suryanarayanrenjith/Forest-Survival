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
    // arming was ever missed, freshly-added markers silently never rendered.
    // The always-on loop is dirt cheap (one filter over a usually-empty array)
    // and CANNOT miss an update.
    let mounted = true;
    let prevCount = 0;
    const tick = () => {
      if (!mounted) return;
      const now = Date.now();
      // Kill markers linger a touch longer so the confirm ring fully sweeps out.
      hitMarkers = hitMarkers.filter((m) => now - m.timestamp < (m.isKill ? 460 : MARKER_TTL));
      const count = hitMarkers.length;
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
