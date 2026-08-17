// Character Active Abilities.
//
// Every one of the 8 characters now carries a SIGNATURE ACTIVE ABILITY on top
// of its mild passive (see CharacterPassiveRegistry) and its unique silhouette
// / shadow (see CharacterModels). The ability is triggered by the bound dash /
// ability key and gated by a per-ability cooldown.
//
// Balance philosophy — every ability is tuned to roughly the same power budget
// over time; cooldown scales with impact:
//   • Pure-mobility bursts (Dash) get the SHORTEST cooldown.
//   • Sustained buffs / defence / heals / AoE nukes get LONGER cooldowns.
// None of them is a hard-counter or a run-warping multiplier — they are a
// flavour-forward "signature move", not a build-defining power spike.
//
// The active ability is resolved once on scene init (App.tsx) from the player's
// class — the lobby pick in multiplayer, the Solo/Tutorial character selector
// otherwise — so the SAME logic drives every game mode.

import type { ClassId } from './CharacterModels';

export type CharacterAbilityId =
  | 'dash'        // ranger    — mobility burst
  | 'adrenaline'  // scout     — speed surge
  | 'bulwark'     // heavy     — frontal damage shield
  | 'overclock'   // operative — overclocked gun: fire-rate + damage + unlimited ammo
  | 'firestorm'   // pyro      — AoE shockwave nuke
  | 'triage'      // medic     — instant self-heal
  | 'demolition'  // engineer  — wire a barrel into a remote bomb, detonate on demand
  | 'cloak';      // phantom   — intangible stealth

export interface CharacterAbility {
  id: CharacterAbilityId;
  classId: ClassId;
  /** Player-facing label (HUD + character card). */
  name: string;
  /** One-line description for the character card. */
  description: string;
  /** Cooldown in seconds. */
  cooldown: number;
  /** Active duration in seconds (0 = instant / no lingering effect). */
  duration: number;
  /** Accent colour (HUD slot + card). */
  color: string;
  /** Default body colour for the Solo/Tutorial shadow caster. */
  shadowColor: number;
  /**
   * Per-character jump-height multiplier (movement feel / identity). Centred on
   * 1.0 and kept in a tight band (0.94–1.06) so it differentiates characters
   * without being a balance-warping mobility advantage. Stacks on top of the
   * weapon-weight jump multiplier.
   */
  jumpMult: number;
}

export const CHARACTER_ABILITIES: Record<ClassId, CharacterAbility> = {
  ranger: {
    id: 'dash', classId: 'ranger',
    name: 'Dash',
    description: 'Yank the hip actuator and charge — robots in your path are bowled over and trampled.',
    cooldown: 5, duration: 0, color: '#22d3ee', shadowColor: 0x3f7a2a, jumpMult: 1.0,
  },
  scout: {
    id: 'adrenaline', classId: 'scout',
    name: 'Adrenaline',
    description: 'Slam a combat stim into your neck for a 1.75× movement-speed surge.',
    cooldown: 11, duration: 4, color: '#f6b53b', shadowColor: 0xf6b53b, jumpMult: 1.06,
  },
  heavy: {
    id: 'bulwark', classId: 'heavy',
    name: 'Bulwark',
    description: 'Snap a collapsible ballistic shield open — it soaks frontal damage until it breaks.',
    cooldown: 15, duration: 5, color: '#e0564f', shadowColor: 0xb02b2b, jumpMult: 0.94,
  },
  operative: {
    id: 'overclock', classId: 'operative',
    name: 'Overclock',
    description: 'Retune the weapon in your hands — relentless fire rate, bigger hits and unlimited ammo.',
    cooldown: 15, duration: 5, color: '#fbbf24', shadowColor: 0x3a3f4a, jumpMult: 1.02,
  },
  pyro: {
    id: 'firestorm', classId: 'pyro',
    name: 'Firestorm',
    description: 'Open a 360° flame projector — the ground catches and anything caught keeps burning.',
    cooldown: 13, duration: 0, color: '#ff7a33', shadowColor: 0xd96528, jumpMult: 0.98,
  },
  medic: {
    id: 'triage', classId: 'medic',
    name: 'Field Triage',
    description: 'Work a field case open and put an auto-injector in — a quick stabiliser, not a full heal.',
    cooldown: 14, duration: 0, color: '#19c37d', shadowColor: 0xc91a1a, jumpMult: 1.0,
  },
  engineer: {
    id: 'demolition', classId: 'engineer',
    name: 'Demolition',
    description: 'Wire a nearby barrel into a remote bomb — then thumb the plunger when robots crowd in.',
    cooldown: 12, duration: 0, color: '#ff5a36', shadowColor: 0xc78a2a, jumpMult: 0.96,
  },
  phantom: {
    id: 'cloak', classId: 'phantom',
    name: 'Cloak',
    description: 'Throw the bracer toggle — vanish and phase through enemies, breaking their tracking.',
    cooldown: 15, duration: 4, color: '#a06bff', shadowColor: 0x7c33ff, jumpMult: 1.04,
  },
};

export function getCharacterAbility(classId: ClassId | null | undefined): CharacterAbility {
  return (classId && CHARACTER_ABILITIES[classId]) || CHARACTER_ABILITIES.ranger;
}
