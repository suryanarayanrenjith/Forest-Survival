import { type FormEvent, type ReactNode, type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound, LogOut, ShieldCheck, X, User, BarChart3, Trophy,
  Lock, Eye, EyeOff, Check, Calendar, Camera, Download, Trash2, ImageOff, Loader2, Maximize2,
  Crown, AlertTriangle, Loader, Activity, Flame, CalendarDays, Pencil, Network, Coins, ChevronRight,
  Gauge, ChartPie, Radar, Swords, Users, type LucideIcon,
} from 'lucide-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { useAuthActions } from '@convex-dev/auth/react';
import { api } from '../../convex/_generated/api';
import { usePlayerData } from '../hooks/usePlayerData';
import MenuShell from './MenuShell';
import UserAvatar from './UserAvatar';
import RankBadge from './RankBadge';
import { LeaderboardList } from './LeaderboardMenu';
import { AchievementSystem } from '../utils/AchievementSystem';
import { computeRank, legacySoloRankXp } from '../utils/rankSystem';
import { AVATARS } from '../utils/avatars';

interface ProfileMenuProps {
  onClose: () => void;
  /** Opens the shared Skill Tree overlay (App owns the state, so it's the same
   *  tree as the in-game pause menu). */
  onSkillTree: () => void;
}

type TabKey = 'overview' | 'stats' | 'achievements' | 'leaderboard' | 'photos';

const TABS: { key: TabKey; label: string; Icon: typeof User }[] = [
  { key: 'overview', label: 'Overview', Icon: User },
  { key: 'stats', label: 'Stats', Icon: BarChart3 },
  { key: 'achievements', label: 'Trophies', Icon: Trophy },
  { key: 'leaderboard', label: 'Ranks', Icon: Crown },
  { key: 'photos', label: 'Photos', Icon: Camera },
];

const RARITY_STYLE: Record<string, { ring: string; text: string; bg: string }> = {
  common: { ring: 'border-slate-400/30', text: 'text-slate-300', bg: 'bg-slate-500/10' },
  rare: { ring: 'border-sky-400/40', text: 'text-sky-300', bg: 'bg-sky-500/10' },
  epic: { ring: 'border-violet-400/40', text: 'text-violet-300', bg: 'bg-violet-500/10' },
  legendary: { ring: 'border-amber-400/50', text: 'text-amber-300', bg: 'bg-amber-500/10' },
};

const inputClass =
  'w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20';

function popcount(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="font-hud text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-400">{children}</p>
);

/** Icon-led header for the left-column settings cards. Keeps every card aligned
 *  to the same rhythm (emerald glyph tile + label, optional right-aligned slot). */
const CardHead = ({ icon: Icon, label, right }: { icon: LucideIcon; label: string; right?: ReactNode }) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-500/[0.08]">
        <Icon className="h-3.5 w-3.5 text-emerald-300" strokeWidth={2.2} />
      </span>
      <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-200">{label}</p>
    </div>
    {right}
  </div>
);

/** Consistent left-column card shell. */
const LEFT_CARD = 'rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4';

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="font-hud text-[11px] text-gray-400">{label}</span>
    <span className="font-bold text-white tabular-nums">{value}</span>
  </div>
);

const ProfileMenu = ({ onClose, onSkillTree }: ProfileMenuProps) => {
  const { signOut } = useAuthActions();
  const { currentUser, playerStats } = usePlayerData();
  const deleteAccount = useAction(api.account.deleteAccount);
  const setAvatar = useMutation(api.playerStats.setAvatar);
  const setStatsPrivacy = useMutation(api.playerStats.setStatsPrivacy);
  const setLeaderboardOptIn = useMutation(api.playerStats.setLeaderboardOptIn);
  const updateDisplayName = useMutation(api.profile.updateDisplayName);

  const [tab, setTab] = useState<TabKey>('overview');
  const [pwOpen, setPwOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Display-name inline editor (the username is permanent and never editable).
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Delete-account flow
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const profileLoading = currentUser === undefined;
  const displayName = currentUser?.name?.trim() || currentUser?.username?.trim() || 'Player';
  const username = currentUser?.username ?? '';
  const usernameLabel = currentUser?.username ? `@${currentUser.username}` : 'Loading profile...';

  const solo = playerStats?.solo;
  const mp = playerStats?.multiplayer;
  const avatarIndex = playerStats?.avatarIndex ?? 0;
  const activeAvatar = AVATARS[avatarIndex] ?? AVATARS[0];
  const statsPublic = playerStats?.statsPublic ?? true;
  const leaderboardOptIn = playerStats?.leaderboardOptIn ?? true;
  const skillsUnlocked = playerStats ? Object.keys(playerStats.skills).length : 0;
  const skillPoints = playerStats?.skillPoints ?? 0;
  const achievementsUnlocked = playerStats ? popcount(playerStats.achievements) : 0;
  const mpKd = mp ? (mp.totalDeaths > 0 ? (mp.totalKills / mp.totalDeaths).toFixed(2) : `${mp.totalKills}`) : '0';
  const mpWinRate = mp && mp.gamesPlayed > 0 ? Math.round((mp.wins / mp.gamesPlayed) * 100) : 0;

  const rank = useMemo(() => {
    if (!playerStats) return null;
    return computeRank({
      soloRankXp: playerStats.rankXp ?? legacySoloRankXp(playerStats.solo),
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

  const handlePickAvatar = (index: number) => {
    if (index === avatarIndex) return;
    void setAvatar({ avatarIndex: index }).catch(() => {});
  };

  const handlePrivacy = (isPublic: boolean) => {
    if (isPublic === statsPublic) return;
    void setStatsPrivacy({ isPublic }).catch(() => {});
  };

  const handleLeaderboardOptIn = (optIn: boolean) => {
    if (optIn === leaderboardOptIn) return;
    void setLeaderboardOptIn({ optIn }).catch(() => {});
  };

  const startNameEdit = () => {
    setNameDraft(displayName);
    setNameError(null);
    setNameEditing(true);
  };

  const submitName = async (event: FormEvent) => {
    event.preventDefault();
    if (nameBusy) return;
    const next = nameDraft.trim();
    if (!next) return setNameError('Enter a name.');
    if (next === displayName) { setNameEditing(false); return; }
    setNameBusy(true);
    setNameError(null);
    try {
      await updateDisplayName({ name: next });
      setNameEditing(false);
    } catch (err) {
      setNameError(extractErrorMessage(err));
    } finally {
      setNameBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onClose();
    } catch {
      setSigningOut(false);
    }
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteOpen(false);
    setDeletePassword('');
    setDeleteConfirm('');
    setDeleteError(null);
  };

  const handleDeleteAccount = async () => {
    if (deleteBusy) return;
    if (!deletePassword) return setDeleteError('Enter your password to confirm.');
    const typed = deleteConfirm.trim().replace(/^@/, '').toLowerCase();
    if (typed !== username.toLowerCase()) return setDeleteError('Username does not match.');

    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount({ password: deletePassword });
      // The account (and our session) no longer exist — clear local auth and exit.
      try { await signOut(); } catch { /* session already gone */ }
      onClose();
    } catch (deleteErr) {
      setDeleteError(extractErrorMessage(deleteErr));
      setDeleteBusy(false);
    }
  };

  const deleteReady = deletePassword.length > 0
    && deleteConfirm.trim().replace(/^@/, '').toLowerCase() === username.toLowerCase()
    && username.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-4 menu-overlay-in"
      style={{ background: 'rgba(4,8,7,0.92)', backdropFilter: 'blur(16px)' }}
    >
      <MenuShell variant="main" />

      <div
        className="hud-frame relative z-10 flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-emerald-400/15 bg-[#080d0b] shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
        style={{ animation: 'authFade 0.32s cubic-bezier(0.16,1,0.3,1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
            </div>
            <div>
              <p className="font-hud text-[10px] tracking-[0.36em] text-emerald-300/90 font-semibold uppercase">Account</p>
              <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">Player Profile</h2>
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

        {/* Body — LEFT account column · RIGHT showcase column */}
        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          {/* ── LEFT · ACCOUNT ─────────────────────────────────────────── */}
          <aside className="w-full flex-shrink-0 space-y-4 border-b border-white/[0.07] p-5 md:w-[340px] md:border-b-0 md:border-r md:overflow-y-auto">
            {/* Identity */}
            <div
              className="hud-frame relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.1] to-transparent p-4"
              style={{ '--hud-bracket': 'rgba(46,232,180,0.45)' } as CSSProperties}
            >
              <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full" style={{ background: 'radial-gradient(circle, rgba(46,232,180,0.16), transparent 70%)', filter: 'blur(6px)' }} />
              <div className="relative flex items-center gap-3.5">
                <UserAvatar name={currentUser?.name} username={currentUser?.username} avatarIndex={avatarIndex} size="lg" className="shadow-[0_0_0_4px_rgba(16,185,129,0.08)]" />
                <div className="min-w-0">
                  <p className="font-hud text-[10px] tracking-[0.32em] text-emerald-300/90 font-semibold uppercase">Signed In</p>
                  {profileLoading ? (
                    <div className="mt-2 h-5 w-32 rounded-full bg-white/10" />
                  ) : nameEditing ? (
                    <form onSubmit={submitName} className="mt-0.5 flex items-center gap-1.5">
                      <input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoFocus
                        maxLength={24}
                        aria-label="Display name"
                        className="min-w-0 flex-1 rounded-md border border-emerald-400/40 bg-[#05080c] px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/70"
                      />
                      <button type="submit" disabled={nameBusy} aria-label="Save name"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/15 text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-60">
                        {nameBusy ? <Loader className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.6} />}
                      </button>
                      <button type="button" onClick={() => { setNameEditing(false); setNameError(null); }} aria-label="Cancel"
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white">
                        <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <h3 className="font-display truncate text-xl font-semibold tracking-wide text-white">{displayName}</h3>
                        <button
                          type="button"
                          onClick={startNameEdit}
                          aria-label="Edit display name"
                          title="Edit name"
                          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-white/10 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-emerald-200"
                        >
                          <Pencil className="h-3 w-3" strokeWidth={2.3} />
                        </button>
                      </div>
                      <p className="font-hud truncate text-[13px] text-gray-300">{usernameLabel}</p>
                    </>
                  )}
                  {nameError && <p className="mt-1 text-[11px] text-rose-300">{nameError}</p>}
                  {rank && (
                    <span
                      className="font-hud mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ color: rank.color, background: `${rank.color}1a`, border: `1px solid ${rank.color}44` }}
                    >
                      <Trophy className="w-2.5 h-2.5" strokeWidth={2.5} /> {rank.tierName} · Lvl {rank.level}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Avatar picker */}
            <div className={LEFT_CARD}>
              <CardHead
                icon={User}
                label="Avatar"
                right={
                  <span className="font-hud rounded-md border border-emerald-400/20 bg-emerald-500/[0.07] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-200">
                    {activeAvatar.name}
                  </span>
                }
              />
              <p className="mt-2 text-[11px] text-gray-500">Pick how you appear across menus and multiplayer.</p>
              <div className="mt-3.5 grid grid-cols-6 gap-x-3 gap-y-3.5 sm:gap-x-3.5">
                {AVATARS.map((a) => {
                  const Icon = a.Icon;
                  const active = a.id === avatarIndex;
                  return (
                    <button
                      key={a.id}
                      onClick={() => handlePickAvatar(a.id)}
                      title={a.name}
                      className={`relative aspect-square rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center transition-all duration-200 hover:scale-110 hover:-translate-y-0.5 ${
                        active ? 'ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#0a1410] shadow-[0_6px_18px_-6px_rgba(52,211,153,0.75)]' : 'ring-1 ring-white/10 hover:ring-white/30'
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] text-slate-950" strokeWidth={2.3} />
                      {active && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0a1410]">
                          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Privacy */}
            <div className={LEFT_CARD}>
              <CardHead icon={Eye} label="Stats Privacy" />
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">When private, others still see your rank &amp; avatar — but not detailed stats.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePrivacy(true)}
                  className={`font-hud flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                    statsPublic ? 'border-emerald-400/45 bg-emerald-500/[0.12] text-emerald-100 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                  }`}
                >
                  <Eye className="w-4 h-4" strokeWidth={2.2} /> Public
                </button>
                <button
                  onClick={() => handlePrivacy(false)}
                  className={`font-hud flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                    !statsPublic ? 'border-amber-400/45 bg-amber-500/[0.12] text-amber-100 shadow-[0_0_18px_-6px_rgba(245,158,11,0.55)]' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                  }`}
                >
                  <EyeOff className="w-4 h-4" strokeWidth={2.2} /> Private
                </button>
              </div>
            </div>

            {/* Leaderboard visibility */}
            <div className={LEFT_CARD}>
              <CardHead icon={Crown} label="Leaderboard" />
              <p className="mt-2 text-[11px] leading-relaxed text-gray-500">Show your name, rank &amp; best wave on the global leaderboard.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleLeaderboardOptIn(true)}
                  className={`font-hud flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                    leaderboardOptIn ? 'border-amber-400/45 bg-amber-500/[0.12] text-amber-100 shadow-[0_0_18px_-6px_rgba(245,158,11,0.55)]' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                  }`}
                >
                  <Trophy className="w-4 h-4" strokeWidth={2.2} /> Show me
                </button>
                <button
                  onClick={() => handleLeaderboardOptIn(false)}
                  className={`font-hud flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                    !leaderboardOptIn ? 'border-white/30 bg-white/[0.07] text-gray-100' : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-gray-200'
                  }`}
                >
                  <EyeOff className="w-4 h-4" strokeWidth={2.2} /> Hide me
                </button>
              </div>
            </div>

            {/* Account — security actions + danger zone, compact */}
            <div className={LEFT_CARD}>
              <CardHead icon={KeyRound} label="Account" />
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => setPwOpen(true)}
                  className="font-hud group flex items-center justify-center gap-2 w-full rounded-lg border border-emerald-400/25 bg-emerald-500/[0.06] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-emerald-200 transition-colors hover:bg-emerald-500/[0.12] hover:text-white"
                >
                  <KeyRound className="w-4 h-4 transition-transform group-hover:rotate-12" strokeWidth={2.25} />
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="font-hud group flex items-center justify-center gap-2 w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white/[0.06] disabled:opacity-70"
                >
                  <LogOut className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
                  {signingOut ? 'Signing Out…' : 'Sign Out'}
                </button>
              </div>

              <div className="mt-3 border-t border-rose-400/15 pt-3">
                <p className="font-hud flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-300">
                  <AlertTriangle className="w-3 h-3" strokeWidth={2.4} /> Danger Zone
                </p>
                <button
                  type="button"
                  onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
                  className="font-hud group mt-2 flex items-center justify-center gap-2 w-full rounded-lg border border-rose-400/40 bg-rose-500/[0.1] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-rose-100 transition-colors hover:bg-rose-500/25"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2.25} />
                  Delete Account
                </button>
                <p className="mt-2 text-[10.5px] leading-relaxed text-rose-200/55">
                  Permanently erases every trace of your account. This cannot be undone.
                </p>
              </div>
            </div>
          </aside>

          {/* ── RIGHT · SHOWCASE ───────────────────────────────────────── */}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-3 py-2">
              {TABS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`font-hud flex flex-shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    tab === key ? 'bg-emerald-500/[0.12] text-emerald-200' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-4 h-4" strokeWidth={2.1} />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            <div className="p-5 sm:p-6 md:flex-1 md:overflow-y-auto">
              {tab === 'overview' && (
                <div className="space-y-5">
                  {rank && (
                    <div
                      className="hud-frame relative overflow-hidden rounded-2xl border p-5"
                      style={{
                        borderColor: `${rank.color}3a`,
                        background: `radial-gradient(130% 150% at 0% 0%, ${rank.color}22, transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))`,
                        '--hud-bracket': `${rank.color}80`,
                      } as CSSProperties}
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${rank.color}aa, transparent)` }} />
                      <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full" style={{ background: `radial-gradient(circle, ${rank.color}26, transparent 70%)`, filter: 'blur(8px)' }} />
                      <div className="relative mb-3 flex items-center gap-2.5">
                        <span className="font-hud text-[10px] font-semibold uppercase tracking-[0.32em]" style={{ color: rank.color }}>Rank</span>
                        <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${rank.color}55, transparent)` }} />
                      </div>
                      <RankBadge rank={rank} />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <HeadlineStat label="Solo Best" value={(solo?.highScore ?? 0).toLocaleString()} />
                    <HeadlineStat label="Best Wave" value={`${solo?.highestWave ?? 0}`} />
                    <HeadlineStat label="MP Wins" value={`${mp?.wins ?? 0}`} />
                    <HeadlineStat label="Trophies" value={`${achievementsUnlocked}/${achievements.length}`} accent="amber" />
                  </div>

                  {/* Skill Tree — opens the shared progression overlay (the very
                      same tree as the in-game pause menu, so points + unlocks are
                      always in sync). Spend points earned from runs on permanent
                      upgrades. The live points pill nudges when there's something
                      to spend. */}
                  <button
                    onClick={onSkillTree}
                    className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/[0.1] to-transparent p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-300/45"
                  >
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/[0.12]">
                      <Network className="h-[22px] w-[22px] text-violet-200" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-display block text-lg font-semibold uppercase tracking-wide leading-none text-white">Skill Tree</span>
                      <span className="font-hud mt-1 block text-[11px] text-gray-400">
                        {skillPoints > 0
                          ? `${skillPoints} point${skillPoints === 1 ? '' : 's'} ready to spend on upgrades`
                          : 'Earn points from every run, then upgrade here'}
                      </span>
                    </span>
                    {skillPoints > 0 && (
                      <span className="font-hud flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/35 bg-emerald-500/[0.12] px-2.5 py-1 text-[13px] font-bold tabular-nums text-emerald-200">
                        <Coins className="h-3.5 w-3.5" strokeWidth={2.25} /> {skillPoints}
                      </span>
                    )}
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-violet-300/50 transition-all group-hover:translate-x-0.5 group-hover:text-violet-200" strokeWidth={2} />
                  </button>

                  <ActivityHeatmap />
                </div>
              )}

              {tab === 'stats' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <HeadlineStat label="Skill Pts" value={`${playerStats?.skillPoints ?? 0}`} accent="violet" />
                    <HeadlineStat label="Skills" value={`${skillsUnlocked}`} />
                    <HeadlineStat label="Trophies" value={`${achievementsUnlocked}/${achievements.length}`} accent="amber" />
                  </div>

                  {/* Switchable stats visualizer — Bars / Donut / Radar. */}
                  <StatsVisualizer
                    soloScore={solo?.highScore ?? 0}
                    soloKills={solo?.totalKills ?? 0}
                    soloRuns={solo?.totalRuns ?? 0}
                    bestWave={solo?.highestWave ?? 0}
                    mpScore={mp?.highScore ?? 0}
                    mpKills={mp?.totalKills ?? 0}
                    mpGames={mp?.gamesPlayed ?? 0}
                    winRate={mpWinRate}
                    trophiesUnlocked={achievementsUnlocked}
                    trophiesTotal={achievements.length}
                  />

                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-4">
                    <p className="font-hud text-[11px] font-semibold text-emerald-300 uppercase tracking-[0.18em]">Solo</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      <StatRow label="High Score" value={(solo?.highScore ?? 0).toLocaleString()} />
                      <StatRow label="Best Wave" value={`${solo?.highestWave ?? 0}`} />
                      <StatRow label="Total Kills" value={(solo?.totalKills ?? 0).toLocaleString()} />
                      <StatRow label="Runs" value={`${solo?.totalRuns ?? 0}`} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-4">
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
                </div>
              )}

              {tab === 'achievements' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-hud text-xs font-semibold uppercase tracking-wider text-gray-200">
                      {achievementsUnlocked} of {achievements.length} unlocked
                    </p>
                    <span className="font-hud text-xs text-gray-500 tabular-nums">
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
                              <span className={`font-hud text-[9px] font-bold uppercase tracking-wide ${style.text}`}>{a.rarity}</span>
                            </div>
                            <p className="truncate text-[11px] text-gray-400">{a.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {tab === 'leaderboard' && (
                <div className="space-y-4">
                  <p className="text-[12px] text-gray-400">
                    Best players across the world, ranked by overall account XP. Earn more by
                    surviving longer and playing harder difficulties.
                    {!leaderboardOptIn && (
                      <span className="mt-1 block text-amber-300/90">
                        You're currently hidden — enable visibility from the Leaderboard control on the left.
                      </span>
                    )}
                  </p>
                  <LeaderboardList />
                </div>
              )}

              {tab === 'photos' && <PhotosPanel />}
            </div>
          </section>
        </div>
      </div>

      {/* Change-password modal */}
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}

      {/* Delete-account confirmation */}
      {deleteOpen && (
        <DeleteAccountDialog
          handle={usernameLabel}
          password={deletePassword}
          setPassword={setDeletePassword}
          confirmText={deleteConfirm}
          setConfirmText={setDeleteConfirm}
          busy={deleteBusy}
          error={deleteError}
          ready={deleteReady}
          onCancel={closeDeleteDialog}
          onConfirm={handleDeleteAccount}
        />
      )}

      <style>{`
        @keyframes authFade {
          from { opacity: 0; transform: scale(0.96) translateY(18px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

/* ============================================================
 * DELETE ACCOUNT DIALOG
 * ============================================================ */
interface DeleteAccountDialogProps {
  handle: string;
  password: string;
  setPassword: (v: string) => void;
  confirmText: string;
  setConfirmText: (v: string) => void;
  busy: boolean;
  error: string | null;
  ready: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteAccountDialog = ({
  handle, password, setPassword, confirmText, setConfirmText, busy, error, ready, onCancel, onConfirm,
}: DeleteAccountDialogProps) =>
  createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete account"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,6,0.86)', backdropFilter: 'blur(14px)', animation: 'daBack 0.2s ease forwards' }}
      onClick={onCancel}
    >
      <div
        className="hud-frame relative w-full max-w-md overflow-hidden rounded-2xl border border-rose-400/25 bg-[#0c0807] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
        style={{ '--hud-bracket': 'rgba(244,63,94,0.5)', animation: 'daCard 0.26s cubic-bezier(0.16,1,0.3,1) forwards' } as CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-400/30">
          <AlertTriangle className="w-6 h-6 text-rose-300" strokeWidth={2.2} />
        </div>
        <p className="font-hud mt-4 text-[10px] tracking-[0.34em] text-rose-300/90 font-semibold uppercase">Danger Zone</p>
        <h3 className="font-display text-2xl font-semibold uppercase tracking-wide text-white">Delete account</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-300/90">
          This permanently erases your profile, stats, photos, achievements, rank and login —
          and releases your username. Every trace is wiped from the database. <span className="font-semibold text-rose-200">This cannot be undone.</span>
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="font-hud block text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">
              Type <span className="text-rose-200">{handle}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
              placeholder={handle}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-rose-400/50 focus:ring-2 focus:ring-rose-400/20"
            />
          </div>
          <div>
            <label className="font-hud block text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-400">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#05080c] px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-rose-400/50 focus:ring-2 focus:ring-rose-400/20"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-400/30 bg-rose-500/[0.08] px-3 py-2 text-sm text-rose-100">{error}</div>
          )}

          <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="font-hud rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-gray-200 transition-colors hover:bg-white/[0.07] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || !ready}
              className="font-hud flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition-all duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)', boxShadow: '0 12px 30px -12px rgba(244,63,94,0.7)' }}
            >
              {busy ? <Loader className="w-4 h-4 animate-spin" strokeWidth={2.4} /> : <Trash2 className="w-4 h-4" strokeWidth={2.4} />}
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes daBack { from { opacity: 0; } to { opacity: 1; } }
        @keyframes daCard { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>,
    document.body,
  );

/* ============================================================
 * CHANGE PASSWORD MODAL
 * ============================================================ */
const ChangePasswordModal = ({ onClose }: { onClose: () => void }) => {
  const changePassword = useAction(api.account.changePassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy) return;
    const fd = new FormData(form);
    const currentPassword = String(fd.get('currentPassword') ?? '');
    const dob = String(fd.get('dob') ?? '');
    const newPassword = String(fd.get('newPassword') ?? '');
    const confirmNewPassword = String(fd.get('confirmNewPassword') ?? '');

    if (!currentPassword) return setError('Enter your current password.');
    if (!dob) return setError('Enter your date of birth to confirm it’s you.');
    if (!newPassword) return setError('Enter a new password.');
    if (newPassword !== confirmNewPassword) return setError('New passwords do not match.');

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await changePassword({ currentPassword, newPassword, dob });
      setSuccess('Password updated successfully.');
      form.reset();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Change password"
      className="menu-overlay-in fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,8,7,0.86)', backdropFilter: 'blur(14px)' }}
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="hud-frame relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-400/20 bg-[#080d0b] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
        style={{ animation: 'authFade 0.26s cubic-bezier(0.16,1,0.3,1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/30">
              <KeyRound className="w-5 h-5 text-emerald-300" strokeWidth={2.1} />
            </div>
            <div>
              <p className="font-hud text-[10px] tracking-[0.34em] text-emerald-300/90 font-semibold uppercase">Security</p>
              <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-white">Change Password</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 text-gray-400 transition-colors hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-[18px] h-[18px]" strokeWidth={2.25} />
          </button>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-gray-400">
          Confirm your current password and date of birth to set a new one.
        </p>

        <form onSubmit={submit} className="mt-4 grid gap-3">
          <input name="currentPassword" type="password" autoComplete="current-password" placeholder="Current password" className={inputClass} />
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" strokeWidth={2.1} />
            <input name="dob" type="date" aria-label="Date of birth" className={`${inputClass} pl-9 [color-scheme:dark]`} />
          </div>
          <input name="newPassword" type="password" autoComplete="new-password" placeholder="New password" className={inputClass} />
          <input name="confirmNewPassword" type="password" autoComplete="new-password" placeholder="Confirm new password" className={inputClass} />
          {error && <div className="rounded-md border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100">{error}</div>}
          {success && <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-100">{success}</div>}
          <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="font-hud rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold uppercase tracking-wider text-gray-200 transition-colors hover:bg-white/[0.07] disabled:opacity-60"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={busy}
              className="font-hud group flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all duration-150 hover:brightness-110 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)', boxShadow: '0 12px 30px -12px rgba(46,232,180,0.7)' }}
            >
              {busy ? <Loader className="w-4 h-4 animate-spin" strokeWidth={2.4} /> : <KeyRound className="w-4 h-4 transition-transform group-hover:rotate-12" strokeWidth={2.25} />}
              {busy ? 'Saving…' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

/* ============================================================
 * ACTIVITY HEATMAP (GitHub-style)
 * ============================================================ */
const HEAT_BG = [
  'rgba(255,255,255,0.05)',
  'rgba(46,232,180,0.22)',
  'rgba(46,232,180,0.42)',
  'rgba(46,232,180,0.70)',
  'rgba(46,232,180,0.96)',
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;
const isoDayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const ActivityHeatmap = () => {
  const data = useQuery(api.daily.getActivity);
  const loading = data === undefined;

  const grid = useMemo(() => {
    const levelByDay = new Map<string, number>();
    for (const d of data?.days ?? []) levelByDay.set(d.day, d.level);

    const WEEKS = 53;
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const todayDow = new Date(todayUtc).getUTCDay();
    const startMs = todayUtc - todayDow * DAY_MS - (WEEKS - 1) * 7 * DAY_MS;

    type Cell = { ms: number; level: number } | null;
    const weeks: Cell[][] = [];
    const months: { w: number; label: string }[] = [];
    let lastMonth = -1;
    let activeDays = 0;

    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const ms = startMs + (w * 7 + d) * DAY_MS;
        if (ms > todayUtc) { col.push(null); continue; }
        const level = levelByDay.get(isoDayKey(ms)) ?? 0;
        if (level > 0) activeDays += 1;
        col.push({ ms, level });
      }
      const topMs = startMs + w * 7 * DAY_MS;
      if (topMs <= todayUtc) {
        const month = new Date(topMs).getUTCMonth();
        if (month !== lastMonth) { months.push({ w, label: MONTHS[month] }); lastMonth = month; }
      }
      weeks.push(col);
    }

    // Current streak — an inactive *today* doesn't break a run that's still alive.
    let currentStreak = 0;
    for (let i = 0; i < 400; i++) {
      const active = (levelByDay.get(isoDayKey(todayUtc - i * DAY_MS)) ?? 0) > 0;
      if (active) currentStreak += 1;
      else if (i === 0) continue;
      else break;
    }

    // Longest streak across all known active days.
    const activeKeys = [...levelByDay.entries()].filter(([, lvl]) => lvl > 0).map(([k]) => k).sort();
    let longestStreak = 0;
    let run = 0;
    let prevMs: number | null = null;
    for (const k of activeKeys) {
      const ms = Date.parse(`${k}T00:00:00Z`);
      run = prevMs !== null && ms - prevMs === DAY_MS ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      prevMs = ms;
    }

    return { weeks, months, activeDays, currentStreak, longestStreak };
  }, [data]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-300" strokeWidth={2.2} />
          <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-200">Activity</p>
        </div>
        <p className="font-hud text-[10px] uppercase tracking-wider text-gray-500">Last 12 months</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <HeatStat icon={CalendarDays} label="Active Days" value={`${grid.activeDays}`} />
        <HeatStat icon={Flame} label="Current" value={`${grid.currentStreak}d`} />
        <HeatStat icon={Trophy} label="Longest" value={`${grid.longestStreak}d`} />
      </div>

      {loading ? (
        <div className="mt-4 h-[116px] animate-pulse rounded-lg bg-white/[0.03]" />
      ) : (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="inline-block min-w-max">
            {/* Month labels */}
            <div className="flex">
              <div className="w-7 flex-shrink-0" />
              <div className="flex gap-[3px]">
                {grid.weeks.map((_, w) => {
                  const label = grid.months.find((m) => m.w === w)?.label;
                  return (
                    <div key={w} className="relative w-[12px]">
                      {label && <span className="font-hud absolute left-0 top-0 whitespace-nowrap text-[9px] text-gray-500">{label}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Weekday labels + cells */}
            <div className="mt-1 flex">
              <div className="mr-1 flex w-6 flex-shrink-0 flex-col gap-[3px]">
                {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((d, i) => (
                  <div key={i} className="font-hud flex h-[12px] items-center text-[8px] text-gray-600">{d}</div>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {grid.weeks.map((col, w) => (
                  <div key={w} className="flex flex-col gap-[3px]">
                    {col.map((cell, d) => cell === null ? (
                      <div key={d} className="h-[12px] w-[12px]" />
                    ) : (
                      <div
                        key={d}
                        className="h-[12px] w-[12px] rounded-[3px]"
                        style={{ background: HEAT_BG[cell.level], boxShadow: cell.level >= 4 ? '0 0 6px rgba(46,232,180,0.5)' : undefined }}
                        title={`${formatHeatDay(cell.ms)} — ${cell.level > 0 ? 'active' : 'no activity'}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="font-hud text-[9px] uppercase tracking-wider text-gray-500">Less</span>
        {HEAT_BG.map((bg, i) => (
          <span key={i} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: bg }} />
        ))}
        <span className="font-hud text-[9px] uppercase tracking-wider text-gray-500">More</span>
      </div>
    </div>
  );
};

const HeatStat = ({ icon: Icon, label, value }: { icon: typeof Flame; label: string; value: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5 text-emerald-300" strokeWidth={2.3} />
      <span className="font-display text-lg font-semibold leading-none tabular-nums text-white">{value}</span>
    </div>
    <p className="font-hud mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">{label}</p>
  </div>
);

function formatHeatDay(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return '';
  }
}

/**
 * Photo Mode gallery — the captures taken from the in-game pause menu. Players
 * can download a copy to their device or delete it from cloud storage (which
 * reflects in the DB instantly via the reactive query).
 */
const PhotosPanel = () => {
  const data = useQuery(api.photos.listPhotos);
  const deletePhoto = useMutation(api.photos.deletePhoto);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const loading = data === undefined;
  const photos = data?.photos ?? [];
  const max = data?.max ?? 5;
  const previewPhoto = photos.find((p) => p.id === previewId) ?? null;

  useEffect(() => {
    if (!previewPhoto) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewId(null);
    };
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewPhoto]);

  const handleDownload = async (url: string | null, id: string) => {
    if (!url) return;
    setBusyId(id);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `forest-survival-photo-${id.slice(-6)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      // Fall back to opening in a new tab if the blob download is blocked.
      window.open(url, '_blank', 'noopener');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await deletePhoto({ id: id as Id<'playerPhotos'> });
    } catch {
      // Reactive query will simply keep showing the photo on failure.
    } finally {
      setBusyId(null);
      setConfirmId(null);
      setPreviewId((cur) => (cur === id ? null : cur));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <SectionLabel>Photo Gallery</SectionLabel>
          <p className="mt-1 text-[11px] text-gray-500">
            Captured from <span className="text-gray-300">Pause → Photo Mode</span> during Solo play.
          </p>
        </div>
        <span className="font-hud rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-200">
          {photos.length} / {max}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/[0.04]" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
          <Camera className="h-7 w-7 text-gray-600" strokeWidth={1.8} />
          <p className="text-sm font-semibold text-gray-300">No photos yet</p>
          <p className="max-w-xs text-[11px] text-gray-500">
            Open <span className="text-gray-300">Photo Mode</span> from the in-game pause menu to freeze the
            world, frame your shot, and capture up to {max} photos.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/30 transition-all duration-200 hover:border-emerald-400/40 hover:shadow-[0_8px_30px_rgba(16,185,129,0.12)]"
            >
              <button
                type="button"
                onClick={() => p.url && setPreviewId(p.id)}
                className="block aspect-video w-full cursor-zoom-in overflow-hidden"
                title="Click to preview"
              >
                {p.url ? (
                  <img
                    src={p.url}
                    alt="Captured photo"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-600">
                    <ImageOff className="h-6 w-6" strokeWidth={1.8} />
                  </div>
                )}
              </button>

              {p.url && (
                <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100">
                  <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.3} />
                </span>
              )}

              <div className="pointer-events-none absolute inset-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/75 via-black/10 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(p.url, p.id); }}
                  disabled={busyId === p.id || !p.url}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md transition-colors hover:bg-white/20 disabled:opacity-50"
                >
                  {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} /> : <Download className="h-3.5 w-3.5" strokeWidth={2.4} />}
                  Save
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmId(p.id); }}
                  disabled={busyId === p.id}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 backdrop-blur-md transition-colors hover:bg-rose-500/35 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  Delete
                </button>
              </div>

              {confirmId === p.id && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/85 p-3 text-center backdrop-blur-sm">
                  <p className="text-[12px] font-semibold text-white">Delete this photo?</p>
                  <p className="text-[10px] text-gray-400">This removes it from cloud storage permanently.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={busyId === p.id}
                      className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-rose-600 disabled:opacity-60"
                    >
                      {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.4} />}
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-white/10"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewPhoto && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo preview"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md sm:p-6"
          style={{ animation: 'pmPrevBack 0.18s ease forwards' }}
          onClick={() => setPreviewId(null)}
        >
          <div
            className="relative flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080d0b] shadow-[0_40px_140px_rgba(0,0,0,0.7)]"
            style={{ animation: 'pmPrevCard 0.26s cubic-bezier(0.16,1,0.3,1) forwards' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/12">
                  <Camera className="h-4 w-4 text-emerald-300" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold uppercase tracking-wide leading-none text-white">Photo Preview</p>
                  <p className="font-hud mt-1 truncate text-[11px] text-gray-500">{formatPhotoDate(previewPhoto.createdAt)}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewId(null)}
                aria-label="Close preview"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-[17px] w-[17px]" strokeWidth={2.3} />
              </button>
            </div>

            <div
              className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-4"
              style={{ background: 'radial-gradient(120% 120% at 50% 0%, rgba(52,211,153,0.07), transparent 60%), #06090d' }}
            >
              {previewPhoto.url ? (
                <img
                  src={previewPhoto.url}
                  alt="Photo preview"
                  className="max-h-[calc(92dvh-9rem)] max-w-full rounded-lg object-contain shadow-[0_12px_50px_rgba(0,0,0,0.55)]"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center text-gray-600">
                  <ImageOff className="h-8 w-8" strokeWidth={1.8} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.07] px-4 py-3">
              <button
                onClick={() => handleDownload(previewPhoto.url, previewPhoto.id)}
                disabled={busyId === previewPhoto.id || !previewPhoto.url}
                className="font-hud flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#04130a] transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #34d399, #22c55e)' }}
              >
                {busyId === previewPhoto.id ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} /> : <Download className="h-4 w-4" strokeWidth={2.4} />}
                Download
              </button>
              <button
                onClick={() => handleDelete(previewPhoto.id)}
                disabled={busyId === previewPhoto.id}
                className="font-hud flex items-center gap-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-rose-100 transition-colors hover:bg-rose-500/25 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                Delete
              </button>
            </div>
          </div>

          <style>{`
            @keyframes pmPrevBack { from { opacity: 0; } to { opacity: 1; } }
            @keyframes pmPrevCard {
              from { opacity: 0; transform: scale(0.95) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>,
        document.body,
      )}
    </div>
  );
};

/* ============================================================
 * STATS VISUALIZER — one switchable chart (Bars / Donut / Radar)
 * ============================================================ */
type StatsView = 'bars' | 'donut' | 'radar';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const fmtCompact = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

const SV_VIEWS: { key: StatsView; label: string; Icon: LucideIcon }[] = [
  { key: 'bars', label: 'Bars', Icon: BarChart3 },
  { key: 'donut', label: 'Split', Icon: ChartPie },
  { key: 'radar', label: 'Profile', Icon: Radar },
];
const SV_TITLE: Record<StatsView, string> = {
  bars: 'Solo vs Multiplayer',
  donut: 'Kill Distribution',
  radar: 'Operative Profile',
};

interface StatsVisualizerProps {
  soloScore: number; soloKills: number; soloRuns: number; bestWave: number;
  mpScore: number; mpKills: number; mpGames: number;
  winRate: number; trophiesUnlocked: number; trophiesTotal: number;
}

const StatsVisualizer = (p: StatsVisualizerProps) => {
  const [view, setView] = useState<StatsView>('bars');

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
      {/* faint aurora wash */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full" style={{ background: 'radial-gradient(circle, rgba(46,232,180,0.1), transparent 70%)', filter: 'blur(10px)' }} />

      <div className="relative mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-emerald-300" strokeWidth={2.2} />
          <p className="font-hud text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-200">{SV_TITLE[view]}</p>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5">
          {SV_VIEWS.map((v) => {
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                aria-pressed={active}
                className={`font-hud flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  active ? 'bg-emerald-500/[0.16] text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.3)]' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <v.Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={view} className="relative" style={{ animation: 'svViewIn 0.34s cubic-bezier(0.16,1,0.3,1)' }}>
        {view === 'bars' && <SvBars {...p} />}
        {view === 'donut' && <SvDonut soloKills={p.soloKills} mpKills={p.mpKills} />}
        {view === 'radar' && <SvRadar {...p} />}
      </div>

      <style>{`
        @keyframes svViewIn { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes svBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      `}</style>
    </div>
  );
};

const SvBars = ({ soloScore, soloKills, soloRuns, mpScore, mpKills, mpGames }: StatsVisualizerProps) => {
  const groups = [
    { label: 'Score', solo: soloScore, mp: mpScore },
    { label: 'Kills', solo: soloKills, mp: mpKills },
    { label: 'Games', solo: soloRuns, mp: mpGames },
  ];
  return (
    <div>
      <div className="flex h-44 items-end justify-around gap-2 px-1">
        {groups.map((g) => {
          const max = Math.max(g.solo, g.mp, 1);
          return (
            <div key={g.label} className="flex h-full items-end gap-2.5">
              <SvBar value={g.solo} pct={(g.solo / max) * 100} fill="linear-gradient(180deg,#6ee7b7,#059669)" glow="rgba(52,211,153,0.45)" />
              <SvBar value={g.mp} pct={(g.mp / max) * 100} fill="linear-gradient(180deg,#7dd3fc,#0284c7)" glow="rgba(56,189,248,0.45)" />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-around">
        {groups.map((g) => (
          <span key={g.label} className="font-hud text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">{g.label}</span>
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-center gap-5 border-t border-white/[0.06] pt-3">
        <SvLegend Icon={Swords} color="#34d399" label="Solo" />
        <SvLegend Icon={Users} color="#38bdf8" label="Multiplayer" />
      </div>
    </div>
  );
};

const SvBar = ({ value, pct, fill, glow }: { value: number; pct: number; fill: string; glow: string }) => (
  <div className="flex h-full w-9 flex-col items-center justify-end">
    <span className="font-hud mb-1 text-[10px] font-bold tabular-nums text-gray-300">{fmtCompact(value)}</span>
    <div
      className="w-full rounded-t-md"
      style={{ height: `${Math.max(pct * 0.86, 2)}%`, background: fill, boxShadow: `0 0 14px ${glow}`, transformOrigin: 'bottom', animation: 'svBarGrow 0.7s cubic-bezier(0.16,1,0.3,1)' }}
    />
  </div>
);

const SvLegend = ({ Icon, color, label }: { Icon: LucideIcon; color: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <Icon className="h-3.5 w-3.5" strokeWidth={2.2} style={{ color }} />
    <span className="font-hud text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
  </div>
);

const SvDonut = ({ soloKills, mpKills }: { soloKills: number; mpKills: number }) => {
  const total = soloKills + mpKills;
  if (total === 0) {
    return <SvEmpty label="No kills recorded yet" hint="Play a run to chart how your kills split between Solo and Multiplayer." />;
  }
  const soloPct = (soloKills / total) * 100;
  const mpPct = 100 - soloPct;
  const R = 46;
  return (
    <div className="flex flex-col items-center gap-5 py-2 sm:flex-row sm:justify-center sm:gap-9">
      <div className="relative" style={{ width: 168, height: 168 }}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <defs>
            <linearGradient id="svSolo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6ee7b7" /><stop offset="1" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="svMp" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7dd3fc" /><stop offset="1" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="13" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="url(#svSolo)" strokeWidth="13" pathLength={100}
            strokeDasharray={`${soloPct} 100`} style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }} />
          <circle cx="60" cy="60" r={R} fill="none" stroke="url(#svMp)" strokeWidth="13" pathLength={100}
            strokeDasharray={`${mpPct} 100`} strokeDashoffset={-soloPct} style={{ filter: 'drop-shadow(0 0 4px rgba(56,189,248,0.5))' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums leading-none text-white">{total.toLocaleString()}</span>
          <span className="font-hud mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-500">Total Kills</span>
        </div>
      </div>
      <div className="w-full max-w-[220px] space-y-2.5 sm:w-auto">
        <SvDonutRow Icon={Swords} color="#34d399" label="Solo" value={soloKills} pct={soloPct} />
        <SvDonutRow Icon={Users} color="#38bdf8" label="Multiplayer" value={mpKills} pct={mpPct} />
      </div>
    </div>
  );
};

const SvDonutRow = ({ Icon, color, label, value, pct }: { Icon: LucideIcon; color: string; label: string; value: number; pct: number }) => (
  <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 sm:min-w-[180px]">
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}44` }}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} style={{ color }} />
    </span>
    <div className="min-w-0 flex-1">
      <div className="font-hud text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm font-bold tabular-nums text-white">
        {value.toLocaleString()} <span className="text-[11px] font-semibold text-gray-500">· {Math.round(pct)}%</span>
      </div>
    </div>
  </div>
);

const RADAR_AXES = ['Firepower', 'Survival', 'Victory', 'Experience', 'Mastery'];
const SvRadar = ({ soloKills, mpKills, bestWave, winRate, soloRuns, mpGames, trophiesUnlocked, trophiesTotal }: StatsVisualizerProps) => {
  const values = [
    clamp01((soloKills + mpKills) / 1500),
    clamp01(bestWave / 25),
    clamp01(winRate / 100),
    clamp01((soloRuns + mpGames) / 120),
    clamp01(trophiesTotal ? trophiesUnlocked / trophiesTotal : 0),
  ];
  const N = values.length;
  const C = 110, R = 78;
  const ang = (i: number) => ((-90 + (i * 360) / N) * Math.PI) / 180;
  const coord = (i: number, r: number): [number, number] => [C + r * Math.cos(ang(i)), C + r * Math.sin(ang(i))];
  const poly = (mapR: (i: number) => number) => values.map((_, i) => coord(i, mapR(i)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const overall = Math.round((values.reduce((a, b) => a + b, 0) / N) * 100);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 220 220" className="h-[230px] w-full max-w-[260px] overflow-visible">
        <defs>
          <radialGradient id="svRadarFill" cx="50%" cy="45%" r="65%">
            <stop offset="0" stopColor="rgba(46,232,180,0.45)" /><stop offset="1" stopColor="rgba(46,232,180,0.08)" />
          </radialGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon key={f} points={poly(() => R * f)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        ))}
        {values.map((_, i) => {
          const [x, y] = coord(i, R);
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
        })}
        <polygon
          points={poly((i) => R * Math.max(values[i], 0.02))}
          fill="url(#svRadarFill)"
          stroke="#2ee8b4"
          strokeWidth="2"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 6px rgba(46,232,180,0.5))' }}
        />
        {values.map((v, i) => {
          const [x, y] = coord(i, R * Math.max(v, 0.02));
          return <circle key={i} cx={x} cy={y} r="3" fill="#2ee8b4" stroke="#06281f" strokeWidth="1" />;
        })}
        {RADAR_AXES.map((label, i) => {
          const [x, y] = coord(i, R + 16);
          const c = Math.cos(ang(i));
          const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
          return (
            <text key={label} x={x.toFixed(1)} y={y.toFixed(1)} textAnchor={anchor} dominantBaseline="middle"
              fontSize="8.5" fill="#94a3b8" className="font-hud" style={{ letterSpacing: '0.06em' }}>
              {label.toUpperCase()}
            </text>
          );
        })}
      </svg>
      <p className="font-hud -mt-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">
        Power Index <span className="font-bold text-emerald-300">{overall}</span> · relative profile
      </p>
    </div>
  );
};

const SvEmpty = ({ label, hint }: { label: string; hint: string }) => (
  <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
    <Activity className="h-7 w-7 text-gray-600" strokeWidth={1.8} />
    <p className="text-sm font-semibold text-gray-300">{label}</p>
    <p className="max-w-[16rem] text-[11px] text-gray-500">{hint}</p>
  </div>
);

const HeadlineStat = ({ label, value, accent }: { label: string; value: string; accent?: 'violet' | 'amber' }) => {
  const color =
    accent === 'violet' ? 'border-violet-400/20 bg-violet-500/[0.06] text-violet-200'
    : accent === 'amber' ? 'border-amber-400/20 bg-amber-500/[0.06] text-amber-200'
    : 'border-white/10 bg-white/[0.02] text-white';
  return (
    <div className={`rounded-xl border p-3 text-center ${color}`}>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
      <div className="font-hud text-[9px] font-semibold tracking-[0.12em] uppercase opacity-80">{label}</div>
    </div>
  );
};

function formatPhotoDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

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
