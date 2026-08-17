// MUST STAY FIRST. Raises THREE.Texture.DEFAULT_ANISOTROPY before any
// module-level texture singleton in the imports below is constructed — ES
// modules evaluate dependencies in source order, so this is a guarantee.
// Moving it (or letting a formatter sort the imports) silently drops every
// eagerly-built texture back to unfiltered. See utils/textureDefaults.ts.
import './utils/textureDefaults';
import { useRef, useEffect, useState, useCallback, type CSSProperties } from 'react';
import * as THREE from 'three';
import { GraduationCap, Play, Home, MousePointerClick, ShieldAlert } from 'lucide-react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GunModel, MELEE_CAPABLE_WEAPONS, type WeaponType as GunWeaponType, type ReloadCue, type ReloadStyle, SCOPE_TAKEOVER, OVERCLOCK_DURATION } from './utils/GunModel';
import { MuzzleFlash, MuzzleSmoke, BulletTracer, ImpactEffect, RobotHitSparks, ExplosionEffect, FireNovaEffect, NukeEffect, AbilityCastEffect, ImpactBurst, setMuzzleLightPool, setExplosionLightPool, clearParticleGeometryPools, clearTracerGeometryPool, clearFlashSpritePool, clearSmokeSpritePool, clearExplosionRigPool, clearCastRigPool, clearBurstPairPool, getSoftSparkTexture } from './utils/Effects';
import { HackBeam, buildHackVisuals, updateHackVisuals, disposeHackVisuals } from './utils/HackVisuals';
import { soundManager } from './utils/SoundManager';
import { ambientMusic } from './utils/AmbientMusicSystem';
import { gameSettingsManager, defaultUserSettings, defaultKeyBindings, type UserSettings, type KeyBindings } from './utils/GameSettingsManager';
import { detectHardwareTier } from './utils/hardwareDetect';
import { PostProcessingPipeline } from './utils/PostProcessing';
import { SpatialGrid } from './utils/SpatialGrid';
import { AIBehaviorSystem } from './utils/AIBehaviorSystem';
import { EnemyPerception } from './utils/EnemyPerception';
import { AttackSystem, type MeleeStyle } from './utils/AttackSystem';
import { BulletDodging } from './utils/BulletDodging';
import { WeatherSystem } from './utils/WeatherSystem';
import { BiomeSystem } from './utils/BiomeSystem';
import { MapAmbience } from './utils/MapAmbience';
import { BulletDecalSystem } from './utils/BulletDecals';
import { createAtmosphericHazeMaterial, createSkyDomeMaterial, updateShaderTime } from './utils/Shaders';
import { getMapConfig, getRandomMap, DEFAULT_MAP, type MapConfig, type MapType } from './utils/MapSystem';
import { applyGroundTerrainShader, createTerrainSeed, createTerrainUniforms, resolveTerrainProfile, terrainQualityFor, terrainSegments } from './utils/TerrainSystem';
import { TerrainInstancer } from './utils/TerrainInstancer';
import { getHDRIEnvironmentIntensity, getHDRIEnvironmentProfile, loadHDRIEnvironment, type HDRIEnvironmentProfile } from './utils/HDRIEnvironment';
import { MultiplayerManager, type PlayerData as MpPlayerData, type NetworkMessage, type EnemyWire } from './utils/MultiplayerManager';
import { RemotePlayerManager } from './utils/RemotePlayerManager';
import { prewarmPlayerWounds, disposePlayerWoundAssets } from './utils/PlayerWounds';
import { SnapshotInterpolator, type TransformSample } from './utils/SnapshotInterpolator';
import Minimap, { renderMinimapFrame, isMinimapActive, toggleMinimapExpanded, type MinimapBlip } from './components/Minimap';
import { LocalPlayerShadow } from './utils/LocalPlayerShadow';
import type { ClassId } from './utils/CharacterModels';
import { AbilitySystem } from './utils/AbilitySystem';
import { AchievementSystem, type Achievement } from './utils/AchievementSystem';
import { EnhancedPowerUpSystem } from './utils/EnhancedPowerUps';
import { DayCycleSystem, type AtmosphericSettings } from './utils/DayCycleSystem';
import HUD, { type AbilityHudItem } from './components/HUD';
import DebugConsole, { type DebugInfo } from './components/DebugConsole';
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
import HitMarkers, { addHitMarker, clearHitMarkers } from './components/HitMarkers';
import DamageDirectionIndicator, { triggerDamageDirection, clearDamageDirections } from './components/DamageDirectionIndicator';
import ScreenEffects, { triggerDamageFlash, triggerScreenShake, triggerKillFlash, triggerHeadshotFlash, triggerAbilityFlash, setWaveEventOverlay, setInterferenceOverlay } from './components/ScreenEffects';
import ComboDisplay from './components/ComboDisplay';
import { WEAPONS, type Enemy, type Bullet, type PowerUp, type Particle, type TerrainObject, type HazardKind, type Keys, type GameState } from './types/game';
import { AdaptiveDifficultySystem } from './utils/AdaptiveDifficultySystem';
import { TacticalDirector } from './utils/TacticalDirector';
import { SmartSkillTreeSystem, type Skill, type PlayStyle } from './utils/SmartSkillTreeSystem';
import { TutorialSystem, type TutorialStep } from './utils/TutorialSystem';
import { smartEnemyManager, ENEMY_SCALE, ENEMY_SPAWN_CLEARANCE, type EnemyType as PooledEnemyType } from './utils/SmartEnemyManager';
import { RunEventQueue, type RunContext } from './utils/RunContext';
import {
  buildBulwarkShield, buildHowlerAura, buildOvershieldRing, disposeArchetypeAssets,
  isBlockedByBulwark, BULWARK_FRONT_DAMAGE, TURN_RATE_MULT,
  HOWLER_AURA_RADIUS, HOWLER_SHIELD_AMOUNT, HOWLER_PULSE_MS, HOWLER_SHIELD_LINGER_MS,
  LEAP_CROUCH_MS, LEAP_AIR_MAX_MS, LEAP_RECOVER_MS, LEAP_COOLDOWN_MS,
  LEAP_MIN_RANGE, LEAP_MAX_RANGE, LEAP_IMPACT_DAMAGE, LEAP_ROOT_MS,
  SPLITTER_CHILDREN,
} from './utils/EnemyArchetypes';
import { RagdollSystem } from './utils/RagdollSystem';
import { BattleDamageSystem } from './utils/BattleDamage';
import { SkillTreeMenu } from './components/SkillTreeMenu';
import { TutorialOverlay } from './components/TutorialOverlay';
import EnemyIntroBanner from './components/EnemyIntroBanner';
import BossHealthBar, { setBossHealth } from './components/BossHealthBar';
import WavePerkPicker from './components/WavePerkPicker';
import { aggregatePerkBonuses, NEUTRAL_PERK_BONUSES, rollMysteryBox, isPerkPoolExhausted, WAVE_PERKS, type WavePerkId, type PerkBonuses } from './utils/WavePerkRegistry';
import RunModifierPicker from './components/RunModifierPicker';
import { generateStakeOptions, type RunModifier } from './utils/RunModifierSystem';
import { spawnBarrels, makeBarrelIrradiated, pulseIrradiatedBarrels, irradiatedCoreMaterials, disposeHazardAssets, type ExplosiveBarrel } from './utils/HazardSystem';
import { UplinkNetwork, EmpShockwave } from './utils/UplinkStructure';
import { spawnRangedSentinels, updateSentinelGlow, type RangedSentinel } from './utils/RangedSentinelSystem';
import { CHARACTER_PASSIVES } from './utils/CharacterPassiveRegistry';
import { getCharacterAbility } from './utils/CharacterAbilityRegistry';
import { AbilityViewmodel, abilityPropKind, ABILITY_PAYLOAD_DELAY, type AbilityBeat } from './utils/AbilityViewmodels';
import { FireSystem } from './utils/FireSystem';
import { DAILY_CHALLENGES, DAILY_CHANNEL_MODE, getTodayChallengeId, type DailyEventChannel } from './utils/DailyChallengeRegistry';
import { bonusForLevel, levelFromXp, xpPerKill, xpProgressAtLevel, MAX_MASTERY_LEVEL, type MasteryBonus } from './utils/WeaponMasterySystem';
import { TITLE_FOR_ACHIEVEMENT } from './utils/CosmeticTitles';
import { isTitleEarned } from '../convex/achievementRegistry';
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
import { usePlayerData, setPlayerStatsPaused } from './hooks/usePlayerData';
import { useDeviceInfo } from './hooks/useDeviceInfo';
import { touchControls } from './utils/touchControls';
import { haptic } from './utils/haptics';
import { acquireWakeLock, releaseWakeLock, refreshWakeLock } from './utils/wakeLock';
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
  // radio / zap / radiation are used by the ARK-07 network-event lore cards.
  icon: 'skull' | 'wind' | 'shield' | 'crown' | 'crosshair' | 'radio' | 'zap' | 'radiation';
}

// Gameplay/UX preferences that used to sit behind the in-game EnhancedSettings
// panel (now removed — it was unreachable). They had no live UI, so they stay
// fixed at their established defaults; behaviour is unchanged. Adaptive
// difficulty is also driven by the 'adaptive' difficulty mode at the call sites.
const RUNTIME_PREFS = { adaptiveDifficulty: true, showTutorial: true, showHints: true } as const;

const MENU_MUSIC_URL = '/audio/Beyond_The_Overgrowth.mp3';

// Scalar settings synced to the account, in a FIXED order so the serialized
// blob is byte-stable for equality checks (no spurious DB writes when object
// identity changes but values don't).
const SYNCED_SCALAR_KEYS = [
  'masterVolume', 'sfxVolume', 'musicVolume', 'ambienceVolume', 'sensitivity', 'fov',
  'showFPS', 'showConsole', 'fpsCap', 'screenShake', 'haptics', 'hitMarkers', 'killFeed',
  'impactFeedback', 'ragdollPhysics', 'autoReload', 'cameraBob',
  'showCrosshair', 'crosshairStyle', 'crosshairColor', 'enemyArrowColor',
] as const satisfies readonly (keyof UserSettings)[];

// SPARSE serialization for MAX DB savings: only keys that DIFFER from the
// defaults are written, so a stock account stores ~nothing and a tweaked one
// stores only its deltas. mergeSettings() on load fills the rest from defaults,
// so a missing key always means "default" (and dropping back to a default value
// shrinks the blob again). The graphics section is stored compactly — just the
// preset name for a named tier; the full knob set only for a custom mix.
function serializeSettings(s: UserSettings): string {
  const out: Record<string, unknown> = {};
  for (const key of SYNCED_SCALAR_KEYS) {
    if (s[key] !== defaultUserSettings[key]) out[key] = s[key];
  }
  // keyBindings: only the actions rebound away from the default.
  const kb: Record<string, string> = {};
  for (const action of Object.keys(s.keyBindings) as (keyof typeof s.keyBindings)[]) {
    if (s.keyBindings[action] !== defaultKeyBindings[action]) kb[action] = s.keyBindings[action];
  }
  if (Object.keys(kb).length > 0) out.keyBindings = kb;
  // Graphics: a named tier needs only its name; a custom mix carries the knobs.
  const g = s.graphics;
  if (g.preset === 'custom') {
    out.graphics = {
      preset: 'custom', baseTier: g.baseTier, resolution: g.resolution, shadows: g.shadows,
      antialias: g.antialias, postProcessing: g.postProcessing, particleDensity: g.particleDensity,
      viewDistance: g.viewDistance, terrainDetail: g.terrainDetail, maxEnemies: g.maxEnemies,
    };
  } else if (g.preset !== defaultUserSettings.graphics.preset) {
    out.graphics = { preset: g.preset };
  }
  return JSON.stringify(out);
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
  // `undefined` means loading OR paused-for-a-match (see setPlayerStatsPaused)
  // — never clobber the run-start snapshot the game loop reads with it. `null`
  // (signed out) is meaningful and does propagate.
  useEffect(() => {
    if (playerStats !== undefined) playerStatsRef.current = playerStats;
  }, [playerStats]);
  useEffect(() => { mergeAchievementsRef.current = mergeAchievementsMutation; }, [mergeAchievementsMutation]);

  const [gameMode, setGameMode] = useState<'none' | 'classic' | 'multiplayer' | 'tutorial'>('none');
  const [showClassicMenu, setShowClassicMenu] = useState(false);
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  // A run snapshots the server's current daily total before it begins adding
  // local events. Without this baseline, two shorter runs each reporting (for
  // example) 50 kills would both `max()` to 50 instead of reaching 100.
  //
  // UNSUBSCRIBED while a game is live: the run's own 3-second progress flushes
  // patch this very row, so staying subscribed echoed every flush back as a
  // full App-tree re-render mid-combat — one of the "random stutter" sources.
  // The ref keeps the pre-run snapshot (the only thing the game loop reads),
  // and leaving the game resubscribes for a fresh baseline. The undefined
  // guard stops the skip's transient `undefined` from wiping that snapshot.
  const dailyProgressData = useQuery(api.daily.getDaily, isAuthenticated && !gameStarted ? {} : 'skip');
  const dailyProgressRef = useRef(dailyProgressData);
  useEffect(() => {
    if (dailyProgressData !== undefined) dailyProgressRef.current = dailyProgressData;
  }, [dailyProgressData]);

  // Same reasoning for the shared playerStats subscription: the run's own
  // mastery-XP / achievement flushes patch that row every few seconds, and each
  // patch pushed a fresh result → provider re-render → full App-tree
  // reconciliation mid-combat. Nothing consumes LIVE stats during a match (the
  // game loop reads playerStatsRef, snapshotted at run start; menus are
  // unmounted), so pause the subscription for the duration of the run.
  useEffect(() => {
    setPlayerStatsPaused(gameStarted);
    return () => setPlayerStatsPaused(false);
  }, [gameStarted]);
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
  // Dynamic crosshair root — the game loop writes the live aim-spread (in px)
  // into its `--chs` CSS var each frame so the reticle opens/closes with the
  // weapon's real cone (only the 'dynamic' crosshair style reads it).
  const crosshairRef = useRef<HTMLDivElement>(null);
  // Sniper scope picture — driven per-frame through this ref (never setState;
  // see the perf invariants). `--apf` is the 0..1 aperture factor.
  const scopeOverlayRef = useRef<HTMLDivElement>(null);
  // Picked perks for the active run — surfaces as a small chip in the HUD
  // so the player can see at a glance what's stacked.
  const [activeRunPerks, setActiveRunPerks] = useState<WavePerkId[]>([]);
  // Run-Modifier picker step — sits between ClassicMenu and the shader loader
  // so the player gets one last "raise the stakes" choice before the world
  // initialises. Selected modifier is stored as a ref so the game loop's
  // closure can read it once on init without forcing a re-render dependency.
  const [runModifierPickerOptions, setRunModifierPickerOptions] = useState<RunModifier[] | null>(null);
  const pendingClassicStartRef = useRef<{ difficulty: 'easy' | 'medium' | 'hard' | 'adaptive'; timeOfDay: 'day' | 'night' | 'auto'; map: MapType; isRandom: boolean } | null>(null);
  const activeRunModifierRef = useRef<RunModifier | null>(null);
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
  // Lifecycle metadata for the power-up announcement pill. `ms` is the total
  // on-screen time (entrance → hold → auto-collapse) so the pill's single CSS
  // keyframe can scale itself to the message duration; `key` forces a fresh
  // mount per message so the animation restarts (and the collapse replays)
  // even when two identical messages fire back-to-back.
  const [powerUpMeta, setPowerUpMeta] = useState<{ ms: number; key: number }>({ ms: 2000, key: 0 });
  // Tutorial-only "New Threat" banner — announces each enemy species the moment
  // the Tutorial Enemy Director unlocks it, turning the tutorial into a bestiary.
  const [enemyIntro, setEnemyIntro] = useState<EnemyIntro | null>(null);
  const [abilityHud, setAbilityHud] = useState<AbilityHudItem[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => gameSettingsManager.getSettings());
  // Live keybindings the game loop reads every frame. Kept in a ref (not state)
  // so rebinding from the pause-menu settings applies instantly without
  // re-running the long-lived game effect. Refreshed by the settings subscription.
  const keyBindingsRef = useRef<KeyBindings>(gameSettingsManager.getSetting('keyBindings'));
  // Live FPS cap (0 = unlimited). Read every animation frame, refreshed by the
  // settings subscription, so changing it applies instantly without restart.
  const fpsCapRef = useRef<number>(gameSettingsManager.getSetting('fpsCap'));
  const [currentFPS, setCurrentFPS] = useState(0);
  // ── Debug console (F3-style overlay) ── the game loop writes a snapshot
  // into the ref at ~4Hz (only while the Settings toggle is on) then bumps the
  // tick so the overlay re-renders without any per-frame React work.
  const debugInfoRef = useRef<DebugInfo | null>(null);
  const [debugTick, setDebugTick] = useState(0);
  // ── Enemy GPS hunt markers ── two pre-allocated DOM markers (arrow + live
  // distance pill) driven imperatively by the game loop when only 1–2 enemies
  // remain in the wave: style.transform writes only, zero React per frame.
  const enemyArrowRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  // Live stamina + exhaustion flags pushed from the per-frame game loop
  // so the HUD can draw the bottom-left pie meter at the correct fill.
  const [staminaRatio, setStaminaRatio] = useState(1);
  const [staminaExhaustedUI, setStaminaExhaustedUI] = useState(false);
  // ── ARK-07 network events (lore layer) ── HUD chip state. `waveEventUI`
  // marks the CURRENT wave's modifier (OVERDRIVE SURGE / NULL WAVE). Relay-
  // field exposure deliberately has NO HUD readout — it announces itself
  // through the interference vision (post-FX blur + DOM overlay) instead.
  const [waveEventUI, setWaveEventUI] = useState<'surge' | 'glitch' | null>(null);
  // Reload feedback: holds the in-progress reload's total duration (ms) so the
  // crosshair indicator can time its CSS sweep, or null when not reloading.
  const [reloadDurationUI, setReloadDurationUI] = useState<number | null>(null);
  // Active-reload feedback — true from the moment a perfect reload is hit
  // until the (snapped) reload completes; flips the ring emerald + "Perfect!".
  const [reloadPerfectUI, setReloadPerfectUI] = useState(false);

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
  // Set when this client is ejected mid-match (host kick / anti-cheat). Drives
  // the full-screen "removed from match" overlay; cleared by returning to menu.
  const [kickedReason, setKickedReason] = useState<string | null>(null);
  // True only during a live match (not lobby / not game-over), so the in-game
  // kick handler never collides with the lobby's own kick handling.
  const inMatchRef = useRef(false);
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
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Tutorial & Skill Tree refs + state (bridge useEffect closure → React render)
  const tutorialRef = useRef<TutorialSystem | null>(null);
  const tutorialActiveRef = useRef(false); // true while tutorial popup is showing — blocks pointer lock
  // True while the guided run is still meant to finish normally. "End Tutorial"
  // clears it, which is how the render loop tells a real completion (show the
  // celebration card) apart from the player bailing out (straight back to play).
  const tutorialRunningRef = useRef(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [tutorialProgress, setTutorialProgress] = useState(0);
  const [tutorialMeta, setTutorialMeta] = useState({ number: 0, total: 0 });
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

  // Shared skill-unlock handler — used by BOTH the in-game (pause) and the
  // main-menu skill tree so the two access points stay perfectly in sync.
  // The server validates cost + prerequisites and is the single source of
  // truth; we mirror its result into the live system so in-match stat bonuses
  // pick it up on the next refresh, and Convex reactivity re-hydrates
  // skillTreeData everywhere the moment playerStats changes.
  const handleUnlockSkill = useCallback(async (skillId: string) => {
    if (!isAuthenticated || !skillTreeRef.current) return;
    try {
      const result = await unlockSkillMutation({ skillId });
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
  }, [isAuthenticated, unlockSkillMutation]);

  // Leaving a match (back to lobby / menu / game-over) re-arms the
  // multiplayer start guard so the next match can begin cleanly.
  useEffect(() => {
    if (!gameStarted) {
      mpStartHandledRef.current = false;
      mpWaitingForHostRef.current = false;
      setMpWaitingForHost(false);
    }
  }, [gameStarted]);

  const menuMusicRef = useRef<HTMLAudioElement | null>(null);
  const menuMusicUnlockCleanupRef = useRef<(() => void) | null>(null);
  const menuMusicVolumeRef = useRef(0);

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
    if (isTouch) {
      // `is-touch` gates in-game touch CSS; `mobile-ui` gates the dedicated
      // phone/tablet layouts of the menus (full-bleed sheets, compact chrome).
      document.body.classList.add('is-touch', 'mobile-ui');
    }
    return () => {
      document.body.classList.remove('is-touch', 'mobile-ui');
      touchControls.enabled = false;
    };
  }, [isTouch]);

  // Hold the screen awake for as long as a run is on screen (touch only).
  // Phones sleep on an idle timer and holding a stick/trigger doesn't reliably
  // reset it, so without this the display dims mid-firefight. Released the
  // moment gameplay ends so it never keeps a menu screen lit.
  useEffect(() => {
    if (!isTouch || !gameStarted) return;
    void acquireWakeLock();
    return () => releaseWakeLock();
  }, [isTouch, gameStarted]);

  // Mobile browsers suspend the AudioContext aggressively (backgrounding, the
  // silent switch, call interruptions). Any tap is a valid moment to bring it
  // back — the call is a no-op unless it's actually suspended.
  useEffect(() => {
    if (!isTouch) return;
    const resumeAudio = () => soundManager.resumeContext();
    window.addEventListener('pointerdown', resumeAudio, { passive: true });
    return () => window.removeEventListener('pointerdown', resumeAudio);
  }, [isTouch]);

  // First-run graphics default: probe the browser/device (CPU threads, RAM, GPU)
  // and pick the matching preset, so the game opens at a sensible tier for the
  // hardware instead of always `high`. Only applied when the player has NO saved
  // preference yet (fresh install / cleared storage), so it never overrides a
  // choice. The player can re-run this any time via "Auto-Detect" in Settings.
  useEffect(() => {
    try {
      if (!localStorage.getItem('gameSettings')) {
        gameSettingsManager.setGraphicsPreset(detectHardwareTier().tier);
      }
    } catch { /* localStorage unavailable — keep defaults */ }
  }, []);


  // Sync user settings from the manager. The subscription covers EVERY change
  // path — updateSetting/updateSettings/resetToDefaults/importSettings all
  // notify, and cross-tab localStorage edits are folded in via the manager's
  // own `storage` listener which notifies too. (This used to also poll
  // getSettings() every second "just in case"; getSettings returns a fresh
  // object each call, so that poll re-rendered the ENTIRE App tree at 1Hz —
  // including mid-combat, where each reconciliation is a frame-budget spike.
  // The poll added no coverage, only the stutter.)
  useEffect(() => {
    const unsubscribe = gameSettingsManager.subscribe((settings) => {
      setUserSettings(settings);
      keyBindingsRef.current = settings.keyBindings;
      fpsCapRef.current = settings.fpsCap;
    });
    return unsubscribe;
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
        // importSettings rebuilds from defaults — migrating legacy blobs
        // (flat graphicsQuality, retired damageNumbers) into the new shape and
        // dropping stale keys, so old accounts restore cleanly.
        gameSettingsManager.importSettings(JSON.parse(blob));
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
      // 'none', not 'auto': the menu track is a 1.5 MB MP3 that browsers will
      // never play before a user gesture anyway, so preloading it only competes
      // with the menu's own LCP render for bandwidth. It is promoted to 'auto'
      // in resumeMusic() below, immediately before the first play() — by which
      // point the page has long since painted. No behavioural change.
      music.preload = 'none';
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
        // Undo the 'none' set at construction: the gesture has arrived, so the
        // track is now genuinely wanted.
        if (currentMusic.preload !== 'auto') currentMusic.preload = 'auto';
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

  // NOTE: game_start handler is now registered in MultiplayerLobby.tsx to fix timing issues
  useEffect(() => {
    if (!multiplayerManager) return;

    // Helper: narrow the polymorphic network payload to the message
    // variant we just subscribed to. The MultiplayerManager dispatches
    // each handler by string type, so the cast is sound at runtime.
    type MsgFor<T extends NetworkMessage['type']> = Extract<NetworkMessage, { type: T }>;
    const asMsg = <T extends NetworkMessage['type']>(raw: unknown) => raw as MsgFor<T>;

    const unsubGameOver = multiplayerManager.onMessage('game_over', (raw) => {
      const data = asMsg<'game_over'>(raw);
      setMultiplayerWinner(data.winnerId);
      setMultiplayerGameOver(true);
      soundManager.mute();
    });

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
    // Ejected mid-match by the host or anti-cheat. Surface the reason on a
    // full-screen overlay; the button returns to the menu. Gated to live
    // matches (inMatchRef) so it never collides with the lobby kick handler.
    const unsubKickedInGame = multiplayerManager.onMessage('player_kicked', (raw) => {
      if (!inMatchRef.current) return;
      const data = asMsg<'player_kicked'>(raw);
      setKickedReason(data.reason || 'You were removed from the match.');
      try { soundManager.mute(); } catch { /* ignore */ }
    });

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
      unsubKickedInGame();
      unsubPlayerUpdate();
      unsubEnemyKilled();
      clearInterval(statsInterval);
      clearInterval(killFeedInterval);
      if (statsTrailingTimer) clearTimeout(statsTrailingTimer);
    };
  }, [multiplayerManager]);

  // Keep the in-match flag fresh for the kick handler's gate.
  useEffect(() => {
    inMatchRef.current = gameStarted && !showMultiplayerLobby && !multiplayerGameOver;
  }, [gameStarted, showMultiplayerLobby, multiplayerGameOver]);

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
      // Easy — gentlest mode, nudged a tiny bit above a total walk.
      easy:     { healthMult: 1.0, speedMult: 0.7,  damageMult: 0.9,  spawnMult: 0.8, regenRate: 0,    aggroMult: 0.78, reactionMult: 1.4,  chaseMult: 0.85 },
      // Medium — restored to a COMPETITIVE mid challenge (the boss / runner /
      // Revenant fight at their proper, full strength here). A hair tamer than
      // the original on speed/reaction so it stays clearly below Hard.
      medium:   { healthMult: 1.4, speedMult: 1.0,  damageMult: 1.25, spawnMult: 1.0, regenRate: 0.1,  aggroMult: 1.0,  reactionMult: 1.0,  chaseMult: 1.0 },
      // Hard — the original, brutal, fully-competitive numbers. Apex enemies hit
      // their hardest here.
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
    // Which base steering profile the AI behaviour tree should use for each
    // archetype. Record-typed so a new archetype must declare one.
    const STEER_ARCHETYPE: Record<PooledEnemyType, 'normal' | 'fast' | 'tank' | 'boss' | 'ranged'> = {
      normal: 'normal', fast: 'fast', tank: 'tank', boss: 'boss', ranged: 'ranged',
      revenant: 'fast', leaper: 'fast', bulwark: 'tank', splitter: 'tank', howler: 'ranged',
    };
    // Typed as Record<PooledEnemyType, …> so adding an archetype to the union
    // is a COMPILE ERROR here rather than a silently-unencodable enemy.
    const ENEMY_TYPE_CODE: Record<PooledEnemyType, number> = {
      normal: 0, fast: 1, tank: 2, boss: 3, ranged: 4, revenant: 5,
      // Codes 6-9 appended for the tactical archetypes. Like the Revenant
      // these are solo-only and never actually cross the wire, but the codes
      // exist so the encoder is total and the ordering stays append-only.
      bulwark: 6, howler: 7, leaper: 8, splitter: 9,
    };
    // (Revenant + the tactical archetypes are solo-only — their codes exist for
    // type-soundness; they never actually stream over the MP wire.)
    const ENEMY_TYPE_FROM_CODE: PooledEnemyType[] = [
      'normal', 'fast', 'tank', 'boss', 'ranged', 'revenant',
      'bulwark', 'howler', 'leaper', 'splitter',
    ];
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
    // Subverter: reused vectors so a hacked enemy can re-point its "focus" at a
    // victim enemy (and emit overclock sparks) without per-frame allocation.
    const _hackFocus = new THREE.Vector3();
    const _hackSparkDir = new THREE.Vector3();
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
        // Its own cue — an achievement used to share the generic pickup ping.
        soundManager.play('cue_achievement', 0.85);
        // Sync the FULL unlocked mask (an idempotent bitwise OR server-side)
        // rather than a single bit, so if one sync is rate-limited the next
        // successful one backfills every achievement earned so far.
        const mask = achievementSystem.getUnlockedMask();
        // Cosmetic Title — auto-equip the first available title the player
        // hasn't equipped yet. Future iterations let the player pick via
        // Profile; this MVP cut just surfaces SOMETHING in the kill feed.
        const earnedTitle = TITLE_FOR_ACHIEVEMENT[achievement.id];
        if (mask) {
          void mergeAchievementsRef.current({ mask })
            .then((result) => {
              // equipTitle validates the title against the PERSISTED bitmask,
              // so it must run only after the granting achievement has landed.
              // Firing both in the same tick raced — and a rate-limited merge
              // returns the pre-merge mask, meaning the bit genuinely isn't
              // stored yet. Gate on what the server actually came back with;
              // the next unlock's merge backfills and retries this.
              if (!earnedTitle || equippedTitleRef.current) return;
              if (!isTitleEarned(earnedTitle, result.achievements)) return;
              equippedTitleRef.current = earnedTitle;
              // Roll the local ref back if the server refuses, so the kill feed
              // never shows a title that isn't actually persisted (and the next
              // unlock gets a clean shot at equipping one).
              return equipTitleRef.current({ title: earnedTitle }).catch((err) => {
                if (equippedTitleRef.current === earnedTitle) equippedTitleRef.current = null;
                throw err;
              });
            })
            .catch(() => { /* best-effort */ });
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
    // Force enable adaptive AI when random/adaptive mode is selected. In the
    // dedicated Adaptive MODE the adjustment rate is cranked up so the system
    // genuinely tracks the player (a true rubber-band), vs the subtle background
    // assist used in the fixed modes.
    adaptiveDifficulty.setAdaptive(
      RUNTIME_PREFS.adaptiveDifficulty || classicDifficulty === 'adaptive',
      classicDifficulty === 'adaptive' ? 0.4 : 0.15,
    );

    // ── ADAPTIVE MODE LIVE TUNING ────────────────────────────────────────────
    // In Adaptive difficulty ONLY, the AdaptiveDifficultySystem's performance
    // read drives enemy stats LIVE: health/damage/spawn are pushed onto
    // diffSettings (applied to newly-spawned enemies), and a smoothed speed
    // multiplier is applied to EVERY enemy's movement each frame so the swarm
    // visibly speeds up when the player dominates and eases off when they
    // struggle. Fixed difficulties (easy/medium/hard) never touch these.
    const isAdaptiveMode = classicDifficulty === 'adaptive';
    let adaptiveSpeedTarget = 1.0;  // refreshed each adaptive update from the profile
    let adaptiveSpeedMult = 1.0;    // per-frame smoothed value used in movement

    // ── ADAPTIVE TACTICAL DIRECTOR ───────────────────────────────────────────
    // The swarm-wide "brain over the brains": it reads HOW the player is playing
    // (camping, kiting, sniping at range, brawling) and re-tunes the entire enemy
    // squad's approach each tick to counter it — flanking a camper, cutting off a
    // kiter, rushing a sniper. Solo only (in MP enemies serve many players, so it
    // stays neutral). Its directive flows into every enemy's makeDecision().
    const tacticalDirector = new TacticalDirector(classicDifficulty);
    const tacticalActive = !isMultiplayer; // gate the whole feature to solo
    let lastTacticalUpdateMs = performance.now();
    let lastTacticalStance = tacticalDirector.getStance();
    let nextTacticalCalloutAt = 0; // ms gate so the "swarm adapts" note stays rare

    // 2. Smart Skill Tree - Personalized progression.
    // Authenticated players hydrate persisted skills + points so unlocked
    // skills apply from the first frame (bonuses are computed below at init).
    const skillTree = new SmartSkillTreeSystem();
    if (isAuthenticatedRef.current && playerStatsRef.current) {
      skillTree.hydrate(playerStatsRef.current.skills, playerStatsRef.current.skillPoints);
    }

    // 6. Tutorial System — the guided drill (tutorial mode only)
    const tutorial = new TutorialSystem();
    tutorial.setEnabled(RUNTIME_PREFS.showTutorial);

    // Store refs so React render can access these systems
    tutorialRef.current = tutorial;
    skillTreeRef.current = skillTree;

    // Tutorial mode: force tutorial on + reduce difficulty for learning
    const isTutorialMode = gameMode === 'tutorial';

    // ── GUIDED-TUTORIAL CAPABILITY LADDER ────────────────────────────────
    // The tutorial teaches one control at a time, so everything it hasn't
    // taught YET is genuinely inert: look-only, then walking, then sprint +
    // the full combat kit, and finally the abilities. `true` = still locked.
    // Outside tutorial mode every lock is open forever, so the hot paths that
    // read these pay for one boolean and behave exactly as before.
    const tutorialLocks = {
      move: isTutorialMode,
      sprint: isTutorialMode,
      combat: isTutorialMode,
      ability: isTutorialMode,
    };
    // Re-read the ladder from the tutorial system. Called on every step change
    // and when the run ends (`isGranted` opens everything once it's inactive),
    // never per-frame — it walks the step list.
    const syncTutorialLocks = () => {
      tutorialLocks.move = isTutorialMode && !tutorial.isGranted('move');
      tutorialLocks.sprint = isTutorialMode && !tutorial.isGranted('sprint');
      tutorialLocks.combat = isTutorialMode && !tutorial.isGranted('combat');
      tutorialLocks.ability = isTutorialMode && !tutorial.isGranted('ability');
    };

    // Step-transition bookkeeping. The render loop is the SINGLE owner of every
    // transition (spawns, locks, pointer lock, React state) — the overlay's
    // buttons only poke the system and let the loop notice.
    let tutorialGuidedOn = false;
    let tutorialLastStepId: string | null = null;
    let tutorialLastStepDone = false;

    // `look` / `move` / `sprint` are CONTINUOUS actions. Sampling them once per
    // frame made a drill 8x shorter on a 240Hz rig than on a 30fps laptop (and a
    // 1000Hz mouse finished the look step before the player registered it), so
    // they're sampled at a fixed 30Hz instead — the step takes the same real
    // time on every machine.
    const tutorialHoldAt: Record<string, number> = {};
    const recordTutorialHold = (action: string) => {
      const t = performance.now();
      if (t - (tutorialHoldAt[action] ?? 0) < 33) return;
      tutorialHoldAt[action] = t;
      tutorial.recordAction(action, 1);
    };

    if (isTutorialMode) {
      tutorial.start();
      tutorialGuidedOn = true;
      tutorialRunningRef.current = true;
      syncTutorialLocks();
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
        tutorialLastStepId = firstStep.id;
        tutorialLastStepDone = false;
        setTutorialStep({ ...firstStep });
        setTutorialProgress(tutorial.getProgress());
        setTutorialMeta({ number: tutorial.getStepNumber(), total: tutorial.getStepCount() });
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
      // ULTRA-REALISTIC pacing: 0.22 stretches a full 24-hour cycle to
      // ~9 real minutes (was ~140 s at 0.85). Sunsets now unfold over a
      // couple of minutes like real golden hour — combined with the
      // quintic anchor blending and the weather fronts layered on top,
      // the sky reads as a living atmosphere instead of a colour strobe.
      // A long run still sees the full day → dusk → night → dawn arc.
      dayCycleSystem.setCycleSpeed(0.22);
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
    // `graphicsPreset` is the RESOLVED engine config (named tier OR custom mix).
    // `graphicsQuality` is the representative named tier (baseTier) for the few
    // cosmetic choices not captured by the numeric knobs (haze density, HDRI res).
    const graphicsPreset = gameSettingsManager.getGraphicsPreset();
    const graphicsQuality = gameSettingsManager.getGraphicsQuality();
    // "Low tier" = the performance path: shadow-less / post-less, skipping the
    // pricier cosmetic extras (atmospheric haze sphere, gun fill-lights) and
    // using the cheap pixelated upscale + low-detail sky. Derived from the
    // EFFECTIVE post-processing flag (the only presets with post off are LOW /
    // ULTRA LOW) so a CUSTOM mix that turns post-processing off coherently gets
    // the same performance path — no dependence on the preset NAME.
    const lowTier = !graphicsPreset.postProcessing;

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
    renderer.shadowMap.type = lowTier ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
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
      // Use smooth scaling for higher quality, pixelated for the low tier (the
      // crisp nearest-neighbour upscale is cheaper than the browser's bilinear).
      if (lowTier) {
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

    // Ensure enemies pick up the correct (sun-driven) emissive profile on frame 1.
    const initialNightFactor = atmosphericSettings.sunVisible
      ? Math.min(1, Math.max(0, (0.30 - initialSunDirection.y) / 0.30))
      : 1;
    smartEnemyManager.setNightFactor(initialNightFactor);

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

    // Set while the GPU context is gone so the render loop pauses cleanly.
    let webglContextLost = false;
    // WebGL context loss / restore. A GPU driver reset (TDR) — far more likely
    // when a too-high preset overwhelms a weak GPU — kills the context mid-game.
    // The OLD restore handler was a no-op, so after a reset the renderer's
    // shadow-map + post-FX render targets were never re-established and SHADOWS
    // (among other effects) silently stayed broken for the rest of the session —
    // the reported "playing the game sometimes disables shadows entirely" bug.
    // We now pause rendering while the context is gone (so the loop doesn't spew
    // GL errors against a dead context) and, on restore, re-assert the shadow
    // pipeline + resize the targets so shadows come straight back.
    const onWebGLContextLost = (event: Event) => {
      event.preventDefault(); // signal we'll recover → browser fires `restored`
      webglContextLost = true;
      console.error('WebGL context lost — pausing render until restored');
    };
    const onWebGLContextRestored = () => {
      // Re-establish shadow state explicitly (render targets were recreated by
      // three on restore, but the enabled/type flags + a fresh shadow render
      // must be re-kicked) and resize the post-FX chain to the live canvas.
      renderer.shadowMap.enabled = graphicsPreset.shadowsEnabled;
      renderer.shadowMap.type = lowTier ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
      renderer.shadowMap.needsUpdate = true;
      const w = Math.floor(window.innerWidth * graphicsPreset.pixelRatio);
      const h = Math.floor(window.innerHeight * graphicsPreset.pixelRatio);
      renderer.setSize(w, h, false);
      postFX?.setSize(w, h);
      webglContextLost = false;
      console.warn('WebGL context restored — rendering resumed');
    };
    renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);

    // ═══ KEY + SKY LIGHTING ═════════════════════════════════════════════
    // Per-map indirect shaping. These reuse the renderProfile knobs that used
    // to drive three now-deleted lights, so no map loses its authored look —
    // see the long note below the hemisphere light. Declared HERE, ahead of
    // the first light that reads them: they are `const`, so referencing them
    // from an earlier line would hit the temporal dead zone at scene build.
    const skyFillScale = renderProfile.fillLight ?? 1.0;            // cool sky fill
    const groundBounceScale = renderProfile.volumetricLight ?? 1.0; // warm bounce
    const keyBoost = 0.82 + 0.18 * (renderProfile.rimLight ?? 1.0); // edge punch

    // See the long note below the hemisphere light for the full rationale.
    // In short: one shadow-casting key, one normal-varying sky term, and the
    // smallest flat ambient that still keeps deep crevices off pure black.
    //
    // AMBIENT is the flatness dial. Every unit here is added identically to
    // lit and shadowed pixels alike, so it is a direct subtraction from shadow
    // contrast — the old 0.80 is why shadows read as washed grey. At 0.30 the
    // shadows have real depth and the sky term below still carries the detail.
    //
    // PRESET SYNC: a tier with no shadow map has no cast shadows to protect,
    // and a hard single key against zero indirect makes unlit sides read as
    // dead flat. Those tiers get a higher floor so the world stays legible —
    // this is the ONLY place the two lighting models differ, and it keeps
    // ULTRA LOW looking deliberate rather than broken.
    const AMBIENT_FLOOR = graphicsPreset.shadowsEnabled ? 0.30 : 0.55;
    const ambientLight = new THREE.AmbientLight(
      renderAtmosphere.ambientColor,
      renderAtmosphere.ambientIntensity * AMBIENT_FLOOR,
    );
    scene.add(ambientLight);

    // Main directional light (Sun/Moon). Now the ONLY directional light and
    // the only shadow caster, so it inherits the direct contribution the
    // deleted fill/rim/bounce lights used to add on the lit side — hence 2.15×
    // rather than 1.6×. One clean specular lobe instead of four competing
    // smears is most of what makes the highlights read as sun on a surface.
    const KEY_INTENSITY_SCALE = 2.15;
    const mainLight = new THREE.DirectionalLight(
      renderAtmosphere.lightColor,
      renderAtmosphere.lightIntensity * KEY_INTENSITY_SCALE * keyBoost,
    );
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
    // Shadow frustum size derived from the EFFECTIVE shadow-map resolution so a
    // CUSTOM mix stays coherent (a bigger map covers more ground at the same
    // texel density): 4096→120, 2048→100, 1024→72, ≤512→48.
    const sms = graphicsPreset.shadowMapSize;
    // TIGHTENED ~20% across every tier (was 120/100/72/48). Shadow crispness is
    // texel DENSITY — map resolution divided by the world area it covers — so
    // shrinking the frustum at a fixed map size buys ~55% more texels per metre
    // for exactly zero additional cost. That is the other half of "the shadows
    // feel faded": they were both washed out by the old fill lights AND
    // under-sampled. Shrinking it further would start clipping shadows of tall
    // trees out of the frustum at the edges of the visible range.
    const shadowRange = sms >= 4096 ? 96 : sms >= 2048 ? 80 : sms >= 1024 ? 58 : 40;
    mainLight.shadow.camera.left = -shadowRange;
    mainLight.shadow.camera.right = shadowRange;
    mainLight.shadow.camera.top = shadowRange;
    mainLight.shadow.camera.bottom = -shadowRange;
    mainLight.shadow.mapSize.width = graphicsPreset.shadowMapSize;
    mainLight.shadow.mapSize.height = graphicsPreset.shadowMapSize;
    mainLight.shadow.bias = -0.00022;
    mainLight.shadow.normalBias = 0.04;
    // Tighter shadow radius (less penumbra) = harder, more defined shadow
    // edges — the AAA "crisp directional shadow" look. Scaled with the map size
    // (same source as the frustum) so custom mixes stay consistent.
    mainLight.shadow.radius = sms >= 4096 ? 1.6 : sms >= 2048 ? 1.3 : sms >= 1024 ? 1.0 : 0.7;
    mainLight.shadow.camera.updateProjectionMatrix();
    scene.add(mainLight);
    // Target follows player so directional shadows stay centered on the camera
    scene.add(mainLight.target);

    // ── SKY / INDIRECT ────────────────────────────────────────────────────
    // The hemisphere is now the whole indirect model, and it does the job the
    // deleted fill and bounce lights were faking — better, because it varies
    // with the surface normal. Up-facing surfaces take the sky's colour,
    // down-facing surfaces take warm light bounced off the ground, and
    // everything between gets a real gradient. That gradient is what makes a
    // shadowed surface still read as a SHAPE rather than a flat grey patch,
    // which a plain ambient term can never do at any intensity.
    const skyColor = new THREE.Color(renderAtmosphere.skyColor);
    // Bounce is warmed and lifted toward the sun's own colour rather than
    // being a dimmed copy of the sky: real ground bounce carries the terrain's
    // albedo and the key light's warmth, and this is what replaces the deleted
    // "warm volumetric bounce" light for a fraction of the cost.
    const groundColor = new THREE.Color(renderAtmosphere.lightColor)
      .lerp(skyColor, 0.45)
      .multiplyScalar(0.42 * groundBounceScale);
    // Carries the indirect budget the old ambient used to waste on flat fill.
    const SKY_FILL_SCALE = 1.15;
    const skyLight = new THREE.HemisphereLight(
      skyColor.getHex(),
      groundColor.getHex(),
      renderAtmosphere.ambientIntensity * SKY_FILL_SCALE * skyFillScale,
    );
    scene.add(skyLight);

    // ═══ WHAT USED TO BE HERE, AND WHY IT IS GONE ═══════════════════════
    //
    // Three more unshadowed DirectionalLights (a warm "volumetric" bounce, an
    // opposite-side fill and a rim) plus a SECOND full-strength AmbientLight
    // for night. Seven global lights in total.
    //
    // That rig is why the shadows read as faded and the highlights as weak.
    // A shadow can only ever be as dark as the light that still reaches it,
    // and here four separate lights reached everywhere:
    //   • two ambient terms added a flat, directionless floor to EVERY pixel,
    //     shadowed or not — the single most effective way to destroy shadow
    //     contrast that exists;
    //   • the fill and rim lights cast NO shadows, so they lit straight into
    //     shadowed geometry and flattened it further;
    //   • and with four specular lobes competing, no single highlight could
    //     dominate, so lit surfaces got a broad smear instead of a crisp
    //     sun glint.
    // Adding lights to fix flat lighting makes it flatter. The fix is fewer,
    // stronger, better-motivated ones.
    //
    // It was also the most expensive thing in the frame: three.js evaluates a
    // full GGX specular + Lambert diffuse BRDF per directional light per
    // fragment, so this cost FOUR direct-lighting evaluations on every lit
    // pixel in the world. Collapsing to one removes ~75% of that ALU across
    // the entire scene — the largest single GPU saving available, and it is
    // the same edit that fixes the look.
    //
    // The scene now runs a KEY + SKY model:
    //   • mainLight   — the sun/moon. The only directional light, and the only
    //                   shadow caster. It owns all direct light and the one
    //                   specular highlight.
    //   • skyLight    — a HemisphereLight carrying ALL indirect: sky colour
    //                   from above, bounced ground colour from below. Unlike
    //                   an ambient term it varies with surface normal, so it
    //                   still SHADES form in shadow instead of flooding it.
    //   • ambientLight— kept deliberately small, purely so deep undersides
    //                   don't crush to pure black.
    //
    // The per-map art direction is preserved, not discarded: the renderProfile
    // knobs that drove the deleted lights are folded into the two that remain
    // (see skyFillScale / groundBounceScale / keyBoost below), so every map
    // keeps its identity at a quarter of the cost.
    //
    // ⚠ Light COUNT is a shader define (NUM_DIR_LIGHTS / NUM_HEMI_LIGHTS). It
    // is fixed here at scene build so every program compiles once during
    // warmup. Never add or remove a light after that — see the warmup and
    // dynamic-light invariants.

    // (skyFillScale / groundBounceScale / keyBoost are declared above the
    // ambient light — they are read by the lights themselves.)

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
    const enableGunFillLights = !lowTier;
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
        case 'subverter':
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
    // Scratch colour for the per-frame hemisphere sync — the ground-bounce
    // tint is a blend of two colours, and doing it in place keeps that sync
    // allocation-free (it runs every frame).
    const _skyScratch = new THREE.Color();

    // ── TERRAIN SHAPE + GROUND-TEXTURE IDENTITY (per map, per run) ─────────
    // A seeded, WORLD-LOCKED height field (TerrainSystem) displaces the ground
    // into rolling hills / dunes / ridges out in the fogged mid-field while
    // keeping a perfectly flat combat disc around the player — so the whole
    // gameplay + VFX layer stays on y == 0 and nothing floats or clips. The
    // seed is fresh each run, so every playthrough gets a distinct landscape.
    const terrainProfile = resolveTerrainProfile(mapConfig);
    const terrainSeed = createTerrainSeed();
    // Detail-quality scalar for the ground shader's overhaul layers (strata
    // mottle, close-range grit + relief octaves): full on High/Ultra, softened
    // on Medium, zero on the low tiers so they keep their exact frame cost.
    const terrainUniforms = createTerrainUniforms(
      terrainProfile, terrainSeed, terrainQualityFor(graphicsPreset.terrainDetail),
    );
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
      // Live rain state (weather system): ground soak → growing reflective
      // puddles; active precipitation → ripple animation on those puddles.
      uRainWet: { value: 0 },
      uRainRipple: { value: 0 },
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

    // ── CPU replica of the GPU terrain displacement ─────────────────────────
    // The vertex shader raises the VISUAL ground beyond the player-relative
    // flat zone (envelope 0 inside uTFlatR → 1 past uTFlatR+uTFalloff), while
    // gameplay stays on the y=0 plane. Anything standing out there at y=0
    // therefore reads as BURIED — the exact "distant enemies' legs sink into
    // the ground" report. The height field was deliberately built from
    // band-limited trig so it evaluates identically in JS (see
    // TerrainSystem.ts); this samples it with the same envelope so distant
    // enemies / barrels / relay spires can ride the visual surface, easing
    // back to y=0 as the player approaches (the envelope flattens with them).
    const _tpFreq = terrainProfile.frequency;
    const _tpSeed = terrainSeed;
    const _tpWarp = terrainProfile.warpAmp;
    const _tpRidge = terrainProfile.ridginess;
    const _tpAmp = terrainProfile.amplitude;
    const _tpFlatR = terrainProfile.flatRadius;
    const _tpFalloffEnd = terrainProfile.flatRadius + terrainProfile.falloff;
    const visualGroundY = (wx: number, wz: number): number => {
      // Envelope first — most gameplay actors are inside the flat zone, so
      // the trig field is usually skipped entirely.
      const dx = wx - ground.position.x;
      const dz = wz - ground.position.z;
      const r = Math.sqrt(dx * dx + dz * dz);
      if (r <= _tpFlatR) return 0;
      let env = (r - _tpFlatR) / (_tpFalloffEnd - _tpFlatR);
      if (env > 1) env = 1;
      env = env * env * (3 - 2 * env); // smoothstep, matching the GLSL
      // tHeight(worldXZ) — byte-for-byte the shader's field.
      const f = _tpFreq, s = _tpSeed;
      const wxx = wx + Math.sin(wz * f * 1.7 + s) * _tpWarp;
      const wzz = wz + Math.cos(wx * f * 1.7 + s * 1.31) * _tpWarp;
      let h = Math.sin(wxx * f + s) * Math.cos(wzz * f * 0.93 + s * 0.7);
      h += Math.sin(wxx * f * 2.07 + 1.7 + s) * Math.cos(wzz * f * 1.96 - 0.8) * 0.5;
      h += Math.sin(wxx * f * 4.13 - 2.1) * Math.cos(wzz * f * 3.88 + s) * 0.25;
      h /= 1.75;
      const ridgeBase = 1 - Math.abs(h);
      const ridge = ridgeBase * ridgeBase * 2 - 1;
      h = h + (ridge - h) * _tpRidge;
      return h * _tpAmp * env;
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
      !renderAtmosphere.sunVisible,
      // No post-processing (low / ultra-low) → fade out the bloom-tuned sun disc,
      // which otherwise renders as a hard pale circle in the sky. Medium+ keep
      // the full radiant sun (bloom softens it).
      graphicsPreset.postProcessing ? 1.0 : 0.0,
      // LOW / ULTRA-LOW → skip the fullscreen fbm sky detail (clouds / stars /
      // aurora). The dome is drawn fullscreen every frame, so this is a real
      // per-pixel saving on exactly the GPUs these presets target.
      lowTier
    );
    const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
    // Render the sky first and ignore depth so it never appears as a "blob"
    // floating in the distance, even when the player walks far from origin.
    skyDome.renderOrder = -1000;
    skyDome.frustumCulled = false;
    scene.add(skyDome);

    const hazeGeometry = lowTier
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
    type WarmupRetainedEffect = { dispose: (scene: THREE.Scene, disposeMaterials?: boolean) => void };
    const warmupRetainedEffects: WarmupRetainedEffect[] = [];
    let allowLateEnvironmentSwap = true;
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

    // Kicked off now (parallel with everything else), but the promise is
    // CAPTURED so the shader warmup can await the swap before it hands the
    // canvas to gameplay — otherwise the async HDRI replaces the local PMREM a
    // couple of seconds INTO the game and the lit/graded look visibly shifts
    // right after the loader hides. Awaiting it (capped) in warmup means the
    // final image-based lighting is already on screen when the loader lifts.
    const hdriReadyPromise = loadHDRIEnvironment(renderer, selectedMap, { load: !lowTier, highRes: graphicsQuality === 'ultra' })
      .then((loadedEnvironment) => {
        if (!loadedEnvironment) return;
        if (isSceneDisposed || !allowLateEnvironmentSwap) {
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

    // === WEATHER SYSTEM v3 — automatic per-map climate ===
    // No menu, no sync: every mode (Solo / Tutorial / Multiplayer) and every
    // time-of-day (Auto / Day / Night) gets a living sky driven by the map's
    // climate — rain on the forest/swamp maps, sandstorms in the desert,
    // blizzards on the tundra, ashfall over the volcanic wasteland. Outputs
    // per-frame atmosphere MODIFIERS folded into the day-cycle atmosphere
    // below, so weather costs a handful of multiplies per frame plus one
    // Points draw while a storm is active.
    const weatherSystem = new WeatherSystem(scene);
    weatherSystem.setClimate(selectedMap);

    // === AMBIENT MUSIC — per-map adaptive procedural score (SOLO ONLY) ===
    // Fully generative (zero audio assets): each map gets its own scale,
    // chord pools, instrument palette and reverb space, played as sparse
    // Minecraft-style pieces over an always-on ambient bed. The director is
    // fed time-of-day / weather / combat every frame from the render loop
    // below and morphs the score seamlessly.
    //
    // USER MANDATE: the in-game ambience score plays in SOLO runs only —
    // multiplayer stays music-free (voice/comms focus, and it's client-local
    // with no MP sync anyway) and the tutorial stays quiet so instructions
    // are the focus. The teardown stop() below is no-op-safe when unstarted.
    const ambientMusicEnabled = !isMultiplayer && !isTutorialMode;
    if (ambientMusicEnabled) ambientMusic.start(selectedMap, weatherSystem.getStormKind());
    // Live modifiers, refreshed at the top of every frame.
    let weatherMods = weatherSystem.update(0, camera.position, !atmosphericSettings.sunVisible);
    // Gameplay consequences derived from the live weather each frame (see the
    // block in animate). 1 = no effect, which is what a clear sky produces.
    let weatherAggroMult = 1;     // scales enemy aggro range (storms hide you)
    let weatherMoveMult = 1;      // deep snow / loose sand drag
    let weatherFootstepMult = 1;  // heavy rain masks footstep audio

    // === BIOME SYSTEM ===
    const biomeSystem = new BiomeSystem(scene, graphicsPreset.terrainDetail);

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

    // === RAGDOLL PHYSICS (Rapier) ===
    // Engine-grade enemy-death ragdolls: corpses tumble with a true inertia
    // tensor, drape over each other, settle and sleep. Capped + pooled + slow-mo
    // aware (see RagdollSystem). The WASM is dynamic-import()ed here only — never
    // on the menu — and only for SOLO play with the Ragdoll Physics setting on;
    // multiplayer corpses stay on the host-mirrored topple, and until the WASM
    // finishes loading the death loop transparently uses the old lightweight
    // launcher. So the menu / first paint and the MP path pay nothing for this.
    const ragdollSystem = new RagdollSystem(20);
    if (!isMultiplayer && gameSettingsManager.getSetting('ragdollPhysics')) {
      void ragdollSystem.init();
    }

    // ── BATTLE DAMAGE (persistent dents + scuffs on robots) ────────────────
    // Every real hit punches a metal dent / scrapes a scuff into the enemy's
    // armour where it landed; the damage accumulates so a worn-down robot is
    // visibly battered by the time it's near death. One shared material/program +
    // pooled quads (see BattleDamageSystem). Caps scale with the particle-density
    // preset so Low / Ultra-Low barely spend. Warmed in warmUpShaders, cleared on
    // every (re)spawn + death, disposed in scene teardown.
    const dmgDensity = graphicsPreset.particleDensity;
    const battleDamage = new BattleDamageSystem(scene, {
      maxPerEnemy: Math.max(3, Math.round(12 * dmgDensity)),
      maxTotal: Math.max(24, Math.round(180 * dmgDensity)),
    });

    // ── ENVIRONMENT BULLET DECALS (all graphics tiers) ─────────────────────
    // Every round that strikes the world (tree / rock / wall / pillar / ground)
    // stamps a surface-tinted, weapon-shaped bullet hole at the contact point.
    // Runs on ALL presets (one program, pooled quads); caps + lifetime scale
    // with particle density so weak GPUs keep only a handful of short-lived
    // marks. Marks fade after their lifetime AND are reclaimed the moment they
    // fall outside `decalCullDist` of the player — see BulletDecalSystem. Warmed
    // in warmUpShaders, disposed on teardown.
    const bulletDecals = new BulletDecalSystem(scene, {
      maxTotal: Math.max(12, Math.round(120 * dmgDensity)),
      lifetime: 8 + 18 * dmgDensity,     // ~12.5 s (ultra-low) → 26 s (high/ultra)
      fadeDuration: 1.8,
    });
    bulletDecals.configure(selectedMap);
    // Beyond this radius a mark is out of the player's practical view, so it's
    // freed immediately to keep the live set tight. Tracks the preset's draw
    // distance but stays bounded so even Ultra never hoards distant marks.
    const decalCullDist = Math.min(Math.max(graphicsPreset.viewDistance * 0.5, 55), 120);
    // Bumped on EVERY add/remove so spatial-grid rebuilds can't be fooled by
    // an add+remove in the same frame leaving the array length unchanged.
    let terrainVersion = 0;
    // ── Incremental collidable-prop index ──────────────────────────────────
    // overlapsTerrain() (the scatter-time anti-clipping test) used to linear-
    // scan EVERY loaded terrain object — ~1000+ props across the 5×5 chunk
    // grid — up to 8× per scattered tree/rock. Generating one chunk's worth of
    // props did millions of distance checks, and a boundary cross builds 5-9
    // chunks at once: the main source of the streaming hitch. This grid is
    // maintained incrementally on add/remove and lets overlapsTerrain() test
    // only the handful of props that could actually overlap, so placement
    // decisions are byte-for-byte identical at O(near) cost. It stores object
    // refs (not array indices) so it survives the terrainObjects splice below.
    const collidableGrid = new SpatialGrid<TerrainObject>(8);
    // Largest collidable radius seen so far — overlapsTerrain widens its query
    // by this so it can never miss a big boulder/tree it should test against.
    // Only ever grows (an over-estimate just widens the query → still correct).
    let maxCollidableRadius = 0;
    // ── Bush index (non-collidable foliage) ────────────────────────────────
    // Bushes are walk-THROUGH props, so they're not in the collidable grid —
    // but the player should WADE through them (movement slowdown). This second
    // grid indexes only bushes so the per-frame "am I in brush?" test stays
    // O(near) instead of scanning every loaded prop. Maintained on add/remove.
    const bushGrid = new SpatialGrid<TerrainObject>(8);
    let maxBushRadius = 0;
    // ── Hazard-pool index (lava / toxic sludge / ice) ──────────────────────
    // Same reasoning as the bush grid: these are walk-THROUGH props that need a
    // per-frame "am I standing in one?" test, so they get their own O(near)
    // index rather than scanning every loaded prop. They were pure decoration
    // until now (see HazardKind).
    const hazardGrid = new SpatialGrid<TerrainObject>(8);
    let maxHazardRadius = 0;
    const addTerrainObject = (obj: TerrainObject) => {
      if (!terrainInstancer.add(obj.mesh)) scene.add(obj.mesh);
      terrainObjects.push(obj);
      if (obj.collidable) {
        if (obj.radius > maxCollidableRadius) maxCollidableRadius = obj.radius;
        collidableGrid.insert(obj, obj.x, obj.z);
      } else if (obj.type === 'bush') {
        if (obj.radius > maxBushRadius) maxBushRadius = obj.radius;
        bushGrid.insert(obj, obj.x, obj.z);
      }
      if (obj.hazard) {
        if (obj.radius > maxHazardRadius) maxHazardRadius = obj.radius;
        hazardGrid.insert(obj, obj.x, obj.z);
      }
      terrainVersion++;
    };
    const removeTerrainObjectAt = (index: number) => {
      const obj = terrainObjects[index];
      if (!terrainInstancer.remove(obj.mesh)) scene.remove(obj.mesh);
      if (obj.collidable) collidableGrid.remove(obj, obj.x, obj.z);
      else if (obj.type === 'bush') bushGrid.remove(obj, obj.x, obj.z);
      if (obj.hazard) hazardGrid.remove(obj, obj.x, obj.z);
      terrainObjects.splice(index, 1);
      terrainVersion++;
    };

    // ── HAZARD POOLS ───────────────────────────────────────────────────────
    // Which hazard (if any) is at this world position, and how deep in it we
    // are (0 at the rim → 1 dead centre). Returns null off any pool, so the
    // common case is one grid query and an early out.
    const HAZARD_BODY_RADIUS = 0.7;
    const hazardAt = (x: number, z: number): { kind: HazardKind; depth: number } | null => {
      if (maxHazardRadius === 0) return null;
      const cands = hazardGrid.queryRadius(x, z, HAZARD_BODY_RADIUS + maxHazardRadius);
      let best: HazardKind | null = null;
      let bestDepth = 0;
      for (let i = 0; i < cands.length; i++) {
        const h = cands[i];
        if (!h.hazard) continue;
        const dx = h.x - x, dz = h.z - z;
        // Slightly INSIDE the visual rim so the edge of the mesh is safe —
        // brushing past a pool shouldn't punish you.
        const reach = h.radius * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const pen = 1 - Math.sqrt(d2) / reach;
        if (pen > bestDepth) { bestDepth = pen; best = h.hazard; }
      }
      return best ? { kind: best, depth: bestDepth } : null;
    };
    /** Per-hazard tuning. Damage is per SECOND, applied on a tick. */
    const HAZARD_RULES: Record<HazardKind, { dps: number; slow: number; tickMs: number }> = {
      // Lava: severe and immediate. Crossing costs real HP; camping in it kills.
      lava: { dps: 26, slow: 0.55, tickMs: 400 },
      // Toxic: a slow bleed you can cross safely but shouldn't fight in.
      toxic: { dps: 9, slow: 0.78, tickMs: 600 },
      // Ice: no damage — it's a MOBILITY hazard. Faster, but see the reduced
      // control in the movement block.
      ice: { dps: 0, slow: 1.15, tickMs: 0 },
    };
    let nextHazardTickAt = 0;
    // Live hazard state, recomputed each frame in the movement block and read
    // by the movement multiplier + the footstep/VFX code.
    let playerHazard: { kind: HazardKind; depth: number } | null = null;

    // ── BUSH WADE SLOWDOWN ──────────────────────────────────────────────────
    // Returns a movement multiplier ≤1 while the player is pushing through
    // foliage — deepest where they're dead-centre in a bush, tapering to none
    // at the edge. Most felt in the dense forest biome (highest bush density),
    // but works on any map with brush. Cheap: a single near-query per frame.
    const PLAYER_BUSH_RADIUS = 0.9;     // how wide the player "catches" on brush
    const BUSH_MAX_SLOW = 0.45;         // up to 45% slower at the densest point
    const bushWadeAt = (x: number, z: number): number => {
      if (maxBushRadius === 0) return 1;
      const cands = bushGrid.queryRadius(x, z, PLAYER_BUSH_RADIUS + maxBushRadius);
      let deepest = 0; // 0 (edge) → 1 (centre) of the most-overlapped bush
      for (let i = 0; i < cands.length; i++) {
        const b = cands[i];
        const dx = b.x - x, dz = b.z - z;
        const reach = b.radius + PLAYER_BUSH_RADIUS;
        const d2 = dx * dx + dz * dz;
        if (d2 >= reach * reach) continue;
        const pen = 1 - Math.sqrt(d2) / reach;
        if (pen > deepest) deepest = pen;
      }
      return deepest > 0 ? 1 - BUSH_MAX_SLOW * deepest : 1;
    };

    // Returns true if a collidable object of the given radius placed at (x,z)
    // would overlap an existing collidable terrain object. Used to keep rocks,
    // trees and boulders from clipping into one another when scattered.
    const overlapsTerrain = (x: number, z: number, radius: number): boolean => {
      // Query a superset of everything that could overlap: any collidable prop
      // whose centre is within (radius + the largest collidable radius) of
      // (x, z). Anything outside that band is too far to overlap by definition,
      // so the exact circle test below yields the SAME answer as the old
      // full-array scan — just over the few nearby props instead of all ~1000+.
      const candidates = collidableGrid.queryRadius(x, z, radius + maxCollidableRadius);
      for (let i = 0; i < candidates.length; i++) {
        const obj = candidates[i];
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
      // On the LOW tiers, thin the scattered props by the preset's terrain detail
      // (low 0.55 / ultra-low 0.40). Trees/rocks/bushes previously ignored the
      // graphics preset entirely (only grass scaled), so a weak GPU scattered the
      // SAME prop load as High — the same heavy per-chunk generation that hitches
      // when you cross a chunk boundary (and which felt WORSE on ultra-low, where
      // the higher FPS made each spike stand out). Fewer props = a much smaller
      // generation spike AND fewer draw calls / less overdraw every frame.
      // Medium and above keep their full density (propDensityScale = 1).
      const propDensityScale = lowTier ? graphicsPreset.terrainDetail : 1.0;

      // Generate trees based on biome density * map multiplier
      const treesInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.treeDensity * treeDensityMult * propDensityScale / 100);
      for (let i = 0; i < treesInChunk; i++) {
        const spot = findFreeSpot(startX, startZ, 2.6);
        if (!spot.ok) continue; // Skip if no clear space — avoids overlapping trees
        addTerrainObject(biomeSystem.createTree(spot.x, spot.z, biome));
      }

      // Generate rocks based on biome density * map multiplier
      const rocksInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.rockDensity * rockDensityMult * propDensityScale / 100);
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

      // Generate bushes based on biome density * map multiplier.
      // Bushes are non-collidable, so they used to be scattered UNCHECKED —
      // which regularly dropped them inside rocks, boulders and trunks (green
      // shapes clipping through stone: the reported "overlapping environment"
      // bug). They now use the same free-spot search as the solid props, so a
      // bush that can't find clear ground is simply skipped.
      const bushesInChunk = Math.floor(CHUNK_SIZE * CHUNK_SIZE * biomeConfig.bushDensity * bushDensityMult * propDensityScale / 100);
      for (let i = 0; i < bushesInChunk; i++) {
        const spot = findFreeSpot(startX, startZ, 1.5);
        if (!spot.ok) continue; // No clear ground — never clip into a solid prop
        addTerrainObject(biomeSystem.createBush(spot.x, spot.z, biome));
      }

      // Generate special biome features (water, cacti, etc.)
      // 1-3 biome-specific flavour features per chunk (water, cacti, crystals,
      // bunkers etc.) — guarantees at least one per chunk so each map keeps
      // its distinct character even in less-dense areas. Placed via the same
      // free-spot search so a fallen log / statue / lava pool never spawns
      // through a tree or rock (they were previously unchecked too).
      const specialFeaturesCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < specialFeaturesCount; i++) {
        const spot = findFreeSpot(startX, startZ, 2.6);
        if (!spot.ok) continue;
        const specialFeature = biomeSystem.createSpecialFeature(spot.x, spot.z, biome);
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

    // ── Budgeted chunk streaming ───────────────────────────────────────────
    // Building the new outer ring synchronously on a boundary cross (5-9 chunks
    // × ~100+ props each) stalled a whole frame. Those chunks sit 200+ units
    // away behind fog, so we enqueue them and materialise a small budget per
    // frame instead — identical world, no hitch. enqueueChunk skips anything
    // already loaded or already queued; drainPendingChunks runs each frame.
    const pendingChunks: { cx: number; cz: number }[] = [];
    const pendingChunkKeys = new Set<string>();
    const enqueueChunk = (cx: number, cz: number) => {
      const key = `${cx},${cz}`;
      if (loadedChunks.has(key) || pendingChunkKeys.has(key)) return;
      pendingChunkKeys.add(key);
      pendingChunks.push({ cx, cz });
    };
    const drainPendingChunks = (budget: number) => {
      if (pendingChunks.length === 0) return;
      // Re-sort nearest-first against the player's CURRENT chunk so the closest
      // pending terrain always fills in first as they move (cheap — ≤25 items).
      if (pendingChunks.length > 1) {
        const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
        const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
        pendingChunks.sort((a, b) =>
          ((a.cx - pcx) * (a.cx - pcx) + (a.cz - pcz) * (a.cz - pcz)) -
          ((b.cx - pcx) * (b.cx - pcx) + (b.cz - pcz) * (b.cz - pcz)));
      }
      for (let n = 0; n < budget && pendingChunks.length > 0; n++) {
        const c = pendingChunks.shift()!;
        pendingChunkKeys.delete(`${c.cx},${c.cz}`);
        generateChunk(c.cx, c.cz);
      }
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
      // Enqueued (not built inline) so the per-frame drain spreads the cost.
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          enqueueChunk(chunkX + dx, chunkZ + dz);
        }
      }

      // Remove distant terrain objects to save memory. Cull radius scaled
      // with the wider load grid so we don't pay the streaming cost of
      // re-generating chunks the player has only just walked past.
      const cullRadius = CHUNK_SIZE * 6;
      for (let i = terrainObjects.length - 1; i >= 0; i--) {
        const obj = terrainObjects[i];
        // The ARK-07 relay spires are PERMANENT landmarks, not streamed props —
        // culling one would delete the structure (and its collision) for good,
        // since chunk regeneration only rebuilds procedural scatter. (Closure
        // read of a later const — safe: this function only runs at runtime.)
        if (uplinkColliders.has(obj)) continue;
        const dxC = obj.x - playerX;
        const dzC = obj.z - playerZ;
        if (dxC * dxC + dzC * dzC > cullRadius * cullRadius) {
          removeTerrainObjectAt(i);
        }
      }

      // ── FORGET FULLY-CULLED CHUNKS ────────────────────────────────────────
      // BUG FIX: chunks were marked in `loadedChunks` forever, but their props
      // get culled once they're far away. If the player then WANDERED BACK into
      // such a chunk, `generateChunk` early-returned ("already loaded") and the
      // forest never came back — leaving a stark treeless patch (the reported
      // "forest disappears / a region without forest appears"). We now drop the
      // key of any chunk whose props are guaranteed already culled, so revisiting
      // REGENERATES it. The forget radius is one chunk beyond the object cull so
      // a chunk is only forgotten once every one of its props is gone (no risk of
      // doubling props on regen). This also keeps `loadedChunks` bounded over a
      // long run. Applies to EVERY map (shared streamer), not just the forest.
      const forgetRadius = CHUNK_SIZE * 7;
      const forgetR2 = forgetRadius * forgetRadius;
      const half = CHUNK_SIZE / 2;
      for (const key of loadedChunks) {
        const comma = key.indexOf(',');
        const ccx = parseInt(key.slice(0, comma), 10) * CHUNK_SIZE + half;
        const ccz = parseInt(key.slice(comma + 1), 10) * CHUNK_SIZE + half;
        const ddx = ccx - playerX;
        const ddz = ccz - playerZ;
        if (ddx * ddx + ddz * ddz > forgetR2) loadedChunks.delete(key);
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
    // STEP_UP: the tallest ledge the player auto-mounts by simply walking into
    // it — no jump required (the support-height system smoothly lerps the camera
    // up onto the surface the same frame). This is the standard AAA "auto-step"
    // that stops low rocks/kerbs/debris from feeling like sticky invisible walls.
    // Climbable obstacles taller than this (up to CLIMB_MAX) still want a hop.
    const STEP_UP_HEIGHT = 1.8;

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
          // AUTO STEP-UP: a low climbable ledge whose top sits within a stride of
          // the player's feet is mounted by walking straight into it — the
          // support-height system raises the camera onto it the same frame, so
          // it must NOT block movement here. Taller climbable rocks (up to
          // CLIMB_MAX) still require a hop. Enemies pass feetY ≈ -1, so this is
          // never true for them — they keep pathing around every obstacle.
          if (h <= CLIMB_MAX_HEIGHT && feetY >= h - STEP_UP_HEIGHT) continue;
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
        // Within a stride of the top → the player is on it (or auto-stepping
        // onto it), so this surface supports them. Matches the STEP_UP gate in
        // checkTerrainCollision so a ledge that lets you walk in also lifts you.
        if (feetY < obj.height - STEP_UP_HEIGHT) continue; // not high enough to mount/stand on
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
          // Mounting a low ledge (auto step-up) — don't shove the player back off
          // while the camera lerps up onto the surface.
          if (h <= CLIMB_MAX_HEIGHT && feetY >= h - STEP_UP_HEIGHT) continue;
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

    // Initial world generation — the full 3×3 around spawn (everything within
    // the visible/fog distance) is built synchronously so collision and the
    // forest are solid on frame one. The outer rings of the 5×5 stream in via
    // the budgeted queue below (they sit 200+ units away behind fog, so the
    // player never sees them materialise).
    for (let _cx = -1; _cx <= 1; _cx++) {
      for (let _cz = -1; _cz <= 1; _cz++) {
        generateChunk(_cx, _cz);
      }
    }

    // === EXPLOSIVE BARRELS ===
    // Scatter red barrels across the map. Density per-map (MapConfig).
    // Bullet hit → AOE damage to everything within blastRadius (player +
    // enemies). Tactical pop: kite a tank into one for a free wipe.
    //
    // Barrels are now COMMON and spread right across the playfield: the
    // default density was bumped (0.35 → 0.55), the count multiplier raised
    // (30 → 70) and the scatter widened (±120 → ±185) so wherever the fight
    // drifts there's usually a barrel within tactical reach instead of the
    // old sparse central cluster. Per-map overrides still scale on top.
    const barrelDensity = mapConfig.barrelDensity ?? 0.55;
    const barrelCount = Math.round(barrelDensity * 70); // ~39 default · up to ~53 (military)
    const barrels: ExplosiveBarrel[] = barrelCount > 0
      ? spawnBarrels(scene, barrelCount, overlapsTerrain, 370)
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
    let bossIntroFired = false; // First full-boss encounter banner.
    let revenantIntroFired = false; // First Revenant (rare apex trickster) banner.
    // Which tactical archetypes have already shown their teaching banner.
    const archetypeIntroFired = new Set<PooledEnemyType>();
    // ── BOSS ERA START WAVE (difficulty-scaled) ──────────────────────────────
    // The pink boss (and the Revenant, which appears in the same window) shows
    // up EARLIER on harder difficulties — only Easy waits until wave 10. From
    // this wave on, the boss appears EVERY wave and the enemy mix keeps getting
    // harder with the round count (see the wave-scaled type bump in spawnEnemyBatch).
    const bossStartWave = classicDifficulty === 'hard' ? 5
      : classicDifficulty === 'medium' ? 7
      : classicDifficulty === 'adaptive' ? 8
      : 10; // easy

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

    // ═══════════════════════════════════════════════════════════════════════
    //  ARK-07 NETWORK EVENTS — the conspiracy under the wave loop.
    //  ─────────────────────────────────────────────────────────────────────
    //  The robots were never wild. A derelict pre-collapse uplink spire —
    //  ARK-07 — still answers a dead satellite running its last order: field-
    //  test autonomous units against live targets, escalate until the target
    //  stops responding. Every wave is a scheduled trial; the player is the
    //  experiment. Three systems hang off it (solo + multiplayer, NEVER
    //  tutorial):
    //    • THE RELAY NETWORK — several physical spires scattered with real
    //      spacing across the whole map. Each one's "dirty signal" field
    //      overdrives robots inside it — and the charge LINGERS: a unit that
    //      bathed in the bandwidth stays supercharged long after it walks
    //      out. The player gets the inverse: interference-cooked vision,
    //      jammed equipment, and a radiation dose. Kills inside a field pay
    //      bonus score — the risk/reward hook.
    //    • OVERDRIVE SURGE — a random wave-length broadcast: an EMP ring
    //      races out from the nearest relay, every unit's optics burn RED and
    //      the whole wave hits harder/moves faster. Intensity is difficulty-led.
    //    • NULL WAVE — the rotting broadcast stack ships a wave of corrupted
    //      firmware: the screen tears (post-FX + DOM fallback), enemies
    //      stutter-blink, and the player's ballistics are compromised
    //      (reduced bullet damage) — the "unfair" wave, most common on Hard.
    //  All state below is HOST/SOLO-authoritative; guests mirror it from the
    //  enemy_sync keyframes (wm/wi/us fields).
    // ═══════════════════════════════════════════════════════════════════════
    let netWaveEvent: 'none' | 'surge' | 'glitch' = 'none';
    let netWaveEventIntensity = 0;   // difficulty-scaled 0..1.25 severity
    let wavesSinceNetEvent = 99;     // spacing guard — no back-to-back events
    let surgeVisual = 0;             // eased 0→1 driver for the red-shift/halos
    let glitchVisual = 0;            // eased 0→1 driver for the corruption FX
    let glitchBurst = 0;             // random spike envelope on top of glitchVisual
    let nextGlitchBurstAt = 0;
    let nextGlitchSkipCheckAt = 0;   // cadence gate for enemy stutter-blinks
    let uplinkIntroFired = false;
    let surgeIntroFired = false;
    let glitchIntroFired = false;
    const empShockwaves: EmpShockwave[] = [];
    // Player radiation-exposure state (driven per frame, pushed to the UI
    // throttled/quantised so React never reconciles at frame rate).
    let radiationSmooth = 0;    // eased 0..1 exposure the overlays follow
    let lastRadPushed = 0;      // last quantised value handed to the overlays
    let nextRadPushAt = 0;      // ~4Hz overlay push gate
    let radExposureS = 0;       // continuous seconds inside a field (grace timer)
    let nextGeigerAt = 0;       // next geiger click timestamp
    let nextRadTickAt = 0;      // next radiation damage tick timestamp
    // Equipment jam latch — true while the player stands deep enough in a
    // relay field that the interference fries their gear (powerups force-
    // expire + the held power can't be triggered). Driven by the exposure
    // loop; read by the powerup timer block and the use-power gate.
    let playerSignalJammed = false;
    let jamNoticeShownAt = 0;

    // ── THE RELAY NETWORK ── built for every non-tutorial mode. Host/solo
    // scatter several spires across the WHOLE map with real spacing between
    // them; guests park the network unplaced until the first keyframe carries
    // the host's spire list (identical world on every screen).
    const uplinkNet: UplinkNetwork | null = !isTutorialMode ? new UplinkNetwork() : null;
    let uplinkPlaced = false;
    const uplinkColliders = new Set<TerrainObject>();
    const addUplinkSpire = (x: number, z: number) => {
      if (!uplinkNet) return;
      uplinkNet.addSpire(scene, x, z);
      // Clear scattered props out of the footprint, then register a solid
      // collision cylinder around the mast base (height 99 = a true wall — you
      // walk AROUND the station; the pad edge stays reachable for the lore
      // moment + the hot-zone farming loop).
      for (let i = terrainObjects.length - 1; i >= 0; i--) {
        const obj = terrainObjects[i];
        const dx = obj.x - x, dz = obj.z - z;
        if (dx * dx + dz * dz < (obj.radius + 9) * (obj.radius + 9)) removeTerrainObjectAt(i);
      }
      const collider: TerrainObject = {
        mesh: uplinkNet.spires[uplinkNet.spires.length - 1].group,
        x, z, type: 'rock', collidable: true, radius: 4.2, height: 99,
      };
      // Registered MANUALLY (not via addTerrainObject): the group is already
      // scene-added, and it must never be absorbed into the terrain
      // instancer — its dish/beacons/holo animate every frame, which an
      // instanced matrix snapshot would freeze.
      terrainObjects.push(collider);
      if (collider.radius > maxCollidableRadius) maxCollidableRadius = collider.radius;
      collidableGrid.insert(collider, x, z);
      terrainVersion++;
      uplinkColliders.add(collider);
      uplinkPlaced = true;
    };
    if (uplinkNet && !isMpGuest) {
      // Scatter 3–4 relays (bigger maps get the 4th) between 80m and ~40% of
      // the map's half-size out, on random bearings, each at least 130m from
      // every other and 65m clear of spawn — so the fields tile the playfield
      // as distinct hot zones the fight keeps drifting through, never one
      // landmark parked next to spawn.
      const spireCount = (mapConfig.groundSize ?? 640) >= 700 ? 4 : 3;
      const maxReach = Math.max(180, (mapConfig.groundSize ?? 640) * 0.4);
      const placed: Array<[number, number]> = [];
      for (let sp = 0; sp < spireCount; sp++) {
        let bestX = 0, bestZ = 0, ok = false;
        for (let attempt = 0; attempt < 24 && !ok; attempt++) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 80 + Math.random() * (maxReach - 80);
          const px = camera.position.x + Math.cos(ang) * dist;
          const pz = camera.position.z + Math.sin(ang) * dist;
          if (Math.hypot(px - camera.position.x, pz - camera.position.z) < 65) continue;
          if (placed.some(([ox, oz]) => Math.hypot(px - ox, pz - oz) < 130)) continue;
          if (overlapsTerrain(px, pz, 9)) continue;
          bestX = px; bestZ = pz; ok = true;
        }
        if (!ok) continue; // dense map roll — settle for fewer relays
        placed.push([bestX, bestZ]);
        addUplinkSpire(bestX, bestZ);
      }
    }
    // 0 outside every field → 1 at the nearest mast. The single source of
    // LIVE proximity truth (host + guests both compute it locally from the
    // shared spire list — no extra sync needed).
    const uplinkFieldFactor = (x: number, z: number): number =>
      uplinkNet && uplinkPlaced ? uplinkNet.fieldFactorAt(x, z) : 0;

    // ── IRRADIATED CORES ────────────────────────────────────────────────
    // Every explosive barrel standing inside a relay's field has been sitting
    // in the broadcast for decades. Those drums aren't TNT any more — they are
    // warheads, and they get their own radiological skin (caution striping,
    // trefoil placards, a live containment band) so the player can never
    // confuse one for ordinary red TNT at any distance.
    //
    // A CONVERSION pass rather than a spawn-time decision, because the barrels
    // are scattered before the relays are sited. Idempotent — the guest path
    // below re-runs it once the host's spire list arrives, and any barrel
    // already converted is skipped.
    const markIrradiatedBarrels = (): void => {
      if (!uplinkPlaced) return;
      for (let b = 0; b < barrels.length; b++) {
        const barrel = barrels[b];
        if (barrel.irradiated || barrel.detonated) continue;
        if (uplinkFieldFactor(barrel.mesh.position.x, barrel.mesh.position.z) > 0) {
          makeBarrelIrradiated(barrel);
        }
      }
    };
    markIrradiatedBarrels();
    // ── Lingering irradiation charge ────────────────────────────────────────
    // The empowerment an enemy CARRIES: the max of its live field exposure
    // and the charge it soaked up earlier (peak factor, held for a long
    // linger window, fading out only over the final third). Refreshing
    // happens once per frame in the enemy loop; this is the read side.
    const IRRADIATION_LINGER_MS = 45000;
    const irradiationCharge = (e: Enemy, nowMs: number): number => {
      const live = uplinkFieldFactor(e.mesh.position.x, e.mesh.position.z);
      const until = e.irradiatedUntil ?? 0;
      if (until <= nowMs) return live;
      const tLeft = (until - nowMs) / IRRADIATION_LINGER_MS;
      const fade = Math.min(1, tLeft / 0.33);
      const lingering = (e.irradiatedPower ?? 0) * fade;
      return Math.max(live, lingering);
    };
    // ── Combined enemy empowerment ── event multiplier × irradiation charge.
    // Read at every damage-dealing site + the movement step so buffs apply
    // live — and KEEP applying long after the unit leaves the field.
    const enemyDamageMult = (e: Enemy): number => {
      let m = 1;
      if (netWaveEvent === 'surge') m *= 1 + 0.35 * netWaveEventIntensity;
      else if (netWaveEvent === 'glitch') m *= 1 + 0.20 * netWaveEventIntensity;
      m *= 1 + irradiationCharge(e, Date.now()) * 0.9;
      return m;
    };
    const enemySpeedMult = (e: Enemy): number => {
      let m = 1;
      if (netWaveEvent === 'surge') m *= 1 + 0.18 * netWaveEventIntensity;
      else if (netWaveEvent === 'glitch') m *= 1 + 0.10 * netWaveEventIntensity;
      m *= 1 + irradiationCharge(e, Date.now()) * 0.45;
      return Math.min(m, 1.75); // hard fairness ceiling
    };
    // NULL WAVE compromises the player's ballistics — applied ONLY at the
    // authoritative health writes (local bullet application + the host's
    // enemy_hit handler) so guest-reported hits are never double-reduced.
    const playerBallisticsMult = (): number =>
      netWaveEvent === 'glitch' ? 1 - 0.25 * Math.min(1, netWaveEventIntensity) : 1;

    // ═══ SHOOTER FIRING ANIMATION ════════════════════════════════════════
    //
    // The shooter archetypes had NO firing animation at all. A sniper walked
    // its ordinary walk cycle, arms swinging at its sides, and a bolt simply
    // appeared out of its chest — no aim, no telegraph, no recoil, and often
    // not even facing the player. It was the weakest read in the game: the
    // single most dangerous enemy gave the player nothing to react to.
    //
    // This drives the whole firing pose from one place, shared by the sniper,
    // the subverted sniper and the revenant:
    //
    //   AIM      — the weapon arm comes up and PITCHES onto the target, the
    //              support arm crosses to the fore-end, the torso leans in and
    //              the chassis yaws to face what it's shooting at.
    //   CHARGE   — the powercell coils swell and the bore aperture blooms as
    //              the shot fills. This is the tell the player reads to break
    //              line of sight, and it is why the charge window exists.
    //   RECOIL   — the shot punches the weapon arm up and flares the muzzle.
    //
    // Everything is a per-instance TRANSFORM. Enemy materials are shared across
    // the whole archetype, so brightening a material here would light up every
    // sniper on the map at once; scaling the emissive meshes is what keeps the
    // telegraph per-enemy. Allocation-free — it runs for every shooter, every
    // frame.
    const RECOIL_S = 0.22;

    /**
     * Where a shooter's bolt is actually born: the world position of the tip of
     * its energy lance.
     *
     * Falls back to the old chassis-relative offset when the muzzle anchor is
     * missing — which happens legitimately, because the anchor only exists on
     * the HIGH-LOD build. A distant sniper firing from its simplified mesh
     * should still produce a bolt from roughly the right height rather than
     * from its feet.
     *
     * Returns a FRESH Vector3: the callers keep it (it seeds the bullet's mesh
     * position and its direction), so a scratch vector would be aliased across
     * every shot fired on the same frame.
     */
    const enemyMuzzleOrigin = (e: Enemy, fallbackY: number): THREE.Vector3 => {
      const out = new THREE.Vector3();
      if (e.muzzle && e.muzzle.parent) {
        // Force the chain up to the root. The renderer skips hidden subtrees
        // when it updates world matrices, so a shooter currently drawing at
        // MEDIUM LOD (high group hidden) would otherwise read a stale — or on
        // its very first shot, an identity — matrix and fire from the origin.
        e.muzzle.updateWorldMatrix(true, false);
        e.muzzle.getWorldPosition(out);
        return out;
      }
      return out.set(e.mesh.position.x, e.mesh.position.y + fallbackY, e.mesh.position.z);
    };

    const driveShooterPose = (
      e: Enemy,
      tx: number, ty: number, tz: number,
      /** 0..1 — how full the pending shot is. */
      charge: number,
      /** Is the unit actually presenting the weapon this frame? */
      aiming: boolean,
      dt: number,
      nowMs: number,
    ): void => {
      // Ease between "walking" and "presenting". Rising faster than it falls,
      // so the threat snaps up but lowers unhurriedly.
      const blendRate = Math.min(1, dt * (aiming ? 9 : 4.5));
      const a = (e.aimBlend = (e.aimBlend ?? 0) + ((aiming ? 1 : 0) - (e.aimBlend ?? 0)) * blendRate);
      if ((e.recoilTime ?? 0) > 0) e.recoilTime = Math.max(0, (e.recoilTime as number) - dt);
      const kick = (e.recoilTime ?? 0) / RECOIL_S; // 1 at the shot → 0

      if (a > 0.002) {
        // Bore pitch — a sniper on a rise shooting down at the player should
        // visibly angle its weapon down, not fire level and have the bolt bend.
        const flat = Math.hypot(tx - e.mesh.position.x, tz - e.mesh.position.z);
        const pitch = Math.atan2(ty - (e.mesh.position.y + 1.2), Math.max(0.001, flat));
        const aimX = -Math.PI / 2 + Math.max(-0.5, Math.min(0.5, pitch));
        if (e.rightArm) {
          e.rightArm.rotation.x = THREE.MathUtils.lerp(e.rightArm.rotation.x, aimX, a)
            + kick * kick * 0.5 * a;                       // muzzle climb on the shot
          e.rightArm.rotation.z = THREE.MathUtils.lerp(e.rightArm.rotation.z, -0.16, a);
        }
        if (e.leftArm) {
          // Support hand crosses to the fore-end (+z rolls the LEFT arm inward).
          e.leftArm.rotation.x = THREE.MathUtils.lerp(e.leftArm.rotation.x, -1.18, a);
          e.leftArm.rotation.z = THREE.MathUtils.lerp(e.leftArm.rotation.z, 0.44, a);
        }
        if (e.torso) {
          // Positive pitches FORWARD (same convention as the walk lean and the
          // melee pose). Leans into the sights, then rocks back on the shot.
          e.torso.rotation.x = THREE.MathUtils.lerp(e.torso.rotation.x, 0.14 - kick * 0.30, a);
        }
        // Square up to the target. Snipers hang back beyond the walk block's
        // 20 m "never show your back" guard, so without this they routinely
        // fired at a right angle to where they were looking.
        let dYaw = Math.atan2(tx - e.mesh.position.x, tz - e.mesh.position.z) - e.mesh.rotation.y;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        e.mesh.rotation.y += dYaw * Math.min(1, dt * 7 * a);
      }

      // Charge + recoil on the emissive set.
      const ch = charge < 0 ? 0 : charge > 1 ? 1 : charge;
      if (e.muzzleGlow) {
        const throb = 1 + Math.sin(nowMs * 0.022) * 0.14 * ch;
        e.muzzleGlow.scale.setScalar((1 + 2.1 * ch * ch) * throb + kick * 1.8);
      }
      if (e.weaponGlow) {
        // X/Y ONLY. The coil offsets are baked into the merged geometry, so a
        // uniform scale would slide the whole stack down the barrel instead of
        // making the rings bulge.
        const s = 1 + 0.34 * ch + kick * 0.3;
        e.weaponGlow.scale.set(s, s, 1);
      }
    };

    // ── BOSS PER-HIT DAMAGE CAP ──────────────────────────────────────────
    //
    // A single BULLET can never remove more than this fraction of a boss's max
    // HP, so the Overlord always takes at least ~7 well-placed rounds to bring
    // down no matter how hard the player's build hits.
    //
    // Why a cap and not just more HP: player damage is MULTIPLICATIVE (Heavy
    // Hitter × Skull Splitter × damage perks × Glass Cannon × the 2× headshot),
    // so it grows far faster over a run than any flat HP figure can chase. With
    // HP alone the boss is either unkillable early or a one-shot late; the cap
    // makes the fight take a similar number of hits at every point in the run,
    // which is what "requires effort" actually means.
    //
    // Deliberately BULLETS ONLY. Explosives, the nuke and ability bursts are
    // uncapped — the launcher landing a real chunk on a boss is the reward for
    // choosing it, and a Tactical Nuke should still be a nuke.
    const BOSS_MAX_HIT_FRACTION = 0.14; // ⇒ minimum 8 rounds
    const capBossHit = (enemy: Enemy, dmg: number): number => {
      if (enemy.type !== 'boss' && !enemy.isMiniBoss) return dmg;
      return Math.min(dmg, enemy.maxHealth * BOSS_MAX_HIT_FRACTION);
    };

    // Gun Model - CRITICAL FIX
    const gunModel = new GunModel('pistol');
    camera.add(gunModel.group);
    scene.add(camera);

    // ── RELOAD AUDIO ─────────────────────────────────────────────────────
    // The viewmodel owns the reload timeline and emits a cue the frame each
    // part actually makes contact (a catch clicking, a magazine bottoming out,
    // a bolt going home). Mapping them here — rather than firing one sound at
    // reload start — is what keeps eight very different mechanisms sounding
    // like the thing on screen. `index` distinguishes repeated beats: which
    // shell went in, which intrusion chip seated.
    const RELOAD_SOUNDS: Record<ReloadCue, { s: string; v: number; r?: number }> = {
      mag_release:   { s: 'reload_magrelease', v: 0.34 },
      mag_out:       { s: 'reload_magout',     v: 0.40 },
      mag_stow:      { s: 'reload_magstow',    v: 0.34 },
      mag_drop:      { s: 'reload_magdrop',    v: 0.26 },
      mag_in:        { s: 'reload_magin',      v: 0.50 },
      mag_tug:       { s: 'reload_magrelease', v: 0.20, r: 0.72 },
      slide_release: { s: 'reload_slide',      v: 0.50 },
      bolt_rack:     { s: 'reload_bolt',       v: 0.48 },
      // One machined clunk, re-pitched for each quarter of the bolt throw:
      // lifting rings highest, driving it forward is the heaviest.
      bolt_lift:     { s: 'reload_boltlift',   v: 0.38, r: 1.22 },
      bolt_back:     { s: 'reload_boltlift',   v: 0.34, r: 0.95 },
      bolt_forward:  { s: 'reload_boltlift',   v: 0.44, r: 0.8 },
      bolt_lock:     { s: 'reload_boltlift',   v: 0.4,  r: 1.34 },
      shell_insert:  { s: 'reload_shell',      v: 0.42 },
      pump_rack:     { s: 'reload_pump',       v: 0.5 },
      cover_open:    { s: 'reload_cover',      v: 0.34, r: 1.3 },
      belt_feed:     { s: 'reload_belt',       v: 0.4 },
      cover_close:   { s: 'reload_cover',      v: 0.52 },
      spin_up:       { s: 'reload_spinup',     v: 0.42 },
      rocket_lift:   { s: 'reload_magout',     v: 0.28, r: 0.66 },
      rocket_slide:  { s: 'reload_rocketslide', v: 0.44 },
      rocket_seat:   { s: 'reload_magin',      v: 0.55, r: 0.6 },
      pin_pull:      { s: 'reload_pin',        v: 0.36 },
      cartridge_out: { s: 'reload_magout',     v: 0.34, r: 1.18 },
      cartridge_in:  { s: 'hack_reload',       v: 0.5 },
      chip_seat:     { s: 'hack_chip',         v: 0.32 },
      deck_boot:     { s: 'powerUp',           v: 0.2,  r: 1.7 },
    };
    gunModel.onReloadCue = (cue, index) => {
      const m = RELOAD_SOUNDS[cue];
      if (!m) return;
      let rate = m.r ?? 1;
      // Repeated beats climb so a run of them reads as progress rather than a
      // loop: chips ascend cleanly, shells wander slightly (a hand isn't a
      // metronome and identical samples in a row sound synthetic).
      if (cue === 'chip_seat') rate *= 1 + (index - 1) * 0.13;
      else if (cue === 'shell_insert') rate *= 0.94 + Math.random() * 0.13;
      soundManager.play(m.s, m.v, false, rate);
      // Mobile: a short tick under the thumb on the two beats a player feels.
      if (cue === 'mag_in' || cue === 'pump_rack') haptic('tap');
    };

    // ── ENGINEER "BEND OVER THE BARREL" WIRING STATE ──────────────────────
    // The prop the engineer then holds (the radio firing device) is an
    // AbilityViewmodel built further down, once the player's class is known —
    // see `abilityProp`. These three drive the camera/weapon half of the wire.
    let wiringTime = 0;      // counts down while the bend-and-wire animation plays
    let wiringPitch = 0;     // smoothed downward camera bend applied during wiring
    const DEMO_BEND = 0.42;  // radians the view dips toward the barrel while wiring
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
    //
    // It is a COLLAPSIBLE shield: the panel is carried folded, and deploying it
    // swings two hinged wings out to full width and drops the bottom skirt —
    // that unfolding is the Heavy's ability mechanism, the equivalent of the
    // other classes' hand props (see `shieldDeploy`).
    const shieldMesh = new THREE.Group();
    // Definite-assignment: all four are set synchronously in the block below.
    let shieldGlassMat!: THREE.MeshStandardMaterial;
    let shieldCoreMat!: THREE.MeshStandardMaterial;
    let shieldRimMat!: THREE.MeshBasicMaterial;
    let shieldEnergyMat!: THREE.MeshBasicMaterial;
    // Hinged sections driven by the deploy animation, plus the two materials
    // they introduce (tracked explicitly so teardown frees exactly those and
    // never double-disposes one shared with the fixed panel).
    const shieldWings: THREE.Group[] = [];
    const shieldFoldMats: THREE.Material[] = [];
    let shieldSkirt!: THREE.Group;
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

      // ── FOLDING SECTIONS ────────────────────────────────────────────────
      // Two side wings hinged on the frame's vertical edges plus a bottom skirt
      // hinged under it. Carried folded flat against the panel and swung out on
      // deploy, which is what turns "a shield appears" into "a shield is
      // opened". Each wing is its own pivot GROUP so the hinge line is the
      // frame edge, not the panel centre.
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x1e2733, metalness: 0.88, roughness: 0.42,
      });
      const wingGlassMat = new THREE.MeshStandardMaterial({
        color: 0xbfe0ff, transparent: true, opacity: 0.14, roughness: 0.1, metalness: 0,
        emissive: 0x3aa0ff, emissiveIntensity: 0.14, side: THREE.DoubleSide,
        depthWrite: false, fog: false,
      });
      shieldFoldMats.push(wingMat, wingGlassMat);
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(side * (W / 2 + 0.02), 0, 0);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(0.17, H - 0.06, 0.016), wingMat);
        panel.position.set(side * 0.085, 0, 0);
        wing.add(panel);
        const port = new THREE.Mesh(new THREE.PlaneGeometry(0.11, H - 0.30), wingGlassMat);
        port.position.set(side * 0.085, 0.05, 0.011);
        wing.add(port);
        // Hinge knuckles along the fold line so it reads as a real joint.
        for (const ky of [0.30, 0, -0.30]) {
          const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10), bandMat);
          knuckle.position.set(0, ky, 0);
          wing.add(knuckle);
        }
        shieldMesh.add(wing);
        shieldWings.push(wing);
      }
      // Bottom skirt — drops to cover the shins once braced.
      shieldSkirt = new THREE.Group();
      shieldSkirt.position.set(0, -(H / 2 + 0.02), 0);
      {
        const skirtPanel = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.15, 0.014), wingMat);
        skirtPanel.position.set(0, -0.075, 0);
        shieldSkirt.add(skirtPanel);
        for (const kx of [-0.2, 0, 0.2]) {
          const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10), bandMat);
          knuckle.rotation.z = Math.PI / 2;
          knuckle.position.set(kx, 0, 0);
          shieldSkirt.add(knuckle);
        }
      }
      shieldMesh.add(shieldSkirt);

      // Braced forward-lower-left in view space; the loop eases it in/out.
      shieldMesh.position.set(-0.46, -0.34, -0.78);
      shieldMesh.rotation.set(0.06, 0.36, 0.05);
      shieldMesh.visible = false;
      shieldMesh.renderOrder = 5;
      camera.add(shieldMesh);
    }


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
    //
    // PREMIUM PASS: the old field was 200 UNTEXTURED additive points — GL
    // renders those as hard-edged squares, which read as cheap glowing dots
    // scattered over every map (worst in the forest, where the night tint made
    // them big green blobs). Now: fewer motes (140 base — the air reads alive,
    // not littered), each drawn through the shared soft-spark radial sprite so
    // it resolves as a soft pollen grain by day / a glowing ember-firefly by
    // night, and confined to a lower, more believable band of air (0.6–5.5m)
    // instead of raining dots from 8m up. Net: better look AND ~30% less
    // per-frame mote work.
    const AMBIENT_PARTICLE_COUNT = Math.round(140 * graphicsPreset.particleDensity);
    // Particle density (a real graphics control) gates the ambient motes: they
    // spawn on medium+ density and scale/disable smoothly toward the low tiers.
    if (graphicsPreset.particleDensity >= 0.5) {
      const isNight = timeOfDay === 'night';
      const particleGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
      const velocities = new Float32Array(AMBIENT_PARTICLE_COUNT * 3);
      const phases = new Float32Array(AMBIENT_PARTICLE_COUNT); // random phase offset for sine drift

      for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 60;
        positions[i * 3 + 1] = 0.6 + Math.random() * 4.9;
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
        size: isNight ? 0.11 : 0.05,
        map: getSoftSparkTexture(),
        transparent: true,
        opacity: isNight ? 0.55 : 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      });

      ambientParticles = new THREE.Points(particleGeo, particleMat);
      ambientParticles.frustumCulled = false;
      scene.add(ambientParticles);
    }

    // ── SIGNATURE PER-MAP AMBIENCE (HIGH / ULTRA only) ─────────────────────
    // A living, GPU-animated particle layer unique to each map — drifting
    // fireflies in the deep forest, embers rising off the wasteland, luminous
    // spores welling up in the swamp, spectral wisps through the Twilight Vale,
    // and so on (see MapAmbience). One draw call, all motion in the vertex
    // shader (no per-frame CPU loop), added to the scene BEFORE the warmup
    // compile so its program links during loading. Gated to terrainDetail 1.0
    // (High/Ultra) so Medium and below never build it — those tiers keep the
    // lighter shared dust motes above and pay nothing for this.
    let mapAmbience: MapAmbience | null = null;
    if (graphicsPreset.terrainDetail >= 1.0 && graphicsPreset.postProcessing) {
      mapAmbience = new MapAmbience(
        scene, selectedMap, graphicsPreset.particleDensity, graphicsPreset.pixelRatio,
      );
    }

    // === RUN MODIFIER (single-run mutator) ===
    // Read once on scene init. The modifier is locked for the whole run so
    // the per-frame loop doesn't have to keep checking. `runModifier` may be
    // null (the player picked "Play without").
    const runModifier = activeRunModifierRef.current;
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
    // Tutorial hands the player a FULLY-MASTERED arsenal — every weapon is
    // maxed by default (full magazine bonus, reload speedup, recoil reduction)
    // and never levels up, so the tutorial is purely about learning the
    // controls, not grinding. Normal play starts at level 0.
    let masteryBonus: MasteryBonus = bonusForLevel(isTutorialMode ? MAX_MASTERY_LEVEL : 0);
    // Initial XP comes from the persisted record on the convex side. We
    // read it once via the React profile data outside the useEffect; the
    // initial bonus snapshot is taken below once `currentWeapon` is set.
    const masteryPersistedXpRef = persistedWeaponMasteryRef.current;
    const masteryTotalXp = (weapon: string): number =>
      (masteryPersistedXpRef[weapon] ?? 0) + (masteryRunXp[weapon] ?? 0);
    const refreshMasteryBonus = () => {
      // Tutorial stays pinned at max mastery (see the masteryBonus init above).
      masteryBonus = isTutorialMode
        ? bonusForLevel(MAX_MASTERY_LEVEL)
        : bonusForLevel(levelFromXp(masteryTotalXp(currentWeapon)));
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
    // One counter per event channel (see convex/dailyChallengeRegistry.ts).
    // All are per-RUN accumulators; the flush folds them into the server's
    // day total per the channel's mode ('add' sums across runs, 'max' keeps
    // the single-run best — how "reach wave N in one run" stays honest).
    const dailyCounts: Record<DailyEventChannel, number> = {
      kill: 0, headshot: 0, wave: 0, flawless_wave: 0,
      boss_kill: 0, rapid_kill: 0, melee_hit: 0, powerup: 0,
      score: 0, survive_min: 0, ability_use: 0, perfect_reload: 0, hack: 0,
      pistol_kill: 0, rifle_kill: 0, shotgun_kill: 0, smg_kill: 0,
      sniper_kill: 0, minigun_kill: 0, launcher_kill: 0, subverter_kill: 0,
    };
    // Rolling 4s kill-timestamp window for the triple-kill (rapid_kill)
    // channel; cleared whenever a burst is counted so one spree can't
    // double-count overlapping windows.
    const dailyRapidTimes: number[] = [];
    // Seconds survived this run (whole minutes fold into survive_min) and the
    // last score value already credited to the score channel.
    let dailySurviveSec = 0;
    let dailyLastScore = 0;
    let dailyFlushAccum = 0;
    let dailyBaseProgress: number | null = null;
    let dailyLastSentValue = 0;
    let dailyFlushInFlight = false;
    const dailyFlush = () => {
      if (!dailyChallengeId || !dailyChannel || dailyFlushInFlight) return;
      const challenge = DAILY_CHALLENGES[dailyChallengeId];

      // Wait for the server snapshot rather than accidentally overwriting a
      // previous run's total while the query is still loading.
      if (dailyBaseProgress === null) {
        const snapshot = dailyProgressRef.current;
        if (!snapshot || snapshot.challengeId !== dailyChallengeId) return;
        dailyBaseProgress = Math.min(challenge.goal, snapshot.progress);
        dailyLastSentValue = dailyBaseProgress;
      }

      // 'add' channels sum this run's count onto the server's day total;
      // 'max' channels (reach-wave) report the single-run best instead —
      // summing them would credit "reach wave 10" for two wave-5 runs.
      const runCount = dailyCounts[dailyChannel];
      const value = Math.min(
        challenge.goal,
        DAILY_CHANNEL_MODE[dailyChannel] === 'max'
          ? Math.max(dailyBaseProgress, runCount)
          : dailyBaseProgress + runCount,
      );
      if (value <= dailyLastSentValue) return;
      dailyFlushInFlight = true;
      // A rejected/throttled write stays eligible for the next 3-second flush
      // instead of being marked as sent and silently losing progress.
      void recordDailyProgressMutation({
        challengeId: dailyChallengeId,
        progress: value,
      }).then((result) => {
        if (!result.throttled) {
          dailyLastSentValue = Math.max(dailyLastSentValue, result.progress);
        }
      }).catch(() => { /* best-effort — local play is unaffected */ }).finally(() => {
        dailyFlushInFlight = false;
      });
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

    // ── SIGNATURE-ABILITY VIEWMODEL ──────────────────────────────────────
    // Every character's power is operated with a real piece of equipment held
    // in the LEFT hand — a radio firing device, a flame projector, a field
    // case, a stim injector, a cloak bracer, a kinetic charge unit. Exactly ONE
    // is built (this class's), it is parented to the camera like the weapon,
    // and its choreography emits BEATS that App hangs the actual gameplay
    // effect off (see `abilityPayload`), so the mechanism causes the power
    // instead of decorating it. Null for the Operative (whose mechanism is the
    // weapon itself) and the Heavy (whose mechanism is the shield).
    const abilityPropType = abilityPropKind(activeAbility.id);
    const abilityProp = abilityPropType ? new AbilityViewmodel(abilityPropType, camera) : null;
    // How long the mechanism takes to reach the frame it does its work. Timed
    // buffs add this back so the player is never charged for the wind-up. The
    // Operative has no prop — its wind-up is the weapon retune's own `lock`
    // beat, two thirds of the way through the choreography.
    const abilityWindupMs = abilityPropType
      ? ABILITY_PAYLOAD_DELAY[abilityPropType] * 1000
      : activeAbility.id === 'overclock'
        ? OVERCLOCK_DURATION * 0.66 * 1000
        : 0;

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
    // Second Wind perk — a once-per-run death cheat. `perkSecondWindUsed` latches
    // after it fires; `secondWindInvulnUntil` is a brief post-revive grace window
    // (ms, Date.now()) so the player isn't instantly re-killed by the same swarm.
    let perkSecondWindUsed = false;
    let secondWindInvulnUntil = 0;
    // Some perks have a one-shot moment-of-pick effect (max HP grant) on top
    // of their ongoing snapshot contribution. Run them once when picked.
    const applyPerkInstantEffects = (picked: WavePerkId) => {
      if (picked === 'max_hp_25') {
        playerMaxHealth += 25;
        health = Math.min(playerMaxHealth, health + 25);
      }
      if (picked === 'max_hp_50') {
        playerMaxHealth += 50;
        health = Math.min(playerMaxHealth, health + 50);
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
    // ── PER-WAVE POWER-UP BUDGET ─────────────────────────────────────────
    // Power-ups are a genuine reward, not a stream. Each wave gets a hard CAP
    // on how many can appear (counting the milestone wave crate). Wave 1 gets a
    // single drop; later waves ~3–4. A short "kills since last drop" cooldown
    // spreads the few drops across the wave instead of clumping at the start.
    let wavePowerupDrops = 0;
    let wavePowerupCap = 1;
    let killsSinceLastDrop = 0;
    // ── PICKUP LITTER CONTROL ────────────────────────────────────────────
    // The per-wave budget capped how many crates SPAWN, but nothing ever took
    // one away again: `powerUps` was append-only, world crates had no lifetime,
    // and — because the player may only carry ONE power at a time — every crate
    // they walked past stayed lit, bobbing and lighting the ground FOREVER. By
    // wave 10 the map was carpeted with uncollected loot, which is exactly what
    // makes a shooter read as cheap. Three rules fix it globally:
    //   1. TTL — a crate that isn't claimed decays (blinks out over its last
    //      seconds, then despawns). Loot is an opportunity, not scenery.
    //   2. LIVE CAP — at most this many uncollected crates exist at once,
    //      anywhere on the map. Spawning past the cap retires the OLDEST.
    //   3. The array is spliced, so collected/expired entries stop costing a
    //      per-frame iteration (it used to grow unbounded for the whole run).
    const PICKUP_TTL_MS = 42000;      // ~2 waves of grace to come back for it
    const PICKUP_FADE_MS = 7000;      // final stretch: blink + shrink out
    const PICKUP_LIVE_CAP = 3;        // uncollected crates allowed on the map
    let isGameOver = false;
    let paused = false;
    // ── RUN CONTEXT ──────────────────────────────────────────────────────
    // The read/write boundary for gameplay systems that live outside this
    // effect (see utils/RunContext.ts for the full rationale). Allocated ONCE
    // and mutated in place by refreshRunContext() each frame; systems read it
    // and emit() intents that drainRunEvents() applies at a single safe point.
    const runEvents = new RunEventQueue();
    let combo = 0;
    let killStreak = 0;
    let lastKillTime = 0;
    let currentWeapon = 'pistol';
    // Fire-rate gate — timestamp of the next allowed trigger pull. Replaces the
    // old `canShoot` flag + per-shot setTimeout pair: exact rate gating with
    // zero timer churn (the minigun alone used to spawn 20 timers/sec).
    let nextShotAt = 0;
    let isReloading = false;
    // Tutorial mode hands the player every weapon so they can try them all.
    const unlockedWeapons = isTutorialMode ? Object.keys(WEAPONS) : ['pistol'];
    let isAiming = false;
    // ── MOBILE AUTO-AIM (CODM-style) ──────────────────────────────────────
    // Touch has NO dedicated ADS button. Instead, pressing FIRE auto-engages
    // aim-down-sights for weapons that support it (`canAim`) AND the camera
    // magnetism below snaps onto the nearest enemy — "auto aim, then shoot".
    // This timestamp (ms) keeps the sights up briefly after each shot so
    // tap-firing a semi-auto never flickers the zoom in/out. Desktop ignores it.
    let mobileAdsLingerUntil = 0;
    let timeScale = 1.0; // For transient slow-mo effects (1.0 = normal speed)
    // ── Critical-health adrenaline time-dilation ──────────────────────────
    // Separate, *continuous* slow-mo factor that smoothly ramps in while the
    // player is critically wounded (a "near-death" bullet-time / heartbeat
    // beat) and eases back out as they heal. Kept independent of `timeScale`
    // so the transient kill/headshot slow-mos (which snap timeScale and reset
    // it via setTimeout) never stomp it. Final sim delta multiplies both.
    let healthTimeScale = 1.0;       // eased value applied to delta
    const CRIT_HP_FRACTION = 0.24;   // below this fraction of max HP → slow-mo
    const CRIT_HP_MIN_SCALE = 0.62;  // hardest slow-down at near-zero HP
    // Last whole-HP value broadcast to peers. The loop re-syncs health on any
    // change so EVERY heal/damage path (regen, lifesteal, triage, …) propagates
    // to remote clients — which is what drives remote players' wound display.
    let lastBroadcastHealth = -1;
    let fovPunch = 0; // FOV punch on shooting (additive degrees)
    let fovCheckAccum = 0; // throttles re-reading the FOV setting
    let abilityHudAccum = 0; // throttles ability-bar HUD updates
    // Change-gate for the ability bar, mirroring the stamina push below: the
    // throttle alone still handed React a brand-new array of fresh objects ~8
    // times a second forever, so the bar reconciled constantly while sitting
    // completely idle. Only push when a field the HUD actually renders moved.
    let lastAbilityHudSig = '';

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
      // Bump the render key + publish the duration so the pill restarts its
      // entrance→hold→collapse keyframe scaled to `ms`. The collapse is the
      // tail of that animation, so by the time the clear timer fires the pill
      // has already folded away — no hard pop-out.
      setPowerUpMeta((m) => ({ ms, key: m.key + 1 }));
      if (powerMsgTimer !== null) window.clearTimeout(powerMsgTimer);
      powerMsgTimer = window.setTimeout(() => {
        powerMsgTimer = null;
        setPowerUpMessage('');
      }, ms);
    };

    // ── GUIDED-TUTORIAL "not yet" FEEDBACK ───────────────────────────────
    // A control the tutorial hasn't handed over yet must never feel BROKEN.
    // Pressing it answers with a short pill + a soft denial click that says
    // when it opens up. Throttled, because the things that hit this are held
    // keys (W, SHIFT) and held triggers, which fire every frame.
    const TUT_LOCK_MOVE = '🔒 Look around first — walking unlocks next';
    const TUT_LOCK_SPRINT = '🔒 Sprint unlocks in the next step';
    const TUT_LOCK_COMBAT = '🔒 Your weapon comes online after the sprint drill';
    const TUT_LOCK_ABILITY = '🔒 Abilities unlock later in the tutorial';
    let tutorialLockMsgAt = 0;
    const tutorialLockedNotice = (msg: string) => {
      const t = performance.now();
      if (t - tutorialLockMsgAt < 1500) return;
      tutorialLockMsgAt = t;
      showPowerMessage(msg, 1500);
      soundManager.play('empty', 0.22, false, 1.5);
    };

    // ── DIFFICULTY-SCALED WEAPON UNLOCKS ─────────────────────────────────────
    // Easy uses the weapons' native unlock scores; Medium and Hard demand
    // progressively more points, so a harder run is a longer grind to the full
    // arsenal. Adaptive varies the requirement LIVE with how well the player is
    // doing — a dominating player needs more points (kept honest), a struggling
    // one unlocks sooner (kept in the fight). Pistol (unlockScore 0) is always
    // free regardless of multiplier.
    // Raised so the arsenal is a real, difficulty-scaled grind: Easy is a modest
    // step up from the native scores, Medium and Hard demand SIGNIFICANTLY more
    // (a competitive run earns its guns). Pistol (unlockScore 0) is always free.
    const WEAPON_UNLOCK_MULT: Record<'easy' | 'medium' | 'hard', number> = {
      easy: 1.3, medium: 2.5, hard: 3.5,
    };
    const weaponUnlockMultNow = (): number => {
      if (classicDifficulty === 'adaptive') {
        // LIVE with skill: the live adaptive level (20..95) maps to 1.2..3.4×, so
        // a dominating player grinds nearly as long as Hard, a struggling one
        // unlocks closer to Easy — the requirement breathes with performance.
        const lvl = adaptiveDifficulty.getDifficulty().level;
        return 1.2 + Math.max(0, Math.min(1, (lvl - 20) / 75)) * 2.2;
      }
      return WEAPON_UNLOCK_MULT[classicDifficulty] ?? 1.0;
    };
    const effectiveUnlockScore = (weapon: { unlockScore: number }): number =>
      Math.round(weapon.unlockScore * weaponUnlockMultNow());

    // Check and unlock weapons based on score (difficulty-scaled threshold).
    const checkWeaponUnlocks = () => {
      let newUnlock = false;
      Object.keys(WEAPONS).forEach(weaponKey => {
        const weapon = WEAPONS[weaponKey];
        if (score >= effectiveUnlockScore(weapon) && !unlockedWeapons.includes(weaponKey)) {
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
    // Lingering muzzle smoke — throttled + hard-capped so full-auto leaves a
    // believable haze instead of unbounded sprites (mirrors the casing/shard
    // pooling discipline). `lastMuzzleSmokeMs` enforces the emit throttle.
    const muzzleSmokePuffs: MuzzleSmoke[] = [];
    const MAX_MUZZLE_SMOKE = 28;
    let lastMuzzleSmokeMs = 0;
    // Heavy sooty smoke venting off critically-damaged / hacked robots. Its own
    // capped pool (independent of the gun-smoke cap so neither starves the other)
    // built from the SAME MuzzleSmoke class → reuses the smoke shader program.
    // Cap scales with particle density; skipped entirely on the lowest presets.
    const enemySmokePuffs: MuzzleSmoke[] = [];
    // Live gust strength, mirrored out of the render loop so anything spawned
    // OUTSIDE it (smoke plumes, drifting embers) blows the same way the grass
    // and foliage do instead of inventing its own weather.
    let currentWindGust = 1;
    const MAX_ENEMY_SMOKE = Math.max(0, Math.round(24 * graphicsPreset.particleDensity));
    const bulletTracers: BulletTracer[] = [];
    const impactEffects: ImpactEffect[] = [];
    const robotSparks: RobotHitSparks[] = [];
    // Cinematic hit-confirm flashes (gated by the "Impact Feedback" setting) —
    // a world-space core flash + shockring at each point of contact.
    const impactBursts: ImpactBurst[] = [];
    const explosionEffects: ExplosionEffect[] = [];
    // Tactical-nuke detonations (mushroom cloud set-piece — own small array).
    const nukeEffects: NukeEffect[] = [];
    // Pyro "Firestorm" fire-nova shockwaves (rare ultimate — own small array).
    const fireNovas: FireNovaEffect[] = [];
    // Per-cast ability bursts (tinted ring + pillar + sparks at the caster).
    const castEffects: AbilityCastEffect[] = [];
    // Subverter intrusion beams — the bolt fired from the deck into a target.
    const hackBeams: HackBeam[] = [];

    // ── SUBVERTER (robot-hacking) tuning ─────────────────────────────────
    // Short engagement range; the player must get in close to deploy a chip.
    // A hacked enemy hunts its own kind for HACK_DURATION seconds, hitting
    // them for the enemy's melee × HACK_VICTIM_DMG_MULT, then burns out in an
    // EMP blast (HACK_BLAST_*) that fries everything around it.
    const HACK_RANGE = 17;            // metres — must be close to deploy
    const HACK_CONE = 0.25;           // min dot(forward, →enemy): roughly aimed at
    const HACK_DURATION = 6.5;        // seconds of overclocked chaos
    const HACK_VICTIM_DMG_MULT = 2.4; // hacked enemies hit HARD vs their kin
    const HACK_BLAST_RADIUS = 6.8;    // overclock EMP radius
    const HACK_BLAST_DAMAGE = 110;    // EMP centre damage (falls off to ~50%)

    // ── Decapitation gibs ────────────────────────────────────────────────
    // A powerful headshot kill (sniper / launcher-tier weapons) pops the
    // enemy's head clean off: we hide the real (pooled) head, clone it into a
    // free-flying gib that arcs, bounces and tumbles, then fades. The clone
    // SHARES the head's geometry + material (no GPU re-upload), so it's cheap.
    interface HeadGib { mesh: THREE.Object3D; vel: THREE.Vector3; spin: THREE.Vector3; life: number; restY: number; }
    const headGibs: HeadGib[] = [];
    const MAX_HEAD_GIBS = 10;

    // ── Torn-wire bundles (decapitation) ────────────────────────────────
    // A robot's head doesn't pop off clean — a fistful of severed cables tears
    // out WITH it (dangling from the flying gib, whipping around as it tumbles)
    // and a matching stub is left sparking up out of the neck. One shared geo
    // per part + three shared cable materials (same standard-material program
    // the shell casings already compile, so no new shader variant); each
    // bundle is a handful of tilted, length-varied cylinders with a scorched
    // glowing connector at the torn end. Gib bundles leave the scene with
    // their gib; the neck stub is detached when the corpse's pooled mesh is
    // recycled (see the death-recycle block).
    const wireGeo = new THREE.CylinderGeometry(0.045, 0.03, 1, 5);
    wireGeo.translate(0, -0.5, 0); // extends -Y from its root point
    const wireTipGeo = new THREE.SphereGeometry(0.07, 6, 5);
    const wireMats = [
      new THREE.MeshStandardMaterial({ color: 0xb86428, metalness: 0.85, roughness: 0.35 }), // bare copper
      new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.3, roughness: 0.8 }),   // black insulation
      new THREE.MeshStandardMaterial({ color: 0xcfa22e, metalness: 0.6, roughness: 0.5 }),   // yellow loom
    ];
    const wireTipMat = new THREE.MeshStandardMaterial({
      color: 0x2a0f06, emissive: 0xff6a22, emissiveIntensity: 2.2,
    });
    const buildWireBundle = (pointUp: boolean, scale: number): THREE.Group => {
      const bundle = new THREE.Group();
      const count = 4 + ((Math.random() * 3) | 0);
      for (let i = 0; i < count; i++) {
        const wire = new THREE.Mesh(wireGeo, wireMats[i % wireMats.length]);
        wire.position.set((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3);
        wire.rotation.set(
          (pointUp ? Math.PI : 0) + (Math.random() - 0.5) * 0.9,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.9,
        );
        wire.scale.y = 0.45 + Math.random() * 0.55; // ragged, uneven tear
        wire.castShadow = false;
        // Scorched connector glowing at the torn end (counter-scaled so the
        // parent's length stretch doesn't egg the sphere).
        const tip = new THREE.Mesh(wireTipGeo, wireTipMat);
        tip.position.y = -1;
        tip.scale.set(1, 1 / wire.scale.y, 1);
        tip.castShadow = false;
        wire.add(tip);
        bundle.add(wire);
      }
      bundle.scale.setScalar(scale);
      return bundle;
    };

    // Camera shake system
    let cameraShakeIntensity = 0;
    const cameraShakeDecay = 0.9;

    // Game objects
    const enemies: Enemy[] = [];

    // The live RunContext handed to external gameplay systems. Allocated ONCE
    // here; refreshRunContext() (in animate) overwrites the per-frame fields in
    // place, so no system ever causes a per-frame allocation. Everything a
    // system is allowed to touch is on this object — see utils/RunContext.ts.
    const runCtx: RunContext = {
      scene,
      camera,
      preset: graphicsPreset,
      solo: !isMultiplayer,
      difficulty: classicDifficulty,
      dt: 0,
      rawDt: 0,
      frameScale: 1,
      nowMs: Date.now(),
      tSec: 0,
      playerPos: camera.position,
      playerHp: health,
      playerMaxHp: playerMaxHealth,
      wave,
      paused: false,
      gameOver: false,
      enemies,
      groundY: visualGroundY,
      queryObstacles: (x, z, r) => {
        // The grid is rebuilt lazily as terrain streams in; every other caller
        // in this file does the same before querying.
        rebuildTerrainGridIfStale();
        return terrainGrid.queryRadius(x, z, r);
      },
      emit: runEvents.emit,
    };

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
    // Revenant fires a GOLD bolt (its signature) — same geo, gold materials so
    // its tracer is instantly distinct from the Sniper's cyan one.
    const _revBoltMat = new THREE.MeshBasicMaterial({
      color: 0xffd76a, toneMapped: false, fog: false,
    });
    const _revBoltGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffc24a, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
    });
    const powerUps: PowerUp[] = [];
    const particles: Particle[] = [];

    // ── Shell casings (lightweight physics debris) ──
    // Tiny brass cylinders flung from the gun on each shot. They arc under
    // gravity, bounce off the ground with friction + tumble, then shrink away.
    // A hard cap (oldest removed first) keeps rapid fire from spawning unbounded
    // meshes. One shared geo+material so the whole effect costs almost nothing.
    interface ShellCasing { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; bounced?: boolean; }
    const shellCasings: ShellCasing[] = [];
    const MAX_CASINGS = 40;
    // 6 → 12 segments: casings land right in front of the player and a hexagon
    // silhouette was clearly readable at that range. Still trivial geometry, and
    // it's ONE shared buffer for every casing in the game.
    const casingGeo = new THREE.CylinderGeometry(0.022, 0.026, 0.12, 12);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xd9a441, metalness: 0.95, roughness: 0.3, emissive: 0x2a1a00, emissiveIntensity: 0.35,
    });
    const _casRight = new THREE.Vector3();
    const _casFwd = new THREE.Vector3();
    // Recycled casing records — one brass casing per trigger pull means a
    // per-shot `new Mesh` + Vector3s on autofire; the free-list makes sustained
    // fire allocation-free (a minigun cycles the same ≤40 records forever).
    const _casingFreeList: ShellCasing[] = [];
    const releaseCasing = (c: ShellCasing) => {
      scene.remove(c.mesh);
      if (_casingFreeList.length < MAX_CASINGS) _casingFreeList.push(c);
    };
    const ejectShellCasing = () => {
      if (shellCasings.length >= MAX_CASINGS) {
        const old = shellCasings.shift();
        if (old) releaseCasing(old);
      }
      _casRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _casFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const c = _casingFreeList.pop();
      const m = c ? c.mesh : new THREE.Mesh(casingGeo, casingMat);
      m.scale.setScalar(1); // undo the shrink-out from a recycled casing
      m.position.copy(camera.position)
        .addScaledVector(_casRight, 0.32)
        .addScaledVector(_casFwd, 0.55);
      m.position.y -= 0.22;
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(m);
      if (c) {
        c.vel.copy(_casRight).multiplyScalar(1.7 + Math.random() * 0.9);
        c.vel.y = 2.1 + Math.random() * 1.1;
        c.vel.addScaledVector(_casFwd, (Math.random() - 0.5) * 0.7);
        c.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
        c.life = 2.4;
        c.bounced = false;
        shellCasings.push(c);
      } else {
        const vel = _casRight.clone().multiplyScalar(1.7 + Math.random() * 0.9);
        vel.y = 2.1 + Math.random() * 1.1;
        vel.addScaledVector(_casFwd, (Math.random() - 0.5) * 0.7);
        shellCasings.push({
          mesh: m,
          vel,
          spin: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
          life: 2.4,
        });
      }
    };

    // ── Bullet shatter shards (deflection debris) ──
    // When a round bites into an enemy it doesn't just vanish — it SHATTERS,
    // throwing a handful of angular metal fragments that spray back off the
    // armour, tumble through the air, bounce once on the ground and settle
    // before shrinking away. Three shard silhouettes (so no two fragments look
    // identical) + one shared metallic material, all module-scoped and pooled
    // behind a hard cap, keep the whole effect nearly free even on full-auto.
    // Gated by the "Impact Feedback" gameplay setting.
    interface BulletShard { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; life: number; restY: number; scale: number; }
    const bulletShards: BulletShard[] = [];
    const MAX_SHARDS = 110;
    const shardGeos = [
      new THREE.TetrahedronGeometry(0.06),
      new THREE.OctahedronGeometry(0.05),
      new THREE.BoxGeometry(0.05, 0.05, 0.11),
    ];
    // Spent-round metal: warm gun-metal with a faint hot emissive so fragments
    // catch a glint of bloom as they tumble, without reading as "glowing".
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xb9bec6, metalness: 0.92, roughness: 0.34,
      emissive: 0x3a2410, emissiveIntensity: 0.45,
    });
    const _shardDir = new THREE.Vector3();
    // Scatter shards off an impact at `pos`, deflecting back along `-shotDir`
    // (the direction the round was travelling) with a wide upward cone.
    // Recycled shard records (mesh + velocity/spin vectors). Impact feedback
    // shatters 5–8 shards on EVERY landed round — per-hit `new Mesh` + two
    // `new Vector3`s was steady autofire heap churn. Records go back to this
    // free-list when a shard expires or is evicted; geometry is re-picked from
    // the shared set on reuse so recycled shards still vary in shape.
    const _shardFreeList: BulletShard[] = [];
    const releaseShard = (s: BulletShard) => {
      scene.remove(s.mesh);
      if (_shardFreeList.length < MAX_SHARDS) _shardFreeList.push(s);
    };
    const spawnBulletShards = (pos: THREE.Vector3, shotDir: THREE.Vector3, count: number) => {
      // Deflection bias points back toward the shooter + slightly up.
      _shardDir.copy(shotDir).normalize().multiplyScalar(-1);
      for (let s = 0; s < count; s++) {
        if (bulletShards.length >= MAX_SHARDS) {
          const old = bulletShards.shift();
          if (old) releaseShard(old);
        }
        const geo = shardGeos[(Math.random() * shardGeos.length) | 0];
        const shard = _shardFreeList.pop();
        const m = shard ? shard.mesh : new THREE.Mesh(geo, shardMat);
        m.geometry = geo;
        m.castShadow = false;
        m.position.copy(pos);
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        const sc = 0.7 + Math.random() * 0.9;
        m.scale.setScalar(sc);
        scene.add(m);
        // Spray in a cone around the deflection direction, with a real upward
        // kick so fragments arc before falling.
        const spread = 2.6;
        const speed = 2.4 + Math.random() * 3.2;
        if (shard) {
          shard.vel.set(
            _shardDir.x * speed + (Math.random() - 0.5) * spread,
            1.8 + Math.random() * 2.6,
            _shardDir.z * speed + (Math.random() - 0.5) * spread,
                );
          shard.spin.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26);
          shard.life = 1.3 + Math.random() * 0.5;
          shard.restY = 0.03 + Math.random() * 0.04;
          shard.scale = sc;
          bulletShards.push(shard);
        } else {
          bulletShards.push({
            mesh: m,
            vel: new THREE.Vector3(
              _shardDir.x * speed + (Math.random() - 0.5) * spread,
              1.8 + Math.random() * 2.6,
              _shardDir.z * speed + (Math.random() - 0.5) * spread,
            ),
            spin: new THREE.Vector3((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26),
            life: 1.3 + Math.random() * 0.5,
            restY: 0.03 + Math.random() * 0.04,
            scale: sc,
          });
        }
      }
    };

    // Temporary explosion craters left by the rocket launcher. `rig` carries
    // the pooled meshes/materials (see createCrater) so fade + recycling are
    // direct field access rather than a scene traversal.
    interface Crater {
      mesh: THREE.Object3D;
      rig: {
        group: THREE.Group;
        scorchMat: THREE.MeshStandardMaterial;
        ringMat: THREE.MeshStandardMaterial;
        debrisMat: THREE.MeshStandardMaterial;
        chunks: THREE.Mesh[];
      };
      life: number;
      maxLife: number;
    }
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
    // ── TRACER ROUND ────────────────────────────────────────────────────
    // The previous projectile was three CONCENTRIC YELLOW SPHERES (r=0.11 /
    // 0.20 / 0.36) — 0.72 units across, uniformly amber, with no orientation.
    // At any distance that reads as a floating yellow blob, not a bullet.
    //
    // A real tracer is not a ball of light. It is a very small, very hot
    // projectile with an INCANDESCENT TAIL streaming behind it, and the eye
    // reads the ELONGATION as speed. So:
    //
    //   • HEAD  — a tiny, near-white capsule. Small enough to read as a round.
    //   • TAIL  — a cone tapering BACKWARD along the flight axis, amber at the
    //             head fading to deep orange. This is what sells the motion.
    //   • HAZE  — one slim additive sleeve for the bloom to catch, so the
    //             tracer glows without becoming a blob again.
    //
    // A previous attempt at an elongated round was reverted because it looked
    // like it "curved" in flight — but that was an ORIENTATION bug, not a
    // shape problem: the group was never aimed along its velocity, so the long
    // axis pointed a fixed direction while the round flew somewhere else. Now
    // buildBullet's caller aims it once at spawn (bullets travel in a straight
    // line, so once is exact and costs nothing per frame).
    //
    // Geometry is built along -Z (the flight axis) to match the shoot path's
    // `setFromUnitVectors(_NEG_Z, direction)` convention used by rockets.
    const sharedBulletCoreGeo = (() => {
      // Slim capsule: a bullet is ~4× longer than it is wide.
      const g = new THREE.CapsuleGeometry(0.035, 0.11, 4, 8);
      g.rotateX(Math.PI / 2); // +Y → -Z
      return g;
    })();
    const sharedBulletInnerGlowGeo = (() => {
      // The hot tail — widest at the round, tapering to nothing behind it.
      const g = new THREE.ConeGeometry(0.075, 0.95, 10, 1, true);
      g.rotateX(-Math.PI / 2);   // apex toward -Z…
      g.translate(0, 0, 0.48);   // …then push the body BEHIND the head
      return g;
    })();
    const sharedBulletOuterGlowGeo = (() => {
      // Wider, fainter sleeve around the tail purely for bloom pickup.
      const g = new THREE.ConeGeometry(0.15, 1.35, 10, 1, true);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, 0.66);
      return g;
    })();
    // White-hot at the round, cooling to orange down the tail — the colour
    // gradient of something actually burning, rather than one flat yellow.
    const projectileCoreColor = 0xfff6e2;
    const projectileTailColor = 0xffb347;
    const projectileGlowColor = 0xff7a1e;
    const bulletCoreMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const bulletInnerGlowMatCache = new Map<number, THREE.MeshBasicMaterial>();
    const bulletOuterGlowMatCache = new Map<number, THREE.MeshBasicMaterial>();

    const buildBullet = (_color: number): THREE.Group => {
      const cacheKey = projectileCoreColor;
      // The round itself — near-white and slightly over-driven so it stays the
      // brightest point of the tracer and bloom blooms from THERE, not from
      // the whole silhouette.
      let coreMat = bulletCoreMatCache.get(cacheKey);
      if (!coreMat) {
        coreMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileCoreColor).multiplyScalar(1.6),
          toneMapped: true,
          fog: false,
        });
        bulletCoreMatCache.set(cacheKey, coreMat);
      }
      // Burning tail — amber, additive, DoubleSide so the open cone reads as
      // solid flame from any viewing angle (BackSide alone vanishes head-on).
      let innerGlowMat = bulletInnerGlowMatCache.get(cacheKey);
      if (!innerGlowMat) {
        innerGlowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileTailColor),
          transparent: true,
          opacity: 0.62,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
          fog: false,
          side: THREE.DoubleSide,
        });
        bulletInnerGlowMatCache.set(cacheKey, innerGlowMat);
      }
      // Outer haze — deep orange, faint. Just enough for the bloom pass.
      // BackSide, not DoubleSide: this is the widest mesh of the three and so
      // the most expensive to shade, and on a faint additive sleeve the far
      // wall alone is visually indistinguishable from both walls. The minigun
      // can put 20+ tracers on screen at once, so halving the fragment cost
      // here is worth more than the difference is worth looking at.
      let outerGlowMat = bulletOuterGlowMatCache.get(cacheKey);
      if (!outerGlowMat) {
        outerGlowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(projectileGlowColor),
          transparent: true,
          opacity: 0.20,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: true,
          fog: false,
          side: THREE.BackSide,
        });
        bulletOuterGlowMatCache.set(cacheKey, outerGlowMat);
      }
      // Recycle a retired projectile visual when one is available — a Group +
      // 3 glow meshes per round is real heap churn on autofire weapons.
      const pooled = _bulletMeshPool.pop();
      if (pooled) return pooled;
      const group = new THREE.Group();
      const outerGlow = new THREE.Mesh(sharedBulletOuterGlowGeo, outerGlowMat);
      const innerGlow = new THREE.Mesh(sharedBulletInnerGlowGeo, innerGlowMat);
      const core = new THREE.Mesh(sharedBulletCoreGeo, coreMat);
      outerGlow.renderOrder = 994;
      innerGlow.renderOrder = 995;
      core.renderOrder = 996;
      group.add(outerGlow);
      group.add(innerGlow);
      group.add(core);
      return group;
    };
    // Free-list of retired bullet visuals (geo/materials all shared, so a
    // pooled group is fully inert). Rockets are NOT pooled — they carry
    // per-instance exhaust parts and detonate rarely enough not to matter.
    const _bulletMeshPool: THREE.Group[] = [];
    // Sibling free-list for the Bullet RECORDS ({mesh, velocity, …}): every
    // splice site retires through here, so the wrapper object + its velocity
    // vector are recycled too and sustained fire allocates nothing per round.
    // Records are only ever referenced by the `bullets` array, so a retired
    // record can never be aliased by in-flight logic.
    const _bulletRecordPool: Bullet[] = [];
    const retireBulletMesh = (b: Bullet) => {
      scene.remove(b.mesh);
      if (!b.isRocket && _bulletMeshPool.length < 40) {
        _bulletMeshPool.push(b.mesh as THREE.Group);
      }
      if (_bulletRecordPool.length < 64) _bulletRecordPool.push(b);
    };

    // ── REVENANT PHYSICAL GOLD SHIELD (its own look, NOT the player's riot
    // shield) — a solid, hand-held HEATER SHIELD the Revenant braces in front of
    // itself: a beveled GOLD metal plate (kite shape, pointed base), a glowing
    // energy-rim outline, a domed central boss, and rivet studs. Reads as a real,
    // physical shield (casts a shadow), unmistakably gold + elite. Per-instance
    // (revenant is rare); fully disposed on death/recycle.
    const buildRevenantShield = (): THREE.Group => {
      const g = new THREE.Group();
      // Heater/kite outline in the XY plane (extruded toward +Z = toward the
      // player, since the revenant faces the player).
      const W = 0.72, TOP = 0.92, SHO = 0.4, BOT = -1.02;
      const s = new THREE.Shape();
      s.moveTo(-W, SHO);
      s.lineTo(-W, TOP - 0.14);
      s.quadraticCurveTo(-W, TOP, -W + 0.2, TOP);
      s.lineTo(W - 0.2, TOP);
      s.quadraticCurveTo(W, TOP, W, TOP - 0.14);
      s.lineTo(W, SHO);
      s.lineTo(0, BOT);
      s.closePath();
      const plateGeo = new THREE.ExtrudeGeometry(s, {
        depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06,
        bevelSegments: 1, curveSegments: 5,
      });
      plateGeo.center();
      // Brushed-gold metal plate.
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
        color: 0xb8892a, metalness: 0.9, roughness: 0.28,
        emissive: 0x3a2606, emissiveIntensity: 0.5, flatShading: true,
      }));
      plate.castShadow = true;
      g.add(plate);
      // Glowing energy-rim outline (bright gold edges).
      const rim = new THREE.LineSegments(
        new THREE.EdgesGeometry(plateGeo),
        new THREE.LineBasicMaterial({ color: 0xffe79a, toneMapped: false, fog: false }),
      );
      g.add(rim);
      // Domed central boss + emblem (the focal glow — also the hit-flash node).
      const boss = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0xe8b545, metalness: 0.95, roughness: 0.2,
          emissive: 0x5a3a08, emissiveIntensity: 0.7 }),
      );
      boss.position.z = 0.12;
      boss.castShadow = true;
      g.add(boss);
      const emblem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.MeshBasicMaterial({ color: 0xffe8a0, toneMapped: false, fog: false }),
      );
      emblem.position.z = 0.2;
      g.add(emblem);
      // Rivet studs down the spine + across the shoulders.
      const studMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, metalness: 1, roughness: 0.25 });
      const studGeo = new THREE.SphereGeometry(0.05, 8, 6);
      [[-0.55, 0.6], [0.55, 0.6], [-0.5, -0.2], [0.5, -0.2], [0, -0.7]].forEach(([sx, sy]) => {
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(sx, sy, 0.09);
        g.add(stud);
      });
      // Braced in front of the torso, angled slightly across the body (left-arm
      // guard), face toward the player.
      g.position.set(-0.12, 1.05, 0.7);
      g.rotation.y = 0.12;
      g.scale.setScalar(0.95);
      g.userData.isRevShield = true;
      g.userData.emblem = emblem; // brightened on hit
      return g;
    };
    // Detach + free every geometry/material a Revenant shield owns (Meshes AND
    // the rim LineSegments) so a recycled pool slot never leaks them.
    const disposeRevShield = (shield: THREE.Object3D): void => {
      shield.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
    };

    // ── MINI-BOSS CROWN ─────────────────────────────────────────────────────
    // A real lit 3D crown (brushed-gold band + spike ring + floating ruby)
    // replacing the old flat unlit yellow sphere, which read as a 2D disc
    // pasted over the enemy. Geometries + materials are SESSION-SHARED: safe
    // with the enemy pool's add-on strip, because releaseEnemy only disposes
    // direct Mesh children — this is a Group, so its sub-meshes are detached
    // with it but never disposed. Freed once at scene teardown below.
    const _crownBandGeo = new THREE.CylinderGeometry(0.3, 0.38, 0.24, 12, 1, true);
    const _crownSpikeGeo = new THREE.ConeGeometry(0.075, 0.3, 4);
    const _crownJewelGeo = new THREE.OctahedronGeometry(0.11, 0);
    const _crownGoldMat = new THREE.MeshStandardMaterial({
      color: 0xd9a92a, metalness: 0.92, roughness: 0.26,
      emissive: 0x7a4d08, emissiveIntensity: 0.7,
      side: THREE.DoubleSide, // open band — inner wall must render too
    });
    const _crownJewelMat = new THREE.MeshBasicMaterial({ color: 0xff4a3a, toneMapped: false, fog: false });
    const buildMiniBossCrown = (): THREE.Group => {
      const g = new THREE.Group();
      const band = new THREE.Mesh(_crownBandGeo, _crownGoldMat);
      g.add(band);
      const SPIKES = 6;
      for (let i = 0; i < SPIKES; i++) {
        const ang = (i / SPIKES) * Math.PI * 2;
        const spike = new THREE.Mesh(_crownSpikeGeo, _crownGoldMat);
        spike.position.set(Math.cos(ang) * 0.31, 0.24, Math.sin(ang) * 0.31);
        spike.rotation.y = -ang; // keep the 4-sided pyramid faces aligned outward
        g.add(spike);
      }
      const jewel = new THREE.Mesh(_crownJewelGeo, _crownJewelMat);
      jewel.position.y = 0.3;
      g.add(jewel);
      g.userData.jewel = jewel; // counter-spun in the enemy loop for sparkle
      return g;
    };

// Create enemy with OPTIMIZED pooled meshes from SmartEnemyManager
    // Returns null if enemy limit reached (adaptive performance management)
    const createEnemy = (x: number, z: number, type: PooledEnemyType = 'normal'): Enemy | null => {
      // === SMART ENEMY MANAGER: Acquire pooled mesh ===
      // This uses shared geometries/materials and object pooling for optimal performance

      // Get the scale for this enemy type (single source of truth: ENEMY_CONFIGS)
      const bodyScale = ENEMY_SCALE[type];
      const position = new THREE.Vector3(x, 1.0 * bodyScale, z);
      const acquiredMesh = smartEnemyManager.acquireMeshForEnemy(type as PooledEnemyType, position);

      // If pool is exhausted or adaptive limit reached, don't spawn
      if (!acquiredMesh) {
        return null;
      }

      // Extract mesh and parts from pooled enemy
      const {
        mesh: enemyGroup, body: torso, leftArm, rightArm, leftLeg, rightLeg, head, poolId,
        // Shooter archetypes only — the energy lance's bore anchor and its
        // emissive charge set (undefined on every melee archetype).
        muzzle, muzzleGlow, weaponGlow,
      } = acquiredMesh;

      // A recycled pooled mesh may still carry a frost-shell child (Cryo Freeze)
      // or a Revenant shield bubble from a previous occupant — strip both so
      // they never reappear on the fresh spawn. (Frost shell is shared geo+mat,
      // so we only detach the wrapper; the rev shield owns per-instance mats,
      // disposed in the death-cleanup, but we belt-and-suspenders dispose here.)
      for (let ci = enemyGroup.children.length - 1; ci >= 0; ci--) {
        const ch = enemyGroup.children[ci];
        if (ch.userData?.isFrostShell) {
          enemyGroup.remove(ch);
        } else if (ch.userData?.isBurnShell) {
          // Fire shell (Pyro) — shared geo+mat owned by FireSystem, and the
          // system's own list must drop it too or it keeps animating a shell
          // that is no longer on anything.
          fireSystem.detachBurn(ch as THREE.Group);
        } else if (ch.userData?.isSurgeHalo || ch.userData?.isRadShell) {
          // ARK-07 event wrappers share their geo/mat — detach only, never dispose.
          enemyGroup.remove(ch);
        } else if (ch.userData?.isRevShield) {
          enemyGroup.remove(ch);
          disposeRevShield(ch);
        } else if (
          ch.userData?.isBulwarkShield
          || ch.userData?.isHowlerAura
          || ch.userData?.isOvershieldRing
        ) {
          // Tactical-archetype attachments. Shared geo+mat (see
          // EnemyArchetypes' pool contract) — detach only, NEVER dispose, or
          // the next enemy of that type draws freed buffers.
          enemyGroup.remove(ch);
        }
      }
      // Clean slate for the recycled pooled mesh — return any battle-damage
      // dents/scuffs from the previous occupant to the pool so a fresh spawn
      // doesn't inherit them.
      battleDamage.clearFor(enemyGroup);

      // Get enemy stats based on type (kept for AI calculations)
      let enemyHealth = 50;
      let enemySpeed = 0.08;
      let enemyDamage = 8;
      let enemyScore = 10;

      switch(type) {
        case 'fast':
          enemyHealth = 30;
          // Runner speed restored toward its proper, competitive value (0.13).
          // It reads as genuinely fast again — multiplied by the difficulty
          // speedMult it's notably quicker on Medium (1.0×) and Hard (1.5×) — yet
          // it's NOT sticky anymore because the real fix was its ATTACK cadence
          // (1050ms / generous arc), not crippling its legs.
          enemySpeed = 0.13;
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
          // 300 → 900. The Overlord is the apex threat and the wave's whole
          // event, but at 300 base a stacked sniper build deleted it with a
          // single headshot: on Easy it lands at only ~375 HP once the wave
          // ramp and the easyElite halving are applied, and a headshot is
          // 100 × 2 BEFORE Heavy Hitter, Skull Splitter and the damage perks
          // multiply it past 450. Tripling the base is the floor of the fix —
          // the per-hit cap below is what actually stops the one-shot, because
          // perk stacking scales faster than any flat HP number can.
          enemyHealth = 900;
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
        case 'revenant':
          // Apex trickster — LOW HP on purpose: its survivability is the SHIELD
          // + teleport + regen, not a fat health bar, so once it's caught
          // off-guard (shield down) or an explosive shatters it, it dies fast —
          // a fair, skill-rewarding kill. Speed sits between normal (0.08) and
          // fast (0.15). Big score because it's the rarest, deadliest foe.
          enemyHealth = 46;
          enemySpeed = 0.105;
          enemyDamage = 16;   // per gold bolt
          enemyScore = 65;
          break;
        case 'bulwark':
          // A walking wall. HP is only moderately high because its real defence
          // is the FRONTAL SHIELD — the player is meant to beat it by moving,
          // not by out-damaging it. Slow enough that flanking is always
          // achievable; hits hard enough that ignoring it is not.
          enemyHealth = 120;
          enemySpeed = 0.045;
          enemyDamage = 18;
          enemyScore = 55;
          break;
        case 'howler':
          // Support caster. Deliberately FRAGILE — it dies to a moment's
          // attention, which is exactly the trade being asked for: spend that
          // moment, or fight a swarm that keeps healing.
          enemyHealth = 55;
          enemySpeed = 0.07;
          enemyDamage = 5;    // barely fights; the aura is the threat
          enemyScore = 60;
          break;
        case 'leaper':
          // Glass ambusher. Low HP, quick, and its damage is concentrated in
          // the pounce rather than its melee, so reacting to the tell is worth
          // far more than trading hits with it.
          enemyHealth = 42;
          enemySpeed = 0.115;
          enemyDamage = 10;   // melee; the pounce impact is separate
          enemyScore = 45;
          break;
        case 'splitter':
          // Bloated host. The parent is slow and unthreatening on its own —
          // the danger is entirely in WHERE and HOW you kill it.
          enemyHealth = 95;
          enemySpeed = 0.05;
          enemyDamage = 11;
          enemyScore = 50;
          break;
      }

      // ── EASY-MODE ELITE TONE-DOWN ────────────────────────────────────────
      // On Easy the apex threats (pink boss + Revenant) are SIGNIFICANTLY
      // gentler than on Medium/Hard: roughly half HP and well under half the
      // bite, so newcomers still get the spectacle without the wall. (Their
      // shield/summon/teleport behaviour is also eased in their AI blocks.)
      const easyElite = classicDifficulty === 'easy' && (type === 'boss' || type === 'revenant');
      // 0.5 → 0.7 for the boss. Halving its HP on top of Easy's already-low
      // healthMult was what made the Overlord a paper apex there. Its DAMAGE
      // stays heavily reduced (0.55), which is the part that actually protects
      // a newcomer — a boss that dies instantly isn't gentler, it's just not a
      // boss. The Revenant keeps the original halving; it's a duel, not a slog.
      const easyEliteHpMult = easyElite ? (type === 'boss' ? 0.7 : 0.5) : 1;
      const easyEliteDmgMult = easyElite ? 0.55 : 1;

      // Wave-based AI advancement. Reaction & dodge scaled by difficulty —
      // hard-mode enemies react in ~half the time of easy enemies.
      const dodgeSkill = Math.min((0.1 + wave * 0.03) / Math.max(0.5, diffSettings.reactionMult), 0.95);
      const reactionTime = Math.max((800 - wave * 30) * diffSettings.reactionMult, 110);
      const healthMultiplier = 1 + (wave * 0.15); // 15% more health per wave
      // Per-wave damage + speed ramp so each round genuinely hits harder and
      // moves a touch faster — difficulty climbs with the round count, not just
      // enemy health. Capped at wave 40 so late waves stay intense, not unfair.
      const waveDamageRamp = 1 + Math.min(wave, 40) * 0.02; // up to +80% by wave 40
      const waveSpeedRamp = 1 + Math.min(wave, 40) * 0.006; // up to +24% by wave 40

      // Determine AI personality based on type
      let personality: 'aggressive' | 'tactical' | 'defensive' | 'support' = 'aggressive';
      if (type === 'fast') personality = 'tactical';
      else if (type === 'tank') personality = 'defensive';
      else if (type === 'boss') personality = 'aggressive';
      else if (type === 'ranged') personality = 'support'; // hangs back, kites
      else if (type === 'revenant') personality = 'tactical'; // mobile flanker
      else if (type === 'bulwark') personality = 'defensive'; // advances behind the shield
      else if (type === 'howler') personality = 'support';    // stays with the pack, not the player
      else if (type === 'leaper') personality = 'tactical';   // circles, then commits
      else if (type === 'splitter') personality = 'defensive';

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
      // Ranged + Revenant are SHOOTERS (no melee), but the AttackSystem is still
      // constructed for them — map both onto 'normal' so the config type checks;
      // the runtime melee call sites skip both archetypes anyway.
      // Tactical archetypes map onto the closest melee profile: Bulwark and
      // Splitter swing like a tank (slow, heavy), Leaper and Howler like a
      // normal (the Leaper's real damage comes from its pounce, and the Howler
      // barely fights at all).
      const attackArchetype: 'normal' | 'fast' | 'tank' | 'boss' =
        (type === 'ranged' || type === 'revenant' || type === 'howler' || type === 'leaper') ? 'normal'
        : (type === 'bulwark' || type === 'splitter') ? 'tank'
        : type;
      // The swing SHAPE is picked from the true archetype, not the timing
      // profile above: a Revenant and a Leaper share a grunt's cadence but
      // should not throw a grunt's punch. This is the tell the player reads
      // in their peripheral vision to know what just closed on them.
      const meleeStyle: MeleeStyle =
        (type === 'tank' || type === 'boss' || type === 'bulwark') ? 'slam'
        : (type === 'leaper' || type === 'howler' || type === 'splitter' || type === 'revenant') ? 'flurry'
        : 'swipe';
      const attackSystemInstance = new AttackSystem(
        AttackSystem.createConfigForType(attackArchetype, enemyDamage * diffSettings.damageMult * waveDamageRamp * easyEliteDmgMult * (runMods.enemyDamageMult ?? 1)),
        meleeStyle,
      );

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
      // ARK-07 events also harden the wave's plating at spawn time (guests
      // create mirrors too, but their hp/mx are overwritten from the host's
      // sync stream, so this only ever matters on the authority).
      const netEventHpMult = netWaveEvent === 'surge' ? 1 + 0.25 * netWaveEventIntensity
        : netWaveEvent === 'glitch' ? 1 + 0.15 * netWaveEventIntensity
        : 1;
      const effectiveHealth = enemyHealth * Math.max(0.8, diffSettings.healthMult * healthMultiplier) * easyEliteHpMult * (runMods.enemyHealthMult ?? 1) * netEventHpMult;

      const enemy: Enemy = {
        mesh: enemyGroup,
        health: effectiveHealth,
        maxHealth: effectiveHealth,
        speed: (enemySpeed + Math.random() * 0.02) * diffSettings.speedMult * waveSpeedRamp * (runMods.enemySpeedMult ?? 1),
        dead: false,
        type,
        damage: enemyDamage * diffSettings.damageMult * waveDamageRamp * easyEliteDmgMult * (runMods.enemyDamageMult ?? 1),
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
        muzzle,
        muzzleGlow,
        weaponGlow,
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
        // Boss summoner: first reinforcement call comes a few seconds after the
        // boss arrives so the player has a beat to react before the adds drop.
        bossNextSummonAt: type === 'boss' ? Date.now() + 6000 : undefined,
        bossSummonCast: 0,
        // Boss blink/teleport — burst-capped charges that refill over time.
        // Hard mode gets a bigger burst (3) and the medium/adaptive a 2, easy a
        // lone charge, so the blink pressure scales with difficulty.
        bossTeleMaxCharges: type === 'boss'
          ? (classicDifficulty === 'hard' ? 3 : classicDifficulty === 'easy' ? 1 : 2)
          : undefined,
        bossTeleCharges: type === 'boss'
          ? (classicDifficulty === 'hard' ? 3 : classicDifficulty === 'easy' ? 1 : 2)
          : undefined,
        bossTeleNextChargeAt: type === 'boss' ? Date.now() + 9000 : undefined,
        // First blink only after the player has had a few seconds with the boss.
        bossTeleNextAt: type === 'boss' ? Date.now() + 7000 : undefined,
        bossTeleArriveFx: 0,
        // NEW: Advanced AI Systems
        aiBehavior,
        perception,
        attackSystem: attackSystemInstance,
        bulletDodging,
        playerVelocity: new THREE.Vector3(0, 0, 0),
        isDodging: false,
        dodgeDirection: new THREE.Vector3(0, 0, 0),
        // Pool tracking for mesh recycling
        poolId,
      };

      // ── REVENANT SETUP — the rare apex trickster's shield + blink + regen ──
      // Built here (rare spawn → the tiny per-spawn cost is fine) and torn down
      // on death/recycle (see the death-cleanup block) so a pooled slot never
      // inherits a stray shield bubble.
      if (type === 'revenant') {
        const shield = buildRevenantShield();
        enemyGroup.add(shield);
        enemy.revShield = shield;
        enemy.revShieldActive = true;       // arrives shielded
        shield.visible = true;
        const easyRev = classicDifficulty === 'easy';
        // Up→down cycle (eased on Easy: shorter shield, LONGER open window so
        // it's far easier to catch off-guard). The exact durations are read in
        // the AI block; this just seeds the first cycle.
        enemy.revShieldDownAt = Date.now() + (easyRev ? 2200 : 3400);
        enemy.revShieldNextUpAt = 0;
        enemy.revShieldBrokenUntil = 0;
        enemy.revShieldHitFlash = 0;
        // Blink: 2 charges (3 on Hard, just 1 on Easy), tighter cadence than the boss.
        enemy.revTeleCharges = classicDifficulty === 'hard' ? 3 : easyRev ? 1 : 2;
        enemy.revTeleNextChargeAt = Date.now() + (easyRev ? 12000 : 6000);
        enemy.revTeleNextAt = Date.now() + (easyRev ? 5000 : 3500);
        // Rare self-heal — later + gentler on Easy (handled in the AI block).
        enemy.revRegenNextAt = Date.now() + (easyRev ? 16000 : 9000);
      }

      // ── TACTICAL ARCHETYPE SETUP ─────────────────────────────────────────
      // Each attachment uses shared geo+mat and is tagged for the pool-acquire
      // detach above. No per-spawn material is created, so no new shader
      // program is introduced and the warmup guarantee holds.
      if (type === 'bulwark') {
        const shield = buildBulwarkShield();
        enemyGroup.add(shield);
        enemy.bulwarkShield = shield;
        enemy.bulwarkFlash = 0;
      } else if (type === 'howler') {
        const aura = buildHowlerAura();
        enemyGroup.add(aura);
        enemy.howlerAura = aura;
        enemy.howlerNextPulseAt = Date.now() + 1200;
        // MUST be killable at any range — see the note on alwaysDamageable.
        // A back-line healer behind the LOD damage floor would be invincible.
        enemy.alwaysDamageable = true;
      } else if (type === 'leaper') {
        enemy.leapState = 'idle';
        enemy.leapNextAt = Date.now() + 2000 + Math.random() * 2000;
        enemy.leapVel = new THREE.Vector3();
      } else if (type === 'splitter') {
        // Only the PARENT splits — children are spawned with canSplit false so
        // a single kill can never cascade into an unbounded chain.
        enemy.canSplit = true;
      }
      // The pooled mesh's own overshield ring (if any) was detached above, so
      // the fresh occupant must not inherit a handle to it.
      enemy.overshieldRing = undefined;

      return enemy;
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

    // ── PointLight pool ───────────────────────────────────────────────────
    // Every resident light is shaded per-pixel on every lit surface in forward
    // rendering, EVEN at intensity 0 — so the pool size is a flat per-frame GPU
    // tax across the whole screen. 5 still sits above the realistic peak of
    // glowing pickups within a light's 9-unit reach of the camera, and the
    // overflow path degrades invisibly: an un-lit pickup keeps its bright
    // emissive core, it just doesn't cast dynamic light onto nearby ground.
    const PICKUP_LIGHT_POOL_SIZE = 5;
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

    // ── Render-distance-proportional pickup streaming ─────────────────────
    // A pickup farther than the preset's view distance is fully DESPAWNED
    // visually: hidden, its pooled light released back for nearby loot, and
    // every per-frame animation (bob, pulse, glow, halo shader clock) skipped.
    // Walking back within ~92% of the radius rehydrates it seamlessly. The
    // hysteresis gap stops boundary flicker; the radius follows the Settings
    // render-distance slider, so Low presets stream aggressively while Ultra
    // keeps loot beacons alive across the whole arena.
    const PICKUP_SLEEP_DIST = graphicsPreset.viewDistance;
    const PICKUP_SLEEP_DIST_SQ = PICKUP_SLEEP_DIST * PICKUP_SLEEP_DIST;
    const PICKUP_WAKE_DIST_SQ = (PICKUP_SLEEP_DIST * 0.92) * (PICKUP_SLEEP_DIST * 0.92);

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

    // ── FIRE ─────────────────────────────────────────────────────────────
    // The Pyro's flame projector, the ground it sets alight, and the robots
    // that keep burning after the sweep passes. Borrows a slot from the SAME
    // pre-allocated explosion-light pool above (never creates a light at
    // runtime — that is the documented cause of the mid-fight recompile
    // stutter), and reuses the explosion family's additive material
    // permutation so it adds no shader program to link.
    const fireSystem = new FireSystem(
      scene,
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
        case 'cryo':
          // Icy crystal — sharp octahedron shell + bright frozen core.
          color = 0x1f6f9c; coreColor = 0x9fe4ff;
          shellGeo = _pgeo('pgShellCryo', () => new THREE.OctahedronGeometry(0.6, 0));
          innerGeo = _pgeo('pgInnerCryo', () => new THREE.OctahedronGeometry(0.3, 0));
          break;
        case 'tesla':
          // Charged coil — torus shell wrapping a hot electric core.
          color = 0xb89a1a; coreColor = 0xfff27a;
          shellGeo = _pgeo('pgShellTesla', () => new THREE.TorusGeometry(0.4, 0.16, 10, 20));
          innerGeo = _pgeo('pgInnerTesla', () => new THREE.IcosahedronGeometry(0.26, 0));
          break;
        case 'shockwave':
          // Kinetic ring — flat torus shell with a dense pulse core.
          color = 0xb8842a; coreColor = 0xffe0a0;
          shellGeo = _pgeo('pgShellShock', () => new THREE.TorusGeometry(0.5, 0.1, 8, 24));
          innerGeo = _pgeo('pgInnerShock', () => new THREE.DodecahedronGeometry(0.26, 0));
          break;
        case 'health':
          // Med-pack — a green box shell + bright green core so it reads
          // instantly as "heal" (distinct from the radioactive nuke green).
          color = 0x0f7a36; coreColor = 0x4dff7a;
          shellGeo = _pgeo('pgShellHp', () => new THREE.BoxGeometry(0.7, 0.55, 0.45));
          innerGeo = _pgeo('pgInnerHp', () => new THREE.BoxGeometry(0.4, 0.32, 0.26));
          break;
        case 'nuke':
          // Radioactive-green warhead — a rounded shell with a hot glowing core
          // so the rare nuke drop reads as obviously dangerous/special.
          color = 0x1f7a22; coreColor = 0x9bff4a;
          shellGeo = _pgeo('pgShellNk', () => new THREE.IcosahedronGeometry(0.6, 1));
          innerGeo = _pgeo('pgInnerNk', () => new THREE.IcosahedronGeometry(0.32, 0));
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
      group.add(shell);

      // INNER GEM — bright unlit core (shared by color).
      const inner = new THREE.Mesh(innerGeo, getInnerMat(coreColor));
      group.add(inner);

      // TWIN ADDITIVE GLOW SPHERES (shared geometry + per-color material)
      const glowInner = new THREE.Mesh(glowInnerGeoShared, getGlowInnerMat(coreColor));
      glowInner.renderOrder = 989;
      group.add(glowInner);

      const glowOuter = new THREE.Mesh(glowOuterGeoShared, getGlowOuterMat(coreColor));
      glowOuter.renderOrder = 988;
      group.add(glowOuter);

      // ROTATING RING (shared geometry + per-color material)
      const ring = new THREE.Mesh(ringGeoShared, getRingMat(coreColor));
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 988;
      group.add(ring);

      // SECOND ORBIT RING — tilted, counter-rotating (same shared geometry +
      // material: one extra draw, zero new GPU resources). The crossed pair
      // gives every pickup a gyroscope silhouette that reads at distance.
      const ring2 = new THREE.Mesh(ringGeoShared, getRingMat(coreColor));
      ring2.rotation.x = Math.PI / 2 + 0.85;
      ring2.scale.setScalar(1.18);
      ring2.renderOrder = 988;
      group.add(ring2);

      // GROUND HALO DISC (shared geometry + per-color shader material)
      const halo = new THREE.Mesh(haloGeoShared, getHaloMat(coreColor));
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -1.95; // ~ground level (group bobs around y=2)
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
      group.userData.ring2 = ring2;
      group.userData.halo = halo;
      group.userData.haloMat = halo.material as THREE.ShaderMaterial;
      group.userData.light = pickupLight; // may be null when pool exhausted
      // Kept so the render-distance sleep/wake cycle can re-acquire a pool
      // light in the right colour when a slept pickup rehydrates.
      group.userData.coreColor = coreColor;
      // Phase offset so neighbouring pickups don't pulse in sync
      group.userData.pulsePhase = Math.random() * Math.PI * 2;
      // Materialize-in: the drop pops from a point to full size over ~0.45s
      // (driven in the per-frame loop) so loot arriving mid-fight has a beat.
      group.userData.spawnAt = Date.now();
      // Decay clock — see PICKUP_TTL_MS. An unclaimed crate is not permanent
      // scenery; the per-frame loop blinks it out and despawns it at expiry.
      group.userData.expireAt = group.userData.spawnAt + PICKUP_TTL_MS;
      group.scale.setScalar(0.01);
      // `core` is the mesh exposed to gameplay code (pickup collision,
      // cleanup). Aliasing the group keeps `core.position` / `core.userData`
      // calls below working without further changes.
      const core = group as unknown as THREE.Mesh;
      core.renderOrder = 990;
      scene.add(group);

      return {
        mesh: core,
        type,
        position: new THREE.Vector3(x, 2, z),
        collected: false
      };
    };

    /**
     * Retire a world pickup: release its pooled light and unparent the group.
     *
     * Shared with the collection path — every pickup material and geometry is
     * cached per colour / per shape, so disposing here would free resources
     * other live pickups are still drawing with. Detach only.
     */
    const despawnPickup = (pu: PowerUp): void => {
      const root = pu.mesh as unknown as THREE.Object3D;
      releasePickupLight(root.userData.light as THREE.PointLight | null | undefined);
              root.userData.light = null;
              root.parent?.remove(root);
      pu.collected = true; // marks it for the splice on the next frame
    };

    /**
     * THE single entry point for putting loot on the ground.
     *
     * Enforces the global live cap (see PICKUP_LIVE_CAP): if the map already
     * holds the maximum number of unclaimed crates, the OLDEST one is retired
     * to make room, so a fresh, relevant drop always wins over stale litter and
     * the world can never accumulate a field of glowing boxes.
     */
    const spawnPickup = (x: number, z: number, type: PowerUp['type'], persistent = false): PowerUp => {
      let live = 0;
      let oldest: PowerUp | null = null;
      for (let i = 0; i < powerUps.length; i++) {
        const p = powerUps[i];
        // `persistent` crates are exempt from BOTH the cap accounting and the
        // eviction choice — see below.
        if (p.collected || p.mesh.userData.persistent === true) continue;
        live++;
        if (!oldest || ((p.mesh.userData.spawnAt as number) || 0) < ((oldest.mesh.userData.spawnAt as number) || 0)) {
          oldest = p;
        }
      }
      if (live >= PICKUP_LIVE_CAP && oldest) despawnPickup(oldest);
      const pu = createPowerUp(x, z, type);
      // A persistent crate never decays and can never be evicted. Used by the
      // tutorial, whose "collect a power-up" drill stages exactly ONE crate and
      // then waits — a crate that timed out, or that an enemy drop pushed off
      // the live cap, would leave that step impossible to finish.
      if (persistent) {
        pu.mesh.userData.persistent = true;
        pu.mesh.userData.expireAt = Infinity;
      }
      powerUps.push(pu);
      return pu;
    };

    const createParticles = (position: THREE.Vector3, color: number, count: number = 10) => {
      // Scale particle count based on graphics quality
      const scaledCount = Math.max(1, Math.floor(count * graphicsPreset.particleDensity));
      const effect = new ImpactEffect(scene, position, color, scaledCount);
      impactEffects.push(effect);
    };

    // ── REVENANT SHIELD HELPERS ───────────────────────────────────────────
    // The shield phases off ALL non-explosive damage (bullets, dash, fire, cryo,
    // tesla, shockwave): those just PING off it. Only an EXPLOSIVE (barrel /
    // launcher rocket / nuke) SHATTERS it — which also locks it OFF for 5s so
    // the player can finish the kill. While the shield is naturally DOWN (its
    // brief open window) the revenant takes full damage — that's the skill
    // window. revShieldUp is the single source of truth used at every damage site.
    const revShieldUp = (e: Enemy): boolean => e.type === 'revenant' && e.revShieldActive === true;
    const pingRevShield = (e: Enemy, pos: THREE.Vector3): void => {
      e.revShieldHitFlash = 1;
      // The player is shooting it → it knows to blink away (evade). This is set
      // ONLY by player-sourced hits, never by a hacked enemy hunting it, so it
      // never flees the subverter's attacker.
      e.revEvadeUntil = Date.now() + 500;
      robotSparks.push(new RobotHitSparks(scene, pos.clone(), new THREE.Vector3(0, 1, 0), 6));
      soundManager.play('hit', 0.22, false, 1.75); // metallic "ting" off the field
    };
    // A subverter-hacked enemy is mauling this Revenant → strip its protection:
    // shield forced OFF + teleport SUPPRESSED for a window, so it can't escape
    // the attacker (it stays locked on the player). Direct health damage from
    // the hacked enemy already bypasses the shield (it's applied inline).
    const markRevenantHackedHit = (victim: Enemy): void => {
      if (victim.type !== 'revenant') return;
      const now = Date.now();
      victim.revShieldBrokenUntil = Math.max(victim.revShieldBrokenUntil ?? 0, now + 2500);
      victim.revTeleSuppressUntil = Math.max(victim.revTeleSuppressUntil ?? 0, now + 2500);
      victim.revShieldActive = false;
      if (victim.revShield) victim.revShield.visible = false;
    };
    const shatterRevShield = (e: Enemy, pos?: THREE.Vector3): void => {
      if (e.type !== 'revenant') return;
      const wasUp = e.revShieldActive === true;
      e.revShieldActive = false;
      const now = Date.now();
      e.revShieldBrokenUntil = now + 5000;   // can't raise for 5s → finish it!
      e.revShieldNextUpAt = now + 5000;
      e.ccUntil = Math.max(e.ccUntil ?? 0, now + 650); // staggered by the blast
      if (e.revShield) e.revShield.visible = false;
      if (wasUp) {
        const p = pos ?? e.mesh.position;
        createParticles(p, 0xffc24a, 28);      // gold shield-shatter burst
        soundManager.play('hit', 0.6, false, 0.7);
        soundManager.play('powerUp', 0.4, false, 0.5);
      }
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

    const findEnemySpawnSpot = (baseDist: number, radius: number, preferredAngle?: number) => {
      const ENEMY_RADIUS = radius;
      let lastX = 0, lastZ = 0;
      for (let ring = 0; ring < 4; ring++) {
        const dist = baseDist + ring * 6;
        for (let a = 0; a < 6; a++) {
          // With a preferred bearing (batch angular spread), try angles clustered
          // around it first — jitter widening per attempt — so a spawning squad
          // fans out around the player from distinct sides instead of bunching
          // on one flank. Falls back to a random angle if terrain blocks them.
          const angle = preferredAngle !== undefined
            ? preferredAngle + (Math.random() - 0.5) * (0.5 + a * 0.28)
            : Math.random() * Math.PI * 2;
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
    type EnemyKind = 'normal' | 'fast' | 'tank' | 'boss' | 'revenant';
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
      {
        type: 'revenant', killsToUnlock: 18, weight: 1,
        intro: {
          name: 'Revenant', tag: 'APEX · TRICKSTER',
          blurb: 'Gold-shielded blink-hunter. It phases off your shots and self-heals — strike it the instant its shield drops, or blow an explosive next to it.',
          accent: '#ffc24a', icon: 'crown',
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

    const spawnEnemyBatch = (
      count: number,
      typeOverride?: PooledEnemyType,
      miniBoss = false,
      // Staging overrides — used by the guided tutorial to place a drill target
      // close and in front instead of 45m out on a random bearing. Both default
      // to the normal randomised behaviour.
      spawnDist?: number,
      spawnBearing?: number,
    ): number => {
      const adaptiveMax = smartEnemyManager.getCurrentMaxEnemies();
      const hardish = classicDifficulty === 'hard' || classicDifficulty === 'adaptive';
      // Spread the batch's spawn bearings evenly around the player (random
      // start angle + even increments). Combined with the surround AI, the wave
      // closes in from every side instead of trickling out of one direction.
      const spreadBase = spawnBearing ?? Math.random() * Math.PI * 2;
      let spawned = 0;
      for (let i = 0; i < count; i++) {
        if (enemies.length >= adaptiveMax || !smartEnemyManager.canSpawnMore()) break;
        let type: PooledEnemyType = typeOverride ?? 'normal';
        if (!typeOverride) {
          if (isTutorialMode) {
            // Tutorial draws from the director's progressively-unlocked roster.
            type = pickTutorialEnemyType();
          } else {
            const rand = Math.random();
            // Wave-scaled "harder mix" bump — as the round count climbs, MORE of
            // the spawns roll into the harder archetypes (ranged / tank), in
            // EVERY difficulty (incl. Easy). Capped so it never fully crowds out
            // the basic foes. (The Revenant itself is spawned per-wave in
            // spawnWave, not rolled here.)
            const waveHardBump = Math.min(0.2, Math.max(0, wave - 2) * 0.007);
            // This wave's SHAPE re-weights the mix (see WAVE_SHAPES). Clamped
            // so a bias can never drive a probability negative or past 1.
            const sb = waveShapeDef.bias;
            const bias = (base: number, b: number) => Math.max(0, Math.min(0.95, base + b));
            // Ranged sniper joins from wave 4. Probability ramps with wave so the
            // long-range threat is felt even when tanks/bosses are in the mix.
            if (wave >= 4 && rand < bias((hardish ? 0.20 : 0.14) + waveHardBump, sb.ranged)) {
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
            else if (wave >= bossStartWave && rand < (hardish ? 0.12 : 0.08)) type = 'boss';
            else if (wave >= 3 && rand < bias((hardish ? 0.32 : 0.24) + waveHardBump, sb.tank)) type = 'tank';
            else if (wave >= 2 && rand < bias(hardish ? 0.5 : 0.42, sb.fast)) type = 'fast';
          }
        }
        // Bosses are bigger (scale 2.0) so they need a wider clearance.
        const enemyRadius = ENEMY_SPAWN_CLEARANCE[type];
        // Shape scales engagement range: Ambush spawns in close, Siege holds
        // the long lines. Floored so nothing ever materialises on top of the
        // player even on the most aggressive shape.
        const baseDist = spawnDist
          ?? Math.max(22, (42 + Math.random() * 26) * mapSpawnReach * waveShapeDef.distMult);
        // Each enemy in the batch gets its own evenly-spaced bearing slot.
        const preferredAngle = spreadBase + (i / Math.max(1, count)) * Math.PI * 2;
        const spot = findEnemySpawnSpot(baseDist, enemyRadius, preferredAngle);
        const enemy = createEnemy(spot.x, spot.z, type);
        if (enemy) {
          // Mini-Boss elevation: quadruple HP, mark the flag, and set a real
          // 3D gold crown (band + spikes + floating ruby) above the head so
          // the player can pick it out of the wave at a glance. Spun + bobbed
          // in the enemy loop; assets are session-shared (buildMiniBossCrown).
          if (miniBoss) {
            enemy.isMiniBoss = true;
            enemy.health *= 4;
            enemy.maxHealth *= 4;
            const crown = buildMiniBossCrown();
            const crownY = (enemy.head?.position.y ?? 1.9) + 0.85;
            crown.position.y = crownY;
            crown.userData.baseY = crownY;
            enemy.mesh.add(crown);
            enemy.crown = crown;
          }
          // First full BOSS of the run (wave 10+) gets a one-time threat banner
          // so the player knows the summoner has arrived.
          if (enemy.type === 'boss' && !bossIntroFired && !isTutorialMode) {
            bossIntroFired = true;
            setEnemyIntro({
              id: Date.now(),
              name: 'Overlord',
              tag: 'APEX · SUMMONER',
              blurb: 'A towering purple apex that calls in Red & Blue shock troops — and rarely a Sniper. Immune to the Subverter. Burn it down fast.',
              accent: '#e85aff',
              icon: 'crown',
            });
            soundManager.play('powerUp', 0.9, false, 0.55);
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

    // ── BOSS SUMMONER ────────────────────────────────────────────────────
    // The pay-off of a boss's summon telegraph: a pack of minions bursts in
    // around it. Composition is mostly Red (normal) + Blue (fast) shock troops
    // with a rare Sniper (ranged). Each minion pops in with a portal flash in
    // its signature colour; the boss emits a purple summon shockwave. Respects
    // the live enemy cap / pool, so it never overwhelms the budget or the GPU.
    const SUMMON_TELEGRAPH = 0.85; // seconds of rear-up before the adds appear
    const performBossSummon = (boss: Enemy) => {
      const count = boss.bossSummonCount ?? 3;
      const bx = boss.mesh.position.x;
      const bz = boss.mesh.position.z;
      // Purple summon shockwave + roar at the boss.
      castEffects.push(new AbilityCastEffect(scene, boss.mesh.position.clone(), 0xe85aff));
      createParticles(boss.mesh.position, 0xe85aff, 30);
      soundManager.play('hack_overclock', 0.6, false, 0.7);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      let spawnedAdds = 0;
      const startAngle = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        if (!smartEnemyManager.canSpawnMore() || enemies.length >= smartEnemyManager.getCurrentMaxEnemies()) break;
        // Composition: rare Sniper (ranged), otherwise an even Red/Blue split.
        const roll = Math.random();
        const t: 'normal' | 'fast' | 'ranged' = roll < 0.12 ? 'ranged' : roll < 0.56 ? 'fast' : 'normal';
        // A clear spot in a tight ring around the boss (widen if blocked).
        const ang = startAngle + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        let mx = bx, mz = bz, ok = false;
        for (let r = 0; r < 4; r++) {
          const dist = 3.0 + r * 1.6 + Math.random() * 1.2;
          mx = bx + Math.cos(ang) * dist;
          mz = bz + Math.sin(ang) * dist;
          if (!overlapsTerrain(mx, mz, 1.2)) { ok = true; break; }
        }
        if (!ok) continue;
        const minion = createEnemy(mx, mz, t);
        if (!minion) continue;
        if (isMpHost) { minion.netId = nextEnemyNetId++; enemyByNetId.set(minion.netId, minion); }
        enemies.push(minion);
        // Portal pop in the minion's signature colour (Red / Blue / Cyan).
        const col = t === 'ranged' ? 0x6effff : t === 'fast' ? 0x57d6ff : 0xff6a3d;
        createParticles(new THREE.Vector3(mx, 1.0, mz), col, 16);
        castEffects.push(new AbilityCastEffect(scene, new THREE.Vector3(mx, 0.2, mz), col));
        spawnedAdds++;
      }
      if (spawnedAdds > 0 && gameSettingsManager.getSetting('killFeed')) {
        addKillFeedEntry('Overlord summons reinforcements!', 'combo');
      }
    };

    // ── BOSS BLINK / TELEPORT ─────────────────────────────────────────────
    // The boss phase-blinks AROUND the player to flank or backstab, then closes
    // in. Difficulty profile tunes how often it blinks, how fast its charges
    // refill, and (Hard only) whether it warps behind the player's movement.
    const BOSS_TELE_MIN_DIST = 9;   // fairness floor — NEVER blink onto the player
    const BOSS_TELE_MAX_DIST = 16;  // outer ring — close enough to threaten
    const bossTeleProfile = ({
      hard:     { perBlink: 1500, regen: 6000,  reposChance: 0.6,  evalDelay: 2200 },
      medium:   { perBlink: 2600, regen: 9000,  reposChance: 0.35, evalDelay: 2800 },
      adaptive: { perBlink: 2400, regen: 8000,  reposChance: 0.4,  evalDelay: 2700 },
      easy:     { perBlink: 4000, regen: 14000, reposChance: 0.15, evalDelay: 3500 },
    } as const)[classicDifficulty] ?? { perBlink: 2600, regen: 9000, reposChance: 0.35, evalDelay: 2800 };
    const bossTeleHardMode = classicDifficulty === 'hard';
    // Place the boss at a fair-distance flank/backstab spot around the player.
    // Returns false (no move) if every candidate is blocked by terrain.
    const performBossTeleport = (
      boss: Enemy, playerX: number, playerZ: number, pVelX: number, pVelZ: number,
      // Blink VFX colours — purple for the boss, gold for the Revenant so each
      // reads in its own identity.
      fxMain = 0xe85aff, fxCast = 0xc060ff,
    ): boolean => {
      const pspeed = Math.hypot(pVelX, pVelZ);
      let baseAngle: number;
      if (bossTeleHardMode && pspeed > 3) {
        // Backstab: warp behind the direction the player is moving.
        baseAngle = Math.atan2(pVelZ, pVelX) + Math.PI;
      } else {
        // Flank: jump to roughly the opposite side from where the boss is now.
        const bearing = Math.atan2(boss.mesh.position.z - playerZ, boss.mesh.position.x - playerX);
        baseAngle = bearing + (Math.random() < 0.5 ? 1 : -1) * (1.9 + Math.random() * 0.9);
      }
      let tx = 0, tz = 0, ok = false;
      for (let a = 0; a < 5; a++) {
        const ang = baseAngle + (a === 0 ? 0 : (Math.random() - 0.5) * 1.7);
        const dist = BOSS_TELE_MIN_DIST + Math.random() * (BOSS_TELE_MAX_DIST - BOSS_TELE_MIN_DIST);
        const cx = playerX + Math.cos(ang) * dist;
        const cz = playerZ + Math.sin(ang) * dist;
        if (!checkTerrainCollision(cx, cz)) { tx = cx; tz = cz; ok = true; break; }
      }
      if (!ok) return false;
      // Vanish flash at the old spot.
      createParticles(boss.mesh.position, fxMain, 22);
      castEffects.push(new AbilityCastEffect(scene, boss.mesh.position.clone(), fxCast));
      soundManager.play('hack_overclock', 0.5, false, 1.25);
      // Warp.
      boss.mesh.position.x = tx;
      boss.mesh.position.z = tz;
      // Materialise flash at the arrival spot (the per-frame facing re-aims it).
      createParticles(new THREE.Vector3(tx, 1.0, tz), fxMain, 28);
      castEffects.push(new AbilityCastEffect(scene, new THREE.Vector3(tx, 0.2, tz), fxMain));
      boss.bossTeleArriveFx = 0.35;
      soundManager.play('powerUp', 0.4, false, 1.7);
      return true;
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
    // enemy loot). One spawn keeps powers a genuine reward, not a stream. It
    // counts against the per-wave power-up budget so the wave's total stays
    // within the ~3–4 cap.
    // ═══ ARK-07 NETWORK EVENT LIFECYCLE ══════════════════════════════════
    // Shared by the host/solo roll (spawnWave) AND the guest mirror
    // (handleEnemySync applies the host's wm/wi keyframe state through the
    // same functions), so every client sees identical announcements/FX.
    const activateNetWaveEvent = (kind: 'surge' | 'glitch', intensity: number) => {
      if (netWaveEvent === kind) return;
      netWaveEvent = kind;
      netWaveEventIntensity = intensity;
      wavesSinceNetEvent = 0;
      setWaveEventUI(kind);
      setWaveEventOverlay(kind);
      if (kind === 'surge') {
        // The broadcast made visible: an EMP ring races out from the NEAREST
        // relay across the whole map (screen-flash + shake fire when it
        // crosses the player — see the per-frame driver).
        const src = uplinkNet?.nearestSpire(camera.position.x, camera.position.z);
        const ox = src ? src.x : camera.position.x;
        const oz = src ? src.z : camera.position.z;
        empShockwaves.push(new EmpShockwave(scene, new THREE.Vector3(ox, 0, oz)));
        soundManager.play('hack_overclock', 0.9, false, 0.55);
        soundManager.play('powerUp', 0.8, false, 0.5);
        if (!surgeIntroFired) {
          surgeIntroFired = true;
          setEnemyIntro({
            id: Date.now(),
            name: 'Overdrive Surge',
            tag: 'NETWORK EVENT · ALL UNITS OVERCLOCKED',
            blurb: 'ARK-07 just dumped an overdrive broadcast — safeties off, optics burning red. Every unit this wave hits harder, moves faster and shrugs off more. Survive the trial.',
            accent: '#ff4a30',
            icon: 'zap',
          });
        } else {
          showPowerMessage('⚠ OVERDRIVE SURGE — ALL UNITS OVERCLOCKED', 3000);
        }
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('ARK-07: Overdrive broadcast detected', 'wave');
      } else {
        triggerAbilityFlash('#57d6ff');
        soundManager.play('hack_fail', 0.8, false, 0.7);
        soundManager.play('hit', 0.4, false, 2.2);
        if (!glitchIntroFired) {
          glitchIntroFired = true;
          setEnemyIntro({
            id: Date.now(),
            name: 'Null Wave',
            tag: 'SIGNAL CORRUPTED · FIRMWARE UNSTABLE',
            blurb: 'This wave shipped corrupted. The units are running impossible code — they stutter through space, your ballistics are compromised, and the feed itself is tearing. Nothing about this fight is fair.',
            accent: '#57d6ff',
            icon: 'radio',
          });
        } else {
          showPowerMessage('▚ NULL WAVE — SIGNAL CORRUPTED', 3000);
        }
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('ARK-07: corrupted firmware in the field', 'wave');
      }
    };
    const deactivateNetWaveEvent = () => {
      if (netWaveEvent === 'none') return;
      netWaveEvent = 'none';
      netWaveEventIntensity = 0;
      setWaveEventUI(null);
      setWaveEventOverlay(null);
      // Strip every live surge halo now — the eased surgeVisual fade-out
      // handles the material red-shift, but the wrappers come off instantly
      // (shared assets: detach only, never dispose here).
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.surgeHalo) { e.surgeHalo.removeFromParent(); e.surgeHalo = undefined; }
      }
    };
    // Host/solo per-wave roll (guests only ever mirror). Difficulty leads both
    // the odds and the severity; NULL WAVEs are rare everywhere but genuinely
    // common on Hard; a 2-wave cooldown keeps events feeling like EVENTS.
    const rollNetWaveEvent = () => {
      wavesSinceNetEvent++;
      if (isTutorialMode || wave < 5 || wavesSinceNetEvent < 3) return;
      const glitchStartWave = classicDifficulty === 'hard' ? 6 : 8;
      const glitchChance = wave >= glitchStartWave
        ? ({ hard: 0.16, medium: 0.08, easy: 0.05, adaptive: 0.10 } as const)[classicDifficulty] ?? 0.08
        : 0;
      const surgeChance = ({ hard: 0.20, medium: 0.15, easy: 0.11, adaptive: 0.16 } as const)[classicDifficulty] ?? 0.15;
      const base = classicDifficulty === 'hard' ? 1.0
        : classicDifficulty === 'easy' ? 0.55
        : classicDifficulty === 'adaptive' ? 0.85
        : 0.75;
      const intensity = Math.min(1.25, base * (1 + Math.min(wave, 30) * 0.008));
      const roll = Math.random();
      if (roll < glitchChance) activateNetWaveEvent('glitch', intensity);
      else if (roll < glitchChance + surgeChance) activateNetWaveEvent('surge', intensity);
    };

    const spawnWavePowerUps = () => {
      // Counts against the SAME per-wave budget as enemy loot (it used to be a
      // free extra on top of it), so the milestone crate can't push a wave over
      // its ceiling.
      if (wavePowerupDrops >= wavePowerupCap) return;
      const spot = findPickupSpot(camera.position.x, camera.position.z, 20, 35);
      spawnPickup(spot.x, spot.z, randomLoot());
      wavePowerupDrops++;
    };

    // ── WAVE SHAPES ──────────────────────────────────────────────────────
    //
    // Every wave used to have the identical structure: a 5-enemy opening
    // burst, then the same trickle of the same weighted mix from the same
    // distance. Wave 30 was wave 8 with bigger numbers, so the run had no
    // texture — only escalation.
    //
    // A shape re-weights the archetype roll, the spawn distance and the
    // trickle pacing, so waves feel categorically different and ask for
    // different play: back off and funnel a HORDE, focus fire an ELITE wave,
    // keep moving and break line-of-sight in a SIEGE, spin up fast for an
    // AMBUSH. It reuses the existing spawn machinery entirely — no new
    // enemy types, no new systems, no shader or pool implications.
    type WaveShape = 'standard' | 'horde' | 'elite' | 'siege' | 'ambush';
    interface WaveShapeDef {
      /** Multiplies the wave's total enemy budget. */
      countMult: number;
      /** Multiplies the continuous-spawn interval (lower = faster trickle). */
      intervalMult: number;
      /** Multiplies spawn distance from the player. */
      distMult: number;
      /** Fraction of the wave budget released in the opening burst. */
      openingFrac: number;
      /** Additive bias on the archetype roll. */
      bias: { fast: number; tank: number; ranged: number };
      intro?: { name: string; tag: string; blurb: string; accent: string };
    }
    const WAVE_SHAPES: Record<WaveShape, WaveShapeDef> = {
      standard: {
        countMult: 1, intervalMult: 1, distMult: 1, openingFrac: 0.18,
        bias: { fast: 0, tank: 0, ranged: 0 },
      },
      horde: {
        // Many weak bodies, fast and close. Punishes standing still.
        countMult: 1.55, intervalMult: 0.6, distMult: 0.85, openingFrac: 0.3,
        bias: { fast: 0.22, tank: -0.14, ranged: -0.08 },
        intro: {
          name: 'Horde', tag: 'WAVE · OVERWHELM',
          blurb: 'A flood of light units, close and fast. Back off, funnel them, and keep the magazine fed.',
          accent: '#f87171',
        },
      },
      elite: {
        // Few, heavy, all at once. Rewards focus fire and burst damage.
        countMult: 0.55, intervalMult: 1.8, distMult: 1.0, openingFrac: 0.7,
        bias: { fast: -0.2, tank: 0.34, ranged: 0.04 },
        intro: {
          name: 'Elite Guard', tag: 'WAVE · HEAVY',
          blurb: 'Fewer enemies, far more armour. Focus fire and make every shot count.',
          accent: '#4ade80',
        },
      },
      siege: {
        // Ranged-heavy and distant. Forces movement and cover.
        countMult: 0.9, intervalMult: 1.15, distMult: 1.3, openingFrac: 0.25,
        bias: { fast: -0.06, tank: -0.06, ranged: 0.3 },
        intro: {
          name: 'Siege', tag: 'WAVE · RANGED',
          blurb: 'Snipers holding the long lines. Keep moving and break their line of sight.',
          accent: '#6effff',
        },
      },
      ambush: {
        // Spawns in close on every bearing with almost no warning.
        countMult: 0.85, intervalMult: 1.3, distMult: 0.55, openingFrac: 0.65,
        bias: { fast: 0.16, tank: 0.04, ranged: -0.1 },
        intro: {
          name: 'Ambush', tag: 'WAVE · CLOSE CONTACT',
          blurb: 'They are already inside the treeline. Spin up fast and check your back.',
          accent: '#fbbf24',
        },
      },
    };
    let waveShape: WaveShape = 'standard';
    let waveShapeDef: WaveShapeDef = WAVE_SHAPES.standard;
    // Don't repeat a special shape back-to-back — the variety is the point.
    let lastSpecialShape: WaveShape | null = null;

    /** Pick this wave's shape. Early waves stay standard so the player learns
     *  the baseline before it starts getting bent. */
    const rollWaveShape = (): WaveShape => {
      if (isTutorialMode || wave < 4) return 'standard';
      // ~45% of waves from wave 4 get a shape; the rest stay standard so the
      // specials keep their identity.
      if (Math.random() > 0.45) return 'standard';
      const pool: WaveShape[] = ['horde', 'elite', 'ambush'];
      // Siege needs the ranged archetype to exist (it unlocks at wave 4).
      if (wave >= 5) pool.push('siege');
      const choices = pool.filter((s) => s !== lastSpecialShape);
      return choices[Math.floor(Math.random() * choices.length)];
    };

    const spawnWave = () => {
      // Reset the per-wave power-up budget. Waves 1–2 get a SINGLE drop, wave 3+
      // at most two — and that ceiling counts the milestone wave crate, so a
      // wave can never put more than two crates on the ground no matter how
      // many kills it takes. Combined with the live cap and the TTL, loot now
      // arrives as an event you go and get, not a stream you walk through.
      // Tutorial keeps a steady paced trickle (it's teaching the mechanic).
      // `killsSinceLastDrop` starts at 0 so the opening kills can't insta-drop.
      wavePowerupDrops = 0;
      killsSinceLastDrop = 0;
      wavePowerupCap = isTutorialMode ? 99
        : wave <= 2 ? 1
        : 2;
      // Scavenger perk — pad the per-wave power-up budget so drops rain down.
      if (!isTutorialMode && perkBonuses.powerupLuckMult > 1) {
        wavePowerupCap = Math.round(wavePowerupCap * perkBonuses.powerupLuckMult) + 1;
      }
      if (isTutorialMode) {
        // Tutorial — no wave progression. While the guided drill is running the
        // arena opens EMPTY: the drill stages exactly what each step needs on
        // demand (see the step-sync block below), and a robot wandering past
        // while the player is still learning to look around is pure noise.
        // Free-roam (drill finished or ended) gets the small starter group,
        // then continuousSpawn() takes over with a gentle trickle.
        if (!tutorialGuidedOn) spawnEnemyBatch(2);
        return;
      }
      // ── ARK-07 roll — decides whether THIS wave arrives overclocked
      // (OVERDRIVE SURGE) or corrupted (NULL WAVE) before any of it spawns,
      // so the spawn-time HP scale in createEnemy sees the live modifier.
      rollNetWaveEvent();
      // Solo / multiplayer — a finite, fully clearable wave. The opening
      // burst spawns now; continuousSpawn() trickles in the rest.
      // Wave size: 7 + wave*3 (was 10 + wave*5) — smaller waves so the
      // pace stays manageable, especially on Easy.
      // Roll this wave's SHAPE before sizing it — the shape scales the budget,
      // the opening burst, the spawn distance and the archetype mix.
      waveShape = rollWaveShape();
      waveShapeDef = WAVE_SHAPES[waveShape];
      if (waveShape !== 'standard') {
        lastSpecialShape = waveShape;
        const intro = waveShapeDef.intro;
        if (intro) {
          setEnemyIntro({
            id: Date.now(),
            name: intro.name,
            tag: intro.tag,
            blurb: intro.blurb,
            accent: intro.accent,
            icon: 'crosshair',
          });
          soundManager.play('powerUp', 0.7, false, 0.95);
        }
      }
      waveEnemiesRemaining = Math.max(4, Math.floor(
        (7 + wave * 3) * diffSettings.spawnMult * (runMods.enemySpawnMult ?? 1) * waveShapeDef.countMult,
      ));
      // Elite/Ambush waves front-load most of the budget; Horde keeps a long
      // pressure trickle. Still capped so no shape can blow the pool cap.
      const opening = Math.min(
        Math.max(3, Math.round(waveEnemiesRemaining * waveShapeDef.openingFrac)),
        waveEnemiesRemaining,
        8,
      );
      waveEnemiesRemaining -= spawnEnemyBatch(opening);
      // ── BOSS ERA (difficulty-scaled start) ────────────────────────────
      // From `bossStartWave` (Hard 5 / Medium 7 / Adaptive 8 / Easy 10) the pink
      // SUMMONER BOSS appears EVERY wave — the apex threat that calls in its own
      // reinforcements (intro banner fires once, inside spawnEnemyBatch). Its
      // strength scales with the wave (per-wave health/damage/speed ramp in
      // createEnemy) so each round is harder than the last — true even on Easy.
      // The 5-wave milestones drop a SECOND boss for a spike. Before the boss
      // era, the 5-wave milestone is a crowned mini-boss tank, easing the player in.
      // Spaced to every SECOND wave (and every wave from 20, where the player
      // is expected to be geared for it). Appearing on literally every wave
      // from wave 5-10 onward meant the apex threat stopped being an event by
      // wave 8 — there was no escalation beat left to spend. Milestone waves
      // still double up for a genuine spike.
      const bossThisWave = wave >= bossStartWave
        && (wave >= 20 || (wave - bossStartWave) % 2 === 0 || wave % 5 === 0);
      if (bossThisWave) {
        spawnEnemyBatch(1, 'boss');
        if (wave % 5 === 0) spawnEnemyBatch(1, 'boss');
        // Non-positional on purpose: the roar announces the boss's ARRIVAL
        // before the player has any idea where it is. Slight delay so it lands
        // after the wave banner rather than under it.
        window.setTimeout(() => {
          if (!isSceneDisposed && !isGameOver) soundManager.play('boss_roar', 0.85, false, 0.95);
        }, 450);
      } else if (wave > 0 && wave % 5 === 0) {
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

      // ── REVENANT (apex trickster) — appears RELIABLY across EVERY difficulty
      // (it was effectively absent on Easy before: too low a chance + gated
      // behind Easy's late boss wave). Now a UNIFORM chance from a fixed early
      // wave so Easy/Medium/Hard/Adaptive all consistently encounter it. Still
      // 1–2 per wave, capped at 2 alive so it never swarms. Solo only (never MP).
      // Its DIFFICULTY is what's difficulty-scaled (much gentler on Easy — see
      // the easyElite / easyRev tuning), NOT how often it shows up.
      const REVENANT_START_WAVE = 6;
      if (!isMultiplayer && wave >= REVENANT_START_WAVE) {
        const revWaveChance = 0.4; // common + uniform in all modes
        const aliveRev = enemies.reduce((n, e) => n + (e.type === 'revenant' && !e.dead ? 1 : 0), 0);
        if (aliveRev < 2 && Math.random() < revWaveChance) {
          const want = 1 + (Math.random() < 0.33 ? 1 : 0); // 1, sometimes 2
          const got = spawnEnemyBatch(Math.min(want, 2 - aliveRev), 'revenant');
          if (got > 0 && !revenantIntroFired) {
            revenantIntroFired = true;
            setEnemyIntro({
              id: Date.now(),
              name: 'Revenant',
              tag: 'APEX · TRICKSTER',
              blurb: 'A gold-shielded blink-hunter that phases off your fire and self-heals. Catch it OFF-GUARD (shield down), blow an explosive next to it, or turn a Subverted enemy on it.',
              accent: '#ffc24a',
              icon: 'crown',
            });
            soundManager.play('powerUp', 0.8, false, 1.5);
          }
        }
      }
      // ── TACTICAL ARCHETYPES (solo only) ───────────────────────────────
      // Introduced one at a time on a ladder so the player learns each
      // lesson in isolation before they start combining. Each fires its
      // intro banner once (the same teaching pattern every other archetype
      // in the game uses), and all of them respect the pool cap.
      if (!isMultiplayer && !isTutorialMode) {
        const archetypeGate: Array<{
          type: PooledEnemyType; startWave: number; chance: number; maxAlive: number;
          intro: { name: string; tag: string; blurb: string; accent: string };
        }> = [
          {
            type: 'bulwark', startWave: 5, chance: 0.5, maxAlive: 2,
            intro: {
              name: 'Bulwark', tag: 'ARMOURED · FRONTAL SHIELD',
              blurb: 'Its shield eats anything hitting the front arc. Flank it — shots from the side or behind land in full.',
              accent: '#5fd8ff',
          },
          },
          {
            type: 'leaper', startWave: 7, chance: 0.45, maxAlive: 3,
            intro: {
              name: 'Leaper', tag: 'AMBUSHER · POUNCE',
              blurb: 'It crouches and howls before it springs — and it clears cover. Move the moment you hear it; it is wide open when it lands.',
              accent: '#ff8c2e',
          },
          },
          {
            type: 'howler', startWave: 9, chance: 0.4, maxAlive: 2,
            intro: {
              name: 'Howler', tag: 'SUPPORT · OVERSHIELD',
              blurb: 'It never attacks — it shields everything around it. Kill it first or nothing else will die.',
              accent: '#d08cff',
          },
          },
          {
            type: 'splitter', startWave: 11, chance: 0.4, maxAlive: 2,
            intro: {
              name: 'Splitter', tag: 'HOST · SPLITS ON DEATH',
              blurb: 'Bursts into three runners when it dies. Do not pop it in your face — kill it at range, ideally with splash.',
              accent: '#b6ff5a',
          },
          },
        ];
        for (const gate of archetypeGate) {
          if (wave < gate.startWave) continue;
          if (Math.random() >= gate.chance) continue;
          const alive = enemies.reduce((n, e) => n + (e.type === gate.type && !e.dead ? 1 : 0), 0);
          if (alive >= gate.maxAlive) continue;
          const got = spawnEnemyBatch(1, gate.type);
          if (got > 0 && !archetypeIntroFired.has(gate.type)) {
            archetypeIntroFired.add(gate.type);
            setEnemyIntro({
              id: Date.now(),
              name: gate.intro.name,
              tag: gate.intro.tag,
              blurb: gate.intro.blurb,
              accent: gate.intro.accent,
              icon: 'crosshair',
            });
            soundManager.play('powerUp', 0.8, false, 1.2);
          }
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

    // The opening drills (look / walk / sprint / first shot) need ZERO enemies
    // — they're about the controls, and a robot wandering in only distracts.
    // From the `kill` step onward the player is actively fighting, so ambient
    // enemies keep flowing (gently) on top of the exact per-step guarantees in
    // the step-sync block, or the later drills run out of things to shoot.
    const TUTORIAL_QUIET_STEPS = new Set(['look', 'move', 'sprint', 'shoot']);

    const continuousSpawn = () => {
      // Guests never spawn — their enemies are mirrored from the host.
      if (isMpGuest) return;
      const currentTime = Date.now();

      if (isTutorialMode) {
        if (tutorial.isActive()) {
          // Guided tutorial: PLANNED, not chaotic. Stay silent for the early
          // non-combat steps; once combat practice starts, keep a steady but
          // gentle supply flowing (on top of the exact per-step guarantees in
          // the step-sync block below) rather than going fully quiet, which
          // would strand kill/headshot/combo practice with nothing to fight.
          const stepId = tutorial.getCurrentStep()?.id;
          if (!stepId || TUTORIAL_QUIET_STEPS.has(stepId)) return;
          const guidedInterval = 4200;
          if (currentTime - lastSpawnTime <= guidedInterval) return;
          if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies() || !smartEnemyManager.canSpawnMore()) return;
          spawnEnemyBatch(1);
          lastSpawnTime = currentTime;
          return;
        }
        // Guided tutorial skipped or finished — enemies resume "naturally",
        // but at a deliberately gentle, well-paced trickle, slower and
        // lighter than the old constant 2.6s/2-3 drip.
        const freeRoamInterval = 5200;
        if (currentTime - lastSpawnTime <= freeRoamInterval) return;
        if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies() || !smartEnemyManager.canSpawnMore()) return;
        spawnEnemyBatch(1);
        lastSpawnTime = currentTime;
        return;
      }

      // Shape sets the trickle pace: a Horde keeps constant pressure, an Elite
      // wave arrives almost entirely up front and then goes quiet.
      const spawnInterval = spawnSettings.interval * waveShapeDef.intervalMult;
      if (currentTime - lastSpawnTime <= spawnInterval) return;
      if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies() || !smartEnemyManager.canSpawnMore()) return;

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
    const movingRaw = (action: keyof KeyBindings): boolean => {
      const alt = ARROW_FALLBACK[action];
      return held(action) || (alt ? !!keys[alt] : false);
    };
    // Walking is the first thing the guided tutorial hands over, so until it
    // does, the four direction keys read as "not pressed". Photo Mode drives
    // its free camera through the same helper and is never part of the drill,
    // so it always sees the raw keys.
    // Timestamp (ms) until which the player is ROOTED in place — currently set
    // only by a Leaper's landed pounce. Deliberately short: it punishes missing
    // the tell without ever taking control away long enough to feel unfair, and
    // it never blocks looking or shooting, only stepping.
    let playerRootedUntil = 0;
    const moving = (action: keyof KeyBindings): boolean => {
      if (tutorialLocks.move && !photoModeRef.current) return false;
      if (playerRootedUntil > 0 && Date.now() < playerRootedUntil && !photoModeRef.current) return false;
      return movingRaw(action);
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

    // (Tactical slide removed by request — crouch is a plain toggle again.)
    // Current bush-wade movement multiplier (1 = clear ground). Recomputed each
    // frame in the movement block and reused by the footstep rustle below.
    let bushSlowMul = 1;

    // ── WEAPON BLOOM (movement + sustained-fire spread) ──────────────────
    // Firing while on the move throws shots off; holding auto-fire opens the
    // cone up further. These mirror the per-frame movement state out of the
    // render loop so shoot() (trigger-driven) and the dynamic crosshair (per
    // frame) read the SAME stance — what you see is what you get. fireBloom
    // builds per shot in shoot() and decays in the loop.
    let moveStateMoving = false;   // any directional input this frame
    let moveStateRunning = false;  // sprinting this frame
    let fireBloom = 0;             // 0..1 sustained-fire bloom

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
    // 0 = folded flat against the panel, 1 = wings + skirt locked open. Runs
    // slightly BEHIND the raise so the panel comes up first and then visibly
    // unfolds in the hand, which is the whole read of a collapsible shield.
    let shieldDeploy = 0;
    // Reusable temps for the per-hit frontal-block test (avoid per-hit allocs).
    const _shieldFwd = new THREE.Vector3();
    const _shieldToEnemy = new THREE.Vector3();
    const _shieldHitPos = new THREE.Vector3();
    // Reused world-space point + direction for the first-person "you got hit"
    // impact flash (dedicated temps so they never clobber the loop's _tempVec3).
    const _impactPos = new THREE.Vector3();
    const _impactDir = new THREE.Vector3();

    // ── HELD POWER-UP INVENTORY (one slot, loot-driven) ──────────────────────
    // The player holds AT MOST ONE looted power at a time. Walking over a loot
    // crate stows the power (it is NOT auto-applied); pressing E activates it,
    // emptying the slot. While a power is held, new crates can't be collected —
    // the player must spend the current one first. Truly random per drop.
    type HeldPower = 'ammo' | 'speed' | 'damage' | 'shield' | 'infinite_ammo' | 'overcharge' | 'phantom'
      | 'cryo' | 'tesla' | 'shockwave' | 'health' | 'nuke';
    // Flat HP restored by a Health pickup / Health airdrop. A meaningful chunk so
    // it's a real lifeline (fairness), but not a full reset.
    const HEALTH_PICKUP_AMOUNT = 50;
    // The uniform loot pool deliberately EXCLUDES 'nuke' — the nuke is a rare
    // special roll handled separately in randomLoot so it stays a treat, not a
    // 1-in-N staple. cryo / tesla / shockwave are universal, map-agnostic combat
    // tools (crowd-control + AoE) that fit every biome. 'health' is in the pool
    // (user-requested healing) so the run stays survivable.
    const LOOT_POOL: HeldPower[] = ['ammo', 'speed', 'damage', 'shield', 'infinite_ammo', 'overcharge', 'phantom',
      'cryo', 'tesla', 'shockwave', 'health'];
    const POWER_LABELS: Record<HeldPower, string> = {
      ammo: 'Ammo', speed: 'Speed', damage: 'Damage', shield: 'Shield',
      infinite_ammo: 'Inf. Ammo', overcharge: 'Overcharge', phantom: 'Phantom',
      cryo: 'Cryo Freeze', tesla: 'Tesla Coil', shockwave: 'Shockwave', health: 'Health', nuke: 'Nuke',
    };
    // ~5% of drops are a tactical nuke (rare); the rest roll the uniform pool.
    const NUKE_LOOT_CHANCE = 0.05;
    const randomLoot = (): HeldPower =>
      Math.random() < NUKE_LOOT_CHANCE ? 'nuke' : LOOT_POOL[(Math.random() * LOOT_POOL.length) | 0];
    let heldPower: HeldPower | null = null;
    let lastHeldHintAt = 0; // throttles the "use your power first" hint
    // Activation-burst accent per power (null = no burst; the nuke owns its own
    // cinematic VFX). Matches each pickup's signature colour for instant read.
    const POWER_BURST_COLOR: Record<HeldPower, number | null> = {
      ammo: 0xffd54a,
      speed: 0x6ef0ff,
      damage: 0xff8a3a,
      shield: 0x55b0ff,
      infinite_ammo: 0xff5aff,
      overcharge: 0xffcc33,
      phantom: 0xb388ff,
      cryo: 0x8fe6ff,
      tesla: 0xfff27a,
      shockwave: 0xffe0a0,
      health: 0x4dff7a,
      nuke: null,
    };
    const _burstFeet = new THREE.Vector3();

    // Activate a looted power's effect (the slot is emptied by the caller).
    // Hoisted so the keydown handler (defined earlier) can call it.
    function applyPower(type: HeldPower) {
      const nowMs = Date.now();
      switch (type) {
        case 'overcharge':
          overchargeActive = true;
          overchargeEndTime = nowMs + overchargeDuration;
          // An overcharge is a change made TO THE WEAPON, so the player watches
          // their hands make it: the support hand comes off the handguard, rolls
          // the gas regulator past its stop and cycles the action. Purely
          // cosmetic here — the buff above has already landed, and the retune's
          // `lock` cue is gated on `overclockCastPending` so a looted overcharge
          // can never hand a passing Operative their signature ability for free.
          gunModel.triggerOverclock();
          showPowerMessage('Overcharge · faster fire & damage');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overcharge Active!', 'powerup');
          createParticles(camera.position, 0xffcc33, 22);
          break;
        case 'ammo':
          ammo = effectiveMaxAmmo(currentWeapon);
          // Magazines do not refill themselves: play the weapon's own reload
          // choreography so the hands visibly swap one in. Visual only — the
          // count above is already restored, and a real reload in progress owns
          // the viewmodel, so we never stomp it.
          if (!isReloading) gunModel.triggerReload(0.85, 8, 'tactical', 0);
          showPowerMessage('Ammo Refilled');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Ammo Refilled', 'powerup');
          createParticles(camera.position, 0xffd54a, 12);
          break;
        case 'health': {
          // Restore a solid chunk of HP (capped at max). Player-requested
          // healing so runs stay survivable / fair.
          const before = health;
          health = Math.min(playerMaxHealth, health + HEALTH_PICKUP_AMOUNT);
          const healed = Math.round(health - before);
          showPowerMessage(healed > 0 ? `+${healed} Health` : 'Health Full');
          if (gameSettingsManager.getSetting('killFeed') && healed > 0) addKillFeedEntry(`+${healed} Health`, 'powerup');
          createParticles(camera.position, 0x4dff7a, 18);
          updateGameState();
          if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
          break;
        }
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
          // The feed is converted on the weapon, in the hands — same cosmetic
          // retune as the overcharge above (see the note there).
          gunModel.triggerOverclock();
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
        case 'cryo': {
          const frozen = applyCryoBlast(camera.position);
          showPowerMessage(frozen > 0 ? `Cryo Freeze · ${frozen} frozen` : 'Cryo Freeze', 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Cryo Freeze!', 'powerup');
          break;
        }
        case 'shockwave': {
          const staggered = applyShockwave(camera.position);
          fovPunch = Math.min(fovPunch + 9, 14);
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          showPowerMessage(staggered > 0 ? `Shockwave · ${staggered} blasted` : 'Shockwave', 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Shockwave!', 'powerup');
          break;
        }
        case 'tesla':
          teslaActive = true;
          teslaEndTime = nowMs + teslaDuration;
          teslaNextArcAt = nowMs; // arc immediately on activation
          showPowerMessage('Tesla Coil · chain lightning · 8s', 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Tesla Coil Active!', 'powerup');
          break;
        case 'nuke': {
          // Tactical Nuke — a deployable mushroom-cloud blast that clears a
          // large area around the player (player shielded from their own boom).
          const kills = detonateNuke(camera.position);
          showPowerMessage(`Tactical Nuke · ${kills} eliminated`, 2400);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Tactical Nuke · ${kills} kills`, 'powerup');
          break;
        }
      }
      // Quick cast flourish — a theme-coloured AAA activation burst (core
      // flash + twin ground shockwave rings + rising energy pillar + spark
      // motes) at the player's feet. Every power gets one except the nuke,
      // which already has its full cinematic mushroom-cloud VFX.
      gunModel.triggerAbility();
      soundManager.play('powerUp', 0.7);
      const burstColor = POWER_BURST_COLOR[type];
      if (burstColor !== null) {
        abilitySystem.createActivationBurst(
          scene,
          _burstFeet.set(camera.position.x, camera.position.y - currentCameraHeight, camera.position.z),
          burstColor,
        );
      }
    }

    // ── ANTI-STACK GUARD ──────────────────────────────────────────────────
    // Powers fall into two classes: instant (ammo — applies once, no timer) and
    // timed (speed/damage/shield/infinite_ammo/overcharge/phantom — run for a
    // duration). To stop the player layering several buffs at once, a timed
    // power can only be activated when NO other timed effect is currently
    // running. Instant powers are always allowed. `isTimedPower` and
    // `anyTimedEffectActive` are the single source of truth for that rule.
    // Instant powers (applied once, no lingering timer): ammo refill + the
    // tactical nuke. Everything else runs for a duration and is anti-stacked.
    // Instant powers (applied once, no lingering timer): ammo, the tactical
    // nuke, and the two AoE crowd-control casts (cryo + shockwave). Tesla is
    // timed (an aura), so it IS anti-stacked.
    const isTimedPower = (p: HeldPower): boolean =>
      p !== 'ammo' && p !== 'nuke' && p !== 'cryo' && p !== 'shockwave' && p !== 'health';
    function anyTimedEffectActive(): boolean {
      return speedBoostActive || damageBoostActive || shieldActive
        || infiniteAmmoActive || overchargeActive || phantomActive || teslaActive;
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
        case 'health': {
          // Streak Health airdrop — a bigger heal than the world med-pack so a
          // hot streak is a real second wind (fairness).
          const before = health;
          health = Math.min(playerMaxHealth, health + 75);
          const healed = Math.round(health - before);
          showPowerMessage(healed > 0 ? `+${healed} Health` : 'Health Full', 2200);
          if (gameSettingsManager.getSetting('killFeed') && healed > 0) addKillFeedEntry(`+${healed} Health`, 'powerup');
          createParticles(camera.position, 0x4dff7a, 26);
          updateGameState();
          if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
          break;
        }
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
          // Mystery Box — always an UPGRADE: a weapon HIGHER in the tier order
          // than the one you're holding (WEAPONS is defined in ascending unlock
          // tier). Prefer a still-LOCKED higher gun (a genuinely new weapon);
          // otherwise hand the best higher-tier gun available. The caller already
          // suppresses this reward entirely once every weapon is unlocked.
          const ordered = Object.keys(WEAPONS);          // tier order
          const curIdx = ordered.indexOf(currentWeapon);
          const higher = ordered.filter((_, i) => i > curIdx);
          const lockedHigher = higher.filter((w) => !unlockedWeapons.includes(w));
          const pick = lockedHigher[0]                   // next new upgrade
            ?? ordered.filter((w) => !unlockedWeapons.includes(w)).pop() // any locked gun
            ?? higher[higher.length - 1]                 // top higher-tier (already owned)
            ?? ordered[ordered.length - 1];              // last resort
          if (!unlockedWeapons.includes(pick)) unlockedWeapons.push(pick);
          currentWeapon = pick;
          ammo = effectiveMaxAmmo(pick);
          gunModel.switchWeapon(pick as GunWeaponType);
          setGunFillForWeapon(pick);
          refreshMasteryBonus();
          showPowerMessage(`Mystery Box · ${WEAPONS[pick].name}`, 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Mystery: ${WEAPONS[pick].name}`, 'powerup');
          createParticles(camera.position, 0xbb33ff, 22);
          updateGameState();
          break;
        }
        case 'nuke': {
          // 20-streak reward — the cinematic mushroom-cloud blast (full VFX +
          // big-area damage, player shielded), then a GLOBAL mop-up so the
          // streak nuke keeps its "vaporise the whole wave" identity. Each kill
          // is credited so score / streak / mission progress all tick up.
          let nuked = detonateNuke(camera.position, 90);
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead || e.health <= 0) continue;
            e.health = 0;
            handleEnemyKilled(e, false);
            nuked++;
          }
          showPowerMessage(`Tactical Nuke · ${nuked} eliminated`, 2200);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Tactical Nuke · ${nuked} kills`, 'powerup');
          break;
        }
        case 'frenzy': {
          // 25-streak reward — an all-out offensive surge: rapid fire AND
          // doubled damage at once. Reuses the existing timed-effect states so
          // it inherits their expiry + HUD wiring with no new bookkeeping.
          rapidFireActive = true;
          rapidFireEndTime = nowMs + rapidFireDuration;
          damageBoostActive = true;
          damageBoostEndTime = nowMs + damageBoostDuration;
          showPowerMessage('Frenzy · rapid fire + double damage · 15s', 2400);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Frenzy!', 'powerup');
          createParticles(camera.position, 0xff5a2a, 36);
          triggerKillFlash();
          break;
        }
        case 'juggernaut': {
          // 30-streak reward — a tanky rampage: a full riot shield, a speed
          // surge and an overcharge offensive burst together. Pure reuse of the
          // existing timed states, so no fresh expiry path is introduced.
          // Skip ONLY the shield if the left hand is busy with an armed bomb's
          // detonator (engineer) — the speed + overcharge still land so the
          // reward isn't wasted, and the detonator/shield stay mutually exclusive.
          if (!detonatorOccupiesHand()) {
            shieldActive = true;
            shieldEndTime = nowMs + shieldDuration;
            shieldAbsorb = SHIELD_ABSORB_MAX;
            shieldBreakFlash = 0;
          }
          speedBoostActive = true;
          speedBoostEndTime = nowMs + speedBoostDuration;
          overchargeActive = true;
          overchargeEndTime = nowMs + overchargeDuration;
          showPowerMessage('Juggernaut · shield · speed · overcharge · 15s', 2600);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Juggernaut!', 'powerup');
          createParticles(camera.position, 0x66e0ff, 44);
          triggerKillFlash();
          break;
        }
        default:
          // The other PowerUpType values (health/ammo/speed/damage/shield/
          // infinite_ammo) are handled via the held-power slot; not reachable
          // from the killstreak airdrop pool today.
          break;
      }
      // Applying a power-up next to a barrel sets it off too (same rule as
      // character abilities) — the TNT blasts the player + nearby enemies.
      detonateBarrelsNear(camera.position.x, camera.position.z, 4.5);
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

    // ── ENGINEER REMOTE BOMB (Demolition ability) ────────────────────────
    // The engineer wires a nearby explosive barrel into a remote-detonated bomb:
    // the first ability press ARMS the closest barrel (wiring animation + a
    // detonator/antenna/wire kit grafted onto it); a second press DETONATES it.
    // Only one bomb is armed at a time. Declared here (before detonateBarrel) so
    // the detonation path can clear the reference if the bomb goes off any way.
    let armedBomb: ExplosiveBarrel | null = null;
    // The bomb claimed by a detonate press but not yet fired: it goes off on the
    // frame the THUMB bottoms the plunger out, a few frames later. Claiming it
    // here (and clearing `armedBomb` immediately) is what stops a mashed key
    // double-firing the same drum.
    let pendingDetonation: ExplosiveBarrel | null = null;
    const DEMO_WIRE_RANGE = 5.5;   // how close the engineer must stand to a barrel
    const DEMO_ARM_TIME = 1.0;     // seconds the crouch-and-wire animation takes

    // ── ONE-HANDED LEFT ARM (firing device ⇄ riot shield) ────────────────
    // The Engineer's radio firing device and the riot shield are BOTH carried
    // on the player's left arm, and unlike every other ability prop the device
    // is held INDEFINITELY — for as long as a bomb is live. So this predicate
    // stays deliberately Engineer-specific: it blocks every shield-raise path
    // (loot power-up, killstreak Juggernaut) while a bomb is wired, armed or
    // mid-detonation, and blocks wiring while the shield is up. The other
    // classes' props are up for about a second, and are handled instead by
    // stowing the shield's VISUAL for that beat (see the shield animate block).
    const detonatorOccupiesHand = (): boolean =>
      armedBomb !== null || pendingDetonation !== null || wiringTime > 0
      || (abilityProp?.kind === 'detonator' && abilityProp.occupiesHand());

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
    // ── AIRDROP RARITY GATE ──────────────────────────────────────────────
    // Airdrops were raining down (a crate every ~5–10s on a hot streak). Now
    // they're gated by a long global cooldown so they're a genuine treat, with
    // a SHORTER, separate cooldown for HEALTH so reclaiming HP stays reliable
    // (fairness). Timestamps persist across waves (intentionally — the streak
    // counter resets each wave but the crate cadence shouldn't).
    let lastAirdropAt = 0;        // any non-health airdrop
    let lastHealthAirdropAt = 0;  // health airdrops only
    const AIRDROP_COOLDOWN_MS = 60000;        // 60s between combat/utility crates
    const HEALTH_AIRDROP_COOLDOWN_MS = 30000; // 30s — health is a bit more common

    // ── ABILITY BALANCE BUDGET ───────────────────────────────────────────
    // House rules so no character's signature move is "the best":
    //  • ABILITY_DAMAGE_CAP — the MOST any single ability hit may deal to one
    //    enemy. It one-shots the basic robots (normal/fast/ranged ≈ 30–50 HP)
    //    so a Ranger charge or a Pyro blast still feels lethal, but it can
    //    never delete a tank/boss outright — those are whittled, not skipped.
    //  • MEDIC_TRIAGE_HEAL — the Medic's active is a small field patch, not a
    //    burst heal (was a third of max HP, which felt oppressive).
    const ABILITY_DAMAGE_CAP = 120;
    const MEDIC_TRIAGE_HEAL = 18;

    // ── PYRO FLAME PROJECTOR (Firestorm) ─────────────────────────────────
    // The Pyro's signature is no longer an instantaneous nova but a SUSTAINED
    // 360° jet: the emitter head spins up and throws fire in a ring that widens
    // as the pressure builds, the fuel that lands keeps burning on the ground,
    // and everything it touches carries the flames away with it.
    //
    // Damage budget: direct ticks are small and frequent (a flamethrower does
    // not one-shot, it cooks), the burn is where the payoff is, and a target
    // that steps out of the jet early takes a fraction of the total — the whole
    // point of the power is AREA DENIAL, not a nuke with a different colour.
    const PYRO_BURST_SEC = 1.5;        // how long the valve stays open
    const PYRO_MAX_RADIUS = 13;        // reach of the front at full pressure
    const PYRO_MIN_RADIUS = 3.2;       // reach the instant the valve cracks
    const PYRO_TICK_MS = 200;          // direct-damage cadence inside the jet
    const PYRO_TICK_DAMAGE = 16;
    const PYRO_BURN_MS = 5000;
    const PYRO_BURN_DPS = 9;
    const PYRO_PATCH_LIFE = 6.5;       // seconds a ground fire keeps burning
    const PYRO_PATCH_DPS = 12;
    const PYRO_PATCH_BURN_MS = 2200;   // top-up ignite for standing in the fire
    let pyroBurstTime = -1;            // <0 = idle, else seconds into the burst
    let pyroNextTickAt = 0;
    let pyroNextPatchAt = 0;

    // True only between an Operative CASTING Overclock and the retune's `lock`
    // beat. Looted overcharge / infinite-ammo play the same weapon animation for
    // flavour, and this is what stops those from applying the ability.
    let overclockCastPending = false;

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
    // A charge gets exactly ONE outright kill — the enemy closest to the point
    // of impact. Everything else it bowls through is heavily damaged but lives.
    // Reset on each dash.
    let dashLethalUsed = false;

    // Dispatch the selected character's signature ability (bound ability key).
    // Wherever possible this reuses the game's already-balanced timed-effect
    // machinery (speed boost, riot shield, overcharge, infinite ammo, phantom,
    // rocket blast), so every ability behaves IDENTICALLY across Solo, Tutorial
    // and Multiplayer — the only thing that changes per mode is where the class
    // comes from. Hoisted (function decl) so onKeyDown can call it; it runs only
    // during play, long after every closed-over `const` is initialised.
    function triggerCharacterAbility() {
      const nowMs = Date.now();
      // GENERAL ability-recharge reduction — applies to WHATEVER signature power
      // this character has, not just the Ranger's dash. The "−30% ability
      // recharge" wave perk (perkBonuses.dashCooldownMult), the Cooldown-Mastery
      // skill and the class passive / MP mods all fold in here so every class
      // benefits identically. Floored at 15% of the base so stacked reductions
      // can speed a power up dramatically but never make it spammable. (Field
      // name stays `dashCooldownMult` for back-compat; it now means "ability
      // cooldown".)
      const cd = activeAbility.cooldown
        * Math.max(0.15, 1 + skillBonus('dashCooldown'))
        * perkBonuses.dashCooldownMult
        * (mpMods.dashCooldownMult ?? 1);
      const activeMs = activeAbility.duration * 1000;
      gunModel.cancelInspect(); // an ability cast snaps the gun back from an inspect

      // ── ENGINEER: REMOTE DEMOLITION (two-step — wire, then detonate) ─────
      // First press WIRES the nearest barrel into a remote bomb (cheap, short
      // cooldown so the arm animation finishes before the next press); a later
      // press DETONATES the armed bomb for an engineer-tuned lethal blast (full
      // cooldown). Handled here and returned early so it bypasses the generic
      // cast FX + the "cast near a barrel detonates it" rule (which would blow
      // the bomb we're trying to arm).
      if (activeAbility.id === 'demolition') {
        if (armedBomb) {
          // The bomb is claimed HERE (so a second press can't double-fire it)
          // but it does not go off until the THUMB bottoms the plunger out —
          // see the 'press' beat in abilityPayload. `pendingDetonation` carries
          // it across those few frames.
          pendingDetonation = armedBomb;
          armedBomb = null;
          abilityProp?.press();      // thumb rolls onto the button and drives it
          soundManager.play('reload', 0.5, false, 1.9); // safety cap / trigger travel
          gunModel.triggerAbility();
          abilityCooldown = cd;
          abilityCooldownMax = cd;
          abilityActiveUntil = nowMs + 200;
          tutorial.recordAction('use_ability', 1);
          // Daily ability channel — the Engineer's "use" is the completed
          // wire→detonate cycle, counted here at the detonation (the wire
          // half-step alone doesn't tick it).
          if (dailyEnabled) dailyCounts.ability_use += 1;
          return;
        }
        // Wiring needs the left hand, but the riot shield is braced on that
        // same arm — can't do both. Make the player drop the shield first so
        // the detonator and shield can never be carried together.
        if (shieldActive) {
          showPowerMessage('Lower the shield first — wiring the bomb needs that hand', 1600);
          return; // costs no cooldown
        }
        const target = findNearestBarrel(camera.position.x, camera.position.z, DEMO_WIRE_RANGE);
        if (!target) {
          // Distinguish "nothing here" from "that one, but not that one" —
          // otherwise an Engineer standing inside a relay field, surrounded by
          // drums, gets told there are no barrels nearby and reads it as a bug.
          let coreNearby = false;
          for (let b = 0; b < barrels.length && !coreNearby; b++) {
            const bb = barrels[b];
            if (!bb.irradiated || bb.detonated) continue;
            coreNearby = Math.hypot(bb.mesh.position.x - camera.position.x, bb.mesh.position.z - camera.position.z) <= DEMO_WIRE_RANGE;
          }
          showPowerMessage(
            coreNearby
              ? "ARK-07 core — can't be wired. Shoot it. From a long way off."
              : 'No barrel nearby — stand next to a red barrel',
            1900,
          );
          return; // a whiff costs no cooldown
        }
        wireBomb(target);
        armedBomb = target;
        // Play the "bend over the barrel and wire it up" animation instead of
        // arming instantly: the view dips toward the TNT + the gun drops into a
        // wiring pose for DEMO_ARM_TIME, then the detonator rises into the left
        // hand (driven per-frame from `wiringTime` + `armedBomb`).
        wiringTime = DEMO_ARM_TIME;
        triggerAbilityFlash(activeAbility.color);
        castEffects.push(new AbilityCastEffect(scene, target.mesh.position, 0xff5a36));
        soundManager.play('reload', 0.7); // ratcheting "wiring" click
        showPowerMessage('Bomb armed · press again to detonate');
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Bomb Wired!', 'powerup');
        // Brief cooldown so the wiring animation lands before the detonate press;
        // the full cooldown only applies once the bomb actually goes off (above).
        abilityCooldown = Math.max(1.2, DEMO_ARM_TIME + 0.3);
        abilityCooldownMax = abilityCooldown;
        abilityActiveUntil = nowMs + 200;
        tutorial.recordAction('use_ability', 1);
        return;
      }

      // ── EVERY OTHER ABILITY: START THE MECHANISM ─────────────────────────
      // The keypress no longer applies the power — it starts the piece of
      // equipment that applies it. Each prop's choreography emits a BEAT on the
      // frame its mechanism does its work (needle in, valve open, toggle
      // thrown, charge lever released) and `abilityPayload` hangs the real
      // effect off that beat. Only the bookkeeping that must not be delayed —
      // cooldown, tutorial/daily credit, the "equipment out" cue — stays here.
      switch (activeAbility.id) {
        case 'overclock':
          // Operative — no prop: the weapon IS the mechanism. The support hand
          // comes off the handguard, rolls the gas regulator past its stop and
          // hauls the charging handle; the buff lands on the `lock` cue when the
          // bolt slams back into battery (see gunModel.onOverclockCue). The flag
          // is what separates THIS retune from the purely-cosmetic one a looted
          // overcharge plays — only a real cast may apply the ability.
          overclockCastPending = true;
          gunModel.triggerOverclock();
          soundManager.play('reload', 0.45, false, 1.45);
          break;
        case 'bulwark':
          // Heavy — the shield IS the mechanism: it swings up off the back and
          // its two wings unfold into the braced panel (see the deploy pass in
          // the render loop). Instant, so its payload runs right here.
          abilityPayload('ready');
          break;
        default:
          // dash / adrenaline / triage / firestorm / cloak — all prop-driven.
          abilityProp?.play();
          break;
      }

      // Immediate feel: the haptic thump and the braced weapon flourish belong
      // to the KEYPRESS (the player has to know the input registered); the
      // screen flash, the world cast burst and the camera kick belong to the
      // payload, so they land with the power rather than ahead of it.
      haptic('dash');
      if (activeAbility.id !== 'dash') gunModel.triggerAbility();

      abilityCooldown = cd;
      abilityCooldownMax = cd;
      abilityActiveUntil = nowMs + Math.max(activeMs + abilityWindupMs, 200);
      tutorial.recordAction('use_ability', 1); // advances the ability tutorial step
      if (dailyEnabled) dailyCounts.ability_use += 1; // daily ability channel
    }

    /**
     * THE POWER ITSELF — run from the frame the mechanism acts, not the frame
     * the key was pressed.
     *
     * Every branch is guarded on the beat that physically causes it, so the
     * heal happens when the needle goes in, the fire starts when the valve
     * opens, the cloak engages when the toggle is thrown and the bomb goes off
     * when the thumb bottoms the plunger. Hoisted so the beat handler installed
     * further down (and the Heavy's instant branch above) can both reach it.
     */
    function abilityPayload(beat: AbilityBeat) {
      const nowMs = Date.now();
      // Timed buffs get the wind-up handed back so the choreography is never
      // paid for out of the player's uptime.
      const activeMs = activeAbility.duration * 1000 + abilityWindupMs;
      switch (activeAbility.id) {
        case 'dash': {
          if (beat !== 'slam') return;
          // Ranger — the hip charge unit blows off and the trampling charge
          // launches, plus a brief cinematic time-warp.
          isDashing = true;
          dashTimer = dashDuration;
          dashHitEnemies.clear();
          dashLethalUsed = false;
          // FOV surge — the lens pulls wide for the burst, then the existing
          // per-frame decay eases it back. Reads as raw acceleration.
          fovPunch = Math.min(fovPunch + 8, 10);
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
          // The vent blowing off: a hard pneumatic crack under the player.
          soundManager.play('powerUp', 0.5, false, 2.1);
          // Exhaust plume out of the actuator, at the player's feet.
          _burstFeet.set(camera.position.x, camera.position.y - currentCameraHeight + 0.2, camera.position.z);
          createParticles(_burstFeet, 0xbff4ff, 16);
          gunModel.triggerDash();
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          timeScale = 0.5;
          setTimeout(() => { timeScale = 1.0; }, 100);
          break;
        }
        case 'adrenaline': {
          if (beat !== 'inject') return;
          // Scout — the stim goes in and the surge takes hold immediately.
          speedBoostActive = true;
          speedBoostEndTime = nowMs + activeMs;
          showPowerMessage('Adrenaline · speed surge');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Adrenaline Surge!', 'powerup');
          createParticles(camera.position, 0x6ef0ff, 18);
          soundManager.play('hit', 0.35, false, 2.4);   // the hiss of the injector
          soundManager.play('powerUp', 0.55, false, 1.25);
          break;
        }
        case 'bulwark': {
          if (beat !== 'ready') return;
          // Heavy — braces the riot shield (reuses the frontal-absorb shield).
          shieldActive = true;
          shieldEndTime = nowMs + activeMs;
          shieldAbsorb = SHIELD_ABSORB_MAX;
          shieldBreakFlash = 0;
          shieldDeploy = 0; // replay the unfold from stowed
          showPowerMessage('Bulwark · frontal shield raised');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Bulwark Raised!', 'powerup');
          soundManager.play('reload', 0.6, false, 0.8); // the frame locking open
          break;
        }
        case 'firestorm': {
          // Pyro — a SUSTAINED 360° jet, not a one-frame nova. Three beats:
          // the striker lights the pilot, the main valve opens (the fire
          // starts and runs for PYRO_BURST_SEC), and the valve shuts.
          if (beat === 'ignite') {
            soundManager.play('hit', 0.3, false, 2.6); // striker spark
            return;
          }
          if (beat === 'burst') {
            pyroBurstTime = 0;
            pyroNextTickAt = 0;
            pyroNextPatchAt = 0;
            fireSystem.setJet(true);
            // The IGNITION — unburnt fuel already out of the nozzles catches all
            // at once in a low ring before the steady jet takes over. Reuses the
            // existing (pooled-light, warmup-linked) fire nova for that one beat.
            fireNovas.push(new FireNovaEffect(
              scene,
              new THREE.Vector3(camera.position.x, camera.position.y - currentCameraHeight + 0.4, camera.position.z),
              PYRO_MIN_RADIUS * 1.6,
            ));
            createParticles(camera.position, 0xffb24a, 22);
            soundManager.play('explosion_small', 0.55, false, 0.55); // the woof of ignition
            showPowerMessage('Firestorm · 360° flame · the ground is burning', 2400);
            if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Firestorm!', 'powerup');
            fovPunch = Math.min(fovPunch + 7, 12);
            if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
            break; // fall through to the shared cast FX below
          }
          if (beat === 'flameoff') {
            pyroBurstTime = -1;
            fireSystem.setJet(false);
            soundManager.play('reload', 0.4, false, 0.7); // the valve shutting
          }
          return;
        }
        case 'triage': {
          if (beat !== 'inject') return;
          // Medic — a quick FIELD PATCH, not a burst heal: a small flat top-up
          // administered from the case, delivered on the frame the auto-injector
          // fires. The Medic still leans on its passive out-of-combat regen.
          const triageHeal = Math.min(MEDIC_TRIAGE_HEAL, playerMaxHealth - health);
          health = Math.min(playerMaxHealth, health + MEDIC_TRIAGE_HEAL);
          updateGameState();
          // Broadcast the heal so teammates' clients close this player's wounds.
          if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
          showPowerMessage(`Field Triage · +${Math.max(0, Math.round(triageHeal))} HP`);
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Field Triage!', 'powerup');
          createParticles(camera.position, 0x4dff9e, 14);
          soundManager.play('hit', 0.3, false, 2.2);     // the injector firing
          soundManager.play('powerUp', 0.6);
          break;
        }
        case 'overclock': {
          if (beat !== 'ready') return;
          // Operative — the regulator is past its stop and the bolt is back in
          // battery: unlimited ammo PLUS the overcharge burst, and the magazine
          // is topped off as part of the retune.
          infiniteAmmoActive = true;
          infiniteAmmoEndTime = nowMs + activeMs;
          overchargeActive = true;
          overchargeEndTime = nowMs + activeMs;
          ammo = effectiveMaxAmmo(currentWeapon);
          updateGameState();
          showPowerMessage('Overclock · unlimited ammo + overdrive');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Overclock!', 'powerup');
          createParticles(camera.position, 0xfbbf24, 18);
          break;
        }
        case 'cloak': {
          if (beat !== 'switch') return;
          // Phantom — the toggle is thrown and the emitter takes hold.
          phantomActive = true;
          phantomEndTime = nowMs + activeMs * (mpMods.phantomDurationMult ?? 1);
          showPowerMessage('Cloak · you fade from sight');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Cloak Engaged!', 'powerup');
          soundManager.play('powerUp', 0.55, false, 0.75);
          break;
        }
        case 'demolition': {
          if (beat !== 'press') return;
          const bomb = pendingDetonation;
          pendingDetonation = null;
          if (!bomb || bomb.detonated) return; // shot out from under us
          // Engineer modification: a bigger, reliably-lethal blast vs a stray shot.
          bomb.blastRadius = Math.max(bomb.blastRadius, 9.5);
          bomb.blastDamage = Math.max(bomb.blastDamage, 220);
          detonateBarrel(bomb); // strips the kit + cascades via the chain pump
          triggerAbilityFlash(activeAbility.color);
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          fovPunch = Math.min(fovPunch + 6, 12);
          triggerAbilityCam(-0.09, 0);
          showPowerMessage('Bomb detonated!');
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Remote Detonation!', 'powerup');
          return; // NOT the shared FX below — the blast is its own event, and
                  // detonateBarrelsNear here would chain every other drum nearby
        }
      }

      // ── SIGNATURE-MOVE FX (shared by every payload above) ────────────────
      // Tinted screen pulse + a world-space cast burst (ground ring + rising
      // pillar + sparks) in the ability's own accent colour, plus a per-ability
      // CAMERA KICK that gives each power a distinct physical "tell" in
      // first-person — the Ranger dips into a forward lunge, the Heavy braces
      // into a crouch, the Pyro bucks up off the jet, and so on.
      triggerAbilityFlash(activeAbility.color);
      const castColor = parseInt(activeAbility.color.replace('#', ''), 16) || 0x22d3ee;
      castEffects.push(new AbilityCastEffect(scene, camera.position, castColor));
      switch (activeAbility.id) {
        case 'dash':       triggerAbilityCam(0.17, (Math.random() < 0.5 ? 1 : -1) * 0.07); break;
        case 'bulwark':    triggerAbilityCam(0.13, 0); break;
        case 'triage':     triggerAbilityCam(0.08, 0); break;
        case 'firestorm':  triggerAbilityCam(-0.11, 0); break;
        case 'adrenaline': triggerAbilityCam(-0.07, 0.04); break;
        case 'overclock':  triggerAbilityCam(-0.05, 0.03); break;
        case 'cloak':      triggerAbilityCam(-0.03, 0); break;
      }
      if (activeAbility.id !== 'firestorm' && activeAbility.id !== 'triage'
        && activeAbility.id !== 'adrenaline' && activeAbility.id !== 'cloak') {
        soundManager.play('powerUp', 0.7);
      }

      // A power going off next to a barrel sets it off — the surge of energy
      // ignites the TNT, which then blasts the player + nearby enemies. (The
      // Ranger's dash additionally lights up every barrel along its charge path,
      // handled in the dash movement block.)
      detonateBarrelsNear(camera.position.x, camera.position.z, 4.5);
    }

    // ── ABILITY BEAT WIRING ────────────────────────────────────────────────
    // The prop's choreography and the weapon's overclock retune both push their
    // mechanical beats into `abilityPayload`. Installed once, here, so there is
    // exactly one place where a mechanism is allowed to cause a power.
    if (abilityProp) abilityProp.onBeat = abilityPayload;
    gunModel.onOverclockCue = (cue) => {
      switch (cue) {
        case 'grab': soundManager.play('reload_magout', 0.32, false, 1.5); break;
        case 'dial': soundManager.play('reload_pin', 0.40, false, 1.25); break;
        case 'rack': soundManager.play('reload_bolt', 0.48, false, 1.1); break;
        case 'lock':
          soundManager.play('reload_magin', 0.55, false, 1.2);
          // The bolt is home — THAT is the overclock. Only for a real cast: the
          // same animation is played cosmetically by looted overcharge/infinite
          // ammo, and those must not hand out the signature ability.
          if (overclockCastPending) {
            overclockCastPending = false;
            abilityPayload('ready');
          }
          break;
      }
    };

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');   // base aim (mouse only)
    // Previous frame's look angles — differenced each frame to drive the
    // viewmodel's inertia spring (see GunModel.updateInertia), which is what
    // gives the weapon its sense of mass when you swing the view around.
    let prevLookYaw = 0;
    let prevLookPitch = 0;
    // Last aperture value written to the scope overlay, so a steady scope
    // doesn't re-trigger a full-screen gradient repaint every frame.
    let scopeApfLast = '';
    const PI_2 = Math.PI / 2;
    // Camera recoil — a transient kick added on top of the mouse aim each
    // shot, then smoothly recovered. Decoupled from `euler` so it never
    // fights the player's mouse input.
    let recoilPitch = 0;
    let recoilYaw = 0;
    const _recoilEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    // ── ABILITY CAMERA KICK ──────────────────────────────────────────────
    // A transient pitch (dip/lift) + roll layered onto the camera when an
    // ability fires, then eased back. It's what sells the move in first-person:
    // the Ranger's Dash DIPS the view down and rolls into a forward lunge ("bend
    // down and charge"), Bulwark drops into a braced crouch, Firestorm bucks up
    // from the blast, etc. `triggerAbilityCam(pitch, roll)` sets the target; the
    // render loop springs the live values toward 0.
    let abilityKickPitch = 0; // + = view dips DOWN (crouch/charge), − = lifts
    let abilityKickRoll = 0;
    const triggerAbilityCam = (pitch: number, roll: number) => {
      abilityKickPitch = pitch;
      abilityKickRoll = roll;
    };

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
    // ── ACTIVE RELOAD (perfect-timing window) ────────────────────────────
    // Gears-style skill check: the crosshair reload ring carries a marked
    // sweet-spot arc — tapping R again while the sweep is inside it snaps the
    // rest of the reload to ~0.2s (the hands visibly fast-forward). One
    // attempt per reload; missing the window just does nothing beyond a dull
    // click (friendly — no jam penalty). Window fractions are mirrored into
    // the ring UI so what you see is exactly what's judged.
    const ACTIVE_RELOAD_START = 0.42;
    const ACTIVE_RELOAD_END = 0.62;
    const ACTIVE_RELOAD_SNAP_MS = 200;
    let reloadStartedAt = 0;      // ms timestamp the running reload began
    let reloadTotalMs = 0;        // full duration of the running reload
    let reloadMaxTarget = 0;      // mag size the running reload will fill to
    let reloadAttemptUsed = false;
    // Shared completion for both the natural timeout and a perfect snap.
    const completeReload = () => {
      reloadTimeoutId = null;
      ammo = reloadMaxTarget;
      isReloading = false;
      setReloadDurationUI(null);
      updateGameState();
    };
    const attemptActiveReload = () => {
      if (!isReloading || reloadAttemptUsed || paused || isGameOver) return;
      const frac = (Date.now() - reloadStartedAt) / Math.max(1, reloadTotalMs);
      // Ignore taps in the opening moments — an accidental double-tap of R
      // shouldn't silently burn the attempt before the ring even reads.
      if (frac < 0.12) return;
      reloadAttemptUsed = true;
      if (frac >= ACTIVE_RELOAD_START && frac <= ACTIVE_RELOAD_END) {
        // PERFECT — fast-forward the hands and finish almost immediately.
        if (reloadTimeoutId !== null) window.clearTimeout(reloadTimeoutId);
        reloadTimeoutId = window.setTimeout(completeReload, ACTIVE_RELOAD_SNAP_MS);
        gunModel.accelerateReload(ACTIVE_RELOAD_SNAP_MS / 1000);
        soundManager.play('reload', 0.5, false, 1.5);
        soundManager.play('powerUp', 0.3, false, 1.8);
        setReloadPerfectUI(true);
        tutorial.recordAction('active_reload', 1);
        if (dailyEnabled) dailyCounts.perfect_reload += 1; // daily channel
      } else {
        // Missed — a dull click, nothing else. The reload keeps its pace.
        soundManager.play('empty', 0.3, false, 0.9);
      }
    };
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
      // Guided tutorial: the weapon isn't the player's yet (the key path has
      // already explained why; this also covers the auto-reload-on-empty call).
      if (tutorialLocks.combat) return false;
      const weapon = WEAPONS[currentWeapon];
      const maxAmmoNow = effectiveMaxAmmo(currentWeapon);
      if (ammo >= maxAmmoNow) return false;
      isReloading = true;
      haptic('reload'); // double-tick under the thumb as the mag drops
      gunModel.cancelInspect(); // a reload overrides an in-progress inspect
      tutorial.recordAction('reload', 1);
      // Quickdraw skill + Engineer MP passive + Weapon Mastery all speed up
      // the reload. Mastery's `reloadSpeedup` is a percentage REDUCTION (0.10
      // → 10% off) so we subtract it from 1 in the multiplier chain.
      // ── WHICH RELOAD ─────────────────────────────────────────────────
      // Running the weapon dry locks the action open and forces the slow drill
      // (dump the magazine, release the bolt). Reloading with rounds still in
      // it keeps the chambered round, so the action is never touched and the
      // partial magazine is pouched instead of thrown away — a visibly
      // different animation AND a genuinely faster one, which rewards the
      // player for topping up in cover instead of firing to empty.
      const reloadStyle: ReloadStyle = ammo > 0 ? 'tactical' : 'dry';
      const TACTICAL_SPEEDUP = 0.82;
      // A shell-fed tube isn't a magazine swap — it's paid for per round. The
      // shotgun thumbs in only what it's MISSING, so its window scales with the
      // shell count instead of taking the flat tactical discount. A full reload
      // still costs exactly the tuned reloadTime; a one-shell top-up is quick.
      const isShellFed = currentWeapon === 'shotgun';
      const shellsNeeded = Math.max(1, maxAmmoNow - Math.max(0, ammo));
      const styleMult = isShellFed
        ? 0.30 + 0.70 * (shellsNeeded / Math.max(1, maxAmmoNow))
        : (reloadStyle === 'tactical' ? TACTICAL_SPEEDUP : 1);
      // Panic: the hands shake and fumble the insert when the player is badly
      // hurt. Keyed off the SAME critical-health fraction that drives the
      // adrenaline slow-mo, so the trembling reload and the bullet-time arrive
      // together instead of on two unrelated thresholds. Expressed as a
      // fraction of max HP, which tracks the +25 max-health pickups.
      const hpFracNow = playerMaxHealth > 0 ? health / playerMaxHealth : 1;
      const panic = THREE.MathUtils.clamp(
        (CRIT_HP_FRACTION * 1.6 - hpFracNow) / (CRIT_HP_FRACTION * 1.6),
        0, 1,
      );
      const reloadMs = (weapon.reloadTime / (1 + skillBonus('reloadSpeed')))
        * (mpMods.reloadSpeedMult ?? 1)
        * (1 - masteryBonus.reloadSpeedup)
        * perkBonuses.reloadTimeMult
        * styleMult;
      // The viewmodel reload fills the ENTIRE reload window so the hands work
      // the weapon manually for the whole time (mag swap, shell-by-shell on the
      // shotgun, chip cartridge on the subverter).
      gunModel.triggerReload(
        reloadMs / 1000, isShellFed ? shellsNeeded : 8, reloadStyle, panic,
      );
      // Audio is NOT fired here: the viewmodel emits a cue at the exact frame
      // each part makes contact and `onReloadCue` (wired at startup) plays it,
      // so what you hear is always what the hands are doing.
      setReloadDurationUI(reloadMs); // drives the crosshair reload indicator
      setReloadPerfectUI(false);
      // Arm the active-reload window for this reload.
      reloadStartedAt = Date.now();
      reloadTotalMs = reloadMs;
      reloadMaxTarget = maxAmmoNow;
      reloadAttemptUsed = false;
      if (reloadTimeoutId !== null) window.clearTimeout(reloadTimeoutId);
      reloadTimeoutId = window.setTimeout(completeReload, reloadMs);
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

      // Ignore OS key auto-repeat for every DISCRETE action below (movement
      // state is already latched above; `held()` polling doesn't care). Without
      // this, HOLDING crouch cancelled a fresh slide ~0.5s in via the repeat,
      // holding R burned the active-reload attempt as an early miss, and
      // holding C flickered the crouch toggle.
      if (e.repeat) return;

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

      // ── GUIDED TUTORIAL — answer a not-yet-taught control instead of
      // swallowing it. Movement keys are already latched into `keys` above;
      // `moving()` / the jump + sprint gates are what actually hold them, so
      // this only owns the explanation. (Touch has no keydown for the
      // joystick — that notice lives in the movement block of the loop.)
      if (isMovementKey && (tutorialLocks.move || tutorialLocks.sprint)) {
        if (e.code === b.sprint) {
          if (tutorialLocks.sprint) {
            tutorialLockedNotice(tutorialLocks.move ? TUT_LOCK_MOVE : TUT_LOCK_SPRINT);
            return;
          }
        } else if (tutorialLocks.move) {
          tutorialLockedNotice(TUT_LOCK_MOVE);
          return;
        }
      }
      if (e.code === b.dash && tutorialLocks.ability) {
        tutorialLockedNotice(TUT_LOCK_ABILITY);
        return;
      }
      if (e.code === b.usePower && tutorialLocks.ability) {
        tutorialLockedNotice(TUT_LOCK_ABILITY);
        return;
      }
      if ((e.code === b.reload || e.code === b.melee) && tutorialLocks.combat) {
        tutorialLockedNotice(TUT_LOCK_COMBAT);
        return;
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

      // CROUCH TOGGLE - bound crouch key (part of the movement kit, so it
      // opens up with walking rather than before it)
      if (e.code === b.crouch && !paused) {
        if (tutorialLocks.move) {
          tutorialLockedNotice(TUT_LOCK_MOVE);
          return;
        }
        isCrouching = !isCrouching;
        soundManager.play('footstep', 0.3);
        return;
      }

      // MELEE QUICK-STRIKE — a fast gun-butt bash for point-blank pressure.
      // Cooldown-gated inside doMeleeStrike; allowed mid-reload (it doesn't
      // cancel the reload) but not mid-dash (the charge IS the melee there).
      if (e.code === b.melee && !paused && !isGameOver && !isDashing
          && !tutorialActiveRef.current && !tutorialLocks.combat) {
        doMeleeStrike();
        return;
      }

      // USE HELD POWER — the bound power key activates whatever loot power is
      // currently held, then empties the slot. Powers come exclusively from
      // enemy loot now (one at a time), so there's no point-unlock gating.
      if (e.code === b.usePower && !paused) {
        if (heldPower) {
          // ARK-07 EQUIPMENT JAM — inside a relay's interference field the
          // trigger electronics are fried: the held power stays in the slot
          // (nothing is wasted) but cannot be engaged until the player steps
          // clear of the field.
          if (playerSignalJammed) {
            showPowerMessage('⚠ SIGNAL JAMMED — step clear of the relay field to use equipment', 2000);
            soundManager.play('hack_fail', 0.5, false, 1.1);
          // Hand check: the riot shield braces on the SAME left arm that holds
          // the engineer's remote detonator, so it can't be raised while a bomb
          // is wired/armed. Slot is kept so the player can use it after detonating.
          } else if (heldPower === 'shield' && detonatorOccupiesHand()) {
            showPowerMessage('Hands full — detonate your bomb before raising the shield', 1800);
          // Anti-stack: a timed power can't start while another timed effect is
          // still running — the player keeps the held power and is told to wait.
          } else if (isTimedPower(heldPower) && anyTimedEffectActive()) {
            showPowerMessage('Wait for your active power to finish', 1600);
          } else {
            const power = heldPower;
            heldPower = null;
            applyPower(power);
            // Using a held power-up next to a barrel sets it off as well.
            detonateBarrelsNear(camera.position.x, camera.position.z, 4.5);
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
        'Digit7': 'launcher',
        'Digit8': 'subverter'
      };

      if (weaponKeys[e.code] && tutorialLocks.combat) {
        tutorialLockedNotice(TUT_LOCK_COMBAT);
        return;
      }

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
          showPowerMessage(`${weapon.name} Locked — ${effectiveUnlockScore(weapon)} pts needed`);
        }
      }

      if (e.code === b.reload) {
        // Mid-reload, R becomes the ACTIVE RELOAD check (perfect window on
        // the ring finishes the reload early); otherwise it starts one.
        if (isReloading) attemptActiveReload();
        else startReload();
      }

      // Weapon inspect (CS:GO-style) — rebindable (default 'F'). Purely
      // cosmetic: the gun is drawn in and turned over to show it off, then
      // settles back. Ignored while paused / dead / mid-reload.
      if (e.code === b.inspect && !paused && !isGameOver && !isReloading) {
        gunModel.triggerInspect();
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

      return body;
    };

    // ── SUBVERTER: deploy an intrusion chip into a nearby enemy ──────────
    // Finds the closest living, not-already-hacked enemy that's in range AND
    // roughly in front of the player, then overclocks it: a beam snaps from
    // the deck's emitter into the target, a virus chip clamps onto its back,
    // and it turns on its own kind for a few seconds before burning out.
    // Returns true if a chip was actually deployed (so the caller consumes one).
    const deploySubverterChip = (): boolean => {
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      let best: Enemy | null = null;
      let bestScore = -Infinity;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead || e.hacked || e.health <= 0) continue;
        // Bosses are IMMUNE to the Subverter — their hardened cores reject the
        // intrusion chip entirely. They can never be hacked, hunted by a hacked
        // minion, or caught in the overclock EMP (see findHackVictim / detonate).
        if (e.type === 'boss') continue;
        // The Revenant can't be hacked DIRECTLY either (its shield rejects the
        // chip) — but it IS a valid hunt target for an ALREADY-hacked enemy
        // (findHackVictim does NOT skip it), which is the intended indirect kill.
        if (e.type === 'revenant') continue;
        // Don't hack an enemy that hasn't even streamed in its detailed model
        // (the distant minimal stand-in) — same fairness gate bullets use.
        if (e.detailReady === false) continue;
        const dx = e.mesh.position.x - camera.position.x;
        const dz = e.mesh.position.z - camera.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > HACK_RANGE) continue;
        // Must be roughly aimed at (cone test on the horizontal plane).
        const inv = 1 / (dist || 1);
        const dot = (dx * inv) * fwd.x + (dz * inv) * fwd.z;
        if (dot < HACK_CONE) continue;
        // Prefer closest + best-aligned target.
        const score = dot * 2 - dist * 0.08;
        if (score > bestScore) { bestScore = score; best = e; }
      }

      if (!best) {
        soundManager.play('hack_fail', 0.6);
        showPowerMessage('No target in range — get closer', 1300);
        return false;
      }

      // ── Overclock the target ──
      best.hacked = true;
      best.hackTimeLeft = HACK_DURATION;
      best.hackDuration = HACK_DURATION;
      best.hackNextSparkAt = 0;
      const vis = buildHackVisuals();
      best.mesh.add(vis);
      best.hackVisuals = vis;
      // The chip fries the target — kick off overclock smoke immediately, then
      // the living-enemy loop keeps it venting for the whole hack window.
      best.nextDamageFxAt = 0;
      ventEnemySmoke(best, true);
      ventEnemySmoke(best, true);

      // Beam from the deck emitter (just in front of the held weapon) to the
      // target's chest, plus a spark burst + chip-clamp pop.
      const gunWorldPos = new THREE.Vector3();
      gunModel.group.getWorldPosition(gunWorldPos);
      gunWorldPos.addScaledVector(fwd, 0.6);
      const tgt = best.mesh.position.clone();
      tgt.y += 1.0;
      hackBeams.push(new HackBeam(scene, gunWorldPos, tgt));
      const sparkDir = new THREE.Vector3().subVectors(tgt, gunWorldPos).normalize();
      robotSparks.push(new RobotHitSparks(scene, tgt.clone(), sparkDir, 16));
      createParticles(tgt, 0x39ff14, 14);

      gunModel.triggerDeploy();
      soundManager.play('hack_deploy', 0.8);
      haptic('fire');
      showPowerMessage('⚡ ENEMY HACKED — turning on its own', 1500);
      tutorial.recordAction('shoot', 1);
      if (dailyEnabled) dailyCounts.hack += 1; // daily Subverter channel
      return true;
    };

    // Enhanced shooting
    // ── MELEE QUICK-STRIKE (default V, rebindable) ───────────────────────
    // A gun-butt bash for close-range pressure: hits everything in a frontal
    // arc for heavy flat damage, a hard shove and (host/solo) a brief stagger
    // — the panic button every FPS needs when a robot is chewing on your face
    // mid-reload. Deliberately NOT a shot: it never touches the accuracy
    // metrics, works mid-reload without cancelling it, and its damage only
    // scales with the Damage power-up / run modifiers so it stays a finisher,
    // not a DPS strategy. Guests report hits to the host (same path as
    // bullets); CC + shoves stay host-authoritative.
    //
    // Two-phase: the swing plays instantly, the HIT resolves on the strike
    // frame of the per-weapon animation (~130ms in) so damage lands exactly
    // when the weapon visually connects. Heavy ordnance (sniper / minigun /
    // launcher) can't melee at all — MELEE_CAPABLE_WEAPONS is shared with
    // GunModel so the gate and the animation table can never disagree.
    const MELEE_RANGE = 5.2;
    const MELEE_RANGE_SQ = MELEE_RANGE * MELEE_RANGE;
    const MELEE_ARC_DOT = Math.cos((60 * Math.PI) / 180); // 120° frontal arc
    const MELEE_COOLDOWN_MS = 900;
    const MELEE_IMPACT_DELAY_MS = 130; // damage lands on the strike frame
    const MELEE_BASE_DAMAGE = 60;
    const MELEE_MAX_TARGETS = 3;
    const MELEE_STUN_MS = 420;
    let nextMeleeAt = 0;
    let lastMeleeHintAt = 0; // throttles the "too heavy" hint
    const _meleeFwd = new THREE.Vector3();
    const _meleeImpact = new THREE.Vector3();

    function doMeleeStrike() {
      const nowMs = Date.now();
      if (nowMs < nextMeleeAt || isGameOver || paused) return;
      if (!MELEE_CAPABLE_WEAPONS.has(currentWeapon as GunWeaponType)) {
        if (nowMs - lastMeleeHintAt > 2500) {
          lastMeleeHintAt = nowMs;
          showPowerMessage('Too heavy to melee — switch to a lighter weapon', 1500);
          soundManager.play('empty', 0.3, false, 0.8);
        }
        return;
      }
      nextMeleeAt = nowMs + MELEE_COOLDOWN_MS;

      // Swing NOW (viewmodel windup + whoosh); the hit lands on the strike
      // frame below so contact matches what the player sees.
      gunModel.triggerMelee();
      soundManager.play('jump', 0.45, false, 1.3); // whoosh, pitched up to a swipe
      tutorial.recordAction('melee', 1);
      window.setTimeout(resolveMeleeHits, MELEE_IMPACT_DELAY_MS);
    }

    function resolveMeleeHits() {
      if (isGameOver || paused) return;
      const nowMs = Date.now();
      fovPunch = Math.min(fovPunch + 1.4, 14);

      // Aim re-read at impact time — the strike connects where the player is
      // ACTUALLY looking when the swing lands, not where they were at windup.
      camera.getWorldDirection(_meleeFwd);
      _meleeFwd.y = 0;
      if (_meleeFwd.lengthSq() < 1e-6) return;
      _meleeFwd.normalize();

      const impactFeedbackOn = gameSettingsManager.getSetting('impactFeedback');
      const meleeDamage = MELEE_BASE_DAMAGE
        * (damageBoostActive ? damageBoostMultiplier : 1)
        * (runMods.playerDamageMult ?? 1);
      let hitCount = 0;

      for (let mi = 0; mi < enemies.length && hitCount < MELEE_MAX_TARGETS; mi++) {
        const te = enemies[mi];
        if (te.dead || te.engageable === false || te.detailReady === false) continue;
        const tdx = te.mesh.position.x - camera.position.x;
        const tdz = te.mesh.position.z - camera.position.z;
        const d2 = tdx * tdx + tdz * tdz;
        if (d2 > MELEE_RANGE_SQ || d2 < 1e-6) continue;
        const inv = 1 / Math.sqrt(d2);
        if (tdx * inv * _meleeFwd.x + tdz * inv * _meleeFwd.z < MELEE_ARC_DOT) continue;

        // A shielded Revenant phases the bash off — it pings, no damage.
        if (revShieldUp(te)) { pingRevShield(te, te.mesh.position); continue; }

        hitCount++;
        te.damageFlashTime = 0.4;
        // Record the strike direction so a killing blow ragdolls the right way.
        if (!te.hitImpulse) te.hitImpulse = new THREE.Vector3();
        te.hitImpulse.set(_meleeFwd.x, 0, _meleeFwd.z);

        const heavyChassis = te.type === 'tank' || te.type === 'boss' || te.isMiniBoss === true;
        if (isMpGuest && mp) {
          // Guests don't own enemy health / CC / position — report the hit and
          // keep the local feedback below for snappiness.
          if (te.netId !== undefined) mp.sendEnemyHit(te.netId, meleeDamage, false);
        } else {
          te.health -= meleeDamage;
          if (te.type === 'revenant') te.revEvadeUntil = nowMs + 500;
          // Hard shove + a brief stagger (bosses shrug the stagger off so the
          // bash can never stun-lock the fight's anchor).
          const shove = heavyChassis ? 0.35 : 1.1;
          te.mesh.position.x += _meleeFwd.x * shove;
          te.mesh.position.z += _meleeFwd.z * shove;
          if (!heavyChassis) te.ccUntil = Math.max(te.ccUntil ?? 0, nowMs + MELEE_STUN_MS);
        }

        // Crunchy impact feedback at the point of contact.
        _meleeImpact.set(
          te.mesh.position.x - _meleeFwd.x * 0.5,
          te.mesh.position.y + 1.1,
          te.mesh.position.z - _meleeFwd.z * 0.5,
        );
        robotSparks.push(new RobotHitSparks(scene, _meleeImpact.clone(), _meleeFwd.clone(), 14));
        stampEnemyDamage(te, meleeDamage, false, undefined, _meleeImpact);
        if (impactFeedbackOn) {
          impactBursts.push(new ImpactBurst(scene, _meleeImpact.clone(), 0xffe6b0, 1.15));
        }
        if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(false);

        if (!isMpGuest && te.health <= 0) {
          handleEnemyKilled(te, false);
        }
      }

      if (hitCount > 0) {
        soundManager.play('enemyHit', 0.9, false, 0.72); // low metal thud
        haptic('hit');
        if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        // Micro hit-stop so the bash lands with weight.
        timeScale = 0.5;
        setTimeout(() => { timeScale = 1.0; }, 70);
        // Daily melee channel — one tick per SWING that connected (not per
        // enemy hit), so a crowd bash counts once.
        if (dailyEnabled) dailyCounts.melee_hit += 1;
      }

      // Turrets take the bash too — bashing a sentinel at point blank works.
      for (let s = 0; s < sentinels.length; s++) {
        const sentinel = sentinels[s];
        if (sentinel.destroyed) continue;
        const sdx = sentinel.mesh.position.x - camera.position.x;
        const sdz = sentinel.mesh.position.z - camera.position.z;
        const sd2 = sdx * sdx + sdz * sdz;
        if (sd2 > MELEE_RANGE_SQ || sd2 < 1e-6) continue;
        const sinv = 1 / Math.sqrt(sd2);
        if (sdx * sinv * _meleeFwd.x + sdz * sinv * _meleeFwd.z < MELEE_ARC_DOT) continue;
        sentinel.hp -= meleeDamage;
        createParticles(sentinel.mesh.position, 0xff6633, 8);
        soundManager.play('enemyHit', 0.8, false, 0.8);
        if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(false);
        if (sentinel.hp <= 0) {
          sentinel.destroyed = true;
          spawnExplosionFX(sentinel.mesh.position.clone());
          scene.remove(sentinel.mesh);
          const sentinelReward = Math.round(150 * scoreDiffMult * runModifierScoreMult);
          score += sentinelReward;
          if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Sentinel Down · +${sentinelReward}`, 'kill');
          triggerKillFlash();
          updateGameState();
        }
      }
    }

    // ── AIM SPREAD (single source of truth) ──────────────────────────────
    // Total per-axis deviation added to the shot direction for the player's
    // CURRENT stance. Used by BOTH shoot() (the fired bullet) and the dynamic
    // crosshair (its size), so the reticle always reflects the real cone.
    //   • base weapon spread — tightened by ADS (scoped sniper → pinpoint) and
    //     the accuracy skill, exactly as before;
    //   • movement bloom — ADDITIVE, so even pin-point weapons pull off-aim on
    //     the move: jumping is worst, then sprinting, then walking; crouching
    //     steadies the stance. ADS also stabilises movement (but never fully to
    //     zero while moving — only a still, scoped sniper is truly pinpoint);
    //   • sustained-fire bloom — the cone opens the longer auto-fire is held.
    const computeAimSpread = (): number => {
      const weapon = WEAPONS[currentWeapon];
      const scopedSniper = isAiming && currentWeapon === 'sniper';
      const adsActive = isAiming && weapon.canAim === true;
      const accuracy = 1 + skillBonus('accuracy');
      // Base weapon spread (ADS-tightened).
      const aimingScale = adsActive ? (scopedSniper ? 0 : 0.2) : 1.0;
      let spread = (weapon.spread * aimingScale) / accuracy;
      // Movement + sustained-fire bloom (additive, ADS-stabilised but not zeroed).
      let bloom = isJumping ? 0.075
        : moveStateRunning ? 0.055
        : moveStateMoving ? 0.030
        : 0;
      if (isCrouching) bloom *= 0.4;       // crouched stance is steadier
      bloom += fireBloom * 0.045;          // holding the trigger opens the cone
      const bloomAds = adsActive ? 0.4 : 1.0;
      spread += (bloom * bloomAds) / accuracy;
      return spread;
    };

    // Scratch vectors for shoot() — the tracer endpoint, muzzle position and
    // smoke direction are consumed (copied) inside the effect constructors, so
    // reusing these removes three heap allocations per trigger pull. _shotDir
    // is the per-pellet aim direction (copied into the pooled record's velocity)
    // and _NEG_Z the rocket's rest axis — both hoisted out of the pellet loop.
    const _shotTracerEnd = new THREE.Vector3();
    // Scratch for the per-frame Web Audio listener orientation update.
    const _audioFwd = new THREE.Vector3();
    const _audioUp = new THREE.Vector3();
    const _shotMuzzlePos = new THREE.Vector3();
    const _shotSmokeDir = new THREE.Vector3();
    const _shotDir = new THREE.Vector3();
    const _NEG_Z = new THREE.Vector3(0, 0, -1);
    // Muzzle-flash light cutoff — timestamp-driven (checked in the render
    // loop) instead of a setTimeout per shot; autofire used to spawn 20/s.
    let gunLightOffAt = 0;

    const shoot = () => {
      // Guided tutorial: the trigger is dead until the sprint drill brings the
      // weapon online. Covers desktop clicks, held auto-fire and the touch FIRE
      // button (which dispatches the same synthetic mousedown).
      if (tutorialLocks.combat) {
        tutorialLockedNotice(TUT_LOCK_COMBAT);
        return;
      }
      // Empty magazine — dry-fire click + auto-reload so pulling the trigger on
      // an empty mag actually does something instead of a dead click. The
      // !isReloading guard means only the first pull clicks; subsequent pulls
      // of a held auto-fire burst are swallowed while the reload runs. The
      // nextShotAt gate ALSO applies here: the autofire poll runs at ~60Hz now,
      // so without it a held trigger on an empty mag (auto-reload off) would
      // machine-gun the dry-fire click.
      if (ammo <= 0 && !isReloading && !isGameOver && !paused && !tutorialActiveRef.current) {
        const nowEmpty = performance.now();
        if (nowEmpty < nextShotAt) return;
        nextShotAt = nowEmpty + 280; // believable dry-fire cadence for a held trigger
        soundManager.play('empty', 0.5);
        // Auto-reload on empty is a player setting (default on). When off, the
        // empty pull just dry-fires and the player reloads manually.
        if (gameSettingsManager.getSetting('autoReload')) startReload();
        return;
      }
      const nowShot = performance.now();
      if (ammo > 0 && !isGameOver && !paused && nowShot >= nextShotAt && !isReloading && !tutorialActiveRef.current) {
        const weapon = WEAPONS[currentWeapon];
        gunModel.cancelInspect(); // firing snaps the gun back from an inspect
        // Overcharge × Rapid-Fire (killstreak airdrop) × Wave perks compound on
        // top of the weapon's base fire rate — earn them all, fire blisteringly fast.
        let fireRateMult = perkBonuses.fireRateMult;
        if (overchargeActive) fireRateMult *= overchargeFireRateMult;
        if (rapidFireActive) fireRateMult *= rapidFireMultiplier;
        const fireDelay = weapon.fireRate / fireRateMult;
        nextShotAt = nowShot + fireDelay;

        // ── SUBVERTER: not a gun — deploy a hacking chip and bail out of the
        // projectile path entirely. Only consumes a chip on a successful hack.
        if (currentWeapon === 'subverter') {
          const deployed = deploySubverterChip();
          if (deployed && !infiniteAmmoActive) ammo--;
          updateGameState();
          return;
        }

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
        // Sustained-fire bloom — each trigger pull opens the cone a little more;
        // it recovers in the render loop once you stop firing (see fireBloom).
        fireBloom = Math.min(1, fireBloom + 0.12);
        // Eject a brass casing per trigger pull (the launcher fires rockets, no casing).
        if (!weapon.name.includes('Launcher')) ejectShellCasing();
        updateGameState();

        // 🤖 Record shot for AI systems (will check for hit later). One per
        // trigger-pull (not per shotgun pellet) so the adaptive accuracy metric
        // — hits / triggers — stays honest; landed hits call recordHit().
        adaptiveDifficulty.recordShot(false);
        if (tacticalActive) tacticalDirector.noteShot(performance.now());
        tutorial.recordAction('shoot', 1);

        // Play the weapon-specific report with a subtle random pitch so
        // sustained auto-fire doesn't sound like one looped sample.
        soundManager.play(`shoot_${currentWeapon}`, 0.7, false, 0.97 + Math.random() * 0.06);

        const bulletsToFire = currentWeapon === 'shotgun' ? 5 : 1;

        // Gun flash — timestamp cutoff, cleared in the render loop (no timer).
        gunLight.intensity = 5;
        gunLightOffAt = nowShot + 50;

        const isLauncher = currentWeapon === 'launcher';

        for (let i = 0; i < bulletsToFire; i++) {
          // Per-pellet aim direction in a hoisted scratch — its final value is
          // COPIED into the (pooled) record's velocity below, so the pellet
          // loop allocates nothing on the recycled path.
          const direction = _shotDir;
          camera.getWorldDirection(direction);

          // Total aim deviation for the current stance (base weapon spread +
          // ADS tightening + movement/sustained-fire bloom). Single source of
          // truth shared with the dynamic crosshair (see computeAimSpread).
          const spreadPerAxis = computeAimSpread();
          direction.x += (Math.random() - 0.5) * spreadPerAxis;
          direction.y += (Math.random() - 0.5) * spreadPerAxis;
          direction.z += (Math.random() - 0.5) * spreadPerAxis;
          direction.normalize();

          let bullet: THREE.Object3D;
          if (isLauncher) {
            // Launcher fires a real rocket projectile, oriented along its flight path
            bullet = createRocketProjectile();
            bullet.position.copy(camera.position);
            bullet.quaternion.setFromUnitVectors(_NEG_Z, direction);
          } else {
            // Shared geometry + cached material — no per-shot allocation.
            bullet = buildBullet(weapon.bulletColor);
            bullet.position.copy(camera.position);
            // Aim the round along its flight path. This is what the earlier
            // elongated-bullet attempt was missing: without it the capsule and
            // tail point in a fixed direction while the round travels
            // elsewhere, which is exactly the "bullet curves in flight" look
            // that got it reverted to spheres. A non-rocket bullet's velocity
            // never changes, so orienting ONCE here is exact and costs nothing
            // per frame. Same -Z convention the rocket above uses.
            bullet.quaternion.setFromUnitVectors(_NEG_Z, direction);
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

          // Reuse a retired record (mesh pool's sibling) when one is free.
          let rec = _bulletRecordPool.pop();
          if (rec) {
            rec.mesh = bullet;
            rec.velocity.copy(direction).multiplyScalar(weapon.bulletSpeed);
            rec.life = isLauncher ? 240 : 100;
            rec.damage = bulletDamage;
            rec.isRocket = isLauncher;
            rec.pierceLeft = weapon.pierce ?? 0;
            rec.pierceRetain = weapon.pierceRetain ?? 0.55;
            rec.hitEnemies?.clear(); // recycled record — forget its past victims
          } else {
            rec = {
              mesh: bullet,
              velocity: direction.clone().multiplyScalar(weapon.bulletSpeed),
              life: isLauncher ? 240 : 100,
              damage: bulletDamage,
              isRocket: isLauncher,
              pierceLeft: weapon.pierce ?? 0,
              pierceRetain: weapon.pierceRetain ?? 0.55,
            };
          }
          // Railgun Rounds perk — grant every non-rocket round extra
          // over-penetration on top of whatever the weapon already has.
          if (perkBonuses.bulletPierce > 0 && !isLauncher) {
            rec.pierceLeft = (rec.pierceLeft ?? 0) + perkBonuses.bulletPierce;
            if ((rec.pierceRetain ?? 0) < 0.6) rec.pierceRetain = 0.65;
          }
          bullets.push(rec);

          // Bullet tracer — rockets skip it (they trail their own exhaust glow).
          // BulletTracer copies both endpoints into its pooled geometry in the
          // constructor, so passing scratch/live vectors is allocation-free.
          // (The tracer reach scales with bullet speed — same as it always has:
          // the endpoint extends along the scaled velocity, not the unit aim.)
          if (!isLauncher) {
            _shotTracerEnd.copy(camera.position).addScaledVector(rec.velocity, 50);
            const tracer = new BulletTracer(scene, camera.position, _shotTracerEnd, weapon.bulletColor);
            bulletTracers.push(tracer);
          }
        }

        // Muzzle flash at the weapon's actual BORE EXIT (scratch — MuzzleFlash
        // copies it). This used to read gunModel.group, which is the viewmodel
        // ROOT at basePosition {0.3,-0.3,-0.5} — not the muzzle of any weapon.
        // On the sniper the flash and its smoke detonated ~1.7 units behind the
        // barrel tip. The anchor is parented into the rig, so it tracks recoil,
        // sway and ADS for free. Fixes the smoke origin below at the same time.
        gunModel.getMuzzleWorldPosition(_shotMuzzlePos);
        const flash = new MuzzleFlash(scene, _shotMuzzlePos, weapon.bulletColor);
        muzzleFlashes.push(flash);

        // Lingering muzzle smoke — a soft grey wisp drifting up off the barrel.
        // Throttled (scaled by particle density) so full-auto reads as a haze,
        // not a sprite storm; the launcher trails its own rocket exhaust so it's
        // skipped. Oldest puff is evicted past the cap.
        if (!isLauncher) {
          const nowMs = performance.now();
          const smokeInterval = 48 / Math.max(0.35, graphicsPreset.particleDensity);
          if (nowMs - lastMuzzleSmokeMs >= smokeInterval) {
            lastMuzzleSmokeMs = nowMs;
            if (muzzleSmokePuffs.length >= MAX_MUZZLE_SMOKE) {
              const oldPuff = muzzleSmokePuffs.shift();
              if (oldPuff) oldPuff.dispose(scene);
            }
            camera.getWorldDirection(_shotSmokeDir);
            muzzleSmokePuffs.push(new MuzzleSmoke(scene, _shotMuzzlePos, _shotSmokeDir));
          }
        }

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
        // Tutorial: a step transition just called exitPointerLock() moments
        // ago (see the step-sync block), and browsers rate-limit how soon a
        // re-lock request after that can actually succeed. If a click lands
        // in that window this branch would normally "eat" it — re-request
        // the lock and return with nothing fired — which could stall the
        // "shoot 10 times" practice step indefinitely. Falling through here
        // instead means the click still counts as a shot even if the lock
        // hasn't (yet) been re-granted. Classic/Multiplayer keep the
        // original strict behaviour.
        if (!isTutorialMode) return;
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

        // Start auto-fire for weapons that support it. The interval is a fast
        // ~60Hz poll — the real cadence is the timestamp gate inside shoot()
        // (nextShotAt). The old interval ticked at the weapon's BASE fire rate,
        // which silently discarded Overcharge / Rapid-Fire / wave-perk
        // fire-rate buffs for held autofire (the gate opened early but the
        // interval never asked). Polling + gating also stops the burst
        // naturally when a mid-hold weapon switch lands on a non-auto gun.
        const weapon = WEAPONS[currentWeapon];
        if (weapon.autoFire && !autoFireInterval) {
          autoFireInterval = window.setInterval(() => {
            if (mouseDown && !paused && !isGameOver && WEAPONS[currentWeapon].autoFire) {
              shoot();
            }
          }, 16);
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
            recordTutorialHold('look'); // advances the opening "Look Around" drill
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
      // Blocked mid-reload for parity with the digit keys — a wheel flick used
      // to abandon the reload animation while its completion timer kept running
      // and then filled the NEW weapon to the OLD weapon's mag size.
      if (!paused && !isGameOver && !isReloading && !tutorialLocks.combat) {
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

        // Update weapon — same source-of-truth mag size + mastery snapshot as
        // the digit-key path (the wheel used to skip both, so perk/mastery
        // magazine bonuses silently vanished on a scroll-switch).
        refreshMasteryBonus();
        ammo = effectiveMaxAmmo(currentWeapon);
        gunModel.switchWeapon(currentWeapon as GunWeaponType);
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
        weaponUnlockMult: weaponUnlockMultNow(),
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

    // ── ENEMY GPS HUNT MARKERS ───────────────────────────────────────────
    // When the wave is down to its last 1–2 robots, guide the player to them
    // like a AAA objective marker: an on-screen enemy gets a pulsing chevron
    // hovering above it (pointing down at the target), an off-screen one gets
    // an arrow clamped to the viewport edge and rotated toward it — both with
    // a live distance pill. Host/solo additionally require the wave spawner to
    // be DONE (waveEnemiesRemaining counts unspawned enemies) so markers never
    // fire during a fresh wave's opening trickle; MP guests mirror enemies
    // without that counter, so the alive count alone gates them. Everything is
    // style-writes on two pre-mounted DOM nodes — zero React, zero allocation.
    const _arrowVec = new THREE.Vector3();
    const _arrowTargets: (Enemy | null)[] = [null, null];
    const updateEnemyArrows = () => {
      const roots = enemyArrowRefs.current;
      let show = !paused && !isGameOver && !photoModeRef.current;
      let alive = 0;
      _arrowTargets[0] = null;
      _arrowTargets[1] = null;
      if (show) {
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.dead) continue;
          if (alive < 2) _arrowTargets[alive] = e;
          alive++;
          if (alive > 2) break;
        }
        const spawnerDone = isMpGuest || waveEnemiesRemaining <= 0;
        show = alive > 0 && alive <= 2 && spawnerDone;
      }
      const w = window.innerWidth;
      const hgt = window.innerHeight;
      const cx = w * 0.5, cy = hgt * 0.5;
      const EDGE = 64; // clamp margin from the viewport edges
      const pulse = 1 + 0.1 * Math.sin(performance.now() * 0.006); // heartbeat
      for (let i = 0; i < roots.length; i++) {
        const el = roots[i];
        if (!el) continue;
        const target = show ? _arrowTargets[i] : null;
        if (!target) {
          if (el.style.display !== 'none') el.style.display = 'none';
          continue;
        }
        _arrowVec.set(target.mesh.position.x, target.mesh.position.y + 1.6, target.mesh.position.z);
        const dist = _arrowVec.distanceTo(camera.position);
        _arrowVec.project(camera);
        // A point behind the camera projects mirrored — flip it so the arrow
        // sweeps around the screen edge correctly when the enemy is behind you.
        const behind = _arrowVec.z > 1;
        let nx = _arrowVec.x, ny = _arrowVec.y;
        if (behind) { nx = -nx; ny = -ny; }
        const onScreen = !behind && nx > -0.9 && nx < 0.9 && ny > -0.82 && ny < 0.82;
        const svg = el.firstElementChild as SVGElement | null;
        const span = el.lastElementChild as HTMLElement | null;
        el.style.display = 'flex';
        if (onScreen) {
          // Hover just above the enemy, chevron pointing down at it.
          const px = (nx * 0.5 + 0.5) * w;
          const py = (-ny * 0.5 + 0.5) * hgt;
          el.style.transform = `translate(${(px - 17).toFixed(1)}px, ${(py - 64).toFixed(1)}px)`;
          if (svg) svg.style.transform = `rotate(180deg) scale(${pulse.toFixed(3)})`;
        } else {
          // Edge-clamped arrow rotated to point at the target (GPS mode).
          const px = (nx * 0.5 + 0.5) * w;
          const py = (-ny * 0.5 + 0.5) * hgt;
          let dx = px - cx, dy = py - cy;
          const len = Math.hypot(dx, dy) || 1;
          dx /= len; dy /= len;
          // Degenerate case: enemy dead-centre BEHIND the camera projects to a
          // zero direction — point the arrow at the bottom edge ("turn around").
          if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) { dx = 0; dy = 1; }
          const t = Math.min(
            (cx - EDGE) / Math.max(1e-6, Math.abs(dx)),
            (cy - EDGE) / Math.max(1e-6, Math.abs(dy)),
                );
          const ex = cx + dx * t;
          const ey = cy + dy * t;
          const ang = Math.atan2(dy, dx) * (180 / Math.PI) + 90; // chevron art points up
          el.style.transform = `translate(${(ex - 17).toFixed(1)}px, ${(ey - 17).toFixed(1)}px)`;
          if (svg) svg.style.transform = `rotate(${ang.toFixed(1)}deg) scale(${pulse.toFixed(3)})`;
        }
        if (span) {
          const dTxt = `${Math.round(dist)}m`;
          if (span.textContent !== dTxt) span.textContent = dTxt;
        }
      }
    };

    // Game loop
    let animationId: number;
    // FPS-cap bookkeeping: timestamp of the last RENDERED frame. When a cap is
    // set we skip animation frames that arrive earlier than the target interval.
    let lastCappedFrameMs = 0;
    const clock = new THREE.Clock();
    let frameCount = 0;
    // Delta accumulators for the periodic AI/mission/coach systems. These
    // replaced `frameCount % N` gates that could never fire (frameCount is
    // clamped at 3), and are framerate-independent by construction.
    let aiAdaptiveAccum = 0;
    let aiTacticalAccum = 0;
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
    // Latest measured FPS + smoothed CPU frame time — shared by the FPS pill
    // and the debug-console feed (which reads them loop-side, no React).
    let fpsValue = 0;
    let debugFrameMs = 16.7;
    let debugFeedLastMs = 0;
    const updateFPS = () => {
      const now = performance.now();
      fpsFrameCount++;
      if (now - fpsLastTime >= 1000) {
        fpsValue = fpsFrameCount;
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
        // Coming back from a call / app switch: the browser suspended audio and
        // dropped the screen wake lock. Restore both.
        soundManager.resumeContext();
        refreshWakeLock();
      } else {
        // ── MOBILE LIFE HAPPENS ──────────────────────────────────────────
        // A phone call, a notification tap, or the screen locking must never
        // cost the player a run. Backgrounding auto-pauses solo/tutorial play
        // and wipes any held stick/trigger so nothing is stuck on return.
        // Multiplayer is excluded: its waves are host-authoritative and keep
        // running, so a local pause would only desync the player.
        const inMultiplayerGame = isMultiplayer || gameMode === 'multiplayer';
        if (touchControls.enabled && !paused && !isGameOver && !inMultiplayerGame
            && !tutorialActiveRef.current && !photoModeRef.current
            && !wavePerkActiveRef.current) {
          paused = true;
          setIsPaused(true);
        }
        if (touchControls.enabled) {
          touchControls.reset();
          // A finger can never "lift" once the app is gone, so the trigger
          // would still be held on return. Drop it and stop any auto-fire.
          mouseDown = false;
          if (autoFireInterval) { clearInterval(autoFireInterval); autoFireInterval = null; }
        }
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
    // ── ENEMY ENGAGEMENT CULLING (anti-snipe-through-fog) ──────────────────
    // Reused each frame to decide which enemies are "engageable": a bullet can
    // only damage — and an enemy can only shoot — when the enemy is genuinely
    // rendered on the player's screen (inside the view frustum AND within the
    // map's visible draw distance) OR close enough to matter. This stops the
    // player sniping fog-culled enemies off in the distance, and stops unseen
    // far enemies plinking the player from beyond the render horizon.
    const _engageFrustum = new THREE.Frustum();
    const _engageProjMat = new THREE.Matrix4();
    const _engageSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
    const ENGAGE_CLOSE = 16;   // always engageable within this radius (m)
    // Bullet's position at the START of the frame — the swept-collision test
    // sweeps the segment [_bulletPrev → current] so fast bullets can't tunnel
    // past enemies between frames (see the bullet update loop).
    const _bulletPrev = new THREE.Vector3();
    // Reused outward-normal for stamping environment bullet decals (never
    // retained by the decal system, which copies it in).
    const _decalNormal = new THREE.Vector3();
    // Ground level for bullet-hole decals — near the player the terrain sits on
    // the flat y=0 envelope, so a descending round that crosses this plane
    // stamps a ground mark. Only descending shots trip it, so horizontal combat
    // is unaffected (bullets still fly to their target / expire in the air).
    const GROUND_DECAL_Y = 0.02;
    // Ambient-particle tint endpoints — warm pollen/dust in daylight, soft
    // green-cyan firefly glow after dark. Crossfaded by the day cycle each
    // frame so the floating ambience tracks the clock automatically.
    const _moteColorDay = new THREE.Color(0xfff1cf);
    const _moteColorNight = new THREE.Color(0x8effc6);
    const _moteColor = new THREE.Color();
    // Reusable snapshot buffers for spatial-grid queries. queryRadius() hands
    // back a SHARED internal array that a later query overwrites, so callers
    // that re-query mid-iteration must snapshot it first. These were `.slice()`
    // (a fresh array per bullet AND per enemy, every frame). Copying into a
    // persistent buffer keeps the exact same snapshot semantics with zero
    // allocation. Each is used by a single sequential top-level loop, so they
    // never alias. Capacity grows as needed and is retained between frames.
    const _enemyQueryScratch: number[] = [];
    const _terrainQueryScratch: number[] = [];

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
      gib.traverse((o) => { o.castShadow = false; });
      // Severed cable bundle torn out WITH the head — dangles from the neck
      // underside and whips around as the gib tumbles.
      const gibWires = buildWireBundle(false, 1);
      gibWires.position.y = -0.35;
      gib.add(gibWires);
      scene.add(gib);
      head.visible = false; // the body is now headless

      // Matching stub left in the BODY: a shorter tuft of torn cables sparking
      // up out of the neck. Lives on the pooled mesh (same local space as the
      // head), so it's remembered on the enemy and detached when the corpse's
      // slot is recycled.
      if (head.parent) {
        const stub = buildWireBundle(true, 0.8);
        stub.position.copy(head.position);
        stub.position.y -= 0.3;
        head.parent.add(stub);
        enemy.neckWires = stub;
      }

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

    // Tear down a hacked enemy's overclock state + visuals. Safe to call on a
    // non-hacked enemy (no-op). Called whenever a hacked enemy dies / recycles
    // so the pooled mesh never carries a stale virus chip into its next life.
    const clearHackState = (enemy: Enemy) => {
      if (enemy.hackVisuals) {
        disposeHackVisuals(enemy.hackVisuals);
        enemy.hackVisuals = undefined;
      }
      if (!enemy.hacked) return;
      enemy.hacked = false;
      enemy.hackTimeLeft = undefined;
      enemy.hackDuration = undefined;
      enemy.mesh.rotation.z = 0; // clear any leftover instability roll
    };

    // Extracted enemy-kill handler — shared by direct bullet hits and the
    // rocket launcher's area-of-effect so score, combos, drops, achievements
    // and wave progression all behave identically however an enemy dies.
    const handleEnemyKilled = (enemy: Enemy, isCritical: boolean, killerId?: string) => {
      // A dying enemy is no longer hacked — strip the chip/indicator first.
      clearHackState(enemy);
      // Drop any frost shell / crowd-control so a thawing corpse can't carry it.
      clearEnemyCC(enemy);
      // Put out any fire it was carrying — the flame shell rides SHARED assets,
      // so it must come off before the corpse/pool path touches the mesh.
      clearEnemyBurn(enemy);
      // Strip the ARK-07 surge halo / irradiated shell BEFORE the corpse path:
      // the pooled-mesh release disposes unknown add-on children, and these
      // wrappers ride SHARED assets that must never be disposed per-enemy.
      clearNetEventVisuals(enemy);
      // ── DECAPITATION ── pop the head off before the corpse flies (so the
      // gib launches from the head's pre-ragdoll position).
      if (canDecapitate(enemy, isCritical)) spawnHeadGib(enemy);
      // ── WORLD state (authoritative): the enemy is dead for everyone. ──
      enemy.dead = true;
      enemy.deathTime = 1.0;
      // POSITIONAL death: the existing chassis blip plus a mechanical death
      // cry whose pitch tracks the enemy's mass, so a tank dying behind you
      // sounds different from a stalker dying in front of you.
      {
        const dp = enemy.mesh.position;
        soundManager.playAt('enemyDeath', dp.x, dp.y, dp.z, 0.6);
        const heavy = enemy.type === 'tank' || enemy.type === 'boss' || enemy.isMiniBoss === true;
        soundManager.playAt('enemy_die', dp.x, dp.y, dp.z, heavy ? 0.7 : 0.5,
          heavy ? 0.62 : enemy.type === 'fast' ? 1.32 : 1.0);
      }
      createParticles(enemy.mesh.position, 0x00ff00, 8);

      // ── SPLITTER BURST ───────────────────────────────────────────────────
      // The parent bursts into fast children. Killing one in a corridor or at
      // your feet is a mistake; killing it at range with splash is correct —
      // that's the decision the archetype exists to create.
      //
      // ⚠ Every spawn goes through canSpawnMore()/the adaptive cap. On the
      // ultralow preset maxEnemies is 10, so an uncapped burst would eat a
      // third of the budget and could starve the wave's own spawns (and stall
      // waveEnemiesRemaining). Children are flagged canSplit:false so a burst
      // can never cascade.
      if (enemy.canSplit && !isMpGuest && !isTutorialMode) {
        const ex = enemy.mesh.position.x;
        const ez = enemy.mesh.position.z;
        for (let sc = 0; sc < SPLITTER_CHILDREN; sc++) {
          if (!smartEnemyManager.canSpawnMore()) break;
          if (enemies.length >= smartEnemyManager.getCurrentMaxEnemies()) break;
          const a = (sc / SPLITTER_CHILDREN) * Math.PI * 2 + Math.random() * 0.6;
          const child = createEnemy(ex + Math.cos(a) * 2.2, ez + Math.sin(a) * 2.2, 'fast');
          if (!child) break;
          child.canSplit = false;
          // Children are smaller and weaker than a stock runner — the threat is
          // the sudden three-way spread, not three full-strength enemies.
          child.health = Math.max(1, Math.round(child.maxHealth * 0.45));
          child.maxHealth = child.health;
          child.scoreValue = Math.round(child.scoreValue * 0.5);
          if (isMpHost) { child.netId = nextEnemyNetId++; enemyByNetId.set(child.netId, child); }
          enemies.push(child);
        }
        createParticles(enemy.mesh.position, 0xb6ff5a, 18);
        soundManager.playAt('enemy_alert', ex, enemy.mesh.position.y, ez, 0.6, 0.75);
      }

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
        const velX = launchDir.x * launchSpeed;
        const velY = (5.5 + Math.random() * 1.6) * massScale;
        const velZ = launchDir.z * launchSpeed;
        const spinX = (Math.random() - 0.5) * 9 * massScale;
        const spinY = (Math.random() - 0.5) * 7 * massScale;
        const spinZ = (Math.random() - 0.5) * 11 * massScale;
        // Prefer the engine-grade Rapier ragdoll (solo only — MP corpses use the
        // host-mirrored simple topple). spawn() returns -1 until the physics
        // WASM is ready (or if it failed to load), in which case we fall back to
        // the lightweight gravity-integrated launcher — identical impulse + feel.
        const ragBaseScale = ENEMY_SCALE[enemy.type];
        const ragId = isMultiplayer ? -1 : ragdollSystem.spawn(
          enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z,
          velX, velY, velZ, spinX, spinY, spinZ, ragBaseScale,
        );
        if (ragId >= 0) {
          enemy.ragdollBodyId = ragId;
        } else {
          enemy.deathVel = new THREE.Vector3(velX, velY, velZ);
          enemy.deathSpin = new THREE.Vector3(spinX, spinY, spinZ);
        }
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
        // ARK-07 HOT-ZONE BOUNTY — a kill scored inside the uplink's field
        // pays up to +50% (scaling toward the mast). The deliberate carrot
        // for fighting empowered, self-repairing units in the radiation.
        const hotZoneF = uplinkFieldFactor(enemy.mesh.position.x, enemy.mesh.position.z);
        const hotZoneMult = 1 + hotZoneF * 0.5;
        score += Math.round(enemy.scoreValue * scoreDiffMult * runModifierScoreMult * miniBossMult * hotZoneMult);
        if (hotZoneF > 0.15 && gameSettingsManager.getSetting('killFeed') && Math.random() < 0.3) {
          addKillFeedEntry('Hot-zone bounty claimed', 'combo');
        }
        enemiesKilled++;
        // Feed the Tactical Director the distance at which this kill landed —
        // its core read of brawler-vs-sniper playstyle.
        if (tacticalActive) tacticalDirector.noteEngagementDistance(enemy.mesh.position.distanceTo(camera.position));
        // Daily Challenge channels — tick cumulative counts. Weapon
        // attribution follows the equipped weapon, the same rule mastery XP
        // uses below (pistol_kill, rifle_kill, … are all `<weapon>_kill`).
        if (dailyEnabled) {
          dailyCounts.kill += 1;
          if (isCritical) dailyCounts.headshot += 1;
          if (enemy.type === 'boss') dailyCounts.boss_kill += 1;
          const weaponChannel = `${currentWeapon}_kill` as DailyEventChannel;
          if (weaponChannel in dailyCounts) dailyCounts[weaponChannel] += 1;
        }
        // Weapon Mastery — grant XP on the equipped weapon. Bigger payouts
        // for bigger fights (bosses are a real grind reward). SKIPPED entirely
        // in tutorial: there every weapon is already maxed by default, so it
        // must never accrue XP or fire a level-up notification.
        if (!isTutorialMode) {
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
        }
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
          // ── KILLSTREAK AIRDROP DROPS (RARE) ──────────────────────────
          // Higher, spread-out streak milestones AND a long global cooldown so
          // crates are a genuine treat, not a constant rain. HEALTH has its own
          // shorter cooldown (a reliable way to reclaim HP — fairness). The
          // MYSTERY BOX (gun upgrade) is skipped entirely once every weapon is
          // unlocked (it becomes a Health Pack instead, so the streak still pays
          // off). `lastStreakAwarded` stops a threshold re-firing within a wave.
          let streakReward: import('./utils/EnhancedPowerUps').PowerUpType | null = (
            killStreak === 8  ? 'health' :
            killStreak === 14 ? 'rapid_fire' :
            killStreak === 20 ? 'invincible' :
            killStreak === 26 ? 'health' :
            killStreak === 32 ? 'random_weapon' :
            killStreak === 40 ? 'nuke' :
            killStreak === 48 ? 'frenzy' :
            killStreak === 58 ? 'juggernaut' :
            null
                );
          // No upgrade left (every weapon unlocked, OR already holding the
          // top-tier gun)? Turn the Mystery Box into a Health Pack so the streak
          // still pays off and we never drop a pointless gun crate.
          const weaponKeys = Object.keys(WEAPONS);
          const allWeaponsUnlocked = unlockedWeapons.length >= weaponKeys.length;
          const holdingTopTier = weaponKeys.indexOf(currentWeapon) >= weaponKeys.length - 1;
          if (streakReward === 'random_weapon' && (allWeaponsUnlocked || holdingTopTier)) streakReward = 'health';
          if (streakReward && killStreak > lastStreakAwarded) {
            lastStreakAwarded = killStreak;
            const isHealthDrop = streakReward === 'health';
            const now = Date.now();
            // Rarity gate: skip the drop (but keep the streak credit) if the
            // relevant cooldown hasn't elapsed.
            const onCooldown = isHealthDrop
              ? (now - lastHealthAirdropAt < HEALTH_AIRDROP_COOLDOWN_MS)
              : (now - lastAirdropAt < AIRDROP_COOLDOWN_MS);
            if (!onCooldown) {
              if (isHealthDrop) lastHealthAirdropAt = now; else lastAirdropAt = now;
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
                streakReward === 'health'        ? 'Health Pack' :
                streakReward === 'invincible'    ? 'Invincibility' :
                streakReward === 'random_weapon' ? 'Mystery Box' :
                streakReward === 'nuke'          ? 'Tactical Nuke' :
                streakReward === 'frenzy'        ? 'Frenzy' :
                streakReward === 'juggernaut'    ? 'Juggernaut' :
                'Airdrop'
              );
              if (gameSettingsManager.getSetting('killFeed')) {
                addKillFeedEntry(`${killStreak} Streak · ${rewardLabel} Inbound`, 'powerup');
              }
              showPowerMessage(`AIRDROP INBOUND · ${rewardLabel}`, 2400);
            }
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
        if (combo >= 3) tutorial.recordAction('combo_3x', 1);
        tutorial.recordAction('kill', 1);
        // Tutorial — grow the enemy roster as the player proves themselves,
        // announcing each new species the moment it's earned.
        if (isTutorialMode) updateTutorialRoster(enemiesKilled);
        if (isCritical) triggerHeadshotFlash(); else triggerKillFlash();
        // Confirm the kill in the hand — a distinct triple-tick from the flat
        // per-hit tick, so a downed enemy reads without looking at the feed.
        haptic(enemy.type === 'boss' ? 'heavy' : 'kill');
        // Crosshair KILL confirm — a bold X + sweeping ring at centre screen so
        // every elimination lands with a satisfying, AAA-grade punch.
        if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(isCritical, true);
        // Skill points are no longer earned per kill — they're awarded at the end
        // of a Solo run (server-side) so the tree is a real, competitive grind.
        //
        // NO per-kill feed entries — every elimination is already announced
        // exactly once by the crosshair kill-confirm marker + screen flash
        // (headshots additionally by the gold flash), and combo/streak
        // milestones are owned solely by the top-centre ComboDisplay. The old
        // "Enemy Eliminated"/"HEADSHOT!"/"Nx COMBO!" entries duplicated all
        // three, spammed the 5-slot feed and collided with the tactical map.
        // The feed is reserved for EVENTS (waves, boss beats, trampled, MP).
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
        // Mobile-only streak feat — the on-screen-controls badge. Gated on a
        // touch session so desktop play never advances it (achievements are
        // already solo-only via the system's `enabled` flag).
        if (touchControls.enabled) achievementSystem.setProgress('thumb_warrior', killStreak);
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
        // Daily rapid_kill channel — a triple-kill is 3 kills inside a rolling
        // 4s window; the window clears once counted so a long spree yields one
        // burst per 3 kills, not one per kill after the first two.
        if (dailyEnabled) {
          dailyRapidTimes.push(currentTime);
          while (dailyRapidTimes.length > 0 && currentTime - dailyRapidTimes[0] > 4000) {
            dailyRapidTimes.shift();
          }
          if (dailyRapidTimes.length >= 3) {
            dailyCounts.rapid_kill += 1;
            dailyRapidTimes.length = 0;
          }
        }
        if (isMultiplayer && multiplayerManager) multiplayerManager.incrementKills();
      } else if (mp && enemy.netId !== undefined) {
        // Killing blow came from a guest — hand them the credit.
        mp.broadcastEnemyKillCredit(killerId!, enemy.netId, enemy.scoreValue, isCritical);
      }
      // Enemy loot — a defeated enemy MAY drop a single, truly-random power
      // crate, but the whole wave is capped (see the per-wave power-up budget)
      // so powers stay a real reward, not a stream. Gated by: budget remaining,
      // a short kills-since-last-drop cooldown (spreads the few drops across the
      // wave), and a modest per-kill roll (Scavenger skill nudges it up). Snap
      // the drop to the nearest clear spot so it isn't buried in a tree.
      killsSinceLastDrop++;
      if (
        wavePowerupDrops < wavePowerupCap &&
        killsSinceLastDrop >= 6 &&
        Math.random() < 0.13 * (1 + skillBonus('powerupSpawnRate'))
      ) {
        const ex = enemy.mesh.position.x;
        const ez = enemy.mesh.position.z;
        const PICKUP_RADIUS = 1.0;
        let dropX = ex, dropZ = ez;
        if (overlapsTerrain(ex, ez, PICKUP_RADIUS)) {
          const spot = findPickupSpot(ex, ez, 1.6, 4.0);
          dropX = spot.x; dropZ = spot.z;
        }
        spawnPickup(dropX, dropZ, randomLoot());
        wavePowerupDrops++;
        killsSinceLastDrop = 0;
      }
      updateGameState();
      // Wave complete — only once the whole wave budget has spawned AND
      // every living enemy is dead. Tutorial mode has no wave progression.
      const livingEnemies = enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
      // MP guests NEVER advance the wave locally — the wave number is strictly
      // host-authoritative and mirrored from the enemy_sync stream (see
      // handleEnemySync). This keeps every player's wave counter exactly equal.
      if (!isTutorialMode && !isGameOver && !playerEliminated && !isMpGuest
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
          // Daily reach-wave channel — the wave the player is about to ENTER
          // (wave+1: clearing wave 9 means you've reached wave 10). Kept as a
          // per-run MAX; the flush folds it with max() (mode 'max'), never
          // addition, so two short runs can't fake one deep run.
          dailyCounts.wave = Math.max(dailyCounts.wave, wave + 1);
        }
        tookDamageThisWave = false;
        // The trial is over — ARK-07 stands down until the next roll. Clears
        // the HUD chip/overlay immediately; the red-shift and post-FX ease
        // out via the per-frame drivers so nothing pops.
        deactivateNetWaveEvent();
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
        // Mobile-only survival feats — use THIS run's wave (not career best) so
        // they only credit progress actually made on a touch device.
        if (touchControls.enabled) {
          achievementSystem.setProgress('touch_trooper', wave);
          achievementSystem.setProgress('pocket_operator', wave);
        }
        setShowWaveComplete(true);
        soundManager.play('waveComplete', 1.0);
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Wave ${wave - 1} Complete!`, 'wave');
        // Streak Keeper perk preserves the streak across waves so a god-tier
        // run can keep climbing toward the 20-kill nuke airdrop.
        if (perkBonuses.streakKeeper) {
          killStreak = streakBeforeWaveReset;
          lastStreakAwarded = lastAwardedBeforeWaveReset;
        }
        // Multiplayer has NO mystery box / wave-perk picker at all (removed by
        // design — perks are a solo-only feature). When the perk pool is
        // exhausted in solo we also skip straight to the next wave. In both
        // cases we just wait out the celebration banner, then spawn.
        if (isMultiplayer || isPerkPoolExhausted(runPerks)) {
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
      : type === 'revenant' ? 'Revenant'
      // Fallback for the tactical archetypes (bulwark/howler/leaper/splitter).
      // This read 'Forest Creature' — a leftover from before the enemies were
      // robots, and the only string in the codebase that contradicted it.
      : 'Rogue Unit';

    // Apply incoming enemy damage to the LOCAL player. Shared by the local
    // enemy-attack path (solo + the host's own hits) and, in multiplayer, by
    // the `player_damaged` event the host sends when a shared enemy strikes a
    // remote player. `enemyPos` enables the directional riot-shield check for
    // local hits; network damage passes null (non-directional block).
    // `isRadiation` marks a tick of ARK-07 field exposure: it bypasses the
    // Phantom cloak (you can't hide from radiation) and the held riot shield
    // (it isn't a frontal blow), and skips the melee-grade feedback stack
    // (impact sparks / shake / combo decay) — the radiation vignette + geiger
    // are its feedback. Death, spectate and MP bookkeeping stay identical.
    const takeEnemyDamage = (incoming: number, enemyLabel: string, enemyPos: THREE.Vector3 | null, isRadiation = false) => {
      if ((phantomActive && !isRadiation) || invincibleActive || isTutorialMode || playerEliminated) return;
      // Second Wind grace window — briefly immune after cheating death so the
      // player isn't instantly re-killed by the same swarm. Radiation ignores it.
      if (!isRadiation && Date.now() < secondWindInvulnUntil) return;

      let damage = incoming * Math.max(0, 1 - skillBonus('damageReduction')) * perkBonuses.damageTakenMult;

      if (shieldActive && damage > 0 && !isRadiation) {
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

      // Retribution perk — a melee attacker eats a fraction of the blow it just
      // landed. Only frontal/close hits carry an attacker position; networked /
      // environmental damage passes null and reflects nothing.
      if (perkBonuses.thornsReflect > 0 && damage > 0 && enemyPos && !isRadiation) {
        let best: Enemy | null = null;
        let bestD = 8.5;
        for (let ti = 0; ti < enemies.length; ti++) {
          const te = enemies[ti];
          if (te.dead || te.health <= 0) continue;
          const d = te.mesh.position.distanceTo(enemyPos);
          if (d < bestD) { bestD = d; best = te; }
        }
        if (best) {
          const refl = damage * perkBonuses.thornsReflect;
          best.health -= refl;
          best.damageFlashTime = 0.3;
          createParticles(best.mesh.position, 0xffcf4a, 6);
          if (!isMpGuest && best.health <= 0) handleEnemyKilled(best, false);
        }
      }

      // Second Wind perk — a once-per-run death cheat. When a blow WOULD be
      // lethal, negate it, revive at 40% HP and open the grace window instead.
      if (perkBonuses.secondWind && !perkSecondWindUsed && damage > 0 && health - damage <= 0) {
        perkSecondWindUsed = true;
        secondWindInvulnUntil = Date.now() + 1500;
        health = Math.max(1, Math.round(playerMaxHealth * 0.4));
        damage = 0; // negate the fatal blow — nothing below sees a death
        shieldBreakFlash = 1;
        triggerDamageFlash();
        if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        soundManager.play('powerUp', 0.95, false, 0.8);
        showPowerMessage('SECOND WIND', 2600);
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Second Wind — cheated death', 'powerup');
        if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
        return;
      }

      health -= damage;

      if (damage > 0 && isRadiation) {
        // Radiation ticks: quiet, continuous harm — the geiger crackle +
        // green vignette (driven by the exposure loop) are the feedback, so
        // no impact stack here. Still counts as real damage everywhere it
        // matters (flawless-wave tracking, adaptive difficulty, MP health).
        adaptiveDifficulty.recordDamage(damage, false);
        adaptiveDifficulty.recordHealthStatus(health, 100);
        tookDamageThisWave = true;
        if (health > 0 && health < 10) achievementSystem.updateProgress('close_call', 1);
        if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
      } else if (damage > 0) {
        adaptiveDifficulty.recordDamage(damage, false);
        adaptiveDifficulty.recordHealthStatus(health, 100);
        // Feed the Tactical Director the pressure the player is under (raises
        // the intensity read that lightly biases how hard the squad presses).
        if (tacticalActive) tacticalDirector.noteDamageTaken(damage);
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
        // ── CINEMATIC IMPACT FEEDBACK (toggleable) ──
        // A visceral, first-person "you got hit" punch: a hot impact flash +
        // spark burst snaps just in front of the camera, biased toward the
        // bearing the blow came from, so a strike off-screen still reads
        // directionally. Gated by the "Impact Feedback" gameplay setting.
        if (gameSettingsManager.getSetting('impactFeedback')) {
          // Contact point sits a touch in front of the eyes, nudged toward the
          // bearing the blow came from. Kept small + close so it reads as a
          // punchy hit spark rather than a sprite filling the screen.
          camera.getWorldDirection(_shieldFwd);
          _shieldFwd.normalize();
          _impactPos.copy(camera.position).addScaledVector(_shieldFwd, 1.7);
          if (enemyPos) {
            _shieldToEnemy.subVectors(enemyPos, camera.position).normalize();
            _impactPos.addScaledVector(_shieldToEnemy, 0.4);
          } else {
            _shieldToEnemy.copy(_shieldFwd);
          }
          impactBursts.push(new ImpactBurst(scene, _impactPos.clone(), 0xff5a3a, damage >= 15 ? 0.62 : 0.46));
          // Sparks fly back toward the player (opposite the incoming blow).
          _impactDir.copy(_shieldToEnemy).multiplyScalar(-1);
          robotSparks.push(new RobotHitSparks(scene, _impactPos.clone(), _impactDir, damage >= 15 ? 12 : 8));
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
      if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(isCritical, true);
      // No per-kill feed entry — mirrors handleEnemyKilled: the kill-confirm
      // marker + flash are the single announcement for each elimination.
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
      const msg = raw as { enemies: EnemyWire[]; wave: number; full?: boolean; t?: number; wm?: number; wi?: number; us?: number[] };
      const isKeyframe = msg.full !== false; // default true for safety
      // First snapshot from the host → we're in sync; drop the affordance.
      if (mpWaitingForHostRef.current) {
        mpWaitingForHostRef.current = false;
        setMpWaitingForHost(false);
      }

      // ── ARK-07 mirror (keyframes carry the host's authoritative state) ──
      // Build the relay spires exactly where the host rolled them, then apply
      // the wave-modifier transition through the SAME activate/deactivate path
      // the host used, so banners, overlays, halos and the red-shift all match.
      if (Array.isArray(msg.us) && msg.us.length >= 2 && !uplinkPlaced && uplinkNet) {
        for (let sp = 0; sp + 1 < msg.us.length; sp += 2) {
          addUplinkSpire(msg.us[sp], msg.us[sp + 1]);
        }
        // The guest's barrels were scattered from the same seed as the host's,
        // but it had no relay positions until now — so the irradiated-core
        // conversion has to run HERE, once the fields exist, or a guest would
        // see plain red TNT where the host sees warheads.
        markIrradiatedBarrels();
      }
      if (typeof msg.wm === 'number') {
        const kind = msg.wm === 1 ? 'surge' : msg.wm === 2 ? 'glitch' : 'none';
        const intensity = Math.max(0, Math.min(2, (msg.wi ?? 75) / 100));
        if (kind === 'none') deactivateNetWaveEvent();
        else if (netWaveEvent !== kind) activateNetWaveEvent(kind, intensity);
        else netWaveEventIntensity = intensity;
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
        // Guests never run spawnWave(), so the per-wave loot budget has to be
        // rolled over HERE or it would stay pinned at its wave-1 value and the
        // guest would stop seeing loot entirely after the first crate.
        wavePowerupDrops = 0;
        killsSinceLastDrop = 0;
        wavePowerupCap = wave <= 2 ? 1 : 2;
        // The milestone crate stays on the host's every-3rd-wave cadence so
        // both sides get loot on the same waves.
        if (wave % 3 === 0) spawnWavePowerUps();
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
          // Guest-side loot. This used to be a flat 26% per death with NO
          // budget and NO cooldown at all — the wave cap that keeps solo loot
          // scarce simply wasn't on this path, so a multiplayer guest's map
          // filled with crates far faster than the host's. Run it through the
          // exact same budget + kill-spacing gate as the solo/host drop.
          killsSinceLastDrop++;
          if (wavePowerupDrops < wavePowerupCap && killsSinceLastDrop >= 6 && Math.random() < 0.13) {
            const spot = findPickupSpot(e.mesh.position.x, e.mesh.position.z, 1.2, 3.5);
            spawnPickup(spot.x, spot.z, randomLoot());
            wavePowerupDrops++;
            killsSinceLastDrop = 0;
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
        // NULL WAVE ballistics compromise — scaled here (the single
        // authoritative write for guest fire) so it's never double-applied.
        // Same boss clamp the local bullet path applies, so a guest's reported
        // hit can't bypass it and one-shot the Overlord.
        e.health -= capBossHit(e, m.damage * playerBallisticsMult());
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

    // Pooled crater rigs. Every blast used to build 3 fresh MeshStandardMaterials
    // + 12 meshes, then dispose them (INCLUDING the shared geometries — which
    // silently forced a GPU re-upload for every crater still alive). A rig is
    // borrowed whole; the debris ring is re-randomised on acquire so each blast
    // still looks unique. Materials live in the rig, so fade writes are direct
    // (no per-frame traverse) and shared geometries are never disposed mid-run.
    interface CraterRig {
      group: THREE.Group;
      scorchMat: THREE.MeshStandardMaterial;
      ringMat: THREE.MeshStandardMaterial;
      debrisMat: THREE.MeshStandardMaterial;
      chunks: THREE.Mesh[];
    }
    const _craterRigPool: CraterRig[] = [];
    const buildCraterRig = (): CraterRig => {
      const group = new THREE.Group();
      const scorchMat = new THREE.MeshStandardMaterial({
        color: 0x070604, roughness: 1, metalness: 0,
        transparent: true, opacity: 0.92, depthWrite: false,
      });
      const scorch = new THREE.Mesh(sharedCraterScorchGeo, scorchMat);
      scorch.rotation.x = -Math.PI / 2;
      scorch.receiveShadow = true;
      group.add(scorch);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x241509, roughness: 1,
        transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(sharedCraterRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      group.add(ring);
      const debrisMat = new THREE.MeshStandardMaterial({
        color: 0x1c1206, roughness: 0.95, transparent: true, opacity: 1,
      });
      const chunks: THREE.Mesh[] = [];
      for (let d = 0; d < 10; d++) {
        const chunk = new THREE.Mesh(sharedCraterDebrisGeo, debrisMat);
        chunk.castShadow = true;
        group.add(chunk);
        chunks.push(chunk);
      }
      return { group, scorchMat, ringMat, debrisMat, chunks };
    };
    const createCrater = (pos: THREE.Vector3) => {
      const rig = _craterRigPool.pop() ?? buildCraterRig();
      // Re-randomise the debris ring so a recycled crater reads as a new blast.
      for (let d = 0; d < rig.chunks.length; d++) {
        const chunk = rig.chunks[d];
        const a = (d / rig.chunks.length) * Math.PI * 2 + Math.random() * 0.5;
        const r = 3 + Math.random() * 1.9;
        const s = 0.3 + Math.random() * 0.55;
        chunk.scale.setScalar(s);
        chunk.position.set(Math.cos(a) * r, s * 0.3, Math.sin(a) * r);
        chunk.rotation.set(Math.random(), Math.random(), Math.random());
      }
      rig.scorchMat.opacity = 0.92;
      rig.ringMat.opacity = 0.85;
      rig.debrisMat.opacity = 1;
      rig.group.position.set(pos.x, 0.06, pos.z);
      scene.add(rig.group);
      craters.push({ mesh: rig.group, rig, life: 10, maxLife: 10 });
    };

    // ── BATTLE-DAMAGE STAMPING ───────────────────────────────────────────
    // Per-type body scale (matches SmartEnemyManager's ENEMY_CONFIGS) — used to
    // size dents to the chassis and place reconstructed contact points.
    const enemyTypeScale = (t: Enemy['type']) => ENEMY_SCALE[t];

    // Dedicated scratch so a stamp never clobbers a hot-loop temp vector.
    const _dentNrm = new THREE.Vector3();
    const _dentPos = new THREE.Vector3();
    const _dentAxis = new THREE.Vector3();
    const _smokePos = new THREE.Vector3();
    const _smokeDir = new THREE.Vector3();

    // Punch a metal dent + scrape a scuff into an enemy's armour where a hit
    // landed. `contactPos` is the exact world hit point when we have it (bullet
    // contact); otherwise pass the damage `sourcePos` (blast centre / attacker)
    // and the mark is reconstructed on the armour surface facing the source. Size
    // scales with damage (SMG pock → sniper/launcher breach) × crit × enemy type.
    // Purely cosmetic, so it runs for guests too (event-driven, not health-owned).
    const stampEnemyDamage = (
      enemy: Enemy,
      dmg: number,
      isCrit: boolean,
      contactPos?: THREE.Vector3,
      sourcePos?: THREE.Vector3,
    ) => {
      if (!enemy || enemy.dead) return;
      const ts = enemyTypeScale(enemy.type);
      // Robot bodies are upright boxes, so the armour normal at any hit is
      // (almost) HORIZONTAL — measured from the body's central vertical axis AT
      // THE HIT'S OWN HEIGHT, never from enemy.mesh.position (the group origin
      // sits at hip height, so subtracting it tilted every mark upward and made
      // the decal float off at an angle). This keeps the dent lying FLAT on the
      // plating, square to the surface it hit.
      if (contactPos) {
        _dentAxis.set(enemy.mesh.position.x, contactPos.y, enemy.mesh.position.z);
        _dentNrm.subVectors(contactPos, _dentAxis); // horizontal by construction
      } else if (sourcePos) {
        _dentNrm.subVectors(sourcePos, enemy.mesh.position);
        _dentNrm.y = 0;                              // flatten AOE normals too
      } else {
        _dentNrm.set(0, 0, 1);
      }
      if (_dentNrm.lengthSq() < 1e-5) _dentNrm.set(0, 0, 1);
      _dentNrm.normalize();
      // Stamp at the EXACT contact point — flush with the plating. The old
      // extra 0.06×ts "proud" offset stacked with addImpact's own nudge to
      // float every mark ~10cm off the body (the reported "damage sits as an
      // overlay" bug). Z-fighting is handled in depth space by the decal
      // material's polygonOffset, and the dished decal rim tucks INTO the
      // armour, so the mark now reads as damage engraved in the surface.
      if (contactPos) {
        _dentPos.copy(contactPos);
      } else {
        // AOE: reconstruct a chest-height point on the surface facing the blast.
        _dentPos.set(enemy.mesh.position.x, enemy.mesh.position.y + 0.85 * ts, enemy.mesh.position.z)
          .addScaledVector(_dentNrm, 0.42 * ts);
      }
      const size = Math.min(1.05, 0.26 + dmg * 0.010) * ts * (isCrit ? 1.4 : 1);
      battleDamage.addImpact(enemy.mesh, _dentPos, _dentNrm, size);
    };

    // Pour a puff of heavy sooty smoke off a critically-damaged / hacked robot.
    // Reuses the MuzzleSmoke class (same shader program) with a darker, bigger,
    // longer-lived, mostly-upward puff; hacked units smoke a sickly overclock
    // green. Own capped pool; oldest evicted when full.
    const ventEnemySmoke = (enemy: Enemy, hacked: boolean) => {
      if (MAX_ENEMY_SMOKE <= 0) return;
      if (enemySmokePuffs.length >= MAX_ENEMY_SMOKE) {
        const old = enemySmokePuffs.shift();
        if (old) old.dispose(scene);
      }
      const ts = enemyTypeScale(enemy.type);
      _smokePos.copy(enemy.mesh.position);
      _smokePos.x += (Math.random() - 0.5) * 0.5 * ts;
      _smokePos.y += (0.7 + Math.random() * 0.7) * ts;
      _smokePos.z += (Math.random() - 0.5) * 0.5 * ts;
      _smokeDir.set((Math.random() - 0.5) * 0.5, 1, (Math.random() - 0.5) * 0.5);
      enemySmokePuffs.push(new MuzzleSmoke(scene, _smokePos, _smokeDir, hacked
        ? { color: 0x4a6a3e, sizeScale: 1.3 * ts, lifeScale: 1.6, opacityScale: 1.1, rise: 0.25 }
        : { color: 0x303338, sizeScale: 1.4 * ts, lifeScale: 1.7, opacityScale: 1.3, rise: 0.2 }));
    };

    // Sooty smoke off a patch of burning ground. Fire without smoke reads as a
    // decal; the rising column is most of what sells it as combustion. Shares
    // the enemy-venting pool (same cap, same already-warmed shader) so ground
    // fire can never out-compete the more important damage cue for slots.
    const ventFireSmoke = (x: number, y: number, z: number, radius: number) => {
      if (MAX_ENEMY_SMOKE <= 0) return;
      if (enemySmokePuffs.length >= MAX_ENEMY_SMOKE) {
        const old = enemySmokePuffs.shift();
        if (old) old.dispose(scene);
      }
      _smokePos.set(
        x + (Math.random() - 0.5) * radius * 1.1,
        y + 0.5 + Math.random() * 0.6,
        z + (Math.random() - 0.5) * radius * 1.1,
      );
      // Rises nearly straight up, drifting with the same gust that moves the
      // foliage so the whole scene shares one wind.
      _smokeDir.set(currentWindGust * 0.16 + (Math.random() - 0.5) * 0.25, 1, (Math.random() - 0.5) * 0.25);
      enemySmokePuffs.push(new MuzzleSmoke(scene, _smokePos, _smokeDir, {
        color: 0x24262a, sizeScale: 1.6 + radius * 0.35, lifeScale: 2.2, opacityScale: 0.85, rise: 0.55,
      }));
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
      // Physically blast any nearby ragdoll corpses outward + skyward (solo
      // Rapier only; no-op in MP / when no corpse is in range).
      ragdollSystem.applyRadialImpulse(pos.x, pos.y, pos.z, radius, 1);
    };

    // ── SUBVERTER hack helpers ──────────────────────────────────────────
    // Nearest living, NOT-already-hacked enemy a hacked unit can hunt. Linear
    // scan (≤~30 enemies, only a handful hacked at once) bounded to a search
    // radius so a hacked enemy doesn't sprint across the whole map.
    const findHackVictim = (hackerIdx: number): Enemy | null => {
      const hacker = enemies[hackerIdx];
      let best: Enemy | null = null;
      let bestD = Infinity;
      const MAX = 50;
      for (let k = 0; k < enemies.length; k++) {
        if (k === hackerIdx) continue;
        const o = enemies[k];
        if (o.dead || o.hacked || o.health <= 0) continue;
        // Bosses are immune to the Subverter — a hacked minion never turns on a boss.
        if (o.type === 'boss') continue;
        const d = o.mesh.position.distanceToSquared(hacker.mesh.position);
        if (d < bestD && d < MAX * MAX) { bestD = d; best = o; }
      }
      return best;
    };

    // Overclock burnout: the hacked enemy detonates in a green EMP that fries
    // nearby enemies (NOT the player — it's their own tech going up), then the
    // unit itself dies and is credited to the player.
    const detonateHackedEnemy = (enemy: Enemy) => {
      const epos = enemy.mesh.position.clone();
      epos.y = Math.max(0.4, epos.y);
      spawnExplosionFX(epos, HACK_BLAST_RADIUS);
      soundManager.play('hack_overclock', 0.9);
      createParticles(epos, 0x39ff14, 34);
      createParticles(epos, 0x9dff6a, 18);
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e === enemy || e.dead) continue;
        // Bosses shrug off the overclock EMP — the Subverter can't touch them.
        if (e.type === 'boss') continue;
        const d = e.mesh.position.distanceTo(epos);
        if (d > HACK_BLAST_RADIUS) continue;
        const falloff = 1 - (d / HACK_BLAST_RADIUS) * 0.5;
        e.health -= HACK_BLAST_DAMAGE * falloff;
        e.damageFlashTime = 0.4;
        if (e.health <= 0) handleEnemyKilled(e, false);
      }
      // The hacked unit burns out — counts as a player kill (clears its visuals).
      handleEnemyKilled(enemy, false);
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

    /**
     * ═══ IRRADIATED CORE DETONATION ═══════════════════════════════════════
     *
     * The ARK-07 fields are the one part of the map that is genuinely, openly
     * hostile — and these drums are why. A core going off is a nuclear event,
     * not an explosion:
     *
     *   • It clears a 32 m circle. Nothing hostile inside it survives.
     *   • Anything alive in that circle includes the PLAYER. Inside the
     *     fireball there is no falloff and no partial damage — it kills you.
     *     Standing in a relay field trading shots near a marked core is a
     *     decision, and this is what that decision costs.
     *   • OUTSIDE the circle, nothing happens to the player at all. Popping a
     *     core from across the map is a completely free area wipe, and that
     *     asymmetry is the whole tactic: these are the strongest weapon on the
     *     map, and the only skill they ask for is standing far enough away.
     *
     * The chain rule is deliberately asymmetric too — see the comment below.
     */
    const detonateIrradiatedCore = (barrel: ExplosiveBarrel, epos: THREE.Vector3) => {
      const R = barrel.blastRadius;

      // ── Spectacle. The full nuke cinematic, sized to the real kill radius.
      nukeEffects.push(new NukeEffect(scene, new THREE.Vector3(epos.x, 0.5, epos.z), R * 0.7));
      spawnExplosionFX(epos, R * 0.35);
      createCrater(epos);
      ragdollSystem.applyRadialImpulse(epos.x, 0.5, epos.z, R * 0.8, 2.8);
      soundManager.playAt('explosion_huge', epos.x, epos.y, epos.z, 1.0, 0.86);

      // Screen feedback scales with how close the player was — a core going up
      // on the horizon should still register, but it must not shake the camera
      // like one at their feet.
      const playerDist = Math.hypot(camera.position.x - epos.x, camera.position.z - epos.z);
      const nearness = Math.max(0, 1 - playerDist / (R * 2.2));
      if (nearness > 0.02) {
        if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        fovPunch = Math.min(fovPunch + 13 * nearness, 18);
        if (nearness > 0.45) triggerKillFlash();
      }

      // ── Everything hostile inside the circle is gone.
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.dead) continue;
        const dx = e.mesh.position.x - epos.x;
        const dz = e.mesh.position.z - epos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > R) continue;
        // Barely any falloff: this is a warhead, not a grenade. Even at the rim
        // it removes a boss's health bar in one go.
        const dmg = barrel.blastDamage * (1 - (dist / R) * 0.25);
        if (isMpGuest && mp) {
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
        } else {
          if (revShieldUp(e)) shatterRevShield(e, e.mesh.position);
          e.health -= dmg;
        }
        e.damageFlashTime = 0.5;
        stampEnemyDamage(e, dmg, false, undefined, epos);
        if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
      }

      // ── The player. Binary, by design: inside is death, outside is nothing.
      // Routed through takeEnemyDamage rather than killing directly so the
      // protections the player EARNED still mean something — an active
      // Invincibility power or Second Wind saves them, exactly as it would from
      // any other lethal hit. Everything else dies.
      if (playerDist <= R) {
        takeEnemyDamage(100000, 'ARK-07 Irradiated Core', null);
      }

      // ── Chain. A core ignites ordinary TNT across its whole radius, but
      // NEVER another core. Relay fields hold several of these within 32 m of
      // each other, so a core-to-core cascade would stack a dozen simultaneous
      // NukeEffects (the single heaviest VFX in the game) and turn every field
      // into a one-touch map wipe. Each core stays its own deliberate decision.
      for (let b = 0; b < barrels.length; b++) {
        const other = barrels[b];
        if (other === barrel || other.detonated || other.irradiated) continue;
        if (other.mesh.position.distanceTo(epos) <= R * 0.75) {
          pendingBarrelDetonations.push(other);
        }
      }

      scene.remove(barrel.mesh);
      const idx = barrels.indexOf(barrel);
      if (idx !== -1) barrels.splice(idx, 1);
    };

    /**
     * A barrel took a hit and SURVIVED it.
     *
     * Ordinary TNT gets orange sparks and a metal ping. A core gets a loud,
     * unmistakable breach cue — green venting, a rising alarm — plus an
     * explicit warning if the player is standing inside the radius it would
     * take with it. That warning is the fairness contract for the whole
     * feature: a core is an instant kill and it detonates the moment its
     * casing gives, so the player must be told the casing is going, and told
     * it in time to run. Shared by the player and enemy bullet paths, because
     * a core cooked off by a sniper's stray round has to read exactly the same.
     */
    const registerBarrelGraze = (barrel: ExplosiveBarrel, at: THREE.Vector3): void => {
      if (barrel.irradiated) {
        createParticles(at, 0x8dff3a, 10);
        soundManager.playAt('impact_metal', at.x, at.y, at.z, 0.7, 1.5);
        soundManager.playAt('hack_fail', barrel.mesh.position.x, barrel.mesh.position.y + 1, barrel.mesh.position.z, 0.5, 0.8);
        const d = Math.hypot(camera.position.x - barrel.mesh.position.x, camera.position.z - barrel.mesh.position.z);
        if (d <= barrel.blastRadius) {
          showPowerMessage('⚠ ARK-07 CORE BREACHING — GET CLEAR', 1400);
          haptic('hurt');
        }
        return;
      }
      createParticles(at, 0xffaa33, 6);
      soundManager.playAt('impact_metal', at.x, at.y, at.z, 0.5, 0.88 + Math.random() * 0.12);
    };

    const detonateBarrel = (barrel: ExplosiveBarrel) => {
      if (barrel.detonated) return;
      barrel.detonated = true;
      // If this was the Engineer's armed remote bomb, release the reference and
      // strip the detonator kit (it goes off however it was triggered).
      if (barrel === armedBomb) armedBomb = null;
      // Also released if it goes off (bullet / chain) between the detonate press
      // and the plunger bottoming out — the beat then finds nothing to fire.
      if (barrel === pendingDetonation) pendingDetonation = null;
      if (barrel.bombKit) disposeBombKit(barrel);
      const epos = barrel.mesh.position.clone();
      // ── ARK-07 IRRADIATED CORE ──────────────────────────────────────
      // A drum that has been cooking inside a relay field doesn't pop — it
      // goes off. Completely different event, so it takes its own path.
      if (barrel.irradiated) {
        detonateIrradiatedCore(barrel, epos);
        return;
      }
      spawnExplosionFX(epos, barrel.blastRadius);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      // Real, POSITIONAL detonation. This used to be a pitched-down 'powerUp'
      // ping — the same cue as picking up a health pack.
      soundManager.playAt('explosion_small', epos.x, epos.y, epos.z, 0.95, 0.94 + Math.random() * 0.12);
      // Enemies
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (e.dead) continue;
        const dist = e.mesh.position.distanceTo(epos);
        if (dist > barrel.blastRadius) continue;
        // Gentle falloff (×0.5, not ×0.75) so an enemy a few metres from the
        // barrel still eats most of the blast and actually dies — the whole
        // point of detonating a barrel next to a cluster.
        const falloff = 1 - (dist / barrel.blastRadius) * 0.5;
        const dmg = barrel.blastDamage * falloff;
        if (isMpGuest && mp) {
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
        } else {
          // EXPLOSIVE — shatters a Revenant's shield (and locks it off), THEN
          // the blast damage lands. This is the guaranteed "blow it up" kill.
          if (revShieldUp(e)) shatterRevShield(e, e.mesh.position);
          e.health -= dmg;
        }
        e.damageFlashTime = 0.45;
        stampEnemyDamage(e, dmg, false, undefined, epos);
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
        // Player takes half the (now much higher) enemy-facing blast — keeps
        // friendly fire dangerous (~75 at point blank) without it being an
        // instant unavoidable death whenever a barrel pops near you.
        takeEnemyDamage(barrel.blastDamage * falloff * 0.5, 'Explosive Barrel', null);
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

    // ── BARRELS ARE SOLID (player collision) ─────────────────────────────
    // The player can't walk through a barrel. Point-vs-circle using the
    // barrel's hit radius + a small body buffer. Linear scan (≤30 barrels) is
    // cheap at the handful of calls the movement code makes each frame. Enemies
    // are intentionally NOT blocked here so their AI/pathing is unchanged.
    const PLAYER_BODY_RADIUS = 0.6;
    const overlapsBarrel = (x: number, z: number): boolean => {
      for (let b = 0; b < barrels.length; b++) {
        const barrel = barrels[b];
        if (barrel.detonated) continue;
        const dx = barrel.mesh.position.x - x;
        const dz = barrel.mesh.position.z - z;
        const r = barrel.hitRadius + PLAYER_BODY_RADIUS;
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    };

    // ── MOVE WITH WALL-SLIDING ───────────────────────────────────────────
    // Resolve a desired (dx,dz) step per-axis so the player SLIDES along walls
    // instead of dead-stopping when a move is partly blocked (the old all-or-
    // nothing check made geometry feel sticky — pressing into a rock at an angle
    // halted you completely). Each axis is tested from the already-updated
    // position, the canonical AAA capsule-vs-world resolution: on open ground
    // both axes apply (identical to before), against a surface only the free
    // axis moves so you glide along it. Honours the same terrain + barrel tests,
    // and `camera.position.y` carries the jump height so airborne step-overs and
    // auto step-up keep working unchanged.
    //
    // Both tests sample the DESTINATION point rather than sweeping the segment,
    // so a single oversized step could pop straight through a thin trunk. A long
    // step is therefore split into sub-steps no larger than MAX_MOVE_SUBSTEP.
    // Normal play never reaches that threshold (a 60 FPS sprint is ~0.54 units),
    // so the common path runs exactly one iteration and is unchanged — this only
    // engages for the genuinely big steps: a speed-boosted sprint on a low-FPS
    // frame, where the frame-rate normaliser scales the step up.
    const MAX_MOVE_SUBSTEP = 0.5;
    const attemptMove = (dx: number, dz: number): void => {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_MOVE_SUBSTEP));
      const sx = dx / steps;
      const sz = dz / steps;
      for (let i = 0; i < steps; i++) {
        const eyeY = camera.position.y;
        if (sx !== 0) {
          const nx = camera.position.x + sx;
          if (!checkTerrainCollision(nx, camera.position.z, eyeY) && !overlapsBarrel(nx, camera.position.z)) {
            camera.position.x = nx;
          }
        }
        if (sz !== 0) {
          const nz = camera.position.z + sz;
          if (!checkTerrainCollision(camera.position.x, nz, eyeY) && !overlapsBarrel(camera.position.x, nz)) {
            camera.position.z = nz;
          }
        }
      }
    };

    // ── ABILITIES / POWER-UPS SET OFF NEARBY TNT ─────────────────────────
    // Queue every live barrel within `radius` of (x,z) for detonation. Routed
    // through the existing chain-reaction pump (not detonated inline) so the
    // blast cascades naturally and damages the player + enemies caught in it —
    // e.g. a Ranger dashing over a barrel, or any ability/power cast next to one.
    //
    // IRRADIATED CORES ARE EXEMPT BY DEFAULT (`includeCores`). Every caller of
    // this is an INCIDENTAL trigger — a melee swing, a Ranger dash, a power
    // cast that happened to go off near a drum — and a core's blast is lethal
    // out to 32 m, so an incidental trigger would mean instantly dying to your
    // own melee animation with no decision behind it. A sealed warhead does not
    // cook off because someone punched the air next to it; it goes off when it
    // is SHOT, or when something genuinely nuclear-adjacent hits it (the
    // tactical nuke passes `true`, and the player is invulnerable for that).
    const detonateBarrelsNear = (x: number, z: number, radius: number, includeCores = false): void => {
      const r2 = radius * radius;
      for (let b = 0; b < barrels.length; b++) {
        const barrel = barrels[b];
        if (barrel.detonated) continue;
        if (barrel.irradiated && !includeCores) continue;
        const dx = barrel.mesh.position.x - x;
        const dz = barrel.mesh.position.z - z;
        if (dx * dx + dz * dz <= r2 && !pendingBarrelDetonations.includes(barrel)) {
          pendingBarrelDetonations.push(barrel);
        }
      }
    };

    // ── TACTICAL NUKE ────────────────────────────────────────────────────
    // Deploys a full nuclear detonation at `center`: the cinematic NukeEffect
    // (blinding flash → fireball → rising mushroom cloud → shockwave) plus a
    // massive AoE that clears a LARGE surrounding area with distance falloff.
    // The player is shielded from their own blast (a brief invuln that also
    // covers the barrel chain it sets off). Every kill is credited through the
    // normal path so score / streak / missions all tick up. Returns the kill
    // count. `radius` defaults to a large area; the killstreak reward passes a
    // huge radius to clear the whole arena. Hoisted callers (applyPower /
    // applyKillstreakReward) only run mid-game, long after this is defined.
    const NUKE_AREA_RADIUS = 55; // "large surrounding area"
    const detonateNuke = (center: THREE.Vector3, radius = NUKE_AREA_RADIUS): number => {
      // Cinematic mushroom-cloud VFX (visual scale a touch under the kill radius
      // so the blast clearly covers what the cloud engulfs).
      nukeEffects.push(new NukeEffect(scene, new THREE.Vector3(center.x, 0.5, center.z), radius * 0.62));
      // A nuke throws corpses far — a big radius + strong kick (solo Rapier only).
      ragdollSystem.applyRadialImpulse(center.x, 0.5, center.z, radius * 0.62, 2.4);
      // ── SCREEN FEEDBACK, STAGED THE WAY A REAL DETONATION ARRIVES ────────
      // Light first, pressure second. Everything used to land on the same
      // frame, which reads as "a big explosion"; separating them by ~0.4 s —
      // the flash and its thin crack, a beat of silence, then the blast wave
      // hitting with the deep roar and the shake — is what makes it read as a
      // detonation happening at a DISTANCE and reaching you. Deliberately
      // non-positional: a tactical nuke is an everywhere-at-once event.
      triggerKillFlash();
      triggerAbilityFlash('#ffffff');            // the white-out
      soundManager.play('hit', 0.5, false, 2.6); // the sharp initial crack
      fovPunch = Math.min(fovPunch + 5, 18);
      const BLAST_ARRIVAL_MS = 420;
      window.setTimeout(() => {
        // Guarded like every other deferred effect: the scene may be gone.
        if (isSceneDisposed) return;
        if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
        fovPunch = Math.min(fovPunch + 13, 18);
        soundManager.play('explosion_huge', 1.0, false, 0.92);
        haptic('hurt');
      }, BLAST_ARRIVAL_MS);
      // Shield the player from their own nuke — also covers the barrel chain it
      // ignites, so deploying it next to cover never suicides the player.
      invincibleActive = true;
      invincibleEndTime = Math.max(invincibleEndTime, Date.now() + 2600);
      // AoE: vaporise everything alive in range, distance falloff toward the rim.
      const r2 = radius * radius;
      let kills = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.health <= 0) continue;
        const dx = e.mesh.position.x - center.x;
        const dz = e.mesh.position.z - center.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        // Centre = vaporised; toward the edge a colossal hit that still kills
        // basic robots but can leave a tank/boss badly wounded, not skipped.
        const falloff = 1 - (Math.sqrt(d2) / radius) * 0.55;
        const dmg = 650 * falloff;
        if (isMpGuest && mp) {
          // Guests don't own enemy health — report each hit to the host.
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
          continue;
        }
        // Nuke is an EXPLOSIVE — shatter a Revenant's shield, then vaporise it.
        if (revShieldUp(e)) shatterRevShield(e, e.mesh.position);
        e.health -= dmg;
        if (e.health <= 0) { handleEnemyKilled(e, false); kills++; }
        else { e.damageFlashTime = 0.5; }
      }
      // Sympathetic detonation of any explosive barrels caught in the area —
      // ARK-07 cores included: a tactical nuke absolutely cooks one off, and
      // the invulnerability granted above covers the player through the chain.
      detonateBarrelsNear(center.x, center.z, radius * 0.5, true);
      return kills;
    };

    // ═══════════════════════════════════════════════════════════════════════
    //  NEW WORLD-PICKUP COMBAT TOOLS  (Cryo Freeze · Shockwave · Tesla Coil)
    //  ─────────────────────────────────────────────────────────────────────
    //  Universal, map-agnostic crowd-control + AoE. All enemy STATE changes
    //  (freeze/stun/knockback) are host/solo-authoritative (`!isMpGuest`) so
    //  they never desync the shared host-authoritative enemy world; damage is
    //  routed through `sendEnemyHit` for guests exactly like the nuke. The
    //  player-facing VFX/SFX always play locally — they're the cast feedback.
    // ═══════════════════════════════════════════════════════════════════════

    // Frost encasement shell — shared geo + material (just lightweight Mesh
    // wrappers per frozen enemy). Tagged so a recycled pooled mesh is stripped
    // of a leftover shell on its next spawn (see createEnemy).
    const _frostShellGeo = new THREE.IcosahedronGeometry(1.2, 0);
    const _frostShellMat = new THREE.MeshBasicMaterial({
      color: 0x9fe4ff, transparent: true, opacity: 0.34, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });

    // ── ARK-07 event wrappers (shared geo+mat, frost-shell pattern) ─────────
    // Surge halo: the red overclock ring hovering over every enemy during an
    // OVERDRIVE SURGE. Rad shell: the irradiated glow worn inside the uplink
    // field (reuses the frost shell GEOMETRY — zero extra buffers). Both are
    // lightweight per-enemy wrappers around session assets: attach/detach
    // only; disposal happens exactly once, at scene teardown.
    const _surgeHaloGeo = new THREE.TorusGeometry(0.85, 0.05, 6, 28);
    const _surgeHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff3524, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const _radShellMat = new THREE.MeshBasicMaterial({
      color: 0x6bff6b, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    // Strip an enemy's event wrappers (death / recycle / wave end). Shared
    // assets → detach only, never dispose.
    const clearNetEventVisuals = (enemy: Enemy) => {
      if (enemy.surgeHalo) { enemy.surgeHalo.removeFromParent(); enemy.surgeHalo = undefined; }
      if (enemy.radShell) { enemy.radShell.removeFromParent(); enemy.radShell = undefined; }
    };
    const _teslaVec = new THREE.Vector3();
    const _teslaFrom = new THREE.Vector3();

    const freezeEnemy = (enemy: Enemy, durationMs: number) => {
      if (isMpGuest) return; // host owns enemy state
      const until = Date.now() + durationMs;
      enemy.ccUntil = Math.max(enemy.ccUntil ?? 0, until);
      enemy.frozenUntil = enemy.ccUntil;
      if (!enemy.frostShell) {
        const shell = new THREE.Mesh(_frostShellGeo, _frostShellMat);
        shell.position.y = 1.0;
        shell.userData.isFrostShell = true;
        enemy.mesh.add(shell);
        enemy.frostShell = shell;
      }
    };

    // Strip + clear an enemy's frost shell / crowd-control (on death or thaw).
    const clearEnemyCC = (enemy: Enemy) => {
      if (enemy.frostShell) {
        enemy.frostShell.removeFromParent();
        enemy.frostShell = undefined;
      }
      enemy.frozenUntil = 0;
      enemy.ccUntil = 0;
    };

    // ── BURNING ──────────────────────────────────────────────────────────────
    // Fire is not an instant hit: a robot that walks through the Pyro's jet or
    // stands in burning fuel carries the flames away with it and keeps taking
    // damage.
    //
    // MULTIPLAYER: the burn TIMER is local bookkeeping (and so is the flame
    // shell — it's cast feedback on the client that lit it), but the DAMAGE is
    // routed the same way as every other guest hit: through sendEnemyHit, so
    // the host stays the single authority on health and kills. One tick per
    // burning enemy every BURN_TICK_MS is comfortably inside the enemy_hit
    // budget. What a guest genuinely cannot do is apply CC, so thawing a frozen
    // target is host/solo only.
    // Damage cadence for every burn in the game — fixed so frame rate can never
    // change how much a fire hurts.
    const BURN_TICK_MS = 400;
    const igniteEnemy = (enemy: Enemy, durationMs: number, dps: number) => {
      if (enemy.dead || enemy.health <= 0) return;
      // A frozen robot can't burn — the fire thaws it instead, which is both the
      // intuitive read and stops cryo+fire double-locking a target.
      if (!isMpGuest && (enemy.frostShell || (enemy.frozenUntil ?? 0) > Date.now())) {
        clearEnemyCC(enemy);
      }
      const now = Date.now();
      enemy.burnUntil = Math.max(enemy.burnUntil ?? 0, now + durationMs);
      enemy.burnDps = Math.max(enemy.burnDps ?? 0, dps);
      if (enemy.burnNextTickAt === undefined || enemy.burnNextTickAt < now) {
        enemy.burnNextTickAt = now + BURN_TICK_MS;
      }
      if (!enemy.burnFx) {
        enemy.burnFx = fireSystem.attachBurn(enemy.mesh, enemyTypeScale(enemy.type));
      }
    };

    // Put a robot out (burn expired, death, recycle). Shared assets → detach.
    const clearEnemyBurn = (enemy: Enemy) => {
      if (enemy.burnFx) {
        fireSystem.detachBurn(enemy.burnFx);
        enemy.burnFx = undefined;
      }
      enemy.burnUntil = 0;
      enemy.burnDps = 0;
    };

    // Arc Reactor perk — a kill discharges chain lightning into up to 3 nearby
    // foes. Called ONLY from the primary bullet-kill site (never from
    // handleEnemyKilled itself), so a chained kill can't recursively re-arc —
    // the cascade stays bounded to one hop per trigger.
    const _arcMid = new THREE.Vector3();
    const arcChainLightning = (source: Enemy, baseDamage: number) => {
      const origin = source.mesh.position;
      const R2 = 11 * 11;
      let arcs = 0;
      for (let a = 0; a < enemies.length && arcs < 3; a++) {
        const e = enemies[a];
        if (e === source || e.dead || e.health <= 0) continue;
        const dx = e.mesh.position.x - origin.x;
        const dz = e.mesh.position.z - origin.z;
        if (dx * dx + dz * dz > R2) continue;
        if (revShieldUp(e)) { pingRevShield(e, e.mesh.position); continue; }
        arcs++;
        const dmg = baseDamage * 0.55;
        if (isMpGuest && mp) { if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false); }
        else e.health -= dmg;
        e.damageFlashTime = 0.3;
        _arcMid.copy(origin).lerp(e.mesh.position, 0.5);
        createParticles(_arcMid, 0x8fdcff, 4);
        createParticles(e.mesh.position, 0xbff0ff, 6);
        if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
      }
      if (arcs > 0) soundManager.play('hit', 0.4, false, 1.85);
    };

    const CRYO_RADIUS = 14;
    const CRYO_FREEZE_MS = 4000;
    const CRYO_CAST_DAMAGE = 55;
    const applyCryoBlast = (center: THREE.Vector3): number => {
      createParticles(center, 0x9fe4ff, 26);
      soundManager.play('powerUp', 0.7, false, 1.7);
      soundManager.play('hit', 0.45, false, 1.9);
      const r2 = CRYO_RADIUS * CRYO_RADIUS;
      let frozen = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.health <= 0) continue;
        const dx = e.mesh.position.x - center.x;
        const dz = e.mesh.position.z - center.z;
        if (dx * dx + dz * dz > r2) continue;
        // A Revenant's shield phases off the cryo blast — no freeze, no damage.
        if (revShieldUp(e)) { pingRevShield(e, e.mesh.position); continue; }
        // Bosses resist a full encasement — a brief stagger only.
        if (e.type === 'boss') {
          if (!isMpGuest) e.ccUntil = Math.max(e.ccUntil ?? 0, Date.now() + 900);
        } else {
          freezeEnemy(e, CRYO_FREEZE_MS);
        }
        frozen++;
        // Chip damage on cast (host-authoritative; guests report the hit).
        if (isMpGuest && mp) {
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, CRYO_CAST_DAMAGE, false);
        } else {
          e.health -= CRYO_CAST_DAMAGE;
          if (e.health <= 0) handleEnemyKilled(e, false);
          else e.damageFlashTime = Math.max(e.damageFlashTime, 0.4);
        }
      }
      return frozen;
    };

    const SHOCK_RADIUS = 16;
    const SHOCK_STUN_MS = 1600;
    const SHOCK_CENTER_DAMAGE = 95;   // AoE damage at the epicentre (falls off to the rim)
    const applyShockwave = (center: THREE.Vector3): number => {
      createParticles(center, 0xffe0a0, 40);
      // Kinetic shockwave also sends downed corpses tumbling outward (solo Rapier).
      ragdollSystem.applyRadialImpulse(center.x, center.y, center.z, SHOCK_RADIUS, 1.3);
      soundManager.play('hit', 0.85, false, 0.45);
      soundManager.play('powerUp', 0.6, false, 0.6);
      if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
      const r2 = SHOCK_RADIUS * SHOCK_RADIUS;
      let hit = 0;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.dead || e.health <= 0) continue;
        const dx = e.mesh.position.x - center.x;
        const dz = e.mesh.position.z - center.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        // Shockwave is KINETIC, not explosive — a Revenant's shield phases it
        // off entirely (no knockback, no damage). Only true explosives break it.
        if (revShieldUp(e)) { pingRevShield(e, e.mesh.position); continue; }
        hit++;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        // Strong near the centre, still meaningful at the rim (1.0 → 0.45).
        const falloff = 1 - (d / SHOCK_RADIUS) * 0.55;
        const dmg = SHOCK_CENTER_DAMAGE * falloff;
        // Record the radial direction FIRST so a lethal blast ragdoll-launches
        // the corpse OUTWARD from the epicentre (handleEnemyKilled reads this).
        if (!e.hitImpulse) e.hitImpulse = new THREE.Vector3();
        e.hitImpulse.set(nx, 0, nz);

        // ── Damage (host-authoritative; guests report the hit) ──
        if (isMpGuest) {
          if (mp && e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
          continue; // host owns positions / CC / kills
        }
        e.health -= dmg;
        if (e.health <= 0) { handleEnemyKilled(e, false); continue; } // ragdolls outward
        e.damageFlashTime = Math.max(e.damageFlashTime, 0.5);
        e.ccUntil = Math.max(e.ccUntil ?? 0, Date.now() + (e.type === 'boss' ? 600 : SHOCK_STUN_MS));

        // ── Forceful knockback with per-axis wall-slide ──
        // A big single launch (was a tiny ~5u nudge that dense terrain often
        // cancelled outright). Sliding per-axis means a blast still throws
        // enemies along a tree line instead of doing nothing.
        const shove = (e.type === 'boss' ? 1.6 : e.type === 'tank' ? 5.5 : e.type === 'fast' ? 13 : 11) * falloff;
        const px = e.mesh.position.x, pz = e.mesh.position.z;
        const sx = nx * shove, sz = nz * shove;
        if (!checkTerrainCollision(px + sx, pz + sz)) {
          e.mesh.position.x = px + sx; e.mesh.position.z = pz + sz;
        } else if (!checkTerrainCollision(px + sx, pz)) {
          e.mesh.position.x = px + sx;
        } else if (!checkTerrainCollision(px, pz + sz)) {
          e.mesh.position.z = pz + sz;
        }
      }
      return hit;
    };

    // ── TESLA COIL (timed chain-lightning aura) ──────────────────────────────
    let teslaActive = false;
    let teslaEndTime = 0;
    const teslaDuration = 8000;   // 8s aura
    let teslaNextArcAt = 0;
    const TESLA_RANGE = 22;        // arc reach (player→enemy and hop→hop)
    const TESLA_ARC_INTERVAL = 165; // ms between arc volleys
    const TESLA_DAMAGE = 24;
    const TESLA_MAX_CHAIN = 3;

    // Short-lived additive jagged bolt that self-fades (~0.14s) via rAF.
    const spawnLightningBolt = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
      const SEG = 6;
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const p = from.clone().lerp(to, t);
        if (s > 0 && s < SEG) {
          p.x += (Math.random() - 0.5) * 0.9;
          p.y += (Math.random() - 0.5) * 0.9;
          p.z += (Math.random() - 0.5) * 0.9;
        }
        pts.push(p);
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 1, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 995;
      scene.add(line);
      let life = 0;
      const tick = () => {
        if (!line.parent) { geo.dispose(); mat.dispose(); return; }
        life += 0.016;
        mat.opacity = 1 - life / 0.14;
        if (mat.opacity <= 0) { scene.remove(line); geo.dispose(); mat.dispose(); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    // Per-frame tesla driver — fires a chained arc volley on its interval.
    const updateTesla = () => {
      if (!teslaActive) return;
      const nowMs = Date.now();
      if (nowMs < teslaNextArcAt) return;
      teslaNextArcAt = nowMs + TESLA_ARC_INTERVAL;
      _teslaFrom.set(camera.position.x, camera.position.y - currentCameraHeight * 0.45, camera.position.z);
      const used = new Set<number>();
      let hops = 0;
      for (let hop = 0; hop < TESLA_MAX_CHAIN; hop++) {
        let best = -1;
        let bestD2 = TESLA_RANGE * TESLA_RANGE;
        for (let i = 0; i < enemies.length; i++) {
          if (used.has(i)) continue;
          const e = enemies[i];
          if (e.dead || e.health <= 0) continue;
          const dx = e.mesh.position.x - _teslaFrom.x;
          const dz = e.mesh.position.z - _teslaFrom.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; best = i; }
        }
        if (best < 0) break;
        used.add(best);
        const e = enemies[best];
        _teslaVec.set(e.mesh.position.x, e.mesh.position.y + 1.0, e.mesh.position.z);
        spawnLightningBolt(_teslaFrom.clone(), _teslaVec.clone(), 0xfff27a);
        // A Revenant's shield phases off the arc — the bolt pings and chains on
        // PAST it without dealing damage (energy, not explosive).
        if (revShieldUp(e)) {
          pingRevShield(e, e.mesh.position);
          _teslaFrom.copy(_teslaVec);
          hops++;
          continue;
        }
        const dmg = TESLA_DAMAGE * (1 - hop * 0.18);
        if (isMpGuest && mp) {
          if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
        } else {
          e.health -= dmg;
          if (e.health <= 0) handleEnemyKilled(e, false);
          else e.damageFlashTime = Math.max(e.damageFlashTime, 0.22);
        }
        _teslaFrom.copy(_teslaVec); // chain from this enemy to the next
        hops++;
      }
      if (hops > 0) soundManager.play('hit', 0.28, false, 1.8);
    };

    // ── ENGINEER DEMOLITION HELPERS ──────────────────────────────────────
    // Build the detonator/antenna/wire "kit" that visually turns a plain red
    // barrel into an armed remote bomb. All per-instance materials/geometries
    // (disposed when the bomb goes off) so the look is distinct without touching
    // the shared barrel material. Returns the animated bits for the blink loop.
    const _bombDetGeo = new THREE.BoxGeometry(0.5, 0.28, 0.42);
    const _bombAntGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6);
    const _bombSphGeo = new THREE.SphereGeometry(1, 10, 8);
    const _bombWireGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.95, 5);
    const _bombBandGeo = new THREE.TorusGeometry(0.6, 0.045, 6, 24);
    const buildBombKit = (): { group: THREE.Group; led: THREE.Mesh; tip: THREE.Mesh; band: THREE.Mesh } => {
      const group = new THREE.Group();
      // Detonator box clamped on top of the barrel (barrel top ≈ local y +0.65).
      const det = new THREE.Mesh(_bombDetGeo, new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.7, roughness: 0.4 }));
      det.position.set(0, 0.82, 0);
      group.add(det);
      // Antenna + glowing tip.
      const ant = new THREE.Mesh(_bombAntGeo, new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.85, roughness: 0.3 }));
      ant.position.set(0.17, 1.12, -0.08);
      group.add(ant);
      const tip = new THREE.Mesh(_bombSphGeo, new THREE.MeshBasicMaterial({ color: 0xff4a2a, toneMapped: false }));
      tip.scale.setScalar(0.05);
      tip.position.set(0.17, 1.4, -0.08);
      group.add(tip);
      // Blinking LED on the detonator face.
      const led = new THREE.Mesh(_bombSphGeo, new THREE.MeshBasicMaterial({ color: 0xff2a1e, toneMapped: false }));
      led.scale.setScalar(0.07);
      led.position.set(0, 0.92, 0.22);
      group.add(led);
      // Three coloured wires draped down the front face.
      const wireColors = [0xd23636, 0xf2c14e, 0x3fa66e];
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(_bombWireGeo, new THREE.MeshStandardMaterial({ color: wireColors[i], roughness: 0.6, metalness: 0.1 }));
        w.position.set(-0.16 + i * 0.16, 0.32, 0.5);
        w.rotation.x = 0.18;
        group.add(w);
      }
      // Pulsing "armed" energy band around the barrel waist.
      const band = new THREE.Mesh(_bombBandGeo, new THREE.MeshBasicMaterial({
        color: 0xff6a3d, transparent: true, opacity: 0.55, toneMapped: false,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      band.rotation.x = Math.PI / 2;
      group.add(band);
      return { group, led, tip, band };
    };

    const disposeBombKit = (barrel: ExplosiveBarrel): void => {
      const kit = barrel.bombKit;
      if (!kit) return;
      barrel.mesh.remove(kit);
      kit.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material;
          if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
          else m.dispose();
        }
      });
      barrel.bombKit = undefined;
      barrel.bombLight = undefined;
      barrel.bombTip = undefined;
      barrel.bombBand = undefined;
    };

    // Graft the bomb kit onto a barrel + flag it armed (animation drives in loop).
    const wireBomb = (barrel: ExplosiveBarrel): void => {
      if (barrel.bombKit) return; // already wired
      const { group, led, tip, band } = buildBombKit();
      barrel.mesh.add(group);
      barrel.bombKit = group;
      barrel.bombLight = led;
      barrel.bombTip = tip;
      barrel.bombBand = band;
      barrel.wired = true;
      barrel.armProgress = 0;
    };

    // Nearest non-detonated, not-yet-wired barrel within `range` of (x,z).
    //
    // ARK-07 IRRADIATED CORES ARE EXCLUDED. The Engineer's Demolition ability
    // is a detonator kit and a length of wire spliced into a drum of TNT —
    // that is not a procedure you perform on a critical radiological core, and
    // letting it work would hand the Engineer a pocket 32 m instant-kill nuke
    // on a 20-second cooldown, which no other character can answer. Cores are
    // set off the honest way: by shooting them, from a safe distance.
    const findNearestBarrel = (x: number, z: number, range: number): ExplosiveBarrel | null => {
      let best: ExplosiveBarrel | null = null;
      let bestD = range * range;
      for (let b = 0; b < barrels.length; b++) {
        const barrel = barrels[b];
        if (barrel.detonated || barrel.wired || barrel.irradiated) continue;
        const dx = barrel.mesh.position.x - x;
        const dz = barrel.mesh.position.z - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = barrel; }
      }
      return best;
    };

    const explodeRocket = (pos: THREE.Vector3, baseDamage: number) => {
      const RADIUS = 9;
      spawnExplosionFX(pos);
      // The launcher does 150 damage and, until now, made no sound whatsoever.
      soundManager.playAt('explosion', pos.x, pos.y, pos.z, 1.0, 0.95 + Math.random() * 0.1);
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
          // Rocket blast is EXPLOSIVE — shatter a Revenant's shield, then hit.
          if (revShieldUp(e)) shatterRevShield(e, e.mesh.position);
          e.health -= dmg;
        }
        e.damageFlashTime = 0.4;
        adaptiveDifficulty.recordDamage(dmg, true);
        _tempVec3.subVectors(e.mesh.position, pos).normalize();
        robotSparks.push(new RobotHitSparks(scene, e.mesh.position.clone(), _tempVec3, 10));
        // Big blast breach on the side facing the detonation.
        stampEnemyDamage(e, dmg, false, undefined, pos);
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

      // Pause while the GPU context is lost — rendering against a dead context
      // throws and can't draw anyway. The `webglcontextrestored` handler clears
      // this and re-establishes the shadow/post-FX pipeline so play resumes.
      if (webglContextLost) {
        return;
      }

      // ── FPS CAP ──────────────────────────────────────────────────────────
      // 0 = unlimited (render every frame → native V-Sync). Otherwise skip any
      // frame that arrives earlier than the target interval. The 2ms tolerance
      // stops a frame landing a hair early (e.g. 16.0ms vs a 16.67ms target)
      // from being dropped and halving the rate. clock.getDelta() (below) only
      // runs on rendered frames, so the surviving frame gets the full elapsed
      // delta — gameplay stays correctly time-stepped at any cap. (rAF can't
      // exceed the display refresh, so 120 on a 60Hz panel still reads ~60.)
      const fpsCap = fpsCapRef.current;
      if (fpsCap > 0) {
        const nowMs = performance.now();
        if (nowMs - lastCappedFrameMs < 1000 / fpsCap - 2) return;
        lastCappedFrameMs = nowMs;
      }

      // Clamp the frame delta to a ~10 FPS floor. After a hidden/inactive tab or
      // a GC/stutter, clock.getDelta() can return a huge value that would make
      // bullets tunnel through enemies, teleport AI, and explode the death
      // ragdoll / casing physics. Normal frames (16–33 ms) are far below the cap,
      // so steady-state gameplay is byte-for-byte unaffected — this only tames the
      // spike frame. (See also the isTabVisible early-return above.)
      const rawDelta = Math.min(clock.getDelta(), 0.1);

      // ── Critical-health adrenaline slow-mo ───────────────────────────────
      // Compute how deep into "critical" the player is (0 = safe, 1 = at death's
      // door) and ramp a continuous time-dilation toward it. Only while alive,
      // in-bounds, and not paused — so death/pause never freezes mid-dilation.
      {
        const hpFrac = playerMaxHealth > 0 ? health / playerMaxHealth : 1;
        // Personal bullet-time is solo/tutorial-only — in multiplayer the world
        // is shared + host-authoritative, so a per-client time-dilation would
        // desync interpolation and be unfair. Real-time there.
        const critActive = !isMultiplayer && health > 0 && !playerEliminated && !paused && !orientationBlockedRef.current;
        const crit = critActive
          ? THREE.MathUtils.clamp((CRIT_HP_FRACTION - hpFrac) / CRIT_HP_FRACTION, 0, 1)
          : 0;
        // Smoothstep so the dilation eases rather than tracking HP linearly.
        const eased = crit * crit * (3 - 2 * crit);
        const targetScale = 1 - (1 - CRIT_HP_MIN_SCALE) * eased;
        // Ramp IN a touch faster than OUT — the gut-punch should hit promptly,
        // the recovery should breathe back to normal.
        const k = targetScale < healthTimeScale ? Math.min(1, rawDelta * 3.2) : Math.min(1, rawDelta * 2.2);
        healthTimeScale += (targetScale - healthTimeScale) * k;
        if (Math.abs(healthTimeScale - 1) < 0.002) healthTimeScale = 1;
        // Drive the matching audio muffle (underwater-dull + ducked).
        soundManager.setSlowMo(eased);
      }

      const delta = rawDelta * timeScale * healthTimeScale; // transient + critical slow-mo

      // ── FRAME-RATE NORMALISER (60 FPS reference) ─────────────────────────
      // Player locomotion + the jump/gravity integrator are written as PER-FRAME
      // deltas (moveSpeed 0.3 "units per frame", gravity 0.02, etc.) rather than
      // per-second rates. With the default uncapped FPS that made the player's
      // speed a function of the display refresh: a 120 Hz phone panel ran the
      // rAF loop twice as often as a 60 Hz desktop and the player walked AND
      // sprinted at literally double speed. Multiplying those per-frame steps by
      // `frameScale` restores parity — at 60 FPS it is exactly 1.0, so desktop
      // behaviour is byte-for-byte unchanged, while 90/120/144 Hz now covers the
      // same ground per SECOND instead of per frame.
      //
      // Clamped to 2 (a 30 FPS floor) because attemptMove()/the dash test the
      // destination point rather than sweeping: an unbounded scale on a stutter
      // frame would teleport the player through a trunk. Below 30 FPS movement
      // degrades gracefully (slightly slow) instead of tunnelling.
      // Uses rawDelta, NOT delta, so bullet-time keeps the player at full speed
      // while the world slows — exactly as it behaves today.
      const frameScale = Math.min(rawDelta * 60, 2);

      // ── RUN CONTEXT REFRESH ──────────────────────────────────────────────
      // Overwrite the per-frame fields in place (no allocation) so any system
      // ticked later this frame reads a coherent snapshot. Placed here because
      // delta / rawDelta / frameScale are all resolved by this point, and
      // nothing has consumed them yet.
      runCtx.dt = delta;
      runCtx.rawDt = rawDelta;
      runCtx.frameScale = frameScale;
      runCtx.nowMs = Date.now();
      runCtx.tSec = clock.getElapsedTime();
      runCtx.playerHp = health;
      runCtx.playerMaxHp = playerMaxHealth;
      runCtx.wave = wave;
      runCtx.paused = paused;
      runCtx.gameOver = isGameOver || playerEliminated;

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

      // ── WEATHER — fold the live front into the day-cycle atmosphere ──
      // getRenderAtmosphere() returns a fresh struct each frame, so mutating
      // it here is safe. Overcast flattens the light and thickens the air;
      // rain darkens the sky toward storm grey; a sandstorm tints the world
      // tan, a blizzard whites it out, ashfall smothers it brown-grey. The
      // same modifiers scale god rays + ground wetness/puddles below. The
      // director reads the day cycle (isNight) so nights run calmer.
      weatherMods = weatherSystem.update(
        photoModeRef.current ? 0 : rawDelta,
        camera.position,
        !atmosphericSettings.sunVisible,
      );

      // ── WEATHER GETS GAMEPLAY TEETH ──────────────────────────────────────
      // The whole weather system (500 lines, six storm species, a director,
      // per-map climates) was consumed for SKY, FOG, LIGHT, SATURATION, BLOOM
      // and WETNESS only — it looked superb and changed nothing. A storm the
      // player can see but never has to account for is set dressing.
      //
      // Derived here rather than added to WeatherMods so WeatherSystem stays a
      // pure presentation layer, and cheap: a couple of multiplies per frame.
      // Deliberately SMALL numbers — weather should colour a fight, not decide
      // it, and the player has no way to opt out of the roll.
      {
        const stormK = weatherSystem.getStormKind();
        const heavy = Math.max(weatherMods.rainAmount, weatherMods.tintStrength);
        // Thick air cuts how far enemies can pick the player out. A sandstorm
        // or blizzard now genuinely hides you — which is the first time in the
        // game that a weather roll is ever an ADVANTAGE.
        weatherAggroMult = (stormK === 'sandstorm' || stormK === 'blizzard')
          ? 1 - 0.32 * heavy
          : 1 - 0.12 * heavy;
        // Deep snow and loose sand drag; wet ground barely does.
        weatherMoveMult = stormK === 'blizzard' ? 1 - 0.10 * heavy
          : stormK === 'sandstorm' ? 1 - 0.06 * heavy
          : 1;
        // Heavy rain masks footsteps — both yours and theirs.
        weatherFootstepMult = 1 - 0.5 * weatherMods.rainAmount;
      }

      if (weatherMods.skyDarken > 0.005) {
        renderAtmosphere.skyColor = darkenHexColor(renderAtmosphere.skyColor, 1 - weatherMods.skyDarken * 0.5);
        renderAtmosphere.fogColor = darkenHexColor(renderAtmosphere.fogColor, 1 - weatherMods.skyDarken * 0.4);
        renderAtmosphere.ambientColor = darkenHexColor(renderAtmosphere.ambientColor, 1 - weatherMods.skyDarken * 0.18);
      }
      // Storm colour cast — sandstorm tan / blizzard white / ash brown.
      if (weatherMods.tintStrength > 0.005) {
        const tintHex = weatherMods.tint.getHex();
        renderAtmosphere.skyColor = blendHexColor(renderAtmosphere.skyColor, tintHex, weatherMods.tintStrength * 0.6);
        renderAtmosphere.fogColor = blendHexColor(renderAtmosphere.fogColor, tintHex, weatherMods.tintStrength);
      }
      renderAtmosphere.lightIntensity *= weatherMods.lightMult;
      renderAtmosphere.ambientIntensity *= weatherMods.ambientMult;
      renderAtmosphere.fogDensity *= weatherMods.fogDensityMult;
      renderAtmosphere.saturation *= weatherMods.saturationMult;
      renderAtmosphere.bloomStrength *= weatherMods.bloomMult;

      // ── AMBIENT MUSIC — feed the adaptive score director (solo only) ──
      // The music tracks the same clock + weather front the sky renders, so
      // dusk darkens the score exactly as it darkens the world and a rolling
      // storm ducks/recolours the piece in step with the visuals. Combat
      // pressure and wave escalation shape it too. Internally throttled to
      // ~4 Hz — this call is a handful of field writes on most frames.
      // Skipped entirely in multiplayer/tutorial (score never started there).
      if (ambientMusicEnabled) ambientMusic.update({
        hour: dayCycleSystem.getCurrentTime(),
        storm: weatherMods.rainAmount,
        gloom: weatherMods.skyDarken,
        // Normalized by the tier's spawn cap — an absolute count would pin at
        // 1.0 all wave long on high presets (cap 22–40) and starve the score.
        combat: Math.min(1, enemies.length / Math.max(10, graphicsPreset.maxEnemies)),
        tension: Math.min(1, Math.max(0, (wave - 2) / 20)),
        // Blocking UI screens fade the score to silence (fast fade out,
        // slow bloom back in) — pause menu + wave-complete/mystery-box flow.
        overlay: paused || wavePerkActiveRef.current,
      });
      // Live rain → terrain shader: puddles grow with the soak and ripple
      // while precipitation is actually falling. Puddles are intentionally
      // confined to the DEEP FOREST — it is the only map whose floor pools with
      // rainwater. Every other map is forced dry here (groundWetness = 0) so no
      // desert / tundra / ruins "potholes" can ever appear, even if that map's
      // climate happens to run a rain storm. The forest floor therefore reads
      // dry in clear weather and glistens with lingering puddles only after a
      // storm soaks it (the soak dries ~3× slower than it forms).
      const groundWetness = selectedMap === 'deep_forest' ? weatherMods.wetness : 0;
      groundShaderUniforms.uRainWet.value = groundWetness;
      groundShaderUniforms.uRainRipple.value =
        groundWetness > 0.001 ? weatherMods.rainAmount * groundWetness : 0;

      const sunDirection = computeSunDirection();

      // Enemy "powered" glow is now sun-driven: during the day the body is lit
      // purely by sunlight (its emissive is floored low), and the internal glow
      // only ramps up as the sun sets — so the artificial glow is a NIGHT effect
      // and enemies still never crush to black. Smooth 0→1 blend across the dusk
      // band (sun altitude 0.30 → 0.00); a hidden sun (deep storm) forces night.
      const nightFactor = atmosphericSettings.sunVisible
        ? Math.min(1, Math.max(0, (0.30 - sunDirection.y) / 0.30))
        : 1;
      smartEnemyManager.setNightFactor(nightFactor);

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
      // crosses the bloom threshold uniformly. Rain pushes it further so a
      // downpour leaves the whole arena reading as slick, reflective wet
      // ground (and gloom leaves a damp sheen).
      groundShaderUniforms.uSpecularStrength.value = (isNightShader
        ? 0.14 * (renderProfile.groundSpecular ?? 1.0)
        : (0.28 + sunAlt * 0.26) * (renderProfile.groundSpecular ?? 1.0))
        * (1 + groundWetness * 1.6);
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

      // (The volumetric / fill / rim lights this block used to steer no longer
      //  exist — see the KEY + SKY note at the light rig. Three fewer lights
      //  also means three fewer target.updateMatrixWorld() calls per frame.)

      // Every multiplier below MUST match the scale used at build time, or the
      // very first frame re-grades the whole scene.
      ambientLight.color.setHex(renderAtmosphere.ambientColor);
      ambientLight.intensity = renderAtmosphere.ambientIntensity * AMBIENT_FLOOR;

      // Hemisphere carries all the indirect. Ground bounce is derived from the
      // KEY light's colour (warmed, then pulled toward the sky) exactly as at
      // build time — setHex + lerp + multiplyScalar in place, so the per-frame
      // sync still allocates nothing.
      skyLight.color.setHex(renderAtmosphere.skyColor);
      _skyScratch.setHex(renderAtmosphere.skyColor);
      skyLight.groundColor
        .setHex(renderAtmosphere.lightColor)
        .lerp(_skyScratch, 0.45)
        .multiplyScalar(0.42 * groundBounceScale);
      skyLight.intensity = renderAtmosphere.ambientIntensity * SKY_FILL_SCALE * skyFillScale;

      // Night readability is now the LANTERN's job, not a flat ambient flood.
      // A pool of light that travels with the player keeps the ground legible
      // while leaving the distance genuinely dark — which is both the better
      // look and one less light in every fragment shader.
      playerNightLantern.intensity = renderAtmosphere.sunVisible ? 0.0 : 3.4;

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
        // Weather drives the shafts: clear skies crank them, overcast/rain
        // kills them (no crepuscular rays through a storm deck).
        godRayStrength: (renderProfile.godRayStrength ?? 1.0) * weatherMods.godRayMult,
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
        // passive (Heavy → +20%) — single source-of-truth cap.
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
        // Continuous channels. Survive time only accrues while actually in
        // the fight (alive + unpaused); score credits the delta since the
        // last frame so it accumulates across the day like every other
        // additive channel.
        if (!paused && !isGameOver && health > 0) {
          dailySurviveSec += rawDelta;
          dailyCounts.survive_min = Math.floor(dailySurviveSec / 60);
        }
        if (score > dailyLastScore) {
          dailyCounts.score += score - dailyLastScore;
          dailyLastScore = score;
        }
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

        // "Detonate" covers the whole time a bomb is live — including the few
        // frames between the press and the plunger bottoming out, or the slot
        // would flicker back to "Demolition" mid-detonation.
        const bombLive = armedBomb !== null || pendingDetonation !== null;
        const abilityName = bombLive ? 'Detonate' : activeAbility.name;
        // Quantised so a continuously-draining cooldown doesn't defeat the gate
        // by a hair on every tick — the bar's CSS transition covers the steps.
        const abilityFill = abilityCooldown <= 0 ? 1 : Math.max(0, 1 - abilityCooldown / abilityCooldownMax);
        const abilityActive = isDashing || bombLive || Date.now() < abilityActiveUntil;
        const powerName = powerType ? POWER_LABELS[powerType] : 'Find Loot';
        // ⚠ READY IS ITS OWN SIGNATURE FIELD, NOT A CONSEQUENCE OF THE FILL.
        // The fill is quantised to 1% so a continuously-draining cooldown
        // doesn't re-render every tick — but the HUD's "ready" test is the
        // EXACT `fill >= 1`. On a long cooldown one throttled step (0.12 s) is
        // under 1% of the bar, so the last not-ready push and the first ready
        // push both rounded to 100, the signature never changed, and the
        // re-render was skipped: the slot sat greyed out while the ability was
        // in fact usable. That is the "greyed out but still activatable" bug —
        // it just showed up most around the relay, where the jam churns the
        // other slot and makes the mismatch obvious. Never fold a boolean the
        // renderer branches on back into a rounded number.
        const abilityReady = abilityFill >= 1;
        const sig = `${abilityName}|${activeAbility.id}|${activeAbility.color}|${Math.round(abilityFill * 100)}`
          + `|${abilityReady ? 1 : 0}|${abilityActive ? 1 : 0}`
          + `|${powerName}|${powerType ?? ''}|${powerState}|${powerRatio === undefined ? '' : Math.round(powerRatio * 100)}`
          + `|${playerSignalJammed ? 1 : 0}`;
        if (sig !== lastAbilityHudSig) {
          lastAbilityHudSig = sig;
        setAbilityHud([
          {
            // Engineer's slot reads "Detonate" while a bomb is wired so the
            // player knows the next press triggers it.
            key: 'Q',
              name: abilityName,
            kind: 'dash',
            abilityId: activeAbility.id,
            accent: activeAbility.color,
              cooldown: abilityFill,
              ready: abilityReady,
              active: abilityActive,
          },
          {
            key: 'E', kind: 'power',
              name: powerName,
            powerType,
            state: powerState,
            ratio: powerRatio,
            // Inside a relay's interference field the trigger electronics are
            // fried and the E key genuinely does nothing — so the slot has to
            // SAY so instead of sitting there looking usable.
            jammed: playerSignalJammed && powerState !== 'empty',
          },
        ]);
        }
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
          // Turret rides the VISUAL terrain surface — sentinels scatter far
          // past the flat zone, where the displaced ground would bury them.
          sentinel.mesh.position.y = visualGroundY(sentinel.mesh.position.x, sentinel.mesh.position.z);
          const dxS = camera.position.x - sentinel.mesh.position.x;
          const dzS = camera.position.z - sentinel.mesh.position.z;
          const distSq = dxS * dxS + dzS * dzS;
          // Phantom cloak counts as "out of range" — the sentinel can't lock a
          // cloaked player, so it drops any charge and stays dormant.
          if (phantomActive || distSq > sentinel.range * sentinel.range) {
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
              // Positional: a turret firing from behind you now sounds like it.
              soundManager.playAt(
                'shoot_pistol',
                sentinel.mesh.position.x, sentinel.mesh.position.y + 1.6, sentinel.mesh.position.z,
                0.6, 0.6,
              );
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
      // Landed crates farther than the render-distance setting sleep (hidden +
      // zero animation cost) and rehydrate when the player closes back in.
      enhancedPowerUps.updateAirdrops(delta, scene, camera.position, graphicsPreset.viewDistance);
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
      //
      // ⚠ These four periodic systems used to be gated on `frameCount % N`, but
      // frameCount is CLAMPED at 3 a few lines up (`if (frameCount < 3)`), so
      // after the third frame it never changes and none of those modulo tests
      // could ever be true again — in fact none of them fired even once, since
      // the counter is incremented before the checks and 1/2/3 are not
      // divisible by 30/120/900/1800. Adaptive difficulty never re-evaluated,
      // the Tactical Director never issued a directive, the combat coach never
      // spoke, and NOT ONE mission was ever generated.
      //
      // They're on real delta accumulators now, which also makes their cadence
      // framerate-independent (the old modulo would have run twice as often on
      // a 120 Hz panel even if the counter had worked).
      aiAdaptiveAccum += rawDelta;
      if (aiAdaptiveAccum >= 2.0 && (RUNTIME_PREFS.adaptiveDifficulty || isAdaptiveMode)) {
        const dtA = aiAdaptiveAccum;
        aiAdaptiveAccum = 0;
        adaptiveDifficulty.update(dtA);
        // ADAPTIVE MODE: push the freshly-computed performance profile onto the
        // live enemy tuning. Health/damage/spawn apply to future spawns; the
        // speed target is smoothed onto existing enemies each frame below.
        if (isAdaptiveMode) {
          const prof = adaptiveDifficulty.getDifficulty().multipliers;
          diffSettings.healthMult = prof.enemyHealth;
          diffSettings.damageMult = prof.enemyDamage;
          diffSettings.spawnMult = prof.enemySpawnRate;
          adaptiveSpeedTarget = prof.enemySpeed;
        }
      }
      // Smoothly track the adaptive speed target so the swarm's pace eases in
      // rather than stepping each update (no-op outside adaptive mode).
      if (isAdaptiveMode) {
        adaptiveSpeedMult += (adaptiveSpeedTarget - adaptiveSpeedMult) * Math.min(1, rawDelta * 1.1);
      }

      // ── TACTICAL DIRECTOR — recompute the swarm-wide directive (~0.5s tick) ──
      // Solo only. Reads the shared accuracy metric + the director's own pace /
      // range EMAs, folds them into one directive every enemy reads, and fires a
      // rare, legible HUD callout whenever the squad's dominant tactic shifts so
      // the player can FEEL the adaptation instead of just being countered.
      aiTacticalAccum += rawDelta;
      if (tacticalActive && aiTacticalAccum >= 0.5) {
        aiTacticalAccum = 0;
        const nowT = performance.now();
        const dtT = (nowT - lastTacticalUpdateMs) / 1000;
        lastTacticalUpdateMs = nowT;
        // In Adaptive mode, let the director's aggression ride the live difficulty
        // level too, so a dominating player gets both harder stats AND smarter tactics.
        if (isAdaptiveMode) {
          const lvl = adaptiveDifficulty.getDifficulty().level;
          tacticalDirector.setDifficulty(lvl >= 70 ? 'hard' : lvl >= 45 ? 'medium' : 'easy');
        }
        tacticalDirector.update(nowT, adaptiveDifficulty.getMetrics().accuracyRate, dtT);
        const stance = tacticalDirector.getStance();
        if (stance !== lastTacticalStance && stance !== 'hunting' && nowT >= nextTacticalCalloutAt && !isGameOver && !paused) {
          lastTacticalStance = stance;
          nextTacticalCalloutAt = nowT + 16000; // at most one callout every ~16s
          if (gameSettingsManager.getSetting('killFeed')) {
            addKillFeedEntry(tacticalDirector.getStanceBlurb(), 'combo');
          }
        } else if (stance !== lastTacticalStance) {
          lastTacticalStance = stance;
        }
      }

      // NOTE: no procedural missions and no combat-coach hints in gameplay.
      // Both were gated on `frameCount % N`, which could never fire (frameCount
      // is clamped at 3), so neither had ever actually run. Removed by request
      // rather than switched on: the mystery box is the wave-end beat, and
      // teaching belongs in the tutorial, not as pop-ups mid-fight.

      // ── GUIDED TUTORIAL ───────────────────────────────────────────────────
      // The single owner of every step transition. React state is pushed only
      // when the step CHANGES or the player just satisfied it — never per frame
      // — so the (very large) App tree reconciles at most twice per step.
      if (tutorialGuidedOn) {
        tutorial.tick(); // drives the short "Nice!" beat, then hands over
        const step = tutorial.isActive() ? tutorial.getCurrentStep() : null;

        if (step && step.id !== tutorialLastStepId) {
          // ── NEW STEP ──
          tutorialLastStepId = step.id;
          tutorialLastStepDone = false;
          syncTutorialLocks(); // this step's own control opens up immediately
          setTutorialStep({ ...step });
          setTutorialProgress(tutorial.getProgress());
          setTutorialMeta({ number: tutorial.getStepNumber(), total: tutorial.getStepCount() });
          // The instruction card blocks play until the player hits "Try it",
          // so release the cursor onto it.
          tutorialActiveRef.current = true;
          if (document.pointerLockElement) document.exitPointerLock();

          // Planned staging — guarantee the exact thing this step asks for is
          // actually there AND actually doable, instead of hoping the ambient
          // spawner or the loot RNG provides one. A drill that can't be
          // completed is a soft-lock. (Ambient enemies only start flowing from
          // `kill` onward; see TUTORIAL_QUIET_STEPS / continuousSpawn above.)
          if (step.id === 'sprint') {
            // Sprinting is cancelled by the crouch stance, so a player who
            // crouched during the movement drill could never satisfy this one.
            isCrouching = false;
          } else if (step.id === 'kill') {
            let alive = 0;
            for (const e of enemies) if (!e.dead) alive++;
            if (alive === 0) {
              // Stage the target CLOSE and dead ahead. The normal 42-68m spawn
              // ring plus tutorial-slowed legs meant nearly a minute of standing
              // around waiting for something to shoot — the single biggest
              // reason this step read as broken.
              const facing = new THREE.Vector3();
              camera.getWorldDirection(facing);
              spawnEnemyBatch(1, undefined, false, 18, Math.atan2(facing.z, facing.x));
            }
          } else if (step.id === 'reload') {
            // Reloading a FULL magazine is a no-op — open a visible gap so the
            // drill always has something to top up.
            const magMax = effectiveMaxAmmo(currentWeapon);
            if (ammo >= magMax) {
              ammo = Math.max(1, magMax - Math.max(1, Math.ceil(magMax * 0.35)));
              updateGameState();
            }
          } else if (step.id === 'ability') {
            abilityCooldown = 0; // the drill can't ask for a move that isn't ready
          } else if (step.id === 'powerup') {
            // PERSISTENT: staged exactly once, and this step cannot be
            // completed without it — so it is exempt from the pickup TTL and
            // from live-cap eviction.
            const spot = findPickupSpot(camera.position.x, camera.position.z, 3, 6);
            spawnPickup(spot.x, spot.z, randomLoot(), true);
          }
        } else if (step && step.completed !== tutorialLastStepDone) {
          // ── JUST SATISFIED ── push the confirmation the instant the action
          // lands so the practise banner flips to "Nice!" rather than sitting
          // there looking like the input did nothing.
          tutorialLastStepDone = step.completed;
          setTutorialStep({ ...step });
          setTutorialProgress(tutorial.getProgress());
        } else if (!step) {
          // ── RUN OVER ── finished, or ended from the card. Either way the
          // player gets their whole kit back (`isGranted` opens up once the
          // system goes inactive).
          tutorialGuidedOn = false;
          syncTutorialLocks();
          setShowTutorial(false);
          setTutorialStep(null);
          if (tutorialRunningRef.current) {
            // Completed for real — the celebration card owns the screen until
            // the player picks Keep Playing / Main Menu. The last step finished
            // mid-practise with the pointer LOCKED, so hand the cursor back or
            // its buttons are unclickable. Blocking stays on so the game's own
            // mousedown handler can't read a click on that card as a
            // "re-acquire pointer lock" click; each button clears it itself.
            tutorialRunningRef.current = false;
            tutorialActiveRef.current = true;
            if (document.pointerLockElement) document.exitPointerLock();
            setTutorialComplete(true);
          } else {
            // "End Tutorial" — that handler already restored the pointer lock.
            tutorialActiveRef.current = false;
          }
        }
      }

      // Update multiplayer (sync player position + crouch + held weapon)
      if (isMultiplayer && multiplayerManager) {
        multiplayerManager.updatePlayerPosition(camera.position, euler, isCrouching);
        // Broadcast weapon swaps so remote avatars hold the right gun (no-ops
        // internally until the weapon actually changes).
        multiplayerManager.setCurrentWeapon(currentWeapon);
        // Catch-all health re-sync: fires only when whole HP actually changes, so
        // gradual heals (regen/lifesteal) and the Medic patch reach teammates and
        // their wound overlay opens/closes in real time. Damage/pickups also push
        // health directly; this just guarantees nothing is missed.
        if (!isGameOver) {
          const hpRounded = Math.round(health);
          if (hpRounded !== lastBroadcastHealth) {
            lastBroadcastHealth = hpRounded;
            multiplayerManager.updatePlayerHealth(health);
          }
        }
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
      localPlayerShadow.setCrouch(isCrouching);
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

      // Drive the shared wind — grass, foliage sway + the High/Ultra prop wind
      // pass all ride one clock. The live weather front modulates the gust: a
      // calm clear sky breathes gently (~1), a rolling storm thrashes the
      // vegetation (rainAmount pushes the gust up to ~2.6). Wetting fronts that
      // aren't precipitation (gloom) still stir a light breeze via skyDarken.
      const windElapsed = clock.getElapsedTime();
      const windGust = 1 + weatherMods.rainAmount * 1.6 + weatherMods.skyDarken * 0.5;
      currentWindGust = windGust; // shared with effects spawned outside the loop
      biomeSystem.updateWind(windElapsed, windGust);

      // Advance the signature per-map ambience field (fireflies / embers /
      // spores / wisps). Camera-local, so re-centre it on the player; night
      // lifts its glow. No-op below High/Ultra (never constructed there).
      if (mapAmbience) {
        mapAmbience.update(
          windElapsed, camera.position,
          THREE.MathUtils.clamp(atmosphericSettings.starIntensity, 0, 1),
        );
      }

      // Age / fade / cull the environment bullet marks. Cheap per-frame pass
      // (≤ cap live meshes): fades expired marks out, and reclaims any that fell
      // outside the cull radius so leaving a firefight frees its marks.
      bulletDecals.update(rawDelta, camera.position, decalCullDist);

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
          // The ability prop is normally hidden by its own update() tracking the
          // weapon's visibility — but photo mode returns from the loop BEFORE
          // that runs, so it has to be switched off here or an armed Engineer's
          // firing device hangs in every screenshot.
          if (abilityProp) abilityProp.group.visible = false;
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
        // The scope picture is driven further down the loop, which this skips —
        // and its overlay unmounts while paused/over. Hand the weapon back so a
        // player who pauses mid-scope isn't left looking at an empty screen,
        // and clear the cached aperture so a remount re-writes it (a stale
        // cache would leave the overlay opaque with a zero-width aperture).
        gunModel.clearScope();
        scopeApfLast = '';
        // A flame jet must never be left frozen mid-burst with its pooled light
        // still burning. A PAUSE freezes it with everything else (correct — the
        // world is stopped), but a DEATH ends the run, so the valve is shut and
        // the fire is allowed to keep burning down and hand its light back.
        if (isGameOver) {
          if (pyroBurstTime >= 0) { pyroBurstTime = -1; fireSystem.setJet(false); }
          fireSystem.update(rawDelta);
        }
        composePostFX(rawDelta);
        return;
      }

      // ── TOUCH LOOK + AUTO-AIM ── consume the right-half swipe delta into the
      // base aim (`euler`), mirroring the desktop onMouseMove handler, then
      // derive ADS from the FIRE state (no aim button on touch). Guarded so the
      // desktop path is untouched.
      if (touchControls.enabled) {
        const tSens = 0.0032 * sensitivityMultiplier;
        const ldx = touchControls.consumeLookX();
        const ldy = touchControls.consumeLookY();
        const looked = ldx !== 0 || ldy !== 0;
        if (looked) {
          euler.y -= ldx * tSens;
          euler.x -= ldy * tSens;
          euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
          if (isTutorialMode) recordTutorialHold('look');
        }
        // ── AUTO-AIM DOWN SIGHTS ── there is no ADS button on touch, so FIRE
        // itself brings up the sights for any aim-capable weapon (CODM-style).
        // A short linger past the last shot keeps the zoom steady through
        // tap-fire; weapons that can't aim (e.g. the Subverter) just shoot.
        const nowMs = performance.now();
        if (mouseDown) mobileAdsLingerUntil = nowMs + 260;
        const autoAimHeld = mouseDown || nowMs < mobileAdsLingerUntil;
        isAiming = autoAimHeld && WEAPONS[currentWeapon].canAim === true;

        // ── AIM ASSIST (mobile/tablet only) ── a light drag toward the target
        // the player is ALREADY on, not a lock-on. This is deliberately weak:
        // an earlier build snapped the camera onto the nearest enemy and played
        // like an aimbot. The player must do the aiming; this only shaves the
        // last few pixels of thumb imprecision. It never locks, a deliberate
        // swipe always wins, and it stays idle when the player isn't
        // interacting so the camera never drifts on its own.
        const firing = autoAimHeld;
        // Hardened gate: the magnetism runs ONLY in a genuine touch session
        // (real touch hardware + a trusted touch event + no mouse used this
        // session). Desktop can never satisfy it — see touchControls.
        if (touchControls.assistAllowed() && (firing || looked)) {
          camera.getWorldDirection(_assistFwd);
          // TIGHT cone: the reticle must already be essentially on the target
          // for any help at all, so the assist can't hunt for enemies the
          // player never aimed at.
          const ACQUIRE_COS = 0.9945; // ~6° cone
          const ASSIST_RANGE = 55;
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
            // ~10% of a lock. At 0.032/frame the camera closes only a small
            // fraction of the remaining error per second, so it reads as the
            // reticle "settling" rather than snapping — the player still has
            // to track the target themselves. Scaled by how centred the target
            // already is, so help fades out toward the edge of the cone.
            const closeness = (bestDot - ACQUIRE_COS) / (1 - ACQUIRE_COS);
            const pull = (firing ? 0.032 : 0.008) * (0.35 + 0.65 * closeness);
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

      // ── AUTO-RELOAD (single-shot weapons) ──────────────────────────────
      // The launcher holds one rocket, so the operator starts loading the next
      // the instant the tube is empty instead of waiting for a trigger pull on
      // nothing. Driven from the loop rather than from shoot() so it runs after
      // the shot has fully resolved, and it covers every path that can empty
      // the weapon. startReload() carries its own paused/game-over/tutorial and
      // already-reloading guards, so this is a single cheap check.
      if (WEAPONS[currentWeapon].autoReload && ammo <= 0 && !isReloading) {
        startReload();
      }

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
      // Ability kick eases back a touch slower than recoil for a weightier feel.
      const abilityRecover = Math.min(1, rawDelta * 6.5);
      abilityKickPitch += (0 - abilityKickPitch) * abilityRecover;
      abilityKickRoll += (0 - abilityKickRoll) * abilityRecover;
      _recoilEuler.set(
        Math.max(-PI_2, Math.min(PI_2, euler.x + recoilPitch + abilityKickPitch + wiringPitch)),
        euler.y + recoilYaw,
        abilityKickRoll,
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

        // ── TIME-OF-DAY AMBIENCE ──────────────────────────────────────────
        // Retint + resize the motes from the live day cycle so the air reads
        // differently as the clock turns: fine pale dust catching the light by
        // day → bigger, glowing fireflies that breathe at night, crossfading
        // through the golden hours. `starIntensity` (0 day → 1 night) is the
        // natural night factor, so this tracks auto, day AND night modes.
        if (ambientParticles.material instanceof THREE.PointsMaterial) {
          const night = THREE.MathUtils.clamp(atmosphericSettings.starIntensity, 0, 1);
          const mat = ambientParticles.material;
          // Soft-sprite motes read larger than the old hard squares, so both
          // size and opacity sit lower — fine luminous pollen by day, gentle
          // ember-fireflies at night, never a screen of glowing dots.
          mat.size = 0.045 + night * 0.075;
          mat.color.copy(_moteColor.copy(_moteColorDay).lerp(_moteColorNight, night));
          // Gentle firefly breathing at night; steady, faint motes by day.
          const twinkle = night > 0.12 ? 0.78 + Math.sin(elapsed * 1.6) * 0.22 : 1;
          mat.opacity = (0.22 + night * 0.42) * twinkle;
        }

        for (let i = 0; i < AMBIENT_PARTICLE_COUNT; i++) {
          const ix = i * 3;
          // Gentle sine drift
          posAttr.array[ix] += vels[ix] * delta + Math.sin(elapsed * 0.5 + phs[i]) * 0.005;
          posAttr.array[ix + 1] += vels[ix + 1] * delta + Math.sin(elapsed * 0.3 + phs[i] * 2) * 0.003;
          posAttr.array[ix + 2] += vels[ix + 2] * delta + Math.cos(elapsed * 0.4 + phs[i]) * 0.005;

          // Re-center particles that drift too far from player. The vertical
          // band matches the lower spawn range — motes live in the air the
          // player actually looks through, not high above the canopy line.
          const dx = posAttr.array[ix] - camera.position.x;
          const dz = posAttr.array[ix + 2] - camera.position.z;
          if (Math.abs(dx) > 30 || Math.abs(dz) > 30 || posAttr.array[ix + 1] < 0.4 || posAttr.array[ix + 1] > 7) {
            posAttr.array[ix] = camera.position.x + (Math.random() - 0.5) * 50;
            posAttr.array[ix + 1] = 0.6 + Math.random() * 4.9;
            posAttr.array[ix + 2] = camera.position.z + (Math.random() - 0.5) * 50;
          }
        }
        posAttr.needsUpdate = true;
      }

      // Update ability cooldown (real-time, shared by every character ability)
      if (abilityCooldown > 0) {
        abilityCooldown -= rawDelta;
      }

      // ── ENGINEER ARMED BOMB — wiring animation + blinking detonator ──
      // Drives the visual "coming online" of a wired barrel: the detonator kit
      // snaps into place as it arms, then the LED + antenna tip + energy band
      // pulse with an urgent blink so the player can spot their live bomb.
      const ab = armedBomb;
      if (ab && ab.bombKit) {
        const kit = ab.bombKit;
        ab.armProgress = Math.min(1, (ab.armProgress ?? 0) + rawDelta / DEMO_ARM_TIME);
        const ap = ab.armProgress;
        kit.scale.setScalar(0.5 + 0.5 * ap);  // snap into place while arming
        const blinkHz = ap < 1 ? 4 : 7;        // urgent blink once armed
        const blink = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * blinkHz * Math.PI * 2);
        if (ab.bombLight) ab.bombLight.scale.setScalar(0.05 + blink * 0.055);
        if (ab.bombTip) ab.bombTip.scale.setScalar(0.04 + blink * 0.03);
        if (ab.bombBand) {
          (ab.bombBand.material as THREE.MeshBasicMaterial).opacity = 0.28 + blink * 0.45;
          ab.bombBand.scale.setScalar(1 + blink * 0.06);
        }
      }

      // ── ENGINEER WIRING POSE ────────────────────────────────────────────
      // While the wiring animation plays the view dips toward the barrel and the
      // gun drops into a wiring pose; only once the bend-and-wire finishes does
      // the firing device come up into the LEFT hand (below).
      if (wiringTime > 0) wiringTime = Math.max(0, wiringTime - rawDelta);
      const wiringOn = wiringTime > 0;
      gunModel.setWiring(wiringOn);
      wiringPitch += ((wiringOn ? DEMO_BEND : 0) - wiringPitch) * Math.min(1, rawDelta * 9);

      // ── ABILITY PROP (the left hand) ─────────────────────────────────────
      // One update drives whichever piece of equipment this character carries.
      // The Engineer's device is the only one that STAYS up between casts (as
      // long as a bomb is live); the rest are raised by their own choreography.
      if (abilityProp) {
        if (abilityProp.kind === 'detonator') {
          abilityProp.setHeld(!!armedBomb && !wiringOn);
        }
        // Hidden alongside the weapon (photo mode hides the whole viewmodel).
        abilityProp.update(rawDelta, gunModel.group.visible);
        // The prop owns the support hand: take the arm off the gun and roll the
        // weapon into a one-handed carry for as long as it's up.
        gunModel.setOneHanded(abilityProp.handBlend > 0.15);
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
      // ── ARK-07 EQUIPMENT JAM ── standing deep in a relay's interference
      // field fries every ACTIVE timed boost: clamp their end-times to now so
      // the ordinary expiry handling below (flags, kill-feed notices) retires
      // them on this same frame. Invincibility is deliberately exempt — a
      // grace window must never be jammed away mid-save. New activations are
      // blocked separately at the use-power gate.
      if (playerSignalJammed) {
        speedBoostEndTime = Math.min(speedBoostEndTime, now);
        damageBoostEndTime = Math.min(damageBoostEndTime, now);
        infiniteAmmoEndTime = Math.min(infiniteAmmoEndTime, now);
        shieldEndTime = Math.min(shieldEndTime, now);
        overchargeEndTime = Math.min(overchargeEndTime, now);
        phantomEndTime = Math.min(phantomEndTime, now);
        teslaEndTime = Math.min(teslaEndTime, now);
        rapidFireEndTime = Math.min(rapidFireEndTime, now);
      }
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
      if (teslaActive && now >= teslaEndTime) {
        teslaActive = false;
        if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Tesla Coil Expired', 'powerup');
      }
      // Drive the chain-lightning arcs while the Tesla aura is live.
      updateTesla();
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
        // One left arm, one thing in it: while an ability prop is up the shield
        // is slung rather than braced. It keeps ABSORBING (the player earned
        // that) but it visually gets out of the way for the ~1s the prop is in
        // frame, then comes straight back up — no two objects in one hand.
        const propInHand = (abilityProp?.handBlend ?? 0) > 0.2;
        const raiseTarget = shieldActive && !propInHand ? 1 : 0;
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
          // ── UNFOLD ──
          // The panel comes up folded and the two wings swing out to full width
          // with the skirt dropping under them. Deliberately LAGS the raise
          // (`shieldRaise - 0.25`) so the player sees the shield arrive and THEN
          // open, rather than a finished object fading in. A blocked hit shakes
          // the wings on their hinges; a shatter throws them back open.
          const deployTarget = shieldActive ? Math.max(0, (shieldRaise - 0.25) / 0.75) : 0;
          shieldDeploy += (deployTarget - shieldDeploy) * Math.min(1, delta * 9);
          const d = shieldDeploy * shieldDeploy * (3 - 2 * shieldDeploy);
          // Overshoot then settle — the hinges hit their stops and rebound.
          const settle = Math.sin(Math.min(1, shieldDeploy) * Math.PI) * 0.10;
          const hinge = (1 - d) * 2.25 - settle + shieldHitFlash * 0.10 + shieldBreakFlash * 0.5;
          for (let wi = 0; wi < shieldWings.length; wi++) {
            // −1 wing folds one way, +1 the other, so they close onto the panel.
            shieldWings[wi].rotation.y = (wi === 0 ? 1 : -1) * hinge;
          }
          shieldSkirt.rotation.x = -((1 - d) * 2.0 - settle * 0.6);
        }
        shieldHitFlash = Math.max(0, shieldHitFlash - delta * 4);
        shieldBreakFlash = Math.max(0, shieldBreakFlash - delta * 2.5);
      }
      applyPhantomVisual(phantomActive);

      // ── FIRE: THE PYRO'S JET, THE GROUND, AND WHAT'S BURNING ────────────
      // The jet is strapped to the player's arm, so while the valve is open the
      // emitter follows them and the front widens as the pressure builds.
      if (pyroBurstTime >= 0) {
        pyroBurstTime += rawDelta;
        const bp = Math.min(1, pyroBurstTime / PYRO_BURST_SEC);
        const front = PYRO_MIN_RADIUS + (PYRO_MAX_RADIUS - PYRO_MIN_RADIUS) * Math.sqrt(bp);
        fireSystem.aimJet(
          camera.position.x,
          camera.position.y - currentCameraHeight + 0.35,
          camera.position.z,
          front,
        );
        // Direct damage on a fixed cadence — a flamethrower cooks, it doesn't
        // one-shot, so the ticks are small and the burn is where the payoff is.
        if (now >= pyroNextTickAt) {
          pyroNextTickAt = now + PYRO_TICK_MS;
          const f2 = front * front;
          for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead || e.health <= 0) continue;
            const dx = e.mesh.position.x - camera.position.x;
            const dz = e.mesh.position.z - camera.position.z;
            if (dx * dx + dz * dz > f2) continue;
            // A Revenant's shield phases the flame off — no damage, no ignite.
            if (revShieldUp(e)) { pingRevShield(e, e.mesh.position); continue; }
            const dmg = Math.min(ABILITY_DAMAGE_CAP, PYRO_TICK_DAMAGE);
            if (isMpGuest && mp) {
              if (e.netId !== undefined) mp.sendEnemyHit(e.netId, dmg, false);
            } else {
              e.health -= dmg;
              if (e.health <= 0) { handleEnemyKilled(e, false); continue; }
              e.damageFlashTime = Math.max(e.damageFlashTime, 0.3);
            }
            igniteEnemy(e, PYRO_BURN_MS, PYRO_BURN_DPS);
          }
        }
        // Fuel that lands keeps burning: patches are laid down around the front
        // as it sweeps, which is what turns the power into area denial.
        if (now >= pyroNextPatchAt) {
          pyroNextPatchAt = now + 110;
          const pa = Math.random() * Math.PI * 2;
          const pr = front * (0.45 + Math.random() * 0.5);
          const px = camera.position.x + Math.cos(pa) * pr;
          const pz = camera.position.z + Math.sin(pa) * pr;
          fireSystem.ignite(px, visualGroundY(px, pz) + 0.02, pz, 1.5 + Math.random() * 1.1, PYRO_PATCH_LIFE);
        }
        if (pyroBurstTime >= PYRO_BURST_SEC) {
          pyroBurstTime = -1;
          fireSystem.setJet(false);
        }
      }
      // Burning ground sets alight (and, on the authority, directly damages)
      // whatever stands in it. The player is immune to their own fuel — the Pyro
      // is the one wearing the suit, and self-damage on your own signature power
      // is a trap, not depth. On a guest the patch only IGNITES: the burn tick
      // below carries the damage, which keeps one message per burning enemy
      // instead of one per enemy per patch.
      for (let pi = 0; pi < fireSystem.patches.length; pi++) {
        const patch = fireSystem.patches[pi];
        if (patch.life <= 0) continue;
        if (now < patch.nextTickAt) continue;
        patch.nextTickAt = now + BURN_TICK_MS;
        // A column of sooty smoke off every burning patch — thickest while the
        // fuel is fresh, thinning as it dies back to embers.
        if (Math.random() < 0.55 * (patch.life / patch.maxLife)) {
          ventFireSmoke(patch.x, patch.y, patch.z, patch.radius);
        }
        const pr2 = patch.radius * patch.radius;
        for (let i = 0; i < enemies.length; i++) {
          const e = enemies[i];
          if (e.dead || e.health <= 0) continue;
          const dx = e.mesh.position.x - patch.x;
          const dz = e.mesh.position.z - patch.z;
          if (dx * dx + dz * dz > pr2) continue;
          if (revShieldUp(e)) continue;
          if (!isMpGuest) {
            e.health -= PYRO_PATCH_DPS * (BURN_TICK_MS / 1000);
            if (e.health <= 0) { handleEnemyKilled(e, false); continue; }
            e.damageFlashTime = Math.max(e.damageFlashTime, 0.2);
          }
          igniteEnemy(e, PYRO_PATCH_BURN_MS, PYRO_BURN_DPS);
        }
      }
      // Burn damage-over-time. Fixed cadence, so frame rate can never change how
      // much a fire hurts; a guest reports each tick and lets the host resolve
      // health and kills.
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e.burnFx) continue;
        if (e.dead || e.health <= 0 || now >= (e.burnUntil ?? 0)) {
          clearEnemyBurn(e);
          continue;
        }
        if (now < (e.burnNextTickAt ?? 0)) continue;
        e.burnNextTickAt = now + BURN_TICK_MS;
        const burnDmg = (e.burnDps ?? 0) * (BURN_TICK_MS / 1000);
        // A robot cooking from the inside vents — reuses the already-pooled,
        // already-warmed smoke puff rather than a new effect.
        if (Math.random() < 0.35) ventEnemySmoke(e, false);
        if (isMpGuest) {
          if (mp && e.netId !== undefined) mp.sendEnemyHit(e.netId, burnDmg, false);
          continue;
        }
        e.health -= burnDmg;
        e.damageFlashTime = Math.max(e.damageFlashTime, 0.15);
        if (e.health <= 0) handleEnemyKilled(e, false);
      }
      fireSystem.update(rawDelta);

      // Player movement with weight-based speed and ability effects.
      // On touch, the analog joystick contributes to both "is moving" and the
      // sprint intent (pushed to the outer ring).
      const touchMoving = touchControls.enabled && touchControls.moving && !tutorialLocks.move;
      const isMoving = moving('moveForward') || moving('moveBackward') || moving('moveLeft') || moving('moveRight') || touchMoving;
      const wantsToSprint = (held('sprint') || (touchControls.enabled && touchControls.sprinting))
        && !isCrouching && !tutorialLocks.sprint;
      // Stamina gates sprinting. Once exhausted, the player must let
      // stamina rebuild past STAMINA_REQUIRED_TO_SPRINT before they
      // can sprint again — prevents 0-stamina stutter-sprint exploit.
      if (staminaExhausted && stamina >= STAMINA_REQUIRED_TO_SPRINT) {
        staminaExhausted = false;
      }
      // Aiming down sights cancels the sprint (COD-style) so the two poses
      // never fight each other — release aim to sprint again.
      const isRunning = wantsToSprint && isMoving && !staminaExhausted && !aimingActive;

      // ── GUIDED TUTORIAL — walk/sprint practice + the touch "not yet" notice.
      // The joystick has no keydown to hang an explanation on (that path is
      // handled in onKeyDown), so a locked push is answered here instead.
      if (isTutorialMode) {
        if (isMoving) recordTutorialHold('move');
        if (isRunning) recordTutorialHold('sprint');
        if (touchControls.enabled && touchControls.moving) {
          if (tutorialLocks.move) tutorialLockedNotice(TUT_LOCK_MOVE);
          else if (tutorialLocks.sprint && touchControls.sprinting) tutorialLockedNotice(TUT_LOCK_SPRINT);
        }
      }

      // Mirror the stance out for weapon bloom (shoot() + dynamic crosshair),
      // and recover sustained-fire bloom while the trigger is at rest.
      moveStateMoving = isMoving;
      moveStateRunning = isRunning;
      fireBloom = Math.max(0, fireBloom - rawDelta * 2.6);
      // Drive the dynamic crosshair — map the live aim spread to a pixel gap so
      // the reticle blooms with movement/fire (only the 'dynamic' style reads it).
      if (crosshairRef.current) {
        const px = Math.min(34, computeAimSpread() * 190);
        crosshairRef.current.style.setProperty('--chs', `${px.toFixed(2)}px`);
      }

      // ── SNIPER SCOPE PICTURE ────────────────────────────────────────────
      // Two staggered curves. The dark veil closes FIRST and is fully opaque
      // by SCOPE_TAKEOVER, which is exactly when GunModel swaps the 3D optic
      // away — so the handover happens behind a black screen. Only then does
      // the aperture iris open, revealing the world at full width instead of
      // through the scope's ~7° bore. Reversing out plays it backwards.
      const scopeAim = gunModel.getScopeBlend();
      const scopeVeil = THREE.MathUtils.smoothstep(scopeAim, 0.42, SCOPE_TAKEOVER);
      if (!scopeOverlayRef.current) {
        // Overlay isn't mounted (paused / game over): drop the cache so the
        // next mount gets a fresh aperture write rather than a black screen.
        scopeApfLast = '';
      } else {
        const el = scopeOverlayRef.current;
        if (scopeVeil <= 0.002) {
          if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
          scopeApfLast = '';
        } else {
          if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
          el.style.opacity = scopeVeil.toFixed(3);
          // Only write the aperture when it actually moves: it drives a
          // full-screen radial-gradient, and re-writing it while the player
          // holds a steady scope would repaint the whole viewport every frame.
          const apf = THREE.MathUtils.smoothstep(scopeAim, 0.56, 0.93).toFixed(4);
          if (apf !== scopeApfLast) {
            el.style.setProperty('--apf', apf);
            scopeApfLast = apf;
          }
        }
      }
      // The hip-fire reticle has no business floating over a scope picture.
      if (crosshairRef.current) {
        crosshairRef.current.style.opacity = (1 - scopeVeil).toFixed(3);
      }

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

      // Wading through brush slows the player (deepest dead-centre in a bush).
      // Recomputed here and reused by the footstep rustle. No-op off foliage.
      bushSlowMul = bushWadeAt(camera.position.x, camera.position.z);

      // ── HAZARD POOLS ───────────────────────────────────────────────────
      // Lava burns, sludge corrodes, ice is slick. Until now all three were
      // painted decoration, which is a large part of why the eight maps only
      // differed by colour grade — the terrain never had a rule attached.
      playerHazard = hazardAt(camera.position.x, camera.position.z);
      if (playerHazard) {
        const rule = HAZARD_RULES[playerHazard.kind];
        // runCtx.nowMs is the frame's single cached Date.now() (set in the
        // RunContext refresh near the top of animate) — the movement block runs
        // before the enemy loop declares its own `frameNowMs`.
        const hzNow = runCtx.nowMs;
        if (rule.dps > 0 && hzNow >= nextHazardTickAt && !isGameOver) {
          nextHazardTickAt = hzNow + rule.tickMs;
          // Scaled by how deep in the pool the player is, so skirting the rim
          // is a real (and rewarded) option.
          const dmg = rule.dps * (rule.tickMs / 1000) * (0.45 + 0.55 * playerHazard.depth);
          takeEnemyDamage(dmg, playerHazard.kind === 'lava' ? 'Lava' : 'Toxic Sludge', null);
          if (playerHazard.kind === 'lava') {
            createParticles(camera.position, 0xff5522, 4);
            soundManager.play('playerHurt', 0.28, false, 1.35);
          } else {
            createParticles(camera.position, 0x9bd94a, 3);
          }
        }
      }

      // `frameScale` (see the 60 FPS normaliser above) is what keeps walk /
      // sprint / dash identical on a 60 Hz desktop and a 120 Hz phone. It is
      // folded in HERE so all three read it — currentSpeed and the dash below
      // are both derived from baseSpeed.
      // Hazard movement multiplier — lava and sludge drag, ice is slick and
      // slightly FASTER (its danger is the loss of precise control, not speed).
      const hazardSlowMul = playerHazard
        ? 1 - (1 - HAZARD_RULES[playerHazard.kind].slow) * playerHazard.depth
        : 1;
      const baseSpeed = moveSpeed * frameScale * weightSpeedMultiplier * powerupSpeedMult * crouchMult * bushSlowMul * hazardSlowMul * weatherMoveMult * (1 + skillBonus('moveSpeed')) * (mpMods.speedMult ?? 1) * perkBonuses.moveSpeedMult;
      let currentSpeed = isRunning ? baseSpeed * sprintMultiplier : baseSpeed;

      // Apply dash speed if dashing
      if (isDashing) {
        currentSpeed = baseSpeed * dashSpeed;
      }

      // === SMOOTH CROUCH CAMERA HEIGHT TRANSITION ===
      // The engineer physically BENDS DOWN to wire a barrel: while the wiring
      // animation plays (`wiringOn`, set above) the eye drops below even the
      // normal crouch so it reads as kneeling over the TNT, then springs back
      // up once the bomb is armed. This stacks with the view-pitch dip
      // (`wiringPitch`) and the gun's wiring pose for a full "crouch → wire →
      // stand up" beat.
      const WIRING_EYE_HEIGHT = 2.5; // deep bend over the barrel (< crouchHeight)
      const targetCameraHeight = wiringOn
        ? WIRING_EYE_HEIGHT
        : (isCrouching ? crouchHeight : standingHeight);
      currentCameraHeight = THREE.MathUtils.lerp(currentCameraHeight, targetCameraHeight, rawDelta * 12);

      // ── WEAPON MASS + INERTIA ──────────────────────────────────────────
      // Mirror the equipped weapon's weight into the viewmodel every frame
      // (never at the switch sites — five of them, guaranteed to drift), then
      // feed it how far the view actually turned. The gun lags that turn and
      // springs back, which is what makes a heavy weapon feel heavy.
      gunModel.setWeaponMass(WEAPONS[currentWeapon].weight);
      let lookDYaw = euler.y - prevLookYaw;
      // Yaw is unbounded and wraps; a wrap would otherwise read as a 360° whip.
      if (lookDYaw > Math.PI) lookDYaw -= Math.PI * 2;
      else if (lookDYaw < -Math.PI) lookDYaw += Math.PI * 2;
      gunModel.updateInertia(delta, lookDYaw, euler.x - prevLookPitch);
      prevLookYaw = euler.y;
      prevLookPitch = euler.x;

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
      // Muzzle-flash light cutoff (timestamp-driven — see shoot()).
      if (gunLight.intensity > 0 && performance.now() >= gunLightOffAt) {
        gunLight.intensity = 0;
      }
      // Airborne weapon inertia + landing dip
      gunModel.updateJump(delta, isJumping, velocityY);
      // Decay one-shot flourishes (dash, abilities)
      gunModel.updateActions(delta);
      // Subverter: keep the deck's visible intrusion chips in lockstep with the
      // live chip count — a fired chip launches off the deck, a pickup slams one
      // back in (no-ops for every other weapon and while reloading).
      gunModel.updateSubverterAmmo(ammo);
      gunModel.applyAnimations(); // Combine all animation offsets into final transform

      // (Player ground shadow now lives in LocalPlayerShadow — driven below
      // alongside the remote-player avatars.)

      // Reuse vectors instead of allocating new ones each frame
      camera.getWorldDirection(_moveDirection);
      _moveDirection.y = 0;
      _moveDirection.normalize();

      _moveRight.crossVectors(camera.up, _moveDirection).normalize();

      // DASH movement - override normal movement. The dash is NOT blocked by
      // barrels — it charges straight THROUGH them, setting off any it passes
      // over (which then blasts the player + nearby enemies; that's the risk).
      if (isDashing) {
        const newX = camera.position.x + dashDirection.x * currentSpeed;
        const newZ = camera.position.z + dashDirection.z * currentSpeed;
        if (!checkTerrainCollision(newX, newZ, camera.position.y)) {
          camera.position.x = newX;
          camera.position.z = newZ;
        }
        detonateBarrelsNear(camera.position.x, camera.position.z, 2.8);

        // Charge trail — a stream of cyan motion sparks left in the player's
        // wake so the Ranger's lunge reads as a streaking dash, not a teleport.
        // Spawned just behind + below the camera, rate-limited to a couple per
        // frame so it stays cheap.
        _tempVec3.set(
          camera.position.x - dashDirection.x * 1.2,
          camera.position.y - 0.7,
          camera.position.z - dashDirection.z * 1.2,
        );
        createParticles(_tempVec3, 0x66e8ff, 4);

        // ── TRAMPLE — the Ranger's charge bowls through robots ────────────
        // The charge claims exactly ONE outright kill: the enemy CLOSEST to the
        // point of impact is flattened + launched (run-over ragdoll). Every
        // other robot it ploughs through is heavily damaged but SURVIVES (health
        // is clamped so it can never be the second kill) and gets shoved aside —
        // so a dash into a crowd punches a hole through it without wiping it.
        // Each enemy is hit at most once per charge (dashHitEnemies).
        const TRAMPLE_RADIUS_SQ = 2.6 * 2.6;
        // First find the lethal target this frame: the nearest fresh, non-boss
        // contact (only while the charge's single kill is still unspent).
        let lethalTarget: Enemy | null = null;
        if (!dashLethalUsed) {
          let bestD2 = Infinity;
          for (let di = 0; di < enemies.length; di++) {
            const te = enemies[di];
            if (te.dead || dashHitEnemies.has(te)) continue;
            // Bosses are never trample-killed (too important for a 5s cooldown).
            if (te.type === 'boss') continue;
            // A shielded Revenant phases off the charge — never the lethal target.
            if (revShieldUp(te)) continue;
            const tdx = te.mesh.position.x - camera.position.x;
            const tdz = te.mesh.position.z - camera.position.z;
            const d2 = tdx * tdx + tdz * tdz;
            if (d2 > TRAMPLE_RADIUS_SQ) continue;
            if (d2 < bestD2) { bestD2 = d2; lethalTarget = te; }
          }
        }
        for (let di = 0; di < enemies.length; di++) {
          const te = enemies[di];
          if (te.dead || dashHitEnemies.has(te)) continue;
          const tdx = te.mesh.position.x - camera.position.x;
          const tdz = te.mesh.position.z - camera.position.z;
          if (tdx * tdx + tdz * tdz > TRAMPLE_RADIUS_SQ) continue;
          dashHitEnemies.add(te);
          // A Revenant's shield phases off the dash trample — it pings, no damage.
          if (revShieldUp(te)) { pingRevShield(te, te.mesh.position); continue; }

          const isLethal = !dashLethalUsed && te === lethalTarget;
          // The one kill is flattened; everyone else takes a brutal chunk that
          // is CLAMPED to leave them alive (≥1 HP) so the charge never wipes
          // more than its single victim.
          const trampleDmg = isLethal
            ? Math.min(ABILITY_DAMAGE_CAP, te.maxHealth + 50)
            : Math.min(ABILITY_DAMAGE_CAP, te.maxHealth * 0.55);

          // Record the charge direction so the death ragdoll (or survivor
          // shove) launches the way the player is running.
          if (!te.hitImpulse) te.hitImpulse = new THREE.Vector3();
          te.hitImpulse.set(dashDirection.x, 0, dashDirection.z);
          te.damageFlashTime = 0.5;

          if (isMpGuest && mp) {
            // Guests don't own enemy health — report the trample to the host
            // (same path as bullets); local feedback below stays snappy.
            if (te.netId !== undefined) mp.sendEnemyHit(te.netId, trampleDmg, false);
          } else if (isLethal) {
            te.health -= trampleDmg;
          } else {
            // Survivors never drop below 1 HP from the charge itself.
            te.health = Math.max(1, te.health - trampleDmg);
          }
          if (isLethal) dashLethalUsed = true;

          // ── Crunchy impact feedback ──
          soundManager.play('enemyHit', 0.9, false, 0.7); // low-pitched metal thud
          createParticles(te.mesh.position, 0x66e8ff, isLethal ? 18 : 12); // dash-cyan energy burst
          _tempVec3_2.set(dashDirection.x, 0.25, dashDirection.z).normalize();
          robotSparks.push(new RobotHitSparks(scene, te.mesh.position.clone(), _tempVec3_2.clone(), isLethal ? 24 : 14));
          // Heavy dent on the chassis face the charge ploughed into.
          _smokeDir.set(te.mesh.position.x - dashDirection.x, te.mesh.position.y - dashDirection.y, te.mesh.position.z - dashDirection.z);
          stampEnemyDamage(te, trampleDmg, isLethal, undefined, _smokeDir);
          if (gameSettingsManager.getSetting('impactFeedback')) {
            _tempVec3.set(te.mesh.position.x, te.mesh.position.y + 1.0, te.mesh.position.z);
            impactBursts.push(new ImpactBurst(scene, _tempVec3.clone(), 0x8be8ff, isLethal ? 1.6 : 1.1));
          }
          if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
          haptic('hit');
          if (gameSettingsManager.getSetting('hitMarkers')) addHitMarker(false);
          // Micro hit-stop so the collision lands with weight.
          timeScale = 0.35;
          setTimeout(() => { timeScale = 1.0; }, 90);

          if (!isMpGuest && isLethal && te.health <= 0) {
            handleEnemyKilled(te, false);
            // Override the standard death with a full-force "run over" launch —
            // bowled hard forward along the charge, tumbling through the air.
            // This ALWAYS flings (independent of the ragdoll-physics toggle) so
            // the trample always reads as a body sent flying, and runs with extra
            // airtime + a higher arc so the launch is unmistakably visible.
            const launch = (te.type === 'tank' ? 12 : 18) + Math.random() * 3;
            te.deathVel = new THREE.Vector3(
              dashDirection.x * launch,
              9 + Math.random() * 2.5,
              dashDirection.z * launch,
            );
            te.deathSpin = new THREE.Vector3(
              (Math.random() - 0.5) * 18,
              (Math.random() - 0.5) * 11,
              (Math.random() - 0.5) * 20,
            );
            te.deathStarted = true;
            te.deathTime = 1.7; // longer than the standard 1.0s so the full arc shows
            if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Trampled!', 'combo');
          } else if (!isMpGuest) {
            // Survivor: shoved aside along the charge so the player barges
            // through rather than stalling on the body. Heavies dig in harder.
            const heavyChassis = te.type === 'tank' || te.type === 'boss' || te.isMiniBoss === true;
            const shove = heavyChassis ? 2.6 : 1.6;
            te.mesh.position.x += dashDirection.x * shove;
            te.mesh.position.z += dashDirection.z * shove;
          }
        }
      }

      // Movement with collision detection + wall-sliding (skip if dashing)
      if (!isDashing && moving('moveForward')) {
        attemptMove(_moveDirection.x * currentSpeed, _moveDirection.z * currentSpeed);
      }
      if (!isDashing && moving('moveBackward')) {
        attemptMove(-_moveDirection.x * currentSpeed, -_moveDirection.z * currentSpeed);
      }
      if (!isDashing && moving('moveLeft')) {
        attemptMove(_moveRight.x * currentSpeed, _moveRight.z * currentSpeed);
      }
      if (!isDashing && moving('moveRight')) {
        attemptMove(-_moveRight.x * currentSpeed, -_moveRight.z * currentSpeed);
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
          attemptMove(_touchMove.x * step, _touchMove.z * step);
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
      if (held('jump') && !tutorialLocks.move && !isJumping && jumpCooldown <= 0 && camera.position.y <= floorY + 0.1) {
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

      // Same 60 FPS normalisation as horizontal movement. `velocityY` stays in
      // "units per 60 FPS frame", so every threshold that reads it (the 0.45
      // normal-hop reference, the 0.62 screen-shake cut-off, gunModel.updateJump)
      // keeps its meaning — only the integration step is rate-corrected. Apex
      // height was already rate-independent; what this fixes is the TIME to
      // reach it, which used to halve on a 120 Hz panel and made the hop feel
      // twice as twitchy on mobile.
      velocityY -= gravity * frameScale;
      camera.position.y += velocityY * frameScale;

      // Land on the dynamic floor (ground or a rock top), accounting for crouch.
      if (camera.position.y <= floorY) {
        const impactSpeed = -velocityY; // downward speed at touchdown (>0 = falling)
        velocityY = 0;
        // SMOOTH AUTO STEP-UP: when the floor suddenly rises a long way under the
        // player (they walked onto a ledge), DON'T teleport the camera up — leave
        // it low and let the head-bob / idle-settle lerp below climb onto the
        // surface over a few frames. Only the tiny per-frame gravity dip and
        // genuine jump landings snap to the floor instantly.
        const floorRise = floorY - camera.position.y;
        if (floorRise <= 0.12 || wasJumping) {
          camera.position.y = floorY;
        }
        // Landing impact — weight-based camera dip when touching ground after a
        // jump. A normal hop (impactSpeed ≈ baseJumpPower 0.45) keeps the exact
        // old 0.3 dip; a drop off a ledge/boulder lands progressively heavier —
        // a deeper dip, a louder/lower thud, and (only for real falls) a touch of
        // screen shake — so verticality carries genuine physical weight.
        if (wasJumping) {
          const heavy = Math.max(0, impactSpeed - 0.45); // 0 for a normal hop
          landingImpact = THREE.MathUtils.clamp(0.3 + heavy * 1.1, 0.3, 0.8);
          jumpCooldown = JUMP_COOLDOWN_TIME; // Anti-bunny-hop cooldown
          wasJumping = false;
          // Heavier, lower-pitched footstep for the touchdown thud — scaled by fall.
          const thudVol = THREE.MathUtils.clamp(0.34 + heavy * 0.7, 0.34, 0.7);
          soundManager.play('footstep', thudVol, false, 0.78 - Math.min(0.18, heavy * 0.5));
          if (impactSpeed > 0.62 && gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
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
      if (isMoving && !isJumping && gameSettingsManager.getSetting('cameraBob')) {
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
      // Feed the adaptive system the player's MOVEMENT skill (distance + tactical
      // sprint usage) — it was never recorded, leaving the movement metric at 0
      // and under-reading skill. Cheap; only while moving + adaptive is active.
      if ((isAdaptiveMode || RUNTIME_PREFS.adaptiveDifficulty) && isMoving) {
        adaptiveDifficulty.recordMovement(camera.position.distanceTo(lastPlayerPosition), isRunning);
      }
      // Feed the Tactical Director the player's HORIZONTAL pace + position so it
      // can read camping vs kiting (ignore Y so a jump doesn't read as a sprint).
      if (tacticalActive) {
        const hStep = Math.hypot(
          camera.position.x - lastPlayerPosition.x,
          camera.position.z - lastPlayerPosition.z,
        );
        tacticalDirector.noteFrame(camera.position.x, camera.position.z, hStep / (delta > 0 ? delta : 0.016), delta);
      }
      lastPlayerPosition.copy(camera.position);

      // ── AUDIO LISTENER ───────────────────────────────────────────────────
      // Placed here deliberately: the camera has finished being mutated for
      // this frame (look, recoil, crouch height, weapon inertia are all above)
      // and footsteps — immediately below — are the frame's first positional
      // sound. Cheap enough to run every frame; scratch vectors are module
      // scope so this allocates nothing.
      camera.getWorldDirection(_audioFwd);
      _audioUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      soundManager.setListener(
        camera.position.x, camera.position.y, camera.position.z,
        _audioFwd.x, _audioFwd.y, _audioFwd.z,
        _audioUp.x, _audioUp.y, _audioUp.z,
      );

      // ── FOOTSTEPS ────────────────────────────────────────────────────────
      // Emit a step each stride of real ground travel — stops naturally at
      // walls and while airborne, and speeds up when sprinting. Crouch steps
      // are shorter-strided and quieter so sneaking stays quiet.
      if (isMoving && !isJumping && camera.position.y <= currentCameraHeight + 0.35) {
        footstepAccum += Math.hypot(playerVelocity.x, playerVelocity.z) * rawDelta;
        const stride = isCrouching ? 6 : 9; // world units per step
        if (footstepAccum >= stride) {
          footstepAccum = 0;
          // Heavy rain masks footfalls — the drumming drowns them out.
          const vol = (isCrouching ? 0.1 : isRunning ? 0.26 : 0.18) * weatherFootstepMult;
          soundManager.play('footstep', vol, false, 0.9 + Math.random() * 0.16);
          // Pushing through brush adds a soft high-pitched leaf rustle on the
          // footfall, so the slowdown is felt as well as seen.
          if (bushSlowMul < 0.98) {
            const rustle = (1 - bushSlowMul) * 0.6; // scales with how deep in the bush
            soundManager.play('footstep', 0.12 + rustle * 0.18, false, 1.7 + Math.random() * 0.3);
          }
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
      // Materialise a single queued chunk per frame. The grid-accelerated
      // overlap test makes one chunk cheap, and capping at one guarantees the
      // streamer can never spike a frame; the queue drains far faster than the
      // player can reach the (fog-hidden, 200+ unit) outer ring.
      drainPendingChunks(1);
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

      // Update lingering muzzle smoke — drift, expand, fade.
      for (let i = muzzleSmokePuffs.length - 1; i >= 0; i--) {
        if (muzzleSmokePuffs[i].update(delta)) {
          muzzleSmokePuffs[i].dispose(scene);
          muzzleSmokePuffs.splice(i, 1);
        }
      }

      // Damaged-robot venting smoke (own pool; same MuzzleSmoke update path).
      for (let i = enemySmokePuffs.length - 1; i >= 0; i--) {
        if (enemySmokePuffs[i].update(delta)) {
          enemySmokePuffs[i].dispose(scene);
          enemySmokePuffs.splice(i, 1);
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

      // Update cinematic impact-confirm bursts (flash + shockring).
      for (let i = impactBursts.length - 1; i >= 0; i--) {
        if (impactBursts[i].update(delta)) {
          impactBursts[i].dispose(scene);
          impactBursts.splice(i, 1);
        }
      }

      // Update explosion fireballs (rocket + barrel blasts).
      for (let i = explosionEffects.length - 1; i >= 0; i--) {
        if (explosionEffects[i].update(delta)) {
          explosionEffects[i].dispose(scene);
          explosionEffects.splice(i, 1);
        }
      }

      // Update tactical-nuke detonations (rising mushroom cloud set-piece).
      for (let i = nukeEffects.length - 1; i >= 0; i--) {
        if (nukeEffects[i].update(delta)) {
          nukeEffects[i].dispose(scene);
          nukeEffects.splice(i, 1);
        }
      }

      // Update Pyro fire-nova shockwaves.
      for (let i = fireNovas.length - 1; i >= 0; i--) {
        if (fireNovas[i].update(delta)) {
          fireNovas[i].dispose(scene);
          fireNovas.splice(i, 1);
        }
      }

      // Update ability-cast bursts.
      for (let i = castEffects.length - 1; i >= 0; i--) {
        if (castEffects[i].update(delta)) {
          castEffects[i].dispose(scene);
          castEffects.splice(i, 1);
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
            // Bright brass "tink" on the FIRST real ground contact only — quick
            // micro-bounces afterward stay silent so it never machine-guns.
            if (!c.bounced && c.vel.y < -1.0) {
              c.bounced = true;
              soundManager.play('casing', 0.16, false, 0.9 + Math.random() * 0.3);
            }
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
          releaseCasing(c); // back to the free-list — no per-casing GC
          shellCasings.splice(i, 1);
        }
      }

      // Update bullet shatter shards — gravity, ground bounce + friction,
      // tumble, then shrink away. Shared geo/material so the only per-shard
      // cleanup is detaching from the scene.
      for (let i = bulletShards.length - 1; i >= 0; i--) {
        const s = bulletShards[i];
        s.life -= delta;
        s.vel.y -= 16 * delta; // gravity
        s.mesh.position.addScaledVector(s.vel, delta);
        if (s.mesh.position.y <= s.restY) {
          s.mesh.position.y = s.restY;
          if (s.vel.y < 0) {
            s.vel.y *= -0.34;             // bounce restitution
            s.vel.x *= 0.55; s.vel.z *= 0.55; // ground friction
            s.spin.multiplyScalar(0.5);
            if (Math.abs(s.vel.y) < 0.4) s.vel.y = 0; // settle
          }
        }
        s.mesh.rotation.x += s.spin.x * delta;
        s.mesh.rotation.y += s.spin.y * delta;
        s.mesh.rotation.z += s.spin.z * delta;
        // Shrink out in the last 0.35s (shared material → no per-mesh opacity).
        if (s.life < 0.35) s.mesh.scale.setScalar(Math.max(0.01, s.scale * (s.life / 0.35)));
        if (s.life <= 0) {
          releaseShard(s); // back to the free-list — no per-shard GC
          bulletShards.splice(i, 1);
        }
      }

      // Update robot hit sparks
      for (let i = robotSparks.length - 1; i >= 0; i--) {
        if (robotSparks[i].update(delta)) {
          robotSparks[i].dispose(scene);
          robotSparks.splice(i, 1);
        }
      }

      // Update Subverter intrusion beams
      for (let i = hackBeams.length - 1; i >= 0; i--) {
        if (hackBeams[i].update(delta)) {
          hackBeams[i].dispose(scene);
          hackBeams.splice(i, 1);
        }
      }

      // Update explosion craters — fade out, then recycle the rig. NEVER
      // dispose here: the geometries are shared session-long, and the rig's
      // materials go back to the pool (bounded; overflow frees materials only).
      for (let i = craters.length - 1; i >= 0; i--) {
        const crater = craters[i];
        crater.life -= rawDelta;
        if (crater.life <= 0) {
          scene.remove(crater.mesh);
          if (_craterRigPool.length < 8) {
            _craterRigPool.push(crater.rig);
          } else {
            crater.rig.scorchMat.dispose();
            crater.rig.ringMat.dispose();
            crater.rig.debrisMat.dispose();
          }
          craters.splice(i, 1);
          continue;
        }
        // Hold fully visible for the first 70%, then fade over the last 30%
        const fadeT = Math.min(1, crater.life / (crater.maxLife * 0.3));
        crater.rig.scorchMat.opacity = 0.92 * fadeT;
        crater.rig.ringMat.opacity = 0.85 * fadeT;
        crater.rig.debrisMat.opacity = fadeT;
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

      // Update power-ups.
      //
      // Iterated BACKWARDS so a finished pickup (collected, or decayed past its
      // TTL) can be spliced out on the spot. The array used to be append-only
      // for the whole run, so a 25-wave session ended up walking — and reading
      // the userData of — a hundred dead entries every single frame.
      const _puNowMs = Date.now();
      const _puNow = _puNowMs * 0.001;
      for (let pi = powerUps.length - 1; pi >= 0; pi--) {
        const powerUp = powerUps[pi];
        if (powerUp.collected) { powerUps.splice(pi, 1); continue; }
        {
          const root = powerUp.mesh as unknown as THREE.Group;

          // ── DECAY ───────────────────────────────────────────────────────
          // Checked BEFORE the sleep gate so loot left behind on the far side
          // of the map still times out. The last PICKUP_FADE_MS are a visible
          // warning: the crate shrinks and strobes so a player running for it
          // can tell it's about to go.
          // `?? Infinity`, not `|| 0`: if a future spawn path ever forgets to
          // stamp the clock, the safe failure is a crate that lingers — not one
          // that vanishes the instant it lands.
          const _puTimeLeft = ((root.userData.expireAt as number | undefined) ?? Infinity) - _puNowMs;
          if (_puTimeLeft <= 0) {
            despawnPickup(powerUp);
            powerUps.splice(pi, 1);
            continue;
          }
          const _puDecay = _puTimeLeft < PICKUP_FADE_MS ? _puTimeLeft / PICKUP_FADE_MS : 1;

          // ── Render-distance streaming (sleep/wake) ──────────────────────
          // Beyond the preset's view distance the pickup is despawned: hidden,
          // pooled light released, all animation below skipped. It rehydrates
          // (light re-acquired if a slot is free) when the player closes back
          // within the hysteresis radius. Collection can't trigger while
          // asleep — asleep implies the player is far out of pickup range.
          const _pdx = root.position.x - camera.position.x;
          const _pdz = root.position.z - camera.position.z;
          const _pDistSq = _pdx * _pdx + _pdz * _pdz;
          if (root.userData.asleep === true) {
            if (_pDistSq < PICKUP_WAKE_DIST_SQ) {
              root.userData.asleep = false;
              root.visible = true;
              const relight = acquirePickupLight(root.userData.coreColor as number);
              root.userData.light = relight;
              if (relight) relight.position.set(root.position.x, root.position.y, root.position.z);
            } else {
              continue; // stays despawned — zero per-frame cost
            }
          } else if (_pDistSq > PICKUP_SLEEP_DIST_SQ) {
            root.userData.asleep = true;
            root.visible = false;
            releasePickupLight(root.userData.light as THREE.PointLight | null | undefined);
            root.userData.light = null;
            continue;
          }

          root.rotation.y += delta * 2;

          // Materialize-in: pop from a point to full size with a soft
          // overshoot during the first 0.45s after spawn, then lock at 1.
          // The decay factor rides on top: as the TTL runs out the crate
          // visibly contracts toward its "about to wink out" size.
          const spawnAge = _puNowMs - ((root.userData.spawnAt as number) || 0);
          const _puShrink = 0.55 + 0.45 * _puDecay;
          if (spawnAge < 450) {
            const mt = spawnAge / 450;
            // easeOutBack — 0 → overshoot (~1.09) → settle at 1.
            const mb = mt - 1;
            const k = 1 + 2.70158 * mb * mb * mb + 1.70158 * mb * mb;
            root.scale.setScalar(Math.max(0.01, k * _puShrink));
          } else if (root.scale.x !== _puShrink) {
            root.scale.setScalar(_puShrink);
          }
          // Expiry strobe — the last few seconds flicker at an accelerating
          // rate, the universal "this is going away" language. Full-strength
          // pickups skip the test entirely (_puDecay === 1).
          if (_puDecay < 1) {
            const blinkHz = 2.5 + (1 - _puDecay) * 9;
            root.visible = Math.sin(_puNow * blinkHz * Math.PI * 2) > -0.45;
          }

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
            // Dims with the decay so a dying crate stops lighting the ground
            // like a fresh one — the beacon fades before the crate vanishes.
            light.intensity = (3.5 + pulse * 3.5) * _puDecay * (root.visible ? 1 : 0.25);
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
          // Crossed gyroscope ring — counter-rotates on its tilted axis with
          // a phase-offset pulse so the pair never reads as one rigid prop.
          const ring2 = root.userData.ring2 as THREE.Mesh | undefined;
          if (ring2) {
            ring2.rotation.z -= delta * 2.4;
            ring2.scale.setScalar(1.18 + (1 - pulse) * 0.08);
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
              // All pickup materials + geometries are shared (cached per
              // colour / per shape) so we do NOT dispose them — that would
              // wipe out resources still in use by other live pickups.
              // despawnPickup releases the pool light and unparents the group;
              // GC reclaims the small per-instance Mesh wrappers.
              despawnPickup(powerUp);
              powerUps.splice(pi, 1);
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
              if (dailyEnabled) dailyCounts.powerup += 1;
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
      // Forgiving aim (magnetism + wide hitbox) is mobile-only — resolved once
      // per frame through the hardened gate so the hot bullet loop just reads a
      // boolean (and a tampered desktop flag can't unlock it; see touchControls).
      const aimAssist = touchControls.assistAllowed();
      // Cinematic combat impact FX (hit flashes, bullet shatter, hurt sparks) —
      // resolved once per frame so the hot bullet/damage paths just read a bool.
      const impactFeedbackOn = gameSettingsManager.getSetting('impactFeedback');
      // View frustum for this frame's engagement-culling test.
      _engageProjMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _engageFrustum.setFromProjectionMatrix(_engageProjMat);
      // Visible draw distance for THIS map — past it, fog/cull hide the enemy.
      const engageFarSq = mapConfig.fogFar * mapConfig.fogFar;
      const engageCloseSq = ENGAGE_CLOSE * ENGAGE_CLOSE;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        enemyGrid.insert(k, e.mesh.position.x, e.mesh.position.z);
        // Engageable = close enough to matter, OR genuinely rendered on screen
        // (inside the frustum AND within the map's visible draw distance). A
        // fog-culled enemy off in the distance is neither shootable nor able to
        // shoot until it actually comes into view / range.
        const edx = e.mesh.position.x - camera.position.x;
        const edz = e.mesh.position.z - camera.position.z;
        const edistSq = edx * edx + edz * edz;
        if (edistSq < engageCloseSq) {
          e.engageable = true;
        } else if (edistSq > engageFarSq) {
          e.engageable = false;
        } else {
          _engageSphere.center.set(e.mesh.position.x, e.mesh.position.y + 1.0, e.mesh.position.z);
          e.engageable = _engageFrustum.intersectsSphere(_engageSphere);
        }
        // Detail-ready gate: a round can't bite into the distant "minimal"
        // single-box (LOW) NOR the simplified "half texture" mesh (MEDIUM) — the
        // enemy's FULL model must have streamed in (HIGH LOD, ≤45 m) first.
        // Pooled enemies only; anything without a pool slot stays hittable.
        // `alwaysDamageable` opts a handful of elites OUT of that gate. The
        // Howler is the reason it exists: it deliberately hangs at the BACK of
        // the pack, and on a low preset (viewDistance 72 m → a tight LOD ladder)
        // it would sit permanently outside the HIGH-LOD band and be literally
        // invulnerable — an unkillable healer. The 45 m floor stays untouched
        // for everything else; this is the narrow exception, not a loosening.
        e.detailReady = e.alwaysDamageable === true || e.poolId === undefined
          ? true
          : smartEnemyManager.isDetailReady(e.poolId);
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
        // ── ENEMY FIRE SETS OFF BARRELS ─────────────────────────────────
        // Enemy bolts used to pass straight through explosive barrels, so the
        // whole hazard layer was a one-way tool the player pointed at the
        // swarm. Now a sniper's stray round can cook off the drum you are
        // standing behind — and inside an ARK-07 field, where those drums are
        // irradiated cores, that is the field's actual threat: it is not just
        // a debuff zone, it is a place where the enemy can drop a warhead on
        // you. The core's own lethal radius still decides whether it kills
        // you, so keeping your distance from the marked drums is the counter.
        let boltHitBarrel = false;
        for (let b = 0; b < barrels.length; b++) {
          const barrel = barrels[b];
          if (barrel.detonated) continue;
          const dxB = bolt.mesh.position.x - barrel.mesh.position.x;
          const dyB = bolt.mesh.position.y - barrel.mesh.position.y;
          const dzB = bolt.mesh.position.z - barrel.mesh.position.z;
          if (dxB * dxB + dzB * dzB < barrel.hitRadius * barrel.hitRadius && Math.abs(dyB) < 1.0) {
            // Queued, never detonated inline: this runs mid-iteration over
            // enemyBullets, and detonateBarrel splices `barrels` and can kill
            // the player. The chain pump resolves it at the safe point.
            barrel.hp -= bolt.damage;
            if (barrel.hp <= 0) {
              if (!pendingBarrelDetonations.includes(barrel)) pendingBarrelDetonations.push(barrel);
            } else {
              registerBarrelGraze(barrel, bolt.mesh.position);
            }
            scene.remove(bolt.mesh);
            enemyBullets.splice(eb, 1);
            boltHitBarrel = true;
            break;
          }
        }
        if (boltHitBarrel) continue;
        if (bolt.life <= 0 || bolt.mesh.position.y < 0.1) {
          scene.remove(bolt.mesh);
          enemyBullets.splice(eb, 1);
        }
      }

      // Update bullets.
      // FRAME-RATE INDEPENDENCE: bullet travel + lifetime are scaled by the
      // real frame time (normalised to the old 60 fps step), so a bullet moves
      // the same world distance per SECOND no matter the frame rate. Previously
      // movement/lifetime were per-FRAME, so combat behaved differently at
      // different frame rates — e.g. LOW graphics (uncapped/high fps) shifted
      // where each discrete step landed, which (combined with coarse point
      // hit-testing) made the 0.8u headshot zone register erratically and could
      // read as enemies dying in "one shot". `_bulletPrev` + the swept test
      // below make hit detection exact and identical across every graphics mode.
      const bulletDt = rawDelta * 60;
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        _bulletPrev.copy(bullet.mesh.position);
        bullet.mesh.position.addScaledVector(bullet.velocity, bulletDt);
        bullet.life -= bulletDt;

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
            retireBulletMesh(bullet);
            bullets.splice(i, 1);
            continue;
          }
        }

        if (bullet.life <= 0) {
          // A rocket that runs out of range still detonates where it stops
          if (bullet.isRocket) explodeRocket(bullet.mesh.position.clone(), bullet.damage);
          retireBulletMesh(bullet);
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
            soundManager.playAt('impact_metal', bullet.mesh.position.x, bullet.mesh.position.y, bullet.mesh.position.z, 0.55, 0.95 + Math.random() * 0.12);
            if (sentinel.hp <= 0) {
              sentinel.destroyed = true;
              spawnExplosionFX(sentinel.mesh.position.clone());
              scene.remove(sentinel.mesh);
              // Reward — meaningful score bump + advance elimination mission.
              const sentinelReward = Math.round(150 * scoreDiffMult * runModifierScoreMult);
              score += sentinelReward;
              if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(`Sentinel Down · +${sentinelReward}`, 'kill');
              triggerKillFlash();
              updateGameState();
            }
            retireBulletMesh(bullet);
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
              // Glancing hit — the bullet stops here either way.
              registerBarrelGraze(barrel, bullet.mesh.position);
            }
            // Rockets still trigger their own AOE in addition to the barrel
            // detonation (a rocket landing on a barrel should feel huge).
            if (bullet.isRocket) explodeRocket(bullet.mesh.position.clone(), bullet.damage);
            retireBulletMesh(bullet);
            bullets.splice(i, 1);
            bulletHitBarrel = true;
            break;
          }
        }
        if (bulletHitBarrel) continue;

        // Grid lookup — only test enemies near the bullet's TRAVEL SEGMENT this
        // frame (midpoint + half-length + the 2u hitbox + margin), instead of
        // every enemy in the world. Querying the whole segment (not just the end
        // point) is what lets the swept test below catch enemies the bullet
        // skimmed past mid-step.
        const segMidX = (_bulletPrev.x + bullet.mesh.position.x) * 0.5;
        const segMidZ = (_bulletPrev.z + bullet.mesh.position.z) * 0.5;
        const segHalf = Math.hypot(
          bullet.mesh.position.x - _bulletPrev.x,
          bullet.mesh.position.z - _bulletPrev.z,
        ) * 0.5;

        // ── SWEPT BULLET-vs-TERRAIN (solid cover blocks shots) ─────────────
        // Trees, rocks, boulders and walls are cover: a round can't punch
        // through them to kill an enemy on the far side. Sweep the bullet's
        // travel segment against nearby COLLIDABLE props (the same grid + radii
        // the player physically collides with) and record the NEAREST blocking
        // hit as a fraction `tTerrain` along the segment. The enemy test below
        // rejects any contact past that point, and a bullet that reaches the
        // cover is stopped there (post-loop). Bushes / soft dressing are
        // non-collidable so shots still pass through foliage; rockets keep their
        // own contact-detonation handling above and skip this sweep. Computed
        // and fully consumed BEFORE the enemy grid query so the reused grid
        // result arrays never alias.
        let tTerrain = 1.1; // > 1 ⇒ no terrain hit this frame
        let terrainHitX = 0, terrainHitY = 0, terrainHitZ = 0;
        // The prop the round struck — carried to the post-loop branch so the
        // bullet decal is tinted + oriented to the correct surface.
        let terrainHitObj: TerrainObject | null = null;
        // Ground-plane crossing is tracked SEPARATELY from tTerrain: it must
        // NOT gate enemy hits (a descending round grazing an enemy's feet at
        // range should still tag the enemy, exactly as before), it only drives
        // a ground bullet-mark once the round has hit nothing else.
        let tGround = 1.1;
        let groundHitX = 0, groundHitZ = 0;
        if (!bullet.isRocket) {
          const segTX = bullet.mesh.position.x - _bulletPrev.x;
          const segTZ = bullet.mesh.position.z - _bulletPrev.z;
          const segTLen2 = segTX * segTX + segTZ * segTZ;
          const nearbyProps = collidableGrid.queryRadius(segMidX, segMidZ, segHalf + maxCollidableRadius + 1);
          for (let t = 0; t < nearbyProps.length; t++) {
            const obj = nearbyProps[t];
            let tt = 0;
            if (segTLen2 > 1e-8) {
              tt = ((obj.x - _bulletPrev.x) * segTX + (obj.z - _bulletPrev.z) * segTZ) / segTLen2;
              tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            }
            const cxT = _bulletPrev.x + segTX * tt;
            const czT = _bulletPrev.z + segTZ * tt;
            const ddx = cxT - obj.x;
            const ddz = czT - obj.z;
            // Trees carry a wide CANOPY footprint as their navigation radius
            // (~2.5 m) so the player doesn't clip the leaves — but a round at body
            // height only meets the solid TRUNK. Blocking on the full canopy made
            // a forest eat nearly every shot (combat felt dead + no hits landed),
            // so trees block on a trunk-sized core; rocks / boulders / walls are
            // solid all the way out and keep their full radius.
            const blockR = obj.type === 'tree' ? Math.min(obj.radius, 0.95) : obj.radius;
            if (ddx * ddx + ddz * ddz >= blockR * blockR) continue;
            const cyT = _bulletPrev.y + (bullet.mesh.position.y - _bulletPrev.y) * tt;
            // Bullets clear short cover (low rocks) — only blocked below the
            // prop's collidable height; undefined height = full-height block.
            if (obj.height !== undefined && cyT > obj.height) continue;
            if (tt < tTerrain) {
              tTerrain = tt;
              terrainHitX = cxT; terrainHitY = cyT; terrainHitZ = czT;
              terrainHitObj = obj;
            }
          }
          // ── GROUND-PLANE CROSSING (bullet holes in the dirt) ──────────────
          // A DESCENDING round that dips through the ground plane leaves a mark
          // in the floor. Gated to downward shots so ordinary horizontal combat
          // is untouched — a flat/rising round never "hits the ground", it flies
          // on to its target or expires in the air. Recorded separately from the
          // prop sweep so it never blocks an enemy; consumed only in the
          // post-loop branch if the round hit nothing else this frame.
          const prevY = _bulletPrev.y;
          const endY = bullet.mesh.position.y;
          if (prevY > GROUND_DECAL_Y && endY <= GROUND_DECAL_Y && prevY > endY) {
            tGround = (prevY - GROUND_DECAL_Y) / (prevY - endY);
            groundHitX = _bulletPrev.x + (bullet.mesh.position.x - _bulletPrev.x) * tGround;
            groundHitZ = _bulletPrev.z + (bullet.mesh.position.z - _bulletPrev.z) * tGround;
          }
        }

        const nearbyEnemyIds = enemyGrid.queryRadius(segMidX, segMidZ, segHalf + 3);
        // Snapshot the IDs because queryRadius reuses the returned array
        // and a nested query (terrainGrid lookup inside this loop, etc.) would
        // overwrite it mid-iteration. Copied into a persistent buffer instead
        // of `.slice()` so no array is allocated per bullet per frame.
        const nearbyIds = _enemyQueryScratch;
        nearbyIds.length = 0;
        for (let q = 0; q < nearbyEnemyIds.length; q++) nearbyIds.push(nearbyEnemyIds[q]);
        // End of this frame's travel — a piercing round that punches through a
        // body is restored to this point so it keeps flying next frame.
        const segEndX = bullet.mesh.position.x;
        const segEndY = bullet.mesh.position.y;
        const segEndZ = bullet.mesh.position.z;
        let bulletConsumed = false;
        for (let n = 0; n < nearbyIds.length && !bulletConsumed; n++) {
          const j = nearbyIds[n];
          const enemy = enemies[j];
          if (!enemy || enemy.dead) continue;
          // A piercing round never re-hits a body it already punched through.
          if (bullet.hitEnemies !== undefined && bullet.hitEnemies.has(enemy)) continue;
          // Can't snipe an enemy that isn't actually rendered on screen (fogged
          // out in the distance) — it must be engageable first. `=== false`
          // so an enemy not yet evaluated this frame defaults to hittable.
          if (enemy.engageable === false) continue;
          // Can't damage the distant "minimal" single-box or the simplified
          // "half texture" mesh — the enemy's FULL model must have streamed in
          // (HIGH LOD) first. The bullet sails on past (it isn't consumed) so it
          // can still strike a full-detail enemy nearer along its path.
          if (enemy.detailReady === false) continue;
          // ── SWEPT (segment) HIT TEST ────────────────────────────────────
          // Closest approach of the bullet's path this frame to the enemy
          // centre (XZ cylinder, radius 2). Tunnel-proof: a sniper round steps
          // 5u/frame — far bigger than the 2u hitbox — so a per-point test
          // could skip clean through. We instead project the enemy onto the
          // travel segment and snap the bullet to that exact CONTACT POINT, so
          // the headshot test + sparks + splash all use true geometry rather
          // than wherever a discrete step happened to fall.
          const segDX = bullet.mesh.position.x - _bulletPrev.x;
          const segDZ = bullet.mesh.position.z - _bulletPrev.z;
          const segLen2 = segDX * segDX + segDZ * segDZ;
          let tHit = 0;
          if (segLen2 > 1e-8) {
            tHit = ((enemy.mesh.position.x - _bulletPrev.x) * segDX
                  + (enemy.mesh.position.z - _bulletPrev.z) * segDZ) / segLen2;
            tHit = tHit < 0 ? 0 : tHit > 1 ? 1 : tHit;
          }
          // Behind solid cover this frame — the bullet hits the tree/rock/wall
          // first, so this enemy can't be tagged through it.
          if (tHit > tTerrain) continue;
          const closeX = _bulletPrev.x + segDX * tHit;
          const closeZ = _bulletPrev.z + segDZ * tHit;
          const closeDX = closeX - enemy.mesh.position.x;
          const closeDZ = closeZ - enemy.mesh.position.z;
          const closeXZsq = closeDX * closeDX + closeDZ * closeDZ;
          // Desktop and touch now use the SAME shape test — a body cylinder
          // with a real vertical extent — so a round fired over the head or
          // wide of the body genuinely whiffs on a phone too. Touch only gets
          // a modest radius bonus for thumb imprecision; the old path gave it
          // a 2m cylinder with NO height test at all, which is what made mobile
          // play like an aimbot.
          const eScale = ENEMY_SCALE[enemy.type];
          const bodyR = Math.max(1.1, 1.1 * eScale) * (aimAssist ? 1.3 : 1);
          const contactY = _bulletPrev.y + (bullet.mesh.position.y - _bulletPrev.y) * tHit;
          const footY = enemy.mesh.position.y - 0.4;
          // Up to the TOP of the head (head centre ≈1.9·scale + ~0.8·scale
          // radius) so legit top-of-skull headshots still land; anything fired
          // clearly above that genuinely sails over.
          const headY = enemy.mesh.position.y + 2.8 * eScale;
          const bodyHit = closeXZsq < bodyR * bodyR && contactY >= footY && contactY <= headY;
          if (bodyHit) {
            // Snap to the contact point so all downstream effects are exact.
            bullet.mesh.position.set(
              closeX,
              _bulletPrev.y + (bullet.mesh.position.y - _bulletPrev.y) * tHit,
              closeZ,
            );
            // Rockets explode on first contact — the blast handles all damage
            if (bullet.isRocket) {
              explodeRocket(bullet.mesh.position.clone(), bullet.damage);
              retireBulletMesh(bullet);
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
            const hsScale = ENEMY_SCALE[enemy.type];
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

            // ── BULWARK FRONTAL SHIELD ──────────────────────────────────
            // Shots landing inside its facing arc are almost entirely absorbed.
            // This is the archetype's whole point: the answer is to MOVE, not
            // to keep firing. The flare + ping make "blocked" unmistakable so
            // it reads as a puzzle rather than as the gun being broken.
            if (enemy.type === 'bulwark' && isBlockedByBulwark(
              enemy.mesh.rotation.y,
              enemy.mesh.position.x, enemy.mesh.position.z,
              bullet.mesh.position.x, bullet.mesh.position.z,
            )) {
              damage *= BULWARK_FRONT_DAMAGE;
              enemy.bulwarkFlash = 1;
              soundManager.playAt(
                'impact_metal',
                bullet.mesh.position.x, bullet.mesh.position.y, bullet.mesh.position.z,
                0.6, 1.35,
              );
              createParticles(bullet.mesh.position, 0x5fd8ff, 5);
            }

            // ── WAVE-PERK DAMAGE MODIFIERS (solo only — neutral in MP) ──
            // Berserker's Rage: hit harder while critically wounded.
            if (perkBonuses.berserkerLowHpMult > 1 && health < playerMaxHealth * 0.4) {
              damage *= perkBonuses.berserkerLowHpMult;
            }
            // Executioner: a low-HP non-boss is finished off outright — the
            // struck damage is topped up to guarantee the kill this frame.
            if (perkBonuses.executionThreshold > 0 && enemy.type !== 'boss' && !enemy.isMiniBoss
                && enemy.health > 0 && enemy.health <= enemy.maxHealth * perkBonuses.executionThreshold) {
              // Top the damage up to a guaranteed kill without flagging it a
              // crit — execution isn't a headshot, so it must not inflate the
              // headshot achievements / accuracy metrics.
              damage = Math.max(damage, enemy.health + 1);
            }

            if (isMpGuest && mp) {
              // Guests don't own enemy health — report the hit to the host and
              // let it resolve damage and death authoritatively. We still show
              // local sparks / flash / damage numbers below for snappy feedback.
              if (enemy.netId !== undefined) mp.sendEnemyHit(enemy.netId, damage, isCritical);
            } else if (revShieldUp(enemy)) {
              // Revenant shield phases the bullet off — it pings, deals NO
              // damage, and doesn't count toward a kill. Punish it the moment
              // the shield drops (its open window) or shatter it with a blast.
              // Consume the round + bail BEFORE any damage/feedback below.
              pingRevShield(enemy, bullet.mesh.position);
              retireBulletMesh(bullet);
              bullets.splice(i, 1);
              bulletConsumed = true;
              break;
            } else {
              // NULL WAVE compromises the player's ballistics — the corrupted
              // units shrug off a slice of every round. Applied only at this
              // authoritative write (guests' reported hits are scaled once,
              // in the host's enemy_hit handler — never both).
              // ── HOWLER OVERSHIELD ────────────────────────────────────
              // Absorbs damage BEFORE health. An unattended Howler keeps
              // topping this up, so the swarm visibly stops dying — which is
              // the pressure that makes the player go and deal with it.
              // (The bullet pass runs BEFORE the enemy loop caches frameNowMs.)
              // Bosses clamp a single round's damage — see BOSS_MAX_HIT_FRACTION.
              let dmgToApply = capBossHit(enemy, damage * playerBallisticsMult());
              if ((enemy.overshield ?? 0) > 0 && Date.now() < (enemy.overshieldUntil ?? 0)) {
                const absorbed = Math.min(enemy.overshield!, dmgToApply);
                enemy.overshield! -= absorbed;
                dmgToApply -= absorbed;
                createParticles(bullet.mesh.position, 0xd08cff, 4);
                if (enemy.overshield! <= 0 && enemy.overshieldRing) {
                  // Shield popped — strip the marker ring so the player sees it
                  // is now vulnerable. Shared asset: detach only.
                  enemy.mesh.remove(enemy.overshieldRing);
                  enemy.overshieldRing = undefined;
                }
              }
              enemy.health -= dmgToApply;
              // Landing an open-window shot tells the Revenant it's being shot
              // at → it blinks to evade (player-sourced evade only).
              if (enemy.type === 'revenant') enemy.revEvadeUntil = Date.now() + 500;
              // Cryo Rounds perk — a chance to flash-freeze the struck enemy
              // (bosses / mini-bosses resist a full encasement). Reuses the
              // tested freeze helper so the frost shell + thaw all just work.
              if (perkBonuses.frostRounds && enemy.health > 0 && enemy.type !== 'boss'
                  && !enemy.isMiniBoss && Math.random() < 0.22) {
                freezeEnemy(enemy, 750);
              }
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
            // ── OVER-PENETRATION ── a piercing round (sniper) punches THROUGH
            // this body instead of stopping in it: it sheds energy (damage ×
            // pierceRetain), remembers the victim so it can never re-hit it,
            // and resumes its flight after the impact effects play at the
            // contact point. Everything else consumes the round here as before.
            const pierced = (bullet.pierceLeft ?? 0) > 0;
            if (pierced) {
              bullet.pierceLeft = (bullet.pierceLeft ?? 1) - 1;
              bullet.damage *= bullet.pierceRetain ?? 0.55;
              if (!bullet.hitEnemies) bullet.hitEnemies = new Set();
              bullet.hitEnemies.add(enemy);
            } else {
              retireBulletMesh(bullet);
              bullets.splice(i, 1);
              bulletConsumed = true;
            }

            // 🤖 Record hit for AI systems (recordHit, NOT recordShot — the
            // trigger-pull already counted the shot fired in shoot()).
            adaptiveDifficulty.recordHit(isCritical);
            adaptiveDifficulty.recordDamage(damage, true);

            // Record for missions
            if (isCritical) {
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

            // ROBOT HIT SPARKS - metal/spark burst feedback (reuse temp vector)
            _tempVec3_2.subVectors(enemy.mesh.position, bullet.mesh.position).normalize();
            const sparks = new RobotHitSparks(
              scene,
              isCritical ? _tempVec3.clone() : enemy.mesh.position.clone(),
              _tempVec3_2,
              isCritical ? 20 : 12 // More particles for crits
            );
            robotSparks.push(sparks);

            // ── PERSISTENT BATTLE DAMAGE ──
            // Punch a metal dent + scrape a scuff into the armour at the exact
            // point of contact (size scales with damage, bigger on a crit). The
            // marks accumulate so the robot is visibly battered by low health.
            stampEnemyDamage(enemy, damage, isCritical, bullet.mesh.position);

            // ── CINEMATIC IMPACT FEEDBACK (toggleable) ──
            // A world-space hit-confirm flash + shockring snaps at the exact
            // point of contact, and the round SHATTERS into metal shrapnel that
            // sprays back off the armour and tumbles to the ground. Purely feel
            // — damage numbers are unchanged. Gated by the "Impact Feedback"
            // gameplay setting, resolved once per frame into `impactFeedbackOn`.
            if (impactFeedbackOn) {
              impactBursts.push(new ImpactBurst(
                scene,
                bullet.mesh.position.clone(),
                isCritical ? 0xffcf4a : 0xffe6b0,
                isCritical ? 1.5 : 1.0,
              ));
              const shardCount = Math.max(2, Math.round((isCritical ? 8 : 5) * graphicsPreset.particleDensity));
              spawnBulletShards(bullet.mesh.position, bullet.velocity, shardCount);
            }

            if (!isMpGuest && enemy.health <= 0) {
              handleEnemyKilled(enemy, isCritical);
              // Arc Reactor perk — the fatal blow arcs chain lightning to
              // nearby foes. Called ONLY here (on a confirmed kill), so the
              // chain never recurses through handleEnemyKilled.
              if (perkBonuses.chainLightning) arcChainLightning(enemy, damage);
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
                stampEnemyDamage(e, dmgS, false, undefined, splashOrigin);
                if (!isMpGuest && e.health <= 0) handleEnemyKilled(e, false);
              }
            }
            if (pierced) {
              // Resume flight: the impact effects played at the contact point;
              // now restore the round to the end of this frame's travel so it
              // carries on toward whatever stands behind this enemy. The loop
              // continues — the same segment may clip a second body this frame.
              bullet.mesh.position.set(segEndX, segEndY, segEndZ);
            }
            // A consumed round set bulletConsumed above, which ends the loop.
          }
        }

        // Bullet reached solid cover (tree / rock / wall) or dipped into the
        // ground without hitting an enemy first — it's stopped there instead of
        // flying on. Spark off the surface + (optionally) a small impact flash,
        // stamp a bullet mark, then consume the round. Whichever contact is
        // NEARER along the segment wins (prop cover vs the ground plane).
        // Rockets keep both t-values > 1 (they detonate via their own contact
        // handling above), so they never enter this branch.
        if (!bulletConsumed && (tTerrain <= 1 || tGround <= 1)) {
          const hitGround = tGround < tTerrain;
          if (hitGround) {
            _tempVec3.set(groundHitX, GROUND_DECAL_Y, groundHitZ);
          } else {
            _tempVec3.set(terrainHitX, terrainHitY, terrainHitZ);
          }
          createParticles(_tempVec3, 0x9a8a72, 5);
          if (impactFeedbackOn) {
            impactBursts.push(new ImpactBurst(scene, _tempVec3.clone(), 0xcbb890, 0.6));
          }
          // ── HYPER-REAL BULLET MARK ──
          // Punch a surface-tinted, weapon-shaped bullet hole at the exact
          // contact point. The ground gets an upward-facing mark; a prop gets
          // one facing radially outward (back toward the shooter) with a slight
          // upward tilt so it reads correctly on vertical trunks/walls. Marks
          // are pooled + capped + auto-disposed (lifetime + distance cull).
          // Material-matched, POSITIONAL impact audio. The decal system already
          // classifies the surface here, so the sound comes for free — rounds
          // used to land on the world in total silence (one generic 'hit' blip,
          // unpanned), which is why missing felt like nothing happened.
          let impactSound = 'impact_dirt';
          if (hitGround) {
            _decalNormal.set(0, 1, 0);
            bulletDecals.addDecal(_tempVec3, _decalNormal, currentWeapon, 'ground');
          } else if (terrainHitObj) {
            _decalNormal.set(terrainHitX - terrainHitObj.x, 0, terrainHitZ - terrainHitObj.z);
            if (_decalNormal.lengthSq() < 1e-6) _decalNormal.copy(bullet.velocity).multiplyScalar(-1);
            _decalNormal.y = 0.18; // slight upward tilt so the crater lip catches light on trunks
            // 'tree'/'cactus' = the map's TALL structural cover (bark, concrete
            // wall, stone pillar…); everything else collidable = rock/debris.
            const isCover = terrainHitObj.type === 'tree' || terrainHitObj.type === 'cactus';
            bulletDecals.addDecal(_tempVec3, _decalNormal, currentWeapon, isCover ? 'cover' : 'rock');
            impactSound = isCover ? 'impact_wood' : 'impact_stone';
          }
          soundManager.playAt(
            impactSound, _tempVec3.x, _tempVec3.y, _tempVec3.z,
            0.5, 0.92 + Math.random() * 0.16,
                );
          retireBulletMesh(bullet);
          bullets.splice(i, 1);
        }
      }

      // === SMART ENEMY MANAGER UPDATE ===
      // Updates LOD, frustum culling, and adaptive enemy limits
      smartEnemyManager.update(delta);

      // === RAGDOLL PHYSICS STEP ===
      // Advance the Rapier corpse world with the SAME (slow-mo scaled) delta as
      // everything else, so ragdolls dilate in bullet-time identically. No-op
      // while no corpses are live; the death loop below reads the results.
      ragdollSystem.step(delta);

      // === NEW ADVANCED AI SYSTEM ===
      // AI update distance scales with graphics quality AND difficulty —
      // hard enemies keep their AI brain online (and continue attacking)
      // from much further out, so the player can't out-snipe them by
      // running outside the previous 100m cap.
      // `weatherAggroMult` folds a live storm into the engagement range: thick
      // air genuinely hides the player, so a sandstorm or blizzard shortens how
      // far out enemies keep hunting. Floored at 0.6 so weather can NEVER make
      // the swarm passive enough to trivialise a wave — it colours the fight,
      // it doesn't decide it. (aggroRange on the Enemy struct is vestigial: it
      // is assigned at spawn and never read; THIS is the real gate.)
      const MAX_AI_UPDATE_DISTANCE = Math.min(
        220,
        graphicsPreset.viewDistance * 0.85 * diffSettings.chaseMult * mapVisibilityReach
          * Math.max(0.6, weatherAggroMult),
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
          const baseScale = ENEMY_SCALE[enemy.type];

          if (enemy.ragdollBodyId !== undefined) {
            // ── RAGDOLL (Rapier-driven) ── the corpse transform comes straight
            // off the rigid body: true-inertia tumble, real ground + corpse-on-
            // corpse collisions, settles and sleeps. Same slack limb pose on the
            // first frame, same shrink-away fade as the lightweight path.
            if (enemy.deathStarted) {
              enemy.deathStarted = false;
              if (enemy.leftArm) { enemy.leftArm.rotation.z = Math.PI / 2.4; enemy.leftArm.rotation.x = Math.PI / 5; }
              if (enemy.rightArm) { enemy.rightArm.rotation.z = -Math.PI / 2.4; enemy.rightArm.rotation.x = Math.PI / 5; }
              if (enemy.leftLeg) enemy.leftLeg.rotation.x = Math.PI / 7;
              if (enemy.rightLeg) enemy.rightLeg.rotation.x = -Math.PI / 7;
            }
            // Copy body → mesh (no allocation). If the body was recycled out from
            // under a still-fading corpse (heavy cap pressure), drop the handle
            // and let it fade where it lies.
            if (!ragdollSystem.read(enemy.ragdollBodyId, enemy.mesh.position, enemy.mesh.quaternion)) {
              enemy.ragdollBodyId = undefined;
            }
            const fade = enemy.deathTime < 0.3 ? Math.max(0.02, enemy.deathTime / 0.3) : 1;
            enemy.mesh.scale.setScalar(baseScale * fade);
          } else if (enemy.deathVel) {
            // ── RAGDOLL (lightweight fallback — pre-WASM / WASM unavailable) ──
            // Rest height rides the visual terrain surface (0 near the player).
            const restY = 0.22 * baseScale + visualGroundY(enemy.mesh.position.x, enemy.mesh.position.z);

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
            // Corpse settles onto the VISUAL terrain surface (0 near the
            // player) so a distant kill doesn't pop below the displaced hills.
            enemy.mesh.position.y = baseScale * (1.0 - p) + visualGroundY(enemy.mesh.position.x, enemy.mesh.position.z);
            enemy.mesh.scale.setScalar(Math.max(0.02, 1.0 - p * 0.8) * baseScale);
            if (enemy.leftArm) { enemy.leftArm.rotation.z = p * (Math.PI / 3); enemy.leftArm.rotation.x = p * (Math.PI / 4); }
            if (enemy.rightArm) { enemy.rightArm.rotation.z = -p * (Math.PI / 3); enemy.rightArm.rotation.x = p * (Math.PI / 4); }
            if (enemy.leftLeg) enemy.leftLeg.rotation.x = p * (Math.PI / 6);
            if (enemy.rightLeg) enemy.rightLeg.rotation.x = -p * (Math.PI / 6);
          }

          if (enemy.deathTime <= 0) {
            // Retire the Rapier ragdoll body (if this corpse used one) so the
            // physics world + pool slot are freed for the next death.
            if (enemy.ragdollBodyId !== undefined) {
              ragdollSystem.release(enemy.ragdollBodyId);
              enemy.ragdollBodyId = undefined;
            }
            // Restore the head we hid on decapitation so the pooled mesh is
            // whole again for the next enemy that reuses this slot (idempotent
            // for enemies that were never decapitated). The torn neck-wire stub
            // rides the pooled mesh too — detach it (shared geo/mats, no dispose).
            if (enemy.head && !enemy.head.visible) enemy.head.visible = true;
            if (enemy.neckWires) {
              enemy.neckWires.removeFromParent();
              enemy.neckWires = undefined;
            }
            // Safety net: strip any hack chip/indicator before the pooled mesh
            // is recycled, so the next enemy in this slot never inherits one.
            if (enemy.hackVisuals) { disposeHackVisuals(enemy.hackVisuals); enemy.hackVisuals = undefined; }
            enemy.hacked = false;
            // Safety net #2: ARK-07 event wrappers ride shared assets — they
            // must come off before the release path's generic child-disposal
            // sweep. Catches every death route (incl. guest-mirrored deaths
            // that never pass through handleEnemyKilled).
            clearNetEventVisuals(enemy);
            // Same for a flame shell — shared geo+mat owned by FireSystem, and
            // the system's own list has to drop it or it keeps animating a
            // shell that is no longer attached to anything.
            clearEnemyBurn(enemy);
            // Revenant shield — detach + dispose its per-instance geo/mats so
            // the recycled slot never carries a stray gold shield.
            if (enemy.revShield) {
              enemy.revShield.removeFromParent();
              disposeRevShield(enemy.revShield);
              enemy.revShield = undefined;
            }
            // Return this corpse's accumulated dents/scuffs to the pool before
            // the pooled mesh is recycled (else the next occupant inherits them).
            battleDamage.clearFor(enemy.mesh);
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

        // Compute baseScale for ALL living enemies (needed for grounding).
        const baseScale = ENEMY_SCALE[enemy.type];
        // groundY rides the VISUAL terrain surface: beyond the player-relative
        // flat zone the GPU displaces the ground upward, and an enemy pinned
        // to the y=0 gameplay plane there reads as buried to the knees. The
        // CPU height replica matches the shader byte-for-byte, and returns 0
        // inside the flat zone — so close-range combat is untouched and a
        // distant enemy simply STANDS ON the hills it walks over. Every Y
        // write below (walk bob, idle, far-seek, recycle, guest mirror)
        // inherits it automatically.
        const groundY = 1.0 * baseScale + visualGroundY(enemy.mesh.position.x, enemy.mesh.position.z);

        // ── ARK-07 EVENT VISUALS (host, solo AND guest mirrors) ───────────
        // Surge halo: the red overclock ring every unit wears during an
        // OVERDRIVE SURGE. Lazily attached so enemies that spawned before the
        // guest learned the modifier (or mid-wave stragglers) still get one;
        // detached the moment the wave clears. Bob + pulse only — spinning a
        // rotationally-symmetric ring is invisible, so we don't pay for it.
        if (netWaveEvent === 'surge') {
          if (!enemy.surgeHalo) {
            const halo = new THREE.Mesh(_surgeHaloGeo, _surgeHaloMat);
            halo.rotation.x = Math.PI / 2;
            halo.position.y = 3.35;
            halo.userData.isSurgeHalo = true;
            enemy.mesh.add(halo);
            enemy.surgeHalo = halo;
          }
          enemy.surgeHalo.position.y = 3.35 + Math.sin(frameNowMs * 0.006 + i * 1.3) * 0.12;
          enemy.surgeHalo.scale.setScalar(1 + Math.sin(frameNowMs * 0.008 + i) * 0.1);
        } else if (enemy.surgeHalo) {
          enemy.surgeHalo.removeFromParent();
          enemy.surgeHalo = undefined;
        }
        // Irradiation soak + lingering shell (host, solo AND guests — every
        // client computes it locally from the shared spire list + synced
        // positions). While a unit stands in a relay field it SOAKS charge:
        // peak factor stored + the linger clock refreshed, so the buff — and
        // the glowing shell that warns the player about it — persists long
        // after the unit walks out, fading only in the final stretch.
        if (uplinkPlaced) {
          const fieldGlow = uplinkFieldFactor(enemy.mesh.position.x, enemy.mesh.position.z);
          if (fieldGlow > 0.1) {
            enemy.irradiatedPower = Math.max(enemy.irradiatedPower ?? 0, fieldGlow);
            enemy.irradiatedUntil = frameNowMs + IRRADIATION_LINGER_MS;
          }
          const charge = irradiationCharge(enemy, frameNowMs);
          // Hysteresis (attach >0.12, detach <0.06) stops rim flicker.
          if (!enemy.radShell && charge > 0.12) {
            const shell = new THREE.Mesh(_frostShellGeo, _radShellMat);
            shell.position.y = 1.0;
            shell.userData.isRadShell = true;
            enemy.mesh.add(shell);
            enemy.radShell = shell;
          } else if (enemy.radShell && charge < 0.06) {
            enemy.radShell.removeFromParent();
            enemy.radShell = undefined;
          }
          if (enemy.radShell) {
            // Pulse harder the more charge the unit carries — the tell that
            // THIS one is the supercharged problem.
            enemy.radShell.scale.setScalar(1.02 + charge * 0.12 + Math.sin(frameNowMs * (0.004 + charge * 0.004) + i * 0.9) * (0.05 + charge * 0.06));
          }
        }

        // ── BATTLE-DAMAGE VENTING ─────────────────────────────────────────
        // A critically-wounded robot — or one fried by a Subverter intrusion
        // chip — pours heavy sooty smoke from its breached plating and arcs the
        // odd electrical spark, layered over the accumulated dents/scuffs. Solo
        // /host only (guests don't own authoritative health); rate-limited per
        // enemy; skipped on the lowest particle presets + on culled enemies.
        if (!isMpGuest && MAX_ENEMY_SMOKE > 0 && enemy.engageable !== false) {
          const hpRatio = enemy.maxHealth > 0 ? enemy.health / enemy.maxHealth : 1;
          const critical = hpRatio < 0.33;
          if ((critical || enemy.hacked) && frameNowMs >= (enemy.nextDamageFxAt ?? 0)) {
            ventEnemySmoke(enemy, !!enemy.hacked);
            // Vent faster (and sparkier) the closer it is to burning out.
            const interval = enemy.hacked ? 150 : hpRatio < 0.18 ? 120 : 240;
            enemy.nextDamageFxAt = frameNowMs + interval + Math.random() * 80;
            if ((enemy.hacked || hpRatio < 0.2) && Math.random() < 0.5) {
              _tempVec3.set(Math.random() - 0.5, 1, Math.random() - 0.5).normalize();
              _tempVec3_2.copy(enemy.mesh.position); _tempVec3_2.y += 0.9 * baseScale;
              robotSparks.push(new RobotHitSparks(scene, _tempVec3_2.clone(), _tempVec3, 5));
            }
          }
        }

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

          // Hit reaction (driven by host-synced enemy_hit feedback) — same
          // chassis rock-back + scale punch as the solo/host path so guests see
          // the same satisfying impact.
          if (enemy.damageFlashTime > 0) {
            enemy.damageFlashTime -= delta;
            const r = Math.min(1, enemy.damageFlashTime / 0.3);
            const e2 = 1 - r;
            enemy.mesh.rotation.x = -Math.cos(e2 * 8) * r * 0.34;
            enemy.mesh.scale.setScalar(baseScale * (1 + r * 0.16));
            if (enemy.torso) enemy.torso.scale.setScalar(1 + r * 0.22);
          } else {
            if (enemy.mesh.rotation.x !== 0) enemy.mesh.rotation.x = 0;
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

        // ── HACK OVERRIDE ──────────────────────────────────────────────────
        // A hacked (overclocked) enemy abandons the player and hunts the
        // nearest non-hacked enemy: we re-point focusPos at that victim so the
        // existing steering / facing / attack pipeline targets it instead. The
        // overclock timer ticks down to a self-destruct EMP. Visuals + erratic
        // sparks are driven here every frame.
        let hackVictim: Enemy | null = null;
        if (enemy.hacked) {
          enemy.hackTimeLeft = (enemy.hackTimeLeft ?? 0) - delta;
          if (enemy.hackVisuals) {
            const frac = (enemy.hackTimeLeft ?? 0) / (enemy.hackDuration || HACK_DURATION);
            // Bounded time base (0–100s) keeps the sin() animations precise.
            updateHackVisuals(enemy.hackVisuals, delta, (frameNowMs % 100000) * 0.001, frac);
          }
          // Erratic overclock sparks spitting off the chassis.
          if ((enemy.hackNextSparkAt ?? 0) <= frameNowMs) {
            _hackSparkDir.set(Math.random() - 0.5, 1, Math.random() - 0.5);
            _tempVec3.copy(enemy.mesh.position); _tempVec3.y += 1.0;
            robotSparks.push(new RobotHitSparks(scene, _tempVec3.clone(), _hackSparkDir, 5));
            enemy.hackNextSparkAt = frameNowMs + 240 + Math.random() * 180;
          }
          // Overclock burnout → EMP self-destruct.
          if ((enemy.hackTimeLeft ?? 0) <= 0) {
            detonateHackedEnemy(enemy);
            continue; // now dead; the death-animation branch handles cleanup
          }
          hackVictim = findHackVictim(i);
          if (hackVictim) {
            focusPos = _hackFocus.set(
              hackVictim.mesh.position.x, hackVictim.mesh.position.y, hackVictim.mesh.position.z,
            );
            focusVel = _zeroVel;
            focusPlayerId = null;
          } else {
            // No other enemies left to hunt — thrash in place until burnout.
            focusPos = _hackFocus.copy(enemy.mesh.position);
            focusVel = _zeroVel;
            focusPlayerId = null;
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
        const recycleDistance = (76 + (diffSettings.chaseMult - 0.8) * 90) * mapSpawnReach;
        if (distance > recycleDistance) {
          // Spawn just outside the player's frustum behind them on hard,
          // closer (still visible) on easy. Use the tree-collision-aware
          // findEnemySpawnSpot so recycled enemies don't reappear inside
          // a tree trunk.
          const baseRad = (38 + Math.random() * (22 * diffSettings.chaseMult)) * mapSpawnReach;
          const enemyRadius = ENEMY_SPAWN_CLEARANCE[enemy.type];
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
          // ARK-07 empowerment paces the far-seek too, so surged/irradiated
          // units close the gap visibly faster.
          const netMulFar = enemySpeedMult(enemy);
          // Tactical rush urge — distant enemies close faster on a player who is
          // camping / out-ranging the swarm (solo only; 1.0 otherwise).
          const rushMulFar = tacticalActive ? (1 + tacticalDirector.getRushUrge() * 0.3) : 1;
          _tempVec3.subVectors(focusPos, enemy.mesh.position).normalize();
          enemy.mesh.position.x += _tempVec3.x * enemy.speed * sprintMul * netMulFar * rushMulFar * delta * 60;
          enemy.mesh.position.z += _tempVec3.z * enemy.speed * sprintMul * netMulFar * rushMulFar * delta * 60;
          enemy.mesh.position.y = groundY;
          enemy.mesh.rotation.y = Math.atan2(_tempVec3.x, _tempVec3.z);
          continue;
        }

        // Health regeneration
        if (diffSettings.regenRate > 0 && enemy.health < enemy.maxHealth) {
          enemy.health = Math.min(enemy.maxHealth, enemy.health + diffSettings.regenRate * delta * 10);
        }
        // ARK-07 self-repair — units carrying command-bandwidth charge patch
        // themselves (up to ~3 HP/s at full charge). Because the charge
        // LINGERS, a unit that bathed at a relay keeps repairing even after
        // it leaves — the visible reason to burn the glowing ones down first.
        if (enemy.health < enemy.maxHealth) {
          const charge = irradiationCharge(enemy, frameNowMs);
          if (charge > 0) {
            enemy.health = Math.min(enemy.maxHealth, enemy.health + charge * 3 * delta);
          }
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
              // The behaviour tree only knows the five base archetypes; the
              // specialists' real behaviour lives in their own per-frame blocks
              // (revenant blink/shield, and ENEMY_BEHAVIORS for the tactical
              // four). Map each onto the base steering that suits it:
              //   revenant → fast   (flanker)
              //   leaper   → fast   (closes aggressively between pounces)
              //   bulwark  → tank   (slow advance, holds its facing)
              //   splitter → tank   (slow, bulky)
              //   howler   → ranged (hangs back with the pack)
              type: STEER_ARCHETYPE[enemy.type],
              allEnemies: enemies,
              terrainObjects: terrainObjects,
              canSeePlayer,
              hearPlayerShooting: canHearPlayer,
              timeSinceLastSawPlayer: perception.timeSinceLastSeen,
              isInCover: false,
              // Swarm-wide adaptive directive (solo only; undefined = neutral).
              directive: tacticalActive ? tacticalDirector.getDirective() : undefined,
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
              // Enemy is dodging! Override target with dodge direction.
              // Reuse the enemy's pre-allocated dodgeDirection + targetPosition
              // vectors instead of cloning three fresh Vector3s per dodging
              // enemy per frame — same values (position + dir×8), zero alloc.
              enemy.isDodging = true;
              if (enemy.dodgeDirection) enemy.dodgeDirection.copy(dodgeResult.dodgeDirection);
              else enemy.dodgeDirection = dodgeResult.dodgeDirection.clone();
              enemy.targetPosition.copy(enemy.mesh.position)
                .addScaledVector(dodgeResult.dodgeDirection, 8);
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
          // Snapshot into a persistent buffer (was `.slice()` per enemy per
          // frame) so a later terrainGrid query can't overwrite it mid-loop.
          const nearbyTerrainIds = _terrainQueryScratch;
          nearbyTerrainIds.length = 0;
          for (let q = 0; q < nearbyTerrain.length; q++) nearbyTerrainIds.push(nearbyTerrain[q]);
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
          // Scaled DOWN close to the player so a crowd doesn't shove each other
          // sideways into an endless orbit — near the kill they pack in and
          // commit to the attack (a touch of overlap reads fine; the wide
          // attack arc + overlap-damage handle it) rather than circling forever.
          const sepScale = distance < 5 ? 0.4 : distance < 8 ? 0.7 : 1.0;
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
              const push = ((2.6 - od) / 2.6) * 0.95 * sepScale;
              steerX += (ox / od) * push;
              steerZ += (oz / od) * push;
            }
          }
          {
            const sl = Math.hypot(steerX, steerZ) || 1;
            steerX /= sl; steerZ /= sl;
          }

          // === MOVEMENT ===
          // Crowd-control (Cryo Freeze / Shockwave) roots the enemy in place —
          // a frozen/stunned robot can't advance until ccUntil elapses.
          const ccActive = frameNowMs < (enemy.ccUntil ?? 0);
          // Maintain the frost encasement: gently pulse while frozen, strip it
          // (and clear the CC) the instant the enemy thaws.
          if (enemy.frostShell) {
            if (frameNowMs >= (enemy.frozenUntil ?? 0)) {
              clearEnemyCC(enemy);
            } else {
              enemy.frostShell.scale.setScalar(1 + Math.sin(frameNowMs * 0.012) * 0.04);
            }
          }
          // Mini-boss crown: slow regal spin + gentle hover, ruby counter-spins
          // for a glint. Cheap per-frame writes on an elite-only add-on.
          if (enemy.crown) {
            enemy.crown.rotation.y += delta * 1.4;
            enemy.crown.position.y = (enemy.crown.userData.baseY as number ?? 2.7)
              + Math.sin(frameNowMs * 0.0021) * 0.07;
            const jewel = enemy.crown.userData.jewel as THREE.Mesh | undefined;
            if (jewel) jewel.rotation.y -= delta * 3.2;
          }
          const isMoving = !ccActive && distance > 2.2 && (!enemy.attackSystem || enemy.attackSystem.canMove());

          if (isMoving) {
            // Frame-rate independent step (×60 keeps the original 60fps feel)
            // Hacked units are overclocked — they rush their victims faster
            // and more erratically than a normal chase.
            const speedMul = enemy.isDodging ? 3.0
              : enemy.hacked ? aiDecision.moveSpeed * 1.7
              : aiDecision.moveSpeed;
            // Adaptive mode scales the whole swarm's pace live with the player's
            // performance (1.0 elsewhere, so fixed difficulties are unchanged).
            const step = enemy.speed * speedMul * delta * 60 * (isAdaptiveMode ? adaptiveSpeedMult : 1) * enemySpeedMult(enemy);
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
            // ── SMART STUCK RECOVERY — CONTEXT STEERING ─────────────────────
            // The repulsion/tangent steering above frees an enemy from MOST
            // pockets, but a robot wedged into a tight notch between two trees
            // can still have its forces cancel and dead-stop. The old fix juked
            // a RANDOM way — a 50/50 that often shoved it straight back into
            // the obstacle, so it stayed stuck. Instead we now run a tiny
            // CONTEXT-STEERING search: sample directions all around the enemy,
            // march a short probe down each to measure how far it stays CLEAR
            // (openness), and score that against how well it points at the
            // player (interest). The most-open, best-aligned gap wins — which
            // is reliably the way OUT of the pocket. We commit to it for a
            // short window so the enemy doesn't dither, and the LONGER it stays
            // stuck the more it leans on raw openness over chasing the player
            // (escape at any cost), guaranteeing it works itself free.
            // Ref: Andrew Fray, "Context Steering" (Game AI Pro 2, ch. 18).
            const esc = enemy as unknown as {
              escapeT?: number; escapeX?: number; escapeZ?: number;
            };
            if (enemy.stuckTimer > 0.6) {
              if (!esc.escapeT || esc.escapeT <= 0) {
                const SAMPLES = 12;
                const MARCH = 3;
                const probe = Math.max(3.0, step * 8); // look-ahead distance (m)
                // Early stuck → still favour the player; deep stuck → openness.
                const interestW = Math.max(0.25, 2.0 - (enemy.stuckTimer - 0.6) * 0.7);
                let bestScore = -Infinity, bestX = -desiredNX, bestZ = -desiredNZ;
                let openBest = -1, openX = -desiredNX, openZ = -desiredNZ;
                for (let sIdx = 0; sIdx < SAMPLES; sIdx++) {
                  const ang = (sIdx / SAMPLES) * Math.PI * 2;
                  const dx = Math.sin(ang), dz = Math.cos(ang);
                  let clear = 0;
                  for (let m = 1; m <= MARCH; m++) {
                    const d = (probe * m) / MARCH;
                    if (checkTerrainCollision(px + dx * d, pz + dz * d)) break;
                    clear = d;
                  }
                  // Remember the most-open heading as a guaranteed fallback,
                  // even if every direction is at least partly blocked.
                  if (clear > openBest) { openBest = clear; openX = dx; openZ = dz; }
                  if (clear < step * 1.5) continue; // too blocked to commit to
                  const interest = dx * desiredNX + dz * desiredNZ; // −1..1
                  const score = clear * 0.5 + interest * interestW;
                  if (score > bestScore) { bestScore = score; bestX = dx; bestZ = dz; }
                }
                if (bestScore === -Infinity) { bestX = openX; bestZ = openZ; }
                esc.escapeX = bestX; esc.escapeZ = bestZ;
                esc.escapeT = 0.4; // commit window before re-evaluating
              }
              activeSteerX = esc.escapeX ?? activeSteerX;
              activeSteerZ = esc.escapeZ ?? activeSteerZ;
            }
            if (esc.escapeT && esc.escapeT > 0) esc.escapeT -= delta;

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

            // ── HARD UNSTUCK (guaranteed recovery) ──────────────────────────
            // The context-steering escape above frees a robot from almost every
            // pocket, but one genuinely WEDGED between two rocks can have every
            // sampled direction blocked AND both wall-slide axes blocked, leaving
            // it vibrating in place forever. As an absolute last resort, once it
            // has been stuck long enough we relocate it to the nearest OPEN spot
            // — a small ring search biased toward the player so it reads as the
            // robot squeezing free, not teleporting across the map. This makes
            // recovery from any trap GUARANTEED.
            if (enemy.stuckTimer > 1.5) {
              const toPlayerAng = Math.atan2(
                focusPos.x - enemy.mesh.position.x,
                focusPos.z - enemy.mesh.position.z,
              );
              let freed = false;
              for (let ring = 0; ring < 4 && !freed; ring++) {
                const rr = 1.6 + ring * 1.2; // 1.6 → 5.2 m
                for (let a = 0; a < 8 && !freed; a++) {
                  // Scan toward the player first, then fan out to both sides.
                  const off = ((a + 1) >> 1) * (Math.PI / 4) * (a % 2 === 0 ? 1 : -1);
                  const ang = toPlayerAng + off;
                  const nx = enemy.mesh.position.x + Math.sin(ang) * rr;
                  const nz = enemy.mesh.position.z + Math.cos(ang) * rr;
                  if (!checkTerrainCollision(nx, nz)) {
                    enemy.mesh.position.x = nx;
                    enemy.mesh.position.z = nz;
                    freed = true;
                  }
                }
              }
              enemy.stuckTimer = 0;
              (enemy as unknown as { escapeT?: number }).escapeT = 0;
            }

            // Facing: far out the enemy faces its actual travel direction for a
            // natural walk, but once it closes into engagement range (or is
            // blocked) it SQUARES UP to the player. Up close the travel vector
            // is usually sideways — the flank arc from buildHunt plus crowd
            // separation — which is exactly what read as the enemy "looking off
            // to the side". Facing the player here also lets the melee arc check
            // in AttackSystem.checkHit actually land instead of whiffing.
            const ENGAGE_FACE_DIST = 9;
            let faceX: number, faceZ: number;
            if (movedLen > 0.0005 && distance > ENGAGE_FACE_DIST) { faceX = movedX; faceZ = movedZ; }
            else { faceX = focusPos.x - enemy.mesh.position.x; faceZ = focusPos.z - enemy.mesh.position.z; }
            // Never show the player your back mid-hunt: if the travel step
            // points AWAY from a visible player who's already close (a stale
            // throttled AI target, dodge or separation shove can do this for a
            // frame or two when the player charges in), square up to the player
            // instead — the stride keeps playing, so it reads as a backpedal
            // rather than the old "turns around for a moment" glitch.
            if (canSeePlayer && distance < 20 && movedLen > 0.0005) {
              const toPX = focusPos.x - enemy.mesh.position.x;
              const toPZ = focusPos.z - enemy.mesh.position.z;
              if (faceX * toPX + faceZ * toPZ < 0) { faceX = toPX; faceZ = toPZ; }
            }
            const targetAngle = Math.atan2(faceX, faceZ);
            let angleDiff = targetAngle - enemy.mesh.rotation.y;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            enemy.mesh.rotation.y += angleDiff * Math.min(1, delta * 9 * (TURN_RATE_MULT[enemy.type] ?? 1));

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
              // Arms now pivot at the shoulder, so the hand travels on a longer
              // lever — a gentler 0.5 swing reads natural (the old 0.7 over-swung).
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, Math.sin(walkPhase + Math.PI) * stride * 0.5, 0.18);
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, Math.sin(walkPhase) * stride * 0.5, 0.18);
              // Settle the arms back to the side — clears any leftover splay/roll
              // from a summon telegraph or stagger so the hands never fold across
              // the body (was the boss "arms overlapping the torso" bug).
              enemy.leftArm.rotation.z = THREE.MathUtils.lerp(enemy.leftArm.rotation.z, 0, 0.18);
              enemy.rightArm.rotation.z = THREE.MathUtils.lerp(enemy.rightArm.rotation.z, 0, 0.18);
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

            // Gentle arm sway while idle, with the arms settling back to the
            // side (rotation.z → 0) so a post-summon/stagger splay never leaves
            // the hands folded across the torso.
            if (enemy.leftArm) {
              const idleArmLeft = Math.sin(idlePhase * 0.5) * 0.05;
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, idleArmLeft, 0.08);
              enemy.leftArm.rotation.z = THREE.MathUtils.lerp(enemy.leftArm.rotation.z, 0, 0.1);
            }
            if (enemy.rightArm) {
              const idleArmRight = Math.sin(idlePhase * 0.5 + 0.5) * 0.05;
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, idleArmRight, 0.08);
              enemy.rightArm.rotation.z = THREE.MathUtils.lerp(enemy.rightArm.rotation.z, 0, 0.1);
            }

            // Subtle breathing motion on body
            enemy.mesh.position.y = THREE.MathUtils.lerp(enemy.mesh.position.y, groundY + Math.sin(idlePhase) * 0.02, 0.1);

            // Reset torso tilt
            if (enemy.torso) {
              enemy.torso.rotation.x = THREE.MathUtils.lerp(enemy.torso.rotation.x, 0, 0.08);
            }

            // Square up to the player while idle / attacking. The body used to
            // freeze facing wherever it last walked in (usually a sideways flank
            // approach), so a stopped or mid-attack enemy appeared to stare off
            // to the side — and its frontal attack arc could miss. Now it always
            // turns to face you whenever it isn't actively walking somewhere.
            const idleFaceX = focusPos.x - enemy.mesh.position.x;
            const idleFaceZ = focusPos.z - enemy.mesh.position.z;
            if (idleFaceX * idleFaceX + idleFaceZ * idleFaceZ > 1e-6) {
              const idleTargetAngle = Math.atan2(idleFaceX, idleFaceZ);
              let idleAngleDiff = idleTargetAngle - enemy.mesh.rotation.y;
              while (idleAngleDiff > Math.PI) idleAngleDiff -= Math.PI * 2;
              while (idleAngleDiff < -Math.PI) idleAngleDiff += Math.PI * 2;
              enemy.mesh.rotation.y += idleAngleDiff * Math.min(1, delta * 7 * (TURN_RATE_MULT[enemy.type] ?? 1));
            }
          }

          // === HEAD TRACKING — look at player ===
          if (enemy.head) {
            const headDx = focusPos.x - enemy.mesh.position.x;
            const headDz = focusPos.z - enemy.mesh.position.z;
            // Local-space rotation: subtract body rotation to get relative angle,
            // wrapped to the shortest arc so a body mid-turn doesn't make the head
            // briefly snap the long way round.
            let headTargetY = Math.atan2(headDx, headDz) - enemy.mesh.rotation.y;
            while (headTargetY > Math.PI) headTargetY -= Math.PI * 2;
            while (headTargetY < -Math.PI) headTargetY += Math.PI * 2;
            // Clamp head turn to ±70° and track faster so it stays locked on the
            // player instead of lagging behind and reading as "looking away".
            const clampedHeadY = Math.max(-1.22, Math.min(1.22, headTargetY));
            enemy.head.rotation.y = THREE.MathUtils.lerp(enemy.head.rotation.y, clampedHeadY, 0.16);
            // Slight head pitch toward player (look down if close, up if far)
            const headPitch = distance < 5 ? 0.15 : distance < 15 ? 0.05 : -0.05;
            enemy.head.rotation.x = THREE.MathUtils.lerp(enemy.head.rotation.x, headPitch, 0.1);
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

        // ── HAZARD POOLS BURN ENEMIES TOO ──────────────────────────────────
        // Critical for the feature to read as a WORLD rule rather than a player
        // tax: kiting a pack of runners through a lava field has to be a real,
        // rewarding play.
        //
        // Cost control is the per-enemy `nextHazardTickAt` backoff: an enemy
        // standing in nothing re-queries only every 250 ms, and those timers
        // stagger themselves apart after the first frame. Deliberately NOT
        // distance-gated — a pool has to behave the same everywhere, or an
        // enemy would wade through lava unharmed simply because the player was
        // far away, and the rule would stop being a rule.
        if (!isMpGuest && !enemy.dead && maxHazardRadius > 0 && frameNowMs >= (enemy.nextHazardTickAt ?? 0)) {
          const eh = hazardAt(enemy.mesh.position.x, enemy.mesh.position.z);
          if (eh && HAZARD_RULES[eh.kind].dps > 0) {
            const rule = HAZARD_RULES[eh.kind];
            enemy.nextHazardTickAt = frameNowMs + rule.tickMs;
            enemy.health -= rule.dps * (rule.tickMs / 1000) * (0.45 + 0.55 * eh.depth);
            enemy.damageFlashTime = Math.max(enemy.damageFlashTime, 0.15);
            if (Math.random() < 0.4) {
              createParticles(enemy.mesh.position, eh.kind === 'lava' ? 0xff5522 : 0x9bd94a, 3);
            }
            if (enemy.health <= 0) { handleEnemyKilled(enemy, false); continue; }
          } else {
            // Not in a pool — back off the check so it's not re-queried every frame.
            enemy.nextHazardTickAt = frameNowMs + 250;
          }
        }

        // Overshield expiry (any archetype can be wearing one). Applies to the
        // linger timeout as well as the popped case handled in the bullet pass,
        // so a shield that simply runs out also drops its marker ring. Shared
        // asset — detach only.
        if ((enemy.overshield ?? 0) > 0 && frameNowMs >= (enemy.overshieldUntil ?? 0)) {
          enemy.overshield = 0;
          if (enemy.overshieldRing) {
            enemy.mesh.remove(enemy.overshieldRing);
            enemy.overshieldRing = undefined;
          }
        }

        // ══ TACTICAL ARCHETYPE BEHAVIOUR ═══════════════════════════════════
        // Solo-only (these never spawn in MP), so no host/guest arbitration is
        // needed. Each block is a small state machine on the enemy itself; none
        // of them allocate per frame.
        if (enemy.type === 'bulwark' && enemy.bulwarkShield) {
          // The shield pulses subtly and flares white when it eats a hit, so
          // "your shots are doing nothing" is legible rather than confusing.
          const flash = enemy.bulwarkFlash ?? 0;
          if (flash > 0) enemy.bulwarkFlash = Math.max(0, flash - delta * 3.5);
          const pulse = 0.20 + Math.sin(frameNowMs * 0.004) * 0.04 + (enemy.bulwarkFlash ?? 0) * 0.5;
          // Per-instance opacity would need a per-instance material (a new
          // shader program); instead scale the shield slightly — same read,
          // zero material cost.
          enemy.bulwarkShield.scale.setScalar(1 + (enemy.bulwarkFlash ?? 0) * 0.12);
          enemy.bulwarkShield.visible = pulse > 0;
        } else if (enemy.type === 'howler') {
          // Pulse an overshield onto nearby allies. This is the whole reason
          // the archetype exists: left alone, the swarm stops dying.
          enemy.howlerAura?.rotateZ(delta * 0.9);
          if (frameNowMs >= (enemy.howlerNextPulseAt ?? 0)) {
            enemy.howlerNextPulseAt = frameNowMs + HOWLER_PULSE_MS;
            const hx = enemy.mesh.position.x;
            const hz = enemy.mesh.position.z;
            let buffed = 0;
            for (let hi = 0; hi < enemies.length; hi++) {
              const ally = enemies[hi];
              if (ally === enemy || ally.dead || ally.health <= 0) continue;
              if (ally.type === 'howler') continue; // no mutual-heal lock
              const ddx = ally.mesh.position.x - hx;
              const ddz = ally.mesh.position.z - hz;
              if (ddx * ddx + ddz * ddz > HOWLER_AURA_RADIUS * HOWLER_AURA_RADIUS) continue;
              ally.overshield = Math.min(HOWLER_SHIELD_AMOUNT, (ally.overshield ?? 0) + HOWLER_SHIELD_AMOUNT);
              ally.overshieldUntil = frameNowMs + HOWLER_SHIELD_LINGER_MS;
              buffed++;
              // Visual marker so the player can SEE which enemies are buffed
              // (and therefore why they aren't dying).
              if (!ally.overshieldRing) {
                const ring = buildOvershieldRing();
                ally.mesh.add(ring);
                ally.overshieldRing = ring;
              }
            }
            if (buffed > 0) {
              soundManager.playAt('enemy_alert', hx, enemy.mesh.position.y, hz, 0.4, 1.45);
            }
          }
        } else if (enemy.type === 'leaper' && enemy.leapVel) {
          const st = enemy.leapState ?? 'idle';
          if (st === 'idle') {
            // Commit to a pounce when in the band and off cooldown. The band
            // matters: too close and there's no reaction window, too far and it
            // reads as random.
            if (
              frameNowMs >= (enemy.leapNextAt ?? 0)
              && distance > LEAP_MIN_RANGE && distance < LEAP_MAX_RANGE
              && !phantomActive
            ) {
              enemy.leapState = 'crouch';
              enemy.leapUntil = frameNowMs + LEAP_CROUCH_MS;
              // The tell — loud, positional, and distinct. Without this the
              // pounce is unfair rather than reactive.
              soundManager.playAt(
                'enemy_attack',
                enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z,
                0.75, 0.8,
              );
            }
          } else if (st === 'crouch') {
            // Visibly compress before the spring.
            const k = 1 - (enemy.leapUntil! - frameNowMs) / LEAP_CROUCH_MS;
            enemy.mesh.scale.set(baseScale * (1 + k * 0.18), baseScale * (1 - k * 0.28), baseScale * (1 + k * 0.18));
            if (frameNowMs >= (enemy.leapUntil ?? 0)) {
              // Launch on a ballistic arc toward where the player is NOW.
              const lx = focusPos.x - enemy.mesh.position.x;
              const lz = focusPos.z - enemy.mesh.position.z;
              const ld = Math.hypot(lx, lz) || 1;
              const speed = Math.min(22, 9 + ld * 0.75);
              enemy.leapVel.set((lx / ld) * speed, 11.5, (lz / ld) * speed);
              enemy.leapState = 'air';
              enemy.leapUntil = frameNowMs + LEAP_AIR_MAX_MS;
              enemy.mesh.scale.setScalar(baseScale);
            }
          } else if (st === 'air') {
            // Same ballistic integration the death-ragdoll launcher uses.
            enemy.leapVel.y -= 26 * delta;
            enemy.mesh.position.x += enemy.leapVel.x * delta;
            enemy.mesh.position.y += enemy.leapVel.y * delta;
            enemy.mesh.position.z += enemy.leapVel.z * delta;
            const landY = visualGroundY(enemy.mesh.position.x, enemy.mesh.position.z) + 1.0 * baseScale;
            if (enemy.mesh.position.y <= landY || frameNowMs >= (enemy.leapUntil ?? 0)) {
              enemy.mesh.position.y = landY;
              enemy.leapState = 'recover';
              enemy.leapUntil = frameNowMs + LEAP_RECOVER_MS;
              enemy.leapNextAt = frameNowMs + LEAP_COOLDOWN_MS;
              // Impact: damage + a brief root if the player is still in the
              // landing zone. Dodging the tell avoids all of it.
              const idx2 = camera.position.x - enemy.mesh.position.x;
              const idz2 = camera.position.z - enemy.mesh.position.z;
              if (idx2 * idx2 + idz2 * idz2 < 9) {
                takeEnemyDamage(LEAP_IMPACT_DAMAGE * enemyDamageMult(enemy), 'Leaper', enemy.mesh.position);
                playerRootedUntil = frameNowMs + LEAP_ROOT_MS;
              }
              createParticles(enemy.mesh.position, 0xff8c2e, 10);
              soundManager.playAt(
                'impact_dirt',
                enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z,
                0.7, 0.7,
              );
              if (gameSettingsManager.getSetting('screenShake') && idx2 * idx2 + idz2 * idz2 < 64) triggerScreenShake();
            }
          } else if (st === 'recover') {
            // Wide-open window — the reward for having read the tell.
            if (frameNowMs >= (enemy.leapUntil ?? 0)) enemy.leapState = 'idle';
          }
        }

        // === RANGED SNIPER FIRING ===
        // The 'ranged' archetype skips melee entirely. It charges up for
        // ~750ms when the player is in its sweet spot AND has line of
        // sight (no tree in the way), then launches a cyan energy bolt
        // travelling at moderate speed so the player can side-step it.
        if (enemy.type === 'ranged' && !enemy.hacked && !enemy.dead && enemy.health > 0) {
          const RANGED_MIN = 6;   // back off in the player's face
          const RANGED_MAX = 50;  // can't see past this in dense maps
          const dxR = focusPos.x - enemy.mesh.position.x;
          const dzR = focusPos.z - enemy.mesh.position.z;
          const distR = Math.hypot(dxR, dzR);
          // Phantom cloak makes the player untargetable, and a Cryo/Shockwave
          // stun locks the weapon — both force the charge to reset (else-branch
          // below) so the unit lowers its weapon instead of firing.
          const inRange = distR >= RANGED_MIN && distR <= RANGED_MAX
            && !phantomActive && frameNowMs >= (enemy.ccUntil ?? 0);
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
          // Hold fire unless the sniper is genuinely rendered on the player's
          // screen (or right on top of them) — no shots from beyond the fog/cull
          // horizon where the player can't even see the shooter. (`!== false` so
          // an unevaluated enemy still behaves normally.) In MP, a host-owned
          // sniper aiming at a REMOTE player is judged by THAT player's view, not
          // the host's camera, so the local engageable gate is skipped for it.
          const engageGate = enemy.engageable !== false || (isMpHost && focusPlayerId !== null);
          if (los && engageGate) {
            if ((enemy.rangedNextShotAt ?? 0) <= frameNowMs) {
              const wasCharging = (enemy.rangedChargeMs ?? 0) > 0;
              enemy.rangedChargeMs = (enemy.rangedChargeMs ?? 0) + delta * 1000;
              // Spin-up whine at the instant the charge starts — the audible
              // half of the telegraph, positional so it tells the player WHERE.
              if (!wasCharging) {
                soundManager.playAt('powerUp', enemy.mesh.position.x, enemy.mesh.position.y + 1.4, enemy.mesh.position.z, 0.30, 0.72);
              }
              if (enemy.rangedChargeMs >= CHARGE_MS) {
                // Launch the bolt from the WEAPON'S BORE. This used to be a
                // fixed offset off the chassis root, so the round left the
                // sniper's chest while the barrel pointed elsewhere.
                const origin = enemyMuzzleOrigin(enemy, 1.2);
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
                  // ARK-07 empowerment baked into the bolt at launch.
                  damage: enemy.damage * enemyDamageMult(enemy),
                  life: 240,
                });
                // Positional — a sniper bolt from off-screen is the single most
                // valuable directional cue in the game, and it used to play at
                // a flat volume with no panning regardless of where it came from.
                soundManager.playAt(
                  'shoot_pistol',
                  enemy.mesh.position.x, enemy.mesh.position.y + 1.4, enemy.mesh.position.z,
                  0.6, 1.3,
                );
                enemy.rangedChargeMs = 0;
                enemy.rangedNextShotAt = frameNowMs + COOLDOWN_MS;
                enemy.recoilTime = RECOIL_S;
                // Muzzle flash at the bore, not at the chassis.
                createParticles(origin, 0x8ff5ff, 6);
              }
            }
          } else {
            // Lost LOS or out of range — drop any in-progress charge.
            enemy.rangedChargeMs = 0;
          }
          // Present / lower the weapon and drive the charge telegraph. Called
          // unconditionally so the pose also eases back DOWN once the sniper
          // loses its shot — otherwise it would stay frozen mid-aim.
          driveShooterPose(
            enemy, focusPos.x, camera.position.y - 0.2, focusPos.z,
            (enemy.rangedChargeMs ?? 0) / CHARGE_MS,
            los && engageGate,
            delta, frameNowMs,
                );
        }

        // === HACKED SNIPER (subverter on a ranged enemy) ===
        // A subverted shooter keeps SHOOTING — at its own kind. Previously a
        // hacked ranged unit had its bolts disabled and was shoved into the
        // melee path, but the "support" AI kites away from its target so it
        // never connected — it just wandered uselessly until it burned out. Now
        // it snipes the hunt victim with overclocked bolts (faster charge +
        // shorter cooldown) and actually contributes kills before it detonates.
        if (enemy.type === 'ranged' && enemy.hacked && !enemy.dead && enemy.health > 0
            && hackVictim && !hackVictim.dead && hackVictim.health > 0) {
          const HACK_SNIPE_RANGE = 55;
          const dxs = hackVictim.mesh.position.x - enemy.mesh.position.x;
          const dzs = hackVictim.mesh.position.z - enemy.mesh.position.z;
          const hackInRange = Math.hypot(dxs, dzs) <= HACK_SNIPE_RANGE;
          if (hackInRange) {
            if ((enemy.rangedNextShotAt ?? 0) <= frameNowMs) {
              enemy.rangedChargeMs = (enemy.rangedChargeMs ?? 0) + delta * 1000;
              if ((enemy.rangedChargeMs ?? 0) >= 380) { // overclocked → snappy charge
                const origin = enemyMuzzleOrigin(enemy, 1.2);
                const tgt = hackVictim.mesh.position.clone(); tgt.y += 0.9;
                // Green overclock bolt streak + impact sparks on the victim.
                hackBeams.push(new HackBeam(scene, origin, tgt));
                const sd = tgt.clone().sub(origin).normalize();
                robotSparks.push(new RobotHitSparks(scene, tgt.clone(), sd, 10));
                soundManager.play('shoot_pistol', 0.5, false, 1.5);
                // Damage the victim (same overclocked multiplier as a hacked melee).
                // If the victim is a Revenant, the hacked assault strips its
                // shield + suppresses its teleport so it can't shrug this off.
                markRevenantHackedHit(hackVictim);
                hackVictim.health -= enemy.damage * HACK_VICTIM_DMG_MULT;
                hackVictim.damageFlashTime = Math.max(hackVictim.damageFlashTime, 0.3);
                // A subverter-hacked unit's overclocked bolts dent its kin too.
                stampEnemyDamage(hackVictim, enemy.damage * HACK_VICTIM_DMG_MULT, false, undefined, enemy.mesh.position);
                if (hackVictim.health <= 0) handleEnemyKilled(hackVictim, false);
                enemy.rangedChargeMs = 0;
                enemy.rangedNextShotAt = frameNowMs + 900; // faster than a normal sniper
                enemy.recoilTime = RECOIL_S;
              }
            }
          } else {
            enemy.rangedChargeMs = 0;
          }
          // Same presentation as an unhacked sniper — a subverted unit still
          // shoulders its lance, it just points it at its own kind.
          driveShooterPose(
            enemy, hackVictim.mesh.position.x, hackVictim.mesh.position.y + 0.9, hackVictim.mesh.position.z,
            (enemy.rangedChargeMs ?? 0) / 380,
            hackInRange,
            delta, frameNowMs,
                );
        } else if (enemy.type === 'ranged' && enemy.hacked && !enemy.dead) {
          // Hacked but with no live victim: neither firing block owns this unit,
          // so drive the pose to "weapon down" here. Without it the lance would
          // freeze mid-aim — and its recoil/charge timers would stop decaying —
          // for as long as the subversion lasts.
          driveShooterPose(
            enemy, enemy.mesh.position.x, enemy.mesh.position.y, enemy.mesh.position.z,
            0, false, delta, frameNowMs,
                );
        }

        // === BOSS BLINK / TELEPORT (wave 10+) ===
        // A genuinely smart boss doesn't just trundle at the player — it warps
        // around them to flank/backstab, and blinks away the moment it's being
        // focused. Burst-capped by recharging CHARGES so it can't chain-blink
        // forever, never lands inside the fairness floor, and is host/solo-only
        // (guests mirror the host's authoritative position). Decays its arrival
        // VFX timer here too.
        if (enemy.bossTeleArriveFx && enemy.bossTeleArriveFx > 0) {
          enemy.bossTeleArriveFx = Math.max(0, enemy.bossTeleArriveFx - delta);
        }
        if (enemy.type === 'boss' && !enemy.hacked && !enemy.dead && enemy.health > 0 && !isMpGuest
            && (enemy.bossSummonCast ?? 0) <= 0 && enemy.engageable !== false) {
          // Refill one charge when due.
          const maxCharges = enemy.bossTeleMaxCharges ?? 2;
          if ((enemy.bossTeleCharges ?? 0) < maxCharges && frameNowMs >= (enemy.bossTeleNextChargeAt ?? 0)) {
            enemy.bossTeleCharges = (enemy.bossTeleCharges ?? 0) + 1;
            enemy.bossTeleNextChargeAt = frameNowMs + bossTeleProfile.regen;
          }
          // Consider a blink when off the per-blink cooldown AND a charge is ready.
          if ((enemy.bossTeleCharges ?? 0) > 0 && frameNowMs >= (enemy.bossTeleNextAt ?? 0)) {
            const distToPlayer = Math.hypot(focusPos.x - enemy.mesh.position.x, focusPos.z - enemy.mesh.position.z);
            const beingFocused = enemy.damageFlashTime > 0.12; // just got shot → evade
            const tooFar = distToPlayer > 26;                  // can't close the gap → blink in
            let doTele = beingFocused || tooFar;
            // Otherwise periodically reposition to a flank (more often in Hard).
            if (!doTele && Math.random() < bossTeleProfile.reposChance) doTele = true;
            if (doTele) {
              if (performBossTeleport(enemy, focusPos.x, focusPos.z, focusVel.x, focusVel.z)) {
                enemy.bossTeleCharges = (enemy.bossTeleCharges ?? 1) - 1;
                enemy.bossTeleNextAt = frameNowMs + bossTeleProfile.perBlink;
                // Schedule the first charge refill from now if the pool was full.
                if ((enemy.bossTeleCharges ?? 0) === maxCharges - 1) {
                  enemy.bossTeleNextChargeAt = frameNowMs + bossTeleProfile.regen;
                }
              } else {
                enemy.bossTeleNextAt = frameNowMs + 1200; // blocked — retry soon
              }
            } else {
              enemy.bossTeleNextAt = frameNowMs + bossTeleProfile.evalDelay; // reconsider later
            }
          }
        }

        // === BOSS SUMMONER (wave 10+) ===
        // The boss periodically calls in reinforcements. It first rears up in a
        // telegraph (arms thrown overhead, rising motes) so the player can read
        // the wind-up, then the pack bursts in (performBossSummon). Host/solo
        // only — guests mirror the host's authoritative spawns.
        if (enemy.type === 'boss' && !enemy.hacked && !enemy.dead && enemy.health > 0 && !isMpGuest) {
          if ((enemy.bossSummonCast ?? 0) > 0) {
            // Mid-telegraph: throw both arms overhead and count the cast down.
            enemy.bossSummonCast = (enemy.bossSummonCast ?? 0) - delta;
            if (enemy.leftArm) {
              enemy.leftArm.rotation.x = THREE.MathUtils.lerp(enemy.leftArm.rotation.x, -2.3, 0.35);
              enemy.leftArm.rotation.z = THREE.MathUtils.lerp(enemy.leftArm.rotation.z, 0.5, 0.35);
            }
            if (enemy.rightArm) {
              enemy.rightArm.rotation.x = THREE.MathUtils.lerp(enemy.rightArm.rotation.x, -2.3, 0.35);
              enemy.rightArm.rotation.z = THREE.MathUtils.lerp(enemy.rightArm.rotation.z, -0.5, 0.35);
            }
            // Rising summon motes from the boss while it charges.
            if (Math.random() < 0.4) {
              createParticles(
                new THREE.Vector3(
                  enemy.mesh.position.x + (Math.random() - 0.5) * 2,
                  enemy.mesh.position.y + 0.5,
                  enemy.mesh.position.z + (Math.random() - 0.5) * 2,
                ),
                0xe85aff, 3,
              );
            }
            if ((enemy.bossSummonCast ?? 0) <= 0) {
              enemy.bossSummonCast = 0;
              performBossSummon(enemy);
            }
          } else if (frameNowMs >= (enemy.bossNextSummonAt ?? Infinity)) {
            // Time to summon — but only when the player is engaged and the pool
            // has headroom; otherwise nudge the timer and try again shortly.
            const headroom = enemies.length < smartEnemyManager.getCurrentMaxEnemies() - 2
              && smartEnemyManager.canSpawnMore();
            if (enemy.engageable !== false && headroom) {
              // Enraged (phase-2) bosses summon bigger packs more often. On EASY
              // the boss summons a SMALLER pack far LESS often — half the spawns
              // on a much longer fuse — so the wave stays manageable.
              const phase2 = (enemy.bossPhase ?? 1) === 2;
              const easyBoss = classicDifficulty === 'easy';
              enemy.bossSummonCount = easyBoss
                ? (phase2 ? 2 : 1) + (Math.random() < 0.3 ? 1 : 0)
                : (phase2 ? 4 : 3) + (Math.random() < 0.4 ? 1 : 0);
              enemy.bossSummonCast = SUMMON_TELEGRAPH;
              const cooldown = (easyBoss ? (phase2 ? 16000 : 22000) : (phase2 ? 9000 : 13000)) + Math.random() * 3000;
              enemy.bossNextSummonAt = frameNowMs + cooldown + SUMMON_TELEGRAPH * 1000;
              soundManager.play('powerUp', 0.7, false, 0.55); // charge-up roar
            } else {
              enemy.bossNextSummonAt = frameNowMs + 2500;
            }
          }
        }

        // === REVENANT (rare apex trickster) ===
        // The smartest, deadliest enemy: it shoots gold bolts, BLINKS around the
        // player to flank/evade (fairness-floored, charge-limited), rarely
        // self-heals, and cycles a gold energy SHIELD that phases off everything
        // but explosives. Host/solo only (it never spawns in MP).
        if (enemy.type === 'revenant' && !enemy.hacked && !enemy.dead && enemy.health > 0 && !isMpGuest) {
          // EASY significantly tones the Revenant down (matches the boss): shorter
          // shield, LONGER open window, fewer/slower blinks, weaker rare heal.
          const easyRev = classicDifficulty === 'easy';
          // ── Shield cycle (up ↔ open window) ──
          if (enemy.revShieldHitFlash && enemy.revShieldHitFlash > 0) {
            enemy.revShieldHitFlash = Math.max(0, enemy.revShieldHitFlash - delta * 3);
          }
          if (frameNowMs < (enemy.revShieldBrokenUntil ?? 0)) {
            enemy.revShieldActive = false;                 // shattered → stays open
          } else if (enemy.revShieldActive) {
            if (frameNowMs >= (enemy.revShieldDownAt ?? 0)) {
              enemy.revShieldActive = false;
              enemy.revShieldNextUpAt = frameNowMs + (easyRev ? 2100 : 1300);  // OPEN window (Easy = longer)
            }
          } else if (frameNowMs >= (enemy.revShieldNextUpAt ?? 0)) {
            enemy.revShieldActive = true;
            enemy.revShieldDownAt = frameNowMs + (easyRev ? 2200 : 3400);      // shielded (Easy = shorter)
            createParticles(enemy.mesh.position, 0xffc24a, 8); // re-raise shimmer
          }
          // Drive the physical shield: a subtle brace-bob + a bright emblem
          // pulse that flares when a shot pings off it. (It's held, not spun.)
          if (enemy.revShield) {
            enemy.revShield.visible = enemy.revShieldActive === true;
            if (enemy.revShield.visible) {
              const flash = enemy.revShieldHitFlash ?? 0;
              enemy.revShield.position.y = 1.05 + Math.sin(frameNowMs * 0.004) * 0.025;
              enemy.revShield.scale.setScalar(0.95 + flash * 0.07);
              const emblem = enemy.revShield.userData.emblem as THREE.Mesh | undefined;
              if (emblem) {
                const b = 0.85 + 0.2 * Math.sin(frameNowMs * 0.006) + flash * 1.1;
                (emblem.material as THREE.MeshBasicMaterial).color.setRGB(b, b * 0.82, b * 0.4);
              }
            }
          }
          // ── Rare self-heal — small, gated by NOT being under fire (Easy: a
          // smaller trickle on a much longer fuse) ──
          if (frameNowMs >= (enemy.revRegenNextAt ?? Infinity)
              && enemy.health < enemy.maxHealth && enemy.damageFlashTime <= 0.05) {
            enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * (easyRev ? 0.07 : 0.15));
            enemy.revRegenNextAt = frameNowMs + (easyRev ? 22000 : 13000) + Math.random() * 6000; // rarely
            _tempVec3.copy(enemy.mesh.position); _tempVec3.y += 1.0;
            createParticles(_tempVec3, 0x9bff8a, 12);  // green heal motes
            soundManager.play('powerUp', 0.4, false, 1.9);
          }
          // ── Blink: refill charges, then decide ──
          const revMax = classicDifficulty === 'hard' ? 3 : easyRev ? 1 : 2;
          if ((enemy.revTeleCharges ?? 0) < revMax && frameNowMs >= (enemy.revTeleNextChargeAt ?? 0)) {
            enemy.revTeleCharges = (enemy.revTeleCharges ?? 0) + 1;
            enemy.revTeleNextChargeAt = frameNowMs + (easyRev ? 13000 : 7000);
          }
          // Teleport is SUPPRESSED while a subverter-hacked enemy is mauling it.
          if ((enemy.revTeleCharges ?? 0) > 0 && frameNowMs >= (enemy.revTeleNextAt ?? 0)
              && frameNowMs >= (enemy.revTeleSuppressUntil ?? 0) && enemy.engageable !== false) {
            const dTo = Math.hypot(focusPos.x - enemy.mesh.position.x, focusPos.z - enemy.mesh.position.z);
            // Evade ONLY player fire (revEvadeUntil) — never flee a hacked hunter.
            const beingFocused = (enemy.revEvadeUntil ?? 0) > frameNowMs;
            // Blink to evade fire or to close a big gap — but DON'T auto-flee when
            // close: it should press in and MELEE at point-blank, not just kite.
            let doTele = beingFocused || dTo > 30;
            if (!doTele && Math.random() < (classicDifficulty === 'hard' ? 0.5 : easyRev ? 0.14 : 0.32)) doTele = true;
            if (doTele) {
              if (performBossTeleport(enemy, focusPos.x, focusPos.z, focusVel.x, focusVel.z, 0xffc24a, 0xffe0a0)) {
                enemy.revTeleCharges = (enemy.revTeleCharges ?? 1) - 1;
                enemy.revTeleNextAt = frameNowMs + (classicDifficulty === 'hard' ? 1400 : easyRev ? 3400 : 2200);
              } else {
                enemy.revTeleNextAt = frameNowMs + 1000;
              }
            } else {
              enemy.revTeleNextAt = frameNowMs + 2400;
            }
          }
          // ── Shoot a gold bolt at the player (faster cadence than a Sniper) ──
          const dxv = focusPos.x - enemy.mesh.position.x;
          const dzv = focusPos.z - enemy.mesh.position.z;
          const distV = Math.hypot(dxv, dzv);
          const canFire = distV >= 6 && distV <= 48 && !phantomActive
            && frameNowMs >= (enemy.ccUntil ?? 0) && enemy.engageable !== false;
          if (canFire) {
            if ((enemy.rangedNextShotAt ?? 0) <= frameNowMs) {
              const wasCharging = (enemy.rangedChargeMs ?? 0) > 0;
              enemy.rangedChargeMs = (enemy.rangedChargeMs ?? 0) + delta * 1000;
              if (!wasCharging) {
                soundManager.playAt('powerUp', enemy.mesh.position.x, enemy.mesh.position.y + 1.4, enemy.mesh.position.z, 0.32, 0.9);
              }
              if ((enemy.rangedChargeMs ?? 0) >= 520) {
                // From the lance's bore — see the sniper path above.
                const origin = enemyMuzzleOrigin(enemy, 1.0);
                const target = new THREE.Vector3(focusPos.x, camera.position.y - 0.2, focusPos.z);
                const dir = target.clone().sub(origin).normalize();
                const bolt = new THREE.Mesh(_enemyBulletGeo, _revBoltMat);   // GOLD bolt
                bolt.position.copy(origin);
                bolt.add(new THREE.Mesh(_enemyBulletGlowGeo, _revBoltGlowMat));
                scene.add(bolt);
                enemyBullets.push({ mesh: bolt, velocity: dir.multiplyScalar(0.62), damage: enemy.damage * enemyDamageMult(enemy), life: 240 });
                soundManager.play('shoot_pistol', 0.5, false, 1.55);
                enemy.rangedChargeMs = 0;
                enemy.rangedNextShotAt = frameNowMs + 1600;
                enemy.recoilTime = RECOIL_S;
                createParticles(origin, 0xffc24a, 6);
              }
            }
          } else {
            enemy.rangedChargeMs = 0;
          }
          // The revenant BOTH shoots and melees. Its melee block runs later and
          // overwrites the arms while a swing is in progress, which is the right
          // priority: a lunge beats a presented weapon.
          driveShooterPose(
            enemy, focusPos.x, camera.position.y - 0.2, focusPos.z,
            (enemy.rangedChargeMs ?? 0) / 520,
            canFire,
            delta, frameNowMs,
                );
        }

        // === ATTACK SYSTEM ===
        // Skipped ONLY for the 'ranged' Sniper — it purely shoots (or, once
        // subverted, snipes its own kind; both handled above) and never melees.
        // EVERY other archetype melees here — including the Revenant, which both
        // shoots gold bolts AND lunges in for a close-range strike like a normal
        // enemy. (Hacked units strike their hunt victim instead of the player.)
        if (enemy.type !== 'ranged' && enemy.attackSystem) {
          enemy.attackSystem.update(delta);

          // Try to attack if in range (increased range).
          // PHANTOM: while the player is cloaked they're intangible AND
          // untargetable — enemies fully disengage, so no new melee swing is
          // started and the lunge/hit checks below are skipped. This is what
          // makes the cloak read as "they lost me", not "they swing through me".
          const shouldAttack = distance < 7.0 && !phantomActive && frameNowMs >= (enemy.ccUntil ?? 0);
          if (shouldAttack) {
            // tryAttack returns true only on the frame a NEW swing starts, so
            // this is the windup telegraph — a positional cue that gives the
            // player a directional warning before the blow lands. Enemies were
            // previously completely silent while attacking.
            const swung = enemy.attackSystem.tryAttack(
              enemy.mesh.position,
              focusPos
            );
            if (swung) {
              const ap = enemy.mesh.position;
              const heavy = enemy.type === 'tank' || enemy.type === 'boss' || enemy.isMiniBoss === true;
              soundManager.playAt('enemy_attack', ap.x, ap.y, ap.z,
                heavy ? 0.55 : 0.38, heavy ? 0.68 : enemy.type === 'fast' ? 1.3 : 1.0);
            }
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
            // ARK-07 empowerment (surge/glitch wave × uplink-field proximity)
            // scales the strike at the moment it lands, so an enemy that
            // walked into the hot zone mid-swing already hits harder. Also
            // covers the host→remote sendPlayerDamage path below (same raw).
            const raw = enemy.attackSystem.getDamage() * enemyDamageMult(enemy);
            enemy.lastAttackTime = frameNowMs; // Update for overlap cooldown
            if (enemy.hacked) {
              // ── HACKED: the strike lands on its victim enemy, not the player.
              if (hackVictim && !hackVictim.dead && hackVictim.health > 0) {
                // Revenant victim: strip its shield + suppress its teleport so
                // the hacked attacker can actually finish it.
                markRevenantHackedHit(hackVictim);
                hackVictim.health -= raw * HACK_VICTIM_DMG_MULT;
                hackVictim.damageFlashTime = 0.3;
                // A subverter-hacked unit mauling its kin dents + scuffs them too.
                stampEnemyDamage(hackVictim, raw * HACK_VICTIM_DMG_MULT, false, undefined, enemy.mesh.position);
                _tempVec3.copy(hackVictim.mesh.position); _tempVec3.y += 0.9;
                createParticles(_tempVec3, 0x39ff14, 5);
                soundManager.play('hit', 0.35, false, 1.4);
                if (hackVictim.health <= 0) handleEnemyKilled(hackVictim, false);
              }
            } else if (isMpHost && mp && focusPlayerId !== null) {
              // SHARED ENEMY struck a REMOTE player. The host owns the enemy,
              // so it tells that player's client to take the hit — this is how
              // an enemy attacking one player is reflected on their screen.
              mp.sendPlayerDamage(focusPlayerId, raw, enemyLabelOf(enemy.type));
            } else {
              // Local player takes the hit (solo, or the host's own avatar).
              // All the shield / effects / death / spectate handling lives in
              // takeEnemyDamage, shared with the guest `player_damaged` path.
              takeEnemyDamage(raw, enemyLabelOf(enemy.type), enemy.mesh.position);
            }
          }

          // Melee swing — drive the WHOLE body from the attack system while a
          // swing is in progress. When not attacking we deliberately leave the
          // limbs to the stride-synced walk / idle animation set earlier; the
          // old `else` here overwrote that with a coarse fixed-amplitude swing
          // that made even a standing enemy flail its arms.
          //
          // The pose now covers both arms independently (roll included), the
          // torso pitch AND turn, and the legs — a swipe is thrown from the
          // planted foot up through a shoulder turn, which is what makes it
          // land with weight. (getPose() reuses one object; isAttacking() /
          // getLungeDrive() are allocation-free.)
          if (enemy.attackSystem.isAttacking() && enemy.leftArm && enemy.rightArm) {
            const pose = enemy.attackSystem.getPose();
            enemy.leftArm.rotation.x = pose.leftArmX;
            enemy.leftArm.rotation.z = pose.leftArmZ;
            enemy.rightArm.rotation.x = pose.rightArmX;
            enemy.rightArm.rotation.z = pose.rightArmZ;
            if (enemy.leftLeg) enemy.leftLeg.rotation.x = pose.leftLegX;
            if (enemy.rightLeg) enemy.rightLeg.rotation.x = pose.rightLegX;
            if (enemy.torso) {
              enemy.torso.rotation.x = pose.torsoX;
              enemy.torso.rotation.y = pose.torsoY;
            }
            // Attack lunge — lurch toward the player so the hit reads as a
            // committed swing, not a passive bump. Weighted by the strike's
            // contact curve (peaks at the blow) instead of being a flat shove
            // across the whole phase, and frame-rate independent: it used to be
            // a fixed per-FRAME step, so a 144 Hz client's enemies lunged more
            // than twice as far per swing as a 60 Hz client's.
            const drive = enemy.attackSystem.getLungeDrive();
            if (drive > 0.01) {
              const lungeDx = focusPos.x - enemy.mesh.position.x;
              const lungeDz = focusPos.z - enemy.mesh.position.z;
              const lungeDist = Math.sqrt(lungeDx * lungeDx + lungeDz * lungeDz);
              if (lungeDist > 0.5) {
                const lungeStrength = 9.0 * baseScale * drive * delta;
                enemy.mesh.position.x += (lungeDx / lungeDist) * lungeStrength;
                enemy.mesh.position.z += (lungeDz / lungeDist) * lungeStrength;
              }
            }
          } else if (enemy.torso && enemy.torso.rotation.y !== 0) {
            // Unwind the shoulder turn once the swing is over — the walk/idle
            // block only ever writes torso.rotation.x, so a finished swipe
            // would otherwise leave the chassis permanently twisted.
            enemy.torso.rotation.y = THREE.MathUtils.lerp(enemy.torso.rotation.y, 0, 0.15);
            if (Math.abs(enemy.torso.rotation.y) < 0.002) enemy.torso.rotation.y = 0;
          }
        }

        // ── HIT REACTION (the satisfying "thunk" when a round lands) ──
        // The WHOLE chassis reacts so it reads at every range — the old version
        // only scaled `torso`, which lives in the HIGH-LOD group and is hidden
        // past 30 m, so a hit at normal engagement distance looked like nothing.
        // Now the body rocks BACK along the shot then springs forward and settles
        // (a damped back-and-forth on enemy.mesh.rotation.x — visible at MEDIUM/
        // LOW too) with a quick scale punch for impact weight. Driven off
        // damageFlashTime so every damage source feeds it. This block is the
        // authoritative writer of mesh.scale/rotation.x for living enemies (runs
        // last), so it cleanly overrides the lighter pulses set earlier.
        if (enemy.damageFlashTime > 0) {
          enemy.damageFlashTime -= delta;
          const r = Math.min(1, enemy.damageFlashTime / 0.3); // 1 at impact → 0
          const e2 = 1 - r;
          // Damped rock: hardest kick at impact, ~1.3 oscillations as it decays.
          enemy.mesh.rotation.x = -Math.cos(e2 * 8) * r * 0.34;
          enemy.mesh.scale.setScalar(baseScale * (1 + r * 0.16));
          if (enemy.torso) enemy.torso.scale.setScalar(1 + r * 0.22);
        } else if (enemy.mesh.rotation.x !== 0 || enemy.mesh.scale.x !== baseScale) {
          // Settle back to rest once the reaction is done.
          enemy.mesh.rotation.x = 0;
          enemy.mesh.scale.setScalar(baseScale);
          if (enemy.torso && enemy.torso.scale.x !== 1) enemy.torso.scale.setScalar(1);
        }

        // ── INSTABILITY TWITCH (hacked / overclocked) ──
        // A hacked unit is glitching out: it jitters its position and rolls its
        // chassis erratically — reads as "uncontrollable". Runs last so it sits
        // on top of the walk / hit-reaction transforms. Intensifies near burnout.
        if (enemy.hacked && !enemy.dead) {
          const urgency = 1 + (1 - (enemy.hackTimeLeft ?? 0) / (enemy.hackDuration || HACK_DURATION)) * 1.5;
          // Frame-scaled: this is a per-frame positional nudge, so on a 144 Hz
          // display a glitching unit accumulated well over twice the wander it
          // does at 60 Hz.
          const amt = 0.045 * urgency * Math.min(2, delta * 60);
          enemy.mesh.position.x += (Math.random() - 0.5) * amt;
          enemy.mesh.position.z += (Math.random() - 0.5) * amt;
          enemy.mesh.rotation.z = (Math.random() - 0.5) * 0.14 * urgency;
        }

        // ── NULL-WAVE CORRUPTION (host/solo authoritative) ──────────────
        // Units running corrupted firmware exist WRONG: a light positional
        // shiver every frame, and every few seconds one of them STUTTER-
        // BLINKS — teleports a couple of metres sideways in a burst of
        // static, exactly the "unfair" mobility the trial was never meant to
        // ship with. Guests see the skips through the interpolated sync
        // stream (a 2–3m snap reads as intended — it IS a glitch).
        if (netWaveEvent === 'glitch' && !enemy.dead && !enemy.hacked) {
          // Frame-scaled for the same reason as the hacked twitch above.
          const shiver = 0.02 * netWaveEventIntensity * Math.min(2, delta * 60);
          enemy.mesh.position.x += (Math.random() - 0.5) * shiver;
          enemy.mesh.position.z += (Math.random() - 0.5) * shiver;
          if (frameNowMs >= nextGlitchSkipCheckAt
              && enemy.type !== 'boss'
              && frameNowMs >= (enemy.nextGlitchSkipAt ?? 0)
              && frameNowMs >= (enemy.ccUntil ?? 0)
              && enemy.engageable !== false
              && distance < 45 && distance > 4
              && Math.random() < 0.5) {
            nextGlitchSkipCheckAt = frameNowMs + 600 + Math.random() * 900;
            enemy.nextGlitchSkipAt = frameNowMs + 3800 + Math.random() * 3200;
            // Sidestep perpendicular to the player bearing (random hand),
            // terrain-checked so the skip can't bury it in a trunk.
            const bearX = (focusPos.x - enemy.mesh.position.x) / Math.max(0.001, distance);
            const bearZ = (focusPos.z - enemy.mesh.position.z) / Math.max(0.001, distance);
            const hand = Math.random() < 0.5 ? 1 : -1;
            const skip = 2.4 + Math.random() * 1.6 * netWaveEventIntensity;
            const sx = enemy.mesh.position.x + (-bearZ * hand) * skip;
            const sz = enemy.mesh.position.z + (bearX * hand) * skip;
            if (!checkTerrainCollision(sx, sz)) {
              // Static burst at BOTH ends of the skip so the eye connects them.
              createParticles(enemy.mesh.position, 0x8ff5ff, 7);
              enemy.mesh.position.x = sx;
              enemy.mesh.position.z = sz;
              _tempVec3.set(sx, enemy.mesh.position.y + 0.8, sz);
              createParticles(_tempVec3, 0x8ff5ff, 7);
              soundManager.play('hack_fail', 0.22, false, 1.6 + Math.random() * 0.5);
            }
          }
        }
      }

      // ═══ ARK-07 PER-FRAME DRIVERS ═══════════════════════════════════════
      // Eases the surge red-shift, advances the EMP broadcast front, shapes
      // the NULL-WAVE corruption envelope, animates the spire and meters the
      // player's radiation dose. All uniform writes / eased scalars — nothing
      // here allocates or compiles.
      {
        const tSec = frameNowMs * 0.001;
        // OVERDRIVE red-shift — ease toward the live target, throb while hot.
        const surgeTarget = netWaveEvent === 'surge' ? 1 : 0;
        surgeVisual += (surgeTarget - surgeVisual) * Math.min(1, delta * 2.2);
        if (surgeTarget === 0 && surgeVisual < 0.005) surgeVisual = 0;
        smartEnemyManager.setSurgeFactor(surgeVisual * (0.86 + 0.14 * Math.sin(tSec * 6.2)));
        // The relay network lives: dish sweeps, beacon heartbeats, holo rings,
        // field shimmer — and every spire rides the VISUAL terrain surface
        // (visualGroundY) so distant relays never sink into displaced hills.
        if (uplinkNet && uplinkPlaced) uplinkNet.update(delta, tSec, surgeVisual, visualGroundY);
        // Explosive barrels ride the visual surface too (they scatter far
        // past the flat zone, where the displaced ground would bury them).
        // Gameplay position tracks the mesh so aimed shots stay true.
        for (let bi = 0; bi < barrels.length; bi++) {
          const b = barrels[bi];
          if (b.detonated) continue;
          const by = 0.65 + visualGroundY(b.position.x, b.position.z);
          b.mesh.position.y = by;
          b.position.y = by;
        }
        // Breathe the irradiated cores' containment bands + contamination
        // pools. One shared-material write for the whole map, and a no-op
        // entirely when this map's relays caught no barrels.
        pulseIrradiatedBarrels(barrels, tSec);
        // EMP broadcast fronts — flash/shake the moment one crosses the player.
        for (let w = empShockwaves.length - 1; w >= 0; w--) {
          const emp = empShockwaves[w];
          const alive = emp.update(delta);
          if (!emp.crossedPlayer) {
            const dp = Math.hypot(camera.position.x - emp.origin.x, camera.position.z - emp.origin.z);
            if (emp.radius >= dp) {
              emp.crossedPlayer = true;
              triggerAbilityFlash('#ff3524');
              if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
              soundManager.play('hit', 0.7, false, 0.45);
              soundManager.play('powerUp', 0.5, false, 0.42);
              haptic('hurt');
            }
          }
          if (!alive) { emp.dispose(scene); empShockwaves.splice(w, 1); }
        }
        // NULL-WAVE corruption envelope — a floor of unease + random spikes,
        // so the tearing arrives in BURSTS like a failing feed, not a filter.
        const glitchTarget = netWaveEvent === 'glitch' ? 1 : 0;
        glitchVisual += (glitchTarget - glitchVisual) * Math.min(1, delta * 3.0);
        if (glitchTarget === 0 && glitchVisual < 0.005) glitchVisual = 0;
        if (glitchVisual > 0.01) {
          if (frameNowMs >= nextGlitchBurstAt) {
            glitchBurst = 0.5 + Math.random() * 0.7;
            nextGlitchBurstAt = frameNowMs + 350 + Math.random() * 1500;
          }
          glitchBurst = Math.max(0, glitchBurst - delta * 1.8);
          postFX?.setGlitch(glitchVisual * Math.min(1, netWaveEventIntensity || 1) * (0.16 + glitchBurst * 0.55));
        } else {
          postFX?.setGlitch(0);
        }
        // Player relay-field exposure — interference-cooked vision (post-FX
        // wobble/blur/desat + the DOM static floor), geiger crackle, the
        // equipment jam latch and the grace-period dose drain. Solo + MP
        // (each client meters its own body).
        if (uplinkNet && uplinkPlaced && !isTutorialMode && !playerEliminated && !isGameOver) {
          const fieldF = uplinkFieldFactor(camera.position.x, camera.position.z);
          radiationSmooth += (fieldF - radiationSmooth) * Math.min(1, delta * 4);
          // The vision IS the warning — no HUD icon. WebGL interference on
          // capable tiers; the quantised DOM overlay guarantees the read
          // everywhere (and layers static under the blur on high tiers).
          postFX?.setInterference(Math.min(1, radiationSmooth * 1.15));
          if (frameNowMs >= nextRadPushAt) {
            nextRadPushAt = frameNowMs + 250;
            const q = Math.round(radiationSmooth * 20) / 20;
            if (q !== lastRadPushed) {
              lastRadPushed = q;
              setInterferenceOverlay(q);
            }
          }
          // Equipment jam — deep enough in the field, the interference fries
          // active tech: timed powerups force-expire (see the timer block)
          // and the held power can't be triggered. One notice per entry.
          const jammedNow = fieldF > 0.12;
          if (jammedNow && !playerSignalJammed && frameNowMs - jamNoticeShownAt > 4000) {
            jamNoticeShownAt = frameNowMs;
            showPowerMessage('⚠ SIGNAL JAMMED — EQUIPMENT OFFLINE IN THE FIELD', 2600);
            soundManager.play('hack_fail', 0.55, false, 0.9);
          }
          playerSignalJammed = jammedNow;
          if (fieldF > 0.02) {
            radExposureS += delta;
            // Geiger clicks accelerate toward the mast — the classic dosimeter
            // read, built from the shell-casing tick at high pitch.
            if (frameNowMs >= nextGeigerAt) {
              nextGeigerAt = frameNowMs + 520 - fieldF * 430 + Math.random() * 140;
              soundManager.play('casing', 0.22, false, 1.9 + Math.random() * 0.5);
            }
            // First contact — the lore drop that reframes the whole game.
            if (!uplinkIntroFired && fieldF > 0.1) {
              uplinkIntroFired = true;
              setEnemyIntro({
                id: Date.now(),
                name: 'ARK-07 Relay',
                tag: 'COMMAND RADIATION · ONE OF SEVERAL',
                blurb: 'A pre-collapse relay spire — one node of a network still answering a dead satellite, still running its last order: field-test the units against a live target. That target is you. Inside its field the machines drink raw command bandwidth and stay supercharged long after they leave; your optics fry, your equipment jams, your body cooks. Kills made in the field pay a bounty.',
                accent: '#49e06a',
                icon: 'radiation',
              });
              soundManager.play('hack_deploy', 0.6, false, 0.8);
              if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry('Relay signal source located — ARK-07', 'wave');
            }
            // Dose damage after a short grace window (so brushing the rim is
            // free; CAMPING the bounty zone is a real trade).
            if (radExposureS > 2.2 && frameNowMs >= nextRadTickAt) {
              nextRadTickAt = frameNowMs + 700;
              const doseScale = classicDifficulty === 'hard' ? 1.4
                : classicDifficulty === 'easy' ? 0.6
                : classicDifficulty === 'adaptive' ? 1.1
                : 1.0;
              takeEnemyDamage((0.6 + 2.4 * fieldF) * doseScale, 'Radiation Exposure', null, true);
            }
          } else {
            radExposureS = Math.max(0, radExposureS - delta * 2);
          }
        } else if (playerSignalJammed || radiationSmooth > 0) {
          // The metering block above is gated on being alive, in a placed
          // network and out of the tutorial — and it owned the ONLY writes that
          // clear the jam latch and the interference overlays. Dying (or the run
          // ending) inside a field therefore froze the player mid-jam: the
          // static stayed on screen and `playerSignalJammed` stayed true, so
          // every equipment trigger kept being refused. Releasing here means the
          // latch can never outlive the condition that set it.
          playerSignalJammed = false;
          radiationSmooth = 0;
          radExposureS = 0;
          postFX?.setInterference(0);
          if (lastRadPushed !== 0) {
            lastRadPushed = 0;
            setInterferenceOverlay(0);
          }
        }
      }

      // ── BOSS HEALTH BAR ──────────────────────────────────────────────────
      // Track the most-wounded living boss (or crowned mini-boss) so the bar
      // follows the one the player is actually fighting rather than flickering
      // between two. Pushed every frame; the component throttles itself.
      {
        let tracked: Enemy | null = null;
        for (let bi = 0; bi < enemies.length; bi++) {
          const e = enemies[bi];
          if (e.dead || e.health <= 0) continue;
          if (e.type !== 'boss' && !e.isMiniBoss) continue;
          if (!tracked || e.health / e.maxHealth < tracked.health / tracked.maxHealth) tracked = e;
        }
        if (tracked) {
          setBossHealth(
            tracked.type === 'boss' ? 'Overlord' : 'Crowned Elite',
            tracked.health, tracked.maxHealth, tracked.bossPhase ?? 1,
                );
        } else {
          setBossHealth(null);
        }
      }

      // === DRAIN RUN EVENTS ===
      // The single point where intents emitted by external gameplay systems
      // become real state changes.
      //
      // The position is LOAD-BEARING, not cosmetic. The enemy loop above walks
      // BACKWARDS and splices as it goes; applying a spawn/kill from inside it
      // would shift indices under the walk. Draining here — after that loop has
      // fully closed, before the MP snapshot serialises enemy state — means a
      // system can never corrupt the iteration, and guests still see the
      // results in the same frame they happened.
      //
      // Each case delegates to the existing pipeline rather than reimplementing
      // it, so perks / shields / achievements / MP sync all keep working.
      {
        const evs = runEvents.take();
        for (let ei = 0; ei < evs.length; ei++) {
          const ev = evs[ei];
          switch (ev.k) {
            case 'damagePlayer':
              takeEnemyDamage(ev.amount, ev.source, ev.at ?? null);
              break;
            case 'healPlayer':
              health = Math.min(playerMaxHealth, health + ev.amount);
              if (isMultiplayer && multiplayerManager) multiplayerManager.updatePlayerHealth(health);
              hudDirty = true;
              break;
            case 'damageEnemy': {
              const en = ev.enemy;
              if (en.dead || en.health <= 0) break;
              en.health -= ev.amount;
              en.damageFlashTime = 0.3;
              // Guests never resolve deaths locally — the host is authoritative.
              if (!isMpGuest && en.health <= 0) handleEnemyKilled(en, false);
              break;
            }
            case 'sound':
              soundManager.play(ev.name, ev.volume ?? 1, false, ev.rate ?? 1);
              break;
            case 'banner':
              showPowerMessage(ev.text, ev.ms ?? 2000);
              break;
            case 'killFeed':
              if (gameSettingsManager.getSetting('killFeed')) addKillFeedEntry(ev.text, ev.kind);
              break;
            case 'screenShake':
              if (gameSettingsManager.getSetting('screenShake')) triggerScreenShake();
              break;
          }
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
            // their own clock (same technique as remote players). Keyframes
            // also carry the ARK-07 state (wave modifier + relay-spire list)
            // so guests mirror the event + build the spires where the host did.
            const spireList: number[] = [];
            if (uplinkNet) {
              for (const sp of uplinkNet.spires) {
                spireList.push(Math.round(sp.x * 100) / 100, Math.round(sp.z * 100) / 100);
              }
            }
            mp.broadcastEnemySync(wire, wave, true, frameNowMs, {
              wm: netWaveEvent === 'surge' ? 1 : netWaveEvent === 'glitch' ? 2 : 0,
              wi: Math.round(netWaveEventIntensity * 100),
              us: spireList,
            });
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

      // ── ENEMY GPS HUNT MARKERS ── reposition the last-enemy arrows (pure
      // DOM style writes; hides itself whenever >2 enemies are alive).
      updateEnemyArrows();

      // ── DEBUG CONSOLE FEED (detailed FPS overlay) ───────────────────────
      // Only while the Settings → Display toggle is on. ~4Hz: builds one small
      // snapshot into a ref then bumps a React tick, so the overlay re-renders
      // 4×/sec while the loop itself never touches React state per frame. The
      // renderer counters are the PREVIOUS frame's (info resets each render) —
      // exact numbers, one frame stale, which is what every engine HUD shows.
      debugFrameMs += (rawDelta * 1000 - debugFrameMs) * 0.08;
      {
        const nowDbg = performance.now();
        if (nowDbg - debugFeedLastMs >= 250 && gameSettingsManager.getSetting('showConsole')) {
          debugFeedLastMs = nowDbg;
          let aliveCount = 0;
          for (let di = 0; di < enemies.length; di++) if (!enemies[di].dead) aliveCount++;
          // 8-wind compass from the base yaw. Yaw 0 looks along −Z (North);
          // positive yaw turns toward −X (West), so the winds run N→NW→W→…
          const yawDeg = ((THREE.MathUtils.radToDeg(euler.y) % 360) + 360) % 360;
          const wind = (['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'] as const)[Math.round(yawDeg / 45) % 8];
          const gRaw = gameSettingsManager.getGraphics();
          const mem = (performance as Performance & {
            memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
          }).memory;
          debugInfoRef.current = {
            fps: fpsValue,
            frameMs: debugFrameMs,
            fpsCap: fpsCapRef.current,
            timeScale: timeScale * healthTimeScale,
            webgl2: renderer.capabilities.isWebGL2,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            mode: isTutorialMode ? 'Tutorial'
              : isMultiplayer ? (isMpGuest ? 'MP · Guest' : 'MP · Host')
              : 'Solo',
            map: mapConfig.name,
            wave: isTutorialMode ? 0 : wave,
            enemiesAlive: aliveCount,
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            facing: `${wind} (${yawDeg.toFixed(0)}°)`,
            preset: gRaw.preset === 'custom' ? `Custom (${gRaw.baseTier})` : gRaw.preset,
            canvasW: renderer.domElement.width,
            canvasH: renderer.domElement.height,
            dpr: window.devicePixelRatio || 1,
            heapUsedMB: mem ? mem.usedJSHeapSize / 1048576 : null,
            heapLimitMB: mem ? mem.jsHeapSizeLimit / 1048576 : null,
          };
          setDebugTick((t) => t + 1);
        }
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
    // ── PROGRESS-AWARE WATCHDOG ────────────────────────────────────────
    // The old backstop was a single hard 12s cap on the WHOLE warmup. On a
    // cold shader cache (fresh driver / browser update) the compile stages
    // legitimately need longer than that, and when the cap fired the loader
    // handed gameplay a scene whose programs were never even created — every
    // first use then compiled mid-fight (the random combat stutters) and the
    // first switch to each weapon linked its programs synchronously (the
    // multi-second weapon-switch stall). A slow-but-PROGRESSING warmup must
    // be allowed to finish; only a genuinely wedged one should be abandoned.
    //
    // So the backstop is now heartbeat-based: every completed stage refreshes
    // `lastProgressAt`, and the watchdog only fires when no stage has finished
    // for WARMUP_STALL_CAP_MS (every individual compile await already has its
    // own 4-6s timeout, so a healthy pipeline always beats this) or when the
    // generous absolute ceiling passes. When it does fire, `aborted` makes the
    // remaining stages no-op so the abandoned background chain can never
    // mutate live gameplay (cycle the held weapon, spawn warm effects in the
    // player's face) — it just falls through to its teardown.
    const WARMUP_STALL_CAP_MS = 12000;
    const WARMUP_HARD_CAP_MS = 45000;
    const warmupHeartbeat = { lastProgressAt: 0, aborted: false };

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
      // Honour an in-flight Continue-Anyway or a fired watchdog: skip
      // remaining stages (the chain still falls through to its teardown).
      if (continueAnywayRef.current || warmupHeartbeat.aborted) return null;
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
      } finally {
        // A finished stage (even a failed one) is pipeline progress — feed the
        // watchdog so a slow-but-moving warmup is never abandoned mid-way.
        warmupHeartbeat.lastProgressAt = performance.now();
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
      // Enemy archetype pool slots prewarmed in Stage 3b. Captured so teardown
      // can release them back to the pool after the compile passes have linked
      // every species' shared programs.
      let prewarmEnemyIds: number[] = [];
      // Per-instance App-level add-on visuals (boss crown, Revenant shield, hack
      // overlay) warmed for their shader programs, then removed from the scene
      // but RETAINED so their materials keep the linked programs resident for
      // the whole session (a disposed material drops the program refcount to 0,
      // which forces the recompile stall we're eliminating).
      const warmupRetainedObjects: THREE.Object3D[] = [];
      // Effect references kept on an object so the async stage closures
      // can assign and the teardown can read them. Plain `let` confuses
      // TS's flow analysis across the async callback boundary.
      const refs: {
        rocket: THREE.Mesh | null;
        flash: MuzzleFlash | null;
        smoke: MuzzleSmoke | null;
        tracer: BulletTracer | null;
        impact: ImpactEffect | null;
        sparks: RobotHitSparks | null;
        explosion: ExplosionEffect | null;
        fireNova: FireNovaEffect | null;
        nuke: NukeEffect | null;
        abilityCast: AbilityCastEffect | null;
        impactBurst: ImpactBurst | null;
        hackBeam: HackBeam | null;
      } = {
        rocket: null, flash: null, smoke: null, tracer: null, impact: null, sparks: null,
        explosion: null, fireNova: null, nuke: null, abilityCast: null, impactBurst: null, hackBeam: null,
      };

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
        const warmPowerUpTypes: PowerUp['type'][] = ['overcharge', 'ammo', 'speed', 'damage', 'shield', 'infinite_ammo', 'phantom', 'cryo', 'tesla', 'shockwave', 'health', 'nuke'];
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
        // Pre-compile the muzzle-smoke sprite shader (normal-blend + fog variant,
        // distinct from the additive flash) so the first wisp never stalls.
        refs.smoke = new MuzzleSmoke(scene, wp, new THREE.Vector3(0, 0, -1));
        refs.tracer = new BulletTracer(scene, wp, wp.clone(), 0xffffaa);
        refs.impact = new ImpactEffect(scene, wp, 0xffaa00, 2);
        refs.sparks = new RobotHitSparks(scene, wp, new THREE.Vector3(0, 1, 0), 2);
        // Pre-warm the power-up visuals so the FIRST activation in a fight
        // never stalls compiling their shaders. The held riot-shield mesh is
        // briefly made visible (restored in teardown) so the compile stage
        // picks up its materials; the ability flares auto-remove after 2s.
        shieldMesh.visible = true;
        // ── ABILITY PROP + FIRE ──
        // A shader PROGRAM links on first RENDER, and both of these are
        // camera-parented / hidden until the player uses their power — i.e.
        // they would otherwise link mid-fight, which is exactly the activation
        // stutter this stage exists to kill. Shown here (parked out of the
        // loader's frame) and switched back off in the warmup teardown.
        abilityProp?.prewarm();
        fireSystem.prewarm(wp.clone());
        warmAbilityFlares.push(
          abilitySystem.createAbilityEffect(scene, wp, 'shield'),
          abilitySystem.createAbilityEffect(scene, wp, 'overcharge'),
          abilitySystem.createAbilityEffect(scene, wp, 'phantom'),
        );
        // Pre-warm the new AAA activation-burst shader + the Cryo frost shell +
        // the Tesla lightning-bolt material so the first cast never stalls
        // compiling them (all self-dispose; the burst/bolt off-screen overhead).
        abilitySystem.createActivationBurst(scene, wp.clone(), 0x66e0ff);
        {
          const warmShell = new THREE.Mesh(_frostShellGeo, _frostShellMat);
          warmShell.position.copy(wp);
          scene.add(warmShell);
          warm.push(warmShell);
        }
        spawnLightningBolt(wp.clone(), wp.clone().add(new THREE.Vector3(0, 0.01, 0.01)), 0xfff27a);
        // Pre-warm the killstreak AIRDROP with a FORCED TOUCHDOWN so every
        // program links now — crate/bands/panel/beacon, the parachute's
        // vertex-colour permutation, the smoke points AND the landed-only set
        // (textured light beam + core, ground halo, chute collapse) that the
        // old fall-from-100m warm crate never reached: the first real landing
        // mid-fight used to compile those. The airdrop system's materials are
        // session-shared now, so the programs stay pinned after clearAll
        // removes this crate in teardown.
        enhancedPowerUps.prewarm(scene, wp.x, wp.z);
        // Pre-warm the rain shader (hidden Points mesh) so a dynamic-weather
        // front can roll in mid-fight without a first-rain compile hitch.
        weatherSystem.prewarm();

        // ── HEAVY EXPLOSION-FAMILY EFFECTS ───────────────────────────────
        // Their per-instance additive Mesh/Points materials own shader PROGRAMS
        // that none of the bullet/pickup/muzzle warmups above touch (distinct
        // fog + additive-blend + points-size configs). On a cold program cache
        // the FIRST rocket detonation / boss cast / nuke linked them mid-frame —
        // the 300-650ms freeze the trace pinned at the first big combat beat.
        // Built here so the compile passes below link them; teardown then keeps
        // their materials alive (dispose(scene, false)) so the programs never
        // leave the cache for the rest of the run.
        refs.explosion = new ExplosionEffect(scene, wp.clone(), 9, 0xff7a2a);
        refs.fireNova = new FireNovaEffect(scene, wp.clone(), 16);
        refs.nuke = new NukeEffect(scene, wp.clone(), 20);
        refs.abilityCast = new AbilityCastEffect(scene, wp.clone(), 0x22d3ee);
        refs.impactBurst = new ImpactBurst(scene, wp.clone(), 0xffe6b0, 1);
        // Subverter intrusion beam (jagged MeshBasic tube + additive glow +
        // data packets — a distinct fogged/toneMapped-off program). Warmed so
        // the first hack in a fight never stalls linking it.
        refs.hackBeam = new HackBeam(scene, wp.clone(), wp.clone().add(new THREE.Vector3(0, 0.02, -2)));
        // Battle-damage dent/scuff decal (its own polygon-offset alpha-blended
        // program). Warmed so the first hit in a fight never stalls linking it;
        // the throwaway quad is removed via `warm`, but the system keeps the
        // shared material alive for the run so the program stays cached. (The
        // enemy venting smoke reuses MuzzleSmoke's already-warmed program above.)
        warm.push(battleDamage.prewarm(wp.clone()));
        // Environment bullet-hole decal (shared MeshBasic + polygon-offset alpha
        // program). Warmed so the first shot into a tree/wall/ground never stalls
        // linking it; the throwaway quad is removed via `warm`, the base material
        // persists on the system so the program stays cached for the run.
        warm.push(bulletDecals.prewarm(wp.clone()));
        // Human-wound blood decal (lit MeshStandard + polygon-offset program).
        // Only used on remote avatars, so only warm it in multiplayer; the shared
        // material persists for the run so the first wounded teammate never stalls.
        if (isMultiplayer) warm.push(prewarmPlayerWounds(scene, wp.clone()));

        // ── SECONDARY ADD-ON VISUALS ─────────────────────────────────────
        // Programs otherwise compiled the first time a mini-boss (no-fog crown),
        // a Revenant (gold shield: no-fog MeshBasic emblem + LineBasic rim +
        // smooth MeshStandard plate/studs) or a hacked enemy (chip/ring/scan
        // overlay) appears. Built once, kept off-screen-free in the scene for the
        // compile passes, then removed but retained so their programs persist.
        // Real mini-boss crown build — its DoubleSide MeshStandard band is its
        // own program permutation, so warm the actual crown, not a stand-in.
        // Materials are session-shared consts, retained until scene teardown.
        const warmCrown = buildMiniBossCrown();
        warmCrown.position.copy(wp);
        scene.add(warmCrown); warmupRetainedObjects.push(warmCrown);
        const warmShield = buildRevenantShield();
        warmShield.position.copy(wp);
        scene.add(warmShield); warmupRetainedObjects.push(warmShield);
        const warmHack = buildHackVisuals();
        warmHack.position.copy(wp);
        scene.add(warmHack); warmupRetainedObjects.push(warmHack);

        // Ability-flare shader-program ANCHORS. The warm flares above are
        // torn down (removed + materials disposed) before gameplay so they
        // never linger on screen — but disposing the last material of a
        // program variant drops its refcount to zero and EVICTS the compiled
        // program, which meant the FIRST real ability cast mid-fight
        // re-linked it: the exact activation stutter this stage exists to
        // kill. These two tiny retained quads pin both MeshBasic permutations
        // the flares use (fogged transparent front-side + the phantom aura's
        // DoubleSide variant) for the whole session.
        const flareAnchorGeo = new THREE.PlaneGeometry(0.02, 0.02);
        const flareAnchorA = new THREE.Mesh(
          flareAnchorGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
        );
        flareAnchorA.position.copy(wp);
        scene.add(flareAnchorA); warmupRetainedObjects.push(flareAnchorA);
        const flareAnchorB = new THREE.Mesh(
          flareAnchorGeo,
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
        );
        flareAnchorB.position.copy(wp);
        scene.add(flareAnchorB); warmupRetainedObjects.push(flareAnchorB);

        // ── ARK-07 NETWORK-EVENT VISUALS ────────────────────────────────
        // Surge halo + irradiated shell ride session-shared geo/mats — one
        // render each links their programs for good (removed via `warm`,
        // never disposed). The EMP shockwave's fog-free additive permutation
        // gets a tiny retained anchor so the first OVERDRIVE broadcast
        // mid-run never links a program.
        const warmHalo = new THREE.Mesh(_surgeHaloGeo, _surgeHaloMat);
        warmHalo.position.copy(wp); scene.add(warmHalo); warm.push(warmHalo);
        const warmRadShell = new THREE.Mesh(_frostShellGeo, _radShellMat);
        warmRadShell.position.copy(wp); scene.add(warmRadShell); warm.push(warmRadShell);
        const empAnchor = new THREE.Mesh(
          flareAnchorGeo,
          new THREE.MeshBasicMaterial({
            color: 0xff3524, transparent: true, opacity: 0.4, depthWrite: false,
            blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
          }),
        );
        empAnchor.position.copy(wp);
        scene.add(empAnchor); warmupRetainedObjects.push(empAnchor);
        // The relay spires: on host/solo they already stand in the world, so
        // the scene compile pass covers them — but a GUEST only builds them
        // after the first host keyframe, mid-loader-hidden. Tiny quads pin
        // every one of the network's material programs either way.
        if (uplinkNet) {
          uplinkNet.materials.forEach((m, mi) => {
            const q = new THREE.Mesh(flareAnchorGeo, m);
            q.position.copy(wp).add(new THREE.Vector3((mi - uplinkNet.materials.length / 2) * 0.03, 0, 0));
            scene.add(q); warmupRetainedObjects.push(q);
          });
        }
        // ARK-07 irradiated cores. Same reasoning as the spires: the drums are
        // scattered across the whole map, so there is no guarantee one is in
        // front of the loader camera for the scene compile pass to catch — and
        // a core is a fully-mapped standard material plus two additive
        // overlays, i.e. programs nothing else in the scene links. Empty (and
        // therefore free) on maps whose relay fields caught no barrels.
        irradiatedCoreMaterials().forEach((m, mi) => {
          const q = new THREE.Mesh(flareAnchorGeo, m);
          q.position.copy(wp).add(new THREE.Vector3(0, (mi + 1) * 0.03, 0));
          scene.add(q); warmupRetainedObjects.push(q);
        });

        // Enemy + Revenant bolt tracers. Their materials are SHARED session-long
        // consts, so rendering one of each once links the program for good —
        // no retain needed (teardown only removes the throwaway meshes via warm).
        const warmBolt = new THREE.Mesh(_enemyBulletGeo, _enemyBulletMat);
        warmBolt.position.copy(wp); scene.add(warmBolt); warm.push(warmBolt);
        const warmBoltGlow = new THREE.Mesh(_enemyBulletGlowGeo, _enemyBulletGlowMat);
        warmBoltGlow.position.copy(wp); scene.add(warmBoltGlow); warm.push(warmBoltGlow);
        const warmRevBolt = new THREE.Mesh(_enemyBulletGeo, _revBoltMat);
        warmRevBolt.position.copy(wp); scene.add(warmRevBolt); warm.push(warmRevBolt);
        const warmRevBoltGlow = new THREE.Mesh(_enemyBulletGlowGeo, _revBoltGlowMat);
        warmRevBoltGlow.position.copy(wp); scene.add(warmRevBoltGlow); warm.push(warmRevBoltGlow);
      });
      await yieldFrame();

      // ── STAGE 3b: enemy archetypes ─────────────────────────────────────
      // Build + render one pooled mesh of EVERY enemy species so their shared
      // MeshStandard body/accent/glow + MeshBasic eye + LOD programs (the single
      // most expensive compile batch in the game, ~hundreds of ms on a cold
      // cache) link during the loader instead of the first time each species
      // walks into view mid-wave. The slots are released back to the pool in
      // teardown but keep their type-built meshes for instant, allocation-free
      // reuse on the first real spawn of that archetype.
      await stage('Enemies', false, () => {
        // ⚠ EVERY archetype must appear here. Omitting one means its shared
        // materials link on its FIRST SPAWN mid-wave, which is exactly the
        // stutter this whole stage exists to prevent.
        const warmEnemyTypes: PooledEnemyType[] = [
          'normal', 'fast', 'tank', 'boss', 'ranged', 'revenant',
          'bulwark', 'howler', 'leaper', 'splitter',
        ];
        prewarmEnemyIds = smartEnemyManager.prewarmEnemyTypes(warmEnemyTypes, wp);
      });
      await yieldFrame();

      // ── STAGE 4: gun materials + shader programs (cycle every weapon) ──
      // Switch to each weapon AND compile it WHILE its meshes are in the scene.
      // Populating the GunModel material cache (avoiding re-allocation) is NOT
      // enough on its own: a shader PROGRAM compiles on first RENDER, and the
      // Stage-5 compile below only ever sees the final (restored) weapon — so
      // without compiling here, the first in-game switch to any OTHER weapon
      // stalls compiling its programs. That was the "huge lag switching
      // pistol → rifle" the user hit. Compiling per weapon is incremental: the
      // first call carries the scene + that weapon, each later weapon only adds
      // its few unique programs (the program cache skips everything already
      // built), and it must use the real `scene` so the light-count defines in
      // the compiled programs match what the live render uses.
      const allWeapons: GunWeaponType[]
        = ['pistol', 'rifle', 'shotgun', 'smg', 'sniper', 'minigun', 'launcher', 'subverter'];
      const rGun = renderer as THREE.WebGLRenderer & {
        compileAsync?: (scene: THREE.Scene, camera: THREE.Camera) => Promise<unknown>;
      };
      for (const w of allWeapons) {
        if (continueAnywayRef.current || warmupHeartbeat.aborted) break;
        await stage(`Weapon: ${w}`, false, async () => {
          gunModel.switchWeapon(w);
          if (typeof rGun.compileAsync === 'function') {
            await withTimeout(rGun.compileAsync(scene, camera), 4000, `Compile ${w}`);
          } else {
            renderer.compile(scene, camera);
          }
        });
        await yieldFrame();
      }
      // Restore the LIVE weapon (not a snapshot from before the cycle): if the
      // watchdog let gameplay start while this chain finished in the background,
      // the player may have already switched — restoring a stale snapshot would
      // desync the viewmodel from the weapon actually firing. With the rig
      // cache this attach is free.
      try { gunModel.switchWeapon(currentWeapon as GunWeaponType); } catch { /* ignore — restore is best-effort */ }
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
        clearHitMarkers();
        clearDamageDirections();
        // Mount the power-announcement pill once behind the (opaque) loader
        // so its first real appearance — which lands in the same frame as an
        // ability activation — doesn't pay the initial React mount + style
        // recalculation during combat.
        showPowerMessage(' ', 1);
      });

      // ── ENVIRONMENT (image-based lighting) ─────────────────────────────
      // Wait (capped) for the async HDRI to replace the local PMREM fallback
      // BEFORE the post-FX warmup frames below render — so the GPU uploads the
      // HDRI and bakes the composed look with the FINAL lighting, and the
      // canvas the loader hands over already matches gameplay. Without this the
      // HDRI swapped in a couple of seconds into play and the whole graded /
      // lit image visibly shifted right after the loader hid. Non-critical:
      // a slow/failed fetch just falls through to the PMREM fallback.
      await stage('Environment', false, () =>
        withTimeout(hdriReadyPromise, 4000, 'HDRI Environment').catch(() => { /* keep PMREM fallback */ }),
      );
      // The HDRI either swapped in during the stage above or timed out. Either
      // way, forbid a LATE swap from here on: if the fetch only lands after the
      // loader has handed the canvas to gameplay, swapping the environment map
      // mid-run forces a full relight + a program revalidation pass — a visible
      // hitch. Keeping the already-composed PMREM fallback is seamless. (When the
      // HDRI did arrive in time, its swap .then() ran before this await resolved,
      // so this only ever blocks the genuinely-late case.)
      allowLateEnvironmentSwap = false;
      await yieldFrame();

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
        // Same deal for the ability prop and the fire system: both were shown
        // only so the compile passes could link them. Their materials are NOT
        // disposed here — that would evict the very programs we just built.
        abilityProp?.endPrewarm();
        fireSystem.endPrewarm();
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
        refs.smoke?.dispose(scene);
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

        // Heavy explosion-family effects: drop them from the scene and return
        // their borrowed pooled lights, but KEEP their materials alive
        // (dispose(scene, false)) so the freshly-linked programs stay in the
        // cache. Retained on warmupRetainedEffects so GC can't collect the
        // materials and drop the program refcount to zero before the first real
        // detonation. Fully disposed in the scene-teardown cleanup.
        for (const heavy of [refs.explosion, refs.fireNova, refs.nuke, refs.abilityCast, refs.impactBurst, refs.hackBeam]) {
          if (heavy) { heavy.dispose(scene, false); warmupRetainedEffects.push(heavy); }
        }
        // Add-on visuals (crown / Revenant shield / hack overlay): pull them out
        // of the scene; their materials stay referenced via warmupRetainedObjects
        // so the programs persist for the run (freed wholesale by renderer
        // .dispose() when the scene tears down).
        warmupRetainedObjects.forEach((o) => scene.remove(o));
        // Release every prewarmed enemy back to the pool. releaseEnemy keeps the
        // slot's type-built meshes, so the first real spawn of each archetype is
        // an allocation-free, recompile-free reuse.
        prewarmEnemyIds.forEach((id) => smartEnemyManager.releaseMeshById(id));
        prewarmEnemyIds = [];
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

      // ── FORCE THE GPU TO ACTUALLY FINISH (the real "shaders baking" fix) ──
      // Everything above only QUEUES work: compileAsync + renderer.render submit
      // GL commands and return immediately. The GPU links/validates each shader
      // program lazily on the FIRST DRAW that uses it, so on a cold cache the
      // first few gameplay frames stalled while every post-FX program finished
      // compiling — exactly the "post-processing applies a few seconds late /
      // shaders bake in" the user reported. glFinish() BLOCKS until the GPU has
      // executed every queued command (including the warmup draws that exercise
      // each program), so by the time the loader hides everything is fully
      // resident and the first real frame is already at the final graded look.
      // It runs inside the loader (which holds for MIN_LOADER_MS anyway), so the
      // wait is hidden. Best-effort: never let a context quirk strand warmup.
      try {
        const gl = renderer.getContext();
        gl.finish();
      } catch (err) {
        console.warn('[Warmup] GPU finish failed (non-fatal):', err);
      }

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
          // Progress-aware watchdog (see WARMUP_STALL_CAP_MS above): only a
          // warmup that has genuinely stopped making stage progress — or blown
          // through the generous absolute ceiling — is abandoned. A rejection
          // still propagates to the catch below so real failures surface.
          warmupHeartbeat.lastProgressAt = performance.now();
          const warmupPromise = warmUpShaders();
          await new Promise<void>((resolve, reject) => {
            const startedAt = performance.now();
            const poll = window.setInterval(() => {
              const now = performance.now();
              const stalled = now - warmupHeartbeat.lastProgressAt > WARMUP_STALL_CAP_MS;
              const overCap = now - startedAt > WARMUP_HARD_CAP_MS;
              if (stalled || overCap) {
                warmupHeartbeat.aborted = true;
                console.warn(`[Warmup] watchdog fired (${stalled ? 'stalled' : 'hard cap'}) — starting with what has compiled so far.`);
                window.clearInterval(poll);
                resolve();
              }
            }, 500);
            warmupPromise.then(
              () => { window.clearInterval(poll); resolve(); },
              (err) => { window.clearInterval(poll); reject(err); },
            );
          });

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
      // Drop any intents queued on the final frame — they reference enemies and
      // meshes that are about to be disposed, and nothing will drain them.
      runEvents.clear();
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
      // Persist the tail end of a short run instead of losing up to three
      // seconds of challenge events when the player returns to the menu.
      dailyFlush();
      flushMasteryXp();
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

      // Fade out + tear down the per-map ambient score (the menu has its own
      // music). Idempotent — a fresh run rebuilds it from scratch.
      ambientMusic.stop();

      // Lift any lingering low-health audio muffle so it can't bleed into menus.
      soundManager.setSlowMo(0);

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
      // Free the shared human-wound blood atlas/material/geometries (per-player
      // wound meshes were already detached in each record's dispose above).
      disposePlayerWoundAssets();

      // Cleanup the local player shadow caster (invisible body)
      localPlayerShadow.dispose();

      // Cleanup any in-flight Subverter beams + live hacked-enemy visuals so
      // their per-instance materials don't leak when the run tears down.
      hackBeams.forEach((b) => b.dispose(scene));
      hackBeams.length = 0;
      for (const e of enemies) {
        if (e.hackVisuals) { disposeHackVisuals(e.hackVisuals); e.hackVisuals = undefined; }
      }

      // Cleanup live airdrop crates, then free the session-shared airdrop
      // assets (kept alive all run so their shader programs stayed cached).
      enhancedPowerUps.clearAll(scene);
      enhancedPowerUps.disposeShared();

      // Cleanup SmartEnemyManager (releases pooled resources)
      smartEnemyManager.dispose();

      // Free the Rapier ragdoll world + every live corpse body.
      ragdollSystem.dispose();

      // Cleanup instanced world-prop batches (before BiomeSystem disposes the
      // shared geometries/materials the batches reference).
      terrainInstancer.dispose();

      // Cleanup the signature per-map ambience field (High/Ultra only; null
      // elsewhere). Its single geometry + shader material are freed here.
      mapAmbience?.dispose();

      // Free every cached weapon rig (the session-long build-once cache that
      // makes weapon switches attach/detach instead of rebuild).
      gunModel.disposeAllRigs();

      // Free the shared tactical-archetype geo/mats (Bulwark shield, Howler
      // aura, overshield ring). Safe here and ONLY here: individual enemies
      // only ever detach these, never dispose them.
      disposeArchetypeAssets();

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

      // Cleanup lingering muzzle smoke (each puff owns its sprite + material).
      for (const p of muzzleSmokePuffs) p.dispose(scene);
      muzzleSmokePuffs.length = 0;

      // Cleanup damaged-robot venting smoke (own pool, same MuzzleSmoke class).
      for (const p of enemySmokePuffs) p.dispose(scene);
      enemySmokePuffs.length = 0;

      // Free the battle-damage decal system (shared geos + material + atlas).
      battleDamage.dispose();

      // Free the environment bullet-decal system (pooled quads + per-decal
      // materials + shared atlas).
      bulletDecals.dispose();

      // Free the recycled impact/spark particle + tracer geometries and flash
      // sprites so the pooled buffers don't carry across a remount into a fresh
      // WebGL context. (The smoke/explosion/cast/burst pools are cleared further
      // down, AFTER the in-flight effect arrays dispose into them.)
      clearParticleGeometryPools();
      clearTracerGeometryPool();
      clearFlashSpritePool();

      // Free the pooled + live crater rigs (their geometries are the shared
      // sharedCrater* set disposed just below).
      for (const c of craters) {
        scene.remove(c.mesh);
        _craterRigPool.push(c.rig);
      }
      craters.length = 0;
      for (const rig of _craterRigPool) {
        rig.scorchMat.dispose();
        rig.ringMat.dispose();
        rig.debrisMat.dispose();
      }
      _craterRigPool.length = 0;

      // Cleanup bullet shatter shards (shared geos + material across all shards).
      for (const s of bulletShards) scene.remove(s.mesh);
      bulletShards.length = 0;
      shardGeos.forEach((g) => g.dispose());
      shardMat.dispose();

      // Cleanup the Engineer's armed remote bomb kit + its shared geometries.
      if (armedBomb) disposeBombKit(armedBomb);
      armedBomb = null;
      pendingDetonation = null;
      _bombDetGeo.dispose();
      _bombAntGeo.dispose();
      _bombSphGeo.dispose();
      _bombWireGeo.dispose();
      _bombBandGeo.dispose();

      // Cleanup the session-shared mini-boss crown assets (crown groups on
      // live/pooled enemies were detached by the pool's add-on strip; only
      // these shared geometries/materials own GPU resources).
      _crownBandGeo.dispose();
      _crownSpikeGeo.dispose();
      _crownJewelGeo.dispose();
      _crownGoldMat.dispose();
      _crownJewelMat.dispose();

      // Cleanup the left-hand ability prop (per-instance geos + mats) and the
      // fire system (jet + ground-patch rigs + the shared burn-shell assets —
      // every shell it lit is detached first, inside dispose()).
      abilityProp?.dispose();
      gunModel.onOverclockCue = null;
      for (const e of enemies) { e.burnFx = undefined; }
      fireSystem.dispose();
      // The riot shield's folding sections introduced two materials of their
      // own (the fixed panel's are shared with parts not torn down here).
      shieldFoldMats.forEach((m) => m.dispose());

      // Cleanup any in-flight impact-confirm bursts (per-instance sprite
      // materials; shared textures persist for the session).
      for (const ib of impactBursts) ib.dispose(scene);
      impactBursts.length = 0;

      // Cleanup any in-flight explosion fireballs (releases pooled lights +
      // per-instance additive materials; shared geometries persist).
      for (const ex of explosionEffects) ex.dispose(scene);
      explosionEffects.length = 0;
      for (const nk of nukeEffects) nk.dispose(scene);
      nukeEffects.length = 0;
      for (const fn of fireNovas) fn.dispose(scene);
      fireNovas.length = 0;
      for (const ce of castEffects) ce.dispose(scene);
      castEffects.length = 0;

      // Cleanup ARK-07 network-event resources: any in-flight EMP broadcast
      // fronts, the event wrappers still worn by live enemies (shared assets —
      // detach BEFORE the shared geo/mats below are disposed), the shared
      // halo/shell assets themselves, the uplink structure, and the UI state
      // so a restarted match never inherits a stale chip/vignette.
      for (const emp of empShockwaves) emp.dispose(scene);
      empShockwaves.length = 0;
      for (const e of enemies) clearNetEventVisuals(e);
      _surgeHaloGeo.dispose();
      _surgeHaloMat.dispose();
      _radShellMat.dispose();
      uplinkNet?.dispose();
      // The irradiated-core skin is built lazily per run (only when a relay
      // field actually caught a barrel) and owns its own canvases, so unlike
      // the session-shared armour surfaces it IS freed with the scene.
      disposeHazardAssets();
      setWaveEventOverlay(null);
      setInterferenceOverlay(0);
      setWaveEventUI(null);

      // Cleanup the retained warmup effects. Their materials were deliberately
      // kept alive all session (warmup teardown used dispose(scene, false)) to
      // hold their linked programs in the cache; free the materials now that the
      // run is ending. They were never in the live gameplay arrays above, so
      // this is the only place they get fully disposed.
      for (const re of warmupRetainedEffects) {
        try { re.dispose(scene, true); } catch { /* best-effort */ }
      }
      warmupRetainedEffects.length = 0;

      // NOW that every in-flight + retained effect has disposed (returning its
      // pooled rig/sprite pair), empty the pools themselves so nothing carries
      // across a remount into a freshly-created WebGL context.
      clearSmokeSpritePool();
      clearExplosionRigPool();
      clearCastRigPool();
      clearBurstPairPool();

      // Detach any in-flight head gibs (clones share pooled geo/mat — just
      // remove the clone objects from the scene).
      for (const g of headGibs) scene.remove(g.mesh);
      headGibs.length = 0;

      // Cleanup shared rocket projectile geometry + materials.
      rocketSharedGeos.forEach((g) => g.dispose());
      rocketSharedMats.forEach((m) => m.dispose());
      // Decap torn-wire shared resources.
      wireGeo.dispose();
      wireTipGeo.dispose();
      wireMats.forEach((m) => m.dispose());
      wireTipMat.dispose();

      if (environmentRenderTarget) {
        scene.environment = null;
        environmentRenderTarget.dispose();
        environmentRenderTarget = null;
      }

      renderer.dispose();
    };
    // Settings (graphics preset, key bindings, etc.) are intentionally read
    // live from refs / live closures rather than re-running the entire scene
    // when they change — re-mounting the scene on every settings tweak
    // would dispose every enemy / particle mid-play. Graphics changes apply on
    // the next match (the preset is read once at scene init, by design).
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
    // Weather needs no sync — every client runs the map's automatic climate.
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

  // Called by the RunModifierPicker once the player picks a modifier (or
  // skips). Picks up the pending classic-start params and launches the run.
  // Also the direct launch path for GUESTS, who never see the picker (Raise
  // the Stakes is an account-only feature) — they always start with no modifier.
  const beginClassicWithModifier = (modifier: RunModifier | null) => {
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
    // Adaptive-difficulty assist is always on (RUNTIME_PREFS); the 'adaptive'
    // difficulty mode additionally cranks its adjustment rate at scene init.
    soundManager.initialize();
    enterImmersiveMode();
    pendingClassicStartRef.current = null;
    setRunModifierPickerOptions(null);
    setShowShaderProcessing(true);
    setGameStarted(true);
  };

  // Handle classic mode start. Signed-in players get the Run-Modifier picker —
  // one last "Raise the Stakes" choice before the shader loader; their pick is
  // stored on a ref the scene useEffect reads on init. Raise the Stakes is an
  // ACCOUNT-ONLY feature: guests never see the picker and launch straight into
  // the run with no modifier (the equivalent of skipping it). This is the
  // single gate for the feature — the picker can only be opened from here.
  const handleClassicGameStart = (difficulty: 'easy' | 'medium' | 'hard' | 'adaptive', timeOfDay: 'day' | 'night' | 'auto', map: MapType, isRandom: boolean = false) => {
    pendingClassicStartRef.current = { difficulty, timeOfDay, map, isRandom };
    setShowClassicMenu(false);
    if (isAuthenticated) {
      setRunModifierPickerOptions(generateStakeOptions());
    } else {
      beginClassicWithModifier(null);
    }
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

        {/* STATIC menu readability grade — the SINGLE source of bottom
            darkening in the whole menu stack, rendered here outside the
            animated screen wrapper so it stays rock-solid while screens
            slide. Sits at z-[1], BELOW the menu content (.menu-screen is
            z-10): it grades the 3D backdrop only, never the UI.

            THIS IS THE "BLACK BOX" FIX. The old build stacked four separate
            darkening ramps (an App gradient + an App vignette + the MenuShell
            haze + a MenuShell vignette), each with a DIFFERENT start stop, so
            they multiplied into a near-black lower half with a hard "black
            bar" edge right at the horizon. Everything is consolidated into
            the ONE layer below:
              • bottom anchor — a many-stop, cubic-eased ramp (a hard edge is
                mathematically impossible) capped at a gentle ~0.55 forest
                tint, easing fully to transparent by mid-screen. Gives cards/
                footer their contrast without crushing the sunlit vista.
              • edge vignette — centered ABOVE middle (50% 42%) so it darkens
                the top corners and sides but barely grazes the bottom-centre,
                where the anchor already lives. The two never double up in the
                same place, so no band can form.
              • top canopy wash — a whisper of shade over the top 30% so the
                GitHub star and title stay legible against bright sky.
              • right column scrim — an eased side ramp under the action stack
                (mode tiles, Settings · Credits · Sign In) so the glassy cards
                and their labels always sit on calm, deepened forest. Capped
                well below the anchor and fully clear by mid-screen, it can
                only overlap the other ramps in the corners — cubic-eased like
                everything else, so no edge or band can form there either.
            MenuShell now contributes per-variant COLOUR only (glow + tint) —
            it must never add black to the bottom again. */}
        <div
          className="fixed inset-0 z-[1] pointer-events-none"
          style={{
            background: [
              'radial-gradient(125% 115% at 50% 44%, rgba(0,0,0,0) 55%, rgba(6,16,10,0.3) 100%)',
              'linear-gradient(to top, rgba(4,11,7,0.46) 0%, rgba(4,11,7,0.36) 6%, rgba(5,12,8,0.25) 13%, rgba(5,12,8,0.14) 21%, rgba(6,13,9,0.06) 30%, rgba(0,0,0,0) 43%)',
              'linear-gradient(to bottom, rgba(9,18,12,0.3) 0%, rgba(8,16,11,0.1) 14%, rgba(0,0,0,0) 32%)',
              'linear-gradient(to left, rgba(5,12,8,0.28) 0%, rgba(5,12,8,0.16) 18%, rgba(6,13,9,0.06) 36%, rgba(0,0,0,0) 52%)',
            ].join(', '),
          }}
        />
        {menuVariant === 'multiplayer' && (
          // Plain dark tint — NO backdrop-filter. The old blur(14px) sheet
          // both blurred the live canvas every frame AND (because the lobby
          // renders inside a transformed stacking context) painted on top of
          // the entire lobby UI, blurring it into unreadability. Cool navy
          // tint matches the lobby's sky-blue identity over the day scene.
          <div
            className="fixed inset-0 z-[1] pointer-events-none animate-fadeIn"
            style={{ background: 'rgba(5,11,18,0.3)' }}
          />
        )}
        <div key={menuVariant} className="animate-fadeIn">
          <MenuShell variant={menuVariant} />
        </div>

        <MenuTransition menuKey={menuScreenKey} depth={menuScreenDepth}>
          {gameMode === 'none' && !showClassicMenu && !showTutorialMenu && !showMultiplayerLobby && (
            <MainMenu onClassicMode={handleModeSelection} onMultiplayerMode={handleMultiplayerMode} onTutorialMode={handleTutorialMode} onSkillTree={() => setShowSkillTree(true)} t={t} />
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

        {/* Skill Tree — reachable straight from the Main Menu (signed-in only,
            same as the rest of progression). It shares the exact same
            showSkillTree state, skillTreeData and unlock handler as the in-game
            pause-menu tree, so spent points + unlocks are always identical
            across both entry points. Closing only dismisses the overlay here
            (there's no paused match to restore). */}
        {showSkillTree && isAuthenticated && (
          <SkillTreeMenu
            skills={skillTreeData.skills}
            availablePoints={skillTreeData.availablePoints}
            spentPoints={skillTreeData.spentPoints}
            totalPoints={skillTreeData.totalPoints}
            detectedPlayStyle={skillTreeData.detectedPlayStyle}
            recommendations={skillTreeData.recommendations}
            onUnlockSkill={handleUnlockSkill}
            onClose={() => setShowSkillTree(false)}
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

      {/* Ejected mid-match (host kick / anti-cheat) — show the reason, then exit. */}
      {kickedReason && (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" style={{ backdropFilter: 'blur(10px)' }}>
          <div className="w-full max-w-md rounded-2xl border border-rose-400/25 bg-[#0c0807] p-6 text-center shadow-[0_40px_120px_rgba(0,0,0,0.7)]">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-xl border border-rose-400/30 bg-rose-500/15">
              <ShieldAlert className="w-6 h-6 text-rose-300" strokeWidth={2.2} />
            </div>
            <p className="font-hud mt-4 text-[10px] font-semibold uppercase tracking-[0.34em] text-rose-300/90">Removed from match</p>
            <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-white">You were kicked</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-300/90">{kickedReason}</p>
            <button
              onClick={returnToMenu}
              className="font-hud mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 12px 30px -12px rgba(46,232,180,0.7)' }}
            >
              Back to Menu
            </button>
          </div>
        </div>
      )}

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

      {/* Scope picture sits on its own layer BENEATH the HUD (z 9 vs 10):
          its aperture mask is near-opaque, and burying the health/ammo
          readouts under it would be worse than the narrow scope ever was. */}
      {!photoMode && (
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 9 }}>
        {/* ── SNIPER SCOPE PICTURE ──────────────────────────────────────────
            A tube optic can't be looked through as a viewmodel: the scope's own
            bore limits the sight line to a ~7° cone inside an ~83° frame, so
            the player was squinting at the world through a keyhole ringed by
            scope metal, and no amount of resizing fixes it (a tube's aperture
            is bore ÷ length, which is scale-invariant). Once genuinely sighted
            the 3D optic is swapped away and the world is drawn at FULL WIDTH
            inside this aperture instead. Ref-driven per frame — never setState.
            Rendered before the crosshair so the reticle sits on top of it. */}
        {!gameState.isGameOver && !isPaused && (
          <div
            ref={scopeOverlayRef}
            className="absolute inset-0"
            style={{
              visibility: 'hidden', opacity: 0, pointerEvents: 'none',
              // 0 → 1 as the aperture irises open. The radius is viewport
              // relative so the scope fills the screen on any aspect ratio.
              ['--apf' as string]: '0',
              ['--ap' as string]: 'calc(var(--apf) * min(46vh, 46vw))',
            } as CSSProperties}
          >
            {/* Aperture — everything outside the circle is masked out. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) calc(var(--ap) - 1px), rgba(2,4,3,0.972) calc(var(--ap) + 2px), rgba(0,0,0,0.995) 100%)',
              }}
            />
            {/* Lens body — inner shadow for depth plus a faint coated-glass rim. */}
            <div
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: 'calc(var(--ap) * 2)', height: 'calc(var(--ap) * 2)',
                transform: 'translate(-50%, -50%)',
                boxShadow:
                  'inset 0 0 70px 22px rgba(0,0,0,0.5), inset 0 0 8px 1px rgba(150,205,180,0.13), 0 0 2px 1px rgba(0,0,0,0.9)',
              }}
            />
            {/* Reticle: duplex crosshair with a fine centre and mil ticks.
                Clipped to the aperture so it can never spill onto the mask. */}
            <div
              className="absolute left-1/2 top-1/2 rounded-full overflow-hidden"
              style={{
                width: 'calc(var(--ap) * 2)', height: 'calc(var(--ap) * 2)',
                transform: 'translate(-50%, -50%)',
                opacity: 'var(--apf)',
              } as CSSProperties}
            >
              {(['h', 'v'] as const).map((axis) => (
                <div
                  key={axis}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: axis === 'h' ? '100%' : '1.5px',
                    height: axis === 'h' ? '1.5px' : '100%',
                    transform: 'translate(-50%, -50%)',
                    // Thick duplex posts outboard, hairline through the middle,
                    // and a clear gap at the centre so the target stays visible.
                    background: axis === 'h'
                      ? 'linear-gradient(90deg, rgba(4,8,6,0.92) 0 30%, rgba(4,8,6,0.62) 30% 46%, transparent 46% 54%, rgba(4,8,6,0.62) 54% 70%, rgba(4,8,6,0.92) 70% 100%)'
                      : 'linear-gradient(180deg, rgba(4,8,6,0.92) 0 30%, rgba(4,8,6,0.62) 30% 46%, transparent 46% 54%, rgba(4,8,6,0.62) 54% 70%, rgba(4,8,6,0.92) 70% 100%)',
                  }}
                />
              ))}
              {/* Mil-dot ticks down the lower post — the holdover marks. */}
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute left-1/2"
                  style={{
                    top: `calc(50% + ${i * 9}%)`,
                    width: `${9 - i * 1.6}px`, height: '1.5px',
                    transform: 'translateX(-50%)',
                    background: 'rgba(4,8,6,0.8)',
                  }}
                />
              ))}
              <div
                className="absolute left-1/2 top-1/2 rounded-full"
                style={{
                  width: '2.5px', height: '2.5px', transform: 'translate(-50%, -50%)',
                  background: 'rgba(6,12,9,0.95)',
                }}
              />
            </div>
          </div>
        )}
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
          weaponMastery={gameState.weaponMastery}
          weaponUnlockMult={gameState.weaponUnlockMult}
          waveEvent={waveEventUI}
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

      {/* Debug console — detailed FPS/renderer/memory/hardware readout. Global
          to every mode (solo / tutorial / multiplayer); sits in the free left
          band (below the compact HUD on touch) and is fed by the loop at ~4Hz. */}
      {userSettings.showConsole && gameStarted && !photoMode && !gameState.isGameOver && (
        <DebugConsole info={debugInfoRef.current} tick={debugTick} isTouch={isTouch} />
      )}

      {/* Enemy GPS hunt markers — when a wave is down to its last 1–2 robots,
          these arrows guide the player to them: a chevron hovering over an
          on-screen enemy, or an edge-clamped arrow rotated toward an off-screen
          one, each with a live distance pill. The game loop positions them
          imperatively (updateEnemyArrows); React only mounts the shells and
          recolours them when the Settings → Gameplay swatch changes. */}
      {gameStarted && !photoMode && (
        <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden select-none">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              ref={(el) => { enemyArrowRefs.current[idx] = el; }}
              className="absolute left-0 top-0 flex-col items-center"
              style={{ display: 'none', color: userSettings.enemyArrowColor, willChange: 'transform' }}
            >
              <svg
                width="34" height="34" viewBox="0 0 34 34"
                style={{ filter: 'drop-shadow(0 0 7px currentColor)', margin: '0 auto' }}
              >
                <path
                  d="M17 3 L27 25 L17 19.5 L7 25 Z"
                  fill="currentColor"
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="mt-0.5 rounded-full border border-white/15 bg-black/70 px-1.5 font-mono text-[10px] font-bold tabular-nums text-white"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* FPS Counter — top-center. ComboDisplay (the single combo/streak UI)
          drops below it via its fpsVisible prop so the two never overlap. */}
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
        {!gameState.isGameOver && !isPaused && userSettings.showCrosshair && (
          <div
            ref={crosshairRef}
            className="absolute top-1/2 left-1/2"
            style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95))', ['--chs' as string]: '0px' } as CSSProperties}
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

              // Dynamic tick — distance from centre = base gap + the live aim
              // spread (`--chs`, written each frame by the game loop), so the
              // reticle blooms with the weapon's real cone and tightens on ADS.
              const dynTick = (dir: 'up' | 'down' | 'left' | 'right') => {
                const vertical = dir === 'up' || dir === 'down';
                const neg = dir === 'up' || dir === 'left';
                const axis = vertical ? 'Y' : 'X';
                const dist = '(6.5px + var(--chs, 0px))';
                const shift = neg ? `calc(-1 * ${dist})` : `calc${dist}`;
                return (
                  <div
                    key={dir}
                    className="absolute rounded-full"
                    style={{
                      backgroundColor: cc,
                      width: vertical ? 2 : 5,
                      height: vertical ? 5 : 2,
                      left: '50%',
                      top: '50%',
                      transform: `translate(-50%, -50%) translate${axis}(${shift})`,
                    }}
                  />
                );
              };
              // Dynamic ring — diameter grows with the aim spread too.
              const dynRing = () => (
                <div
                  className="absolute rounded-full"
                  style={{
                    border: `1.5px solid ${cc}`,
                    width: 'calc(18px + 2 * var(--chs, 0px))',
                    height: 'calc(18px + 2 * var(--chs, 0px))',
                    left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                  }}
                />
              );

              if (style === 'dot') return dot(4);
              if (style === 'circle') return <>{ring(16)}{dot(2)}</>;
              if (style === 'dynamic') {
                return <>{(['up', 'down', 'left', 'right'] as const).map(dynTick)}{dynRing()}{dot(2)}</>;
              }
              // default: 'cross' — gapped 4-tick crosshair with centre dot
              return <>{(['up', 'down', 'left', 'right'] as const).map((d) => tick(d, 6, 3))}{dot(2)}</>;
            })()}
          </div>
        )}

        {/* Reload indicator — an amber ring under the crosshair whose sweep
            fills over the exact reload duration. The emerald arc is the ACTIVE
            RELOAD sweet spot (42–62% — mirrors ACTIVE_RELOAD_START/END in the
            game loop): tap R while the sweep is inside it to snap the reload
            done early. A hit flips the whole ring emerald + "Perfect!". */}
        {reloadDurationUI !== null && !gameState.isGameOver && !isPaused && (
          <div
            className="absolute left-1/2 top-1/2 select-none"
            style={{ transform: 'translate(-50%, 26px)' }}
          >
            <div className={`flex items-center gap-1.5 rounded-full border bg-black/75 px-2.5 py-1 ${
              reloadPerfectUI ? 'border-emerald-400/60' : 'border-amber-400/30'}`}
            >
              <div className="relative w-5 h-5">
                {reloadPerfectUI ? (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#34d399', boxShadow: '0 0 10px rgba(52,211,153,0.75)' }}
                  />
                ) : (
                  <>
                    {/* Sweet-spot arc (under the sweep — it vanishes as the
                        sweep passes it, so what's left to hit stays obvious). */}
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background:
                          'conic-gradient(transparent 0deg 151.2deg, rgba(52,211,153,0.9) 151.2deg 223.2deg, transparent 223.2deg 360deg)',
                      }}
                    />
                    <div
                      key={reloadDurationUI}
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: 'conic-gradient(#fbbf24 var(--reload-deg, 0deg), rgba(251,191,36,0.14) 0deg)',
                        animation: `reloadSweep ${reloadDurationUI}ms linear forwards`,
                      }}
                    />
                  </>
                )}
                <div className="absolute inset-[4px] rounded-full bg-black/85" />
              </div>
              <span className={`text-[10px] font-semibold tracking-[0.15em] uppercase ${
                reloadPerfectUI ? 'text-emerald-300' : 'text-amber-300'}`}
              >
                {reloadPerfectUI ? 'Perfect!' : 'Reloading'}
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
          powerUpMessageMs={powerUpMeta.ms}
          powerUpMessageKey={powerUpMeta.key}
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
                {activeRunModifierRef.current.name} · ×{activeRunModifierRef.current.scoreMult.toFixed(2)}
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
          below the top-right stats panel (the HUD Score panel at right-4 top-4
          w-44 runs to ~129px tall, so top-[152px] leaves a clean ~24px gap
          above the map). A kills/headshots readout used to sit under it; it
          duplicated the kill counter the Score panel already shows, so it was
          removed rather than kept in two places. Touch uses a right-edge
          toggle instead (no room for a docked stack). Press M (or the
          on-screen button) to expand. Hidden while paused. */}
      {gameStarted && !gameState.isGameOver && !isPaused && !photoMode
        && (gameMode === 'classic' || gameMode === 'tutorial') && (
        isTouch
          ? <Minimap isTouch soloMode />
          : (
            <div className="pointer-events-none absolute right-4 top-[152px] z-[12] flex w-44 flex-col gap-2">
              <Minimap soloMode />
            </div>
          )
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
                  // Radar panel: top 152px + header/canvas/legend ≈ 380px
                  // bottom edge. 416px leaves real breathing room so a feed
                  // entry can never touch the tactical map again.
                  ? 'top-[416px] right-4'
                  : 'top-36 right-4'
            }
          />
          <ComboDisplay
            combo={gameState.combo}
            killStreak={gameState.killStreak}
            visible={!isPaused}
            fpsVisible={userSettings.showFPS}
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

      {/* Boss health bar — mounted for the whole run; it renders nothing until
          the loop reports a living boss via setBossHealth(). */}
      {gameStarted && !gameState.isGameOver && !photoMode && (
        <BossHealthBar isTouch={isTouch} />
      )}


      {/* Tutorial Overlay — wired to real tutorial state. These handlers only
          poke the system / pointer lock: the render loop is the single owner of
          step transitions, spawns, capability locks and React state, so it
          picks every one of these up on the very next frame. */}
      {showTutorial && gameStarted && !gameState.isGameOver && (
        <TutorialOverlay
          currentStep={tutorialStep}
          progress={tutorialProgress}
          stepNumber={tutorialMeta.number}
          stepTotal={tutorialMeta.total}
          onSkip={() => { tutorialRef.current?.skipCurrentStep(); }}
          onTry={() => {
            // Practising a step — unblock input + grab pointer lock so the
            // action can actually be performed. The loop re-blocks
            // automatically the moment the step hands over.
            tutorialActiveRef.current = false;
            const canvas = mountRef.current?.querySelector('canvas');
            if (canvas && !isTouch) (canvas as HTMLCanvasElement).requestPointerLock();
          }}
          onEndTutorial={() => {
            // Bail out entirely. Clearing `tutorialRunningRef` FIRST is what
            // tells the loop this was a bail-out, not a completion, so it skips
            // the celebration card — and `setEnabled(false)` makes every locked
            // capability grant again on the next frame.
            tutorialRunningRef.current = false;
            tutorialRef.current?.setEnabled(false);
            tutorialActiveRef.current = false;
            const canvas = mountRef.current?.querySelector('canvas');
            if (canvas && !isTouch) (canvas as HTMLCanvasElement).requestPointerLock();
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
                    // Only NOW does gameplay input unblock and the cursor
                    // re-lock — the player has actually chosen to keep
                    // playing, rather than it happening as a side effect of
                    // clicking this card.
                    tutorialActiveRef.current = false;
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
          onUnlockSkill={handleUnlockSkill}
          onClose={() => { setShowSkillTree(false); setIsPaused(true); }}
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
