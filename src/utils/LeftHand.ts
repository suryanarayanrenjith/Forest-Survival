/**
 * THE LEFT HAND — one arbiter for everything the off-hand can hold.
 * ==================================================================
 *
 * The right hand always has the weapon. The LEFT hand is contested: it throws
 * every throwable, braces the riot shield, holds the Engineer's detonator,
 * works each class's ability prop, hauls the Operative's charging handle, and
 * feeds a two-handed reload. It can only do one of those at a time, so every
 * system asks the SAME question — "what's in the left hand?" — instead of each
 * keeping its own partial list (which is how a throw used to slip past the
 * retune or a dash).
 *
 * Two kinds of gear:
 *   • PERSISTENT — the player keeps it until they act or it runs out (the
 *     braced shield, a live detonator). A throw is REFUSED, with feedback
 *     that says how to free the hand. Keep the key held and the throw goes
 *     the moment the hand is free.
 *   • TRANSIENT — a beat that ends by itself (wiring, an ability prop, the
 *     retune, a reload, a melee swing, a dash). A throw pressed during it is
 *     QUEUED and fires as soon as the hand comes free, so a quick press is
 *     never eaten.
 *
 * App owns the state (it's all render-loop locals); this module owns the
 * policy and the words.
 */
export type LeftHandGear =
  | 'throwable' // a throw is already in the hand
  | 'detonator' // Engineer: a wired bomb's firing device
  | 'shield'    // the braced riot shield (pickup, Bulwark, Juggernaut)
  | 'wiring'    // Engineer: bent over a barrel, wiring it
  | 'ability'   // a class ability prop / the dash charge lever
  | 'retune'    // Operative: support hand on the regulator + charging handle
  | 'reload'    // a two-handed reload
  | 'melee';    // a gun-butt swing

const PERSISTENT: ReadonlySet<LeftHandGear> = new Set<LeftHandGear>(['detonator', 'shield']);

/** Gear the player keeps until they act — a throw is refused, not queued. */
export const isPersistentGear = (gear: LeftHandGear): boolean => PERSISTENT.has(gear);

/**
 * How long a throw pressed during transient gear waits for the hand (ms).
 * Short beats (a swing, a prop, the retune) get a brief window; a reload can
 * run for seconds, so a throw queued behind one waits for the reload to end.
 */
export const throwBufferMs = (gear: LeftHandGear): number => (gear === 'reload' ? 4500 : 750);
/** How long an ability pressed mid-throw waits for the throw to finish (ms). */
export const ABILITY_BUFFER_MS = 1500;

/** Short HUD tag for the gear holding the hand. */
export const LEFT_HAND_TAG: Record<LeftHandGear, string> = {
  throwable: 'Throwing',
  detonator: 'Detonator',
  shield: 'Shield',
  wiring: 'Wiring',
  ability: 'Ability',
  retune: 'Retune',
  reload: 'Reload',
  melee: 'Melee',
};

/**
 * Why a throw was refused, in the player's terms — what's in the hand and how
 * to free it. Only persistent gear is ever refused.
 */
export function refusedThrowMessage(gear: LeftHandGear, ctx: { shieldSecondsLeft: number; abilityKey: string }): string {
  if (gear === 'detonator') return `Left hand is on the detonator — detonate (${ctx.abilityKey}) to throw`;
  if (gear === 'shield') {
    const s = Math.max(1, Math.ceil(ctx.shieldSecondsLeft));
    return `Left hand is braced on the shield — free in ${s}s`;
  }
  return `Left hand busy — ${LEFT_HAND_TAG[gear].toLowerCase()}`;
}
