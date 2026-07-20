import { Skull, Target } from 'lucide-react';

interface CombatStatsPanelProps {
  /** Enemies eliminated this run. */
  kills: number;
  /** Critical (headshot) kills this run. */
  headshots: number;
  className?: string;
}

/**
 * Compact combat-stats readout — kills + headshots for the CURRENT run, at a
 * glance. Docked directly under the Solo/Tutorial tactical map (see App.tsx's
 * flex-column stack, and MultiplayerHUD for the equivalent multiplayer
 * layout): both live in the same document-flow column as the radar panel, so
 * the two can never overlap regardless of either one's exact rendered height.
 *
 * Multiplayer omits this panel — per-player headshots aren't tracked over the
 * network, and the scoreboard already surfaces kills per player.
 */
const CombatStatsPanel = ({ kills, headshots, className = '' }: CombatStatsPanelProps) => (
  <div className={`flex-shrink-0 rounded-xl border border-white/10 bg-black/80 overflow-hidden ${className}`}>
    <div className="flex items-stretch divide-x divide-white/[0.07]">
      <div className="flex flex-1 items-center justify-center gap-2 py-2">
        <Skull className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" strokeWidth={2.25} />
        <span className="flex flex-col leading-none">
          <span className="text-sm font-bold tabular-nums text-white">{kills}</span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-gray-500">Kills</span>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center gap-2 py-2">
        <Target className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" strokeWidth={2.25} />
        <span className="flex flex-col leading-none">
          <span className="text-sm font-bold tabular-nums text-amber-300">{headshots}</span>
          <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-500/70">Headshots</span>
        </span>
      </div>
    </div>
  </div>
);

export default CombatStatsPanel;
