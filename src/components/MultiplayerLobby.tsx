import { useState, useEffect, useRef } from 'react';
import { MultiplayerManager } from '../utils/MultiplayerManager';
import type { PlayerData } from '../utils/MultiplayerManager';
import { MAP_CONFIGS, type MapType } from '../utils/MapSystem';

interface MultiplayerLobbyProps {
  onStartGame: (manager: MultiplayerManager, gameMode: 'coop' | 'survival', timeLimit?: number, map?: MapType) => void;
  onBack: () => void;
  t?: (key: string) => string;
}

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

// Helper to clear multiplayer URL params
const clearMultiplayerURL = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('lobby');
  url.searchParams.delete('role');
  url.searchParams.delete('name');
  window.history.replaceState({}, '', url.toString());
};

// Helper to get URL params
const getURLParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    lobby: params.get('lobby'),
    role: params.get('role') as 'host' | 'guest' | null,
    name: params.get('name')
  };
};

const MultiplayerLobby = ({ onStartGame, onBack }: MultiplayerLobbyProps) => {
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [playerName, setPlayerName] = useState('Player');
  const [lobbyId, setLobbyId] = useState('');
  const [joinLobbyId, setJoinLobbyId] = useState('');
  const [manager, setManager] = useState<MultiplayerManager | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [connectedPlayers, setConnectedPlayers] = useState<PlayerData[]>([]);
  const [gameMode, setGameMode] = useState<'coop' | 'survival'>('coop');
  const [timeLimit, setTimeLimit] = useState<number>(300); // 5 minutes default
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [selectedMap, setSelectedMap] = useState<MapType>('deep_forest');
  const [showMapSelector, setShowMapSelector] = useState(false);
  const lobbyCreatedRef = useRef(false);
  const autoJoinAttemptedRef = useRef(false);

  // Check URL params on mount for session persistence
  useEffect(() => {
    if (autoJoinAttemptedRef.current) return;

    const { lobby, role, name } = getURLParams();

    if (lobby && role) {
      autoJoinAttemptedRef.current = true;
      console.log('[MultiplayerLobby] Found session in URL - lobby:', lobby, 'role:', role);

      // Set player name from URL if available
      if (name) {
        setPlayerName(name);
      }

      if (role === 'host') {
        // For hosts, we need to recreate the lobby (PeerJS assigns new IDs)
        // Just show the host view - they'll need to create a new lobby
        setView('host');
      } else if (role === 'guest') {
        // For guests, try to rejoin the lobby
        setJoinLobbyId(lobby);
        setView('join');
        // Auto-trigger join after a short delay for state to settle
        setTimeout(() => {
          handleAutoJoin(lobby, name || 'Player');
        }, 100);
      }
    }
  }, []);

  // Auto-join handler for guests reconnecting
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
        const players = manager.getAllPlayers();
        setConnectedPlayers(players);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [manager]);

  // CRITICAL FIX: Register game_start handler immediately when manager is created
  useEffect(() => {
    if (!manager) return;

    console.log('[MultiplayerLobby] Registering handlers for guest');

    // Register game_start handler
    manager.onMessage('game_start', (data: any) => {
      console.log('[MultiplayerLobby] ===== GAME_START HANDLER FIRED =====');
      console.log('[MultiplayerLobby] Received game_start, transitioning to game...');
      console.log('[MultiplayerLobby] Data:', data);

      // Call onStartGame to transition to the game
      if (data.gameState) {
        const gameMode = data.gameState.gameMode || 'coop';
        const timeLimit = data.gameState.timeLimit;
        const map = data.gameState.map as MapType | undefined;
        console.log('[MultiplayerLobby] Calling onStartGame with mode:', gameMode, 'map:', map);
        onStartGame(manager, gameMode, timeLimit, map);
      }
    });

    // Register player_rejected handler
    manager.onMessage('player_rejected', (data: any) => {
      console.log('[MultiplayerLobby] Player rejected:', data.reason);
      setError(data.reason);
      setManager(null);
      setView('menu');
      setIsConnecting(false);
    });

    console.log('[MultiplayerLobby] Handlers registered successfully');
  }, [manager, onStartGame]);

  // Create lobby when switching to host view
  useEffect(() => {
    if (view === 'host' && !manager && !lobbyCreatedRef.current && !isConnecting) {
      lobbyCreatedRef.current = true;
      handleCreateLobby();
    }
  }, [view]);

  // NOTE: No cleanup on unmount - manager should persist when game starts
  // Disconnection only happens when user explicitly goes back (see handleBack)

  const handleCreateLobby = async () => {
    setIsConnecting(true);
    setError('');

    try {
      const name = playerName || 'Player';
      const newManager = new MultiplayerManager(name);
      const id = await newManager.createLobby();
      setLobbyId(id);
      setManager(newManager);

      // Update URL for session persistence
      updateURL({ lobby: id, role: 'host', name });
      console.log('[MultiplayerLobby] Created lobby, URL updated for session persistence');
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
      const name = playerName || 'Player';
      const newManager = new MultiplayerManager(name);
      await newManager.joinLobby(joinLobbyId);
      setManager(newManager);

      // Update URL for session persistence
      updateURL({ lobby: joinLobbyId, role: 'guest', name });
      console.log('[MultiplayerLobby] Joined lobby, URL updated for session persistence');
    } catch (err: any) {
      console.error('Failed to join lobby:', err);
      setError('Failed to join lobby. Please check the ID and try again.');
      clearMultiplayerURL();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleStartGame = () => {
    if (manager && connectedPlayers.length >= 2) {
      console.log('[MultiplayerLobby] Host starting game with', connectedPlayers.length, 'players on map:', selectedMap);
      onStartGame(manager, gameMode, hasTimeLimit ? timeLimit : undefined, selectedMap);
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
    alert('Lobby ID copied to clipboard!');
  };

  if (view === 'menu') {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto"
        style={{ background: 'radial-gradient(ellipse at center, rgba(5, 46, 22, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)' }}
      >
        {/* Background glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-blue-500/15 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-green-500/10 blur-[80px] rounded-full pointer-events-none" />

        <div
          className="relative text-center space-y-4 sm:space-y-6 p-4 sm:p-8 max-w-md w-full my-auto"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '1.5rem',
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}
        >
          {/* Title */}
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-blue-500/20 scale-150" />
            <p className="relative text-xs sm:text-sm tracking-[0.2em] text-blue-400/80 text-center mb-1 font-semibold uppercase">
              Online Play
            </p>
            <h1
              className="relative text-3xl sm:text-4xl md:text-5xl font-black text-center"
              style={{
                background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #93c5fd 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.4))',
              }}
            >
              MULTIPLAYER
            </h1>
          </div>

          <div className="space-y-3">
            {/* Player Name Input */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="px-3 py-2 border-b border-white/10">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Player Name</label>
              </div>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm sm:text-base"
                maxLength={20}
              />
            </div>

            {/* Host Game Button */}
            <button
              onClick={() => handleChangeView('host')}
              className="group w-full relative overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-600/90 via-emerald-600/90 to-green-600/90 group-hover:from-green-500 group-hover:via-emerald-500 group-hover:to-green-500 transition-all duration-300" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="absolute inset-0 rounded-xl border-2 border-green-400/50 group-hover:border-green-300/70 transition-colors duration-300" />
              <div className="relative px-6 py-3 sm:py-4 flex items-center justify-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform duration-300">🎮</span>
                <span className="text-base sm:text-xl font-black text-white">HOST GAME</span>
              </div>
            </button>

            {/* Join Game Button */}
            <button
              onClick={() => handleChangeView('join')}
              className="group w-full relative overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/80 via-cyan-600/80 to-blue-600/80 group-hover:from-blue-500/90 group-hover:via-cyan-500/90 group-hover:to-blue-500/90 transition-all duration-300" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="absolute inset-0 rounded-xl border-2 border-blue-400/50 group-hover:border-blue-300/70 transition-colors duration-300" />
              <div className="relative px-6 py-3 sm:py-4 flex items-center justify-center gap-2 sm:gap-3">
                <span className="text-xl sm:text-2xl group-hover:scale-110 transition-transform duration-300">🔗</span>
                <span className="text-base sm:text-xl font-black text-white">JOIN GAME</span>
              </div>
            </button>

            {/* Back Button */}
            <button
              onClick={handleBack}
              className="group w-full relative overflow-hidden rounded-lg transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm group-hover:bg-black/50 transition-colors duration-300" />
              <div className="absolute inset-0 rounded-lg border border-gray-600/40 group-hover:border-gray-500/60 transition-colors duration-300" />
              <div className="relative px-6 py-2 sm:py-2.5 flex items-center justify-center gap-2">
                <span className="text-lg group-hover:-translate-x-1 transition-transform duration-300">←</span>
                <span className="text-sm sm:text-base font-semibold text-gray-400 group-hover:text-gray-300 transition-colors duration-300">BACK</span>
              </div>
            </button>
          </div>

          {error && (
            <div
              className="text-red-400 text-xs sm:text-sm p-3 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show loading state when creating lobby
  if (view === 'host' && isConnecting && !manager) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at center, rgba(5, 46, 22, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)' }}
      >
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-green-500/30 rounded-full mx-auto" />
            <div className="absolute inset-0 w-16 h-16 sm:w-20 sm:h-20 border-4 border-green-500 border-t-transparent rounded-full mx-auto animate-spin" />
          </div>
          <div className="text-green-400 font-semibold text-lg sm:text-xl">Creating lobby...</div>
        </div>
      </div>
    );
  }

  if (view === 'host' && manager) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-900 to-black p-2 sm:p-4 overflow-y-auto">
        <div className="bg-black/70 rounded-xl backdrop-blur-md border-2 border-green-500/40 p-4 sm:p-8 max-w-2xl w-full space-y-4 sm:space-y-6 shadow-2xl my-auto">
          <h2 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent text-center">🎮 LOBBY</h2>

          <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 rounded-lg p-3 sm:p-4 space-y-2 border border-green-500/30">
            <div className="text-green-400 text-xs sm:text-sm font-semibold flex items-center gap-2">
              <span>🔑</span> Lobby ID:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={lobbyId}
                readOnly
                className="flex-1 px-2 sm:px-4 py-2 sm:py-3 bg-gray-900/80 text-green-400 border-2 border-green-500/50 rounded-lg font-mono text-xs sm:text-sm select-all min-w-0"
              />
              <button
                onClick={copyLobbyId}
                className="px-3 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all transform hover:scale-105 active:scale-95 text-sm sm:text-base flex-shrink-0"
              >
                📋 <span className="hidden sm:inline">COPY</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-xl font-bold text-green-400 flex items-center gap-2">
              ⚙️ Game Settings
            </h3>

            <div>
              <label className="block text-green-400 text-xs sm:text-sm mb-2 font-semibold">Game Mode</label>
              <select
                value={gameMode}
                onChange={(e) => setGameMode(e.target.value as 'coop' | 'survival')}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-800/80 text-white border-2 border-green-500/50 rounded-lg focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20 transition-all text-sm sm:text-base"
              >
                <option value="coop">🤝 Co-op Survival (PvE)</option>
                <option value="survival">⚔️ Last Man Standing (PvE)</option>
              </select>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-800/50 rounded-lg border border-green-500/20">
              <input
                type="checkbox"
                id="timeLimit"
                checked={hasTimeLimit}
                onChange={(e) => setHasTimeLimit(e.target.checked)}
                className="w-4 h-4 sm:w-5 sm:h-5 accent-green-500"
              />
              <label htmlFor="timeLimit" className="text-green-400 font-semibold cursor-pointer text-sm sm:text-base">⏱️ Time Limit</label>
            </div>

            {hasTimeLimit && (
              <div className="bg-gray-800/50 rounded-lg p-3 sm:p-4 border border-green-500/20">
                <label className="block text-green-400 text-xs sm:text-sm mb-2 sm:mb-3 font-semibold">
                  Duration: {timeLimit}s ({Math.floor(timeLimit / 60)}m {timeLimit % 60}s)
                </label>
                <input
                  type="range"
                  min="60"
                  max="1800"
                  step="30"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
            )}

            {/* Map Selection */}
            <div>
              <label className="block text-green-400 text-xs sm:text-sm mb-2 font-semibold">🗺️ Map</label>
              <div
                className="bg-gray-800/80 border-2 border-green-500/50 rounded-lg p-2 sm:p-3 cursor-pointer hover:border-green-400 transition-all"
                onClick={() => setShowMapSelector(!showMapSelector)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <span className="text-xl sm:text-2xl flex-shrink-0">{MAP_CONFIGS[selectedMap].icon}</span>
                    <div className="min-w-0">
                      <div className="text-white font-bold text-sm sm:text-base truncate">{MAP_CONFIGS[selectedMap].name}</div>
                      <div className="text-[10px] sm:text-xs text-gray-400 truncate">{MAP_CONFIGS[selectedMap].description.substring(0, 40)}...</div>
                    </div>
                  </div>
                  <span className="text-gray-400 flex-shrink-0 ml-2">{showMapSelector ? '▲' : '▼'}</span>
                </div>
              </div>
              {showMapSelector && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 sm:mt-3 bg-gray-900/80 rounded-lg p-2 sm:p-3 border border-green-500/30">
                  {Object.values(MAP_CONFIGS).map((map) => (
                    <button
                      key={map.id}
                      onClick={() => { setSelectedMap(map.id); setShowMapSelector(false); }}
                      className={`py-2 sm:py-3 px-1 sm:px-2 rounded-lg font-bold transition-all duration-200 ${
                        selectedMap === map.id
                          ? 'bg-green-600 text-white border-2 border-green-400'
                          : 'bg-gray-800/60 text-gray-400 border border-gray-600 hover:border-green-400'
                      }`}
                    >
                      <div className="text-lg sm:text-2xl mb-1">{map.icon}</div>
                      <div className="text-[9px] sm:text-[10px] leading-tight">{map.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 rounded-lg p-3 sm:p-4 border border-green-500/30">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-base sm:text-xl font-bold text-green-400 flex items-center gap-2">
                👥 Players ({connectedPlayers.length}/8)
              </h3>
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-semibold">LOBBY OPEN</span>
              </div>
            </div>
            <div className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto pr-1 sm:pr-2">
              {connectedPlayers.map((player, index) => {
                const isLocalPlayer = player.id === manager.getLocalPlayer().id;
                // Use isPlayerHost for consistent host detection across all views
                const isPlayerHost = manager.isPlayerHost(player.id);
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all ${
                      isLocalPlayer
                        ? 'bg-green-900/40 border-green-500/60 shadow-lg'
                        : 'bg-gray-900/70 border-gray-700 hover:border-green-500/40'
                    }`}
                    style={{ animation: `slideInRight 0.3s ease-out ${index * 0.1}s both` }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white/40 flex items-center justify-center font-bold text-xs sm:text-sm shadow-lg flex-shrink-0"
                        style={{ backgroundColor: `#${player.color.toString(16).padStart(6, '0')}` }}
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                          <span className="text-white font-bold text-sm sm:text-base truncate">{player.name}</span>
                          {isPlayerHost && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-yellow-500/30 text-yellow-300 text-[10px] sm:text-xs font-bold rounded border border-yellow-500/50 flex items-center gap-1 flex-shrink-0">
                              👑 <span className="hidden sm:inline">HOST</span>
                            </span>
                          )}
                          {isLocalPlayer && !isPlayerHost && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-green-500/30 text-green-300 text-[10px] sm:text-xs font-bold rounded border border-green-500/50 flex-shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="text-green-400 text-[10px] sm:text-xs font-semibold">CONNECTED</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {connectedPlayers.length < 8 && (
                <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-900/40 border-2 border-dashed border-gray-600 rounded-lg opacity-60">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-gray-600 flex items-center justify-center">
                    <span className="text-gray-500 text-lg sm:text-xl">+</span>
                  </div>
                  <span className="text-gray-500 text-xs sm:text-sm italic">Waiting for players...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 sm:gap-4">
            <button
              onClick={handleStartGame}
              disabled={connectedPlayers.length < 2}
              className="flex-1 px-4 sm:px-8 py-3 sm:py-4 text-base sm:text-xl font-bold text-black bg-gradient-to-r from-green-400 to-green-600 rounded-lg hover:from-green-500 hover:to-green-700 transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shadow-lg hover:shadow-green-500/50"
            >
              🚀 <span className="hidden sm:inline">START </span>GAME
            </button>
            <button
              onClick={handleBack}
              className="px-4 sm:px-8 py-3 sm:py-4 text-base sm:text-xl font-bold text-gray-400 bg-gray-800/50 rounded-lg border border-gray-600/50 hover:border-gray-500 hover:bg-gray-700/50 transition-all"
            >
              ❌ <span className="hidden sm:inline">CANCEL</span>
            </button>
          </div>

          {connectedPlayers.length < 2 && (
            <div className="text-center text-yellow-400 text-xs sm:text-sm bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-2 sm:p-3 animate-pulse">
              ⏳ Need at least 2 players to start (Current: {connectedPlayers.length})
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'join' && !manager) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto"
        style={{ background: 'radial-gradient(ellipse at center, rgba(5, 46, 22, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)' }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-cyan-500/15 blur-[100px] rounded-full pointer-events-none" />

        <div
          className="relative text-center space-y-4 sm:space-y-6 p-4 sm:p-8 max-w-md w-full my-auto"
          style={{
            background: 'linear-gradient(135deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.4) 100%)',
            backdropFilter: 'blur(20px)',
            borderRadius: '1.5rem',
            border: '1px solid rgba(6, 182, 212, 0.3)',
          }}
        >
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-cyan-500/20 scale-150" />
            <h2
              className="relative text-2xl sm:text-4xl font-black"
              style={{
                background: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #67e8f9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 20px rgba(6, 182, 212, 0.4))',
              }}
            >
              🔗 JOIN GAME
            </h2>
          </div>

          <div className="space-y-3">
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="px-3 py-2 border-b border-white/10">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lobby ID</label>
              </div>
              <input
                type="text"
                value={joinLobbyId}
                onChange={(e) => setJoinLobbyId(e.target.value)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-transparent text-cyan-400 placeholder-gray-500 focus:outline-none font-mono text-xs sm:text-sm"
                placeholder="Paste lobby ID here..."
              />
            </div>

            <button
              onClick={handleJoinLobby}
              disabled={isConnecting || !joinLobbyId.trim()}
              className="group w-full relative overflow-hidden rounded-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/90 via-blue-600/90 to-cyan-600/90 group-hover:from-cyan-500 group-hover:via-blue-500 group-hover:to-cyan-500 transition-all duration-300" />
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="absolute inset-0 rounded-xl border-2 border-cyan-400/50 group-hover:border-cyan-300/70 transition-colors duration-300" />
              <div className="relative px-6 py-3 sm:py-4 flex items-center justify-center gap-2">
                {isConnecting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span className="text-base sm:text-xl font-black text-white">CONNECTING...</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl sm:text-2xl">🚀</span>
                    <span className="text-base sm:text-xl font-black text-white">JOIN</span>
                  </>
                )}
              </div>
            </button>

            <button
              onClick={() => handleChangeView('menu')}
              className="group w-full relative overflow-hidden rounded-lg transition-all duration-300 hover:scale-105 active:scale-95"
            >
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm group-hover:bg-black/50 transition-colors duration-300" />
              <div className="absolute inset-0 rounded-lg border border-gray-600/40 group-hover:border-gray-500/60 transition-colors duration-300" />
              <div className="relative px-6 py-2 sm:py-2.5 flex items-center justify-center gap-2">
                <span className="text-lg group-hover:-translate-x-1 transition-transform duration-300">←</span>
                <span className="text-sm sm:text-base font-semibold text-gray-400 group-hover:text-gray-300 transition-colors duration-300">BACK</span>
              </div>
            </button>
          </div>

          {error && (
            <div
              className="text-red-400 text-xs sm:text-sm p-3 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Waiting for host to start game
  if (view === 'join' && manager) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-900 to-black p-2 sm:p-4 overflow-y-auto">
        <div className="bg-black/70 rounded-xl backdrop-blur-md border-2 border-green-500/40 p-4 sm:p-8 max-w-2xl w-full space-y-4 sm:space-y-6 shadow-2xl my-auto">
          <h2 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent text-center">🎮 LOBBY</h2>

          <div className="bg-gradient-to-br from-gray-800/70 to-gray-900/70 rounded-lg p-3 sm:p-4 border border-green-500/30">
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h3 className="text-base sm:text-xl font-bold text-green-400 flex items-center gap-2">
                👥 Players ({connectedPlayers.length}/8)
              </h3>
              <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-semibold">CONNECTED</span>
              </div>
            </div>
            <div className="space-y-2 max-h-48 sm:max-h-64 overflow-y-auto pr-1 sm:pr-2">
              {connectedPlayers.map((player, index) => {
                const isLocalPlayer = player.id === manager.getLocalPlayer().id;
                // Determine if player is host using the actual hostId from game state
                const isPlayerHost = manager.isPlayerHost(player.id);
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all ${
                      isLocalPlayer
                        ? 'bg-green-900/40 border-green-500/60 shadow-lg'
                        : 'bg-gray-900/70 border-gray-700 hover:border-green-500/40'
                    }`}
                    style={{ animation: `slideInRight 0.3s ease-out ${index * 0.1}s both` }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white/40 flex items-center justify-center font-bold text-xs sm:text-sm shadow-lg flex-shrink-0"
                        style={{ backgroundColor: `#${player.color.toString(16).padStart(6, '0')}` }}
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                          <span className="text-white font-bold text-sm sm:text-base truncate">{player.name}</span>
                          {isPlayerHost && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-yellow-500/30 text-yellow-300 text-[10px] sm:text-xs font-bold rounded border border-yellow-500/50 flex items-center gap-1 flex-shrink-0">
                              👑 <span className="hidden sm:inline">HOST</span>
                            </span>
                          )}
                          {isLocalPlayer && !isPlayerHost && (
                            <span className="px-1.5 sm:px-2 py-0.5 bg-green-500/30 text-green-300 text-[10px] sm:text-xs font-bold rounded border border-green-500/50 flex-shrink-0">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 mt-0.5">
                          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                          <span className="text-green-400 text-[10px] sm:text-xs font-semibold">CONNECTED</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="text-center space-y-2 sm:space-y-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-2 border-blue-500/40 rounded-lg p-4 sm:p-6">
            <div className="text-2xl sm:text-3xl animate-bounce">⏳</div>
            <div className="text-blue-300 font-bold text-base sm:text-xl">Waiting for Host</div>
            <div className="text-gray-300 text-xs sm:text-sm">The game will start when the host is ready</div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
            </div>
          </div>

          <button
            onClick={handleBack}
            className="w-full px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg font-bold text-gray-400 bg-gray-800/50 rounded-lg border border-gray-600/50 hover:border-gray-500 hover:bg-gray-700/50 transition-all transform hover:scale-105 active:scale-95"
          >
            🚪 LEAVE LOBBY
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default MultiplayerLobby;
