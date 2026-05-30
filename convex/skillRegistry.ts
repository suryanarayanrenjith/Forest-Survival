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

export const SKILL_REGISTRY: Record<string, SkillDef> = {
  improved_accuracy: { cost: 1, maxLevel: 3, requires: [] },
  headshot_mastery: { cost: 2, maxLevel: 3, requires: ["improved_accuracy"] },
  quickdraw: { cost: 2, maxLevel: 3, requires: ["improved_accuracy"] },
  damage_boost: { cost: 3, maxLevel: 5, requires: ["headshot_mastery"] },
  thick_skin: { cost: 1, maxLevel: 5, requires: [] },
  regeneration: { cost: 2, maxLevel: 3, requires: ["thick_skin"] },
  damage_reduction: { cost: 2, maxLevel: 3, requires: ["thick_skin"] },
  fleet_footed: { cost: 1, maxLevel: 3, requires: [] },
  dash_mastery: { cost: 2, maxLevel: 3, requires: ["fleet_footed"] },
  scavenger: { cost: 1, maxLevel: 3, requires: [] },
};
