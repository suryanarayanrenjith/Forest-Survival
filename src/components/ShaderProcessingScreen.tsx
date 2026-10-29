import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, ArrowRightCircle, Crosshair, Check, Loader2, Lightbulb } from 'lucide-react';
import { detectIsTouch } from '../hooks/useDeviceInfo';

// Touch devices run in (short) landscape, where the tall vertical loader layout
// overflowed and the phase checklist overlapped. Compact mode lays the ring and
// checklist out horizontally so everything fits a phone's landscape height.
const IS_TOUCH = detectIsTouch();

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

/** Field tips rotated on the desktop loader. Keep every line TRUE to the
 *  shipped game (default key bindings, real mechanics) — no aspirational copy. */
const TIPS = [
  'Headshots deal double damage — aim for the robots\u2019 heads.',
  'Shoot an explosive barrel to wipe out a cluster of robots. Keep your distance.',
  'Looted powers are held until you need them — press E to trigger one.',
  'Sprinting drains stamina. Let it refill before you need to break away.',
  'Press M to open the tactical radar.',
  'New weapons unlock as your score climbs — switch with the number keys or the mouse wheel.',
  'Clearing a wave earns a mystery box perk.',
  'Robots too close? Press V for a melee strike.',
  'Wading through bushes slows you down — mind your footing when retreating.',
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
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  // Rotate the field tip while the loader is up (desktop layout only renders it).
  useEffect(() => {
    if (!visible || error) return;
    const id = window.setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4800);
    return () => window.clearInterval(id);
  }, [visible, error]);

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

  // ── ERROR STATE — compact card ─────────────────────────────────────────────
  if (isError) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#05080a] px-4">
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 55% 45% at center, ${accentSoft} 0%, transparent 60%)` }}
        />
        <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-2xl border border-red-500/25 bg-[#0c0807] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
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
                <h2 className="font-display mt-1 text-2xl font-semibold uppercase tracking-wide text-white">
                  {error?.message ?? 'Could not finish preparing the game.'}
                </h2>
              </div>
            </div>
            {error?.detail && (
              <pre className="mt-4 max-h-32 overflow-auto rounded-xl border border-white/5 bg-white/[0.025] p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/55">
                {error.detail}
              </pre>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-white/60">
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
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-white/75 transition-all hover:bg-white/[0.08] hover:text-white"
              >
                <RefreshCw className="h-4 w-4" strokeWidth={2.25} /> Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── LOADING STATE (COMPACT / TOUCH) — horizontal ring + checklist ───────────
  // Fits a phone's short landscape height; the full vertical layout below
  // overflowed and the steps overlapped.
  if (IS_TOUCH) {
    const Rc = 40;
    const CIRCc = 2 * Math.PI * Rc;
    const dashOffsetC = CIRCc * (1 - Math.min(100, progress) / 100);
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[#05080a] px-5">
        <div
          className="absolute inset-0 sps-glow"
          style={{ background: `radial-gradient(ellipse 60% 60% at center, ${accentSoft} 0%, ${accentFaint} 40%, transparent 72%)` }}
        />
        <div className="relative flex w-full max-w-md items-center gap-5">
          {/* Compact ring */}
          <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
            <svg viewBox="0 0 104 104" className="h-full w-full -rotate-90">
              <circle cx="52" cy="52" r={Rc} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
              <circle
                cx="52" cy="52" r={Rc} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
                strokeDasharray={CIRCc} strokeDashoffset={dashOffsetC}
                style={{ transition: 'stroke-dashoffset 140ms linear', filter: `drop-shadow(0 0 5px ${accentSoft})` }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Crosshair className="sps-reticle mb-0.5 h-4 w-4" style={{ color: accent }} strokeWidth={1.75} />
              <div className="flex items-baseline">
                <span className="text-2xl font-black leading-none tabular-nums tracking-tight text-white">{progressValue}</span>
                <span className="ml-0.5 text-xs font-bold text-white/45">%</span>
              </div>
            </div>
          </div>

          {/* Right column — wordmark, title, bar, condensed checklist */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-sm bg-emerald-400/60 sps-glow" />
                <span className="relative inline-flex h-2 w-2 rotate-45 rounded-sm bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-white/70">
                Forest <span className="text-emerald-300">Survival</span>
              </span>
            </div>
            <h2 className="font-display mt-1 text-lg font-semibold uppercase leading-tight tracking-wide text-white">Preparing the battlefield</h2>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, progress)}%`,
                  background: 'linear-gradient(90deg, #15803d, #34d399 60%, #22d3ee)',
                  boxShadow: '0 0 10px rgba(52,211,153,0.5)',
                  transition: 'width 140ms linear',
                }}
              />
            </div>
            {/* Condensed checklist — 2×2 grid, icon + label, no hints. */}
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
              {PHASES.map((phase, index) => {
                const state = index < activePhase ? 'done' : index === activePhase ? 'active' : 'pending';
                return (
                  <div key={phase.label} className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {state === 'done' ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20">
                          <Check className="h-2.5 w-2.5 text-emerald-300" strokeWidth={3} />
                        </span>
                      ) : state === 'active' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" strokeWidth={2.5} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
                      )}
                    </span>
                    <span className={`truncate text-[10px] font-semibold leading-tight ${state === 'pending' ? 'text-white/35' : 'text-white/85'}`}>
                      {phase.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes sps-glow-pulse { 0%,100% { opacity: 0.75; } 50% { opacity: 1; } }
          .sps-glow { animation: sps-glow-pulse 3.6s ease-in-out infinite; will-change: opacity; }
          @keyframes sps-reticle-pulse { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.08); opacity: 1; } }
          .sps-reticle { animation: sps-reticle-pulse 2.4s ease-in-out infinite; will-change: transform, opacity; }
        `}</style>
      </div>
    );
  }

  // ── LOADING STATE — cinematic key-art loading screen ────────────────────────
  return (
    <div className="fixed inset-0 z-[90] overflow-hidden bg-[#030605] select-none">
      {/* Key art: softly blurred, darkened, slowly drifting (compositor-only
          transform animation, so it stays smooth while warmup hogs the main
          thread). Cropped low toward the robots; the grade hides the rest. */}
      <div
        className="sps-kenburns absolute -inset-[5%]"
        style={{
          backgroundImage: 'url(/og-image.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 78%',
          filter: 'blur(4px) saturate(0.85) brightness(0.5)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(3,6,5,0.96) 0%, rgba(3,6,5,0.7) 26%, rgba(3,6,5,0.42) 52%, rgba(3,6,5,0.9) 82%, rgba(3,6,5,0.98) 100%)' }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 95% at 50% 42%, transparent 38%, rgba(0,0,0,0.62) 100%)' }} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 3px)' }}
      />

      {/* Top bar — brand + live status */}
      <div className="absolute inset-x-10 top-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative inline-flex h-2.5 w-2.5 rotate-45 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
          <span className="font-hud text-[11px] font-bold uppercase tracking-[0.5em] text-white/80">
            Forest <span className="text-emerald-300">Survival</span>
          </span>
        </div>
        <div className="font-hud flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-300/80">
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
          Shader Warmup
        </div>
      </div>

      {/* Bottom block */}
      <div className="absolute inset-x-10 bottom-9">
        <div className="flex items-end justify-between gap-10">
          <div className="min-w-0 max-w-2xl">
            <p className="font-hud flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.45em] text-emerald-300/85">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-emerald-300/80" />
              Deploying
            </p>
            <h2 className="font-display mt-2 text-[clamp(2.2rem,4.4vw,3.8rem)] font-semibold uppercase leading-[0.95] tracking-wide text-white">
              Preparing the battlefield
            </h2>
            <div key={tipIndex} className="sps-tip mt-4 flex max-w-xl items-start gap-3">
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300/90" strokeWidth={2} />
              <p className="font-hud text-[13px] leading-relaxed text-white/70">
                <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300/90">Tip</span>
                {TIPS[tipIndex]}
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="hud-num text-[72px] text-white" style={{ textShadow: '0 0 30px rgba(46,232,180,0.25)' }}>
              {progressValue}
              <span className="ml-1 text-[26px] text-white/45">%</span>
            </div>
            <p className="hud-label mt-2" style={{ color: 'rgba(46,232,180,0.85)' }}>{PHASES[activePhase].label}</p>
          </div>
        </div>

        {/* Slim full-width progress bar with a hot leading edge */}
        <div className="relative mt-6 h-[3px] w-full overflow-hidden bg-white/[0.09]">
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${Math.min(100, progress)}%`,
              background: 'linear-gradient(90deg, rgba(21,128,61,0.9), #2ee8b4 70%, #b8fff0)',
              boxShadow: '0 0 14px rgba(46,232,180,0.65)',
              transition: 'width 140ms linear',
            }}
          />
        </div>

        {/* Phase steps */}
        <ul className="mt-3.5 grid grid-cols-4 gap-6">
          {PHASES.map((phase, index) => {
            const state = index < activePhase ? 'done' : index === activePhase ? 'active' : 'pending';
            return (
              <li key={phase.label} className="flex min-w-0 items-start gap-2.5">
                <span className="mt-[1px] flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {state === 'done' ? (
                    <Check className="h-3.5 w-3.5 text-emerald-300" strokeWidth={3} />
                  ) : state === 'active' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" strokeWidth={2.5} />
                  ) : (
                    <span className="h-1.5 w-1.5 bg-white/20" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`font-hud block truncate text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors duration-300 ${state === 'pending' ? 'text-white/30' : 'text-white/85'}`}>
                    {phase.label}
                  </span>
                  <span className="font-hud block truncate text-[10px] text-white/35">{phase.hint}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <style>{`
        @keyframes sps-kenburns { 0% { transform: scale(1.04) translate3d(0, 0, 0); } 100% { transform: scale(1.12) translate3d(-1.5%, -1%, 0); } }
        .sps-kenburns { animation: sps-kenburns 22s ease-out forwards; will-change: transform; }
        @keyframes sps-tip-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .sps-tip { animation: sps-tip-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
    </div>
  );
};

export default ShaderProcessingScreen;
