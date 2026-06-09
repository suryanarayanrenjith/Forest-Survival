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

  // Single SHARED glow light for landed crates. Adding/removing a PointLight
  // at runtime forces three.js to recompile every material in the scene (the
  // light count is baked into shaders) — that was the stutter on the first
  // airdrop. The host pre-allocates ONE light at scene init and hands it over;
  // we only ever move it + toggle its intensity, which never recompiles.
  // Reference: https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281
  private glowLight: THREE.PointLight | null = null;

  /** Inject the host-owned, permanently-scene-parented airdrop glow light. */
  setGlowLight(light: THREE.PointLight | null): void {
    this.glowLight = light;
    if (light) light.intensity = 0;
  }

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
    const tintHex = new THREE.Color(config.color);
    const tintBright = new THREE.Color(config.emissiveColor).multiplyScalar(1.4);

    // ── CRATE BODY ─────────────────────────────────────────────────────
    // Weathered hardwood — slightly desaturated so the corner braces +
    // emissive panel pop instead of getting drowned by warm bloom.
    const CRATE_SIZE = 2.0;
    const crateGeometry = new THREE.BoxGeometry(CRATE_SIZE, CRATE_SIZE, CRATE_SIZE);
    const crateMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4220,
      emissive: 0x1f0e05,
      emissiveIntensity: 0.25,
      roughness: 0.82,
      metalness: 0.08,
    });
    const crate = new THREE.Mesh(crateGeometry, crateMaterial);
    crate.castShadow = true;
    group.add(crate);

    // Reused materials for the metal bands + brackets + studs.
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x42413d,
      emissive: 0x1c1b18,
      emissiveIntensity: 0.4,
      roughness: 0.42,
      metalness: 0.85,
    });
    const studMat = new THREE.MeshStandardMaterial({
      color: 0xb3a982,
      emissive: 0x3a3520,
      emissiveIntensity: 0.7,
      roughness: 0.38,
      metalness: 0.9,
    });

    // ── METAL BANDS — top + bottom + middle rail. Thin boxes with the
    // y-axis short, hugging the wood. Three rails per face for a "shipping
    // crate" silhouette readable from 30+ metres.
    const bandThickness = 0.06;
    const bandWidth = 0.14;
    const bandY = [0.92, 0.0, -0.92]; // top / middle / bottom
    const halfSize = CRATE_SIZE / 2;
    for (const y of bandY) {
      // Two bands per axis (X and Z) so the crate has horizontal rails
      // visible from every side.
      const xBand = new THREE.Mesh(
        new THREE.BoxGeometry(CRATE_SIZE + bandThickness, bandWidth, CRATE_SIZE + bandThickness),
        bandMat,
      );
      xBand.position.y = y;
      group.add(xBand);
    }

    // ── CORNER REINFORCEMENTS — 4 vertical metal strips on the side edges.
    const cornerGeo = new THREE.BoxGeometry(0.12, CRATE_SIZE + bandThickness, 0.12);
    const cornerOffsets: [number, number][] = [
      [-halfSize, -halfSize],
      [-halfSize,  halfSize],
      [ halfSize, -halfSize],
      [ halfSize,  halfSize],
    ];
    for (const [cx, cz] of cornerOffsets) {
      const post = new THREE.Mesh(cornerGeo, bandMat);
      post.position.set(cx, 0, cz);
      group.add(post);
    }

    // ── CORNER STUDS — small bronze rivets at the 8 box corners.
    const studGeo = new THREE.SphereGeometry(0.08, 8, 6);
    const studCornerOffsets: [number, number, number][] = [
      [-halfSize,  halfSize, -halfSize],
      [ halfSize,  halfSize, -halfSize],
      [-halfSize,  halfSize,  halfSize],
      [ halfSize,  halfSize,  halfSize],
      [-halfSize, -halfSize, -halfSize],
      [ halfSize, -halfSize, -halfSize],
      [-halfSize, -halfSize,  halfSize],
      [ halfSize, -halfSize,  halfSize],
    ];
    for (const [sx, sy, sz] of studCornerOffsets) {
      const stud = new THREE.Mesh(studGeo, studMat);
      stud.position.set(sx, sy, sz);
      group.add(stud);
    }

    // ── EMISSIVE TOP PANEL — the power-up's signature colour, like a
    // priority sticker on a Half-Life crate. Acts as the "what's inside"
    // tell at distance and is the main bloom catcher.
    const panelGeo = new THREE.BoxGeometry(1.35, 0.04, 1.35);
    const panelMat = new THREE.MeshStandardMaterial({
      color: tintHex,
      emissive: tintBright,
      emissiveIntensity: 3.2,
      roughness: 0.35,
      metalness: 0.2,
      toneMapped: true,
    });
    const topPanel = new THREE.Mesh(panelGeo, panelMat);
    topPanel.position.y = halfSize + 0.02;
    topPanel.userData.cannotReceiveAO = true;
    group.add(topPanel);

    // ── FRONT LABEL STRIPE — a thinner horizontal band across the front
    // face. Reinforces the readable "package" silhouette.
    const labelGeo = new THREE.BoxGeometry(1.05, 0.32, 0.02);
    const labelMat = new THREE.MeshStandardMaterial({
      color: tintHex,
      emissive: tintBright,
      emissiveIntensity: 1.8,
      roughness: 0.5,
      metalness: 0.15,
      toneMapped: true,
    });
    const frontLabel = new THREE.Mesh(labelGeo, labelMat);
    frontLabel.position.set(0, 0.05, halfSize + 0.012);
    frontLabel.userData.cannotReceiveAO = true;
    group.add(frontLabel);

    // ── STROBE BEACON — small red blinker on top so you can pick out a
    // landed crate in a crowded forest. Pulses via animated emissive in
    // the per-frame update; baseline is dim so it doesn't compete with
    // the colour panel.
    const beaconGeo = new THREE.SphereGeometry(0.13, 12, 10);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xff4030,
      emissive: 0xff4030,
      emissiveIntensity: 2.5,
      roughness: 0.3,
      metalness: 0.0,
      toneMapped: true,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(halfSize - 0.18, halfSize + 0.05, halfSize - 0.18);
    beacon.userData.cannotReceiveAO = true;
    beacon.userData.airdropBeacon = true; // tag for the strobe animation
    group.add(beacon);

    // ── PARACHUTE — alternating white + tinted sectors built from a single
    // ConeGeometry whose face colours we paint. Reads as a real chute, not
    // a featureless cone.
    const parachuteGeometry = new THREE.ConeGeometry(3, 1.8, 12);
    parachuteGeometry.translate(0, 0.9, 0); // pivot at base for swing
    const positionAttr = parachuteGeometry.getAttribute('position');
    const colorArr = new Float32Array(positionAttr.count * 3);
    const colorAttr = new THREE.BufferAttribute(colorArr, 3);
    parachuteGeometry.setAttribute('color', colorAttr);
    const whiteCol = new THREE.Color(0xf5f5f5);
    const sectorCol = new THREE.Color(config.color).lerp(new THREE.Color(0xffffff), 0.25);
    // The cone has tri faces: tip + 12 base verts. Alternate sectors by
    // looking at the angle of each base vertex.
    for (let i = 0; i < positionAttr.count; i++) {
      const vx = positionAttr.getX(i);
      const vz = positionAttr.getZ(i);
      const ang = Math.atan2(vz, vx);
      const sector = Math.floor((ang + Math.PI) / (Math.PI / 6));
      const tinted = sector % 2 === 0;
      const c = tinted ? sectorCol : whiteCol;
      colorArr[i * 3] = c.r;
      colorArr[i * 3 + 1] = c.g;
      colorArr[i * 3 + 2] = c.b;
    }
    const parachuteMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.65,
      metalness: 0.0,
      emissive: 0x080808,
      emissiveIntensity: 0.35,
    });
    const parachute = new THREE.Mesh(parachuteGeometry, parachuteMaterial);
    parachute.position.y = 3.7;
    parachute.rotation.x = Math.PI; // dome opens downward
    group.add(parachute);

    // ── SUSPENSION LINES — 4 thin black tethers from parachute to crate
    // corners. Sells the "package is suspended" idea.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: true });
    const lineGeo = new THREE.CylinderGeometry(0.015, 0.015, 2.2, 4, 1);
    const lineOffsets: [number, number][] = [
      [-halfSize, -halfSize],
      [ halfSize, -halfSize],
      [-halfSize,  halfSize],
      [ halfSize,  halfSize],
    ];
    for (const [lx, lz] of lineOffsets) {
      const line = new THREE.Mesh(lineGeo, lineMat);
      // Halfway between crate top and parachute base, rotated to lean
      // outward to the parachute rim.
      line.position.set(lx * 0.55, 2.4, lz * 0.55);
      line.rotation.x = -lx * 0 - 0.18; // tiny tilt for visual life
      line.rotation.z =  lx * 0.18;
      group.add(line);
    }

    // NOTE: the coloured key light that bathes the ground in the perk's hue is
    // the SHARED `glowLight` (see setGlowLight) driven in updateAirdrops — NOT a
    // per-crate PointLight, which would recompile every scene material on spawn.

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
        this.disposeAirdrop(airdrop, scene);
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

          // Remove parachute (cone geometry) AND its suspension lines
          // (thin cylinders). Iterate from the end so splicing children
          // while looping doesn't skip entries.
          for (let c = airdrop.mesh.children.length - 1; c >= 0; c--) {
            const child = airdrop.mesh.children[c];
            if (!(child instanceof THREE.Mesh)) continue;
            const g = child.geometry;
            if (g instanceof THREE.ConeGeometry) {
              airdrop.mesh.remove(child);
              g.dispose();
              if (child.material instanceof THREE.Material) child.material.dispose();
            } else if (g instanceof THREE.CylinderGeometry && g.parameters.height > 1) {
              // Suspension tethers — short cylinders > 1 unit tall.
              airdrop.mesh.remove(child);
              g.dispose();
              if (child.material instanceof THREE.Material) child.material.dispose();
            }
          }

          // Add smoke
          if (airdrop.smoke) {
            airdrop.smoke.position.copy(airdrop.mesh.position);
            scene.add(airdrop.smoke);
          }

          landedAirdrops.push(airdrop);
        }
      } else {
        // Slow Y-rotation for the WHOLE crate group so the priority panel
        // and label sweep into view for any nearby player.
        airdrop.mesh.rotation.y += deltaTime * 0.55;

        // Strobe beacon — pulse the red blinker so a landed crate is easy
        // to spot in a forest. Cheap traversal because the group has only
        // ~30 children and we early-exit on the tagged mesh.
        const tNow = Date.now() * 0.005;
        const strobe = 0.6 + Math.abs(Math.sin(tNow)) * 3.2;
        for (let c = 0; c < airdrop.mesh.children.length; c++) {
          const child = airdrop.mesh.children[c];
          if (child instanceof THREE.Mesh && child.userData.airdropBeacon
              && child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = strobe;
            break;
          }
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

    // Drive the single shared glow light from the most prominent active crate
    // (landed, or close enough to the ground that the glow reads). Pure
    // move + intensity changes — never a recompile.
    if (this.glowLight) {
      let lit = false;
      for (let i = 0; i < this.airdrops.length; i++) {
        const a = this.airdrops[i];
        if (a.collected) continue;
        const y = a.mesh.position.y;
        if (a.landed || y < 14) {
          const cfg = POWER_UP_CONFIGS[a.powerUpType];
          this.glowLight.color.setHex(cfg.emissiveColor);
          this.glowLight.position.set(a.mesh.position.x, a.mesh.position.y + 1.5, a.mesh.position.z);
          const prox = a.landed ? 1 : 1 - Math.min(1, Math.max(0, (y - 2) / 12));
          this.glowLight.intensity = 2.0 * prox;
          lit = true;
          break;
        }
      }
      if (!lit) this.glowLight.intensity = 0;
    }

    return landedAirdrops;
  }

  /**
   * Fully release an airdrop's GPU resources. Airdrop visuals are allocated
   * fresh per crate (not shared/cached), so disposing geometries + materials on
   * removal is safe and prevents a slow GPU memory leak over a long run. The
   * parachute cone + suspension lines are already removed/disposed on landing,
   * so traversal only finds the crate body + fittings here.
   */
  private disposeAirdrop(airdrop: Airdrop, scene: THREE.Scene): void {
    scene.remove(airdrop.mesh);
    airdrop.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    if (airdrop.smoke) {
      scene.remove(airdrop.smoke);
      airdrop.smoke.geometry.dispose();
      const sm = airdrop.smoke.material;
      if (Array.isArray(sm)) sm.forEach((m) => m.dispose());
      else sm.dispose();
    }
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
    this.airdrops.forEach(airdrop => this.disposeAirdrop(airdrop, scene));
    this.airdrops = [];
    this.activePowerUps.clear();
    if (this.glowLight) this.glowLight.intensity = 0;
  }

  getAirdrops(): Airdrop[] {
    return this.airdrops;
  }
}
