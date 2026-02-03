import * as THREE from 'three';
import { AIBehaviorSystem } from '../utils/AIBehaviorSystem';
import { EnemyPerception } from '../utils/EnemyPerception';
import { AttackSystem } from '../utils/AttackSystem';
import { ObstacleAvoidance } from '../utils/ObstacleAvoidance';
import { BulletDodging } from '../utils/BulletDodging';

export interface Weapon {
  name: string;
  damage: number;
  fireRate: number;
  maxAmmo: number;
  reloadTime: number;
  bulletSpeed: number;
  bulletColor: number;
  spread: number;
  unlockScore: number;
  autoFire?: boolean; // Whether weapon fires automatically when mouse held
  weight: number; // Weight affects movement speed
  canAim?: boolean; // Whether weapon supports right-click aiming
}

export const WEAPONS: Record<string, Weapon> = {
  pistol: {
    name: '🔫 Pistol',
    damage: 25,
    fireRate: 300,
    maxAmmo: 12,
    reloadTime: 1000,
    bulletSpeed: 2,
    bulletColor: 0xffff00,
    spread: 0.02,
    unlockScore: 0,
    weight: 1.0, // Light weapon - full speed
    canAim: false
  },
  rifle: {
    name: '🔪 Rifle',
    damage: 35,
    fireRate: 150,
    maxAmmo: 30,
    reloadTime: 1500,
    bulletSpeed: 3,
    bulletColor: 0xff6600,
    spread: 0.01,
    unlockScore: 100,
    weight: 1.5, // Medium weight
    canAim: true // Rifle can aim
  },
  shotgun: {
    name: '💥 Shotgun',
    damage: 15,
    fireRate: 800,
    maxAmmo: 8,
    reloadTime: 2000,
    bulletSpeed: 1.5,
    bulletColor: 0xff0000,
    spread: 0.15,
    unlockScore: 200,
    weight: 1.7, // Heavy weapon
    canAim: false
  },
  smg: {
    name: '🔫 SMG',
    damage: 20,
    fireRate: 100,
    maxAmmo: 40,
    reloadTime: 1200,
    bulletSpeed: 2.5,
    bulletColor: 0x00ffff,
    spread: 0.03,
    unlockScore: 300,
    autoFire: true,
    weight: 1.2, // Light-medium weight
    canAim: false
  },
  sniper: {
    name: '🎯 Sniper',
    damage: 100,
    fireRate: 1200,
    maxAmmo: 5,
    reloadTime: 2500,
    bulletSpeed: 5,
    bulletColor: 0x00ff00,
    spread: 0.005,
    unlockScore: 500,
    autoFire: false,
    weight: 2.0, // Heavy weapon - slower movement
    canAim: true // Sniper can aim
  },
  minigun: {
    name: '⚡ Minigun',
    damage: 30,
    fireRate: 50,
    maxAmmo: 100,
    reloadTime: 3000,
    bulletSpeed: 3,
    bulletColor: 0xffaa00, // Realistic yellow-orange fire
    spread: 0.05,
    unlockScore: 800,
    autoFire: true,
    weight: 3.0, // Very heavy - significantly slower
    canAim: false
  },
  launcher: {
    name: '🚀 Launcher',
    damage: 150,
    fireRate: 2000,
    maxAmmo: 3,
    reloadTime: 3500,
    bulletSpeed: 1.8,
    bulletColor: 0xff4400,
    spread: 0.01,
    unlockScore: 1200,
    autoFire: false,
    weight: 2.5, // Very heavy
    canAim: false
  }
};

export interface Enemy {
  mesh: THREE.Group;
  health: number;
  maxHealth: number;
  speed: number;
  dead: boolean;
  type: 'normal' | 'fast' | 'tank' | 'boss';
  damage: number;
  scoreValue: number;
  // Animation state
  walkTime: number;
  damageFlashTime: number;
  deathTime: number;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  leftArm?: THREE.Mesh;
  rightArm?: THREE.Mesh;
  torso?: THREE.Mesh;
  // AI state
  targetPosition: THREE.Vector3;
  spreadOffset: THREE.Vector2;
  lastPathUpdate: number;
  stuckTimer: number;
  lastPosition: THREE.Vector3;
  behaviorState: 'chase' | 'flank' | 'retreat' | 'attack';
  aggroRange: number;
  // Advanced AI
  dodgeSkill: number; // 0-1, higher = better at dodging
  reactionTime: number; // milliseconds
  lastDodgeTime: number;
  dodgeCooldown: number;
  detectedBullets: Set<THREE.Mesh>;
  // Attack animation
  isAttacking: boolean;
  attackTime: number;
  attackCooldown: number;
  lastAttackTime: number;
  // NEW: Advanced AI Systems
  aiBehavior?: AIBehaviorSystem;
  perception?: EnemyPerception;
  attackSystem?: AttackSystem;
  obstacleAvoidance?: ObstacleAvoidance;
  bulletDodging?: BulletDodging;
  playerVelocity?: THREE.Vector3; // Track player velocity for prediction
  isDodging?: boolean; // Currently performing dodge maneuver
  dodgeDirection?: THREE.Vector3; // Direction of current dodge
  // Object pooling support
  poolId?: number; // ID for returning mesh to pool when enemy dies
}

export interface Bullet {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  damage: number;
}

export type PowerUpType = 'health' | 'ammo' | 'speed' | 'damage' | 'shield' | 'infinite_ammo';

export interface PowerUp {
  mesh: THREE.Mesh;
  type: PowerUpType;
  position: THREE.Vector3;
  collected: boolean;
}

export interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface Tree {
  mesh: THREE.Group;
  x: number;
  z: number;
}

export interface TerrainObject {
  mesh: THREE.Group | THREE.Mesh;
  x: number;
  z: number;
  type: 'tree' | 'rock' | 'boulder' | 'bush' | 'water' | 'cactus';
  collidable: boolean;
  radius: number;
}

export interface Keys {
  [key: string]: boolean;
}

export interface GameState {
  health: number;
  ammo: number;
  maxAmmo: number;
  score: number;
  enemiesKilled: number;
  wave: number;
  isGameOver: boolean;
  isVictory: boolean;
  combo: number;
  killStreak: number;
  currentWeapon: string;
  unlockedWeapons: string[];
}
