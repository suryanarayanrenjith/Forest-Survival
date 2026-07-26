/**
 * CharacterModels
 * ===============
 * Chamfered-block humanoid + 8 class builders. Each class layers a top
 * cap, chest emblem, helmet/mask, and accessories on top of a shared
 * rig so silhouettes read distinctly at distance while staying cheap.
 *
 * Geometry style: low-poly with bevels (octagonal extrudes for cubes).
 * Materials use flat shading + low metalness for the stylized voxel-
 * with-bevels look.
 *
 * Returned bodies expose joint groups (leftShoulder, rightShoulder,
 * leftHip, rightHip, headJoint, leftHand, rightHand) that the
 * RemotePlayerManager rotates each frame to drive walk / idle / death
 * animation.
 */
import * as THREE from 'three';

export type ClassId =
  | 'ranger' | 'scout' | 'heavy' | 'operative'
  | 'pyro'   | 'medic' | 'engineer' | 'phantom';

export const CLASS_IDS: ClassId[] = [
  'ranger', 'scout', 'heavy', 'operative',
  'pyro',   'medic', 'engineer', 'phantom',
];

export interface Palette {
  base: THREE.Color;
  shoulder: THREE.Color;
  accent: THREE.Color;
  dark: THREE.Color;
  pants: THREE.Color;
  neck: THREE.Color;
  skin: THREE.Color;
  head: THREE.Color;
  hand: THREE.Color;
  visor: THREE.Color;
  belt: THREE.Color;
  boot: THREE.Color;
  buckle: THREE.Color;
}

export interface HumanoidBody {
  root: THREE.Group;
  materials: THREE.Material[];
  palette: Palette;
  torso: THREE.Mesh;
  belt: THREE.Mesh;
  buckle: THREE.Mesh;
  emblem: THREE.Mesh | THREE.Object3D;
  headJoint: THREE.Group;
  defaultFace: {
    head: THREE.Mesh;
    eyeL: THREE.Mesh;
    eyeR: THREE.Mesh;
    pupilL: THREE.Mesh;
    pupilR: THREE.Mesh;
    mouth: THREE.Mesh;
  };
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftHand: THREE.Mesh;
  rightHand: THREE.Mesh;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
}

interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: THREE.Color | number;
  emissiveI?: number;
}

export function mat(
  color: THREE.Color | number,
  opts: MatOpts = {},
  store?: THREE.Material[],
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: color instanceof THREE.Color ? color.clone() : new THREE.Color(color),
    roughness: opts.rough ?? 0.78,
    metalness: opts.metal ?? 0.0,
    emissive: opts.emissive
      ? (opts.emissive instanceof THREE.Color ? opts.emissive.clone() : new THREE.Color(opts.emissive))
      : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveI ?? 0,
    flatShading: true,
  });
  if (store) store.push(m);
  return m;
}

/**
 * Chamfered box — ExtrudeGeometry with bevels for the low-poly look.
 * Cross-section is an octagon (cut corners), extruded vertically with
 * beveled top/bottom too. Use for any body part where you want the
 * silhouette to read as "cubic but with cut edges".
 */
export function chamfer(
  w: number, h: number, d: number,
  material: THREE.Material,
  bevel: number | null = null,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const b = bevel ?? Math.min(w, h, d) * 0.12;
  const innerW = Math.max(0.02, w - 2 * b);
  const innerD = Math.max(0.02, d - 2 * b);
  const cornerCut = Math.min(b, innerW / 2 - 0.01, innerD / 2 - 0.01);
  const hw = innerW / 2, hd = innerD / 2;

  const s = new THREE.Shape();
  s.moveTo(-hw + cornerCut, -hd);
  s.lineTo(hw - cornerCut,  -hd);
  s.lineTo(hw,              -hd + cornerCut);
  s.lineTo(hw,              hd - cornerCut);
  s.lineTo(hw - cornerCut,  hd);
  s.lineTo(-hw + cornerCut, hd);
  s.lineTo(-hw,             hd - cornerCut);
  s.lineTo(-hw,             -hd + cornerCut);
  s.closePath();

  const innerH = Math.max(0.01, h - 2 * b);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: innerH,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: b,
    bevelThickness: b,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(
    -(bb.min.x + bb.max.x) / 2,
    -(bb.min.y + bb.max.y) / 2,
    -(bb.min.z + bb.max.z) / 2,
  );

  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

export function box(
  w: number, h: number, d: number,
  material: THREE.Material,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

export function group(name?: string): THREE.Group {
  const g = new THREE.Group();
  if (name) g.name = name;
  return g;
}

interface Rig {
  bootW: number; bootH: number; bootD: number;
  thighW: number; thighH: number; thighD: number;
  beltH: number;
  torsoW: number; torsoH: number; torsoD: number;
  padW: number; padH: number; padD: number;
  upperArmW: number; upperArmH: number; upperArmD: number;
  handW: number; handH: number; handD: number;
  wristGap: number;
  neckW: number; neckH: number; neckD: number;
  headW: number; headH: number; headD: number;
  topCapW: number; topCapH: number; topCapD: number;
  // Computed Y heights
  bootTopY: number; thighTopY: number; beltTopY: number;
  torsoTopY: number; neckTopY: number; headTopY: number;
  shoulderY: number; hipY: number; headJointY: number;
}

const _R: Partial<Rig> = {
  bootW: 0.7, bootH: 0.55, bootD: 0.95,
  thighW: 0.65, thighH: 0.95, thighD: 0.75,
  beltH: 0.18,
  torsoW: 1.65, torsoH: 1.55, torsoD: 0.95,
  padW: 0.55, padH: 0.55, padD: 0.7,
  upperArmW: 0.5, upperArmH: 0.85, upperArmD: 0.55,
  handW: 0.55, handH: 0.55, handD: 0.6,
  wristGap: 0.08,
  neckW: 0.42, neckH: 0.22, neckD: 0.5,
  headW: 1.0, headH: 1.0, headD: 1.05,
  topCapW: 0.55, topCapH: 0.5, topCapD: 0.55,
};
_R.bootTopY  = _R.bootH!;
_R.thighTopY = _R.bootTopY! + _R.thighH!;
_R.beltTopY  = _R.thighTopY! + _R.beltH!;
_R.torsoTopY = _R.beltTopY! + _R.torsoH!;
_R.neckTopY  = _R.torsoTopY! + _R.neckH!;
_R.headTopY  = _R.neckTopY! + _R.headH!;
_R.shoulderY = _R.torsoTopY! - 0.12;
_R.hipY      = _R.thighTopY!;
_R.headJointY = _R.neckTopY!;
export const RIG = _R as Rig;

function buildArm(side: -1 | 1, palette: Palette, materials: THREE.Material[]) {
  const joint = group(side === -1 ? 'leftShoulder' : 'rightShoulder');
  joint.position.set(
    side * (RIG.torsoW / 2 + RIG.upperArmW / 2 + 0.04),
    RIG.shoulderY, 0,
  );

  const upperMat = mat(palette.base, { rough: 0.7 }, materials);
  const upper = chamfer(RIG.upperArmW, RIG.upperArmH, RIG.upperArmD, upperMat, 0.06,
    0, -RIG.upperArmH / 2, 0);
  joint.add(upper);

  const handMat = mat(palette.hand ?? palette.dark, { rough: 0.8 }, materials);
  const hand = chamfer(RIG.handW, RIG.handH, RIG.handD, handMat, 0.07,
    0, -RIG.upperArmH - RIG.wristGap - RIG.handH / 2, 0);
  joint.add(hand);

  return { joint, upper, hand };
}

function buildLeg(side: -1 | 1, palette: Palette, materials: THREE.Material[]) {
  const joint = group(side === -1 ? 'leftHip' : 'rightHip');
  joint.position.set(
    side * (RIG.thighW / 2 + 0.04),
    RIG.hipY, 0,
  );

  const thighMat = mat(palette.pants ?? palette.dark, { rough: 0.78 }, materials);
  const thigh = chamfer(RIG.thighW, RIG.thighH, RIG.thighD, thighMat, 0.08,
    0, -RIG.thighH / 2, 0);
  joint.add(thigh);

  const bootMat = mat(palette.boot ?? new THREE.Color(0x141518), { rough: 0.82 }, materials);
  const boot = chamfer(RIG.bootW, RIG.bootH, RIG.bootD, bootMat, 0.08,
    0, -RIG.thighH - RIG.bootH / 2, 0.05);
  joint.add(boot);

  return { joint, thigh, boot };
}

export function buildHumanoid(palette: Palette): HumanoidBody {
  const root = group('Body');
  const materials: THREE.Material[] = [];

  const torsoMat = mat(palette.base, { rough: 0.7 }, materials);
  const torsoY = RIG.beltTopY + RIG.torsoH / 2;
  const torso = chamfer(RIG.torsoW, RIG.torsoH, RIG.torsoD, torsoMat, 0.1, 0, torsoY, 0);
  root.add(torso);

  const beltMat = mat(palette.belt ?? new THREE.Color(0x1a1c20), { rough: 0.7, metal: 0.15 }, materials);
  const belt = chamfer(RIG.torsoW + 0.06, RIG.beltH, RIG.torsoD + 0.06, beltMat, 0.04,
    0, RIG.thighTopY + RIG.beltH / 2, 0);
  root.add(belt);

  const buckleMat = mat(palette.buckle ?? new THREE.Color(0xb89058), { rough: 0.4, metal: 0.7 }, materials);
  const buckle = box(0.24, 0.16, 0.05, buckleMat,
    0, RIG.thighTopY + RIG.beltH / 2, RIG.torsoD / 2 + 0.06);
  root.add(buckle);

  // Shoulder pads (chunky cubes ON TOP of shoulders, outside torso)
  const padMat = mat(palette.shoulder ?? palette.base, { rough: 0.7 }, materials);
  const makePad = (side: -1 | 1) => chamfer(RIG.padW, RIG.padH, RIG.padD, padMat, 0.07,
    side * (RIG.torsoW / 2 + RIG.padW / 2 + 0.02),
    RIG.torsoTopY - RIG.padH / 2 + 0.08, 0);
  root.add(makePad(-1), makePad(1));

  // Default chest emblem (overwritten by class builders)
  const emblemMat = mat(palette.visor ?? palette.accent, {
    emissive: (palette.visor ?? palette.accent).clone(),
    emissiveI: 1.8, rough: 0.3,
  }, materials);
  const emblem = box(0.3, 0.3, 0.04, emblemMat,
    0, RIG.beltTopY + RIG.torsoH * 0.62, RIG.torsoD / 2 + 0.045);
  emblem.rotation.z = Math.PI / 4;
  root.add(emblem);

  const leftArm = buildArm(-1, palette, materials);
  const rightArm = buildArm(+1, palette, materials);
  root.add(leftArm.joint, rightArm.joint);

  const leftLeg = buildLeg(-1, palette, materials);
  const rightLeg = buildLeg(+1, palette, materials);
  root.add(leftLeg.joint, rightLeg.joint);

  const neckMat = mat(palette.neck ?? palette.dark, { rough: 0.85 }, materials);
  const neck = chamfer(RIG.neckW, RIG.neckH, RIG.neckD, neckMat, 0.04,
    0, RIG.torsoTopY + RIG.neckH / 2, 0);
  root.add(neck);

  // Head joint (head + visor + top cap attach here)
  const headJoint = group('headJoint');
  headJoint.position.set(0, RIG.neckTopY, 0);
  root.add(headJoint);

  const headMat = mat(palette.head ?? palette.skin, { rough: 0.78 }, materials);
  const head = chamfer(RIG.headW, RIG.headH, RIG.headD, headMat, 0.1,
    0, RIG.headH / 2, 0);
  head.name = 'defaultHead';
  headJoint.add(head);

  const eyeMat = mat(0xf2f4f8, { rough: 0.6 }, materials);
  const pupilMat = mat(0x14181d, { rough: 0.85 }, materials);
  const eyeY = RIG.headH * 0.62;
  const eyeZ = RIG.headD / 2 + 0.001;
  const eyeL = box(0.16, 0.14, 0.02, eyeMat, -0.22, eyeY, eyeZ);
  const eyeR = box(0.16, 0.14, 0.02, eyeMat,  0.22, eyeY, eyeZ);
  const pupilL = box(0.07, 0.1, 0.02, pupilMat, -0.22, eyeY, eyeZ + 0.005);
  const pupilR = box(0.07, 0.1, 0.02, pupilMat,  0.22, eyeY, eyeZ + 0.005);
  const mouth = box(0.3, 0.04, 0.02, pupilMat, 0, RIG.headH * 0.28, eyeZ);
  headJoint.add(eyeL, eyeR, pupilL, pupilR, mouth);

  return {
    root,
    materials,
    palette,
    torso, belt, buckle, emblem,
    headJoint,
    defaultFace: { head, eyeL, eyeR, pupilL, pupilR, mouth },
    leftShoulder: leftArm.joint,
    rightShoulder: rightArm.joint,
    leftHand: leftArm.hand,
    rightHand: rightArm.hand,
    leftHip: leftLeg.joint,
    rightHip: rightLeg.joint,
  };
}

export function hideFace(body: HumanoidBody): void {
  const f = body.defaultFace;
  f.eyeL.visible = false;
  f.eyeR.visible = false;
  f.pupilL.visible = false;
  f.pupilR.visible = false;
  f.mouth.visible = false;
}

export type EmblemShape = 'triangle' | 'square' | 'diamond' | 'plus' | 'bar' | 'circle';

export function setChestEmblem(body: HumanoidBody, shape: EmblemShape, materials: THREE.Material[]): THREE.Object3D {
  body.emblem.removeFromParent();
  const color = body.palette.visor ?? body.palette.accent;
  const emissive = color.clone();
  const m = mat(color, { emissive, emissiveI: 2.4, rough: 0.25 }, materials);

  let mesh: THREE.Object3D;
  const baseY = RIG.beltTopY + RIG.torsoH * 0.6;
  const baseZ = RIG.torsoD / 2 + 0.045;
  if (shape === 'triangle' || shape === 'diamond') {
    const m1 = box(0.32, 0.32, 0.05, m, 0, baseY, baseZ);
    m1.rotation.z = Math.PI / 4;
    mesh = m1;
  } else if (shape === 'square') {
    mesh = box(0.3, 0.3, 0.05, m, 0, baseY, baseZ);
  } else if (shape === 'plus') {
    const g = group();
    const h = box(0.34, 0.1, 0.05, m, 0, baseY, baseZ);
    const v = box(0.1, 0.34, 0.05, m, 0, baseY, baseZ);
    g.add(h, v);
    mesh = g;
  } else if (shape === 'bar') {
    mesh = box(0.38, 0.1, 0.05, m, 0, baseY, baseZ);
  } else if (shape === 'circle') {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), m);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(0, baseY, baseZ);
    cyl.castShadow = true;
    mesh = cyl;
  } else {
    const def = box(0.3, 0.3, 0.05, m, 0, baseY, baseZ);
    def.rotation.z = Math.PI / 4;
    mesh = def;
  }
  body.root.add(mesh);
  body.emblem = mesh as THREE.Mesh;
  return mesh;
}

/**
 * Per-class palette presets. The player's network color is folded into the
 * accent so two same-class players still differentiate, while the rest of
 * the palette gives each class its identity.
 */
export function derivePalette(playerColor: number, classId: ClassId): Palette {
  const playerTint = new THREE.Color(playerColor);
  const presets: Record<ClassId, Palette> = {
    ranger: {
      base: new THREE.Color(0x3f7a2a),
      shoulder: new THREE.Color(0x4a8a34),
      accent: new THREE.Color(0x6a4824),
      dark: new THREE.Color(0x2a1f12),
      pants: new THREE.Color(0x4a3a26),
      neck: new THREE.Color(0x2a1f12),
      skin: new THREE.Color(0xd9a983),
      head: new THREE.Color(0xd9a983),
      hand: new THREE.Color(0x3a2614),
      visor: new THREE.Color(0xcce06b),
      belt: new THREE.Color(0x3a2614),
      boot: new THREE.Color(0x1a1208),
      buckle: new THREE.Color(0xb89058),
    },
    scout: {
      base: new THREE.Color(0xf6b53b),
      shoulder: new THREE.Color(0xffc44a),
      accent: new THREE.Color(0xd6822a),
      dark: new THREE.Color(0x3a2a18),
      pants: new THREE.Color(0x4a3520),
      neck: new THREE.Color(0xe5b693),
      skin: new THREE.Color(0xe5b693),
      head: new THREE.Color(0xe5b693),
      hand: new THREE.Color(0x1a1a1f),
      visor: new THREE.Color(0xffd24a),
      belt: new THREE.Color(0x2a1c10),
      boot: new THREE.Color(0x111114),
      buckle: new THREE.Color(0xb89058),
    },
    heavy: {
      base: new THREE.Color(0xb02b2b),
      shoulder: new THREE.Color(0xc63838),
      accent: new THREE.Color(0x4a4f5a),
      dark: new THREE.Color(0x14141a),
      pants: new THREE.Color(0x363a44),
      neck: new THREE.Color(0x14141a),
      skin: new THREE.Color(0xd9a07c),
      head: new THREE.Color(0xb02b2b),
      hand: new THREE.Color(0x2a2a32),
      visor: new THREE.Color(0xff7050),
      belt: new THREE.Color(0x1a1a22),
      boot: new THREE.Color(0x0c0c10),
      buckle: new THREE.Color(0xb89058),
    },
    operative: {
      base: new THREE.Color(0x3a3f4a),
      shoulder: new THREE.Color(0x4a505c),
      accent: new THREE.Color(0x1a1c22),
      dark: new THREE.Color(0x101218),
      pants: new THREE.Color(0x24272f),
      neck: new THREE.Color(0x0e1014),
      skin: new THREE.Color(0xd9a983),
      head: new THREE.Color(0x0e1014),
      hand: new THREE.Color(0x0a0b0e),
      visor: new THREE.Color(0xff5252),
      belt: new THREE.Color(0x14171c),
      boot: new THREE.Color(0x05060a),
      buckle: new THREE.Color(0x44464c),
    },
    pyro: {
      base: new THREE.Color(0xd96528),
      shoulder: new THREE.Color(0xea7a3a),
      accent: new THREE.Color(0x8a3a1a),
      dark: new THREE.Color(0x2a1408),
      pants: new THREE.Color(0x5a3a20),
      neck: new THREE.Color(0x2a1408),
      skin: new THREE.Color(0xd9a983),
      head: new THREE.Color(0xb04a1a),
      hand: new THREE.Color(0x1a0a04),
      visor: new THREE.Color(0xfff2a8),
      belt: new THREE.Color(0x1a0a04),
      boot: new THREE.Color(0x12080a),
      buckle: new THREE.Color(0xb89058),
    },
    medic: {
      base: new THREE.Color(0xeaecf0),
      shoulder: new THREE.Color(0xffffff),
      accent: new THREE.Color(0xc91a1a),
      dark: new THREE.Color(0x2a3034),
      pants: new THREE.Color(0x3a4046),
      neck: new THREE.Color(0xd9a983),
      skin: new THREE.Color(0xd9a983),
      head: new THREE.Color(0xd9a983),
      hand: new THREE.Color(0xf2f4f8),
      visor: new THREE.Color(0xc91a1a),
      belt: new THREE.Color(0x1c2024),
      boot: new THREE.Color(0x14181c),
      buckle: new THREE.Color(0xb8b8c0),
    },
    engineer: {
      base: new THREE.Color(0xc78a2a),
      shoulder: new THREE.Color(0xd89a3a),
      accent: new THREE.Color(0x5a3a14),
      dark: new THREE.Color(0x2a1c08),
      pants: new THREE.Color(0x4a3a24),
      neck: new THREE.Color(0xd9a983),
      skin: new THREE.Color(0xd9a983),
      head: new THREE.Color(0xd9a983),
      hand: new THREE.Color(0x14141a),
      visor: new THREE.Color(0x5cf0d2),
      belt: new THREE.Color(0x3a2a14),
      boot: new THREE.Color(0x0c0a06),
      buckle: new THREE.Color(0xb89058),
    },
    phantom: {
      base: new THREE.Color(0x14101c),
      shoulder: new THREE.Color(0x231730),
      accent: new THREE.Color(0x7c33ff),
      dark: new THREE.Color(0x05060a),
      pants: new THREE.Color(0x1a1726),
      neck: new THREE.Color(0x05060a),
      skin: new THREE.Color(0xc0a0c0),
      head: new THREE.Color(0x14101c),
      hand: new THREE.Color(0x231730),
      visor: new THREE.Color(0xc060ff),
      belt: new THREE.Color(0x14101c),
      boot: new THREE.Color(0x02030a),
      buckle: new THREE.Color(0x7c33ff),
    },
  };

  // Blend a touch of the player tint into the buckle so two same-class
  // players still pop apart in a crowd. Buckle is centered + bright →
  // small, focal differentiator.
  const p = presets[classId];
  p.buckle = p.buckle.clone().lerp(playerTint, 0.45);
  return p;
}

export function buildRanger(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  // Hood replaces head visibility
  hideFace(body);
  const hoodMat = mat(palette.base.clone().multiplyScalar(0.55), { rough: 0.92 }, materials);
  const hood = chamfer(RIG.headW + 0.22, RIG.headH + 0.22, RIG.headD + 0.22, hoodMat, 0.1,
    0, RIG.headH / 2 + 0.06, -0.02);
  body.headJoint.add(hood);

  const shadowMat = mat(0x05060a, { rough: 1 }, materials);
  const inner = box(RIG.headW - 0.1, RIG.headH - 0.4, 0.04, shadowMat,
    0, RIG.headH * 0.5, RIG.headD / 2 + 0.08);
  body.headJoint.add(inner);
  const eyeBandMat = mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 2.6, rough: 0.2,
  }, materials);
  const eyeBand = box(RIG.headW - 0.25, 0.1, 0.03, eyeBandMat,
    0, RIG.headH * 0.55, RIG.headD / 2 + 0.105);
  body.headJoint.add(eyeBand);

  const plumeMat = mat(palette.base.clone().multiplyScalar(0.5), {}, materials);
  const plume = chamfer(0.42, 0.45, 0.42, plumeMat, 0.1,
    0, RIG.headH + 0.5, -0.02);
  body.headJoint.add(plume);
  const plumeTip = chamfer(0.22, 0.32, 0.22, plumeMat, 0.06,
    0, RIG.headH + 0.88, -0.02);
  body.headJoint.add(plumeTip);

  setChestEmblem(body, 'triangle', materials);

  const quiverMat = mat(palette.accent.clone().multiplyScalar(0.7), { rough: 0.9 }, materials);
  const quiver = chamfer(0.55, 1.2, 0.4, quiverMat, 0.07,
    0.32, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.22);
  quiver.rotation.z = 0.15;
  root.add(quiver);
  const arrowMat = mat(0xcfa770, {}, materials);
  const fletchMat = mat(0xd84a30, { emissive: new THREE.Color(0xd84a30), emissiveI: 0.5 }, materials);
  for (let i = 0; i < 3; i++) {
    const ox = -0.1 + i * 0.1;
    const shaft = box(0.06, 0.55, 0.06, arrowMat,
      0.32 + ox, RIG.beltTopY + RIG.torsoH * 1.15, -RIG.torsoD / 2 - 0.22);
    root.add(shaft);
    const fletch = box(0.1, 0.18, 0.1, fletchMat,
      0.32 + ox, RIG.beltTopY + RIG.torsoH * 1.35, -RIG.torsoD / 2 - 0.22);
    root.add(fletch);
  }

  const harnessMat = mat(palette.accent, { rough: 0.85 }, materials);
  [-1, 1].forEach((side) => {
    const strap = box(0.14, 1.5, 0.05, harnessMat,
      side * 0.32, RIG.beltTopY + RIG.torsoH * 0.55, RIG.torsoD / 2 + 0.045);
    strap.rotation.z = -side * 0.18;
    root.add(strap);
  });

  attachJoints(root, body);
  return root;
}

// ─── 2. SCOUT ───────────────────────────────────────────────────────────────

export function buildScout(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  hideFace(body);
  const visorBlackMat = mat(0x14181d, {}, materials);
  const visorBlack = box(RIG.headW - 0.08, 0.2, 0.05, visorBlackMat,
    0, RIG.headH * 0.6, RIG.headD / 2 + 0.025);
  body.headJoint.add(visorBlack);
  const visorMat = mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 1.6, rough: 0.2,
  }, materials);
  const visor = box(RIG.headW - 0.18, 0.1, 0.04, visorMat,
    0, RIG.headH * 0.6, RIG.headD / 2 + 0.05);
  body.headJoint.add(visor);
  const mouth = box(0.2, 0.04, 0.02, mat(0x2a2018, {}, materials),
    0, RIG.headH * 0.28, RIG.headD / 2 + 0.001);
  body.headJoint.add(mouth);

  // Backwards cap
  const capMat = mat(palette.base, { rough: 0.7 }, materials);
  const capDome = chamfer(RIG.headW + 0.1, 0.55, RIG.headD + 0.1, capMat, 0.07,
    0, RIG.headH + 0.18, 0);
  body.headJoint.add(capDome);
  const brim = chamfer(RIG.headW + 0.08, 0.1, 0.4, capMat, 0.04,
    0, RIG.headH + 0.0, -RIG.headD / 2 - 0.18);
  body.headJoint.add(brim);
  const button = box(0.12, 0.1, 0.12, mat(palette.accent, {}, materials),
    0, RIG.headH + 0.5, 0);
  body.headJoint.add(button);

  setChestEmblem(body, 'bar', materials);

  // Backpack
  const packMat = mat(palette.accent, { rough: 0.78 }, materials);
  const pack = chamfer(1.0, 1.25, 0.45, packMat, 0.08,
    0, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.28);
  root.add(pack);
  const roll = chamfer(1.05, 0.22, 0.22, mat(0x6a4824, { rough: 0.95 }, materials), 0.05,
    0, RIG.beltTopY + RIG.torsoH + 0.18, -RIG.torsoD / 2 - 0.34);
  root.add(roll);
  const bottle = chamfer(0.2, 0.42, 0.2, mat(0x2a4a6a, { rough: 0.5, metal: 0.4 }, materials), 0.05,
    -0.7, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.2);
  root.add(bottle);
  [-0.32, 0.32].forEach((x) => {
    const s = box(0.12, RIG.torsoH - 0.1, 0.04, mat(palette.dark, {}, materials),
      x, RIG.beltTopY + RIG.torsoH * 0.55, RIG.torsoD / 2 + 0.04);
    root.add(s);
  });

  attachJoints(root, body);
  return root;
}

// ─── 3. HEAVY ───────────────────────────────────────────────────────────────

export function buildHeavy(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  // Extra oversized pauldrons
  const pauldronMat = mat(palette.base.clone().multiplyScalar(0.85), { rough: 0.55, metal: 0.25 }, materials);
  [-1, 1].forEach((side) => {
    const pauldron = chamfer(0.85, 0.45, 0.85, pauldronMat, 0.1,
      side * (RIG.torsoW / 2 + 0.42),
      RIG.torsoTopY + 0.05, 0);
    root.add(pauldron);
    [-0.22, 0.22].forEach((sz) => {
      const stud = box(0.12, 0.16, 0.12, mat(0xb8a050, { rough: 0.3, metal: 0.85 }, materials),
        side * (RIG.torsoW / 2 + 0.42), RIG.torsoTopY + 0.32, sz);
      root.add(stud);
    });
  });

  // Armoured helmet
  hideFace(body);
  const helmMat = mat(palette.base.clone().multiplyScalar(0.95), { rough: 0.5, metal: 0.25 }, materials);
  const helm = chamfer(RIG.headW + 0.16, RIG.headH + 0.18, RIG.headD + 0.16, helmMat, 0.12,
    0, RIG.headH / 2 + 0.04, 0);
  body.headJoint.add(helm);
  const crest = chamfer(0.2, 0.55, RIG.headD + 0.18, mat(palette.accent, {}, materials), 0.05,
    0, RIG.headH + 0.4, 0);
  body.headJoint.add(crest);

  const visorBlackMat = mat(0x07080a, {}, materials);
  const visorBlack = chamfer(RIG.headW + 0.04, 0.3, 0.08, visorBlackMat, 0.03,
    0, RIG.headH * 0.62, RIG.headD / 2 + 0.06);
  body.headJoint.add(visorBlack);
  const visorMat = mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 2.6, rough: 0.15, metal: 0.4,
  }, materials);
  const visor = box(RIG.headW - 0.08, 0.14, 0.04, visorMat,
    0, RIG.headH * 0.62, RIG.headD / 2 + 0.11);
  body.headJoint.add(visor);

  const jaw = chamfer(RIG.headW - 0.05, 0.35, 0.22, mat(palette.accent, { rough: 0.55 }, materials), 0.05,
    0, RIG.headH * 0.22, RIG.headD / 2 + 0.07);
  body.headJoint.add(jaw);
  for (let i = -1; i <= 1; i++) {
    const dot = box(0.07, 0.07, 0.02, mat(0x05060a, {}, materials),
      i * 0.18, RIG.headH * 0.22, RIG.headD / 2 + 0.18);
    body.headJoint.add(dot);
  }

  setChestEmblem(body, 'square', materials);

  // Ammo sash
  const sashMat = mat(0x3a2a18, { rough: 0.85 }, materials);
  const sash = box(0.3, 2.0, 0.06, sashMat,
    -0.2, RIG.beltTopY + RIG.torsoH * 0.55, RIG.torsoD / 2 + 0.05);
  sash.rotation.z = -0.32;
  root.add(sash);
  const bulletMat = mat(0xc8a040, { rough: 0.3, metal: 0.85 }, materials);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const bx = -0.65 + t * 0.9;
    const by = RIG.beltTopY + RIG.torsoH * 1.0 - t * 1.5;
    const bullet = box(0.2, 0.1, 0.06, bulletMat, bx, by, RIG.torsoD / 2 + 0.09);
    bullet.rotation.z = Math.PI / 2 - 0.32;
    root.add(bullet);
  }

  attachJoints(root, body);
  return root;
}

// ─── 4. OPERATIVE ───────────────────────────────────────────────────────────

export function buildOperative(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  hideFace(body);
  const skinSlit = box(0.7, 0.16, 0.02, mat(palette.skin, {}, materials),
    0, RIG.headH * 0.62, RIG.headD / 2 + 0.001);
  body.headJoint.add(skinSlit);
  const pupilMat = mat(0x141518, {}, materials);
  const pupL = box(0.1, 0.08, 0.02, pupilMat, -0.18, RIG.headH * 0.62, RIG.headD / 2 + 0.012);
  const pupR = box(0.1, 0.08, 0.02, pupilMat,  0.18, RIG.headH * 0.62, RIG.headD / 2 + 0.012);
  body.headJoint.add(pupL, pupR);

  // Bump helmet
  const helmMat = mat(palette.accent.clone().multiplyScalar(1.5), { rough: 0.55 }, materials);
  const helm = chamfer(RIG.headW + 0.1, 0.6, RIG.headD + 0.1, helmMat, 0.08,
    0, RIG.headH + 0.2, 0);
  body.headJoint.add(helm);
  const ant = box(0.06, 0.4, 0.06, mat(0x0a0c10, {}, materials),
    -0.32, RIG.headH + 0.65, -0.15);
  body.headJoint.add(ant);

  // Quad-tube NVGs
  const mountMat = mat(0x14171c, { rough: 0.55 }, materials);
  const mount = chamfer(0.4, 0.2, 0.22, mountMat, 0.04,
    0, RIG.headH + 0.18, RIG.headD / 2 + 0.16);
  body.headJoint.add(mount);
  const tubeMat = mat(0x14181d, { rough: 0.4, metal: 0.55 }, materials);
  const lensMat = mat(0x0e3a2a, {
    rough: 0.2, metal: 0.55,
    emissive: new THREE.Color(0x4ae89a), emissiveI: 1.8,
  }, materials);
  [-0.27, -0.09, 0.09, 0.27].forEach((tx) => {
    const tube = chamfer(0.15, 0.34, 0.18, tubeMat, 0.03,
      tx, RIG.headH + 0.05, RIG.headD / 2 + 0.34);
    body.headJoint.add(tube);
    const lens = box(0.11, 0.13, 0.02, lensMat,
      tx, RIG.headH + 0.05, RIG.headD / 2 + 0.46);
    body.headJoint.add(lens);
  });

  setChestEmblem(body, 'square', materials);

  // Plate carrier + mag pouches
  const carrierMat = mat(palette.base.clone().multiplyScalar(1.15), { rough: 0.7 }, materials);
  const carrier = chamfer(RIG.torsoW + 0.02, RIG.torsoH - 0.4, 0.18, carrierMat, 0.06,
    0, RIG.beltTopY + RIG.torsoH / 2 + 0.05, RIG.torsoD / 2 + 0.06);
  root.add(carrier);
  const pouchMat = mat(palette.dark, { rough: 0.8 }, materials);
  for (let i = -1; i <= 1; i++) {
    for (let j = 0; j < 2; j++) {
      const pouch = chamfer(0.32, 0.34, 0.16, pouchMat, 0.04,
        i * 0.42, RIG.beltTopY + RIG.torsoH * 0.55 - j * 0.42, RIG.torsoD / 2 + 0.2);
      root.add(pouch);
    }
  }

  attachJoints(root, body);
  return root;
}

// ─── 5. PYRO ────────────────────────────────────────────────────────────────

export function buildPyro(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  hideFace(body);
  const lensBezelMat = mat(0x0a0a0c, {}, materials);
  const bezel = chamfer(RIG.headW - 0.1, 0.38, 0.06, lensBezelMat, 0.04,
    0, RIG.headH * 0.65, RIG.headD / 2 + 0.04);
  body.headJoint.add(bezel);
  const lensMat = mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 1.6, rough: 0.15, metal: 0.5,
  }, materials);
  [-0.22, 0.22].forEach((x) => {
    const lens = box(0.26, 0.26, 0.04, lensMat, x, RIG.headH * 0.65, RIG.headD / 2 + 0.075);
    body.headJoint.add(lens);
  });

  const filterMat = mat(0x303338, { rough: 0.5, metal: 0.5 }, materials);
  [-1, 1].forEach((side) => {
    const f = chamfer(0.25, 0.35, 0.35, filterMat, 0.05,
      side * (RIG.headW / 2 + 0.18), RIG.headH * 0.35, RIG.headD / 2 - 0.02);
    body.headJoint.add(f);
    const cap = box(0.07, 0.36, 0.36, mat(0x14161a, {}, materials),
      side * (RIG.headW / 2 + 0.32), RIG.headH * 0.35, RIG.headD / 2 - 0.02);
    body.headJoint.add(cap);
  });
  const valve = box(0.18, 0.16, 0.08, mat(0x14161a, {}, materials),
    0, RIG.headH * 0.22, RIG.headD / 2 + 0.06);
  body.headJoint.add(valve);

  // Hood
  const hoodMat = mat(palette.dark, { rough: 0.95 }, materials);
  const hood = chamfer(RIG.headW + 0.2, 0.4, RIG.headD + 0.2, hoodMat, 0.08,
    0, RIG.headH + 0.18, -0.02);
  body.headJoint.add(hood);

  setChestEmblem(body, 'triangle', materials);

  // Apron + hazard square
  const apronMat = mat(palette.base.clone().multiplyScalar(0.85), { rough: 0.85 }, materials);
  const apron = chamfer(RIG.torsoW + 0.02, RIG.torsoH * 0.7, 0.1, apronMat, 0.06,
    0, RIG.beltTopY + RIG.torsoH * 0.4, RIG.torsoD / 2 + 0.04);
  root.add(apron);
  const haz = box(0.36, 0.36, 0.02, mat(0xffd24a, {
    emissive: new THREE.Color(0xffd24a), emissiveI: 0.35, rough: 0.5,
  }, materials),
    -0.42, RIG.beltTopY + RIG.torsoH * 0.4, RIG.torsoD / 2 + 0.105);
  root.add(haz);

  // Twin fuel tanks
  const tankMat = mat(0x8a1a1a, { rough: 0.6, metal: 0.35 }, materials);
  const stripeMat = mat(0xf2e2a8, { rough: 0.6 }, materials);
  [-0.32, 0.32].forEach((tx) => {
    const tank = chamfer(0.42, 1.6, 0.42, tankMat, 0.08,
      tx, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.3);
    root.add(tank);
    const stripe = box(0.44, 0.14, 0.44, stripeMat,
      tx, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.3);
    root.add(stripe);
    const v = box(0.18, 0.22, 0.18, mat(0xc8a040, { rough: 0.4, metal: 0.7 }, materials),
      tx, RIG.beltTopY + RIG.torsoH * 1.05 + 0.16, -RIG.torsoD / 2 - 0.3);
    root.add(v);
  });

  attachJoints(root, body);
  return root;
}

// ─── 6. MEDIC ───────────────────────────────────────────────────────────────

export function buildMedic(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  body.defaultFace.mouth.visible = false;
  const maskMat = mat(0xc9d4dc, { rough: 0.85 }, materials);
  const fmask = chamfer(RIG.headW - 0.04, 0.4, 0.06, maskMat, 0.03,
    0, RIG.headH * 0.3, RIG.headD / 2 + 0.02);
  body.headJoint.add(fmask);

  // Surgical cap + cross
  const capMat = mat(0xf2f4f8, { rough: 0.8 }, materials);
  const cap = chamfer(RIG.headW + 0.06, 0.42, RIG.headD + 0.06, capMat, 0.06,
    0, RIG.headH + 0.12, 0);
  body.headJoint.add(cap);
  const fold = box(RIG.headW + 0.08, 0.06, 0.04, mat(0xc8c8d0, {}, materials),
    0, RIG.headH + 0.0, RIG.headD / 2 + 0.04);
  body.headJoint.add(fold);
  const crossMat = mat(palette.accent, {
    emissive: palette.accent.clone(), emissiveI: 0.6, rough: 0.4,
  }, materials);
  const crossH = box(0.34, 0.1, 0.02, crossMat, 0, RIG.headH + 0.12, RIG.headD / 2 + 0.06);
  const crossV = box(0.1, 0.34, 0.02, crossMat, 0, RIG.headH + 0.12, RIG.headD / 2 + 0.06);
  body.headJoint.add(crossH, crossV);

  setChestEmblem(body, 'plus', materials);

  // Coat skirt
  const coatMat = mat(palette.base, { rough: 0.78 }, materials);
  const coatLower = chamfer(RIG.torsoW + 0.18, 1.15, RIG.torsoD + 0.18, coatMat, 0.08,
    0, RIG.thighTopY - 0.1, 0);
  root.add(coatLower);
  [-1, 1].forEach((side) => {
    const lapel = box(0.28, RIG.torsoH * 0.75, 0.04, coatMat,
      side * 0.28, RIG.beltTopY + RIG.torsoH * 0.6, RIG.torsoD / 2 + 0.03);
    lapel.rotation.z = -side * 0.16;
    root.add(lapel);
  });
  for (let i = 0; i < 3; i++) {
    const btn = box(0.07, 0.07, 0.02, mat(0x6a4a30, { rough: 0.4, metal: 0.5 }, materials),
      0, RIG.beltTopY + RIG.torsoH * 0.32 + i * 0.36, RIG.torsoD / 2 + 0.04);
    root.add(btn);
  }

  // Satchel
  const satchelMat = mat(0xf6f4ea, { rough: 0.8 }, materials);
  const satchel = chamfer(0.6, 0.5, 0.28, satchelMat, 0.04,
    0.55, RIG.beltTopY + RIG.torsoH * 0.2, 0.18);
  root.add(satchel);
  const sCrossH = box(0.3, 0.08, 0.02, crossMat,
    0.55, RIG.beltTopY + RIG.torsoH * 0.2, 0.34);
  const sCrossV = box(0.08, 0.3, 0.02, crossMat,
    0.55, RIG.beltTopY + RIG.torsoH * 0.2, 0.34);
  root.add(sCrossH, sCrossV);
  const strap = box(0.1, 1.8, 0.04, satchelMat,
    0.05, RIG.beltTopY + RIG.torsoH * 0.65, RIG.torsoD / 2 + 0.07);
  strap.rotation.z = 0.45;
  root.add(strap);

  attachJoints(root, body);
  return root;
}

// ─── 7. ENGINEER ────────────────────────────────────────────────────────────

export function buildEngineer(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  body.defaultFace.eyeL.visible = false;
  body.defaultFace.eyeR.visible = false;
  body.defaultFace.pupilL.visible = false;
  body.defaultFace.pupilR.visible = false;
  const goggleBand = box(RIG.headW + 0.04, 0.12, 0.05, mat(0x14181d, {}, materials),
    0, RIG.headH * 0.66, RIG.headD / 2 + 0.02);
  body.headJoint.add(goggleBand);
  const darkLensMat = mat(0x0a1418, {
    rough: 0.15, metal: 0.85,
    emissive: palette.visor.clone(), emissiveI: 0.6,
  }, materials);
  [-0.22, 0.22].forEach((x) => {
    const lens = box(0.24, 0.18, 0.05, darkLensMat,
      x, RIG.headH * 0.66, RIG.headD / 2 + 0.045);
    body.headJoint.add(lens);
  });

  // Hard hat
  const hatMat = mat(0xf2b41a, { rough: 0.55 }, materials);
  const hat = chamfer(RIG.headW + 0.18, 0.42, RIG.headD + 0.18, hatMat, 0.08,
    0, RIG.headH + 0.22, 0);
  body.headJoint.add(hat);
  const brim = chamfer(RIG.headW + 0.24, 0.08, 0.26, mat(0xc6921a, {}, materials), 0.04,
    0, RIG.headH + 0.02, RIG.headD / 2 + 0.08);
  body.headJoint.add(brim);
  const ridge = box(0.16, 0.16, RIG.headD + 0.22, mat(0xc6921a, {}, materials),
    0, RIG.headH + 0.48, 0);
  body.headJoint.add(ridge);
  const lampHousing = chamfer(0.24, 0.2, 0.18, mat(0x14181d, { rough: 0.5 }, materials), 0.04,
    0, RIG.headH + 0.26, RIG.headD / 2 + 0.16);
  body.headJoint.add(lampHousing);
  const lampLens = box(0.18, 0.14, 0.04, mat(0xfff8d0, {
    emissive: new THREE.Color(0xfff8d0), emissiveI: 2.4, rough: 0.2,
  }, materials),
    0, RIG.headH + 0.26, RIG.headD / 2 + 0.27);
  body.headJoint.add(lampLens);

  setChestEmblem(body, 'circle', materials);

  // Hydraulic exo on right shoulder
  const exoMat = mat(0x7a8390, { rough: 0.3, metal: 0.85 }, materials);
  const exoBlock = chamfer(0.5, 0.5, 0.5, exoMat, 0.06, 0.18, 0.2, 0);
  body.rightShoulder.add(exoBlock);
  const piston = box(0.18, 0.16, 0.5, exoMat,
    0.08, -0.0, 0.32);
  body.rightShoulder.add(piston);
  const exoGlow = box(0.36, 0.06, 0.04, mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 1.6, rough: 0.3,
  }, materials), 0.18, 0.4, 0.25);
  body.rightShoulder.add(exoGlow);

  // Backpack power unit
  const power = chamfer(0.95, 1.05, 0.4, mat(palette.dark, { rough: 0.6 }, materials), 0.07,
    0, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.25);
  root.add(power);
  for (let i = -1; i <= 1; i++) {
    const vent = box(0.06, 0.55, 0.04, mat(palette.visor, {
      emissive: palette.visor.clone(), emissiveI: 1.3, rough: 0.3,
    }, materials),
      i * 0.22, RIG.beltTopY + RIG.torsoH * 0.55, -RIG.torsoD / 2 - 0.46);
    root.add(vent);
  }

  // Tool belt pouches in front
  [-0.5, 0.5].forEach((x) => {
    const pouch = chamfer(0.28, 0.34, 0.18, mat(0x5a3a14, { rough: 0.85 }, materials), 0.05,
      x, RIG.thighTopY - 0.05, RIG.torsoD / 2 + 0.08);
    root.add(pouch);
  });

  attachJoints(root, body);
  return root;
}

// ─── 8. PHANTOM ─────────────────────────────────────────────────────────────

export function buildPhantom(palette: Palette, materials: THREE.Material[]): THREE.Group {
  const body = buildHumanoid(palette);
  body.materials.forEach((m) => materials.push(m));
  const root = body.root;

  hideFace(body);
  const visorBlackMat = mat(0x05060a, {}, materials);
  const visorBlack = chamfer(RIG.headW + 0.02, 0.18, 0.06, visorBlackMat, 0.03,
    0, RIG.headH * 0.62, RIG.headD / 2 + 0.04);
  body.headJoint.add(visorBlack);
  const visor = box(RIG.headW - 0.08, 0.08, 0.04, mat(palette.visor, {
    emissive: palette.visor.clone(), emissiveI: 3.2, rough: 0.1, metal: 0.5,
  }, materials),
    0, RIG.headH * 0.62, RIG.headD / 2 + 0.08);
  body.headJoint.add(visor);

  const runeMat = mat(palette.accent, {
    emissive: palette.accent.clone(), emissiveI: 1.5, rough: 0.4,
  }, materials);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 2; i++) {
      const r = box(0.08, 0.08, 0.02, runeMat,
        side * 0.36, RIG.headH * 0.3 - i * 0.16, RIG.headD / 2 + 0.005);
      body.headJoint.add(r);
    }
  });

  // Hood + finial
  const hoodMat = mat(palette.dark.clone().multiplyScalar(1.5), { rough: 0.95 }, materials);
  const hood = chamfer(RIG.headW + 0.18, 0.5, RIG.headD + 0.18, hoodMat, 0.08,
    0, RIG.headH + 0.22, -0.04);
  body.headJoint.add(hood);
  const finial = chamfer(0.22, 0.4, 0.22, hoodMat, 0.05,
    0, RIG.headH + 0.65, -0.06);
  body.headJoint.add(finial);

  const phantomEmblem = setChestEmblem(body, 'diamond', materials) as THREE.Mesh;
  if (phantomEmblem.material && !Array.isArray(phantomEmblem.material)) {
    (phantomEmblem.material as THREE.MeshStandardMaterial).emissiveIntensity = 3.0;
  }

  // Tattered cloak
  const cloakMat = mat(palette.dark, { rough: 0.98 }, materials);
  const cloak = chamfer(RIG.torsoW + 0.2, RIG.torsoH + 1.6, 0.1, cloakMat, 0.06,
    0, RIG.beltTopY + RIG.torsoH / 2 - 0.4, -RIG.torsoD / 2 - 0.1);
  root.add(cloak);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.22;
    const len = 0.4 + Math.sin(i * 1.7) * 0.22;
    const strip = box(0.18, len, 0.08, cloakMat,
      x, RIG.beltTopY + RIG.torsoH / 2 - 1.25 - len / 2, -RIG.torsoD / 2 - 0.14);
    root.add(strip);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.32;
    const r = box(0.06, 0.06, 0.02, runeMat,
      x, RIG.beltTopY + RIG.torsoH / 2 + 0.4, -RIG.torsoD / 2 - 0.06);
    root.add(r);
  }

  const collar = chamfer(RIG.torsoW + 0.12, 0.25, RIG.torsoD + 0.12, hoodMat, 0.05,
    0, RIG.torsoTopY - 0.05, 0);
  root.add(collar);

  attachJoints(root, body);
  return root;
}

// ─── ATTACHING JOINTS to root.userData for animator access ─────────────────

/**
 * Stash joint refs on the returned root so the animator can grab them
 * without re-importing every class builder. RemotePlayerManager only
 * receives the root group from build*() — these userData entries are
 * the bridge.
 */
function attachJoints(root: THREE.Group, body: HumanoidBody): void {
  root.userData.joints = {
    leftShoulder: body.leftShoulder,
    rightShoulder: body.rightShoulder,
    leftHip: body.leftHip,
    rightHip: body.rightHip,
    leftHand: body.leftHand,
    rightHand: body.rightHand,
    headJoint: body.headJoint,
    materials: body.materials,
    palette: body.palette,
  };
}

// ─── HELD-WEAPON BUILDERS ──────────────────────────────────────────────────
//
// Every weapon is built so its LOCAL origin sits at the trigger / pistol
// grip. The avatar's right hand grips here, so attaching the weapon to
// `joints.rightHand` puts it instantly in the correct place. Each weapon
// also exports a `pose` (arm/shoulder rotations + left-hand reach) so the
// avatar can adapt — one-handed pistols, two-handed rifles, shoulder-
// mounted launchers, etc.

export type WeaponType =
  | 'pistol' | 'rifle' | 'shotgun' | 'smg'
  | 'sniper' | 'minigun' | 'launcher';

export interface WeaponPose {
  /** Right-shoulder rotation (radians) — usually negative X (raise forward). */
  rightShoulderX: number;
  rightShoulderZ: number;
  /** Left-shoulder rotation — used by two-handed weapons to reach forward. */
  leftShoulderX: number;
  leftShoulderZ: number;
  /** Should the left arm visibly grip the weapon? Pistols → false. */
  twoHanded: boolean;
  /** Local offset / rotation of the weapon group relative to the right hand. */
  weaponPos: [number, number, number];
  weaponRot: [number, number, number];
}

const DEFAULT_TWO_HANDED_POSE: WeaponPose = {
  rightShoulderX: -1.05, rightShoulderZ: -0.12,
  leftShoulderX:  -0.95, leftShoulderZ:  0.30,
  twoHanded: true,
  weaponPos: [-0.06, -0.08, 0.1],
  weaponRot: [0, -0.05, 0],
};

const ONE_HANDED_POSE: WeaponPose = {
  rightShoulderX: -0.95, rightShoulderZ: -0.05,
  leftShoulderX:  -0.15, leftShoulderZ:  0.05,
  twoHanded: false,
  weaponPos: [-0.04, -0.06, 0.08],
  weaponRot: [0, 0, 0],
};

export function getWeaponPose(type: WeaponType): WeaponPose {
  switch (type) {
    case 'pistol':
      return ONE_HANDED_POSE;
    case 'minigun':
      // Held lower & more level — supported by both hands at the cradle.
      return {
        rightShoulderX: -0.85, rightShoulderZ: -0.18,
        leftShoulderX:  -0.85, leftShoulderZ:  0.22,
        twoHanded: true,
        weaponPos: [-0.1, -0.12, 0.15],
        weaponRot: [0, 0, 0],
      };
    case 'launcher':
      // Shoulder-mounted — held high so the tube clears the head.
      return {
        rightShoulderX: -1.25, rightShoulderZ: -0.12,
        leftShoulderX:  -1.05, leftShoulderZ:  0.4,
        twoHanded: true,
        weaponPos: [-0.06, -0.04, 0.18],
        weaponRot: [0, -0.05, 0],
      };
    case 'sniper':
      // Slightly more raised so the scope reads at eye level.
      return {
        rightShoulderX: -1.1, rightShoulderZ: -0.1,
        leftShoulderX:  -1.0, leftShoulderZ:  0.32,
        twoHanded: true,
        weaponPos: [-0.06, -0.1, 0.12],
        weaponRot: [0, -0.05, 0],
      };
    case 'shotgun':
    case 'rifle':
    case 'smg':
    default:
      return DEFAULT_TWO_HANDED_POSE;
  }
}

/**
 * Build the held-in-hand mesh for any weapon. Local origin is at the
 * trigger / pistol grip. Use `getWeaponPose(type)` for the arm pose.
 */
export function buildHeldWeapon(type: WeaponType, materials: THREE.Material[]): THREE.Group {
  switch (type) {
    case 'pistol':   return buildPistol(materials);
    case 'shotgun':  return buildShotgun(materials);
    case 'smg':      return buildSmg(materials);
    case 'sniper':   return buildSniper(materials);
    case 'minigun':  return buildMinigun(materials);
    case 'launcher': return buildLauncher(materials);
    case 'rifle':
    default:         return buildHeldRifle(materials);
  }
}

// Standard tactical rifle (default) ----------------------------------------
export function buildHeldRifle(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldRifle');
  const metal = mat(new THREE.Color(0x1c1f25), { rough: 0.45, metal: 0.75 }, materials);
  const accent = mat(new THREE.Color(0x2a2f38), { rough: 0.55, metal: 0.55 }, materials);
  const grip = mat(new THREE.Color(0x141518), { rough: 0.85 }, materials);

  g.add(chamfer(0.22, 0.26, 0.95, metal,  0.04, 0,  0,    0.25));   // receiver
  g.add(chamfer(0.2,  0.24, 0.65, accent, 0.04, 0, -0.02, -0.4));   // stock
  const pgripMesh = chamfer(0.18, 0.42, 0.18, grip, 0.03, 0, -0.28, 0.0);
  pgripMesh.rotation.x = 0.25; g.add(pgripMesh);                     // pistol grip
  g.add(chamfer(0.16, 0.32, 0.16, grip,   0.03, 0, -0.22, 0.55));   // foregrip
  g.add(chamfer(0.16, 0.36, 0.22, accent, 0.03, 0, -0.28, 0.18));   // magazine
  g.add(chamfer(0.1,  0.1,  0.7,  metal,  0.02, 0,  0.04, 0.95));   // barrel
  g.add(chamfer(0.14, 0.14, 0.18, metal,  0.03, 0,  0.04, 1.36));   // muzzle
  g.add(chamfer(0.06, 0.1,  0.16, metal,  0.02, 0,  0.2,  0.05));   // iron sight
  g.add(box(0.06, 0.04, 0.06, mat(0x6cf2ff, {
    emissive: new THREE.Color(0x6cf2ff), emissiveI: 1.8, rough: 0.3,
  }, materials), 0, 0.18, 0.45));                                    // rail dot
  return g;
}

// Pistol — small, single-handed ---------------------------------------------
function buildPistol(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldPistol');
  const metal = mat(new THREE.Color(0x1a1d22), { rough: 0.45, metal: 0.75 }, materials);
  const accent = mat(new THREE.Color(0x2a2f38), { rough: 0.55, metal: 0.55 }, materials);
  const grip = mat(new THREE.Color(0x141518), { rough: 0.85 }, materials);

  g.add(chamfer(0.18, 0.2, 0.45, metal, 0.03, 0, 0.05, 0.18));     // slide
  const pgripMesh = chamfer(0.16, 0.34, 0.16, grip, 0.03, 0, -0.18, 0);
  pgripMesh.rotation.x = 0.28; g.add(pgripMesh);                   // grip
  g.add(chamfer(0.14, 0.18, 0.14, accent, 0.03, 0, -0.2, 0.02));   // magazine base
  g.add(chamfer(0.06, 0.1, 0.12, metal, 0.02, 0, 0.16, -0.05));    // rear sight
  g.add(chamfer(0.06, 0.06, 0.06, metal, 0.02, 0, 0.16, 0.32));    // front sight
  g.add(chamfer(0.05, 0.05, 0.06, metal, 0.02, 0, 0.05, 0.45));    // muzzle
  return g;
}

// Shotgun — chunky, pump-action --------------------------------------------
function buildShotgun(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldShotgun');
  const metal = mat(new THREE.Color(0x1d201f), { rough: 0.55, metal: 0.6 }, materials);
  const wood  = mat(new THREE.Color(0x4a2e1a), { rough: 0.85 }, materials);
  const accent = mat(new THREE.Color(0xb8a050), { rough: 0.3, metal: 0.85 }, materials);

  g.add(chamfer(0.22, 0.22, 1.4, metal, 0.04, 0, 0.04, 0.5));      // receiver+barrel
  g.add(chamfer(0.24, 0.2, 0.18, accent, 0.03, 0, 0.04, 1.25));    // bead choke
  g.add(chamfer(0.2, 0.22, 0.62, wood, 0.04, 0, -0.04, -0.4));     // wood stock
  const pgripMesh = chamfer(0.18, 0.34, 0.18, wood, 0.03, 0, -0.2, 0);
  pgripMesh.rotation.x = 0.2; g.add(pgripMesh);                    // grip
  g.add(chamfer(0.16, 0.22, 0.4, wood, 0.04, 0, -0.18, 0.5));      // pump foregrip
  g.add(box(0.04, 0.06, 0.12, mat(0xf0e0c0, {}, materials), 0, 0.18, -0.05)); // bead
  return g;
}

// SMG — compact, magazine forward ------------------------------------------
function buildSmg(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldSmg');
  const metal = mat(new THREE.Color(0x232830), { rough: 0.5, metal: 0.65 }, materials);
  const grip  = mat(new THREE.Color(0x141518), { rough: 0.85 }, materials);
  const accent = mat(new THREE.Color(0x3da8c4), {
    emissive: new THREE.Color(0x3da8c4), emissiveI: 1.4, rough: 0.3,
  }, materials);

  g.add(chamfer(0.2, 0.2, 0.7, metal, 0.04, 0, 0.02, 0.25));       // receiver
  g.add(chamfer(0.18, 0.18, 0.5, metal, 0.03, 0, 0.02, -0.32));    // collapsing stock
  const pgripMesh = chamfer(0.16, 0.38, 0.16, grip, 0.03, 0, -0.22, 0);
  pgripMesh.rotation.x = 0.22; g.add(pgripMesh);                   // grip
  g.add(chamfer(0.14, 0.4, 0.18, metal, 0.03, 0, -0.26, 0.2));     // mag
  g.add(chamfer(0.08, 0.08, 0.4, metal, 0.02, 0, 0.04, 0.78));     // barrel
  g.add(box(0.04, 0.03, 0.4, accent, 0, 0.13, 0.3));               // rail accent strip
  return g;
}

// Sniper — long with scope --------------------------------------------------
function buildSniper(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldSniper');
  const metal = mat(new THREE.Color(0x1a1d22), { rough: 0.4, metal: 0.8 }, materials);
  const wood  = mat(new THREE.Color(0x3a2818), { rough: 0.85 }, materials);
  const scopeMetal = mat(new THREE.Color(0x141519), { rough: 0.3, metal: 0.85 }, materials);
  const lens = mat(new THREE.Color(0x6cf2ff), {
    emissive: new THREE.Color(0x6cf2ff), emissiveI: 1.6, rough: 0.1,
  }, materials);

  g.add(chamfer(0.18, 0.2, 1.2, metal, 0.03, 0, 0.02, 0.45));      // receiver+barrel
  g.add(chamfer(0.16, 0.16, 0.32, metal, 0.03, 0, 0.02, 1.2));     // muzzle brake
  g.add(chamfer(0.2, 0.24, 0.7, wood, 0.04, 0, -0.05, -0.45));     // long stock
  const pgripMesh = chamfer(0.16, 0.38, 0.16, wood, 0.03, 0, -0.22, -0.05);
  pgripMesh.rotation.x = 0.22; g.add(pgripMesh);                   // grip
  g.add(chamfer(0.18, 0.18, 0.25, scopeMetal, 0.03, 0, 0.22, 0.1));// scope body
  g.add(chamfer(0.22, 0.22, 0.16, scopeMetal, 0.03, 0, 0.22, 0.2));// eye piece
  g.add(box(0.16, 0.16, 0.02, lens, 0, 0.22, 0.29));               // eye lens
  // Bipod legs folded down
  [-1, 1].forEach((s) => {
    const leg = chamfer(0.04, 0.32, 0.04, metal, 0.01, s * 0.06, -0.18, 0.85);
    leg.rotation.z = s * 0.4;
    g.add(leg);
  });
  return g;
}

// Minigun — 6-barrel cluster with drum -------------------------------------
function buildMinigun(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldMinigun');
  const metal = mat(new THREE.Color(0x2a2c33), { rough: 0.4, metal: 0.8 }, materials);
  const drumMat = mat(new THREE.Color(0x8c1a1a), { rough: 0.4, metal: 0.5 }, materials);

  g.add(chamfer(0.32, 0.36, 0.95, metal, 0.05, 0, 0.04, 0.25));    // bulky body
  // Rotating barrel cluster
  const cluster = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 14), metal);
  cluster.rotation.x = Math.PI / 2;
  cluster.position.set(0, 0.04, 0.75);
  cluster.castShadow = true;
  g.add(cluster);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(Math.cos(a) * 0.11, 0.04 + Math.sin(a) * 0.11, 0.75);
    barrel.castShadow = true;
    g.add(barrel);
  }
  // Drum mag underneath
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16), drumMat);
  drum.position.set(0, -0.24, 0.05);
  drum.castShadow = true;
  g.add(drum);
  // Pistol grip
  const pgripMesh = chamfer(0.16, 0.34, 0.16, mat(0x141518, { rough: 0.85 }, materials), 0.03, 0, -0.22, -0.25);
  pgripMesh.rotation.x = 0.22; g.add(pgripMesh);
  // Side handle (for left hand)
  const sideHandle = chamfer(0.12, 0.34, 0.12, mat(0x141518, { rough: 0.85 }, materials), 0.03, 0.0, -0.22, 0.3);
  sideHandle.rotation.x = 0.1;
  g.add(sideHandle);
  return g;
}

// Rocket launcher — shouldered tube ----------------------------------------
function buildLauncher(materials: THREE.Material[]): THREE.Group {
  const g = group('HeldLauncher');
  const metal = mat(new THREE.Color(0x3a4030), { rough: 0.65, metal: 0.4 }, materials);
  const accent = mat(new THREE.Color(0x141518), { rough: 0.85 }, materials);
  const warhead = mat(new THREE.Color(0xa83a1a), { rough: 0.5, metal: 0.3 }, materials);

  g.add(chamfer(0.28, 0.28, 1.7, metal, 0.04, 0, 0.05, 0.5));      // tube
  g.add(chamfer(0.34, 0.34, 0.22, accent, 0.04, 0, 0.05, -0.35));  // rear flare
  // Warhead cone peeking out the front
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 12), warhead);
  cone.rotation.x = Math.PI / 2;
  cone.position.set(0, 0.05, 1.5);
  cone.castShadow = true;
  g.add(cone);
  // Sight on top
  const sight = chamfer(0.06, 0.18, 0.16, accent, 0.02, 0, 0.22, 0.0);
  g.add(sight);
  // Grip
  const pgripMesh = chamfer(0.16, 0.36, 0.16, accent, 0.03, 0, -0.2, -0.05);
  pgripMesh.rotation.x = 0.22; g.add(pgripMesh);
  // Foregrip near barrel
  const fgrip = chamfer(0.14, 0.3, 0.14, accent, 0.03, 0, -0.18, 0.55);
  g.add(fgrip);
  return g;
}
