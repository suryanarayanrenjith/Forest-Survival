import { useState, useEffect } from 'react';
import { Skull, Crosshair, Flame, Sparkles, Waves, type LucideIcon } from 'lucide-react';

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

const TYPE_META: Record<KillFeedEntry['type'], { icon: LucideIcon; color: string }> = {
  kill: { icon: Skull, color: '#9ca3af' },
  headshot: { icon: Crosshair, color: '#f87171' },
  combo: { icon: Flame, color: '#fb923c' },
  powerup: { icon: Sparkles, color: '#c084fc' },
  wave: { icon: Waves, color: '#38bdf8' },
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

  return (
    <div className="fixed top-36 right-4 z-40 flex flex-col items-end gap-1.5 pointer-events-none">
      {entries.map((entry, index) => {
        const meta = TYPE_META[entry.type];
        const Icon = meta.icon;
        return (
          <div
            key={entry.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/65 backdrop-blur-md px-3 py-1.5"
            style={{
              opacity: index === 0 ? 1 : 0.7,
              animation: `kfIn 0.25s ease-out ${index * 0.04}s both, kfOut 0.5s ease-in 4.5s both`,
            }}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2.25} />
            <span className="text-xs font-semibold text-gray-200 tracking-wide whitespace-nowrap">
              {entry.message}
            </span>
          </div>
        );
      })}
      <style>{`
        @keyframes kfIn {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes kfOut {
          from { opacity: 1; }
          to { opacity: 0; transform: translateX(16px); }
        }
      `}</style>
    </div>
  );
};

export default KillFeed;
