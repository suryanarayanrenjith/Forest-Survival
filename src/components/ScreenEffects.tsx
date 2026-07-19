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
let abilityFlashCallback: ((color: string) => void) | null = null;
let waveEventCallback: ((kind: 'surge' | 'glitch' | null) => void) | null = null;
let radiationCallback: ((level: number) => void) | null = null;

/**
 * ARK-07 network-event ambience — a PERSISTENT full-screen treatment that
 * stays up for the whole modified wave (unlike the one-shot flashes above):
 * 'surge' = pulsing red overdrive edges, 'glitch' = CSS interference bands
 * (the WebGL corruption is layered by PostProcessing on capable tiers; this
 * DOM layer is the guaranteed floor so Low/Ultra-Low read the event too),
 * null = clean signal. Called from the game loop on wave transitions only.
 */
export const setWaveEventOverlay = (kind: 'surge' | 'glitch' | null) => {
  if (waveEventCallback) waveEventCallback(kind);
};

/**
 * ARK-07 relay interference (0 = clear → 1 = standing on a relay pad).
 * The DOM floor of the "cooked visor" look: a desaturating static vignette +
 * flickering scan bands. Capable tiers additionally get the WebGL defocus
 * blur via PostProcessing.setInterference — this layer guarantees the read
 * on Low/Ultra-Low. Throttled by the caller (~4Hz), never per frame.
 */
export const setInterferenceOverlay = (level: number) => {
  if (radiationCallback) radiationCallback(level);
};

export const triggerDamageFlash = () => {
  if (damageFlashCallback) {
    damageFlashCallback();
  }
};

/**
 * Tinted full-screen pulse when a character ability is cast — the colour is the
 * ability's accent, so each signature move announces itself with its own hue
 * (cyan dash, amber adrenaline, green triage, …). Pairs with the world-space
 * AbilityCastEffect for a readable "I just used my power" moment.
 */
export const triggerAbilityFlash = (color: string) => {
  if (abilityFlashCallback) {
    abilityFlashCallback(color);
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
  const [abilityFlash, setAbilityFlash] = useState<{ color: string; key: number } | null>(null);
  const [waveEvent, setWaveEvent] = useState<'surge' | 'glitch' | null>(null);
  const [radiation, setRadiation] = useState(0);

  useEffect(() => {
    abilityFlashCallback = (color: string) => {
      setAbilityFlash({ color, key: Date.now() });
      setTimeout(() => setAbilityFlash(null), 420);
    };

    waveEventCallback = (kind) => setWaveEvent(kind);
    // Quantise to 0.05 steps so tiny per-push drift can't cause re-renders.
    radiationCallback = (level) => {
      setRadiation(Math.round(Math.max(0, Math.min(1, level)) * 20) / 20);
    };

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
      abilityFlashCallback = null;
      waveEventCallback = null;
      radiationCallback = null;
    };
  }, []);

  if (!isVisible) return null;

  const healthPercent = (health / maxHealth) * 100;
  const isLowHealth = healthPercent < 30;
  const isCriticalHealth = healthPercent < 15;

  return (
    <>
      {/* ── OVERDRIVE SURGE ambience — pulsing red overdrive edges held for
          the whole surge wave. Own composited layer (will-change + translateZ)
          so the persistent pulse never repaints the viewport. */}
      {waveEvent === 'surge' && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 28,
            background: 'radial-gradient(ellipse at center, transparent 52%, rgba(255, 42, 20, 0.16) 100%)',
            animation: 'surgePulse 1.6s ease-in-out infinite',
            willChange: 'opacity',
            transform: 'translateZ(0)',
          }}
        />
      )}

      {/* ── NULL WAVE interference — DOM floor for the corrupted-signal look.
          Two thin scanning tear-bands + a magenta/cyan fringe vignette. The
          bands animate transform ONLY (positioning comes from top/left), so
          nothing here trips the animation-clobbers-transform trap. */}
      {waveEvent === 'glitch' && (
        <>
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              zIndex: 28,
              background: 'radial-gradient(ellipse at center, transparent 58%, rgba(64, 224, 255, 0.10) 88%, rgba(255, 60, 220, 0.12) 100%)',
              animation: 'glitchVignette 0.9s steps(3, jump-none) infinite',
              willChange: 'opacity',
              transform: 'translateZ(0)',
            }}
          />
          <div
            className="fixed left-0 w-full pointer-events-none"
            style={{
              zIndex: 28,
              top: '18%',
              height: '3px',
              background: 'rgba(120, 240, 255, 0.20)',
              boxShadow: '0 0 12px rgba(120, 240, 255, 0.35)',
              animation: 'glitchBandA 2.7s steps(9, jump-none) infinite',
              willChange: 'transform, opacity',
            }}
          />
          <div
            className="fixed left-0 w-full pointer-events-none"
            style={{
              zIndex: 28,
              top: '64%',
              height: '2px',
              background: 'rgba(255, 80, 230, 0.16)',
              boxShadow: '0 0 10px rgba(255, 80, 230, 0.3)',
              animation: 'glitchBandB 3.4s steps(11, jump-none) infinite',
              willChange: 'transform, opacity',
            }}
          />
        </>
      )}

      {/* ── ARK-07 RELAY INTERFERENCE — the "cooked visor" DOM layer. A
          desaturating static-grey vignette with a faint sickly-green bias
          closes in with exposure, and two whisper-thin scan bands drift the
          frame. The real defocus blur runs in the WebGL grade shader on
          capable tiers; this floor guarantees the read everywhere. */}
      {radiation > 0.02 && (
        <>
          <div
            className="fixed inset-0 pointer-events-none"
            style={{
              zIndex: 29,
              background: `radial-gradient(ellipse at center, transparent ${Math.round(52 - radiation * 20)}%, rgba(140, 155, 140, ${(0.10 + radiation * 0.14).toFixed(3)}) 86%, rgba(96, 170, 110, ${(0.12 + radiation * 0.2).toFixed(3)}) 100%)`,
              animation: radiation > 0.4 ? 'interferenceFlicker 0.65s steps(2, jump-none) infinite' : 'none',
              willChange: radiation > 0.4 ? 'opacity' : undefined,
              transform: 'translateZ(0)',
            }}
          />
          {radiation > 0.3 && (
            <div
              className="fixed left-0 w-full pointer-events-none"
              style={{
                zIndex: 29,
                top: '34%',
                height: '2px',
                background: `rgba(190, 220, 195, ${(radiation * 0.16).toFixed(3)})`,
                animation: 'interferenceScan 4.2s linear infinite',
                willChange: 'transform',
              }}
            />
          )}
        </>
      )}

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

      {/* Ability cast flash — tinted edge pulse in the ability's accent hue. */}
      {abilityFlash && (
        <div
          key={abilityFlash.key}
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            background: `radial-gradient(circle at center, transparent 35%, ${abilityFlash.color}33 100%)`,
            animation: 'abilityFlash 0.42s ease-out forwards',
            willChange: 'opacity',
            transform: 'translateZ(0)',
          }}
        />
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

      {/* Headshot Flash — brighter white/gold flash. The old "HEADSHOT" text
          pill that rode with it was REMOVED: it overlapped the FPS pill and
          the combo display in the same top-centre strip, and the headshot is
          already announced by this flash + the red skull hit marker. One
          event, one announcement. */}
      {headshotFlash && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            zIndex: 41,
            background: 'radial-gradient(circle at center, rgba(255, 255, 255, 0.15) 0%, rgba(250, 204, 21, 0.2) 50%, transparent 80%)',
            animation: 'headshotFlash 0.4s ease-out forwards'
          }}
        />
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

        @keyframes abilityFlash {
          0% { opacity: 0; }
          18% { opacity: 1; }
          100% { opacity: 0; }
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

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @keyframes surgePulse {
          0%, 100% { opacity: 0.75; }
          50% { opacity: 1; }
        }

        @keyframes interferenceFlicker {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        @keyframes interferenceScan {
          0% { transform: translateY(-16vh); }
          100% { transform: translateY(30vh); }
        }

        @keyframes glitchVignette {
          0%, 100% { opacity: 0.55; }
          33% { opacity: 1; }
          66% { opacity: 0.3; }
        }

        @keyframes glitchBandA {
          0% { transform: translateY(0); opacity: 0; }
          8% { opacity: 0.9; }
          34% { transform: translateY(38vh); opacity: 0.15; }
          35% { opacity: 0; }
          60% { transform: translateY(-12vh); opacity: 0.7; }
          78% { transform: translateY(20vh); opacity: 0; }
          100% { transform: translateY(0); opacity: 0; }
        }

        @keyframes glitchBandB {
          0% { transform: translateY(0); opacity: 0; }
          18% { transform: translateY(-26vh); opacity: 0.8; }
          19% { opacity: 0; }
          47% { transform: translateY(10vh); opacity: 0.55; }
          72% { transform: translateY(-30vh); opacity: 0; }
          100% { transform: translateY(0); opacity: 0; }
        }
      `}</style>
    </>
  );
};

export default ScreenEffects;
