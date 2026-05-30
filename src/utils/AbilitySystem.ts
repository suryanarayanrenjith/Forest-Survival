import * as THREE from 'three';

export type AbilityType = 'dash' | 'shield' | 'speed' | 'phantom' | 'explosive' | 'overcharge';

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
  /** Phantom: enemies lose track of the player + the player is intangible. */
  isPhantom: boolean;
  /** Riot shield raised — blocks damage from the front arc (directional). */
  shieldHeld: boolean;
  /** Overcharge: temporary +fire-rate and +damage combat burst. */
  overcharge: boolean;
}

export class AbilitySystem {
  private abilities: Map<AbilityType, Ability> = new Map();
  private effects: AbilityEffects = {
    speedMultiplier: 1.0,
    isPhantom: false,
    shieldHeld: false,
    overcharge: false,
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
        name: 'Riot Shield',
        description: 'Raise a shield that blocks damage from the front',
        icon: '🛡️',
        cooldown: 15000,
        duration: 8000
      },
      speed: {
        type: 'speed',
        name: 'Sprint',
        description: '2x movement speed',
        icon: '🏃',
        cooldown: 8000,
        duration: 5000
      },
      phantom: {
        type: 'phantom',
        name: 'Phantom',
        description: 'Enemies lose track of you and you phase through them',
        icon: '👻',
        cooldown: 25000,
        duration: 5000
      },
      explosive: {
        type: 'explosive',
        name: 'Explosive Shot',
        description: 'Next shot deals AoE damage',
        icon: '💥',
        cooldown: 12000,
        duration: 10000
      },
      overcharge: {
        type: 'overcharge',
        name: 'Overcharge',
        description: 'Faster fire rate and bigger damage for a few seconds',
        icon: '⚡',
        cooldown: 18000,
        duration: 8000
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
        this.effects.shieldHeld = true;
        break;
      case 'speed':
        this.effects.speedMultiplier = 2.0;
        break;
      case 'phantom':
        this.effects.isPhantom = true;
        break;
      case 'overcharge':
        this.effects.overcharge = true;
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
          case 'phantom':
            this.effects.isPhantom = false;
            break;
          case 'shield':
            this.effects.shieldHeld = false;
            break;
          case 'overcharge':
            this.effects.overcharge = false;
            break;
        }
      }
    });

    return this.effects;
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

      case 'shield': {
        // Quick activation flare only — the persistent shield is a held mesh
        // on the player's arm (managed in the game loop), NOT a bubble here.
        const ringGeometry = new THREE.TorusGeometry(1.1, 0.06, 8, 24);
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0x55b0ff,
          transparent: true,
          opacity: 0.7,
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        break;
      }

      case 'overcharge':
        // Electric spark motes that pop on activation.
        for (let i = 0; i < 18; i++) {
          const geometry = new THREE.SphereGeometry(0.08, 4, 4);
          const material = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.5 ? 0xffd23f : 0xff8a1e,
            transparent: true,
            opacity: 0.9,
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

      case 'explosive': {
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
      }

      case 'phantom': {
        // Brief dematerialize pulse — the persistent translucency is applied
        // to the player body in the game loop, not a bubble here.
        const auraGeometry = new THREE.TorusGeometry(1.3, 0.08, 8, 24);
        const auraMaterial = new THREE.MeshBasicMaterial({
          color: 0x9a6bff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });
        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        aura.rotation.x = Math.PI / 2;
        effect.add(aura);
        break;
      }
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
