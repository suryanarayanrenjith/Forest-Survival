import * as THREE from 'three';
import { RIG } from './CharacterModels';

/**
 * PlayerWounds — realistic HUMAN battle wounds for the player avatars.
 *
 * Where the robot enemies take metal DENTS + SCUFFS ([[BattleDamage]]), the
 * humans bleed: as a player is driven into critical health, blood-soaked gashes,
 * splatter, bruises and grazes seep through their gear — and they CLOSE UP again
 * the moment the player is healed (Medic field-triage, a health pickup, or a
 * world crate). The effect is built to shine in multiplayer, where every player
 * sees every other player visibly wounded and patched up in real time.
 *
 * Alignment trick: all 8 character classes are layered on ONE shared chamfered
 * humanoid rig (see CharacterModels.RIG), so a fixed set of anatomical anchor
 * points (chest, flank, gut, shoulders, arms, thighs, jaw, collar) lands
 * correctly on EVERY class. Each wound is parented to the matching skeletal joint
 * (shoulder / hip / head) so it rides the limb as it swings — never floating.
 *
 * Depth trick: each wound is a camera-independent quad oriented so its +Z faces
 * out along the body-surface normal and its +Y points up the body — so the blood
 * drips baked into the texture run DOWNWARD with gravity while the avatar stands.
 *
 * PERF (matches the project's GPU-bound invariants): ONE shared blood atlas + ONE
 * shared lit material → a single program (warmed in the loader). Four atlas-cell
 * geometries give per-wound variety with no extra program. Each avatar owns a
 * small FIXED set of wound meshes built once (no per-frame allocation/stamping);
 * a health-driven `severity` just reveals/closes them with an eased scale. Shared
 * assets are disposed once at scene teardown — never per player.
 */

// Below this HP fraction wounds begin to appear; at WOUND_FULL the avatar is
// covered. Exported so callers map health → severity identically everywhere.
export const WOUND_START_FRACTION = 0.35;
export const WOUND_FULL_FRACTION = 0.04;

/** Map a 0..1 health fraction to a 0..1 wound severity (0 = unhurt, 1 = covered). */
export function woundSeverityForHealth(hpFraction: number): number {
  const s = (WOUND_START_FRACTION - hpFraction) / (WOUND_START_FRACTION - WOUND_FULL_FRACTION);
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

const ATLAS_COLS = 2;
const ATLAS_ROWS = 2;

let _atlas: THREE.Texture | null = null;
let _mat: THREE.MeshStandardMaterial | null = null;
let _geos: THREE.PlaneGeometry[] | null = null;

// ── Deterministic per-player RNG so the SAME player looks identical on every
// client (wounds are seeded from a hash of the player id). ────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural blood/wound ATLAS — four motifs on one canvas, all sharing one
// material. Drips are drawn toward the BOTTOM of each cell so (after the standard
// CanvasTexture flipY) they map to the quad's -Y and run downward on the avatar.
// Pure injury palette: deep clot → fresh crimson → torn raw edge, plus a bruise
// and a dirty graze. No metal/spark tones — this is the human counterpart to the
// robot dents.
// ─────────────────────────────────────────────────────────────────────────────
function drips(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const ox = cx + (Math.random() - 0.5) * r * 1.1;
    const len = r * (0.5 + Math.random() * 1.1);
    const w = 1 + Math.random() * 2.2;
    const grad = ctx.createLinearGradient(ox, cy, ox, cy + len);
    grad.addColorStop(0, 'rgba(95,9,9,0.85)');
    grad.addColorStop(1, 'rgba(45,4,5,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, cy);
    ctx.bezierCurveTo(ox + (Math.random() - 0.5) * 4, cy + len * 0.5, ox + (Math.random() - 0.5) * 5, cy + len * 0.8, ox + (Math.random() - 0.5) * 3, cy + len);
    ctx.stroke();
    // Rounded bead at the end of the run.
    ctx.fillStyle = 'rgba(70,6,6,0.7)';
    ctx.beginPath();
    ctx.arc(ox + (Math.random() - 0.5) * 3, cy + len, w * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bloodPatch(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, darkness: number): void {
  for (let k = 0; k < 6; k++) {
    const ox = cx + (Math.random() - 0.5) * r * 0.7;
    const oy = cy + (Math.random() - 0.5) * r * 0.7;
    const rr = r * (0.4 + Math.random() * 0.55);
    const g = ctx.createRadialGradient(ox, oy, 1, ox, oy, rr);
    g.addColorStop(0, `rgba(110,12,10,${0.5 * darkness})`);
    g.addColorStop(0.6, `rgba(70,7,8,${0.32 * darkness})`);
    g.addColorStop(1, 'rgba(40,4,5,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ox, oy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getWoundAtlas(): THREE.Texture {
  if (_atlas) return _atlas;
  const cell = 128;
  const size = cell * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    _atlas = new THREE.DataTexture(new Uint8Array([90, 10, 10, 170]), 1, 1, THREE.RGBAFormat);
    _atlas.needsUpdate = true;
    return _atlas;
  }
  const center = (col: number, row: number) => ({ cx: col * cell + cell / 2, cy: row * cell + cell / 2 });

  // ── Cell 0 (0,0): deep LACERATION — a clotted slit with torn fresh edges. ──
  {
    const { cx, cy } = center(0, 0);
    bloodPatch(ctx, cx, cy - 6, 46, 1.0);
    // The gash: dark clot core.
    ctx.save();
    ctx.translate(cx, cy - 8);
    ctx.rotate((Math.random() - 0.5) * 0.6);
    ctx.fillStyle = 'rgba(28,3,4,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 30, 0, 0, Math.PI * 2);
    ctx.fill();
    // Raw bright edges either side of the slit.
    ctx.strokeStyle = 'rgba(165,28,22,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-6, -28); ctx.bezierCurveTo(-10, -10, -10, 10, -5, 28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -28); ctx.bezierCurveTo(10, -10, 10, 10, 5, 28); ctx.stroke();
    ctx.restore();
    drips(ctx, cx, cy + 18, 30, 4);
  }

  // ── Cell 1 (1,0): SPLATTER — a crimson spray of impact droplets. ──────────
  {
    const { cx, cy } = center(1, 0);
    bloodPatch(ctx, cx, cy, 30, 0.8);
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.pow(Math.random(), 0.6) * 52;
      const px = cx + Math.cos(a) * d;
      const py = cy + Math.sin(a) * d * 0.92;
      const rr = 1 + Math.random() * 5 * (1 - d / 64);
      ctx.fillStyle = `rgba(${120 + Math.random() * 50 | 0},${10 + Math.random() * 12 | 0},10,${0.55 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(px, py, rr, rr * (0.7 + Math.random() * 0.6), a, 0, Math.PI * 2);
      ctx.fill();
    }
    drips(ctx, cx, cy + 10, 24, 3);
  }

  // ── Cell 2 (0,1): BRUISE / contusion — mottled purple-maroon, soft, dry. ──
  {
    const { cx, cy } = center(0, 1);
    const tints = ['rgba(74,26,58,', 'rgba(96,30,46,', 'rgba(50,22,66,', 'rgba(60,18,30,'];
    for (let k = 0; k < 10; k++) {
      const ox = cx + (Math.random() - 0.5) * 56;
      const oy = cy + (Math.random() - 0.5) * 56;
      const rr = 14 + Math.random() * 26;
      const g = ctx.createRadialGradient(ox, oy, 1, ox, oy, rr);
      const t = tints[(Math.random() * tints.length) | 0];
      g.addColorStop(0, `${t}${0.34 + Math.random() * 0.18})`);
      g.addColorStop(1, `${t}0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ox, oy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    // A darker swollen core.
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
    g.addColorStop(0, 'rgba(38,12,40,0.45)');
    g.addColorStop(1, 'rgba(38,12,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
  }

  // ── Cell 3 (1,1): GRAZE / abrasion — raw scraped patch + dirt + blood beads. ─
  {
    const { cx, cy } = center(1, 1);
    // Raw scraped skin base.
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
    g.addColorStop(0, 'rgba(150,40,30,0.5)');
    g.addColorStop(0.7, 'rgba(95,20,18,0.3)');
    g.addColorStop(1, 'rgba(60,12,12,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 48, 0, Math.PI * 2); ctx.fill();
    // Scrape striations.
    ctx.save();
    ctx.lineCap = 'round';
    const ga = -0.5 + Math.random() * 0.5;
    for (let k = 0; k < 8; k++) {
      const off = (Math.random() - 0.5) * 60;
      const px = cx + Math.cos(ga + Math.PI / 2) * off;
      const py = cy + Math.sin(ga + Math.PI / 2) * off;
      const l = 16 + Math.random() * 26;
      ctx.strokeStyle = `rgba(${100 + Math.random() * 60 | 0},25,20,${0.4 + Math.random() * 0.35})`;
      ctx.lineWidth = 0.8 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.moveTo(px - Math.cos(ga) * l, py - Math.sin(ga) * l);
      ctx.lineTo(px + Math.cos(ga) * l, py + Math.sin(ga) * l);
      ctx.stroke();
    }
    ctx.restore();
    // Dirt flecks + blood beads.
    for (let k = 0; k < 12; k++) {
      const px = cx + (Math.random() - 0.5) * 70;
      const py = cy + (Math.random() - 0.5) * 70;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(45,33,22,0.6)' : 'rgba(120,14,12,0.7)';
      ctx.beginPath(); ctx.arc(px, py, 0.8 + Math.random() * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    drips(ctx, cx, cy + 16, 24, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  _atlas = tex;
  return tex;
}

function getWoundMaterial(): THREE.MeshStandardMaterial {
  if (_mat) return _mat;
  _mat = new THREE.MeshStandardMaterial({
    map: getWoundAtlas(),
    transparent: true,
    depthWrite: false,
    depthTest: true,
    // Lit (catches the same directional/ambient light as the body) so blood
    // shades realistically instead of reading as a flat sticker.
    roughness: 0.62,
    metalness: 0.0,
    // Lift off the gear so it never z-fights the chamfered plating.
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    side: THREE.FrontSide,
    fog: true,
  });
  return _mat;
}

function getWoundGeos(): THREE.PlaneGeometry[] {
  if (_geos) return _geos;
  _geos = [];
  for (let row = 0; row < ATLAS_ROWS; row++) {
    for (let col = 0; col < ATLAS_COLS; col++) {
      const g = new THREE.PlaneGeometry(1, 1);
      const u0 = col / ATLAS_COLS;
      const u1 = (col + 1) / ATLAS_COLS;
      const v0 = 1 - (row + 1) / ATLAS_ROWS;
      const v1 = 1 - row / ATLAS_ROWS;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
      uv.needsUpdate = true;
      _geos.push(g);
    }
  }
  return _geos;
}

/** Render one throwaway wound quad during the loader so the lit blood material's
 * program links there, not on the first critically-wounded player mid-fight. */
export function prewarmPlayerWounds(scene: THREE.Scene, at: THREE.Vector3): THREE.Mesh {
  const m = new THREE.Mesh(getWoundGeos()[0], getWoundMaterial());
  m.position.copy(at);
  scene.add(m);
  return m;
}

/** Free the shared blood assets (scene teardown only — never per player). */
export function disposePlayerWoundAssets(): void {
  if (_geos) { for (const g of _geos) g.dispose(); _geos = null; }
  if (_mat) { _mat.dispose(); _mat = null; }
  if (_atlas) { _atlas.dispose(); _atlas = null; }
}

export interface WoundParents {
  root: THREE.Object3D;          // torso / flank / gut / collar (rigid w.r.t. body)
  leftShoulder: THREE.Object3D;  // left arm wounds ride the swing
  rightShoulder: THREE.Object3D;
  leftHip: THREE.Object3D;       // thigh wounds ride the stride
  rightHip: THREE.Object3D;
  headJoint: THREE.Object3D;     // jaw wound rides the head
}

type ParentKey = keyof WoundParents;

interface Anchor {
  parent: ParentKey;
  pos: [number, number, number];    // PARENT-LOCAL, model-native units (pre body-scale)
  normal: [number, number, number]; // outward surface normal, parent-local
  size: number;                     // wound diameter in native units
  threshold: number;                // severity (0..1) at which this wound appears
}

// Anatomical anchor set, derived from the shared RIG so it stays aligned if the
// rig is retuned. Thresholds spread low→high so the avatar accrues wounds as it
// nears death (chest/arms first, flanks/back/jaw last).
const TF = RIG.torsoD / 2;     // torso front z
const SF = RIG.upperArmD / 2;  // arm front z
const HF = RIG.thighD / 2;     // thigh front z
const FACEZ = RIG.headD / 2;   // head front z
const ANCHORS: Anchor[] = [
  { parent: 'root', pos: [-0.42, 2.78, TF], normal: [-0.18, 0.05, 1], size: 0.66, threshold: 0.10 },
  { parent: 'rightShoulder', pos: [0.16, -0.40, SF], normal: [0.55, 0, 1], size: 0.5, threshold: 0.20 },
  { parent: 'root', pos: [0.46, 2.6, TF], normal: [0.22, 0, 1], size: 0.62, threshold: 0.30 },
  { parent: 'leftHip', pos: [-0.04, -0.44, HF], normal: [-0.1, 0, 1], size: 0.56, threshold: 0.38 },
  { parent: 'leftShoulder', pos: [-0.16, -0.46, SF], normal: [-0.55, 0, 1], size: 0.48, threshold: 0.46 },
  { parent: 'root', pos: [0.12, 3.12, TF - 0.06], normal: [0, 0.25, 1], size: 0.44, threshold: 0.52 },
  { parent: 'root', pos: [0.2, 1.96, TF], normal: [0.12, -0.12, 1], size: 0.6, threshold: 0.58 },
  { parent: 'rightHip', pos: [0.08, -0.52, HF], normal: [0.16, 0, 1], size: 0.54, threshold: 0.66 },
  { parent: 'root', pos: [-RIG.torsoW / 2, 2.34, 0.12], normal: [-1, 0, 0.22], size: 0.58, threshold: 0.74 },
  { parent: 'headJoint', pos: [0.28, 0.28, FACEZ], normal: [0.28, -0.1, 1], size: 0.4, threshold: 0.80 },
  { parent: 'root', pos: [RIG.torsoW / 2, 2.5, -0.04], normal: [1, 0, -0.12], size: 0.56, threshold: 0.86 },
  { parent: 'root', pos: [-0.22, 2.7, -TF], normal: [0, 0.05, -1], size: 0.6, threshold: 0.92 },
];

interface Wound {
  mesh: THREE.Mesh;
  threshold: number;
  baseSize: number;
  cur: number; // eased 0..1 reveal
}

export class PlayerWounds {
  private wounds: Wound[] = [];

  // Scratch reused at BUILD time only (orientation maths) — no per-frame alloc.
  private static readonly _n = new THREE.Vector3();
  private static readonly _up = new THREE.Vector3();
  private static readonly _x = new THREE.Vector3();
  private static readonly _y = new THREE.Vector3();
  private static readonly _basis = new THREE.Matrix4();
  private static readonly _q = new THREE.Quaternion();
  private static readonly _roll = new THREE.Quaternion();
  private static readonly _Z = new THREE.Vector3(0, 0, 1);
  private static readonly _WUP = new THREE.Vector3(0, 1, 0);
  private static readonly _WFWD = new THREE.Vector3(0, 0, 1);

  constructor(parents: WoundParents, opts: { seed?: number } = {}) {
    const rng = mulberry32(opts.seed ?? ((Math.random() * 0xffffffff) >>> 0));
    const geos = getWoundGeos();
    const mat = getWoundMaterial();

    for (const a of ANCHORS) {
      const parent = parents[a.parent];
      if (!parent) continue;
      const mesh = new THREE.Mesh(geos[(rng() * geos.length) | 0], mat);
      mesh.userData.isPlayerWound = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 5;
      mesh.frustumCulled = false; // tiny, attached to a moving body — skip the test

      // Position (+ small seeded jitter) nudged off the surface along the normal.
      PlayerWounds._n.set(a.normal[0], a.normal[1], a.normal[2]).normalize();
      const jx = (rng() - 0.5) * 0.08, jy = (rng() - 0.5) * 0.08;
      mesh.position.set(a.pos[0] + jx, a.pos[1] + jy, a.pos[2]).addScaledVector(PlayerWounds._n, 0.04);

      // Orient: +Z out along the body normal, +Y up the body (so drips fall),
      // plus a small seeded roll so no two wounds look stamped from a template.
      PlayerWounds._up.copy(PlayerWounds._WUP);
      if (Math.abs(PlayerWounds._up.dot(PlayerWounds._n)) > 0.97) PlayerWounds._up.copy(PlayerWounds._WFWD);
      PlayerWounds._x.crossVectors(PlayerWounds._up, PlayerWounds._n).normalize();
      PlayerWounds._y.crossVectors(PlayerWounds._n, PlayerWounds._x).normalize();
      PlayerWounds._basis.makeBasis(PlayerWounds._x, PlayerWounds._y, PlayerWounds._n);
      PlayerWounds._q.setFromRotationMatrix(PlayerWounds._basis);
      // Only a hair of roll: the wound must sit FLAT on the body and square to
      // it, so the baked blood drips run essentially straight DOWN with gravity
      // rather than diagonally. (Was ±0.35 rad, which tilted the whole wound.)
      PlayerWounds._roll.setFromAxisAngle(PlayerWounds._Z, (rng() - 0.5) * 0.16);
      mesh.quaternion.copy(PlayerWounds._q).multiply(PlayerWounds._roll);

      const baseSize = a.size * (0.82 + rng() * 0.4);
      mesh.scale.setScalar(0.0001);
      mesh.visible = false;
      parent.add(mesh);
      this.wounds.push({ mesh, threshold: a.threshold, baseSize, cur: 0 });
    }
  }

  /**
   * Drive the wounds from a 0..1 `severity` (use `woundSeverityForHealth`). Each
   * wound eases open when severity passes its threshold and eases CLOSED again as
   * the player heals — so a Medic patch / pickup / crate visibly seals them up.
   */
  update(severity: number, delta: number): void {
    if (delta <= 0) delta = 1 / 60;
    const k = Math.min(1, delta * 9);
    for (const w of this.wounds) {
      const target = severity >= w.threshold ? 1 : 0;
      w.cur += (target - w.cur) * k;
      if (target === 0 && w.cur < 0.02) {
        if (w.mesh.visible) w.mesh.visible = false;
        continue;
      }
      if (!w.mesh.visible) w.mesh.visible = true;
      w.mesh.scale.setScalar(Math.max(0.0001, w.baseSize * w.cur));
    }
  }

  /** Detach every wound from the body. Shared geos/material are NOT freed here —
   * they persist for the session and are released by disposePlayerWoundAssets. */
  dispose(): void {
    for (const w of this.wounds) w.mesh.removeFromParent();
    this.wounds.length = 0;
  }
}
