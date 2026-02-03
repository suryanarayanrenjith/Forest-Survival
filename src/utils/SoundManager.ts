// Sound Manager for game audio effects
// Uses Web Audio API for performance-optimized sound playback

class SoundManager {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.3;
  private sounds: Map<string, AudioBuffer> = new Map();
  private initialized: boolean = false;
  private muted: boolean = false;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  constructor() {
    // Audio context will be initialized on first user interaction
  }

  // Initialize audio context (must be called after user interaction)
  initialize(): void {
    if (this.initialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.initialized = true;
      this.generateSounds();
    } catch (error) {
      console.warn('Web Audio API not supported', error);
    }
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

  // Play a sound effect
  play(soundName: string, volume: number = 1.0, loop: boolean = false): void {
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
    gainNode.gain.value = this.masterVolume * volume;

    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

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
