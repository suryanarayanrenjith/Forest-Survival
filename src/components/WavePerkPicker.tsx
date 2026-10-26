import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { CornerDownLeft, GraduationCap, PackageOpen } from 'lucide-react';
import { WAVE_PERKS, type WavePerkId } from '../utils/WavePerkRegistry';
import { soundManager } from '../utils/SoundManager';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import { PERK_ICON, PERK_RARITY } from './perkVisuals';

const IS_TOUCH = detectIsTouch();

interface WavePerkPickerProps {
  /** Wave that was just cleared (shown in the header). */
  waveCleared: number;
  /**
   * Three sealed cases. One contains a perk (the prize); the other two are
   * `null`. Player picks blind; the right case unlocks the perk.
   */
  slots: (WavePerkId | null)[];
  /** Index of the case that holds the prize. */
  prizeSlotIndex: number;
  /**
   * Called once the player has picked AND the reveal has played (or been
   * skipped). Argument is the perk id on a win, `null` otherwise.
   */
  onPick: (perk: WavePerkId | null) => void;
  /** Unspent skill points (signed-in only) — a small nudge chip when > 0. */
  skillPointsAvailable?: number;
  /**
   * Soft auto-pick deadline. Multiplayer passes a value so the choice
   * resolves on its own (preventing a stalled MP wave). Solo passes
   * `undefined` (no timer — the player picks when they're ready).
   */
  autoPickAfterMs?: number;
  /** Perks already stacked this run — shown as the loadout strip. */
  ownedPerks?: WavePerkId[];
  /** What an empty case pays out instead (e.g. "+61 Rifle Mastery XP"). */
  consolation?: string;
}

type Phase = 'choose' | 'opening' | 'revealed';

/** Latches pop + light leaks out of the seam, then the cases turn over. */
const OPENING_MS = 520;
/** How long the result holds before the run resumes (skippable). */
const HOLD_SOLO_MS = 3400;
const HOLD_MP_MS = 2400;
/** Skip opens up once the picked case has finished turning over. */
const SKIP_AFTER_MS = 900;

const SHAPE = '16px 4px';
const ACCENT = '#2ee8b4';
const EMBER = '#ffb265';
const DANGER = '#ff6b6b';

const play = (name: string, vol: number, pitch = 1) => {
  try { soundManager.play(name, vol, false, pitch); } catch { /* sound is best-effort */ }
};

/**
 * MYSTERY BOX — the between-waves gamble, staged like a supply drop.
 *
 * Three sealed hard cases. Hover/arrow-key focus lifts a case and runs a scan
 * across it; picking one throws its latches, light leaks out of the seam, and
 * the cases turn over one after another to show what each held. Everything is
 * in the game's own language — Oswald display caps, Chakra Petch labels,
 * partial-rounded frames, HUD brackets — and every motion is a transform /
 * opacity spring (Motion), so it costs nothing on top of the paused scene.
 */
const WavePerkPicker = ({
  waveCleared, slots, prizeSlotIndex, onPick, skillPointsAvailable, autoPickAfterMs,
  ownedPerks = [], consolation,
}: WavePerkPickerProps) => {
  const [focusedIdx, setFocusedIdx] = useState(1);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    autoPickAfterMs ? Math.ceil(autoPickAfterMs / 1000) : null,
  );

  // Stable refs for everything the timers close over: App re-renders ~16×/s
  // as the HUD flushes, and re-arming a timer on every render soft-locked the
  // old picker on its result screen.
  const onPickRef = useRef(onPick);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  const focusedIdxRef = useRef(focusedIdx);
  useEffect(() => { focusedIdxRef.current = focusedIdx; }, [focusedIdx]);
  const resolvedRef = useRef(false);
  const revealedAtRef = useRef(0);

  const won = pickedIdx !== null && pickedIdx === prizeSlotIndex;
  const prize = slots[prizeSlotIndex] ? WAVE_PERKS[slots[prizeSlotIndex]!] : null;

  const finish = () => {
    if (resolvedRef.current || pickedIdx === null) return;
    resolvedRef.current = true;
    onPickRef.current(pickedIdx === prizeSlotIndex ? (slots[prizeSlotIndex] ?? null) : null);
  };
  const finishRef = useRef(finish);
  useEffect(() => { finishRef.current = finish; });

  const choose = (idx: number) => {
    if (phase !== 'choose') return;
    setFocusedIdx(idx);
    setPickedIdx(idx);
  };
  const chooseRef = useRef(choose);
  useEffect(() => { chooseRef.current = choose; });

  // Auto-pick countdown — MP only.
  useEffect(() => {
    if (pickedIdx !== null || !autoPickAfterMs) return;
    const start = performance.now();
    const tick = window.setInterval(() => {
      const remaining = Math.max(0, autoPickAfterMs - (performance.now() - start));
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        window.clearInterval(tick);
        chooseRef.current(focusedIdxRef.current);
      }
    }, 200);
    return () => window.clearInterval(tick);
  }, [autoPickAfterMs, pickedIdx]);

  // The opening beat: latches → turn-over → hold → resume.
  useEffect(() => {
    if (pickedIdx === null) return;
    setPhase('opening');
    play('reload_cover', 0.55, 1.15);
    const latch2 = window.setTimeout(() => play('reload_cover', 0.45, 0.95), 130);
    const reveal = window.setTimeout(() => {
      setPhase('revealed');
      revealedAtRef.current = performance.now();
      if (pickedIdx === prizeSlotIndex) {
        play('cue_perk', 0.9);
      } else {
        play('empty', 0.5, 0.6);
        play('hit', 0.35, 0.5);
      }
    }, OPENING_MS);
    const done = window.setTimeout(() => finishRef.current(),
      OPENING_MS + (autoPickAfterMs ? HOLD_MP_MS : HOLD_SOLO_MS));
    return () => { window.clearTimeout(latch2); window.clearTimeout(reveal); window.clearTimeout(done); };
  }, [pickedIdx, prizeSlotIndex, autoPickAfterMs]);

  // Keyboard: 1/2/3 focus, ←/→ (A/D) browse, Enter/Space open — and, once the
  // result is on screen, Enter/Space/Esc skip straight back into the run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      if (phase === 'revealed') {
        if ((key === 'Enter' || key === ' ' || key === 'Escape') && performance.now() - revealedAtRef.current > SKIP_AFTER_MS) {
          e.preventDefault(); e.stopPropagation();
          finishRef.current();
        }
        return;
      }
      if (phase !== 'choose') return;
      const focus = (i: number) => {
        e.preventDefault(); e.stopPropagation();
        if (i !== focusedIdxRef.current) play('weaponSwitch', 0.16, 1.35);
        setFocusedIdx(i);
      };
      if (e.code === 'Digit1' || key === '1') return focus(0);
      if (e.code === 'Digit2' || key === '2') return focus(1);
      if (e.code === 'Digit3' || key === '3') return focus(2);
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') return focus((focusedIdxRef.current + 2) % 3);
      if (key === 'ArrowRight' || key === 'd' || key === 'D') return focus((focusedIdxRef.current + 1) % 3);
      if (key === 'Enter' || key === ' ') {
        e.preventDefault(); e.stopPropagation();
        chooseRef.current(focusedIdxRef.current);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase]);

  const revealed = phase === 'revealed';
  const autoTotal = autoPickAfterMs ? Math.ceil(autoPickAfterMs / 1000) : 0;

  return (
    <m.div
      className="fixed inset-0 z-[85] overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.28 } }}
      onClick={() => { if (revealed && performance.now() - revealedAtRef.current > SKIP_AFTER_MS) finishRef.current(); }}
    >
      {/* Grade: a deep forest-dark vignette over the frozen scene (solid —
          no backdrop blur in-game), a faint tactical grid, and a soft pool of
          light where the cases sit. */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(6,14,11,0.84) 0%, rgba(3,6,5,0.95) 62%, rgba(1,3,2,0.985) 100%)' }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        style={{
          backgroundImage: 'linear-gradient(rgba(214,228,220,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(214,228,220,0.035) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, #000 0%, transparent 75%)',
          maskImage: 'radial-gradient(ellipse 60% 55% at 50% 50%, #000 0%, transparent 75%)',
        }}
      />
      <m.div
        className="pointer-events-none fixed left-1/2 top-[54%] h-[60vh] w-[90vw] -translate-x-1/2 -translate-y-1/2"
        style={{ background: `radial-gradient(ellipse at center, ${revealed && won && prize ? PERK_RARITY[prize.rarity].color : ACCENT}1f 0%, transparent 62%)` }}
        animate={{ opacity: revealed ? 1 : 0.65 }}
        transition={{ duration: 0.6 }}
      />

      <div className="relative flex min-h-full w-full items-center justify-center px-4 py-6 sm:px-8">
        <div className="relative w-full max-w-[860px]">
          {/* ── Header ── */}
          <m.div
            className="mb-6 text-center sm:mb-8"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="font-hud flex items-center justify-center gap-3 text-[10px] font-semibold uppercase tracking-[0.44em] text-emerald-300/80">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-emerald-300/60" />
              Wave {String(waveCleared).padStart(2, '0')} Secured
              <span className="h-px w-10 bg-gradient-to-l from-transparent to-emerald-300/60" />
            </div>
            <h2 className="font-display title-bio mt-2.5 text-[clamp(2.2rem,6vw,3.4rem)] font-semibold uppercase leading-none tracking-[0.06em]">
              Mystery Box
            </h2>
            <div className="aurora-rule mx-auto mt-3.5 h-px w-52 bg-gradient-to-r from-transparent via-emerald-300/55 to-transparent" />
            <p className="font-hud mx-auto mt-3 max-w-xl text-[12px] leading-relaxed text-white/50">
              Three sealed cases — one holds a perk for the rest of the run.
            </p>
          </m.div>

          {/* ── The cases ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
            {[0, 1, 2].map((idx) => (
              <CaseCard
                key={idx}
                idx={idx}
                perkId={slots[idx] ?? null}
                phase={phase}
                focused={idx === focusedIdx}
                picked={idx === pickedIdx}
                flipDelay={idx === pickedIdx ? 0 : 0.42 + ((idx + 3 - (pickedIdx ?? 0)) % 3) * 0.14}
                onFocus={() => { if (phase === 'choose' && idx !== focusedIdx) { play('weaponSwitch', 0.12, 1.4); setFocusedIdx(idx); } }}
                onChoose={() => choose(idx)}
              />
            ))}
          </div>

          {/* ── Result / prompts ── */}
          <div className="mt-6 min-h-[64px] text-center sm:mt-7">
            {revealed ? (
              <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.45, ease: 'easeOut' }}>
                {won && prize ? (
                  <>
                    <div className="hud-label" style={{ color: PERK_RARITY[prize.rarity].color, letterSpacing: '0.34em' }}>
                      Perk acquired · {PERK_RARITY[prize.rarity].label}
                    </div>
                    <div className="font-display mt-1.5 text-[26px] font-semibold uppercase tracking-[0.08em] text-white">
                      {prize.name}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hud-label" style={{ color: DANGER, letterSpacing: '0.34em' }}>Case empty</div>
                    <div className="font-hud mt-2 text-[13px] font-semibold uppercase tracking-[0.18em]" style={{ color: EMBER }}>
                      Consolation · {consolation ?? 'Weapon Mastery XP awarded'}
                    </div>
                  </>
                )}
                <ContinueBar holdMs={autoPickAfterMs ? HOLD_MP_MS : HOLD_SOLO_MS} />
              </m.div>
            ) : phase === 'choose' ? (
              <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                {secondsLeft !== null && (
                  <div className="mx-auto mb-4 w-64">
                    <div className="hud-label mb-1.5" style={{ color: EMBER }}>Auto-opens in {secondsLeft}s</div>
                    <div className="h-[2px] overflow-hidden bg-white/10">
                      <m.div
                        className="h-full origin-left"
                        style={{ background: EMBER }}
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: 0 }}
                        transition={{ duration: autoTotal, ease: 'linear' }}
                      />
                    </div>
                  </div>
                )}
                {IS_TOUCH ? (
                  <span className="hud-label">Tap a case to open it</span>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    <KeyHint keys={['1', '2', '3']} label="Select" />
                    <KeyHint keys={['←', '→']} label="Browse" />
                    <KeyHint keys={['Enter']} label="Open case" accent />
                  </div>
                )}
              </m.div>
            ) : null}
          </div>

          {/* ── Loadout + skill-point nudge ── */}
          {(ownedPerks.length > 0 || (skillPointsAvailable ?? 0) > 0) && (
            <m.div
              className="mt-5 flex flex-col items-center gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
            >
              {ownedPerks.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="hud-label mr-1" style={{ fontSize: 9 }}>Run loadout · {ownedPerks.length}</span>
                  {ownedPerks.map((id, i) => {
                    const perk = WAVE_PERKS[id];
                    if (!perk) return null;
                    const Icon = PERK_ICON[id];
                    const c = PERK_RARITY[perk.rarity].color;
                    return (
                      <span
                        key={`${id}-${i}`}
                        title={`${perk.name} — ${perk.blurb}`}
                        className="flex h-7 w-7 items-center justify-center"
                        style={{ borderRadius: '7px 2px', border: `1px solid ${c}55`, background: `${c}12` }}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: c }} strokeWidth={2.2} />
                      </span>
                    );
                  })}
                </div>
              )}
              {(skillPointsAvailable ?? 0) > 0 && phase === 'choose' && (
                <div
                  className="flex items-center gap-2.5 px-3.5 py-1.5"
                  style={{ borderRadius: '9px 2px', border: '1px solid rgba(255,178,101,0.3)', background: 'rgba(40,24,8,0.6)' }}
                >
                  <GraduationCap className="h-3.5 w-3.5" style={{ color: EMBER }} strokeWidth={2.25} />
                  <span className="font-hud text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100">
                    {skillPointsAvailable} skill point{skillPointsAvailable === 1 ? '' : 's'} to spend
                  </span>
                  <span className="font-hud text-[10px] text-amber-100/55">· Skill Tree in the pause menu</span>
                </div>
              )}
            </m.div>
          )}
        </div>
      </div>
    </m.div>
  );
};

// ── One case: a sealed front that turns over to show what was inside ─────────

const CaseCard = ({ idx, perkId, phase, focused, picked, flipDelay, onFocus, onChoose }: {
  idx: number;
  perkId: WavePerkId | null;
  phase: Phase;
  focused: boolean;
  picked: boolean;
  flipDelay: number;
  onFocus: () => void;
  onChoose: () => void;
}) => {
  const choosing = phase === 'choose';
  const revealed = phase === 'revealed';
  const lifted = choosing && focused;
  const opening = !choosing && picked;
  const dimmed = !choosing && !picked;
  return (
    <m.div
      className="relative"
      style={{ perspective: 1200 }}
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24, delay: 0.12 + idx * 0.09 }}
    >
      {/* "Your pick" tag rides above the chosen case. */}
      {picked && !choosing && (
        <m.div
          className="hud-label absolute -top-5 left-0 right-0 text-center"
          style={{ color: revealed ? (perkId ? PERK_RARITY[WAVE_PERKS[perkId].rarity].color : DANGER) : ACCENT, letterSpacing: '0.3em' }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Your pick
        </m.div>
      )}
      <m.button
        type="button"
        disabled={!choosing}
        aria-label={`Open case ${idx + 1}`}
        onMouseEnter={onFocus}
        onFocus={onFocus}
        onClick={onChoose}
        className="relative block h-[clamp(232px,40vh,300px)] w-full cursor-pointer text-left outline-none disabled:cursor-default"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{
          y: lifted ? -10 : 0,
          scale: lifted ? 1.03 : opening ? 1.04 : dimmed ? 0.95 : 1,
          opacity: dimmed && !revealed ? 0.55 : 1,
        }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      >
        <m.div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={{ duration: 0.72, ease: [0.22, 0.85, 0.25, 1], delay: revealed ? flipDelay : 0 }}
        >
          <CaseFront idx={idx} focused={lifted} opening={opening} />
          <CaseBack perkId={perkId} picked={picked} revealed={revealed} flipDelay={flipDelay} />
        </m.div>
      </m.button>
    </m.div>
  );
};

/** The sealed case (front face). */
const CaseFront = ({ idx, focused, opening }: { idx: number; focused: boolean; opening: boolean }) => {
  const rim = opening ? ACCENT : focused ? 'rgba(46,232,180,0.6)' : 'rgba(214,228,220,0.12)';
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        borderRadius: SHAPE,
        border: `1px solid ${rim}`,
        background: 'linear-gradient(180deg, #0e1714 0%, #08100d 55%, #050907 100%)',
        boxShadow: focused || opening
          ? '0 28px 60px -26px rgba(46,232,180,0.5), inset 0 1px 0 rgba(255,255,255,0.06)'
          : '0 22px 46px -28px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.04)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        transition: 'border-color 0.18s, box-shadow 0.25s',
      }}
    >
      {/* Brushed finish + a cold top highlight: the case reads as metal, not a panel. */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(115deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px)',
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 85%)',
        }}
      />
      <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {/* HUD bracket corners on the focused case */}
      <span
        className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-[1.5px] border-t-[1.5px] transition-opacity duration-200"
        style={{ borderColor: ACCENT, opacity: focused || opening ? 0.9 : 0 }}
      />
      <span
        className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-[1.5px] border-r-[1.5px] transition-opacity duration-200"
        style={{ borderColor: ACCENT, opacity: focused || opening ? 0.9 : 0 }}
      />

      <div className="relative flex h-full flex-col px-5 pb-4 pt-4">
        <div className="flex items-center justify-between">
          <span className="hud-label" style={{ color: focused ? '#e8fff7' : undefined }}>Case {String(idx + 1).padStart(2, '0')}</span>
          {!IS_TOUCH && (
            <span
              className="hud-key flex h-[18px] min-w-[18px] items-center justify-center px-1"
              style={{
                borderRadius: '5px 1.5px',
                border: `1px solid ${focused ? ACCENT : 'rgba(214,228,220,0.22)'}`,
                color: focused ? ACCENT : 'rgba(214,228,220,0.7)',
                background: '#060a09',
              }}
            >
              {idx + 1}
            </span>
          )}
        </div>

        <div className="relative flex flex-1 items-center justify-center">
          <CaseArt idx={idx} focused={focused} opening={opening} />
        </div>

        <div className="flex items-center justify-between">
          <span className="hud-label flex items-center gap-1.5" style={{ fontSize: 9 }}>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: opening ? ACCENT : focused ? ACCENT : EMBER, boxShadow: `0 0 6px ${opening || focused ? ACCENT : EMBER}` }}
            />
            {opening ? 'Unsealing' : 'Sealed'}
          </span>
          <span
            className="hud-label flex items-center gap-1 transition-opacity duration-200"
            style={{ fontSize: 9, color: ACCENT, opacity: focused ? 1 : 0 }}
          >
            {IS_TOUCH ? 'Tap to open' : <>Open <CornerDownLeft className="h-3 w-3" strokeWidth={2.4} /></>}
          </span>
        </div>
      </div>

      {/* Scan sweep while focused */}
      {focused && (
        <m.span
          className="pointer-events-none absolute inset-x-0 h-16"
          style={{ background: 'linear-gradient(180deg, transparent, rgba(46,232,180,0.10), transparent)' }}
          initial={{ y: -70 }}
          animate={{ y: 330 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'linear', repeatDelay: 0.4 }}
        />
      )}
    </div>
  );
};

/** Hand-drawn hard case: lid seam, latches, corner guards, handle, stencil, LED. */
const CaseArt = ({ idx, focused, opening }: { idx: number; focused: boolean; opening: boolean }) => {
  const glow = opening ? '#bffbe9' : focused ? ACCENT : 'rgba(214,228,220,0.16)';
  const gid = `case-grad-${idx}`;
  return (
    <svg viewBox="0 0 200 150" className="w-full max-w-[210px] overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#25302b" />
          <stop offset="0.48" stopColor="#151d19" />
          <stop offset="0.5" stopColor="#0d1411" />
          <stop offset="1" stopColor="#0a100d" />
        </linearGradient>
      </defs>
      {/* floor shadow */}
      <ellipse cx="100" cy="138" rx="78" ry="7" fill="rgba(0,0,0,0.55)" />
      {/* handle */}
      <rect x="78" y="10" width="44" height="13" rx="6" fill="none" stroke="rgba(214,228,220,0.28)" strokeWidth="3" />
      {/* body */}
      <rect x="16" y="20" width="168" height="110" rx="10" fill={`url(#${gid})`} stroke="rgba(214,228,220,0.2)" strokeWidth="1.2" />
      {/* lid ribs */}
      {[32, 40, 48].map((y) => (
        <line key={y} x1="30" y1={y} x2="170" y2={y} stroke="rgba(214,228,220,0.07)" strokeWidth="1.4" />
      ))}
      {/* corner guards */}
      {[[16, 20, 1, 1], [184, 20, -1, 1], [16, 130, 1, -1], [184, 130, -1, -1]].map(([x, y, sx, sy], i) => (
        <path
          key={i}
          d={`M ${x} ${y + sy * 18} L ${x} ${y + sy * 4} Q ${x} ${y} ${x + sx * 4} ${y} L ${x + sx * 18} ${y}`}
          fill="none"
          stroke="rgba(214,228,220,0.4)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
      ))}
      {/* lid seam (glows when focused / light leaks when opening) */}
      <line x1="16" y1="62" x2="184" y2="62" stroke="#020403" strokeWidth="2.4" />
      <m.line
        x1="18" y1="63.6" x2="182" y2="63.6"
        stroke={glow}
        strokeWidth={opening ? 2.6 : 1.2}
        animate={{ opacity: opening ? [0.6, 1, 0.85] : focused ? [0.55, 1, 0.55] : 0.5 }}
        transition={opening ? { duration: 0.5 } : { duration: 1.6, repeat: focused ? Infinity : 0 }}
      />
      {opening && (
        <m.rect
          x="16" y="54" width="168" height="18" rx="4"
          fill={glow}
          initial={{ opacity: 0, scaleX: 0.2 }}
          animate={{ opacity: [0, 0.32, 0.2], scaleX: 1 }}
          style={{ originX: 0.5, originY: 0.5, filter: 'blur(5px)' }}
          transition={{ duration: 0.5 }}
        />
      )}
      {/* latches: a base plate + a lever that throws open */}
      {[52, 148].map((x, i) => (
        <g key={x}>
          <rect x={x - 11} y="54" width="22" height="20" rx="2.5" fill="#202a26" stroke="rgba(214,228,220,0.32)" strokeWidth="1" />
          <m.rect
            x={x - 7} y="57" width="14" height="14" rx="1.5"
            fill="#33403a"
            stroke="rgba(214,228,220,0.45)"
            strokeWidth="1"
            style={{ originX: 0.5, originY: 0 }}
            animate={{ rotate: opening ? (i === 0 ? -64 : 64) : 0, y: opening ? -3 : 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 14, delay: i * 0.12 }}
          />
        </g>
      ))}
      {/* stencil + hazard strip */}
      <text
        x="100" y="102" textAnchor="middle"
        fontFamily="'Chakra Petch', sans-serif" fontSize="10" fontWeight="700" letterSpacing="3"
        fill="rgba(214,228,220,0.32)"
      >
        FS-0{idx + 1} · SUPPLY
      </text>
      <g opacity="0.5">
        {Array.from({ length: 6 }, (_, k) => (
          <rect key={k} x={128 + k * 7} y="112" width="4" height="8" fill={k % 2 ? '#111' : EMBER} transform={`skewX(-28)`} />
        ))}
      </g>
      {/* status LED */}
      <m.circle
        cx="100" cy="82" r="3"
        fill={opening || focused ? ACCENT : EMBER}
        animate={{ opacity: focused || opening ? [0.4, 1, 0.4] : 0.75 }}
        transition={{ duration: opening ? 0.3 : 1.1, repeat: focused || opening ? Infinity : 0 }}
      />
    </svg>
  );
};

/** What was inside (back face). */
const CaseBack = ({ perkId, picked, revealed, flipDelay }: {
  perkId: WavePerkId | null; picked: boolean; revealed: boolean; flipDelay: number;
}) => {
  const perk = perkId ? WAVE_PERKS[perkId] : null;
  const color = perk ? PERK_RARITY[perk.rarity].color : 'rgba(214,228,220,0.35)';
  const Icon = perkId ? PERK_ICON[perkId] : PackageOpen;
  const winner = picked && !!perk;
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        transform: 'rotateY(180deg)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderRadius: SHAPE,
        border: `1px solid ${perk ? `${color}${picked ? 'cc' : '55'}` : picked ? 'rgba(255,107,107,0.45)' : 'rgba(214,228,220,0.1)'}`,
        background: perk
          ? `radial-gradient(120% 75% at 50% 0%, ${color}2a 0%, transparent 62%), linear-gradient(180deg, #0d1513 0%, #060a09 100%)`
          : 'linear-gradient(180deg, #0b0f0e 0%, #050807 100%)',
        boxShadow: winner ? `0 30px 70px -28px ${color}aa, inset 0 1px 0 rgba(255,255,255,0.06)` : 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* The win flash — a burst of the rarity colour as the case comes round. */}
      {winner && revealed && (
        <m.span
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 42%, ${color}66 0%, transparent 60%)` }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0.35], scale: [0.6, 1.25, 1] }}
          transition={{ duration: 1.1, delay: flipDelay + 0.3 }}
        />
      )}
      <div className="relative flex h-full flex-col items-center px-5 pb-5 pt-4 text-center">
        <div className="flex w-full items-center justify-between">
          <span className="hud-label" style={{ color: perk ? color : undefined, fontSize: 9 }}>
            {perk ? PERK_RARITY[perk.rarity].label : 'Empty'}
          </span>
          {perk && (
            <span className="flex gap-[3px]">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-1.5 w-1.5"
                  style={{
                    borderRadius: '2px 0.5px',
                    background: d <= (perk.rarity === 'epic' ? 2 : perk.rarity === 'rare' ? 1 : 0) ? color : 'rgba(214,228,220,0.14)',
                  }}
                />
              ))}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center">
          <div
            className="flex h-[68px] w-[68px] items-center justify-center"
            style={{
              borderRadius: '14px 3.5px',
              border: `1px solid ${perk ? `${color}88` : 'rgba(214,228,220,0.12)'}`,
              background: perk ? `${color}14` : 'rgba(255,255,255,0.02)',
              boxShadow: perk ? `0 0 26px ${color}33, inset 0 0 18px ${color}1a` : undefined,
            }}
          >
            <Icon className="h-8 w-8" style={{ color: perk ? color : 'rgba(214,228,220,0.28)', filter: perk ? `drop-shadow(0 0 6px ${color}88)` : undefined }} strokeWidth={1.8} />
          </div>
          <div className={`font-display mt-4 text-[21px] font-semibold uppercase leading-tight tracking-[0.06em] ${perk ? 'text-white' : 'text-white/35'}`}>
            {perk ? perk.name : 'Empty case'}
          </div>
          <div className="font-hud mt-1.5 max-w-[220px] text-[12px] leading-snug text-white/55">
            {perk ? perk.blurb : picked ? 'Nothing inside this time.' : 'Nothing inside.'}
          </div>
        </div>

        <div
          className="hud-label"
          style={{
            fontSize: 9,
            color: winner ? color : picked ? DANGER : 'rgba(214,228,220,0.3)',
            letterSpacing: '0.3em',
          }}
        >
          {winner ? 'Added to run' : picked ? 'No perk' : perk ? 'Missed' : ' '}
        </div>
      </div>
    </div>
  );
};

/** Drains while the result holds; the run resumes when it empties. */
const ContinueBar = ({ holdMs }: { holdMs: number }) => (
  <div className="mx-auto mt-4 w-56">
    <div className="h-[2px] overflow-hidden bg-white/10">
      <m.div
        className="h-full origin-left bg-white/45"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: holdMs / 1000, ease: 'linear' }}
      />
    </div>
    <div className="hud-label mt-2" style={{ fontSize: 9 }}>
      {IS_TOUCH ? 'Tap to continue' : 'Enter to continue'}
    </div>
  </div>
);

const KeyHint = ({ keys, label, accent = false }: { keys: string[]; label: string; accent?: boolean }) => (
  <span className="flex items-center gap-1.5">
    {keys.map((k) => (
      <kbd
        key={k}
        className="hud-key flex h-[20px] min-w-[20px] items-center justify-center px-1.5"
        style={{
          borderRadius: '5px 1.5px',
          border: `1px solid ${accent ? 'rgba(46,232,180,0.55)' : 'rgba(214,228,220,0.2)'}`,
          background: accent ? 'rgba(46,232,180,0.1)' : 'rgba(255,255,255,0.03)',
          color: accent ? '#c9fbec' : 'rgba(214,228,220,0.8)',
        }}
      >
        {k}
      </kbd>
    ))}
    <span className="hud-label ml-1" style={{ color: accent ? ACCENT : undefined }}>{label}</span>
  </span>
);

export default WavePerkPicker;
