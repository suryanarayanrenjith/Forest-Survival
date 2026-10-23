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

  killFeedEntries = [entry, ...killFeedEntries].slice(0, 5);

  if (updateCallback) {
    updateCallback();
  }
};

const TYPE_META: Record<KillFeedEntry['type'], { icon: LucideIcon; color: string }> = {
  kill: { icon: Skull, color: '#d6e4dc' },
  headshot: { icon: Crosshair, color: '#ff5a5f' },
  combo: { icon: Flame, color: '#ffb265' },
  powerup: { icon: Sparkles, color: '#c084fc' },
  wave: { icon: Waves, color: '#39d0e6' },
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
            className="relative flex items-center gap-2 py-1 pl-6 pr-3 hud-ink"
            style={{
              opacity: index === 0 ? 1 : 0.72,
              // Soft strip for legibility over bright scenes — fades out
              // toward the screen centre so it never reads as a box.
              background: isTouch
                ? 'linear-gradient(90deg, transparent, rgba(4,8,7,0.62) 22%, rgba(4,8,7,0.62) 78%, transparent)'
                : 'linear-gradient(90deg, transparent, rgba(4,8,7,0.66) 34%)',
              animation: `kfIn 0.22s ease-out ${index * 0.04}s both, kfOut 0.35s ease-in 2.0s both`,
            }}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.color }} strokeWidth={2.3} />
            <span
              className="hud-label whitespace-nowrap"
              style={{ fontSize: 11, letterSpacing: '0.14em', color: index === 0 ? 'var(--hud-ink)' : 'var(--hud-dim)' }}
            >
              {entry.message}
            </span>
            {!isTouch && <span className="absolute right-0 top-1 bottom-1 w-[2px]" style={{ background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />}
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
