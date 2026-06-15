import * as THREE from 'three';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher';

// ─────────────────────────────────────────────────────────────────────────────
// SHARED MATERIAL CACHE
//
// Switching weapons used to allocate ~40-60 fresh THREE.MeshStandardMaterial
// instances per weapon. Each unique material configuration (color, roughness,
// metalness, emissive, transparent etc.) potentially triggers a fresh shader
// program compilation the first time it's seen by the renderer — causing the
// visible stutter the user reported on weapon switch.
//
// Solution: cache materials by a stable hash of their constructor parameters.
// With 7 weapons and ~40 parts each, total UNIQUE materials across all
// weapons drops from ~280 fresh allocations to ~30 cached ones. After the
// first switch to each weapon, all subsequent switches reuse cached
// materials and never recompile.
//
// Materials are tagged `userData.cached = true` so the switchWeapon dispose
// loop knows to skip them (disposing a cached material would corrupt the
// cache and break the next switch).
// ─────────────────────────────────────────────────────────────────────────────
const _gunMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
function _matKey(color: number, metalness: number, roughness: number, extra: Partial<THREE.MeshStandardMaterialParameters>): string {
  return [
    'std',
    color,
    metalness.toFixed(3),
    roughness.toFixed(3),
    (extra.envMapIntensity ?? 1.25).toFixed(2),
    extra.emissive ?? '-',
    (extra.emissiveIntensity ?? 0).toFixed(3),
    extra.transparent ? 1 : 0,
    extra.opacity ?? 1,
    extra.side ?? 0,
    extra.depthWrite === false ? 0 : 1,
  ].join(':');
}

/**
 * First-person weapon viewmodel. Every weapon is built from primitive
 * geometry with PBR materials so it reads as a detailed, premium low-poly
 * model. Supports recoil, reload, idle sway, walk bob and aim-down-sights.
 */
export class GunModel {
  group: THREE.Group;
  recoilAnimation: number = 0;
  reloadAnimation: number = 0;
  idleSwayTime: number = 0;
  walkBobTime: number = 0;
  isReloading: boolean = false;
  magazine: THREE.Mesh | null = null;
  currentWeaponType: WeaponType = 'pistol';
  slide: THREE.Mesh | null = null;
  bolt: THREE.Mesh | null = null;
  ejectedMag: THREE.Mesh | null = null;

  // Rest positions for animated parts (set per weapon)
  private slideRest: number = -1.5;
  private boltRest: number = 0.5;
  private magRestY: number = -1;

  // Spinning part (minigun barrel cluster)
  private spinningPart: THREE.Group | null = null;

  // Phantom (stealth) cloak state — fades the whole held weapon while active.
  private phantomActive = false;

  // Uniform model scale at rest. The gun is parented to the camera, so when
  // the camera FOV narrows for ADS the gun would magnify and swallow the
  // screen — setViewmodelFovScale() counter-scales it to a constant size.
  private readonly baseScale = 0.15;

  // Hip-fire base pose and aim-down-sights pose
  private basePosition = { x: 0.3, y: -0.3, z: -0.5 };
  private aimPosition = { x: 0, y: -0.14, z: -0.4 };
  private aimProgress: number = 0;
  private sprintProgress: number = 0;

  // Grip points (model space) where the player's hands hold the weapon.
  // Each weapon sets these so the first-person arms attach correctly.
  private triggerGrip = { x: 0, y: -0.5, z: 0.4 };
  private supportGrip: { x: number; y: number; z: number } | null = null;

  // Animation offsets (accumulated and applied each frame)
  private recoilOffset = { z: 0, rotX: 0, rotY: 0 };
  // Per-shot random lateral muzzle flick (sign + magnitude), so sustained fire
  // walks the viewmodel left/right organically instead of kicking dead-straight.
  private recoilFlick = 0;
  private swayOffset = { rotX: 0, rotY: 0 };
  private walkOffset = { x: 0, y: 0, rotZ: 0, rotX: 0 };
  private reloadRotZ: number = 0;
  private reloadDip: number = 0; // whole-gun dip during a reload (0..1)

  // Jump / fall weapon inertia + landing dip
  private jumpOffset = { y: 0, rotX: 0 };
  private wasAirborne = false;
  private landAnim = 0;
  // One-shot action flourishes (1 = just triggered, decays to 0)
  private abilityAnim = 0;
  private dashAnim = 0;
  private equipAnim = 0; // weapon-swap raise (gun rises from low into the ready pose)
  // ── WEAPON INSPECT (CS:GO-style, bound to F) ──
  // A cinematic "look at the weapon": the gun is drawn in close and slowly
  // turned to show both sides of the receiver, tilts the muzzle up, then settles
  // back to the ready pose. Purely cosmetic — cancelled the instant the player
  // fires / aims / reloads / swaps so it never gets in the way.
  private inspectActive = false;
  private inspectTime = 0;
  private readonly INSPECT_DURATION = 2.7; // seconds for the full play-out
  // Strafe lean — smoothed [-1..1] (−1 = strafing left, +1 = right). Drives an
  // AAA-style weapon cant/lean when the player moves sideways, amplified while
  // aiming down sights so the ADS pose reads as "leaning into the strafe".
  private strafeLean = 0;
  private aimedStrafe = 0; // how much of the lean is "aiming" (for amplitude)

  constructor(type: WeaponType) {
    this.group = new THREE.Group();
    this.currentWeaponType = type;
    this.createGunModel(type);
  }

  /** Helper — create a mesh, position it, enable shadows, add to group. */
  private p(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    shadow = true,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (shadow) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(m);
    return m;
  }

  private mat(
    color: number,
    metalness: number,
    roughness: number,
    extra: Partial<THREE.MeshStandardMaterialParameters> = {},
  ): THREE.MeshStandardMaterial {
    const key = _matKey(color, metalness, roughness, extra);
    const cached = _gunMaterialCache.get(key);
    if (cached) return cached;
    const fresh = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      // Lifted from 1.1 → 1.25: the viewmodel catches a touch more of the
      // sky/sun environment (IBL), so the metal reads crisper and more premium
      // and sunlight glints across it as the day cycle turns — without the
      // grazing-fresnel washout that only afflicts the big ground plane.
      envMapIntensity: 1.25,
      ...extra,
    });
    fresh.userData.cached = true; // dispose loop will skip this
    _gunMaterialCache.set(key, fresh);
    return fresh;
  }

  /**
   * Transparent optic glass. Real scopes are see-through — using a near-clear
   * material means aiming down a scoped weapon no longer paints a solid colour
   * over the screen; the player can see the enemy through the lens.
   */
  private glassMat(tint: number): THREE.MeshStandardMaterial {
    const key = `glass:${tint}`;
    const cached = _gunMaterialCache.get(key);
    if (cached) return cached;
    const fresh = new THREE.MeshStandardMaterial({
      color: tint,
      metalness: 0.1,
      roughness: 0.05,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.4,
    });
    fresh.userData.cached = true;
    _gunMaterialCache.set(key, fresh);
    return fresh;
  }

  private createGunModel(type: WeaponType) {
    // Dispose the previous weapon's GPU resources before clearing. Skip
    // any material tagged `userData.cached` — those live in the shared
    // material pool and disposing them would corrupt the cache and break
    // every subsequent weapon switch.
    //
    // Geometries are still per-weapon (each part has a unique shape /
    // dimensions) so they're disposed normally.
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => { if (m && !m.userData.cached) m.dispose(); });
        } else if (mat && !mat.userData.cached) {
          mat.dispose();
        }
      }
    });
    this.group.clear();

    // Reset tracked part references — they belong to the old (disposed) model
    this.magazine = null;
    this.slide = null;
    this.bolt = null;
    this.ejectedMag = null;
    this.spinningPart = null;
    this.slideRest = -1.5;
    this.boltRest = 0.5;
    this.magRestY = -1;
    // Default ADS pose — scoped weapons override this so their optic
    // rises to the centre of the screen when aiming.
    this.aimPosition = { x: 0, y: -0.14, z: -0.4 };
    // Default grips — each weapon overrides these in its create method.
    this.triggerGrip = { x: 0, y: -0.5, z: 0.4 };
    this.supportGrip = null;

    switch (type) {
      case 'pistol': this.createPistol(); break;
      case 'rifle': this.createRifle(); break;
      case 'shotgun': this.createShotgun(); break;
      case 'smg': this.createSMG(); break;
      case 'sniper': this.createSniper(); break;
      case 'minigun': this.createMinigun(); break;
      case 'launcher': this.createLauncher(); break;
    }

    // Attach the first-person arms last, so they sit on top of the weapon.
    this.addArms();

    this.group.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z);
    this.group.scale.setScalar(this.baseScale);

    // Re-sync the freshly-built model to the current cloak state so switching
    // weapons mid-Phantom never leaves a stale-transparent (or wrongly-solid)
    // weapon — the previous per-material approach leaked across the shared
    // material cache and got stuck on. See applyPhantomToCurrent().
    this.applyPhantomToCurrent();
  }

  /**
   * Phantom cloak visual — fade the whole held weapon while stealthed. Records
   * each material's ORIGINAL opacity/transparency once (in userData) and restores
   * exactly that on deactivate, so glass optics stay glassy and gunmetal returns
   * fully opaque. Re-applied on every weapon rebuild (see createGunModel) so the
   * shared, cached gun materials can never get stuck transparent after a swap.
   */
  setPhantom(active: boolean) {
    if (active === this.phantomActive) return;
    this.phantomActive = active;
    this.applyPhantomToCurrent();
  }

  private applyPhantomToCurrent() {
    const phantom = this.phantomActive;
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const mm = m as THREE.Material & {
          opacity: number;
          transparent: boolean;
          userData: { phantomOrig?: { opacity: number; transparent: boolean } };
        };
        if (mm.userData.phantomOrig === undefined) {
          mm.userData.phantomOrig = { opacity: mm.opacity, transparent: mm.transparent };
        }
        const orig = mm.userData.phantomOrig;
        if (phantom) {
          mm.transparent = true;
          mm.opacity = Math.min(orig.opacity, 0.4);
        } else {
          mm.transparent = orig.transparent;
          mm.opacity = orig.opacity;
        }
        mm.needsUpdate = true;
      }
    });
  }

  // ====================================================================
  // PISTOL — compact tactical sidearm
  // ====================================================================
  private createPistol() {
    this.slideRest = -1.5;
    this.magRestY = -1;

    const metal = this.mat(0x16181c, 0.95, 0.18, { envMapIntensity: 1.5 });
    const gunmetal = this.mat(0x26282d, 0.9, 0.28);
    const polymer = this.mat(0x0c0d10, 0.25, 0.85, { envMapIntensity: 0.5 });
    const accent = this.mat(0x111317, 0.85, 0.3);

    // Slide (animated)
    this.slide = this.p(new THREE.BoxGeometry(1, 0.72, 4.5), gunmetal, 0, 0.8, this.slideRest);
    // Slide top bevel
    this.p(new THREE.BoxGeometry(0.62, 0.18, 4.2), metal, 0, 1.18, this.slideRest);

    // Rear slide serrations
    for (let i = 0; i < 7; i++) {
      this.p(new THREE.BoxGeometry(1.04, 0.5, 0.12), metal, 0, 0.85, 0.2 - i * 0.22, false);
    }
    // Front slide serrations
    for (let i = 0; i < 5; i++) {
      this.p(new THREE.BoxGeometry(1.04, 0.46, 0.1), metal, 0, 0.85, -2.7 - i * 0.22, false);
    }

    // Barrel + chamber
    const barrel = this.p(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16), metal, 0, 0.8, -4.5);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = this.p(new THREE.CylinderGeometry(0.35, 0.32, 0.32, 16), gunmetal, 0, 0.8, -5.35);
    muzzle.rotation.x = Math.PI / 2;
    const bore = this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 14), this.mat(0x000000, 1, 0.4), 0, 0.8, -5.45, false);
    bore.rotation.x = Math.PI / 2;

    // Frame / dust cover
    this.p(new THREE.BoxGeometry(0.92, 0.55, 4.4), polymer, 0, 0.28, -1.4);
    // Accessory rail under dust cover
    this.p(new THREE.BoxGeometry(0.7, 0.22, 1.4), accent, 0, -0.02, -2.9);

    // Grip — angled
    const grip = this.p(new THREE.BoxGeometry(1.06, 2.5, 1.3), polymer, 0, -0.6, 0.35);
    grip.rotation.x = 0.18;
    // Grip texture panels
    for (let i = 0; i < 5; i++) {
      this.p(new THREE.BoxGeometry(1.1, 0.16, 0.16), accent, 0, -0.1 - i * 0.42, 0.95, false);
      this.p(new THREE.BoxGeometry(1.1, 0.16, 0.16), accent, 0, -0.1 - i * 0.42, -0.25, false);
    }
    // Magazine baseplate
    this.p(new THREE.BoxGeometry(1.16, 0.3, 1.4), accent, 0, -1.95, 0.5);

    // Magazine (animated)
    this.magazine = this.p(new THREE.BoxGeometry(0.8, 2, 0.95), this.mat(0x1a1c20, 0.6, 0.4), 0, this.magRestY, 0.3);

    // Trigger guard + trigger
    const guard = this.p(new THREE.TorusGeometry(0.5, 0.09, 8, 12, Math.PI), this.mat(0x14161a, 0.8, 0.3), 0, -0.3, -0.3, false);
    guard.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.18, 0.62, 0.16), metal, 0, -0.42, -0.5, false);

    // Sights — front post + rear notch with tritium dots
    const dot = this.mat(0x0a0a0a, 0.6, 0.4, { emissive: 0x33ff88, emissiveIntensity: 0.9 });
    this.p(new THREE.BoxGeometry(0.16, 0.34, 0.18), metal, 0, 1.42, -3.6, false);
    this.p(new THREE.BoxGeometry(0.1, 0.1, 0.1), dot, 0, 1.42, -3.7, false);
    this.p(new THREE.BoxGeometry(0.5, 0.32, 0.2), metal, 0, 1.4, -0.4, false);
    this.p(new THREE.BoxGeometry(0.1, 0.1, 0.1), dot, -0.18, 1.46, -0.5, false);
    this.p(new THREE.BoxGeometry(0.1, 0.1, 0.1), dot, 0.18, 1.46, -0.5, false);

    // Hammer
    this.p(new THREE.BoxGeometry(0.3, 0.4, 0.2), metal, 0, 1.1, 1.0, false);

    // Two-handed grip — support hand cups beneath the trigger hand
    this.triggerGrip = { x: 0.05, y: -0.3, z: 0.5 };
    this.supportGrip = { x: -0.1, y: -1.1, z: 0.55 };
  }

  // ====================================================================
  // RIFLE — modern assault carbine
  // ====================================================================
  private createRifle() {
    this.boltRest = 0.5;
    this.magRestY = -1.8;
    // Bring the red-dot optic to screen centre when aiming
    this.aimPosition = { x: 0, y: -0.3, z: -0.44 };

    const receiver = this.mat(0x2b2d31, 0.82, 0.32);
    const black = this.mat(0x0c0d10, 0.9, 0.16);
    const polymer = this.mat(0x33352b, 0.25, 0.78); // FDE-ish tan polymer
    const rail = this.mat(0x141519, 0.8, 0.3);

    // Upper + lower receiver
    this.p(new THREE.BoxGeometry(1.25, 0.88, 5.4), receiver, 0, 0.5, -1.4);
    this.p(new THREE.BoxGeometry(1.1, 1.15, 2.6), receiver, 0, -0.32, 0.55);

    // Ejection port + forward assist
    this.p(new THREE.BoxGeometry(0.16, 0.34, 1), black, 0.66, 0.62, -0.55, false);
    this.p(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), receiver, 0.6, 0.4, 0.1, false).rotation.z = Math.PI / 2;

    // Charging handle
    this.p(new THREE.BoxGeometry(0.34, 0.2, 0.85), black, 0, 1.02, 0.6, false);

    // Bolt carrier (animated)
    this.bolt = this.p(new THREE.BoxGeometry(0.42, 0.42, 1.2), black, 0, 0.5, this.boltRest, false);

    // Barrel + gas block + flash hider
    const barrel = this.p(new THREE.CylinderGeometry(0.22, 0.24, 7, 16), black, 0, 0.32, -5);
    barrel.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.4, 0.55, 0.6), receiver, 0, 0.55, -4.2, false); // gas block
    const gasTube = this.p(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), black, 0, 0.62, -3, false);
    gasTube.rotation.x = Math.PI / 2;
    const flash = this.p(new THREE.CylinderGeometry(0.34, 0.3, 0.7, 10), black, 0, 0.32, -8.6);
    flash.rotation.x = Math.PI / 2;
    // Flash hider slots
    for (let i = 0; i < 4; i++) {
      const slot = this.p(new THREE.BoxGeometry(0.5, 0.08, 0.4), this.mat(0, 1, 0.5), 0, 0.32, -8.6, false);
      slot.rotation.z = (i / 4) * Math.PI;
    }

    // Handguard with M-LOK slots
    this.p(new THREE.BoxGeometry(0.95, 0.85, 3.6), polymer, 0, 0.05, -3);
    for (let i = 0; i < 5; i++) {
      this.p(new THREE.BoxGeometry(0.5, 0.12, 0.16), rail, 0.5, 0.05, -4 + i * 0.5, false);
      this.p(new THREE.BoxGeometry(0.5, 0.12, 0.16), rail, -0.5, 0.05, -4 + i * 0.5, false);
    }

    // Top picatinny rail (one continuous strip with notches)
    this.p(new THREE.BoxGeometry(0.45, 0.22, 7.6), rail, 0, 1.05, -2.8);
    for (let i = 0; i < 12; i++) {
      this.p(new THREE.BoxGeometry(0.5, 0.12, 0.12), black, 0, 1.2, -5.6 + i * 0.55, false);
    }

    // Magazine (animated, slightly curved look)
    this.magazine = this.p(new THREE.BoxGeometry(0.72, 2.05, 0.95), polymer, 0, this.magRestY, 0.5);
    this.p(new THREE.BoxGeometry(0.76, 0.18, 1), black, 0, -2.7, 0.55, false); // floorplate

    // Pistol grip
    const grip = this.p(new THREE.BoxGeometry(0.78, 1.7, 1), polymer, 0, -1.05, 1.5);
    grip.rotation.x = 0.32;

    // Collapsible stock — buffer tube + cheek piece + buttpad
    const tube = this.p(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 12), black, 0, 0.35, 2.4);
    tube.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.95, 1.05, 1.5), polymer, 0, 0.3, 3.1);
    this.p(new THREE.BoxGeometry(1, 1.3, 0.35), black, 0, 0.25, 3.95, false); // buttpad

    // Red-dot optic — mount, housing, lens, glowing dot
    this.p(new THREE.BoxGeometry(0.5, 0.55, 0.9), black, 0, 1.45, -1, false);
    // openEnded so you can see straight through the optic when aiming
    const optic = this.p(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 16, 1, true), black, 0, 1.95, -1);
    optic.rotation.x = Math.PI / 2;
    const lens = this.p(
      new THREE.CircleGeometry(0.33, 16),
      this.glassMat(0x2a3a44),
      0, 1.95, -1.46, false,
    );
    lens.rotation.y = Math.PI;
    // Bright red dot floats on the clear glass — the actual aiming reticle
    this.p(
      new THREE.CircleGeometry(0.06, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false }),
      0, 1.95, -1.44, false,
    );

    // Flip-up backup sights
    this.p(new THREE.BoxGeometry(0.32, 0.4, 0.12), black, 0, 1.42, -4.6, false);

    // Trigger hand on the pistol grip, support hand on the handguard
    this.triggerGrip = { x: 0.05, y: -0.7, z: 1.45 };
    this.supportGrip = { x: 0, y: -0.5, z: -3 };
  }

  // ====================================================================
  // SHOTGUN — pump-action with wood furniture
  // ====================================================================
  private createShotgun() {
    this.slideRest = -2.7; // pump rest Z (animated by updateRecoil)
    this.magRestY = -1;

    const steel = this.mat(0x202227, 0.85, 0.3);
    const black = this.mat(0x0d0e11, 0.9, 0.22);
    const wood = this.mat(0x4a2f18, 0.15, 0.7);
    const woodDark = this.mat(0x35210f, 0.15, 0.75);

    // Receiver
    this.p(new THREE.BoxGeometry(1.4, 1.5, 3), steel, 0, 0.1, 0.4);
    this.p(new THREE.BoxGeometry(0.18, 0.42, 1), black, 0.72, 0.35, -0.2, false); // ejection port

    // Barrel
    const barrel = this.p(new THREE.CylinderGeometry(0.4, 0.4, 6, 14), steel, 0, 0.55, -3);
    barrel.rotation.x = Math.PI / 2;
    // Heat shield ribs
    for (let i = 0; i < 5; i++) {
      const ring = this.p(new THREE.TorusGeometry(0.46, 0.05, 6, 14), black, 0, 0.55, -1.4 - i * 0.85, false);
      ring.rotation.x = Math.PI / 2;
    }
    // Muzzle
    const muzzle = this.p(new THREE.CylinderGeometry(0.46, 0.42, 0.4, 14), black, 0, 0.55, -6);
    muzzle.rotation.x = Math.PI / 2;

    // Magazine tube under barrel
    const tube = this.p(new THREE.CylinderGeometry(0.3, 0.3, 5, 12), steel, 0, -0.2, -2.6);
    tube.rotation.x = Math.PI / 2;
    this.p(new THREE.CylinderGeometry(0.32, 0.28, 0.3, 12), black, 0, -0.2, -5.1, false).rotation.x = Math.PI / 2;

    // Pump (animated — assigned to slide). Grooves are parented to it so
    // they reciprocate together when racked.
    this.slide = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 14), wood);
    this.slide.rotation.x = Math.PI / 2;
    this.slide.position.set(0, -0.2, this.slideRest);
    this.slide.castShadow = true;
    this.group.add(this.slide);
    // Pump grooves — the pump cylinder's length runs along its local Y axis,
    // so grooves are offset along Y and rotated to wrap that axis.
    for (let i = 0; i < 6; i++) {
      const groove = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 6, 14), woodDark);
      groove.rotation.x = Math.PI / 2;
      groove.position.set(0, -0.6 + i * 0.24, 0);
      this.slide.add(groove);
    }

    // Loading port / shell carrier
    this.magazine = this.p(new THREE.BoxGeometry(0.7, 0.4, 1.2), this.mat(0x6b3410, 0.3, 0.5), 0, -0.55, 0.6);

    // Trigger guard + trigger
    const guard = this.p(new THREE.TorusGeometry(0.52, 0.08, 8, 12, Math.PI), black, 0, -0.7, 0.3, false);
    guard.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.2, 0.6, 0.16), black, 0, -0.85, 0.1, false);

    // Wood stock + grip
    const grip = this.p(new THREE.BoxGeometry(1, 1.7, 1.4), wood, 0, -0.7, 1.8);
    grip.rotation.x = 0.4;
    this.p(new THREE.BoxGeometry(1.2, 1.6, 2.6), wood, 0, 0.05, 3.2);
    this.p(new THREE.BoxGeometry(1.25, 1.7, 0.4), woodDark, 0, 0.05, 4.5, false); // buttpad

    // Bead front sight
    this.p(new THREE.SphereGeometry(0.12, 8, 8), this.mat(0xffcc33, 0.3, 0.4, { emissive: 0x553300, emissiveIntensity: 0.4 }), 0, 1.05, -5.6, false);

    // Trigger hand on the grip, support hand on the pump
    this.triggerGrip = { x: 0.05, y: -0.45, z: 1.7 };
    this.supportGrip = { x: 0, y: -0.75, z: -2.7 };
  }

  // ====================================================================
  // SMG — compact submachine gun
  // ====================================================================
  private createSMG() {
    this.boltRest = 0.7;
    this.magRestY = -2;

    const body = this.mat(0x1a1c24, 0.7, 0.35);
    const black = this.mat(0x0a0b0e, 0.92, 0.16);
    const polymer = this.mat(0x101218, 0.3, 0.7);
    const accent = this.mat(0x2a3f5c, 0.6, 0.4, { emissive: 0x0a1830, emissiveIntensity: 0.3 });

    // Main receiver
    this.p(new THREE.BoxGeometry(1.15, 1.5, 3.6), body, 0, 0.2, -0.4);
    // Upper rounded shroud
    const shroud = this.p(new THREE.CylinderGeometry(0.45, 0.45, 3.4, 12), black, 0, 0.7, -1.7);
    shroud.rotation.x = Math.PI / 2;

    // Barrel poking out of shroud
    const barrel = this.p(new THREE.CylinderGeometry(0.2, 0.2, 4, 12), black, 0, 0.7, -2.4);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = this.p(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 10), black, 0, 0.7, -4.4);
    muzzle.rotation.x = Math.PI / 2;

    // Ejection port + bolt (animated)
    this.p(new THREE.BoxGeometry(0.14, 0.3, 0.85), black, 0.6, 0.45, -0.3, false);
    this.bolt = this.p(new THREE.BoxGeometry(0.36, 0.36, 1), black, 0, 0.55, this.boltRest, false);
    this.p(new THREE.BoxGeometry(0.3, 0.16, 0.6), accent, 0, 1.0, 0.4, false); // charging handle

    // Top rail
    this.p(new THREE.BoxGeometry(0.4, 0.18, 3), this.mat(0x141519, 0.8, 0.3), 0, 1.02, -1);
    for (let i = 0; i < 7; i++) {
      this.p(new THREE.BoxGeometry(0.46, 0.1, 0.1), black, 0, 1.14, -2.2 + i * 0.4, false);
    }

    // Iron sights
    this.p(new THREE.BoxGeometry(0.3, 0.34, 0.12), black, 0, 1.4, -2.6, false);
    this.p(new THREE.BoxGeometry(0.42, 0.3, 0.12), black, 0, 1.36, 0.3, false);

    // Magazine (animated, long)
    this.magazine = this.p(new THREE.BoxGeometry(0.62, 2.4, 0.85), polymer, 0, this.magRestY, -0.2);
    this.p(new THREE.BoxGeometry(0.66, 0.2, 0.9), black, 0, this.magRestY - 1.3, -0.2, false);

    // Vertical foregrip
    const fg = this.p(new THREE.CylinderGeometry(0.2, 0.18, 1.2, 10), polymer, 0, -0.8, -1.9);
    fg.rotation.x = 0.12;

    // Pistol grip
    const grip = this.p(new THREE.BoxGeometry(0.72, 1.55, 0.95), polymer, 0, -0.95, 1);
    grip.rotation.x = 0.34;

    // Folding stock — side struts + pad
    const strutL = this.p(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), black, -0.35, 0.45, 2.3, false);
    strutL.rotation.x = Math.PI / 2;
    const strutR = this.p(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), black, 0.35, 0.45, 2.3, false);
    strutR.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.95, 1.1, 0.4), polymer, 0, 0.4, 3.4, false);

    // Trigger hand on the grip, support hand on the vertical foregrip
    this.triggerGrip = { x: 0.05, y: -0.6, z: 0.95 };
    this.supportGrip = { x: 0, y: -1.15, z: -1.9 };
  }

  // ====================================================================
  // SNIPER — bolt-action precision rifle with scope
  // ====================================================================
  private createSniper() {
    this.boltRest = 1.4;
    this.magRestY = -1.4;
    // Bring the scope to screen centre when aiming
    this.aimPosition = { x: 0, y: -0.24, z: -0.38 };

    const olive = this.mat(0x2f3322, 0.5, 0.55);
    const black = this.mat(0x090a0c, 0.95, 0.1);
    const steel = this.mat(0x23252b, 0.88, 0.22);
    const glass = this.glassMat(0x2c3c46); // see-through scope lenses

    // Receiver
    this.p(new THREE.BoxGeometry(1.5, 1.15, 4.2), steel, 0, 0.15, 0);
    // Bolt body + handle + knob (all animated together as one group)
    this.bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 12), black);
    this.bolt.rotation.x = Math.PI / 2;
    this.bolt.position.set(0, 0.5, this.boltRest);
    this.bolt.castShadow = true;
    const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 8), black);
    boltHandle.position.set(0.55, 0, -0.4); // local to the rotated cylinder
    boltHandle.rotation.x = Math.PI / 2;
    boltHandle.rotation.z = Math.PI / 2;
    this.bolt.add(boltHandle);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), black);
    boltKnob.position.set(1, 0, -0.4);
    this.bolt.add(boltKnob);
    this.group.add(this.bolt);

    // Long fluted barrel
    const barrel = this.p(new THREE.CylinderGeometry(0.26, 0.28, 11, 18), black, 0, 0.18, -5.5);
    barrel.rotation.x = Math.PI / 2;
    // Barrel flutes
    for (let i = 0; i < 6; i++) {
      const flute = this.p(new THREE.BoxGeometry(0.05, 0.05, 6), steel, 0, 0.18, -4.5, false);
      const a = (i / 6) * Math.PI * 2;
      flute.position.x = Math.cos(a) * 0.27;
      flute.position.y = 0.18 + Math.sin(a) * 0.27;
    }
    // Muzzle brake
    const brake = this.p(new THREE.CylinderGeometry(0.4, 0.36, 1.8, 14), black, 0, 0.18, -11.4);
    brake.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      this.p(new THREE.BoxGeometry(0.86, 0.12, 0.5), this.mat(0, 1, 0.5), 0, 0.18, -11 - i * 0.35, false);
    }

    // Tactical scope — tube, bells, rings, lenses, turrets
    const scopeMount = this.mat(0x0a0a0a, 0.8, 0.3);
    // All scope tubes are openEnded — closed caps would block the sight line
    const scope = this.p(new THREE.CylinderGeometry(0.42, 0.42, 4.4, 18, 1, true), black, 0, 1.55, -1.4);
    scope.rotation.x = Math.PI / 2;
    const frontBell = this.p(new THREE.CylinderGeometry(0.56, 0.42, 0.9, 18, 1, true), black, 0, 1.55, -3.7);
    frontBell.rotation.x = Math.PI / 2;
    const rearBell = this.p(new THREE.CylinderGeometry(0.42, 0.52, 0.8, 18, 1, true), black, 0, 1.55, 1.1);
    rearBell.rotation.x = Math.PI / 2;
    // Lenses
    const frontLens = this.p(new THREE.CircleGeometry(0.5, 18), glass, 0, 1.55, -4.18, false);
    frontLens.rotation.y = Math.PI;
    this.p(new THREE.CircleGeometry(0.46, 18), glass, 0, 1.55, 1.52, false);
    this.p(
      new THREE.CircleGeometry(0.05, 10),
      new THREE.MeshBasicMaterial({ color: 0x33ff66, toneMapped: false }),
      0, 1.55, 1.49, false,
    );
    // Elevation + windage turrets
    this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12), scopeMount, 0, 2.1, -1, false);
    const wind = this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.35, 12), scopeMount, 0.55, 1.55, -1, false);
    wind.rotation.z = Math.PI / 2;
    // Mount rings
    for (const z of [-0.2, -2.5]) {
      const ring = this.p(new THREE.TorusGeometry(0.46, 0.12, 8, 16), scopeMount, 0, 1.55, z, false);
      ring.rotation.y = Math.PI / 2;
      this.p(new THREE.BoxGeometry(0.5, 0.5, 0.4), scopeMount, 0, 1.05, z, false);
    }

    // Magazine (animated)
    this.magazine = this.p(new THREE.BoxGeometry(0.78, 1.7, 1.1), black, 0, this.magRestY, 0.2);

    // Skeletonized stock with cheek riser
    this.p(new THREE.BoxGeometry(1.1, 0.7, 3.4), olive, 0, 0.05, 3.1);
    this.p(new THREE.BoxGeometry(1.05, 0.55, 1.6), olive, 0, 0.7, 2.6); // cheek riser
    this.p(new THREE.BoxGeometry(1.15, 1.5, 0.4), black, 0, -0.1, 4.85, false); // buttpad
    // Stock cut-out strut
    this.p(new THREE.BoxGeometry(0.4, 0.4, 1.6), olive, 0, -0.3, 3.6, false);

    // Pistol grip
    const grip = this.p(new THREE.BoxGeometry(0.8, 1.7, 1), olive, 0, -1, 1.4);
    grip.rotation.x = 0.3;

    // Folding bipod
    const legL = this.p(new THREE.CylinderGeometry(0.08, 0.06, 2.6, 8), black, -0.7, -1.3, -4.6, false);
    legL.rotation.z = 0.35;
    const legR = this.p(new THREE.CylinderGeometry(0.08, 0.06, 2.6, 8), black, 0.7, -1.3, -4.6, false);
    legR.rotation.z = -0.35;

    // Trigger guard
    const guard = this.p(new THREE.TorusGeometry(0.5, 0.08, 8, 12, Math.PI), black, 0, -0.5, 0.6, false);
    guard.rotation.x = Math.PI / 2;

    // Trigger hand on the grip, support hand cupping the fore-stock
    this.triggerGrip = { x: 0.05, y: -0.65, z: 1.35 };
    this.supportGrip = { x: 0, y: -0.55, z: -2.9 };
  }

  // ====================================================================
  // MINIGUN — rotary cannon
  // ====================================================================
  private createMinigun() {
    // The minigun is a huge weapon — a centred ADS would shove the barrel
    // cluster into the player's face. Keep its aim pose low and slightly to the
    // side so right-click reads as "bracing + zoom" rather than a face-full of
    // barrels.
    this.aimPosition = { x: 0.12, y: -0.36, z: -0.52 };
    const steel = this.mat(0x202228, 0.9, 0.25);
    const black = this.mat(0x0b0c0f, 0.95, 0.14);
    const brass = this.mat(0xc8962e, 0.85, 0.3, { emissive: 0x3a2a05, emissiveIntensity: 0.25 });
    const housing = this.mat(0x2c2f36, 0.8, 0.35);

    // Rotating barrel cluster
    const barrelGroup = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const cx = Math.cos(angle) * 0.62;
      const cy = Math.sin(angle) * 0.62;
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 8.5, 12), black);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(cx, cy, -4.2);
      barrel.castShadow = true;
      barrelGroup.add(barrel);
      // Per-barrel muzzle ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), steel);
      ring.position.set(cx, cy, -8.3);
      barrelGroup.add(ring);
    }
    // Front + rear barrel clamps
    for (const z of [-7.4, -1.2]) {
      const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.45, 18), steel);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.z = z;
      barrelGroup.add(clamp);
    }
    barrelGroup.position.set(0, 0.3, 0);
    this.group.add(barrelGroup);
    this.spinningPart = barrelGroup;

    // Central hub
    const hub = this.p(new THREE.CylinderGeometry(0.7, 0.7, 1.4, 20), steel, 0, 0.3, -0.2);
    hub.rotation.x = Math.PI / 2;

    // Motor / gearbox housing
    const motor = this.p(new THREE.CylinderGeometry(0.95, 1.1, 2.8, 16), housing, 0, 0.3, 1.6);
    motor.rotation.x = Math.PI / 2;
    // Cooling fins on motor
    for (let i = 0; i < 8; i++) {
      const fin = this.p(new THREE.BoxGeometry(0.1, 2.4, 0.7), black, 0, 0.3, 1.6, false);
      fin.rotation.z = (i / 8) * Math.PI * 2;
      const a = (i / 8) * Math.PI * 2;
      fin.position.x = Math.cos(a) * 1;
      fin.position.y = 0.3 + Math.sin(a) * 1;
    }

    // Ammo feed neck
    this.p(new THREE.BoxGeometry(1.1, 1.3, 1.4), housing, 0, 1.3, 1.2);

    // Ammo drum
    const drum = this.p(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 20), this.mat(0x33363d, 0.7, 0.4), 0, 0.4, 3.4);
    drum.rotation.z = Math.PI / 2;
    this.p(new THREE.CircleGeometry(1.5, 20), black, 0.81, 0.4, 3.4, false).rotation.y = Math.PI / 2;

    // Ammo belt feeding into the gun
    for (let i = 0; i < 6; i++) {
      this.p(new THREE.BoxGeometry(0.34, 0.5, 0.2), brass, 0.2, 1.0 - i * 0.18, 2.1 + i * 0.05, false);
    }

    // Spade grips (twin handles at rear)
    for (const sx of [-0.85, 0.85]) {
      const handle = this.p(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 10), black, sx, -0.6, 2.6);
      handle.rotation.z = 0.15 * Math.sign(sx);
      this.p(new THREE.SphereGeometry(0.24, 10, 10), this.mat(0x111317, 0.3, 0.7), sx, -1.5, 2.6, false);
    }
    // Cross brace between handles
    this.p(new THREE.BoxGeometry(2, 0.3, 0.4), black, 0, 0.2, 2.9, false);

    // Both hands grip the twin spade handles
    this.triggerGrip = { x: 0.85, y: -0.5, z: 2.6 };
    this.supportGrip = { x: -0.85, y: -0.5, z: 2.6 };
  }

  // ====================================================================
  // LAUNCHER — shoulder-fired rocket launcher
  // ====================================================================
  private createLauncher() {
    const olive = this.mat(0x33381f, 0.45, 0.6);
    const black = this.mat(0x0c0d10, 0.85, 0.25);
    const steel = this.mat(0x22242a, 0.85, 0.3);
    const warhead = this.mat(0xb43018, 0.5, 0.4, { emissive: 0x4a1005, emissiveIntensity: 0.4 });

    // Main launch tube
    const tube = this.p(new THREE.CylinderGeometry(0.62, 0.62, 8, 18), olive, 0, 0.3, -2);
    tube.rotation.x = Math.PI / 2;
    // Reinforcement bands
    for (let i = 0; i < 4; i++) {
      const band = this.p(new THREE.TorusGeometry(0.66, 0.07, 8, 18), black, 0, 0.3, -5 + i * 2, false);
      band.rotation.x = Math.PI / 2;
    }
    // Front muzzle ring
    const front = this.p(new THREE.CylinderGeometry(0.72, 0.62, 0.5, 18), black, 0, 0.3, -6.1);
    front.rotation.x = Math.PI / 2;
    // Rear venturi / exhaust cone
    const venturi = this.p(new THREE.CylinderGeometry(0.62, 0.95, 1.6, 18), steel, 0, 0.3, 2.7);
    venturi.rotation.x = Math.PI / 2;

    // Loaded rocket — body + warhead tip + fins protruding from front
    const rocketBody = this.p(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 14), this.mat(0x2a2a2a, 0.6, 0.4), 0, 0.3, -6.4);
    rocketBody.rotation.x = Math.PI / 2;
    const tip = this.p(new THREE.ConeGeometry(0.36, 1.3, 14), warhead, 0, 0.3, -7.8);
    tip.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const fin = this.p(new THREE.BoxGeometry(0.05, 0.5, 0.5), black, 0, 0.3, -5.9, false);
      fin.rotation.z = (i / 4) * Math.PI * 2;
      const a = (i / 4) * Math.PI * 2;
      fin.position.x = Math.cos(a) * 0.4;
      fin.position.y = 0.3 + Math.sin(a) * 0.4;
    }

    // Optical sight unit on top
    this.p(new THREE.BoxGeometry(0.5, 0.6, 0.5), black, 0, 1, -2.2, false);
    const optic = this.p(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 14, 1, true), black, 0, 1.45, -2.2);
    optic.rotation.x = Math.PI / 2;
    const lens = this.p(
      new THREE.CircleGeometry(0.24, 14),
      this.glassMat(0x2a3a44),
      0, 1.45, -2.92, false,
    );
    lens.rotation.y = Math.PI;
    // Iron backup blade
    this.p(new THREE.BoxGeometry(0.1, 0.5, 0.12), black, 0, 1, -4.5, false);

    // Pistol grip + trigger
    const grip = this.p(new THREE.BoxGeometry(0.8, 1.7, 1), black, 0, -0.85, 0.3);
    grip.rotation.x = 0.3;
    const guard = this.p(new THREE.TorusGeometry(0.5, 0.08, 8, 12, Math.PI), black, 0, -0.2, -0.1, false);
    guard.rotation.x = Math.PI / 2;

    // Front support grip
    const frontGrip = this.p(new THREE.BoxGeometry(0.7, 1.4, 0.85), black, 0, -0.6, -3.4);
    frontGrip.rotation.x = -0.15;

    // Shoulder rest pad
    this.p(new THREE.BoxGeometry(1, 1.5, 0.6), this.mat(0x14160c, 0.2, 0.85), 0, -0.4, 3.4, false);

    // Trigger hand on the grip, support hand on the front support grip
    this.triggerGrip = { x: 0.05, y: -0.5, z: 0.25 };
    this.supportGrip = { x: 0, y: -1, z: -3.4 };
  }

  // ====================================================================
  // FIRST-PERSON ARMS — gloved hands + forearms holding the weapon
  // ====================================================================
  private addArms() {
    const sleeve = this.mat(0x2b2e26, 0.12, 0.84, { envMapIntensity: 0.5 });
    const glove = this.mat(0x15171b, 0.28, 0.55, { envMapIntensity: 1.0 });
    const cuff = this.mat(0x1d2024, 0.18, 0.68, { envMapIntensity: 0.6 });

    // Trigger (right) hand — always present
    this.buildArm(this.triggerGrip, 1, sleeve, glove, cuff);
    // Support (left) hand — most weapons; pistols/launchers may differ
    if (this.supportGrip) {
      this.buildArm(this.supportGrip, -1, sleeve, glove, cuff);
    }
  }

  /** Arm parts cast + receive shadows so they ground into the lit scene. */
  private armPart(m: THREE.Mesh): THREE.Mesh {
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  /**
   * Builds one arm: a tapered forearm running from an off-screen elbow to
   * the wrist, a rolled cuff, and a detailed gloved fist gripping the weapon.
   * `side` is +1 for the right arm, -1 for the left.
   */
  private buildArm(
    hand: { x: number; y: number; z: number },
    side: number,
    sleeve: THREE.Material,
    glove: THREE.Material,
    cuff: THREE.Material,
  ) {
    const wrist = new THREE.Vector3(hand.x, hand.y + 0.2, hand.z + 0.55);
    // Elbow sits below, behind and outboard of the hand (off-screen).
    const anchor = new THREE.Vector3(hand.x + 1.7 * side, hand.y - 3.5, hand.z + 3.8);
    const dir = new THREE.Vector3().subVectors(wrist, anchor);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );

    // Forearm — tapered, thicker toward the elbow
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.66, len, 14), sleeve);
    forearm.quaternion.copy(quat);
    forearm.position.set(
      (wrist.x + anchor.x) / 2,
      (wrist.y + anchor.y) / 2,
      (wrist.z + anchor.z) / 2,
    );
    this.armPart(forearm);

    // Elbow cap
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 10), sleeve);
    elbow.position.copy(anchor);
    this.armPart(elbow);

    // Rolled cuff at the wrist
    const cuffMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.62, 14), cuff);
    cuffMesh.quaternion.copy(quat);
    cuffMesh.position.copy(wrist);
    this.armPart(cuffMesh);

    // Gloved fist — back of hand, knuckles, curled fingers, thumb
    const handGroup = new THREE.Group();
    handGroup.position.set(hand.x, hand.y, hand.z);
    handGroup.rotation.x = 0.32;
    handGroup.rotation.y = -0.16 * side;

    const backHand = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.5, 0.98), glove);
    handGroup.add(backHand);

    const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.27, 0.36), glove);
    knuckles.position.set(0, 0.16, -0.42);
    handGroup.add(knuckles);

    // Four fingers curling over the front of the grip
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.32), glove);
      finger.position.set(-0.3 + i * 0.2, -0.22, -0.5);
      finger.rotation.x = 0.92;
      handGroup.add(finger);
    }

    // Thumb on the inboard side
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.27), glove);
    thumb.position.set(0.42 * side, -0.05, -0.06);
    thumb.rotation.z = -0.7 * side;
    thumb.rotation.x = 0.35;
    handGroup.add(thumb);

    handGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.group.add(handGroup);
  }

  /**
   * Update recoil + reload animation — calculates offsets and drives parts.
   */
  updateRecoil(delta: number) {
    // Idle-spin / fire-spin the minigun barrels
    if (this.spinningPart) {
      const spinSpeed = this.recoilAnimation > 0.05 ? 32 : 1.4;
      this.spinningPart.rotation.z += delta * spinSpeed;
    }

    if (this.recoilAnimation > 0) {
      this.recoilAnimation -= delta * 12; // snappy decay
      this.recoilAnimation = Math.max(0, this.recoilAnimation);

      // Prominent kick — the weapon jolts back hard and muzzle-flips up sharply
      // on each shot, then snaps back (snappy decay above). Tuned heavier for a
      // weightier, more realistic feel across all weapons.
      this.recoilOffset.z = this.recoilAnimation * 0.34;
      this.recoilOffset.rotX = -this.recoilAnimation * 0.8;
      this.recoilOffset.rotY = this.recoilAnimation * this.recoilFlick;

      // Slide / pump blowback
      if (this.slide) {
        this.slide.position.z = this.slideRest + this.recoilAnimation * 0.8;
      }
      // Bolt-carrier reciprocation
      if (this.bolt) {
        this.bolt.position.z = this.boltRest + this.recoilAnimation * 1.2;
      }
    } else {
      this.recoilOffset.z *= 0.85;
      this.recoilOffset.rotX *= 0.85;
      this.recoilOffset.rotY *= 0.85;

      if (this.slide) {
        this.slide.position.z += (this.slideRest - this.slide.position.z) * 0.3;
      }
      if (this.bolt) {
        this.bolt.position.z += (this.boltRest - this.bolt.position.z) * 0.3;
      }
    }

    // Prominent reload animation — the whole weapon dips and rolls toward
    // the player, the magazine visibly drops out and a fresh one is slammed
    // home, then the slide/bolt is racked. Reads as a deliberate, weighty
    // action on every weapon.
    if (this.isReloading) {
      this.reloadAnimation += delta * 2.0;
      const ra = this.reloadAnimation;

      // Whole-gun dip envelope — ease in, hold, ease out.
      this.reloadDip =
        ra < 0.16 ? ra / 0.16 :
        ra > 0.84 ? Math.max(0, (1 - ra) / 0.16) :
        1;

      // Stage 1: Magazine drops out (0.0 - 0.24)
      if (ra < 0.24) {
        const p = ra / 0.24;
        if (this.magazine) {
          this.magazine.position.y = this.magRestY - p * 4.6;
          this.magazine.rotation.x = p * 1.9;
          this.magazine.rotation.z = p * 0.8;
        }
        if (this.slide) this.slide.position.z = this.slideRest + p * 0.6;
        this.reloadRotZ = p * 0.6;
      }
      // Stage 2: Magazine away, hand reaches for a fresh one (0.24 - 0.46)
      else if (ra < 0.46) {
        if (this.magazine) this.magazine.visible = false;
        this.reloadRotZ = 0.6;
      }
      // Stage 3: Fresh magazine slammed in (0.46 - 0.74)
      else if (ra < 0.74) {
        const p = (ra - 0.46) / 0.28;
        if (this.magazine) {
          this.magazine.visible = true;
          this.magazine.position.y = this.magRestY - 4.6 * (1 - p);
          this.magazine.rotation.x = (1 - p) * 1.3;
          this.magazine.rotation.z = 0;
        }
        this.reloadRotZ = 0.6;
      }
      // Stage 4: Seat the mag, rack the slide/bolt, recover (0.74 - 1.0)
      else if (ra < 1.0) {
        const p = (ra - 0.74) / 0.26;
        if (this.magazine) {
          this.magazine.position.y = this.magRestY;
          this.magazine.rotation.x = 0;
        }
        if (this.slide) this.slide.position.z = this.slideRest + (1 - p) * 0.6;
        if (this.bolt) this.bolt.position.z = this.boltRest + (1 - p) * 1.3;
        this.reloadRotZ = (1 - p) * 0.6;
      }
      // Complete
      else {
        this.isReloading = false;
        this.reloadAnimation = 0;
        this.reloadRotZ = 0;
        this.reloadDip = 0;
        if (this.magazine) {
          this.magazine.position.y = this.magRestY;
          this.magazine.rotation.x = 0;
          this.magazine.rotation.z = 0;
          this.magazine.visible = true;
        }
        if (this.slide) this.slide.position.z = this.slideRest;
        if (this.bolt) this.bolt.position.z = this.boltRest;
      }
    } else {
      this.reloadRotZ *= 0.9;
      this.reloadDip *= 0.85;
    }
  }

  /** Update idle sway — a gentle figure-8 "breathing" drift so the weapon
   *  feels alive at rest (still tiny enough not to disturb the aim). */
  updateIdleSway(delta: number) {
    this.idleSwayTime += delta;
    this.swayOffset.rotX = Math.sin(this.idleSwayTime * 0.85) * 0.0016
      + Math.sin(this.idleSwayTime * 1.9) * 0.0005;
    this.swayOffset.rotY = Math.cos(this.idleSwayTime * 0.65) * 0.0013;
  }

  /**
   * Update walk/run bob — a classic elliptical head-bob style weapon motion.
   * The vertical axis dips twice per stride (one dip per footfall) while the
   * horizontal sway and roll cycle once, giving a natural, weighted gait.
   */
  updateWalkBob(delta: number, isMoving: boolean, isRunning: boolean) {
    if (isMoving) {
      const speed = isRunning ? 8.6 : 5.2;
      this.walkBobTime += delta * speed;

      const intensity = isRunning ? 0.013 : 0.0075;
      const targetY = (Math.abs(Math.sin(this.walkBobTime)) - 0.5) * intensity * 2;
      const targetX = Math.sin(this.walkBobTime * 0.5) * intensity * 0.9;
      const targetRotZ = Math.sin(this.walkBobTime * 0.5) * intensity * 1.5;
      const targetRotX = Math.sin(this.walkBobTime) * intensity * 0.5;

      const k = Math.min(1, delta * 10);
      this.walkOffset.y += (targetY - this.walkOffset.y) * k;
      this.walkOffset.x += (targetX - this.walkOffset.x) * k;
      this.walkOffset.rotZ += (targetRotZ - this.walkOffset.rotZ) * k;
      this.walkOffset.rotX += (targetRotX - this.walkOffset.rotX) * k;
    } else {
      this.walkOffset.y *= 0.9;
      this.walkOffset.x *= 0.9;
      this.walkOffset.rotZ *= 0.9;
      this.walkOffset.rotX *= 0.9;
    }
  }

  /** Smoothly transition the weapon between hip-fire and aim-down-sights. */
  updateAim(delta: number, isAiming: boolean) {
    const target = isAiming ? 1 : 0;
    this.aimProgress += (target - this.aimProgress) * Math.min(1, delta * 12);
    if (Math.abs(this.aimProgress - target) < 0.002) this.aimProgress = target;
  }

  /**
   * Counteract the FOV-zoom magnification of the (camera-parented) weapon so it
   * stays a constant on-screen size while aiming down sights. Without this the
   * gun balloons up and covers the whole view when ADS narrows the FOV. Call
   * every frame with the camera's live FOV and the player's base (hip) FOV.
   */
  setViewmodelFovScale(currentFov: number, baseFov: number) {
    // The rifle and sniper have hand-tuned ADS poses designed to read WITH the
    // zoom magnification (proper iron-sight / scope feel) — counter-scaling
    // them shrinks the sights and ruins that look, so leave them at rest scale.
    // Every other weapon gets compensated so the zoom can't balloon it into a
    // screen-filling blob.
    if (this.currentWeaponType === 'rifle' || this.currentWeaponType === 'sniper') {
      this.group.scale.setScalar(this.baseScale);
      return;
    }
    const ratio =
      Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) /
      Math.tan(THREE.MathUtils.degToRad(Math.max(1, currentFov)) / 2);
    // Only shrink when zoomed in (ratio > 1); never enlarge past the rest size.
    const comp = 1 / Math.max(1, ratio);
    this.group.scale.setScalar(this.baseScale * comp);
  }

  /** Smoothly transition the weapon into a lowered "sprint" carry pose. */
  updateSprint(delta: number, isSprinting: boolean) {
    const target = isSprinting ? 1 : 0;
    this.sprintProgress += (target - this.sprintProgress) * Math.min(1, delta * 9);
    if (Math.abs(this.sprintProgress - target) < 0.002) this.sprintProgress = target;
  }

  /**
   * AAA-style strafe lean. `strafeInput` is −1 (moving left), 0, or +1
   * (moving right); `isAiming` amplifies the cant so the lean is most
   * pronounced down-sights — the weapon visibly tilts toward the strafe
   * direction. Smoothed so quick taps don't snap the gun around.
   */
  updateStrafe(delta: number, strafeInput: number, isAiming: boolean) {
    const k = Math.min(1, delta * 8);
    this.strafeLean += (strafeInput - this.strafeLean) * k;
    if (Math.abs(this.strafeLean) < 0.0015 && strafeInput === 0) this.strafeLean = 0;
    // Track the aim weighting separately so the amplitude eases in/out with ADS.
    const aimTarget = isAiming ? 1 : 0;
    this.aimedStrafe += (aimTarget - this.aimedStrafe) * Math.min(1, delta * 10);
  }

  /**
   * Weapon inertia while airborne plus a dip when touching down.
   * `verticalVelocity` > 0 means rising, < 0 means falling.
   */
  updateJump(delta: number, isAirborne: boolean, verticalVelocity: number) {
    if (this.wasAirborne && !isAirborne) this.landAnim = 1; // just landed
    this.wasAirborne = isAirborne;
    if (this.landAnim > 0) this.landAnim = Math.max(0, this.landAnim - delta * 4.5);

    // The gun lags the camera: it drops when you accelerate upward off the
    // ground and floats up as you fall — classic weapon-inertia feel.
    const targetY = isAirborne
      ? Math.max(-0.13, Math.min(0.14, -verticalVelocity * 0.55))
      : 0;
    const targetRotX = isAirborne
      ? Math.max(-0.12, Math.min(0.12, verticalVelocity * 0.45))
      : 0;
    const k = Math.min(1, delta * 9);
    this.jumpOffset.y += (targetY - this.jumpOffset.y) * k;
    this.jumpOffset.rotX += (targetRotX - this.jumpOffset.rotX) * k;
  }

  /** Decay the one-shot action flourishes (abilities, dash, weapon equip). */
  updateActions(delta: number) {
    if (this.abilityAnim > 0) this.abilityAnim = Math.max(0, this.abilityAnim - delta * 3);
    if (this.dashAnim > 0) this.dashAnim = Math.max(0, this.dashAnim - delta * 3.6);
    if (this.equipAnim > 0) this.equipAnim = Math.max(0, this.equipAnim - delta * 3.05);
    if (this.inspectActive) {
      this.inspectTime += delta;
      if (this.inspectTime >= this.INSPECT_DURATION) {
        this.inspectActive = false;
        this.inspectTime = 0;
      }
    }
  }

  /** Begin (or restart) the weapon-inspect animation. No-op mid-reload. */
  triggerInspect() {
    if (this.isReloading) return;
    this.inspectActive = true;
    this.inspectTime = 0;
  }

  /**
   * Smoothly abort an in-progress inspect — jumps the playhead into the
   * fade-out tail so the gun eases back to ready over ~0.3s instead of snapping.
   * Called when the player fires / aims / reloads / swaps weapons.
   */
  cancelInspect() {
    if (!this.inspectActive) return;
    this.inspectTime = Math.max(this.inspectTime, this.INSPECT_DURATION * 0.9);
  }

  isInspecting(): boolean {
    return this.inspectActive;
  }

  /** A quick upward flourish + flick when an ability is cast. */
  triggerAbility() {
    this.abilityAnim = 1;
  }

  /** A sharp braced pull-back when the player dashes. */
  triggerDash() {
    this.dashAnim = 1;
  }

  /** Apply all animation offsets — call AFTER all update methods. */
  applyAnimations() {
    const aim = this.aimProgress;
    // Sprinting is mutually exclusive with aiming — aim wins.
    const sprint = this.sprintProgress * (1 - aim);
    // Sway/bob suppressed by aiming, and replaced by the sprint pose.
    const swayMul = (1 - aim * 0.82) * (1 - sprint);

    // Base pose blends hip-fire -> aim-down-sights
    const baseX = this.basePosition.x + (this.aimPosition.x - this.basePosition.x) * aim;
    const baseY = this.basePosition.y + (this.aimPosition.y - this.basePosition.y) * aim;
    const baseZ = this.basePosition.z + (this.aimPosition.z - this.basePosition.z) * aim;

    // CoD-style folded sprint pose — weapon lowered and canted across the body
    const SP_X = -0.045, SP_Y = -0.2, SP_Z = 0.075;
    const SP_RX = -0.5, SP_RY = -0.62, SP_RZ = 0.95;

    // Rhythmic running sway layered on the folded pose
    const runX = Math.sin(this.walkBobTime * 0.5) * 0.055 * sprint;
    const runY = (Math.abs(Math.sin(this.walkBobTime)) - 0.5) * 0.07 * sprint;
    const runRotZ = Math.sin(this.walkBobTime * 0.5) * 0.14 * sprint;
    const runRotX = Math.sin(this.walkBobTime) * 0.06 * sprint;

    // One-shot flourishes (half-sine envelopes)
    const abil = Math.sin(this.abilityAnim * Math.PI);
    const dash = Math.sin(this.dashAnim * Math.PI);
    const land = Math.sin(this.landAnim * Math.PI);

    // Strafe lean — cant the weapon toward the movement direction. Suppressed
    // during the sprint pose (which already cants the gun across the body), and
    // amplified by ~70% while aiming so ADS strafing reads as a deliberate lean.
    const leanAmp = (1 - sprint) * (0.7 + 0.7 * this.aimedStrafe);
    const lean = this.strafeLean * leanAmp;
    const leanRoll = -lean * 0.16;  // roll/cant (top of gun tips into the strafe)
    const leanShift = lean * 0.035; // weapon trails slightly against the motion
    const leanYaw = -lean * 0.05;   // a touch of yaw for depth

    // Reload pulls the weapon down and in toward the player
    const reload = this.reloadDip;

    // Weapon-equip DRAW — a cinematic raise: the gun swings up from low AND
    // cants in from the right with the muzzle tipped up, then rolls level into
    // the ready pose with a small settle-bounce so the swap reads as a real,
    // weighted hand motion rather than a straight vertical pop.
    const equip = this.equipAnim; // 1 just-swapped → 0 settled
    const equipSettle = Math.sin(equip * Math.PI); // 0→1→0 overshoot bump

    // ── INSPECT POSE — draw the gun in close and turn it to show both sides of
    // the receiver, muzzle tipping up, then settle back. A fade in/out envelope
    // keeps the move buttery, and (1-aim) lets ADS instantly override it.
    let inspX = 0, inspY = 0, inspZ = 0, inspPitch = 0, inspYaw = 0, inspRoll = 0;
    if (this.inspectActive) {
      const p = Math.min(1, this.inspectTime / this.INSPECT_DURATION);
      const fadeIn = THREE.MathUtils.smoothstep(p, 0.0, 0.16);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(p, 0.84, 1.0);
      const w = fadeIn * fadeOut * (1 - aim) * (1 - sprint);
      const turn = Math.sin(p * Math.PI * 1.5);        // sweep the side around to the camera
      const settle = Math.sin(p * Math.PI * 5.0) * 0.035; // tiny hand-held life
      // Rotate the muzzle toward the LEFT so the gun turns INTO the screen and
      // its flank faces the camera (the right-hand weapon stays fully visible),
      // instead of swinging off the right edge.
      inspYaw = (1.18 - turn * 0.5) * w;               // turn left → flank faces the player
      inspPitch = (0.30 + Math.sin(p * Math.PI) * 0.20 + settle) * w; // muzzle tips up mid-arc
      inspRoll = (0.46 - turn * 0.12) * w;             // cant matches the turn direction
      inspX = -0.10 * w;                               // draw toward screen centre so it reads
      inspY = (0.05 + settle) * w;                     // lift slightly
      inspZ = 0.16 * w;                                // bring it closer to the lens
    }

    this.group.position.x =
      baseX + this.walkOffset.x * swayMul + SP_X * sprint + runX - reload * 0.07
      + leanShift + inspX + equip * 0.12;
    this.group.position.y =
      baseY + this.walkOffset.y * swayMul + SP_Y * sprint + runY
      + this.jumpOffset.y - land * 0.12 + abil * 0.07 - dash * 0.05 - reload * 0.16
      - equip * 0.5 + equipSettle * 0.05 + inspY;
    this.group.position.z =
      baseZ + this.recoilOffset.z + SP_Z * sprint + dash * 0.16 + reload * 0.12
      + equip * 0.10 + inspZ;

    this.group.rotation.x =
      (this.swayOffset.rotX + this.walkOffset.rotX) * swayMul
      + this.recoilOffset.rotX + SP_RX * sprint + runRotX
      + this.jumpOffset.rotX - land * 0.18 - reload * 0.42 + equip * 0.55 + inspPitch;
    this.group.rotation.y =
      this.swayOffset.rotY * swayMul + SP_RY * sprint + leanYaw + inspYaw + equip * 0.26
      + this.recoilOffset.rotY;
    this.group.rotation.z =
      this.walkOffset.rotZ * swayMul + this.reloadRotZ + SP_RZ * sprint
      + runRotZ + abil * 0.22 + leanRoll + inspRoll + equip * 0.42;
  }

  /**
   * Triggers the per-shot recoil animation on the gun model.
   *
   * `strength` is a multiplier scaled by the weapon's weight so heavier
   * weapons kick harder. Caller passes ~0.6 for a light pistol (1.0kg),
   * ~1.0 for a rifle/SMG, ~1.6 for shotguns/snipers, ~2.4 for the rocket
   * launcher / minigun. The recoilAnimation float is clamped to [0,1]
   * so the visual still looks clean — the screen-space FOV kick (driven
   * separately in App.tsx) carries the heavier-feeling impact.
   */
  triggerRecoil(strength: number = 1.0) {
    const kick = THREE.MathUtils.clamp(0.78 * strength, 0.32, 1.0);
    this.recoilAnimation = Math.min(1.0, this.recoilAnimation + kick);
    // Fresh random lateral flick each shot — heavier weapons throw the muzzle
    // wider. Purely a viewmodel flourish (the camera owns the real aim-walk).
    this.recoilFlick = (Math.random() - 0.5) * 0.11 * THREE.MathUtils.clamp(strength, 0.5, 2.2);
  }

  triggerReload() {
    this.isReloading = true;
    this.reloadAnimation = 0;
  }

  switchWeapon(type: WeaponType) {
    this.currentWeaponType = type;
    this.createGunModel(type);
    this.equipAnim = 1; // play the raise-from-low equip animation
    this.inspectActive = false; // a fresh weapon cancels any in-progress inspect
    this.inspectTime = 0;
  }
}
