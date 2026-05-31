export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
  reward?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/**
 * Stable, ordered list of achievement IDs. The index of each ID is its bit
 * position in the persisted `achievements` bitmask in Convex. APPEND-ONLY —
 * never reorder or remove entries, or existing players' unlocks will shift.
 */
export const ACHIEVEMENT_ORDER = [
  'first_blood', 'slayer', 'massacre', 'legend',
  'hot_streak', 'unstoppable',
  'survivor', 'veteran', 'invincible',
  'sharpshooter', 'deadeye',
  'close_call', 'resourceful', 'arsenal', 'speed_demon', 'no_damage',
  'team_player', 'champion',
  // ── APPENDED (indices 18+) — never reorder the entries above ──
  'goliath', 'boss_slayer',
  'frenzy', 'berserker',
  'centurion', 'high_roller',
  'blitz', 'flawless_master',
  'annihilator', 'immortal',
] as const;

export class AchievementSystem {
  private achievements: Map<string, Achievement> = new Map();
  private listeners: ((achievement: Achievement) => void)[] = [];
  private enabled: boolean;
  private persistLocal: boolean;

  /**
   * @param opts.enabled       when false, progress updates are ignored entirely
   *                           (guest play — achievements are locked).
   * @param opts.persistLocal  when true, mirror progress to localStorage. Off
   *                           by default; authenticated users use the DB instead.
   */
  constructor(opts?: { enabled?: boolean; persistLocal?: boolean }) {
    this.enabled = opts?.enabled ?? true;
    this.persistLocal = opts?.persistLocal ?? false;
    this.initializeAchievements();
    if (this.persistLocal) {
      this.loadProgress();
    }
  }

  /** Mark achievements unlocked from a persisted bitmask (DB hydration). */
  hydrateFromMask(mask: number) {
    ACHIEVEMENT_ORDER.forEach((id, index) => {
      if (mask & (1 << index)) {
        const achievement = this.achievements.get(id);
        if (achievement) {
          achievement.unlocked = true;
          achievement.progress = achievement.target;
        }
      }
    });
  }

  /** Bitmask of all currently-unlocked achievements. */
  getUnlockedMask(): number {
    let mask = 0;
    ACHIEVEMENT_ORDER.forEach((id, index) => {
      if (this.achievements.get(id)?.unlocked) {
        mask |= (1 << index);
      }
    });
    return mask;
  }

  private initializeAchievements() {
    // Targets/descriptions MUST match the trigger logic that drives them:
    //  - Career totals (persisted kills): slayer, massacre, legend
    //  - Best wave reached (career): survivor, veteran, invincible
    //  - Per-run feats: streaks, headshots, power-ups, weapons, flawless wave…
    //  - Career multiplayer (evaluated server-side): team_player, champion
    const achievementData: Achievement[] = [
      // ── Kills (career totals) ──
      {
        id: 'first_blood',
        name: 'First Blood',
        description: 'Defeat your first enemy',
        icon: '🩸',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Common Badge',
        rarity: 'common',
      },
      {
        id: 'slayer',
        name: 'Slayer',
        description: 'Defeat 50 enemies in total',
        icon: '⚔️',
        unlocked: false,
        progress: 0,
        target: 50,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'massacre',
        name: 'Massacre',
        description: 'Defeat 250 enemies in total',
        icon: '💀',
        unlocked: false,
        progress: 0,
        target: 250,
        reward: 'Epic Badge',
        rarity: 'epic',
      },
      {
        id: 'legend',
        name: 'Legend',
        description: 'Defeat 1,000 enemies in total',
        icon: '👑',
        unlocked: false,
        progress: 0,
        target: 1000,
        reward: 'Legendary Title',
        rarity: 'legendary',
      },

      // ── Kill streaks (single run) ──
      {
        id: 'hot_streak',
        name: 'Hot Streak',
        description: 'Reach a 10-kill streak in one run',
        icon: '🔥',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'unstoppable',
        name: 'Unstoppable',
        description: 'Reach a 25-kill streak in one run',
        icon: '⚡',
        unlocked: false,
        progress: 0,
        target: 25,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Survival (best wave reached) ──
      {
        id: 'survivor',
        name: 'Survivor',
        description: 'Reach wave 5',
        icon: '🏆',
        unlocked: false,
        progress: 0,
        target: 5,
        reward: 'Common Badge',
        rarity: 'common',
      },
      {
        id: 'veteran',
        name: 'Veteran',
        description: 'Reach wave 10',
        icon: '🎖️',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'invincible',
        name: 'Invincible',
        description: 'Reach wave 20',
        icon: '🛡️',
        unlocked: false,
        progress: 0,
        target: 20,
        reward: 'Legendary Title',
        rarity: 'legendary',
      },

      // ── Headshots (single run) ──
      {
        id: 'sharpshooter',
        name: 'Sharpshooter',
        description: 'Land 10 headshots in one run',
        icon: '🎯',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'deadeye',
        name: 'Deadeye',
        description: 'Land 50 headshots in one run',
        icon: '🎱',
        unlocked: false,
        progress: 0,
        target: 50,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Single-run feats ──
      {
        id: 'close_call',
        name: 'Close Call',
        description: 'Survive a hit that drops you below 10 HP',
        icon: '💓',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'resourceful',
        name: 'Resourceful',
        description: 'Collect 20 power-ups in one run',
        icon: '🎁',
        unlocked: false,
        progress: 0,
        target: 20,
        reward: 'Common Badge',
        rarity: 'common',
      },
      {
        id: 'arsenal',
        name: 'Arsenal',
        description: 'Unlock every weapon in one run',
        icon: '🔫',
        unlocked: false,
        progress: 0,
        target: 7,
        reward: 'Epic Badge',
        rarity: 'epic',
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Defeat 5 enemies within 10 seconds',
        icon: '💨',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Epic Badge',
        rarity: 'epic',
      },
      {
        id: 'no_damage',
        name: 'Flawless',
        description: 'Clear a wave without taking damage',
        icon: '✨',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Multiplayer (career, evaluated server-side) ──
      {
        id: 'team_player',
        name: 'Team Player',
        description: 'Play 10 multiplayer matches',
        icon: '👥',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'champion',
        name: 'Champion',
        description: 'Win 5 multiplayer matches',
        icon: '🏅',
        unlocked: false,
        progress: 0,
        target: 5,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Boss kills (single run) ──
      {
        id: 'goliath',
        name: 'Goliath Slain',
        description: 'Defeat a boss enemy',
        icon: '🪓',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'boss_slayer',
        name: 'Boss Slayer',
        description: 'Defeat 10 boss enemies in one run',
        icon: '🐲',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Combos (single run) ──
      {
        id: 'frenzy',
        name: 'Frenzy',
        description: 'Reach a 10x combo in one run',
        icon: '🔥',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'berserker',
        name: 'Berserker',
        description: 'Reach a 20x combo in one run',
        icon: '😤',
        unlocked: false,
        progress: 0,
        target: 20,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Score (single run) ──
      {
        id: 'centurion',
        name: 'Centurion',
        description: 'Score 10,000 points in one run',
        icon: '💯',
        unlocked: false,
        progress: 0,
        target: 10000,
        reward: 'Rare Badge',
        rarity: 'rare',
      },
      {
        id: 'high_roller',
        name: 'High Roller',
        description: 'Score 50,000 points in one run',
        icon: '🎰',
        unlocked: false,
        progress: 0,
        target: 50000,
        reward: 'Legendary Title',
        rarity: 'legendary',
      },

      // ── Tempo & flawless (single run) ──
      {
        id: 'blitz',
        name: 'Blitz',
        description: 'Defeat 10 enemies within 10 seconds',
        icon: '🌪️',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: 'Epic Badge',
        rarity: 'epic',
      },
      {
        id: 'flawless_master',
        name: 'Untouchable',
        description: 'Clear 5 waves without taking damage in one run',
        icon: '🛡️',
        unlocked: false,
        progress: 0,
        target: 5,
        reward: 'Epic Badge',
        rarity: 'epic',
      },

      // ── Career milestones ──
      {
        id: 'annihilator',
        name: 'Annihilator',
        description: 'Defeat 5,000 enemies in total',
        icon: '☠️',
        unlocked: false,
        progress: 0,
        target: 5000,
        reward: 'Legendary Title',
        rarity: 'legendary',
      },
      {
        id: 'immortal',
        name: 'Immortal',
        description: 'Reach wave 30',
        icon: '♾️',
        unlocked: false,
        progress: 0,
        target: 30,
        reward: 'Legendary Title',
        rarity: 'legendary',
      },
    ];

    achievementData.forEach((achievement) => {
      this.achievements.set(achievement.id, achievement);
    });
  }

  private loadProgress() {
    try {
      const saved = localStorage.getItem('achievements');
      if (saved) {
        const progress = JSON.parse(saved);
        const entries = Object.entries(progress as Record<string, { unlocked?: boolean; progress?: number }>);
        entries.forEach(([id, data]) => {
          const achievement = this.achievements.get(id);
          if (achievement) {
            if (typeof data.unlocked === 'boolean') achievement.unlocked = data.unlocked;
            if (typeof data.progress === 'number') achievement.progress = data.progress;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load achievements:', error);
    }
  }

  private saveProgress() {
    if (!this.persistLocal) return;
    try {
      const progress: Record<string, { unlocked: boolean; progress: number }> = {};
      this.achievements.forEach((achievement, id) => {
        progress[id] = {
          unlocked: achievement.unlocked,
          progress: achievement.progress
        };
      });
      localStorage.setItem('achievements', JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save achievements:', error);
    }
  }

  updateProgress(achievementId: string, increment: number = 1): boolean {
    if (!this.enabled) return false;
    const achievement = this.achievements.get(achievementId);
    if (!achievement || achievement.unlocked) return false;

    achievement.progress = Math.min(achievement.progress + increment, achievement.target);

    if (achievement.progress >= achievement.target && !achievement.unlocked) {
      achievement.unlocked = true;
      this.saveProgress();
      this.notifyUnlock(achievement);
      return true;
    }

    this.saveProgress();
    return false;
  }

  setProgress(achievementId: string, value: number): boolean {
    if (!this.enabled) return false;
    const achievement = this.achievements.get(achievementId);
    if (!achievement || achievement.unlocked) return false;

    achievement.progress = Math.min(value, achievement.target);

    if (achievement.progress >= achievement.target && !achievement.unlocked) {
      achievement.unlocked = true;
      this.saveProgress();
      this.notifyUnlock(achievement);
      return true;
    }

    this.saveProgress();
    return false;
  }

  onUnlock(callback: (achievement: Achievement) => void) {
    this.listeners.push(callback);
  }

  private notifyUnlock(achievement: Achievement) {
    this.listeners.forEach(callback => callback(achievement));
  }

  getAllAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }
}
