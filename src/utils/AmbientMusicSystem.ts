/**
 * AMBIENT MUSIC SYSTEM — per-map adaptive procedural SURVIVAL score.
 *
 * A fully generative, Minecraft-style background-music director tuned for a
 * survival shooter: every note is synthesized live through the Web Audio
 * graph (zero assets, zero download, all DSP on the audio thread), and the
 * musical language is deliberately dark — modal minor harmony, sus2 unease,
 * phrygian dread, sparse felt-piano/low-bell motifs over drone beds. Nothing
 * here should ever read as "pretty village music"; the score is quiet dread
 * that makes room for gunfire.
 *
 * Structure — four layers per map, mixed into one music chain:
 *   • BED    — an always-on, very quiet drone/air texture (sub + detuned
 *              drones + filtered wind) so "silence" between pieces is never
 *              dead air. Drone-forward: this is the survival backbone.
 *   • PIECE  — the Minecraft part: every 45–130 s of quiet, the composer
 *              generates a 60–110 s piece (pad chords + sparse walking
 *              melody + bass) from the map's theme, then dissolves back into
 *              the bed. Pieces are NEVER loops: progressions are re-rolled
 *              (never the same one twice in a row), tempo/length jitter per
 *              piece, and an arch form swells and thins the melody across it.
 *   • SPARKLE— rare lone notes during silences (night chimes, swamp drips,
 *              distant gongs) so the world keeps breathing.
 *   • PULSE  — a soft heartbeat "lub-dub" sub-thump that emerges only under
 *              combat pressure / late-wave tension and vanishes when calm.
 *
 * Adaptive director — update() feeds it every frame:
 *   • time-of-day  → day/night palettes (night = sparser, darker, slower) +
 *                    a global brightness filter that follows the same solar
 *                    curve the sky uses
 *   • weather      → each storm species has its own musical response (rain
 *                    is cozy-dark, a sandstorm buries the piece, Twilight
 *                    Vale wisps make the sparkle layer bloom)
 *   • combat/waves → enemy pressure ducks the piece gently and raises the
 *                    heartbeat; wave escalation biases chord pools darker
 *                    and shortens the gaps
 *   • overlay      → pause menu / mystery-box screens fade the WHOLE score
 *                    to silence in ~0.35 s and bloom it back over ~1.2 s on
 *                    resume — the piece keeps flowing underneath, so a short
 *                    pause resumes mid-phrase with zero discontinuity
 *   • smart switch → if day/night flips mid-piece, the piece winds down at
 *                    the next chord boundary and resolves to the tonic
 *                    instead of playing the wrong palette into the dark.
 *
 * Performance invariants:
 *   • No per-frame main-thread work: update() self-throttles to ~4 Hz (the
 *     overlay fade is the one fast path) and only issues setTargetAtTime
 *     ramps; note scheduling runs on a 450 ms lookahead timer (~2.4 s ahead).
 *   • Routes through SoundManager's master bus, so the low-health slow-mo
 *     muffle applies to the score exactly like every other sound.
 *   • Voice nodes are stopped + disconnected onended — no graph leaks.
 *   • Respects the global musicMute toggle and the Settings music volume.
 */

import type { MapType } from './MapSystem';
import type { StormKind } from './WeatherSystem';
import { soundManager } from './SoundManager';
import { musicMute } from './musicMute';
import { gameSettingsManager } from './GameSettingsManager';

// ─────────────────────────────────────────────────────────────────────────────
// Theme schema
// ─────────────────────────────────────────────────────────────────────────────

type Instrument = 'felt' | 'bell' | 'gong' | 'pluck' | 'flute' | 'drop';
type PadKind = 'warm' | 'glass' | 'choir' | 'dark';

interface Palette {
  /** Scale semitones within the octave (melody note pool). */
  scale: number[];
  /** Chord-progression pool, ordered calm → tense. Chords are semitone sets from the theme root. */
  progs: number[][][];
  melodic: Instrument;
  /** Semitone offset from theme root where the lead register begins. */
  melodyOct: number;
  /** 0..1 — melody note probability scaler (kept LOW: survival = space). */
  density: number;
  tempo: number;
  /** 0..1 — arpeggio-sparkle probability weight inside pieces. */
  arp: number;
}

interface ThemeDef {
  /** MIDI note of the tonal centre. */
  root: number;
  day: Palette;
  night: Palette;
  pad: PadKind;
  padLevel: number;
  bassLevel: number;
  bed: {
    sub: number; drone: number; air: number;
    /** Centre frequency of the air/wind bandpass — icy high, swampy low. */
    airHz: number;
    shimmer: number; fifth: boolean;
    /** Bed drone lowpass cutoff. */
    cutoff: number;
  };
  reverb: { seconds: number; decay: number; wet: number };
  /** Silence between pieces [min, max] seconds. */
  gap: [number, number];
  sparkleInst: Instrument;
  sparkleOct: number;
  sparkleLevel: number;
  /** Sparkles bloom at night (chimes / drips / tolls). */
  nightSparkle?: boolean;
  /** Base brightness — music colour-filter cutoff in Hz. */
  color: number;
}

/** Live mood the game feeds in every frame (internally throttled). */
export interface MusicMoodInput {
  /** 0–24 game clock hour. */
  hour: number;
  /** 0..1 live precipitation (weatherMods.rainAmount). */
  storm: number;
  /** 0..1 sky darkening (weatherMods.skyDarken). */
  gloom: number;
  /** 0..1 enemy pressure. */
  combat: number;
  /** 0..1 long-run escalation (wave-driven). */
  tension: number;
  /** True while a blocking UI is up (pause menu, mystery box) — fades the score to silence. */
  overlay: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-map themes — DARK-MYSTERY PASS (full rewrite of the old tunes).
//
// Every map's score now lives in the same haunted register: phrygian b2
// unease, tritone colour chords that refuse to settle, hollow sus2 voicings,
// lower roots, slower tempos, sparser melodies and longer, wetter reverbs.
// DAY is no longer "the safe palette" — it's merely a thinner veil over the
// same dread, so the whole game keeps one continuous dark-mystery tone.
// Nothing here may ever read as pastoral, heroic or major-key; the score is
// a quiet question the map never answers. Chords remain explicit semitone
// stacks: watching-forest phrygian, furnace-deep wasteland, dead-white ice,
// heat-mirage desert dread, tritone bog, ghost-garrison emptiness, wrong-dusk
// vale, and ruins that remember something.
// ─────────────────────────────────────────────────────────────────────────────

const THEMES: Record<MapType, ThemeDef> = {
  // The flagship — the canopy WATCHES. Full phrygian felt piano over a low C,
  // the bII lean never resolving, a buried tritone cluster in the tense pool.
  // Nights go near-still: sparse low chimes over hollow drones.
  deep_forest: {
    root: 48, // C3
    day: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [8, 12, 15], [0, 3, 7]],
        [[0, 2, 7], [8, 12, 15], [1, 5, 8], [0, 3, 7]],
        [[0, 3, 7, 10], [1, 5, 8], [6, 10, 13], [0, 3, 7]],
      ],
      melodic: 'felt', melodyOct: 12, density: 0.3, tempo: 50, arp: 0.18,
    },
    night: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 2, 7], [0, 3, 7]],
        [[0, 3, 7], [6, 10, 13], [0, 3, 7], [0, 3, 7]],
      ],
      melodic: 'bell', melodyOct: 12, density: 0.2, tempo: 44, arp: 0.1,
    },
    pad: 'dark', padLevel: 0.95, bassLevel: 0.9,
    bed: { sub: 0.9, drone: 0.85, air: 0.5, airHz: 700, shimmer: 0.05, fifth: true, cutoff: 380 },
    reverb: { seconds: 3.8, decay: 2.4, wet: 0.46 },
    gap: [40, 95], sparkleInst: 'bell', sparkleOct: 24, sparkleLevel: 0.55,
    nightSparkle: true, color: 5200,
  },

  // Furnace-deep — the slowest, heaviest theme in the game. Phrygian drones
  // over a C2 rumble, rare low piano embers by day, distant inharmonic gongs
  // through the ash at night. The diminished cluster is the ground opening.
  scorched_wasteland: {
    root: 36, // C2
    day: {
      scale: [0, 1, 3, 5, 6, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 13, 17]],
        [[0, 3, 6], [1, 5, 8], [8, 11, 15], [0, 3, 7]],
      ],
      melodic: 'felt', melodyOct: 24, density: 0.24, tempo: 42, arp: 0.08,
    },
    night: {
      scale: [0, 1, 3, 5, 6, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 3, 6], [0, 3, 7]],
      ],
      melodic: 'gong', melodyOct: 12, density: 0.16, tempo: 40, arp: 0.06,
    },
    pad: 'dark', padLevel: 0.95, bassLevel: 1.0,
    bed: { sub: 1.0, drone: 0.95, air: 0.6, airHz: 260, shimmer: 0, fifth: false, cutoff: 260 },
    reverb: { seconds: 4.2, decay: 2.8, wet: 0.34 },
    gap: [55, 120], sparkleInst: 'gong', sparkleOct: 0, sparkleLevel: 0.5, color: 3800,
  },

  // Dead white plain — something under the ice. Sparse glass bells over a
  // lowered aeolian with a half-diminished shadow chord; the sus2 voicings
  // are windows into an empty house. Vast cold reverb, thin high wind.
  frozen_tundra: {
    root: 53, // F3
    day: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [8, 12, 15], [0, 2, 7], [10, 14, 17]],
        [[0, 2, 7], [8, 12, 15], [0, 3, 6], [0, 3, 7]],
        [[0, 3, 7], [5, 8, 12], [8, 12, 15], [0, 2, 7]],
      ],
      melodic: 'bell', melodyOct: 12, density: 0.26, tempo: 48, arp: 0.22,
    },
    night: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [8, 12, 15], [0, 3, 6], [0, 2, 7]],
      ],
      melodic: 'bell', melodyOct: 12, density: 0.18, tempo: 44, arp: 0.14,
    },
    pad: 'glass', padLevel: 0.85, bassLevel: 0.75,
    bed: { sub: 0.75, drone: 0.75, air: 0.7, airHz: 2000, shimmer: 0.18, fifth: true, cutoff: 520 },
    reverb: { seconds: 5.0, decay: 2.2, wet: 0.5 },
    gap: [50, 110], sparkleInst: 'bell', sparkleOct: 24, sparkleLevel: 0.7,
    nightSparkle: true, color: 6200,
  },

  // Heat-mirage dread — the hijaz comfort is GONE: pure phrygian day and
  // night, the I→bII sway now a slow shimmer over something buried in the
  // sand. A bare, ornament-less flute by day reads as a signal, not a song;
  // nights drop to hollow plucks and the tritone shadow.
  desert_canyon: {
    root: 50, // D3
    day: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 13, 17]],
        [[0, 3, 7], [6, 10, 13], [1, 5, 8], [0, 3, 7]],
      ],
      melodic: 'flute', melodyOct: 12, density: 0.22, tempo: 46, arp: 0.12,
    },
    night: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 2, 7], [0, 3, 7]],
      ],
      melodic: 'pluck', melodyOct: 12, density: 0.16, tempo: 42, arp: 0.08,
    },
    pad: 'dark', padLevel: 0.8, bassLevel: 0.85,
    bed: { sub: 0.75, drone: 0.8, air: 0.6, airHz: 1100, shimmer: 0, fifth: true, cutoff: 400 },
    reverb: { seconds: 4.4, decay: 2.6, wet: 0.42 },
    gap: [55, 115], sparkleInst: 'pluck', sparkleOct: 12, sparkleLevel: 0.45, color: 5200,
  },

  // The bog dissolves pitch itself — the scale carries a flat five, so even
  // the melody wanders through the tritone. Water-drop plinks ARE the sparkle
  // layer; the spore-bloom storm makes the music wobble, not duck.
  toxic_swamp: {
    root: 41, // F2
    day: {
      scale: [0, 2, 3, 5, 6, 8, 10],
      progs: [
        [[0, 3, 7], [6, 10, 13], [0, 3, 6], [0, 3, 7]],
        [[0, 3, 7, 10], [6, 10, 13], [8, 12, 15], [0, 3, 7]],
      ],
      melodic: 'pluck', melodyOct: 24, density: 0.26, tempo: 44, arp: 0.12,
    },
    night: {
      scale: [0, 2, 3, 5, 6, 8, 10],
      progs: [
        [[0, 3, 7], [6, 10, 13], [0, 2, 7], [0, 3, 6]],
      ],
      melodic: 'bell', melodyOct: 24, density: 0.18, tempo: 40, arp: 0.08,
    },
    pad: 'dark', padLevel: 0.9, bassLevel: 1.0,
    bed: { sub: 0.95, drone: 0.85, air: 0.6, airHz: 380, shimmer: 0, fifth: false, cutoff: 300 },
    reverb: { seconds: 3.6, decay: 2.7, wet: 0.4 },
    gap: [40, 95], sparkleInst: 'drop', sparkleOct: 24, sparkleLevel: 1.0,
    nightSparkle: true, color: 4400,
  },

  // Ghost garrison — the dorian warmth is stripped out: hollow sus2 frames,
  // a bVI shadow and a bII flicker in an empty motor pool. Muted felt piano
  // in a bigger, deader room. Reads as "everyone left mid-sentence".
  military_outpost: {
    root: 43, // G2
    day: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 2, 7], [8, 12, 15], [0, 3, 7, 10], [0, 2, 7]],
        [[0, 3, 7], [10, 14, 17], [1, 5, 8], [0, 3, 7]],
      ],
      melodic: 'felt', melodyOct: 12, density: 0.26, tempo: 48, arp: 0.08,
    },
    night: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7, 10], [8, 12, 15], [0, 2, 7], [0, 3, 7]],
      ],
      melodic: 'felt', melodyOct: 12, density: 0.18, tempo: 44, arp: 0.06,
    },
    pad: 'dark', padLevel: 0.75, bassLevel: 0.9,
    bed: { sub: 0.8, drone: 0.7, air: 0.45, airHz: 600, shimmer: 0, fifth: true, cutoff: 340 },
    reverb: { seconds: 3.4, decay: 2.8, wet: 0.32 },
    gap: [50, 115], sparkleInst: 'pluck', sparkleOct: 12, sparkleLevel: 0.35, color: 4800,
  },

  // Twilight Vale — the dusk that is WRONG. Full phrygian day and night now,
  // ghost-choir pads under sparse tolls, a tritone flicker in the tense pool.
  // The wisps storm is the one storm that blooms the sparkles instead of
  // ducking — the lights in the trees are singing back.
  autumn_grove: {
    root: 46, // Bb2
    day: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [8, 12, 15], [0, 3, 7]],
        [[0, 2, 7], [1, 5, 8], [6, 10, 13], [0, 3, 7]],
      ],
      melodic: 'bell', melodyOct: 12, density: 0.26, tempo: 46, arp: 0.2,
    },
    night: {
      scale: [0, 1, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 2, 7], [0, 3, 7]],
      ],
      melodic: 'bell', melodyOct: 12, density: 0.2, tempo: 42, arp: 0.14,
    },
    pad: 'choir', padLevel: 0.95, bassLevel: 0.65,
    bed: { sub: 0.7, drone: 0.75, air: 0.55, airHz: 1400, shimmer: 0.22, fifth: true, cutoff: 480 },
    reverb: { seconds: 5.4, decay: 2.0, wet: 0.55 },
    gap: [40, 95], sparkleInst: 'bell', sparkleOct: 24, sparkleLevel: 0.85,
    nightSparkle: true, color: 5600,
  },

  // The ruins REMEMBER something. Aeolian plucks under a low half-heard
  // choir, the longest stone-hall reverb in the game, and a tritone shadow
  // chord like a door opening two rooms away. Distant gong tolls at night.
  ancient_ruins: {
    root: 48, // C3
    day: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [10, 14, 17], [1, 5, 8], [0, 3, 7]],
        [[0, 3, 7, 10], [8, 12, 15], [6, 10, 13], [0, 2, 7]],
      ],
      melodic: 'pluck', melodyOct: 12, density: 0.28, tempo: 48, arp: 0.22,
    },
    night: {
      scale: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        [[0, 3, 7], [1, 5, 8], [0, 2, 7], [0, 3, 7]],
      ],
      melodic: 'gong', melodyOct: 12, density: 0.18, tempo: 42, arp: 0.1,
    },
    pad: 'choir', padLevel: 0.9, bassLevel: 0.9,
    bed: { sub: 0.8, drone: 0.8, air: 0.5, airHz: 900, shimmer: 0.08, fifth: true, cutoff: 400 },
    reverb: { seconds: 5.8, decay: 1.9, wet: 0.5 },
    gap: [45, 105], sparkleInst: 'bell', sparkleOct: 12, sparkleLevel: 0.5, color: 5000,
  },
};

/**
 * Musical response per storm species — applied ∝ live storm amount.
 * duck scales the piece layer, color the brightness filter, bed the drone,
 * sparkle the twinkle layer. Wisps are deliberately the outlier: no duck,
 * sparkles bloom.
 */
const STORM_MUSIC: Record<StormKind, { duck: number; color: number; bed: number; sparkle: number }> = {
  rain:      { duck: 0.72, color: 0.45, bed: 1.15, sparkle: 0.8 },
  sandstorm: { duck: 0.50, color: 0.30, bed: 1.20, sparkle: 0.5 },
  blizzard:  { duck: 0.55, color: 0.34, bed: 1.25, sparkle: 0.6 },
  ashfall:   { duck: 0.60, color: 0.32, bed: 1.20, sparkle: 0.5 },
  spores:    { duck: 0.85, color: 0.55, bed: 1.15, sparkle: 1.1 },
  wisps:     { duck: 1.00, color: 0.80, bed: 1.10, sparkle: 1.6 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Scheduler pacing — 450 ms tick scheduling 2.4 s ahead survives heavy jank. */
const TICK_MS = 450;
const LOOKAHEAD = 2.4;
/** Steps are 8th notes; a chord holds 2 bars of 4/4. */
const STEPS_PER_CHORD = 16;
/** Static headroom under the SFX mix. */
const HEADROOM = 0.9;
/** Layer base gains — drone-forward survival mix (bed carries, piece visits). */
const BED_BASE = 0.48;
const PIECE_BASE = 0.85;
const SPARKLE_BASE = 0.5;

interface PieceState {
  palette: Palette;
  chords: number[][];
  chordIdx: number;
  stepInChord: number;
  /** Seconds per 8th-note step. */
  spb: number;
  /** Global step counter (melody enters after the intro chord). */
  step: number;
  melodyFrom: number;
  night: boolean;
  // Melody walk state
  noteTable: number[];
  walkIdx: number;
  holdSteps: number;
  restSteps: number;
  phraseLeft: number;
  arpIdx: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────────────────────────

class AmbientMusicEngine {
  private ctx: AudioContext | null = null;
  private running = false;
  private theme: ThemeDef | null = null;
  private storm: StormKind = 'rain';

  // Buses
  private bedBus: GainNode | null = null;
  private pieceBus: GainNode | null = null;
  private sparkleBus: GainNode | null = null;
  private pulseBus: GainNode | null = null;
  private colorLP: BiquadFilterNode | null = null;
  private dryGain: GainNode | null = null;
  private sendGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private revGain: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private uiGain: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private choirIn: GainNode | null = null;
  private choirNodes: AudioNode[] = [];

  // Bed lifetime nodes (stopped + disconnected on teardown)
  private bedOscs: OscillatorNode[] = [];
  private bedSources: AudioBufferSourceNode[] = [];
  private bedNodes: AudioNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;

  // Scheduler
  private timer: number | null = null;
  private phase: 'silence' | 'piece' = 'silence';
  private nextPieceAt = 0;
  private stepTime = 0;
  private nextSparkleAt = 0;
  private piece: PieceState | null = null;
  private pieceDeferrals = 0;
  private lastProgIdx = -1;
  private pulseTime = 0;
  private pulseLevel = 0;

  // Mood (latest game input, applied at ~4 Hz; overlay is the fast path)
  private readonly mood: MusicMoodInput = { hour: 12, storm: 0, gloom: 0, combat: 0, tension: 0, overlay: false };
  private lastApplyMs = 0;
  private lastOverlay = false;
  private dayW = 1;

  // Volume plumbing
  private settingsVol = 0;
  private muteFactor = 1;
  private life = 0; // lifecycle fade 0..1
  private subscribed = false;
  private teardownTimer: number | null = null;
  private unlockHooked = false;

  // ── Public API ────────────────────────────────────────────────────────────

  /** Boot the score for a map. Call at scene init (after a user gesture). */
  start(map: MapType, storm: StormKind): void {
    const bus = soundManager.getMusicInput();
    if (!bus) return; // no Web Audio — silently inert
    this.hardTeardown(); // idempotent restart (fresh run / strict re-mount)

    this.ctx = bus.ctx;
    this.theme = THEMES[map] ?? THEMES.deep_forest;
    this.storm = storm;
    this.ensureRunning(this.ctx);
    this.ensureSubscriptions();
    this.settingsVol = gameSettingsManager.getEffectiveAmbienceVolume();
    this.muteFactor = musicMute.get() ? 0 : 1;

    const ctx = this.ctx;
    const t = this.theme;

    // Mix chain: layers → colour filter → dry + reverb send → compressor →
    // ui fade → music out → SoundManager music input (→ slow-mo muffle).
    this.bedBus = ctx.createGain();
    this.pieceBus = ctx.createGain();
    this.sparkleBus = ctx.createGain();
    this.pulseBus = ctx.createGain();
    this.bedBus.gain.value = BED_BASE;
    this.pieceBus.gain.value = PIECE_BASE;
    this.sparkleBus.gain.value = SPARKLE_BASE;
    this.pulseBus.gain.value = 0; // heartbeat only emerges under pressure

    this.colorLP = ctx.createBiquadFilter();
    this.colorLP.type = 'lowpass';
    this.colorLP.frequency.value = t.color;
    this.colorLP.Q.value = 0.0001;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;

    this.uiGain = ctx.createGain();
    this.uiGain.gain.value = 1;
    this.musicOut = ctx.createGain();
    this.musicOut.gain.value = 0;
    this.life = 1; // target; the 0 → target ramp below is the fade-in

    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.sendGain = ctx.createGain();
    this.sendGain.gain.value = t.reverb.wet;
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 1;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = this.makeImpulse(ctx, t.reverb.seconds, t.reverb.decay);

    this.bedBus.connect(this.colorLP);
    this.pieceBus.connect(this.colorLP);
    this.sparkleBus.connect(this.colorLP);
    // Heartbeat bypasses the colour filter AND the reverb — a dry sub-thump
    // in the chest, never a washy boom in the tail.
    this.pulseBus.connect(this.dryGain);
    this.colorLP.connect(this.dryGain);
    this.dryGain.connect(this.comp);
    this.colorLP.connect(this.sendGain);
    this.sendGain.connect(this.convolver);
    this.convolver.connect(this.revGain);
    this.revGain.connect(this.comp);
    this.comp.connect(this.uiGain);
    this.uiGain.connect(this.musicOut);
    this.musicOut.connect(bus.input);

    if (t.pad === 'choir') this.buildChoirChain(ctx);
    this.buildBed(ctx, t);

    // Opening state: bed fades in, first piece lands 7–15 s after spawn.
    this.running = true;
    this.phase = 'silence';
    this.lastOverlay = false;
    this.pulseLevel = 0;
    this.pulseTime = 0;
    this.nextPieceAt = ctx.currentTime + rand(7, 15);
    this.nextSparkleAt = ctx.currentTime + rand(8, 16);
    this.applyOutGain(1.6); // slow fade-in (~5 s to full)
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  /**
   * Feed the live mood. Safe (and intended) to call every frame — parameter
   * ramps are only issued ~4×/s; the exception is the overlay flag, which
   * fades the score the moment a pause/mystery-box screen opens or closes.
   */
  update(mood: MusicMoodInput): void {
    if (!this.running) return;
    const m = this.mood;
    m.hour = mood.hour; m.storm = mood.storm; m.gloom = mood.gloom;
    m.combat = mood.combat; m.tension = mood.tension; m.overlay = mood.overlay;
    // Overlay engage/release is the one latency-sensitive path — apply it
    // immediately so the fade starts the same frame the menu opens.
    if (m.overlay !== this.lastOverlay) {
      this.lastOverlay = m.overlay;
      this.applyUiGain();
    }
    const now = performance.now();
    if (now - this.lastApplyMs < 240) return;
    this.lastApplyMs = now;
    this.applyMood();
  }

  /** Fade out and tear the graph down. Call from scene cleanup. */
  stop(): void {
    if (!this.running || !this.ctx) return;
    this.running = false;
    this.life = 0;
    this.applyOutGain(0.35);
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    // Let the 0.35 s-tau fade complete before releasing nodes.
    this.teardownTimer = window.setTimeout(() => this.hardTeardown(), 1600);
  }

  // ── Adaptive director ────────────────────────────────────────────────────

  private applyMood(): void {
    if (!this.ctx || !this.theme || !this.colorLP || !this.pieceBus || !this.bedBus || !this.sparkleBus) return;
    const m = this.mood;
    const t = this.theme;
    const now = this.ctx.currentTime;

    // Day weight from the same solar-elevation curve the sky uses, so the
    // music darkens exactly as the light does.
    const elev = Math.sin((Math.PI * (m.hour - 6)) / 12);
    const dw = clamp01((elev + 0.12) / 0.24);
    this.dayW = dw * dw * (3 - 2 * dw);

    const sm = STORM_MUSIC[this.storm];
    const storm = clamp01(m.storm);
    const gloom = clamp01(m.gloom);
    const combat = clamp01(m.combat);

    // Brightness: night + weather all close the same filter, so every
    // transition is one smooth timbral morph instead of a mix switch.
    const cutoff = Math.max(700,
      t.color
      * (0.62 + 0.38 * this.dayW)
      * lerp(1, sm.color, storm)
      * lerp(1, 0.6, gloom * 0.7));
    this.colorLP.frequency.setTargetAtTime(cutoff, now, 2.5);

    // Combat duck is deliberately gentle (max −28%): this is a wave shooter,
    // so "in combat" is the default state — the score must live through it
    // and merely make room for the gunfire, not vanish.
    const pieceGain = PIECE_BASE
      * (0.88 + 0.12 * this.dayW)
      * lerp(1, sm.duck, storm)
      * lerp(1, 0.8, gloom * 0.6)
      * (1 - 0.28 * combat);
    this.pieceBus.gain.setTargetAtTime(pieceGain, now, 1.8);

    const bedGain = BED_BASE
      * (1.05 - 0.15 * this.dayW)
      * lerp(1, sm.bed, storm);
    this.bedBus.gain.setTargetAtTime(bedGain, now, 3.0);

    const nightBoost = t.nightSparkle ? lerp(1.3, 1, this.dayW) : 1;
    const sparkleGain = SPARKLE_BASE
      * lerp(1, sm.sparkle, storm)
      * nightBoost
      * (1 - 0.4 * combat);
    this.sparkleBus.gain.setTargetAtTime(sparkleGain, now, 2.5);

    // Heartbeat — silent when calm, emerging with enemy pressure and the
    // long-run wave escalation, a touch stronger in the dark. The dead zone
    // keeps stray single enemies from ticking it on.
    const rawPulse = Math.max(combat * 0.9, clamp01(m.tension) * 0.55);
    this.pulseLevel = clamp01((rawPulse - 0.18) / 0.82);
    if (this.pulseBus) {
      const pulseGain = 0.5 * this.pulseLevel * (this.dayW < 0.45 ? 1.15 : 1);
      this.pulseBus.gain.setTargetAtTime(pulseGain, now, 2.0);
    }
  }

  /** musicOut = settings volume × mute × lifecycle × headroom. */
  private applyOutGain(tau: number): void {
    if (!this.ctx || !this.musicOut) return;
    const v = clamp01(this.settingsVol) * this.muteFactor * this.life * HEADROOM;
    this.musicOut.gain.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  /**
   * Overlay fade — pause menu / mystery box. OUT is fast (~0.35 s to silence,
   * still a fade, never a cut); IN blooms back over ~1.2 s. The composer keeps
   * flowing silently underneath, so a short pause resumes mid-phrase.
   */
  private applyUiGain(): void {
    if (!this.ctx || !this.uiGain) return;
    const now = this.ctx.currentTime;
    if (this.lastOverlay) this.uiGain.gain.setTargetAtTime(0.0001, now, 0.1);
    else this.uiGain.gain.setTargetAtTime(1, now, 0.35);
  }

  private ensureSubscriptions(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    musicMute.subscribe((muted) => {
      this.muteFactor = muted ? 0 : 1;
      this.applyOutGain(0.4);
    });
    gameSettingsManager.subscribe(() => {
      this.settingsVol = gameSettingsManager.getEffectiveAmbienceVolume();
      this.applyOutGain(0.25);
    });
  }

  /** Resume a suspended context; if the browser refuses, retry on next input. */
  private ensureRunning(ctx: AudioContext): void {
    if (ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => { /* retried below */ });
    if (this.unlockHooked) return;
    this.unlockHooked = true;
    const unlock = () => {
      void ctx.resume().catch(() => { /* keep trying on later gestures */ });
      if (ctx.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        this.unlockHooked = false;
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // ── Scheduler (Minecraft-style piece director) ───────────────────────────

  private tick(): void {
    if (!this.running || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Effectively silent (muted / volume 0): stop composing, keep the graph
    // idle-cheap. Any in-flight piece is abandoned; scheduled voices decay
    // inaudibly and free themselves.
    if (this.muteFactor === 0 || this.settingsVol <= 0.001) {
      if (this.phase === 'piece') { this.piece = null; this.phase = 'silence'; }
      this.nextPieceAt = Math.max(this.nextPieceAt, now + 6);
      return;
    }

    // Heartbeat pulse — its own slow clock, independent of pieces, skipped
    // entirely while calm or behind an overlay (silent anyway — save nodes).
    if (this.pulseLevel > 0.02 && this.theme && !this.mood.overlay) {
      const interval = 120 / this.theme.day.tempo; // one lub-dub per 2 beats
      if (this.pulseTime < now - 1) this.pulseTime = now + 0.1;
      while (this.pulseTime < now + LOOKAHEAD) {
        this.playPulse(this.pulseTime);
        this.pulseTime += interval;
      }
    }

    if (this.phase === 'silence') {
      // Behind a pause/mystery-box overlay: hold the silence — a new piece
      // starting inaudibly mid-menu would be wasted (and jarring on resume).
      if (this.mood.overlay) {
        this.nextPieceAt = Math.max(this.nextPieceAt, now + 3);
        return;
      }
      // Lone ambient sparkles keep the quiet alive (chimes / drips / tolls).
      if (now >= this.nextSparkleAt) {
        this.nextSparkleAt = now + rand(12, 28);
        if (this.theme && this.mood.combat < 0.6 && Math.random() < 0.7) this.playLoneSparkle(now + 0.1);
      }
      if (now >= this.nextPieceAt - LOOKAHEAD) {
        // Don't open a piece at the absolute peak of a fight — but only defer
        // a couple of times. Waves keep the arena near the spawn cap for long
        // stretches, so an unbounded wait would starve the score entirely.
        if (this.mood.combat > 0.9 && this.pieceDeferrals < 2) {
          this.pieceDeferrals++;
          this.nextPieceAt = now + rand(6, 12);
          return;
        }
        this.pieceDeferrals = 0;
        this.startPiece(Math.max(now + 0.2, this.nextPieceAt));
      }
      return;
    }

    // phase === 'piece': schedule steps up to the lookahead horizon.
    // Starvation guard — after a long throttled/hidden stretch, skip the
    // missed steps instead of bursting them all at once.
    if (this.stepTime < now - 0.3) this.stepTime = now + 0.1;
    while (this.piece && this.stepTime < now + LOOKAHEAD) this.scheduleStep();
  }

  private startPiece(at: number): void {
    const t = this.theme;
    if (!t || !this.ctx) return;
    const night = this.dayW < 0.45;
    const palette = night ? t.night : t.day;

    // Tension biases toward the tenser (later) progressions in the pool and
    // nudges the tempo — long runs escalate musically. Never the same
    // progression twice in a row, so consecutive pieces can't feel like a loop.
    const pool = palette.progs;
    const tension = clamp01(this.mood.tension);
    let idx = (tension > 0.4 && pool.length > 1 && Math.random() < tension)
      ? pool.length - 1
      : Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && idx === this.lastProgIdx) idx = (idx + 1) % pool.length;
    this.lastProgIdx = idx;
    const prog = pool[idx];
    const repeats = 2 + (Math.random() < 0.5 ? 1 : 0);
    const chords: number[][] = [];
    for (let r = 0; r < repeats; r++) for (const c of prog) chords.push(c);

    const tempo = palette.tempo * (1 + tension * 0.06) * rand(0.97, 1.03);
    const spb = 60 / tempo / 2;

    // Lead register table: scale degrees stacked in octaves above the melody
    // base, capped so leads never turn piercing.
    const base = t.root + palette.melodyOct;
    const noteTable: number[] = [];
    for (let oct = 0; oct <= 2 && noteTable.length < 18; oct++) {
      for (const deg of palette.scale) {
        const midi = base + oct * 12 + deg;
        if (midi <= base + 26) noteTable.push(midi);
      }
    }

    this.piece = {
      palette, chords, chordIdx: 0, stepInChord: 0, spb, step: 0,
      melodyFrom: STEPS_PER_CHORD, night, noteTable,
      walkIdx: Math.floor(noteTable.length / 2),
      holdSteps: 0, restSteps: 2, phraseLeft: 0, arpIdx: 0,
    };
    this.stepTime = at;
    this.phase = 'piece';
  }

  private scheduleStep(): void {
    const s = this.piece;
    const t = this.theme;
    if (!s || !t || !this.ctx || !this.pieceBus || !this.sparkleBus) return;
    const time = this.stepTime;
    const chordDur = STEPS_PER_CHORD * s.spb;

    // ── Chord boundary: smart wind-down check, then pad + bass ──
    if (s.stepInChord === 0) {
      // SMART SWITCH — if day/night flipped mid-piece, truncate so this chord
      // is the last: the piece resolves to its tonic outro instead of playing
      // the wrong palette into the dark. Reads as the music sensing dusk.
      const nightNow = this.dayW < 0.45;
      if (s.night !== nightNow && s.chordIdx >= 1 && s.chordIdx < s.chords.length - 1) {
        s.chords = s.chords.slice(0, s.chordIdx + 1);
      }
      const chord = s.chords[s.chordIdx];
      this.playPadChord(time, chord, chordDur, s.night);
      if (t.bassLevel > 0) {
        const bassMidi = t.root >= 45 ? t.root - 12 : t.root;
        this.playBass(time, bassMidi + (((chord[0] % 12) + 12) % 12), chordDur, t.bassLevel * (s.night ? 0.85 : 1));
      }
    }

    const chord = s.chords[s.chordIdx];
    // Arch form — the piece breathes: sparse opening, fuller middle, thin
    // dissolve. Kills any "looping pattern" read across the repeats.
    const pos = (s.chordIdx + s.stepInChord / STEPS_PER_CHORD) / s.chords.length;
    const arch = 0.7 + 0.3 * Math.sin(Math.PI * clamp01(pos));

    // ── Melody — probabilistic walk over the scale, chord-tone-anchored ──
    if (s.step >= s.melodyFrom && s.chordIdx < s.chords.length) {
      if (s.holdSteps > 0) {
        s.holdSteps--;
      } else if (s.restSteps > 0) {
        s.restSteps--;
      } else {
        const strong = s.stepInChord % 4 === 0;
        const p = s.palette.density * (strong ? 1 : 0.55) * arch;
        if (Math.random() < p) {
          this.playMelodyNote(time, s, chord, strong);
        } else if (s.phraseLeft <= 0 && Math.random() < 0.3) {
          s.restSteps = 2 + Math.floor(Math.random() * 4); // breathe between phrases
          s.phraseLeft = 3 + Math.floor(Math.random() * 5);
        }
      }
    }

    // ── Arp sparkles — middle of the arch only, off the strong beats ──
    if (pos > 0.25 && pos < 0.8 && s.stepInChord % 2 === 1 && Math.random() < s.palette.arp * 0.28 * t.sparkleLevel) {
      const tone = chord[s.arpIdx % chord.length];
      s.arpIdx++;
      const midi = t.root + tone + 12 + t.sparkleOct;
      this.playInstrument(t.sparkleInst, time + rand(-0.01, 0.01), midi, rand(0.16, 0.28), s.spb * 2, this.sparkleBus, rand(-0.6, 0.6));
    }

    // ── Advance ──
    s.step++;
    s.stepInChord++;
    this.stepTime += s.spb;
    if (s.stepInChord >= STEPS_PER_CHORD) {
      s.stepInChord = 0;
      s.chordIdx++;
      if (s.chordIdx >= s.chords.length) this.finishPiece(this.stepTime);
    }
  }

  private playMelodyNote(time: number, s: PieceState, chord: number[], strong: boolean): void {
    const t = this.theme;
    if (!t || !this.pieceBus) return;
    // Mostly stepwise walk; occasional leap; clamp to the register table.
    const leap = Math.random() < 0.12;
    const dir = Math.random() < 0.5 ? -1 : 1;
    let idx = s.walkIdx + dir * (leap ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2));
    idx = Math.max(0, Math.min(s.noteTable.length - 1, idx));

    // Strong beats resolve to a chord tone — the walk stays harmonically home.
    if (strong) {
      const chordSet = new Set(chord.map((c) => ((c % 12) + 12) % 12));
      for (let probe = 0; probe <= 3; probe++) {
        const lo = idx - probe, hi = idx + probe;
        if (lo >= 0 && chordSet.has((((s.noteTable[lo] - t.root) % 12) + 12) % 12)) { idx = lo; break; }
        if (hi < s.noteTable.length && chordSet.has((((s.noteTable[hi] - t.root) % 12) + 12) % 12)) { idx = hi; break; }
      }
    }
    s.walkIdx = idx;

    const durWeights: Array<[number, number]> = [[1, 0.25], [2, 0.35], [3, 0.15], [4, 0.18], [8, 0.07]];
    let roll = Math.random(), durSteps = 2;
    for (const [d, w] of durWeights) { roll -= w; if (roll <= 0) { durSteps = d; break; } }
    s.holdSteps = durSteps - 1;
    s.phraseLeft--;

    const vel = (0.45 + Math.random() * 0.3) * (s.night ? 0.85 : 1);
    const jitter = rand(-0.012, 0.012);
    this.playInstrument(s.palette.melodic, time + jitter, s.noteTable[idx], vel, durSteps * s.spb, this.pieceBus, rand(-0.25, 0.25));
  }

  private finishPiece(at: number): void {
    const t = this.theme;
    const s = this.piece;
    if (t && s && this.ctx) {
      // Outro: one long tonic pad so the piece resolves instead of stopping.
      this.playPadChord(at, s.chords[0], 8, s.night);
      const gapScale = (1 - 0.4 * clamp01(this.mood.tension)) * (s.night ? 1.15 : 1);
      this.nextPieceAt = at + 8 + rand(t.gap[0], t.gap[1]) * gapScale;
    }
    this.piece = null;
    this.phase = 'silence';
  }

  /** Rare lone note during silences — the world keeps breathing musically. */
  private playLoneSparkle(time: number): void {
    const t = this.theme;
    if (!t || !this.sparkleBus) return;
    const palette = this.dayW < 0.45 ? t.night : t.day;
    const tones = palette.progs[0][0];
    const tone = tones[Math.floor(Math.random() * tones.length)];
    const midi = t.root + tone + 12 + t.sparkleOct;
    this.playInstrument(t.sparkleInst, time, midi, rand(0.14, 0.26) * t.sparkleLevel, 1.5, this.sparkleBus, rand(-0.5, 0.5));
  }

  /** Heartbeat lub-dub — two soft sub thumps with a falling pitch, bone dry. */
  private playPulse(time: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pulseBus) return;
    const thump = (t: number, peak: number) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(54, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
      const g = ctx.createGain();
      o.connect(g);
      g.connect(this.pulseBus!);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.008);
      g.gain.setTargetAtTime(0.0001, t + 0.012, 0.1);
      o.start(t);
      o.stop(t + 0.65);
      o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* gone */ } };
    };
    thump(time, 0.5);
    thump(time + 0.16, 0.3);
  }

  // ── Instruments — every voice is native nodes, enveloped + self-freeing ──

  private playInstrument(kind: Instrument, time: number, midi: number, vel: number, durS: number, out: AudioNode, pan: number): void {
    if (!this.ctx) return;
    switch (kind) {
      case 'felt': this.noteFelt(time, midi, vel, durS, out, pan); break;
      case 'bell': this.noteBell(time, midi, vel, durS, out, pan, false); break;
      case 'gong': this.noteBell(time, midi, vel, durS, out, pan, true); break;
      case 'pluck': this.notePluck(time, midi, vel, durS, out, pan); break;
      case 'flute': this.noteFlute(time, midi, vel, durS, out, pan); break;
      case 'drop': this.noteDrop(time, midi, vel, out, pan); break;
    }
  }

  /** pan → StereoPanner when supported, else pass straight through. */
  private route(out: AudioNode, pan: number, nodes: AudioNode[]): AudioNode {
    const ctx = this.ctx!;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(out);
      nodes.push(p);
      return p;
    }
    return out;
  }

  private env(g: GainNode, t: number, atk: number, peak: number, hold: number, tau: number): number {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setTargetAtTime(0.0001, t + atk + hold, tau);
    return t + atk + hold + tau * 5 + 0.1; // safe stop time
  }

  private finish(nodes: AudioNode[], oscs: OscillatorNode[], t0: number, stopAt: number): void {
    for (const o of oscs) { o.start(t0); o.stop(stopAt); }
    oscs[0].onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } } };
  }

  /** Soft felt piano — sine/triangle body + quiet octave, velocity-keyed lowpass. */
  private noteFelt(t: number, midi: number, vel: number, durS: number, out: AudioNode, pan: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    if (f > 4200) return;
    const nodes: AudioNode[] = [];
    const dest = this.route(out, pan, nodes);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(6500, 900 + vel * 2200 + f * 1.2);
    lp.Q.value = 0.4;
    lp.connect(dest);
    const g = ctx.createGain();
    g.connect(lp);
    nodes.push(lp, g);
    const stopAt = this.env(g, t, 0.008, vel * 0.5, 0.02, Math.min(1.6, 0.24 + durS * 0.35));
    const oscs: OscillatorNode[] = [];
    const mk = (type: OscillatorType, freq: number, gain: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = gain;
      o.connect(og);
      og.connect(g);
      nodes.push(o, og);
      oscs.push(o);
    };
    mk('sine', f, 1.0);
    mk('triangle', f * 1.003, 0.36);
    if (f * 2 < 8000) mk('sine', f * 2, 0.2);
    this.finish(nodes, oscs, t, stopAt);
  }

  /** Additive bell/celesta (gong = lower, longer, more inharmonic). */
  private noteBell(t: number, midi: number, vel: number, durS: number, out: AudioNode, pan: number, gong: boolean): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    const nodes: AudioNode[] = [];
    const dest = this.route(out, pan, nodes);
    const partials = gong
      ? [[1, 1.0, 2.6], [1.51, 0.55, 1.9], [2.42, 0.3, 1.2], [3.9, 0.14, 0.7]]
      : [[1, 1.0, 1.3], [3.01, 0.25, 0.6], [4.63, 0.12, 0.35]];
    const oscs: OscillatorNode[] = [];
    let lastStop = t;
    const base = (gong ? 0.34 : 0.28) * vel;
    for (const [ratio, amp, tauScale] of partials) {
      const pf = f * ratio;
      if (pf > 9000) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = pf;
      const g = ctx.createGain();
      o.connect(g);
      g.connect(dest);
      const tau = (0.5 + durS * 0.18) * tauScale;
      const stopAt = this.env(g, t, 0.004, base * amp, 0.005, tau);
      lastStop = Math.max(lastStop, stopAt);
      nodes.push(o, g);
      oscs.push(o);
    }
    if (oscs.length === 0) return;
    for (const o of oscs) { o.start(t); o.stop(lastStop); }
    oscs[0].onended = () => { for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } } };
  }

  /** Harp/kalimba pluck — detuned triangles, fast decay, pitch-keyed lowpass. */
  private notePluck(t: number, midi: number, vel: number, durS: number, out: AudioNode, pan: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    if (f > 4200) return;
    const nodes: AudioNode[] = [];
    const dest = this.route(out, pan, nodes);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(7000, 1200 + vel * 1800 + f);
    lp.Q.value = 0.5;
    lp.connect(dest);
    const g = ctx.createGain();
    g.connect(lp);
    nodes.push(lp, g);
    const stopAt = this.env(g, t, 0.005, vel * 0.42, 0.008, 0.16 + durS * 0.12);
    const oscs: OscillatorNode[] = [];
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 0.997;
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    nodes.push(o1, o2, g2);
    oscs.push(o1, o2);
    this.finish(nodes, oscs, t, stopAt);
  }

  /** Breathy flute — sine + a little triangle, vibrato easing in. */
  private noteFlute(t: number, midi: number, vel: number, durS: number, out: AudioNode, pan: number): void {
    const ctx = this.ctx!;
    const f = midiHz(midi);
    if (f > 3600) return;
    const nodes: AudioNode[] = [];
    const dest = this.route(out, pan, nodes);
    const g = ctx.createGain();
    g.connect(dest);
    nodes.push(g);
    const hold = Math.max(0.15, durS - 0.35);
    const stopAt = this.env(g, t, 0.09, vel * 0.34, hold, 0.25);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    // Vibrato that blooms in after the attack (cents on detune).
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(7, t + 0.6);
    lfo.connect(depth);
    depth.connect(o1.detune);
    depth.connect(o2.detune);
    nodes.push(o1, o2, g2, lfo, depth);
    this.finish(nodes, [o1, o2, lfo], t, stopAt);
  }

  /** Water-drop plink — a falling sine chirp (the swamp's signature sparkle). */
  private noteDrop(t: number, midi: number, vel: number, out: AudioNode, pan: number): void {
    const ctx = this.ctx!;
    const f = Math.min(3000, midiHz(midi));
    const nodes: AudioNode[] = [];
    const dest = this.route(out, pan, nodes);
    const g = ctx.createGain();
    g.connect(dest);
    nodes.push(g);
    const stopAt = this.env(g, t, 0.003, vel * 0.4, 0.005, 0.09);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(g);
    nodes.push(o);
    this.finish(nodes, [o], t, stopAt);
  }

  /** Sustained chord pad — the piece's harmonic floor, per-theme timbre. */
  private playPadChord(time: number, chord: number[], durS: number, night: boolean): void {
    const ctx = this.ctx;
    const t = this.theme;
    if (!ctx || !t || !this.pieceBus) return;
    const kind = t.pad;
    const vel = 0.09 * t.padLevel * (night ? 0.85 : 1);
    const atk = Math.min(3.2, durS * 0.35);
    const hold = durS * 0.5;
    const tau = Math.min(4, durS * 0.4);

    // Choir voices route through the persistent formant chain; other pads get
    // a per-chord lowpass shared by every voice in the chord. Cutoffs sit low
    // — survival pads are felt more than heard.
    let dest: AudioNode = this.pieceBus;
    const chordNodes: AudioNode[] = [];
    if (kind === 'choir' && this.choirIn) {
      dest = this.choirIn;
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = kind === 'glass' ? 1400 : kind === 'dark' ? 480 : 720;
      lp.Q.value = 0.3;
      lp.connect(this.pieceBus);
      chordNodes.push(lp);
      dest = lp;
    }

    const notes: number[] = [];
    for (const semi of chord) notes.push(t.root + semi);
    if (t.root - 12 >= 33) notes.push(t.root - 12 + (((chord[0] % 12) + 12) % 12));

    const oscs: OscillatorNode[] = [];
    let lastStop = time;
    let voiceIdx = 0;
    for (const midi of notes) {
      const f = midiHz(midi);
      if (f > 2400) continue;
      const g = ctx.createGain();
      const vDest = this.route(dest, voiceIdx % 2 === 0 ? -0.2 : 0.2, chordNodes);
      g.connect(vDest);
      const stopAt = this.env(g, time, atk, vel, hold, tau);
      lastStop = Math.max(lastStop, stopAt);
      chordNodes.push(g);
      const mk = (type: OscillatorType, freq: number, gain: number) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const og = ctx.createGain();
        og.gain.value = gain;
        o.connect(og);
        og.connect(g);
        chordNodes.push(o, og);
        oscs.push(o);
      };
      switch (kind) {
        case 'warm':
          mk('sawtooth', f * 0.9971, 0.5);
          mk('sawtooth', f * 1.0029, 0.5);
          break;
        case 'glass':
          mk('sine', f, 0.8);
          mk('triangle', f, 0.32);
          if (f * 2 < 4200) mk('sine', f * 2.01, 0.12);
          break;
        case 'choir':
          mk('triangle', f * 0.9977, 0.55);
          mk('triangle', f * 1.0023, 0.55);
          break;
        case 'dark':
          mk('triangle', f, 0.7);
          mk('sawtooth', f, 0.16);
          break;
      }
      voiceIdx++;
    }
    if (oscs.length === 0) return;
    for (const o of oscs) { o.start(time); o.stop(lastStop); }
    oscs[0].onended = () => { for (const n of chordNodes) { try { n.disconnect(); } catch { /* already gone */ } } };
  }

  /** Soft sub bass on chord roots. */
  private playBass(time: number, midi: number, durS: number, level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.pieceBus) return;
    const f = midiHz(midi);
    if (f > 220) return;
    const nodes: AudioNode[] = [];
    const g = ctx.createGain();
    g.connect(this.pieceBus);
    nodes.push(g);
    const stopAt = this.env(g, time, 0.3, 0.16 * level, durS * 0.6, 1.2);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    nodes.push(o1, o2, g2);
    this.finish(nodes, [o1, o2], time, stopAt);
  }

  // ── Bed — the always-on tonal floor ──────────────────────────────────────

  private buildBed(ctx: AudioContext, t: ThemeDef): void {
    if (!this.bedBus) return;
    const cfg = t.bed;
    const bedRoot = t.root >= 45 ? t.root - 12 : t.root;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cfg.cutoff;
    lp.Q.value = 0.3;
    lp.connect(this.bedBus);
    this.bedNodes.push(lp);

    const addOsc = (type: OscillatorType, freq: number, gain: number, dest: AudioNode): OscillatorNode => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(dest);
      o.start();
      this.bedOscs.push(o);
      this.bedNodes.push(o, g);
      return o;
    };

    // Sub + drones (slow ±4-cent breathing via one shared LFO).
    if (cfg.sub > 0) addOsc('sine', midiHz(Math.max(24, bedRoot - 12)), cfg.sub * 0.5, this.bedBus);
    const droneA = addOsc('triangle', midiHz(bedRoot), cfg.drone * 0.3, lp);
    const droneB = cfg.fifth ? addOsc('sine', midiHz(bedRoot + 7), cfg.drone * 0.2, lp) : null;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 4; // cents
    lfo.connect(lfoDepth);
    lfoDepth.connect(droneA.detune);
    if (droneB) lfoDepth.connect(droneB.detune);
    lfo.start();
    this.bedOscs.push(lfo);
    this.bedNodes.push(lfo, lfoDepth);

    // Air/wind — looped noise through the theme's bandpass, slow tremolo.
    if (cfg.air > 0) {
      if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
        this.noiseBuffer = this.makeNoiseBuffer(ctx);
      }
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = cfg.airHz;
      bp.Q.value = 0.8;
      const ag = ctx.createGain();
      ag.gain.value = cfg.air * 0.16;
      src.connect(bp);
      bp.connect(ag);
      ag.connect(this.bedBus);
      // Tremolo: ±40% swell at 0.045 Hz.
      const lfo2 = ctx.createOscillator();
      lfo2.frequency.value = 0.045;
      const trem = ctx.createGain();
      trem.gain.value = cfg.air * 0.064;
      lfo2.connect(trem);
      trem.connect(ag.gain);
      lfo2.start();
      src.start();
      this.bedSources.push(src);
      this.bedOscs.push(lfo2);
      this.bedNodes.push(src, bp, ag, lfo2, trem);
    }

    // Shimmer — a distant high harmonic that rides the same tremolo phase.
    if (cfg.shimmer > 0) addOsc('sine', Math.min(4200, midiHz(bedRoot + 31)), cfg.shimmer * 0.045, this.bedBus);
  }

  private makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let lpState = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      lpState += (white - lpState) * 0.25; // gently pinked
      data[i] = lpState * 2.2;
    }
    return buf;
  }

  /** Choir formant chain — two "ah" bandpasses + a lowpassed body, shared by all choir voices. */
  private buildChoirChain(ctx: AudioContext): void {
    if (!this.pieceBus) return;
    const input = ctx.createGain();
    const outMix = ctx.createGain();
    outMix.gain.value = 0.9;
    const mkBand = (freq: number, q: number, gain: number) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      input.connect(bp);
      bp.connect(g);
      g.connect(outMix);
      this.choirNodes.push(bp, g);
    };
    mkBand(650, 1.1, 1.0);
    mkBand(1080, 1.3, 0.7);
    mkBand(2400, 2.0, 0.18);
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 420;
    const bodyG = ctx.createGain();
    bodyG.gain.value = 0.55;
    input.connect(body);
    body.connect(bodyG);
    bodyG.connect(outMix);
    outMix.connect(this.pieceBus);
    this.choirNodes.push(input, body, bodyG, outMix);
    this.choirIn = input;
  }

  // ── Reverb impulse — shaped noise: predelay, exponential decay, darkening ──

  private makeImpulse(ctx: AudioContext, seconds: number, decayPow: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const preDelay = Math.floor(rate * 0.018);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lpState = 0;
      for (let i = preDelay; i < len; i++) {
        const p = (i - preDelay) / (len - preDelay);
        const white = Math.random() * 2 - 1;
        // One-pole lowpass that closes over the tail — real rooms darken as
        // they decay; this is what makes shaped noise read as "a space".
        const alpha = 0.42 - 0.3 * p;
        lpState += (white - lpState) * alpha;
        data[i] = lpState * Math.pow(1 - p, decayPow);
      }
    }
    return buf;
  }

  // ── Teardown ─────────────────────────────────────────────────────────────

  private hardTeardown(): void {
    if (this.teardownTimer !== null) { clearTimeout(this.teardownTimer); this.teardownTimer = null; }
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
    this.running = false;
    this.piece = null;
    this.phase = 'silence';
    for (const o of this.bedOscs) { try { o.stop(); } catch { /* already stopped */ } }
    for (const s of this.bedSources) { try { s.stop(); } catch { /* already stopped */ } }
    const all: Array<AudioNode | null> = [
      ...this.bedNodes, ...this.choirNodes,
      this.bedBus, this.pieceBus, this.sparkleBus, this.pulseBus, this.colorLP,
      this.dryGain, this.sendGain, this.convolver, this.revGain, this.comp,
      this.uiGain, this.musicOut,
    ];
    for (const n of all) { if (n) { try { n.disconnect(); } catch { /* already gone */ } } }
    this.bedOscs = [];
    this.bedSources = [];
    this.bedNodes = [];
    this.choirNodes = [];
    this.choirIn = null;
    this.bedBus = this.pieceBus = this.sparkleBus = this.pulseBus = this.musicOut = null;
    this.dryGain = this.sendGain = this.revGain = this.uiGain = null;
    this.colorLP = null;
    this.convolver = null;
    this.comp = null;
    this.theme = null;
    this.life = 0;
    this.pulseLevel = 0;
  }
}

// Singleton — mirrors the soundManager pattern.
export const ambientMusic = new AmbientMusicEngine();
