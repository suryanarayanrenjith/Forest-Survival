import { useState, useEffect, useRef } from 'react';
import {
  Users, ArrowLeft, Server, LogIn, Copy, SlidersHorizontal, Clock,
  ChevronDown, Crown, Play, X, Loader2, Wifi, Check, Pencil, Dices,
  Trees, Flame, Snowflake, Mountain, Droplet, Shield, Leaf, Landmark,
  Crosshair, Skull, Cpu, type LucideIcon,
} from 'lucide-react';
import MenuShell from './MenuShell';
import { MultiplayerManager } from '../utils/MultiplayerManager';
import type { PlayerData } from '../utils/MultiplayerManager';
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';

export type MpDifficulty = 'easy' | 'medium' | 'hard' | 'adaptive';

interface MultiplayerLobbyProps {
  onStartGame: (
    manager: MultiplayerManager,
    gameMode: 'coop' | 'survival',
    timeLimit?: number,
    map?: MapType,
    difficulty?: MpDifficulty,
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

// Randomised, unique-feeling default player name (adjective + noun + number).
const NAME_ADJECTIVES = [
  'Swift', 'Silent', 'Crimson', 'Shadow', 'Iron', 'Lone', 'Savage', 'Frost',
  'Ember', 'Rapid', 'Grim', 'Wild', 'Storm', 'Night', 'Blaze', 'Steel',
  'Rogue', 'Brave', 'Vivid', 'Feral', 'Lunar', 'Solar', 'Toxic', 'Arctic',
  'Hollow', 'Rugged', 'Fierce', 'Hidden',
];
const NAME_NOUNS = [
  'Fox', 'Wolf', 'Raven', 'Viper', 'Hawk', 'Wraith', 'Hunter', 'Ranger',
  'Drifter', 'Specter', 'Falcon', 'Reaper', 'Lynx', 'Cobra', 'Jackal',
  'Warden', 'Nomad', 'Striker', 'Tiger', 'Panther', 'Shark', 'Hornet', 'Comet',
];
const generatePlayerName = (): string => {
  const a = NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)];
  const n = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${a}${n}${num}`;
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
const PlayerRow = ({ player, index, manager }: { player: PlayerData; index: number; manager: MultiplayerManager }) => {
  const isLocal = player.id === manager.getLocalPlayer().id;
  const isHost = manager.isPlayerHost(player.id);
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        isLocal ? 'border-emerald-400/30 bg-emerald-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02]'
      }`}
      style={{ animation: `mlRow 0.3s ease-out ${index * 0.06}s both` }}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm text-white/95 flex-shrink-0"
        style={{ backgroundColor: `#${player.color.toString(16).padStart(6, '0')}` }}
      >
        {player.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">{player.name}</span>
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
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-semibold tracking-wide text-emerald-400/80 uppercase">Connected</span>
        </div>
      </div>
    </div>
  );
};

const ErrorBox = ({ error }: { error: string }) =>
  error ? (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] px-3.5 py-2.5 text-xs text-red-300">
      {error}
    </div>
  ) : null;

// In-lobby name editor.
const NameField = ({ name, onRename }: { name: string; onRename: (n: string) => void }) => {
  const [draft, setDraft] = useState(name);
  useEffect(() => { setDraft(name); }, [name]);
  const trimmed = draft.trim();
  const changed = trimmed.length > 0 && trimmed !== name;
  const commit = () => { if (changed) onRename(trimmed); };
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
        Your Name
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
          className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white
            placeholder-gray-600 focus:outline-none focus:border-emerald-400/50 transition-colors"
        />
        <button
          onClick={commit}
          disabled={!changed}
          className="flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all
            enabled:hover:-translate-y-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ background: changed ? 'linear-gradient(135deg, #34d399, #22c55e)' : 'rgba(255,255,255,0.05)', color: changed ? '#04130a' : '#6b7280' }}
        >
          {changed ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />}
          Save
        </button>
      </div>
    </div>
  );
};

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
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [playerName, setPlayerName] = useState(() => generatePlayerName());
  const [lobbyId, setLobbyId] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [manager, setManager] = useState<MultiplayerManager | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connectedPlayers, setConnectedPlayers] = useState<PlayerData[]>([]);
  const [gameMode, setGameMode] = useState<'coop' | 'survival'>('coop');
  const [difficulty, setDifficulty] = useState<MpDifficulty>('medium');
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

    setPlayerName(localPlayer.name);
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

  // Check URL params on mount for session persistence
  useEffect(() => {
    if (existingManager) return; // already-connected manager is in charge
    if (autoJoinAttemptedRef.current) return;

    const { lobby, role, name } = getURLParams();

    if (lobby && role) {
      autoJoinAttemptedRef.current = true;
      console.log('[MultiplayerLobby] Found session in URL - lobby:', lobby, 'role:', role);

      if (name) {
        setPlayerName(name);
      }

      if (role === 'host') {
        setView('host');
      } else if (role === 'guest') {
        setJoinLobbyId(lobby);
        setView('join');
        setTimeout(() => {
          handleAutoJoin(lobby, name || generatePlayerName());
        }, 100);
      }
    }
  }, []);

  const handleAutoJoin = async (lobbyIdToJoin: string, name: string) => {
    if (!lobbyIdToJoin) return;

    setIsConnecting(true);
    setError('');

    try {
      const newManager = new MultiplayerManager(name);
      await newManager.joinLobby(lobbyIdToJoin);
      setManager(newManager);
      console.log('[MultiplayerLobby] Successfully rejoined lobby:', lobbyIdToJoin);
    } catch (err: any) {
      console.error('[MultiplayerLobby] Failed to rejoin lobby:', err);
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

  // Register game_start handler immediately when manager is created
  useEffect(() => {
    if (!manager) return;

    manager.onMessage('game_start', (data: any) => {
      if (data.gameState) {
        const gameMode = data.gameState.gameMode || 'coop';
        const timeLimit = data.gameState.timeLimit;
        const map = data.gameState.map as MapType | undefined;
        const difficulty = (data.gameState.difficulty as MpDifficulty | undefined) || 'medium';
        onStartGame(manager, gameMode, timeLimit, map, difficulty);
      }
    });

    manager.onMessage('player_rejected', (data: any) => {
      console.log('[MultiplayerLobby] Player rejected:', data.reason);
      setError(data.reason);
      setManager(null);
      setView('menu');
      setIsConnecting(false);
    });
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
      const name = playerName.trim() || generatePlayerName();
      const newManager = new MultiplayerManager(name);
      const id = await newManager.createLobby();
      setLobbyId(id);
      setManager(newManager);
      updateURL({ lobby: id, role: 'host', name });
    } catch (err: any) {
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

    try {
      const name = playerName.trim() || generatePlayerName();
      const newManager = new MultiplayerManager(name);
      await newManager.joinLobby(joinLobbyId);
      setManager(newManager);
      updateURL({ lobby: joinLobbyId, role: 'guest', name });
    } catch (err: any) {
      console.error('Failed to join lobby:', err);
      setError('Failed to join lobby. Please check the ID and try again.');
      clearMultiplayerURL();
    } finally {
      setIsConnecting(false);
    }
  };

  // Rename the local player while in a lobby.
  const handleRename = (newName: string) => {
    if (!manager) return;
    const localId = manager.getLocalPlayer().id;
    const taken = connectedPlayers.some(
      (p) => p.id !== localId && p.name.toLowerCase() === newName.toLowerCase()
    );
    if (taken) {
      setError(`The name "${newName}" is already taken in this lobby.`);
      return;
    }
    manager.updateLocalPlayer({ name: newName });
    setPlayerName(newName);
    setError('');
    updateURL({
      lobby: view === 'host' ? lobbyId : joinLobbyId,
      role: view === 'host' ? 'host' : 'guest',
      name: newName,
    });
  };

  const handleStartGame = () => {
    if (manager && connectedPlayers.length >= 2) {
      onStartGame(manager, gameMode, hasTimeLimit ? timeLimit : undefined, selectedMap, difficulty);
    }
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

  const backdrop = 'fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto';
  const backdropStyle = { background: 'rgba(5,8,10,0.24)', backdropFilter: 'blur(14px) saturate(130%)' } as const;
  const panelClass = 'w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]';
  const panelInnerClass = 'w-full max-w-xl rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col max-h-[94vh]';

  // ── MENU VIEW ───────────────────────────────────────────────────────────
  if (view === 'menu') {
    return (
      <div className={backdrop} style={backdropStyle}>
        <MenuShell variant="multiplayer" />
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
            <div>
              <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
                Player Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={20}
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white
                    placeholder-gray-600 focus:outline-none focus:border-sky-400/50 transition-colors"
                />
                <button
                  onClick={() => setPlayerName(generatePlayerName())}
                  title="Generate a random name"
                  className="flex items-center justify-center w-11 rounded-xl border border-white/10 bg-white/[0.03]
                    text-gray-400 transition-colors hover:text-white hover:bg-white/[0.07]"
                >
                  <Dices className="w-4 h-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>

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
        <MenuShell variant="multiplayer" />
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-5 backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]">
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
        <MenuShell variant="multiplayer" />
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

            {/* Player name editor */}
            <NameField name={playerName} onRename={handleRename} />

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
                  <PlayerRow key={player.id} player={player} index={index} manager={manager} />
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
            <div className="flex gap-2.5">
              <button
                onClick={handleStartGame}
                disabled={connectedPlayers.length < 2}
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
        <Styles />
      </div>
    );
  }

  // ── JOIN FORM ───────────────────────────────────────────────────────────
  if (view === 'join' && !manager) {
    return (
      <div className={backdrop} style={backdropStyle}>
        <MenuShell variant="multiplayer" />
        <div className={panelClass + ' p-6'}
          style={{ animation: 'mlFade 0.35s cubic-bezier(0.16,1,0.3,1) forwards' }}>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/12 mb-3">
              <LogIn className="w-6 h-6 text-sky-400" strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Join Game</h2>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase mb-1.5">
                Your Name
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  maxLength={20}
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white
                    placeholder-gray-600 focus:outline-none focus:border-sky-400/50 transition-colors"
                />
                <button
                  onClick={() => setPlayerName(generatePlayerName())}
                  title="Generate a random name"
                  className="flex items-center justify-center w-11 rounded-xl border border-white/10 bg-white/[0.03]
                    text-gray-400 transition-colors hover:text-white hover:bg-white/[0.07]"
                >
                  <Dices className="w-4 h-4" strokeWidth={2.25} />
                </button>
              </div>
            </div>

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
        <MenuShell variant="multiplayer" />
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)]"
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
            {/* Player name editor */}
            <NameField name={playerName} onRename={handleRename} />

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" strokeWidth={2.25} />
                <span className="text-sm font-semibold text-gray-300">Players</span>
                <span className="text-xs text-gray-500">{connectedPlayers.length} / 8</span>
              </div>
              <div className="space-y-1.5">
                {connectedPlayers.map((player, index) => (
                  <PlayerRow key={player.id} player={player} index={index} manager={manager} />
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
        <Styles />
      </div>
    );
  }

  return null;
};

export default MultiplayerLobby;
