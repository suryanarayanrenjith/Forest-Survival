import { soundManager, type LoopVoice } from './SoundManager';
import type { MapType } from './MapSystem';
import type { StormKind, StrikeEvent } from './WeatherSystem';

/**
 * AMBIENCE AUDIO — the world you can hear.
 *
 *   • WEATHER BEDS — a rain hiss that swells with the downpour, and a wind bed
 *     whose band-pass sweeps up into a howl as gusts build (sandstorm and
 *     blizzard ride it hard; every map gets a breeze under an overcast sky).
 *   • THUNDER — each strike's crack/rumble arrives after a distance delay,
 *     positioned where the bolt landed.
 *   • WILDLIFE — each map's unseen inhabitants call from around the player:
 *     songbirds by day and an owl + crickets by night in the forest, frogs and
 *     bubbling mud in the swamp, crows over the outpost (with distant radio
 *     chatter), a hawk over the canyon, wolves on the tundra. They fall quiet
 *     in heavy weather and while a fight is raging.
 *   • FOLIAGE — the crunch of leaves a stride kicks up and the swish of tall
 *     grass, rate-limited so a sprint reads as a texture, not a machine gun.
 *
 * All sounds are synthesized by SoundManager; this class only directs them.
 */

interface CallSpec {
  sounds: string[];
  /** Calls per minute by day / by night. */
  day: number;
  night: number;
  vol: number;
  dist: [number, number];
  rate: [number, number];
}

const CALLS: Partial<Record<MapType, CallSpec[]>> = {
  deep_forest: [
    { sounds: ['bird_a', 'bird_b', 'bird_c'], day: 14, night: 0, vol: 0.32, dist: [14, 46], rate: [0.9, 1.15] },
    { sounds: ['owl'], day: 0, night: 3, vol: 0.4, dist: [30, 70], rate: [0.95, 1.05] },
    { sounds: ['cricket'], day: 1, night: 12, vol: 0.18, dist: [8, 26], rate: [0.95, 1.08] },
  ],
  ancient_ruins: [
    { sounds: ['bird_b', 'bird_c'], day: 8, night: 0, vol: 0.28, dist: [16, 50], rate: [0.85, 1.1] },
    { sounds: ['crow'], day: 3, night: 0.5, vol: 0.3, dist: [30, 70], rate: [0.9, 1.1] },
    { sounds: ['cricket'], day: 0, night: 10, vol: 0.16, dist: [8, 26], rate: [0.9, 1.05] },
  ],
  toxic_swamp: [
    { sounds: ['frog'], day: 8, night: 16, vol: 0.34, dist: [10, 38], rate: [0.8, 1.2] },
    { sounds: ['bubble'], day: 10, night: 10, vol: 0.22, dist: [6, 22], rate: [0.7, 1.4] },
    { sounds: ['crow'], day: 2, night: 0, vol: 0.24, dist: [30, 70], rate: [0.75, 0.9] },
  ],
  military_outpost: [
    { sounds: ['crow'], day: 4, night: 1, vol: 0.28, dist: [26, 60], rate: [0.9, 1.1] },
    { sounds: ['radio'], day: 2.5, night: 3, vol: 0.2, dist: [18, 40], rate: [0.95, 1.05] },
    { sounds: ['cricket'], day: 0, night: 6, vol: 0.14, dist: [8, 24], rate: [0.9, 1.05] },
  ],
  desert_canyon: [
    { sounds: ['hawk'], day: 2.5, night: 0, vol: 0.3, dist: [40, 90], rate: [0.9, 1.1] },
    { sounds: ['cricket'], day: 0, night: 5, vol: 0.12, dist: [10, 30], rate: [1.1, 1.25] },
  ],
  frozen_tundra: [
    { sounds: ['howl'], day: 0.6, night: 2.2, vol: 0.3, dist: [50, 110], rate: [0.92, 1.08] },
    { sounds: ['hawk'], day: 1, night: 0, vol: 0.2, dist: [50, 100], rate: [0.85, 0.95] },
  ],
  scorched_wasteland: [
    { sounds: ['crow'], day: 2, night: 0.5, vol: 0.26, dist: [30, 80], rate: [0.7, 0.85] },
  ],
  autumn_grove: [
    { sounds: ['owl'], day: 2, night: 4, vol: 0.34, dist: [30, 70], rate: [0.8, 0.92] },
    { sounds: ['cricket'], day: 4, night: 10, vol: 0.15, dist: [8, 26], rate: [0.85, 0.95] },
  ],
};

const SPEED_OF_SOUND = 343 / 0.36; // world units per second (1 u ≈ 0.36 m)

export class AmbienceAudio {
  private readonly calls: CallSpec[];
  private readonly timers: number[];
  private readonly storm: StormKind;
  private rain: LoopVoice | null = null;
  private wind: LoopVoice | null = null;
  private rainLevel = 0;
  private windLevel = 0;
  private windPhase = 0;
  private lastLeaf = 0;
  private lastGrass = 0;
  private time = 0;
  private pending: number[] = [];
  private disposed = false;

  constructor(map: MapType, storm: StormKind) {
    this.calls = CALLS[map] ?? [];
    this.timers = this.calls.map(() => 2 + Math.random() * 8);
    this.storm = storm;
  }

  /** Synthesize every buffer this map can use (behind the loader). */
  prepare(): void {
    const names = new Set<string>(['wind_bed', 'leaf_rustle', 'grass_swish']);
    if (this.storm === 'rain') { names.add('rain_bed'); names.add('thunder_close'); names.add('thunder_far'); }
    if (this.storm === 'ashfall') { names.add('thunder_close'); names.add('thunder_far'); }
    for (const c of this.calls) for (const s of c.sounds) names.add(s);
    soundManager.prepare([...names]);
  }

  /**
   * `rain` 0..1 live precipitation; `wind` 0..1 gale; `combat` 0..1 fight
   * pressure (wildlife hushes); `night` true after dusk.
   */
  update(
    dt: number, camX: number, camY: number, camZ: number,
    rain: number, wind: number, night: boolean, combat: number,
  ): void {
    if (this.disposed) return;
    this.time += dt;

    // ── Rain bed ──
    const rainTarget = this.storm === 'rain' ? rain : 0;
    this.rainLevel += (rainTarget - this.rainLevel) * Math.min(1, dt * 0.8);
    if (this.rainLevel > 0.02) {
      if (!this.rain || !this.rain.alive) this.rain = soundManager.startLoop('rain_bed', 0, { filter: 'lowpass', freq: 5200, q: 0.5 });
      this.rain?.setVolume(this.rainLevel * 0.55);
      this.rain?.setFilter(2600 + this.rainLevel * 4200);
    } else if (this.rain) {
      this.rain.stop(1.2);
      this.rain = null;
    }

    // ── Wind bed ──
    const stormWind = this.storm === 'sandstorm' || this.storm === 'blizzard' ? rain : 0;
    const windTarget = Math.max(wind * 0.55, stormWind);
    this.windLevel += (windTarget - this.windLevel) * Math.min(1, dt * 0.6);
    if (this.windLevel > 0.06) {
      if (!this.wind || !this.wind.alive) this.wind = soundManager.startLoop('wind_bed', 0, { filter: 'bandpass', freq: 420, q: 1.4 });
      this.windPhase += dt * (0.35 + this.windLevel * 0.5);
      const gust = 0.5 + 0.5 * Math.sin(this.windPhase) * Math.sin(this.windPhase * 0.37 + 1.3);
      this.wind?.setVolume((this.windLevel - 0.06) * (0.6 + gust * 0.6) * 0.8, 0.4);
      this.wind?.setFilter(260 + this.windLevel * 420 + gust * 380, 1.2 + gust * 2.2);
    } else if (this.wind) {
      this.wind.stop(1.5);
      this.wind = null;
    }

    // ── Wildlife ──
    const hush = (1 - Math.min(1, rain) * 0.85) * (1 - combat * 0.65);
    for (let i = 0; i < this.calls.length; i++) {
      const c = this.calls[i];
      const perMin = night ? c.night : c.day;
      if (perMin <= 0) continue;
      this.timers[i] -= dt;
      if (this.timers[i] > 0) continue;
      // Poisson-ish spacing around the mean interval.
      this.timers[i] = (60 / perMin) * (0.4 + Math.random() * 1.2);
      if (hush < 0.2 || Math.random() > hush) continue;
      const a = Math.random() * Math.PI * 2;
      const d = c.dist[0] + Math.random() * (c.dist[1] - c.dist[0]);
      const name = c.sounds[Math.floor(Math.random() * c.sounds.length)];
      const rate = c.rate[0] + Math.random() * (c.rate[1] - c.rate[0]);
      soundManager.playAt(
        name, camX + Math.cos(a) * d, camY + 2 + Math.random() * 6, camZ + Math.sin(a) * d,
        c.vol * hush, rate, { refDistance: 18, maxDistance: 220 },
      );
    }
  }

  /** Thunder for a strike: crack/rumble after the sound's travel time. */
  thunder(e: StrikeEvent): void {
    if (this.disposed) return;
    const close = e.bolt && e.distance < 220;
    const delayMs = Math.min(4500, (e.distance / SPEED_OF_SOUND) * 1000 * 3 + 150);
    const vol = Math.min(1, (close ? 1.1 : 0.75) * (160 / Math.max(80, e.distance)));
    const id = window.setTimeout(() => {
      this.pending = this.pending.filter((p) => p !== id);
      if (this.disposed) return;
      soundManager.playAt(close ? 'thunder_close' : 'thunder_far', e.x, e.y + 20, e.z, vol,
        0.88 + Math.random() * 0.2, { refDistance: 140, maxDistance: 4000 });
    }, delayMs);
    this.pending.push(id);
  }

  /** Leaves kicked up at (x, y, z) — `amount` ≈ how many went up. */
  leafKick(x: number, y: number, z: number, amount: number): void {
    if (amount <= 0 || this.time - this.lastLeaf < 0.16) return;
    this.lastLeaf = this.time;
    soundManager.playAt('leaf_rustle', x, y, z, Math.min(0.55, 0.16 + amount * 0.06),
      0.85 + Math.random() * 0.35, { refDistance: 6, maxDistance: 60 });
  }

  /** Brushing through grass while moving at `speed` (u/s). */
  grassStep(speed: number): void {
    if (speed < 4 || this.time - this.lastGrass < Math.max(0.22, 6 / speed)) return;
    this.lastGrass = this.time;
    soundManager.play('grass_swish', Math.min(0.22, 0.05 + speed * 0.005), false, 0.85 + Math.random() * 0.3);
  }

  dispose(): void {
    this.disposed = true;
    this.rain?.stop(0.3);
    this.wind?.stop(0.3);
    this.rain = null;
    this.wind = null;
    for (const id of this.pending) window.clearTimeout(id);
    this.pending = [];
  }
}
