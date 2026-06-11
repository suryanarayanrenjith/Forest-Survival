import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, ArrowLeft, Server, LogIn, Copy, SlidersHorizontal, Clock,
  ChevronDown, Crown, Play, X, Loader2, Wifi, Check, UserRound,
  Trees, Flame, Snowflake, Mountain, Droplet, Shield, Leaf, Landmark,
  Crosshair, Skull, Cpu, Bot, Footprints, ShieldCheck, EyeOff, Flame as FlameIcon,
  HeartPulse, Wrench, Ghost, Lock, Sun, Moon, SunMoon, Smartphone, type LucideIcon,
} from 'lucide-react';
import { usePlayerData } from '../hooks/usePlayerData';
import UserAvatar from './UserAvatar';
import PlayerStatsModal from './PlayerStatsModal';
import { computeRank, legacySoloRankXp, RANK_TIERS } from '../utils/rankSystem';
import { MultiplayerManager, type ModelClassId, type NetworkMessage } from '../utils/MultiplayerManager';
import type { PlayerData } from '../utils/MultiplayerManager';

function popcount(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) { bits &= bits - 1; count += 1; }
  return count;
}

type GameStartMsg = Extract<NetworkMessage, { type: 'game_start' }>;
type PlayerRejectedMsg = Extract<NetworkMessage, { type: 'player_rejected' }>;
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';
import { CHARACTER_ABILITIES } from '../utils/CharacterAbilityRegistry';
import { ABILITY_ICONS } from './abilityIcons';

interface CharacterDef {
  id: ModelClassId;
  name: string;
  blurb: string;
  /** Mechanical passive blurb (must match CharacterPassiveRegistry). */
  perk: string;
  Icon: LucideIcon;
  color: string;
}
const CHARACTERS: CharacterDef[] = [
  { id: 'ranger',    name: 'Ranger',    blurb: 'Hooded scout',         perk: '−10% dash CD',        Icon: Bot,         color: '#3f7a2a' },
  { id: 'scout',     name: 'Scout',     blurb: 'Cap + pack',           perk: '+12% speed',          Icon: Footprints,  color: '#f6b53b' },
  { id: 'heavy',     name: 'Heavy',     blurb: 'Plated visor',         perk: '+20% HP / −8% spd',   Icon: ShieldCheck, color: '#b02b2b' },
  { id: 'operative', name: 'Operative', blurb: 'Quad-tube NVGs',       perk: '+10% headshot dmg',   Icon: EyeOff,      color: '#3a3f4a' },
  { id: 'pyro',      name: 'Pyro',      blurb: 'Gas mask + tanks',     perk: 'Burning bullets',     Icon: FlameIcon,   color: '#d96528' },
  { id: 'medic',     name: 'Medic',     blurb: 'Coat + red cross',     perk: '0.5 HP / s regen',    Icon: HeartPulse,  color: '#c91a1a' },
  { id: 'engineer',  name: 'Engineer',  blurb: 'Hard hat + exo',       perk: '−15% reload time',    Icon: Wrench,      color: '#c78a2a' },
  { id: 'phantom',   name: 'Phantom',   blurb: 'Visor + cloak',        perk: '+15% Phantom dur.',   Icon: Ghost,       color: '#7c33ff' },
];

export type MpDifficulty = 'easy' | 'medium' | 'hard' | 'adaptive';
export type MpTimeOfDay = 'auto' | 'day' | 'night';

interface MultiplayerLobbyProps {
  onStartGame: (
    manager: MultiplayerManager,
    gameMode: 'coop' | 'survival',
    timeLimit?: number,
    map?: MapType,
    difficulty?: MpDifficulty,
    timeOfDay?: MpTimeOfDay,
  ) => void;
  onBack: () => void;
  /** When set, the lobby reuses this manager instead of creating a new one
   *  or auto-rejoining from the URL. Used after a match ends so the host
   *  can hit "Play Again" and have everyone land back in the same lobby
   *  without re-entering the lobby ID. */
  existingManager?: MultiplayerManager | null;
  t?: (key: string) => string;
}

const MAP_ICONS: Record<MapType, LucideIcon> = {
  deep_forest: Trees,
  scorched_wasteland: Flame,
  frozen_tundra: Snowflake,
  desert_canyon: Mountain,
  toxic_swamp: Droplet,
  military_outpost: Shield,
  autumn_grove: Leaf,
  ancient_ruins: Landmark,
};

// Helper to update URL without page reload
const updateURL = (params: Record<string, string>) => {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  });
  window.history.replaceState({}, '', url.toString());
};

const clearMultiplayerURL = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('lobby');
  url.searchParams.delete('role');
  url.searchParams.delete('name');
  window.history.replaceState({}, '', url.toString());
};

const getURLParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    lobby: params.get('lobby'),
    role: params.get('role') as 'host' | 'guest' | null,
    name: params.get('name')
  };
};

// ── Module-level sub-components (defined OUTSIDE the lobby so the 100ms
//    player-list poll doesn't remount them — that remount was what made the
//    rows constantly flash). ───────────────────────────────────────────────
const PlayerRow = ({ player, index, manager, onViewStats }: {
  player: PlayerData;
  index: number;
  manager: MultiplayerManager;
  onViewStats?: (username: string) => void;
}) => {
  const isLocal = player.id === manager.getLocalPlayer().id;
  const isHost = manager.isPlayerHost(player.id);
  const tier = player.rankTier !== undefined ? RANK_TIERS[player.rankTier] : null;
  return (
    <button
      type="button"
      onClick={() => onViewStats?.(player.name)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] ${
        isLocal ? 'border-emerald-400/30 bg-emerald-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02]'
      }`}
      style={{ animation: `mlRow 0.3s ease-out ${index * 0.06}s both` }}
    >
      <UserAvatar username={player.name} avatarIndex={player.avatarIndex} size="sm" className="w-9 h-9 rounded-lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{player.name}</span>
          {tier && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
              style={{ color: tier.color, background: `${tier.color}22` }}
            >
              {tier.name}{player.level ? ` ${player.level}` : ''}
            </span>
          )}
          {isHost && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-300">
              <Crown className="w-3 h-3" strokeWidth={2.5} /> Host
            </span>
          )}
          {isLocal && !isHost && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-300">
              You
            </span>
          )}
          {player.isMobile && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-teal-500/15 text-teal-300" title="Playing on mobile">
              <Smartphone className="w-3 h-3" strokeWidth={2.5} /> Mobile
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-semibold tracking-wide text-emerald-400/80 uppercase">Connected</span>
          {player.modelClass && (() => {
            const char = CHARACTERS.find((c) => c.id === player.modelClass);
            if (!char) return null;
            return (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                style={{ background: `${char.color}26`, color: char.color }}
              >
                <char.Icon className="w-2.5 h-2.5" strokeWidth={2.5} /> {char.name}
              </span>
            );
          })()}
        </div>
      </div>
    </button>
  );
};

// Character picker — 8 cards, one per class. Cards taken by other players
// are dimmed + locked so a class can only be claimed once per lobby.
const CharacterPicker = ({
  selected,
  takenBy,
  onPick,
}: {
  selected: ModelClassId | undefined;
  takenBy: Map<ModelClassId, string>;   // classId → player name (other players)
  onPick: (id: ModelClassId) => void;
}) => (
  <div>
    <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
      Choose Character
    </label>
    <div className="grid grid-cols-4 gap-1.5">
      {CHARACTERS.map((c) => {
        const owner = takenBy.get(c.id);
        const isMine = selected === c.id;
        const locked = !!owner && !isMine;
        const AbilityIcon = ABILITY_ICONS[CHARACTER_ABILITIES[c.id].id];
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => { if (!locked) onPick(c.id); }}
            disabled={locked}
            title={locked ? `Taken by ${owner}` : `${c.blurb} · Ability: ${CHARACTER_ABILITIES[c.id].name} · ${c.perk}`}
            className="relative flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg border transition-all duration-150"
            style={{
              borderColor: isMine ? `${c.color}cc` : locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
              background: isMine ? `${c.color}26` : 'rgba(255,255,255,0.03)',
              opacity: locked ? 0.34 : 1,
              cursor: locked ? 'not-allowed' : 'pointer',
            }}
          >
            <c.Icon
              className="w-5 h-5"
              style={{ color: isMine ? c.color : locked ? '#6b7280' : '#cbd5e1' }}
              strokeWidth={1.8}
            />
            <span className={`text-[10px] font-bold leading-tight text-center truncate w-full ${isMine ? 'text-white' : 'text-gray-300'}`}>
              {c.name}
            </span>
            <span
              className="flex items-center justify-center gap-1 text-[8px] font-bold leading-tight text-center truncate w-full"
              style={{ color: locked ? '#6b7280' : CHARACTER_ABILITIES[c.id].color }}
            >
              <AbilityIcon className="w-2.5 h-2.5 flex-shrink-0" strokeWidth={2.5} />
              <span className="truncate">{CHARACTER_ABILITIES[c.id].name}</span>
            </span>
            <span
              className={`text-[8px] font-semibold leading-tight text-center truncate w-full ${isMine ? 'text-white/80' : 'text-gray-500'}`}
            >
              {c.perk}
            </span>
            {locked && (
              <span className="absolute top-1 right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full bg-black/55">
                <Lock className="w-2 h-2 text-gray-400" strokeWidth={2.5} />
              </span>
            )}
            {isMine && (
              <span className="absolute top-1 right-1 flex items-center justify-center w-3.5 h-3.5 rounded-full" style={{ background: c.color }}>
                <Check className="w-2 h-2 text-black" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

const ErrorBox = ({ error }: { error: string }) =>
  error ? (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] px-3.5 py-2.5 text-xs text-red-300">
      {error}
    </div>
  ) : null;

// In-lobby name editor.
// Read-only identity — multiplayer always uses the signed-in account username
// (no random names, no renaming).
const IdentityField = ({ username }: { username: string }) => (
  <div>
    <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
      Playing As
    </label>
    <div className="flex items-center gap-2.5 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-3.5 py-2.5">
      <UserRound className="w-4 h-4 text-emerald-300 flex-shrink-0" strokeWidth={2.1} />
      <span className="text-sm font-semibold text-white truncate">{username}</span>
    </div>
  </div>
);

const Styles = () => (
  <style>{`
    @keyframes mlFade {
      from { opacity: 0; transform: scale(0.97) translateY(12px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes mlRow {
      from { opacity: 0; transform: translateX(16px); }
      to { opacity: 1; transform: translateX(0); }
    }
  `}</style>
);

const MultiplayerLobby = ({ onStartGame, onBack, existingManager = null }: MultiplayerLobbyProps) => {
  const { currentUser, playerStats } = usePlayerData();
  const username = currentUser?.username ?? '';
  const [viewStatsUser, setViewStatsUser] = useState<string | null>(null);

  // Local account identity broadcast to peers (rank/level/avatar).
  const localProfileMeta = useMemo(() => {
    if (!playerStats) return { avatarIndex: 0 } as { rankTier?: number; level?: number; avatarIndex: number };
    const r = computeRank({
      soloRankXp: playerStats.rankXp ?? legacySoloRankXp(playerStats.solo),
      multiplayer: {
        wins: playerStats.multiplayer.wins,
        gamesPlayed: playerStats.multiplayer.gamesPlayed,
        totalKills: playerStats.multiplayer.totalKills,
      },
      achievementsCount: popcount(playerStats.achievements),
      skillsCount: Object.keys(playerStats.skills).length,
    });
    return { rankTier: r.tierIndex, level: r.level, avatarIndex: playerStats.avatarIndex ?? 0 };
  }, [playerStats]);

  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [lobbyId, setLobbyId] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [manager, setManager] = useState<MultiplayerManager | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connectedPlayers, setConnectedPlayers] = useState<PlayerData[]>([]);
  const [gameMode, setGameMode] = useState<'coop' | 'survival'>('coop');
  const [difficulty, setDifficulty] = useState<MpDifficulty>('medium');
  const [timeOfDay, setTimeOfDay] = useState<MpTimeOfDay>('auto');
  const [timeLimit, setTimeLimit] = useState<number>(300);
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  const [showMapSelector, setShowMapSelector] = useState(false);
  const [copied, setCopied] = useState(false);
  const lobbyCreatedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);

  // Reuse a manager from a previous match (Play Again) — skip menu/URL paths.
  useEffect(() => {
    if (!existingManager || manager) return;

    const localPlayer = existingManager.getLocalPlayer();
    autoJoinAttemptedRef.current = true; // prevent any URL-based auto-rejoin
    lobbyCreatedRef.current = true;      // prevent the host auto-create effect

    setManager(existingManager);
    // Seed the player list immediately so the lobby doesn't flash empty
    // while the 200ms poll catches up.
    setConnectedPlayers(existingManager.getAllPlayers());

    if (existingManager.isGameHost()) {
      setLobbyId(localPlayer.id);
      setView('host');
    } else {
      setJoinLobbyId(existingManager.getLobbyId());
      setView('join');
    }
  }, [existingManager]);

  // Check URL params for session persistence. Waits for the signed-in
  // identity to load (multiplayer always plays as the account username).
  useEffect(() => {
    if (existingManager) return; // already-connected manager is in charge
    if (autoJoinAttemptedRef.current) return;
    if (!currentUser) return; // not signed in / still loading — handled by the auth gate

    const { lobby, role } = getURLParams();

    if (lobby && role) {
      autoJoinAttemptedRef.current = true;

      if (role === 'host') {
        setView('host');
      } else if (role === 'guest') {
        setJoinLobbyId(lobby);
        setView('join');
        setTimeout(() => {
          handleAutoJoin(lobby);
        }, 100);
      }
    }
  }, [currentUser]);

  const handleAutoJoin = async (lobbyIdToJoin: string) => {
    if (!lobbyIdToJoin || !username) return;

    setIsConnecting(true);
    setError('');

    const newManager = new MultiplayerManager(username);
    newManager.setProfileMeta(localProfileMeta);
    let rejected = false;
    newManager.onMessage('player_rejected', (raw) => {
      rejected = true;
      const data = raw as PlayerRejectedMsg;
      setError(data.reason || 'You are already in this game in another window.');
      newManager.disconnect();
      setManager(null);
      setView('menu');
      setIsConnecting(false);
      clearMultiplayerURL();
    });
    try {
      await newManager.joinLobby(lobbyIdToJoin);
      if (rejected) { newManager.disconnect(); return; }
      setManager(newManager);
    } catch (err) {
      console.error('[MultiplayerLobby] Failed to rejoin lobby:', err);
      newManager.disconnect();
      setError('Session expired. The lobby may have closed. Please join again manually.');
      clearMultiplayerURL();
    } finally {
      setIsConnecting(false);
    }
  };

  // Update connected players list
  useEffect(() => {
    if (manager) {
      const interval = setInterval(() => {
        setConnectedPlayers(manager.getAllPlayers());
      }, 200);
      return () => clearInterval(interval);
    }
  }, [manager]);

  // Register game_start handler immediately when manager is created.
  // Both subscriptions are torn down on cleanup so navigating the lobby (or a
  // manager swap) never leaves stale listeners stacked on the manager — a
  // leak that previously let a single game_start fire many duplicate handlers.
  useEffect(() => {
    if (!manager) return;

    const unsubStart = manager.onMessage('game_start', (raw) => {
      const data = raw as GameStartMsg;
      if (data.gameState) {
        const gameMode = data.gameState.gameMode || 'coop';
        const timeLimit = data.gameState.timeLimit;
        const map = data.gameState.map as MapType | undefined;
        const difficulty = (data.gameState.difficulty as MpDifficulty | undefined) || 'medium';
        const timeOfDay = (data.gameState.timeOfDay as MpTimeOfDay | undefined) || 'auto';
        onStartGame(manager, gameMode, timeLimit, map, difficulty, timeOfDay);
      }
    });

    const unsubRejected = manager.onMessage('player_rejected', (raw) => {
      const data = raw as PlayerRejectedMsg;
      setError(data.reason);
      setManager(null);
      setView('menu');
      setIsConnecting(false);
    });

    return () => {
      unsubStart();
      unsubRejected();
    };
  }, [manager, onStartGame]);

  // Create lobby when switching to host view
  useEffect(() => {
    if (view === 'host' && !manager && !lobbyCreatedRef.current && !isConnecting) {
      lobbyCreatedRef.current = true;
      handleCreateLobby();
    }
  }, [view]);

  const handleCreateLobby = async () => {
    setIsConnecting(true);
    setError('');

    try {
      const newManager = new MultiplayerManager(username);
      newManager.setProfileMeta(localProfileMeta);
      const id = await newManager.createLobby();
      setLobbyId(id);
      setManager(newManager);
      updateURL({ lobby: id, role: 'host' });
    } catch (err) {
      console.error('Failed to create lobby:', err);
      setError('Failed to create lobby. Please check your connection and try again.');
      lobbyCreatedRef.current = false;
      setView('menu');
      clearMultiplayerURL();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleJoinLobby = async () => {
    if (!joinLobbyId.trim()) {
      setError('Please enter a lobby ID');
      return;
    }

    setIsConnecting(true);
    setError('');

    const newManager = new MultiplayerManager(username);
    newManager.setProfileMeta(localProfileMeta);
    // Register the rejection handler BEFORE joining so a fast (same-machine)
    // rejection is never missed. The host rejects any join whose username is
    // already present — which is exactly how the SAME account is stopped from
    // joining its own hosted game from another window. Landing back on the
    // join form (not a dead "connecting" state) also lets the player retry.
    let rejected = false;
    newManager.onMessage('player_rejected', (raw) => {
      rejected = true;
      const data = raw as PlayerRejectedMsg;
      setError(data.reason || 'You are already in this game in another window.');
      newManager.disconnect();
      setManager(null);
      setView('menu');
      setIsConnecting(false);
      clearMultiplayerURL();
    });

    try {
      await newManager.joinLobby(joinLobbyId);
      if (rejected) { newManager.disconnect(); return; }
      setManager(newManager);
      updateURL({ lobby: joinLobbyId, role: 'guest' });
    } catch (err) {
      console.error('Failed to join lobby:', err);
      newManager.disconnect(); // release the peer so the next attempt is clean
      setError('Failed to join lobby. Please check the ID and try again.');
      clearMultiplayerURL();
    } finally {
      setIsConnecting(false);
    }
  };

  // Lobby-pick the local player's character class. Broadcasts the choice
  // so every other client greys it out and the in-game avatar matches.
  const localPlayer = manager?.getLocalPlayer();
  const localClass: ModelClassId | undefined = localPlayer?.modelClass;
  const takenByOthers = new Map<ModelClassId, string>();
  connectedPlayers.forEach((p) => {
    if (!localPlayer || p.id === localPlayer.id) return;
    if (p.modelClass) takenByOthers.set(p.modelClass, p.name);
  });
  const handlePickCharacter = (id: ModelClassId) => {
    if (!manager) return;
    // Defence in depth — the button is disabled when taken, but block
    // here too in case of a race between two simultaneous picks.
    if (takenByOthers.has(id)) {
      setError(`That character is already taken by ${takenByOthers.get(id)}.`);
      return;
    }
    manager.updateLocalPlayer({ modelClass: id });
    setError('');
  };

  // Every player (host included) must have locked in a character class before
  // the match can begin — otherwise their in-game avatar would be auto-assigned
  // and the lobby pick would feel meaningless.
  const playersMissingCharacter = connectedPlayers.filter((p) => !p.modelClass);
  const everyoneHasCharacter = connectedPlayers.length > 0 && playersMissingCharacter.length === 0;
  const canStartGame = connectedPlayers.length >= 2 && everyoneHasCharacter;

  const handleStartGame = () => {
    if (!manager || connectedPlayers.length < 2) return;
    if (!everyoneHasCharacter) {
      const names = playersMissingCharacter.map((p) => p.name).join(', ');
      setError(`Waiting on a character pick from: ${names}. Everyone must choose a character before the game can start.`);
      return;
    }
    onStartGame(manager, gameMode, hasTimeLimit ? timeLimit : undefined, selectedMap, difficulty, timeOfDay);
  };

  const handleBack = () => {
    if (manager) {
      manager.disconnect();
      setManager(null);
    }
    lobbyCreatedRef.current = false;
    clearMultiplayerURL();
    onBack();
  };

  const handleChangeView = (newView: 'menu' | 'host' | 'join') => {
    if (newView !== 'host') {
      lobbyCreatedRef.current = false;
    }
    setView(newView);
    setError('');
  };

  const copyLobbyId = () => {
    navigator.clipboard.writeText(lobbyId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Layout-only — the dark tint + full-screen blur behind the lobby panels
  // is rendered statically at App level (outside the menu transition), so
  // the backdrop can't drift while this screen slides in/out.
  const backdrop = 'fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto';
  const backdropStyle = {} as const;
  const panelClass = 'w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b1016]/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]';
  const panelInnerClass = 'w-full max-w-xl rounded-3xl border border-white/10 bg-[#0b1016]/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[94dvh]';

  // ── AUTH GATE ───────────────────────────────────────────────────────────
  // Multiplayer always plays as the signed-in account username. Guests who
  // reach the lobby via a shared link are asked to sign in from the main menu.
  if (currentUser === undefined) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#0b1016]/95 px-6 py-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
          <Loader2 className="w-10 h-10 text-sky-400 animate-spin" strokeWidth={2} />
          <div className="text-sm font-semibold tracking-wide text-gray-300">Checking your session…</div>
        </div>
      </div>
    );
  }
  if (currentUser === null) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className={panelClass + ' p-6 text-center'}
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/12 mb-3">
            <Lock className="w-6 h-6 text-sky-400" strokeWidth={2} />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Sign in to play</h2>
          <p className="mt-2 text-sm text-gray-400">
            Multiplayer uses your account username. Please sign in from the main menu to host or join a game.
          </p>
          <button
            onClick={handleBack}
            className="mt-5 flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 border border-white/10
              text-sm font-semibold text-gray-300 transition-colors hover:text-white hover:bg-white/[0.05]"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.25} /> Back to Menu
          </button>
        </div>
        <Styles />
      </div>
    );
  }

  // ── MENU VIEW ───────────────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className={panelClass + ' p-6'}
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/12 mb-3">
              <Users className="w-6 h-6 text-sky-400" strokeWidth={2} />
            </div>
            <p className="text-[10px] tracking-[0.35em] text-sky-400/90 font-semibold uppercase">Online Play</p>
            <h1 className="text-3xl font-bold text-white tracking-tight">Multiplayer</h1>
          </div>

          <div className="space-y-3">
            <IdentityField username={username} />

            <button
              onClick={() => handleChangeView('host')}
              className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
                bg-white/[0.03] transition-all duration-200 hover:bg-emerald-500/[0.08] hover:border-emerald-400/50"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/15">
                <Server className="w-[18px] h-[18px] text-emerald-400" strokeWidth={2} />
              </span>
              <span className="flex-1 text-left">
                <span className="block text-sm font-bold text-white">Host Game</span>
                <span className="block text-[11px] text-gray-500">Create a lobby for friends</span>
              </span>
            </button>

            <button
              onClick={() => handleChangeView('join')}
              className="group flex items-center gap-3 w-full rounded-xl px-4 py-3.5 border border-white/10
                bg-white/[0.03] transition-all duration-200 hover:bg-sky-500/[0.08] hover:border-sky-400/50"
            >
              <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/15">
                <LogIn className="w-[18px] h-[18px] text-sky-400" strokeWidth={2} />
              </span>
              <span className="flex-1 text-left">
                <span className="block text-sm font-bold text-white">Join Game</span>
                <span className="block text-[11px] text-gray-500">Enter a lobby ID to connect</span>
              </span>
            </button>

            <button
              onClick={handleBack}
              className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 border border-white/10
                text-sm font-semibold text-gray-400 transition-colors hover:text-white hover:bg-white/[0.05]"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={2.25} />
              Back
            </button>

            <ErrorBox error={error} />
          </div>
        </div>
        <Styles />
      </div>
    );
  }

  // ── HOST LOADING ────────────────────────────────────────────────────────
  if (view === 'host' && isConnecting && !manager) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-[#0b1016]/95 px-6 py-5 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" strokeWidth={2} />
          <div className="text-sm font-semibold tracking-wide text-gray-300">Creating lobby…</div>
        </div>
      </div>
    );
  }

  // ── HOST LOBBY ──────────────────────────────────────────────────────────
  if (view === 'host' && manager) {
    const SelMapIcon = MAP_ICONS[selectedMap];
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className={panelInnerClass}
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12">
                <Server className="w-5 h-5 text-emerald-400" strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">Host Lobby</h2>
                <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Lobby open
                </p>
              </div>
            </div>
            <button onClick={handleBack} aria-label="Close"
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400
                transition-colors hover:text-white hover:bg-white/[0.06]">
              <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto">
            {/* Lobby ID */}
            <div>
              <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
                Lobby ID — share with friends
              </label>
              <div className="flex gap-2">
                <input
                  type="text" value={lobbyId} readOnly
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5
                    font-mono text-xs text-emerald-300 select-all focus:outline-none"
                />
                <button
                  onClick={copyLobbyId}
                  className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#04130a]
                    transition-all hover:-translate-y-0.5"
                  style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
                >
                  {copied ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2.5} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Identity — fixed to the signed-in account username */}
            <IdentityField username={username} />

            {/* Character picker — host gets it too so they can claim a class */}
            <CharacterPicker
              selected={localClass}
              takenBy={takenByOthers}
              onPick={handlePickCharacter}
            />

            {/* Settings */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-gray-300">Game Settings</span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['coop', 'Co-op Survival'], ['survival', 'Last Man Standing']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setGameMode(val)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                        gameMode === val
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">Difficulty</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    ['easy', 'Easy', 'Casual', Shield, '#34d399'],
                    ['medium', 'Medium', 'Balanced', Crosshair, '#fbbf24'],
                    ['hard', 'Hard', 'Brutal', Skull, '#f87171'],
                    ['adaptive', 'Adaptive', 'AI-paced', Cpu, '#22d3ee'],
                  ] as const).map(([val, label, desc, Icon, color]) => {
                    const active = difficulty === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setDifficulty(val)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border transition-all duration-200 hover:-translate-y-0.5"
                        style={{
                          borderColor: active ? `${color}99` : 'rgba(255,255,255,0.08)',
                          background: active ? `${color}1f` : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <Icon className="w-4 h-4 mb-1" style={{ color: active ? color : '#9ca3af' }} strokeWidth={2} />
                        <span className={`text-[11px] font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{label}</span>
                        <span className="text-[9px] text-gray-500">{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time of day */}
              <div>
                <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">Time of Day</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ['auto', 'Auto', 'Day/Night cycle', SunMoon, '#a78bfa'],
                    ['day', 'Day', 'Bright', Sun, '#fbbf24'],
                    ['night', 'Night', 'Dark', Moon, '#60a5fa'],
                  ] as const).map(([val, label, desc, Icon, color]) => {
                    const active = timeOfDay === val;
                    return (
                      <button
                        key={val}
                        onClick={() => setTimeOfDay(val)}
                        className="flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border transition-all duration-200 hover:-translate-y-0.5"
                        style={{
                          borderColor: active ? `${color}99` : 'rgba(255,255,255,0.08)',
                          background: active ? `${color}1f` : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <Icon className="w-4 h-4 mb-1" style={{ color: active ? color : '#9ca3af' }} strokeWidth={2} />
                        <span className={`text-[11px] font-bold ${active ? 'text-white' : 'text-gray-300'}`}>{label}</span>
                        <span className="text-[9px] text-gray-500">{desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time limit */}
              <div>
                <button
                  onClick={() => setHasTimeLimit(!hasTimeLimit)}
                  className="flex items-center justify-between w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                    <Clock className="w-4 h-4 text-gray-400" strokeWidth={2.25} /> Time Limit
                  </span>
                  <span className={`relative w-9 h-5 rounded-full transition-colors ${hasTimeLimit ? 'bg-emerald-500' : 'bg-white/15'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${hasTimeLimit ? 'right-0.5' : 'left-0.5'}`} />
                  </span>
                </button>
                {hasTimeLimit && (
                  <div className="mt-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex justify-between text-[11px] text-gray-400 mb-1.5">
                      <span>Duration</span>
                      <span className="font-semibold text-emerald-300">{Math.floor(timeLimit / 60)}m {timeLimit % 60}s</span>
                    </div>
                    <input
                      type="range" min={60} max={1800} step={30} value={timeLimit}
                      onChange={(e) => setTimeLimit(Number(e.target.value))}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Map */}
              <div>
                <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">Map</label>
                <button
                  onClick={() => setShowMapSelector(!showMapSelector)}
                  className="flex items-center gap-3 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5
                    transition-colors hover:bg-white/[0.06]"
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/12 flex-shrink-0">
                    <SelMapIcon className="w-[18px] h-[18px] text-emerald-400" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-bold text-white truncate">{MAP_CONFIGS[selectedMap].name}</span>
                    <span className="block text-[11px] text-gray-500 truncate">{MAP_CONFIGS[selectedMap].description}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${showMapSelector ? 'rotate-180' : ''}`} strokeWidth={2.25} />
                </button>
                {showMapSelector && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    {Object.values(MAP_CONFIGS).map((map) => {
                      const Icon = MAP_ICONS[map.id];
                      const active = selectedMap === map.id;
                      return (
                        <button
                          key={map.id}
                          onClick={() => { setSelectedMap(map.id); setShowMapSelector(false); }}
                          className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border transition-all ${
                            active ? 'border-emerald-400/50 bg-emerald-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          }`}
                        >
                          <Icon className="w-5 h-5" style={{ color: active ? '#34d399' : '#9ca3af' }} strokeWidth={1.75} />
                          <span className={`text-[10px] font-bold leading-tight text-center ${active ? 'text-white' : 'text-gray-400'}`}>
                            {map.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Players */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-gray-300">Players</span>
                <span className="text-xs text-gray-500">{connectedPlayers.length} / 8</span>
              </div>
              <div className="space-y-1.5">
                {connectedPlayers.map((player, index) => (
                  <PlayerRow key={player.id} player={player} index={index} manager={manager} onViewStats={setViewStatsUser} />
                ))}
                {connectedPlayers.length < 8 && (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2.5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-dashed border-white/10">
                      <Loader2 className="w-4 h-4 text-gray-600 animate-spin" strokeWidth={2} />
                    </div>
                    <span className="text-xs text-gray-600 italic">Waiting for players…</span>
                  </div>
                )}
              </div>
            </div>

            <ErrorBox error={error} />
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-white/[0.07] space-y-2">
            {connectedPlayers.length < 2 && (
              <p className="text-center text-[11px] text-amber-400/90">
                Need at least 2 players to start ({connectedPlayers.length} connected)
              </p>
            )}
            {connectedPlayers.length >= 2 && !everyoneHasCharacter && (
              <p className="text-center text-[11px] text-amber-400/90">
                Waiting on a character pick from {playersMissingCharacter.map((p) => p.name).join(', ')}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={handleStartGame}
                disabled={!canStartGame}
                title={!canStartGame
                  ? (connectedPlayers.length < 2
                      ? 'Need at least 2 players'
                      : 'Every player must choose a character first')
                  : undefined}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold tracking-wide text-[#04130a]
                  transition-all duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
              >
                <Play className="w-4 h-4" strokeWidth={2.5} fill="currentColor" />
                Start Game
              </button>
              <button
                onClick={handleBack}
                className="rounded-xl px-5 py-3 font-bold tracking-wide text-gray-400 border border-white/10
                  transition-colors hover:text-white hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        {viewStatsUser && <PlayerStatsModal username={viewStatsUser} onClose={() => setViewStatsUser(null)} />}
        <Styles />
      </div>
    );
  }

  // ── JOIN FORM ───────────────────────────────────────────────────────────
  if (view === 'join' && !manager) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className={panelClass + ' p-6'}
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/12 mb-3">
              <LogIn className="w-6 h-6 text-sky-400" strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Join Game</h2>
          </div>

          <div className="space-y-3">
            <IdentityField username={username} />

            <div>
              <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
                Lobby ID
              </label>
              <input
                type="text"
                value={joinLobbyId}
                onChange={(e) => setJoinLobbyId(e.target.value)}
                placeholder="Paste lobby ID"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 font-mono text-xs
                  text-sky-300 placeholder-gray-600 focus:outline-none focus:border-sky-400/50 transition-colors"
              />
            </div>

            <button
              onClick={handleJoinLobby}
              disabled={isConnecting || !joinLobbyId.trim()}
              className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 font-bold tracking-wide text-[#04131a]
                transition-all duration-200 enabled:hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' }}
            >
              {isConnecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} /> Connecting…</>
              ) : (
                <><LogIn className="w-4 h-4" strokeWidth={2.5} /> Join</>
              )}
            </button>

            <button
              onClick={() => handleChangeView('menu')}
              className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 border border-white/10
                text-sm font-semibold text-gray-400 transition-colors hover:text-white hover:bg-white/[0.05]"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={2.25} />
              Back
            </button>

            <ErrorBox error={error} />
          </div>
        </div>
        <Styles />
      </div>
    );
  }

  // ── JOIN — WAITING FOR HOST ─────────────────────────────────────────────
  if (view === 'join' && manager) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b1016]/95 overflow-hidden shadow-[0_24px_80px_-24px_rgba(0,0,0,0.8)]"
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.07]">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sky-500/12">
              <Wifi className="w-5 h-5 text-sky-400" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">In Lobby</h2>
              <p className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Connected
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Identity — fixed to the signed-in account username */}
            <IdentityField username={username} />

            {/* Character picker — guests pick their character here */}
            <CharacterPicker
              selected={localClass}
              takenBy={takenByOthers}
              onPick={handlePickCharacter}
            />

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-gray-300">Players</span>
                <span className="text-xs text-gray-500">{connectedPlayers.length} / 8</span>
              </div>
              <div className="space-y-1.5">
                {connectedPlayers.map((player, index) => (
                  <PlayerRow key={player.id} player={player} index={index} manager={manager} onViewStats={setViewStatsUser} />
                ))}
              </div>
            </div>

            <div className="flex flex-col items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/[0.05] py-5">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin" strokeWidth={2} />
              <div className="text-sm font-bold text-white">Waiting for Host</div>
              <div className="text-xs text-gray-500">The game starts when the host is ready</div>
            </div>

            <ErrorBox error={error} />

            <button
              onClick={handleBack}
              className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 border border-white/10
                text-sm font-semibold text-gray-400 transition-colors hover:text-white hover:bg-white/[0.05]"
            >
              <ArrowLeft className="w-4 h-4" strokeWidth={2.25} />
              Leave Lobby
            </button>
          </div>
        </div>
        {viewStatsUser && <PlayerStatsModal username={viewStatsUser} onClose={() => setViewStatsUser(null)} />}
        <Styles />
      </div>
    );
  }

  return null;
};

export default MultiplayerLobby;
