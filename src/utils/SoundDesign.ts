/**
 * SOUND DESIGN — the procedural synthesis behind the game's "physical" audio.
 *
 * Everything is generated at runtime (no audio files) into AudioBuffers that
 * SoundManager registers lazily. Each generator models the real event as a
 * stack of physical components rather than one noise burst:
 *
 *   • GUNSHOTS — a pressure N-wave transient, the supersonic crack, a band-
 *     limited muzzle-blast body with a fast + slow decay, the low punch, and
 *     the weapon's own mechanism (slide / bolt carrier) a few ms later. STEREO:
 *     the blast tail decorrelates between ears so a shot has width; the
 *     environment (reverb send) supplies the echo off the world.
 *   • FOOTSTEPS — a heel strike + a toe roll on a per-SURFACE texture (forest
 *     floor, dry leaves, gravel, sand, snow crunch, stone, mud squelch, wet
 *     splash), four seeded variations each so a stride never machine-guns one
 *     sample. Landings are the same model, heavier.
 *   • ROBOT STOMPS — servo-driven steel feet: a sub thump, an inharmonic plate
 *     clank and a short hydraulic hiss.
 *   • MELEE — the swing (an air whoosh whose band sweeps with the arc, over
 *     cloth) and the hit (a heavy steel crunch).
 *   • WHIZZ — an energy bolt tearing past the ear.
 *   • IMPULSE RESPONSES — per-map outdoor acoustics for the convolution reverb:
 *     early reflections + an air-absorbed diffuse tail; the canyon adds
 *     discrete echoes off its walls, the snowfield is dead, the ruins ring.
 */

export type Surface = 'forest' | 'leaves' | 'gravel' | 'sand' | 'snow' | 'stone' | 'mud' | 'wet';

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(buffer: AudioBuffer, peak: number): AudioBuffer {
  let m = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  }
  if (m > 0) {
    const k = peak / m;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return buffer;
}

// ── GUNSHOTS ──────────────────────────────────────────────────────────────

export interface GunshotSpec {
  duration: number;
  /** Supersonic crack level / decay (1/s). */
  crack: number;
  crackDecay: number;
  /** Muzzle-blast body: level, centre of its band (0..1 one-pole coeffs), decay. */
  blast: number;
  blastLo: number;   // lowpass coefficient (higher = brighter)
  blastHi: number;   // highpass coefficient (removes rumble below the band)
  blastDecay: number;
  /** Slow tail share of the blast (the boom that lingers). */
  tail: number;
  /** Low punch: Hz, pitch sweep, decay, level. */
  punchHz: number;
  sweep: number;
  punchDecay: number;
  punch: number;
  /** Mechanism (slide / bolt carrier) click: seconds after the shot, level. */
  mechAt: number;
  mech: number;
  /** Rocket motor hiss (launcher only). */
  hiss?: number;
}

export const GUNSHOTS: Record<string, GunshotSpec> = {
  pistol:   { duration: 0.32, crack: 0.75, crackDecay: 220, blast: 0.7, blastLo: 0.5, blastHi: 0.04, blastDecay: 34, tail: 0.18, punchHz: 140, sweep: 1.6, punchDecay: 30, punch: 0.45, mechAt: 0.028, mech: 0.22 },
  rifle:    { duration: 0.42, crack: 0.95, crackDecay: 200, blast: 0.8, blastLo: 0.45, blastHi: 0.03, blastDecay: 26, tail: 0.24, punchHz: 110, sweep: 1.5, punchDecay: 24, punch: 0.55, mechAt: 0.042, mech: 0.2 },
  shotgun:  { duration: 0.62, crack: 0.55, crackDecay: 120, blast: 1.0, blastLo: 0.28, blastHi: 0.015, blastDecay: 13, tail: 0.32, punchHz: 72, sweep: 1.2, punchDecay: 12, punch: 0.8, mechAt: 0, mech: 0 },
  smg:      { duration: 0.24, crack: 0.7, crackDecay: 240, blast: 0.62, blastLo: 0.52, blastHi: 0.05, blastDecay: 40, tail: 0.14, punchHz: 160, sweep: 1.8, punchDecay: 34, punch: 0.4, mechAt: 0.02, mech: 0.16 },
  sniper:   { duration: 0.9, crack: 1.0, crackDecay: 150, blast: 1.0, blastLo: 0.36, blastHi: 0.02, blastDecay: 11, tail: 0.38, punchHz: 64, sweep: 1.1, punchDecay: 9, punch: 0.85, mechAt: 0, mech: 0 },
  minigun:  { duration: 0.16, crack: 0.62, crackDecay: 260, blast: 0.6, blastLo: 0.48, blastHi: 0.05, blastDecay: 44, tail: 0.1, punchHz: 130, sweep: 1.6, punchDecay: 36, punch: 0.45, mechAt: 0, mech: 0 },
  launcher: { duration: 1.1, crack: 0.35, crackDecay: 70, blast: 0.9, blastLo: 0.22, blastHi: 0.01, blastDecay: 7, tail: 0.3, punchHz: 52, sweep: 0.8, punchDecay: 7, punch: 0.9, mechAt: 0, mech: 0, hiss: 0.5 },
};

export function createGunshot(ctx: BaseAudioContext, sr: number, s: GunshotSpec, seed: number): AudioBuffer {
  const len = Math.floor(sr * s.duration);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  // Shared transient / punch / mechanism; per-ear blast noise.
  let lpL = 0, hpL = 0, lpR = 0, hpR = 0, crHp = 0, hissLp = 0;
  const mechPartials = [2380 + r() * 300, 4120 + r() * 400, 6350 + r() * 500];
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    // Pressure N-wave: a sharp positive spike then its rarefaction.
    const nwave = t < 0.0006 ? Math.sin((t / 0.0006) * Math.PI * 2) * 0.9 : 0;
    // Supersonic crack: high-passed noise, very fast decay.
    const wn = r() * 2 - 1;
    crHp += (wn - crHp) * 0.6;
    const crack = (wn - crHp) * Math.exp(-t * s.crackDecay) * s.crack;
    // Muzzle blast, band-limited, fast + slow decay.
    const nL = r() * 2 - 1, nR = r() * 2 - 1;
    lpL += (nL - lpL) * s.blastLo; hpL += (lpL - hpL) * s.blastHi;
    lpR += (nR - lpR) * s.blastLo; hpR += (lpR - hpR) * s.blastHi;
    const env = Math.exp(-t * s.blastDecay) * (1 - s.tail) + Math.exp(-t * s.blastDecay * 0.22) * s.tail;
    const attack = Math.min(1, t / 0.0015);
    const bL = (lpL - hpL) * env * attack * s.blast * 2.2;
    const bR = (lpR - hpR) * env * attack * s.blast * 2.2;
    // Low punch with a downward sweep.
    const f = s.punchHz * (1 + s.sweep * Math.exp(-t * 32));
    const punch = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * s.punchDecay) * s.punch;
    // Mechanism click a few ms after the shot.
    let mech = 0;
    if (s.mech > 0 && t >= s.mechAt) {
      const tm = t - s.mechAt;
      const e = Math.exp(-tm * 140);
      if (e > 1e-3) {
        mech = (Math.sin(2 * Math.PI * mechPartials[0] * tm) + Math.sin(2 * Math.PI * mechPartials[1] * tm) * 0.6
          + Math.sin(2 * Math.PI * mechPartials[2] * tm) * 0.35) * e * s.mech * 0.5;
      }
    }
    // Rocket motor hiss trailing away.
    let hiss = 0;
    if (s.hiss) {
      hissLp += (wn - hissLp) * 0.35;
      hiss = (wn - hissLp) * s.hiss * Math.exp(-t * 2.4) * Math.min(1, t / 0.04) * 0.6;
    }
    const common = nwave + crack + punch + mech + hiss;
    L[i] = Math.tanh((common + bL) * 1.3);
    R[i] = Math.tanh((common + bR) * 1.3);
  }
  return normalize(buffer, 0.92);
}

// ── FOOTSTEPS ─────────────────────────────────────────────────────────────

interface SurfaceSpec {
  thud: number;       // heel thud level
  thudHz: number;
  hard: number;       // contact click level (stone / hard ground)
  texture: number;    // texture layer level
  kind: 'swish' | 'crackle' | 'grain' | 'hush' | 'crunch' | 'squelch' | 'splash' | 'click';
  bandLo: number;     // texture band (one-pole coeffs)
  bandHi: number;
  len: number;        // texture duration (s)
}

const SURFACES: Record<Surface, SurfaceSpec> = {
  forest: { thud: 0.55, thudHz: 70, hard: 0.05, texture: 0.4, kind: 'crackle', bandLo: 0.55, bandHi: 0.2, len: 0.14 },
  leaves: { thud: 0.4, thudHz: 74, hard: 0.04, texture: 0.75, kind: 'crackle', bandLo: 0.7, bandHi: 0.28, len: 0.2 },
  gravel: { thud: 0.5, thudHz: 80, hard: 0.12, texture: 0.65, kind: 'grain', bandLo: 0.75, bandHi: 0.3, len: 0.16 },
  sand:   { thud: 0.32, thudHz: 62, hard: 0.0, texture: 0.6, kind: 'hush', bandLo: 0.35, bandHi: 0.08, len: 0.2 },
  snow:   { thud: 0.35, thudHz: 66, hard: 0.0, texture: 0.8, kind: 'crunch', bandLo: 0.6, bandHi: 0.22, len: 0.2 },
  stone:  { thud: 0.45, thudHz: 92, hard: 0.5, texture: 0.25, kind: 'click', bandLo: 0.8, bandHi: 0.35, len: 0.07 },
  mud:    { thud: 0.4, thudHz: 58, hard: 0.0, texture: 0.7, kind: 'squelch', bandLo: 0.2, bandHi: 0.04, len: 0.22 },
  wet:    { thud: 0.2, thudHz: 70, hard: 0.0, texture: 0.6, kind: 'splash', bandLo: 0.6, bandHi: 0.15, len: 0.18 },
};

/** One step (heel strike + toe roll) on `surface`; `heavy` = a landing. */
export function createStep(ctx: BaseAudioContext, sr: number, surface: Surface, seed: number, heavy = false): AudioBuffer {
  const sp = SURFACES[surface];
  const dur = (heavy ? 0.42 : 0.3) + sp.len * 0.5;
  const len = Math.floor(sr * dur);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  const toeAt = heavy ? 0.05 : 0.06 + r() * 0.035;
  const hits: Array<[number, number]> = [[0, 1], [toeAt, heavy ? 0.7 : 0.45 + r() * 0.2]];
  const gain = heavy ? 1.5 : 1;
  for (const [t0, amp] of hits) {
    const n0 = Math.floor(t0 * sr);
    let lp = 0, hp = 0, lp2 = 0, grain = 0, squelchPh = 0;
    const sweep0 = 280 + r() * 120;
    for (let i = n0; i < len; i++) {
      const t = (i - n0) / sr;
      const w = r() * 2 - 1;
      // Heel thud: lowpassed noise + a low sine knock.
      lp2 += (w - lp2) * 0.12;
      const thudEnv = Math.exp(-t * (heavy ? 22 : 34));
      let v = (lp2 * 0.6 + Math.sin(2 * Math.PI * sp.thudHz * t) * 0.7) * thudEnv * sp.thud;
      // Hard contact click.
      if (sp.hard > 0) v += w * Math.exp(-t * 900) * sp.hard;
      // Texture layer.
      if (t < sp.len * (heavy ? 1.4 : 1)) {
        lp += (w - lp) * sp.bandLo;
        hp += (lp - hp) * sp.bandHi;
        const band = lp - hp;
        const te = Math.min(1, t / 0.006) * Math.exp(-t / (sp.len * 0.45));
        switch (sp.kind) {
          case 'swish':
            v += band * te * sp.texture;
            break;
          case 'crackle':
          case 'grain':
          case 'crunch': {
            // Granular: sparse sharp grains (leaf fibres / pebbles / ice).
            const density = sp.kind === 'crackle' ? 0.03 : sp.kind === 'grain' ? 0.045 : 0.07;
            if (r() < density) grain = (r() * 2 - 1) * (0.5 + r() * 0.5);
            grain *= sp.kind === 'crunch' ? 0.8 : 0.7;
            const g = sp.kind === 'crunch' ? grain + band * 0.5 : grain;
            v += (g * 0.8 + band * 0.25) * te * sp.texture;
            break;
          }
          case 'hush':
            v += band * te * sp.texture * 1.4;
            break;
          case 'squelch': {
            // Wet suction: a resonant sweep over lowpassed noise + bubbles.
            const f = sweep0 + t * 2600;
            squelchPh += (2 * Math.PI * f) / sr;
            v += (Math.sin(squelchPh) * 0.5 * lp + band * 0.6) * te * sp.texture * 1.6;
            if (r() < 0.004) grain = (r() * 2 - 1);
            grain *= 0.9;
            v += grain * 0.15 * te;
            break;
          }
          case 'splash': {
            if (r() < 0.06) grain = (r() * 2 - 1) * r();
            grain *= 0.75;
            v += (grain + band * 0.4) * te * sp.texture;
            break;
          }
          case 'click':
            v += band * te * sp.texture;
            break;
        }
      }
      d[i] += v * amp * gain;
    }
  }
  return normalize(buffer, heavy ? 0.85 : 0.7);
}

// ── ROBOT FOOTSTEP ───────────────────────────────────────────────────────

export function createRobotStep(ctx: BaseAudioContext, sr: number, heavy: boolean, seed: number): AudioBuffer {
  const len = Math.floor(sr * (heavy ? 0.5 : 0.32));
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  const base = heavy ? 46 : 70;
  const plate = heavy ? [210, 560, 1170, 1890] : [380, 980, 1720, 2810];
  const jitter = plate.map((p) => p * (0.94 + r() * 0.12));
  let lp = 0, hissHp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.1;
    const thump = (Math.sin(2 * Math.PI * base * (1 + 0.6 * Math.exp(-t * 30)) * t) * 0.9 + lp * 0.5) * Math.exp(-t * (heavy ? 14 : 22));
    let clank = 0;
    for (let k = 0; k < jitter.length; k++) clank += Math.sin(2 * Math.PI * jitter[k] * t) / (k + 1.4);
    clank *= Math.exp(-t * (heavy ? 26 : 38)) * 0.55;
    // Servo hiss settling after the plant.
    hissHp += (w - hissHp) * 0.5;
    const hiss = (w - hissHp) * Math.exp(-Math.max(0, t - 0.03) * 18) * Math.min(1, t / 0.03) * 0.08;
    d[i] = Math.tanh((thump + clank + hiss) * 1.2);
  }
  return normalize(buffer, 0.8);
}

// ── MELEE ─────────────────────────────────────────────────────────────────

export function createMeleeSwing(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.34);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  let lp = 0, hp = 0, cloth = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const w = r() * 2 - 1;
    // The band climbs as the swing accelerates, then falls away.
    const centre = 0.12 + 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.25));
    lp += (w - lp) * centre;
    hp += (lp - hp) * centre * 0.35;
    const air = (lp - hp) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 2.2);
    cloth += ((r() * 2 - 1) - cloth) * 0.08;
    const v = air * 1.4 + cloth * Math.exp(-u * 8) * 0.3;
    // The whoosh pans across the view with the arc.
    const pan = 0.5 + 0.4 * Math.sin((u - 0.5) * Math.PI);
    L[i] = v * (1 - pan) * 1.4;
    R[i] = v * pan * 1.4;
  }
  return normalize(buffer, 0.75);
}

export function createMeleeHit(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.5);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  const plate = [318, 852, 1492, 2611, 3790].map((p) => p * (0.95 + r() * 0.1));
  let lp = 0, grain = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.08;
    const thump = (Math.sin(2 * Math.PI * 64 * (1 + Math.exp(-t * 25)) * t) + lp) * Math.exp(-t * 16) * 0.9;
    let ring = 0;
    for (let k = 0; k < plate.length; k++) ring += Math.sin(2 * Math.PI * plate[k] * t) * Math.exp(-t * (18 + k * 9)) / (k + 1);
    if (r() < 0.05) grain = w;
    grain *= 0.7;
    const crunch = grain * Math.exp(-t * 22) * 0.55;
    const click = w * Math.exp(-t * 700) * 0.7;
    d[i] = Math.tanh((thump + ring * 0.6 + crunch + click) * 1.3);
  }
  return normalize(buffer, 0.9);
}

// ── WHIZZ ─────────────────────────────────────────────────────────────────

export function createWhizz(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.26);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  let ph = 0, lp = 0, hp = 0;
  for (let i = 0; i < len; i++) {
    const u = i / len;
    const w = r() * 2 - 1;
    // Doppler: pitch falls as it passes; a crackling energy core.
    const f = 1600 - u * 1000 + Math.sin(u * 90) * 40;
    ph += (2 * Math.PI * f) / sr;
    lp += (w - lp) * 0.5; hp += (lp - hp) * 0.2;
    const env = Math.pow(Math.sin(Math.PI * u), 1.6) * (1 - u * 0.4);
    const v = (Math.sin(ph) * 0.45 + (lp - hp) * 0.6) * env;
    const pan = u;
    L[i] = v * (1 - pan * 0.8);
    R[i] = v * (0.2 + pan * 0.8);
  }
  return normalize(buffer, 0.7);
}

// ── IMPULSE RESPONSES ─────────────────────────────────────────────────────

export interface AcousticSpec {
  seconds: number;     // tail length
  decay: number;       // exponential decay rate (1/s)
  damp: number;        // how fast highs die (0 = bright, 1 = very dark)
  early: number;       // early-reflection density/level
  echoes?: number[];   // discrete echo delays (s) — canyon walls
  echoLevel?: number;
}

export const ACOUSTICS: Record<string, AcousticSpec> = {
  forest:   { seconds: 1.7, decay: 3.4, damp: 0.75, early: 0.5 },
  vale:     { seconds: 2.4, decay: 2.4, damp: 0.6, early: 0.4 },
  swamp:    { seconds: 1.5, decay: 3.8, damp: 0.85, early: 0.35 },
  desert:   { seconds: 2.9, decay: 2.2, damp: 0.55, early: 0.3, echoes: [0.31, 0.62, 0.97], echoLevel: 0.32 },
  tundra:   { seconds: 1.2, decay: 5.2, damp: 0.9, early: 0.25 },
  wasteland:{ seconds: 2.2, decay: 2.8, damp: 0.6, early: 0.35, echoes: [0.44, 0.9], echoLevel: 0.18 },
  outpost:  { seconds: 1.9, decay: 3.0, damp: 0.5, early: 0.8 },
  ruins:    { seconds: 2.3, decay: 2.6, damp: 0.45, early: 0.9, echoes: [0.18, 0.37], echoLevel: 0.12 },
};

export function createImpulse(ctx: BaseAudioContext, sr: number, a: AcousticSpec, seed: number): AudioBuffer {
  const len = Math.floor(sr * a.seconds);
  const buffer = ctx.createBuffer(2, len, sr);
  const r = rng(seed);
  const pre = Math.floor(sr * 0.012);
  for (let c = 0; c < 2; c++) {
    const d = buffer.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const w = r() * 2 - 1;
      // Air absorption: the tail darkens as it decays.
      const k = Math.max(0.02, 0.9 * Math.exp(-t * (2 + a.damp * 10)));
      lp += (w - lp) * k;
      d[i] = lp * Math.exp(-t * a.decay) * 0.5;
    }
    // Early reflections off nearby trunks / rock / walls.
    const taps = Math.floor(6 + a.early * 18);
    for (let k = 0; k < taps; k++) {
      const tt = 0.008 + r() * 0.09;
      const n = pre + Math.floor(tt * sr);
      if (n < len) d[n] += (r() < 0.5 ? -1 : 1) * a.early * (0.6 - tt * 4) * 0.9;
    }
    // Discrete echoes (canyon walls): a smeared, darker copy of the impulse.
    if (a.echoes) {
      for (const e of a.echoes) {
        const n0 = pre + Math.floor(e * sr * (c === 0 ? 1 : 1.03));
        let elp = 0;
        for (let j = 0; j < Math.floor(sr * 0.06) && n0 + j < len; j++) {
          const w = r() * 2 - 1;
          elp += (w - elp) * 0.3;
          d[n0 + j] += elp * Math.exp(-j / (sr * 0.015)) * (a.echoLevel ?? 0.2) * Math.exp(-e * 1.2) * 3;
        }
      }
    }
  }
  return normalize(buffer, 0.6);
}

// ── GRENADES ──────────────────────────────────────────────────────────────

/** Pin pull: the ring scraping out of the fuze + the split pin's spring ping. */
export function createPinPull(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.32);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  let hp = 0, lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.6; hp += (lp - hp) * 0.25;
    // Scrape (first 70 ms) then the release ping of the split pin.
    const scrape = (lp - hp) * (t < 0.07 ? Math.sin((t / 0.07) * Math.PI) : 0) * 0.7;
    const ping = (Math.sin(2 * Math.PI * 3150 * t) + Math.sin(2 * Math.PI * 4710 * t) * 0.5)
      * (t > 0.06 ? Math.exp(-(t - 0.06) * 38) : 0) * 0.35;
    const click = w * Math.exp(-Math.max(0, t - 0.065) * 900) * (t > 0.06 ? 0.6 : 0);
    d[i] = scrape + ping + click;
  }
  return normalize(buffer, 0.8);
}

/** The spoon flying off (a bright springy tink) + the arm's throw whoosh. */
export function createGrenadeThrow(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.42);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  let lp = 0, bp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const u = i / len;
    const w = r() * 2 - 1;
    const c = 0.05 + 0.25 * Math.sin(Math.PI * Math.min(1, u * 1.6));
    lp += (w - lp) * c; bp += (lp - bp) * 0.3;
    const whoosh = (lp - bp) * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.4)), 2) * 0.9;
    const tink = (Math.sin(2 * Math.PI * 5200 * t) * 0.5 + Math.sin(2 * Math.PI * 7400 * t) * 0.3)
      * (t > 0.12 ? Math.exp(-(t - 0.12) * 45) : 0);
    L[i] = whoosh * (1 - u * 0.5) + tink * 0.4;
    R[i] = whoosh * (0.5 + u * 0.5) + tink * 0.25;
  }
  return normalize(buffer, 0.75);
}

/** A grenade body hitting the ground: dull metallic knock + a little grit. */
export function createGrenadeBounce(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.22);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  const modes = [410, 1180, 2230].map((f) => f * (0.92 + r() * 0.16));
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.25;
    let ring = 0;
    for (let k = 0; k < modes.length; k++) ring += Math.sin(2 * Math.PI * modes[k] * t) * Math.exp(-t * (40 + k * 30)) / (k + 1);
    const thud = lp * Math.exp(-t * 60) * 0.8;
    d[i] = Math.tanh(ring * 0.7 + thud + w * Math.exp(-t * 500) * 0.4);
  }
  return normalize(buffer, 0.8);
}

/** EMP detonation: a capacitor dump. Sub thump, rising electrical tear, crackle tail. */
export function createEmpBlast(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 1.6);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  let ph = 0, lp = 0, crackle = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.04;
    const sub = Math.sin(2 * Math.PI * 46 * (1 + Math.exp(-t * 9)) * t) * Math.exp(-t * 4.5) * 0.9;
    // The tear: a buzzing saw that sweeps up then decays.
    const f = 90 + 900 * (1 - Math.exp(-t * 6)) + Math.sin(t * 310) * 30;
    ph += (2 * Math.PI * f) / sr;
    const saw = ((ph / Math.PI) % 2) - 1;
    const tear = saw * Math.exp(-t * 3.2) * 0.32 * (t < 0.02 ? t / 0.02 : 1);
    if (r() < 0.012 * Math.exp(-t * 1.5)) crackle = (r() < 0.5 ? -1 : 1);
    crackle *= 0.86;
    const sparks = crackle * 0.5 + lp * Math.exp(-t * 2.5) * 0.4;
    const crack = w * Math.exp(-t * 80) * 0.9;
    const v = Math.tanh((sub + tear + sparks + crack) * 1.2);
    const s = Math.sin(t * 23) * 0.15;
    L[i] = v * (1 - s);
    R[i] = v * (1 + s);
  }
  return normalize(buffer, 0.95);
}

/** Thermite ignition: a whump, then a violent roaring hiss that settles to a sizzle. */
export function createThermite(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 2.4);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  const r = rng(seed);
  let lpA = 0, lpB = 0, hp = 0, pop = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lpA += (w - lpA) * 0.5; hp += (lpA - hp) * 0.08;
    lpB += (w - lpB) * 0.03;
    const whump = (Math.sin(2 * Math.PI * 58 * t) + lpB * 2) * Math.exp(-t * 7) * 0.7;
    const roarEnv = (1 - Math.exp(-t * 18)) * (0.35 + 0.65 * Math.exp(-t * 1.1));
    const roar = (lpA - hp) * roarEnv * 0.75;
    if (r() < 0.004) pop = 1;
    pop *= 0.9;
    const v = Math.tanh(whump + roar + pop * w * 0.5);
    L[i] = v * (0.9 + Math.sin(t * 7) * 0.1);
    R[i] = v * (0.9 - Math.sin(t * 7) * 0.1);
  }
  return normalize(buffer, 0.9);
}

/** Grenade pouch pickup: webbing rustle + two grenades knocking together. */
export function createGrenadePickup(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.4);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  let lp = 0;
  const knock = (t: number, tk: number) => (t > tk
    ? (Math.sin(2 * Math.PI * 620 * (t - tk)) + Math.sin(2 * Math.PI * 1640 * (t - tk)) * 0.4) * Math.exp(-(t - tk) * 55)
    : 0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.3;
    const rustle = lp * Math.sin(Math.PI * Math.min(1, t / 0.3)) * 0.35;
    d[i] = rustle + knock(t, 0.09) * 0.6 + knock(t, 0.2) * 0.45;
  }
  return normalize(buffer, 0.75);
}

// ── DEATHS ────────────────────────────────────────────────────────────────

/**
 * Robot power-down: servo whine collapsing in pitch, relays chattering open,
 * and the mains hum bleeding off. The machine dying as it falls.
 */
export function createRobotPowerDown(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 1.1);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  let ph = 0, ph2 = 0, lp = 0;
  const relays = [0.05, 0.11, 0.19, 0.34].map((x) => x + r() * 0.04);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.2;
    const f = 880 * Math.exp(-t * 2.6) + 40;
    ph += (2 * Math.PI * f) / sr;
    ph2 += (2 * Math.PI * f * 1.51) / sr;
    const whine = (Math.sin(ph) * 0.6 + Math.sin(ph2) * 0.25) * Math.exp(-t * 1.9);
    let relay = 0;
    for (const rt of relays) if (t > rt) relay += w * Math.exp(-(t - rt) * 600) * 0.7;
    const hum = Math.sin(2 * Math.PI * 100 * t) * Math.exp(-t * 3) * 0.2 * (1 + Math.sin(t * 40) * 0.5);
    d[i] = Math.tanh((whine * 0.6 + relay + hum + lp * 0.05 * Math.exp(-t * 4)) * 1.1);
  }
  return normalize(buffer, 0.75);
}

/** A heavy steel chassis hitting the ground: impact, panel clatter, settle. */
export function createRobotCollapse(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.9);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  const plates = [142, 388, 917, 1661, 2480].map((f) => f * (0.9 + r() * 0.2));
  const rattles = [0.09, 0.16, 0.27, 0.41].map((x) => x + r() * 0.05);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.06;
    const thud = (Math.sin(2 * Math.PI * 48 * (1 + Math.exp(-t * 18)) * t) * 0.9 + lp * 1.4) * Math.exp(-t * 9);
    let ring = 0;
    for (let k = 0; k < plates.length; k++) ring += Math.sin(2 * Math.PI * plates[k] * t) * Math.exp(-t * (9 + k * 6)) / (k + 1.4);
    let rattle = 0;
    for (const rt of rattles) {
      if (t > rt) {
        const tt = t - rt;
        rattle += (Math.sin(2 * Math.PI * (700 + rt * 900) * tt) + w * 0.6) * Math.exp(-tt * 50) * 0.35;
      }
    }
    d[i] = Math.tanh((thud + ring * 0.45 + rattle) * 1.2);
  }
  return normalize(buffer, 0.92);
}

/** Player death: a body hitting the ground (cloth + gear + dull thump). */
export function createBodyFall(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.7);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    lp += (w - lp) * 0.04; lp2 += (w - lp2) * 0.35;
    const thump = (Math.sin(2 * Math.PI * 62 * t) * 0.8 + lp * 1.6) * Math.exp(-t * 11);
    const cloth = lp2 * Math.exp(-t * 7) * 0.25;
    const gear = t > 0.05 ? (Math.sin(2 * Math.PI * 1320 * (t - 0.05)) * 0.3 + w * 0.2) * Math.exp(-(t - 0.05) * 40) : 0;
    const second = t > 0.22 ? (Math.sin(2 * Math.PI * 70 * (t - 0.22)) + lp * 1.2) * Math.exp(-(t - 0.22) * 14) * 0.45 : 0;
    d[i] = Math.tanh((thump + cloth + gear + second) * 1.2);
  }
  return normalize(buffer, 0.9);
}

/** Tinnitus: the high ring left in the ears after a lethal blow. */
export function createTinnitus(ctx: BaseAudioContext, sr: number): AudioBuffer {
  const len = Math.floor(sr * 3.2);
  const buffer = ctx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.08) * Math.exp(-t * 0.75);
    const wob = 1 + Math.sin(t * 5.3) * 0.0025;
    L[i] = Math.sin(2 * Math.PI * 4100 * wob * t) * env * 0.4 + Math.sin(2 * Math.PI * 6250 * t) * env * 0.08;
    R[i] = Math.sin(2 * Math.PI * 4106 * wob * t) * env * 0.4 + Math.sin(2 * Math.PI * 6240 * t) * env * 0.08;
  }
  return normalize(buffer, 0.55);
}

/** Arming click: a stiff mechanical detent + a short electronic chirp. */
export function createArmClick(ctx: BaseAudioContext, sr: number, seed: number): AudioBuffer {
  const len = Math.floor(sr * 0.22);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const w = r() * 2 - 1;
    const click = (w * 0.6 + Math.sin(2 * Math.PI * 2400 * t) * 0.5) * Math.exp(-t * 420);
    const detent = t > 0.018 ? (w * 0.4 + Math.sin(2 * Math.PI * 1700 * (t - 0.018))) * Math.exp(-(t - 0.018) * 300) * 0.5 : 0;
    const chirp = t > 0.05 && t < 0.13 ? Math.sin(2 * Math.PI * (2600 + (t - 0.05) * 9000) * t) * 0.28 * Math.sin(((t - 0.05) / 0.08) * Math.PI) : 0;
    d[i] = click + detent + chirp;
  }
  return normalize(buffer, 0.7);
}

/** Decoy ping: a sonar-like electronic chirp that carries. */
export function createDecoyPing(ctx: BaseAudioContext, sr: number): AudioBuffer {
  const len = Math.floor(sr * 0.32);
  const buffer = ctx.createBuffer(1, len, sr);
  const d = buffer.getChannelData(0);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const f = 1500 + 900 * Math.exp(-t * 18);
    ph += (2 * Math.PI * f) / sr;
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 11);
    d[i] = (Math.sin(ph) * 0.7 + Math.sin(ph * 2) * 0.18) * env;
  }
  return normalize(buffer, 0.6);
}
