/**
 * COMPREHENSIVE TUTORIAL SYSTEM
 *
 * Context-aware, adaptive tutorial system that guides players through
 * game mechanics based on their actions and progress. Features interactive
 * hints, progressive learning, and smart detection of player needs.
 *
 * Features:
 * - Progressive tutorial steps
 * - Context-aware hints
 * - Action-based triggers
 * - Completion tracking
 * - Adaptive pacing
 */

export type TutorialCategory = 'basic' | 'combat' | 'movement' | 'abilities' | 'advanced' | 'multiplayer';

export interface TutorialStep {
  id: string;
  category: TutorialCategory;
  title: string;
  description: string;
  instructions: string[];
  icon: string;
  required: boolean; // Must complete to proceed
  completionCondition: TutorialCondition;
  completed: boolean;
  skipped: boolean;
  timeStarted?: number;
  timeCompleted?: number;
  highlightElement?: string; // UI element to highlight
  position?: 'top' | 'bottom' | 'center' | 'left' | 'right';
}

export interface TutorialCondition {
  type: 'action' | 'stat' | 'time' | 'custom';
  action?: string; // e.g., 'shoot', 'move', 'kill_enemy'
  count?: number; // How many times
  stat?: string; // e.g., 'health', 'ammo'
  value?: number; // Target value
  duration?: number; // Time in ms
  checkFunction?: () => boolean; // Custom check
}

export interface TutorialState {
  active: boolean;
  currentStep: number;
  completedSteps: Set<string>;
  skippedSteps: Set<string>;
  totalProgress: number; // 0-100
  tutorialEnabled: boolean;
  showHints: boolean;
}

export class TutorialSystem {
  private steps: TutorialStep[] = [];
  private state: TutorialState;
  private actionCounts: Map<string, number> = new Map();
  private lastHintTime: number = 0;
  private hintCooldown: number = 10000; // 10 seconds

  constructor() {
    this.state = {
      active: false,
      currentStep: 0,
      completedSteps: new Set(),
      skippedSteps: new Set(),
      totalProgress: 0,
      tutorialEnabled: true,
      showHints: true
    };

    this.initializeTutorial();
  }

  private initializeTutorial(): void {
    // BASIC TUTORIAL
    this.addStep({
      id: 'welcome',
      category: 'basic',
      title: 'Welcome to the Forest',
      description: 'Learn the basics of survival',
      instructions: [
        'Welcome, survivor! You\'re stranded in a hostile forest.',
        'This is a safe training ground — you can\'t be hurt, sprinting never tires you, and every weapon is unlocked.',
        'New enemy types will reveal themselves as you fight. Let\'s start with the basics...'
      ],
      icon: '👋',
      required: true,
      completionCondition: { type: 'time', duration: 3000 },
      completed: false,
      skipped: false,
      position: 'center'
    });

    this.addStep({
      id: 'movement_basic',
      category: 'movement',
      title: 'Movement Controls',
      description: 'Learn how to move around',
      instructions: [
        'Use WASD keys to move around',
        'W / A / S / D to move in any direction',
        'Hold SHIFT to sprint — in training your stamina is unlimited',
        'Press SPACE to jump and CTRL to crouch',
        'Move in any direction to continue'
      ],
      icon: '🎮',
      required: true,
      completionCondition: { type: 'action', action: 'move', count: 30 },
      completed: false,
      skipped: false,
      position: 'bottom'
    });

    this.addStep({
      id: 'camera_control',
      category: 'basic',
      title: 'Camera Control',
      description: 'Look around your environment',
      instructions: [
        'Move your mouse to look around',
        'The camera follows your mouse movement',
        'Practice looking in different directions'
      ],
      icon: '👁️',
      required: true,
      completionCondition: { type: 'action', action: 'look', count: 20 },
      completed: false,
      skipped: false,
      position: 'top'
    });

    // COMBAT TUTORIAL
    this.addStep({
      id: 'shooting_basic',
      category: 'combat',
      title: 'Combat Basics',
      description: 'Learn to fight enemies',
      instructions: [
        'Left-click to shoot your weapon',
        'Aim at enemies with your crosshair',
        'Fire 10 shots to continue'
      ],
      icon: '🔫',
      required: true,
      completionCondition: { type: 'action', action: 'shoot', count: 10 },
      completed: false,
      skipped: false,
      position: 'center'
    });

    this.addStep({
      id: 'kill_enemy',
      category: 'combat',
      title: 'Eliminate Threats',
      description: 'Defeat your first enemy',
      instructions: [
        'An enemy is approaching!',
        'Aim carefully and shoot to eliminate it',
        'As you rack up kills, new foes appear — nimble Stalkers, armored Brutes, and the mighty Warden',
        'Watch for the "New Threat" banner that introduces each one',
        'Kill your first enemy to continue'
      ],
      icon: '💀',
      required: true,
      completionCondition: { type: 'action', action: 'kill', count: 1 },
      completed: false,
      skipped: false,
      position: 'top'
    });

    this.addStep({
      id: 'reloading',
      category: 'combat',
      title: 'Reload Your Weapon',
      description: 'Keep your weapon ready',
      instructions: [
        'Press R to reload when ammo is low',
        'Watch your ammo count in the HUD',
        'Reload before you run out in combat!',
        'Reload your weapon to continue'
      ],
      icon: '🔄',
      required: true,
      completionCondition: { type: 'action', action: 'reload', count: 1 },
      completed: false,
      skipped: false,
      highlightElement: 'ammo-display',
      position: 'right'
    });

    this.addStep({
      id: 'weapon_switching',
      category: 'combat',
      title: 'Switch Weapons',
      description: 'Use different weapons for different situations',
      instructions: [
        'Scroll the mouse wheel — or press number keys 1-7 — to switch weapons',
        'Each weapon has unique stats and behavior',
        'In Tutorial mode every weapon is already unlocked for you'
      ],
      icon: '⚔️',
      required: false,
      completionCondition: { type: 'action', action: 'switch_weapon', count: 1 },
      completed: false,
      skipped: false,
      position: 'right'
    });

    // ABILITY TUTORIAL
    this.addStep({
      id: 'abilities_intro',
      category: 'abilities',
      title: 'Power-Ups & Loot',
      description: 'Unlock your potential',
      instructions: [
        'Defeated enemies drop loot crates with a random power-up',
        'You can carry only ONE power-up at a time',
        'Press E to activate your held power-up, then find more loot',
        'Dash is always available — let\'s try it next...'
      ],
      icon: '✨',
      required: true,
      completionCondition: { type: 'time', duration: 4000 },
      completed: false,
      skipped: false,
      highlightElement: 'abilities-bar',
      position: 'bottom'
    });

    this.addStep({
      id: 'dash_ability',
      category: 'abilities',
      title: 'Dash Ability',
      description: 'Quick movement burst',
      instructions: [
        'Press Q to Dash',
        'Dash gives you a quick burst of speed',
        'Great for dodging attacks or closing distance',
        'Try it out once the tutorial finishes'
      ],
      icon: '⚡',
      required: true,
      completionCondition: { type: 'action', action: 'use_ability', count: 1 },
      completed: false,
      skipped: false,
      position: 'bottom'
    });

    this.addStep({
      id: 'ability_cooldown',
      category: 'abilities',
      title: 'Ability Cooldowns',
      description: 'Manage your resources',
      instructions: [
        'Abilities have cooldowns after use',
        'Watch the cooldown timer on each ability',
        'Plan your ability usage strategically'
      ],
      icon: '⏱️',
      required: false,
      completionCondition: { type: 'time', duration: 3000 },
      completed: false,
      skipped: false,
      position: 'bottom'
    });

    // ADVANCED TUTORIAL
    this.addStep({
      id: 'powerups',
      category: 'advanced',
      title: 'Power-ups',
      description: 'Collect enhancements',
      instructions: [
        'Loot crates drop from defeated enemies — the power inside is random',
        'Walk over one to pick it up (you can hold just one)',
        'Press E to use it, then hunt for more loot',
        'Collect a power-up to continue'
      ],
      icon: '⭐',
      required: false,
      completionCondition: { type: 'action', action: 'collect_powerup', count: 1 },
      completed: false,
      skipped: false,
      position: 'center'
    });

    this.addStep({
      id: 'headshots',
      category: 'advanced',
      title: 'Precision Shooting',
      description: 'Master headshots for bonus damage',
      instructions: [
        'Aim for enemy heads for critical hits',
        'Headshots deal significantly more damage',
        'Practice your aim to become a sharpshooter',
        'Score a headshot to continue'
      ],
      icon: '🎯',
      required: false,
      completionCondition: { type: 'action', action: 'headshot', count: 1 },
      completed: false,
      skipped: false,
      position: 'top'
    });

    this.addStep({
      id: 'combo_system',
      category: 'advanced',
      title: 'Combo System',
      description: 'Build momentum for higher scores',
      instructions: [
        'Kill enemies quickly to build a combo',
        'Higher combos mean more points',
        'Don\'t let the combo timer run out!',
        'Build a 3x combo to continue'
      ],
      icon: '🔥',
      required: false,
      completionCondition: { type: 'action', action: 'combo_3x', count: 1 },
      completed: false,
      skipped: false,
      highlightElement: 'combo-display',
      position: 'left'
    });

    this.addStep({
      id: 'strategy',
      category: 'advanced',
      title: 'Survival Strategy',
      description: 'Tips for lasting longer',
      instructions: [
        'Keep moving — stationary targets are easy to hit',
        'Stalkers are fast but fragile — strafe and track them',
        'Brutes are armored — aim for the head and keep your distance',
        'The Warden is a deadly apex predator — dash to dodge and use power-ups',
        'Different weapons shine at different ranges — experiment freely here',
        'Practise as long as you like — the training ground never ends'
      ],
      icon: '🧠',
      required: false,
      completionCondition: { type: 'time', duration: 8000 },
      completed: false,
      skipped: false,
      position: 'center'
    });

    // MULTIPLAYER TUTORIAL
    this.addStep({
      id: 'multiplayer_intro',
      category: 'multiplayer',
      title: 'Multiplayer Mode',
      description: 'Play with others',
      instructions: [
        'Multiplayer allows you to play with friends',
        'Host a lobby or join an existing one',
        'Work together to survive or compete',
        'Use chat to communicate with teammates'
      ],
      icon: '👥',
      required: false,
      completionCondition: { type: 'custom' },
      completed: false,
      skipped: false,
      position: 'center'
    });

    this.addStep({
      id: 'tutorial_complete',
      category: 'basic',
      title: 'Tutorial Complete!',
      description: 'You\'re ready to survive',
      instructions: [
        'Congratulations! You\'ve completed the tutorial.',
        'You now know the basics of survival.',
        'Remember: practice makes perfect!',
        'Good luck, survivor. The forest awaits...'
      ],
      icon: '🎉',
      required: true,
      completionCondition: { type: 'custom' },
      completed: false,
      skipped: false,
      position: 'center'
    });
  }

  private addStep(step: TutorialStep): void {
    this.steps.push(step);
  }

  /**
   * Start the tutorial
   */
  public start(): void {
    if (!this.state.tutorialEnabled) return;

    this.state.active = true;
    this.state.currentStep = 0;
    this.resetProgress();

    // Mark first step as started
    if (this.steps.length > 0) {
      this.steps[0].timeStarted = Date.now();
    }

  }

  /**
   * Stop/pause the tutorial
   */
  public stop(): void {
    this.state.active = false;
  }

  /**
   * Skip current step
   */
  public skipCurrentStep(): void {
    const step = this.getCurrentStep();
    if (!step) return;

    if (step.required) {
      return;
    }

    step.skipped = true;
    this.state.skippedSteps.add(step.id);
    this.nextStep();

  }

  /**
   * Record player action for tutorial progression
   */
  public recordAction(action: string, count: number = 1): void {
    if (!this.state.active) return;

    // Update action count
    const currentCount = this.actionCounts.get(action) || 0;
    this.actionCounts.set(action, currentCount + count);

    // Check if current step is completed
    this.checkStepCompletion();
  }

  /**
   * Check if current step is completed
   */
  private checkStepCompletion(): boolean {
    const step = this.getCurrentStep();
    if (!step || step.completed) return false;

    const condition = step.completionCondition;
    let completed = false;

    switch (condition.type) {
      case 'action':
        if (condition.action && condition.count) {
          const actionCount = this.actionCounts.get(condition.action) || 0;
          completed = actionCount >= condition.count;
        }
        break;

      case 'stat':
        // Would need to pass in game state
        // For now, handled externally
        break;

      case 'time':
        if (condition.duration && step.timeStarted) {
          const elapsed = Date.now() - step.timeStarted;
          completed = elapsed >= condition.duration;
        }
        break;

      case 'custom':
        if (condition.checkFunction) {
          completed = condition.checkFunction();
        }
        break;
    }

    if (completed) {
      this.completeCurrentStep();
      return true;
    }

    return false;
  }

  /**
   * Complete current step and move to next
   */
  private completeCurrentStep(): void {
    const step = this.getCurrentStep();
    if (!step) return;

    step.completed = true;
    step.timeCompleted = Date.now();
    this.state.completedSteps.add(step.id);


    // Calculate progress
    this.updateProgress();

    // Auto-advance to next step
    setTimeout(() => this.nextStep(), 1000);
  }

  /**
   * Move to next step
   */
  private nextStep(): void {
    if (this.state.currentStep < this.steps.length - 1) {
      this.state.currentStep++;
      const nextStep = this.getCurrentStep();

      if (nextStep) {
        nextStep.timeStarted = Date.now();
      }
    } else {
      // Tutorial complete
      this.completeTutorial();
    }
  }

  /**
   * Complete the entire tutorial
   */
  private completeTutorial(): void {
    this.state.active = false;
    this.state.totalProgress = 100;

  }

  /**
   * Update progress percentage
   */
  private updateProgress(): void {
    const required = this.steps.filter(s => s.required).length;
    const completedRequired = this.steps.filter(s => s.required && s.completed).length;

    this.state.totalProgress = (completedRequired / required) * 100;
  }

  /**
   * Get current tutorial step
   */
  public getCurrentStep(): TutorialStep | null {
    if (!this.state.active) return null;
    return this.steps[this.state.currentStep] || null;
  }

  /**
   * Get all steps
   */
  public getAllSteps(): TutorialStep[] {
    return [...this.steps];
  }

  /**
   * Get steps by category
   */
  public getStepsByCategory(category: TutorialCategory): TutorialStep[] {
    return this.steps.filter(s => s.category === category);
  }

  /**
   * Check if tutorial is active
   */
  public isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get current progress
   */
  public getProgress(): number {
    return this.state.totalProgress;
  }

  /**
   * Get tutorial state
   */
  public getState(): TutorialState {
    return { ...this.state };
  }

  /**
   * Enable/disable tutorial system
   */
  public setEnabled(enabled: boolean): void {
    this.state.tutorialEnabled = enabled;

    if (!enabled && this.state.active) {
      this.stop();
    }
  }

  /**
   * Enable/disable hints
   */
  public setShowHints(show: boolean): void {
    this.state.showHints = show;
  }

  /**
   * Get contextual hint based on player state
   */
  public getContextualHint(gameState: {
    health: number;
    maxHealth: number;
    ammo: number;
    enemiesNearby: number;
    hasAbilitiesReady: boolean;
  }): string | null {
    if (!this.state.showHints) return null;

    const now = Date.now();
    if (now - this.lastHintTime < this.hintCooldown) return null;

    let hint: string | null = null;

    // Generate contextual hints
    const healthPercent = (gameState.health / gameState.maxHealth) * 100;

    if (healthPercent < 30 && gameState.enemiesNearby > 2) {
      hint = '⚠️ Low health and surrounded! Consider retreating or using defensive abilities.';
    } else if (gameState.ammo < 10 && gameState.enemiesNearby > 1) {
      hint = '📉 Low ammo! Switch weapons or look for ammo power-ups.';
    } else if (gameState.hasAbilitiesReady && gameState.enemiesNearby > 3) {
      hint = '✨ Multiple enemies nearby - perfect time to use an ability!';
    } else if (healthPercent < 50 && !gameState.hasAbilitiesReady) {
      hint = '💚 Look for health power-ups to restore your health.';
    }

    if (hint) {
      this.lastHintTime = now;
    }

    return hint;
  }

  /**
   * Reset tutorial progress
   */
  public reset(): void {
    this.state.currentStep = 0;
    this.state.completedSteps.clear();
    this.state.skippedSteps.clear();
    this.state.totalProgress = 0;
    this.actionCounts.clear();

    // Reset all steps
    for (const step of this.steps) {
      step.completed = false;
      step.skipped = false;
      step.timeStarted = undefined;
      step.timeCompleted = undefined;
    }

  }

  private resetProgress(): void {
    this.actionCounts.clear();
    this.state.completedSteps.clear();
    this.state.skippedSteps.clear();
    this.state.totalProgress = 0;
  }

  /**
   * Mark a specific step as completed (for custom conditions)
   */
  public completeStep(stepId: string): void {
    const step = this.steps.find(s => s.id === stepId);
    if (!step) return;

    step.completed = true;
    step.timeCompleted = Date.now();
    this.state.completedSteps.add(step.id);

    this.updateProgress();

    // If it's the current step, advance immediately
    const currentStep = this.getCurrentStep();
    if (currentStep && currentStep.id === stepId) {
      this.nextStep();
    }
  }
}
