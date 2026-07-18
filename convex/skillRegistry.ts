/**
 * Server-authoritative mirror of the skill definitions in
 * src/utils/SmartSkillTreeSystem.ts. Only the fields needed to validate an
 * unlock live here (cost, maxLevel, prerequisite skills). Keep IDs + costs in
 * sync with the client system.
 */
export interface SkillDef {
  cost: number;
  maxLevel: number;
  requires: string[];
}

/**
 * Safe registry lookup. A plain object literal inherits from Object.prototype,
 * so `SKILL_REGISTRY["constructor"]` (or "toString", "__proto__", …) returns a
 * TRUTHY inherited value that sails past an `if (!def)` guard and then blows up
 * on `def.requires`, surfacing to the player as an opaque "Server Error".
 * Always resolve skills through this — never index the record directly.
 */
export function getSkillDef(skillId: string): SkillDef | null {
  if (!Object.prototype.hasOwnProperty.call(SKILL_REGISTRY, skillId)) return null;
  const def = SKILL_REGISTRY[skillId];
  // Shape check so a malformed entry fails as a clean "unknown skill" too.
  return def && Array.isArray(def.requires) && typeof def.cost === "number" && typeof def.maxLevel === "number"
    ? def
    : null;
}

export const SKILL_REGISTRY: Record<string, SkillDef> = {
  improved_accuracy: { cost: 1, maxLevel: 3, requires: [] },
  headshot_mastery: { cost: 2, maxLevel: 3, requires: ["improved_accuracy"] },
  quickdraw: { cost: 2, maxLevel: 3, requires: ["improved_accuracy"] },
  damage_boost: { cost: 3, maxLevel: 5, requires: ["headshot_mastery"] },
  thick_skin: { cost: 1, maxLevel: 5, requires: [] },
  damage_reduction: { cost: 2, maxLevel: 3, requires: ["thick_skin"] },
  fleet_footed: { cost: 1, maxLevel: 3, requires: [] },
  dash_mastery: { cost: 2, maxLevel: 3, requires: ["fleet_footed"] },
  scavenger: { cost: 1, maxLevel: 3, requires: [] },
};
