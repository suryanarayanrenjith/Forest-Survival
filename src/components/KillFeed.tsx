import { useState, useEffect } from 'react';

interface KillFeedEntry {
  id: string;
  message: string;
  type: 'kill' | 'headshot' | 'combo' | 'powerup' | 'wave';
  timestamp: number;
}

interface KillFeedProps {
  visible: boolean;
}

let killFeedEntries: KillFeedEntry[] = [];
let updateCallback: (() => void) | null = null;

export const addKillFeedEntry = (message: string, type: KillFeedEntry['type'] = 'kill') => {
  const entry: KillFeedEntry = {
    id: `${Date.now()}-${Math.random()}`,
    message,
    type,
    timestamp: Date.now()
  };

  killFeedEntries = [entry, ...killFeedEntries].slice(0, 5); // Keep last 5 entries

  if (updateCallback) {
    updateCallback();
  }
};

const KillFeed = ({ visible }: KillFeedProps) => {
  const [entries, setEntries] = useState<KillFeedEntry[]>([]);

  useEffect(() => {
    updateCallback = () => {
      setEntries([...killFeedEntries]);
    };

    return () => {
      updateCallback = null;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      killFeedEntries = killFeedEntries.filter(entry => now - entry.timestamp < 5000);
      setEntries([...killFeedEntries]);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!visible || entries.length === 0) return null;

  const getIcon = (type: KillFeedEntry['type']) => {
    switch (type) {
      case 'headshot': return '💀';
      case 'combo': return '🔥';
      case 'powerup': return '⭐';
      case 'wave': return '🎯';
      default: return '☠️';
    }
  };

  const getColor = (type: KillFeedEntry['type']) => {
    switch (type) {
      case 'headshot': return 'from-red-500 to-orange-500';
      case 'combo': return 'from-yellow-500 to-orange-500';
      case 'powerup': return 'from-purple-500 to-pink-500';
      case 'wave': return 'from-blue-500 to-cyan-500';
      default: return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <div className="fixed top-20 right-4 z-40 space-y-2 pointer-events-none">
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className={`
            bg-gradient-to-r ${getColor(entry.type)}
            text-white px-4 py-2 rounded-lg shadow-lg
            transform transition-all duration-300
            animate-slideInRight
            ${index > 0 ? 'opacity-80' : 'opacity-100'}
          `}
          style={{
            animation: `slideInRight 0.3s ease-out ${index * 0.05}s both, fadeOut 0.5s ease-in 4.5s both`
          }}
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <span className="text-xl">{getIcon(entry.type)}</span>
            <span>{entry.message}</span>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(20px);
          }
        }
      `}</style>
    </div>
  );
};

export default KillFeed;
