/**
 * PROCEDURAL SURFACE BAKERY
 * =========================
 *
 * Shared canvas → PBR-texture machinery. Extracted from GunModel, where it was
 * originally written to give the viewmodel weapons real micro-surface, and now
 * used by the enemy robots and the player character models too.
 *
 * The whole game ships zero image assets: every texture is painted into a 2D
 * canvas at load and uploaded once. That constraint is why these helpers exist —
 * they turn a greyscale HEIGHT painting into a proper tangent-space normal map
 * so a flat-shaded box can read as a machined, bevelled, riveted armour panel
 * instead of a coloured cube.
 *
 * Two details in `heightToNormal` are load-bearing, and both fail SILENTLY:
 *
 *   1. Neighbour lookups WRAP. These textures are RepeatWrapping, so a clamped
 *      Sobel bakes a visible lighting seam along every tile boundary.
 *   2. The result stays at NoColorSpace. Tagging a normal map sRGB is the
 *      classic bug — three de-gammas the vectors and every surface lights
 *      subtly wrong with nothing obviously "broken" to point at.
 *
 * The source height is preserved in the normal map's ALPHA channel so the
 * cavity-AO shader injection (see makeCavityAO) can read occlusion from a
 * sampler that is already bound — no extra texture, no extra binding.
 */
import * as THREE from 'three';

/**
 * Paint a square canvas and hand back the CANVAS.
 *
 * Separate from `bakeTex` because the height → normal Sobel pass needs the raw
 * pixels, and a THREE.CanvasTexture gives no way back to them.
 */
export function bakeCanvas(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  return c;
}

/** Wrap an already-painted canvas as a tiling texture. */
export function texFromCanvas(c: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function bakeTex(
  size: number,
  repeat: number,
  srgb: boolean,
  paint: (ctx: CanvasRenderingContext2D, s: number) => void,
): THREE.CanvasTexture {
  return texFromCanvas(bakeCanvas(size, paint), repeat, srgb);
}

/**
 * Sobel a greyscale HEIGHT canvas into a tangent-space normal map.
 *
 * `strength` is height-units-per-texel — higher digs the crevices deeper. The
 * original height is written to ALPHA for the cavity-AO injection.
 */
export function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const s = src.width;
  const srcData = src.getContext('2d')!.getImageData(0, 0, s, s).data;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const outCtx = out.getContext('2d')!;
  const img = outCtx.createImageData(s, s);
  const d = img.data;
  // Red channel is enough — the height canvases are painted greyscale.
  const h = (x: number, y: number) => srcData[(((y + s) % s) * s + ((x + s) % s)) * 4] / 255;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const tl = h(x - 1, y - 1), t = h(x, y - 1), tr = h(x + 1, y - 1);
      const l  = h(x - 1, y),                      r  = h(x + 1, y);
      const bl = h(x - 1, y + 1), b = h(x, y + 1), br = h(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      // Normalise (-dx, -dy, 1/strength) and pack to 0..255.
      let nx = -dx * strength, ny = -dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv;
      const i = (y * s + x) * 4;
      d[i]     = Math.round((nx * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255);
      d[i + 3] = Math.round(h(x, y) * 255); // height → alpha, for cavity AO
    }
  }
  outCtx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * CONTACT / CAVITY AO
 *
 * The post chain has no depth-based AO, which is a large part of why assembled
 * primitives read as "floating parts": every crevice — a panel gap, a vent
 * slot, the seam where a shoulder pad meets a torso — has zero occlusion
 * darkening, so the eye gets no depth cue at all.
 *
 * Rather than a real GTAO pass (needs a depth+normal prepass on a chain that is
 * null on low presets), this samples the height already packed into the normal
 * map's alpha and darkens by it: four instructions, same sampler, no new
 * binding.
 *
 * `customProgramCacheKey` is LOAD-BEARING at every call site. Without it three
 * must assume every material carrying an onBeforeCompile is a potentially
 * distinct program, and the variant count explodes — which breaks the warmup
 * guarantee that one pre-render of each object compiles everything.
 *
 * @param depth 0..1 — how hard crevices are darkened.
 */
export function makeCavityAO(depth: number): (shader: { fragmentShader: string }) => void {
  const floor = (1 - depth).toFixed(3);
  const range = depth.toFixed(3);
  return (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      `#ifdef USE_NORMALMAP
        // Alpha of the normal map is the source height field: low = crevice.
        float _cav = texture2D( normalMap, vNormalMapUv ).a;
        diffuseColor.rgb *= ( ${floor} + ${range} * _cav );
      #endif
      #include <lights_fragment_begin>`,
    );
  };
}

// ── SHARED PAINT PRIMITIVES ──────────────────────────────────────────────
// Small, composable brushes the individual surface libraries build their
// looks out of. All of them paint in greyscale so the same routine can serve
// an albedo (near-white, MULTIPLIES the part colour), a roughness map, or a
// height field just by changing the base value.

/** Grey-noise fill: base value ± jitter, optionally in horizontal streaks. */
export function grain(ctx: CanvasRenderingContext2D, s: number, base: number, jitter: number, streaky: boolean): void {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, s, s);
  const n = Math.round((s * s) / 100);
  if (streaky) {
    // Brushed machining — long horizontal micro-streaks of varying tone.
    for (let i = 0; i < n; i++) {
      const v = Math.round(base + (Math.random() - 0.5) * 2 * jitter);
      ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.5})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, s * 0.02 + Math.random() * s * 0.16, 1);
    }
  } else {
    // Even micro-grain (cast / moulded surface).
    for (let i = 0; i < n * 3; i++) {
      const v = Math.round(base + (Math.random() - 0.5) * 2 * jitter);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1.4, 1.4);
    }
  }
}

/** Soft irregular blotches — weathering, staining, anodising variation. */
export function mottle(
  ctx: CanvasRenderingContext2D, s: number,
  count: number, radius: number, alpha: number, tone = 210,
): void {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const r = radius * (0.5 + Math.random());
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const t = Math.round(tone + Math.random() * 45);
    g.addColorStop(0, `rgba(${t},${t},${t},${alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Scatter short scratches — handling and combat wear. */
export function scratches(
  ctx: CanvasRenderingContext2D, s: number,
  count: number, style: (a: number) => string, len: number,
): void {
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = style(0.18 + Math.random() * 0.3);
    ctx.lineWidth = 0.7 + Math.random();
    const x = Math.random() * s, y = Math.random() * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.3) * len, y + (Math.random() - 0.5) * (s * 0.02));
    ctx.stroke();
  }
}

/**
 * A row/column of machined slots — the vent grille read.
 *
 * `vertical` runs the slats top-to-bottom instead of left-to-right.
 */
export function slats(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, w: number, h: number,
  count: number, tone: number, vertical = false,
): void {
  ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
  const span = vertical ? w : h;
  const pitch = span / count;
  const thick = pitch * 0.55;
  for (let i = 0; i < count; i++) {
    const o = i * pitch + (pitch - thick) * 0.5;
    if (vertical) ctx.fillRect(x0 + o, y0, thick, h);
    else ctx.fillRect(x0, y0 + o, w, thick);
  }
}

/**
 * A hex-head fastener: bright dome with a dark contact ring.
 *
 * Reads as a rivet in albedo, a polished spot in roughness and a raised boss in
 * height — the single highest-value detail for making a plain box look
 * manufactured.
 */
export function rivet(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  head: number, ring: number,
): void {
  ctx.fillStyle = `rgb(${ring},${ring},${ring})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r * 0.72);
  g.addColorStop(0, `rgb(${Math.min(255, head + 18)},${Math.min(255, head + 18)},${Math.min(255, head + 18)})`);
  g.addColorStop(1, `rgb(${head},${head},${head})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
}
