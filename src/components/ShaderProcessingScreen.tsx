import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ArrowRightCircle, Crosshair } from 'lucide-react';

/**
 * Loader phases shown in the status line. They roughly map to the staged
 * warmup pipeline in App.tsx so the user gets meaningful feedback about
 * what's happening while shaders compile.
 */
const PHASES = [
  { label: 'Compiling shaders',       hint: 'GPU programs' },
  { label: 'Warming materials',       hint: 'Bullets · Pickups · Effects' },
  { label: 'Priming post-processing', hint: 'Bloom · God-rays · Tonemap' },
  { label: 'Spawning the world',      hint: 'Terrain · Lighting · Weather' },
];

/** Surfaced to the player when warmup fails. `recoverable` controls
 *  whether "Continue Anyway" is offered. */
export interface WarmupErrorInfo {
  message: string;
  stage?: string;
  detail?: string;
  recoverable: boolean;
}

interface ShaderProcessingScreenProps {
  visible: boolean;
  error?: WarmupErrorInfo | null;
  onContinueAnyway?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Map-agnostic loader — pure CSS/SVG, zero WebGL, minimal animations.
//
//  Earlier iterations were either too heavy (R3F Canvas → competing
//  WebGL context) or too map-specific (forest pines + "Entering the
//  Forest" copy, despite the game shipping 8 different biomes from
//  scorched_wasteland to frozen_tundra). This rewrite is fully neutral:
//  abstract crosshair-themed centerpiece in the brand's emerald/cyan
//  accent, generic "Preparing the battlefield" copy.
//
//  Live animations (intentionally kept small for low-end machines):
//    • Crosshair pulse + slow rotation  (2 transforms on one element)
//    • 3 concentric ring sweeps         (1 keyframe each, GPU composited)
//    • 4 traveling dot accents          (CSS keyframes around the rings)
//    • Centre glow breathe              (opacity loop)
//  Total: 9 cheap transform/opacity loops. No fancy gradients or radial
//  pulses to chew compositor time.
// ─────────────────────────────────────────────────────────────────────────────

const TRAVELING_DOTS = [
  { radius: 110, duration: 7.8,  delay: 0.0,  color: '#34d399' },
  { radius: 110, duration: 7.8,  delay: 3.9,  color: '#22d3ee' },
  { radius: 150, duration: 11.2, delay: 1.2,  color: '#67e8f9' },
  { radius: 150, duration: 11.2, delay: 6.8,  color: '#34d399' },
];

const ShaderProcessingScreen = ({ visible, error, onContinueAnyway }: ShaderProcessingScreenProps) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setPhaseIndex(0);
      setProgress(0);
      progressRef.current = 0;
      return;
    }
    if (error) return; // freeze on error

    setPhaseIndex(0);
    setProgress(0);
    progressRef.current = 0;

    const startedAt = performance.now();
    const phaseInterval = window.setInterval(() => {
      setPhaseIndex((current) => (current + 1) % PHASES.length);
    }, 750);

    let raf = 0;
    let lastReactPushAt = 0;
    const tick = () => {
      const elapsed = performance.now() - startedAt;
      const target = 92 * (1 - Math.exp(-elapsed / 700));
      progressRef.current += (target - progressRef.current) * 0.18;
      if (performance.now() - lastReactPushAt >= 100) {
        lastReactPushAt = performance.now();
        setProgress(progressRef.current);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    return () => {
      window.clearInterval(phaseInterval);
      window.cancelAnimationFrame(raf);
    };
  }, [visible, error]);

  if (!visible) return null;

  const phase = PHASES[phaseIndex];
  const isError = !!error;
  const accent = isError ? '#f87171' : '#34d399';
  const accentSoft = isError ? 'rgba(248,113,113,0.32)' : 'rgba(52,211,153,0.34)';
  const accentFaint = isError ? 'rgba(248,113,113,0.10)' : 'rgba(34,211,238,0.10)';
  const progressValue = Math.min(99, Math.round(progress));

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-[#05080a]" />

      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(ellipse 68% 52% at center 20%, ${accentSoft} 0%, rgba(0,0,0,0) 58%)`,
            'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.56) 100%)',
          ].join(', '),
        }}
      />

      <div
        className="absolute inset-0 sps-centre-glow"
        style={{
          background: `radial-gradient(ellipse 45% 38% at center, ${accentSoft} 0%, ${accentFaint} 35%, transparent 72%)`,
        }}
      />

      <div className="absolute top-6 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-4 py-2 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
          <span className={`block h-1.5 w-1.5 rounded-full ${isError ? 'bg-red-400' : 'bg-emerald-400'}`} />
          <span className={`text-[10px] sm:text-[11px] font-bold tracking-[0.45em] uppercase ${isError ? 'text-red-300/90' : 'text-emerald-300/90'}`}>
            {isError ? 'Warmup Failure' : 'Shader Warmup'}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em] uppercase tabular-nums ${isError ? 'border-red-400/20 bg-red-500/10 text-red-200' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'}`}>
            {progressValue}%
          </span>
        </div>
      </div>

      <div className="absolute inset-0 opacity-[0.22]" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)', mixBlendMode: 'overlay' }} />

      <div className="absolute inset-0 flex items-center justify-center px-4 py-12 sm:py-14">
        <div className="flex w-full max-w-3xl flex-col items-center gap-6 sm:gap-8">
          <div className="relative flex items-center justify-center" style={{ width: 'clamp(240px, 24vw, 320px)', height: 'clamp(240px, 24vw, 320px)' }}>
            <div className="absolute inset-0 rounded-full border border-white/8 bg-white/[0.015] shadow-[0_0_90px_rgba(52,211,153,0.05)]" />
            <div className="absolute inset-[14%] rounded-full border border-white/6 bg-white/[0.02] backdrop-blur-sm" />
            <div className="absolute inset-[28%] rounded-full border border-white/5 bg-black/15" />
            <div className="absolute inset-0 sps-stage">
              <svg
                className="absolute inset-0 sps-ring-outer"
                viewBox="-160 -160 320 320"
                aria-hidden="true"
              >
                <circle cx="0" cy="0" r="150" fill="none" stroke={accent} strokeWidth="1" opacity="0.32" strokeDasharray="2 8" />
              </svg>

              <svg
                className="absolute inset-0 sps-ring-mid"
                viewBox="-160 -160 320 320"
                aria-hidden="true"
              >
                <circle cx="0" cy="0" r="120" fill="none" stroke={accent} strokeWidth="1.5" opacity="0.55" strokeDasharray="34 14" />
              </svg>

              <svg
                className="absolute inset-0 sps-ring-inner"
                viewBox="-160 -160 320 320"
                aria-hidden="true"
              >
                <circle cx="0" cy="0" r="86" fill="none" stroke={accent} strokeWidth="1.8" opacity="0.75" />
                {[0, 90, 180, 270].map((deg) => (
                  <line
                    key={deg}
                    x1={Math.cos((deg * Math.PI) / 180) * 86}
                    y1={Math.sin((deg * Math.PI) / 180) * 86}
                    x2={Math.cos((deg * Math.PI) / 180) * 96}
                    y2={Math.sin((deg * Math.PI) / 180) * 96}
                    stroke={accent}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                ))}
              </svg>

              <div className="absolute inset-0 flex items-center justify-center sps-crosshair">
                <Crosshair
                  className="w-16 h-16"
                  style={{ color: accent, filter: `drop-shadow(0 0 16px ${accentSoft})` }}
                  strokeWidth={1.6}
                />
              </div>

              {!isError && TRAVELING_DOTS.map((dot, i) => (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    animation: `sps-orbit-${dot.radius} ${dot.duration}s linear infinite`,
                    animationDelay: `-${dot.delay}s`,
                  }}
                >
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 7,
                      height: 7,
                      left: -3.5,
                      top: -3.5,
                      background: dot.color,
                      boxShadow: `0 0 10px ${dot.color}, 0 0 20px ${dot.color}55`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div
            className={`pointer-events-auto w-full max-w-[34rem] overflow-hidden rounded-[1.75rem] border backdrop-blur-xl ${
              isError
                ? 'border-red-500/30 bg-black/60 shadow-[0_24px_70px_rgba(0,0,0,0.62),0_0_56px_rgba(239,68,68,0.10)_inset]'
                : 'border-white/10 bg-black/58 shadow-[0_24px_70px_rgba(0,0,0,0.55),0_0_56px_rgba(34,197,94,0.08)_inset]'
            }`}
          >
            <div className={`h-px w-full bg-gradient-to-r ${isError ? 'from-transparent via-red-400/70 to-transparent' : 'from-transparent via-emerald-400/70 to-transparent'}`} />
            <div className="px-6 py-5 sm:px-7 sm:py-6">
              {!isError ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[10px] font-bold tracking-[0.45em] text-emerald-300/90 uppercase">
                      Shader Processing
                    </p>
                    <span className="text-[10px] font-semibold tracking-[0.2em] text-gray-500 uppercase tabular-nums">
                      Step {phaseIndex + 1} / {PHASES.length}
                    </span>
                  </div>

                  <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
                    Preparing the battlefield
                  </h2>
                  <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-gray-300/85 sm:text-sm">
                    Compiling shaders, lighting, and combat materials so the first frame lands cleanly.
                  </p>

                  <div className="mt-5 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] p-0.5">
                      <div
                        className="relative h-full rounded-full"
                        style={{
                          width: `${Math.min(100, progress)}%`,
                          background: 'linear-gradient(90deg, #15803d 0%, #34d399 58%, #22d3ee 100%)',
                          boxShadow: '0 0 14px rgba(52,211,153,0.55)',
                          transition: 'width 120ms linear',
                        }}
                      >
                        <span className="absolute inset-y-0 right-0 w-8 rounded-full bg-white/35 blur-[10px]" />
                      </div>
                    </div>
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase text-emerald-200 tabular-nums">
                      {progressValue}%
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PHASES.map((item, index) => {
                      const activePhase = index === phaseIndex;
                      return (
                        <div
                          key={item.label}
                          className={`rounded-xl border px-3 py-2.5 transition-all duration-200 ${
                            activePhase
                              ? 'border-emerald-400/45 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.14)]'
                              : 'border-white/10 bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[9px] font-semibold tracking-[0.24em] uppercase">
                            <span className={activePhase ? 'text-emerald-200' : 'text-gray-500'}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className={activePhase ? 'text-emerald-300' : 'text-gray-600'}>
                              {activePhase ? 'Live' : 'Queued'}
                            </span>
                          </div>
                          <div className={`mt-2 text-[11px] font-bold tracking-wide ${activePhase ? 'text-white' : 'text-gray-300'}`}>
                            {item.label}
                          </div>
                          <div className={`mt-1 text-[10px] leading-snug ${activePhase ? 'text-emerald-100/80' : 'text-gray-500'}`}>
                            {item.hint}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 text-[10px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
                      <span className="truncate text-gray-300">{phase.label}</span>
                      <span className="hidden truncate normal-case tracking-normal text-gray-500/80 sm:inline">
                        · {phase.hint}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-gray-400">CSS · GPU</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15">
                      <AlertTriangle className="w-5 h-5 text-red-300" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold tracking-[0.45em] text-red-300/90 uppercase">
                        Warmup Failed{error?.stage ? ` · ${error.stage}` : ''}
                      </p>
                      <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
                        {error?.message ?? 'Could not finish preparing the game.'}
                      </h2>
                    </div>
                  </div>

                  {error?.detail && (
                    <pre className="mt-4 max-h-32 overflow-auto rounded-xl border border-white/5 bg-white/[0.025] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-400/90">
                      {error.detail}
                    </pre>
                  )}

                  <p className="mt-4 text-[12px] leading-relaxed text-gray-300/80 sm:text-[13px]">
                    {error?.recoverable
                      ? 'You can continue with reduced visual fidelity, or reload the page to retry the full warmup.'
                      : 'The game can\'t run on this device in its current state. Please reload — if the problem persists, try a different browser or update your GPU drivers.'}
                  </p>

                  <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
                    {error?.recoverable && onContinueAnyway && (
                      <button
                        onClick={onContinueAnyway}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-[12px] font-bold tracking-[0.12em] uppercase text-emerald-200 transition-all duration-200 hover:border-emerald-400/60 hover:bg-emerald-500/25"
                      >
                        <ArrowRightCircle className="w-4 h-4" strokeWidth={2.25} />
                        Continue Anyway
                      </button>
                    )}
                    <button
                      onClick={() => window.location.reload()}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold tracking-[0.12em] uppercase text-gray-300 transition-all duration-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    >
                      <RefreshCw className="w-4 h-4" strokeWidth={2.25} />
                      Reload Page
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        /* Soft centre glow — slow opacity pulse only. */
        @keyframes sps-centre-glow-pulse {
          0%, 100% { opacity: 0.80; }
          50%      { opacity: 1; }
        }
        .sps-centre-glow {
          animation: sps-centre-glow-pulse 3.6s ease-in-out infinite;
          will-change: opacity;
        }

        /* Three ring rotation rates — outer/mid/inner go different ways
           at different speeds so the reticle reads as "actively scanning". */
        @keyframes sps-rot-ccw { from { transform: rotate(360deg); } to { transform: rotate(0deg);   } }
        @keyframes sps-rot-cw  { from { transform: rotate(0deg);   } to { transform: rotate(360deg); } }
        .sps-ring-outer { animation: sps-rot-ccw 28s linear infinite; will-change: transform; }
        .sps-ring-mid   { animation: sps-rot-cw  18s linear infinite; will-change: transform; }
        .sps-ring-inner { animation: sps-rot-ccw 36s linear infinite; will-change: transform; }

        /* Crosshair icon — tiny scale-pulse so the centre feels alive. */
        @keyframes sps-crosshair-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.95; }
          50%      { transform: scale(1.06); opacity: 1; }
        }
        .sps-crosshair { animation: sps-crosshair-pulse 2.6s ease-in-out infinite; will-change: transform, opacity; }

        /* Orbit keyframes — one per unique radius. translate(R, 0) places
           the dot on the ring; the parent rotates with rotate(deg). */
        @keyframes sps-orbit-110 {
          0%   { transform: rotate(0deg)   translate(110px, 0); }
          100% { transform: rotate(360deg) translate(110px, 0); }
        }
        @keyframes sps-orbit-150 {
          0%   { transform: rotate(0deg)   translate(150px, 0); }
          100% { transform: rotate(360deg) translate(150px, 0); }
        }
      `}</style>
    </div>
  );
};

export default ShaderProcessingScreen;
