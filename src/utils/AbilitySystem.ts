import * as THREE from 'three';

export type AbilityType = 'dash' | 'shield' | 'speed' | 'invincible' | 'explosive' | 'heal';

export interface Ability {
  type: AbilityType;
  name: string;
  description: string;
  icon: string;
  cooldown: number; // milliseconds
  duration: number; // milliseconds
  lastUsed: number;
  active: boolean;
  activeUntil: number;
}

export interface AbilityEffects {
  speedMultiplier: number;
  isInvincible: boolean;
  hasShield: boolean;
  shieldHealth: number;
}

export class AbilitySystem {
  private abilities: Map<AbilityType, Ability> = new Map();
  private effects: AbilityEffects = {
    speedMultiplier: 1.0,
    isInvincible: false,
    hasShield: false,
    shieldHealth: 0
  };

  constructor() {
    this.initializeAbilities();
  }

  private initializeAbilities() {
    const abilityData: Record<AbilityType, Omit<Ability, 'lastUsed' | 'active' | 'activeUntil'>> = {
      dash: {
        type: 'dash',
        name: 'Dash',
        description: 'Quick burst of speed forward',
        icon: '⚡',
        cooldown: 3000,
        duration: 500
      },
      shield: {
        type: 'shield',
        name: 'Energy Shield',
        description: 'Temporary shield absorbing 50 damage',
        icon: '🛡️',
        cooldown: 15000,
        duration: 10000
      },
      speed: {
        type: 'speed',
        name: 'Sprint',
        description: '2x movement speed',
        icon: '🏃',
        cooldown: 8000,
        duration: 5000
      },
      invincible: {
        type: 'invincible',
        name: 'Ghost Mode',
        description: 'Become invincible for 3 seconds',
        icon: '👻',
        cooldown: 30000,
        duration: 3000
      },
      explosive: {
        type: 'explosive',
        name: 'Explosive Shot',
        description: 'Next shot deals AoE damage',
        icon: '💥',
        cooldown: 12000,
        duration: 10000
      },
      heal: {
        type: 'heal',
        name: 'Quick Heal',
        description: 'Instantly restore 30 HP',
        icon: '❤️',
        cooldown: 10000,
        duration: 0
      }
    };

    Object.entries(abilityData).forEach(([type, data]) => {
      this.abilities.set(type as AbilityType, {
        ...data,
        lastUsed: 0,
        active: false,
        activeUntil: 0
      });
    });
  }

  useAbility(type: AbilityType): boolean {
    const ability = this.abilities.get(type);
    if (!ability) return false;

    const now = Date.now();

    // Check cooldown
    if (now - ability.lastUsed < ability.cooldown) {
      return false;
    }

    // Activate ability
    ability.lastUsed = now;
    ability.active = true;
    ability.activeUntil = now + ability.duration;

    // Apply effects
    switch (type) {
      case 'shield':
        this.effects.hasShield = true;
        this.effects.shieldHealth = 50;
        break;
      case 'speed':
        this.effects.speedMultiplier = 2.0;
        break;
      case 'invincible':
        this.effects.isInvincible = true;
        break;
    }

    return true;
  }

  update(_deltaTime: number): AbilityEffects {
    const now = Date.now();

    // Update all abilities
    this.abilities.forEach((ability) => {
      if (ability.active && now >= ability.activeUntil) {
        ability.active = false;

        // Remove effects
        switch (ability.type) {
          case 'speed':
            this.effects.speedMultiplier = 1.0;
            break;
          case 'invincible':
            this.effects.isInvincible = false;
            break;
          case 'shield':
            if (this.effects.hasShield && this.effects.shieldHealth > 0) {
              // Shield expired naturally
              this.effects.hasShield = false;
              this.effects.shieldHealth = 0;
            }
            break;
        }
      }
    });

    return this.effects;
  }

  damageShield(damage: number): number {
    if (!this.effects.hasShield) return damage;

    if (this.effects.shieldHealth >= damage) {
      this.effects.shieldHealth -= damage;
      return 0; // All damage absorbed
    } else {
      const remaining = damage - this.effects.shieldHealth;
      this.effects.shieldHealth = 0;
      this.effects.hasShield = false;
      return remaining; // Partial damage
    }
  }

  getAbility(type: AbilityType): Ability | undefined {
    return this.abilities.get(type);
  }

  getAllAbilities(): Ability[] {
    return Array.from(this.abilities.values());
  }

  getCooldownPercent(type: AbilityType): number {
    const ability = this.abilities.get(type);
    if (!ability) return 100;

    const now = Date.now();
    const elapsed = now - ability.lastUsed;

    if (elapsed >= ability.cooldown) return 100;

    return (elapsed / ability.cooldown) * 100;
  }

  isOnCooldown(type: AbilityType): boolean {
    return this.getCooldownPercent(type) < 100;
  }

  getEffects(): AbilityEffects {
    return { ...this.effects };
  }

  // Create visual effect for ability use
  createAbilityEffect(scene: THREE.Scene, position: THREE.Vector3, type: AbilityType): THREE.Group {
    const effect = new THREE.Group();

    switch (type) {
      case 'dash':
        // Speed lines
        for (let i = 0; i < 10; i++) {
          const geometry = new THREE.PlaneGeometry(0.5, 0.1);
          const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.6
          });
          const line = new THREE.Mesh(geometry, material);
          line.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
          );
          effect.add(line);
        }
        break;

      case 'shield':
        // Shield sphere
        const shieldGeometry = new THREE.SphereGeometry(2, 16, 16);
        const shieldMaterial = new THREE.MeshBasicMaterial({
          color: 0x00aaff,
          transparent: true,
          opacity: 0.3,
          wireframe: true
        });
        const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
        effect.add(shield);
        break;

      case 'heal':
        // Healing particles
        for (let i = 0; i < 20; i++) {
          const geometry = new THREE.SphereGeometry(0.1, 4, 4);
          const material = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.8
          });
          const particle = new THREE.Mesh(geometry, material);
          particle.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
          );
          effect.add(particle);
        }
        break;

      case 'explosive':
        // Fire ring
        const ringGeometry = new THREE.TorusGeometry(1.5, 0.1, 16, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xff4400,
          transparent: true,
          opacity: 0.7
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        break;

      case 'invincible':
        // Ghost aura
        const auraGeometry = new THREE.SphereGeometry(1.5, 16, 16);
        const auraMaterial = new THREE.MeshBasicMaterial({
          color: 0xaa00ff,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        effect.add(aura);
        break;
    }

    effect.position.copy(position);
    scene.add(effect);

    // Auto-remove after animation
    setTimeout(() => {
      scene.remove(effect);
      effect.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }, 2000);

    return effect;
  }
}
