import * as THREE from 'three';

export class MuzzleFlash {
  light: THREE.PointLight;
  sprite: THREE.Sprite;
  lifetime: number = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number) {
    // Force realistic gun fire colors - yellow/orange (ignore passed color)
    const fireColor = 0xffaa00; // Bright yellow-orange fire color

    // Create intense point light for realistic muzzle flash
    this.light = new THREE.PointLight(fireColor, 20, 15);
    this.light.position.copy(position);
    this.light.castShadow = false; // Don't cast shadows for performance
    scene.add(this.light);

    // Create realistic fire sprite
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;

    // Create realistic gun fire gradient (bright center, fading to orange edges)
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255, 255, 200, 1)'); // Bright yellow-white center
    gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.9)'); // Yellow
    gradient.addColorStop(0.6, 'rgba(255, 140, 0, 0.6)'); // Orange
    gradient.addColorStop(0.85, 'rgba(255, 80, 0, 0.3)'); // Dark orange
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Transparent edge

    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });

    this.sprite = new THREE.Sprite(spriteMaterial);
    this.sprite.position.copy(position);
    this.sprite.scale.set(0.8, 0.8, 0.8); // Larger, more visible flash
    scene.add(this.sprite);

    this.lifetime = 0.08; // Shorter, snappier flash
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true; // Signal for removal
    }

    // Fast fade out for snappy feel
    const opacity = Math.pow(this.lifetime / 0.08, 0.5);
    this.light.intensity = 20 * opacity;
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.opacity = opacity;
    }

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.light);
    scene.remove(this.sprite);
    if (this.sprite.material instanceof THREE.SpriteMaterial) {
      this.sprite.material.map?.dispose();
      this.sprite.material.dispose();
    }
  }
}

export class BulletTracer {
  line: THREE.Line;
  lifetime: number = 0;

  constructor(scene: THREE.Scene, start: THREE.Vector3, end: THREE.Vector3, _color: number) {
    const points = [start.clone(), end.clone()];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Use bright yellow for all bullet tracers (ignore passed color)
    const material = new THREE.LineBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.9,
      linewidth: 2
    });

    this.line = new THREE.Line(geometry, material);
    scene.add(this.line);
    this.lifetime = 0.04; // Shorter tracer duration
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const opacity = this.lifetime / 0.04;
    (this.line.material as THREE.LineBasicMaterial).opacity = opacity * 0.9;

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.line);
    this.line.geometry.dispose();
    (this.line.material as THREE.LineBasicMaterial).dispose();
  }
}

export class ImpactEffect {
  particles: THREE.Points;
  velocities: THREE.Vector3[] = [];
  lifetime: number = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3, _color: number, count: number = 20) {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    for (let i = 0; i < count; i++) {
      positions.push(position.x, position.y, position.z);

      // Mix of yellow/orange for realistic impact sparks (ignore passed color)
      const sparkColor = Math.random() > 0.5 ? 0xffaa00 : 0xffdd55;
      const r = ((sparkColor >> 16) & 255) / 255;
      const g = ((sparkColor >> 8) & 255) / 255;
      const b = (sparkColor & 255) / 255;
      colors.push(r, g, b);

      sizes.push(0.1 + Math.random() * 0.15);

      // Faster, more explosive velocities
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.2) * 1.2,
        (Math.random() - 0.5) * 1.5
      );
      this.velocities.push(velocity);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, material);
    scene.add(this.particles);
    this.lifetime = 0.6; // Longer visible impact
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.particles.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < this.velocities.length; i++) {
      const idx = i * 3;
      positions[idx] += this.velocities[i].x * delta * 15;
      positions[idx + 1] += this.velocities[i].y * delta * 15;
      positions[idx + 2] += this.velocities[i].z * delta * 15;

      // Strong gravity for realistic fall
      this.velocities[i].y -= delta * 8;

      // Air resistance
      this.velocities[i].multiplyScalar(0.98);
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    const opacity = this.lifetime / 0.6;
    (this.particles.material as THREE.PointsMaterial).opacity = opacity;

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
  }
}

// New: Blood splatter effect for enemy hits
export class BloodSplatter {
  particles: THREE.Points;
  velocities: THREE.Vector3[] = [];
  lifetime: number = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3, direction: THREE.Vector3, count: number = 15) {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < count; i++) {
      positions.push(position.x, position.y, position.z);

      // Dark red blood
      const bloodColor = Math.random() > 0.7 ? 0x8b0000 : 0xa00000;
      const r = ((bloodColor >> 16) & 255) / 255;
      const g = ((bloodColor >> 8) & 255) / 255;
      const b = (bloodColor & 255) / 255;
      colors.push(r, g, b);

      // Spray away from impact direction
      const spread = 0.5;
      const velocity = new THREE.Vector3(
        direction.x + (Math.random() - 0.5) * spread,
        direction.y + (Math.random() - 0.5) * spread,
        direction.z + (Math.random() - 0.5) * spread
      );
      velocity.multiplyScalar(0.5 + Math.random() * 0.5);
      this.velocities.push(velocity);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    this.particles = new THREE.Points(geometry, material);
    scene.add(this.particles);
    this.lifetime = 1.0;
  }

  update(delta: number): boolean {
    this.lifetime -= delta;

    if (this.lifetime <= 0) {
      return true;
    }

    const positions = this.particles.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < this.velocities.length; i++) {
      const idx = i * 3;
      positions[idx] += this.velocities[i].x * delta * 10;
      positions[idx + 1] += this.velocities[i].y * delta * 10;
      positions[idx + 2] += this.velocities[i].z * delta * 10;

      // Gravity
      this.velocities[i].y -= delta * 5;
      this.velocities[i].multiplyScalar(0.95); // Drag
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    const opacity = this.lifetime / 1.0;
    (this.particles.material as THREE.PointsMaterial).opacity = opacity * 0.9;

    return false;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.particles);
    this.particles.geometry.dispose();
    (this.particles.material as THREE.PointsMaterial).dispose();
  }
}
