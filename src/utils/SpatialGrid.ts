/**
 * Lightweight 2-D spatial hash for fast neighbour lookups on the XZ plane.
 *
 * Replaces O(N) and O(N²) per-frame loops over enemies, bullets, or terrain
 * with O(near) cell lookups. Pure JS, no deps — the hot path is a single
 * `Math.floor` per coordinate and a `Map` lookup.
 *
 * Usage pattern:
 *   const grid = new SpatialGrid<number>(8); // 8-unit cells
 *   grid.clear();
 *   for (let i = 0; i < items.length; i++) grid.insert(i, items[i].x, items[i].z);
 *   const ids = grid.queryRadius(player.x, player.z, 5);
 *   for (const id of ids) { ... items[id] ... }
 *
 * The generic param T is the value stored per cell (usually an index or id).
 * Cells use plain arrays — pushed during insert, walked during query. The
 * `_results` array is reused across queries to avoid allocations.
 */
export class SpatialGrid<T> {
  private readonly invCellSize: number;
  private readonly cells = new Map<number, T[]>();
  private _results: T[] = [];

  constructor(cellSize: number) {
    this.invCellSize = 1 / cellSize;
  }

  /** Empty every cell so the grid is ready to be rebuilt for this frame. */
  clear(): void {
    // Reuse cell arrays by truncating them instead of dropping references;
    // this keeps GC pressure low across hundreds of frames per second.
    this.cells.forEach(bucket => { bucket.length = 0; });
  }

  /** Place `item` at world position (x, z). */
  insert(item: T, x: number, z: number): void {
    const key = this.keyFor(x, z);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(item);
  }

  /**
   * Return every item within `radius` of (x, z).
   *
   * The returned array is REUSED — callers must read it before the next
   * query. Do not retain the reference.
   */
  queryRadius(x: number, z: number, radius: number): T[] {
    const out = this._results;
    out.length = 0;

    const minX = Math.floor((x - radius) * this.invCellSize);
    const maxX = Math.floor((x + radius) * this.invCellSize);
    const minZ = Math.floor((z - radius) * this.invCellSize);
    const maxZ = Math.floor((z + radius) * this.invCellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.cells.get(this.keyAt(cx, cz));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }

    return out;
  }

  /** Total items currently in the grid (debug / diagnostics). */
  size(): number {
    let total = 0;
    this.cells.forEach(bucket => { total += bucket.length; });
    return total;
  }

  private keyFor(x: number, z: number): number {
    return this.keyAt(Math.floor(x * this.invCellSize), Math.floor(z * this.invCellSize));
  }

  // Pack (cellX, cellZ) into a single integer Map key. The +/- 32768 offset
  // keeps cellX in non-negative territory before bitwise packing, which is
  // significantly faster than string keys (`${cx},${cz}`) for hot lookups.
  private keyAt(cx: number, cz: number): number {
    return ((cx + 32768) << 16) | ((cz + 32768) & 0xffff);
  }
}
