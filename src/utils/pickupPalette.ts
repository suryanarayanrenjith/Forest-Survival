import type { PowerUp } from '../types/game';
import { THROWABLES, type ThrowableKind } from './Throwables';

/**
 * PICKUP IDENTITY COLOURS — one hue per kind of loot, used everywhere a pickup
 * shows up: the small glow around the item and the pool of light under it,
 * its blip on the radar, and the name tag when you look at it. Families stay
 * apart at a glance (green = health, amber = ammo, blue = defence, red =
 * damage, cyan = movement, violet = stealth …); throwables take their own
 * catalog colour so the HUD pouch and the world agree.
 */
export const PICKUP_COLOR: Record<PowerUp['type'], number> = {
  health: 0x3ee07f,
  ammo: 0xffb13d,
  speed: 0x35d6f5,
  damage: 0xff5a45,
  shield: 0x4d8dff,
  infinite_ammo: 0xffd84a,
  overcharge: 0xff8a2a,
  phantom: 0xae86ff,
  cryo: 0x8ff0ff,
  tesla: 0x7c86ff,
  shockwave: 0xffe28a,
  nuke: 0xb4ff2e,
  grenade: 0xd9c27a,
};

/** The identity colour of a pickup (throwables use their catalog colour). */
export function pickupColor(type: PowerUp['type'], grenadeKind?: ThrowableKind): number {
  if (type === 'grenade' && grenadeKind) return parseInt(THROWABLES[grenadeKind].color.slice(1), 16);
  return PICKUP_COLOR[type];
}

/** The same colour as a CSS hex string. */
export function pickupCss(type: PowerUp['type'], grenadeKind?: ThrowableKind): string {
  return `#${pickupColor(type, grenadeKind).toString(16).padStart(6, '0')}`;
}
