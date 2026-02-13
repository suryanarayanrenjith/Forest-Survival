import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GunModel } from './utils/GunModel';
import { MuzzleFlash, BulletTracer, ImpactEffect, BloodSplatter } from './utils/Effects';
import { soundManager } from './utils/SoundManager';
import { gameSettingsManager, type UserSettings } from './utils/GameSettingsManager';
import { AIBehaviorSystem } from './utils/AIBehaviorSystem';
import { EnemyPerception } from './utils/EnemyPerception';
import { AttackSystem } from './utils/AttackSystem';
import { ObstacleAvoidance } from './utils/ObstacleAvoidance';
import { BulletDodging } from './utils/BulletDodging';
import { WeatherSystem } from './utils/WeatherSystem';
import { BiomeSystem } from './utils/BiomeSystem';
import { createSkyDomeMaterial, updateShaderTime } from './utils/Shaders';
import { getMapConfig, DEFAULT_MAP, type MapType } from './utils/MapSystem';
import { MultiplayerManager } from './utils/MultiplayerManager';
import { AbilitySystem } from './utils/AbilitySystem';
import { AchievementSystem } from './utils/AchievementSystem';
import { EnhancedPowerUpSystem } from './utils/EnhancedPowerUps';
import { DayCycleSystem } from './utils/DayCycleSystem';
import HUD from './components/HUD';
import MainMenu from './components/MainMenu';
import ClassicMenu from './components/ClassicMenu';
import GameOver from './components/GameOver';
import PauseMenu from './components/PauseMenu';
import Notifications from './components/Notifications';
import MobileWarning from './components/MobileWarning';
import MultiplayerLobby from './components/MultiplayerLobby';
import MultiplayerHUD from './components/MultiplayerHUD';
import MultiplayerGameOver from './components/MultiplayerGameOver';
import SpectateScreen from './components/SpectateScreen';
import ChatSystem from './components/ChatSystem';
import AchievementNotification from './components/AchievementNotification';
import KillFeed, { addKillFeedEntry } from './components/KillFeed';
import HitMarkers, { addHitMarker, addDamageNumber } from './components/HitMarkers';
import ScreenEffects, { triggerDamageFlash, triggerScreenShake } from './components/ScreenEffects';
import ComboDisplay from './components/ComboDisplay';
import { WEAPONS, type Enemy, type Bullet, type PowerUp, type Particle, type TerrainObject, type Keys, type GameState } from './types/game';
import { AdaptiveDifficultySystem } from './utils/AdaptiveDifficultySystem';
import { ProceduralMissionSystem } from './utils/ProceduralMissionSystem';
import { CombatCoachSystem } from './utils/CombatCoachSystem';
import { PredictiveSpawnSystem } from './utils/PredictiveSpawnSystem';
import { SmartSkillTreeSystem } from './utils/SmartSkillTreeSystem';
import { TutorialSystem } from './utils/TutorialSystem';
import { smartEnemyManager, type EnemyType as PooledEnemyType } from './utils/SmartEnemyManager';
import { MissionDisplay } from './components/MissionDisplay';
import { SkillTreeMenu } from './components/SkillTreeMenu';
import { TutorialOverlay, CoachTipsDisplay } from './components/TutorialOverlay';
import { EnhancedSettings, type GameSettings } from './components/EnhancedSettings';
import { StatsGallery } from './components/StatsGallery';
import { ErrorBoundary } from './components/ErrorBoundary';

interface Translations {
  [key: string]: {
    gameTitle: string;
    startGame: string;
    paused: string;
    resume: string;
    health: string;
    ammo: string;
    enemies: string;
    score: string;
    wave: string;
    waveComplete: string;
    nextWave: string;
    gameOver: string;
    youSurvived: string;
    finalScore: string;
    restart: string;
    mainMenu: string;
  };
}

const TRANSLATIONS: Translations = {
  "en-US": {
    "gameTitle": "FOREST SURVIVAL",
    "startGame": "START GAME",
    "paused": "PAUSED",
    "resume": "Press ESC to Resume",
    "health": "Health",
    "ammo": "Ammo",
    "enemies": "Enemies",
    "score": "Score",
    "wave": "Wave",
    "waveComplete": "WAVE COMPLETE!",
    "nextWave": "Next wave incoming...",
    "gameOver": "GAME OVER",
    "youSurvived": "VICTORY!",
    "finalScore": "Final Score",
    "restart": "RESTART",
    "mainMenu": "MAIN MENU"
  }
};

const browserLocale = navigator.languages?.[0] || navigator.language || 'en-US';
const findMatchingLocale = (locale: string): string => {
  if (TRANSLATIONS[locale]) return locale;
  const lang = locale.split('-')[0];
  const match = Object.keys(TRANSLATIONS).find(key => key.startsWith(lang + '-'));
  return match || 'en-US';
};
const locale = findMatchingLocale(browserLocale);
const t = (key: string): string => TRANSLATIONS[locale]?.[key as keyof typeof TRANSLATIONS['en-US']] || TRANSLATIONS['en-US'][key as keyof typeof TRANSLATIONS['en-US']] || key;

const ForestSurvivalGame = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [gameMode, setGameMode] = useState<'none' | 'classic' | 'multiplayer'>('none');
  const [showClassicMenu, setShowClassicMenu] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [classicDifficulty, setClassicDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [classicTimeOfDay, setClassicTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>(DEFAULT_MAP);
  const [isPaused, setIsPaused] = useState(false);
  const [showWaveComplete, setShowWaveComplete] = useState(false);
  const [powerUpMessage, setPowerUpMessage] = useState<string>('');
  const [userSettings, setUserSettings] = useState<UserSettings>(() => gameSettingsManager.getSettings());
  const [currentFPS, setCurrentFPS] = useState(0);

  // Multiplayer state
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [multiplayerManager, setMultiplayerManager] = useState<MultiplayerManager | null>(null);
  const [multiplayerGameOver, setMultiplayerGameOver] = useState(false);
  const [multiplayerWinner, setMultiplayerWinner] = useState<string | null>(null);
  const [multiplayerGameMode, setMultiplayerGameMode] = useState<'coop' | 'survival'>('coop');
  const [isSpectating, setIsSpectating] = useState(false); // Track if local player is eliminated and spectating

  // Achievement system state - using array to support multiple achievements
  const [achievementQueue, setAchievementQueue] = useState<any[]>([]);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // 🤖 AI SYSTEMS STATE
  const [activeMissions, setActiveMissions] = useState<any[]>([]);
  const [coachTips, setCoachTips] = useState<any[]>([]);
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showEnhancedSettings, setShowEnhancedSettings] = useState(false);
  const [showStatsGallery, setShowStatsGallery] = useState(false);

  // Game settings
  const [gameSettings, setGameSettings] = useState<GameSettings>({
    graphicsQuality: 'high',
    shadowQuality: 'medium',
    postProcessing: true,
    particles: true,
    particleDensity: 75,
    viewDistance: 150,
    masterVolume: 80,
    musicVolume: 70,
    sfxVolume: 85,
    difficulty: 'medium',
    showTutorial: true,
    showHints: true,
    showDamageNumbers: true,
    screenShake: true,
    autoReload: false,
    adaptiveDifficulty: true,
    mouseSensitivity: 50,
    invertY: false,
    toggleAim: false,
    showFPS: false,
    showMinimap: true,
    uiScale: 100,
    colorblindMode: 'none'
  });

  // Check for multiplayer session in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lobbyId = params.get('lobby');
    const role = params.get('role');

    if (lobbyId && role) {
      console.log('[App] Detected multiplayer session in URL - lobby:', lobbyId, 'role:', role);
      // Go directly to multiplayer lobby, which will handle the auto-rejoin
      setGameMode('multiplayer');
      setShowMultiplayerLobby(true);
    }
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const isSmallScreen = window.innerWidth < 1024;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      setIsMobile(isMobileDevice || isSmallScreen || isTouchDevice);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync user settings from localStorage
  useEffect(() => {
    const unsubscribe = gameSettingsManager.subscribe((settings) => {
      setUserSettings(settings);
    });

    // Also refresh settings periodically in case localStorage was changed from settings menu
    const interval = setInterval(() => {
      setUserSettings(gameSettingsManager.getSettings());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Set up multiplayer listeners when manager is created
  // NOTE: game_start handler is now registered in MultiplayerLobby.tsx to fix timing issues
  useEffect(() => {
    if (!multiplayerManager) return;

    console.log('[App] Setting up multiplayer game over listener - isHost:', multiplayerManager.isGameHost());

    // Listen for game over
    multiplayerManager.onMessage('game_over', (data: any) => {
      console.log('[App] Received game_over message:', data);
      setMultiplayerWinner(data.winnerId);
      setMultiplayerGameOver(true);
      // Stop all sounds when game is over
      soundManager.mute();
    });

    console.log('[App] Game over listener registered successfully');
  }, [multiplayerManager]);

  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    ammo: 12,
    maxAmmo: 12,
    score: 0,
    enemiesKilled: 0,
    wave: 1,
    isGameOver: false,
    isVictory: false,
    combo: 0,
    killStreak: 0,
    currentWeapon: 'pistol',
    unlockedWeapons: ['pistol']
  });

  useEffect(() => {
    if (!gameStarted) return;

    // Read user settings from localStorage for game configuration
    const currentUserSettings = gameSettingsManager.getSettings();
    const baseFOV = currentUserSettings.fov;
    const sensitivityMultiplier = gameSettingsManager.getSensitivityMultiplier();

    // Determine configuration based on difficulty and mode
    const timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' | 'bloodmoon' = classicTimeOfDay as any;
    const classicSettings = {
      easy: { healthMult: 1.5, speedMult: 1.3, damageMult: 1.5, spawnMult: 1.3, regenRate: 0 },
      medium: { healthMult: 2.5, speedMult: 1.8, damageMult: 2.2, spawnMult: 1.8, regenRate: 0.2 },
      hard: { healthMult: 4.0, speedMult: 2.5, damageMult: 3.5, spawnMult: 2.5, regenRate: 0.5 },
      adaptive: { healthMult: 2.0, speedMult: 1.5, damageMult: 2.0, spawnMult: 1.5, regenRate: 0.1 } // Starts balanced, AI adjusts
    };
    const diffSettings = { ...classicSettings[classicDifficulty], progressive: classicDifficulty === 'adaptive', rampRate: classicDifficulty === 'adaptive' ? 0.05 : 0 };

    // === MULTIPLAYER & ENHANCED SYSTEMS ===
    const isMultiplayer = gameMode === 'multiplayer' && multiplayerManager !== null;

    // Initialize ability system (for all modes)
    const abilitySystem = new AbilitySystem();

    // Initialize achievement system
    const achievementSystem = new AchievementSystem();
    achievementSystem.onUnlock((achievement: any) => {
      console.log('[Achievement] Unlocked:', achievement.name);
      // Add achievement to queue with unique ID
      const achievementWithId = { ...achievement, queueId: Date.now() + Math.random() };
      setAchievementQueue((prev) => [...prev, achievementWithId]);
    });

    // Initialize enhanced power-up system
    const enhancedPowerUps = new EnhancedPowerUpSystem();

    // 1. Adaptive Difficulty System - Balances game dynamically
    // When adaptive mode is selected, start with 'medium' and let the AI adjust
    const baseDifficulty = classicDifficulty === 'adaptive' ? 'medium' : classicDifficulty;
    const adaptiveDifficulty = new AdaptiveDifficultySystem(baseDifficulty);
    // Force enable adaptive AI when random/adaptive mode is selected
    adaptiveDifficulty.setAdaptive(gameSettings.adaptiveDifficulty || classicDifficulty === 'adaptive');

    // 2. Procedural Mission System - Generates unique missions
    const missionSystem = new ProceduralMissionSystem();

    // 3. Combat Coach System - Provides real-time tips
    const combatCoach = new CombatCoachSystem();

    // 4. Predictive Spawn System - Smart enemy spawning
    const spawnSystem = new PredictiveSpawnSystem();

    // 5. Smart Skill Tree - Personalized progression
    const skillTree = new SmartSkillTreeSystem();

    // 6. Tutorial System - Contextual learning
    const tutorial = new TutorialSystem();
    tutorial.setEnabled(gameSettings.showTutorial);
    tutorial.setShowHints(gameSettings.showHints);

    // Start tutorial for new players
    if (gameSettings.showTutorial && !isMultiplayer) {
      tutorial.start();
      setShowTutorial(true);
    }

    // === ADVANCED DAY-NIGHT CYCLE SYSTEM ===
    // Initialize with intelligent auto mode for multiplayer, or user-selected mode for classic
    const actualTimeOfDay = isMultiplayer ? 'auto' : classicTimeOfDay;

    const dayCycleSystem = new DayCycleSystem(12, 1.0); // Start at noon, normal speed

    if (actualTimeOfDay === 'auto') {
      dayCycleSystem.enableAutoCycle(true);
      dayCycleSystem.setCycleSpeed(1.5); // Faster cycle for gameplay
    } else {
      dayCycleSystem.enableAutoCycle(false);
      // Set specific time based on mode (simplified to 3 modes)
      const timeMap: Record<string, number> = {
        'day': 12,    // Noon
        'night': 23   // Late night
      };
      dayCycleSystem.setTime(timeMap[actualTimeOfDay] || 12);
    }

    // Scene setup with dynamic atmosphere
    const scene = new THREE.Scene();

    // Get map configuration for the selected map
    const mapConfig = getMapConfig(selectedMap);
    console.log('[App] Loading map:', selectedMap, '-', mapConfig.name);

    // Get initial atmospheric settings from day cycle system
    let atmosphericSettings = dayCycleSystem.getSettings(actualTimeOfDay);

    // Blend map colors with atmospheric settings for unique map feel
    // Map fog settings override base fog for specific map atmospheres
    const mapFogDensity = 1.0 / ((mapConfig.fogFar - mapConfig.fogNear) / 2);
    const blendedFogDensity = (atmosphericSettings.fogDensity + mapFogDensity) / 2;

    // Use dynamic atmospheric settings blended with map config
    scene.fog = new THREE.FogExp2(
      mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor,
      blendedFogDensity
    );
    scene.background = new THREE.Color(
      mapConfig.hasSpecialWeather ? mapConfig.skyColor : atmosphericSettings.skyColor
    );

    // === GRAPHICS QUALITY SYSTEM ===
    const graphicsPreset = gameSettingsManager.getGraphicsPreset();
    const graphicsQuality = gameSettingsManager.getGraphicsQuality();
    console.log(`[Graphics] Quality: ${graphicsQuality.toUpperCase()} - Pixel Ratio: ${graphicsPreset.pixelRatio}, Shadows: ${graphicsPreset.shadowsEnabled}, Post-Processing: ${graphicsPreset.postProcessing}`);

    // Camera - use FOV from settings, far plane based on view distance
    const camera = new THREE.PerspectiveCamera(baseFOV, window.innerWidth / window.innerHeight, 0.1, graphicsPreset.viewDistance * 5);
    camera.position.set(0, 5, 10);

    // Render resolution based on graphics quality
    const renderWidth = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
    const renderHeight = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);

    const renderer = new THREE.WebGLRenderer({
      antialias: graphicsPreset.antialias, // Based on quality setting
      powerPreference: "high-performance",
      stencil: graphicsPreset.postProcessing,
      depth: true,
      alpha: false,
      logarithmicDepthBuffer: graphicsQuality === 'high' // Only on high for best performance
    });
    renderer.setSize(renderWidth, renderHeight, false);
    renderer.setPixelRatio(1); // Fixed at 1, we handle scaling via renderWidth/Height
    renderer.shadowMap.enabled = graphicsPreset.shadowsEnabled;
    renderer.shadowMap.type = graphicsQuality === 'high' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic tone mapping
    renderer.toneMappingExposure = timeOfDay === 'day' ? 1.0 : 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Style canvas to scale up render to full screen
    if (renderer.domElement) {
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      // Use smooth scaling for higher quality, pixelated for low quality
      if (graphicsQuality === 'low') {
        renderer.domElement.style.imageRendering = 'pixelated';
      } else {
        renderer.domElement.style.imageRendering = 'auto';
      }
    }

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);

      // CRITICAL: Ensure proper focus for keyboard input
      // This is especially important for guests in multiplayer
      renderer.domElement.tabIndex = 0; // Make canvas focusable
      renderer.domElement.style.outline = 'none'; // Remove focus outline
      renderer.domElement.focus(); // Focus immediately

      // Request pointer lock after a short delay to ensure everything is ready
      if (gameMode === 'multiplayer') {
        setTimeout(() => {
          if (renderer.domElement && !document.pointerLockElement) {
            renderer.domElement.requestPointerLock();
            console.log('[App] Auto-requesting pointer lock for multiplayer');
          }
        }, 100);
      }
    }

    // === SMART ENEMY MANAGER INITIALIZATION ===
    // Initialize the enemy pooling and LOD system for optimal performance
    smartEnemyManager.initialize(scene, camera, graphicsPreset);

    // === AAA-QUALITY POST-PROCESSING SYSTEM ===
    const renderTarget1 = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      stencilBuffer: false
    });

    // Enhanced Final Color Grading & Tone Mapping for Stunning Visuals
    const finalShader = {
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        brightness: { value: 1.08 }, // Brighter for better visibility and vibrancy
        contrast: { value: atmosphericSettings.contrast * 1.12 }, // Enhanced contrast for dramatic look
        saturation: { value: atmosphericSettings.saturation * 1.18 }, // More vibrant, stunning colors
        vignette: { value: 0.32 }, // Reduced vignette for clearer view
        vignetteHardness: { value: 0.6 },
        colorTint: { value: atmosphericSettings.colorTint },
        temperature: { value: atmosphericSettings.temperature }
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tBloom;
        uniform float brightness;
        uniform float contrast;
        uniform float saturation;
        uniform float vignette;
        uniform float vignetteHardness;
        uniform vec3 colorTint;
        uniform float temperature;
        varying vec2 vUv;

        vec3 adjustSaturation(vec3 color, float sat) {
          float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
          return mix(vec3(luma), color, sat);
        }

        vec3 adjustTemperature(vec3 color, float temp) {
          return color + vec3(temp, 0.0, -temp) * 0.15;
        }

        vec3 ACESFilm(vec3 x) {
          float a = 2.51;
          float b = 0.03;
          float c = 2.43;
          float d = 0.59;
          float e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }

        void main() {
          vec4 baseColor = texture2D(tDiffuse, vUv);
          vec4 bloomColor = texture2D(tBloom, vUv);

          // Enhanced bloom for more stunning visuals
          vec3 color = baseColor.rgb + bloomColor.rgb * 1.0; // Increased bloom intensity
          color *= brightness;
          color = (color - 0.5) * contrast + 0.5;
          color = adjustSaturation(color, saturation);
          color = adjustTemperature(color, temperature);
          color *= colorTint;
          color = ACESFilm(color);

          vec2 center = vUv - 0.5;
          float dist = length(center);
          float vig = 1.0 - smoothstep(0.0, vignetteHardness, dist * vignette);
          color *= vig;

          gl_FragColor = vec4(color, 1.0);
        }
      `
    };

    const finalMaterial = new THREE.ShaderMaterial(finalShader);

    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finalMaterial);
    const postScene = new THREE.Scene();
    postScene.add(postQuad);
    const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Post-processing material created

    // Check for WebGL errors (with cleanup-safe event handlers)
    const onWebGLContextLost = (event: Event) => {
      event.preventDefault();
      console.error('WebGL context lost!');
    };
    const onWebGLContextRestored = () => {
      // WebGL context restored
      console.log('WebGL context restored!');
    };
    renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);

    // Enhanced RTX-Style Lighting System with Dynamic Day Cycle
    const ambientLight = new THREE.AmbientLight(atmosphericSettings.ambientColor, atmosphericSettings.ambientIntensity * 1.2);
    scene.add(ambientLight);

    // Main directional light (Sun/Moon) with enhanced RTX-like shadows
    const mainLight = new THREE.DirectionalLight(atmosphericSettings.lightColor, atmosphericSettings.lightIntensity * 1.15);
    mainLight.position.set(
      atmosphericSettings.lightPosition.x,
      atmosphericSettings.lightPosition.y,
      atmosphericSettings.lightPosition.z
    );
    mainLight.castShadow = graphicsPreset.shadowsEnabled;

    // Shadow settings based on graphics quality
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = graphicsPreset.viewDistance * 2;
    const shadowRange = graphicsQuality === 'high' ? 150 : graphicsQuality === 'medium' ? 100 : 50;
    mainLight.shadow.camera.left = -shadowRange;
    mainLight.shadow.camera.right = shadowRange;
    mainLight.shadow.camera.top = shadowRange;
    mainLight.shadow.camera.bottom = -shadowRange;
    mainLight.shadow.mapSize.width = graphicsPreset.shadowMapSize;
    mainLight.shadow.mapSize.height = graphicsPreset.shadowMapSize;
    mainLight.shadow.bias = -0.00005;
    mainLight.shadow.radius = graphicsQuality === 'high' ? 1.5 : 1.0; // Soft shadows only on high
    scene.add(mainLight);

    // Hemisphere light for natural sky reflection (dynamic based on atmospheric settings)
    const skyColor = new THREE.Color(atmosphericSettings.skyColor);
    const groundColor = skyColor.clone().multiplyScalar(0.3); // Darker ground reflection
    const skyLight = new THREE.HemisphereLight(
      skyColor.getHex(),
      groundColor.getHex(),
      atmosphericSettings.ambientIntensity * 0.8
    );
    scene.add(skyLight);

    // Volumetric light effect (god rays simulation)
    const volumetricLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffffaa : 0x8899ff,
      atmosphericSettings.sunVisible ? 0.4 : 0.6
    );
    volumetricLight.position.set(
      atmosphericSettings.lightPosition.x * 0.5,
      atmosphericSettings.lightPosition.y * 0.8,
      atmosphericSettings.lightPosition.z * 0.5
    );
    scene.add(volumetricLight);

    // Fill light (opposite side of main light for balanced illumination)
    const fillLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xaaccff : 0x6677aa,
      atmosphericSettings.sunVisible ? 0.3 : 0.5
    );
    fillLight.position.set(
      -atmosphericSettings.lightPosition.x * 0.6,
      atmosphericSettings.lightPosition.y * 0.4,
      -atmosphericSettings.lightPosition.z * 0.6
    );
    scene.add(fillLight);

    // Rim/Back light for dramatic silhouettes
    const rimLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffffff : 0xccddff,
      atmosphericSettings.sunVisible ? 0.5 : 0.8
    );
    rimLight.position.set(
      atmosphericSettings.lightPosition.x * 0.3,
      atmosphericSettings.lightPosition.y * 1.2,
      atmosphericSettings.lightPosition.z
    );
    scene.add(rimLight);

    // Additional ambient fill for better visibility
    if (!atmosphericSettings.sunVisible) {
      const nightFillLight = new THREE.AmbientLight(0x3344aa, 0.4);
      scene.add(nightFillLight);
    }

    // INFINITE LOW-POLY Ground with dynamic day/night and map-specific colors
    const groundGeometry = new THREE.PlaneGeometry(mapConfig.groundSize || 2000, mapConfig.groundSize || 2000, 40, 40);
    // Blend map ground colors with day/night variations
    const isDay = atmosphericSettings.sunVisible;
    const groundBaseColor = isDay ? mapConfig.groundColor : new THREE.Color(mapConfig.groundColor).multiplyScalar(0.5).getHex();
    const groundEmissive = isDay ? mapConfig.groundEmissive : new THREE.Color(mapConfig.groundEmissive).multiplyScalar(0.6).getHex();
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundBaseColor,
      flatShading: true,
      emissive: groundEmissive,
      emissiveIntensity: isDay ? 0.15 : 0.4,
      roughness: 0.85,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;
    scene.add(ground);

    // Subtle ground variation
    const vertices = groundGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] = Math.random() * 0.5 - 0.25;
    }
    groundGeometry.attributes.position.needsUpdate = true;
    groundGeometry.computeVertexNormals();

    // Update ground position to follow camera seamlessly
    const updateGroundPosition = (playerX: number, playerZ: number) => {
      // Keep ground centered under player for infinite world
      ground.position.x = playerX;
      ground.position.z = playerZ;
    };

    // REMOVED grass patches for maximum performance
    // Low-poly aesthetic doesn't need extra details

    // === ADVANCED SKY DOME SYSTEM ===
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyTopColor = new THREE.Color(atmosphericSettings.skyColor);
    const skyHorizonColor = new THREE.Color(atmosphericSettings.fogColor);
    const skyMaterial = createSkyDomeMaterial(
      skyTopColor,
      skyHorizonColor,
      new THREE.Vector3(
        atmosphericSettings.lightPosition.x,
        atmosphericSettings.lightPosition.y,
        atmosphericSettings.lightPosition.z
      ),
      !atmosphericSettings.sunVisible
    );
    const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(skyDome);

    // === WEATHER SYSTEM ===
    const weatherSystem = new WeatherSystem(scene, camera);
    // Disable weather system as it causes lag and annoying visual effects
    weatherSystem.setWeather('clear');

    // === BIOME SYSTEM ===
    const biomeSystem = new BiomeSystem(scene);

    // DYNAMIC INFINITE WORLD GENERATION with Enhanced Terrain
    const terrainObjects: TerrainObject[] = [];
    const waterBodies: THREE.Mesh[] = [];
    const CHUNK_SIZE = 100;
    const loadedChunks = new Set<string>();

    // Old terrain generation functions removed - now using BiomeSystem

    const generateChunk = (chunkX: number, chunkZ: number) => {
      const chunkKey = `${chunkX},${chunkZ}`;
      if (loadedChunks.has(chunkKey)) return;

      loadedChunks.add(chunkKey);
      const startX = chunkX * CHUNK_SIZE;
      const startZ = chunkZ * CHUNK_SIZE;

      // Determine biome for this chunk - use map's primary biome or natural biome
      const centerX = startX + CHUNK_SIZE / 2;
      const centerZ = startZ + CHUNK_SIZE / 2;
      // Use map's primary biome to override natural biome generation for consistent map feel
      const biome = mapConfig.primaryBiome || biomeSystem.getBiomeAt(centerX, centerZ);
      const biomeConfig = biomeSystem.getBiomeConfig(biome);

      // Apply map-specific density multipliers
      const treeDensityMult = mapConfig.treeDensityMult || 1.0;
      const rockDensityMult = mapConfig.rockDensityMult || 1.0;
      const bushDensityMult = mapConfig.bushDensityMult || 1.0;

      // Generate trees based on biome density * map multiplier
      const treesInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.treeDensity * treeDensityMult / 100);
      for (let i = 0; i < treesInChunk; i++) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        const tree = biomeSystem.createTree(x, z, biome);
        terrainObjects.push(tree);
        scene.add(tree.mesh);
      }

      // Generate rocks based on biome density * map multiplier
      const rocksInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.rockDensity * rockDensityMult / 100);
      for (let i = 0; i < rocksInChunk; i++) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        const rock = biomeSystem.createRock(x, z, biome);
        terrainObjects.push(rock);
        scene.add(rock.mesh);
      }

      // Generate occasional boulders (more common in rocky maps)
      if (Math.random() > (0.7 / rockDensityMult)) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        const boulder = biomeSystem.createBoulder(x, z, biome);
        terrainObjects.push(boulder);
        scene.add(boulder.mesh);
      }

      // Generate bushes based on biome density * map multiplier
      const bushesInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.bushDensity * bushDensityMult / 100);
      for (let i = 0; i < bushesInChunk; i++) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        const bush = biomeSystem.createBush(x, z, biome);
        terrainObjects.push(bush);
        scene.add(bush.mesh);
      }

      // Generate special biome features (water, cacti, etc.)
      const specialFeaturesCount = Math.floor(Math.random() * 3);
      for (let i = 0; i < specialFeaturesCount; i++) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        const specialFeature = biomeSystem.createSpecialFeature(x, z, biome);
        if (specialFeature) {
          terrainObjects.push(specialFeature);
          scene.add(specialFeature.mesh);
          if (specialFeature.type === 'water' && specialFeature.mesh instanceof THREE.Mesh) {
            waterBodies.push(specialFeature.mesh);
          }
        }
      }

      // Update ground color based on biome in this area
      biomeSystem.updateGroundMaterial(ground, biome);
    };

    const updateWorldGeneration = (playerX: number, playerZ: number) => {
      const chunkX = Math.floor(playerX / CHUNK_SIZE);
      const chunkZ = Math.floor(playerZ / CHUNK_SIZE);

      // Load chunks around player (3x3 grid)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          generateChunk(chunkX + dx, chunkZ + dz);
        }
      }

      // Remove distant terrain objects to save memory
      for (let i = terrainObjects.length - 1; i >= 0; i--) {
        const obj = terrainObjects[i];
        const distance = Math.sqrt(
          Math.pow(obj.x - playerX, 2) + Math.pow(obj.z - playerZ, 2)
        );
        if (distance > CHUNK_SIZE * 4) {
          scene.remove(obj.mesh);
          terrainObjects.splice(i, 1);
        }
      }
    };

    // Collision detection helper
    const checkTerrainCollision = (newX: number, newZ: number, playerY = 0): boolean => {
      for (const obj of terrainObjects) {
        if (!obj.collidable) continue;
        // If the player is above the object's height, skip collision (jump over)
        if (obj.height !== undefined && playerY > obj.height) continue;
        const dx = newX - obj.x;
        const dz = newZ - obj.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < obj.radius) {
          return true; // Collision detected
        }
      }
      return false;
    };

    // Initial world generation
    generateChunk(0, 0);
    generateChunk(0, 1);
    generateChunk(1, 0);
    generateChunk(1, 1);
    generateChunk(-1, 0);
    generateChunk(0, -1);
    generateChunk(-1, -1);

    // Gun Model - CRITICAL FIX
    const gunModel = new GunModel('pistol');
    camera.add(gunModel.group);
    scene.add(camera);

    // Add gun light
    const gunLight = new THREE.PointLight(0xffffff, 0, 5);
    gunLight.position.set(0.3, -0.3, -0.5);
    camera.add(gunLight);

    // PLAYER BODY FOR SHADOW (uses shadow-only material technique)
    // Only create player shadow if graphics preset enables it
    let playerShadowBody: THREE.Group | null = null;
    let shadowRightArm: THREE.Mesh | null = null;
    let shadowGunGroup: THREE.Group | null = null;

    if (graphicsPreset.playerShadow && graphicsPreset.shadowsEnabled) {
      // Shadow-only material - renders as black for shadow map but doesn't appear in view
      const shadowOnlyMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.DoubleSide,
        colorWrite: false, // Doesn't write to color buffer
        depthWrite: true,  // Still writes to depth for shadow calculation
      });

      playerShadowBody = new THREE.Group();
      playerShadowBody.name = 'playerShadowBody';

      // Player torso (shadow only)
      const shadowTorsoGeo = new THREE.BoxGeometry(0.8, 1.2, 0.4);
      const shadowTorso = new THREE.Mesh(shadowTorsoGeo, shadowOnlyMaterial);
      shadowTorso.position.y = -0.6; // Position relative to camera
      shadowTorso.castShadow = true;
      playerShadowBody.add(shadowTorso);

      // Player shoulders/arms
      const shadowArmGeo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
      const shadowLeftArm = new THREE.Mesh(shadowArmGeo, shadowOnlyMaterial);
      shadowLeftArm.position.set(-0.55, -0.5, 0);
      shadowLeftArm.castShadow = true;
      playerShadowBody.add(shadowLeftArm);

      shadowRightArm = new THREE.Mesh(shadowArmGeo, shadowOnlyMaterial);
      shadowRightArm.position.set(0.55, -0.5, -0.3);
      shadowRightArm.rotation.x = -0.6; // Arm angled forward (holding gun)
      shadowRightArm.rotation.z = -0.2;
      shadowRightArm.castShadow = true;
      playerShadowBody.add(shadowRightArm);

      // === GUN SHADOW - Realistic weapon silhouette ===
      shadowGunGroup = new THREE.Group();
      shadowGunGroup.name = 'gunShadow';

      // Gun body
      const gunBodyGeo = new THREE.BoxGeometry(0.12, 0.15, 0.5);
      const gunBody = new THREE.Mesh(gunBodyGeo, shadowOnlyMaterial);
      gunBody.position.z = -0.35;
      gunBody.castShadow = true;
      shadowGunGroup.add(gunBody);

      // Gun barrel
      const gunBarrelGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.4, 6);
      const gunBarrel = new THREE.Mesh(gunBarrelGeo, shadowOnlyMaterial);
      gunBarrel.rotation.x = Math.PI / 2;
      gunBarrel.position.set(0, 0.02, -0.7);
      gunBarrel.castShadow = true;
      shadowGunGroup.add(gunBarrel);

      // Gun grip
      const gunGripGeo = new THREE.BoxGeometry(0.08, 0.2, 0.1);
      const gunGrip = new THREE.Mesh(gunGripGeo, shadowOnlyMaterial);
      gunGrip.position.set(0, -0.12, -0.2);
      gunGrip.rotation.x = 0.2;
      gunGrip.castShadow = true;
      shadowGunGroup.add(gunGrip);

      // Position gun relative to right arm
      shadowGunGroup.position.set(0.5, -0.3, -0.5);
      shadowGunGroup.rotation.x = -0.4;
      playerShadowBody.add(shadowGunGroup);

      // Player legs
      const shadowLegGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
      const shadowLeftLeg = new THREE.Mesh(shadowLegGeo, shadowOnlyMaterial);
      shadowLeftLeg.position.set(-0.2, -1.7, 0);
      shadowLeftLeg.castShadow = true;
      playerShadowBody.add(shadowLeftLeg);

      const shadowRightLeg = new THREE.Mesh(shadowLegGeo, shadowOnlyMaterial);
      shadowRightLeg.position.set(0.2, -1.7, 0);
      shadowRightLeg.castShadow = true;
      playerShadowBody.add(shadowRightLeg);

      // Player head (for shadow)
      const shadowHeadGeo = new THREE.SphereGeometry(0.25, 8, 6);
      const shadowHead = new THREE.Mesh(shadowHeadGeo, shadowOnlyMaterial);
      shadowHead.position.y = 0.3;
      shadowHead.castShadow = true;
      playerShadowBody.add(shadowHead);

      // Position the shadow body below the camera (at player's feet level)
      playerShadowBody.position.set(0, -1.5, 0);
      camera.add(playerShadowBody);

      console.log('[Graphics] Player shadow with gun enabled');
    }

    // Game state
    let health = 100;
    let ammo = 12;
    let score = 0;
    let enemiesKilled = 0;
    let wave = 1;
    let isGameOver = false;
    let paused = false;
    let combo = 0;
    let killStreak = 0;
    let lastKillTime = 0;
    let startTime = Date.now(); // Track game start time
    let currentWeapon = 'pistol';
    let canShoot = true;
    let isReloading = false;
    let unlockedWeapons = ['pistol'];
    let isAiming = false;
    let timeScale = 1.0; // For slow-mo effects (1.0 = normal speed)

    // Track player velocity for AI prediction
    let playerVelocity = new THREE.Vector3(0, 0, 0);
    let lastPlayerPosition = new THREE.Vector3(0, 5, 10);

    // Check and unlock weapons based on score
    const checkWeaponUnlocks = () => {
      let newUnlock = false;
      Object.keys(WEAPONS).forEach(weaponKey => {
        const weapon = WEAPONS[weaponKey];
        if (score >= weapon.unlockScore && !unlockedWeapons.includes(weaponKey)) {
          unlockedWeapons.push(weaponKey);
          setPowerUpMessage(`🔓 ${weapon.name} Unlocked!`);
          setTimeout(() => setPowerUpMessage(''), 3000);
          newUnlock = true;
        }
      });
      return newUnlock;
    };

    // Effects arrays
    const muzzleFlashes: MuzzleFlash[] = [];
    const bulletTracers: BulletTracer[] = [];
    const impactEffects: ImpactEffect[] = [];
    const bloodSplatters: BloodSplatter[] = [];

    // Camera shake system
    let cameraShakeIntensity = 0;
    let cameraShakeDecay = 0.9;

    // Game objects
    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    const powerUps: PowerUp[] = [];
    const particles: Particle[] = [];

// Create enemy with OPTIMIZED pooled meshes from SmartEnemyManager
    // Returns null if enemy limit reached (adaptive performance management)
    const createEnemy = (x: number, z: number, type: 'normal' | 'fast' | 'tank' | 'boss' = 'normal'): Enemy | null => {
      // === SMART ENEMY MANAGER: Acquire pooled mesh ===
      // This uses shared geometries/materials and object pooling for optimal performance

      // Get the scale for this enemy type (must match SmartEnemyManager ENEMY_CONFIGS)
      const bodyScale = type === 'fast' ? 0.7 : type === 'tank' ? 1.5 : type === 'boss' ? 2.0 : 1.0;
      const position = new THREE.Vector3(x, 1.0 * bodyScale, z);
      const acquiredMesh = smartEnemyManager.acquireMeshForEnemy(type as PooledEnemyType, position);

      // If pool is exhausted or adaptive limit reached, don't spawn
      if (!acquiredMesh) {
        return null;
      }

      // Extract mesh and parts from pooled enemy
      const { mesh: enemyGroup, body: torso, leftArm, rightArm, leftLeg, rightLeg, head, poolId } = acquiredMesh;

      // Get enemy stats based on type (kept for AI calculations)
      let enemyHealth = 50;
      let enemySpeed = 0.08;
      let enemyDamage = 8;
      let enemyScore = 10;

      switch(type) {
        case 'fast':
          enemyHealth = 30;
          enemySpeed = 0.15;
          enemyDamage = 6;
          enemyScore = 15;
          break;
        case 'tank':
          enemyHealth = 150;
          enemySpeed = 0.04;
          enemyDamage = 15;
          enemyScore = 30;
          break;
        case 'boss':
          enemyHealth = 300;
          enemySpeed = 0.05;
          enemyDamage = 25;
          enemyScore = 100;
          break;
      }

      // Wave-based AI advancement
      const dodgeSkill = Math.min(0.1 + (wave * 0.03), 0.85); // 10% to 85% dodge skill
      const reactionTime = Math.max(800 - (wave * 30), 200); // 800ms to 200ms reaction
      const healthMultiplier = 1 + (wave * 0.15); // 15% more health per wave

      // Determine AI personality based on type
      let personality: 'aggressive' | 'tactical' | 'defensive' | 'support' = 'aggressive';
      if (type === 'fast') personality = 'tactical';
      else if (type === 'tank') personality = 'defensive';
      else if (type === 'boss') personality = 'aggressive';

      // Create AI systems
      const aiBehavior = new AIBehaviorSystem(personality);
      const perception = new EnemyPerception(
        500, // Vision range - VERY LARGE so enemies always see player
        Math.PI * 2, // Vision angle - 360 degrees (see all around)
        type === 'boss' ? 100 : 80, // Hearing range
        1.5 // Hearing sensitivity - increased
      );
      const attackSystemInstance = new AttackSystem(
        AttackSystem.createConfigForType(type, enemyDamage * diffSettings.damageMult)
      );

      // NEW: Obstacle avoidance system - prevents getting stuck in trees
      const obstacleAvoidance = new ObstacleAvoidance();
      obstacleAvoidance.setPersonalSpace(type === 'boss' ? 5.0 : 3.0);

      // NEW: Bullet dodging system - makes enemies dodge bullets dynamically
      const bulletDodging = new BulletDodging(dodgeSkill, reactionTime);
      bulletDodging.setDetectionRange(type === 'fast' ? 20 : 15);
      bulletDodging.setDodgeParameters(
        dodgeSkill,
        reactionTime,
        1000 / (1 + wave * 0.1) // Faster cooldown at higher waves
      );

      return {
        mesh: enemyGroup,
        health: enemyHealth * diffSettings.healthMult * healthMultiplier,
        maxHealth: enemyHealth * diffSettings.healthMult * healthMultiplier,
        speed: (enemySpeed + Math.random() * 0.02) * diffSettings.speedMult,
        dead: false,
        type,
        damage: enemyDamage * diffSettings.damageMult,
        scoreValue: enemyScore,
        // Animation state
        walkTime: Math.random() * Math.PI * 2,
        damageFlashTime: 0,
        deathTime: 0,
        leftLeg,
        rightLeg,
        leftArm,
        rightArm,
        torso,
        head,
        // AI state - prevent clumping
        targetPosition: new THREE.Vector3(x, 0, z),
        spreadOffset: new THREE.Vector2(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15
        ),
        lastPathUpdate: 0,
        stuckTimer: 0,
        lastPosition: new THREE.Vector3(x, 0, z),
        behaviorState: 'chase',
        aggroRange: 50 + Math.random() * 20,
        // Advanced AI - scales with wave
        dodgeSkill: dodgeSkill,
        reactionTime: reactionTime,
        lastDodgeTime: 0,
        dodgeCooldown: 1000 / (1 + wave * 0.1), // Faster cooldown at higher waves
        detectedBullets: new Set(),
        // Attack animation
        isAttacking: false,
        attackTime: 0,
        attackCooldown: type === 'fast' ? 800 : type === 'boss' ? 1500 : 1000,
        lastAttackTime: 0,
        // NEW: Advanced AI Systems
        aiBehavior,
        perception,
        attackSystem: attackSystemInstance,
        obstacleAvoidance,
        bulletDodging,
        playerVelocity: new THREE.Vector3(0, 0, 0),
        isDodging: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        // Pool tracking for mesh recycling
        poolId,
      };
    };

    const createPowerUp = (x: number, z: number, type: PowerUp['type']): PowerUp => {
      let color = 0x00ff00;
      let geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1);

      switch(type) {
        case 'health':
          color = 0xff0000; // Red for health
          geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
          break;
        case 'ammo':
          color = 0xffff00; // Yellow for ammo
          geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
          break;
        case 'speed':
          color = 0x00ffff; // Cyan for speed
          geometry = new THREE.ConeGeometry(0.6, 1.2, 4);
          break;
        case 'damage':
          color = 0xff4400; // Orange for damage boost
          geometry = new THREE.OctahedronGeometry(0.6);
          break;
        case 'shield':
          color = 0x0099ff; // Blue for shield
          geometry = new THREE.IcosahedronGeometry(0.5);
          break;
        case 'infinite_ammo':
          color = 0xff00ff; // Magenta for infinite ammo
          geometry = new THREE.TorusGeometry(0.4, 0.15, 8, 16);
          break;
      }

      const material = new THREE.MeshLambertMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.5,
        flatShading: true
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 2, z);
      mesh.castShadow = false;
      scene.add(mesh);

      return {
        mesh,
        type,
        position: new THREE.Vector3(x, 2, z),
        collected: false
      };
    };

    const createParticles = (position: THREE.Vector3, color: number, count: number = 10) => {
      // Scale particle count based on graphics quality
      const scaledCount = Math.max(1, Math.floor(count * graphicsPreset.particleDensity));
      const effect = new ImpactEffect(scene, position, color, scaledCount);
      impactEffects.push(effect);
    };

    // Difficulty settings already defined at top of useEffect

    const spawnWave = () => {
      const baseCount = 5 + wave * 2;
      const enemyCount = Math.floor(baseCount * diffSettings.spawnMult);

      for (let i = 0; i < enemyCount; i++) {
        // Check adaptive enemy limit from SmartEnemyManager
        if (!smartEnemyManager.canSpawnMore()) break;

        const angle = (Math.PI * 2 * i) / enemyCount;
        const distance = 40 + Math.random() * 30;
        const x = Math.cos(angle) * distance + camera.position.x;
        const z = Math.sin(angle) * distance + camera.position.z;

        // Determine enemy type based on wave
        let type: 'normal' | 'fast' | 'tank' | 'boss' = 'normal';
        const rand = Math.random();
        if (wave >= 5 && rand < 0.1) type = 'boss';
        else if (wave >= 3 && rand < 0.3) type = 'tank';
        else if (wave >= 2 && rand < 0.5) type = 'fast';

        const enemy = createEnemy(x, z, type);
        if (enemy) enemies.push(enemy); // Only add if successfully created
      }

      // Spawn power-ups more frequently with weighted spawn chances
      if (wave % 2 === 0) {
        for (let i = 0; i < 2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const distance = 20 + Math.random() * 15;

          // Weighted powerup spawning - common types spawn more frequently
          const roll = Math.random();
          let type: PowerUp['type'];
          if (roll < 0.30) {
            type = 'health';      // 30% chance
          } else if (roll < 0.55) {
            type = 'ammo';        // 25% chance
          } else if (roll < 0.75) {
            type = 'speed';       // 20% chance
          } else if (roll < 0.88) {
            type = 'damage';      // 13% chance - rare
          } else if (roll < 0.96) {
            type = 'shield';      // 8% chance - rare
          } else {
            type = 'infinite_ammo'; // 4% chance - very rare
          }

          powerUps.push(createPowerUp(
            Math.cos(angle) * distance + camera.position.x,
            Math.sin(angle) * distance + camera.position.z,
            type
          ));
        }
      }
    };

    // Continuous enemy spawning
    let lastSpawnTime = Date.now();

    // Determine spawn interval based on difficulty (adaptive uses medium as base, AI system will adjust)
    const getSpawnSettings = () => {
      switch (classicDifficulty) {
        case 'easy': return { interval: 10000, maxEnemies: 25, baseSpawn: 2 };
        case 'medium': return { interval: 7000, maxEnemies: 35, baseSpawn: 3 };
        case 'hard': return { interval: 5000, maxEnemies: 50, baseSpawn: 4 };
        case 'adaptive': return { interval: 8000, maxEnemies: 40, baseSpawn: 3 }; // Balanced start
        default: return { interval: 7000, maxEnemies: 35, baseSpawn: 3 };
      }
    };
    const spawnSettings = getSpawnSettings();
    const spawnInterval = spawnSettings.interval;
    // Note: Max enemies now dynamically managed by SmartEnemyManager

    const continuousSpawn = () => {
      const currentTime = Date.now();

      // Use SmartEnemyManager's adaptive limit instead of static maxEnemies
      const adaptiveMax = smartEnemyManager.getCurrentMaxEnemies();
      if (currentTime - lastSpawnTime > spawnInterval && enemies.length < adaptiveMax && smartEnemyManager.canSpawnMore()) {
        const baseSpawn = spawnSettings.baseSpawn;
        const spawnCount = Math.floor(baseSpawn + Math.random() * 3);

        for (let i = 0; i < spawnCount; i++) {
          // Check adaptive limit on each spawn
          if (!smartEnemyManager.canSpawnMore()) break;

          const angle = Math.random() * Math.PI * 2;
          const distance = 50 + Math.random() * 20;
          const x = Math.cos(angle) * distance + camera.position.x;
          const z = Math.sin(angle) * distance + camera.position.z;

          // Determine enemy type (adaptive uses medium-balanced probabilities)
          let type: 'normal' | 'fast' | 'tank' | 'boss' = 'normal';
          const rand = Math.random();
          const isHardOrAdaptive = classicDifficulty === 'hard' || classicDifficulty === 'adaptive';
          if (wave >= 3 && rand < (isHardOrAdaptive ? 0.12 : 0.05)) type = 'boss';
          else if (wave >= 2 && rand < (isHardOrAdaptive ? 0.30 : 0.2)) type = 'tank';
          else if (rand < (isHardOrAdaptive ? 0.45 : 0.4)) type = 'fast';

          const enemy = createEnemy(x, z, type);
          if (enemy) enemies.push(enemy); // Only add if successfully created
        }
        lastSpawnTime = currentTime;
      }
    };

    spawnWave();

    // Movement
    const keys: Keys = {};
    const moveSpeed = 0.3;
    const sprintMultiplier = 1.8;
    const baseJumpPower = 0.4;
    const gravity = 0.02;

    let velocityY = 0;
    let isJumping = false;
    let jumpCooldown = 0; // Prevents bunny hop spam
    const JUMP_COOLDOWN_TIME = 150; // ms
    let landingImpact = 0; // Camera dip on landing (0 = none, positive = dipping)
    let wasJumping = false; // Track previous frame jump state for landing detection

    // CROUCH SYSTEM
    let isCrouching = false;
    const crouchHeight = 3.5; // Camera height when crouching
    const standingHeight = 5; // Normal standing camera height
    const crouchSpeedMultiplier = 0.5; // Move slower when crouching
    let currentCameraHeight = standingHeight; // For smooth transitions

    // POWERUP EFFECTS TRACKING
    let speedBoostActive = false;
    let speedBoostEndTime = 0;
    const speedBoostMultiplier = 1.75; // 75% speed increase
    const speedBoostDuration = 10000; // 10 seconds

    let damageBoostActive = false;
    let damageBoostEndTime = 0;
    const damageBoostMultiplier = 2.0; // Double damage
    const damageBoostDuration = 15000; // 15 seconds

    let shieldActive = false;
    let shieldHealth = 0;
    const shieldMaxHealth = 50;

    let infiniteAmmoActive = false;
    let infiniteAmmoEndTime = 0;
    const infiniteAmmoDuration = 20000; // 20 seconds

    // DASH ABILITY - Quick burst of speed
    let isDashing = false;
    let dashCooldown = 0;
    const dashCooldownTime = 2.0; // 2 second cooldown
    const dashDuration = 0.15; // 150ms dash
    const dashSpeed = 2.5; // Dash speed multiplier
    let dashTimer = 0;
    let dashDirection = new THREE.Vector3();

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PI_2 = Math.PI / 2;

    const onKeyDown = (e: KeyboardEvent) => {
      // CRITICAL: Always set the key state first to ensure movement works
      // This ensures keys are registered even if later checks fail
      const isMovementKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code);
      if (isMovementKey) {
        keys[e.code] = true;
      }

      if (e.code === 'Escape') {
        // Disable pause in multiplayer mode - check both gameMode and isMultiplayer for reliability
        const inMultiplayerGame = isMultiplayer || gameMode === 'multiplayer';
        if (inMultiplayerGame) {
          return; // Cannot pause in multiplayer
        }

        paused = !paused;
        setIsPaused(paused);
        if (paused) {
          document.exitPointerLock();
        } else {
          renderer.domElement.requestPointerLock();
        }
        return;
      }

      // Set key state for non-movement keys too
      if (!isMovementKey) {
        keys[e.code] = true;
      }

      // DASH - Triggered by Q key (instant dash, separate from ability system)
      if (e.code === 'KeyQ' && !paused && !isDashing && dashCooldown <= 0) {
        isDashing = true;
        dashTimer = dashDuration;
        dashCooldown = dashCooldownTime;

        // Get dash direction based on movement keys or forward if standing still
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();
        const right = new THREE.Vector3();
        right.crossVectors(camera.up, dir).normalize();

        dashDirection.set(0, 0, 0);
        if (keys['KeyW']) dashDirection.add(dir);
        if (keys['KeyS']) dashDirection.sub(dir);
        if (keys['KeyA']) dashDirection.add(right);
        if (keys['KeyD']) dashDirection.sub(right);

        // Default to forward if no movement keys pressed
        if (dashDirection.length() === 0) {
          dashDirection.copy(dir);
        }
        dashDirection.normalize();

        // Play dash sound and trigger effect
        soundManager.play('jump', 0.5);
        if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();

        // Slight time slow for cinematic effect
        timeScale = 0.5;
        setTimeout(() => { timeScale = 1.0; }, 100);
        return; // Don't process other ability actions
      }

      // CROUCH TOGGLE - 'C' key
      if (e.code === 'KeyC' && !paused) {
        isCrouching = !isCrouching;
        soundManager.play('footstep', 0.3);
        return;
      }

      // Ability activation (E, F, V, B for 4 abilities - C is now crouch)
      const abilityKeys: Record<string, number> = {
        'KeyE': 0, // Shield
        'KeyF': 1, // Speed Boost
        'KeyV': 2, // Explosive Shot
        'KeyB': 3  // Heal
      };

      if (abilityKeys[e.code] !== undefined && !paused) {
        const abilityIndex = abilityKeys[e.code];
        const abilities = abilitySystem.getAllAbilities();
        if (abilities[abilityIndex]) {
          const success = abilitySystem.useAbility(abilities[abilityIndex].type);
          if (success) {
            soundManager.play('powerUp', 0.6);
            // Create visual effect
            const effect = abilitySystem.createAbilityEffect(scene, camera.position, abilities[abilityIndex].type);
            scene.add(effect);
            setTimeout(() => scene.remove(effect), 2000);

            // Broadcast ability usage in multiplayer
            if (isMultiplayer && multiplayerManager) {
              // TODO: Add ability sync message type to MultiplayerManager
            }
          }
        }
      }

      // Weapon switching with unlock check
      const weaponKeys: Record<string, string> = {
        'Digit1': 'pistol',
        'Digit2': 'rifle',
        'Digit3': 'shotgun',
        'Digit4': 'smg',
        'Digit5': 'sniper',
        'Digit6': 'minigun',
        'Digit7': 'launcher'
      };

      if (weaponKeys[e.code] && !isReloading) {
        const weaponName = weaponKeys[e.code];
        if (unlockedWeapons.includes(weaponName)) {
          currentWeapon = weaponName;
          ammo = WEAPONS[weaponName].maxAmmo;
          gunModel.switchWeapon(weaponName as any);
          updateGameState();
        } else {
          const weapon = WEAPONS[weaponName];
          setPowerUpMessage(`🔒 ${weapon.name} - Need ${weapon.unlockScore} score`);
          setTimeout(() => setPowerUpMessage(''), 2000);
        }
      }

      if (e.code === 'KeyR' && !isReloading && !paused && ammo < WEAPONS[currentWeapon].maxAmmo) {
        isReloading = true;
        const weapon = WEAPONS[currentWeapon];
        soundManager.play('reload', 0.5);
        gunModel.triggerReload(); // Trigger reload animation
        setTimeout(() => {
          ammo = weapon.maxAmmo;
          isReloading = false;
          updateGameState();
        }, weapon.reloadTime);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const onPointerLockChange = () => {
      // Don't auto-pause in multiplayer mode when losing pointer lock
      // IMPORTANT: isMultiplayer uses multiplayerManager which is more reliable than gameMode state
      const inMultiplayerGame = isMultiplayer || gameMode === 'multiplayer';
      if (!document.pointerLockElement && !paused && !isGameOver && !inMultiplayerGame) {
        paused = true;
        setIsPaused(true);
      }

      // Auto-request pointer lock again in multiplayer if lost
      if (!document.pointerLockElement && inMultiplayerGame && !isGameOver && renderer.domElement) {
        // Request pointer lock again after a short delay
        setTimeout(() => {
          if (!document.pointerLockElement && !isGameOver) {
            renderer.domElement.requestPointerLock();
          }
        }, 200);
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);

    const onCanvasClick = (e: MouseEvent) => {
      // Left click to lock pointer
      if (e.button === 0 && !isGameOver && !paused && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }

      // Ensure canvas has focus for keyboard input (especially important for multiplayer)
      if (renderer.domElement) {
        renderer.domElement.focus();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Right click for aiming (if weapon supports it) or pointer lock
      const weapon = WEAPONS[currentWeapon];
      if (weapon.canAim && document.pointerLockElement === renderer.domElement) {
        // Don't unlock - this is for aiming
        return;
      }

      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      } else if (!isGameOver && !paused) {
        renderer.domElement.requestPointerLock();
      }
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Enhanced shooting
    const shoot = () => {
      if (ammo > 0 && !isGameOver && !paused && canShoot && !isReloading) {
        const weapon = WEAPONS[currentWeapon];
        canShoot = false;
        setTimeout(() => { canShoot = true; }, weapon.fireRate);

        // Only consume ammo if infinite ammo powerup is not active
        if (!infiniteAmmoActive) {
          ammo--;
        }
        gunModel.triggerRecoil();
        updateGameState();

        // 🤖 Record shot for AI systems (will check for hit later)
        combatCoach.recordShot(false, false); // Updated when bullet hits
        tutorial.recordAction('shoot', 1);

        // Play shoot sound
        soundManager.play('shoot', 0.7);

        const bulletsToFire = currentWeapon === 'shotgun' ? 5 : 1;

        // Gun flash
        gunLight.intensity = 5;
        setTimeout(() => { gunLight.intensity = 0; }, 50);

        for (let i = 0; i < bulletsToFire; i++) {
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);

          // Reduce spread when aiming
          const spreadMultiplier = (isAiming && weapon.canAim) ? 0.2 : 1.0;
          direction.x += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.y += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.z += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.normalize();

          const bulletGeometry = new THREE.SphereGeometry(0.1);
          const bulletMaterial = new THREE.MeshBasicMaterial({
            color: weapon.bulletColor
          });
          const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
          bullet.position.copy(camera.position);
          scene.add(bullet);

          // Apply damage boost powerup if active
          const bulletDamage = damageBoostActive ? weapon.damage * damageBoostMultiplier : weapon.damage;

          bullets.push({
            mesh: bullet,
            velocity: direction.multiplyScalar(weapon.bulletSpeed),
            life: 100,
            damage: bulletDamage
          });

          // Bullet tracer
          const tracerEnd = camera.position.clone().add(direction.clone().multiplyScalar(50));
          const tracer = new BulletTracer(scene, camera.position.clone(), tracerEnd, weapon.bulletColor);
          bulletTracers.push(tracer);
        }

        // Muzzle flash at gun position
        const gunWorldPos = new THREE.Vector3();
        gunModel.group.getWorldPosition(gunWorldPos);
        const flash = new MuzzleFlash(scene, gunWorldPos, weapon.bulletColor);
        muzzleFlashes.push(flash);

        // Notify all enemies about gunshot
        for (const enemy of enemies) {
          if (!enemy.dead && enemy.perception) {
            enemy.perception.registerSound(camera.position.clone(), 1.0);
          }
        }

        // WEAPON RECOIL - Visual feedback only (NO camera rotation modifications!)
        // Use gun model animation and screen shake for realistic recoil feel
        const recoilAmount = weapon.name.includes('Minigun') ? 0.012 :
                             weapon.name.includes('Shotgun') ? 0.035 :
                             weapon.name.includes('Sniper') ? 0.045 :
                             weapon.name.includes('Launcher') ? 0.055 :
                             weapon.name.includes('Rifle') ? 0.018 : 0.01;

        // ENHANCED SCREEN SHAKE for recoil feedback
        cameraShakeIntensity = Math.min(cameraShakeIntensity + recoilAmount * 3.5, 0.2);

        // Gun model handles visual recoil animation (no camera tilt!)
      }
    };

    let mouseDown = false;
    let autoFireInterval: number | null = null;

    const onMouseDown = (e: MouseEvent) => {
      // Right mouse button for aiming
      if (e.button === 2 && !paused && !isGameOver) {
        const weapon = WEAPONS[currentWeapon];
        if (weapon.canAim && document.pointerLockElement === renderer.domElement) {
          isAiming = true;
        }
        return;
      }

      if (e.button === 0 && !paused && !isGameOver) {
        mouseDown = true;
        shoot();

        // Start auto-fire for weapons that support it
        const weapon = WEAPONS[currentWeapon];
        if (weapon.autoFire && !autoFireInterval) {
          autoFireInterval = window.setInterval(() => {
            if (mouseDown && !paused && !isGameOver) {
              shoot();
            }
          }, weapon.fireRate);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      // Right mouse button - stop aiming
      if (e.button === 2) {
        isAiming = false;
        return;
      }

      if (e.button === 0) {
        mouseDown = false;

        // Stop auto-fire
        if (autoFireInterval) {
          clearInterval(autoFireInterval);
          autoFireInterval = null;
        }
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    setTimeout(() => {
      if (renderer.domElement && !paused && !isGameOver) {
        renderer.domElement.requestPointerLock();
      }
    }, 200);

    const onMouseMove = (e: MouseEvent) => {
      if (!paused && !isGameOver) {
        if (document.pointerLockElement === renderer.domElement || mouseDown) {
          // CLEAN CAMERA ROTATION - Pure mouse movement with sensitivity from settings
          // This prevents any camera tilt accumulation issues
          euler.setFromQuaternion(camera.quaternion);
          const baseSens = 0.002 * sensitivityMultiplier;
          euler.y -= e.movementX * baseSens;
          euler.x -= e.movementY * baseSens;
          euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
          camera.quaternion.setFromEuler(euler);
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);

    // Mouse wheel weapon switching
    const onMouseWheel = (e: WheelEvent) => {
      if (!paused && !isGameOver) {
        e.preventDefault();

        const weaponKeys = Object.keys(WEAPONS);
        const unlockedKeys = weaponKeys.filter(key => unlockedWeapons.includes(key));
        const currentIndex = unlockedKeys.indexOf(currentWeapon);

        if (e.deltaY > 0) {
          // Scroll down - next weapon
          const nextIndex = (currentIndex + 1) % unlockedKeys.length;
          currentWeapon = unlockedKeys[nextIndex];
        } else if (e.deltaY < 0) {
          // Scroll up - previous weapon
          const prevIndex = (currentIndex - 1 + unlockedKeys.length) % unlockedKeys.length;
          currentWeapon = unlockedKeys[prevIndex];
        }

        // Update weapon
        const weapon = WEAPONS[currentWeapon];
        ammo = weapon.maxAmmo;
        gunModel.switchWeapon(currentWeapon as 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher');
        updateGameState();
        soundManager.play('reload', 0.4);
      }
    };

    document.addEventListener('wheel', onMouseWheel, { passive: false });

    const updateGameState = () => {
      checkWeaponUnlocks();
      setGameState({
        health,
        ammo,
        maxAmmo: WEAPONS[currentWeapon].maxAmmo,
        score,
        enemiesKilled,
        wave,
        isGameOver,
        isVictory: false, // No victory - endless mode
        combo,
        killStreak,
        currentWeapon,
        unlockedWeapons: [...unlockedWeapons]
      });
    };

    const checkCollision = (pos1: THREE.Vector3, pos2: THREE.Vector3, distance: number) => {
      const dx = pos1.x - pos2.x;
      const dz = pos1.z - pos2.z;
      return Math.sqrt(dx * dx + dz * dz) < distance;
    };

    // Game loop
    let animationId: number;
    const clock = new THREE.Clock();
    let frameCount = 0;
    let fpsFrameCount = 0;
    let fpsLastTime = performance.now();

    // Head bob time accumulator - prevents floating point precision issues from Date.now()
    let headBobTime = 0;
    const HEAD_BOB_TIME_RESET = 1000; // Reset every 1000 units to prevent float overflow
    const updateFPS = () => {
      const now = performance.now();
      fpsFrameCount++;
      if (now - fpsLastTime >= 1000) {
        setCurrentFPS(fpsFrameCount);
        fpsFrameCount = 0;
        fpsLastTime = now;
      }
    };

    // Tab visibility detection for performance optimization
    let isTabVisible = true;
    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      // Pause/resume clock when visibility changes to prevent huge delta on return
      if (isTabVisible) {
        clock.getDelta(); // Reset delta to avoid jump
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // === REUSABLE VECTORS FOR PERFORMANCE (avoid allocations in animation loop) ===
    const _moveDirection = new THREE.Vector3();
    const _moveRight = new THREE.Vector3();
    const _tempVec3 = new THREE.Vector3();
    const _tempVec3_2 = new THREE.Vector3();

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Skip expensive updates when tab is not visible (major performance optimization)
      if (!isTabVisible) {
        return;
      }

      const rawDelta = clock.getDelta();
      const delta = rawDelta * timeScale; // Apply slow-mo effect

      // Update FPS counter
      updateFPS();

      // Track frame count
      if (frameCount < 3) {
        frameCount++;
      }

      // === UPDATE ADVANCED GRAPHICS SYSTEMS ===
      // Weather system disabled to improve performance
      // weatherSystem.update(delta, camera.position);

      // Update day-night cycle system
      atmosphericSettings = dayCycleSystem.update(delta);

      // Apply updated atmospheric settings to scene (optimized - update existing fog instead of recreating)
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(atmosphericSettings.fogColor);
        scene.fog.density = atmosphericSettings.fogDensity;
      }
      if (scene.background instanceof THREE.Color) {
        scene.background.setHex(atmosphericSettings.skyColor);
      }

      // Update main light
      mainLight.color.setHex(atmosphericSettings.lightColor);
      mainLight.intensity = atmosphericSettings.lightIntensity;
      mainLight.position.set(
        atmosphericSettings.lightPosition.x,
        atmosphericSettings.lightPosition.y,
        atmosphericSettings.lightPosition.z
      );

      // Update ambient light
      ambientLight.color.setHex(atmosphericSettings.ambientColor);
      ambientLight.intensity = atmosphericSettings.ambientIntensity;

      // Update post-processing uniforms
      finalMaterial.uniforms.contrast.value = atmosphericSettings.contrast;
      finalMaterial.uniforms.saturation.value = atmosphericSettings.saturation;
      finalMaterial.uniforms.colorTint.value = atmosphericSettings.colorTint;
      finalMaterial.uniforms.temperature.value = atmosphericSettings.temperature;

      // Update sky dome shader
      if (skyMaterial.uniforms.time) {
        skyMaterial.uniforms.time.value += delta;
      }

      // === UPDATE ENHANCED SYSTEMS ===
      // Update ability system
      const abilityEffects = abilitySystem.update(delta);

      // Update enhanced power-ups (airdrops)
      enhancedPowerUps.updateAirdrops(delta, scene);

      // 🤖 === UPDATE AI SYSTEMS ===
      // Update adaptive difficulty every 5 seconds
      if (frameCount % 300 === 0 && gameSettings.adaptiveDifficulty) {
        const difficulty = adaptiveDifficulty.update(delta * 300);
        console.log(`[AI] Difficulty: ${difficulty.name} (${Math.round(difficulty.level)})`);
      }

      // Generate missions periodically (every 30 seconds)
      if (frameCount % 1800 === 0) {
        const mission = missionSystem.generateMission({
          playerSkillLevel: adaptiveDifficulty.getSkillLevel().overallScore,
          currentWave: wave,
          killCount: enemiesKilled,
          accuracy: adaptiveDifficulty.getMetrics().accuracyRate,
          currentWeapon,
          availableWeapons: Object.keys(WEAPONS).filter(w => unlockedWeapons.includes(w)),
          availableAbilities: [],
          difficulty: classicDifficulty,
          timeOfDay: actualTimeOfDay,
          biome: biomeSystem.getBiomeAt(camera.position.x, camera.position.z)
        });

        if (mission) {
          setActiveMissions(prev => [...prev, mission]);
        }
      }

      // Get coach tips every 15 seconds
      if (frameCount % 900 === 0 && gameSettings.showHints) {
        const tip = combatCoach.analyzeAndCoach({
          playerHealth: health,
          maxHealth: 100,
          currentWeapon,
          ammo,
          maxAmmo: WEAPONS[currentWeapon].maxAmmo,
          enemiesNearby: enemies.filter(e => !e.dead && e.mesh.position.distanceTo(camera.position) < 20).length,
          enemyTypes: enemies.filter(e => !e.dead).map(e => e.type),
          powerupsNearby: powerUps.length,
          position: {x: camera.position.x, z: camera.position.z},
          abilitiesOnCooldown: [false, false, false],
          recentShots: [],
          timeInGame: (Date.now() - startTime) / 1000
        });

        if (tip) {
          setCoachTips(prev => [...prev, tip]);
          setTimeout(() => {
            setCoachTips(prev => prev.filter(t => t.id !== tip.id));
          }, tip.duration);
        }
      }

      // Update tutorial
      if (tutorial.isActive()) {
        tutorial.getCurrentStep(); // Tutorial system handles step completion internally
      }

      // Update multiplayer (sync player position)
      if (isMultiplayer && multiplayerManager) {
        multiplayerManager.updatePlayerPosition(camera.position, euler);
      }

      // Update water bodies with enhanced shader
      for (const water of waterBodies) {
        if (water.material instanceof THREE.ShaderMaterial) {
          updateShaderTime(water.material, delta);
          if (water.material.uniforms.cameraPosition) {
            water.material.uniforms.cameraPosition.value.copy(camera.position);
          }
        }
      }

      if (isGameOver || paused) {
        // Render paused state (with or without post-processing based on quality)
        if (graphicsPreset.postProcessing) {
          renderer.setRenderTarget(renderTarget1);
          renderer.render(scene, camera);
          postQuad.material = finalMaterial;
          finalMaterial.uniforms.tDiffuse.value = renderTarget1.texture;
          finalMaterial.uniforms.tBloom.value = renderTarget1.texture;
          renderer.setRenderTarget(null);
          renderer.render(postScene, postCamera);
        } else {
          renderer.render(scene, camera);
        }
        return;
      }

      // Update gun animations - recoil handles its own offset
      gunModel.updateRecoil(delta);

      // Aiming zoom effect only (position/rotation handled by gun model)
      if (isAiming && WEAPONS[currentWeapon].canAim) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, 50, delta * 8);
      } else {
        camera.fov = THREE.MathUtils.lerp(camera.fov, baseFOV, delta * 8);
      }
      camera.updateProjectionMatrix();

      // Removed player light update for performance

      // Update dash cooldown
      if (dashCooldown > 0) {
        dashCooldown -= rawDelta; // Use raw delta for real-time cooldown
      }

      // Update dash timer
      if (isDashing) {
        dashTimer -= rawDelta;
        if (dashTimer <= 0) {
          isDashing = false;
        }
      }

      // === UPDATE POWERUP EFFECT TIMERS ===
      const now = Date.now();
      if (speedBoostActive && now >= speedBoostEndTime) {
        speedBoostActive = false;
        setPowerUpMessage('');
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Speed Boost Expired', 'powerup');
      }
      if (damageBoostActive && now >= damageBoostEndTime) {
        damageBoostActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Damage Boost Expired', 'powerup');
      }
      if (infiniteAmmoActive && now >= infiniteAmmoEndTime) {
        infiniteAmmoActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Infinite Ammo Expired', 'powerup');
      }

      // Player movement with weight-based speed and ability effects
      const isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
      const isRunning = (keys['ShiftLeft'] || keys['ShiftRight']) && !isCrouching; // Can't sprint while crouching

      // Calculate speed based on weapon weight and ability effects
      const weaponWeight = WEAPONS[currentWeapon].weight;
      const weightSpeedMultiplier = 1.0 / weaponWeight; // Heavier weapons = slower movement

      // Apply powerup speed boost multiplier
      const powerupSpeedMult = speedBoostActive ? speedBoostMultiplier : 1.0;

      // Apply crouch speed reduction
      const crouchMult = isCrouching ? crouchSpeedMultiplier : 1.0;

      const baseSpeed = moveSpeed * weightSpeedMultiplier * abilityEffects.speedMultiplier * powerupSpeedMult * crouchMult;
      let currentSpeed = isRunning ? baseSpeed * sprintMultiplier : baseSpeed;

      // Apply dash speed if dashing
      if (isDashing) {
        currentSpeed = baseSpeed * dashSpeed;
      }

      // === SMOOTH CROUCH CAMERA HEIGHT TRANSITION ===
      const targetCameraHeight = isCrouching ? crouchHeight : standingHeight;
      currentCameraHeight = THREE.MathUtils.lerp(currentCameraHeight, targetCameraHeight, rawDelta * 12);

      // Update gun sway and bobbing based on movement, then apply all animations
      gunModel.updateIdleSway(delta);
      gunModel.updateWalkBob(delta, isMoving, isRunning && isMoving);
      gunModel.applyAnimations(); // Combine all animation offsets into final transform

      // Reuse vectors instead of allocating new ones each frame
      camera.getWorldDirection(_moveDirection);
      _moveDirection.y = 0;
      _moveDirection.normalize();

      _moveRight.crossVectors(camera.up, _moveDirection).normalize();

      // DASH movement - override normal movement
      if (isDashing) {
        const newX = camera.position.x + dashDirection.x * currentSpeed;
        const newZ = camera.position.z + dashDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }

      // Movement with collision detection (skip if dashing)
      if (!isDashing && (keys['KeyW'] || keys['ArrowUp'])) {
        const newX = camera.position.x + _moveDirection.x * currentSpeed;
        const newZ = camera.position.z + _moveDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && (keys['KeyS'] || keys['ArrowDown'])) {
        const newX = camera.position.x - _moveDirection.x * currentSpeed;
        const newZ = camera.position.z - _moveDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && (keys['KeyA'] || keys['ArrowLeft'])) {
        const newX = camera.position.x + _moveRight.x * currentSpeed;
        const newZ = camera.position.z + _moveRight.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && (keys['KeyD'] || keys['ArrowRight'])) {
        const newX = camera.position.x - _moveRight.x * currentSpeed;
        const newZ = camera.position.z - _moveRight.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }

      // Jump cooldown timer
      if (jumpCooldown > 0) jumpCooldown -= delta * 1000;

      // Jump - weight-based jump height (auto-uncrouch when jumping)
      if (keys['Space'] && !isJumping && jumpCooldown <= 0 && camera.position.y <= currentCameraHeight + 0.1) {
        // Auto-uncrouch when jumping
        if (isCrouching) {
          isCrouching = false;
        }
        const weaponWeight = WEAPONS[currentWeapon].weight;
        // Heavier weapons reduce jump height significantly
        const jumpMultiplier = 1.0 / Math.sqrt(weaponWeight);
        velocityY = baseJumpPower * jumpMultiplier;
        isJumping = true;
        wasJumping = true;
      }

      // Variable jump height: release Space early for short hops
      if (!keys['Space'] && isJumping && velocityY > 0) {
        velocityY *= 0.5; // Cut upward velocity for a short hop
      }

      velocityY -= gravity;
      camera.position.y += velocityY;

      // Use currentCameraHeight (accounts for crouch state)
      if (camera.position.y <= currentCameraHeight) {
        camera.position.y = currentCameraHeight;
        velocityY = 0;
        // Landing impact — trigger camera dip when touching ground after a jump
        if (wasJumping) {
          landingImpact = 0.3; // Start landing dip effect
          jumpCooldown = JUMP_COOLDOWN_TIME; // Anti-bunny-hop cooldown
          wasJumping = false;
        }
        isJumping = false;
      }

      // Landing impact camera dip (quick down-and-back)
      if (landingImpact > 0) {
        const dip = Math.sin(landingImpact * Math.PI) * 0.25; // Sine curve for smooth dip
        camera.position.y -= dip;
        landingImpact -= delta * 4; // Recover over ~0.25s
        if (landingImpact <= 0) landingImpact = 0;
      }

      // Head bob for realistic movement feel - uses stable time accumulator
      // Reduced values for smoother, less distracting motion
      // Crouching has slower, subtler bobbing
      if (isMoving && !isJumping) {
        const bobAmount = isCrouching ? 0.015 : (isRunning ? 0.04 : 0.025);
        const bobSpeed = isCrouching ? 5 : (isRunning ? 10 : 7);

        // Accumulate time using delta (stable, no precision loss)
        headBobTime += rawDelta * bobSpeed;

        // Keep headBobTime bounded to prevent any potential overflow
        if (headBobTime > HEAD_BOB_TIME_RESET) {
          headBobTime -= HEAD_BOB_TIME_RESET;
        }

        // Vertical head bob only - smooth with lerp for professional feel
        const targetY = currentCameraHeight + Math.sin(headBobTime) * bobAmount;
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, rawDelta * 15);
      } else {
        // Smoothly return to camera height when not moving
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, currentCameraHeight, rawDelta * 10);
      }

      // Track player velocity for AI prediction
      playerVelocity.subVectors(camera.position, lastPlayerPosition).divideScalar(delta > 0 ? delta : 0.016);
      lastPlayerPosition.copy(camera.position);

      // Infinite world - update chunks and ground based on player position
      updateWorldGeneration(camera.position.x, camera.position.z);
      updateGroundPosition(camera.position.x, camera.position.z);


      // Continuous enemy spawning
      continuousSpawn();

      // Update effects
      for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
        if (muzzleFlashes[i].update(delta)) {
          muzzleFlashes[i].dispose(scene);
          muzzleFlashes.splice(i, 1);
        }
      }

      for (let i = bulletTracers.length - 1; i >= 0; i--) {
        if (bulletTracers[i].update(delta)) {
          bulletTracers[i].dispose(scene);
          bulletTracers.splice(i, 1);
        }
      }

      for (let i = impactEffects.length - 1; i >= 0; i--) {
        if (impactEffects[i].update(delta)) {
          impactEffects[i].dispose(scene);
          impactEffects.splice(i, 1);
        }
      }

      // Update blood splatters
      for (let i = bloodSplatters.length - 1; i >= 0; i--) {
        if (bloodSplatters[i].update(delta)) {
          bloodSplatters[i].dispose(scene);
          bloodSplatters.splice(i, 1);
        }
      }

      // Apply camera shake effect
      if (cameraShakeIntensity > 0.001) {
        const shakeX = (Math.random() - 0.5) * cameraShakeIntensity;
        const shakeY = (Math.random() - 0.5) * cameraShakeIntensity;
        const shakeZ = (Math.random() - 0.5) * cameraShakeIntensity;

        camera.position.x += shakeX;
        camera.position.y += shakeY;
        camera.position.z += shakeZ;

        cameraShakeIntensity *= cameraShakeDecay; // Decay shake over time
      } else {
        cameraShakeIntensity = 0;
      }

      // Update particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i];
        particle.mesh.position.add(particle.velocity);
        particle.velocity.y -= 0.01;
        particle.life--;

        const opacity = particle.life / particle.maxLife;
        (particle.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
        (particle.mesh.material as THREE.MeshBasicMaterial).transparent = true;

        if (particle.life <= 0) {
          scene.remove(particle.mesh);
          particles.splice(i, 1);
        }
      }

      // Update power-ups
      for (const powerUp of powerUps) {
        if (!powerUp.collected) {
          powerUp.mesh.rotation.y += delta * 2;
          powerUp.mesh.position.y = 2 + Math.sin(Date.now() * 0.003) * 0.3;

          if (checkCollision(camera.position, powerUp.position, 2)) {
            powerUp.collected = true;
            scene.remove(powerUp.mesh);
            soundManager.play('powerUp', 0.8);

            switch(powerUp.type) {
              case 'health':
                health = Math.min(100, health + 30);
                setPowerUpMessage('❤️ +30 Health');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Health Restored', 'powerup');
                // Visual feedback - green flash
                createParticles(camera.position, 0x00ff00, 15);
                break;
              case 'ammo':
                ammo = WEAPONS[currentWeapon].maxAmmo;
                setPowerUpMessage('🔫 Ammo Refilled');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Ammo Refilled', 'powerup');
                // Visual feedback - yellow flash
                createParticles(camera.position, 0xffff00, 10);
                break;
              case 'speed':
                // ACTUALLY APPLY SPEED BOOST
                speedBoostActive = true;
                speedBoostEndTime = Date.now() + speedBoostDuration;
                setPowerUpMessage('⚡ Speed Boost! (10s)');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Speed Boost Active!', 'powerup');
                // Visual feedback - cyan particles
                createParticles(camera.position, 0x00ffff, 20);
                break;
              case 'damage':
                // DAMAGE BOOST - Double damage for 15 seconds
                damageBoostActive = true;
                damageBoostEndTime = Date.now() + damageBoostDuration;
                setPowerUpMessage('💥 Damage Boost! (15s)');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Damage Boost Active!', 'powerup');
                // Visual feedback - orange particles
                createParticles(camera.position, 0xff4400, 20);
                break;
              case 'shield':
                // SHIELD - Absorbs 50 damage
                shieldActive = true;
                shieldHealth = shieldMaxHealth;
                setPowerUpMessage('🛡️ Shield Active! (50 HP)');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Shield Active!', 'powerup');
                // Visual feedback - blue particles
                createParticles(camera.position, 0x0099ff, 25);
                break;
              case 'infinite_ammo':
                // INFINITE AMMO - Unlimited ammo for 20 seconds
                infiniteAmmoActive = true;
                infiniteAmmoEndTime = Date.now() + infiniteAmmoDuration;
                setPowerUpMessage('∞ Infinite Ammo! (20s)');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Infinite Ammo Active!', 'powerup');
                // Visual feedback - magenta particles
                createParticles(camera.position, 0xff00ff, 25);
                break;
            }

            setTimeout(() => setPowerUpMessage(''), 2000);
            updateGameState();
          }
        }
      }

      // Update bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        bullet.mesh.position.add(bullet.velocity);
        bullet.life--;

        if (bullet.life <= 0) {
          scene.remove(bullet.mesh);
          bullets.splice(i, 1);
          continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
          const enemy = enemies[j];
          if (!enemy.dead && checkCollision(bullet.mesh.position, enemy.mesh.position, 2)) {
            // === CRITICAL HIT SYSTEM (HEADSHOTS) ===
            let damage = bullet.damage;
            let isCritical = false;

            // Check if bullet hit the head (upper part of enemy) - reuse temp vector
            _tempVec3.set(
              enemy.mesh.position.x,
              enemy.mesh.position.y + 1.0, // Head is 1 unit above body center
              enemy.mesh.position.z
            );
            const distanceToHead = bullet.mesh.position.distanceTo(_tempVec3);

            if (distanceToHead < 0.8) {
              // HEADSHOT! 2x damage
              damage *= 2;
              isCritical = true;
              soundManager.play('enemyHit', 0.8); // Louder hit sound
              createParticles(_tempVec3, 0xffff00, 8); // Yellow particles for crit
            } else {
              soundManager.play('hit', 0.4);
              createParticles(enemy.mesh.position, 0xff0000, 3);
            }

            enemy.health -= damage;
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);

            // 🤖 Record hit for AI systems
            adaptiveDifficulty.recordShot(true, isCritical);
            adaptiveDifficulty.recordDamage(damage, true);
            combatCoach.recordShot(true, isCritical);

            // Record for missions
            if (isCritical) {
              missionSystem.updateProgress('headshot', 1);
              tutorial.recordAction('headshot', 1);
            }

            // Trigger damage flash animation
            enemy.damageFlashTime = isCritical ? 0.5 : 0.3;

            // Add hit marker and damage number (if enabled in settings)
            if (gameSettingsManager.getSetting('hitMarkers')) {
              addHitMarker(isCritical);
            }

            // Calculate screen position for damage number
            if (gameSettingsManager.getSetting('damageNumbers')) {
              const damagePos = isCritical ? _tempVec3 : enemy.mesh.position;
              _tempVec3_2.copy(damagePos).project(camera);
              const x = (_tempVec3_2.x * 0.5 + 0.5) * 100;
              const y = (-_tempVec3_2.y * 0.5 + 0.5) * 100;
              addDamageNumber(Math.floor(damage), x, y, isCritical, isCritical);
            }

            // BLOOD SPLATTER EFFECT - Realistic hit feedback (reuse temp vector)
            _tempVec3_2.subVectors(enemy.mesh.position, bullet.mesh.position).normalize();
            const blood = new BloodSplatter(
              scene,
              isCritical ? _tempVec3.clone() : enemy.mesh.position.clone(),
              _tempVec3_2,
              isCritical ? 20 : 12 // More particles for crits
            );
            bloodSplatters.push(blood);

            if (enemy.health <= 0) {
              enemy.dead = true;
              enemy.deathTime = 1.0; // Death animation duration
              score += enemy.scoreValue;
              enemiesKilled++;
              soundManager.play('enemyDeath', 0.6);

              // FUN EFFECTS: Screen shake on kill (if enabled in settings)
              if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();

              // FUN EFFECTS: Slow-mo on headshot kills
              if (isCritical) {
                timeScale = 0.3; // Slow motion
                setTimeout(() => { timeScale = 1.0; }, 200); // Return to normal after 200ms real time
              }

              const currentTime = Date.now();
              const killTime = (currentTime - lastKillTime) / 1000;

              if (currentTime - lastKillTime < 2000) {
                combo++;
                killStreak++;
                score += combo * 5;
              } else {
                combo = 1;
              }
              lastKillTime = currentTime;

              // 🤖 Record kill for AI systems
              adaptiveDifficulty.recordKill(killTime);
              spawnSystem.recordKill(enemy.mesh.position, enemy.type);
              combatCoach.recordShot(true, isCritical); // Final confirmation of hit
              missionSystem.updateProgress('elimination', 1);
              if (enemy.type === 'boss') {
                missionSystem.updateProgress('boss_hunt', 1);
              }
              if (killStreak >= 3) {
                missionSystem.updateProgress('streak', 1);
              }
              if (combo >= 3) {
                missionSystem.updateProgress('combo', 1);
              }
              tutorial.recordAction('kill', 1);

              // Award XP to skill tree
              skillTree.awardPoints(0); // Will add proper XP system later

              // Add kill feed entries (if enabled in settings)
              if (gameSettingsManager.getSetting('killFeed')) {
                if (isCritical) {
                  addKillFeedEntry('HEADSHOT!', 'headshot');
                } else {
                  addKillFeedEntry('Enemy Eliminated', 'kill');
                }

                // Add combo notifications
                if (combo >= 5 && combo % 5 === 0) {
                  addKillFeedEntry(`${combo}x COMBO!`, 'combo');
                }

                // Add streak notifications
                if (killStreak === 10) {
                  addKillFeedEntry('10 Kill Streak!', 'combo');
                } else if (killStreak === 20) {
                  addKillFeedEntry('20 Kill Streak!', 'combo');
                } else if (killStreak === 30) {
                  addKillFeedEntry('30 Kill Streak! UNSTOPPABLE!', 'combo');
                }
              }

              createParticles(enemy.mesh.position, 0x00ff00, 8); // Reduced particles

              // === ACHIEVEMENT TRACKING ===
              achievementSystem.updateProgress('first_blood', 1);
              if (enemiesKilled >= 10) achievementSystem.updateProgress('slayer', 1);
              if (enemiesKilled >= 50) achievementSystem.updateProgress('assassin', 1);
              if (enemiesKilled >= 100) achievementSystem.updateProgress('legend', 1);
              if (isCritical) {
                achievementSystem.updateProgress('marksman', 1);
                achievementSystem.updateProgress('ace', 1);
              }
              if (combo >= 5) {
                achievementSystem.updateProgress('perfectionist', 1);
              }

              // === MULTIPLAYER: Broadcast kill ===
              if (isMultiplayer && multiplayerManager) {
                multiplayerManager.incrementKills();
              }

              // === AMMO DROP SYSTEM ===
              // 40% chance to drop ammo on death
              if (Math.random() < 0.4) {
                const ammoDrop = createPowerUp(
                  enemy.mesh.position.x,
                  enemy.mesh.position.z,
                  'ammo'
                );
                powerUps.push(ammoDrop);
              }

              // Don't remove immediately - death animation will handle it

              updateGameState();

              // Check for wave complete - endless mode
              if (enemies.length === 0) {
                wave++;
                combo = 0;
                killStreak = 0;
                setShowWaveComplete(true);
                soundManager.play('waveComplete', 1.0);
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Wave ${wave - 1} Complete!`, 'wave');
                setTimeout(() => {
                  setShowWaveComplete(false);
                  spawnWave();
                }, 3000);
                updateGameState();
              }
            }
            break;
          }
        }
      }

      // === SMART ENEMY MANAGER UPDATE ===
      // Updates LOD, frustum culling, and adaptive enemy limits
      smartEnemyManager.update(delta);

      // === NEW ADVANCED AI SYSTEM ===
      // AI update distance scales with graphics quality for performance
      const MAX_AI_UPDATE_DISTANCE = Math.min(100, graphicsPreset.viewDistance * 0.6);
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        // Death animation (unchanged)
        if (enemy.dead && enemy.deathTime > 0) {
          enemy.deathTime -= delta;
          const deathProgress = 1.0 - (enemy.deathTime / 1.0);

          // Get the base scale for this enemy type (pooled enemies use type-based scaling)
          const baseScale = enemy.type === 'fast' ? 0.7 : enemy.type === 'tank' ? 1.5 : enemy.type === 'boss' ? 2.0 : 1.0;

          // Death animation using rotation and scale (NO material changes - materials are shared!)
          enemy.mesh.rotation.x = deathProgress * Math.PI / 2;
          enemy.mesh.position.y = (1.0 * baseScale) - deathProgress * (1.0 * baseScale);

          // Scale down as enemy dies, multiplied by base scale to maintain relative size
          const deathScale = Math.max(0.01, 1.0 - deathProgress * 0.8) * baseScale;
          enemy.mesh.scale.setScalar(deathScale);

          // Arm/leg animations still work (these are rotations, not material changes)
          if (enemy.leftArm) {
            enemy.leftArm.rotation.z = deathProgress * Math.PI / 3;
            enemy.leftArm.rotation.x = deathProgress * Math.PI / 4;
          }
          if (enemy.rightArm) {
            enemy.rightArm.rotation.z = -deathProgress * Math.PI / 3;
            enemy.rightArm.rotation.x = deathProgress * Math.PI / 4;
          }
          if (enemy.leftLeg) {
            enemy.leftLeg.rotation.x = deathProgress * Math.PI / 6;
          }
          if (enemy.rightLeg) {
            enemy.rightLeg.rotation.x = -deathProgress * Math.PI / 6;
          }

          // NOTE: Do NOT modify materials here - they are SHARED across all enemies!
          // The scale animation provides a visual death effect without affecting other enemies.

          if (enemy.deathTime <= 0) {
            // Release mesh back to pool for reuse (SmartEnemyManager handles scene removal)
            if (enemy.poolId !== undefined) {
              smartEnemyManager.releaseMeshById(enemy.poolId);
            } else {
              // Fallback for enemies not using pool (shouldn't happen in normal operation)
              scene.remove(enemy.mesh);
            }
            enemies.splice(i, 1);
          }
          continue;
        }

        if (enemy.dead) continue;

        // Compute baseScale for ALL living enemies (needed for grounding)
        const baseScale = enemy.type === 'fast' ? 0.7 : enemy.type === 'tank' ? 1.5 : enemy.type === 'boss' ? 2.0 : 1.0;
        const groundY = 1.0 * baseScale;

        // Performance optimization: Skip AI update for distant enemies
        const distance = enemy.mesh.position.distanceTo(camera.position);
        if (distance > MAX_AI_UPDATE_DISTANCE) {
          // Still do basic movement toward player for distant enemies (simpler logic, reuse temp vector)
          _tempVec3.subVectors(camera.position, enemy.mesh.position).normalize();
          enemy.mesh.position.x += _tempVec3.x * (enemy.speed || 2) * delta;
          enemy.mesh.position.z += _tempVec3.z * (enemy.speed || 2) * delta;
          enemy.mesh.position.y = groundY;
          continue;
        }

        // Health regeneration
        if (diffSettings.regenRate > 0 && enemy.health < enemy.maxHealth) {
          enemy.health = Math.min(enemy.maxHealth, enemy.health + diffSettings.regenRate * delta * 10);
        }

        // === PERCEPTION SYSTEM ===
        const perception = enemy.perception?.perceive(
          enemy.mesh.position,
          enemy.mesh.rotation.y,
          camera.position,
          playerVelocity,
          terrainObjects,
          timeOfDay === 'night'
        );

        const canSeePlayer = perception?.canSeePlayer || false;
        const canHearPlayer = perception?.canHearPlayer || false;

        // === AI DECISION MAKING ===
        if (enemy.aiBehavior && perception) {
          const aiDecision = enemy.aiBehavior.makeDecision({
            enemyPosition: enemy.mesh.position,
            enemyRotation: enemy.mesh.rotation.y,
            playerPosition: camera.position,
            playerVelocity: playerVelocity,
            distanceToPlayer: distance,
            health: enemy.health,
            maxHealth: enemy.maxHealth,
            type: enemy.type,
            allEnemies: enemies,
            terrainObjects: terrainObjects,
            canSeePlayer,
            hearPlayerShooting: canHearPlayer,
            timeSinceLastSawPlayer: perception.timeSinceLastSeen,
            isInCover: false
          }, delta);

          // Update target position from AI decision
          enemy.targetPosition.copy(aiDecision.targetPosition);

          // === BULLET DODGING SYSTEM ===
          const currentTime = Date.now();
          if (enemy.bulletDodging) {
            const dodgeResult = enemy.bulletDodging.calculateDodge(
              enemy.mesh.position,
              bullets,
              currentTime
            );

            if (dodgeResult.shouldDodge) {
              // Enemy is dodging! Override target with dodge direction
              enemy.isDodging = true;
              enemy.dodgeDirection = dodgeResult.dodgeDirection.clone();
              // Apply immediate dodge movement (3x normal speed)
              const dodgeTarget = enemy.mesh.position.clone().add(
                dodgeResult.dodgeDirection.multiplyScalar(8)
              );
              enemy.targetPosition.copy(dodgeTarget);
            } else if (enemy.isDodging) {
              // Dodge completed, return to normal AI behavior
              enemy.isDodging = false;
            }
          }

          // === OBSTACLE AVOIDANCE SYSTEM ===
          let finalTargetPosition = enemy.targetPosition.clone();
          if (enemy.obstacleAvoidance) {
            const pathResult = enemy.obstacleAvoidance.calculatePath(
              enemy.mesh.position,
              enemy.targetPosition,
              terrainObjects,
              enemies,
              enemy,
              delta
            );

            // If path is blocked or stuck, use alternative path
            if (!pathResult.canMoveDirectly || pathResult.isStuck) {
              if (pathResult.alternativePath) {
                finalTargetPosition = pathResult.alternativePath;
              }
              // If stuck, reset stuck detection after finding path
              if (pathResult.isStuck) {
                enemy.obstacleAvoidance.resetStuckDetection();
              }
            }

            // Apply personal space avoidance (prevent stacking)
            if (pathResult.avoidanceVector.length() > 0.01) {
              finalTargetPosition.add(pathResult.avoidanceVector.multiplyScalar(2));
            }
          }

          // === MOVEMENT ===
          const isMoving = distance > 2.0 && (!enemy.attackSystem || enemy.attackSystem.canMove());

          if (isMoving) {
            // Smooth walk time increment based on actual movement speed
            const moveSpeedFactor = enemy.isDodging ? 2.5 : (enemy.speed * aiDecision.moveSpeed * 8);
            enemy.walkTime += delta * moveSpeedFactor;

            // === ENHANCED ROBOT ANIMATIONS ===
            const animSpeed = enemy.isDodging ? 2.0 : 1.0;
            const walkPhase = enemy.walkTime * animSpeed;

            // Smooth leg animation with lerp for realistic motion
            if (enemy.leftLeg && enemy.rightLeg) {
              const leftLegTarget = Math.sin(walkPhase) * 0.6;
              const rightLegTarget = Math.sin(walkPhase + Math.PI) * 0.6;
              enemy.leftLeg.rotation.x = THREE.MathUtils.lerp(enemy.leftLeg.rotation.x, leftLegTarget, 0.15);
              enemy.rightLeg.rotation.x = THREE.MathUtils.lerp(enemy.rightLeg.rotation.x, rightLegTarget, 0.15);
            }

            // Arm swing animation (opposite to legs for natural walk)
            if (enemy.leftArm && enemy.rightArm) {
              const leftArmTarget = Math.sin(walkPhase + Math.PI) * 0.4;
              const rightArmTarget = Math.sin(walkPhase) * 0.4;
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, leftArmTarget, 0.12);
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, rightArmTarget, 0.12);
            }

            // Body bob (vertical movement while walking)
            const bodyBob = Math.abs(Math.sin(walkPhase * 2)) * 0.08;
            enemy.mesh.position.y = groundY + bodyBob;

            // Subtle body tilt while moving (lean into movement)
            if (enemy.torso) {
              const tiltAmount = enemy.isDodging ? 0.15 : 0.05;
              enemy.torso.rotation.x = THREE.MathUtils.lerp(enemy.torso.rotation.x, tiltAmount, 0.1);
            }

            // Movement direction
            const moveDirX = finalTargetPosition.x - enemy.mesh.position.x;
            const moveDirZ = finalTargetPosition.z - enemy.mesh.position.z;
            const moveLength = Math.sqrt(moveDirX * moveDirX + moveDirZ * moveDirZ);

            if (moveLength > 0) {
              const normalizedX = moveDirX / moveLength;
              const normalizedZ = moveDirZ / moveLength;

              // Apply speed multiplier (faster when dodging)
              const speedMultiplier = enemy.isDodging ? 3.0 : aiDecision.moveSpeed;
              const newX = enemy.mesh.position.x + normalizedX * enemy.speed * speedMultiplier;
              const newZ = enemy.mesh.position.z + normalizedZ * enemy.speed * speedMultiplier;

              // Try to move - if collision, the obstacle avoidance already calculated alternative
              if (!checkTerrainCollision(newX, newZ)) {
                enemy.mesh.position.x = newX;
                enemy.mesh.position.z = newZ;
              } else if (enemy.obstacleAvoidance) {
                // Collision detected - try moving perpendicular to escape
                const perpX = -normalizedZ;
                const perpZ = normalizedX;
                const escapeX = enemy.mesh.position.x + perpX * enemy.speed * 2;
                const escapeZ = enemy.mesh.position.z + perpZ * enemy.speed * 2;
                if (!checkTerrainCollision(escapeX, escapeZ)) {
                  enemy.mesh.position.x = escapeX;
                  enemy.mesh.position.z = escapeZ;
                }
              }

              // Look at player (or dodge direction if dodging) with angle-wrapped smooth rotation
              let lookAtX, lookAtZ;
              if (enemy.isDodging && enemy.dodgeDirection) {
                lookAtX = enemy.mesh.position.x + enemy.dodgeDirection.x;
                lookAtZ = enemy.mesh.position.z + enemy.dodgeDirection.z;
              } else {
                lookAtX = camera.position.x;
                lookAtZ = camera.position.z;
              }
              const dx = lookAtX - enemy.mesh.position.x;
              const dz = lookAtZ - enemy.mesh.position.z;
              const targetAngle = Math.atan2(dx, dz);
              // Angle wrapping to prevent 360° spins when crossing ±π
              let angleDiff = targetAngle - enemy.mesh.rotation.y;
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
              enemy.mesh.rotation.y += angleDiff * 0.12;
            }
          } else {
            // === IDLE ANIMATION ===
            // Smoothly reset limbs to idle position with gentle breathing motion
            enemy.walkTime += delta * 2; // Slower idle animation
            const idlePhase = enemy.walkTime;

            // Smooth leg return to idle
            if (enemy.leftLeg) {
              enemy.leftLeg.rotation.x = THREE.MathUtils.lerp(enemy.leftLeg.rotation.x, 0, 0.08);
            }
            if (enemy.rightLeg) {
              enemy.rightLeg.rotation.x = THREE.MathUtils.lerp(enemy.rightLeg.rotation.x, 0, 0.08);
            }

            // Gentle arm sway while idle
            if (enemy.leftArm) {
              const idleArmLeft = Math.sin(idlePhase * 0.5) * 0.05;
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, idleArmLeft, 0.08);
            }
            if (enemy.rightArm) {
              const idleArmRight = Math.sin(idlePhase * 0.5 + 0.5) * 0.05;
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, idleArmRight, 0.08);
            }

            // Subtle breathing motion on body
            enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, groundY + Math.sin(idlePhase) * 0.02, 0.1);

            // Reset torso tilt
            if (enemy.torso) {
              enemy.torso.rotation.x = THREE.MathUtils.lerp(enemy.torso.rotation.x, 0, 0.08);
            }
          }

          // === HEAD TRACKING — look at player ===
          if (enemy.head) {
            const headDx = camera.position.x - enemy.mesh.position.x;
            const headDz = camera.position.z - enemy.mesh.position.z;
            // Local-space rotation: subtract body rotation to get relative angle
            const headTargetY = Math.atan2(headDx, headDz) - enemy.mesh.rotation.y;
            // Clamp head turn to ±45°
            const clampedHeadY = Math.max(-0.78, Math.min(0.78, headTargetY));
            enemy.head.rotation.y = THREE.MathUtils.lerp(enemy.head.rotation.y, clampedHeadY, 0.08);
            // Slight head pitch toward player (look down if close, up if far)
            const headPitch = distance < 5 ? 0.15 : distance < 15 ? 0.05 : -0.05;
            enemy.head.rotation.x = THREE.MathUtils.lerp(enemy.head.rotation.x, headPitch, 0.06);
          }

          // === HIT STAGGER — visual feedback when damaged ===
          if (enemy.damageFlashTime > 0) {
            // Quick backward jolt
            const staggerIntensity = Math.min(enemy.damageFlashTime / 0.15, 1.0);
            if (enemy.torso) {
              enemy.torso.rotation.x = THREE.MathUtils.lerp(enemy.torso.rotation.x, -0.25 * staggerIntensity, 0.3);
            }
            // Scale pulse for impact feel
            const scalePulse = 1.0 + Math.sin(staggerIntensity * Math.PI) * 0.08;
            enemy.mesh.scale.setScalar(baseScale * scalePulse);
          } else {
            // Ensure scale is correct when not staggering
            enemy.mesh.scale.setScalar(baseScale);
          }
        }

        // === ATTACK SYSTEM ===
        if (enemy.attackSystem) {
          enemy.attackSystem.update(delta);

          // Try to attack if in range (increased range)
          const shouldAttack = distance < 7.0;
          if (shouldAttack) {
            enemy.attackSystem.tryAttack(
              enemy.mesh.position,
              camera.position
            );
          }

          // Check for hit during attack animation
          const hitPlayer = enemy.attackSystem.checkHit(
            enemy.mesh.position,
            enemy.mesh.rotation.y,
            camera.position
          );

          // Also check for overlap damage (when enemy clips into player)
          const currentTime = Date.now();
          const overlapDamage = enemy.attackSystem.checkOverlapDamage(
            enemy.mesh.position,
            camera.position,
            enemy.lastAttackTime,
            currentTime
          );

          if (hitPlayer || overlapDamage) {
            // Check invincibility from abilities
            if (!abilityEffects.isInvincible) {
              let damage = enemy.attackSystem.getDamage();

              // Apply ability shield if active
              if (abilityEffects.hasShield && abilityEffects.shieldHealth > 0) {
                // Shield absorbs damage
                const shieldDamage = Math.min(damage, abilityEffects.shieldHealth);
                abilitySystem.damageShield(shieldDamage);
                damage -= shieldDamage;
              }

              // Apply powerup shield if active
              if (shieldActive && shieldHealth > 0 && damage > 0) {
                const absorbed = Math.min(damage, shieldHealth);
                shieldHealth -= absorbed;
                damage -= absorbed;
                setPowerUpMessage(`🛡️ Shield: ${shieldHealth}/${shieldMaxHealth}`);
                if (shieldHealth <= 0) {
                  shieldActive = false;
                  setPowerUpMessage('🛡️ Shield Broken!');
                  if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Shield Broken', 'powerup');
                  setTimeout(() => setPowerUpMessage(''), 1500);
                }
              }

              health -= damage;
              enemy.lastAttackTime = currentTime; // Update for overlap cooldown

              if (damage > 0) {
                // 🤖 Record damage for AI systems
                adaptiveDifficulty.recordDamage(damage, false);
                adaptiveDifficulty.recordHealthStatus(health, 100);
                missionSystem.updateProgress('survival', 1);

                soundManager.play('playerHurt', 0.5);
                cameraShakeIntensity = Math.min(cameraShakeIntensity + 0.2, 0.25);

                // Trigger screen effects
                triggerDamageFlash();
                if (damage >= 15 && gameSettingsManager.getSetting('screenShake')) {
                  triggerScreenShake();
                }

                if (combo > 0) {
                  combo = Math.max(0, combo - 1);
                }

                // Track survival for achievements
                achievementSystem.updateProgress('survivor', 1);

                // Sync health in multiplayer
                if (isMultiplayer && multiplayerManager) {
                  multiplayerManager.updatePlayerHealth(health);
                }
              }

              updateGameState();

              // Game over check
              if (health <= 0) {
                health = 0;
                document.exitPointerLock();

                // Sync death in multiplayer
                if (isMultiplayer && multiplayerManager) {
                  multiplayerManager.updatePlayerHealth(0);
                  // In multiplayer, enter spectate mode instead of game over
                  console.log('[Multiplayer] Local player eliminated - entering spectate mode');
                  setIsSpectating(true);
                  updateGameState();
                } else {
                  // In single player, it's game over
                  isGameOver = true;
                  updateGameState(); // CRITICAL FIX: Update state after setting isGameOver
                }
              }
            }
          }

          // Update arm animations from attack system
          const armRotations = enemy.attackSystem.getArmRotation();
          const atkState = enemy.attackSystem.getAttackState();
          if (enemy.leftArm && enemy.rightArm) {
            if (atkState.isAttacking) {
              enemy.leftArm.rotation.x = armRotations.left;
              enemy.rightArm.rotation.x = armRotations.right;

              if (enemy.torso) {
                enemy.torso.rotation.x = enemy.attackSystem.getTorsoRotation();
              }

              // Attack lunge — lean forward and lurch toward player during strike
              if (atkState.attackPhase === 'strike') {
                const lungeDx = camera.position.x - enemy.mesh.position.x;
                const lungeDz = camera.position.z - enemy.mesh.position.z;
                const lungeDist = Math.sqrt(lungeDx * lungeDx + lungeDz * lungeDz);
                if (lungeDist > 0.5) {
                  const lungeStrength = 0.15 * baseScale;
                  enemy.mesh.position.x += (lungeDx / lungeDist) * lungeStrength;
                  enemy.mesh.position.z += (lungeDz / lungeDist) * lungeStrength;
                }
              }
            } else {
              // Idle arm animation
              enemy.leftArm.rotation.x = Math.sin(enemy.walkTime + Math.PI) * 0.3;
              enemy.rightArm.rotation.x = Math.sin(enemy.walkTime) * 0.3;

              if (enemy.torso) {
                enemy.torso.position.y = 0.2 + Math.sin(enemy.walkTime * 2) * 0.05;
                enemy.torso.rotation.x *= 0.9;
              }
            }
          }
        }

        // Damage flash animation - using scale pulse instead of material changes
        // (materials are SHARED with object pooling, so we can't modify them per-enemy)
        if (enemy.damageFlashTime > 0) {
          enemy.damageFlashTime -= delta;
          const flashIntensity = Math.max(0, enemy.damageFlashTime);

          // Scale pulse effect: enemy briefly expands then contracts when hit
          const pulseScale = 1.0 + flashIntensity * 0.3;

          // Only scale the torso/body for the hit reaction
          if (enemy.torso) {
            enemy.torso.scale.setScalar(pulseScale);
          }
        } else if (enemy.torso && enemy.torso.scale.x !== 1) {
          // Reset scale when flash is done
          enemy.torso.scale.setScalar(1);
        }
      }

      // Endless mode - no victory condition, only game over on death

      // === RENDERING (with optional post-processing based on graphics quality) ===
      if (graphicsPreset.postProcessing) {
        // High/Medium quality: Full post-processing pipeline
        renderer.setRenderTarget(renderTarget1);
        renderer.render(scene, camera);

        // Apply final composite with all effects
        postQuad.material = finalMaterial;
        finalMaterial.uniforms.tDiffuse.value = renderTarget1.texture;
        finalMaterial.uniforms.tBloom.value = renderTarget1.texture;
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCamera);
      } else {
        // Low quality: Direct render (no post-processing for maximum performance)
        renderer.render(scene, camera);
      }
    };

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      const newWidth = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
      const newHeight = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);
      renderer.setSize(newWidth, newHeight, false);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      const mountNode = mountRef.current;

      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('wheel', onMouseWheel);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (renderer.domElement) {
        renderer.domElement.removeEventListener('click', onCanvasClick);
        renderer.domElement.removeEventListener('contextmenu', onContextMenu);
        renderer.domElement.removeEventListener('webglcontextlost', onWebGLContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onWebGLContextRestored);
      }

      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      if (autoFireInterval) {
        clearInterval(autoFireInterval);
      }

      if (mountNode && renderer.domElement) {
        mountNode.removeChild(renderer.domElement);
      }

      // Cleanup post-processing
      renderTarget1.dispose();
      finalMaterial.dispose();
      postQuad.geometry.dispose();

      // Cleanup weather system
      weatherSystem.clear();

      // Cleanup sky dome
      skyGeometry.dispose();
      if (skyMaterial instanceof THREE.Material) {
        skyMaterial.dispose();
      }

      // Cleanup SmartEnemyManager (releases pooled resources)
      smartEnemyManager.dispose();

      renderer.dispose();
    };
  }, [gameStarted, gameMode, classicDifficulty, classicTimeOfDay, selectedMap, multiplayerManager]);

  // Handle mode selection
  const handleModeSelection = () => {
    setGameMode('classic');
    setShowClassicMenu(true);
  };

  // Handle multiplayer mode selection
  const handleMultiplayerMode = () => {
    setGameMode('multiplayer');
    setShowMultiplayerLobby(true);
  };

  // Handle multiplayer game start from lobby
  const handleMultiplayerStartGame = (manager: MultiplayerManager, gameMode: 'coop' | 'survival', timeLimit?: number, map?: MapType) => {
    console.log('[App] handleMultiplayerStartGame called - isHost:', manager.isGameHost(), 'map:', map);
    setMultiplayerManager(manager);
    setMultiplayerGameMode(gameMode);
    if (map) {
      setSelectedMap(map);
    }
    soundManager.initialize();
    setShowMultiplayerLobby(false);
    setGameStarted(true);

    // Start the game in multiplayer manager (host broadcasts to guests)
    // Guests have their handler registered in MultiplayerLobby already
    if (manager.isGameHost()) {
      console.log('[App] Host starting game, broadcasting to all guests...');
      manager.startGame(gameMode, timeLimit, map);
    } else {
      console.log('[App] Guest received game_start and transitioning...');
    }
  };

  // Handle classic mode start
  const handleClassicGameStart = (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType) => {
    setClassicDifficulty(difficulty);
    setClassicTimeOfDay(timeOfDay);
    setSelectedMap(map);
    // Enable adaptive difficulty setting when adaptive mode is selected
    if (difficulty === 'adaptive') {
      setGameSettings(prev => ({ ...prev, adaptiveDifficulty: true }));
    }
    console.log('[App] Starting classic game with map:', map);
    soundManager.initialize();
    setShowClassicMenu(false);
    setGameStarted(true);
  };

  const restartGame = () => {
    window.location.reload();
  };

  const returnToMenu = () => {
    window.location.reload();
  };

  // Show mobile warning if on mobile device
  if (isMobile) {
    return <MobileWarning />;
  }

  // Main Menu (Initial Screen)
  if (gameMode === 'none') {
    return <MainMenu onClassicMode={handleModeSelection} onMultiplayerMode={handleMultiplayerMode} t={t} />;
  }

  // Classic Mode Menu
  if (showClassicMenu) {
    return <ClassicMenu onStartGame={handleClassicGameStart} onBack={() => { setShowClassicMenu(false); setGameMode('none'); }} t={t} />;
  }

  // Multiplayer Lobby
  if (showMultiplayerLobby) {
    return <MultiplayerLobby onStartGame={handleMultiplayerStartGame} onBack={() => { setShowMultiplayerLobby(false); setGameMode('none'); }} />;
  }

  // Spectate Screen - Show when local player eliminated but game still ongoing
  if (isSpectating && multiplayerManager && !multiplayerGameOver) {
    const allPlayers = multiplayerManager.getAllPlayers();
    const alivePlayers = allPlayers.filter(p => p.isAlive);
    const localPlayer = multiplayerManager.getLocalPlayer();

    return (
      <div className="relative w-full h-screen overflow-hidden bg-black">
        <div ref={mountRef} className="absolute inset-0" style={{ zIndex: 0 }} />
        <SpectateScreen
          localPlayer={localPlayer}
          alivePlayers={alivePlayers}
          allPlayers={allPlayers}
          onMainMenu={returnToMenu}
        />
      </div>
    );
  }

  // Multiplayer Game Over - Show final results when game ends
  if (multiplayerGameOver && multiplayerManager) {
    const finalStats = multiplayerManager.getAllPlayers();
    const localPlayerId = multiplayerManager.getLocalPlayer().id;
    return <MultiplayerGameOver winnerId={multiplayerWinner || ''} finalStats={finalStats} localPlayerId={localPlayerId} onRestart={restartGame} onMainMenu={returnToMenu} />;
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <Analytics />
      <SpeedInsights />
      <div ref={mountRef} className="absolute inset-0" style={{ zIndex: 0 }} />

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        <HUD
          health={gameState.health}
          ammo={gameState.ammo}
          maxAmmo={gameState.maxAmmo}
          enemiesKilled={gameState.enemiesKilled}
          score={gameState.score}
          wave={gameState.wave}
          weaponName={WEAPONS[gameState.currentWeapon].name}
          combo={gameState.combo}
          t={t}
          unlockedWeapons={gameState.unlockedWeapons}
          currentWeapon={gameState.currentWeapon}
        />
      </div>

      {/* Ability HUD - Disabled temporarily as it needs to be accessed from game loop scope */}
      {/* AbilitySystem needs to be made available outside useEffect for this to work */}

      {/* FPS Counter - shown if enabled in settings */}
      {userSettings.showFPS && gameStarted && (
        <div
          className="absolute top-3 sm:top-5 left-1/2 transform -translate-x-1/2 z-20 select-none"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-3 py-1 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className="text-sm font-mono font-bold" style={{ color: currentFPS >= 50 ? '#4ade80' : currentFPS >= 30 ? '#facc15' : '#f87171' }}>
              {currentFPS} FPS
            </span>
          </div>
        </div>
      )}

      <div className="absolute inset-0" style={{ zIndex: 10, pointerEvents: 'none' }}>
        {!gameState.isGameOver && !isPaused && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              {/* Dynamic crosshair based on settings */}
              {userSettings.crosshairStyle === 'dot' && (
                <div
                  className="absolute w-2 h-2 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                  style={{ backgroundColor: userSettings.crosshairColor, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                />
              )}
              {userSettings.crosshairStyle === 'cross' && (
                <>
                  <div
                    className="absolute w-8 h-0.5 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
                    style={{ backgroundColor: userSettings.crosshairColor, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                  />
                  <div
                    className="absolute w-0.5 h-8 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
                    style={{ backgroundColor: userSettings.crosshairColor, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                  />
                </>
              )}
              {userSettings.crosshairStyle === 'circle' && (
                <div
                  className="absolute w-6 h-6 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                  style={{ border: `2px solid ${userSettings.crosshairColor}`, boxShadow: `0 0 6px ${userSettings.crosshairColor}` }}
                />
              )}
              {userSettings.crosshairStyle === 'dynamic' && (
                <>
                  <div
                    className="absolute w-8 h-0.5 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
                    style={{ backgroundColor: userSettings.crosshairColor, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                  />
                  <div
                    className="absolute w-0.5 h-8 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-90"
                    style={{ backgroundColor: userSettings.crosshairColor, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                  />
                  <div
                    className="absolute w-4 h-4 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                    style={{ border: `2px solid ${userSettings.crosshairColor}`, boxShadow: `0 0 4px ${userSettings.crosshairColor}` }}
                  />
                </>
              )}
            </div>
          </div>
        )}

        <Notifications
          showWaveComplete={showWaveComplete}
          killStreak={gameState.killStreak >= 5 ? gameState.killStreak : undefined}
          powerUpMessage={powerUpMessage}
          t={t}
        />
      </div>

      {/* Multiplayer HUD */}
      {gameMode === 'multiplayer' && multiplayerManager && !gameState.isGameOver && (
        <div className="absolute inset-0" style={{ zIndex: 15, pointerEvents: 'none' }}>
          <MultiplayerHUD
            localPlayer={multiplayerManager.getLocalPlayer()}
            remotePlayers={Array.from(multiplayerManager.getRemotePlayers().values())}
            remainingTime={multiplayerManager.getRemainingTime()}
            gameMode={multiplayerGameMode}
          />
        </div>
      )}

      {/* Chat System for Multiplayer */}
      {gameMode === 'multiplayer' && multiplayerManager && !gameState.isGameOver && (
        <div className="absolute inset-0" style={{ zIndex: 30, pointerEvents: 'auto' }}>
          <ChatSystem manager={multiplayerManager} isVisible={!isPaused} />
        </div>
      )}

      {/* Achievement Notifications - Stacked vertically */}
      {achievementQueue.map((achievement, index) => (
        <AchievementNotification
          key={achievement.queueId}
          achievement={achievement}
          index={index}
          onClose={() => {
            // Remove this specific achievement from queue
            setAchievementQueue((prev) =>
              prev.filter((a) => a.queueId !== achievement.queueId)
            );
          }}
        />
      ))}

      {/* Enhanced UI Components */}
      {gameStarted && !gameState.isGameOver && (
        <>
          <HitMarkers />
          <ScreenEffects
            health={gameState.health}
            maxHealth={100}
            isVisible={!isPaused}
          />
          <KillFeed visible={!isPaused} />
          <ComboDisplay
            combo={gameState.combo}
            killStreak={gameState.killStreak}
            visible={!isPaused}
          />
        </>
      )}

      {isPaused && !gameState.isGameOver && (
        <div className="absolute inset-0" style={{ zIndex: 100, pointerEvents: 'auto' }}>
          <PauseMenu
            health={gameState.health}
            ammo={gameState.ammo}
            maxAmmo={gameState.maxAmmo}
            enemiesKilled={gameState.enemiesKilled}
            score={gameState.score}
            wave={gameState.wave}
            onMainMenu={returnToMenu}
            t={t}
          />
        </div>
      )}

      {gameState.isGameOver && (
        <div className="absolute inset-0" style={{ zIndex: 100, pointerEvents: 'auto' }}>
          <GameOver
            isVictory={gameState.isVictory}
            score={gameState.score}
            enemiesKilled={gameState.enemiesKilled}
            wave={gameState.wave}
            onRestart={restartGame}
            onMainMenu={returnToMenu}
            t={t}
          />
        </div>
      )}

      {/* 🤖 NEW AI-POWERED UI COMPONENTS */}

      {/* Mission Display */}
      {gameStarted && !gameState.isGameOver && activeMissions.length > 0 && (
        <MissionDisplay
          missions={activeMissions}
          onDismiss={(missionId) => {
            setActiveMissions(prev => prev.filter(m => m.id !== missionId));
          }}
        />
      )}

      {/* Combat Coach Tips */}
      {gameStarted && !gameState.isGameOver && coachTips.length > 0 && (
        <CoachTipsDisplay
          tips={coachTips}
          onDismissTip={(tipId) => {
            setCoachTips(prev => prev.filter(t => t.id !== tipId));
          }}
        />
      )}

      {/* Tutorial Overlay */}
      {showTutorial && gameStarted && !gameState.isGameOver && (
        <TutorialOverlay
          currentStep={null} // Will be populated by tutorial system
          progress={0}
          onSkip={() => setShowTutorial(false)}
          onNext={() => {}}
        />
      )}

      {/* Skill Tree Menu */}
      {showSkillTree && (
        <SkillTreeMenu
          skills={[]}
          availablePoints={0}
          spentPoints={0}
          totalPoints={0}
          detectedPlayStyle="balanced"
          recommendations={[]}
          onUnlockSkill={(skillId) => {
            console.log('[SkillTree] Unlocking skill:', skillId);
          }}
          onClose={() => setShowSkillTree(false)}
        />
      )}

      {/* Enhanced Settings */}
      {showEnhancedSettings && (
        <EnhancedSettings
          settings={gameSettings}
          onSettingsChange={(newSettings) => {
            setGameSettings(prev => ({ ...prev, ...newSettings }));
          }}
          onClose={() => setShowEnhancedSettings(false)}
          onReset={() => {
            // Reset to default settings
            setGameSettings({
              graphicsQuality: 'high',
              shadowQuality: 'medium',
              postProcessing: true,
              particles: true,
              particleDensity: 75,
              viewDistance: 150,
              masterVolume: 80,
              musicVolume: 70,
              sfxVolume: 85,
              difficulty: 'medium',
              showTutorial: true,
              showHints: true,
              showDamageNumbers: true,
              screenShake: true,
              autoReload: false,
              adaptiveDifficulty: true,
              mouseSensitivity: 50,
              invertY: false,
              toggleAim: false,
              showFPS: false,
              showMinimap: true,
              uiScale: 100,
              colorblindMode: 'none'
            });
          }}
        />
      )}

      {/* Statistics Gallery */}
      {showStatsGallery && (
        <StatsGallery
          stats={{
            totalKills: gameState.enemiesKilled,
            totalDeaths: 0,
            killDeathRatio: gameState.enemiesKilled,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            headshots: 0,
            headshotPercentage: 0,
            accuracy: 0,
            longestKillStreak: gameState.killStreak,
            highestCombo: gameState.combo,
            totalPlayTime: 0,
            longestSurvival: 0,
            totalWavesCompleted: gameState.wave - 1,
            highestWave: gameState.wave,
            totalRevives: 0,
            favoriteWeapon: gameState.currentWeapon,
            weaponKills: {},
            level: 1,
            experience: gameState.score,
            experienceToNextLevel: 1000,
            totalSkillPoints: 0,
            skillsUnlocked: 0,
            achievementsUnlocked: 0,
            totalAchievements: 20,
            achievementProgress: 0,
            missionsCompleted: 0,
            missionsFailed: 0,
            missionSuccessRate: 0,
            multiplayerGamesPlayed: 0,
            multiplayerWins: 0,
            multiplayerWinRate: 0
          }}
          achievements={[]}
          onClose={() => setShowStatsGallery(false)}
        />
      )}
    </div>
  );
};

const WrappedGame = () => (
  <ErrorBoundary>
    <ForestSurvivalGame />
  </ErrorBoundary>
);

export default WrappedGame;
