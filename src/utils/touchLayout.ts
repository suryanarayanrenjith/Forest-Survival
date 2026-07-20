// Per-device on-screen control layout for the mobile/tablet HUD.
//
// Mobile-FPS players expect to arrange their buttons — so the FIRE button, the
// action cluster (reload/jump/ability/crouch/melee/power) and the weapon/pause
// chrome are all freely draggable in Settings → Controls, and each control's
// CENTER is stored here as a viewport fraction (0..1) plus a global size and
// opacity. This is DEVICE-LOCAL only: it lives in localStorage, never Convex,
// so one player's thumb geometry never syncs onto another device.
//
// TouchControls.tsx renders every button from this store; TouchLayoutEditor.tsx
// (the drag surface in Settings) writes to it. `useTouchLayout()` keeps both in
// sync live via useSyncExternalStore.

import { useSyncExternalStore } from 'react';

export type TouchControlId =
  | 'fire' | 'reload' | 'jump' | 'ability' | 'crouch' | 'melee' | 'power'
  | 'weapon' | 'pause';

export interface TouchHudLayout {
  /** Control CENTER as a fraction of the viewport (x = width, y = height). */
  positions: Record<TouchControlId, { x: number; y: number }>;
  /** Global button size multiplier. */
  scale: number;
  /** Global button opacity (rest state). */
  opacity: number;
  /** Editor: snap dragged buttons to a grid + auto-separate overlaps. */
  snap: boolean;
}

/** Draggable order (also the order chips are stacked in the editor legend). */
export const TOUCH_CONTROL_ORDER: TouchControlId[] = [
  'fire', 'jump', 'ability', 'melee', 'reload', 'crouch', 'power', 'weapon', 'pause',
];

// Reference on-screen size (px) each control occupies in-game — used by the
// editor to draw chips at the correct RELATIVE size so the preview matches
// reality. `fire` is the big primary; `weapon` is a wide pill.
export const CONTROL_BASE_SIZE: Record<TouchControlId, { w: number; h: number }> = {
  fire: { w: 78, h: 78 },
  reload: { w: 52, h: 52 },
  jump: { w: 52, h: 52 },
  ability: { w: 52, h: 52 },
  crouch: { w: 52, h: 52 },
  melee: { w: 52, h: 52 },
  power: { w: 52, h: 52 },
  weapon: { w: 128, h: 48 },
  pause: { w: 48, h: 48 },
};

// Default arrangement — a clean right-handed mobile-FPS layout: FIRE anchored
// bottom-right with the action cluster fanned to its left, weapon + pause
// top-right, movement joystick living on the (deliberately empty) left half.
export const DEFAULT_LAYOUT: TouchHudLayout = {
  positions: {
    // FIRE anchors the bottom-right corner; the six action buttons sit in a
    // tidy 2-column cluster to its left; weapon + pause ride the top-right.
    // Fractions are spaced so buttons never overlap on any landscape aspect
    // (phone ~2.2 → tablet ~1.33) and the whole left half stays clear for the
    // movement joystick.
    fire: { x: 0.905, y: 0.795 },
    reload: { x: 0.70, y: 0.60 },
    jump: { x: 0.80, y: 0.60 },
    ability: { x: 0.70, y: 0.74 },
    crouch: { x: 0.80, y: 0.74 },
    melee: { x: 0.70, y: 0.88 },
    power: { x: 0.80, y: 0.88 },
    weapon: { x: 0.82, y: 0.095 },
    pause: { x: 0.955, y: 0.095 },
  },
  scale: 1,
  opacity: 1,
  snap: true,
};

const STORAGE_KEY = 'touchHudLayout.v1';
export const SCALE_RANGE = { min: 0.75, max: 1.4 } as const;
export const OPACITY_RANGE = { min: 0.35, max: 1 } as const;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function freshDefault(): TouchHudLayout {
  return {
    positions: structuredClonePositions(DEFAULT_LAYOUT.positions),
    scale: DEFAULT_LAYOUT.scale,
    opacity: DEFAULT_LAYOUT.opacity,
    snap: DEFAULT_LAYOUT.snap,
  };
}

function structuredClonePositions(src: TouchHudLayout['positions']): TouchHudLayout['positions'] {
  const out = {} as TouchHudLayout['positions'];
  for (const id of Object.keys(src) as TouchControlId[]) out[id] = { x: src[id].x, y: src[id].y };
  return out;
}

function sanitize(raw: unknown): TouchHudLayout {
  const out = freshDefault();
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<TouchHudLayout>;
    if (r.positions && typeof r.positions === 'object') {
      for (const id of Object.keys(DEFAULT_LAYOUT.positions) as TouchControlId[]) {
        const p = (r.positions as Record<string, { x: number; y: number }>)[id];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          out.positions[id] = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
        }
      }
    }
    if (Number.isFinite(r.scale)) out.scale = clamp(r.scale as number, SCALE_RANGE.min, SCALE_RANGE.max);
    if (Number.isFinite(r.opacity)) out.opacity = clamp(r.opacity as number, OPACITY_RANGE.min, OPACITY_RANGE.max);
    if (typeof r.snap === 'boolean') out.snap = r.snap;
  }
  return out;
}

function load(): TouchHudLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshDefault();
    return sanitize(JSON.parse(raw));
  } catch {
    return freshDefault();
  }
}

let current: TouchHudLayout = load();
const listeners = new Set<() => void>();

let persistTimer = 0;
function persistNow(): void {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = 0; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* storage full / unavailable */ }
}
function persistDebounced(): void {
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => { persistTimer = 0; persistNow(); }, 200);
}
function emit(): void { listeners.forEach((l) => l()); }

export function getTouchLayout(): TouchHudLayout { return current; }

/** Move a control. `commit` persists immediately (default); during a live drag
 *  pass `false` so writes are debounced, then call the setter once more on
 *  release (or any committing setter) to flush. */
export function setControlPosition(id: TouchControlId, x: number, y: number, commit = true): void {
  current = { ...current, positions: { ...current.positions, [id]: { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } } };
  if (commit) persistNow(); else persistDebounced();
  emit();
}

/** Bulk-set multiple control positions in one commit (auto-arrange / resolve). */
export function applyPositions(next: Partial<Record<TouchControlId, { x: number; y: number }>>): void {
  const positions = { ...current.positions };
  for (const id of Object.keys(next) as TouchControlId[]) {
    const p = next[id];
    if (p) positions[id] = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) };
  }
  current = { ...current, positions };
  persistNow();
  emit();
}

export function setLayoutSnap(snap: boolean): void {
  current = { ...current, snap };
  persistNow();
  emit();
}

export function setLayoutScale(scale: number): void {
  current = { ...current, scale: clamp(scale, SCALE_RANGE.min, SCALE_RANGE.max) };
  persistNow();
  emit();
}

export function setLayoutOpacity(opacity: number): void {
  current = { ...current, opacity: clamp(opacity, OPACITY_RANGE.min, OPACITY_RANGE.max) };
  persistNow();
  emit();
}

export function resetTouchLayout(): void {
  current = freshDefault();
  persistNow();
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Live-updating layout snapshot for React components. */
export function useTouchLayout(): TouchHudLayout {
  return useSyncExternalStore(subscribe, getTouchLayout, getTouchLayout);
}
