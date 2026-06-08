import { useEffect, useState } from 'react';
import { Skull, Flame, ShieldOff, Users, Crosshair, Zap, ArrowRight, type LucideIcon } from 'lucide-react';
import { RUN_MODIFIERS, type RunModifierId } from '../utils/RunModifierSystem';
import { detectIsTouch } from '../hooks/useDeviceInfo';

const IS_TOUCH = detectIsTouch();

interface RunModifierPickerProps {
  /** Three modifier ids rolled for today by App.tsx. */
  options: RunModifierId[];
  /** Player picked one (or chose to skip). */
  onChoose: (id: RunModifierId | null) => void;
  onBack: () => void;
}

const ICON_FOR: Record<RunModifierId, LucideIcon> = {
  headshots_only: Crosshair,
  berserker: Flame,
  glass_cannon: ShieldOff,
  swarm_mode: Users,
  one_in_the_chamber: Zap,
  bullet_hell: Skull,
};

const RunModifierPicker = ({ options, onChoose, onBack }: RunModifierPickerProps) => {
  // 0/1/2 = mutator cards. -1 = "Play without" (skip).
  const [focusedIdx, setFocusedIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const code = e.code;
      // Number keys ONLY highlight a mutator card. Enter / Space confirms.
      // Two-step input — mutators reshape the whole run, so a wrong pick is
      // costly; this prevents accidental locks-in.
      if (code === 'Digit1' || k === '1') { e.preventDefault(); e.stopPropagation(); setFocusedIdx(0); return; }
      if (code === 'Digit2' || k === '2') { e.preventDefault(); e.stopPropagation(); setFocusedIdx(1); return; }
      if (code === 'Digit3' || k === '3') { e.preventDefault(); e.stopPropagation(); setFocusedIdx(2); return; }
      if (code === 'Digit0' || k === '0' || k === 's' || k === 'S') {
        e.preventDefault(); e.stopPropagation(); setFocusedIdx(-1); return;
      }
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); onBack(); return; }
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        e.preventDefault(); e.stopPropagation();
        setFocusedIdx((i) => {
          const order = [-1, 0, 1, 2];
          const at = order.indexOf(i);
          return order[(at + order.length - 1) % order.length];
        });
        return;
      }
      if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        e.preventDefault(); e.stopPropagation();
        setFocusedIdx((i) => {
          const order = [-1, 0, 1, 2];
          const at = order.indexOf(i);
          return order[(at + 1) % order.length];
        });
        return;
      }
      if (k === 'Enter' || k === ' ') {
        e.preventDefault(); e.stopPropagation();
        if (focusedIdx === -1) onChoose(null);
        else onChoose(options[focusedIdx]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [options, focusedIdx, onChoose, onBack]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#05080a] px-4 py-8">
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 45% at center, rgba(248,113,113,0.28) 0%, transparent 65%)' }}
      />
      <div className="relative w-full max-w-3xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-rose-300/85">
            Daily Mutator · {new Date().toISOString().slice(0, 10)}
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Raise the stakes
          </h2>
          <p className="mt-2 text-[13px] text-gray-400">
            A risk for a reward. Each card mutates the whole run — and pays out a higher score multiplier.
          </p>
        </div>

        {/* Three modifier cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {options.map((id, idx) => {
            const mod = RUN_MODIFIERS[id];
            const Icon = ICON_FOR[id] ?? Skull;
            const isFocused = idx === focusedIdx;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChoose(id)}
                onMouseEnter={() => setFocusedIdx(idx)}
                className={`group relative flex flex-col gap-3 rounded-2xl border bg-rose-500/[0.07] p-5 text-left backdrop-blur-md transition-all ${
                  isFocused
                    ? 'border-rose-300 scale-[1.03]'
                    : 'border-rose-400/30 hover:border-rose-300/55 hover:bg-rose-500/[0.13] hover:scale-[1.02]'
                }`}
                style={isFocused ? { boxShadow: '0 0 32px rgba(248,113,113,0.45)' } : undefined}
              >
                <kbd
                  className={`absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg border bg-[#0b0f15] text-[12px] font-black tabular-nums text-rose-200 shadow-lg ${
                    isFocused ? 'border-rose-300' : 'border-rose-400/40'
                  }`}
                >
                  {idx + 1}
                </kbd>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-rose-400/40 bg-rose-500/15">
                    <Icon className="h-5 w-5 text-rose-200" strokeWidth={2.25} />
                  </span>
                  <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold tabular-nums text-rose-200">
                    ×{mod.scoreMult.toFixed(2)} score
                  </span>
                </div>
                <div>
                  <p className="text-lg font-black tracking-tight text-white">{mod.name}</p>
                  <p className="mt-1 text-[12px] leading-snug text-gray-400">{mod.blurb}</p>
                </div>
                <span
                  className={`mt-auto text-[10px] font-bold uppercase tracking-[0.2em] ${
                    isFocused ? 'text-rose-200' : 'text-rose-300/80'
                  }`}
                >
                  {isFocused ? 'Press Enter' : 'Apply'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Bottom row — skip / back */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            onMouseEnter={() => setFocusedIdx(-2)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white"
          >
            ← Back
            <kbd className="ml-1 rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-400">Esc</kbd>
          </button>
          <button
            type="button"
            onClick={() => onChoose(null)}
            onMouseEnter={() => setFocusedIdx(-1)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] transition-all ${
              focusedIdx === -1
                ? 'border-emerald-300 bg-emerald-500/20 text-emerald-100'
                : 'border-emerald-400/35 bg-emerald-500/[0.08] text-emerald-200 hover:bg-emerald-500/15'
            }`}
          >
            Play without · 1.00× <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
            <kbd className="rounded border border-emerald-400/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">S</kbd>
          </button>
        </div>

        {/* Keyboard legend — number highlights, Enter confirms. Desktop only;
            on touch the cards/buttons are tapped directly. */}
        <div className={`mt-5 flex items-center justify-center gap-4 text-[11px] text-gray-500 ${IS_TOUCH ? 'hidden' : ''}`}>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">1</kbd>
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">2</kbd>
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">3</kbd>
            <span className="ml-1">highlight</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-emerald-400/40 bg-emerald-500/[0.10] px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">Enter</kbd>
            <span className="text-emerald-300">confirm</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">S</kbd>
            <span>skip</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">Esc</kbd>
            <span>back</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default RunModifierPicker;
