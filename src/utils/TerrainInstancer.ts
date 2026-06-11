import * as THREE from 'three';

/**
 * TERRAIN INSTANCER — GPU-instanced static world props.
 *
 * THE single biggest renderer win in the game. The chunk streamer scatters
 * thousands of trees / rocks / bushes, and each one was a Group of 1-6
 * individual Meshes added straight to the scene. With the 5×5 chunk grid a
 * forest map holds ~10,000+ scene meshes, and every one is a separate draw
 * call (then again in the shadow pass). WebGL is CPU-bound long before that —
 * the observed 10-15 FPS on even strong hardware was almost entirely command
 * submission overhead, not GPU work.
 *
 * BiomeSystem already dedupes geometries + materials aggressively (shared
 * pools), so visually-identical parts differ ONLY by transform — the textbook
 * case for THREE.InstancedMesh. This class absorbs a prop's meshes into
 * per-(geometry, material, shadow-flags) InstancedMesh batches:
 *
 *   • add(root)    — bakes every Mesh leaf's world matrix into a batch slot.
 *                    The Group itself is never added to the scene. Returns
 *                    false (caller falls back to scene.add) when the prop
 *                    contains anything non-batchable (Points, custom shader
 *                    materials, nested InstancedMesh like the grass fields).
 *   • remove(root) — frees the prop's slots via swap-remove, keeping every
 *                    batch's instance list dense.
 *
 * Rendering output is pixel-identical: same geometry, same materials, same
 * world transforms — just ~50 draw calls instead of ~8,000. Batches are
 * created with frustumCulled = false because their instances span the whole
 * loaded world; the vertex cost of off-screen instances is trivial next to
 * the draw-call savings.
 */

interface SlotRef {
  batch: Batch;
  index: number;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  capacity: number;
  count: number;
  /** Owner record per live slot — lets swap-remove repoint the moved slot. */
  owners: (SlotRef | null)[];
}

const INITIAL_CAPACITY = 256;

export class TerrainInstancer {
  private readonly scene: THREE.Scene;
  private readonly batches = new Map<string, Batch>();
  private readonly handles = new Map<THREE.Object3D, SlotRef[]>();
  private readonly _swapMat = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Absorb `root` (a prop Group/Mesh positioned in world space) into the
   * instance batches. Returns false — with NO side effects — when any part
   * of the prop can't be expressed as an instance, so the caller can
   * scene.add() it unchanged.
   */
  add(root: THREE.Object3D): boolean {
    // The prop was built standalone (never scene-attached), so compute its
    // world matrices in isolation before reading leaf transforms.
    root.updateMatrixWorld(true);

    const leaves: THREE.Mesh[] = [];
    let batchable = true;
    root.traverse((obj) => {
      if (!batchable) return;
      const anyObj = obj as THREE.Object3D & {
        isMesh?: boolean; isInstancedMesh?: boolean; isPoints?: boolean;
        isSprite?: boolean; isLine?: boolean; isLight?: boolean;
      };
      if (anyObj.isInstancedMesh || anyObj.isPoints || anyObj.isSprite || anyObj.isLine || anyObj.isLight) {
        batchable = false;
        return;
      }
      if (anyObj.isMesh) {
        const mesh = obj as THREE.Mesh;
        const mat = mesh.material;
        // Only plain single MeshStandardMaterials are safe to instance —
        // anything custom (water shaders etc.) keeps its original mesh.
        if (Array.isArray(mat) || (mat as THREE.Material).type !== 'MeshStandardMaterial') {
          batchable = false;
          return;
        }
        leaves.push(mesh);
      }
    });

    if (!batchable || leaves.length === 0) return false;

    const refs: SlotRef[] = [];
    for (const leaf of leaves) {
      const batch = this.getBatch(leaf);
      this.ensureCapacity(batch);
      const index = batch.count++;
      batch.mesh.setMatrixAt(index, leaf.matrixWorld);
      const ref: SlotRef = { batch, index };
      batch.owners[index] = ref;
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
      refs.push(ref);
    }

    this.handles.set(root, refs);
    return true;
  }

  /** Free every slot owned by `root`. Returns false if it was never batched. */
  remove(root: THREE.Object3D): boolean {
    const refs = this.handles.get(root);
    if (!refs) return false;
    for (const ref of refs) this.freeSlot(ref);
    this.handles.delete(root);
    return true;
  }

  private freeSlot(ref: SlotRef): void {
    const batch = ref.batch;
    const last = batch.count - 1;
    if (ref.index !== last) {
      // Swap the last live instance into the freed slot to stay dense.
      batch.mesh.getMatrixAt(last, this._swapMat);
      batch.mesh.setMatrixAt(ref.index, this._swapMat);
      const moved = batch.owners[last];
      batch.owners[ref.index] = moved;
      if (moved) moved.index = ref.index;
    }
    batch.owners[last] = null;
    batch.count--;
    batch.mesh.count = batch.count;
    batch.mesh.instanceMatrix.needsUpdate = true;
  }

  private getBatch(leaf: THREE.Mesh): Batch {
    const material = leaf.material as THREE.Material;
    const key = `${leaf.geometry.uuid}|${material.uuid}|${leaf.castShadow ? 1 : 0}${leaf.receiveShadow ? 1 : 0}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = this.createBatch(leaf.geometry, material, leaf.castShadow, leaf.receiveShadow);
      this.batches.set(key, batch);
    }
    return batch;
  }

  private createBatch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow: boolean,
    receiveShadow: boolean,
  ): Batch {
    const mesh = this.buildInstancedMesh(geometry, material, castShadow, receiveShadow, INITIAL_CAPACITY);
    return {
      mesh,
      geometry,
      material,
      castShadow,
      receiveShadow,
      capacity: INITIAL_CAPACITY,
      count: 0,
      owners: new Array(INITIAL_CAPACITY).fill(null),
    };
  }

  private buildInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    castShadow: boolean,
    receiveShadow: boolean,
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    // Instances are scattered across the whole loaded world — a single
    // bounding test would cull visible props, so cull at the instance
    // shader's expense instead (trivial for low-poly props).
    mesh.frustumCulled = false;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    // Slots churn as chunks stream in/out.
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    return mesh;
  }

  private ensureCapacity(batch: Batch): void {
    if (batch.count < batch.capacity) return;
    const newCapacity = batch.capacity * 2;
    const fresh = this.buildInstancedMesh(
      batch.geometry, batch.material, batch.castShadow, batch.receiveShadow, newCapacity,
    );
    (fresh.instanceMatrix.array as Float32Array).set(
      (batch.mesh.instanceMatrix.array as Float32Array).subarray(0, batch.count * 16),
    );
    fresh.count = batch.count;
    fresh.instanceMatrix.needsUpdate = true;
    this.scene.remove(batch.mesh);
    batch.mesh.dispose(); // frees only the instance attributes — geo/mat are shared
    batch.mesh = fresh;
    batch.capacity = newCapacity;
    batch.owners.length = newCapacity;
    for (let i = batch.count; i < newCapacity; i++) batch.owners[i] = null;
  }

  /** Live diagnostics — batch count and total instances. */
  getStats(): { batches: number; instances: number } {
    let instances = 0;
    this.batches.forEach((b) => { instances += b.count; });
    return { batches: this.batches.size, instances };
  }

  /** Tear down every batch (geometries/materials are shared — not disposed). */
  dispose(): void {
    this.batches.forEach((batch) => {
      this.scene.remove(batch.mesh);
      batch.mesh.dispose();
    });
    this.batches.clear();
    this.handles.clear();
  }
}
