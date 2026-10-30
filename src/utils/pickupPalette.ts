import type { PowerUp } from '../types/game';
import type { PowerUpType as AirdropReward } from './EnhancedPowerUps';
import { AMMO, isGunKey } from './AmmoSystem';
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
  ammo_pack: 0xffb13d,
};

/** The identity colour of a pickup (throwables and ammo use their catalog colour). */
export function pickupColor(type: PowerUp['type'], grenadeKind?: ThrowableKind, ammoWeapon?: string): number {
  if (type === 'grenade' && grenadeKind) return parseInt(THROWABLES[grenadeKind].color.slice(1), 16);
  if (type === 'ammo_pack' && ammoWeapon && isGunKey(ammoWeapon)) return AMMO[ammoWeapon].color;
  return PICKUP_COLOR[type];
}

/** The same colour as a CSS hex string. */
export function pickupCss(type: PowerUp['type'], grenadeKind?: ThrowableKind, ammoWeapon?: string): string {
  return `#${pickupColor(type, grenadeKind, ammoWeapon).toString(16).padStart(6, '0')}`;
}

/**
 * KILLSTREAK AIRDROPS — the same idea for the parachuted reward crates: one
 * name + one hue per reward, shared by the "inbound" announcement, the crate's
 * glow and the look-at tag. Shared families keep their pickup hue (a Health
 * Pack crate glows the same green as a health pickup).
 */
export const AIRDROP_LABEL: Record<AirdropReward, string> = {
  health: 'Health Pack', ammo: 'Ammo Crate', speed: 'Speed Boost', damage: 'Damage Boost',
  shield: 'Shield', invincible: 'Invincibility', infinite_ammo: 'Infinite Ammo',
  rapid_fire: 'Rapid Fire', nuke: 'Tactical Nuke', random_weapon: 'Mystery Box',
  frenzy: 'Frenzy', juggernaut: 'Juggernaut',
};
export const AIRDROP_COLOR: Record<AirdropReward, number> = {
  health: PICKUP_COLOR.health, ammo: PICKUP_COLOR.ammo, speed: PICKUP_COLOR.speed,
  damage: PICKUP_COLOR.damage, shield: PICKUP_COLOR.shield, invincible: 0xffe066,
  infinite_ammo: PICKUP_COLOR.infinite_ammo, rapid_fire: 0xff9a3c, nuke: PICKUP_COLOR.nuke,
  random_weapon: 0xc58bff, frenzy: 0xff4f8b, juggernaut: 0xa9bdd2,
};
export const airdropCss = (r: AirdropReward): string => `#${AIRDROP_COLOR[r].toString(16).padStart(6, '0')}`;
