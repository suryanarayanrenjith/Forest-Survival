import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { MAP_CONFIGS, getRandomMap, type MapType } from '../utils/MapSystem';

interface ClassicMenuProps {
  onStartGame: (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType) => void;
  onBack: () => void;
  t: (key: string) => string;
}

const ClassicMenu = ({ onStartGame, onBack }: ClassicMenuProps) => {
  const [selectedDifficulty, setSelectedDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>('dense_forest');
  const [isRandomMode, setIsRandomMode] = useState(false);
  const [showMapSelector, setShowMapSelector] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Same forest scene as main menu
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
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Background Canvas - Fixed position so it doesn't scroll */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ display: 'block', zIndex: 0 }}
      />

      {/* Dark overlay for readability - Fixed */}
      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/50 z-[1] pointer-events-none" />

      {/* Back Button - Fixed position */}
      <button
        onClick={onBack}
        className="group fixed top-3 sm:top-5 left-3 sm:left-5 z-50 overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm group-hover:bg-black/60 transition-colors duration-300" />
        <div className="absolute inset-0 rounded-lg sm:rounded-xl border border-gray-500/40 group-hover:border-gray-400/60 transition-colors duration-300" />
        <div className="relative px-4 sm:px-6 py-2 sm:py-2.5 flex items-center gap-2">
          <span className="text-lg group-hover:-translate-x-1 transition-transform duration-300">←</span>
          <span className="text-sm sm:text-base font-semibold text-gray-300 group-hover:text-white transition-colors duration-300">Back</span>
        </div>
      </button>

      {/* Scrollable Menu Content */}
      <div className="relative z-20 h-screen overflow-y-auto overflow-x-hidden">
        <div className="flex flex-col items-center px-3 sm:px-4 pt-16 sm:pt-20 pb-32 sm:pb-40">
          {/* Title Section */}
          <div className="relative mb-4 sm:mb-8">
            {/* Title glow */}
            <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-green-500/30 via-emerald-400/20 to-green-500/30 scale-150" />

            {/* Subtitle */}
            <p
              className="relative text-xs sm:text-sm tracking-[0.2em] text-green-400/80 text-center mb-1 sm:mb-2 font-semibold uppercase"
              style={{ textShadow: '0 0 20px rgba(34, 197, 94, 0.5)' }}
            >
              Solo Survival
            </p>

            {/* Main Title */}
            <h1
              className="relative text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-center"
              style={{
                background: 'linear-gradient(135deg, #86efac 0%, #4ade80 25%, #22c55e 50%, #86efac 75%, #bbf7d0 100%)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(34, 197, 94, 0.4))',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                letterSpacing: '0.02em',
              }}
            >
              CLASSIC MODE
            </h1>

            {/* Decorative line */}
            <div className="flex items-center justify-center gap-2 mt-2 sm:mt-3">
              <div className="h-[1px] w-8 sm:w-16 bg-gradient-to-r from-transparent to-green-500/50" />
              <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
              <div className="h-[1px] w-8 sm:w-16 bg-gradient-to-l from-transparent to-green-500/50" />
            </div>
          </div>

          {/* Settings Container */}
          <div className="space-y-3 sm:space-y-4 max-w-2xl w-full mb-4 sm:mb-6">
          {/* Random Mode - Featured Option */}
          <div
            className="relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-500"
            style={{
              background: isRandomMode
                ? 'linear-gradient(135deg, rgba(147,51,234,0.3) 0%, rgba(219,39,119,0.3) 50%, rgba(6,182,212,0.3) 100%)'
                : 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)',
              backdropFilter: 'blur(12px)',
              border: isRandomMode ? '2px solid rgba(168,85,247,0.6)' : '1px solid rgba(168,85,247,0.3)',
              boxShadow: isRandomMode ? '0 0 40px rgba(168,85,247,0.3)' : 'none',
            }}
          >
            <div className="p-3 sm:p-4">
              <button
                onClick={() => {
                  setIsRandomMode(!isRandomMode);
                  if (!isRandomMode) {
                    setSelectedDifficulty('adaptive');
                  } else {
                    setSelectedDifficulty('medium');
                  }
                }}
                className="group w-full relative overflow-hidden rounded-lg sm:rounded-xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
              >
                <div className={`absolute inset-0 ${isRandomMode ? 'bg-gradient-to-r from-purple-600/90 via-pink-600/90 to-cyan-600/90' : 'bg-gradient-to-r from-purple-900/60 to-pink-900/60 group-hover:from-purple-800/70 group-hover:to-pink-800/70'} transition-all duration-300`} />
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                <div className={`absolute inset-0 rounded-lg sm:rounded-xl border ${isRandomMode ? 'border-white/40' : 'border-purple-500/40 group-hover:border-purple-400/60'} transition-colors duration-300`} />

                <div className="relative py-3 sm:py-4 px-3 sm:px-5 flex items-center gap-3 sm:gap-4">
                  <span className="text-2xl sm:text-3xl flex-shrink-0" style={{ animation: isRandomMode ? 'spin-slow 3s linear infinite' : 'none' }}>🎲</span>
                  <div className="text-left flex-1 min-w-0">
                    <div className="text-sm sm:text-xl font-black text-white">RANDOM MODE</div>
                    <div className="text-[10px] sm:text-sm text-purple-200/80 truncate">
                      {isRandomMode ? 'Dynamic difficulty + Random atmosphere!' : 'Click to enable the ultimate challenge!'}
                    </div>
                  </div>
                  <span className="text-xl sm:text-2xl flex-shrink-0" style={{ animation: isRandomMode ? 'pulse 1s ease-in-out infinite' : 'none' }}>{isRandomMode ? '✨' : '→'}</span>
                </div>
              </button>

              {isRandomMode && (
                <div className="mt-3 text-center text-xs sm:text-sm text-purple-200 bg-purple-900/40 rounded-lg p-2 sm:p-3 border border-purple-500/30">
                  <span className="font-bold">AI-Powered:</span> Difficulty adapts to your skill level in real-time!
                </div>
              )}
            </div>
          </div>

          {/* Difficulty Selection */}
          <div
            className={`relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${isRandomMode ? 'opacity-40 pointer-events-none' : ''}`}
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(251,146,60,0.3)',
            }}
          >
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-orange-500/20">
              <h2 className="text-sm sm:text-lg font-bold text-orange-400 flex items-center justify-center gap-2">
                <span className="text-base sm:text-xl">⚔️</span>
                <span>DIFFICULTY</span>
              </h2>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { key: 'easy', icon: '😊', label: 'EASY', desc: 'Casual', color: 'green' },
                { key: 'medium', icon: '😐', label: 'MEDIUM', desc: 'Balanced', color: 'orange' },
                { key: 'hard', icon: '😈', label: 'HARD', desc: 'Nightmare', color: 'red' },
                { key: 'adaptive', icon: '🤖', label: 'ADAPTIVE', desc: 'AI-Powered', color: 'cyan' },
              ].map(({ key, icon, label, desc, color }) => (
                <button
                  key={key}
                  onClick={() => { setSelectedDifficulty(key as 'easy' | 'medium' | 'hard' | 'adaptive'); setIsRandomMode(false); }}
                  className={`relative rounded-lg sm:rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] ${selectedDifficulty === key && !isRandomMode ? 'scale-[1.02]' : ''}`}
                  style={{
                    background: selectedDifficulty === key && !isRandomMode
                      ? `linear-gradient(135deg, var(--tw-gradient-from) 0%, var(--tw-gradient-to) 100%)`
                      : 'rgba(0,0,0,0.3)',
                    boxShadow: selectedDifficulty === key && !isRandomMode ? `0 0 20px rgba(var(--shadow-color), 0.4)` : 'none',
                    ['--tw-gradient-from' as string]: color === 'green' ? 'rgb(22,163,74)' : color === 'orange' ? 'rgb(234,88,12)' : color === 'red' ? 'rgb(220,38,38)' : 'rgb(6,182,212)',
                    ['--tw-gradient-to' as string]: color === 'green' ? 'rgb(34,197,94)' : color === 'orange' ? 'rgb(251,146,60)' : color === 'red' ? 'rgb(239,68,68)' : 'rgb(34,211,238)',
                    ['--shadow-color' as string]: color === 'green' ? '34,197,94' : color === 'orange' ? '251,146,60' : color === 'red' ? '239,68,68' : '34,211,238',
                    border: selectedDifficulty === key && !isRandomMode
                      ? `2px solid rgba(255,255,255,0.4)`
                      : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="py-2.5 sm:py-3 px-2">
                    <div className="text-lg sm:text-2xl mb-0.5">{icon}</div>
                    <div className={`text-[10px] sm:text-xs font-bold ${selectedDifficulty === key && !isRandomMode ? 'text-white' : 'text-gray-300'}`}>{label}</div>
                    <div className={`text-[9px] sm:text-[10px] ${selectedDifficulty === key && !isRandomMode ? 'text-white/70' : 'text-gray-500'}`}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Atmosphere Mode Selection */}
          <div
            className={`relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${isRandomMode ? 'opacity-40 pointer-events-none' : ''}`}
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(34,211,238,0.3)',
            }}
          >
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-cyan-500/20">
              <h2 className="text-sm sm:text-lg font-bold text-cyan-400 flex items-center justify-center gap-2">
                <span className="text-base sm:text-xl">🎨</span>
                <span>ATMOSPHERE</span>
              </h2>
            </div>
            <div className="p-3 sm:p-4 grid grid-cols-3 gap-2">
              {[
                { key: 'auto', icon: '🌈', label: 'AUTO', desc: 'Dynamic' },
                { key: 'day', icon: '☀️', label: 'DAY', desc: 'Bright' },
                { key: 'night', icon: '🌙', label: 'NIGHT', desc: 'Dark' },
              ].map(({ key, icon, label, desc }) => (
                <button
                  key={key}
                  onClick={() => setSelectedTimeOfDay(key as 'auto' | 'day' | 'night')}
                  className={`relative rounded-lg sm:rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.03] active:scale-[0.98] ${selectedTimeOfDay === key ? 'scale-[1.02]' : ''}`}
                  style={{
                    background: selectedTimeOfDay === key
                      ? key === 'auto' ? 'linear-gradient(135deg, rgb(147,51,234) 0%, rgb(219,39,119) 100%)'
                        : key === 'day' ? 'linear-gradient(135deg, rgb(202,138,4) 0%, rgb(234,179,8) 100%)'
                        : 'linear-gradient(135deg, rgb(67,56,202) 0%, rgb(99,102,241) 100%)'
                      : 'rgba(0,0,0,0.3)',
                    boxShadow: selectedTimeOfDay === key
                      ? key === 'auto' ? '0 0 20px rgba(168,85,247,0.4)'
                        : key === 'day' ? '0 0 20px rgba(234,179,8,0.4)'
                        : '0 0 20px rgba(99,102,241,0.4)'
                      : 'none',
                    border: selectedTimeOfDay === key ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div className="py-3 sm:py-4 px-2">
                    <div className="text-xl sm:text-3xl mb-1">{icon}</div>
                    <div className={`text-xs sm:text-sm font-bold ${selectedTimeOfDay === key ? 'text-white' : 'text-gray-300'}`}>{label}</div>
                    <div className={`text-[9px] sm:text-xs hidden sm:block ${selectedTimeOfDay === key ? 'text-white/70' : 'text-gray-500'}`}>{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Map Selection */}
          <div
            className={`relative rounded-xl sm:rounded-2xl overflow-hidden transition-all duration-300 ${isRandomMode ? 'opacity-40 pointer-events-none' : ''}`}
            style={{
              background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(52,211,153,0.3)',
            }}
          >
            <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-emerald-500/20">
              <h2 className="text-sm sm:text-lg font-bold text-emerald-400 flex items-center justify-center gap-2">
                <span className="text-base sm:text-xl">🗺️</span>
                <span>SELECT MAP</span>
              </h2>
            </div>
            <div className="p-3 sm:p-4">
              {/* Selected Map Preview */}
              <button
                className="w-full group relative rounded-lg sm:rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
                onClick={() => setShowMapSelector(!showMapSelector)}
                style={{
                  background: 'linear-gradient(135deg, rgba(52,211,153,0.15) 0%, rgba(52,211,153,0.05) 100%)',
                  border: '1px solid rgba(52,211,153,0.3)',
                }}
              >
                <div className="p-3 sm:p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
                    <span className="text-2xl sm:text-3xl flex-shrink-0">{MAP_CONFIGS[selectedMap].icon}</span>
                    <div className="min-w-0 text-left">
                      <div className="text-sm sm:text-lg font-bold text-white truncate">{MAP_CONFIGS[selectedMap].name}</div>
                      <div className="text-[10px] sm:text-xs text-emerald-300/70 truncate">{MAP_CONFIGS[selectedMap].description}</div>
                    </div>
                  </div>
                  <span className={`text-lg sm:text-xl text-emerald-400 flex-shrink-0 ml-2 transition-transform duration-200 ${showMapSelector ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </button>

              {/* Map Grid */}
              {showMapSelector && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3" style={{ animation: 'fade-in 0.2s ease-out' }}>
                  {Object.values(MAP_CONFIGS).map((map) => (
                    <button
                      key={map.id}
                      onClick={() => { setSelectedMap(map.id); setShowMapSelector(false); }}
                      className={`relative rounded-lg sm:rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]`}
                      style={{
                        background: selectedMap === map.id
                          ? 'linear-gradient(135deg, rgb(16,185,129) 0%, rgb(52,211,153) 100%)'
                          : 'rgba(0,0,0,0.3)',
                        boxShadow: selectedMap === map.id ? '0 0 15px rgba(52,211,153,0.4)' : 'none',
                        border: selectedMap === map.id ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <div className="py-2.5 sm:py-3 px-2">
                        <div className="text-lg sm:text-2xl mb-0.5">{map.icon}</div>
                        <div className={`text-[9px] sm:text-[10px] font-bold leading-tight ${selectedMap === map.id ? 'text-white' : 'text-gray-400'}`}>{map.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Version inside scrollable content */}
          <p className="mt-4 sm:mt-6 text-gray-600 text-[9px] sm:text-[10px] tracking-wider uppercase">
            Version 7.0 • Classic Mode
          </p>
        </div>
      </div>

      {/* Fixed Start Button at Bottom - Always visible and clickable */}
      <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-8 pb-4 sm:pb-6 px-4 pointer-events-auto">
          <div className="flex flex-col items-center">
            <button
              onClick={() => {
                if (isRandomMode) {
                  const timeOptions: ('day' | 'night' | 'auto')[] = ['day', 'night', 'auto'];
                  const randomTime = timeOptions[Math.floor(Math.random() * timeOptions.length)];
                  const randomMap = getRandomMap();
                  onStartGame('adaptive', randomTime, randomMap);
                } else {
                  onStartGame(selectedDifficulty, selectedTimeOfDay, selectedMap);
                }
              }}
              className="group relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95 min-w-[200px] sm:min-w-[280px]"
            >
              <div className={`absolute inset-0 ${isRandomMode
                ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-600 group-hover:from-purple-500 group-hover:via-pink-500 group-hover:to-cyan-500'
                : 'bg-gradient-to-r from-green-600 via-emerald-600 to-green-600 group-hover:from-green-500 group-hover:via-emerald-500 group-hover:to-green-500'
              } transition-all duration-300`} />
              <div className="absolute inset-0 bg-gradient-to-b from-white/15 to-transparent" />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </div>
              <div className={`absolute inset-0 rounded-xl sm:rounded-2xl border-2 ${isRandomMode ? 'border-purple-400/60 group-hover:border-purple-300/80' : 'border-green-400/60 group-hover:border-green-300/80'} transition-colors duration-300`} />
              <div className="relative px-8 sm:px-14 py-3 sm:py-4 flex items-center justify-center gap-2 sm:gap-3"
                style={{ boxShadow: isRandomMode ? '0 0 40px rgba(168,85,247,0.4)' : '0 0 40px rgba(34,197,94,0.4)' }}
              >
                <span className={`text-xl sm:text-2xl ${isRandomMode ? 'group-hover:animate-spin' : ''}`}>{isRandomMode ? '🎲' : '▶️'}</span>
                <span className="text-base sm:text-xl font-black text-white tracking-wide">
                  {isRandomMode ? 'ROLL THE DICE!' : 'START GAME'}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.2);
          }
          50% {
            box-shadow: 0 0 40px rgba(168, 85, 247, 0.4);
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }

        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default ClassicMenu;
