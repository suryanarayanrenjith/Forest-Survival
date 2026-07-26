/** Tuning knobs for the parameterized per-weapon gunshot synthesizer. */
interface WeaponShotOpts {
  duration: number;    // buffer length in seconds
  punchFreq: number;   // base frequency of the low sine "thump"
  punchDecay: number;  // how fast the punch fades
  sweep: number;       // downward pitch-sweep amount on the punch
  bodyLevel: number;   // amplitude of the sine punch
  noiseLevel: number;  // amplitude of the lowpassed body noise
  noiseDecay: number;  // how fast the body noise fades
  crackLevel: number;  // amplitude of the sharp transient crack
  crackDecay: number;  // how fast the crack fades (higher = snappier)
  lowpass: number;     // body-noise lowpass coefficient (0..1, higher = brighter)
}

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
      this.initialized = true;
      this.generateSounds();
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

    this.sounds.set('playerHurt', this.createHurtSound(ctx, sampleRate));

    this.sounds.set('reload', this.createReloadSound(ctx, sampleRate));

    this.sounds.set('waveComplete', this.createWaveCompleteSound(ctx, sampleRate));

    this.sounds.set('ambient', this.createAmbientSound(ctx, sampleRate));

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
    const W = (o: WeaponShotOpts) => this.createWeaponShot(ctx, sampleRate, o);
    this.sounds.set('shoot_pistol',   W({ duration: 0.16, punchFreq: 150, punchDecay: 26, sweep: 1.8, bodyLevel: 0.50, noiseLevel: 0.50, noiseDecay: 26, crackLevel: 0.60, crackDecay: 160, lowpass: 0.60 }));
    this.sounds.set('shoot_rifle',    W({ duration: 0.18, punchFreq: 120, punchDecay: 22, sweep: 1.6, bodyLevel: 0.55, noiseLevel: 0.55, noiseDecay: 22, crackLevel: 0.72, crackDecay: 150, lowpass: 0.55 }));
    this.sounds.set('shoot_shotgun',  W({ duration: 0.34, punchFreq: 80,  punchDecay: 11, sweep: 1.2, bodyLevel: 0.72, noiseLevel: 0.72, noiseDecay: 11, crackLevel: 0.55, crackDecay: 90,  lowpass: 0.32 }));
    this.sounds.set('shoot_smg',      W({ duration: 0.12, punchFreq: 165, punchDecay: 30, sweep: 2.0, bodyLevel: 0.42, noiseLevel: 0.50, noiseDecay: 30, crackLevel: 0.60, crackDecay: 180, lowpass: 0.66 }));
    this.sounds.set('shoot_sniper',   W({ duration: 0.40, punchFreq: 70,  punchDecay: 9,  sweep: 1.0, bodyLevel: 0.78, noiseLevel: 0.60, noiseDecay: 13, crackLevel: 0.92, crackDecay: 120, lowpass: 0.40 }));
    this.sounds.set('shoot_minigun',  W({ duration: 0.10, punchFreq: 135, punchDecay: 30, sweep: 1.6, bodyLevel: 0.45, noiseLevel: 0.55, noiseDecay: 32, crackLevel: 0.60, crackDecay: 170, lowpass: 0.60 }));
    this.sounds.set('shoot_launcher', W({ duration: 0.45, punchFreq: 55,  punchDecay: 8,  sweep: 0.8, bodyLevel: 0.82, noiseLevel: 0.60, noiseDecay: 9,  crackLevel: 0.45, crackDecay: 70,  lowpass: 0.28 }));

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

  private createAmbientSound(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 2.0;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() * 2 - 1) * 0.05;
      const lowFreq = Math.sin(2 * Math.PI * 100 * t) * 0.02;
      data[i] = noise + lowFreq;
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
  private createWeaponShot(ctx: AudioContext, sampleRate: number, o: WeaponShotOpts): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * o.duration), sampleRate);
    const data = buffer.getChannelData(0);
    let lp = 0; // one-pole lowpass state for the body noise
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Sharp transient (the "crack") — dominant in the first few ms.
      const crack = (Math.random() * 2 - 1) * Math.exp(-t * o.crackDecay) * o.crackLevel;
      // Body noise, lowpassed so heavier guns read "boomy", lighter ones "tight".
      const raw = Math.random() * 2 - 1;
      lp += (raw - lp) * o.lowpass;
      const body = lp * Math.exp(-t * o.noiseDecay) * o.noiseLevel;
      // Low sine punch with a downward pitch sweep for the "thump".
      const sweepFreq = o.punchFreq * (1 + o.sweep * Math.exp(-t * 35));
      const punch = Math.sin(2 * Math.PI * sweepFreq * t) * Math.exp(-t * o.punchDecay) * o.bodyLevel;
      data[i] = Math.tanh((crack + body + punch) * 1.4) * 0.6;
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

    const buffer = this.sounds.get(soundName);
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

    // Track active sources for cleanup
    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
    };

    source.start(0);
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.masterVolume;
  }

  mute(): void {
    this.muted = true;
    this.stopAll();
  }

  unmute(): void {
    this.muted = false;
  }

  isMuted(): boolean {
    return this.muted;
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

export const soundManager = new SoundManager();
