import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  KeyRound, LogOut, ShieldCheck, X, User, BarChart3, Trophy, Settings as SettingsIcon,
  Lock, Eye, EyeOff, Check, Calendar,
} from 'lucide-react';
import { useAction, useMutation } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import { usePlayerData } from '../hooks/usePlayerData';
import MenuShell from './MenuShell';
import UserAvatar from './UserAvatar';
import RankBadge from './RankBadge';
import { AchievementSystem } from '../utils/AchievementSystem';
import { computeRank } from '../utils/rankSystem';
import { AVATARS } from '../utils/avatars';

interface ProfileMenuProps {
  onClose: () => void;
}

type TabKey = 'overview' | 'stats' | 'achievements' | 'settings';

const TABS: { key: TabKey; label: string; Icon: typeof User }[] = [
  { key: 'overview', label: 'Overview', Icon: User },
  { key: 'stats', label: 'Stats', Icon: BarChart3 },
  { key: 'achievements', label: 'Achievements', Icon: Trophy },
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
];

const RARITY_STYLE: Record<string, { ring: string; text: string; bg: string }> = {
  common: { ring: 'border-slate-400/30', text: 'text-slate-300', bg: 'bg-slate-500/10' },
  rare: { ring: 'border-sky-400/40', text: 'text-sky-300', bg: 'bg-sky-500/10' },
  epic: { ring: 'border-violet-400/40', text: 'text-violet-300', bg: 'bg-violet-500/10' },
  legendary: { ring: 'border-amber-400/50', text: 'text-amber-300', bg: 'bg-amber-500/10' },
};

function popcount(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[11px] text-gray-400">{label}</span>
    <span className="font-bold text-white tabular-nums">{value}</span>
  </div>
);

const ProfileMenu = ({ onClose }: ProfileMenuProps) => {
  const { signOut } = useAuthActions();
  const { currentUser, playerStats } = usePlayerData();
  const changePassword = useAction(api.account.changePassword);
  const setAvatar = useMutation(api.playerStats.setAvatar);
  const setStatsPrivacy = useMutation(api.playerStats.setStatsPrivacy);

  const [tab, setTab] = useState<TabKey>('overview');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const profileLoading = currentUser === undefined;
  const displayName = currentUser?.name?.trim() || currentUser?.username?.trim() || 'Player';
  const usernameLabel = currentUser?.username ? `@${currentUser.username}` : 'Loading profile...';

  const solo = playerStats?.solo;
  const mp = playerStats?.multiplayer;
  const avatarIndex = playerStats?.avatarIndex ?? 0;
  const statsPublic = playerStats?.statsPublic ?? true;
  const skillsUnlocked = playerStats ? Object.keys(playerStats.skills).length : 0;
  const achievementsUnlocked = playerStats ? popcount(playerStats.achievements) : 0;
  const mpKd = mp ? (mp.totalDeaths > 0 ? (mp.totalKills / mp.totalDeaths).toFixed(2) : `${mp.totalKills}`) : '0';
  const mpWinRate = mp && mp.gamesPlayed > 0 ? Math.round((mp.wins / mp.gamesPlayed) * 100) : 0;

  const rank = useMemo(() => {
    if (!playerStats) return null;
    return computeRank({
      solo: playerStats.solo,
      multiplayer: {
        wins: playerStats.multiplayer.wins,
        gamesPlayed: playerStats.multiplayer.gamesPlayed,
        totalKills: playerStats.multiplayer.totalKills,
      },
      achievementsCount: popcount(playerStats.achievements),
      skillsCount: Object.keys(playerStats.skills).length,
    });
  }, [playerStats]);

  const achievements = useMemo(() => {
    const sys = new AchievementSystem({ enabled: false, persistLocal: false });
    sys.hydrateFromMask(playerStats?.achievements ?? 0);
    return sys.getAllAchievements();
  }, [playerStats?.achievements]);

  useEffect(() => {
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordBusy(false);
  }, []);

  const handlePickAvatar = (index: number) => {
    if (index === avatarIndex) return;
    void setAvatar({ avatarIndex: index }).catch(() => {});
  };

  const handlePrivacy = (isPublic: boolean) => {
    if (isPublic === statsPublic) return;
    void setStatsPrivacy({ isPublic }).catch(() => {});
  };

  const submitPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (passwordBusy) return;

    const formData = new FormData(form);
    const currentPassword = String(formData.get('currentPassword') ?? '');
    const dob = String(formData.get('dob') ?? '');
    const newPassword = String(formData.get('newPassword') ?? '');
    const confirmNewPassword = String(formData.get('confirmNewPassword') ?? '');

    if (!currentPassword) return setPasswordError('Enter your current password.');
    if (!dob) return setPasswordError('Enter your date of birth to confirm it’s you.');
    if (!newPassword) return setPasswordError('Enter a new password.');
    if (newPassword !== confirmNewPassword) return setPasswordError('New passwords do not match.');

    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    try {
      await changePassword({ currentPassword, newPassword, dob });
      setPasswordSuccess('Password updated successfully.');
      form.reset();
    } catch (changeError) {
      setPasswordError(extractErrorMessage(changeError));
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (passwordBusy) return;
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await signOut();
      onClose();
    } catch (signOutError) {
      setPasswordError(extractErrorMessage(signOutError));
      setPasswordBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-4"
      style={{ background: 'rgba(5,8,10,0.94)', backdropFilter: 'blur(14px)' }}
    >
      <MenuShell variant="main" />

      <div
        className="relative z-10 flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0f15] shadow-[0_30px_120px_rgba(0,0,0,0.58)]"
        style={{ animation: 'authFade 0.32s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
            </div>
            <div>
              <p className="text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">Account</p>
              <h2 className="text-lg font-bold text-white tracking-wide">Player Profile</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close profile panel"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400 transition-colors hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/[0.07] px-3 py-2">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                tab === key ? 'bg-emerald-500/[0.12] text-emerald-200' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2.1} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent p-4">
                <UserAvatar name={currentUser?.name} username={currentUser?.username} avatarIndex={avatarIndex} size="lg" className="shadow-[0_0_0_4px_rgba(16,185,129,0.08)]" />
                <div className="min-w-0">
                  <p className="text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">Signed In</p>
                  {profileLoading ? (
                    <div className="mt-2 h-5 w-32 rounded-full bg-white/10" />
                  ) : (
                    <>
                      <h3 className="mt-1 truncate text-xl font-black tracking-tight text-white">{displayName}</h3>
                      <p className="truncate text-sm text-gray-300">{usernameLabel}</p>
                    </>
                  )}
                </div>
              </div>

              {/* Rank emblem */}
              {rank && (
                <div
                  className="relative overflow-hidden rounded-2xl border p-5"
                  style={{ borderColor: `${rank.color}33`, background: `radial-gradient(120% 140% at 0% 0%, ${rank.color}1f, transparent 55%), rgba(255,255,255,0.02)` }}
                >
                  <p className="mb-3 text-[10px] tracking-[0.35em] font-semibold uppercase" style={{ color: rank.color }}>
                    Rank
                  </p>
                  <RankBadge rank={rank} variant="featured" />
                </div>
              )}

              {/* Headline stats */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <HeadlineStat label="Solo Best" value={(solo?.highScore ?? 0).toLocaleString()} />
                <HeadlineStat label="Best Wave" value={`${solo?.highestWave ?? 0}`} />
                <HeadlineStat label="MP Wins" value={`${mp?.wins ?? 0}`} />
                <HeadlineStat label="Trophies" value={`${achievementsUnlocked}/${achievements.length}`} />
              </div>
            </div>
          )}

          {tab === 'stats' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <HeadlineStat label="Skill Pts" value={`${playerStats?.skillPoints ?? 0}`} accent="violet" />
                <HeadlineStat label="Skills" value={`${skillsUnlocked}`} />
                <HeadlineStat label="Trophies" value={`${achievementsUnlocked}/${achievements.length}`} accent="amber" />
              </div>

              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
                <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Solo</p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <StatRow label="High Score" value={(solo?.highScore ?? 0).toLocaleString()} />
                  <StatRow label="Best Wave" value={`${solo?.highestWave ?? 0}`} />
                  <StatRow label="Total Kills" value={(solo?.totalKills ?? 0).toLocaleString()} />
                  <StatRow label="Runs" value={`${solo?.totalRuns ?? 0}`} />
                </div>
              </div>

              <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-4">
                <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide">Multiplayer</p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                  <StatRow label="High Score" value={(mp?.highScore ?? 0).toLocaleString()} />
                  <StatRow label="Wins" value={`${mp?.wins ?? 0}`} />
                  <StatRow label="Games" value={`${mp?.gamesPlayed ?? 0}`} />
                  <StatRow label="Win Rate" value={`${mpWinRate}%`} />
                  <StatRow label="Kills" value={(mp?.totalKills ?? 0).toLocaleString()} />
                  <StatRow label="K/D" value={`${mpKd}`} />
                </div>
              </div>
            </div>
          )}

          {tab === 'achievements' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-200">
                  {achievementsUnlocked} of {achievements.length} unlocked
                </p>
                <span className="text-xs text-gray-500 tabular-nums">
                  {Math.round((achievementsUnlocked / achievements.length) * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {achievements.map((a) => {
                  const style = RARITY_STYLE[a.rarity] ?? RARITY_STYLE.common;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-opacity ${
                        a.unlocked ? `${style.ring} ${style.bg}` : 'border-white/[0.06] bg-white/[0.01] opacity-55'
                      }`}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-black/30 text-xl">
                        {a.unlocked ? a.icon : <Lock className="h-4 w-4 text-gray-500" strokeWidth={2.2} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-white">{a.name}</p>
                          <span className={`text-[9px] font-bold uppercase tracking-wide ${style.text}`}>{a.rarity}</span>
                        </div>
                        <p className="truncate text-[11px] text-gray-400">{a.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-5">
              {/* Avatar picker */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-gray-200">Avatar</p>
                <p className="mt-0.5 text-[11px] text-gray-500">Pick how you appear across menus and multiplayer.</p>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {AVATARS.map((a) => {
                    const Icon = a.Icon;
                    const active = a.id === avatarIndex;
                    return (
                      <button
                        key={a.id}
                        onClick={() => handlePickAvatar(a.id)}
                        title={a.name}
                        className={`relative aspect-square rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center transition-transform hover:scale-105 ${
                          active ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0b0f15]' : 'ring-1 ring-white/10'
                        }`}
                      >
                        <Icon className="h-5 w-5 text-slate-950" strokeWidth={2.3} />
                        {active && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
                            <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Privacy */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-gray-200">Stats Privacy</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  When private, other players still see your rank & avatar — but not your detailed stats.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePrivacy(true)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      statsPublic ? 'border-emerald-400/40 bg-emerald-500/[0.1] text-emerald-200' : 'border-white/10 text-gray-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Eye className="w-4 h-4" strokeWidth={2.2} /> Public
                  </button>
                  <button
                    onClick={() => handlePrivacy(false)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                      !statsPublic ? 'border-amber-400/40 bg-amber-500/[0.1] text-amber-200' : 'border-white/10 text-gray-400 hover:bg-white/[0.04]'
                    }`}
                  >
                    <EyeOff className="w-4 h-4" strokeWidth={2.2} /> Private
                  </button>
                </div>
              </div>

              {/* Display & gameplay settings live in the in-game Settings panel
                  (and sync to your account automatically). */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-gray-200">Display &amp; Gameplay</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Graphics quality, audio, sensitivity, crosshair and more live in the
                  <span className="text-gray-300 font-medium"> Settings</span> panel — your choices sync to this account and apply on every device.
                </p>
              </div>

              {/* Password */}
              <form onSubmit={submitPasswordChange} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-gray-200">Change Password</p>
                <p className="mt-0.5 text-[11px] text-gray-500">Confirm your current password and date of birth to set a new one.</p>
                <div className="mt-3 grid gap-3">
                  <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password"
                    className="w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20" />
                  <div className="relative">
                    <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" strokeWidth={2.1} />
                    <input name="dob" type="date" aria-label="Date of birth"
                      className="w-full rounded-lg border border-white/10 bg-[#05080c] pl-9 pr-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 [color-scheme:dark]" />
                  </div>
                  <input name="newPassword" type="password" autoComplete="new-password" placeholder="New password"
                    className="w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20" />
                  <input name="confirmNewPassword" type="password" autoComplete="new-password" placeholder="Confirm new password"
                    className="w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20" />
                  {passwordError && (
                    <div className="rounded-md border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">{passwordError}</div>
                  )}
                  {passwordSuccess && (
                    <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-100">{passwordSuccess}</div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="submit" disabled={passwordBusy}
                      className="group flex items-center justify-center gap-2 w-full rounded-lg px-4 py-2.5 text-sm font-bold tracking-wide text-[#04130a] transition-all duration-200 disabled:opacity-70"
                      style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}>
                      <KeyRound className="w-4 h-4 group-hover:rotate-12 transition-transform" strokeWidth={2.25} />
                      {passwordBusy ? 'Saving...' : 'Change Password'}
                    </button>
                    <button type="button" onClick={handleSignOut} disabled={passwordBusy}
                      className="group flex items-center justify-center gap-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-bold tracking-wide text-white transition-colors disabled:opacity-70">
                      <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" strokeWidth={2.25} />
                      Sign Out
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes authFade {
          from { opacity: 0; transform: scale(0.96) translateY(18px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

const HeadlineStat = ({ label, value, accent }: { label: string; value: string; accent?: 'violet' | 'amber' }) => {
  const color =
    accent === 'violet' ? 'border-violet-400/20 bg-violet-500/[0.06] text-violet-200'
    : accent === 'amber' ? 'border-amber-400/20 bg-amber-500/[0.06] text-amber-200'
    : 'border-white/10 bg-white/[0.02] text-white';
  return (
    <div className={`rounded-xl border p-3 text-center ${color}`}>
      <div className="text-lg font-black tabular-nums">{value}</div>
      <div className="text-[9px] font-semibold tracking-[0.12em] uppercase opacity-80">{label}</div>
    </div>
  );
};

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === 'string') return data;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unable to update the account right now.';
}

export default ProfileMenu;
