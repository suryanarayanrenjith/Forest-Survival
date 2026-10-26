import {
  Boxes, Wind, Swords, Shield, Infinity as InfinityIcon, Zap, Ghost, Snowflake, Bolt, Waves,
  Heart, Bomb, type LucideIcon,
} from 'lucide-react';

/**
 * One glyph per looted power — shared by the desktop HUD slot and the touch
 * Power button so both always show the same icon (a missing entry falls back
 * to the generic loot box at the call site).
 */
export const POWER_ICONS: Record<string, LucideIcon> = {
  ammo: Boxes,
  speed: Wind,
  damage: Swords,
  shield: Shield,
  infinite_ammo: InfinityIcon,
  overcharge: Zap,
  phantom: Ghost,
  cryo: Snowflake,
  tesla: Bolt,
  shockwave: Waves,
  health: Heart,
  nuke: Bomb,
};
