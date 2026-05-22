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
import HUD, { type AbilityHudItem } from './components/HUD';
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
import ScreenEffects, { triggerDamageFlash, triggerScreenShake, triggerKillFlash, triggerHeadshotFlash } from './components/ScreenEffects';
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
  const [gameMode, setGameMode] = useState<'none' | 'classic' | 'multiplayer' | 'tutorial'>('none');
  const [showClassicMenu, setShowClassicMenu] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [classicDifficulty, setClassicDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [classicTimeOfDay, setClassicTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>(DEFAULT_MAP);
  const [isPaused, setIsPaused] = useState(false);
  const [showWaveComplete, setShowWaveComplete] = useState(false);
  const [powerUpMessage, setPowerUpMessage] = useState<string>('');
  const [abilityHud, setAbilityHud] = useState<AbilityHudItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => gameSettingsManager.getSettings());
  const [currentFPS, setCurrentFPS] = useState(0);

  // Multiplayer state
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [multiplayerManager, setMultiplayerManager] = useState<MultiplayerManager | null>(null);
  const [multiplayerGameOver, setMultiplayerGameOver] = useState(false);
  const [multiplayerWinner, setMultiplayerWinner] = useState<string | null>(null);
  const [multiplayerGameMode, setMultiplayerGameMode] = useState<'coop' | 'survival'>('coop');
  const [isSpectating, setIsSpectating] = useState(false); // Track if local player is eliminated and spectating
  const [, setMultiplayerKillFeed] = useState<Array<{ id: string; killerName: string; victimName: string; victimColor: number; weapon: string; timestamp: number }>>([]);
  const [lastKillerInfo, setLastKillerInfo] = useState<{ killerName: string; weapon: string } | null>(null);
  const [, setMpStatsTick] = useState(0); // Force HUD re-render for remote player stats
  const [gameRestartKey, setGameRestartKey] = useState(0); // Bump to force game useEffect re-run on restart
  const multiplayerTimeLimitRef = useRef<number | undefined>(undefined);

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

  // Tutorial & Skill Tree refs + state (bridge useEffect closure → React render)
  const tutorialRef = useRef<TutorialSystem | null>(null);
  const tutorialActiveRef = useRef(false); // true while tutorial popup is showing — blocks pointer lock
  const [tutorialStep, setTutorialStep] = useState<any>(null);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  const skillTreeRef = useRef<SmartSkillTreeSystem | null>(null);
  const [skillTreeData, setSkillTreeData] = useState({
    skills: [] as any[],
    availablePoints: 0,
    spentPoints: 0,
    totalPoints: 0,
    detectedPlayStyle: 'balanced' as string,
    recommendations: [] as string[],
  });

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

    console.log('[App] Setting up multiplayer listeners - isHost:', multiplayerManager.isGameHost());

    // Listen for game over
    const unsubGameOver = multiplayerManager.onMessage('game_over', (data: any) => {
      console.log('[App] Received game_over message:', data);
      setMultiplayerWinner(data.winnerId);
      setMultiplayerGameOver(true);
      // Stop all sounds when game is over
      soundManager.mute();
    });

    // Listen for kill events - real-time killer/victim info
    const unsubKilled = multiplayerManager.onMessage('player_killed', (data: any) => {
      console.log('[App] Received player_killed:', data);
      const entry = {
        id: `kill-${data.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
        killerName: data.killerName || 'Unknown',
        victimName: data.victimName || 'Unknown',
        victimColor: typeof data.victimColor === 'number' ? data.victimColor : 0xffffff,
        weapon: data.weapon || '',
        timestamp: data.timestamp || Date.now()
      };
      setMultiplayerKillFeed(prev => [...prev, entry].slice(-6));

      // If local player was killed, remember the killer so SpectateScreen can show it
      const localId = multiplayerManager.getLocalPlayer().id;
      if (data.victimId === localId) {
        setLastKillerInfo({ killerName: data.killerName || 'Unknown', weapon: data.weapon || '' });
      }
    });

    // Listen for game restart (guests receive this from host)
    const unsubRestart = multiplayerManager.onMessage('game_restart', (data: any) => {
      console.log('[App] Received game_restart - resetting local state');
      // Reset UI state
      setMultiplayerGameOver(false);
      setMultiplayerWinner(null);
      setIsSpectating(false);
      setMultiplayerKillFeed([]);
      setLastKillerInfo(null);
      setGameState({
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
      soundManager.unmute();
      if (data.gameState?.timeLimit !== undefined) {
        multiplayerTimeLimitRef.current = data.gameState.timeLimit;
      }
      // Bump key to re-run the main game useEffect (fresh scene + fresh state)
      setGameRestartKey(k => k + 1);
    });

    // Refresh the HUD / leaderboard the instant any player's stats change —
    // an arriving player_update or enemy_killed bumps the tick immediately so
    // kills and scores are reflected in real time, not on a polling delay.
    const bumpStats = () => setMpStatsTick(v => (v + 1) % 1000000);
    const unsubPlayerUpdate = multiplayerManager.onMessage('player_update', bumpStats);
    const unsubEnemyKilled = multiplayerManager.onMessage('enemy_killed', bumpStats);

    // Low-frequency fallback poll (covers timeouts / disconnects)
    const statsInterval = setInterval(bumpStats, 1000);

    // Clean stale kill feed entries (entries auto-fade after 5s)
    const killFeedInterval = setInterval(() => {
      setMultiplayerKillFeed(prev => {
        const now = Date.now();
        const fresh = prev.filter(e => now - e.timestamp < 5000);
        return fresh.length === prev.length ? prev : fresh;
      });
    }, 1000);

    console.log('[App] Multiplayer listeners registered');

    return () => {
      unsubGameOver();
      unsubKilled();
      unsubRestart();
      unsubPlayerUpdate();
      unsubEnemyKilled();
      clearInterval(statsInterval);
      clearInterval(killFeedInterval);
    };
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
    // `let` so the render loop can pick up live FOV changes from the
    // settings menu (e.g. opened mid-game from the pause menu).
    let baseFOV = currentUserSettings.fov;
    const sensitivityMultiplier = gameSettingsManager.getSensitivityMultiplier();

    // Determine configuration based on difficulty and mode
    const timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' | 'bloodmoon' = classicTimeOfDay as any;
    // speedMult is the dominant control over how fast enemies close in.
    //   easy     — enemies amble in; the player can always out-walk them.
    //   medium   — enemies roughly match a walking player; sprint to escape.
    //   hard     — enemies keep pace with a sprinting player; relentless.
    //   adaptive — starts gentle, the AI difficulty system ramps it up.
    const classicSettings = {
      easy: { healthMult: 1.5, speedMult: 0.85, damageMult: 1.5, spawnMult: 1.3, regenRate: 0 },
      medium: { healthMult: 2.5, speedMult: 1.55, damageMult: 2.2, spawnMult: 1.8, regenRate: 0.2 },
      hard: { healthMult: 4.0, speedMult: 2.35, damageMult: 3.5, spawnMult: 2.5, regenRate: 0.5 },
      adaptive: { healthMult: 2.0, speedMult: 1.15, damageMult: 2.0, spawnMult: 1.5, regenRate: 0.1 } // Starts balanced, AI adjusts
    };
    const diffSettings = { ...classicSettings[classicDifficulty], progressive: classicDifficulty === 'adaptive', rampRate: classicDifficulty === 'adaptive' ? 0.05 : 0 };

    // === MULTIPLAYER & ENHANCED SYSTEMS ===
    const isMultiplayer = gameMode === 'multiplayer' && multiplayerManager !== null;

    // Initialize ability system (for all modes)
    const abilitySystem = new AbilitySystem();

    // Score needed to unlock each ability — Dash is free, the rest unlock
    // progressively (just like weapons). Tutorial mode unlocks everything.
    const abilityUnlockScore: Record<string, number> = {
      dash: 0,
      shield: 200,
      speed: 500,
      heal: 900,
      invincible: 1500,
    };

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

    // Store refs so React render can access these systems
    tutorialRef.current = tutorial;
    skillTreeRef.current = skillTree;

    // Tutorial mode: force tutorial on + reduce difficulty for learning
    const isTutorialMode = gameMode === 'tutorial';
    if (isTutorialMode) {
      tutorial.start();
      setShowTutorial(true);
      tutorialActiveRef.current = true; // Block pointer lock while tutorial popup shows
      diffSettings.healthMult *= 0.6;
      diffSettings.speedMult *= 0.7;
      diffSettings.spawnMult *= 0.5;
      // Set initial tutorial step immediately so overlay renders on first frame
      const firstStep = tutorial.getCurrentStep();
      if (firstStep) {
        setTutorialStep({ ...firstStep });
        setTutorialProgress(tutorial.getProgress());
        (tutorial as any)._lastStepId = firstStep.id;
      }
    }

    // Initialize skill tree data for React
    setSkillTreeData({
      skills: skillTree.getAllSkills(),
      availablePoints: skillTree.getState().availablePoints,
      spentPoints: skillTree.getState().spentPoints,
      totalPoints: skillTree.getState().totalPoints,
      detectedPlayStyle: 'balanced',
      recommendations: [],
    });

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
    // Map fog settings override base fog for specific map atmospheres.
    // Boosted ~1.6x for real atmospheric depth — the world fades into haze
    // instead of reading as an endless, blank flat plane. Clamped so enemies
    // are still readable as they close in.
    const mapFogDensity = 1.0 / ((mapConfig.fogFar - mapConfig.fogNear) / 2);
    const blendedFogDensity = Math.min(
      0.026,
      ((atmosphericSettings.fogDensity + mapFogDensity) / 2) * 1.62,
    );

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
    // Soft (PCF) shadows on medium+ for realistic penumbra; basic only on low.
    renderer.shadowMap.type = graphicsQuality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic tone mapping
    renderer.toneMappingExposure = timeOfDay === 'day' ? 1.15 : 1.5;
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

      // Aggressively try to auto-lock the pointer for multiplayer so the
      // player doesn't have to click to start controlling the camera.
      if (gameMode === 'multiplayer') {
        const tryLock = () => {
          if (!renderer.domElement || document.pointerLockElement) return;
          try {
            renderer.domElement.focus();
            renderer.domElement.requestPointerLock();
          } catch (err) {
            console.warn('[App] Pointer lock attempt failed:', err);
          }
        };

        // Immediate attempt (preserves the "Start Game" click activation on host)
        tryLock();
        // Try again over the next ~2 seconds in case the first attempt raced
        // with the canvas being ready or the user-activation state
        const retries = [50, 150, 400, 900, 1800];
        const retryIds: number[] = [];
        retries.forEach(ms => {
          const id = window.setTimeout(tryLock, ms);
          retryIds.push(id);
        });

        // One-shot global fallback: if browser blocks auto-lock (common for
        // guests receiving a remote start), lock controls on first user input.
        const onFirstInput = () => {
          if (!document.pointerLockElement && renderer.domElement) {
            try {
              renderer.domElement.focus();
              renderer.domElement.requestPointerLock();
            } catch {
              // Ignore; user can still click canvas manually if browser blocks lock
            }
          }
          window.removeEventListener('click', onFirstInput, true);
          window.removeEventListener('mousedown', onFirstInput, true);
          window.removeEventListener('pointerdown', onFirstInput, true);
          window.removeEventListener('keydown', onFirstInput, true);
          window.removeEventListener('touchstart', onFirstInput, true);
        };
        window.addEventListener('click', onFirstInput, true);
        window.addEventListener('mousedown', onFirstInput, true);
        window.addEventListener('pointerdown', onFirstInput, true);
        window.addEventListener('keydown', onFirstInput, true);
        window.addEventListener('touchstart', onFirstInput, true);

        // Store cleanup on the renderer element
        (renderer.domElement as any)._mpPointerLockCleanup = () => {
          retryIds.forEach(id => clearTimeout(id));
          window.removeEventListener('click', onFirstInput, true);
          window.removeEventListener('mousedown', onFirstInput, true);
          window.removeEventListener('pointerdown', onFirstInput, true);
          window.removeEventListener('keydown', onFirstInput, true);
          window.removeEventListener('touchstart', onFirstInput, true);
        };
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

    // Bloom render target at half resolution for performance
    const bloomTarget = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(window.innerWidth / 2)),
      Math.max(1, Math.floor(window.innerHeight / 2)),
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
    );

    // Second half-res target so the bloom blur can ping-pong between buffers
    const bloomTargetB = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(window.innerWidth / 2)),
      Math.max(1, Math.floor(window.innerHeight / 2)),
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }
    );

    // Bright-pass extraction shader — extracts only bright pixels for bloom
    const brightPassMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.62 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float threshold;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          float soft = smoothstep(threshold - 0.12, threshold + 0.12, brightness);
          // Slight super-brightening so bloom on lights/embers blooms hot
          gl_FragColor = vec4(color.rgb * soft * (1.0 + soft * 0.5), 1.0);
        }
      `
    });

    // Separable 9-tap Gaussian blur — turns the bright-pass into a soft,
    // wide glow. Run horizontally then vertically, a couple of iterations,
    // for a smooth cinematic bloom rather than hard bright pixels.
    const blurMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        direction: { value: new THREE.Vector2(1, 0) },
        resolution: {
          value: new THREE.Vector2(
            Math.max(1, Math.floor(window.innerWidth / 2)),
            Math.max(1, Math.floor(window.innerHeight / 2)),
          ),
        },
      },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 direction;
        uniform vec2 resolution;
        varying vec2 vUv;
        void main() {
          vec2 texel = direction / resolution;
          vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
          sum += texture2D(tDiffuse, vUv + texel * 1.3846) * 0.316216;
          sum += texture2D(tDiffuse, vUv - texel * 1.3846) * 0.316216;
          sum += texture2D(tDiffuse, vUv + texel * 3.2308) * 0.070270;
          sum += texture2D(tDiffuse, vUv - texel * 3.2308) * 0.070270;
          gl_FragColor = sum;
        }
      `
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
          // Multiplicative white-balance. An ADDITIVE offset here used to
          // inject blue into colours with a zero blue channel — which turned
          // orange rifle/launcher rounds purple on cool-toned maps. Scaling
          // each channel instead keeps pure hues pure (0 * anything = 0).
          return color * (1.0 + vec3(temp, 0.0, -temp) * 0.15);
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
          // CRITICAL: clamp negatives before ACES. ACES is a rational curve —
          // feeding it a negative channel returns a spurious POSITIVE value,
          // which flipped the zero-blue channel of orange/red bullets up to
          // 1.0 and rendered them pink. Clamping keeps pure hues pure.
          color = ACESFilm(max(color, vec3(0.0)));

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

    /**
     * Full post-processing pipeline:
     *   1. scene  -> renderTarget1
     *   2. bright-pass -> bloomTarget
     *   3. separable Gaussian blur (H+V, 2 iterations) ping-ponging the
     *      bloom buffers — produces a soft, wide cinematic glow
     *   4. final composite (scene + bloom + grading) -> screen
     */
    const composePostFX = () => {
      // Pass 1 — render the 3D scene into the main target
      renderer.setRenderTarget(renderTarget1);
      renderer.render(scene, camera);

      // Pass 2 — extract bright pixels
      postQuad.material = brightPassMaterial;
      brightPassMaterial.uniforms.tDiffuse.value = renderTarget1.texture;
      renderer.setRenderTarget(bloomTarget);
      renderer.render(postScene, postCamera);

      // Pass 3 — blur the bright pixels into a soft glow
      postQuad.material = blurMaterial;
      for (let iteration = 0; iteration < 2; iteration++) {
        blurMaterial.uniforms.tDiffuse.value = bloomTarget.texture;
        blurMaterial.uniforms.direction.value.set(1, 0);
        renderer.setRenderTarget(bloomTargetB);
        renderer.render(postScene, postCamera);

        blurMaterial.uniforms.tDiffuse.value = bloomTargetB.texture;
        blurMaterial.uniforms.direction.value.set(0, 1);
        renderer.setRenderTarget(bloomTarget);
        renderer.render(postScene, postCamera);
      }

      // Pass 4 — composite scene + bloom + colour grading to the screen
      postQuad.material = finalMaterial;
      finalMaterial.uniforms.tDiffuse.value = renderTarget1.texture;
      finalMaterial.uniforms.tBloom.value = bloomTarget.texture;
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCamera);
    };

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

    // Shadow settings based on graphics quality.
    // A tighter frustum concentrates the shadow map's resolution near the
    // player, giving noticeably crisper, more grounded contact shadows.
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = graphicsPreset.viewDistance * 2;
    const shadowRange = graphicsQuality === 'high' ? 100 : graphicsQuality === 'medium' ? 72 : 48;
    mainLight.shadow.camera.left = -shadowRange;
    mainLight.shadow.camera.right = shadowRange;
    mainLight.shadow.camera.top = shadowRange;
    mainLight.shadow.camera.bottom = -shadowRange;
    mainLight.shadow.mapSize.width = graphicsPreset.shadowMapSize;
    mainLight.shadow.mapSize.height = graphicsPreset.shadowMapSize;
    mainLight.shadow.bias = -0.00018;
    mainLight.shadow.normalBias = 0.035; // Reduces shadow acne / peter-panning
    mainLight.shadow.radius = graphicsQuality === 'high' ? 2.5 : graphicsQuality === 'medium' ? 1.6 : 1.0;
    mainLight.shadow.camera.updateProjectionMatrix();
    scene.add(mainLight);
    // Target follows player so directional shadows stay centered on the camera
    scene.add(mainLight.target);

    // Hemisphere light for natural sky reflection (dynamic based on atmospheric settings)
    const skyColor = new THREE.Color(atmosphericSettings.skyColor);
    const groundColor = skyColor.clone().multiplyScalar(0.35); // Darker ground reflection
    const skyLight = new THREE.HemisphereLight(
      skyColor.getHex(),
      groundColor.getHex(),
      atmosphericSettings.ambientIntensity * 0.9
    );
    scene.add(skyLight);

    // Volumetric god-ray light (follows sun direction, gives directional bounce feel)
    const volumetricLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffe8b8 : 0x9aaee0,
      atmosphericSettings.sunVisible ? 0.55 : 0.7
    );
    volumetricLight.position.set(
      atmosphericSettings.lightPosition.x * 0.5,
      atmosphericSettings.lightPosition.y * 0.8,
      atmosphericSettings.lightPosition.z * 0.5
    );
    scene.add(volumetricLight);
    scene.add(volumetricLight.target);

    // Fill light (opposite side of main light for balanced illumination)
    const fillLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xbcd6ff : 0x8a9ccc,
      atmosphericSettings.sunVisible ? 0.45 : 0.85
    );
    fillLight.position.set(
      -atmosphericSettings.lightPosition.x * 0.6,
      atmosphericSettings.lightPosition.y * 0.4,
      -atmosphericSettings.lightPosition.z * 0.6
    );
    scene.add(fillLight);
    scene.add(fillLight.target);

    // Rim/Back light for dramatic silhouettes
    const rimLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffffff : 0xd6e4ff,
      atmosphericSettings.sunVisible ? 0.6 : 1.0
    );
    rimLight.position.set(
      atmosphericSettings.lightPosition.x * 0.3,
      atmosphericSettings.lightPosition.y * 1.2,
      atmosphericSettings.lightPosition.z
    );
    scene.add(rimLight);
    scene.add(rimLight.target);

    // Additional ambient fill for better night visibility (moonlight bounce)
    const nightFillLight = new THREE.AmbientLight(0x556db0, atmosphericSettings.sunVisible ? 0.0 : 1.1);
    scene.add(nightFillLight);

    // Player-attached night lantern — softly illuminates surroundings when sun is down
    const playerNightLantern = new THREE.PointLight(0xaec6ff, 0, 42, 1.6);
    playerNightLantern.position.set(0, 3, 0);
    camera.add(playerNightLantern);

    // Precompute base light offsets so lights can follow the player
    const mainLightBaseOffset = new THREE.Vector3(
      atmosphericSettings.lightPosition.x,
      atmosphericSettings.lightPosition.y,
      atmosphericSettings.lightPosition.z
    );
    const volumetricLightBaseOffset = mainLightBaseOffset.clone().multiplyScalar(0.5);
    volumetricLightBaseOffset.y = atmosphericSettings.lightPosition.y * 0.8;
    const fillLightBaseOffset = new THREE.Vector3(
      -atmosphericSettings.lightPosition.x * 0.6,
      atmosphericSettings.lightPosition.y * 0.4,
      -atmosphericSettings.lightPosition.z * 0.6
    );
    const rimLightBaseOffset = new THREE.Vector3(
      atmosphericSettings.lightPosition.x * 0.3,
      atmosphericSettings.lightPosition.y * 1.2,
      atmosphericSettings.lightPosition.z
    );

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
    const skyTopColor = new THREE.Color(mapConfig.hasSpecialWeather ? mapConfig.skyColor : atmosphericSettings.skyColor);
    const skyHorizonColor = new THREE.Color(mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor);
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
    // Render the sky first and ignore depth so it never appears as a "blob"
    // floating in the distance, even when the player walks far from origin.
    skyDome.renderOrder = -1000;
    skyDome.frustumCulled = false;
    scene.add(skyDome);

    // === IMAGE-BASED LIGHTING ===
    // Generate an environment map from the sky/scene so metallic surfaces
    // (weapons especially) pick up real reflections and read as polished
    // metal instead of flat matte plastic. Generated once at startup.
    let envMapTexture: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envRT = pmrem.fromScene(scene, 0.04);
      envMapTexture = envRT.texture;
      scene.environment = envMapTexture;
      pmrem.dispose();
    } catch (err) {
      console.warn('[App] Environment map generation failed:', err);
    }

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

    // Returns true if a collidable object of the given radius placed at (x,z)
    // would overlap an existing collidable terrain object. Used to keep rocks,
    // trees and boulders from clipping into one another when scattered.
    const overlapsTerrain = (x: number, z: number, radius: number): boolean => {
      for (const obj of terrainObjects) {
        if (!obj.collidable) continue;
        const dx = obj.x - x;
        const dz = obj.z - z;
        const minDist = obj.radius + radius;
        if (dx * dx + dz * dz < minDist * minDist) return true;
      }
      return false;
    };

    // Picks a chunk-local position that doesn't overlap existing terrain.
    // Falls back to the last candidate if no clear spot is found in a few tries.
    const findFreeSpot = (startX: number, startZ: number, estRadius: number) => {
      let x = 0, z = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        x = startX + Math.random() * CHUNK_SIZE;
        z = startZ + Math.random() * CHUNK_SIZE;
        if (!overlapsTerrain(x, z, estRadius)) return { x, z, ok: true };
      }
      return { x, z, ok: false };
    };

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
        const spot = findFreeSpot(startX, startZ, 2.6);
        if (!spot.ok) continue; // Skip if no clear space — avoids overlapping trees
        const tree = biomeSystem.createTree(spot.x, spot.z, biome);
        terrainObjects.push(tree);
        scene.add(tree.mesh);
      }

      // Generate rocks based on biome density * map multiplier
      const rocksInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.rockDensity * rockDensityMult / 100);
      for (let i = 0; i < rocksInChunk; i++) {
        const spot = findFreeSpot(startX, startZ, 2.2);
        if (!spot.ok) continue; // Skip if no clear space — avoids overlapping rocks
        const rock = biomeSystem.createRock(spot.x, spot.z, biome);
        terrainObjects.push(rock);
        scene.add(rock.mesh);
      }

      // Generate occasional boulders (more common in rocky maps)
      if (Math.random() > (0.7 / rockDensityMult)) {
        const spot = findFreeSpot(startX, startZ, 4);
        if (spot.ok) {
          const boulder = biomeSystem.createBoulder(spot.x, spot.z, biome);
          terrainObjects.push(boulder);
          scene.add(boulder.mesh);
        }
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

      // Lush instanced grass — one draw call per chunk, biome-tinted, with
      // a shader wind sway. Streams in/out with the chunk like other terrain.
      const grassField = biomeSystem.createGrassField(
        startX, startZ, CHUNK_SIZE, biome, graphicsPreset.terrainDetail,
      );
      if (grassField) {
        terrainObjects.push(grassField);
        scene.add(grassField.mesh);
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

    // Collision detection helper.
    // `playerY` is the camera (eye) Y. We convert it to the player's FEET
    // height so that "jump over" only triggers when the player is genuinely
    // airborne above the obstacle — not simply because the camera sits above
    // a short rock while standing on the ground. Enemy callers pass the
    // default (0), which yields a negative feet height so enemies always
    // collide with terrain.
    const checkTerrainCollision = (newX: number, newZ: number, playerY?: number): boolean => {
      const feetY = playerY === undefined ? -1 : playerY - currentCameraHeight;
      for (const obj of terrainObjects) {
        if (!obj.collidable) continue;
        // If the player's feet clear the object's top, skip collision (jump over)
        if (obj.height !== undefined && feetY > obj.height) continue;
        const dx = newX - obj.x;
        const dz = newZ - obj.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < obj.radius) {
          return true; // Collision detected
        }
      }
      return false;
    };

    // Push the player out of any collidable obstacle they are overlapping at
    // their current feet height. This recovers from edge cases the move-time
    // collision check can't prevent — e.g. landing on top of a rock after
    // jumping over it, then descending into its volume.
    const resolveTerrainPenetration = () => {
      const feetY = camera.position.y - currentCameraHeight;
      for (const obj of terrainObjects) {
        if (!obj.collidable) continue;
        if (obj.height !== undefined && feetY > obj.height) continue;
        const dx = camera.position.x - obj.x;
        const dz = camera.position.z - obj.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < obj.radius * obj.radius && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const push = obj.radius - dist + 0.05;
          camera.position.x += (dx / dist) * push;
          camera.position.z += (dz / dist) * push;
        }
      }
    };

    // Initial world generation
    generateChunk(0, 0);
    generateChunk(0, 1);
    generateChunk(1, 0);
    generateChunk(1, 1);
    generateChunk(-1, 0);
    generateChunk(0, -1);
    generateChunk(-1, -1);

    // === SPAWN SAFE ZONE ===
    // Random terrain generation can place a tree/rock/wall right on top of the
    // player's start position. Because collision is radius-based, the player
    // would then be trapped — every move target stays inside the obstacle.
    // Clear any collidable object overlapping a generous radius around spawn.
    {
      const spawnX = camera.position.x;
      const spawnZ = camera.position.z;
      const SPAWN_CLEARANCE = 6; // free space the player needs beyond an obstacle's edge
      for (let i = terrainObjects.length - 1; i >= 0; i--) {
        const obj = terrainObjects[i];
        if (!obj.collidable) continue;
        const dist = Math.sqrt((obj.x - spawnX) ** 2 + (obj.z - spawnZ) ** 2);
        if (dist < obj.radius + SPAWN_CLEARANCE) {
          scene.remove(obj.mesh);
          terrainObjects.splice(i, 1);
        }
      }
    }

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
    let shadowLeftLeg: THREE.Mesh | null = null;
    let shadowRightLeg: THREE.Mesh | null = null;
    let shadowWalkTime = 0; // drives the walking-shadow leg animation

    // Always give the player a ground shadow when shadows are enabled — the
    // visible first-person arms can't cast a clean world shadow themselves,
    // so this invisible silhouette body provides a proper grounded shadow.
    if (graphicsPreset.shadowsEnabled) {
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

      // Player legs — geometry shifted so its origin is at the hip, letting
      // the legs pivot from the top for a natural walking-shadow stride.
      const shadowLegGeo = new THREE.BoxGeometry(0.3, 1.0, 0.3);
      shadowLegGeo.translate(0, -0.5, 0);
      shadowLeftLeg = new THREE.Mesh(shadowLegGeo, shadowOnlyMaterial);
      shadowLeftLeg.position.set(-0.2, -1.2, 0);
      shadowLeftLeg.castShadow = true;
      playerShadowBody.add(shadowLeftLeg);

      shadowRightLeg = new THREE.Mesh(shadowLegGeo, shadowOnlyMaterial);
      shadowRightLeg.position.set(0.2, -1.2, 0);
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

    // AMBIENT FLOATING PARTICLES (dust motes / fireflies)
    let ambientParticles: THREE.Points | null = null;
    // particleDensity is a 0-1 multiplier — ambient motes spawn on medium+
    // (the old `> 30` check could never be true, so they never appeared).
    const AMBIENT_PARTICLE_COUNT = Math.round(200 * graphicsPreset.particleDensity);
    if (gameSettings.particles && graphicsPreset.particleDensity >= 0.5) {
      const isNight = timeOfDay === 'night';
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
      const velocities = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
      const phases = new Float32Array(AMBIENT_PARTICLE_COUNT); // random phase offset for sine drift

      for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 1] = 1 + Math.random() * 8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
        velocities[i * 3] = (Math.random() - 0.5) * 0.3;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        phases[i] = Math.random() * Math.PI * 2;
      }

      particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      (particleGeo as any)._velocities = velocities;
      (particleGeo as any)._phases = phases;

      const particleMat = new THREE.PointsMaterial({
        color: isNight ? 0x88ff88 : 0xffffff,
        size: isNight ? 0.12 : 0.06,
        transparent: true,
        opacity: isNight ? 0.6 : 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      ambientParticles = new THREE.Points(particleGeo, particleMat);
      ambientParticles.frustumCulled = false;
      scene.add(ambientParticles);
    }

    // Game state
    let health = 100;
    let ammo = 12;
    let score = 0;
    let enemiesKilled = 0;
    // Once the local player is eliminated (multiplayer spectate / single-player
    // game over) this latches true so enemies can't keep "re-killing" a dead
    // player — which previously spammed the kill feed and death broadcasts.
    let playerEliminated = false;
    let wave = 1;
    let waveTransitioning = false; // Guards wave-complete logic during the inter-wave delay
    let waveTimeoutId: number | null = null; // Tracked so it can be cancelled on unmount
    // Enemies still left to spawn this wave. The wave only completes once this
    // hits 0 AND every living enemy is dead — so it can't be blocked by the
    // continuous spawner endlessly topping the count back up. (Unused in
    // tutorial mode, which has no wave progression.)
    let waveEnemiesRemaining = 0;
    let isGameOver = false;
    let paused = false;
    let combo = 0;
    let killStreak = 0;
    let lastKillTime = 0;
    let startTime = Date.now(); // Track game start time
    let currentWeapon = 'pistol';
    let canShoot = true;
    let isReloading = false;
    // Tutorial mode hands the player every weapon so they can try them all.
    let unlockedWeapons = isTutorialMode ? Object.keys(WEAPONS) : ['pistol'];
    let isAiming = false;
    let timeScale = 1.0; // For slow-mo effects (1.0 = normal speed)
    let fovPunch = 0; // FOV punch on shooting (additive degrees)
    let fovCheckAccum = 0; // throttles re-reading the FOV setting
    let abilityHudAccum = 0; // throttles ability-bar HUD updates

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
          setPowerUpMessage(`${weapon.name} Unlocked`);
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

    // Temporary explosion craters left by the rocket launcher
    interface Crater { mesh: THREE.Object3D; life: number; maxLife: number; }
    const craters: Crater[] = [];

    // Shared bullet resources — one low-poly sphere geometry for every bullet
    // and a per-colour material cache, so firing doesn't allocate (and churn
    // the GC) on every single shot.
    const sharedBulletGeo = new THREE.SphereGeometry(0.1, 8, 6);
    const bulletMaterialCache = new Map<number, THREE.MeshBasicMaterial>();
    const getBulletMaterial = (color: number): THREE.MeshBasicMaterial => {
      let m = bulletMaterialCache.get(color);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
        bulletMaterialCache.set(color, m);
      }
      return m;
    };

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

    // Spawns up to `count` enemies in a ring around the player. Returns how
    // many actually spawned (the enemy cap / pool may permit fewer).
    const spawnEnemyBatch = (count: number): number => {
      const adaptiveMax = smartEnemyManager.getCurrentMaxEnemies();
      const hardish = classicDifficulty === 'hard' || classicDifficulty === 'adaptive';
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        if (enemies.length >= adaptiveMax || !smartEnemyManager.canSpawnMore()) break;
        const angle = Math.random() * Math.PI * 2;
        const distance = 42 + Math.random() * 26;
        const x = Math.cos(angle) * distance + camera.position.x;
        const z = Math.sin(angle) * distance + camera.position.z;
        let type: 'normal' | 'fast' | 'tank' | 'boss' = 'normal';
        const rand = Math.random();
        if (wave >= 5 && rand < (hardish ? 0.12 : 0.08)) type = 'boss';
        else if (wave >= 3 && rand < (hardish ? 0.32 : 0.24)) type = 'tank';
        else if (wave >= 2 && rand < (hardish ? 0.5 : 0.42)) type = 'fast';
        const enemy = createEnemy(x, z, type);
        if (enemy) { enemies.push(enemy); spawned++; }
      }
      return spawned;
    };

    // Weighted power-up drop at the start of a wave.
    const spawnWavePowerUps = () => {
      for (let i = 0; i < 2; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 20 + Math.random() * 15;
        const roll = Math.random();
        let type: PowerUp['type'];
        if (roll < 0.30) type = 'health';
        else if (roll < 0.55) type = 'ammo';
        else if (roll < 0.75) type = 'speed';
        else if (roll < 0.88) type = 'damage';
        else if (roll < 0.96) type = 'shield';
        else type = 'infinite_ammo';
        powerUps.push(createPowerUp(
          Math.cos(angle) * distance + camera.position.x,
          Math.sin(angle) * distance + camera.position.z,
          type,
        ));
      }
    };

    const spawnWave = () => {
      if (isTutorialMode) {
        // Tutorial — no wave progression. A light practice group is seeded
        // here and topped up endlessly by continuousSpawn().
        spawnEnemyBatch(5);
        return;
      }
      // Solo / multiplayer — a finite, fully clearable wave. The opening
      // burst spawns now; continuousSpawn() trickles in the rest.
      waveEnemiesRemaining = Math.floor((10 + wave * 5) * diffSettings.spawnMult);
      const opening = Math.min(7, waveEnemiesRemaining);
      waveEnemiesRemaining -= spawnEnemyBatch(opening);
      if (wave % 2 === 0) spawnWavePowerUps();
    };

    // Continuous enemy spawning — paces how fast the wave budget drains in.
    let lastSpawnTime = Date.now();

    const getSpawnSettings = () => {
      switch (classicDifficulty) {
        case 'easy': return { interval: 5000, baseSpawn: 3 };
        case 'medium': return { interval: 4000, baseSpawn: 4 };
        case 'hard': return { interval: 3000, baseSpawn: 5 };
        case 'adaptive': return { interval: 4500, baseSpawn: 4 };
        default: return { interval: 4000, baseSpawn: 4 };
      }
    };
    const spawnSettings = getSpawnSettings();

    const continuousSpawn = () => {
      const currentTime = Date.now();
      if (currentTime - lastSpawnTime <= spawnSettings.interval) return;
      if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies() || !smartEnemyManager.canSpawnMore()) return;

      if (isTutorialMode) {
        // Tutorial — endless light trickle so there's always a target.
        spawnEnemyBatch(Math.floor(spawnSettings.baseSpawn + Math.random() * 2));
        lastSpawnTime = currentTime;
        return;
      }

      // Solo / multiplayer — only spawn what's left of this wave's budget.
      if (waveEnemiesRemaining > 0) {
        const batch = Math.min(
          waveEnemiesRemaining,
          Math.floor(spawnSettings.baseSpawn + Math.random() * 3),
        );
        waveEnemiesRemaining -= spawnEnemyBatch(batch);
        lastSpawnTime = currentTime;
      }
    };

    spawnWave();

    // Movement
    const keys: Keys = {};
    const moveSpeed = 0.3;
    const sprintMultiplier = 1.8;
    const baseJumpPower = 0.5; // Prominent jump — clears most rocks/obstacles
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

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');   // base aim (mouse only)
    const PI_2 = Math.PI / 2;
    // Camera recoil — a transient kick added on top of the mouse aim each
    // shot, then smoothly recovered. Decoupled from `euler` so it never
    // fights the player's mouse input.
    let recoilPitch = 0;
    let recoilYaw = 0;
    const _recoilEuler = new THREE.Euler(0, 0, 0, 'YXZ');

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
        } else if (!tutorialActiveRef.current) {
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
        gunModel.triggerDash(); // Braced weapon pull-back animation
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

      // Ability activation — keys map directly to ability TYPE (the old
      // index-based mapping was off by one, so E actually cast Dash).
      const abilityKeys: Record<string, 'shield' | 'speed' | 'invincible' | 'heal'> = {
        'KeyE': 'shield',     // Energy Shield
        'KeyF': 'speed',      // Sprint (speed boost)
        'KeyV': 'invincible', // Ghost Mode
        'KeyB': 'heal',       // Quick Heal
      };

      if (abilityKeys[e.code] !== undefined && !paused) {
        const abilityType = abilityKeys[e.code];
        // Abilities unlock by score (Dash is always available). Locked
        // abilities can't be cast — show how to unlock them instead.
        if (!isTutorialMode && score < abilityUnlockScore[abilityType]) {
          setPowerUpMessage(`Ability locked — unlocks at ${abilityUnlockScore[abilityType]} pts`);
          setTimeout(() => setPowerUpMessage(''), 1600);
        } else {
          const success = abilitySystem.useAbility(abilityType);
          if (success) {
            soundManager.play('powerUp', 0.6);
            gunModel.triggerAbility(); // Quick weapon flourish on cast
            // Quick Heal restores HP immediately
            if (abilityType === 'heal') {
              health = Math.min(100, health + 30);
              setPowerUpMessage('+30 Health');
              setTimeout(() => setPowerUpMessage(''), 1200);
              updateGameState();
            }
            // Create visual effect
            const effect = abilitySystem.createAbilityEffect(scene, camera.position, abilityType);
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
          setPowerUpMessage(`${weapon.name} Locked — ${weapon.unlockScore} pts needed`);
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
      // Don't auto-pause when losing pointer lock in multiplayer or during tutorial
      const inMultiplayerGame = isMultiplayer || gameMode === 'multiplayer';
      if (!document.pointerLockElement && !paused && !isGameOver && !inMultiplayerGame && !tutorialActiveRef.current) {
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
      // Left click to lock pointer (skip during tutorial popup)
      if (e.button === 0 && !isGameOver && !paused && !tutorialActiveRef.current && document.pointerLockElement !== renderer.domElement) {
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
      } else if (!isGameOver && !paused && !tutorialActiveRef.current) {
        renderer.domElement.requestPointerLock();
      }
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Builds a detailed rocket projectile for the launcher — body, warhead
    // nose, tail fins and a glowing exhaust, so the round reads as a real
    // rocket rather than a flat coloured dot.
    const createRocketProjectile = (): THREE.Mesh => {
      // Body geometry pre-rotated so the mesh's -Z axis is the nose direction
      const bodyGeo = new THREE.CylinderGeometry(0.13, 0.16, 1.0, 12);
      bodyGeo.rotateX(Math.PI / 2);
      const body = new THREE.Mesh(
        bodyGeo,
        new THREE.MeshStandardMaterial({ color: 0x4b5159, metalness: 0.6, roughness: 0.4 }),
      );
      body.castShadow = true;

      // Warhead nose cone
      const noseGeo = new THREE.ConeGeometry(0.16, 0.55, 12);
      noseGeo.rotateX(-Math.PI / 2);
      const nose = new THREE.Mesh(
        noseGeo,
        new THREE.MeshStandardMaterial({
          color: 0xc23a1a, metalness: 0.4, roughness: 0.5,
          emissive: 0x501608, emissiveIntensity: 0.6,
        }),
      );
      nose.position.z = -0.75;
      body.add(nose);

      // Tail fins
      const finMat = new THREE.MeshStandardMaterial({ color: 0x202428, metalness: 0.5, roughness: 0.6 });
      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.34, 0.34), finMat);
        const a = (f / 4) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.45);
        fin.rotation.z = a;
        body.add(fin);
      }

      // Glowing exhaust plume
      const exhaustGeo = new THREE.ConeGeometry(0.14, 0.7, 10);
      exhaustGeo.rotateX(Math.PI / 2); // flares backward (+Z)
      const exhaust = new THREE.Mesh(
        exhaustGeo,
        new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, opacity: 0.9, toneMapped: false }),
      );
      exhaust.position.z = 0.85;
      body.add(exhaust);

      // Engine glow light
      const glow = new THREE.PointLight(0xff7a22, 2.2, 9);
      glow.position.z = 0.9;
      body.add(glow);

      return body;
    };

    // Enhanced shooting
    const shoot = () => {
      if (ammo > 0 && !isGameOver && !paused && canShoot && !isReloading && !tutorialActiveRef.current) {
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

        const isLauncher = currentWeapon === 'launcher';

        for (let i = 0; i < bulletsToFire; i++) {
          const direction = new THREE.Vector3();
          camera.getWorldDirection(direction);

          // Reduce spread when aiming
          const spreadMultiplier = (isAiming && weapon.canAim) ? 0.2 : 1.0;
          direction.x += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.y += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.z += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.normalize();

          let bullet: THREE.Mesh;
          if (isLauncher) {
            // Launcher fires a real rocket projectile, oriented along its flight path
            bullet = createRocketProjectile();
            bullet.position.copy(camera.position);
            bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
          } else {
            // Shared geometry + cached material — no per-shot allocation
            bullet = new THREE.Mesh(sharedBulletGeo, getBulletMaterial(weapon.bulletColor));
            bullet.position.copy(camera.position);
          }
          scene.add(bullet);

          // Apply damage boost powerup if active
          const bulletDamage = damageBoostActive ? weapon.damage * damageBoostMultiplier : weapon.damage;

          bullets.push({
            mesh: bullet,
            velocity: direction.multiplyScalar(weapon.bulletSpeed),
            life: isLauncher ? 240 : 100,
            damage: bulletDamage,
            isRocket: isLauncher,
          });

          // Bullet tracer — rockets skip it (they trail their own exhaust glow)
          if (!isLauncher) {
            const tracerEnd = camera.position.clone().add(direction.clone().multiplyScalar(50));
            const tracer = new BulletTracer(scene, camera.position.clone(), tracerEnd, weapon.bulletColor);
            bulletTracers.push(tracer);
          }
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

        // FOV punch — subtle widening on each shot
        fovPunch = Math.min(fovPunch + recoilAmount * 60, 3);

        // CAMERA RECOIL — a real kick up the player has to ride and control.
        // Pitch climbs each shot (capped), with a small random horizontal
        // sway so sustained fire walks the aim like a real weapon.
        recoilPitch = Math.min(recoilPitch + recoilAmount * 2.7, 0.34);
        recoilYaw += (Math.random() - 0.5) * recoilAmount * 1.6;
        recoilYaw = Math.max(-0.12, Math.min(0.12, recoilYaw));
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

      if (e.button === 0 && !paused && !isGameOver && !tutorialActiveRef.current) {
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
      if (renderer.domElement && !paused && !isGameOver && !tutorialActiveRef.current) {
        renderer.domElement.requestPointerLock();
      }
    }, 200);

    const onMouseMove = (e: MouseEvent) => {
      if (!paused && !isGameOver) {
        if (document.pointerLockElement === renderer.domElement || mouseDown) {
          // Mouse only updates the BASE aim (`euler`). The render loop
          // composes base aim + recoil into the final camera rotation, so
          // recoil and mouse input never corrupt each other.
          const baseSens = 0.002 * sensitivityMultiplier;
          euler.y -= e.movementX * baseSens;
          euler.x -= e.movementY * baseSens;
          euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
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

    // Push the initial state to the HUD immediately so it reflects the real
    // starting values (e.g. all weapons already unlocked in Tutorial mode)
    // instead of waiting for the first shot / weapon switch.
    updateGameState();

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

    // Extracted enemy-kill handler — shared by direct bullet hits and the
    // rocket launcher's area-of-effect so score, combos, drops, achievements
    // and wave progression all behave identically however an enemy dies.
    const handleEnemyKilled = (enemy: Enemy, isCritical: boolean) => {
      enemy.dead = true;
      enemy.deathTime = 1.0;
      score += enemy.scoreValue;
      enemiesKilled++;
      soundManager.play('enemyDeath', 0.6);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      if (isCritical) {
        timeScale = 0.3;
        setTimeout(() => { timeScale = 1.0; }, 200);
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
      adaptiveDifficulty.recordKill(killTime);
      spawnSystem.recordKill(enemy.mesh.position, enemy.type);
      combatCoach.recordShot(true, isCritical);
      missionSystem.updateProgress('elimination', 1);
      if (enemy.type === 'boss') missionSystem.updateProgress('boss_hunt', 1);
      if (killStreak >= 3) missionSystem.updateProgress('streak', 1);
      if (combo >= 3) missionSystem.updateProgress('combo', 1);
      tutorial.recordAction('kill', 1);
      if (isCritical) triggerHeadshotFlash(); else triggerKillFlash();
      skillTree.awardPoints(1);
      const stState = skillTree.getState();
      setSkillTreeData({
        skills: skillTree.getAllSkills(),
        availablePoints: stState.availablePoints,
        spentPoints: stState.spentPoints,
        totalPoints: stState.totalPoints,
        detectedPlayStyle: 'balanced',
        recommendations: [],
      });
      if (gameSettingsManager.getSetting('killFeed')) {
        if (isCritical) addKillFeedEntry('HEADSHOT!', 'headshot');
        else addKillFeedEntry('Enemy Eliminated', 'kill');
        if (combo >= 5 && combo % 5 === 0) addKillFeedEntry(`${combo}x COMBO!`, 'combo');
        if (killStreak === 10) addKillFeedEntry('10 Kill Streak!', 'combo');
        else if (killStreak === 20) addKillFeedEntry('20 Kill Streak!', 'combo');
        else if (killStreak === 30) addKillFeedEntry('30 Kill Streak! UNSTOPPABLE!', 'combo');
      }
      createParticles(enemy.mesh.position, 0x00ff00, 8);
      achievementSystem.updateProgress('first_blood', 1);
      if (enemiesKilled >= 10) achievementSystem.updateProgress('slayer', 1);
      if (enemiesKilled >= 50) achievementSystem.updateProgress('assassin', 1);
      if (enemiesKilled >= 100) achievementSystem.updateProgress('legend', 1);
      if (isCritical) {
        achievementSystem.updateProgress('marksman', 1);
        achievementSystem.updateProgress('ace', 1);
      }
      if (combo >= 5) achievementSystem.updateProgress('perfectionist', 1);
      if (isMultiplayer && multiplayerManager) multiplayerManager.incrementKills();
      if (Math.random() < 0.4) {
        const ammoDrop = createPowerUp(enemy.mesh.position.x, enemy.mesh.position.z, 'ammo');
        powerUps.push(ammoDrop);
      }
      updateGameState();
      // Wave complete — only once the whole wave budget has spawned AND
      // every living enemy is dead. Tutorial mode has no wave progression.
      const livingEnemies = enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
      if (!isTutorialMode && waveEnemiesRemaining <= 0 && livingEnemies === 0 && !waveTransitioning) {
        waveTransitioning = true;
        wave++;
        combo = 0;
        killStreak = 0;
        setShowWaveComplete(true);
        soundManager.play('waveComplete', 1.0);
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Wave ${wave - 1} Complete!`, 'wave');
        waveTimeoutId = window.setTimeout(() => {
          waveTimeoutId = null;
          setShowWaveComplete(false);
          spawnWave();
          waveTransitioning = false;
        }, 3000);
        updateGameState();
      }
    };

    // Leaves a temporary scorched crater ("ditch") at an explosion site.
    const createCrater = (pos: THREE.Vector3) => {
      const crater = new THREE.Group();
      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(4.6, 28),
        new THREE.MeshStandardMaterial({
          color: 0x070604, roughness: 1, metalness: 0,
          transparent: true, opacity: 0.92, depthWrite: false,
        }),
      );
      scorch.rotation.x = -Math.PI / 2;
      scorch.receiveShadow = true;
      crater.add(scorch);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.1, 4.85, 28),
        new THREE.MeshStandardMaterial({
          color: 0x241509, roughness: 1,
          transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      crater.add(ring);
      // Debris chunks thrown up around the rim
      const debrisMat = new THREE.MeshStandardMaterial({
        color: 0x1c1206, roughness: 0.95, transparent: true, opacity: 1,
      });
      for (let d = 0; d < 10; d++) {
        const a = (d / 10) * Math.PI * 2 + Math.random() * 0.5;
        const r = 3 + Math.random() * 1.9;
        const s = 0.3 + Math.random() * 0.55;
        const chunk = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.7, s), debrisMat);
        chunk.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
        chunk.rotation.set(Math.random(), Math.random(), Math.random());
        chunk.castShadow = true;
        crater.add(chunk);
      }
      // Remember each part's starting opacity so the fade-out is proportional
      crater.traverse((o) => {
        if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
          o.material.userData.baseOpacity = (o.material as THREE.Material & { opacity: number }).opacity;
        }
      });
      crater.position.set(pos.x, 0.06, pos.z);
      scene.add(crater);
      craters.push({ mesh: crater, life: 10, maxLife: 10 });
    };

    // Explosion flash, sparks, smoke, shake and crater.
    const spawnExplosionFX = (pos: THREE.Vector3) => {
      soundManager.play('enemyDeath', 0.9);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      createParticles(pos, 0xff7722, 60);
      createParticles(pos, 0x222222, 28);
      const flash = new THREE.PointLight(0xff8a3a, 45, 38);
      flash.position.set(pos.x, pos.y + 1, pos.z);
      scene.add(flash);
      let step = 0;
      const fade = () => {
        step++;
        flash.intensity = 45 * (1 - step / 7);
        if (step >= 7) scene.remove(flash);
        else setTimeout(fade, 38);
      };
      setTimeout(fade, 38);
      createCrater(pos);
    };

    // Detonates a rocket — area-of-effect damage with distance falloff.
    const explodeRocket = (pos: THREE.Vector3, baseDamage: number) => {
      const RADIUS = 9;
      spawnExplosionFX(pos);
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.dead) continue;
        const dist = e.mesh.position.distanceTo(pos);
        if (dist > RADIUS) continue;
        // Full damage at the centre, tapering to ~35% at the blast edge
        const falloff = 1 - (dist / RADIUS) * 0.65;
        const dmg = baseDamage * falloff;
        e.health -= dmg;
        e.damageFlashTime = 0.4;
        adaptiveDifficulty.recordDamage(dmg, true);
        if (gameSettingsManager.getSetting('damageNumbers')) {
          _tempVec3_2.copy(e.mesh.position).project(camera);
          const sx = (_tempVec3_2.x * 0.5 + 0.5) * 100;
          const sy = (-_tempVec3_2.y * 0.5 + 0.5) * 100;
          addDamageNumber(Math.floor(dmg), sx, sy, false, false);
        }
        _tempVec3.subVectors(e.mesh.position, pos).normalize();
        bloodSplatters.push(new BloodSplatter(scene, e.mesh.position.clone(), _tempVec3, 10));
        if (e.health <= 0) handleEnemyKilled(e, false);
      }
    };

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
      // Special-weather maps keep their distinctive fog/sky every frame —
      // otherwise the day-cycle would overwrite the map's atmosphere after the
      // first frame, making every map look the same.
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor);
        scene.fog.density = mapConfig.hasSpecialWeather ? blendedFogDensity : atmosphericSettings.fogDensity;
      }
      if (scene.background instanceof THREE.Color) {
        scene.background.setHex(mapConfig.hasSpecialWeather ? mapConfig.skyColor : atmosphericSettings.skyColor);
      }

      // Update main light — position follows player so shadow frustum stays on-screen
      mainLight.color.setHex(atmosphericSettings.lightColor);
      mainLight.intensity = atmosphericSettings.lightIntensity;
      mainLightBaseOffset.set(
        atmosphericSettings.lightPosition.x,
        atmosphericSettings.lightPosition.y,
        atmosphericSettings.lightPosition.z
      );
      mainLight.position.set(
        camera.position.x + mainLightBaseOffset.x,
        mainLightBaseOffset.y,
        camera.position.z + mainLightBaseOffset.z
      );
      mainLight.target.position.set(camera.position.x, 0, camera.position.z);
      mainLight.target.updateMatrixWorld();

      // Keep volumetric, fill, and rim lights aimed at the player too
      volumetricLightBaseOffset.set(
        atmosphericSettings.lightPosition.x * 0.5,
        atmosphericSettings.lightPosition.y * 0.8,
        atmosphericSettings.lightPosition.z * 0.5
      );
      volumetricLight.color.setHex(atmosphericSettings.sunVisible ? 0xffe8b8 : 0x9aaee0);
      volumetricLight.intensity = atmosphericSettings.sunVisible ? 0.55 : 0.7;
      volumetricLight.position.set(
        camera.position.x + volumetricLightBaseOffset.x,
        volumetricLightBaseOffset.y,
        camera.position.z + volumetricLightBaseOffset.z
      );
      volumetricLight.target.position.set(camera.position.x, 0, camera.position.z);
      volumetricLight.target.updateMatrixWorld();

      fillLightBaseOffset.set(
        -atmosphericSettings.lightPosition.x * 0.6,
        atmosphericSettings.lightPosition.y * 0.4,
        -atmosphericSettings.lightPosition.z * 0.6
      );
      fillLight.color.setHex(atmosphericSettings.sunVisible ? 0xbcd6ff : 0x8a9ccc);
      fillLight.intensity = atmosphericSettings.sunVisible ? 0.45 : 0.85;
      fillLight.position.set(
        camera.position.x + fillLightBaseOffset.x,
        fillLightBaseOffset.y,
        camera.position.z + fillLightBaseOffset.z
      );
      fillLight.target.position.set(camera.position.x, 0, camera.position.z);
      fillLight.target.updateMatrixWorld();

      rimLightBaseOffset.set(
        atmosphericSettings.lightPosition.x * 0.3,
        atmosphericSettings.lightPosition.y * 1.2,
        atmosphericSettings.lightPosition.z
      );
      rimLight.color.setHex(atmosphericSettings.sunVisible ? 0xffffff : 0xd6e4ff);
      rimLight.intensity = atmosphericSettings.sunVisible ? 0.6 : 1.0;
      rimLight.position.set(
        camera.position.x + rimLightBaseOffset.x,
        rimLightBaseOffset.y,
        camera.position.z + rimLightBaseOffset.z
      );
      rimLight.target.position.set(camera.position.x, 0, camera.position.z);
      rimLight.target.updateMatrixWorld();

      // Update ambient light
      ambientLight.color.setHex(atmosphericSettings.ambientColor);
      ambientLight.intensity = atmosphericSettings.ambientIntensity;

      // Keep hemisphere light synced with current sky & ground tones
      const curSkyCol = new THREE.Color(atmosphericSettings.skyColor);
      skyLight.color.copy(curSkyCol);
      skyLight.groundColor.copy(curSkyCol).multiplyScalar(0.35);
      skyLight.intensity = atmosphericSettings.ambientIntensity * 0.9;

      // Nighttime moonlight fill + attached lantern so players can see
      nightFillLight.intensity = atmosphericSettings.sunVisible ? 0.0 : 1.1;
      playerNightLantern.intensity = atmosphericSettings.sunVisible ? 0.0 : 1.4;

      // Keep the sky dome centered on the player so the player never walks
      // "outside" the sphere (which is what caused the giant-blob glitch).
      skyDome.position.set(camera.position.x, 0, camera.position.z);

      // Update post-processing uniforms
      finalMaterial.uniforms.contrast.value = atmosphericSettings.contrast;
      finalMaterial.uniforms.saturation.value = atmosphericSettings.saturation;
      finalMaterial.uniforms.colorTint.value = atmosphericSettings.colorTint;
      finalMaterial.uniforms.temperature.value = atmosphericSettings.temperature;

      // Update sky dome shader
      if (skyMaterial.uniforms.time) {
        skyMaterial.uniforms.time.value += delta;
      }
      if (skyMaterial.uniforms.sunPosition) {
        skyMaterial.uniforms.sunPosition.value.set(
          atmosphericSettings.lightPosition.x,
          atmosphericSettings.lightPosition.y,
          atmosphericSettings.lightPosition.z
        );
      }
      if (skyMaterial.uniforms.isNight) {
        skyMaterial.uniforms.isNight.value = !atmosphericSettings.sunVisible;
      }
      // Keep the sky gradient synced with the day-night cycle (and the map's
      // own atmosphere for special-weather maps) so it never drifts dark.
      if (skyMaterial.uniforms.skyColorTop) {
        skyMaterial.uniforms.skyColorTop.value.setHex(
          mapConfig.hasSpecialWeather ? mapConfig.skyColor : atmosphericSettings.skyColor
        );
      }
      if (skyMaterial.uniforms.skyColorHorizon) {
        skyMaterial.uniforms.skyColorHorizon.value.setHex(
          mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor
        );
      }

      // === UPDATE ENHANCED SYSTEMS ===
      // Update ability system
      const abilityEffects = abilitySystem.update(delta);

      // Push ability cooldown state to the HUD ability bar (throttled — the
      // CSS transition smooths the gaps between updates).
      abilityHudAccum += rawDelta;
      if (abilityHudAccum >= 0.12) {
        abilityHudAccum = 0;
        const abil = (type: 'shield' | 'speed' | 'invincible' | 'heal') => {
          const a = abilitySystem.getAbility(type);
          return {
            cooldown: abilitySystem.getCooldownPercent(type) / 100,
            active: a ? a.active : false,
            unlocked: isTutorialMode || score >= abilityUnlockScore[type],
            unlockScore: abilityUnlockScore[type],
          };
        };
        setAbilityHud([
          {
            key: 'Q', name: 'Dash',
            cooldown: dashCooldown <= 0 ? 1 : Math.max(0, 1 - dashCooldown / dashCooldownTime),
            active: isDashing,
            unlocked: true,
            unlockScore: 0,
          },
          { key: 'E', name: 'Shield', ...abil('shield') },
          { key: 'F', name: 'Sprint', ...abil('speed') },
          { key: 'V', name: 'Ghost', ...abil('invincible') },
          { key: 'B', name: 'Heal', ...abil('heal') },
        ]);
      }

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

      // Update tutorial — propagate state to React (throttled to avoid 60fps re-renders)
      if (tutorial.isActive()) {
        const step = tutorial.getCurrentStep();
        const progress = tutorial.getProgress();
        // Only update React state when step actually changes
        if (step && step.id !== (tutorialRef.current as any)?._lastStepId) {
          (tutorialRef.current as any)._lastStepId = step.id;
          setTutorialStep({ ...step });
          setTutorialProgress(progress);
          tutorialActiveRef.current = true;
          // Safety: exit pointer lock so cursor is visible for new tutorial popup
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
      } else if (showTutorial) {
        // Tutorial completed — close overlay
        setShowTutorial(false);
        setTutorialStep(null);
        tutorialActiveRef.current = false;
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

      // Drive the grass wind sway
      biomeSystem.updateGrass(clock.getElapsedTime());

      // Freeze the whole simulation while a tutorial overlay card is on screen
      // — the scene still renders, but nothing moves and enemies cannot attack.
      if (isGameOver || paused || tutorialActiveRef.current) {
        // Render paused state (with or without post-processing based on quality)
        if (graphicsPreset.postProcessing) {
          composePostFX();
        } else {
          renderer.render(scene, camera);
        }
        return;
      }

      // Update gun animations - recoil handles its own offset
      gunModel.updateRecoil(delta);

      // Re-read the FOV setting a few times a second so changes made in the
      // settings menu (even mid-game from the pause screen) apply live.
      fovCheckAccum += rawDelta;
      if (fovCheckAccum >= 0.4) {
        fovCheckAccum = 0;
        const liveFov = gameSettingsManager.getSetting('fov');
        if (typeof liveFov === 'number' && liveFov > 0) baseFOV = liveFov;
      }

      // Aiming zoom — a consistent ~22° zoom relative to the chosen FOV
      const targetFov = (isAiming && WEAPONS[currentWeapon].canAim)
        ? Math.max(40, baseFOV - 22)
        : baseFOV;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov + fovPunch, delta * 8);
      camera.updateProjectionMatrix();
      // Decay FOV punch
      fovPunch *= 0.92;

      // === CAMERA RECOIL ===
      // Recover the recoil kick smoothly, then compose (base aim + recoil)
      // into the final camera rotation. Aiming down sights tightens recoil.
      const recoilRecover = Math.min(1, rawDelta * 8.5);
      recoilPitch += (0 - recoilPitch) * recoilRecover;
      recoilYaw += (0 - recoilYaw) * recoilRecover;
      _recoilEuler.set(
        Math.max(-PI_2, Math.min(PI_2, euler.x + recoilPitch)),
        euler.y + recoilYaw,
        0,
        'YXZ',
      );
      camera.quaternion.setFromEuler(_recoilEuler);

      // Update ambient particles — drift and re-center around player
      if (ambientParticles) {
        const posAttr = ambientParticles.geometry.getAttribute('position') as THREE.BufferAttribute;
        const vels = (ambientParticles.geometry as any)._velocities as Float32Array;
        const phs = (ambientParticles.geometry as any)._phases as Float32Array;
        const elapsed = clock.getElapsedTime();

        for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
          const ix = i * 3;
          // Gentle sine drift
          posAttr.array[ix] += vels[ix] * delta + Math.sin(elapsed * 0.5 + phs[i]) * 0.005;
          posAttr.array[ix + 1] += vels[ix + 1] * delta + Math.sin(elapsed * 0.3 + phs[i] * 2) * 0.003;
          posAttr.array[ix + 2] += vels[ix + 2] * delta + Math.cos(elapsed * 0.4 + phs[i]) * 0.005;

          // Re-center particles that drift too far from player
          const dx = posAttr.array[ix] - camera.position.x;
          const dz = posAttr.array[ix + 2] - camera.position.z;
          if (Math.abs(dx) > 30 || Math.abs(dz) > 30 || posAttr.array[ix + 1] < 0.5 || posAttr.array[ix + 1] > 12) {
            posAttr.array[ix] = camera.position.x + (Math.random() - 0.5) * 50;
            posAttr.array[ix + 1] = 1 + Math.random() * 8;
            posAttr.array[ix + 2] = camera.position.z + (Math.random() - 0.5) * 50;
          }
        }
        posAttr.needsUpdate = true;
      }

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
      gunModel.updateAim(delta, isAiming && WEAPONS[currentWeapon].canAim === true);
      // Lowered "folded" carry pose while sprinting (not while shooting)
      gunModel.updateSprint(delta, isRunning && isMoving && !isCrouching && !mouseDown);
      // Airborne weapon inertia + landing dip
      gunModel.updateJump(delta, isJumping, velocityY);
      // Decay one-shot flourishes (dash, abilities)
      gunModel.updateActions(delta);
      gunModel.applyAnimations(); // Combine all animation offsets into final transform

      // Animate the player's ground-shadow legs into a walking/running stride
      if (shadowLeftLeg && shadowRightLeg) {
        if (isMoving) {
          shadowWalkTime += rawDelta * (isRunning ? 11 : 7);
          const swing = Math.sin(shadowWalkTime) * (isRunning ? 0.8 : 0.5);
          shadowLeftLeg.rotation.x = swing;
          shadowRightLeg.rotation.x = -swing;
        } else {
          shadowLeftLeg.rotation.x *= 0.85;
          shadowRightLeg.rotation.x *= 0.85;
        }
      }

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
        // Heavier weapons reduce jump height, but only mildly — even the
        // minigun should still clear most obstacles for responsive movement.
        const jumpMultiplier = Math.max(0.78, Math.pow(weaponWeight, -0.28));
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

      // Resolve any obstacle penetration (e.g. landed inside a rock after a jump)
      resolveTerrainPenetration();

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

      // Update explosion craters — fade out, then dispose
      for (let i = craters.length - 1; i >= 0; i--) {
        const crater = craters[i];
        crater.life -= rawDelta;
        if (crater.life <= 0) {
          crater.mesh.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              const m = o.material;
              if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
              else m.dispose();
            }
          });
          scene.remove(crater.mesh);
          craters.splice(i, 1);
          continue;
        }
        // Hold fully visible for the first 70%, then fade over the last 30%
        const fadeT = Math.min(1, crater.life / (crater.maxLife * 0.3));
        crater.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh && !Array.isArray(o.material)) {
            const mat = o.material as THREE.Material & { opacity: number };
            mat.opacity = (mat.userData.baseOpacity ?? 1) * fadeT;
          }
        });
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
                setPowerUpMessage('+30 Health Restored');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Health Restored', 'powerup');
                // Visual feedback - green flash
                createParticles(camera.position, 0x00ff00, 15);
                break;
              case 'ammo':
                ammo = WEAPONS[currentWeapon].maxAmmo;
                setPowerUpMessage('Ammo Refilled');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Ammo Refilled', 'powerup');
                // Visual feedback - yellow flash
                createParticles(camera.position, 0xffff00, 10);
                break;
              case 'speed':
                // ACTUALLY APPLY SPEED BOOST
                speedBoostActive = true;
                speedBoostEndTime = Date.now() + speedBoostDuration;
                setPowerUpMessage('Speed Boost · 10s');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Speed Boost Active!', 'powerup');
                // Visual feedback - cyan particles
                createParticles(camera.position, 0x00ffff, 20);
                break;
              case 'damage':
                // DAMAGE BOOST - Double damage for 15 seconds
                damageBoostActive = true;
                damageBoostEndTime = Date.now() + damageBoostDuration;
                setPowerUpMessage('Damage Boost · 15s');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Damage Boost Active!', 'powerup');
                // Visual feedback - orange particles
                createParticles(camera.position, 0xff4400, 20);
                break;
              case 'shield':
                // SHIELD - Absorbs 50 damage
                shieldActive = true;
                shieldHealth = shieldMaxHealth;
                setPowerUpMessage('Shield Active · 50 HP');
                if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Shield Active!', 'powerup');
                // Visual feedback - blue particles
                createParticles(camera.position, 0x0099ff, 25);
                break;
              case 'infinite_ammo':
                // INFINITE AMMO - Unlimited ammo for 20 seconds
                infiniteAmmoActive = true;
                infiniteAmmoEndTime = Date.now() + infiniteAmmoDuration;
                setPowerUpMessage('Infinite Ammo · 20s');
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

        // Rockets detonate on contact with the ground or any obstacle they
        // are at/below the height of (trees, walls), creating an AoE blast.
        if (bullet.isRocket) {
          const rp = bullet.mesh.position;
          let hitTerrain = rp.y <= 0.4;
          if (!hitTerrain) {
            for (const obj of terrainObjects) {
              if (!obj.collidable) continue;
              const dx = rp.x - obj.x;
              const dz = rp.z - obj.z;
              if (dx * dx + dz * dz < obj.radius * obj.radius
                  && (obj.height === undefined || rp.y <= obj.height)) {
                hitTerrain = true;
                break;
              }
            }
          }
          if (hitTerrain) {
            explodeRocket(rp.clone(), bullet.damage);
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
            continue;
          }
        }

        if (bullet.life <= 0) {
          // A rocket that runs out of range still detonates where it stops
          if (bullet.isRocket) explodeRocket(bullet.mesh.position.clone(), bullet.damage);
          scene.remove(bullet.mesh);
          bullets.splice(i, 1);
          continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
          const enemy = enemies[j];
          if (!enemy.dead && checkCollision(bullet.mesh.position, enemy.mesh.position, 2)) {
            // Rockets explode on first contact — the blast handles all damage
            if (bullet.isRocket) {
              explodeRocket(bullet.mesh.position.clone(), bullet.damage);
              scene.remove(bullet.mesh);
              bullets.splice(i, 1);
              break;
            }
            // === CRITICAL HIT SYSTEM (HEADSHOTS) ===
            let damage = bullet.damage;
            let isCritical = false;

            // Check if bullet hit the head - reuse temp vector.
            // The head mesh sits at local y≈1.9 and the whole enemy group is
            // scaled by its type scale, so the head's true world height is
            // position.y + 1.9 * scale. Using a flat +1.0 made the crit zone
            // land on the chest and miss the visible head entirely.
            const hsScale = enemy.type === 'fast' ? 0.7 : enemy.type === 'tank' ? 1.5 : enemy.type === 'boss' ? 2.0 : 1.0;
            _tempVec3.set(
              enemy.mesh.position.x,
              enemy.mesh.position.y + 1.9 * hsScale,
              enemy.mesh.position.z
            );
            const distanceToHead = bullet.mesh.position.distanceTo(_tempVec3);

            if (distanceToHead < 0.8 * hsScale) {
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
              handleEnemyKilled(enemy, isCritical);
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
        let distance = enemy.mesh.position.distanceTo(camera.position);

        // === ANTI-ESCAPE RECYCLING ===
        // An enemy that falls far behind — deep in the fog, out of sight —
        // is relocated into a ring around the player. You can't outrun the
        // wave; enemies keep closing in from every side until it's cleared.
        if (distance > 96) {
          const ang = Math.random() * Math.PI * 2;
          const rad = 46 + Math.random() * 22;
          enemy.mesh.position.x = camera.position.x + Math.cos(ang) * rad;
          enemy.mesh.position.z = camera.position.z + Math.sin(ang) * rad;
          enemy.mesh.position.y = groundY;
          distance = enemy.mesh.position.distanceTo(camera.position);
        }

        if (distance > MAX_AI_UPDATE_DISTANCE) {
          // Distant enemies: simple seek toward the player, frame-rate
          // independent (×60 matches the close-range step) so they keep pace.
          _tempVec3.subVectors(camera.position, enemy.mesh.position).normalize();
          enemy.mesh.position.x += _tempVec3.x * enemy.speed * delta * 60;
          enemy.mesh.position.z += _tempVec3.z * enemy.speed * delta * 60;
          enemy.mesh.position.y = groundY;
          enemy.mesh.rotation.y = Math.atan2(_tempVec3.x, _tempVec3.z);
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

          // === STEERING + OBSTACLE AVOIDANCE ===
          // Seek the AI target, then add a repulsion force away from nearby
          // trees/rocks so the enemy smoothly arcs around obstacles instead of
          // walking into them and getting stuck.
          const seekTarget = enemy.isDodging ? enemy.targetPosition : aiDecision.targetPosition;
          let steerX = seekTarget.x - enemy.mesh.position.x;
          let steerZ = seekTarget.z - enemy.mesh.position.z;
          {
            const sl = Math.hypot(steerX, steerZ) || 1;
            steerX /= sl; steerZ /= sl;
          }
          // Repulsion from collidable terrain
          for (let k = 0; k < terrainObjects.length; k++) {
            const obj = terrainObjects[k];
            if (!obj.collidable) continue;
            const ox = enemy.mesh.position.x - obj.x;
            const oz = enemy.mesh.position.z - obj.z;
            const influence = obj.radius + 4.0;
            if (Math.abs(ox) > influence || Math.abs(oz) > influence) continue;
            const od = Math.hypot(ox, oz);
            if (od > 0.001 && od < influence) {
              const t = (influence - od) / influence;
              const push = t * t * 2.6;
              steerX += (ox / od) * push;
              steerZ += (oz / od) * push;
            }
          }
          // Light separation from other enemies (reduces clumping)
          for (let k = 0; k < enemies.length; k++) {
            const other = enemies[k];
            if (other === enemy || other.dead) continue;
            const ox = enemy.mesh.position.x - other.mesh.position.x;
            const oz = enemy.mesh.position.z - other.mesh.position.z;
            if (Math.abs(ox) > 2.6 || Math.abs(oz) > 2.6) continue;
            const od = Math.hypot(ox, oz);
            if (od > 0.001 && od < 2.6) {
              const push = ((2.6 - od) / 2.6) * 0.95;
              steerX += (ox / od) * push;
              steerZ += (oz / od) * push;
            }
          }
          {
            const sl = Math.hypot(steerX, steerZ) || 1;
            steerX /= sl; steerZ /= sl;
          }

          // === MOVEMENT ===
          const isMoving = distance > 2.2 && (!enemy.attackSystem || enemy.attackSystem.canMove());

          if (isMoving) {
            // Frame-rate independent step (×60 keeps the original 60fps feel)
            const speedMul = enemy.isDodging ? 3.0 : aiDecision.moveSpeed;
            const step = enemy.speed * speedMul * delta * 60;
            const px = enemy.mesh.position.x;
            const pz = enemy.mesh.position.z;
            const stepX = steerX * step;
            const stepZ = steerZ * step;

            // Move with wall-sliding — if the full step is blocked, slide along
            // each axis so the enemy never dead-stops against a tree.
            let movedX = 0, movedZ = 0;
            if (!checkTerrainCollision(px + stepX, pz + stepZ)) {
              enemy.mesh.position.x = px + stepX;
              enemy.mesh.position.z = pz + stepZ;
              movedX = stepX; movedZ = stepZ;
            } else if (!checkTerrainCollision(px + stepX, pz)) {
              enemy.mesh.position.x = px + stepX;
              movedX = stepX;
            } else if (!checkTerrainCollision(px, pz + stepZ)) {
              enemy.mesh.position.z = pz + stepZ;
              movedZ = stepZ;
            }
            const movedLen = Math.hypot(movedX, movedZ);

            // Face the actual direction of travel for natural walking; when
            // essentially blocked, keep facing the player.
            let faceX: number, faceZ: number;
            if (movedLen > 0.0005) { faceX = movedX; faceZ = movedZ; }
            else { faceX = camera.position.x - enemy.mesh.position.x; faceZ = camera.position.z - enemy.mesh.position.z; }
            const targetAngle = Math.atan2(faceX, faceZ);
            let angleDiff = targetAngle - enemy.mesh.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            enemy.mesh.rotation.y += angleDiff * Math.min(1, delta * 9);

            // Walk animation driven by how far the enemy ACTUALLY moved this
            // frame — the stride stays planted to the ground (no gliding) and
            // the legs stop when the enemy is blocked.
            enemy.walkTime += movedLen * (enemy.isDodging ? 4.2 : 2.8);
            const walkPhase = enemy.walkTime;
            const stride = movedLen > 0.0005 ? 0.62 : 0.0;
            if (enemy.leftLeg && enemy.rightLeg) {
              enemy.leftLeg.rotation.x = THREE.MathUtils.lerp(enemy.leftLeg.rotation.x, Math.sin(walkPhase) * stride, 0.2);
              enemy.rightLeg.rotation.x = THREE.MathUtils.lerp(enemy.rightLeg.rotation.x, Math.sin(walkPhase + Math.PI) * stride, 0.2);
            }
            if (enemy.leftArm && enemy.rightArm) {
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, Math.sin(walkPhase + Math.PI) * stride * 0.7, 0.18);
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, Math.sin(walkPhase) * stride * 0.7, 0.18);
            }
            // Body bob synced to the stride
            const bodyBob = Math.abs(Math.sin(walkPhase)) * 0.07 * (movedLen > 0.0005 ? 1 : 0);
            enemy.mesh.position.y = groundY + bodyBob;
            if (enemy.torso) {
              enemy.torso.rotation.x = THREE.MathUtils.lerp(enemy.torso.rotation.x, enemy.isDodging ? 0.14 : 0.05, 0.1);
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
            // Tutorial mode grants unlimited health — the player can never be
            // hurt, so the tutorial is a safe, pressure-free practice space.
            // An eliminated player takes no further damage (spectating).
            if (!abilityEffects.isInvincible && !isTutorialMode && !playerEliminated) {
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
                setPowerUpMessage(`Shield · ${shieldHealth}/${shieldMaxHealth}`);
                if (shieldHealth <= 0) {
                  shieldActive = false;
                  setPowerUpMessage('Shield Broken');
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
                playerEliminated = true; // Latch — no more damage / re-deaths
                document.exitPointerLock();

                // Sync death in multiplayer
                if (isMultiplayer && multiplayerManager) {
                  multiplayerManager.updatePlayerHealth(0);

                  // Broadcast killer info so every player (especially the victim)
                  // knows who/what killed them in real time
                  const enemyTypeLabel =
                    enemy.type === 'boss' ? 'Boss' :
                    enemy.type === 'tank' ? 'Tank' :
                    enemy.type === 'fast' ? 'Stalker' :
                    'Forest Creature';
                  const victim = multiplayerManager.getLocalPlayer();
                  multiplayerManager.broadcastKill(
                    enemyTypeLabel,
                    victim.id,
                    victim.name,
                    victim.color,
                    enemyTypeLabel
                  );

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
        composePostFX();
      } else {
        // Low quality: Direct render (no post-processing for maximum performance)
        renderer.render(scene, camera);
      }
    };

    // === SHADER PRE-WARM ===
    // The first time a material is rendered the GPU compiles + links its
    // shader program — a synchronous stall that caused the brief freeze on
    // the first shot. Spawn one of every combat effect, render a full frame
    // (which compiles every shader program), then clean them up. After this
    // all gameplay shaders are hot and firing is hitch-free.
    const warmUpShaders = () => {
      const wp = camera.position.clone();
      wp.z -= 4; // just in front of the camera
      const warm: THREE.Object3D[] = [];

      const warmBullet = new THREE.Mesh(sharedBulletGeo, getBulletMaterial(0xffff00));
      warmBullet.position.copy(wp);
      scene.add(warmBullet); warm.push(warmBullet);

      const warmRocket = createRocketProjectile();
      warmRocket.position.copy(wp);
      scene.add(warmRocket); warm.push(warmRocket);

      const warmFlash = new MuzzleFlash(scene, wp, 0xffaa00);
      const warmTracer = new BulletTracer(scene, wp, wp.clone(), 0xffffaa);
      const warmImpact = new ImpactEffect(scene, wp, 0xffaa00, 2);
      const warmBlood = new BloodSplatter(scene, wp, new THREE.Vector3(0, 1, 0), 2);

      try {
        // A real frame compiles every shader program in every render path
        if (graphicsPreset.postProcessing) composePostFX();
        else renderer.render(scene, camera);
      } catch (err) {
        console.warn('[Warmup] pre-compile render failed:', err);
      }

      // Tear the warmup objects back down — they were only here to compile
      warm.forEach(o => scene.remove(o));
      warmFlash.dispose(scene);
      warmTracer.dispose(scene);
      warmImpact.dispose(scene);
      warmBlood.dispose(scene);
      warmRocket.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose();
        }
      });
      // sharedBulletGeo / cached bullet material are reused — not disposed
    };
    warmUpShaders();

    animate();

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      const newWidth = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
      const newHeight = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);
      renderer.setSize(newWidth, newHeight, false);
      renderTarget1.setSize(newWidth, newHeight);
      const halfW = Math.max(1, Math.floor(newWidth / 2));
      const halfH = Math.max(1, Math.floor(newHeight / 2));
      bloomTarget.setSize(halfW, halfH);
      bloomTargetB.setSize(halfW, halfH);
      blurMaterial.uniforms.resolution.value.set(halfW, halfH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
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
        const pointerLockCleanup = (renderer.domElement as any)._mpPointerLockCleanup;
        if (typeof pointerLockCleanup === 'function') {
          pointerLockCleanup();
          delete (renderer.domElement as any)._mpPointerLockCleanup;
        }

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

      if (waveTimeoutId !== null) {
        clearTimeout(waveTimeoutId);
        waveTimeoutId = null;
      }

      // Detach the canvas safely. By the time this cleanup runs the game
      // view may already have been unmounted (e.g. for the game-over screen)
      // and re-mounted as a fresh node — so `mountRef.current` is now a
      // DIFFERENT div, and removeChild(oldCanvas) against it throws a
      // NotFoundError, aborting the rest of cleanup and crashing the restart.
      // .remove() detaches the element from wherever it is and never throws.
      renderer.domElement?.remove();

      // Cleanup post-processing
      renderTarget1.dispose();
      bloomTarget.dispose();
      bloomTargetB.dispose();
      brightPassMaterial.dispose();
      blurMaterial.dispose();
      finalMaterial.dispose();
      postQuad.geometry.dispose();

      // Cleanup shared bullet resources
      sharedBulletGeo.dispose();
      bulletMaterialCache.forEach(m => m.dispose());
      bulletMaterialCache.clear();

      // Cleanup weather system
      weatherSystem.clear();

      // Cleanup sky dome
      skyGeometry.dispose();
      if (skyMaterial instanceof THREE.Material) {
        skyMaterial.dispose();
      }

      // Cleanup SmartEnemyManager (releases pooled resources)
      smartEnemyManager.dispose();

      if (envMapTexture) {
        scene.environment = null;
        envMapTexture.dispose();
      }

      renderer.dispose();
    };
  }, [gameStarted, gameMode, classicDifficulty, classicTimeOfDay, selectedMap, multiplayerManager, gameRestartKey]);

  // Handle mode selection
  const handleModeSelection = () => {
    setGameMode('classic');
    setShowClassicMenu(true);
  };

  // Handle tutorial mode — start an easy game with tutorial forced on
  const handleTutorialMode = () => {
    setGameMode('tutorial');
    setClassicDifficulty('easy');
    setClassicTimeOfDay('day');
    setSelectedMap('deep_forest');
    soundManager.initialize();
    setGameStarted(true);
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
    multiplayerTimeLimitRef.current = timeLimit;
    soundManager.initialize();
    soundManager.unmute();
    setShowMultiplayerLobby(false);

    // Reset any lingering state from a prior round (safe even on initial start)
    setMultiplayerGameOver(false);
    setMultiplayerWinner(null);
    setIsSpectating(false);
    setMultiplayerKillFeed([]);
    setLastKillerInfo(null);
    setGameState({
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
    // In multiplayer, keep the lobby alive - reset state and re-broadcast game_start
    if (gameMode === 'multiplayer' && multiplayerManager) {
      // Guests should wait for host restart broadcast to avoid local desync.
      if (!multiplayerManager.isGameHost()) {
        console.log('[App] Guest requested restart - waiting for host game_restart');
        return;
      }

      console.log('[App] Restarting multiplayer game in existing lobby');

      // Reset UI state
      setMultiplayerGameOver(false);
      setMultiplayerWinner(null);
      setIsSpectating(false);
      setMultiplayerKillFeed([]);
      setLastKillerInfo(null);
      setGameState({
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

      soundManager.unmute();

      // Only host can trigger a restart for the lobby
      if (multiplayerManager.isGameHost()) {
        multiplayerManager.restartGame(undefined, multiplayerTimeLimitRef.current, selectedMap);
      }

      // Bump the restart key so the main game useEffect re-runs (fresh scene/state)
      setGameRestartKey(k => k + 1);
      return;
    }

    window.location.reload();
  };

  const returnToMenu = () => {
    // Multiplayer: cleanly disconnect from peers before reload
    if (multiplayerManager) {
      try {
        multiplayerManager.disconnect();
      } catch (err) {
        console.warn('[App] Error disconnecting multiplayer manager:', err);
      }
    }
    // Clear any multiplayer URL params so we return to the real menu
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('lobby');
      url.searchParams.delete('role');
      url.searchParams.delete('name');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  // Show mobile warning if on mobile device
  if (isMobile) {
    return <MobileWarning />;
  }

  // Main Menu (Initial Screen)
  if (gameMode === 'none') {
    return <MainMenu onClassicMode={handleModeSelection} onMultiplayerMode={handleMultiplayerMode} onTutorialMode={handleTutorialMode} t={t} />;
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
          killerInfo={lastKillerInfo}
          onMainMenu={returnToMenu}
        />
      </div>
    );
  }

  // Multiplayer Game Over - Show final results when game ends
  if (multiplayerGameOver && multiplayerManager) {
    const finalStats = multiplayerManager.getAllPlayers();
    const localPlayerId = multiplayerManager.getLocalPlayer().id;
    return <MultiplayerGameOver winnerId={multiplayerWinner || ''} finalStats={finalStats} localPlayerId={localPlayerId} onRestart={restartGame} onMainMenu={returnToMenu} canRestart={multiplayerManager.isGameHost()} />;
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
          hideStatsPanel={gameMode === 'multiplayer'}
          unlimitedHealth={gameMode === 'tutorial'}
          hideWave={gameMode === 'tutorial'}
          abilities={abilityHud}
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
          <div
            className="absolute top-1/2 left-1/2"
            style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95))' }}
          >
            {(() => {
              const cc = userSettings.crosshairColor;
              const style = userSettings.crosshairStyle;
              // Centered tick — `len` long, `pos` away from centre, in the given direction.
              const tick = (dir: 'up' | 'down' | 'left' | 'right', len: number, gap: number) => {
                const vertical = dir === 'up' || dir === 'down';
                const sign = dir === 'up' || dir === 'left' ? -1 : 1;
                const offset = sign * (gap + len / 2);
                return (
                  <div
                    key={dir}
                    className="absolute rounded-full"
                    style={{
                      backgroundColor: cc,
                      width: vertical ? 2 : len,
                      height: vertical ? len : 2,
                      left: '50%',
                      top: '50%',
                      transform: `translate(-50%, -50%) translate${vertical ? 'Y' : 'X'}(${offset}px)`,
                    }}
                  />
                );
              };
              const dot = (size: number) => (
                <div
                  className="absolute rounded-full"
                  style={{
                    backgroundColor: cc, width: size, height: size,
                    left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  }}
                />
              );
              const ring = (size: number) => (
                <div
                  className="absolute rounded-full"
                  style={{
                    border: `1.5px solid ${cc}`, width: size, height: size,
                    left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  }}
                />
              );

              if (style === 'dot') return dot(4);
              if (style === 'circle') return <>{ring(16)}{dot(2)}</>;
              if (style === 'dynamic') {
                return <>{(['up', 'down', 'left', 'right'] as const).map((d) => tick(d, 5, 5))}{ring(20)}{dot(2)}</>;
              }
              // default: 'cross' — gapped 4-tick crosshair with centre dot
              return <>{(['up', 'down', 'left', 'right'] as const).map((d) => tick(d, 6, 3))}{dot(2)}</>;
            })()}
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
            onSkillTree={() => { setIsPaused(false); setShowSkillTree(true); }}
            showSkillTree={gameMode !== 'tutorial'}
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

      {/* Tutorial Overlay — wired to real tutorial state */}
      {showTutorial && gameStarted && !gameState.isGameOver && (
        <TutorialOverlay
          currentStep={tutorialStep}
          progress={tutorialProgress}
          onSkip={() => {
            tutorialRef.current?.skipCurrentStep();
            const tut = tutorialRef.current;
            if (tut) {
              const nextStep = tut.getCurrentStep();
              if (nextStep) {
                (tut as any)._lastStepId = null;
                setTutorialStep({ ...nextStep });
                setTutorialProgress(tut.getProgress());
              } else {
                // Tutorial done — unlock pointer
                setShowTutorial(false);
                setTutorialStep(null);
                tutorialActiveRef.current = false;
                const canvas = mountRef.current?.querySelector('canvas');
                if (canvas) setTimeout(() => canvas.requestPointerLock(), 100);
              }
            }
          }}
          onNext={() => {
            const tut = tutorialRef.current;
            if (tut && tutorialStep?.id) {
              tut.completeStep(tutorialStep.id);
              const nextStep = tut.getCurrentStep();
              if (nextStep) {
                (tut as any)._lastStepId = null;
                setTutorialStep({ ...nextStep });
                setTutorialProgress(tut.getProgress());
              } else {
                // Tutorial done — unlock pointer
                setShowTutorial(false);
                setTutorialStep(null);
                tutorialActiveRef.current = false;
                const canvas = mountRef.current?.querySelector('canvas');
                if (canvas) setTimeout(() => canvas.requestPointerLock(), 100);
              }
            }
          }}
          onEndTutorial={() => {
            // Exit tutorial entirely — unlock pointer
            setShowTutorial(false);
            setTutorialStep(null);
            tutorialActiveRef.current = false;
            if (tutorialRef.current) {
              tutorialRef.current.setEnabled(false);
            }
            const canvas = mountRef.current?.querySelector('canvas');
            if (canvas) setTimeout(() => canvas.requestPointerLock(), 100);
          }}
        />
      )}

      {/* Skill Tree Menu — wired to real skill tree state */}
      {showSkillTree && (
        <SkillTreeMenu
          skills={skillTreeData.skills}
          availablePoints={skillTreeData.availablePoints}
          spentPoints={skillTreeData.spentPoints}
          totalPoints={skillTreeData.totalPoints}
          detectedPlayStyle={skillTreeData.detectedPlayStyle as any}
          recommendations={skillTreeData.recommendations}
          onUnlockSkill={(skillId) => {
            if (skillTreeRef.current) {
              const result = skillTreeRef.current.unlockSkill(skillId);
              if (result.success) {
                const s = skillTreeRef.current.getState();
                setSkillTreeData({
                  skills: skillTreeRef.current.getAllSkills(),
                  availablePoints: s.availablePoints,
                  spentPoints: s.spentPoints,
                  totalPoints: s.totalPoints,
                  detectedPlayStyle: 'balanced',
                  recommendations: [],
                });
              }
            }
          }}
          onClose={() => { setShowSkillTree(false); setIsPaused(true); }}
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
