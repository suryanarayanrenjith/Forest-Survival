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

/**
 * VFX FACTORY ONLY — this class owns no gameplay state.
 *
 * It used to also carry a cooldown/duration state machine (an `abilities` Map,
 * `useAbility`, `getEffects`, and a per-frame `update` returning an
 * `AbilityEffects` blob). Nothing ever called `useAbility`, so no ability could
 * ever go active: `update` walked six map entries every frame only to hand back
 * a frozen `{ speedMultiplier: 1.0, isPhantom: false, ... }`, and the player's
 * speed formula multiplied by a permanent 1.0. All of it is gone.
 *
 * The REAL ability gameplay — Overclock, Demolition, the Ranger dash and their
 * cooldowns — lives in CharacterAbilityRegistry and the App run loop. Put
 * ability state there, not here.
 */
export class AbilitySystem {
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
    // Ember column — a tight core of risers that shoot straight up through the
    // pillar, selling the "energy surging through the body" beat. Same shared
    // geometry + materials, so the extra flourish costs zero new programs.
    const riserCount = 6;
    for (let i = 0; i < riserCount; i++) {
      const mote = new THREE.Mesh(BURST_GEO.mote, i % 2 === 0 ? moteMatHot : moteMatBase);
      const ang = (i / riserCount) * Math.PI * 2;
      mote.position.set(Math.cos(ang) * 0.28, 0.4 + Math.random() * 0.6, Math.sin(ang) * 0.28);
      group.add(mote);
      motes.push({
        mesh: mote,
        vx: Math.cos(ang) * 0.35,
        vy: 7.5 + Math.random() * 3.0,
        vz: Math.sin(ang) * 0.35,
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
  // when the flare finishes. Every flare now ANIMATES (expand / spiral / fade)
  // via its own short rAF driver — the old version parked a static group in
  // the world for 2s, which read as frozen debris rather than a cast.
  createAbilityEffect(scene: THREE.Scene, position: THREE.Vector3, type: AbilityType): THREE.Group {
    const effect = new THREE.Group();
    const mats: THREE.Material[] = [];
    const track = (m: THREE.Material): THREE.Material => { mats.push(m); return m; };
    // Per-mesh animation targets the tick below drives.
    const rings: THREE.Mesh[] = [];
    const swirls: { mesh: THREE.Mesh; ang: number; radius: number; riseSpd: number }[] = [];
    const streaks: { mesh: THREE.Mesh; vx: number; vz: number }[] = [];

    switch (type) {
      case 'dash': {
        // Speed lines — one shared material for all 10; they streak backward
        // and fade like slipstream trails.
        const material = track(new THREE.MeshBasicMaterial({
          color: 0x00ffff,
          transparent: true,
          opacity: 0.6
        }));
        for (let i = 0; i < 10; i++) {
          const line = new THREE.Mesh(FLARE_GEO.dash, material);
          line.position.set(
            Math.random() * 2 - 1,
            Math.random() * 2,
            Math.random() * 2 - 1
          );
          effect.add(line);
          streaks.push({
            mesh: line,
            vx: (Math.random() - 0.5) * 2.4,
            vz: 2.5 + Math.random() * 3.0,
          });
        }
        break;
      }

      case 'shield': {
        // Expanding hard-light ring — the persistent shield is the held mesh
        // on the player's arm (managed in the game loop), NOT a bubble here.
        const ringMaterial = track(new THREE.MeshBasicMaterial({
          color: 0x55b0ff,
          transparent: true,
          opacity: 0.7,
        }));
        const ring = new THREE.Mesh(FLARE_GEO.shield, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        rings.push(ring);
        break;
      }

      case 'overcharge': {
        // Electric spark motes — two shared materials (gold + ember) that now
        // spiral outward and up like a discharging coil.
        const gold = track(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 }));
        const ember = track(new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.9 }));
        for (let i = 0; i < 18; i++) {
          const particle = new THREE.Mesh(FLARE_GEO.overcharge, i % 2 === 0 ? gold : ember);
          const ang = Math.random() * Math.PI * 2;
          const radius = 0.25 + Math.random() * 0.6;
          particle.position.set(Math.cos(ang) * radius, Math.random() * 1.6, Math.sin(ang) * radius);
          effect.add(particle);
          swirls.push({ mesh: particle, ang, radius, riseSpd: 1.2 + Math.random() * 1.8 });
        }
        break;
      }

      case 'explosive': {
        // Fire ring — races outward from the cast point.
        const ringMaterial = track(new THREE.MeshBasicMaterial({
          color: 0xff4400,
          transparent: true,
          opacity: 0.7
        }));
        const ring = new THREE.Mesh(FLARE_GEO.explosive, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        effect.add(ring);
        rings.push(ring);
        break;
      }

      case 'phantom': {
        // Dematerialize pulse — the aura ring climbs the body while expanding,
        // like a scan-line phasing the player out. Persistent translucency is
        // applied to the player body in the game loop, not a bubble here.
        const auraMaterial = track(new THREE.MeshBasicMaterial({
          color: 0x9a6bff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide
        }));
        const aura = new THREE.Mesh(FLARE_GEO.phantom, auraMaterial);
        aura.rotation.x = Math.PI / 2;
        effect.add(aura);
        rings.push(aura);
        break;
      }
    }

    effect.position.copy(position);
    scene.add(effect);

    // Self-driving animation: rings expand + rise, swirl motes orbit outward,
    // dash streaks race backward — all fading on one clock, then dispose.
    // Shared FLARE_GEO geometries are never disposed. The parent-check guard
    // also lets an external owner (warmup teardown) remove the group early.
    const DURATION = 0.85;
    let elapsed = 0;
    let last = performance.now();
    const tick = () => {
      if (!effect.parent) { mats.forEach((m) => m.dispose()); return; }
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const t = Math.min(1, elapsed / DURATION);
      const e = _easeOut(t);
      const fade = 1 - t;

      for (const m of mats) (m as THREE.MeshBasicMaterial).opacity = fade * 0.9;
      for (const ring of rings) {
        const s = 0.6 + e * 1.6;
        ring.scale.set(s, s, 1);
        ring.position.y = e * 1.4;
      }
      for (const sw of swirls) {
        sw.ang += dt * 6.5;
        const r = sw.radius + e * 1.3;
        sw.mesh.position.x = Math.cos(sw.ang) * r;
        sw.mesh.position.z = Math.sin(sw.ang) * r;
        sw.mesh.position.y += sw.riseSpd * dt;
      }
      for (const st of streaks) {
        st.mesh.position.x += st.vx * dt;
        st.mesh.position.z += st.vz * dt;
        st.mesh.scale.x = 1 + e * 2.2; // stretch into a trail
      }

      if (t >= 1) {
        scene.remove(effect);
        mats.forEach((m) => m.dispose());
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return effect;
  }
}
