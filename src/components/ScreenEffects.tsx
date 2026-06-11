import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ScreenEffectsProps {
  health: number;
  maxHealth?: number;
  isVisible: boolean;
}

let damageFlashCallback: (() => void) | null = null;
let screenShakeCallback: (() => void) | null = null;
let killFlashCallback: (() => void) | null = null;
let headshotFlashCallback: (() => void) | null = null;

export const triggerDamageFlash = () => {
  if (damageFlashCallback) {
    damageFlashCallback();
  }
};

export const triggerScreenShake = () => {
  if (screenShakeCallback) {
    screenShakeCallback();
  }
};

export const triggerKillFlash = () => {
  if (killFlashCallback) {
    killFlashCallback();
  }
};

export const triggerHeadshotFlash = () => {
  if (headshotFlashCallback) {
    headshotFlashCallback();
  }
};

const ScreenEffects = ({ health, maxHealth = 100, isVisible }: ScreenEffectsProps) => {
  const [damageFlash, setDamageFlash] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [killFlash, setKillFlash] = useState(false);
  const [headshotFlash, setHeadshotFlash] = useState(false);

  useEffect(() => {
    damageFlashCallback = () => {
      setDamageFlash(true);
      setTimeout(() => setDamageFlash(false), 200);
    };

    screenShakeCallback = () => {
      setScreenShake(true);
      setTimeout(() => setScreenShake(false), 500);
    };

    killFlashCallback = () => {
      setKillFlash(true);
      setTimeout(() => setKillFlash(false), 300);
    };

    headshotFlashCallback = () => {
      setHeadshotFlash(true);
      setTimeout(() => setHeadshotFlash(false), 400);
    };

    return () => {
      damageFlashCallback = null;
      screenShakeCallback = null;
      killFlashCallback = null;
      headshotFlashCallback = null;
    };
  }, []);

  if (!isVisible) return null;

  const healthPercent = (health / maxHealth) * 100;
  const isLowHealth = healthPercent < 30;
  const isCriticalHealth = healthPercent < 15;

  return (
    <>
      {/* Low Health Vignette.
          PERF: this full-screen layer pulses for as long as the player stays
          critical, so it must live on its own GPU-composited layer
          (will-change + translateZ) — without that, Chromium repaints the
          whole viewport every animation frame on top of the WebGL canvas,
          which was the "game lags hard at low health" report. */}
      {isLowHealth && (
        <div
          className="fixed inset-0 pointer-events-none z-30"
          style={{
            background: `radial-gradient(circle at center, transparent 0%, transparent 40%, rgba(139, 0, 0, ${isCriticalHealth ? 0.6 : 0.3}) 100%)`,
            animation: isCriticalHealth ? 'pulse 1s ease-in-out infinite' : 'none',
            willChange: isCriticalHealth ? 'opacity' : undefined,
            transform: 'translateZ(0)',
          }}
        />
      )}

      {/* Critical Health Warning - Small indicator at bottom.
          PERF: no backdrop-filter here — a blur element that is ITSELF
          animated forces the browser to re-blur the live canvas behind it
          every single frame. A solid translucent fill reads the same. */}
      {isCriticalHealth && (
        <div className="fixed bottom-28 left-1/2 transform -translate-x-1/2 pointer-events-none z-30">
          <div
            className="bg-red-950/90 border border-red-500/60 rounded-full px-4 py-1.5"
            style={{ animation: 'pulse 0.8s ease-in-out infinite', willChange: 'opacity' }}
          >
            <div className="text-red-400 font-bold text-xs tracking-[0.15em] uppercase flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span>Low Health</span>
            </div>
          </div>
        </div>
      )}

      {/* Damage Flash */}
      {damageFlash && (
        <div
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            background: 'radial-gradient(circle at center, rgba(255, 0, 0, 0.3), transparent)',
            animation: 'damageFlash 0.2s ease-out'
          }}
        />
      )}

      {/* Screen Shake Container */}
      {screenShake && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 35,
            animation: 'screenShake 0.5s ease-out'
          }}
        />
      )}

      {/* Kill Confirmation Flash - green edge glow */}
      {killFlash && (
        <div
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            background: 'radial-gradient(circle at center, transparent 30%, rgba(34, 197, 94, 0.25) 100%)',
            animation: 'killFlash 0.3s ease-out forwards'
          }}
        />
      )}

      {/* Headshot Flash - brighter white/gold flash */}
      {headshotFlash && (
        <>
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              zIndex: 41,
              background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.15) 0%, rgba(250, 204, 21, 0.2) 50%, transparent 80%)',
              animation: 'headshotFlash 0.4s ease-out forwards'
            }}
          />
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 pointer-events-none"
            style={{ zIndex: 42, animation: 'headshotText 0.4s ease-out forwards' }}
          >
            <div className="bg-yellow-500/95 rounded-full px-4 py-1">
              <span className="text-black font-black text-sm tracking-wider">HEADSHOT</span>
            </div>
          </div>
        </>
      )}

      {/* Blood Splatter Effect on Edges */}
      {health < 50 && (
        <>
          <div
            className="fixed top-0 left-0 w-32 h-32 pointer-events-none"
            style={{
              zIndex: 29,
              background: `radial-gradient(circle at top left, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed top-0 right-0 w-32 h-32 pointer-events-none"
            style={{
              zIndex: 29,
              background: `radial-gradient(circle at top right, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed bottom-0 left-0 w-32 h-32 pointer-events-none"
            style={{
              zIndex: 29,
              background: `radial-gradient(circle at bottom left, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed bottom-0 right-0 w-32 h-32 pointer-events-none"
            style={{
              zIndex: 29,
              background: `radial-gradient(circle at bottom right, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
        </>
      )}

      <style>{`
        @keyframes damageFlash {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes screenShake {
          0%, 100% {
            transform: translate(0, 0);
          }
          10% {
            transform: translate(-5px, 5px);
          }
          20% {
            transform: translate(5px, -5px);
          }
          30% {
            transform: translate(-5px, -5px);
          }
          40% {
            transform: translate(5px, 5px);
          }
          50% {
            transform: translate(-5px, 5px);
          }
          60% {
            transform: translate(5px, -5px);
          }
          70% {
            transform: translate(-5px, -5px);
          }
          80% {
            transform: translate(5px, 5px);
          }
          90% {
            transform: translate(-2px, 2px);
          }
        }

        @keyframes killFlash {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes headshotFlash {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
            transform: scale(1.05);
          }
        }

        @keyframes headshotText {
          0% {
            opacity: 0;
            transform: translateX(-50%) translateY(10px) scale(0.8);
          }
          20% {
            opacity: 1;
            transform: translateX(-50%) translateY(0) scale(1.1);
          }
          80% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateX(-50%) translateY(-5px) scale(1);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  );
};

export default ScreenEffects;
