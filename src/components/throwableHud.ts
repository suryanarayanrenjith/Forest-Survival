import { Bomb, Magnet, Flame, Sword, CloudFog, Zap, Radio, type LucideIcon } from 'lucide-react';
import { THROWABLES, THROWABLE_KINDS, type ThrowableKind } from '../utils/Throwables';

/** Per-throwable HUD icon. */
const THROWABLE_ICONS: Record<ThrowableKind, LucideIcon> = {
  frag: Bomb, sticky: Magnet, thermite: Flame, knife: Sword, smoke: CloudFog, emp: Zap, decoy: Radio,
};

/**
 * Per-kind icon + accent + label for the HUD slot, the touch button and the
 * quick-select wheel (accents and labels live in the Throwables catalog).
 */
export const GRENADE_HUD: Record<ThrowableKind, { icon: LucideIcon; color: string; label: string }> =
  Object.fromEntries(THROWABLE_KINDS.map((k) => [k, { icon: THROWABLE_ICONS[k], color: THROWABLES[k].color, label: THROWABLES[k].label }])) as
    Record<ThrowableKind, { icon: LucideIcon; color: string; label: string }>;
