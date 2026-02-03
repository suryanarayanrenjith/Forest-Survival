import * as THREE from 'three';

export type WeatherType = 'clear' | 'rain' | 'storm' | 'mist' | 'snow';

interface WeatherParticle {
  mesh: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial | THREE.ShaderMaterial;
  velocities: Float32Array;
}

export class WeatherSystem {
  private scene: THREE.Scene;
  private currentWeather: WeatherType;
  private particles: WeatherParticle | null = null;
  private mistPlanes: THREE.Mesh[] = [];
  private thunderLightning: THREE.PointLight | null = null;
  private time: number = 0;

  constructor(scene: THREE.Scene, _camera: THREE.Camera) {
    this.scene = scene;
    // camera parameter kept for API consistency but not stored
    this.currentWeather = 'clear';
  }

  setWeather(weatherType: WeatherType) {
    this.clear();
    this.currentWeather = weatherType;

    switch (weatherType) {
      case 'rain':
        this.createRain();
        break;
      case 'storm':
        this.createStorm();
        break;
      case 'mist':
        this.createMist();
        break;
      case 'snow':
        this.createSnow();
        break;
      case 'clear':
      default:
        break;
    }
  }

  private createRain() {
    const particleCount = 5000;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread around camera
      positions[i3] = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = Math.random() * 100 + 20;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;

      // Velocity
      velocities[i3] = (Math.random() - 0.5) * 0.5;
      velocities[i3 + 1] = -1.5 - Math.random() * 0.5;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);

    this.particles = {
      mesh,
      geometry,
      material,
      velocities
    };
  }

  private createStorm() {
    // Create rain first
    this.createRain();

    // Add thunder lightning
    this.thunderLightning = new THREE.PointLight(0xaaccff, 0, 100);
    this.thunderLightning.position.set(0, 50, 0);
    this.scene.add(this.thunderLightning);

    // Make rain more intense
    if (this.particles && this.particles.material instanceof THREE.PointsMaterial) {
      this.particles.material.size = 0.2;
      this.particles.material.opacity = 0.8;
    }

    // Increase velocity for storm
    if (this.particles) {
      for (let i = 0; i < this.particles.velocities.length; i += 3) {
        this.particles.velocities[i + 1] *= 2; // Double fall speed
      }
    }
  }

  private createMist() {
    const mistCount = 20;

    for (let i = 0; i < mistCount; i++) {
      const mistGeometry = new THREE.PlaneGeometry(50, 30);
      const mistMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: Math.random() * 100 },
          opacity: { value: 0.15 },
          color: { value: new THREE.Color(0xccddee) }
        },
        vertexShader: `
          uniform float time;
          varying vec2 vUv;
          varying float vOpacity;

          void main() {
            vUv = uv;
            vec3 pos = position;

            // Animated mist movement
            pos.x += sin(time * 0.5 + uv.y * 3.14) * 2.0;
            pos.y += cos(time * 0.3 + uv.x * 3.14) * 1.0;

            vOpacity = sin(time * 0.8) * 0.3 + 0.7;

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float opacity;
          uniform vec3 color;
          varying vec2 vUv;
          varying float vOpacity;

          void main() {
            // Soft gradient
            float alpha = opacity * vOpacity * (1.0 - vUv.y) * smoothstep(0.0, 1.0, vUv.y);

            // Add some variation
            float noise = sin(vUv.x * 10.0) * cos(vUv.y * 10.0) * 0.1 + 0.9;

            gl_FragColor = vec4(color, alpha * noise);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      const mist = new THREE.Mesh(mistGeometry, mistMaterial);

      // Random placement around camera
      mist.position.set(
        (Math.random() - 0.5) * 100,
        Math.random() * 5 + 2,
        (Math.random() - 0.5) * 100
      );

      mist.rotation.y = Math.random() * Math.PI;

      this.scene.add(mist);
      this.mistPlanes.push(mist);
    }
  }

  private createSnow() {
    const particleCount = 3000;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread around camera
      positions[i3] = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = Math.random() * 100 + 20;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;

      // Slower, drifting velocity
      velocities[i3] = (Math.random() - 0.5) * 0.3;
      velocities[i3 + 1] = -0.2 - Math.random() * 0.3;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.4,
      transparent: true,
      opacity: 0.8,
      blending: THREE.NormalBlending,
      depthWrite: false,
      map: this.createSnowflakeTexture()
    });

    const mesh = new THREE.Points(geometry, material);
    this.scene.add(mesh);

    this.particles = {
      mesh,
      geometry,
      material,
      velocities
    };
  }

  private createSnowflakeTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;

    // Draw snowflake
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(16, 16, 8, 0, Math.PI * 2);
    ctx.fill();

    // Add some detail
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(16, 16);
      ctx.lineTo(16 + Math.cos(angle) * 8, 16 + Math.sin(angle) * 8);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  update(deltaTime: number, cameraPosition: THREE.Vector3) {
    this.time += deltaTime;

    if (this.particles) {
      const positions = this.particles.geometry.attributes.position.array as Float32Array;

      // Update particle positions
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += this.particles.velocities[i];
        positions[i + 1] += this.particles.velocities[i + 1];
        positions[i + 2] += this.particles.velocities[i + 2];

        // Reset particles that fall below ground
        if (positions[i + 1] < 0) {
          positions[i] = cameraPosition.x + (Math.random() - 0.5) * 200;
          positions[i + 1] = 100 + Math.random() * 20;
          positions[i + 2] = cameraPosition.z + (Math.random() - 0.5) * 200;
        }

        // Keep particles around camera
        if (Math.abs(positions[i] - cameraPosition.x) > 100) {
          positions[i] = cameraPosition.x + (Math.random() - 0.5) * 200;
        }
        if (Math.abs(positions[i + 2] - cameraPosition.z) > 100) {
          positions[i + 2] = cameraPosition.z + (Math.random() - 0.5) * 200;
        }
      }

      this.particles.geometry.attributes.position.needsUpdate = true;

      // Move particle system with camera
      this.particles.mesh.position.copy(cameraPosition);
      this.particles.mesh.position.y = 0;
    }

    // Update mist
    for (const mist of this.mistPlanes) {
      if (mist.material instanceof THREE.ShaderMaterial) {
        mist.material.uniforms.time.value = this.time;
      }

      // Move mist planes to follow camera loosely
      const targetX = cameraPosition.x + (mist.userData.offsetX || 0);
      const targetZ = cameraPosition.z + (mist.userData.offsetZ || 0);
      mist.position.x += (targetX - mist.position.x) * 0.1;
      mist.position.z += (targetZ - mist.position.z) * 0.1;

      // Rotate slowly
      mist.rotation.y += deltaTime * 0.1;
    }

    // Update storm lightning
    if (this.thunderLightning && this.currentWeather === 'storm') {
      // Random lightning flashes
      if (Math.random() < 0.005) {
        this.thunderLightning.intensity = 10 + Math.random() * 5;
        this.thunderLightning.position.set(
          cameraPosition.x + (Math.random() - 0.5) * 100,
          50 + Math.random() * 20,
          cameraPosition.z + (Math.random() - 0.5) * 100
        );

        // Flash duration
        setTimeout(() => {
          if (this.thunderLightning) {
            this.thunderLightning.intensity = 0;
          }
        }, 100 + Math.random() * 100);
      }
    }
  }

  clear() {
    if (this.particles) {
      this.scene.remove(this.particles.mesh);
      this.particles.geometry.dispose();
      if (this.particles.material instanceof THREE.Material) {
        this.particles.material.dispose();
      }
      this.particles = null;
    }

    for (const mist of this.mistPlanes) {
      this.scene.remove(mist);
      mist.geometry.dispose();
      if (mist.material instanceof THREE.Material) {
        mist.material.dispose();
      }
    }
    this.mistPlanes = [];

    if (this.thunderLightning) {
      this.scene.remove(this.thunderLightning);
      this.thunderLightning = null;
    }
  }

  getCurrentWeather(): WeatherType {
    return this.currentWeather;
  }

  // Get random weather based on probabilities
  static getRandomWeather(isNight: boolean = false): WeatherType {
    const rand = Math.random();

    if (isNight) {
      // Night has more dramatic weather
      if (rand < 0.3) return 'clear';
      if (rand < 0.5) return 'mist';
      if (rand < 0.7) return 'rain';
      if (rand < 0.85) return 'storm';
      return 'snow';
    } else {
      // Day has more clear weather
      if (rand < 0.5) return 'clear';
      if (rand < 0.7) return 'mist';
      if (rand < 0.85) return 'rain';
      if (rand < 0.95) return 'storm';
      return 'snow';
    }
  }
}
