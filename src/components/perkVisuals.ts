import {
  Zap, Target, Crosshair, Eye, ScanEye, HeartPulse, Droplet, Droplets, Boxes, Timer, Heart,
  ShieldPlus, Magnet, Bomb, Trophy, Footprints, Wind, RotateCcw, Shield, Gem, Snowflake, Skull,
  Flame, Swords, LifeBuoy, CloudLightning, Package, Activity, type LucideIcon,
} from 'lucide-react';
import type { WavePerk, WavePerkId } from '../utils/WavePerkRegistry';

/**
 * How a wave perk LOOKS, everywhere it appears — the Mystery Box cases, the
 * in-run loadout strip. One distinct glyph per perk (no generic fallbacks) and
 * one rarity palette drawn from the game's own identity: moon-silver for
 * common, aurora for rare, violet for epic (the same violet the achievement
 * toasts use for epic).
 */
export const PERK_ICON: Record<WavePerkId, LucideIcon> = {
  fire_rate_15: Zap,
  fire_rate_30: Zap,
  fire_rate_50: Zap,
  damage_15: Target,
  damage_30: Target,
  damage_50: Target,
  crit_chance_10: Eye,
  crit_chance_25: ScanEye,
  headshot_dmg_25: Crosshair,
  regen_1hps: HeartPulse,
  regen_3hps: Activity,
  lifesteal_3: Droplet,
  lifesteal_6: Droplets,
  vampiric_kill: Droplet,
  max_ammo_50: Boxes,
  dash_cd_30: Timer,
  max_hp_25: Heart,
  max_hp_50: ShieldPlus,
  pickup_radius_2x: Magnet,
  explosive_bullets: Bomb,
  streak_keeper: Trophy,
  move_speed_15: Footprints,
  move_speed_30: Wind,
  reload_30: RotateCcw,
  armor_20: Shield,
  glass_cannon: Gem,
  frost_rounds: Snowflake,
  executioner: Skull,
  berserker_rage: Flame,
  thorns: Swords,
  second_wind: LifeBuoy,
  chain_lightning: CloudLightning,
  scavenger: Package,
  railgun_rounds: Crosshair,
};

export const PERK_RARITY: Record<WavePerk['rarity'], { label: string; color: string }> = {
  common: { label: 'Common', color: '#dfeaff' },
  rare: { label: 'Rare', color: '#39d0e6' },
  epic: { label: 'Epic', color: '#c084fc' },
};
