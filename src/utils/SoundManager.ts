import {
  ACOUSTICS, GUNSHOTS, createGunshot, createImpulse, createMeleeHit, createMeleeSwing,
  createRobotStep, createStep, createWhizz, createPinPull, createGrenadeThrow, createGrenadeBounce,
  createEmpBlast, createThermite, createGrenadePickup, createRobotPowerDown, createRobotCollapse,
  createBodyFall, createTinnitus, createArmClick, createDecoyPing, type Surface,
} from './SoundDesign';

/**
 * One percussive contact in a mechanical sound (a latch clicking, a bolt
 * slamming, a magazine seating). Real gun mechanisms are a stack of these:
 * a sharp contact transient, a pitched body thump from the mass behind it,
 * and an inharmonic metallic ring from the steel around it.
 */
interface MechImpact {
  at: number;         // seconds into the buffer
  level: number;      // amplitude of the pitched body thump
  tone: number;       // Hz of that thump (low = heavy steel, high = small latch)
  decay: number;      // how fast the thump fades (higher = tighter/smaller)
  click: number;      // amplitude of the sharp contact transient
  ring?: number;      // amplitude of the inharmonic metallic ring
  ringDecay?: number; // how long the metal rings on (lower = more resonant)
}

/** Tuning knobs for the parameterized mechanism synthesizer (see createMechSound). */
interface MechOpts {
  duration: number;      // buffer length in seconds
  impacts: MechImpact[]; // the contacts, in time order
  // Optional sliding-friction noise (a magazine entering a well, a charging
  // handle running its rails) — bandpassed noise under a soft swell.
  scrape?: { at: number; len: number; level: number; lowpass: number };
}

class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.3;
  private sounds: Map<string, AudioBuffer> = new Map();
  private lazy: Map<string, () => AudioBuffer> = new Map();
  private initialized: boolean = false;
  private muted: boolean = false;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  // ── Master bus ──────────────────────────────────────────────────────────
  // Every voice routes gain → masterBus → lowpass → destination. The lowpass
  // is wide-open in normal play; the low-health / slow-mo "muffle" drags its
  // cutoff down so the world goes underwater-muffled and quiet during the
  // adrenaline time-dilation, then opens back up when health recovers.
  private masterBus: GainNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private slowMoAmount: number = 0; // 0 = open/normal, 1 = fully muffled

  // Dedicated input for the ambient music engine. Feeds the master bus so the
  // slow-mo muffle applies to the score exactly like every SFX voice, while
  // staying OUTSIDE the SFX volume/mute paths (music has its own settings
  // volume + musicMute toggle, applied inside AmbientMusicSystem).
  private musicInput: GainNode | null = null;

  // ── Environment reverb ──────────────────────────────────────────────────
  // One convolution reverb fed by per-voice SENDS: guns, blasts, impacts and
  // calls ring off the map (forest diffusion, canyon echoes, dead snow, ringing
  // stone). Distant positional sounds send relatively MORE (the direct path
  // falls off faster than the room), and are darkened by air absorption.
  private reverbIn: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private impulses: Map<string, AudioBuffer> = new Map();
  private environment = 'forest';
  private listenerX = 0;
  private listenerY = 0;
  private listenerZ = 0;
  private lastVariant: Map<string, number> = new Map();

  constructor() {
    // Audio context will be initialized on first user interaction
  }

  // Initialize audio context (must be called after user interaction)
  initialize(): void {
    if (this.initialized) return;

    try {
      const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('AudioContext not supported');
      this.audioContext = new Ctor();
      // Build the master bus: bus gain → lowpass → speakers.
      this.masterBus = this.audioContext.createGain();
      this.lowpassFilter = this.audioContext.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.value = 22000; // fully open
      this.lowpassFilter.Q.value = 0.0001;
      this.masterBus.connect(this.lowpassFilter);
      this.lowpassFilter.connect(this.audioContext.destination);
      // Reverb send bus → convolver → master.
      this.reverbIn = this.audioContext.createGain();
      this.convolver = this.audioContext.createConvolver();
      const reverbOut = this.audioContext.createGain();
      reverbOut.gain.value = 0.9;
      this.reverbIn.connect(this.convolver);
      this.convolver.connect(reverbOut);
      reverbOut.connect(this.masterBus);
      this.initialized = true;
      this.generateSounds();
      this.applyEnvironment();
    } catch (error) {
      console.warn('Web Audio API not supported', error);
    }
  }

  /**
   * Mobile browsers SUSPEND the AudioContext whenever the tab/app goes to the
   * background (and iOS can start it suspended). Without this the game comes
   * back from a phone call completely silent. Cheap + idempotent — call on
   * return-to-foreground and on any user gesture.
   */
  resumeContext(): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => { /* blocked until a real gesture — retried later */ });
    }
  }

  /**
   * Drive the slow-motion / low-health audio muffle. `amount` 0→1 smoothly
   * drags the master lowpass cutoff from fully-open (~22kHz) down to a dull
   * ~600Hz and ducks the bus a touch, so combat reads as a muffled, slowed
   * "near-death" moment. Idempotent + cheap — safe to call every frame.
   */
  setSlowMo(amount: number): void {
    const a = Math.max(0, Math.min(1, amount));
    if (Math.abs(a - this.slowMoAmount) < 0.002) return;
    this.slowMoAmount = a;
    if (!this.audioContext || !this.lowpassFilter || !this.masterBus) return;
    const now = this.audioContext.currentTime;
    // Exponential map sounds far more natural than linear for filter cutoff.
    const cutoff = 22000 * Math.pow(600 / 22000, a);
    const gain = 1 - 0.32 * a;
    this.lowpassFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
    this.lowpassFilter.Q.setTargetAtTime(0.0001 + a * 1.1, now, 0.08);
    this.masterBus.gain.setTargetAtTime(gain, now, 0.08);
  }

  /**
   * Expose the shared context + a music-only gain feeding the master bus.
   * Lazily initializes the context (safe: callers run after a user gesture).
   * Returns null when Web Audio is unavailable so music degrades silently.
   */
  getMusicInput(): { ctx: AudioContext; input: AudioNode } | null {
    if (!this.initialized) this.initialize();
    if (!this.audioContext || !this.masterBus) return null;
    if (!this.musicInput) {
      this.musicInput = this.audioContext.createGain();
      this.musicInput.connect(this.masterBus);
    }
    return { ctx: this.audioContext, input: this.musicInput };
  }

  private generateSounds(): void {
    if (!this.audioContext) return;

    const ctx = this.audioContext;
    const sampleRate = ctx.sampleRate;

    this.sounds.set('shoot', this.createShootSound(ctx, sampleRate));

    this.sounds.set('hit', this.createHitSound(ctx, sampleRate));

    this.sounds.set('enemyDeath', this.createDeathSound(ctx, sampleRate));

    this.sounds.set('powerUp', this.createPowerUpSound(ctx, sampleRate));

    // ── DISTINCT REWARD CUES ─────────────────────────────────────────────
    // `powerUp` was fired from ~27 call sites as a catch-all "something good
    // happened" ping, so a perk pick, an achievement, a level-up and picking
    // up a health pack were literally the same sound. These separate the
    // events the player most needs to tell apart by ear.
    const C = (o: Parameters<typeof this.createChime>[2]) => this.createChime(ctx, sampleRate, o);
    // Perk taken — a confident rising major triad.
    this.sounds.set('cue_perk',        C({ duration: 0.62, root: 523, steps: [0, 4, 7, 12], shimmer: 0.16 }));
    // Achievement — higher, brighter, four notes with more sparkle.
    this.sounds.set('cue_achievement', C({ duration: 0.78, root: 659, steps: [0, 7, 12, 16], shimmer: 0.26 }));
    // Objective / mission complete — a two-note "done" stab.
    this.sounds.set('cue_objective',   C({ duration: 0.34, root: 587, steps: [0, 7], shimmer: 0.12 }));
    // Purchase — a short, dry, transactional double blip.
    this.sounds.set('cue_purchase',    C({ duration: 0.24, root: 784, steps: [0, 5], shimmer: 0.06 }));

    this.sounds.set('playerHurt', this.createHurtSound(ctx, sampleRate));

    this.sounds.set('reload', this.createReloadSound(ctx, sampleRate));

    this.sounds.set('waveComplete', this.createWaveCompleteSound(ctx, sampleRate));

    // NOTE: there is deliberately no 'ambient' bed here. A 2s white-noise +
    // 100Hz hum loop was generated at init and never played by anything; wiring
    // it up would have layered a constant hiss under AmbientMusicSystem's BED
    // layer, which already exists precisely so silence never reads as dead air.
    // Removed rather than "fixed" — the right sound was already playing.

    // Headshot / critical ping — bright metallic "ding" so crits feel
    // distinct from a normal body hit (was referenced but never registered).
    this.sounds.set('enemyHit', this.createHeadshotPing(ctx, sampleRate));

    // Dash whoosh — airy filtered-noise swell (Q ability; was silent).
    this.sounds.set('jump', this.createDashWhoosh(ctx, sampleRate));

    // Footstep — soft muffled thud (crouch toggle + movement steps; was silent).
    this.sounds.set('footstep', this.createFootstep(ctx, sampleRate));

    // Dry-fire click — played when the trigger is pulled on an empty mag.
    this.sounds.set('empty', this.createDryFireSound(ctx, sampleRate));

    // Weapon swap — a quick mechanical double-clack so changing weapons has
    // tactile feedback instead of being silent.
    this.sounds.set('weaponSwitch', this.createWeaponSwitchSound(ctx, sampleRate));

    // Spent brass casing hitting the ground — a tiny bright metallic "tink"
    // with a lighter skitter tap, so ejected shells rain believably onto hard
    // ground after each shot without ever reading as a second gunshot.
    this.sounds.set('casing', this.createCasingDrop(ctx, sampleRate));

    // ── Per-weapon gunshots ──────────────────────────────────────────────
    // Every weapon used to share the single generic 'shoot' buffer, so all
    // seven guns sounded identical. Each now has a distinct synthesized
    // report (transient crack + lowpassed body noise + pitch-swept punch)
    // tuned to its character. 'shoot' is kept as a safe fallback.
    // Layered stereo reports (SoundDesign.GUNSHOTS): pressure transient,
    // supersonic crack, band-limited blast with a lingering boom, the punch
    // and the weapon's own mechanism. The world's echo comes from the reverb
    // send, so the buffers stay dry.
    for (const w of Object.keys(GUNSHOTS)) {
      this.sounds.set(`shoot_${w}`, createGunshot(ctx, sampleRate, GUNSHOTS[w], 0x51a7 + w.length * 977));
    }

    // ── EXPLOSIONS ───────────────────────────────────────────────────────
    // Three weights so a barrel, a rocket and the nuke are distinguishable
    // by ear alone. All previously SILENT.
    this.sounds.set('explosion_small', this.createExplosion(ctx, sampleRate, 0.3));  // barrel
    this.sounds.set('explosion', this.createExplosion(ctx, sampleRate, 0.6));        // rocket / grenade
    this.sounds.set('explosion_huge', this.createExplosion(ctx, sampleRate, 1.0));   // nuke

    // ── BULLET IMPACTS ON THE WORLD ──────────────────────────────────────
    // Matched to the surfaces BulletDecalSystem already classifies.
    const I = (o: Parameters<typeof this.createImpact>[2]) => this.createImpact(ctx, sampleRate, o);
    // Wood: hollow thock, fast decay, splintery tail.
    this.sounds.set('impact_wood',  I({ duration: 0.16, tone: 220, decay: 55, click: 0.34, ring: 0.06, ringDecay: 90,  grit: 0.20, lowpass: 0.30 }));
    // Metal: bright ping with a long inharmonic ring.
    this.sounds.set('impact_metal', I({ duration: 0.26, tone: 880, decay: 34, click: 0.46, ring: 0.30, ringDecay: 16,  grit: 0.10, lowpass: 0.70 }));
    // Stone: hard crack, almost no ring, gritty chips.
    this.sounds.set('impact_stone', I({ duration: 0.18, tone: 420, decay: 80, click: 0.50, ring: 0.10, ringDecay: 120, grit: 0.30, lowpass: 0.55 }));
    // Dirt: dull thud, no ring at all, soft scatter.
    this.sounds.set('impact_dirt',  I({ duration: 0.14, tone: 150, decay: 70, click: 0.20, ring: 0.00, ringDecay: 200, grit: 0.34, lowpass: 0.16 }));

    // ── ENEMY VOCALIZATIONS ──────────────────────────────────────────────
    // Enemies were completely mute. These give the swarm an audible presence
    // and — with positional playback — a directional warning.
    const V = (o: Parameters<typeof this.createVocal>[2]) => this.createVocal(ctx, sampleRate, o);
    // Spotting the player: a short rising alert chirp.
    this.sounds.set('enemy_alert',  V({ duration: 0.30, f0: 210, bend:  0.75, growl: 0.55, servo: 0.16, grit: 0.10 }));
    // Winding up a melee swing — the telegraph.
    this.sounds.set('enemy_attack', V({ duration: 0.24, f0: 150, bend:  0.40, growl: 0.70, servo: 0.10, grit: 0.16 }));
    // Dying: pitch collapses as the servos lose power.
    this.sounds.set('enemy_die',    V({ duration: 0.55, f0: 240, bend: -0.72, growl: 0.60, servo: 0.20, grit: 0.22 }));
    // Boss: much lower, longer, and far more menacing.
    this.sounds.set('boss_roar',    V({ duration: 1.10, f0:  72, bend:  0.28, growl: 0.95, servo: 0.26, grit: 0.30 }));

    // ── Subverter (robot-hacking deck) ───────────────────────────────────
    // Deploy: a glitchy digital "zap + datastream" as the chip launches.
    this.sounds.set('hack_deploy', this.createHackDeploy(ctx, sampleRate));
    // Overclock death: a rising bit-crushed scream that detonates into noise.
    this.sounds.set('hack_overclock', this.createHackOverclock(ctx, sampleRate));
    // No-target error: a short dull "denied" buzz.
    this.sounds.set('hack_fail', this.createHackFail(ctx, sampleRate));
    // Chip-cartridge reload: the heavy clack of the cartridge locking into the
    // deck's rear bay. The per-chip "seat" blips are separate cues now (below)
    // so they land exactly as each chip visually slams into its slot.
    this.sounds.set('hack_reload', this.createHackReload(ctx, sampleRate));
    // One intrusion chip seating — played four times at rising pitch.
    this.sounds.set('hack_chip', this.createChipSeat(ctx, sampleRate));

    // ── RELOAD MECHANISM BEATS ───────────────────────────────────────────
    // The reload used to be one generic click for all eight weapons. The
    // viewmodel now drives a per-weapon choreography that emits timed cues
    // (see GunModel.onReloadCue), and each cue lands on one of these: real
    // mechanisms are a sequence of distinct contacts, not a single noise.
    // Weight is carried by the body tone (low = heavy steel) and the ring
    // decay (slow = big resonant receiver).
    const M = (o: MechOpts) => this.createMechSound(ctx, sampleRate, o);

    // Magazine catch button — a small, crisp, high detent click.
    this.sounds.set('reload_magrelease', M({
      duration: 0.1,
      impacts: [{ at: 0, level: 0.12, tone: 1450, decay: 210, click: 0.34, ring: 0.07, ringDecay: 190 }],
    }));
    // Magazine breaking free of the well and running down the rails.
    this.sounds.set('reload_magout', M({
      duration: 0.24,
      impacts: [{ at: 0, level: 0.15, tone: 540, decay: 95, click: 0.2, ring: 0.09, ringDecay: 140 }],
      scrape: { at: 0.005, len: 0.15, level: 0.22, lowpass: 0.3 },
    }));
    // Fresh magazine rammed home — a scrape into the well, then a solid seat
    // thunk with the catch snapping over it.
    this.sounds.set('reload_magin', M({
      duration: 0.34,
      impacts: [
        { at: 0.085, level: 0.44, tone: 148, decay: 44, click: 0.36, ring: 0.17, ringDecay: 58 },
        { at: 0.125, level: 0.1, tone: 1520, decay: 175, click: 0.17, ring: 0.05, ringDecay: 180 },
      ],
      scrape: { at: 0, len: 0.09, level: 0.2, lowpass: 0.32 },
    }));
    // A partial magazine retained rather than dumped: it clears the well and
    // goes into a pouch, so there is fabric and no ground impact — muffled,
    // soft-edged, and deliberately quieter than the dry reload's clatter.
    this.sounds.set('reload_magstow', M({
      duration: 0.26,
      impacts: [{ at: 0.11, level: 0.14, tone: 138, decay: 62, click: 0.08 }],
      scrape: { at: 0, len: 0.2, level: 0.17, lowpass: 0.12 },
    }));
    // The discarded magazine landing in the dirt — dull, low, one small bounce.
    this.sounds.set('reload_magdrop', M({
      duration: 0.32,
      impacts: [
        { at: 0, level: 0.3, tone: 112, decay: 40, click: 0.18, ring: 0.05, ringDecay: 44 },
        { at: 0.095, level: 0.13, tone: 156, decay: 55, click: 0.09 },
      ],
    }));
    // Charging handle / bolt carrier — yanked back on its rails, then released
    // to slam into battery. The second contact is much heavier than the first.
    this.sounds.set('reload_bolt', M({
      duration: 0.36,
      impacts: [
        { at: 0.1, level: 0.24, tone: 430, decay: 78, click: 0.3, ring: 0.2, ringDecay: 105 },
        { at: 0.205, level: 0.5, tone: 205, decay: 40, click: 0.44, ring: 0.3, ringDecay: 66 },
      ],
      scrape: { at: 0, len: 0.1, level: 0.26, lowpass: 0.55 },
    }));
    // Pistol slide stop thumbed off — the slide runs forward fast and light,
    // so this is bright and over almost before it starts.
    this.sounds.set('reload_slide', M({
      duration: 0.18,
      impacts: [
        { at: 0, level: 0.14, tone: 1250, decay: 200, click: 0.2, ring: 0.06, ringDecay: 200 },
        { at: 0.038, level: 0.46, tone: 350, decay: 68, click: 0.5, ring: 0.34, ringDecay: 125 },
      ],
    }));
    // Bolt-action handle worked — one precise, solid, well-machined clunk.
    // Pitched up/down at the call site for lift / pull / push / lock.
    this.sounds.set('reload_boltlift', M({
      duration: 0.2,
      impacts: [{ at: 0, level: 0.34, tone: 265, decay: 54, click: 0.28, ring: 0.23, ringDecay: 78 }],
    }));
    // One shotgun shell thumbed past the loading-gate spring.
    this.sounds.set('reload_shell', M({
      duration: 0.16,
      impacts: [{ at: 0.045, level: 0.26, tone: 235, decay: 82, click: 0.23, ring: 0.07, ringDecay: 150 }],
      scrape: { at: 0, len: 0.06, level: 0.15, lowpass: 0.22 },
    }));
    // Pump-action forend racked — the heaviest, most satisfying beat in the
    // game: back hard, then slammed forward into battery.
    this.sounds.set('reload_pump', M({
      duration: 0.42,
      impacts: [
        { at: 0, level: 0.4, tone: 182, decay: 38, click: 0.36, ring: 0.18, ringDecay: 58 },
        { at: 0.155, level: 0.56, tone: 122, decay: 27, click: 0.52, ring: 0.24, ringDecay: 45 },
      ],
      scrape: { at: 0.02, len: 0.12, level: 0.2, lowpass: 0.4 },
    }));
    // Minigun feed-cover latch and slam — a big sheet-steel bang.
    this.sounds.set('reload_cover', M({
      duration: 0.48,
      impacts: [{ at: 0, level: 0.58, tone: 96, decay: 21, click: 0.4, ring: 0.32, ringDecay: 25 }],
    }));
    // A length of belted ammunition chattering as it's dragged into the feed —
    // a dozen light, irregular brass taps.
    this.sounds.set('reload_belt', M({
      duration: 0.52,
      impacts: Array.from({ length: 13 }, (_, i) => ({
        at: i * 0.035 + Math.random() * 0.016,
        level: 0.06 + Math.random() * 0.05,
        tone: 900 + Math.random() * 900,
        decay: 150 + Math.random() * 90,
        click: 0.07 + Math.random() * 0.05,
        ring: 0.05,
        ringDecay: 190,
      })),
    }));
    // Safety pin / arming lever — a bright, thin metallic snap.
    this.sounds.set('reload_pin', M({
      duration: 0.22,
      impacts: [{ at: 0, level: 0.18, tone: 1850, decay: 150, click: 0.3, ring: 0.36, ringDecay: 21 }],
    }));
    // Rotary-cannon barrel cluster spinning up to speed.
    this.sounds.set('reload_spinup', this.createSpinUp(ctx, sampleRate));
    // A rocket sliding the length of a launch tube — long, gritty, resonant.
    this.sounds.set('reload_rocketslide', this.createRocketSlide(ctx, sampleRate));

    // ── WEATHER + FOLIAGE + WILDLIFE ─────────────────────────────────────
    // Looping beds the WeatherAudio director rides (rain hiss, wind howl),
    // thunder one-shots, the crunch of leaves a stride kicks up, the swish of
    // tall grass, and the calls of each map's unseen wildlife.
    // Built LAZILY (the beds + thunder are seconds of audio each): the
    // scene's warmup calls prepare() for the ones its map can use, so the
    // synthesis happens behind the loader, never on a menu click.
    const L = (name: string, make: () => AudioBuffer) => this.lazy.set(name, make);
    L('rain_bed', () => this.createRainBed(ctx, sampleRate));
    L('wind_bed', () => this.createWindBed(ctx, sampleRate));
    L('thunder_close', () => this.createThunder(ctx, sampleRate, true));
    L('thunder_far', () => this.createThunder(ctx, sampleRate, false));
    L('leaf_rustle', () => this.createLeafRustle(ctx, sampleRate));
    L('grass_swish', () => this.createGrassSwish(ctx, sampleRate));
    L('bird_a', () => this.createBirdCall(ctx, sampleRate, 1234567));
    L('bird_b', () => this.createBirdCall(ctx, sampleRate, 7654321));
    L('bird_c', () => this.createBirdCall(ctx, sampleRate, 2468135));
    L('cricket', () => this.createCricket(ctx, sampleRate));
    L('frog', () => this.createFrog(ctx, sampleRate));
    L('owl', () => this.createOwl(ctx, sampleRate));
    L('crow', () => this.createCrow(ctx, sampleRate));
    L('howl', () => this.createHowl(ctx, sampleRate));
    L('hawk', () => this.createHawk(ctx, sampleRate));
    L('bubble', () => this.createBubble(ctx, sampleRate));
    L('radio', () => this.createRadio(ctx, sampleRate));
    // Footsteps: four seeded variations per surface + a landing each.
    const surfaces: Surface[] = ['forest', 'leaves', 'gravel', 'sand', 'snow', 'stone', 'mud', 'wet'];
    for (const sf of surfaces) {
      for (let v = 0; v < 4; v++) L(`step_${sf}_${v}`, () => createStep(ctx, sampleRate, sf, 0x5e9 + v * 7919 + sf.length * 31));
      L(`land_${sf}`, () => createStep(ctx, sampleRate, sf, 0x1a9d + sf.length * 17, true));
    }
    for (let v = 0; v < 3; v++) {
      L(`robot_step_light_${v}`, () => createRobotStep(ctx, sampleRate, false, 0x70b0 + v * 131));
      L(`robot_step_heavy_${v}`, () => createRobotStep(ctx, sampleRate, true, 0x7e1 + v * 211));
    }
    // Grenades: pin, throw, bounces, the two special detonations, pickup.
    L('grenade_pin', () => createPinPull(ctx, sampleRate, 0x9e1));
    L('grenade_throw', () => createGrenadeThrow(ctx, sampleRate, 0x7a3));
    for (let v = 0; v < 3; v++) L(`grenade_bounce_${v}`, () => createGrenadeBounce(ctx, sampleRate, 0x4b1 + v * 173));
    L('emp_blast', () => createEmpBlast(ctx, sampleRate, 0xe39));
    L('thermite_ignite', () => createThermite(ctx, sampleRate, 0x7e3));
    L('grenade_pickup', () => createGrenadePickup(ctx, sampleRate, 0x61d));
    L('arm_click', () => createArmClick(ctx, sampleRate, 0xa7c));
    L('decoy_ping', () => createDecoyPing(ctx, sampleRate));
    // Deaths: robot power-down + chassis collapse; the player's fall + ear ring.
    for (let v = 0; v < 2; v++) {
      L(`robot_powerdown_${v}`, () => createRobotPowerDown(ctx, sampleRate, 0x3d1 + v * 311));
      L(`robot_collapse_${v}`, () => createRobotCollapse(ctx, sampleRate, 0x2c7 + v * 199));
    }
    L('body_fall', () => createBodyFall(ctx, sampleRate, 0x8f3));
    L('tinnitus', () => createTinnitus(ctx, sampleRate));
    for (let v = 0; v < 2; v++) {
      L(`melee_swing_${v}`, () => createMeleeSwing(ctx, sampleRate, 0x5317 + v * 97));
      L(`melee_hit_${v}`, () => createMeleeHit(ctx, sampleRate, 0x417 + v * 53));
      L(`whizz_${v}`, () => createWhizz(ctx, sampleRate, 0x1771 + v * 29));
    }
  }

  /** Buffer by name, synthesizing a lazily-registered one on first use. */
  private buffer(name: string): AudioBuffer | undefined {
    let b = this.sounds.get(name);
    if (!b) {
      const make = this.lazy.get(name);
      if (make) {
        b = make();
        this.sounds.set(name, b);
        this.lazy.delete(name);
      }
    }
    return b;
  }

  /** Synthesize lazily-registered buffers now (call behind a loader). */
  prepare(names: string[]): void {
    if (!this.initialized) this.initialize();
    for (const n of names) this.buffer(n);
  }

  // ── AMBIENCE + NATURE SYNTHESIS ────────────────────────────────────────
  // Everything below is synthesized at init like the rest of the bank (no
  // audio files). Loops are built one crossfade longer than their length and
  // folded, so the seam is inaudible.

  /** Build a seamless loop: `gen(i)` is sampled len+fade times, then folded. */
  private makeLoop(ctx: AudioContext, sampleRate: number, seconds: number, gen: (i: number) => number): AudioBuffer {
    const len = Math.floor(sampleRate * seconds);
    const fade = Math.floor(sampleRate * 0.25);
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i++) raw[i] = gen(i);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = raw[i];
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      data[i] = raw[i] * k + raw[len + i] * (1 - k);
    }
    return buffer;
  }

  /** Rain bed: a broadband hiss with a dense patter of droplet ticks. */
  private createRainBed(ctx: AudioContext, sampleRate: number): AudioBuffer {
    let lp = 0, hp = 0, tick = 0, tickLp = 0;
    return this.makeLoop(ctx, sampleRate, 4, () => {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * 0.32;
      hp += (lp - hp) * 0.015;
      if (Math.random() < 0.004) tick = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1);
      tick *= 0.82;
      tickLp += (tick * (Math.random() * 0.6 + 0.4) - tickLp) * 0.55;
      return (lp - hp) * 0.42 + tickLp * 0.55;
    });
  }

  /** Wind bed: brown noise — the caller's bandpass turns it into a howl. */
  private createWindBed(ctx: AudioContext, sampleRate: number): AudioBuffer {
    let b = 0;
    return this.makeLoop(ctx, sampleRate, 6, () => {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      return b * 3.2;
    });
  }

  /** Thunder: an optional close crack, then a long rolling rumble. */
  private createThunder(ctx: AudioContext, sampleRate: number, close: boolean): AudioBuffer {
    const duration = close ? 4.6 : 5.2;
    const len = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    const bumps: Array<[number, number, number]> = [];
    const nb = close ? 6 : 4;
    for (let k = 0; k < nb; k++) {
      bumps.push([0.05 + Math.random() * (close ? 2.2 : 3.0), 0.12 + Math.random() * 0.4, (1 - k / nb) * (0.6 + Math.random() * 0.4)]);
    }
    let brown = 0, l1 = 0, l2 = 0, hp = 0;
    const cut = close ? 0.09 : 0.05;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const w = Math.random() * 2 - 1;
      brown = (brown + 0.02 * w) / 1.02;
      l1 += (brown - l1) * cut;
      l2 += (l1 - l2) * cut;
      let env = Math.exp(-t / (close ? 1.5 : 2.0)) * 0.35;
      for (const [tk, wk, ak] of bumps) env += ak * Math.exp(-((t - tk) / wk) * ((t - tk) / wk));
      env *= Math.min(1, t / 0.02);
      let v = l2 * env * 9;
      if (close) {
        hp += (w - hp) * 0.25;
        v += (w - hp) * Math.exp(-t / 0.05) * 0.8 + w * Math.exp(-t / 0.22) * 0.12;
      }
      data[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) data[i] *= norm;
    return buffer;
  }

  /** Dry leaves scattering: a fast irregular crackle. */
  private createLeafRustle(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.32);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let click = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      if (Math.random() < 0.05) click = (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6);
      click *= 0.62;
      lp += (click - lp) * 0.3;
      const env = Math.min(1, t / 0.008) * Math.exp(-t / 0.1);
      data[i] = (click - lp) * env * 0.9;
    }
    return buffer;
  }

  /** Brushing through tall grass: a soft band-limited swish. */
  private createGrassSwish(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.36);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let a = 0, b = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const w = Math.random() * 2 - 1;
      a += (w - a) * 0.5;
      b += (a - b) * 0.08;
      data[i] = (a - b) * Math.pow(Math.sin(Math.PI * t), 1.6) * 0.5;
    }
    return buffer;
  }

  /** Songbird: a few swept, vibrato'd syllables. */
  private createBirdCall(ctx: AudioContext, sampleRate: number, seed: number): AudioBuffer {
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const syl = 2 + Math.floor(r() * 4);
    const parts: Array<[number, number, number, number]> = [];
    let at = 0;
    for (let k = 0; k < syl; k++) {
      const dur = 0.04 + r() * 0.08;
      parts.push([at, dur, 2400 + r() * 2600, 2200 + r() * 3200]);
      at += dur + 0.02 + r() * 0.07;
    }
    const len = Math.floor(sampleRate * (at + 0.05));
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (const [t0, dur, f0, f1] of parts) {
      let ph = 0;
      const n0 = Math.floor(t0 * sampleRate), n = Math.floor(dur * sampleRate);
      for (let i = 0; i < n && n0 + i < len; i++) {
        const u = i / n;
        const f = f0 + (f1 - f0) * u + Math.sin(u * 40) * 90;
        ph += (2 * Math.PI * f) / sampleRate;
        const env = Math.pow(Math.sin(Math.PI * u), 0.8);
        data[n0 + i] += (Math.sin(ph) + Math.sin(ph * 2) * 0.12) * env * 0.32;
      }
    }
    return buffer;
  }

  /** Cricket: three-pulse chirps of a ~4.4 kHz tone, repeated. */
  private createCricket(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 1.3);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const chirp = t % 0.42;
      const pulse = chirp % 0.045;
      const on = chirp < 0.135 && pulse < 0.026 ? Math.sin(Math.PI * pulse / 0.026) : 0;
      data[i] = Math.sin(2 * Math.PI * 4400 * t) * on * 0.18;
    }
    return buffer;
  }

  /** Frog: two throaty croaks (glottal pulse train through a formant). */
  private createFrog(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.62);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let bp1 = 0, bp2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const croak = t < 0.22 ? t / 0.22 : t > 0.3 && t < 0.56 ? (t - 0.3) / 0.26 : -1;
      if (croak < 0) { data[i] = 0; continue; }
      const f0 = 150 - croak * 30;
      const phase = (t * f0) % 1;
      const glott = phase < 0.12 ? Math.sin(Math.PI * phase / 0.12) : 0;
      // Two-pole resonator around 640 Hz.
      const w0 = 2 * Math.PI * 640 / sampleRate;
      const rr = 0.985;
      const y = glott + 2 * rr * Math.cos(w0) * bp1 - rr * rr * bp2;
      bp2 = bp1; bp1 = y;
      data[i] = y * 0.03 * Math.sin(Math.PI * croak);
    }
    return buffer;
  }

  /** Owl: a soft two-note hoot. */
  private createOwl(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 1.25);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const note = t < 0.38 ? t / 0.38 : t > 0.55 && t < 1.2 ? (t - 0.55) / 0.65 : -1;
      if (note < 0) { data[i] = 0; continue; }
      const f = t < 0.5 ? 410 - note * 25 : 385 - note * 40;
      ph += 2 * Math.PI * f / sampleRate;
      data[i] = (Math.sin(ph) + Math.sin(ph * 2) * 0.08) * Math.pow(Math.sin(Math.PI * note), 1.3) * 0.3;
    }
    return buffer;
  }

  /** Crow: a harsh, noisy caw. */
  private createCrow(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.46);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let ph = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const f = 640 - u * 160 + Math.sin(u * 60) * 30;
      ph += f / sampleRate;
      const saw = 2 * (ph % 1) - 1;
      const v = saw * 0.6 + (Math.random() * 2 - 1) * 0.35;
      lp += (v - lp) * 0.22;
      data[i] = lp * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.7) * 0.35;
    }
    return buffer;
  }

  /** Distant wolf howl: a slow rising-falling glide with breath. */
  private createHowl(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 2.6);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let ph = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const f = 330 + Math.sin(Math.PI * Math.min(1, u * 1.4)) * 290 - u * 60 + Math.sin(u * 34) * 7;
      ph += 2 * Math.PI * f / sampleRate;
      const n = Math.random() * 2 - 1;
      lp += (n - lp) * 0.05;
      const env = Math.min(1, u / 0.15) * Math.pow(1 - u, 0.6);
      data[i] = (Math.sin(ph) + Math.sin(ph * 2) * 0.2 + lp * 0.25) * env * 0.26;
    }
    return buffer;
  }

  /** Raptor cry: a piercing descending screech. */
  private createHawk(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.75);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const f = 3000 - u * 900 + Math.sin(u * 90) * 60;
      ph += 2 * Math.PI * f / sampleRate;
      const env = Math.min(1, u / 0.05) * Math.pow(1 - u, 1.4);
      data[i] = (Math.sin(ph) * 0.7 + Math.sin(ph * 2.01) * 0.2 + (Math.random() * 2 - 1) * 0.08) * env * 0.24;
    }
    return buffer;
  }

  /** Bog bubble: a quick rising "blup". */
  private createBubble(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 0.14);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      ph += 2 * Math.PI * (180 + u * u * 700) / sampleRate;
      data[i] = Math.sin(ph) * Math.sin(Math.PI * u) * 0.35;
    }
    return buffer;
  }

  /** Distant radio chatter: band-limited static and keyed tones. */
  private createRadio(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const len = Math.floor(sampleRate * 1.4);
    const buffer = ctx.createBuffer(1, len, sampleRate);
    const data = buffer.getChannelData(0);
    let a = 0, b = 0;
    const keys: Array<[number, number]> = [];
    let at = 0.15;
    while (at < 1.2) { const d = Math.random() < 0.5 ? 0.06 : 0.16; keys.push([at, d]); at += d + 0.06; }
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const w = Math.random() * 2 - 1;
      a += (w - a) * 0.45; b += (a - b) * 0.12;
      let v = (a - b) * 0.18 * (0.6 + 0.4 * Math.sin(t * 23));
      for (const [k0, d] of keys) if (t >= k0 && t < k0 + d) v += Math.sin(2 * Math.PI * 1150 * t) * 0.16;
      data[i] = v * Math.min(1, t / 0.05) * Math.min(1, (1.4 - t) / 0.1);
    }
    return buffer;
  }


  private createShootSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.15;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 20);
      data[i] = (Math.random() * 2 - 1) * decay * 0.5;
    }

    return buffer;
  }

  private createHitSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.1;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const freq = 100 - t * 80;
      const decay = Math.exp(-t * 15);
      data[i] = Math.sin(2 * Math.PI * freq * t) * decay * 0.3;
    }

    return buffer;
  }

  private createDeathSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.4;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 8);
      const noise = (Math.random() * 2 - 1) * decay * 0.4;
      const tone = Math.sin(2 * Math.PI * (200 - t * 150) * t) * decay * 0.3;
      data[i] = noise + tone;
    }

    return buffer;
  }

  private createPowerUpSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.3;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const freq = 400 + t * 400;
      const envelope = Math.sin(Math.PI * t / duration);
      data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
    }

    return buffer;
  }

  /**
   * A short arpeggiated chime — the "you gained something lasting" cue.
   *
   * `powerUp` was doing the work of about six different events (pickups, perk
   * picks, level-ups, achievements, mission completes, crate drops, boss
   * announcements), so every reward in the game sounded identical and none of
   * them meant anything specific. These give the distinct ones their own voice.
   *
   * `steps` are semitone offsets from `root`, played in sequence.
   */
  private createChime(
    ctx: AudioContext,
    sampleRate: number,
    o: { duration: number; root: number; steps: number[]; shimmer: number },
  ): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * o.duration), sampleRate);
    const data = buffer.getChannelData(0);
    const stepLen = o.duration / o.steps.length;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const idx = Math.min(o.steps.length - 1, Math.floor(t / stepLen));
      const local = t - idx * stepLen;
      const f = o.root * Math.pow(2, o.steps[idx] / 12);
      // Bell-ish: fundamental + an octave + a bright inharmonic shimmer.
      const env = Math.exp(-local * 9) * Math.min(1, local * 220);
      const tone = Math.sin(2 * Math.PI * f * local)
        + Math.sin(2 * Math.PI * f * 2 * local) * 0.32
        + Math.sin(2 * Math.PI * f * 5.4 * local) * o.shimmer;
      // Overlapping tail so the notes ring into each other instead of clicking.
      data[i] += tone * env * 0.22;
    }
    return buffer;
  }

  private createHurtSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.2;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const freq = 300 - t * 200;
      const decay = Math.exp(-t * 10);
      data[i] = Math.sin(2 * Math.PI * freq * t) * decay * 0.4;
    }

    return buffer;
  }

  private createReloadSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.3;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      if (t < 0.05 || (t > 0.15 && t < 0.2)) {
        const decay = Math.exp(-t * 30);
        data[i] = (Math.random() * 2 - 1) * decay * 0.2;
      } else {
        data[i] = 0;
      }
    }

    return buffer;
  }

  private createWaveCompleteSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.8;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    const notes = [440, 554, 659, 880]; // A4, C#5, E5, A5
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const noteIndex = Math.min(Math.floor(t * 5), notes.length - 1);
      const freq = notes[noteIndex];
      const envelope = Math.max(0, 1 - (t % 0.2) * 5);
      data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.2;
    }

    return buffer;
  }

  // Bright metallic "ding" for headshots / critical hits. A short bell made
  // of three decaying partials — instantly readable as a crit over the dull
  // body-hit thud.
  private createHeadshotPing(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.2;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 17);
      // Slight upward glint over the first instant for a "ting" attack.
      const glint = 1 + 0.12 * Math.exp(-t * 60);
      const a = Math.sin(2 * Math.PI * 1180 * glint * t);
      const b = Math.sin(2 * Math.PI * 1760 * glint * t) * 0.55;
      const c = Math.sin(2 * Math.PI * 2640 * glint * t) * 0.28;
      data[i] = (a + b + c) * decay * 0.2;
    }
    return buffer;
  }

  // Airy "whoosh" for the dash ability — filtered noise that swells in and
  // out as the cutoff sweeps, giving a sense of fast air movement.
  private createDashWhoosh(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.3;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const env = Math.sin((Math.PI * t) / duration); // swell in then out
      const raw = Math.random() * 2 - 1;
      // Cutoff opens up at the peak of the swell for a rising whoosh.
      const a = 0.03 + 0.5 * env;
      lp += (raw - lp) * a;
      data[i] = lp * env * 0.5;
    }
    return buffer;
  }

  // Soft muffled footstep — heavily lowpassed noise plus a low thud, kept
  // short and quiet so repeated steps never get fatiguing.
  private createFootstep(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.12;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 30);
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * 0.22; // muffled scuff
      const thud = Math.sin(2 * Math.PI * 72 * t) * decay * 0.4;
      data[i] = (lp * decay * 0.32 + thud) * 0.7;
    }
    return buffer;
  }

  // Dry-fire click for an empty magazine — a tiny metallic tick with no
  // body, so it reads as "nothing fired" rather than a muffled shot.
  private createDryFireSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.06;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 90);
      const click = (Math.random() * 2 - 1) * decay * 0.3;
      const tick = Math.sin(2 * Math.PI * 2200 * t) * decay * 0.15;
      data[i] = click + tick;
    }
    return buffer;
  }

  // Weapon-swap clack — two short mechanical ticks (handle pull + lock) for
  // tactile weapon-switch feedback. Heavier and lower than the dry-fire tick.
  private createWeaponSwitchSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.16;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // First tick at t=0, second at ~70ms — gives a "cha-chunk".
      const t2 = t - 0.07;
      const tick1 = (Math.random() * 2 - 1) * Math.exp(-t * 70) * 0.28;
      const body1 = Math.sin(2 * Math.PI * 320 * t) * Math.exp(-t * 45) * 0.22;
      const tick2 = t2 > 0 ? (Math.random() * 2 - 1) * Math.exp(-t2 * 55) * 0.3 : 0;
      const body2 = t2 > 0 ? Math.sin(2 * Math.PI * 180 * t2) * Math.exp(-t2 * 38) * 0.26 : 0;
      data[i] = Math.tanh((tick1 + body1 + tick2 + body2) * 1.3) * 0.6;
    }
    return buffer;
  }

  // Parameterized gunshot synthesizer shared by all per-weapon reports.
  // Layers three elements: a sharp high-frequency transient crack, a body
  // of lowpassed noise (weight), and a pitch-swept low sine punch. Soft
  // clipping glues them into a single percussive report.
  /**
   * EXPLOSION — rockets, barrels, the tactical nuke.
   *
   * These were completely SILENT: a 150-damage rocket landed with no sound at
   * all, and a chained barrel detonation only ever played the generic enemy
   * death blip. For the loudest thing in the game that was the single biggest
   * game-feel gap in the audio.
   *
   * Structure of a real blast, in order: an instantaneous crack, a wide-band
   * noise body that decays as it lowpasses (high frequencies die first, which
   * is what sells DISTANCE and SIZE), a sub-bass thump you feel more than
   * hear, and a long diffuse rumble tail.
   *
   * `scale` 0..1 grows all of it: 0.35 = a barrel, 1 = the nuke.
   */
  private createExplosion(ctx: AudioContext, sampleRate: number, scale: number): AudioBuffer {
    const duration = 0.55 + scale * 1.5;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    // Bigger blasts are darker and decay slower.
    const subFreq = 62 - scale * 26;
    const bodyDecay = 9 - scale * 6.2;
    const rumbleDecay = 3.4 - scale * 2.4;
    let lp = 0;
    let lp2 = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Initial crack — very short, very bright.
      const crack = (Math.random() * 2 - 1) * Math.exp(-t * 140) * 0.55;
      // Body: noise through a lowpass that CLOSES over time, so the blast
      // audibly darkens as it expands.
      const raw = Math.random() * 2 - 1;
      const cutoff = Math.max(0.03, 0.55 * Math.exp(-t * 6));
      lp += (raw - lp) * cutoff;
      const body = lp * Math.exp(-t * bodyDecay) * (0.85 + scale * 0.35);
      // Sub thump with a downward sweep — the chest hit.
      const sweep = subFreq * (1 + 1.4 * Math.exp(-t * 18));
      const sub = Math.sin(2 * Math.PI * sweep * t) * Math.exp(-t * (13 - scale * 8)) * (0.7 + scale * 0.5);
      // Diffuse rumble tail — heavily smoothed noise that outlives the body.
      lp2 += (raw - lp2) * 0.018;
      const rumble = lp2 * Math.exp(-t * rumbleDecay) * (0.4 + scale * 0.75);
      data[i] = Math.tanh((crack + body + sub + rumble) * 1.35) * 0.62;
    }
    return buffer;
  }

  /**
   * BULLET IMPACT on world geometry — wood, metal, stone, dirt.
   *
   * The game paints surface-tinted bullet holes on trees/rocks/walls/ground
   * (BulletDecalSystem) with ZERO audio: rounds landed on the world in total
   * silence, so only enemy hits ever made a sound and missing felt like
   * nothing happened.
   *
   * Each material is the same three-part model at different settings: a
   * contact transient, a short pitched body (the resonance of what was hit),
   * and a debris tail.
   */
  private createImpact(
    ctx: AudioContext,
    sampleRate: number,
    o: { duration: number; tone: number; decay: number; click: number; ring: number; ringDecay: number; grit: number; lowpass: number },
  ): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * o.duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 320) * o.click;
      const body = Math.sin(2 * Math.PI * o.tone * t) * Math.exp(-t * o.decay) * 0.32;
      // Inharmonic partial — what makes metal ping and stone crack.
      const ring = Math.sin(2 * Math.PI * o.tone * 2.71 * t) * Math.exp(-t * o.ringDecay) * o.ring;
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * o.lowpass;
      const grit = lp * Math.exp(-t * 26) * o.grit;
      data[i] = Math.tanh((click + body + ring + grit) * 1.3) * 0.42;
    }
    return buffer;
  }

  /**
   * ENEMY VOCALIZATION — a servo-driven mechanical vocal cord.
   *
   * Enemies were entirely mute: no aggro alert, no attack telegraph, no death
   * cry, no boss roar. In a game where they converge from every bearing, that
   * removed the main non-visual channel for "something is behind you".
   *
   * A two-formant buzz over a pitch contour, plus servo whine and gearbox
   * grit, so it reads as a machine trying to shout rather than an animal.
   */
  private createVocal(
    ctx: AudioContext,
    sampleRate: number,
    o: { duration: number; f0: number; bend: number; growl: number; servo: number; grit: number },
  ): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * o.duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const p = t / o.duration;
      // Pitch contour: `bend` > 0 rises (alert), < 0 falls (death).
      const f = o.f0 * (1 + o.bend * p);
      // Square-ish buzz via saturation = the vocal cord.
      const buzz = Math.tanh(Math.sin(2 * Math.PI * f * t) * 3.2);
      // Second formant an odd ratio up — inharmonic, so it reads metallic.
      const form = Math.sin(2 * Math.PI * f * 2.4 * t) * 0.35;
      // Servo whine — a fast high sweep layered on top.
      const servo = Math.sin(2 * Math.PI * (1500 + 900 * p) * t) * o.servo * Math.exp(-p * 2.2);
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * 0.35;
      const grit = lp * o.grit;
      // Attack/decay envelope — quick in, tapering out.
      const env = Math.min(1, p * 14) * Math.pow(1 - p, 1.4);
      data[i] = Math.tanh((buzz * o.growl + form + servo + grit) * 1.25) * env * 0.4;
    }
    return buffer;
  }

  // Subverter chip deploy — a sharp digital "zap" with a glitchy bit-crushed
  // datastream tail: a fast upward FM chirp gated by a stepped (sample-and-hold)
  // pattern so it reads as "code being injected", not a gunshot.
  private createHackDeploy(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.34;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    let hold = 0; // sample-and-hold value for the bit-crush
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 7);
      // Rising carrier with a fast modulator (FM "digital" timbre).
      const carrier = 420 + t * 1900;
      const mod = Math.sin(2 * Math.PI * 90 * t) * 220;
      const tone = Math.sin(2 * Math.PI * (carrier + mod) * t);
      // Stepped glitch — re-sample the value ~22 times so it sounds quantised.
      if ((i % Math.floor(sampleRate / 2200)) === 0) hold = Math.random() * 2 - 1;
      const glitch = hold * 0.4 * Math.exp(-t * 5);
      data[i] = Math.tanh((tone * 0.6 + glitch) * env * 1.5) * 0.5;
    }
    return buffer;
  }

  // Overclock death — a rising, increasingly distorted digital scream that
  // tips over into a noise burst as the enemy burns out. Long-ish so it lands.
  private createHackOverclock(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.6;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const p = t / duration;
      // Pitch climbs then the whole thing erupts.
      const freq = 180 + p * p * 1400;
      const scream = Math.sin(2 * Math.PI * freq * t);
      const harsh = Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.5;
      // Noise erupts in the final third (the detonation).
      const burst = p > 0.6 ? (Math.random() * 2 - 1) * (p - 0.6) * 2.5 : 0;
      const env = p < 0.85 ? 1 : Math.max(0, (1 - p) / 0.15);
      data[i] = Math.tanh((scream + harsh + burst) * 1.6) * env * 0.45;
    }
    return buffer;
  }

  // Chip-cartridge reload — the heavy composite clack of a fresh intrusion
  // cartridge locking into the deck's rear bay, with a short digital handshake
  // warble as the deck reads it. The per-chip seat blips are separate cues
  // (see 'hack_chip') so they fire in lockstep with the chips visually landing.
  private createHackReload(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.34;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Cartridge clack: a short filtered noise thunk with a body behind it.
      const clack = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.28
        + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 34) * 0.3;
      // Handshake warble — a brief two-tone data chirp as the deck reads it.
      const dt = t - 0.13;
      const shake = dt > 0 && dt < 0.14
        ? Math.sin(2 * Math.PI * (600 + Math.sin(dt * 190) * 260) * dt) * Math.exp(-dt * 22) * 0.16
        : 0;
      data[i] = Math.tanh((clack + shake) * 1.2) * 0.5;
    }
    return buffer;
  }

  // One intrusion chip locking into its slot — a tiny digital "seat" blip.
  // Played four times at rising playback rates as the bay refills.
  private createChipSeat(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.11;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 52);
      // Square-ish (saturated) tone reads "digital"; the click gives it contact.
      const tone = Math.tanh(Math.sin(2 * Math.PI * 660 * t) * 2.2) * 0.26;
      const click = (Math.random() * 2 - 1) * Math.exp(-t * 220) * 0.16;
      data[i] = Math.tanh((tone * env + click) * 1.3) * 0.5;
    }
    return buffer;
  }

  /**
   * Parameterized mechanism synthesizer — the shared voice behind every reload
   * beat (see MechOpts). Each contact layers a sharp transient (the strike), a
   * pitched exponential body (the mass behind it) and an inharmonic partial
   * stack (the surrounding steel ringing). An optional bandpassed noise swell
   * underneath sells parts sliding on rails. Soft-clipped so the layers glue
   * into one percussive event instead of stacking into mush.
   */
  private createMechSound(ctx: AudioContext, sampleRate: number, o: MechOpts): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * o.duration), sampleRate);
    const data = buffer.getChannelData(0);
    // Inharmonic ratios — spaced off the harmonic series so the ring reads as
    // struck metal rather than a musical note.
    const RATIOS = [3.07, 5.41, 7.93];
    let lp = 0, bp = 0; // one-pole states for the scrape's band-limited noise
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      let s = 0;

      for (const im of o.impacts) {
        const dt = t - im.at;
        if (dt < 0) continue;
        // Sharp contact transient — a few samples of full-band noise.
        s += (Math.random() * 2 - 1) * Math.exp(-dt * 430) * im.click;
        // Pitched body — the mass behind the contact.
        s += Math.sin(2 * Math.PI * im.tone * dt) * Math.exp(-dt * im.decay) * im.level;
        // Metallic ring — inharmonic partials off the body tone.
        if (im.ring) {
          const rd = im.ringDecay ?? 90;
          let ring = 0;
          for (let k = 0; k < RATIOS.length; k++) {
            ring += Math.sin(2 * Math.PI * im.tone * RATIOS[k] * dt) / (k + 1.6);
          }
          s += ring * Math.exp(-dt * rd) * im.ring * 0.5;
        }
      }

      // Sliding friction — noise pushed through a crude bandpass, swelling in
      // and out so it reads as a moving part rather than a hiss.
      if (o.scrape) {
        const dt = t - o.scrape.at;
        if (dt >= 0 && dt < o.scrape.len) {
          const raw = Math.random() * 2 - 1;
          lp += (raw - lp) * o.scrape.lowpass;
          bp += (lp - bp) * 0.06;          // subtract a slower pole → bandpass
          const env = Math.sin((dt / o.scrape.len) * Math.PI);
          s += (lp - bp) * env * o.scrape.level;
        }
      }

      data[i] = Math.tanh(s * 1.35) * 0.55;
    }
    return buffer;
  }

  // Rotary-cannon spin-up — the drive motor winding the barrel cluster up to
  // speed. A rising sawtooth-ish whine plus the per-barrel chop (six barrels
  // passing a fixed point) over a bed of mechanical noise.
  private createSpinUp(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.7;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0;
    let phase = 0, chopPhase = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const p = t / duration;
      // Rotation rate accelerates then levels off as the motor reaches speed.
      const rps = 2 + 26 * (1 - Math.exp(-p * 3.4));
      phase += (rps * 7) / sampleRate;       // motor whine (gear mesh)
      chopPhase += (rps * 6) / sampleRate;   // six barrels per revolution
      // Saturated saw for the whine — harmonically rich like a real motor.
      const whine = Math.tanh(((phase % 1) * 2 - 1) * 1.8) * 0.16;
      // Chop: a short pressure pulse each time a barrel passes.
      const chop = Math.exp(-((chopPhase % 1)) * 9) * 0.22;
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * 0.22;
      const bed = lp * 0.16;
      // Fade in from rest, hold at speed, then ease off as it settles.
      const env = Math.min(1, p * 6) * (p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1);
      data[i] = Math.tanh((whine + chop + bed) * env * 1.5) * 0.42;
    }
    return buffer;
  }

  // A rocket being slid the length of a launch tube: gritty bandpassed friction
  // that swells as the round travels, riding a hollow low resonance from the
  // tube itself, ending in the round bottoming out on the stop.
  private createRocketSlide(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.55;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0, bp = 0;
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const p = t / duration;
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * 0.34;
      bp += (lp - bp) * 0.05;
      // Friction swells as the round accelerates down the tube.
      const grit = (lp - bp) * (0.1 + p * 0.3);
      // Hollow tube resonance — a low pitched body that rises slightly as the
      // air column inside the tube shortens.
      const tube = Math.sin(2 * Math.PI * (95 + p * 45) * t) * 0.14 * Math.min(1, p * 3);
      data[i] = Math.tanh((grit + tube) * 1.4) * 0.45;
    }
    return buffer;
  }

  // Spent brass casing bouncing on hard ground — two contacts (a primary
  // tink + a lighter skitter ~85ms later) made of inharmonic metallic partials
  // over a sharp contact click, glued with tanh. Short, bright and quiet so a
  // stream of ejected shells reads as brass tinkling on the floor, not gunfire.
  private createCasingDrop(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.2;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    const taps = [ { at: 0.0, g: 1.0 }, { at: 0.085, g: 0.5 } ];
    // Inharmonic partials → "metal", not a pitched tone.
    const partials = [
      { f: 2300, a: 1.0 }, { f: 3170, a: 0.6 }, { f: 4690, a: 0.34 }, { f: 6300, a: 0.18 },
    ];
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      let s = 0;
      for (const tap of taps) {
        const dt = t - tap.at;
        if (dt < 0) continue;
        const env = Math.exp(-dt * 55);
        const click = (Math.random() * 2 - 1) * Math.exp(-dt * 400) * 0.25;
        let tone = 0;
        for (const p of partials) tone += Math.sin(2 * Math.PI * p.f * dt) * p.a;
        s += (tone * 0.16 + click) * env * tap.g;
      }
      data[i] = Math.tanh(s * 1.2) * 0.5;
    }
    return buffer;
  }

  // No-target "denied" — a short, dull descending buzz (intrusion failed).
  private createHackFail(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.18;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-t * 12);
      const freq = 220 - t * 120;
      // Square-ish buzz via tanh saturation.
      const buzz = Math.tanh(Math.sin(2 * Math.PI * freq * t) * 3) * 0.3;
      data[i] = buzz * decay;
    }
    return buffer;
  }

  // Play a sound effect. `rate` re-pitches playback (1 = normal); the shoot
  // path passes a small random rate so sustained auto-fire doesn't sound
  // like a perfect loop of one identical sample.
  play(soundName: string, volume: number = 1.0, loop: boolean = false, rate: number = 1.0): void {
    if (this.muted) return;

    if (!this.initialized || !this.audioContext) {
      this.initialize();
      if (!this.audioContext) return;
    }

    const buffer = this.buffer(soundName);
    if (!buffer) return;

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = buffer;
    source.loop = loop;
    if (rate !== 1.0) source.playbackRate.value = rate;
    gainNode.gain.value = this.masterVolume * volume;

    source.connect(gainNode);
    // Route through the master bus (lowpass-muffle chain) when available so the
    // slow-mo effect can muffle every voice; fall back to direct out otherwise.
    gainNode.connect(this.masterBus ?? this.audioContext.destination);
    this.attachSend(gainNode, soundName);

    // Track active sources for cleanup
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    source.start(0);
  }

  // ── POSITIONAL AUDIO ───────────────────────────────────────────────────
  //
  // Retrofitted at the Web Audio level rather than via THREE.AudioListener /
  // THREE.PositionalAudio: those want THREE.Audio objects parented into the
  // scene graph and an AudioLoader, whereas this class owns raw AudioBuffers
  // and its own node graph — and has zero three.js imports, which is worth
  // keeping. Coordinates are passed as plain numbers for the same reason.
  //
  // Graph: source → gain → panner → masterBus → lowpass → destination.
  // Routing through masterBus is REQUIRED so the slow-mo muffle, master volume
  // and stopAll() all keep working on positional voices.
  //
  // `play()` is deliberately left untouched — hundreds of existing call sites
  // keep their current 2D behaviour, and several SHOULD stay 2D (your own
  // weapon, your own reload, UI). Migrate deliberately, not wholesale.

  /** Distance at which a positional sound plays at full volume. */
  private static readonly REF_DISTANCE = 8;
  /** Beyond this, attenuation stops getting quieter. */
  private static readonly MAX_DISTANCE = 120;

  /**
   * Point the Web Audio listener at the camera. Cheap — call once per frame.
   * Vectors are (position, forward, up); forward/up must be orthonormal.
   */
  setListener(
    px: number, py: number, pz: number,
    fx: number, fy: number, fz: number,
    ux: number, uy: number, uz: number,
  ): void {
    this.listenerX = px; this.listenerY = py; this.listenerZ = pz;
    const ctx = this.audioContext;
    if (!ctx) return;
    const l = ctx.listener;
    // Modern browsers expose AudioParams; Safari still only has the deprecated
    // setPosition/setOrientation pair.
    if (l.positionX) {
      l.positionX.value = px; l.positionY.value = py; l.positionZ.value = pz;
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz;
    } else {
      const legacy = l as unknown as {
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      };
      legacy.setPosition?.(px, py, pz);
      legacy.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  }

  /** Build a configured panner at a world position, or null if unavailable. */
  private makePanner(x: number, y: number, z: number, refDistance?: number, maxDistance?: number): PannerNode | null {
    const ctx = this.audioContext;
    if (!ctx || typeof ctx.createPanner !== 'function') return null;
    const p = ctx.createPanner();
    // 'equalpower' over 'HRTF': HRTF costs roughly an order of magnitude more
    // CPU, and this game routinely has dozens of concurrent voices in a fight.
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance ?? SoundManager.REF_DISTANCE;
    p.maxDistance = maxDistance ?? SoundManager.MAX_DISTANCE;
    p.rolloffFactor = 1;
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else {
      (p as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(x, y, z);
    }
    return p;
  }

  /**
   * Positional one-shot. Same semantics as play(), plus a world position.
   * Falls back to a flat 2D play() wherever PannerNode isn't available, so
   * behaviour degrades to today's mix instead of going silent.
   */
  playAt(
    soundName: string,
    x: number, y: number, z: number,
    volume: number = 1.0,
    rate: number = 1.0,
    opts?: { refDistance?: number; maxDistance?: number },
  ): void {
    if (this.muted) return;
    if (!this.initialized || !this.audioContext) {
      this.initialize();
      if (!this.audioContext) return;
    }
    const buffer = this.buffer(soundName);
    if (!buffer) return;

    const panner = this.makePanner(x, y, z, opts?.refDistance, opts?.maxDistance);
    if (!panner) { this.play(soundName, volume, false, rate); return; }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    source.buffer = buffer;
    if (rate !== 1.0) source.playbackRate.value = rate;
    gainNode.gain.value = this.masterVolume * volume;

    source.connect(gainNode);
    // Air absorption: far sources lose their highs (a distant shot is a
    // thud, not a crack). Near sounds skip the extra node.
    const dx = x - this.listenerX, dy = y - this.listenerY, dz = z - this.listenerZ;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let air: BiquadFilterNode | null = null;
    if (dist > 12) {
      air = this.audioContext.createBiquadFilter();
      air.type = 'lowpass';
      air.frequency.value = Math.max(1100, 20000 * Math.exp(-dist / 85));
      air.Q.value = 0.5;
      gainNode.connect(air);
      air.connect(panner);
    } else {
      gainNode.connect(panner);
    }
    panner.connect(this.masterBus ?? this.audioContext.destination);
    // Distant sources are relatively more reverberant.
    this.attachSend(gainNode, soundName, 0.55 + 0.45 * Math.min(1, dist / 60));

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      // Explicit disconnect so the panner can't linger in the graph.
      try { panner.disconnect(); air?.disconnect(); } catch { /* already torn down */ }
    };
    source.start(0);
  }

  /**
   * Start a looping bed (rain, wind…) with an optional filter in its chain.
   * The handle's level is RELATIVE (× the master SFX volume at each call), so
   * the caller re-applies it as it rides the weather. Mute / stopAll() kill
   * the voice — `alive` then reads false and the caller simply starts anew.
   */
  startLoop(
    soundName: string, volume = 1,
    opts?: { filter?: BiquadFilterType; freq?: number; q?: number; rate?: number },
  ): LoopVoice | null {
    if (this.muted) return null;
    if (!this.initialized || !this.audioContext) {
      this.initialize();
      if (!this.audioContext) return null;
    }
    const ctx = this.audioContext;
    const buffer = this.buffer(soundName);
    if (!buffer) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    if (opts?.rate) source.playbackRate.value = opts.rate;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let filter: BiquadFilterNode | null = null;
    if (opts?.filter) {
      filter = ctx.createBiquadFilter();
      filter.type = opts.filter;
      filter.frequency.value = opts.freq ?? 800;
      filter.Q.value = opts.q ?? 1;
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this.masterBus ?? ctx.destination);
    let alive = true;
    this.activeSources.add(source);
    source.onended = () => {
      alive = false;
      this.activeSources.delete(source);
      try { gain.disconnect(); filter?.disconnect(); } catch { /* torn down */ }
    };
    // Start at a random point so two beds never phase-lock.
    source.start(0, Math.random() * buffer.duration);
    const voice: LoopVoice = {
      get alive() { return alive; },
      setVolume: (v: number, smoothing = 0.25) => {
        if (!alive) return;
        gain.gain.setTargetAtTime(Math.max(0, v) * (this.muted ? 0 : this.masterVolume), ctx.currentTime, smoothing);
      },
      setFilter: (freq: number, q?: number) => {
        if (!alive || !filter) return;
        filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.15);
        if (q !== undefined) filter.Q.setTargetAtTime(q, ctx.currentTime, 0.15);
      },
      setRate: (r: number) => {
        if (alive) source.playbackRate.setTargetAtTime(r, ctx.currentTime, 0.2);
      },
      stop: (fade = 0.6) => {
        if (!alive) return;
        gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
        try { source.stop(ctx.currentTime + fade); } catch { /* already stopped */ }
      },
    };
    voice.setVolume(volume);
    return voice;
  }

  /** Select the reverb acoustics (SoundDesign.ACOUSTICS key, e.g. 'desert'). */
  setEnvironment(name: string): void {
    if (!ACOUSTICS[name]) name = 'forest';
    if (name === this.environment && this.convolver?.buffer) return;
    this.environment = name;
    this.applyEnvironment();
  }

  private applyEnvironment(): void {
    if (!this.audioContext || !this.convolver) return;
    let ir = this.impulses.get(this.environment);
    if (!ir) {
      ir = createImpulse(this.audioContext, this.audioContext.sampleRate, ACOUSTICS[this.environment], 0x2e7 + this.environment.length * 101);
      this.impulses.set(this.environment, ir);
    }
    this.convolver.buffer = ir;
  }

  /** How much of a voice feeds the environment reverb, by sound family. */
  private reverbSendFor(name: string): number {
    if (name.startsWith('shoot')) return 0.42;
    if (name.startsWith('explosion')) return 0.6;
    if (name.startsWith('impact_')) return 0.24;
    if (name.startsWith('thunder')) return 0.22;
    if (name.startsWith('enemy_') || name.startsWith('boss_')) return 0.26;
    if (name.startsWith('robot_step')) return 0.16;
    if (name.startsWith('step_') || name.startsWith('land_')) return 0.06;
    if (name.startsWith('melee_')) return 0.18;
    if (name === 'hit' || name === 'enemyHit' || name === 'enemyDeath') return 0.16;
    if (name.startsWith('reload_') || name === 'casing') return 0.06;
    if (name.startsWith('bird') || name === 'owl' || name === 'crow' || name === 'howl'
      || name === 'hawk' || name === 'cricket' || name === 'frog' || name === 'radio') return 0.3;
    if (name.startsWith('whizz')) return 0.12;
    if (name === 'emp_blast' || name === 'thermite_ignite') return 0.5;
    if (name.startsWith('grenade_bounce')) return 0.14;
    if (name === 'decoy_ping') return 0.3;
    if (name.startsWith('robot_collapse')) return 0.3;
    if (name.startsWith('robot_powerdown')) return 0.2;
    if (name === 'body_fall') return 0.12;
    return 0;
  }

  private attachSend(from: AudioNode, name: string, scale = 1): void {
    const send = this.reverbSendFor(name) * scale;
    if (send <= 0 || !this.reverbIn || !this.audioContext) return;
    const g = this.audioContext.createGain();
    g.gain.value = send;
    from.connect(g);
    g.connect(this.reverbIn);
  }

  /** Pick one of `count` numbered variants of `prefix`, never the same twice running. */
  private variant(prefix: string, count: number): string {
    const last = this.lastVariant.get(prefix) ?? -1;
    let v = Math.floor(Math.random() * count);
    if (v === last) v = (v + 1) % count;
    this.lastVariant.set(prefix, v);
    return `${prefix}_${v}`;
  }

  /** A footstep on `surface` (2D — it's the listener's own feet). */
  playFootstep(surface: Surface, volume: number, rate = 1): void {
    this.play(this.variant(`step_${surface}`, 4), volume, false, rate * (0.94 + Math.random() * 0.12));
  }

  /** Landing from a jump / drop on `surface`. */
  playLanding(surface: Surface, volume: number): void {
    this.play(`land_${surface}`, volume, false, 0.92 + Math.random() * 0.12);
  }

  /** A robot's steel foot planting at a world position. */
  playRobotStep(x: number, y: number, z: number, heavy: boolean, volume: number, rate = 1): void {
    this.playAt(this.variant(heavy ? 'robot_step_heavy' : 'robot_step_light', 3), x, y, z, volume,
      rate * (0.93 + Math.random() * 0.14), { refDistance: heavy ? 10 : 6, maxDistance: 90 });
  }

  /** Melee: the swing, and the steel crunch when it connects. */
  playMeleeSwing(volume = 0.6): void {
    this.play(this.variant('melee_swing', 2), volume, false, 0.95 + Math.random() * 0.1);
  }

  playMeleeHit(volume = 0.85): void {
    this.play(this.variant('melee_hit', 2), volume, false, 0.92 + Math.random() * 0.14);
  }

  /** Pick a numbered variant (never the same twice running) — public for callers. */
  pickVariant(prefix: string, count: number): string {
    return this.variant(prefix, count);
  }

  /** An energy bolt tearing past the listener at (x, y, z). */
  playWhizz(x: number, y: number, z: number, volume = 0.7): void {
    this.playAt(this.variant('whizz', 2), x, y, z, volume, 0.9 + Math.random() * 0.25, { refDistance: 3, maxDistance: 30 });
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  mute(): void {
    this.muted = true;
    this.stopAll();
  }

  unmute(): void {
    this.muted = false;
  }

  stopAll(): void {
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch {
        // Source may have already stopped
      }
    });
    this.activeSources.clear();
  }

  // Reset sound manager (useful when returning to menu)
  reset(): void {
    this.stopAll();
    this.muted = false;
  }
}

/** Handle to a looping ambience bed (see SoundManager.startLoop). */
export interface LoopVoice {
  readonly alive: boolean;
  setVolume(v: number, smoothing?: number): void;
  setFilter(freq: number, q?: number): void;
  setRate(r: number): void;
  stop(fade?: number): void;
}

/** Handle to a looping positional voice. The creator must call stop(). */
export interface PositionalVoice {
  setPosition(x: number, y: number, z: number): void;
  setVolume(v: number): void;
  stop(): void;
}

export const soundManager = new SoundManager();
