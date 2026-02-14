import { useState, useEffect } from 'react';

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
      {/* Low Health Vignette */}
      {isLowHealth && (
        <div
          className="fixed inset-0 pointer-events-none z-30"
          style={{
            background: `radial-gradient(circle at center, transparent 0%, transparent 40%, rgba(139, 0, 0, ${isCriticalHealth ? 0.6 : 0.3}) 100%)`,
            animation: isCriticalHealth ? 'pulse 1s ease-in-out infinite' : 'none'
          }}
        />
      )}

      {/* Critical Health Warning - Small indicator at bottom */}
      {isCriticalHealth && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 pointer-events-none z-30">
          <div
            className="bg-red-900/80 border border-red-500/60 rounded-full px-4 py-1.5 backdrop-blur-sm"
            style={{ animation: 'pulse 0.8s ease-in-out infinite' }}
          >
            <div className="text-red-400 font-bold text-sm flex items-center gap-2">
              <span>⚠️</span>
              <span>LOW HP</span>
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
          className="fixed inset-0 pointer-events-none z-35"
          style={{
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
            className="fixed inset-0 pointer-events-none z-41"
            style={{
              background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.15) 0%, rgba(250, 204, 21, 0.2) 50%, transparent 80%)',
              animation: 'headshotFlash 0.4s ease-out forwards'
            }}
          />
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 pointer-events-none z-42"
            style={{ animation: 'headshotText 0.4s ease-out forwards' }}
          >
            <div className="bg-yellow-500/90 rounded-full px-4 py-1 backdrop-blur-sm">
              <span className="text-black font-black text-sm tracking-wider">HEADSHOT</span>
            </div>
          </div>
        </>
      )}

      {/* Blood Splatter Effect on Edges */}
      {health < 50 && (
        <>
          <div
            className="fixed top-0 left-0 w-32 h-32 pointer-events-none z-29"
            style={{
              background: `radial-gradient(circle at top left, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed top-0 right-0 w-32 h-32 pointer-events-none z-29"
            style={{
              background: `radial-gradient(circle at top right, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed bottom-0 left-0 w-32 h-32 pointer-events-none z-29"
            style={{
              background: `radial-gradient(circle at bottom left, rgba(139, 0, 0, ${(50 - health) / 50 * 0.3}), transparent)`,
              opacity: 0.6
            }}
          />
          <div
            className="fixed bottom-0 right-0 w-32 h-32 pointer-events-none z-29"
            style={{
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
