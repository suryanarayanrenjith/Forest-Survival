// Hack visuals — everything the player SEES on a robot that has been broken
// into. Two modes share ONE rig (and so one set of shader programs):
//
//  'overclock' — the Subverter's intrusion chip. The unit is being burnt out:
//      a breach lattice flickers and fractures around it, data bits are torn
//      out of it in an erratic orbit, the implant's core races, and the whole
//      rig shifts green → amber → red as the burnout nears.
//  'ally'      — the Hijack spike. The takeover is clean: the lattice flashes
//      on install and then all but disappears (it only flares when the unit is
//      hit), the bits settle into a calm halo, and an ALLY badge + health bar
//      ride above it, tinted azure → amber → red as it takes damage.
//
//  Parts (all parented to the enemy's LOD-independent root, so they inherit
//  its position / yaw / type scale):
//    • IMPLANT     — housing clamped to the upper back by four legs that bite
//                    into the chassis, a pulsing core and a blinking antenna.
//    • LATTICE     — a hex-mesh "firewall" shell around the body.
//    • DATA BITS   — six octahedral packets orbiting the torso.
//    • SCAN BAND   — a thin ring sweeping up the body.
//    • BADGE       — camera-facing HACKED / ALLY marker over the head.
//    • HEALTH BAR  — ally only (present but invisible on an overclock rig, so
//                    the shader warmup — which builds one rig — covers it).
//
// Geometry, the housing material and the badge/lattice textures are shared
// module singletons; only a few small per-instance materials are allocated per
// hack (disposed on detach). Only a handful of robots are ever hacked at once.

import * as THREE from 'three';

export type HackMode = 'overclock' | 'ally';

// ── Shared, build-once resources ──────────────────────────────────────────
let _housingGeo: THREE.BufferGeometry | null = null;
let _coreGeo: THREE.BufferGeometry | null = null;
let _legGeo: THREE.BufferGeometry | null = null;
let _antennaGeo: THREE.BufferGeometry | null = null;
let _tipGeo: THREE.BufferGeometry | null = null;
let _latticeGeo: THREE.BufferGeometry | null = null;
let _bandGeo: THREE.BufferGeometry | null = null;
let _bitGeo: THREE.BufferGeometry | null = null;
let _hackedTex: THREE.CanvasTexture | null = null;
let _allyTex: THREE.CanvasTexture | null = null;
let _hexTex: THREE.CanvasTexture | null = null;
let _housingMat: THREE.MeshStandardMaterial | null = null;

const housingGeo = () => (_housingGeo ??= new THREE.BoxGeometry(0.34, 0.42, 0.13));
const coreGeo = () => (_coreGeo ??= new THREE.BoxGeometry(0.2, 0.26, 0.05));
const legGeo = () => (_legGeo ??= new THREE.BoxGeometry(0.04, 0.04, 0.3));
const antennaGeo = () => (_antennaGeo ??= new THREE.CylinderGeometry(0.012, 0.014, 0.34, 6));
const tipGeo = () => (_tipGeo ??= new THREE.SphereGeometry(0.04, 8, 6));
// Open shell around the body (UV-wrapped by the hex texture, 3 repeats round).
const latticeGeo = () => (_latticeGeo ??= new THREE.CylinderGeometry(1.0, 1.08, 2.15, 24, 1, true));
const bandGeo = () => (_bandGeo ??= new THREE.CylinderGeometry(1.06, 1.06, 0.045, 32, 1, true));
const bitGeo = () => (_bitGeo ??= new THREE.OctahedronGeometry(0.075, 0));

/** Dark machined housing shared by every implant (never disposed per hack). */
function housingMat(): THREE.MeshStandardMaterial {
  return (_housingMat ??= new THREE.MeshStandardMaterial({ color: 0x15191e, metalness: 0.75, roughness: 0.34 }));
}

const SHARED = 'hackShared';

/** White hex lattice on transparent — tinted per instance. */
function hexTexture(): THREE.CanvasTexture {
  if (_hexTex) return _hexTex;
  const w = 256, h = 192;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const R = 18;
  const dx = R * Math.sqrt(3), dy = R * 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  for (let row = -1; row * dy < h + R; row++) {
    for (let col = -1; col * dx < w + R; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0);
      const cy = row * dy;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // Fade the shell out toward its rims so it reads as a field, not a tube.
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.25, 'rgba(0,0,0,0)');
  fade.addColorStop(0.75, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (_hexTex = tex);
}

/** Shared badge frame: soft glow disc + hex outline. */
function badgeBase(ctx: CanvasRenderingContext2D, s: number): void {
  const cx = s / 2;
  const grad = ctx.createRadialGradient(cx, cx - 16, 6, cx, cx - 16, cx * 0.85);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * 78, y = cx - 18 + Math.sin(a) * 78;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

/** HACKED: hex badge, a vector skull with a circuit crack, glitch slices. */
function hackedTexture(): THREE.CanvasTexture {
  if (_hackedTex) return _hackedTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  // Read back once for the glitch slices below.
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const cx = s / 2, cy = s / 2 - 20;
  badgeBase(ctx, s);
  // Skull (vector — emoji glyphs render differently on every platform).
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy - 6, 40, Math.PI, 0);
  ctx.lineTo(cx + 40, cy + 14);
  ctx.quadraticCurveTo(cx + 34, cy + 26, cx + 22, cy + 28);
  ctx.lineTo(cx + 22, cy + 42);
  ctx.lineTo(cx - 22, cy + 42);
  ctx.lineTo(cx - 22, cy + 28);
  ctx.quadraticCurveTo(cx - 34, cy + 26, cx - 40, cy + 14);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath(); ctx.ellipse(cx - 16, cy + 2, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 16, cy + 2, 11, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy + 14); ctx.lineTo(cx - 6, cy + 24); ctx.lineTo(cx + 6, cy + 24); ctx.closePath(); ctx.fill();
  for (const tx of [-12, 0, 12]) ctx.fillRect(cx + tx - 2, cy + 32, 4, 10);
  // The breach: a right-angled circuit crack down the cranium.
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx + 6, cy - 46); ctx.lineTo(cx + 6, cy - 28); ctx.lineTo(cx - 6, cy - 20); ctx.lineTo(cx - 6, cy - 8); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = 'bold 34px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HACKED', cx, s / 2 + 84);
  // Glitch slices: a few horizontal bands shoved sideways.
  for (const [y, h, off] of [[52, 6, 9], [104, 4, -12], [150, 5, 7]] as const) {
    const img = ctx.getImageData(0, y, s, h);
    ctx.clearRect(0, y, s, h);
    ctx.putImageData(img, off, y);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (_hackedTex = tex);
}

/** ALLY: hex badge with a double chevron (friendly-unit rank mark). */
function allyTexture(): THREE.CanvasTexture {
  if (_allyTex) return _allyTex;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s; c.height = s;
  const ctx = c.getContext('2d')!;
  const cx = s / 2, cy = s / 2 - 22;
  badgeBase(ctx, s);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const oy of [-14, 16]) {
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy + oy + 18);
    ctx.lineTo(cx, cy + oy - 14);
    ctx.lineTo(cx + 36, cy + oy + 18);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ALLY', cx, s / 2 + 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (_allyTex = tex);
}

// Per-instance animated handles stashed on the returned group's userData.
interface HackVisualRefs {
  mode: HackMode;
  age: number;
  hitFlash: number;
  coreMat: THREE.MeshStandardMaterial;
  tipMat: THREE.MeshBasicMaterial;
  latticeMat: THREE.MeshBasicMaterial;
  bandMat: THREE.MeshBasicMaterial;
  bitMat: THREE.MeshBasicMaterial;
  badgeMat: THREE.SpriteMaterial;
  barBackMat: THREE.SpriteMaterial;
  barFillMat: THREE.SpriteMaterial;
  implant: THREE.Group;
  legs: THREE.Mesh[];
  tip: THREE.Mesh;
  lattice: THREE.Mesh;
  band: THREE.Mesh;
  bits: THREE.Mesh[];
  badge: THREE.Sprite;
  barBack: THREE.Sprite;
  barFill: THREE.Sprite;
}

const _green = new THREE.Color(0x39ff14);
const _amber = new THREE.Color(0xffc83a);
const _red = new THREE.Color(0xff2d2d);
const _azure = new THREE.Color(0x4c9dff);
const _white = new THREE.Color(0xffffff);
const _tmpCol = new THREE.Color();

/** Overclock: fresh = green, half = amber, burnout = hot red (frac = time left). */
function overclockColor(frac: number, out: THREE.Color): THREE.Color {
  if (frac > 0.5) out.copy(_green).lerp(_amber, (1 - frac) / 0.5);
  else out.copy(_amber).lerp(_red, (0.5 - frac) / 0.5);
  return out;
}
/** Ally: healthy = azure, wounded = amber, critical = red (frac = health). */
function allyColor(frac: number, out: THREE.Color): THREE.Color {
  if (frac > 0.45) return out.copy(_azure);
  if (frac > 0.2) return out.copy(_azure).lerp(_amber, (0.45 - frac) / 0.25);
  return out.copy(_amber).lerp(_red, (0.2 - frac) / 0.2);
}

const BAR_W = 1.1;
const BITS = 6;

/** Build the rig (parent it to the enemy's root mesh). */
export function buildHackVisuals(mode: HackMode = 'overclock'): THREE.Group {
  const group = new THREE.Group();
  group.name = 'hackVisuals';
  const base = mode === 'ally' ? _azure : _green;

  // ── IMPLANT — upper back, legs biting into the chassis ──
  const implant = new THREE.Group();
  implant.position.set(0, 1.02, -0.56);
  const housing = new THREE.Mesh(housingGeo(), housingMat());
  housing.userData[SHARED] = true;
  implant.add(housing);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x05080c, emissive: base.clone(), emissiveIntensity: 1.6, metalness: 0.2, roughness: 0.3,
  });
  const core = new THREE.Mesh(coreGeo(), coreMat);
  core.position.z = -0.07;
  implant.add(core);
  const legs: THREE.Mesh[] = [];
  for (const [lx, ly] of [[-0.16, 0.17], [0.16, 0.17], [-0.16, -0.17], [0.16, -0.17]] as const) {
    const leg = new THREE.Mesh(legGeo(), housingMat());
    leg.userData[SHARED] = true;
    // Angled outward then into the armour, pivoting at the housing corner.
    leg.position.set(lx * 1.25, ly * 1.15, 0.1);
    leg.rotation.set(-ly * 2.2, lx * 2.6, 0);
    implant.add(leg);
    legs.push(leg);
  }
  const antenna = new THREE.Mesh(antennaGeo(), housingMat());
  antenna.userData[SHARED] = true;
  antenna.position.set(0.11, 0.36, -0.02);
  antenna.rotation.z = -0.18;
  implant.add(antenna);
  const tipMat = new THREE.MeshBasicMaterial({ color: base.clone(), toneMapped: false });
  const tip = new THREE.Mesh(tipGeo(), tipMat);
  tip.position.set(0.14, 0.53, -0.02);
  implant.add(tip);
  group.add(implant);

  // ── LATTICE — hex firewall shell ──
  const latticeMat = new THREE.MeshBasicMaterial({
    map: hexTexture(), color: base.clone(), transparent: true, opacity: 0, toneMapped: false,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const lattice = new THREE.Mesh(latticeGeo(), latticeMat);
  lattice.position.y = 1.0;
  group.add(lattice);

  // ── SCAN BAND ──
  const bandMat = new THREE.MeshBasicMaterial({
    color: base.clone(), transparent: true, opacity: 0.3, toneMapped: false,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const band = new THREE.Mesh(bandGeo(), bandMat);
  band.position.y = 0.4;
  group.add(band);

  // ── DATA BITS ──
  const bitMat = new THREE.MeshBasicMaterial({
    color: base.clone(), transparent: true, opacity: 0.9, toneMapped: false,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bits: THREE.Mesh[] = [];
  for (let i = 0; i < BITS; i++) {
    const b = new THREE.Mesh(bitGeo(), bitMat);
    b.userData.phase = (i / BITS) * Math.PI * 2;
    b.userData.lane = i % 3;
    group.add(b);
    bits.push(b);
  }

  // ── BADGE ──
  const badgeMat = new THREE.SpriteMaterial({
    map: mode === 'ally' ? allyTexture() : hackedTexture(), color: base.clone(), transparent: true,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const badge = new THREE.Sprite(badgeMat);
  badge.scale.setScalar(1.35);
  badge.position.y = 3.0;
  badge.renderOrder = 999;
  group.add(badge);

  // ── HEALTH BAR (ally) — left-anchored fill over a dark back plate ──
  const barBackMat = new THREE.SpriteMaterial({
    color: 0x05080c, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const barBack = new THREE.Sprite(barBackMat);
  barBack.scale.set(BAR_W + 0.06, 0.13, 1);
  barBack.position.y = 2.42;
  barBack.renderOrder = 999;
  group.add(barBack);
  const barFillMat = new THREE.SpriteMaterial({
    color: base.clone(), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const barFill = new THREE.Sprite(barFillMat);
  barFill.center.set(0, 0.5);
  barFill.scale.set(BAR_W, 0.07, 1);
  barFill.position.set(-BAR_W / 2, 2.42, 0);
  barFill.renderOrder = 1000;
  group.add(barFill);

  const refs: HackVisualRefs = {
    mode, age: 0, hitFlash: 0,
    coreMat, tipMat, latticeMat, bandMat, bitMat, badgeMat, barBackMat, barFillMat,
    implant, legs, tip, lattice, band, bits, badge, barBack, barFill,
  };
  group.userData.hackRefs = refs;
  return group;
}

/** Flare the firewall (an ally rig being hit, a hack bolt landing, …). */
export function flashHackVisuals(group: THREE.Group, amount = 1): void {
  const refs = group.userData.hackRefs as HackVisualRefs | undefined;
  if (refs) refs.hitFlash = Math.max(refs.hitFlash, amount);
}

/**
 * Animate the rig. `frac` is what the colour reads: the fraction of the hack
 * window left (overclock) or of the unit's health (ally). `t` is a free-running
 * time base (seconds).
 */
export function updateHackVisuals(group: THREE.Group, dt: number, t: number, frac: number): void {
  const refs = group.userData.hackRefs as HackVisualRefs | undefined;
  if (!refs) return;
  const f = Math.max(0, Math.min(1, frac));
  const ally = refs.mode === 'ally';
  refs.age += dt;
  refs.hitFlash = Math.max(0, refs.hitFlash - dt * 3);
  const age = refs.age;
  const col = ally ? allyColor(f, _tmpCol) : overclockColor(f, _tmpCol);

  // Overclock races toward burnout; an ally runs at a steady idle.
  const urgency = ally ? 1 : 1 + (1 - f) * 2.2;
  // Install: legs drive in, the implant seats with an overshoot, the lattice
  // slams on at full and the core flares white-hot.
  const install = Math.max(0, 1 - age / (ally ? 0.9 : 0.6));
  const seat = Math.min(1, age / 0.22);
  const pop = 1 + Math.sin(Math.min(1, age / 0.35) * Math.PI) * 0.35;

  // ── Implant ──
  refs.implant.scale.setScalar(pop);
  for (const leg of refs.legs) leg.scale.set(1, 1, seat);
  const heartbeat = Math.pow(Math.abs(Math.sin(t * (ally ? 2.2 : 5.5 * urgency))), 6);
  refs.coreMat.emissive.copy(col).lerp(_white, install * 0.7);
  refs.coreMat.emissiveIntensity = 1.1 + heartbeat * 2.2 + install * 4;
  const blink = ally ? Math.sin(t * Math.PI * 2) > 0.2 : Math.sin(t * 14 * urgency) > 0;
  refs.tipMat.color.copy(col).multiplyScalar(blink ? 1.4 : 0.25);

  // ── Lattice ──
  let latticeOp: number;
  if (ally) {
    // On install, then only when the unit is hit (and a faint shimmer).
    latticeOp = Math.max(install * 0.85, refs.hitFlash * 0.7, 0.05 + Math.sin(t * 1.7) * 0.02);
  } else {
    // A breach field that keeps failing: a base flicker plus hard dropouts
    // and spikes that grow as the burnout nears.
    const r = Math.random();
    const glitch = r > 0.94 ? 0.55 : r < 0.05 * urgency ? -0.18 : 0;
    latticeOp = Math.max(install * 0.9, Math.max(0, 0.18 + Math.sin(t * 9) * 0.05 + glitch) * (0.7 + (1 - f) * 0.6));
  }
  refs.latticeMat.color.copy(col).lerp(_white, refs.hitFlash * 0.4);
  refs.latticeMat.opacity = latticeOp;
  refs.lattice.rotation.y += dt * (ally ? 0.25 : 0.9 * urgency);
  const fracture = ally ? 0 : (1 - f) * 0.07;
  refs.lattice.scale.set(
    1 + (Math.random() - 0.5) * fracture + install * 0.12,
    1 + (Math.random() - 0.5) * fracture * 0.5,
    1 + (Math.random() - 0.5) * fracture + install * 0.12,
  );

  // ── Scan band — sweeps the body bottom to top ──
  const sweep = (t * (ally ? 0.45 : 0.9 * urgency)) % 1;
  refs.band.position.y = 0.08 + sweep * 2.0;
  refs.bandMat.color.copy(col);
  refs.bandMat.opacity = (ally ? 0.16 : 0.34) * Math.sin(sweep * Math.PI) + install * 0.3;

  // ── Data bits ──
  for (const b of refs.bits) {
    const ph = b.userData.phase as number;
    const lane = b.userData.lane as number;
    if (ally) {
      // A calm halo at shoulder height.
      const a = ph + t * 0.9;
      b.position.set(Math.cos(a) * 0.95, 1.75 + Math.sin(a * 2 + lane) * 0.06, Math.sin(a) * 0.95);
      b.scale.setScalar(0.75);
    } else {
      // Torn out of the chassis: fast, ragged orbits that wander in and out.
      const a = ph + t * (2.6 + lane * 0.7) * urgency;
      const rad = 1.05 + Math.sin(t * 5 + ph * 3) * 0.18 + (Math.random() - 0.5) * 0.08 * urgency;
      b.position.set(Math.cos(a) * rad, 0.55 + lane * 0.55 + Math.sin(t * 4 + ph) * 0.15, Math.sin(a) * rad);
      b.scale.setScalar(0.8 + heartbeat * 0.5);
    }
    b.rotation.x += dt * 4;
    b.rotation.y += dt * 5;
  }
  refs.bitMat.color.copy(col);
  refs.bitMat.opacity = ally ? 0.7 : 0.95;

  // ── Badge ──
  const badgePulse = ally ? 0.06 * Math.sin(t * 2) : 0.12 * Math.abs(Math.sin(t * 6 * urgency));
  refs.badge.position.y = 3.0 + Math.sin(t * 2.4) * 0.08;
  // Overclock badges glitch sideways now and then; an ally's never does.
  refs.badge.position.x = !ally && Math.sin(t * 41) > 0.72 ? (Math.random() - 0.5) * 0.18 : 0;
  refs.badgeMat.color.copy(col);
  refs.badgeMat.opacity = 0.92;
  refs.badge.scale.setScalar((1.3 + badgePulse) * (1 + install * 0.4));

  // ── Health bar (ally only) ──
  if (ally) {
    refs.barBackMat.opacity = 0.7;
    refs.barFillMat.opacity = 0.95;
    refs.barFillMat.color.copy(col).lerp(_white, refs.hitFlash * 0.6);
    refs.barFill.scale.x = Math.max(0.001, BAR_W * f);
  } else {
    refs.barBackMat.opacity = 0;
    refs.barFillMat.opacity = 0;
  }
}

/**
 * Detach from the scene graph and free the per-instance materials. Geometries
 * and textures are shared module singletons and are deliberately NOT disposed
 * (disposing a material never frees its map), and neither is the shared
 * housing material (flagged on its meshes).
 */
export function disposeHackVisuals(group: THREE.Group): void {
  if (group.parent) group.parent.remove(group);
  const seen = new Set<THREE.Material>();
  group.traverse((o) => {
    if (o.userData[SHARED]) return;
    const mat = (o as THREE.Mesh | THREE.Sprite).material as
      | THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.dispose();
    }
  });
  group.userData.hackRefs = undefined;
}

// ─────────────────────────────────────────────────────────────────────────
// HackBeam — the intrusion beam fired into a target (Subverter deploy, a
// Hijack spike leaping to a robot, a subverted sniper's overclocked shot).
// A JAGGED lightning bolt (not a straight line) that snaps taut, flickers
// between a few pre-jittered shapes for an electric feel, fires a couple of
// branching forks, and streams glowing "data packets" down its length into the
// target before fading. Lives in an array updated each frame (returns true
// when spent). `color` tints it (Subverter green by default).
//
// The bolt geometry is baked in world space at construction (the strike only
// lives ~0.45s, so it doesn't need to track a moving target), and a small set
// of jittered variants is cycled each frame to fake live arcing.
// ─────────────────────────────────────────────────────────────────────────
export class HackBeam {
  private group = new THREE.Group();
  private coreMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private packetMat: THREE.MeshBasicMaterial;
  private core: THREE.Mesh;
  private glow: THREE.Mesh;
  private packets: THREE.Mesh[] = [];
  private variants: { core: THREE.TubeGeometry; glow: THREE.TubeGeometry }[] = [];
  private curve: THREE.CatmullRomCurve3;
  private age = 0;
  private readonly life = 0.45;
  private variant = 0;
  private flickerT = 0;
  private readonly len: number;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, color = 0x39ff14) {
    const dir = new THREE.Vector3().subVectors(end, start);
    this.len = Math.max(0.001, dir.length());
    const fwd = dir.clone().normalize();
    // Two perpendicular axes to scatter the bolt's kinks across.
    const up = Math.abs(fwd.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const ax1 = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const ax2 = new THREE.Vector3().crossVectors(fwd, ax1).normalize();
    const jitter = Math.min(0.6, this.len * 0.06);

    // Build a jagged path between start and end with perpendicular noise; the
    // ends stay pinned so the bolt actually connects emitter → target.
    const makePath = (): THREE.CatmullRomCurve3 => {
      const segs = 7;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const p = new THREE.Vector3().lerpVectors(start, end, u);
        if (i > 0 && i < segs) {
          const taper = Math.sin(u * Math.PI); // most kink in the middle
          p.addScaledVector(ax1, (Math.random() - 0.5) * 2 * jitter * taper);
          p.addScaledVector(ax2, (Math.random() - 0.5) * 2 * jitter * taper);
        }
        pts.push(p);
      }
      return new THREE.CatmullRomCurve3(pts);
    };

    // A few jittered variants to flicker between (live arcing).
    this.curve = makePath();
    for (let v = 0; v < 3; v++) {
      const curve = v === 0 ? this.curve : makePath();
      this.variants.push({
        core: new THREE.TubeGeometry(curve, 16, 0.05, 6, false),
        glow: new THREE.TubeGeometry(curve, 16, 0.17, 6, false),
      });
    }

    const tint = new THREE.Color(color);
    this.coreMat = new THREE.MeshBasicMaterial({
      color: tint.clone().lerp(_white, 0.85), transparent: true, opacity: 1, toneMapped: false, depthWrite: false,
    });
    this.glowMat = new THREE.MeshBasicMaterial({
      color: tint, transparent: true, opacity: 0.4, toneMapped: false,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.core = new THREE.Mesh(this.variants[0].core, this.coreMat);
    this.glow = new THREE.Mesh(this.variants[0].glow, this.glowMat);
    this.group.add(this.glow, this.core);

    // Branching forks — short dead-end arcs that split off the main bolt.
    for (let f = 0; f < 2; f++) {
      const u0 = 0.3 + Math.random() * 0.4;
      const base = this.curve.getPoint(u0);
      const forkPts = [base.clone()];
      const dirF = new THREE.Vector3()
        .addScaledVector(ax1, (Math.random() - 0.5) * 2)
        .addScaledVector(ax2, (Math.random() - 0.5) * 2)
        .addScaledVector(fwd, (Math.random() - 0.5))
        .normalize();
      const flen = 0.4 + Math.random() * this.len * 0.18;
      forkPts.push(base.clone().addScaledVector(dirF, flen * 0.5));
      forkPts.push(base.clone().addScaledVector(dirF, flen)
        .addScaledVector(ax1, (Math.random() - 0.5) * jitter));
      const forkCurve = new THREE.CatmullRomCurve3(forkPts);
      const forkGeo = new THREE.TubeGeometry(forkCurve, 6, 0.03, 5, false);
      const fork = new THREE.Mesh(forkGeo, this.coreMat);
      this.group.add(fork);
    }

    // Data packets streaming down the bolt into the target.
    this.packetMat = new THREE.MeshBasicMaterial({
      color: tint.clone().lerp(_white, 0.6), transparent: true, opacity: 0.95, toneMapped: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const packetGeo = new THREE.OctahedronGeometry(0.13, 0);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(packetGeo, this.packetMat);
      m.userData.phase = i / 4;
      this.packets.push(m);
      this.group.add(m);
    }

    scene.add(this.group);
  }

  update(dt: number): boolean {
    this.age += dt;
    const p = this.age / this.life;
    if (p >= 1) return true;

    // Flicker between jittered variants ~30×/s for live arcing.
    this.flickerT += dt;
    if (this.flickerT > 0.033) {
      this.flickerT = 0;
      this.variant = (this.variant + 1) % this.variants.length;
      this.core.geometry = this.variants[this.variant].core;
      this.glow.geometry = this.variants[this.variant].glow;
    }

    // Bright snap on impact, then a flickering fade.
    const fade = 1 - p;
    const sputter = 0.75 + Math.abs(Math.sin(this.age * 70)) * 0.25;
    this.coreMat.opacity = fade * sputter;
    this.glowMat.opacity = 0.45 * fade * (0.6 + sputter * 0.4);
    const swell = 1 + Math.sin(this.age * 55) * 0.12;
    this.glow.scale.setScalar(swell);

    // Stream the data packets along the curve into the target.
    for (const m of this.packets) {
      const phase = m.userData.phase as number;
      const u = (p * 2.2 + phase) % 1;
      this.curve.getPoint(u, m.position);
      const s = (0.6 + Math.sin((p + phase) * Math.PI * 3) * 0.4) * fade;
      m.scale.setScalar(Math.max(0.01, s));
    }
    this.packetMat.opacity = 0.95 * fade;
    return false;
  }

  dispose(scene: THREE.Scene, disposeMaterials = true): void {
    scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    // Variant geometries swapped onto the meshes may not all be currently
    // attached, so dispose the full set explicitly.
    for (const v of this.variants) { v.core.dispose(); v.glow.dispose(); }
    // disposeMaterials=false is used by the shader warmup: it frees the
    // per-instance tube geometries but KEEPS the three MeshBasic materials alive
    // so their linked program stays in the renderer's cache, so the first real
    // Subverter beam in a fight never stalls compiling it.
    if (disposeMaterials) {
      this.coreMat.dispose();
      this.glowMat.dispose();
      this.packetMat.dispose();
    }
  }
}
