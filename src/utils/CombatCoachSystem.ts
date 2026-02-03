/**
 * INTELLIGENT COMBAT COACH SYSTEM
 *
 * This AI-powered system analyzes player behavior in real-time and provides
 * contextual tips, strategies, and encouragement. It learns from player
 * patterns to offer personalized advice that improves gameplay.
 *
 * Features:
 * - Real-time behavior analysis
 * - Contextual tip generation
 * - Pattern recognition
 * - Adaptive advice difficulty
 * - Performance-based coaching
 * - Motivational feedback
 */

export type TipCategory =
  | 'combat' // Fighting techniques
  | 'movement' // Positioning and mobility
  | 'resources' // Ammo and powerup management
  | 'abilities' // Skill usage
  | 'strategy' // High-level tactics
  | 'survival' // Health and safety
  | 'weapon' // Weapon-specific advice
  | 'enemy' // Enemy behavior insights
  | 'encouragement'; // Motivational messages

export type TipPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Tip {
  id: string;
  category: TipCategory;
  priority: TipPriority;
  title: string;
  message: string;
  icon: string;
  duration: number; // milliseconds to display
  timestamp: number;
  actionable?: string; // Specific action suggestion
  trigger: string; // What triggered this tip
}

export interface BehaviorPattern {
  lowAccuracy: boolean;
  wastingAmmo: boolean;
  notMoving: boolean;
  notUsingSprint: boolean;
  notUsingAbilities: boolean;
  takingTooMuchDamage: boolean;
  notCollectingPowerups: boolean;
  stayingAtLowHealth: boolean;
  notAiming: boolean;
  missingHeadshots: boolean;
  reloadingTooOften: boolean;
  usingWrongWeapon: boolean;
  poorPositioning: boolean;
  notSwitchingWeapons: boolean;
  repeatingMistakes: boolean;
}

export interface CombatAnalysis {
  patterns: BehaviorPattern;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  improvementAreas: TipCategory[];
  skillTrend: 'improving' | 'declining' | 'stable';
}

export class CombatCoachSystem {
  private tipHistory: Tip[] = [];
  private lastTipTime: number = 0;
  private tipCooldown: number = 15000; // 15 seconds minimum between tips
  private behaviorData: Map<string, number[]> = new Map();
  // @ts-expect-error - Reserved for future use
  private sessionStartTime: number = Date.now();

  // Tracking variables
  private shotsLastMinute: number = 0;
  private hitsLastMinute: number = 0;
  private lastPositions: Array<{x: number, z: number, time: number}> = [];
  private lastAbilityUse: number = 0;
  private lastPowerupCollect: number = 0;
  private consecutiveMisses: number = 0;
  private timeAtLowHealth: number = 0;
  private lastHealthCheck: number = Date.now();
  private reloadCount: number = 0;
  private lastWeaponSwitch: number = 0;

  // Thresholds
  private readonly ACCURACY_THRESHOLD = 0.4;
  private readonly MOVEMENT_THRESHOLD = 5.0; // units
  private readonly LOW_HEALTH_THRESHOLD = 30;
  private readonly ABILITY_COOLDOWN_WARNING = 20000; // 20s
  private readonly POWERUP_COLLECT_WARNING = 30000; // 30s

  constructor() {
    console.log('[CombatCoach] System initialized');
    this.initializeBehaviorTracking();
  }

  private initializeBehaviorTracking(): void {
    // Initialize tracking for various metrics
    this.behaviorData.set('accuracy', []);
    this.behaviorData.set('movement', []);
    this.behaviorData.set('abilityUsage', []);
    this.behaviorData.set('damageTaken', []);
    this.behaviorData.set('headshotRatio', []);
  }

  /**
   * Main analysis function - call periodically
   */
  public analyzeAndCoach(gameState: {
    playerHealth: number;
    maxHealth: number;
    currentWeapon: string;
    ammo: number;
    maxAmmo: number;
    enemiesNearby: number;
    enemyTypes: string[];
    powerupsNearby: number;
    position: {x: number, z: number};
    abilitiesOnCooldown: boolean[];
    recentShots: {hit: boolean, headshot: boolean}[];
    timeInGame: number;
  }): Tip | null {
    const now = Date.now();

    // Don't spam tips
    if (now - this.lastTipTime < this.tipCooldown) {
      return null;
    }

    // Analyze current behavior
    const analysis = this.analyzeBehavior(gameState);

    // Generate tip based on highest priority issue
    const tip = this.generateTip(analysis, gameState);

    if (tip) {
      this.tipHistory.push(tip);
      this.lastTipTime = now;

      // Keep history limited
      if (this.tipHistory.length > 50) {
        this.tipHistory.shift();
      }

      console.log(`[CombatCoach] ${tip.category.toUpperCase()}: ${tip.message}`);
    }

    return tip;
  }

  /**
   * Analyze player behavior patterns
   */
  private analyzeBehavior(gameState: any): CombatAnalysis {
    const patterns: BehaviorPattern = {
      lowAccuracy: this.checkLowAccuracy(gameState.recentShots),
      wastingAmmo: this.checkWastingAmmo(gameState.recentShots, gameState.ammo, gameState.maxAmmo),
      notMoving: this.checkNotMoving(gameState.position),
      notUsingSprint: this.checkNotUsingSprint(),
      notUsingAbilities: this.checkNotUsingAbilities(),
      takingTooMuchDamage: this.checkTakingDamage(gameState.playerHealth, gameState.maxHealth),
      notCollectingPowerups: this.checkNotCollectingPowerups(gameState.powerupsNearby),
      stayingAtLowHealth: this.checkStayingAtLowHealth(gameState.playerHealth, gameState.maxHealth),
      notAiming: this.checkNotAiming(gameState.recentShots),
      missingHeadshots: this.checkMissingHeadshots(gameState.recentShots),
      reloadingTooOften: this.checkReloadingTooOften(),
      usingWrongWeapon: this.checkWrongWeapon(gameState.currentWeapon, gameState.enemiesNearby, gameState.enemyTypes),
      poorPositioning: this.checkPoorPositioning(gameState.enemiesNearby),
      notSwitchingWeapons: this.checkNotSwitchingWeapons(),
      repeatingMistakes: this.checkRepeatingMistakes()
    };

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];
    const improvementAreas: TipCategory[] = [];

    // Identify strengths and weaknesses
    if (!patterns.lowAccuracy) strengths.push('Good accuracy');
    else {
      weaknesses.push('Low accuracy');
      improvementAreas.push('combat');
      recommendations.push('Take more time to aim before shooting');
    }

    if (!patterns.notMoving) strengths.push('Good mobility');
    else {
      weaknesses.push('Not moving enough');
      improvementAreas.push('movement');
      recommendations.push('Keep moving to avoid enemy attacks');
    }

    if (!patterns.notUsingAbilities) strengths.push('Using abilities well');
    else {
      weaknesses.push('Underusing abilities');
      improvementAreas.push('abilities');
      recommendations.push('Use your abilities more frequently');
    }

    if (!patterns.takingTooMuchDamage) strengths.push('Good damage avoidance');
    else {
      weaknesses.push('Taking excessive damage');
      improvementAreas.push('survival');
      recommendations.push('Use cover and maintain distance from enemies');
    }

    // Determine skill trend
    const skillTrend = this.calculateSkillTrend();

    return {
      patterns,
      strengths,
      weaknesses,
      recommendations,
      improvementAreas,
      skillTrend
    };
  }

  private checkLowAccuracy(recentShots: {hit: boolean}[]): boolean {
    if (recentShots.length < 10) return false;

    const last20 = recentShots.slice(-20);
    const hits = last20.filter(s => s.hit).length;
    const accuracy = hits / last20.length;

    return accuracy < this.ACCURACY_THRESHOLD;
  }

  private checkWastingAmmo(recentShots: {hit: boolean}[], ammo: number, maxAmmo: number): boolean {
    if (recentShots.length < 15) return false;

    const last30 = recentShots.slice(-30);
    const hits = last30.filter(s => s.hit).length;
    const accuracy = hits / last30.length;

    // Wasting ammo if low accuracy and low ammo
    return accuracy < 0.3 && ammo < maxAmmo * 0.3;
  }

  private checkNotMoving(position: {x: number, z: number}): boolean {
    const now = Date.now();
    this.lastPositions.push({...position, time: now});

    // Keep last 5 seconds of positions
    this.lastPositions = this.lastPositions.filter(p => now - p.time < 5000);

    if (this.lastPositions.length < 10) return false;

    // Calculate total distance moved
    let totalDistance = 0;
    for (let i = 1; i < this.lastPositions.length; i++) {
      const dx = this.lastPositions[i].x - this.lastPositions[i - 1].x;
      const dz = this.lastPositions[i].z - this.lastPositions[i - 1].z;
      totalDistance += Math.sqrt(dx * dx + dz * dz);
    }

    return totalDistance < this.MOVEMENT_THRESHOLD;
  }

  private checkNotUsingSprint(): boolean {
    // This would need integration with actual sprint tracking
    // For now, return false (placeholder)
    return false;
  }

  private checkNotUsingAbilities(): boolean {
    const now = Date.now();
    return now - this.lastAbilityUse > this.ABILITY_COOLDOWN_WARNING;
  }

  private checkTakingDamage(health: number, maxHealth: number): boolean {
    const healthPercent = (health / maxHealth) * 100;
    const now = Date.now();

    if (healthPercent < 50) {
      const timeSinceLastCheck = (now - this.lastHealthCheck) / 1000;
      this.timeAtLowHealth += timeSinceLastCheck;
      this.lastHealthCheck = now;

      return this.timeAtLowHealth > 10; // At low health for 10+ seconds
    } else {
      this.timeAtLowHealth = 0;
      this.lastHealthCheck = now;
      return false;
    }
  }

  private checkNotCollectingPowerups(powerupsNearby: number): boolean {
    const now = Date.now();
    return powerupsNearby > 0 && (now - this.lastPowerupCollect > this.POWERUP_COLLECT_WARNING);
  }

  private checkStayingAtLowHealth(health: number, maxHealth: number): boolean {
    const healthPercent = (health / maxHealth) * 100;
    return healthPercent < this.LOW_HEALTH_THRESHOLD && healthPercent > 0;
  }

  private checkNotAiming(recentShots: {hit: boolean, headshot: boolean}[]): boolean {
    if (recentShots.length < 10) return false;

    const last10 = recentShots.slice(-10);
    const misses = last10.filter(s => !s.hit).length;

    // If missing most shots, probably not aiming
    return misses >= 8;
  }

  private checkMissingHeadshots(recentShots: {hit: boolean, headshot: boolean}[]): boolean {
    if (recentShots.length < 20) return false;

    const last30 = recentShots.slice(-30);
    const hits = last30.filter(s => s.hit);
    const headshots = hits.filter(s => s.headshot);

    // If hitting but no headshots
    return hits.length > 15 && headshots.length === 0;
  }

  private checkReloadingTooOften(): boolean {
    // Would need tracking of reload events
    return this.reloadCount > 10; // Placeholder
  }

  private checkWrongWeapon(weapon: string, enemiesNearby: number, _enemyTypes: string[]): boolean {
    // Suggest shotgun if enemies very close
    if (enemiesNearby > 3 && weapon === 'Sniper') {
      return true;
    }

    // Suggest sniper/rifle if enemies far
    if (enemiesNearby < 2 && (weapon === 'Shotgun' || weapon === 'SMG')) {
      return true;
    }

    return false;
  }

  private checkPoorPositioning(enemiesNearby: number): boolean {
    // Poor positioning if surrounded
    return enemiesNearby > 5;
  }

  private checkNotSwitchingWeapons(): boolean {
    const now = Date.now();
    return now - this.lastWeaponSwitch > 60000; // Haven't switched in 1 minute
  }

  private checkRepeatingMistakes(): boolean {
    // Analyze tip history for repeated issues
    const recentTips = this.tipHistory.slice(-10);
    const categoryCounts: Map<TipCategory, number> = new Map();

    for (const tip of recentTips) {
      categoryCounts.set(tip.category, (categoryCounts.get(tip.category) || 0) + 1);
    }

    // If same category appears 3+ times in last 10 tips
    for (const count of categoryCounts.values()) {
      if (count >= 3) return true;
    }

    return false;
  }

  private calculateSkillTrend(): 'improving' | 'declining' | 'stable' {
    // Analyze behavior data trends
    const accuracyData = this.behaviorData.get('accuracy') || [];

    if (accuracyData.length < 10) return 'stable';

    const first5 = accuracyData.slice(0, 5);
    const last5 = accuracyData.slice(-5);

    const avg1 = first5.reduce((a, b) => a + b, 0) / first5.length;
    const avg2 = last5.reduce((a, b) => a + b, 0) / last5.length;

    if (avg2 > avg1 + 0.1) return 'improving';
    if (avg2 < avg1 - 0.1) return 'declining';
    return 'stable';
  }

  /**
   * Generate a tip based on analysis
   */
  private generateTip(analysis: CombatAnalysis, gameState: any): Tip | null {
    const patterns = analysis.patterns;

    // Priority order: critical issues first
    if (patterns.stayingAtLowHealth && gameState.powerupsNearby > 0) {
      return this.createTip('survival', 'critical', 'Health Critical!',
        'You\'re low on health and there are power-ups nearby - collect them now!',
        '🆘', 'Collect the nearby power-up', 'low_health_powerup_nearby');
    }

    if (patterns.poorPositioning) {
      return this.createTip('strategy', 'high', 'Surrounded!',
        'You\'re surrounded by enemies. Retreat to a better position or use an ability to escape.',
        '⚠️', 'Move to a safer position', 'surrounded');
    }

    if (patterns.wastingAmmo) {
      return this.createTip('resources', 'high', 'Low Ammo!',
        'You\'re running low on ammo and missing shots. Aim more carefully or switch weapons.',
        '📉', 'Conserve ammunition', 'wasting_ammo');
    }

    if (patterns.usingWrongWeapon) {
      return this.createTip('weapon', 'medium', 'Try a Different Weapon',
        this.getWeaponSuggestion(gameState.currentWeapon, gameState.enemiesNearby),
        '🔫', 'Switch weapons', 'wrong_weapon');
    }

    if (patterns.lowAccuracy) {
      return this.createTip('combat', 'medium', 'Improve Your Aim',
        'Your accuracy is low. Take your time, aim at center mass, and shoot in controlled bursts.',
        '🎯', 'Aim before shooting', 'low_accuracy');
    }

    if (patterns.notMoving) {
      return this.createTip('movement', 'medium', 'Stay Mobile!',
        'Standing still makes you an easy target. Keep moving and use sprint to dodge attacks.',
        '🏃', 'Move around more', 'not_moving');
    }

    if (patterns.notUsingAbilities) {
      return this.createTip('abilities', 'medium', 'Use Your Abilities',
        'Don\'t forget about your special abilities! They can turn the tide of battle.',
        '✨', 'Use an ability', 'not_using_abilities');
    }

    if (patterns.missingHeadshots) {
      return this.createTip('combat', 'low', 'Aim Higher',
        'Headshots deal extra damage. Try aiming slightly higher for critical hits.',
        '💀', 'Aim for headshots', 'no_headshots');
    }

    if (patterns.notCollectingPowerups) {
      return this.createTip('resources', 'low', 'Power-ups Available',
        'There are power-ups nearby that can help you. Try to collect them when safe.',
        '⭐', 'Collect power-ups', 'powerups_nearby');
    }

    // Encouragement based on skill trend
    if (analysis.skillTrend === 'improving') {
      return this.createTip('encouragement', 'low', 'Great Progress!',
        'Your performance is improving! Keep up the good work.',
        '🎊', null, 'improving');
    }

    if (analysis.skillTrend === 'declining' && analysis.weaknesses.length > 0) {
      return this.createTip('encouragement', 'low', 'Stay Focused',
        `You can do better! Focus on: ${analysis.weaknesses[0].toLowerCase()}.`,
        '💪', null, 'declining');
    }

    // No tip needed
    return null;
  }

  private createTip(
    category: TipCategory,
    priority: TipPriority,
    title: string,
    message: string,
    icon: string,
    actionable: string | null,
    trigger: string
  ): Tip {
    const duration = priority === 'critical' ? 8000 :
                     priority === 'high' ? 6000 :
                     priority === 'medium' ? 5000 : 4000;

    return {
      id: `tip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      category,
      priority,
      title,
      message,
      icon,
      duration,
      timestamp: Date.now(),
      actionable: actionable || undefined,
      trigger
    };
  }

  private getWeaponSuggestion(currentWeapon: string, enemiesNearby: number): string {
    if (enemiesNearby > 3 && currentWeapon === 'Sniper') {
      return 'You\'re surrounded! Switch to Shotgun or SMG for close combat.';
    }
    if (enemiesNearby < 2 && currentWeapon === 'Shotgun') {
      return 'Enemies are far away. Try using Rifle or Sniper for better range.';
    }
    if (currentWeapon === 'Pistol' && enemiesNearby > 2) {
      return 'Pistol isn\'t ideal here. Try a more powerful weapon like Rifle or Shotgun.';
    }
    return 'Consider switching to a weapon better suited for this situation.';
  }

  /**
   * Record player actions for tracking
   */
  public recordShot(hit: boolean, _headshot: boolean = false): void {
    this.shotsLastMinute++;
    if (hit) this.hitsLastMinute++;

    if (!hit) {
      this.consecutiveMisses++;
    } else {
      this.consecutiveMisses = 0;
    }

    // Update accuracy tracking
    const accuracy = this.hitsLastMinute / Math.max(this.shotsLastMinute, 1);
    const accuracyData = this.behaviorData.get('accuracy') || [];
    accuracyData.push(accuracy);
    if (accuracyData.length > 100) accuracyData.shift();
    this.behaviorData.set('accuracy', accuracyData);
  }

  public recordAbilityUse(): void {
    this.lastAbilityUse = Date.now();
  }

  public recordPowerupCollect(): void {
    this.lastPowerupCollect = Date.now();
  }

  public recordReload(): void {
    this.reloadCount++;
  }

  public recordWeaponSwitch(): void {
    this.lastWeaponSwitch = Date.now();
  }

  /**
   * Get recent tips
   */
  public getRecentTips(count: number = 5): Tip[] {
    return this.tipHistory.slice(-count);
  }

  /**
   * Get coaching statistics
   */
  public getStatistics(): {
    totalTips: number;
    tipsByCategory: Record<TipCategory, number>;
    mostCommonIssue: TipCategory | null;
    improvementRate: number;
  } {
    const tipsByCategory: Partial<Record<TipCategory, number>> = {};

    for (const tip of this.tipHistory) {
      tipsByCategory[tip.category] = (tipsByCategory[tip.category] || 0) + 1;
    }

    let mostCommon: TipCategory | null = null;
    let maxCount = 0;
    for (const [category, count] of Object.entries(tipsByCategory)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = category as TipCategory;
      }
    }

    // Calculate improvement rate based on tip frequency reduction
    const recentTips = this.tipHistory.slice(-20);
    const olderTips = this.tipHistory.slice(0, 20);
    const improvementRate = olderTips.length > 0 ?
      ((olderTips.length - recentTips.length) / olderTips.length) * 100 : 0;

    return {
      totalTips: this.tipHistory.length,
      tipsByCategory: tipsByCategory as Record<TipCategory, number>,
      mostCommonIssue: mostCommon,
      improvementRate
    };
  }

  /**
   * Reset the system
   */
  public reset(): void {
    this.tipHistory = [];
    this.lastTipTime = 0;
    this.behaviorData.clear();
    this.initializeBehaviorTracking();
    this.lastPositions = [];
    this.consecutiveMisses = 0;
    this.timeAtLowHealth = 0;
    this.reloadCount = 0;
  }
}
