import * as THREE from 'three';

export type PowerUpType =
  | 'health'
  | 'ammo'
  | 'speed'
  | 'damage'
  | 'shield'
  | 'invincible'
  | 'infinite_ammo'
  | 'rapid_fire'
  | 'nuke'
  | 'random_weapon';

export interface PowerUpConfig {
  type: PowerUpType;
  name: string;
  description: string;
  icon: string;
  color: number;
  emissiveColor: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  duration?: number; // For temporary effects (milliseconds)
  spawnChance: number; // 0-1
}

export const POWER_UP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  health: {
    type: 'health',
    name: 'Health Pack',
    description: '+50 HP',
    icon: '❤️',
    color: 0xff0000,
    emissiveColor: 0xff3333,
    rarity: 'common',
    spawnChance: 0.4
  },
  ammo: {
    type: 'ammo',
    name: 'Ammo Box',
    description: 'Refill ammo',
    icon: '📦',
    color: 0xffaa00,
    emissiveColor: 0xffcc33,
    rarity: 'common',
    spawnChance: 0.3
  },
  speed: {
    type: 'speed',
    name: 'Speed Boost',
    description: '2x speed for 10s',
    icon: '⚡',
    color: 0x00ffff,
    emissiveColor: 0x33ffff,
    rarity: 'rare',
    duration: 10000,
    spawnChance: 0.1
  },
  damage: {
    type: 'damage',
    name: 'Damage Boost',
    description: '2x damage for 15s',
    icon: '💥',
    color: 0xff4400,
    emissiveColor: 0xff6633,
    rarity: 'rare',
    duration: 15000,
    spawnChance: 0.08
  },
  shield: {
    type: 'shield',
    name: 'Energy Shield',
    description: 'Shield absorbs 100 damage',
    icon: '🛡️',
    color: 0x0099ff,
    emissiveColor: 0x33aaff,
    rarity: 'rare',
    duration: 20000,
    spawnChance: 0.07
  },
  invincible: {
    type: 'invincible',
    name: 'Invincibility',
    description: 'Invincible for 5s',
    icon: '⭐',
    color: 0xffff00,
    emissiveColor: 0xffff33,
    rarity: 'epic',
    duration: 5000,
    spawnChance: 0.03
  },
  infinite_ammo: {
    type: 'infinite_ammo',
    name: 'Infinite Ammo',
    description: 'Unlimited ammo for 20s',
    icon: '∞',
    color: 0xff00ff,
    emissiveColor: 0xff33ff,
    rarity: 'epic',
    duration: 20000,
    spawnChance: 0.05
  },
  rapid_fire: {
    type: 'rapid_fire',
    name: 'Rapid Fire',
    description: '3x fire rate for 15s',
    icon: '🔫',
    color: 0xff9900,
    emissiveColor: 0xffaa33,
    rarity: 'epic',
    duration: 15000,
    spawnChance: 0.04
  },
  nuke: {
    type: 'nuke',
    name: 'Tactical Nuke',
    description: 'Eliminate all enemies on screen',
    icon: '☢️',
    color: 0x00ff00,
    emissiveColor: 0x33ff33,
    rarity: 'legendary',
    spawnChance: 0.01
  },
  random_weapon: {
    type: 'random_weapon',
    name: 'Mystery Box',
    description: 'Random weapon unlock',
    icon: '🎁',
    color: 0xaa00ff,
    emissiveColor: 0xbb33ff,
    rarity: 'rare',
    spawnChance: 0.06
  }
};

export interface Airdrop {
  mesh: THREE.Group;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  parachuteOpen: boolean;
  landed: boolean;
  collected: boolean;
  powerUpType: PowerUpType;
  smoke: THREE.Points | null;
}

export class EnhancedPowerUpSystem {
  private airdrops: Airdrop[] = [];
  private activePowerUps: Map<PowerUpType, { expiresAt: number }> = new Map();

  createAirdrop(
    scene: THREE.Scene,
    x: number,
    z: number,
    powerUpType?: PowerUpType
  ): Airdrop {
    // Select random power-up if not specified
    if (!powerUpType) {
      const random = Math.random();
      let cumulative = 0;

      for (const [type, config] of Object.entries(POWER_UP_CONFIGS)) {
        cumulative += config.spawnChance;
        if (random <= cumulative) {
          powerUpType = type as PowerUpType;
          break;
        }
      }

      if (!powerUpType) powerUpType = 'health';
    }

    const config = POWER_UP_CONFIGS[powerUpType];
    const group = new THREE.Group();

    // Crate
    const crateGeometry = new THREE.BoxGeometry(2, 2, 2);
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x9a5b22,
      emissive: 0x3b1d0d,
      emissiveIntensity: 0.35,
      roughness: 0.78,
      metalness: 0.08,
      toneMapped: false,
      fog: false,
    });
    const crate = new THREE.Mesh(crateGeometry, crateMaterial);
    crate.castShadow = true;
    group.add(crate);

    // Power-up indicator
    const indicatorGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const indicatorMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(config.color).multiplyScalar(2.4),
      toneMapped: false,
      fog: false,
      depthWrite: false,
      depthTest: true,
    });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.y = 0.5;
    indicator.userData.cannotReceiveAO = true;
    group.add(indicator);

    // Parachute
    const parachuteGeometry = new THREE.ConeGeometry(3, 2, 8);
    const parachuteMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    const parachute = new THREE.Mesh(parachuteGeometry, parachuteMaterial);
    parachute.position.y = 4;
    parachute.rotation.x = Math.PI;
    group.add(parachute);

    const glowLight = new THREE.PointLight(config.emissiveColor, 1.75, 11);
    glowLight.position.y = 1.5;
    group.add(glowLight);

    // Starting position (high in the air)
    const startY = 100;
    group.position.set(x, startY, z);

    scene.add(group);

    const airdrop: Airdrop = {
      mesh: group,
      position: new THREE.Vector3(x, startY, z),
      targetPosition: new THREE.Vector3(x, 0, z),
      parachuteOpen: true,
      landed: false,
      collected: false,
      powerUpType,
      smoke: null
    };

    // Create smoke effect when landed
    this.createSmokeEffect(scene, airdrop);

    this.airdrops.push(airdrop);
    return airdrop;
  }

  private createSmokeEffect(_scene: THREE.Scene, airdrop: Airdrop) {
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i++) {
      positions[i] = 0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const smoke = new THREE.Points(geometry, material);
    smoke.userData.cannotReceiveAO = true;
    airdrop.smoke = smoke;
  }

  updateAirdrops(deltaTime: number, scene: THREE.Scene): Airdrop[] {
    const landedAirdrops: Airdrop[] = [];

    for (let i = this.airdrops.length - 1; i >= 0; i--) {
      const airdrop = this.airdrops[i];

      if (airdrop.collected) {
        scene.remove(airdrop.mesh);
        if (airdrop.smoke) scene.remove(airdrop.smoke);
        this.airdrops.splice(i, 1);
        continue;
      }

      if (!airdrop.landed) {
        // Descend
        const descendSpeed = airdrop.parachuteOpen ? 0.3 : 1.0;
        airdrop.mesh.position.y -= descendSpeed * deltaTime * 60;

        // Gentle swaying
        const sway = Math.sin(Date.now() * 0.001) * 0.5;
        airdrop.mesh.position.x += sway * deltaTime;

        // Check if landed
        if (airdrop.mesh.position.y <= 1) {
          airdrop.mesh.position.y = 1;
          airdrop.landed = true;

          // Remove parachute
          const parachute = airdrop.mesh.children.find(
            c => c instanceof THREE.Mesh && c.geometry instanceof THREE.ConeGeometry
          );
          if (parachute) {
            airdrop.mesh.remove(parachute);
          }

          // Add smoke
          if (airdrop.smoke) {
            airdrop.smoke.position.copy(airdrop.mesh.position);
            scene.add(airdrop.smoke);
          }

          landedAirdrops.push(airdrop);
        }
      } else {
        // Rotate landed crate
        const crate = airdrop.mesh.children[0];
        if (crate) {
          crate.rotation.y += deltaTime * 2;
        }

        // Animate indicator
        const indicator = airdrop.mesh.children[1];
        if (indicator) {
          indicator.position.y = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;
          indicator.rotation.y += deltaTime * 3;
        }

        // Animate smoke
        if (airdrop.smoke) {
          const positions = airdrop.smoke.geometry.attributes.position.array as Float32Array;
          for (let j = 0; j < positions.length; j += 3) {
            positions[j + 1] += 0.05; // Rise
            if (positions[j + 1] > 3) {
              positions[j] = (Math.random() - 0.5) * 2;
              positions[j + 1] = 0;
              positions[j + 2] = (Math.random() - 0.5) * 2;
            }
          }
          airdrop.smoke.geometry.attributes.position.needsUpdate = true;
        }
      }
    }

    return landedAirdrops;
  }

  collectAirdrop(airdrop: Airdrop): PowerUpType {
    airdrop.collected = true;

    const config = POWER_UP_CONFIGS[airdrop.powerUpType];

    // Track active power-ups with duration
    if (config.duration) {
      this.activePowerUps.set(airdrop.powerUpType, {
        expiresAt: Date.now() + config.duration
      });
    }

    return airdrop.powerUpType;
  }

  updateActivePowerUps(): void {
    const now = Date.now();
    const expired: PowerUpType[] = [];

    this.activePowerUps.forEach((data, type) => {
      if (now >= data.expiresAt) {
        expired.push(type);
      }
    });

    expired.forEach(type => this.activePowerUps.delete(type));
  }

  isActivePowerUp(type: PowerUpType): boolean {
    return this.activePowerUps.has(type);
  }

  getActivePowerUps(): PowerUpType[] {
    return Array.from(this.activePowerUps.keys());
  }

  getRemainingTime(type: PowerUpType): number {
    const data = this.activePowerUps.get(type);
    if (!data) return 0;

    return Math.max(0, data.expiresAt - Date.now());
  }

  clearAll(scene: THREE.Scene): void {
    this.airdrops.forEach(airdrop => {
      scene.remove(airdrop.mesh);
      if (airdrop.smoke) scene.remove(airdrop.smoke);
    });
    this.airdrops = [];
    this.activePowerUps.clear();
  }

  getAirdrops(): Airdrop[] {
    return this.airdrops;
  }
}
