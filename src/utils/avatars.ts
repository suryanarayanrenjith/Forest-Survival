import {
  Swords, Shield, Crosshair, Skull, Flame, Snowflake, Zap, Leaf,
  Ghost, Crown, Rocket, Eye, type LucideIcon,
} from 'lucide-react';

/**
 * Predefined, in-code avatar set. The chosen avatar is persisted to Convex as
 * just its integer `id` (index) to save space — no image assets are hosted.
 * Keep this list APPEND-ONLY so saved indices keep pointing at the same avatar.
 */
export interface AvatarDef {
  id: number;
  name: string;
  /** Tailwind gradient classes for the avatar background. */
  gradient: string;
  Icon: LucideIcon;
}

export const AVATARS: AvatarDef[] = [
  { id: 0,  name: 'Vanguard', gradient: 'from-emerald-400 via-green-500 to-teal-600',   Icon: Swords },
  { id: 1,  name: 'Bulwark',  gradient: 'from-sky-400 via-blue-500 to-indigo-600',      Icon: Shield },
  { id: 2,  name: 'Marksman', gradient: 'from-amber-400 via-orange-500 to-red-500',     Icon: Crosshair },
  { id: 3,  name: 'Reaper',   gradient: 'from-slate-300 via-slate-500 to-slate-700',    Icon: Skull },
  { id: 4,  name: 'Pyre',     gradient: 'from-orange-400 via-red-500 to-rose-600',      Icon: Flame },
  { id: 5,  name: 'Frost',    gradient: 'from-cyan-300 via-sky-400 to-blue-500',        Icon: Snowflake },
  { id: 6,  name: 'Volt',     gradient: 'from-yellow-300 via-amber-400 to-orange-500',  Icon: Zap },
  { id: 7,  name: 'Verdant',  gradient: 'from-lime-400 via-emerald-500 to-green-600',   Icon: Leaf },
  { id: 8,  name: 'Phantom',  gradient: 'from-violet-400 via-purple-500 to-fuchsia-600', Icon: Ghost },
  { id: 9,  name: 'Sovereign',gradient: 'from-amber-300 via-yellow-500 to-amber-600',   Icon: Crown },
  { id: 10, name: 'Comet',    gradient: 'from-pink-400 via-rose-500 to-red-500',        Icon: Rocket },
  { id: 11, name: 'Seer',     gradient: 'from-teal-300 via-cyan-500 to-sky-600',        Icon: Eye },
];

export function getAvatar(index: number | null | undefined): AvatarDef {
  if (index === null || index === undefined) return AVATARS[0];
  return AVATARS[index] ?? AVATARS[0];
}
