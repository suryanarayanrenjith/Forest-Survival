import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Smile, Send, Skull, MessageCircle, LogIn, LogOut, Megaphone, type LucideIcon } from 'lucide-react';
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
        message: `eliminated an enemy`,
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

  const getMessageStyle = (msg: ChatMessage): { bg: string; border: string; icon: LucideIcon; iconColor: string } => {
    switch (msg.type) {
      case 'kill':
        return { bg: 'bg-red-500/[0.08]', border: 'border-red-500/25', icon: Skull, iconColor: '#f87171' };
      case 'emote':
        return { bg: 'bg-violet-500/[0.08]', border: 'border-violet-500/25', icon: MessageCircle, iconColor: '#c084fc' };
      case 'join':
        return { bg: 'bg-emerald-500/[0.08]', border: 'border-emerald-500/25', icon: LogIn, iconColor: '#34d399' };
      case 'leave':
        return { bg: 'bg-white/[0.04]', border: 'border-white/10', icon: LogOut, iconColor: '#9ca3af' };
      case 'system':
        return { bg: 'bg-sky-500/[0.08]', border: 'border-sky-500/25', icon: Megaphone, iconColor: '#38bdf8' };
      default:
        return { bg: 'bg-white/[0.04]', border: 'border-white/10', icon: MessageCircle, iconColor: '#9ca3af' };
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
          <div className="px-3 py-2 flex items-center justify-between border-b border-white/[0.07]">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
              <span className="text-white font-semibold text-xs tracking-[0.12em] uppercase">Chat</span>
              {chatCooldown && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            </div>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-500 hover:text-white transition-colors"
              aria-label="Hide chat"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-1.5 sm:p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
            {messages.length === 0 && (
              <div className="text-center text-gray-600 text-xs mt-4">
                No messages yet — say hello.
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
                  <div className="flex items-start gap-1.5">
                    <style.icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: style.iconColor }} strokeWidth={2.25} />
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
                className={`flex items-center justify-center w-8 py-1 rounded-md bg-violet-500/20 border border-violet-500/30 text-violet-300 transition-colors hover:bg-violet-500/30 flex-shrink-0 ${emoteCooldown ? 'opacity-50' : ''}`}
                title="Emotes"
              >
                <Smile className="w-4 h-4" strokeWidth={2.25} />
              </button>
              <button
                onClick={sendMessage}
                disabled={chatCooldown}
                className={`flex items-center justify-center w-8 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-colors hover:bg-emerald-500/30 flex-shrink-0 ${chatCooldown ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" strokeWidth={2.25} />
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
              className="text-gray-500 hover:text-white transition-colors"
              aria-label="Close emotes"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
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
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/70 backdrop-blur-md
            px-3.5 py-2 text-sm font-semibold text-gray-300 transition-all hover:text-white hover:bg-black/80 hover:border-emerald-500/40"
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
          <span className="hidden sm:inline">Open </span>Chat
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
                <div className="flex items-center gap-2 text-[10px] sm:text-sm">
                  <style.icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: style.iconColor }} strokeWidth={2.25} />
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
