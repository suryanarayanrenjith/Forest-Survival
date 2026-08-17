// ─────────────────────────────────────────────────────────────────────────────
// FIRE SYSTEM — the Pyro's 360° flame projector, the ground it sets alight, and
// the robots that keep burning after it sweeps past.
//
// The Pyro's signature used to be a single instantaneous nova: one pop and the
// power was over. A flamethrower is not an explosion — it is a SUSTAINED jet
// with a front that travels, a body of rolling fire that lags behind it, ground
// that catches and keeps burning, and targets that carry the fire away with
// them. This module owns all three stages:
//
//   1. THE JET  — a full ring of flame tongues thrown outward from the emitter,
//      driven every frame while the valve is open. The front expands as the
//      pressure builds, the tongues roll and flicker independently, embers are
//      thrown clear and arc back down, and one pooled light does the lighting.
//   2. THE GROUND — pooled patches of burning fuel left behind by the sweep.
//      They keep flaming for several seconds and damage whatever stands in them
//      (App owns the damage; this owns the fire).
//   3. THE TARGETS — a per-robot flame shell that clings to a burning chassis.
//
// PERFORMANCE / STUTTER RULES (see the project's warmup + light invariants)
//  • Every material here uses the SAME MeshBasic additive/DoubleSide/depthWrite-off
//    permutation the explosion family already links during warmup, so the fire
//    introduces no new shader program to compile mid-fight.
//  • No light is ever created or destroyed at runtime: the jet borrows one slot
//    from the caller-supplied pool (the explosion pool) and gives it straight back.
//  • Everything is pre-allocated and pooled — a burst allocates nothing.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import { getSoftSparkTexture } from './Effects';

export type LightAcquire = () => THREE.PointLight | null;
export type LightRelease = (light: THREE.PointLight | null) => void;

/** One patch of burning ground. App reads these to damage what stands in them. */
export interface FirePatch {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Seconds of burn left. <= 0 means the slot is free. */
  life: number;
  maxLife: number;
  /** Next allowed damage tick (ms). Owned by App; reset when the patch lights. */
  nextTickAt: number;
}

interface PatchRig {
  group: THREE.Group;
  disc: THREE.Mesh;
  discMat: THREE.MeshBasicMaterial;
  tongues: THREE.Mesh[];
  tongueMat: THREE.MeshBasicMaterial;
  seeds: number[];
}

/**
 * Bake a TEMPERATURE GRADIENT into a flame geometry as vertex colours.
 *
 * This is the single biggest thing separating fire from orange plastic. A real
 * flame is not one colour: it is white-hot where the fuel is still burning
 * cleanly, yellow just above that, orange as it cools, deep red at the edges,
 * and it does not end — it fades out into nothing. Tinting a whole cone one
 * flat orange gives you a cone; running the colour along the flame's length
 * gives you fire, and because the materials blend ADDITIVELY the dark tip
 * renders as transparent, so the hard geometric silhouette dissolves for free.
 *
 * Expects geometry that grows along its own +Y from 0 (the root, where the fuel
 * is burning) to 1 (the tip). Multiplies with the material's own `color`, so
 * per-frame tinting still works on top of it.
 */
function applyHeatGradient(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  // Stops sampled from a real flame's blackbody ramp, then hand-tuned so the
  // additive falloff lands where the eye expects the flame to end.
  const STOPS: [number, number, number, number][] = [
    [0.00, 1.00, 0.94, 0.72],  // white-hot root
    [0.22, 1.00, 0.74, 0.26],  // yellow
    [0.48, 1.00, 0.42, 0.09],  // orange
    [0.74, 0.78, 0.15, 0.02],  // deep red
    [1.00, 0.10, 0.01, 0.00],  // dissolves out
  ];
  for (let i = 0; i < n; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i), 0, 1);
    let s = 0;
    while (s < STOPS.length - 2 && t > STOPS[s + 1][0]) s++;
    const a = STOPS[s], b = STOPS[s + 1];
    const k = (t - a[0]) / Math.max(1e-5, b[0] - a[0]);
    colors[i * 3] = a[1] + (b[1] - a[1]) * k;
    colors[i * 3 + 1] = a[2] + (b[2] - a[2]) * k;
    colors[i * 3 + 2] = a[3] + (b[3] - a[3]) * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

const JET_TONGUES = 16;      // nozzles' worth of flame around the full circle
const JET_EMBERS = 110;
/** Metres of clear ground between the operator and the base of the flame ring. */
const JET_INNER_RADIUS = 0.95;
/** Ceiling on a ground fire's flame height, in metres. Kept below eye level so
 *  standing in your own (harmless) fuel never blinds the player. */
const PATCH_MAX_HEIGHT = 1.5;
const MAX_PATCHES = 12;
const PATCH_TONGUES = 5;

export class FireSystem {
  /** Live burning-ground patches (index-stable; `life <= 0` = free slot). */
  readonly patches: FirePatch[] = [];

  private scene: THREE.Scene;
  private acquireLight: LightAcquire | null;
  private releaseLight: LightRelease | null;

  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];

  // ── The jet ──
  private jet: THREE.Group;
  private jetTongues: THREE.Mesh[] = [];
  private jetSeeds: number[] = [];
  private jetCore: THREE.Mesh;
  private jetRing: THREE.Mesh;
  private jetTongueMat: THREE.MeshBasicMaterial;
  private jetCoreMat: THREE.MeshBasicMaterial;
  private jetRingMat: THREE.MeshBasicMaterial;
  private embers: THREE.Points;
  private emberMat: THREE.PointsMaterial;
  private emberGeo: THREE.BufferGeometry;
  private emberVel: Float32Array;
  private emberAge: Float32Array;
  private jetLight: THREE.PointLight | null = null;
  private jetOn = false;
  private jetPower = 0;        // eased 0..1 — how open the valve is
  private jetRadius = 0;       // current reach in metres
  private jetSpin = 0;

  // ── Ground patches ──
  private patchRigs: PatchRig[] = [];

  // ── Per-robot burn shells ──
  private burnShellGeo: THREE.ConeGeometry;
  private burnShellMat: THREE.MeshBasicMaterial;
  private burnShells: THREE.Group[] = [];

  private t = 0;

  constructor(scene: THREE.Scene, acquireLight: LightAcquire | null = null, releaseLight: LightRelease | null = null) {
    this.scene = scene;
    this.acquireLight = acquireLight;
    this.releaseLight = releaseLight;

    const reg = <T extends THREE.BufferGeometry>(g: T): T => { this.geos.push(g); return g; };
    const regM = <T extends THREE.Material>(m: T): T => { this.mats.push(m); return m; };
    // The one additive permutation the whole system shares (matches the
    // explosion family's, so warmup has already linked its program).
    const fireMat = (color: number, opacity: number) => regM(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    // Same permutation plus USE_COLOR, for the geometries carrying the baked
    // heat gradient. Both variants are rendered by prewarm(), so neither links
    // its program mid-fight.
    const gradientFireMat = (color: number, opacity: number) => regM(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));

    // ── JET ────────────────────────────────────────────────────────────────
    this.jet = new THREE.Group();
    this.jet.visible = false;
    this.jet.renderOrder = 992;
    scene.add(this.jet);

    // One tongue = a tapered sleeve running OUTWARD from the emitter, thin at
    // the nozzle and swelling toward the front where the fuel has had room to
    // burn. The geometry grows along its own +Y (so scale.y is its reach) and
    // each tongue hangs inside a YAW PIVOT — that keeps "which way it points"
    // and "how far it reaches / how much it lifts" on separate, non-fighting
    // axes instead of one ambiguous Euler.
    this.jetTongueMat = gradientFireMat(0xffffff, 0.9);
    const tongueGeo = reg(new THREE.CylinderGeometry(0.9, 0.16, 1, 9, 4, true));
    tongueGeo.translate(0, 0.5, 0);       // grow from the emitter outward
    applyHeatGradient(tongueGeo);
    for (let i = 0; i < JET_TONGUES; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / JET_TONGUES) * Math.PI * 2;
      const m = new THREE.Mesh(tongueGeo, this.jetTongueMat);
      m.rotation.x = Math.PI / 2;         // lay it flat, running out along +Z
      pivot.add(m);
      this.jet.add(pivot);
      this.jetTongues.push(m);
      this.jetSeeds.push(Math.random() * 100);
    }

    // Rolling body of fire at the emitter itself. Deliberately kept LOW and
    // SMALL: it sits at the player's feet, and an additive volume big enough to
    // swallow the camera would wash the whole screen orange from the inside.
    this.jetCoreMat = fireMat(0xffc04a, 0.85);
    this.jetCore = new THREE.Mesh(reg(new THREE.SphereGeometry(1, 14, 10)), this.jetCoreMat);
    this.jetCore.scale.set(0.9, 0.4, 0.9);
    this.jet.add(this.jetCore);

    // Leading edge of the burn, hugging the ground.
    this.jetRingMat = fireMat(0xffdc7a, 0.7);
    const ringGeo = reg(new THREE.RingGeometry(0.80, 1.0, 56));
    ringGeo.rotateX(-Math.PI / 2);
    this.jetRing = new THREE.Mesh(ringGeo, this.jetRingMat);
    this.jetRing.position.y = 0.08;
    this.jet.add(this.jetRing);

    // Embers thrown clear of the front, arcing back down under gravity.
    this.emberGeo = reg(new THREE.BufferGeometry());
    const epos = new Float32Array(JET_EMBERS * 3);
    const ecol = new Float32Array(JET_EMBERS * 3);
    this.emberVel = new Float32Array(JET_EMBERS * 3);
    this.emberAge = new Float32Array(JET_EMBERS);
    for (let i = 0; i < JET_EMBERS; i++) this.emberAge[i] = -1; // all dead
    this.emberGeo.setAttribute('position', new THREE.BufferAttribute(epos, 3));
    this.emberGeo.setAttribute('color', new THREE.BufferAttribute(ecol, 3));
    this.emberMat = regM(new THREE.PointsMaterial({
      size: 0.32, map: getSoftSparkTexture(), vertexColors: true, transparent: true,
      opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.embers = new THREE.Points(this.emberGeo, this.emberMat);
    this.embers.frustumCulled = false;
    this.jet.add(this.embers);

    // ── GROUND PATCHES ─────────────────────────────────────────────────────
    const patchDiscGeo = reg(new THREE.CircleGeometry(1, 24));
    patchDiscGeo.rotateX(-Math.PI / 2);
    const patchTongueGeo = reg(new THREE.ConeGeometry(0.34, 1, 8, 4, true));
    patchTongueGeo.translate(0, 0.5, 0);
    applyHeatGradient(patchTongueGeo);
    for (let i = 0; i < MAX_PATCHES; i++) {
      const group = new THREE.Group();
      group.visible = false;
      group.renderOrder = 989;
      const discMat = fireMat(0xff6a1e, 0.5);
      const disc = new THREE.Mesh(patchDiscGeo, discMat);
      disc.position.y = 0.05;
      group.add(disc);
      const tongueMat = gradientFireMat(0xffffff, 0.85);
      const tongues: THREE.Mesh[] = [];
      const seeds: number[] = [];
      for (let k = 0; k < PATCH_TONGUES; k++) {
        const m = new THREE.Mesh(patchTongueGeo, tongueMat);
        const a = (k / PATCH_TONGUES) * Math.PI * 2 + Math.random();
        const r = 0.15 + Math.random() * 0.55;
        m.userData.ax = Math.cos(a) * r;
        m.userData.az = Math.sin(a) * r;
        group.add(m);
        tongues.push(m);
        seeds.push(Math.random() * 100);
      }
      scene.add(group);
      this.patchRigs.push({ group, disc, discMat, tongues, tongueMat, seeds });
      this.patches.push({ x: 0, y: 0, z: 0, radius: 0, life: 0, maxLife: 1, nextTickAt: 0 });
    }

    // ── BURN SHELLS ────────────────────────────────────────────────────────
    // Shared geometry + material; each burning robot only wears a lightweight
    // wrapper of Mesh instances (the frost-shell pattern).
    this.burnShellGeo = reg(new THREE.ConeGeometry(0.30, 1.0, 8, 4, true));
    this.burnShellGeo.translate(0, 0.5, 0);
    applyHeatGradient(this.burnShellGeo);
    this.burnShellMat = gradientFireMat(0xffffff, 0.8);
  }

  // ── THE JET ───────────────────────────────────────────────────────────────

  /**
   * Open or close the valve. While open the caller re-supplies the emitter
   * position every frame (the projector is strapped to the player's arm, so the
   * fire goes where they go).
   */
  setJet(on: boolean) {
    if (on === this.jetOn) return;
    this.jetOn = on;
    if (on) {
      this.jetSpin = Math.random() * Math.PI * 2;
      if (!this.jetLight && this.acquireLight) {
        this.jetLight = this.acquireLight();
        if (this.jetLight) {
          this.jetLight.color.setHex(0xff7a24);
          this.jetLight.distance = 40;
        }
      }
    }
  }

  /** Where the emitter is this frame, and how far the front has travelled. */
  aimJet(x: number, y: number, z: number, radius: number) {
    this.jet.position.set(x, y, z);
    this.jetRadius = radius;
  }

  /** True while any flame is still visible (used to hold the jet's light). */
  get jetVisible(): boolean { return this.jetPower > 0.01; }

  // ── GROUND FIRE ───────────────────────────────────────────────────────────

  /**
   * Set a patch of ground alight. Reuses the shortest-lived slot when the pool
   * is full, so a long sweep keeps its most recent fire rather than dropping it.
   */
  ignite(x: number, y: number, z: number, radius: number, life: number): FirePatch {
    let slot = -1;
    let worst = Infinity;
    for (let i = 0; i < this.patches.length; i++) {
      if (this.patches[i].life <= 0) { slot = i; break; }
      if (this.patches[i].life < worst) { worst = this.patches[i].life; slot = i; }
    }
    const p = this.patches[slot];
    p.x = x; p.y = y; p.z = z;
    p.radius = radius;
    p.life = life;
    p.maxLife = life;
    p.nextTickAt = 0;
    const rig = this.patchRigs[slot];
    rig.group.position.set(x, y, z);
    rig.group.visible = true;
    return p;
  }

  /** How many patches are currently burning (debug / HUD readouts). */
  get burningPatchCount(): number {
    let n = 0;
    for (const p of this.patches) if (p.life > 0) n++;
    return n;
  }

  // ── BURNING ROBOTS ────────────────────────────────────────────────────────

  /**
   * Attach a flame shell to a robot. `scale` is the enemy's body scale so a
   * tank burns at tank size. Returns the wrapper so the caller can store it and
   * hand it back to `detachBurn` on death / recycle.
   */
  attachBurn(host: THREE.Object3D, scale = 1): THREE.Group {
    const g = new THREE.Group();
    g.userData.isBurnShell = true;
    g.userData.seed = Math.random() * 100;
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(this.burnShellGeo, this.burnShellMat);
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.6;
      const r = 0.16 + Math.random() * 0.30;
      m.position.set(Math.cos(a) * r * scale, 0.05 + Math.random() * 0.9 * scale, Math.sin(a) * r * scale);
      m.userData.seed = Math.random() * 100;
      m.userData.h = (0.55 + Math.random() * 0.6) * scale;
      g.add(m);
    }
    host.add(g);
    this.burnShells.push(g);
    return g;
  }

  detachBurn(shell: THREE.Group | undefined | null) {
    if (!shell) return;
    shell.removeFromParent();
    const i = this.burnShells.indexOf(shell);
    if (i !== -1) this.burnShells.splice(i, 1);
  }

  /** Drop every attached shell (wave end / teardown). Shared assets survive. */
  clearBurns() {
    for (const s of this.burnShells) s.removeFromParent();
    this.burnShells.length = 0;
  }

  // ── FRAME ─────────────────────────────────────────────────────────────────

  update(dt: number) {
    this.t += dt;

    // ── Jet ──
    const target = this.jetOn ? 1 : 0;
    this.jetPower += (target - this.jetPower) * Math.min(1, dt * (this.jetOn ? 13 : 5));
    if (!this.jetOn && this.jetPower < 0.012) this.jetPower = 0;
    const power = this.jetPower;
    this.jet.visible = power > 0.01;
    if (this.jet.visible) {
      this.jetSpin += dt * 5.6;           // the emitter head is spinning
      this.jet.rotation.y = this.jetSpin;
      const reach = Math.max(0.5, this.jetRadius);
      // The fire leaves an emitter held at arm's length, so the ring has a
      // genuine hole in the middle where the operator stands — which is also
      // what keeps a screen-filling additive volume off the camera.
      const inner = JET_INNER_RADIUS;
      for (let i = 0; i < this.jetTongues.length; i++) {
        const m = this.jetTongues[i];
        const s = this.jetSeeds[i];
        // Each tongue breathes on its own clock — a ring of identical flames
        // reads as a fan, a ring of independently-flickering ones reads as fire.
        const flick = 0.85 + Math.sin(this.t * (11 + (i % 5) * 2.3) + s) * 0.18
          + Math.sin(this.t * 31 + s * 3) * 0.08;
        const len = Math.max(0.3, reach - inner) * flick * (0.75 + power * 0.35);
        const w = (0.42 + power * 0.32) * (0.8 + flick * 0.35);
        m.scale.set(w, len, w);
        // The tongue lifts as it stretches — burning fuel rolls upward.
        m.rotation.x = Math.PI / 2 - 0.10 - flick * 0.16;
        m.position.y = 0.30 + flick * 0.22;
        m.position.z = inner;
      }
      const coreS = (0.75 + power * 0.30) * (0.92 + Math.sin(this.t * 24) * 0.08);
      this.jetCore.scale.set(coreS * 0.9, coreS * 0.4, coreS * 0.9);
      this.jetCoreMat.opacity = power * (0.6 + Math.sin(this.t * 27) * 0.16);
      this.jetTongueMat.opacity = power * (0.62 + Math.sin(this.t * 19) * 0.14);
      // The hue now comes from the geometry's baked heat gradient, so the
      // material is only a MULTIPLIER: near-white at full pressure, red-shifted
      // as the valve closes and the fuel stops burning clean.
      this.jetTongueMat.color.setRGB(1, 0.62 + power * 0.38, 0.42 + power * 0.58);
      const ringS = Math.max(0.6, reach);
      this.jetRing.scale.set(ringS, 1, ringS);
      this.jetRingMat.opacity = power * 0.55 * (0.7 + Math.sin(this.t * 15) * 0.3);
      this.updateEmbers(dt, power, reach);
      if (this.jetLight) {
        this.jetLight.position.set(this.jet.position.x, this.jet.position.y + 1.2, this.jet.position.z);
        // Firelight is never steady. Two detuned sines beating against each
        // other read as a living flame; one smooth ramp reads as a lamp being
        // dimmed. Same trick the panicked-reload tremor uses.
        const flicker = 0.82 + Math.sin(this.t * 21.3) * 0.11 + Math.sin(this.t * 37.7) * 0.07;
        this.jetLight.intensity = power * 78 * flicker;
        this.jetLight.distance = Math.max(22, reach * 3.4);
      }
    } else if (this.jetLight) {
      // Fully out — hand the light straight back to the pool.
      if (this.releaseLight) this.releaseLight(this.jetLight);
      else this.jetLight.intensity = 0;
      this.jetLight = null;
    }

    // ── Ground patches ──
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      const rig = this.patchRigs[i];
      if (p.life <= 0) {
        if (rig.group.visible) rig.group.visible = false;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) { p.life = 0; rig.group.visible = false; continue; }
      const k = p.life / p.maxLife;
      // Fires build fast, hold, then die back to embers.
      const strength = Math.min(1, (1 - k) < 0.06 ? (1 - k) / 0.06 : Math.min(1, k / 0.35));
      rig.discMat.opacity = strength * 0.42 * (0.75 + Math.sin(this.t * 9 + i) * 0.25);
      rig.disc.scale.set(p.radius, 1, p.radius);
      for (let m = 0; m < rig.tongues.length; m++) {
        const tm = rig.tongues[m];
        const s = rig.seeds[m];
        const flick = 0.6 + Math.sin(this.t * (7.5 + m * 1.7) + s) * 0.28 + Math.sin(this.t * 21 + s) * 0.12;
        const h = Math.min(PATCH_MAX_HEIGHT, p.radius * (0.35 + flick * 0.45) * strength);
        tm.scale.set(p.radius * 0.38, Math.max(0.05, h), p.radius * 0.38);
        tm.position.set(
          (tm.userData.ax as number) * p.radius,
          0.04,
          (tm.userData.az as number) * p.radius,
        );
        tm.rotation.z = Math.sin(this.t * 2.6 + s) * 0.16;
      }
      rig.tongueMat.opacity = strength * (0.55 + Math.sin(this.t * 13 + i) * 0.18);
      // Multiplier over the baked gradient: neutral while the fuel burns hot,
      // red-shifting as the patch dies back to a dull ember bed.
      rig.tongueMat.color.setRGB(1, 0.42 + strength * 0.58, 0.20 + strength * 0.80);
      rig.discMat.color.setRGB(1, 0.30 + strength * 0.28, 0.08 + strength * 0.14);
    }

    // ── Burn shells ──
    if (this.burnShells.length > 0) {
      this.burnShellMat.opacity = 0.5 + Math.sin(this.t * 17) * 0.16;
      // Multiplier over the baked gradient — a slow warm breathe, not a hue.
      this.burnShellMat.color.setRGB(1, 0.80 + Math.sin(this.t * 9) * 0.10, 0.62 + Math.sin(this.t * 13) * 0.10);
      for (const g of this.burnShells) {
        const gs = g.userData.seed as number;
        g.rotation.y += dt * 1.6;
        for (const c of g.children) {
          const s = c.userData.seed as number;
          const h = c.userData.h as number;
          const flick = 0.55 + Math.sin(this.t * (12 + (s % 5)) + s) * 0.30 + Math.sin(this.t * 29 + gs) * 0.12;
          c.scale.set(0.5 + flick * 0.35, h * (0.6 + flick * 0.8), 0.5 + flick * 0.35);
          // Flames on a moving body lean and wander rather than standing to
          // attention — a fixed cone on a walking robot reads as a party hat.
          c.rotation.z = Math.sin(this.t * 3.1 + s) * 0.22;
          c.rotation.x = Math.cos(this.t * 2.6 + s * 1.7) * 0.18;
        }
      }
    }
  }

  /**
   * Embers: continuously respawned at the front of the jet while it is open,
   * thrown outward and up, then arcing back down. Written straight into the
   * attribute buffers — no allocation per particle, per frame or per burst.
   */
  private updateEmbers(dt: number, power: number, reach: number) {
    const pos = this.emberGeo.getAttribute('position') as THREE.BufferAttribute;
    const col = this.emberGeo.getAttribute('color') as THREE.BufferAttribute;
    const pa = pos.array as Float32Array;
    const ca = col.array as Float32Array;
    // Spawn budget scales with how hard the jet is running.
    let budget = this.jetOn ? Math.ceil(power * 4) : 0;
    for (let i = 0; i < JET_EMBERS; i++) {
      const i3 = i * 3;
      if (this.emberAge[i] < 0) {
        if (budget <= 0) { pa[i3 + 1] = -9999; continue; }
        budget--;
        const a = Math.random() * Math.PI * 2;
        const r = reach * (0.3 + Math.random() * 0.75);
        pa[i3] = Math.cos(a) * r * 0.5;
        pa[i3 + 1] = 0.3 + Math.random() * 0.8;
        pa[i3 + 2] = Math.sin(a) * r * 0.5;
        const out = 5 + Math.random() * reach * 0.7;
        this.emberVel[i3] = Math.cos(a) * out;
        this.emberVel[i3 + 1] = 3.5 + Math.random() * 6;
        this.emberVel[i3 + 2] = Math.sin(a) * out;
        this.emberAge[i] = 0;
        const warm = Math.random();
        ca[i3] = 1;
        ca[i3 + 1] = 0.42 + warm * 0.45;
        ca[i3 + 2] = 0.10 + warm * 0.25;
        continue;
      }
      this.emberAge[i] += dt;
      if (this.emberAge[i] > 1.1) { this.emberAge[i] = -1; pa[i3 + 1] = -9999; continue; }
      pa[i3] += this.emberVel[i3] * dt;
      pa[i3 + 1] += this.emberVel[i3 + 1] * dt;
      pa[i3 + 2] += this.emberVel[i3 + 2] * dt;
      this.emberVel[i3 + 1] -= 13 * dt;
      this.emberVel[i3] *= 0.955;
      this.emberVel[i3 + 2] *= 0.955;
      // Cool as they fall.
      const k = 1 - this.emberAge[i] / 1.1;
      ca[i3 + 1] *= 0.985;
      ca[i3 + 2] *= 0.96;
      if (k < 0.2) { ca[i3] = k * 5; }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.emberMat.opacity = Math.max(power, 0.25);
  }

  // ── WARMUP / TEARDOWN ─────────────────────────────────────────────────────

  /**
   * Put one of everything on screen so the loader's compile pass links their
   * programs. Returns nothing to remove — the objects are the system's own and
   * are simply switched back off by `endPrewarm`.
   */
  prewarm(at: THREE.Vector3) {
    this.jet.position.copy(at);
    this.jet.visible = true;
    this.jetPower = 0.02;
    this.jetRadius = 2;
    for (const m of this.jetTongues) m.scale.set(0.2, 0.4, 0.2);
    this.jetTongueMat.opacity = 0.02;
    this.jetCoreMat.opacity = 0.02;
    this.jetRingMat.opacity = 0.02;
    this.emberMat.opacity = 0.02;
    const p = this.ignite(at.x, at.y, at.z, 1.2, 0.6);
    p.life = 0.6;
    this.patchRigs[this.patches.indexOf(p)].discMat.opacity = 0.02;
  }

  endPrewarm() {
    this.jet.visible = false;
    this.jetPower = 0;
    this.jetOn = false;
    for (const p of this.patches) p.life = 0;
    for (const r of this.patchRigs) r.group.visible = false;
  }

  dispose() {
    if (this.jetLight) {
      if (this.releaseLight) this.releaseLight(this.jetLight);
      else this.jetLight.intensity = 0;
      this.jetLight = null;
    }
    this.clearBurns();
    this.scene.remove(this.jet);
    for (const r of this.patchRigs) this.scene.remove(r.group);
    this.patchRigs.length = 0;
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.geos.length = 0;
    this.mats.length = 0;
    this.acquireLight = null;
    this.releaseLight = null;
  }
}
