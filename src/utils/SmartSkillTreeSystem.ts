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
    console.log('[SkillTree] System initialized with ' + this.skills.size + ' skills');
  }

  private initializeSkillTree(): void {
    // COMBAT SKILLS
    this.addSkill({
      id: 'improved_accuracy',
      name: 'Steady Hands',
      description: 'Reduce weapon sway and improve accuracy',
      category: 'combat',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🎯',
      effects: [
        {type: 'stat_boost', stat: 'accuracy', value: 0.05, perLevel: 0.05, description: '+5% accuracy per level'}
      ],
      requirements: [],
      synergiesWith: ['headshot_mastery', 'quickdraw'],
      recommendedFor: ['aggressive', 'tactical']
    });

    this.addSkill({
      id: 'headshot_mastery',
      name: 'Headshot Mastery',
      description: 'Increased headshot damage and critical chance',
      category: 'combat',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '💀',
      effects: [
        {type: 'stat_boost', stat: 'headshotDamage', value: 0.25, perLevel: 0.25, description: '+25% headshot damage per level'}
      ],
      requirements: [{type: 'skill', value: 'improved_accuracy'}],
      synergiesWith: ['improved_accuracy', 'precision_shooter'],
      recommendedFor: ['aggressive', 'tactical']
    });

    this.addSkill({
      id: 'quickdraw',
      name: 'Quickdraw',
      description: 'Faster weapon switching and reload speed',
      category: 'combat',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '⚡',
      effects: [
        {type: 'stat_boost', stat: 'reloadSpeed', value: 0.15, perLevel: 0.1, description: '+15% reload speed per level'},
        {type: 'stat_boost', stat: 'switchSpeed', value: 0.2, perLevel: 0.15, description: '+20% weapon switch speed per level'}
      ],
      requirements: [{type: 'skill', value: 'improved_accuracy'}],
      synergiesWith: ['run_and_gun', 'tactical_reload'],
      recommendedFor: ['aggressive', 'speedrunner']
    });

    this.addSkill({
      id: 'damage_boost',
      name: 'Heavy Hitter',
      description: 'Increase all weapon damage',
      category: 'combat',
      tier: 3,
      cost: 3,
      maxLevel: 5,
      currentLevel: 0,
      icon: '💥',
      effects: [
        {type: 'stat_boost', stat: 'weaponDamage', value: 0.1, perLevel: 0.08, description: '+10% weapon damage per level'}
      ],
      requirements: [{type: 'skill', value: 'headshot_mastery'}, {type: 'level', value: 5}],
      synergiesWith: ['armor_piercing', 'explosive_rounds'],
      recommendedFor: ['aggressive']
    });

    // SURVIVAL SKILLS
    this.addSkill({
      id: 'thick_skin',
      name: 'Thick Skin',
      description: 'Increase maximum health',
      category: 'survival',
      tier: 1,
      cost: 1,
      maxLevel: 5,
      currentLevel: 0,
      icon: '❤️',
      effects: [
        {type: 'stat_boost', stat: 'maxHealth', value: 10, perLevel: 10, description: '+10 max health per level'}
      ],
      requirements: [],
      synergiesWith: ['regeneration', 'damage_reduction'],
      recommendedFor: ['defensive', 'balanced']
    });

    this.addSkill({
      id: 'regeneration',
      name: 'Regeneration',
      description: 'Slowly regenerate health over time',
      category: 'survival',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🔄',
      effects: [
        {type: 'passive', value: 1, perLevel: 1, description: 'Regenerate 1 HP/second per level'}
      ],
      requirements: [{type: 'skill', value: 'thick_skin'}],
      synergiesWith: ['thick_skin', 'survivor_instinct'],
      recommendedFor: ['defensive', 'balanced']
    });

    this.addSkill({
      id: 'damage_reduction',
      name: 'Armor Plating',
      description: 'Reduce damage taken from enemies',
      category: 'survival',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🛡️',
      effects: [
        {type: 'stat_boost', stat: 'damageReduction', value: 0.1, perLevel: 0.08, description: '+10% damage reduction per level'}
      ],
      requirements: [{type: 'skill', value: 'thick_skin'}],
      synergiesWith: ['thick_skin', 'last_stand'],
      recommendedFor: ['defensive']
    });

    this.addSkill({
      id: 'survivor_instinct',
      name: 'Survivor Instinct',
      description: 'Gain temporary damage reduction when health is low',
      category: 'survival',
      tier: 3,
      cost: 3,
      maxLevel: 1,
      currentLevel: 0,
      icon: '⚡',
      effects: [
        {type: 'passive', value: 0.3, description: '30% damage reduction when below 30% health'}
      ],
      requirements: [{type: 'skill', value: 'regeneration'}],
      synergiesWith: ['regeneration', 'second_wind'],
      recommendedFor: ['defensive', 'balanced']
    });

    // MOBILITY SKILLS
    this.addSkill({
      id: 'fleet_footed',
      name: 'Fleet Footed',
      description: 'Increase movement speed',
      category: 'mobility',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '👟',
      effects: [
        {type: 'stat_boost', stat: 'moveSpeed', value: 0.1, perLevel: 0.08, description: '+10% movement speed per level'}
      ],
      requirements: [],
      synergiesWith: ['dash_mastery', 'parkour'],
      recommendedFor: ['speedrunner', 'tactical']
    });

    this.addSkill({
      id: 'dash_mastery',
      name: 'Dash Mastery',
      description: 'Reduce dash cooldown and increase distance',
      category: 'mobility',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '💨',
      effects: [
        {type: 'stat_boost', stat: 'dashCooldown', value: -0.2, perLevel: -0.15, description: '-20% dash cooldown per level'},
        {type: 'stat_boost', stat: 'dashDistance', value: 0.15, perLevel: 0.1, description: '+15% dash distance per level'}
      ],
      requirements: [{type: 'skill', value: 'fleet_footed'}],
      synergiesWith: ['fleet_footed', 'evasive_maneuvers'],
      recommendedFor: ['speedrunner', 'aggressive']
    });

    this.addSkill({
      id: 'sprint_efficiency',
      name: 'Sprint Efficiency',
      description: 'Increased sprint speed and duration',
      category: 'mobility',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🏃',
      effects: [
        {type: 'stat_boost', stat: 'sprintSpeed', value: 0.15, perLevel: 0.1, description: '+15% sprint speed per level'},
        {type: 'stat_boost', stat: 'sprintDuration', value: 0.2, perLevel: 0.15, description: '+20% sprint duration per level'}
      ],
      requirements: [{type: 'skill', value: 'fleet_footed'}],
      synergiesWith: ['dash_mastery', 'run_and_gun'],
      recommendedFor: ['speedrunner']
    });

    // TACTICAL SKILLS
    this.addSkill({
      id: 'ability_haste',
      name: 'Ability Haste',
      description: 'Reduce all ability cooldowns',
      category: 'tactical',
      tier: 1,
      cost: 1,
      maxLevel: 5,
      currentLevel: 0,
      icon: '⏱️',
      effects: [
        {type: 'stat_boost', stat: 'abilityCooldown', value: -0.1, perLevel: -0.08, description: '-10% ability cooldown per level'}
      ],
      requirements: [],
      synergiesWith: ['ability_power', 'tactical_genius'],
      recommendedFor: ['tactical', 'balanced']
    });

    this.addSkill({
      id: 'ability_power',
      name: 'Ability Power',
      description: 'Increase effectiveness of all abilities',
      category: 'tactical',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '✨',
      effects: [
        {type: 'stat_boost', stat: 'abilityPower', value: 0.2, perLevel: 0.15, description: '+20% ability effectiveness per level'}
      ],
      requirements: [{type: 'skill', value: 'ability_haste'}],
      synergiesWith: ['ability_haste', 'energy_shield_boost'],
      recommendedFor: ['tactical']
    });

    this.addSkill({
      id: 'tactical_reload',
      name: 'Tactical Reload',
      description: 'Reloading doesn\'t interrupt ability cooldowns',
      category: 'tactical',
      tier: 3,
      cost: 2,
      maxLevel: 1,
      currentLevel: 0,
      icon: '🔄',
      effects: [
        {type: 'passive', value: 1, description: 'Reload while using abilities'}
      ],
      requirements: [{type: 'skill', value: 'ability_power'}, {type: 'skill', value: 'quickdraw'}],
      synergiesWith: ['quickdraw', 'ability_haste'],
      recommendedFor: ['tactical', 'aggressive']
    });

    // SUPPORT SKILLS
    this.addSkill({
      id: 'scavenger',
      name: 'Scavenger',
      description: 'Increased powerup spawn rate',
      category: 'support',
      tier: 1,
      cost: 1,
      maxLevel: 3,
      currentLevel: 0,
      icon: '📦',
      effects: [
        {type: 'stat_boost', stat: 'powerupSpawnRate', value: 0.15, perLevel: 0.1, description: '+15% powerup spawn rate per level'}
      ],
      requirements: [],
      synergiesWith: ['lucky', 'ammo_conservation'],
      recommendedFor: ['balanced', 'speedrunner']
    });

    this.addSkill({
      id: 'ammo_conservation',
      name: 'Ammo Conservation',
      description: 'Chance to not consume ammo on shot',
      category: 'support',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '♻️',
      effects: [
        {type: 'passive', value: 0.1, perLevel: 0.08, description: '10% chance per level to not consume ammo'}
      ],
      requirements: [{type: 'skill', value: 'scavenger'}],
      synergiesWith: ['scavenger', 'infinite_potential'],
      recommendedFor: ['balanced', 'speedrunner']
    });

    this.addSkill({
      id: 'lucky',
      name: 'Lucky',
      description: 'Increased rare powerup chance',
      category: 'support',
      tier: 2,
      cost: 2,
      maxLevel: 3,
      currentLevel: 0,
      icon: '🍀',
      effects: [
        {type: 'stat_boost', stat: 'rarePowerupChance', value: 0.2, perLevel: 0.15, description: '+20% rare powerup chance per level'}
      ],
      requirements: [{type: 'skill', value: 'scavenger'}],
      synergiesWith: ['scavenger', 'treasure_hunter'],
      recommendedFor: ['balanced']
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
    let scores: Record<PlayStyle, number> = {
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
    console.log(`[SkillTree] Detected playstyle: ${detectedStyle} (score: ${maxScore})`);

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

    console.log(`[SkillTree] Unlocked ${skill.name} (Level ${skill.currentLevel})`);

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
    console.log(`[SkillTree] Awarded ${amount} skill points`);
  }

  /**
   * Level up player
   */
  public levelUp(): void {
    this.state.playerLevel++;
    this.awardPoints(1); // 1 point per level
    console.log(`[SkillTree] Player level up! Now level ${this.state.playerLevel}`);
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

    console.log('[SkillTree] Skill tree reset');
  }
}
