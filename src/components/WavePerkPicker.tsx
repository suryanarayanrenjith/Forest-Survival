import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Zap, Crosshair, Heart, Footprints, Star, Bomb, Gift,
  HelpCircle, Skull, GraduationCap, type LucideIcon,
} from 'lucide-react';
import { WAVE_PERKS, type WavePerkId } from '../utils/WavePerkRegistry';
import { soundManager } from '../utils/SoundManager';

interface WavePerkPickerProps {
  /** Wave that was just cleared (shown in the header). */
  waveCleared: number;
  /**
   * Three "boxes". One contains a perk (the prize); the other two are
   * `null`. Player picks blind; correct guess unlocks the perk.
   */
  slots: (WavePerkId | null)[];
  /** Index of the slot that hides the prize. */
  prizeSlotIndex: number;
  /**
   * Called once the player has picked AND the reveal animation has played.
   * Argument is the perk id if they got it right, `null` otherwise.
   */
  onPick: (perk: WavePerkId | null) => void;
  /**
   * Skill-tree nudge. When `> 0` the picker shows a small chip telling the
   * player they have unspent SP they could be using. Hidden for guest play
   * (caller passes `0` / `undefined` when not signed in).
   */
  skillPointsAvailable?: number;
  /**
   * Soft auto-pick deadline. Multiplayer passes a value so the choice
   * resolves on its own (preventing a stalled MP wave). Solo passes
   * `undefined` (no timer — the player picks when they're ready).
   */
  autoPickAfterMs?: number;
}

/** Per-perk glyph — falls back to Sparkles for any we forgot to map. */
const ICON_FOR: Record<string, LucideIcon> = {
  fire_rate_15: Zap,
  fire_rate_30: Zap,
  damage_15: Crosshair,
  damage_30: Crosshair,
  regen_1hps: Heart,
  lifesteal_3: Heart,
  crit_chance_10: Crosshair,
  headshot_dmg_25: Crosshair,
  max_ammo_50: Sparkles,
  dash_cd_30: Footprints,
  max_hp_25: Heart,
  pickup_radius_2x: Star,
  explosive_bullets: Bomb,
  vampiric_kill: Heart,
  streak_keeper: Star,
};

const RARITY_STYLES: Record<'common' | 'rare' | 'epic', { border: string; bg: string; text: string; accent: string; glow: string; ring: string }> = {
  common: { border: 'border-white/15',      bg: 'bg-white/[0.04]',     text: 'text-gray-200',    accent: 'text-gray-300',    glow: 'rgba(255,255,255,0.10)', ring: 'border-white/55' },
  rare:   { border: 'border-cyan-400/40',   bg: 'bg-cyan-500/10',      text: 'text-cyan-100',    accent: 'text-cyan-300',    glow: 'rgba(34,211,238,0.35)', ring: 'border-cyan-300' },
  epic:   { border: 'border-purple-400/45', bg: 'bg-purple-500/12',    text: 'text-purple-100',  accent: 'text-purple-300',  glow: 'rgba(192,132,252,0.40)', ring: 'border-purple-300' },
};

const REVEAL_HOLD_MS = 2400;

const WavePerkPicker = ({
  waveCleared, slots, prizeSlotIndex, onPick, skillPointsAvailable, autoPickAfterMs,
}: WavePerkPickerProps) => {
  const [focusedIdx, setFocusedIdx] = useState(1);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  // Soft countdown for the optional auto-pick (multiplayer only).
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    autoPickAfterMs ? Math.ceil(autoPickAfterMs / 1000) : null,
  );

  // Stable refs for the values the reveal/countdown timers close over so
  // their useEffects don't re-arm on every parent re-render (App.tsx
  // re-renders ~16×/s as the HUD flushes; without these the 2.4s reveal
  // timer was being cleared and reset perpetually, soft-locking the
  // picker on the "BETTER LUCK" screen).
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  const focusedIdxRef = useRef(focusedIdx);
  useEffect(() => { focusedIdxRef.current = focusedIdx; }, [focusedIdx]);

  // Auto-pick countdown — MP only. Reads the live focused box via the ref
  // so changing focus doesn't restart the countdown.
  useEffect(() => {
    if (pickedIdx !== null || !autoPickAfterMs) return;
    const start = performance.now();
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, autoPickAfterMs - elapsed);
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        setPickedIdx(focusedIdxRef.current);
        window.clearInterval(tick);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [autoPickAfterMs, pickedIdx]);

  // Reveal hold — once the player picks (or auto-pick fires), show the
  // contents for a beat before handing back to the game. Also kicks off
  // the audio sting that matches the outcome.
  useEffect(() => {
    if (pickedIdx === null) return;
    const won = pickedIdx === prizeSlotIndex;
    // Box-open sting: short rising chime on win, a flat "uh oh" on miss.
    try {
      if (won) {
        soundManager.play('powerUp', 0.85, false, 1.35);
        window.setTimeout(() => soundManager.play('powerUp', 0.55, false, 1.6), 220);
      } else {
        soundManager.play('hit', 0.5, false, 0.55);
      }
    } catch { /* sound is best-effort */ }
    const t = window.setTimeout(() => {
      const winningPerk = won ? slots[prizeSlotIndex] : null;
      onPickRef.current(winningPerk ?? null);
    }, REVEAL_HOLD_MS);
    return () => window.clearTimeout(t);
  }, [pickedIdx, prizeSlotIndex, slots]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pickedIdx !== null) return; // already chose — ignore input
      const key = e.key;
      const code = e.code;
      const tick = () => { try { soundManager.play('weaponSwitch', 0.18, false, 1.2); } catch { /* best-effort */ } };
      if (code === 'Digit1' || key === '1') { e.preventDefault(); e.stopPropagation(); if (focusedIdx !== 0) tick(); setFocusedIdx(0); return; }
      if (code === 'Digit2' || key === '2') { e.preventDefault(); e.stopPropagation(); if (focusedIdx !== 1) tick(); setFocusedIdx(1); return; }
      if (code === 'Digit3' || key === '3') { e.preventDefault(); e.stopPropagation(); if (focusedIdx !== 2) tick(); setFocusedIdx(2); return; }
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        e.preventDefault(); e.stopPropagation();
        tick();
        setFocusedIdx((i) => (i + 2) % 3);
        return;
      }
      if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        e.preventDefault(); e.stopPropagation();
        tick();
        setFocusedIdx((i) => (i + 1) % 3);
        return;
      }
      if (key === 'Enter' || key === ' ') {
        e.preventDefault(); e.stopPropagation();
        setPickedIdx(focusedIdx);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focusedIdx, pickedIdx]);

  const revealed = pickedIdx !== null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center backdrop-blur-md"
      style={{ background: '#05080adb' }}
    >
      {/* Subtle vignette so the boxes pop without being overwhelming */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 55% 45% at center, rgba(52,211,153,0.10) 0%, transparent 65%)' }}
      />

      <div className="relative w-full max-w-3xl px-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-emerald-300/80">
            Wave {waveCleared} Cleared
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Mystery Box
          </h2>
          <p className="mt-1 text-[12px] text-gray-400">
            One box hides a perk. The other two are empty. Pick wisely.
          </p>
        </div>

        {/* Three boxes */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((idx) => {
            const isPicked = pickedIdx === idx;
            const isFocused = idx === focusedIdx;
            const slotPerk = slots[idx];

            if (revealed) {
              // Reveal phase — show what was inside every box.
              if (slotPerk) {
                const perk = WAVE_PERKS[slotPerk];
                const style = RARITY_STYLES[perk.rarity];
                const Icon = ICON_FOR[slotPerk] ?? Sparkles;
                return (
                  <div
                    key={idx}
                    className={`relative flex flex-col items-start gap-3 rounded-2xl border ${
                      isPicked ? style.ring : style.border
                    } ${style.bg} p-5 backdrop-blur-md transition-all duration-300 ${
                      isPicked ? 'scale-[1.04]' : 'scale-100'
                    }`}
                    style={{ boxShadow: `0 0 36px ${style.glow}`, animation: isPicked ? 'perkBoxPop 0.45s ease-out' : 'perkBoxReveal 0.4s ease-out' }}
                  >
                    {isPicked && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/60 bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">
                        You Picked!
                      </span>
                    )}
                    <div className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${style.border} ${style.bg}`}>
                        <Icon className={`h-5 w-5 ${style.accent}`} strokeWidth={2.25} />
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-[0.25em] ${style.accent}`}>
                        {perk.rarity}
                      </span>
                    </div>
                    <div>
                      <p className={`text-lg font-black tracking-tight ${style.text}`}>{perk.name}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-gray-400">{perk.blurb}</p>
                    </div>
                  </div>
                );
              }
              // Empty slot — neutral grey card.
              return (
                <div
                  key={idx}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/8 bg-black/35 p-8 backdrop-blur-md transition-all duration-300 ${
                    isPicked ? 'scale-[1.04] border-rose-400/35' : 'scale-100'
                  }`}
                  style={{ animation: isPicked ? 'perkBoxPop 0.45s ease-out' : 'perkBoxReveal 0.4s ease-out' }}
                >
                  {isPicked && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-rose-400/55 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-rose-100">
                      You Picked!
                    </span>
                  )}
                  <Skull className="h-7 w-7 text-gray-600" strokeWidth={2} />
                  <p className="text-[14px] font-black uppercase tracking-[0.25em] text-gray-500">Empty</p>
                </div>
              );
            }

            // Pre-reveal — closed mystery box.
            return (
              <button
                key={idx}
                type="button"
                onClick={() => { setFocusedIdx(idx); setPickedIdx(idx); }}
                onMouseEnter={() => setFocusedIdx(idx)}
                className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border bg-emerald-500/[0.05] p-8 backdrop-blur-md transition-all duration-150 ${
                  isFocused ? 'border-emerald-300 scale-[1.04]' : 'border-emerald-400/30 hover:border-emerald-300/55 hover:scale-[1.02]'
                }`}
                style={isFocused ? { boxShadow: '0 0 32px rgba(52,211,153,0.40)' } : undefined}
              >
                <kbd
                  className={`absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-lg border bg-[#0b0f15] text-[12px] font-black tabular-nums shadow-lg ${
                    isFocused ? 'border-emerald-300 text-emerald-200' : 'border-emerald-400/35 text-emerald-300/85'
                  }`}
                >
                  {idx + 1}
                </kbd>
                <Gift
                  className={`h-12 w-12 transition-transform duration-200 ${isFocused ? 'text-emerald-200' : 'text-emerald-400/70 group-hover:text-emerald-300/95'}`}
                  strokeWidth={1.5}
                />
                <HelpCircle
                  className={`absolute right-3 bottom-3 h-4 w-4 ${isFocused ? 'text-emerald-200/80' : 'text-emerald-400/60'}`}
                  strokeWidth={2.25}
                />
                <p className={`mt-1 text-[14px] font-black uppercase tracking-[0.25em] ${
                  isFocused ? 'text-emerald-200' : 'text-emerald-300/80'
                }`}>
                  Box {idx + 1}
                </p>
                {isFocused && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/85">
                    Press Enter to Open
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Outcome line — appears only after reveal. On a miss we also show
            the consolation prize (mastery XP) so the player knows the
            gamble wasn't fully empty. The actual XP is granted by the
            resolver in App.tsx. */}
        {revealed && (
          <div
            className="mt-6 text-center"
            style={{ animation: 'perkBoxReveal 0.5s ease-out 0.4s both' }}
          >
            <p
              className={`text-sm font-bold uppercase tracking-[0.3em] ${
                pickedIdx === prizeSlotIndex ? 'text-emerald-200' : 'text-rose-300/85'
              }`}
            >
              {pickedIdx === prizeSlotIndex
                ? `Perk Unlocked · ${WAVE_PERKS[slots[prizeSlotIndex]!].name}`
                : 'Better Luck Next Wave'}
            </p>
            {pickedIdx !== prizeSlotIndex && (
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300/85">
                Consolation · Weapon Mastery XP awarded
              </p>
            )}
          </div>
        )}

        {/* Soft auto-pick countdown (MP only) — hidden once chosen */}
        {!revealed && secondsLeft !== null && (
          <p className="mt-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300/80">
            Auto-opens in {secondsLeft}s
          </p>
        )}

        {/* Skill-tree nudge — only when signed in and the player has SP to
            spend. Helpful since the picker freezes the run and they often
            haven't touched the tree in a while. */}
        {skillPointsAvailable !== undefined && skillPointsAvailable > 0 && !revealed && (
          <div className="mt-6 flex items-center justify-center">
            <div className="flex items-center gap-2.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3.5 py-1.5 backdrop-blur-md">
              <GraduationCap className="h-3.5 w-3.5 text-amber-300" strokeWidth={2.25} />
              <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-200">
                {skillPointsAvailable} Skill Point{skillPointsAvailable === 1 ? '' : 's'} to spend
              </span>
              <span className="text-[10px] font-medium text-amber-200/70">
                · open the Skill Tree from the menu
              </span>
            </div>
          </div>
        )}

        {/* Bottom legend — keyboard model */}
        {!revealed && (
          <div className="mt-5 flex items-center justify-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">1</kbd>
              <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">2</kbd>
              <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">3</kbd>
              <span className="ml-1">highlight</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">←</kbd>
              <kbd className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-bold text-gray-300">→</kbd>
              <span className="ml-1">browse</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-emerald-400/40 bg-emerald-500/[0.10] px-1.5 py-0.5 text-[10px] font-bold text-emerald-200">Enter</kbd>
              <span className="text-emerald-300">open</span>
            </span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes perkBoxReveal {
          0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes perkBoxPop {
          0%   { opacity: 0; transform: scale(0.88); }
          60%  { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
};

export default WavePerkPicker;
