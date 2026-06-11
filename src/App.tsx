import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GraduationCap, Play, Home, MousePointerClick } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GunModel, type WeaponType as GunWeaponType } from './utils/GunModel';
import { MuzzleFlash, BulletTracer, ImpactEffect, RobotHitSparks, ExplosionEffect, setMuzzleLightPool, setExplosionLightPool } from './utils/Effects';
import { soundManager } from './utils/SoundManager';
import { gameSettingsManager, type UserSettings, type KeyBindings } from './utils/GameSettingsManager';
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
import { getMapConfig, getRandomMap, DEFAULT_MAP, type MapConfig, type MapType } from './utils/MapSystem';
import { applyGroundTerrainShader, createTerrainSeed, createTerrainUniforms, resolveTerrainProfile, terrainSegments } from './utils/TerrainSystem';
import { TerrainInstancer } from './utils/TerrainInstancer';
import { getHDRIEnvironmentIntensity, getHDRIEnvironmentProfile, loadHDRIEnvironment, type HDRIEnvironmentProfile } from './utils/HDRIEnvironment';
import { MultiplayerManager, type PlayerData as MpPlayerData, type NetworkMessage, type EnemyWire } from './utils/MultiplayerManager';
import { RemotePlayerManager } from './utils/RemotePlayerManager';
import { SnapshotInterpolator, type TransformSample } from './utils/SnapshotInterpolator';
import Minimap, { renderMinimapFrame, isMinimapActive, toggleMinimapExpanded, type MinimapBlip } from './components/Minimap';
import { LocalPlayerShadow } from './utils/LocalPlayerShadow';
import { EffectIndicators, type EffectKey } from './utils/EffectIndicators';
import type { ClassId } from './utils/CharacterModels';
import { AbilitySystem } from './utils/AbilitySystem';
import { AchievementSystem, type Achievement } from './utils/AchievementSystem';
import { EnhancedPowerUpSystem } from './utils/EnhancedPowerUps';
import { DayCycleSystem, type AtmosphericSettings } from './utils/DayCycleSystem';
import HUD, { type AbilityHudItem } from './components/HUD';
import MainMenu from './components/MainMenu';
import ClassicMenu from './components/ClassicMenu';
import TutorialMenu from './components/TutorialMenu';
import GameOver from './components/GameOver';
import PauseMenu from './components/PauseMenu';
import PhotoMode from './components/PhotoMode';
import Notifications from './components/Notifications';
import MultiplayerLobby from './components/MultiplayerLobby';
import MultiplayerHUD from './components/MultiplayerHUD';
import MultiplayerGameOver from './components/MultiplayerGameOver';
import SpectateScreen from './components/SpectateScreen';
import ChatSystem from './components/ChatSystem';
import AchievementNotification from './components/AchievementNotification';
import KillFeed, { addKillFeedEntry } from './components/KillFeed';
import HitMarkers, { addHitMarker, addDamageNumber, clearHitMarkers } from './components/HitMarkers';
import DamageDirectionIndicator, { triggerDamageDirection, clearDamageDirections } from './components/DamageDirectionIndicator';
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
import EnemyIntroBanner from './components/EnemyIntroBanner';
import WavePerkPicker from './components/WavePerkPicker';
import { aggregatePerkBonuses, NEUTRAL_PERK_BONUSES, rollMysteryBox, isPerkPoolExhausted, WAVE_PERKS, type WavePerkId, type PerkBonuses } from './utils/WavePerkRegistry';
import RunModifierPicker from './components/RunModifierPicker';
import { RUN_MODIFIERS, getDailyTrio, type RunModifierId } from './utils/RunModifierSystem';
import { spawnBarrels, type ExplosiveBarrel } from './utils/HazardSystem';
import { spawnRangedSentinels, updateSentinelGlow, type RangedSentinel } from './utils/RangedSentinelSystem';
import { CHARACTER_PASSIVES } from './utils/CharacterPassiveRegistry';
import { getCharacterAbility } from './utils/CharacterAbilityRegistry';
import { DAILY_CHALLENGES, getTodayChallengeId } from './utils/DailyChallengeRegistry';
import { bonusForLevel, levelFromXp, xpPerKill, xpProgressAtLevel, type MasteryBonus } from './utils/WeaponMasterySystem';
import { TITLE_FOR_ACHIEVEMENT } from './utils/CosmeticTitles';
import { EnhancedSettings, type GameSettings } from './components/EnhancedSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import ShaderProcessingScreen, { type WarmupErrorInfo } from './components/ShaderProcessingScreen';
import MenuBackdrop, { type MenuBackdropVariant } from './components/MenuBackdrop';
import MenuShell from './components/MenuShell';
import MenuTransition from './components/MenuTransition';
import MusicMuteButton from './components/MusicMuteButton';
import { musicMute } from './utils/musicMute';
import { useMutation, useQuery } from 'convex/react';
import { useConvexAuth } from '@convex-dev/auth/react';
import { api } from '../convex/_generated/api';
import { usePlayerData } from './hooks/usePlayerData';
import { useDeviceInfo } from './hooks/useDeviceInfo';
import { touchControls } from './utils/touchControls';
import { haptic } from './utils/haptics';
import TouchControls from './components/TouchControls';
import OrientationGate from './components/OrientationGate';
import MobileNotice from './components/MobileNotice';

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

// Tutorial-only enemy-introduction banner payload. Emitted by the Tutorial
// Enemy Director each time it unlocks a new species so the player gets a quick,
// readable "field guide" card naming the threat and how to handle it.
interface EnemyIntro {
  id: number;        // unique per emission so React re-triggers the entrance anim
  name: string;
  blurb: string;
  tag: string;       // short threat descriptor, e.g. "FAST · FRAGILE"
  accent: string;    // hex accent colour matching the enemy's vibe
  icon: 'skull' | 'wind' | 'shield' | 'crown' | 'crosshair';
}

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
  ragdollPhysics: userSettings.ragdollPhysics,
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
  ragdollPhysics: userSettings.ragdollPhysics,
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
  ragdollPhysics: settings.ragdollPhysics,
});

const MENU_MUSIC_URL = '/audio/Beyond_The_Overgrowth.mp3';

// Fixed key order so the serialized settings blob is stable for equality checks
// (avoids spurious DB writes when the object identity changes but values don't).
const SYNCED_SETTING_KEYS: (keyof UserSettings)[] = [
  'masterVolume', 'sfxVolume', 'musicVolume', 'sensitivity', 'fov',
  'showFPS', 'screenShake', 'haptics', 'hitMarkers', 'killFeed', 'damageNumbers',
  'ragdollPhysics', 'crosshairStyle', 'crosshairColor', 'graphicsQuality', 'keyBindings',
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
  // Daily Challenge — progress is recorded as a CUMULATIVE total, throttled
  // client-side. The mutation idempotently `max()`s on the server side so a
  // duplicate write can't double-count.
  const recordDailyProgressMutation = useMutation(api.daily.recordProgress);
  // Weapon Mastery — XP grants are sent per weapon as bounded deltas. The
  // server reconciles + caps at MAX_XP_PER_WEAPON.
  const addWeaponMasteryXpMutation = useMutation(api.playerStats.addWeaponMasteryXp);
  const equipTitleMutation = useMutation(api.playerStats.equipTitle);
  useEffect(() => { equipTitleRef.current = equipTitleMutation; }, [equipTitleMutation]);
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
  // Solo / Tutorial character pick. Drives the ground-shadow silhouette AND
  // the signature active ability + passive (the same path multiplayer uses,
  // where the class comes from the lobby instead). Read by the long-lived
  // game effect via a ref so changing it never re-mounts the scene.
  const [selectedCharacter, setSelectedCharacter] = useState<ClassId>('ranger');
  const selectedCharacterRef = useRef<ClassId>('ranger');
  useEffect(() => { selectedCharacterRef.current = selectedCharacter; }, [selectedCharacter]);
  // Tracks whether the player launched classic via the "Roll & Play"
  // random-mode button. On restart we re-roll the map (and time of day)
  // so it's actually random across sessions, not the first map forever.
  const [isClassicRandomSession, setIsClassicRandomSession] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showWaveComplete, setShowWaveComplete] = useState(false);
  // Wave-End perk picker offer. When non-null, the picker overlay shows
  // 3 cards and gameplay is frozen until the player picks one. Resolved
  // through `wavePerkResolverRef` so the closure inside the game loop can
  // call back to the picker's "pick" handler without a stale reference.
  const [wavePerkOffer, setWavePerkOffer] = useState<{
    wave: number;
    slots: (WavePerkId | null)[];
    prizeSlotIndex: number;
    autoPickAfterMs?: number;
  } | null>(null);
  const wavePerkActiveRef = useRef(false);
  // Resolver consumes the final pick result — `WavePerkId` on a winning
  // guess, `null` when the player picked an empty box.
  const wavePerkResolverRef = useRef<((picked: WavePerkId | null) => void) | null>(null);
  // Picked perks for the active run — surfaces as a small chip in the HUD
  // so the player can see at a glance what's stacked.
  const [activeRunPerks, setActiveRunPerks] = useState<WavePerkId[]>([]);
  // Run-Modifier picker step — sits between ClassicMenu and the shader loader
  // so the player gets one last "raise the stakes" choice before the world
  // initialises. Selected modifier is stored as a ref so the game loop's
  // closure can read it once on init without forcing a re-render dependency.
  const [runModifierPickerOptions, setRunModifierPickerOptions] = useState<RunModifierId[] | null>(null);
  const pendingClassicStartRef = useRef<{ difficulty: 'easy' | 'medium' | 'hard' | 'adaptive'; timeOfDay: 'day' | 'night' | 'auto'; map: MapType; isRandom: boolean } | null>(null);
  const activeRunModifierRef = useRef<RunModifierId | null>(null);
  // Per-weapon mastery XP snapshot, read out of player stats once before
  // the scene useEffect mounts. The scene loop only sees this REF (so a
  // refetch on the way in is fine); the persisted total is updated by the
  // throttled XP-flush mutation.
  const persistedWeaponMasteryRef = useRef<Record<string, number>>({});
  // Currently equipped cosmetic title (auto-equipped from the first
  // unlocked title-granting achievement; future iterations let players
  // pick via Profile). Stored as a ref so the scene loop can read without
  // taking a hook dependency.
  const equippedTitleRef = useRef<string | null>(null);
  // Stable ref to the equipTitle mutation so the scene useEffect doesn't
  // have to take the mutation function as a dep (which would re-mount the
  // scene on every render).
  const equipTitleRef = useRef<(args: { title: string | null }) => Promise<unknown>>(async () => null);
  const [powerUpMessage, setPowerUpMessage] = useState<string>('');
  // Tutorial-only "New Threat" banner — announces each enemy species the moment
  // the Tutorial Enemy Director unlocks it, turning the tutorial into a bestiary.
  const [enemyIntro, setEnemyIntro] = useState<EnemyIntro | null>(null);
  const [abilityHud, setAbilityHud] = useState<AbilityHudItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => gameSettingsManager.getSettings());
  // Live keybindings the game loop reads every frame. Kept in a ref (not state)
  // so rebinding from the pause-menu settings applies instantly without
  // re-running the long-lived game effect. Refreshed by the settings subscription.
  const keyBindingsRef = useRef<KeyBindings>(gameSettingsManager.getSetting('keyBindings'));
  const [currentFPS, setCurrentFPS] = useState(0);
  // Live stamina + exhaustion flags pushed from the per-frame game loop
  // so the HUD can draw the bottom-left pie meter at the correct fill.
  const [staminaRatio, setStaminaRatio] = useState(1);
  const [staminaExhaustedUI, setStaminaExhaustedUI] = useState(false);
  // Reload feedback: holds the in-progress reload's total duration (ms) so the
  // crosshair indicator can time its CSS sweep, or null when not reloading.
  const [reloadDurationUI, setReloadDurationUI] = useState<number | null>(null);

  // ─── Photo Mode (in-game photoshoot → Convex storage) ────────────────────
  const generatePhotoUploadUrl = useMutation(api.photos.generateUploadUrl);
  const savePhotoMutation = useMutation(api.photos.savePhoto);
  // Only subscribe to the count during solo play (where Photo Mode is reachable).
  const photoCountData = useQuery(
    api.photos.getPhotoCount,
    isAuthenticated && gameMode === 'classic' ? {} : 'skip',
  );
  const [photoMode, setPhotoMode] = useState(false);
  const photoModeRef = useRef(false);   // read live by the game loop
  const photoFilterRef = useRef('');    // latest CSS filter (baked into captures)
  // Set inside the game loop; grabs the live frame (filters baked in) as a Blob.
  const photoCaptureRef = useRef<((filterCss: string) => Promise<Blob | null>) | null>(null);

  const handlePhotoFilterChange = useCallback((css: string) => {
    photoFilterRef.current = css;
    const canvas = mountRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) canvas.style.filter = css;
  }, []);

  const enterPhotoMode = useCallback(() => {
    photoModeRef.current = true;
    setPhotoMode(true);
    setIsPaused(false); // hide the pause menu — the loop keeps the world frozen
  }, []);

  const exitPhotoMode = useCallback(() => {
    photoModeRef.current = false;
    photoFilterRef.current = '';
    const canvas = mountRef.current?.querySelector('canvas') as HTMLCanvasElement | null;
    if (canvas) canvas.style.filter = '';
    setPhotoMode(false);
    setIsPaused(true); // return to the pause menu
  }, []);

  const handlePhotoCapture = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const capture = photoCaptureRef.current;
    if (!capture) return { ok: false, message: 'Renderer not ready yet.' };
    const blob = await capture(photoFilterRef.current);
    if (!blob) return { ok: false, message: 'Could not capture the frame.' };
    try {
      const uploadUrl = await generatePhotoUploadUrl();
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      if (!res.ok) return { ok: false, message: 'Upload failed — please try again.' };
      const { storageId } = await res.json();
      await savePhotoMutation({ storageId });
      return { ok: true, message: 'Saved! View it in Profile → Photos.' };
    } catch (err) {
      const data = (err as { data?: unknown })?.data;
      if (typeof data === 'string') return { ok: false, message: data };
      return { ok: false, message: err instanceof Error ? err.message : 'Upload failed.' };
    }
  }, [generatePhotoUploadUrl, savePhotoMutation]);

  // Multiplayer state
  const [showMultiplayerLobby, setShowMultiplayerLobby] = useState(false);
  const [multiplayerManager, setMultiplayerManager] = useState<MultiplayerManager | null>(null);
  const [multiplayerGameOver, setMultiplayerGameOver] = useState(false);
  const [multiplayerWinner, setMultiplayerWinner] = useState<string | null>(null);
  const [multiplayerGameMode, setMultiplayerGameMode] = useState<'coop' | 'survival'>('coop');
  const [isSpectating, setIsSpectating] = useState(false); // Track if local player is eliminated and spectating
  // Multiplayer: shown when the cursor is released (Escape) since MP never
  // pauses — the next click re-locks. Driven by the pointer-lock listener.
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [, setMultiplayerKillFeed] = useState<Array<{ id: string; killerName: string; victimName: string; victimColor: number; weapon: string; timestamp: number }>>([]);
  const [lastKillerInfo, setLastKillerInfo] = useState<{ killerName: string; weapon: string } | null>(null);
  // Guest-only: true between entering the match and the first enemy keyframe
  // arriving from the host. Drives a small "syncing" affordance so a slow
  // connection shows progress instead of an empty world.
  const [mpWaitingForHost, setMpWaitingForHost] = useState(false);
  const [, setMpStatsTick] = useState(0); // Force HUD re-render for remote player stats
  const [gameRestartKey, setGameRestartKey] = useState(0); // Bump to force game useEffect re-run on restart
  const multiplayerTimeLimitRef = useRef<number | undefined>(undefined);
  // Guards handleMultiplayerStartGame against duplicate/late game_start
  // messages re-entering the match flow. Reset on leaving the match.
  const mpStartHandledRef = useRef(false);
  // Mirrors mpWaitingForHost for reads inside the game loop (avoids stale
  // closures) and lets us clear the affordance once without setState spam.
  const mpWaitingForHostRef = useRef(false);

  // Achievement system state — supports multiple in-flight notifications
  type QueuedAchievement = Achievement & { queueId: number };
  const [achievementQueue, setAchievementQueue] = useState<QueuedAchievement[]>([]);

  // Touch device + orientation detection (drives the mobile/tablet port).
  // `isTouch` gates the on-screen controls + control remap; `isLandscape`
  // drives the rotate-to-landscape gate. Desktop = both irrelevant.
  const { isTouch, isLandscape } = useDeviceInfo();
  // True while the game loop should freeze because a touch device is held in
  // portrait. Read inside the render loop's freeze gate (kept as a ref so the
  // long-lived loop closure always sees the current value).
  const orientationBlockedRef = useRef(false);

  // AI SYSTEMS STATE
  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);
  const [coachTips, setCoachTips] = useState<CoachTip[]>([]);
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showEnhancedSettings, setShowEnhancedSettings] = useState(false);

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
    // Mirror persisted weapon mastery XP into the scene-loop ref so the
    // game starts each run with the correct level snapshot for every
    // weapon. The ref is read once on scene init.
    persistedWeaponMasteryRef.current = { ...(playerStats.weaponMastery ?? {}) };
    equippedTitleRef.current = playerStats.equippedTitle ?? null;
    const s = tree.getState();
    setSkillTreeData((prev) => ({
      ...prev,
      skills: tree.getAllSkills(),
      availablePoints: s.availablePoints,
      spentPoints: s.spentPoints,
      totalPoints: s.totalPoints,
      recommendations: tree.generateRecommendations(),
    }));
  }, [gameStarted, isAuthenticated, playerStats]);

  // Leaving a match (back to lobby / menu / game-over) re-arms the
  // multiplayer start guard so the next match can begin cleanly.
  useEffect(() => {
    if (!gameStarted) {
      mpStartHandledRef.current = false;
      mpWaitingForHostRef.current = false;
      setMpWaitingForHost(false);
    }
  }, [gameStarted]);

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
      // Go directly to multiplayer lobby, which will handle the auto-rejoin
      setGameMode('multiplayer');
      setShowMultiplayerLobby(true);
    }
  }, []);

  // Enable the touch-input bridge + tag <body> for touch-only CSS. Runs before
  // any game loop starts (mount-time), so the loop always reads the right flag.
  useEffect(() => {
    touchControls.enabled = isTouch;
    if (isTouch) document.body.classList.add('is-touch');
    return () => {
      document.body.classList.remove('is-touch');
      touchControls.enabled = false;
    };
  }, [isTouch]);

  // First-run graphics default for touch devices: phones/tablets start at a
  // lighter preset (low on weak hardware) instead of desktop's `high`. Only
  // applied when the user has no saved preference yet, so it never overrides a
  // choice. Reuses the existing GRAPHICS_PRESETS tiers.
  useEffect(() => {
    if (!isTouch) return;
    try {
      if (!localStorage.getItem('gameSettings')) {
        const cores = navigator.hardwareConcurrency ?? 8;
        const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
        const lowEnd = cores <= 4 || mem <= 4;
        gameSettingsManager.setGraphicsQuality(lowEnd ? 'low' : 'medium');
      }
    } catch { /* localStorage unavailable — keep defaults */ }
  }, [isTouch]);


  // Sync user settings from localStorage
  useEffect(() => {
    const unsubscribe = gameSettingsManager.subscribe((settings) => {
      setUserSettings(settings);
      keyBindingsRef.current = settings.keyBindings;
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

    const shouldPlayMenuMusic = !gameStarted && !musicMuted;

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
      if (gameStarted) {
        music.currentTime = 0;
      }
    }
  }, [gameStarted, musicMuted, userSettings.masterVolume, userSettings.musicVolume]);

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

    // Helper: narrow the polymorphic network payload to the message
    // variant we just subscribed to. The MultiplayerManager dispatches
    // each handler by string type, so the cast is sound at runtime.
    type MsgFor<T extends NetworkMessage['type']> = Extract<NetworkMessage, { type: T }>;
    const asMsg = <T extends NetworkMessage['type']>(raw: unknown) => raw as MsgFor<T>;

    // Listen for game over
    const unsubGameOver = multiplayerManager.onMessage('game_over', (raw) => {
      const data = asMsg<'game_over'>(raw);
      setMultiplayerWinner(data.winnerId);
      setMultiplayerGameOver(true);
      // Stop all sounds when game is over
      soundManager.mute();
    });

    // Listen for kill events - real-time killer/victim info
    const unsubKilled = multiplayerManager.onMessage('player_killed', (raw) => {
      const data = asMsg<'player_killed'>(raw);
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
      // Pick up the host's time-of-day choice too (defaults to auto).
      if (data.gameState?.timeOfDay) {
        setClassicTimeOfDay(data.gameState.timeOfDay);
      }
      // Bump key to re-run the main game useEffect (fresh scene + fresh state)
      setGameRestartKey(k => k + 1);
    });

    // Host sent everyone back to the lobby after a match — tear down the
    // game scene and show the lobby UI without forcing a peer rejoin.
    const unsubReturnLobby = multiplayerManager.onMessage('return_to_lobby', () => {
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

    // Refresh the HUD / leaderboard when player stats change. CRITICAL PERF:
    // player_update arrives ~15Hz from EVERY peer, and a naive re-render per
    // packet reconciled the entire (very large) App tree dozens of times a
    // second, competing with the 60fps render loop — the chief cause of the
    // "random" multiplayer lag. We coalesce bumps to ~6Hz (leading + trailing
    // edge) which is plenty for a scoreboard while slashing reconciliation cost.
    const STATS_BUMP_MS = 160;
    let lastStatsBump = 0;
    let statsTrailingTimer: ReturnType<typeof setTimeout> | null = null;
    const doBump = () => { lastStatsBump = Date.now(); setMpStatsTick(v => (v + 1) % 1000000); };
    const bumpStats = () => {
      const now = Date.now();
      const since = now - lastStatsBump;
      if (since >= STATS_BUMP_MS) {
        if (statsTrailingTimer) { clearTimeout(statsTrailingTimer); statsTrailingTimer = null; }
        doBump();
      } else if (!statsTrailingTimer) {
        statsTrailingTimer = setTimeout(() => { statsTrailingTimer = null; doBump(); }, STATS_BUMP_MS - since);
      }
    };
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

    return () => {
      unsubGameOver();
      unsubKilled();
      unsubRestart();
      unsubReturnLobby();
      unsubPlayerUpdate();
      unsubEnemyKilled();
      clearInterval(statsInterval);
      clearInterval(killFeedInterval);
      if (statsTrailingTimer) clearTimeout(statsTrailingTimer);
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

  // Freeze the sim + show the rotate prompt when a touch device is in portrait.
  // (Defined here, after gameState, so it can read the live game-over flag.)
  useEffect(() => {
    const blocked = isTouch && !isLandscape && gameStarted && !gameState.isGameOver;
    orientationBlockedRef.current = blocked;
    if (blocked) touchControls.reset();
  }, [isTouch, isLandscape, gameStarted, gameState.isGameOver]);

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
          difficulty: classicDifficulty,
        }).catch(() => {});
      }
    } else if (!gameState.isGameOver) {
      soloRunSubmittedRef.current = false;
    }
  }, [gameState.isGameOver, gameState.score, gameState.wave, gameState.enemiesKilled, gameMode, isAuthenticated, submitSoloRun, classicDifficulty]);

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
    // `let` so the render loop can honour the Screen Shake toggle live —
    // refreshed alongside FOV in the throttled settings re-read below. When
    // off, the camera-shake offset is never applied (accessibility / motion
    // sickness), while recoil pitch-climb + FOV punch still read as weapon kick.
    let screenShakeOn = currentUserSettings.screenShake;
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
      // Tuning re-baselined to account for the new ranged "Sniper" threat
      // (wave 4+) and the existing explosive barrels + ranged turrets:
      //   Medium — was tuned around "no ranged threats". Dropped HP / dmg
      //            ~10-15% so a typical 5-wave run feels punchy without
      //            being overwhelming once snipers start firing.
      //   Hard   — same scaling cut by ~15%; still meaningfully harder
      //            than Medium but the ranged + sentinel pressure makes
      //            the old 2.6 HP / 2.1 dmg feel grindy.
      easy:     { healthMult: 0.9, speedMult: 0.6,  damageMult: 0.8,  spawnMult: 0.7, regenRate: 0,    aggroMult: 0.7,  reactionMult: 1.5,  chaseMult: 0.8 },
      medium:   { healthMult: 1.4, speedMult: 1.05, damageMult: 1.25, spawnMult: 1.0, regenRate: 0.1,  aggroMult: 1.0,  reactionMult: 1.05, chaseMult: 1.0 },
      hard:     { healthMult: 2.2, speedMult: 1.5,  damageMult: 1.85, spawnMult: 1.4, regenRate: 0.2,  aggroMult: 1.55, reactionMult: 0.6,  chaseMult: 1.35 },
      adaptive: { healthMult: 1.3, speedMult: 0.95, damageMult: 1.2,  spawnMult: 1.0, regenRate: 0.05, aggroMult: 0.95, reactionMult: 1.0,  chaseMult: 1.0 }, // Starts gentle, AI ramps up
    };
    const diffSettings = { ...classicSettings[classicDifficulty], progressive: classicDifficulty === 'adaptive', rampRate: classicDifficulty === 'adaptive' ? 0.05 : 0 };

    // Difficulty-weighted SCORE multiplier — the on-screen score (and therefore
    // the submitted run) scales with difficulty, mirroring the server-side rank
    // economy (convex/gameLimits.ts DIFFICULTY_MULT). Playing harder is worth
    // more points; easy is worth less. Solo only — multiplayer uses its own
    // scoring. KEEP IN SYNC with DIFFICULTY_MULT.
    const scoreDiffMult = gameMode === 'classic'
      ? ({ easy: 0.6, medium: 1.0, hard: 1.7, adaptive: 1.3 } as const)[classicDifficulty]
      : 1;

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
    // Guests show a brief "syncing" affordance until the host's first enemy
    // keyframe arrives; everyone else never sees it.
    mpWaitingForHostRef.current = isMpGuest;
    setMpWaitingForHost(isMpGuest);
    // Enemy type ⇄ compact wire code.
    // Wire encoding for the host→guest enemy snapshot. APPEND-ONLY — older
    // clients will fall back to 'normal' on an unknown code via the
    // ENEMY_TYPE_FROM_CODE bounds check at the read site.
    const ENEMY_TYPE_CODE: Record<'normal' | 'fast' | 'tank' | 'boss' | 'ranged', number> = {
      normal: 0, fast: 1, tank: 2, boss: 3, ranged: 4,
    };
    const ENEMY_TYPE_FROM_CODE: Array<'normal' | 'fast' | 'tank' | 'boss' | 'ranged'> = ['normal', 'fast', 'tank', 'boss', 'ranged'];
    // Guest-side lookup from netId → mirrored enemy. Host fills netId on spawn.
    const enemyByNetId = new Map<number, Enemy>();
    let nextEnemyNetId = 1;
    // Guest-side snapshot-interpolation buffers (netId → buffer). Each host
    // enemy snapshot is timestamped on arrival and played back ENEMY_INTERP_
    // DELAY_MS in the past, so mirrored enemies glide at a steady speed between
    // the ~10Hz syncs instead of stuttering toward the latest packet. See
    // SnapshotInterpolator. Host/solo never touch these.
    const enemyInterp = new Map<number, SnapshotInterpolator>();
    const _enemyInterpOut: TransformSample = { x: 0, y: 0, z: 0, yaw: 0 };
    // ── Guest-side host-clock reconstruction for the enemy stream ──
    // The enemy stream has a single sender (the host), so one shared clock
    // offset de-jitters every enemy at once: we map the host's send-time onto
    // our clock (floor-tracked offset) and play back enemies a jitter-sized
    // delay in the past. This is what turns the ~10Hz host stream into smooth,
    // steady enemy motion instead of jitter-warped stutter on the guest.
    let hostClockOffset = 0;          // guestTime ≈ hostSendTime + hostClockOffset
    let hostClockReady = false;
    let hostNetJitter = 0;            // decaying peak-hold of host-stream jitter (ms)
    let enemyRenderDelay = 165;       // adaptive playback delay (ms); seeds at the old fixed value
    let lastEnemySyncAt = 0;          // guest-clock time of the last applied snapshot
    // Minimap throttle — the tactical radar redraws a few times a second, which
    // is plenty for blip motion and keeps the per-frame cost negligible.
    let lastMinimapMs = 0;
    const MINIMAP_INTERVAL_MS = 60;
    const _miniDir = new THREE.Vector3();
    // ── Host enemy-sync stream state ──────────────────────────────────────
    let lastEnemySyncMs = 0;
    const ENEMY_SYNC_INTERVAL_MS = 100;        // ~10 snapshots/sec (was 80)
    const ENEMY_KEYFRAME_INTERVAL_MS = 1000;   // full authoritative set ~1×/sec
    const ENEMY_SYNC_READY_FALLBACK_MS = 4000; // stream anyway if no ready by now
    let lastEnemyKeyframeMs = 0;
    let forceEnemyKeyframe = true;             // first send + each newly-ready guest
    // Last quantized values we transmitted per enemy, so deltas carry only
    // what actually changed. Pruned to live enemies on every keyframe.
    const enemySyncLastSent = new Map<number, EnemyWire>();
    const hostMatchStartMs = Date.now();
    const _zeroVel = new THREE.Vector3(0, 0, 0);

    // ── FAIR-SHARE ENEMY TARGETING (host) ─────────────────────────────────
    // Reused per-frame tables describing the alive players an enemy may
    // engage, plus how many enemies are already assigned to each. Enemies
    // pick a target with load balancing (nearest among the under-capacity
    // players) and stick to it, so no single player gets swarmed while
    // others are ignored. All allocation-free per frame.
    const mpTgtIds: string[] = [];
    const mpTgtX: number[] = [];
    const mpTgtY: number[] = [];
    const mpTgtZ: number[] = [];
    const mpTgtCount: number[] = [];
    const mpTgtIndex = new Map<string, number>();
    let mpDesiredCap = 0;
    const _focusVec = new THREE.Vector3();
    const TARGET_EVAL_MS = 2000; // sticky-target re-evaluation cadence
    const mpAddTarget = (id: string, x: number, y: number, z: number) => {
      const idx = mpTgtIds.length;
      mpTgtIds.push(id);
      mpTgtX[idx] = x; mpTgtY[idx] = y; mpTgtZ[idx] = z; mpTgtCount[idx] = 0;
      mpTgtIndex.set(id, idx);
    };
    // Nearest target that's still under the fair cap; falls back to the
    // nearest overall once everyone is at capacity.
    const pickFairTarget = (epx: number, epz: number): number => {
      let bestUnder = -1, bestUnderSq = Infinity;
      let bestAny = 0, bestAnySq = Infinity;
      for (let t = 0; t < mpTgtIds.length; t++) {
        const dx = epx - mpTgtX[t];
        const dz = epz - mpTgtZ[t];
        const dsq = dx * dx + dz * dz;
        if (dsq < bestAnySq) { bestAnySq = dsq; bestAny = t; }
        if (mpTgtCount[t] < mpDesiredCap && dsq < bestUnderSq) { bestUnderSq = dsq; bestUnder = t; }
      }
      return bestUnder !== -1 ? bestUnder : bestAny;
    };

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
        // Sync the FULL unlocked mask (an idempotent bitwise OR server-side)
        // rather than a single bit, so if one sync is rate-limited the next
        // successful one backfills every achievement earned so far.
        const mask = achievementSystem.getUnlockedMask();
        if (mask) {
          void mergeAchievementsRef.current({ mask }).catch(() => {});
        }
        // Cosmetic Title — auto-equip the first available title the player
        // hasn't equipped yet. Future iterations let the player pick via
        // Profile; this MVP cut just surfaces SOMETHING in the kill feed.
        const earnedTitle = TITLE_FOR_ACHIEVEMENT[achievement.id];
        if (earnedTitle && !equippedTitleRef.current) {
          equippedTitleRef.current = earnedTitle;
          void equipTitleRef.current({ title: earnedTitle }).catch(() => { /* best-effort */ });
        }
      });
    }
    // Career baselines for cumulative achievements (career total = baseline +
    // this run's progress), captured once at run start from the persisted stats.
    const baseSoloKills = playerStatsRef.current?.solo.totalKills ?? 0;
    const baseBestWave = playerStatsRef.current?.solo.highestWave ?? 0;
    // Per-run achievement trackers (reset every run since the effect re-runs).
    let headshotsThisRun = 0;
    let powerUpsThisRun = 0;
    let bossKillsThisRun = 0;     // → goliath / boss_slayer
    let flawlessWavesThisRun = 0; // → flawless_master (Untouchable)
    let tookDamageThisWave = false;
    const recentKillTimes: number[] = [];

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
      // Tutorial is forgiving via slower, sparser enemies (the player can't be
      // hurt here anyway). Health is only lightly reduced — the old 0.6 stacked
      // onto Easy's 0.9 dropped a normal enemy below the rifle's 35 body damage,
      // letting it be one-shot, which read as a bug. 0.85 + the global floor in
      // the spawner keeps a normal enemy at ≥2 body shots.
      diffSettings.healthMult *= 0.85;
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

    // Initialize skill tree data for React. generateRecommendations highlights
    // the strongest affordable, requirement-met picks so the tree guides the
    // player toward a sensible next purchase.
    setSkillTreeData({
      skills: skillTree.getAllSkills(),
      availablePoints: skillTree.getState().availablePoints,
      spentPoints: skillTree.getState().spentPoints,
      totalPoints: skillTree.getState().totalPoints,
      detectedPlayStyle: 'balanced',
      recommendations: skillTree.generateRecommendations(),
    });

    // === ADVANCED DAY-NIGHT CYCLE SYSTEM ===
    // Time of day is host-selected in multiplayer (broadcast to guests and
    // applied via `classicTimeOfDay`) and player-selected in classic; 'auto'
    // runs the continuous day/night cycle in either mode.
    const actualTimeOfDay = classicTimeOfDay;

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

    // Get initial atmospheric settings from day cycle system
    let atmosphericSettings = dayCycleSystem.getSettings(actualTimeOfDay);
    const renderProfile: NonNullable<MapConfig['renderProfile']> = mapConfig.renderProfile ?? {};
    const _blendColorA = new THREE.Color();
    const _blendColorB = new THREE.Color();
    const _darkenColor = new THREE.Color();
    const _renderTint = new THREE.Vector3();

    const blendHexColor = (from: number, to: number, weight: number): number => {
      return _blendColorA.setHex(from).lerp(_blendColorB.setHex(to), THREE.MathUtils.clamp(weight, 0, 1)).getHex();
    };

    const darkenHexColor = (hex: number, scalar: number): number => {
      return _darkenColor.setHex(hex).multiplyScalar(scalar).getHex();
    };

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
    const getSpecialFogDensity = () => blendedFogDensity * (renderProfile.fogDensity ?? 1.0);
    const getMapLightingWeight = () => atmosphericSettings.sunVisible
      ? (renderProfile.atmosphereWeight ?? (mapConfig.hasSpecialWeather ? 0.78 : 0.18))
      : (renderProfile.nightAtmosphereWeight ?? (mapConfig.hasSpecialWeather ? 0.36 : 0.12));
    const getGroundOverride = () => ({
      color: atmosphericSettings.sunVisible ? mapConfig.groundColor : darkenHexColor(mapConfig.groundColor, 0.45),
      emissive: atmosphericSettings.sunVisible ? mapConfig.groundEmissive : darkenHexColor(mapConfig.groundEmissive, 0.5),
      roughness: mapConfig.groundRoughness,
      metalness: mapConfig.groundMetalness,
    });
    const getRenderAtmosphere = (): AtmosphericSettings => {
      const mapWeight = getMapLightingWeight();
      const skyWeight = mapConfig.hasSpecialWeather ? 1.0 : mapWeight * 0.35;
      const fogWeight = mapConfig.hasSpecialWeather ? 1.0 : mapWeight * 0.45;
      const tintScale = atmosphericSettings.sunVisible ? 1.0 : 0.92;
      _renderTint.set(
        THREE.MathUtils.clamp(atmosphericSettings.colorTint.x * tintScale, 0.45, 1.35),
        THREE.MathUtils.clamp(atmosphericSettings.colorTint.y * tintScale, 0.45, 1.35),
        THREE.MathUtils.clamp(atmosphericSettings.colorTint.z * tintScale, 0.45, 1.35),
      );

      return {
        ...atmosphericSettings,
        skyColor: blendHexColor(atmosphericSettings.skyColor, mapConfig.skyColor, skyWeight),
        fogColor: blendHexColor(atmosphericSettings.fogColor, mapConfig.fogColor, fogWeight),
        // Bump non-special-weather fog density 1.7× so distant chunk edges
        // blend smoothly into the sky tone instead of showing as a visible
        // "world ends here" band. The new 5×5 chunk grid loads further out
        // (~350m corner) and this density gives ~30% visibility at 350m —
        // far enough to read action, dense enough to hide pop-in.
        fogDensity: mapConfig.hasSpecialWeather ? getSpecialFogDensity() : atmosphericSettings.fogDensity * 1.7,
        ambientColor: blendHexColor(atmosphericSettings.ambientColor, mapConfig.ambientLightColor, mapWeight),
        ambientIntensity: THREE.MathUtils.lerp(
          atmosphericSettings.ambientIntensity,
          mapConfig.ambientLightIntensity,
          mapWeight,
        ) * (renderProfile.ambientLight ?? 1.0),
        lightColor: blendHexColor(atmosphericSettings.lightColor, mapConfig.directionalLightColor, mapWeight),
        lightIntensity: THREE.MathUtils.lerp(
          atmosphericSettings.lightIntensity,
          mapConfig.directionalLightIntensity,
          mapWeight,
        ) * (renderProfile.directLight ?? 1.0),
        bloomStrength: atmosphericSettings.bloomStrength * (renderProfile.bloomStrength ?? 1.0),
        colorTint: _renderTint,
        saturation: atmosphericSettings.saturation * (renderProfile.saturation ?? 1.0),
        contrast: 1.0 + (atmosphericSettings.contrast - 1.0) * (renderProfile.contrast ?? 1.0),
        exposure: atmosphericSettings.exposure * (renderProfile.exposure ?? 1.0),
      };
    };
    let renderAtmosphere = getRenderAtmosphere();

    // Use dynamic atmospheric settings blended with map config
    scene.fog = new THREE.FogExp2(
      renderAtmosphere.fogColor,
      renderAtmosphere.fogDensity,
    );
    scene.background = new THREE.Color(renderAtmosphere.skyColor);

    // === GRAPHICS QUALITY SYSTEM ===
    const graphicsPreset = gameSettingsManager.getGraphicsPreset();
    const graphicsQuality = gameSettingsManager.getGraphicsQuality();

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
      // Hardware MSAA only matters when the renderer draws geometry straight
      // to the canvas (Low preset). With post-processing on, every pass renders
      // into non-MSAA composer targets and the canvas only receives a fullscreen
      // blit — MSAA there is pure memory-bandwidth waste (SMAA does the AA).
      antialias: graphicsPreset.antialias && !graphicsPreset.postProcessing,
      powerPreference: "high-performance",
      stencil: graphicsPreset.postProcessing,
      depth: true,
      alpha: false,
      // NEVER use the logarithmic depth buffer here: it writes gl_FragDepth in
      // the fragment shader, which disables early-Z rejection on every GPU —
      // with the full-screen terrain shader + heavy vegetation overdraw that
      // costs a fortune. Camera near 0.1 / far ~1300 sits comfortably within
      // standard 24-bit depth precision, so the output is identical.
      logarithmicDepthBuffer: false,
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
      // (Touch devices never use pointer lock — the on-screen controls drive
      // the camera instead.)
      if (gameMode === 'multiplayer' && !touchControls.enabled) {
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
        saturation: renderAtmosphere.saturation,
        contrast: renderAtmosphere.contrast,
        temperature: renderAtmosphere.temperature,
        exposure: renderAtmosphere.exposure,
        bloomStrength: renderAtmosphere.bloomStrength,
        colorTint: renderAtmosphere.colorTint,
        sunDirection: initialSunDirection,
        isNight: !renderAtmosphere.sunVisible,
        godRayStrength: renderProfile.godRayStrength,
        aerialPerspective: renderProfile.aerialPerspective,
        highlightRecovery: renderProfile.highlightRecovery,
        highlightDesaturation: renderProfile.highlightDesaturation,
        vibranceScale: renderProfile.vibrance,
        shadowLiftScale: renderProfile.shadowLift,
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

    // Photo Mode capture: render a fresh frame, then copy the WebGL canvas onto
    // a 2D canvas with the chosen CSS filter baked in (toDataURL/drawImage read
    // raw pixels, not CSS, so the filter must be re-applied here). Reading the
    // buffer synchronously right after the render works without
    // preserveDrawingBuffer (the buffer is valid until the task yields).
    const capturePhotoBlob = (filterCss: string): Promise<Blob | null> => {
      try {
        composePostFX(0);
        const src = renderer.domElement;
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const ctx2d = out.getContext('2d');
        if (!ctx2d) return Promise.resolve(null);
        if (filterCss) ctx2d.filter = filterCss;
        ctx2d.drawImage(src, 0, 0);
        return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
      } catch (err) {
        console.warn('[PhotoMode] capture failed:', err);
        return Promise.resolve(null);
      }
    };
    photoCaptureRef.current = capturePhotoBlob;

    // Check for WebGL errors (with cleanup-safe event handlers)
    const onWebGLContextLost = (event: Event) => {
      event.preventDefault();
      console.error('WebGL context lost!');
    };
    const onWebGLContextRestored = () => {
      // WebGL context restored
    };
    renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);

    // Enhanced RTX-Style Lighting System with Dynamic Day Cycle.
    // Multipliers stay at 1.0 — the DayCycleSystem values are now tuned for
    // the AGX post pipeline, so an extra +20% on top blows out the sky.
    // Ambient at 80% — shadow detail readable but the lit/shadow contrast
    // is dramatic enough to read as proper Cyberpunk "hit-by-sun" lighting.
    const ambientLight = new THREE.AmbientLight(renderAtmosphere.ambientColor, renderAtmosphere.ambientIntensity * 0.8);
    scene.add(ambientLight);

    // Main directional light (Sun/Moon) — cranked 60% above base so direct
    // sunlight drives the PBR specular lobe on the ground for crisp
    // Cyberpunk-style "wet asphalt sun glint" highlights. Combined with
    // the per-pixel normal perturbation in the ground shader, this is the
    // primary visual driver — not emissive, not bloom.
    const mainLight = new THREE.DirectionalLight(renderAtmosphere.lightColor, renderAtmosphere.lightIntensity * 1.6);
    mainLight.position.set(
      renderAtmosphere.lightPosition.x,
      renderAtmosphere.lightPosition.y,
      renderAtmosphere.lightPosition.z
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
    const skyColor = new THREE.Color(renderAtmosphere.skyColor);
    const groundColor = skyColor.clone().multiplyScalar(0.35); // Darker ground reflection
    // Hemisphere provides natural sky-tinted shadow fill. Boosted back to
    // 0.75× so shadow areas keep a cool sky tint and read as "in shadow",
    // not as "missing pixels".
    const skyLight = new THREE.HemisphereLight(
      skyColor.getHex(),
      groundColor.getHex(),
      renderAtmosphere.ambientIntensity * 0.75
    );
    scene.add(skyLight);

    // Soft warm bounce (sun-side) — faked indirect kick that warms the
    // lit ground. Krunker-grade golden-hour feel during day.
    const volumetricLight = new THREE.DirectionalLight(
      renderAtmosphere.sunVisible ? 0xffe8b8 : 0x9ab2e6,
      (renderAtmosphere.sunVisible ? 0.55 : 0.5) * (renderProfile.volumetricLight ?? 1.0)
    );
    volumetricLight.position.set(
      renderAtmosphere.lightPosition.x * 0.5,
      renderAtmosphere.lightPosition.y * 0.8,
      renderAtmosphere.lightPosition.z * 0.5
    );
    scene.add(volumetricLight);
    scene.add(volumetricLight.target);

    // Fill light (opposite side of main light) — bumped so the shadowed
    // side of geometry still reads as fully lit, just cooler. The gun,
    // enemies, and tree trunks on the dark side all benefit.
    const fillLight = new THREE.DirectionalLight(
      renderAtmosphere.sunVisible ? 0xbcd6ff : 0x7a92d2,
      (renderAtmosphere.sunVisible ? 0.55 : 0.7) * (renderProfile.fillLight ?? 1.0)
    );
    fillLight.position.set(
      -renderAtmosphere.lightPosition.x * 0.6,
      renderAtmosphere.lightPosition.y * 0.4,
      -renderAtmosphere.lightPosition.z * 0.6
    );
    scene.add(fillLight);
    scene.add(fillLight.target);

    // Rim/Back light for dramatic silhouettes.
    const rimLight = new THREE.DirectionalLight(
      renderAtmosphere.sunVisible ? 0xffffff : 0xc4d2ff,
      (renderAtmosphere.sunVisible ? 0.55 : 0.8) * (renderProfile.rimLight ?? 1.0)
    );
    rimLight.position.set(
      renderAtmosphere.lightPosition.x * 0.3,
      renderAtmosphere.lightPosition.y * 1.2,
      renderAtmosphere.lightPosition.z
    );
    scene.add(rimLight);
    scene.add(rimLight.target);

    // Additional ambient fill for night visibility — significantly boosted
    // so the night reads as "moody blue dusk" instead of "pitch black hole".
    const nightFillLight = new THREE.AmbientLight(0x5c7ac0, renderAtmosphere.sunVisible ? 0.0 : 1.8);
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
      renderAtmosphere.lightPosition.x,
      renderAtmosphere.lightPosition.y,
      renderAtmosphere.lightPosition.z
    );
    const volumetricLightBaseOffset = mainLightBaseOffset.clone().multiplyScalar(0.5);
    volumetricLightBaseOffset.y = renderAtmosphere.lightPosition.y * 0.8;
    const fillLightBaseOffset = new THREE.Vector3(
      -renderAtmosphere.lightPosition.x * 0.6,
      renderAtmosphere.lightPosition.y * 0.4,
      -renderAtmosphere.lightPosition.z * 0.6
    );
    const rimLightBaseOffset = new THREE.Vector3(
      renderAtmosphere.lightPosition.x * 0.3,
      renderAtmosphere.lightPosition.y * 1.2,
      renderAtmosphere.lightPosition.z
    );

    // ── TERRAIN SHAPE + GROUND-TEXTURE IDENTITY (per map, per run) ─────────
    // A seeded, WORLD-LOCKED height field (TerrainSystem) displaces the ground
    // into rolling hills / dunes / ridges out in the fogged mid-field while
    // keeping a perfectly flat combat disc around the player — so the whole
    // gameplay + VFX layer stays on y == 0 and nothing floats or clips. The
    // seed is fresh each run, so every playthrough gets a distinct landscape.
    const terrainProfile = resolveTerrainProfile(mapConfig);
    const terrainSeed = createTerrainSeed();
    const terrainUniforms = createTerrainUniforms(terrainProfile, terrainSeed);
    const groundSegments = terrainSegments(graphicsPreset.terrainDetail);

    // INFINITE Ground with GPU terrain displacement, dynamic day/night and
    // map-specific colours. The denser segment grid feeds the vertex shader's
    // height displacement so distant hills read smoothly rather than faceted.
    const groundGeometry = new THREE.PlaneGeometry(
      mapConfig.groundSize || 2000, mapConfig.groundSize || 2000,
      groundSegments, groundSegments,
    );
    // Blend map ground colors with day/night variations
    const isDay = renderAtmosphere.sunVisible;
    const initialGroundOverride = getGroundOverride();
    const groundBaseColor = isDay ? mapConfig.groundColor : new THREE.Color(mapConfig.groundColor).multiplyScalar(0.45).getHex();
    const groundEmissive = isDay ? mapConfig.groundEmissive : new THREE.Color(mapConfig.groundEmissive).multiplyScalar(0.5).getHex();
    // ── AAA GROUND: PBR base + full TerrainSystem material ──────────────
    // This MeshStandardMaterial keeps three.js's full PBR + shadow + fog path
    // intact. TerrainSystem.applyGroundTerrainShader (called in onBeforeCompile
    // below) injects the GPU terrain displacement, the ultra-detailed
    // procedural ground texture (macro patches, cavity AO, micro grain, slope
    // talus, per-map sand ripples / snow sparkle / lava cracks / wet puddles)
    // AND a sharp directional sun + Blinn-Phong specular pass. The per-pixel
    // normal is computed analytically from the height field so hills shade
    // correctly while the surface still has tactile micro-relief.
    //
    // Emissive is ZERO during day (lit surfaces glow from strong direct sun,
    // not fake self-illumination). At night a tiny emissive keeps it readable.
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: groundBaseColor,
      flatShading: false,
      emissive: groundEmissive,
      emissiveIntensity: isDay ? 0.0 : 0.12,
      // Tight roughness gives a real specular lobe for the sun — wet/glossy
      // PBR look. Slight metalness pushes the reflection toward warm.
      roughness: initialGroundOverride.roughness ?? 0.52,
      metalness: initialGroundOverride.metalness ?? 0.08,
    });

    // ── Shared uniforms for the injected ground shader ───────────────────
    const groundShaderUniforms = {
      uTime: { value: 0 },
      uSunDirection: { value: initialSunDirection.clone() },
      uSunColor: { value: new THREE.Color(1.0, 0.94, 0.78) },
      uIncidentBoost: { value: (isDay ? 0.12 : 0.04) * (renderProfile.groundSpecular ?? 1.0) },
      uSpecularStrength: { value: (isDay ? 0.42 : 0.14) * (renderProfile.groundSpecular ?? 1.0) },
      uNormalStrength: { value: 0.26 * (renderProfile.groundNormal ?? 1.0) },
      uPatchScale: { value: 0.035 },
      uPatchStrength: { value: 0.18 * (renderProfile.groundPatch ?? 1.0) },
      uIsNight: { value: isDay ? 0.0 : 1.0 },
    };

    // All ground shader injection (terrain displacement + ultra-detailed,
    // map-specific procedural texturing + sharp directional sun) lives in
    // TerrainSystem.applyGroundTerrainShader. It wires BOTH the day-cycle
    // uniforms (updated each frame) and the static per-map terrain uniforms.
    groundMaterial.onBeforeCompile = (shader) => {
      applyGroundTerrainShader(shader, groundShaderUniforms, terrainUniforms);
    };

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;
    scene.add(ground);

    // NOTE: macro height variation (hills / dunes / ridges) is now applied on
    // the GPU in the terrain vertex shader from a world-locked height field,
    // and the matching per-pixel normal is computed analytically there — so no
    // CPU vertex jitter / normal recompute is needed. The flat plane geometry
    // is just the canvas the shader displaces.

    // Update ground position to follow camera seamlessly
    const updateGroundPosition = (playerX: number, playerZ: number) => {
      // Keep ground centered under player for infinite world
      ground.position.x = playerX;
      ground.position.z = playerZ;
    };

    // === ADVANCED SKY DOME SYSTEM ===
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyTopColor = new THREE.Color(renderAtmosphere.skyColor);
    const skyHorizonColor = new THREE.Color(renderAtmosphere.fogColor);
    const skyMaterial = createSkyDomeMaterial(
      skyTopColor,
      skyHorizonColor,
      new THREE.Vector3(
        renderAtmosphere.lightPosition.x,
        renderAtmosphere.lightPosition.y,
        renderAtmosphere.lightPosition.z
      ),
      !renderAtmosphere.sunVisible
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
          new THREE.Color(renderAtmosphere.fogColor),
          new THREE.Vector3(
            renderAtmosphere.lightPosition.x,
            renderAtmosphere.lightPosition.y,
            renderAtmosphere.lightPosition.z
          ),
          (graphicsQuality === 'ultra' ? 0.10 : graphicsQuality === 'high' ? 0.08 : 0.06) *
            (renderProfile.hazeDensity ?? 1.0),
          !renderAtmosphere.sunVisible
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
    //
    // IMPORTANT: the local PMREM (captured from the already-built sky dome +
    // lights above) is lit at the SAME map-specific intensity the HDRI will use,
    // and we adopt the map's profile immediately. That way the very first visible
    // frame is already at final brightness AND tracks the day cycle — the async
    // HDRI swap below then only refines reflection detail at the same intensity,
    // so the lighting no longer visibly "pops in" a few seconds into the game.
    // The network fetch stays fire-and-forget, so load time is unchanged.
    let isSceneDisposed = false;
    let environmentRenderTarget: THREE.WebGLRenderTarget | null = null;
    let hdriEnvironmentProfile: HDRIEnvironmentProfile | null = null;
    const fallbackEnvProfile = getHDRIEnvironmentProfile(selectedMap);
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      environmentRenderTarget = pmrem.fromScene(scene, 0.04);
      scene.environment = environmentRenderTarget.texture;
      hdriEnvironmentProfile = fallbackEnvProfile;
      scene.environmentRotation.y = fallbackEnvProfile.rotationY;
      scene.environmentIntensity = getHDRIEnvironmentIntensity(
        fallbackEnvProfile,
        renderAtmosphere.sunVisible,
        renderAtmosphere.ambientIntensity,
      ) * (renderProfile.environmentIntensity ?? 1.0);
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
          renderAtmosphere.sunVisible,
          renderAtmosphere.ambientIntensity,
        ) * (renderProfile.environmentIntensity ?? 1.0);
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

    // ── GPU-INSTANCED WORLD PROPS ──────────────────────────────────────────
    // Every tree / rock / bush the chunk streamer scatters is absorbed into
    // per-(geometry, material) InstancedMesh batches instead of being added as
    // 1-6 individual scene meshes. Identical pixels, ~50 draw calls instead of
    // thousands — the core fix for the "10-15 FPS even on strong hardware"
    // problem. Props the instancer can't express (grass InstancedMesh fields,
    // anything non-standard) fall back to plain scene.add unchanged.
    const terrainInstancer = new TerrainInstancer(scene);
    // Bumped on EVERY add/remove so spatial-grid rebuilds can't be fooled by
    // an add+remove in the same frame leaving the array length unchanged.
    let terrainVersion = 0;
    const addTerrainObject = (obj: TerrainObject) => {
      if (!terrainInstancer.add(obj.mesh)) scene.add(obj.mesh);
      terrainObjects.push(obj);
      terrainVersion++;
    };
    const removeTerrainObjectAt = (index: number) => {
      const obj = terrainObjects[index];
      if (!terrainInstancer.remove(obj.mesh)) scene.remove(obj.mesh);
      terrainObjects.splice(index, 1);
      terrainVersion++;
    };

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
        addTerrainObject(biomeSystem.createTree(spot.x, spot.z, biome));
      }

      // Generate rocks based on biome density * map multiplier
      const rocksInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.rockDensity * rockDensityMult / 100);
      for (let i = 0; i < rocksInChunk; i++) {
        const spot = findFreeSpot(startX, startZ, 2.2);
        if (!spot.ok) continue; // Skip if no clear space — avoids overlapping rocks
        addTerrainObject(biomeSystem.createRock(spot.x, spot.z, biome));
      }

      // Generate occasional boulders (more common in rocky maps)
      if (Math.random() > (0.7 / rockDensityMult)) {
        const spot = findFreeSpot(startX, startZ, 4);
        if (spot.ok) {
          addTerrainObject(biomeSystem.createBoulder(spot.x, spot.z, biome));
        }
      }

      // Generate bushes based on biome density * map multiplier
      const bushesInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.bushDensity * bushDensityMult / 100);
      for (let i = 0; i < bushesInChunk; i++) {
        const x = startX + Math.random() * CHUNK_SIZE;
        const z = startZ + Math.random() * CHUNK_SIZE;
        addTerrainObject(biomeSystem.createBush(x, z, biome));
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
          addTerrainObject(specialFeature);
          if (specialFeature.type === 'water' && specialFeature.mesh instanceof THREE.Mesh) {
            waterBodies.push(specialFeature.mesh);
          }
        }
      }

      // Lush instanced grass — one draw call per chunk, biome-tinted, with
      // a shader wind sway. Streams in/out with the chunk like other terrain.
      // (Already an InstancedMesh, so the instancer falls back to scene.add.)
      const grassField = biomeSystem.createGrassField(
        startX, startZ, CHUNK_SIZE, biome, graphicsPreset.terrainDetail,
      );
      if (grassField) {
        addTerrainObject(grassField);
      }

      // Update ground color based on biome in this area
      biomeSystem.updateGroundMaterial(ground, biome, getGroundOverride());
    };

    const updateWorldGeneration = (playerX: number, playerZ: number) => {
      const chunkX = Math.floor(playerX / CHUNK_SIZE);
      const chunkZ = Math.floor(playerZ / CHUNK_SIZE);

      // Load chunks around player. 5×5 grid (was 3×3) so the visible world
      // extends ~2.5 chunks in every direction instead of 1.5 — combined
      // with the tightened fog below, the player can never see the edge
      // of the streamed terrain. The fog density was bumped 25 % in
      // getRenderAtmosphere so the new far chunks blend smoothly into the
      // sky tone instead of revealing the missing 6th-chunk band.
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          generateChunk(chunkX + dx, chunkZ + dz);
        }
      }

      // Remove distant terrain objects to save memory. Cull radius scaled
      // with the wider load grid so we don't pay the streaming cost of
      // re-generating chunks the player has only just walked past.
      const cullRadius = CHUNK_SIZE * 6;
      for (let i = terrainObjects.length - 1; i >= 0; i--) {
        const obj = terrainObjects[i];
        const dxC = obj.x - playerX;
        const dzC = obj.z - playerZ;
        if (dxC * dxC + dzC * dzC > cullRadius * cullRadius) {
          removeTerrainObjectAt(i);
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
    // ── OBSTACLE TRAVERSAL TUNING ──
    // STEP_OVER: anything this short (pebbles, kerbs, low debris) is simply
    //   walked over — never blocks movement, no jump needed.
    // CLIMB_MAX: the tallest obstacle the player can land and stand ON TOP of.
    //   Rocks/boulders up to this height become platforms you can hop onto and
    //   stroll across; taller ones stay solid walls. (Trees use height 99.)
    //   Raised 2.8 → 4.0 so the big rocks/boulders (heights 3–4) become
    //   traversable platforms — the player can now hop onto and over them
    //   instead of being walled off. The higher jump (above) reaches these even
    //   on a heavy loadout. Enemies are unaffected (they pass feetY=-1 and keep
    //   pathing around everything taller than STEP_OVER).
    const STEP_OVER_HEIGHT = 0.7;
    const CLIMB_MAX_HEIGHT = 4.0;

    // Collision queries run through the terrain spatial grid (declared with
    // the other grids further down; safe to reference here because these
    // helpers are only ever CALLED from the game loop). The grid query radius
    // must cover the largest collidable obstacle radius so a big boulder whose
    // centre sits in a neighbouring cell is still tested.
    const COLLISION_QUERY_RADIUS = 12;

    const checkTerrainCollision = (newX: number, newZ: number, playerY?: number): boolean => {
      const feetY = playerY === undefined ? -1 : playerY - currentCameraHeight;
      rebuildTerrainGridIfStale();
      const nearby = terrainGrid.queryRadius(newX, newZ, COLLISION_QUERY_RADIUS);
      for (let n = 0; n < nearby.length; n++) {
        const obj = terrainObjects[nearby[n]];
        if (!obj || !obj.collidable) continue;
        const h = obj.height;
        if (h !== undefined) {
          // Tiny obstacle → step straight over it (no collision at all).
          if (h <= STEP_OVER_HEIGHT) continue;
          // Feet at/above the top → the player is jumping over it or standing
          // on it, so let them move freely across.
          if (feetY > h - 0.05) continue;
        }
        const dx = newX - obj.x;
        const dz = newZ - obj.z;
        if (dx * dx + dz * dz < obj.radius * obj.radius) {
          return true; // Collision detected
        }
      }
      return false;
    };

    // Highest surface the player is standing on at (x,z): 0 = ground, or the top
    // of a climbable rock/boulder they're above. Lets the player perch on and
    // walk across low obstacles instead of clipping through them. `feetY` gates
    // it so brushing the side of a rock at ground level never snaps you upward.
    const supportHeightAt = (x: number, z: number, feetY: number): number => {
      let top = 0;
      rebuildTerrainGridIfStale();
      const nearby = terrainGrid.queryRadius(x, z, COLLISION_QUERY_RADIUS);
      for (let n = 0; n < nearby.length; n++) {
        const obj = terrainObjects[nearby[n]];
        if (!obj || !obj.collidable || obj.height === undefined) continue;
        if (obj.height <= STEP_OVER_HEIGHT || obj.height > CLIMB_MAX_HEIGHT) continue;
        if (feetY < obj.height - 0.6) continue; // not high enough to be on top
        const dx = x - obj.x;
        const dz = z - obj.z;
        if (dx * dx + dz * dz <= obj.radius * obj.radius && obj.height > top) {
          top = obj.height;
        }
      }
      return top;
    };

    // Push the player out of any collidable obstacle they are overlapping at
    // their current feet height. This recovers from edge cases the move-time
    // collision check can't prevent — e.g. landing on top of a rock after
    // jumping over it, then descending into its volume.
    const resolveTerrainPenetration = () => {
      const feetY = camera.position.y - currentCameraHeight;
      rebuildTerrainGridIfStale();
      const nearby = terrainGrid.queryRadius(camera.position.x, camera.position.z, COLLISION_QUERY_RADIUS);
      for (let n = 0; n < nearby.length; n++) {
        const obj = terrainObjects[nearby[n]];
        if (!obj || !obj.collidable) continue;
        const h = obj.height;
        if (h !== undefined) {
          if (h <= STEP_OVER_HEIGHT) continue;       // stepped over — never penetrating
          if (feetY > h - 0.05) continue;            // on top / cleared — don't shove off
        }
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

    // === EXPLOSIVE BARRELS ===
    // Scatter red barrels across the map. Density per-map (MapConfig).
    // Bullet hit → AOE damage to everything within blastRadius (player +
    // enemies). Tactical pop: kite a tank into one for a free wipe.
    const barrelDensity = mapConfig.barrelDensity ?? 0.35;
    const barrelCount = Math.round(barrelDensity * 30); // 0–30 across the world
    const barrels: ExplosiveBarrel[] = barrelCount > 0
      ? spawnBarrels(scene, barrelCount, overlapsTerrain, 240)
      : [];

    // === RANGED SENTINELS (NEW ENEMY ARCHETYPE — TURRETS) ===
    // Stationary laser turrets sprinkled across the map. After a brief
    // charge-up they shoot the player from afar — adds pressure to keep
    // moving, rewards prioritising distant threats. Skipped in tutorial
    // mode AND easy mode (players are still learning the basics). Count
    // scales with difficulty so the harder presets actually feel harder.
    // Multiplayer guests mirror the host's sentinels visually but the host
    // owns the firing.
    const sentinelCount = isTutorialMode ? 0
      : classicDifficulty === 'easy' ? 0
      : classicDifficulty === 'medium' ? 2
      : classicDifficulty === 'hard' ? 4
      : 3; // adaptive
    const sentinels: RangedSentinel[] = sentinelCount > 0
      ? spawnRangedSentinels(scene, sentinelCount, overlapsTerrain, 220)
      : [];
    let sentinelIntroFired = false; // First-encounter intro banner fires once.
    let rangedEnemyIntroFired = false;

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
          removeTerrainObjectAt(i);
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
    let shieldGlassMat!: THREE.MeshStandardMaterial;
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

      // Clear ballistic panel — glossy, see-through polycarbonate. Uses
      // MeshStandardMaterial (not Physical/clearcoat) on purpose: the heavy
      // physical über-shader stalled the first shield raise while its program
      // compiled, and the glassy look reads fine from a low-opacity standard
      // panel with a bright emissive tint + low roughness.
      shieldGlassMat = new THREE.MeshStandardMaterial({
        color: 0xbfe0ff, transparent: true, opacity: 0.16,
        roughness: 0.08, metalness: 0.0,
        emissive: 0x3aa0ff, emissiveIntensity: 0.18,
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
    // local player gets clear feedback. Delegated to GunModel.setPhantom so the
    // cloak state survives weapon switches (the gun re-syncs every rebuild) and
    // never gets stuck transparent on the shared material cache.
    const applyPhantomVisual = (active: boolean) => {
      gunModel.setPhantom(active);
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

    // === RUN MODIFIER (single-run mutator) ===
    // Read once on scene init. The modifier is locked for the whole run so
    // the per-frame loop doesn't have to keep checking. `runModifier` may be
    // null (the player picked "Play without").
    const runModifierId = activeRunModifierRef.current;
    const runModifier = runModifierId ? RUN_MODIFIERS[runModifierId] : null;
    const runMods = runModifier?.mods ?? {};
    const runModifierScoreMult = runModifier?.scoreMult ?? 1.0;

    // === WEAPON MASTERY (per-run XP tracker → throttled flush to convex) ===
    // Keeps an accumulator per weapon. The accumulator counts kills made
    // with each weapon during the run; we periodically flush the delta to
    // convex/addWeaponMasteryXp (server caps deltas + total). The current
    // weapon's level + bonus snapshot are cached in `masteryBonus` and
    // refreshed when XP changes or weapon switches.
    const masteryRunXp: Record<string, number> = {};
    const masteryLastSentXp: Record<string, number> = {};
    let masteryFlushAccum = 0;
    let masteryBonus: MasteryBonus = bonusForLevel(0);
    // Initial XP comes from the persisted record on the convex side. We
    // read it once via the React profile data outside the useEffect; the
    // initial bonus snapshot is taken below once `currentWeapon` is set.
    const masteryPersistedXpRef = persistedWeaponMasteryRef.current;
    const masteryTotalXp = (weapon: string): number =>
      (masteryPersistedXpRef[weapon] ?? 0) + (masteryRunXp[weapon] ?? 0);
    const refreshMasteryBonus = () => {
      masteryBonus = bonusForLevel(levelFromXp(masteryTotalXp(currentWeapon)));
    };
    const flushMasteryXp = () => {
      for (const weapon in masteryRunXp) {
        const accumulated = masteryRunXp[weapon];
        const previouslySent = masteryLastSentXp[weapon] ?? 0;
        const delta = accumulated - previouslySent;
        if (delta <= 0) continue;
        masteryLastSentXp[weapon] = accumulated;
        void addWeaponMasteryXpMutation({ weaponId: weapon, xpDelta: delta })
          .catch(() => { /* best-effort */ });
      }
    };

    // === DAILY CHALLENGE TRACKER ===
    // Per-run cumulative counts for every challenge event channel. Flushed
    // to convex every ~3 s for the relevant channel — the server stores the
    // max so a duplicate flush can't double-count. Disabled in tutorial
    // mode (no chargeable kills) and in multiplayer (multiplayer kills go
    // through a separate scoring path).
    const dailyEnabled = !isTutorialMode && !isMultiplayer && isAuthenticated;
    const dailyChallengeId = dailyEnabled ? getTodayChallengeId() : null;
    const dailyChannel = dailyChallengeId ? DAILY_CHALLENGES[dailyChallengeId].event : null;
    const dailyCounts = { kill: 0, wave: 0, headshot: 0, flawless_wave: 0, pistol_kill: 0 };
    let dailyFlushAccum = 0;
    let dailyLastSentValue = 0;
    const dailyFlush = () => {
      if (!dailyChallengeId || !dailyChannel) return;
      const value = dailyCounts[dailyChannel];
      if (value === dailyLastSentValue) return;
      dailyLastSentValue = value;
      // Fire-and-forget; the mutation handles auth + reconciliation.
      void recordDailyProgressMutation({
        challengeId: dailyChallengeId,
        progress: value,
      }).catch(() => { /* best-effort — local play is unaffected */ });
    };

    // === CHARACTER IDENTITY (class → passive + ability + shadow) ===
    // Every character ships with a mechanical passive (Heavy → +20% HP, Medic
    // → 0.5 HP/s regen, etc.) AND a signature active ability. The class is the
    // lobby pick in multiplayer, and the Solo/Tutorial character selector
    // otherwise — so the SAME identity drives every game mode. Snapshot the
    // class once here; the per-frame loop stacks the passive on top of the
    // skill-tree + wave-perk + run-modifier bonuses, and the ability dispatch
    // reads `activeAbility`.
    const activeClassId: ClassId = (isMultiplayer && multiplayerManager
      ? (multiplayerManager.getLocalPlayer().modelClass as ClassId | undefined)
      : selectedCharacterRef.current) ?? 'ranger';
    const activeAbility = getCharacterAbility(activeClassId);
    // `mpMods` name retained for the many downstream stat-stack sites; it now
    // applies the selected character's passive in EVERY mode, not just MP.
    const mpMods = CHARACTER_PASSIVES[activeClassId]?.mods ?? {};

    // Game state. Ammo starts at the pistol's max-ammo cap, with the
    // One-in-the-Chamber modifier (if active) clamping it to 1.
    let health = 100;
    let ammo = runMods.startAmmoMax ?? 12;
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
    // === WAVE-END CHOICE CARD PERKS (single-run, additive) ===
    // The player banks a perk after every wave-clear (see the picker logic
    // around `setPerkOffer`). `runPerks` is the ordered stack; `perkBonuses`
    // is the per-frame snapshot read by every hot call-site (fire rate,
    // damage, dash CD, pickup radius, etc.) — recomputed only when picks
    // change so the RAF loop pays one struct read, not 15.
    const runPerks: WavePerkId[] = [];
    let perkBonuses: PerkBonuses = { ...NEUTRAL_PERK_BONUSES };
    let perkRegenAccum = 0; // partial-HP carry for the regen-per-second perk
    // Some perks have a one-shot moment-of-pick effect (max HP grant) on top
    // of their ongoing snapshot contribution. Run them once when picked.
    const applyPerkInstantEffects = (picked: WavePerkId) => {
      if (picked === 'max_hp_25') {
        playerMaxHealth += 25;
        health = Math.min(playerMaxHealth, health + 25);
      }
      if (picked === 'max_ammo_50') {
        // Top off the current mag immediately so the pick feels live.
        ammo = Math.min(Math.round(WEAPONS[currentWeapon].maxAmmo * perkBonuses.maxAmmoMult), ammo + 30);
      }
    };
    // Skill maxHealth + Run-Modifier max-HP multiplier (Berserker halves,
    // Glass Cannon quarters) + MP character passive (Heavy → +20%). Floor at
    // 10 HP so we never spawn with zero.
    let playerMaxHealth = Math.max(
      10,
      Math.floor((100 + (skillBonuses['maxHealth'] || 0)) * (runMods.playerMaxHpMult ?? 1) * (mpMods.maxHpMult ?? 1)),
    );
    // Start every run at FULL health — including the Thick Skin bonus. Without
    // this, a player who has invested in Thick Skin would spawn at 100/<max>
    // (e.g. 100/130) instead of full, because `health` was hard-coded to 100.
    health = playerMaxHealth;
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

    // ── POWER-UP MESSAGE MANAGER ─────────────────────────────────────────
    // Single owner for the bottom-centre announcement pill. Every caller used
    // to pair setPowerUpMessage with its own anonymous setTimeout — overlapping
    // messages let an OLD timer wipe a NEWER message early, and the
    // character-ability path ('Firestorm!', 'Adrenaline', …) never scheduled a
    // clear at all, leaving a PERMANENT popup on screen for the rest of the
    // run. One managed timer, always scoped to the newest message.
    let powerMsgTimer: number | null = null;
    const showPowerMessage = (msg: string, ms = 2000) => {
      setPowerUpMessage(msg);
      if (powerMsgTimer !== null) window.clearTimeout(powerMsgTimer);
      powerMsgTimer = window.setTimeout(() => {
        powerMsgTimer = null;
        setPowerUpMessage('');
      }, ms);
    };

    // Check and unlock weapons based on score
    const checkWeaponUnlocks = () => {
      let newUnlock = false;
      Object.keys(WEAPONS).forEach(weaponKey => {
        const weapon = WEAPONS[weaponKey];
        if (score >= weapon.unlockScore && !unlockedWeapons.includes(weaponKey)) {
          unlockedWeapons.push(weaponKey);
          showPowerMessage(`${weapon.name} Unlocked`, 3000);
          newUnlock = true;
        }
      });
      if (newUnlock) achievementSystem.setProgress('arsenal', unlockedWeapons.length);
      return newUnlock;
    };

    // Effects arrays
    const muzzleFlashes: MuzzleFlash[] = [];
    const bulletTracers: BulletTracer[] = [];
    const impactEffects: ImpactEffect[] = [];
    const robotSparks: RobotHitSparks[] = [];
    const explosionEffects: ExplosionEffect[] = [];

    // ── Decapitation gibs ────────────────────────────────────────────────
    // A powerful headshot kill (sniper / launcher-tier weapons) pops the
    // enemy's head clean off: we hide the real (pooled) head, clone it into a
    // free-flying gib that arcs, bounces and tumbles, then fades. The clone
    // SHARES the head's geometry + material (no GPU re-upload), so it's cheap.
    interface HeadGib { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; restY: number; }
    const headGibs: HeadGib[] = [];
    const MAX_HEAD_GIBS = 10;

    // Camera shake system
    let cameraShakeIntensity = 0;
    const cameraShakeDecay = 0.9;

    // Game objects
    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    // Enemy projectiles — fired by ranged "sniper" enemies. Distinct from
    // player bullets so the bullet-vs-enemy collision path can't accidentally
    // tag them and the bullet-vs-player path is local-only (no MP sync).
    interface EnemyBullet {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      damage: number;
      life: number; // frames until auto-cull
    }
    const enemyBullets: EnemyBullet[] = [];
    const _enemyBulletGeo = new THREE.SphereGeometry(0.12, 10, 8);
    const _enemyBulletMat = new THREE.MeshBasicMaterial({
      color: 0x6effff,
      toneMapped: false,
      fog: false,
    });
    const _enemyBulletGlowGeo = new THREE.SphereGeometry(0.28, 10, 8);
    const _enemyBulletGlowMat = new THREE.MeshBasicMaterial({
      color: 0x55c5d6,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
    const powerUps: PowerUp[] = [];
    const particles: Particle[] = [];

    // ── Shell casings (lightweight physics debris) ──
    // Tiny brass cylinders flung from the gun on each shot. They arc under
    // gravity, bounce off the ground with friction + tumble, then shrink away.
    // A hard cap (oldest removed first) keeps rapid fire from spawning unbounded
    // meshes. One shared geo+material so the whole effect costs almost nothing.
    interface ShellCasing { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; }
    const shellCasings: ShellCasing[] = [];
    const MAX_CASINGS = 40;
    const casingGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.12, 6);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xd9a441, metalness: 0.95, roughness: 0.3, emissive: 0x2a1a00, emissiveIntensity: 0.35,
    });
    const _casRight = new THREE.Vector3();
    const _casFwd = new THREE.Vector3();
    const ejectShellCasing = () => {
      if (shellCasings.length >= MAX_CASINGS) {
        const old = shellCasings.shift();
        if (old) scene.remove(old.mesh);
      }
      _casRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _casFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const m = new THREE.Mesh(casingGeo, casingMat);
      m.position.copy(camera.position)
        .addScaledVector(_casRight, 0.32)
        .addScaledVector(_casFwd, 0.55);
      m.position.y -= 0.22;
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(m);
      const vel = _casRight.clone().multiplyScalar(1.7 + Math.random() * 0.9);
      vel.y = 2.1 + Math.random() * 1.1;
      vel.addScaledVector(_casFwd, (Math.random() - 0.5) * 0.7);
      shellCasings.push({
        mesh: m,
        vel,
        spin: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        life: 2.4,
      });
    };

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
    // multiplayer; the model class is the player's lobby pick in MP, the
    // Solo/Tutorial character selector otherwise — each class has a distinct
    // silhouette, so every character casts a recognisably different shadow.
    const localColor = (isMultiplayer && multiplayerManager
      ? multiplayerManager.getLocalPlayer().color
      : activeAbility.shadowColor);
    const localPlayerShadow = new LocalPlayerShadow(scene, {
      modelClass: activeClassId,
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
    const createEnemy = (x: number, z: number, type: 'normal' | 'fast' | 'tank' | 'boss' | 'ranged' = 'normal'): Enemy | null => {
      // === SMART ENEMY MANAGER: Acquire pooled mesh ===
      // This uses shared geometries/materials and object pooling for optimal performance

      // Get the scale for this enemy type (must match SmartEnemyManager ENEMY_CONFIGS)
      const bodyScale = type === 'fast' ? 0.7 : type === 'tank' ? 1.5 : type === 'boss' ? 2.0 : type === 'ranged' ? 1.05 : 1.0;
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
        case 'ranged':
          // Sniper — moves slowly, shoots from range. Lower HP than a
          // normal so the player is rewarded for prioritising them; score
          // is bumped because they're a real threat.
          enemyHealth = 40;
          enemySpeed = 0.05;
          enemyDamage = 14;   // per energy bolt
          enemyScore = 28;
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
      else if (type === 'ranged') personality = 'support'; // hangs back, kites

      // Create AI systems
      const aiBehavior = new AIBehaviorSystem(personality);
      const perception = new EnemyPerception(
        500, // Vision range - VERY LARGE so enemies always see player
        Math.PI * 2, // Vision angle - 360 degrees (see all around)
        type === 'boss' ? 100 : 80, // Hearing range
        1.5 // Hearing sensitivity - increased
      );
      // AttackSystem only knows the melee archetypes; ranged enemies don't
      // actually use this melee path (their bolt-firing logic is per-frame
      // in animate). Map 'ranged' onto 'normal' here so the type checks out
      // and the instance is constructed; the runtime call sites skip it.
      const attackArchetype: 'normal' | 'fast' | 'tank' | 'boss' = type === 'ranged' ? 'normal' : type;
      const attackSystemInstance = new AttackSystem(
        AttackSystem.createConfigForType(attackArchetype, enemyDamage * diffSettings.damageMult * (runMods.enemyDamageMult ?? 1))
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

      // Floor the combined health scale so no stacking of multipliers (notably
      // the tutorial's reductions on top of Easy) can ever drop an enemy low
      // enough to be one-shot by a standard rifle BODY shot (35 dmg). At 0.8 a
      // normal enemy (50 base) is ≥40 HP → always needs ≥2 body shots. This is a
      // no-op in normal play (Easy is 0.9, the lowest, already above the floor),
      // so it only protects the tutorial / future low-multiplier cases.
      const effectiveHealth = enemyHealth * Math.max(0.8, diffSettings.healthMult * healthMultiplier) * (runMods.enemyHealthMult ?? 1);

      return {
        mesh: enemyGroup,
        health: effectiveHealth,
        maxHealth: effectiveHealth,
        speed: (enemySpeed + Math.random() * 0.02) * diffSettings.speedMult * (runMods.enemySpeedMult ?? 1),
        dead: false,
        type,
        damage: enemyDamage * diffSettings.damageMult * (runMods.enemyDamageMult ?? 1),
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

    // ── Airdrop glow light ────────────────────────────────────────────────
    // ONE permanent, scene-parented PointLight handed to the killstreak airdrop
    // system. Previously each landed crate scene.add()'d its own PointLight,
    // recompiling every material the first time an airdrop dropped — the lag the
    // user reported. Pre-allocated here (counted during warmup's shader
    // compile), the airdrop system only moves it + toggles intensity.
    const airdropGlowLight = new THREE.PointLight(0xffffff, 0, 13);
    airdropGlowLight.castShadow = false;
    scene.add(airdropGlowLight);
    enhancedPowerUps.setGlowLight(airdropGlowLight);

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

    // ── Explosion PointLight pool ────────────────────────────────────
    // The rocket launcher + barrel blasts used to scene.add() a fresh
    // PointLight per explosion (and fade it via setTimeout), recompiling
    // every material in the world each time — the reported explosion lag.
    // A small pool of 4 covers overlapping rocket hits and barrel chains;
    // ExplosionEffect borrows a slot and fades it in the animate loop.
    const EXPLOSION_LIGHT_POOL_SIZE = 4;
    const explosionLightPool: { light: THREE.PointLight; inUse: boolean }[] = [];
    for (let _el = 0; _el < EXPLOSION_LIGHT_POOL_SIZE; _el++) {
      const el = new THREE.PointLight(0xff8a3a, 0, 38);
      el.castShadow = false;
      scene.add(el);
      explosionLightPool.push({ light: el, inUse: false });
    }
    setExplosionLightPool(
      () => {
        for (const slot of explosionLightPool) {
          if (!slot.inUse) { slot.inUse = true; return slot.light; }
        }
        return null;
      },
      (light) => {
        if (!light) return;
        for (const slot of explosionLightPool) {
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
    // ── Map-specific spawn & engagement reach ────────────────────────────
    // These two MapConfig fields were defined per-map but never wired into
    // gameplay, so every map spawned and engaged identically. Now open maps
    // (desert, tundra) push spawns and AI engagement out to their long
    // sightlines, while dense/murky maps (swamp) pull the fight in close — so
    // maps play differently, not just look different. enemySpawnRadiusMult is
    // applied uniformly to BOTH spawn and recycle distance so the two never
    // cross (a freshly spawned enemy is never instantly recycled).
    const mapSpawnReach = mapConfig.enemySpawnRadiusMult || 1.0;
    const mapVisibilityReach = mapConfig.visibilityMult || 1.0;

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

    // ── TUTORIAL ENEMY DIRECTOR ───────────────────────────────────────────
    // Tutorial mode has no wave progression, so the wave-gated variety logic
    // below never fires — every foe would be a plain 'normal'. The director
    // fixes that by progressively unlocking the FULL enemy roster as the player
    // racks up kills, announcing each new species with a "New Threat" banner so
    // the tutorial doubles as a hands-on bestiary. Types are then drawn from the
    // unlocked pool with weights tuned to stay varied without overwhelming a
    // newcomer. The boss is the scripted finale.
    type EnemyKind = 'normal' | 'fast' | 'tank' | 'boss';
    interface TutorialTier {
      type: EnemyKind;
      killsToUnlock: number;
      weight: number;       // relative spawn frequency once unlocked
      intro: Omit<EnemyIntro, 'id'> | null; // null = starter, no banner
    }
    const TUTORIAL_TIERS: TutorialTier[] = [
      {
        type: 'normal', killsToUnlock: 0, weight: 5, intro: null,
      },
      {
        type: 'fast', killsToUnlock: 3, weight: 4,
        intro: {
          name: 'Stalker', tag: 'FAST · FRAGILE',
          blurb: 'Sprints straight at you but folds fast. Strafe, track it and tap once.',
          accent: '#22d3ee', icon: 'wind',
        },
      },
      {
        type: 'tank', killsToUnlock: 7, weight: 2,
        intro: {
          name: 'Brute', tag: 'ARMORED · SLOW',
          blurb: 'Soaks a lot of damage. Aim for the head, back up, and keep firing.',
          accent: '#f59e0b', icon: 'shield',
        },
      },
      {
        type: 'boss', killsToUnlock: 12, weight: 1,
        intro: {
          name: 'Warden', tag: 'APEX · DEADLY',
          blurb: 'A towering apex predator. Dash to dodge, grab a power-up and unload.',
          accent: '#ef4444', icon: 'crown',
        },
      },
    ];
    let tutorialTiersUnlocked = 1;          // normal is available from the start
    let queuedTutorialType: EnemyKind | null = null; // forces the next spawn's type
    let nextIntroId = 1;

    // Weighted pick from the currently-unlocked tutorial roster.
    const pickTutorialEnemyType = (): EnemyKind => {
      if (queuedTutorialType) {
        const q = queuedTutorialType;
        queuedTutorialType = null;
        return q;
      }
      const pool = TUTORIAL_TIERS.slice(0, tutorialTiersUnlocked);
      const total = pool.reduce((s, tier) => s + tier.weight, 0);
      let r = Math.random() * total;
      for (const tier of pool) {
        r -= tier.weight;
        if (r <= 0) return tier.type;
      }
      return 'normal';
    };

    // Called after every tutorial kill — unlocks any tiers the player has earned
    // and fires the "New Threat" banner + a guaranteed spawn of the new species.
    const updateTutorialRoster = (kills: number) => {
      while (
        tutorialTiersUnlocked < TUTORIAL_TIERS.length &&
        kills >= TUTORIAL_TIERS[tutorialTiersUnlocked].killsToUnlock
      ) {
        const tier = TUTORIAL_TIERS[tutorialTiersUnlocked];
        tutorialTiersUnlocked++;
        queuedTutorialType = tier.type; // next spawn shows off the newcomer
        if (tier.intro) {
          setEnemyIntro({ ...tier.intro, id: nextIntroId++ });
          soundManager.play('powerUp', 0.5, false, 0.85);
          if (gameSettingsManager.getSetting('killFeed')) {
            addKillFeedEntry(`New Threat — ${tier.intro.name}`, 'wave');
          }
        }
      }
    };

    const spawnEnemyBatch = (count: number, typeOverride?: 'normal' | 'fast' | 'tank' | 'boss' | 'ranged', miniBoss = false): number => {
      const adaptiveMax = smartEnemyManager.getCurrentMaxEnemies();
      const hardish = classicDifficulty === 'hard' || classicDifficulty === 'adaptive';
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        if (enemies.length >= adaptiveMax || !smartEnemyManager.canSpawnMore()) break;
        let type: 'normal' | 'fast' | 'tank' | 'boss' | 'ranged' = typeOverride ?? 'normal';
        if (!typeOverride) {
          if (isTutorialMode) {
            // Tutorial draws from the director's progressively-unlocked roster.
            type = pickTutorialEnemyType();
          } else {
            const rand = Math.random();
            // Ranged sniper joins from wave 4. Probability ramps with wave
            // so by wave 10 ~20% of spawns are ranged on Hard, ~14% on
            // Easy/Medium. Counts BEFORE the other archetype rolls so the
            // ranged threat is felt even when tanks/bosses are in the mix.
            if (wave >= 4 && rand < (hardish ? 0.20 : 0.14)) {
              type = 'ranged';
              if (!rangedEnemyIntroFired && !isTutorialMode) {
                rangedEnemyIntroFired = true;
                setEnemyIntro({
                  id: Date.now(),
                  name: 'Sniper',
                  tag: 'RANGED · TELEGRAPHED BOLT',
                  blurb: 'Cyan crystal rifle. Strafe before the muzzle blooms — block their LOS with cover.',
                  accent: '#6effff',
                  icon: 'crosshair',
                });
                soundManager.play('powerUp', 0.6, false, 1.4);
              }
            }
            else if (wave >= 5 && rand < (hardish ? 0.12 : 0.08)) type = 'boss';
            else if (wave >= 3 && rand < (hardish ? 0.32 : 0.24)) type = 'tank';
            else if (wave >= 2 && rand < (hardish ? 0.5 : 0.42)) type = 'fast';
          }
        }
        // Bosses are bigger (scale 2.0) so they need a wider clearance.
        const enemyRadius = type === 'boss' ? 2.0 : type === 'tank' ? 1.6 : 1.2;
        const baseDist = (42 + Math.random() * 26) * mapSpawnReach;
        const spot = findEnemySpawnSpot(baseDist, enemyRadius);
        const enemy = createEnemy(spot.x, spot.z, type);
        if (enemy) {
          // Mini-Boss elevation: quadruple HP, mark the flag, and slap a
          // bright yellow "crown" emissive sphere above the head so the
          // player can pick it out of the wave at a glance.
          if (miniBoss) {
            enemy.isMiniBoss = true;
            enemy.health *= 4;
            enemy.maxHealth *= 4;
            const crownGeo = new THREE.SphereGeometry(0.45, 12, 10);
            const crownMat = new THREE.MeshBasicMaterial({
              color: 0xfbbf24,
              toneMapped: false,
              fog: false,
            });
            const crown = new THREE.Mesh(crownGeo, crownMat);
            crown.position.y = (enemy.head?.position.y ?? 1.9) + 0.9;
            crown.userData.cannotReceiveAO = true;
            enemy.mesh.add(crown);
          }
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
      waveEnemiesRemaining = Math.max(4, Math.floor((7 + wave * 3) * diffSettings.spawnMult * (runMods.enemySpawnMult ?? 1)));
      const opening = Math.min(5, waveEnemiesRemaining);
      waveEnemiesRemaining -= spawnEnemyBatch(opening);
      // ── MINI-BOSS every 5 waves ─────────────────────────────────────
      // Wave % 5 spawns a beefed-up tank flagged isMiniBoss. The mini-boss
      // is treated like a regular kill for wave-clear math (counts toward
      // waveEnemiesRemaining via spawnEnemyBatch's pool slot). Skipped on
      // wave 10/20/etc. when a full boss is already in the mix.
      if (wave > 0 && wave % 5 === 0 && wave % 10 !== 0) {
        const spawned = spawnEnemyBatch(1, 'tank', true);
        if (spawned > 0) {
          setEnemyIntro({
            id: Date.now(),
            name: 'Crowned Elite',
            tag: 'MINI-BOSS · 4× HP',
            blurb: 'A reinforced tank wearing a crown. Stack damage; it can take a beating.',
            accent: '#fbbf24',
            icon: 'crown',
          });
          // Audio cue so the player KNOWS something has changed even if
          // they're not looking at the banner spot.
          soundManager.play('powerUp', 0.85, false, 0.85);
        }
      }
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
      // Tutorial keeps a brisker cadence than Easy so there's always a fresh
      // target to practise on — learning is more fun when the arena stays lively.
      const spawnInterval = isTutorialMode ? 2600 : spawnSettings.interval;
      if (currentTime - lastSpawnTime <= spawnInterval) return;
      if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies() || !smartEnemyManager.canSpawnMore()) return;

      if (isTutorialMode) {
        // Tutorial — endless lively stream so there's always something to fight,
        // with the enemy mix governed by the Tutorial Enemy Director.
        spawnEnemyBatch(2 + Math.floor(Math.random() * 2));
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
    // Live keybindings: read fresh each use so rebinding from the pause menu
    // applies instantly. `held(action)` polls the bound key; `moving(action)`
    // additionally honours the fixed arrow-key fallback for the four directions.
    const kb = (): KeyBindings => keyBindingsRef.current;
    const held = (action: keyof KeyBindings): boolean => !!keys[kb()[action]];
    const ARROW_FALLBACK: Partial<Record<keyof KeyBindings, string>> = {
      moveForward: 'ArrowUp', moveBackward: 'ArrowDown', moveLeft: 'ArrowLeft', moveRight: 'ArrowRight',
    };
    const moving = (action: keyof KeyBindings): boolean => {
      const alt = ARROW_FALLBACK[action];
      return held(action) || (alt ? !!keys[alt] : false);
    };
    const moveSpeed = 0.3;
    const sprintMultiplier = 1.8;
    const baseJumpPower = 0.45; // Higher, weightier hop — clears climbable rocks even on the heaviest loadout
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
    let jumpCutApplied = false; // variable-jump cut fires once per jump (not every frame)

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
          showPowerMessage('Overcharge · faster fire & damage');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overcharge Active!', 'powerup');
          createParticles(camera.position, 0xffcc33, 22);
          break;
        case 'ammo':
          ammo = effectiveMaxAmmo(currentWeapon);
          showPowerMessage('Ammo Refilled');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Ammo Refilled', 'powerup');
          createParticles(camera.position, 0xffd54a, 12);
          break;
        case 'speed':
          speedBoostActive = true;
          speedBoostEndTime = nowMs + speedBoostDuration;
          showPowerMessage('Speed Boost · 10s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Speed Boost Active!', 'powerup');
          createParticles(camera.position, 0x6ef0ff, 20);
          break;
        case 'damage':
          damageBoostActive = true;
          damageBoostEndTime = nowMs + damageBoostDuration;
          showPowerMessage('Damage Boost · 15s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Damage Boost Active!', 'powerup');
          createParticles(camera.position, 0xff8a3a, 20);
          break;
        case 'shield':
          shieldActive = true;
          shieldEndTime = nowMs + shieldDuration;
          shieldAbsorb = SHIELD_ABSORB_MAX;
          shieldBreakFlash = 0;
          showPowerMessage('Riot Shield · absorbs frontal damage');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Riot Shield Up!', 'powerup');
          // No world flare — the braced shield mesh on the arm is the feedback.
          break;
        case 'infinite_ammo':
          infiniteAmmoActive = true;
          infiniteAmmoEndTime = nowMs + infiniteAmmoDuration;
          showPowerMessage('Infinite Ammo · 10s');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Infinite Ammo Active!', 'powerup');
          createParticles(camera.position, 0xff5aff, 22);
          break;
        case 'phantom':
          phantomActive = true;
          phantomEndTime = nowMs + phantomDuration * (mpMods.phantomDurationMult ?? 1);
          showPowerMessage('Phantom · enemies lose track of you');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Phantom Active!', 'powerup');
          // No world flare — the weapon fading out is the feedback.
          break;
      }
      // Quick cast flourish. Only Overcharge spawns a world flare now — Shield
      // and Phantom each have their own persistent visual (braced mesh / weapon
      // fade), so their old blue/purple activation bursts were redundant clutter.
      gunModel.triggerAbility();
      soundManager.play('powerUp', 0.7);
      if (type === 'overcharge') {
        abilitySystem.createAbilityEffect(scene, camera.position, type);
      }
    }

    // ── ANTI-STACK GUARD ──────────────────────────────────────────────────
    // Powers fall into two classes: instant (ammo — applies once, no timer) and
    // timed (speed/damage/shield/infinite_ammo/overcharge/phantom — run for a
    // duration). To stop the player layering several buffs at once, a timed
    // power can only be activated when NO other timed effect is currently
    // running. Instant powers are always allowed. `isTimedPower` and
    // `anyTimedEffectActive` are the single source of truth for that rule.
    const isTimedPower = (p: HeldPower): boolean => p !== 'ammo';
    function anyTimedEffectActive(): boolean {
      return speedBoostActive || damageBoostActive || shieldActive
        || infiniteAmmoActive || overchargeActive || phantomActive;
    }

    // ── KILLSTREAK REWARDS ────────────────────────────────────────────────
    // Applied IMMEDIATELY on airdrop pickup. Unlike the held-power slot
    // these bypass `anyTimedEffectActive` — they're a skill payout and the
    // player intentionally earned the right to stack them.
    function applyKillstreakReward(type: import('./utils/EnhancedPowerUps').PowerUpType) {
      const nowMs = Date.now();
      gunModel.triggerAbility();
      soundManager.play('powerUp', 0.85);
      switch (type) {
        case 'rapid_fire':
          rapidFireActive = true;
          rapidFireEndTime = nowMs + rapidFireDuration;
          showPowerMessage('Rapid Fire · 3× fire rate · 15s', 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Rapid Fire!', 'powerup');
          createParticles(camera.position, 0xffaa33, 26);
          break;
        case 'invincible':
          invincibleActive = true;
          invincibleEndTime = nowMs + invincibleDuration;
          showPowerMessage('Invincible · 5s', 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Invincible!', 'powerup');
          createParticles(camera.position, 0xffff33, 32);
          break;
        case 'random_weapon': {
          // Mystery Box — pick a random weapon, unlock & equip it, full mag.
          const keys = Object.keys(WEAPONS);
          let pick = keys[(Math.random() * keys.length) | 0];
          // Try a few more rolls to avoid handing back the weapon already held.
          for (let i = 0; i < 4 && pick === currentWeapon; i++) {
            pick = keys[(Math.random() * keys.length) | 0];
          }
          if (!unlockedWeapons.includes(pick)) unlockedWeapons.push(pick);
          currentWeapon = pick;
          ammo = effectiveMaxAmmo(pick);
          gunModel.switchWeapon(pick as GunWeaponType);
          setGunFillForWeapon(pick);
          showPowerMessage(`Mystery Box · ${WEAPONS[pick].name}`, 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Mystery: ${WEAPONS[pick].name}`, 'powerup');
          createParticles(camera.position, 0xbb33ff, 22);
          updateGameState();
          break;
        }
        case 'nuke': {
          // Tactical nuke — vaporise everything alive. Credit each kill so
          // the player's score / streak / mission progress all tick up.
          let nuked = 0;
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead || e.health <= 0) continue;
            e.health = 0;
            handleEnemyKilled(e, false);
            nuked++;
          }
          showPowerMessage(`Tactical Nuke · ${nuked} eliminated`, 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Tactical Nuke · ${nuked} kills`, 'powerup');
          triggerScreenShake();
          // A bright burst on the player + the kill flash for the payoff.
          createParticles(camera.position, 0x33ff33, 50);
          triggerKillFlash();
          break;
        }
        default:
          // The other PowerUpType values (health/ammo/speed/damage/shield/
          // infinite_ammo) are handled via the held-power slot; not reachable
          // from the killstreak airdrop pool today.
          break;
      }
    }

    let infiniteAmmoActive = false;
    let infiniteAmmoEndTime = 0;
    const infiniteAmmoDuration = 10000; // 10 seconds

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

    // ── KILLSTREAK AIRDROP REWARDS ───────────────────────────────────────
    // Earned by chaining kills without dying. Effects are INSTANT (no held
    // slot) and INTENTIONALLY stack with the regular timed powers — they're
    // a skill payout, not a regular loot drop.
    let invincibleActive = false;
    let invincibleEndTime = 0;
    const invincibleDuration = 5000; // 5 seconds — short, punchy "god moment"

    let rapidFireActive = false;
    let rapidFireEndTime = 0;
    const rapidFireMultiplier = 3.0; // 3× the weapon's natural fire rate
    const rapidFireDuration = 15000; // 15 seconds

    // Highest streak value we've already awarded an airdrop for. Reset with
    // killStreak (on wave end) so a hot streak across multiple waves still
    // earns every reward tier.
    let lastStreakAwarded = 0;

    // CHARACTER ABILITY - bound to the dash/ability key, dispatched per class.
    // The cooldown gate is unified across every ability (so the HUD shows ONE
    // recharge ring); the dash's burst-movement mechanic keeps its own timers.
    let abilityCooldown = 0;                       // seconds remaining
    let abilityCooldownMax = activeAbility.cooldown; // for the HUD ratio
    let abilityActiveUntil = 0;                    // ms timestamp for HUD "active" glow
    // Dash burst-movement state (used only by the ranger's Dash ability).
    // The dash is a CHARGE: longer travel at higher speed, and any robot
    // caught in the path is trampled — bowled over with full force (see the
    // trample pass in the dash movement block). Heavy chassis (tank / boss /
    // mini-boss) survive with a chunk of damage + a hard shove so the charge
    // can't trivialise the big fights on its short cooldown.
    let isDashing = false;
    const dashDuration = 0.24; // charge window (was 0.15 — needs travel to run targets over)
    const dashSpeed = 2.9; // charge speed multiplier
    let dashTimer = 0;
    const dashDirection = new THREE.Vector3();
    // Enemies already hit by the CURRENT charge — cleared on each dash so one
    // robot can't be re-trampled every frame of the same charge.
    const dashHitEnemies = new Set<Enemy>();

    // Dispatch the selected character's signature ability (bound ability key).
    // Wherever possible this reuses the game's already-balanced timed-effect
    // machinery (speed boost, riot shield, overcharge, infinite ammo, phantom,
    // rocket blast), so every ability behaves IDENTICALLY across Solo, Tutorial
    // and Multiplayer — the only thing that changes per mode is where the class
    // comes from. Hoisted (function decl) so onKeyDown can call it; it runs only
    // during play, long after every closed-over `const` is initialised.
    function triggerCharacterAbility() {
      const nowMs = Date.now();
      let cd = activeAbility.cooldown;
      const activeMs = activeAbility.duration * 1000;

      switch (activeAbility.id) {
        case 'dash': {
          // Ranger — a trampling charge + a brief cinematic time-warp.
          isDashing = true;
          dashTimer = dashDuration;
          dashHitEnemies.clear();
          // FOV surge — the lens pulls wide for the burst, then the existing
          // per-frame decay eases it back. Reads as raw acceleration.
          fovPunch = Math.min(fovPunch + 8, 10);
          // Dash Mastery skill / perks / Ranger passive shrink the cooldown.
          cd = activeAbility.cooldown
            * Math.max(0.15, 1 + skillBonus('dashCooldown'))
            * perkBonuses.dashCooldownMult
            * (mpMods.dashCooldownMult ?? 1);
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          dir.y = 0; dir.normalize();
          const right = new THREE.Vector3();
          right.crossVectors(camera.up, dir).normalize();
          dashDirection.set(0, 0, 0);
          if (moving('moveForward')) dashDirection.add(dir);
          if (moving('moveBackward')) dashDirection.sub(dir);
          if (moving('moveLeft')) dashDirection.add(right);
          if (moving('moveRight')) dashDirection.sub(right);
          if (dashDirection.length() === 0 && touchControls.enabled && touchControls.moving) {
            dashDirection.addScaledVector(dir, touchControls.moveY).addScaledVector(right, -touchControls.moveX);
          }
          if (dashDirection.length() === 0) dashDirection.copy(dir);
          dashDirection.normalize();
          soundManager.play('jump', 0.5);
          gunModel.triggerDash();
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          timeScale = 0.5;
          setTimeout(() => { timeScale = 1.0; }, 100);
          break;
        }
        case 'adrenaline': {
          // Scout — short, strong movement-speed surge (reuses speed boost).
          speedBoostActive = true;
          speedBoostEndTime = nowMs + activeMs;
          showPowerMessage('Adrenaline · speed surge');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Adrenaline Surge!', 'powerup');
          createParticles(camera.position, 0x6ef0ff, 18);
          break;
        }
        case 'bulwark': {
          // Heavy — braces the riot shield (reuses the frontal-absorb shield).
          shieldActive = true;
          shieldEndTime = nowMs + activeMs;
          shieldAbsorb = SHIELD_ABSORB_MAX;
          shieldBreakFlash = 0;
          showPowerMessage('Bulwark · frontal shield raised');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Bulwark Raised!', 'powerup');
          break;
        }
        case 'focusfire': {
          // Operative — fire-rate + damage burst (reuses overcharge).
          overchargeActive = true;
          overchargeEndTime = nowMs + activeMs;
          showPowerMessage('Focus Fire · faster, harder shots');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Focus Fire!', 'powerup');
          createParticles(camera.position, 0xffcc33, 18);
          break;
        }
        case 'firestorm': {
          // Pyro — AoE shockwave nuke. Reusing explodeRocket gives correct
          // distance-falloff damage AND multiplayer-guest hit reporting for
          // free. On top of the main blast, a ring of staggered secondary
          // bursts (pure FX, no extra damage) rolls outward so the cast reads
          // as a true fire nova instead of a single small explosion.
          const fpos = camera.position.clone();
          fpos.y = 1.2; // originate near the ground so the blast hugs the floor
          explodeRocket(fpos, 70);
          for (let fi = 0; fi < 5; fi++) {
            const fa = (fi / 5) * Math.PI * 2 + Math.random() * 0.5;
            const fr = 4.5 + Math.random() * 2.5;
            const fx = fpos.x + Math.cos(fa) * fr;
            const fz = fpos.z + Math.sin(fa) * fr;
            window.setTimeout(() => {
              if (isSceneDisposed || isGameOver) return;
              explosionEffects.push(new ExplosionEffect(scene, new THREE.Vector3(fx, 0.4, fz), 4.5));
              createParticles(new THREE.Vector3(fx, 1.0, fz), 0xff7a2a, 8);
            }, 70 + fi * 75);
          }
          fovPunch = Math.min(fovPunch + 6, 10);
          showPowerMessage('Firestorm!');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Firestorm!', 'powerup');
          break;
        }
        case 'triage': {
          // Medic — instant self-heal for a third of max HP.
          health = Math.min(playerMaxHealth, health + playerMaxHealth * 0.35);
          updateGameState();
          showPowerMessage('Field Triage · patched up');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Field Triage!', 'powerup');
          createParticles(camera.position, 0x4dff9e, 18);
          soundManager.play('powerUp', 0.6);
          break;
        }
        case 'overclock': {
          // Engineer — snap-reload, then unlimited ammo for a few seconds.
          infiniteAmmoActive = true;
          infiniteAmmoEndTime = nowMs + activeMs;
          ammo = effectiveMaxAmmo(currentWeapon);
          updateGameState();
          showPowerMessage('Overclock · unlimited ammo');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overclock!', 'powerup');
          createParticles(camera.position, 0xffd54a, 18);
          break;
        }
        case 'cloak': {
          // Phantom — intangible stealth (reuses phantom; Phantom passive also
          // extends its duration via mpMods.phantomDurationMult).
          phantomActive = true;
          phantomEndTime = nowMs + activeMs * (mpMods.phantomDurationMult ?? 1);
          showPowerMessage('Cloak · you fade from sight');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Cloak Engaged!', 'powerup');
          break;
        }
      }

      abilityCooldown = cd;
      abilityCooldownMax = cd;
      abilityActiveUntil = nowMs + Math.max(activeMs, 200);
      tutorial.recordAction('use_ability', 1); // advances the ability tutorial step
      if (activeAbility.id !== 'dash') {
        gunModel.triggerAbility(); // braced weapon flourish
        // Firestorm + Triage play their own SFX; the rest get a generic cast cue.
        if (activeAbility.id !== 'firestorm' && activeAbility.id !== 'triage') {
          soundManager.play('powerUp', 0.7);
        }
      }
    }

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');   // base aim (mouse only)
    const PI_2 = Math.PI / 2;
    // Camera recoil — a transient kick added on top of the mouse aim each
    // shot, then smoothly recovered. Decoupled from `euler` so it never
    // fights the player's mouse input.
    let recoilPitch = 0;
    let recoilYaw = 0;
    const _recoilEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    // ─── Photo Mode loop state ───────────────────────────────────────────────
    // `photoActive` mirrors photoModeRef inside the loop so enter/exit side
    // effects (anchor, hide gun, restore viewpoint) run exactly once.
    let photoActive = false;
    let photoDragging = false; // left button held over the canvas → free-look
    const photoAnchor = new THREE.Vector3();      // centre of the move perimeter
    const photoReturnPos = new THREE.Vector3();   // player's real spot (restored on exit)
    const photoReturnEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PHOTO_PERIMETER = 7;   // max metres the camera may roam from the anchor
    const PHOTO_MIN_Y = 1.0;
    const PHOTO_MAX_Y = 6.5;
    let photoFov = 75;           // scroll-to-zoom FOV (set to baseFOV on entry)
    const PHOTO_FOV_MIN = 25;    // zoomed in
    const PHOTO_FOV_MAX = 115;   // zoomed out (wide)

    // ── RELOAD ───────────────────────────────────────────────────────────
    // Single entry point for reloads, shared by the R key and the auto-reload
    // that fires when the trigger is pulled on an empty mag. Returns false when
    // a reload can't start (already reloading, paused/over, or mag already full).
    let reloadTimeoutId: number | null = null;
    // Wave-perk Drum Magazine + Weapon Mastery magazine bonus boost the
    // effective magazine cap. Wrapped so every site (HUD, reload, refills)
    // reads the same source-of-truth size. The One-in-the-Chamber run
    // modifier overrides everything with an absolute cap — a single round
    // per weapon, all run long.
    const effectiveMaxAmmo = (key: string): number => {
      if (runMods.startAmmoMax !== undefined) return runMods.startAmmoMax;
      // Mastery bonus only applies to the CURRENT weapon — we don't track
      // per-weapon snapshots, just the active one. Other weapons use the
      // baseline; they'll get their bonus when switched to.
      const masteryMag = (key === currentWeapon) ? masteryBonus.magazineBonus : 0;
      return Math.round(WEAPONS[key].maxAmmo * perkBonuses.maxAmmoMult * (1 + masteryMag));
    };
    const startReload = (): boolean => {
      if (isReloading || paused || isGameOver || tutorialActiveRef.current) return false;
      const weapon = WEAPONS[currentWeapon];
      const maxAmmoNow = effectiveMaxAmmo(currentWeapon);
      if (ammo >= maxAmmoNow) return false;
      isReloading = true;
      soundManager.play('reload', 0.5);
      gunModel.triggerReload();
      tutorial.recordAction('reload', 1);
      // Quickdraw skill + Engineer MP passive + Weapon Mastery all speed up
      // the reload. Mastery's `reloadSpeedup` is a percentage REDUCTION (0.10
      // → 10% off) so we subtract it from 1 in the multiplier chain.
      const reloadMs = (weapon.reloadTime / (1 + skillBonus('reloadSpeed')))
        * (mpMods.reloadSpeedMult ?? 1)
        * (1 - masteryBonus.reloadSpeedup);
      setReloadDurationUI(reloadMs); // drives the crosshair reload indicator
      if (reloadTimeoutId !== null) window.clearTimeout(reloadTimeoutId);
      reloadTimeoutId = window.setTimeout(() => {
        reloadTimeoutId = null;
        ammo = maxAmmoNow;
        isReloading = false;
        setReloadDurationUI(null);
        updateGameState();
      }, reloadMs);
      return true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore gameplay keys while the player is typing in a text field (e.g.
      // multiplayer chat) — otherwise letters like W/A/S/D would also move the
      // player. Applies on desktop and mobile (on-screen keyboard).
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      // Wave-perk picker owns the keyboard while it's open (1/2/3 select a
      // perk; ←/→/Enter browse). Block ALL gameplay handlers so the player
      // can't accidentally swap weapons or jump while picking.
      if (wavePerkActiveRef.current) return;

      // CRITICAL: Always set the key state first to ensure movement works
      // This ensures keys are registered even if later checks fail. The set is
      // derived from the live bindings (+ the fixed arrow-key fallback) so a
      // rebound movement key still registers before the photo/Escape guards.
      const b = kb();
      const isMovementKey = [
        b.moveForward, b.moveBackward, b.moveLeft, b.moveRight, b.jump, b.sprint,
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      ].includes(e.code);
      if (isMovementKey) {
        keys[e.code] = true;
      }

      // Photo Mode owns the keyboard: movement keys (set above) reposition the
      // camera; Escape leaves the mode; everything else (shoot/reload/weapons)
      // is swallowed so the frozen shot can't be disturbed.
      if (photoModeRef.current) {
        if (e.code === 'Escape') exitPhotoMode();
        return;
      }

      // Toggle the expanded tactical map (works in solo, tutorial & multiplayer).
      // No-op when no radar is mounted (e.g. in menus).
      if (e.code === b.toggleMap) {
        toggleMinimapExpanded();
        return;
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
        } else if (!tutorialActiveRef.current && !touchControls.enabled) {
          renderer.domElement.requestPointerLock();
        }
        return;
      }

      // Set key state for non-movement keys too
      if (!isMovementKey) {
        keys[e.code] = true;
      }

      // CHARACTER ABILITY — the bound ability key fires the selected class's
      // signature move (Dash for the Ranger, Firestorm for the Pyro, …), gated
      // by the unified ability cooldown. Same key, same gate, every game mode.
      if (e.code === b.dash && !paused && !isGameOver && abilityCooldown <= 0 && !isDashing) {
        // Anti-stack (mirrors the looted-power rule): the signature ability
        // can't be cast while a looted timed power is still running — otherwise
        // the player could layer two buffs at once. Pickup and ability are
        // mutually exclusive, whichever was used first.
        if (anyTimedEffectActive()) {
          showPowerMessage(touchControls.enabled
            ? 'Wait for your power to finish'
            : 'Wait for your active power to finish', 1500);
          return;
        }
        triggerCharacterAbility();
        return; // Don't process other ability actions
      }

      // CROUCH TOGGLE - bound crouch key
      if (e.code === b.crouch && !paused) {
        isCrouching = !isCrouching;
        soundManager.play('footstep', 0.3);
        return;
      }

      // USE HELD POWER — the bound power key activates whatever loot power is
      // currently held, then empties the slot. Powers come exclusively from
      // enemy loot now (one at a time), so there's no point-unlock gating.
      if (e.code === b.usePower && !paused) {
        if (heldPower) {
          // Anti-stack: a timed power can't start while another timed effect is
          // still running — the player keeps the held power and is told to wait.
          if (isTimedPower(heldPower) && anyTimedEffectActive()) {
            showPowerMessage('Wait for your active power to finish', 1600);
          } else {
            const power = heldPower;
            heldPower = null;
            applyPower(power);
          }
        } else {
          showPowerMessage('No power held — defeat enemies to find loot', 1600);
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
        if (unlockedWeapons.includes(weaponName) && weaponName !== currentWeapon) {
          // Guard against re-selecting the current weapon — that path used to
          // silently refill the mag (a free instant reload) on every keypress.
          currentWeapon = weaponName;
          refreshMasteryBonus();
          ammo = effectiveMaxAmmo(weaponName);
          gunModel.switchWeapon(weaponName as GunWeaponType);
          setGunFillForWeapon(weaponName);
          soundManager.play('weaponSwitch', 0.5);
          tutorial.recordAction('switch_weapon', 1);
          updateGameState();
        } else if (!unlockedWeapons.includes(weaponName)) {
          const weapon = WEAPONS[weaponName];
          showPowerMessage(`${weapon.name} Locked — ${weapon.unlockScore} pts needed`);
        }
      }

      if (e.code === b.reload) {
        startReload();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    const onPointerLockChange = () => {
      // Touch devices never acquire pointer lock — skip entirely so the
      // "lost lock → auto-pause" path can't fire on every frame.
      if (touchControls.enabled) return;
      const locked = document.pointerLockElement === renderer.domElement;
      // Don't auto-pause when losing pointer lock in multiplayer, tutorial,
      // photo mode, OR while the wave-perk picker is up (the picker releases
      // the lock on purpose so 1/2/3 can pick a perk; auto-pausing under it
      // dropped the pause menu over the picker, soft-locked the player and
      // was the source of the "wave 1 picker → glitched" report).
      const inMultiplayerGame = isMultiplayer || gameMode === 'multiplayer';
      if (!locked && !paused && !isGameOver && !inMultiplayerGame
          && !tutorialActiveRef.current && !photoModeRef.current
          && !wavePerkActiveRef.current) {
        paused = true;
        setIsPaused(true);
      }

      // Multiplayer doesn't pause when the cursor is released (e.g. via Escape).
      // Browsers REFUSE a programmatic re-lock right after an Escape-exit (it
      // must come from a fresh user gesture), so instead of silently retrying
      // on a timer — which never worked — we surface a "click to resume" prompt
      // and the next click re-locks (see onMouseDown). Cleared once re-locked.
      if (inMultiplayerGame && !isGameOver) {
        setShowResumePrompt(!locked);
      } else if (locked) {
        setShowResumePrompt(false);
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);

    const onCanvasClick = (e: MouseEvent) => {
      // Left click to lock pointer (skip during tutorial popup, and on touch
      // devices which control the camera via the on-screen look surface).
      if (e.button === 0 && !isGameOver && !paused && !tutorialActiveRef.current && !touchControls.enabled && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }

      // Ensure canvas has focus for keyboard input (especially important for multiplayer)
      if (renderer.domElement) {
        renderer.domElement.focus();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      // Touch: suppress the long-press context menu and do nothing else
      // (ADS is driven by the on-screen aim button, not right-click).
      if (touchControls.enabled) return;
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

    // Shared rocket geometry + materials. Every rocket used to allocate fresh
    // geometry + materials (and was never disposed on removal → a slow leak on
    // a launcher-heavy run). They're all identical, so build once and reuse;
    // the per-rocket cost is now just the lightweight Mesh wrappers. Disposed
    // with the rest of the shared resources in the effect cleanup.
    const rocketBodyGeo = (() => { const g = new THREE.CylinderGeometry(0.13, 0.16, 1.0, 12); g.rotateX(Math.PI / 2); return g; })();
    const rocketNoseGeo = (() => { const g = new THREE.ConeGeometry(0.16, 0.55, 12); g.rotateX(-Math.PI / 2); return g; })();
    const rocketFinGeo = new THREE.BoxGeometry(0.04, 0.34, 0.34);
    const rocketExhaustGeo = (() => { const g = new THREE.ConeGeometry(0.16, 0.8, 10); g.rotateX(Math.PI / 2); return g; })();
    const rocketCoreGeo = (() => { const g = new THREE.ConeGeometry(0.08, 0.5, 8); g.rotateX(Math.PI / 2); return g; })();
    const rocketBodyMat = new THREE.MeshStandardMaterial({ color: 0x4b5159, metalness: 0.6, roughness: 0.4 });
    const rocketNoseMat = new THREE.MeshStandardMaterial({ color: 0xc23a1a, metalness: 0.4, roughness: 0.5, emissive: 0x501608, emissiveIntensity: 0.6 });
    const rocketFinMat = new THREE.MeshStandardMaterial({ color: 0x202428, metalness: 0.5, roughness: 0.6 });
    const rocketExhaustMat = new THREE.MeshBasicMaterial({ color: 0xffae3a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const rocketCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const rocketSharedGeos = [rocketBodyGeo, rocketNoseGeo, rocketFinGeo, rocketExhaustGeo, rocketCoreGeo];
    const rocketSharedMats = [rocketBodyMat, rocketNoseMat, rocketFinMat, rocketExhaustMat, rocketCoreMat];

    // Builds a detailed rocket projectile for the launcher — body, warhead
    // nose, tail fins and a glowing exhaust, so the round reads as a real
    // rocket rather than a flat coloured dot. Uses the shared geo/mats above.
    //
    // The engine glow is additive emissive MESHES (an inner white-hot cone +
    // an outer amber flare), NOT a real PointLight: adding a fresh PointLight
    // the first time a rocket fires forces a full shader recompile of every
    // material — the "rocket launcher lags initially" stutter. The impact
    // flash uses the pre-warmed explosion light pool instead.
    const createRocketProjectile = (): THREE.Mesh => {
      const body = new THREE.Mesh(rocketBodyGeo, rocketBodyMat);
      body.castShadow = true;

      const nose = new THREE.Mesh(rocketNoseGeo, rocketNoseMat);
      nose.position.z = -0.75;
      body.add(nose);

      for (let f = 0; f < 4; f++) {
        const fin = new THREE.Mesh(rocketFinGeo, rocketFinMat);
        const a = (f / 4) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.45);
        fin.rotation.z = a;
        body.add(fin);
      }

      const exhaust = new THREE.Mesh(rocketExhaustGeo, rocketExhaustMat);
      exhaust.position.z = 0.9;
      body.add(exhaust);

      const core = new THREE.Mesh(rocketCoreGeo, rocketCoreMat);
      core.position.z = 0.78;
      body.add(core);

      // Legacy AO-opt-out userData kept for forward-compat with any future AO pass.
      body.userData.cannotReceiveAO = true;
      body.traverse((o) => { o.userData.cannotReceiveAO = true; });

      return body;
    };

    // Enhanced shooting
    const shoot = () => {
      // Empty magazine — dry-fire click + auto-reload so pulling the trigger on
      // an empty mag actually does something instead of a dead click. The
      // !isReloading guard means only the first pull clicks; subsequent pulls
      // of a held auto-fire burst are swallowed while the reload runs.
      if (ammo <= 0 && !isReloading && !isGameOver && !paused && !tutorialActiveRef.current) {
        soundManager.play('empty', 0.5);
        startReload();
        return;
      }
      if (ammo > 0 && !isGameOver && !paused && canShoot && !isReloading && !tutorialActiveRef.current) {
        const weapon = WEAPONS[currentWeapon];
        canShoot = false;
        // Overcharge × Rapid-Fire (killstreak airdrop) × Wave perks compound on
        // top of the weapon's base fire rate — earn them all, fire blisteringly fast.
        let fireRateMult = perkBonuses.fireRateMult;
        if (overchargeActive) fireRateMult *= overchargeFireRateMult;
        if (rapidFireActive) fireRateMult *= rapidFireMultiplier;
        const fireDelay = weapon.fireRate / fireRateMult;
        setTimeout(() => { canShoot = true; }, fireDelay);

        // Only consume ammo if infinite ammo powerup is not active
        if (!infiniteAmmoActive) {
          ammo--;
        }
        // Per-weapon recoil scaled by weight — pistol kicks firmly,
        // shotgun/sniper kick HARD, minigun/launcher are bone-shakers.
        // Strength curve (heavier for a more realistic feel): weight 1.0 → 0.85,
        // 1.5 → 1.35, 2.0 → 1.95, 3.0 → 3.2 (the model clamps its own visual).
        const recoilStrength = Math.pow(weapon.weight, 1.45) * 0.85 * (1 - masteryBonus.recoilReduction);
        gunModel.triggerRecoil(recoilStrength);
        // Eject a brass casing per trigger pull (the launcher fires rockets, no casing).
        if (!weapon.name.includes('Launcher')) ejectShellCasing();
        updateGameState();

        // 🤖 Record shot for AI systems (will check for hit later)
        combatCoach.recordShot(false, false); // Updated when bullet hits
        tutorial.recordAction('shoot', 1);

        // Play the weapon-specific report with a subtle random pitch so
        // sustained auto-fire doesn't sound like one looped sample.
        soundManager.play(`shoot_${currentWeapon}`, 0.7, false, 0.97 + Math.random() * 0.06);

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

          // Apply damage boost + overcharge powerups + Heavy Hitter skill + wave-perk + run-modifier.
          // Pyro's "Burning Bullets" passive adds a small flat per-shot bonus on top
          // (read as a fire DOT in player-facing copy; mechanically just extra damage).
          let baseWeaponDamage = damageBoostActive ? weapon.damage * damageBoostMultiplier : weapon.damage;
          if (overchargeActive) baseWeaponDamage *= overchargeDamageMult;
          let bulletDamage = baseWeaponDamage
            * (1 + skillBonus('weaponDamage'))
            * perkBonuses.damageMult
            * (runMods.playerDamageMult ?? 1);
          if (mpMods.burningBullets) bulletDamage += 6;

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

        // Notify all enemies about gunshot. registerSound clones the position
        // internally, so passing the live vector avoids one allocation per
        // enemy per shot (which added up fast on autofire weapons).
        for (const enemy of enemies) {
          if (!enemy.dead && enemy.perception) {
            enemy.perception.registerSound(camera.position, 1.0);
          }
        }

        // WEAPON RECOIL — prominent, weighty kick (camera pitch climb + shake +
        // FOV punch). Per-weapon base scaled up ~1.6× over the old values for a
        // far more impactful, realistic feel. The render loop recovers the kick
        // smoothly so it stays rideable for skilled players.
        const recoilAmount = weapon.name.includes('Minigun') ? 0.020 :
                             weapon.name.includes('Shotgun') ? 0.058 :
                             weapon.name.includes('Sniper') ? 0.075 :
                             weapon.name.includes('Launcher') ? 0.090 :
                             weapon.name.includes('Rifle') ? 0.030 : 0.018;

        // ENHANCED SCREEN SHAKE for recoil feedback
        cameraShakeIntensity = Math.min(cameraShakeIntensity + recoilAmount * 4.2, 0.32);

        // Per-shot haptic kick on touch (rate-limited internally; no-op on
        // desktop / when haptics are off).
        haptic('fire');

        // FOV punch — noticeable widening on each shot
        fovPunch = Math.min(fovPunch + recoilAmount * 75, 4.5);

        // CAMERA RECOIL — a real kick up the player has to ride and control.
        // Pitch climbs each shot (capped higher now), with a stronger random
        // horizontal sway so sustained fire walks the aim like a real weapon.
        recoilPitch = Math.min(recoilPitch + recoilAmount * 3.4, 0.5);
        recoilYaw += (Math.random() - 0.5) * recoilAmount * 2.2;
        recoilYaw = Math.max(-0.18, Math.min(0.18, recoilYaw));
      }
    };

    let mouseDown = false;
    let autoFireInterval: number | null = null;

    const onMouseDown = (e: MouseEvent) => {
      // Wave-perk picker owns the input while it's up (mystery box flow).
      // Block aim / shoot / pointer-re-lock so a stray click can't fire a
      // shot through the overlay or grab the cursor back mid-pick.
      if (wavePerkActiveRef.current) return;

      // Photo Mode: dragging on the canvas free-looks (no pointer lock so the
      // adjustment panel stays clickable). Clicks on the panel have a different
      // target, so they never start a look-drag.
      if (photoModeRef.current) {
        if (e.button === 0 && e.target === renderer.domElement) {
          photoDragging = true;
          e.preventDefault();
        }
        return;
      }

      // Re-acquire pointer lock on click when it has been released (e.g. after
      // Escape in multiplayer, which doesn't pause). The first click recaptures
      // the cursor instead of firing — standard browser-FPS behaviour — so the
      // player always gets control back with a single click.
      if (!touchControls.enabled && !isGameOver && !paused && !tutorialActiveRef.current
          && renderer.domElement && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
        return;
      }

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
      if (photoModeRef.current) {
        photoDragging = false;
        return;
      }

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
      if (renderer.domElement && !paused && !isGameOver && !tutorialActiveRef.current && !touchControls.enabled) {
        renderer.domElement.requestPointerLock();
      }
    }, 200);

    const onMouseMove = (e: MouseEvent) => {
      // Photo Mode free-look (drag): rotate the base aim from raw mouse deltas.
      if (photoModeRef.current) {
        if (photoDragging) {
          const s = 0.0022 * sensitivityMultiplier;
          euler.y -= e.movementX * s;
          euler.x -= e.movementY * s;
          euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
        }
        return;
      }
      if (!paused && !isGameOver) {
        if (document.pointerLockElement === renderer.domElement || mouseDown) {
          // Mouse only updates the BASE aim (`euler`). The render loop
          // composes base aim + recoil into the final camera rotation, so
          // recoil and mouse input never corrupt each other. Aiming down
          // sights drops sensitivity ~35% for a precise, controlled feel.
          const adsSens = (isAiming && WEAPONS[currentWeapon].canAim) ? 0.65 : 1;
          const baseSens = 0.002 * sensitivityMultiplier * adsSens;
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
      // Photo Mode: scroll zooms the lens (FOV). Scroll up = zoom in.
      if (photoModeRef.current) {
        e.preventDefault();
        photoFov = Math.max(PHOTO_FOV_MIN, Math.min(PHOTO_FOV_MAX, photoFov + (e.deltaY > 0 ? 4 : -4)));
        return;
      }
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

    // ── HUD update COALESCING ──────────────────────────────────────────────
    // The HUD is React state; pushing it via setGameState() reconciles the
    // (very large) App tree. During combat updateGameState() was called on
    // every shot, every bullet hit AND every kill — easily 15-30x/sec when
    // spam-firing into a crowd — which flooded React with full re-renders and
    // froze the main thread (the "spam-click hang" the player reported).
    //
    // Now updateGameState() just flags the HUD dirty; the render loop flushes
    // it at most ~16x/sec (flushGameState). The HUD is allowed to lag a frame
    // or two — imperceptible for ammo/score — and React work drops by an order
    // of magnitude under sustained fire.
    let hudDirty = false;
    let lastHudFlushMs = 0;
    const HUD_MIN_INTERVAL_MS = 60; // ~16Hz cap on HUD reconciliation

    const flushGameState = () => {
      hudDirty = false;
      lastHudFlushMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      checkWeaponUnlocks();
      // Weapon Mastery sliver — only published when the player is signed in
      // and not in tutorial (tutorial doesn't grant XP). Snapshot the
      // current weapon's level + XP into-level / next-level for the HUD.
      const masteryHud = (isAuthenticated && !isTutorialMode)
        ? xpProgressAtLevel(masteryTotalXp(currentWeapon))
        : undefined;
      setGameState({
        health,
        maxHealth: playerMaxHealth,
        ammo,
        maxAmmo: effectiveMaxAmmo(currentWeapon),
        score,
        enemiesKilled,
        wave,
        isGameOver,
        isVictory: false, // No victory - endless mode
        combo,
        killStreak,
        currentWeapon,
        unlockedWeapons: [...unlockedWeapons],
        weaponMastery: masteryHud,
      });
    };

    // Coalesced request — the loop decides when to actually reconcile.
    const updateGameState = () => { hudDirty = true; };

    // Hydrate the mastery bonus snapshot from persisted XP so a returning
    // player's L7 pistol starts the run already reload-buffed instead of
    // re-snapshotting on their first kill.
    refreshMasteryBonus();
    // Push the initial state to the HUD immediately so it reflects the real
    // starting values (e.g. all weapons already unlocked in Tutorial mode)
    // instead of waiting for the first shot / weapon switch.
    flushGameState();

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

    // World-streaming throttle: chunk generation + the distant-object cull
    // only need to run when the player crosses a chunk boundary (plus a slow
    // heartbeat as a safety net) — not 60×/sec. The per-frame version walked
    // the whole terrainObjects array every frame for nothing.
    let worldGenChunkX = Number.NaN;
    let worldGenChunkZ = Number.NaN;
    let worldGenAccum = 0;

    // Head bob time accumulator - prevents floating point precision issues from Date.now()
    let headBobTime = 0;
    const HEAD_BOB_TIME_RESET = 1000; // Reset every 1000 units to prevent float overflow
    // Footstep cadence — accumulates ground distance travelled and emits a
    // step sound each stride. One stride length means running (faster ground
    // speed) naturally produces a quicker step cadence than walking.
    let footstepAccum = 0;
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
    const _touchMove = new THREE.Vector3(); // analog joystick movement (mobile)
    const _assistFwd = new THREE.Vector3(); // camera forward (aim assist)
    const _assistDir = new THREE.Vector3(); // camera→enemy (aim assist)
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
    let terrainGridStamp = -1; // tracks terrainVersion (bumped on every add/remove)
    const rebuildTerrainGridIfStale = () => {
      // terrainVersion increments on EVERY add/remove, so this can't be fooled
      // by an add+remove pair that leaves the array length unchanged. O(1)
      // when fresh — every collision helper calls it before querying.
      if (terrainGridStamp === terrainVersion) return;
      terrainGridStamp = terrainVersion;
      terrainGrid.clear();
      for (let k = 0; k < terrainObjects.length; k++) {
        const obj = terrainObjects[k];
        if (!obj.collidable) continue;
        terrainGrid.insert(k, obj.x, obj.z);
      }
    };

    // Pop an enemy's head off as a free-flying gib. The original (pooled) head
    // is hidden and restored when the corpse is recycled (see the death-cleanup
    // block). The gib clone shares the head's geometry + material, so it costs
    // almost nothing. Launches along the shot direction (or away from the
    // player) with a strong upward arc + tumble.
    const _gibPos = new THREE.Vector3();
    const _gibQuat = new THREE.Quaternion();
    const _gibScale = new THREE.Vector3();
    const spawnHeadGib = (enemy: Enemy) => {
      const head = enemy.head;
      if (!head || !head.visible) return;
      head.updateWorldMatrix(true, false);
      head.getWorldPosition(_gibPos);
      head.getWorldQuaternion(_gibQuat);
      head.getWorldScale(_gibScale);

      const gib = head.clone(true); // recursive clone — shares geo + material
      gib.visible = true;
      gib.position.copy(_gibPos);
      gib.quaternion.copy(_gibQuat);
      gib.scale.copy(_gibScale);
      gib.traverse((o) => { o.castShadow = false; o.userData.cannotReceiveAO = true; });
      scene.add(gib);
      head.visible = false; // the body is now headless

      // Launch direction: the shot impulse if we have one, else away from player.
      const dir = (enemy.hitImpulse && enemy.hitImpulse.lengthSq() > 1e-4)
        ? enemy.hitImpulse.clone().setY(0).normalize()
        : new THREE.Vector3(
            enemy.mesh.position.x - camera.position.x, 0, enemy.mesh.position.z - camera.position.z,
          ).normalize();
      if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
      const speed = 4 + Math.random() * 3;
      const vel = new THREE.Vector3(dir.x * speed, 7 + Math.random() * 3, dir.z * speed);
      const spin = new THREE.Vector3(
        (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 16,
      );
      headGibs.push({ mesh: gib, vel, spin, life: 4, restY: 0.25 * _gibScale.y });

      // Cap the gib count so a long sniper streak can't pile up corp'd heads.
      if (headGibs.length > MAX_HEAD_GIBS) {
        const old = headGibs.shift();
        if (old) scene.remove(old.mesh);
      }

      // Sharp robot-spark burst at the neck + a meaty pop + a punchy shake so
      // a decapitating shot really lands.
      robotSparks.push(new RobotHitSparks(scene, _gibPos.clone(), dir, 14));
      createParticles(_gibPos, 0xffcc44, 10);
      soundManager.play('enemyHit', 0.85, false, 0.7);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
    };

    // Powerful weapons (sniper / launcher-tier, base damage ≥ 60) decapitate on
    // a critical (headshot) kill — bosses excluded (too large / they wear a
    // crown). Resolved from the local weapon, which is correct in solo and a
    // harmless cosmetic approximation for host-resolved multiplayer kills.
    const canDecapitate = (enemy: Enemy, isCritical: boolean): boolean =>
      isCritical && enemy.type !== 'boss' && !!enemy.head && enemy.head.visible
      && WEAPONS[currentWeapon].damage >= 60;

    // Extracted enemy-kill handler — shared by direct bullet hits and the
    // rocket launcher's area-of-effect so score, combos, drops, achievements
    // and wave progression all behave identically however an enemy dies.
    const handleEnemyKilled = (enemy: Enemy, isCritical: boolean, killerId?: string) => {
      // ── DECAPITATION ── pop the head off before the corpse flies (so the
      // gib launches from the head's pre-ragdoll position).
      if (canDecapitate(enemy, isCritical)) spawnHeadGib(enemy);
      // ── WORLD state (authoritative): the enemy is dead for everyone. ──
      enemy.dead = true;
      enemy.deathTime = 1.0;
      soundManager.play('enemyDeath', 0.6);
      createParticles(enemy.mesh.position, 0x00ff00, 8);

      // ── Ragdoll launch (lightweight physics, toggleable in Settings) ──
      // Fling the corpse along the shot direction (or away from the player when
      // no hit direction is known, e.g. melee/AOE kills), up and tumbling. The
      // death loop integrates gravity + ground bounce. Heavier types launch less.
      // When the player disables ragdolls, we leave deathVel/deathSpin unset and
      // the death loop falls back to a clean topple-and-shrink animation.
      if (gameSettingsManager.getSetting('ragdollPhysics')) {
        const massScale = enemy.type === 'boss' ? 0.32
          : enemy.type === 'tank' ? 0.6
          : enemy.type === 'fast' ? 1.3
          : enemy.type === 'ranged' ? 1.0
          : 1.0;
        const launchDir = (enemy.hitImpulse && enemy.hitImpulse.lengthSq() > 1e-4)
          ? enemy.hitImpulse.clone().setY(0).normalize()
          : new THREE.Vector3(
              enemy.mesh.position.x - camera.position.x,
              0,
              enemy.mesh.position.z - camera.position.z,
            );
        if (launchDir.lengthSq() < 1e-4) launchDir.set(0, 0, 1);
        launchDir.normalize();
        const launchSpeed = (4 + Math.random() * 2.5) * massScale * (isCritical ? 1.5 : 1);
        enemy.deathVel = new THREE.Vector3(
          launchDir.x * launchSpeed,
          (5.5 + Math.random() * 1.6) * massScale,
          launchDir.z * launchSpeed,
        );
        enemy.deathSpin = new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 7,
          (Math.random() - 0.5) * 11,
        ).multiplyScalar(massScale);
        enemy.deathStarted = true;
      }

      // Who gets the kill? In solo — and for the host's OWN kills — it's the
      // local player. In multiplayer, when a guest's reported hit lands the
      // killing blow, the host credits that guest's client instead so its
      // scoreboard, combo and kill feed update for the player who earned it.
      const localId = mp ? mp.getLocalPlayer().id : null;
      const localGetsCredit = !isMultiplayer || killerId === undefined || killerId === localId;

      if (localGetsCredit) {
        // Difficulty-weighted score × Run-Modifier score multiplier (the
        // carrot for picking a punishing mutator like Glass Cannon). Mini
        // bosses earn 3× the kill payout for their staying power.
        const miniBossMult = enemy.isMiniBoss ? 3 : 1;
        score += Math.round(enemy.scoreValue * scoreDiffMult * runModifierScoreMult * miniBossMult);
        enemiesKilled++;
        // Daily Challenge channels — tick cumulative counts.
        if (dailyEnabled) {
          dailyCounts.kill += 1;
          if (isCritical) dailyCounts.headshot += 1;
          if (currentWeapon === 'pistol') dailyCounts.pistol_kill += 1;
        }
        // Weapon Mastery — grant XP on the equipped weapon. Bigger payouts
        // for bigger fights (bosses are a real grind reward).
        const xpGrant = xpPerKill(enemy.type, enemy.isMiniBoss);
        const masteryLevelBefore = levelFromXp(masteryTotalXp(currentWeapon));
        masteryRunXp[currentWeapon] = (masteryRunXp[currentWeapon] ?? 0) + xpGrant;
        const masteryLevelAfter = levelFromXp(masteryTotalXp(currentWeapon));
        if (masteryLevelAfter > masteryLevelBefore) {
          // Crossed a level boundary — feedback for the player.
          soundManager.play('powerUp', 0.55, false, 1.4);
          if (gameSettingsManager.getSetting('killFeed')) {
            addKillFeedEntry(`${WEAPONS[currentWeapon].name} · Mastery L${masteryLevelAfter}`, 'powerup');
          }
          showPowerMessage(`Mastery Unlocked · ${WEAPONS[currentWeapon].name} L${masteryLevelAfter}`, 2200);
        }
        // Re-snapshot the bonus for the active weapon so a level-up that
        // happens mid-kill applies on the next reload / recoil instead of
        // waiting for the throttled flush.
        refreshMasteryBonus();
        // Wave-perk healing on kill: Bloodletting (every kill) and Vampiric
        // Edge (headshot kills only). Both cap at playerMaxHealth so they
        // can't over-heal past the Thick-Skin / Iron-Lung max.
        if (perkBonuses.lifestealPerKill > 0 || (isCritical && perkBonuses.vampiricKillHeal > 0)) {
          const heal = perkBonuses.lifestealPerKill + (isCritical ? perkBonuses.vampiricKillHeal : 0);
          if (heal > 0 && health < playerMaxHealth) {
            health = Math.min(playerMaxHealth, health + heal);
          }
        }
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
          score += Math.round(combo * 5 * scoreDiffMult * runModifierScoreMult);
          // ── KILLSTREAK AIRDROP DROPS ─────────────────────────────────
          // 5/10/15/20 unbroken kills each spawn an escalating airdrop.
          // `lastStreakAwarded` prevents the threshold from re-firing if the
          // player happens to cross it twice within one wave (shouldn't be
          // possible since killStreak only resets on wave end, but cheap to
          // guard).
          const streakReward = (
            killStreak === 5  ? 'rapid_fire' :
            killStreak === 10 ? 'invincible' :
            killStreak === 15 ? 'random_weapon' :
            killStreak === 20 ? 'nuke' :
            null
          );
          if (streakReward && killStreak > lastStreakAwarded) {
            lastStreakAwarded = killStreak;
            // Drop the crate ~10m in front of the player so they don't have
            // to leave the fight, but far enough that the parachute reads.
            camera.getWorldDirection(_assistFwd);
            const dropX = camera.position.x + _assistFwd.x * 10;
            const dropZ = camera.position.z + _assistFwd.z * 10;
            enhancedPowerUps.createAirdrop(scene, dropX, dropZ, streakReward);
            // Layered feedback: kill feed pings the streak, a centred banner
            // tells them WHICH reward incoming, and the power-up chime is
            // pitched up so it reads as a "delivery inbound" alert.
            soundManager.play('powerUp', 0.7, false, 1.25);
            const rewardLabel = (
              streakReward === 'rapid_fire'    ? 'Rapid Fire' :
              streakReward === 'invincible'    ? 'Invincibility' :
              streakReward === 'random_weapon' ? 'Mystery Box' :
              streakReward === 'nuke'          ? 'Tactical Nuke' :
              'Airdrop'
            );
            if (gameSettingsManager.getSetting('killFeed')) {
              addKillFeedEntry(`${killStreak} Streak · ${rewardLabel} Inbound`, 'powerup');
            }
            showPowerMessage(`AIRDROP INBOUND · ${rewardLabel}`, 2400);
          }
          // Rising combo chime at each 5x milestone — pitch climbs with the
          // combo so a hot streak audibly escalates. Independent of the kill
          // feed setting (it's reward feedback, not a log entry).
          if (combo >= 5 && combo % 5 === 0) {
            soundManager.play('powerUp', 0.45, false, 1.0 + Math.min(combo, 45) * 0.018);
          }
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
        // Tutorial — grow the enemy roster as the player proves themselves,
        // announcing each new species the moment it's earned.
        if (isTutorialMode) updateTutorialRoster(enemiesKilled);
        if (isCritical) triggerHeadshotFlash(); else triggerKillFlash();
        // Skill points are no longer earned per kill — they're awarded at the end
        // of a Solo run (server-side) so the tree is a real, competitive grind.
        if (gameSettingsManager.getSetting('killFeed')) {
          // Cosmetic title prefix — gives equipped earners a flex moment.
          const titlePrefix = equippedTitleRef.current ? `[${equippedTitleRef.current}] ` : '';
          if (isCritical) addKillFeedEntry(`${titlePrefix}HEADSHOT!`, 'headshot');
          else addKillFeedEntry(`${titlePrefix}Enemy Eliminated`, 'kill');
          if (combo >= 5 && combo % 5 === 0) addKillFeedEntry(`${combo}x COMBO!`, 'combo');
          if (killStreak === 10) addKillFeedEntry('10 Kill Streak!', 'combo');
          else if (killStreak === 20) addKillFeedEntry('20 Kill Streak!', 'combo');
          else if (killStreak === 30) addKillFeedEntry('30 Kill Streak! UNSTOPPABLE!', 'combo');
        }
        // ── Achievements (solo only; every call no-ops when disabled) ──
        // Career kill totals drive the cumulative tiers; the running streak and
        // headshot tally drive the per-run feats.
        const careerKills = baseSoloKills + enemiesKilled;
        achievementSystem.setProgress('first_blood', careerKills);
        achievementSystem.setProgress('slayer', careerKills);
        achievementSystem.setProgress('massacre', careerKills);
        achievementSystem.setProgress('legend', careerKills);
        achievementSystem.setProgress('annihilator', careerKills);
        achievementSystem.setProgress('hot_streak', killStreak);
        achievementSystem.setProgress('unstoppable', killStreak);
        // Combo + score milestones (single run). `combo`/`score` are already
        // updated for this kill above, so these read the post-kill values.
        achievementSystem.setProgress('frenzy', combo);
        achievementSystem.setProgress('berserker', combo);
        achievementSystem.setProgress('centurion', score);
        achievementSystem.setProgress('high_roller', score);
        // Boss kills (single run) — the heaviest enemy type only.
        if (enemy.type === 'boss') {
          bossKillsThisRun += 1;
          achievementSystem.updateProgress('goliath', 1);
          achievementSystem.setProgress('boss_slayer', bossKillsThisRun);
        }
        if (isCritical) {
          headshotsThisRun += 1;
          achievementSystem.setProgress('sharpshooter', headshotsThisRun);
          achievementSystem.setProgress('deadeye', headshotsThisRun);
        }
        // Speed Demon — 5 kills inside a rolling 10-second window; Blitz — 10.
        recentKillTimes.push(currentTime);
        while (recentKillTimes.length > 0 && currentTime - recentKillTimes[0] > 10000) {
          recentKillTimes.shift();
        }
        if (recentKillTimes.length >= 5) achievementSystem.updateProgress('speed_demon', 1);
        if (recentKillTimes.length >= 10) achievementSystem.updateProgress('blitz', 1);
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
      if (!isTutorialMode && !isGameOver && !playerEliminated
          && waveEnemiesRemaining <= 0 && livingEnemies === 0 && !waveTransitioning) {
        waveTransitioning = true;
        // Flawless — the wave just cleared took no damage. Evaluate before the
        // tracker resets for the next wave. Flawless wave count (single run)
        // drives the Untouchable achievement.
        if (!tookDamageThisWave) {
          achievementSystem.updateProgress('no_damage', 1);
          flawlessWavesThisRun += 1;
          achievementSystem.setProgress('flawless_master', flawlessWavesThisRun);
          if (dailyEnabled) dailyCounts.flawless_wave += 1;
        }
        if (dailyEnabled) {
          // Daily Long-Watch tracks the highest wave reached this RUN, so we
          // keep MAX across all kills/runs today (server-side max reconciliation).
          dailyCounts.wave = Math.max(dailyCounts.wave, wave);
        }
        tookDamageThisWave = false;
        wave++;
        // Snapshot the kill streak BEFORE we reset it so the Streak Keeper
        // perk (applied a few lines down) can restore it.
        const streakBeforeWaveReset = killStreak;
        const lastAwardedBeforeWaveReset = lastStreakAwarded;
        combo = 0;
        killStreak = 0;
        lastStreakAwarded = 0;
        // Survival tiers track the best wave reached across the player's career.
        const reachedWave = Math.max(baseBestWave, wave);
        achievementSystem.setProgress('survivor', reachedWave);
        achievementSystem.setProgress('veteran', reachedWave);
        achievementSystem.setProgress('invincible', reachedWave);
        achievementSystem.setProgress('immortal', reachedWave);
        setShowWaveComplete(true);
        soundManager.play('waveComplete', 1.0);
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Wave ${wave - 1} Complete!`, 'wave');
        // Streak Keeper perk preserves the streak across waves so a god-tier
        // run can keep climbing toward the 20-kill nuke airdrop.
        if (perkBonuses.streakKeeper) {
          killStreak = streakBeforeWaveReset;
          lastStreakAwarded = lastAwardedBeforeWaveReset;
        }
        // Pool exhausted (every perk already picked) → skip the picker and
        // just wait out the celebration banner before spawning the next
        // wave. Same in solo and MP.
        if (isPerkPoolExhausted(runPerks)) {
          waveTimeoutId = window.setTimeout(() => {
            waveTimeoutId = null;
            if (isGameOver || playerEliminated) return;
            setShowWaveComplete(false);
            spawnWave();
            waveTransitioning = false;
          }, 2200);
        } else {
          // Mystery-box flow — shared between solo and multiplayer:
          //   t=0      Wave-complete banner + kill-flash fade. In SOLO the
          //            game-loop freezes (wavePerkActiveRef = true) so the
          //            celebration lands on a still scene; in MP the loop
          //            keeps running so remote players don't appear to
          //            stall (input is still blocked by onKeyDown).
          //   t=2.0s   Pointer lock released. Mystery-box overlay slides in
          //            on a clean dark scrim. MP also gets an 8 s auto-pick
          //            countdown so a distracted player can't stall the
          //            match indefinitely.
          //   resolve  Picker reveals the boxes for ~2.4 s, then this
          //            callback applies the perk (if won), spawns the next
          //            wave and re-locks the pointer.
          const clearedWave = wave - 1;
          const roll = rollMysteryBox(runPerks);
          // SOLO freezes the loop during the celebration AND during the
          // picker. MP keeps the loop running (network heartbeats / remote
          // player updates can't pause), and uses the auto-pick countdown.
          if (!isMultiplayer) wavePerkActiveRef.current = true;
          wavePerkResolverRef.current = (picked: WavePerkId | null) => {
            if (picked) {
              runPerks.push(picked);
              perkBonuses = aggregatePerkBonuses(runPerks);
              applyPerkInstantEffects(picked);
              setActiveRunPerks([...runPerks]);
            } else {
              // CONSOLATION REWARD — empty box pays out a mastery XP bonus
              // so the gamble isn't fully punishing. Scales with the wave
              // cleared (higher waves = bigger consolation) and pipes into
              // the existing weapon-mastery flush. The player also sees
              // a short banner so the moment doesn't feel like nothing.
              const masteryBonus = 25 + clearedWave * 6;
              masteryRunXp[currentWeapon] = (masteryRunXp[currentWeapon] ?? 0) + masteryBonus;
              const lvlBefore = levelFromXp(masteryTotalXp(currentWeapon) - masteryBonus);
              const lvlAfter = levelFromXp(masteryTotalXp(currentWeapon));
              refreshMasteryBonus();
              showPowerMessage(`Consolation · +${masteryBonus} ${WEAPONS[currentWeapon].name} Mastery XP`, 2200);
              if (gameSettingsManager.getSetting('killFeed')) {
                addKillFeedEntry(`+${masteryBonus} ${WEAPONS[currentWeapon].name} XP`, 'powerup');
              }
              soundManager.play('powerUp', 0.45, false, 1.1);
              // If the consolation crossed a mastery level boundary, also
              // surface the level-up so the player sees the milestone.
              if (lvlAfter > lvlBefore && gameSettingsManager.getSetting('killFeed')) {
                addKillFeedEntry(`${WEAPONS[currentWeapon].name} · Mastery L${lvlAfter}`, 'powerup');
              }
            }
            wavePerkActiveRef.current = false;
            wavePerkResolverRef.current = null;
            setWavePerkOffer(null);
            setShowWaveComplete(false);
            spawnWave();
            waveTransitioning = false;
            updateGameState();
            if (!touchControls.enabled) {
              try {
                const lock = (renderer.domElement as HTMLCanvasElement & {
                  requestPointerLock?: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
                }).requestPointerLock?.();
                if (lock && typeof (lock as Promise<void>).catch === 'function') {
                  (lock as Promise<void>).catch(() => { /* user gesture required — ignore */ });
                }
              } catch { /* ignore */ }
            }
          };
          waveTimeoutId = window.setTimeout(() => {
            waveTimeoutId = null;
            if (isGameOver || playerEliminated) return; // raced with death
            // MP freezes input only at picker reveal — until now the loop
            // has been running and the player could still see / be seen.
            if (isMultiplayer) wavePerkActiveRef.current = true;
            try {
              if (typeof document.exitPointerLock === 'function') document.exitPointerLock();
            } catch { /* iOS Safari / unsupported — ignore */ }
            setShowWaveComplete(false);
            setWavePerkOffer({
              wave: clearedWave,
              slots: roll.slots,
              prizeSlotIndex: roll.prizeSlotIndex,
              // MP needs an auto-pick deadline so a distracted player can't
              // hold up the match. Solo can take as long as it wants.
              autoPickAfterMs: isMultiplayer ? 8000 : undefined,
            });
          }, 2000);
        }
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
      type === 'boss' ? 'Boss'
      : type === 'tank' ? 'Tank'
      : type === 'fast' ? 'Stalker'
      : type === 'ranged' ? 'Sniper'
      : 'Forest Creature';

    // Apply incoming enemy damage to the LOCAL player. Shared by the local
    // enemy-attack path (solo + the host's own hits) and, in multiplayer, by
    // the `player_damaged` event the host sends when a shared enemy strikes a
    // remote player. `enemyPos` enables the directional riot-shield check for
    // local hits; network damage passes null (non-directional block).
    const takeEnemyDamage = (incoming: number, enemyLabel: string, enemyPos: THREE.Vector3 | null) => {
      if (phantomActive || invincibleActive || isTutorialMode || playerEliminated) return;

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
        haptic('hurt');
        // Directional threat arc — camera-relative bearing of the attacker
        // (0 = ahead, +right). Only local hits carry an attacker position;
        // networked / environmental damage passes null and is non-directional.
        if (enemyPos) {
          camera.getWorldDirection(_shieldFwd);
          _shieldFwd.y = 0;
          _shieldFwd.normalize();
          _shieldToEnemy.subVectors(enemyPos, camera.position);
          _shieldToEnemy.y = 0;
          _shieldToEnemy.normalize();
          const fwdDot = _shieldFwd.dot(_shieldToEnemy);
          // Horizontal camera-right = forward × up = (-fz, 0, fx).
          const rightDot = -_shieldFwd.z * _shieldToEnemy.x + _shieldFwd.x * _shieldToEnemy.z;
          triggerDamageDirection(Math.atan2(rightDot, fwdDot));
        }
        if (damage >= 15 && gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        if (combo > 0) combo = Math.max(0, combo - 1);
        tookDamageThisWave = true;
        // Close Call — took a hit but clung on below 10 HP.
        if (health > 0 && health < 10) achievementSystem.updateProgress('close_call', 1);
        if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
      }

      updateGameState();

      if (health <= 0) {
        health = 0;
        playerEliminated = true;
        // Commit the game-over / spectate state BEFORE the pointer-lock release.
        // `document.exitPointerLock` is undefined on iOS Safari (Pointer Lock
        // isn't supported on iOS), so calling it unguarded throws a TypeError
        // — which used to leave `isGameOver` false and let the player keep
        // playing with the health bar visibly at zero.
        if (isMultiplayer && multiplayerManager) {
          multiplayerManager.updatePlayerHealth(0);
          const victim = multiplayerManager.getLocalPlayer();
          multiplayerManager.broadcastKill(enemyLabel, victim.id, victim.name, victim.color, enemyLabel);
          setIsSpectating(true);
          updateGameState();
        } else {
          isGameOver = true;
          flushGameState(); // game over must show immediately, not on the next coalesced tick
        }
        try {
          if (typeof document.exitPointerLock === 'function') {
            document.exitPointerLock();
          }
        } catch { /* iOS Safari / unsupported — ignore */ }
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
    // A keyframe (`full`) is the complete authoritative set, so anything we
    // still hold that's absent gets culled. A delta only patches the enemies
    // it carries and must NEVER cull (absent ≠ gone, just unchanged). The
    // guest signalled readiness once warmup finished, so the very first
    // snapshot it receives is always a keyframe.
    const handleEnemySync = (raw: unknown) => {
      if (!isMpGuest) return;
      const msg = raw as { enemies: EnemyWire[]; wave: number; full?: boolean; t?: number };
      const isKeyframe = msg.full !== false; // default true for safety
      // First snapshot from the host → we're in sync; drop the affordance.
      if (mpWaitingForHostRef.current) {
        mpWaitingForHostRef.current = false;
        setMpWaitingForHost(false);
      }

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

      // Map the host's send-time onto our clock so buffered enemy snapshots are
      // spaced by the host's steady send cadence — not our jittery arrival
      // times. The offset tracks the floor (fastest path) and drifts up slowly,
      // mirroring the per-player de-jitter in RemotePlayerManager.
      const recvNow = Date.now();
      let pushTime = recvNow;
      if (typeof msg.t === 'number') {
        // Long silence (lag spike / tab backgrounded) → resync the clock and
        // drop stale buffers so enemies re-snap cleanly instead of sliding
        // across the map when the stream resumes.
        if (recvNow - lastEnemySyncAt > 1500) {
          hostClockReady = false;
          hostNetJitter = 0;
          enemyInterp.forEach((b) => b.reset());
        }
        const offsetSample = recvNow - msg.t;
        if (!hostClockReady) {
          hostClockOffset = offsetSample;
          hostClockReady = true;
        } else if (offsetSample < hostClockOffset) {
          hostClockOffset += (offsetSample - hostClockOffset) * 0.5; // track faster path
        } else {
          hostClockOffset = Math.min(hostClockOffset + 0.5, offsetSample); // slow drift for clock skew
        }
        const dev = offsetSample - hostClockOffset;
        hostNetJitter = Math.max(dev, hostNetJitter * 0.97);
        pushTime = msg.t + hostClockOffset;
        // Size the playback delay to the host cadence + measured jitter (grow
        // fast to stay ahead of starvation, shrink slow to reclaim latency).
        const targetDelay = THREE.MathUtils.clamp(ENEMY_SYNC_INTERVAL_MS + 25 + hostNetJitter * 1.6, 120, 360);
        enemyRenderDelay += (targetDelay - enemyRenderDelay) * (targetDelay > enemyRenderDelay ? 0.25 : 0.02);
      }
      lastEnemySyncAt = recvNow;

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
        // Feed the interpolation buffer (only living enemies move — a dead
        // one freezes at its last spot and plays its death animation).
        if (!w.d) {
          let buf = enemyInterp.get(w.id);
          if (!buf) { buf = new SnapshotInterpolator({ capacity: 16, maxExtrapolationMs: 180 }); enemyInterp.set(w.id, buf); }
          buf.push(pushTime, w.x, w.y, w.z, w.ry);
        }
        if (w.d && !e.dead) {
          e.dead = true;
          e.deathTime = 1.0;
          if (Math.random() < 0.26) {
            const spot = findPickupSpot(e.mesh.position.x, e.mesh.position.z, 1.2, 3.5);
            powerUps.push(createPowerUp(spot.x, spot.z, randomLoot()));
          }
        }
      }

      // Only a keyframe is authoritative about which enemies still exist.
      // On a delta, absent enemies are simply unchanged — leave them be.
      if (isKeyframe) {
        enemyByNetId.forEach((e, id) => {
          if (!seen.has(id) && !e.dead) {
            e.dead = true;
            e.deathTime = 1.0;
          }
        });
      }
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

      // Host: a guest just finished warming up. Force the next snapshot to be
      // a full keyframe so the freshly-arrived player sees every enemy at once
      // (rather than waiting up to a keyframe interval).
      remotePlayerUnsubs.push(mp.onMessage('client_ready', () => {
        if (isMpHost) forceEnemyKeyframe = true;
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
    // The animated fireball + shockwave + pooled light is owned by
    // ExplosionEffect (updated in the animate loop). NO fresh PointLight is
    // added per blast — that was the recompile stutter the user reported.
    const spawnExplosionFX = (pos: THREE.Vector3, radius = 9) => {
      soundManager.play('enemyDeath', 0.9);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      createParticles(pos, 0xff7722, 44);
      createParticles(pos, 0x222222, 22);
      explosionEffects.push(new ExplosionEffect(scene, pos, radius));
      createCrater(pos);
    };

    // Detonates a rocket — area-of-effect damage with distance falloff.
    // ── EXPLOSIVE BARREL DETONATION ──────────────────────────────────────
    // A barrel that just took fatal damage. Removes it from the scene,
    // bursts an FX flash, then deals radius damage to every nearby entity
    // — including the player. Falloff matches rocket-explosion math.
    // Chains: any other barrel inside the blast radius gets queued for
    // detonation on the next frame, so clustered barrels read as a
    // satisfying chain-reaction without recursion stack overflow risk.
    const pendingBarrelDetonations: ExplosiveBarrel[] = [];
    const detonateBarrel = (barrel: ExplosiveBarrel) => {
      if (barrel.detonated) return;
      barrel.detonated = true;
      const epos = barrel.mesh.position.clone();
      spawnExplosionFX(epos, barrel.blastRadius);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      soundManager.play('powerUp', 0.9, false, 0.7); // dirty low-pitched boom
      // Enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.dead) continue;
        const dist = e.mesh.position.distanceTo(epos);
        if (dist > barrel.blastRadius) continue;
        const falloff = 1 - (dist / barrel.blastRadius) * 0.75;
        const dmg = barrel.blastDamage * falloff;
        if (isMpGuest && mp) {
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
        } else {
          e.health -= dmg;
        }
        e.damageFlashTime = 0.45;
        if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
      }
      // Other barrels — chain reaction.
      for (let b = 0; b < barrels.length; b++) {
        const other = barrels[b];
        if (other === barrel || other.detonated) continue;
        if (other.mesh.position.distanceTo(epos) <= barrel.blastRadius * 0.9) {
          pendingBarrelDetonations.push(other);
        }
      }
      // Player — barrels are friendly fire too. Standing next to one when
      // it pops is on you.
      const playerDist = Math.hypot(camera.position.x - epos.x, camera.position.z - epos.z);
      if (playerDist <= barrel.blastRadius) {
        const falloff = 1 - (playerDist / barrel.blastRadius) * 0.75;
        takeEnemyDamage(barrel.blastDamage * falloff, 'Explosive Barrel', null);
      }
      // Yank from world + free up the slot.
      scene.remove(barrel.mesh);
      const idx = barrels.indexOf(barrel);
      if (idx !== -1) barrels.splice(idx, 1);
    };

    // Pump the chain-reaction queue. Called once per frame so a single
    // detonation cascades over several frames (reads as a "boom boom boom"
    // rather than a single instant disappearance), and never blows the call
    // stack even on a cluster of dozens of barrels.
    const processBarrelChain = () => {
      if (pendingBarrelDetonations.length === 0) return;
      // Take a snapshot — anything detonated here that chains AGAIN will
      // be queued for the NEXT frame.
      const queue = pendingBarrelDetonations.splice(0, pendingBarrelDetonations.length);
      for (const b of queue) detonateBarrel(b);
    };

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
      // Chain-detonate any barrels inside the rocket's blast.
      for (let b = 0; b < barrels.length; b++) {
        const barrel = barrels[b];
        if (barrel.detonated) continue;
        if (barrel.mesh.position.distanceTo(pos) <= RADIUS) {
          pendingBarrelDetonations.push(barrel);
        }
      }
    };

    // Photo Mode camera driver: WASD pans, Space/Shift change height, all
    // clamped to a circular perimeter around the entry anchor. Mouse-drag
    // updates `euler` (handled in onMouseMove); here we just apply it.
    const updatePhotoCamera = (dt: number) => {
      camera.getWorldDirection(_moveDirection);
      _moveDirection.y = 0;
      _moveDirection.normalize();
      _moveRight.crossVectors(camera.up, _moveDirection).normalize();

      const step = 6 * dt; // metres/sec
      let nx = camera.position.x;
      let nz = camera.position.z;
      let ny = camera.position.y;
      if (moving('moveForward')) { nx += _moveDirection.x * step; nz += _moveDirection.z * step; }
      if (moving('moveBackward')) { nx -= _moveDirection.x * step; nz -= _moveDirection.z * step; }
      if (moving('moveLeft')) { nx += _moveRight.x * step; nz += _moveRight.z * step; }
      if (moving('moveRight')) { nx -= _moveRight.x * step; nz -= _moveRight.z * step; }
      if (held('jump')) ny += step;
      if (held('sprint')) ny -= step;

      // Clamp to the perimeter (XZ radius around the anchor) + a height band.
      const dx = nx - photoAnchor.x;
      const dz = nz - photoAnchor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > PHOTO_PERIMETER) {
        nx = photoAnchor.x + (dx / dist) * PHOTO_PERIMETER;
        nz = photoAnchor.z + (dz / dist) * PHOTO_PERIMETER;
      }
      ny = Math.max(PHOTO_MIN_Y, Math.min(PHOTO_MAX_Y, ny));
      camera.position.set(nx, ny, nz);
      camera.quaternion.setFromEuler(euler);

      // Apply the scroll-driven zoom (FOV) for framing.
      if (Math.abs(camera.fov - photoFov) > 0.01) {
        camera.fov = photoFov;
        camera.updateProjectionMatrix();
      }
    };

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Skip expensive updates when tab is not visible (major performance optimization)
      if (!isTabVisible) {
        return;
      }

      // Clamp the frame delta to a ~10 FPS floor. After a hidden/inactive tab or
      // a GC/stutter, clock.getDelta() can return a huge value that would make
      // bullets tunnel through enemies, teleport AI, and explode the death
      // ragdoll / casing physics. Normal frames (16–33 ms) are far below the cap,
      // so steady-state gameplay is byte-for-byte unaffected — this only tames the
      // spike frame. (See also the isTabVisible early-return above.)
      const rawDelta = Math.min(clock.getDelta(), 0.1);
      const delta = rawDelta * timeScale; // Apply slow-mo effect

      // Flush any pending HUD update at a capped rate (see flushGameState) so
      // sustained fire can't trigger a React re-render per shot/hit/kill.
      if (hudDirty) {
        const _hudNow = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (_hudNow - lastHudFlushMs >= HUD_MIN_INTERVAL_MS) flushGameState();
      }

      // Update FPS counter
      updateFPS();

      // Track frame count
      if (frameCount < 3) {
        frameCount++;
      }

      // Update day-night cycle system
      // Freeze the day-night cycle during a photoshoot so the lighting the
      // player framed doesn't drift while they compose the shot.
      atmosphericSettings = dayCycleSystem.update(photoModeRef.current ? 0 : delta);
      renderAtmosphere = getRenderAtmosphere();

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
      groundShaderUniforms.uSunColor.value.setHex(renderAtmosphere.lightColor);
      const sunAlt = THREE.MathUtils.clamp(sunDirection.y, 0, 1);
      const isNightShader = !renderAtmosphere.sunVisible;
      // Incident boost is SMALL — just a hint of warmth on sun-facing
      // surfaces. Pow(N·L,3) inside the shader does the directional
      // sharpening.
      groundShaderUniforms.uIncidentBoost.value = isNightShader
        ? 0.04 * (renderProfile.groundSpecular ?? 1.0)
        : (0.08 + sunAlt * 0.10) * (renderProfile.groundSpecular ?? 1.0);
      // Specular is what makes the ground look "polished / wet" — bigger
      // contribution than the diffuse boost. Still bounded so it never
      // crosses the bloom threshold uniformly.
      groundShaderUniforms.uSpecularStrength.value = isNightShader
        ? 0.14 * (renderProfile.groundSpecular ?? 1.0)
        : (0.28 + sunAlt * 0.26) * (renderProfile.groundSpecular ?? 1.0);
      groundShaderUniforms.uNormalStrength.value = 0.26 * (renderProfile.groundNormal ?? 1.0);
      groundShaderUniforms.uPatchStrength.value = 0.18 * (renderProfile.groundPatch ?? 1.0);
      groundShaderUniforms.uIsNight.value = isNightShader ? 1.0 : 0.0;

      // Apply updated atmospheric settings to scene (optimized - update existing fog instead of recreating)
      // Special-weather maps keep their distinctive fog/sky every frame —
      // otherwise the day-cycle would overwrite the map's atmosphere after the
      // first frame, making every map look the same.
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(renderAtmosphere.fogColor);
        scene.fog.density = renderAtmosphere.fogDensity;
      }
      if (scene.background instanceof THREE.Color) {
        scene.background.setHex(renderAtmosphere.skyColor);
      }
      biomeSystem.updateGroundMaterial(ground, mapConfig.primaryBiome, getGroundOverride());
      groundMaterial.emissiveIntensity = renderAtmosphere.sunVisible ? 0.0 : 0.12;

      // Update main light — position follows player so shadow frustum stays on-screen.
      // Multiplier matches the init-time 1.6× so the bright-sun look is
      // preserved across day-cycle transitions (don't overwrite!).
      mainLight.color.setHex(renderAtmosphere.lightColor);
      mainLight.intensity = renderAtmosphere.lightIntensity * 1.6;
      mainLightBaseOffset.set(
        renderAtmosphere.lightPosition.x,
        renderAtmosphere.lightPosition.y,
        renderAtmosphere.lightPosition.z
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
        renderAtmosphere.lightPosition.x * 0.5,
        renderAtmosphere.lightPosition.y * 0.8,
        renderAtmosphere.lightPosition.z * 0.5
      );
      volumetricLight.color.setHex(renderAtmosphere.sunVisible ? 0xffe8b8 : 0x9ab2e6);
      volumetricLight.intensity = (renderAtmosphere.sunVisible ? 0.55 : 0.5) * (renderProfile.volumetricLight ?? 1.0);
      volumetricLight.position.set(
        camera.position.x + volumetricLightBaseOffset.x,
        volumetricLightBaseOffset.y,
        camera.position.z + volumetricLightBaseOffset.z
      );
      volumetricLight.target.position.set(camera.position.x, 0, camera.position.z);
      volumetricLight.target.updateMatrixWorld();

      fillLightBaseOffset.set(
        -renderAtmosphere.lightPosition.x * 0.6,
        renderAtmosphere.lightPosition.y * 0.4,
        -renderAtmosphere.lightPosition.z * 0.6
      );
      fillLight.color.setHex(renderAtmosphere.sunVisible ? 0xbcd6ff : 0x7a92d2);
      fillLight.intensity = (renderAtmosphere.sunVisible ? 0.55 : 0.7) * (renderProfile.fillLight ?? 1.0);
      fillLight.position.set(
        camera.position.x + fillLightBaseOffset.x,
        fillLightBaseOffset.y,
        camera.position.z + fillLightBaseOffset.z
      );
      fillLight.target.position.set(camera.position.x, 0, camera.position.z);
      fillLight.target.updateMatrixWorld();

      rimLightBaseOffset.set(
        renderAtmosphere.lightPosition.x * 0.3,
        renderAtmosphere.lightPosition.y * 1.2,
        renderAtmosphere.lightPosition.z
      );
      rimLight.color.setHex(renderAtmosphere.sunVisible ? 0xffffff : 0xc4d2ff);
      rimLight.intensity = (renderAtmosphere.sunVisible ? 0.55 : 0.8) * (renderProfile.rimLight ?? 1.0);
      rimLight.position.set(
        camera.position.x + rimLightBaseOffset.x,
        rimLightBaseOffset.y,
        camera.position.z + rimLightBaseOffset.z
      );
      rimLight.target.position.set(camera.position.x, 0, camera.position.z);
      rimLight.target.updateMatrixWorld();

      // Multiplier matches init (0.8×) — readable shadow detail without
      // washing out the lit/shadow contrast.
      ambientLight.color.setHex(renderAtmosphere.ambientColor);
      ambientLight.intensity = renderAtmosphere.ambientIntensity * 0.8;

      // Keep hemisphere light synced with current sky & ground tones.
      // Multiplier matches init (0.75×) so shadowed surfaces keep their
      // cool sky-tint fill. setHex + multiplyScalar avoids the per-frame
      // `new THREE.Color()` allocation.
      skyLight.color.setHex(renderAtmosphere.skyColor);
      skyLight.groundColor.setHex(renderAtmosphere.skyColor).multiplyScalar(0.35);
      skyLight.intensity = renderAtmosphere.ambientIntensity * 0.75;

      // Nighttime moonlight fill + attached lantern so players can see
      nightFillLight.intensity = renderAtmosphere.sunVisible ? 0.0 : 1.8;
      playerNightLantern.intensity = renderAtmosphere.sunVisible ? 0.0 : 2.4;

      // Keep the sky dome centered on the player so the player never walks
      // "outside" the sphere (which is what caused the giant-blob glitch).
      skyDome.position.set(camera.position.x, 0, camera.position.z);

      if (atmosphericHaze && hazeMaterial) {
        atmosphericHaze.position.copy(camera.position);
        hazeMaterial.uniforms.time.value += delta;
        hazeMaterial.uniforms.hazeColor.value.setHex(renderAtmosphere.fogColor);
        hazeMaterial.uniforms.sunPosition.value.set(
          renderAtmosphere.lightPosition.x,
          renderAtmosphere.lightPosition.y,
          renderAtmosphere.lightPosition.z
        );
        hazeMaterial.uniforms.isNight.value = !renderAtmosphere.sunVisible;
        hazeMaterial.uniforms.density.value =
          (graphicsQuality === 'ultra' ? 0.10 : graphicsQuality === 'high' ? 0.08 : 0.06) *
          (renderProfile.hazeDensity ?? 1.0) *
          (renderAtmosphere.sunVisible ? 1.0 : 0.82);
      }

      if (hdriEnvironmentProfile) {
        scene.environmentIntensity = getHDRIEnvironmentIntensity(
          hdriEnvironmentProfile,
          renderAtmosphere.sunVisible,
          renderAtmosphere.ambientIntensity,
        ) * (renderProfile.environmentIntensity ?? 1.0);
      }

      // Push live grading into the post-processing chain so dusk/dawn/night
      // colour shifts read on screen as the day cycle advances.
      postFX?.updateAtmosphere({
        saturation: renderAtmosphere.saturation,
        contrast: renderAtmosphere.contrast,
        temperature: renderAtmosphere.temperature,
        exposure: renderAtmosphere.exposure,
        bloomStrength: renderAtmosphere.bloomStrength,
        colorTint: renderAtmosphere.colorTint,
        sunDirection,
        isNight: !renderAtmosphere.sunVisible,
        godRayStrength: renderProfile.godRayStrength,
        aerialPerspective: renderProfile.aerialPerspective,
        highlightRecovery: renderProfile.highlightRecovery,
        highlightDesaturation: renderProfile.highlightDesaturation,
        vibranceScale: renderProfile.vibrance,
        shadowLiftScale: renderProfile.shadowLift,
      });

      // Update sky dome shader
      if (skyMaterial.uniforms.time) {
        skyMaterial.uniforms.time.value += delta;
      }
      if (skyMaterial.uniforms.sunPosition) {
        skyMaterial.uniforms.sunPosition.value.set(
          renderAtmosphere.lightPosition.x,
          renderAtmosphere.lightPosition.y,
          renderAtmosphere.lightPosition.z
        );
      }
      if (skyMaterial.uniforms.isNight) {
        skyMaterial.uniforms.isNight.value = !renderAtmosphere.sunVisible;
      }
      // Keep the sky gradient synced with the day-night cycle (and the map's
      // own atmosphere for special-weather maps) so it never drifts dark.
      if (skyMaterial.uniforms.skyColorTop) {
        skyMaterial.uniforms.skyColorTop.value.setHex(renderAtmosphere.skyColor);
      }
      if (skyMaterial.uniforms.skyColorHorizon) {
        skyMaterial.uniforms.skyColorHorizon.value.setHex(renderAtmosphere.fogColor);
      }

      // === UPDATE ENHANCED SYSTEMS ===
      // Update ability system
      const abilityEffects = abilitySystem.update(delta);

      // === SKILL TREE: refresh bonus snapshot + reconcile max health ===
      // Re-read the unlocked-skill bonuses a few times a second so a point spent
      // mid-run applies almost immediately. The only health touch here is the
      // Thick Skin max-health raise — there is NO health regeneration in the
      // game; HP only ever goes down (or up via a higher max).
      skillBonusAccum += rawDelta;
      if (skillBonusAccum >= 0.4) {
        skillBonusAccum = 0;
        skillBonuses = skillTree.calculateStatBonuses();
        // Combine skill maxHealth + Iron Lung perk's maxHpBonus + the Run
        // Modifier's multiplier (Berserker / Glass Cannon) + MP character
        // passive (Heavy +20%) — single source-of-truth cap.
        const newMax = Math.max(
          10,
          Math.floor((100 + (skillBonuses['maxHealth'] || 0)) * (runMods.playerMaxHpMult ?? 1) * (mpMods.maxHpMult ?? 1)) + perkBonuses.maxHpBonus,
        );
        if (newMax > playerMaxHealth) {
          // Thick Skin (skill) or Iron Lung (perk) was just upgraded — grant
          // the added max as current HP too so raising the cap actually fills.
          health = Math.min(newMax, health + (newMax - playerMaxHealth));
        }
        playerMaxHealth = newMax;
        if (health > playerMaxHealth) health = playerMaxHealth;
      }
      // Daily Challenge — flush cumulative progress to convex every ~3 s.
      // Throttled so a hot streak doesn't spam mutations.
      if (dailyEnabled) {
        dailyFlushAccum += rawDelta;
        if (dailyFlushAccum >= 3) {
          dailyFlushAccum = 0;
          dailyFlush();
        }
      }
      // Weapon Mastery — flush per-weapon XP deltas every ~8 s (less
      // frequent than the daily flush; mastery XP is high-volume + the
      // server caps grant size anyway).
      if (isAuthenticated && !isTutorialMode) {
        masteryFlushAccum += rawDelta;
        if (masteryFlushAccum >= 8) {
          masteryFlushAccum = 0;
          flushMasteryXp();
        }
      }
      // Per-second HP regen — sum of wave-perk Adrenaline + MP Medic passive.
      // Done here (not inside the throttle) so the rate is stable at any FPS;
      // `perkRegenAccum` carries fractional HP between frames.
      const totalRegen = perkBonuses.regenPerSec + (mpMods.regenPerSec ?? 0);
      if (totalRegen > 0 && health > 0 && health < playerMaxHealth) {
        perkRegenAccum += totalRegen * rawDelta;
        if (perkRegenAccum >= 1) {
          const gained = Math.floor(perkRegenAccum);
          perkRegenAccum -= gained;
          health = Math.min(playerMaxHealth, health + gained);
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
            key: 'Q', name: activeAbility.name, kind: 'dash',
            abilityId: activeAbility.id,
            accent: activeAbility.color,
            cooldown: abilityCooldown <= 0 ? 1 : Math.max(0, 1 - abilityCooldown / abilityCooldownMax),
            active: isDashing || Date.now() < abilityActiveUntil,
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

      // Process queued explosive-barrel chain reactions. Done once per frame
      // so a cluster pops as a satisfying staccato instead of one instant
      // multi-explosion vanishing trick.
      processBarrelChain();

      // === RANGED SENTINEL TURRETS ===
      // Each turret idles until the player is within range, then telegraphs
      // a shot (head glows brighter) for ~1s before firing. Dormant until
      // wave 3 so the first two waves are pure "learn the basics" before
      // the player has to factor in long-range pressure.
      if (sentinels.length > 0 && wave >= 3 && !playerEliminated && !isGameOver) {
        const dtMs = rawDelta * 1000;
        for (let s = 0; s < sentinels.length; s++) {
          const sentinel = sentinels[s];
          if (sentinel.destroyed) continue;
          const dxS = camera.position.x - sentinel.mesh.position.x;
          const dzS = camera.position.z - sentinel.mesh.position.z;
          const distSq = dxS * dxS + dzS * dzS;
          if (distSq > sentinel.range * sentinel.range) {
            // Out of range — drop any in-progress charge silently.
            sentinel.isCharging = false;
            sentinel.chargeMs = 0;
            continue;
          }
          // First-encounter banner — fires the moment a sentinel first
          // pings the player.
          if (!sentinelIntroFired) {
            sentinelIntroFired = true;
            setEnemyIntro({
              id: Date.now(),
              name: 'Ranged Sentinel',
              tag: 'TURRET · TELEGRAPHED LASER',
              blurb: 'Glowing head means it\'s aimed at you. Move before it fires.',
              accent: '#f87171',
              icon: 'crosshair',
            });
          }
          if (sentinel.isCharging) {
            sentinel.chargeMs += dtMs;
            updateSentinelGlow(sentinel);
            if (sentinel.chargeMs >= sentinel.chargeDurationMs) {
              // Fire — hitscan check with a line-of-sight test against
              // terrain so a tree between us and the sentinel saves the
              // player. Without LOS the sentinels read as unfair sniper
              // turrets shooting through walls.
              const distNow = Math.hypot(dxS, dzS);
              let lineOfSight = distNow <= sentinel.range;
              if (lineOfSight) {
                const nearby = terrainGrid.queryRadius(
                  (sentinel.mesh.position.x + camera.position.x) * 0.5,
                  (sentinel.mesh.position.z + camera.position.z) * 0.5,
                  distNow * 0.5 + 2,
                );
                for (let nn = 0; nn < nearby.length; nn++) {
                  const obj = terrainObjects[nearby[nn]];
                  if (!obj || !obj.collidable) continue;
                  // Quick segment-vs-circle test in 2D.
                  const px = obj.x - sentinel.mesh.position.x;
                  const pz = obj.z - sentinel.mesh.position.z;
                  const lx = camera.position.x - sentinel.mesh.position.x;
                  const lz = camera.position.z - sentinel.mesh.position.z;
                  const lenSq = lx * lx + lz * lz;
                  const t = Math.max(0, Math.min(1, (px * lx + pz * lz) / lenSq));
                  const cx = lx * t - px;
                  const cz = lz * t - pz;
                  if (cx * cx + cz * cz < obj.radius * obj.radius) {
                    lineOfSight = false;
                    break;
                  }
                }
              }
              if (lineOfSight) {
                takeEnemyDamage(sentinel.damage, 'Sentinel Laser', sentinel.mesh.position);
              }
              // Visible tracer for feedback — always rendered so the player
              // sees the shot even when terrain blocked it.
              bulletTracers.push(new BulletTracer(
                scene,
                new THREE.Vector3(sentinel.mesh.position.x, sentinel.mesh.position.y + 1.6, sentinel.mesh.position.z),
                camera.position.clone(),
                0xff3322,
              ));
              soundManager.play('shoot_pistol', 0.55, false, 0.6);
              sentinel.isCharging = false;
              sentinel.chargeMs = 0;
              sentinel.cooldownMs = sentinel.cooldownDurationMs;
              // Reset head glow to idle.
              (sentinel.head.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
            }
          } else if (sentinel.cooldownMs > 0) {
            sentinel.cooldownMs -= dtMs;
          } else {
            // Just transitioned from cooldown → charging. Audio warning so
            // the player can react even when not looking. Pitch scales by
            // distance so close turrets sound louder/lower.
            sentinel.isCharging = true;
            sentinel.chargeMs = 0;
            const proximity = 1 - Math.min(1, Math.sqrt(distSq) / sentinel.range);
            soundManager.play('powerUp', 0.25 + proximity * 0.25, false, 1.6 - proximity * 0.4);
          }
        }
      }

      // Update enhanced power-ups (airdrops). Killstreak rewards descend
      // under a parachute and land near the player; on touch we apply the
      // effect IMMEDIATELY (these aren't held / queued like loot crates).
      enhancedPowerUps.updateAirdrops(delta, scene);
      if (!playerEliminated && !isGameOver) {
        const playerX = camera.position.x;
        const playerZ = camera.position.z;
        for (const drop of enhancedPowerUps.getAirdrops()) {
          if (!drop.landed || drop.collected) continue;
          const ddx = drop.mesh.position.x - playerX;
          const ddz = drop.mesh.position.z - playerZ;
          if (ddx * ddx + ddz * ddz < 6) { // ~2.5m pickup radius
            const type = enhancedPowerUps.collectAirdrop(drop);
            applyKillstreakReward(type);
          }
        }
      }

      // === UPDATE AI SYSTEMS ===
      // Update adaptive difficulty every 5 seconds
      if (frameCount % 300 === 0 && gameSettings.adaptiveDifficulty) {
        adaptiveDifficulty.update(delta * 300);
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
          maxHealth: playerMaxHealth,
          currentWeapon,
          ammo,
          maxAmmo: effectiveMaxAmmo(currentWeapon),
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

      // ─── PHOTO MODE ─────────────────────────────────────────────────────
      // The world is frozen (enemies, shooting, timers all skipped) but the
      // player can roam a small perimeter and free-look to frame a shot. The
      // scene still renders so the live CSS filter preview is accurate.
      if (photoModeRef.current && !isGameOver) {
        if (!photoActive) {
          // Entering: remember the real viewpoint, anchor the perimeter here,
          // and hide the first-person gun so it never photobombs the shot.
          photoActive = true;
          photoReturnPos.copy(camera.position);
          photoReturnEuler.copy(euler);
          photoAnchor.copy(camera.position);
          photoFov = baseFOV; // start zoom at the player's configured FOV
          gunModel.group.visible = false;
        }
        updatePhotoCamera(rawDelta);
        composePostFX(rawDelta);
        return;
      } else if (photoActive) {
        // Exiting: restore the player's real viewpoint + gun so gameplay
        // resumes exactly where it left off (the shoot was non-destructive).
        photoActive = false;
        photoDragging = false;
        camera.position.copy(photoReturnPos);
        euler.copy(photoReturnEuler);
        camera.quaternion.setFromEuler(euler);
        gunModel.group.visible = true;
      }

      // Freeze the whole simulation while a tutorial overlay card is on screen
      // — the scene still renders, but nothing moves and enemies cannot attack.
      // `orientationBlockedRef` adds the touch-portrait freeze (rotate prompt).
      // Wave-perk picker freezes the simulation in SOLO (and tutorial) so the
      // celebration moment lands on a still scene. In multiplayer the loop
      // KEEPS RUNNING — remote-player updates and host enemy snapshots must
      // not stall — and `onKeyDown` blocks the local player's input instead.
      const perkFreezesSim = wavePerkActiveRef.current && !isMultiplayer;
      if (isGameOver || paused || tutorialActiveRef.current || orientationBlockedRef.current || perkFreezesSim) {
        composePostFX(rawDelta);
        return;
      }

      // ── TOUCH LOOK + ADS ── consume the right-half swipe delta into the base
      // aim (`euler`), mirroring the desktop onMouseMove handler, and mirror the
      // ADS button into `isAiming`. Guarded so the desktop path is untouched.
      if (touchControls.enabled) {
        const tSens = 0.0032 * sensitivityMultiplier;
        const ldx = touchControls.consumeLookX();
        const ldy = touchControls.consumeLookY();
        const looked = ldx !== 0 || ldy !== 0;
        if (looked) {
          euler.y -= ldx * tSens;
          euler.x -= ldy * tSens;
          euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
          if (isTutorialMode) tutorial.recordAction('look', 1);
        }
        isAiming = touchControls.aiming && WEAPONS[currentWeapon].canAim === true;

        // ── AIM ASSIST (mobile/tablet only) ── console-style magnetism: while
        // firing, aiming, or actively swiping, gently rotate the camera toward
        // the nearest enemy inside a small acquisition cone. It never fully
        // locks — a deliberate swipe always overrides it — and stays idle when
        // the player isn't interacting, so the camera never drifts on its own.
        const firing = mouseDown || touchControls.aiming;
        if (firing || looked) {
          camera.getWorldDirection(_assistFwd);
          const ACQUIRE_COS = 0.978; // ~12° cone
          const ASSIST_RANGE = 75;
          let bestEnemy: Enemy | null = null;
          let bestDot = ACQUIRE_COS;
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead || e.health <= 0) continue;
            _assistDir.set(e.mesh.position.x, e.mesh.position.y + 1.1, e.mesh.position.z).sub(camera.position);
            const dist = _assistDir.length();
            if (dist < 3 || dist > ASSIST_RANGE) continue;
            _assistDir.multiplyScalar(1 / dist);
            const dot = _assistDir.dot(_assistFwd);
            if (dot > bestDot) { bestDot = dot; bestEnemy = e; }
          }
          if (bestEnemy) {
            _assistDir.set(bestEnemy.mesh.position.x, bestEnemy.mesh.position.y + 1.1, bestEnemy.mesh.position.z)
              .sub(camera.position).normalize();
            const targetYaw = Math.atan2(-_assistDir.x, -_assistDir.z);
            const targetPitch = Math.asin(Math.max(-1, Math.min(1, _assistDir.y)));
            let dY = targetYaw - euler.y;
            while (dY > Math.PI) dY -= Math.PI * 2;
            while (dY < -Math.PI) dY += Math.PI * 2;
            const dX = targetPitch - euler.x;
            // Soft pull, scaled by how centered the target is (gentler at the edge).
            const closeness = (bestDot - ACQUIRE_COS) / (1 - ACQUIRE_COS);
            const pull = (firing ? 0.20 : 0.06) * (0.35 + 0.65 * closeness);
            euler.y += dY * pull;
            euler.x += dX * pull;
            euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
          }
        }
      }

      // Right-click ADS is live for every weapon now. `aimingActive` is the
      // single source of truth for the zoom, gun pose and crosshair — and it's
      // mutually exclusive with sprinting (see below), so the COD-style flow is
      // "sprinting drops the sights; aim brings them back up".
      const aimingActive = isAiming && WEAPONS[currentWeapon].canAim === true;

      // Update gun animations - recoil handles its own offset
      gunModel.updateRecoil(delta);

      // Re-read live-tunable settings a few times a second so changes made in
      // the settings menu (even mid-game from the pause screen) apply live.
      // One getSettings() parse covers FOV + Screen Shake (was a getSetting per
      // value), so this is no costlier than the old FOV-only re-read.
      fovCheckAccum += rawDelta;
      if (fovCheckAccum >= 0.4) {
        fovCheckAccum = 0;
        const liveSettings = gameSettingsManager.getSettings();
        if (typeof liveSettings.fov === 'number' && liveSettings.fov > 0) baseFOV = liveSettings.fov;
        screenShakeOn = liveSettings.screenShake;
      }

      // Aiming zoom — a consistent ~22° zoom relative to the chosen FOV
      const targetFov = aimingActive
        ? Math.max(40, baseFOV - 22)
        : baseFOV;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov + fovPunch, delta * 8);
      camera.updateProjectionMatrix();
      // Keep the first-person weapon a constant on-screen size despite the ADS
      // FOV zoom (it's a camera child, so zoom would otherwise magnify it into
      // a screen-filling blob).
      gunModel.setViewmodelFovScale(camera.fov, baseFOV);
      // Decay FOV punch
      fovPunch *= 0.92;

      // === CAMERA RECOIL ===
      // Recover the recoil kick smoothly, then compose (base aim + recoil)
      // into the final camera rotation. Aiming down sights tightens recoil.
      const recoilRecover = Math.min(1, rawDelta * 9.5);
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

      // Update ability cooldown (real-time, shared by every character ability)
      if (abilityCooldown > 0) {
        abilityCooldown -= rawDelta;
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
        // No setPowerUpMessage('') here — the managed message timer owns the
        // pill, and this stray clear used to wipe whatever NEWER message was
        // showing the instant the boost ran out.
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
      if (rapidFireActive && now >= rapidFireEndTime) {
        rapidFireActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Rapid Fire Expired', 'powerup');
      }
      if (invincibleActive && now >= invincibleEndTime) {
        invincibleActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Invincibility Expired', 'powerup');
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

      // Player movement with weight-based speed and ability effects.
      // On touch, the analog joystick contributes to both "is moving" and the
      // sprint intent (pushed to the outer ring).
      const touchMoving = touchControls.enabled && touchControls.moving;
      const isMoving = moving('moveForward') || moving('moveBackward') || moving('moveLeft') || moving('moveRight') || touchMoving;
      if (isTutorialMode && isMoving) tutorial.recordAction('move', 1); // advances the movement step
      const wantsToSprint = (held('sprint') || (touchControls.enabled && touchControls.sprinting)) && !isCrouching;
      // Stamina gates sprinting. Once exhausted, the player must let
      // stamina rebuild past STAMINA_REQUIRED_TO_SPRINT before they
      // can sprint again — prevents 0-stamina stutter-sprint exploit.
      if (staminaExhausted && stamina >= STAMINA_REQUIRED_TO_SPRINT) {
        staminaExhausted = false;
      }
      // Aiming down sights cancels the sprint (COD-style) so the two poses
      // never fight each other — release aim to sprint again.
      const isRunning = wantsToSprint && isMoving && !staminaExhausted && !aimingActive;

      // Tick stamina. While sprinting it depletes; when not, after a
      // short idle delay, it regenerates.
      // Tutorial mode grants UNLIMITED stamina — new players should be free to
      // sprint, dash and reposition endlessly while learning, without a meter
      // to babysit. The pool is pinned full and exhaustion can never trigger.
      if (isTutorialMode) {
        stamina = STAMINA_MAX;
        staminaExhausted = false;
        staminaIdleTimer = 0;
      } else if (isRunning) {
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

      const baseSpeed = moveSpeed * weightSpeedMultiplier * abilityEffects.speedMultiplier * powerupSpeedMult * crouchMult * (1 + skillBonus('moveSpeed')) * (mpMods.speedMult ?? 1);
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
      gunModel.updateAim(delta, aimingActive);
      // AAA-style strafe lean — tilt the weapon toward sideways movement (most
      // pronounced while aiming). +1 = strafing right, −1 = left; touch uses the
      // joystick's horizontal axis.
      let strafeInput = 0;
      if (moving('moveLeft')) strafeInput -= 1;
      if (moving('moveRight')) strafeInput += 1;
      if (strafeInput === 0 && touchControls.enabled && touchControls.moving) {
        strafeInput = THREE.MathUtils.clamp(-touchControls.moveX, -1, 1);
      }
      gunModel.updateStrafe(delta, strafeInput, aimingActive);
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

        // ── TRAMPLE — the Ranger's charge bowls through robots ────────────
        // Any robot caught within the charge radius takes the full force of
        // the impact: standard chassis are killed outright and launched
        // forward along the charge (run-over ragdoll); heavy chassis (tank /
        // boss / mini-boss) survive with chunk damage + a hard shove so the
        // 5s-cooldown charge can't trivialise the big fights. Each enemy is
        // hit at most once per charge (dashHitEnemies).
        const TRAMPLE_RADIUS_SQ = 2.6 * 2.6;
        for (let di = 0; di < enemies.length; di++) {
          const te = enemies[di];
          if (te.dead || dashHitEnemies.has(te)) continue;
          const tdx = te.mesh.position.x - camera.position.x;
          const tdz = te.mesh.position.z - camera.position.z;
          if (tdx * tdx + tdz * tdz > TRAMPLE_RADIUS_SQ) continue;
          dashHitEnemies.add(te);

          const heavyChassis = te.type === 'tank' || te.type === 'boss' || te.isMiniBoss === true;
          const trampleDmg = heavyChassis
            ? Math.max(60, te.maxHealth * 0.3)   // heavy: real damage, not lethal
            : te.maxHealth + 50;                  // standard robots: flattened

          // Record the charge direction so the death ragdoll (or survivor
          // shove) launches the way the player is running.
          if (!te.hitImpulse) te.hitImpulse = new THREE.Vector3();
          te.hitImpulse.set(dashDirection.x, 0, dashDirection.z);
          te.damageFlashTime = 0.5;

          if (isMpGuest && mp) {
            // Guests don't own enemy health — report the trample to the host
            // (same path as bullets); local feedback below stays snappy.
            if (te.netId !== undefined) mp.sendEnemyHit(te.netId, trampleDmg, false);
          } else {
            te.health -= trampleDmg;
          }

          // ── Crunchy impact feedback ──
          soundManager.play('enemyHit', 0.9, false, 0.7); // low-pitched metal thud
          createParticles(te.mesh.position, 0x66e8ff, 18); // dash-cyan energy burst
          _tempVec3_2.set(dashDirection.x, 0.25, dashDirection.z).normalize();
          robotSparks.push(new RobotHitSparks(scene, te.mesh.position.clone(), _tempVec3_2.clone(), 24));
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          haptic('hit');
          if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(false);
          if (gameSettingsManager.getSetting('damageNumbers')) {
            _tempVec3_2.copy(te.mesh.position).project(camera);
            addDamageNumber(
              Math.floor(trampleDmg),
              (_tempVec3_2.x * 0.5 + 0.5) * 100,
              (-_tempVec3_2.y * 0.5 + 0.5) * 100,
              true,
              false,
            );
          }
          // Micro hit-stop so the collision lands with weight.
          timeScale = 0.35;
          setTimeout(() => { timeScale = 1.0; }, 90);

          if (!isMpGuest && te.health <= 0) {
            handleEnemyKilled(te, false);
            // Override the standard ragdoll with the full-force "run over"
            // launch — bowled hard forward along the charge, tumbling.
            if (gameSettingsManager.getSetting('ragdollPhysics')) {
              const launch = te.type === 'tank' ? 9 : 14;
              te.deathVel = new THREE.Vector3(
                dashDirection.x * launch,
                6.5 + Math.random() * 2,
                dashDirection.z * launch,
              );
              te.deathSpin = new THREE.Vector3(
                (Math.random() - 0.5) * 14,
                (Math.random() - 0.5) * 9,
                (Math.random() - 0.5) * 16,
              );
              te.deathStarted = true;
            }
            if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Trampled!', 'combo');
          } else if (!isMpGuest && heavyChassis) {
            // Survivor: hard shove along the charge — the player barges
            // through rather than face-planting into a stationary tank.
            te.mesh.position.x += dashDirection.x * 2.6;
            te.mesh.position.z += dashDirection.z * 2.6;
          }
        }
      }

      // Movement with collision detection (skip if dashing)
      if (!isDashing && moving('moveForward')) {
        const newX = camera.position.x + _moveDirection.x * currentSpeed;
        const newZ = camera.position.z + _moveDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && moving('moveBackward')) {
        const newX = camera.position.x - _moveDirection.x * currentSpeed;
        const newZ = camera.position.z - _moveDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && moving('moveLeft')) {
        const newX = camera.position.x + _moveRight.x * currentSpeed;
        const newZ = camera.position.z + _moveRight.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }
      if (!isDashing && moving('moveRight')) {
        const newX = camera.position.x - _moveRight.x * currentSpeed;
        const newZ = camera.position.z - _moveRight.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
      }

      // ── ANALOG TOUCH MOVEMENT (mobile joystick) ──
      // Combine forward (moveY along view dir) + strafe (moveX; +X = right, so
      // it subtracts `_moveRight` to match KeyD), scaled by joystick magnitude
      // for fine speed control. Reuses the same collision check as keyboard.
      if (!isDashing && touchMoving) {
        const mag = Math.min(1, Math.hypot(touchControls.moveX, touchControls.moveY));
        _touchMove.set(0, 0, 0)
          .addScaledVector(_moveDirection, touchControls.moveY)
          .addScaledVector(_moveRight, -touchControls.moveX);
        _touchMove.y = 0;
        if (_touchMove.lengthSq() > 1e-6) {
          _touchMove.normalize();
          const step = currentSpeed * mag;
          const newX = camera.position.x + _touchMove.x * step;
          const newZ = camera.position.z + _touchMove.z * step;
          if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
            camera.position.x = newX;
            camera.position.z = newZ;
          }
        }
      }

      // Jump cooldown timer
      if (jumpCooldown > 0) jumpCooldown -= delta * 1000;

      // Dynamic floor — ground (0) OR the top of a climbable rock/boulder the
      // player is currently perched above. Lets you hop ONTO low obstacles and
      // walk across them instead of being shoved off. Computed before the jump
      // check so you can also jump again from on top of a rock.
      const preFeetY = camera.position.y - currentCameraHeight;
      const supportY = supportHeightAt(camera.position.x, camera.position.z, preFeetY);
      const floorY = currentCameraHeight + supportY;

      // Jump - weight-based jump height (auto-uncrouch when jumping)
      if (held('jump') && !isJumping && jumpCooldown <= 0 && camera.position.y <= floorY + 0.1) {
        // Auto-uncrouch when jumping
        if (isCrouching) {
          isCrouching = false;
        }
        const weaponWeight = WEAPONS[currentWeapon].weight;
        // Jump height is shaped by TWO factors:
        //  1. Weapon weight — a light pistol (weight 1.0) vaults clearly higher
        //     than a heavy minigun (weight 3.0). The spread is pronounced now so
        //     swapping to the pistol is a real mobility choice.
        //  2. Character — each class has its own jumpMult (Scout/Phantom spring
        //     higher, Heavy/Engineer lower) so the chosen character has a
        //     distinct vertical game, in every mode.
        const weightJumpMult = THREE.MathUtils.clamp(1.12 - 0.085 * (weaponWeight - 1), 0.95, 1.12);
        const jumpMultiplier = weightJumpMult * activeAbility.jumpMult;
        velocityY = baseJumpPower * jumpMultiplier;
        isJumping = true;
        wasJumping = true;
        jumpCutApplied = false;
      }

      // Variable jump height: releasing Space early shortens the hop. CRITICAL:
      // apply the cut ONCE — the old code ran it every frame while rising, which
      // compounded to a near-zero "tap" jump that couldn't clear even a small
      // rock. A single 0.62× cut still gives a usable short hop.
      if (!held('jump') && isJumping && velocityY > 0 && !jumpCutApplied) {
        velocityY *= 0.8; // gentle cut — even a quick tap still clears climbable rocks
        jumpCutApplied = true;
      }

      velocityY -= gravity;
      camera.position.y += velocityY;

      // Land on the dynamic floor (ground or a rock top), accounting for crouch.
      if (camera.position.y <= floorY) {
        camera.position.y = floorY;
        velocityY = 0;
        // Landing impact — trigger camera dip when touching ground after a jump
        if (wasJumping) {
          landingImpact = 0.3; // Start landing dip effect
          jumpCooldown = JUMP_COOLDOWN_TIME; // Anti-bunny-hop cooldown
          wasJumping = false;
          // Heavier, lower-pitched footstep for the touchdown thud.
          soundManager.play('footstep', 0.34, false, 0.78);
          footstepAccum = 0; // don't immediately emit a walking step on landing
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

        // Vertical head bob only - smooth with lerp for professional feel.
        // Bob around floorY (ground OR the rock/boulder top the player is
        // standing on) — on flat ground floorY === currentCameraHeight so this
        // is unchanged, but it stops the bob from yanking the camera down to
        // ground level while strolling across a climbable rock platform.
        const targetY = floorY + Math.sin(headBobTime) * bobAmount;
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, rawDelta * 15);
      } else {
        // Smoothly settle to the support height (ground or rock top) when idle.
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, floorY, rawDelta * 10);
      }

      // Track player velocity for AI prediction
      playerVelocity.subVectors(camera.position, lastPlayerPosition).divideScalar(delta > 0 ? delta : 0.016);
      lastPlayerPosition.copy(camera.position);

      // ── FOOTSTEPS ────────────────────────────────────────────────────────
      // Emit a step each stride of real ground travel — stops naturally at
      // walls and while airborne, and speeds up when sprinting. Crouch steps
      // are shorter-strided and quieter so sneaking stays quiet.
      if (isMoving && !isJumping && camera.position.y <= currentCameraHeight + 0.35) {
        footstepAccum += Math.hypot(playerVelocity.x, playerVelocity.z) * rawDelta;
        const stride = isCrouching ? 6 : 9; // world units per step
        if (footstepAccum >= stride) {
          footstepAccum = 0;
          const vol = isCrouching ? 0.1 : isRunning ? 0.26 : 0.18;
          soundManager.play('footstep', vol, false, 0.9 + Math.random() * 0.16);
        }
      } else {
        footstepAccum = 0;
      }

      // Infinite world — stream chunks when the player crosses a chunk
      // boundary (or on a 1s heartbeat); keep the cheap ground recenter
      // every frame so the displaced terrain never visibly snaps.
      worldGenAccum += rawDelta;
      {
        const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
        const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
        if (pcx !== worldGenChunkX || pcz !== worldGenChunkZ || worldGenAccum >= 1) {
          worldGenChunkX = pcx;
          worldGenChunkZ = pcz;
          worldGenAccum = 0;
          updateWorldGeneration(camera.position.x, camera.position.z);
        }
      }
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

      // Update explosion fireballs (rocket + barrel blasts).
      for (let i = explosionEffects.length - 1; i >= 0; i--) {
        if (explosionEffects[i].update(delta)) {
          explosionEffects[i].dispose(scene);
          explosionEffects.splice(i, 1);
        }
      }

      // Update decapitated head gibs — gravity, ground bounce + friction,
      // tumble, then shrink away. Shares geo/mat with the pooled head, so the
      // only cleanup on removal is detaching the clone from the scene.
      for (let i = headGibs.length - 1; i >= 0; i--) {
        const g = headGibs[i];
        g.life -= delta;
        g.vel.y -= 18 * delta; // gravity
        g.mesh.position.addScaledVector(g.vel, delta);
        if (g.mesh.position.y <= g.restY) {
          g.mesh.position.y = g.restY;
          if (g.vel.y < 0) {
            g.vel.y *= -0.4;            // bounce restitution
            g.vel.x *= 0.6; g.vel.z *= 0.6; // ground friction
            g.spin.multiplyScalar(0.55);
            if (Math.abs(g.vel.y) < 1.1) g.vel.y = 0; // settle
          }
        }
        g.mesh.rotation.x += g.spin.x * delta;
        g.mesh.rotation.y += g.spin.y * delta;
        g.mesh.rotation.z += g.spin.z * delta;
        if (g.life < 0.5) g.mesh.scale.multiplyScalar(Math.max(0.85, 1 - delta * 2.2));
        if (g.life <= 0) {
          scene.remove(g.mesh);
          headGibs.splice(i, 1);
        }
      }

      // Update shell casings — gravity, ground bounce + friction, tumble, fade.
      for (let i = shellCasings.length - 1; i >= 0; i--) {
        const c = shellCasings[i];
        c.life -= delta;
        c.vel.y -= 13 * delta;
        c.mesh.position.addScaledVector(c.vel, delta);
        if (c.mesh.position.y <= 0.03) {
          c.mesh.position.y = 0.03;
          if (c.vel.y < 0) {
            c.vel.y *= -0.36;
            c.vel.x *= 0.55;
            c.vel.z *= 0.55;
            c.spin.multiplyScalar(0.5);
            if (Math.abs(c.vel.y) < 0.35) c.vel.y = 0;
          }
        }
        c.mesh.rotation.x += c.spin.x * delta;
        c.mesh.rotation.y += c.spin.y * delta;
        c.mesh.rotation.z += c.spin.z * delta;
        // Shrink away in the final 0.4s (shared material → no per-mesh opacity).
        if (c.life < 0.4) c.mesh.scale.setScalar(Math.max(0.02, c.life / 0.4));
        if (c.life <= 0) {
          scene.remove(c.mesh);
          shellCasings.splice(i, 1);
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

      // Apply camera shake effect — honours the Screen Shake setting. When the
      // toggle is off we skip the positional jitter entirely (and zero the
      // accumulator so it can't build up while disabled), so the setting now
      // actually does something. Recoil pitch + FOV punch are unaffected.
      if (screenShakeOn && cameraShakeIntensity > 0.001) {
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

          if (checkCollision(camera.position, powerUp.position, 2 * perkBonuses.pickupRadiusMult)) {
            // ── ONE LOOTED POWER AT A TIME ──────────────────────────────
            // If the player already holds a power, the crate stays put —
            // they must spend the current power (E) before looting another.
            if (heldPower !== null) {
              const hintNow = Date.now();
              if (hintNow - lastHeldHintAt > 1500) {
                lastHeldHintAt = hintNow;
                showPowerMessage(touchControls.enabled ? 'Use your power (tap Power) before looting another' : 'Use your power (E) before looting another', 1400);
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
              showPowerMessage(`${POWER_LABELS[heldPower]} looted · ${touchControls.enabled ? 'tap Power' : 'press E'} to use`, 2200);
              if (gameSettingsManager.getSetting('killFeed')) {
                addKillFeedEntry(`Looted ${POWER_LABELS[heldPower]}`, 'powerup');
              }
              createParticles(camera.position, 0xffffff, 10);
              tutorial.recordAction('collect_powerup', 1); // advances the loot tutorial step
              powerUpsThisRun += 1;
              achievementSystem.setProgress('resourceful', powerUpsThisRun);
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

      // === ENEMY BULLET UPDATE (ranged sniper bolts) ===
      // Cheap linear scan — there are at most a handful of bolts in the
      // air. Each tick: advance position, expire by life, test against the
      // player's bounding sphere. Terrain blocks are not checked per-frame
      // (the LOS check at fire time already filters out shots that would
      // hit a wall a few metres away) so the bolt reliably reaches the
      // player it was aimed at.
      for (let eb = enemyBullets.length - 1; eb >= 0; eb--) {
        const bolt = enemyBullets[eb];
        bolt.mesh.position.add(bolt.velocity);
        bolt.life--;
        const dxpb = bolt.mesh.position.x - camera.position.x;
        const dypb = bolt.mesh.position.y - camera.position.y;
        const dzpb = bolt.mesh.position.z - camera.position.z;
        const playerHit = dxpb * dxpb + dypb * dypb + dzpb * dzpb < 0.72; // ~0.85m
        if (playerHit) {
          takeEnemyDamage(bolt.damage, 'Sniper Bolt', bolt.mesh.position);
          // Small impact burst at the player so the hit reads visually.
          createParticles(bolt.mesh.position, 0x6effff, 9);
          scene.remove(bolt.mesh);
          enemyBullets.splice(eb, 1);
          continue;
        }
        if (bolt.life <= 0 || bolt.mesh.position.y < 0.1) {
          scene.remove(bolt.mesh);
          enemyBullets.splice(eb, 1);
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

        // Ranged sentinel collision — bullets damage the turret. Done first
        // because a sentinel is a small target and we don't want a bullet
        // grazing a sentinel and then hitting an enemy behind it.
        let bulletHitSentinel = false;
        for (let s = 0; s < sentinels.length; s++) {
          const sentinel = sentinels[s];
          if (sentinel.destroyed) continue;
          const dxS = bullet.mesh.position.x - sentinel.mesh.position.x;
          const dyS = bullet.mesh.position.y - 1.6 - sentinel.mesh.position.y;
          const dzS = bullet.mesh.position.z - sentinel.mesh.position.z;
          if (dxS * dxS + dzS * dzS < sentinel.hitRadius * sentinel.hitRadius && Math.abs(dyS) < 1.2) {
            sentinel.hp -= bullet.damage;
            createParticles(bullet.mesh.position, 0xff6633, 8);
            if (sentinel.hp <= 0) {
              sentinel.destroyed = true;
              spawnExplosionFX(sentinel.mesh.position.clone());
              scene.remove(sentinel.mesh);
              // Reward — meaningful score bump + advance elimination mission,
              // plus a "+150" floating number so the destruction feels earned.
              const sentinelReward = Math.round(150 * scoreDiffMult * runModifierScoreMult);
              score += sentinelReward;
              missionSystem.updateProgress('elimination', 1);
              if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Sentinel Down · +${sentinelReward}`, 'kill');
              triggerKillFlash();
              if (gameSettingsManager.getSetting('damageNumbers')) {
                _tempVec3_2.copy(sentinel.mesh.position).project(camera);
                const sxp = (_tempVec3_2.x * 0.5 + 0.5) * 100;
                const syp = (-_tempVec3_2.y * 0.5 + 0.5) * 100;
                addDamageNumber(sentinelReward, sxp, syp, true, true);
              }
              updateGameState();
            }
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
            bulletHitSentinel = true;
            break;
          }
        }
        if (bulletHitSentinel) continue;

        // Explosive barrel collision check — done BEFORE enemy collision so
        // a bullet hitting a barrel detonates it without also tagging an
        // enemy behind it twice. Cheap linear scan because barrels are
        // capped at ~30 per map.
        let bulletHitBarrel = false;
        for (let b = 0; b < barrels.length; b++) {
          const barrel = barrels[b];
          if (barrel.detonated) continue;
          const dxB = bullet.mesh.position.x - barrel.mesh.position.x;
          const dyB = bullet.mesh.position.y - barrel.mesh.position.y;
          const dzB = bullet.mesh.position.z - barrel.mesh.position.z;
          if (dxB * dxB + dzB * dzB < barrel.hitRadius * barrel.hitRadius && Math.abs(dyB) < 1.0) {
            barrel.hp -= bullet.damage;
            if (barrel.hp <= 0) {
              detonateBarrel(barrel);
            } else {
              // Glancing hit — sparks + the bullet stops here either way.
              createParticles(bullet.mesh.position, 0xffaa33, 6);
            }
            // Rockets still trigger their own AOE in addition to the barrel
            // detonation (a rocket landing on a barrel should feel huge).
            if (bullet.isRocket) explodeRocket(bullet.mesh.position.clone(), bullet.damage);
            scene.remove(bullet.mesh);
            bullets.splice(i, 1);
            bulletHitBarrel = true;
            break;
          }
        }
        if (bulletHitBarrel) continue;

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
            const hsScale = enemy.type === 'fast' ? 0.7
              : enemy.type === 'tank' ? 1.5
              : enemy.type === 'boss' ? 2.0
              : enemy.type === 'ranged' ? 1.05
              : 1.0;
            _tempVec3.set(
              enemy.mesh.position.x,
              enemy.mesh.position.y + 1.9 * hsScale,
              enemy.mesh.position.z
            );
            const distanceToHead = bullet.mesh.position.distanceTo(_tempVec3);

            if (distanceToHead < 0.8 * hsScale) {
              // HEADSHOT! 2x damage, boosted further by Headshot Mastery (skill),
              // Skull Splitter (wave perk) AND the Operative MP passive.
              damage *= (2 + skillBonus('headshotDamage')) * perkBonuses.headshotDmgMult * (mpMods.headshotDmgMult ?? 1);
              isCritical = true;
              soundManager.play('enemyHit', 0.8); // Louder hit sound
              createParticles(_tempVec3, 0xffff00, 8); // Yellow particles for crit
            } else if (perkBonuses.critChanceBonus > 0 && Math.random() < perkBonuses.critChanceBonus) {
              // Eagle Eye perk — body shots can still crit. Reads as a "lucky"
              // headshot graphic; awards the same damage bump.
              damage *= (2 + skillBonus('headshotDamage')) * perkBonuses.headshotDmgMult * (mpMods.headshotDmgMult ?? 1);
              isCritical = true;
              soundManager.play('enemyHit', 0.8);
              createParticles(_tempVec3, 0xffff00, 8);
            } else {
              // "Skull Hunter" run modifier — body shots tickle, headshots only.
              // 10% damage is enough that the player sees feedback but won't
              // grind a tank by spraying centre-mass.
              if (runMods.headshotsOnly) damage *= 0.1;
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
              // ── BOSS PHASE 2 ─────────────────────────────────────────
              // When a full boss drops below half HP for the first time it
              // enrages: gains +35% speed and +30% damage. Latched so the
              // trigger fires exactly once per boss. Multi-layer feedback
              // so the moment LANDS: kill feed, centred banner, screen
              // shake, red damage flash, sparks on the boss + a low-pitched
              // boom from the powerUp sample (cheap roar).
              if (enemy.type === 'boss' && (enemy.bossPhase ?? 1) === 1
                  && enemy.health > 0 && enemy.health < enemy.maxHealth * 0.5) {
                enemy.bossPhase = 2;
                enemy.speed *= 1.35;
                enemy.damage *= 1.3;
                if (gameSettingsManager.getSetting('killFeed')) {
                  addKillFeedEntry('Boss Enraged!', 'combo');
                }
                if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
                triggerDamageFlash();
                createParticles(enemy.mesh.position, 0xff3322, 50);
                soundManager.play('powerUp', 1.0, false, 0.5);
                showPowerMessage('BOSS ENRAGED', 2400);
              }
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

            // ── Hit knockback (lightweight physics) ──
            // Shove the enemy a touch along the shot direction so bullets feel
            // like they land with weight; heavier enemies barely budge. Also
            // records the shot direction so the death ragdoll launches the right
            // way. Magnitude is small + horizontal so it never trivialises the
            // fight or pushes enemies through terrain.
            {
              const kdx = bullet.velocity.x;
              const kdz = bullet.velocity.z;
              const klen = Math.hypot(kdx, kdz);
              if (klen > 1e-4) {
                const inv = 1 / klen;
                const massResist = enemy.type === 'boss' ? 0.05 : enemy.type === 'tank' ? 0.16 : enemy.type === 'fast' ? 0.42 : 0.3;
                const shove = (isCritical ? 0.34 : 0.22) * massResist;
                enemy.mesh.position.x += kdx * inv * shove;
                enemy.mesh.position.z += kdz * inv * shove;
                if (!enemy.hitImpulse) enemy.hitImpulse = new THREE.Vector3();
                enemy.hitImpulse.set(kdx * inv, 0, kdz * inv);
              }
            }

            // Add hit marker and damage number (if enabled in settings)
            if (gameSettingsManager.getSetting('hitMarkers')) {
              addHitMarker(isCritical);
            }
            // Tactile confirmation on touch (no-op on desktop / haptics off).
            haptic(isCritical ? 'headshot' : 'hit');

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
            // Detonators perk — bullets explode on hit. Splash 40% of the
            // bullet's damage to enemies within a small radius. The just-hit
            // enemy is excluded so we don't double-tap (it already took the
            // direct hit above).
            if (perkBonuses.explosiveBullets) {
              const splashOrigin = bullet.mesh.position.clone();
              const splashDmg = damage * 0.4;
              const SPLASH_R = 3.5;
              spawnExplosionFX(splashOrigin);
              for (let s = 0; s < enemies.length; s++) {
                const e = enemies[s];
                if (e === enemy || e.dead) continue;
                const d = e.mesh.position.distanceTo(splashOrigin);
                if (d > SPLASH_R) continue;
                const falloff = 1 - (d / SPLASH_R) * 0.5;
                const dmgS = splashDmg * falloff;
                if (isMpGuest && mp) {
                  if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmgS, false);
                } else {
                  e.health -= dmgS;
                }
                e.damageFlashTime = 0.3;
                if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
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
      // AI update distance scales with graphics quality AND difficulty —
      // hard enemies keep their AI brain online (and continue attacking)
      // from much further out, so the player can't out-snipe them by
      // running outside the previous 100m cap.
      const MAX_AI_UPDATE_DISTANCE = Math.min(
        220,
        graphicsPreset.viewDistance * 0.85 * diffSettings.chaseMult * mapVisibilityReach,
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

      // Host only: rebuild the fair-share target table — every alive player
      // (the host's own camera + alive remotes) and a running tally of how
      // many enemies each is already engaging. `mpDesiredCap` is the even
      // split that the per-enemy assignment below balances toward.
      if (isMpHost && mp) {
        mpTgtIds.length = 0;
        mpTgtIndex.clear();
        const localPlayer = mp.getLocalPlayer();
        if (localPlayer.isAlive) {
          mpAddTarget(localPlayer.id, camera.position.x, camera.position.y, camera.position.z);
        }
        mp.getRemotePlayers().forEach((p) => {
          if (p.isAlive) mpAddTarget(p.id, p.position.x, p.position.y, p.position.z);
        });
        let livingEnemies = 0;
        for (let e = 0; e < enemies.length; e++) {
          const en = enemies[e];
          if (en.dead) continue;
          livingEnemies++;
          if (en.targetPlayerId !== undefined) {
            const ti = mpTgtIndex.get(en.targetPlayerId);
            if (ti !== undefined) mpTgtCount[ti]++;
          }
        }
        mpDesiredCap = mpTgtIds.length > 0 ? Math.max(1, Math.ceil(livingEnemies / mpTgtIds.length)) : 0;
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        // Death animation. Two modes (toggled by the "Ragdoll Physics" setting,
        // and used as the fallback for multiplayer-mirrored deaths):
        //   • RAGDOLL (enemy.deathVel set) — the corpse flies along its launch
        //     impulse, falls under gravity, bounces off the ground with friction
        //     + tumble, settles, then shrinks away.
        //   • SIMPLE (no deathVel) — a clean topple-forward + progressive
        //     shrink/sink in place (the classic death anim).
        if (enemy.dead && enemy.deathTime > 0) {
          enemy.deathTime -= delta;

          // Base scale for this enemy type (pooled enemies use type-based scaling)
          const baseScale = enemy.type === 'fast' ? 0.7 : enemy.type === 'tank' ? 1.5 : enemy.type === 'boss' ? 2.0 : 1.0;

          if (enemy.deathVel) {
            // ── RAGDOLL ──
            const restY = 0.22 * baseScale; // height the tumbling corpse rests at

            // Splay the limbs into a slack ragdoll pose on the first frame.
            if (enemy.deathStarted) {
              enemy.deathStarted = false;
              if (enemy.leftArm) { enemy.leftArm.rotation.z = Math.PI / 2.4; enemy.leftArm.rotation.x = Math.PI / 5; }
              if (enemy.rightArm) { enemy.rightArm.rotation.z = -Math.PI / 2.4; enemy.rightArm.rotation.x = Math.PI / 5; }
              if (enemy.leftLeg) enemy.leftLeg.rotation.x = Math.PI / 7;
              if (enemy.rightLeg) enemy.rightLeg.rotation.x = -Math.PI / 7;
            }

            // Integrate the rigid-body launch (gravity + bounce + spin).
            enemy.deathVel.y -= 17 * delta; // gravity
            enemy.mesh.position.addScaledVector(enemy.deathVel, delta);
            if (enemy.mesh.position.y <= restY) {
              enemy.mesh.position.y = restY;
              if (enemy.deathVel.y < 0) {
                enemy.deathVel.y *= -0.42;            // bounce restitution
                enemy.deathVel.x *= 0.6;              // ground friction
                enemy.deathVel.z *= 0.6;
                if (enemy.deathSpin) enemy.deathSpin.multiplyScalar(0.5);
                if (Math.abs(enemy.deathVel.y) < 1.3) enemy.deathVel.y = 0; // settle
              }
            }
            if (enemy.deathSpin) {
              enemy.mesh.rotation.x += enemy.deathSpin.x * delta;
              enemy.mesh.rotation.y += enemy.deathSpin.y * delta;
              enemy.mesh.rotation.z += enemy.deathSpin.z * delta;
            }

            // Hold full size while it tumbles, then shrink away in the last 0.3s.
            const fade = enemy.deathTime < 0.3 ? Math.max(0.02, enemy.deathTime / 0.3) : 1;
            enemy.mesh.scale.setScalar(baseScale * fade);
          } else {
            // ── SIMPLE (ragdoll off / MP mirror) — topple forward + shrink ──
            const p = 1.0 - enemy.deathTime; // 0 → 1 over the 1s death window
            enemy.mesh.rotation.x = p * (Math.PI / 2);
            enemy.mesh.position.y = baseScale * (1.0 - p);
            enemy.mesh.scale.setScalar(Math.max(0.02, 1.0 - p * 0.8) * baseScale);
            if (enemy.leftArm) { enemy.leftArm.rotation.z = p * (Math.PI / 3); enemy.leftArm.rotation.x = p * (Math.PI / 4); }
            if (enemy.rightArm) { enemy.rightArm.rotation.z = -p * (Math.PI / 3); enemy.rightArm.rotation.x = p * (Math.PI / 4); }
            if (enemy.leftLeg) enemy.leftLeg.rotation.x = p * (Math.PI / 6);
            if (enemy.rightLeg) enemy.rightLeg.rotation.x = -p * (Math.PI / 6);
          }

          if (enemy.deathTime <= 0) {
            // Restore the head we hid on decapitation so the pooled mesh is
            // whole again for the next enemy that reuses this slot (idempotent
            // for enemies that were never decapitated).
            if (enemy.head && !enemy.head.visible) enemy.head.visible = true;
            // Release mesh back to pool for reuse (SmartEnemyManager handles scene removal)
            if (enemy.poolId !== undefined) {
              smartEnemyManager.releaseMeshById(enemy.poolId);
            } else {
              // Fallback for enemies not using pool (shouldn't happen in normal operation)
              scene.remove(enemy.mesh);
            }
            if (enemy.netId !== undefined) {
              enemyByNetId.delete(enemy.netId);
              enemyInterp.delete(enemy.netId);
            }
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
          const px = enemy.mesh.position.x;
          const pz = enemy.mesh.position.z;
          const buf = enemy.netId !== undefined ? enemyInterp.get(enemy.netId) : undefined;
          if (buf && buf.sample(frameNowMs - enemyRenderDelay, _enemyInterpOut)) {
            // Play the host's authoritative path a fixed delay in the past,
            // interpolating between snapshots → smooth, steady-speed motion
            // instead of stuttering toward whichever packet landed last.
            enemy.mesh.position.x = _enemyInterpOut.x;
            enemy.mesh.position.z = _enemyInterpOut.z;
            enemy.mesh.rotation.y = _enemyInterpOut.yaw;   // already shortest-arc interpolated
          } else {
            // No buffer yet (first frame after spawn) — hold the last target.
            enemy.mesh.position.x = enemy.netTargetX ?? px;
            enemy.mesh.position.z = enemy.netTargetZ ?? pz;
            enemy.mesh.rotation.y = enemy.netYaw ?? enemy.mesh.rotation.y;
          }
          const movedLen = Math.hypot(enemy.mesh.position.x - px, enemy.mesh.position.z - pz);

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
        // Solo: focusPos stays the local camera, so every downstream
        // calculation is byte-identical to the original single-player path.
        // Multiplayer host: each enemy sticks to a fairly-assigned player so
        // aggro is shared evenly. It re-picks only when its target dies/leaves
        // or, on a periodic re-evaluation, when its target is over the fair
        // cap and a lighter-loaded player is available — preventing both
        // pile-on and per-frame target jitter.
        let focusPos: THREE.Vector3 = camera.position;
        let focusVel: THREE.Vector3 = playerVelocity;
        let focusPlayerId: string | null = null;
        if (isMpHost && mp && mpTgtIds.length > 0) {
          let tIdx = enemy.targetPlayerId !== undefined ? (mpTgtIndex.get(enemy.targetPlayerId) ?? -1) : -1;
          if (tIdx === -1) {
            // No valid target (new enemy, or its target just died/left) → assign.
            tIdx = pickFairTarget(enemy.mesh.position.x, enemy.mesh.position.z);
            mpTgtCount[tIdx]++;
            enemy.targetPlayerId = mpTgtIds[tIdx];
            enemy.nextTargetEvalAt = frameNowMs + TARGET_EVAL_MS + Math.random() * 700;
          } else if (frameNowMs >= (enemy.nextTargetEvalAt ?? 0)) {
            // Periodic re-eval: only shed OFF an over-subscribed player.
            if (mpTgtCount[tIdx] > mpDesiredCap) {
              const alt = pickFairTarget(enemy.mesh.position.x, enemy.mesh.position.z);
              if (alt !== tIdx && mpTgtCount[alt] < mpDesiredCap) {
                mpTgtCount[tIdx]--; mpTgtCount[alt]++; tIdx = alt;
                enemy.targetPlayerId = mpTgtIds[alt];
              }
            }
            enemy.nextTargetEvalAt = frameNowMs + TARGET_EVAL_MS + Math.random() * 700;
          }
          focusPos = _focusVec.set(mpTgtX[tIdx], mpTgtY[tIdx], mpTgtZ[tIdx]);
          if (mpTgtIds[tIdx] !== mp.getLocalPlayer().id) { focusPlayerId = mpTgtIds[tIdx]; focusVel = _zeroVel; }
        }

        // Performance optimization: Skip AI update for distant enemies
        let distance = enemy.mesh.position.distanceTo(focusPos);

        // === ANTI-ESCAPE RECYCLING ===
        // An enemy that falls far behind — deep in the fog, out of sight —
        // is relocated into a ring around the player. Distance threshold
        // scales with difficulty: easy recycles tight (76m) so the player
        // is never sniping silhouettes; hard lets enemies persist out to
        // 130m so they can engage from far range.
        const recycleDistance = (76 + (diffSettings.chaseMult - 0.8) * 90) * mapSpawnReach;
        if (distance > recycleDistance) {
          // Spawn just outside the player's frustum behind them on hard,
          // closer (still visible) on easy. Use the tree-collision-aware
          // findEnemySpawnSpot so recycled enemies don't reappear inside
          // a tree trunk.
          const baseRad = (38 + Math.random() * (22 * diffSettings.chaseMult)) * mapSpawnReach;
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

        // === RANGED SNIPER FIRING ===
        // The 'ranged' archetype skips melee entirely. It charges up for
        // ~750ms when the player is in its sweet spot AND has line of
        // sight (no tree in the way), then launches a cyan energy bolt
        // travelling at moderate speed so the player can side-step it.
        if (enemy.type === 'ranged' && !enemy.dead && enemy.health > 0) {
          const RANGED_MIN = 6;   // back off in the player's face
          const RANGED_MAX = 50;  // can't see past this in dense maps
          const dxR = focusPos.x - enemy.mesh.position.x;
          const dzR = focusPos.z - enemy.mesh.position.z;
          const distR = Math.hypot(dxR, dzR);
          const inRange = distR >= RANGED_MIN && distR <= RANGED_MAX;
          // Line-of-sight: cheap grid query against terrain. We sample the
          // midpoint between the enemy and the player and check for any
          // collidable within ~half the distance — same trick the ranged
          // sentinels use, kept lean here.
          let los = inRange;
          if (los && distR > 4) {
            const midX = (enemy.mesh.position.x + focusPos.x) * 0.5;
            const midZ = (enemy.mesh.position.z + focusPos.z) * 0.5;
            const nearby = terrainGrid.queryRadius(midX, midZ, distR * 0.5 + 1);
            for (let nn = 0; nn < nearby.length; nn++) {
              const obj = terrainObjects[nearby[nn]];
              if (!obj || !obj.collidable) continue;
              const px2 = obj.x - enemy.mesh.position.x;
              const pz2 = obj.z - enemy.mesh.position.z;
              const lx = focusPos.x - enemy.mesh.position.x;
              const lz = focusPos.z - enemy.mesh.position.z;
              const lsq = lx * lx + lz * lz;
              const t = Math.max(0, Math.min(1, (px2 * lx + pz2 * lz) / lsq));
              const cx = lx * t - px2;
              const cz = lz * t - pz2;
              if (cx * cx + cz * cz < obj.radius * obj.radius) { los = false; break; }
            }
          }
          const COOLDOWN_MS = 2400;
          const CHARGE_MS   = 750;
          if (los) {
            if ((enemy.rangedNextShotAt ?? 0) <= frameNowMs) {
              enemy.rangedChargeMs = (enemy.rangedChargeMs ?? 0) + delta * 1000;
              if (enemy.rangedChargeMs >= CHARGE_MS) {
                // Launch bolt from the rifle muzzle (rough offset).
                const origin = new THREE.Vector3(
                  enemy.mesh.position.x,
                  enemy.mesh.position.y + 1.2,
                  enemy.mesh.position.z,
                );
                const target = new THREE.Vector3(focusPos.x, camera.position.y - 0.2, focusPos.z);
                const dir = target.clone().sub(origin).normalize();
                const speed = 0.55;
                const bulletGroup = new THREE.Mesh(_enemyBulletGeo, _enemyBulletMat);
                bulletGroup.position.copy(origin);
                bulletGroup.add(new THREE.Mesh(_enemyBulletGlowGeo, _enemyBulletGlowMat));
                scene.add(bulletGroup);
                enemyBullets.push({
                  mesh: bulletGroup,
                  velocity: dir.multiplyScalar(speed),
                  damage: enemy.damage,
                  life: 240,
                });
                soundManager.play('shoot_pistol', 0.55, false, 1.3);
                enemy.rangedChargeMs = 0;
                enemy.rangedNextShotAt = frameNowMs + COOLDOWN_MS;
              }
            }
          } else {
            // Lost LOS or out of range — drop any in-progress charge.
            enemy.rangedChargeMs = 0;
          }
        }

        // === ATTACK SYSTEM ===
        // Skipped for 'ranged' — they don't melee, they shoot above.
        if (enemy.type !== 'ranged' && enemy.attackSystem) {
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
      // The host streams enemy state so every guest renders the same enemies.
      // To stay light on slow connections we (1) hold the stream until a guest
      // is actually in the match (no flooding a peer still on the loader),
      // (2) send compact DELTAS carrying only enemies that changed, and
      // (3) emit a full KEYFRAME ~1×/sec (and to each newly-ready guest) so a
      // guest can never drift permanently out of sync.
      if (isMpHost && mp && frameNowMs - lastEnemySyncMs >= ENEMY_SYNC_INTERVAL_MS) {
        const guestReady = mp.hasReadyGuest() || (frameNowMs - hostMatchStartMs > ENEMY_SYNC_READY_FALLBACK_MS);
        if (mp.getConnectionCount() > 0 && guestReady) {
          lastEnemySyncMs = frameNowMs;
          const sendFull = forceEnemyKeyframe || (frameNowMs - lastEnemyKeyframeMs >= ENEMY_KEYFRAME_INTERVAL_MS);
          const r2 = (n: number) => Math.round(n * 100) / 100;
          const wire: EnemyWire[] = [];
          for (let e = 0; e < enemies.length; e++) {
            const en = enemies[e];
            if (en.netId === undefined) continue;
            const w: EnemyWire = {
              id: en.netId,
              ty: ENEMY_TYPE_CODE[en.type],
              x: r2(en.mesh.position.x),
              y: r2(en.mesh.position.y),
              z: r2(en.mesh.position.z),
              ry: r2(en.mesh.rotation.y),
              hp: Math.round(en.health),
              mx: Math.round(en.maxHealth),
              d: en.dead ? 1 : 0,
            };
            if (sendFull) {
              wire.push(w);
              enemySyncLastSent.set(en.netId, w);
            } else {
              const p = enemySyncLastSent.get(en.netId);
              if (!p || p.x !== w.x || p.y !== w.y || p.z !== w.z || p.ry !== w.ry || p.hp !== w.hp || p.d !== w.d) {
                wire.push(w);
                enemySyncLastSent.set(en.netId, w);
              }
            }
          }
          if (sendFull) {
            // Prune entries for enemies that no longer exist so the map stays bounded.
            if (enemySyncLastSent.size > enemies.length) {
              const live = new Set<number>();
              for (let e = 0; e < enemies.length; e++) { const id = enemies[e].netId; if (id !== undefined) live.add(id); }
              enemySyncLastSent.forEach((_v, id) => { if (!live.has(id)) enemySyncLastSent.delete(id); });
            }
            lastEnemyKeyframeMs = frameNowMs;
            forceEnemyKeyframe = false;
            // Stamp the host send-time so guests can de-jitter the stream onto
            // their own clock (same technique as remote players).
            mp.broadcastEnemySync(wire, wave, true, frameNowMs);
          } else if (wire.length > 0) {
            mp.broadcastEnemySync(wire, wave, false, frameNowMs);
          }
          // Empty delta → send nothing this tick (pure bandwidth save).
        }
      }

      // ── Tactical minimap ──────────────────────────────────────────────
      // Build a fresh radar frame a few times a second from live positions:
      // the local camera (you), the surrounding enemies, and — in multiplayer
      // only — every smoothly-interpolated remote ally. Runs in solo & tutorial
      // too (enemies only). renderMinimapFrame() is a cheap no-op when no radar
      // canvas is mounted (e.g. while paused or in menus).
      if (isMinimapActive() && frameNowMs - lastMinimapMs >= MINIMAP_INTERVAL_MS) {
        lastMinimapMs = frameNowMs;
        const toHex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
        const blips: MinimapBlip[] = [];
        if (remotePlayerManager) {
          const allies = remotePlayerManager.getMinimapBlips();
          for (let a = 0; a < allies.length; a++) {
            blips.push({ x: allies[a].x, z: allies[a].z, color: toHex(allies[a].color), alive: allies[a].alive, kind: 'ally' });
          }
        }
        for (let e = 0; e < enemies.length; e++) {
          const en = enemies[e];
          if (en.dead) continue;
          blips.push({ x: en.mesh.position.x, z: en.mesh.position.z, color: '', alive: true, kind: en.type === 'boss' ? 'boss' : 'enemy' });
        }
        camera.getWorldDirection(_miniDir);
        const dl = Math.hypot(_miniDir.x, _miniDir.z) || 1;
        renderMinimapFrame({
          selfX: camera.position.x,
          selfZ: camera.position.z,
          dirX: _miniDir.x / dl,
          dirZ: _miniDir.z / dl,
          selfColor: (isMultiplayer && mp) ? toHex(mp.getLocalPlayer().color) : '#34d399',
          blips,
        });
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

    // ── WARMUP WATCHDOG ────────────────────────────────────────────────
    // Races an async warmup step against a timeout so a single GPU/driver
    // stall (most commonly `compileAsync` never reporting completion via
    // KHR_parallel_shader_compile) can never wedge the loader forever — the
    // bug that left multiplayer matches stuck on the "Preparing the
    // battlefield" screen. On TIMEOUT we resolve(null) and let warmup carry
    // on: any not-yet-compiled program simply compiles lazily on its first
    // real render (a one-time hitch, no visual change). A genuine REJECTION
    // is still propagated so true compile failures surface the error card.
    const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T | null> =>
      new Promise<T | null>((resolve, reject) => {
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          console.warn(`[Warmup] "${label}" exceeded ${ms}ms — proceeding without waiting.`);
          resolve(null);
        }, ms);
        promise.then(
          (v) => { if (!settled) { settled = true; window.clearTimeout(timer); resolve(v); } },
          (err) => { if (!settled) { settled = true; window.clearTimeout(timer); reject(err); } },
        );
      });
    // Absolute backstop for the whole warmup chain. Even if some future
    // await stalls in a way the per-step guards miss, the loader still
    // proceeds within this window.
    const WARMUP_OVERALL_CAP_MS = 12000;

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
      // Ability flares spawned in Stage 3 to pre-compile their materials.
      // Tracked here so teardown can remove them immediately — their built-in
      // setTimeout cleanup runs after 2s, but the loader hides at ~900ms,
      // which used to leave the purple phantom aura + yellow/orange
      // overcharge motes + blue shield ring visibly hanging in front of the
      // player for the first second of gameplay.
      const warmAbilityFlares: THREE.Object3D[] = [];
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
        // Pre-warm the power-up visuals so the FIRST activation in a fight
        // never stalls compiling their shaders. The held riot-shield mesh is
        // briefly made visible (restored in teardown) so the compile stage
        // picks up its materials; the ability flares auto-remove after 2s.
        shieldMesh.visible = true;
        warmAbilityFlares.push(
          abilitySystem.createAbilityEffect(scene, wp, 'shield'),
          abilitySystem.createAbilityEffect(scene, wp, 'overcharge'),
          abilitySystem.createAbilityEffect(scene, wp, 'phantom'),
        );
        // Pre-warm the killstreak AIRDROP materials (crate, metal bands, glow
        // panel + label, beacon, parachute vertex-colours, smoke points) so the
        // first real airdrop never stalls compiling them. Spawned high overhead
        // (startY ~100) so it's off-screen; the shared glow light is already
        // scene-parented, so this never changes the light count. Cleared in
        // teardown via enhancedPowerUps.clearAll.
        enhancedPowerUps.createAirdrop(scene, wp.x, wp.z, 'speed');
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
          // 6s cap: long enough for a heavy multiplayer scene (remote-player
          // avatars + nameplate/health sprites) to compile normally, short
          // enough that a driver stall doesn't strand the player on the loader.
          await withTimeout(r.compileAsync(scene, camera), 6000, 'Shader Compile');
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
        clearDamageDirections();
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
        shieldMesh.visible = false; // restore — it was raised only to warm its shaders
        warm.forEach(o => scene.remove(o));
        warmPowerUps.forEach((powerUp) => {
          const root = powerUp.mesh as unknown as THREE.Object3D;
          const pooledLight = (root.userData.light as THREE.PointLight | null | undefined) ?? null;
          releasePickupLight(pooledLight);
          root.userData.light = null;
          root.parent?.remove(root);
        });
        // Ability flares — proactively dispose before their built-in 2s
        // setTimeout fires so they never overlap with first-frame gameplay.
        warmAbilityFlares.forEach((flare) => {
          flare.parent?.remove(flare);
          flare.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          });
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
        // Remove the pre-warm airdrop (its shader programs are now cached) and
        // reset the shared glow light to off.
        enhancedPowerUps.clearAll(scene);
      } catch (err) {
        console.warn('[Warmup] teardown failed (non-fatal):', err);
      }

      // Render one more composed frame AFTER teardown so the canvas's last
      // frame is the clean, pickup-free scene. Without this the canvas
      // retains the previous warmup frame (with the colour pickup spheres
      // spawned for shader pre-compile) and shows it for a moment when the
      // loader hides — readable as a quick flash of blue/yellow balls at
      // the player's position. composePostFX is null-safe on Low preset.
      try { composePostFX(0); } catch { /* best-effort — animate() will fix it next frame */ }

      // Minimum visible loader time so the user actually sees the
      // ShaderProcessingScreen animation. Without this, fast machines
      // would flash the loader for 1-2 frames (effectively invisible).
      // Skipped when the user has hit Continue-Anyway (they want to get
      // into the game NOW).
      if (!continueAnywayRef.current) {
        const MIN_LOADER_MS = 900;
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
          await withTimeout(warmUpShaders(), WARMUP_OVERALL_CAP_MS, 'Warmup (overall)');

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
            // Snap the post-FX exposure to its final value on the very first
            // gameplay frame so the graded look lands instantly when the loader
            // hides — no frame-rate-dependent ease-in (the "post-processing
            // applied after a delay" artifact).
            postFX?.primeExposureSnap();
            // Guest is now fully in the match → tell the host it can begin
            // streaming enemies (the host holds the stream until this lands).
            if (isMpGuest && mp) {
              try { mp.sendClientReady(); } catch { /* best-effort */ }
            }
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

      if (reloadTimeoutId !== null) {
        clearTimeout(reloadTimeoutId);
        reloadTimeoutId = null;
      }
      setReloadDurationUI(null); // clear stale indicator for the next run

      // Cancel any pending power-message clear and wipe the pill so a stale
      // announcement can't carry into the next run.
      if (powerMsgTimer !== null) {
        clearTimeout(powerMsgTimer);
        powerMsgTimer = null;
      }
      setPowerUpMessage('');

      // Photo Mode can't survive a scene teardown — clear it so a fresh run
      // never starts mid-photoshoot.
      photoModeRef.current = false;

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

      // Cleanup instanced world-prop batches (before BiomeSystem disposes the
      // shared geometries/materials the batches reference).
      terrainInstancer.dispose();

      // Cleanup BiomeSystem (releases shared geometry/material pools)
      biomeSystem.dispose();

      // Cleanup shared crater geometries (per-crater materials are GC'd
      // when their meshes are removed from the scene during crater fade-out)
      sharedCraterScorchGeo.dispose();
      sharedCraterRingGeo.dispose();
      sharedCraterDebrisGeo.dispose();

      // Cleanup shell-casing debris (shared geo + material across all casings).
      for (const c of shellCasings) scene.remove(c.mesh);
      shellCasings.length = 0;
      casingGeo.dispose();
      casingMat.dispose();

      // Cleanup any in-flight explosion fireballs (releases pooled lights +
      // per-instance additive materials; shared geometries persist).
      for (const ex of explosionEffects) ex.dispose(scene);
      explosionEffects.length = 0;

      // Detach any in-flight head gibs (clones share pooled geo/mat — just
      // remove the clone objects from the scene).
      for (const g of headGibs) scene.remove(g.mesh);
      headGibs.length = 0;

      // Cleanup shared rocket projectile geometry + materials.
      rocketSharedGeos.forEach((g) => g.dispose());
      rocketSharedMats.forEach((m) => m.dispose());

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
  // Best-effort immersive mode on touch: go fullscreen and lock to landscape.
  // Must be called from a user-gesture handler (the Start button). Every call
  // is wrapped so unsupported platforms (notably iOS Safari, which rejects
  // orientation.lock) fail silently instead of throwing.
  const enterImmersiveMode = useCallback(() => {
    if (!touchControls.enabled) return;
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      const req = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.();
      if (req && typeof (req as Promise<void>).catch === 'function') {
        (req as Promise<void>).catch(() => { /* denied — ignore */ });
      }
    } catch { /* unsupported — ignore */ }
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation?.lock?.('landscape').catch(() => { /* unsupported — ignore */ });
    } catch { /* unsupported — ignore */ }
  }, []);

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
    setEnemyIntro(null); // clear any leftover "New Threat" banner from a prior run
    soundManager.initialize();
    enterImmersiveMode();
    setShowShaderProcessing(true);
    setGameStarted(true);
  };

  // Handle multiplayer mode selection
  const handleMultiplayerMode = () => {
    setGameMode('multiplayer');
    setShowMultiplayerLobby(true);
  };

  // Handle multiplayer game start from lobby.
  // Memoised (stable identity) so the lobby's game_start listener effect
  // doesn't re-subscribe on every render. Guarded by mpStartHandledRef so a
  // duplicate/late game_start (e.g. from leaked listeners) can't re-show the
  // loader after the match is already running. The ref is reset whenever we
  // leave the match (see the gameStarted effect below).
  const handleMultiplayerStartGame = useCallback((
    manager: MultiplayerManager,
    gameMode: 'coop' | 'survival',
    timeLimit?: number,
    map?: MapType,
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive',
    timeOfDay?: 'day' | 'night' | 'auto',
  ) => {
    if (mpStartHandledRef.current) {
      // Duplicate/late game_start — match is already starting.
      return;
    }
    mpStartHandledRef.current = true;
    enterImmersiveMode();
    setMultiplayerManager(manager);
    setMultiplayerGameMode(gameMode);
    if (map) {
      setSelectedMap(map);
    }
    // Host-selected difficulty applies to every client (the game effect uses
    // `classicDifficulty` for spawn pacing, wave size, enemy aggression).
    setClassicDifficulty(difficulty || 'medium');
    // Host-selected time of day applies to every client (the game effect reads
    // `classicTimeOfDay`; 'auto' runs the day/night cycle, as before).
    setClassicTimeOfDay(timeOfDay || 'auto');
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

    // Host broadcasts game_start to all guests; guests have already
    // transitioned via the state updates above.
    if (manager.isGameHost()) {
      manager.startGame(gameMode, timeLimit, map, difficulty || 'medium', timeOfDay || 'auto');
    }
  }, [enterImmersiveMode]);

  // Handle classic mode start. Now routes through the Run-Modifier picker:
  // the player gets one last "raise the stakes" choice before the shader
  // loader; their pick is stored on a ref the scene useEffect reads on init.
  const handleClassicGameStart = (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType, isRandom: boolean = false) => {
    pendingClassicStartRef.current = { difficulty, timeOfDay, map, isRandom };
    setShowClassicMenu(false);
    setRunModifierPickerOptions(getDailyTrio());
  };

  // Called by the RunModifierPicker once the player picks a modifier (or
  // skips). Picks up the pending classic-start params and launches the run.
  const beginClassicWithModifier = (modifier: RunModifierId | null) => {
    const pending = pendingClassicStartRef.current;
    if (!pending) {
      // Defensive — shouldn't be reachable from the picker UI, but if it
      // happens just close the picker so the user isn't stuck.
      setRunModifierPickerOptions(null);
      return;
    }
    activeRunModifierRef.current = modifier;
    setClassicDifficulty(pending.difficulty);
    setClassicTimeOfDay(pending.timeOfDay);
    setSelectedMap(pending.map);
    setIsClassicRandomSession(pending.isRandom);
    if (pending.difficulty === 'adaptive') {
      setGameSettings(prev => ({ ...prev, adaptiveDifficulty: true }));
    }
    soundManager.initialize();
    enterImmersiveMode();
    pendingClassicStartRef.current = null;
    setRunModifierPickerOptions(null);
    setShowShaderProcessing(true);
    setGameStarted(true);
  };

  const restartGame = () => {
    // ── Multiplayer ────────────────────────────────────────────────────────
    // "Play Again" sends every player back to the lobby instead of jumping
    // straight into a new match. The lobby reuses the existing manager so
    // no one has to re-enter the lobby ID. Only the host can initiate this.
    if (gameMode === 'multiplayer' && multiplayerManager) {
      // Only the host can return everyone to the lobby; guests wait for the
      // host's return_to_lobby broadcast.
      if (!multiplayerManager.isGameHost()) return;

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
    setWavePerkOffer(null);
    wavePerkActiveRef.current = false;
    wavePerkResolverRef.current = null;
    setActiveRunPerks([]);
    // Modifier carries across restarts so the player can "rematch" the same
    // mutator without re-picking. The picker handles a fresh choice via the
    // ClassicMenu flow. (No reset of activeRunModifierRef here on purpose.)
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

    // Screen identity for the cross-menu transition — includes the run-
    // modifier picker (its own "screen" between ClassicMenu and gameplay)
    // so every navigation hop gets the same cinematic enter/exit.
    const menuScreenKey =
      showMultiplayerLobby ? 'multiplayer'
      : showClassicMenu    ? 'classic'
      : showTutorialMenu   ? 'tutorial'
      : runModifierPickerOptions ? 'modifier'
      : 'main';
    // Navigation depth — drives the slide direction (deeper = forward,
    // enter from the right; shallower = back, enter from the left).
    const menuScreenDepth =
      menuScreenKey === 'main' ? 0
      : menuScreenKey === 'modifier' ? 2
      : 1;

    return (
      <>
        {/* Persistent — same component instance across every menu render */}
        <MenuBackdrop variant={menuVariant} />

        {/* STATIC menu chrome — readability gradients + per-variant tint live
            HERE, outside the animated screen wrapper, so the dark overlay
            stays rock-solid while screens slide (a moving black sheet made
            the old transition feel like the whole world was shifting). */}
        <div className="fixed inset-0 z-[1] pointer-events-none bg-gradient-to-b from-black/50 via-black/30 to-black/75" />
        <div
          className="fixed inset-0 z-[1] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.58) 100%)' }}
        />
        {menuVariant === 'multiplayer' && (
          <div
            className="fixed inset-0 z-[1] pointer-events-none animate-fadeIn"
            style={{ background: 'rgba(5,8,10,0.24)', backdropFilter: 'blur(14px) saturate(130%)' }}
          />
        )}
        <div key={menuVariant} className="animate-fadeIn">
          <MenuShell variant={menuVariant} />
        </div>

        <MenuTransition menuKey={menuScreenKey} depth={menuScreenDepth}>
          {gameMode === 'none' && !showClassicMenu && !showTutorialMenu && !showMultiplayerLobby && (
            <MainMenu onClassicMode={handleModeSelection} onMultiplayerMode={handleMultiplayerMode} onTutorialMode={handleTutorialMode} t={t} />
          )}
          {showClassicMenu && (
            <ClassicMenu onStartGame={handleClassicGameStart} onBack={() => { setShowClassicMenu(false); setGameMode('none'); }} selectedCharacter={selectedCharacter} onSelectCharacter={setSelectedCharacter} t={t} />
          )}
          {runModifierPickerOptions && !showClassicMenu && !gameStarted && (
            <RunModifierPicker
              options={runModifierPickerOptions}
              onChoose={beginClassicWithModifier}
              onBack={() => {
                // Cancel the modifier step and return to ClassicMenu with the
                // same params so the player doesn't have to re-pick map/etc.
                pendingClassicStartRef.current = null;
                setRunModifierPickerOptions(null);
                setShowClassicMenu(true);
              }}
            />
          )}
          {showTutorialMenu && (
            <TutorialMenu onStartTutorial={handleTutorialStart} onBack={() => { setShowTutorialMenu(false); setGameMode('none'); }} selectedCharacter={selectedCharacter} onSelectCharacter={setSelectedCharacter} t={t} />
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
        </MenuTransition>
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
      <div className="relative w-full h-dvh overflow-hidden bg-black">
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
    <div className="relative w-full h-dvh overflow-hidden bg-black">
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

      {/* Guest-only: brief "syncing with host" affordance shown after the
          loader hides but before the first enemy keyframe arrives — keeps a
          slow connection from looking like an empty, broken world. */}
      {mpWaitingForHost && !showShaderProcessing && !photoMode && (
        <div className="pointer-events-none absolute left-1/2 top-[18%] z-20 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full border border-emerald-400/30 bg-black/75 px-4 py-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-300/40 border-t-emerald-300" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">Syncing with host…</span>
          </div>
        </div>
      )}

      {/* Multiplayer "click to resume" prompt. MP never pauses, so releasing the
          cursor (Escape) just shows this; the click passes through (this layer is
          pointer-events-none) to the canvas, which re-locks (see onMouseDown). */}
      {showResumePrompt && gameStarted && gameMode === 'multiplayer' && !gameState.isGameOver && !isPaused && !showShaderProcessing && !photoMode && !isTouch && (
        <div className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-black/55">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-[#0b0f15]/85 px-8 py-6">
            <MousePointerClick className="h-7 w-7 text-emerald-300" strokeWidth={2} />
            <span className="text-base font-bold tracking-wide text-white">Click to resume</span>
            <span className="text-[12px] text-gray-400">The match is still live — click to recapture your aim.</span>
          </div>
        </div>
      )}

      {!photoMode && (
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
          unlimitedStamina={gameMode === 'tutorial'}
          isTouch={isTouch}
          fpsVisible={userSettings.showFPS}
          weaponMastery={gameState.weaponMastery}
        />
      </div>
      )}

      {/* ON-SCREEN TOUCH CONTROLS — only on touch devices, only during live
          play. The joystick/look-surface write into the touchControls bridge;
          fire + action buttons dispatch synthetic mouse/keyboard events so the
          existing desktop handlers do all the work. */}
      {isTouch && gameStarted && !isPaused && !gameState.isGameOver && !photoMode && (
        <TouchControls
          unlockedWeapons={gameState.unlockedWeapons}
          currentWeapon={gameState.currentWeapon}
          abilities={abilityHud}
          reloadDuration={reloadDurationUI}
          canPause={gameMode !== 'multiplayer'}
        />
      )}

      {/* FPS Counter — top-center. The combo pill drops below it (see HUD
          fpsVisible) so the two never overlap. */}
      {userSettings.showFPS && gameStarted && !photoMode && (
        <div
          className="absolute top-2 left-1/2 transform -translate-x-1/2 z-20 select-none"
          style={{ pointerEvents: 'none' }}
        >
          <div
            className="px-3 py-1 rounded-lg"
            style={{
              background: 'rgba(0,0,0,0.65)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className="text-sm font-mono font-bold" style={{ color: currentFPS >= 50 ? '#4ade80' : currentFPS >= 30 ? '#facc15' : '#f87171' }}>
              {currentFPS} FPS
            </span>
          </div>
        </div>
      )}

      {!photoMode && (
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

        {/* Reload indicator — a small amber ring under the crosshair whose
            sweep fills over the exact reload duration, so the player always
            knows when the weapon is ready to fire again. */}
        {reloadDurationUI !== null && !gameState.isGameOver && !isPaused && (
          <div
            className="absolute left-1/2 top-1/2 select-none"
            style={{ transform: 'translate(-50%, 26px)' }}
          >
            <div className="flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/75 px-2.5 py-1">
              <div className="relative w-3.5 h-3.5">
                <div
                  key={reloadDurationUI}
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'conic-gradient(#fbbf24 var(--reload-deg, 0deg), rgba(251,191,36,0.18) 0deg)',
                    animation: `reloadSweep ${reloadDurationUI}ms linear forwards`,
                  }}
                />
                <div className="absolute inset-[3px] rounded-full bg-black/85" />
              </div>
              <span className="text-[10px] font-semibold tracking-[0.15em] text-amber-300 uppercase">
                Reloading
              </span>
            </div>
            <style>{`
              @property --reload-deg { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
              @keyframes reloadSweep { from { --reload-deg: 0deg; } to { --reload-deg: 360deg; } }
            `}</style>
          </div>
        )}

        <Notifications
          showWaveComplete={showWaveComplete}
          killStreak={gameState.killStreak >= 5 ? gameState.killStreak : undefined}
          powerUpMessage={powerUpMessage}
          t={t}
        />

        {/* Active Run-Modifier badge — discreet rose chip that lives
            top-centre under the FPS pill, so the player has a constant
            visual reminder of the mutator they're playing under. Hidden in
            multiplayer (no per-run modifiers there). */}
        {gameMode === 'classic' && activeRunModifierRef.current && !gameState.isGameOver && (
          <div
            className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
            style={{ top: userSettings.showFPS ? 38 : 6 }}
          >
            <div className="flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-950/75 px-3 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-300" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200">
                {RUN_MODIFIERS[activeRunModifierRef.current].name} · ×{RUN_MODIFIERS[activeRunModifierRef.current].scoreMult.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Active Wave Perks chip — Each picked perk gets a thin rounded pill.
            Desktop: a vertical stack below the vitals panel (top-left). Touch:
            a compact, wrapping row tucked into the free band between the compact
            HUD and the joystick zone, capped so it never grows into the
            joystick. Hidden when no perks are picked yet. Solo / Tutorial show
            it (perks are run-scoped; MP has none). */}
        {gameMode !== 'multiplayer' && activeRunPerks.length > 0 && !gameState.isGameOver && (() => {
          // On touch keep the band short — cap to 3 pills + a "+N" overflow.
          const TOUCH_CAP = 3;
          const visiblePerks = isTouch ? activeRunPerks.slice(0, TOUCH_CAP) : activeRunPerks;
          const overflow = isTouch ? activeRunPerks.length - visiblePerks.length : 0;
          return (
            <div
              className={`pointer-events-none absolute z-30 flex gap-1 ${isTouch ? 'flex-row flex-wrap items-center max-w-[58vw]' : 'flex-col'}`}
              style={isTouch ? { left: 8, top: 72 } : { left: 16, top: 184 }}
            >
              <p className={`text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-300/80 ${isTouch ? 'mr-0.5' : 'mb-0.5'}`}>
                Run Perks{isTouch ? '' : ` · ${activeRunPerks.length}`}
              </p>
              {visiblePerks.map((id, idx) => {
                const perk = WAVE_PERKS[id];
                if (!perk) return null;
                const color = perk.rarity === 'epic' ? 'border-purple-400/45 bg-purple-500/12 text-purple-200'
                  : perk.rarity === 'rare' ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/15 bg-white/[0.04] text-gray-200';
                return (
                  <span
                    key={`${id}-${idx}`}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${color}`}
                  >
                    {perk.name}
                  </span>
                );
              })}
              {overflow > 0 && (
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-gray-300">
                  +{overflow}
                </span>
              )}
            </div>
          );
        })()}
      </div>
      )}

      {/* Multiplayer HUD. On touch it manages its own fixed, high-z layout
          (compact toggle + scoreboard modal) so it sits above the on-screen
          controls; on desktop it keeps the full top-right scoreboard panel. */}
      {gameMode === 'multiplayer' && multiplayerManager && !gameState.isGameOver && (
        isTouch ? (
          <MultiplayerHUD
            localPlayer={multiplayerManager.getLocalPlayer()}
            remotePlayers={Array.from(multiplayerManager.getRemotePlayers().values())}
            remainingTime={multiplayerManager.getRemainingTime()}
            gameMode={multiplayerGameMode}
            isTouch
          />
        ) : (
          <div className="absolute inset-0" style={{ zIndex: 15, pointerEvents: 'none' }}>
            <MultiplayerHUD
              localPlayer={multiplayerManager.getLocalPlayer()}
              remotePlayers={Array.from(multiplayerManager.getRemotePlayers().values())}
              remainingTime={multiplayerManager.getRemainingTime()}
              gameMode={multiplayerGameMode}
            />
          </div>
        )
      )}

      {/* Chat System for Multiplayer. Touch uses a collapsed toggle + overlay
          (rendered above the controls); desktop keeps the docked panel. */}
      {gameMode === 'multiplayer' && multiplayerManager && !gameState.isGameOver && (
        isTouch ? (
          <ChatSystem manager={multiplayerManager} isVisible={!isPaused} isTouch />
        ) : (
          <div className="absolute inset-0" style={{ zIndex: 30, pointerEvents: 'auto' }}>
            <ChatSystem manager={multiplayerManager} isVisible={!isPaused} />
          </div>
        )
      )}

      {/* Tactical map for Solo & Tutorial — same radar as multiplayer, but it
          only shows enemies (no other players). Desktop docks a compact radar
          below the top-right stats panel; touch uses a right-edge toggle. Press
          M (or the on-screen button) to expand. Hidden while paused. */}
      {gameStarted && !gameState.isGameOver && !isPaused && !photoMode
        && (gameMode === 'classic' || gameMode === 'tutorial') && (
        isTouch
          ? <Minimap isTouch soloMode />
          : <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 12 }}><Minimap standalone soloMode /></div>
      )}

      {/* Achievement Notifications - Stacked vertically.
       * Suppressed entirely in tutorial mode — tutorial is a no-stakes
       * sandbox where achievements would be cheap/spammy AND visually
       * compete with the tutorial overlay card. The onUnlock subscription
       * is also skipped for tutorial sessions so the queue never grows. */}
      {gameMode !== 'tutorial' && !photoMode && achievementQueue.map((achievement, index) => (
        <AchievementNotification
          key={achievement.queueId}
          achievement={achievement}
          index={index}
          isTouch={isTouch}
          onClose={() => {
            // Remove this specific achievement from queue
            setAchievementQueue((prev) =>
              prev.filter((a) => a.queueId !== achievement.queueId)
            );
          }}
        />
      ))}

      {/* Enhanced UI Components */}
      {gameStarted && !gameState.isGameOver && !photoMode && (
        <>
          <HitMarkers />
          <ScreenEffects
            health={gameState.health}
            maxHealth={gameState.maxHealth}
            isVisible={!isPaused}
          />
          <DamageDirectionIndicator isVisible={!isPaused} />
          <KillFeed
            visible={!isPaused}
            /* Desktop Solo & Tutorial dock the tactical radar under the score
               panel, so the feed drops below it (~radar bottom) to never
               overlap. On TOUCH the top-right corner holds the control toggle
               rail (scoreboard/chat/map) + weapon/pause, so the feed moves to
               the top-centre safe lane and centres its entries. Desktop MP
               keeps the default high right position. */
            isTouch={isTouch}
            anchorClass={
              isTouch
                ? 'bottom-16 left-1/2 -translate-x-1/2 items-center'
                : (gameMode === 'classic' || gameMode === 'tutorial')
                  ? 'top-[384px] right-4'
                  : 'top-36 right-4'
            }
          />
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
            onPhotoMode={enterPhotoMode}
            showPhotoMode={gameMode === 'classic' && isAuthenticated && !isTouch}
            isTouch={isTouch}
            onResume={() => {
              // Mirror the desktop Esc-to-resume: the loop's local `paused`
              // only flips inside the keydown handler, so dispatch a synthetic
              // Escape rather than just toggling React state.
              document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
            }}
            t={t}
          />
        </div>
      )}

      {/* Photo Mode overlay — frozen world, drag-look, filters + capture. */}
      {photoMode && (
        <PhotoMode
          photoCount={photoCountData?.count ?? 0}
          maxPhotos={photoCountData?.max ?? 5}
          onFilterChange={handlePhotoFilterChange}
          onCapture={handlePhotoCapture}
          onExit={exitPhotoMode}
        />
      )}

      {wavePerkOffer && gameStarted && !gameState.isGameOver && !isPaused && (
        <WavePerkPicker
          waveCleared={wavePerkOffer.wave}
          slots={wavePerkOffer.slots}
          prizeSlotIndex={wavePerkOffer.prizeSlotIndex}
          autoPickAfterMs={wavePerkOffer.autoPickAfterMs}
          // Skill-tree nudge: only when signed in AND there's something to
          // spend. Guests / freshly-spent players don't see the chip.
          skillPointsAvailable={isAuthenticated ? (playerStats?.skillPoints ?? 0) : 0}
          onPick={(picked) => {
            const resolve = wavePerkResolverRef.current;
            if (resolve) resolve(picked);
          }}
        />
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
      {gameStarted && !gameState.isGameOver && !photoMode && gameMode !== 'tutorial' && activeMissions.length > 0 && (
        <MissionDisplay
          missions={activeMissions}
          isTouch={isTouch}
          onDismiss={(missionId) => {
            setActiveMissions(prev => prev.filter(m => m.id !== missionId));
          }}
        />
      )}

      {/* Combat Coach Tips */}
      {gameStarted && !gameState.isGameOver && !photoMode && coachTips.length > 0 && (
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
                if (canvas && !isTouch) setTimeout(() => canvas.requestPointerLock(), 100);
              }
            }
          }}
          onTry={() => {
            // Practising an interactive step — unblock input + grab pointer lock
            // so the action can actually be performed. The per-frame loop
            // re-blocks automatically once the step advances.
            tutorialActiveRef.current = false;
            const canvas = mountRef.current?.querySelector('canvas');
            if (canvas && !isTouch) (canvas as HTMLCanvasElement).requestPointerLock();
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
            if (canvas && !isTouch) setTimeout(() => canvas.requestPointerLock(), 100);
          }}
        />
      )}

      {/* Tutorial "New Threat" banner — announces each enemy species the
          Tutorial Enemy Director unlocks. Kills only happen during active play
          (a blocking tutorial card freezes the sim), so this safely coexists
          with the tutorial flow; we only hide it on pause / game-over / the
          completion modal so it never stacks on those. */}
      {gameMode === 'tutorial' && gameStarted && !gameState.isGameOver && !isPaused && !tutorialComplete && (
        <EnemyIntroBanner intro={enemyIntro} onDone={() => setEnemyIntro(null)} />
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
                    if (canvas && !isTouch) (canvas as HTMLCanvasElement).requestPointerLock();
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
                recommendations: skillTreeRef.current.generateRecommendations(),
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
    </div>
  );
};

const WrappedGame = () => (
  <ErrorBoundary>
    <ForestSurvivalGame />
    {/* Rotate-to-landscape gate. Self-contained (uses useDeviceInfo) and
        rendered once at the top level so it overlays every screen on a touch
        device held in portrait. No-op on desktop. */}
    <OrientationGate />
    {/* One-time "best on desktop" heads-up for touch players. No-op on desktop
        and after it's been dismissed once. */}
    <MobileNotice />
  </ErrorBoundary>
);

export default WrappedGame;
