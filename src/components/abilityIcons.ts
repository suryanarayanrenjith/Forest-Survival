import {
  ChevronsRight, Wind, Shield, Crosshair, Flame, Heart,
  Infinity as InfinityIcon, Ghost, type LucideIcon,
} from 'lucide-react';
import type { CharacterAbilityId } from '../utils/CharacterAbilityRegistry';

/**
 * Canonical lucide icon for every character ability — shared by the HUD
 * ability slot, the Solo/Tutorial character card, and the multiplayer lobby
 * picker so the same ability always reads with the same mark everywhere
 * (no emoji glyphs anywhere in the UI).
 */
export const ABILITY_ICONS: Record<CharacterAbilityId, LucideIcon> = {
  dash: ChevronsRight,
  adrenaline: Wind,
  bulwark: Shield,
  focusfire: Crosshair,
  firestorm: Flame,
  triage: Heart,
  overclock: InfinityIcon,
  cloak: Ghost,
};

/** Loose-string lookup for HUD slots whose abilityId arrives untyped. */
export function getAbilityIcon(abilityId: string | undefined): LucideIcon {
  return ABILITY_ICONS[(abilityId ?? 'dash') as CharacterAbilityId] ?? ChevronsRight;
}
