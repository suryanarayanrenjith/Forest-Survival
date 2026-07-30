/**
 * SURFACE DETAIL LIBRARY
 * ======================
 *
 * The enemies, the player characters and the ARK-07 relay spires were all
 * built from flat-coloured primitives: `MeshStandardMaterial` with a colour and
 * no maps whatsoever. Up close that reads as untextured boxes — the single
 * biggest thing separating them from the rest of the scene, which has had real
 * detail maps on the guns, the ground, the props and the crates for a long
 * time.
 *
 * This bakes a library of high-resolution surfaces — albedo, roughness and a
 * Sobel-derived tangent-space normal (with the height field preserved in alpha
 * for cavity AO) — and attaches them to those materials. On the combatants,
 * each box face becomes ONE armour panel: bevelled edge, recessed border gap, a
 * construction seam, corner fasteners, brushed micro-machining and combat
 * weathering. On the relays, decades of weather.
 *
 * ── COST, AND THE ONE RULE ───────────────────────────────────────────────
 *
 *  • The textures are SHARED and baked LAZILY — a kind nothing asks for is
 *    never painted. Each kind is three 512² canvases, uploaded once and reused
 *    by every material that asks for it.
 *
 *  • THE RULE: every material that takes an armour surface (`plate`, `limb`,
 *    `greeble`, `cloth`) must keep the SAME map-set shape — map +
 *    roughnessMap + normalMap + emissiveMap — and the same `onBeforeCompile`,
 *    which `customProgramCacheKey` pins to a single cache entry. That collapses
 *    the ENTIRE cast, enemies and characters alike, to ONE shader program, and
 *    that is what keeps the warmup guarantee intact: the loader already renders
 *    one of every enemy archetype, so everything is compiled before the first
 *    playable frame and nothing links mid-fight. Introducing a second distinct
 *    material shape for a combatant would silently reintroduce a first-use
 *    stutter — don't.
 *
 *  • The ARK-07 kinds (`concrete`, `steelPanel`, `rust`, `hazard`, `dish`) are
 *    a deliberate exception: they vary in map set and in `side`, so they add a
 *    few programs of their own. That is fine ONLY because the loader explicitly
 *    renders a quad per relay material (see `uplinkNet.materials` in the warmup)
 *    — if you add a relay material, it has to go through that list.
 *
 *  • The albedo is deliberately near-WHITE. It MULTIPLIES the part colour, so
 *    every archetype keeps its exact palette identity (red grunt, cyan sniper,
 *    gold revenant …) and only gains tonal life. On the combatants the same
 *    texture is bound as the emissiveMap so the panel lines survive at night,
 *    when the emissive term — not the sun — is what's actually lighting them.
 */
import * as THREE from 'three';
import { bakeCanvas, bakeTex, heightToNormal, makeCavityAO, grain, mottle, scratches, slats, rivet } from './ProceduralSurface';

/**
 * Which surface a part is made of.
 *
 *  • `plate`  — the main structural armour panel. Torso, head, bright accents.
 *  • `limb`   — the same family, finer pitch and busier, for arms and legs
 *               (a limb is a smaller object, so a torso-scale panel on it looks
 *               wrong — this is the fix for "everything is the same size").
 *  • `greeble`— dark recessed fittings: vents, visor frames, hip blocks. Slats
 *               and machining rather than a clean panel.
 *  • `cloth`  — soft matte weave for the player characters' fabric parts.
 *
 * ── ARK-07 RELAY NETWORK ──
 * The derelict installations were the last big untextured surface in the game:
 * flat grey concrete, flat grey steel, flat brown "rust" that had no rust in
 * it. These give them the decades of weather the fiction claims.
 *
 *  • `concrete` — poured pads and footings: aggregate pitting, form-board
 *                 lines, hairline cracks, water staining.
 *  • `steelPanel` — riveted structural plate: seams, rivet rows, streaked wear.
 *  • `rust`     — corroded metal: scaling, pitting, flaking blooms.
 *  • `hazard`   — painted warning surfaces: diagonal caution stripes, chipped.
 *  • `dish`     — the tracking dish's spun-aluminium skin: fine concentric
 *                 turning marks plus radial rib shadows.
 */
export type RobotSurfaceKind =
  | 'plate' | 'limb' | 'greeble' | 'cloth'
  | 'concrete' | 'steelPanel' | 'rust' | 'hazard' | 'dish';

export interface SurfaceMaps {
  albedo: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
}

/** 512 keeps the fastener rims and seam edges crisp on a torso filling the
 *  screen during a lunge. The Sobel needs the headroom too — at 256 the normal
 *  comes out mushy and the panels stop reading as bevelled. */
const TEX_SIZE = 512;

// ── PAINTERS ─────────────────────────────────────────────────────────────
// Each kind paints three greyscale layers with the SAME structure at the same
// coordinates, so the albedo darkening, the roughness change and the physical
// depth of a feature all agree. That agreement is what sells it: a seam that is
// darker but not deeper reads as a decal, not a gap.

/** Shared layout maths for the panel-style surfaces. */
interface PanelLayout {
  /** Inset of the recessed border gap, as a fraction of the tile. */
  border: number;
  /** Fastener radius, fraction of the tile. */
  rivetR: number;
  /** How many horizontal construction seams cross the panel. */
  seams: number;
  /** Extra machined detail block (vent strip) on the lower panel. */
  ventStrip: boolean;
}

const LAYOUTS: Record<'plate' | 'limb', PanelLayout> = {
  plate: { border: 0.075, rivetR: 0.030, seams: 1, ventStrip: true },
  limb:  { border: 0.105, rivetR: 0.024, seams: 2, ventStrip: false },
};

/**
 * Draw the panel STRUCTURE — border groove, seams, fasteners, vent strip — in
 * whichever tones the caller wants. Called identically by all three layers so
 * the features line up exactly.
 *
 * @param groove tone of recessed lines (border gap + seams)
 * @param edge   tone of the raised bevel just inside the groove
 * @param head   fastener dome tone
 * @param ring   fastener contact-ring tone
 */
function panelStructure(
  ctx: CanvasRenderingContext2D, s: number, L: PanelLayout,
  groove: number, edge: number, head: number, ring: number,
): void {
  const b = s * L.border;
  // Raised bevel band just inside the tile edge — catches light along every
  // panel rim, which is what makes a flat box face read as a fitted plate.
  ctx.strokeStyle = `rgb(${edge},${edge},${edge})`;
  ctx.lineWidth = s * 0.026;
  ctx.strokeRect(b, b, s - b * 2, s - b * 2);
  // The recess itself, sitting just outside the bevel.
  ctx.strokeStyle = `rgb(${groove},${groove},${groove})`;
  ctx.lineWidth = s * 0.030;
  ctx.strokeRect(b * 0.45, b * 0.45, s - b * 0.9, s - b * 0.9);

  // Construction seams across the panel face.
  ctx.lineWidth = s * 0.016;
  for (let i = 1; i <= L.seams; i++) {
    const y = (s * i) / (L.seams + 1) + (i % 2 ? s * 0.04 : -s * 0.03);
    ctx.beginPath();
    ctx.moveTo(b * 1.4, y);
    ctx.lineTo(s - b * 1.4, y);
    ctx.stroke();
  }

  // Machined vent strip — a short grille that breaks up the lower half.
  if (L.ventStrip) {
    slats(ctx, s * 0.30, s * 0.76, s * 0.40, s * 0.11, 4, groove);
  }

  // Corner fasteners.
  const r = s * L.rivetR;
  const o = b * 1.9;
  for (const [fx, fy] of [[o, o], [s - o, o], [o, s - o], [s - o, s - o]] as const) {
    rivet(ctx, fx, fy, r, head, ring);
  }
}

function paintPanel(kind: 'plate' | 'limb'): {
  albedo: (c: CanvasRenderingContext2D, s: number) => void;
  rough: (c: CanvasRenderingContext2D, s: number) => void;
  height: (c: CanvasRenderingContext2D, s: number) => void;
  strength: number;
} {
  const L = LAYOUTS[kind];
  return {
    // Near-white: multiplies the part colour, adds tone not hue.
    albedo: (c, s) => {
      grain(c, s, 243, 8, true);
      panelStructure(c, s, L, 196, 252, 251, 205);
      scratches(c, s, kind === 'plate' ? 30 : 20, (a) => `rgba(255,255,255,${a})`, s * 0.09);
      // Combat weathering — soot and scorching, heavier toward the bottom
      // where a walking chassis collects it.
      mottle(c, s, 9, s * 0.10, 0.09, 150);
    },
    // Brighter = rougher. Grooves and vents are unfinished, fasteners and the
    // bevel rim are polished by contact.
    rough: (c, s) => {
      grain(c, s, 224, 24, true);
      panelStructure(c, s, L, 246, 186, 150, 240);
      mottle(c, s, 12, s * 0.11, 0.16, 235);
    },
    // Physical depth. Mid grey is the panel face; grooves cut in, fasteners
    // stand proud.
    height: (c, s) => {
      grain(c, s, 138, 9, true);
      panelStructure(c, s, L, 52, 178, 226, 74);
      scratches(c, s, kind === 'plate' ? 30 : 20, (a) => `rgba(88,88,88,${a})`, s * 0.09);
    },
    strength: kind === 'plate' ? 1.9 : 2.3,
  };
}

const SPECS: Record<RobotSurfaceKind, {
  albedo: (c: CanvasRenderingContext2D, s: number) => void;
  rough: (c: CanvasRenderingContext2D, s: number) => void;
  height: (c: CanvasRenderingContext2D, s: number) => void;
  strength: number;
  /**
   * Tiles per UV unit. 1 (the default) means one feature set per box face,
   * which is right for a robot: every face IS one armour panel.
   *
   * The relay parts are an order of magnitude bigger — a 12 m concrete pad
   * with a single tile stretched across it would show one crack the size of a
   * car — so those kinds tile. All three maps of a kind MUST share the same
   * repeat: they describe the same features, and mismatched transforms would
   * both misregister the detail and cost an extra UV varying.
   */
  repeat?: number;
}> = {
  plate: paintPanel('plate'),
  limb: paintPanel('limb'),

  // Dark recessed fittings — heat vents, visor surrounds, hip blocks. Deep
  // slats top and bottom with a machined band between, so the parts the
  // silhouette reads as "inside the robot" actually look like mechanism.
  greeble: {
    albedo: (c, s) => {
      grain(c, s, 232, 12, false);
      slats(c, s * 0.08, s * 0.10, s * 0.84, s * 0.30, 5, 176);
      slats(c, s * 0.08, s * 0.60, s * 0.84, s * 0.30, 5, 176);
      // Central machined band with a pair of service fasteners.
      c.fillStyle = 'rgb(250,250,250)';
      c.fillRect(s * 0.08, s * 0.455, s * 0.84, s * 0.09);
      rivet(c, s * 0.20, s * 0.50, s * 0.030, 253, 200);
      rivet(c, s * 0.80, s * 0.50, s * 0.030, 253, 200);
      mottle(c, s, 8, s * 0.12, 0.12, 150);
    },
    rough: (c, s) => {
      grain(c, s, 236, 18, false);
      slats(c, s * 0.08, s * 0.10, s * 0.84, s * 0.30, 5, 252);
      slats(c, s * 0.08, s * 0.60, s * 0.84, s * 0.30, 5, 252);
      c.fillStyle = 'rgb(178,178,178)';
      c.fillRect(s * 0.08, s * 0.455, s * 0.84, s * 0.09);
    },
    height: (c, s) => {
      grain(c, s, 150, 10, false);
      slats(c, s * 0.08, s * 0.10, s * 0.84, s * 0.30, 5, 34);
      slats(c, s * 0.08, s * 0.60, s * 0.84, s * 0.30, 5, 34);
      c.fillStyle = 'rgb(206,206,206)';
      c.fillRect(s * 0.08, s * 0.455, s * 0.84, s * 0.09);
      rivet(c, s * 0.20, s * 0.50, s * 0.030, 235, 120);
      rivet(c, s * 0.80, s * 0.50, s * 0.030, 235, 120);
    },
    strength: 3.4,
  },

  // Player-character fabric: a fine twill weave with fold shading. Soft, no
  // fasteners, no panel gaps — the read that separates a person from a robot.
  cloth: {
    albedo: (c, s) => {
      grain(c, s, 242, 7, false);
      weave(c, s, 232, 250);
      mottle(c, s, 14, s * 0.13, 0.07, 205);
    },
    rough: (c, s) => {
      grain(c, s, 244, 12, false);
      weave(c, s, 250, 232);
    },
    height: (c, s) => {
      grain(c, s, 132, 8, false);
      weave(c, s, 108, 158);
    },
    strength: 1.5,
  },

  // ── ARK-07: POURED CONCRETE ────────────────────────────────────────────
  // Pads, footings and the mast plinth. The read is decades of weather: the
  // horizontal FORM-BOARD lines left by the shuttering it was poured into,
  // exposed aggregate where the surface has spalled, hairline cracking and
  // dark water staining running down from every edge.
  concrete: {
    albedo: (c, s) => {
      grain(c, s, 238, 14, false);
      aggregate(c, s, 190, 250);
      formLines(c, s, 206);
      cracks(c, s, 7, 168);
      // Water staining — long vertical streaks, heavier low down.
      mottle(c, s, 16, s * 0.16, 0.10, 165);
    },
    rough: (c, s) => {
      // Concrete is uniformly rough; the variation is in WHERE it's polished
      // smooth by runoff, so the stain areas read slightly less rough.
      grain(c, s, 246, 12, false);
      aggregate(c, s, 236, 208);
      mottle(c, s, 16, s * 0.16, 0.20, 198);
    },
    height: (c, s) => {
      grain(c, s, 136, 14, false);
      aggregate(c, s, 108, 178);
      formLines(c, s, 92);
      cracks(c, s, 7, 58);
    },
    strength: 2.6,
    repeat: 3,
  },

  // ── ARK-07: RIVETED STRUCTURAL STEEL ──────────────────────────────────
  // Lattice mast, skids, ladders, equipment housings. A welded seam down the
  // middle, two rows of structural rivets, and directional wear streaks from
  // rain running off the joints.
  steelPanel: {
    albedo: (c, s) => {
      grain(c, s, 244, 9, true);
      rivetRows(c, s, 251, 202);
      // Welded seam.
      c.fillStyle = 'rgb(214,214,214)';
      c.fillRect(0, s * 0.485, s, s * 0.03);
      scratches(c, s, 34, (a) => `rgba(255,255,255,${a})`, s * 0.12);
      mottle(c, s, 10, s * 0.13, 0.11, 172);
    },
    rough: (c, s) => {
      grain(c, s, 214, 30, true);
      rivetRows(c, s, 152, 242);
      c.fillStyle = 'rgb(248,248,248)';
      c.fillRect(0, s * 0.485, s, s * 0.03);
      mottle(c, s, 12, s * 0.14, 0.22, 240);
    },
    height: (c, s) => {
      grain(c, s, 138, 10, true);
      rivetRows(c, s, 228, 76);
      // The weld bead stands PROUD of the plates it joins.
      c.fillStyle = 'rgb(184,184,184)';
      c.fillRect(0, s * 0.485, s, s * 0.03);
      scratches(c, s, 34, (a) => `rgba(92,92,92,${a})`, s * 0.12);
    },
    strength: 2.4,
    repeat: 3,
  },

  // ── ARK-07: CORROSION ──────────────────────────────────────────────────
  // Where the coating failed entirely. Scaling blooms with hard edges,
  // deep pitting, and flakes lifting away — high roughness everywhere.
  rust: {
    albedo: (c, s) => {
      grain(c, s, 226, 20, false);
      // Corrosion blooms: overlapping irregular patches at two scales.
      mottle(c, s, 26, s * 0.14, 0.30, 150);
      mottle(c, s, 44, s * 0.05, 0.34, 250);
      pitting(c, s, 300, 140);
    },
    rough: (c, s) => {
      grain(c, s, 250, 10, false);   // rust is matte, full stop
      mottle(c, s, 26, s * 0.14, 0.18, 235);
    },
    height: (c, s) => {
      grain(c, s, 140, 18, false);
      mottle(c, s, 26, s * 0.14, 0.36, 196);  // scale lifts off the surface
      pitting(c, s, 300, 46);                 // …and pits eat into it
    },
    strength: 4.2,
    repeat: 3,
  },

  // ── ARK-07: PAINTED HAZARD MARKING ────────────────────────────────────
  // Diagonal caution striping, chipped back to bare metal along the edges.
  // The stripes live in the ALBEDO (tone) and in HEIGHT (paint has thickness),
  // which is what stops them reading as a flat decal.
  hazard: {
    albedo: (c, s) => {
      grain(c, s, 246, 8, false);
      chevrons(c, s, s / 5, 150, 0.9);
      chipping(c, s, 40, 226);
      mottle(c, s, 10, s * 0.12, 0.12, 168);
    },
    rough: (c, s) => {
      // Painted stripes are glossier than the substrate between them.
      grain(c, s, 238, 14, false);
      chevrons(c, s, s / 5, 186, 0.75);
    },
    height: (c, s) => {
      grain(c, s, 132, 8, false);
      chevrons(c, s, s / 5, 168, 0.85);  // paint film stands proud
      chipping(c, s, 40, 96);
    },
    strength: 1.9,
    repeat: 2,
  },

  // ── ARK-07: SPUN DISH SKIN ────────────────────────────────────────────
  // The tracking dish is a spun-aluminium panel: concentric turning marks from
  // the lathe, plus the radial shadow of the ribs behind it. Deliberately the
  // cleanest surface in the set — this is the one part still being maintained.
  dish: {
    albedo: (c, s) => {
      grain(c, s, 249, 5, false);
      rings(c, s, 26, 236, 0.5);
      spokes(c, s, 16, 230, 0.35);
      mottle(c, s, 8, s * 0.15, 0.06, 200);
    },
    rough: (c, s) => {
      grain(c, s, 208, 14, false);
      rings(c, s, 26, 244, 0.6);
    },
    height: (c, s) => {
      grain(c, s, 134, 5, false);
      rings(c, s, 26, 112, 0.7);
      spokes(c, s, 16, 168, 0.5);
    },
    strength: 1.4,
  },
};

// ── INDUSTRIAL BRUSHES ───────────────────────────────────────────────────
// Only used by the ARK-07 kinds above. Same greyscale contract as the shared
// primitives: the caller picks the tones, so one routine serves albedo,
// roughness and height.

/** Exposed aggregate — dense speckle of two stone tones. */
function aggregate(ctx: CanvasRenderingContext2D, s: number, dark: number, light: number): void {
  const n = Math.round((s * s) / 260);
  for (let i = 0; i < n; i++) {
    const r = s * (0.004 + Math.random() * 0.010);
    const t = Math.random() < 0.5 ? dark : light;
    ctx.fillStyle = `rgba(${t},${t},${t},${0.35 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Horizontal shuttering seams left by the form boards. */
function formLines(ctx: CanvasRenderingContext2D, s: number, tone: number): void {
  ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
  ctx.lineWidth = s * 0.012;
  for (const f of [0.24, 0.52, 0.79]) {
    ctx.beginPath();
    ctx.moveTo(0, s * f);
    ctx.lineTo(s, s * f + (Math.random() - 0.5) * s * 0.012);
    ctx.stroke();
  }
}

/** Hairline cracks — a branching random walk. */
function cracks(ctx: CanvasRenderingContext2D, s: number, count: number, tone: number): void {
  ctx.strokeStyle = `rgb(${tone},${tone},${tone})`;
  for (let i = 0; i < count; i++) {
    let x = Math.random() * s;
    let y = Math.random() * s;
    ctx.lineWidth = s * 0.004 + Math.random() * s * 0.003;
    ctx.beginPath();
    ctx.moveTo(x, y);
    let ang = Math.random() * Math.PI * 2;
    const segs = 5 + ((Math.random() * 6) | 0);
    for (let j = 0; j < segs; j++) {
      ang += (Math.random() - 0.5) * 1.4;
      x += Math.cos(ang) * s * 0.045;
      y += Math.sin(ang) * s * 0.045;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Two horizontal rows of structural fasteners. */
function rivetRows(ctx: CanvasRenderingContext2D, s: number, head: number, ring: number): void {
  const r = s * 0.019;
  for (const fy of [0.16, 0.84]) {
    for (let i = 0; i < 7; i++) {
      rivet(ctx, s * (0.08 + i * 0.14), s * fy, r, head, ring);
    }
  }
}

/** Corrosion pitting — tiny dark craters eating into the surface. */
function pitting(ctx: CanvasRenderingContext2D, s: number, count: number, tone: number): void {
  ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
  for (let i = 0; i < count; i++) {
    const r = s * (0.002 + Math.random() * 0.007);
    ctx.beginPath();
    ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Diagonal caution striping. `pitch` is the stripe period in pixels. */
function chevrons(ctx: CanvasRenderingContext2D, s: number, pitch: number, tone: number, alpha: number): void {
  ctx.save();
  ctx.fillStyle = `rgba(${tone},${tone},${tone},${alpha})`;
  // Drawn beyond both edges so the diagonal tiles cleanly under RepeatWrapping.
  for (let i = -s; i < s * 2; i += pitch * 2) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + pitch, 0);
    ctx.lineTo(i + pitch + s, s);
    ctx.lineTo(i + s, s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Paint chipped back to the substrate — irregular flecks along wear lines. */
function chipping(ctx: CanvasRenderingContext2D, s: number, count: number, tone: number): void {
  ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const w = s * (0.006 + Math.random() * 0.022);
    const h = s * (0.005 + Math.random() * 0.016);
    ctx.fillRect(x, y, w, h);
  }
}

/** Concentric lathe/turning marks about the tile centre. */
function rings(ctx: CanvasRenderingContext2D, s: number, count: number, tone: number, alpha: number): void {
  const c = s * 0.5;
  ctx.lineWidth = s * 0.004;
  for (let i = 1; i <= count; i++) {
    const a = alpha * (0.4 + Math.random() * 0.6);
    ctx.strokeStyle = `rgba(${tone},${tone},${tone},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(c, c, (i / count) * s * 0.72, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Radial rib shadows fanning from the tile centre. */
function spokes(ctx: CanvasRenderingContext2D, s: number, count: number, tone: number, alpha: number): void {
  const c = s * 0.5;
  ctx.strokeStyle = `rgba(${tone},${tone},${tone},${alpha})`;
  ctx.lineWidth = s * 0.010;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(ang) * s * 0.72, c + Math.sin(ang) * s * 0.72);
    ctx.stroke();
  }
}

/** Diagonal twill — two crossed sets of thread lines at a fine pitch. */
function weave(ctx: CanvasRenderingContext2D, s: number, low: number, high: number): void {
  const pitch = s / 42;
  ctx.lineWidth = pitch * 0.5;
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? `rgba(${low},${low},${low},0.55)` : `rgba(${high},${high},${high},0.4)`;
    const dir = pass === 0 ? 1 : -1;
    for (let i = -s; i < s * 2; i += pitch) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + dir * s, s);
      ctx.stroke();
    }
  }
}

const _cache = new Map<RobotSurfaceKind, SurfaceMaps>();

/** Bake (once) and share a surface set. */
export function getRobotSurface(kind: RobotSurfaceKind): SurfaceMaps {
  const hit = _cache.get(kind);
  if (hit) return hit;
  const spec = SPECS[kind];
  const rep = spec.repeat ?? 1;
  const maps: SurfaceMaps = {
    albedo: bakeTex(TEX_SIZE, rep, true, spec.albedo),
    rough: bakeTex(TEX_SIZE, rep, false, spec.rough),
    normal: heightToNormal(bakeCanvas(TEX_SIZE, spec.height), spec.strength),
  };
  // heightToNormal leaves the normal at repeat (1,1) — match it to the others
  // or the bumps drift off the panel lines they belong to.
  maps.normal.repeat.set(rep, rep);
  _cache.set(kind, maps);
  return maps;
}

/**
 * Per-kind normalMap intensity. SHARED Vector2 instances — three reads these
 * per draw and never mutates them, so one object per kind is correct and saves
 * an allocation on every material that takes armour.
 */
const NORMAL_SCALE: Record<RobotSurfaceKind, THREE.Vector2> = {
  plate:      new THREE.Vector2(0.85, 0.85),
  limb:       new THREE.Vector2(1.00, 1.00),
  greeble:    new THREE.Vector2(1.25, 1.25),
  cloth:      new THREE.Vector2(0.60, 0.60),
  concrete:   new THREE.Vector2(1.10, 1.10),
  steelPanel: new THREE.Vector2(1.00, 1.00),
  rust:       new THREE.Vector2(1.45, 1.45),
  hazard:     new THREE.Vector2(0.75, 0.75),
  dish:       new THREE.Vector2(0.55, 0.55),
};

// ONE cavity injection, ONE cache key → ONE program for every armoured
// material in the game. See the header note: splitting this is how you get a
// mid-fight compile stall.
const _CAVITY_AO = makeCavityAO(0.34);
const _CACHE_KEY = () => 'robot_armour_v1';

/**
 * Attach an armour surface to an already-built MeshStandardMaterial.
 *
 * Mutates in place (these materials are created and shared at init, long before
 * anything renders) and returns the material for chaining.
 *
 * @param emissiveTextured bind the albedo as the emissiveMap too. Correct for
 *   the enemy robots, whose brightness at night comes almost entirely from
 *   their emissive term — without it the panel detail washes out after dusk.
 *   Wrong for parts whose emissive IS the effect (an energy core, an eye bar):
 *   modulating those with panel lines makes them look dirty.
 */
export function applyRobotSurface(
  material: THREE.MeshStandardMaterial,
  kind: RobotSurfaceKind,
  emissiveTextured = true,
): THREE.MeshStandardMaterial {
  const maps = getRobotSurface(kind);
  material.map = maps.albedo;
  material.roughnessMap = maps.rough;
  material.normalMap = maps.normal;
  material.normalScale = NORMAL_SCALE[kind];
  if (emissiveTextured) material.emissiveMap = maps.albedo;
  material.onBeforeCompile = _CAVITY_AO;
  material.customProgramCacheKey = _CACHE_KEY;
  material.needsUpdate = true;
  return material;
}

/**
 * Free every baked surface.
 *
 * NOT part of the normal scene teardown, and deliberately so: these canvases
 * are session-shared across the enemy manager AND every character model, and
 * both are rebuilt between runs. Freeing them per-run would force a full
 * re-bake and re-upload for nothing. Exposed for a genuine full-app shutdown.
 */
export function disposeRobotSurfaces(): void {
  _cache.forEach((m) => { m.albedo.dispose(); m.rough.dispose(); m.normal.dispose(); });
  _cache.clear();
}
