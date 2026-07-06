import { useEffect, useState } from 'react';
import { Skull, Flame, ShieldOff, Users, Crosshair, Zap, ArrowRight, Dices, type LucideIcon } from 'lucide-react';
import { generateStakeOptions, type RunModifier, type RunModifierCategory } from '../utils/RunModifierSystem';
import { detectIsTouch } from '../hooks/useDeviceInfo';

const IS_TOUCH = detectIsTouch();

interface RunModifierPickerProps {
  /** Initial trio rolled by App.tsx. The picker can re-roll locally. */
  options: RunModifier[];
  /** Player picked one (or chose to skip). */
  onChoose: (modifier: RunModifier | null) => void;
  onBack: () => void;
}

const ICON_FOR: Record<RunModifierCategory, LucideIcon> = {
  offense: Flame,
  fragility: ShieldOff,
  horde: Users,
  scarcity: Zap,
  precision: Crosshair,
  chaos: Skull,
};

// Per-archetype accent palette — each card reads as visually distinct, not a
// uniform rose grid. [border, glow rgba, chip bg, icon/text tint].
const ACCENT_FOR: Record<RunModifierCategory, {
  ring: string; glow: string; chip: string; text: string; soft: string;
}> = {
  offense:   { ring: '#fb923c', glow: 'rgba(251,146,60,0.45)',  chip: 'rgba(251,146,60,0.14)',  text: '#fed7aa', soft: 'rgba(251,146,60,0.07)' },
  fragility: { ring: '#f472b6', glow: 'rgba(244,114,182,0.45)', chip: 'rgba(244,114,182,0.14)', text: '#fbcfe8', soft: 'rgba(244,114,182,0.07)' },
  horde:     { ring: '#a78bfa', glow: 'rgba(167,139,250,0.45)', chip: 'rgba(167,139,250,0.14)', text: '#ddd6fe', soft: 'rgba(167,139,250,0.07)' },
  scarcity:  { ring: '#fbbf24', glow: 'rgba(251,191,36,0.45)',  chip: 'rgba(251,191,36,0.14)',  text: '#fde68a', soft: 'rgba(251,191,36,0.07)' },
  precision: { ring: '#22d3ee', glow: 'rgba(34,211,238,0.45)',  chip: 'rgba(34,211,238,0.14)',  text: '#a5f3fc', soft: 'rgba(34,211,238,0.07)' },
  chaos:     { ring: '#f43f5e', glow: 'rgba(244,63,94,0.5)',    chip: 'rgba(244,63,94,0.14)',   text: '#fda4af', soft: 'rgba(244,63,94,0.07)' },
};

const RunModifierPicker = ({ options: initialOptions, onChoose, onBack }: RunModifierPickerProps) => {
  // Local copy so the player can re-roll the trio without leaving the screen —
  // sells the "randomized stakes" fantasy. Seeded fresh from App on mount.
  const [options, setOptions] = useState<RunModifier[]>(initialOptions);
  // 0/1/2 = mutator cards. -1 = "Play without" (skip).
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [rerollSpin, setRerollSpin] = useState(false);

  const reroll = () => {
    setOptions(generateStakeOptions());
    setFocusedIdx(0);
    setRerollSpin(true);
    window.setTimeout(() => setRerollSpin(false), 420);
  };

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
      if (k === 'r' || k === 'R') { e.preventDefault(); e.stopPropagation(); reroll(); return; }
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
    <div className="fixed inset-0 z-[90] flex overflow-y-auto px-4 py-8">
      {/* The shared dark gradient chrome lives at App level (static, outside
          the menu transition). Only this screen's rose identity tint renders
          here — subtle enough that the slide doesn't read as a moving sheet. */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 55% 45% at center, rgba(248,113,113,0.20) 0%, transparent 62%)' }}
      />
      {/* m-auto: centred when it fits, scrolls from the top on short landscape
          phones instead of clipping the header (flex-centred overflow bug). */}
      <div className="relative z-20 m-auto w-full max-w-3xl">
        {/* Header */}
        <div className="mb-7 text-center">
          <p className="font-hud text-[10px] font-bold uppercase tracking-[0.5em] text-rose-300/85">
            Randomized Stakes · roll the dice
          </p>
          <h2 className="font-display mt-2 text-4xl font-semibold uppercase tracking-wide text-white sm:text-5xl"
            style={{ filter: 'drop-shadow(0 4px 20px rgba(244,63,94,0.3))' }}>
            Raise the Stakes
          </h2>
          <p className="mt-2 text-[13px] text-gray-400">
            Three freshly-rolled mutators — each warps the run a different way and pays out a higher score multiplier.
          </p>
        </div>

        {/* Three modifier cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {options.map((mod, idx) => {
            const Icon = ICON_FOR[mod.category] ?? Skull;
            const accent = ACCENT_FOR[mod.category];
            const isFocused = idx === focusedIdx;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onChoose(mod)}
                onMouseEnter={() => setFocusedIdx(idx)}
                className="group relative flex flex-col gap-3 rounded-2xl border p-5 text-left backdrop-blur-md transition-all"
                style={{
                  borderColor: isFocused ? accent.ring : `${accent.ring}55`,
                  background: isFocused ? accent.chip : accent.soft,
                  transform: isFocused ? 'scale(1.03)' : undefined,
                  boxShadow: isFocused ? `0 0 34px ${accent.glow}` : undefined,
                }}
              >
                <kbd
                  className="font-hud absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg border bg-[#080d0b] text-[12px] font-black tabular-nums shadow-lg"
                  style={{ borderColor: isFocused ? accent.ring : `${accent.ring}66`, color: accent.text }}
                >
                  {idx + 1}
                </kbd>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${accent.ring}66`, background: accent.chip }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.25} style={{ color: accent.text }} />
                  </span>
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] font-black tabular-nums"
                    style={{ borderColor: `${accent.ring}66`, background: accent.chip, color: accent.text }}
                  >
                    ×{mod.scoreMult.toFixed(2)} score
                  </span>
                </div>
                <div>
                  <p className="font-display text-lg font-semibold uppercase tracking-wide text-white">{mod.name}</p>
                  <p className="mt-1 text-[12px] leading-snug text-gray-400">{mod.blurb}</p>
                </div>
                {/* Effect breakdown chips — the concrete stat tweaks. */}
                <div className="flex flex-wrap gap-1.5">
                  {mod.effects.map((eff) => (
                    <span
                      key={eff}
                      className="rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-gray-200"
                      style={{ borderColor: `${accent.ring}40`, background: 'rgba(255,255,255,0.04)' }}
                    >
                      {eff}
                    </span>
                  ))}
                </div>
                <span
                  className="font-hud mt-auto text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: isFocused ? accent.text : `${accent.text}aa` }}
                >
                  {isFocused ? 'Press Enter' : 'Apply'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action row — re-roll / skip / back */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              onMouseEnter={() => setFocusedIdx(-2)}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 font-hud text-[12px] font-bold uppercase tracking-[0.15em] text-gray-300 transition-all hover:bg-white/[0.08] hover:text-white"
            >
              ← Back
              <kbd className="ml-1 rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-400">Esc</kbd>
            </button>
            <button
              type="button"
              onClick={reroll}
              className="flex items-center gap-2 rounded-xl border border-violet-400/35 bg-violet-500/[0.08] px-4 py-2.5 font-hud text-[12px] font-bold uppercase tracking-[0.15em] text-violet-200 transition-all hover:bg-violet-500/15 hover:text-white"
            >
              <Dices className={`h-4 w-4 ${rerollSpin ? 'animate-spin' : ''}`} strokeWidth={2.25} />
              Re-roll
              <kbd className="ml-1 rounded border border-violet-400/40 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-bold text-violet-100">R</kbd>
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChoose(null)}
            onMouseEnter={() => setFocusedIdx(-1)}
            className={`font-hud flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] transition-all ${
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
        <div className={`mt-5 flex flex-wrap items-center justify-center gap-4 text-[11px] text-gray-500 ${IS_TOUCH ? 'hidden' : ''}`}>
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
            <kbd className="rounded border border-violet-400/40 bg-violet-500/[0.10] px-1.5 py-0.5 text-[10px] font-bold text-violet-200">R</kbd>
            <span className="text-violet-300">re-roll</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">S</kbd>
            <span>skip</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default RunModifierPicker;
