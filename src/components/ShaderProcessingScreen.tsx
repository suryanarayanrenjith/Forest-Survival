import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ArrowRightCircle, Trees } from 'lucide-react';

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
//  Forest-themed loader — pure CSS/SVG, zero WebGL, minimal animations.
//
//  Previous version had 8 orbital particles + 2 spinning rings + a pulsing
//  emissive core. That's 11 simultaneous transform/opacity animations
//  plus a big radial gradient pulse. On low-end machines the compositor
//  bogged down — what the user described as "laggy".
//
//  This rewrite reduces the visual to:
//    • 3 static pine silhouettes at varying scales (depth feel — no anim)
//    • A central feature pine with a gentle 4s scale breathing
//    • 5 falling leaves with simple translate + opacity (slow, staggered)
//    • Forest fog wash at the bottom (static gradient)
//  Total live animations: 6 cheap transform/opacity loops. Vs 11 before.
//  And the theme matches the game (Forest Survival).
// ─────────────────────────────────────────────────────────────────────────────

const FALLING_LEAVES = [
  { x: 22,  size: 11, duration: 9.4,  delay: 0.0, hue: '#34d399', drift:  18 },
  { x: 38,  size: 9,  duration: 11.2, delay: 1.7, hue: '#22c55e', drift: -22 },
  { x: 58,  size: 12, duration: 8.6,  delay: 3.2, hue: '#86efac', drift:  14 },
  { x: 72,  size: 8,  duration: 10.8, delay: 0.8, hue: '#34d399', drift: -10 },
  { x: 82,  size: 10, duration: 12.4, delay: 2.4, hue: '#22c55e', drift:  20 },
];

// SVG pine silhouette — a single path used for every tree (varies via scale
// + opacity + horizontal position). One-time render, no per-frame work.
const PineSilhouette = ({
  fill = '#0a1a12',
  opacity = 1,
  className = '',
  style,
}: { fill?: string; opacity?: number; className?: string; style?: React.CSSProperties }) => (
  <svg
    viewBox="0 0 100 200"
    className={className}
    style={{ opacity, ...style }}
    preserveAspectRatio="xMidYEnd meet"
    aria-hidden="true"
  >
    {/* Trunk */}
    <rect x="46" y="160" width="8" height="40" fill={fill} />
    {/* Stacked canopy triangles — chunky low-poly silhouette */}
    <polygon points="50,8  86,82  14,82"   fill={fill} />
    <polygon points="50,52 90,124 10,124"  fill={fill} />
    <polygon points="50,98 94,168 6,168"   fill={fill} />
  </svg>
);

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

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden">
      {/* Deep forest base background */}
      <div className="absolute inset-0 bg-[#02070a]" />

      {/* Top-down warm twilight wash → deep forest floor */}
      <div
        className="absolute inset-0"
        style={{
          background: isError
            ? 'linear-gradient(180deg, rgba(35,8,8,0.92) 0%, rgba(8,10,10,1) 60%, rgba(2,7,10,1) 100%)'
            : 'linear-gradient(180deg, rgba(10,30,18,0.55) 0%, rgba(4,12,8,0.92) 55%, rgba(2,7,10,1) 100%)',
        }}
      />

      {/* Soft emerald center glow — single radial, no animation */}
      <div
        className="absolute inset-0"
        style={{
          background: isError
            ? 'radial-gradient(ellipse 50% 40% at center 60%, rgba(239,68,68,0.18) 0%, transparent 65%)'
            : 'radial-gradient(ellipse 50% 40% at center 60%, rgba(52,211,153,0.20) 0%, transparent 65%)',
        }}
      />

      {/* Top decorative tag */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <span className={`block w-1.5 h-1.5 rounded-full animate-pulse ${isError ? 'bg-red-400' : 'bg-emerald-400'}`} />
        <p className={`text-[10px] tracking-[0.5em] font-bold uppercase ${isError ? 'text-red-300/90' : 'text-emerald-300/90'}`}>
          Forest Survival
        </p>
        <span
          className={`block w-1.5 h-1.5 rounded-full animate-pulse ${isError ? 'bg-red-400' : 'bg-emerald-400'}`}
          style={{ animationDelay: '0.3s' }}
        />
      </div>

      {/*
        Forest centerpiece — flat silhouette layers (background depth +
        the breathing hero pine). Pure SVG layered with absolute
        positioning, no JS animation. Sits in the center 60% region of
        the viewport so the bottom status card has room.
      */}
      <div className="absolute inset-x-0 top-[16%] bottom-[34%] flex items-end justify-center pointer-events-none">
        <div className="sps-forest-stage relative w-[680px] max-w-[92vw] h-full flex items-end justify-center">

          {/* Distant background trees — faint, no animation */}
          <PineSilhouette
            fill="#0e1f17"
            opacity={0.55}
            className="absolute"
            style={{ left: '6%',  bottom: 0, width: '110px', height: '180px' }}
          />
          <PineSilhouette
            fill="#0f211a"
            opacity={0.6}
            className="absolute"
            style={{ left: '22%', bottom: 0, width: '92px',  height: '160px' }}
          />
          <PineSilhouette
            fill="#0c1c14"
            opacity={0.5}
            className="absolute"
            style={{ right: '8%', bottom: 0, width: '120px', height: '200px' }}
          />
          <PineSilhouette
            fill="#0e1f17"
            opacity={0.55}
            className="absolute"
            style={{ right: '24%', bottom: 0, width: '88px', height: '155px' }}
          />

          {/* Hero centre pine — gently breathing (4s scale loop) */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 sps-hero-pine"
               style={{ width: 260, height: 360 }}>
            {/* Glow halo behind the pine */}
            <div
              className="absolute inset-0 sps-hero-glow rounded-full"
              style={{
                background: isError
                  ? 'radial-gradient(circle at 50% 60%, rgba(239,68,68,0.34) 0%, transparent 60%)'
                  : 'radial-gradient(circle at 50% 60%, rgba(52,211,153,0.35) 0%, rgba(34,211,238,0.10) 40%, transparent 65%)',
                filter: 'blur(2px)',
              }}
            />
            <PineSilhouette
              fill={isError ? '#1a0a0a' : '#0a1810'}
              className="absolute inset-0"
            />
            {/* Magical glow points scattered on the canopy — pulsing
                lucide twinkle. Pure CSS, 3 elements only. */}
            {!isError && (
              <>
                <span className="absolute sps-twinkle" style={{ left: '36%', top: '22%', animationDelay: '0s' }} />
                <span className="absolute sps-twinkle" style={{ left: '58%', top: '38%', animationDelay: '0.7s' }} />
                <span className="absolute sps-twinkle" style={{ left: '46%', top: '54%', animationDelay: '1.4s' }} />
              </>
            )}
          </div>

          {/* Falling leaves — 5 tiny coloured squares drifting down with
              slight horizontal sway. The animation is the same for all
              leaves; per-leaf delay + duration randomises the rhythm. */}
          {!isError && FALLING_LEAVES.map((leaf, i) => (
            <span
              key={i}
              className="absolute rounded-[2px] sps-falling-leaf"
              style={{
                left: `${leaf.x}%`,
                top: '-12%',
                width: leaf.size,
                height: leaf.size * 0.7,
                background: leaf.hue,
                opacity: 0.7,
                boxShadow: `0 0 6px ${leaf.hue}55`,
                animationDuration: `${leaf.duration}s`,
                animationDelay: `${leaf.delay}s`,
                ['--sps-drift' as string]: `${leaf.drift}px`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* Ground fog band — sits above the bottom status card */}
      <div
        className="absolute inset-x-0 bottom-[20%] h-32 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(8,18,12,0.65) 60%, rgba(2,7,10,0.95) 100%)',
        }}
      />

      {/* Bottom card — loading state OR error state */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-10 px-5 pointer-events-auto">
        {!isError ? (
          <div
            className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-black/55 px-6 py-5 backdrop-blur-xl"
            style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.55), 0 0 56px rgba(34,197,94,0.08) inset' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trees className="w-3.5 h-3.5 text-emerald-300/90" strokeWidth={2.25} />
                <p className="text-[10px] font-bold tracking-[0.45em] text-emerald-300/90 uppercase">
                  Entering the Forest
                </p>
              </div>
              <span className="text-[10px] font-bold tracking-[0.2em] text-emerald-200/85 uppercase tabular-nums">
                {Math.min(99, Math.round(progress))}%
              </span>
            </div>

            <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Preparing the battlefield
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-300/85">
              Compiling forest shaders, lighting, and combat materials so the first frame lands cleanly.
            </p>

            {/* Determinate progress bar — pure emerald gradient */}
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, progress)}%`,
                  background: 'linear-gradient(90deg, #15803d 0%, #34d399 60%, #86efac 100%)',
                  boxShadow: '0 0 10px rgba(52,211,153,0.55)',
                  transition: 'width 120ms linear',
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
              <span className="flex items-center gap-2 min-w-0">
                <span className="block h-1 w-1 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="text-gray-300 truncate">{phase.label}</span>
                <span className="text-gray-500/80 normal-case tracking-normal text-[10px] hidden sm:inline truncate">
                  · {phase.hint}
                </span>
              </span>
              <span className="flex-shrink-0">CSS · GPU</span>
            </div>
          </div>
        ) : (
          // ── ERROR CARD ───────────────────────────────────────────────
          <div
            className="w-full max-w-md rounded-[1.75rem] border border-red-500/30 bg-black/55 px-6 py-5 backdrop-blur-xl"
            style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.6), 0 0 56px rgba(239,68,68,0.1) inset' }}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-300" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold tracking-[0.45em] text-red-300/90 uppercase">
                  Warmup Failed{error?.stage ? ` · ${error.stage}` : ''}
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  {error?.message ?? 'Could not finish preparing the game.'}
                </h2>
              </div>
            </div>

            {error?.detail && (
              <pre className="mt-3 rounded-lg border border-white/5 bg-white/[0.025] p-3 text-[11px] leading-relaxed text-gray-400/90 font-mono whitespace-pre-wrap max-h-32 overflow-auto">
                {error.detail}
              </pre>
            )}

            <p className="mt-3 text-[12px] leading-relaxed text-gray-300/80">
              {error?.recoverable
                ? 'You can continue with reduced visual fidelity, or reload the page to retry the full warmup.'
                : 'The game can\'t run on this device in its current state. Please reload — if the problem persists, try a different browser or update your GPU drivers.'}
            </p>

            <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
              {error?.recoverable && onContinueAnyway && (
                <button
                  onClick={onContinueAnyway}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold tracking-[0.12em] uppercase
                    bg-emerald-500/15 border border-emerald-400/40 text-emerald-200
                    hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all duration-200"
                >
                  <ArrowRightCircle className="w-4 h-4" strokeWidth={2.25} />
                  Continue Anyway
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold tracking-[0.12em] uppercase
                  bg-white/[0.04] border border-white/10 text-gray-300
                  hover:bg-white/[0.08] hover:border-white/20 hover:text-white transition-all duration-200"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={2.25} />
                Reload Page
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        /* Hero pine — gentle vertical breathing. Pure transform, GPU-only. */
        @keyframes sps-hero-breathe {
          0%, 100% { transform: translateY(0) scaleY(1);     }
          50%      { transform: translateY(-3px) scaleY(1.02); }
        }
        .sps-hero-pine {
          animation: sps-hero-breathe 4.2s ease-in-out infinite;
          will-change: transform;
        }

        /* Glow halo — fades in/out gently. */
        @keyframes sps-glow-pulse {
          0%, 100% { opacity: 0.75; }
          50%      { opacity: 1; }
        }
        .sps-hero-glow {
          animation: sps-glow-pulse 3.6s ease-in-out infinite;
          will-change: opacity;
        }

        /* Tiny twinkle stars on the canopy — small bright dots that pulse. */
        .sps-twinkle {
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: #d1fae5;
          box-shadow: 0 0 8px #34d399, 0 0 16px rgba(52,211,153,0.6);
          animation: sps-twinkle-pulse 1.9s ease-in-out infinite;
        }
        @keyframes sps-twinkle-pulse {
          0%, 100% { opacity: 0.25; transform: scale(0.7); }
          50%      { opacity: 1;    transform: scale(1.2); }
        }

        /* Falling leaves — drift down + slight horizontal sway. */
        @keyframes sps-leaf-fall {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
            opacity: 0;
          }
          10% { opacity: 0.7; }
          50% {
            transform: translate3d(var(--sps-drift, 12px), 50vh, 0) rotate(180deg);
            opacity: 0.7;
          }
          90% { opacity: 0.4; }
          100% {
            transform: translate3d(calc(var(--sps-drift, 12px) * -0.6), 100vh, 0) rotate(360deg);
            opacity: 0;
          }
        }
        .sps-falling-leaf {
          animation-name: sps-leaf-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
};

export default ShaderProcessingScreen;
