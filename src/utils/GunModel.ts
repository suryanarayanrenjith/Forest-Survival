import * as THREE from 'three';
// Canvas → PBR machinery lives in ProceduralSurface (it was extracted FROM this
// file). These four were still duplicated here byte-for-byte, including the
// whole Sobel normal-map pass. The PAINT helpers (_grain / _scratches /
// _mottle / _woodGrain) are deliberately NOT shared: the gun variants are tuned
// differently from the armour ones (fixed vs resolution-relative jitter, a
// different mottle tone range), so folding those together would visibly change
// the baked weapon finishes.
import { bakeCanvas, bakeTex, heightToNormal } from './ProceduralSurface';

export type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher' | 'subverter';

// Weapons light enough to swing as a melee bash. The heavy ordnance (sniper,
// minigun, launcher) is deliberately EXCLUDED — you don't pistol-whip someone
// with a 90cm anti-materiel rifle. App gates the strike on this set and
// triggerMelee() no-ops for excluded weapons, so the two can never disagree.
export const MELEE_CAPABLE_WEAPONS: ReadonlySet<WeaponType> = new Set([
  'pistol', 'rifle', 'shotgun', 'smg', 'subverter',
]);

// MAGNIFIED OPTICS
//
// A tube optic physically CANNOT work as a viewmodel you look through. The
// sight line has to pass the scope's own bore, and a tube's aperture is bounded
// by bore-radius ÷ length: the sniper's scope admits a ~7° cone while the ADS
// frame spans ~83°, so the player was looking at the world through a keyhole
// surrounded on all sides by scope metal. Scaling the model does not help —
// the ratio is scale-invariant, and even an infinitely large scope of the same
// proportions caps out near 5°.
//
// So once the player is genuinely sighted, the 3D optic stops being what they
// look through: the viewmodel is swapped for a full-screen scope picture (see
// the scope overlay in App), which draws the world at full width inside a
// proper aperture. This is what every shooter does with a magnified optic.
//
// SCOPE_TAKEOVER is the aimProgress at which the handover happens; App fades
// its dark veil to full BEFORE this point so the swap is never visible.
export const SCOPED_WEAPONS: ReadonlySet<WeaponType> = new Set(['sniper']);
export const SCOPE_TAKEOVER = 0.58;

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
const _gunMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

// PROCEDURAL SURFACE FINISHES
//
// Flat-colour PBR reads as plastic toy at viewmodel distance. These are tiny
// canvas-baked detail maps — brushed machining streaks, micro-speckle, edge
// scratches for METAL; injection-mould stipple for POLYMER — wired into every
// cached gun material as albedo/roughness/bump maps. They're built ONCE at
// module scope and shared by all weapons, so the material cache keeps its
// shader-variant count tiny (one textured-standard variant, pre-compiled by
// warmup stage 4 which cycles every weapon). Anisotropy comes free from
// textureDefaults (imported first in main.tsx).
// NORMAL MAPS, NOT BUMP MAPS
//
// The rig previously shipped a 128px bumpMap. Bump derives a normal per-pixel
// from a height gradient, which has two problems here: it produces noise rather
// than FEATURES (no directional detail for a rim light to catch), and it barely
// responds to image-based lighting — and with envMapIntensity at 1.25 under an
// HDRI, IBL is most of what lights the viewmodel. So most of that "detail" was
// invisible in exactly the lighting the game actually uses.
//
// Now each finish bakes a real tangent-space normal map by Sobel-filtering its
// height canvas. Cost is identical (one texture slot either way) and the shader
// permutation count is unchanged: USE_BUMPMAP simply becomes USE_NORMALMAP, so
// it stays ONE textured-standard variant and warmup stage 4 still covers it.
//
// Height is preserved in the normal map's ALPHA channel, which the cavity-AO
// injection then samples for free — no extra texture, no extra binding.
interface FinishMaps { albedo: THREE.CanvasTexture; rough: THREE.CanvasTexture; normal: THREE.CanvasTexture }

/**
 * Per-weapon surface identity.
 *
 * Every gun used to sample the SAME three canvases, so a pistol slide, a
 * minigun barrel and a sniper receiver were literally the same surface. These
 * are variations on the same bake machinery — different scratch density, streak
 * length, stipple size, blueing mottle.
 *
 * Crucially this costs ZERO extra shader programs: the material shape is
 * identical, only the texture contents differ, and mat()'s cache key already
 * carries the finish name.
 */
type FinishName = 'metal' | 'metal_worn' | 'metal_blued' | 'polymer' | 'polymer_rough' | 'wood';

const _finishes = new Map<FinishName, FinishMaps>();

/** Grey-noise fill helper: base value ± jitter, in optional horizontal streaks. */
function _grain(ctx: CanvasRenderingContext2D, s: number, base: number, jitter: number, streaky: boolean) {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, s, s);
  if (streaky) {
    // Brushed machining — long horizontal micro-streaks of varying tone.
    for (let i = 0; i < 900; i++) {
      const v = Math.round(base + (Math.random() - 0.5) * 2 * jitter);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 6 + Math.random() * 42, 1);
    }
  } else {
    // Even micro-grain (cast/moulded surface).
    for (let i = 0; i < 2600; i++) {
      const v = Math.round(base + (Math.random() - 0.5) * 2 * jitter);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
    }
  }
}

/** Scatter short scratches — edge wear from holsters, rails and handling. */
function _scratches(ctx: CanvasRenderingContext2D, s: number, count: number, style: (a: number) => string, len: number) {
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = style(0.18 + Math.random() * 0.3);
    ctx.lineWidth = 0.7 + Math.random();
    const x = Math.random() * s, y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.3) * len, y + (Math.random() - 0.5) * 7);
    ctx.stroke();
  }
}

/** Long wavering grain lines — the signature read of oiled gun furniture. */
function _woodGrain(ctx: CanvasRenderingContext2D, s: number, alpha: number) {
  for (let i = 0; i < 34; i++) {
    const y = Math.random() * s;
    const tone = 165 + Math.round(Math.random() * 50);
    ctx.strokeStyle = `rgba(${tone},${tone},${tone},${alpha * (0.4 + Math.random() * 0.6)})`;
    ctx.lineWidth = 0.8 + Math.random() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= s; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3 + (Math.random() - 0.5) * 2);
    }
    ctx.stroke();
  }
}

/** Soft irregular blotches — cold-blueing mottle and anodising variation. */
function _mottle(ctx: CanvasRenderingContext2D, s: number, count: number, radius: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const r = radius * (0.5 + Math.random());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tone = 200 + Math.round(Math.random() * 55);
    g.addColorStop(0, `rgba(${tone},${tone},${tone},${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** How each finish is painted. Albedo is near-white — it MULTIPLIES the part
 *  colour, so these add tonal life without touching hue. */
const _FINISH_SPECS: Record<FinishName, {
  albedo: (ctx: CanvasRenderingContext2D, s: number) => void;
  rough: (ctx: CanvasRenderingContext2D, s: number) => void;
  height: (ctx: CanvasRenderingContext2D, s: number) => void;
  strength: number;
}> = {
  // Machined gunmetal: brushed streaks + light edge wear.
  metal: {
    albedo: (c, s) => { _grain(c, s, 246, 7, true); _scratches(c, s, 26, (a) => `rgba(255,255,255,${a})`, 46); },
    rough:  (c, s) => { _grain(c, s, 228, 26, true); _scratches(c, s, 26, (a) => `rgba(150,150,150,${a + 0.12})`, 46); },
    height: (c, s) => { _grain(c, s, 128, 10, true); _scratches(c, s, 26, (a) => `rgba(96,96,96,${a})`, 46); },
    strength: 1.6,
  },
  // Beaten service metal — heavier, longer scratches and blotchy wear. Shotgun,
  // minigun: the guns that read as abused hardware.
  metal_worn: {
    albedo: (c, s) => { _grain(c, s, 240, 11, true); _scratches(c, s, 58, (a) => `rgba(255,255,255,${a})`, 78); _mottle(c, s, 14, 26, 0.10); },
    rough:  (c, s) => { _grain(c, s, 214, 34, true); _scratches(c, s, 58, (a) => `rgba(140,140,140,${a + 0.16})`, 78); },
    height: (c, s) => { _grain(c, s, 128, 16, true); _scratches(c, s, 58, (a) => `rgba(86,86,86,${a + 0.1})`, 78); },
    strength: 2.1,
  },
  // Cold-blued precision steel — near-flawless, faint mottle, very few marks.
  // Pistol slide and sniper receiver: the guns that read as cared-for.
  metal_blued: {
    albedo: (c, s) => { _grain(c, s, 250, 5, true); _mottle(c, s, 20, 34, 0.07); _scratches(c, s, 9, (a) => `rgba(255,255,255,${a * 0.7})`, 30); },
    rough:  (c, s) => { _grain(c, s, 238, 15, true); _mottle(c, s, 20, 34, 0.12); },
    height: (c, s) => { _grain(c, s, 128, 6, true); },
    strength: 1.1,
  },
  // Injection-moulded polymer stipple — matte and grippy, not dead flat plastic.
  polymer: {
    albedo: (c, s) => _grain(c, s, 245, 9, false),
    rough:  (c, s) => _grain(c, s, 238, 16, false),
    height: (c, s) => _grain(c, s, 128, 22, false),
    strength: 3.2,
  },
  // Coarse checkered polymer — launcher shell, aggressive grip texture.
  polymer_rough: {
    albedo: (c, s) => { _grain(c, s, 242, 13, false); _mottle(c, s, 10, 20, 0.08); },
    rough:  (c, s) => _grain(c, s, 230, 24, false),
    height: (c, s) => _grain(c, s, 128, 38, false),
    strength: 4.0,
  },
  // Oiled walnut furniture.
  wood: {
    albedo: (c, s) => { _grain(c, s, 242, 10, true); _woodGrain(c, s, 0.5); },
    rough:  (c, s) => { _grain(c, s, 232, 18, true); _woodGrain(c, s, 0.6); },
    height: (c, s) => { _grain(c, s, 128, 12, true); _woodGrain(c, s, 0.7); },
    strength: 2.2,
  },
};

/**
 * Lazily bake (and then share) a finish.
 *
 * All finish textures sit at repeat (1,1) — uvScale() bakes world texel density
 * into the geometry's UVs instead, which is what makes a 0.3-unit rail and a
 * 6-unit barrel finally agree.
 */
function _getFinish(name: FinishName): FinishMaps {
  const hit = _finishes.get(name);
  if (hit) return hit;
  const spec = _FINISH_SPECS[name];
  // 256 for height: at 128 the Sobel has too little to work with and the normal
  // map comes out mushy rather than detailed.
  const heightCanvas = bakeCanvas(256, spec.height);
  const maps: FinishMaps = {
    albedo: bakeTex(256, 1, true, spec.albedo),
    rough: bakeTex(256, 1, false, spec.rough),
    normal: heightToNormal(heightCanvas, spec.strength),
  };
  _finishes.set(name, maps);
  return maps;
}

/**
 * Per-finish normalMap intensity. SHARED Vector2 instances — three reads these
 * per-draw and never mutates them, so one object per finish is correct and
 * avoids an allocation per cached material.
 */
const _NORMAL_SCALE: Record<FinishName, THREE.Vector2> = {
  metal:         new THREE.Vector2(0.75, 0.75),
  metal_worn:    new THREE.Vector2(1.05, 1.05),
  metal_blued:   new THREE.Vector2(0.45, 0.45),
  polymer:       new THREE.Vector2(0.95, 0.95),
  polymer_rough: new THREE.Vector2(1.25, 1.25),
  wood:          new THREE.Vector2(0.85, 0.85),
};

// CONTACT / CAVITY AO
//
// The post chain has no depth-based AO (no SSAO/GTAO pass), which is a large
// part of why assembled primitives read as "floating parts": every crevice —
// trigger guard, magwell, rail slots, between fingers and grip — has zero
// occlusion darkening.
//
// A real GTAO pass was rejected: it needs a depth+normal prepass bolted onto a
// chain that is null on low presets, and the viewmodel sits at a wildly
// different depth scale from the world, so a radius tuned for a 6-unit gun at
// half a metre haloes the scenery behind it. Baked vertex-colour AO was also
// rejected: vertexColors is a MATERIAL-level flag and these materials are
// shared across parts and weapons, so it would be all-or-nothing and add
// USE_COLOR to every variant, plus ~1M build-time raycasts — precisely the
// stall the rig cache exists to avoid.
//
// Instead: sample the height already packed into the normal map's alpha and
// darken by it. Four instructions, same sampler, no new binding.
//
// customProgramCacheKey is LOAD-BEARING. Without it three must assume every
// material with an onBeforeCompile is potentially a distinct program, and the
// variant count goes from one to ~30 — which would break the warmup guarantee
// that stage 4 pre-compiles everything by cycling the weapons once.
const _GUN_CAVITY_OBC = (shader: { fragmentShader: string }) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_begin>',
    `#ifdef USE_NORMALMAP
      // Alpha of the normal map is the source height field: low = crevice.
      float _cav = texture2D( normalMap, vNormalMapUv ).a;
      diffuseColor.rgb *= mix( 1.0, 0.55 + 0.45 * _cav, 0.85 );
    #endif
    #include <lights_fragment_begin>`,
  );
};

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

// RELOAD CHOREOGRAPHY
//
// Every weapon reloads with its OWN hand-authored sequence of mechanical beats
// (see the animate*Reload methods). Each beat emits a cue at the exact frame
// the part it describes makes contact, so the audio is locked to the animation
// by construction rather than by a single sound fired at reload start.
//
// App maps these to synthesized mechanism sounds (see SoundManager) — the
// GunModel itself stays audio-agnostic.
export type ReloadCue =
  // Detachable-magazine weapons (pistol / rifle / SMG / sniper)
  | 'mag_release'   // the catch is pressed
  | 'mag_out'       // the empty magazine breaks free of the well
  | 'mag_drop'      // ...and lands on the ground a moment later
  | 'mag_in'        // the fresh magazine seats and the catch snaps over it
  | 'mag_tug'       // the tug-test that confirms it's locked
  | 'slide_release' // pistol slide stop thumbed off; the slide runs forward
  | 'bolt_rack'     // charging handle pulled and released into battery
  // Bolt-action (sniper) — the handle is worked in four distinct motions
  | 'bolt_lift' | 'bolt_back' | 'bolt_forward' | 'bolt_lock'
  // Shell-fed (shotgun)
  | 'shell_insert'  // one shell thumbed past the loading gate (index = which)
  | 'pump_rack'     // the forend cycled at the end
  // Belt-fed (minigun)
  | 'cover_open' | 'belt_feed' | 'cover_close' | 'spin_up'
  // Muzzle-loaded (launcher)
  | 'rocket_lift' | 'rocket_slide' | 'rocket_seat' | 'pin_pull'
  // Chip cartridge (subverter)
  | 'cartridge_out' | 'cartridge_in' | 'chip_seat' | 'deck_boot'
  // Tactical reload only — the partial magazine is pouched, not dumped
  | 'mag_stow';

/**
 * Which reload a weapon plays. Real shooters do not reload the same way twice:
 * running a weapon completely dry locks the action open and forces a slower,
 * uglier drill, while topping up with rounds still in the gun is a smooth
 * exchange that keeps the chambered round.
 *
 *  • `dry`      — fired to empty. The action is locked back, the empty magazine
 *                 is DUMPED on the ground, and the bolt/slide has to be
 *                 released at the end to chamber a round. Slowest and loudest.
 *  • `tactical` — rounds still in the magazine. The chamber is still loaded, so
 *                 there is NO action cycling at all; the partial magazine is
 *                 stripped and RETAINED (stowed in a pouch, not thrown away).
 *                 Noticeably quicker — reloading early is rewarded.
 *
 * `panic` is a separate 0..1 intensity layered on TOP of either, so a hurt
 * player fumbling an empty reload and a hurt player topping up are both
 * expressible. It adds tremor and a hitch mid-insert.
 */
export type ReloadStyle = 'dry' | 'tactical';

/**
 * Physical props that only exist during a reload. They're built ONCE with the
 * weapon's rig (hidden at rest) rather than allocated per reload — a reload is
 * a hot, frequent action and spawning meshes mid-fight would both churn the GC
 * and risk a first-use shader stall. Every prop material comes from the shared
 * `mat()` cache, so they add no new shader program to compile.
 */
interface ReloadProps {
  spentMag: THREE.Object3D | null;     // stripped magazine, falls under gravity
  freshMag: THREE.Object3D | null;     // replacement carried up into the well
  shell: THREE.Object3D | null;        // shotgun: shell on its way to the port
  ejectedShell: THREE.Object3D | null; // shotgun: hull kicked clear by the pump
  loadRocket: THREE.Object3D | null;   // launcher: rocket rammed down the tube
  seatedRocket: THREE.Object3D | null; // launcher: the rocket once it's loaded
  feedCover: THREE.Object3D | null;    // minigun: hinged cover over the feed
  belt: THREE.Object3D | null;         // minigun: the belt of linked rounds
  beltLinks: THREE.Object3D[];         // minigun: each link, fed in one by one
  drum: THREE.Object3D | null;         // minigun: ammo drum (unlatches + rocks)
  spentCart: THREE.Object3D | null;    // subverter: ejected chip cartridge
  freshCart: THREE.Object3D | null;    // subverter: replacement cartridge
  /** Model-space point the magazine seats into (drives both mag props). */
  well: { x: number; y: number; z: number };
  /**
   * Where a carried item sits in the support hand while that hand is down at
   * the pouch. Derived from the weapon's support grip at build time — the live
   * `supportGrip` field belongs to whichever rig was built LAST, so it can't be
   * read during animation.
   */
  hold: { x: number; y: number; z: number };
}

const emptyReloadProps = (): ReloadProps => ({
  spentMag: null, freshMag: null, shell: null, ejectedShell: null,
  loadRocket: null, seatedRocket: null, feedCover: null, belt: null,
  beltLinks: [], drum: null, spentCart: null, freshCart: null,
  well: { x: 0, y: 0, z: 0 },
  hold: { x: 0, y: -4, z: 0 },
});

/** One intrusion chip on the Subverter deck (see subChips below). */
interface SubChip {
  group: THREE.Group;
  core: THREE.MeshStandardMaterial;
  glow: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  baseY: number;
  baseZ: number;
  offset: number;
  target: number;
  flash: number;
}

/**
 * A fully-built weapon model plus every per-weapon ref the animation system
 * drives. Rigs are built ONCE per weapon and cached for the whole session —
 * a weapon switch is then a pure detach/attach of the cached root instead of
 * the old dispose-and-rebuild of ~150 meshes/geometries, which made every
 * switch pay a build + GPU re-upload + GC cost (and, on a cold shader cache,
 * a first-render program link stall).
 */
interface WeaponRig {
  root: THREE.Group;
  magazine: THREE.Mesh | null;
  slide: THREE.Mesh | null;
  // An Object3D, not a Mesh: the sniper's bolt is a pivot GROUP so its handle
  // can rotate about the bore axis (lift / lock) as well as translate.
  bolt: THREE.Object3D | null;
  /**
   * Empty marker at the weapon's actual BORE EXIT.
   *
   * The muzzle flash used to be spawned at `gunModel.group`'s world position —
   * i.e. the viewmodel root at basePosition {0.3,-0.3,-0.5} — which is not the
   * muzzle of any weapon in the game. On the sniper (11-unit barrel) the flash
   * detonated roughly 1.7 world units BEHIND the barrel tip, and the smoke
   * puff with it. Anchoring an empty here lets the effect follow every recoil,
   * sway, ADS and reload pose for free, because it's parented into the rig.
   */
  muzzle: THREE.Object3D | null;
  reload: ReloadProps;
  spinningPart: THREE.Group | null;
  triggerHandGroup: THREE.Group | null;
  supportHandGroup: THREE.Group | null;
  slideRest: number;
  boltRest: number;
  magRestY: number;
  aimPosition: { x: number; y: number; z: number };
  subScreenMat: THREE.MeshStandardMaterial | null;
  subEmitterMat: THREE.MeshStandardMaterial | null;
  subCodeMats: THREE.MeshStandardMaterial[];
  subAntennaTip: THREE.Mesh | null;
  subChips: SubChip[];
  subScreenTex: THREE.CanvasTexture | null;
  subScreenCtx: CanvasRenderingContext2D | null;
  subLoaded: number;
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
  bolt: THREE.Object3D | null = null;

  /**
   * Fired at the exact frame each mechanical beat of a reload makes contact
   * (see ReloadCue). App wires this to the SoundManager so every clack, scrape
   * and slam is locked to the part that produced it. `index` disambiguates
   * repeated beats — which shell, which chip.
   */
  onReloadCue: ((cue: ReloadCue, index: number) => void) | null = null;

  // Rest positions for animated parts (set per weapon)
  private slideRest: number = -1.5;
  private boltRest: number = 0.5;
  private magRestY: number = -1;

  // Spinning part (minigun barrel cluster)
  private spinningPart: THREE.Group | null = null;

  // Bore-exit marker for the active weapon (see WeaponRig.muzzle).
  private muzzleAnchor: THREE.Object3D | null = null;

  // ── Subverter (hacking deck) animated parts ──
  // The screen and emitter glow are driven per-frame: an idle data-scroll
  // flicker, and a bright surge when a chip is deployed. These materials are
  // created NON-cached (per build) so we can animate emissiveIntensity freely
  // without touching the shared gun-material pool. subDeploy is a one-shot
  // 1→0 envelope set by triggerDeploy() (the "fire a chip" flourish).
  private subScreenMat: THREE.MeshStandardMaterial | null = null;
  private subEmitterMat: THREE.MeshStandardMaterial | null = null;
  private subCodeMats: THREE.MeshStandardMaterial[] = [];
  private subAntennaTip: THREE.Mesh | null = null;
  private subTime = 0;
  private subDeploy = 0;
  // Live, animated screen + emitter-core materials carry a canvas "code-rain"
  // texture that scrolls each frame for a believable hacking-deck display.
  private subScreenTex: THREE.CanvasTexture | null = null;
  private subScreenCtx: CanvasRenderingContext2D | null = null;
  private subScreenScroll = 0;
  // Build-time only: the tilted deck group, so addReloadProps can hang the
  // chip cartridge off it. Never read after the rig is built.
  private subDeck: THREE.Group | null = null;
  // Per-chip rig: each intrusion chip can eject (fired → flies into the emitter
  // and vanishes) and re-insert (reload → slams back into its slot). `offset`
  // 0 = fully seated, 1 = gone; `target` is what it eases toward; `flash` is a
  // transient core flare on eject/seat. `subLoaded` mirrors the live ammo so
  // updateSubverterAmmo only triggers a transition when the count actually moves.
  private subChips: SubChip[] = [];
  private subLoaded = 0;
  private subReloadGlow = 0; // 0..1 reload "scanning" wash over the deck
  private subEmitterCharge = 0; // 0..1 emitter spin-up while a chip seats into it
  // After a reload completes the chips are visually full, but App may take a
  // frame or two to push the live ammo back to max. This grace window stops
  // updateSubverterAmmo from instantly re-ejecting the freshly-loaded chips
  // during that gap (it only allows the count to RISE while grace is active).
  private subReloadGrace = 0;

  // ── Animated first-person hand groups ──
  // Captured so the reload routine can drive a believable manual reload: the
  // support hand drops to the magazine well, swaps the mag (or thumbs shells
  // into a shotgun, or a chip cartridge into the deck), then racks the action.
  private triggerHandGroup: THREE.Group | null = null;
  private supportHandGroup: THREE.Group | null = null;
  private triggerHandRest = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
  private supportHandRest = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };

  // Reload pacing — the whole animation fills the *actual* reload time so the
  // hands work the weapon for the entire window instead of snapping done in
  // ~0.5s. reloadDuration is the wall-clock length (seconds) handed in by the
  // caller; reloadShells is how many discrete "load" beats a shell-fed reload
  // (shotgun) plays across that window.
  private reloadDuration = 0.5;
  private reloadShells = 8;
  // Which drill this reload is running, and how rattled the operator is.
  // See ReloadStyle — `dry` dumps the magazine and cycles the action, while
  // `tactical` retains it and skips the action entirely.
  private reloadStyle: ReloadStyle = 'dry';
  private reloadPanic = 0;
  private panicTime = 0;

  // ── Per-weapon reload state ──────────────────────────────────────────────
  // Props (spare magazines, shells, rockets, belts) built with the rig and
  // driven along authored paths by the per-weapon choreographies.
  private rp: ReloadProps = emptyReloadProps();
  // Cues already emitted this reload, so each beat sounds exactly once even
  // when an active-reload fast-forward skips the playhead past several at once.
  private firedCues = new Set<string>();
  // Free-falling discarded magazine — integrated in model space so it tumbles
  // out of frame with real weight instead of blinking out of existence.
  private magFall = {
    active: false, landed: false,
    y: 0, z: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0,
  };
  // Minigun only: overrides the barrel-cluster spin rate while reloading
  // (spin down to a dead stop for the feed job, then wind back up). <0 = off.
  private reloadSpin = -1;

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
  // Full 6-DOF working posture for the reload. Each weapon writes its own here
  // every frame (a pistol rolls the well up to the hand, a shotgun turns its
  // loading port skyward, a launcher tips the tube mouth into reach) instead of
  // every gun sharing one canned dip + roll.
  private reloadPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  private reloadDip: number = 0; // master ease-in/hold/ease-out envelope (0..1)

  // ── WEAPON INERTIA (the thing that makes a gun feel like it has mass) ──
  // The weapon is modelled as a mass on a spring anchored to the camera. When
  // the view turns, the gun does NOT turn with it — it keeps pointing where it
  // was and the spring hauls it back, overshooting slightly before it settles.
  // That lag-and-settle is the single strongest weight cue in a first-person
  // weapon, and without it even a well-modelled gun reads as a prop welded to
  // the camera. `swing` is the angular offset (radians) still owed to the
  // camera; `swingVel` its velocity.
  private swing = { yaw: 0, pitch: 0 };
  private swingVel = { yaw: 0, pitch: 0 };
  // Live mass of the equipped weapon, mirrored from WEAPONS[].weight by App
  // (single source of truth). Drives spring stiffness, sway/bob amplitude,
  // how fast the weapon comes up to the shoulder, and landing recovery —
  // everything that separates a 1kg sidearm from a 30kg rotary cannon.
  private weaponMass = 1;

  // Jump / fall weapon inertia + landing dip
  private jumpOffset = { y: 0, rotX: 0 };
  private wasAirborne = false;
  private landAnim = 0;
  // One-shot action flourishes (1 = just triggered, decays to 0)
  private abilityAnim = 0;
  private dashAnim = 0;
  // One-shot melee strike — 1 on trigger, decays in updateActions (~0.36s).
  // applyAnimations reads it as a three-phase WINDUP → STRIKE → RECOVER
  // choreography with a per-weapon pose pair (see MELEE_POSES), so every
  // light weapon has its own distinct, readable bash.
  private meleeAnim = 0;
  // Engineer "wire the bomb" pose — while ON, the gun dips low and tucks across
  // the body as if the free hand is working at the barrel. Smoothed toward
  // `wiringTarget` in updateActions so the bend eases in and out.
  private wireAnim = 0;
  private wiringTarget = 0;
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

  // ── Session-long weapon rig cache ──
  // Each weapon's built model + animated-part refs, keyed by type. Built the
  // first time a weapon is equipped (in practice during the loader's warmup
  // cycle, which switches through every weapon) and reused forever after —
  // see WeaponRig above for why. Disposed only via disposeAllRigs().
  private rigs = new Map<WeaponType, WeaponRig>();
  private activeRig: WeaponRig | null = null;

  constructor(type: WeaponType) {
    this.group = new THREE.Group();
    this.currentWeaponType = type;
    this.createGunModel(type);
  }

  /**
   * A CHAMFERED box — the single biggest fix for "blocky".
   *
   * Every part of every weapon used to be a raw BoxGeometry: perfectly sharp
   * 90° edges that catch no light. That is exactly what makes a model read as
   * a stack of toy bricks rather than machined hardware — real receivers,
   * frames and grips all have broken edges, and the thin bright chamfer line
   * running along them is most of what the eye reads as "metal".
   *
   * Extruded so the corners round within the extrusion plane and the bevel
   * breaks the edges front and back, giving every silhouette a soft highlight
   * instead of a hard corner. Falls back to a plain box for parts too small
   * for a chamfer to survive.
   *
   * Geometry is deliberately NOT shared between rigs: disposeAllRigs frees
   * each rig's buffers, so a cache would free geometry another rig still draws.
   */
  private cbox(w: number, h: number, d: number, chamfer = 0.05): THREE.BufferGeometry {
    const b = Math.min(chamfer, w * 0.3, h * 0.3, d * 0.3);
    if (b <= 0.005) return new THREE.BoxGeometry(w, h, d);
    // Extrude inflates the shape by bevelSize on every side, so the profile is
    // inset by the bevel to land on the requested outer dimensions.
    const W = w - 2 * b, H = h - 2 * b, D = d - 2 * b;
    const r = Math.max(0.002, Math.min(b * 1.7, W * 0.45, H * 0.45));
    const s = new THREE.Shape();
    const x0 = -W / 2, y0 = -H / 2;
    s.moveTo(x0 + r, y0);
    s.lineTo(x0 + W - r, y0);
    s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + r);
    s.lineTo(x0 + W, y0 + H - r);
    s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - r, y0 + H);
    s.lineTo(x0 + r, y0 + H);
    s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - r);
    s.lineTo(x0, y0 + r);
    s.quadraticCurveTo(x0, y0, x0 + r, y0);
    // bevelSegments 1 → 2 and curveSegments 2 → 3 on the LARGE parts only
    // (receivers, grips, hands — the things filling a third of the screen). A
    // single-facet bevel still reads as a hard corner at viewmodel distance;
    // two segments roll the highlight properly. Small parts keep the cheap
    // single facet — the difference is invisible on a 0.2-unit rail slot, and
    // there are far more of those. Rigs are cached for the session, so the
    // extra vertices are paid once per weapon, never per frame.
    const big = w > 0.6 || h > 0.6;
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: D,
      bevelEnabled: true, bevelSize: b, bevelThickness: b,
      bevelSegments: big ? 2 : 1,
      curveSegments: big ? 3 : 2,
      steps: 1,
    });
    // Extrude runs 0..depth along +Z; recentre it on the part's own origin.
    geo.translate(0, 0, -D / 2);
    return geo;
  }

  /**
   * Rewrite a part's UVs to a CONSTANT WORLD TEXEL DENSITY.
   *
   * The rig mixes three geometry sources with three incompatible UV
   * conventions, which is why the shared finish maps used to read at a
   * different scale on almost every part of the same gun:
   *
   *   • BoxGeometry     — 0..1 per face. A 0.3-unit rail and a 6-unit barrel
   *                       each get exactly one tile.
   *   • cbox()          — ExtrudeGeometry's default WorldUVGenerator emits
   *                       OBJECT-SPACE coordinates: roughly world-scaled, i.e.
   *                       the opposite convention to the above.
   *   • CylinderGeometry— (angle, height) normalised, so a long thin barrel
   *                       smears the noise ~20:1 along its length.
   *
   * Fix: per-vertex triplanar assignment. Pick the dominant axis of each
   * vertex normal and derive UV from the two remaining world axes, scaled by
   * a single global density knob. Box faces, extrude caps and cylinder walls
   * then all agree, and every finish texture can sit at repeat (1,1).
   *
   * Cheap: runs once per part at rig-build time, and rigs are cached for the
   * whole session. Idempotent via userData.uvScaled. Mutating in place is safe
   * precisely because cbox() geometry is deliberately not shared (see above).
   */
  private uvScale(geo: THREE.BufferGeometry, texelsPerUnit = 0.55): THREE.BufferGeometry {
    if (geo.userData.uvScaled) return geo;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!pos || !nrm) return geo;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let u: number, v: number;
      if (ax >= ay && ax >= az)      { u = pz; v = py; } // facing ±X → project ZY
      else if (ay >= ax && ay >= az) { u = px; v = pz; } // facing ±Y → project XZ
      else                           { u = px; v = py; } // facing ±Z → project XY
      uv[i * 2]     = u * texelsPerUnit;
      uv[i * 2 + 1] = v * texelsPerUnit;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.userData.uvScaled = true;
    return geo;
  }

  /**
   * Mark the weapon's bore exit. Each create* method calls this once with the
   * front face of its muzzle device (flash hider / brake / choke / tube mouth).
   *
   * An empty Object3D, not a mesh: it costs nothing to draw and, because it is
   * parented into the rig, it inherits every recoil kick, sway, ADS blend and
   * reload pose automatically. The alternative — recomputing a muzzle offset in
   * App each shot — would drift out of sync the moment an animation moved.
   */
  private setMuzzle(x: number, y: number, z: number): void {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    this.group.add(anchor);
    this.muzzleAnchor = anchor;
  }

  /**
   * World position of the active weapon's bore exit, written into `out`.
   * Falls back to the viewmodel root for any weapon without an anchor (the
   * Subverter, which never fires a bullet). Returns `out` for chaining.
   */
  getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.muzzleAnchor) return this.muzzleAnchor.getWorldPosition(out);
    return this.group.getWorldPosition(out);
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
    // Single choke point: every part of every weapon goes through here, so one
    // call normalises texel density across the entire rig.
    const m = new THREE.Mesh(this.uvScale(geo), mat);
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
    finishOverride?: FinishName,
  ): THREE.MeshStandardMaterial {
    // Procedural finish — metal-family parts (receivers, slides, barrels) get
    // the brushed/worn machining maps, softer parts the polymer stipple, and
    // furniture can explicitly ask for wood grain. Derived from metalness when
    // not overridden; the resolved name is folded into the cache key, so the
    // six finishes cost cache entries but ZERO extra shader programs.
    const finishName: FinishName = finishOverride ?? (metalness >= 0.55 ? 'metal' : 'polymer');
    const key = `${_matKey(color, metalness, roughness, extra)}:${finishName}`;
    const cached = _gunMaterialCache.get(key);
    if (cached) return cached;
    const finish = _getFinish(finishName);
    const fresh = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      map: finish.albedo,
      roughnessMap: finish.rough,
      normalMap: finish.normal,
      normalScale: _NORMAL_SCALE[finishName],
      // Lifted from 1.1 → 1.25: the viewmodel catches a touch more of the
      // sky/sun environment (IBL), so the metal reads crisper and more premium
      // and sunlight glints across it as the day cycle turns — without the
      // grazing-fresnel washout that only afflicts the big ground plane.
      envMapIntensity: 1.25,
      ...extra,
    });
    // Crevice darkening from the normal map's height alpha. Shared function +
    // constant cache key ⇒ exactly ONE extra shader program for the whole rig.
    fresh.onBeforeCompile = _GUN_CAVITY_OBC;
    fresh.customProgramCacheKey = () => 'gunCavity';
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

  /**
   * A see-through optic body with REAL wall thickness.
   *
   * The scopes used to be bare `openEnded` cylinders. An open-ended cylinder
   * only has outward-facing triangles, so with normal front-face culling the
   * far wall is thrown away and you look straight through the side of the
   * tube — which is exactly why the optics read as "cut off". A single-surface
   * tube also has no rim, so a lens capping it appeared to float on nothing.
   *
   * This builds a proper shell: an outer wall, an inner bore you actually see
   * down the side, and annular rims closing the wall at both ends — while
   * leaving the optical path clear so the weapon can still be aimed through it.
   *
   * The bore runs along Z, `frontR` is the −Z (muzzle-ward) radius and `rearR`
   * the +Z one, so tapering a bell the right way round is explicit. Returned
   * centred on its own origin; `mat` must be double-sided.
   */
  private opticShell(
    mat: THREE.Material,
    frontR: number, rearR: number, wall: number, len: number, seg = 20,
  ): THREE.Group {
    const g = new THREE.Group();
    const bore = (r: number) => Math.max(0.02, r - wall);
    // CylinderGeometry's radiusTop sits at local +Y, which this X-rotation puts
    // at +Z — the REAR. Passing rear first is what keeps bells flaring correctly.
    const shell = (rf: number, rr: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rr, rf, len, seg, 1, true), mat);
      m.rotation.x = Math.PI / 2;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    };
    shell(frontR, rearR);
    shell(bore(frontR), bore(rearR));
    // Rims close the gap between the two walls so the tube has visible edge
    // thickness — a ring already faces ±Z, so no rotation is needed.
    const rimF = new THREE.Mesh(new THREE.RingGeometry(bore(frontR), frontR, seg), mat);
    rimF.position.z = -len / 2;
    g.add(rimF);
    const rimR = new THREE.Mesh(new THREE.RingGeometry(bore(rearR), rearR, seg), mat);
    rimR.position.z = len / 2;
    g.add(rimR);
    return g;
  }

  /** Place an optic shell at `y`, spanning `zFront`..`zRear`, on the model. */
  private addOptic(
    mat: THREE.Material, y: number, zFront: number, zRear: number,
    frontR: number, rearR: number, wall: number, seg = 20,
  ): THREE.Group {
    const g = this.opticShell(mat, frontR, rearR, wall, zRear - zFront, seg);
    g.position.set(0, y, (zFront + zRear) / 2);
    this.group.add(g);
    return g;
  }

  private createGunModel(type: WeaponType) {
    // Stow whatever is currently equipped (parts snapped back to rest, root
    // detached). Nothing is disposed — every built rig is cached for the
    // session, so switching BACK to a weapon is a pure attach.
    this.stowActiveRig();

    const cached = this.rigs.get(type);
    if (cached) {
      this.attachRig(cached);
      return;
    }

    // ── First equip of this weapon: build its rig once ──
    // The create* methods add parts via `this.group`, so point that at the
    // rig's own root for the duration of the (synchronous) build. The outer
    // group — the camera-parented handle App animates — is restored right
    // after, before anything can render the half-built state.
    const outer = this.group;
    const root = new THREE.Group();
    this.group = root;

    // Reset every per-build field the create methods write into.
    this.magazine = null;
    this.slide = null;
    this.bolt = null;
    this.spinningPart = null;
    this.muzzleAnchor = null;
    this.subScreenMat = null;
    this.subEmitterMat = null;
    this.subCodeMats = [];
    this.subAntennaTip = null;
    this.subDeploy = 0;
    this.subScreenTex = null;
    this.subScreenCtx = null;
    this.subChips = [];
    this.subLoaded = 0;
    this.subReloadGlow = 0;
    this.subEmitterCharge = 0;
    this.subReloadGrace = 0;
    this.subDeck = null;
    this.triggerHandGroup = null;
    this.supportHandGroup = null;
    this.rp = emptyReloadProps();
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
      case 'subverter': this.createSubverter(); break;
    }

    // Reload hardware (spare mags, shells, rockets, belts) — built with the
    // rig and parked hidden, so a reload never allocates.
    this.addReloadProps(type);

    // Attach the first-person arms last, so they sit on top of the weapon.
    this.addArms();

    this.group = outer;

    const rig: WeaponRig = {
      root,
      magazine: this.magazine,
      slide: this.slide,
      bolt: this.bolt,
      muzzle: this.muzzleAnchor,
      reload: this.rp,
      spinningPart: this.spinningPart,
      triggerHandGroup: this.triggerHandGroup,
      supportHandGroup: this.supportHandGroup,
      slideRest: this.slideRest,
      boltRest: this.boltRest,
      magRestY: this.magRestY,
      aimPosition: this.aimPosition,
      subScreenMat: this.subScreenMat,
      subEmitterMat: this.subEmitterMat,
      subCodeMats: this.subCodeMats,
      subAntennaTip: this.subAntennaTip,
      subChips: this.subChips,
      subScreenTex: this.subScreenTex,
      subScreenCtx: this.subScreenCtx,
      subLoaded: this.subLoaded,
    };
    this.rigs.set(type, rig);
    this.attachRig(rig);
  }

  /**
   * Snap the active rig's animated parts back to rest and detach its root.
   * The rig stays cached (and its live Subverter chip count is written back)
   * so re-equipping it later is instant and picks up where it left off.
   */
  private stowActiveRig() {
    const rig = this.activeRig;
    if (!rig) return;
    // A reload can't normally span a switch (App gates switching on
    // !isReloading) — this is a belt-and-braces reset so a stowed rig can
    // never come back mid-reload-pose.
    if (this.isReloading) this.finishReload();
    if (rig.magazine) {
      rig.magazine.position.y = rig.magRestY;
      rig.magazine.rotation.x = 0;
      rig.magazine.rotation.z = 0;
      rig.magazine.visible = true;
    }
    if (rig.slide) rig.slide.position.z = rig.slideRest;
    if (rig.bolt) {
      rig.bolt.position.z = rig.boltRest;
      rig.bolt.rotation.set(0, 0, 0);
    }
    // Park every reload prop back out of sight. finishReload() above already
    // did this for the LIVE refs; this covers a rig stowed while idle.
    this.parkReloadProps(rig.reload);
    if (rig.triggerHandGroup) {
      rig.triggerHandGroup.position.set(0, 0, 0);
      rig.triggerHandGroup.rotation.set(0, 0, 0);
    }
    if (rig.supportHandGroup) {
      rig.supportHandGroup.position.set(0, 0, 0);
      rig.supportHandGroup.rotation.set(0, 0, 0);
    }
    for (const chip of rig.subChips) chip.flash = 0;
    rig.subLoaded = this.subLoaded;
    rig.root.visible = true; // never stow a rig in its scoped-away state
    this.group.remove(rig.root);
    this.activeRig = null;
  }

  /** Attach a cached rig and restore every per-weapon ref the animators drive. */
  private attachRig(rig: WeaponRig) {
    this.activeRig = rig;
    // A rig stowed while the player was scoped would come back invisible.
    rig.root.visible = true;
    this.group.add(rig.root);
    this.magazine = rig.magazine;
    this.slide = rig.slide;
    this.bolt = rig.bolt;
    this.muzzleAnchor = rig.muzzle;
    this.rp = rig.reload;
    this.spinningPart = rig.spinningPart;
    this.triggerHandGroup = rig.triggerHandGroup;
    this.supportHandGroup = rig.supportHandGroup;
    this.slideRest = rig.slideRest;
    this.boltRest = rig.boltRest;
    this.magRestY = rig.magRestY;
    this.aimPosition = rig.aimPosition;
    this.subScreenMat = rig.subScreenMat;
    this.subEmitterMat = rig.subEmitterMat;
    this.subCodeMats = rig.subCodeMats;
    this.subAntennaTip = rig.subAntennaTip;
    this.subChips = rig.subChips;
    this.subScreenTex = rig.subScreenTex;
    this.subScreenCtx = rig.subScreenCtx;
    this.subLoaded = rig.subLoaded;
    // One-shot surges never carry across a swap.
    this.subDeploy = 0;
    this.subReloadGlow = 0;
    this.subEmitterCharge = 0;
    this.subReloadGrace = 0;
    // No reload can be in flight across a swap (App gates switching on
    // !isReloading and stowActiveRig force-finishes anyway) — clear the
    // working posture so a fresh weapon never inherits the last one's cant.
    this.reloadPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    this.reloadDip = 0;
    this.reloadSpin = -1;
    this.magFall.active = false;
    // Arm wrappers rest at the origin (see addArms).
    this.triggerHandRest = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
    this.supportHandRest = { x: 0, y: 0, z: 0, rx: 0, ry: 0 };

    this.group.position.set(this.basePosition.x, this.basePosition.y, this.basePosition.z);
    this.group.scale.setScalar(this.baseScale);

    // Re-sync the attached model to the current cloak state so switching
    // weapons mid-Phantom never leaves a stale-transparent (or wrongly-solid)
    // weapon — the previous per-material approach leaked across the shared
    // material cache and got stuck on. See applyPhantomToCurrent().
    this.applyPhantomToCurrent();
  }

  /**
   * Free every cached rig's GPU resources (scene teardown only). Cached pool
   * materials (`userData.cached`) are shared across rigs + sessions and are
   * skipped — same rule the old per-switch dispose followed.
   */
  disposeAllRigs() {
    this.stowActiveRig();
    for (const rig of this.rigs.values()) {
      rig.root.traverse((obj) => {
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
      // Disposing a material never frees its texture — the Subverter's canvas
      // screen texture is per-rig, so free it explicitly.
      rig.subScreenTex?.dispose();
    }
    this.rigs.clear();
    this.group.clear();
    this.magazine = null;
    this.slide = null;
    this.bolt = null;
    this.spinningPart = null;
    this.muzzleAnchor = null;
    this.triggerHandGroup = null;
    this.supportHandGroup = null;
    this.subScreenMat = null;
    this.subEmitterMat = null;
    this.subCodeMats = [];
    this.subAntennaTip = null;
    this.subChips = [];
    this.subScreenTex = null;
    this.subScreenCtx = null;
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

  // PISTOL — compact tactical sidearm
  private createPistol() {
    this.slideRest = -1.5;
    this.magRestY = -1;

    // A cared-for sidearm: cold-blued slide and frame, near-flawless with only
    // faint holster wear, against a stippled polymer grip.
    const metal = this.mat(0x16181c, 0.95, 0.18, { envMapIntensity: 1.5 }, 'metal_blued');
    const gunmetal = this.mat(0x26282d, 0.9, 0.28, {}, 'metal_blued');
    const polymer = this.mat(0x0c0d10, 0.25, 0.85, { envMapIntensity: 0.5 });
    const accent = this.mat(0x111317, 0.85, 0.3, {}, 'metal_blued');

    // Slide (animated). Its bevel and serrations are PARENTED to it so they
    // reciprocate with it — the reload holds the slide locked to the rear for
    // most of its window, which would otherwise leave the slide sliding out
    // from under its own serrations in plain view.
    const slide = this.p(this.cbox(1, 0.72, 4.5, 0.09), gunmetal, 0, 0.8, this.slideRest);
    this.slide = slide;
    // Re-parent a part built in model space onto the slide, converting its
    // position into slide-local coordinates. Shadow flags are already set by p().
    const onSlide = (m: THREE.Mesh): THREE.Mesh => {
      this.group.remove(m);
      m.position.y -= 0.8;
      m.position.z -= this.slideRest;
      slide.add(m);
      return m;
    };
    // Slide top bevel
    onSlide(this.p(new THREE.BoxGeometry(0.62, 0.18, 4.2), metal, 0, 1.18, this.slideRest));

    // Rear slide serrations
    for (let i = 0; i < 7; i++) {
      onSlide(this.p(new THREE.BoxGeometry(1.04, 0.5, 0.12), metal, 0, 0.85, 0.2 - i * 0.22, false));
    }
    // Front slide serrations
    for (let i = 0; i < 5; i++) {
      onSlide(this.p(new THREE.BoxGeometry(1.04, 0.46, 0.1), metal, 0, 0.85, -2.7 - i * 0.22, false));
    }

    // Barrel + chamber
    const barrel = this.p(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16), metal, 0, 0.8, -4.5);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = this.p(new THREE.CylinderGeometry(0.35, 0.32, 0.32, 16), gunmetal, 0, 0.8, -5.35);
    muzzle.rotation.x = Math.PI / 2;
    const bore = this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 14), this.mat(0x000000, 1, 0.4), 0, 0.8, -5.45, false);
    bore.rotation.x = Math.PI / 2;
    this.setMuzzle(0, 0.8, -5.55); // front face of the muzzle collar

    // Frame / dust cover
    this.p(this.cbox(0.92, 0.55, 4.4, 0.07), polymer, 0, 0.28, -1.4);
    // Accessory rail under dust cover
    this.p(new THREE.BoxGeometry(0.7, 0.22, 1.4), accent, 0, -0.02, -2.9);

    // Grip — angled
    const grip = this.p(this.cbox(1.06, 2.5, 1.3, 0.11), polymer, 0, -0.6, 0.35);
    grip.rotation.x = 0.18;
    // Grip texture panels
    for (let i = 0; i < 5; i++) {
      this.p(new THREE.BoxGeometry(1.1, 0.16, 0.16), accent, 0, -0.1 - i * 0.42, 0.95, false);
      this.p(new THREE.BoxGeometry(1.1, 0.16, 0.16), accent, 0, -0.1 - i * 0.42, -0.25, false);
    }
    // Magazine baseplate
    this.p(this.cbox(1.16, 0.3, 1.4, 0.07), accent, 0, -1.95, 0.5);

    // Magazine (animated)
    this.magazine = this.p(this.cbox(0.8, 2, 0.95, 0.07), this.mat(0x1a1c20, 0.6, 0.4), 0, this.magRestY, 0.3);

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

  // RIFLE — modern assault carbine
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
    this.p(this.cbox(1.25, 0.88, 5.4, 0.08), receiver, 0, 0.5, -1.4);
    this.p(this.cbox(1.1, 1.15, 2.6, 0.08), receiver, 0, -0.32, 0.55);

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
    this.setMuzzle(0, 0.32, -8.95); // flash-hider mouth
    // Flash hider slots
    for (let i = 0; i < 4; i++) {
      const slot = this.p(new THREE.BoxGeometry(0.5, 0.08, 0.4), this.mat(0, 1, 0.5), 0, 0.32, -8.6, false);
      slot.rotation.z = (i / 4) * Math.PI;
    }

    // Handguard with M-LOK slots
    this.p(this.cbox(0.95, 0.85, 3.6, 0.08), polymer, 0, 0.05, -3);
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
    this.magazine = this.p(this.cbox(0.72, 2.05, 0.95, 0.07), polymer, 0, this.magRestY, 0.5);
    this.p(new THREE.BoxGeometry(0.76, 0.18, 1), black, 0, -2.7, 0.55, false); // floorplate

    // Pistol grip
    const grip = this.p(this.cbox(0.78, 1.7, 1, 0.09), polymer, 0, -1.05, 1.5);
    grip.rotation.x = 0.32;

    // Collapsible stock — buffer tube + cheek piece + buttpad
    const tube = this.p(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 12), black, 0, 0.35, 2.4);
    tube.rotation.x = Math.PI / 2;
    this.p(this.cbox(0.95, 1.05, 1.5, 0.09), polymer, 0, 0.3, 3.1);
    this.p(this.cbox(1, 1.3, 0.35, 0.07), black, 0, 0.25, 3.95, false); // buttpad

    // ── Red-dot optic ──
    // A proper tube sight: riser mount, hooded housing with real wall
    // thickness, adjustment turrets, battery cap and a rubber eyecup. The
    // optical path stays open so the weapon still aims through it.
    const OPTIC_Y = 1.95;
    const opticBody = this.mat(0x0b0c0f, 0.9, 0.22, { side: THREE.DoubleSide });
    // Riser mount + quick-detach throw lever
    this.p(this.cbox(0.62, 0.62, 1.0, 0.07), black, 0, 1.44, -1, false);
    this.p(new THREE.BoxGeometry(0.72, 0.16, 1.1), rail, 0, 1.16, -1, false);
    this.p(new THREE.BoxGeometry(0.2, 0.3, 0.44), black, 0.42, 1.3, -1, false);
    // Housing, front kill-flash hood and rear eyecup
    this.addOptic(opticBody, OPTIC_Y, -1.60, -0.50, 0.42, 0.42, 0.06);
    this.addOptic(opticBody, OPTIC_Y, -1.94, -1.60, 0.46, 0.46, 0.05);
    this.addOptic(opticBody, OPTIC_Y, -0.50, -0.26, 0.44, 0.44, 0.05);
    // Turrets: elevation on top, windage right, battery cap left
    this.p(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 12), black, 0, OPTIC_Y + 0.4, -0.86, false);
    this.p(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), rail, 0, OPTIC_Y + 0.57, -0.86, false);
    this.p(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 12), black, 0.4, OPTIC_Y, -0.86, false)
      .rotation.z = Math.PI / 2;
    this.p(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), rail, -0.4, OPTIC_Y, -0.86, false)
      .rotation.z = Math.PI / 2;
    // Lens sits INSIDE the bore (housing 0.42 − 0.06 wall = 0.36) rather than
    // overhanging the metal as a floating disc.
    const lens = this.p(
      new THREE.CircleGeometry(0.34, 18),
      this.glassMat(0x2a3a44),
      0, OPTIC_Y, -1.55, false,
    );
    lens.rotation.y = Math.PI;
    // Bright red dot floats on the clear glass — the actual aiming reticle
    this.p(
      new THREE.CircleGeometry(0.06, 12),
      new THREE.MeshBasicMaterial({ color: 0xff2222, toneMapped: false }),
      0, OPTIC_Y, -1.52, false,
    );

    // Flip-up backup sights
    this.p(new THREE.BoxGeometry(0.32, 0.4, 0.12), black, 0, 1.42, -4.6, false);

    // ── Angled foregrip at the support hand ──
    // The support hand used to close on bare air under the handguard; this
    // gives it something to actually hold, which is most of what makes a
    // first-person weapon read as gripped rather than floated.
    const fgrip = this.p(this.cbox(0.44, 0.95, 0.55, 0.08), polymer, 0, -0.72, -3.05);
    fgrip.rotation.x = -0.42;
    for (let i = 0; i < 3; i++) {
      this.p(new THREE.BoxGeometry(0.48, 0.09, 0.1), black, 0, -0.5 - i * 0.24, -3.15 - i * 0.1, false);
    }
    // Hand stop ahead of it so the grip reads as a deliberate hold position
    this.p(new THREE.BoxGeometry(0.5, 0.26, 0.3), black, 0, -0.4, -4.05, false);

    // Trigger hand on the pistol grip, support hand on the handguard
    this.triggerGrip = { x: 0.05, y: -0.7, z: 1.45 };
    this.supportGrip = { x: 0, y: -0.5, z: -3 };
  }

  // SHOTGUN — pump-action with wood furniture
  private createShotgun() {
    this.slideRest = -2.7; // pump rest Z (animated by updateRecoil)
    // The shotgun maps `magazine` to its shell carrier, which sits at y=-0.55 —
    // magRestY has to match, or every reset (reload end, weapon stow) yanks the
    // carrier down to a position it was never built at.
    this.magRestY = -0.55;

    // A working gun: beaten receiver and heat-scarred barrel over walnut.
    const steel = this.mat(0x202227, 0.85, 0.3, {}, 'metal_worn');
    const black = this.mat(0x0d0e11, 0.9, 0.22, {}, 'metal_worn');
    // Oiled walnut furniture — dedicated wood-grain finish maps, with a touch
    // of clear-coat sheen (low roughness for the varnish glint on the grain).
    const wood = this.mat(0x4a2f18, 0.15, 0.62, { envMapIntensity: 1.0 }, 'wood');
    const woodDark = this.mat(0x35210f, 0.15, 0.68, { envMapIntensity: 1.0 }, 'wood');

    // Receiver
    this.p(this.cbox(1.4, 1.5, 3, 0.09), steel, 0, 0.1, 0.4);
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
    this.setMuzzle(0, 0.55, -6.2); // choke mouth

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
    this.magazine = this.p(this.cbox(0.7, 0.4, 1.2, 0.07), this.mat(0x6b3410, 0.3, 0.5, {}, 'wood'), 0, this.magRestY, 0.6);

    // Trigger guard + trigger
    const guard = this.p(new THREE.TorusGeometry(0.52, 0.08, 8, 12, Math.PI), black, 0, -0.7, 0.3, false);
    guard.rotation.x = Math.PI / 2;
    this.p(new THREE.BoxGeometry(0.2, 0.6, 0.16), black, 0, -0.85, 0.1, false);

    // Wood stock + grip
    const grip = this.p(this.cbox(1, 1.7, 1.4, 0.11), wood, 0, -0.7, 1.8);
    grip.rotation.x = 0.4;
    this.p(this.cbox(1.2, 1.6, 2.6, 0.11), wood, 0, 0.05, 3.2);
    this.p(this.cbox(1.25, 1.7, 0.4, 0.08), woodDark, 0, 0.05, 4.5, false); // buttpad

    // Bead front sight
    this.p(new THREE.SphereGeometry(0.12, 8, 8), this.mat(0xffcc33, 0.3, 0.4, { emissive: 0x553300, emissiveIntensity: 0.4 }), 0, 1.05, -5.6, false);

    // Trigger hand on the grip, support hand on the pump
    this.triggerGrip = { x: 0.05, y: -0.45, z: 1.7 };
    this.supportGrip = { x: 0, y: -0.75, z: -2.7 };
  }

  // SMG — compact submachine gun
  private createSMG() {
    this.boltRest = 0.7;
    this.magRestY = -2;

    const body = this.mat(0x1a1c24, 0.7, 0.35);
    const black = this.mat(0x0a0b0e, 0.92, 0.16);
    const polymer = this.mat(0x101218, 0.3, 0.7);
    const accent = this.mat(0x2a3f5c, 0.6, 0.4, { emissive: 0x0a1830, emissiveIntensity: 0.3 });

    // Main receiver
    this.p(this.cbox(1.15, 1.5, 3.6, 0.09), body, 0, 0.2, -0.4);
    // Upper rounded shroud
    const shroud = this.p(new THREE.CylinderGeometry(0.45, 0.45, 3.4, 12), black, 0, 0.7, -1.7);
    shroud.rotation.x = Math.PI / 2;

    // Barrel poking out of shroud
    const barrel = this.p(new THREE.CylinderGeometry(0.2, 0.2, 4, 12), black, 0, 0.7, -2.4);
    barrel.rotation.x = Math.PI / 2;
    const muzzle = this.p(new THREE.CylinderGeometry(0.28, 0.24, 0.45, 10), black, 0, 0.7, -4.4);
    muzzle.rotation.x = Math.PI / 2;
    this.setMuzzle(0, 0.7, -4.65); // compensator mouth

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
    this.magazine = this.p(this.cbox(0.62, 2.4, 0.85, 0.06), polymer, 0, this.magRestY, -0.2);
    this.p(new THREE.BoxGeometry(0.66, 0.2, 0.9), black, 0, this.magRestY - 1.3, -0.2, false);

    // Vertical foregrip
    const fg = this.p(new THREE.CylinderGeometry(0.2, 0.18, 1.2, 10), polymer, 0, -0.8, -1.9);
    fg.rotation.x = 0.12;

    // Pistol grip
    const grip = this.p(this.cbox(0.72, 1.55, 0.95, 0.08), polymer, 0, -0.95, 1);
    grip.rotation.x = 0.34;

    // Folding stock — side struts + pad
    const strutL = this.p(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), black, -0.35, 0.45, 2.3, false);
    strutL.rotation.x = Math.PI / 2;
    const strutR = this.p(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), black, 0.35, 0.45, 2.3, false);
    strutR.rotation.x = Math.PI / 2;
    this.p(this.cbox(0.95, 1.1, 0.4, 0.08), polymer, 0, 0.4, 3.4, false);

    // Trigger hand on the grip, support hand on the vertical foregrip
    this.triggerGrip = { x: 0.05, y: -0.6, z: 0.95 };
    this.supportGrip = { x: 0, y: -1.15, z: -1.9 };
  }

  // SNIPER — bolt-action precision rifle with scope
  private createSniper() {
    this.boltRest = 1.4;
    this.magRestY = -1.4;
    // Bring the scope to screen centre when aiming
    this.aimPosition = { x: 0, y: -0.24, z: -0.38 };

    // A precision instrument: blued steel receiver and match barrel, kept
    // immaculate — the visual opposite of the shotgun's abused hardware.
    const olive = this.mat(0x2f3322, 0.5, 0.55);
    const black = this.mat(0x090a0c, 0.95, 0.1, {}, 'metal_blued');
    const steel = this.mat(0x23252b, 0.88, 0.22, {}, 'metal_blued');
    const glass = this.glassMat(0x2c3c46); // see-through scope lenses

    // Receiver
    this.p(this.cbox(1.5, 1.15, 4.2, 0.09), steel, 0, 0.15, 0);
    // Bolt body + handle + knob, hung off a PIVOT group centred on the bore
    // axis. The pivot is what the animator drives: rotating it about Z turns
    // the handle around the receiver (the lift/lock of a real bolt throw) while
    // translating it along Z runs the bolt back and forward. `this.bolt` is the
    // pivot, so updateRecoil's existing position.z reciprocation still applies.
    const boltPivot = new THREE.Group();
    boltPivot.position.set(0, 0.5, this.boltRest);
    const boltBody = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 12), black);
    boltBody.rotation.x = Math.PI / 2;
    boltBody.castShadow = true;
    boltPivot.add(boltBody);
    // Handle + knob sit BELOW and right of the axis at rest — a locked bolt
    // carries its handle down. The reload's `bolt_lift` beat rotates them up.
    // Positions are local to the X-rotated body, where local (x,y,z) lands at
    // (x, −z, y) relative to the pivot.
    const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 8), black);
    boltHandle.position.set(0.55, 0.5, 0.42);
    boltHandle.rotation.x = Math.PI / 2;
    boltHandle.rotation.z = Math.PI / 2;
    boltBody.add(boltHandle);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), black);
    boltKnob.position.set(1, 0.5, 0.42);
    boltBody.add(boltKnob);
    this.bolt = boltPivot;
    this.group.add(boltPivot);

    // Long fluted barrel
    const barrel = this.p(new THREE.CylinderGeometry(0.26, 0.28, 11, 18), black, 0, 0.18, -5.5);
    barrel.rotation.x = Math.PI / 2;
    // Barrel flutes — kept forward of the fore-end added below, so they run
    // along the EXPOSED length of barrel instead of being buried in furniture.
    for (let i = 0; i < 6; i++) {
      const flute = this.p(new THREE.BoxGeometry(0.05, 0.05, 4.2), steel, 0, 0.18, -7.6, false);
      const a = (i / 6) * Math.PI * 2;
      flute.position.x = Math.cos(a) * 0.27;
      flute.position.y = 0.18 + Math.sin(a) * 0.27;
    }

    // ── Chassis fore-end ──
    // The support hand sits at z = −2.9, where there was previously nothing but
    // bare barrel — the hand closed on air half a unit below it. This is the
    // handguard it actually holds, wrapping the barrel and carrying the bipod
    // rail underneath.
    this.p(this.cbox(0.95, 0.66, 4.2, 0.08), olive, 0, -0.16, -3.0);
    this.p(new THREE.BoxGeometry(0.72, 0.2, 4.0), black, 0, 0.2, -3.0, false); // barrel channel cap
    for (let i = 0; i < 5; i++) {
      // M-LOK cutouts down both flanks
      this.p(new THREE.BoxGeometry(0.5, 0.11, 0.17), black, 0.48, -0.16, -4.3 + i * 0.62, false);
      this.p(new THREE.BoxGeometry(0.5, 0.11, 0.17), black, -0.48, -0.16, -4.3 + i * 0.62, false);
    }
    // Bottom rail the bipod clamps to
    this.p(new THREE.BoxGeometry(0.44, 0.18, 2.2), black, 0, -0.55, -3.7, false);
    for (let i = 0; i < 5; i++) {
      this.p(new THREE.BoxGeometry(0.5, 0.1, 0.11), steel, 0, -0.64, -4.5 + i * 0.42, false);
    }
    // Muzzle brake
    const brake = this.p(new THREE.CylinderGeometry(0.4, 0.36, 1.8, 14), black, 0, 0.18, -11.4);
    brake.rotation.x = Math.PI / 2;
    // The worst offender under the old scheme: this is ~1.7 units forward of
    // where the flash used to spawn.
    this.setMuzzle(0, 0.18, -12.3); // muzzle-brake mouth
    for (let i = 0; i < 4; i++) {
      this.p(new THREE.BoxGeometry(0.86, 0.12, 0.5), this.mat(0, 1, 0.5), 0, 0.18, -11 - i * 0.35, false);
    }

    // ── Tactical scope ──
    // Rebuilt: every section is a real walled shell (see opticShell) instead of
    // a single-surface open cylinder, both bells flare the correct way round
    // (objective widens toward the MUZZLE, ocular toward the eye — they were
    // inverted, which is most of why the optic looked wrong), and both lenses
    // now sit inside their bore instead of overhanging the metal.
    const SCOPE_Y = 1.55;
    const scopeMount = this.mat(0x0a0a0a, 0.8, 0.3);
    const scopeBody = this.mat(0x090a0c, 0.92, 0.14, { side: THREE.DoubleSide });
    // Sunshade → objective housing → objective bell → main tube → ocular bell
    // → eyepiece, front to back.
    this.addOptic(scopeBody, SCOPE_Y, -5.55, -4.65, 0.60, 0.60, 0.05, 22);
    this.addOptic(scopeBody, SCOPE_Y, -4.65, -4.05, 0.58, 0.58, 0.06, 22);
    this.addOptic(scopeBody, SCOPE_Y, -4.05, -3.35, 0.58, 0.43, 0.06, 22);
    this.addOptic(scopeBody, SCOPE_Y, -3.35, 0.75, 0.42, 0.42, 0.05, 22);
    this.addOptic(scopeBody, SCOPE_Y, 0.75, 1.35, 0.42, 0.54, 0.05, 22);
    this.addOptic(scopeBody, SCOPE_Y, 1.35, 1.64, 0.56, 0.56, 0.06, 22);
    // Knurled ocular focus band
    this.p(new THREE.TorusGeometry(0.57, 0.05, 8, 20), scopeMount, 0, SCOPE_Y, 1.42, false);
    // Magnification ring on the main tube
    this.p(new THREE.TorusGeometry(0.45, 0.06, 8, 20), scopeMount, 0, SCOPE_Y, 0.55, false);

    // Lenses — both comfortably inside their bore (objective 0.58−0.06 = 0.52,
    // ocular 0.56−0.06 = 0.50).
    const frontLens = this.p(new THREE.CircleGeometry(0.50, 20), glass, 0, SCOPE_Y, -4.55, false);
    frontLens.rotation.y = Math.PI;
    this.p(new THREE.CircleGeometry(0.48, 20), glass, 0, SCOPE_Y, 1.58, false);
    this.p(
      new THREE.CircleGeometry(0.05, 10),
      new THREE.MeshBasicMaterial({ color: 0x33ff66, toneMapped: false }),
      0, SCOPE_Y, 1.55, false,
    );

    // Elevation + windage + parallax turrets, each with a knurled cap
    this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 12), scopeMount, 0, SCOPE_Y + 0.55, -1, false);
    this.p(new THREE.CylinderGeometry(0.23, 0.23, 0.07, 12), black, 0, SCOPE_Y + 0.77, -1, false);
    const wind = this.p(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 12), scopeMount, 0.6, SCOPE_Y, -1, false);
    wind.rotation.z = Math.PI / 2;
    const para = this.p(new THREE.CylinderGeometry(0.19, 0.19, 0.34, 12), scopeMount, -0.58, SCOPE_Y, -1, false);
    para.rotation.z = Math.PI / 2;

    // Picatinny rail on the receiver for the rings to clamp to
    this.p(new THREE.BoxGeometry(0.5, 0.2, 4.0), scopeMount, 0, 0.82, -0.2, false);
    for (let i = 0; i < 8; i++) {
      this.p(new THREE.BoxGeometry(0.55, 0.1, 0.12), black, 0, 0.94, -1.9 + i * 0.5, false);
    }
    // Mount rings — a torus already encircles the Z axis, so the old
    // `rotation.y = π/2` turned each ring edge-on THROUGH the scope tube.
    for (const z of [-0.1, -2.6]) {
      this.p(new THREE.TorusGeometry(0.47, 0.11, 8, 20), scopeMount, 0, SCOPE_Y, z, false);
      this.p(this.cbox(0.52, 0.62, 0.42, 0.05), scopeMount, 0, 1.08, z, false);
      // Clamp screw heads either side of the ring
      for (const sx of [-0.28, 0.28]) {
        this.p(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), black, sx, 1.2, z, false)
          .rotation.x = Math.PI / 2;
      }
    }

    // Magazine (animated)
    this.magazine = this.p(this.cbox(0.78, 1.7, 1.1, 0.07), black, 0, this.magRestY, 0.2);

    // Skeletonized stock with cheek riser
    this.p(this.cbox(1.1, 0.7, 3.4, 0.09), olive, 0, 0.05, 3.1);
    this.p(this.cbox(1.05, 0.55, 1.6, 0.09), olive, 0, 0.7, 2.6); // cheek riser
    this.p(this.cbox(1.15, 1.5, 0.4, 0.08), black, 0, -0.1, 4.85, false); // buttpad
    // Stock cut-out strut
    this.p(new THREE.BoxGeometry(0.4, 0.4, 1.6), olive, 0, -0.3, 3.6, false);

    // Pistol grip
    const grip = this.p(this.cbox(0.8, 1.7, 1, 0.09), olive, 0, -1, 1.4);
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

  // MINIGUN — rotary cannon
  private createMinigun() {
    // The minigun is a huge weapon — a centred ADS would shove the barrel
    // cluster into the player's face. Keep its aim pose low and slightly to the
    // side so right-click reads as "bracing + zoom" rather than a face-full of
    // barrels.
    this.aimPosition = { x: 0.12, y: -0.36, z: -0.52 };
    // Industrial ordnance — the most abused surface in the game.
    const steel = this.mat(0x202228, 0.9, 0.25, {}, 'metal_worn');
    const black = this.mat(0x0b0c0f, 0.95, 0.14, {}, 'metal_worn');
    const brass = this.mat(0xc8962e, 0.85, 0.3, { emissive: 0x3a2a05, emissiveIntensity: 0.25 });
    const housing = this.mat(0x2c2f36, 0.8, 0.35, {}, 'metal_worn');

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
    // On the bore axis, level with the barrel mouths — the cluster spins, so
    // anchoring to one rotating barrel would make the flash orbit.
    this.setMuzzle(0, 0, -8.5);
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
    this.p(this.cbox(1.1, 1.3, 1.4, 0.09), housing, 0, 1.3, 1.2);

    // Ammo drum — grouped so the reload can unlatch it, rock it and reseat it
    // as one unit (its outer face plate has to travel with the body).
    const drumGroup = new THREE.Group();
    drumGroup.position.set(0, 0.4, 3.4);
    const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.6, 20), this.mat(0x33363d, 0.7, 0.4));
    drumBody.rotation.z = Math.PI / 2;
    drumBody.castShadow = true; drumBody.receiveShadow = true;
    drumGroup.add(drumBody);
    const drumFace = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), black);
    drumFace.position.set(0.81, 0, 0);
    drumFace.rotation.y = Math.PI / 2;
    drumGroup.add(drumFace);
    this.group.add(drumGroup);
    this.rp.drum = drumGroup;

    // Ammo belt feeding into the gun — each link is tracked so the reload can
    // strip the spent belt out and drag a fresh one in link by link.
    const beltGroup = new THREE.Group();
    this.group.add(beltGroup);
    for (let i = 0; i < 6; i++) {
      const link = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), brass);
      link.position.set(0.2, 1.0 - i * 0.18, 2.1 + i * 0.05);
      beltGroup.add(link);
      this.rp.beltLinks.push(link);
    }
    this.rp.belt = beltGroup;

    // Spade grips (twin handles at rear)
    for (const sx of [-0.85, 0.85]) {
      const handle = this.p(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 10), black, sx, -0.6, 2.6);
      handle.rotation.z = 0.15 * Math.sign(sx);
      this.p(new THREE.SphereGeometry(0.24, 10, 10), this.mat(0x111317, 0.3, 0.7), sx, -1.5, 2.6, false);
    }
    // Cross brace between handles
    this.p(this.cbox(2, 0.3, 0.4, 0.07), black, 0, 0.2, 2.9, false);

    // Both hands grip the twin spade handles
    this.triggerGrip = { x: 0.85, y: -0.5, z: 2.6 };
    this.supportGrip = { x: -0.85, y: -0.5, z: 2.6 };
  }

  // LAUNCHER — shoulder-fired rocket launcher
  private createLauncher() {
    // Composite launch tube — coarse moulded shell, scuffed steel furniture.
    const olive = this.mat(0x33381f, 0.45, 0.6, {}, 'polymer_rough');
    const black = this.mat(0x0c0d10, 0.85, 0.25, {}, 'metal_worn');
    const steel = this.mat(0x22242a, 0.85, 0.3, {}, 'metal_worn');
    const warhead = this.mat(0xb43018, 0.5, 0.4, { emissive: 0x4a1005, emissiveIntensity: 0.4 });

    // Main launch tube
    const tube = this.p(new THREE.CylinderGeometry(0.62, 0.62, 8, 18), olive, 0, 0.3, -2);
    tube.rotation.x = Math.PI / 2;
    this.setMuzzle(0, 0.3, -6.1); // tube mouth
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

    // Loaded rocket — body + warhead tip + fins protruding from the front.
    // Built as a GROUP centred on the round itself so the reload can hide it
    // (an empty tube while reloading) and reveal it the instant a fresh round
    // bottoms out. `buildRocket` is shared with the round the hands carry in.
    const seated = this.buildRocket(this.mat(0x2a2a2a, 0.6, 0.4), warhead, black);
    seated.position.set(0, 0.3, -6.4);
    this.group.add(seated);
    this.rp.seatedRocket = seated;

    // Optical sight unit on top — a walled shell with a rubber eyecup, so the
    // sight reads as a machined body rather than a see-through half-pipe.
    const opticBody = this.mat(0x0c0d10, 0.86, 0.24, { side: THREE.DoubleSide });
    this.p(this.cbox(0.5, 0.6, 0.5, 0.06), black, 0, 1, -2.2, false);
    this.addOptic(opticBody, 1.45, -2.9, -1.6, 0.32, 0.32, 0.05, 16);
    this.addOptic(opticBody, 1.45, -1.6, -1.36, 0.35, 0.35, 0.05, 16);
    const lens = this.p(
      new THREE.CircleGeometry(0.25, 16),
      this.glassMat(0x2a3a44),
      0, 1.45, -2.82, false,
    );
    lens.rotation.y = Math.PI;
    // Iron backup blade
    this.p(new THREE.BoxGeometry(0.1, 0.5, 0.12), black, 0, 1, -4.5, false);

    // Pistol grip + trigger
    const grip = this.p(this.cbox(0.8, 1.7, 1, 0.09), black, 0, -0.85, 0.3);
    grip.rotation.x = 0.3;
    const guard = this.p(new THREE.TorusGeometry(0.5, 0.08, 8, 12, Math.PI), black, 0, -0.2, -0.1, false);
    guard.rotation.x = Math.PI / 2;

    // Front support grip
    const frontGrip = this.p(this.cbox(0.7, 1.4, 0.85, 0.09), black, 0, -0.6, -3.4);
    frontGrip.rotation.x = -0.15;

    // Shoulder rest pad
    this.p(this.cbox(1, 1.5, 0.6, 0.12), this.mat(0x14160c, 0.2, 0.85), 0, -0.4, 3.4, false);

    // Trigger hand on the grip, support hand on the front support grip
    this.triggerGrip = { x: 0.05, y: -0.5, z: 0.25 };
    this.supportGrip = { x: 0, y: -1, z: -3.4 };
  }

  // SUBVERTER — rugged robot-hacking deck (a combat tablet + intrusion chips)
  // Held flat, screen tilted up toward the player; an emitter prong on the
  // front fires the intrusion beam. The screen scrolls "code" and surges on
  // each chip deploy. Not a gun — there's no barrel or magazine.
  private createSubverter() {
    const frameMat   = this.mat(0x14171d, 0.7, 0.42, { envMapIntensity: 1.1 }); // dark composite chassis
    const frameLit   = this.mat(0x20242d, 0.82, 0.32);             // raised brushed panels
    const rubber     = this.mat(0x0a0b0e, 0.18, 0.92, { envMapIntensity: 0.35 }); // grip armor
    const trim       = this.mat(0x2a2f3a, 0.88, 0.26);             // bezel / rails
    const carbon     = this.mat(0x101319, 0.55, 0.55, { envMapIntensity: 0.7 }); // carbon underbelly
    const gold       = this.mat(0xd8b24a, 0.95, 0.22, { emissive: 0x4a3608, emissiveIntensity: 0.4 }); // chip contacts
    const antennaMat = this.mat(0x14161b, 0.85, 0.35);
    // Cyber accent — thin glowing piping that traces the chassis seams.
    const accentMat  = this.mat(0x062a16, 0.3, 0.4, { emissive: 0x18e0a0, emissiveIntensity: 1.1 });

    // The whole deck is tilted up so the player sees the lit screen. Built into
    // a child group so the tilt is baked in independent of the animation pose.
    const deck = new THREE.Group();
    deck.rotation.x = -0.5;
    deck.position.set(0, -0.1, -0.4);
    this.group.add(deck);
    // Handed to addReloadProps so the chip cartridge inherits the same tilt.
    this.subDeck = deck;
    const add = (m: THREE.Mesh, parent: THREE.Object3D = deck): THREE.Mesh => {
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };

    // ── Chassis: a chunky slab with a raised bezel + machined detail ──
    add(new THREE.Mesh(this.cbox(3.4, 0.42, 4.7, 0.11), frameMat));
    // Carbon-fibre underbelly + bevelled front lip read as a milled chassis.
    add(new THREE.Mesh(this.cbox(3.2, 0.2, 4.5, 0.06), carbon)).position.set(0, -0.22, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.34, 0.5), frameLit)).position.set(0, 0.02, -2.3);
    // Glowing accent piping down both long edges of the chassis.
    add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 4.2), accentMat)).position.set(-1.62, 0.16, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 4.2), accentMat)).position.set( 1.62, 0.16, 0);
    // Heat-vent louvres milled into the rear deck.
    for (let i = 0; i < 5; i++) {
      add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.1), trim)).position.set(0, 0.24, 1.35 + i * 0.16);
    }
    // Rubberized corner bumpers (rugged "field" look)
    for (const cx of [-1.6, 1.6]) {
      for (const cz of [-2.2, 2.2]) {
        add(new THREE.Mesh(this.cbox(0.5, 0.6, 0.5, 0.06), rubber)).position.set(cx, 0, cz);
      }
    }
    // Raised bezel frame around the screen
    add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 0.28), trim)).position.set(0, 0.26, -1.9);
    add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.16, 0.28), trim)).position.set(0, 0.26,  1.9);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 4.1), trim)).position.set(-1.5, 0.26, 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 4.1), trim)).position.set( 1.5, 0.26, 0);

    // ── Screen: a live canvas "code-rain" display (animated map + emissive) ──
    // A scrolling matrix of glyphs is rendered to a canvas texture and used as
    // both the colour and emissive map, so the screen reads as a real running
    // intrusion console rather than a flat green slab. The scroll + flicker are
    // driven per-frame in updateActions.
    const { tex, ctx } = this.makeScreenTexture();
    this.subScreenTex = tex;
    this.subScreenCtx = ctx;
    this.subScreenMat = new THREE.MeshStandardMaterial({
      color: 0x0a1f14, map: tex, emissiveMap: tex,
      metalness: 0.1, roughness: 0.3,
      emissive: 0xffffff, emissiveIntensity: 1.05, envMapIntensity: 0.5,
    });
    const screen = add(new THREE.Mesh(new THREE.BoxGeometry(2.75, 0.08, 3.7), this.subScreenMat));
    screen.position.set(0, 0.27, 0);
    // The cube-map UVs put the canvas on every face; only the top face is seen,
    // which is exactly what we want — the display faces the player.
    // A faint glass sheen plate floats just above the display.
    add(new THREE.Mesh(
      new THREE.BoxGeometry(2.78, 0.02, 3.74),
      this.glassMat(0x183226),
    )).position.set(0, 0.33, 0);
    // Thin emissive "code" rails kept for the rippling sequencer light at the
    // screen edges (subtle now that the canvas carries the detail).
    this.subCodeMats = [];
    for (let i = 0; i < 4; i++) {
      const cm = new THREE.MeshStandardMaterial({
        color: 0x062a16, metalness: 0, roughness: 0.4,
        emissive: 0x6effa6, emissiveIntensity: 0.5,
      });
      this.subCodeMats.push(cm);
      const bar = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 3.4), cm));
      bar.position.set(i < 2 ? -1.32 : 1.32, 0.32, 0);
      // two short cross rails top/bottom give the sequencer a frame
      bar.scale.z = (i % 2 === 0) ? 1 : 0.96;
    }

    // ── Chip bay: a row of FOUR intrusion chips slotted along the near edge ──
    // Each chip is its own group so it can eject (fired) and re-insert (reload)
    // independently — tracked in this.subChips and animated in updateActions.
    const chipCores = [0x39ff14, 0x16d6ff, 0xff3df0, 0xffc83a];
    this.subChips = [];
    for (let i = 0; i < 4; i++) {
      const slotX = -1.05 + i * 0.7;
      const baseY = 0.34, baseZ = 2.45;
      // A recessed dark socket stays in the deck so an empty slot reads as empty.
      add(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.68), carbon)).position.set(slotX, 0.22, baseZ);

      const chip = new THREE.Group();
      chip.position.set(slotX, baseY, baseZ);
      deck.add(chip);
      const cadd = (m: THREE.Mesh): THREE.Mesh => { m.castShadow = true; chip.add(m); return m; };
      // chip body (ceramic carrier)
      cadd(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.62), trim));
      // glowing virus core on the chip (per-chip animated material)
      const coreMat = new THREE.MeshStandardMaterial({
        color: chipCores[i], metalness: 0.2, roughness: 0.35,
        emissive: chipCores[i], emissiveIntensity: 1.1,
      });
      cadd(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.34), coreMat)).position.set(0, 0.11, 0);
      // etched circuit cross on the core
      cadd(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.05), gold)).position.set(0, 0.17, 0);
      cadd(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.4), gold)).position.set(0, 0.17, 0);
      // gold contact pins along the leading edge
      cadd(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.1), gold)).position.set(0, -0.08, 0.33);
      // soft additive halo that flares when the chip is fired or seated
      const glowMat = new THREE.MeshBasicMaterial({
        color: chipCores[i], transparent: true, opacity: 0.0,
        toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), glowMat);
      glow.position.set(0, 0.12, 0);
      chip.add(glow);

      this.subChips.push({
        group: chip, core: coreMat, glow, glowMat,
        baseY, baseZ, offset: 0, target: 0, flash: 0,
      });
    }
    this.subLoaded = this.subChips.length; // built fully loaded

    // ── Emitter prong (front): the intrusion beam launches from its glowing tip ──
    const prongBase = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), frameLit));
    prongBase.position.set(0, 0.2, -2.5);
    // Twin focusing fins flanking the prong (gives the muzzle some read).
    for (const fx of [-0.34, 0.34]) {
      const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 1.3), trim));
      fin.position.set(fx, 0.4, -3.3);
    }
    const prong = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.7, 12), antennaMat));
    prong.rotation.x = Math.PI / 2;
    prong.position.set(0, 0.35, -3.4);
    // glowing focusing rings up the prong
    for (let i = 0; i < 3; i++) {
      const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 14), accentMat));
      r.rotation.x = Math.PI / 2;
      r.position.set(0, 0.35, -3.0 - i * 0.42);
    }
    this.subEmitterMat = new THREE.MeshStandardMaterial({
      color: 0x062a16, metalness: 0.2, roughness: 0.3,
      emissive: 0x39ff14, emissiveIntensity: 1.4, envMapIntensity: 0.8,
    });
    // glowing emitter dish at the tip
    const dish = add(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.7, 14, 1, true), this.subEmitterMat));
    dish.rotation.x = -Math.PI / 2;
    dish.position.set(0, 0.35, -4.25);
    // emitter core bead
    add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 14), this.subEmitterMat)).position.set(0, 0.35, -4.0);

    // ── Side grips the hands hold + a blinking status antenna ──
    add(new THREE.Mesh(this.cbox(0.55, 0.85, 2.2, 0.09), rubber)).position.set(-1.85, -0.05, 0.6);
    add(new THREE.Mesh(this.cbox(0.55, 0.85, 2.2, 0.09), rubber)).position.set( 1.85, -0.05, 0.6);
    // ridged grip texture
    for (let i = 0; i < 5; i++) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.14), trim)).position.set(-1.85, 0.18, -0.1 + i * 0.34);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.14), trim)).position.set( 1.85, 0.18, -0.1 + i * 0.34);
    }
    // status antenna + blinking tip
    const ant = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), antennaMat));
    ant.position.set(1.3, 0.55, 2.1);
    this.subAntennaTip = add(new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x39ff14, toneMapped: false }),
    ));
    this.subAntennaTip.position.set(1.3, 1.15, 2.1);

    this.subTime = 0;
    this.subDeploy = 0;
    this.subReloadGlow = 0;
    this.subEmitterCharge = 0;

    // Both hands cup the rugged side grips.
    this.triggerGrip = { x: 1.4, y: -0.55, z: 0.9 };
    this.supportGrip = { x: -1.4, y: -0.55, z: 0.9 };
  }

  /**
   * Builds the Subverter's live screen as a canvas texture: a Matrix-style
   * "code rain" of cyber glyphs over scanlines, redrawn/scrolled each frame in
   * updateActions. Returns the texture + its 2D context so the animator can
   * repaint it. Used as both the colour map and the emissive map.
   */
  private makeScreenTexture(): { tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D } {
    const W = 128, H = 160;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#02160c';
    ctx.fillRect(0, 0, W, H);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.NearestFilter; // crisp "pixel font" look
    return { tex, ctx };
  }

  /** Repaint the Subverter screen's code-rain for the current frame. `surge`
   *  (0..1) floods the display white-hot on a deploy; `scan` washes it for a
   *  reload. Cheap: a 128×160 canvas redrawn with a few dozen glyphs. */
  private paintScreen(surge: number, scan: number) {
    const ctx = this.subScreenCtx;
    if (!ctx || !this.subScreenTex) return;
    const W = 128, H = 160;
    // Trailing fade — overdraw the previous frame slightly so glyphs leave
    // streaks (the classic falling-code trail).
    ctx.fillStyle = 'rgba(2, 18, 10, 0.34)';
    ctx.fillRect(0, 0, W, H);
    const cols = 16;
    const cw = W / cols;
    this.subScreenScroll = (this.subScreenScroll + 0.6 + surge * 4) % H;
    ctx.font = '11px monospace';
    ctx.textBaseline = 'top';
    for (let c = 0; c < cols; c++) {
      // each column falls at its own phase
      const phase = (this.subScreenScroll * (0.6 + (c % 5) * 0.16) + c * 37) % H;
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const y = (phase + r * 13) % H;
        const head = r === 0;
        const ch = String.fromCharCode(0x30 + ((Math.random() * 42) | 0)); // digits/symbols
        const g = head ? 255 : 90 + ((Math.random() * 120) | 0);
        ctx.fillStyle = head
          ? `rgb(${180 + surge * 75},255,${200 + surge * 55})`
          : `rgba(40,${g},${90 + (g >> 1)},0.9)`;
        ctx.fillText(ch, c * cw + 1, y);
      }
    }
    // Scanline shading
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    // Reload wash — a bright bar sweeping the screen while chips reload.
    if (scan > 0.001) {
      const by = ((1 - scan) * H * 1.4) % H;
      ctx.fillStyle = `rgba(120,255,200,${0.35 * scan})`;
      ctx.fillRect(0, by - 6, W, 12);
    }
    // Surge flash — flood the whole display on a deploy.
    if (surge > 0.001) {
      ctx.fillStyle = `rgba(200,255,210,${0.5 * surge})`;
      ctx.fillRect(0, 0, W, H);
    }
    this.subScreenTex.needsUpdate = true;
  }

  // RELOAD HARDWARE
  //
  // The props a reload physically handles: the magazine that gets stripped
  // out, the fresh one carried up from a pouch, shotgun shells, rockets,
  // belts, chip cartridges. All built with the rig and parked hidden.
  //
  // Every material here is fetched through `mat()` with the SAME arguments
  // the weapon's own parts use, so these reuse the cached instances rather
  // than introducing a new shader variant. That matters: props are hidden at
  // build time and `renderer.compile` only traverses VISIBLE objects, so a
  // prop with a novel material would link its program mid-fight on the first
  // reload — exactly the stutter the warmup exists to prevent.

  /** Add a shadow-casting mesh to `parent` at a local offset. */
  private prop(
    geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D,
    x = 0, y = 0, z = 0,
  ): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  /**
   * A detachable box magazine: body plus floorplate, sized to match the
   * weapon's own seated magazine so the swap reads as like-for-like. Returned
   * centred on its own body, hidden, ready to be flown along a path.
   */
  private buildMagProp(
    w: number, h: number, d: number, body: THREE.Material,
    plate: THREE.Material, plateY: number,
  ): THREE.Group {
    // Chamfered: the spare magazine passes within a few centimetres of the
    // camera during the swap, so it is one of the most closely-inspected
    // objects in the game.
    const g = new THREE.Group();
    this.prop(this.cbox(w, h, d, 0.06), body, g);
    this.prop(this.cbox(w * 1.08, 0.2, d * 1.06, 0.05), plate, g, 0, plateY, 0.04);
    // Witness slots down the spine — the giveaway detail that reads "magazine"
    // even as it tumbles past the camera.
    for (let i = 0; i < 3; i++) {
      this.prop(new THREE.BoxGeometry(w * 0.34, 0.07, 0.05), plate, g, 0, h * 0.24 - i * h * 0.24, d / 2);
    }
    g.visible = false;
    return g;
  }

  /** A rocket round: motor body, warhead cone and tail fins, centred on the body. */
  private buildRocket(
    bodyMat: THREE.Material, warheadMat: THREE.Material, finMat: THREE.Material,
  ): THREE.Group {
    const g = new THREE.Group();
    this.prop(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 14), bodyMat, g).rotation.x = Math.PI / 2;
    this.prop(new THREE.ConeGeometry(0.36, 1.3, 14), warheadMat, g, 0, 0, -1.4).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const fin = this.prop(new THREE.BoxGeometry(0.05, 0.5, 0.5), finMat, g,
        Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.5);
      fin.rotation.z = a;
    }
    return g;
  }

  /** A 12-gauge round: plastic hull with a brass head. */
  private buildShell(hull: THREE.Material, brass: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    this.prop(new THREE.CylinderGeometry(0.17, 0.17, 0.62, 10), hull, g).rotation.x = Math.PI / 2;
    this.prop(new THREE.CylinderGeometry(0.185, 0.185, 0.22, 10), brass, g, 0, 0, 0.33).rotation.x = Math.PI / 2;
    this.prop(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), brass, g, 0, 0, 0.45).rotation.x = Math.PI / 2;
    g.visible = false;
    return g;
  }

  /**
   * Build the per-weapon reload props and record where the magazine seats.
   * Called once per rig, straight after the weapon's create* method (so the
   * material cache is already warm with that weapon's palette) and before the
   * arms go on top.
   */
  private addReloadProps(type: WeaponType) {
    const rp = this.rp;
    // Where the support hand holds a fresh item while it's down at the pouch —
    // captured now, because `supportGrip` only describes the rig being built.
    // Kept shallow (matched to setSwapHand's dive of 2.0) so the fresh
    // magazine spends most of its travel ON SCREEN rather than being fetched
    // from somewhere far below the frame.
    const g = this.supportGrip ?? this.triggerGrip;
    rp.hold = { x: g.x + 0.3, y: g.y - 2.25, z: g.z + 0.95 };
    // Two identical magazines: the one being thrown away and the one coming in.
    const pair = (w: number, h: number, d: number, body: THREE.Material, plate: THREE.Material, plateY: number) => {
      rp.spentMag = this.buildMagProp(w, h, d, body, plate, plateY);
      rp.freshMag = this.buildMagProp(w, h, d, body, plate, plateY);
      this.group.add(rp.spentMag, rp.freshMag);
    };

    switch (type) {
      case 'pistol': {
        rp.well = { x: 0, y: this.magRestY, z: 0.3 };
        pair(0.8, 2, 0.95, this.mat(0x1a1c20, 0.6, 0.4), this.mat(0x111317, 0.85, 0.3), -1.05);
        break;
      }
      case 'rifle': {
        rp.well = { x: 0, y: this.magRestY, z: 0.5 };
        pair(0.72, 2.05, 0.95, this.mat(0x33352b, 0.25, 0.78), this.mat(0x0c0d10, 0.9, 0.16), -0.92);
        break;
      }
      case 'smg': {
        rp.well = { x: 0, y: this.magRestY, z: -0.2 };
        pair(0.62, 2.4, 0.85, this.mat(0x101218, 0.3, 0.7), this.mat(0x0a0b0e, 0.92, 0.16), -1.3);
        break;
      }
      case 'sniper': {
        rp.well = { x: 0, y: this.magRestY, z: 0.2 };
        pair(0.78, 1.7, 1.1, this.mat(0x090a0c, 0.95, 0.1), this.mat(0x090a0c, 0.95, 0.1), -0.93);
        break;
      }
      case 'shotgun': {
        // Red plastic hull, brass head — the same brass the minigun's belt uses.
        const hull = this.mat(0x8e1b16, 0.2, 0.6);
        const brass = this.mat(0xc8962e, 0.85, 0.3, { emissive: 0x3a2a05, emissiveIntensity: 0.25 });
        rp.shell = this.buildShell(hull, brass);
        rp.ejectedShell = this.buildShell(hull, brass);
        this.group.add(rp.shell, rp.ejectedShell);
        break;
      }
      case 'launcher': {
        const rocket = this.buildRocket(
          this.mat(0x2a2a2a, 0.6, 0.4),
          this.mat(0xb43018, 0.5, 0.4, { emissive: 0x4a1005, emissiveIntensity: 0.4 }),
          this.mat(0x0c0d10, 0.85, 0.25),
        );
        rocket.visible = false;
        this.group.add(rocket);
        rp.loadRocket = rocket;
        break;
      }
      case 'minigun': {
        // Hinged feed cover over the ammo throat. The pivot sits at the cover's
        // REAR edge so raising rotation.x swings its nose up and open.
        const housing = this.mat(0x2c2f36, 0.8, 0.35);
        const steel = this.mat(0x202228, 0.9, 0.25);
        const black = this.mat(0x0b0c0f, 0.95, 0.14);
        const cover = new THREE.Group();
        cover.position.set(0, 1.98, 1.9);
        this.prop(new THREE.BoxGeometry(1.16, 0.14, 1.5), housing, cover, 0, 0, -0.75);
        for (let i = 0; i < 3; i++) {
          this.prop(new THREE.BoxGeometry(1.2, 0.07, 0.1), steel, cover, 0, 0.09, -0.35 - i * 0.44);
        }
        this.prop(new THREE.BoxGeometry(0.3, 0.24, 0.18), black, cover, 0, -0.06, -1.52); // latch
        this.group.add(cover);
        rp.feedCover = cover;
        break;
      }
      case 'subverter': {
        // The chip cartridge lives on the DECK group so it inherits the deck's
        // baked-in tilt (see createSubverter) and stays flush with the bay.
        const deck = this.subDeck;
        if (!deck) break;
        const trim = this.mat(0x2a2f3a, 0.88, 0.26);
        const gold = this.mat(0xd8b24a, 0.95, 0.22, { emissive: 0x4a3608, emissiveIntensity: 0.4 });
        const accent = this.mat(0x062a16, 0.3, 0.4, { emissive: 0x18e0a0, emissiveIntensity: 1.1 });
        const makeCart = (): THREE.Group => {
          const g = new THREE.Group();
          this.prop(new THREE.BoxGeometry(2.2, 0.34, 0.6), trim, g);
          this.prop(new THREE.BoxGeometry(2.0, 0.08, 0.1), gold, g, 0, -0.16, -0.28); // contacts
          this.prop(new THREE.BoxGeometry(1.5, 0.07, 0.09), accent, g, 0, 0.2, 0.06); // status bar
          g.visible = false;
          return g;
        };
        rp.spentCart = makeCart();
        rp.freshCart = makeCart();
        deck.add(rp.spentCart, rp.freshCart);
        break;
      }
    }
  }

  /**
   * Return every reload prop to its hidden rest state. `keepFallingMag` leaves
   * a discarded magazine alone so it can finish its arc after a reload ends —
   * clearing it would snap a mag out of mid-air (and reset its tumble).
   */
  private parkReloadProps(rp: ReloadProps, keepFallingMag = false) {
    const hide = (o: THREE.Object3D | null) => {
      if (!o) return;
      o.visible = false;
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(1);
    };
    if (!keepFallingMag) hide(rp.spentMag);
    hide(rp.freshMag);
    hide(rp.shell);
    hide(rp.ejectedShell);
    hide(rp.loadRocket);
    hide(rp.spentCart);
    hide(rp.freshCart);
    // The seated rocket is part of the weapon's rest silhouette — it's only
    // hidden mid-reload (empty tube), so it comes BACK rather than parking away.
    if (rp.seatedRocket) {
      rp.seatedRocket.visible = true;
      rp.seatedRocket.position.set(0, 0.3, -6.4);
    }
    if (rp.feedCover) rp.feedCover.rotation.set(0, 0, 0);
    if (rp.drum) {
      // Keep the accumulated spin on X (a cylinder has no readable start
      // angle, and zeroing it would jerk the belt links attached to it);
      // clear only the swing-out axes.
      rp.drum.rotation.set(rp.drum.rotation.x, 0, 0);
      rp.drum.position.set(0, 0.4, 3.4);
    }
    for (const link of rp.beltLinks) { link.visible = true; link.scale.setScalar(1); }
    if (rp.belt) rp.belt.position.set(0, 0, 0);
  }

  // FIRST-PERSON ARMS — gloved hands + forearms holding the weapon
  private addArms() {
    const sleeve = this.mat(0x2b2e26, 0.12, 0.84, { envMapIntensity: 0.5 });
    const glove = this.mat(0x15171b, 0.28, 0.55, { envMapIntensity: 1.0 });
    const cuff = this.mat(0x1d2024, 0.18, 0.68, { envMapIntensity: 0.6 });

    // Each arm is wrapped in its own group (forearm + elbow + cuff + fist) so the
    // reload routine can drive the WHOLE arm — hand AND forearm together — toward
    // the magazine well and back. The wrapper sits at the origin, so the reload
    // pose is applied as a small delta from rest (0,0,0).
    const zeroRest = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0 });

    // Trigger (right) hand — always present
    this.triggerHandGroup = this.buildArm(this.triggerGrip, 1, sleeve, glove, cuff);
    this.triggerHandRest = zeroRest();
    // Support (left) hand — most weapons; pistols/launchers may differ
    if (this.supportGrip) {
      this.supportHandGroup = this.buildArm(this.supportGrip, -1, sleeve, glove, cuff);
      this.supportHandRest = zeroRest();
    }
  }

  /**
   * Builds one arm INSIDE its own wrapper group: a tapered forearm running from
   * an off-screen elbow to the wrist, a rolled cuff, and a detailed gloved fist
   * gripping the weapon. `side` is +1 for the right arm, -1 for the left. The
   * wrapper is returned (and added to the model) so it can be animated as a unit.
   */
  private buildArm(
    hand: { x: number; y: number; z: number },
    side: number,
    sleeve: THREE.Material,
    glove: THREE.Material,
    cuff: THREE.Material,
  ): THREE.Group {
    const armGroup = new THREE.Group();
    const part = (m: THREE.Mesh): THREE.Mesh => {
      m.castShadow = true; m.receiveShadow = true; armGroup.add(m); return m;
    };
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
    part(forearm);

    // Elbow cap
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.66, 12, 10), sleeve);
    elbow.position.copy(anchor);
    part(elbow);

    // Rolled cuff at the wrist
    const cuffMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.62, 14), cuff);
    cuffMesh.quaternion.copy(quat);
    cuffMesh.position.copy(wrist);
    part(cuffMesh);

    // Gloved fist — back of hand, knuckles, curled fingers, thumb
    const handGroup = new THREE.Group();
    handGroup.position.set(hand.x, hand.y, hand.z);
    handGroup.rotation.x = 0.32;
    handGroup.rotation.y = -0.16 * side;

    // Hands are the closest thing to the camera and the thing the player reads
    // as "holding", so they carry the heaviest chamfer of anything on the
    // model — square-edged fists are what made the weapon feel like a prop
    // being carried rather than a weapon being gripped.
    const backHand = new THREE.Mesh(this.cbox(0.82, 0.5, 0.98, 0.13), glove);
    handGroup.add(backHand);

    const knuckles = new THREE.Mesh(this.cbox(0.84, 0.27, 0.36, 0.09), glove);
    knuckles.position.set(0, 0.16, -0.42);
    handGroup.add(knuckles);
    // Wrist taper into the cuff, so the hand doesn't end in a flat slab.
    const wristBlock = new THREE.Mesh(this.cbox(0.7, 0.44, 0.34, 0.1), glove);
    wristBlock.position.set(0, -0.02, 0.5);
    handGroup.add(wristBlock);

    // Four fingers curling over the front of the grip, each with a second
    // segment so they WRAP the weapon instead of jutting out as single slabs —
    // a straight finger reads as a mitten, a broken one reads as a grip.
    // Each distal segment is a CHILD of its finger, positioned just past the
    // far end in finger-local space, so the two can never drift apart however
    // the hand is posed.
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(this.cbox(0.17, 0.5, 0.3, 0.06), glove);
      finger.position.set(-0.3 + i * 0.2, -0.22, -0.5);
      finger.rotation.x = 0.92;
      handGroup.add(finger);
      const tip = new THREE.Mesh(this.cbox(0.16, 0.32, 0.26, 0.06), glove);
      tip.position.set(0, -0.3, -0.05);
      tip.rotation.x = 0.9;
      finger.add(tip);
    }

    // Thumb on the inboard side, with the same knuckle break
    const thumb = new THREE.Mesh(this.cbox(0.22, 0.5, 0.27, 0.07), glove);
    thumb.position.set(0.42 * side, -0.05, -0.06);
    thumb.rotation.z = -0.7 * side;
    thumb.rotation.x = 0.35;
    handGroup.add(thumb);
    const thumbTip = new THREE.Mesh(this.cbox(0.19, 0.3, 0.24, 0.07), glove);
    thumbTip.position.set(0, -0.28, -0.04);
    thumbTip.rotation.x = 0.72;
    thumb.add(thumbTip);

    handGroup.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    armGroup.add(handGroup);
    this.group.add(armGroup);
    return armGroup;
  }

  /**
   * Update recoil + reload animation — calculates offsets and drives parts.
   */
  updateRecoil(delta: number) {
    // Idle-spin / fire-spin the minigun barrels. A reload overrides both: the
    // cluster is braked to a dead stop for the feed job, then wound back up.
    if (this.spinningPart) {
      const spinSpeed = this.reloadSpin >= 0 ? this.reloadSpin
        : this.recoilAnimation > 0.05 ? 32 : 1.4;
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

    // ── RELOAD ────────────────────────────────────────────────────────────
    // Paced to fill the FULL reload window (handed in via triggerReload) so the
    // hands work the weapon for the entire time. Every weapon runs its OWN
    // choreography of real mechanical beats — a pistol's slide-lock speed
    // reload, an AR's rock-and-tug, a bolt gun's four-part bolt throw, shells
    // thumbed past a loading gate, a belt fed under a hinged cover, a rocket
    // rammed down a tube, a chip cartridge swapped into a deck — each emitting
    // cues at the frame its parts make contact (see ReloadCue).
    if (this.isReloading) {
      this.reloadAnimation += delta / this.reloadDuration;
      this.panicTime += delta; // drives the tremor in setPose
      const ra = Math.min(1, this.reloadAnimation);

      // Whole-gun envelope — ease in, hold, ease out.
      this.reloadDip = ra < 0.14 ? this.ss(ra / 0.14)
        : ra > 0.86 ? this.ss((1 - ra) / 0.14)
        : 1;

      switch (this.currentWeaponType) {
        case 'pistol': this.animatePistolReload(ra); break;
        case 'rifle': this.animateRifleReload(ra); break;
        case 'smg': this.animateSMGReload(ra); break;
        case 'sniper': this.animateSniperReload(ra); break;
        case 'shotgun': this.animateShellReload(ra); break;
        case 'minigun': this.animateBeltReload(ra); break;
        case 'launcher': this.animateRocketReload(ra); break;
        case 'subverter': this.animateSubverterReload(ra); break;
      }

      if (this.reloadAnimation >= 1.0) this.finishReload();
    } else {
      // Ease the working posture and the hands back to the ready pose.
      const k = 1 - Math.min(1, delta * 9);
      this.reloadDip *= k;
      const p = this.reloadPose;
      p.x *= k; p.y *= k; p.z *= k; p.rx *= k; p.ry *= k; p.rz *= k;
      this.restHands(delta);
    }

    // The discarded magazine falls on its own clock — it has to keep going
    // after the reload ends (or is snapped short by an active reload) rather
    // than blinking out of existence in mid-air.
    this.updateMagFall(delta);
  }

  /** Smooth 0→1 ramp helper (Hermite). */
  private ss(v: number): number { return THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(v, 0, 1), 0, 1); }

  /** Progress 0..1 through the window [a,b], clamped flat outside it. */
  private seg(v: number, a: number, b: number): number {
    return THREE.MathUtils.clamp((v - a) / Math.max(1e-5, b - a), 0, 1);
  }

  /** A 0→1→0 bump across [a,b] — the shape of a single hand motion. */
  private bump(v: number, a: number, b: number): number {
    return Math.sin(this.seg(v, a, b) * Math.PI);
  }

  /**
   * The weapon's working posture for this frame (added in applyAnimations).
   * A panicked operator's hands shake, so the pose picks up a fast irregular
   * tremor built from two detuned sines — a single sine reads as a machine
   * vibrating, two beating against each other read as a person.
   */
  private setPose(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
    const p = this.reloadPose;
    p.x = x; p.y = y; p.z = z; p.rx = rx; p.ry = ry; p.rz = rz;
    const k = this.reloadPanic;
    if (k > 0.001) {
      const t = this.panicTime;
      const sx = Math.sin(t * 31) * 0.6 + Math.sin(t * 47.3) * 0.4;
      const sy = Math.sin(t * 27.4) * 0.6 + Math.sin(t * 41.1) * 0.4;
      p.x += sx * 0.012 * k;
      p.y += sy * 0.014 * k;
      p.rx += sy * 0.028 * k;
      p.ry += sx * 0.024 * k;
      p.rz += Math.sin(t * 23.7) * 0.03 * k;
    }
  }

  /**
   * Where the magazine insert stalls when the operator is rattled. Returns a
   * 0..1 "hitch" that briefly stops the magazine short of the well and shoves
   * it home late — the fumble that sells a panicked reload. Zero when calm, so
   * the composed drill stays perfectly clean.
   */
  private panicHitch(ra: number, seat: number): number {
    const k = this.reloadPanic;
    if (k < 0.02) return 0;
    return this.bump(ra, seat - 0.24, seat - 0.06) * k;
  }

  /**
   * Emit a reload beat exactly once per reload. Returns whether it fired, so
   * callers can hang one-shot state changes (launching the mag-drop physics)
   * off the same gate. Firing is idempotent by key, which is what keeps an
   * active-reload fast-forward from re-triggering or skipping beats.
   */
  private emit(name: ReloadCue, index = 0): boolean {
    const key = index ? `${name}#${index}` : name;
    if (this.firedCues.has(key)) return false;
    this.firedCues.add(key);
    this.onReloadCue?.(name, index);
    return true;
  }

  /** Emit `name` once the playhead reaches `at`. */
  private cue(ra: number, at: number, name: ReloadCue, index = 0): boolean {
    return ra >= at ? this.emit(name, index) : false;
  }

  /** Snap an arm wrapper to its rest pose plus a delta (units are model space). */
  private setArmPose(
    g: THREE.Group | null,
    rest: { x: number; y: number; z: number; rx: number; ry: number },
    dx: number, dy: number, dz: number, drx: number, dry: number, drz = 0,
  ) {
    if (!g) return;
    g.position.set(rest.x + dx, rest.y + dy, rest.z + dz);
    g.rotation.set(rest.rx + drx, rest.ry + dry, drz);
  }

  /** The trigger hand's default reload behaviour: stay on the grip, ride the dip. */
  private holdTriggerHand(extraY = 0, extraRx = 0, extraRz = 0) {
    this.setArmPose(
      this.triggerHandGroup, this.triggerHandRest,
      0, -this.reloadDip * 0.06 + extraY, 0, extraRx, 0, extraRz,
    );
  }

  /**
   * Ease both arms back toward their rest grip pose. Roll (rotation.z) is eased
   * to zero alongside the rest — the reload choreographies now cant the wrists,
   * and an axis that is written but never released stays rolled forever.
   */
  private restHands(delta: number) {
    const k = Math.min(1, delta * 12);
    const ease = (g: THREE.Group | null, r: { x: number; y: number; z: number; rx: number; ry: number }) => {
      if (!g) return;
      g.position.x += (r.x - g.position.x) * k;
      g.position.y += (r.y - g.position.y) * k;
      g.position.z += (r.z - g.position.z) * k;
      g.rotation.x += (r.rx - g.rotation.x) * k;
      g.rotation.y += (r.ry - g.rotation.y) * k;
      g.rotation.z += (0 - g.rotation.z) * k;
    };
    ease(this.supportHandGroup, this.supportHandRest);
    ease(this.triggerHandGroup, this.triggerHandRest);
  }

  // PER-WEAPON RELOAD CHOREOGRAPHY
  //
  // Each routine is a hand-authored timeline over `ra` (0→1 across the whole
  // reload window, whatever its real duration). They share the magazine-swap
  // skeleton below where the motion genuinely is the same, and diverge
  // completely where the mechanism does — which is most of the interesting
  // part of each gun.

  /**
   * The magazine change every box-fed weapon performs: strip the empty, let it
   * fall, dive to a pouch, bring a fresh one up nose-first, guide it into the
   * well and slap it home. Timings and the amount of "rock" are per weapon —
   * an AR magazine goes in almost straight, an SMG's long stick has to be
   * tipped in — and the action-cycling that FOLLOWS the swap is left to the
   * caller, because that's where these guns stop resembling each other.
   */
  private magSwap(ra: number, t: {
    release: number;  // the catch is pressed
    free: number;     // the empty breaks clear and gravity takes it
    pouch: number;    // support hand has reached the spare
    carry: number;    // the fresh magazine re-enters frame
    seat: number;     // it bottoms out in the well
    rockOut: number;  // tilt the empty picks up as it's stripped (radians)
    rockIn: number;   // nose-first angle the fresh one enters at (radians)
    tug?: number;     // optional downward tug-test to confirm the lock
  }) {
    const rp = this.rp;
    const w = rp.well;

    // ── Strip: the empty slides down clear of the well ──
    this.cue(ra, t.release, 'mag_release');
    if (this.magazine) {
      if (ra < t.free) {
        const p = this.ss(this.seg(ra, t.release, t.free));
        this.magazine.visible = true;
        this.magazine.position.y = this.magRestY - p * 1.3;
        this.magazine.rotation.x = p * t.rockOut;
        this.magazine.rotation.z = p * t.rockOut * 0.3;
      } else {
        // Between "free" and "seat" the well is genuinely empty — the seated
        // magazine mesh is hidden and the falling prop carries the motion.
        this.magazine.visible = ra >= t.seat;
        if (ra >= t.seat) {
          this.magazine.position.y = this.magRestY;
          this.magazine.rotation.set(0, 0, 0);
        }
      }
    }

    // ── Free: the empty leaves the well ──
    // DRY: it is dumped — gravity takes it and it clatters on the ground.
    // TACTICAL: it still has rounds in it, so it is retained. The hand carries
    // it down out of frame to a pouch and comes back with the fresh one, which
    // is both what a trained shooter does and a visibly different silhouette.
    const tactical = this.reloadStyle === 'tactical';
    if (this.cue(ra, t.free, tactical ? 'mag_stow' : 'mag_out') && rp.spentMag && !tactical) {
      const m = this.magFall;
      m.active = true;
      m.landed = false;
      m.y = this.magRestY - 1.3;
      m.z = w.z;
      m.vy = -2.3;
      m.vz = 0.8;            // tossed slightly toward the camera as it clears
      m.spinX = 6.2;
      m.spinZ = 2.7;
      rp.spentMag.visible = true;
      rp.spentMag.position.set(w.x + 0.05, m.y, m.z);
      rp.spentMag.rotation.set(t.rockOut, 0, t.rockOut * 0.3);
    }
    // Tactical: the retained magazine rides the hand down to the pouch.
    if (tactical && rp.spentMag) {
      const stow = this.seg(ra, t.free, t.pouch + 0.05);
      const live = ra >= t.free && stow < 1;
      rp.spentMag.visible = live;
      if (live) {
        const h = rp.hold;
        rp.spentMag.position.set(
          THREE.MathUtils.lerp(w.x, h.x - 0.55, stow),
          THREE.MathUtils.lerp(this.magRestY - 1.3, h.y - 0.6, stow),
          THREE.MathUtils.lerp(w.z, h.z, stow),
        );
        rp.spentMag.rotation.set(t.rockOut + stow * 0.5, 0, t.rockOut * 0.3 - stow * 0.4);
      }
    }

    // ── Carry: the fresh magazine rides up from the pouch into the well ──
    const fresh = rp.freshMag;
    if (fresh) {
      if (ra >= t.carry && ra < t.seat) {
        const q = this.ss(this.seg(ra, t.carry, t.seat));
        // Front-loaded travel curve: the magazine covers the stretch BELOW the
        // frame quickly and then decelerates into the well, so the part of the
        // motion the player can actually see gets most of the running time.
        // A panicked hitch drags it back short of the well before it goes home.
        const p = Math.max(0, Math.pow(q, 0.62) - this.panicHitch(ra, t.seat) * 0.3);
        const h = rp.hold;
        fresh.visible = true;
        fresh.position.set(
          THREE.MathUtils.lerp(h.x, w.x, p),
          // A touch of sag early on so it arcs up into line rather than
          // travelling on a dead-straight rail.
          THREE.MathUtils.lerp(h.y, w.y, p) - (1 - p) * p * 1.1,
          THREE.MathUtils.lerp(h.z, w.z, p),
        );
        fresh.rotation.set((1 - p) * t.rockIn, 0, (1 - p) * -t.rockIn * 0.45);
      } else {
        fresh.visible = false;
      }
    }
    this.cue(ra, t.seat, 'mag_in');

    // ── Tug test: a short downward pull confirming the catch took ──
    if (t.tug !== undefined) {
      const tug = this.bump(ra, t.tug, t.tug + 0.09);
      this.cue(ra, t.tug + 0.03, 'mag_tug');
      if (tug > 0.001 && this.magazine) {
        this.magazine.position.y = this.magRestY - tug * 0.13;
      }
    }

    // ── Support hand: off the weapon → down to the pouch → back up with the
    // magazine → palm-slap → clear. One scalar "depth" drives the whole path.
    const dive = this.ss(this.seg(ra, t.release, t.pouch));
    const ret = this.ss(this.seg(ra, t.carry, t.seat));
    const clear = this.ss(this.seg(ra, t.seat + 0.04, Math.min(1, t.seat + 0.28)));
    const depth = (dive - ret * 0.28) * (1 - clear);
    const slap = this.bump(ra, t.seat - 0.07, t.seat + 0.05);
    this.setSwapHand(depth, slap);
    // Handed back so a weapon whose action-cycling overlaps the tail of the
    // swap can re-pose the hand as swap-path PLUS its own beat. Overwriting the
    // pose outright would snap the hand from mid-travel to the beat's origin.
    return { depth, slap };
  }

  // ── FRAMING THE RELOAD ────────────────────────────────────────────────
  // A viewmodel point at model (mx, my, mz) lands at world
  //   (0.3 + 0.15·mx + poseX, −0.3 + 0.15·my + poseY, −0.5 + 0.15·mz + poseZ)
  // after the reload rotations, and the frame at that depth is roughly
  // ±0.77·|z| vertically. Every magazine well sits around model y = −1 to −2,
  // i.e. world y ≈ −0.5, which is BELOW the bottom of the screen: the reload
  // poses used to dip the weapon DOWN, so the entire magazine swap — the empty
  // dropping, the fresh one going in — played off-frame and the player saw
  // nothing but the gun tilting.
  //
  // So the poses below LIFT the weapon (positive y) and tip the muzzle down
  // (negative rx, which rolls the well toward the camera), putting the action
  // on screen. If you retune one of these, check the well is still framed —
  // it is not obvious from the numbers alone, and lowering y hides the whole
  // animation again.

  /**
   * The support hand's magazine-swap path, plus an optional action-beat delta
   * layered on top (reaching for a bolt release, hauling a charging handle).
   */
  private setSwapHand(
    depth: number, slap: number,
    dx = 0, dy = 0, dz = 0, drx = 0, dry = 0, drz = 0,
  ) {
    this.setArmPose(
      this.supportHandGroup, this.supportHandRest,
      depth * 0.3 + dx,
      -depth * 2.0 + slap * 0.5 + dy,
      depth * 0.88 + dz,
      depth * 0.72 + drx,
      -depth * 0.34 + dry,
      depth * 0.26 + drz,
    );
  }

  /**
   * PISTOL — a competition-style slide-lock speed reload. The gun rolls hard
   * onto its side so the magwell presents itself to the support hand instead
   * of the shooter reaching blindly under the frame, the empty is dumped free,
   * a fresh magazine is driven home with the palm heel, and the slide stop is
   * thumbed off so the slide runs forward under spring pressure — fast enough
   * that it reads as a snap rather than a slide.
   */
  private animatePistolReload(ra: number) {
    const dip = this.reloadDip;
    // Levelled back out over the last stretch, ready to fire again.
    const work = dip * (1 - this.ss(this.seg(ra, 0.78, 0.95)) * 0.9);
    // Brought up and OUT into the shooter's workspace — in front of the chest,
    // not pulled into the face. That's both what a real speed reload looks like
    // and what frames the magwell: pushing the weapon away enlarges the visible
    // frame at its depth far more cheaply than lifting it does.
    this.setPose(
      -0.16 * work, 0.30 * work, -0.10 * work,
      -0.34 * work, 0.30 * work, 0.62 * work,
    );

    this.magSwap(ra, {
      release: 0.02, free: 0.13, pouch: 0.30, carry: 0.40, seat: 0.62,
      rockOut: 0.42, rockIn: 0.5,
    });

    // DRY only: the slide is held to the rear by the slide stop on an empty
    // gun and has to be released once the fresh magazine is home. On a tactical
    // reload there is still a round in the chamber, so the slide never moves —
    // which is the clearest visual tell between the two drills.
    const dry = this.reloadStyle === 'dry';
    if (this.slide) {
      const back = dry ? this.ss(this.seg(ra, 0, 0.1)) : 0;
      const run = this.ss(this.seg(ra, 0.70, 0.745));
      this.slide.position.z = this.slideRest + 0.74 * back * (1 - run);
    }
    if (dry) this.cue(ra, 0.70, 'slide_release');

    // Trigger-hand thumb: the magazine catch first, the slide stop later.
    const thumb = this.bump(ra, 0, 0.12) * 0.5 + (dry ? this.bump(ra, 0.64, 0.78) : 0);
    this.holdTriggerHand(thumb * 0.07, thumb * 0.06, -thumb * 0.08);
  }

  /**
   * RIFLE — the AR-pattern drill. Support hand comes off the handguard, the
   * empty drops straight out of the well, the fresh magazine is rocked in and
   * TUGGED to prove it locked (the detail that sells a reload as real), then
   * the hand travels up to slap the bolt release and send the carrier home.
   */
  private animateRifleReload(ra: number) {
    const dip = this.reloadDip;
    const work = dip * (1 - this.ss(this.seg(ra, 0.86, 1)) * 0.8);
    // Up and out into the workspace so the whole swap is on screen.
    this.setPose(
      -0.15 * work, 0.20 * work, -0.10 * work,
      -0.40 * work, 0.28 * work, 0.52 * work,
    );

    const swap = this.magSwap(ra, {
      release: 0.06, free: 0.18, pouch: 0.34, carry: 0.46, seat: 0.66,
      rockOut: 0.22, rockIn: 0.38, tug: 0.70,
    });

    // DRY only: the carrier is held open by the bolt catch and slams into
    // battery when the release paddle is struck. `run` is sharp — a bolt does
    // not glide forward. A tactical reload leaves the action closed entirely.
    const dry = this.reloadStyle === 'dry';
    if (this.bolt) {
      const back = dry ? this.ss(this.seg(ra, 0, 0.12)) : 0;
      const run = this.ss(this.seg(ra, 0.84, 0.875));
      this.bolt.position.z = this.boltRest + 1.2 * back * (1 - run);
    }
    if (dry) this.cue(ra, 0.84, 'bolt_rack');

    // After the tug the support hand rises to the bolt release, then returns —
    // layered ON the swap path so it flows out of the tug rather than snapping.
    const paddle = dry ? this.bump(ra, 0.78, 0.92) : 0;
    if (paddle > 0.001) {
      this.setSwapHand(
        swap.depth, swap.slap,
        paddle * 0.5, paddle * 0.55, paddle * 1.5, -paddle * 0.35, -paddle * 0.2, paddle * 0.3,
      );
    }
    this.holdTriggerHand(0, this.bump(ra, 0.84, 0.9) * 0.04);
  }

  /**
   * SMG — the same swap run hot and dirty. The whole weapon is canted further
   * over than the rifle, the long stick magazine has to be tipped in nose-first,
   * and it finishes on a side-mounted charging handle that gets yanked and
   * dropped rather than a bolt release paddle.
   */
  private animateSMGReload(ra: number) {
    const dip = this.reloadDip;
    const work = dip * (1 - this.ss(this.seg(ra, 0.84, 1)) * 0.85);
    // Up and out into the workspace, canted harder than the rifle.
    this.setPose(
      -0.16 * work, 0.22 * work, -0.10 * work,
      -0.34 * work, 0.32 * work, 0.70 * work,
    );

    const swap = this.magSwap(ra, {
      release: 0.02, free: 0.14, pouch: 0.28, carry: 0.38, seat: 0.60,
      rockOut: 0.55, rockIn: 0.72,
    });

    // DRY only: the charging handle is dragged back over ~0.1 of the window
    // then released to fly forward in a third of that time. Topping up an SMG
    // that still has a chambered round skips the rack completely.
    const dry = this.reloadStyle === 'dry';
    if (this.bolt) {
      const pull = dry ? this.ss(this.seg(ra, 0.68, 0.78)) : 0;
      const fly = this.ss(this.seg(ra, 0.79, 0.815));
      // Kept short: the receiver ends at z≈1.4 and the viewmodel's near plane
      // cuts in around z≈1.9, so a longer throw would just vanish off-screen.
      this.bolt.position.z = this.boltRest + 1.0 * pull * (1 - fly);
    }
    if (dry) this.cue(ra, 0.68, 'bolt_rack');

    // The support hand goes up and OUTBOARD to the handle on the receiver's
    // left, hauls it back, then snaps off it as the bolt flies home. Layered on
    // the swap path so it grows out of the mag slap instead of teleporting.
    const rack = this.seg(ra, 0.64, 0.80);
    const grab = dry ? Math.sin(rack * Math.PI) : 0;
    if (grab > 0.001) {
      this.setSwapHand(
        swap.depth, swap.slap,
        -grab * 0.55, grab * 0.5, grab * (0.4 + rack * 1.5), -grab * 0.3, grab * 0.42, -grab * 0.25,
      );
    }
    // A short muzzle shake as the bolt slams shut — the gun is light.
    const shake = this.bump(ra, 0.79, 0.9);
    this.holdTriggerHand(-shake * 0.05, shake * 0.06);
  }

  /**
   * SNIPER — the showpiece. A bolt-action rifle cannot be reloaded one-handed,
   * so the FIRING hand comes off the grip and works the bolt in its four real
   * motions: lift the handle to unlock, draw it back to extract, drive it
   * forward to chamber, turn it down to lock. The magazine change happens in
   * the middle, while the bolt is held open — everything is deliberate and
   * unhurried, and the rifle comes off the cheek weld and back onto it.
   */
  private animateSniperReload(ra: number) {
    const dip = this.reloadDip;
    // Off the shoulder, rolled right so the bolt and well are both reachable.
    const shoulder = this.ss(this.seg(ra, 0.94, 1)); // back to the cheek weld
    const work = dip * (1 - shoulder * 0.9);
    // Pushed AWAY from the eye (negative z), not drawn in. Both because that's
    // what you do to work a bolt off the shoulder, and because the bolt handle
    // sits far enough back that pulling the rifle in would take the whole throw
    // behind the camera's near plane, where none of it would be visible. The
    // lift puts both the bolt AND the magwell on screen (see FRAMING note).
    this.setPose(
      -0.13 * work, 0.18 * work, -0.12 * work,
      -0.32 * work, 0.26 * work, 0.46 * work,
    );

    // ── The bolt throw ──
    // DRY only. Running a bolt gun to empty leaves the action open, so all four
    // motions have to be worked. With a round still chambered the rifle is
    // topped up without ever touching the bolt — a much calmer, quicker drill.
    const dry = this.reloadStyle === 'dry';
    const lift = dry ? this.ss(this.seg(ra, 0.10, 0.22)) : 0;   // handle rotates up
    const draw = dry ? this.ss(this.seg(ra, 0.24, 0.38)) : 0;   // carrier travels back
    const push = dry ? this.ss(this.seg(ra, 0.86, 0.93)) : 0;   // driven forward again
    const lock = dry ? this.ss(this.seg(ra, 0.93, 0.99)) : 0;   // handle turns down
    if (this.bolt) {
      this.bolt.rotation.z = (lift - lock) * 1.18;
      this.bolt.position.z = this.boltRest + (draw - push) * 1.15;
    }
    if (dry) {
      this.cue(ra, 0.12, 'bolt_lift');
      this.cue(ra, 0.30, 'bolt_back');
      this.cue(ra, 0.88, 'bolt_forward');
      this.cue(ra, 0.94, 'bolt_lock');
    }

    // ── The magazine change, run while the action is open ──
    this.magSwap(ra, {
      release: 0.40, free: 0.50, pouch: 0.60, carry: 0.68, seat: 0.82,
      rockOut: 0.3, rockIn: 0.42,
    });

    // ── The trigger hand does the bolt work: off the grip, up and back over
    // the receiver, then home. This is what makes a bolt gun read as a bolt gun.
    // On a tactical top-up it never leaves the grip.
    const onBolt = dry
      ? this.ss(this.seg(ra, 0.04, 0.14)) * (1 - this.ss(this.seg(ra, 0.94, 1)))
      : 0;
    const travel = draw - push;
    this.setArmPose(
      this.triggerHandGroup, this.triggerHandRest,
      onBolt * 0.42,
      onBolt * (0.55 + lift * 0.35) - this.reloadDip * 0.06,
      onBolt * (-0.5 + travel * 1.3),
      -onBolt * 0.24,
      onBolt * 0.2,
      onBolt * (0.3 + lift * 0.4),
    );
  }

  /**
   * SHOTGUN — tube loading. The gun rolls over so the loading port faces the
   * hand, and shells go in one at a time: each is plucked from the carrier,
   * carried to the port and thumbed past the gate, with a real shell mesh
   * making the trip. The pump is racked once at the end, throwing the hull in
   * the chamber clear.
   */
  private animateShellReload(ra: number) {
    const dip = this.reloadDip;
    const rp = this.rp;
    const loadEnd = 0.78;
    // Rolled onto its side, muzzle down, port presented to the support hand.
    const level = this.ss(this.seg(ra, 0.9, 1));
    const work = dip * (1 - level * 0.9);
    // Up and out so the loading port is on screen (see FRAMING note above) —
    // the shells were previously thumbed in below the bottom of the frame.
    this.setPose(
      -0.12 * work, 0.16 * work, -0.08 * work,
      -0.26 * work, 0.30 * work, 0.58 * work,
    );

    if (ra < loadEnd) {
      // Cap the visible beats: a Drum Magazine perk can push the magazine well
      // past a dozen, and thumbing sixteen shells into a two-second window is
      // a blur. The floor is ONE — App passes the number of rounds actually
      // missing, so topping up a nearly-full tube really is a single shell.
      const beats = THREE.MathUtils.clamp(this.reloadShells, 1, 8);
      const phase = (ra / loadEnd) * beats;
      const idx = Math.min(beats - 1, Math.floor(phase));
      const local = phase - idx;           // 0..1 within this shell's trip
      // One shell's journey: plucked (0–0.35), carried up (0.35–0.75),
      // pushed through the gate (0.75–1.0).
      const carry = this.ss(this.seg(local, 0.3, 0.78));
      const push = this.ss(this.seg(local, 0.78, 1));

      if (rp.shell) {
        const h = rp.hold;
        // Port sits under the receiver, just ahead of the trigger guard.
        const portX = 0.16, portY = -0.62, portZ = 0.55;
        rp.shell.visible = true;
        rp.shell.position.set(
          THREE.MathUtils.lerp(h.x, portX, carry) + push * 0.05,
          THREE.MathUtils.lerp(h.y, portY, carry),
          THREE.MathUtils.lerp(h.z, portZ, carry) - push * 0.85, // driven in
        );
        rp.shell.rotation.set(-0.5 + carry * 0.5, 0, (1 - carry) * 0.7);
        rp.shell.scale.setScalar(1 - push * 0.75); // swallowed by the tube
      }
      this.cue(ra, (idx + 0.88) / beats * loadEnd, 'shell_insert', idx + 1);

      // The carrier flexes as each round is forced past it.
      if (this.magazine) this.magazine.position.y = this.magRestY - push * 0.22;

      // Support hand mirrors the shell's trip: down at the carrier when
      // carry=0, up under the receiver at the port when carry=1. The hand does
      // NOT travel all the way to the port — the shell covers that last stretch
      // on its own, which is both how it reads and what keeps the forearm from
      // being dragged through the receiver. `engage` eases it off the pump at
      // the start rather than teleporting it to the carrier on frame one.
      const engage = this.ss(this.seg(ra, 0, 0.1));
      const shove = this.bump(local, 0.78, 1) * 0.3;
      // Down-y matched to `hold` (grip − 2.25) so the shell sits IN the fist
      // rather than floating below it.
      this.setArmPose(
        this.supportHandGroup, this.supportHandRest,
        engage * (-0.4 + carry * 0.5),
        engage * (-2.15 + carry * 1.25),
        engage * (0.9 + carry * 1.5) - shove,
        engage * (0.62 - carry * 0.2),
        engage * 0.36,
        engage * (0.3 - carry * 0.16),
      );
      if (this.slide) this.slide.position.z = this.slideRest;
      this.holdTriggerHand();
    } else {
      // ── Final pump cycle ──
      const p = this.seg(ra, loadEnd, 1);
      // The hand leaves the loading pose (its state at carry = 1, where the
      // loading loop hands off) and travels forward onto the pump. Blending
      // out of that exact pose is what keeps the handoff seamless.
      const off = this.ss(this.seg(p, 0, 0.22));
      const back = this.ss(this.seg(p, 0, 0.42));
      const fwd = this.ss(this.seg(p, 0.46, 0.7));
      const stroke = back - fwd;
      if (rp.shell) rp.shell.visible = false;
      if (this.slide) this.slide.position.z = this.slideRest + stroke * 1.7;
      if (this.magazine) this.magazine.position.y = this.magRestY;
      this.cue(ra, loadEnd + (1 - loadEnd) * 0.42, 'pump_rack');

      // The chambered hull is thrown clear as the action opens.
      if (rp.ejectedShell) {
        const e = this.seg(p, 0.34, 0.95);
        if (e > 0 && e < 1) {
          rp.ejectedShell.visible = true;
          rp.ejectedShell.position.set(0.7 + e * 3.4, 0.4 + e * 1.1 - e * e * 4.6, -0.2 + e * 1.2);
          rp.ejectedShell.rotation.set(e * 9, e * 5, e * 6.5);
        } else {
          rp.ejectedShell.visible = false;
        }
      }
      const hold = 1 - off; // the loading pose still bleeding out
      this.setArmPose(
        this.supportHandGroup, this.supportHandRest,
        hold * 0.1,
        hold * -0.9 - stroke * 0.45,
        hold * 2.4 + stroke * 1.7,
        hold * 0.42,
        hold * 0.36,
        hold * 0.14 + stroke * 0.15,
      );
      // The whole gun rocks against the stroke — a pump gun has real mass.
      this.holdTriggerHand(-stroke * 0.05, stroke * 0.09);
    }
  }

  /**
   * MINIGUN — not a magazine change at all: a two-handed hardware job on a
   * belt-fed rotary cannon. The barrels spin down to a dead stop, the feed
   * cover is unlatched and swung open, the spent belt is stripped out, the
   * drum is unlatched and rocked back onto its mount, a fresh belt is dragged
   * link by link into the feed throat, the cover is slammed shut and the
   * cluster is spun back up to speed.
   */
  private animateBeltReload(ra: number) {
    const dip = this.reloadDip;
    const rp = this.rp;
    // Canted over and tipped back so the top-mounted feed is workable, and
    // held OUT rather than in: the feed throat, drum and belt all live at the
    // rear of the model, which the viewmodel's near plane would swallow if the
    // weapon were drawn toward the camera.
    const work = dip * (1 - this.ss(this.seg(ra, 0.9, 1)) * 0.85);
    this.setPose(
      0.05 * work, -0.2 * work, -0.12 * work,
      0.24 * work, -0.2 * work, -0.34 * work,
    );

    // Barrel cluster: braked to a dead stop for the feed job, then wound back
    // up — the motor over-spins the cluster and lets it settle to the idle rate
    // by the final frame, so handing control back to the idle spin is seamless
    // instead of snapping from full speed to a crawl.
    const brake = this.ss(this.seg(ra, 0, 0.1));
    const wind = this.ss(this.seg(ra, 0.86, 1));
    this.reloadSpin = (1 - brake) * 1.4 + wind * 1.4 + this.bump(ra, 0.86, 1) * 13;

    // ── Feed cover ──
    const open = this.ss(this.seg(ra, 0.10, 0.26));
    const shut = this.ss(this.seg(ra, 0.78, 0.845));
    if (rp.feedCover) rp.feedCover.rotation.x = (open - shut) * 1.15;
    this.cue(ra, 0.08, 'cover_open');
    this.cue(ra, 0.80, 'cover_close');

    // ── Belt: stripped out link by link, then a fresh one dragged back in ──
    const strip = this.ss(this.seg(ra, 0.26, 0.44));
    const feed = this.ss(this.seg(ra, 0.56, 0.78));
    const n = rp.beltLinks.length;
    for (let i = 0; i < n; i++) {
      const link = rp.beltLinks[i];
      // Links leave from the FEED end first and come back from the DRUM end,
      // so the belt visibly pays out and then threads through.
      const outAt = this.ss(this.seg(strip, i / n, (i + 1) / n));
      const inAt = this.ss(this.seg(feed, (n - 1 - i) / n, (n - i) / n));
      const present = Math.max(0, 1 - outAt) + inAt;
      link.visible = present > 0.02;
      link.scale.setScalar(THREE.MathUtils.clamp(present, 0.02, 1));
    }
    if (rp.belt) rp.belt.position.z = (1 - feed) * strip * 0.7;
    this.cue(ra, 0.56, 'belt_feed');

    // ── Drum: unlatched, rocked out on its mount and reseated ──
    // Its body carries a baked rotation.z = π/2, so the drum's own axis runs
    // along X: rotation.x SPINS it, while y/z swing it off the mount.
    const rock = this.bump(ra, 0.42, 0.62);
    if (rp.drum) {
      rp.drum.rotation.x = feed * 3.2;  // paying the fresh belt out
      rp.drum.rotation.y = rock * 0.3;  // swung out on its latch and back
      rp.drum.position.z = 3.4 + rock * 0.5;
    }

    this.cue(ra, 0.86, 'spin_up');

    // ── Hands: the support hand does the cover and the belt; the trigger hand
    // stays on its spade grip to hold 40kg of cannon steady, bracing hard for
    // the spin-up. The feed sits UP and FORWARD of the spade grips, so the
    // reach is +y and −z.
    const atCover = this.ss(this.seg(ra, 0.04, 0.16)) * (1 - this.ss(this.seg(ra, 0.80, 0.92)));
    const haul = this.bump(ra, 0.5, 0.8);
    this.setArmPose(
      this.supportHandGroup, this.supportHandRest,
      atCover * 0.3 - haul * 0.4,
      atCover * 1.5 + haul * 0.3,
      -atCover * (0.7 + haul * 0.9),
      -atCover * 0.5,
      atCover * 0.25,
      -atCover * 0.3,
    );
    const brace = this.ss(this.seg(ra, 0.86, 0.94)) * (1 - this.ss(this.seg(ra, 0.96, 1)));
    this.holdTriggerHand(-brace * 0.12, brace * 0.1);
  }

  /**
   * LAUNCHER — a muzzle-loaded rocket, one round at a time (GTA IV's RPG).
   *
   * The tube is EMPTY from the first frame — the last round is what just left
   * it — so the reload is genuinely "put a rocket in an empty tube" rather
   * than a magazine change dressed up. The launcher comes down off the
   * shoulder and swings its mouth inboard into view, the support hand goes
   * back for a round and brings it up, the round is squared to the bore and
   * slid down the tube motor-first until it bottoms out, the arming pin is
   * pulled, and the whole thing is hefted back onto the shoulder.
   *
   * `autoReload` on the weapon (see types/game.ts) starts this the instant the
   * tube empties, so every shot is followed by a visible reload.
   */
  private animateRocketReload(ra: number) {
    const dip = this.reloadDip;
    const rp = this.rp;
    // Off the shoulder, muzzle swung up and inboard so the tube mouth comes
    // round into frame where the loading can actually be seen.
    const shoulder = this.ss(this.seg(ra, 0.90, 1));
    const work = dip * (1 - shoulder * 0.92);
    this.setPose(
      -0.10 * work, -0.04 * work, 0.10 * work,
      0.30 * work, 0.44 * work, 0.46 * work,
    );

    // The tube stays empty until the fresh round bottoms out.
    if (rp.seatedRocket) rp.seatedRocket.visible = ra >= 0.74;

    // ── The round's trip: up from the pouch, onto the bore line, down the tube ──
    const lift = this.ss(this.seg(ra, 0.12, 0.36));   // brought up into frame
    const align = this.ss(this.seg(ra, 0.36, 0.48));  // squared up with the bore
    const slide = this.ss(this.seg(ra, 0.48, 0.74));  // rammed home
    if (rp.loadRocket) {
      // Handoff at exactly 0.74, where the carried round has reached the seated
      // position with the seated round's pose — one visible, never both, so the
      // two identical meshes can't z-fight through the swap.
      const visible = ra >= 0.10 && ra < 0.74;
      rp.loadRocket.visible = visible;
      if (visible) {
        const h = rp.hold;
        // Held just ahead of the tube mouth (the front ring sits at z = −6.1),
        // then driven back to the seated position. The round goes in
        // motor-first, so its tail leads and the warhead ends up proud of the
        // muzzle exactly as it sits at rest.
        const mouthZ = -8.3, seatZ = -6.4;
        rp.loadRocket.position.set(
          THREE.MathUtils.lerp(h.x, 0, align) * (1 - lift * 0.35),
          THREE.MathUtils.lerp(h.y, 0.3, lift * 0.65 + align * 0.35),
          THREE.MathUtils.lerp(
            THREE.MathUtils.lerp(h.z, mouthZ, lift),
            THREE.MathUtils.lerp(mouthZ, seatZ, slide),
            align,
          ),
        );
        // Carried nose-down and canted, rolling level as it lines up with the bore.
        rp.loadRocket.rotation.set(
          (1 - align) * -0.75, (1 - align) * 0.6, (1 - lift * 0.5) * (1 - align) * 0.9,
        );
      }
    }
    this.cue(ra, 0.14, 'rocket_lift');
    this.cue(ra, 0.48, 'rocket_slide');
    this.cue(ra, 0.74, 'rocket_seat');

    // Seating shove, then the arming pin on the side of the tube.
    const shove = this.bump(ra, 0.70, 0.79);
    const pin = this.bump(ra, 0.78, 0.89);
    this.cue(ra, 0.82, 'pin_pull');

    // Support hand: carries the round in, shoves it home, then comes back for
    // the pin — a long, deliberate two-stage travel.
    const carry = this.ss(this.seg(ra, 0.04, 0.18)) * (1 - this.ss(this.seg(ra, 0.86, 0.98)));
    this.setArmPose(
      this.supportHandGroup, this.supportHandRest,
      carry * (0.2 - pin * 0.5),
      -carry * (2.2 - lift * 1.7) + pin * 0.4,
      carry * (1.2 - slide * 2.4) + shove * 0.5 + pin * 1.6,
      carry * 0.4,
      -carry * 0.3,
      carry * 0.3,
    );
    // The launcher kicks back a touch as the round bottoms out, then the
    // trigger hand hauls it up onto the shoulder as the reload closes out.
    this.holdTriggerHand(-shove * 0.08 + shoulder * 0.1, shove * 0.06);
  }

  /**
   * SUBVERTER — a chip cartridge swap on a hacking deck. The spent cartridge
   * is blown out of the rear bay and tumbles away, the deck purges (every chip
   * dark), a fresh cartridge is slammed into the bay, and the four intrusion
   * chips then materialise into their slots one at a time as the deck writes
   * them — each with its own seat blip, rising in pitch as the bay fills.
   */
  private animateSubverterReload(ra: number) {
    const dip = this.reloadDip;
    const rp = this.rp;
    this.subReloadGlow = 1;
    // Deck tilted up toward the player so the bay and the screen both read.
    // The z pull is deliberately small — the chip bay already sits near the
    // rear of the deck, and drawing it in would push the chips past the near
    // plane just as they're supposed to be the thing you're watching.
    const work = dip * (1 - this.ss(this.seg(ra, 0.9, 1)) * 0.85);
    this.setPose(
      -0.04 * work, -0.1 * work, 0.04 * work,
      -0.26 * work, 0.18 * work, 0.3 * work,
    );

    const n = this.subChips.length;

    // ── Spent cartridge blown out of the rear bay ──
    this.cue(ra, 0.06, 'cartridge_out');
    if (rp.spentCart) {
      const e = this.seg(ra, 0.06, 0.34);
      const live = e > 0 && e < 1;
      rp.spentCart.visible = live;
      if (live) {
        // Thrown up and out to the LEFT rather than straight back — anything
        // travelling rearward here is behind the camera within a few frames.
        rp.spentCart.position.set(-e * 2.4, 0.5 + e * 2.1 - e * e * 6.4, 2.5 + e * 1.5);
        rp.spentCart.rotation.set(e * 4.2, e * 1.6, e * 3.1);
      }
    }

    // ── Fresh cartridge driven into the bay, then drawn down flush into it ──
    // Sinking it below the chassis line is how it leaves frame; blinking it out
    // of existence the instant it seats would read as a glitch.
    const insert = this.ss(this.seg(ra, 0.34, 0.54));
    const sink = this.ss(this.seg(ra, 0.54, 0.60));
    if (rp.freshCart) {
      const live = ra >= 0.32 && ra < 0.61;
      rp.freshCart.visible = live;
      if (live) {
        rp.freshCart.position.set(
          0,
          0.5 + (1 - insert) * 1.6 - sink * 0.55,
          2.5 + (1 - insert) * 3.6,
        );
        rp.freshCart.rotation.set((1 - insert) * -0.5, 0, 0);
      }
    }
    this.cue(ra, 0.54, 'cartridge_in');

    // ── Chips written back into their slots, one at a time ──
    for (let i = 0; i < n; i++) {
      const c = this.subChips[i];
      const at = 0.60 + (i / n) * 0.32;
      if (ra >= at) {
        if (c.target !== 0) { c.target = 0; c.flash = 1; c.group.visible = true; }
        this.cue(ra, at, 'chip_seat', i + 1);
      } else {
        c.target = 1; c.offset = 1; c.group.visible = false;
      }
    }
    this.cue(ra, 0.95, 'deck_boot');

    // Support hand swaps the cartridge at the rear of the deck, then returns.
    const reach = this.ss(this.seg(ra, 0.04, 0.2)) * (1 - this.ss(this.seg(ra, 0.58, 0.78)));
    const ram = this.bump(ra, 0.44, 0.58);
    this.setArmPose(
      this.supportHandGroup, this.supportHandRest,
      -reach * 0.3, -reach * 1.6, reach * 1.3 - ram * 0.9, reach * 0.5, reach * 0.3, -reach * 0.2,
    );
    this.holdTriggerHand(-ram * 0.06, ram * 0.05);
  }

  /**
   * Integrate the discarded magazine's fall. Runs in model space (so the mag
   * rides the viewmodel, the standard first-person compromise) but with real
   * gravity and tumble, and it deliberately keeps running after the reload
   * ends so a fast reload can't leave a magazine hanging in mid-air. The
   * landing clatter fires when it passes the "ground" line.
   */
  private updateMagFall(delta: number) {
    const m = this.magFall;
    if (!m.active) return;
    const mesh = this.rp.spentMag;
    if (!mesh) { m.active = false; return; }

    m.vy -= 52 * delta;         // gravity, tuned so it clears frame in ~0.6s
    m.y += m.vy * delta;
    m.z += m.vz * delta;
    mesh.position.y = m.y;
    mesh.position.z = m.z;
    mesh.rotation.x += m.spinX * delta;
    mesh.rotation.z += m.spinZ * delta;

    const ground = this.magRestY - 9.5;
    if (!m.landed && m.y <= ground) {
      m.landed = true;
      this.emit('mag_drop');
    }
    if (m.y <= this.magRestY - 13) {
      m.active = false;
      mesh.visible = false;
    }
  }

  /** Reset every reloadable part to rest and end the reload. */
  private finishReload() {
    this.isReloading = false;
    this.reloadAnimation = 0;
    this.reloadDip = 0;
    // Zero the tremor BEFORE the pose reset, or setPose would re-apply it.
    this.reloadPanic = 0;
    this.setPose(0, 0, 0, 0, 0, 0);
    this.reloadSpin = -1;
    if (this.magazine) {
      this.magazine.position.y = this.magRestY;
      this.magazine.rotation.set(0, 0, 0);
      this.magazine.visible = true;
    }
    if (this.slide) this.slide.position.z = this.slideRest;
    if (this.bolt) {
      this.bolt.position.z = this.boltRest;
      this.bolt.rotation.set(0, 0, 0);
    }
    // Park the props — except a magazine still in the air, which finishes its
    // fall on its own clock (updateMagFall hides it when it's gone).
    this.parkReloadProps(this.rp, this.magFall.active);

    if (this.currentWeaponType === 'subverter') {
      // All chips fully seated; the live count is back to the deck capacity.
      for (const c of this.subChips) { c.target = 0; c.group.visible = true; }
      this.subLoaded = this.subChips.length;
      this.subReloadGrace = 0.3; // protect the fresh chips while App catches up
    }
  }

  /**
   * Mirror the equipped weapon's mass (WEAPONS[].weight) into the viewmodel.
   * Called every frame from the game loop rather than at each switch site, so
   * it can never drift out of sync with the weapon actually being carried.
   */
  setWeaponMass(weight: number) {
    this.weaponMass = THREE.MathUtils.clamp(weight, 0.5, 4);
  }

  /**
   * Weapon inertia — the weight system.
   *
   * `dYaw`/`dPitch` are how far the CAMERA turned this frame (radians). The
   * gun is left behind by exactly that much and then springs back, so whipping
   * the view drags the weapon across the screen and it settles with a wobble
   * instead of being rigidly welded to the eye.
   *
   * Mass sets the spring: a heavy weapon has a softer spring (lags further,
   * takes longer to catch up) and a lower damping ratio (it wallows on arrival
   * rather than snapping still). The offset is clamped so a fast 180° spin
   * throws the weapon convincingly wide without flinging it off screen.
   */
  updateInertia(delta: number, dYaw: number, dPitch: number) {
    // Guard against the huge dt of a tab-restore/hitch turning into a launch.
    const dt = Math.min(delta, 0.05);
    const m = this.weaponMass;
    // Heavier → softer spring → longer, lazier lag.
    const stiffness = 175 / (0.55 + m * 0.58);
    // Heavier → less damping → more settle wobble on arrival.
    const ratio = 0.78 - Math.min(0.26, m * 0.075);
    const damping = 2 * ratio * Math.sqrt(stiffness);
    const MAX = 0.16;

    const step = (off: number, vel: number, look: number): [number, number] => {
      // The gun keeps pointing where it was: the camera's turn becomes offset.
      let o = off - look;
      o = THREE.MathUtils.clamp(o, -MAX, MAX);
      const accel = -stiffness * o - damping * vel;
      const v = vel + accel * dt;
      o = THREE.MathUtils.clamp(o + v * dt, -MAX, MAX);
      return [o, v];
    };
    [this.swing.yaw, this.swingVel.yaw] = step(this.swing.yaw, this.swingVel.yaw, dYaw);
    [this.swing.pitch, this.swingVel.pitch] = step(this.swing.pitch, this.swingVel.pitch, dPitch);
  }

  /** Update idle sway — a gentle figure-8 "breathing" drift so the weapon
   *  feels alive at rest. Heavier weapons breathe slower and wider: a big gun
   *  is harder to hold still, which reads as weight even standing still. */
  updateIdleSway(delta: number) {
    const m = this.weaponMass;
    // Bigger amplitude, lower frequency as mass climbs.
    const amp = 0.6 + m * 0.5;
    const rate = 1.15 - Math.min(0.45, m * 0.18);
    this.idleSwayTime += delta * rate;
    this.swayOffset.rotX = (Math.sin(this.idleSwayTime * 0.85) * 0.0016
      + Math.sin(this.idleSwayTime * 1.9) * 0.0005) * amp;
    this.swayOffset.rotY = Math.cos(this.idleSwayTime * 0.65) * 0.0013 * amp;
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

      // Mass amplifies the bob: every footfall has to shift the weapon's
      // weight, so a rotary cannon lurches where a pistol ticks.
      const mass = 0.72 + this.weaponMass * 0.34;
      const intensity = (isRunning ? 0.013 : 0.0075) * mass;
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

  /**
   * Smoothly transition the weapon between hip-fire and aim-down-sights.
   * Mass sets how fast it comes up: a sidearm snaps to the sights, a rotary
   * cannon has to be hauled into position. Shouldering speed is one of the
   * most immediate weight cues the player feels, because they ask for it.
   */
  updateAim(delta: number, isAiming: boolean) {
    const target = isAiming ? 1 : 0;
    const rate = 14.5 - Math.min(7, this.weaponMass * 2.3);
    this.aimProgress += (target - this.aimProgress) * Math.min(1, delta * rate);
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
    // Heavy weapons take longer to recover from the landing compression.
    const landRate = 5.2 - Math.min(2.2, this.weaponMass * 0.75);
    if (this.landAnim > 0) this.landAnim = Math.max(0, this.landAnim - delta * landRate);

    // The gun lags the camera: it drops when you accelerate upward off the
    // ground and floats up as you fall — classic weapon-inertia feel, scaled
    // by mass so heavy ordnance sinks harder on the way up.
    const mass = 0.7 + this.weaponMass * 0.36;
    const lim = 0.13 * mass;
    const targetY = isAirborne
      ? THREE.MathUtils.clamp(-verticalVelocity * 0.55 * mass, -lim, lim * 1.08)
      : 0;
    const targetRotX = isAirborne
      ? THREE.MathUtils.clamp(verticalVelocity * 0.45 * mass, -0.12 * mass, 0.12 * mass)
      : 0;
    const k = Math.min(1, delta * (9.5 - Math.min(3.5, this.weaponMass * 1.2)));
    this.jumpOffset.y += (targetY - this.jumpOffset.y) * k;
    this.jumpOffset.rotX += (targetRotX - this.jumpOffset.rotX) * k;
  }

  /** Decay the one-shot action flourishes (abilities, dash, weapon equip). */
  updateActions(delta: number) {
    if (this.abilityAnim > 0) this.abilityAnim = Math.max(0, this.abilityAnim - delta * 3);
    if (this.dashAnim > 0) this.dashAnim = Math.max(0, this.dashAnim - delta * 3.6);
    // Melee: ~0.36s total — long enough for the windup → strike → recover
    // choreography to read, still snappy against the 900ms cooldown.
    if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - delta * 2.8);
    // Weapon draw scales with mass: a sidearm comes up almost instantly, a
    // rotary cannon has to be hauled into position. Together with the
    // mass-scaled ADS speed this is what the player feels when they swap TO a
    // heavy weapon — the cost of carrying it, paid up front.
    if (this.equipAnim > 0) {
      const drawRate = 3.5 - Math.min(1.7, this.weaponMass * 0.58);
      this.equipAnim = Math.max(0, this.equipAnim - delta * drawRate);
    }
    // Ease the wiring bend toward its target (engineer demolition).
    this.wireAnim += (this.wiringTarget - this.wireAnim) * Math.min(1, delta * 8);
    if (this.wiringTarget === 0 && this.wireAnim < 0.001) this.wireAnim = 0;
    if (this.inspectActive) {
      this.inspectTime += delta;
      if (this.inspectTime >= this.INSPECT_DURATION) {
        this.inspectActive = false;
        this.inspectTime = 0;
      }
    }

    // ── Subverter screen / emitter / chip life ──
    if (this.currentWeaponType === 'subverter') {
      this.subTime += delta;
      if (this.subDeploy > 0) this.subDeploy = Math.max(0, this.subDeploy - delta * 2.2);
      if (!this.isReloading && this.subReloadGlow > 0) {
        this.subReloadGlow = Math.max(0, this.subReloadGlow - delta * 1.6);
      }
      if (this.subReloadGrace > 0) this.subReloadGrace = Math.max(0, this.subReloadGrace - delta);
      const t = this.subTime;
      const deploy = this.subDeploy; // 1 just-fired → 0

      // Repaint the live "code-rain" display (surges on deploy, washes on reload).
      this.paintScreen(deploy, this.isReloading ? 1 : 0);

      // Screen emissive breathes + flickers; flares white-green on a deploy.
      if (this.subScreenMat) {
        const flicker = 0.95 + Math.sin(t * 7.3) * 0.12 + Math.sin(t * 23.0) * 0.06;
        this.subScreenMat.emissiveIntensity = flicker + deploy * 2.2 + this.subReloadGlow * 0.6;
      }
      // Emitter charge eases up while a chip is in flight, then idles dim.
      let inFlight = 0;
      for (const c of this.subChips) inFlight = Math.max(inFlight, c.offset > 0.04 && c.offset < 0.96 ? 1 : 0);
      this.subEmitterCharge += (Math.max(deploy, inFlight) - this.subEmitterCharge) * Math.min(1, delta * 9);
      if (this.subEmitterMat) {
        this.subEmitterMat.emissiveIntensity = 0.8 + Math.sin(t * 9) * 0.25 + this.subEmitterCharge * 4.2;
      }
      // Edge sequencer rails ripple in sequence like scrolling output.
      for (let i = 0; i < this.subCodeMats.length; i++) {
        const phase = t * 4.5 - i * 0.9;
        this.subCodeMats[i].emissiveIntensity = 0.35 + Math.max(0, Math.sin(phase)) * 0.9 + deploy * 1.6;
      }
      // Status antenna tip blinks (and pops on deploy).
      if (this.subAntennaTip) {
        const blink = (Math.sin(t * 5) > 0.4 ? 1 : 0.25) + deploy;
        this.subAntennaTip.scale.setScalar(0.7 + blink * 0.5);
      }

      // ── Per-chip eject/insert animation ──
      // Each chip eases toward its target offset (0 seated → 1 launched). A
      // launched chip rises out of its slot, accelerates forward into the
      // emitter, tumbles and shrinks to nothing; a seated chip rests with a soft
      // contact-pad pulse. `flash` flares the core on eject/seat.
      for (const c of this.subChips) {
        c.offset += (c.target - c.offset) * Math.min(1, delta * 11);
        if (c.flash > 0) c.flash = Math.max(0, c.flash - delta * 3);
        const o = c.offset;
        if (o > 0.985 && c.target === 1) {
          c.group.visible = false;
          c.glowMat.opacity = 0;
          continue;
        }
        c.group.visible = true;
        c.group.position.y = c.baseY + o * 1.15;
        c.group.position.z = c.baseZ - o * o * 4.9;       // sucked toward the front emitter
        c.group.scale.setScalar(Math.max(0.02, 1 - o * 0.86));
        c.group.rotation.x = o * 1.7;                      // tumbles as it launches
        const flight = o * (1 - o);                        // peaks mid-travel
        c.core.emissiveIntensity = 1.0 + c.flash * 2.6 + flight * 3.0;
        c.glowMat.opacity = Math.min(0.95, c.flash * 0.8 + flight * 2.2);
      }
    }
  }

  /** Subverter: one-shot deploy flourish — surges the screen/emitter glow and
   *  drives a forward "jab" of the deck (see applyAnimations). The chip itself
   *  is launched by updateSubverterAmmo when the live count drops. */
  triggerDeploy() {
    this.subDeploy = 1;
    this.subEmitterCharge = 1;
    this.abilityAnim = Math.max(this.abilityAnim, 0.6); // a small upward flick
  }

  // ── Subverter chip bay control ───────────────────────────────────────────

  /** Fire one chip: launch the top-loaded chip off the deck into the emitter. */
  private ejectChip(i: number) {
    const c = this.subChips[i];
    if (!c) return;
    c.target = 1;
    c.flash = 1;
    c.group.visible = true;
  }

  /** Seat one chip back into its slot (a pickup top-up; reloads use their own
   *  staggered routine). */
  private insertChip(i: number, animate: boolean) {
    const c = this.subChips[i];
    if (!c) return;
    c.group.visible = true;
    c.target = 0;
    c.flash = 1;
    if (!animate) c.offset = 0;
  }

  /**
   * Keep the deck's visible chips in lockstep with the live ammo count. Called
   * every frame from the game loop. A drop launches the top chip(s); a rise
   * (ammo pickup) slams chip(s) back in. While a reload is running the reload
   * routine owns the bay, so this no-ops to avoid fighting it.
   */
  updateSubverterAmmo(ammo: number) {
    if (this.currentWeaponType !== 'subverter' || this.subChips.length === 0) return;
    if (this.isReloading) return;
    const want = THREE.MathUtils.clamp(Math.floor(ammo), 0, this.subChips.length);
    if (want === this.subLoaded) return;
    if (want < this.subLoaded) {
      // Just reloaded: the chips are visually full but App may still be pushing
      // ammo back up — don't re-eject during the grace window.
      if (this.subReloadGrace > 0) return;
      for (let i = this.subLoaded - 1; i >= want; i--) this.ejectChip(i);
    } else {
      for (let i = this.subLoaded; i < want; i++) this.insertChip(i, true);
    }
    this.subLoaded = want;
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

  /** A quick upward flourish + flick when an ability is cast. */
  triggerAbility() {
    this.abilityAnim = 1;
  }

  /** Engineer demolition: hold the gun low in a "wiring the barrel" pose. */
  setWiring(on: boolean) {
    this.wiringTarget = on ? 1 : 0;
  }

  /** A sharp braced pull-back when the player dashes. */
  triggerDash() {
    this.dashAnim = 1;
  }

  // Per-weapon melee choreography: `w` is the WINDUP pose (cocked back, ready
  // to swing) and `s` the STRIKE pose (the hit frame) as additive offsets
  // [x, y, z, rotX, rotY, rotZ]. Each light weapon swings like the object it
  // is — the pistol whips down across the screen, the rifle drives its stock
  // forward, the shotgun sweeps a horizontal buttstock smash, the SMG throws a
  // straight muzzle jab, and the subverter slams its deck down edge-first.
  private static readonly MELEE_POSES: Partial<Record<WeaponType, { w: number[]; s: number[] }>> = {
    pistol:    { w: [ 0.10,  0.11,  0.07,  0.50,  0.16, -0.38], s: [-0.10, -0.02, -0.40, -0.60, -0.26,  0.48] },
    rifle:     { w: [ 0.08,  0.05,  0.17,  0.22,  0.58,  0.26], s: [-0.06,  0.02, -0.54, -0.32, -0.58,  0.36] },
    shotgun:   { w: [ 0.17,  0.05,  0.11,  0.10,  0.68, -0.16], s: [-0.30, -0.04, -0.46, -0.16, -0.80,  0.32] },
    smg:       { w: [ 0.02, -0.04,  0.15,  0.13,  0.00, -0.10], s: [ 0.00,  0.03, -0.60, -0.20, -0.10,  0.13] },
    subverter: { w: [ 0.00,  0.22,  0.09,  0.58,  0.00, -0.13], s: [ 0.00, -0.15, -0.44, -0.66,  0.00,  0.20] },
  };

  /** One-shot melee strike. No-op for heavy weapons (no pose defined). */
  triggerMelee() {
    if (!MELEE_CAPABLE_WEAPONS.has(this.currentWeaponType)) return;
    this.meleeAnim = 1;
  }

  /**
   * Active-reload success: fast-forward the remaining hand animation so it
   * completes in `remainingSec` (instead of the original full window). The
   * playhead position is preserved — only the playback rate changes — so the
   * mag-slam / shell-thumb choreography still finishes cleanly, just snappier.
   */
  accelerateReload(remainingSec: number) {
    if (!this.isReloading) return;
    const left = Math.max(0.001, 1 - this.reloadAnimation);
    this.reloadDuration = Math.max(0.05, remainingSec) / left;
  }

  /**
   * How far into the scope picture the player is, 0..1 (always 0 for weapons
   * without a magnified optic). App maps this to the scope overlay's veil and
   * aperture — see SCOPED_WEAPONS for why the 3D optic can't be looked through.
   */
  getScopeBlend(): number {
    return SCOPED_WEAPONS.has(this.currentWeaponType) ? this.aimProgress : 0;
  }

  /**
   * Hand the weapon back from the scope picture immediately. Called when the
   * game loop bails out (pause, game over, tutorial overlay) — that skips
   * applyAnimations, so a player who pauses while scoped would otherwise be
   * left staring at a scene with no weapon in it while the overlay is gone.
   */
  clearScope() {
    if (this.activeRig && !this.activeRig.root.visible) {
      this.activeRig.root.visible = true;
    }
  }

  /** Apply all animation offsets — call AFTER all update methods. */
  applyAnimations() {
    const aim = this.aimProgress;

    // Hand the view over to the scope picture. The whole rig goes — barrel and
    // hands included, since none of it is in front of your eye when you're
    // looking down a scope. App's veil is already opaque by this point, so the
    // swap happens behind a dark screen rather than as a visible pop.
    if (this.activeRig) {
      const takeover = SCOPED_WEAPONS.has(this.currentWeaponType) && aim >= SCOPE_TAKEOVER;
      if (this.activeRig.root.visible === takeover) this.activeRig.root.visible = !takeover;
    }
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
    // Subverter deploy "jab" — thrusts the deck forward as a chip launches.
    const deployJab = Math.sin(this.subDeploy * Math.PI);
    // ── MELEE: three-phase per-weapon strike ──────────────────────────────
    // Progress runs 0→1 as meleeAnim decays. The weapon first COCKS into its
    // windup pose (0–26%), SNAPS to the strike pose (26–52%, with a small
    // overshoot so the hit lands with a crack), then RECOVERS back to rest.
    // Pose pairs live in MELEE_POSES; weapons without one (heavy ordnance)
    // never have meleeAnim > 0 (triggerMelee gates on the same table's set).
    let mX = 0, mY = 0, mZ = 0, mRX = 0, mRY = 0, mRZ = 0;
    if (this.meleeAnim > 0) {
      const pose = GunModel.MELEE_POSES[this.currentWeaponType];
      if (pose) {
        const p = 1 - this.meleeAnim;
        const strike = this.ss((p - 0.26) / 0.24);
        const recover = this.ss((p - 0.58) / 0.42);
        const windupBlend = this.ss(p / 0.26) * (1 - strike);
        // Overshoot: the strike briefly exceeds its pose by 12% at full snap,
        // selling the impact, then the recover envelope pulls it home.
        const strikeBlend = strike * (1 + 0.12 * Math.sin(strike * Math.PI)) * (1 - recover);
        const w = pose.w, s = pose.s;
        mX = w[0] * windupBlend + s[0] * strikeBlend;
        mY = w[1] * windupBlend + s[1] * strikeBlend;
        mZ = w[2] * windupBlend + s[2] * strikeBlend;
        mRX = w[3] * windupBlend + s[3] * strikeBlend;
        mRY = w[4] * windupBlend + s[4] * strikeBlend;
        mRZ = w[5] * windupBlend + s[5] * strikeBlend;
      }
    }

    // Strafe lean — cant the weapon toward the movement direction. Suppressed
    // during the sprint pose (which already cants the gun across the body), and
    // amplified by ~70% while aiming so ADS strafing reads as a deliberate lean.
    const leanAmp = (1 - sprint) * (0.7 + 0.7 * this.aimedStrafe);
    const lean = this.strafeLean * leanAmp;
    const leanRoll = -lean * 0.16;  // roll/cant (top of gun tips into the strafe)
    const leanShift = lean * 0.035; // weapon trails slightly against the motion
    const leanYaw = -lean * 0.05;   // a touch of yaw for depth

    // Reload working posture — a full 6-DOF pose written by whichever
    // per-weapon choreography is running (see setPose). Every gun presents the
    // part being worked to the hand differently, so there is no shared term.
    const rl = this.reloadPose;

    // ── WEAPON INERTIA ──────────────────────────────────────────────────
    // The spring lag from updateInertia, expressed as rotation AND translation
    // AND cant. Doing all three is what sells mass: a real weapon swinging
    // behind a turn doesn't just rotate, it slides across the view and rolls
    // over its own centre of gravity. Heavily suppressed while sighted — a
    // shouldered weapon is braced against the body, and more to the point a
    // scope that drifts off centre every time you adjust aim makes precision
    // shooting miserable. A little is kept so the sights visibly SETTLE rather
    // than tracking the eye perfectly. Sprint owns the weapon outright.
    const inertiaAmp = (1 - aim * 0.88) * (1 - sprint * 0.85);
    const swYaw = this.swing.yaw * inertiaAmp;
    const swPitch = this.swing.pitch * inertiaAmp;

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

    // Engineer "wiring the barrel" pose — drop the gun low and tuck it across
    // the body (muzzle dips, slight cant) while the free hand works at the TNT.
    const wire = this.wireAnim;

    this.group.position.x =
      baseX + this.walkOffset.x * swayMul + SP_X * sprint + runX + rl.x
      + leanShift + inspX + equip * 0.12 + wire * 0.05 + mX
      + swYaw * 0.30;
    this.group.position.y =
      baseY + this.walkOffset.y * swayMul + SP_Y * sprint + runY
      + this.jumpOffset.y - land * 0.12 + abil * 0.07 - dash * 0.05 + rl.y
      - equip * 0.5 + equipSettle * 0.05 + inspY - wire * 0.28 + mY
      + swPitch * 0.24;
    this.group.position.z =
      baseZ + this.recoilOffset.z + SP_Z * sprint + dash * 0.16 + rl.z
      + equip * 0.10 + inspZ + wire * 0.06 - deployJab * 0.16 + mZ;

    this.group.rotation.x =
      (this.swayOffset.rotX + this.walkOffset.rotX) * swayMul
      + this.recoilOffset.rotX + SP_RX * sprint + runRotX
      + this.jumpOffset.rotX - land * 0.18 + rl.rx + equip * 0.55 + inspPitch
      + wire * 0.62 - deployJab * 0.14 + mRX
      + swPitch * 0.85;
    this.group.rotation.y =
      this.swayOffset.rotY * swayMul + SP_RY * sprint + leanYaw + inspYaw + equip * 0.26
      + this.recoilOffset.rotY + rl.ry + mRY
      + swYaw * 0.95;
    this.group.rotation.z =
      this.walkOffset.rotZ * swayMul + rl.rz + SP_RZ * sprint
      + runRotZ + abil * 0.22 + leanRoll + inspRoll + equip * 0.42 + wire * 0.28
      + mRZ
      - swYaw * 0.42;
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

  /**
   * Begin a reload. `durationSec` paces the WHOLE hand animation to fill the
   * real reload window (so the player visibly works the weapon for the entire
   * time); `shells` is how many discrete "thumb a round in" beats a shell-fed
   * reload (shotgun) plays across that window. Both default to sane values for
   * a quick one-off call.
   */
  triggerReload(
    durationSec: number = 0.5,
    shells: number = 8,
    style: ReloadStyle = 'dry',
    panic: number = 0,
  ) {
    this.isReloading = true;
    this.reloadAnimation = 0;
    this.reloadDuration = Math.max(0.25, durationSec);
    this.reloadShells = Math.max(1, Math.round(shells));
    this.reloadStyle = style;
    this.reloadPanic = THREE.MathUtils.clamp(panic, 0, 1);
    // Fresh beat ledger — every cue is armed again for this reload.
    this.firedCues.clear();
    // A magazine still falling from a previous reload is abandoned rather than
    // teleported: the prop is reused for the new drop.
    this.magFall.active = false;
    this.parkReloadProps(this.rp);
    if (this.currentWeaponType === 'subverter') this.subReloadGlow = 1;
  }

  switchWeapon(type: WeaponType) {
    this.currentWeaponType = type;
    this.createGunModel(type);
    this.equipAnim = 1; // play the raise-from-low equip animation
    this.inspectActive = false; // a fresh weapon cancels any in-progress inspect
    this.inspectTime = 0;
  }
}
