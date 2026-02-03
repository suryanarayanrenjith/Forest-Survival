import Peer from 'peerjs';

// Infer DataConnection type from Peer.connect() return type
type DataConnection = ReturnType<Peer['connect']>;
import * as THREE from 'three';

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
  lastHeartbeat?: number; // For connection health monitoring
}

export interface GameState {
  players: Map<string, PlayerData>;
  gameMode: 'coop' | 'survival';
  timeLimit?: number; // seconds
  startTime?: number;
  hostId: string;
  map?: string; // Map ID for session persistence
}

export type NetworkMessage =
  | { type: 'player_update'; data: PlayerData }
  | { type: 'player_joined'; data: PlayerData }
  | { type: 'player_left'; playerId: string }
  | { type: 'player_rejected'; reason: string }
  | { type: 'game_start'; gameState: Partial<GameState> }
  | { type: 'game_over'; winnerId: string; finalStats: PlayerData[] }
  | { type: 'enemy_killed'; playerId: string }
  | { type: 'player_shot'; shooterId: string; targetId: string; damage: number }
  | { type: 'chat_message'; playerId: string; playerName: string; playerColor: number; message: string; messageType: 'chat' | 'emote'; timestamp: number }
  | { type: 'heartbeat'; playerId: string; timestamp: number };

// Throttle configuration - reduces network load significantly
const POSITION_UPDATE_INTERVAL = 66; // ~15 updates per second (down from 60)
const HEARTBEAT_INTERVAL = 2000; // Send heartbeat every 2 seconds
const CONNECTION_TIMEOUT = 10000; // Consider connection dead after 10 seconds without heartbeat

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
        console.log('[MultiplayerManager] Player join request:', message.data.name);

        if (this.isHost && this.gameState) {
          // Check for duplicate names
          const existingPlayerWithName = Array.from(this.gameState.players.values())
            .find(p => p.name.toLowerCase() === message.data.name.toLowerCase());

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
              } as any
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

      case 'player_update':
        // Update heartbeat time when we receive position updates
        message.data.lastHeartbeat = Date.now();
        this.remotePlayers.set(message.data.id, message.data);
        break;

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
          // Reconstruct players Map from array
          const playersMap = new Map<string, PlayerData>();
          if (Array.isArray(message.gameState.players)) {
            console.log(`Reconstructing players map from array (${message.gameState.players.length} players)`);
            message.gameState.players.forEach((player: PlayerData) => {
              playersMap.set(player.id, player);
            });
          } else if (message.gameState.players instanceof Map) {
            // Handle case where it's already a Map (local messages)
            console.log(`Players already in Map format (${message.gameState.players.size} players)`);
            message.gameState.players.forEach((player, id) => {
              playersMap.set(id, player);
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

      case 'game_over':
      case 'enemy_killed':
      case 'player_shot':
      case 'chat_message': {
        // Forward to registered handlers
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

  startGame(gameMode: 'coop' | 'survival', timeLimit?: number, map?: string) {
    console.log('[MultiplayerManager] ===== startGame() called =====');
    console.log('[MultiplayerManager] gameMode:', gameMode, 'timeLimit:', timeLimit, 'map:', map);
    console.log('[MultiplayerManager] isHost:', this.isHost, 'has gameState:', !!this.gameState);

    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot start game - not host or no game state');
      return;
    }

    this.gameState.gameMode = gameMode;
    this.gameState.timeLimit = timeLimit;
    this.gameState.startTime = Date.now();
    this.gameState.map = map;

    console.log(`[MultiplayerManager] Host starting game - Mode: ${gameMode}, Map: ${map}, Players: ${this.gameState.players.size}, Connections: ${this.connections.size}`);
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
        map: this.gameState.map
      } as any
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
