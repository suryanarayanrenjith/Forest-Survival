import * as THREE from 'three';
import type { TerrainObject } from '../types/game';

export type BiomeType = 'forest' | 'volcanic' | 'tundra' | 'desert' | 'swamp' | 'military' | 'ruins' | 'twilight';

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

// ─────────────────────────────────────────────────────────────────────────────
// Shared resource pools.
//
// The old BiomeSystem allocated a fresh `MeshStandardMaterial` and matching
// `BufferGeometry` for every single tree / rock / bush in every chunk. With a
// 3x3 chunk load radius and a forest biome (~40 trees, ~35 bushes, ~15 rocks
// per chunk × 4-5 sub-meshes each), the world easily creates 1500+ unique
// materials and 1500+ unique geometries — burning RAM, hammering the shader
// cache and shredding draw-call sort coherence.
//
// We deduplicate aggressively: any material with the same options reuses one
// instance, and any geometry built from the same constructor + args reuses
// one instance. Per-object visual variety still comes through via mesh
// transforms (scale, rotation, position) which are free.
//
// All pools live on the BiomeSystem instance so they're released for GC when
// the game scene tears down, no leaks between runs.
// ─────────────────────────────────────────────────────────────────────────────

type StdMatOpts = THREE.MeshStandardMaterialParameters;

function hashStdMatOpts(o: StdMatOpts): string {
  return [
    'std',
    o.color ?? 0,
    o.emissive ?? 0,
    o.emissiveIntensity ?? 0,
    o.roughness ?? 1,
    o.metalness ?? 0,
    o.flatShading ? 1 : 0,
    o.transparent ? 1 : 0,
    o.opacity ?? 1,
    o.side ?? 0,
  ].join(':');
}

export class BiomeSystem {
  private biomeConfigs: Map<BiomeType, BiomeConfig>;

  // === SHARED MATERIAL / GEOMETRY POOLS ===
  private matPool = new Map<string, THREE.Material>();
  private geoPool = new Map<string, THREE.BufferGeometry>();

  /** Reuse a MeshStandardMaterial with the given options, or create + cache it. */
  private mat(opts: StdMatOpts): THREE.MeshStandardMaterial {
    const key = hashStdMatOpts(opts);
    const cached = this.matPool.get(key);
    if (cached) return cached as THREE.MeshStandardMaterial;
    const fresh = new THREE.MeshStandardMaterial(opts);
    this.matPool.set(key, fresh);
    return fresh;
  }

  /**
   * Reuse a geometry built by `factory`, or create + cache it.
   * `key` identifies the exact geometry — same key always yields the same
   * instance, so per-object scaling must be done on the mesh, not the geo.
   */
  private geo<T extends THREE.BufferGeometry>(key: string, factory: () => T): T {
    const cached = this.geoPool.get(key);
    if (cached) return cached as T;
    const fresh = factory();
    this.geoPool.set(key, fresh);
    return fresh;
  }

  // === Common unit primitives (built once, scaled per-instance) ===
  // Heights/radii are 1 by default; meshes scale to the desired size.
  private unitCyl(rTop: number, rBot: number, radial: number, key: string): THREE.CylinderGeometry {
    return this.geo(`cyl:${key}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, radial)) as THREE.CylinderGeometry;
  }
  private unitCone(radius: number, radial: number, key: string): THREE.ConeGeometry {
    return this.geo(`cone:${key}`, () => new THREE.ConeGeometry(radius, 1, radial)) as THREE.ConeGeometry;
  }
  private unitBox(key: string): THREE.BoxGeometry {
    return this.geo(`box:${key}`, () => new THREE.BoxGeometry(1, 1, 1)) as THREE.BoxGeometry;
  }
  private unitSphere(radial: number, segs: number, key: string): THREE.SphereGeometry {
    return this.geo(`sph:${key}`, () => new THREE.SphereGeometry(1, radial, segs)) as THREE.SphereGeometry;
  }
  private unitDodec(detail: number): THREE.DodecahedronGeometry {
    return this.geo(`dodec:${detail}`, () => new THREE.DodecahedronGeometry(1, detail)) as THREE.DodecahedronGeometry;
  }
  private unitOcta(detail: number): THREE.OctahedronGeometry {
    return this.geo(`octa:${detail}`, () => new THREE.OctahedronGeometry(1, detail)) as THREE.OctahedronGeometry;
  }
  private unitIco(detail: number): THREE.IcosahedronGeometry {
    return this.geo(`ico:${detail}`, () => new THREE.IcosahedronGeometry(1, detail)) as THREE.IcosahedronGeometry;
  }
  private unitTet(detail: number): THREE.TetrahedronGeometry {
    return this.geo(`tet:${detail}`, () => new THREE.TetrahedronGeometry(1, detail)) as THREE.TetrahedronGeometry;
  }
  private circle(radius: number, segs: number): THREE.CircleGeometry {
    return this.geo(`circ:${radius}:${segs}`, () => new THREE.CircleGeometry(radius, segs)) as THREE.CircleGeometry;
  }
  private torus(r: number, t: number, ts: number, rs: number): THREE.TorusGeometry {
    return this.geo(`torus:${r}:${t}:${ts}:${rs}`, () => new THREE.TorusGeometry(r, t, ts, rs)) as THREE.TorusGeometry;
  }

  // === GRASS SYSTEM ===
  // Per-biome grass tint + density (0 = none). Shared geometry + per-biome
  // materials keep thousands of instanced blades cheap to render.
  private grassConfigs: Record<BiomeType, { color: number; density: number }> = {
    forest:   { color: 0x3c7a2c, density: 1.0 },
    volcanic: { color: 0x3a2218, density: 0.12 },
    tundra:   { color: 0x9ab0a8, density: 0 },     // snow & ice — no grass grows here
    desert:   { color: 0xc2a866, density: 0.22 },
    swamp:    { color: 0x4c6a32, density: 0.95 },
    military: { color: 0x5e6e3e, density: 0.5 },
    ruins:    { color: 0x52823a, density: 0.66 },
    // Twilight vale — sparse dusk grass with deep purple-blue tint.
    twilight: { color: 0x3a2a55, density: 0.55 },
  };
  private grassGeo: THREE.BufferGeometry | null = null;
  private grassMaterials: Map<BiomeType, THREE.MeshStandardMaterial> = new Map();
  // Shared time uniform driving the grass wind sway (updated each frame)
  private grassTime = { value: 0 };

  constructor(_scene: THREE.Scene) {
    this.biomeConfigs = new Map();
    this.initializeBiomes();
  }

  /** Release every pooled resource. Called when the game scene tears down. */
  dispose() {
    this.matPool.forEach((m) => m.dispose());
    this.geoPool.forEach((g) => g.dispose());
    this.matPool.clear();
    this.geoPool.clear();
    this.grassMaterials.forEach((m) => m.dispose());
    this.grassMaterials.clear();
    if (this.grassGeo) { this.grassGeo.dispose(); this.grassGeo = null; }
  }

  /** Advance the grass wind animation — call once per frame. */
  updateGrass(time: number) {
    this.grassTime.value = time;
  }

  /** Lazily-built tapered grass blade (6 verts, 2 triangles). */
  private getGrassGeometry(): THREE.BufferGeometry {
    if (this.grassGeo) return this.grassGeo;
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array([
      -0.07, 0, 0,   0.07, 0, 0,   -0.022, 0.62, 0,
       0.07, 0, 0,   0.022, 0.62, 0,  -0.022, 0.62, 0,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    this.grassGeo = g;
    return g;
  }

  /** Per-biome grass material with a wind sway injected into the shader. */
  private getGrassMaterial(biome: BiomeType): THREE.MeshStandardMaterial {
    const cached = this.grassMaterials.get(biome);
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial({
      color: this.grassConfigs[biome].color,
      roughness: 0.62,
      metalness: 0.03,
      emissive: this.grassConfigs[biome].color,
      emissiveIntensity: 0.16,
      side: THREE.DoubleSide,
      flatShading: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float gWindH = transformed.y;
         float gWindP = uTime * 1.5 + instanceMatrix[3].x * 0.18 + instanceMatrix[3].z * 0.18;
         float gWindS = gWindH * gWindH * 0.55;
         transformed.x += sin(gWindP) * gWindS;
         transformed.z += cos(gWindP * 0.8) * gWindS * 0.6;`,
      );
    };
    this.grassMaterials.set(biome, mat);
    return mat;
  }

  /**
   * Builds a chunk-sized field of instanced grass tufts. Returns a single
   * TerrainObject (one InstancedMesh = one draw call) so the existing chunk
   * culling can stream it in and out. Returns null for biomes with no grass.
   */
  createGrassField(
    startX: number, startZ: number, size: number, biome: BiomeType, detailMult = 1,
  ): TerrainObject | null {
    const density = this.grassConfigs[biome].density;
    if (density <= 0) return null;

    const count = Math.floor(640 * density * Math.max(0.4, detailMult));
    if (count < 8) return null;

    const mesh = new THREE.InstancedMesh(this.getGrassGeometry(), this.getGrassMaterial(biome), count);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    const clusters = Math.max(1, Math.floor(count / 6));
    for (let c = 0; c < clusters && placed < count; c++) {
      const cx = startX + Math.random() * size;
      const cz = startZ + Math.random() * size;
      const perCluster = 4 + Math.floor(Math.random() * 5);
      for (let b = 0; b < perCluster && placed < count; b++) {
        dummy.position.set(
          cx + (Math.random() - 0.5) * 1.5,
          0,
          cz + (Math.random() - 0.5) * 1.5,
        );
        dummy.rotation.set(
          (Math.random() - 0.5) * 0.32,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.32,
        );
        const s = 0.7 + Math.random() * 0.95;
        dummy.scale.set(s, s * (0.8 + Math.random() * 0.7), s);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;

    return {
      mesh, x: startX + size / 2, z: startZ + size / 2,
      type: 'bush', collidable: false, radius: size / 2,
    };
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

    this.biomeConfigs.set('twilight', {
      // Dusk forest floor — deep violet earth with subtle warm undertone
      // from the setting sun.
      groundColor: 0x2a1a35,
      groundEmissive: 0x180e22,
      groundRoughness: 0.78,
      groundMetalness: 0.18,
      treeDensity: 0.32,
      rockDensity: 0.18,
      bushDensity: 0.28,
      // Trees: charred-dark trunks tinted purple. Bushes: glowing
      // bioluminescent fungi / wisp patches.
      vegetationColors: {
        tree: [0x1a0e22, 0x281530, 0x10081a, 0x32183f],
        bush: [0x6a3aa8, 0x3a55c8, 0x7a44d0],
      },
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
      case 'ruins': return this.createStoneColumn(x, z);
      case 'twilight': return this.createTwilightTree(x, z);
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
      case 'ruins': return this.createStoneDebris(x, z);
      case 'twilight': return this.createTwilightStone(x, z);
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
      case 'ruins': return this.createVineRubble(x, z);
      case 'twilight': return this.createTwilightWisp(x, z);
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
      case 'ruins': return this.createBrokenWall(x, z);
      case 'twilight': return this.createTwilightMonolith(x, z);
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
      case 'ruins':
        if (roll < 0.25) return this.createArchedDoorway(x, z);
        if (roll < 0.45) return this.createStatue(x, z);
        return null;
      case 'twilight':
        if (roll < 0.32) return this.createTwilightShrine(x, z);
        if (roll < 0.52) return this.createTwilightFallenLog(x, z);
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
    const trunkMat = this.mat({ color: 0x3d2a18, flatShading: true, roughness: 0.95, metalness: 0.0, emissive: 0x140d06, emissiveIntensity: 0.1 });
    const trunk = new THREE.Mesh(this.unitCyl(0.34, 0.72, 7, 'forestTrunk'), trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    // Layered canopy — 4 cones with shared geometry per layer, shared materials per palette color.
    const canopyPalette = [0x0e4d1c, 0x166327, 0x1f7c33, 0x32953f];
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      const color = canopyPalette[i];
      const coneRadius = 4.2 - i * 0.85;
      const coneHeight = 4.4 - i * 0.7;
      const coneMat = this.mat({
        color, flatShading: true, roughness: 0.62 - t * 0.08, metalness: 0.04,
        emissive: color, emissiveIntensity: 0.12 + t * 0.10,
      });
      const cone = new THREE.Mesh(this.unitCone(coneRadius, 7, `forestCanopy${i}`), coneMat);
      cone.scale.set(1, coneHeight, 1);
      cone.position.y = height / 2 + 0.3 + i * 2.7;
      cone.rotation.y = Math.random() * Math.PI;
      cone.castShadow = true; cone.receiveShadow = true;
      group.add(cone);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5, height: 99 };
  }

  private createForestRock(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.5;
    const rockMat = this.mat({ color: 0x5a6a5a, flatShading: true, roughness: 0.68, metalness: 0.10, emissive: 0x2a3a2a, emissiveIntensity: 0.06 });
    const rock = new THREE.Mesh(this.unitDodec(0), rockMat);
    rock.scale.setScalar(size);
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
      const bushMat = this.mat({ color, flatShading: true, roughness: 0.6, metalness: 0.04, emissive: color, emissiveIntensity: 0.14 });
      const partSize = bushSize * (1 - i * 0.15);
      const part = new THREE.Mesh(this.unitSphere(4, 3, 'bushSphere'), bushMat);
      part.scale.setScalar(partSize);
      part.position.set((Math.random() - 0.5) * bushSize * 0.5, partSize, (Math.random() - 0.5) * bushSize * 0.5);
      part.castShadow = true; part.receiveShadow = true;
      group.add(part);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: bushSize };
  }

  private createForestBoulder(x: number, z: number): TerrainObject {
    const size = 2.5 + Math.random() * 2;
    const boulderMat = this.mat({ color: 0x555555, flatShading: true, roughness: 0.65, metalness: 0.22, emissive: 0x2a2a2a, emissiveIntensity: 0.10 });
    const boulder = new THREE.Mesh(this.unitIco(0), boulderMat);
    boulder.scale.setScalar(size);
    boulder.castShadow = true; boulder.receiveShadow = true;
    boulder.position.set(x, size * 0.6, z);
    boulder.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    return { mesh: boulder, x, z, type: 'boulder', collidable: true, radius: size + 1, height: size * 1.2 };
  }

  private createFallenLog(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const length = 4 + Math.random() * 4;
    const logMat = this.mat({ color: 0x4a3520, flatShading: true, roughness: 0.95 });
    const log = new THREE.Mesh(this.unitCyl(0.5, 0.6, 6, 'fallenLog'), logMat);
    log.scale.set(1, length, 1);
    log.rotation.z = Math.PI / 2; log.position.y = 0.5;
    log.castShadow = true; log.receiveShadow = true;
    group.add(log);
    const mossMat = this.mat({ color: 0x2a6a2a, flatShading: true, emissive: 0x1a4a1a, emissiveIntensity: 0.15 });
    const moss = new THREE.Mesh(this.unitSphere(4, 3, 'mossSph'), mossMat);
    moss.position.set(0, 0.8, 0); moss.scale.set(2 * 0.6, 0.4 * 0.6, 1 * 0.6);
    group.add(moss);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2, height: 1.5 };
  }

  private createMushroomCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stemMat = this.mat({ color: 0xddc8a0, flatShading: true });
    const capRed = this.mat({ color: 0xcc3322, flatShading: true, emissive: 0x331100, emissiveIntensity: 0.15 });
    const capOrange = this.mat({ color: 0xdd8833, flatShading: true, emissive: 0x331100, emissiveIntensity: 0.15 });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const h = 0.5 + Math.random() * 0.8;
      const stem = new THREE.Mesh(this.unitCyl(0.08, 0.1, 5, 'mushStem'), stemMat);
      stem.scale.set(1, h, 1);
      const capRadius = 0.25 + Math.random() * 0.15;
      const cap = new THREE.Mesh(this.unitCone(capRadius, 6, `mushCap${capRadius.toFixed(2)}`), Math.random() > 0.5 ? capRed : capOrange);
      cap.scale.set(1, 0.3, 1);
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
    const trunkMat = this.mat({ color: 0x161210, flatShading: true, roughness: 0.95, metalness: 0.18, emissive: 0x140600, emissiveIntensity: 0.12 });
    const trunk = new THREE.Mesh(this.unitCyl(0.32, 0.78, 6, 'charredTrunk'), trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    // Glowing magma veins running up the charred bark
    const crackMat = this.mat({ color: 0x000000, emissive: 0xff5512, emissiveIntensity: 2.2, flatShading: true });
    const crackBox = this.unitBox('crackBox');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random();
      const crackH = height * (0.5 + Math.random() * 0.35);
      const crack = new THREE.Mesh(crackBox, crackMat);
      crack.scale.set(0.09, crackH, 0.09);
      crack.position.set(Math.cos(a) * 0.42, (Math.random() - 0.3) * height * 0.3, Math.sin(a) * 0.42);
      crack.rotation.z = (Math.random() - 0.5) * 0.3;
      group.add(crack);
    }
    // Charred broken branches
    const branchMat = this.mat({ color: 0x0c0807, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 2; i++) {
      const branch = new THREE.Mesh(this.unitCyl(0.05, 0.16, 4, 'charredBranch'), branchMat);
      branch.scale.set(1, 1.5, 1);
      branch.position.set(i === 0 ? 0.5 : -0.5, height * 0.3 * (i + 1), 0);
      branch.rotation.z = (i === 0 ? 1 : -1) * (0.5 + Math.random() * 0.8);
      branch.castShadow = true;
      group.add(branch);
    }
    // Smouldering ember bed at the base
    const emberMat = this.mat({ color: 0x000000, emissive: 0xff3a00, emissiveIntensity: 1.6, transparent: true, opacity: 0.55 });
    const ember = new THREE.Mesh(this.unitSphere(5, 3, 'emberSph'), emberMat);
    ember.position.y = -height / 2 + 0.25; ember.scale.set(0.85, 0.85 * 0.3, 0.85);
    group.add(ember);
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.0, height: 99 };
  }

  private createObsidianShard(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const group = new THREE.Group();
    const shardMat = this.mat({ color: 0x09090c, flatShading: true, roughness: 0.08, metalness: 0.85, emissive: 0x1a0a06, emissiveIntensity: 0.18 });
    const tet = this.unitTet(0);
    const shard = new THREE.Mesh(tet, shardMat);
    shard.scale.setScalar(size);
    shard.castShadow = true; shard.receiveShadow = true;
    shard.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.3);
    group.add(shard);
    const shard2 = new THREE.Mesh(tet, shardMat);
    shard2.scale.setScalar(size * 0.5);
    shard2.position.set(size * 0.7, -size * 0.35, size * 0.3);
    shard2.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
    shard2.castShadow = true;
    group.add(shard2);
    const glowMat = this.mat({ color: 0x000000, emissive: 0xff4a14, emissiveIntensity: 1.4, transparent: true, opacity: 0.5 });
    const glow = new THREE.Mesh(this.circle(0.9, 8), glowMat);
    glow.scale.setScalar(size);
    glow.rotation.x = -Math.PI / 2; glow.position.y = -size * 0.55;
    group.add(glow);
    group.position.set(x, size * 0.6, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.5 };
  }

  private createEmberPatch(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const emberRed = this.mat({ color: 0xff4400, emissive: 0xff3300, emissiveIntensity: 0.8, flatShading: true });
    const emberOrange = this.mat({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.8, flatShading: true });
    const sph = this.unitSphere(3, 2, 'emberPatchSph');
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const s = 0.15 + Math.random() * 0.2;
      const ember = new THREE.Mesh(sph, Math.random() > 0.5 ? emberRed : emberOrange);
      ember.scale.setScalar(s);
      ember.position.set((Math.random() - 0.5) * 2, 0.1 + Math.random() * 0.3, (Math.random() - 0.5) * 2);
      group.add(ember);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1.5 };
  }

  private createVolcanicBoulder(x: number, z: number): TerrainObject {
    const size = 2.5 + Math.random() * 2;
    const group = new THREE.Group();
    const boulderMat = this.mat({ color: 0x2a1a15, flatShading: true, roughness: 0.9, metalness: 0.15 });
    const boulder = new THREE.Mesh(this.unitIco(1), boulderMat);
    boulder.scale.setScalar(size);
    boulder.castShadow = true; boulder.receiveShadow = true;
    group.add(boulder);
    const veinMat = this.mat({ color: 0xff2200, emissive: 0xff4400, emissiveIntensity: 0.8, flatShading: true });
    const veinBox = this.unitBox('veinBox');
    for (let i = 0; i < 3; i++) {
      const vein = new THREE.Mesh(veinBox, veinMat);
      vein.scale.set(0.1, size * 0.8, 0.1);
      vein.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      group.add(vein);
    }
    group.position.set(x, size * 0.6, z);
    group.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: size + 1, height: size * 1.2 };
  }

  private createLavaPool(x: number, z: number): TerrainObject {
    const radius = 2 + Math.random() * 2.5;
    const poolMat = this.mat({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 });
    const pool = new THREE.Mesh(this.circle(1, 12), poolMat);
    pool.scale.setScalar(radius);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); pool.receiveShadow = true;
    return { mesh: pool, x, z, type: 'water', collidable: false, radius };
  }

  private createSmokeVent(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const ringMat = this.mat({ color: 0x2a1a10, flatShading: true, roughness: 0.95 });
    const ring = new THREE.Mesh(this.torus(0.8, 0.3, 4, 6), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; ring.castShadow = true;
    group.add(ring);
    const ventMat = this.mat({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.0 });
    const vent = new THREE.Mesh(this.circle(0.6, 6), ventMat);
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
    const trunkMat = this.mat({ color: 0x3a2a20, flatShading: true, roughness: 0.9, metalness: 0.1 });
    const trunk = new THREE.Mesh(this.unitCyl(0.3, 0.5, 5, 'frozenPineTrunk'), trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    const needles = [0x1f4a40, 0x2a5e4e, 0x39705c];
    const snowMat = this.mat({ color: 0xeef4fb, flatShading: true, emissive: 0xb9d4ea, emissiveIntensity: 0.22, roughness: 0.35, metalness: 0.15 });
    for (let i = 0; i < 3; i++) {
      const size = 3 - i * 0.6;
      const color = needles[i];
      const needleMat = this.mat({ color, flatShading: true, emissive: color, emissiveIntensity: 0.20, roughness: 0.55, metalness: 0.06 });
      const foliage = new THREE.Mesh(this.unitCone(size * 0.72, 6, `frozenPineCone${i}`), needleMat);
      foliage.scale.set(1, 4 - i * 1.0, 1);
      foliage.position.y = height / 2 + i * 2.5;
      foliage.rotation.y = Math.random() * Math.PI;
      foliage.castShadow = true;
      group.add(foliage);
      const snow = new THREE.Mesh(this.unitCone(size * 0.54, 6, `frozenPineSnow${i}`), snowMat);
      snow.scale.set(1, 1.05, 1);
      snow.position.y = height / 2 + i * 2.5 + 1.25;
      snow.rotation.y = foliage.rotation.y;
      snow.castShadow = true;
      group.add(snow);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.0, height: 99 };
  }

  private createIceChunk(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const group = new THREE.Group();
    const iceMat = this.mat({ color: 0x9fcfe6, flatShading: true, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.72, emissive: 0x3d7fa6, emissiveIntensity: 0.2 });
    const ice = new THREE.Mesh(this.unitIco(0), iceMat);
    ice.scale.setScalar(size);
    ice.castShadow = true; ice.receiveShadow = true;
    ice.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    group.add(ice);
    const coreMat = this.mat({ color: 0xdff1fb, emissive: 0x8fc8e6, emissiveIntensity: 0.5, flatShading: true });
    const core = new THREE.Mesh(this.unitOcta(0), coreMat);
    core.scale.setScalar(size * 0.45);
    core.rotation.set(Math.random(), Math.random(), Math.random());
    group.add(core);
    group.position.set(x, size * 0.5, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.5 };
  }

  private createSnowMound(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.0;
    const moundMat = this.mat({ color: 0xe8f0f8, flatShading: true, roughness: 0.6, metalness: 0.05, emissive: 0xc0d8e8, emissiveIntensity: 0.1 });
    const mound = new THREE.Mesh(this.unitSphere(5, 4, 'snowMound'), moundMat);
    mound.scale.set(size, size * 0.5, size); mound.position.set(x, size * 0.25, z);
    mound.castShadow = true; mound.receiveShadow = true;
    return { mesh: mound, x, z, type: 'bush', collidable: false, radius: size };
  }

  private createIceWall(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const width = 4 + Math.random() * 3;
    const height = 3 + Math.random() * 2;
    const wallMat = this.mat({ color: 0x8ab8d8, flatShading: true, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.7, emissive: 0x4488aa, emissiveIntensity: 0.2 });
    const wall = new THREE.Mesh(this.unitBox('iceWall'), wallMat);
    wall.scale.set(width, height, 1.5);
    wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    const spikeMat = this.mat({ color: 0xa0d0e8, flatShading: true, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.Mesh(this.unitCone(0.3, 4, 'iceSpike'), spikeMat);
      spike.scale.set(1, 1.5, 1);
      spike.position.set((i - 1) * 1.5, height / 2 + 0.5, 0); spike.castShadow = true;
      group.add(spike);
    }
    group.position.set(x, height / 2, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 1, height: height + 1 };
  }

  private createFrozenPond(x: number, z: number): TerrainObject {
    const radius = 2.5 + Math.random() * 2;
    const pondMat = this.mat({ color: 0x88bbcc, roughness: 0.02, metalness: 0.8, emissive: 0x4488aa, emissiveIntensity: 0.15, transparent: true, opacity: 0.85 });
    const pond = new THREE.Mesh(this.circle(1, 12), pondMat);
    pond.scale.setScalar(radius);
    pond.rotation.x = -Math.PI / 2; pond.position.set(x, 0.08, z); pond.receiveShadow = true;
    return { mesh: pond, x, z, type: 'water', collidable: false, radius };
  }

  private createIcicleCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const icicleMat = this.mat({ color: 0xa0d0e8, flatShading: true, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const h = 1.5 + Math.random() * 2;
      const baseR = 0.15 + Math.random() * 0.1;
      const icicle = new THREE.Mesh(this.unitCone(baseR, 4, `icicle${baseR.toFixed(2)}`), icicleMat);
      icicle.scale.set(1, h, 1);
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
    const strata = [0x9c6332, 0xb87a3c, 0xc89150, 0xa86d38, 0xbe8246];
    const bands = 5;
    const bandH = height / bands;
    for (let i = 0; i < bands; i++) {
      const r1 = botR + (topR - botR) * ((i + 1) / bands);
      const r0 = botR + (topR - botR) * (i / bands);
      const color = strata[i % strata.length];
      const segMat = this.mat({ color, flatShading: true, roughness: 0.72, metalness: 0.04, emissive: 0x3a2410, emissiveIntensity: 0.14 });
      // Per-band radii vary continuously by height — give each band its own
      // unique cylinder geometry (bands within a single mesa share, across
      // mesas the radii differ so caching can't reuse anyway). Build them
      // freshly here rather than mass-pooling, the variant count is bounded.
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r0, bandH * 1.02, 7),
        segMat,
      );
      seg.position.y = -height / 2 + bandH * (i + 0.5);
      seg.rotation.y = (i / bands) * 0.4;
      seg.castShadow = true; seg.receiveShadow = true;
      group.add(seg);
    }
    const capMat = this.mat({ color: 0x8f5e2e, flatShading: true, roughness: 0.97 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(topR + 0.45, topR, 0.9, 7), capMat);
    cap.position.y = height / 2 + 0.45; cap.castShadow = true;
    group.add(cap);
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: topR + 1, height: 99 };
  }

  private createSandstoneRock(x: number, z: number): TerrainObject {
    const size = 1 + Math.random() * 1.5;
    const rockMat = this.mat({ color: 0xc8945c, flatShading: true, roughness: 0.95, emissive: 0x6a4420, emissiveIntensity: 0.05 });
    const rock = new THREE.Mesh(this.unitDodec(0), rockMat);
    rock.scale.set(size, size * 0.7, size);
    rock.castShadow = true; rock.receiveShadow = true;
    rock.position.set(x, size * 0.4, z); rock.rotation.y = Math.random() * Math.PI;
    return { mesh: rock, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 1.0 };
  }

  private createDeadShrub(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const branchMat = this.mat({ color: 0x6a5030, flatShading: true, roughness: 0.95 });
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const h = 0.5 + Math.random() * 1.0;
      const branch = new THREE.Mesh(this.unitCyl(0.03, 0.06, 3, 'deadShrubBranch'), branchMat);
      branch.scale.set(1, h, 1);
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
    const archMat = this.mat({ color: 0xb8783c, flatShading: true, roughness: 0.95 });
    const height = 5 + Math.random() * 3;
    const width = 5 + Math.random() * 2;
    const box = this.unitBox('archBox');
    const lp = new THREE.Mesh(box, archMat);
    lp.scale.set(1.5, height, 1.5);
    lp.position.set(-width / 2, height / 2, 0); lp.castShadow = true; lp.receiveShadow = true;
    group.add(lp);
    const rp = new THREE.Mesh(box, archMat);
    rp.scale.set(1.5, height, 1.5);
    rp.position.set(width / 2, height / 2, 0); rp.castShadow = true; rp.receiveShadow = true;
    group.add(rp);
    const beam = new THREE.Mesh(box, archMat);
    beam.scale.set(width + 2, 1.5, 2);
    beam.position.y = height + 0.5; beam.castShadow = true; beam.receiveShadow = true;
    group.add(beam);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 2, height: height + 1 };
  }

  private createCactus(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 3 + Math.random() * 2;
    const cactusMat = this.mat({ color: 0x4a7a3a, flatShading: true, roughness: 0.9, metalness: 0.05 });
    const body = new THREE.Mesh(this.unitCyl(0.3, 0.35, 6, 'cactusBody'), cactusMat);
    body.scale.set(1, height, 1);
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    if (Math.random() < 0.7) {
      const armH = 1.2 + Math.random();
      const arm = new THREE.Mesh(this.unitCyl(0.2, 0.25, 5, 'cactusArm'), cactusMat);
      arm.scale.set(1, armH, 1);
      arm.position.set(0.6, height * 0.4, 0); arm.rotation.z = -Math.PI / 3; arm.castShadow = true;
      group.add(arm);
      const armUp = new THREE.Mesh(this.unitCyl(0.18, 0.2, 5, 'cactusArmUp'), cactusMat);
      armUp.scale.set(1, armH * 0.7, 1);
      armUp.position.set(1.0, height * 0.5 + armH * 0.3, 0); armUp.castShadow = true;
      group.add(armUp);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'cactus', collidable: true, radius: 1.2, height: height };
  }

  private createSandDune(x: number, z: number): TerrainObject {
    const size = 3 + Math.random() * 3;
    const duneMat = this.mat({ color: 0xd4a574, flatShading: true, roughness: 0.98, emissive: 0xa47544, emissiveIntensity: 0.05 });
    const dune = new THREE.Mesh(this.unitSphere(6, 4, 'duneSph'), duneMat);
    dune.scale.set(size * 1.5, size * 0.35, size); dune.position.set(x, size * 0.15, z);
    dune.receiveShadow = true; dune.rotation.y = Math.random() * Math.PI;
    return { mesh: dune, x, z, type: 'bush', collidable: false, radius: size };
  }

  // ══════════════════════════════════════
  //  SWAMP
  // ══════════════════════════════════════

  private createGnarledTree(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 4;
    const trunkMat = this.mat({ color: 0x2a2018, flatShading: true, roughness: 0.95, metalness: 0.05 });
    const trunk = new THREE.Mesh(this.unitCyl(0.25, 0.6, 5, 'gnarledTrunk'), trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.rotation.z = (Math.random() - 0.5) * 0.3; trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);
    const trunk2 = new THREE.Mesh(this.unitCyl(0.15, 0.4, 4, 'gnarledTrunk2'), trunkMat);
    trunk2.scale.set(1, height * 0.7, 1);
    trunk2.position.set(0.4, -height * 0.15, 0.3); trunk2.rotation.z = (Math.random() - 0.5) * 0.5; trunk2.castShadow = true;
    group.add(trunk2);
    const fColors = [0x24401f, 0x1a3417, 0x315028];
    for (let i = 0; i < 3; i++) {
      const color = fColors[i % fColors.length];
      const foliageMat = this.mat({ color, flatShading: true, emissive: color, emissiveIntensity: 0.12 });
      const size = 2.1 - i * 0.45;
      const foliage = new THREE.Mesh(this.unitSphere(5, 3, 'gnarledFoliage'), foliageMat);
      foliage.scale.set(size, size * 0.5, size);
      foliage.position.set((Math.random() - 0.5) * 2, height / 2 + i * 1.3, (Math.random() - 0.5) * 2);
      foliage.castShadow = true;
      group.add(foliage);
    }
    const fungusMat = this.mat({ color: 0x000000, emissive: 0x6affc0, emissiveIntensity: 1.8, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const fungus = new THREE.Mesh(this.unitCyl(0.32, 0.1, 6, 'fungus'), fungusMat);
      fungus.scale.set(1, 0.16, 1);
      fungus.position.set(Math.cos(a) * 0.4, -height * 0.2 + i * height * 0.22, Math.sin(a) * 0.4);
      fungus.rotation.z = Math.PI / 2 - 0.3; fungus.rotation.y = -a;
      group.add(fungus);
    }
    const mossMat = this.mat({ color: 0x4a6a3a, flatShading: true, emissive: 0x2a4a2a, emissiveIntensity: 0.15 });
    for (let i = 0; i < 3; i++) {
      const moss = new THREE.Mesh(this.unitCyl(0.02, 0.05, 3, 'gnarledMoss'), mossMat);
      moss.scale.set(1, 1.5 + Math.random(), 1);
      moss.position.set((Math.random() - 0.5) * 2.5, height * 0.3, (Math.random() - 0.5) * 2.5);
      group.add(moss);
    }
    group.position.set(x, height / 2, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 2.5, height: 99 };
  }

  private createSwampStone(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 1.2;
    const stoneMat = this.mat({ color: 0x3a4a3a, flatShading: true, roughness: 0.85, metalness: 0.15, emissive: 0x1a2a1a, emissiveIntensity: 0.08 });
    const stone = new THREE.Mesh(this.unitDodec(0), stoneMat);
    stone.scale.set(size, size * 0.6, size);
    stone.castShadow = true; stone.receiveShadow = true;
    stone.position.set(x, size * 0.3, z); stone.rotation.y = Math.random() * Math.PI;
    return { mesh: stone, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 0.8 };
  }

  private createPoisonMushrooms(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stemMat = this.mat({ color: 0x8a8a7a, flatShading: true });
    const capPurple = this.mat({ color: 0x8a44aa, emissive: 0x8a44aa, emissiveIntensity: 0.4, flatShading: true });
    const capGreen = this.mat({ color: 0x44aa66, emissive: 0x44aa66, emissiveIntensity: 0.4, flatShading: true });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) {
      const h = 0.3 + Math.random() * 0.6;
      const stem = new THREE.Mesh(this.unitCyl(0.06, 0.08, 4, 'poisonStem'), stemMat);
      stem.scale.set(1, h, 1);
      const cap = new THREE.Mesh(this.unitSphere(5, 3, 'poisonCap'), Math.random() > 0.5 ? capPurple : capGreen);
      const capR = 0.2 + Math.random() * 0.15;
      cap.scale.set(capR, capR * 0.5, capR);
      cap.position.y = h / 2 + 0.08; stem.position.y = h / 2;
      const m = new THREE.Group(); m.add(stem); m.add(cap);
      m.position.set((Math.random() - 0.5) * 1.8, 0, (Math.random() - 0.5) * 1.8);
      group.add(m);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1.2 };
  }

  private createMudMound(x: number, z: number): TerrainObject {
    const size = 2 + Math.random() * 2;
    const moundMat = this.mat({ color: 0x3a3228, flatShading: true, roughness: 0.95, metalness: 0.1, emissive: 0x1a1a10, emissiveIntensity: 0.05 });
    const mound = new THREE.Mesh(this.unitSphere(5, 4, 'mudMoundSph'), moundMat);
    mound.scale.set(size, size * 0.4, size); mound.position.set(x, size * 0.2, z);
    mound.castShadow = true; mound.receiveShadow = true;
    return { mesh: mound, x, z, type: 'boulder', collidable: true, radius: size + 0.5, height: size * 0.6 };
  }

  private createToxicPool(x: number, z: number): TerrainObject {
    const radius = 2 + Math.random() * 2;
    const poolMat = this.mat({ color: 0x33aa44, emissive: 0x22cc33, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 });
    const pool = new THREE.Mesh(this.circle(1, 10), poolMat);
    pool.scale.setScalar(radius);
    pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.05, z); pool.receiveShadow = true;
    return { mesh: pool, x, z, type: 'water', collidable: false, radius };
  }

  private createHollowLog(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const length = 3 + Math.random() * 3;
    const logMat = this.mat({ color: 0x2a2018, flatShading: true, roughness: 0.95 });
    const log = new THREE.Mesh(this.unitCyl(0.7, 0.8, 6, 'hollowLog'), logMat);
    log.scale.set(1, length, 1);
    log.rotation.z = Math.PI / 2; log.position.y = 0.7;
    log.castShadow = true; log.receiveShadow = true;
    group.add(log);
    const holeMat = this.mat({ color: 0x0a0808 });
    const hole = new THREE.Mesh(this.circle(0.5, 6), holeMat);
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
    const wallMat = this.mat({ color: 0x6a6a62, flatShading: true, roughness: 0.9, metalness: 0.15, emissive: 0x2a2a24, emissiveIntensity: 0.05 });
    const box = this.unitBox('concrete');
    const wall = new THREE.Mesh(box, wallMat);
    wall.scale.set(width, height, 0.8);
    wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    const lipMat = this.mat({ color: 0x55554e, flatShading: true, roughness: 0.9, metalness: 0.25 });
    const lip = new THREE.Mesh(box, lipMat);
    lip.scale.set(width + 0.3, 0.32, 1.05);
    lip.position.y = height + 0.16; lip.castShadow = true;
    group.add(lip);
    const postMat = this.mat({ color: 0x4d4d46, flatShading: true, roughness: 0.88, metalness: 0.3 });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(box, postMat);
      post.scale.set(0.32, height + 0.1, 1.0);
      post.position.set(sx * (width / 2 - 0.1), height / 2, 0);
      post.castShadow = true;
      group.add(post);
    }
    const stripeMat = this.mat({ color: 0xc8a526, flatShading: true, roughness: 0.7, emissive: 0x3a2e08, emissiveIntensity: 0.2 });
    const stripe = new THREE.Mesh(box, stripeMat);
    stripe.scale.set(width * 0.55, 0.5, 0.06);
    stripe.position.set(0, height * 0.62, 0.43);
    group.add(stripe);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: width / 2 + 0.5, height: 99 };
  }

  private createSandbagPile(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const bagMat = this.mat({ color: 0x8a7a5a, flatShading: true, roughness: 0.95 });
    const box = this.unitBox('sandbag');
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3 - row; col++) {
        const bag = new THREE.Mesh(box, bagMat);
        bag.scale.set(1.2, 0.5 * 0.8, 0.6);
        bag.position.set(col * 1.3 - (3 - row) * 0.65 + 0.65, row * 0.5 + 0.25, 0);
        bag.castShadow = true; bag.receiveShadow = true;
        group.add(bag);
      }
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 2.0, height: 1.5 };
  }

  private createSupplyCrate(x: number, z: number): TerrainObject {
    const size = 0.8 + Math.random() * 0.6;
    const group = new THREE.Group();
    const crateMat = this.mat({ color: 0x4a5a3a, flatShading: true, roughness: 0.9, metalness: 0.1 });
    const box = this.unitBox('crate');
    const crate = new THREE.Mesh(box, crateMat);
    crate.scale.setScalar(size);
    crate.position.y = size / 2; crate.castShadow = true; crate.receiveShadow = true;
    group.add(crate);
    const bandMat = this.mat({ color: 0x3a3a32, flatShading: true, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < 2; i++) {
      const band = new THREE.Mesh(box, bandMat);
      band.scale.set(size + 0.05, 0.08, size + 0.05);
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
    const bunkerMat = this.mat({ color: 0x5a5a52, flatShading: true, roughness: 0.9, metalness: 0.2, emissive: 0x2a2a24, emissiveIntensity: 0.05 });
    const box = this.unitBox('bunker');
    const body = new THREE.Mesh(box, bunkerMat);
    body.scale.set(width, height, depth);
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const roofMat = this.mat({ color: 0x4a4a42, flatShading: true, roughness: 0.9, metalness: 0.3 });
    const roof = new THREE.Mesh(box, roofMat);
    roof.scale.set(width + 0.5, 0.5, depth + 0.5);
    roof.position.y = height + 0.25; roof.castShadow = true;
    group.add(roof);
    const slitMat = this.mat({ color: 0x0a0a0a });
    const slit = new THREE.Mesh(box, slitMat);
    slit.scale.set(width * 0.6, 0.4, 0.2);
    slit.position.set(0, height * 0.7, depth / 2 + 0.1);
    group.add(slit);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: Math.max(width, depth) / 2 + 1, height: 3 };
  }

  private createWatchtowerFrame(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 8;
    const legMat = this.mat({ color: 0x5a5a52, flatShading: true, roughness: 0.85, metalness: 0.3 });
    const legGeo = this.unitCyl(0.15, 0.2, 4, 'towerLeg');
    const legs = [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]];
    for (const [lx, lz] of legs) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.scale.set(1, height, 1);
      leg.position.set(lx, height / 2, lz); leg.castShadow = true;
      group.add(leg);
    }
    const platMat = this.mat({ color: 0x4a4a3a, flatShading: true, roughness: 0.9 });
    const box = this.unitBox('towerPlat');
    const platform = new THREE.Mesh(box, platMat);
    platform.scale.set(4, 0.3, 4);
    platform.position.y = height - 0.5; platform.castShadow = true; platform.receiveShadow = true;
    group.add(platform);
    const railMat = this.mat({ color: 0x6a6a5a, flatShading: true, roughness: 0.8, metalness: 0.4 });
    const railGeo = this.unitCyl(0.05, 0.05, 3, 'towerRail');
    for (const [lx, lz] of legs) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.scale.set(1, 1.5, 1);
      rail.position.set(lx, height + 0.25, lz);
      group.add(rail);
    }
    const brace = new THREE.Mesh(box, legMat);
    brace.scale.set(0.1, 5, 0.1);
    brace.position.set(-1.5, height / 2 - 1, 0); brace.rotation.z = 0.4;
    group.add(brace);
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 3, height: 99 };
  }

  private createBarrelCluster(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const count = 2 + Math.floor(Math.random() * 3);
    const greenMat = this.mat({ color: 0x4a6a3a, flatShading: true, roughness: 0.7, metalness: 0.3 });
    const rustMat = this.mat({ color: 0x6a3a2a, flatShading: true, roughness: 0.7, metalness: 0.3 });
    const barrelGeo = this.unitCyl(0.4, 0.4, 8, 'barrel');
    for (let i = 0; i < count; i++) {
      const mat = Math.random() > 0.3 ? greenMat : rustMat;
      const barrel = new THREE.Mesh(barrelGeo, mat);
      barrel.scale.set(1, 1.2, 1);
      barrel.position.set((Math.random() - 0.5) * 2, 0.6, (Math.random() - 0.5) * 2);
      if (Math.random() > 0.7) { barrel.rotation.x = Math.PI / 2; barrel.position.y = 0.4; }
      barrel.castShadow = true; barrel.receiveShadow = true;
      group.add(barrel);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 2, height: 1.5 };
  }

  // ══════════════════════════════════════
  //  RUINS
  // ══════════════════════════════════════

  private createStoneColumn(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 6 + Math.random() * 5;
    const isBroken = Math.random() > 0.5;
    const actualH = isBroken ? height * (0.4 + Math.random() * 0.4) : height;
    const stoneMat = this.mat({ color: 0x837f6f, flatShading: true, roughness: 0.92, metalness: 0.06, emissive: 0x35332b, emissiveIntensity: 0.05 });
    const darkStone = this.mat({ color: 0x5f5c4f, flatShading: true, roughness: 0.95 });
    const shaft = new THREE.Mesh(this.unitCyl(0.58, 0.68, 12, 'columnShaft'), stoneMat);
    shaft.scale.set(1, actualH, 1);
    shaft.position.y = actualH / 2; shaft.castShadow = true; shaft.receiveShadow = true;
    group.add(shaft);
    const fluteBox = this.unitBox('flute');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const flute = new THREE.Mesh(fluteBox, darkStone);
      flute.scale.set(0.1, actualH * 0.96, 0.1);
      flute.position.set(Math.cos(a) * 0.6, actualH / 2, Math.sin(a) * 0.6);
      group.add(flute);
    }
    const base1 = new THREE.Mesh(this.unitCyl(0.95, 1.08, 8, 'base1'), darkStone);
    base1.scale.set(1, 0.32, 1);
    base1.position.y = 0.16; base1.castShadow = true;
    group.add(base1);
    const base2 = new THREE.Mesh(this.unitCyl(0.82, 0.95, 8, 'base2'), stoneMat);
    base2.scale.set(1, 0.3, 1);
    base2.position.y = 0.46;
    group.add(base2);
    if (!isBroken) {
      const capital = new THREE.Mesh(this.unitCyl(1.05, 0.62, 8, 'capital'), stoneMat);
      capital.scale.set(1, 0.5, 1);
      capital.position.y = actualH + 0.25; capital.castShadow = true;
      group.add(capital);
      const abacus = new THREE.Mesh(this.unitBox('abacus'), darkStone);
      abacus.scale.set(1.7, 0.32, 1.7);
      abacus.position.y = actualH + 0.66; abacus.castShadow = true;
      group.add(abacus);
    } else {
      const dodec = this.unitDodec(0);
      for (let i = 0; i < 3; i++) {
        const s = 0.3 + Math.random() * 0.25;
        const chunk = new THREE.Mesh(dodec, stoneMat);
        chunk.scale.setScalar(s);
        chunk.position.set((Math.random() - 0.5) * 0.7, actualH + Math.random() * 0.3, (Math.random() - 0.5) * 0.7);
        chunk.rotation.set(Math.random(), Math.random(), Math.random());
        group.add(chunk);
      }
    }
    if (Math.random() > 0.5) {
      const vineMat = this.mat({ color: 0x3a6a2a, flatShading: true, emissive: 0x2a4a1a, emissiveIntensity: 0.15 });
      const vine = new THREE.Mesh(this.unitCyl(0.03, 0.05, 3, 'columnVine'), vineMat);
      vine.scale.set(1, actualH * 0.6, 1);
      vine.position.set(0.6, actualH * 0.4, 0); vine.rotation.z = 0.1;
      group.add(vine);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 1.5, height: 99 };
  }

  private createStoneDebris(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stoneMat = this.mat({ color: 0x6a6a5a, flatShading: true, roughness: 0.9, metalness: 0.1 });
    const box = this.unitBox('debrisBox');
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const size = 0.3 + Math.random() * 0.5;
      const block = new THREE.Mesh(box, stoneMat);
      block.scale.set(size, size * 0.6, size);
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
    const rubbleMat = this.mat({ color: 0x6a6a5a, flatShading: true, roughness: 0.9 });
    const rubble = new THREE.Mesh(this.unitDodec(0), rubbleMat);
    rubble.scale.set(0.6, 0.6 * 0.5, 0.6);
    rubble.position.y = 0.3; rubble.castShadow = true;
    group.add(rubble);
    const vineMat = this.mat({ color: 0x3a7a2a, flatShading: true, emissive: 0x2a5a1a, emissiveIntensity: 0.15 });
    const sph = this.unitSphere(3, 2, 'vineSph');
    for (let i = 0; i < 3; i++) {
      const s = 0.4 + Math.random() * 0.3;
      const vine = new THREE.Mesh(sph, vineMat);
      vine.scale.set(s, s * 0.5, s);
      vine.position.set((Math.random() - 0.5) * 1, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 1);
      group.add(vine);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 1 };
  }

  private createBrokenWall(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const width = 5 + Math.random() * 4;
    const height = 3 + Math.random() * 2;
    const stoneMat = this.mat({ color: 0x7a7a6a, flatShading: true, roughness: 0.9, metalness: 0.1, emissive: 0x3a3a30, emissiveIntensity: 0.05 });
    const box = this.unitBox('brokenWall');
    const wall = new THREE.Mesh(box, stoneMat);
    wall.scale.set(width, height, 1.0);
    wall.position.y = height / 2; wall.castShadow = true; wall.receiveShadow = true;
    group.add(wall);
    for (let i = 0; i < 4; i++) {
      const blockH = Math.random() * 1.5;
      const block = new THREE.Mesh(box, stoneMat);
      block.scale.set(width / 5, blockH, 1.0);
      block.position.set((i - 1.5) * width / 4, height + blockH / 2, 0); block.castShadow = true;
      group.add(block);
    }
    for (let i = 0; i < 3; i++) {
      const debris = new THREE.Mesh(box, stoneMat);
      debris.scale.set(0.5 + Math.random() * 0.5, 0.3 + Math.random() * 0.3, 0.5);
      debris.position.set((Math.random() - 0.5) * width, 0.2, 1 + Math.random());
      debris.rotation.set(Math.random() * 0.3, Math.random(), Math.random() * 0.3);
      debris.castShadow = true;
      group.add(debris);
    }
    if (Math.random() > 0.4) {
      const vineMat = this.mat({ color: 0x3a7a2a, flatShading: true, emissive: 0x2a5a1a, emissiveIntensity: 0.15 });
      const vine = new THREE.Mesh(this.unitSphere(3, 2, 'brokenWallVine'), vineMat);
      vine.scale.set(1.5, 0.4, 0.5); vine.position.set((Math.random() - 0.5) * width * 0.5, height * 0.5, 0.6);
      group.add(vine);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 1, height: height + 1 };
  }

  private createArchedDoorway(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 5; const width = 4;
    const stoneMat = this.mat({ color: 0x7a7a6a, flatShading: true, roughness: 0.9, metalness: 0.1 });
    const box = this.unitBox('archedBox');
    const lp = new THREE.Mesh(box, stoneMat);
    lp.scale.set(1.2, height, 1.2);
    lp.position.set(-width / 2, height / 2, 0); lp.castShadow = true; lp.receiveShadow = true;
    group.add(lp);
    const rp = new THREE.Mesh(box, stoneMat);
    rp.scale.set(1.2, height, 1.2);
    rp.position.set(width / 2, height / 2, 0); rp.castShadow = true; rp.receiveShadow = true;
    group.add(rp);
    const lintel = new THREE.Mesh(box, stoneMat);
    lintel.scale.set(width + 1.5, 1.2, 1.5);
    lintel.position.y = height + 0.5; lintel.castShadow = true;
    group.add(lintel);
    const crown = new THREE.Mesh(this.unitCone(1, 4, 'archCrown'), stoneMat);
    crown.scale.set(1, 1.5, 1);
    crown.position.y = height + 1.8; crown.castShadow = true;
    group.add(crown);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: width / 2 + 1, height: 99 };
  }

  private createStatue(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const stoneMat = this.mat({ color: 0x7a7a6a, flatShading: true, roughness: 0.85, metalness: 0.15, emissive: 0x3a3a30, emissiveIntensity: 0.05 });
    const box = this.unitBox('statueBox');
    const pedestal = new THREE.Mesh(box, stoneMat);
    pedestal.scale.set(1.5, 1.0, 1.5);
    pedestal.position.y = 0.5; pedestal.castShadow = true; pedestal.receiveShadow = true;
    group.add(pedestal);
    const body = new THREE.Mesh(box, stoneMat);
    body.scale.set(0.8, 2, 0.5);
    body.position.y = 2; body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(this.unitSphere(5, 4, 'statueHead'), stoneMat);
    head.scale.setScalar(0.35);
    head.position.y = 3.3; head.castShadow = true;
    group.add(head);
    const arm = new THREE.Mesh(box, stoneMat);
    arm.scale.set(0.25, 1.2, 0.25);
    arm.position.set(0.55, 2.2, 0); arm.rotation.z = -0.3; arm.castShadow = true;
    group.add(arm);
    if (Math.random() > 0.4) {
      const arm2 = new THREE.Mesh(box, stoneMat);
      arm2.scale.set(0.25, 0.8, 0.25);
      arm2.position.set(-0.55, 2.4, 0); arm2.rotation.z = 0.5; arm2.castShadow = true;
      group.add(arm2);
    }
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'rock', collidable: true, radius: 1.5, height: 4 };
  }

  // ══════════════════════════════════════
  //  TWILIGHT VALE — gnarled dead-leaning trees with bioluminescent
  //  glowing wisps and dark monoliths. Designed to be VISUALLY distinct
  //  from the lush green deep_forest pines — twisted silhouettes
  //  against dusk sky, glowing magenta/cyan accents.
  // ══════════════════════════════════════

  private createTwilightTree(x: number, z: number): TerrainObject {
    const group = new THREE.Group();
    const height = 9 + Math.random() * 5;
    const palette = [0x1a0e22, 0x281530, 0x10081a, 0x32183f];
    const trunkColor = palette[Math.floor(Math.random() * palette.length)];
    // Twisted bare trunk — dark and weathered, slight emissive tint so
    // the silhouette catches the rim of the dusk sun without blending
    // into the dark fog.
    const trunkMat = this.mat({
      color: trunkColor, flatShading: true, roughness: 0.94, metalness: 0.05,
      emissive: 0x3a1858, emissiveIntensity: 0.18,
    });
    // Main trunk leans slightly — gives the "haunted tree" silhouette.
    const trunk = new THREE.Mesh(this.unitCyl(0.18, 0.55, 7, 'twilightTrunk'), trunkMat);
    trunk.scale.set(1, height, 1);
    trunk.rotation.z = (Math.random() - 0.5) * 0.18;
    trunk.castShadow = true; trunk.receiveShadow = true;
    group.add(trunk);

    // Bare branches reaching outward like fingers — NO canopy/foliage.
    // This is THE signature visual that separates twilight trees from
    // forest pines (which have full conical canopies).
    const branchMat = trunkMat;
    const branchCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < branchCount; i++) {
      const a = (i / branchCount) * Math.PI * 2 + Math.random() * 0.6;
      const branchLen = 1.8 + Math.random() * 2.6;
      const branchTilt = 0.4 + Math.random() * 0.8;
      const startY = height * (0.55 + Math.random() * 0.35);

      const branch = new THREE.Mesh(this.unitCyl(0.04, 0.13, 5, 'twilightBranch'), branchMat);
      branch.scale.set(1, branchLen, 1);
      // Anchor branch BASE at trunk surface, midpoint extends outward
      branch.position.set(
        Math.cos(a) * (0.4 + branchLen * 0.5 * Math.sin(branchTilt)),
        startY,
        Math.sin(a) * (0.4 + branchLen * 0.5 * Math.sin(branchTilt)),
      );
      branch.rotation.z = -Math.cos(a) * branchTilt;
      branch.rotation.x = Math.sin(a) * branchTilt;
      branch.castShadow = true;
      group.add(branch);

      // Sub-twigs at the branch tip for a more organic finger silhouette.
      if (Math.random() > 0.4) {
        const twigCount = 1 + Math.floor(Math.random() * 2);
        for (let t = 0; t < twigCount; t++) {
          const twigLen = 0.8 + Math.random() * 1.2;
          const twig = new THREE.Mesh(this.unitCyl(0.02, 0.05, 4, 'twilightTwig'), branchMat);
          twig.scale.set(1, twigLen, 1);
          const tipOffset = branchLen * 0.95;
          const localDir = (Math.random() - 0.5) * 0.8;
          twig.position.copy(branch.position).add(
            new THREE.Vector3(
              Math.cos(a) * tipOffset * 0.4,
              tipOffset * 0.45,
              Math.sin(a) * tipOffset * 0.4,
            ),
          );
          twig.rotation.z = -Math.cos(a) * (branchTilt + localDir);
          twig.rotation.x = Math.sin(a) * (branchTilt + localDir);
          group.add(twig);
        }
      }
    }

    // A single small glowing wisp light attached at the top — signature
    // "magical lantern in the dusk" element. Uses emissive only (no
    // PointLight) to avoid the PointLight scene-recompile cost on
    // chunk streaming.
    const wispColor = [0x9466ff, 0x4ec3ff, 0xd066ff][Math.floor(Math.random() * 3)];
    const wispMat = this.mat({
      color: 0x000000, emissive: wispColor, emissiveIntensity: 2.2, flatShading: true,
      transparent: true, opacity: 0.92,
    });
    const wisp = new THREE.Mesh(this.unitSphere(6, 4, 'twilightWisp'), wispMat);
    wisp.scale.setScalar(0.18 + Math.random() * 0.08);
    wisp.position.y = height * (0.7 + Math.random() * 0.2);
    wisp.position.x = (Math.random() - 0.5) * 0.6;
    wisp.position.z = (Math.random() - 0.5) * 0.6;
    group.add(wisp);

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI * 2;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 1.8, height: 99 };
  }

  private createTwilightStone(x: number, z: number): TerrainObject {
    // Polished obsidian-like stone with subtle purple emissive — reads
    // as ancient ritual stones rather than forest rocks.
    const size = 0.9 + Math.random() * 1.4;
    const stoneMat = this.mat({
      color: 0x14101e, flatShading: true, roughness: 0.22, metalness: 0.55,
      emissive: 0x2a1850, emissiveIntensity: 0.12,
    });
    const stone = new THREE.Mesh(this.unitDodec(0), stoneMat);
    stone.scale.set(size, size * (0.7 + Math.random() * 0.5), size);
    stone.castShadow = true; stone.receiveShadow = true;
    stone.position.set(x, size * 0.4, z);
    stone.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
    return { mesh: stone, x, z, type: 'rock', collidable: true, radius: size + 0.3, height: size * 0.9 };
  }

  private createTwilightWisp(x: number, z: number): TerrainObject {
    // Cluster of bioluminescent wisps — floating glowing spheres around
    // a thin stem. Reads as magical / haunted swamp-fire.
    const group = new THREE.Group();
    const stemMat = this.mat({
      color: 0x281530, flatShading: true, emissive: 0x1a0e22, emissiveIntensity: 0.2,
    });
    const stem = new THREE.Mesh(this.unitCyl(0.04, 0.08, 5, 'twilightWispStem'), stemMat);
    const stemH = 0.4 + Math.random() * 0.5;
    stem.scale.set(1, stemH, 1);
    stem.position.y = stemH / 2;
    group.add(stem);

    const wispCount = 3 + Math.floor(Math.random() * 3);
    const wispColors = [0x9466ff, 0x4ec3ff, 0xd066ff, 0x66ffcf];
    for (let i = 0; i < wispCount; i++) {
      const c = wispColors[Math.floor(Math.random() * wispColors.length)];
      const wispMat = this.mat({
        color: 0x000000, emissive: c, emissiveIntensity: 1.8, flatShading: true,
        transparent: true, opacity: 0.88,
      });
      const wispSize = 0.12 + Math.random() * 0.1;
      const wisp = new THREE.Mesh(this.unitSphere(6, 4, 'twilightBushWisp'), wispMat);
      wisp.scale.setScalar(wispSize);
      const a = (i / wispCount) * Math.PI * 2 + Math.random() * 0.5;
      const r = 0.18 + Math.random() * 0.25;
      wisp.position.set(
        Math.cos(a) * r,
        stemH + 0.05 + Math.random() * 0.3,
        Math.sin(a) * r,
      );
      group.add(wisp);
    }
    group.position.set(x, 0, z);
    return { mesh: group, x, z, type: 'bush', collidable: false, radius: 0.8 };
  }

  private createTwilightMonolith(x: number, z: number): TerrainObject {
    // Tall obsidian monolith — a vertical stone slab with glowing runes.
    // Distinctive against the bare-branch trees.
    const group = new THREE.Group();
    const height = 4.5 + Math.random() * 2.5;
    const width = 1.4 + Math.random() * 0.8;
    const depth = 0.8 + Math.random() * 0.4;
    const stoneMat = this.mat({
      color: 0x0c0916, flatShading: true, roughness: 0.18, metalness: 0.65,
      emissive: 0x180a30, emissiveIntensity: 0.10,
    });
    const slab = new THREE.Mesh(this.unitBox('twilightMono'), stoneMat);
    slab.scale.set(width, height, depth);
    slab.position.y = height / 2;
    slab.rotation.y = Math.random() * 0.3;
    slab.rotation.z = (Math.random() - 0.5) * 0.04;
    slab.castShadow = true; slab.receiveShadow = true;
    group.add(slab);

    // Glowing rune line down the face — emissive thin box.
    const runeColor = [0x9466ff, 0x4ec3ff, 0xd066ff][Math.floor(Math.random() * 3)];
    const runeMat = this.mat({
      color: 0x000000, emissive: runeColor, emissiveIntensity: 2.4, flatShading: true,
    });
    const rune = new THREE.Mesh(this.unitBox('twilightRune'), runeMat);
    rune.scale.set(0.06, height * 0.55, 0.04);
    rune.position.set(0, height * 0.5, depth * 0.5 + 0.01);
    rune.rotation.copy(slab.rotation);
    group.add(rune);

    // Cap block
    const capMat = this.mat({ color: 0x0a0612, flatShading: true, roughness: 0.4, metalness: 0.5 });
    const cap = new THREE.Mesh(this.unitBox('twilightMonoCap'), capMat);
    cap.scale.set(width + 0.2, 0.18, depth + 0.2);
    cap.position.y = height + 0.09;
    cap.rotation.y = slab.rotation.y;
    group.add(cap);

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'boulder', collidable: true, radius: width / 2 + 0.5, height: height + 0.5 };
  }

  private createTwilightShrine(x: number, z: number): TerrainObject {
    // Small ritual altar — base + brazier-like glowing orb.
    const group = new THREE.Group();
    const baseMat = this.mat({
      color: 0x0e0a18, flatShading: true, roughness: 0.4, metalness: 0.4,
    });
    const base = new THREE.Mesh(this.unitCyl(0.65, 0.78, 8, 'twilightShrineBase'), baseMat);
    base.scale.set(1, 0.5, 1);
    base.position.y = 0.25;
    base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    const orbColor = 0x9466ff;
    const orbMat = this.mat({
      color: 0x000000, emissive: orbColor, emissiveIntensity: 2.8, flatShading: true,
      transparent: true, opacity: 0.92,
    });
    const orb = new THREE.Mesh(this.unitSphere(10, 8, 'twilightShrineOrb'), orbMat);
    orb.scale.setScalar(0.35);
    orb.position.y = 0.78;
    group.add(orb);

    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'bush', collidable: true, radius: 0.85, height: 1.2 };
  }

  private createTwilightFallenLog(x: number, z: number): TerrainObject {
    // Twisted dead log on the ground, covered in glowing fungus.
    const group = new THREE.Group();
    const length = 3.5 + Math.random() * 2.5;
    const trunkMat = this.mat({
      color: 0x1a0e22, flatShading: true, roughness: 0.92, metalness: 0.08,
    });
    const log = new THREE.Mesh(this.unitCyl(0.32, 0.4, 6, 'twilightLog'), trunkMat);
    log.scale.set(1, length, 1);
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.35;
    log.castShadow = true; log.receiveShadow = true;
    group.add(log);

    // Glowing fungus patches along the log.
    const fungusColor = [0x9466ff, 0x4ec3ff, 0x66ffcf][Math.floor(Math.random() * 3)];
    const fungusMat = this.mat({
      color: 0x000000, emissive: fungusColor, emissiveIntensity: 1.9, flatShading: true,
    });
    const patchCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < patchCount; i++) {
      const t = i / patchCount;
      const patch = new THREE.Mesh(this.unitSphere(5, 3, 'twilightFungus'), fungusMat);
      const s = 0.1 + Math.random() * 0.1;
      patch.scale.set(s, s * 0.5, s);
      patch.position.set(
        (t - 0.5) * length * 0.9,
        0.65,
        (Math.random() - 0.5) * 0.2,
      );
      group.add(patch);
    }
    group.position.set(x, 0, z);
    group.rotation.y = Math.random() * Math.PI;
    return { mesh: group, x, z, type: 'tree', collidable: true, radius: 1.5, height: 0.9 };
  }
}
