// Multiplayer Character Passives.
//
// Each of the 8 lobby characters now ships with a small mechanical perk on top
// of its visual identity. They're INTENTIONALLY mild (single-digit
// percentages, no game-warping multipliers) — multiplayer character choice is
// flavour first, build statement second.
//
// The active passive is read once on scene init (in App.tsx multiplayer
// branch) and folded into the per-frame stat snapshot alongside the skill
// tree and wave perks.

import type { ClassId } from './CharacterModels';

export interface CharacterPassive {
  classId: ClassId;
  /** Player-facing label shown in the lobby card. */
  label: string;
  /** One-line description, also lobby-facing. */
  description: string;
  mods: {
    /** +X% to max HP (e.g. 0.20 = +20%). */
    maxHpMult?: number;
    /** +X% to base movement speed. */
    speedMult?: number;
    /** Flat HP/sec passive regen. */
    regenPerSec?: number;
    /** +X% to headshot damage. */
    headshotDmgMult?: number;
    /** -X% reload time. */
    reloadSpeedMult?: number;
    /** -X% to dash cooldown. */
    dashCooldownMult?: number;
    /** +X% to phantom power-up duration. */
    phantomDurationMult?: number;
    /** When true, every bullet hit applies a small burn DOT. */
    burningBullets?: boolean;
  };
}

export const CHARACTER_PASSIVES: Record<ClassId, CharacterPassive> = {
  ranger: {
    classId: 'ranger',
    label: 'Light Footed',
    description: '−10% dash cooldown.',
    mods: { dashCooldownMult: 0.90 },
  },
  scout: {
    classId: 'scout',
    label: 'Sprinter',
    description: '+12% movement speed.',
    mods: { speedMult: 1.12 },
  },
  heavy: {
    classId: 'heavy',
    label: 'Plated',
    description: '+20% max HP, −8% speed.',
    mods: { maxHpMult: 1.20, speedMult: 0.92 },
  },
  operative: {
    classId: 'operative',
    label: 'Crit Trained',
    description: '+10% headshot damage.',
    mods: { headshotDmgMult: 1.10 },
  },
  pyro: {
    classId: 'pyro',
    label: 'Burning Bullets',
    description: 'Bullets apply a small burn DOT.',
    mods: { burningBullets: true },
  },
  medic: {
    classId: 'medic',
    label: 'Field Triage',
    description: 'Regenerate 0.5 HP / sec out of combat.',
    mods: { regenPerSec: 0.5 },
  },
  engineer: {
    classId: 'engineer',
    label: 'Quick Hands',
    description: '−15% reload time.',
    mods: { reloadSpeedMult: 0.85 },
  },
  phantom: {
    classId: 'phantom',
    label: 'Long Cloak',
    description: '+15% Phantom power-up duration.',
    mods: { phantomDurationMult: 1.15 },
  },
};
