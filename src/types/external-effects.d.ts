declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import type { Pass } from 'postprocessing';

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      distanceFalloff: number;
      intensity: number;
      denoiseIterations: number;
      renderMode: number;
      biasOffset: number;
      biasMultiplier: number;
      color: Color;
      gammaCorrection: boolean;
      depthBufferType: number;
      screenSpaceRadius: boolean;
      halfRes: boolean;
      depthAwareUpsampling: boolean;
      colorMultiply: boolean;
      transparencyAware: boolean;
      accumulate: boolean;
    };
    autosetGamma: boolean;
    lastTime: number;
    timeRollingAverage: number;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setDisplayMode(mode: 'Combined' | 'AO' | 'No AO' | 'Split' | 'Split AO'): void;
    enableDebugMode(): void;
    disableDebugMode(): void;
  }
}

declare module 'realism-effects' {
  import type { Camera, Scene, Texture } from 'three';
  import type { Effect, Pass } from 'postprocessing';

  export class VelocityDepthNormalPass extends Pass {
    constructor(scene: Scene, camera: Camera, renderDepth?: boolean);
    texture: Texture;
    depthTexture: Texture;
    renderDepth: boolean;
  }

  export class TRAAEffect extends Effect {
    constructor(scene: Scene, camera: Camera, velocityDepthNormalPass: VelocityDepthNormalPass, options?: Record<string, unknown>);
  }

  export class MotionBlurEffect extends Effect {
    constructor(
      velocityPass: VelocityDepthNormalPass,
      options?: {
        intensity?: number;
        jitter?: number;
        samples?: number;
      },
    );
  }
}