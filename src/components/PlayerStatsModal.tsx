import { X, Lock, Loader2 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import UserAvatar from './UserAvatar';

interface PlayerStatsModalProps {
  username: string;
  onClose: () => void;
}

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="font-hud text-[11px] text-gray-400">{label}</span>
    <span className="font-bold text-white tabular-nums">{value}</span>
  </div>
);

const PlayerStatsModal = ({ username, onClose }: PlayerStatsModalProps) => {
  const profile = useQuery(api.playerStats.getPublicProfile, { username });

  const loading = profile === undefined;
  const notFound = profile === null;
  const solo = profile && !notFound ? profile.solo : undefined;
  const mp = profile && !notFound ? profile.multiplayer : undefined;
  const mpKd = mp ? (mp.totalDeaths > 0 ? (mp.totalKills / mp.totalDeaths).toFixed(2) : `${mp.totalKills}`) : '0';
  const mpWinRate = mp && mp.gamesPlayed > 0 ? Math.round((mp.wins / mp.gamesPlayed) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(5,8,10,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="hud-frame relative max-h-[94dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
        style={{ animation: 'authFade 0.25s cubic-bezier(0.16,1,0.3,1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <p className="font-hud text-[10px] tracking-[0.32em] text-emerald-300/90 font-semibold uppercase">Player</p>
          <button onClick={onClose} aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-gray-400 transition-colors hover:text-white hover:bg-white/[0.06]">
            <X className="w-4 h-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" strokeWidth={2} />
              <p className="text-sm text-gray-400">Loading profile…</p>
            </div>
          ) : notFound ? (
            <div className="py-6 text-center">
              <p className="text-sm font-semibold text-white">{username}</p>
              <p className="mt-1 text-xs text-gray-500">No account profile found for this player.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <UserAvatar username={profile.username} name={profile.displayName} avatarIndex={profile.avatarIndex} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-display truncate text-xl font-semibold tracking-wide text-white">{profile.displayName}</h3>
                  <p className="font-hud truncate text-sm text-gray-400">@{profile.username}</p>
                  {/* Inline rank chip — replaces the floating hexagon badge that
                      used to overlap the header in tight lobby cards. */}
                  <span
                    className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: profile.rank.color, background: `${profile.rank.color}1f`, border: `1px solid ${profile.rank.color}55` }}
                  >
                    {profile.rank.tierName} · Lvl {profile.rank.level}
                  </span>
                </div>
              </div>

              {profile.isPrivate && !profile.isOwnProfile ? (
                <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-6">
                  <Lock className="w-6 h-6 text-gray-500" strokeWidth={2} />
                  <p className="text-sm font-semibold text-gray-300">Stats are private</p>
                  <p className="text-[11px] text-gray-500">This player has hidden their detailed stats.</p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {/* Own profile while private — you can always see your own stats;
                      this just reminds you other players can't. */}
                  {profile.isPrivate && profile.isOwnProfile && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2">
                      <Lock className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" strokeWidth={2.25} />
                      <p className="text-[11px] text-amber-200/90">Your stats are private — only you can see these.</p>
                    </div>
                  )}
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
                    <p className="font-hud text-[11px] font-semibold text-emerald-300 uppercase tracking-[0.18em]">Solo</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <StatRow label="High Score" value={(solo?.highScore ?? 0).toLocaleString()} />
                      <StatRow label="Best Wave" value={`${solo?.highestWave ?? 0}`} />
                      <StatRow label="Kills" value={(solo?.totalKills ?? 0).toLocaleString()} />
                      <StatRow label="Runs" value={`${solo?.totalRuns ?? 0}`} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-3">
                    <p className="font-hud text-[11px] font-semibold text-sky-300 uppercase tracking-[0.18em]">Multiplayer</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <StatRow label="High Score" value={(mp?.highScore ?? 0).toLocaleString()} />
                      <StatRow label="Wins" value={`${mp?.wins ?? 0}`} />
                      <StatRow label="Games" value={`${mp?.gamesPlayed ?? 0}`} />
                      <StatRow label="Win Rate" value={`${mpWinRate}%`} />
                      <StatRow label="Kills" value={(mp?.totalKills ?? 0).toLocaleString()} />
                      <StatRow label="K/D" value={`${mpKd}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-around rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
                    <div>
                      <div className="font-display text-lg font-semibold text-amber-200 tabular-nums">{profile.achievementsCount ?? 0}</div>
                      <div className="font-hud text-[9px] font-semibold tracking-[0.12em] text-gray-400 uppercase">Trophies</div>
                    </div>
                    <div>
                      <div className="font-display text-lg font-semibold text-white tabular-nums">{profile.skillsCount ?? 0}</div>
                      <div className="font-hud text-[9px] font-semibold tracking-[0.12em] text-gray-400 uppercase">Skills</div>
                    </div>
                    <div>
                      <div className="font-display text-lg font-semibold text-violet-200 tabular-nums">{profile.rank.xp.toLocaleString()}</div>
                      <div className="font-hud text-[9px] font-semibold tracking-[0.12em] text-gray-400 uppercase">XP</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes authFade {
          from { opacity: 0; transform: scale(0.96) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default PlayerStatsModal;
