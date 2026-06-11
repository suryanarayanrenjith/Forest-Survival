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
  /** Top-right anchor classes for the feed container. Solo/Tutorial dock the
   *  tactical radar directly under the score panel, so the feed is pushed below
   *  it (default sits high, used by multiplayer where that corner is free). */
  anchorClass?: string;
  /** Touch: centre the entries (the feed moves to the top-centre safe lane,
   *  not the right edge, which is occupied by the control toggle rail). */
  isTouch?: boolean;
}

let killFeedEntries: KillFeedEntry[] = [];
let updateCallback: (() => void) | null = null;

export const addKillFeedEntry = (message: string, type: KillFeedEntry['type'] = 'kill') => {
  // Power-up events are intentionally NOT shown in the kill feed — the
  // bottom-centre toast already announces them. This keeps the top-right
  // corner clean of the "X Active!" indicators for every power-up.
  if (type === 'powerup') return;

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

const KillFeed = ({ visible, anchorClass = 'top-36 right-4', isTouch = false }: KillFeedProps) => {
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
    // Entries fade after 2.5 s — quick enough not to crowd the HUD during
    // active combat but long enough for the player to register each event.
    const interval = setInterval(() => {
      const now = Date.now();
      killFeedEntries = killFeedEntries.filter(entry => now - entry.timestamp < 2500);
      setEntries([...killFeedEntries]);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (!visible || entries.length === 0) return null;

  return (
    <div className={`fixed ${anchorClass} z-40 flex flex-col ${isTouch ? 'items-center' : 'items-end'} gap-1.5 pointer-events-none`}>
      {entries.map((entry, index) => {
        const meta = TYPE_META[entry.type];
        const Icon = meta.icon;
        return (
          <div
            key={entry.id}
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/80 px-3 py-1.5"
            style={{
              opacity: index === 0 ? 1 : 0.7,
              animation: `kfIn 0.22s ease-out ${index * 0.04}s both, kfOut 0.35s ease-in 2.0s both`,
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
