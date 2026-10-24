import { useEffect } from 'react';
import { Skull, Wind, Shield, Crown, Crosshair, Radio, Zap, Radiation, type LucideIcon } from 'lucide-react';

/** Payload describing a newly-unlocked tutorial enemy. Mirrors the `EnemyIntro`
 *  interface in App.tsx so the Tutorial Enemy Director can hand it straight in.
 *  Also reused by the ARK-07 network-event announcements (uplink discovery,
 *  OVERDRIVE SURGE, NULL WAVE) via the radio / zap / radiation icons. */
export interface EnemyIntroData {
  id: number;
  name: string;
  blurb: string;
  tag: string;
  accent: string;
  icon: 'skull' | 'wind' | 'shield' | 'crown' | 'crosshair' | 'radio' | 'zap' | 'radiation';
}

interface EnemyIntroBannerProps {
  intro: EnemyIntroData | null;
  /** Called once the banner's lifetime elapses so the host can clear state. */
  onDone: () => void;
  /** Sit below the tutorial step card instead of on top of it. */
  lowered?: boolean;
}

const ICONS: Record<EnemyIntroData['icon'], LucideIcon> = {
  skull: Skull,
  wind: Wind,
  shield: Shield,
  crown: Crown,
  crosshair: Crosshair,
  radio: Radio,
  zap: Zap,
  radiation: Radiation,
};

/**
 * Tutorial-only "New Threat" card. Slides in from the top-centre whenever the
 * Tutorial Enemy Director unlocks a new enemy species, naming the foe, tagging
 * its threat profile and giving a one-line tip on how to fight it. Auto-dismisses
 * after a few seconds. Purely presentational — keyed by `intro.id` so each
 * unlock re-triggers the entrance animation even for repeat ids.
 */
const EnemyIntroBanner = ({ intro, onDone, lowered = false }: EnemyIntroBannerProps) => {
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

  // Partial-rounded tactical card (the game-wide shape language).
  const shape = '14px 3.5px';
  const shapeInner = '13px 3px';

  return (
    <div className={`pointer-events-none fixed inset-x-0 ${lowered ? 'top-[23.5rem]' : 'top-44'} z-[55] flex justify-center px-4`}>
      <div
        key={intro.id}
        className="relative w-full max-w-md select-none"
        style={{
          filter: `drop-shadow(0 0 22px ${accent}40) drop-shadow(0 8px 18px rgba(0,0,0,0.6))`,
          animation: 'enemyIntroIn 0.45s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {/* 1px accent frame + opaque body */}
        <div className="absolute inset-0" style={{ borderRadius: shape, background: `${accent}66` }} />
        <div className="relative m-px overflow-hidden" style={{ borderRadius: shapeInner, background: 'rgba(6,9,9,0.95)' }}>
          {/* Accent spine + sweep */}
          <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background: `linear-gradient(110deg, transparent 30%, ${accent}24 50%, transparent 70%)`,
              animation: 'enemyIntroSweep 1.6s ease-in-out 0.3s',
            }}
          />

          <div className="relative flex items-center gap-4 py-3.5 pl-6 pr-5">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center border"
              style={{
                borderColor: `${accent}66`,
                background: `${accent}1c`,
                borderRadius: '8px 2px',
              }}
            >
              <Icon className="h-6 w-6" strokeWidth={2.25} style={{ color: accent, filter: `drop-shadow(0 0 6px ${accent})` }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="hud-label" style={{ color: `${accent}e6` }}>New Threat</span>
                <span
                  className="font-hud px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.16em]"
                  style={{ background: `${accent}26`, color: accent, border: `1px solid ${accent}55` }}
                >
                  {intro.tag}
                </span>
              </div>
              <h3
                className="font-display mt-1 text-[22px] font-semibold uppercase leading-none text-white"
                style={{ letterSpacing: '0.1em' }}
              >
                {intro.name}
              </h3>
              <p className="font-hud mt-1.5 text-[12px] leading-snug text-white/70">{intro.blurb}</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes enemyIntroIn {
          0% { opacity: 0; transform: translateY(-22px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
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
