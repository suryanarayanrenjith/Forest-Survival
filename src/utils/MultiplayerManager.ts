import Peer from 'peerjs';

// Infer DataConnection type from Peer.connect() return type
type DataConnection = ReturnType<Peer['connect']>;
import * as THREE from 'three';
import { clamp, MAX_MP_KILLS, MAX_MP_DEATHS, MAX_MP_SCORE, AVATAR_COUNT } from '../../convex/gameLimits';
import { detectIsTouch } from '../hooks/useDeviceInfo';

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
  /** True when this client is playing on a touch device (phone/tablet). Broadcast
   *  so peers can show a "mobile" indicator on the nameplate / scoreboard. */
  isMobile?: boolean;
  /** Crouch state (0 = standing, 1 = crouched), broadcast so peers can drop the
   *  avatar into a believable crouch pose from their POV. Rides along with the
   *  throttled position stream. */
  crouch?: 0 | 1;
  /**
   * Motion-timeline metadata stamped on every broadcast:
   *   t   = sender's `performance.now()` at send time
   *   seq = monotonic per-sender sequence number
   * Receivers reconstruct our movement on OUR clock (jitter-free) via a
   * clock-offset estimate, and drop out-of-order packets by `seq`. This is
   * what eliminates the warped/erratic remote movement. The host relays both
   * fields untouched, so the timeline survives the star-topology relay hop.
   */
  t?: number;
  seq?: number;
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
  /** Host-selected time of day for the match. 'auto' runs the day/night cycle.
   *  (Weather is NOT synced — every client runs the map's automatic climate.) */
  timeOfDay?: 'day' | 'night' | 'auto';
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
  // Host → a specific player: you have been removed from the game (manual kick
  // by the host, or an automatic anti-cheat ejection). `reason` is shown to the
  // kicked player before they're returned to the menu.
  | { type: 'player_kicked'; targetId: string; reason: string }
  | { type: 'game_start'; gameState: Partial<SerializedGameState> }
  | { type: 'game_restart'; gameState: Partial<SerializedGameState> }
  | { type: 'return_to_lobby'; gameState: Partial<SerializedGameState> }
  | { type: 'game_over'; winnerId: string; finalStats: PlayerData[] }
  | { type: 'enemy_killed'; playerId: string }
  // ── Shared-enemy (host-authoritative) sync ──
  // Host streams enemy state to guests so everyone sees the same enemies.
  // `full=true` is a KEYFRAME (the complete authoritative set — guests cull
  // anything absent); `full=false` is a DELTA carrying only the enemies that
  // changed since the last send (guests patch, never cull). Deltas slash
  // bandwidth; a keyframe ~1×/sec self-heals any drift.
  //
  // KEYFRAMES also carry the host's ARK-07 network-event state so guests
  // mirror it (a handful of numbers/sec — negligible):
  //   wm = wave modifier (0 none · 1 OVERDRIVE SURGE · 2 NULL WAVE/glitch)
  //   wi = modifier intensity ×100 (0–200)
  //   us = the relay-spire positions as a flat [x1,z1,x2,z2,…] list
  //        (host-rolled at match start; guests build their local copies
  //        there on first sight — max 4 spires / 8 numbers)
  | { type: 'enemy_sync'; enemies: EnemyWire[]; wave: number; full: boolean; t?: number; wm?: number; wi?: number; us?: number[] }
  // Guest → host: "I've finished warming up and I'm in the match." The host
  // withholds the enemy stream until a guest is ready so it never floods a
  // peer that's still on the loading screen.
  | { type: 'client_ready'; playerId: string }
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

// Wire quantisers — trim float noise off broadcast transforms so every packet
// (and every relayed copy) is smaller. 2 decimals = 1cm position precision and
// 3 decimals ≈ 0.06° rotation; snapshot interpolation on the receiver smooths
// the rounding away entirely. Mirrors the enemy-sync stream's existing rounding.
const q2 = (n: number): number => Math.round(n * 100) / 100;
const q3 = (n: number): number => Math.round(n * 1000) / 1000;

// Throttle configuration - reduces network load significantly.
// 50ms = 20 updates/sec. Paired with the 100ms snapshot-interpolation delay in
// RemotePlayerManager (= 2× this interval) so remote avatars always have two
// buffered samples to interpolate between AND tolerate one dropped packet —
// snappier (lower latency) and smoother than the old 66ms/110ms pairing. P2P
// payload is tiny (a position + rotation), so 20Hz stays well within budget.
const POSITION_UPDATE_INTERVAL = 50; // ~20 updates per second
const HEARTBEAT_INTERVAL = 2000; // Send heartbeat every 2 seconds
const CONNECTION_TIMEOUT = 10000; // Consider connection dead after 10 seconds without heartbeat
const PEER_SETUP_TIMEOUT = 15_000; // Avoid leaving the lobby UI stuck on a stalled PeerJS handshake
const MAX_REMOTE_PLAYERS = 7; // host + seven guests, matching the lobby UI
const MAX_PEER_ID_LENGTH = 128;
const MAX_PLAYER_NAME_LENGTH = 32;
const MAX_WEAPON_ID_LENGTH = 32;
const MAX_WORLD_COORDINATE = 10_000;
const MAX_ENEMY_HEALTH = 100_000;
// Alive enemies cap at 40 (ultra preset), but dying enemies stay in the sync
// stream until their death animation finishes — a mass-death moment (TNT /
// Shockwave wiping a wave) can transiently push a keyframe well past the alive
// cap. Undersizing this drops the ENTIRE snapshot and desyncs guests exactly
// when accuracy matters most.
const MAX_NETWORK_ENEMIES = 128;
// Sanity ceiling for a single reported hit. Boosted critical shots stack
// damage powerup ×2, Overclock ×1.6, skill/perk/run multipliers and the
// headshot multiplier on a 100–150 base — legitimately reaching several
// thousand. This bound only exists to reject NaN/Infinity-scale garbage, not
// to referee balance (P2P is not cheat-proof; the host owns enemy health).
const MAX_REPORTED_HIT_DAMAGE = 10_000;
const MAX_CHAT_LENGTH = 240;

const NETWORK_MESSAGE_TYPES = new Set<NetworkMessage['type']>([
  'player_update', 'player_joined', 'player_left', 'player_rejected',
  'player_kicked', 'game_start', 'game_restart', 'return_to_lobby',
  'game_over', 'enemy_killed', 'client_ready', 'enemy_hit',
  'enemy_sync', 'enemy_kill_credit', 'player_damaged', 'player_shot',
  'player_killed', 'chat_message', 'heartbeat',
]);
const MODEL_CLASSES = new Set<ModelClassId>([
  'ranger', 'scout', 'heavy', 'operative', 'pyro', 'medic', 'engineer', 'phantom',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNetworkMessage(value: unknown): value is NetworkMessage {
  return isRecord(value)
    && typeof value.type === 'string'
    && NETWORK_MESSAGE_TYPES.has(value.type as NetworkMessage['type']);
}

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
    ? value
    : null;
}

function finiteBetween(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function readVector(value: unknown, min: number, max: number): { x: number; y: number; z: number } | null {
  if (!isRecord(value)) return null;
  const x = finiteBetween(value.x, min, max);
  const y = finiteBetween(value.y, min, max);
  const z = finiteBetween(value.z, min, max);
  return x === null || y === null || z === null ? null : { x, y, z };
}

/**
 * Best-effort clamp of a peer-reported PlayerData snapshot. Multiplayer is P2P
 * (no authoritative server), so peers are untrusted — this rejects clearly
 * impossible values (negative/NaN, health above max, scores/kills above match
 * caps) so trivial packet tampering can't corrupt scoreboards. It does NOT make
 * P2P cheat-proof; that needs an authoritative server. It also validates the
 * outer shape so malformed packets are dropped instead of reaching Three.js.
 */
function sanitizeRemotePlayer(data: unknown, expectedId?: string): PlayerData | null {
  if (!isRecord(data)) return null;
  const id = boundedString(data.id, MAX_PEER_ID_LENGTH);
  const name = boundedString(data.name, MAX_PLAYER_NAME_LENGTH);
  const position = readVector(data.position, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
  const rotation = readVector(data.rotation, -Math.PI * 8, Math.PI * 8);
  if (!id || !name || !position || !rotation || (expectedId && id !== expectedId)) return null;

  const maxHealth = clamp(finiteBetween(data.maxHealth, 1, 1000) ?? 100, 1, 1000);
  const rawClass = data.modelClass;
  const modelClass = typeof rawClass === 'string' && MODEL_CLASSES.has(rawClass as ModelClassId)
    ? rawClass as ModelClassId
    : undefined;
  return {
    id,
    name,
    position,
    rotation,
    maxHealth,
    health: clamp(finiteBetween(data.health, 0, maxHealth) ?? 0, 0, maxHealth),
    kills: clamp(finiteBetween(data.kills, 0, MAX_MP_KILLS) ?? 0, 0, MAX_MP_KILLS),
    deaths: clamp(finiteBetween(data.deaths, 0, MAX_MP_DEATHS) ?? 0, 0, MAX_MP_DEATHS),
    score: clamp(finiteBetween(data.score, 0, MAX_MP_SCORE) ?? 0, 0, MAX_MP_SCORE),
    currentWeapon: boundedString(data.currentWeapon, MAX_WEAPON_ID_LENGTH) ?? 'pistol',
    isAlive: data.isAlive === true,
    color: clamp(finiteBetween(data.color, 0, 0xffffff) ?? 0xffffff, 0, 0xffffff),
    modelClass,
    rankTier: finiteBetween(data.rankTier, 0, 5) === null ? undefined : clamp(data.rankTier as number, 0, 5),
    level: finiteBetween(data.level, 1, 100000) === null ? undefined : clamp(data.level as number, 1, 100000),
    avatarIndex: finiteBetween(data.avatarIndex, 0, AVATAR_COUNT - 1) === null ? undefined : clamp(data.avatarIndex as number, 0, AVATAR_COUNT - 1),
    isMobile: typeof data.isMobile === 'boolean' ? data.isMobile : undefined,
    crouch: data.crouch === 0 || data.crouch === 1 ? data.crouch : undefined,
    t: finiteBetween(data.t, 0, Number.MAX_SAFE_INTEGER) ?? undefined,
    seq: finiteBetween(data.seq, 0, Number.MAX_SAFE_INTEGER) ?? undefined,
  };
}

function sanitizeGameState(value: unknown, expectedHostId: string): Partial<SerializedGameState> | null {
  if (!isRecord(value)) return null;
  const hostId = boundedString(value.hostId, MAX_PEER_ID_LENGTH);
  if (!hostId || hostId !== expectedHostId || !Array.isArray(value.players)) return null;
  if (value.players.length === 0 || value.players.length > MAX_REMOTE_PLAYERS + 1) return null;

  const players: PlayerData[] = [];
  const seenIds = new Set<string>();
  for (const rawPlayer of value.players) {
    const player = sanitizeRemotePlayer(rawPlayer);
    if (!player || seenIds.has(player.id)) return null;
    seenIds.add(player.id);
    players.push(player);
  }
  if (!seenIds.has(hostId)) return null;

  const state: Partial<SerializedGameState> = {
    players,
    hostId,
    gameMode: value.gameMode === 'survival' ? 'survival' : 'coop',
  };
  // Optional fields: the host always sends the keys, with `undefined` when a
  // setting is unset (e.g. a match with no time limit) — and PeerJS's
  // BinaryPack serializes `undefined` to NULL on the wire. So null must mean
  // "absent" here, never "invalid", or every no-time-limit match / late join /
  // return-to-lobby would be silently rejected in its entirety.
  if (value.timeLimit !== undefined && value.timeLimit !== null) {
    const timeLimit = finiteBetween(value.timeLimit, 60, 1800);
    if (timeLimit === null) return null;
    state.timeLimit = Math.floor(timeLimit);
  }
  if (value.startTime !== undefined && value.startTime !== null) {
    const startTime = finiteBetween(value.startTime, 0, Number.MAX_SAFE_INTEGER);
    if (startTime === null) return null;
    state.startTime = startTime;
  }
  if (value.map !== undefined && value.map !== null) {
    const map = boundedString(value.map, 64);
    if (!map) return null;
    state.map = map;
  }
  if (value.difficulty !== undefined && value.difficulty !== null) {
    if (value.difficulty !== 'easy' && value.difficulty !== 'medium'
      && value.difficulty !== 'hard' && value.difficulty !== 'adaptive') return null;
    state.difficulty = value.difficulty;
  }
  if (value.timeOfDay !== undefined && value.timeOfDay !== null) {
    if (value.timeOfDay !== 'auto' && value.timeOfDay !== 'day' && value.timeOfDay !== 'night') return null;
    state.timeOfDay = value.timeOfDay;
  }
  return state;
}

function sanitizeEnemyWire(value: unknown): EnemyWire | null {
  if (!isRecord(value)) return null;
  const id = finiteBetween(value.id, 0, 1_000_000_000);
  const ty = finiteBetween(value.ty, 0, 255);
  const x = finiteBetween(value.x, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
  const y = finiteBetween(value.y, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
  const z = finiteBetween(value.z, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
  const ry = finiteBetween(value.ry, -Math.PI * 8, Math.PI * 8);
  const hp = finiteBetween(value.hp, -MAX_ENEMY_HEALTH, MAX_ENEMY_HEALTH);
  const mx = finiteBetween(value.mx, 1, MAX_ENEMY_HEALTH);
  if (id === null || ty === null || x === null || y === null || z === null
    || ry === null || hp === null || mx === null || (value.d !== 0 && value.d !== 1)) return null;
  return {
    id: Math.floor(id), ty: Math.floor(ty), x, y, z, ry, hp, mx,
    d: value.d,
  };
}

export class MultiplayerManager {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private joinTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private localPlayer: PlayerData;
  private remotePlayers: Map<string, PlayerData> = new Map();
  private isHost: boolean = false;
  private gameState: GameState | null = null;
  private messageHandlers: Map<string, Set<(data: unknown) => void>> = new Map(); // Changed to Set for deduplication

  // Host-side: peers that have signalled `client_ready` for the current
  // match. The host gates its enemy-sync stream on this so it never floods
  // a guest that's still warming up. Cleared at the start of every match.
  private readyPeers: Set<string> = new Set();

  // Host-side anti-cheat movement tracker (per guest). Holds the last accepted
  // position + a strike counter so a one-off lag spike never ejects a legit
  // player — only a sustained pattern of physically-impossible movement does.
  // Deliberately movement-ONLY so it can never conflict with stat-affecting
  // powerups (speed boosts, dashes, nukes, score multipliers, etc.).
  private antiCheat: Map<string, { x: number; z: number; t: number; strikes: number; alive: boolean }> = new Map();

  private lastPositionUpdate: number = 0;
  private pendingPositionUpdate: { position: THREE.Vector3; rotation: THREE.Euler } | null = null;
  private positionUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  // Monotonic sequence stamped on every outgoing player_update so receivers can
  // drop reordered packets and reconstruct our motion on their own clock.
  private positionSeq: number = 0;

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionCheckInterval: ReturnType<typeof setInterval> | null = null;

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
      // Device type is intrinsic to this client — broadcast it so peers render
      // a phone glyph on this player's nameplate / scoreboard when on mobile.
      isMobile: detectIsTouch(),
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
      const peer = new Peer();
      this.peer = peer;
      let settled = false;
      let setupTimeout: ReturnType<typeof setTimeout> | null = null;
      const clearSetupTimeout = () => {
        if (setupTimeout) clearTimeout(setupTimeout);
        setupTimeout = null;
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearSetupTimeout();
        if (this.peer === peer) {
          peer.destroy();
          this.peer = null;
        }
        reject(error);
      };
      const succeed = (id: string) => {
        if (settled) return;
        settled = true;
        clearSetupTimeout();
        resolve(id);
      };

      setupTimeout = setTimeout(() => {
        fail(new Error('Timed out while creating the lobby.'));
      }, PEER_SETUP_TIMEOUT);

      peer.on('open', (id) => {
        if (settled) return;
        this.localPlayer.id = id;
        this.localPlayer.lastHeartbeat = Date.now();
        this.isHost = true;

        this.gameState = {
          players: new Map([[id, this.localPlayer]]),
          gameMode: 'coop',
          hostId: id
        };

        this.startHeartbeat();
        this.startConnectionMonitoring();

        succeed(id);
      });

      peer.on('connection', (conn) => {
        this.handleNewConnection(conn);
      });

      peer.on('error', (err: unknown) => {
        if (settled) return;
        const error = err as { type?: string; message?: string };
        // Suppress "Lost connection to server" errors as they're not critical
        if (error.type === 'network' || error.message?.includes('Lost connection')) {
          // Give PeerJS a bounded chance to reconnect; the setup timeout keeps
          // the UI from getting stuck forever if it cannot.
          return;
        }
        console.error('Peer error:', err);
        fail(err);
      });
    });
  }

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
          this.readyPeers.delete(playerId);
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
    const normalizedLobbyId = lobbyId.trim();
    if (!boundedString(normalizedLobbyId, MAX_PEER_ID_LENGTH)) {
      throw new Error('Invalid lobby ID.');
    }

    return new Promise((resolve, reject) => {
      const peer = new Peer();
      this.peer = peer;
      let settled = false;
      let setupTimeout: ReturnType<typeof setTimeout> | null = null;
      const clearSetupTimeout = () => {
        if (setupTimeout) clearTimeout(setupTimeout);
        setupTimeout = null;
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearSetupTimeout();
        if (this.peer === peer) {
          peer.destroy();
          this.peer = null;
        }
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        clearSetupTimeout();
        resolve();
      };

      setupTimeout = setTimeout(() => {
        fail(new Error('Timed out while joining the lobby.'));
      }, PEER_SETUP_TIMEOUT);

      peer.on('open', (id) => {
        if (settled) return;
        this.localPlayer.id = id;
        this.localPlayer.lastHeartbeat = Date.now();
        this.isHost = false;

        const conn = peer.connect(normalizedLobbyId);

        conn.on('open', () => {
          if (settled) {
            conn.close();
            return;
          }
          this.handleNewConnection(conn);

          // Send join request
          this.sendMessage(conn, {
            type: 'player_joined',
            data: this.localPlayer
          });

          // Start heartbeat and connection monitoring
          this.startHeartbeat();
          this.startConnectionMonitoring();

          succeed();
        });

        conn.on('error', (err) => {
          if (settled) return;
          console.error('Connection error:', err);
          fail(err);
        });
      });

      peer.on('error', (err: unknown) => {
        if (settled) return;
        const error = err as { type?: string; message?: string };
        // Suppress "Lost connection to server" errors as they're not critical
        if (error.type === 'network' || error.message?.includes('Lost connection')) {
          // Give PeerJS a bounded chance to reconnect; the setup timeout keeps
          // the UI from getting stuck forever if it cannot.
          return;
        }
        console.error('Peer error:', err);
        fail(err);
      });
    });
  }

  private isHostConnection(conn: DataConnection): boolean {
    if (this.isHost) return false;
    const hostId = this.gameState?.hostId || this.getLobbyId();
    return hostId.length > 0 && conn.peer === hostId;
  }

  private isRegisteredGuest(conn: DataConnection): boolean {
    return this.isHost && this.remotePlayers.has(conn.peer);
  }

  private clearJoinTimeout(peerId: string): void {
    const timeout = this.joinTimeouts.get(peerId);
    if (timeout) clearTimeout(timeout);
    this.joinTimeouts.delete(peerId);
  }

  private handleNewConnection(conn: DataConnection) {
    // Do not let idle/unregistered PeerJS connections exceed the same eight
    // player limit exposed by the lobby UI.
    if (this.isHost && this.connections.size >= MAX_REMOTE_PLAYERS) {
      try { conn.close(); } catch { /* connection already closed */ }
      return;
    }
    this.connections.set(conn.peer, conn);

    if (this.isHost) {
      const timeout = setTimeout(() => {
        if (!this.remotePlayers.has(conn.peer)) {
          try { conn.close(); } catch { /* connection already closed */ }
        }
      }, CONNECTION_TIMEOUT);
      this.joinTimeouts.set(conn.peer, timeout);
    }

    conn.on('data', (data: unknown) => {
      this.handleMessage(data, conn);
    });

    conn.on('close', () => {
      this.clearJoinTimeout(conn.peer);
      this.connections.delete(conn.peer);
      this.remotePlayers.delete(conn.peer);
      this.readyPeers.delete(conn.peer);

      // Notify others about player leaving
      this.broadcastMessage({
        type: 'player_left',
        playerId: conn.peer
      });

    });
  }

  private handleMessage(rawMessage: unknown, conn: DataConnection) {
    if (!isNetworkMessage(rawMessage)) return;
    const message = rawMessage;
    switch (message.type) {
      case 'heartbeat': {
        const playerId = boundedString(message.playerId, MAX_PEER_ID_LENGTH);
        if (!playerId) return;
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn) || playerId !== conn.peer) return;
        } else if (!this.isHostConnection(conn)) {
          return;
        }
        // Update last heartbeat time for this player
        const heartbeatPlayer = this.remotePlayers.get(playerId);
        if (heartbeatPlayer) {
          heartbeatPlayer.lastHeartbeat = Date.now();
        }
        // Don't log heartbeats to reduce console spam
        return;
      }

      case 'player_joined': {
        // A guest must only ever claim the PeerJS id of its own connection.
        // Guests accept lobby snapshots only from their directly connected host.
        const player = sanitizeRemotePlayer(message.data, this.isHost ? conn.peer : undefined);
        if (!player || (!this.isHost && !this.isHostConnection(conn))) return;
        const joinedMessage: NetworkMessage = { type: 'player_joined', data: player };
        if (this.isHost && this.gameState) {
          if (!this.remotePlayers.has(player.id) && this.remotePlayers.size >= MAX_REMOTE_PLAYERS) {
            this.sendMessage(conn, { type: 'player_rejected', reason: 'This lobby is full.' });
            setTimeout(() => conn.close(), 100);
            return;
          }
          // Check for duplicate names (case- and whitespace-insensitive)
          const incomingName = player.name.trim().toLowerCase();
          const existingPlayerWithName = Array.from(this.gameState.players.values())
            .find(p => (p.name || '').trim().toLowerCase() === incomingName);

          if (existingPlayerWithName && existingPlayerWithName.id !== player.id) {
            // Reject the player
            this.sendMessage(conn, {
              type: 'player_rejected',
              reason: `A player with the name "${player.name}" is already in this lobby. Please choose a different name.`
            });
            // Close the connection
            setTimeout(() => conn.close(), 100);
            return;
          }

          // Name is unique, accept player
          player.lastHeartbeat = Date.now();
          this.clearJoinTimeout(player.id);
          this.remotePlayers.set(player.id, player);

          // Add new player to game state
          this.gameState.players.set(player.id, player);

          // ONLY send game_start if game has actually started (startTime is set)
          // This prevents auto-starting when players join the lobby
          // Note: startTime is undefined (not null) when game hasn't started, so use truthy check
          if (this.gameState.startTime) {
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
            // Send current player list to the joining player so they see everyone in lobby
            this.sendPlayerListToNewPlayer(conn);
          }

          // Notify other players
          this.broadcastMessage(joinedMessage, conn.peer);
        } else {
          // Not host, just add to remote players
          this.remotePlayers.set(player.id, player);
        }

        // Forward to registered handlers for chat system
        {
          const playerJoinedHandlers = this.messageHandlers.get('player_joined');
          if (playerJoinedHandlers) {
            playerJoinedHandlers.forEach(handler => handler(joinedMessage));
          }
        }
        break;
      }

      case 'player_update': {
        // Host accepts a snapshot only from its owning peer; a guest accepts
        // relayed snapshots only from the host. This closes identity spoofing
        // where one guest could previously overwrite another player's state.
        const player = sanitizeRemotePlayer(message.data, this.isHost ? conn.peer : undefined);
        if (!player) return;
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn)) return;
        } else if (!this.isHostConnection(conn) || player.id === this.localPlayer.id) {
          return;
        }
        const updateMessage: NetworkMessage = { type: 'player_update', data: player };

        // Host-authoritative anti-cheat — only during a live match, never in
        // the lobby. Movement-only so powerups can't trip it. A confirmed
        // violator is ejected and their packet dropped.
        if (this.isHost && this.gameState?.startTime) {
          const verdict = this.inspectMovement(player);
          if (verdict) {
            this.kickPlayer(player.id, verdict);
            return;
          }
        }

        // Track alive-state transitions before replacing snapshots
        const prevState = this.gameState?.players.get(player.id);
        const wasAlive = prevState ? prevState.isAlive : true;

        // Update heartbeat time when we receive position updates
        player.lastHeartbeat = Date.now();
        this.remotePlayers.set(player.id, player);

        // Keep authoritative game-state map in sync (important for game over/final stats)
        if (this.gameState) {
          this.gameState.players.set(player.id, player);
        }

        // Guests only send updates to host; host must relay them to other guests
        if (this.isHost) {
          this.broadcastMessage(updateMessage, conn.peer);

          // Re-evaluate multiplayer end conditions when a remote player dies.
          if (wasAlive && !player.isAlive) {
            this.checkGameOver();
          }
        }

        // Forward to registered handlers so leaderboards / HUDs reflect a
        // player's kills, score and health the instant the update arrives —
        // no polling delay.
        {
          const playerUpdateHandlers = this.messageHandlers.get('player_update');
          if (playerUpdateHandlers) {
            playerUpdateHandlers.forEach(handler => handler(updateMessage));
          }
        }
        break;
      }

      case 'player_left': {
        const playerId = boundedString(message.playerId, MAX_PEER_ID_LENGTH);
        if (!playerId || this.isHost || !this.isHostConnection(conn) || playerId === this.localPlayer.id) return;
        const leftMessage: NetworkMessage = { type: 'player_left', playerId };
        this.remotePlayers.delete(playerId);
        if (this.gameState) {
          this.gameState.players.delete(playerId);
        }

        // Forward to registered handlers for chat system
        {
          const playerLeftHandlers = this.messageHandlers.get('player_left');
          if (playerLeftHandlers) {
            playerLeftHandlers.forEach(handler => handler(leftMessage));
          }
        }
        break;
      }

      case 'player_rejected': {
        const reason = boundedString(message.reason, MAX_CHAT_LENGTH);
        if (!reason || this.isHost || !this.isHostConnection(conn)) return;
        const rejectedMessage: NetworkMessage = { type: 'player_rejected', reason };
        // Forward to registered handlers so lobby can show error
        const playerRejectedHandlers = this.messageHandlers.get('player_rejected');
        if (playerRejectedHandlers) {
          playerRejectedHandlers.forEach(handler => handler(rejectedMessage));
        }
        break;
      }

      case 'player_kicked': {
        const targetId = boundedString(message.targetId, MAX_PEER_ID_LENGTH);
        const reason = boundedString(message.reason, MAX_CHAT_LENGTH);
        if (!targetId || !reason || this.isHost || !this.isHostConnection(conn)) return;
        // Only the targeted player acts on this (the host addressed it to them).
        if (targetId !== this.localPlayer.id) break;
        const kickedMessage: NetworkMessage = { type: 'player_kicked', targetId, reason };
        const kickedHandlers = this.messageHandlers.get('player_kicked');
        if (kickedHandlers) {
          kickedHandlers.forEach(handler => handler(kickedMessage));
        }
        break;
      }

      case 'game_start': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const gameState = sanitizeGameState(message.gameState, conn.peer);
        if (!gameState) return;
        const startMessage: NetworkMessage = { type: 'game_start', gameState };
        const playersMap = new Map((gameState.players ?? []).map((player) => [player.id, player]));
        this.gameState = { ...gameState, players: playersMap } as GameState;

        // Populate remote players from the host's validated game snapshot.
        this.remotePlayers.clear();
        playersMap.forEach((player, id) => {
          if (id !== this.localPlayer.id) this.remotePlayers.set(id, player);
        });

        // Forward to registered handlers so App.tsx can start the game
        {
          const gameStartHandlers = this.messageHandlers.get('game_start');
          if (gameStartHandlers && gameStartHandlers.size > 0) {
            gameStartHandlers.forEach(handler => handler(startMessage));
          } else {
            console.warn('No game_start handler registered!');
          }
        }
        break;
      }

      case 'game_restart': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const gameState = sanitizeGameState(message.gameState, conn.peer);
        if (!gameState) return;
        const restartMessage: NetworkMessage = { type: 'game_restart', gameState };
        const playersMap = new Map((gameState.players ?? []).map((player) => [player.id, player]));

        // Reset local player stats from the host's fresh state.
        const freshLocal = playersMap.get(this.localPlayer.id);
        if (freshLocal) {
          this.localPlayer.health = freshLocal.health;
          this.localPlayer.maxHealth = freshLocal.maxHealth;
          this.localPlayer.isAlive = true;
          this.localPlayer.kills = 0;
          this.localPlayer.deaths = 0;
          this.localPlayer.score = 0;
        }

        this.gameState = { ...gameState, players: playersMap } as GameState;

        // Update remote players
        this.remotePlayers.clear();
        playersMap.forEach((player, id) => {
          if (id !== this.localPlayer.id) this.remotePlayers.set(id, player);
        });

        const restartHandlers = this.messageHandlers.get('game_restart');
        if (restartHandlers) {
          restartHandlers.forEach(handler => handler(restartMessage));
        }
        break;
      }

      case 'return_to_lobby': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const gameState = sanitizeGameState(message.gameState, conn.peer);
        if (!gameState) return;
        const lobbyMessage: NetworkMessage = { type: 'return_to_lobby', gameState };
        const playersMap = new Map((gameState.players ?? []).map((player) => [player.id, player]));

        // Reset local player to fresh lobby state
        this.localPlayer.health = this.localPlayer.maxHealth;
        this.localPlayer.isAlive = true;
        this.localPlayer.kills = 0;
        this.localPlayer.deaths = 0;
        this.localPlayer.score = 0;

        this.gameState = {
          ...gameState,
          players: playersMap,
          startTime: undefined, // clear startTime so the lobby reads as not-in-game
        } as GameState;

        // Re-sync remote players from the server-authoritative snapshot
        this.remotePlayers.clear();
        playersMap.forEach((player, id) => {
          if (id !== this.localPlayer.id) this.remotePlayers.set(id, player);
        });

        const lobbyHandlers = this.messageHandlers.get('return_to_lobby');
        if (lobbyHandlers) {
          lobbyHandlers.forEach(handler => handler(lobbyMessage));
        }
        break;
      }

      case 'game_over': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const winnerId = boundedString(message.winnerId, MAX_PEER_ID_LENGTH);
        if (!winnerId || !Array.isArray(message.finalStats) || message.finalStats.length > MAX_REMOTE_PLAYERS + 1) return;
        const finalStats = message.finalStats.map((player) => sanitizeRemotePlayer(player));
        if (finalStats.some((player) => player === null)) return;
        const safeStats = finalStats as PlayerData[];
        if (!safeStats.some((player) => player.id === winnerId)) return;
        const gameOverMessage: NetworkMessage = { type: 'game_over', winnerId, finalStats: safeStats };
        // Forward to registered handlers
        const handlers = this.messageHandlers.get('game_over');
        if (handlers) {
          handlers.forEach(handler => handler(gameOverMessage));
        }
        break;
      }

      case 'enemy_killed': {
        const playerId = boundedString(message.playerId, MAX_PEER_ID_LENGTH);
        if (!playerId) return;
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn) || playerId !== conn.peer) return;
        } else if (!this.isHostConnection(conn)) {
          return;
        }
        const killedMessage: NetworkMessage = { type: 'enemy_killed', playerId };
        if (this.isHost) this.broadcastMessage(killedMessage, conn.peer);
        this.messageHandlers.get('enemy_killed')?.forEach((handler) => handler(killedMessage));
        break;
      }

      case 'player_shot': {
        const shooterId = boundedString(message.shooterId, MAX_PEER_ID_LENGTH);
        const targetId = boundedString(message.targetId, MAX_PEER_ID_LENGTH);
        const damage = finiteBetween(message.damage, 0, MAX_REPORTED_HIT_DAMAGE);
        if (!shooterId || !targetId || damage === null) return;
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn) || shooterId !== conn.peer) return;
        } else if (!this.isHostConnection(conn)) {
          return;
        }
        const shotMessage: NetworkMessage = { type: 'player_shot', shooterId, targetId, damage };
        if (this.isHost) this.broadcastMessage(shotMessage, conn.peer);
        this.messageHandlers.get('player_shot')?.forEach((handler) => handler(shotMessage));
        break;
      }

      case 'player_killed': {
        const killerId = boundedString(message.killerId, MAX_PEER_ID_LENGTH);
        const victimId = boundedString(message.victimId, MAX_PEER_ID_LENGTH);
        const killerName = boundedString(message.killerName, MAX_PLAYER_NAME_LENGTH);
        const victimName = boundedString(message.victimName, MAX_PLAYER_NAME_LENGTH);
        const weapon = boundedString(message.weapon, MAX_WEAPON_ID_LENGTH);
        const victimColor = finiteBetween(message.victimColor, 0, 0xffffff);
        const timestamp = finiteBetween(message.timestamp, 0, Number.MAX_SAFE_INTEGER);
        if (!killerId || !victimId || !killerName || !victimName || !weapon || victimColor === null || timestamp === null) return;
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn) || killerId !== conn.peer) return;
        } else if (!this.isHostConnection(conn)) {
          return;
        }
        const killedMessage: NetworkMessage = {
          type: 'player_killed', killerId, victimId, killerName, victimName,
          weapon, victimColor: clamp(victimColor, 0, 0xffffff), timestamp,
        };
        if (this.isHost) this.broadcastMessage(killedMessage, conn.peer);
        this.messageHandlers.get('player_killed')?.forEach((handler) => handler(killedMessage));
        break;
      }

      case 'chat_message': {
        const playerId = boundedString(message.playerId, MAX_PEER_ID_LENGTH);
        const body = typeof message.message === 'string' ? message.message.trim() : '';
        const text = boundedString(body, MAX_CHAT_LENGTH);
        const messageType = message.messageType === 'chat' || message.messageType === 'emote'
          ? message.messageType
          : null;
        if (!playerId || !text || !messageType) return;

        let playerName = boundedString(message.playerName, MAX_PLAYER_NAME_LENGTH);
        let playerColor = finiteBetween(message.playerColor, 0, 0xffffff);
        if (this.isHost) {
          if (!this.isRegisteredGuest(conn) || playerId !== conn.peer) return;
          // Use the identity accepted at lobby join, never a chat packet's
          // claimed display name or colour.
          const player = this.remotePlayers.get(conn.peer);
          if (!player) return;
          playerName = player.name;
          playerColor = player.color;
        } else if (!this.isHostConnection(conn)) {
          return;
        }
        if (!playerName || playerColor === null) return;
        const chatMessage: NetworkMessage = {
          type: 'chat_message', playerId, playerName,
          playerColor: clamp(playerColor, 0, 0xffffff), message: text,
          messageType, timestamp: Date.now(),
        };
        if (this.isHost) this.broadcastMessage(chatMessage, conn.peer);
        this.messageHandlers.get('chat_message')?.forEach((handler) => handler(chatMessage));
        break;
      }

      // Guest → host readiness. Host records the peer so its enemy stream can
      // begin; still forwarded to handlers (App uses it to force a keyframe).
      case 'client_ready': {
        const playerId = boundedString(message.playerId, MAX_PEER_ID_LENGTH);
        if (!playerId || !this.isHost || !this.isRegisteredGuest(conn) || playerId !== conn.peer) return;
        this.readyPeers.add(playerId);
        const readyMessage: NetworkMessage = { type: 'client_ready', playerId };
        const handlers = this.messageHandlers.get('client_ready');
        if (handlers) {
          handlers.forEach(handler => handler(readyMessage));
        }
        break;
      }

      // Shared-enemy traffic. Star topology means host↔guest is a direct link,
      // so these are never relayed — they go straight to the registered
      // handlers (enemy_hit lands on the host; the rest land on guests).
      case 'enemy_sync': {
        if (this.isHost || !this.isHostConnection(conn) || !Array.isArray(message.enemies)
          || message.enemies.length > MAX_NETWORK_ENEMIES || typeof message.full !== 'boolean') return;
        const wave = finiteBetween(message.wave, 0, 1000);
        // BinaryPack turns undefined into null on the wire — treat both as absent.
        const t = message.t == null ? undefined : finiteBetween(message.t, 0, Number.MAX_SAFE_INTEGER);
        // ARK-07 network-event fields (keyframes only; absent on deltas).
        const wm = message.wm == null ? undefined : finiteBetween(message.wm, 0, 2);
        const wi = message.wi == null ? undefined : finiteBetween(message.wi, 0, 200);
        // Relay-spire coordinate list: flat [x,z,…] pairs, hard-capped so a
        // hostile host can't flood guests with structures.
        let us: number[] | undefined;
        if (message.us != null) {
          if (!Array.isArray(message.us) || message.us.length > 8 || message.us.length % 2 !== 0) return;
          us = [];
          for (const v of message.us) {
            const n = finiteBetween(v, -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE);
            if (n === null) return;
            us.push(n);
          }
        }
        const enemies = message.enemies.map((enemy) => sanitizeEnemyWire(enemy));
        if (wave === null || t === null || wm === null || wi === null
          || enemies.some((enemy) => enemy === null)) return;
        const syncMessage: NetworkMessage = {
          type: 'enemy_sync', enemies: enemies as EnemyWire[], wave: Math.floor(wave), full: message.full, t,
          wm: wm === undefined ? undefined : Math.floor(wm), wi, us,
        };
        this.messageHandlers.get('enemy_sync')?.forEach((handler) => handler(syncMessage));
        break;
      }

      case 'enemy_hit': {
        if (!this.isHost || !this.isRegisteredGuest(conn)) return;
        const netId = finiteBetween(message.netId, 0, 1_000_000_000);
        const damage = finiteBetween(message.damage, 0, MAX_REPORTED_HIT_DAMAGE);
        if (netId === null || damage === null || typeof message.isCritical !== 'boolean'
          || message.shooterId !== conn.peer) return;
        const hitMessage: NetworkMessage = {
          type: 'enemy_hit', netId: Math.floor(netId), damage, isCritical: message.isCritical, shooterId: conn.peer,
        };
        this.messageHandlers.get('enemy_hit')?.forEach((handler) => handler(hitMessage));
        break;
      }

      case 'enemy_kill_credit': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const netId = finiteBetween(message.netId, 0, 1_000_000_000);
        const scoreValue = finiteBetween(message.scoreValue, 0, 1000);
        const killerId = boundedString(message.killerId, MAX_PEER_ID_LENGTH);
        if (netId === null || scoreValue === null || !killerId || typeof message.isCritical !== 'boolean') return;
        const creditMessage: NetworkMessage = {
          type: 'enemy_kill_credit', netId: Math.floor(netId), killerId,
          scoreValue, isCritical: message.isCritical,
        };
        this.messageHandlers.get('enemy_kill_credit')?.forEach((handler) => handler(creditMessage));
        break;
      }

      case 'player_damaged': {
        if (this.isHost || !this.isHostConnection(conn)) return;
        const targetId = boundedString(message.targetId, MAX_PEER_ID_LENGTH);
        const enemyType = boundedString(message.enemyType, MAX_WEAPON_ID_LENGTH);
        const damage = finiteBetween(message.damage, 0, 500);
        if (!targetId || !enemyType || damage === null) return;
        const damageMessage: NetworkMessage = { type: 'player_damaged', targetId, damage, enemyType };
        this.messageHandlers.get('player_damaged')?.forEach((handler) => handler(damageMessage));
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
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId) {
        this.sendMessage(conn, message);
      }
    });
  }

  updateLocalPlayer(updates: Partial<PlayerData>) {
    Object.assign(this.localPlayer, updates);

    // Stamp the motion timeline (send-time + sequence) so receivers can
    // reconstruct our movement on their own clock instead of the jittery
    // wall-clock they happened to receive the packet at. performance.now()
    // is monotonic; the receiver only needs the *spacing* between our stamps,
    // so the differing time origins between peers don't matter.
    this.localPlayer.t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.localPlayer.seq = ++this.positionSeq;

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
  /**
   * Update the held weapon broadcast to peers. Only fires a network update when
   * the weapon actually changes (weapon swaps are rare), so remote clients
   * rebuild the avatar's held mesh + grip pose the instant we switch. Without
   * this every remote avatar was stuck holding the spawn pistol forever.
   */
  setCurrentWeapon(weapon: string): void {
    if (this.localPlayer.currentWeapon === weapon) return;
    this.updateLocalPlayer({ currentWeapon: weapon });
  }

  updatePlayerPosition(position: THREE.Vector3, rotation: THREE.Euler, crouch: boolean = false) {
    const now = Date.now();

    // Crouch rides along with the next throttled position broadcast (it's part
    // of localPlayer, which updateLocalPlayer sends whole).
    this.localPlayer.crouch = crouch ? 1 : 0;

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
        position: { x: q2(position.x), y: q2(position.y), z: q2(position.z) },
        rotation: { x: q3(rotation.x), y: q3(rotation.y), z: q3(rotation.z) },
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
      position: { x: q2(position.x), y: q2(position.y), z: q2(position.z) },
      rotation: { x: q3(rotation.x), y: q3(rotation.y), z: q3(rotation.z) },
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

  /**
   * Host → all guests: an enemy snapshot. `full=true` is a keyframe (complete
   * set, guests cull anything missing); `full=false` is a delta (changed
   * enemies only, guests patch without culling).
   */
  broadcastEnemySync(
    enemies: EnemyWire[], wave: number, full: boolean, t?: number,
    // ARK-07 network-event state — sent on keyframes so guests mirror the
    // wave modifier + relay-spire placement (see the NetworkMessage comment).
    mods?: { wm: number; wi: number; us: number[] },
  ): void {
    this.broadcastMessage({ type: 'enemy_sync', enemies, wave, full, t, ...(mods ?? {}) });
  }

  /** Guest → host: signal that this client has finished warming up. */
  sendClientReady(): void {
    this.broadcastMessage({ type: 'client_ready', playerId: this.localPlayer.id });
  }

  /** Host-side: has at least one guest signalled ready for this match? */
  hasReadyGuest(): boolean {
    return this.readyPeers.size > 0;
  }

  /** Number of currently-open peer connections. */
  getConnectionCount(): number {
    return this.connections.size;
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

  /**
   * Host-only: forcibly remove a player. Tells the kicked client why (so it can
   * show the reason and bail out), tells everyone else they left, and tears down
   * the connection. Safe to call for a manual lobby kick or an anti-cheat
   * ejection. No-op for guests or for the host trying to kick itself.
   */
  kickPlayer(playerId: string, reason: string): void {
    if (!this.isHost || playerId === this.localPlayer.id) return;

    const conn = this.connections.get(playerId);
    if (conn) {
      // Address the kick to the target so only they react, then close the link
      // after a short beat so the message has time to flush.
      this.sendMessage(conn, { type: 'player_kicked', targetId: playerId, reason });
      setTimeout(() => { try { conn.close(); } catch { /* already closed */ } }, 200);
    }

    // Drop them locally and let the rest of the lobby know.
    this.connections.delete(playerId);
    this.remotePlayers.delete(playerId);
    this.readyPeers.delete(playerId);
    this.antiCheat.delete(playerId);
    this.gameState?.players.delete(playerId);

    this.broadcastMessage({ type: 'player_left', playerId });

    // Fire the local handler so the host's own UI updates immediately.
    const handlers = this.messageHandlers.get('player_left');
    if (handlers) {
      handlers.forEach(handler => handler({ type: 'player_left', playerId }));
    }
  }

  /**
   * Host-side movement sanity check for one incoming guest snapshot. Returns a
   * kick reason string when a player has racked up enough consecutive
   * physically-impossible jumps, else null.
   *
   * Deliberately conservative so it NEVER fights legitimate play or powerups:
   *  - the per-update distance ceiling is far beyond any dash + speed-boost
   *    combo (≈120 u/s plus a 45-unit burst headroom);
   *  - respawns / alive-state flips and long gaps (lag, backgrounded tabs) are
   *    skipped and bleed a strike off;
   *  - a violation must repeat 4× in a row to eject, so a single teleport
   *    (lag-batched movement, physics nudge) is harmless.
   */
  private inspectMovement(p: PlayerData): string | null {
    const now = Date.now();
    const prev = this.antiCheat.get(p.id);
    const cur = { x: p.position.x, z: p.position.z, t: now, strikes: prev?.strikes ?? 0, alive: p.isAlive };
    this.antiCheat.set(p.id, cur);

    if (!prev) return null; // first sample — nothing to compare against
    const dt = now - prev.t;

    // Skip windows where a big jump is expected/legitimate: respawn or
    // alive→dead→alive flips, dead players, and large time gaps (lag spikes,
    // backgrounded tabs). Decay strikes so transient noise can't accumulate.
    if (dt <= 0 || dt > 700 || prev.alive !== p.isAlive || !p.isAlive) {
      cur.strikes = Math.max(0, (prev.strikes ?? 0) - 1);
      return null;
    }

    const dist = Math.hypot(p.position.x - prev.x, p.position.z - prev.z);
    const maxDist = 0.12 * dt + 45; // ≈120 u/s sustained + 45u dash/burst headroom

    if (dist > maxDist) {
      cur.strikes = (prev.strikes ?? 0) + 1;
      if (cur.strikes >= 4) return 'Anti-cheat: impossible movement detected.';
      return null;
    }

    // Clean update — relax one strike.
    cur.strikes = Math.max(0, (prev.strikes ?? 0) - 1);
    return null;
  }

  private checkGameOver() {
    if (!this.gameState) return;

    const allPlayers = Array.from(this.gameState.players.values());
    const alivePlayers = allPlayers.filter(p => p.isAlive);

    let shouldEndGame = false;

    // Game ends when all players are dead OR only one player remains in survival mode
    if (alivePlayers.length === 0) {
      shouldEndGame = true;
    } else if (alivePlayers.length === 1 && allPlayers.length > 1 && this.gameState.gameMode === 'survival') {
      shouldEndGame = true;
    }

    // Only host broadcasts game over
    if (shouldEndGame && this.isHost) {
      // Winner is ALWAYS the player with the most kills
      const sortedByKills = [...allPlayers].sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return b.score - a.score; // Tiebreaker: higher score
      });
      const winner = sortedByKills[0];

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
    timeOfDay?: 'day' | 'night' | 'auto',
  ) {
    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot restart - not host or no game state');
      return;
    }

    // Reset stats locally
    this.resetGameStats();

    // Fresh match → guests re-warm and must re-signal readiness.
    this.readyPeers.clear();
    this.antiCheat.clear();

    // Use previous settings if not overridden
    const mode = gameMode || this.gameState.gameMode;
    const tLimit = timeLimit !== undefined ? timeLimit : this.gameState.timeLimit;
    const mapId = map !== undefined ? map : this.gameState.map;
    const diff = difficulty !== undefined ? difficulty : this.gameState.difficulty;
    const tod = timeOfDay !== undefined ? timeOfDay : this.gameState.timeOfDay;

    // Update game state with fresh start time
    this.gameState.gameMode = mode;
    this.gameState.timeLimit = tLimit;
    this.gameState.startTime = Date.now();
    this.gameState.map = mapId;
    this.gameState.difficulty = diff;
    this.gameState.timeOfDay = tod;

    // Make sure local player is in gameState.players
    this.gameState.players.set(this.localPlayer.id, this.localPlayer);

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
        timeOfDay: this.gameState.timeOfDay,
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

    const lobbyMessage = {
      type: 'return_to_lobby' as const,
      gameState: {
        players: Array.from(this.gameState.players.values()),
        gameMode: this.gameState.gameMode,
        timeLimit: this.gameState.timeLimit,
        hostId: this.gameState.hostId,
        map: this.gameState.map,
        difficulty: this.gameState.difficulty,
        timeOfDay: this.gameState.timeOfDay,
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
    timeOfDay?: 'day' | 'night' | 'auto',
  ) {
    if (!this.isHost || !this.gameState) {
      console.warn('[MultiplayerManager] Cannot start game - not host or no game state');
      return;
    }

    // Fresh match → guests must re-signal readiness before the enemy stream
    // resumes (they each re-run warmup on game_start).
    this.readyPeers.clear();
    this.antiCheat.clear();

    this.gameState.gameMode = gameMode;
    this.gameState.timeLimit = timeLimit;
    this.gameState.startTime = Date.now();
    this.gameState.map = map;
    this.gameState.difficulty = difficulty;
    this.gameState.timeOfDay = timeOfDay ?? 'auto';

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
        timeOfDay: this.gameState.timeOfDay,
      }
    };

    this.broadcastMessage(gameStartMessage);
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
      return () => this.offMessage(type, handler);
    }

    handlers.add(handler);

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
    this.joinTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.joinTimeouts.clear();

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
