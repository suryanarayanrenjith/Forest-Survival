/**
 * PROCEDURAL MISSION GENERATOR
 *
 * This AI-powered system generates unique, dynamic missions and objectives
 * that adapt to player skill level, game state, and play style. Uses
 * procedural generation algorithms to create endless variety and keep
 * gameplay fresh and engaging.
 *
 * Features:
 * - Context-aware mission generation
 * - Difficulty-scaled objectives
 * - Multi-objective missions
 * - Dynamic rewards
 * - Story elements
 * - Achievement integration
 */

// THREE is imported for potential future use with position-based missions
// @ts-expect-error - Reserved for future use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as THREE from 'three';

export type MissionType =
  | 'elimination' // Kill X enemies
  | 'survival' // Survive X seconds
  | 'accuracy' // Achieve X% accuracy
  | 'streak' // Get X kill streak
  | 'protection' // Protect position
  | 'collection' // Collect X powerups
  | 'speedrun' // Complete in X time
  | 'headshot' // Get X headshots
  | 'weapon_mastery' // Use specific weapon
  | 'ability_challenge' // Use abilities X times
  | 'boss_hunt' // Kill boss enemies
  | 'combo' // Maintain combo
  | 'exploration' // Travel X distance
  | 'efficiency'; // Kill with X ammo

export type MissionDifficulty = 'trivial' | 'easy' | 'moderate' | 'hard' | 'extreme' | 'legendary';

export interface MissionObjective {
  id: string;
  type: MissionType;
  description: string;
  shortDesc: string;
  icon: string;
  target: number;
  current: number;
  completed: boolean;
  optional: boolean;
  reward: MissionReward;
}

export interface MissionReward {
  type: 'points' | 'weapon' | 'powerup' | 'ability' | 'multiplier' | 'health' | 'ammo';
  amount: number;
  description: string;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  difficulty: MissionDifficulty;
  objectives: MissionObjective[];
  timeLimit?: number; // seconds, undefined = no limit
  timeRemaining?: number;
  reward: MissionReward;
  bonusReward?: MissionReward;
  completed: boolean;
  failed: boolean;
  startTime: number;
  completionTime?: number;
  story?: string;
}

export interface MissionGenerationContext {
  playerSkillLevel: number; // 0-100
  currentWave: number;
  killCount: number;
  accuracy: number;
  currentWeapon: string;
  availableWeapons: string[];
  availableAbilities: string[];
  difficulty: string;
  timeOfDay: string;
  biome: string;
}

export class ProceduralMissionSystem {
  private activeMissions: Mission[] = [];
  private completedMissions: Mission[] = [];
  private missionIdCounter: number = 0;
  private lastMissionTime: number = 0;
  private missionCooldown: number = 30000; // 30 seconds between missions

  // Story templates for narrative generation
  private readonly storyTemplates = {
    elimination: [
      "The forest is overrun. Clear the immediate threat.",
      "A horde approaches. Thin their numbers.",
      "Enemy scouts detected. Eliminate them before reinforcements arrive.",
      "Your position is compromised. Fight your way out.",
      "The creatures are multiplying. Stop their advance."
    ],
    survival: [
      "Hold your ground. Reinforcements are coming.",
      "The night is dangerous. Survive until dawn.",
      "A storm is approaching. Weather the assault.",
      "Your extraction is delayed. Stay alive.",
      "The hunt has begun. Be the last one standing."
    ],
    accuracy: [
      "Ammunition is scarce. Make every shot count.",
      "Precision is key. Prove your marksmanship.",
      "They're watching. Show them what you're made of.",
      "Resources are limited. Waste nothing.",
      "Only the skilled will survive this test."
    ],
    streak: [
      "Build momentum. Don't let them breathe.",
      "Show no mercy. Keep the pressure on.",
      "Your reputation depends on this. Don't miss.",
      "They fear the hunter. Become unstoppable.",
      "The flow of battle favors the relentless."
    ],
    protection: [
      "This position is strategic. Don't let them take it.",
      "Your supplies are here. Defend them with your life.",
      "Fall back to this position and hold.",
      "The high ground is yours. Keep it that way.",
      "This is your stronghold. Make it impenetrable."
    ],
    collection: [
      "Supply drops incoming. Secure them.",
      "The forest provides. Gather what you need.",
      "Resources scattered nearby. Collect them quickly.",
      "Abandoned supplies detected. They're yours if you can reach them.",
      "Power beyond measure awaits. Seek it out."
    ],
    speedrun: [
      "Time is of the essence. Move fast.",
      "The window of opportunity is closing. Act now.",
      "Speed is your ally. Don't hesitate.",
      "Every second counts. Prove your worth.",
      "Efficiency will be rewarded. Rush them."
    ],
    headshot: [
      "Precision over power. Target weak points.",
      "One shot, one kill. The sniper's creed.",
      "Show them the meaning of accuracy.",
      "Clean eliminations only. No room for error.",
      "The perfect hunter strikes true every time."
    ],
    weapon_mastery: [
      "Master your tools. They are extensions of yourself.",
      "This weapon chose you. Prove worthy of it.",
      "Demonstrate your expertise with this armament.",
      "Every weapon has a rhythm. Find it.",
      "Adapt your style. Use what you're given."
    ],
    ability_challenge: [
      "Your powers are your greatest asset. Use them.",
      "The weak rely on weapons. You have more.",
      "Transcend normal limits. Embrace your abilities.",
      "Show them what makes you special.",
      "Ordinary soldiers won't survive this. You're not ordinary."
    ],
    boss_hunt: [
      "A powerful enemy approaches. Eliminate the threat.",
      "They sent their best. Show them it's not enough.",
      "The alpha must be eliminated. Hunt it down.",
      "Big game hunting. Bring down the titan.",
      "A worthy adversary approaches. Rise to the challenge."
    ],
    combo: [
      "Flow like water. Strike like thunder.",
      "Rhythm is everything. Don't break the chain.",
      "Your momentum builds power. Maintain it.",
      "The dance of death has begun. Don't miss a step.",
      "Perfection is a series of excellent moments. String them together."
    ],
    exploration: [
      "Know your battlefield. Cover ground.",
      "The forest holds secrets. Seek them.",
      "Movement is life. Stagnation is death.",
      "Survey the terrain. Knowledge is power.",
      "The hunter must know every inch of their domain."
    ],
    efficiency: [
      "A true master wastes nothing.",
      "Efficiency is the mark of a professional.",
      "Every bullet is precious. Use them wisely.",
      "Conservation today means survival tomorrow.",
      "Resourcefulness will be your greatest strength."
    ]
  };

  constructor() {
    console.log('[ProceduralMissions] System initialized');
  }

  /**
   * Generate a contextual mission based on current game state
   */
  public generateMission(context: MissionGenerationContext): Mission | null {
    const now = Date.now();

    // Cooldown check
    if (now - this.lastMissionTime < this.missionCooldown) {
      return null;
    }

    // Don't generate too many active missions
    if (this.activeMissions.length >= 3) {
      return null;
    }

    this.lastMissionTime = now;

    // Select mission type based on context
    const missionType = this.selectMissionType(context);
    const difficulty = this.calculateMissionDifficulty(context);
    const objectives = this.generateObjectives(missionType, difficulty, context);
    const rewards = this.generateRewards(difficulty, objectives.length);
    const timeLimit = this.shouldHaveTimeLimit(missionType, difficulty) ?
      this.generateTimeLimit(missionType, difficulty) : undefined;

    const mission: Mission = {
      id: `mission_${this.missionIdCounter++}`,
      title: this.generateTitle(missionType, difficulty),
      description: this.generateDescription(missionType, difficulty, objectives),
      difficulty,
      objectives,
      timeLimit,
      timeRemaining: timeLimit,
      reward: rewards.primary,
      bonusReward: rewards.bonus,
      completed: false,
      failed: false,
      startTime: now,
      story: this.generateStory(missionType)
    };

    this.activeMissions.push(mission);
    console.log(`[ProceduralMissions] Generated: ${mission.title} (${difficulty})`);

    return mission;
  }

  /**
   * AI-based mission type selection
   */
  private selectMissionType(context: MissionGenerationContext): MissionType {
    const types: MissionType[] = [
      'elimination', 'survival', 'accuracy', 'streak', 'protection',
      'collection', 'speedrun', 'headshot', 'weapon_mastery',
      'ability_challenge', 'boss_hunt', 'combo', 'exploration', 'efficiency'
    ];

    // Weight mission types based on context
    const weights: Record<MissionType, number> = {
      elimination: 1.0,
      survival: 1.0,
      accuracy: context.accuracy < 0.5 ? 1.5 : 0.8, // Encourage if poor accuracy
      streak: context.killCount > 20 ? 1.2 : 0.7,
      protection: 0.8,
      collection: 1.0,
      speedrun: context.playerSkillLevel > 60 ? 1.2 : 0.6,
      headshot: context.accuracy > 0.6 ? 1.3 : 0.7, // Encourage if good accuracy
      weapon_mastery: context.availableWeapons.length > 3 ? 1.0 : 0.5,
      ability_challenge: context.availableAbilities.length > 2 ? 1.1 : 0.6,
      boss_hunt: context.currentWave > 5 ? 1.2 : 0.5,
      combo: context.playerSkillLevel > 50 ? 1.1 : 0.7,
      exploration: 0.9,
      efficiency: context.accuracy > 0.5 ? 1.2 : 0.6
    };

    // Apply difficulty scaling
    if (context.difficulty === 'hard') {
      weights.boss_hunt *= 1.5;
      weights.survival *= 1.3;
    }

    // Select weighted random type
    const totalWeight = types.reduce((sum, type) => sum + weights[type], 0);
    let random = Math.random() * totalWeight;

    for (const type of types) {
      random -= weights[type];
      if (random <= 0) {
        return type;
      }
    }

    return 'elimination'; // Fallback
  }

  /**
   * Calculate mission difficulty based on player skill
   */
  private calculateMissionDifficulty(context: MissionGenerationContext): MissionDifficulty {
    const skill = context.playerSkillLevel;

    // Add some randomness but bias toward player skill
    const random = Math.random();
    const adjustedSkill = skill + (random - 0.5) * 20;

    if (adjustedSkill < 20) return 'trivial';
    if (adjustedSkill < 35) return 'easy';
    if (adjustedSkill < 55) return 'moderate';
    if (adjustedSkill < 75) return 'hard';
    if (adjustedSkill < 90) return 'extreme';
    return 'legendary';
  }

  /**
   * Generate objectives for the mission
   */
  private generateObjectives(
    type: MissionType,
    difficulty: MissionDifficulty,
    context: MissionGenerationContext
  ): MissionObjective[] {
    const objectives: MissionObjective[] = [];
    const difficultyMultiplier = this.getDifficultyMultiplier(difficulty);

    // Main objective
    const mainObjective = this.createObjective(type, difficultyMultiplier, context, false);
    objectives.push(mainObjective);

    // Add bonus objectives for higher difficulties
    if (difficulty === 'hard' || difficulty === 'extreme' || difficulty === 'legendary') {
      const bonusType = this.selectBonusObjective(type);
      const bonusObjective = this.createObjective(bonusType, difficultyMultiplier * 0.7, context, true);
      objectives.push(bonusObjective);
    }

    return objectives;
  }

  private createObjective(
    type: MissionType,
    multiplier: number,
    context: MissionGenerationContext,
    optional: boolean
  ): MissionObjective {
    let target = 0;
    let description = '';
    let shortDesc = '';
    let icon = '';

    switch (type) {
      case 'elimination':
        target = Math.ceil(15 * multiplier);
        description = `Eliminate ${target} enemies`;
        shortDesc = `${target} kills`;
        icon = '💀';
        break;
      case 'survival':
        target = Math.ceil(60 * multiplier);
        description = `Survive for ${target} seconds`;
        shortDesc = `${target}s survival`;
        icon = '⏱️';
        break;
      case 'accuracy':
        target = Math.min(95, Math.ceil(50 + (multiplier * 10)));
        description = `Achieve ${target}% accuracy`;
        shortDesc = `${target}% accuracy`;
        icon = '🎯';
        break;
      case 'streak':
        target = Math.ceil(8 * multiplier);
        description = `Achieve ${target} kill streak`;
        shortDesc = `${target} streak`;
        icon = '🔥';
        break;
      case 'protection':
        target = Math.ceil(45 * multiplier);
        description = `Defend position for ${target} seconds`;
        shortDesc = `Defend ${target}s`;
        icon = '🛡️';
        break;
      case 'collection':
        target = Math.ceil(5 * multiplier);
        description = `Collect ${target} power-ups`;
        shortDesc = `${target} powerups`;
        icon = '📦';
        break;
      case 'speedrun':
        target = Math.ceil(30 * multiplier);
        description = `Complete within ${target} seconds`;
        shortDesc = `Under ${target}s`;
        icon = '⚡';
        break;
      case 'headshot':
        target = Math.ceil(10 * multiplier);
        description = `Score ${target} headshots`;
        shortDesc = `${target} headshots`;
        icon = '🎯';
        break;
      case 'weapon_mastery':
        const weapon = context.availableWeapons[Math.floor(Math.random() * context.availableWeapons.length)] || 'Rifle';
        target = Math.ceil(12 * multiplier);
        description = `Get ${target} kills with ${weapon}`;
        shortDesc = `${target} ${weapon} kills`;
        icon = '🔫';
        break;
      case 'ability_challenge':
        target = Math.ceil(8 * multiplier);
        description = `Use abilities ${target} times`;
        shortDesc = `${target} abilities`;
        icon = '✨';
        break;
      case 'boss_hunt':
        target = Math.ceil(3 * multiplier);
        description = `Eliminate ${target} boss enemies`;
        shortDesc = `${target} bosses`;
        icon = '👹';
        break;
      case 'combo':
        target = Math.ceil(20 * multiplier);
        description = `Maintain ${target}x combo multiplier`;
        shortDesc = `${target}x combo`;
        icon = '🎊';
        break;
      case 'exploration':
        target = Math.ceil(200 * multiplier);
        description = `Travel ${target} units`;
        shortDesc = `${target} distance`;
        icon = '🗺️';
        break;
      case 'efficiency':
        target = Math.ceil(25 * multiplier);
        description = `Get ${target} kills with under 40 bullets`;
        shortDesc = `Efficient ${target} kills`;
        icon = '💎';
        break;
    }

    return {
      id: `obj_${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      shortDesc,
      icon,
      target,
      current: 0,
      completed: false,
      optional,
      reward: this.generateObjectiveReward(type, optional)
    };
  }

  private getDifficultyMultiplier(difficulty: MissionDifficulty): number {
    switch (difficulty) {
      case 'trivial': return 0.5;
      case 'easy': return 0.8;
      case 'moderate': return 1.0;
      case 'hard': return 1.4;
      case 'extreme': return 1.8;
      case 'legendary': return 2.5;
    }
  }

  private selectBonusObjective(mainType: MissionType): MissionType {
    // Select complementary bonus objectives
    const bonusMap: Record<MissionType, MissionType[]> = {
      elimination: ['headshot', 'efficiency', 'accuracy'],
      survival: ['collection', 'protection', 'exploration'],
      accuracy: ['headshot', 'streak'],
      streak: ['combo', 'elimination'],
      protection: ['survival', 'accuracy'],
      collection: ['exploration', 'speedrun'],
      speedrun: ['efficiency', 'accuracy'],
      headshot: ['accuracy', 'streak'],
      weapon_mastery: ['elimination', 'efficiency'],
      ability_challenge: ['streak', 'elimination'],
      boss_hunt: ['survival', 'accuracy'],
      combo: ['streak', 'efficiency'],
      exploration: ['collection', 'survival'],
      efficiency: ['accuracy', 'headshot']
    };

    const options = bonusMap[mainType] || ['elimination'];
    return options[Math.floor(Math.random() * options.length)];
  }

  private generateObjectiveReward(_type: MissionType, optional: boolean): MissionReward {
    const baseAmount = optional ? 150 : 100;

    return {
      type: 'points',
      amount: baseAmount,
      description: `+${baseAmount} points`
    };
  }

  private shouldHaveTimeLimit(type: MissionType, difficulty: MissionDifficulty): boolean {
    // Survival and protection missions have time as their objective
    if (type === 'survival' || type === 'protection' || type === 'speedrun') {
      return false;
    }

    // Higher difficulty missions more likely to have time limits
    const chance = difficulty === 'extreme' || difficulty === 'legendary' ? 0.7 :
                   difficulty === 'hard' ? 0.5 :
                   difficulty === 'moderate' ? 0.3 : 0.1;

    return Math.random() < chance;
  }

  private generateTimeLimit(_type: MissionType, difficulty: MissionDifficulty): number {
    const baseTime = 120; // 2 minutes
    const multiplier = this.getDifficultyMultiplier(difficulty);

    // Harder missions get less time
    return Math.ceil(baseTime / multiplier);
  }

  private generateTitle(type: MissionType, difficulty: MissionDifficulty): string {
    const adjectives = {
      trivial: ['Simple', 'Basic', 'Easy'],
      easy: ['Straightforward', 'Standard', 'Routine'],
      moderate: ['Challenging', 'Tactical', 'Strategic'],
      hard: ['Difficult', 'Intense', 'Demanding'],
      extreme: ['Brutal', 'Savage', 'Merciless'],
      legendary: ['Legendary', 'Mythical', 'Epic']
    };

    const typeNames: Record<MissionType, string[]> = {
      elimination: ['Extermination', 'Cleanup', 'Purge', 'Hunt'],
      survival: ['Endurance Test', 'Last Stand', 'Holdout', 'Resilience Trial'],
      accuracy: ['Precision Challenge', 'Marksman Test', 'Sharpshooter Trial'],
      streak: ['Rampage', 'Killing Spree', 'Momentum Strike'],
      protection: ['Defense', 'Guardian Duty', 'Fortress Hold'],
      collection: ['Scavenger Hunt', 'Supply Run', 'Resource Gathering'],
      speedrun: ['Speed Trial', 'Blitz', 'Rush'],
      headshot: ['Headhunter', 'Critical Strike', 'Perfect Aim'],
      weapon_mastery: ['Weapon Trial', 'Armament Test', 'Arsenal Challenge'],
      ability_challenge: ['Power Showcase', 'Ability Trial', 'Special Ops'],
      boss_hunt: ['Titan Slayer', 'Alpha Elimination', 'Big Game'],
      combo: ['Flow State', 'Perfect Rhythm', 'Chain Master'],
      exploration: ['Reconnaissance', 'Survey Mission', 'Pathfinder'],
      efficiency: ['Resource Management', 'Conservation', 'Optimization']
    };

    const adj = adjectives[difficulty][Math.floor(Math.random() * adjectives[difficulty].length)];
    const name = typeNames[type][Math.floor(Math.random() * typeNames[type].length)];

    return `${adj} ${name}`;
  }

  private generateDescription(_type: MissionType, _difficulty: MissionDifficulty, objectives: MissionObjective[]): string {
    const main = objectives.find(obj => !obj.optional);
    const bonus = objectives.find(obj => obj.optional);

    let desc = main ? main.description : 'Complete the objectives';

    if (bonus) {
      desc += `. Bonus: ${bonus.description}`;
    }

    return desc;
  }

  private generateStory(type: MissionType): string {
    const templates = this.storyTemplates[type] || this.storyTemplates.elimination;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateRewards(difficulty: MissionDifficulty, objectiveCount: number): {
    primary: MissionReward;
    bonus?: MissionReward;
  } {
    const difficultyPoints = {
      trivial: 200,
      easy: 400,
      moderate: 700,
      hard: 1200,
      extreme: 2000,
      legendary: 3500
    };

    const basePoints = difficultyPoints[difficulty];
    const multiplier = 1 + ((objectiveCount - 1) * 0.3);

    const primary: MissionReward = {
      type: 'points',
      amount: Math.ceil(basePoints * multiplier),
      description: `${Math.ceil(basePoints * multiplier)} points`
    };

    // Higher difficulties get bonus rewards
    let bonus: MissionReward | undefined;
    if (difficulty === 'extreme' || difficulty === 'legendary') {
      const bonusTypes: MissionReward['type'][] = ['multiplier', 'powerup', 'ability'];
      const bonusType = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];

      bonus = {
        type: bonusType,
        amount: bonusType === 'multiplier' ? 2 : 1,
        description: bonusType === 'multiplier' ? '2x Score Multiplier' :
                     bonusType === 'powerup' ? 'Random Power-up' : 'Ability Cooldown Reset'
      };
    }

    return { primary, bonus };
  }

  /**
   * Update mission progress
   */
  public updateProgress(type: MissionType, amount: number = 1, metadata?: any): void {
    for (const mission of this.activeMissions) {
      if (mission.completed || mission.failed) continue;

      for (const objective of mission.objectives) {
        if (objective.completed) continue;

        // Check if this update applies to this objective
        if (objective.type === type) {
          // Special case for weapon mastery
          if (type === 'weapon_mastery' && metadata?.weapon) {
            if (!objective.description.includes(metadata.weapon)) {
              continue;
            }
          }

          objective.current = Math.min(objective.target, objective.current + amount);

          if (objective.current >= objective.target) {
            objective.completed = true;
            console.log(`[ProceduralMissions] Objective completed: ${objective.description}`);
          }
        }
      }

      // Check if mission is complete
      const requiredObjectives = mission.objectives.filter(obj => !obj.optional);
      const allRequiredComplete = requiredObjectives.every(obj => obj.completed);

      if (allRequiredComplete && !mission.completed) {
        this.completeMission(mission.id);
      }

      // Update time-based missions
      if (mission.timeRemaining !== undefined) {
        mission.timeRemaining = Math.max(0, mission.timeRemaining - (1 / 60)); // Assumes 60fps

        if (mission.timeRemaining <= 0 && !mission.completed) {
          this.failMission(mission.id);
        }
      }
    }
  }

  /**
   * Complete a mission
   */
  private completeMission(missionId: string): void {
    const mission = this.activeMissions.find(m => m.id === missionId);
    if (!mission) return;

    mission.completed = true;
    mission.completionTime = Date.now();

    this.completedMissions.push(mission);
    this.activeMissions = this.activeMissions.filter(m => m.id !== missionId);

    console.log(`[ProceduralMissions] Mission completed: ${mission.title}`);
  }

  /**
   * Fail a mission
   */
  private failMission(missionId: string): void {
    const mission = this.activeMissions.find(m => m.id === missionId);
    if (!mission) return;

    mission.failed = true;

    this.completedMissions.push(mission);
    this.activeMissions = this.activeMissions.filter(m => m.id !== missionId);

    console.log(`[ProceduralMissions] Mission failed: ${mission.title}`);
  }

  /**
   * Get active missions
   */
  public getActiveMissions(): Mission[] {
    return [...this.activeMissions];
  }

  /**
   * Get completed missions
   */
  public getCompletedMissions(): Mission[] {
    return [...this.completedMissions];
  }

  /**
   * Get mission statistics
   */
  public getStatistics(): {
    totalCompleted: number;
    totalFailed: number;
    completionRate: number;
    favoriteType: MissionType | null;
  } {
    const completed = this.completedMissions.filter(m => m.completed).length;
    const failed = this.completedMissions.filter(m => m.failed).length;
    const total = completed + failed;

    // Count mission types
    const typeCounts: Partial<Record<MissionType, number>> = {};
    for (const mission of this.completedMissions.filter(m => m.completed)) {
      const mainObjective = mission.objectives.find(obj => !obj.optional);
      if (mainObjective) {
        typeCounts[mainObjective.type] = (typeCounts[mainObjective.type] || 0) + 1;
      }
    }

    // Find favorite type
    let favoriteType: MissionType | null = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        favoriteType = type as MissionType;
      }
    }

    return {
      totalCompleted: completed,
      totalFailed: failed,
      completionRate: total > 0 ? (completed / total) * 100 : 0,
      favoriteType
    };
  }

  /**
   * Reset system
   */
  public reset(): void {
    this.activeMissions = [];
    this.lastMissionTime = 0;
  }
}
