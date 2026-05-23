import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Swords, Users, GraduationCap, Settings, ChevronRight, Sparkles } from 'lucide-react';
import SettingsMenu from './SettingsMenu';
import CreditsMenu from './CreditsMenu';

interface MainMenuProps {
  onClassicMode: () => void;
  onMultiplayerMode: () => void;
  onTutorialMode: () => void;
  t: (key: string) => string;
}

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode }: MainMenuProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
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

  const modes = [
    {
      key: 'solo',
      icon: Swords,
      title: 'Solo',
      desc: 'Survive endless waves alone',
      accent: 'emerald',
      onClick: onClassicMode,
    },
    {
      key: 'multiplayer',
      icon: Users,
      title: 'Multiplayer',
      desc: 'Co-op & survival with friends',
      accent: 'sky',
      onClick: onMultiplayerMode,
    },
    {
      key: 'tutorial',
      icon: GraduationCap,
      title: 'Tutorial',
      desc: 'Learn the core mechanics',
      accent: 'amber',
      onClick: onTutorialMode,
    },
  ] as const;

  const accentRing: Record<string, string> = {
    emerald: 'group-hover:border-emerald-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.45)]',
    sky: 'group-hover:border-sky-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(56,189,248,0.45)]',
    amber: 'group-hover:border-amber-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(245,158,11,0.45)]',
  };
  const accentIcon: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    amber: 'text-amber-400',
  };
  const accentIconBg: Record<string, string> = {
    emerald: 'bg-emerald-500/10 group-hover:bg-emerald-500/15',
    sky: 'bg-sky-500/10 group-hover:bg-sky-500/15',
    amber: 'bg-amber-500/10 group-hover:bg-amber-500/15',
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#05080a]">
      {/* 3D Background Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Cinematic vignette + readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7) 100%)' }}
      />

      {/* Main Screen */}
      {!showSettings && (
        <div className="relative z-10 min-h-screen overflow-y-auto flex flex-col items-center justify-center px-6 py-10">
          {/* Title */}
          <div className="relative mb-10 sm:mb-14 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-emerald-500/60" />
              <p className="text-[10px] sm:text-xs tracking-[0.45em] text-emerald-400/90 font-semibold uppercase">
                Wave-Based Survival
              </p>
              <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-emerald-500/60" />
            </div>

            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none"
              style={{
                background: 'linear-gradient(180deg, #f0fdf4 0%, #86efac 55%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 4px 24px rgba(34,197,94,0.35))',
              }}
            >
              FOREST<br className="sm:hidden" /> SURVIVAL
            </h1>
          </div>

          {/* Mode Buttons */}
          <div className="flex flex-col gap-3 w-full max-w-md">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.key}
                  onClick={mode.onClick}
                  className="group relative flex items-center gap-4 w-full rounded-2xl px-4 py-4 text-left
                    bg-white/[0.03] border border-white/10 backdrop-blur-md
                    transition-all duration-300 hover:bg-white/[0.06] hover:-translate-y-0.5
                    active:translate-y-0"
                >
                  {/* accent ring on hover */}
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-2xl border border-transparent transition-all duration-300 ${accentRing[mode.accent]}`}
                  />
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors duration-300 ${accentIconBg[mode.accent]}`}
                  >
                    <Icon className={`w-6 h-6 ${accentIcon[mode.accent]}`} strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-lg sm:text-xl font-bold text-white tracking-wide">
                      {mode.title}
                    </span>
                    <span className="block text-xs sm:text-sm text-gray-400 font-medium truncate">
                      {mode.desc}
                    </span>
                  </span>
                  <ChevronRight
                    className="w-5 h-5 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all duration-300"
                    strokeWidth={2}
                  />
                </button>
              );
            })}

            {/* Settings + Credits */}
            <div className="flex items-center justify-center gap-2 mt-1">
              <button
                onClick={() => setShowSettings(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20"
              >
                <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" strokeWidth={2} />
                Settings
              </button>
              <button
                onClick={() => setShowCredits(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-emerald-300 hover:bg-emerald-500/[0.06] hover:border-emerald-400/30"
              >
                <Sparkles
                  className="w-4 h-4 transition-transform duration-500 group-hover:scale-110"
                  strokeWidth={2}
                  fill="currentColor"
                />
                Credits
              </button>
            </div>
          </div>

          {/* Version + author tagline */}
          <div className="mt-10 flex flex-col items-center gap-1.5">
            <p className="text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              Version 1.0
            </p>
            <button
              onClick={() => setShowCredits(true)}
              className="text-[11px] text-gray-500 hover:text-emerald-300 transition-colors"
            >
              vibe-coded by <span className="font-semibold">Surya</span>
            </button>
          </div>
        </div>
      )}

      {/* Settings Menu */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}

      {/* Credits Menu */}
      {showCredits && <CreditsMenu onClose={() => setShowCredits(false)} />}
    </div>
  );
};

export default MainMenu;
