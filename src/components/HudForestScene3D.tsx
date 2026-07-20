import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Lightweight, self-contained 3D forest backdrop for the mobile HUD-layout
 * editor. Raw Three.js (matching the rest of the game — no R3F in the bundle),
 * kept deliberately cheap: no post-processing, no shadow maps, ≤ a couple dozen
 * low-poly pines, DPR-capped and throttled to ~30fps. It renders a sunlit
 * low-poly clearing that reads like the real game so players see their buttons
 * over an accurate scene. Everything is disposed on unmount, and a CSS gradient
 * shows through if WebGL is unavailable.
 */
const HudForestScene3D = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return; // CSS gradient fallback shows through the transparent canvas
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const HAZE = new THREE.Color(0xcfe8c4);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(HAZE, 16, 62);

    const sizeOf = () => {
      const r = canvas.getBoundingClientRect();
      return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
    };
    let { w, h } = sizeOf();
    renderer.setSize(w, h, false);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.5, 200);
    const camBase = new THREE.Vector3(0, 2.4, 9.5);
    const lookTarget = new THREE.Vector3(0, 1.9, -8);
    camera.position.copy(camBase);
    camera.lookAt(lookTarget);

    // ── Sky dome — vertical gradient + a warm low sun, no post needed ──
    const sunDir = new THREE.Vector3(-0.32, 0.34, -0.88).normalize();
    const skyGeo = new THREE.SphereGeometry(120, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x4c93d8) },
        uMid: { value: new THREE.Color(0x9fd0ef) },
        uHorizon: { value: new THREE.Color(0xeaf3e2) },
        uSun: { value: new THREE.Color(0xfff6da) },
        uSunDir: { value: sunDir },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix*vec4(position,1.0)).xyz); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop,uMid,uHorizon,uSun,uSunDir; varying vec3 vDir;
        void main(){
          float y = vDir.y;
          vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.34, y));
          c = mix(c, uTop, smoothstep(0.30, 0.85, y));
          c = mix(uHorizon, c, smoothstep(-0.08, 0.05, y));
          float s = max(dot(vDir, uSunDir), 0.0);
          c += uSun * (pow(s, 900.0) * 2.2 + pow(s, 22.0) * 0.35 + pow(s, 5.0) * 0.08);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -100;
    sky.frustumCulled = false;
    scene.add(sky);

    // Soft additive sun glow sprite (cheap bloom substitute)
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gctx = glowCanvas.getContext('2d')!;
    const grad = gctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,250,225,0.95)');
    grad.addColorStop(0.35, 'rgba(255,240,190,0.5)');
    grad.addColorStop(1, 'rgba(255,240,190,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(glowCanvas);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true });
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(sunDir).multiplyScalar(90);
    glow.scale.set(60, 60, 1);
    glow.renderOrder = -99;
    scene.add(glow);

    // ── Lights ──
    scene.add(new THREE.AmbientLight(0xbfe0c2, 0.7));
    scene.add(new THREE.HemisphereLight(0xbfe4f7, 0x6f9a54, 0.85));
    const sun = new THREE.DirectionalLight(0xffeebf, 2.6);
    sun.position.copy(sunDir).multiplyScalar(40);
    scene.add(sun);

    // ── Ground — bright low-poly grass with gentle undulation ──
    const groundGeo = new THREE.PlaneGeometry(180, 180, 40, 40);
    groundGeo.rotateX(-Math.PI / 2);
    const gp = groundGeo.getAttribute('position');
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i);
      gp.setY(i, Math.sin(x * 0.12) * 0.35 + Math.cos(z * 0.1) * 0.3);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x54c327, roughness: 0.95, metalness: 0, flatShading: true });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.2;
    scene.add(ground);

    // ── Low-poly pine (trunk + 3 tapered tiers), merged, instanced ──
    const buildPine = (): THREE.BufferGeometry => {
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.16, 0.28, 1.6, 6);
      trunk.translate(0, 0.8, 0);
      parts.push(trunk);
      const tiers = [
        { r: 1.5, hgt: 2.0, y: 1.7 },
        { r: 1.15, hgt: 1.8, y: 2.9 },
        { r: 0.8, hgt: 1.6, y: 4.0 },
      ];
      for (const t of tiers) {
        const cone = new THREE.ConeGeometry(t.r, t.hgt, 8);
        cone.translate(0, t.y, 0);
        parts.push(cone);
      }
      const merged = mergeGeometries(parts, false)!;
      parts.forEach((p) => p.dispose());
      // Vertex colors: brown trunk band, two-tone green canopy by height.
      const pos = merged.getAttribute('position');
      const colors = new Float32Array(pos.count * 3);
      const trunkCol = new THREE.Color(0x7d5940);
      const low = new THREE.Color(0x2f8a3a);
      const high = new THREE.Color(0x74d15a);
      const tmp = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < 1.55) tmp.copy(trunkCol);
        else tmp.copy(low).lerp(high, THREE.MathUtils.clamp((y - 1.6) / 3.0, 0, 1));
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      }
      merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return merged;
    };

    const pineGeo = buildPine();
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, flatShading: true });
    const TREES = 26;
    const pines = new THREE.InstancedMesh(pineGeo, pineMat, TREES);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let placed = 0;
    // Ring the clearing: keep the near-centre open so buttons sit over grass.
    const rng = mulberry32(20260720);
    for (let i = 0; i < TREES; i++) {
      const angle = (i / TREES) * Math.PI * 2 + rng() * 0.4;
      const radius = 11 + rng() * 16;
      const x = Math.cos(angle) * radius * 1.4;
      const z = -6 - Math.abs(Math.sin(angle)) * radius - rng() * 6;
      if (z > 2) continue; // never in front of camera
      const s = 0.85 + rng() * 0.9;
      dummy.position.set(x, -0.2, z);
      dummy.rotation.y = rng() * Math.PI * 2;
      dummy.scale.set(s, s * (0.9 + rng() * 0.3), s);
      dummy.updateMatrix();
      pines.setMatrixAt(placed, dummy.matrix);
      // Gentle near-white modulation only (multiplies the vertex colours) so
      // per-tree variety never muddies the brown trunk into green.
      tint.setHSL(0.27 + rng() * 0.06, 0.25, 0.86 + rng() * 0.1);
      pines.setColorAt(placed, tint);
      placed++;
    }
    pines.count = placed;
    pines.instanceMatrix.needsUpdate = true;
    if (pines.instanceColor) pines.instanceColor.needsUpdate = true;
    scene.add(pines);

    // ── A few grey boulders on the grass ──
    const rockGeo = new THREE.IcosahedronGeometry(0.55, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xaab4b8, roughness: 1, metalness: 0, flatShading: true });
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 7);
    for (let i = 0; i < 7; i++) {
      const x = (rng() - 0.5) * 16;
      const z = -1 - rng() * 9;
      const s = 0.5 + rng() * 0.9;
      dummy.position.set(x, -0.35, z);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.set(s, s * 0.8, s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    scene.add(rocks);

    // ── Resize ──
    const ro = new ResizeObserver(() => {
      const s = sizeOf();
      w = s.w; h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    ro.observe(canvas);

    // ── Render loop — gentle sway, throttled to ~30fps ──
    let raf = 0;
    let running = true;
    let last = 0;
    const clock = new THREE.Clock();
    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return; // ~30fps
      last = now;
      const t = clock.getElapsedTime();
      camera.position.x = camBase.x + Math.sin(t * 0.18) * 1.6;
      camera.position.y = camBase.y + Math.sin(t * 0.13) * 0.35;
      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    // Pause when tab hidden (battery)
    const onVis = () => { running = !document.hidden; if (running) { last = 0; raf = requestAnimationFrame(frame); } };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      pineGeo.dispose(); pineMat.dispose();
      rockGeo.dispose(); rockMat.dispose();
      groundGeo.dispose(); groundMat.dispose();
      skyGeo.dispose(); skyMat.dispose();
      glowTex.dispose(); glowMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden>
      {/* CSS fallback if WebGL is unavailable */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(#69b7e6 0%, #a9dcf3 42%, #6ede2f 58%, #3ba516 100%)' }} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: 'block' }} />
    </div>
  );
};

// Tiny deterministic PRNG so the tree layout is stable across renders.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default HudForestScene3D;
