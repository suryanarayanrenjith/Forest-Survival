import { useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  GraduationCap,
  LockKeyhole,
  LogIn,
  Settings,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';
import { useConvexAuth, useAuthActions } from '@convex-dev/auth/react';
import { usePlayerData } from '../hooks/usePlayerData';
import MenuShell from './MenuShell';
import SettingsMenu from './SettingsMenu';
import CreditsMenu from './CreditsMenu';
import AuthMenu from './AuthMenu';
import ProfileMenu from './ProfileMenu';
import UserAvatar from './UserAvatar';
import { computeRank, legacySoloRankXp } from '../utils/rankSystem';

function countBits(value: number): number {
  let count = 0;
  let bits = value >>> 0;
  while (bits) { bits &= bits - 1; count += 1; }
  return count;
}

interface MainMenuProps {
  onClassicMode: () => void;
  onMultiplayerMode: () => void;
  onTutorialMode: () => void;
  t: (key: string) => string;
}

const MainMenu = ({ onClassicMode, onMultiplayerMode, onTutorialMode }: MainMenuProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signUp');
  const [pendingLaunch, setPendingLaunch] = useState<(() => void) | null>(null);
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { currentUser, playerStats } = usePlayerData();
  const previousAuthState = useRef(isAuthenticated);
  const profileLoading = isAuthenticated && currentUser === undefined;
  const displayName = currentUser?.name?.trim() || currentUser?.username?.trim() || 'Player';
  const handle = currentUser?.username ? `@${currentUser.username}` : 'Handle loading...';
  const avatarIndex = playerStats?.avatarIndex ?? 0;
  const menuRank = playerStats
    ? computeRank({
        soloRankXp: playerStats.rankXp ?? legacySoloRankXp(playerStats.solo),
        multiplayer: {
          wins: playerStats.multiplayer.wins,
          gamesPlayed: playerStats.multiplayer.gamesPlayed,
          totalKills: playerStats.multiplayer.totalKills,
        },
        achievementsCount: countBits(playerStats.achievements),
        skillsCount: Object.keys(playerStats.skills).length,
      })
    : null;

  useEffect(() => {
    if (!previousAuthState.current && isAuthenticated) {
      setShowAuth(false);

      if (pendingLaunch) {
        const launchPendingMode = pendingLaunch;
        setPendingLaunch(null);
        launchPendingMode();
      }
    }

    if (previousAuthState.current && !isAuthenticated) {
      setShowProfile(false);
    }

    previousAuthState.current = isAuthenticated;
  }, [isAuthenticated, pendingLaunch]);

  const openAuth = (mode: 'signIn' | 'signUp') => {
    setAuthMode(mode);
    setShowProfile(false);
    setShowAuth(true);
  };

  const openProfile = () => {
    setShowAuth(false);
    setShowProfile(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setShowProfile(false);
    } catch (e) {
      // noop - keep UI stable
      console.error('Sign out failed', e);
    }
  };

  const closeAuth = () => {
    setPendingLaunch(null);
    setShowAuth(false);
  };

  const closeProfile = () => {
    setShowProfile(false);
  };

  // Solo and Tutorial are free to play. Multiplayer needs a signed-in
  // username, so it routes through auth first when the player isn't signed in.
  const launchMode = (startMode: () => void, requiresAuth: boolean) => {
    if (requiresAuth && !isAuthenticated) {
      setPendingLaunch(() => startMode);
      openAuth('signUp');
      return;
    }

    startMode();
  };

  const modes = [
    {
      key: 'solo',
      icon: Swords,
      title: 'Solo',
      desc: 'Survive endless waves alone',
      accent: 'emerald',
      onClick: onClassicMode,
      requiresAuth: false,
    },
    {
      key: 'multiplayer',
      icon: Users,
      title: 'Multiplayer',
      desc: 'Co-op & survival with friends',
      accent: 'sky',
      onClick: onMultiplayerMode,
      requiresAuth: true,
    },
    {
      key: 'tutorial',
      icon: GraduationCap,
      title: 'Tutorial',
      desc: 'Learn the core mechanics',
      accent: 'amber',
      onClick: onTutorialMode,
      requiresAuth: false,
    },
  ] as const;

  const accentRing: Record<string, string> = {
    emerald: 'group-hover:border-emerald-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(16,185,129,0.45)]',
    sky: 'group-hover:border-sky-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(56,189,248,0.45)]',
    amber: 'group-hover:border-amber-400/70 group-hover:shadow-[0_0_24px_-6px_rgba(245,158,11,0.45)]',
  };
  const accentIcon: Record<string, string> = {
    emerald: 'text-emerald-400',
    sky: 'text-sky-400',
    amber: 'text-amber-400',
  };
  const accentIconBg: Record<string, string> = {
    emerald: 'bg-emerald-500/10 group-hover:bg-emerald-500/15',
    sky: 'bg-sky-500/10 group-hover:bg-sky-500/15',
    amber: 'bg-amber-500/10 group-hover:bg-amber-500/15',
  };

  const accessCard = !isAuthenticated
    ? isLoading
      ? {
          accent: 'amber',
          icon: LockKeyhole,
          title: 'Checking session...',
          copy: 'Verifying your session before you launch into the forest.',
        }
      : {
          accent: 'amber',
          icon: LockKeyhole,
          title: 'Playing as guest',
          copy: 'Solo & Tutorial are free. Sign in to unlock Multiplayer, achievements, and the skill tree.',
        }
    : null;

  const { signOut } = useAuthActions();

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <MenuShell variant="main" />

      {/* Cinematic vignette + readability overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black/80" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.7) 100%)' }}
      />

      {/* Main Screen */}
      {!showSettings && (
        <div className="relative z-10 h-dvh overflow-y-auto">
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
          {/* Title */}
          <div className="relative mb-10 sm:mb-14 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="h-px w-8 sm:w-12 bg-gradient-to-r from-transparent to-emerald-500/60" />
              <p className="text-[10px] sm:text-xs tracking-[0.45em] text-emerald-400/90 font-semibold uppercase">
                Wave-Based Survival
              </p>
              <span className="h-px w-8 sm:w-12 bg-gradient-to-l from-transparent to-emerald-500/60" />
            </div>

            <h1
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-none"
              style={{
                background: 'linear-gradient(180deg, #f0fdf4 0%, #86efac 55%, #22c55e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 4px 24px rgba(34,197,94,0.35))',
              }}
            >
              FOREST<br className="sm:hidden" /> SURVIVAL
            </h1>
          </div>

          {accessCard && (
            <div
              className={`mb-6 w-full max-w-md rounded-2xl border px-4 py-4 text-left ${
                accessCard.accent === 'emerald'
                  ? 'border-emerald-400/25 bg-emerald-500/[0.06]'
                  : 'border-amber-400/20 bg-amber-500/[0.06]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex items-center justify-center w-11 h-11 rounded-xl border flex-shrink-0 ${
                    accessCard.accent === 'emerald'
                      ? 'bg-emerald-500/12 border-emerald-400/30'
                      : 'bg-amber-500/12 border-amber-400/25'
                  }`}
                >
                  {(() => {
                    const AccessIcon = accessCard.icon;
                    return (
                      <AccessIcon
                        className={accessCard.accent === 'emerald' ? 'w-5 h-5 text-emerald-300' : 'w-5 h-5 text-amber-300'}
                        strokeWidth={2.2}
                      />
                    );
                  })()}
                </div>
                <div>
                  <p
                    className={`text-[10px] tracking-[0.35em] font-semibold uppercase ${
                      accessCard.accent === 'emerald' ? 'text-emerald-300/90' : 'text-amber-300/90'
                    }`}
                  >
                    {accessCard.accent === 'emerald' ? 'Authenticated' : 'Guest'}
                  </p>
                  <h2 className="text-base font-bold text-white tracking-wide mt-1">{accessCard.title}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-gray-300/80">{accessCard.copy}</p>
                </div>
              </div>
            </div>
          )}

          {isAuthenticated && (
            <div className="mb-6 w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.25)] backdrop-blur-md">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={currentUser?.name}
                  username={currentUser?.username}
                  image={currentUser?.image ?? null}
                  avatarIndex={avatarIndex}
                  size="lg"
                  className="border-emerald-400/20 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] tracking-[0.35em] text-emerald-300/90 font-semibold uppercase">
                    Signed In
                  </p>
                  {profileLoading ? (
                    <div className="mt-2 space-y-2">
                      <div className="h-4 w-32 rounded-full bg-white/10" />
                      <div className="h-3 w-24 rounded-full bg-white/8" />
                    </div>
                  ) : (
                    <>
                      <h2 className="mt-1 truncate text-lg font-bold tracking-wide text-white">
                        {displayName}
                      </h2>
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm text-gray-300">{handle}</p>
                        {menuRank && (
                          <span
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ color: menuRank.color, background: `${menuRank.color}1a`, border: `1px solid ${menuRank.color}44` }}
                          >
                            <Trophy className="w-2.5 h-2.5" strokeWidth={2.5} /> {menuRank.tierName} · Lvl {menuRank.level}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                  {!profileLoading && currentUser?.lastLoginAt ? (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Last active {new Date(currentUser.lastLoginAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    onClick={isAuthenticated ? openProfile : () => openAuth('signIn')}
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] px-3.5 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/[0.1] hover:text-white"
                  >
                    Profile
                  </button>
                  {isAuthenticated && (
                    <button
                      onClick={handleSignOut}
                      className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.06]"
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mode Buttons */}
          <div className="flex flex-col gap-3 w-full max-w-md">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.key}
                  onClick={() => launchMode(mode.onClick, mode.requiresAuth)}
                  className="group relative flex items-center gap-4 w-full rounded-2xl px-4 py-4 text-left
                    bg-white/[0.03] border border-white/10 backdrop-blur-md
                    transition-all duration-300 hover:bg-white/[0.06] hover:-translate-y-0.5
                    active:translate-y-0"
                >
                  {/* accent ring on hover */}
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-2xl border border-transparent transition-all duration-300 ${accentRing[mode.accent]}`}
                  />
                  <span
                    className={`flex items-center justify-center w-12 h-12 rounded-xl transition-colors duration-300 ${accentIconBg[mode.accent]}`}
                  >
                    <Icon className={`w-6 h-6 ${accentIcon[mode.accent]}`} strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-lg sm:text-xl font-bold text-white tracking-wide">
                      {mode.title}
                    </span>
                    <span className="block text-xs sm:text-sm text-gray-400 font-medium truncate">
                      {mode.desc}
                    </span>
                  </span>
                  <ChevronRight
                    className="w-5 h-5 text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all duration-300"
                    strokeWidth={2}
                  />
                </button>
              );
            })}

            {/* Settings + Credits */}
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              <button
                onClick={() => setShowSettings(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-white hover:bg-white/[0.06] hover:border-white/20"
              >
                <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" strokeWidth={2} />
                Settings
              </button>
              <button
                onClick={() => setShowCredits(true)}
                className="group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5
                  text-sm font-semibold text-gray-400 border border-white/10 bg-white/[0.02]
                  transition-all duration-300 hover:text-emerald-300 hover:bg-emerald-500/[0.06] hover:border-emerald-400/30"
              >
                <Sparkles
                  className="w-4 h-4 transition-transform duration-500 group-hover:scale-110"
                  strokeWidth={2}
                  fill="currentColor"
                />
                Credits
              </button>
              <button
                onClick={isAuthenticated ? openProfile : () => openAuth('signIn')}
                className={`group flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold border transition-all duration-300 ${
                  isAuthenticated
                    ? 'text-emerald-300 border-emerald-400/25 bg-emerald-500/[0.05] hover:text-white hover:bg-emerald-500/[0.1] hover:border-emerald-300/40'
                    : 'text-sky-300 border-sky-400/25 bg-sky-500/[0.05] hover:text-white hover:bg-sky-500/[0.1] hover:border-sky-300/40'
                }`}
              >
                {isAuthenticated ? (
                  <UserRound className="w-4 h-4 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                ) : (
                  <LogIn className="w-4 h-4 transition-transform duration-500 group-hover:scale-110" strokeWidth={2} />
                )}
                {isAuthenticated ? 'Account' : 'Login / Register'}
              </button>
            </div>
          </div>

          {/* Version + author tagline */}
          <div className="mt-10 flex flex-col items-center gap-1.5">
            <p className="text-[10px] tracking-[0.3em] text-gray-600 uppercase">
              Version 1.0
            </p>
            <button
              onClick={() => setShowCredits(true)}
              className="text-[11px] text-gray-500 hover:text-emerald-300 transition-colors"
            >
              vibe-coded by <span className="font-semibold">Surya</span>
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Settings Menu */}
      {showSettings && <SettingsMenu onClose={() => setShowSettings(false)} />}

      {/* Credits Menu */}
      {showCredits && <CreditsMenu onClose={() => setShowCredits(false)} />}

      {/* Authentication Menu */}
      {showAuth && <AuthMenu onClose={closeAuth} onSignedIn={() => setShowAuth(false)} initialMode={authMode} />}

      {/* Profile Menu */}
      {showProfile && <ProfileMenu onClose={closeProfile} />}
    </div>
  );
};

export default MainMenu;
