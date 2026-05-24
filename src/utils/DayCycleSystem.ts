import * as THREE from 'three';

export type TimeOfDay = 'day' | 'night' | 'dawn' | 'dusk' | 'twilight' | 'auto';

export interface AtmosphericSettings {
  skyColor: number;
  fogColor: number;
  fogDensity: number;
  ambientColor: number;
  ambientIntensity: number;
  lightColor: number;
  lightIntensity: number;
  lightPosition: { x: number; y: number; z: number };
  sunVisible: boolean;
  moonVisible: boolean;
  starIntensity: number;
  cloudOpacity: number;
  bloomStrength: number;
  colorTint: THREE.Vector3;
  temperature: number; // Color temperature for grading
  saturation: number;
  contrast: number;
  /** Master linear exposure (1.0 = neutral). Drives the post-FX EV adapter. */
  exposure: number;
}

export class DayCycleSystem {
  private currentTime: number = 0; // 0-24 hours
  private cycleSpeed: number = 1.0; // Time multiplier
  private autoCycleEnabled: boolean = false;
  private currentSettings: AtmosphericSettings;

  // Predefined settings for each time period.
  //
  // Numbers are tuned for AGX tonemapping with a master exposure pass.
  // AGX behaves like a real film stock — it needs ENOUGH light in the
  // scene to expose properly, while gently rolling off true HDR
  // highlights instead of blowing them out. Lights are intentionally
  // pushed past the "physically correct" range here because the AGX
  // curve compresses them; under-lighting reads as a dark, muddy frame.
  private readonly timeSettings: Record<string, AtmosphericSettings> = {
    night: {
      // Neon-noir twist: cobalt sky with magenta moon halo, channels the
      // Returnal / Control after-dark palette. Moonlight is warmer and
      // ambient is generous so the forest reads with detail, not as a
      // black silhouette. Saturation pumped HIGH so the cool palette
      // and any emissive powerups/bullets really pop against the dark
      // plate.
      skyColor: 0x0a1235,
      fogColor: 0x1c2a55,
      fogDensity: 0.0036,
      ambientColor: 0x97b0ee,
      ambientIntensity: 1.55,
      lightColor: 0xc8dcff,
      lightIntensity: 2.8,
      lightPosition: { x: -60, y: 70, z: -120 },
      sunVisible: false,
      moonVisible: true,
      starIntensity: 1.0,
      cloudOpacity: 0.25,
      bloomStrength: 2.4,
      colorTint: new THREE.Vector3(0.84, 0.92, 1.14),
      temperature: -0.16,
      saturation: 1.32,
      contrast: 1.2,
      exposure: 1.05,
    },
    dawn: {
      skyColor: 0xd47854,
      fogColor: 0xdba488,
      fogDensity: 0.006,
      ambientColor: 0xeaba94,
      ambientIntensity: 0.8,
      lightColor: 0xffba88,
      lightIntensity: 2.8,
      lightPosition: { x: 100, y: 35, z: -120 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.3,
      cloudOpacity: 0.6,
      bloomStrength: 2.8,
      colorTint: new THREE.Vector3(1.1, 0.9, 0.76),
      temperature: 0.34,
      saturation: 1.42,
      contrast: 1.18,
      exposure: 1.22,
    },
    day: {
      // Rich saturated blue sky + warm golden sunlight, channelling the
      // Cyberpunk 2077 / Horizon midday look. Higher ambient + main light
      // intensity than is "physically correct" — ACES_FILMIC tonemaps
      // them back into a punchy display range, and the result reads as
      // genuine bright daytime instead of overcast.
      skyColor: 0x4d9fd6,
      fogColor: 0xa5c4dc,
      fogDensity: 0.0018,
      ambientColor: 0xfafbff,
      ambientIntensity: 1.85,
      lightColor: 0xfff0c8,
      lightIntensity: 4.2,
      lightPosition: { x: 70, y: 85, z: -130 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.0,
      cloudOpacity: 0.85,
      bloomStrength: 2.0,
      colorTint: new THREE.Vector3(1.06, 1.0, 0.94),
      temperature: 0.12,
      saturation: 1.45,
      contrast: 1.14,
      exposure: 1.2,
    },
    dusk: {
      skyColor: 0xc04860,
      fogColor: 0xa05368,
      fogDensity: 0.0055,
      ambientColor: 0xd6808c,
      ambientIntensity: 0.75,
      lightColor: 0xff7d52,
      lightIntensity: 2.8,
      lightPosition: { x: -90, y: 40, z: -110 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.4,
      cloudOpacity: 0.7,
      bloomStrength: 3.0,
      colorTint: new THREE.Vector3(1.1, 0.78, 0.58),
      temperature: 0.42,
      saturation: 1.45,
      contrast: 1.2,
      exposure: 1.18,
    },
    twilight: {
      skyColor: 0x2d2660,
      fogColor: 0x3a3278,
      fogDensity: 0.004,
      ambientColor: 0x96a8d6,
      ambientIntensity: 0.85,
      lightColor: 0xa6b8ee,
      lightIntensity: 2.4,
      lightPosition: { x: -70, y: 60, z: -120 },
      sunVisible: false,
      moonVisible: true,
      starIntensity: 0.7,
      cloudOpacity: 0.4,
      bloomStrength: 2.4,
      colorTint: new THREE.Vector3(0.92, 0.94, 1.12),
      temperature: -0.12,
      saturation: 1.28,
      contrast: 1.18,
      exposure: 1.12,
    }
  };

  constructor(startTime: number = 12, cycleSpeed: number = 1.0) {
    this.currentTime = startTime;
    this.cycleSpeed = cycleSpeed;
    this.currentSettings = this.timeSettings.day;
  }

  enableAutoCycle(enabled: boolean) {
    this.autoCycleEnabled = enabled;
  }

  setCycleSpeed(speed: number) {
    this.cycleSpeed = speed;
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  setTime(time: number) {
    this.currentTime = time % 24;
  }

  private getTimeOfDayFromHour(hour: number): string {
    if (hour >= 4 && hour < 6) return 'dawn';
    if (hour >= 6 && hour < 17) return 'day';
    if (hour >= 17 && hour < 19) return 'dusk';
    if (hour >= 19 && hour < 21) return 'twilight';
    return 'night';
  }

  private lerpColor(color1: number, color2: number, t: number): number {
    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);
    return c1.lerp(c2, t).getHex();
  }

  private lerpVector(v1: THREE.Vector3, v2: THREE.Vector3, t: number): THREE.Vector3 {
    return new THREE.Vector3().lerpVectors(v1, v2, t);
  }

  private lerpPosition(
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    t: number
  ): { x: number; y: number; z: number } {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
      z: p1.z + (p2.z - p1.z) * t
    };
  }

  private interpolateSettings(
    settings1: AtmosphericSettings,
    settings2: AtmosphericSettings,
    t: number
  ): AtmosphericSettings {
    return {
      skyColor: this.lerpColor(settings1.skyColor, settings2.skyColor, t),
      fogColor: this.lerpColor(settings1.fogColor, settings2.fogColor, t),
      fogDensity: settings1.fogDensity + (settings2.fogDensity - settings1.fogDensity) * t,
      ambientColor: this.lerpColor(settings1.ambientColor, settings2.ambientColor, t),
      ambientIntensity: settings1.ambientIntensity + (settings2.ambientIntensity - settings1.ambientIntensity) * t,
      lightColor: this.lerpColor(settings1.lightColor, settings2.lightColor, t),
      lightIntensity: settings1.lightIntensity + (settings2.lightIntensity - settings1.lightIntensity) * t,
      lightPosition: this.lerpPosition(settings1.lightPosition, settings2.lightPosition, t),
      sunVisible: t < 0.5 ? settings1.sunVisible : settings2.sunVisible,
      moonVisible: t < 0.5 ? settings1.moonVisible : settings2.moonVisible,
      starIntensity: settings1.starIntensity + (settings2.starIntensity - settings1.starIntensity) * t,
      cloudOpacity: settings1.cloudOpacity + (settings2.cloudOpacity - settings1.cloudOpacity) * t,
      bloomStrength: settings1.bloomStrength + (settings2.bloomStrength - settings1.bloomStrength) * t,
      colorTint: this.lerpVector(settings1.colorTint, settings2.colorTint, t),
      temperature: settings1.temperature + (settings2.temperature - settings1.temperature) * t,
      saturation: settings1.saturation + (settings2.saturation - settings1.saturation) * t,
      contrast: settings1.contrast + (settings2.contrast - settings1.contrast) * t,
      exposure: settings1.exposure + (settings2.exposure - settings1.exposure) * t,
    };
  }

  update(deltaTime: number): AtmosphericSettings {
    if (this.autoCycleEnabled) {
      // Update time - full cycle takes 24 hours in game time
      // With default speed of 1.0, a full cycle takes ~2 minutes real time
      this.currentTime += (deltaTime * this.cycleSpeed) / 5;
      if (this.currentTime >= 24) {
        this.currentTime -= 24;
      }
    }

    // Determine current and next time periods
    const currentPeriod = this.getTimeOfDayFromHour(this.currentTime);
    const currentHour = Math.floor(this.currentTime);
    const minuteFraction = this.currentTime - currentHour;

    // Get transition points
    let t = 0;
    let settings1 = this.timeSettings[currentPeriod];
    let settings2 = settings1;

    // Smooth transitions between periods
    if (currentHour === 4) {
      // Night to Dawn (4-5 AM)
      settings1 = this.timeSettings.night;
      settings2 = this.timeSettings.dawn;
      t = minuteFraction;
    } else if (currentHour === 5) {
      // Dawn to Day (5-6 AM)
      settings1 = this.timeSettings.dawn;
      settings2 = this.timeSettings.day;
      t = minuteFraction;
    } else if (currentHour === 17) {
      // Day to Dusk (5-6 PM)
      settings1 = this.timeSettings.day;
      settings2 = this.timeSettings.dusk;
      t = minuteFraction;
    } else if (currentHour === 18) {
      // Dusk to Twilight (6-7 PM)
      settings1 = this.timeSettings.dusk;
      settings2 = this.timeSettings.twilight;
      t = minuteFraction;
    } else if (currentHour >= 19 && currentHour < 21) {
      // Twilight to Night (7-9 PM)
      settings1 = this.timeSettings.twilight;
      settings2 = this.timeSettings.night;
      t = (this.currentTime - 19) / 2;
    } else {
      // Stable period
      t = 0;
      settings1 = this.timeSettings[currentPeriod];
      settings2 = settings1;
    }

    // Apply smooth easing
    const easedT = this.smoothstep(t);
    this.currentSettings = this.interpolateSettings(settings1, settings2, easedT);

    return this.currentSettings;
  }

  private smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  getSettings(timeOfDay: TimeOfDay): AtmosphericSettings {
    if (timeOfDay === 'auto') {
      return this.currentSettings;
    }
    return this.timeSettings[timeOfDay] || this.timeSettings.day;
  }

  getCurrentPeriod(): string {
    return this.getTimeOfDayFromHour(this.currentTime);
  }

  // Get formatted time string for UI
  getTimeString(): string {
    const hours = Math.floor(this.currentTime);
    const minutes = Math.floor((this.currentTime - hours) * 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  // Get sun/moon position for sky rendering
  getCelestialPosition(): THREE.Vector3 {
    const angle = (this.currentTime / 24) * Math.PI * 2 - Math.PI / 2;
    return new THREE.Vector3(
      Math.cos(angle) * 200,
      Math.sin(angle) * 200,
      0
    );
  }

  // Get atmospheric scattering parameters for AAA-quality sky shader
  getAtmosphericParams() {
    const period = this.getCurrentPeriod();
    const sunAltitude = Math.sin((this.currentTime / 24) * Math.PI * 2 - Math.PI / 2);

    // Dynamic parameters based on time of day
    const baseParams = {
      night: {
        rayleigh: 1.0,
        turbidity: 2.0,
        mieCoefficient: 0.001,
        mieDirectionalG: 0.7,
        exposure: 0.3
      },
      dawn: {
        rayleigh: 2.5,
        turbidity: 4.0,
        mieCoefficient: 0.01,
        mieDirectionalG: 0.95,
        exposure: 0.8
      },
      day: {
        rayleigh: 2.0,
        turbidity: 2.0,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
        exposure: 1.0
      },
      dusk: {
        rayleigh: 3.0,
        turbidity: 5.0,
        mieCoefficient: 0.015,
        mieDirectionalG: 0.98,
        exposure: 0.7
      },
      twilight: {
        rayleigh: 1.5,
        turbidity: 3.0,
        mieCoefficient: 0.003,
        mieDirectionalG: 0.75,
        exposure: 0.4
      }
    };

    const params = baseParams[period as keyof typeof baseParams] || baseParams.day;

    return {
      rayleigh: params.rayleigh,
      turbidity: params.turbidity,
      mieCoefficient: params.mieCoefficient,
      mieDirectionalG: params.mieDirectionalG,
      sunAltitude,
      exposure: params.exposure,
      // Legacy compatibility
      rayleighCoefficient: params.rayleigh * 0.001,
      scatteringStrength: period === 'dusk' || period === 'dawn' ? 1.5 : 1.0
    };
  }

  // Get sky color gradients for shader
  getSkyColors(): { top: THREE.Color; horizon: THREE.Color } {
    const period = this.getCurrentPeriod();
    const colors = {
      night: {
        top: new THREE.Color(0x0a0a20),
        horizon: new THREE.Color(0x1a1a3a)
      },
      dawn: {
        top: new THREE.Color(0x2a1a40),
        horizon: new THREE.Color(0xff6644)
      },
      day: {
        top: new THREE.Color(0x0077be),
        horizon: new THREE.Color(0x87ceeb)
      },
      dusk: {
        top: new THREE.Color(0x2a1a40),
        horizon: new THREE.Color(0xff4422)
      },
      twilight: {
        top: new THREE.Color(0x151530),
        horizon: new THREE.Color(0x443366)
      }
    };
    return colors[period as keyof typeof colors] || colors.day;
  }

  // Get sun position for physically-based sky shader
  getSunPosition(): THREE.Vector3 {
    // Calculate sun position based on time (0-24 hours)
    // At hour 6: sunrise (east), hour 12: noon (south, highest), hour 18: sunset (west)
    const hourAngle = (this.currentTime - 6) / 12 * Math.PI; // 0 at 6am, PI at 6pm
    const declination = 0.4; // Summer-like declination for nice lighting

    const altitude = Math.sin(hourAngle) * Math.cos(declination);
    const azimuth = hourAngle;

    // Convert to cartesian coordinates (sun far away)
    const distance = 400000; // Far distance for directional light
    const y = altitude * distance;
    const xzDistance = Math.sqrt(distance * distance - y * y);
    const x = Math.cos(azimuth) * xzDistance;
    const z = Math.sin(azimuth) * xzDistance * 0.3;

    return new THREE.Vector3(x, Math.max(y, -distance * 0.5), z);
  }

  // Get moon position for night sky
  getMoonPosition(): THREE.Vector3 {
    // Moon is roughly opposite to sun
    const sunPos = this.getSunPosition();
    return new THREE.Vector3(-sunPos.x * 0.8, Math.abs(sunPos.y) * 0.6 + 50, -sunPos.z * 0.8);
  }

  // Check if it's nighttime (for enabling stars, etc.)
  isNight(): boolean {
    const period = this.getCurrentPeriod();
    return period === 'night' || period === 'twilight';
  }

  // Get global illumination multiplier for scene lighting
  getGlobalIlluminationMultiplier(): number {
    const period = this.getCurrentPeriod();
    const multipliers = {
      night: 0.55,
      twilight: 0.65,
      dawn: 0.85,
      day: 1.15,
      dusk: 0.75
    };
    return multipliers[period as keyof typeof multipliers] || 1.0;
  }

  // Get ambient occlusion strength (stronger at night for more dramatic shadows)
  getAOStrength(): number {
    const period = this.getCurrentPeriod();
    const strengths = {
      night: 0.8,
      twilight: 0.6,
      dawn: 0.4,
      day: 0.3,
      dusk: 0.5
    };
    return strengths[period as keyof typeof strengths] || 0.3;
  }
}
