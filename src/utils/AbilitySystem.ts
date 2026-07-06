import * as THREE from 'three';

export type AbilityType = 'dash' | 'shield' | 'speed' | 'phantom' | 'explosive' | 'overcharge';

// Shared geometries for the activation flares — created once and reused by
// every effect (they're tiny and live for the whole session), so activating a
// power-up never allocates fresh GPU geometry mid-fight. Only the per-effect
// materials are created/disposed per activation; these geometries are NOT
// disposed by the effect cleanup.
const FLARE_GEO = {
  dash: new THREE.PlaneGeometry(0.5, 0.1),
  shield: new THREE.TorusGeometry(1.1, 0.06, 8, 24),
  overcharge: new THREE.SphereGeometry(0.08, 4, 4),
  explosive: new THREE.TorusGeometry(1.5, 0.1, 16, 32),
  phantom: new THREE.TorusGeometry(1.3, 0.08, 8, 24),
};

// ── Shared geometries for the AAA activation burst ────────────────────────
// Created once, reused for every burst (never disposed). Only the per-burst
// materials are allocated/freed, so casting a power never builds GPU geometry
// mid-fight. MeshBasicMaterial + AdditiveBlending is already compiled by the
// pickup/nuke VFX, so these add no new shader permutation (no warmup stutter).
const BURST_GEO = {
  flash: new THREE.SphereGeometry(0.32, 18, 14),
  ring: new THREE.TorusGeometry(0.62, 0.045, 12, 48),
  mote: new THREE.SphereGeometry(0.055, 6, 6),
  pillar: new THREE.CylinderGeometry(0.55, 0.85, 4.4, 24, 1, true),
};
const _easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);

export interface Ability {
  type: AbilityType;
  name: string;
  description: string;
  icon: string;
  cooldown: number; // milliseconds
  duration: number; // milliseconds
  lastUsed: number;
  active: boolean;
  activeUntil: number;
}

export interface AbilityEffects {
  speedMultiplier: number;
  /** Phantom: enemies lose track of the player + the player is intangible. */
  isPhantom: boolean;
  /** Riot shield raised — blocks damage from the front arc (directional). */
  shieldHeld: boolean;
  /** Overcharge: temporary +fire-rate and +damage combat burst. */
  overcharge: boolean;
}

export class AbilitySystem {
  private abilities: Map<AbilityType, Ability> = new Map();
  private effects: AbilityEffects = {
    speedMultiplier: 1.0,
    isPhantom: false,
    shieldHeld: false,
    overcharge: false,
  };

  constructor() {
    this.initializeAbilities();
  }

  private initializeAbilities() {
    const abilityData: Record<AbilityType, Omit<Ability, 'lastUsed' | 'active' | 'activeUntil'>> = {
      dash: {
        type: 'dash',
        name: 'Dash',
        description: 'Quick burst of speed forward',
        icon: '⚡',
        cooldown: 3000,
        duration: 500
      },
      shield: {
        type: 'shield',
        name: 'Riot Shield',
        description: 'Raise a shield that blocks damage from the front',
        icon: '🛡️',
        cooldown: 15000,
        duration: 8000
      },
      speed: {
        type: 'speed',
        name: 'Sprint',
        description: '2x movement speed',
        icon: '🏃',
        cooldown: 8000,
        duration: 5000
      },
      phantom: {
        type: 'phantom',
        name: 'Phantom',
        description: 'Enemies lose track of you and you phase through them',
        icon: '👻',
        cooldown: 25000,
        duration: 5000
      },
      explosive: {
        type: 'explosive',
        name: 'Explosive Shot',
        description: 'Next shot deals AoE damage',
        icon: '💥',
        cooldown: 12000,
        duration: 10000
      },
      overcharge: {
        type: 'overcharge',
        name: 'Overcharge',
        description: 'Faster fire rate and bigger damage for a few seconds',
        icon: '⚡',
        cooldown: 18000,
        duration: 8000
      }
    };

    Object.entries(abilityData).forEach(([type, data]) => {
      this.abilities.set(type as AbilityType, {
        ...data,
        lastUsed: 0,
        active: false,
        activeUntil: 0
      });
    });
  }

  useAbility(type: AbilityType): boolean {
    const ability = this.abilities.get(type);
    if (!ability) return false;

    const now = Date.now();

    // Check cooldown
    if (now - ability.lastUsed < ability.cooldown) {
      return false;
    }

    // Activate ability
    ability.lastUsed = now;
    ability.active = true;
    ability.activeUntil = now + ability.duration;

    // Apply effects
    switch (type) {
      case 'shield':
        this.effects.shieldHeld = true;
        break;
      case 'speed':
        this.effects.speedMultiplier = 2.0;
        break;
      case 'phantom':
        this.effects.isPhantom = true;
        break;
      case 'overcharge':
        this.effects.overcharge = true;
        break;
    }

    return true;
  }

  update(_deltaTime: number): AbilityEffects {
    const now = Date.now();

    // Update all abilities
    this.abilities.forEach((ability) => {
      if (ability.active && now >= ability.activeUntil) {
        ability.active = false;

        // Remove effects
        switch (ability.type) {
          case 'speed':
            this.effects.speedMultiplier = 1.0;
            break;
          case 'phantom':
            this.effects.isPhantom = false;
            break;
          case 'shield':
            this.effects.shieldHeld = false;
            break;
          case 'overcharge':
            this.effects.overcharge = false;
            break;
        }
      }
    });

    return this.effects;
  }

  getAbility(type: AbilityType): Ability | undefined {
    return this.abilities.get(type);
  }

  getAllAbilities(): Ability[] {
    return Array.from(this.abilities.values());
  }

  getCooldownPercent(type: AbilityType): number {
    const ability = this.abilities.get(type);
    if (!ability) return 100;

    const now = Date.now();
    const elapsed = now - ability.lastUsed;

    if (elapsed >= ability.cooldown) return 100;

    return (elapsed / ability.cooldown) * 100;
  }

  isOnCooldown(type: AbilityType): boolean {
    return this.getCooldownPercent(type) < 100;
  }

  getEffects(): AbilityEffects {
    return { ...this.effects };
  }

  /**
   * AAA power-up activation burst. A self-animating, theme-coloured flourish
   * built from a bright core flash, twin expanding ground shockwave rings, a
   * rising energy pillar and a spray of spark motes that arc up and out. Drives
   * itself with requestAnimationFrame for ~0.9s, then disposes its per-burst
   * materials (shared geometries persist). Centre `position` at the player's
   * FEET — the rings ride the ground and the pillar rises through the body.
   */
  createActivationBurst(
    scene: THREE.Scene,
    position: THREE.Vector3,
    color: THREE.ColorRepresentation,
    opts: { intensity?: number } = {},
  ): void {
    const intensity = opts.intensity ?? 1;
    const col = new THREE.Color(color);
    const colHot = col.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const group = new THREE.Group();
    group.position.copy(position);
    group.renderOrder = 994;

    const mats: THREE.Material[] = [];
    const mk = (c: THREE.Color, opacity: number): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      });
      mats.push(m);
      return m;
    };

    // Core flash — a hot pop at chest height.
    const flash = new THREE.Mesh(BURST_GEO.flash, mk(colHot, 1));
    flash.position.y = 2.2;
    group.add(flash);

    // Twin ground shockwave rings (laid flat, expand outward).
    const ring1 = new THREE.Mesh(BURST_GEO.ring, mk(col, 0.95));
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.08;
    group.add(ring1);
    const ring2 = new THREE.Mesh(BURST_GEO.ring, mk(colHot, 0.8));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.05;
    group.add(ring2);

    // Vertical energy pillar (open-ended cylinder), rises + fades.
    const pillar = new THREE.Mesh(BURST_GEO.pillar, mk(col, 0.42));
    pillar.position.y = 2.2;
    pillar.scale.set(0.55, 0.4, 0.55);
    group.add(pillar);

    // Spark motes — arc up and outward, gravity-pulled. Every mote fades on the
    // SAME clock (opacity = 1 − t), so TWO shared materials (hot + base tint)
    // serve the whole spray — the old one-material-per-mote version allocated
    // ~16 extra materials per activation, pure heap churn mid-fight.
    const moteMatHot = mk(colHot, 1);
    const moteMatBase = mk(col, 1);
    const moteCount = Math.round(16 * intensity);
    const motes: { mesh: THREE.Mesh; vx: number; vy: number; vz: number }[] = [];
    for (let i = 0; i < moteCount; i++) {
      const mote = new THREE.Mesh(BURST_GEO.mote, Math.random() > 0.5 ? moteMatHot : moteMatBase);
      mote.position.y = 1.0 + Math.random() * 1.2;
      group.add(mote);
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.2 + Math.random() * 3.6;
      motes.push({
        mesh: mote,
        vx: Math.cos(ang) * spd,
        vy: 3.5 + Math.random() * 4.5,
        vz: Math.sin(ang) * spd,
      });
    }

    scene.add(group);

    const DURATION = 0.92;
    let elapsed = 0;
    let last = performance.now();
    const tick = () => {
      if (!group.parent) { mats.forEach((m) => m.dispose()); return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const t = Math.min(1, elapsed / DURATION);
      const e = _easeOut(t);

      // Flash: quick pop then fade in the first third.
      const ft = Math.min(1, t / 0.32);
      flash.scale.setScalar(0.4 + _easeOut(ft) * 3.2);
      (flash.material as THREE.MeshBasicMaterial).opacity = (1 - ft) * 1;

      // Rings: expand + fade (second ring lags for a layered ripple).
      const r1 = 0.4 + e * 7.5;
      ring1.scale.set(r1, r1, 1);
      (ring1.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.95;
      const t2 = Math.max(0, (t - 0.12) / 0.88);
      const r2 = 0.4 + _easeOut(t2) * 5.4;
      ring2.scale.set(r2, r2, 1);
      (ring2.material as THREE.MeshBasicMaterial).opacity = (1 - t2) * 0.8;

      // Pillar: flares wide then thins as it lifts and fades.
      const pw = 0.55 + e * 0.9;
      pillar.scale.set(pw, 0.5 + e * 1.1, pw);
      pillar.position.y = 2.0 + e * 1.6;
      (pillar.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.42;

      // Motes: ballistic arcs, shrink + fade out (shared fade — one write for
      // the two shared materials instead of one per mote).
      moteMatHot.opacity = 1 - t;
      moteMatBase.opacity = 1 - t;
      for (const m of motes) {
        m.vy -= 11 * dt;
        m.mesh.position.x += m.vx * dt;
        m.mesh.position.y += m.vy * dt;
        m.mesh.position.z += m.vz * dt;
        const s = Math.max(0.01, 1 - t);
        m.mesh.scale.setScalar(s);
      }

      if (t >= 1) {
        scene.remove(group);
        mats.forEach((m) => m.dispose());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Create visual effect for ability use. Geometries are shared (FLARE_GEO);
  // only the lightweight per-effect materials are allocated here and disposed
  // when the flare auto-removes.
  createAbilityEffect(scene: THREE.Scene, position: THREE.Vector3, type: AbilityType): THREE.Group {
    const effect = new THREE.Group();

    switch (type) {
      case 'dash': {
        // Speed lines — one shared material for all 10 (identical colour +
        // opacity, so per-line materials were pure allocation churn).
        const material = new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.6
        });
        for (let i = 0; i < 10; i++) {
          const line = new THREE.Mesh(FLARE_GEO.dash, material);
          line.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
          );
          effect.add(line);
        }
        break;
      }

      case 'shield': {
        // Quick activation flare only — the persistent shield is a held mesh
        // on the player's arm (managed in the game loop), NOT a bubble here.
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0x55b0ff,
          transparent: true,
          opacity: 0.7,
        });
        const ring = new THREE.Mesh(FLARE_GEO.shield, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        break;
      }

      case 'overcharge': {
        // Electric spark motes that pop on activation — two shared materials
        // (gold + ember) instead of 18 throwaway ones.
        const gold = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 });
        const ember = new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.9 });
        for (let i = 0; i < 18; i++) {
          const particle = new THREE.Mesh(FLARE_GEO.overcharge, Math.random() > 0.5 ? gold : ember);
          particle.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
          );
          effect.add(particle);
        }
        break;
      }

      case 'explosive': {
        // Fire ring
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xff4400,
          transparent: true,
          opacity: 0.7
        });
        const ring = new THREE.Mesh(FLARE_GEO.explosive, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        break;
      }

      case 'phantom': {
        // Brief dematerialize pulse — the persistent translucency is applied
        // to the player body in the game loop, not a bubble here.
        const auraMaterial = new THREE.MeshBasicMaterial({
          color: 0x9a6bff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        });
        const aura = new THREE.Mesh(FLARE_GEO.phantom, auraMaterial);
        aura.rotation.x = Math.PI / 2;
        effect.add(aura);
        break;
      }
    }

    effect.position.copy(position);
    scene.add(effect);

    // Auto-remove after animation. Dispose only the per-effect materials —
    // the geometries are shared (FLARE_GEO) and must persist.
    setTimeout(() => {
      scene.remove(effect);
      effect.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      });
    }, 2000);

    return effect;
  }
}
