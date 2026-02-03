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

export class AchievementSystem {
  private achievements: Map<string, Achievement> = new Map();
  private listeners: ((achievement: Achievement) => void)[] = [];

  constructor() {
    this.initializeAchievements();
    this.loadProgress();
  }

  private initializeAchievements() {
    const achievementData: Achievement[] = [
      // Kill-based achievements
      {
        id: 'first_blood',
        name: 'First Blood',
        description: 'Kill your first enemy',
        icon: '🩸',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: '+100 Score',
        rarity: 'common'
      },
      {
        id: 'slayer',
        name: 'Slayer',
        description: 'Kill 50 enemies',
        icon: '⚔️',
        unlocked: false,
        progress: 0,
        target: 50,
        reward: '+500 Score',
        rarity: 'rare'
      },
      {
        id: 'massacre',
        name: 'Massacre',
        description: 'Kill 100 enemies',
        icon: '💀',
        unlocked: false,
        progress: 0,
        target: 100,
        reward: '+1000 Score',
        rarity: 'epic'
      },
      {
        id: 'legend',
        name: 'Legend',
        description: 'Kill 500 enemies',
        icon: '👑',
        unlocked: false,
        progress: 0,
        target: 500,
        reward: 'Legendary Title',
        rarity: 'legendary'
      },

      // Streak-based
      {
        id: 'hot_streak',
        name: 'Hot Streak',
        description: 'Get a 10 kill streak',
        icon: '🔥',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: '+200 Score',
        rarity: 'rare'
      },
      {
        id: 'unstoppable',
        name: 'Unstoppable',
        description: 'Get a 25 kill streak',
        icon: '⚡',
        unlocked: false,
        progress: 0,
        target: 25,
        reward: '+500 Score',
        rarity: 'epic'
      },

      // Survival-based
      {
        id: 'survivor',
        name: 'Survivor',
        description: 'Survive 5 waves',
        icon: '🏆',
        unlocked: false,
        progress: 0,
        target: 5,
        reward: '+300 Score',
        rarity: 'common'
      },
      {
        id: 'veteran',
        name: 'Veteran',
        description: 'Survive 10 waves',
        icon: '🎖️',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: '+600 Score',
        rarity: 'rare'
      },
      {
        id: 'invincible',
        name: 'Invincible',
        description: 'Survive 20 waves',
        icon: '👑',
        unlocked: false,
        progress: 0,
        target: 20,
        reward: 'Special Title',
        rarity: 'legendary'
      },

      // Accuracy-based
      {
        id: 'sharpshooter',
        name: 'Sharpshooter',
        description: 'Get 10 headshots',
        icon: '🎯',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: '+250 Score',
        rarity: 'rare'
      },
      {
        id: 'deadeye',
        name: 'Deadeye',
        description: 'Get 50 headshots',
        icon: '🎱',
        unlocked: false,
        progress: 0,
        target: 50,
        reward: '+750 Score',
        rarity: 'epic'
      },

      // Special achievements
      {
        id: 'close_call',
        name: 'Close Call',
        description: 'Survive with less than 10 HP',
        icon: '💓',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: '+150 Score',
        rarity: 'rare'
      },
      {
        id: 'resourceful',
        name: 'Resourceful',
        description: 'Pick up 20 power-ups',
        icon: '🎁',
        unlocked: false,
        progress: 0,
        target: 20,
        reward: '+200 Score',
        rarity: 'common'
      },
      {
        id: 'arsenal',
        name: 'Arsenal',
        description: 'Unlock all weapons',
        icon: '🔫',
        unlocked: false,
        progress: 0,
        target: 7,
        reward: '+1000 Score',
        rarity: 'epic'
      },
      {
        id: 'speed_demon',
        name: 'Speed Demon',
        description: 'Kill 5 enemies in 10 seconds',
        icon: '💨',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: '+300 Score',
        rarity: 'epic'
      },
      {
        id: 'no_damage',
        name: 'Flawless Victory',
        description: 'Complete a wave without taking damage',
        icon: '✨',
        unlocked: false,
        progress: 0,
        target: 1,
        reward: '+400 Score',
        rarity: 'epic'
      },

      // Multiplayer achievements
      {
        id: 'team_player',
        name: 'Team Player',
        description: 'Play 10 multiplayer matches',
        icon: '👥',
        unlocked: false,
        progress: 0,
        target: 10,
        reward: '+500 Score',
        rarity: 'rare'
      },
      {
        id: 'champion',
        name: 'Champion',
        description: 'Win 5 multiplayer matches',
        icon: '🏅',
        unlocked: false,
        progress: 0,
        target: 5,
        reward: '+1000 Score',
        rarity: 'epic'
      }
    ];

    achievementData.forEach(achievement => {
      this.achievements.set(achievement.id, achievement);
    });
  }

  private loadProgress() {
    try {
      const saved = localStorage.getItem('achievements');
      if (saved) {
        const progress = JSON.parse(saved);
        Object.entries(progress).forEach(([id, data]: [string, any]) => {
          const achievement = this.achievements.get(id);
          if (achievement) {
            achievement.unlocked = data.unlocked;
            achievement.progress = data.progress;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load achievements:', error);
    }
  }

  private saveProgress() {
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

  getAchievement(id: string): Achievement | undefined {
    return this.achievements.get(id);
  }

  getAllAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }

  getUnlockedAchievements(): Achievement[] {
    return Array.from(this.achievements.values()).filter(a => a.unlocked);
  }

  getUnlockedCount(): number {
    return this.getUnlockedAchievements().length;
  }

  getTotalCount(): number {
    return this.achievements.size;
  }

  getCompletionPercent(): number {
    return (this.getUnlockedCount() / this.getTotalCount()) * 100;
  }

  resetAll() {
    this.achievements.forEach(achievement => {
      achievement.unlocked = false;
      achievement.progress = 0;
    });
    this.saveProgress();
  }
}
