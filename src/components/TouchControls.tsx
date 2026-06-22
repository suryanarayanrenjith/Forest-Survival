import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Crosshair, ChevronsUp, ChevronsRight, ChevronsDown, RotateCw, Zap, Pause,
  Wind, Shield as ShieldIcon, Flame, Heart, Infinity as InfinityIcon, Ghost, Bomb,
  Boxes, Swords, PackageSearch, ChevronDown, Lock,
  type LucideIcon,
} from 'lucide-react';
import { touchControls } from '../utils/touchControls';
import { haptic } from '../utils/haptics';
import { WEAPONS } from '../types/game';
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

const TouchControls = ({
  unlockedWeapons, currentWeapon, abilities = [], reloadDuration = null, canPause = true,
}: TouchControlsProps) => {
  const [weaponOpen, setWeaponOpen] = useState(false);

  // If the controls unmount while a finger is still down (e.g. on game over or
  // returning to the menu), make sure no movement/aim input is left "stuck".
  useEffect(() => () => {
    touchControls.reset();
    dispatchMouse('mouseup', 0); // also stop any in-flight auto-fire
  }, []);

  const dash = abilities.find((a) => a.kind === 'dash');
  const power = abilities.find((a) => a.kind === 'power');
  const dashReady = (dash?.cooldown ?? 1) >= 1;
  // Per-character ability icon (the touch button still dispatches the bound
  // ability key, so any class's signature move fires from here).
  const ABILITY_ICONS: Record<string, LucideIcon> = {
    dash: ChevronsRight, adrenaline: Wind, bulwark: ShieldIcon, overclock: InfinityIcon,
    firestorm: Flame, triage: Heart, demolition: Bomb, cloak: Ghost,
  };
  const abilityIcon = ABILITY_ICONS[dash?.abilityId ?? 'dash'] ?? ChevronsRight;
  const powerHeld = power?.state === 'held';
  const powerActive = power?.state === 'active';
  // Held/active pickup icon, so mobile players can SEE which power they have.
  const POWER_ICONS: Record<string, LucideIcon> = {
    ammo: Boxes, speed: Wind, damage: Swords, shield: ShieldIcon,
    infinite_ammo: InfinityIcon, overcharge: Zap, phantom: Ghost, health: Heart,
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

  // ── Aim down sights (hold) ──
  const onAimDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    haptic('tap');
    touchControls.aiming = true;
  }, []);
  const onAimUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    touchControls.aiming = false;
  }, []);

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
      <LookSurface />

      {/* Movement joystick zone — left side, above the look surface. */}
      <Joystick />

      {/* ── Top-right: weapon switcher + pause ── */}
      <div className="touch-safe-pad pointer-events-none absolute right-0 top-0 flex items-start gap-2 p-2">
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

          {weaponOpen && (
            <div className="absolute right-0 top-14 flex max-h-[58vh] w-44 flex-col gap-1 overflow-y-auto rounded-2xl border border-white/12 bg-black/90 p-1.5">
              {Object.keys(WEAPONS).map((key, idx) => {
                const unlocked = unlockedWeapons.includes(key);
                const current = key === currentWeapon;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => unlocked && selectWeapon(key)}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold transition-colors ${
                      current ? 'bg-emerald-500/20 text-emerald-200'
                        : unlocked ? 'text-gray-200 active:bg-white/10'
                        : 'text-gray-600'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-black tabular-nums ${current ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/10 text-gray-400'}`}>
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate">{WEAPONS[key].name}</span>
                    {!unlocked && <Lock className="ml-1 h-3 w-3 shrink-0 text-gray-600" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {canPause && (
          <button
            type="button"
            aria-label="Pause"
            onClick={() => tapKey('Escape')}
            className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-black/75 active:scale-95"
          >
            <Pause className="h-5 w-5 text-white" strokeWidth={2.25} fill="currentColor" />
          </button>
        )}
      </div>

      {/* ── Bottom-right: action cluster + FIRE ── */}
      <div className="touch-safe-pad pointer-events-none absolute bottom-0 right-0 flex items-end gap-3 p-4">
        {/* Secondary actions — 2-col grid keeps them from overlapping. */}
        <div className="pointer-events-none grid grid-cols-2 gap-2.5">
          <ActionButton label="Reload" icon={RotateCw} onTap={() => tapKey('KeyR')} busy={isReloading} accent="amber" />
          <HoldButton label="Jump" icon={ChevronsUp} onDown={onJumpDown} onUp={onJumpUp} />
          <ActionButton label={dash?.name ?? 'Ability'} icon={abilityIcon} onTap={() => tapKey('KeyQ')} ready={dashReady} cooldown={dash?.cooldown ?? 1} accent="emerald" />
          <ActionButton label="Crouch" icon={ChevronsDown} onTap={() => tapKey('KeyC')} />
          <HoldButton label="Aim" icon={Crosshair} onDown={onAimDown} onUp={onAimUp} />
          <PowerButton
            label={powerHeld || powerActive ? (power?.name ?? 'Power') : 'Power'}
            icon={powerIcon}
            onTap={() => tapKey('KeyE')}
            held={powerHeld}
            active={powerActive}
            ratio={power?.ratio}
          />
        </div>

        {/* FIRE — primary, under the looking thumb. */}
        <button
          type="button"
          aria-label="Fire"
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
    </div>
  );
};

// ── Full-screen swipe-to-look surface ─────────────────────────────────────
const LookSurface = () => {
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

  // Right ~60% of the screen only — the standard mobile-FPS look zone. Keeps
  // the top-left HUD and any left-side overlays free to receive their own taps.
  return (
    <div
      className="absolute right-0 top-0 h-full w-[60%] pointer-events-auto"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
};

// ── Floating movement joystick ─────────────────────────────────────────────
const Joystick = () => {
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
      className="absolute bottom-0 left-0 h-[64%] w-[42%] pointer-events-auto"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {origin && (
        <>
          {/* Base ring */}
          <div
            className="fixed h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/45"
            style={{ left: origin.x, top: origin.y }}
          />
          {/* Thumb */}
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
  label, icon: Icon, onTap, held, active, ratio,
}: {
  label: string; icon: LucideIcon; onTap: () => void;
  held: boolean; active: boolean; ratio?: number;
}) => {
  const accent = held ? ACCENT.amber : active ? ACCENT.emerald : ACCENT.slate;
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); onTap(); }}
      className={`pointer-events-auto relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-2xl border ${accent.border} ${accent.bg} transition-transform active:scale-90 ${
        held ? 'animate-pulse' : ''
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
