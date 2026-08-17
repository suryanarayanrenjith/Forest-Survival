import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Crosshair, ChevronsUp, ChevronsRight, ChevronsDown, RotateCw, Zap, Pause,
  Wind, Shield as ShieldIcon, Flame, Heart, Infinity as InfinityIcon, Ghost, Bomb,
  Boxes, Swords, PackageSearch, ChevronDown, Lock, X,
  Snowflake, Bolt, Waves,
  type LucideIcon,
} from 'lucide-react';
import { touchControls } from '../utils/touchControls';
import { haptic } from '../utils/haptics';
import { WEAPONS } from '../types/game';
import { useTouchLayout, DEFAULT_LAYOUT, type TouchControlId } from '../utils/touchLayout';
import type { AbilityHudItem } from './HUD';

interface TouchControlsProps {
  unlockedWeapons: string[];
  currentWeapon: string;
  /** Live ability state (dash cooldown ring + held-power indicator). */
  abilities?: AbilityHudItem[];
  /** Reload duration in ms while a reload is in flight, else null. */
  reloadDuration?: number | null;
  /** Pause is disabled in multiplayer (matches desktop). */
  canPause?: boolean;
}

// ── Synthetic input helpers ──────────────────────────────────────────────
// The on-screen buttons reuse the desktop handlers by re-emitting the same DOM
// events those handlers listen for: keyboard for discrete actions, mouse
// button-0 for firing. Nothing in the game loop needs to know about touch.
const dispatchKey = (type: 'keydown' | 'keyup', code: string) => {
  document.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
};
const tapKey = (code: string) => {
  haptic('tap'); // tactile confirmation for the on-screen button
  dispatchKey('keydown', code);
  // Release a beat later so per-frame "is held" reads see at least one press.
  window.setTimeout(() => dispatchKey('keyup', code), 60);
};
const dispatchMouse = (type: 'mousedown' | 'mouseup', button = 0) => {
  document.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
};

const WEAPON_DIGIT: Record<string, string> = {
  pistol: 'Digit1', rifle: 'Digit2', shotgun: 'Digit3', smg: 'Digit4',
  sniper: 'Digit5', minigun: 'Digit6', launcher: 'Digit7', subverter: 'Digit8',
};

const JOYSTICK_RADIUS = 46; // px of thumb travel

// Positions each on-screen control by its saved CENTER (viewport fraction),
// applying the global size + opacity from the layout store. Its children keep
// their own `pointer-events-auto`, so only the button itself is tappable — the
// wrapper never eats a look-swipe.
const Positioned = ({
  id, layout, children,
}: {
  id: TouchControlId;
  layout: ReturnType<typeof useTouchLayout>;
  children: React.ReactNode;
}) => {
  const pos = layout.positions[id] ?? DEFAULT_LAYOUT.positions[id];
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${pos.x * 100}%`,
        top: `${pos.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${layout.scale})`,
        opacity: layout.opacity,
      }}
    >
      {children}
    </div>
  );
};

const TouchControls = ({
  unlockedWeapons, currentWeapon, abilities = [], reloadDuration = null, canPause = true,
}: TouchControlsProps) => {
  const [weaponOpen, setWeaponOpen] = useState(false);
  const layout = useTouchLayout();

  // If the controls unmount while a finger is still down (e.g. on game over or
  // returning to the menu), make sure no movement/aim input is left "stuck".
  useEffect(() => () => {
    touchControls.reset();
    dispatchMouse('mouseup', 0); // also stop any in-flight auto-fire
  }, []);

  const dash = abilities.find((a) => a.kind === 'dash');
  const power = abilities.find((a) => a.kind === 'power');
  // Explicit readiness, NOT a re-derivation from the quantised fill — see
  // AbilityHudItem.ready for why deriving it leaves the button stuck greyed.
  const dashReady = dash?.ready ?? (dash?.cooldown ?? 1) >= 1;
  // Per-character ability icon (the touch button still dispatches the bound
  // ability key, so any class's signature move fires from here).
  const ABILITY_ICONS: Record<string, LucideIcon> = {
    dash: ChevronsRight, adrenaline: Wind, bulwark: ShieldIcon, overclock: InfinityIcon,
    firestorm: Flame, triage: Heart, demolition: Bomb, cloak: Ghost,
  };
  const abilityIcon = ABILITY_ICONS[dash?.abilityId ?? 'dash'] ?? ChevronsRight;
  // A jammed slot still holds its power but cannot fire it (ARK-07 relay
  // interference), so it must not render as ready-to-tap.
  const powerJammed = power?.jammed === true && power?.state !== 'empty';
  const powerHeld = power?.state === 'held' && !powerJammed;
  const powerActive = power?.state === 'active' && !powerJammed;
  // Held/active pickup icon, so mobile players can SEE which power they have.
  // ⚠ Keep in sync with POWER_ICONS in HUD.tsx — every HeldPower needs an
  // entry here or mobile shows a generic box for it.
  const POWER_ICONS: Record<string, LucideIcon> = {
    ammo: Boxes, speed: Wind, damage: Swords, shield: ShieldIcon,
    infinite_ammo: InfinityIcon, overcharge: Zap, phantom: Ghost, health: Heart,
    cryo: Snowflake, tesla: Bolt, shockwave: Waves, nuke: Bomb,
  };
  const powerIcon = power?.powerType ? (POWER_ICONS[power.powerType] ?? PackageSearch) : PackageSearch;
  const isReloading = reloadDuration !== null;

  // ── Fire (hold) ──
  const onFireDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dispatchMouse('mousedown', 0);
  }, []);
  const onFireUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dispatchMouse('mouseup', 0);
  }, []);

  // NOTE: there is no aim-down-sights button on touch. Firing auto-engages the
  // sights for aim-capable weapons and the aim-assist snaps to the nearest
  // enemy ("auto aim, then shoot" — see the mobile ADS block in App.tsx).

  // ── Jump (hold for full height, tap for a hop) ──
  const onJumpDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    haptic('tap');
    dispatchKey('keydown', 'Space');
  }, []);
  const onJumpUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dispatchKey('keyup', 'Space');
  }, []);

  const selectWeapon = (weapon: string) => {
    const code = WEAPON_DIGIT[weapon];
    if (code) tapKey(code);
    setWeaponOpen(false);
  };

  const weaponIndex = Object.keys(WEAPONS).indexOf(currentWeapon) + 1;

  return (
    <div className="touch-control fixed inset-0 z-[45] pointer-events-none select-none">
      {/* Look surface — full screen, lowest layer. Right-thumb swipe aims the
          camera. The joystick zone + buttons sit on top and intercept first. */}
      <LookSurface mirrored={layout.mirrored} />

      {/* Movement joystick zone — above the look surface. Sides swap in
          left-handed mode so the stick lands under the dominant thumb. */}
      <Joystick mirrored={layout.mirrored} />

      {/* ── Weapon switcher (draggable) ── */}
      <Positioned id="weapon" layout={layout}>
        <div className="pointer-events-auto relative">
          {/* Labelled weapon pill — shows the equipped gun + a chevron so it
              reads clearly as "tap to switch weapons". */}
          <button
            type="button"
            aria-label="Switch weapon"
            onClick={() => setWeaponOpen((v) => !v)}
            className={`flex h-12 items-center gap-2 rounded-2xl border bg-black/80 px-3 transition-all active:scale-95 ${
              weaponOpen ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-white/15'
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <Crosshair className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-gray-500">Weapon {weaponIndex || '-'}</span>
              <span className="mt-0.5 max-w-[88px] truncate text-[12px] font-bold text-white">{WEAPONS[currentWeapon]?.name ?? '—'}</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${weaponOpen ? 'rotate-180' : ''}`} strokeWidth={2.5} />
          </button>

          {/* WEAPON SELECT SHEET — CODM/PUBGM-style full-screen armory picker.
              The old anchored drop-down list rendered inside this z-[45]
              stacking context, so the right-edge toggle rail (radar / MP
              scoreboard buttons at z-46) painted ON TOP of it and swallowed
              taps on the middle weapon rows — mobile players literally could
              not switch guns. The sheet is PORTALED to document.body at
              z-[70]: it owns the whole screen while open (its scrim blocks
              every other control, so overlap is impossible by construction),
              shows all 8 slots as big thumb-sized tiles, and one tap equips
              and closes. Tapping the scrim or ✕ dismisses. */}
          {weaponOpen && createPortal(
            <div
              className="fixed inset-0 z-[70] select-none"
              style={{ pointerEvents: 'auto' }}
              onPointerDown={() => setWeaponOpen(false)}
            >
              <div className="absolute inset-0 bg-black/70" />
              <div
                className="absolute left-1/2 top-1/2 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/12 bg-[#0b0f15]/95 p-4 shadow-2xl"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-300">
                    <Crosshair className="h-4 w-4 text-emerald-300" strokeWidth={2.25} />
                    Select Weapon
                  </span>
                  <button
                    type="button"
                    aria-label="Close weapon select"
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setWeaponOpen(false); }}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] active:scale-90"
                  >
                    <X className="h-4 w-4 text-gray-300" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {Object.keys(WEAPONS).map((key, idx) => {
                    const unlocked = unlockedWeapons.includes(key);
                    const current = key === currentWeapon;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={!unlocked}
                        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); if (unlocked) selectWeapon(key); }}
                        className={`relative flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition-transform active:scale-95 ${
                          current ? 'border-emerald-400/70 bg-emerald-500/15'
                            : unlocked ? 'border-white/12 bg-white/[0.04]'
                            : 'border-white/5 bg-black/40'
                        }`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-black tabular-nums ${
                          current ? 'bg-emerald-400/25 text-emerald-100' : unlocked ? 'bg-white/10 text-gray-300' : 'bg-white/5 text-gray-600'
                        }`}>
                          {unlocked ? idx + 1 : <Lock className="h-3 w-3" strokeWidth={2.5} />}
                        </span>
                        <span className={`max-w-full truncate text-[10px] font-bold ${
                          current ? 'text-emerald-200' : unlocked ? 'text-gray-200' : 'text-gray-600'
                        }`}>
                          {WEAPONS[key].name}
                        </span>
                        {current && (
                          <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      </Positioned>

      {/* ── Pause (draggable) ── */}
      {canPause && (
        <Positioned id="pause" layout={layout}>
          <button
            type="button"
            aria-label="Pause"
            onClick={() => tapKey('Escape')}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/75 active:scale-95"
          >
            <Pause className="h-5 w-5 text-white" strokeWidth={2.25} fill="currentColor" />
          </button>
        </Positioned>
      )}

      {/* ── Action cluster — each button is independently draggable (positions
          come from the per-device layout the player set in Settings). ── */}
      <Positioned id="reload" layout={layout}>
        <ActionButton label="Reload" icon={RotateCw} onTap={() => tapKey('KeyR')} busy={isReloading} accent="amber" />
      </Positioned>
      <Positioned id="jump" layout={layout}>
        <HoldButton label="Jump" icon={ChevronsUp} onDown={onJumpDown} onUp={onJumpUp} />
      </Positioned>
      <Positioned id="ability" layout={layout}>
        <ActionButton label={dash?.name ?? 'Ability'} icon={abilityIcon} onTap={() => tapKey('KeyQ')} ready={dashReady} cooldown={dash?.cooldown ?? 1} accent="emerald" />
      </Positioned>
      <Positioned id="crouch" layout={layout}>
        <ActionButton label="Crouch" icon={ChevronsDown} onTap={() => tapKey('KeyC')} />
      </Positioned>
      <Positioned id="melee" layout={layout}>
        <ActionButton label="Melee" icon={Swords} onTap={() => tapKey('KeyV')} />
      </Positioned>
      <Positioned id="power" layout={layout}>
        <PowerButton
          label={powerJammed ? 'Jammed' : powerHeld || powerActive ? (power?.name ?? 'Power') : 'Power'}
          jammed={powerJammed}
          icon={powerIcon}
          onTap={() => tapKey('KeyE')}
          held={powerHeld}
          active={powerActive}
          ratio={power?.ratio}
        />
      </Positioned>

      {/* ── FIRE (draggable) — primary, under the looking thumb. Firing
          auto-aims to the nearest enemy (and auto-ADS for aim-capable guns),
          so there is no separate aim button. The badge advertises that. ── */}
      <Positioned id="fire" layout={layout}>
        <div className="pointer-events-none relative flex flex-col items-center">
          <span className="mb-1.5 flex items-center gap-1 rounded-full border border-emerald-400/40 bg-black/70 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-emerald-300">
            <Crosshair className="h-2.5 w-2.5" strokeWidth={2.5} />
            Auto-Aim
          </span>
          <button
            type="button"
            aria-label="Fire (auto-aim)"
            onPointerDown={onFireDown}
            onPointerUp={onFireUp}
            onPointerCancel={onFireUp}
            onContextMenu={(e) => e.preventDefault()}
            className="pointer-events-auto flex h-[78px] w-[78px] items-center justify-center rounded-full border-2 border-red-400/60 bg-red-500/30 transition-transform active:scale-90 active:bg-red-500/45"
          >
            <span className="flex flex-col items-center leading-none">
              <Crosshair className="h-7 w-7 text-red-200" strokeWidth={2.25} />
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-red-200/90">Fire</span>
            </span>
          </button>
        </div>
      </Positioned>
    </div>
  );
};

// ── Full-screen swipe-to-look surface ─────────────────────────────────────
const LookSurface = ({ mirrored }: { mirrored: boolean }) => {
  const pointerId = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });

  const onDown = (e: React.PointerEvent) => {
    if (pointerId.current !== null) return; // already tracking a look drag
    pointerId.current = e.pointerId;
    last.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    touchControls.addLook(e.clientX - last.current.x, e.clientY - last.current.y);
    last.current = { x: e.clientX, y: e.clientY };
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
  };

  // ~60% of the screen on the aiming side — the standard mobile-FPS look zone.
  // Keeps the opposite corner's HUD and overlays free to receive their own taps.
  return (
    <div
      className={`absolute top-0 h-full w-[60%] pointer-events-auto ${mirrored ? 'left-0' : 'right-0'}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
};

// ── Floating movement joystick ─────────────────────────────────────────────
const Joystick = ({ mirrored }: { mirrored: boolean }) => {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);

  const onDown = (e: React.PointerEvent) => {
    if (pointerId.current !== null) return;
    pointerId.current = e.pointerId;
    setOrigin({ x: e.clientX, y: e.clientY });
    setThumb({ x: 0, y: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current || !origin) return;
    let dx = e.clientX - origin.x;
    let dy = e.clientY - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      const s = JOYSTICK_RADIUS / dist;
      dx *= s; dy *= s;
    }
    setThumb({ x: dx, y: dy });
    touchControls.moveX = dx / JOYSTICK_RADIUS;
    touchControls.moveY = -dy / JOYSTICK_RADIUS; // up = forward
    touchControls.sprinting = dist > JOYSTICK_RADIUS * 0.92;
  };
  const end = (e: React.PointerEvent) => {
    if (e.pointerId !== pointerId.current) return;
    pointerId.current = null;
    setOrigin(null);
    setThumb({ x: 0, y: 0 });
    touchControls.moveX = 0;
    touchControls.moveY = 0;
    touchControls.sprinting = false;
  };

  return (
    <div
      className={`absolute bottom-0 h-[64%] w-[42%] pointer-events-auto ${mirrored ? 'right-0' : 'left-0'}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {origin && (
        <>
          <div
            className="fixed h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/45"
            style={{ left: origin.x, top: origin.y }}
          />
          <div
            className="fixed h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/50 bg-emerald-400/30"
            style={{ left: origin.x + thumb.x, top: origin.y + thumb.y }}
          />
        </>
      )}
    </div>
  );
};

// ── Round tap button (with optional cooldown ring / busy spinner) ──────────
type Accent = 'emerald' | 'amber' | 'red' | 'slate';
const ACCENT: Record<Accent, { border: string; bg: string; text: string }> = {
  emerald: { border: 'border-emerald-400/50', bg: 'bg-emerald-500/15', text: 'text-emerald-200' },
  amber: { border: 'border-amber-400/50', bg: 'bg-amber-500/15', text: 'text-amber-200' },
  red: { border: 'border-red-400/50', bg: 'bg-red-500/15', text: 'text-red-200' },
  slate: { border: 'border-white/15', bg: 'bg-black/50', text: 'text-gray-300' },
};

const ActionButton = ({
  label, icon: Icon, onTap, ready = true, cooldown = 1, busy = false, accent = 'slate',
}: {
  label: string; icon: LucideIcon; onTap: () => void;
  ready?: boolean; cooldown?: number; busy?: boolean; accent?: Accent;
}) => {
  const a = ACCENT[ready ? accent : 'slate'];
  const deg = Math.min(360, Math.max(0, cooldown * 360));
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); onTap(); }}
      className={`pointer-events-auto relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl border ${a.border} ${a.bg} transition-transform active:scale-90`}
    >
      <Icon className={`h-5 w-5 ${a.text}`} strokeWidth={2.25} />
      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-300">{label}</span>
      {cooldown < 1 && (
        <div
          className="absolute inset-0 rounded-2xl"
          style={{ background: `conic-gradient(rgba(0,0,0,0) ${deg}deg, rgba(3,6,10,0.78) ${deg}deg)` }}
        />
      )}
      {busy && <div className="absolute inset-0 rounded-2xl border-2 border-amber-300/60 animate-pulse" />}
    </button>
  );
};

// ── Power / pickup slot button ─────────────────────────────────────────────
// Shows the CURRENTLY held (or running) looted power so mobile players can see
// what they have — empty = dashed "Power" prompt, held = amber + name, active =
// emerald + name (with the shield's absorb sliver when applicable).
const PowerButton = ({
  label, icon: Icon, onTap, held, active, ratio, jammed = false,
}: {
  label: string; icon: LucideIcon; onTap: () => void;
  held: boolean; active: boolean; ratio?: number; jammed?: boolean;
}) => {
  const accent = jammed ? ACCENT.red : held ? ACCENT.amber : active ? ACCENT.emerald : ACCENT.slate;
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); onTap(); }}
      className={`pointer-events-auto relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl border ${accent.border} ${accent.bg} transition-transform active:scale-90 ${
        jammed ? 'opacity-70' : held ? 'animate-pulse' : ''
      }`}
    >
      <Icon className={`h-5 w-5 ${accent.text}`} strokeWidth={2.25} />
      <span className="mt-0.5 max-w-full truncate px-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-300">{label}</span>
      {active && ratio !== undefined && (
        <div className="absolute -bottom-0.5 left-1 right-1 h-1 overflow-hidden rounded-full bg-black/55">
          <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
        </div>
      )}
    </button>
  );
};

// ── Round hold button (press + release driven) ─────────────────────────────
const HoldButton = ({
  label, icon: Icon, onDown, onUp,
}: {
  label: string; icon: LucideIcon;
  onDown: (e: React.PointerEvent) => void; onUp: (e: React.PointerEvent) => void;
}) => (
  <button
    type="button"
    aria-label={label}
    onPointerDown={onDown}
    onPointerUp={onUp}
    onPointerCancel={onUp}
    className="pointer-events-auto relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl border border-white/15 bg-black/70 transition-transform active:scale-90 active:bg-white/10"
  >
    <Icon className="h-5 w-5 text-gray-200" strokeWidth={2.25} />
    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-gray-300">{label}</span>
  </button>
);

export default TouchControls;
