import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ArrowRightCircle, Crosshair, Check, Loader2 } from 'lucide-react';

/**
 * Loader phases shown in the status checklist. They roughly map to the staged
 * warmup pipeline in App.tsx so the user gets meaningful feedback about
 * what's happening while shaders compile. The active phase is derived from the
 * progress value (monotonic — it never resets), so the checklist fills steadily
 * from top to bottom as warmup advances.
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

const ShaderProcessingScreen = ({ visible, error, onContinueAnyway }: ShaderProcessingScreenProps) => {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!visible) {
      setProgress(0);
      progressRef.current = 0;
      return;
    }
    if (error) return; // freeze on error

    setProgress(0);
    progressRef.current = 0;

    const startedAt = performance.now();
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
      window.cancelAnimationFrame(raf);
    };
  }, [visible, error]);

  if (!visible) return null;

  const isError = !!error;
  const accent = isError ? '#f87171' : '#34d399';
  const accentSoft = isError ? 'rgba(248,113,113,0.32)' : 'rgba(52,211,153,0.34)';
  const accentFaint = isError ? 'rgba(248,113,113,0.10)' : 'rgba(34,211,238,0.10)';
  const progressValue = Math.min(99, Math.round(progress));
  // Active phase derived from progress so the checklist fills monotonically.
  const activePhase = progress >= 75 ? 3 : progress >= 50 ? 2 : progress >= 25 ? 1 : 0;

  // Circular progress ring geometry.
  const R = 62;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - Math.min(100, progress) / 100);

  // ── ERROR STATE — compact card ─────────────────────────────────────────────
  if (isError) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#05080a] px-4">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 55% 45% at center, ${accentSoft} 0%, transparent 60%)` }}
        />
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl border border-red-500/25 bg-black/60 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-red-400/70 to-transparent" />
          <div className="px-7 py-7">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/15">
                <AlertTriangle className="h-5 w-5 text-red-300" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-red-300/90">
                  Warmup Failed{error?.stage ? ` · ${error.stage}` : ''}
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                  {error?.message ?? 'Could not finish preparing the game.'}
                </h2>
              </div>
            </div>
            {error?.detail && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-xl border border-white/5 bg-white/[0.025] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-400/90">
                {error.detail}
              </pre>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-gray-300/80">
              {error?.recoverable
                ? 'You can continue with reduced visual fidelity, or reload to retry the full warmup.'
                : "The game can't run on this device right now. Please reload — if it persists, try another browser or update your GPU drivers."}
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              {error?.recoverable && onContinueAnyway && (
                <button
                  onClick={onContinueAnyway}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-emerald-200 transition-all hover:bg-emerald-500/25"
                >
                  <ArrowRightCircle className="h-4 w-4" strokeWidth={2.25} /> Continue Anyway
                </button>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={2.25} /> Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING STATE — centred ring + aligned phase checklist ──────────────────
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[#05080a]">
      {/* Soft brand glow */}
      <div
        className="absolute inset-0 sps-glow"
        style={{ background: `radial-gradient(ellipse 50% 42% at center, ${accentSoft} 0%, ${accentFaint} 38%, transparent 70%)` }}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center px-6 text-center">
        {/* Brand wordmark — game title (biome-neutral), abstract emerald mark */}
        <div className="mb-8 flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-sm bg-emerald-400/60 sps-glow" />
            <span className="relative inline-flex h-2.5 w-2.5 rotate-45 rounded-sm bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          </span>
          <span className="text-[12px] font-bold uppercase tracking-[0.5em] text-gray-300/90">
            Forest <span className="text-emerald-300">Survival</span>
          </span>
        </div>

        {/* Progress ring */}
        <div className="relative" style={{ width: 168, height: 168 }}>
          <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
            <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
            <circle
              cx="80" cy="80" r={R} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 140ms linear', filter: `drop-shadow(0 0 6px ${accentSoft})` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Crosshair className="sps-reticle mb-1.5 h-6 w-6" style={{ color: accent }} strokeWidth={1.75} />
            <div className="flex items-baseline">
              <span className="text-4xl font-black leading-none tabular-nums tracking-tight text-white">{progressValue}</span>
              <span className="ml-0.5 text-base font-bold text-gray-500">%</span>
            </div>
          </div>
        </div>

        {/* Copy */}
        <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.45em] text-emerald-300/80">Shader Warmup</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Preparing the battlefield</h2>

        {/* Slim bar */}
        <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, progress)}%`,
              background: 'linear-gradient(90deg, #15803d, #34d399 60%, #22d3ee)',
              boxShadow: '0 0 12px rgba(52,211,153,0.5)',
              transition: 'width 140ms linear',
            }}
          />
        </div>

        {/* Phase checklist — fills top-to-bottom as warmup advances */}
        <ul className="mt-6 w-full space-y-1.5 text-left">
          {PHASES.map((phase, index) => {
            const state = index < activePhase ? 'done' : index === activePhase ? 'active' : 'pending';
            return (
              <li
                key={phase.label}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-300 ${
                  state === 'active'
                    ? 'border-emerald-400/25 bg-emerald-500/[0.06]'
                    : 'border-transparent bg-transparent'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {state === 'done' ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20">
                      <Check className="h-3 w-3 text-emerald-300" strokeWidth={3} />
                    </span>
                  ) : state === 'active' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-300" strokeWidth={2.5} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-[12px] font-semibold leading-tight transition-colors duration-300 ${
                      state === 'pending' ? 'text-gray-600' : 'text-gray-200'
                    }`}
                  >
                    {phase.label}
                  </span>
                  <span className="block truncate text-[10px] leading-tight text-gray-600">{phase.hint}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <style>{`
        @keyframes sps-glow-pulse { 0%,100% { opacity: 0.75; } 50% { opacity: 1; } }
        .sps-glow { animation: sps-glow-pulse 3.6s ease-in-out infinite; will-change: opacity; }
        @keyframes sps-reticle-pulse { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.08); opacity: 1; } }
        .sps-reticle { animation: sps-reticle-pulse 2.4s ease-in-out infinite; will-change: transform, opacity; }
      `}</style>
    </div>
  );
};

export default ShaderProcessingScreen;
