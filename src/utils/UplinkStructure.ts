// ARK-07 RELAY NETWORK — the physical heart of the game's conspiracy layer.
//
// Not one landmark but a NETWORK: several derelict relay spires stand
// scattered across every combat zone, still carrying the dead satellite's
// command broadcast. Each spire is a weathered pre-collapse installation —
// stepped concrete pad, guyed lattice mast, a big ribbed tracking dish that
// still sweeps, antenna whips with blinking warn-lights, a transformer skid,
// abandoned equipment crates — grounded with scorch rings and sagging cable
// runs so it reads as REAL infrastructure that's been rotting for decades.
//
// Perf contract:
//   • NO dynamic lights — emissive + additive materials only.
//   • ONE shared geometry/material set for the whole network (UplinkNetwork
//     owns it); every STATIC part of a spire is pre-merged per material into
//     a single BufferGeometry, so a fully-dressed spire renders in ~8 draws.
//   • Animated parts (dish pivot, beacons, holo rings, field wall) stay
//     separate meshes driven by update().
//   • dispose() frees everything exactly once, at scene teardown.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyRobotSurface } from './RobotSurface';

export const UPLINK_FIELD_RADIUS = 55;

interface SpireParts {
  group: THREE.Group;
  x: number;
  z: number;
  dishPivot: THREE.Group;
  subDish: THREE.Mesh;
  holoRingA: THREE.Mesh;
  holoRingB: THREE.Mesh;
  fieldWall: THREE.Mesh;
  /** Smoothed visual ground offset (player-relative terrain envelope). */
  yOffset: number;
  /** Per-spire phase so the network's beacons never blink in unison. */
  phase: number;
}

/** Bakes a transformed copy of a primitive into a merge list. */
interface Part {
  geo: THREE.BufferGeometry;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

function bake(parts: Part[]): THREE.BufferGeometry {
  const transformed = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.scale) g.scale(p.scale[0], p.scale[1], p.scale[2]);
    if (p.rot) { g.rotateX(p.rot[0]); g.rotateY(p.rot[1]); g.rotateZ(p.rot[2]); }
    if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2]);
    return g;
  });
  const merged = mergeGeometries(transformed, false)!;
  transformed.forEach((g) => g.dispose());
  return merged;
}

export class UplinkNetwork {
  readonly fieldRadius = UPLINK_FIELD_RADIUS;
  readonly spires: SpireParts[] = [];
  /** Every material the network uses — warmed on quads during the loader. */
  readonly materials: THREE.Material[] = [];

  private readonly geos: THREE.BufferGeometry[] = [];
  // Shared materials
  private readonly concrete: THREE.MeshStandardMaterial;
  private readonly concreteDark: THREE.MeshStandardMaterial;
  private readonly steel: THREE.MeshStandardMaterial;
  private readonly steelDark: THREE.MeshStandardMaterial;
  private readonly dishSkin: THREE.MeshStandardMaterial;
  private readonly hazard: THREE.MeshStandardMaterial;
  private readonly rust: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly warnLightMat: THREE.MeshBasicMaterial;
  private readonly holoMat: THREE.MeshBasicMaterial;
  private readonly fieldMat: THREE.MeshBasicMaterial;
  private readonly scorchMat: THREE.MeshBasicMaterial;
  // Merged per-material static geometry, built ONCE and instanced per spire
  // by reference (BufferGeometry sharing — each spire adds ~10 draw calls).
  private staticConcrete: THREE.BufferGeometry;
  private staticConcreteDark: THREE.BufferGeometry;
  private staticSteel: THREE.BufferGeometry;
  private staticSteelDark: THREE.BufferGeometry;
  private staticHazard: THREE.BufferGeometry;
  private staticRust: THREE.BufferGeometry;
  private staticBeacons: THREE.BufferGeometry;   // beacon + antenna warn tips
  private dishGeo: THREE.BufferGeometry;         // ribbed dish (merged)
  private subDishGeo: THREE.BufferGeometry;
  private feedGeo: THREE.BufferGeometry;
  private holoRingGeoA: THREE.TorusGeometry;
  private holoRingGeoB: THREE.TorusGeometry;
  private fieldWallGeo: THREE.CylinderGeometry;
  private scorchGeo: THREE.CircleGeometry;

  private readonly baseBeacon = new THREE.Color(0xff2318);
  private readonly surgeBeacon = new THREE.Color(0xff5a2a);
  private readonly baseHolo = new THREE.Color(0x37e08c);
  private readonly surgeHolo = new THREE.Color(0xff4526);

  constructor() {
    const geo = <T extends THREE.BufferGeometry>(g: T): T => { this.geos.push(g); return g; };
    const mat = <T extends THREE.Material>(m: T): T => { this.materials.push(m); return m; };

    // ── Materials — weathered field-installation palette ──────────────────
    //
    // Every structural material carries a baked detail surface (albedo ×
    // roughness × normal, plus cavity AO sampled from the normal map's alpha —
    // see RobotSurface). These were the last large flat-colour surfaces left in
    // the game: a "weathered pre-collapse installation" whose concrete had no
    // aggregate or form lines, whose steel had no rivets or welds, and whose
    // rust was simply a brown material. From a few metres away the whole spire
    // read as untextured blocks, which undercut the one landmark the fiction
    // leans on hardest.
    //
    // The maps are session-shared and tiled (see the `repeat` note in
    // RobotSurface) — a 12 m pad needs several tiles across it, not one
    // stretched crack. Costs no new textures beyond the five bakes, and the
    // loader already renders one quad per relay material, so every program
    // this creates is compiled before the first playable frame.
    this.concrete = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0x93938d, roughness: 0.96, metalness: 0.02, flatShading: true,
    }), 'concrete', false));
    this.concreteDark = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0x5f625f, roughness: 0.98, metalness: 0.02, flatShading: true,
    }), 'concrete', false));
    this.steel = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0x66707a, roughness: 0.42, metalness: 0.88, flatShading: true,
    }), 'steelPanel', false));
    this.steelDark = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0x2f353b, roughness: 0.6, metalness: 0.75, flatShading: true,
    }), 'steelPanel', false));
    this.dishSkin = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0xc4ccd2, roughness: 0.48, metalness: 0.6, flatShading: true,
      side: THREE.DoubleSide,
    }), 'dish', false));
    // Hazard paint keeps its emissive (it is the one part meant to catch the
    // eye at night), so this is the ONE relay material that takes an
    // emissiveMap — the stripes have to survive in the emissive term too or
    // they wash out into a flat orange glow after dusk.
    this.hazard = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0xb54a1e, emissive: 0x5a1404, emissiveIntensity: 0.7,
      roughness: 0.62, metalness: 0.25, flatShading: true,
    }), 'hazard', true));
    this.rust = mat(applyRobotSurface(new THREE.MeshStandardMaterial({
      color: 0x6e4326, roughness: 0.92, metalness: 0.3, flatShading: true,
    }), 'rust', false));
    this.beaconMat = mat(new THREE.MeshBasicMaterial({ color: 0xff2318, toneMapped: false }));
    this.warnLightMat = mat(new THREE.MeshBasicMaterial({ color: 0xff8c2a, toneMapped: false }));
    this.holoMat = mat(new THREE.MeshBasicMaterial({
      color: 0x37e08c, transparent: true, opacity: 0.3, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
    }));
    this.fieldMat = mat(new THREE.MeshBasicMaterial({
      color: 0x49e06a, transparent: true, opacity: 0.045, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
      fog: false,
    }));
    this.scorchMat = mat(new THREE.MeshBasicMaterial({
      color: 0x0a0d0a, transparent: true, opacity: 0.5, depthWrite: false,
    }));

    // ── Primitive library (freed after baking) ────────────────────────────
    const box = (w: number, h: number, d: number) => geo(new THREE.BoxGeometry(w, h, d));
    const cyl = (rt: number, rb: number, h: number, s: number) => geo(new THREE.CylinderGeometry(rt, rb, h, s));

    const MAST_TOP = 17.5;

    // ── CONCRETE: buried plinth, stepped pad, dish counterweight footing ──
    const concreteParts: Part[] = [
      { geo: box(11, 6, 11), pos: [0, -2.2, 0] },          // deep foundation (0.8m proud)
      { geo: box(7.6, 1.0, 7.6), pos: [0, 1.2, 0] },       // main pad step
      { geo: box(5.2, 0.9, 5.2), pos: [0, 2.0, 0] },       // upper pad step
      { geo: box(2.4, 0.7, 2.4), pos: [4.6, 0.9, 3.4] },   // transformer footing
      { geo: box(2.0, 0.6, 3.2), pos: [-4.4, 0.85, -2.6] }, // crate footing
    ];
    this.staticConcrete = geo(bake(concreteParts));

    // Weather-darkened concrete: cracked kerbs + pad stains read as age.
    this.staticConcreteDark = geo(bake([
      { geo: box(7.8, 0.16, 1.1), pos: [0, 1.74, 3.3] },
      { geo: box(1.1, 0.16, 7.8), pos: [-3.3, 1.74, 0] },
      { geo: box(2.2, 0.1, 1.6), pos: [1.9, 2.5, 1.4] },
    ]));

    // ── STEEL: lattice mast (4 legs + braces), platform frame, guy anchors,
    //    antenna whips, dish yoke, transformer fins, floodlight arms ────────
    const steelParts: Part[] = [];
    // Four legs, leaning inward.
    const legLean = 0.055;
    ([[-1, -1], [1, -1], [-1, 1], [1, 1]] as const).forEach(([sx, sz]) => {
      steelParts.push({
        geo: cyl(0.13, 0.2, MAST_TOP, 6),
        pos: [sx * 1.5, MAST_TOP / 2 + 2.2, sz * 1.5],
        rot: [sz * legLean, 0, -sx * legLean],
      });
    });
    // Horizontal brace rings every ~3m, shrinking with the taper.
    for (let lvl = 0; lvl < 5; lvl++) {
      const y = 4.4 + lvl * 3.0;
      const half = 1.5 * (1 - lvl * 0.1);
      for (const side of [-1, 1] as const) {
        steelParts.push({ geo: box(half * 2 + 0.2, 0.11, 0.11), pos: [0, y, side * half] });
        steelParts.push({ geo: box(0.11, 0.11, half * 2 + 0.2), pos: [side * half, y, 0] });
      }
      // X-brace diagonals on two faces for lattice believability.
      steelParts.push({ geo: box(0.08, half * 2.6, 0.08), pos: [0, y + 1.4, half], rot: [0, 0, 0.62] });
      steelParts.push({ geo: box(0.08, half * 2.6, 0.08), pos: [0, y + 1.4, -half], rot: [0, 0, -0.62] });
    }
    // Head platform frame + railing posts.
    steelParts.push({ geo: box(3.6, 0.22, 3.6), pos: [0, MAST_TOP + 2.15, 0] });
    ([[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const).forEach(([px, pz]) => {
      steelParts.push({ geo: cyl(0.045, 0.045, 0.9, 5), pos: [px, MAST_TOP + 2.7, pz] });
    });
    // Antenna whips (3, staggered heights) on the platform corner.
    steelParts.push({ geo: cyl(0.03, 0.05, 3.4, 5), pos: [1.3, MAST_TOP + 4.0, 1.3] });
    steelParts.push({ geo: cyl(0.03, 0.05, 2.6, 5), pos: [-1.3, MAST_TOP + 3.6, 1.1] });
    steelParts.push({ geo: cyl(0.03, 0.05, 4.4, 5), pos: [0, MAST_TOP + 4.6, -1.2] });
    // Guy-wire anchors (angled stubs at the pad corners).
    ([[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]] as const).forEach(([px, pz]) => {
      steelParts.push({ geo: box(0.5, 0.4, 0.5), pos: [px, 1.85, pz] });
    });
    // Transformer cooling fins.
    for (let fi = 0; fi < 4; fi++) {
      steelParts.push({ geo: box(0.06, 1.0, 1.6), pos: [3.95 + fi * 0.28, 2.1, 3.4] });
    }
    // Dead floodlight arms off the mid-mast.
    steelParts.push({ geo: box(1.6, 0.09, 0.09), pos: [1.9, 11.5, 0], rot: [0, 0, 0.22] });
    steelParts.push({ geo: box(1.6, 0.09, 0.09), pos: [-1.9, 9.6, 0], rot: [0, 0, -0.22] });
    this.staticSteel = geo(bake(steelParts));

    // ── DARK STEEL: cabin, cable trays, sagging ground cables, floodlight
    //    housings, crate lids, dish counterweight ──────────────────────────
    const steelDarkParts: Part[] = [
      { geo: box(2.0, 1.5, 2.0), pos: [0, MAST_TOP + 3.0, 0] },       // equipment cabin
      { geo: box(0.34, 0.34, 12.8), pos: [0.9, 8.6, 0], rot: [0.06, 0, 0] }, // vertical cable tray
      { geo: box(2.1, 0.8, 0.7), pos: [2.35, 11.55, 0], rot: [0, 0, 0.22] }, // floodlight housing A
      { geo: box(2.1, 0.8, 0.7), pos: [-2.35, 9.65, 0], rot: [0, 0, -0.22] }, // floodlight housing B
      { geo: box(1.9, 1.4, 3.0), pos: [-4.4, 1.85, -2.6] },           // equipment crate
      { geo: box(1.7, 0.2, 2.8), pos: [-4.4, 2.62, -2.6] },           // crate lid
      { geo: box(1.6, 1.6, 1.6), pos: [4.6, 2.05, 3.4] },             // transformer body
    ];
    // Sagging cable runs snaking off the pad in three directions.
    const cableRuns: Array<[number, number, number, number]> = [
      [3.2, 0.3, -3.6, 0.7], [-3.6, 0.28, 3.0, -0.5], [0.6, 0.26, 4.4, 0.15],
    ];
    cableRuns.forEach(([cx, cy, cz, ry]) => {
      for (let s = 0; s < 3; s++) {
        steelDarkParts.push({
          geo: cyl(0.07, 0.07, 2.4, 5),
          pos: [cx + Math.cos(ry) * s * 2.1, cy - s * 0.04, cz + Math.sin(ry) * s * 2.1],
          rot: [Math.PI / 2 + (s % 2 ? 0.06 : -0.05), ry, 0],
        });
      }
    });
    this.staticSteelDark = geo(bake(steelDarkParts));

    // ── HAZARD: chevron kerb stripes + cabin warn panel + dish stripe ─────
    this.staticHazard = geo(bake([
      { geo: box(7.7, 0.24, 0.5), pos: [0, 1.78, -3.3] },
      { geo: box(0.5, 0.24, 7.7), pos: [3.3, 1.78, 0] },
      { geo: box(2.06, 0.36, 2.06), pos: [0, MAST_TOP + 2.5, 0] },   // cabin warn band
      { geo: box(0.9, 1.1, 0.08), pos: [-4.4, 1.9, -1.05] },         // crate warn sign
    ]));

    // ── RUST: streaks + aged patches on legs and transformer ──────────────
    this.staticRust = geo(bake([
      { geo: box(0.24, 2.8, 0.24), pos: [1.5, 4.4, 1.5] },
      { geo: box(0.2, 2.0, 0.2), pos: [-1.52, 6.4, -1.5] },
      { geo: box(1.66, 0.5, 1.66), pos: [4.6, 1.35, 3.4] },
      { geo: box(0.9, 0.35, 3.04), pos: [-4.4, 1.35, -2.6] },
    ]));

    // ── BEACONS: mast-top aircraft light + antenna warn tips + cabin LEDs ─
    const beaconBall = geo(new THREE.SphereGeometry(0.3, 10, 8));
    const warnTip = geo(new THREE.SphereGeometry(0.09, 8, 6));
    this.staticBeacons = geo(bake([
      { geo: beaconBall, pos: [0, MAST_TOP + 6.6, 0] },
      { geo: warnTip, pos: [1.3, MAST_TOP + 5.75, 1.3] },
      { geo: warnTip, pos: [-1.3, MAST_TOP + 4.95, 1.1] },
      { geo: warnTip, pos: [0, MAST_TOP + 6.85, -1.2] },
      { geo: box(0.1, 0.1, 0.1), pos: [0.7, MAST_TOP + 2.62, 1.02] },
      { geo: box(0.1, 0.1, 0.1), pos: [0.3, MAST_TOP + 2.62, 1.02] },
    ]));
    // Rod under the aircraft beacon lives in steel already? Keep beacons pure.

    // ── DISH: big ribbed tracker (cone shell + radial ribs + rim ring),
    //    counterweight + yoke merged into it (all rides the pivot) ─────────
    const dishShell = geo(new THREE.ConeGeometry(3.4, 1.35, 22, 1, true));
    const dishRim = geo(new THREE.TorusGeometry(3.32, 0.07, 6, 26));
    const dishParts: Part[] = [
      { geo: dishShell, pos: [0, 1.1, 0] },
      { geo: dishRim, pos: [0, 1.74, 0], rot: [Math.PI / 2, 0, 0] },
    ];
    // 8 radial ribs across the back of the shell.
    for (let r = 0; r < 8; r++) {
      const a = (r / 8) * Math.PI * 2;
      dishParts.push({
        geo: box(0.09, 0.06, 3.1),
        pos: [Math.sin(a) * 1.6, 0.98, Math.cos(a) * 1.6],
        rot: [0.38, a, 0],
      });
    }
    // Yoke + counterweight.
    dishParts.push({ geo: box(0.5, 0.5, 1.6), pos: [0, 0.1, -0.6] });
    dishParts.push({ geo: box(0.8, 0.8, 0.9), pos: [0, -0.1, -1.55] });
    // Feed tripod struts.
    for (const s of [-1, 0, 1]) {
      dishParts.push({ geo: cyl(0.035, 0.035, 2.4, 5), pos: [s * 0.9, 2.4, 0.45 + Math.abs(s) * 0.1], rot: [0.5, 0, s * 0.42] });
    }
    this.dishGeo = geo(bake(dishParts));
    this.feedGeo = geo(new THREE.SphereGeometry(0.2, 10, 8));

    // Mid-mast secondary drum dish (microwave relay).
    this.subDishGeo = geo(bake([
      { geo: cyl(0.85, 0.85, 0.5, 14), rot: [Math.PI / 2, 0, 0] },
      { geo: box(0.3, 0.3, 0.7), pos: [0, 0, -0.5] },
    ]));

    // ── Holo rings / field wall / scorch ring ─────────────────────────────
    this.holoRingGeoA = geo(new THREE.TorusGeometry(2.7, 0.045, 6, 42));
    this.holoRingGeoB = geo(new THREE.TorusGeometry(2.0, 0.028, 6, 34));
    this.fieldWallGeo = geo(new THREE.CylinderGeometry(UPLINK_FIELD_RADIUS, UPLINK_FIELD_RADIUS, 8, 56, 1, true));
    this.scorchGeo = geo(new THREE.CircleGeometry(9.5, 26));
  }

  /** Build one relay spire at (x, z) and add it to the scene. */
  addSpire(scene: THREE.Scene, x: number, z: number): SpireParts {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh => {
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      group.add(mesh);
      return mesh;
    };

    add(this.staticConcrete, this.concrete);
    add(this.staticConcreteDark, this.concreteDark, false);
    add(this.staticSteel, this.steel);
    add(this.staticSteelDark, this.steelDark);
    add(this.staticHazard, this.hazard, false);
    add(this.staticRust, this.rust, false);
    add(this.staticBeacons, this.beaconMat, false);

    // Scorch ring under the pad — the ground the signal burned dead.
    const scorch = new THREE.Mesh(this.scorchGeo, this.scorchMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.06;
    group.add(scorch);

    // Dish pivot on the platform — sweeps in update().
    const MAST_TOP = 17.5;
    const dishPivot = new THREE.Group();
    dishPivot.position.y = MAST_TOP + 4.1;
    const dish = new THREE.Mesh(this.dishGeo, this.dishSkin);
    dish.rotation.x = -Math.PI * 0.30;
    dish.castShadow = true;
    dishPivot.add(dish);
    const feed = new THREE.Mesh(this.feedGeo, this.warnLightMat);
    feed.position.set(0, 2.6, 0.8);
    dishPivot.add(feed);
    group.add(dishPivot);

    // Mid-mast microwave drum, aimed off-axis.
    const subDish = new THREE.Mesh(this.subDishGeo, this.dishSkin);
    subDish.position.set(0.95, 10.4, 0.65);
    subDish.rotation.y = 0.9;
    subDish.castShadow = true;
    group.add(subDish);

    // Holographic status rings near the base.
    const holoRingA = new THREE.Mesh(this.holoRingGeoA, this.holoMat);
    holoRingA.rotation.x = Math.PI / 2;
    holoRingA.position.y = 2.9;
    group.add(holoRingA);
    const holoRingB = new THREE.Mesh(this.holoRingGeoB, this.holoMat);
    holoRingB.rotation.x = Math.PI / 2;
    holoRingB.position.y = 3.5;
    group.add(holoRingB);

    // Radiation-field boundary wall.
    const fieldWall = new THREE.Mesh(this.fieldWallGeo, this.fieldMat);
    fieldWall.position.y = 4;
    group.add(fieldWall);

    scene.add(group);

    const spire: SpireParts = {
      group, x, z, dishPivot, subDish, holoRingA, holoRingB, fieldWall,
      yOffset: 0, phase: Math.random() * Math.PI * 2,
    };
    this.spires.push(spire);
    return spire;
  }

  /** 0 outside every field → 1 at the nearest mast. */
  fieldFactorAt(x: number, z: number): number {
    let best = 0;
    const r = this.fieldRadius;
    for (let i = 0; i < this.spires.length; i++) {
      const s = this.spires[i];
      const dx = x - s.x, dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      const f = 1 - Math.sqrt(d2) / r;
      if (f > best) best = f;
    }
    return best;
  }

  /** The spire nearest (x, z) — EMP broadcasts originate from it. */
  nearestSpire(x: number, z: number): SpireParts | null {
    let best: SpireParts | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.spires.length; i++) {
      const s = this.spires[i];
      const d = (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /**
   * Per-frame animation. `groundOffsetAt` is the CPU replica of the terrain
   * vertex displacement — each spire eases onto the VISUAL ground so distant
   * relays never float or sink while the player-relative envelope shifts.
   */
  update(
    delta: number,
    timeSec: number,
    surge: number,
    groundOffsetAt?: (x: number, z: number) => number,
  ): void {
    // Shared material animation (one write serves the whole network).
    const rate = 1.4 + surge * 6.0;
    const pulse = 0.5 + Math.max(0, Math.sin(timeSec * Math.PI * rate)) * 0.5;
    this.beaconMat.color.copy(this.baseBeacon).lerp(this.surgeBeacon, surge)
      .multiplyScalar(0.45 + pulse * (0.8 + surge * 0.7));
    this.warnLightMat.color.setHex(0xff8c2a)
      .multiplyScalar(0.5 + Math.max(0, Math.sin(timeSec * Math.PI * 0.9 + 1.7)) * 0.7 + surge * 0.5);
    this.holoMat.color.copy(this.baseHolo).lerp(this.surgeHolo, surge);
    this.holoMat.opacity = 0.24 + Math.sin(timeSec * 2.0) * 0.07 + surge * 0.2;
    this.fieldMat.opacity = 0.035 + Math.sin(timeSec * 1.2) * 0.012 + surge * 0.03;

    for (let i = 0; i < this.spires.length; i++) {
      const s = this.spires[i];
      s.dishPivot.rotation.y += delta * (0.16 + surge * 1.3);
      s.subDish.rotation.y += delta * 0.05;
      s.holoRingA.rotation.z += delta * 0.45;
      s.holoRingB.rotation.z -= delta * 0.65;
      s.holoRingA.position.y = 2.9 + Math.sin(timeSec * 1.6 + s.phase) * 0.1;
      if (groundOffsetAt) {
        const target = groundOffsetAt(s.x, s.z);
        s.yOffset += (target - s.yOffset) * Math.min(1, delta * 3.5);
        s.group.position.y = s.yOffset;
      }
    }
  }

  dispose(): void {
    for (const s of this.spires) s.group.removeFromParent();
    this.spires.length = 0;
    this.geos.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  OVERDRIVE EMP SHOCKWAVE — the visible broadcast that opens a surge wave.
//  A glowing ring races outward from the nearest relay across the whole map;
//  when it crosses the player, App flashes/shakes the screen.
// ─────────────────────────────────────────────────────────────────────────────

const EMP_MAX_RADIUS = 320;
const EMP_SPEED = 140; // m/s → crosses the playfield in ~2.3s

export class EmpShockwave {
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private discMat: THREE.MeshBasicMaterial;
  private ringGeo: THREE.TorusGeometry;
  private discGeo: THREE.CircleGeometry;
  private life = 0;
  readonly origin: THREE.Vector3;
  /** Current front radius (m) — read by App for the player-crossing beat. */
  radius = 0;
  /** Set true by App once the player-crossing flash has fired. */
  crossedPlayer = false;

  constructor(scene: THREE.Scene, origin: THREE.Vector3, color = 0xff3524) {
    this.origin = origin.clone();
    // Unit-radius torus scaled outward each frame — one allocation per surge.
    this.ringGeo = new THREE.TorusGeometry(1, 0.035, 6, 64);
    this.ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.ring = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(origin.x, 1.4, origin.z);
    scene.add(this.ring);

    // Faint expanding ground wash behind the front.
    this.discGeo = new THREE.CircleGeometry(1, 40);
    this.discMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.12, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
    });
    this.disc = new THREE.Mesh(this.discGeo, this.discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.set(origin.x, 0.25, origin.z);
    scene.add(this.disc);
  }

  /** Advance the front. Returns false once fully faded (caller disposes). */
  update(delta: number): boolean {
    this.life += delta;
    this.radius = Math.min(EMP_MAX_RADIUS, this.life * EMP_SPEED);
    const t = this.radius / EMP_MAX_RADIUS;
    this.ring.scale.setScalar(Math.max(0.001, this.radius));
    this.disc.scale.setScalar(Math.max(0.001, this.radius * 0.96));
    this.ringMat.opacity = 0.9 * (1 - t * t);
    this.discMat.opacity = 0.12 * (1 - t);
    return t < 1;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.ring);
    scene.remove(this.disc);
    this.ringGeo.dispose();
    this.discGeo.dispose();
    this.ringMat.dispose();
    this.discMat.dispose();
  }
}
