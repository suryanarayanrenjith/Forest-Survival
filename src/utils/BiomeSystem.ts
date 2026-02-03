import * as THREE from 'three';
import type { TerrainObject } from '../types/game';

export type BiomeType = 'forest' | 'plains' | 'desert' | 'tundra' | 'swamp' | 'mountains';

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
  specialFeatures?: () => THREE.Object3D;
}

export class BiomeSystem {
  private biomeConfigs: Map<BiomeType, BiomeConfig>;

  constructor(_scene: THREE.Scene) {
    // scene parameter kept for future use but not stored
    this.biomeConfigs = new Map();
    this.initializeBiomes();
  }

  private initializeBiomes() {
    // Forest biome - dense vegetation
    this.biomeConfigs.set('forest', {
      groundColor: 0x2d5a2d,
      groundEmissive: 0x1a3a1a,
      groundRoughness: 0.9,
      groundMetalness: 0.05,
      treeDensity: 0.4,
      rockDensity: 0.15,
      bushDensity: 0.35,
      vegetationColors: {
        tree: [0x1a7a1a, 0x0f5d0f, 0x0d4d0d, 0x246a24],
        bush: [0x1a6a1a, 0x156515, 0x2a7a2a]
      }
    });

    // Plains biome - open grasslands
    this.biomeConfigs.set('plains', {
      groundColor: 0x6a994a,
      groundEmissive: 0x4a7a3a,
      groundRoughness: 0.85,
      groundMetalness: 0.02,
      treeDensity: 0.08,
      rockDensity: 0.05,
      bushDensity: 0.15,
      vegetationColors: {
        tree: [0x3a8a3a, 0x2a7a2a, 0x4a9a4a],
        bush: [0x5a8a3a, 0x4a7a2a, 0x6a9a4a]
      }
    });

    // Desert biome - sandy and sparse
    this.biomeConfigs.set('desert', {
      groundColor: 0xd4a574,
      groundEmissive: 0xa47544,
      groundRoughness: 0.95,
      groundMetalness: 0.0,
      treeDensity: 0.02,
      rockDensity: 0.25,
      bushDensity: 0.08,
      vegetationColors: {
        tree: [0x6a8a4a, 0x5a7a3a, 0x7a9a5a],
        bush: [0x8a9a5a, 0x7a8a4a, 0x9aaa6a]
      }
    });

    // Tundra biome - cold and barren
    this.biomeConfigs.set('tundra', {
      groundColor: 0xd0e0f0,
      groundEmissive: 0xa0c0d0,
      groundRoughness: 0.7,
      groundMetalness: 0.1,
      treeDensity: 0.1,
      rockDensity: 0.3,
      bushDensity: 0.05,
      vegetationColors: {
        tree: [0x3a5a4a, 0x2a4a3a, 0x4a6a5a],
        bush: [0x5a7a6a, 0x4a6a5a, 0x6a8a7a]
      }
    });

    // Swamp biome - dark and murky
    this.biomeConfigs.set('swamp', {
      groundColor: 0x3a4a3a,
      groundEmissive: 0x2a3a2a,
      groundRoughness: 0.8,
      groundMetalness: 0.15,
      treeDensity: 0.25,
      rockDensity: 0.1,
      bushDensity: 0.3,
      vegetationColors: {
        tree: [0x2a5a3a, 0x1a4a2a, 0x3a6a4a],
        bush: [0x3a6a4a, 0x2a5a3a, 0x4a7a5a]
      }
    });

    // Mountains biome - rocky and elevated
    this.biomeConfigs.set('mountains', {
      groundColor: 0x606060,
      groundEmissive: 0x404040,
      groundRoughness: 0.95,
      groundMetalness: 0.2,
      treeDensity: 0.15,
      rockDensity: 0.45,
      bushDensity: 0.1,
      vegetationColors: {
        tree: [0x3a6a4a, 0x2a5a3a, 0x4a7a5a],
        bush: [0x4a7a5a, 0x3a6a4a, 0x5a8a6a]
      }
    });
  }

  getBiomeAt(x: number, z: number): BiomeType {
    // Use Perlin-like noise to determine biome
    // Simple pseudo-noise based on position
    const scale = 0.001;
    const nx = x * scale;
    const nz = z * scale;

    const noise = this.pseudoNoise(nx, nz);

    // Map noise to biomes
    if (noise < -0.5) return 'tundra';
    if (noise < -0.2) return 'mountains';
    if (noise < 0.0) return 'forest';
    if (noise < 0.3) return 'plains';
    if (noise < 0.5) return 'swamp';
    return 'desert';
  }

  private pseudoNoise(x: number, z: number): number {
    // Simple pseudo-random noise function
    const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
    const n2 = Math.sin(x * 45.123 + z * 23.456) * 12345.6789;
    return ((n - Math.floor(n)) + (n2 - Math.floor(n2))) / 2 - 0.5;
  }

  getBiomeConfig(biome: BiomeType): BiomeConfig {
    return this.biomeConfigs.get(biome)!;
  }

  createTree(x: number, z: number, biome: BiomeType): TerrainObject {
    const config = this.getBiomeConfig(biome);
    const group = new THREE.Group();

    const height = 8 + Math.random() * 4;
    const trunkGeometry = new THREE.CylinderGeometry(0.4, 0.6, height, 6);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      flatShading: true,
      emissive: 0x201510,
      emissiveIntensity: 0.1,
      roughness: 0.9,
      metalness: 0.1
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Biome-specific foliage
    const leafColors = config.vegetationColors.tree;
    for (let i = 0; i < 3; i++) {
      const size = 4 - i * 0.8;
      let leavesGeometry;

      // Different tree shapes for different biomes
      if (biome === 'tundra' || biome === 'mountains') {
        leavesGeometry = new THREE.ConeGeometry(size * 0.7, 6 - i * 1.5, 4);
      } else if (biome === 'swamp') {
        leavesGeometry = new THREE.ConeGeometry(size * 1.2, 3 - i * 0.8, 5);
      } else {
        leavesGeometry = new THREE.ConeGeometry(size, 5 - i * 1.2, 6);
      }

      const leafColor = leafColors[Math.floor(Math.random() * leafColors.length)];
      const leavesMaterial = new THREE.MeshStandardMaterial({
        color: leafColor,
        flatShading: true,
        emissive: leafColor,
        emissiveIntensity: 0.15,
        roughness: 0.85,
        metalness: 0.05
      });
      const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
      leaves.position.y = height / 2 + 1 + i * 3.5;
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      group.add(leaves);
    }

    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5 };
  }

  createRock(x: number, z: number, biome: BiomeType): TerrainObject {
    const config = this.getBiomeConfig(biome);
    let size = 0.8 + Math.random() * 1.5;

    // Larger rocks in mountains
    if (biome === 'mountains') {
      size *= 1.5;
    }

    const rockGeometry = new THREE.DodecahedronGeometry(size, 0);
    let rockColor = 0x6a6a6a;

    // Biome-specific rock colors
    if (biome === 'desert') {
      rockColor = Math.random() > 0.5 ? 0x8a7a5a : 0x9a8a6a;
    } else if (biome === 'tundra') {
      rockColor = Math.random() > 0.5 ? 0xd0e0f0 : 0xc0d0e0;
    } else if (biome === 'swamp') {
      rockColor = Math.random() > 0.5 ? 0x3a4a3a : 0x4a5a4a;
    }

    const rockMaterial = new THREE.MeshStandardMaterial({
      color: rockColor,
      flatShading: true,
      roughness: config.groundRoughness,
      metalness: config.groundMetalness,
      emissive: rockColor,
      emissiveIntensity: 0.05
    });

    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.position.set(x, size * 0.5, z);
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    return { mesh: rock, x, z, type: 'rock', collidable: true, radius: size + 0.5 };
  }

  createBush(x: number, z: number, biome: BiomeType): TerrainObject {
    const config = this.getBiomeConfig(biome);
    const group = new THREE.Group();
    const bushSize = 0.8 + Math.random() * 0.6;

    const bushColors = config.vegetationColors.bush;

    for (let i = 0; i < 3; i++) {
      let bushGeometry;

      // Different bush shapes for different biomes
      if (biome === 'desert') {
        bushGeometry = new THREE.SphereGeometry(bushSize * (1 - i * 0.2), 3, 2);
      } else if (biome === 'swamp') {
        bushGeometry = new THREE.SphereGeometry(bushSize * (1 - i * 0.1), 4, 4);
      } else {
        bushGeometry = new THREE.SphereGeometry(bushSize * (1 - i * 0.15), 4, 3);
      }

      const bushColor = bushColors[Math.floor(Math.random() * bushColors.length)];
      const bushMaterial = new THREE.MeshStandardMaterial({
        color: bushColor,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.05,
        emissive: bushColor,
        emissiveIntensity: 0.1
      });
      const bushPart = new THREE.Mesh(bushGeometry, bushMaterial);
      bushPart.position.set(
        (Math.random() - 0.5) * bushSize * 0.5,
        bushSize * (1 - i * 0.15),
        (Math.random() - 0.5) * bushSize * 0.5
      );
      bushPart.castShadow = true;
      bushPart.receiveShadow = true;
      group.add(bushPart);
    }

    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: bushSize };
  }

  createBoulder(x: number, z: number, biome: BiomeType): TerrainObject {
    const size = 2.5 + Math.random() * 2;
    const boulderGeometry = new THREE.IcosahedronGeometry(size, 0);

    let boulderColor = 0x555555;
    if (biome === 'desert') {
      boulderColor = 0x9a8a6a;
    } else if (biome === 'tundra') {
      boulderColor = 0xb0c0d0;
    } else if (biome === 'mountains') {
      boulderColor = 0x505050;
    }

    const boulderMaterial = new THREE.MeshStandardMaterial({
      color: boulderColor,
      flatShading: true,
      roughness: 0.9,
      metalness: 0.2,
      emissive: boulderColor,
      emissiveIntensity: 0.08
    });
    const boulder = new THREE.Mesh(boulderGeometry, boulderMaterial);
    boulder.castShadow = true;
    boulder.receiveShadow = true;
    boulder.position.set(x, size * 0.6, z);
    boulder.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );

    return { mesh: boulder, x, z, type: 'boulder', collidable: true, radius: size + 1 };
  }

  // Update ground material based on biome
  updateGroundMaterial(ground: THREE.Mesh, biome: BiomeType) {
    const config = this.getBiomeConfig(biome);

    if (ground.material instanceof THREE.MeshStandardMaterial) {
      ground.material.color.setHex(config.groundColor);
      ground.material.emissive.setHex(config.groundEmissive);
      ground.material.roughness = config.groundRoughness;
      ground.material.metalness = config.groundMetalness;
    }
  }

  // Create special biome features (water, cacti, etc.)
  createSpecialFeature(x: number, z: number, biome: BiomeType): TerrainObject | null {
    if (biome === 'swamp' && Math.random() < 0.3) {
      // Create water puddle
      const waterGeometry = new THREE.CircleGeometry(2 + Math.random() * 2, 16);
      const waterMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a5a6a,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0x1a3a4a,
        emissiveIntensity: 0.3
      });
      const water = new THREE.Mesh(waterGeometry, waterMaterial);
      water.rotation.x = -Math.PI / 2;
      water.position.set(x, 0.1, z);
      water.receiveShadow = true;

      return { mesh: water, x, z, type: 'water', collidable: false, radius: 2 };
    } else if (biome === 'desert' && Math.random() < 0.2) {
      // Create cactus
      const group = new THREE.Group();
      const height = 3 + Math.random() * 2;
      const cactusGeometry = new THREE.CylinderGeometry(0.3, 0.35, height, 6);
      const cactusMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a7a3a,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.05
      });
      const cactus = new THREE.Mesh(cactusGeometry, cactusMaterial);
      cactus.position.y = height / 2;
      cactus.castShadow = true;
      cactus.receiveShadow = true;
      group.add(cactus);

      // Add arms
      if (Math.random() < 0.7) {
        const armGeometry = new THREE.CylinderGeometry(0.2, 0.25, 1.5, 5);
        const arm = new THREE.Mesh(armGeometry, cactusMaterial);
        arm.position.set(0.5, height / 2, 0);
        arm.rotation.z = Math.PI / 4;
        arm.castShadow = true;
        group.add(arm);
      }

      group.position.set(x, 0, z);
      return { mesh: group, x, z, type: 'cactus', collidable: true, radius: 1 };
    }

    return null;
  }
}
