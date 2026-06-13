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
  | 'focusfire'   // operative — fire-rate + damage burst
  | 'firestorm'   // pyro      — AoE shockwave nuke
  | 'triage'      // medic     — instant self-heal
  | 'overclock'   // engineer  — instant reload + unlimited ammo
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
    description: 'Charge forward with crushing force — robots in your path are bowled over and trampled.',
    cooldown: 5, duration: 0, color: '#22d3ee', shadowColor: 0x3f7a2a, jumpMult: 1.0,
  },
  scout: {
    id: 'adrenaline', classId: 'scout',
    name: 'Adrenaline',
    description: 'Kick into a 1.75× movement-speed surge for a few seconds.',
    cooldown: 11, duration: 4, color: '#f6b53b', shadowColor: 0xf6b53b, jumpMult: 1.06,
  },
  heavy: {
    id: 'bulwark', classId: 'heavy',
    name: 'Bulwark',
    description: 'Brace a riot shield that soaks frontal damage until it breaks.',
    cooldown: 15, duration: 5, color: '#e0564f', shadowColor: 0xb02b2b, jumpMult: 0.94,
  },
  operative: {
    id: 'focusfire', classId: 'operative',
    name: 'Focus Fire',
    description: 'Overclock your weapon — faster fire rate and bigger damage.',
    cooldown: 15, duration: 5, color: '#9aa3b2', shadowColor: 0x3a3f4a, jumpMult: 1.02,
  },
  pyro: {
    id: 'firestorm', classId: 'pyro',
    name: 'Firestorm',
    description: 'Detonate a fiery shockwave that scorches everything nearby.',
    cooldown: 13, duration: 0, color: '#ff7a33', shadowColor: 0xd96528, jumpMult: 0.98,
  },
  medic: {
    id: 'triage', classId: 'medic',
    name: 'Field Triage',
    description: 'Patch a little health back — a quick field stabiliser, not a full heal.',
    cooldown: 14, duration: 0, color: '#19c37d', shadowColor: 0xc91a1a, jumpMult: 1.0,
  },
  engineer: {
    id: 'overclock', classId: 'engineer',
    name: 'Overclock',
    description: 'Snap-reload, then fire with unlimited ammo for a few seconds.',
    cooldown: 14, duration: 4, color: '#e0a84a', shadowColor: 0xc78a2a, jumpMult: 0.96,
  },
  phantom: {
    id: 'cloak', classId: 'phantom',
    name: 'Cloak',
    description: 'Vanish and phase through enemies, breaking their tracking.',
    cooldown: 15, duration: 4, color: '#a06bff', shadowColor: 0x7c33ff, jumpMult: 1.04,
  },
};

export function getCharacterAbility(classId: ClassId | null | undefined): CharacterAbility {
  return (classId && CHARACTER_ABILITIES[classId]) || CHARACTER_ABILITIES.ranger;
}
