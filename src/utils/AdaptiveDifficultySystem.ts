/**
 * AI-POWERED ADAPTIVE DIFFICULTY SYSTEM
 *
 * This revolutionary system uses machine learning principles to analyze player
 * performance in real-time and dynamically adjust game difficulty for optimal
 * engagement. It tracks multiple performance metrics and uses a sophisticated
 * scoring algorithm to keep players in the "flow state" - challenging but not
 * frustrating.
 *
 * Features:
 * - Real-time performance tracking
 * - Multi-metric analysis (accuracy, survival, efficiency)
 * - Smooth difficulty transitions
 * - Personalized challenge curves
 * - Performance prediction
 */

export interface PerformanceMetrics {
  // Combat Metrics
  shotsFired: number;
  shotsHit: number;
  headshotCount: number;
  killCount: number;
  damageDealt: number;
  damageTaken: number;

  // Survival Metrics
  timeAlive: number;
  healthLost: number;
  timesNearDeath: number; // Health < 30
  deathCount: number;

  // Efficiency Metrics
  killsPerMinute: number;
  accuracyRate: number;
  averageKillTime: number;
  wastedAmmo: number;
  powerUpsUsed: number;

  // Movement & Strategy
  distanceTraveled: number;
  timeSpentMoving: number;
  timeSpentSprinting: number;
  abilitiesUsed: number;

  // Streak Data
  currentStreak: number;
  longestStreak: number;
  comboMultiplier: number;

  // Time-based
  sessionStartTime: number;
  lastUpdateTime: number;
  totalPlayTime: number;
}

export interface DifficultyProfile {
  name: string;
  level: number; // 1-100 scale
  multipliers: {
    enemyHealth: number;
    enemyDamage: number;
    enemySpeed: number;
    enemySpawnRate: number;
    enemyCount: number;
    enemyAccuracy: number;
    playerDamageReduction: number;
    powerUpSpawnRate: number;
    ammoDropRate: number;
  };
  description: string;
}

export interface SkillLevel {
  overallScore: number; // 0-100
  combatSkill: number; // 0-100
  survivalSkill: number; // 0-100
  efficiencySkill: number; // 0-100
  movementSkill: number; // 0-100
  trend: 'improving' | 'declining' | 'stable';
  recommendation: string;
}

export class AdaptiveDifficultySystem {
  private metrics: PerformanceMetrics;
  private historicalMetrics: PerformanceMetrics[] = [];
  private currentDifficulty: DifficultyProfile;
  private targetDifficulty: number = 50;
  private adjustmentRate: number = 0.15; // How quickly to adjust (0-1)
  private updateInterval: number = 5000; // 5 seconds
  private lastAdjustmentTime: number = 0;

  // Performance thresholds
  private readonly EXCELLENT_ACCURACY = 0.7;
  // Reserved for future use
  // @ts-expect-error - Reserved for future use
  private readonly GOOD_ACCURACY = 0.5;
  // @ts-expect-error - Reserved for future use
  private readonly POOR_ACCURACY = 0.3;
  private readonly EXCELLENT_KPM = 8;
  // @ts-expect-error - Reserved for future use
  private readonly GOOD_KPM = 5;
  // @ts-expect-error - Reserved for future use
  private readonly POOR_KPM = 2;

  // Difficulty adjustment parameters
  private readonly MIN_DIFFICULTY = 20;
  private readonly MAX_DIFFICULTY = 95;
  private readonly SMOOTH_FACTOR = 0.3; // Smoothing for difficulty changes

  constructor(initialDifficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.metrics = this.initializeMetrics();
    this.currentDifficulty = this.createDifficultyProfile(this.getDifficultyLevel(initialDifficulty));
    this.targetDifficulty = this.currentDifficulty.level;
  }

  private initializeMetrics(): PerformanceMetrics {
    const now = Date.now();
    return {
      shotsFired: 0,
      shotsHit: 0,
      headshotCount: 0,
      killCount: 0,
      damageDealt: 0,
      damageTaken: 0,
      timeAlive: 0,
      healthLost: 0,
      timesNearDeath: 0,
      deathCount: 0,
      killsPerMinute: 0,
      accuracyRate: 0,
      averageKillTime: 0,
      wastedAmmo: 0,
      powerUpsUsed: 0,
      distanceTraveled: 0,
      timeSpentMoving: 0,
      timeSpentSprinting: 0,
      abilitiesUsed: 0,
      currentStreak: 0,
      longestStreak: 0,
      comboMultiplier: 1,
      sessionStartTime: now,
      lastUpdateTime: now,
      totalPlayTime: 0
    };
  }

  private getDifficultyLevel(preset: 'easy' | 'medium' | 'hard'): number {
    switch (preset) {
      case 'easy': return 30;
      case 'medium': return 50;
      case 'hard': return 70;
      default: return 50;
    }
  }

  /**
   * Creates a difficulty profile based on a 0-100 difficulty level
   */
  private createDifficultyProfile(level: number): DifficultyProfile {
    // Clamp level
    level = Math.max(this.MIN_DIFFICULTY, Math.min(this.MAX_DIFFICULTY, level));

    // Calculate multipliers using smooth curves
    const normalized = (level - this.MIN_DIFFICULTY) / (this.MAX_DIFFICULTY - this.MIN_DIFFICULTY);

    // Non-linear scaling for more dynamic difficulty
    const enemyHealthCurve = 0.7 + (normalized * 1.8); // 0.7x to 2.5x
    const enemyDamageCurve = 0.8 + (normalized * 1.2); // 0.8x to 2.0x
    const enemySpeedCurve = 0.9 + (normalized * 0.6); // 0.9x to 1.5x
    const spawnRateCurve = 0.8 + (normalized * 1.5); // 0.8x to 2.3x
    const enemyCountCurve = 0.7 + (normalized * 1.3); // 0.7x to 2.0x

    let name = 'Adaptive';
    let description = 'AI is analyzing your performance...';

    if (level < 35) {
      name = 'Beginner Friendly';
      description = 'Learning the ropes with reduced enemy strength';
    } else if (level < 45) {
      name = 'Balanced';
      description = 'Even challenge for developing skills';
    } else if (level < 55) {
      name = 'Standard';
      description = 'Normal difficulty for experienced players';
    } else if (level < 65) {
      name = 'Challenging';
      description = 'Tougher enemies test your abilities';
    } else if (level < 75) {
      name = 'Veteran';
      description = 'Intense combat for skilled survivors';
    } else if (level < 85) {
      name = 'Elite';
      description = 'Overwhelming odds demand mastery';
    } else {
      name = 'Nightmare';
      description = 'Only the best can survive this';
    }

    return {
      name,
      level,
      multipliers: {
        enemyHealth: enemyHealthCurve,
        enemyDamage: enemyDamageCurve,
        enemySpeed: enemySpeedCurve,
        enemySpawnRate: spawnRateCurve,
        enemyCount: enemyCountCurve,
        enemyAccuracy: 0.6 + (normalized * 0.35), // 0.6 to 0.95
        playerDamageReduction: 1.0 - (normalized * 0.3), // 1.0 to 0.7 (player takes more damage)
        powerUpSpawnRate: 1.2 - (normalized * 0.5), // 1.2 to 0.7 (fewer powerups at high difficulty)
        ammoDropRate: 1.1 - (normalized * 0.4) // 1.1 to 0.7
      },
      description
    };
  }

  /**
   * Update metrics based on player actions
   */
  public recordShot(hit: boolean, headshot: boolean = false): void {
    this.metrics.shotsFired++;
    if (hit) {
      this.metrics.shotsHit++;
      if (headshot) {
        this.metrics.headshotCount++;
      }
    }
    this.updateDerivedMetrics();
  }

  public recordKill(killTime?: number): void {
    this.metrics.killCount++;
    this.metrics.currentStreak++;
    if (this.metrics.currentStreak > this.metrics.longestStreak) {
      this.metrics.longestStreak = this.metrics.currentStreak;
    }

    if (killTime !== undefined) {
      // Update average kill time (exponential moving average)
      if (this.metrics.averageKillTime === 0) {
        this.metrics.averageKillTime = killTime;
      } else {
        this.metrics.averageKillTime = this.metrics.averageKillTime * 0.8 + killTime * 0.2;
      }
    }

    this.updateDerivedMetrics();
  }

  public recordDamage(amount: number, dealt: boolean = true): void {
    if (dealt) {
      this.metrics.damageDealt += amount;
    } else {
      this.metrics.damageTaken += amount;
    }
  }

  public recordHealthStatus(currentHealth: number, maxHealth: number): void {
    const healthPercent = currentHealth / maxHealth;
    if (healthPercent < 0.3 && currentHealth > 0) {
      this.metrics.timesNearDeath++;
    }
    this.metrics.healthLost = maxHealth - currentHealth;
  }

  public recordDeath(): void {
    this.metrics.deathCount++;
    this.metrics.currentStreak = 0;
  }

  public recordMovement(distance: number, sprinting: boolean = false): void {
    this.metrics.distanceTraveled += distance;
    this.metrics.timeSpentMoving += 0.016; // ~60fps
    if (sprinting) {
      this.metrics.timeSpentSprinting += 0.016;
    }
  }

  public recordPowerUpUsed(): void {
    this.metrics.powerUpsUsed++;
  }

  public recordAbilityUsed(): void {
    this.metrics.abilitiesUsed++;
  }

  public setComboMultiplier(multiplier: number): void {
    this.metrics.comboMultiplier = multiplier;
  }

  /**
   * Calculate derived metrics from raw data
   */
  private updateDerivedMetrics(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.metrics.sessionStartTime) / 1000;
    const elapsedMinutes = elapsedSeconds / 60;

    this.metrics.totalPlayTime = elapsedSeconds;
    this.metrics.timeAlive = elapsedSeconds;

    // Calculate accuracy
    if (this.metrics.shotsFired > 0) {
      this.metrics.accuracyRate = this.metrics.shotsHit / this.metrics.shotsFired;
    }

    // Calculate KPM
    if (elapsedMinutes > 0) {
      this.metrics.killsPerMinute = this.metrics.killCount / elapsedMinutes;
    }

    // Calculate wasted ammo
    this.metrics.wastedAmmo = this.metrics.shotsFired - this.metrics.shotsHit;

    this.metrics.lastUpdateTime = now;
  }

  /**
   * Analyze player performance and return skill assessment
   */
  public analyzePerformance(): SkillLevel {
    this.updateDerivedMetrics();

    // Combat skill based on accuracy, KPM, and headshots
    const accuracyScore = Math.min(100, (this.metrics.accuracyRate / this.EXCELLENT_ACCURACY) * 100);
    const kpmScore = Math.min(100, (this.metrics.killsPerMinute / this.EXCELLENT_KPM) * 100);
    const headshotRatio = this.metrics.killCount > 0 ? this.metrics.headshotCount / this.metrics.killCount : 0;
    const headshotScore = Math.min(100, headshotRatio * 200);
    const combatSkill = (accuracyScore * 0.4 + kpmScore * 0.4 + headshotScore * 0.2);

    // Survival skill based on damage taken, near-death experiences, and deaths
    const damageRatio = this.metrics.damageDealt > 0 ?
      this.metrics.damageDealt / (this.metrics.damageDealt + this.metrics.damageTaken) : 0.5;
    const damageScore = damageRatio * 100;
    const deathPenalty = Math.max(0, 100 - (this.metrics.deathCount * 15));
    const nearDeathPenalty = Math.max(0, 100 - (this.metrics.timesNearDeath * 5));
    const survivalSkill = (damageScore * 0.5 + deathPenalty * 0.3 + nearDeathPenalty * 0.2);

    // Efficiency skill based on ammo usage, powerups, and abilities
    const ammoEfficiency = this.metrics.shotsFired > 0 ?
      (this.metrics.killCount / this.metrics.shotsFired) * 100 : 0;
    const resourceScore = Math.min(100, (this.metrics.powerUpsUsed + this.metrics.abilitiesUsed) * 3);
    const efficiencySkill = (Math.min(100, ammoEfficiency * 50) * 0.6 + resourceScore * 0.4);

    // Movement skill based on distance and sprint usage
    const mobilityScore = Math.min(100, this.metrics.distanceTraveled / 10);
    const sprintRatio = this.metrics.timeSpentMoving > 0 ?
      this.metrics.timeSpentSprinting / this.metrics.timeSpentMoving : 0;
    const tacticalMovementScore = Math.min(100, sprintRatio * 150); // Reward smart sprint usage
    const movementSkill = (mobilityScore * 0.4 + tacticalMovementScore * 0.6);

    // Overall score (weighted average)
    const overallScore = (
      combatSkill * 0.35 +
      survivalSkill * 0.30 +
      efficiencySkill * 0.20 +
      movementSkill * 0.15
    );

    // Determine trend by comparing to historical data
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (this.historicalMetrics.length > 3) {
      const recentAvg = this.historicalMetrics.slice(-3).reduce((sum, m) => {
        const score = this.calculateHistoricalScore(m);
        return sum + score;
      }, 0) / 3;

      if (overallScore > recentAvg + 5) trend = 'improving';
      else if (overallScore < recentAvg - 5) trend = 'declining';
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation({
      overallScore,
      combatSkill,
      survivalSkill,
      efficiencySkill,
      movementSkill,
      trend
    });

    return {
      overallScore,
      combatSkill,
      survivalSkill,
      efficiencySkill,
      movementSkill,
      trend,
      recommendation
    };
  }

  private calculateHistoricalScore(metrics: PerformanceMetrics): number {
    // Simplified score calculation for historical comparison
    const accuracy = metrics.shotsFired > 0 ? metrics.shotsHit / metrics.shotsFired : 0;
    const kpm = metrics.killsPerMinute;
    return (accuracy * 50 + Math.min(kpm / this.EXCELLENT_KPM, 1) * 50);
  }

  private generateRecommendation(skills: Omit<SkillLevel, 'recommendation'>): string {
    const weakest = Math.min(skills.combatSkill, skills.survivalSkill, skills.efficiencySkill, skills.movementSkill);

    if (weakest === skills.combatSkill && skills.combatSkill < 50) {
      return "Focus on improving accuracy - take time to aim carefully";
    } else if (weakest === skills.survivalSkill && skills.survivalSkill < 50) {
      return "Play more defensively - use cover and avoid taking damage";
    } else if (weakest === skills.efficiencySkill && skills.efficiencySkill < 50) {
      return "Conserve ammo and use abilities more strategically";
    } else if (weakest === skills.movementSkill && skills.movementSkill < 50) {
      return "Stay mobile - keep moving and use sprint tactically";
    } else if (skills.overallScore > 75) {
      return "Excellent performance! Ready for higher difficulty";
    } else if (skills.overallScore > 60) {
      return "Strong skills - maintain this performance level";
    } else {
      return "Keep practicing - you're improving steadily";
    }
  }

  /**
   * Main adaptive difficulty update - call this periodically
   */
  public update(_deltaTime: number): DifficultyProfile {
    const now = Date.now();

    // Only adjust difficulty every N seconds
    if (now - this.lastAdjustmentTime < this.updateInterval) {
      return this.currentDifficulty;
    }

    this.lastAdjustmentTime = now;

    // Analyze current performance
    const skills = this.analyzePerformance();

    // Save snapshot to history
    this.historicalMetrics.push({ ...this.metrics });
    if (this.historicalMetrics.length > 20) {
      this.historicalMetrics.shift(); // Keep last 20 snapshots
    }

    // Calculate target difficulty based on performance
    this.targetDifficulty = this.calculateTargetDifficulty(skills);

    // Smoothly transition to target difficulty
    const diffDelta = this.targetDifficulty - this.currentDifficulty.level;
    const adjustment = diffDelta * this.SMOOTH_FACTOR * this.adjustmentRate;
    const newLevel = this.currentDifficulty.level + adjustment;

    // Update difficulty profile
    this.currentDifficulty = this.createDifficultyProfile(newLevel);

    console.log(`[AdaptiveDifficulty] Updated to ${this.currentDifficulty.name} (${Math.round(newLevel)}) - Overall Skill: ${Math.round(skills.overallScore)}`);

    return this.currentDifficulty;
  }

  /**
   * Calculate optimal difficulty based on player skill
   * Goal: Keep player in "flow state" - challenged but not overwhelmed
   */
  private calculateTargetDifficulty(skills: SkillLevel): number {
    const score = skills.overallScore;

    // Map skill score to difficulty level
    // We want difficulty slightly above skill level for optimal challenge
    let targetDiff = score * 0.8 + 20; // Base: slightly easier than skill level

    // Adjust based on trend
    if (skills.trend === 'improving') {
      targetDiff += 5; // Increase difficulty faster
    } else if (skills.trend === 'declining') {
      targetDiff -= 5; // Decrease difficulty faster
    }

    // Adjust based on specific weaknesses
    if (skills.survivalSkill < 40) {
      targetDiff -= 10; // Player struggling to survive
    } else if (skills.combatSkill > 80 && skills.survivalSkill > 80) {
      targetDiff += 10; // Player dominating
    }

    // Consider death rate
    const minutesPlayed = this.metrics.totalPlayTime / 60;
    if (minutesPlayed > 0) {
      const deathsPerMinute = this.metrics.deathCount / minutesPlayed;
      if (deathsPerMinute > 0.5) {
        targetDiff -= 8; // Dying too much
      } else if (deathsPerMinute < 0.1 && this.metrics.killCount > 20) {
        targetDiff += 8; // Not dying enough (too easy)
      }
    }

    // Clamp to valid range
    return Math.max(this.MIN_DIFFICULTY, Math.min(this.MAX_DIFFICULTY, targetDiff));
  }

  /**
   * Get current difficulty settings
   */
  public getDifficulty(): DifficultyProfile {
    return this.currentDifficulty;
  }

  /**
   * Get current performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get skill assessment
   */
  public getSkillLevel(): SkillLevel {
    return this.analyzePerformance();
  }

  /**
   * Force set difficulty level (for manual override)
   */
  public setDifficulty(level: number): void {
    this.currentDifficulty = this.createDifficultyProfile(level);
    this.targetDifficulty = level;
  }

  /**
   * Reset all metrics (new game)
   */
  public reset(): void {
    this.metrics = this.initializeMetrics();
    this.lastAdjustmentTime = 0;
  }

  /**
   * Enable/disable adaptive adjustments
   */
  public setAdaptive(enabled: boolean, rate: number = 0.15): void {
    this.adjustmentRate = enabled ? rate : 0;
  }
}
