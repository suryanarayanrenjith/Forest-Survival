import { useEffect, useMemo, useState } from 'react';
import { Camera, X, RotateCcw, Sparkles, Check, Loader2, ImageOff, MousePointer2 } from 'lucide-react';

interface PhotoModeProps {
  /** How many photos the player has already saved. */
  photoCount: number;
  /** Hard cap (mirrors the Convex limit). */
  maxPhotos: number;
  /** Reports the live CSS filter string so the parent can apply it to the canvas. */
  onFilterChange: (css: string) => void;
  /** Captures + uploads the current frame. Resolves with a result to show. */
  onCapture: () => Promise<{ ok: boolean; message: string }>;
  /** Leaves photo mode (returns to the pause menu). */
  onExit: () => void;
}

interface FilterPreset {
  id: string;
  label: string;
  /** Extra filter primitives appended after the slider-driven ones. */
  fragment: string;
}

// Presets layer on top of the manual Brightness/Contrast/Saturation sliders.
const PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Original', fragment: '' },
  { id: 'vivid', label: 'Vivid', fragment: 'saturate(1.35) contrast(1.08)' },
  { id: 'noir', label: 'Noir', fragment: 'grayscale(1) contrast(1.22) brightness(1.05)' },
  { id: 'sepia', label: 'Sepia', fragment: 'sepia(0.65) contrast(1.05) brightness(1.02)' },
  { id: 'cool', label: 'Cool', fragment: 'hue-rotate(-12deg) saturate(1.12) brightness(1.03)' },
  { id: 'warm', label: 'Warm', fragment: 'sepia(0.25) saturate(1.2) brightness(1.04)' },
  { id: 'dramatic', label: 'Dramatic', fragment: 'contrast(1.32) brightness(0.92) saturate(1.1)' },
  { id: 'faded', label: 'Faded', fragment: 'contrast(0.85) brightness(1.08) saturate(0.85) sepia(0.12)' },
];

const DEFAULTS = { brightness: 1, contrast: 1, saturation: 1, preset: 'none' };

const Slider = ({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between">
      <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">{label}</span>
      <span className="font-hud text-[11px] font-bold tabular-nums text-emerald-300">{Math.round(value * 100)}%</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="pm-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10"
    />
  </div>
);

const PhotoMode = ({ photoCount, maxPhotos, onFilterChange, onCapture, onExit }: PhotoModeProps) => {
  const [brightness, setBrightness] = useState(DEFAULTS.brightness);
  const [contrast, setContrast] = useState(DEFAULTS.contrast);
  const [saturation, setSaturation] = useState(DEFAULTS.saturation);
  const [preset, setPreset] = useState(DEFAULTS.preset);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [statusMsg, setStatusMsg] = useState('');

  const filterCss = useMemo(() => {
    const base = `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`;
    const frag = PRESETS.find((p) => p.id === preset)?.fragment ?? '';
    return frag ? `${base} ${frag}` : base;
  }, [brightness, contrast, saturation, preset]);

  useEffect(() => { onFilterChange(filterCss); }, [filterCss, onFilterChange]);

  const full = photoCount >= maxPhotos;
  const remaining = Math.max(0, maxPhotos - photoCount);

  const reset = () => {
    setBrightness(DEFAULTS.brightness);
    setContrast(DEFAULTS.contrast);
    setSaturation(DEFAULTS.saturation);
    setPreset(DEFAULTS.preset);
  };

  const capture = async () => {
    if (status === 'busy' || full) return;
    setStatus('busy');
    setStatusMsg('Saving to cloud…');
    try {
      const res = await onCapture();
      setStatus(res.ok ? 'done' : 'error');
      setStatusMsg(res.message);
    } catch {
      setStatus('error');
      setStatusMsg('Something went wrong. Try again.');
    }
  };

  // Clear a transient success/error message after a moment.
  useEffect(() => {
    if (status === 'done' || status === 'error') {
      const id = window.setTimeout(() => setStatus('idle'), 3200);
      return () => window.clearTimeout(id);
    }
  }, [status]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[90] flex flex-col">
      {/* Top hint bar */}
      <div className="flex justify-center pt-5">
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-[12px] text-gray-300 backdrop-blur-md">
          <Camera className="h-4 w-4 text-emerald-300" strokeWidth={2.2} />
          <span className="font-hud font-bold tracking-[0.22em] text-white">PHOTO MODE</span>
          <span className="text-gray-500">·</span>
          <MousePointer2 className="h-3.5 w-3.5 text-gray-400" strokeWidth={2.2} />
          <span>Drag to look</span>
          <span className="text-gray-500">·</span>
          <span><kbd className="rounded bg-white/10 px-1 font-mono text-[10px] text-gray-200">WASD</kbd> move</span>
          <span className="text-gray-500">·</span>
          <span><kbd className="rounded bg-white/10 px-1 font-mono text-[10px] text-gray-200">Scroll</kbd> zoom</span>
          <span className="text-gray-500">·</span>
          <span><kbd className="rounded bg-white/10 px-1 font-mono text-[10px] text-gray-200">Space/Shift</kbd> height</span>
        </div>
      </div>

      <div className="flex-1" />

      {/* Bottom control dock */}
      <div className="flex justify-center px-3 pb-5">
        <div
          className="hud-frame pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-400/15 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          style={{
            background: 'linear-gradient(180deg, rgba(11,18,15,0.94), rgba(6,11,9,0.96))',
            animation: 'pmUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
          }}
        >
          {/* Emerald top accent */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />

          {/* Header row */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-300" strokeWidth={2.2} />
              <span className="font-display text-sm font-semibold uppercase tracking-wide text-white">Adjustments</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-gray-500 sm:inline">
                View captures in <span className="text-gray-300">Profile → Photos</span>
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                  full ? 'border-rose-400/40 bg-rose-500/10 text-rose-200' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                }`}
              >
                {full ? 'Gallery full' : `${remaining} of ${maxPhotos} left`}
              </span>
            </div>
          </div>

          {/* Filter presets */}
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPreset(p.id)}
                className={`font-hud flex-shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  preset === p.id
                    ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.07] hover:text-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Sliders */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Slider label="Brightness" value={brightness} min={0.6} max={1.4} step={0.01} onChange={setBrightness} />
            <Slider label="Contrast" value={contrast} min={0.6} max={1.4} step={0.01} onChange={setContrast} />
            <Slider label="Saturation" value={saturation} min={0} max={2} step={0.01} onChange={setSaturation} />
          </div>

          {/* Status line */}
          {status !== 'idle' && (
            <div
              className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] ${
                status === 'error'
                  ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                  : status === 'done'
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-white/10 bg-white/[0.04] text-gray-200'
              }`}
            >
              {status === 'busy' && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} />}
              {status === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
              {status === 'error' && <ImageOff className="h-3.5 w-3.5" strokeWidth={2.4} />}
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2.5">
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/[0.07]"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
              <span className="hidden sm:inline">Reset</span>
            </button>
            <button
              onClick={capture}
              disabled={full || status === 'busy'}
              className="font-hud group flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 10px 26px -12px rgba(46,232,180,0.8)' }}
            >
              {status === 'busy'
                ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                : <Camera className="h-4 w-4 transition-transform group-hover:scale-110" strokeWidth={2.4} />}
              {full ? 'Gallery Full' : status === 'busy' ? 'Capturing…' : 'Capture Photo'}
            </button>
            <button
              onClick={onExit}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:bg-red-500/[0.1] hover:text-red-200 hover:border-red-400/40"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
          {full && (
            <p className="mt-2 text-center text-[11px] text-gray-500">
              Delete a photo from your <span className="text-gray-300">Profile → Photos</span> to free a slot.
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pmUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .pm-slider::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 15px; height: 15px; border-radius: 9999px;
          background: #34d399; border: 2px solid #080d0b; cursor: pointer;
          box-shadow: 0 0 8px rgba(52,211,153,0.6);
        }
        .pm-slider::-moz-range-thumb {
          width: 15px; height: 15px; border-radius: 9999px;
          background: #34d399; border: 2px solid #080d0b; cursor: pointer;
          box-shadow: 0 0 8px rgba(52,211,153,0.6);
        }
      `}</style>
    </div>
  );
};

export default PhotoMode;
