import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import SettingsMenu from './SettingsMenu';

interface MainMenuProps {
  onClassicMode: () => void;
  onMultiplayerMode: () => void;
  onTutorialMode: () => void;
  t: (key: string) => string;
}

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode }: MainMenuProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Minimal rotating forest scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a1f0a, 10, 50);

    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    camera.position.set(0, 8, 20);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a1f0a, 1);

    // Minimal particle stars
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 800;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 80;
      positions[i + 1] = Math.random() * 40;
      positions[i + 2] = (Math.random() - 0.5) * 80;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      size: 0.15,
      color: 0x88ff88,
      transparent: true,
      opacity: 0.6,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Create forest circle
    const forest: THREE.Group[] = [];
    const treeCount = 40;
    const radius = 15;

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 2;
      const tree = new THREE.Group();

      // Trunk
      const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 2.5, 6);
      const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d1810,
        roughness: 0.9,
        flatShading: true,
      });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.castShadow = true;
      tree.add(trunk);

      // Foliage - pyramid style
      const foliageGeometry = new THREE.ConeGeometry(1, 2.5, 6);
      const foliageMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a4d1a,
        roughness: 0.8,
        flatShading: true,
      });
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.y = 2;
      foliage.castShadow = true;
      tree.add(foliage);

      // Position in circle
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      tree.position.set(x, 0, z);
      tree.rotation.y = -angle + Math.PI / 2;

      scene.add(tree);
      forest.push(tree);
    }

    // Ground
    const groundGeometry = new THREE.CircleGeometry(25, 32);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1f0d,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x2d4d2d, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x88ff88, 0.8);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x4d8d4d, 0.3);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Initialize sceneRef first
    sceneRef.current = { scene, camera, renderer, animationId: 0 };

    // Store initial angles for trees
    forest.forEach((tree, i) => {
      tree.userData.angle = (i / treeCount) * Math.PI * 2;
    });

    // Animation with visibility detection for performance
    let time = 0;
    let isVisible = true;

    const handleVisibilityChange = () => {
      isVisible = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = () => {
      if (sceneRef.current) {
        sceneRef.current.animationId = requestAnimationFrame(animate);
      }

      // Skip rendering when tab is not visible (major performance boost)
      if (!isVisible) return;

      time += 0.003;

      // Rotate entire forest
      forest.forEach((tree) => {
        tree.position.x = Math.cos(tree.userData.angle + time) * radius;
        tree.position.z = Math.sin(tree.userData.angle + time) * radius;
        tree.rotation.y = -(tree.userData.angle + time) + Math.PI / 2;
      });

      // Subtle camera sway
      camera.position.x = Math.sin(time * 0.3) * 1;
      camera.position.y = 8 + Math.sin(time * 0.5) * 0.5;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* 3D Background Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50" />

      {/* Main Screen */}
      {!showSettings && (
        <div className="relative z-10 min-h-screen overflow-y-auto">
          <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
            {/* Decorative top glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-green-500/20 blur-[100px] rounded-full pointer-events-none" />

          {/* Title Container with enhanced styling */}
          <div className="relative mb-6 sm:mb-10 lg:mb-14">
            {/* Title glow background */}
            <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-green-500/30 via-emerald-400/20 to-green-500/30 scale-150 animate-pulse" />

            {/* Subtitle */}
            <p
              className="relative text-xs sm:text-sm md:text-base tracking-[0.3em] text-green-400/80 text-center mb-2 sm:mb-3 font-semibold uppercase"
              style={{ textShadow: '0 0 20px rgba(34, 197, 94, 0.5)' }}
            >
              Wave-Based Survival
            </p>

            {/* Main Title */}
            <h1
              className="relative text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black text-center"
              style={{
                background: 'linear-gradient(135deg, #86efac 0%, #4ade80 25%, #22c55e 50%, #86efac 75%, #bbf7d0 100%)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: 'none',
                filter: 'drop-shadow(0 0 30px rgba(34, 197, 94, 0.5)) drop-shadow(0 0 60px rgba(34, 197, 94, 0.3))',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '0.02em',
                animation: 'gradientShift 4s ease infinite',
              }}
            >
              FOREST SURVIVAL
            </h1>

            {/* Decorative line under title */}
            <div className="flex items-center justify-center gap-3 mt-3 sm:mt-4">
              <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-r from-transparent via-green-500/50 to-green-500" />
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
              <div className="h-[2px] w-12 sm:w-20 bg-gradient-to-l from-transparent via-green-500/50 to-green-500" />
            </div>
          </div>

          {/* Main Buttons Container */}
          <div className="flex flex-col gap-3 sm:gap-4 items-center w-full max-w-sm sm:max-w-md px-4">
            {/* Solo Mode Button */}
            <button
              onClick={onClassicMode}
              className="group relative w-full overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* Button background with gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-green-600/80 via-emerald-600/80 to-green-600/80 group-hover:from-green-500/90 group-hover:via-emerald-500/90 group-hover:to-green-500/90 transition-all duration-500" />

              {/* Glass overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

              {/* Animated shine effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>

              {/* Border glow */}
              <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-green-400/60 group-hover:border-green-300/80 group-hover:shadow-[0_0_30px_rgba(34,197,94,0.4)] transition-all duration-300" />

              {/* Content */}
              <div className="relative px-6 sm:px-10 py-4 sm:py-5 flex items-center justify-center gap-3">
                <span className="text-2xl sm:text-3xl group-hover:scale-110 transition-transform duration-300">🎮</span>
                <div className="text-left">
                  <span className="block text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-wide">SOLO</span>
                  <span className="block text-[10px] sm:text-xs text-green-200/80 font-medium">Survive the waves alone</span>
                </div>
              </div>
            </button>

            {/* Multiplayer Button */}
            <button
              onClick={onMultiplayerMode}
              className="group relative w-full overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
            >
              {/* Button background with gradient */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/80 via-cyan-600/80 to-blue-600/80 group-hover:from-blue-500/90 group-hover:via-cyan-500/90 group-hover:to-blue-500/90 transition-all duration-500" />

              {/* Glass overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />

              {/* Animated shine effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>

              {/* Border glow */}
              <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-blue-400/60 group-hover:border-blue-300/80 group-hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all duration-300" />

              {/* Content */}
              <div className="relative px-6 sm:px-10 py-4 sm:py-5 flex items-center justify-center gap-3">
                <span className="text-2xl sm:text-3xl group-hover:scale-110 transition-transform duration-300">👥</span>
                <div className="text-left">
                  <span className="block text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-wide">MULTIPLAYER</span>
                  <span className="block text-[10px] sm:text-xs text-blue-200/80 font-medium">Play with friends online</span>
                </div>
              </div>
            </button>

            {/* Tutorial Button */}
            <button
              onClick={onTutorialMode}
              className="group relative w-full overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-500 hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-amber-600/80 via-yellow-600/80 to-amber-600/80 group-hover:from-amber-500/90 group-hover:via-yellow-500/90 group-hover:to-amber-500/90 transition-all duration-500" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>
              <div className="absolute inset-0 rounded-xl sm:rounded-2xl border-2 border-amber-400/60 group-hover:border-amber-300/80 group-hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] transition-all duration-300" />
              <div className="relative px-6 sm:px-10 py-4 sm:py-5 flex items-center justify-center gap-3">
                <span className="text-2xl sm:text-3xl group-hover:scale-110 transition-transform duration-300">🎯</span>
                <div className="text-left">
                  <span className="block text-xl sm:text-2xl lg:text-3xl font-black text-white tracking-wide">TUTORIAL</span>
                  <span className="block text-[10px] sm:text-xs text-amber-200/80 font-medium">Learn the basics</span>
                </div>
              </div>
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="group relative mt-2 overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-105 active:scale-95"
            >
              {/* Background */}
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm group-hover:bg-black/60 transition-colors duration-300" />

              {/* Border */}
              <div className="absolute inset-0 rounded-lg sm:rounded-xl border border-gray-500/40 group-hover:border-gray-400/60 transition-colors duration-300" />

              {/* Content */}
              <div className="relative px-6 sm:px-10 py-2.5 sm:py-3 flex items-center justify-center gap-2">
                <span className="text-lg sm:text-xl group-hover:rotate-90 transition-transform duration-500">⚙️</span>
                <span className="text-sm sm:text-base font-semibold text-gray-300 group-hover:text-white transition-colors duration-300">Settings</span>
              </div>
            </button>
          </div>

          {/* Version & Credits */}
            <div className="mt-6 sm:mt-8 flex flex-col items-center gap-1">
              <p className="text-gray-500 text-[9px] sm:text-[10px] tracking-wider uppercase">
                Version 1.0
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animation for gradient */}
      <style>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>

      {/* Settings Menu */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default MainMenu;
