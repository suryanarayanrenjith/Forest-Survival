// Sound Manager for game audio effects
// Uses Web Audio API for performance-optimized sound playback

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

  // Generate procedural sound effects
  private generateSounds(): void {
    if (!this.audioContext) return;

    const ctx = this.audioContext;
    const sampleRate = ctx.sampleRate;

    // Gun shot sound (sharp click with decay)
    this.sounds.set('shoot', this.createShootSound(ctx, sampleRate));

    // Enemy hit sound (thud)
    this.sounds.set('hit', this.createHitSound(ctx, sampleRate));

    // Enemy death sound (explosion-like)
    this.sounds.set('enemyDeath', this.createDeathSound(ctx, sampleRate));

    // Power-up collect sound (ascending chirp)
    this.sounds.set('powerUp', this.createPowerUpSound(ctx, sampleRate));

    // Player hurt sound (descending tone)
    this.sounds.set('playerHurt', this.createHurtSound(ctx, sampleRate));

    // Reload sound (mechanical click)
    this.sounds.set('reload', this.createReloadSound(ctx, sampleRate));

    // Wave complete sound (victory fanfare)
    this.sounds.set('waveComplete', this.createWaveCompleteSound(ctx, sampleRate));

    // Ambient forest sound (subtle white noise)
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
    // Chip-cartridge reload: a layered mechanical clack + four ascending data
    // "seat" blips as the intrusion chips slam back into the deck.
    this.sounds.set('hack_reload', this.createHackReload(ctx, sampleRate));
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

  // Chip-cartridge reload — a heavy cartridge clack up front, then four short
  // ascending "data seat" blips as each intrusion chip locks back into the deck.
  // Reads as a deliberate, mechanical reload rather than a gunshot/reload click.
  private createHackReload(ctx: AudioContext, sampleRate: number): AudioBuffer {
    const duration = 0.5;
    const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
    const data = buffer.getChannelData(0);
    // Four chip-seat blips at rising pitches, spaced across the reload.
    const blips = [
      { at: 0.10, f: 520 }, { at: 0.22, f: 640 },
      { at: 0.34, f: 780 }, { at: 0.44, f: 940 },
    ];
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      // Cartridge clack at the very start: a short filtered noise thunk.
      const clackEnv = Math.exp(-t * 26);
      const clack = (Math.random() * 2 - 1) * clackEnv * 0.28;
      let blip = 0;
      for (const b of blips) {
        const dt = t - b.at;
        if (dt >= 0 && dt < 0.07) {
          const env = Math.exp(-dt * 55);
          // Bit-crushed-ish digital seat: tone + a hard click transient.
          blip += Math.sin(2 * Math.PI * b.f * dt) * env * 0.32;
          blip += (Math.random() * 2 - 1) * Math.exp(-dt * 160) * 0.12;
        }
      }
      data[i] = Math.tanh((clack + blip) * 1.2) * 0.5;
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
    // Don't play if muted
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

  // Set master volume (0.0 to 1.0)
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  // Get current volume
  getVolume(): number {
    return this.masterVolume;
  }

  // Mute all sounds
  mute(): void {
    this.muted = true;
    this.stopAll();
  }

  // Unmute sounds
  unmute(): void {
    this.muted = false;
  }

  // Check if muted
  isMuted(): boolean {
    return this.muted;
  }

  // Stop all currently playing sounds
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

// Export singleton instance
export const soundManager = new SoundManager();
