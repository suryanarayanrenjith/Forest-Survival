import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, X, Crown, Medal, Loader2, EyeOff } from 'lucide-react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { detectIsTouch } from '../hooks/useDeviceInfo';
import MenuShell from './MenuShell';
import UserAvatar from './UserAvatar';

/**
 * Global leaderboard — best players first, ranked by composite account XP
 * (difficulty-weighted solo rank + multiplayer + meta progression). Players
 * appear unless they opt out (see the Profile → Settings toggle).
 *
 * Exposes:
 *  • <LeaderboardList/>  — the inner ranked list, embedded in the Profile tab.
 *  • <LeaderboardMenu/>  — a standalone modal (used from the Main Menu).
 */

type Entry = {
  position: number;
  username: string;
  displayName: string;
  avatarIndex: number;
  tierName: string;
  color: string;
  level: number;
  xp: number;
  highScore: number;
  highestWave: number;
  isViewer: boolean;
};

const PODIUM_TINT = ['#fbbf24', '#cbd5e1', '#cd7f32']; // gold / silver / bronze

const Rank = ({ position, color }: { position: number; color: string }) => {
  if (position <= 3) {
    const tint = PODIUM_TINT[position - 1];
    const Icon = position === 1 ? Crown : Medal;
    return (
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
        style={{ borderColor: `${tint}55`, background: `${tint}1a`, color: tint, boxShadow: `0 0 14px ${tint}33` }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sm font-black tabular-nums text-gray-400" style={{ color: `${color}` }}>
      {position}
    </span>
  );
};

const Row = ({ e }: { e: Entry }) => (
  <div
    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
      e.isViewer
        ? 'border-emerald-400/45 bg-emerald-500/[0.10]'
        : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.045]'
    }`}
  >
    <Rank position={e.position} color={e.color} />
    <UserAvatar name={e.displayName} username={e.username} avatarIndex={e.avatarIndex} size="sm" />
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-bold text-white">{e.displayName}</span>
        {e.isViewer && (
          <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">You</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] leading-tight">
        <span className="font-semibold uppercase tracking-wide" style={{ color: e.color }}>{e.tierName}</span>
        <span className="text-gray-500">· Lvl {e.level}</span>
        <span className="hidden text-gray-600 sm:inline">· Wave {e.highestWave}</span>
      </div>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-black tabular-nums text-white">{e.xp.toLocaleString()}</p>
      <p className="text-[9px] uppercase tracking-[0.15em] text-gray-500">XP</p>
    </div>
  </div>
);

/** Inner ranked list — used standalone (modal) and embedded (Profile tab). */
export const LeaderboardList = () => {
  const data = useQuery(api.leaderboard.getLeaderboard, { limit: 50 });
  const setLeaderboardOptIn = useMutation(api.playerStats.setLeaderboardOptIn);

  const viewerInTop = useMemo(
    () => !!data?.viewer && data.entries.some((e) => e.isViewer),
    [data],
  );

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading rankings…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.viewerOptedOut && (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-[12px] text-amber-200">
            <EyeOff className="h-4 w-4 flex-shrink-0" strokeWidth={2.2} />
            You're hidden from the leaderboard.
          </p>
          <button
            onClick={() => void setLeaderboardOptIn({ optIn: true }).catch(() => {})}
            className="flex-shrink-0 rounded-lg border border-amber-400/40 bg-amber-500/[0.12] px-3 py-1.5 text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/[0.2]"
          >
            Show me on the leaderboard
          </button>
        </div>
      )}

      {data.entries.length === 0 ? (
        <div className="py-14 text-center text-sm text-gray-500">
          No ranked players yet — play a Solo run to claim the top spot.
        </div>
      ) : (
        <div className="space-y-1.5">
          {data.entries.map((e) => (
            <Row key={e.username} e={e} />
          ))}
        </div>
      )}

      {/* Viewer is ranked but fell outside the visible slice. */}
      {data.viewer && !viewerInTop && !data.viewerOptedOut && (
        <>
          <div className="flex items-center gap-2 px-1 pt-1 text-[10px] uppercase tracking-[0.2em] text-gray-600">
            <span className="h-px flex-1 bg-white/10" /> Your rank <span className="h-px flex-1 bg-white/10" />
          </div>
          <Row e={data.viewer} />
        </>
      )}
    </div>
  );
};

interface LeaderboardMenuProps {
  onClose: () => void;
}

/** Standalone modal wrapper (Main Menu entry). */
const LeaderboardMenu = ({ onClose }: LeaderboardMenuProps) => {
  const isTouch = detectIsTouch();
  return createPortal(
    <div
      className={isTouch
        ? 'm-safe fixed inset-0 z-50 flex flex-col'
        : 'fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-4'}
      style={{ background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(14px)' }}
    >
      <MenuShell variant="main" />

      <div
        className={isTouch
          ? 'm-sheet-in relative z-10 flex h-full w-full flex-col overflow-hidden border-t border-white/10 bg-[#0b0f15]'
          : 'relative z-10 flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0f15] shadow-[0_30px_120px_rgba(0,0,0,0.58)]'}
        style={isTouch ? undefined : { animation: 'authFade 0.32s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Header */}
        <div className={`flex flex-none items-center justify-between border-b border-white/[0.07] ${isTouch ? 'gap-2 px-3 py-1.5' : 'items-start gap-4 px-5 py-4'}`}>
          <div className={`flex items-center ${isTouch ? 'gap-2' : 'gap-3'}`}>
            <div className={`relative flex items-center justify-center rounded-lg border border-amber-400/30 bg-amber-500/12 ${isTouch ? 'h-7 w-7' : 'h-10 w-10 rounded-xl'}`}>
              <Trophy className={isTouch ? 'h-4 w-4 text-amber-300' : 'h-5 w-5 text-amber-300'} strokeWidth={2.1} />
            </div>
            <div>
              {!isTouch && <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-300/90">Global</p>}
              <h2 className={`font-bold tracking-wide text-white ${isTouch ? 'text-sm leading-none' : 'text-lg'}`}>Leaderboard</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close leaderboard"
            className={`flex flex-none items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white ${isTouch ? 'm-tap h-8 w-8' : 'h-9 w-9'}`}
          >
            <X className={isTouch ? 'h-4 w-4' : 'h-[18px] w-[18px]'} strokeWidth={2.25} />
          </button>
        </div>

        <div className={`m-scroll flex-1 overflow-y-auto ${isTouch ? 'p-3' : 'p-5 sm:p-6'}`}>
          <LeaderboardList />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LeaderboardMenu;
