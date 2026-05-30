import Peer from 'peerjs';

// Infer DataConnection type from Peer.connect() return type
type DataConnection = ReturnType<Peer['connect']>;
import * as THREE from 'three';
import { clamp, MAX_MP_KILLS, MAX_MP_DEATHS, MAX_MP_SCORE, AVATAR_COUNT } from '../../convex/gameLimits';

/** 8 unique player-model classes the lobby allows picking from. */
export type ModelClassId =
  | 'ranger' | 'scout' | 'heavy' | 'operative'
  | 'pyro'   | 'medic' | 'engineer' | 'phantom';

export interface PlayerData {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  health: number;
  maxHealth: number;
  kills: number;
  deaths: number;
  score: number;
  currentWeapon: string;
  isAlive: boolean;
  color: number;
  /** Lobby-picked character class. Undefined → auto-assign at game start. */
  modelClass?: ModelClassId;
  lastHeartbeat?: number; // For connection health monitoring
  /** Account rank tier index (0=Bronze…5=Master), broadcast so peers show a badge. */
  rankTier?: number;
  /** Account level, broadcast for display. */
  level?: number;
  /** Predefined avatar index, broadcast so peers render the right avatar. */
  avatarIndex?: number;
}

/**
 * Compact wire format for one shared enemy in a host→guest `enemy_sync`
 * snapshot. Field names are short to keep the per-frame payload small:
 *   id = stable network id   ty = type code (0 normal,1 fast,2 tank,3 boss)
 *   x/y/z = world position    ry = body yaw
 *   hp = current health       mx = max health        d = dead flag (0|1)
 */
export interface EnemyWire {
  id: number;
  ty: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  hp: number;
  mx: number;
  d: 0 | 1;
}

export interface GameState {
  players: Map<string, PlayerData>;
  gameMode: 'coop' | 'survival';
  timeLimit?: number; // seconds
  startTime?: number;
  hostId: string;
  map?: string; // Map ID for session persistence
  difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive'; // Host-selected difficulty
}

/**
 * Wire-format GameState — the same shape as `GameState` but with the
 * players Map flattened to an array so it survives JSON round-trips
 * across PeerJS. Sent inside game_start / game_restart / return_to_lobby
 * messages and rehydrated to a Map on the receiving side.
 */
export interface SerializedGameState extends Omit<GameState, 'players'> {
  players: PlayerData[];
}

export type NetworkMessage =
  | { type: 'player_update'; data: PlayerData }
  | { type: 'player_joined'; data: PlayerData }
  | { type: 'player_left'; playerId: string }
  | { type: 'player_rejected'; reason: string }
  | { type: 'game_start'; gameState: Partial<SerializedGameState> }
  | { type: 'game_restart'; gameState: Partial<SerializedGameState> }
  | { type: 'return_to_lobby'; gameState: Partial<SerializedGameState> }
  | { type: 'game_over'; winnerId: string; finalStats: PlayerData[] }
  | { type: 'enemy_killed'; playerId: string }
  // ── Shared-enemy (host-authoritative) sync ──
  // Host broadcasts the full living-enemy set to all guests several times a
  // second; guests render/interpolate from it instead of spawning their own.
  | { type: 'enemy_sync'; enemies: EnemyWire[]; wave: number }
  // Guest → host: "my bullet hit shared enemy N for D damage". Host (the only
  // authority on enemy health) applies it and may award the kill.
  | { type: 'enemy_hit'; netId: number; damage: number; isCritical: boolean; shooterId: string }
  // Host → all: a shared enemy died and the kill belongs to `killerId`. The
  // credited player's client scores it locally.
  | { type: 'enemy_kill_credit'; netId: number; killerId: string; scoreValue: number; isCritical: boolean }
  // Host → target guest: a shared enemy struck you for `damage`.
  | { type: 'player_damaged'; targetId: string; damage: number; enemyType: string }
  | { type: 'player_shot'; shooterId: string; targetId: string; damage: number }
  | { type: 'player_killed'; victimId: string; victimName: string; victimColor: number; killerId: string; killerName: string; weapon: string; timestamp: number }
  | { type: 'chat_message'; playerId: string; playerName: string; playerColor: number; message: string; messageType: 'chat' | 'emote'; timestamp: number }
  | { type: 'heartbeat'; playerId: string; timestamp: number };

// Throttle configuration - reduces network load significantly
const POSITION_UPDATE_INTERVAL = 66; // ~15 updates per second (down from 60)
const HEARTBEAT_INTERVAL = 2000; // Send heartbeat every 2 seconds
const CONNECTION_TIMEOUT = 10000; // Consider connection dead after 10 seconds without heartbeat

/**
 * Best-effort clamp of a peer-reported PlayerData snapshot. Multiplayer is P2P
 * (no authoritative server), so peers are untrusted — this rejects clearly
 * impossible values (negative/NaN, health above max, scores/kills above match
 * caps) so trivial packet tampering can't corrupt scoreboards. It does NOT make
 * P2P cheat-proof; that needs an authoritative server.
 */
function sanitizeRemotePlayer(data: PlayerData): PlayerData {
  const maxHealth = clamp(data.maxHealth ?? 100, 1, 1000);
  return {
    ...data,
    maxHealth,
    health: clamp(data.health ?? 0, 0, maxHealth),
    kills: clamp(data.kills ?? 0, 0, MAX_MP_KILLS),
    deaths: clamp(data.deaths ?? 0, 0, MAX_MP_DEATHS),
    score: clamp(data.score ?? 0, 0, MAX_MP_SCORE),
    rankTier: data.rankTier === undefined ? undefined : clamp(data.rankTier, 0, 5),
    level: data.level === undefined ? undefined : clamp(data.level, 1, 100000),
    avatarIndex: data.avatarIndex === undefined ? undefined : clamp(data.avatarIndex, 0, AVATAR_COUNT - 1),
  };
}

export class MultiplayerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private localPlayer: PlayerData;
  private remotePlayers: Map<string, PlayerData> = new Map();
  private isHost: boolean = false;
  private gameState: GameState | null = null;
  private messageHandlers: Map<string, Set<(data: unknown) => void>> = new Map(); // Changed to Set for deduplication

  // Throttling state
  private lastPositionUpdate: number = 0;
  private pendingPositionUpdate: { position: THREE.Vector3; rotation: THREE.Euler } | null = null;
  private positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  // Connection health monitoring
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Connection status callback
  private onConnectionStatusChange: ((playerId: string, status: 'connected' | 'disconnected' | 'timeout') => void) | null = null;

  constructor(playerName: string) {
    this.localPlayer = {
      id: '',
      name: playerName,
      position: { x: 0, y: 5, z: 10 },
      rotation: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      kills: 0,
      deaths: 0,
      score: 0,
      currentWeapon: 'pistol',
      isAlive: true,
      color: this.getRandomPlayerColor(),
      lastHeartbeat: Date.now()
    };
  }

  /**
   * Attach the local player's account identity (rank/level/avatar) so it
   * broadcasts to peers. Call before createLobby/joinLobby.
   */
  setProfileMeta(meta: { rankTier?: number; level?: number; avatarIndex?: number }): void {
    if (meta.rankTier !== undefined) this.localPlayer.rankTier = meta.rankTier;
    if (meta.level !== undefined) this.localPlayer.level = meta.level;
    if (meta.avatarIndex !== undefined) this.localPlayer.avatarIndex = meta.avatarIndex;
  }

  private getRandomPlayerColor(): number {
    const colors = [
      0x00ff00, // Green
      0x0099ff, // Blue
      0xff9900, // Orange
      0xff00ff, // Magenta
      0xffff00, // Yellow
      0x00ffff, // Cyan
      0xff0099, // Pink
      0x99ff00  // Lime
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  async createLobby(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        this.localPlayer.id = id;
        this.localPlayer.lastHeartbeat = Date.now();
        this.isHost = true;

        // Initialize game state
        this.gameState = {
          players: new Map([[id, this.localPlayer]]),
          gameMode: 'coop',
          hostId: id
        };

        // Start heartbeat and connection monitoring
        this.startHeartbeat();
        this.startConnectionMonitoring();

        console.log('Lobby created with ID:', id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.handleNewConnection(conn);
      });

      this.peer.on('error', (err: unknown) => {
        const error = err as { type?: string; message?: string };
        // Suppress "Lost connection to server" errors as they're not critical
        if (error.type === 'network' || error.message?.includes('Lost connection')) {
          // Silent ignore - PeerJS reconnects automatically
          return;
        }
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  /**
   * Start sending heartbeats to all connected peers
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.broadcastMessage({
        type: 'heartbeat',
        playerId: this.localPlayer.id,
        timestamp: Date.now()
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Start monitoring connection health
   */
  private startConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }

    this.connectionCheckInterval = setInterval(() => {
      const now = Date.now();

      this.remotePlayers.forEach((player, playerId) => {
        const lastHeartbeat = player.lastHeartbeat || 0;
        if (now - lastHeartbeat > CONNECTION_TIMEOUT) {
          console.warn(`[MultiplayerManager] Player ${player.name} (${playerId}) timed out`);

          // Notify about timeout
          if (this.onConnectionStatusChange) {
            this.onConnectionStatusChange(playerId, 'timeout');
          }

          // Remove the timed out player
          this.remotePlayers.delete(playerId);
          if (this.gameState) {
            this.gameState.players.delete(playerId);
          }

          // Notify handlers about player leaving
          const handlers = this.messageHandlers.get('player_left');
          if (handlers) {
            handlers.forEach(handler => handler({ type: 'player_left', playerId }));
          }
        }
      });
    }, 3000); // Check every 3 seconds
  }

  /**
   * Set callback for connection status changes
   */
  setConnectionStatusCallback(callback: (playerId: string, status: 'connected' | 'disconnected' | 'timeout') => void): void {
    this.onConnectionStatusChange = callback;
  }

  async joinLobby(lobbyId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();

      this.peer.on('open', (id) => {
        this.localPlayer.id = id;
        this.localPlayer.lastHeartbeat = Date.now();
        this.isHost = false;

        const conn = this.peer!.connect(lobbyId);

        conn.on('open', () => {
          this.handleNewConnection(conn);

          // Send join request
          this.sendMessage(conn, {
            type: 'player_joined',
            data: this.localPlayer
          });

          // Start heartbeat and connection monitoring
          this.startHeartbeat();
          this.startConnectionMonitoring();

          console.log('Joined lobby:', lobbyId);
          resolve();
        });

        conn.on('error', (err) => {
          console.error('Connection error:', err);
          reject(err);
        });
      });

      this.peer.on('error', (err: unknown) => {
        const error = err as { type?: string; message?: string };
        // Suppress "Lost connection to server" errors as they're not critical
        if (error.type === 'network' || error.message?.includes('Lost connection')) {
          // Silent ignore - PeerJS reconnects automatically
          return;
        }
        console.error('Peer error:', err);
        reject(err);
      });
    });
  }

  private handleNewConnection(conn: DataConnection) {
    this.connections.set(conn.peer, conn);

    conn.on('data', (data: unknown) => {
      this.handleMessage(data as NetworkMessage, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.remotePlayers.delete(conn.peer);

      // Notify others about player leaving
      this.broadcastMessage({
        type: 'player_left',
        playerId: conn.peer
      });

      console.log('Player disconnected:', conn.peer);
    });
  }

  private handleMessage(message: NetworkMessage, conn: DataConnection) {
    switch (message.type) {
      case 'heartbeat': {
        // Update last heartbeat time for this player
        const heartbeatPlayer = this.remotePlayers.get(message.playerId);
        if (heartbeatPlayer) {
          heartbeatPlayer.lastHeartbeat = Date.now();
        }
        // Don't log heartbeats to reduce console spam
        return;
      }

      case 'player_joined':
        // Clamp untrusted peer-reported fields before storing/relaying.
        message.data = sanitizeRemotePlayer(message.data);
        console.log('[MultiplayerManager] Player join request:', message.data.name);

        if (this.isHost && this.gameState) {
          // Check for duplicate names (case- and whitespace-insensitive)
          const incomingName = (message.data.name || '').trim().toLowerCase();
          const existingPlayerWithName = Array.from(this.gameState.players.values())
            .find(p => (p.name || '').trim().toLowerCase() === incomingName);

          if (existingPlayerWithName) {
            console.log('[MultiplayerManager] Rejecting player - duplicate name:', message.data.name);
            // Reject the player
            this.sendMessage(conn, {
              type: 'player_rejected',
              reason: `A player with the name "${message.data.name}" is already in this lobby. Please choose a different name.`
            });
            // Close the connection
            setTimeout(() => conn.close(), 100);
            return;
          }

          // Name is unique, accept player
          console.log('[MultiplayerManager] Accepting player:', message.data.name);
          message.data.lastHeartbeat = Date.now();
          this.remotePlayers.set(message.data.id, message.data);

          // Add new player to game state
          this.gameState.players.set(message.data.id, message.data);

          // ONLY send game_start if game has actually started (startTime is set)
          // This prevents auto-starting when players join the lobby
          // Note: startTime is undefined (not null) when game hasn't started, so use truthy check
          if (this.gameState.startTime) {
            console.log('[MultiplayerManager] Game already in progress, sending game state to new player');
            this.sendMessage(conn, {
              type: 'game_start',
              gameState: {
                players: Array.from(this.gameState.players.values()),
                gameMode: this.gameState.gameMode,
                timeLimit: this.gameState.timeLimit,
                startTime: this.gameState.startTime,
                hostId: this.gameState.hostId
                      }
            });
          } else {
            console.log('[MultiplayerManager] Game not started yet, player added to lobby');
            // Send current player list to the joining player so they see everyone in lobby
            this.sendPlayerListToNewPlayer(conn);
          }

          // Notify other players
          this.broadcastMessage(message, conn.peer);
        } else {
          // Not host, just add to remote players
          this.remotePlayers.set(message.data.id, message.data);
        }

        // Forward to registered handlers for chat system
        {
          const playerJoinedHandlers = this.messageHandlers.get('player_joined');
          if (playerJoinedHandlers) {
            playerJoinedHandlers.forEach(handler => handler(message));
          }
        }
        break;

      case 'player_update': {
        // Clamp untrusted peer-reported fields before storing/relaying.
        message.data = sanitizeRemotePlayer(message.data);

        // Track alive-state transitions before replacing snapshots
        const prevState = this.gameState?.players.get(message.data.id);
        const wasAlive = prevState ? prevState.isAlive : true;

        // Update heartbeat time when we receive position updates
        message.data.lastHeartbeat = Date.now();
        this.remotePlayers.set(message.data.id, message.data);

        // Keep authoritative game-state map in sync (important for game over/final stats)
        if (this.gameState) {
          this.gameState.players.set(message.data.id, message.data);
        }

        // Guests only send updates to host; host must relay them to other guests
        if (this.isHost) {
          this.broadcastMessage(message, conn.peer);

          // Re-evaluate multiplayer end conditions when a remote player dies.
          if (wasAlive && !message.data.isAlive) {
            this.checkGameOver();
          }
        }

        // Forward to registered handlers so leaderboards / HUDs reflect a
        // player's kills, score and health the instant the update arrives —
        // no polling delay.
        {
          const playerUpdateHandlers = this.messageHandlers.get('player_update');
          if (playerUpdateHandlers) {
            playerUpdateHandlers.forEach(handler => handler(message));
          }
        }
        break;
      }

      case 'player_left':
        this.remotePlayers.delete(message.playerId);
        if (this.gameState) {
          this.gameState.players.delete(message.playerId);
        }

        // Forward to registered handlers for chat system
        {
          const playerLeftHandlers = this.messageHandlers.get('player_left');
          if (playerLeftHandlers) {
            playerLeftHandlers.forEach(handler => handler(message));
          }
        }
        break;

      case 'player_rejected': {
        console.log('[MultiplayerManager] Player rejected by host:', message.reason);
        // Forward to registered handlers so lobby can show error
        const playerRejectedHandlers = this.messageHandlers.get('player_rejected');
        if (playerRejectedHandlers) {
          playerRejectedHandlers.forEach(handler => handler(message));
        }
        break;
      }

      case 'game_start':
        console.log('[MultiplayerManager] ===== Received game_start message =====');
        console.log('[MultiplayerManager] Message:', JSON.stringify(message, null, 2));
        console.log('[MultiplayerManager] isHost:', this.isHost);

        if (message.gameState) {
          // Reconstruct players Map from the wire-format array
          const playersMap = new Map<string, PlayerData>();
          if (Array.isArray(message.gameState.players)) {
            console.log(`Reconstructing players map from array (${message.gameState.players.length} players)`);
            message.gameState.players.forEach((player) => {
              playersMap.set(player.id, player);
            });
          }

          this.gameState = {
            ...message.gameState,
            players: playersMap
          } as GameState;

          // Populate remote players from game state
          playersMap.forEach((player, id) => {
            if (id !== this.localPlayer.id) {
              this.remotePlayers.set(id, player);
            }
          });

          console.log(`Game state updated - Mode: ${this.gameState.gameMode}, Local players: ${playersMap.size}, Remote players: ${this.remotePlayers.size}`);
        }

        // Forward to registered handlers so App.tsx can start the game
        {
          const gameStartHandlers = this.messageHandlers.get('game_start');
          if (gameStartHandlers && gameStartHandlers.size > 0) {
            console.log(`Forwarding game_start to ${gameStartHandlers.size} registered handler(s)`);
            gameStartHandlers.forEach(handler => handler(message));
          } else {
            console.warn('No game_start handler registered!');
          }
        }
        break;

      case 'game_restart': {
        console.log('[MultiplayerManager] ===== Received game_restart message =====');

        if (message.gameState) {
          const playersMap = new Map<string, PlayerData>();
          if (Array.isArray(message.gameState.players)) {
            message.gameState.players.forEach((player) => {
              playersMap.set(player.id, player);
            });
          }

          // Reset local player stats from the fresh state
          const freshLocal = playersMap.get(this.localPlayer.id);
          if (freshLocal) {
            this.localPlayer.health = freshLocal.health;
            this.localPlayer.maxHealth = freshLocal.maxHealth;
            this.localPlayer.isAlive = true;
            this.localPlayer.kills = 0;
            this.localPlayer.deaths = 0;
            this.localPlayer.score = 0;
          }

          this.gameState = {
            ...message.gameState,
            players: playersMap
          } as GameState;

          // Update remote players
          this.remotePlayers.clear();
          playersMap.forEach((player, id) => {
            if (id !== this.localPlayer.id) {
              this.remotePlayers.set(id, player);
            }
          });
        }

        const restartHandlers = this.messageHandlers.get('game_restart');
        if (restartHandlers) {
          restartHandlers.forEach(handler => handler(message));
        }
        break;
      }

      case 'return_to_lobby': {
        console.log('[MultiplayerManager] ===== Received return_to_lobby message =====');

        if (message.gameState) {
          const playersMap = new Map<string, PlayerData>();
          if (Array.isArray(message.gameState.players)) {
            message.gameState.players.forEach((player) => {
              playersMap.set(player.id, player);
            });
          }

          // Reset local player to fresh lobby state
          this.localPlayer.health = this.localPlayer.maxHealth;
          this.localPlayer.isAlive = true;
          this.localPlayer.kills = 0;
          this.localPlayer.deaths = 0;
          this.localPlayer.score = 0;

          this.gameState = {
            ...message.gameState,
            players: playersMap,
            startTime: undefined, // clear startTime so the lobby reads as not-in-game
          } as GameState;

          // Re-sync remote players from the server-authoritative snapshot
          this.remotePlayers.clear();
          playersMap.forEach((player, id) => {
            if (id !== this.localPlayer.id) {
              this.remotePlayers.set(id, player);
            }
          });
        }

        const lobbyHandlers = this.messageHandlers.get('return_to_lobby');
        if (lobbyHandlers) {
          lobbyHandlers.forEach(handler => handler(message));
        }
        break;
      }

      case 'game_over': {
        // Forward to registered handlers
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }
        break;
      }

      case 'enemy_killed':
      case 'player_shot':
      case 'player_killed':
      case 'chat_message': {
        // Guests send these to host; relay to all other guests for full lobby sync
        if (this.isHost) {
          this.broadcastMessage(message, conn.peer);
        }

        // Forward to registered handlers
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }
        break;
      }

      // Shared-enemy traffic. Star topology means host↔guest is a direct link,
      // so these are never relayed — they go straight to the registered
      // handlers (enemy_hit lands on the host; the rest land on guests).
      case 'enemy_sync':
      case 'enemy_hit':
      case 'enemy_kill_credit':
      case 'player_damaged': {
        const handlers = this.messageHandlers.get(message.type);
        if (handlers) {
          handlers.forEach(handler => handler(message));
        }
        break;
      }
    }
  }

  private sendMessage(conn: DataConnection, message: NetworkMessage) {
    try {
      conn.send(message);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }

  private sendPlayerListToNewPlayer(conn: DataConnection) {
    // Send all existing players to the newly joined player
    // so they can see everyone in the lobby
    if (!this.gameState) return;

    console.log('[MultiplayerManager] Sending existing player list to new player');
    this.gameState.players.forEach((player, playerId) => {
      if (playerId !== conn.peer) {
        this.sendMessage(conn, {
          type: 'player_joined',
          data: player
        });
      }
    });
  }

  broadcastMessage(message: NetworkMessage, excludePeerId?: string) {
    const targetCount = Array.from(this.connections.keys()).filter(id => id !== excludePeerId).length;
    console.log(`[MultiplayerManager] Broadcasting ${message.type} to ${targetCount} connection(s)`, excludePeerId ? `(excluding ${excludePeerId})` : '');
    console.log(`[MultiplayerManager] Total connections: ${this.connections.size}`);
    console.log(`[MultiplayerManager] Connection IDs:`, Array.from(this.connections.keys()));

    let sentCount = 0;
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId) {
        console.log(`[MultiplayerManager]  -> Sending ${message.type} to peer ${peerId}, connection open:`, conn.open);
        this.sendMessage(conn, message);
        sentCount++;
      }
    });
    console.log(`[MultiplayerManager] Successfully sent to ${sentCount} peers`);
  }

  updateLocalPlayer(updates: Partial<PlayerData>) {
    Object.assign(this.localPlayer, updates);

    // Keep game-state players map synced with local player snapshot
    if (this.gameState) {
      this.gameState.players.set(this.localPlayer.id, this.localPlayer);
    }

    // Broadcast update to all connected players
    this.broadcastMessage({
      type: 'player_update',
      data: this.localPlayer
    });
  }

  /**
   * Update player position with throttling to reduce network load
   * Instead of sending 60 updates/sec, we send ~15 updates/sec
   */
  updatePlayerPosition(position: THREE.Vector3, rotation: THREE.Euler) {
    const now = Date.now();

    // Store the pending update
    this.pendingPositionUpdate = { position: position.clone(), rotation: rotation.clone() };

    // Check if enough time has passed since last update
    if (now - this.lastPositionUpdate >= POSITION_UPDATE_INTERVAL) {
      this.sendThrottledPositionUpdate();
    } else if (!this.positionUpdateTimer) {
      // Schedule an update for when the interval passes
      const timeUntilNextUpdate = POSITION_UPDATE_INTERVAL - (now - this.lastPositionUpdate);
      this.positionUpdateTimer = setTimeout(() => {
        this.sendThrottledPositionUpdate();
      }, timeUntilNextUpdate);
    }
  }

  /**
   * Send the pending position update
   */
  private sendThrottledPositionUpdate(): void {
    if (this.positionUpdateTimer) {
      clearTimeout(this.positionUpdateTimer);
      this.positionUpdateTimer = null;
    }

    if (this.pendingPositionUpdate) {
      const { position, rotation } = this.pendingPositionUpdate;
      this.updateLocalPlayer({
        position: { x: position.x, y: position.y, z: position.z },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
      });
      this.lastPositionUpdate = Date.now();
      this.pendingPositionUpdate = null;
    }
  }

  /**
   * Force send position update immediately (for important updates)
   */
  forcePositionUpdate(position: THREE.Vector3, rotation: THREE.Euler): void {
    if (this.positionUpdateTimer) {
      clearTimeout(this.positionUpdateTimer);
      this.positionUpdateTimer = null;
    }

    this.updateLocalPlayer({
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z }
    });
    this.lastPositionUpdate = Date.now();
    this.pendingPositionUpdate = null;
  }

  updatePlayerHealth(health: number) {
    const wasAlive = this.localPlayer.isAlive;
    this.localPlayer.isAlive = health > 0;

    if (wasAlive && !this.localPlayer.isAlive) {
      this.localPlayer.deaths++;
    }

    this.updateLocalPlayer({ health, isAlive: this.localPlayer.isAlive });

    // Check game over conditions
    if (!this.localPlayer.isAlive) {
      this.checkGameOver();
    }
  }

  incrementKills() {
    this.localPlayer.kills++;
    this.updateLocalPlayer({ kills: this.localPlayer.kills });

    this.broadcastMessage({
      type: 'enemy_killed',
      playerId: this.localPlayer.id
    });
  }

  // ─── SHARED-ENEMY HELPERS ─────────────────────────────────────────────────
  // Thin wrappers over broadcastMessage so App.tsx stays declarative about the
  // host-authoritative enemy protocol.

  /** Host → all guests: the full living-enemy snapshot for this tick. */
  broadcastEnemySync(enemies: EnemyWire[], wave: number): void {
    this.broadcastMessage({ type: 'enemy_sync', enemies, wave });
  }

  /** Guest → host: report a bullet hit on a shared enemy. */
  sendEnemyHit(netId: number, damage: number, isCritical: boolean): void {
    this.broadcastMessage({
      type: 'enemy_hit', netId, damage, isCritical, shooterId: this.localPlayer.id,
    });
  }

  /** Host → all: award a shared-enemy kill to `killerId`. */
  broadcastEnemyKillCredit(killerId: string, netId: number, scoreValue: number, isCritical: boolean): void {
    this.broadcastMessage({ type: 'enemy_kill_credit', killerId, netId, scoreValue, isCritical });
  }

  /** Host → target guest: a shared enemy struck them for `damage`. */
  sendPlayerDamage(targetId: string, damage: number, enemyType: string): void {
    this.broadcastMessage({ type: 'player_damaged', targetId, damage, enemyType });
  }

  private checkGameOver() {
    if (!this.gameState) return;

    console.log('[MultiplayerManager] Checking game over conditions...');

    const allPlayers = Array.from(this.gameState.players.values());
    const alivePlayers = allPlayers.filter(p => p.isAlive);

    console.log(`[MultiplayerManager] Alive: ${alivePlayers.length}/${allPlayers.length}`);

    let shouldEndGame = false;

    // Game ends when all players are dead OR only one player remains in survival mode
    if (alivePlayers.length === 0) {
      shouldEndGame = true;
      console.log('[MultiplayerManager] All players dead - game over');
    } else if (alivePlayers.length === 1 && allPlayers.length > 1 && this.gameState.gameMode === 'survival') {
      shouldEndGame = true;
      console.log('[MultiplayerManager] Last player standing in survival mode - game over');
    }

    // Only host broadcasts game over
    if (shouldEndGame && this.isHost) {
      // Winner is ALWAYS the player with the most kills
      const sortedByKills = [...allPlayers].sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return b.score - a.score; // Tiebreaker: higher score
      });
      const winner = sortedByKills[0];

      console.log(`[MultiplayerManager] Winner (most kills): ${winner.name} with ${winner.kills} kills`);
      console.log('[MultiplayerManager] Broadcasting game_over message');

      const finalStats = Array.from(this.gameState.players.values());
      const gameOverMessage = {
        type: 'game_over' as const,
        winnerId: winner.id,
        finalStats
      };

      // Broadcast to all other players
      this.broadcastMessage(gameOverMessage);

      // Also trigger the handlers locally for the host
      const gameOverHandlers = this.messageHandlers.get('game_over');
      if (gameOverHandlers) {
        console.log('[MultiplayerManager] Triggering game_over handlers for host');
        gameOverHandlers.forEach(handler => handler(gameOverMessage));
      }
    }
  }

  /**
   * Reset per-match stats (health/kills/deaths/score/alive) for all players.
   * Call before restarting a game to reuse the same lobby.
   */
  resetGameStats() {
    // Reset local player stats
    this.localPlayer.health = this.localPlayer.maxHealth;
    this.localPlayer.isAlive = true;
    this.localPlayer.kills = 0;
    this.localPlayer.deaths = 0;
    this.localPlayer.score = 0;
    this.localPlayer.lastHeartbeat = Date.now();

    // Reset remote player stats
    this.remotePlayers.forEach(player => {
      player.health = player.maxHealth;
      player.isAlive = true;
      player.kills = 0;
      player.deaths = 0;
      player.score = 0;
    });

    // Reset players inside gameState too (they may be separate references)
    if (this.gameState) {
      this.gameState.players.forEach(player => {
        player.health = player.maxHealth;
        player.isAlive = true;
        player.kills = 0;
        player.deaths = 0;
        player.score = 0;
      });
      this.gameState.startTime = undefined;
    }
  }

  /**
   * Host-side: restart the game in the existing lobby.
   * Broadcasts game_restart so all guests reset their state without rejoining.
   */
  restartGame(
    gameMode?: 'coop' | 'survival',
    timeLimit?: number,
    map?: string,
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive',
  ) {
    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot restart - not host or no game state');
      return;
    }

    // Reset stats locally
    this.resetGameStats();

    // Use previous settings if not overridden
    const mode = gameMode || this.gameState.gameMode;
    const tLimit = timeLimit !== undefined ? timeLimit : this.gameState.timeLimit;
    const mapId = map !== undefined ? map : this.gameState.map;
    const diff = difficulty !== undefined ? difficulty : this.gameState.difficulty;

    // Update game state with fresh start time
    this.gameState.gameMode = mode;
    this.gameState.timeLimit = tLimit;
    this.gameState.startTime = Date.now();
    this.gameState.map = mapId;
    this.gameState.difficulty = diff;

    // Make sure local player is in gameState.players
    this.gameState.players.set(this.localPlayer.id, this.localPlayer);

    console.log('[MultiplayerManager] Restarting game in existing lobby - Players:', this.gameState.players.size);

    const restartMessage = {
      type: 'game_restart' as const,
      gameState: {
        players: Array.from(this.gameState.players.values()),
        gameMode: this.gameState.gameMode,
        timeLimit: this.gameState.timeLimit,
        startTime: this.gameState.startTime,
        hostId: this.gameState.hostId,
        map: this.gameState.map,
        difficulty: this.gameState.difficulty,
      }
    };

    this.broadcastMessage(restartMessage);
  }

  /**
   * Host-side: send every player back to the existing lobby (no rejoin).
   * Stats are wiped for the next match; the host then starts a new game
   * from the lobby like normal. Guests skip the join screen because the
   * MultiplayerManager (and therefore the PeerJS connection) is preserved.
   */
  returnToLobby() {
    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot return to lobby - not host or no game state');
      return;
    }

    // Reset per-match stats locally
    this.resetGameStats();

    // Keep the previous match settings so the host can re-launch quickly,
    // but clear startTime so the lobby reads as "not in a match".
    this.gameState.startTime = undefined;
    this.gameState.players.set(this.localPlayer.id, this.localPlayer);

    console.log('[MultiplayerManager] Returning all players to lobby - Players:', this.gameState.players.size);

    const lobbyMessage = {
      type: 'return_to_lobby' as const,
      gameState: {
        players: Array.from(this.gameState.players.values()),
        gameMode: this.gameState.gameMode,
        timeLimit: this.gameState.timeLimit,
        hostId: this.gameState.hostId,
        map: this.gameState.map,
        difficulty: this.gameState.difficulty,
      }
    };

    this.broadcastMessage(lobbyMessage);

    // Fire local handler too so the host's own UI flips to the lobby
    const handlers = this.messageHandlers.get('return_to_lobby');
    if (handlers) {
      handlers.forEach(handler => handler(lobbyMessage));
    }
  }

  /**
   * Broadcast a kill event (who killed whom with what weapon).
   * Also triggers local handlers so the shooter sees their own kill in the feed.
   */
  broadcastKill(killerName: string, victimId: string, victimName: string, victimColor: number, weapon: string) {
    const msg = {
      type: 'player_killed' as const,
      killerId: this.localPlayer.id,
      killerName,
      victimId,
      victimName,
      victimColor,
      weapon,
      timestamp: Date.now()
    };

    this.broadcastMessage(msg);

    // Trigger local handlers too so shooter/host also sees the kill
    const handlers = this.messageHandlers.get('player_killed');
    if (handlers) {
      handlers.forEach(handler => handler(msg));
    }
  }

  startGame(
    gameMode: 'coop' | 'survival',
    timeLimit?: number,
    map?: string,
    difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive',
  ) {
    console.log('[MultiplayerManager] ===== startGame() called =====');
    console.log('[MultiplayerManager] gameMode:', gameMode, 'timeLimit:', timeLimit, 'map:', map, 'difficulty:', difficulty);
    console.log('[MultiplayerManager] isHost:', this.isHost, 'has gameState:', !!this.gameState);

    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot start game - not host or no game state');
      return;
    }

    this.gameState.gameMode = gameMode;
    this.gameState.timeLimit = timeLimit;
    this.gameState.startTime = Date.now();
    this.gameState.map = map;
    this.gameState.difficulty = difficulty;

    console.log(`[MultiplayerManager] Host starting game - Mode: ${gameMode}, Map: ${map}, Difficulty: ${difficulty}, Players: ${this.gameState.players.size}, Connections: ${this.connections.size}`);
    console.log('[MultiplayerManager] Players:', Array.from(this.gameState.players.values()).map(p => ({ id: p.id, name: p.name })));

    // Convert Map to array for serialization (cast to any for network transmission)
    const gameStartMessage = {
      type: 'game_start' as const,
      gameState: {
        players: Array.from(this.gameState.players.values()),
        gameMode: this.gameState.gameMode,
        timeLimit: this.gameState.timeLimit,
        startTime: this.gameState.startTime,
        hostId: this.gameState.hostId,
        map: this.gameState.map,
        difficulty: this.gameState.difficulty,
      }
    };

    console.log('[MultiplayerManager] Broadcasting game_start message...');
    this.broadcastMessage(gameStartMessage);
    console.log('[MultiplayerManager] Broadcast complete!');
  }

  /**
   * Register a message handler with deduplication
   * Returns an unsubscribe function to remove the handler
   */
  onMessage(type: NetworkMessage['type'], handler: (data: unknown) => void): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }

    const handlers = this.messageHandlers.get(type)!;

    // Check if this exact handler is already registered (deduplication)
    if (handlers.has(handler)) {
      console.log(`Handler for ${type} already registered, skipping duplicate`);
      return () => this.offMessage(type, handler);
    }

    handlers.add(handler);
    console.log(`Registered handler for ${type} (total: ${handlers.size})`);

    // Return unsubscribe function
    return () => this.offMessage(type, handler);
  }

  /**
   * Remove a specific message handler
   */
  offMessage(type: NetworkMessage['type'], handler: (data: unknown) => void): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      console.log(`Removed handler for ${type} (remaining: ${handlers.size})`);
    }
  }

  /**
   * Remove all handlers for a message type
   */
  clearMessageHandlers(type?: NetworkMessage['type']): void {
    if (type) {
      this.messageHandlers.delete(type);
    } else {
      this.messageHandlers.clear();
    }
  }

  getLocalPlayer(): PlayerData {
    return this.localPlayer;
  }

  getRemotePlayers(): Map<string, PlayerData> {
    return this.remotePlayers;
  }

  getAllPlayers(): PlayerData[] {
    const players = [this.localPlayer];
    this.remotePlayers.forEach(player => players.push(player));
    return players;
  }

  isGameHost(): boolean {
    return this.isHost;
  }

  getGameState(): GameState | null {
    return this.gameState;
  }

  /**
   * Get the host's player ID
   */
  getHostId(): string {
    return this.gameState?.hostId || '';
  }

  /**
   * Get the lobby ID (peer ID) for URL persistence
   */
  getLobbyId(): string {
    if (this.isHost) {
      return this.localPlayer.id;
    }
    // For guests, return the host's peer ID from connections
    const hostConnection = Array.from(this.connections.keys())[0];
    return hostConnection || '';
  }

  /**
   * Check if a specific player is the host
   */
  isPlayerHost(playerId: string): boolean {
    return this.gameState?.hostId === playerId;
  }

  getRemainingTime(): number | null {
    if (!this.gameState?.timeLimit || !this.gameState?.startTime) return null;

    const elapsed = (Date.now() - this.gameState.startTime) / 1000;
    return Math.max(0, this.gameState.timeLimit - elapsed);
  }

  disconnect() {
    // Clean up timers and intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }

    if (this.positionUpdateTimer) {
      clearTimeout(this.positionUpdateTimer);
      this.positionUpdateTimer = null;
    }

    // Notify others we're leaving
    this.broadcastMessage({
      type: 'player_left',
      playerId: this.localPlayer.id
    });

    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    this.remotePlayers.clear();
    this.messageHandlers.clear();

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }

  /**
   * Get connection health info for debugging
   */
  getConnectionHealth(): { playerId: string; name: string; lastHeartbeat: number; isHealthy: boolean }[] {
    const now = Date.now();
    return Array.from(this.remotePlayers.entries()).map(([playerId, player]) => ({
      playerId,
      name: player.name,
      lastHeartbeat: player.lastHeartbeat || 0,
      isHealthy: (now - (player.lastHeartbeat || 0)) < CONNECTION_TIMEOUT
    }));
  }
}
