import * as THREE from 'three';
import type { TerrainObject } from '../types/game';

export type BiomeType = 'forest' | 'volcanic' | 'tundra' | 'desert' | 'swamp' | 'military' | 'crystal' | 'ruins';

interface BiomeConfig {
  groundColor: number;
  groundEmissive: number;
  groundRoughness: number;
  groundMetalness: number;
  treeDensity: number;
  rockDensity: number;
  bushDensity: number;
  vegetationColors: {
    tree: number[];
    bush: number[];
  };
}

export class BiomeSystem {
  private biomeConfigs: Map<BiomeType, BiomeConfig>;

  constructor(_scene: THREE.Scene) {
    this.biomeConfigs = new Map();
    this.initializeBiomes();
  }

  private initializeBiomes() {
    this.biomeConfigs.set('forest', {
      groundColor: 0x2d5a2d,
      groundEmissive: 0x1a3a1a,
      groundRoughness: 0.9,
      groundMetalness: 0.05,
      treeDensity: 0.4,
      rockDensity: 0.15,
      bushDensity: 0.35,
      vegetationColors: { tree: [0x1a7a1a, 0x0f5d0f, 0x0d4d0d, 0x246a24], bush: [0x1a6a1a, 0x156515, 0x2a7a2a] }
    });

    this.biomeConfigs.set('volcanic', {
      groundColor: 0x1a1210,
      groundEmissive: 0x2a0800,
      groundRoughness: 0.95,
      groundMetalness: 0.15,
      treeDensity: 0.12,
      rockDensity: 0.40,
      bushDensity: 0.18,
      vegetationColors: { tree: [0x1a1210, 0x2a1a10, 0x0d0908], bush: [0xff4400, 0xcc3300, 0xff6600] }
    });

    this.biomeConfigs.set('tundra', {
      groundColor: 0xd0e0f0,
      groundEmissive: 0xa0c0d0,
      groundRoughness: 0.4,
      groundMetalness: 0.3,
      treeDensity: 0.10,
      rockDensity: 0.30,
      bushDensity: 0.12,
      vegetationColors: { tree: [0x3a6a5a, 0x2a5a4a, 0x4a7a6a], bush: [0xc0d8e8, 0xb0c8d8, 0xd0e8f8] }
    });

    this.biomeConfigs.set('desert', {
      groundColor: 0xd4a574,
      groundEmissive: 0xa47544,
      groundRoughness: 0.95,
      groundMetalness: 0.0,
      treeDensity: 0.06,
      rockDensity: 0.25,
      bushDensity: 0.10,
      vegetationColors: { tree: [0xb8783c, 0xc48844, 0xa06830], bush: [0x6a5030, 0x5a4020, 0x7a6040] }
    });

    this.biomeConfigs.set('swamp', {
      groundColor: 0x2a3825,
      groundEmissive: 0x1a2818,
      groundRoughness: 0.8,
      groundMetalness: 0.15,
      treeDensity: 0.25,
      rockDensity: 0.10,
      bushDensity: 0.30,
      vegetationColors: { tree: [0x2a4a25, 0x1a3a18, 0x3a5a30], bush: [0x8a4a9a, 0x6a3a7a, 0x5a8a3a] }
    });

    this.biomeConfigs.set('military', {
      groundColor: 0x4a4a42,
      groundEmissive: 0x2a2a24,
      groundRoughness: 0.85,
      groundMetalness: 0.25,
      treeDensity: 0.15,
      rockDensity: 0.25,
      bushDensity: 0.20,
      vegetationColors: { tree: [0x5a5a52, 0x6a6a62, 0x4a4a42], bush: [0x4a5a3a, 0x3a4a2a, 0x5a6a4a] }
    });

    this.biomeConfigs.set('crystal', {
      groundColor: 0x1a102a,
      groundEmissive: 0x2a1a4a,
      groundRoughness: 0.3,
      groundMetalness: 0.6,
      treeDensity: 0.18,
      rockDensity: 0.30,
      bushDensity: 0.22,
      vegetationColors: { tree: [0x8844cc, 0x6633aa, 0xaa55ee], bush: [0x44aacc, 0x33aadd, 0x55ccee] }
    });

    this.biomeConfigs.set('ruins', {
      groundColor: 0x5a5548,
      groundEmissive: 0x3a3530,
      groundRoughness: 0.9,
      groundMetalness: 0.1,
      treeDensity: 0.15,
      rockDensity: 0.35,
      bushDensity: 0.20,
      vegetationColors: { tree: [0x6a6a5a, 0x7a7a6a, 0x5a5a4a], bush: [0x3a6a2a, 0x2a5a1a, 0x4a7a3a] }
    });
  }

  getBiomeAt(x: number, z: number): BiomeType {
    const scale = 0.001;
    const nx = x * scale;
    const nz = z * scale;
    const noise = this.pseudoNoise(nx, nz);
    if (noise < -0.5) return 'tundra';
    if (noise < -0.2) return 'ruins';
    if (noise < 0.0) return 'forest';
    if (noise < 0.2) return 'desert';
    if (noise < 0.4) return 'swamp';
    return 'volcanic';
  }

  private pseudoNoise(x: number, z: number): number {
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    const n2 = Math.sin(x * 45.123 + z * 23.456) * 12345.6789;
    return ((n - Math.floor(n)) + (n2 - Math.floor(n2))) / 2 - 0.5;
  }

  getBiomeConfig(biome: BiomeType): BiomeConfig {
    return this.biomeConfigs.get(biome)!;
  }

  // ═══════════════ TREE (tall structures) ═══════════════
  createTree(x: number, z: number, biome: BiomeType): TerrainObject {
    switch (biome) {
      case 'volcanic': return this.createCharredStump(x, z);
      case 'tundra': return this.createFrozenPine(x, z);
      case 'desert': return this.createMesaPillar(x, z);
      case 'swamp': return this.createGnarledTree(x, z);
      case 'military': return this.createConcreteWall(x, z);
      case 'crystal': return this.createCrystalSpire(x, z);
      case 'ruins': return this.createStoneColumn(x, z);
      default: return this.createForestTree(x, z);
    }
  }

  // ═══════════════ ROCK (medium obstacles) ═══════════════
  createRock(x: number, z: number, biome: BiomeType): TerrainObject {
    switch (biome) {
      case 'volcanic': return this.createObsidianShard(x, z);
      case 'tundra': return this.createIceChunk(x, z);
      case 'desert': return this.createSandstoneRock(x, z);
      case 'swamp': return this.createSwampStone(x, z);
      case 'military': return this.createSandbagPile(x, z);
      case 'crystal': return this.createMineralCluster(x, z);
      case 'ruins': return this.createStoneDebris(x, z);
      default: return this.createForestRock(x, z);
    }
  }

  // ═══════════════ BUSH (small decor) ═══════════════
  createBush(x: number, z: number, biome: BiomeType): TerrainObject {
    switch (biome) {
      case 'volcanic': return this.createEmberPatch(x, z);
      case 'tundra': return this.createSnowMound(x, z);
      case 'desert': return this.createDeadShrub(x, z);
      case 'swamp': return this.createPoisonMushrooms(x, z);
      case 'military': return this.createSupplyCrate(x, z);
      case 'crystal': return this.createSmallCrystal(x, z);
      case 'ruins': return this.createVineRubble(x, z);
      default: return this.createForestBush(x, z);
    }
  }

  // ═══════════════ BOULDER (large obstacles) ═══════════════
  createBoulder(x: number, z: number, biome: BiomeType): TerrainObject {
    switch (biome) {
      case 'volcanic': return this.createVolcanicBoulder(x, z);
      case 'tundra': return this.createIceWall(x, z);
      case 'desert': return this.createSandstoneArch(x, z);
      case 'swamp': return this.createMudMound(x, z);
      case 'military': return this.createBunker(x, z);
      case 'crystal': return this.createMassiveCrystal(x, z);
      case 'ruins': return this.createBrokenWall(x, z);
      default: return this.createForestBoulder(x, z);
    }
  }

  // ═══════════════ SPECIAL FEATURES (unique per biome) ═══════════════
  createSpecialFeature(x: number, z: number, biome: BiomeType): TerrainObject | null {
    const roll = Math.random();
    switch (biome) {
      case 'forest':
        if (roll < 0.3) return this.createFallenLog(x, z);
        if (roll < 0.5) return this.createMushroomCluster(x, z);
        return null;
      case 'volcanic':
        if (roll < 0.35) return this.createLavaPool(x, z);
        if (roll < 0.5) return this.createSmokeVent(x, z);
        return null;
      case 'tundra':
        if (roll < 0.3) return this.createFrozenPond(x, z);
        if (roll < 0.5) return this.createIcicleCluster(x, z);
        return null;
      case 'desert':
        if (roll < 0.3) return this.createCactus(x, z);
        if (roll < 0.5) return this.createSandDune(x, z);
        return null;
      case 'swamp':
        if (roll < 0.35) return this.createToxicPool(x, z);
        if (roll < 0.5) return this.createHollowLog(x, z);
        return null;
      case 'military':
        if (roll < 0.25) return this.createWatchtowerFrame(x, z);
        if (roll < 0.45) return this.createBarrelCluster(x, z);
        return null;
      case 'crystal':
        if (roll < 0.3) return this.createGlowingPool(x, z);
        if (roll < 0.5) return this.createAlienFlora(x, z);
        return null;
      case 'ruins':
        if (roll < 0.25) return this.createArchedDoorway(x, z);
        if (roll < 0.45) return this.createStatue(x, z);
        return null;
      default: return null;
    }
  }

  updateGroundMaterial(ground: THREE.Mesh, biome: BiomeType) {
    const config = this.getBiomeConfig(biome);
    if (ground.material instanceof THREE.MeshStandardMaterial) {
      ground.material.color.setHex(config.groundColor);
      ground.material.emissive.setHex(config.groundEmissive);
      ground.material.roughness = config.groundRoughness;
      ground.material.metalness = config.groundMetalness;
    }
  }

  // ══════════════════════════════════════
  //  FOREST
  // ══════════════════════════════════════

  private createForestTree(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 8 + Math.random() * 5;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.6, height, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, flatShading: true, roughness: 0.9, metalness: 0.1, emissive: 0x201510, emissiveIntensity: 0.1 })
    );
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    const leafColors = [0x1a7a1a, 0x0f5d0f, 0x0d4d0d, 0x246a24, 0x2a8a2a];
    for (let i = 0; i < 3; i++) {
      const size = 4 - i * 0.8;
      const color = leafColors[Math.floor(Math.random() * leafColors.length)];
      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(size, 5 - i * 1.2, 6),
        new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.15, roughness: 0.85, metalness: 0.05 })
      );
      leaves.position.y = height / 2 + 1 + i * 3.5;
      leaves.castShadow = true; leaves.receiveShadow = true;
      group.add(leaves);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5, height: 99 };
  }

  private createForestRock(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.5;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x5a6a5a, flatShading: true, roughness: 0.9, metalness: 0.05, emissive: 0x2a3a2a, emissiveIntensity: 0.05 })
    );
    rock.castShadow = true; rock.receiveShadow = true;
    rock.position.set(x, size * 0.5, z);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    return { mesh: rock, x, z, type: 'rock', collidable: true, radius: size + 0.5, height: size * 1.5 };
  }

  private createForestBush(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const bushSize = 0.8 + Math.random() * 0.6;
    const colors = [0x1a6a1a, 0x156515, 0x2a7a2a];
    for (let i = 0; i < 3; i++) {
      const color = colors[Math.floor(Math.random() * colors.length)];
      const part = new THREE.Mesh(
        new THREE.SphereGeometry(bushSize * (1 - i * 0.15), 4, 3),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0.05, emissive: color, emissiveIntensity: 0.1 })
      );
      part.position.set((Math.random() - 0.5) * bushSize * 0.5, bushSize * (1 - i * 0.15), (Math.random() - 0.5) * bushSize * 0.5);
      part.castShadow = true; part.receiveShadow = true;
      group.add(part);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: bushSize };
  }

  private createForestBoulder(x: number, z: number): TerrainObject {
    const size = 2.5 + Math.random() * 2;
    const boulder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x555555, flatShading: true, roughness: 0.9, metalness: 0.2, emissive: 0x2a2a2a, emissiveIntensity: 0.08 })
    );
    boulder.castShadow = true; boulder.receiveShadow = true;
    boulder.position.set(x, size * 0.6, z);
    boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    return { mesh: boulder, x, z, type: 'boulder', collidable: true, radius: size + 1, height: size * 1.2 };
  }

  private createFallenLog(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const length = 4 + Math.random() * 4;
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.6, length, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, flatShading: true, roughness: 0.95 })
    );
    log.rotation.z = Math.PI / 2; log.position.y = 0.5;
    log.castShadow = true; log.receiveShadow = true;
    group.add(log);
    const moss = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 4, 3),
      new THREE.MeshStandardMaterial({ color: 0x2a6a2a, flatShading: true, emissive: 0x1a4a1a, emissiveIntensity: 0.15 })
    );
    moss.position.set(0, 0.8, 0); moss.scale.set(2, 0.4, 1);
    group.add(moss);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2, height: 1.5 };
  }

  private createMushroomCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const h = 0.5 + Math.random() * 0.8;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 5), new THREE.MeshStandardMaterial({ color: 0xddc8a0, flatShading: true }));
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(0.25 + Math.random() * 0.15, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0xcc3322 : 0xdd8833, flatShading: true, emissive: 0x331100, emissiveIntensity: 0.15 })
      );
      cap.position.y = h / 2 + 0.1; cap.rotation.x = Math.PI;
      stem.position.y = h / 2;
      const m = new THREE.Group(); m.add(stem); m.add(cap);
      m.position.set((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5);
      group.add(m);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1 };
  }

  // ══════════════════════════════════════
  //  VOLCANIC
  // ══════════════════════════════════════

  private createCharredStump(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 3 + Math.random() * 4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.7, height, 5),
      new THREE.MeshStandardMaterial({ color: 0x1a1210, flatShading: true, roughness: 0.95, metalness: 0.1, emissive: 0x1a0800, emissiveIntensity: 0.1 })
    );
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    for (let i = 0; i < 2; i++) {
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.15, 1.5, 4),
        new THREE.MeshStandardMaterial({ color: 0x0d0908, flatShading: true, roughness: 0.95 })
      );
      branch.position.set(Math.random() > 0.5 ? 0.5 : -0.5, height * 0.3 * (i + 1), 0);
      branch.rotation.z = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.8);
      branch.castShadow = true;
      group.add(branch);
    }
    const ember = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 4, 3),
      new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff2200, emissiveIntensity: 0.4, transparent: true, opacity: 0.3 })
    );
    ember.position.y = -height / 2 + 0.3; ember.scale.set(1, 0.3, 1);
    group.add(ember);
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.0, height: 99 };
  }

  private createObsidianShard(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const shard = new THREE.Mesh(
      new THREE.TetrahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, flatShading: true, roughness: 0.1, metalness: 0.8, emissive: 0x110808, emissiveIntensity: 0.15 })
    );
    shard.castShadow = true; shard.receiveShadow = true;
    shard.position.set(x, size * 0.6, z);
    shard.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.3);
    return { mesh: shard, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.5 };
  }

  private createEmberPatch(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const ember = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + Math.random() * 0.2, 3, 2),
        new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.6 + Math.random() * 0.4, flatShading: true })
      );
      ember.position.set((Math.random() - 0.5) * 2, 0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 2);
      group.add(ember);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1.5 };
  }

  private createVolcanicBoulder(x: number, z: number): TerrainObject {
    const size = 2.5 + Math.random() * 2;
    const group = new THREE.Group();
    const boulder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a1a15, flatShading: true, roughness: 0.9, metalness: 0.15 })
    );
    boulder.castShadow = true; boulder.receiveShadow = true;
    group.add(boulder);
    for (let i = 0; i < 3; i++) {
      const vein = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, size * 0.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 0.8, flatShading: true })
      );
      vein.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(vein);
    }
    group.position.set(x, size * 0.6, z);
    group.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: size + 1, height: size * 1.2 };
  }

  private createLavaPool(x: number, z: number): TerrainObject {
    const radius = 2 + Math.random() * 2.5;
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 12),
      new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 })
    );
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); pool.receiveShadow = true;
    return { mesh: pool, x, z, type: 'water', collidable: false, radius };
  }

  private createSmokeVent(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.3, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a1a10, flatShading: true, roughness: 0.95 })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.castShadow = true;
    group.add(ring);
    const vent = new THREE.Mesh(
      new THREE.CircleGeometry(0.6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.0 })
    );
    vent.rotation.x = -Math.PI / 2; vent.position.y = 0.15;
    group.add(vent);
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 1.0 };
  }

  // ══════════════════════════════════════
  //  TUNDRA
  // ══════════════════════════════════════

  private createFrozenPine(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 4;
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, height, 5),
      new THREE.MeshStandardMaterial({ color: 0x3a2a20, flatShading: true, roughness: 0.9, metalness: 0.1 })
    );
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    for (let i = 0; i < 3; i++) {
      const size = 3 - i * 0.6;
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.7, 4 - i * 1.0, 4),
        new THREE.MeshStandardMaterial({ color: 0x2a5a4a, flatShading: true, emissive: 0x1a3a2a, emissiveIntensity: 0.1, roughness: 0.85 })
      );
      foliage.position.y = height / 2 + i * 2.5; foliage.castShadow = true;
      group.add(foliage);
      const snow = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.5, 1.0, 4),
        new THREE.MeshStandardMaterial({ color: 0xe8f0f8, flatShading: true, emissive: 0xc0d8e8, emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.1 })
      );
      snow.position.y = height / 2 + i * 2.5 + 1.2; snow.castShadow = true;
      group.add(snow);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.0, height: 99 };
  }

  private createIceChunk(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const ice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x88bbdd, flatShading: true, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.8, emissive: 0x4488aa, emissiveIntensity: 0.15 })
    );
    ice.castShadow = true; ice.receiveShadow = true;
    ice.position.set(x, size * 0.5, z);
    ice.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    return { mesh: ice, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.5 };
  }

  private createSnowMound(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.0;
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(size, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8f0f8, flatShading: true, roughness: 0.6, metalness: 0.05, emissive: 0xc0d8e8, emissiveIntensity: 0.1 })
    );
    mound.scale.y = 0.5; mound.position.set(x, size * 0.25, z);
    mound.castShadow = true; mound.receiveShadow = true;
    return { mesh: mound, x, z, type: 'bush', collidable: false, radius: size };
  }

  private createIceWall(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const width = 4 + Math.random() * 3;
    const height = 3 + Math.random() * 2;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x8ab8d8, flatShading: true, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.7, emissive: 0x4488aa, emissiveIntensity: 0.2 })
    );
    wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 1.5, 4),
        new THREE.MeshStandardMaterial({ color: 0xa0d0e8, flatShading: true, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75 })
      );
      spike.position.set((i - 1) * 1.5, height / 2 + 0.5, 0); spike.castShadow = true;
      group.add(spike);
    }
    group.position.set(x, height / 2, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 1, height: height + 1 };
  }

  private createFrozenPond(x: number, z: number): TerrainObject {
    const radius = 2.5 + Math.random() * 2;
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 12),
      new THREE.MeshStandardMaterial({ color: 0x88bbcc, roughness: 0.02, metalness: 0.8, emissive: 0x4488aa, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 })
    );
    pond.rotation.x = -Math.PI / 2; pond.position.set(x, 0.08, z); pond.receiveShadow = true;
    return { mesh: pond, x, z, type: 'water', collidable: false, radius };
  }

  private createIcicleCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const h = 1.5 + Math.random() * 2;
      const icicle = new THREE.Mesh(
        new THREE.ConeGeometry(0.15 + Math.random() * 0.1, h, 4),
        new THREE.MeshStandardMaterial({ color: 0xa0d0e8, flatShading: true, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7 })
      );
      icicle.position.set((Math.random() - 0.5) * 2, h / 2, (Math.random() - 0.5) * 2);
      icicle.castShadow = true;
      group.add(icicle);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 3 };
  }

  // ══════════════════════════════════════
  //  DESERT
  // ══════════════════════════════════════

  private createMesaPillar(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 8 + Math.random() * 6;
    const topR = 1.5 + Math.random();
    const botR = 1.0 + Math.random() * 0.5;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, botR, height, 6),
      new THREE.MeshStandardMaterial({ color: 0xc48844, flatShading: true, roughness: 0.95, emissive: 0x6a4420, emissiveIntensity: 0.1 })
    );
    pillar.castShadow = true; pillar.receiveShadow = true;
    group.add(pillar);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(topR + 0.5, topR, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0xb87838, flatShading: true, roughness: 0.95 })
    );
    cap.position.y = height / 2 + 0.5; cap.castShadow = true;
    group.add(cap);
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Mesh(
        new THREE.TorusGeometry(botR + 0.3 + i * 0.3, 0.1, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0xa06830, flatShading: true, roughness: 0.95 })
      );
      line.rotation.x = Math.PI / 2; line.position.y = -height / 4 + i * height / 3;
      group.add(line);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: topR + 1, height: 99 };
  }

  private createSandstoneRock(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0xc8945c, flatShading: true, roughness: 0.95, emissive: 0x6a4420, emissiveIntensity: 0.05 })
    );
    rock.castShadow = true; rock.receiveShadow = true;
    rock.position.set(x, size * 0.4, z); rock.scale.y = 0.7; rock.rotation.y = Math.random() * Math.PI;
    return { mesh: rock, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.0 };
  }

  private createDeadShrub(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const branchMat = new THREE.MeshStandardMaterial({ color: 0x6a5030, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const h = 0.5 + Math.random() * 1.0;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, h, 3), branchMat);
      branch.position.set((Math.random() - 0.5) * 0.8, h / 2, (Math.random() - 0.5) * 0.8);
      branch.rotation.set((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8);
      branch.castShadow = true;
      group.add(branch);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 0.8 };
  }

  private createSandstoneArch(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const archMat = new THREE.MeshStandardMaterial({ color: 0xb8783c, flatShading: true, roughness: 0.95 });
    const height = 5 + Math.random() * 3;
    const width = 5 + Math.random() * 2;
    const lp = new THREE.Mesh(new THREE.BoxGeometry(1.5, height, 1.5), archMat);
    lp.position.set(-width / 2, height / 2, 0); lp.castShadow = true; lp.receiveShadow = true;
    group.add(lp);
    const rp = new THREE.Mesh(new THREE.BoxGeometry(1.5, height, 1.5), archMat);
    rp.position.set(width / 2, height / 2, 0); rp.castShadow = true; rp.receiveShadow = true;
    group.add(rp);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 2, 1.5, 2), archMat);
    beam.position.y = height + 0.5; beam.castShadow = true; beam.receiveShadow = true;
    group.add(beam);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 2, height: height + 1 };
  }

  private createCactus(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 3 + Math.random() * 2;
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a7a3a, flatShading: true, roughness: 0.9, metalness: 0.05 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, height, 6), mat);
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    if (Math.random() < 0.7) {
      const armH = 1.2 + Math.random();
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, armH, 5), mat);
      arm.position.set(0.6, height * 0.4, 0); arm.rotation.z = -Math.PI / 3; arm.castShadow = true;
      group.add(arm);
      const armUp = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, armH * 0.7, 5), mat);
      armUp.position.set(1.0, height * 0.5 + armH * 0.3, 0); armUp.castShadow = true;
      group.add(armUp);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'cactus', collidable: true, radius: 1.2, height: height };
  }

  private createSandDune(x: number, z: number): TerrainObject {
    const size = 3 + Math.random() * 3;
    const dune = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xd4a574, flatShading: true, roughness: 0.98, emissive: 0xa47544, emissiveIntensity: 0.05 })
    );
    dune.scale.set(1.5, 0.35, 1); dune.position.set(x, size * 0.15, z);
    dune.receiveShadow = true; dune.rotation.y = Math.random() * Math.PI;
    return { mesh: dune, x, z, type: 'bush', collidable: false, radius: size };
  }

  // ══════════════════════════════════════
  //  SWAMP
  // ══════════════════════════════════════

  private createGnarledTree(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 4;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, flatShading: true, roughness: 0.95, metalness: 0.05 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, height, 5), trunkMat);
    trunk.rotation.z = (Math.random() - 0.5) * 0.3; trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    const trunk2 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, height * 0.7, 4), trunkMat);
    trunk2.position.set(0.4, -height * 0.15, 0.3); trunk2.rotation.z = (Math.random() - 0.5) * 0.5; trunk2.castShadow = true;
    group.add(trunk2);
    const fColors = [0x2a4a25, 0x1a3a18, 0x3a5a30];
    for (let i = 0; i < 2; i++) {
      const color = fColors[Math.floor(Math.random() * fColors.length)];
      const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(2 - i * 0.5, 4, 3),
        new THREE.MeshStandardMaterial({ color, flatShading: true, emissive: color, emissiveIntensity: 0.1 })
      );
      foliage.position.set((Math.random() - 0.5) * 2, height / 2 + i * 1.5, (Math.random() - 0.5) * 2);
      foliage.scale.y = 0.5; foliage.castShadow = true;
      group.add(foliage);
    }
    for (let i = 0; i < 3; i++) {
      const moss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.05, 1.5 + Math.random(), 3),
        new THREE.MeshStandardMaterial({ color: 0x4a6a3a, flatShading: true, emissive: 0x2a4a2a, emissiveIntensity: 0.15 })
      );
      moss.position.set((Math.random() - 0.5) * 2.5, height * 0.3, (Math.random() - 0.5) * 2.5);
      group.add(moss);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5, height: 99 };
  }

  private createSwampStone(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.2;
    const stone = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x3a4a3a, flatShading: true, roughness: 0.85, metalness: 0.15, emissive: 0x1a2a1a, emissiveIntensity: 0.08 })
    );
    stone.castShadow = true; stone.receiveShadow = true;
    stone.position.set(x, size * 0.3, z); stone.scale.y = 0.6; stone.rotation.y = Math.random() * Math.PI;
    return { mesh: stone, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 0.8 };
  }

  private createPoisonMushrooms(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      const h = 0.3 + Math.random() * 0.6;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 4), new THREE.MeshStandardMaterial({ color: 0x8a8a7a, flatShading: true }));
      const capColor = Math.random() > 0.5 ? 0x8a44aa : 0x44aa66;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.2 + Math.random() * 0.15, 5, 3),
        new THREE.MeshStandardMaterial({ color: capColor, emissive: capColor, emissiveIntensity: 0.4, flatShading: true })
      );
      cap.scale.y = 0.5; cap.position.y = h / 2 + 0.08; stem.position.y = h / 2;
      const m = new THREE.Group(); m.add(stem); m.add(cap);
      m.position.set((Math.random() - 0.5) * 1.8, 0, (Math.random() - 0.5) * 1.8);
      group.add(m);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1.2 };
  }

  private createMudMound(x: number, z: number): TerrainObject {
    const size = 2 + Math.random() * 2;
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(size, 5, 4),
      new THREE.MeshStandardMaterial({ color: 0x3a3228, flatShading: true, roughness: 0.95, metalness: 0.1, emissive: 0x1a1a10, emissiveIntensity: 0.05 })
    );
    mound.scale.y = 0.4; mound.position.set(x, size * 0.2, z);
    mound.castShadow = true; mound.receiveShadow = true;
    return { mesh: mound, x, z, type: 'boulder', collidable: true, radius: size + 0.5, height: size * 0.6 };
  }

  private createToxicPool(x: number, z: number): TerrainObject {
    const radius = 2 + Math.random() * 2;
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 10),
      new THREE.MeshStandardMaterial({ color: 0x33aa44, emissive: 0x22cc33, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 })
    );
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); pool.receiveShadow = true;
    return { mesh: pool, x, z, type: 'water', collidable: false, radius };
  }

  private createHollowLog(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const length = 3 + Math.random() * 3;
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.8, length, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2018, flatShading: true, roughness: 0.95 })
    );
    log.rotation.z = Math.PI / 2; log.position.y = 0.7;
    log.castShadow = true; log.receiveShadow = true;
    group.add(log);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.5, 6), new THREE.MeshStandardMaterial({ color: 0x0a0808 }));
    hole.position.set(length / 2, 0.7, 0); hole.rotation.y = Math.PI / 2;
    group.add(hole);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2, height: 2 };
  }

  // ══════════════════════════════════════
  //  MILITARY
  // ══════════════════════════════════════

  private createConcreteWall(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 3 + Math.random() * 2;
    const width = 3 + Math.random() * 4;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x6a6a62, flatShading: true, roughness: 0.9, metalness: 0.15, emissive: 0x2a2a24, emissiveIntensity: 0.05 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.8), wallMat);
    wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.3, 0.3, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x5a5a52, flatShading: true, roughness: 0.9, metalness: 0.2 })
    );
    lip.position.y = height + 0.15; lip.castShadow = true;
    group.add(lip);
    for (let i = 0; i < 2; i++) {
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x4a4a42 })
      );
      mark.position.set((Math.random() - 0.5) * width * 0.6, height * 0.3 + Math.random() * height * 0.4, 0.41);
      group.add(mark);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: width / 2 + 0.5, height: 99 };
  }

  private createSandbagPile(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, flatShading: true, roughness: 0.95 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3 - row; col++) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.6), bagMat);
        bag.position.set(col * 1.3 - (3 - row) * 0.65 + 0.65, row * 0.5 + 0.25, 0);
        bag.scale.set(1, 0.8, 1); bag.castShadow = true; bag.receiveShadow = true;
        group.add(bag);
      }
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 2.0, height: 1.5 };
  }

  private createSupplyCrate(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 0.6;
    const group = new THREE.Group();
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshStandardMaterial({ color: 0x4a5a3a, flatShading: true, roughness: 0.9, metalness: 0.1 })
    );
    crate.position.y = size / 2; crate.castShadow = true; crate.receiveShadow = true;
    group.add(crate);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x3a3a32, flatShading: true, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 2; i++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(size + 0.05, 0.08, size + 0.05), bandMat);
      band.position.y = size * 0.25 + i * size * 0.5;
      group.add(band);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI * 0.5;
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: size };
  }

  private createBunker(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const width = 5 + Math.random() * 3;
    const depth = 4 + Math.random() * 2;
    const height = 2.5;
    const bunkerMat = new THREE.MeshStandardMaterial({ color: 0x5a5a52, flatShading: true, roughness: 0.9, metalness: 0.2, emissive: 0x2a2a24, emissiveIntensity: 0.05 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bunkerMat);
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.5, 0.5, depth + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x4a4a42, flatShading: true, roughness: 0.9, metalness: 0.3 })
    );
    roof.position.y = height + 0.25; roof.castShadow = true;
    group.add(roof);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(width * 0.6, 0.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
    slit.position.set(0, height * 0.7, depth / 2 + 0.1);
    group.add(slit);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: Math.max(width, depth) / 2 + 1, height: 3 };
  }

  private createWatchtowerFrame(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 8;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5a5a52, flatShading: true, roughness: 0.85, metalness: 0.3 });
    const legs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]];
    for (const [lx, lz] of legs) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, height, 4), legMat);
      leg.position.set(lx, height / 2, lz); leg.castShadow = true;
      group.add(leg);
    }
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(4, 0.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a4a3a, flatShading: true, roughness: 0.9 })
    );
    platform.position.y = height - 0.5; platform.castShadow = true; platform.receiveShadow = true;
    group.add(platform);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6a6a5a, flatShading: true, roughness: 0.8, metalness: 0.4 });
    for (const [lx, lz] of legs) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 3), railMat);
      rail.position.set(lx, height + 0.25, lz);
      group.add(rail);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 5, 0.1), legMat);
    brace.position.set(-1.5, height / 2 - 1, 0); brace.rotation.z = 0.4;
    group.add(brace);
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 3, height: 99 };
  }

  private createBarrelCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const color = Math.random() > 0.3 ? 0x4a6a3a : 0x6a3a2a;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, metalness: 0.3 })
      );
      barrel.position.set((Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2);
      if (Math.random() > 0.7) { barrel.rotation.x = Math.PI / 2; barrel.position.y = 0.4; }
      barrel.castShadow = true; barrel.receiveShadow = true;
      group.add(barrel);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 2, height: 1.5 };
  }

  // ══════════════════════════════════════
  //  CRYSTAL
  // ══════════════════════════════════════

  private createCrystalSpire(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 6;
    const color = [0x8844cc, 0x6633aa, 0xaa55ee, 0x44aacc][Math.floor(Math.random() * 4)];
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.1, metalness: 0.7, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
    const main = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), mat);
    main.scale.set(1, height / 2.4, 1); main.position.y = height / 2;
    main.castShadow = true; main.receiveShadow = true;
    group.add(main);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const sc = [0x8844cc, 0x44aacc, 0xaa55ee][Math.floor(Math.random() * 3)];
      const subH = 2 + Math.random() * 3;
      const sub = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshStandardMaterial({ color: sc, flatShading: true, roughness: 0.1, metalness: 0.7, emissive: sc, emissiveIntensity: 0.3, transparent: true, opacity: 0.8 })
      );
      sub.scale.set(0.6, subH / 1.2, 0.6);
      sub.position.set((Math.random() - 0.5) * 2, subH / 2, (Math.random() - 0.5) * 2);
      sub.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      sub.castShadow = true;
      group.add(sub);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5, height: 99 };
  }

  private createMineralCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const color = [0xcc44aa, 0x44ccaa, 0xaacc44, 0x4488cc][Math.floor(Math.random() * 4)];
      const size = 0.3 + Math.random() * 0.6;
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(size, 0),
        new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.05, metalness: 0.8, emissive: color, emissiveIntensity: 0.4 })
      );
      gem.position.set((Math.random() - 0.5) * 2, size + Math.random() * 0.3, (Math.random() - 0.5) * 2);
      gem.rotation.set(Math.random(), Math.random(), Math.random());
      gem.castShadow = true;
      group.add(gem);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 2 };
  }

  private createSmallCrystal(x: number, z: number): TerrainObject {
    const color = [0x44aacc, 0xcc44aa, 0xaa44cc][Math.floor(Math.random() * 3)];
    const size = 0.5 + Math.random() * 0.4;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.05, metalness: 0.7, emissive: color, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })
    );
    crystal.scale.y = 1.5; crystal.position.set(x, size * 0.8, z);
    crystal.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    crystal.castShadow = true;
    return { mesh: crystal, x, z, type: 'bush', collidable: false, radius: size };
  }

  private createMassiveCrystal(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 5 + Math.random() * 4;
    const color = 0x7733bb;
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.05, metalness: 0.8, emissive: color, emissiveIntensity: 0.4, transparent: true, opacity: 0.8 });
    const main = new THREE.Mesh(new THREE.OctahedronGeometry(2.5, 0), mat);
    main.scale.set(1, height / 5, 1); main.position.y = height / 2;
    main.castShadow = true; main.receiveShadow = true;
    group.add(main);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const sc = [0x8844cc, 0x44aacc, 0xcc44aa][Math.floor(Math.random() * 3)];
      const sub = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.8, 0),
        new THREE.MeshStandardMaterial({ color: sc, flatShading: true, roughness: 0.05, metalness: 0.8, emissive: sc, emissiveIntensity: 0.35, transparent: true, opacity: 0.75 })
      );
      sub.scale.y = 2; sub.position.set(Math.cos(angle) * 3, 1.5, Math.sin(angle) * 3);
      sub.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      sub.castShadow = true;
      group.add(sub);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: 4, height: height };
  }

  private createGlowingPool(x: number, z: number): TerrainObject {
    const radius = 2 + Math.random() * 2;
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 12),
      new THREE.MeshStandardMaterial({ color: 0x6622cc, emissive: 0x8844ee, emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.85 })
    );
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); pool.receiveShadow = true;
    return { mesh: pool, x, z, type: 'water', collidable: false, radius };
  }

  private createAlienFlora(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stemColor = 0x22aa88;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.15, 2 + Math.random(), 5),
      new THREE.MeshStandardMaterial({ color: stemColor, flatShading: true, emissive: stemColor, emissiveIntensity: 0.3 })
    );
    stem.position.y = 1; stem.rotation.z = (Math.random() - 0.5) * 0.3;
    group.add(stem);
    const bulbColor = [0xff44aa, 0x44ffaa, 0xaaff44][Math.floor(Math.random() * 3)];
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 5, 4),
      new THREE.MeshStandardMaterial({ color: bulbColor, emissive: bulbColor, emissiveIntensity: 0.8, flatShading: true, transparent: true, opacity: 0.9 })
    );
    bulb.position.y = 2.2;
    group.add(bulb);
    for (let i = 0; i < 3; i++) {
      const tendril = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.04, 1, 3),
        new THREE.MeshStandardMaterial({ color: stemColor, emissive: stemColor, emissiveIntensity: 0.2, flatShading: true })
      );
      tendril.position.set((Math.random() - 0.5) * 0.5, 1.8, (Math.random() - 0.5) * 0.5);
      tendril.rotation.set((Math.random() - 0.5) * 1, 0, (Math.random() - 0.5) * 1);
      group.add(tendril);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1 };
  }

  // ══════════════════════════════════════
  //  RUINS
  // ══════════════════════════════════════

  private createStoneColumn(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 5;
    const isBroken = Math.random() > 0.5;
    const actualH = isBroken ? height * (0.4 + Math.random() * 0.4) : height;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, flatShading: true, roughness: 0.9, metalness: 0.1, emissive: 0x3a3a30, emissiveIntensity: 0.05 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, actualH, 8), stoneMat);
    shaft.position.y = actualH / 2; shaft.castShadow = true; shaft.receiveShadow = true;
    group.add(shaft);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x6a6a5a, flatShading: true, roughness: 0.9 }));
    base.position.y = 0.25; base.castShadow = true;
    group.add(base);
    if (!isBroken) {
      const capital = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.6, 0.8, 8), stoneMat);
      capital.position.y = actualH + 0.4; capital.castShadow = true;
      group.add(capital);
    }
    if (Math.random() > 0.5) {
      const vine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.05, actualH * 0.6, 3),
        new THREE.MeshStandardMaterial({ color: 0x3a6a2a, flatShading: true, emissive: 0x2a4a1a, emissiveIntensity: 0.15 })
      );
      vine.position.set(0.6, actualH * 0.4, 0); vine.rotation.z = 0.1;
      group.add(vine);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 1.5, height: 99 };
  }

  private createStoneDebris(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6a5a, flatShading: true, roughness: 0.9, metalness: 0.1 });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const size = 0.3 + Math.random() * 0.5;
      const block = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size), stoneMat);
      block.position.set((Math.random() - 0.5) * 2, size * 0.3, (Math.random() - 0.5) * 2);
      block.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.3);
      block.castShadow = true; block.receiveShadow = true;
      group.add(block);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 1.5 };
  }

  private createVineRubble(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const rubble = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x6a6a5a, flatShading: true, roughness: 0.9 })
    );
    rubble.position.y = 0.3; rubble.scale.y = 0.5; rubble.castShadow = true;
    group.add(rubble);
    for (let i = 0; i < 3; i++) {
      const vine = new THREE.Mesh(
        new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 3, 2),
        new THREE.MeshStandardMaterial({ color: 0x3a7a2a, flatShading: true, emissive: 0x2a5a1a, emissiveIntensity: 0.15 })
      );
      vine.position.set((Math.random() - 0.5) * 1, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 1);
      vine.scale.y = 0.5;
      group.add(vine);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1 };
  }

  private createBrokenWall(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const width = 5 + Math.random() * 4;
    const height = 3 + Math.random() * 2;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, flatShading: true, roughness: 0.9, metalness: 0.1, emissive: 0x3a3a30, emissiveIntensity: 0.05 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 1.0), stoneMat);
    wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    for (let i = 0; i < 4; i++) {
      const blockH = Math.random() * 1.5;
      const block = new THREE.Mesh(new THREE.BoxGeometry(width / 5, blockH, 1.0), stoneMat);
      block.position.set((i - 1.5) * width / 4, height + blockH / 2, 0); block.castShadow = true;
      group.add(block);
    }
    for (let i = 0; i < 3; i++) {
      const debris = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.3, 0.5), stoneMat);
      debris.position.set((Math.random() - 0.5) * width, 0.2, 1 + Math.random());
      debris.rotation.set(Math.random() * 0.3, Math.random(), Math.random() * 0.3);
      debris.castShadow = true;
      group.add(debris);
    }
    if (Math.random() > 0.4) {
      const vine = new THREE.Mesh(
        new THREE.SphereGeometry(1, 3, 2),
        new THREE.MeshStandardMaterial({ color: 0x3a7a2a, flatShading: true, emissive: 0x2a5a1a, emissiveIntensity: 0.15 })
      );
      vine.scale.set(1.5, 0.4, 0.5); vine.position.set((Math.random() - 0.5) * width * 0.5, height * 0.5, 0.6);
      group.add(vine);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 1, height: height + 1 };
  }

  private createArchedDoorway(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 5; const width = 4;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, flatShading: true, roughness: 0.9, metalness: 0.1 });
    const lp = new THREE.Mesh(new THREE.BoxGeometry(1.2, height, 1.2), stoneMat);
    lp.position.set(-width / 2, height / 2, 0); lp.castShadow = true; lp.receiveShadow = true;
    group.add(lp);
    const rp = new THREE.Mesh(new THREE.BoxGeometry(1.2, height, 1.2), stoneMat);
    rp.position.set(width / 2, height / 2, 0); rp.castShadow = true; rp.receiveShadow = true;
    group.add(rp);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(width + 1.5, 1.2, 1.5), stoneMat);
    lintel.position.y = height + 0.5; lintel.castShadow = true;
    group.add(lintel);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1, 1.5, 4), stoneMat);
    crown.position.y = height + 1.8; crown.castShadow = true;
    group.add(crown);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: width / 2 + 1, height: 99 };
  }

  private createStatue(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a7a6a, flatShading: true, roughness: 0.85, metalness: 0.15, emissive: 0x3a3a30, emissiveIntensity: 0.05 });
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.5), stoneMat);
    pedestal.position.y = 0.5; pedestal.castShadow = true; pedestal.receiveShadow = true;
    group.add(pedestal);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.5), stoneMat);
    body.position.y = 2; body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 5, 4), stoneMat);
    head.position.y = 3.3; head.castShadow = true;
    group.add(head);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), stoneMat);
    arm.position.set(0.55, 2.2, 0); arm.rotation.z = -0.3; arm.castShadow = true;
    group.add(arm);
    if (Math.random() > 0.4) {
      const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), stoneMat);
      arm2.position.set(-0.55, 2.4, 0); arm2.rotation.z = 0.5; arm2.castShadow = true;
      group.add(arm2);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 4 };
  }
}
