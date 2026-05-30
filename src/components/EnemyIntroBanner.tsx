import { useEffect } from 'react';
import { Skull, Wind, Shield, Crown, type LucideIcon } from 'lucide-react';

/** Payload describing a newly-unlocked tutorial enemy. Mirrors the `EnemyIntro`
 *  interface in App.tsx so the Tutorial Enemy Director can hand it straight in. */
export interface EnemyIntroData {
  id: number;
  name: string;
  blurb: string;
  tag: string;
  accent: string;
  icon: 'skull' | 'wind' | 'shield' | 'crown';
}

interface EnemyIntroBannerProps {
  intro: EnemyIntroData | null;
  /** Called once the banner's lifetime elapses so the host can clear state. */
  onDone: () => void;
}

const ICONS: Record<EnemyIntroData['icon'], LucideIcon> = {
  skull: Skull,
  wind: Wind,
  shield: Shield,
  crown: Crown,
};

/**
 * Tutorial-only "New Threat" card. Slides in from the top-centre whenever the
 * Tutorial Enemy Director unlocks a new enemy species, naming the foe, tagging
 * its threat profile and giving a one-line tip on how to fight it. Auto-dismisses
 * after a few seconds. Purely presentational — keyed by `intro.id` so each
 * unlock re-triggers the entrance animation even for repeat ids.
 */
const EnemyIntroBanner = ({ intro, onDone }: EnemyIntroBannerProps) => {
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(onDone, 5200);
    return () => clearTimeout(timer);
    // Re-arm whenever a new species is announced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intro?.id]);

  if (!intro) return null;

  const Icon = ICONS[intro.icon] ?? Skull;
  const { accent } = intro;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-[55] flex justify-center px-4">
      <div
        key={intro.id}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-black/80 backdrop-blur-md shadow-2xl"
        style={{
          borderColor: `${accent}66`,
          boxShadow: `0 0 40px ${accent}33`,
          animation: 'enemyIntroIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {/* Accent top bar */}
        <div className="h-1 w-full" style={{ background: accent }} />
        {/* Sweeping shimmer */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background: `linear-gradient(110deg, transparent 30%, ${accent}22 50%, transparent 70%)`,
            animation: 'enemyIntroSweep 1.6s ease-in-out 0.3s',
          }}
        />

        <div className="flex items-center gap-4 px-5 py-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: `${accent}55`, background: `${accent}1f` }}
          >
            <Icon className="h-6 w-6" strokeWidth={2.25} style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold tracking-[0.25em] text-gray-400 uppercase">
                New Threat
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold tracking-[0.12em]"
                style={{ background: `${accent}26`, color: accent }}
              >
                {intro.tag}
              </span>
            </div>
            <h3 className="mt-0.5 text-lg font-black leading-tight text-white">{intro.name}</h3>
            <p className="mt-0.5 text-xs leading-snug text-gray-300">{intro.blurb}</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes enemyIntroIn {
          0% { opacity: 0; transform: translateY(-22px) scale(0.96); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes enemyIntroSweep {
          0% { transform: translateX(-60%); }
          100% { transform: translateX(60%); }
        }
      `}</style>
    </div>
  );
};

export default EnemyIntroBanner;
