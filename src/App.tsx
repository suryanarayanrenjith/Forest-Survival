import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GraduationCap, Play, Home } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GunModel, type WeaponType as GunWeaponType } from './utils/GunModel';
import { MuzzleFlash, BulletTracer, ImpactEffect, RobotHitSparks, setMuzzleLightPool } from './utils/Effects';
import { soundManager } from './utils/SoundManager';
import { gameSettingsManager, type UserSettings } from './utils/GameSettingsManager';
import { PostProcessingPipeline } from './utils/PostProcessing';
import { SpatialGrid } from './utils/SpatialGrid';
import { AIBehaviorSystem } from './utils/AIBehaviorSystem';
import { EnemyPerception } from './utils/EnemyPerception';
import { AttackSystem } from './utils/AttackSystem';
import { ObstacleAvoidance } from './utils/ObstacleAvoidance';
import { BulletDodging } from './utils/BulletDodging';
import { WeatherSystem } from './utils/WeatherSystem';
import { BiomeSystem } from './utils/BiomeSystem';
import { createAtmosphericHazeMaterial, createSkyDomeMaterial, updateShaderTime } from './utils/Shaders';
import { getMapConfig, getRandomMap, DEFAULT_MAP, type MapType } from './utils/MapSystem';
import { getHDRIEnvironmentIntensity, loadHDRIEnvironment, type HDRIEnvironmentProfile } from './utils/HDRIEnvironment';
import { MultiplayerManager, type PlayerData as MpPlayerData, type NetworkMessage, type EnemyWire } from './utils/MultiplayerManager';
import { RemotePlayerManager } from './utils/RemotePlayerManager';
import { LocalPlayerShadow } from './utils/LocalPlayerShadow';
import { EffectIndicators, type EffectKey } from './utils/EffectIndicators';
import type { ClassId } from './utils/CharacterModels';
import { AbilitySystem } from './utils/AbilitySystem';
import { AchievementSystem, type Achievement } from './utils/AchievementSystem';
import { EnhancedPowerUpSystem } from './utils/EnhancedPowerUps';
import { DayCycleSystem } from './utils/DayCycleSystem';
import HUD, { type AbilityHudItem } from './components/HUD';
import MainMenu from './components/MainMenu';
import ClassicMenu from './components/ClassicMenu';
import TutorialMenu from './components/TutorialMenu';
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
import HitMarkers, { addHitMarker, addDamageNumber, clearHitMarkers } from './components/HitMarkers';
import ScreenEffects, { triggerDamageFlash, triggerScreenShake, triggerKillFlash, triggerHeadshotFlash } from './components/ScreenEffects';
import ComboDisplay from './components/ComboDisplay';
import { WEAPONS, type Enemy, type Bullet, type PowerUp, type Particle, type TerrainObject, type Keys, type GameState } from './types/game';
import { AdaptiveDifficultySystem } from './utils/AdaptiveDifficultySystem';
import { ProceduralMissionSystem, type Mission } from './utils/ProceduralMissionSystem';
import { CombatCoachSystem, type Tip as CoachTip } from './utils/CombatCoachSystem';
import { PredictiveSpawnSystem } from './utils/PredictiveSpawnSystem';
import { SmartSkillTreeSystem, type Skill, type PlayStyle } from './utils/SmartSkillTreeSystem';
import { TutorialSystem, type TutorialStep } from './utils/TutorialSystem';
import { smartEnemyManager, type EnemyType as PooledEnemyType } from './utils/SmartEnemyManager';
import { MissionDisplay } from './components/MissionDisplay';
import { SkillTreeMenu } from './components/SkillTreeMenu';
import { TutorialOverlay, CoachTipsDisplay } from './components/TutorialOverlay';
import { EnhancedSettings, type GameSettings } from './components/EnhancedSettings';
import { StatsGallery } from './components/StatsGallery';
import { ErrorBoundary } from './components/ErrorBoundary';
import ShaderProcessingScreen, { type WarmupErrorInfo } from './components/ShaderProcessingScreen';
import MenuBackdrop, { type MenuBackdropVariant } from './components/MenuBackdrop';
import MusicMuteButton from './components/MusicMuteButton';
import { musicMute } from './utils/musicMute';
import { useMutation } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { usePlayerData } from './hooks/usePlayerData';

/**
 * Quick WebGL2 availability check. We do this BEFORE the scene useEffect
 * runs (which would throw a deep three.js error if WebGL is unavailable)
 * so we can surface a clean, user-friendly error message via the
 * ShaderProcessingScreen instead of crashing into the ErrorBoundary.
 */
function detectWebGLAvailability(): { ok: boolean; reason?: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return { ok: true };
    const gl1 = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl1) return { ok: false, reason: 'WebGL is not available in this browser. The game cannot run.' };
    return { ok: false, reason: 'Only WebGL 1 is available; the game requires WebGL 2 for shader compatibility.' };
  } catch (err) {
    return { ok: false, reason: `WebGL detection failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

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

const createEnhancedSettingsDefaults = (userSettings: UserSettings): GameSettings => ({
  graphicsQuality: gameSettingsManager.getGraphicsQuality(),
  shadowQuality: 'medium',
  postProcessing: true,
  particles: true,
  particleDensity: 75,
  viewDistance: 150,
  masterVolume: userSettings.masterVolume,
  musicVolume: userSettings.musicVolume,
  sfxVolume: userSettings.sfxVolume,
  difficulty: 'medium',
  showTutorial: true,
  showHints: true,
  showDamageNumbers: userSettings.damageNumbers,
  screenShake: userSettings.screenShake,
  autoReload: false,
  adaptiveDifficulty: true,
  mouseSensitivity: userSettings.sensitivity,
  invertY: false,
  toggleAim: false,
  showFPS: userSettings.showFPS,
  showMinimap: true,
  uiScale: 100,
  colorblindMode: 'none',
});

const syncEnhancedSettingsWithUserSettings = (currentSettings: GameSettings, userSettings: UserSettings): GameSettings => ({
  ...currentSettings,
  graphicsQuality: userSettings.graphicsQuality,
  masterVolume: userSettings.masterVolume,
  musicVolume: userSettings.musicVolume,
  sfxVolume: userSettings.sfxVolume,
  mouseSensitivity: userSettings.sensitivity,
  showFPS: userSettings.showFPS,
  screenShake: userSettings.screenShake,
  showDamageNumbers: userSettings.damageNumbers,
});

const enhancedSettingsToUserSettings = (settings: GameSettings): Partial<UserSettings> => ({
  graphicsQuality: settings.graphicsQuality,
  masterVolume: settings.masterVolume,
  musicVolume: settings.musicVolume,
  sfxVolume: settings.sfxVolume,
  sensitivity: settings.mouseSensitivity,
  showFPS: settings.showFPS,
  screenShake: settings.screenShake,
  damageNumbers: settings.showDamageNumbers,
});

const MENU_MUSIC_URL = '/audio/Before_The_Breach.mp3';

// Fixed key order so the serialized settings blob is stable for equality checks
// (avoids spurious DB writes when the object identity changes but values don't).
const SYNCED_SETTING_KEYS: (keyof UserSettings)[] = [
  'masterVolume', 'sfxVolume', 'musicVolume', 'sensitivity', 'fov',
  'showFPS', 'screenShake', 'hitMarkers', 'killFeed', 'damageNumbers',
  'crosshairStyle', 'crosshairColor', 'graphicsQuality',
];

function serializeSettings(s: UserSettings): string {
  const ordered: Record<string, unknown> = {};
  for (const key of SYNCED_SETTING_KEYS) ordered[key] = s[key];
  return JSON.stringify(ordered);
}

const ForestSurvivalGame = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  // ─── Auth + persistent progression (Convex) ──────────────────────────────
  // Solo & Tutorial are free; achievements, the skill tree and Multiplayer
  // require sign-in. These feed gating + DB sync. Refs let the long-lived game
  // useEffect read the latest values without re-running on every auth change.
  const { isAuthenticated } = useConvexAuth();
  // Player account + progression come from the shared root subscription so
  // bouncing between menus and the game never re-fetches from Convex.
  const { playerStats } = usePlayerData();
  const submitSoloRun = useMutation(api.playerStats.submitSoloRun);
  const submitMultiplayerResult = useMutation(api.playerStats.submitMultiplayerResult);
  const unlockSkillMutation = useMutation(api.playerStats.unlockSkill);
  const mergeAchievementsMutation = useMutation(api.playerStats.mergeAchievements);
  const setSettingsDb = useMutation(api.playerStats.setSettings);
  // Full settings cross-device sync: the account is source of truth at sign-in,
  // then local changes (from either settings panel) are pushed back to the DB,
  // debounced so slider drags don't spam mutations.
  const settingsRestoredRef = useRef(false);
  const syncedSettingsRef = useRef<string | null>(null);
  const settingsPushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthenticatedRef = useRef(isAuthenticated);
  const playerStatsRef = useRef(playerStats);
  const mergeAchievementsRef = useRef(mergeAchievementsMutation);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  useEffect(() => { playerStatsRef.current = playerStats; }, [playerStats]);
  useEffect(() => { mergeAchievementsRef.current = mergeAchievementsMutation; }, [mergeAchievementsMutation]);

  const [gameMode, setGameMode] = useState<'none' | 'classic' | 'multiplayer' | 'tutorial'>('none');
  const [showClassicMenu, setShowClassicMenu] = useState(false);
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showShaderProcessing, setShowShaderProcessing] = useState(false);
  // Surfaces warmup / WebGL errors via the loader's error UI. When set,
  // the loader shows a "Warmup Failed" card with Retry / Continue Anyway
  // buttons instead of the normal progress UI.
  const [warmupError, setWarmupError] = useState<WarmupErrorInfo | null>(null);
  // Ref the scene useEffect closure reads to honour a user-clicked
  // "Continue Anyway" — when true, the warmup chain falls through to
  // start the game with whatever has been initialised so far.
  const continueAnywayRef = useRef(false);
  const [classicDifficulty, setClassicDifficulty] = useState<'easy' | 'medium' | 'hard' | 'adaptive'>('medium');
  const [classicTimeOfDay, setClassicTimeOfDay] = useState<'day' | 'night' | 'auto'>('auto');
  const [selectedMap, setSelectedMap] = useState<MapType>(DEFAULT_MAP);
  // Tracks whether the player launched classic via the "Roll & Play"
  // random-mode button. On restart we re-roll the map (and time of day)
  // so it's actually random across sessions, not the first map forever.
  const [isClassicRandomSession, setIsClassicRandomSession] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showWaveComplete, setShowWaveComplete] = useState(false);
  const [powerUpMessage, setPowerUpMessage] = useState<string>('');
  const [abilityHud, setAbilityHud] = useState<AbilityHudItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => gameSettingsManager.getSettings());
  const [currentFPS, setCurrentFPS] = useState(0);
  // Live stamina + exhaustion flags pushed from the per-frame game loop
  // so the HUD can draw the bottom-left pie meter at the correct fill.
  const [staminaRatio, setStaminaRatio] = useState(1);
  const [staminaExhaustedUI, setStaminaExhaustedUI] = useState(false);

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

  // Achievement system state — supports multiple in-flight notifications
  type QueuedAchievement = Achievement & { queueId: number };
  const [achievementQueue, setAchievementQueue] = useState<QueuedAchievement[]>([]);

  // Mobile detection
  const [isMobile, setIsMobile] = useState(false);

  // AI SYSTEMS STATE
  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [coachTips, setCoachTips] = useState<CoachTip[]>([]);
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showEnhancedSettings, setShowEnhancedSettings] = useState(false);
  const [showStatsGallery, setShowStatsGallery] = useState(false);

  // Tutorial & Skill Tree refs + state (bridge useEffect closure → React render)
  const tutorialRef = useRef<TutorialSystem | null>(null);
  const tutorialActiveRef = useRef(false); // true while tutorial popup is showing — blocks pointer lock
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  // Shows the "Tutorial Complete" card once the player finishes every step.
  const [tutorialComplete, setTutorialComplete] = useState(false);
  const skillTreeRef = useRef<SmartSkillTreeSystem | null>(null);
  const [skillTreeData, setSkillTreeData] = useState({
    skills: [] as Skill[],
    availablePoints: 0,
    spentPoints: 0,
    totalPoints: 0,
    detectedPlayStyle: 'balanced' as PlayStyle,
    recommendations: [] as string[],
  });

  // Keep the skill tree synced to the account whenever progression loads or
  // changes OUTSIDE an active game — so unlocked skills + available points are
  // always correct after logging back in (they're persisted in the DB via
  // submitSoloRun / unlockSkill). During a run the in-game tree is the source
  // of truth, so we skip then to avoid clobbering live spends.
  useEffect(() => {
    if (gameStarted) return;
    if (!isAuthenticated || !playerStats) return;
    const tree = skillTreeRef.current ?? new SmartSkillTreeSystem();
    tree.hydrate(playerStats.skills, playerStats.skillPoints);
    skillTreeRef.current = tree;
    const s = tree.getState();
    setSkillTreeData((prev) => ({
      ...prev,
      skills: tree.getAllSkills(),
      availablePoints: s.availablePoints,
      spentPoints: s.spentPoints,
      totalPoints: s.totalPoints,
    }));
  }, [gameStarted, isAuthenticated, playerStats]);

  // Game settings
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => createEnhancedSettingsDefaults(gameSettingsManager.getSettings()));

  const menuMusicRef = useRef<HTMLAudioElement | null>(null);
  const menuMusicUnlockCleanupRef = useRef<(() => void) | null>(null);
  const menuMusicVolumeRef = useRef(0);

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
      setGameSettings((currentSettings) => syncEnhancedSettingsWithUserSettings(currentSettings, settings));
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

  // Restore saved settings from the account on sign-in (applies to the game).
  useEffect(() => {
    if (!isAuthenticated) {
      settingsRestoredRef.current = false;
      syncedSettingsRef.current = null;
      return;
    }
    if (settingsRestoredRef.current) return;
    // CRITICAL: wait for THIS user's stats to load. `getPlayerStats` returns
    // `undefined` while loading and `null` only when unauthenticated. Right
    // after sign-in the query can still hold the stale guest value (`null`) for
    // a tick before it refetches with the new identity — applying it then would
    // wrongly seed the baseline from local guest settings and permanently skip
    // restoring the account's saved settings (e.g. graphics never switches to
    // Ultra). Defer until a real stats object for the signed-in user arrives.
    if (playerStats === undefined || playerStats === null) return;
    settingsRestoredRef.current = true;

    const blob = playerStats.settings ?? null;
    if (blob) {
      try {
        const parsed = JSON.parse(blob) as Partial<UserSettings>;
        gameSettingsManager.updateSettings(parsed);
        syncedSettingsRef.current = serializeSettings(gameSettingsManager.getSettings());
        return;
      } catch {
        // Corrupt blob — fall through to seed from current local settings.
      }
    }
    // No saved settings on the account yet: adopt the device's current settings
    // as the baseline AND persist them, so a brand-new account remembers them
    // on the next device/sign-in instead of falling back to defaults.
    const local = serializeSettings(gameSettingsManager.getSettings());
    syncedSettingsRef.current = local;
    void setSettingsDb({ settings: local }).catch(() => {});
  }, [isAuthenticated, playerStats, setSettingsDb]);

  // Persist local settings changes back to the account (covers both settings
  // panels), debounced so dragging sliders doesn't spam the DB.
  useEffect(() => {
    if (!isAuthenticated || !settingsRestoredRef.current) return;
    const serialized = serializeSettings(userSettings);
    if (serialized === syncedSettingsRef.current) return;
    syncedSettingsRef.current = serialized;

    if (settingsPushTimerRef.current) clearTimeout(settingsPushTimerRef.current);
    settingsPushTimerRef.current = setTimeout(() => {
      void setSettingsDb({ settings: serialized }).catch(() => {});
    }, 1200);
  }, [isAuthenticated, userSettings, setSettingsDb]);

  // Track the global music-mute toggle (persisted via MusicMuteButton).
  // When muted, the menu music is paused regardless of the volume slider.
  const [musicMuted, setMusicMuted] = useState<boolean>(() => musicMute.get());
  useEffect(() => musicMute.subscribe(setMusicMuted), []);

  useEffect(() => {
    const menuMusicVolume = Math.max(0, Math.min(1, (userSettings.masterVolume / 100) * (userSettings.musicVolume / 100)));
    menuMusicVolumeRef.current = menuMusicVolume;

    if (!menuMusicRef.current) {
      const music = new Audio(MENU_MUSIC_URL);
      music.loop = true;
      music.preload = 'auto';
      menuMusicRef.current = music;
    }

    const music = menuMusicRef.current;
    if (!music) return;

    music.volume = menuMusicVolume;

    const clearUnlockListeners = () => {
      if (!menuMusicUnlockCleanupRef.current) return;
      menuMusicUnlockCleanupRef.current();
      menuMusicUnlockCleanupRef.current = null;
    };

    const attachUnlockListeners = () => {
      if (menuMusicUnlockCleanupRef.current) return;

      const resumeMusic = () => {
        const currentMusic = menuMusicRef.current;
        if (!currentMusic) return;
        // Respect the global mute even if the user gesture arrives later.
        if (musicMute.get()) {
          clearUnlockListeners();
          return;
        }

        currentMusic.volume = menuMusicVolumeRef.current;
        const playResult = currentMusic.play();
        if (playResult !== undefined) {
          playResult
            .then(() => {
              clearUnlockListeners();
            })
            .catch(() => {
              // Keep waiting for the next user gesture.
            });
        } else {
          clearUnlockListeners();
        }
      };

      const resumeEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart'];
      resumeEvents.forEach((eventName) => window.addEventListener(eventName, resumeMusic));
      menuMusicUnlockCleanupRef.current = () => {
        resumeEvents.forEach((eventName) => window.removeEventListener(eventName, resumeMusic));
      };
    };

    const shouldPlayMenuMusic = !gameStarted && !isMobile && !musicMuted;

    if (shouldPlayMenuMusic) {
      if (music.paused || music.ended) {
        const playResult = music.play();
        if (playResult !== undefined) {
          playResult
            .then(() => {
              clearUnlockListeners();
            })
            .catch(() => {
              attachUnlockListeners();
            });
        } else {
          clearUnlockListeners();
        }
      }
    } else {
      clearUnlockListeners();
      music.pause();
      // Reset playhead only when leaving the menus, not when the user
      // simply muted — so unmuting later resumes from the same spot.
      if (gameStarted || isMobile) {
        music.currentTime = 0;
      }
    }
  }, [gameStarted, isMobile, musicMuted, userSettings.masterVolume, userSettings.musicVolume]);

  useEffect(() => {
    return () => {
      if (menuMusicUnlockCleanupRef.current) {
        menuMusicUnlockCleanupRef.current();
        menuMusicUnlockCleanupRef.current = null;
      }

      if (menuMusicRef.current) {
        menuMusicRef.current.pause();
        menuMusicRef.current.src = '';
        menuMusicRef.current = null;
      }
    };
  }, []);

  // Set up multiplayer listeners when manager is created
  // NOTE: game_start handler is now registered in MultiplayerLobby.tsx to fix timing issues
  useEffect(() => {
    if (!multiplayerManager) return;

    console.log('[App] Setting up multiplayer listeners - isHost:', multiplayerManager.isGameHost());

    // Helper: narrow the polymorphic network payload to the message
    // variant we just subscribed to. The MultiplayerManager dispatches
    // each handler by string type, so the cast is sound at runtime.
    type MsgFor<T extends NetworkMessage['type']> = Extract<NetworkMessage, { type: T }>;
    const asMsg = <T extends NetworkMessage['type']>(raw: unknown) => raw as MsgFor<T>;

    // Listen for game over
    const unsubGameOver = multiplayerManager.onMessage('game_over', (raw) => {
      const data = asMsg<'game_over'>(raw);
      console.log('[App] Received game_over message:', data);
      setMultiplayerWinner(data.winnerId);
      setMultiplayerGameOver(true);
      // Stop all sounds when game is over
      soundManager.mute();
    });

    // Listen for kill events - real-time killer/victim info
    const unsubKilled = multiplayerManager.onMessage('player_killed', (raw) => {
      const data = asMsg<'player_killed'>(raw);
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
    const unsubRestart = multiplayerManager.onMessage('game_restart', (raw) => {
      const data = asMsg<'game_restart'>(raw);
      console.log('[App] Received game_restart - resetting local state');
      // Reset UI state
      setMultiplayerGameOver(false);
      setMultiplayerWinner(null);
      setIsSpectating(false);
      setMultiplayerKillFeed([]);
      setLastKillerInfo(null);
      setGameState({
        health: 100,
        maxHealth: 100,
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
      // Pick up the host's difficulty (broadcast in the game_restart payload)
      if (data.gameState?.difficulty) {
        setClassicDifficulty(data.gameState.difficulty);
      }
      // Bump key to re-run the main game useEffect (fresh scene + fresh state)
      setGameRestartKey(k => k + 1);
    });

    // Host sent everyone back to the lobby after a match — tear down the
    // game scene and show the lobby UI without forcing a peer rejoin.
    const unsubReturnLobby = multiplayerManager.onMessage('return_to_lobby', () => {
      console.log('[App] Received return_to_lobby - returning to lobby UI');
      setMultiplayerGameOver(false);
      setMultiplayerWinner(null);
      setIsSpectating(false);
      setMultiplayerKillFeed([]);
      setLastKillerInfo(null);
      setGameState({
        health: 100,
        maxHealth: 100,
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
      // Stop the game loop (cleanup fires because gameStarted is a dep)
      // and surface the lobby — the manager is preserved so no rejoin needed.
      setGameStarted(false);
      setShowMultiplayerLobby(true);
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
      unsubReturnLobby();
      unsubPlayerUpdate();
      unsubEnemyKilled();
      clearInterval(statsInterval);
      clearInterval(killFeedInterval);
    };
  }, [multiplayerManager]);

  const [gameState, setGameState] = useState<GameState>({
    health: 100,
    maxHealth: 100,
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

  // Persist a finished Solo run for signed-in players (best score/wave + totals,
  // and award persistent skill points). Guarded to fire once per run.
  const soloRunSubmittedRef = useRef(false);
  useEffect(() => {
    if (gameState.isGameOver && gameMode === 'classic') {
      if (soloRunSubmittedRef.current) return;
      soloRunSubmittedRef.current = true;
      if (isAuthenticated) {
        void submitSoloRun({
          score: gameState.score,
          wave: gameState.wave,
          kills: gameState.enemiesKilled,
        }).catch(() => {});
      }
    } else if (!gameState.isGameOver) {
      soloRunSubmittedRef.current = false;
    }
  }, [gameState.isGameOver, gameState.score, gameState.wave, gameState.enemiesKilled, gameMode, isAuthenticated, submitSoloRun]);

  // Persist a finished Multiplayer match for signed-in players. Fires once.
  const mpResultSubmittedRef = useRef(false);
  useEffect(() => {
    if (multiplayerGameOver && multiplayerManager) {
      if (mpResultSubmittedRef.current) return;
      mpResultSubmittedRef.current = true;
      if (isAuthenticated) {
        const local = multiplayerManager.getLocalPlayer();
        void submitMultiplayerResult({
          score: local.score,
          kills: local.kills,
          deaths: local.deaths,
          won: multiplayerWinner === local.id,
        }).catch(() => {});
      }
    } else if (!multiplayerGameOver) {
      mpResultSubmittedRef.current = false;
    }
  }, [multiplayerGameOver, multiplayerManager, multiplayerWinner, isAuthenticated, submitMultiplayerResult]);

  useEffect(() => {
    if (!gameStarted) return;

    // ── WebGL availability sentinel ───────────────────────────────────
    // If the browser can't provide WebGL2, three.js's renderer will
    // throw deep in its initialiser — surfaces as an opaque error in
    // the ErrorBoundary. Catch it here first and present a friendly
    // message via the loader's error UI instead.
    const webgl = detectWebGLAvailability();
    if (!webgl.ok) {
      setWarmupError({
        message: 'WebGL is required to run this game.',
        stage: 'WebGL',
        detail: webgl.reason,
        recoverable: false,
      });
      return;
    }

    // Reset error state on a fresh scene useEffect run (restart, mode switch)
    setWarmupError(null);
    continueAnywayRef.current = false;

    // Read user settings from localStorage for game configuration
    const currentUserSettings = gameSettingsManager.getSettings();
    // `let` so the render loop can pick up live FOV changes from the
    // settings menu (e.g. opened mid-game from the pause menu).
    let baseFOV = currentUserSettings.fov;
    const sensitivityMultiplier = gameSettingsManager.getSensitivityMultiplier();

    // Determine configuration based on difficulty and mode
    const timeOfDay: 'day' | 'night' | 'dawn' | 'dusk' | 'bloodmoon' = classicTimeOfDay as 'day' | 'night' | 'dawn' | 'dusk' | 'bloodmoon';
    // speedMult is the dominant control over how fast enemies close in.
    //   easy     — enemies amble in; the player can always out-walk them.
    //   medium   — enemies roughly match a walking player; sprint to escape.
    //   hard     — enemies keep pace with a sprinting player; relentless.
    //   adaptive — starts gentle, the AI difficulty system ramps it up.
    // Difficulty tuned for a more approachable curve — easy is genuinely
    // easy (slower, weaker enemies, fewer of them), medium is a moderate
    // ramp, hard is challenging but not punishing. Adaptive splits the
    // difference and lets the AI nudge from there.
    // Each tier now carries AI tuning knobs too:
    //   aggroMult   — multiplies enemy.aggroRange so harder difficulties
    //                 detect/engage the player from much further out.
    //   reactionMult — scales the bullet-dodge reaction time; <1 = faster.
    //   chaseMult   — multiplies MAX_AI_UPDATE_DISTANCE so harder enemies
    //                 keep their AI brain online (and attack!) from longer
    //                 range, instead of falling into the "dumb seek" mode
    //                 that was letting the player out-snipe them.
    const classicSettings = {
      easy:     { healthMult: 0.9, speedMult: 0.6,  damageMult: 0.8, spawnMult: 0.7, regenRate: 0,    aggroMult: 0.7, reactionMult: 1.5, chaseMult: 0.8 },
      medium:   { healthMult: 1.6, speedMult: 1.1,  damageMult: 1.4, spawnMult: 1.1, regenRate: 0.1,  aggroMult: 1.0, reactionMult: 1.0, chaseMult: 1.0 },
      hard:     { healthMult: 2.6, speedMult: 1.6,  damageMult: 2.1, spawnMult: 1.6, regenRate: 0.25, aggroMult: 1.6, reactionMult: 0.55, chaseMult: 1.4 },
      adaptive: { healthMult: 1.4, speedMult: 0.95, damageMult: 1.3, spawnMult: 1.0, regenRate: 0.05, aggroMult: 0.95, reactionMult: 1.0, chaseMult: 1.0 } // Starts gentle, AI ramps up
    };
    const diffSettings = { ...classicSettings[classicDifficulty], progressive: classicDifficulty === 'adaptive', rampRate: classicDifficulty === 'adaptive' ? 0.05 : 0 };

    // === MULTIPLAYER & ENHANCED SYSTEMS ===
    const isMultiplayer = gameMode === 'multiplayer' && multiplayerManager !== null;

    // ── SHARED-ENEMY ROLES (host-authoritative) ───────────────────────────
    // In multiplayer the HOST owns the one true enemy world: it spawns, runs
    // AI and resolves damage, then broadcasts snapshots. GUESTS don't spawn or
    // think — they mirror the host's enemies and report their bullet hits back.
    // In solo, both flags are false and every code path below behaves exactly
    // as it always has.
    const mp = isMultiplayer ? multiplayerManager : null;
    const isMpHost = !!mp && mp.isGameHost();
    const isMpGuest = !!mp && !isMpHost;
    // Enemy type ⇄ compact wire code.
    const ENEMY_TYPE_CODE: Record<'normal' | 'fast' | 'tank' | 'boss', number> = {
      normal: 0, fast: 1, tank: 2, boss: 3,
    };
    const ENEMY_TYPE_FROM_CODE: Array<'normal' | 'fast' | 'tank' | 'boss'> = ['normal', 'fast', 'tank', 'boss'];
    // Guest-side lookup from netId → mirrored enemy. Host fills netId on spawn.
    const enemyByNetId = new Map<number, Enemy>();
    let nextEnemyNetId = 1;
    let lastEnemySyncMs = 0;
    const ENEMY_SYNC_INTERVAL_MS = 80;   // ~12.5 snapshots/sec
    const _zeroVel = new THREE.Vector3(0, 0, 0);
    // Reused per-frame list of alive remote players the host's enemies can target.
    const _mpFocusTargets: Array<{ id: string; pos: THREE.Vector3 }> = [];

    // Initialize ability system (for all modes)
    const abilitySystem = new AbilitySystem();

    // Initialize achievement system. Tutorial mode is a sandboxed
    // learning space — unlocking real achievements there would be
    // cheap (no danger, no wave progression) AND the unlock pop-ups
    // visually clutter the tutorial overlay. Skip both the queue
    // push AND any logging so tutorial sessions stay clean.
    // Achievements are locked for guests and disabled in Tutorial. Authenticated
    // players hydrate from their DB bitmask and sync new unlocks back to Convex.
    const _isTutorialModeForAch = gameMode === 'tutorial';
    // Achievements are a SOLO-only progression. They are disabled in
    // multiplayer (and tutorial) so co-op / versus matches can't unlock or
    // farm the solo achievement set. With `enabled: false` every
    // updateProgress()/setProgress() call short-circuits to a no-op.
    const _achievementsEnabled =
      isAuthenticatedRef.current && !_isTutorialModeForAch && !isMultiplayer;
    const achievementSystem = new AchievementSystem({
      enabled: _achievementsEnabled,
      persistLocal: false,
    });
    if (_achievementsEnabled && playerStatsRef.current) {
      achievementSystem.hydrateFromMask(playerStatsRef.current.achievements);
    }
    if (_achievementsEnabled) {
      achievementSystem.onUnlock((achievement) => {
        const achievementWithId: QueuedAchievement = { ...achievement, queueId: Date.now() + Math.random() };
        setAchievementQueue((prev) => [...prev, achievementWithId]);
        const bit = AchievementSystem.bitFor(achievement.id);
        if (bit) {
          void mergeAchievementsRef.current({ mask: bit }).catch(() => {});
        }
      });
    }

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

    // 5. Smart Skill Tree - Personalized progression.
    // Authenticated players hydrate persisted skills + points so unlocked
    // skills apply from the first frame (bonuses are computed below at init).
    const skillTree = new SmartSkillTreeSystem();
    if (isAuthenticatedRef.current && playerStatsRef.current) {
      skillTree.hydrate(playerStatsRef.current.skills, playerStatsRef.current.skillPoints);
    }

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
        (tutorial as TutorialSystem & { _lastStepId?: string })._lastStepId = firstStep.id;
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
      // Cycle speed dropped from 1.5 → 0.85 so the now-continuous
      // anchor-to-anchor interpolation has time to breathe. A full
      // 24-hour cycle is ~140 real-seconds — fast enough that you'll
      // see day, dusk, night within one wave-run, slow enough that the
      // dusk-into-night fade reads as a real sunset, not a switch flip.
      dayCycleSystem.setCycleSpeed(0.85);
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

    // Multiplayer: spawn each player at a different point on a small ring
    // around the origin so 8 simultaneous players don't pile on top of
    // each other at match start. Slot is derived from the FNV hash of the
    // local player ID (deterministic, no host coordination needed).
    if (isMultiplayer && multiplayerManager) {
      const localId = multiplayerManager.getLocalPlayer().id || 'p0';
      // Simple FNV-1a → 0..7 slot
      let h = 0x811c9dc5;
      for (let i = 0; i < localId.length; i++) {
        h ^= localId.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      const slot = (h >>> 0) % 8;
      const angle = (slot / 8) * Math.PI * 2;
      const radius = 9;
      camera.position.set(Math.cos(angle) * radius, 5, Math.sin(angle) * radius);
      // Force the first position update so other clients see us at our
      // spawn slot immediately (don't wait for the throttle window).
      multiplayerManager.forcePositionUpdate(camera.position, new THREE.Euler(0, angle + Math.PI, 0));
    }

    // Render resolution based on graphics quality
    const renderWidth = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
    const renderHeight = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);

    const renderer = new THREE.WebGLRenderer({
      antialias: graphicsPreset.antialias, // Based on quality setting
      powerPreference: "high-performance",
      stencil: graphicsPreset.postProcessing,
      depth: true,
      alpha: false,
        logarithmicDepthBuffer: graphicsQuality === 'high' || graphicsQuality === 'ultra' // Highest tiers get the better precision path
    });
    renderer.setSize(renderWidth, renderHeight, false);
    renderer.setPixelRatio(1); // Fixed at 1, we handle scaling via renderWidth/Height
    renderer.shadowMap.enabled = graphicsPreset.shadowsEnabled;
    // Soft (PCF) shadows on medium+ for realistic penumbra; basic only on low.
    renderer.shadowMap.type = graphicsQuality === 'low' ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    // Tone mapping happens in the post pipeline (ACES Filmic). When the
    // post FX is disabled (Low preset) the renderer's built-in ACES Filmic
    // takes over so the raw signal still maps cleanly to display range
    // instead of clipping.
    if (graphicsPreset.postProcessing) {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1.0;
    } else {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }
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
        (renderer.domElement as HTMLCanvasElement & { _mpPointerLockCleanup?: () => void })._mpPointerLockCleanup = () => {
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

    const postFX = graphicsPreset.postProcessing
      ? new PostProcessingPipeline(renderer, scene, camera, graphicsPreset, graphicsQuality)
      : null;
    // Apply the map's bloom profile so each environment has its own
    // signature look (heavy bloom on crystal/volcanic, restrained on
    // desert/military). Falls back to neutral if the map didn't declare
    // a profile.
    if (postFX) {
      postFX.setMapBloomProfile(
        mapConfig.bloomMultiplier ?? 1.0,
        mapConfig.bloomThresholdBias ?? 0.0,
      );
    }
    // Reusable sun-direction vector we feed to the post-FX light-shafts.
    const _sunDirection = new THREE.Vector3();
    const computeSunDirection = (): THREE.Vector3 => {
      _sunDirection.set(
        atmosphericSettings.lightPosition.x,
        atmosphericSettings.lightPosition.y,
        atmosphericSettings.lightPosition.z,
      );
      return _sunDirection.normalize();
    };
    const initialSunDirection = computeSunDirection();
    if (postFX) {
      // Initialise the grading uniforms from the current atmosphere snapshot
      // so the first rendered frame already has the right look.
      postFX.updateAtmosphere({
        saturation: atmosphericSettings.saturation,
        contrast: atmosphericSettings.contrast,
        temperature: atmosphericSettings.temperature,
        exposure: atmosphericSettings.exposure,
        colorTint: atmosphericSettings.colorTint,
        sunDirection: initialSunDirection,
        isNight: !atmosphericSettings.sunVisible,
      });
    }

    // Ensure enemies pick up the correct emissive profile on the first frame.
    const initialLowLight = initialSunDirection.y < 0.18;
    smartEnemyManager.setNightMode(!atmosphericSettings.sunVisible || initialLowLight);

    /**
     * Render one frame. When post-processing is enabled we drive the
     * three.js EffectComposer; otherwise we go straight to the canvas (Low preset).
     */
    const composePostFX = (delta: number = 0) => {
      if (postFX) {
        postFX.render(delta);
      } else {
        renderer.render(scene, camera);
      }
    };

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

    // Enhanced RTX-Style Lighting System with Dynamic Day Cycle.
    // Multipliers stay at 1.0 — the DayCycleSystem values are now tuned for
    // the AGX post pipeline, so an extra +20% on top blows out the sky.
    // Ambient at 80% — shadow detail readable but the lit/shadow contrast
    // is dramatic enough to read as proper Cyberpunk "hit-by-sun" lighting.
    const ambientLight = new THREE.AmbientLight(atmosphericSettings.ambientColor, atmosphericSettings.ambientIntensity * 0.8);
    scene.add(ambientLight);

    // Main directional light (Sun/Moon) — cranked 60% above base so direct
    // sunlight drives the PBR specular lobe on the ground for crisp
    // Cyberpunk-style "wet asphalt sun glint" highlights. Combined with
    // the per-pixel normal perturbation in the ground shader, this is the
    // primary visual driver — not emissive, not bloom.
    const mainLight = new THREE.DirectionalLight(atmosphericSettings.lightColor, atmosphericSettings.lightIntensity * 1.6);
    mainLight.position.set(
      atmosphericSettings.lightPosition.x,
      atmosphericSettings.lightPosition.y,
      atmosphericSettings.lightPosition.z
    );
    mainLight.castShadow = graphicsPreset.shadowsEnabled;

    // Shadow settings based on graphics quality. Bias values restored to
    // SAFER ranges — the previous tighter values were causing shadow acne
    // on dynamic enemies (random black patches on robot bodies as they
    // moved through the shadow frustum). Keep PCF soft penumbra for that
    // AAA "sun directional shadow" feel.
    mainLight.shadow.camera.near = 1;
    mainLight.shadow.camera.far = graphicsPreset.viewDistance * 2;
    const shadowRange = graphicsQuality === 'ultra' ? 120 : graphicsQuality === 'high' ? 100 : graphicsQuality === 'medium' ? 72 : 48;
    mainLight.shadow.camera.left = -shadowRange;
    mainLight.shadow.camera.right = shadowRange;
    mainLight.shadow.camera.top = shadowRange;
    mainLight.shadow.camera.bottom = -shadowRange;
    mainLight.shadow.mapSize.width = graphicsPreset.shadowMapSize;
    mainLight.shadow.mapSize.height = graphicsPreset.shadowMapSize;
    mainLight.shadow.bias = -0.00022;
    mainLight.shadow.normalBias = 0.04;
    // Tighter shadow radius (less penumbra) = harder, more defined shadow
    // edges — the AAA "crisp directional shadow" look. Was 2.5/2.0/1.4/0.9.
    mainLight.shadow.radius = graphicsQuality === 'ultra' ? 1.6 : graphicsQuality === 'high' ? 1.3 : graphicsQuality === 'medium' ? 1.0 : 0.7;
    mainLight.shadow.camera.updateProjectionMatrix();
    scene.add(mainLight);
    // Target follows player so directional shadows stay centered on the camera
    scene.add(mainLight.target);

    // Hemisphere light for natural sky reflection (dynamic based on atmospheric settings)
    const skyColor = new THREE.Color(atmosphericSettings.skyColor);
    const groundColor = skyColor.clone().multiplyScalar(0.35); // Darker ground reflection
    // Hemisphere provides natural sky-tinted shadow fill. Boosted back to
    // 0.75× so shadow areas keep a cool sky tint and read as "in shadow",
    // not as "missing pixels".
    const skyLight = new THREE.HemisphereLight(
      skyColor.getHex(),
      groundColor.getHex(),
      atmosphericSettings.ambientIntensity * 0.75
    );
    scene.add(skyLight);

    // Soft warm bounce (sun-side) — faked indirect kick that warms the
    // lit ground. Krunker-grade golden-hour feel during day.
    const volumetricLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffe8b8 : 0x9ab2e6,
      atmosphericSettings.sunVisible ? 0.55 : 0.5
    );
    volumetricLight.position.set(
      atmosphericSettings.lightPosition.x * 0.5,
      atmosphericSettings.lightPosition.y * 0.8,
      atmosphericSettings.lightPosition.z * 0.5
    );
    scene.add(volumetricLight);
    scene.add(volumetricLight.target);

    // Fill light (opposite side of main light) — bumped so the shadowed
    // side of geometry still reads as fully lit, just cooler. The gun,
    // enemies, and tree trunks on the dark side all benefit.
    const fillLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xbcd6ff : 0x7a92d2,
      atmosphericSettings.sunVisible ? 0.55 : 0.7
    );
    fillLight.position.set(
      -atmosphericSettings.lightPosition.x * 0.6,
      atmosphericSettings.lightPosition.y * 0.4,
      -atmosphericSettings.lightPosition.z * 0.6
    );
    scene.add(fillLight);
    scene.add(fillLight.target);

    // Rim/Back light for dramatic silhouettes.
    const rimLight = new THREE.DirectionalLight(
      atmosphericSettings.sunVisible ? 0xffffff : 0xc4d2ff,
      atmosphericSettings.sunVisible ? 0.55 : 0.8
    );
    rimLight.position.set(
      atmosphericSettings.lightPosition.x * 0.3,
      atmosphericSettings.lightPosition.y * 1.2,
      atmosphericSettings.lightPosition.z
    );
    scene.add(rimLight);
    scene.add(rimLight.target);

    // Additional ambient fill for night visibility — significantly boosted
    // so the night reads as "moody blue dusk" instead of "pitch black hole".
    const nightFillLight = new THREE.AmbientLight(0x5c7ac0, atmosphericSettings.sunVisible ? 0.0 : 1.8);
    scene.add(nightFillLight);

    // Player-attached night lantern — softly illuminates surroundings when
    // sun is down. Wider radius + brighter so trees/enemies/ground 20m out
    // are still clearly readable, not silhouettes against the void.
    const playerNightLantern = new THREE.PointLight(0xc4d8ff, 0, 90, 1.3);
    playerNightLantern.position.set(0, 3, 0);
    camera.add(playerNightLantern);

    // GUN KEY LIGHT — small warm point light parented to the camera and
    // positioned right at the gun. Catches the gun's right-side faces
    // regardless of where the sun is, so the weapon ALWAYS reads as a
    // crisp foreground element (Krunker / Valorant signature look —
    // never let the gun fall into silhouette). Range is intentionally
    // tiny so it doesn't bleed onto the world geometry.
    //
    // DISABLED on LOW graphics: without post-FX or fog softening, the
    // cool rim light's falloff sphere becomes visible as a flat blue
    // disc on whatever surface is in front of the player. On LOW the
    // gun reads fine with ambient + hemisphere alone.
    const enableGunFillLights = graphicsQuality !== 'low';
    const gunKeyLight = new THREE.PointLight(0xffe2b2, enableGunFillLights ? 1.0 : 0, 2.4, 2.0);
    gunKeyLight.position.set(0.35, -0.15, -0.4);
    camera.add(gunKeyLight);
    // Cool rim from the other side gives the gun a clean two-light setup.
    const gunRimLight = new THREE.PointLight(0xb8d6ff, enableGunFillLights ? 0.45 : 0, 2.2, 2.0);
    gunRimLight.position.set(-0.3, 0.05, -0.5);
    camera.add(gunRimLight);

    /**
     * Per-weapon gun fill tuning. Long-barrel weapons need the key light
     * pulled back along Z so the muzzle isn't inside the light's hot
     * spot — that was producing the constant bright glow on the shotgun
     * / sniper / minigun barrel.
     */
    const setGunFillForWeapon = (weaponType: string) => {
      // LOW graphics: hard-disable the gun fill lights (the blue rim
      // disc artefact occurs because there's no post-FX or fog to soften
      // the falloff). Position update is harmless but intensities stay 0.
      if (!enableGunFillLights) {
        gunKeyLight.intensity = 0;
        gunRimLight.intensity = 0;
        return;
      }
      switch (weaponType) {
        case 'pistol':
          gunKeyLight.position.set(0.30, -0.15, -0.40);
          gunKeyLight.intensity = 1.0;
          gunKeyLight.distance = 2.4;
          gunRimLight.position.set(-0.28, 0.05, -0.50);
          gunRimLight.intensity = 0.45;
          break;
        case 'rifle':
        case 'smg':
          gunKeyLight.position.set(0.32, -0.12, -0.10);
          gunKeyLight.intensity = 0.55;
          gunKeyLight.distance = 1.9;
          gunRimLight.position.set(-0.28, 0.05, -0.20);
          gunRimLight.intensity = 0.25;
          break;
        case 'shotgun':
        case 'sniper':
          gunKeyLight.position.set(0.30, -0.10, 0.05);
          gunKeyLight.intensity = 0.42;
          gunKeyLight.distance = 1.7;
          gunRimLight.position.set(-0.26, 0.05, -0.05);
          gunRimLight.intensity = 0.20;
          break;
        case 'minigun':
        case 'launcher':
          // Heaviest weapons — key light parked at the camera origin so
          // it lights the receiver from behind and never touches the
          // long muzzle. Lowest intensity of the lot.
          gunKeyLight.position.set(0.28, -0.10, 0.18);
          gunKeyLight.intensity = 0.35;
          gunKeyLight.distance = 1.5;
          gunRimLight.position.set(-0.26, 0.05, 0.10);
          gunRimLight.intensity = 0.18;
          break;
      }
    };

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
    const groundBaseColor = isDay ? mapConfig.groundColor : new THREE.Color(mapConfig.groundColor).multiplyScalar(0.45).getHex();
    const groundEmissive = isDay ? mapConfig.groundEmissive : new THREE.Color(mapConfig.groundEmissive).multiplyScalar(0.5).getHex();
    // ── AAA GROUND: PBR base + Cyberpunk-style sun shader ───────────────
    // The previous version was blowing the ground out into a glowing haze
    // by piling emissive + incident boost + shimmer + fresnel all at full
    // strength. Cyberpunk's actual look is the opposite: SHARP directional
    // sun on lit surfaces, deep shadow elsewhere, subtle surface variation
    // via per-pixel normal perturbation, and proper Blinn-Phong specular.
    //
    // This shader keeps three.js's full PBR + shadow path intact and
    // injects FOUR things at four specific shader chunks:
    //
    //   1.  <worldpos_vertex>      world-space position varying
    //   2.  <common> [frag]        noise helpers + uniforms
    //   3.  <color_fragment>       subtle patch / detail colour variation
    //   4.  <normal_fragment_maps> per-pixel procedural normal perturbation
    //   5.  <lights_fragment_end>  sharp directional sun + crisp specular
    //
    // The normal perturbation is the KEY trick — each pixel's normal is
    // bent slightly by noise so the surface catches light at micro-angles.
    // This is what gives Cyberpunk's asphalt / concrete / dirt that tactile
    // "real material" feel without using normal-map textures.
    //
    // Emissive is ZERO during day (lit surfaces glow because of strong
    // direct sun, not because of fake self-illumination). At night a tiny
    // emissive keeps the ground readable.
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundBaseColor,
      flatShading: false,
      emissive: groundEmissive,
      emissiveIntensity: isDay ? 0.0 : 0.12,
      // Tight roughness gives a real specular lobe for the sun — wet/glossy
      // PBR look. Slight metalness pushes the reflection toward warm.
      roughness: 0.52,
      metalness: 0.08,
    });

    // ── Shared uniforms for the injected ground shader ───────────────────
    const groundShaderUniforms = {
      uTime: { value: 0 },
      uSunDirection: { value: initialSunDirection.clone() },
      uSunColor: { value: new THREE.Color(1.0, 0.94, 0.78) },
      uIncidentBoost: { value: isDay ? 0.12 : 0.04 },
      uSpecularStrength: { value: isDay ? 0.65 : 0.18 },
      uNormalStrength: { value: 0.35 },
      uPatchScale: { value: 0.035 },
      uPatchStrength: { value: 0.18 },
      uIsNight: { value: isDay ? 0.0 : 1.0 },
    };

    groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = groundShaderUniforms.uTime;
      shader.uniforms.uSunDirection = groundShaderUniforms.uSunDirection;
      shader.uniforms.uSunColor = groundShaderUniforms.uSunColor;
      shader.uniforms.uIncidentBoost = groundShaderUniforms.uIncidentBoost;
      shader.uniforms.uSpecularStrength = groundShaderUniforms.uSpecularStrength;
      shader.uniforms.uNormalStrength = groundShaderUniforms.uNormalStrength;
      shader.uniforms.uPatchScale = groundShaderUniforms.uPatchScale;
      shader.uniforms.uPatchStrength = groundShaderUniforms.uPatchStrength;
      shader.uniforms.uIsNight = groundShaderUniforms.uIsNight;

      // ── VERTEX: world-space position varying ──────────────────────────
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGroundWorldPos;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vGroundWorldPos = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vGroundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );

      // ── FRAGMENT: noise helpers + custom uniforms ─────────────────────
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3  uSunDirection;
        uniform vec3  uSunColor;
        uniform float uIncidentBoost;
        uniform float uSpecularStrength;
        uniform float uNormalStrength;
        uniform float uPatchScale;
        uniform float uPatchStrength;
        uniform float uIsNight;
        varying vec3  vGroundWorldPos;

        float gHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float gNoise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float a = gHash(i);
          float b = gHash(i + vec2(1.0, 0.0));
          float c = gHash(i + vec2(0.0, 1.0));
          float d = gHash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        float gFbm(vec2 p) {
          float v = 0.0; float a = 0.5;
          for (int i = 0; i < 4; i++) { v += a * gNoise(p); p = p * 2.07 + vec2(13.0, 7.0); a *= 0.5; }
          return v;
        }
        // Analytic gradient of fBm via finite differences — used to bend
        // per-pixel normal so the surface catches light at micro-angles.
        // This is the Cyberpunk "tactile material" trick without textures.
        vec2 gFbmGradient(vec2 p, float epsilon) {
          float c = gFbm(p);
          float dx = gFbm(p + vec2(epsilon, 0.0)) - c;
          float dy = gFbm(p + vec2(0.0, epsilon)) - c;
          return vec2(dx, dy) / epsilon;
        }`,
      );

      // ── COLOR: subtle patches + grit. Cyberpunk-restrained, NOT noisy. ─
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Large-scale patches — gentle brightness variation across the
        // ground (weathered look without the technicolor look-at-me look).
        float gPatch = gFbm(vGroundWorldPos.xz * uPatchScale);
        diffuseColor.rgb *= 1.0 + (gPatch - 0.5) * uPatchStrength;
        // High-freq grit — micro-detail visible only up close.
        float gFine = gNoise(vGroundWorldPos.xz * 3.5);
        diffuseColor.rgb += vec3(gFine - 0.5) * 0.025;`,
      );

      // ── NORMAL PERTURBATION: bend the surface normal per-pixel ────────
      // We compute a fBm gradient in the XZ world plane and use it as a
      // tangent-space normal. The standard PBR + shadow path then uses
      // this perturbed normal for ALL lighting calculations — direct sun,
      // IBL, hemisphere — giving each pixel a unique highlight response.
      // This is the single most impactful change vs the previous shader.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        vec2 gGrad = gFbmGradient(vGroundWorldPos.xz * 0.4, 0.5);
        vec3 gPerturb = vec3(-gGrad.x, 0.0, -gGrad.y) * uNormalStrength;
        normal = normalize(normal + gPerturb);`,
      );

      // ── LIGHTING: sharp directional sun + Blinn-Phong specular ────────
      // Sharp incident boost (pow 3.0 not pow 0.5) so ONLY surfaces
      // directly facing the sun get extra warmth — no global wash.
      // Plus a crisp Blinn-Phong specular highlight that catches the sun
      // like a polished surface (the "wet street" Cyberpunk shimmer).
      //
      // CRITICAL: every contribution is scaled INVERSELY with surface luma
      // — bright ground (desert sand 0xd4a574 luma ≈ 0.66) gets a small
      // boost, dark ground (forest grass luma ≈ 0.25) gets the full boost.
      // This keeps the "sunbeam catches the surface" effect uniform across
      // ALL maps without blowing out warm/sandy biomes.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 sunDir = normalize(uSunDirection);
          float sunDot = max(dot(normal, sunDir), 0.0);
          // Luma-aware damping: dark surfaces get full boost, bright
          // surfaces (desert sand, tundra snow) get clamped so the
          // additive light never crosses the bloom threshold.
          float baseLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float lumaDamp = clamp(1.0 - baseLuma * 1.2, 0.20, 1.0);
          // Sharp pow(N·L, 3.0) — directly-facing surfaces light up,
          // grazing-angle surfaces do NOT.
          float incident = pow(sunDot, 3.0);
          float patchMod = 0.6 + gFbm(vGroundWorldPos.xz * 0.10) * 0.8;
          reflectedLight.directDiffuse +=
            uSunColor * incident * uIncidentBoost * patchMod * lumaDamp;

          // Blinn-Phong specular — also luma-damped so bright sand
          // doesn't double up with its own brightness.
          vec3 viewDir = normalize(vViewPosition);
          vec3 halfVec = normalize(sunDir + viewDir);
          float specPower = pow(max(dot(normal, halfVec), 0.0), 48.0);
          float specPatch = 0.55 + gFbm(vGroundWorldPos.xz * 0.22) * 0.9;
          reflectedLight.directSpecular +=
            uSunColor * specPower * uSpecularStrength * specPatch * sunDot * lumaDamp;

          // Subtle subsurface "back-spill" — kicks only at extreme
          // grazing-toward-sun angles. Day-only, luma-damped.
          float backSpill = pow(max(dot(-sunDir, viewDir), 0.0), 8.0) * 0.14 * (1.0 - uIsNight) * lumaDamp;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * backSpill;
        }`,
      );
    };

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

    const hazeGeometry = graphicsQuality === 'low'
      ? null
      : new THREE.SphereGeometry(420, 32, 16);
    const hazeMaterial = hazeGeometry
      ? createAtmosphericHazeMaterial(
          new THREE.Color(mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor),
          new THREE.Vector3(
            atmosphericSettings.lightPosition.x,
            atmosphericSettings.lightPosition.y,
            atmosphericSettings.lightPosition.z
          ),
          (graphicsQuality === 'ultra' ? 0.10 : graphicsQuality === 'high' ? 0.08 : 0.06) * (mapConfig.hasSpecialWeather ? 1.25 : 1.0),
          !atmosphericSettings.sunVisible
        )
      : null;
    const atmosphericHaze = hazeGeometry && hazeMaterial
      ? new THREE.Mesh(hazeGeometry, hazeMaterial)
      : null;
    if (atmosphericHaze) {
      atmosphericHaze.renderOrder = -900;
      atmosphericHaze.frustumCulled = false;
      scene.add(atmosphericHaze);
    }

    // === IMAGE-BASED LIGHTING ===
    // Generate a fast local PMREM first, then replace it with Poly Haven HDRI
    // lighting when the async HDR loader resolves. The visible sky remains
    // the authored shader dome; the HDRI drives reflections and material IBL.
    let isSceneDisposed = false;
    let environmentRenderTarget: THREE.WebGLRenderTarget | null = null;
    let hdriEnvironmentProfile: HDRIEnvironmentProfile | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      environmentRenderTarget = pmrem.fromScene(scene, 0.04);
      scene.environment = environmentRenderTarget.texture;
      scene.environmentIntensity = 0.72;
      pmrem.dispose();
    } catch (err) {
      console.warn('[App] Environment map generation failed:', err);
    }

    void loadHDRIEnvironment(renderer, selectedMap, graphicsQuality)
      .then((loadedEnvironment) => {
        if (!loadedEnvironment) return;
        if (isSceneDisposed) {
          loadedEnvironment.renderTarget.dispose();
          return;
        }

        environmentRenderTarget?.dispose();
        environmentRenderTarget = loadedEnvironment.renderTarget;
        hdriEnvironmentProfile = loadedEnvironment.profile;
        scene.environment = loadedEnvironment.texture;
        scene.environmentRotation.y = loadedEnvironment.profile.rotationY;
        scene.environmentIntensity = getHDRIEnvironmentIntensity(
          loadedEnvironment.profile,
          atmosphericSettings.sunVisible,
          atmosphericSettings.ambientIntensity,
        );
        console.log(
          `[Graphics] HDRI environment loaded: ${loadedEnvironment.profile.label} (${loadedEnvironment.resolution})`,
        );
      })
      .catch((err) => {
        console.warn('[App] HDRI environment loading failed; using generated sky IBL fallback:', err);
      });

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
      // 1-3 biome-specific flavour features per chunk (water, cacti, crystals,
      // bunkers etc.) — guarantees at least one per chunk so each map keeps
      // its distinct character even in less-dense areas.
      const specialFeaturesCount = 1 + Math.floor(Math.random() * 3);
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
    // Initialise the per-weapon key/rim light profile for the starting
    // weapon. Subsequent switches call this from the keybind / unlock
    // paths above so the gun fill always matches the active weapon.
    setGunFillForWeapon('pistol');

    // Add gun light
    const gunLight = new THREE.PointLight(0xffffff, 0, 5);
    gunLight.position.set(0.3, -0.3, -0.5);
    camera.add(gunLight);

    // ── HELD RIOT SHIELD ─────────────────────────────────────────────────
    // A realistic tactical ballistic shield braced on the player's left arm,
    // parented to the camera (view-space). It's a clear polycarbonate panel in
    // a gunmetal frame with reinforcement bands, a grip, and a status core that
    // shifts green→amber→red as the absorb pool drains. Material refs are kept
    // so the game loop can animate raise/lower, hit flashes and shatter.
    const shieldMesh = new THREE.Group();
    // Definite-assignment: all four are set synchronously in the block below.
    let shieldGlassMat!: THREE.MeshPhysicalMaterial;
    let shieldCoreMat!: THREE.MeshStandardMaterial;
    let shieldRimMat!: THREE.MeshBasicMaterial;
    let shieldEnergyMat!: THREE.MeshBasicMaterial;
    {
      // Rounded-rectangle path centred on the origin.
      const roundedRect = (w: number, h: number, r: number): THREE.Shape => {
        const s = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        s.moveTo(x + r, y);
        s.lineTo(x + w - r, y);
        s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r);
        s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h);
        s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r);
        s.quadraticCurveTo(x, y, x + r, y);
        return s;
      };

      const W = 0.62, H = 0.9;

      // Gunmetal frame (extruded rounded border with bevelled edges).
      const frameShape = roundedRect(W + 0.06, H + 0.06, 0.12);
      frameShape.holes.push(roundedRect(W - 0.02, H - 0.02, 0.09));
      const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
        depth: 0.06, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2,
      });
      frameGeo.translate(0, 0, -0.03);
      const frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({
        color: 0x232c38, metalness: 0.9, roughness: 0.38,
        emissive: 0x0a1622, emissiveIntensity: 0.3,
      }));
      shieldMesh.add(frame);

      // Clear ballistic panel — glossy, see-through polycarbonate.
      shieldGlassMat = new THREE.MeshPhysicalMaterial({
        color: 0xbfe0ff, transparent: true, opacity: 0.16,
        roughness: 0.06, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04,
        emissive: 0x3aa0ff, emissiveIntensity: 0.15,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      });
      const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W, H, 0.09)), shieldGlassMat);
      shieldMesh.add(glass);

      // Faint inner energy shimmer (additive) that brightens on impact.
      shieldEnergyMat = new THREE.MeshBasicMaterial({
        color: 0x8fd0ff, transparent: true, opacity: 0.1,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        toneMapped: false, fog: false,
      });
      const energy = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(W - 0.06, H - 0.06, 0.07)), shieldEnergyMat);
      energy.position.z = 0.012;
      shieldMesh.add(energy);

      // Outer rim glow (additive) — pulses softly, flares white on a blocked hit.
      shieldRimMat = new THREE.MeshBasicMaterial({
        color: 0x66c2ff, transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        toneMapped: false, fog: false,
      });
      const rimShape = roundedRect(W + 0.1, H + 0.1, 0.13);
      rimShape.holes.push(roundedRect(W + 0.02, H + 0.02, 0.1));
      const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape), shieldRimMat);
      rim.position.z = -0.045;
      shieldMesh.add(rim);

      // Two horizontal reinforcement bands across the viewport.
      const bandMat = new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: 0.8, roughness: 0.5 });
      for (const by of [0.2, -0.2]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.04, 0.02), bandMat);
        band.position.set(0, by, 0.012);
        shieldMesh.add(band);
      }

      // Reinforced central boss + status core (colour = shield integrity).
      const boss = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.1, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0x2b3645, metalness: 0.9, roughness: 0.35 }),
      );
      boss.rotation.x = Math.PI / 2;
      boss.position.z = 0.02;
      shieldMesh.add(boss);
      shieldCoreMat = new THREE.MeshStandardMaterial({
        color: 0x0a1a12, emissive: 0x33ff88, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.3,
        toneMapped: false,
      });
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.055, 16), shieldCoreMat);
      core.rotation.x = Math.PI / 2;
      core.position.z = 0.03;
      shieldMesh.add(core);

      // Grip on the player side (mostly hidden behind the panel).
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.34, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x12181f, metalness: 0.6, roughness: 0.6 }),
      );
      grip.position.set(0.12, 0, 0.12);
      shieldMesh.add(grip);

      // Braced forward-lower-left in view space; the loop eases it in/out.
      shieldMesh.position.set(-0.46, -0.34, -0.78);
      shieldMesh.rotation.set(0.06, 0.36, 0.05);
      shieldMesh.visible = false;
      shieldMesh.renderOrder = 5;
      shieldMesh.traverse((o) => { o.userData.cannotReceiveAO = true; });
      camera.add(shieldMesh);
    }

    // Floating effect indicators above the player (one icon per active effect).
    const effectIndicators = new EffectIndicators(scene);
    const _effectAnchor = new THREE.Vector3();

    // Phantom translucency — fade the visible weapon while cloaked so the
    // local player gets clear feedback. Only re-applied on state change.
    let _phantomVisualOn = false;
    const applyPhantomVisual = (active: boolean) => {
      if (active === _phantomVisualOn) return;
      _phantomVisualOn = active;
      gunModel.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (!mat) return;
        const mats = Array.isArray(mat) ? mat : [mat];
        for (const m of mats) {
          const mm = m as THREE.Material & { opacity: number; transparent: boolean };
          mm.transparent = true;
          mm.opacity = active ? 0.4 : 1.0;
          mm.needsUpdate = true;
        }
      });
    };

    // PLAYER GROUND SHADOW — driven by LocalPlayerShadow (utils/LocalPlayerShadow.ts)
    // The previous in-line shadow body (a handful of boxes attached to
    // the camera) projected a stiff, T-pose silhouette and didn't track
    // the held weapon — replaced by the full character-model shadow
    // caster which renders an invisible humanoid + per-weapon mesh and
    // animates walk / aim every frame.

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
      type ParticleGeoExt = THREE.BufferGeometry & { _velocities: Float32Array; _phases: Float32Array };
      (particleGeo as ParticleGeoExt)._velocities = velocities;
      (particleGeo as ParticleGeoExt)._phases = phases;

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
      ambientParticles.userData.cannotReceiveAO = true;
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
    // === SKILL TREE BONUSES ===
    // Live snapshot of stat boosts from unlocked skills. Refreshed periodically
    // so newly-spent points show up in gameplay within a fraction of a second.
    let skillBonuses: Record<string, number> = skillTree.calculateStatBonuses();
    let skillBonusAccum = 0;
    let playerMaxHealth = 100 + (skillBonuses['maxHealth'] || 0);
    let regenAccum = 0;
    const skillBonus = (stat: string): number => skillBonuses[stat] || 0;
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
    const startTime = Date.now(); // Track game start time
    let currentWeapon = 'pistol';
    let canShoot = true;
    let isReloading = false;
    // Tutorial mode hands the player every weapon so they can try them all.
    const unlockedWeapons = isTutorialMode ? Object.keys(WEAPONS) : ['pistol'];
    let isAiming = false;
    let timeScale = 1.0; // For slow-mo effects (1.0 = normal speed)
    let fovPunch = 0; // FOV punch on shooting (additive degrees)
    let fovCheckAccum = 0; // throttles re-reading the FOV setting
    let abilityHudAccum = 0; // throttles ability-bar HUD updates

    // Track player velocity for AI prediction
    const playerVelocity = new THREE.Vector3(0, 0, 0);
    const lastPlayerPosition = new THREE.Vector3(0, 5, 10);

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
    const robotSparks: RobotHitSparks[] = [];

    // Camera shake system
    let cameraShakeIntensity = 0;
    const cameraShakeDecay = 0.9;

    // Game objects
    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    const powerUps: PowerUp[] = [];
    const particles: Particle[] = [];

    // Temporary explosion craters left by the rocket launcher
    interface Crater { mesh: THREE.Object3D; life: number; maxLife: number; }
    const craters: Crater[] = [];

    // ── REMOTE PLAYERS (multiplayer only) ─────────────────────────────────
    // Renders every other connected player as a uniquely-modelled avatar
    // with nameplate, health bar, and smoothly-interpolated movement.
    // Friendly fire is structurally impossible: bullets only test the
    // enemy spatial grid (remote-player meshes are never added to it).
    let remotePlayerManager: RemotePlayerManager | null = null;
    const remotePlayerUnsubs: Array<() => void> = [];
    if (isMultiplayer && multiplayerManager) {
      remotePlayerManager = new RemotePlayerManager(scene, {
        shadows: graphicsPreset.shadowsEnabled,
      });

      // Seed with anyone already in the lobby (host-side & late-joiners).
      const gs = multiplayerManager.getGameState();
      if (gs) {
        remotePlayerManager.syncFromPlayerMap(gs.players, multiplayerManager.getLocalPlayer().id);
      } else {
        multiplayerManager.getRemotePlayers().forEach((p) => {
          remotePlayerManager!.addOrUpdatePlayer(
            p,
            Array.from(multiplayerManager.getRemotePlayers().keys()),
          );
        });
      }

      // Live updates — position/health/state changes from every other peer
      remotePlayerUnsubs.push(
        multiplayerManager.onMessage('player_update', (raw) => {
          const msg = raw as { data: MpPlayerData };
          if (!remotePlayerManager) return;
          if (msg.data.id === multiplayerManager.getLocalPlayer().id) return;
          const allIds = Array.from(multiplayerManager.getRemotePlayers().keys());
          allIds.push(multiplayerManager.getLocalPlayer().id);
          remotePlayerManager.addOrUpdatePlayer(msg.data, allIds);
        }),
      );

      // New player joined mid-match → spawn an avatar for them
      remotePlayerUnsubs.push(
        multiplayerManager.onMessage('player_joined', (raw) => {
          const msg = raw as { data: MpPlayerData };
          if (!remotePlayerManager) return;
          if (msg.data.id === multiplayerManager.getLocalPlayer().id) return;
          const allIds = Array.from(multiplayerManager.getRemotePlayers().keys());
          allIds.push(multiplayerManager.getLocalPlayer().id);
          if (!allIds.includes(msg.data.id)) allIds.push(msg.data.id);
          remotePlayerManager.addOrUpdatePlayer(msg.data, allIds);
        }),
      );

      // Player left / timed out → tear down their avatar
      remotePlayerUnsubs.push(
        multiplayerManager.onMessage('player_left', (raw) => {
          const msg = raw as { playerId: string };
          remotePlayerManager?.removePlayer(msg.playerId);
        }),
      );
    }

    // ── LOCAL PLAYER SHADOW CASTER ────────────────────────────────────────
    // Renders an invisible full-body humanoid attached to the local camera
    // so the player's GROUND SHADOW shows a believable person holding a
    // gun (instead of a floating gun shadow). Used in BOTH solo and
    // multiplayer; the model class is the player's lobby pick in MP, a
    // sensible default in solo.
    const localClassPick = (isMultiplayer && multiplayerManager
      ? multiplayerManager.getLocalPlayer().modelClass
      : undefined) as ClassId | undefined;
    const localColor = (isMultiplayer && multiplayerManager
      ? multiplayerManager.getLocalPlayer().color
      : 0x6a9b3f);
    const localPlayerShadow = new LocalPlayerShadow(scene, {
      modelClass: localClassPick ?? 'ranger',
      color: localColor,
      weapon: 'pistol',
      shadows: graphicsPreset.shadowsEnabled,
    });
    // Watch for class changes mid-match (lobby pick can change in restart)
    if (isMultiplayer && multiplayerManager) {
      remotePlayerUnsubs.push(
        multiplayerManager.onMessage('player_update', (raw) => {
          const msg = raw as { data: MpPlayerData };
          if (msg.data.id !== multiplayerManager.getLocalPlayer().id) return;
          if (msg.data.modelClass) {
            localPlayerShadow.setModelClass(msg.data.modelClass as ClassId, msg.data.color);
          }
        }),
      );
    }

    // ── GLOWING BULLET ───────────────────────────────────────────────────
    // Plain MeshBasicMaterial with an HDR-multiplied colour. Custom shader
    // materials caused TRAA / motion blur to misbehave on Ultra (no
    // velocity output) — basic materials integrate cleanly with the whole
    // post pipeline and bloom catches the HDR colour for the tracer glow.
    // ── BULLET LOOK: glowing tracer pellet ──────────────────────────────
    // Spherical core + double additive glow shells. The oblong/capsule
    // version we tried earlier looked like it was "curving" in flight
    // because the long axis read as a smear when the bullet rotated to
    // face direction — a sphere has no preferred orientation so it
    // reads as a true tracer round regardless of camera angle.
    //
    //   • CORE      — small bright sphere (mature LDR brightness)
    //   • INNER GLOW — slightly larger additive sphere, BackSide rendered
    //                  for a soft inner halo
    //   • OUTER GLOW — wider, low-opacity additive sphere for the tracer
    //                  haze. Both glows are toneMapped so bloom catches
    //                  them as a clean halo, not a city-block blob.
    const sharedBulletCoreGeo = new THREE.SphereGeometry(0.11, 12, 10);
    const sharedBulletInnerGlowGeo = new THREE.SphereGeometry(0.20, 12, 10);
    const sharedBulletOuterGlowGeo = new THREE.SphereGeometry(0.36, 12, 10);
    const projectileCoreColor = 0xfff2a6;
    const projectileGlowColor = 0xffc247;
    const bulletCoreMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const bulletInnerGlowMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const bulletOuterGlowMatCache = new Map<number, THREE.MeshBasicMaterial>();

    const buildBullet = (_color: number): THREE.Group => {
      const cacheKey = projectileCoreColor;
      // Bright core — LDR-bounded so bloom is a halo, not a flare blob.
      let coreMat = bulletCoreMatCache.get(cacheKey);
      if (!coreMat) {
        coreMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileCoreColor).multiplyScalar(1.35),
          toneMapped: true,
          fog: false,
        });
        bulletCoreMatCache.set(cacheKey, coreMat);
      }
      // Inner halo — additive, soft warm orange.
      let innerGlowMat = bulletInnerGlowMatCache.get(cacheKey);
      if (!innerGlowMat) {
        innerGlowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileCoreColor),
          transparent: true,
          opacity: 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
          fog: false,
          side: THREE.BackSide,
        });
        bulletInnerGlowMatCache.set(cacheKey, innerGlowMat);
      }
      // Outer halo — wider tracer haze.
      let outerGlowMat = bulletOuterGlowMatCache.get(cacheKey);
      if (!outerGlowMat) {
        outerGlowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileGlowColor),
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
          fog: false,
          side: THREE.BackSide,
        });
        bulletOuterGlowMatCache.set(cacheKey, outerGlowMat);
      }
      const group = new THREE.Group();
      const outerGlow = new THREE.Mesh(sharedBulletOuterGlowGeo, outerGlowMat);
      const innerGlow = new THREE.Mesh(sharedBulletInnerGlowGeo, innerGlowMat);
      const core = new THREE.Mesh(sharedBulletCoreGeo, coreMat);
      outerGlow.renderOrder = 994;
      innerGlow.renderOrder = 995;
      core.renderOrder = 996;
      outerGlow.userData.cannotReceiveAO = true;
      innerGlow.userData.cannotReceiveAO = true;
      core.userData.cannotReceiveAO = true;
      group.add(outerGlow);
      group.add(innerGlow);
      group.add(core);
      group.userData.cannotReceiveAO = true;
      return group;
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

      // Wave-based AI advancement. Reaction & dodge scaled by difficulty —
      // hard-mode enemies react in ~half the time of easy enemies.
      const dodgeSkill = Math.min((0.1 + wave * 0.03) / Math.max(0.5, diffSettings.reactionMult), 0.95);
      const reactionTime = Math.max((800 - wave * 30) * diffSettings.reactionMult, 110);
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
        // Per-difficulty aggro: easy 35-49m, medium 50-70m, hard 80-112m.
        // Larger aggro = enemy spots and engages player from further out,
        // closing the "player spots enemy first" gap the user reported.
        aggroRange: (50 + Math.random() * 20) * diffSettings.aggroMult,
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

    // ═══════════════════════════════════════════════════════════════════
    //  PICKUP SHARED RESOURCES
    // ═══════════════════════════════════════════════════════════════════
    // Previously every pickup allocated fresh materials + a fresh PointLight
    // on every spawn. Adding a PointLight to the scene triggers three.js
    // to RECOMPILE every material in the world (the lighting state is
    // baked into shaders at compile time) — that was the cause of the
    // visible stutter the user reported when pickups dropped.
    //
    // Fix: pre-allocate a fixed pool of N PointLights at scene init so
    // shader compile happens ONCE during warmup. Pickups acquire/release
    // pool slots via intensity toggling, which never recompiles. Materials
    // + geometries are also cached so per-pickup spawn is allocation-free.
    //
    // Reference: https://discourse.threejs.org/t/scene-freezes-when-adding-dynamically-pointlight/28281
    // ═══════════════════════════════════════════════════════════════════

    // ── PointLight pool (8 lights, eight is comfortably above peak
    //    concurrent visible pickups in typical play) ────────────────────
    const PICKUP_LIGHT_POOL_SIZE = 8;
    const pickupLightPool: { light: THREE.PointLight; inUse: boolean }[] = [];
    for (let _li = 0; _li < PICKUP_LIGHT_POOL_SIZE; _li++) {
      const poolLight = new THREE.PointLight(0xffffff, 0, 9, 1.6);
      poolLight.castShadow = false;
      scene.add(poolLight);
      pickupLightPool.push({ light: poolLight, inUse: false });
    }
    const acquirePickupLight = (color: number): THREE.PointLight | null => {
      for (const slot of pickupLightPool) {
        if (!slot.inUse) {
          slot.inUse = true;
          slot.light.color.setHex(color);
          slot.light.intensity = 4.5;
          return slot.light;
        }
      }
      return null;
    };
    const releasePickupLight = (light: THREE.PointLight | null | undefined) => {
      if (!light) return;
      for (const slot of pickupLightPool) {
        if (slot.light === light) {
          slot.inUse = false;
          slot.light.intensity = 0;
          slot.light.position.set(0, 0, 0);
          return;
        }
      }
    };

    // ── Muzzle-flash PointLight pool ─────────────────────────────────
    // Each MuzzleFlash used to scene.add() its own PointLight on every
    // shot (line 38 of Effects.ts before the fix), which triggered a
    // shader recompile of every material — the cause of the per-shot
    // stutter the user reported when firing for the first time. Pool
    // of 3 is enough for overlapping flashes on autofire weapons.
    const MUZZLE_LIGHT_POOL_SIZE = 3;
    const muzzleLightPool: { light: THREE.PointLight; inUse: boolean }[] = [];
    for (let _ml = 0; _ml < MUZZLE_LIGHT_POOL_SIZE; _ml++) {
      const ml = new THREE.PointLight(0xffaa00, 0, 15);
      ml.castShadow = false;
      scene.add(ml);
      muzzleLightPool.push({ light: ml, inUse: false });
    }
    setMuzzleLightPool(
      () => {
        for (const slot of muzzleLightPool) {
          if (!slot.inUse) { slot.inUse = true; return slot.light; }
        }
        return null;
      },
      (light) => {
        if (!light) return;
        for (const slot of muzzleLightPool) {
          if (slot.light === light) {
            slot.inUse = false;
            slot.light.intensity = 0;
            return;
          }
        }
      },
    );

    // ── Per-color material caches. 6 pickup types → 6 of each material ──
    const pickupShellMatCache = new Map<number, THREE.MeshStandardMaterial>();
    const pickupInnerMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const pickupGlowInnerMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const pickupGlowOuterMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const pickupRingMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const pickupHaloMatCache = new Map<number, THREE.ShaderMaterial>();

    const getShellMat = (color: number, coreColor: number): THREE.MeshStandardMaterial => {
      let m = pickupShellMatCache.get(coreColor);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color, roughness: 0.18, metalness: 0.55,
          emissive: coreColor, emissiveIntensity: 0.85, flatShading: true,
        });
        pickupShellMatCache.set(coreColor, m);
      }
      return m;
    };
    const getInnerMat = (coreColor: number): THREE.MeshBasicMaterial => {
      let m = pickupInnerMatCache.get(coreColor);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(coreColor).multiplyScalar(1.8),
          toneMapped: true, fog: false,
        });
        pickupInnerMatCache.set(coreColor, m);
      }
      return m;
    };
    const getGlowInnerMat = (coreColor: number): THREE.MeshBasicMaterial => {
      let m = pickupGlowInnerMatCache.get(coreColor);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(coreColor), transparent: true, opacity: 0.45,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
          fog: false, side: THREE.BackSide,
        });
        pickupGlowInnerMatCache.set(coreColor, m);
      }
      return m;
    };
    const getGlowOuterMat = (coreColor: number): THREE.MeshBasicMaterial => {
      let m = pickupGlowOuterMatCache.get(coreColor);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(coreColor), transparent: true, opacity: 0.22,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
          fog: false, side: THREE.BackSide,
        });
        pickupGlowOuterMatCache.set(coreColor, m);
      }
      return m;
    };
    const getRingMat = (coreColor: number): THREE.MeshBasicMaterial => {
      let m = pickupRingMatCache.get(coreColor);
      if (!m) {
        m = new THREE.MeshBasicMaterial({
          color: new THREE.Color(coreColor), transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
          fog: false, side: THREE.DoubleSide,
        });
        pickupRingMatCache.set(coreColor, m);
      }
      return m;
    };
    const getHaloMat = (coreColor: number): THREE.ShaderMaterial => {
      let m = pickupHaloMatCache.get(coreColor);
      if (!m) {
        m = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: new THREE.Color(coreColor) },
            uOpacity: { value: 0.6 },
            uTime: { value: 0 },
          },
          vertexShader: /* glsl */`
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */`
            uniform vec3 uColor;
            uniform float uOpacity;
            uniform float uTime;
            varying vec2 vUv;
            void main() {
              float d = length(vUv - 0.5) * 2.0;
              float glow = 1.0 - smoothstep(0.0, 1.0, d);
              glow = pow(glow, 1.5);
              float pulse = 0.85 + sin(uTime * 2.0 - d * 4.0) * 0.15;
              gl_FragColor = vec4(uColor, glow * uOpacity * pulse);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        pickupHaloMatCache.set(coreColor, m);
      }
      return m;
    };

    // ── Shared geometries (also cached per shape) ────────────────────────
    const pickupGeoCache = new Map<string, THREE.BufferGeometry>();
    const _pgeo = <T extends THREE.BufferGeometry>(key: string, factory: () => T): T => {
      let g = pickupGeoCache.get(key);
      if (!g) { g = factory(); pickupGeoCache.set(key, g); }
      return g as T;
    };
    // Halo / glow / ring shapes are the same for every pickup
    const glowInnerGeoShared = _pgeo('pgGlowInner', () => new THREE.SphereGeometry(0.75, 16, 12));
    const glowOuterGeoShared = _pgeo('pgGlowOuter', () => new THREE.SphereGeometry(1.4, 16, 12));
    const ringGeoShared      = _pgeo('pgRing',      () => new THREE.TorusGeometry(1.0, 0.04, 6, 32));
    const haloGeoShared      = _pgeo('pgHalo',      () => new THREE.CircleGeometry(2.2, 24));

    const createPowerUp = (x: number, z: number, type: PowerUp['type']): PowerUp => {
      // ── PICKUP GEOMETRY: layered, beacon-class loot drops ─────────────
      // The geometry shape varies by type (box for health/ammo, cone for
      // speed, octahedron for damage, icosahedron for shield, torus for
      // infinite_ammo). Everything else (materials, shared shapes, light)
      // is pooled — spawning a pickup is now allocation-light.
      let color = 0x00ff00;
      let coreColor = 0xffffff;
      let shellGeo: THREE.BufferGeometry;
      let innerGeo: THREE.BufferGeometry;
      switch (type) {
        case 'overcharge':
          color = 0xb86a08; coreColor = 0xffcc33;
          shellGeo = _pgeo('pgShellOc', () => new THREE.DodecahedronGeometry(0.55, 0));
          innerGeo = _pgeo('pgInnerOc', () => new THREE.DodecahedronGeometry(0.26, 0));
          break;
        case 'ammo':
          color = 0x8a5a18; coreColor = 0xffd54a;
          shellGeo = _pgeo('pgShellA', () => new THREE.BoxGeometry(0.78, 0.5, 0.5));
          innerGeo = _pgeo('pgInnerA', () => new THREE.BoxGeometry(0.55, 0.28, 0.28));
          break;
        case 'speed':
          color = 0x08808a; coreColor = 0x6ef0ff;
          shellGeo = _pgeo('pgShellSp', () => new THREE.ConeGeometry(0.45, 0.95, 5));
          innerGeo = _pgeo('pgInnerSp', () => new THREE.ConeGeometry(0.18, 0.55, 4));
          break;
        case 'damage':
          color = 0xa6320a; coreColor = 0xff8a3a;
          shellGeo = _pgeo('pgShellD', () => new THREE.OctahedronGeometry(0.55, 0));
          innerGeo = _pgeo('pgInnerD', () => new THREE.OctahedronGeometry(0.25, 0));
          break;
        case 'shield':
          color = 0x0a4880; coreColor = 0x55b0ff;
          shellGeo = _pgeo('pgShellSh', () => new THREE.IcosahedronGeometry(0.55, 0));
          innerGeo = _pgeo('pgInnerSh', () => new THREE.IcosahedronGeometry(0.26, 0));
          break;
        case 'infinite_ammo':
          color = 0x701a70; coreColor = 0xff5aff;
          shellGeo = _pgeo('pgShellI', () => new THREE.TorusGeometry(0.42, 0.13, 8, 18));
          innerGeo = _pgeo('pgInnerI', () => new THREE.TorusGeometry(0.42, 0.06, 6, 16));
          break;
        case 'phantom':
          color = 0x4a1d7a; coreColor = 0xb388ff;
          shellGeo = _pgeo('pgShellPh', () => new THREE.TorusKnotGeometry(0.32, 0.12, 64, 8));
          innerGeo = _pgeo('pgInnerPh', () => new THREE.IcosahedronGeometry(0.24, 0));
          break;
        default:
          shellGeo = _pgeo('pgShellD0', () => new THREE.BoxGeometry(0.6, 0.6, 0.6));
          innerGeo = _pgeo('pgInnerD0', () => new THREE.BoxGeometry(0.32, 0.32, 0.32));
      }

      const group = new THREE.Group();
      group.position.set(x, 2, z);

      // OUTER SHELL — PBR material (shared by color).
      const shell = new THREE.Mesh(shellGeo, getShellMat(color, coreColor));
      shell.castShadow = false;
      shell.receiveShadow = true;
      shell.userData.cannotReceiveAO = true;
      group.add(shell);

      // INNER GEM — bright unlit core (shared by color).
      const inner = new THREE.Mesh(innerGeo, getInnerMat(coreColor));
      inner.userData.cannotReceiveAO = true;
      group.add(inner);

      // TWIN ADDITIVE GLOW SPHERES (shared geometry + per-color material)
      const glowInner = new THREE.Mesh(glowInnerGeoShared, getGlowInnerMat(coreColor));
      glowInner.userData.cannotReceiveAO = true;
      glowInner.renderOrder = 989;
      group.add(glowInner);

      const glowOuter = new THREE.Mesh(glowOuterGeoShared, getGlowOuterMat(coreColor));
      glowOuter.userData.cannotReceiveAO = true;
      glowOuter.renderOrder = 988;
      group.add(glowOuter);

      // ROTATING RING (shared geometry + per-color material)
      const ring = new THREE.Mesh(ringGeoShared, getRingMat(coreColor));
      ring.rotation.x = Math.PI / 2;
      ring.userData.cannotReceiveAO = true;
      ring.renderOrder = 988;
      group.add(ring);

      // GROUND HALO DISC (shared geometry + per-color shader material)
      const halo = new THREE.Mesh(haloGeoShared, getHaloMat(coreColor));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -1.95; // ~ground level (group bobs around y=2)
      halo.userData.cannotReceiveAO = true;
      halo.renderOrder = 986;
      group.add(halo);

      // POINT LIGHT — borrowed from the pre-allocated scene-level pool.
      // Lives in WORLD space (parent = scene) because we can't reparent
      // a pool light without triggering the recompile we're trying to
      // avoid. The per-frame loop syncs its position to the pickup.
      const pickupLight = acquirePickupLight(coreColor);

      // Stash references so the per-frame loop can drive every layer.
      group.userData.shell = shell;
      group.userData.inner = inner;
      group.userData.glowInner = glowInner;
      group.userData.glowOuter = glowOuter;
      group.userData.ring = ring;
      group.userData.halo = halo;
      group.userData.haloMat = halo.material as THREE.ShaderMaterial;
      group.userData.light = pickupLight; // may be null when pool exhausted
      // Phase offset so neighbouring pickups don't pulse in sync
      group.userData.pulsePhase = Math.random() * Math.PI * 2;
      // `core` is the mesh exposed to gameplay code (pickup collision,
      // cleanup). Aliasing the group keeps `core.position` / `core.userData`
      // calls below working without further changes.
      const core = group as unknown as THREE.Mesh;
      core.userData.cannotReceiveAO = true;
      core.renderOrder = 990;
      scene.add(group);

      return {
        mesh: core,
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

    // Spawns up to `count` enemies in a ring around the player. Returns how
    // many actually spawned (the enemy cap / pool may permit fewer).
    // Picks an enemy spawn position that doesn't overlap a collidable
    // tree / rock / boulder. Tries up to 6 random angles per distance
    // attempt, widening the ring if every angle is blocked. Last-resort
    // returns the final candidate so we always spawn something.
    const findEnemySpawnSpot = (baseDist: number, radius: number) => {
      const ENEMY_RADIUS = radius;
      let lastX = 0, lastZ = 0;
      for (let ring = 0; ring < 4; ring++) {
        const dist = baseDist + ring * 6;
        for (let a = 0; a < 6; a++) {
          const angle = Math.random() * Math.PI * 2;
          const x = Math.cos(angle) * dist + camera.position.x;
          const z = Math.sin(angle) * dist + camera.position.z;
          lastX = x; lastZ = z;
          if (!overlapsTerrain(x, z, ENEMY_RADIUS)) return { x, z };
        }
      }
      return { x: lastX, z: lastZ };
    };

    const spawnEnemyBatch = (count: number): number => {
      const adaptiveMax = smartEnemyManager.getCurrentMaxEnemies();
      const hardish = classicDifficulty === 'hard' || classicDifficulty === 'adaptive';
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        if (enemies.length >= adaptiveMax || !smartEnemyManager.canSpawnMore()) break;
        let type: 'normal' | 'fast' | 'tank' | 'boss' = 'normal';
        const rand = Math.random();
        if (wave >= 5 && rand < (hardish ? 0.12 : 0.08)) type = 'boss';
        else if (wave >= 3 && rand < (hardish ? 0.32 : 0.24)) type = 'tank';
        else if (wave >= 2 && rand < (hardish ? 0.5 : 0.42)) type = 'fast';
        // Bosses are bigger (scale 2.0) so they need a wider clearance.
        const enemyRadius = type === 'boss' ? 2.0 : type === 'tank' ? 1.6 : 1.2;
        const baseDist = 42 + Math.random() * 26;
        const spot = findEnemySpawnSpot(baseDist, enemyRadius);
        const enemy = createEnemy(spot.x, spot.z, type);
        if (enemy) {
          // Host stamps a stable network id so guests can track this enemy.
          if (isMpHost) {
            enemy.netId = nextEnemyNetId++;
            enemyByNetId.set(enemy.netId, enemy);
          }
          enemies.push(enemy);
          spawned++;
        }
      }
      return spawned;
    };

    // Picks a powerup spawn point that doesn't overlap a collidable
    // terrain object (tree / rock / boulder). Tries up to 10 random
    // positions in a ring around the player; widens the ring slightly
    // each attempt to escape dense forest clusters. Falls back to a
    // best-effort placement if no clean spot is found.
    const findPickupSpot = (baseX: number, baseZ: number, minR: number, maxR: number) => {
      const PICKUP_RADIUS = 1.0; // pickup itself ~1 unit, clear of any tree
      for (let attempt = 0; attempt < 10; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const ringWiden = attempt * 1.5; // step further out each retry
        const dist = minR + ringWiden + Math.random() * (maxR - minR);
        const x = baseX + Math.cos(angle) * dist;
        const z = baseZ + Math.sin(angle) * dist;
        if (!overlapsTerrain(x, z, PICKUP_RADIUS)) return { x, z };
      }
      // Last-resort: push diagonally further out so the player isn't
      // looking at a powerup buried inside a trunk.
      return {
        x: baseX + (maxR + 8) * (Math.random() < 0.5 ? -1 : 1),
        z: baseZ + (maxR + 8) * (Math.random() < 0.5 ? -1 : 1),
      };
    };

    // Wave-start loot drop — a single, truly-random power crate (same pool as
    // enemy loot). One spawn keeps powers a genuine reward, not a stream.
    const spawnWavePowerUps = () => {
      const spot = findPickupSpot(camera.position.x, camera.position.z, 20, 35);
      powerUps.push(createPowerUp(spot.x, spot.z, randomLoot()));
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
      // Wave size: 7 + wave*3 (was 10 + wave*5) — smaller waves so the
      // pace stays manageable, especially on Easy.
      waveEnemiesRemaining = Math.max(4, Math.floor((7 + wave * 3) * diffSettings.spawnMult));
      const opening = Math.min(5, waveEnemiesRemaining);
      waveEnemiesRemaining -= spawnEnemyBatch(opening);
      // Slowed wave spawn frequency from every 2nd wave → every 3rd wave.
      // Combined with the per-spawn count cut (2 → 1) and the reduced
      // enemy-kill drop rate, powerups are now a real reward rather than
      // a constant resupply.
      if (wave % 3 === 0) spawnWavePowerUps();
    };

    // Continuous enemy spawning — paces how fast the wave budget drains in.
    let lastSpawnTime = Date.now();

    const getSpawnSettings = () => {
      switch (classicDifficulty) {
        // Wider intervals and smaller batches across the board so the
        // player isn't drowning in adds. Easy in particular is now a
        // gentle drip-feed rather than a steady horde.
        case 'easy':     return { interval: 6500, baseSpawn: 2 };
        case 'medium':   return { interval: 5000, baseSpawn: 3 };
        case 'hard':     return { interval: 3800, baseSpawn: 4 };
        case 'adaptive': return { interval: 5500, baseSpawn: 3 };
        default:         return { interval: 5000, baseSpawn: 3 };
      }
    };
    const spawnSettings = getSpawnSettings();

    const continuousSpawn = () => {
      // Guests never spawn — their enemies are mirrored from the host.
      if (isMpGuest) return;
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

    // Guests don't seed the opening wave — they receive enemies from the host.
    if (!isMpGuest) spawnWave();

    // Movement
    const keys: Keys = {};
    const moveSpeed = 0.3;
    const sprintMultiplier = 1.8;
    const baseJumpPower = 0.5; // Prominent jump — clears most rocks/obstacles
    const gravity = 0.02;

    // ── STAMINA SYSTEM ─────────────────────────────────────────────────
    // Sprinting is now bounded — the player has a stamina pool that
    // depletes while sprinting and regenerates while not. Once empty,
    // sprinting is locked out until a small minimum threshold of stamina
    // has regenerated (prevents stutter-sprint exploit at 0 stamina).
    // Wired to the HUD via setStaminaRatio so the bottom-left pie meter
    // reflects live state.
    const STAMINA_MAX = 100;
    const STAMINA_DEPLETE_PER_SEC = 28;    // ~3.5s of full sprint from 100
    // Regen slowed from 18/s → 7/s — a full refill now takes ~14s instead
    // of ~5.5s. Pair with the longer regen delay (was 0.7s → 1.6s) so
    // stamina actually feels like a budget the player has to manage
    // rather than something that's effectively unlimited.
    const STAMINA_REGEN_PER_SEC = 7;
    const STAMINA_REGEN_DELAY_S = 1.6;     // pause before regen kicks in after sprint
    // Re-engage threshold after exhaustion bumped 8 → 18 so the player
    // can't tap-sprint at 0 — they have to wait for meaningful recovery.
    const STAMINA_REQUIRED_TO_SPRINT = 18;
    let stamina = STAMINA_MAX;
    let staminaExhausted = false;         // true after hitting 0 — locks sprint
    let staminaIdleTimer = 0;             // seconds since last sprint frame
    // Throttle state for pushing stamina into React (avoids 60fps reconciles).
    let staminaPushAccum = 0;
    let lastPushedStaminaRatio = 1;
    let lastPushedExhausted = false;

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

    // Held riot shield — directional (blocks the front arc) and time-based,
    // and now backed by a DAMAGE-ABSORB POOL: frontal hits drain the pool
    // instead of the player's health; when the pool empties (or time runs out)
    // the shield shatters. Set by the shield power-up.
    let shieldActive = false;
    let shieldEndTime = 0;
    const shieldDuration = 12000; // 12 seconds
    const SHIELD_ABSORB_MAX = 160; // damage the shield soaks before it breaks
    let shieldAbsorb = 0;          // remaining absorb (0..SHIELD_ABSORB_MAX)
    const SHIELD_BLOCK_DOT = Math.cos((62 * Math.PI) / 180); // front arc half-angle
    // Visual/animation state for the held shield mesh.
    let shieldRaise = 0;        // 0 = stowed, 1 = fully braced (eased each frame)
    let shieldHitFlash = 0;     // 0..1, spikes on a blocked hit then decays
    let shieldBreakFlash = 0;   // 0..1, spikes when the shield shatters
    // Reusable temps for the per-hit frontal-block test (avoid per-hit allocs).
    const _shieldFwd = new THREE.Vector3();
    const _shieldToEnemy = new THREE.Vector3();
    const _shieldHitPos = new THREE.Vector3();

    // ── HELD POWER-UP INVENTORY (one slot, loot-driven) ──────────────────────
    // The player holds AT MOST ONE looted power at a time. Walking over a loot
    // crate stows the power (it is NOT auto-applied); pressing E activates it,
    // emptying the slot. While a power is held, new crates can't be collected —
    // the player must spend the current one first. Truly random per drop.
    type HeldPower = 'ammo' | 'speed' | 'damage' | 'shield' | 'infinite_ammo' | 'overcharge' | 'phantom';
    const LOOT_POOL: HeldPower[] = ['ammo', 'speed', 'damage', 'shield', 'infinite_ammo', 'overcharge', 'phantom'];
    const POWER_LABELS: Record<HeldPower, string> = {
      ammo: 'Ammo', speed: 'Speed', damage: 'Damage', shield: 'Shield',
      infinite_ammo: 'Inf. Ammo', overcharge: 'Overcharge', phantom: 'Phantom',
    };
    const randomLoot = (): HeldPower => LOOT_POOL[(Math.random() * LOOT_POOL.length) | 0];
    let heldPower: HeldPower | null = null;
    let lastHeldHintAt = 0; // throttles the "use your power first" hint

    // Activate a looted power's effect (the slot is emptied by the caller).
    // Hoisted so the keydown handler (defined earlier) can call it.
    function applyPower(type: HeldPower) {
      const nowMs = Date.now();
      switch (type) {
        case 'overcharge':
          overchargeActive = true;
          overchargeEndTime = nowMs + overchargeDuration;
          setPowerUpMessage('Overcharge · faster fire & damage');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overcharge Active!', 'powerup');
          createParticles(camera.position, 0xffcc33, 22);
          break;
        case 'ammo':
          ammo = WEAPONS[currentWeapon].maxAmmo;
          setPowerUpMessage('Ammo Refilled');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Ammo Refilled', 'powerup');
          createParticles(camera.position, 0xffd54a, 12);
          break;
        case 'speed':
          speedBoostActive = true;
          speedBoostEndTime = nowMs + speedBoostDuration;
          setPowerUpMessage('Speed Boost · 10s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Speed Boost Active!', 'powerup');
          createParticles(camera.position, 0x6ef0ff, 20);
          break;
        case 'damage':
          damageBoostActive = true;
          damageBoostEndTime = nowMs + damageBoostDuration;
          setPowerUpMessage('Damage Boost · 15s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Damage Boost Active!', 'powerup');
          createParticles(camera.position, 0xff8a3a, 20);
          break;
        case 'shield':
          shieldActive = true;
          shieldEndTime = nowMs + shieldDuration;
          shieldAbsorb = SHIELD_ABSORB_MAX;
          shieldBreakFlash = 0;
          setPowerUpMessage('Riot Shield · absorbs frontal damage');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Riot Shield Up!', 'powerup');
          createParticles(camera.position, 0x66c2ff, 20);
          break;
        case 'infinite_ammo':
          infiniteAmmoActive = true;
          infiniteAmmoEndTime = nowMs + infiniteAmmoDuration;
          setPowerUpMessage('Infinite Ammo · 20s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Infinite Ammo Active!', 'powerup');
          createParticles(camera.position, 0xff5aff, 22);
          break;
        case 'phantom':
          phantomActive = true;
          phantomEndTime = nowMs + phantomDuration;
          setPowerUpMessage('Phantom · enemies lose track of you');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Phantom Active!', 'powerup');
          createParticles(camera.position, 0xb388ff, 22);
          break;
      }
      // Quick cast flourish + (for the ability-style powers) an activation flare.
      gunModel.triggerAbility();
      soundManager.play('powerUp', 0.7);
      if (type === 'shield' || type === 'phantom' || type === 'overcharge') {
        abilitySystem.createAbilityEffect(scene, camera.position, type);
      }
      setTimeout(() => setPowerUpMessage(''), 2000);
    }

    let infiniteAmmoActive = false;
    let infiniteAmmoEndTime = 0;
    const infiniteAmmoDuration = 20000; // 20 seconds

    // Overcharge — temporary +fire-rate & +damage combat burst (replaces heal).
    let overchargeActive = false;
    let overchargeEndTime = 0;
    const overchargeDuration = 8000; // 8 seconds
    const overchargeDamageMult = 1.6;
    const overchargeFireRateMult = 1.8; // fires ~1.8x faster

    // Phantom — stealth + intangible; enemies lose track of the player.
    let phantomActive = false;
    let phantomEndTime = 0;
    const phantomDuration = 5000; // 5 seconds

    // DASH ABILITY - Quick burst of speed
    let isDashing = false;
    let dashCooldown = 0;
    const dashCooldownTime = 2.0; // 2 second cooldown
    const dashDuration = 0.15; // 150ms dash
    const dashSpeed = 2.5; // Dash speed multiplier
    let dashTimer = 0;
    const dashDirection = new THREE.Vector3();

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

        // Tutorial popup owns the ESC key — pressing it should NOT bring
        // up the pause menu over the top of the tutorial card. The
        // TutorialOverlay component handles ESC for dismiss/advance.
        if (tutorialActiveRef.current) {
          return;
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
        // Dash Mastery skill shrinks the cooldown (bonus value is negative)
        dashCooldown = dashCooldownTime * Math.max(0.15, 1 + skillBonus('dashCooldown'));

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
        tutorial.recordAction('use_ability', 1); // advances the dash tutorial step
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

      // USE HELD POWER — 'E' activates whatever loot power is currently held,
      // then empties the slot. Powers come exclusively from enemy loot now
      // (one at a time), so there's no point-unlock gating any more.
      if (e.code === 'KeyE' && !paused) {
        if (heldPower) {
          const power = heldPower;
          heldPower = null;
          applyPower(power);
        } else {
          setPowerUpMessage('No power held — defeat enemies to find loot');
          setTimeout(() => setPowerUpMessage(''), 1600);
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
          gunModel.switchWeapon(weaponName as GunWeaponType);
          setGunFillForWeapon(weaponName);
          tutorial.recordAction('switch_weapon', 1);
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
        tutorial.recordAction('reload', 1);
        // Quickdraw skill speeds up the reload
        const reloadMs = weapon.reloadTime / (1 + skillBonus('reloadSpeed'));
        setTimeout(() => {
          ammo = weapon.maxAmmo;
          isReloading = false;
          updateGameState();
        }, reloadMs);
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

      // Legacy AO-opt-out userData kept for forward-compat with any future AO pass.
      body.userData.cannotReceiveAO = true;
      body.traverse((o) => { o.userData.cannotReceiveAO = true; });

      return body;
    };

    // Enhanced shooting
    const shoot = () => {
      if (ammo > 0 && !isGameOver && !paused && canShoot && !isReloading && !tutorialActiveRef.current) {
        const weapon = WEAPONS[currentWeapon];
        canShoot = false;
        // Overcharge shortens the inter-shot delay (faster fire rate).
        const fireDelay = overchargeActive ? weapon.fireRate / overchargeFireRateMult : weapon.fireRate;
        setTimeout(() => { canShoot = true; }, fireDelay);

        // Only consume ammo if infinite ammo powerup is not active
        if (!infiniteAmmoActive) {
          ammo--;
        }
        // Per-weapon recoil scaled by weight — pistol kicks gently,
        // shotgun/sniper kick HARD, minigun/launcher are bone-shakers.
        // Strength curve: weight 1.0 → 0.6, 1.5 → 0.95, 2.0 → 1.4, 3.0 → 2.3.
        const recoilStrength = Math.pow(weapon.weight, 1.45) * 0.6;
        gunModel.triggerRecoil(recoilStrength);
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

          // Reduce spread when aiming + Steady Hands skill tightens it further.
          // Sniper specifically is a precision weapon — when scoped, spread
          // collapses to ZERO so the bullet lands exactly on the crosshair,
          // not just "close to it". For other ADS weapons, spread shrinks to
          // 20% (still tight enough for accurate hip-fire-corrected aim).
          const isScopedSniper = isAiming && currentWeapon === 'sniper';
          const aimingScale = (isAiming && weapon.canAim) ? (isScopedSniper ? 0 : 0.2) : 1.0;
          const spreadMultiplier = aimingScale / (1 + skillBonus('accuracy'));
          direction.x += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.y += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.z += (Math.random() - 0.5) * weapon.spread * spreadMultiplier;
          direction.normalize();

          let bullet: THREE.Object3D;
          if (isLauncher) {
            // Launcher fires a real rocket projectile, oriented along its flight path
            bullet = createRocketProjectile();
            bullet.position.copy(camera.position);
            bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
          } else {
            // Shared geometry + cached material — no per-shot allocation.
            bullet = buildBullet(weapon.bulletColor);
            bullet.position.copy(camera.position);
          }
          scene.add(bullet);

          // Apply damage boost + overcharge powerups AND the Heavy Hitter skill bonus
          let baseWeaponDamage = damageBoostActive ? weapon.damage * damageBoostMultiplier : weapon.damage;
          if (overchargeActive) baseWeaponDamage *= overchargeDamageMult;
          const bulletDamage = baseWeaponDamage * (1 + skillBonus('weaponDamage'));

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
          if (isTutorialMode && (Math.abs(e.movementX) > 1 || Math.abs(e.movementY) > 1)) {
            tutorial.recordAction('look', 1); // advances the camera-control step
          }
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
        setGunFillForWeapon(currentWeapon);
        tutorial.recordAction('switch_weapon', 1);
        updateGameState();
        soundManager.play('reload', 0.4);
      }
    };

    document.addEventListener('wheel', onMouseWheel, { passive: false });

    const updateGameState = () => {
      checkWeaponUnlocks();
      setGameState({
        health,
        maxHealth: playerMaxHealth,
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

    // === SPATIAL HASH GRIDS ===
    // Replace O(N²) and O(B×E) per-frame scans with O(near) cell lookups.
    //
    // ─ enemyGrid: rebuilt every frame from the alive-enemy positions; powers
    //   enemy-enemy separation AND bullet-vs-enemy collision.
    // ─ terrainGrid: rebuilt only when the chunk loader changes the world
    //   (terrain is static while in combat) — powers obstacle repulsion.
    //
    // 7-unit cells are comfortably larger than the biggest enemy/obstacle
    // radius, so a 1-cell query catches every meaningful neighbour.
    const enemyGrid = new SpatialGrid<number>(7);
    const terrainGrid = new SpatialGrid<number>(8);
    let terrainGridStamp = -1; // bumps whenever terrainObjects changes shape
    const rebuildTerrainGridIfStale = () => {
      // Cheap shape hash — length covers add/remove from chunk streaming.
      // Terrain objects don't move, so length alone is a reliable signal.
      if (terrainGridStamp === terrainObjects.length) return;
      terrainGridStamp = terrainObjects.length;
      terrainGrid.clear();
      for (let k = 0; k < terrainObjects.length; k++) {
        const obj = terrainObjects[k];
        if (!obj.collidable) continue;
        terrainGrid.insert(k, obj.x, obj.z);
      }
    };

    // Extracted enemy-kill handler — shared by direct bullet hits and the
    // rocket launcher's area-of-effect so score, combos, drops, achievements
    // and wave progression all behave identically however an enemy dies.
    const handleEnemyKilled = (enemy: Enemy, isCritical: boolean, killerId?: string) => {
      // ── WORLD state (authoritative): the enemy is dead for everyone. ──
      enemy.dead = true;
      enemy.deathTime = 1.0;
      soundManager.play('enemyDeath', 0.6);
      createParticles(enemy.mesh.position, 0x00ff00, 8);

      // Who gets the kill? In solo — and for the host's OWN kills — it's the
      // local player. In multiplayer, when a guest's reported hit lands the
      // killing blow, the host credits that guest's client instead so its
      // scoreboard, combo and kill feed update for the player who earned it.
      const localId = mp ? mp.getLocalPlayer().id : null;
      const localGetsCredit = !isMultiplayer || killerId === undefined || killerId === localId;

      if (localGetsCredit) {
        score += enemy.scoreValue;
        enemiesKilled++;
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
        if (combo >= 3) { missionSystem.updateProgress('combo', 1); tutorial.recordAction('combo_3x', 1); }
        tutorial.recordAction('kill', 1);
        if (isCritical) triggerHeadshotFlash(); else triggerKillFlash();
        // Skill points are no longer earned per kill — they're awarded at the end
        // of a Solo run (server-side) so the tree is a real, competitive grind.
        if (gameSettingsManager.getSetting('killFeed')) {
          if (isCritical) addKillFeedEntry('HEADSHOT!', 'headshot');
          else addKillFeedEntry('Enemy Eliminated', 'kill');
          if (combo >= 5 && combo % 5 === 0) addKillFeedEntry(`${combo}x COMBO!`, 'combo');
          if (killStreak === 10) addKillFeedEntry('10 Kill Streak!', 'combo');
          else if (killStreak === 20) addKillFeedEntry('20 Kill Streak!', 'combo');
          else if (killStreak === 30) addKillFeedEntry('30 Kill Streak! UNSTOPPABLE!', 'combo');
        }
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
      } else if (mp && enemy.netId !== undefined) {
        // Killing blow came from a guest — hand them the credit.
        mp.broadcastEnemyKillCredit(killerId!, enemy.netId, enemy.scoreValue, isCritical);
      }
      // Enemy loot — a defeated enemy may drop a single, TRULY RANDOM power
      // crate (any power, equal odds) instead of the old guaranteed ammo.
      // The player can only ever hold one looted power at a time, so this is
      // the sole resupply path now. Scavenger skill nudges the drop rate.
      // Snap the drop to the nearest clear spot so it isn't buried in a tree.
      if (Math.random() < 0.26 * (1 + skillBonus('powerupSpawnRate'))) {
        const ex = enemy.mesh.position.x;
        const ez = enemy.mesh.position.z;
        const PICKUP_RADIUS = 1.0;
        let dropX = ex, dropZ = ez;
        if (overlapsTerrain(ex, ez, PICKUP_RADIUS)) {
          const spot = findPickupSpot(ex, ez, 1.6, 4.0);
          dropX = spot.x; dropZ = spot.z;
        }
        powerUps.push(createPowerUp(dropX, dropZ, randomLoot()));
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

    // ═══════════════════════════════════════════════════════════════════
    //  SHARED-ENEMY NETWORKING (multiplayer, host-authoritative)
    // ═══════════════════════════════════════════════════════════════════
    // The host simulates one enemy world and streams it to guests. Guests
    // mirror it, report their own bullet hits, and take damage only when the
    // host says a shared enemy struck them. These helpers + handlers are the
    // glue; they are no-ops in solo.

    const enemyLabelOf = (type: Enemy['type']): string =>
      type === 'boss' ? 'Boss' : type === 'tank' ? 'Tank' : type === 'fast' ? 'Stalker' : 'Forest Creature';

    // Apply incoming enemy damage to the LOCAL player. Shared by the local
    // enemy-attack path (solo + the host's own hits) and, in multiplayer, by
    // the `player_damaged` event the host sends when a shared enemy strikes a
    // remote player. `enemyPos` enables the directional riot-shield check for
    // local hits; network damage passes null (non-directional block).
    const takeEnemyDamage = (incoming: number, enemyLabel: string, enemyPos: THREE.Vector3 | null) => {
      if (phantomActive || isTutorialMode || playerEliminated) return;

      let damage = incoming * Math.max(0, 1 - skillBonus('damageReduction'));

      if (shieldActive && damage > 0) {
        camera.getWorldDirection(_shieldFwd);
        _shieldFwd.y = 0;
        _shieldFwd.normalize();
        let blocks = true;
        if (enemyPos) {
          _shieldToEnemy.subVectors(enemyPos, camera.position);
          _shieldToEnemy.y = 0;
          _shieldToEnemy.normalize();
          blocks = _shieldFwd.dot(_shieldToEnemy) >= SHIELD_BLOCK_DOT;
        }
        if (blocks) {
          const absorbed = Math.min(shieldAbsorb, damage);
          shieldAbsorb -= absorbed;
          damage -= absorbed;
          shieldHitFlash = 1;
          soundManager.play('hit', 0.5);
          _shieldHitPos.copy(camera.position).addScaledVector(_shieldFwd, 1.6);
          createParticles(_shieldHitPos, 0x9fd8ff, 7);
          if (shieldAbsorb <= 0) {
            shieldActive = false;
            shieldBreakFlash = 1;
            soundManager.play('hit', 0.8);
            createParticles(_shieldHitPos, 0xbfe6ff, 22);
            if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Shield Shattered', 'powerup');
          }
        }
      }

      health -= damage;

      if (damage > 0) {
        adaptiveDifficulty.recordDamage(damage, false);
        adaptiveDifficulty.recordHealthStatus(health, 100);
        missionSystem.updateProgress('survival', 1);
        soundManager.play('playerHurt', 0.5);
        cameraShakeIntensity = Math.min(cameraShakeIntensity + 0.2, 0.25);
        triggerDamageFlash();
        if (damage >= 15 && gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        if (combo > 0) combo = Math.max(0, combo - 1);
        achievementSystem.updateProgress('survivor', 1);
        if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
      }

      updateGameState();

      if (health <= 0) {
        health = 0;
        playerEliminated = true;
        document.exitPointerLock();
        if (isMultiplayer && multiplayerManager) {
          multiplayerManager.updatePlayerHealth(0);
          const victim = multiplayerManager.getLocalPlayer();
          multiplayerManager.broadcastKill(enemyLabel, victim.id, victim.name, victim.color, enemyLabel);
          setIsSpectating(true);
          updateGameState();
        } else {
          isGameOver = true;
          updateGameState();
        }
      }
    };

    // Award a kill to the LOCAL player (used when the host tells us our hit
    // finished off a shared enemy). Mirrors the credit half of handleEnemyKilled.
    const creditLocalKill = (scoreValue: number, isCritical: boolean) => {
      score += scoreValue;
      enemiesKilled++;
      const currentTime = Date.now();
      if (currentTime - lastKillTime < 2000) {
        combo++;
        killStreak++;
        score += combo * 5;
      } else {
        combo = 1;
      }
      lastKillTime = currentTime;
      if (isCritical) triggerHeadshotFlash(); else triggerKillFlash();
      if (gameSettingsManager.getSetting('killFeed')) {
        addKillFeedEntry(isCritical ? 'HEADSHOT!' : 'Enemy Eliminated', isCritical ? 'headshot' : 'kill');
      }
      if (mp) mp.incrementKills();
      updateGameState();
    };

    // Guest: reconcile our mirrored enemy set against the host's snapshot.
    const handleEnemySync = (raw: unknown) => {
      if (!isMpGuest) return;
      const msg = raw as { enemies: EnemyWire[]; wave: number };

      // Host advanced the wave → mirror the banner + a fresh power crate so
      // guests keep pace (powerups stay per-client, as they always have).
      if (typeof msg.wave === 'number' && msg.wave > wave) {
        wave = msg.wave;
        setShowWaveComplete(true);
        if (waveTimeoutId !== null) window.clearTimeout(waveTimeoutId);
        waveTimeoutId = window.setTimeout(() => {
          waveTimeoutId = null;
          setShowWaveComplete(false);
        }, 2500);
        spawnWavePowerUps();
        updateGameState();
      }

      const seen = new Set<number>();
      for (let s = 0; s < msg.enemies.length; s++) {
        const w = msg.enemies[s];
        seen.add(w.id);
        let e = enemyByNetId.get(w.id);
        if (!e) {
          if (w.d) continue; // never materialise an already-dead enemy
          const created = createEnemy(w.x, w.z, ENEMY_TYPE_FROM_CODE[w.ty] ?? 'normal');
          if (!created) continue; // pool exhausted — try again next snapshot
          created.netId = w.id;
          created.mesh.position.set(w.x, w.y, w.z);
          enemies.push(created);
          enemyByNetId.set(w.id, created);
          e = created;
        }
        e.netTargetX = w.x;
        e.netTargetZ = w.z;
        e.netYaw = w.ry;
        e.health = w.hp;
        e.maxHealth = w.mx;
        if (w.d && !e.dead) {
          e.dead = true;
          e.deathTime = 1.0;
          if (Math.random() < 0.26) {
            const spot = findPickupSpot(e.mesh.position.x, e.mesh.position.z, 1.2, 3.5);
            powerUps.push(createPowerUp(spot.x, spot.z, randomLoot()));
          }
        }
      }

      // Enemies the host removed (culled) that we still hold alive → collapse.
      enemyByNetId.forEach((e, id) => {
        if (!seen.has(id) && !e.dead) {
          e.dead = true;
          e.deathTime = 1.0;
        }
      });
    };

    if (isMultiplayer && mp) {
      remotePlayerUnsubs.push(mp.onMessage('enemy_sync', handleEnemySync));

      // Host: a guest reported a hit on a shared enemy — apply it authoritatively.
      remotePlayerUnsubs.push(mp.onMessage('enemy_hit', (raw) => {
        if (!isMpHost) return;
        const m = raw as { netId: number; damage: number; isCritical: boolean; shooterId: string };
        const e = enemyByNetId.get(m.netId);
        if (!e || e.dead) return;
        e.health -= m.damage;
        e.damageFlashTime = m.isCritical ? 0.5 : 0.3;
        if (e.health <= 0) handleEnemyKilled(e, m.isCritical, m.shooterId);
      }));

      // Any client: the host says this kill is ours — score it locally.
      remotePlayerUnsubs.push(mp.onMessage('enemy_kill_credit', (raw) => {
        const m = raw as { netId: number; killerId: string; scoreValue: number; isCritical: boolean };
        if (m.killerId === mp.getLocalPlayer().id) creditLocalKill(m.scoreValue, m.isCritical);
      }));

      // Guest: a shared enemy struck us — the host is the authority on that.
      remotePlayerUnsubs.push(mp.onMessage('player_damaged', (raw) => {
        const m = raw as { targetId: string; damage: number; enemyType: string };
        if (m.targetId !== mp.getLocalPlayer().id) return;
        takeEnemyDamage(m.damage, m.enemyType, null);
      }));
    }

    // Leaves a temporary scorched crater ("ditch") at an explosion site.
    // Shared crater geometries — every explosion uses the same shapes.
    // Materials are per-crater because each fades on its own clock (we
    // can't share .opacity across craters that started at different times).
    const sharedCraterScorchGeo = new THREE.CircleGeometry(4.6, 28);
    const sharedCraterRingGeo = new THREE.RingGeometry(3.1, 4.85, 28);
    const sharedCraterDebrisGeo = new THREE.BoxGeometry(1, 0.7, 1);

    const createCrater = (pos: THREE.Vector3) => {
      const crater = new THREE.Group();
      const scorchMat = new THREE.MeshStandardMaterial({
        color: 0x070604, roughness: 1, metalness: 0,
        transparent: true, opacity: 0.92, depthWrite: false,
      });
      const scorch = new THREE.Mesh(sharedCraterScorchGeo, scorchMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.receiveShadow = true;
      crater.add(scorch);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x241509, roughness: 1,
        transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(sharedCraterRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      crater.add(ring);
      // Debris chunks thrown up around the rim — shared unit box, scaled per chunk
      const debrisMat = new THREE.MeshStandardMaterial({
        color: 0x1c1206, roughness: 0.95, transparent: true, opacity: 1,
      });
      for (let d = 0; d < 10; d++) {
        const a = (d / 10) * Math.PI * 2 + Math.random() * 0.5;
        const r = 3 + Math.random() * 1.9;
        const s = 0.3 + Math.random() * 0.55;
        const chunk = new THREE.Mesh(sharedCraterDebrisGeo, debrisMat);
        chunk.scale.setScalar(s);
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
        if (isMpGuest && mp) {
          // Guest: report the splash hit; the host resolves it.
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
        } else {
          e.health -= dmg;
        }
        e.damageFlashTime = 0.4;
        adaptiveDifficulty.recordDamage(dmg, true);
        if (gameSettingsManager.getSetting('damageNumbers')) {
          _tempVec3_2.copy(e.mesh.position).project(camera);
          const sx = (_tempVec3_2.x * 0.5 + 0.5) * 100;
          const sy = (-_tempVec3_2.y * 0.5 + 0.5) * 100;
          addDamageNumber(Math.floor(dmg), sx, sy, false, false);
        }
        _tempVec3.subVectors(e.mesh.position, pos).normalize();
        robotSparks.push(new RobotHitSparks(scene, e.mesh.position.clone(), _tempVec3, 10));
        if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
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

      // Update day-night cycle system
      atmosphericSettings = dayCycleSystem.update(delta);

      const sunDirection = computeSunDirection();
      const lowLight = sunDirection.y < 0.18;

      // Keep enemy emissive intensity in sync with low-light transitions.
      smartEnemyManager.setNightMode(!atmosphericSettings.sunVisible || lowLight);

      // ── GROUND SHADER UNIFORMS — Cyberpunk-restrained directional sun ──
      // Values intentionally low to avoid the hazy-glow problem from the
      // previous version. Real heavy-lifting is done by three.js's
      // standard PBR + bumped main directional light; this shader just
      // adds the per-pixel normal perturbation + sharp specular pop.
      groundShaderUniforms.uTime.value += delta;
      groundShaderUniforms.uSunDirection.value.copy(sunDirection);
      groundShaderUniforms.uSunColor.value.setHex(atmosphericSettings.lightColor);
      const sunAlt = THREE.MathUtils.clamp(sunDirection.y, 0, 1);
      const isNightShader = !atmosphericSettings.sunVisible;
      // Incident boost is SMALL — just a hint of warmth on sun-facing
      // surfaces. Pow(N·L,3) inside the shader does the directional
      // sharpening.
      groundShaderUniforms.uIncidentBoost.value = isNightShader
        ? 0.04
        : 0.08 + sunAlt * 0.10;
      // Specular is what makes the ground look "polished / wet" — bigger
      // contribution than the diffuse boost. Still bounded so it never
      // crosses the bloom threshold uniformly.
      groundShaderUniforms.uSpecularStrength.value = isNightShader
        ? 0.18
        : 0.45 + sunAlt * 0.35;
      groundShaderUniforms.uIsNight.value = isNightShader ? 1.0 : 0.0;

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

      // Update main light — position follows player so shadow frustum stays on-screen.
      // Multiplier matches the init-time 1.6× so the bright-sun look is
      // preserved across day-cycle transitions (don't overwrite!).
      mainLight.color.setHex(atmosphericSettings.lightColor);
      mainLight.intensity = atmosphericSettings.lightIntensity * 1.6;
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
      volumetricLight.color.setHex(atmosphericSettings.sunVisible ? 0xffe8b8 : 0x9ab2e6);
      volumetricLight.intensity = atmosphericSettings.sunVisible ? 0.55 : 0.5;
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
      fillLight.color.setHex(atmosphericSettings.sunVisible ? 0xbcd6ff : 0x7a92d2);
      fillLight.intensity = atmosphericSettings.sunVisible ? 0.55 : 0.7;
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
      rimLight.color.setHex(atmosphericSettings.sunVisible ? 0xffffff : 0xc4d2ff);
      rimLight.intensity = atmosphericSettings.sunVisible ? 0.55 : 0.8;
      rimLight.position.set(
        camera.position.x + rimLightBaseOffset.x,
        rimLightBaseOffset.y,
        camera.position.z + rimLightBaseOffset.z
      );
      rimLight.target.position.set(camera.position.x, 0, camera.position.z);
      rimLight.target.updateMatrixWorld();

      // Multiplier matches init (0.8×) — readable shadow detail without
      // washing out the lit/shadow contrast.
      ambientLight.color.setHex(atmosphericSettings.ambientColor);
      ambientLight.intensity = atmosphericSettings.ambientIntensity * 0.8;

      // Keep hemisphere light synced with current sky & ground tones.
      // Multiplier matches init (0.75×) so shadowed surfaces keep their
      // cool sky-tint fill. setHex + multiplyScalar avoids the per-frame
      // `new THREE.Color()` allocation.
      skyLight.color.setHex(atmosphericSettings.skyColor);
      skyLight.groundColor.setHex(atmosphericSettings.skyColor).multiplyScalar(0.35);
      skyLight.intensity = atmosphericSettings.ambientIntensity * 0.75;

      // Nighttime moonlight fill + attached lantern so players can see
      nightFillLight.intensity = atmosphericSettings.sunVisible ? 0.0 : 1.8;
      playerNightLantern.intensity = atmosphericSettings.sunVisible ? 0.0 : 2.4;

      // Keep the sky dome centered on the player so the player never walks
      // "outside" the sphere (which is what caused the giant-blob glitch).
      skyDome.position.set(camera.position.x, 0, camera.position.z);

      if (atmosphericHaze && hazeMaterial) {
        atmosphericHaze.position.copy(camera.position);
        hazeMaterial.uniforms.time.value += delta;
        hazeMaterial.uniforms.hazeColor.value.setHex(
          mapConfig.hasSpecialWeather ? mapConfig.fogColor : atmosphericSettings.fogColor
        );
        hazeMaterial.uniforms.sunPosition.value.set(
          atmosphericSettings.lightPosition.x,
          atmosphericSettings.lightPosition.y,
          atmosphericSettings.lightPosition.z
        );
        hazeMaterial.uniforms.isNight.value = !atmosphericSettings.sunVisible;
        hazeMaterial.uniforms.density.value =
          (graphicsQuality === 'ultra' ? 0.10 : graphicsQuality === 'high' ? 0.08 : 0.06) *
          (mapConfig.hasSpecialWeather ? 1.25 : 1.0) *
          (atmosphericSettings.sunVisible ? 1.0 : 0.82);
      }

      if (hdriEnvironmentProfile) {
        scene.environmentIntensity = getHDRIEnvironmentIntensity(
          hdriEnvironmentProfile,
          atmosphericSettings.sunVisible,
          atmosphericSettings.ambientIntensity,
        );
      }

      // Push live grading into the post-processing chain so dusk/dawn/night
      // colour shifts read on screen as the day cycle advances.
      postFX?.updateAtmosphere({
        saturation: atmosphericSettings.saturation,
        contrast: atmosphericSettings.contrast,
        temperature: atmosphericSettings.temperature,
        exposure: atmosphericSettings.exposure,
        bloomStrength: atmosphericSettings.bloomStrength,
        colorTint: atmosphericSettings.colorTint,
        sunDirection,
        isNight: !atmosphericSettings.sunVisible,
      });

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

      // === SKILL TREE: refresh bonus snapshot + apply passives ===
      skillBonusAccum += rawDelta;
      if (skillBonusAccum >= 0.4) {
        skillBonusAccum = 0;
        skillBonuses = skillTree.calculateStatBonuses();
        const newMax = 100 + (skillBonuses['maxHealth'] || 0);
        if (newMax > playerMaxHealth) {
          // Thick Skin was just upgraded — credit the player with the new HP.
          health = Math.min(newMax, health + (newMax - playerMaxHealth));
        }
        playerMaxHealth = newMax;
        if (health > playerMaxHealth) health = playerMaxHealth;
      }
      // Regeneration — heal HP per second from the regenRate skill bonus
      const regenRate = skillBonuses['regenRate'] || 0;
      if (regenRate > 0 && !playerEliminated && health < playerMaxHealth) {
        regenAccum += rawDelta;
        if (regenAccum >= 1) {
          const ticks = Math.floor(regenAccum);
          regenAccum -= ticks;
          health = Math.min(playerMaxHealth, health + regenRate * ticks);
        }
      }

      // Push ability cooldown state to the HUD ability bar (throttled — the
      // CSS transition smooths the gaps between updates).
      abilityHudAccum += rawDelta;
      if (abilityHudAccum >= 0.12) {
        abilityHudAccum = 0;
        // The power slot prioritises the HELD (actionable) power; if none is
        // held it surfaces whatever timed power is currently running (with the
        // shield's absorb bar) so the player still gets live feedback.
        let powerType: HeldPower | null = null;
        let powerState: 'empty' | 'held' | 'active' = 'empty';
        let powerRatio: number | undefined;
        if (heldPower) {
          powerType = heldPower; powerState = 'held';
        } else if (shieldActive) {
          powerType = 'shield'; powerState = 'active';
          powerRatio = Math.max(0, Math.min(1, shieldAbsorb / SHIELD_ABSORB_MAX));
        } else if (phantomActive) { powerType = 'phantom'; powerState = 'active'; }
        else if (overchargeActive) { powerType = 'overcharge'; powerState = 'active'; }
        else if (infiniteAmmoActive) { powerType = 'infinite_ammo'; powerState = 'active'; }
        else if (damageBoostActive) { powerType = 'damage'; powerState = 'active'; }
        else if (speedBoostActive) { powerType = 'speed'; powerState = 'active'; }

        setAbilityHud([
          {
            key: 'Q', name: 'Dash', kind: 'dash',
            cooldown: dashCooldown <= 0 ? 1 : Math.max(0, 1 - dashCooldown / dashCooldownTime),
            active: isDashing,
          },
          {
            key: 'E', kind: 'power',
            name: powerType ? POWER_LABELS[powerType] : 'Find Loot',
            powerType,
            state: powerState,
            ratio: powerRatio,
          },
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
        const tutRef = tutorialRef.current as (TutorialSystem & { _lastStepId?: string }) | null;
        if (step && tutRef && step.id !== tutRef._lastStepId) {
          tutRef._lastStepId = step.id;
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

      // Drive remote-player avatar interpolation / animation / nameplates.
      // Skip while the world is paused/frozen so death poses don't tween
      // during the post-death freeze frame.
      if (remotePlayerManager) {
        remotePlayerManager.setNightMode(!atmosphericSettings.sunVisible);
        remotePlayerManager.update(rawDelta, camera);
      }

      // Drive the local-player shadow caster (invisible body + held gun
      // that produces the ground shadow). Re-sync weapon every frame —
      // it's a string compare internally, so the swap only allocates
      // when the player actually changes weapon.
      localPlayerShadow.setWeapon(currentWeapon);
      localPlayerShadow.setAlive(!playerEliminated && health > 0);
      localPlayerShadow.update(rawDelta, camera, euler);

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
        composePostFX(rawDelta);
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
        const geoExt = ambientParticles.geometry as THREE.BufferGeometry & { _velocities: Float32Array; _phases: Float32Array };
        const vels = geoExt._velocities;
        const phs = geoExt._phases;
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
      if (shieldActive && now >= shieldEndTime) {
        shieldActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Riot Shield Down', 'powerup');
      }
      if (overchargeActive && now >= overchargeEndTime) {
        overchargeActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overcharge Expired', 'powerup');
      }
      if (phantomActive && now >= phantomEndTime) {
        phantomActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Phantom Faded', 'powerup');
      }
      // ── Animate the held shield ──────────────────────────────────────
      // Ease it up when active, drop it when not, sway gently while braced,
      // and react to blocked hits (flash/kick) and shatter (break flash).
      {
        const raiseTarget = shieldActive ? 1 : 0;
        shieldRaise += (raiseTarget - shieldRaise) * Math.min(1, delta * 12);
        const visible = shieldRaise > 0.02 || shieldBreakFlash > 0.01;
        shieldMesh.visible = visible;
        if (visible) {
          const e = shieldRaise * shieldRaise * (3 - 2 * shieldRaise); // smoothstep
          shieldMesh.position.set(
            -0.46 + (1 - e) * -0.06,
            -1.05 + e * 0.71,            // rises from stowed (low) to braced
            -0.74 + (1 - e) * 0.05,
          );
          shieldMesh.rotation.set(
            1.05 - e * 0.99,             // tilts up from face-down to braced
            0.36,
            0.2 - e * 0.15,
          );
          if (shieldActive) {
            shieldMesh.position.x += Math.sin(now * 0.002) * 0.006;
            shieldMesh.rotation.z += Math.sin(now * 0.0017) * 0.012;
          }
          shieldMesh.position.z += shieldHitFlash * 0.06; // recoil kick on a hit
          // Integrity drives the status core colour (green → amber → red).
          const integ = shieldActive ? Math.max(0, Math.min(1, shieldAbsorb / SHIELD_ABSORB_MAX)) : 0;
          shieldCoreMat.emissive.setRGB(1 - integ, 0.2 + integ * 0.8, integ * 0.45);
          shieldCoreMat.emissiveIntensity = 0.7 + shieldHitFlash * 2.2;
          shieldGlassMat.opacity = 0.16 + shieldHitFlash * 0.5 + shieldBreakFlash * 0.6;
          shieldGlassMat.emissiveIntensity = 0.15 + shieldHitFlash * 1.3 + shieldBreakFlash * 2.2;
          shieldRimMat.opacity = 0.22 + shieldHitFlash * 0.75 + Math.sin(now * 0.004) * 0.06;
          shieldRimMat.color.setRGB(0.4 + (1 - integ) * 0.6, 0.6 + integ * 0.4, 0.6 + integ * 0.4);
          shieldEnergyMat.opacity = 0.1 + integ * 0.12 + shieldHitFlash * 0.4;
        }
        shieldHitFlash = Math.max(0, shieldHitFlash - delta * 4);
        shieldBreakFlash = Math.max(0, shieldBreakFlash - delta * 2.5);
      }
      applyPhantomVisual(phantomActive);

      // Floating effect indicators above the player's head (anchored at the
      // player's feet + a fixed height inside EffectIndicators).
      {
        const activeEffects: EffectKey[] = [];
        // Shield + Phantom intentionally omit their floating overhead icon —
        // the shield has its braced mesh and Phantom fades the weapon, so the
        // blue/purple sprites were redundant clutter.
        if (speedBoostActive) activeEffects.push('speed');
        if (damageBoostActive) activeEffects.push('damage');
        if (overchargeActive) activeEffects.push('overcharge');
        if (infiniteAmmoActive) activeEffects.push('infinite_ammo');
        _effectAnchor.set(
          camera.position.x,
          camera.position.y - currentCameraHeight, // ~feet level
          camera.position.z,
        );
        effectIndicators.update(activeEffects, _effectAnchor, now / 1000);
      }

      // Player movement with weight-based speed and ability effects
      const isMoving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'];
      if (isTutorialMode && isMoving) tutorial.recordAction('move', 1); // advances the movement step
      const wantsToSprint = (keys['ShiftLeft'] || keys['ShiftRight']) && !isCrouching;
      // Stamina gates sprinting. Once exhausted, the player must let
      // stamina rebuild past STAMINA_REQUIRED_TO_SPRINT before they
      // can sprint again — prevents 0-stamina stutter-sprint exploit.
      if (staminaExhausted && stamina >= STAMINA_REQUIRED_TO_SPRINT) {
        staminaExhausted = false;
      }
      const isRunning = wantsToSprint && isMoving && !staminaExhausted;

      // Tick stamina. While sprinting it depletes; when not, after a
      // short idle delay, it regenerates.
      if (isRunning) {
        stamina -= STAMINA_DEPLETE_PER_SEC * rawDelta;
        staminaIdleTimer = 0;
        if (stamina <= 0) {
          stamina = 0;
          staminaExhausted = true;
        }
      } else {
        staminaIdleTimer += rawDelta;
        if (staminaIdleTimer >= STAMINA_REGEN_DELAY_S && stamina < STAMINA_MAX) {
          stamina = Math.min(STAMINA_MAX, stamina + STAMINA_REGEN_PER_SEC * rawDelta);
        }
      }
      // Push stamina to React HUD at ~12Hz — enough to feel live without
      // spamming reconciliations every frame. Only fires when the value
      // actually changed by a noticeable amount (>1% of bar).
      staminaPushAccum += rawDelta;
      if (staminaPushAccum >= 0.08) {
        staminaPushAccum = 0;
        const ratio = stamina / STAMINA_MAX;
        if (Math.abs(ratio - lastPushedStaminaRatio) > 0.01) {
          lastPushedStaminaRatio = ratio;
          setStaminaRatio(ratio);
        }
        if (staminaExhausted !== lastPushedExhausted) {
          lastPushedExhausted = staminaExhausted;
          setStaminaExhaustedUI(staminaExhausted);
        }
      }

      // Calculate speed based on weapon weight and ability effects
      const weaponWeight = WEAPONS[currentWeapon].weight;
      const weightSpeedMultiplier = 1.0 / weaponWeight; // Heavier weapons = slower movement

      // Apply powerup speed boost multiplier
      const powerupSpeedMult = speedBoostActive ? speedBoostMultiplier : 1.0;

      // Apply crouch speed reduction
      const crouchMult = isCrouching ? crouchSpeedMultiplier : 1.0;

      const baseSpeed = moveSpeed * weightSpeedMultiplier * abilityEffects.speedMultiplier * powerupSpeedMult * crouchMult * (1 + skillBonus('moveSpeed'));
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

      // (Player ground shadow now lives in LocalPlayerShadow — driven below
      // alongside the remote-player avatars.)

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

      // Update robot hit sparks
      for (let i = robotSparks.length - 1; i >= 0; i--) {
        if (robotSparks[i].update(delta)) {
          robotSparks[i].dispose(scene);
          robotSparks.splice(i, 1);
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
      const _puNow = Date.now() * 0.001;
      for (const powerUp of powerUps) {
        if (!powerUp.collected) {
          const root = powerUp.mesh as unknown as THREE.Group;
          root.rotation.y += delta * 2;
          // Gentle vertical bob with a phase offset so neighbouring pickups
          // don't move in lockstep
          const phase = (root.userData.pulsePhase as number) || 0;
          const bobY = 2 + Math.sin(_puNow * 1.8 + phase) * 0.35;
          root.position.y = bobY;

          // Drive the breathing pulse — feeds glow opacity, point light
          // intensity, ring rotation, beacon scroll, halo pulse.
          const pulse = 0.5 + 0.5 * Math.sin(_puNow * 2.4 + phase);

          const glowInner = root.userData.glowInner as THREE.Mesh | undefined;
          const glowOuter = root.userData.glowOuter as THREE.Mesh | undefined;
          if (glowInner && glowInner.material instanceof THREE.MeshBasicMaterial) {
            glowInner.material.opacity = 0.32 + pulse * 0.30;
            const scale = 1.0 + pulse * 0.12;
            glowInner.scale.setScalar(scale);
          }
          if (glowOuter && glowOuter.material instanceof THREE.MeshBasicMaterial) {
            glowOuter.material.opacity = 0.14 + pulse * 0.16;
            const scale = 1.0 + pulse * 0.18;
            glowOuter.scale.setScalar(scale);
          }

          const light = root.userData.light as THREE.PointLight | null | undefined;
          if (light) {
            light.intensity = 3.5 + pulse * 3.5;
            // Pool lights live in world space (scene-parented), so sync
            // their position to the pickup each frame as it bobs.
            light.position.set(root.position.x, root.position.y, root.position.z);
          }

          const inner = root.userData.inner as THREE.Mesh | undefined;
          if (inner) inner.scale.setScalar(1.0 + pulse * 0.10);

          const ring = root.userData.ring as THREE.Mesh | undefined;
          if (ring) {
            ring.rotation.z += delta * 1.8;
            ring.scale.setScalar(1.0 + pulse * 0.08);
          }

          const halo = root.userData.halo as THREE.Mesh | undefined;
          if (halo) {
            // Counter-bob so the halo disc stays glued to the terrain
            // surface (root bobs between ~1.65 and ~2.35 — without this
            // the halo would dip below the ground).
            halo.position.y = -bobY + 0.03;
            halo.rotation.z += delta * 0.4;
          }
          const haloMat = root.userData.haloMat as THREE.ShaderMaterial | undefined;
          if (haloMat && haloMat.uniforms.uTime) {
            haloMat.uniforms.uTime.value = _puNow;
          }

          if (checkCollision(camera.position, powerUp.position, 2)) {
            // ── ONE LOOTED POWER AT A TIME ──────────────────────────────
            // If the player already holds a power, the crate stays put —
            // they must spend the current power (E) before looting another.
            if (heldPower !== null) {
              const hintNow = Date.now();
              if (hintNow - lastHeldHintAt > 1500) {
                lastHeldHintAt = hintNow;
                setPowerUpMessage('Use your power (E) before looting another');
                setTimeout(() => setPowerUpMessage(''), 1400);
              }
            } else {
              powerUp.collected = true;
              // All pickup materials + geometries are shared (cached per
              // colour / per shape) so we do NOT dispose them — that would
              // wipe out resources still in use by other live pickups.
              // Just release the pool light and remove the group from the
              // scene; GC reclaims the small per-instance Mesh wrappers.
              const root = powerUp.mesh as unknown as THREE.Object3D;
              const pooledLight = (root.userData.light as THREE.PointLight | null | undefined) ?? null;
              releasePickupLight(pooledLight);
              root.userData.light = null;
              root.parent?.remove(root);
              soundManager.play('powerUp', 0.8);

              // Stow the looted power — it is NOT applied until the player
              // presses E. The HUD power slot reflects what's held.
              heldPower = powerUp.type as HeldPower;
              setPowerUpMessage(`${POWER_LABELS[heldPower]} looted · press E to use`);
              if (gameSettingsManager.getSetting('killFeed')) {
                addKillFeedEntry(`Looted ${POWER_LABELS[heldPower]}`, 'powerup');
              }
              createParticles(camera.position, 0xffffff, 10);
              tutorial.recordAction('collect_powerup', 1); // advances the loot tutorial step
              setTimeout(() => setPowerUpMessage(''), 2200);
              updateGameState();
            }
          }
        }
      }

      // ── Refresh spatial grids for this frame ──
      // Terrain rebuilds only when chunks change. Enemy grid is rebuilt
      // each frame from alive enemies — used for bullet-vs-enemy collision
      // and enemy-vs-enemy separation below.
      rebuildTerrainGridIfStale();
      enemyGrid.clear();
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (!e.dead) enemyGrid.insert(k, e.mesh.position.x, e.mesh.position.z);
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
            // Grid lookup — only checks terrain in the rocket's neighbourhood
            // instead of walking the full terrainObjects array (500+ items).
            const nearby = terrainGrid.queryRadius(rp.x, rp.z, 6);
            for (let n = 0; n < nearby.length; n++) {
              const obj = terrainObjects[nearby[n]];
              if (!obj || !obj.collidable) continue;
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

        // Grid lookup — only test enemies within a small radius of the bullet
        // instead of every enemy in the world (was the worst N×M offender).
        const bpx = bullet.mesh.position.x;
        const bpz = bullet.mesh.position.z;
        const nearbyEnemyIds = enemyGrid.queryRadius(bpx, bpz, 3);
        // Snapshot the IDs because queryRadius reuses the returned array
        // and the next call (terrainGrid lookup inside this loop, etc.)
        // would overwrite it mid-iteration.
        const nearbyIds: number[] = nearbyEnemyIds.slice();
        let bulletConsumed = false;
        for (let n = 0; n < nearbyIds.length && !bulletConsumed; n++) {
          const j = nearbyIds[n];
          const enemy = enemies[j];
          if (enemy && !enemy.dead && checkCollision(bullet.mesh.position, enemy.mesh.position, 2)) {
            // Rockets explode on first contact — the blast handles all damage
            if (bullet.isRocket) {
              explodeRocket(bullet.mesh.position.clone(), bullet.damage);
              scene.remove(bullet.mesh);
              bullets.splice(i, 1);
              bulletConsumed = true;
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
              // HEADSHOT! 2x damage, boosted further by the Headshot Mastery skill
              damage *= 2 + skillBonus('headshotDamage');
              isCritical = true;
              soundManager.play('enemyHit', 0.8); // Louder hit sound
              createParticles(_tempVec3, 0xffff00, 8); // Yellow particles for crit
            } else {
              soundManager.play('hit', 0.4);
              createParticles(enemy.mesh.position, 0xff9933, 3); // orange sparks (robot), not red blood
            }

            if (isMpGuest && mp) {
              // Guests don't own enemy health — report the hit to the host and
              // let it resolve damage and death authoritatively. We still show
              // local sparks / flash / damage numbers below for snappy feedback.
              if (enemy.netId !== undefined) mp.sendEnemyHit(enemy.netId, damage, isCritical);
            } else {
              enemy.health -= damage;
            }
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

            // ROBOT HIT SPARKS - metal/spark burst feedback (reuse temp vector)
            _tempVec3_2.subVectors(enemy.mesh.position, bullet.mesh.position).normalize();
            const sparks = new RobotHitSparks(
              scene,
              isCritical ? _tempVec3.clone() : enemy.mesh.position.clone(),
              _tempVec3_2,
              isCritical ? 20 : 12 // More particles for crits
            );
            robotSparks.push(sparks);

            if (!isMpGuest && enemy.health <= 0) {
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
      // AI update distance scales with graphics quality AND difficulty —
      // hard enemies keep their AI brain online (and continue attacking)
      // from much further out, so the player can't out-snipe them by
      // running outside the previous 100m cap.
      const MAX_AI_UPDATE_DISTANCE = Math.min(
        220,
        graphicsPreset.viewDistance * 0.85 * diffSettings.chaseMult,
      );
      // ── Per-frame Date.now() cache + throttle intervals (milliseconds) ──
      // Heavy systems run on a slow tick and cache their result; steering and
      // animation still update every frame from the cached output, so movement
      // stays smooth even though the brain is thinking ~5 times a second.
      const frameNowMs = Date.now();
      const AI_TICK_MS = 180;          // ~5.5 Hz behaviour tree
      const PERCEPTION_TICK_MS = 220;  // ~4.5 Hz sight/sound — has raycasts
      const DODGE_TICK_MS_NEAR = 110;  // ~9 Hz bullet dodging when close
      const DODGE_TICK_MS_MID = 240;   // ~4 Hz when further out

      // Host only: collect the alive remote players so each enemy can engage
      // (and damage) whichever player is nearest, not just the host.
      _mpFocusTargets.length = 0;
      if (isMpHost && mp) {
        mp.getRemotePlayers().forEach((p) => {
          if (!p.isAlive) return;
          _mpFocusTargets.push({ id: p.id, pos: new THREE.Vector3(p.position.x, p.position.y, p.position.z) });
        });
      }

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
            if (enemy.netId !== undefined) enemyByNetId.delete(enemy.netId);
            enemies.splice(i, 1);
          }
          continue;
        }

        if (enemy.dead) continue;

        // Compute baseScale for ALL living enemies (needed for grounding)
        const baseScale = enemy.type === 'fast' ? 0.7 : enemy.type === 'tank' ? 1.5 : enemy.type === 'boss' ? 2.0 : 1.0;
        const groundY = 1.0 * baseScale;

        // ── GUEST MIRROR ──────────────────────────────────────────────────
        // Guests don't think — they interpolate this enemy toward the host's
        // last snapshot, animate the walk cycle from the resulting movement,
        // and run no AI / attack / collision logic at all.
        if (isMpGuest) {
          const tx = enemy.netTargetX ?? enemy.mesh.position.x;
          const tz = enemy.netTargetZ ?? enemy.mesh.position.z;
          const px = enemy.mesh.position.x;
          const pz = enemy.mesh.position.z;
          const posLerp = 1 - Math.exp(-14 * delta);
          enemy.mesh.position.x = px + (tx - px) * posLerp;
          enemy.mesh.position.z = pz + (tz - pz) * posLerp;
          const movedLen = Math.hypot(enemy.mesh.position.x - px, enemy.mesh.position.z - pz);

          // Yaw toward the networked facing (shortest arc).
          const targetYaw = enemy.netYaw ?? enemy.mesh.rotation.y;
          let dYaw = targetYaw - enemy.mesh.rotation.y;
          while (dYaw > Math.PI) dYaw -= Math.PI * 2;
          while (dYaw < -Math.PI) dYaw += Math.PI * 2;
          enemy.mesh.rotation.y += dYaw * Math.min(1, delta * 10);

          // Stride/arm swing scaled by how far it actually moved this frame.
          enemy.walkTime += movedLen * 2.8 + delta * 0.6;
          const stride = movedLen > 0.002 ? 0.62 : 0.0;
          if (enemy.leftLeg && enemy.rightLeg) {
            enemy.leftLeg.rotation.x = THREE.MathUtils.lerp(enemy.leftLeg.rotation.x, Math.sin(enemy.walkTime) * stride, 0.2);
            enemy.rightLeg.rotation.x = THREE.MathUtils.lerp(enemy.rightLeg.rotation.x, Math.sin(enemy.walkTime + Math.PI) * stride, 0.2);
          }
          if (enemy.leftArm && enemy.rightArm) {
            enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, Math.sin(enemy.walkTime + Math.PI) * stride * 0.7, 0.18);
            enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, Math.sin(enemy.walkTime) * stride * 0.7, 0.18);
          }
          const bob = Math.abs(Math.sin(enemy.walkTime)) * 0.07 * (movedLen > 0.002 ? 1 : 0);
          enemy.mesh.position.y = groundY + bob;

          // Hit flash (driven by enemy_hit feedback) — scale pulse only.
          if (enemy.damageFlashTime > 0) {
            enemy.damageFlashTime -= delta;
            if (enemy.torso) enemy.torso.scale.setScalar(1 + Math.max(0, enemy.damageFlashTime) * 0.3);
          } else {
            if (enemy.torso && enemy.torso.scale.x !== 1) enemy.torso.scale.setScalar(1);
            enemy.mesh.scale.setScalar(baseScale);
          }
          continue;
        }

        // ── HOST/SOLO TARGET SELECTION ────────────────────────────────────
        // In solo (and whenever the host itself is nearest) focusPos is the
        // local camera, so every downstream calculation is byte-identical to
        // the original single-player path. In multiplayer the host's enemies
        // engage the NEAREST player and route melee damage to whoever they hit.
        let focusPos: THREE.Vector3 = camera.position;
        let focusVel: THREE.Vector3 = playerVelocity;
        let focusPlayerId: string | null = null;
        if (isMpHost && _mpFocusTargets.length > 0) {
          let bestSq = enemy.mesh.position.distanceToSquared(camera.position);
          for (let f = 0; f < _mpFocusTargets.length; f++) {
            const cand = _mpFocusTargets[f];
            const dsq = enemy.mesh.position.distanceToSquared(cand.pos);
            if (dsq < bestSq) { bestSq = dsq; focusPos = cand.pos; focusVel = _zeroVel; focusPlayerId = cand.id; }
          }
        }

        // Performance optimization: Skip AI update for distant enemies
        let distance = enemy.mesh.position.distanceTo(focusPos);

        // === ANTI-ESCAPE RECYCLING ===
        // An enemy that falls far behind — deep in the fog, out of sight —
        // is relocated into a ring around the player. Distance threshold
        // scales with difficulty: easy recycles tight (76m) so the player
        // is never sniping silhouettes; hard lets enemies persist out to
        // 130m so they can engage from far range.
        const recycleDistance = 76 + (diffSettings.chaseMult - 0.8) * 90;
        if (distance > recycleDistance) {
          // Spawn just outside the player's frustum behind them on hard,
          // closer (still visible) on easy. Use the tree-collision-aware
          // findEnemySpawnSpot so recycled enemies don't reappear inside
          // a tree trunk.
          const baseRad = 38 + Math.random() * (22 * diffSettings.chaseMult);
          const enemyRadius = enemy.type === 'boss' ? 2.0 : enemy.type === 'tank' ? 1.6 : 1.2;
          const spot = findEnemySpawnSpot(baseRad, enemyRadius);
          enemy.mesh.position.x = spot.x;
          enemy.mesh.position.z = spot.z;
          enemy.mesh.position.y = groundY;
          distance = enemy.mesh.position.distanceTo(focusPos);
        }

        if (distance > MAX_AI_UPDATE_DISTANCE) {
          // Distant enemies — simple seek toward the player. Frame-rate
          // independent (×60) so they keep pace. On hard difficulty the
          // chaseMult sprint-boost gets them into engagement range much
          // faster, so even players who try to out-snipe end up fighting
          // close-up within a few seconds.
          const sprintMul = diffSettings.chaseMult >= 1.2 ? 1.45 : 1.0;
          _tempVec3.subVectors(focusPos, enemy.mesh.position).normalize();
          enemy.mesh.position.x += _tempVec3.x * enemy.speed * sprintMul * delta * 60;
          enemy.mesh.position.z += _tempVec3.z * enemy.speed * sprintMul * delta * 60;
          enemy.mesh.position.y = groundY;
          enemy.mesh.rotation.y = Math.atan2(_tempVec3.x, _tempVec3.z);
          continue;
        }

        // Health regeneration
        if (diffSettings.regenRate > 0 && enemy.health < enemy.maxHealth) {
          enemy.health = Math.min(enemy.maxHealth, enemy.health + diffSettings.regenRate * delta * 10);
        }

        // === PERCEPTION SYSTEM (throttled — sight/sound uses raycasts) ===
        // Re-evaluate on a slow tick and cache. The cached PerceptionResult
        // is referenced every frame so the rest of the AI sees a stable view
        // of the world without the per-frame raycast cost.
        if (
          enemy.perception &&
          (enemy.cachedPerception === undefined || frameNowMs >= (enemy.nextPerceptionAt || 0))
        ) {
          enemy.cachedPerception = enemy.perception.perceive(
            enemy.mesh.position,
            enemy.mesh.rotation.y,
            focusPos,
            focusVel,
            terrainObjects,
            timeOfDay === 'night'
          );
          // Stagger by enemy index so 28 enemies don't all tick on the same
          // frame — spreads the spikes across the ~220ms window.
          enemy.nextPerceptionAt = frameNowMs + PERCEPTION_TICK_MS + (i * 17) % 90;
        }
        const perception = enemy.cachedPerception;

        // Phantom: the player is cloaked — enemies can't see or hear them, so
        // the behaviour tree stops pursuing/attacking and they wander/idle.
        const canSeePlayer = phantomActive ? false : (perception?.canSeePlayer || false);
        const canHearPlayer = phantomActive ? false : (perception?.canHearPlayer || false);

        // === AI DECISION MAKING (throttled — behaviour tree is expensive) ===
        if (enemy.aiBehavior && perception) {
          if (
            enemy.cachedAiDecision === undefined ||
            frameNowMs >= (enemy.nextAiAt || 0)
          ) {
            enemy.cachedAiDecision = enemy.aiBehavior.makeDecision({
              enemyPosition: enemy.mesh.position,
              enemyRotation: enemy.mesh.rotation.y,
              playerPosition: focusPos,
              playerVelocity: focusVel,
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
            // Stagger ticks across enemies for an even per-frame budget.
            enemy.nextAiAt = frameNowMs + AI_TICK_MS + (i * 23) % 80;
          }
          const aiDecision = enemy.cachedAiDecision;

          // Update target position from AI decision
          enemy.targetPosition.copy(aiDecision.targetPosition);

          // === BULLET DODGING SYSTEM (throttled, distance-scaled) ===
          if (enemy.bulletDodging) {
            // Close enemies get faster dodge ticks because bullets reach them
            // sooner; mid-range enemies can afford a coarser cadence.
            const dodgeInterval = distance < 25 ? DODGE_TICK_MS_NEAR : DODGE_TICK_MS_MID;
            if (
              enemy.cachedDodge === undefined ||
              frameNowMs >= (enemy.nextDodgeAt || 0)
            ) {
              enemy.cachedDodge = enemy.bulletDodging.calculateDodge(
                enemy.mesh.position,
                bullets,
                frameNowMs
              );
              enemy.nextDodgeAt = frameNowMs + dodgeInterval + (i * 11) % 60;
            }
            const dodgeResult = enemy.cachedDodge;

            if (dodgeResult.shouldDodge) {
              // Enemy is dodging! Override target with dodge direction
              enemy.isDodging = true;
              enemy.dodgeDirection = dodgeResult.dodgeDirection.clone();
              // Apply immediate dodge movement (3x normal speed)
              const dodgeTarget = enemy.mesh.position.clone().add(
                dodgeResult.dodgeDirection.clone().multiplyScalar(8)
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
          // Repulsion + TANGENTIAL steering from collidable terrain. Pure
          // repulsion alone is a known failure mode: when two trees flank
          // the enemy on the line to the player, the radial pushes cancel
          // and the enemy dead-stops. We additionally add a tangent push
          // (perpendicular to "away from obstacle") chosen so the enemy
          // arcs AROUND the obstacle toward the player rather than into it.
          const epx = enemy.mesh.position.x;
          const epz = enemy.mesh.position.z;
          // Desired direction to the seek target — used to pick which way
          // to arc around each obstacle.
          const desiredX = seekTarget.x - epx;
          const desiredZ = seekTarget.z - epz;
          const desiredLen = Math.hypot(desiredX, desiredZ) || 1;
          const desiredNX = desiredX / desiredLen;
          const desiredNZ = desiredZ / desiredLen;
          const nearbyTerrain = terrainGrid.queryRadius(epx, epz, 6);
          const nearbyTerrainIds = nearbyTerrain.slice();
          for (let nt = 0; nt < nearbyTerrainIds.length; nt++) {
            const obj = terrainObjects[nearbyTerrainIds[nt]];
            if (!obj || !obj.collidable) continue;
            const ox = epx - obj.x;
            const oz = epz - obj.z;
            const influence = obj.radius + 4.0;
            if (Math.abs(ox) > influence || Math.abs(oz) > influence) continue;
            const od = Math.hypot(ox, oz);
            if (od > 0.001 && od < influence) {
              const t = (influence - od) / influence;
              // Radial repulsion (away from obstacle centre)
              const push = t * t * 2.6;
              const repulseNX = ox / od;
              const repulseNZ = oz / od;
              steerX += repulseNX * push;
              steerZ += repulseNZ * push;
              // Tangential steering — pick the perpendicular direction that
              // best aligns with the desired (target-bound) direction so we
              // ARC AROUND the tree toward the player. (-z, x) and (z, -x)
              // are the two unit tangents; whichever has a larger dot with
              // the desired direction is "the way around" this tree.
              const tangAX = -repulseNZ;
              const tangAZ =  repulseNX;
              const tangBX =  repulseNZ;
              const tangBZ = -repulseNX;
              const dotA = tangAX * desiredNX + tangAZ * desiredNZ;
              const dotB = tangBX * desiredNX + tangBZ * desiredNZ;
              const useA = dotA > dotB;
              const tangX = useA ? tangAX : tangBX;
              const tangZ = useA ? tangAZ : tangBZ;
              // Tangent gets a smooth weight that peaks at mid-distance and
              // fades to zero at full influence — close to the tree the
              // radial push dominates; far from it the tangent does nothing.
              const tangWeight = t * (1 - t) * 4.0; // peaks at t=0.5 → 1.0
              steerX += tangX * tangWeight * 1.8;
              steerZ += tangZ * tangWeight * 1.8;
            }
          }
          // Light separation from other enemies — grid lookup, was O(N²).
          const nearbyEnemies = enemyGrid.queryRadius(epx, epz, 3);
          for (let ne = 0; ne < nearbyEnemies.length; ne++) {
            const otherIdx = nearbyEnemies[ne];
            if (otherIdx === i) continue;
            const other = enemies[otherIdx];
            if (!other || other.dead) continue;
            const ox = epx - other.mesh.position.x;
            const oz = epz - other.mesh.position.z;
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

            // === STUCK-RECOVERY JUKE =========================================
            // If the enemy has spent > 0.6s without making meaningful headway
            // (typically: cornered between two trees, or steering forces
            // cancelling), override the steering direction with a strong
            // perpendicular sidestep. Pick the juke direction once and hold
            // it for the duration of the juke so we don't oscillate.
            let activeSteerX = steerX;
            let activeSteerZ = steerZ;
            const enemyAsAny = enemy as unknown as {
              stuckJukeT?: number;
              stuckJukeDir?: 1 | -1;
            };
            if (enemy.stuckTimer > 0.6) {
              if (!enemyAsAny.stuckJukeT || enemyAsAny.stuckJukeT <= 0) {
                // Start a new juke: 0.5s of perpendicular movement.
                enemyAsAny.stuckJukeT = 0.5;
                enemyAsAny.stuckJukeDir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
              }
              // Sidestep perpendicular to the desired-to-player direction.
              const jukeSign = enemyAsAny.stuckJukeDir ?? 1;
              const perpX = -desiredNZ * jukeSign;
              const perpZ =  desiredNX * jukeSign;
              activeSteerX = perpX;
              activeSteerZ = perpZ;
            }
            if (enemyAsAny.stuckJukeT && enemyAsAny.stuckJukeT > 0) {
              enemyAsAny.stuckJukeT -= delta;
              if (enemyAsAny.stuckJukeT <= 0) {
                enemyAsAny.stuckJukeT = 0;
                enemyAsAny.stuckJukeDir = undefined;
              }
            }

            const stepX = activeSteerX * step;
            const stepZ = activeSteerZ * step;

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

            // Update stuck timer. Compare actual movement against the step
            // size we attempted — if we moved < 20% of the intended step,
            // count it as stuck. distance > 4 filters out "stuck because
            // we're already at the player" false positives.
            if (movedLen < step * 0.2 && distance > 4) {
              enemy.stuckTimer = (enemy.stuckTimer || 0) + delta;
            } else {
              enemy.stuckTimer = 0;
            }

            // Face the actual direction of travel for natural walking; when
            // essentially blocked, keep facing the player.
            let faceX: number, faceZ: number;
            if (movedLen > 0.0005) { faceX = movedX; faceZ = movedZ; }
            else { faceX = focusPos.x - enemy.mesh.position.x; faceZ = focusPos.z - enemy.mesh.position.z; }
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
            const headDx = focusPos.x - enemy.mesh.position.x;
            const headDz = focusPos.z - enemy.mesh.position.z;
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
              focusPos
            );
          }

          // Check for hit during attack animation
          const hitPlayer = enemy.attackSystem.checkHit(
            enemy.mesh.position,
            enemy.mesh.rotation.y,
            focusPos
          );

          // Also check for overlap damage (when enemy clips into player).
          // Use the shared frame timestamp so Date.now() isn't called once
          // per enemy per frame.
          const overlapDamage = enemy.attackSystem.checkOverlapDamage(
            enemy.mesh.position,
            focusPos,
            enemy.lastAttackTime,
            frameNowMs
          );

          if (hitPlayer || overlapDamage) {
            const enemyLabel = enemyLabelOf(enemy.type);
            const raw = enemy.attackSystem.getDamage();
            enemy.lastAttackTime = frameNowMs; // Update for overlap cooldown
            if (isMpHost && mp && focusPlayerId !== null) {
              // SHARED ENEMY struck a REMOTE player. The host owns the enemy,
              // so it tells that player's client to take the hit — this is how
              // an enemy attacking one player is reflected on their screen.
              mp.sendPlayerDamage(focusPlayerId, raw, enemyLabel);
            } else {
              // Local player takes the hit (solo, or the host's own avatar).
              // All the shield / effects / death / spectate handling lives in
              // takeEnemyDamage, shared with the guest `player_damaged` path.
              takeEnemyDamage(raw, enemyLabel, enemy.mesh.position);
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
                const lungeDx = focusPos.x - enemy.mesh.position.x;
                const lungeDz = focusPos.z - enemy.mesh.position.z;
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

      // === SHARED-ENEMY SNAPSHOT (host → guests) ===
      // Several times a second the host streams the full living-enemy set so
      // every guest renders the exact same enemies. Dead enemies are included
      // for one window (d=1) so guests start the death animation, then drop out.
      if (isMpHost && mp && frameNowMs - lastEnemySyncMs >= ENEMY_SYNC_INTERVAL_MS) {
        lastEnemySyncMs = frameNowMs;
        const wire: EnemyWire[] = [];
        for (let e = 0; e < enemies.length; e++) {
          const en = enemies[e];
          if (en.netId === undefined) continue;
          const r2 = (n: number) => Math.round(n * 100) / 100;
          wire.push({
            id: en.netId,
            ty: ENEMY_TYPE_CODE[en.type],
            x: r2(en.mesh.position.x),
            y: r2(en.mesh.position.y),
            z: r2(en.mesh.position.z),
            ry: r2(en.mesh.rotation.y),
            hp: Math.round(en.health),
            mx: Math.round(en.maxHealth),
            d: en.dead ? 1 : 0,
          });
        }
        mp.broadcastEnemySync(wire, wave);
      }

      // === RENDERING — three.js EffectComposer (or direct render on Low) ===
      composePostFX(rawDelta);
    };

    // === SHADER PRE-WARM ===
    // The first time a material is rendered the GPU compiles + links its
    // shader program — a synchronous stall that caused the brief freeze on
    // the first shot. Spawn one of every combat effect, render a full frame
    // (which compiles every shader program), then clean them up. After this
    // all gameplay shaders are hot and firing is hitch-free.
    // Yield control back to the browser so the React loader can paint
    // between heavy synchronous warmup steps. Without these yields the
    // loader appears for only 1 frame total before the synchronous chain
    // completes, defeating its purpose.
    const yieldFrame = () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    // Set true inside a stage that fails AND is marked critical. The
    // warmup completion handler reads this to decide whether to pause
    // on the loader for user input (Continue Anyway / Reload).
    const criticalErrorRef = { current: false };

    /**
     * Wraps a warmup stage so individual failures are logged + surfaced
     * but don't abort the whole pipeline. Failing stages skip gracefully
     * — the game still starts, just without that particular pre-warm.
     * Critical failures (compile errors) escalate to the loader's error
     * UI via setWarmupError.
     */
    const stage = async <T,>(
      name: string,
      critical: boolean,
      fn: () => T | Promise<T>,
    ): Promise<T | null> => {
      // Honour an in-flight Continue-Anyway: skip remaining stages.
      if (continueAnywayRef.current) return null;
      try {
        return await fn();
      } catch (err) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.trim() : String(err);
        console.warn(`[Warmup] stage "${name}" failed:`, err);
        if (critical) {
          criticalErrorRef.current = true;
          setWarmupError({
            message: `Failed during ${name.toLowerCase()}.`,
            stage: name,
            detail,
            recoverable: true,
          });
        }
        return null;
      }
    };

    const warmUpShaders = async (): Promise<void> => {
      const warmupStart = performance.now();
      const wp = camera.position.clone();
      wp.z -= 4; // just in front of the camera
      const warm: THREE.Object3D[] = [];
      const warmPowerUps: PowerUp[] = [];
      // Effect references kept on an object so the async stage closures
      // can assign and the teardown can read them. Plain `let` confuses
      // TS's flow analysis across the async callback boundary.
      const refs: {
        rocket: THREE.Mesh | null;
        flash: MuzzleFlash | null;
        tracer: BulletTracer | null;
        impact: ImpactEffect | null;
        sparks: RobotHitSparks | null;
      } = { rocket: null, flash: null, tracer: null, impact: null, sparks: null };

      // ── STAGE 1: spawn warmup bullets ──────────────────────────────
      await stage('Bullets', false, () => {
        const warmBulletColors = Array.from(new Set(Object.values(WEAPONS).map((weapon) => weapon.bulletColor)));
        warmBulletColors.forEach((color, index) => {
          const warmBullet = buildBullet(color);
          warmBullet.position.copy(wp).add(new THREE.Vector3((index - warmBulletColors.length / 2) * 0.8, 0, 0));
          scene.add(warmBullet);
          warm.push(warmBullet);
        });
      });
      await yieldFrame();

      // ── STAGE 2: spawn warmup pickups (every type) ─────────────────
      await stage('Pickups', false, () => {
        const warmPowerUpTypes: PowerUp['type'][] = ['overcharge', 'ammo', 'speed', 'damage', 'shield', 'infinite_ammo', 'phantom'];
        warmPowerUpTypes.forEach((type, index) => {
          const warmPowerUp = createPowerUp(
            wp.x + (index - warmPowerUpTypes.length / 2) * 0.85,
            wp.z,
            type,
          );
          warmPowerUps.push(warmPowerUp);
        });
      });
      await yieldFrame();

      // ── STAGE 3: combat effects ────────────────────────────────────
      await stage('Effects', false, () => {
        const rocket = createRocketProjectile();
        rocket.position.copy(wp);
        scene.add(rocket); warm.push(rocket);
        refs.rocket = rocket;
        refs.flash = new MuzzleFlash(scene, wp, 0xffaa00);
        refs.tracer = new BulletTracer(scene, wp, wp.clone(), 0xffffaa);
        refs.impact = new ImpactEffect(scene, wp, 0xffaa00, 2);
        refs.sparks = new RobotHitSparks(scene, wp, new THREE.Vector3(0, 1, 0), 2);
      });
      await yieldFrame();

      // ── STAGE 4: gun materials (cycle every weapon) ────────────────
      // Populates the GunModel material cache so subsequent in-game
      // weapon switches reuse cached shader programs and never stutter.
      const originalWeapon = currentWeapon;
      const allWeapons: Array<'pistol' | 'rifle' | 'shotgun' | 'smg' | 'sniper' | 'minigun' | 'launcher'>
        = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher'];
      for (const w of allWeapons) {
        if (continueAnywayRef.current) break;
        await stage(`Weapon: ${w}`, false, () => gunModel.switchWeapon(w));
        await yieldFrame();
      }
      try { gunModel.switchWeapon(originalWeapon as GunWeaponType); } catch { /* ignore — restore is best-effort */ }
      await yieldFrame();

      // ── STAGE 5: async shader pre-compile ──────────────────────────
      // Use compileAsync where available (KHR_parallel_shader_compile)
      // so the GPU can compile in the background while the loader keeps
      // animating. Falls back to synchronous compile on older browsers.
      // This stage IS critical — if shader compile actually fails, we
      // want the user to see a real error rather than launching into a
      // broken scene.
      await stage('Shader Compile', true, async () => {
        const r = renderer as THREE.WebGLRenderer & {
          compileAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<unknown>;
        };
        if (typeof r.compileAsync === 'function') {
          await r.compileAsync(scene, camera);
        } else {
          renderer.compile(scene, camera);
        }
      });
      await yieldFrame();

      // ── REACT-SIDE HUD PRE-WARM ──────────────────────────────────────
      await stage('HUD Pre-warm', false, () => {
        addHitMarker(false);
        addDamageNumber(0, 50, 50, false, false);
        clearHitMarkers();
      });

      // ── STAGE 6: commit a couple of composed frames ────────────────
      // Failure here usually means a post-FX pass blew up — recoverable
      // by skipping post-FX (the game will still render via the renderer's
      // direct path because postFX is null-checked in composePostFX).
      await stage('Post-processing', true, () => {
        composePostFX(0.016);
      });
      await yieldFrame();
      await stage('Post-processing 2nd pass', false, () => {
        composePostFX(0.016);
      });
      await yieldFrame();

      // ── TEARDOWN: best-effort cleanup of every warmup artefact ─────
      // Wrapped in a single guard because we want the loader to finish
      // even if one resource fails to dispose cleanly.
      try {
        warm.forEach(o => scene.remove(o));
        warmPowerUps.forEach((powerUp) => {
          const root = powerUp.mesh as unknown as THREE.Object3D;
          const pooledLight = (root.userData.light as THREE.PointLight | null | undefined) ?? null;
          releasePickupLight(pooledLight);
          root.userData.light = null;
          root.parent?.remove(root);
        });
        refs.flash?.dispose(scene);
        refs.tracer?.dispose(scene);
        refs.impact?.dispose(scene);
        refs.sparks?.dispose(scene);
        refs.rocket?.traverse((o: THREE.Object3D) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mat = o.material;
            if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
            else mat.dispose();
          }
        });
      } catch (err) {
        console.warn('[Warmup] teardown failed (non-fatal):', err);
      }

      // Minimum visible loader time so the user actually sees the
      // ShaderProcessingScreen animation. Without this, fast machines
      // would flash the loader for 1-2 frames (effectively invisible).
      // Skipped when the user has hit Continue-Anyway (they want to get
      // into the game NOW).
      if (!continueAnywayRef.current) {
        const MIN_LOADER_MS = 1200;
        const elapsed = performance.now() - warmupStart;
        if (elapsed < MIN_LOADER_MS) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, MIN_LOADER_MS - elapsed));
        }
      }
    };
    // Helper that blocks until the user clicks Continue Anyway (or the
    // scene tears down). Used after a critical stage raised an error
    // to keep the loader visible until the user makes a decision.
    const waitForUserDecision = () => new Promise<void>((resolve) => {
      const id = window.setInterval(() => {
        if (isSceneDisposed || continueAnywayRef.current) {
          window.clearInterval(id);
          resolve();
        }
      }, 100);
    });

    const warmupFrame = window.requestAnimationFrame(() => {
      // Run warmup as an async chain so individual stages can yield the
      // main thread back to the React loader between heavy steps.
      void (async () => {
        try {
          await warmUpShaders();

          // Critical-stage failure → block on the loader's error UI
          // until the user explicitly continues or reloads.
          if (criticalErrorRef.current && !continueAnywayRef.current) {
            await waitForUserDecision();
          }
        } catch (err) {
          // Anything that escaped every stage wrapper. Should be rare.
          console.error('[Warmup] uncaught failure:', err);
          if (!isSceneDisposed) {
            setWarmupError({
              message: 'Game initialisation failed unexpectedly.',
              stage: 'Warmup',
              detail: err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.trim() : String(err),
              recoverable: true,
            });
            await waitForUserDecision();
          }
        } finally {
          if (!isSceneDisposed) {
            setWarmupError(null);
            setShowShaderProcessing(false);
            animate();
          }
        }
      })();
    });

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();

      const newWidth = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
      const newHeight = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);
      renderer.setSize(newWidth, newHeight, false);
      postFX?.setSize(newWidth, newHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isSceneDisposed = true;
      cancelAnimationFrame(warmupFrame);
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
        const pointerLockCleanup = (renderer.domElement as HTMLCanvasElement & { _mpPointerLockCleanup?: () => void })._mpPointerLockCleanup;
        if (typeof pointerLockCleanup === 'function') {
          pointerLockCleanup();
          delete (renderer.domElement as HTMLCanvasElement & { _mpPointerLockCleanup?: () => void })._mpPointerLockCleanup;
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

      // Cleanup post-processing — EffectComposer.dispose() walks every pass
      // and effect for us, freeing render targets and shaders.
      postFX?.dispose();

      // Cleanup shared bullet resources
      sharedBulletCoreGeo.dispose();
      sharedBulletInnerGlowGeo.dispose();
      sharedBulletOuterGlowGeo.dispose();
      bulletCoreMatCache.forEach((m) => m.dispose());
      bulletCoreMatCache.clear();
      bulletInnerGlowMatCache.forEach((m) => m.dispose());
      bulletInnerGlowMatCache.clear();
      bulletOuterGlowMatCache.forEach((m) => m.dispose());
      bulletOuterGlowMatCache.clear();

      // Cleanup weather system
      weatherSystem.clear();

      // Cleanup sky dome
      skyGeometry.dispose();
      if (skyMaterial instanceof THREE.Material) {
        skyMaterial.dispose();
      }
      hazeGeometry?.dispose();
      hazeMaterial?.dispose();

      // Cleanup remote-player avatars + unsubscribe their network listeners
      remotePlayerUnsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
      remotePlayerUnsubs.length = 0;
      remotePlayerManager?.dispose();
      remotePlayerManager = null;

      // Cleanup the local player shadow caster (invisible body)
      localPlayerShadow.dispose();

      // Cleanup floating effect indicators
      effectIndicators.dispose(scene);

      // Cleanup SmartEnemyManager (releases pooled resources)
      smartEnemyManager.dispose();

      // Cleanup BiomeSystem (releases shared geometry/material pools)
      biomeSystem.dispose();

      // Cleanup shared crater geometries (per-crater materials are GC'd
      // when their meshes are removed from the scene during crater fade-out)
      sharedCraterScorchGeo.dispose();
      sharedCraterRingGeo.dispose();
      sharedCraterDebrisGeo.dispose();

      if (environmentRenderTarget) {
        scene.environment = null;
        environmentRenderTarget.dispose();
        environmentRenderTarget = null;
      }

      renderer.dispose();
    };
    // Settings (gameSettings.*, showTutorial) are intentionally read live
    // from refs / live closures rather than re-running the entire scene
    // when they change — re-mounting the scene on every settings tweak
    // would dispose every enemy / particle mid-play.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStarted, gameMode, classicDifficulty, classicTimeOfDay, selectedMap, multiplayerManager, gameRestartKey]);

  // Handle mode selection
  const handleModeSelection = () => {
    setGameMode('classic');
    setShowClassicMenu(true);
  };

  // Handle tutorial mode — open the tutorial map selector instead of
  // diving straight in. The player picks a map, then the tutorial starts.
  const handleTutorialMode = () => {
    setGameMode('tutorial');
    setShowTutorialMenu(true);
  };

  // Start the tutorial with the chosen map (all weapons + abilities unlocked,
  // unlimited health, no waves — handled by isTutorialMode in the game loop).
  // Tutorial now honours the atmosphere selector (Auto / Day / Night) the
  // same way Classic mode does, so new players can learn under whichever
  // lighting they prefer.
  const handleTutorialStart = (map: MapType, timeOfDay: 'day' | 'night' | 'auto') => {
    setClassicDifficulty('easy');
    setClassicTimeOfDay(timeOfDay);
    setSelectedMap(map);
    setShowTutorialMenu(false);
    soundManager.initialize();
    setShowShaderProcessing(true);
    setGameStarted(true);
  };

  // Handle multiplayer mode selection
  const handleMultiplayerMode = () => {
    setGameMode('multiplayer');
    setShowMultiplayerLobby(true);
  };

  // Handle multiplayer game start from lobby
  const handleMultiplayerStartGame = (
    manager: MultiplayerManager,
    gameMode: 'coop' | 'survival',
    timeLimit?: number,
    map?: MapType,
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive',
  ) => {
    console.log('[App] handleMultiplayerStartGame called - isHost:', manager.isGameHost(), 'map:', map, 'difficulty:', difficulty);
    setMultiplayerManager(manager);
    setMultiplayerGameMode(gameMode);
    if (map) {
      setSelectedMap(map);
    }
    // Host-selected difficulty applies to every client (the game effect uses
    // `classicDifficulty` for spawn pacing, wave size, enemy aggression).
    setClassicDifficulty(difficulty || 'medium');
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
      maxHealth: 100,
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

    setShowShaderProcessing(true);
    setGameStarted(true);

    // Start the game in multiplayer manager (host broadcasts to guests)
    // Guests have their handler registered in MultiplayerLobby already
    if (manager.isGameHost()) {
      console.log('[App] Host starting game, broadcasting to all guests...');
      manager.startGame(gameMode, timeLimit, map, difficulty || 'medium');
    } else {
      console.log('[App] Guest received game_start and transitioning...');
    }
  };

  // Handle classic mode start
  const handleClassicGameStart = (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType, isRandom: boolean = false) => {
    setClassicDifficulty(difficulty);
    setClassicTimeOfDay(timeOfDay);
    setSelectedMap(map);
    setIsClassicRandomSession(isRandom);
    // Enable adaptive difficulty setting when adaptive mode is selected
    if (difficulty === 'adaptive') {
      setGameSettings(prev => ({ ...prev, adaptiveDifficulty: true }));
    }
    console.log('[App] Starting classic game with map:', map, 'random:', isRandom);
    soundManager.initialize();
    setShowClassicMenu(false);
    setShowShaderProcessing(true);
    setGameStarted(true);
  };

  const restartGame = () => {
    // ── Multiplayer ────────────────────────────────────────────────────────
    // "Play Again" sends every player back to the lobby instead of jumping
    // straight into a new match. The lobby reuses the existing manager so
    // no one has to re-enter the lobby ID. Only the host can initiate this.
    if (gameMode === 'multiplayer' && multiplayerManager) {
      if (!multiplayerManager.isGameHost()) {
        console.log('[App] Guest requested restart - waiting for host return_to_lobby');
        return;
      }

      console.log('[App] Host returning all players to lobby for next match');
      // Broadcast first so guests are queued to flip into lobby view; the
      // host's own UI flips via the local handler registered above.
      multiplayerManager.returnToLobby();
      return;
    }

    // ── Solo (classic / tutorial) ─────────────────────────────────────────
    // Replay immediately with the same map/difficulty/time-of-day — no
    // page reload, no detour through the main menu. Bumping gameRestartKey
    // tears down the current scene and re-runs the game useEffect cleanly.
    //
    // EXCEPTION: when the player launched via Random Mode ("Roll & Play"),
    // re-roll the map AND time-of-day on every restart so the random
    // session actually feels random — was previously stuck on whatever
    // map was rolled the first time.
    if (isClassicRandomSession && gameMode === 'classic') {
      const timeOptions: ('day' | 'night' | 'auto')[] = ['day', 'night', 'auto'];
      const nextMap = getRandomMap();
      const nextTime = timeOptions[Math.floor(Math.random() * timeOptions.length)];
      console.log('[App] Restarting random session → map:', nextMap, 'time:', nextTime);
      setSelectedMap(nextMap);
      setClassicTimeOfDay(nextTime);
    }
    setGameState({
      health: 100,
      maxHealth: 100,
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
    setIsPaused(false);
    setShowWaveComplete(false);
    setPowerUpMessage('');
    setAbilityHud([]);
    setAchievementQueue([]);
    setActiveMissions([]);
    setCoachTips([]);
    soundManager.unmute();
    setShowShaderProcessing(true);
    setGameRestartKey(k => k + 1);
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

  // ─── MENU SHELL ─────────────────────────────────────────────────────
  // All four menus (MainMenu, ClassicMenu, TutorialMenu, MultiplayerLobby)
  // share ONE persistent MenuBackdrop — that's the WebGL forest scene
  // hoisted up here so React's reconciler keeps it mounted across menu
  // navigation. Without this hoist, every menu transition unmounted the
  // entire 3D scene (150+ trees, fireflies, post-FX pipeline) and rebuilt
  // it — the visible stutter the user reported when moving between
  // Solo / Tutorial / Multiplayer.
  //
  // Per-menu visual identity is provided by the MenuShell overlay (each
  // menu still renders its own MenuShell internally with its variant).
  // The MenuBackdrop variant prop is informational only — the underlying
  // scene stays the same to avoid the rebuild cost.
  const inMenuMode = !gameStarted && !isSpectating && !multiplayerGameOver;
  if (inMenuMode) {
    const menuVariant: MenuBackdropVariant =
      showMultiplayerLobby ? 'multiplayer'
      : showClassicMenu    ? 'classic'
      : showTutorialMenu   ? 'tutorial'
      : 'main';

    return (
      <>
        {/* Persistent — same component instance across every menu render */}
        <MenuBackdrop variant={menuVariant} />

        {gameMode === 'none' && !showClassicMenu && !showTutorialMenu && !showMultiplayerLobby && (
          <MainMenu onClassicMode={handleModeSelection} onMultiplayerMode={handleMultiplayerMode} onTutorialMode={handleTutorialMode} t={t} />
        )}
        {showClassicMenu && (
          <ClassicMenu onStartGame={handleClassicGameStart} onBack={() => { setShowClassicMenu(false); setGameMode('none'); }} t={t} />
        )}
        {showTutorialMenu && (
          <TutorialMenu onStartTutorial={handleTutorialStart} onBack={() => { setShowTutorialMenu(false); setGameMode('none'); }} t={t} />
        )}
        {showMultiplayerLobby && (
          <MultiplayerLobby
            onStartGame={handleMultiplayerStartGame}
            existingManager={multiplayerManager}
            onBack={() => {
              if (multiplayerManager) {
                try { multiplayerManager.disconnect(); } catch { /* ignore */ }
                setMultiplayerManager(null);
              }
              setShowMultiplayerLobby(false);
              setGameMode('none');
            }}
          />
        )}
        {/* Global music mute — pinned bottom-right, visible across every menu */}
        <MusicMuteButton />
      </>
    );
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
    return (
      <>
        <MultiplayerGameOver winnerId={multiplayerWinner || ''} finalStats={finalStats} localPlayerId={localPlayerId} onRestart={restartGame} onMainMenu={returnToMenu} canRestart={multiplayerManager.isGameHost()} />
      </>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <Analytics />
      <SpeedInsights />
      <ShaderProcessingScreen
        visible={(showShaderProcessing && gameStarted) || (warmupError !== null)}
        error={warmupError}
        onContinueAnyway={() => {
          // User has decided to proceed despite a warmup failure. Flip
          // the ref the warmup chain is polling on — its completion
          // handler will then hide the loader and start animate().
          continueAnywayRef.current = true;
          setWarmupError(null);
        }}
      />
      <div ref={mountRef} className="absolute inset-0" style={{ zIndex: 0 }} />

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        <HUD
          health={gameState.health}
          maxHealth={gameState.maxHealth}
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
          staminaRatio={staminaRatio}
          staminaExhausted={staminaExhaustedUI}
        />
      </div>

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

      {/* Achievement Notifications - Stacked vertically.
       * Suppressed entirely in tutorial mode — tutorial is a no-stakes
       * sandbox where achievements would be cheap/spammy AND visually
       * compete with the tutorial overlay card. The onUnlock subscription
       * is also skipped for tutorial sessions so the queue never grows. */}
      {gameMode !== 'tutorial' && achievementQueue.map((achievement, index) => (
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
            skillTreeLocked={!isAuthenticated}
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

      {/* Mission Display — hidden in the tutorial (no waves/missions there) */}
      {gameStarted && !gameState.isGameOver && gameMode !== 'tutorial' && activeMissions.length > 0 && (
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
                (tut as TutorialSystem & { _lastStepId?: string | null })._lastStepId = null;
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
          onTry={() => {
            // Practising an interactive step — unblock input + grab pointer lock
            // so the action can actually be performed. The per-frame loop
            // re-blocks automatically once the step advances.
            tutorialActiveRef.current = false;
            const canvas = mountRef.current?.querySelector('canvas');
            if (canvas) (canvas as HTMLCanvasElement).requestPointerLock();
          }}
          onNext={() => {
            const tut = tutorialRef.current;
            if (tut && tutorialStep?.id) {
              tut.completeStep(tutorialStep.id);
              const nextStep = tut.getCurrentStep();
              if (nextStep) {
                (tut as TutorialSystem & { _lastStepId?: string | null })._lastStepId = null;
                setTutorialStep({ ...nextStep });
                setTutorialProgress(tut.getProgress());
              } else {
                // Tutorial done — show completion card, unlock pointer.
                setShowTutorial(false);
                setTutorialStep(null);
                tutorialActiveRef.current = false;
                setTutorialComplete(true);
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

      {/* Tutorial Complete — the player has finished every step and can now
          play freely (the sandbox keeps running) or head to the menu. */}
      {tutorialComplete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(5,8,10,0.78)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#0b0f15] shadow-2xl"
            style={{ animation: 'tutorialDoneIn 0.4s cubic-bezier(0.16,1,0.3,1) forwards' }}>
            <div className="h-1 w-full bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
            <div className="px-7 py-7 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-400/30">
                <GraduationCap className="w-8 h-8 text-emerald-300" strokeWidth={2} />
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">Tutorial Complete!</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                You've mastered the basics, survivor. You're free to keep practising here,
                or jump into a real run from the menu.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  onClick={() => {
                    setTutorialComplete(false);
                    const canvas = mountRef.current?.querySelector('canvas');
                    if (canvas) (canvas as HTMLCanvasElement).requestPointerLock();
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide text-[#04130a] transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
                >
                  <Play className="w-4 h-4" strokeWidth={2.5} /> Keep Playing
                </button>
                <button
                  onClick={() => { setTutorialComplete(false); returnToMenu(); }}
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-bold tracking-wide text-gray-200 transition-all hover:bg-white/[0.08]"
                >
                  <Home className="w-4 h-4" strokeWidth={2.25} /> Main Menu
                </button>
              </div>
            </div>
          </div>
          <style>{`@keyframes tutorialDoneIn { from { opacity: 0; transform: translateY(16px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
        </div>
      )}

      {/* Skill Tree Menu — wired to real skill tree state */}
      {showSkillTree && (
        <SkillTreeMenu
          skills={skillTreeData.skills}
          availablePoints={skillTreeData.availablePoints}
          spentPoints={skillTreeData.spentPoints}
          totalPoints={skillTreeData.totalPoints}
          detectedPlayStyle={skillTreeData.detectedPlayStyle}
          recommendations={skillTreeData.recommendations}
          onUnlockSkill={async (skillId) => {
            if (!isAuthenticated || !skillTreeRef.current) return;
            try {
              // Server validates cost + prerequisites and is the source of truth.
              const result = await unlockSkillMutation({ skillId });
              // Mirror the persisted state into the live system so in-match
              // bonuses pick it up on the next 0.4s refresh.
              skillTreeRef.current.hydrate(result.skills, result.skillPoints);
              const s = skillTreeRef.current.getState();
              setSkillTreeData({
                skills: skillTreeRef.current.getAllSkills(),
                availablePoints: s.availablePoints,
                spentPoints: s.spentPoints,
                totalPoints: s.totalPoints,
                detectedPlayStyle: 'balanced',
                recommendations: [],
              });
            } catch {
              // Validation failure (not enough points / reqs) — leave UI as-is.
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
            const nextSettings = { ...gameSettings, ...newSettings };
            setGameSettings(nextSettings);
            gameSettingsManager.updateSettings(enhancedSettingsToUserSettings(nextSettings));
          }}
          onClose={() => setShowEnhancedSettings(false)}
          onReset={() => {
            gameSettingsManager.resetToDefaults();
            setGameSettings(createEnhancedSettingsDefaults(gameSettingsManager.getSettings()));
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
