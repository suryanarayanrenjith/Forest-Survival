import { useState, useEffect, useRef, useCallback } from 'react';
import { MultiplayerManager } from '../utils/MultiplayerManager';

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  playerColor: number;
  message: string;
  type: 'chat' | 'emote' | 'kill' | 'system' | 'join' | 'leave';
  timestamp: number;
}

interface ChatSystemProps {
  manager: MultiplayerManager;
  isVisible: boolean;
}

const EMOTES = [
  { id: 'gg', label: 'GG! 👍', icon: '👍' },
  { id: 'help', label: 'Need Help! 🆘', icon: '🆘' },
  { id: 'follow', label: 'Follow Me! 👉', icon: '👉' },
  { id: 'nice', label: 'Nice Shot! 🎯', icon: '🎯' },
  { id: 'thanks', label: 'Thanks! 🙏', icon: '🙏' },
  { id: 'lol', label: 'LOL 😂', icon: '😂' },
  { id: 'sad', label: 'Sad 😢', icon: '😢' },
  { id: 'angry', label: 'Angry 😠', icon: '😠' },
];

// Rate limiting constants
const CHAT_COOLDOWN_MS = 500; // 500ms between chat messages
const EMOTE_COOLDOWN_MS = 1500; // 1.5s between emotes

const ChatSystem = ({ manager, isVisible }: ChatSystemProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showEmotes, setShowEmotes] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [chatCooldown, setChatCooldown] = useState(false);
  const [emoteCooldown, setEmoteCooldown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use refs to store handlers to prevent recreation on each render
  const handlersRef = useRef<{
    chatMessage?: (data: unknown) => void;
    enemyKilled?: (data: unknown) => void;
    playerJoined?: (data: unknown) => void;
    playerLeft?: (data: unknown) => void;
  }>({});

  // Memoized handler for chat messages
  const handleChatMessage = useCallback((data: unknown) => {
    const msgData = data as {
      playerId: string;
      playerName: string;
      playerColor: number;
      message: string;
      messageType?: string;
      timestamp?: number;
    };
    const msg: ChatMessage = {
      id: `${msgData.playerId}-${msgData.timestamp || Date.now()}`,
      playerId: msgData.playerId,
      playerName: msgData.playerName,
      playerColor: msgData.playerColor,
      message: msgData.message,
      type: (msgData.messageType || 'chat') as ChatMessage['type'],
      timestamp: msgData.timestamp || Date.now()
    };
    setMessages(prev => [...prev, msg].slice(-50));
  }, []);

  // Memoized handler for enemy kills
  const handleEnemyKilled = useCallback((data: unknown) => {
    const killData = data as { playerId: string };
    const player = manager.getAllPlayers().find(p => p.id === killData.playerId);
    if (player) {
      const msg: ChatMessage = {
        id: `kill-${Date.now()}-${Math.random()}`,
        playerId: killData.playerId,
        playerName: player.name,
        playerColor: player.color,
        message: `killed an enemy! 💀`,
        type: 'kill',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, msg].slice(-50));
    }
  }, [manager]);

  // Memoized handler for player joins
  const handlePlayerJoined = useCallback((data: unknown) => {
    const joinData = data as { data: { id: string; name: string; color: number } };
    const msg: ChatMessage = {
      id: `join-${joinData.data.id}-${Date.now()}`,
      playerId: joinData.data.id,
      playerName: joinData.data.name,
      playerColor: joinData.data.color,
      message: 'joined the game',
      type: 'join',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, msg].slice(-50));
  }, []);

  // Memoized handler for player leaves
  const handlePlayerLeft = useCallback((data: unknown) => {
    const leftData = data as { playerId: string };
    const msg: ChatMessage = {
      id: `leave-${leftData.playerId}-${Date.now()}`,
      playerId: leftData.playerId,
      playerName: 'Player',
      playerColor: 0xffffff,
      message: 'left the game',
      type: 'leave',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, msg].slice(-50));
  }, []);

  // Register handlers once and clean up on unmount
  useEffect(() => {
    // Store handlers in ref so we can clean them up
    handlersRef.current = {
      chatMessage: handleChatMessage,
      enemyKilled: handleEnemyKilled,
      playerJoined: handlePlayerJoined,
      playerLeft: handlePlayerLeft
    };

    // Register handlers and store unsubscribe functions
    const unsubChatMessage = manager.onMessage('chat_message', handleChatMessage);
    const unsubEnemyKilled = manager.onMessage('enemy_killed', handleEnemyKilled);
    const unsubPlayerJoined = manager.onMessage('player_joined', handlePlayerJoined);
    const unsubPlayerLeft = manager.onMessage('player_left', handlePlayerLeft);

    // Cleanup function - removes handlers when component unmounts or manager changes
    return () => {
      unsubChatMessage();
      unsubEnemyKilled();
      unsubPlayerJoined();
      unsubPlayerLeft();
    };
  }, [manager, handleChatMessage, handleEnemyKilled, handlePlayerJoined, handlePlayerLeft]);

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!inputValue.trim() || chatCooldown) return;

    const localPlayer = manager.getLocalPlayer();

    // Apply rate limiting
    setChatCooldown(true);
    setTimeout(() => setChatCooldown(false), CHAT_COOLDOWN_MS);

    // Broadcast message
    manager.broadcastMessage({
      type: 'chat_message',
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      playerColor: localPlayer.color,
      message: inputValue,
      messageType: 'chat',
      timestamp: Date.now()
    });

    // Add to local messages
    const msg: ChatMessage = {
      id: `${localPlayer.id}-${Date.now()}`,
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      playerColor: localPlayer.color,
      message: inputValue,
      type: 'chat',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, msg].slice(-50));

    setInputValue('');
    inputRef.current?.focus();
  };

  const sendEmote = (emote: typeof EMOTES[0]) => {
    if (emoteCooldown) return;

    const localPlayer = manager.getLocalPlayer();

    // Apply rate limiting
    setEmoteCooldown(true);
    setTimeout(() => setEmoteCooldown(false), EMOTE_COOLDOWN_MS);

    // Broadcast emote
    manager.broadcastMessage({
      type: 'chat_message',
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      playerColor: localPlayer.color,
      message: emote.label,
      messageType: 'emote',
      timestamp: Date.now()
    });

    // Add to local messages
    const msg: ChatMessage = {
      id: `${localPlayer.id}-${Date.now()}`,
      playerId: localPlayer.id,
      playerName: localPlayer.name,
      playerColor: localPlayer.color,
      message: emote.label,
      type: 'emote',
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, msg].slice(-50));

    setShowEmotes(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    } else if (e.key === 'Escape') {
      setInputValue('');
      inputRef.current?.blur();
    }
  };

  const getMessageStyle = (msg: ChatMessage) => {
    switch (msg.type) {
      case 'kill':
        return {
          bg: 'bg-red-900/40',
          border: 'border-red-500/30',
          icon: '💀'
        };
      case 'emote':
        return {
          bg: 'bg-purple-900/40',
          border: 'border-purple-500/30',
          icon: '💬'
        };
      case 'join':
        return {
          bg: 'bg-green-900/40',
          border: 'border-green-500/30',
          icon: '✅'
        };
      case 'leave':
        return {
          bg: 'bg-gray-900/40',
          border: 'border-gray-500/30',
          icon: '👋'
        };
      case 'system':
        return {
          bg: 'bg-blue-900/40',
          border: 'border-blue-500/30',
          icon: '📢'
        };
      default:
        return {
          bg: 'bg-gray-900/60',
          border: 'border-gray-600/30',
          icon: '💬'
        };
    }
  };

  // Safe color formatting to handle edge cases
  const formatColor = (color: number): string => {
    if (typeof color !== 'number' || color < 0) {
      return '#ffffff';
    }
    return `#${Math.abs(color).toString(16).padStart(6, '0')}`;
  };

  if (!isVisible) return null;

  return (
    <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 space-y-2" style={{ zIndex: 30 }}>
      {/* Chat Messages - Responsive sizing */}
      {showChat && (
        <div className="w-[280px] sm:w-80 md:w-96 h-48 sm:h-56 md:h-64 bg-black/80 backdrop-blur-sm border-2 border-gray-600/50 rounded-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-700 px-2 sm:px-3 py-1.5 sm:py-2 flex items-center justify-between border-b border-gray-600/50">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-green-400 text-base sm:text-lg">💬</span>
              <span className="text-white font-bold text-xs sm:text-sm">CHAT</span>
              {chatCooldown && (
                <span className="text-yellow-400 text-[10px] animate-pulse">●</span>
              )}
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-400 hover:text-white transition-colors text-xs p-1"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 text-[10px] sm:text-xs mt-4">
                No messages yet. Say hello! 👋
              </div>
            )}
            {messages.map((msg) => {
              const style = getMessageStyle(msg);
              const colorHex = formatColor(msg.playerColor);

              return (
                <div
                  key={msg.id}
                  className={`${style.bg} border ${style.border} rounded px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs animate-fadeIn`}
                >
                  <div className="flex items-start gap-1">
                    <span className="text-xs sm:text-sm flex-shrink-0">{style.icon}</span>
                    <div className="flex-1 min-w-0 break-words">
                      <span
                        className="font-bold"
                        style={{ color: colorHex }}
                      >
                        {msg.playerName}
                      </span>
                      {msg.type === 'chat' || msg.type === 'emote' ? (
                        <span className="text-white ml-1">: {msg.message}</span>
                      ) : (
                        <span className="text-gray-300 ml-1">{msg.message}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-1.5 sm:p-2 border-t border-gray-600/50 bg-gray-900/50">
            <div className="flex gap-1 sm:gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Chat..."
                className={`flex-1 px-2 sm:px-3 py-1 bg-gray-800 text-white text-xs sm:text-sm rounded border border-gray-600/50 focus:outline-none focus:border-green-500/50 min-w-0 ${chatCooldown ? 'opacity-50' : ''}`}
                maxLength={100}
                disabled={chatCooldown}
              />
              <button
                onClick={() => setShowEmotes(!showEmotes)}
                className={`px-2 sm:px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded transition-colors flex-shrink-0 ${emoteCooldown ? 'opacity-50' : ''}`}
                title="Emotes"
              >
                😊
              </button>
              <button
                onClick={sendMessage}
                disabled={chatCooldown}
                className={`px-2 sm:px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm rounded transition-colors flex-shrink-0 ${chatCooldown ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="hidden sm:inline">Send</span>
                <span className="sm:hidden">➤</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emote Picker - Responsive */}
      {showEmotes && (
        <div className="w-[280px] sm:w-80 md:w-96 bg-black/90 backdrop-blur-sm border-2 border-purple-500/50 rounded-lg p-2 sm:p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-purple-400 font-bold text-xs sm:text-sm">Quick Emotes</span>
            {emoteCooldown && (
              <span className="text-yellow-400 text-[10px]">Cooldown...</span>
            )}
            <button
              onClick={() => setShowEmotes(false)}
              className="text-gray-400 hover:text-white transition-colors text-xs p-1"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1 sm:gap-2">
            {EMOTES.map((emote) => (
              <button
                key={emote.id}
                onClick={() => sendEmote(emote)}
                disabled={emoteCooldown}
                className={`bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 hover:border-purple-400/50 rounded px-1 sm:px-2 py-1.5 sm:py-2 text-center transition-all transform hover:scale-105 ${emoteCooldown ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="text-lg sm:text-2xl mb-0.5 sm:mb-1">{emote.icon}</div>
                <div className="text-white text-[8px] sm:text-xs truncate">{emote.label.split(' ')[0]}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toggle Chat Button (when hidden) */}
      {!showChat && (
        <button
          onClick={() => setShowChat(true)}
          className="bg-gray-900/70 hover:bg-gray-800/70 backdrop-blur-sm border-2 border-gray-600/50 hover:border-green-500/50 rounded-lg px-3 sm:px-4 py-1.5 sm:py-2 text-white font-bold text-sm transition-all"
        >
          💬 <span className="hidden sm:inline">Open </span>Chat
        </button>
      )}

      {/* Kill Feed (top-left overlay) - Responsive */}
      <div className="fixed top-16 sm:top-20 left-2 sm:left-4 space-y-1" style={{ zIndex: 25 }}>
        {messages
          .filter(m => m.type === 'kill' || m.type === 'join' || m.type === 'leave')
          .slice(-5)
          .map((msg) => {
            const style = getMessageStyle(msg);
            const colorHex = formatColor(msg.playerColor);

            return (
              <div
                key={msg.id}
                className={`${style.bg} border ${style.border} rounded-lg px-2 sm:px-3 py-1 sm:py-2 backdrop-blur-sm animate-slideInLeft max-w-[200px] sm:max-w-xs`}
              >
                <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-sm">
                  <span className="text-sm sm:text-lg flex-shrink-0">{style.icon}</span>
                  <span
                    className="font-bold truncate"
                    style={{ color: colorHex }}
                  >
                    {msg.playerName}
                  </span>
                  <span className="text-gray-300 truncate">{msg.message}</span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default ChatSystem;
