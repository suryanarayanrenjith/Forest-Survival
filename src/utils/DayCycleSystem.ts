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
}

export class DayCycleSystem {
  private currentTime: number = 0; // 0-24 hours
  private cycleSpeed: number = 1.0; // Time multiplier
  private autoCycleEnabled: boolean = false;
  private currentSettings: AtmosphericSettings;

  // Predefined settings for each time period
  private readonly timeSettings: Record<string, AtmosphericSettings> = {
    night: {
      skyColor: 0x0a0a1a,
      fogColor: 0x1a1a2e,
      fogDensity: 0.006,
      ambientColor: 0x4466aa,
      ambientIntensity: 0.8,
      lightColor: 0xaaccff,
      lightIntensity: 1.8,
      lightPosition: { x: -80, y: 120, z: 100 },
      sunVisible: false,
      moonVisible: true,
      starIntensity: 1.0,
      cloudOpacity: 0.3,
      bloomStrength: 2.5,
      colorTint: new THREE.Vector3(0.8, 0.85, 1.0),
      temperature: -0.2,
      saturation: 0.9,
      contrast: 1.1
    },
    dawn: {
      skyColor: 0xff6b4a,
      fogColor: 0xff8866,
      fogDensity: 0.008,
      ambientColor: 0xffaa88,
      ambientIntensity: 0.9,
      lightColor: 0xffaa77,
      lightIntensity: 2.0,
      lightPosition: { x: 150, y: 30, z: -50 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.3,
      cloudOpacity: 0.6,
      bloomStrength: 3.0,
      colorTint: new THREE.Vector3(1.0, 0.85, 0.7),
      temperature: 0.4,
      saturation: 1.3,
      contrast: 1.15
    },
    day: {
      skyColor: 0x87CEEB,
      fogColor: 0xb0c4de,
      fogDensity: 0.004,
      ambientColor: 0xffffff,
      ambientIntensity: 1.0,
      lightColor: 0xfff4e6,
      lightIntensity: 2.5,
      lightPosition: { x: 100, y: 150, z: -50 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.0,
      cloudOpacity: 0.8,
      bloomStrength: 1.8,
      colorTint: new THREE.Vector3(1.0, 1.0, 1.0),
      temperature: 0.0,
      saturation: 1.2,
      contrast: 1.1
    },
    dusk: {
      skyColor: 0xff4466,
      fogColor: 0xcc5577,
      fogDensity: 0.007,
      ambientColor: 0xff8899,
      ambientIntensity: 0.85,
      lightColor: 0xff6644,
      lightIntensity: 2.2,
      lightPosition: { x: -120, y: 40, z: 80 },
      sunVisible: true,
      moonVisible: false,
      starIntensity: 0.4,
      cloudOpacity: 0.7,
      bloomStrength: 3.2,
      colorTint: new THREE.Vector3(1.0, 0.75, 0.6),
      temperature: 0.5,
      saturation: 1.4,
      contrast: 1.2
    },
    twilight: {
      skyColor: 0x332266,
      fogColor: 0x443377,
      fogDensity: 0.007,
      ambientColor: 0x6677aa,
      ambientIntensity: 0.7,
      lightColor: 0x7788cc,
      lightIntensity: 1.5,
      lightPosition: { x: -100, y: 80, z: 120 },
      sunVisible: false,
      moonVisible: true,
      starIntensity: 0.7,
      cloudOpacity: 0.4,
      bloomStrength: 2.8,
      colorTint: new THREE.Vector3(0.85, 0.8, 1.0),
      temperature: -0.1,
      saturation: 1.0,
      contrast: 1.15
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
      contrast: settings1.contrast + (settings2.contrast - settings1.contrast) * t
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
      night: 0.15,
      twilight: 0.35,
      dawn: 0.7,
      day: 1.0,
      dusk: 0.6
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
