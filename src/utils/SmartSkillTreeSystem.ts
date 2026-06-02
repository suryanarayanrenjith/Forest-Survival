/**
 * SMART SKILL TREE SYSTEM
 *
 * An AI-powered progression system that adapts to player playstyle and
 * provides personalized skill recommendations. Features multiple skill
 * paths, synergies, and intelligent suggestions based on performance.
 *
 * Features:
 * - Dynamic skill recommendations
 * - Playstyle detection
 * - Skill synergy system
 * - Progressive unlocks
 * - Respec capability
 */

export type SkillCategory = 'combat' | 'survival' | 'mobility' | 'tactical' | 'support';
export type PlayStyle = 'aggressive' | 'defensive' | 'balanced' | 'tactical' | 'speedrunner';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  tier: number; // 1-5
  cost: number; // Skill points required
  maxLevel: number;
  currentLevel: number;
  icon: string;
  effects: SkillEffect[];
  requirements: SkillRequirement[];
  synergiesWith: string[]; // Other skill IDs
  recommendedFor: PlayStyle[];
}

export interface SkillEffect {
  type: 'stat_boost' | 'unlock' | 'passive' | 'active';
  stat?: string; // e.g., 'maxHealth', 'moveSpeed', 'damage'
  value: number;
  perLevel?: number; // Increase per level
  description: string;
}

export interface SkillRequirement {
  type: 'skill' | 'level' | 'kills' | 'achievement';
  value: string | number;
}

export interface SkillTreeState {
  totalPoints: number;
  spentPoints: number;
  availablePoints: number;
  playerLevel: number;
  unlockedSkills: Map<string, number>; // skillId -> level
  detectedPlayStyle: PlayStyle;
  recommendations: string[]; // Skill IDs
}

export class SmartSkillTreeSystem {
  private skills: Map<string, Skill> = new Map();
  private state: SkillTreeState;
  private playerStats: {
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
    accuracy: number;
    timeAlive: number;
    abilitiesUsed: number;
    powerUpsCollected: number;
  };

  constructor() {
    this.state = {
      totalPoints: 0,
      spentPoints: 0,
      availablePoints: 0,
      playerLevel: 1,
      unlockedSkills: new Map(),
      detectedPlayStyle: 'balanced',
      recommendations: []
    };

    this.playerStats = {
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      damageTaken: 0,
      accuracy: 0,
      timeAlive: 0,
      abilitiesUsed: 0,
      powerUpsCollected: 0
    };

    this.initializeSkillTree();
  }

  private initializeSkillTree(): void {
    // Every skill below is read by the game loop and applies a real, visible
    // effect. Unwireable / placeholder skills (sprint_efficiency, ability_*,
    // tactical_reload, survivor_instinct, ammo_conservation, lucky) were
    // removed so the tree only shows real, working choices.
    //
    // NOTE: there is intentionally NO health-regeneration skill. By design HP
    // never regenerates — Thick Skin only raises the max. So the survival path
    // is Thick Skin (more HP) → Armor Plating (take less damage).

    // === COMBAT ===
    this.addSkill({
      id: 'improved_accuracy',
      name: 'Steady Hands',
      description: 'Tighter bullet spread on every weapon.',
      category: 'combat',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🎯',
      effects: [
        { type: 'stat_boost', stat: 'accuracy', value: 0.15, perLevel: 0.15, description: '+15% accuracy per level' },
      ],
      requirements: [],
      synergiesWith: ['headshot_mastery', 'quickdraw'],
      recommendedFor: ['aggressive', 'tactical'],
    });

    this.addSkill({
      id: 'headshot_mastery',
      name: 'Headshot Mastery',
      description: 'Headshots deal far more bonus damage.',
      category: 'combat',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '💀',
      effects: [
        { type: 'stat_boost', stat: 'headshotDamage', value: 0.3, perLevel: 0.3, description: '+30% headshot bonus damage per level' },
      ],
      requirements: [{ type: 'skill', value: 'improved_accuracy' }],
      synergiesWith: ['improved_accuracy'],
      recommendedFor: ['aggressive', 'tactical'],
    });

    this.addSkill({
      id: 'quickdraw',
      name: 'Quickdraw',
      description: 'Reload your weapon noticeably faster.',
      category: 'combat',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '⚡',
      effects: [
        { type: 'stat_boost', stat: 'reloadSpeed', value: 0.15, perLevel: 0.15, description: '+15% reload speed per level' },
      ],
      requirements: [{ type: 'skill', value: 'improved_accuracy' }],
      synergiesWith: [],
      recommendedFor: ['aggressive', 'speedrunner'],
    });

    this.addSkill({
      id: 'damage_boost',
      name: 'Heavy Hitter',
      description: 'Every bullet hits harder.',
      category: 'combat',
      tier: 3,
      cost: 3,
      maxLevel: 5,
      currentLevel: 0,
      icon: '💥',
      effects: [
        { type: 'stat_boost', stat: 'weaponDamage', value: 0.1, perLevel: 0.1, description: '+10% weapon damage per level' },
      ],
      requirements: [{ type: 'skill', value: 'headshot_mastery' }],
      synergiesWith: ['headshot_mastery'],
      recommendedFor: ['aggressive'],
    });

    // === SURVIVAL ===
    this.addSkill({
      id: 'thick_skin',
      name: 'Thick Skin',
      description: 'Raises your maximum health.',
      category: 'survival',
      tier: 1,
      cost: 1,
      maxLevel: 5,
      currentLevel: 0,
      icon: '❤️',
      effects: [
        { type: 'stat_boost', stat: 'maxHealth', value: 15, perLevel: 15, description: '+15 max health per level' },
      ],
      requirements: [],
      synergiesWith: ['damage_reduction'],
      recommendedFor: ['defensive', 'balanced'],
    });

    this.addSkill({
      id: 'damage_reduction',
      name: 'Armor Plating',
      description: 'Reduce all incoming damage from enemies.',
      category: 'survival',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🛡️',
      effects: [
        { type: 'stat_boost', stat: 'damageReduction', value: 0.1, perLevel: 0.1, description: '+10% damage reduction per level' },
      ],
      requirements: [{ type: 'skill', value: 'thick_skin' }],
      synergiesWith: ['thick_skin'],
      recommendedFor: ['defensive'],
    });

    // === MOBILITY ===
    this.addSkill({
      id: 'fleet_footed',
      name: 'Fleet Footed',
      description: 'Move faster on foot.',
      category: 'mobility',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '👟',
      effects: [
        { type: 'stat_boost', stat: 'moveSpeed', value: 0.08, perLevel: 0.08, description: '+8% movement speed per level' },
      ],
      requirements: [],
      synergiesWith: ['dash_mastery'],
      recommendedFor: ['speedrunner', 'tactical'],
    });

    this.addSkill({
      id: 'dash_mastery',
      name: 'Dash Mastery',
      description: 'Cuts the dash cooldown — dash more often.',
      category: 'mobility',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '💨',
      effects: [
        { type: 'stat_boost', stat: 'dashCooldown', value: -0.15, perLevel: -0.15, description: '-15% dash cooldown per level' },
      ],
      requirements: [{ type: 'skill', value: 'fleet_footed' }],
      synergiesWith: ['fleet_footed'],
      recommendedFor: ['speedrunner', 'aggressive'],
    });

    // === SUPPORT ===
    this.addSkill({
      id: 'scavenger',
      name: 'Scavenger',
      description: 'Enemies drop ammo more often when killed.',
      category: 'support',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '📦',
      effects: [
        { type: 'stat_boost', stat: 'powerupSpawnRate', value: 0.15, perLevel: 0.15, description: '+15% drop chance per level' },
      ],
      requirements: [],
      synergiesWith: [],
      recommendedFor: ['balanced', 'speedrunner'],
    });
  }

  private addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  /**
   * Detect player's playstyle based on stats
   */
  public detectPlayStyle(stats: {
    killDeathRatio: number;
    accuracy: number;
    damageRatio: number; // dealt vs taken
    averageSpeed: number;
    abilityUsage: number;
    averageCombatDuration: number;
  }): PlayStyle {
    const scores: Record<PlayStyle, number> = {
      aggressive: 0,
      defensive: 0,
      balanced: 0,
      tactical: 0,
      speedrunner: 0
    };

    // Aggressive: high KD, high damage dealt, low defensive play
    if (stats.killDeathRatio > 3) scores.aggressive += 3;
    if (stats.damageRatio > 2.5) scores.aggressive += 2;
    if (stats.averageCombatDuration < 3) scores.aggressive += 1;

    // Defensive: high survival, low damage taken
    if (stats.killDeathRatio > 2 && stats.damageRatio > 1.5) scores.defensive += 2;
    if (stats.damageRatio < 1.2) scores.defensive -= 2;
    if (stats.averageCombatDuration > 7) scores.defensive += 2;

    // Tactical: high ability usage, good accuracy
    if (stats.abilityUsage > 5) scores.tactical += 3;
    if (stats.accuracy > 0.6) scores.tactical += 2;

    // Speedrunner: high speed, fast kills
    if (stats.averageSpeed > 0.5) scores.speedrunner += 2;
    if (stats.averageCombatDuration < 2) scores.speedrunner += 2;
    if (stats.abilityUsage > 3) scores.speedrunner += 1;

    // Balanced: moderate in all areas
    scores.balanced = Math.min(
      stats.killDeathRatio,
      stats.accuracy * 10,
      stats.damageRatio,
      stats.abilityUsage
    );

    // Find highest score
    let maxScore = -1;
    let detectedStyle: PlayStyle = 'balanced';

    for (const [style, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedStyle = style as PlayStyle;
      }
    }

    this.state.detectedPlayStyle = detectedStyle;

    return detectedStyle;
  }

  /**
   * Generate personalized skill recommendations
   */
  public generateRecommendations(playStyle?: PlayStyle): string[] {
    const style = playStyle || this.state.detectedPlayStyle;
    const recommendations: Array<{skillId: string, score: number}> = [];

    for (const [skillId, skill] of this.skills.entries()) {
      // Skip if already maxed
      if (skill.currentLevel >= skill.maxLevel) continue;

      // Skip if can't afford
      if (this.state.availablePoints < skill.cost) continue;

      // Skip if requirements not met
      if (!this.meetsRequirements(skill)) continue;

      let score = 0;

      // Base score: recommended for playstyle
      if (skill.recommendedFor.includes(style)) {
        score += 10;
      }

      // Synergy bonus: already have synergistic skills
      for (const synergySkill of skill.synergiesWith) {
        if (this.state.unlockedSkills.has(synergySkill)) {
          score += 5;
        }
      }

      // Lower tier = higher priority
      score += (6 - skill.tier) * 2;

      // Favor skills that enhance current strengths
      if (style === 'aggressive' && skill.category === 'combat') score += 8;
      if (style === 'defensive' && skill.category === 'survival') score += 8;
      if (style === 'tactical' && skill.category === 'tactical') score += 8;
      if (style === 'speedrunner' && skill.category === 'mobility') score += 8;

      recommendations.push({skillId, score});
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    // Return top 5
    const topRecommendations = recommendations.slice(0, 5).map(r => r.skillId);
    this.state.recommendations = topRecommendations;

    return topRecommendations;
  }

  /**
   * Unlock/upgrade a skill
   */
  public unlockSkill(skillId: string): {success: boolean, message: string} {
    const skill = this.skills.get(skillId);

    if (!skill) {
      return {success: false, message: 'Skill not found'};
    }

    if (skill.currentLevel >= skill.maxLevel) {
      return {success: false, message: 'Skill already maxed'};
    }

    if (this.state.availablePoints < skill.cost) {
      return {success: false, message: 'Not enough skill points'};
    }

    if (!this.meetsRequirements(skill)) {
      return {success: false, message: 'Requirements not met'};
    }

    // Unlock/upgrade
    skill.currentLevel++;
    this.state.unlockedSkills.set(skillId, skill.currentLevel);
    this.state.availablePoints -= skill.cost;
    this.state.spentPoints += skill.cost;


    return {
      success: true,
      message: `${skill.name} upgraded to level ${skill.currentLevel}!`
    };
  }

  private meetsRequirements(skill: Skill): boolean {
    for (const req of skill.requirements) {
      if (req.type === 'skill') {
        const requiredSkill = req.value as string;
        if (!this.state.unlockedSkills.has(requiredSkill)) {
          return false;
        }
      } else if (req.type === 'level') {
        if (this.state.playerLevel < (req.value as number)) {
          return false;
        }
      } else if (req.type === 'kills') {
        if (this.playerStats.kills < (req.value as number)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Award skill points (e.g., on level up)
   */
  public awardPoints(amount: number): void {
    this.state.totalPoints += amount;
    this.state.availablePoints += amount;
  }

  /**
   * Level up player
   */
  public levelUp(): void {
    this.state.playerLevel++;
    this.awardPoints(1); // 1 point per level
  }

  /**
   * Calculate total stat bonuses from skills
   */
  public calculateStatBonuses(): Record<string, number> {
    const bonuses: Record<string, number> = {};

    for (const [skillId, level] of this.state.unlockedSkills.entries()) {
      const skill = this.skills.get(skillId);
      if (!skill) continue;

      for (const effect of skill.effects) {
        if (effect.type === 'stat_boost' && effect.stat) {
          const bonus = effect.value + (effect.perLevel || 0) * (level - 1);
          bonuses[effect.stat] = (bonuses[effect.stat] || 0) + bonus;
        }
      }
    }

    return bonuses;
  }

  /**
   * Get skill by ID
   */
  public getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * Get all skills by category
   */
  public getSkillsByCategory(category: SkillCategory): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.category === category);
  }

  /**
   * Get all skills
   */
  public getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all unlocked skills
   */
  public getUnlockedSkills(): Skill[] {
    const unlocked: Skill[] = [];
    for (const skillId of this.state.unlockedSkills.keys()) {
      const skill = this.skills.get(skillId);
      if (skill) unlocked.push(skill);
    }
    return unlocked;
  }

  /**
   * Get current state
   */
  public getState(): SkillTreeState {
    return { ...this.state };
  }

  /**
   * Update player stats for playstyle detection
   */
  public updateStats(stats: Partial<typeof this.playerStats>): void {
    Object.assign(this.playerStats, stats);
  }

  /**
   * Load persisted progression from the DB into the live system. Sets each
   * skill's level, recomputes spent points, and applies the player's available
   * points. Called once at match start for authenticated players so unlocked
   * skills apply from the first frame.
   */
  public hydrate(skills: Record<string, number>, availablePoints: number): void {
    this.state.unlockedSkills.clear();
    for (const skill of this.skills.values()) {
      skill.currentLevel = 0;
    }

    let spent = 0;
    for (const [skillId, rawLevel] of Object.entries(skills)) {
      const skill = this.skills.get(skillId);
      if (!skill || rawLevel <= 0) continue;
      const level = Math.min(Math.floor(rawLevel), skill.maxLevel);
      skill.currentLevel = level;
      this.state.unlockedSkills.set(skillId, level);
      spent += skill.cost * level;
    }

    this.state.spentPoints = spent;
    this.state.availablePoints = Math.max(0, Math.floor(availablePoints));
    this.state.totalPoints = this.state.availablePoints + spent;
  }

  /**
   * Reset skill tree (respec)
   */
  public reset(refundPoints: boolean = true): void {
    if (refundPoints) {
      this.state.availablePoints = this.state.totalPoints;
      this.state.spentPoints = 0;
    }

    this.state.unlockedSkills.clear();

    // Reset all skill levels
    for (const skill of this.skills.values()) {
      skill.currentLevel = 0;
    }

  }
}
